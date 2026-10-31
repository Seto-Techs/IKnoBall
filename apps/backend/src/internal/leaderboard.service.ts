import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { account, discordLinks, discordMembers, predictionPicks, user } from '@iknoball/database';
import type { PredictionMode } from '@iknoball/predictions';
import { DatabaseService } from '../infrastructure/database/database.service';
import type { LeaderboardRow } from '../predictions.service';

/** Rows the board shows before the caller's own row is appended. */
export const GUILD_LEADERBOARD_SIZE = 10;

export interface GuildLeaderboardQuery {
  /** Discord guild id. Membership in this guild is the board's filter. */
  guildId: string;
  mode: PredictionMode;
  /**
   * The caller's Discord user id, when it has one. Resolved to an IKnoBall user
   * through `account` or `discord_links`, then to a row at its true rank when the
   * caller is outside the cut. A Discord account with no IKnoBall user simply gets
   * no extra row.
   */
  viewerDiscordUserId?: string;
}

/**
 * The per-server board, as chunk C8 builds it.
 *
 * It lives here rather than in `PredictionsService` for one reason: definition B
 * filters by *membership*, so the query joins `discord_members`, and the shared
 * service is the web board's too. Keeping the guild-scoped query in its own
 * provider means the web board's SQL is untouched by a Discord-only definition.
 *
 * Definition B, in one sentence: rank every settled pick made by a user who is a
 * member of this guild *right now*, wherever that pick was placed. The chain is
 * `prediction_picks.userId` → a Discord identity → `discord_members(guildId)`, and
 * `prediction_picks.guildId` is deliberately absent from it — it records where a
 * pick came from, not who is in the server. A pick made on the website therefore
 * counts, which is the whole point of the decision.
 *
 * A Discord identity lives in one of two tables: `discord_links`, which only the
 * `/link` flow writes, and Better Auth's `account`, which signing in with Discord
 * writes. Joining `discord_links` alone hid every user who signed in with Discord
 * and never ran `/link` — the case `DiscordLinkService.resolve` calls the normal
 * one. Both are read here, for the same reason `resolve` reads both.
 */
@Injectable()
export class InternalLeaderboardService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Top rows for one guild, plus the viewer's row when the cut hides it.
   *
   * The aggregate is built once as a subquery and read three ways: the top rows,
   * the viewer's own row, and how many rows beat it. That is the same
   * viewer-below-the-cut pattern `PredictionsService.leaderboard` uses, with the
   * membership join added.
   */
  async board(query: GuildLeaderboardQuery): Promise<LeaderboardRow[]> {
    const totals = this.guildTotals(query.guildId, query.mode);

    const rows = await this.database.db
      .select({
        userId: totals.userId,
        name: totals.name,
        points: totals.points,
        picks: totals.picks,
        correct: totals.correct,
      })
      .from(totals)
      .orderBy(desc(totals.points))
      .limit(GUILD_LEADERBOARD_SIZE);

    const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }));
    if (!query.viewerDiscordUserId) return ranked;

    const viewerId = await this.userIdFor(query.viewerDiscordUserId);
    if (!viewerId || ranked.some((row) => row.userId === viewerId)) return ranked;

    const mine = await this.viewerRank(totals, viewerId);
    return mine ? [...ranked, mine] : ranked;
  }

  /**
   * One mode's totals for the current members of one guild, as a subquery.
   *
   * Settled rows only, so a voided pick neither helps nor hurts — the same rule
   * the web board applies. The name is `user.name` and falls back to the mirrored
   * Discord display name only when that is blank: the column is `NOT NULL`, but a
   * user who never set a name stores an empty string, and "Unknown player" is a
   * worse answer than the name the server already sees.
   *
   * `groupBy` includes the display name because the fallback reads it;
   * `guildMembers` has already collapsed each user to one row, so it cannot split
   * one person in two.
   */
  private guildTotals(guildId: string, mode: PredictionMode) {
    const members = this.guildMembers(guildId);

    return this.database.db
      .select({
        userId: predictionPicks.userId,
        name: sql<string>`coalesce(nullif(btrim(${user.name}), ''), ${members.displayName}, 'Unknown player')`.as(
          'name',
        ),
        // Aliased because the outer queries read these back off the subquery.
        points: sql<number>`coalesce(sum(${predictionPicks.points}), 0)::int`.as('points'),
        picks: sql<number>`count(*)::int`.as('picks'),
        correct: sql<number>`count(*) filter (where ${predictionPicks.points} > 0)::int`.as(
          'correct',
        ),
      })
      .from(predictionPicks)
      .innerJoin(user, eq(user.id, predictionPicks.userId))
      .innerJoin(members, eq(members.userId, predictionPicks.userId))
      .where(and(eq(predictionPicks.mode, mode), eq(predictionPicks.status, 'settled')))
      .groupBy(predictionPicks.userId, user.name, members.displayName)
      .as('totals');
  }

  /**
   * The users who are in one guild right now, one row each, with a name to fall
   * back on. The cut from Discord identity to IKnoBall user that every board query
   * joins.
   *
   * The identity set is a `union`, so a user who both signed in with Discord and
   * ran `/link` contributes the same `(userId, discordUserId)` pair once and two
   * different pairs as two. The `group by` is what keeps that from fanning out:
   * without it, a user with two Discord accounts in the same server would have
   * every pick counted twice, and the board would quietly inflate their points.
   * The mirrored display name is one of theirs, which is all the fallback needs.
   */
  private guildMembers(guildId: string) {
    const identities = this.database.db
      .select({ userId: discordLinks.userId, discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .union(
        this.database.db
          .select({ userId: account.userId, discordUserId: account.accountId })
          .from(account)
          .where(eq(account.providerId, 'discord')),
      )
      .as('discord_identities');

    return this.database.db
      .select({
        userId: identities.userId,
        displayName: sql<string | null>`min(${discordMembers.displayName})`.as('displayName'),
      })
      .from(identities)
      .innerJoin(
        discordMembers,
        and(
          eq(discordMembers.discordUserId, identities.discordUserId),
          eq(discordMembers.guildId, guildId),
        ),
      )
      .groupBy(identities.userId)
      .as('guild_members');
  }

  /**
   * One viewer's row at its true rank, so a viewer below the board's cut still
   * has something to show. The rank is one more than the users ahead of them,
   * matching the tie-free ordering the board itself uses.
   */
  private async viewerRank(
    totals: ReturnType<InternalLeaderboardService['guildTotals']>,
    viewerId: string,
  ): Promise<LeaderboardRow | null> {
    const [mine] = await this.database.db
      .select({
        userId: totals.userId,
        name: totals.name,
        points: totals.points,
        picks: totals.picks,
        correct: totals.correct,
      })
      .from(totals)
      .where(eq(totals.userId, viewerId));

    if (!mine) return null;

    const [{ ahead }] = await this.database.db
      .select({ ahead: sql<number>`count(*)::int` })
      .from(totals)
      .where(gt(totals.points, mine.points));

    return { rank: ahead + 1, ...mine };
  }

  /**
   * The IKnoBall user behind a Discord account, or null when it has none.
   *
   * Read in the same order `DiscordLinkService.resolve` reads them, and from both
   * tables for the same reason `guildMembers` joins both: a Discord sign-in has no
   * `discord_links` row, so checking only the link table would deny that user their
   * own row while the board above them ranked them.
   */
  private async userIdFor(discordUserId: string): Promise<string | null> {
    const [signIn] = await this.database.db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordUserId)))
      .orderBy(account.createdAt)
      .limit(1);

    if (signIn) return signIn.userId;

    const [link] = await this.database.db
      .select({ userId: discordLinks.userId })
      .from(discordLinks)
      .where(eq(discordLinks.discordUserId, discordUserId))
      .limit(1);

    return link?.userId ?? null;
  }
}

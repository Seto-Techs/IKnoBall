/**
 * The database half of the daily board (0.5.1).
 *
 * Four questions, and nothing else: how the recent league days stand, how many picks
 * settled on one of them for one guild, how that guild's Lebronnect players did on
 * one puzzle day, and which players two chain pairs point at. `board.ts` decides with
 * the answers; `BoardScheduler` asks every minute.
 *
 * Two queries per tick for the days, plus one per guild that is due — and, for a
 * guild whose board carries a recap card, three more: the day's results, the two
 * puzzle pairs, and the players behind them.
 *
 * The slate-day expression lives in `schedule-days.ts`, because `DrizzleSlateStore`
 * asks the same question and the two answers must not drift.
 *
 * **`@Injectable()` is load-bearing.** Nest builds a provider from the class's
 * `design:paramtypes`, and TypeScript only emits that metadata for a decorated class.
 * Without the decorator the constructor is called with no arguments, `infra` is
 * `undefined`, and the failure surfaces only when a query runs — this class shipped
 * without it (as `RolloverRepository`) and every tick died on `this.infra.db` for the
 * life of the feature. `scheduler.module.spec.ts` guards the whole module against it.
 */
import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import {
  account,
  discordLinks,
  discordMembers,
  miniGamePuzzles,
  miniGameResults,
  players,
  predictionPicks,
  scheduleBoxscoreSummaries,
  scheduleGames,
  user,
  type Database,
} from '@iknoball/database';
import { STATUS_FINAL } from '../lock/card-edit';
import type { DayState } from './board';
import { Infrastructure } from './infrastructure';
import { slateDaySql } from './schedule-days';
import { etDateKey, shiftDateKey } from './slate-date';

/** How far back the per-day query looks; a board older than this is not worth posting. */
const DAY_WINDOW_DAYS = 7;

/** The one mini game on the shelf. Named here so the two queries cannot disagree. */
const LEBRONNECT = 'lebronnect';

/** One guild member's result on one puzzle day, with what the card draws. */
export interface RecapEntry {
  userId: string;
  name: string;
  /**
   * The Discord id to mention the row by, so the text half of the recap names people
   * the way the board above it does. Taken from the membership join the query already
   * makes; the card itself draws names, not mentions.
   */
  discordUserId: string;
  /** The Better Auth avatar, which for a Discord sign-in is the Discord CDN URL. */
  avatarUrl: string | null;
  players: number;
  par: number;
  /** The grade frozen on the row: 5 at par, one fewer per hop over. */
  blocks: number;
  submittedAt: Date;
}

/** One end of a chain: the graph's id for a player, and the name to draw. */
export interface RecapPlayerRef {
  externalId: string;
  name: string;
}

/** Everything the recap card needs for one guild and one puzzle day. */
export interface LebronnectRecapDay {
  puzzleDate: string;
  /**
   * Intermediaries on the shortest route, or null on a day nobody played.
   *
   * `par` is frozen on a result row and the API never reveals it before a solve, so a
   * day with no results has no par to print. Null says "do not print one" rather than
   * inventing a number.
   */
  par: number | null;
  /** How many guild members played, which is usually more than the rows returned. */
  played: number;
  rows: RecapEntry[];
  /** The pair the rows are results for. */
  chain: { from: RecapPlayerRef; to: RecapPlayerRef };
  /**
   * The pair today's puzzle is about, or null when today's puzzle has not been published.
   *
   * **The board posts at midnight ET, and the puzzle row for the new day is written on
   * the first request for it** — so at 00:43 nobody has opened the app and the row does
   * not exist yet. Requiring it here dropped the card on exactly the night it was
   * scheduled for; the footer's ask is worth less than the day's results.
   */
  today: { from: RecapPlayerRef; to: RecapPlayerRef } | null;
}

@Injectable()
export class BoardRepository {
  constructor(private readonly infra: Infrastructure) {}

  /**
   * Resolved on use, not on construction: `DatabaseService` is a provider of the root
   * module, which exports nothing, so this goes through `Infrastructure` the way every
   * other data-backed provider here does — including `DrizzleSlateStore`.
   */
  private get db(): Database {
    return this.infra.db;
  }

  /**
   * Every league day from a week ago onwards, so the caller can pick the last finished
   * one.
   *
   * Bounded backwards on purpose: the board is for the most recent night, and a day
   * that fell out of the window is a board nobody is waiting for. There is no upper
   * bound — the days ahead are in the answer and `latestFinishedDay` ignores them,
   * which is cheaper than a second query that has to agree with this one about what
   * "today" means.
   *
   * `lastFinalAt` comes from a second query over the box score summaries, joined back
   * by slate day. `schedule_games` has no "finished at" column — its `updatedAt` is
   * when the crawler last touched the row, which lags the buzzer by up to half an hour
   * — so the buzzer is estimated as tip-off plus the summary's `duration`. The cast is
   * guarded: `duration` is text, and a non-numeric one must not fail the whole tick.
   */
  async daysSince(now: Date = new Date()): Promise<DayState[]> {
    const from = shiftDateKey(etDateKey(now), -DAY_WINDOW_DAYS);

    const [days, finals] = await Promise.all([
      this.db
        .select({
          slateKey: slateDaySql,
          games: count(),
          finals: sql<number>`count(*) filter (where ${scheduleGames.gameStatus} = ${STATUS_FINAL})`,
          lastTipOff: sql<Date | string | null>`max(${scheduleGames.gameDateTimeUTC})`,
        })
        .from(scheduleGames)
        .where(sql`${slateDaySql} >= ${from}`)
        .groupBy(slateDaySql),
      this.db
        .select({
          slateKey: slateDaySql,
          lastFinalAt: sql<Date | string | null>`max(
            case
              when ${scheduleBoxscoreSummaries.gameStatus} = ${STATUS_FINAL}
                and ${scheduleBoxscoreSummaries.duration} ~ '^[0-9]+$'
                and ${scheduleBoxscoreSummaries.gameTimeUTC} is not null
              then ${scheduleBoxscoreSummaries.gameTimeUTC}
                + ${scheduleBoxscoreSummaries.duration}::int * interval '1 minute'
            end
          )`,
        })
        .from(scheduleGames)
        .innerJoin(
          scheduleBoxscoreSummaries,
          eq(scheduleBoxscoreSummaries.scheduleGameId, scheduleGames.id),
        )
        .where(sql`${slateDaySql} >= ${from}`)
        .groupBy(slateDaySql),
    ]);

    const buzzer = new Map(
      finals.map((row) => [
        row.slateKey,
        row.lastFinalAt === null ? null : new Date(row.lastFinalAt),
      ]),
    );

    return days.map((row) => ({
      slateKey: row.slateKey,
      games: Number(row.games),
      finals: Number(row.finals),
      // `pg` hands a `timestamp` back as a `Date`, but the column carries no zone, so
      // it is normalised here rather than trusted.
      lastTipOff: row.lastTipOff === null ? null : new Date(row.lastTipOff),
      lastFinalAt: buzzer.get(row.slateKey) ?? null,
    }));
  }

  /**
   * How many picks settled for a guild on one slate day.
   *
   * The board's gate: a day nobody picked is a day with nothing to show. Counted off
   * `prediction_picks` rather than any posted message, because the board ranks picks,
   * and a settled pick is what a row on it represents.
   *
   * **Membership, not provenance.** The board this gates is the one
   * `InternalLeaderboardService` renders, which ranks every settled pick by a user who
   * is in the guild *right now* — including picks made on the website or in the
   * Activity. So the count has to describe that same population, and it joins the same
   * Discord-identity bridge the board does.
   *
   * Why the join rather than a filter on `prediction_picks.guildId`: the column reads
   * like provenance, but nothing writes it — the bot's pick path sends `userId`,
   * `gameId`, and `side` and no guild, so filtering on it counted zero for every day
   * and skipped the post silently. That was fixed in af464bf (2026-11-05) and this is
   * the same query, moved here unchanged from `RolloverRepository`. The note stays
   * because the join is the part that looks removable, and removing it is exactly how
   * the board went silent the first time.
   */
  async settledPickCount(guildId: string, slateKey: string): Promise<number> {
    // `prediction_picks.gameId` is the feed's id, so the join is on
    // `scheduleGames.gameId`. On `id` this counts zero for every day.
    const members = this.guildMembers(guildId);

    const [row] = await this.db
      .select({ settled: count() })
      .from(predictionPicks)
      .innerJoin(scheduleGames, eq(scheduleGames.gameId, predictionPicks.gameId))
      .innerJoin(members, eq(members.userId, predictionPicks.userId))
      .where(and(eq(predictionPicks.status, 'settled'), sql`${slateDaySql} = ${slateKey}`));

    return Number(row?.settled ?? 0);
  }

  /**
   * One guild's Lebronnect day, as the recap card draws it.
   *
   * **Scoped to the guild's members**, not to everyone who played: the board it sits
   * under ranks this server, so a top five drawn from the whole league would name
   * strangers. The membership cut is `guildMembers`, the same one the board's own
   * ranking uses — a member who played on the website or in the Activity counts.
   *
   * Ordered by distance from par, then by submission time, which is the order the
   * card claims: closest to the shortest route wins, and an identical score is broken
   * by who got there first. `limit` bounds the rows drawn while `played` still counts
   * everyone, because "7 played" over five rows is the point of a top five.
   *
   * Answers null rather than throwing when the day cannot be drawn at all — no puzzle
   * row for the day itself, or a player the chain names is missing from the graph. The
   * card is an addition to the board post and must not be able to cost it.
   *
   * Two absences are **not** reasons to answer null, because both are normal on a
   * midnight post: nobody in the guild played, and the next day's puzzle has not been
   * published yet (that row is written on the first request for it). The first draws an
   * empty board, the second drops the footer.
   */
  async lebronnectRecap(
    guildId: string,
    puzzleDate: string,
    todayDate: string,
    limit: number,
  ): Promise<LebronnectRecapDay | null> {
    // A board posted late enough that its day *is* today would show the same chain
    // twice, once as history and once as the ask. Nothing to recap yet.
    if (puzzleDate === todayDate) return null;

    const members = this.guildMembers(guildId);

    const rows = await this.db
      .select({
        userId: miniGameResults.userId,
        name: sql<string>`coalesce(nullif(btrim(${user.name}), ''), ${members.displayName}, 'Unknown player')`,
        discordUserId: members.discordUserId,
        avatarUrl: user.image,
        players: miniGameResults.players,
        par: miniGameResults.par,
        blocks: miniGameResults.blocks,
        submittedAt: miniGameResults.createdAt,
        startPlayerId: miniGameResults.startPlayerId,
        targetPlayerId: miniGameResults.targetPlayerId,
        played: sql<number>`count(*) over ()`,
      })
      .from(miniGameResults)
      .innerJoin(members, eq(members.userId, miniGameResults.userId))
      .leftJoin(user, eq(user.id, miniGameResults.userId))
      .where(and(eq(miniGameResults.game, LEBRONNECT), eq(miniGameResults.puzzleDate, puzzleDate)))
      .orderBy(
        asc(sql`${miniGameResults.players} - ${miniGameResults.par}`),
        asc(miniGameResults.createdAt),
      )
      .limit(limit);

    if (rows.length === 0) {
      // Nobody in this guild played, but the board still goes out and the day still has
      // a chain. Drawing it with an empty row list is the difference between "nobody
      // played" and a broken bot — and the card's whole job on that day is the footer's
      // ask to play the next one.
      return this.emptyRecap(puzzleDate, todayDate);
    }

    const [yesterday, today] = await Promise.all([
      this.puzzlePair(puzzleDate),
      this.puzzlePair(todayDate),
    ]);

    // Results carry the pair they were played on, which is the fallback for a day
    // whose puzzle row predates `puzzleId` — the column is nullable for exactly that.
    const chain = yesterday ?? {
      startPlayerId: rows[0].startPlayerId,
      targetPlayerId: rows[0].targetPlayerId,
    };

    const { from, to } = await this.pairRefs(chain);
    if (!from || !to) return null;

    // Today's pair is the footer's ask, not the recap. At midnight ET the new day's
    // puzzle row has not been published yet (it is written on the first request for
    // it), so a missing one drops the footer and keeps the day's results.
    const next = today ? await this.pairRefs(today) : null;
    const nextPair = next && next.from && next.to ? { from: next.from, to: next.to } : null;

    return {
      puzzleDate,
      par: rows[0].par,
      played: Number(rows[0].played),
      rows: rows.map((row) => ({
        userId: row.userId,
        name: row.name,
        discordUserId: row.discordUserId,
        avatarUrl: row.avatarUrl,
        players: row.players,
        par: row.par,
        blocks: row.blocks,
        submittedAt: row.submittedAt,
      })),
      chain: { from, to },
      today: nextPair,
    };
  }

  /**
   * A day nobody in the guild played, drawn as an empty board.
   *
   * The rows are empty on purpose: the card's header says how many played (zero), the
   * body has no rows, and the footer still sells today's chain. That is a truthful
   * recap and, more to the point, it is not silence.
   *
   * `par` is null — see `LebronnectRecapDay.par`. Today's pair is required, as it is
   * for a played day: without it the footer has nothing to point at, and a card whose
   * only job is the ask has no job at all.
   */
  private async emptyRecap(
    puzzleDate: string,
    todayDate: string,
  ): Promise<LebronnectRecapDay | null> {
    const [yesterday, today] = await Promise.all([
      this.puzzlePair(puzzleDate),
      this.puzzlePair(todayDate),
    ]);
    // Without the day's own chain there is no recap to draw: the header alone is not a
    // card. Today's pair is optional for the same reason it is on a played day.
    if (!yesterday) return null;

    const chain = await this.pairRefs(yesterday);
    if (!chain.from || !chain.to) return null;

    const next = today ? await this.pairRefs(today) : null;
    const nextPair = next && next.from && next.to ? { from: next.from, to: next.to } : null;

    return {
      puzzleDate,
      par: null,
      played: 0,
      rows: [],
      chain: { from: chain.from, to: chain.to },
      today: nextPair,
    };
  }

  /** Both ends of one chain, each null when the player row is not there. */
  private async pairRefs(pair: {
    startPlayerId: string;
    targetPlayerId: string;
  }): Promise<{ from: RecapPlayerRef | null; to: RecapPlayerRef | null }> {
    const refs = await this.playerRefs([pair.startPlayerId, pair.targetPlayerId]);
    return {
      from: refs.get(pair.startPlayerId) ?? null,
      to: refs.get(pair.targetPlayerId) ?? null,
    };
  }

  /** The pair one puzzle day was drawn on, or null when no puzzle was published. */
  private async puzzlePair(
    puzzleDate: string,
  ): Promise<{ startPlayerId: string; targetPlayerId: string } | null> {
    const [row] = await this.db
      .select({
        startPlayerId: miniGamePuzzles.startPlayerId,
        targetPlayerId: miniGamePuzzles.targetPlayerId,
      })
      .from(miniGamePuzzles)
      .where(and(eq(miniGamePuzzles.game, LEBRONNECT), eq(miniGamePuzzles.puzzleDate, puzzleDate)));

    return row ?? null;
  }

  /**
   * Names and headshot ids for a handful of players, keyed by `players.id`.
   *
   * **Keyed by the row id, not the NBA id.** A puzzle's `startPlayerId` and a result's
   * pair are foreign keys to `players.id` (a UUID); `players.externalId` is the NBA
   * person id (`1642276`). They are easy to confuse — this method looked players up by
   * `externalId` at first, which matched nothing, and every card came back null.
   * `externalId` is still what the headshot URL needs, so it travels out on the ref.
   */
  private async playerRefs(playerIds: string[]): Promise<Map<string, RecapPlayerRef>> {
    const unique = [...new Set(playerIds)];
    if (unique.length === 0) return new Map();

    const rows = await this.db
      .select({
        id: players.id,
        externalId: players.externalId,
        displayName: players.displayName,
        firstName: players.firstName,
        lastName: players.lastName,
      })
      .from(players)
      .where(inArray(players.id, unique));

    return new Map(
      rows.map((row) => [
        row.id,
        // `displayName` is the name the graph and the site use ("Nikola Jokić"), and
        // it is nullable because the feed does not always carry one.
        {
          externalId: row.externalId,
          name: row.displayName?.trim() || `${row.firstName} ${row.lastName}`,
        },
      ]),
    );
  }

  /**
   * The users who are in one guild right now, one row each.
   *
   * The same cut `InternalLeaderboardService.guildMembers` makes, and for the same
   * reasons: a Discord identity lives in `discord_links` only after `/link`, and in
   * Better Auth's `account` only after signing in with Discord, so a query that read
   * one table hid the other's users. The `group by` stops a user with two Discord
   * accounts in the same server from being counted twice.
   *
   * Duplicated from the API on purpose: the two live in different apps, the bot must
   * not depend on the API's internals, and the definition it encodes is the one the
   * board's own doc comment calls definition B. If that definition ever changes, both
   * copies change — the same bargain `schedule-days.ts` documents for the slate day.
   */
  private guildMembers(guildId: string) {
    const identities = this.db
      .select({ userId: discordLinks.userId, discordUserId: discordLinks.discordUserId })
      .from(discordLinks)
      .union(
        this.db
          .select({ userId: account.userId, discordUserId: account.accountId })
          .from(account)
          .where(eq(account.providerId, 'discord')),
      )
      .as('discord_identities');

    return this.db
      .select({
        userId: identities.userId,
        // The name to fall back on when the Better Auth name is blank. `min` only
        // because the `group by` needs an aggregate; a user with two Discord
        // accounts in one server has two display names and either will do.
        displayName: sql<string | null>`min(${discordMembers.displayName})`.as('displayName'),
        // The id to mention the row by, aggregated for the same reason: one is enough
        // to reach the user, and two would fan the row out and double their picks.
        discordUserId: sql<string>`min(${identities.discordUserId})`.as('discordUserId'),
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
}

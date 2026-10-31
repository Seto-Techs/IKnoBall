import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { discordCards, scheduleDays, scheduleGames, teams } from '@iknoball/database';
import { TeamStats } from '../cards/team-stats';
import type { CardStake, CardTeam } from '../cards/types';
import { Infrastructure } from './infrastructure';
import type { SlateGame } from './slate';
import { shiftDateKey } from './slate-date';

/**
 * The schedule's tricode to the `teams` table's, for the one team whose two codes
 * disagree: a schedule row for Brooklyn says BKN, its `teams` row says BRK. The
 * backend maps the same pair in the same direction.
 */
const TEAM_ABBREVIATION: Readonly<Record<string, string>> = { BKN: 'BRK' };

/** DI token: the interface below has no runtime value to inject by. */
export const SLATE_STORE = 'SLATE_STORE';

/** The `teams` abbreviation for a schedule tricode. */
function abbreviationOf(tricode: string): string {
  const upper = tricode.trim().toUpperCase();
  return TEAM_ABBREVIATION[upper] ?? upper;
}

/**
 * The placeholder `discord_cards.messageId` a claim row carries until the message
 * it belongs to exists.
 *
 * The column is `not null` and the row has to be written *before* the send, so
 * there is a window where the id is unknown. `'pending'` is not a snowflake, which
 * is the point: anything that finds a row still holding it knows the send never
 * completed and can treat the card as dead instead of trying to edit it.
 */
export const PENDING_MESSAGE_ID = 'pending';

/** One card to claim for a guild, before anything is sent. */
export interface CardClaim {
  gameId: string;
  guildId: string;
  channelId: string;
}

/** The ids that only exist once the message does. */
export interface CardAttachment {
  gameId: string;
  guildId: string;
  channelId: string;
  messageId: string;
}

/**
 * Everything a slate post reads or writes in Postgres.
 *
 * An interface so the poster can be tested against fakes, and so the SQL stays in
 * one file that a live database can be pointed at.
 */
export interface SlateStore {
  /** Games whose ET date is within a day of `etKey`, earliest tip-off first. */
  findGames(etKey: string): Promise<SlateGame[]>;
  /**
   * The `teams` rows for these schedule tricodes, with their season record and
   * last-five form for `season`.
   */
  findTeams(tricodes: readonly string[], season: string | null): Promise<CardTeam[]>;
  /** What each side pays if picked right, for the games that have a stored price. */
  findStakes(gameIds: readonly string[]): Promise<Map<string, CardStake>>;
  /** Insert the card rows that do not exist yet; returns the game ids claimed. */
  claimCards(claims: readonly CardClaim[]): Promise<string[]>;
  attachCards(attachments: readonly CardAttachment[]): Promise<void>;
}

@Injectable()
export class DrizzleSlateStore implements SlateStore {
  private stats?: TeamStats;

  constructor(private readonly infra: Infrastructure) {}

  /** The record and stake reads, over the same pool as everything else here. */
  private get teamStats(): TeamStats {
    this.stats ??= new TeamStats(this.infra.db);
    return this.stats;
  }

  async findGames(etKey: string): Promise<SlateGame[]> {
    // A one-day window around the slate day, not an equality: `slateDateKey`
    // decides which day a game belongs to, and a row whose `gameDate` is missing
    // or off by a day still lands correctly through its tip-off.
    const rows = await this.infra.db
      .select({
        gameId: scheduleGames.gameId,
        gameStatus: scheduleGames.gameStatus,
        gameDate: scheduleGames.gameDate,
        gameDateTimeUTC: scheduleGames.gameDateTimeUTC,
        awayTeamTricode: scheduleGames.awayTeamTricode,
        awayTeamCity: scheduleGames.awayTeamCity,
        awayTeamName: scheduleGames.awayTeamName,
        homeTeamTricode: scheduleGames.homeTeamTricode,
        homeTeamCity: scheduleGames.homeTeamCity,
        homeTeamName: scheduleGames.homeTeamName,
        seriesText: scheduleGames.seriesText,
        // The card's record is the season this game belongs to; left-joined so a
        // row with no day still yields a card (it just has no record).
        seasonYear: scheduleDays.seasonYear,
      })
      .from(scheduleGames)
      .leftJoin(scheduleDays, eq(scheduleDays.id, scheduleGames.scheduleDayId))
      .where(
        and(
          gte(scheduleGames.gameDate, shiftDateKey(etKey, -1)),
          lte(scheduleGames.gameDate, shiftDateKey(etKey, 1)),
        ),
      )
      .orderBy(scheduleGames.gameDateTimeUTC);

    return rows;
  }

  async findTeams(tricodes: readonly string[], season: string | null): Promise<CardTeam[]> {
    const wanted = [...new Set(tricodes.filter((tricode) => tricode.length > 0))];
    if (wanted.length === 0) return [];

    // Looked up by the `teams` abbreviation, returned under the schedule tricode:
    // the card prints, emojis, and looks the record up by the latter.
    const byAbbreviation = new Map(wanted.map((tricode) => [abbreviationOf(tricode), tricode]));

    const rows = await this.infra.db
      .select({
        abbreviation: teams.abbreviation,
        fullName: teams.fullName,
        logoUrl: teams.logoUrl,
      })
      .from(teams)
      .where(inArray(teams.abbreviation, [...byAbbreviation.keys()]));

    const form = await this.teamStats.seasonForm(wanted, season);

    return rows.map((row) => {
      const tricode = byAbbreviation.get(row.abbreviation) ?? row.abbreviation;
      return {
        tricode,
        name: row.fullName,
        logoUrl: row.logoUrl,
        record: form.get(tricode) ?? null,
      };
    });
  }

  async findStakes(gameIds: readonly string[]): Promise<Map<string, CardStake>> {
    return this.teamStats.stakes(gameIds);
  }

  async claimCards(claims: readonly CardClaim[]): Promise<string[]> {
    if (claims.length === 0) return [];

    // `on conflict do nothing` is the durable half of the double-post guard: a
    // card row that already exists means that game was already posted for this
    // guild, so the row is not returned and the poster does not send it again.
    // A crash between the insert and the send leaves a `'pending'` row, which
    // costs one game's card rather than a duplicate message.
    const inserted = await this.infra.db
      .insert(discordCards)
      .values(
        claims.map((claim) => ({
          gameId: claim.gameId,
          guildId: claim.guildId,
          channelId: claim.channelId,
          messageId: PENDING_MESSAGE_ID,
        })),
      )
      .onConflictDoNothing({ target: [discordCards.gameId, discordCards.guildId] })
      .returning({ gameId: discordCards.gameId });

    return inserted.map((row) => row.gameId);
  }

  async attachCards(attachments: readonly CardAttachment[]): Promise<void> {
    for (const attachment of attachments) {
      await this.infra.db
        .update(discordCards)
        .set({
          channelId: attachment.channelId,
          messageId: attachment.messageId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(discordCards.gameId, attachment.gameId),
            eq(discordCards.guildId, attachment.guildId),
          ),
        );
    }
  }
}

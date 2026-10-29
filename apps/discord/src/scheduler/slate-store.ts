import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { discordCards, scheduleGames, teams } from '@iknoball/database';
import type { CardTeam } from '../cards/types';
import { Infrastructure } from './infrastructure';
import type { SlateGame } from './slate';
import { shiftDateKey } from './slate-date';

/** DI token: the interface below has no runtime value to inject by. */
export const SLATE_STORE = 'SLATE_STORE';

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
  findTeams(tricodes: readonly string[]): Promise<CardTeam[]>;
  /** Insert the card rows that do not exist yet; returns the game ids claimed. */
  claimCards(claims: readonly CardClaim[]): Promise<string[]>;
  attachCards(attachments: readonly CardAttachment[]): Promise<void>;
}

@Injectable()
export class DrizzleSlateStore implements SlateStore {
  constructor(private readonly infra: Infrastructure) {}

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
      })
      .from(scheduleGames)
      .where(
        and(
          gte(scheduleGames.gameDate, shiftDateKey(etKey, -1)),
          lte(scheduleGames.gameDate, shiftDateKey(etKey, 1)),
        ),
      )
      .orderBy(scheduleGames.gameDateTimeUTC);

    return rows;
  }

  async findTeams(tricodes: readonly string[]): Promise<CardTeam[]> {
    const wanted = [...new Set(tricodes.filter((tricode) => tricode.length > 0))];
    if (wanted.length === 0) return [];

    const rows = await this.infra.db
      .select({
        abbreviation: teams.abbreviation,
        fullName: teams.fullName,
        logoUrl: teams.logoUrl,
      })
      .from(teams)
      .where(inArray(teams.abbreviation, wanted));

    return rows.map((row) => ({
      tricode: row.abbreviation,
      name: row.fullName,
      logoUrl: row.logoUrl,
      record: null,
    }));
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

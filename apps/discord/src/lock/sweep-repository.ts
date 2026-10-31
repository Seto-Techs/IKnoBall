import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  discordCards,
  scheduleDays,
  scheduleGames,
  teams,
  type Database,
} from '@iknoball/database';
import { cardPayload, type CardPayload } from '../cards/card-payload';
import { TeamStats } from '../cards/team-stats';
import type { CardStake, CardTeam, CardTeamRecord } from '../cards/types';
import { toCardGame, toCardTeams, type SlateGame } from '../scheduler/slate';
import { STATUS_FINAL, cardLook, renderCard, type CardState } from './card-edit';
import type { SweepJob } from './card-sweep';

const homeTeams = alias(teams, 'home_team');
const awayTeams = alias(teams, 'away_team');

/**
 * Everything one card needs to be rebuilt, in one query: the card's own ids and
 * stamps, the game it belongs to, and both sides' `teams` rows.
 *
 * The teams joins are `left`: a preseason or All-Star opponent has no `teams` row,
 * and the schedule's own name for that side is the fallback — the same rule the
 * scheduler's `toCardTeams` uses for the same reason. The day join is `left` for
 * the same kind of reason: a row with no day still yields a card, just no record.
 */
const selection = {
  id: discordCards.id,
  gameId: discordCards.gameId,
  channelId: discordCards.channelId,
  messageId: discordCards.messageId,
  lockedAt: discordCards.lockedAt,
  settledAt: discordCards.settledAt,
  gameStatus: scheduleGames.gameStatus,
  gameDate: scheduleGames.gameDate,
  gameDateTimeUTC: scheduleGames.gameDateTimeUTC,
  seriesText: scheduleGames.seriesText,
  seasonYear: scheduleDays.seasonYear,
  homeTricode: scheduleGames.homeTeamTricode,
  homeCity: scheduleGames.homeTeamCity,
  homeScheduleName: scheduleGames.homeTeamName,
  homeScore: scheduleGames.homeTeamScore,
  awayTricode: scheduleGames.awayTeamTricode,
  awayCity: scheduleGames.awayTeamCity,
  awayScheduleName: scheduleGames.awayTeamName,
  awayScore: scheduleGames.awayTeamScore,
  homeFullName: homeTeams.fullName,
  homeAbbreviation: homeTeams.abbreviation,
  homeLogoUrl: homeTeams.logoUrl,
  awayFullName: awayTeams.fullName,
  awayAbbreviation: awayTeams.abbreviation,
  awayLogoUrl: awayTeams.logoUrl,
} as const;

/**
 * One row of the join, written out rather than inferred so a spec can build a
 * fixture and a renamed column is a compile error in both places.
 *
 * Structurally a `CardState` once the tricodes are resolved, which is what lets
 * `renderCard` decide the look from the row itself.
 */
export interface CardRow {
  id: string;
  gameId: string;
  channelId: string;
  messageId: string;
  lockedAt: Date | null;
  settledAt: Date | null;
  gameStatus: number;
  gameDate: string | null;
  gameDateTimeUTC: Date | null;
  seriesText: string | null;
  seasonYear: string | null;
  homeTricode: string | null;
  homeCity: string | null;
  homeScheduleName: string | null;
  homeScore: number | null;
  awayTricode: string | null;
  awayCity: string | null;
  awayScheduleName: string | null;
  awayScore: number | null;
  homeFullName: string | null;
  homeAbbreviation: string | null;
  homeLogoUrl: string | null;
  awayFullName: string | null;
  awayAbbreviation: string | null;
  awayLogoUrl: string | null;
}

/**
 * The `discord_cards` side of both sweeps.
 *
 * The lock sweep is `lockedAt is null`, past tip-off and not yet final; the
 * settlement sweep is `settledAt is null` joined to a final game with a score. Both
 * cap the run so one very old backlog cannot hold the event loop for minutes, and
 * both skip cards the caller has marked dead.
 *
 * Work is returned per *message*, because that is the unit Discord can patch: the
 * payload is rebuilt from every card row in that message (see `messagePayload`), so
 * a message holding one card — the shape every post has now — and one holding four
 * from before that change both rebuild correctly. Stamping is a conditional update
 * (`... and lockedAt is null`) rather than a blind one: if two processes ever run a
 * sweep, the second write is a no-op and the card still carries the timestamp of
 * the edit that actually happened.
 */
export class CardSweepRepository {
  private readonly stats: TeamStats;

  constructor(private readonly db: Database) {
    this.stats = new TeamStats(db);
  }

  async dueForLock(
    now: Date,
    limit: number,
    excludeIds: readonly string[] = [],
  ): Promise<SweepJob[]> {
    return this.dueMessages(
      and(
        isNull(discordCards.lockedAt),
        isNull(discordCards.settledAt),
        // A final game is the settlement sweep's card, even if it was never locked
        // (the bot was down at tip-off): locking it here would edit the message to
        // the settled look and then edit it again a minute later, and a single
        // failure would mark the card dead for both sweeps at once.
        ne(scheduleGames.gameStatus, STATUS_FINAL),
        lte(scheduleGames.gameDateTimeUTC, now),
        postedMessage(),
        exclude(excludeIds),
      ),
      now,
      limit,
    );
  }

  async dueForSettlement(
    now: Date,
    limit: number,
    excludeIds: readonly string[] = [],
  ): Promise<SweepJob[]> {
    return this.dueMessages(
      and(
        isNull(discordCards.settledAt),
        eq(scheduleGames.gameStatus, STATUS_FINAL),
        // A final row with no score is not a result yet; the worker voids picks in
        // that state, and the card waits rather than printing "Final — – —".
        isNotNull(scheduleGames.homeTeamScore),
        isNotNull(scheduleGames.awayTeamScore),
        postedMessage(),
        exclude(excludeIds),
      ),
      now,
      limit,
    );
  }

  async markLocked(cardIds: readonly string[], at: Date): Promise<void> {
    await this.stamp(cardIds, { lockedAt: at }, isNull(discordCards.lockedAt), at);
  }

  async markSettled(cardIds: readonly string[], at: Date): Promise<void> {
    await this.stamp(cardIds, { settledAt: at }, isNull(discordCards.settledAt), at);
  }

  private async stamp(
    cardIds: readonly string[],
    values: { lockedAt?: Date; settledAt?: Date },
    untouched: SQL | undefined,
    at: Date,
  ): Promise<void> {
    if (cardIds.length === 0) return;

    await this.db
      .update(discordCards)
      .set({ ...values, updatedAt: at })
      .where(and(inArray(discordCards.id, [...cardIds]), untouched));
  }

  /**
   * Due cards, grouped into the messages they live in.
   *
   * Two queries per run, not one per card: the due rows, then every sibling of
   * every message those rows belong to. The siblings are what the rebuilt payload
   * is made of — a message's other cards have to come back exactly as they look,
   * because the PATCH replaces all of them.
   */
  private async dueMessages(where: SQL | undefined, now: Date, limit: number): Promise<SweepJob[]> {
    const due = await this.selectRows(
      where,
      [asc(discordCards.createdAt), asc(discordCards.id)],
      limit,
    );
    if (due.length === 0) return [];

    const groups = groupByMessage(due);
    const siblings = await this.selectRows(inMessages(groups), [
      asc(scheduleGames.gameDateTimeUTC),
      asc(scheduleGames.gameId),
    ]);
    const byMessage = groupByMessage(siblings);
    const stats = await this.cardStats([...due, ...siblings]);

    return [...groups.entries()].map(([key, group]) => ({
      channelId: group.channelId,
      messageId: group.messageId,
      cardIds: group.rows.map((row) => row.id),
      // The due rows are their own fallback: a sibling query that returns nothing
      // for this message still leaves a payload that contains the due cards.
      payload: messagePayload(byMessage.get(key)?.rows ?? group.rows, now, stats),
    }));
  }

  /**
   * The record and price lookups the rebuilt payloads are made of.
   *
   * Read once for the whole run rather than per card: one sweep's cards are a
   * handful of games, and two queries beat two per message. The season comes from
   * the cards' own days, so a card rebuilt after midnight still counts the season
   * it was posted in.
   */
  private async cardStats(rows: readonly CardRow[]): Promise<CardStats> {
    const tricodes = rows
      .flatMap((row) => [row.awayTricode, row.homeTricode])
      .filter((tricode): tricode is string => Boolean(tricode?.trim()));
    const seasons = new Set<string>();
    for (const row of rows) {
      if (row.seasonYear) seasons.add(row.seasonYear);
    }

    const form = new Map<string, CardTeamRecord>();
    for (const season of seasons) {
      for (const [tricode, record] of await this.stats.seasonForm(tricodes, season)) {
        form.set(recordKey(season, tricode), record);
      }
    }

    return { form, stakes: await this.stats.stakes(rows.map((row) => row.gameId)) };
  }

  private async selectRows(
    where: SQL | undefined,
    orderBy: SQL[],
    limit?: number,
  ): Promise<CardRow[]> {
    const query = this.db
      .select(selection)
      .from(discordCards)
      .innerJoin(scheduleGames, eq(scheduleGames.gameId, discordCards.gameId))
      .leftJoin(scheduleDays, eq(scheduleDays.id, scheduleGames.scheduleDayId))
      .leftJoin(homeTeams, eq(homeTeams.abbreviation, scheduleGames.homeTeamTricode))
      .leftJoin(awayTeams, eq(awayTeams.abbreviation, scheduleGames.awayTeamTricode))
      .where(where)
      .orderBy(...orderBy);

    return limit === undefined ? query : query.limit(limit);
  }
}

/**
 * A card the scheduler claimed but never attached to a message.
 *
 * `discord_cards.messageId` is `not null` and the row is written *before* the
 * send, so a crash in between leaves the row holding a placeholder
 * (`PENDING_MESSAGE_ID` in `scheduler/slate-store.ts`) that is not a snowflake. It
 * can never be edited, because there is no message — so it is excluded here rather
 * than selected and failed once per run. A Discord message id is all digits, which
 * is a property of Discord rather than of that chunk's constant, so the test does
 * not have to know what the placeholder is spelled.
 */
function postedMessage(): SQL | undefined {
  return sql`${discordCards.messageId} ~ '^[0-9]+$'`;
}

/** `not in (...)` only when there is something to exclude: an empty list is a syntax error. */
function exclude(ids: readonly string[]): SQL | undefined {
  return ids.length > 0 ? notInArray(discordCards.id, [...ids]) : undefined;
}

interface MessageGroup {
  channelId: string;
  messageId: string;
  rows: CardRow[];
}

function groupByMessage(rows: readonly CardRow[]): Map<string, MessageGroup> {
  const groups = new Map<string, MessageGroup>();

  for (const row of rows) {
    const key = messageKey(row.channelId, row.messageId);
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { channelId: row.channelId, messageId: row.messageId, rows: [row] });
  }

  return groups;
}

function messageKey(channelId: string, messageId: string): string {
  return `${channelId}:${messageId}`;
}

/** `(channelId, messageId) in (...)` — one query for every message on the page. */
function inMessages(groups: ReadonlyMap<string, MessageGroup>): SQL | undefined {
  if (groups.size === 0) return undefined;

  return or(
    ...[...groups.values()].map((group) =>
      and(eq(discordCards.channelId, group.channelId), eq(discordCards.messageId, group.messageId)),
    ),
  );
}

/**
 * The lookups a rebuilt card needs, resolved from the database before the payload
 * is built: the card's paint stays pure.
 *
 * `form` is keyed by season *and* tricode (`recordKey`), because one message is
 * normally one season but nothing enforces it, and a lookup that ignored the season
 * would show last year's record on a card from October's opening night.
 */
export interface CardStats {
  /** Season record with recent form, by `recordKey(season, tricode)`. */
  form: ReadonlyMap<string, CardTeamRecord>;
  /** What each side pays, by game id. */
  stakes: ReadonlyMap<string, CardStake>;
}

/** The `form` key for a tricode in a season. */
function recordKey(season: string | null, tricode: string): string {
  return `${season ?? ''}:${tricode.trim().toUpperCase()}`;
}

/**
 * The whole message, rebuilt from its cards' rows.
 *
 * This is the payload a PATCH sends, and it is why the sweep works per message:
 * Discord replaces every embed and component in one call, so a card cannot be
 * edited on its own. Each card is rendered from the schedule row by
 * `renderCard`, which decides open / locked / settled from the game itself — so a
 * rebuild never depends on what the message currently holds, and two sweeps that
 * touch the same message in the same minute compute the same bytes.
 *
 * A row each: the cards a message holds, in posting order. A card is its own
 * message now, so that list usually has one member; a message sent before that
 * change still has four, and rebuilding it has to keep the other three intact.
 *
 * Built with `cardPayload` and the scheduler's own `toCardGame` / `toCardTeams`, so
 * a rebuilt card is the card that was posted, not a second rendering of it. The
 * records and prices are read from the same tables the post read them from
 * (`TeamStats`), which is what keeps the two halves agreeing.
 */
export function messagePayload(rows: readonly CardRow[], now: Date, stats: CardStats): CardPayload {
  const index = teamIndex(rows, stats.form);

  const payloads = rows.map((row) => {
    const game = slateGame(row);
    const card: CardState = cardState(row);
    // A card past tip-off has nothing left to pick, so the payout would be noise.
    const stake = cardLook(card, now) === 'open' ? stats.stakes.get(row.gameId) : undefined;

    return renderCard(cardPayload(toCardGame(game), toCardTeams(game, index, stake)), card, now);
  });

  return {
    embeds: payloads.flatMap((payload) => payload.embeds),
    components: payloads.flatMap((payload) => payload.components),
  };
}

/** A row in the shape the scheduler's card builder takes. */
function slateGame(row: CardRow): SlateGame {
  return {
    gameId: row.gameId,
    gameStatus: row.gameStatus,
    gameDate: row.gameDate,
    gameDateTimeUTC: row.gameDateTimeUTC,
    awayTeamTricode: row.awayTricode,
    awayTeamCity: row.awayCity,
    awayTeamName: row.awayScheduleName,
    homeTeamTricode: row.homeTricode,
    homeTeamCity: row.homeCity,
    homeTeamName: row.homeScheduleName,
    seriesText: row.seriesText,
    seasonYear: row.seasonYear,
  };
}

/**
 * What `renderCard` needs, with the tricodes resolved the way the card prints
 * them: the schedule's tricode, then the `teams` row's, then the team's name — so
 * the final score is never `**Final**  102 – 108 `.
 */
function cardState(row: CardRow): CardState {
  const game = toCardGame(slateGame(row));

  return {
    gameStatus: row.gameStatus,
    gameDateTimeUTC: row.gameDateTimeUTC,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    lockedAt: row.lockedAt,
    settledAt: row.settledAt,
    homeTricode: tricode(row.homeTricode, row.homeAbbreviation, game.homeTeam),
    awayTricode: tricode(row.awayTricode, row.awayAbbreviation, game.awayTeam),
  };
}

function tricode(schedule: string | null, abbreviation: string | null, fallback: string): string {
  return schedule?.trim() || abbreviation?.trim() || fallback;
}

/**
 * The `teams` rows of every card in the message, keyed the way `toCardTeams`
 * looks them up: by the *schedule's* tricode, upper-cased, because that is what
 * the card prints, emojis, and looks its record up by.
 *
 * A schedule row and its `teams` row disagree for one team (BKN vs BRK), so the
 * schedule's code wins and the `teams` row is only there for the full name and the
 * logo. Record is attached from `form` under the season of the row that named the
 * team, so a card rebuilt after midnight still counts the season it was posted in.
 */
function teamIndex(
  rows: readonly CardRow[],
  form: ReadonlyMap<string, CardTeamRecord>,
): Map<string, CardTeam> {
  const index = new Map<string, CardTeam>();

  for (const row of rows) {
    addTeam(index, row.homeTricode, row.homeAbbreviation, row.homeFullName, row.homeLogoUrl);
    addTeam(index, row.awayTricode, row.awayAbbreviation, row.awayFullName, row.awayLogoUrl);
    addRecord(index, form, row.seasonYear, row.homeTricode, row.homeAbbreviation);
    addRecord(index, form, row.seasonYear, row.awayTricode, row.awayAbbreviation);
  }

  return index;
}

function addTeam(
  index: Map<string, CardTeam>,
  scheduleTricode: string | null,
  abbreviation: string | null,
  fullName: string | null,
  logoUrl: string | null,
): void {
  const tricode = code(scheduleTricode, abbreviation);
  if (!tricode || index.has(tricode)) return;

  index.set(tricode, { tricode, name: fullName?.trim() || tricode, logoUrl });
}

function addRecord(
  index: Map<string, CardTeam>,
  form: ReadonlyMap<string, CardTeamRecord>,
  season: string | null,
  scheduleTricode: string | null,
  abbreviation: string | null,
): void {
  const tricode = code(scheduleTricode, abbreviation);
  const team = tricode ? index.get(tricode) : undefined;
  if (!team || !tricode) return;

  team.record = form.get(recordKey(season, tricode)) ?? null;
}

/** The schedule's tricode for a side, falling back to its `teams` abbreviation. */
function code(scheduleTricode: string | null, abbreviation: string | null): string {
  return (scheduleTricode?.trim() || abbreviation?.trim() || '').toUpperCase();
}

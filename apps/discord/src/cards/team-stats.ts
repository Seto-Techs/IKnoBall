import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { deVig, potentialPoints } from '@iknoball/predictions';
import { gameOddsSnapshots, scheduleDays, scheduleGames, type Database } from '@iknoball/database';
import type { CardStake, CardTeamRecord, TeamFormResult } from './types';

/**
 * The two numbers beside a team on a card: its season record with recent form,
 * and what a correct pick on it pays.
 *
 * Neither lives in the bot's own tables, so both are read here, once, from the
 * schedule and the odds snapshots — the same rows the web's team page and pick
 * preview are built from. The card's paint takes these as plain values
 * (`cards/types.ts`); this is the only thing in `cards/` that touches Postgres,
 * and both the scheduler and the post-tip-off sweeps use it so a rebuilt card
 * shows what the posted one showed.
 */

/** Labels that are not part of a season's record, whatever their scores say. */
const NON_RECORD_LABELS: readonly string[] = ['Preseason', 'All-Star', 'All-Star Championship'];

/** Results the card's form line has room for, most recent first. */
const FORM_LENGTH = 5;

/** `schedule_games.gameStatus` for a final. */
const STATUS_FINAL = 3;

/** One team's tally while the season's games are walked. */
interface Tally {
  wins: number;
  losses: number;
  form: TeamFormResult[];
}

export class TeamStats {
  constructor(private readonly db: Database) {}

  /**
   * W-L and the last five results for each tricode, over one season.
   *
   * The tricodes are the *schedule's* (BKN, not the `teams` table's BRK), because
   * that is what the card prints and what it looks the record up by.
   *
   * The record counts regular-season finals only — the same filter the backend's
   * standings and team record use, so the card never disagrees with the web. Form
   * is this season's finals of any phase, newest first: a card is about the team
   * *now*, so a short form line in October is better than last spring's playoffs.
   *
   * A team with no completed games is simply absent from the map; the card drops
   * that side's field rather than printing a dash where a record would go.
   */
  async seasonForm(
    tricodes: readonly string[],
    season: string | null,
  ): Promise<Map<string, CardTeamRecord>> {
    const wanted = normalise(tricodes);
    if (!season || wanted.length === 0) return new Map();

    const rows = await this.db
      .select({
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        gameLabel: scheduleGames.gameLabel,
        seriesText: scheduleGames.seriesText,
      })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleDays.id, scheduleGames.scheduleDayId))
      .where(
        and(
          eq(scheduleDays.seasonYear, season),
          eq(scheduleGames.gameStatus, STATUS_FINAL),
          or(
            inArray(scheduleGames.homeTeamTricode, wanted),
            inArray(scheduleGames.awayTeamTricode, wanted),
          ),
        ),
      )
      // Newest first: that is both the form order and why the first five seen for
      // a team are its last five. `nulls last`, because a row with no tip-off is
      // not the most recent thing that happened.
      .orderBy(sql`${scheduleGames.gameDateTimeUTC} desc nulls last`);

    const wantedSet = new Set(wanted);
    const tally = new Map<string, Tally>();
    const of = (tricode: string): Tally => {
      const found = tally.get(tricode);
      if (found) return found;
      const fresh: Tally = { wins: 0, losses: 0, form: [] };
      tally.set(tricode, fresh);
      return fresh;
    };

    for (const row of rows) {
      // A row marked final with no score is not a result: the worker voids picks
      // in that state, and the card waits rather than inventing a winner.
      if (row.homeScore === null || row.awayScore === null) continue;

      const home = row.homeTricode?.trim().toUpperCase() ?? '';
      const away = row.awayTricode?.trim().toUpperCase() ?? '';
      const homeWon = row.homeScore > row.awayScore;
      const regularSeason =
        row.seriesText === '' && !NON_RECORD_LABELS.includes(row.gameLabel?.trim() ?? '');
      const played = row.homeScore + row.awayScore > 0;

      for (const [tricode, won] of [
        [home, homeWon],
        [away, !homeWon],
      ] as const) {
        if (!wantedSet.has(tricode)) continue;

        const entry = of(tricode);
        if (regularSeason) {
          if (won) entry.wins += 1;
          else entry.losses += 1;
        }
        // A 0-0 final is a cancelled or unplayed game: not a form result.
        if (played && entry.form.length < FORM_LENGTH) entry.form.push(won ? 'W' : 'L');
      }
    }

    return new Map(
      [...tally].map(([tricode, entry]) => [
        tricode,
        { wins: entry.wins, losses: entry.losses, form: entry.form },
      ]),
    );
  }

  /**
   * What each side of these games pays, from the newest stored price.
   *
   * Read from `game_odds_snapshots` rather than the live feed: the bot must not
   * become a second odds client, and a price the API has already recorded is the
   * same price the web preview shows. The preferred book wins when it has a
   * snapshot, otherwise the newest row from any book does.
   *
   * A game with no snapshot is simply absent from the map, and the card leaves the
   * points line off it.
   */
  async stakes(gameIds: readonly string[]): Promise<Map<string, CardStake>> {
    const wanted = [...new Set(gameIds.filter((id) => id.length > 0))];
    if (wanted.length === 0) return new Map();

    const byGame = groupByGame(await this.snapshotRows(wanted, null));
    const preferred = preferredBook();

    const stakes = new Map<string, CardStake>();
    for (const gameId of wanted) {
      const stake = stakeOf(pickPrice(byGame.get(gameId) ?? [], null, preferred));
      if (stake) stakes.set(gameId, stake);
    }

    return stakes;
  }

  /**
   * What each card shows now, and what it would show if it were rebuilt — the
   * comparison that decides whether a posted card is worth editing.
   *
   * Both answers come from one read of the price history, with one floor and one
   * book rule, so "then" and "now" are the same measurement taken twice. A card
   * cannot flap because the two passes picked different books, and a game whose
   * history is entirely behind the floor answers the same way on both sides —
   * which reads as no change, not as a card to edit.
   *
   * The floor is what keeps this affordable. A game collects a snapshot per book
   * every five minutes from the moment its line opens, which is thousands of rows
   * each by tip-off; the sweep asks this question every minute for every open card.
   * `BASELINE_SLACK_MS` below says why the floor is safe.
   */
  async compared(questions: readonly StakeComparison[]): Promise<Map<string, StakePair>> {
    const wanted = [
      ...new Set(questions.map((question) => question.gameId).filter((id) => id.length > 0)),
    ];
    if (wanted.length === 0) return new Map();

    const byGame = groupByGame(await this.snapshotRows(wanted, floorOf(questions)));
    const preferred = preferredBook();

    const pairs = new Map<string, StakePair>();
    for (const question of questions) {
      const rows = byGame.get(question.gameId) ?? [];
      pairs.set(question.key, {
        then: stakeOf(pickPrice(rows, question.at, preferred)),
        now: stakeOf(pickPrice(rows, null, preferred)),
      });
    }

    return pairs;
  }

  /** Stored prices for these games, newest first, so a cutoff is a skip. */
  private async snapshotRows(
    gameIds: readonly string[],
    since: Date | null,
  ): Promise<SnapshotRow[]> {
    const query = this.db
      .select({
        gameId: gameOddsSnapshots.gameId,
        bookName: gameOddsSnapshots.bookName,
        homeDecimal: gameOddsSnapshots.homeDecimal,
        awayDecimal: gameOddsSnapshots.awayDecimal,
        capturedAt: gameOddsSnapshots.capturedAt,
      })
      .from(gameOddsSnapshots)
      .where(
        since === null
          ? inArray(gameOddsSnapshots.gameId, [...gameIds])
          : and(
              inArray(gameOddsSnapshots.gameId, [...gameIds]),
              gte(gameOddsSnapshots.capturedAt, since),
            ),
      );

    return query.orderBy(desc(gameOddsSnapshots.capturedAt));
  }
}

/** One card's comparison: what did this game pay when the card was written? */
export interface StakeComparison {
  /** The caller's key for the card; the pair comes back under it. */
  key: string;
  gameId: string;
  /** When the card was last written, which is the price it was built from. */
  at: Date;
}

/** The two prices a card can be judged by. */
export interface StakePair {
  /** What the card was last written with. */
  then: CardStake | null;
  /** What a rebuild would print. */
  now: CardStake | null;
}

/**
 * How far before the oldest baseline a comparison run reads.
 *
 * The floor only has to reach back to the row that was newest when that card was
 * written, which is at most one capture interval old — five minutes by default. An
 * hour leaves room for a feed that paused and came back, and still bounds the read
 * at about an hour of history per game (a few thousand rows for a whole slate)
 * instead of the thousands of rows a game accumulates over its lifetime.
 *
 * A floor that reached back further would be wasteful; one that reached back less
 * than a capture interval would answer "no price then" for a card that has one, and
 * the sweep would edit the same card on every capture.
 */
const BASELINE_SLACK_MS = 60 * 60 * 1000;

/** The floor for one run: the oldest baseline, less the slack a row needs. */
function floorOf(questions: readonly StakeComparison[]): Date | null {
  let oldest: number | null = null;
  for (const question of questions) {
    const at = question.at.getTime();
    if (oldest === null || at < oldest) oldest = at;
  }

  return oldest === null ? null : new Date(oldest - BASELINE_SLACK_MS);
}

/** The book the card prices from, unless the deployment prefers another. */
function preferredBook(): string {
  return process.env.ODDS_PREFERRED_BOOK?.trim() || 'FanDuel';
}

/** The columns a price is chosen from. */
interface SnapshotRow {
  gameId: string;
  bookName: string;
  homeDecimal: number;
  awayDecimal: number;
  capturedAt: Date;
}

/** Rows bucketed by game, each bucket newest first because the query sorted them. */
function groupByGame(rows: readonly SnapshotRow[]): Map<string, SnapshotRow[]> {
  const byGame = new Map<string, SnapshotRow[]>();

  for (const row of rows) {
    const found = byGame.get(row.gameId);
    if (found) found.push(row);
    else byGame.set(row.gameId, [row]);
  }

  return byGame;
}

/**
 * The row a card would be priced from: the preferred book's, else the newest.
 *
 * `rows` is newest first, so the first row that survives the cutoff is the newest
 * one at or before it. A row after the cutoff is skipped rather than breaking the
 * loop, because a game's later prices are all in front of the ones we want.
 */
function pickPrice(
  rows: readonly SnapshotRow[],
  at: Date | null,
  preferred: string,
): SnapshotRow | null {
  let newest: SnapshotRow | null = null;

  for (const row of rows) {
    if (at !== null && row.capturedAt.getTime() > at.getTime()) continue;
    newest ??= row;
    if (row.bookName === preferred) return row;
  }

  return newest;
}

/** The points each side of one price pays, or null when it is not a market. */
function stakeOf(price: SnapshotRow | null): CardStake | null {
  // A price of zero or a gap in the feed is not a market: `deVig` would carry the
  // NaN into the card as "+NaN pts".
  if (!price || !(price.homeDecimal > 0) || !(price.awayDecimal > 0)) return null;

  const fair = deVig(price.homeDecimal, price.awayDecimal);
  return {
    home: potentialPoints('weighted', fair.home),
    away: potentialPoints('weighted', fair.away),
  };
}

/** Uppercase, trimmed, de-duplicated tricodes; `[]` for a team with no code. */
function normalise(tricodes: readonly string[]): string[] {
  const wanted = new Set<string>();
  for (const tricode of tricodes) {
    const trimmed = tricode.trim().toUpperCase();
    if (trimmed.length > 0) wanted.add(trimmed);
  }
  return [...wanted];
}

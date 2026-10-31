import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
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

    const rows = await this.db
      .select({
        gameId: gameOddsSnapshots.gameId,
        bookName: gameOddsSnapshots.bookName,
        homeDecimal: gameOddsSnapshots.homeDecimal,
        awayDecimal: gameOddsSnapshots.awayDecimal,
      })
      .from(gameOddsSnapshots)
      .where(inArray(gameOddsSnapshots.gameId, wanted))
      .orderBy(desc(gameOddsSnapshots.capturedAt));

    const preferred = process.env.ODDS_PREFERRED_BOOK?.trim() || 'FanDuel';
    const newest = new Map<string, (typeof rows)[number]>();
    const newestPreferred = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!newest.has(row.gameId)) newest.set(row.gameId, row);
      if (row.bookName === preferred && !newestPreferred.has(row.gameId)) {
        newestPreferred.set(row.gameId, row);
      }
    }

    const stakes = new Map<string, CardStake>();
    for (const [gameId, fallback] of newest) {
      const price = newestPreferred.get(gameId) ?? fallback;
      // A price of zero or a gap in the feed is not a market: `deVig` would carry
      // the NaN into the card as "+NaN pts".
      if (!(price.homeDecimal > 0) || !(price.awayDecimal > 0)) continue;

      const fair = deVig(price.homeDecimal, price.awayDecimal);
      stakes.set(gameId, {
        home: potentialPoints('weighted', fair.home),
        away: potentialPoints('weighted', fair.away),
      });
    }

    return stakes;
  }
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

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  miniGameResults,
  playerTeamSeasons,
  players,
  scheduleBoxscorePlayers,
  scheduleDays,
  scheduleGames,
  teams,
} from '@iknoball/database';
import { DatabaseService } from './infrastructure/database/database.service';
import {
  buildGraph,
  distanceBetween,
  gradeOf,
  receiptsBetween,
  type ConnectGraph,
  type GraphPlayer,
  type MembershipRow,
  type Receipt,
} from './minigames.graph';

/** The slug stored with every result. The shelf's other games will use their own. */
const GAME = 'lebronnect';

/**
 * The puzzle's clock. A daily runs out at midnight Eastern, the way the sports
 * day does everywhere else on the site, so the reset is one fact rather than one
 * per viewer's timezone.
 */
const RESET_TIMEZONE = 'America/New_York';

/** Day one. Puzzle numbers count from here and never move. */
const EPOCH = Date.UTC(2026, 9, 28);

/** How many of the broadest team-season histories daily pairs are drawn from. */
const POOL_SIZE = 400;

/** Keep every daily puzzle out of direct/one-player teammate trivia territory. */
const MIN_INTERMEDIARIES = 2;

/** The graph is rebuilt on this cadence, so an import shows up without a restart. */
const GRAPH_TTL_MS = 30 * 60 * 1000;

export type ConnectPlayerRef = { id: string; externalId: string; name: string };

/** A guess-box suggestion: the player plus the career span that tells two names apart. */
export type PlayerSuggestion = ConnectPlayerRef & { seasons: string };

export type DailyPuzzle = {
  number: number;
  date: string;
  start: ConnectPlayerRef;
  target: ConnectPlayerRef;
};

export type ChainLink = {
  playerId: string;
  /** NBA person id, so a restored chain still renders real faces. */
  externalId: string;
  name: string;
  /** Empty on the first row: you cannot link a player to themselves. */
  receipt: Receipt[];
};

export type SolveResult = {
  date: string;
  number: number;
  /** Intermediaries named. The start and the target never count. */
  players: number;
  /** Intermediaries on the shortest route, revealed only here. */
  par: number;
  blocks: 1 | 2 | 3 | 4 | 5;
  perfect: boolean;
  chain: ChainLink[];
};

export type ConnectStats = {
  streak: number;
  solved: number;
  /** Mean players over par. `0` for a player yet to finish one. */
  average: number;
  results: {
    number: number;
    date: string;
    start: ConnectPlayerRef;
    target: ConnectPlayerRef;
    players: number;
    par: number;
    blocks: number;
  }[];
};

/** `2026-11-09` for the current Eastern date. */
export function puzzleDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

/** Puzzle 1 is the epoch day; every day after is one higher. */
export function puzzleNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) - EPOCH) / 86_400_000) + 1;
}

/** `2026-11-09` ± n days, as a `YYYY-MM-DD` string. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Deterministic 32-bit hash, so a date always draws the same pair. */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

@Injectable()
export class MinigamesService {
  private readonly logger = new Logger(MinigamesService.name);
  private graph: ConnectGraph | null = null;
  private graphBuiltAt = 0;
  private graphLoading: Promise<ConnectGraph> | null = null;
  private readonly puzzles = new Map<string, DailyPuzzle>();

  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  /* ── The graph ─────────────────────────────────────────────── */

  private async loadGraph(): Promise<ConnectGraph> {
    if (this.graph && Date.now() - this.graphBuiltAt < GRAPH_TTL_MS) return this.graph;
    if (this.graphLoading) return this.graphLoading;

    this.graphLoading = this.queryMemberships()
      .then((rows) => {
        const graph = buildGraph(rows);
        this.graph = graph;
        this.graphBuiltAt = Date.now();
        this.logger.log(
          `LeBronnect graph rebuilt: ${graph.byId.size} players, ${rows.length} club-seasons`,
        );
        return graph;
      })
      .finally(() => {
        this.graphLoading = null;
      });

    return this.graphLoading;
  }

  /**
   * One row per player/club/season from the career feed. This is deliberately
   * separate from the box-score table: historical player-season stats survive
   * even when the schedule has not been backfilled game by game.
   */
  private async queryMemberships(): Promise<MembershipRow[]> {
    const careerRows = await this.db
      .select({
        playerId: playerTeamSeasons.playerId,
        externalId: players.externalId,
        name: sql<string>`coalesce(${players.displayName}, ${players.firstName} || ' ' || ${players.lastName})`,
        team: playerTeamSeasons.teamAbbr,
        season: playerTeamSeasons.season,
        // The graph ranks the daily pool by membership coverage. This is not
        // box-score game count; historical seasons are intentionally the source.
        games: sql<number>`1`,
      })
      .from(playerTeamSeasons)
      .innerJoin(players, eq(players.id, playerTeamSeasons.playerId))
      .where(eq(playerTeamSeasons.seasonType, 'ByYear-regular'));

    // Keep the graph usable while the historical career backfill is being
    // hydrated. Current box scores supplement, rather than replace, career data.
    const boxscoreRows = await this.db
      .select({
        playerId: players.id,
        externalId: players.externalId,
        name: sql<string>`coalesce(${players.displayName}, ${players.firstName} || ' ' || ${players.lastName})`,
        team: teams.abbreviation,
        season: scheduleDays.seasonYear,
        games: count(),
      })
      .from(scheduleBoxscorePlayers)
      .innerJoin(scheduleGames, eq(scheduleGames.id, scheduleBoxscorePlayers.scheduleGameId))
      .innerJoin(scheduleDays, eq(scheduleDays.id, scheduleGames.scheduleDayId))
      .innerJoin(players, eq(players.externalId, scheduleBoxscorePlayers.playerExternalId))
      .innerJoin(teams, eq(teams.externalId, sql`${scheduleBoxscorePlayers.teamExternalId}::text`))
      .groupBy(
        players.id,
        players.externalId,
        players.displayName,
        players.firstName,
        players.lastName,
        teams.abbreviation,
        scheduleDays.seasonYear,
      );

    const memberships = new Map<string, MembershipRow>();
    for (const row of [...careerRows, ...boxscoreRows]) {
      const key = `${row.playerId}|${row.team}|${row.season}`;
      const existing = memberships.get(key);
      memberships.set(key, {
        playerId: row.playerId,
        externalId: row.externalId,
        name: row.name,
        team: row.team,
        season: row.season,
        games: existing ? Math.max(existing.games, Number(row.games)) : Number(row.games),
      });
    }
    return [...memberships.values()];
  }

  /* ── Today's puzzle ────────────────────────────────────────── */

  /**
   * The day's pair: two of the longest-career players in the data who are not
   * teammates and sit three to five links apart. The pair is a pure function of
   * the date — same board for everyone, and the same board if the service
   * restarts. `par` never leaves this method except through a finished solve.
   */
  async getPuzzle(date = puzzleDate()): Promise<DailyPuzzle> {
    const cached = this.puzzles.get(date);
    if (cached) return cached;

    const graph = await this.loadGraph();
    const number = puzzleNumber(date);
    const pool = graph.order
      .slice(0, POOL_SIZE)
      .map((id) => graph.byId.get(id))
      .filter((player) => player !== undefined);

    const draw = (attempt: number) => {
      const seed = seedOf(`${GAME}:${date}`);
      const a = pool[(seed + attempt * 131) % pool.length];
      const b = pool[(seed * 31 + attempt * 977 + 7) % pool.length];
      if (!a || !b || a.id === b.id) return null;
      return { a, b, distance: distanceBetween(graph, a.id, b.id) };
    };

    // Distance counts links; par counts only intermediary players. Requiring
    // at least two intermediaries means the shortest route must span three
    // team-season links. Never relax this floor into a one-player trivia
    // question just because the preferred draw window is sparse.
    const minDistance = MIN_INTERMEDIARIES + 1;
    const maxDistance = 5;
    for (let attempt = 0; attempt < pool.length * 3; attempt++) {
      const pick = draw(attempt);
      if (!pick || !Number.isFinite(pick.distance)) continue;
      if (pick.distance < minDistance || pick.distance > maxDistance) continue;

      const puzzle: DailyPuzzle = {
        number,
        date,
        start: this.refOf(graph, pick.a.id),
        target: this.refOf(graph, pick.b.id),
      };
      this.puzzles.set(date, puzzle);
      return puzzle;
    }

    throw new BadRequestException('No puzzle can be drawn from the current teammate graph');
  }

  private refOf(graph: ConnectGraph, id: string): ConnectPlayerRef {
    const player = graph.byId.get(id);
    if (!player) throw new BadRequestException(`Unknown player: ${id}`);
    return { id: player.id, externalId: player.externalId, name: player.name };
  }

  /* ── Playing ───────────────────────────────────────────────── */

  /** Names matching `query`, best first — the guess box's suggestion list. */
  async searchPlayers(query: string, limit = 8): Promise<PlayerSuggestion[]> {
    const needle = fold(query.trim());
    if (needle.length < 2) return [];

    const graph = await this.loadGraph();
    const ranked: { player: GraphPlayer; rank: number }[] = [];

    for (const player of graph.byId.values()) {
      const rank = rankOf(player.name, needle);
      if (rank !== null) ranked.push({ player, rank });
    }

    return ranked
      .sort((x, y) => x.rank - y.rank || x.player.name.localeCompare(y.player.name))
      .slice(0, limit)
      .map(({ player }) => ({
        id: player.id,
        externalId: player.externalId,
        name: player.name,
        seasons: `${player.firstSeason} → ${player.lastSeason}`,
      }));
  }

  /** The receipt for one hop, or an empty array when the pair never met. */
  async checkHop(fromId: string, toId: string): Promise<Receipt[]> {
    if (!fromId || !toId) throw new BadRequestException('from and to are required');
    const graph = await this.loadGraph();
    return receiptsBetween(graph, fromId, toId);
  }

  /**
   * Validate a whole chain and write the day's result.
   *
   * The client's word is worth nothing here: the endpoints come from the day's
   * puzzle, every hop is re-checked against the graph, and par is read off the
   * graph at solve time. A forged chain that skips a hop fails the receipt check
   * before it can be graded.
   */
  async solve(userId: string, chain: string[]): Promise<SolveResult> {
    const today = puzzleDate();
    const puzzle = await this.getPuzzle(today);
    const graph = await this.loadGraph();

    if (chain.length < 2) throw new BadRequestException('The chain has no links yet');
    if (chain[0] !== puzzle.start.id)
      throw new BadRequestException('The chain starts on the wrong player');
    if (chain[chain.length - 1] !== puzzle.target.id) {
      throw new BadRequestException('The chain has not reached the target');
    }
    if (new Set(chain).size !== chain.length) {
      throw new BadRequestException('A player appears twice in the chain');
    }

    const links: ChainLink[] = chain.map((playerId, index) => {
      const player = this.refOf(graph, playerId);
      if (index === 0) {
        return { playerId, externalId: player.externalId, name: player.name, receipt: [] };
      }

      const receipt = receiptsBetween(graph, chain[index - 1], playerId);
      if (receipt.length === 0) {
        const previous = graph.byId.get(chain[index - 1]);
        throw new BadRequestException(
          `${player.name} and ${previous?.name ?? 'the previous player'} never shared a team-season`,
        );
      }
      return { playerId, externalId: player.externalId, name: player.name, receipt };
    });

    const distance = distanceBetween(graph, puzzle.start.id, puzzle.target.id);
    const par = Number.isFinite(distance) ? Math.max(0, distance - 1) : 0;
    const named = chain.length - 2;
    const blocks = gradeOf(named, par);

    await this.db
      .insert(miniGameResults)
      .values({
        userId,
        game: GAME,
        puzzleDate: today,
        puzzleNumber: puzzle.number,
        startPlayerId: puzzle.start.id,
        targetPlayerId: puzzle.target.id,
        players: named,
        par,
        blocks,
        chain: links,
      })
      // The first result of the day is the one that counts; replaying the board
      // afterwards must not rewrite it.
      .onConflictDoNothing();

    // Report the day's recorded result rather than this submission. A replay
    // writes nothing, so returning the fresh grade would make the board show
    // one answer and the stats shelf another.
    return (
      (await this.resultFor(userId, today)) ?? {
        date: today,
        number: puzzle.number,
        players: named,
        par,
        blocks,
        perfect: named <= par,
        chain: links,
      }
    );
  }

  /** The viewer's result for one day, or null when they have not finished it. */
  async resultFor(userId: string, date = puzzleDate()): Promise<SolveResult | null> {
    const [row] = await this.db
      .select()
      .from(miniGameResults)
      .where(
        and(
          eq(miniGameResults.userId, userId),
          eq(miniGameResults.game, GAME),
          eq(miniGameResults.puzzleDate, date),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      date: row.puzzleDate,
      number: row.puzzleNumber,
      players: row.players,
      par: row.par,
      blocks: row.blocks as 1 | 2 | 3 | 4 | 5,
      perfect: row.players <= row.par,
      chain: row.chain as ChainLink[],
    };
  }

  /* ── History ───────────────────────────────────────────────── */

  /**
   * Streak, solve count, mean over par and the last five boards.
   *
   * The streak survives a missed morning: it counts back from today when today
   * is finished and from yesterday when it is not, which is how every daily game
   * reads it — a streak breaks only once a whole day passes unplayed.
   */
  async stats(userId: string): Promise<ConnectStats> {
    const rows = await this.db
      .select({
        number: miniGameResults.puzzleNumber,
        date: miniGameResults.puzzleDate,
        startPlayerId: miniGameResults.startPlayerId,
        targetPlayerId: miniGameResults.targetPlayerId,
        players: miniGameResults.players,
        par: miniGameResults.par,
        blocks: miniGameResults.blocks,
      })
      .from(miniGameResults)
      .where(and(eq(miniGameResults.userId, userId), eq(miniGameResults.game, GAME)))
      .orderBy(desc(miniGameResults.puzzleDate));

    const played = new Set(rows.map((row) => row.date));
    const today = puzzleDate();
    let cursor = played.has(today) ? today : shiftDate(today, -1);
    let streak = 0;
    while (played.has(cursor)) {
      streak += 1;
      cursor = shiftDate(cursor, -1);
    }

    const average =
      rows.length === 0
        ? 0
        : rows.reduce((sum, row) => sum + (row.players - row.par), 0) / rows.length;

    const recent = rows.slice(0, 5);
    const names = new Map<string, ConnectPlayerRef>();
    const ids = [...new Set(recent.flatMap((row) => [row.startPlayerId, row.targetPlayerId]))];
    if (ids.length > 0) {
      const found = await this.db
        .select({
          id: players.id,
          externalId: players.externalId,
          displayName: players.displayName,
          firstName: players.firstName,
          lastName: players.lastName,
        })
        .from(players)
        .where(inArray(players.id, ids));

      for (const player of found) {
        names.set(player.id, {
          id: player.id,
          externalId: player.externalId,
          name: player.displayName ?? `${player.firstName} ${player.lastName}`,
        });
      }
    }

    return {
      streak,
      solved: rows.length,
      average,
      results: recent.map((row) => ({
        number: row.number,
        date: row.date,
        start: names.get(row.startPlayerId) ?? {
          id: row.startPlayerId,
          externalId: '',
          name: 'Unknown',
        },
        target: names.get(row.targetPlayerId) ?? {
          id: row.targetPlayerId,
          externalId: '',
          name: 'Unknown',
        },
        players: row.players,
        par: row.par,
        blocks: row.blocks,
      })),
    };
  }
}

/**
 * Fold diacritics and case so `Doncic` finds `Dončić`, matching what the global
 * search does with the same names.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Rank a name against a folded query: exact > prefix > word-prefix (so `ball`
 * finds `LaMelo Ball`) > substring. Lower is better; null means no match.
 */
function rankOf(name: string, needle: string): number | null {
  const folded = fold(name);
  if (folded === needle) return 0;
  if (folded.startsWith(needle)) return 1;
  if (folded.split(/\s+/).some((word) => word.startsWith(needle))) return 2;
  if (folded.includes(needle)) return 3;
  return null;
}

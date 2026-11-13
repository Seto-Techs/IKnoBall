/**
 * The teammate graph LeBronnect plays on, and the rules that read it.
 *
 * Built from `schedule_boxscore_players`: a player appeared for a club in a
 * season, so every pair of players who appeared for the same club in the same
 * season are teammates. That is the whole edge rule — no curated rosters, no
 * minimum minutes, because a ten-day contract is a teammate and a game that
 * pretends otherwise is easier than the sport.
 *
 * Kept free of I/O so the rules can be tested against a fixture: the service
 * loads the rows, everything in here is a pure function of them.
 */

/** One `(player, club, season)` membership, as the loader aggregates it. */
export interface MembershipRow {
  playerId: string;
  externalId: string;
  name: string;
  team: string;
  season: string;
  /** Appearances, used only to rank the daily puzzle pool. */
  games: number;
}

export interface GraphPlayer {
  id: string;
  /** NBA person id — what the headshot CDN and every other page keys on. */
  externalId: string;
  name: string;
  firstSeason: string;
  lastSeason: string;
  games: number;
  /** Club → the seasons of this player's membership there, oldest first. */
  memberships: Map<string, string[]>;
  /** `CLUB|season` keys, the thing two players intersect on. */
  keys: Set<string>;
}

export interface ConnectGraph {
  byId: Map<string, GraphPlayer>;
  neighbours: Map<string, Set<string>>;
  /** Ids, most team-season memberships first: the daily pool uses this order. */
  order: string[];
}

export type Receipt = { team: string; seasons: string[] };

/** `2014` → `2014-15`; anything already in season form passes through. */
export function normalizeSeason(raw: string): string {
  if (!/^\d{4}$/.test(raw)) return raw;
  const year = Number(raw);
  return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
}

export function buildGraph(rows: MembershipRow[]): ConnectGraph {
  const byId = new Map<string, GraphPlayer>();
  /** `CLUB|season` → every player who appeared for that club that season. */
  const roster = new Map<string, string[]>();

  for (const row of rows) {
    const season = normalizeSeason(row.season);
    const key = `${row.team}|${season}`;

    let player = byId.get(row.playerId);
    if (!player) {
      player = {
        id: row.playerId,
        externalId: row.externalId,
        name: row.name,
        firstSeason: season,
        lastSeason: season,
        games: 0,
        memberships: new Map(),
        keys: new Set(),
      };
      byId.set(row.playerId, player);
    }

    player.games += row.games;
    if (season < player.firstSeason) player.firstSeason = season;
    if (season > player.lastSeason) player.lastSeason = season;
    player.keys.add(key);

    const seasons = player.memberships.get(row.team);
    if (seasons) {
      if (!seasons.includes(season)) seasons.push(season);
    } else {
      player.memberships.set(row.team, [season]);
    }

    const squad = roster.get(key);
    if (squad) squad.push(row.playerId);
    else roster.set(key, [row.playerId]);
  }

  for (const player of byId.values()) {
    for (const seasons of player.memberships.values()) seasons.sort();
  }

  // Every player in a squad is linked to every other one. Squad sizes are 15–20,
  // so the quadratic step is cheaper than any dedupe scheme would be.
  const neighbours = new Map<string, Set<string>>();
  for (const squad of roster.values()) {
    for (const a of squad) {
      let linked = neighbours.get(a);
      if (!linked) {
        linked = new Set();
        neighbours.set(a, linked);
      }
      for (const b of squad) if (b !== a) linked.add(b);
    }
  }

  const order = [...byId.values()]
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
    .map((player) => player.id);

  return { byId, neighbours, order };
}

/**
 * The receipt for a link: every club the pair shared, with the seasons they
 * shared it for. An empty array means they never were teammates — which is both
 * the rejection and the only feedback a free-text guess gets.
 */
export function receiptsBetween(graph: ConnectGraph, aId: string, bId: string): Receipt[] {
  const a = graph.byId.get(aId);
  const b = graph.byId.get(bId);
  if (!a || !b || aId === bId) return [];

  const byTeam = new Map<string, string[]>();
  for (const key of a.keys) {
    if (!b.keys.has(key)) continue;
    const split = key.indexOf('|');
    const team = key.slice(0, split);
    const season = key.slice(split + 1);
    const seasons = byTeam.get(team);
    if (seasons) seasons.push(season);
    else byTeam.set(team, [season]);
  }

  return [...byTeam.entries()]
    .map(([team, seasons]) => ({ team, seasons: seasons.sort() }))
    .sort((x, y) => x.seasons[x.seasons.length - 1].localeCompare(y.seasons[y.seasons.length - 1]));
}

/**
 * One shortest route between two players, as the players it passes through —
 * `fromId` first, `toId` last, `[fromId]` for a player against themselves, and
 * an empty array when no route exists.
 *
 * Breadth-first, so the path's length is the distance `distanceBetween`
 * reports. Any shortest route will do: par counts links, not names.
 */
export function shortestPath(graph: ConnectGraph, fromId: string, toId: string): string[] {
  if (!graph.byId.has(fromId) || !graph.byId.has(toId)) return [];
  if (fromId === toId) return [fromId];

  /** Each player reached, and the one they were reached from. */
  const parent = new Map<string, string>();
  const seen = new Set([fromId]);
  let frontier = [fromId];
  let reached = false;

  while (frontier.length > 0 && !reached) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const neighbour of graph.neighbours.get(current) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        parent.set(neighbour, current);
        if (neighbour === toId) {
          reached = true;
          break;
        }
        next.push(neighbour);
      }
      if (reached) break;
    }
    frontier = next;
  }

  if (!reached) return [];

  const path = [toId];
  for (let current = toId; current !== fromId;) {
    const previous = parent.get(current);
    if (previous === undefined) return [];
    path.push(previous);
    current = previous;
  }
  return path.reverse();
}

/**
 * Fewest links between two players, measured in edges (a direct teammate is 1).
 * Returns `Infinity` when they are in different components — the pool filter
 * uses that to skip a pair rather than to claim a distance.
 */
export function distanceBetween(graph: ConnectGraph, fromId: string, toId: string): number {
  const path = shortestPath(graph, fromId, toId);
  return path.length > 0 ? path.length - 1 : Number.POSITIVE_INFINITY;
}

/**
 * The Wordle-style grade: a full five is par, and each player over takes one
 * block away. The floor is one block, so a disastrous chain grades the same as
 * three over rather than going negative.
 */
export function gradeOf(players: number, par: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, 5 - (players - par))) as 1 | 2 | 3 | 4 | 5;
}

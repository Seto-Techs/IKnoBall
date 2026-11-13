import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, mutateJson } from './api';

/**
 * LeBronnect's API surface.
 *
 * Everything the game needs comes from `/minigames/lebronnect/*`: the day's two
 * players, a name search restricted to players the graph can link, a per-hop
 * check, and the graded solve. Validation and grading live on the server for a
 * reason — the client is a renderer here, and a chain it made up is worth
 * nothing until the graph agrees with it.
 *
 * The one thing no response ever contains is the shortest route, except with an
 * over-par solve: `par` arrives with a finished solve and nowhere else, and the
 * route comes with it only for a player who needs to see what par looked like.
 */

/** The two facts every surface of the game needs about a player. */
export type ConnectPlayer = {
  id: string;
  /** NBA person id, which is what the headshot CDN keys on. */
  externalId: string;
  name: string;
};

/** A suggestion row: the player plus the span that tells two names apart. */
export type PlayerSuggestion = ConnectPlayer & { seasons: string };

/** A club plus the seasons it links two players for. */
export type Receipt = { team: string; seasons: string[] };

/**
 * One row of the chain as the client holds it. `receipt` is empty on the start,
 * because a player cannot link to themselves.
 */
export type ChainLink = ConnectPlayer & { receipt: Receipt[] };

export type LebronnectPuzzle = {
  number: number;
  date: string;
  start: ConnectPlayer;
  target: ConnectPlayer;
};

export type LebronnectGrade = 1 | 2 | 3 | 4 | 5;

/** One row of a stored chain, as the API returns it. */
export type ResultChainLink = {
  playerId: string;
  externalId: string;
  name: string;
  receipt: Receipt[];
};

export type LebronnectResult = {
  date: string;
  number: number;
  /** Intermediaries named. The start and the target never count. */
  players: number;
  /** Intermediaries on the shortest route, revealed only once the chain is done. */
  par: number;
  blocks: LebronnectGrade;
  perfect: boolean;
  chain: ResultChainLink[];
  /**
   * The shortest route, start first, when the chain finished over par. Null at
   * par or better — the server withholds it rather than restating the answer.
   */
  best: ResultChainLink[] | null;
};

export type LebronnectHistoryRow = {
  number: number;
  date: string;
  start: ConnectPlayer;
  target: ConnectPlayer;
  players: number;
  par: number;
  blocks: LebronnectGrade;
};

export type LebronnectStats = {
  /** Consecutive days solved, counting back from today (or yesterday). */
  streak: number;
  solved: number;
  /** Mean players over par. `0` for a player yet to finish one. */
  average: number;
  results: LebronnectHistoryRow[];
};

export type LebronnectMe = {
  result: LebronnectResult | null;
  stats: LebronnectStats;
};

/** Headshots come off the league CDN, keyed by the person id every page uses. */
export function headshotUrl(externalId: string): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${externalId}.png`;
}

/** `1 player` / `2 players`. Every surface that counts the chain spells it this way. */
export function playerLabel(players: number) {
  return `${players} ${players === 1 ? 'player' : 'players'}`;
}

/** `+0.45` / `+0` — the average score is always a number of players over par. */
export function offsetLabel(offset: number) {
  const rounded = Math.round(offset * 100) / 100;
  return `+${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)}`;
}

export function useLebronnectPuzzle() {
  return useQuery({
    queryKey: ['lebronnect', 'puzzle'],
    queryFn: async () => {
      const res = await fetchJson<{ data: LebronnectPuzzle }>('/minigames/lebronnect/puzzle');
      return res.data;
    },
    // The board changes at midnight ET; a tab left open all day should not keep
    // asking for the same two names.
    staleTime: 1000 * 60 * 5,
  });
}

export function useLebronnectMe(enabled = true) {
  return useQuery({
    queryKey: ['lebronnect', 'me'],
    queryFn: async () => {
      const res = await fetchJson<{ data: LebronnectMe }>('/minigames/lebronnect/me');
      return res.data;
    },
    enabled,
    staleTime: 1000 * 60,
  });
}

/**
 * Name search for the guess box. Two characters is the floor because one letter
 * matches the whole league; the list is capped server-side.
 */
export function useLebronnectPlayers(query: string) {
  const needle = query.trim();
  return useQuery({
    queryKey: ['lebronnect', 'players', needle],
    queryFn: async () => {
      const res = await fetchJson<{ data: PlayerSuggestion[] }>(
        `/minigames/lebronnect/players?q=${encodeURIComponent(needle)}`,
      );
      return res.data;
    },
    enabled: needle.length >= 2,
    staleTime: 1000 * 60 * 5,
  });
}

/** Validate one hop. `linked: false` is the rejection — the pair never met. */
export function useLebronnectHop() {
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      mutateJson<{ data: { linked: boolean; receipt: Receipt[] } }>(
        'POST',
        '/minigames/lebronnect/hop',
        { from, to },
      ).then((res) => res.data),
  });
}

/**
 * Submit the finished chain. The server re-checks every hop and grades it, so
 * the result replaces whatever the client believed about the count.
 */
export function useLebronnectSolve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chain: string[]) =>
      mutateJson<{ data: LebronnectResult }>('POST', '/minigames/lebronnect/solve', {
        chain,
      }).then((res) => res.data),
    onSuccess: () => {
      // The record and the streak both moved, so the shelf and the stats strip
      // are stale the moment a chain lands.
      qc.invalidateQueries({ queryKey: ['lebronnect'] });
    },
  });
}

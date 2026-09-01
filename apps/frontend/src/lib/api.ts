import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthSession } from './use-auth';

/* ── Types matching backend API responses ── */

export interface TeamRecord {
  wins: number;
  losses: number;
  conference: string;
  division: string;
  lastGames: {
    opponentAbbr: string;
    isHome: boolean;
    ourScore: number;
    oppScore: number;
    gameDate: string;
  }[];
}

export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTime: string;
  status: string;
  arenaName?: string | null;
  arenaCity?: string | null;
  arenaState?: string | null;
}

export interface PlayerStat {
  id: string;
  name: string;
  position: string;
  headshotUrl: string;
  points: number;
  pointsTotal: number;
  rebounds: number;
  reboundsTotal: number;
  assists: number;
  assistsTotal: number;
  steals: number;
  stealsTotal: number;
  blocks: number;
  blocksTotal: number;
  gamesPlayed: number;
}

export interface StandingRow {
  rank: number;
  teamAbbr: string;
  logoUrl: string;
  wins: number;
  losses: number;
  gamesBack: number;
  marker: string | null;
}

export interface StandingsResponse {
  season: string;
  West: StandingRow[];
  East: StandingRow[];
}

export interface StatLeader {
  name: string;
  value: number;
}

export interface TeamWithLeaders {
  externalId: number;
  abbreviation: string;
  teamName: string;
  fullName: string;
  city: string;
  conference: string;
  division: string;
  logoUrl: string;
  arena: string;
  headCoach: string;
  primaryColor: string;
  leaders: {
    pts: StatLeader;
    reb: StatLeader;
    ast: StatLeader;
  } | null;
}

/* ── API fetch helpers (Vite proxy in dev, VITE_API_URL + /api in prod) ── */

const API = import.meta.env.DEV ? '/api' : `${import.meta.env.VITE_API_URL ?? ''}/api`;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── Queries ── */

export function useTeamRecord(abbr?: string) {
  return useQuery({
    queryKey: ['team-record', abbr],
    queryFn: async (): Promise<TeamRecord> => {
      const res = await fetchJson<{ data: TeamRecord }>(`/teams/${abbr}/record`);
      return res.data;
    },
    enabled: !!abbr,
    staleTime: 1000 * 60 * 15,
  });
}

export function useUpcomingGames(abbr?: string) {
  return useQuery({
    queryKey: ['upcoming-games', abbr],
    queryFn: async (): Promise<Game[]> => {
      const res = await fetchJson<{ data: Game[] }>(`/teams/${abbr}/games`);
      return res.data;
    },
    enabled: !!abbr,
    staleTime: 1000 * 60 * 5,
  });
}
export function useTopPlayers(abbr?: string) {
  return useQuery({
    queryKey: ['top-players', abbr],
    queryFn: async (): Promise<PlayerStat[]> => {
      const res = await fetchJson<{ data: PlayerStat[] }>(`/teams/${abbr}/players`);
      return res.data;
    },
    enabled: !!abbr,
    staleTime: 1000 * 60 * 30,
  });
}

export function useTeamSchedule(abbr?: string, month?: string) {
  return useQuery({
    queryKey: ['team-schedule', abbr, month],
    queryFn: async (): Promise<Game[]> => {
      const res = await fetchJson<{ data: Game[] }>(
        `/teams/${abbr}/schedule?month=${encodeURIComponent(month ?? '')}`,
      );
      return res.data;
    },
    enabled: !!abbr && !!month,
    staleTime: 1000 * 60 * 15,
  });
}

export function useStandings() {
  return useQuery({
    queryKey: ['standings'],
    queryFn: async (): Promise<StandingsResponse> => {
      const res = await fetchJson<{ data: StandingsResponse }>('/standings');
      return res.data;
    },
    staleTime: 1000 * 60 * 15,
  });
}

export function useTeams(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async (): Promise<TeamWithLeaders[]> => {
      const res = await fetchJson<{ data: TeamWithLeaders[] }>('/teams');
      return res.data;
    },
    staleTime: 1000 * 60 * 60,
    ...options,
  });
}

/* ── Mutations ── */

async function mutateJson<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function useSaveTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamAbbr: string) =>
      mutateJson<{ data: { favoriteTeam: string } }>('PATCH', '/me/team', { teamAbbr }),
    onMutate: (teamAbbr) => {
      qc.setQueryData<AuthSession | null>(['session'], (old) =>
        old ? { ...old, user: { ...old.user, favoriteTeam: teamAbbr } } : old,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

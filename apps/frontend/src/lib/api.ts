import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nbaTeams, type NBATeam } from '../config/nba-teams';
import { getSelectedTeam } from './team';

/* ── Types matching backend API responses ── */

export interface TeamRecord {
  wins: number;
  losses: number;
  conference: string;
  division: string;
}

export interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  gameDateTime: string;
  status: string;
}

export interface PlayerStat {
  id: string;
  name: string;
  position: string;
  points: number;
  rebounds: number;
  assists: number;
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

/* ── API fetch helpers (use Vite proxy → backend) ── */

const API = '/api';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── Queries ── */

export function useTeamInfo() {
  const selected = getSelectedTeam();
  return useQuery({
    queryKey: ['team', selected?.abbr],
    queryFn: async (): Promise<NBATeam> => {
      // Try backend first
      try {
        return await fetchJson<NBATeam>(`/teams/${selected!.abbr}`);
      } catch {
        // Fall back to local config
        const local = nbaTeams.find((t) => t.abbreviation === selected!.abbr);
        if (!local) throw new Error('Team not found');
        return local;
      }
    },
    enabled: !!selected?.abbr,
    staleTime: 1000 * 60 * 30,
  });
}

export function useTeamRecord() {
  const selected = getSelectedTeam();
  return useQuery({
    queryKey: ['team-record', selected?.abbr],
    queryFn: async (): Promise<TeamRecord> => {
      // Try backend first
      try {
        return await fetchJson<TeamRecord>(`/teams/${selected!.abbr}/record`);
      } catch {
        // Fall back to local config for conference/division
        const local = nbaTeams.find((t) => t.abbreviation === selected!.abbr);
        if (!local) throw new Error('Team not found');
        return {
          wins: 0,
          losses: 0,
          conference: local.conference === 'East' ? 'Eastern Conference' : 'Western Conference',
          division: `${local.division} Division`,
        };
      }
    },
    enabled: !!selected?.abbr,
    staleTime: 1000 * 60 * 15,
  });
}

export function useUpcomingGames() {
  const selected = getSelectedTeam();
  return useQuery({
    queryKey: ['upcoming-games', selected?.abbr],
    queryFn: () => fetchJson<Game[]>(`/teams/${selected!.abbr}/games`),
    enabled: !!selected?.abbr,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTopPlayers() {
  const selected = getSelectedTeam();
  return useQuery({
    queryKey: ['top-players', selected?.abbr],
    queryFn: () => fetchJson<PlayerStat[]>(`/teams/${selected!.abbr}/players`),
    enabled: !!selected?.abbr,
    staleTime: 1000 * 60 * 30,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async (): Promise<TeamWithLeaders[]> => {
      const res = await fetchJson<{ data: TeamWithLeaders[] }>('/teams');
      return res.data;
    },
    staleTime: 1000 * 60 * 60,
  });
}

/* ── Mutations ── */

async function mutateJson<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

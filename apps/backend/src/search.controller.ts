import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { teams, players, scheduleGames } from '@iknoball/database';
import { and, asc, eq, gte, ilike, inArray, notInArray, or } from 'drizzle-orm';

// players/schedule_games store BKN where teams uses BRK, and vice versa.
const TEAM_CANONICAL: Record<string, string> = { BKN: 'BRK' };
const SCHEDULE_TRICODE: Record<string, string> = { BRK: 'BKN' };

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
// Upper bound on upcoming games scanned when resolving each team's next game.
// A month of league games comfortably covers every involved team's next tip-off.
const UPCOMING_SCAN_LIMIT = 200;
const EXCLUDED_GAME_LABELS = ['All-Star', 'All-Star Championship'];

function canonicalAbbr(abbr: string | null | undefined): string {
  if (!abbr) return '';
  return TEAM_CANONICAL[abbr] ?? abbr;
}

function scheduleTricode(abbr: string | null | undefined): string {
  if (!abbr) return '';
  return SCHEDULE_TRICODE[abbr] ?? abbr;
}

/**
 * Rank a candidate against the query. Lower is better, `null` means no match.
 * Exact > prefix > word-prefix (so "ball" finds "LaMelo Ball") > substring.
 */
function matchRank(candidate: string | null | undefined, query: string): number | null {
  if (!candidate) return null;
  const text = candidate.toLowerCase();
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (text.includes(query)) return 3;
  return null;
}

function bestRank(candidates: (string | null | undefined)[], query: string): number | null {
  let best: number | null = null;
  for (const candidate of candidates) {
    const rank = matchRank(candidate, query);
    if (rank !== null && (best === null || rank < best)) best = rank;
  }
  return best;
}

/** Escape LIKE wildcards so a query of "%" matches a literal percent sign. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

class TeamHit {
  @ApiProperty({ example: 'LAL' })
  abbreviation!: string;

  @ApiProperty({ example: 'Lakers' })
  teamName!: string;

  @ApiProperty({ example: 'Los Angeles Lakers' })
  fullName!: string;

  @ApiProperty({ example: 'Los Angeles' })
  city!: string;

  @ApiProperty({ example: 'West' })
  conference!: string;

  @ApiProperty({ example: 'Pacific' })
  division!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg' })
  logoUrl!: string | null;

  @ApiProperty({ example: '#552583' })
  primaryColor!: string | null;

  @ApiProperty({
    type: () => GameHit,
    nullable: true,
    description: 'Next upcoming game, or null when the team has none scheduled.',
  })
  nextGame!: GameHit | null;
}

class PlayerHit {
  @ApiProperty({ example: 'abc123' })
  id!: string;

  @ApiProperty({ example: 'LaMelo Ball' })
  name!: string;

  @ApiProperty({ example: 'G', nullable: true })
  position!: string | null;

  @ApiProperty({ example: 'https://cdn.nba.com/headshots/nba/latest/260x190/1630163.png' })
  headshotUrl!: string;

  @ApiProperty({ example: 'CHA', nullable: true })
  teamAbbr!: string | null;

  @ApiProperty({ example: 'Charlotte Hornets', nullable: true })
  teamName!: string | null;

  @ApiProperty({ example: '#1D1160', nullable: true })
  teamColor!: string | null;

  @ApiProperty({
    type: () => GameHit,
    nullable: true,
    description: "The team's next upcoming game.",
  })
  nextGame!: GameHit | null;
}

class GameHit {
  @ApiProperty({ example: '20251024/LALGSW' })
  id!: string;

  @ApiProperty({ example: 'Golden State Warriors' })
  homeTeam!: string;

  @ApiProperty({ example: 'Los Angeles Lakers' })
  awayTeam!: string;

  @ApiProperty({ example: 'GSW', nullable: true })
  homeTricode!: string | null;

  @ApiProperty({ example: 'LAL', nullable: true })
  awayTricode!: string | null;

  @ApiProperty({ example: '2026-10-24T02:00:00.000Z' })
  gameDateTime!: string;

  @ApiProperty({ example: 'Scheduled' })
  status!: string;

  @ApiProperty({ example: 'Chase Center', nullable: true })
  arenaName!: string | null;

  @ApiProperty({ example: 'San Francisco', nullable: true })
  arenaCity!: string | null;

  @ApiProperty({ example: 'CA', nullable: true })
  arenaState!: string | null;

  @ApiProperty({ example: '2026-10-23' })
  gameDate!: string;
}

class SearchResponse {
  @ApiProperty({ example: 'la' })
  query!: string;

  @ApiProperty({ type: [TeamHit] })
  teams!: TeamHit[];

  @ApiProperty({ type: [PlayerHit] })
  players!: PlayerHit[];

  @ApiProperty({ type: [GameHit] })
  games!: GameHit[];
}

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({
    summary: 'Global search across teams, players and upcoming games',
    description:
      'Teams and players resolve to their next upcoming game so every result is navigable.',
  })
  @ApiDataResponse(SearchResponse, HttpStatus.OK, 'Search results.', 'Search results.')
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResponse<SearchResponse>> {
    const query = (q ?? '').trim().toLowerCase();
    const empty = response<SearchResponse>(true, 'Search results.', {
      query,
      teams: [],
      players: [],
      games: [],
    });
    if (query.length < MIN_QUERY_LENGTH) return empty;

    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const perGroup = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const allTeams = await this.db.db
      .select({
        abbreviation: teams.abbreviation,
        teamName: teams.name,
        fullName: teams.fullName,
        city: teams.city,
        conference: teams.conference,
        division: teams.division,
        logoUrl: teams.logoUrl,
        primaryColor: teams.primaryColor,
      })
      .from(teams);

    // 30 rows — rank in memory rather than paying for three ILIKE predicates.
    const teamMatches = allTeams
      .map((team) => ({
        team,
        rank: bestRank([team.fullName, team.teamName, team.abbreviation], query),
      }))
      .filter((m): m is { team: (typeof allTeams)[number]; rank: number } => m.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.team.fullName.localeCompare(b.team.fullName));

    const playerRows = await this.db.db
      .select({
        id: players.id,
        firstName: players.firstName,
        lastName: players.lastName,
        displayName: players.displayName,
        position: players.position,
        externalId: players.externalId,
        teamAbbr: players.teamAbbr,
      })
      .from(players)
      .where(and(eq(players.rosterStatus, 1), ilike(players.displayName, likePattern(query))));

    const teamByAbbr = new Map(allTeams.map((team) => [team.abbreviation, team]));
    const playerMatches = playerRows
      .map((player) => ({
        player,
        rank: bestRank(
          [player.displayName, `${player.firstName} ${player.lastName}`.trim()],
          query,
        ),
      }))
      .filter((m): m is { player: (typeof playerRows)[number]; rank: number } => m.rank !== null)
      .sort(
        (a, b) =>
          a.rank - b.rank || (a.player.displayName ?? '').localeCompare(b.player.displayName ?? ''),
      );

    const playerTeam = (abbr: string | null) => {
      const canonical = canonicalAbbr(abbr);
      return canonical ? (teamByAbbr.get(canonical) ?? null) : null;
    };

    // Every result navigates to a game, so resolve each matched team to its next tip-off.
    // Track the best match rank per team so the games group surfaces the most relevant
    // fixtures first instead of pulling in whatever a coincidental substring hit plays.
    const rankByTricode = new Map<string, number>();
    const noteRank = (tricode: string, rank: number) => {
      if (!tricode) return;
      const current = rankByTricode.get(tricode);
      if (current === undefined || rank < current) rankByTricode.set(tricode, rank);
    };
    for (const match of teamMatches) {
      noteRank(scheduleTricode(match.team.abbreviation), match.rank);
    }
    for (const match of playerMatches) {
      const team = playerTeam(match.player.teamAbbr);
      if (team) noteRank(scheduleTricode(team.abbreviation), match.rank);
    }

    const involvedTricodes = Array.from(rankByTricode.keys());

    const upcoming =
      involvedTricodes.length === 0
        ? []
        : await this.db.db
            .select({
              id: scheduleGames.gameId,
              homeTricode: scheduleGames.homeTeamTricode,
              awayTricode: scheduleGames.awayTeamTricode,
              gameDateTime: scheduleGames.gameDateTimeUTC,
              status: scheduleGames.gameStatusText,
              arenaName: scheduleGames.arenaName,
              arenaCity: scheduleGames.arenaCity,
              arenaState: scheduleGames.arenaState,
              gameDate: scheduleGames.gameDate,
            })
            .from(scheduleGames)
            .where(
              and(
                gte(scheduleGames.gameDateTimeUTC, new Date()),
                notInArray(scheduleGames.gameLabel, EXCLUDED_GAME_LABELS),
                or(
                  inArray(scheduleGames.homeTeamTricode, involvedTricodes),
                  inArray(scheduleGames.awayTeamTricode, involvedTricodes),
                ),
              ),
            )
            .orderBy(asc(scheduleGames.gameDateTimeUTC))
            .limit(UPCOMING_SCAN_LIMIT);

    const gameRank = (game: (typeof upcoming)[number]) =>
      Math.min(
        rankByTricode.get(game.homeTricode ?? '') ?? Number.MAX_SAFE_INTEGER,
        rankByTricode.get(game.awayTricode ?? '') ?? Number.MAX_SAFE_INTEGER,
      );

    // SQL already ordered by date; re-rank so the closest matches lead, date breaking ties.
    const rankedGames = [...upcoming].sort(
      (a, b) =>
        gameRank(a) - gameRank(b) ||
        (a.gameDateTime?.getTime() ?? 0) - (b.gameDateTime?.getTime() ?? 0),
    );

    const nextGameByTricode = new Map<string, (typeof upcoming)[number]>();
    for (const game of upcoming) {
      for (const tricode of [game.homeTricode, game.awayTricode]) {
        if (tricode && !nextGameByTricode.has(tricode)) nextGameByTricode.set(tricode, game);
      }
    }

    const nameByTricode = new Map(allTeams.map((t) => [t.abbreviation, t.fullName]));
    const teamNameFor = (tricode: string | null) =>
      nameByTricode.get(canonicalAbbr(tricode)) ?? tricode ?? '';

    const toGameHit = (game: (typeof upcoming)[number]): GameHit => ({
      id: game.id,
      homeTeam: teamNameFor(game.homeTricode),
      awayTeam: teamNameFor(game.awayTricode),
      homeTricode: game.homeTricode ? canonicalAbbr(game.homeTricode) : game.homeTricode,
      awayTricode: game.awayTricode ? canonicalAbbr(game.awayTricode) : game.awayTricode,
      gameDateTime: game.gameDateTime?.toISOString() ?? '',
      status: game.status ?? '',
      arenaName: game.arenaName ?? null,
      arenaCity: game.arenaCity ?? null,
      arenaState: game.arenaState ?? null,
      gameDate: game.gameDate,
    });

    const nextGameFor = (abbreviation: string | null | undefined): GameHit | null => {
      const game = nextGameByTricode.get(scheduleTricode(abbreviation));
      return game ? toGameHit(game) : null;
    };

    return response(true, 'Search results.', {
      query,
      teams: teamMatches.slice(0, perGroup).map(({ team }) => ({
        abbreviation: team.abbreviation,
        teamName: team.teamName,
        fullName: team.fullName,
        city: team.city,
        conference: team.conference,
        division: team.division,
        logoUrl: team.logoUrl,
        primaryColor: team.primaryColor,
        nextGame: nextGameFor(team.abbreviation),
      })),
      players: playerMatches.slice(0, perGroup).map(({ player }) => {
        const team = playerTeam(player.teamAbbr);
        return {
          id: player.id,
          name: player.displayName ?? `${player.firstName} ${player.lastName}`.trim(),
          position: player.position,
          headshotUrl: `https://cdn.nba.com/headshots/nba/latest/260x190/${player.externalId}.png`,
          teamAbbr: team?.abbreviation ?? null,
          teamName: team?.fullName ?? null,
          teamColor: team?.primaryColor ?? null,
          nextGame: team ? nextGameFor(team.abbreviation) : null,
        };
      }),
      games: rankedGames.slice(0, perGroup).map(toGameHit),
    });
  }
}

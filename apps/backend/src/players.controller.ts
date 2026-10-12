import { BadRequestException, Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import {
  players,
  playerSeasonStats,
  playerSeasonTeamStats,
  teams,
  scheduleGames,
  scheduleBoxscorePlayers,
} from '@iknoball/database';
import { and, asc, count, desc, eq, gte, notInArray, or, sql } from 'drizzle-orm';

/** Games per page of the game log. */
const GAME_LOG_PAGE_SIZE = 10;
/** Cap on a caller-supplied `limit`, so one request cannot ask for the lot. */
const GAME_LOG_PAGE_MAX = 50;
/**
 * A player who never checked in still gets a box-score row (the feed lists the
 * whole roster), and those rows carry zero minutes — `PT00M` or `PT00M00.00S` in
 * every row on file. Excluding them in SQL rather than after the fetch keeps the
 * page offsets and the total count honest.
 */
const ZERO_MINUTES_PATTERN = '^PT0*M0*([.][0-9]+)?S?$';
const EXCLUDED_GAME_LABELS = ['All-Star', 'All-Star Championship'];
/** The season the summary panel shows, matching the other player endpoints. */
const CURRENT_SEASON = process.env.NBA_CURRENT_SEASON ?? '2025-26';

/**
 * The feed reports minutes as an ISO-8601 duration ("PT34M21.00S"), so a game
 * log shows "34:21". Unrecognised input passes through, degrading to a display
 * quirk rather than a blank column.
 */
function minutesLabel(value: string | null): string | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value.trim());
  if (!match) return value;
  const mins = Number(match[1] ?? 0);
  const secs = Math.round(Number(match[2] ?? 0));
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** `ByYear-regular` / `ByYear-playoffs` as the season type the client renders. */
function seasonType(timeframe: string | null): string {
  return timeframe === 'ByYear-playoffs' ? 'playoffs' : 'regular';
}

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/**
 * Join a box-score row to its game, on the side the player turned out for. Both
 * the count and the page query use it, so the total and the rows agree.
 */
const GAME_LOG_JOIN = and(
  eq(scheduleBoxscorePlayers.scheduleGameId, scheduleGames.id),
  or(
    eq(scheduleBoxscorePlayers.teamExternalId, scheduleGames.homeTeamId),
    eq(scheduleBoxscorePlayers.teamExternalId, scheduleGames.awayTeamId),
  ),
);

/**
 * Read a `limit`/`offset` query value. Malformed input is a client bug rather
 * than a valid page, so it fails loudly; an over-large `limit` is clamped to the
 * cap so one request cannot ask for the whole log.
 */
function parsePageParam(
  value: string | undefined,
  fallback: number,
  max: number,
  name: string,
): number {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be a non-negative integer`);
  }
  return Math.min(Number(value), max);
}

class PlayerTeamResponse {
  @ApiProperty({ example: 1610612759 })
  externalId!: number;

  @ApiProperty({ example: 'SAS' })
  abbreviation!: string;

  @ApiProperty({ example: 'Spurs' })
  teamName!: string;

  @ApiProperty({ example: 'San Antonio Spurs' })
  fullName!: string;

  @ApiProperty({ example: 'San Antonio' })
  city!: string;

  @ApiProperty({ example: 'West' })
  conference!: string;

  @ApiProperty({ example: 'Southwest' })
  division!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612759/global/L/logo.svg' })
  logoUrl!: string;

  @ApiProperty({ example: 'Frost Bank Center' })
  arena!: string;

  @ApiProperty({ example: 'Mitch Johnson' })
  headCoach!: string;

  @ApiProperty({ example: '#C4CED4' })
  primaryColor!: string;
}

class PlayerSeasonStatsResponse {
  @ApiProperty({ example: 64 })
  gp!: number;

  @ApiProperty({ example: 46, nullable: true })
  wins!: number | null;

  @ApiProperty({ example: 18, nullable: true })
  losses!: number | null;

  @ApiProperty({ example: 25.0, nullable: true })
  points!: number | null;

  @ApiProperty({ example: 11.5, nullable: true })
  rebounds!: number | null;

  @ApiProperty({ example: 3.1, nullable: true })
  assists!: number | null;

  @ApiProperty({ example: 1.0, nullable: true })
  steals!: number | null;

  @ApiProperty({ example: 3.1, nullable: true })
  blocks!: number | null;

  @ApiProperty({ example: 0.512, nullable: true })
  fgPct!: number | null;

  @ApiProperty({ example: 0.349, nullable: true })
  fg3Pct!: number | null;

  @ApiProperty({ example: 0.827, nullable: true })
  ftPct!: number | null;

  @ApiProperty({ example: 1600, nullable: true })
  pointsTotal!: number | null;

  @ApiProperty({ example: 736, nullable: true })
  reboundsTotal!: number | null;

  @ApiProperty({ example: 199, nullable: true })
  assistsTotal!: number | null;

  @ApiProperty({ example: 66, nullable: true })
  stealsTotal!: number | null;

  @ApiProperty({ example: 197, nullable: true })
  blocksTotal!: number | null;
}

class PlayerSeasonTeamResponse extends PlayerSeasonStatsResponse {
  @ApiProperty({ example: 'LAL', description: "The feed's own abbreviation for this split." })
  teamAbbr!: string;

  @ApiProperty({ example: 'Los Angeles Lakers' })
  teamName!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg' })
  logoUrl!: string;

  @ApiProperty({ example: '#552583' })
  primaryColor!: string;
}

class PlayerSeasonResponse extends PlayerSeasonStatsResponse {
  @ApiProperty({ example: '2025-26' })
  season!: string;

  @ApiProperty({ example: 'regular', enum: ['regular', 'playoffs'] })
  seasonType!: string;

  @ApiProperty({
    type: [PlayerSeasonTeamResponse],
    description:
      'Per-team splits for a season the player spent on more than one team; empty otherwise.',
  })
  teams!: PlayerSeasonTeamResponse[];
}

class PlayerGameLogResponse {
  @ApiProperty({ example: '0012600039' })
  gameId!: string;

  @ApiProperty({ example: '2026-10-10' })
  gameDate!: string;

  @ApiProperty({ example: 'PHX', nullable: true })
  opponentTricode!: string | null;

  @ApiProperty({ example: 'Phoenix Suns' })
  opponentName!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612756/global/L/logo.svg' })
  opponentLogoUrl!: string;

  @ApiProperty({ example: false })
  isHome!: boolean;

  @ApiProperty({
    example: true,
    nullable: true,
    description: 'Null when the game has no final score.',
  })
  won!: boolean | null;

  @ApiProperty({ example: '22:04' })
  minutes!: string | null;

  @ApiProperty({ example: 13, nullable: true })
  points!: number | null;

  @ApiProperty({ example: 7, nullable: true })
  rebounds!: number | null;

  @ApiProperty({ example: 6, nullable: true })
  assists!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  steals!: number | null;

  @ApiProperty({ example: 2, nullable: true })
  blocks!: number | null;
}

class PlayerNextGameResponse {
  @ApiProperty({ example: '0012600039' })
  id!: string;

  @ApiProperty({ example: '2026-10-14T02:00:00.000Z' })
  gameDateTime!: string;

  @ApiProperty({ example: false, description: "True when the player's team is the home side." })
  isHome!: boolean;

  @ApiProperty({ example: 'ATL', nullable: true })
  opponentTricode!: string | null;

  @ApiProperty({ example: 'Atlanta Hawks' })
  opponentName!: string;

  @ApiProperty({ example: 'https://cdn.nba.com/logos/nba/1610612737/global/L/logo.svg' })
  opponentLogoUrl!: string;

  @ApiProperty({ example: 'Frost Bank Center', nullable: true })
  arenaName!: string | null;

  @ApiProperty({ example: 'San Antonio', nullable: true })
  arenaCity!: string | null;
}

class PlayerDetailResponse {
  @ApiProperty({ example: '73360bcb-a8af-40cb-98ed-e920b48dfe8b' })
  id!: string;

  @ApiProperty({ example: '1641705', description: 'NBA person id' })
  externalId!: string;

  @ApiProperty({ example: 'Victor Wembanyama' })
  name!: string;

  @ApiProperty({ example: 'Victor' })
  firstName!: string;

  @ApiProperty({ example: 'Wembanyama' })
  lastName!: string;

  @ApiProperty({ example: 'C', nullable: true })
  position!: string | null;

  @ApiProperty({ example: '1', nullable: true })
  jersey!: string | null;

  @ApiProperty({ example: '7-3', nullable: true })
  height!: string | null;

  @ApiProperty({ example: '210', nullable: true })
  weight!: string | null;

  @ApiProperty({ example: 'Metropolitans 92', nullable: true })
  college!: string | null;

  @ApiProperty({ example: 'FRA', nullable: true })
  country!: string | null;

  @ApiProperty({ example: 2023, nullable: true })
  draftYear!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  draftRound!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  draftPick!: number | null;

  @ApiProperty({ example: '2023', nullable: true })
  careerFrom!: string | null;

  @ApiProperty({ example: '2026', nullable: true })
  careerTo!: string | null;

  @ApiProperty({ example: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1641705.png' })
  headshotUrl!: string;

  @ApiProperty({ type: PlayerTeamResponse, nullable: true })
  team!: PlayerTeamResponse | null;

  @ApiProperty({
    type: PlayerSeasonResponse,
    nullable: true,
    description:
      'The season the summary panel shows: the current season when the player has played it, otherwise their most recent one. Repeated in `seasons`.',
  })
  currentSeason!: PlayerSeasonResponse | null;

  @ApiProperty({ type: [PlayerSeasonResponse], description: 'Every stored season, newest first.' })
  seasons!: PlayerSeasonResponse[];

  @ApiProperty({ type: PlayerNextGameResponse, nullable: true })
  nextGame!: PlayerNextGameResponse | null;
}

class PlayerGameLogPageResponse {
  @ApiProperty({
    example: 115,
    description: 'Games the player has appeared in, across every season.',
  })
  total!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;

  @ApiProperty({ type: [PlayerGameLogResponse], description: 'Newest first.' })
  games!: PlayerGameLogResponse[];
}

@ApiTags('Players')
@Controller('players')
export class PlayersController {
  constructor(private readonly db: DatabaseService) {}

  /**
   * All 30 teams. The schedule and the box scores both carry the NBA team id,
   * while their tricodes disagree with the teams table (the feed says BKN, the
   * seed says BRK), so ids are the safe join key.
   */
  private loadTeamRows() {
    return this.db.db
      .select({
        externalId: teams.externalId,
        abbreviation: teams.abbreviation,
        teamName: teams.name,
        fullName: teams.fullName,
        city: teams.city,
        conference: teams.conference,
        division: teams.division,
        logoUrl: teams.logoUrl,
        arena: teams.arena,
        headCoach: teams.headCoach,
        primaryColor: teams.primaryColor,
      })
      .from(teams);
  }

  /**
   * A player's games: finals only, and only the side the player actually turned
   * out for, so `isHome` — and therefore the result — is definite for a player
   * who has been traded, whose box-score rows carry the team they played for
   * that night. Rows without minutes are games the feed listed them as not
   * playing in.
   */
  private gameLogWhere(playerId: string) {
    return and(
      eq(scheduleBoxscorePlayers.playerId, playerId),
      eq(scheduleGames.gameStatus, 3),
      sql`${scheduleBoxscorePlayers.minutes} is not null`,
      sql`${scheduleBoxscorePlayers.minutes} !~ ${ZERO_MINUTES_PATTERN}`,
    );
  }

  @Get(':id/games')
  @ApiOperation({ summary: "A page of a player's game log, newest first" })
  @ApiDataResponse(PlayerGameLogPageResponse, HttpStatus.OK, 'Game log.', 'Game log.')
  async getGames(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ApiResponse<PlayerGameLogPageResponse>> {
    const [player] = await this.db.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, id))
      .limit(1);

    if (!player) {
      return response<PlayerGameLogPageResponse>(true, 'Player not found.', null);
    }

    const pageSize = parsePageParam(limit, GAME_LOG_PAGE_SIZE, GAME_LOG_PAGE_MAX, 'limit');
    const start = parsePageParam(offset, 0, Number.MAX_SAFE_INTEGER, 'offset');
    const where = this.gameLogWhere(player.id);

    const [counted] = await this.db.db
      .select({ total: count() })
      .from(scheduleBoxscorePlayers)
      .innerJoin(scheduleGames, GAME_LOG_JOIN)
      .where(where);

    const rows = await this.db.db
      .select({
        gameId: scheduleGames.gameId,
        gameDate: scheduleGames.gameDate,
        homeTeamId: scheduleGames.homeTeamId,
        awayTeamId: scheduleGames.awayTeamId,
        homeScore: scheduleGames.homeTeamScore,
        awayScore: scheduleGames.awayTeamScore,
        homeTricode: scheduleGames.homeTeamTricode,
        awayTricode: scheduleGames.awayTeamTricode,
        teamExternalId: scheduleBoxscorePlayers.teamExternalId,
        minutes: scheduleBoxscorePlayers.minutes,
        points: scheduleBoxscorePlayers.pts,
        rebounds: scheduleBoxscorePlayers.reb,
        assists: scheduleBoxscorePlayers.ast,
        steals: scheduleBoxscorePlayers.stl,
        blocks: scheduleBoxscorePlayers.blk,
      })
      .from(scheduleBoxscorePlayers)
      .innerJoin(scheduleGames, GAME_LOG_JOIN)
      .where(where)
      // `gameDate` is enough on its own for one player, but the timestamp keeps
      // the order — and so the page boundaries — stable.
      .orderBy(desc(scheduleGames.gameDate), desc(scheduleGames.gameDateTimeUTC))
      .limit(pageSize)
      .offset(start);

    const teamRows = await this.loadTeamRows();
    const teamById = new Map(teamRows.map((row) => [row.externalId, row]));
    const teamForId = (teamId: number | null) =>
      teamId == null ? undefined : teamById.get(String(teamId));

    return response(true, 'Game log fetched.', {
      // `count()` comes back as a bigint string from pg.
      total: Number(counted?.total ?? 0),
      limit: pageSize,
      offset: start,
      games: rows.map((row) => {
        const isHome = row.teamExternalId === row.homeTeamId;
        const opponent = teamForId(isHome ? row.awayTeamId : row.homeTeamId);
        const ours = isHome ? row.homeScore : row.awayScore;
        const theirs = isHome ? row.awayScore : row.homeScore;
        return {
          gameId: row.gameId,
          gameDate: row.gameDate,
          opponentTricode:
            opponent?.abbreviation ?? (isHome ? row.awayTricode : row.homeTricode) ?? null,
          opponentName: opponent?.fullName ?? '',
          opponentLogoUrl: opponent?.logoUrl ?? '',
          isHome,
          won: ours == null || theirs == null ? null : ours > theirs,
          minutes: minutesLabel(row.minutes),
          points: row.points,
          rebounds: row.rebounds,
          assists: row.assists,
          steals: row.steals,
          blocks: row.blocks,
        };
      }),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'A single player: bio, team, season stats and next game' })
  @ApiDataResponse(PlayerDetailResponse, HttpStatus.OK, 'Player detail.', 'Player detail.')
  async getById(@Param('id') id: string): Promise<ApiResponse<PlayerDetailResponse>> {
    const [player] = await this.db.db
      .select({
        id: players.id,
        externalId: players.externalId,
        firstName: players.firstName,
        lastName: players.lastName,
        displayName: players.displayName,
        position: players.position,
        jersey: players.jersey,
        height: players.height,
        weight: players.weight,
        college: players.college,
        country: players.country,
        draftYear: players.draftYear,
        draftRound: players.draftRound,
        draftPick: players.draftPick,
        careerFrom: players.careerFrom,
        careerTo: players.careerTo,
        teamId: players.teamId,
        teamAbbr: players.teamAbbr,
      })
      .from(players)
      .where(eq(players.id, id))
      .limit(1);

    if (!player) {
      return response<PlayerDetailResponse>(true, 'Player not found.', null);
    }

    const teamRows = await this.loadTeamRows();

    type TeamRow = (typeof teamRows)[number];
    const toTeam = (row: TeamRow | undefined): PlayerTeamResponse | null =>
      row
        ? {
            externalId: Number(row.externalId),
            abbreviation: row.abbreviation,
            teamName: row.teamName,
            fullName: row.fullName,
            city: row.city,
            conference: row.conference,
            division: row.division,
            logoUrl: row.logoUrl ?? '',
            arena: row.arena ?? '',
            headCoach: row.headCoach ?? '',
            primaryColor: row.primaryColor ?? '',
          }
        : null;

    const teamById = new Map(teamRows.map((row) => [row.externalId, row]));
    const teamByAbbr = new Map(teamRows.map((row) => [row.abbreviation, row]));
    const teamForId = (teamId: number | null) =>
      teamId == null ? undefined : teamById.get(String(teamId));

    const playerTeam =
      teamForId(player.teamId) ?? (player.teamAbbr ? teamByAbbr.get(player.teamAbbr) : undefined);

    const seasonRows = await this.db.db
      .select({
        season: playerSeasonStats.season,
        statsTimeframe: playerSeasonStats.statsTimeframe,
        gp: playerSeasonStats.gp,
        wins: playerSeasonStats.wins,
        losses: playerSeasonStats.losses,
        points: playerSeasonStats.ptsPerGame,
        rebounds: playerSeasonStats.rebPerGame,
        assists: playerSeasonStats.astPerGame,
        steals: playerSeasonStats.stlPerGame,
        blocks: playerSeasonStats.blkPerGame,
        fgPct: playerSeasonStats.fgPct,
        fg3Pct: playerSeasonStats.fg3Pct,
        ftPct: playerSeasonStats.ftPct,
        pointsTotal: playerSeasonStats.ptsTotal,
        reboundsTotal: playerSeasonStats.rebTotal,
        assistsTotal: playerSeasonStats.astTotal,
        stealsTotal: playerSeasonStats.stlTotal,
        blocksTotal: playerSeasonStats.blkTotal,
      })
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, player.id))
      .orderBy(desc(playerSeasonStats.season));

    const seasons: PlayerSeasonResponse[] = seasonRows.map((row) => ({
      season: row.season,
      seasonType: seasonType(row.statsTimeframe),
      gp: row.gp ?? 0,
      wins: row.wins,
      losses: row.losses,
      points: round1(row.points),
      rebounds: round1(row.rebounds),
      assists: round1(row.assists),
      steals: round1(row.steals),
      blocks: round1(row.blocks),
      fgPct: row.fgPct,
      fg3Pct: row.fg3Pct,
      ftPct: row.ftPct,
      pointsTotal: row.pointsTotal == null ? null : Math.round(row.pointsTotal),
      reboundsTotal: row.reboundsTotal == null ? null : Math.round(row.reboundsTotal),
      assistsTotal: row.assistsTotal == null ? null : Math.round(row.assistsTotal),
      stealsTotal: row.stealsTotal == null ? null : Math.round(row.stealsTotal),
      blocksTotal: row.blocksTotal == null ? null : Math.round(row.blocksTotal),
      teams: [],
    }));

    // Seasons the player spent on more than one team carry a split per team,
    // which is what the career table opens up.
    const splitRows = await this.db.db
      .select({
        season: playerSeasonTeamStats.season,
        statsTimeframe: playerSeasonTeamStats.statsTimeframe,
        teamAbbr: playerSeasonTeamStats.teamAbbr,
        gp: playerSeasonTeamStats.gp,
        wins: playerSeasonTeamStats.wins,
        losses: playerSeasonTeamStats.losses,
        points: playerSeasonTeamStats.ptsPerGame,
        rebounds: playerSeasonTeamStats.rebPerGame,
        assists: playerSeasonTeamStats.astPerGame,
        steals: playerSeasonTeamStats.stlPerGame,
        blocks: playerSeasonTeamStats.blkPerGame,
        fgPct: playerSeasonTeamStats.fgPct,
        fg3Pct: playerSeasonTeamStats.fg3Pct,
        ftPct: playerSeasonTeamStats.ftPct,
        pointsTotal: playerSeasonTeamStats.ptsTotal,
        reboundsTotal: playerSeasonTeamStats.rebTotal,
        assistsTotal: playerSeasonTeamStats.astTotal,
        stealsTotal: playerSeasonTeamStats.stlTotal,
        blocksTotal: playerSeasonTeamStats.blkTotal,
      })
      .from(playerSeasonTeamStats)
      .where(eq(playerSeasonTeamStats.playerId, player.id))
      .orderBy(desc(playerSeasonTeamStats.gp), asc(playerSeasonTeamStats.teamAbbr));

    // Keyed by season and type, which is what identifies a row to the client.
    const seasonByKey = new Map(
      seasons.map((season) => [`${season.season}|${season.seasonType}`, season]),
    );
    for (const row of splitRows) {
      const season = seasonByKey.get(`${row.season}|${seasonType(row.statsTimeframe)}`);
      if (!season) continue;
      // The feed reports the same abbreviations the teams table uses (BKN for
      // Brooklyn), so a direct lookup resolves the split's identity. A split
      // whose team is unknown still renders, just without a name or logo.
      const team = teamByAbbr.get(row.teamAbbr);
      season.teams.push({
        teamAbbr: row.teamAbbr,
        teamName: team?.fullName ?? '',
        logoUrl: team?.logoUrl ?? '',
        primaryColor: team?.primaryColor ?? '',
        gp: row.gp ?? 0,
        wins: row.wins,
        losses: row.losses,
        points: round1(row.points),
        rebounds: round1(row.rebounds),
        assists: round1(row.assists),
        steals: round1(row.steals),
        blocks: round1(row.blocks),
        fgPct: row.fgPct,
        fg3Pct: row.fg3Pct,
        ftPct: row.ftPct,
        pointsTotal: row.pointsTotal == null ? null : Math.round(row.pointsTotal),
        reboundsTotal: row.reboundsTotal == null ? null : Math.round(row.reboundsTotal),
        assistsTotal: row.assistsTotal == null ? null : Math.round(row.assistsTotal),
        stealsTotal: row.stealsTotal == null ? null : Math.round(row.stealsTotal),
        blocksTotal: row.blocksTotal == null ? null : Math.round(row.blocksTotal),
      });
    }

    // `seasons` is newest first, so the first regular-season row is the latest
    // one the player has on file — used when the current season has no row yet.
    const regularSeasons = seasons.filter((s) => s.seasonType === 'regular');
    const currentSeason =
      regularSeasons.find((s) => s.season === CURRENT_SEASON) ?? regularSeasons[0] ?? null;

    // The player's own tricode comes from the same feed as the schedule's, so
    // this matches directly where the teams table would need the id.
    const tricode = player.teamAbbr;
    const nextRows = tricode
      ? await this.db.db
          .select({
            id: scheduleGames.gameId,
            homeTricode: scheduleGames.homeTeamTricode,
            awayTricode: scheduleGames.awayTeamTricode,
            homeTeamId: scheduleGames.homeTeamId,
            awayTeamId: scheduleGames.awayTeamId,
            gameDateTime: scheduleGames.gameDateTimeUTC,
            arenaName: scheduleGames.arenaName,
            arenaCity: scheduleGames.arenaCity,
          })
          .from(scheduleGames)
          .where(
            and(
              eq(scheduleGames.gameStatus, 1),
              gte(scheduleGames.gameDateTimeUTC, new Date()),
              notInArray(scheduleGames.gameLabel, EXCLUDED_GAME_LABELS),
              or(
                eq(scheduleGames.homeTeamTricode, tricode),
                eq(scheduleGames.awayTeamTricode, tricode),
              ),
            ),
          )
          .orderBy(asc(scheduleGames.gameDateTimeUTC))
          .limit(1)
      : [];

    const next = nextRows[0];
    // The schedule carries the same tricode the player row does, so the side
    // check does not depend on the teams table's own tricode convention.
    const isHome = next?.homeTricode === tricode;
    const opponent = next ? teamForId(isHome ? next.awayTeamId : next.homeTeamId) : undefined;
    const nextGame: PlayerNextGameResponse | null = next
      ? {
          id: next.id,
          gameDateTime: next.gameDateTime?.toISOString() ?? '',
          isHome,
          opponentTricode: opponent?.abbreviation ?? (isHome ? next.awayTricode : next.homeTricode),
          opponentName: opponent?.fullName ?? '',
          opponentLogoUrl: opponent?.logoUrl ?? '',
          arenaName: next.arenaName,
          arenaCity: next.arenaCity,
        }
      : null;

    return response(true, 'Player fetched.', {
      id: player.id,
      externalId: player.externalId,
      name: player.displayName ?? `${player.firstName} ${player.lastName}`.trim(),
      firstName: player.firstName,
      lastName: player.lastName,
      position: player.position,
      jersey: player.jersey,
      height: player.height,
      weight: player.weight,
      college: player.college,
      country: player.country,
      draftYear: player.draftYear,
      draftRound: player.draftRound,
      draftPick: player.draftPick,
      careerFrom: player.careerFrom,
      careerTo: player.careerTo,
      // The hero renders this at ~200px wide, so ask the CDN for the large crop
      // rather than the 260x190 thumbnail the list endpoints use.
      headshotUrl: `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.externalId}.png`,
      team: toTeam(playerTeam),
      currentSeason,
      seasons,
      nextGame,
    });
  }
}

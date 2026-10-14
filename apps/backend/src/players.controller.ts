import { BadRequestException, Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import {
  players,
  playerSeasonStats,
  playerSeasonTeamStats,
  playerGameShotZones,
  teams,
  scheduleDays,
  scheduleGames,
  scheduleBoxscorePlayers,
} from '@iknoball/database';
import { SHOT_ZONE_IDS } from '@iknoball/shot-zones';
import { and, asc, count, desc, eq, gte, notInArray, or, sql, sum } from 'drizzle-orm';

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
const MINUTES_PLAYED = sql`${scheduleBoxscorePlayers.minutes} is not null and ${scheduleBoxscorePlayers.minutes} !~ ${ZERO_MINUTES_PATTERN}`;
const EXCLUDED_GAME_LABELS = ['All-Star', 'All-Star Championship'];
/** The season the page leads with, matching the other player endpoints. */
const CURRENT_SEASON = process.env.NBA_CURRENT_SEASON ?? '2025-26';
/**
 * The season types the shot-zone endpoint accepts, mapped to the timeframe the
 * refresh writes. Anything unrecognised falls back to the regular season, so a
 * typo in a query string cannot silently return the playoffs.
 */
const SHOT_ZONE_TIMEFRAMES: Readonly<Record<string, string>> = {
  regular: 'ByYear-regular',
  playoffs: 'ByYear-playoffs',
  preseason: 'ByYear-preseason',
};

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

/** The feed's `statsTimeframe` values as the season type the client renders. */
function seasonType(timeframe: string | null): string {
  if (timeframe === 'ByYear-playoffs') return 'playoffs';
  if (timeframe === 'ByYear-preseason') return 'preseason';
  return 'regular';
}

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

/**
 * The season a player's page leads with: the current season when they have a row
 * for it, otherwise the most recent one they do. Used by the detail endpoint, so
 * the hero's averages and the career table agree on which year is current.
 */
function leadSeason(seasonsNewestFirst: readonly string[], current: string): string {
  return seasonsNewestFirst.includes(current) ? current : (seasonsNewestFirst[0] ?? current);
}

/**
 * The order season types are listed in within a season, most significant first.
 * Not alphabetical: a reader looking for a season's numbers wants the regular
 * season, not the preseason.
 */
const SEASON_TYPE_ORDER: readonly string[] = ['regular', 'playoffs', 'preseason'];

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

  @ApiProperty({ example: 'regular', enum: ['regular', 'playoffs', 'preseason'] })
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

class PlayerShotZoneEntryResponse {
  @ApiProperty({
    example: 'topOfKeyThree',
    description: 'Zone id, from the shared shot-zone taxonomy.',
  })
  zoneId!: string;

  @ApiProperty({ example: 135, description: 'Attempts from the zone.' })
  fga!: number;

  @ApiProperty({ example: 40, description: 'Makes from the zone.' })
  fgm!: number;

  @ApiProperty({ example: 29.6, nullable: true, description: 'Null with no attempts.' })
  fgPct!: number | null;
}

class PlayerShotZoneOptionResponse {
  @ApiProperty({ example: '2025-26' })
  season!: string;

  @ApiProperty({ example: 'playoffs', description: 'regular | playoffs | preseason' })
  seasonType!: string;

  @ApiProperty({ example: 379, description: 'Attempts this player took in that season and type.' })
  fga!: number;

  @ApiProperty({
    example: 18,
    nullable: true,
    description: 'Games played, from the same season row the career table reads.',
  })
  gp!: number | null;
}

class PlayerShotZonesResponse {
  @ApiProperty({ example: '2025-26' })
  season!: string;

  @ApiProperty({ example: 'regular', description: 'regular | playoffs | preseason' })
  seasonType!: string;

  @ApiProperty({
    type: [PlayerShotZoneOptionResponse],
    description:
      'Every season and season type this player has attempts in, newest season first. What the picker lists.',
  })
  available!: PlayerShotZoneOptionResponse[];

  @ApiProperty({ example: 1403 })
  totalFga!: number;

  @ApiProperty({ example: 678 })
  totalFgm!: number;

  @ApiProperty({ example: 48.3, nullable: true })
  fgPct!: number | null;

  @ApiProperty({
    type: [PlayerShotZoneEntryResponse],
    description: 'Every zone, in taxonomy order, including any with no attempts.',
  })
  zones!: PlayerShotZoneEntryResponse[];
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
  @ApiProperty({ example: '2026-27', description: 'The season every page of this log covers.' })
  season!: string;

  @ApiProperty({
    example: 115,
    description: 'Games the player appeared in that season.',
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
   * A player's games in one season: finals only, and only the side the player
   * actually turned out for, so `isHome` — and therefore the result — is definite
   * for a player who has been traded, whose box-score rows carry the team they
   * played for that night. Rows without minutes are games the feed listed them as
   * not playing in.
   */
  private gameLogWhere(playerId: string, season: string) {
    return and(
      eq(scheduleBoxscorePlayers.playerId, playerId),
      eq(scheduleGames.gameStatus, 3),
      eq(scheduleDays.seasonYear, season),
      MINUTES_PLAYED,
    );
  }

  @Get(':id/shot-zones')
  @ApiOperation({ summary: "A player's shooting by shot zone, for one season and season type" })
  @ApiDataResponse(PlayerShotZonesResponse, HttpStatus.OK, 'Shot zones.', 'Shot zones.')
  async getShotZones(
    @Param('id') id: string,
    @Query('seasonType') seasonTypeParam?: string,
    @Query('season') seasonParam?: string,
  ): Promise<ApiResponse<PlayerShotZonesResponse>> {
    const [player] = await this.db.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, id))
      .limit(1);

    if (!player) {
      return response<PlayerShotZonesResponse>(true, 'Player not found.', null);
    }

    // Every season and season type this player has attempts in, which is what the
    // client's picker lists. It spans seasons, not just the one being shown,
    // because choosing a year is the point of the picker.
    const availableRows = await this.db.db
      .select({
        season: playerGameShotZones.season,
        statsTimeframe: playerGameShotZones.statsTimeframe,
        fga: sum(playerGameShotZones.fga),
      })
      .from(playerGameShotZones)
      .where(eq(playerGameShotZones.playerId, player.id))
      .groupBy(playerGameShotZones.season, playerGameShotZones.statsTimeframe);

    // Games played comes from the same per-season rows the career table reads, so
    // the two cannot disagree: counting games out of the shot-zone table would
    // instead be capped by however much of the schedule has been seeded, and
    // would miss a game a player appeared in without shooting.
    const gpRows = await this.db.db
      .select({
        season: playerSeasonStats.season,
        statsTimeframe: playerSeasonStats.statsTimeframe,
        gp: playerSeasonStats.gp,
      })
      .from(playerSeasonStats)
      .where(eq(playerSeasonStats.playerId, player.id));
    const gpFor = new Map(gpRows.map((row) => [`${row.season}:${row.statsTimeframe}`, row.gp]));

    const available = availableRows
      .map((row) => ({
        season: row.season,
        seasonType: seasonType(row.statsTimeframe),
        fga: Number(row.fga ?? 0),
        gp: gpFor.get(`${row.season}:${row.statsTimeframe}`) ?? null,
      }))
      .filter((entry) => entry.fga > 0)
      .sort(
        (a, b) =>
          // Newest season first, and within a season the types in the order a
          // reader expects rather than alphabetically.
          b.season.localeCompare(a.season) ||
          SEASON_TYPE_ORDER.indexOf(a.seasonType) - SEASON_TYPE_ORDER.indexOf(b.seasonType),
      );

    if (!available.length) {
      // Nothing at all for this player means the sync has not covered them, which
      // is not the same as a player who took no shots. Null lets the client say
      // "not yet" instead of drawing a chart of nothing.
      return response<PlayerShotZonesResponse>(
        true,
        'No shot-zone breakdown for this player yet.',
        null,
      );
    }

    // The season and type to answer for, resolved against what the player
    // actually has rather than trusted as given, so a partial request lands on
    // real data instead of an empty chart:
    //
    //   both named  - the season if it is on file, otherwise the newest, and the
    //                 type as asked. A season the player has no data in is a
    //                 typo, so it falls back; a type with nothing in a season
    //                 they did play is a real answer, and reads as zeroes.
    //   season only - that season's leading type.
    //   type only   - the newest season holding that type, so asking for the
    //                 regular season is not answered from a year with only a
    //                 preseason.
    //   neither     - the player's flagship sample, below.
    const requestedType = SHOT_ZONE_TIMEFRAMES[seasonTypeParam ?? '']
      ? seasonType(SHOT_ZONE_TIMEFRAMES[seasonTypeParam!])
      : undefined;

    // What a reader sees before choosing anything. The current season's regular
    // season when there is one, otherwise the newest season that has one, and
    // otherwise whatever there is. Deliberately not simply the newest season:
    // in October that is a handful of preseason attempts, which draws a mostly
    // empty chart and reads as a broken page rather than a quiet one.
    const flagship =
      available.find(
        (entry) => entry.season === CURRENT_SEASON && entry.seasonType === 'regular',
      ) ??
      // `available` is newest season first, so this is the newest regular season.
      available.find((entry) => entry.seasonType === 'regular') ??
      available[0];

    const seasonOnFile = available.some((entry) => entry.season === seasonParam);
    let chosen: { season: string; seasonType: string };
    if (seasonParam && requestedType) {
      chosen = {
        season: seasonOnFile ? seasonParam : available[0].season,
        seasonType: requestedType,
      };
    } else if (seasonParam) {
      chosen = available.find((entry) => entry.season === seasonParam) ?? {
        season: available[0].season,
        seasonType: available[0].seasonType,
      };
    } else if (requestedType) {
      chosen = available.find((entry) => entry.seasonType === requestedType) ?? {
        season: available[0].season,
        seasonType: requestedType,
      };
    } else {
      chosen = flagship;
    }

    const season = chosen.season;
    const statsTimeframe = SHOT_ZONE_TIMEFRAMES[chosen.seasonType] ?? SHOT_ZONE_TIMEFRAMES.regular;

    const rows = await this.db.db
      .select({
        zoneId: playerGameShotZones.zoneId,
        fga: sum(playerGameShotZones.fga),
        fgm: sum(playerGameShotZones.fgm),
      })
      .from(playerGameShotZones)
      .where(
        and(
          eq(playerGameShotZones.playerId, player.id),
          eq(playerGameShotZones.season, season),
          eq(playerGameShotZones.statsTimeframe, statsTimeframe),
        ),
      )
      .groupBy(playerGameShotZones.zoneId);

    const byZone = new Map(rows.map((row) => [row.zoneId, row]));
    // Emitted in taxonomy order, with a zeroed entry for any zone missing a row,
    // so the client always receives the full partition and never has to reason
    // about which zones are absent. `sum()` comes back from pg as a bigint
    // string, so each total is coerced on the way out.
    const zones = SHOT_ZONE_IDS.map((zoneId) => {
      const row = byZone.get(zoneId);
      const fga = Number(row?.fga ?? 0);
      const fgm = Number(row?.fgm ?? 0);
      return {
        zoneId,
        fga,
        fgm,
        fgPct: fga > 0 ? round1((fgm / fga) * 100) : null,
      };
    });

    const totalFga = zones.reduce((sum, zone) => sum + zone.fga, 0);
    const totalFgm = zones.reduce((sum, zone) => sum + zone.fgm, 0);

    return response(true, 'Shot zones fetched.', {
      season,
      seasonType: chosen.seasonType,
      available,
      totalFga,
      totalFgm,
      fgPct: totalFga > 0 ? round1((totalFgm / totalFga) * 100) : null,
      zones,
    });
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
    // The log covers the season the page leads with. A player's earlier seasons
    // are the career table's job, and mixing them here reads as one long run.
    const where = this.gameLogWhere(player.id, CURRENT_SEASON);

    const [counted] = await this.db.db
      .select({ total: count() })
      .from(scheduleBoxscorePlayers)
      .innerJoin(scheduleGames, GAME_LOG_JOIN)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
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
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
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
      season: CURRENT_SEASON,
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
      regularSeasons.find(
        (s) =>
          s.season ===
          leadSeason(
            regularSeasons.map((r) => r.season),
            CURRENT_SEASON,
          ),
      ) ?? null;

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

import {
  players,
  scheduleBoxscorePlayers,
  scheduleBoxscoreSummaries,
  scheduleBoxscoreTeams,
  scheduleDays,
  scheduleGames,
} from '@iknoball/database';
import { and, eq, gte, inArray, or } from 'drizzle-orm';
import { Injectable, Logger } from '@nestjs/common';
import {
  NbaBoxScoreClient,
  BoxScoreTraditionalResponse,
  BoxScoreSummaryResponse,
} from './nba-boxscore.client';
import {
  NbaCdnBoxScoreClient,
  CdnBoxScoreResponse,
  CdnPlayerStats,
} from './nba-cdn-boxscore.client';
import { DatabaseService } from './database.service';
import { RedisService } from './redis.service';

type BoxScorePlayerStats = {
  minutes: string;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  fieldGoalsPercentage: number;
  threePointersMade: number;
  threePointersAttempted: number;
  threePointersPercentage: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  freeThrowsPercentage: number;
  reboundsOffensive: number;
  reboundsDefensive: number;
  reboundsTotal: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  foulsPersonal: number;
  points: number;
  plusMinusPoints: number;
} | null;

@Injectable()
export class BoxscoreCrawlerService {
  private readonly logger = new Logger(BoxscoreCrawlerService.name);
  private readonly concurrency = 1;
  private readonly delayMs = 1000;

  constructor(
    private readonly boxscoreClient: NbaBoxScoreClient,
    private readonly cdnBoxscoreClient: NbaCdnBoxScoreClient,
    private readonly database: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async crawlSeasonBoxscores() {
    const season = process.env.NBA_CURRENT_SEASON || '';
    if (!season) {
      throw new Error('NBA_CURRENT_SEASON is required');
    }

    const games = await this.database.db
      .select({ id: scheduleGames.id, gameId: scheduleGames.gameId })
      .from(scheduleGames)
      .innerJoin(scheduleDays, eq(scheduleGames.scheduleDayId, scheduleDays.id))
      .where(and(eq(scheduleDays.seasonYear, season), gte(scheduleGames.gameStatus, 2)))
      .orderBy(scheduleGames.gameDate);

    this.logger.log(`boxscore crawl start season=${season} games=${games.length}`);

    const queue = [...games];
    let processed = 0;

    const workers = Array.from({ length: this.concurrency }, async () => {
      while (queue.length) {
        const game = queue.shift();
        if (!game) {
          return;
        }
        try {
          await this.syncGameBoxscore(game.id, game.gameId);
          processed += 1;
          this.logger.log(`done get ${processed}/${games.length} games`);
        } catch (error) {
          this.logger.error(`boxscore crawl failed game=${game.gameId}`, error as Error);
        }
        if (this.delayMs > 0) {
          await this.sleep(this.delayMs);
        }
      }
    });

    await Promise.all(workers);
    this.logger.log(`boxscore crawl done games=${processed}`);
  }

  async syncGameBoxscoreLive(gameId: string, ttlSeconds: number) {
    const [scheduleGame] = await this.database.db
      .select({ id: scheduleGames.id })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, gameId));
    if (!scheduleGame) {
      this.logger.warn(`live boxscore skip missing schedule game=${gameId}`);
      return null;
    }
    try {
      return await this.syncGameBoxscore(scheduleGame.id, gameId, ttlSeconds);
    } catch (error) {
      this.logger.error(`live boxscore failed game=${gameId}`, error as Error);
      return null;
    }
  }

  async syncGameBoxscore(scheduleGameId: string, gameId: string, ttlSeconds?: number) {
    const { traditional, summary } = await this.fetchGameBoxscore(gameId);

    await this.upsertSummary(scheduleGameId, summary);
    await this.upsertTeams(scheduleGameId, traditional);
    await this.upsertPlayers(scheduleGameId, gameId, traditional);

    await this.database.db
      .update(scheduleGames)
      .set({
        gameStatus: summary.boxScoreSummary.gameStatus,
        gameStatusText: summary.boxScoreSummary.gameStatusText,
        gameCode: summary.boxScoreSummary.gameCode,
      })
      .where(eq(scheduleGames.id, scheduleGameId));

    if (summary.boxScoreSummary.gameStatus === 3) {
      await this.updateSeriesTextForSeries(gameId);
    }

    await this.writeRedis(
      gameId,
      {
        boxScoreTraditional: this.pickTraditional(traditional),
        boxScoreSummary: this.pickSummary(summary),
      },
      ttlSeconds,
    );

    return summary.boxScoreSummary.gameStatus ?? null;
  }

  private async updateSeriesTextForSeries(gameId: string) {
    const [game] = await this.database.db
      .select({
        gameLabel: scheduleGames.gameLabel,
        homeTeamId: scheduleGames.homeTeamId,
        awayTeamId: scheduleGames.awayTeamId,
        seriesText: scheduleGames.seriesText,
        seriesGameNumber: scheduleGames.seriesGameNumber,
      })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, gameId));

    if (!game || !game.gameLabel || !game.homeTeamId || !game.awayTeamId) {
      return;
    }

    let seriesText = game.seriesText;
    try {
      const boxscoreSummary = await this.boxscoreClient.fetchBoxScoreSummary(gameId);
      const apiSeriesText = boxscoreSummary.boxScoreSummary.seriesText;
      if (apiSeriesText) {
        seriesText = apiSeriesText;
      }
    } catch (error) {
      this.logger.warn(`seriesText fetch failed game=${gameId}, using DB value`);
    }

    if (!seriesText) {
      return;
    }

    const currentNum = parseInt(game.seriesGameNumber?.replace(/\D/g, '') ?? '', 10);
    const hasNum = !isNaN(currentNum);

    const allSeriesGames = await this.database.db
      .select({
        id: scheduleGames.id,
        gameId: scheduleGames.gameId,
        seriesGameNumber: scheduleGames.seriesGameNumber,
      })
      .from(scheduleGames)
      .where(and(
        eq(scheduleGames.gameLabel, game.gameLabel),
        or(
          and(eq(scheduleGames.homeTeamId, game.homeTeamId), eq(scheduleGames.awayTeamId, game.awayTeamId)),
          and(eq(scheduleGames.homeTeamId, game.awayTeamId), eq(scheduleGames.awayTeamId, game.homeTeamId)),
        ),
      ));

    const toUpdate = allSeriesGames.filter((g) => {
      if (g.gameId === gameId) return false;
      if (!hasNum) return true;
      const gn = parseInt(g.seriesGameNumber?.replace(/\D/g, '') ?? '', 10);
      if (isNaN(gn)) return true;
      return gn > currentNum;
    });

    if (toUpdate.length === 0) {
      return;
    }

    const ids = toUpdate.map((g) => g.id);

    await this.database.db
      .update(scheduleGames)
      .set({ seriesText })
      .where(inArray(scheduleGames.id, ids));

    await this.database.db
      .update(scheduleBoxscoreSummaries)
      .set({ seriesText })
      .where(inArray(scheduleBoxscoreSummaries.scheduleGameId, ids));
  }

  private async fetchGameBoxscore(gameId: string) {
    const cdnResponse = await this.cdnBoxscoreClient.fetchLiveBoxScore(gameId);
    return this.cdnToStatsFormat(cdnResponse);
  }

  private cdnToStatsFormat(cdn: CdnBoxScoreResponse): {
    traditional: BoxScoreTraditionalResponse;
    summary: BoxScoreSummaryResponse;
  } {
    const game = cdn.game;
    const mapTeam = (side: 'home' | 'away') => {
      const team = side === 'home' ? game.homeTeam : game.awayTeam;
      return {
        teamId: team.teamId,
        players: team.players.map((p) => ({
          personId: p.personId,
          firstName: p.firstName,
          familyName: p.familyName,
          nameI: p.nameI,
          playerSlug: '',
          position: p.position,
          jerseyNum: p.jerseyNum,
          statistics: p.statistics
            ? {
                minutes: p.statistics.minutesCalculated || p.statistics.minutes,
                fieldGoalsMade: p.statistics.fieldGoalsMade,
                fieldGoalsAttempted: p.statistics.fieldGoalsAttempted,
                fieldGoalsPercentage: p.statistics.fieldGoalsPercentage,
                threePointersMade: p.statistics.threePointersMade,
                threePointersAttempted: p.statistics.threePointersAttempted,
                threePointersPercentage: p.statistics.threePointersPercentage,
                freeThrowsMade: p.statistics.freeThrowsMade,
                freeThrowsAttempted: p.statistics.freeThrowsAttempted,
                freeThrowsPercentage: p.statistics.freeThrowsPercentage,
                reboundsOffensive: p.statistics.reboundsOffensive,
                reboundsDefensive: p.statistics.reboundsDefensive,
                reboundsTotal: p.statistics.reboundsTotal,
                assists: p.statistics.assists,
                steals: p.statistics.steals,
                blocks: p.statistics.blocks,
                turnovers: p.statistics.turnovers,
                foulsPersonal: p.statistics.foulsPersonal,
                points: p.statistics.points,
                plusMinusPoints: p.statistics.plusMinusPoints,
              }
            : {
                minutes: 'PT00M00.00S',
                fieldGoalsMade: 0,
                fieldGoalsAttempted: 0,
                fieldGoalsPercentage: 0,
                threePointersMade: 0,
                threePointersAttempted: 0,
                threePointersPercentage: 0,
                freeThrowsMade: 0,
                freeThrowsAttempted: 0,
                freeThrowsPercentage: 0,
                reboundsOffensive: 0,
                reboundsDefensive: 0,
                reboundsTotal: 0,
                assists: 0,
                steals: 0,
                blocks: 0,
                turnovers: 0,
                foulsPersonal: 0,
                points: 0,
                plusMinusPoints: 0,
              },
        })),
        statistics: {
          minutes: String(team.statistics.minutes ?? ''),
          fieldGoalsMade: Number(team.statistics.fieldGoalsMade ?? 0),
          fieldGoalsAttempted: Number(team.statistics.fieldGoalsAttempted ?? 0),
          fieldGoalsPercentage: Number(team.statistics.fieldGoalsPercentage ?? 0),
          threePointersMade: Number(team.statistics.threePointersMade ?? 0),
          threePointersAttempted: Number(team.statistics.threePointersAttempted ?? 0),
          threePointersPercentage: Number(team.statistics.threePointersPercentage ?? 0),
          freeThrowsMade: Number(team.statistics.freeThrowsMade ?? 0),
          freeThrowsAttempted: Number(team.statistics.freeThrowsAttempted ?? 0),
          freeThrowsPercentage: Number(team.statistics.freeThrowsPercentage ?? 0),
          reboundsOffensive: Number(team.statistics.reboundsOffensive ?? 0),
          reboundsDefensive: Number(team.statistics.reboundsDefensive ?? 0),
          reboundsTotal: Number(team.statistics.reboundsTotal ?? 0),
          assists: Number(team.statistics.assists ?? 0),
          steals: Number(team.statistics.steals ?? 0),
          blocks: Number(team.statistics.blocks ?? 0),
          turnovers: Number(team.statistics.turnovers ?? 0),
          foulsPersonal: Number(team.statistics.foulsPersonal ?? 0),
          points: Number(team.statistics.points ?? 0),
          plusMinusPoints: Number(team.statistics.plusMinusPoints ?? 0),
        },
      };
    };

    const traditional: BoxScoreTraditionalResponse = {
      meta: { version: cdn.meta.version, request: cdn.meta.request, time: cdn.meta.time },
      boxScoreTraditional: {
        gameId: game.gameId,
        awayTeamId: game.awayTeam.teamId,
        homeTeamId: game.homeTeam.teamId,
        homeTeam: mapTeam('home'),
        awayTeam: mapTeam('away'),
      },
    };

    const summary: BoxScoreSummaryResponse = {
      meta: { version: cdn.meta.version, request: cdn.meta.request, time: cdn.meta.time },
      boxScoreSummary: {
        gameId: game.gameId,
        gameCode: game.gameCode,
        gameStatus: game.gameStatus,
        gameStatusText: game.gameStatusText,
        period: game.period,
        gameClock: game.gameClock,
        gameTimeUTC: game.gameTimeUTC,
        gameEt: game.gameEt,
        awayTeamId: game.awayTeam.teamId,
        homeTeamId: game.homeTeam.teamId,
        duration: String(game.duration),
        attendance: game.attendance,
        sellout: Number(game.sellout),
        seriesGameNumber: '',
        gameLabel: '',
        gameSubLabel: '',
        seriesText: '',
        ifNecessary: false,
        isNeutral: false,
        arena: { ...game.arena, arenaStreetAddress: '', arenaPostalCode: '' },
        homeTeam: {
          teamId: game.homeTeam.teamId,
          teamName: game.homeTeam.teamName,
          teamCity: game.homeTeam.teamCity,
          teamTricode: game.homeTeam.teamTricode,
          teamSlug: '',
          teamWins: 0,
          teamLosses: 0,
          score: game.homeTeam.score,
          inBonus: game.homeTeam.inBonus,
          timeoutsRemaining: game.homeTeam.timeoutsRemaining,
          seed: 0,
          periods: game.homeTeam.periods,
          players: game.homeTeam.players.map((p) => ({
            personId: p.personId,
            name: p.name,
            nameI: p.nameI,
            firstName: p.firstName,
            familyName: p.familyName,
            jerseyNum: p.jerseyNum,
          })),
          inactives: [],
        },
        awayTeam: {
          teamId: game.awayTeam.teamId,
          teamName: game.awayTeam.teamName,
          teamCity: game.awayTeam.teamCity,
          teamTricode: game.awayTeam.teamTricode,
          teamSlug: '',
          teamWins: 0,
          teamLosses: 0,
          score: game.awayTeam.score,
          inBonus: game.awayTeam.inBonus,
          timeoutsRemaining: game.awayTeam.timeoutsRemaining,
          seed: 0,
          statistics: { dummyKey: '' },
          periods: game.awayTeam.periods,
          players: game.awayTeam.players.map((p) => ({
            personId: p.personId,
            name: p.name,
            nameI: p.nameI,
            firstName: p.firstName,
            familyName: p.familyName,
            jerseyNum: p.jerseyNum,
          })),
          inactives: [],
        },
        lastFiveMeetings: { meetings: [] },
        pregameCharts: {
          homeTeam: { teamId: 0, teamCity: '', teamName: '', teamTricode: '', statistics: {} },
          awayTeam: { teamId: 0, teamCity: '', teamName: '', teamTricode: '', statistics: {} },
        },
        postgameCharts: {
          homeTeam: { teamId: 0, teamCity: '', teamName: '', teamTricode: '', statistics: {} },
          awayTeam: { teamId: 0, teamCity: '', teamName: '', teamTricode: '', statistics: {} },
        },
        videoAvailableFlag: 0,
        ptAvailable: 0,
        ptXYZAvailable: 0,
        whStatus: 0,
        hustleStatus: 0,
        historicalStatus: 0,
        gameSubtype: '',
      },
    };

    return { traditional, summary };
  }

  private pickTraditional(
    response: Awaited<ReturnType<NbaBoxScoreClient['fetchBoxScoreTraditional']>>,
  ) {
    const norm = (s: { minutes: string } | null) => {
      if (!s)
        return {
          minutes: 'PT00M00.00S',
          fieldGoalsMade: 0,
          fieldGoalsAttempted: 0,
          fieldGoalsPercentage: 0,
          threePointersMade: 0,
          threePointersAttempted: 0,
          threePointersPercentage: 0,
          freeThrowsMade: 0,
          freeThrowsAttempted: 0,
          freeThrowsPercentage: 0,
          reboundsOffensive: 0,
          reboundsDefensive: 0,
          reboundsTotal: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          foulsPersonal: 0,
          points: 0,
          plusMinusPoints: 0,
        };
      if (!s.minutes) s.minutes = 'PT00M00.00S';
      return s;
    };
    return {
      gameId: response.boxScoreTraditional.gameId,
      homeTeam: {
        players: response.boxScoreTraditional.homeTeam.players.map((player) => ({
          personId: player.personId,
          statistics: norm(player.statistics),
        })),
        statistics: response.boxScoreTraditional.homeTeam.statistics,
      },
      awayTeam: {
        players: response.boxScoreTraditional.awayTeam.players.map((player) => ({
          personId: player.personId,
          statistics: norm(player.statistics),
        })),
        statistics: response.boxScoreTraditional.awayTeam.statistics,
      },
    };
  }

  private pickSummary(response: Awaited<ReturnType<NbaBoxScoreClient['fetchBoxScoreSummary']>>) {
    const summary = response.boxScoreSummary;
    return {
      gameId: summary.gameId,
      gameCode: summary.gameCode,
      gameStatus: summary.gameStatus,
      gameStatusText: summary.gameStatusText,
      period: summary.period,
      gameClock: summary.gameClock,
      gameTimeUTC: summary.gameTimeUTC,
      gameEt: summary.gameEt,
      awayTeamId: summary.awayTeamId,
      homeTeamId: summary.homeTeamId,
      duration: summary.duration,
      attendance: summary.attendance,
      sellout: summary.sellout,
      seriesGameNumber: summary.seriesGameNumber,
      gameLabel: summary.gameLabel,
      gameSubLabel: summary.gameSubLabel,
      seriesText: summary.seriesText,
      ifNecessary: summary.ifNecessary,
      isNeutral: summary.isNeutral,
      arena: summary.arena,
      homeTeam: {
        teamId: summary.homeTeam.teamId,
        teamName: summary.homeTeam.teamName,
        teamCity: summary.homeTeam.teamCity,
        teamTricode: summary.homeTeam.teamTricode,
        teamSlug: summary.homeTeam.teamSlug,
        teamWins: summary.homeTeam.teamWins,
        teamLosses: summary.homeTeam.teamLosses,
        score: summary.homeTeam.score,
        inBonus: summary.homeTeam.inBonus,
        timeoutsRemaining: summary.homeTeam.timeoutsRemaining,
        seed: summary.homeTeam.seed,
        periods: summary.homeTeam.periods,
        players: summary.homeTeam.players,
        inactives: summary.homeTeam.inactives,
      },
      awayTeam: {
        teamId: summary.awayTeam.teamId,
        teamName: summary.awayTeam.teamName,
        teamCity: summary.awayTeam.teamCity,
        teamTricode: summary.awayTeam.teamTricode,
        teamSlug: summary.awayTeam.teamSlug,
        teamWins: summary.awayTeam.teamWins,
        teamLosses: summary.awayTeam.teamLosses,
        score: summary.awayTeam.score,
        inBonus: summary.awayTeam.inBonus,
        timeoutsRemaining: summary.awayTeam.timeoutsRemaining,
        seed: summary.awayTeam.seed,
        statistics: summary.awayTeam.statistics,
        periods: summary.awayTeam.periods,
        players: summary.awayTeam.players,
        inactives: summary.awayTeam.inactives,
      },
      lastFiveMeetings: summary.lastFiveMeetings,
      pregameCharts: summary.pregameCharts,
      postgameCharts: summary.postgameCharts,
      videoAvailableFlag: summary.videoAvailableFlag,
      ptAvailable: summary.ptAvailable,
      ptXYZAvailable: summary.ptXYZAvailable,
      whStatus: summary.whStatus,
      hustleStatus: summary.hustleStatus,
      historicalStatus: summary.historicalStatus,
      gameSubtype: summary.gameSubtype,
    };
  }

  private toJsonInput(value: unknown) {
    return value ?? null;
  }

  private async upsertSummary(
    scheduleGameId: string,
    response: Awaited<ReturnType<NbaBoxScoreClient['fetchBoxScoreSummary']>>,
  ) {
    const summary = response.boxScoreSummary;
    const create = {
        scheduleGameId,
        gameCode: summary.gameCode,
        gameStatus: summary.gameStatus,
        gameStatusText: summary.gameStatusText,
        period: summary.period,
        gameClock: summary.gameClock,
        gameTimeUTC: this.toDate(summary.gameTimeUTC),
        gameEt: this.toDate(summary.gameEt),
        duration: summary.duration,
        attendance: summary.attendance,
        sellout: summary.sellout,
        seriesGameNumber: summary.seriesGameNumber,
        gameLabel: summary.gameLabel,
        gameSubLabel: summary.gameSubLabel,
        seriesText: summary.seriesText,
        ifNecessary: summary.ifNecessary,
        isNeutral: summary.isNeutral,
        arenaId: summary.arena?.arenaId ?? null,
        arenaName: summary.arena?.arenaName ?? null,
        arenaCity: summary.arena?.arenaCity ?? null,
        arenaState: summary.arena?.arenaState ?? null,
        arenaCountry: summary.arena?.arenaCountry ?? null,
        arenaTimezone: summary.arena?.arenaTimezone ?? null,
        arenaStreet: summary.arena?.arenaStreetAddress ?? null,
        arenaPostalCode: summary.arena?.arenaPostalCode ?? null,
        homeTeamId: summary.homeTeam.teamId,
        homeScore: summary.homeTeam.score,
        homeInBonus: summary.homeTeam.inBonus,
        homeTimeouts: summary.homeTeam.timeoutsRemaining,
        homeSeed: summary.homeTeam.seed,
        homePeriods: this.toJsonInput(summary.homeTeam.periods),
        homePlayers: this.toJsonInput(summary.homeTeam.players),
        homeInactives: this.toJsonInput(summary.homeTeam.inactives),
        awayTeamId: summary.awayTeam.teamId,
        awayTeamName: summary.awayTeam.teamName,
        awayTeamCity: summary.awayTeam.teamCity,
        awayTeamTricode: summary.awayTeam.teamTricode,
        awayTeamSlug: summary.awayTeam.teamSlug,
        awayTeamWins: summary.awayTeam.teamWins,
        awayTeamLosses: summary.awayTeam.teamLosses,
        awayScore: summary.awayTeam.score,
        awayInBonus: summary.awayTeam.inBonus,
        awayTimeouts: summary.awayTeam.timeoutsRemaining,
        awaySeed: summary.awayTeam.seed,
        awayStatistics: this.toJsonInput(summary.awayTeam.statistics),
        awayPeriods: this.toJsonInput(summary.awayTeam.periods),
        awayPlayers: this.toJsonInput(summary.awayTeam.players),
        awayInactives: this.toJsonInput(summary.awayTeam.inactives),
        lastFiveMeetings: this.toJsonInput(summary.lastFiveMeetings),
        pregameCharts: this.toJsonInput(summary.pregameCharts),
        postgameCharts: this.toJsonInput(summary.postgameCharts),
      };
    const update = {
        gameCode: summary.gameCode,
        gameStatus: summary.gameStatus,
        gameStatusText: summary.gameStatusText,
        period: summary.period,
        gameClock: summary.gameClock,
        gameTimeUTC: this.toDate(summary.gameTimeUTC),
        gameEt: this.toDate(summary.gameEt),
        duration: summary.duration,
        attendance: summary.attendance,
        sellout: summary.sellout,
        seriesGameNumber: summary.seriesGameNumber,
        gameLabel: summary.gameLabel,
        gameSubLabel: summary.gameSubLabel,
        seriesText: summary.seriesText || undefined,
        ifNecessary: summary.ifNecessary,
        isNeutral: summary.isNeutral,
        arenaId: summary.arena?.arenaId ?? null,
        arenaName: summary.arena?.arenaName ?? null,
        arenaCity: summary.arena?.arenaCity ?? null,
        arenaState: summary.arena?.arenaState ?? null,
        arenaCountry: summary.arena?.arenaCountry ?? null,
        arenaTimezone: summary.arena?.arenaTimezone ?? null,
        arenaStreet: summary.arena?.arenaStreetAddress ?? null,
        arenaPostalCode: summary.arena?.arenaPostalCode ?? null,
        homeTeamId: summary.homeTeam.teamId,
        homeScore: summary.homeTeam.score,
        homeInBonus: summary.homeTeam.inBonus,
        homeTimeouts: summary.homeTeam.timeoutsRemaining,
        homeSeed: summary.homeTeam.seed,
        homePeriods: this.toJsonInput(summary.homeTeam.periods),
        homePlayers: this.toJsonInput(summary.homeTeam.players),
        homeInactives: this.toJsonInput(summary.homeTeam.inactives),
        awayTeamId: summary.awayTeam.teamId,
        awayTeamName: summary.awayTeam.teamName,
        awayTeamCity: summary.awayTeam.teamCity,
        awayTeamTricode: summary.awayTeam.teamTricode,
        awayTeamSlug: summary.awayTeam.teamSlug,
        awayTeamWins: summary.awayTeam.teamWins,
        awayTeamLosses: summary.awayTeam.teamLosses,
        awayScore: summary.awayTeam.score,
        awayInBonus: summary.awayTeam.inBonus,
        awayTimeouts: summary.awayTeam.timeoutsRemaining,
        awaySeed: summary.awayTeam.seed,
        awayStatistics: this.toJsonInput(summary.awayTeam.statistics),
        awayPeriods: this.toJsonInput(summary.awayTeam.periods),
        awayPlayers: this.toJsonInput(summary.awayTeam.players),
        awayInactives: this.toJsonInput(summary.awayTeam.inactives),
        lastFiveMeetings: this.toJsonInput(summary.lastFiveMeetings),
        pregameCharts: this.toJsonInput(summary.pregameCharts),
        postgameCharts: this.toJsonInput(summary.postgameCharts),
      };
    await this.database.db
      .insert(scheduleBoxscoreSummaries)
      .values(create)
      .onConflictDoUpdate({
        target: scheduleBoxscoreSummaries.scheduleGameId,
        set: update,
      });
  }

  private async upsertTeams(
    scheduleGameId: string,
    response: Awaited<ReturnType<NbaBoxScoreClient['fetchBoxScoreTraditional']>>,
  ) {
    const home = response.boxScoreTraditional.homeTeam;
    const away = response.boxScoreTraditional.awayTeam;

    for (const [side, team] of [['home', home], ['away', away]] as const) {
      const data = {
        scheduleGameId,
        teamExternalId: team.teamId,
        side,
        ...this.mapStats(team.statistics),
      };
      await this.database.db
        .insert(scheduleBoxscoreTeams)
        .values(data)
        .onConflictDoUpdate({
          target: [scheduleBoxscoreTeams.scheduleGameId, scheduleBoxscoreTeams.side],
          set: { teamExternalId: data.teamExternalId, ...this.mapStats(team.statistics) },
        });
    }
  }

  private async upsertPlayers(
    scheduleGameId: string,
    gameId: string,
    response: Awaited<ReturnType<NbaBoxScoreClient['fetchBoxScoreTraditional']>>,
  ) {
    const allPlayers = [
      ...response.boxScoreTraditional.homeTeam.players.map((player) => ({
        ...player,
        teamExternalId: response.boxScoreTraditional.homeTeam.teamId,
      })),
      ...response.boxScoreTraditional.awayTeam.players.map((player) => ({
        ...player,
        teamExternalId: response.boxScoreTraditional.awayTeam.teamId,
      })),
    ];

    await this.database.db
      .delete(scheduleBoxscorePlayers)
      .where(eq(scheduleBoxscorePlayers.scheduleGameId, scheduleGameId));

    const records: (typeof scheduleBoxscorePlayers.$inferInsert)[] = [];
    for (const player of allPlayers) {
      const playerRecord = await this.findOrCreatePlayer(player.personId, gameId, player);
      if (!playerRecord) {
        continue;
      }
      records.push({
        scheduleGameId,
        playerId: playerRecord.id,
        playerExternalId: String(player.personId),
        teamExternalId: player.teamExternalId,
        ...this.mapStats(player.statistics),
      });
    }

    if (records.length) {
      await this.database.db.insert(scheduleBoxscorePlayers).values(records);
    }
  }

  private async findOrCreatePlayer(
    personId: number,
    gameId: string,
    fallback: {
      firstName?: string;
      familyName?: string;
      nameI?: string;
      playerSlug?: string;
      position?: string;
      jerseyNum?: string;
    },
  ) {
    const externalId = String(personId);
    const [existing] = await this.database.db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.externalId, externalId));
    if (existing) {
      return existing;
    }

    const infoResponse = await this.fetchPlayerInfoWithRetry(externalId, gameId);
    if (infoResponse) {
      const infoSet = infoResponse.resultSets.find((set) => set.name === 'CommonPlayerInfo');
      if (infoSet && infoSet.rowSet.length) {
        const info = this.mapPlayerInfo(infoSet.headers, infoSet.rowSet[0]);
        if (info) {
          const [created] = await this.database.db.insert(players).values(info).returning({ id: players.id });
          return created;
        }
      }
    }

    const fallbackInfo = this.mapFallbackPlayerInfo(externalId, fallback);
    this.logger.warn(`player info fallback used for ${externalId} gameId=${gameId}`);
    const [created] = await this.database.db.insert(players).values(fallbackInfo).returning({ id: players.id });
    return created;
  }

  private async fetchPlayerInfoWithRetry(externalId: string, gameId: string) {
    const first = await this.fetchPlayerInfo(externalId, gameId);
    if (first) {
      return first;
    }
    await this.sleep(750);
    return this.fetchPlayerInfo(externalId, gameId, true);
  }

  private async fetchPlayerInfo(externalId: string, gameId: string, isRetry = false) {
    let infoResponse: Awaited<ReturnType<NbaBoxScoreClient['fetchCommonPlayerInfo']>> | null = null;
    try {
      infoResponse = await this.boxscoreClient.fetchCommonPlayerInfo(externalId);
    } catch (error) {
      const suffix = isRetry ? ' (retry)' : '';
      this.logger.warn(
        `player info fetch failed for ${externalId} gameId=${gameId}${suffix}`,
        error as Error,
      );
      return null;
    }

    if (!infoResponse || !Array.isArray(infoResponse.resultSets)) {
      if (isRetry) {
        this.logger.warn(
          `player info missing resultSets for ${externalId} gameId=${gameId} response=${this.truncateJson(infoResponse)}`,
        );
      }
      return null;
    }

    return infoResponse;
  }

  private mapPlayerInfo(headers: string[], row: unknown[]) {
    const map = new Map<string, unknown>();
    headers.forEach((header, index) => map.set(header, row[index] ?? null));

    const firstName = String(map.get('FIRST_NAME') ?? '').trim();
    const lastName = String(map.get('LAST_NAME') ?? '').trim();
    const personId = String(map.get('PERSON_ID') ?? '').trim();
    if (!personId) {
      return null;
    }

    const teamIdRaw = map.get('TEAM_ID');
    const teamId = typeof teamIdRaw === 'number' ? teamIdRaw : teamIdRaw ? Number(teamIdRaw) : null;
    const draftYearRaw = map.get('DRAFT_YEAR');
    const draftYear = draftYearRaw ? Number(draftYearRaw) : null;
    const draftRoundRaw = map.get('DRAFT_ROUND');
    const draftRound = draftRoundRaw ? Number(draftRoundRaw) : null;
    const draftNumberRaw = map.get('DRAFT_NUMBER');
    const draftPick = draftNumberRaw ? Number(draftNumberRaw) : null;

    return {
      externalId: personId,
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      displayName: this.toStringOrNull(map.get('DISPLAY_FIRST_LAST')),
      slug: this.toStringOrNull(map.get('PLAYER_SLUG')),
      position: this.toStringOrNull(map.get('POSITION')),
      teamId,
      teamSlug: this.toStringOrNull(map.get('TEAM_SLUG')),
      teamCity: this.toStringOrNull(map.get('TEAM_CITY')),
      teamName: this.toStringOrNull(map.get('TEAM_NAME')),
      teamAbbr: this.toStringOrNull(map.get('TEAM_ABBREVIATION')),
      jersey: this.toStringOrNull(map.get('JERSEY')),
      height: this.toStringOrNull(map.get('HEIGHT')),
      weight: this.toStringOrNull(map.get('WEIGHT')),
      college: this.toStringOrNull(map.get('SCHOOL')),
      country: this.toStringOrNull(map.get('COUNTRY')),
      draftYear,
      draftRound,
      draftPick,
    };
  }

  private mapFallbackPlayerInfo(
    externalId: string,
    fallback: {
      firstName?: string;
      familyName?: string;
      nameI?: string;
      playerSlug?: string;
      position?: string;
      jerseyNum?: string;
    },
  ) {
    const firstName = this.toStringOrNull(fallback.firstName) ?? 'Unknown';
    const lastName = this.toStringOrNull(fallback.familyName) ?? 'Unknown';
    const nameI = this.toStringOrNull(fallback.nameI);
    const displayName = nameI ?? `${firstName} ${lastName}`.trim();

    return {
      externalId,
      firstName,
      lastName,
      displayName: displayName || null,
      slug: this.toStringOrNull(fallback.playerSlug),
      position: this.toStringOrNull(fallback.position),
      teamId: null,
      teamSlug: null,
      teamCity: null,
      teamName: null,
      teamAbbr: null,
      jersey: this.toStringOrNull(fallback.jerseyNum),
      height: null,
      weight: null,
      college: null,
      country: null,
      draftYear: null,
      draftRound: null,
      draftPick: null,
    };
  }

  private mapStats(stats: BoxScorePlayerStats) {
    if (!stats) {
      return {
        minutes: null,
        fgMade: null,
        fgAttempted: null,
        fgPct: null,
        fg3Made: null,
        fg3Attempted: null,
        fg3Pct: null,
        ftMade: null,
        ftAttempted: null,
        ftPct: null,
        oreb: null,
        dreb: null,
        reb: null,
        ast: null,
        stl: null,
        blk: null,
        tov: null,
        pf: null,
        pts: null,
        plusMinus: null,
      };
    }
    return {
      minutes: stats.minutes,
      fgMade: stats.fieldGoalsMade,
      fgAttempted: stats.fieldGoalsAttempted,
      fgPct: stats.fieldGoalsPercentage,
      fg3Made: stats.threePointersMade,
      fg3Attempted: stats.threePointersAttempted,
      fg3Pct: stats.threePointersPercentage,
      ftMade: stats.freeThrowsMade,
      ftAttempted: stats.freeThrowsAttempted,
      ftPct: stats.freeThrowsPercentage,
      oreb: stats.reboundsOffensive,
      dreb: stats.reboundsDefensive,
      reb: stats.reboundsTotal,
      ast: stats.assists,
      stl: stats.steals,
      blk: stats.blocks,
      tov: stats.turnovers,
      pf: stats.foulsPersonal,
      pts: stats.points,
      plusMinus: stats.plusMinusPoints,
    };
  }

  private async writeRedis(gameId: string, payload: unknown, ttlSeconds?: number) {
    const client = this.redisService.getClient();
    const key = this.redisKey(gameId);
    const value = JSON.stringify(payload);
    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await client.set(key, value);
  }

  private redisKey(gameId: string) {
    return `nba:boxscore:${gameId}`;
  }

  private toDate(value: string | null) {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private toStringOrNull(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }
    const text = String(value).trim();
    return text ? text : null;
  }

  private sleep(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private truncateJson(value: unknown, maxLength = 4096) {
    let text = '';
    try {
      text = JSON.stringify(value);
    } catch (error) {
      return `[unserializable json: ${(error as Error).message}]`;
    }
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...[truncated]`;
  }
}

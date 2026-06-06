import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { NbaScheduleClient, NbaScheduleResponse } from './nba-schedule.client';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { QueueService } from './queue.service';

type ScheduleGameInput = NbaScheduleResponse['leagueSchedule']['gameDates'][number]['games'][number];

@Injectable()
export class ScheduleSyncService {
  private readonly logger = new Logger(ScheduleSyncService.name);
  private readonly timeZone = process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York';

  constructor(
    private readonly nbaScheduleClient: NbaScheduleClient,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {}

  @Cron(process.env.NBA_SCHEDULE_CRON || '0 0 * * *', {
    timeZone: process.env.NBA_SCHEDULE_TIMEZONE || 'America/New_York',
  })
  async scheduleDailySync() {
    await this.queueService.enqueueSyncSchedule(`syncSchedule-${Date.now()}`);
  }

  async syncScheduleForToday() {
    const season = process.env.NBA_CURRENT_SEASON || '';
    const leagueId = process.env.NBA_LEAGUE_ID || '00';
    if (!season) {
      throw new Error('NBA_CURRENT_SEASON is required');
    }

    const today = this.getTodayDateString();
    const startedAt = Date.now();
    this.logger.log(`syncSchedule start date=${today} season=${season} league=${leagueId}`);

    const response = await this.nbaScheduleClient.fetchLeagueSchedule(season, leagueId);
    const daySchedule = response.leagueSchedule.gameDates.find(
      (entry) => this.normalizeGameDate(entry.gameDate) === today,
    );

    await this.syncLiveGamesToRedis(response);

    if (!daySchedule) {
      this.logger.log(`syncSchedule skip date=${today} no games`);
      return;
    }

    const dayPayload = {
      meta: response.meta,
      leagueSchedule: {
        seasonYear: response.leagueSchedule.seasonYear,
        leagueId: response.leagueSchedule.leagueId,
        gameDates: [daySchedule],
      },
    };

    const hash = this.hashPayload(dayPayload);
    const scheduleDay = await this.upsertScheduleDay(today, response, hash);
    if (!scheduleDay.changed) {
      this.logger.log(`syncSchedule unchanged date=${today}`);
      await this.cleanupRedisIfFinal(today);
      return;
    }

    await this.upsertScheduleGames(scheduleDay.id, today, daySchedule.games);
    await this.saveRedisGameIds(today, daySchedule.games.map((game) => game.gameId));

    await this.cleanupRedisIfFinal(today);

    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `syncSchedule done date=${today} games=${daySchedule.games.length} span=${spanSeconds}s`,
    );
  }

  async syncScheduleAll() {
    const season = process.env.NBA_CURRENT_SEASON || '';
    const leagueId = process.env.NBA_LEAGUE_ID || '00';
    if (!season) {
      throw new Error('NBA_CURRENT_SEASON is required');
    }

    const startedAt = Date.now();
    this.logger.log(`syncScheduleAll start season=${season} league=${leagueId}`);

    const response = await this.nbaScheduleClient.fetchLeagueSchedule(season, leagueId);
    let totalGames = 0;

    for (const daySchedule of response.leagueSchedule.gameDates) {
      const normalizedDate = this.normalizeGameDate(daySchedule.gameDate);
      if (!normalizedDate) {
        this.logger.warn(`syncScheduleAll skip invalid date=${daySchedule.gameDate}`);
        continue;
      }
      const dayPayload = {
        meta: response.meta,
        leagueSchedule: {
          seasonYear: response.leagueSchedule.seasonYear,
          leagueId: response.leagueSchedule.leagueId,
          gameDates: [daySchedule],
        },
      };

      const hash = this.hashPayload(dayPayload);
      const scheduleDay = await this.upsertScheduleDay(normalizedDate, response, hash);
      if (!scheduleDay.changed) {
        await this.cleanupRedisIfFinal(normalizedDate);
        continue;
      }

      await this.upsertScheduleGames(scheduleDay.id, normalizedDate, daySchedule.games);
      await this.syncLiveGamesToRedis(response);
      await this.saveRedisGameIds(
        normalizedDate,
        daySchedule.games.map((game) => game.gameId),
      );
      await this.cleanupRedisIfFinal(normalizedDate);
      totalGames += daySchedule.games.length;
    }

    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `syncScheduleAll done days=${response.leagueSchedule.gameDates.length} games=${totalGames} span=${spanSeconds}s`,
    );
  }

  private getTodayDateString() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private hashPayload(payload: unknown) {
    const json = JSON.stringify(payload);
    return createHash('sha256').update(json).digest('hex');
  }

  private dateFromYmd(date: string) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  private parseGameDate(date: string) {
    if (!date) {
      return null;
    }
    if (date.includes('T')) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const slashMatch = date.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
    );
    if (slashMatch) {
      const [, month, day, year, hour = '00', minute = '00', second = '00'] = slashMatch;
      const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const ymdMatch = date.match(/^\d{4}-\d{2}-\d{2}$/);
    if (ymdMatch) {
      const parsed = new Date(`${date}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      this.logger.warn(`syncSchedule invalid gameDate=${date}`);
      return null;
    }
    return parsed;
  }

  private normalizeGameDate(date: string) {
    const slashMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (slashMatch) {
      return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
    }
    const parsed = this.parseGameDate(date);
    if (!parsed) {
      return null;
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
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

  private async upsertScheduleDay(
    today: string,
    response: NbaScheduleResponse,
    hash: string,
  ): Promise<{ id: string; changed: boolean }> {
    const existing = await this.prisma.scheduleDay.findUnique({
      where: {
        gameDate_seasonYear_leagueId: {
          gameDate: this.dateFromYmd(today),
          seasonYear: response.leagueSchedule.seasonYear,
          leagueId: response.leagueSchedule.leagueId,
        },
      },
    });

    const metaTime = this.toDate(response.meta.time) ?? new Date();
    if (!existing) {
      const created = await this.prisma.scheduleDay.create({
        data: {
          gameDate: this.dateFromYmd(today),
          seasonYear: response.leagueSchedule.seasonYear,
          leagueId: response.leagueSchedule.leagueId,
          metaVersion: response.meta.version,
          metaRequest: response.meta.request,
          metaTime,
          hash,
        },
      });
      return { id: created.id, changed: true };
    }

    if (existing.hash === hash) {
      return { id: existing.id, changed: false };
    }

    const updated = await this.prisma.scheduleDay.update({
      where: { id: existing.id },
      data: {
        metaVersion: response.meta.version,
        metaRequest: response.meta.request,
        metaTime,
        hash,
      },
    });
    return { id: updated.id, changed: true };
  }

  private async upsertScheduleGames(
    scheduleDayId: string,
    today: string,
    games: ScheduleGameInput[],
  ) {
    const gameDate = this.dateFromYmd(today);

    for (const game of games) {
      const data = {
        scheduleDayId,
        gameId: game.gameId,
        gameDate,
        gameCode: game.gameCode,
        gameStatus: game.gameStatus,
        gameStatusText: game.gameStatusText,
        gameSequence: game.gameSequence,
        gameDateEst: this.toDate(game.gameDateEst),
        gameTimeEst: this.toDate(game.gameTimeEst),
        gameDateTimeEst: this.toDate(game.gameDateTimeEst),
        gameDateUTC: this.toDate(game.gameDateUTC),
        gameTimeUTC: this.toDate(game.gameTimeUTC),
        gameDateTimeUTC: this.toDate(game.gameDateTimeUTC),
        awayTeamTime: this.toDate(game.awayTeamTime),
        homeTeamTime: this.toDate(game.homeTeamTime),
        day: game.day,
        monthNum: game.monthNum,
        weekNumber: game.weekNumber,
        weekName: game.weekName,
        ifNecessary: game.ifNecessary,
        seriesGameNumber: game.seriesGameNumber,
        gameLabel: game.gameLabel,
        gameSubLabel: game.gameSubLabel,
        seriesText: game.seriesText,
        arenaName: game.arenaName,
        arenaState: game.arenaState,
        arenaCity: game.arenaCity,
        postponedStatus: game.postponedStatus,
        branchLink: game.branchLink,
        gameSubtype: game.gameSubtype,
        isNeutral: game.isNeutral,
        homeTeamId: game.homeTeam?.teamId ?? null,
        homeTeamName: game.homeTeam?.teamName ?? null,
        homeTeamCity: game.homeTeam?.teamCity ?? null,
        homeTeamTricode: game.homeTeam?.teamTricode ?? null,
        homeTeamSlug: game.homeTeam?.teamSlug ?? null,
        homeTeamWins: game.homeTeam?.wins ?? null,
        homeTeamLosses: game.homeTeam?.losses ?? null,
        homeTeamScore: game.homeTeam?.score ?? null,
        homeTeamSeed: game.homeTeam?.seed ?? null,
        awayTeamId: game.awayTeam?.teamId ?? null,
        awayTeamName: game.awayTeam?.teamName ?? null,
        awayTeamCity: game.awayTeam?.teamCity ?? null,
        awayTeamTricode: game.awayTeam?.teamTricode ?? null,
        awayTeamSlug: game.awayTeam?.teamSlug ?? null,
        awayTeamWins: game.awayTeam?.wins ?? null,
        awayTeamLosses: game.awayTeam?.losses ?? null,
        awayTeamScore: game.awayTeam?.score ?? null,
        awayTeamSeed: game.awayTeam?.seed ?? null,
      };

      const scheduleGame = await this.prisma.scheduleGame.upsert({
        where: { gameId: game.gameId },
        create: data,
        update: data,
        select: { id: true },
      });

      await this.prisma.schedulePointsLeader.deleteMany({
        where: { scheduleGameId: scheduleGame.id },
      });

      if (game.pointsLeaders?.length) {
        await this.prisma.schedulePointsLeader.createMany({
          data: game.pointsLeaders.map((leader) => ({
            scheduleGameId: scheduleGame.id,
            personId: leader.personId ?? null,
            firstName: leader.firstName ?? null,
            lastName: leader.lastName ?? null,
            teamId: leader.teamId ?? null,
            teamCity: leader.teamCity ?? null,
            teamName: leader.teamName ?? null,
            teamTricode: leader.teamTricode ?? null,
            points: leader.points ?? null,
          })),
        });
      }
    }
  }

  private redisKey(date: string) {
    return `nba:schedule:${date}`;
  }

  private async saveRedisGameIds(date: string, gameIds: string[]) {
    const client = this.redisService.getClient();
    await client.set(this.redisKey(date), JSON.stringify(gameIds));
  }

  private async cleanupRedisIfFinal(date: string) {
    const allFinal = await this.prisma.scheduleGame.findMany({
      where: { gameDate: this.dateFromYmd(date) },
      select: { gameStatus: true },
    });

    if (!allFinal.length) {
      return;
    }

    const isFinal = allFinal.every((game) => game.gameStatus === 3);
    if (isFinal) {
      await this.redisService.getClient().del(this.redisKey(date));
      this.logger.log(`syncSchedule redis cleared date=${date} final`);
    }
  }

  private async syncLiveGamesToRedis(response: NbaScheduleResponse) {
    const intervalMs = Number(process.env.NBA_LIVE_BOXSCORE_INTERVAL_MS || '120000');
    if (!intervalMs || intervalMs <= 0) {
      return;
    }

    const now = Date.now();
    const windowStart = now - 6 * 60 * 60 * 1000;
    const windowEnd = now + 24 * 60 * 60 * 1000;

    const client = this.redisService.getClient();
    const pipeline = client.pipeline();
    let added = 0;

    for (const dateGroup of response.leagueSchedule.gameDates) {
      for (const game of dateGroup.games) {
        if (!game.gameId) continue;

        const tipoff = this.parseGameDateTimeUtc(game.gameDateTimeUTC);
        if (!tipoff) continue;

        const tipoffMs = tipoff.getTime();
        if (tipoffMs < windowStart || tipoffMs > windowEnd) continue;

        pipeline.sadd('nba:live:games', game.gameId);
        pipeline.hset(`nba:live:meta:${game.gameId}`, {
          gameDateTimeUTC: game.gameDateTimeUTC || '',
          gameStatus: String(game.gameStatus),
        });
        added++;
      }
    }

    if (added > 0) {
      await pipeline.exec();
      await this.queueService.upsertCheckLiveBoxscoreScheduler(intervalMs);
      this.logger.log(`syncLiveGames added=${added} games`);
    } else {
      this.logger.log('syncLiveGames no games in window');
    }
  }

  private parseGameDateTimeUtc(value: string | null | undefined) {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

}

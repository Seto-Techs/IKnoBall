import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PlayerIndexClient } from './player-index.client';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';

type PlayerIndexRow = {
  PERSON_ID: number;
  PLAYER_LAST_NAME: string;
  PLAYER_FIRST_NAME: string;
  PLAYER_SLUG: string;
  TEAM_ID: number | null;
  TEAM_SLUG: string | null;
  IS_DEFUNCT: number | null;
  TEAM_CITY: string | null;
  TEAM_NAME: string | null;
  TEAM_ABBREVIATION: string | null;
  JERSEY_NUMBER: string | null;
  POSITION: string | null;
  HEIGHT: string | null;
  WEIGHT: string | null;
  COLLEGE: string | null;
  COUNTRY: string | null;
  DRAFT_YEAR: number | null;
  DRAFT_ROUND: number | null;
  DRAFT_NUMBER: number | null;
  ROSTER_STATUS: number | null;
  FROM_YEAR: string | null;
  TO_YEAR: string | null;
  PTS: number | null;
  REB: number | null;
  AST: number | null;
  STATS_TIMEFRAME: string | null;
};

@Injectable()
export class PlayerSyncService {
  private readonly logger = new Logger(PlayerSyncService.name);

  constructor(
    private readonly playerIndexClient: PlayerIndexClient,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('0 0 */3 * *')
  async scheduleSyncPlayers() {
    await this.queueService.enqueueSyncPlayers();
  }

  async syncPlayers(season: string) {
    const startedAt = Date.now();
    this.logger.log(`syncPlayers start season=${season}`);
    const response = await this.playerIndexClient.fetchPlayerIndex(season);
    const resultSet = response.resultSets.find((set) => set.name === 'PlayerIndex');
    if (!resultSet) {
      throw new Error('PlayerIndex result set not found');
    }

    const players = this.mapRows(resultSet.headers, resultSet.rowSet);
    for (const player of players) {
      await this.upsertPlayer(player, season);
    }

    const spanSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    this.logger.log(
      `syncPlayers done season=${season} count=${players.length} span=${spanSeconds}s`,
    );
  }

  private mapRows(headers: string[], rows: unknown[][]): PlayerIndexRow[] {
    return rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        mapped[header] = row[index] ?? null;
      });
      return mapped as PlayerIndexRow;
    });
  }

  private async upsertPlayer(player: PlayerIndexRow, currentSeason: string) {
    const externalId = String(player.PERSON_ID);
    const existing = await this.prisma.player.findUnique({ where: { externalId } });

    const data: Prisma.PlayerUncheckedCreateInput = {
      externalId,
      firstName: player.PLAYER_FIRST_NAME,
      lastName: player.PLAYER_LAST_NAME,
      displayName: `${player.PLAYER_FIRST_NAME} ${player.PLAYER_LAST_NAME}`,
      slug: player.PLAYER_SLUG,
      position: player.POSITION,
      teamId: player.TEAM_ID,
      teamSlug: player.TEAM_SLUG,
      isDefunct: player.IS_DEFUNCT ? player.IS_DEFUNCT === 1 : null,
      teamCity: player.TEAM_CITY,
      teamName: player.TEAM_NAME,
      teamAbbr: player.TEAM_ABBREVIATION,
      jersey: player.JERSEY_NUMBER,
      height: player.HEIGHT,
      weight: player.WEIGHT,
      college: player.COLLEGE,
      country: player.COUNTRY,
      draftYear: player.DRAFT_YEAR,
      draftRound: player.DRAFT_ROUND,
      draftPick: player.DRAFT_NUMBER,
      rosterStatus: this.toFloat(player.ROSTER_STATUS),
      careerFrom: player.FROM_YEAR,
      careerTo: player.TO_YEAR,
    };

    if (!existing) {
      await this.prisma.player.create({ data });
      await this.queueService.enqueuePlayerCareer(String(player.PERSON_ID));
      return;
    }

    await this.prisma.player.update({
      where: { externalId },
      data,
    });
  }

  private toFloat(value: number | null) {
    if (value === null || value === undefined) {
      return null;
    }
    return Number(value);
  }
}

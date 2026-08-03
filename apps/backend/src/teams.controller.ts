import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';
import { teams, players, playerSeasonStats } from '@iknoball/database';
import { eq, and } from 'drizzle-orm';

class StatLeader {
  @ApiProperty({ example: 'Victor Wembanyama' })
  name!: string;

  @ApiProperty({ example: 25.0 })
  value!: number;
}

class TeamLeaders {
  @ApiProperty()
  pts!: StatLeader;

  @ApiProperty()
  reb!: StatLeader;

  @ApiProperty()
  ast!: StatLeader;
}

class TeamResponse {
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

  @ApiProperty({ nullable: true })
  leaders!: TeamLeaders | null;
}

@ApiTags('Teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'All 30 NBA teams with 2025-26 stat leaders' })
  @ApiDataResponse(TeamResponse, HttpStatus.OK, 'Teams with leaders.', 'Teams with leaders.')
  async getTeams(): Promise<ApiResponse<TeamResponse[]>> {
    const season = '2025-26';

    // Fetch team metadata
    const allTeams = await this.db.db.select().from(teams);

    // Fetch player stats for leader computation
    const stats = await this.db.db
      .select({
        teamAbbr: players.teamAbbr,
        displayName: players.displayName,
        ptsPerGame: playerSeasonStats.ptsPerGame,
        rebPerGame: playerSeasonStats.rebPerGame,
        astPerGame: playerSeasonStats.astPerGame,
      })
      .from(playerSeasonStats)
      .innerJoin(players, eq(playerSeasonStats.playerId, players.id))
      .where(
        and(
          eq(playerSeasonStats.season, season),
          eq(playerSeasonStats.statsTimeframe, 'ByYear-regular'),
        ),
      );

    // Group stats by team
    const byTeam = new Map<string, typeof stats>();
    for (const r of stats) {
      const abbr = r.teamAbbr ?? '';
      if (!abbr) continue;
      if (!byTeam.has(abbr)) byTeam.set(abbr, []);
      byTeam.get(abbr)!.push(r);
    }

    function topRow(
      rows: typeof stats,
      field: 'ptsPerGame' | 'rebPerGame' | 'astPerGame',
    ): { name: string; value: number } {
      const best = rows
        .filter((r) => r[field] != null)
        .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0];
      return {
        name: best?.displayName ?? '',
        value: Math.round((best?.[field] ?? 0) * 10) / 10,
      };
    }

    // Map BKN → BRK (players table uses BKN, teams table uses BRK)
    const ABBR_MAP: Record<string, string> = { BKN: 'BRK' };

    const result: TeamResponse[] = allTeams.map((t) => {
      const lookup = ABBR_MAP[t.abbreviation] ?? t.abbreviation;
      const rows = byTeam.get(lookup) ?? [];

      return {
        externalId: Number(t.externalId),
        abbreviation: t.abbreviation,
        teamName: t.name,
        fullName: t.fullName,
        city: t.city,
        conference: t.conference,
        division: t.division,
        logoUrl: t.logoUrl ?? '',
        arena: t.arena ?? '',
        headCoach: t.headCoach ?? '',
        primaryColor: t.primaryColor ?? '',
        leaders:
          rows.length > 0
            ? {
                pts: topRow(rows, 'ptsPerGame'),
                reb: topRow(rows, 'rebPerGame'),
                ast: topRow(rows, 'astPerGame'),
              }
            : null,
      };
    });

    return response(true, 'Teams fetched.', result);
  }
}

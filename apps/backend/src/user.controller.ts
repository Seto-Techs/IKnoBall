import { Controller, Get, HttpStatus, Patch, Body } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { user, teams } from '@iknoball/database';
import { eq } from 'drizzle-orm';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { DatabaseService } from './infrastructure/database/database.service';

export class UserProfile {
  @ApiProperty({ example: 'player@iknoball.test' })
  email!: string;

  @ApiProperty({ example: 'Player' })
  name!: string;

  @ApiProperty({ example: 'user' })
  role!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ example: 'SAS', nullable: true })
  favoriteTeam!: string | null;

  @ApiProperty({ example: '#C4CED4', nullable: true })
  favoriteTeamColor!: string | null;
}

class SetTeamDto {
  @ApiProperty({ example: 'SAS' })
  teamAbbr!: string;
}

@ApiTags('User')
@Controller()
export class UserController {
  constructor(private readonly db: DatabaseService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiDataResponse(
    UserProfile,
    HttpStatus.OK,
    'Authenticated user profile.',
    'Authenticated user profile.',
  )
  async getMe(@Session() session: UserSession): Promise<ApiResponse<UserProfile>> {
    const userId = session.user.id as string;
    const rows = await this.db.db
      .select({
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        favoriteTeam: user.favoriteTeam,
        favoriteTeamColor: teams.primaryColor,
      })
      .from(user)
      .leftJoin(teams, eq(teams.abbreviation, user.favoriteTeam))
      .where(eq(user.id, userId))
      .limit(1);

    const u = rows[0];
    return response(true, 'Authenticated.', {
      email: u.email,
      name: u.name,
      role: u.role ?? 'user',
      isVerified: u.emailVerified ?? false,
      favoriteTeam: u.favoriteTeam ?? null,
      favoriteTeamColor: u.favoriteTeamColor ?? null,
    });
  }

  @Patch('me/team')
  @ApiOperation({ summary: 'Set favorite team' })
  @ApiDataResponse(UserProfile, HttpStatus.OK, 'Team updated.', 'Team updated.')
  async setTeam(
    @Session() session: UserSession,
    @Body() body: SetTeamDto,
  ): Promise<ApiResponse<UserProfile>> {
    const userId = session.user.id as string;
    await this.db.db.update(user).set({ favoriteTeam: body.teamAbbr }).where(eq(user.id, userId));

    // Re-read with JOIN for the response (session still has stale user row)
    const rows = await this.db.db
      .select({
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        favoriteTeam: user.favoriteTeam,
        favoriteTeamColor: teams.primaryColor,
      })
      .from(user)
      .leftJoin(teams, eq(teams.abbreviation, user.favoriteTeam))
      .where(eq(user.id, userId))
      .limit(1);

    const u = rows[0];
    return response(true, 'Team updated.', {
      email: u.email,
      name: u.name,
      role: u.role ?? 'user',
      isVerified: u.emailVerified ?? false,
      favoriteTeam: u.favoriteTeam ?? null,
      favoriteTeamColor: u.favoriteTeamColor ?? null,
    });
  }
}

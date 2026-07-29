import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';

export class UserProfile {
  @ApiProperty({ example: 'player@iknoball.test' })
  email!: string;

  @ApiProperty({ example: 'Player' })
  name!: string;

  @ApiProperty({ example: 'user' })
  role!: string;

  @ApiProperty({ example: true })
  isVerified!: boolean;
}

@ApiTags('User')
@Controller()
export class UserController {
  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiDataResponse(
    UserProfile,
    HttpStatus.OK,
    'Authenticated user profile.',
    'Authenticated user profile.',
  )
  getMe(@Session() session: UserSession): ApiResponse<UserProfile> {
    const user = session.user as Record<string, unknown>;
    return response(true, 'Authenticated.', {
      email: user.email as string,
      name: user.name as string,
      role: (user.role as string) ?? 'user',
      isVerified: (user.emailVerified as boolean) ?? false,
    });
  }
}

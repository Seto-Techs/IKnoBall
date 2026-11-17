import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { ApiDataResponse } from '../common/openapi/response';
import { ActivitySessionDto } from './activity.dto';
import { ActivityService, type ActivitySession } from './activity.service';

class ActivitySessionResponse implements ActivitySession {
  @ApiProperty({ description: 'Send as `Authorization: Bearer <token>`.' })
  token!: string;

  @ApiProperty({ example: { id: '1531941991875743744', name: 'Player' } })
  discord!: { id: string; name: string };

  @ApiProperty({ example: { id: 'usr_123', name: 'Player', image: null } })
  user!: { id: string; name: string; image: string | null };
}

/**
 * `POST /api/activity/session` — the activity's only door in.
 *
 * `@AllowAnonymous()` because there is no session yet: the request *creates* one.
 * It is not an open door in practice, because the code it carries can only come
 * from Discord's SDK, and it is spent on the first exchange.
 */
@ApiTags('Activity')
@AllowAnonymous()
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Post('session')
  @ApiOperation({ summary: 'Exchange a Discord Activity OAuth code for a session token' })
  @ApiDataResponse(
    ActivitySessionResponse,
    HttpStatus.CREATED,
    'Signed in.',
    'Session token for the IKnoBall account linked to this Discord user.',
  )
  async createSession(@Body() body: ActivitySessionDto): Promise<ApiResponse<ActivitySession>> {
    const session = await this.activity.createSession(body.code);
    return response(true, 'Signed in.', session);
  }
}

import { Body, Controller, Delete, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiDataResponse } from '../common/openapi/response';
import { response, type ApiResponse } from '../common/http/response';
import { ConsumeLinkCodeDto } from './discord-link.dto';
import {
  DiscordLinkService,
  type DiscordLinkStatus,
  type RemovedLink,
} from './discord-link.service';

/**
 * `GET|POST|DELETE /me/discord` — what `settings/discord` calls.
 *
 * No `@AllowAnonymous()`: these are the session routes, and the global guard is
 * what makes `session.user.id` trustworthy. The bot never touches them; it uses
 * `/internal/discord-link`.
 *
 * The user is always taken from the session and never from the body. A code is a
 * bearer token for one Discord id, so the only thing a client may say is which
 * code it holds; who it is linking is decided here.
 */
@ApiTags('Discord')
@Controller('me/discord')
export class UserDiscordLinkController {
  constructor(private readonly links: DiscordLinkService) {}

  @Get()
  @ApiOperation({ summary: 'Discord link status for the signed-in user' })
  @ApiDataResponse(
    Object,
    HttpStatus.OK,
    'Discord link status.',
    'Which Discord account answers for this user, and how it was found.',
  )
  async status(@Session() session: UserSession): Promise<ApiResponse<DiscordLinkStatus>> {
    const userId = session.user.id as string;
    return response(true, 'Discord link status.', await this.links.statusForUser(userId));
  }

  @Post()
  @ApiOperation({ summary: 'Redeem a /link code for the signed-in user' })
  @ApiDataResponse(
    Object,
    HttpStatus.CREATED,
    'Discord account linked.',
    'The Discord id the code belonged to. Invalid or expired codes are 400; an account already linked elsewhere is 409.',
  )
  async consume(
    @Session() session: UserSession,
    @Body() body: ConsumeLinkCodeDto,
  ): Promise<ApiResponse<{ discordUserId: string }>> {
    const userId = session.user.id as string;
    const linked = await this.links.consumeCode(body.code, userId);
    return response(true, 'Discord account linked.', linked);
  }

  @Delete()
  @ApiOperation({ summary: 'Disconnect the bot link for the signed-in user' })
  @ApiDataResponse(
    Object,
    HttpStatus.OK,
    'Discord link disconnected.',
    'Picks are untouched. A Discord sign-in method is not removed, so the bot may still resolve the user.',
  )
  async disconnect(@Session() session: UserSession): Promise<ApiResponse<RemovedLink>> {
    const userId = session.user.id as string;
    return response(true, 'Discord link disconnected.', await this.links.deleteForUser(userId));
  }
}

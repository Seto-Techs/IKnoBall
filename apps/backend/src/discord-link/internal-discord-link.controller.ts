import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { InternalTokenGuard } from '../internal/internal-token.guard';
import { IssueLinkCodeDto, ResolveLinkQueryDto } from './discord-link.dto';
import { DiscordLinkService, type IssuedLinkCode, type RemovedLink } from './discord-link.service';

/**
 * `GET|POST|DELETE /internal/discord-link` — the three calls the bot makes.
 *
 * - `GET ?discordUserId=` — resolve, on every button click. `userId: null` is a
 *   miss, not an error: the click turns it into "link your account first".
 * - `POST code` — `/link` asks for a single-use code to hand the user.
 * - `DELETE ?discordUserId=` — `/unlink`.
 *
 * `@AllowAnonymous()` is load-bearing: the global `APP_GUARD` from `AuthModule`
 * rejects a session-less request before any handler runs, so without it the bot
 * would get a 401 and `InternalTokenGuard` would never execute.
 */
@AllowAnonymous()
@Controller('internal/discord-link')
@UseGuards(InternalTokenGuard)
export class InternalDiscordLinkController {
  constructor(private readonly links: DiscordLinkService) {}

  @Get()
  async resolve(
    @Query() query: ResolveLinkQueryDto,
  ): Promise<ApiResponse<{ userId: string | null }>> {
    const resolved = await this.links.resolve(query.discordUserId);
    return response(true, 'Link resolved.', { userId: resolved.userId });
  }

  @Post('code')
  async issueCode(@Body() body: IssueLinkCodeDto): Promise<ApiResponse<IssuedLinkCode>> {
    const issued = await this.links.issueCode(body.discordUserId);
    return response(true, 'Linking code issued.', issued);
  }

  @Delete()
  async unlink(@Query() query: ResolveLinkQueryDto): Promise<ApiResponse<RemovedLink>> {
    const result = await this.links.deleteLink(query.discordUserId);
    return response(true, result.removed ? 'Link removed.' : 'No link to remove.', result);
  }
}

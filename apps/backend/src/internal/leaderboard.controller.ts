import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { InternalTokenGuard } from './internal-token.guard';
import { LeaderboardQueryDto } from './leaderboard.dto';
import { InternalLeaderboardService, type GuildLeaderboardRow } from './leaderboard.service';

/**
 * `GET /internal/leaderboard?guildId=&mode=[&viewerDiscordUserId=]` — a server's
 * board, for `/leaderboard`.
 *
 * Definition B from DISC-08: everyone in the server, ranked by every settled pick
 * they have made — on the website or in Discord. Membership comes from the
 * `discord_members` mirror the bot keeps, not from `prediction_picks.guildId`,
 * which only records where a pick was placed.
 *
 * Top five plus the caller's own row when outside the cut, the same shape the web
 * board returns via `viewerRank`. The query itself lives in
 * `InternalLeaderboardService` because it joins `discord_members`, which the web
 * board has no business knowing about.
 */
@AllowAnonymous()
@Controller('internal/leaderboard')
@UseGuards(InternalTokenGuard)
export class InternalLeaderboardController {
  constructor(private readonly leaderboard: InternalLeaderboardService) {}

  @Get()
  async board(@Query() query: LeaderboardQueryDto): Promise<ApiResponse<GuildLeaderboardRow[]>> {
    const rows = await this.leaderboard.board({
      guildId: query.guildId,
      mode: query.mode,
      viewerDiscordUserId: query.viewerDiscordUserId,
    });

    return response(true, 'Leaderboard fetched.', rows);
  }
}

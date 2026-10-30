import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from '../common/http/response';
import { PredictionsService, type PickWithGame } from '../predictions.service';
import { InternalTokenGuard } from './internal-token.guard';
import { ListPicksQueryDto } from './picks.dto';

/**
 * `GET /internal/picks?userId=` — the same rows the web's My Picks reads.
 *
 * `PredictionsService.listPicks` joins game, teams, scores, and status and marks
 * `pendingPrice`, so `/picks` in Discord cannot disagree with the web page.
 *
 * There is no unknown-user 404 here: `listPicks` is a query with no user lookup,
 * so an id that does not exist and an account with no picks both come back as an
 * empty list. The bot only calls this with an id it just resolved from a link,
 * and an empty list is the right answer for "nothing picked yet".
 */
@AllowAnonymous()
@Controller('internal/picks')
@UseGuards(InternalTokenGuard)
export class InternalPicksController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get()
  async listPicks(@Query() query: ListPicksQueryDto): Promise<ApiResponse<PickWithGame[]>> {
    const picks = await this.predictions.listPicks(query.userId);
    return response(true, 'Picks fetched.', picks);
  }
}

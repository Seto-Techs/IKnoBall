import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import { PredictionsService } from './predictions.service';
import type { OddsSide, PredictionMode } from '@iknoball/predictions';

const MODES: PredictionMode[] = ['flat', 'weighted'];
const SIDES: OddsSide[] = ['home', 'away'];

class PlacePickDto {
  @ApiProperty({ example: '0012600009', description: 'NBA game id' })
  gameId!: string;

  @ApiProperty({ example: 'home', enum: SIDES })
  side!: OddsSide;
}

class PickResponse {
  @ApiProperty({ example: '0012600009' })
  gameId!: string;

  @ApiProperty({ example: 'weighted', enum: MODES })
  mode!: PredictionMode;

  @ApiProperty({ example: 'home', enum: SIDES })
  side!: OddsSide;

  @ApiProperty({ example: 2.067, nullable: true, description: 'De-vigged price locked at submit' })
  lockedDecimal!: number | null;

  @ApiProperty({ example: 'FanDuel/US', nullable: true })
  lockedBook!: string | null;

  @ApiProperty({ example: '2026-10-03T10:00:00.000Z', nullable: true })
  lockedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true, description: 'Null until settled' })
  points!: number | null;

  @ApiProperty({ example: 'pending', enum: ['pending', 'settled', 'voided'] })
  status!: string;

  @ApiProperty({ example: null, nullable: true })
  settledAt!: Date | null;

  @ApiProperty({
    example: false,
    description:
      'Weighted pick with no price yet. Its payout will come from the opening line once one appears.',
  })
  pendingPrice!: boolean;
}

class PickWithGameResponse extends PickResponse {
  @ApiProperty({ example: 'Toronto Raptors', nullable: true })
  homeTeam!: string | null;

  @ApiProperty({ example: 'Miami Heat', nullable: true })
  awayTeam!: string | null;

  @ApiProperty({ example: 'TOR', nullable: true })
  homeTricode!: string | null;

  @ApiProperty({ example: 'MIA', nullable: true })
  awayTricode!: string | null;

  @ApiProperty({ example: null, nullable: true })
  homeScore!: number | null;

  @ApiProperty({ example: null, nullable: true })
  awayScore!: number | null;

  @ApiProperty({ example: '2026-10-03T23:00:00.000Z', nullable: true })
  gameDateTime!: Date | null;

  @ApiProperty({ example: 1, nullable: true, description: '1 scheduled, 2 live, 3 final' })
  gameStatus!: number | null;
}

class RemovedPickResponse {
  @ApiProperty({ example: '0012600009' })
  gameId!: string;
}

class LeaderboardEntryResponse {
  @ApiProperty({ example: 1 })
  rank!: number;

  @ApiProperty({ example: 'user_01M3WAYSHF822ESRXHQSJPZBW9' })
  userId!: string;

  @ApiProperty({ example: 'rakaiseto' })
  name!: string;

  @ApiProperty({ example: 312 })
  points!: number;

  @ApiProperty({ example: 24 })
  picks!: number;

  @ApiProperty({ example: 15 })
  correct!: number;
}

class OddsSideResponse {
  @ApiProperty({ example: 2.067, description: 'Fair (de-vigged) decimal price' })
  decimal!: number;

  @ApiProperty({ example: 1 })
  flat!: number;

  @ApiProperty({ example: 21 })
  weighted!: number;
}

class OddsPreviewResponse {
  @ApiProperty({ example: '0012600009' })
  gameId!: string;

  @ApiProperty({ example: true, description: 'False when no odds have been captured yet' })
  available!: boolean;

  @ApiProperty({ example: 'FanDuel/US', nullable: true })
  book!: string | null;

  @ApiProperty({ example: '2026-10-03T10:00:00.000Z', nullable: true })
  capturedAt!: Date | null;

  @ApiProperty({ example: false, description: 'True when the newest price is too old to lock' })
  stale!: boolean;

  @ApiProperty({ type: OddsSideResponse, nullable: true })
  home!: OddsSideResponse | null;

  @ApiProperty({ type: OddsSideResponse, nullable: true })
  away!: OddsSideResponse | null;
}

@ApiTags('Predictions')
@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Post()
  @ApiOperation({ summary: 'Place a pick. Locks both modes and returns both rows.' })
  @ApiDataResponse(PickResponse, HttpStatus.CREATED, 'Pick saved.', 'Pick saved.', true)
  async placePick(
    @Session() session: UserSession,
    @Body() body: PlacePickDto,
  ): Promise<ApiResponse<PickResponse[]>> {
    const gameId = body?.gameId?.trim();
    if (!gameId) throw new BadRequestException('gameId is required');
    if (!SIDES.includes(body?.side)) {
      throw new BadRequestException(`side must be one of: ${SIDES.join(', ')}`);
    }

    const picks = await this.predictions.placePick(session.user.id as string, {
      gameId,
      side: body.side,
    });

    return response(true, 'Pick saved.', picks);
  }

  @Delete(':gameId')
  @ApiOperation({ summary: 'Remove a pick before tip-off. Removes both modes.' })
  @ApiDataResponse(RemovedPickResponse, HttpStatus.OK, 'Pick removed.', 'Pick removed.')
  async removePick(
    @Session() session: UserSession,
    @Param('gameId') gameId: string,
  ): Promise<ApiResponse<RemovedPickResponse>> {
    await this.predictions.removePick(session.user.id as string, gameId);
    return response(true, 'Pick removed.', { gameId });
  }

  @Get('me')
  @ApiOperation({ summary: "The current user's picks, with locked odds and points" })
  @ApiDataResponse(PickWithGameResponse, HttpStatus.OK, 'Picks fetched.', 'Picks fetched.', true)
  async myPicks(@Session() session: UserSession): Promise<ApiResponse<PickWithGameResponse[]>> {
    const picks = await this.predictions.listPicks(session.user.id as string);
    return response(true, 'Picks fetched.', picks);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Standings for one mode' })
  @ApiDataResponse(
    LeaderboardEntryResponse,
    HttpStatus.OK,
    'Leaderboard fetched.',
    'Leaderboard fetched.',
    true,
  )
  async leaderboard(@Query('mode') mode: string): Promise<ApiResponse<LeaderboardEntryResponse[]>> {
    const resolved = (mode ?? 'flat') as PredictionMode;
    if (!MODES.includes(resolved)) {
      throw new BadRequestException(`mode must be one of: ${MODES.join(', ')}`);
    }
    const rows = await this.predictions.leaderboard(resolved);
    return response(true, 'Leaderboard fetched.', rows);
  }

  @Get('odds/:gameId')
  @ApiOperation({ summary: 'Current odds and what each side would pay' })
  @ApiDataResponse(OddsPreviewResponse, HttpStatus.OK, 'Odds fetched.', 'Odds fetched.')
  async odds(@Param('gameId') gameId: string): Promise<ApiResponse<OddsPreviewResponse>> {
    const preview = await this.predictions.oddsPreview(gameId);
    return response(true, 'Odds fetched.', preview);
  }
}

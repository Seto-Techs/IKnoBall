import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiProperty, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';
import {
  MinigamesService,
  type ConnectPlayerRef,
  type ConnectStats,
  type DailyPuzzle,
  type PlayerSuggestion,
  type SolveResult,
} from './minigames.service';
import type { Receipt } from './minigames.graph';

class PlayerRefResponse {
  @ApiProperty({ example: '202681' })
  id!: string;

  @ApiProperty({ example: '202681', description: 'NBA person id, for the headshot CDN' })
  externalId!: string;

  @ApiProperty({ example: 'Kyrie Irving' })
  name!: string;
}

class PuzzleResponse {
  @ApiProperty({ example: 13 })
  number!: number;

  @ApiProperty({ example: '2026-11-09' })
  date!: string;

  @ApiProperty({ type: PlayerRefResponse })
  start!: ConnectPlayerRef;

  @ApiProperty({ type: PlayerRefResponse })
  target!: ConnectPlayerRef;
}

class ReceiptResponse {
  @ApiProperty({ example: 'BRK' })
  team!: string;

  @ApiProperty({ example: ['2021-22', '2022-23'], type: [String] })
  seasons!: string[];
}

class HopResponse {
  @ApiProperty({
    example: true,
    description: 'False when the pair never shared a team-season, which rejects the guess',
  })
  linked!: boolean;

  @ApiProperty({ type: ReceiptResponse, isArray: true })
  receipt!: Receipt[];
}

class ChainLinkResponse {
  @ApiProperty({ example: '202681' })
  playerId!: string;

  @ApiProperty({ example: '202681', description: 'NBA person id, for the headshot CDN' })
  externalId!: string;

  @ApiProperty({ example: 'James Harden' })
  name!: string;

  @ApiProperty({ type: ReceiptResponse, isArray: true })
  receipt!: Receipt[];
}

class SolveResponse {
  @ApiProperty({ example: '2026-11-09' })
  date!: string;

  @ApiProperty({ example: 13 })
  number!: number;

  @ApiProperty({ example: 2, description: 'Intermediaries named; start and target never count' })
  players!: number;

  @ApiProperty({ example: 1, description: 'Intermediaries on the shortest route' })
  par!: number;

  @ApiProperty({ example: 4, description: 'Wordle-style grade: 5 is par, 1 is three over' })
  blocks!: number;

  @ApiProperty({ example: false })
  perfect!: boolean;

  @ApiProperty({ type: ChainLinkResponse, isArray: true })
  chain!: ChainLinkResponse[];
}

class MeResponse {
  @ApiProperty({ type: SolveResponse, nullable: true, description: "Today's solve, or null" })
  result!: SolveResult | null;

  @ApiProperty({
    example: { streak: 3, solved: 41, average: 0.45, results: [] },
    description: 'Streak, solve count, mean over par and the last five boards',
  })
  stats!: ConnectStats;
}

class HopDto {
  @ApiProperty({ example: '202681' })
  from!: string;

  @ApiProperty({ example: '1630178' })
  to!: string;
}

class SolveDto {
  @ApiProperty({
    example: ['202681', '201935', '1630178'],
    type: [String],
    description: 'Player ids, start first and target last',
  })
  chain!: string[];
}

/**
 * LeBronnect: the daily teammate chain.
 *
 * Playing needs a session, because a streak has to live somewhere and the house
 * rule is that playing does. The puzzle itself is the one exception: the shelf
 * and the landing band advertise today's two names to signed-out visitors, and
 * a pair of question marks in place of the faces is worse than showing the board
 * you would be signing in to play. It costs nothing — the board is the same for
 * everyone and carries no route.
 *
 * No endpoint can be read to learn the answer: the puzzle returns the two
 * players and nothing else, and par exists only in a finished solve.
 */
@ApiTags('Minigames')
@Controller('minigames/lebronnect')
export class MinigamesController {
  constructor(private readonly minigames: MinigamesService) {}

  @Get('puzzle')
  // Public so the shelf can show today's faces before there is a session. The
  // two names are on every surface anyway; the answer never leaves `solve`.
  @AllowAnonymous()
  @ApiOperation({ summary: "Today's LeBronnect board — the two players, never the answer" })
  @ApiDataResponse(PuzzleResponse, HttpStatus.OK, 'Puzzle fetched.', 'Puzzle fetched.')
  async puzzle(): Promise<ApiResponse<DailyPuzzle>> {
    return response(true, 'Puzzle fetched.', await this.minigames.getPuzzle());
  }

  @Get('players')
  @ApiOperation({ summary: 'Name search restricted to players the graph can link' })
  @ApiDataResponse(PlayerRefResponse, HttpStatus.OK, 'Players fetched.', 'Players fetched.', true)
  async players(@Query('q') q?: string): Promise<ApiResponse<PlayerSuggestion[]>> {
    return response(true, 'Players fetched.', await this.minigames.searchPlayers(q ?? ''));
  }

  @Post('hop')
  @ApiOperation({ summary: 'Validate one link and return its receipt' })
  @ApiDataResponse(HopResponse, HttpStatus.OK, 'Link checked.', 'Link checked.')
  async hop(@Body() body: HopDto): Promise<ApiResponse<HopResponse>> {
    const receipt = await this.minigames.checkHop(body?.from, body?.to);
    return response(true, 'Link checked.', { linked: receipt.length > 0, receipt });
  }

  @Post('solve')
  @ApiOperation({ summary: 'Submit a finished chain; grades it and stores the result' })
  @ApiDataResponse(SolveResponse, HttpStatus.CREATED, 'Chain solved.', 'Chain solved.')
  async solve(
    @Session() session: UserSession,
    @Body() body: SolveDto,
  ): Promise<ApiResponse<SolveResult>> {
    const chain = body?.chain;
    if (!Array.isArray(chain) || chain.some((id) => typeof id !== 'string')) {
      throw new BadRequestException('chain must be a list of player ids');
    }

    const result = await this.minigames.solve(session.user.id as string, chain);
    return response(true, 'Chain solved.', result);
  }

  @Get('me')
  @ApiOperation({ summary: "The viewer's result for today plus their record" })
  @ApiDataResponse(MeResponse, HttpStatus.OK, 'Result fetched.', 'Result fetched.')
  async me(@Session() session: UserSession): Promise<ApiResponse<MeResponse>> {
    const userId = session.user.id as string;
    const [result, stats] = await Promise.all([
      this.minigames.resultFor(userId),
      this.minigames.stats(userId),
    ]);
    return response(true, 'Result fetched.', { result, stats });
  }
}

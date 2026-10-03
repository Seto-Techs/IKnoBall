import { Injectable, Logger } from '@nestjs/common';
import type { OddsGame, OddsProvider } from '@iknoball/predictions';
import { NbaCdnOddsClient } from './nba-odds.client';
import { PinnacleOddsClient } from './pinnacle-odds.client';

/** Identity of a game for de-duplication: the team pair, since Pinnacle has no NBA id. */
function pairKey(game: OddsGame): string | null {
  if (game.homeTeamId === null || game.awayTeamId === null) return null;
  return `${game.homeTeamId}:${game.awayTeamId}`;
}

/**
 * Pinnacle first, NBA CDN for whatever Pinnacle did not price.
 *
 * Pinnacle is the primary because it covers far more of the slate — the CDN
 * only lists games a bookmaker has actually posted, which left 11 of 12
 * preseason games unpriced — and because a single sharp two-way line is a
 * cleaner baseline than picking one book out of a consensus.
 *
 * The CDN is the fallback and is the only source carrying an opening line, so
 * it still answers for any game Pinnacle has not opened. Both sources fail
 * soft, so either being down leaves the other answering, and an empty result is
 * a valid answer rather than an error — the feeds genuinely have nothing in the
 * offseason.
 */
@Injectable()
export class FallbackOddsProvider implements OddsProvider {
  private readonly logger = new Logger(FallbackOddsProvider.name);

  constructor(
    private readonly cdn: NbaCdnOddsClient,
    private readonly pinnacle: PinnacleOddsClient,
  ) {}

  async fetchMoneyline(): Promise<OddsGame[]> {
    let primary: OddsGame[] = [];
    try {
      primary = await this.pinnacle.fetchMoneyline();
    } catch (error) {
      this.logger.warn(`Pinnacle feed unavailable: ${(error as Error).message}`);
    }

    const covered = new Set(primary.map(pairKey).filter((key): key is string => key !== null));

    let fallback: OddsGame[] = [];
    try {
      fallback = await this.cdn.fetchMoneyline();
    } catch (error) {
      this.logger.warn(`NBA CDN fallback unavailable: ${(error as Error).message}`);
    }

    const additions = fallback.filter((game) => {
      const key = pairKey(game);
      return key !== null && !covered.has(key);
    });

    if (additions.length) {
      this.logger.log(`odds fallback: NBA CDN priced ${additions.length} game(s) Pinnacle did not`);
    }

    return [...primary, ...additions];
  }
}

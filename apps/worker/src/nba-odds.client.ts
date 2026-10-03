import { Injectable } from '@nestjs/common';
import { fetchNbaOdds, type OddsGame, type OddsProvider } from '@iknoball/predictions';

/**
 * Thin wrapper so the worker's DI graph keeps its `OddsProvider` seam while the
 * fetch, headers, and parsing live in the shared package.
 */
@Injectable()
export class NbaCdnOddsClient implements OddsProvider {
  private readonly requestTimeoutMs = Number(process.env.ODDS_REQUEST_TIMEOUT_MS || '15000');

  fetchMoneyline(): Promise<OddsGame[]> {
    return fetchNbaOdds(this.requestTimeoutMs);
  }
}

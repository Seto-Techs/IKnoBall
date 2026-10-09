import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { gameOddsSnapshots, scheduleGames } from '@iknoball/database';
import { fetchNbaOdds, pickBook, type OddsBook } from '@iknoball/predictions';
import { DatabaseService } from './infrastructure/database/database.service';
import { RedisService } from './infrastructure/redis/redis.service';

export interface ResolvedOdds {
  gameId: string;
  bookName: string;
  bookCountry: string;
  homeDecimal: number;
  awayDecimal: number;
  capturedAt: Date;
  /** `live` = just fetched, `cache` = served from Redis, `stored` = last row in Postgres. */
  source: 'live' | 'cache' | 'stored';
}

/** Cached payload. `missing` records a game the feed had no price for. */
type CacheEntry =
  | {
      state: 'odds';
      bookName: string;
      bookCountry: string;
      homeDecimal: number;
      awayDecimal: number;
      capturedAt: string;
    }
  | { state: 'missing' };

type CacheLookup = { kind: 'hit'; entry: CacheEntry } | { kind: 'absent' };

/**
 * Per-game odds with a short Redis cache in front of the NBA CDN.
 *
 * The cache is the fast path; Postgres is the durable one. On a miss the service
 * refreshes from the CDN, records a snapshot for audit, and caches the result.
 * If the CDN is unreachable it falls back to the last stored snapshot, so a feed
 * outage degrades freshness rather than breaking picks.
 *
 * Redis is optional: any cache failure is treated as a miss.
 */
@Injectable()
export class OddsService {
  private readonly logger = new Logger(OddsService.name);
  private readonly ttlSeconds = Number(process.env.ODDS_CACHE_TTL_SECONDS || '300');
  /** Games with no price are remembered briefly, so a missing game is not re-fetched on every request. */
  private readonly missTtlSeconds = Number(process.env.ODDS_MISS_CACHE_TTL_SECONDS || '60');
  private readonly preferredBook = process.env.ODDS_PREFERRED_BOOK || 'FanDuel';
  private readonly requestTimeoutMs = Number(process.env.ODDS_REQUEST_TIMEOUT_MS || '15000');
  private readonly lockTtlMs = Number(process.env.ODDS_LOCK_TTL_MS || '10000');

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Current odds for a game, refreshing from the CDN when the cache has expired.
   *
   * Returns null when the game is unknown, or when the feed has no price for it
   * and nothing was ever stored.
   */
  async getGameOdds(gameId: string): Promise<ResolvedOdds | null> {
    const cached = await this.readCache(gameId);
    if (cached.kind === 'hit') {
      if (cached.entry.state === 'missing') return null;
      return {
        gameId,
        bookName: cached.entry.bookName,
        bookCountry: cached.entry.bookCountry,
        homeDecimal: cached.entry.homeDecimal,
        awayDecimal: cached.entry.awayDecimal,
        capturedAt: new Date(cached.entry.capturedAt),
        source: 'cache',
      };
    }

    const lock = await this.acquireLock(gameId);
    if (lock) {
      try {
        const live = await this.refreshFromFeed(gameId);
        if (live) {
          await this.writeCache(gameId, {
            state: 'odds',
            bookName: live.bookName,
            bookCountry: live.bookCountry,
            homeDecimal: live.homeDecimal,
            awayDecimal: live.awayDecimal,
            capturedAt: live.capturedAt.toISOString(),
          });
          return live;
        }
        // Covers both "the feed has no price for this game" and "the feed is
        // unreachable". Remembering either for a short window stops a burst of
        // requests from hammering a feed that is down or has nothing to say.
        await this.writeCache(gameId, { state: 'missing' }, this.missTtlSeconds);
      } finally {
        await this.releaseLock(gameId, lock);
      }
    }

    // Either another request holds the lock, or the feed had nothing: serve the
    // last stored snapshot rather than failing.
    return this.readStoredOdds(gameId);
  }

  /**
   * Fetch the freshest price for a game and persist it as a snapshot.
   *
   * The NBA CDN is the only source. Pinnacle used to be asked first for its
   * coverage, but its guest API returns 403 from this deployment's egress and
   * the endpoint does not validate `X-API-Key`, so the block is network-level
   * rather than a credential problem — see `docs/prediction-scoring.md`. The CDN
   * is also the only source that carries an opening line.
   */
  private async refreshFromFeed(gameId: string): Promise<ResolvedOdds | null> {
    const [game] = await this.database.db
      .select({
        homeTeamId: scheduleGames.homeTeamId,
        awayTeamId: scheduleGames.awayTeamId,
      })
      .from(scheduleGames)
      .where(eq(scheduleGames.gameId, gameId))
      .limit(1);

    if (!game) return null;

    return this.refreshFromCdn(gameId, game.homeTeamId, game.awayTeamId);
  }

  /** The NBA CDN's price for the game, or null when it has none. */
  private async refreshFromCdn(
    gameId: string,
    homeTeamId: number | null,
    awayTeamId: number | null,
  ): Promise<ResolvedOdds | null> {
    let games;
    try {
      games = await fetchNbaOdds(this.requestTimeoutMs);
    } catch (error) {
      this.logger.warn(`odds feed unavailable for game=${gameId}: ${(error as Error).message}`);
      return null;
    }

    // The feed omits `gameId` on many captures, so fall back to the team pair.
    const match =
      games.find((entry) => entry.gameId === gameId) ??
      games.find(
        (entry) =>
          entry.homeTeamId !== null &&
          entry.homeTeamId === homeTeamId &&
          entry.awayTeamId === awayTeamId,
      );

    if (!match) return null;

    const book = pickBook(match.books, this.preferredBook);
    if (!book) return null;

    return this.recordSnapshot(gameId, book);
  }

  /** Persist a price for audit and return it as the resolved odds. */
  private async recordSnapshot(gameId: string, book: OddsBook): Promise<ResolvedOdds> {
    const capturedAt = new Date();
    await this.database.db
      .insert(gameOddsSnapshots)
      .values({
        gameId,
        bookName: book.bookName,
        bookCountry: book.countryCode,
        homeDecimal: book.home,
        awayDecimal: book.away,
        homeOpeningDecimal: book.homeOpening,
        awayOpeningDecimal: book.awayOpening,
        capturedAt,
      })
      .onConflictDoNothing();

    return {
      gameId,
      bookName: book.bookName,
      bookCountry: book.countryCode,
      homeDecimal: book.home,
      awayDecimal: book.away,
      capturedAt,
      source: 'live',
    };
  }

  /** Newest stored price for a game, preferring the configured book. */
  private async readStoredOdds(gameId: string): Promise<ResolvedOdds | null> {
    const columns = {
      bookName: gameOddsSnapshots.bookName,
      bookCountry: gameOddsSnapshots.bookCountry,
      homeDecimal: gameOddsSnapshots.homeDecimal,
      awayDecimal: gameOddsSnapshots.awayDecimal,
      capturedAt: gameOddsSnapshots.capturedAt,
    };

    const [preferred] = await this.database.db
      .select(columns)
      .from(gameOddsSnapshots)
      .where(
        and(
          eq(gameOddsSnapshots.gameId, gameId),
          eq(gameOddsSnapshots.bookName, this.preferredBook),
        ),
      )
      .orderBy(desc(gameOddsSnapshots.capturedAt))
      .limit(1);

    if (preferred) return { gameId, ...preferred, source: 'stored' };

    const [fallback] = await this.database.db
      .select(columns)
      .from(gameOddsSnapshots)
      .where(eq(gameOddsSnapshots.gameId, gameId))
      .orderBy(desc(gameOddsSnapshots.capturedAt))
      .limit(1);

    return fallback ? { gameId, ...fallback, source: 'stored' } : null;
  }

  private cacheKey(gameId: string): string {
    return `odds:game:${gameId}`;
  }

  private lockKey(gameId: string): string {
    return `odds:lock:${gameId}`;
  }

  private async readCache(gameId: string): Promise<CacheLookup> {
    try {
      const raw = await this.redis.getClient().get(this.cacheKey(gameId));
      if (!raw) return { kind: 'absent' };
      return { kind: 'hit', entry: JSON.parse(raw) as CacheEntry };
    } catch {
      // Cache is a fast path only; never let it break a read.
      return { kind: 'absent' };
    }
  }

  private async writeCache(
    gameId: string,
    entry: CacheEntry,
    ttlSeconds = this.ttlSeconds,
  ): Promise<void> {
    try {
      await this.redis.getClient().set(this.cacheKey(gameId), JSON.stringify(entry), {
        EX: ttlSeconds,
      });
    } catch (error) {
      this.logger.warn(`odds cache write failed game=${gameId}: ${(error as Error).message}`);
    }
  }

  /**
   * Best-effort single-flight so a burst of requests for the same game triggers
   * one feed fetch rather than one each.
   */
  private async acquireLock(gameId: string): Promise<string | null> {
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await this.redis
        .getClient()
        .set(this.lockKey(gameId), token, { NX: true, PX: this.lockTtlMs });
      return result === 'OK' ? token : null;
    } catch {
      // Without Redis every request fetches; correctness is unaffected.
      return token;
    }
  }

  private async releaseLock(gameId: string, token: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      // Compare before deleting so a lock that already expired and was taken by
      // another request is not cleared out from under it.
      if ((await client.get(this.lockKey(gameId))) === token) {
        await client.del(this.lockKey(gameId));
      }
    } catch {
      // The lock expires on its own.
    }
  }
}

import { describe, expect, it } from 'vitest';
import type { REST } from 'discord.js';
import type { CardTeam } from '../cards/types';
import { CardSweep, type SweepJob, type SweepSource } from '../lock/card-sweep';
import type { CardEditor } from '../lock/card-editor';
import { DeadCards } from '../lock/dead-cards';
import type { Infrastructure } from '../scheduler/infrastructure';
import type { SlateGame } from '../scheduler/slate';
import { SlatePoster } from '../scheduler/slate-poster';
import type { SlateStore } from '../scheduler/slate-store';
import { DiscordAuthError, RateLimiter, routeFamily } from './rate-limiter';

/**
 * The outbound queue, and the 100-guild fan-out it exists for (DISC-12).
 *
 * Everything below runs on a **virtual clock**: `now` and `sleep` are injected, so
 * a run that would take ten seconds of wall clock — 300 REST calls at 40 a second —
 * finishes in a few milliseconds while still exercising the real token bucket, the
 * real per-route table, and the real retry path. What is faked is Discord: a REST
 * layer that enforces the published limits (50 requests per second globally,
 * per-route buckets from `X-RateLimit-*`, 429s with `retry_after`, and a hard fail
 * after 10,000 invalid requests) and answers with the same headers Discord sends.
 *
 * The bot is in zero guilds, so this is a **simulation of 100 guilds, not a live
 * run against Discord**. What it proves is that the queue never over-sends: a real
 * fan-out that did would show up here as a 429 from the fake, or as an invalid
 * request.
 */

// ------------------------------------------------------------------- harness

/** A clock the limiter and the fake Discord share, so both agree on "now". */
class VirtualClock {
  private current = 1_700_000_000_000;
  private started = this.current;

  now = (): number => this.current;

  sleep = async (ms: number): Promise<void> => {
    this.current += Math.max(0, ms);
  };

  elapsed(): number {
    return this.current - this.started;
  }
}

const quiet = { warn: (): void => {}, error: (): void => {} };
const silent = { log: (): void => {}, warn: (): void => {}, error: (): void => {} };

/** A 429 (or any status) in the shape discord.js hands a call site. */
function httpError(
  status: number,
  body: Record<string, unknown> = {},
): Error & { status: number; rawError: Record<string, unknown> } {
  const error = new Error(`HTTP ${status}`) as Error & {
    status: number;
    rawError: Record<string, unknown>;
  };
  error.status = status;
  error.rawError = body;
  return error;
}

/** What the fake does when Discord's ban would have landed. */
class CloudflareBanError extends Error {
  constructor() {
    super('banned: more than 10,000 invalid requests');
    this.name = 'CloudflareBanError';
  }
}

interface FakeOptions {
  globalLimit?: number;
  perRoute?: number;
  routeWindowMs?: number;
}

/**
 * Discord's REST layer, as far as a rate limit is concerned.
 *
 * - 50 requests in any one-second window, or a 429 with `global: true`.
 * - Each (route shape, channel) bucket allows `perRoute` requests per
 *   `routeWindowMs`, answered with the headers Discord really sends — including
 *   `X-RateLimit-Bucket`, which is the only way to learn a bucket exists.
 * - A 403/404/401 counts as an invalid request, and the 10,001st in a window is
 *   the Cloudflare ban. Nothing in the load test is allowed to reach that.
 */
class FakeDiscord {
  readonly clock: VirtualClock;
  readonly globalLimit: number;
  readonly perRoute: number;
  readonly routeWindowMs: number;
  readonly onResponse?: (route: string, headers: Record<string, string>) => void;

  requests = 0;
  rateLimited = 0;
  invalid = 0;
  readonly byRoute = new Map<string, number>();

  private readonly globalHits: number[] = [];
  private readonly buckets = new Map<
    string,
    { remaining: number; resetAt: number; limit: number }
  >();
  private readonly forbidden = new Set<string>();
  private ids = 0;

  constructor(
    clock: VirtualClock,
    options: FakeOptions & { onResponse?: FakeDiscord['onResponse'] } = {},
  ) {
    this.clock = clock;
    this.globalLimit = options.globalLimit ?? 50;
    this.perRoute = options.perRoute ?? 5;
    this.routeWindowMs = options.routeWindowMs ?? 5_000;
    this.onResponse = options.onResponse;
  }

  /** Make every request to this channel answer 403, the way a missing permission does. */
  forbid(channelId: string): void {
    this.forbidden.add(channelId);
  }

  async request(method: string, path: string): Promise<{ id: string }> {
    const route = `${method} ${path}`;
    const now = this.clock.now();
    this.requests += 1;
    this.byRoute.set(routeFamily(route), (this.byRoute.get(routeFamily(route)) ?? 0) + 1);

    const channel = /\/channels\/(\d+)/.exec(path)?.[1] ?? 'global';

    if (this.forbidden.has(channel)) {
      this.invalid += 1;
      if (this.invalid > 10_000) throw new CloudflareBanError();
      throw httpError(403, { code: 50013, message: 'Missing Permissions' });
    }

    while (this.globalHits.length > 0 && now - this.globalHits[0]! >= 1_000) {
      this.globalHits.shift();
    }
    if (this.globalHits.length >= this.globalLimit) {
      this.rateLimited += 1;
      throw httpError(429, {
        global: true,
        retry_after: (1_000 - (now - this.globalHits[0])) / 1_000,
      });
    }

    const key = `${routeFamily(route)}|${channel}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        remaining: this.perRoute,
        resetAt: now + this.routeWindowMs,
        limit: this.perRoute,
      };
      this.buckets.set(key, bucket);
    }
    if (now >= bucket.resetAt) {
      bucket.remaining = bucket.limit;
      bucket.resetAt = now + this.routeWindowMs;
    }
    if (bucket.remaining <= 0) {
      this.rateLimited += 1;
      throw httpError(429, { global: false, retry_after: (bucket.resetAt - now) / 1_000 });
    }

    bucket.remaining -= 1;
    this.globalHits.push(now);
    this.ids += 1;

    this.onResponse?.(route, {
      'x-ratelimit-bucket': `${routeFamily(route)}:${channel}`,
      'x-ratelimit-limit': String(bucket.limit),
      'x-ratelimit-remaining': String(bucket.remaining),
      'x-ratelimit-reset-after': String((bucket.resetAt - now) / 1_000),
      'x-ratelimit-scope': 'user',
    });

    return { id: String(8_000_000_000_000_000_000n + BigInt(this.ids)) };
  }
}

function limiterOn(clock: VirtualClock, options: { perSecond?: number; burst?: number } = {}) {
  return new RateLimiter({
    now: clock.now,
    sleep: clock.sleep,
    logger: quiet,
    perSecond: options.perSecond,
    burst: options.burst,
  });
}

// ------------------------------------------------------- the queue, directly

describe('the token bucket', () => {
  it('holds a burst under the ceiling and then paces at the configured rate', async () => {
    // Real timers here: the point is that the default `sleep` actually waits.
    const limiter = new RateLimiter({ perSecond: 20, burst: 2, logger: quiet });
    const started = Date.now();

    await Promise.all(Array.from({ length: 10 }, () => limiter.schedule(async () => undefined)));

    // 2 tokens at once, then 8 more at 50ms each: 400ms, never all at once.
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect(limiter.stats().sent).toBe(10);
  });

  it('counts queued and in-flight tasks in depth()', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);

    const running = Array.from({ length: 10 }, () => limiter.schedule(async () => undefined));
    expect(limiter.depth()).toBe(10);

    await Promise.all(running);
    expect(limiter.depth()).toBe(0);
    expect(limiter.stats()).toMatchObject({ queued: 0, inFlight: 0, halted: false });
  });
});

describe('a 429', () => {
  it('waits retry_after and retries the task instead of surfacing the error', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    let attempts = 0;

    const result = await limiter.schedule(async () => {
      attempts += 1;
      if (attempts === 1) throw httpError(429, { retry_after: 2.5 });
      return 'posted';
    }, 'POST /channels/900000000000000001/messages');

    expect(result).toBe('posted');
    expect(attempts).toBe(2);
    expect(clock.elapsed()).toBeGreaterThanOrEqual(2_500);
    expect(limiter.stats()).toMatchObject({ rateLimited: 1, retries: 1, invalid: 0 });
  });

  it('blocks the route it came from, so the next task on it waits instead of asking again', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    const route = 'PATCH /channels/900000000000000001/messages/900000000000000002';
    let first = 0;

    const limited = limiter.schedule(async () => {
      first += 1;
      if (first === 1) throw httpError(429, { retry_after: 1, global: false });
      return 'edited';
    }, route);

    let startedAt = -1;
    const sibling = limiter.schedule(async () => {
      startedAt = clock.now();
      return 'sibling';
    }, route);

    await Promise.all([limited, sibling]);

    expect(first).toBe(2);
    expect(limiter.stats()).toMatchObject({ rateLimited: 1, retries: 1 });
    // The second task never got to run before the bucket's reset: the 429 bought
    // the whole route a one-second pause, not just the task that saw it.
    expect(startedAt).toBeGreaterThanOrEqual(1_000);
  });
});

describe('the failure policy', () => {
  it('halts every outbound call after a 401', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    let calls = 0;

    await expect(
      limiter.schedule(async () => {
        calls += 1;
        throw httpError(401);
      }),
    ).rejects.toBeInstanceOf(DiscordAuthError);

    expect(limiter.stats().halted).toBe(true);

    // The next call never reaches Discord: a bad token plus retries is how the
    // 10,000-invalid-request ban happens.
    await expect(limiter.schedule(async () => (calls += 1))).rejects.toBeInstanceOf(
      DiscordAuthError,
    );
    expect(calls).toBe(1);
    expect(limiter.stats().sent).toBe(1);
  });

  it('never retries a 404: the card is dead, not late', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    let attempts = 0;

    await expect(
      limiter.schedule(async () => {
        attempts += 1;
        throw httpError(404, { code: 10008 });
      }),
    ).rejects.toMatchObject({ status: 404 });

    expect(attempts).toBe(1);
    expect(limiter.stats()).toMatchObject({ invalid: 1, retries: 0, rateLimited: 0 });
  });
});

describe('per-route buckets', () => {
  it('holds one channel back until its bucket resets, without a 429', async () => {
    const clock = new VirtualClock();
    // The global bucket is deliberately not the constraint here: 1,000/s. Only the
    // per-route table can keep this under Discord's 5-per-5-seconds edit bucket.
    const limiter = limiterOn(clock, { perSecond: 1_000, burst: 100 });
    const rest = new FakeDiscord(clock, {
      perRoute: 2,
      routeWindowMs: 1_000,
      onResponse: (route, headers) => limiter.observe(route, headers),
    });

    const edits = Array.from({ length: 8 }, (_, index) =>
      limiter.schedule(
        () =>
          rest.request('PATCH', `/channels/900000000000000001/messages/90000000000000000${index}`),
        `PATCH /channels/900000000000000001/messages/90000000000000000${index}`,
      ),
    );

    await Promise.all(edits);

    expect(rest.requests).toBe(8);
    expect(rest.rateLimited).toBe(0);
    expect(limiter.stats().rateLimited).toBe(0);
    // 2 per second means four windows: the queue waited, it did not ask again.
    expect(clock.elapsed()).toBeGreaterThanOrEqual(3_000);
  });

  it('learns the bucket from discord.js REST events', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    const handlers = new Map<string, (...args: never[]) => void>();
    const rest = {
      on(event: string, handler: (...args: never[]) => void) {
        handlers.set(event, handler);
        return rest;
      },
    } as unknown as REST;

    limiter.attachRest(rest);

    const respond = handlers.get('response');
    expect(respond).toBeTypeOf('function');
    respond!(
      {
        method: 'PATCH',
        path: '/channels/900000000000000001/messages/900000000000000002',
      } as never,
      {
        headers: {
          get: (name: string) =>
            ({
              'x-ratelimit-bucket': 'edit-hash',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset-after': '1.5',
              'x-ratelimit-limit': '5',
            })[name] ?? null,
        },
      } as never,
    );

    const before = clock.elapsed();
    await limiter.schedule(
      async () => undefined,
      'PATCH /channels/900000000000000001/messages/900000000000000003',
    );

    expect(clock.elapsed() - before).toBeGreaterThanOrEqual(1_500);
  });
});

// ------------------------------------------------------------- the load test

function game(index: number): SlateGame {
  return {
    gameId: `00226001${String(20 + index)}`,
    gameStatus: 1,
    gameDate: '2026-10-27',
    gameDateTimeUTC: new Date(Date.parse('2026-10-27T23:30:00.000Z') + index * 900_000),
    awayTeamTricode: 'BKN',
    awayTeamCity: 'Brooklyn',
    awayTeamName: 'Nets',
    homeTeamTricode: 'BOS',
    homeTeamCity: 'Boston',
    homeTeamName: 'Celtics',
    seriesText: null,
  };
}

const TEAMS: CardTeam[] = [{ tricode: 'BOS', name: 'Boston Celtics', logoUrl: null, record: null }];
const MORNING = new Date('2026-10-27T13:00:00.000Z');

/** A store that claims each (guild, game) once, like the `discord_cards` insert. */
function slateStore(games: SlateGame[]): SlateStore {
  const claimed = new Set<string>();

  return {
    async findGames() {
      return games;
    },
    async findTeams() {
      return TEAMS;
    },
    async findStakes() {
      return new Map();
    },
    async claimCards(batch) {
      const fresh = batch.filter((claim) => !claimed.has(`${claim.guildId}:${claim.gameId}`));
      for (const claim of fresh) claimed.add(`${claim.guildId}:${claim.gameId}`);
      return fresh.map((claim) => claim.gameId);
    },
    async attachCards() {},
  };
}

/**
 * A gateway whose channels send through the fake REST layer.
 *
 * `permissionsFor` answers with every permission granted, so the preflight passes
 * and the run measures the send path rather than the skip path.
 */
function fakeGateway(rest: FakeDiscord) {
  const channels = new Map<string, unknown>();

  /** A sent message: the poster only ever reads its id back. */
  const message = (channelId: string, id: string) => ({ id, channelId, inGuild: () => true });

  const fetch = async (channelId: string) => {
    const cached = channels.get(channelId);
    if (cached) return cached;

    // `channels.fetch` is one REST call of its own: `GET /channels/{c}`.
    await rest.request('GET', `/channels/${channelId}`);

    const channel = {
      id: channelId,
      isSendable: () => true,
      guild: { members: { me: { id: 'bot' } } },
      permissionsFor: () => ({ has: () => true }),
      send: async () => {
        const sent = await rest.request('POST', `/channels/${channelId}/messages`);
        return message(channelId, sent.id);
      },
    };

    channels.set(channelId, channel);
    return channel;
  };

  return { client: { channels: { fetch } }, channels };
}

interface Guild {
  guildId: string;
  channelId: string;
}

function guilds(count: number): Guild[] {
  return Array.from({ length: count }, (_, index) => ({
    guildId: `guild-${index}`,
    channelId: String(9_000_000_000_000_000_000n + BigInt(index)),
  }));
}

describe('100 simulated guilds', () => {
  it('posts a slate and runs a full lock pass with zero 429s and zero invalid requests', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    const rest = new FakeDiscord(clock, {
      onResponse: (route, headers) => limiter.observe(route, headers),
    });
    const gateway = fakeGateway(rest);
    const pace = <T>(task: () => Promise<T>, route?: string) => limiter.schedule(task, route);

    const guilds100 = guilds(100);
    const games = [game(0), game(1), game(2), game(3)];

    // ---- a slate post, 100 guilds, concurrently: the scheduler's fan-out.
    const poster = new SlatePoster(
      slateStore(games),
      { client: gateway.client } as unknown as Infrastructure,
      pace,
    );

    const posts = await Promise.all(
      guilds100.map((guild) =>
        poster.post({ guildId: guild.guildId, channelId: guild.channelId }, MORNING),
      ),
    );

    for (const post of posts) {
      expect(post.status).toBe('posted');
      expect(post.messageIds).toHaveLength(4);
    }
    // 5 calls per guild: GET /channels/{c}, then one POST per card.
    expect(rest.requests).toBe(500);

    // ---- a full lock pass: one PATCH per message, and a card is its own message,
    // so a four-game guild is four jobs rather than one.
    const jobs: SweepJob[] = posts.flatMap((post, index) =>
      post.messageIds.map((messageId, card) => ({
        channelId: guilds100[index]!.channelId,
        messageId,
        cardIds: [`${guilds100[index]!.guildId}:${games[card]!.gameId}`],
        payload: { embeds: [], components: [] },
      })),
    );

    const source: SweepSource = {
      name: 'tip-off lock',
      async due(_now, limit, exclude) {
        return jobs
          .filter((job) => !job.cardIds.some((cardId) => exclude.includes(cardId)))
          .slice(0, limit);
      },
      async record() {},
    };

    const editor: CardEditor = {
      ready: () => true,
      async editCard(target) {
        await rest.request('PATCH', `/channels/${target.channelId}/messages/${target.messageId}`);
      },
    };

    const sweep = new CardSweep({
      source,
      editor,
      deadCards: new DeadCards(),
      logger: silent,
      pace: (task) => limiter.schedule(task),
      limit: 1_000,
    });

    const report = await sweep.run();

    expect(report).toMatchObject({
      candidates: 400,
      messages: 400,
      edited: 400,
      dead: 0,
      failed: 0,
    });
    expect(rest.requests).toBe(900);

    // ---- the acceptance: nothing over-sent, nothing invalid.
    expect(rest.rateLimited).toBe(0);
    expect(rest.invalid).toBe(0);
    expect(limiter.stats()).toMatchObject({
      sent: 900,
      rateLimited: 0,
      invalid: 0,
      retries: 0,
      queued: 0,
      inFlight: 0,
      halted: false,
    });

    // 900 calls at 40/s after a burst of 5 is 22.4s of bucket time — inside the
    // minute the fan-out has, and far inside Discord's 50/s.
    expect(clock.elapsed()).toBeGreaterThanOrEqual(22_000);
    expect(clock.elapsed()).toBeLessThanOrEqual(23_000);

    expect([...rest.byRoute.entries()].sort()).toEqual([
      ['GET /channels/:id', 100],
      ['PATCH /channels/:id/messages/:id', 400],
      ['POST /channels/:id/messages', 400],
    ]);
  });

  it('the cost table: one post is one channel read plus one message per card', async () => {
    // The numbers `docs/discord-rate-limits.md` quotes, measured rather than
    // reasoned: GET the channel once, then POST a message for each card, because a
    // card and its buttons have to be one message.
    const cases: Array<[cards: number, calls: number]> = [
      [1, 2],
      [4, 5],
      [6, 7],
      [8, 9],
      [12, 13],
    ];

    for (const [cards, expected] of cases) {
      const clock = new VirtualClock();
      const limiter = limiterOn(clock);
      const rest = new FakeDiscord(clock, {
        onResponse: (route, headers) => limiter.observe(route, headers),
      });
      const pace = <T>(task: () => Promise<T>, route?: string) => limiter.schedule(task, route);
      const poster = new SlatePoster(
        slateStore(Array.from({ length: cards }, (_, index) => game(index))),
        { client: fakeGateway(rest).client } as unknown as Infrastructure,
        pace,
      );

      const [guild] = guilds(1);
      const result = await poster.post(
        { guildId: guild!.guildId, channelId: guild!.channelId },
        MORNING,
      );

      expect(result.status).toBe('posted');
      expect(result.games).toBe(cards);
      expect(rest.requests, `${cards} card(s)`).toBe(expected);
      expect(rest.rateLimited).toBe(0);
    }
  });

  it('a 12-card slate costs thirteen calls per guild: one read and twelve sends', async () => {
    const clock = new VirtualClock();
    const limiter = limiterOn(clock);
    const rest = new FakeDiscord(clock, {
      onResponse: (route, headers) => limiter.observe(route, headers),
    });
    const gateway = fakeGateway(rest);
    const pace = <T>(task: () => Promise<T>, route?: string) => limiter.schedule(task, route);

    // Twelve games is twelve messages, each with its own card and button row.
    const poster = new SlatePoster(
      slateStore(Array.from({ length: 12 }, (_, index) => game(index))),
      { client: gateway.client } as unknown as Infrastructure,
      pace,
    );

    const guilds100 = guilds(100);
    const posts = await Promise.all(
      guilds100.map((guild) =>
        poster.post({ guildId: guild.guildId, channelId: guild.channelId }, MORNING),
      ),
    );

    for (const post of posts) {
      expect(post.status).toBe('posted');
      expect(post.messageIds).toHaveLength(12);
    }

    // GET the channel once, then twelve POSTs.
    expect(rest.requests).toBe(1_300);
    expect(rest.rateLimited).toBe(0);
    expect(rest.invalid).toBe(0);
    expect([...rest.byRoute.entries()].sort()).toEqual([
      ['GET /channels/:id', 100],
      ['POST /channels/:id/messages', 1_200],
    ]);
    // 1,300 calls is 5 + 1,295/40 = 32.4s of bucket time.
    expect(clock.elapsed()).toBeGreaterThanOrEqual(32_000);
    expect(clock.elapsed()).toBeLessThanOrEqual(33_000);
  });

  it('the fake enforces the 10,000-invalid-request ban, so "zero invalid" means something', async () => {
    const clock = new VirtualClock();
    const rest = new FakeDiscord(clock, { globalLimit: 1_000_000, perRoute: 1_000_000 });
    rest.forbid('900000000000000009');

    let last: unknown;
    for (let index = 0; index <= 10_000; index += 1) {
      try {
        await rest.request('POST', '/channels/900000000000000009/messages');
      } catch (error) {
        last = error;
      }
    }

    expect(rest.invalid).toBe(10_001);
    expect(last).toBeInstanceOf(CloudflareBanError);
  });
});

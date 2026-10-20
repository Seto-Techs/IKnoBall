import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NbaBoxScoreClient } from './nba-boxscore.client';
import { NbaScheduleClient } from './nba-schedule.client';
import { PlayerIndexClient } from './player-index.client';

/**
 * A response body that stalls must fail the request, not hang it.
 *
 * Each of these clients used to abort only the wait for response *headers* and
 * leave `response.json()` to the caller, outside the timer. A body that stalled
 * mid-stream therefore hung forever: in the career crawler the job stayed
 * `active` for the life of the process, holding one of two concurrency slots,
 * and the queue slowly stopped making progress. The same shape sat in the
 * schedule and box-score clients.
 *
 * The server below completes the headers, promises 1000 bytes, sends ten, then
 * holds the socket open — the case a header-only timeout cannot catch. Without
 * the fix these tests time out rather than reject.
 */
describe('NBA stats clients', () => {
  const servers: net.Server[] = [];
  const sockets = new Set<net.Socket>();
  const savedTimeout = process.env.NBA_STATS_REQUEST_TIMEOUT_MS;
  const savedBaseUrl = process.env.NBA_STATS_BASE_URL;

  beforeEach(() => {
    // Short enough that the retry backoff, not the timeout, dominates the run.
    process.env.NBA_STATS_REQUEST_TIMEOUT_MS = '100';
  });

  afterEach(async () => {
    // The client aborts mid-body, so these sockets are expected to error on the
    // way out; destroying them is what lets `close()` resolve instead of waiting
    // on a connection that will never finish.
    for (const socket of sockets) socket.destroy();
    sockets.clear();

    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;

    if (savedTimeout === undefined) delete process.env.NBA_STATS_REQUEST_TIMEOUT_MS;
    else process.env.NBA_STATS_REQUEST_TIMEOUT_MS = savedTimeout;

    if (savedBaseUrl === undefined) delete process.env.NBA_STATS_BASE_URL;
    else process.env.NBA_STATS_BASE_URL = savedBaseUrl;
  });

  /** Points the client at a server that never finishes its response body. */
  async function stalledBaseUrl(): Promise<string> {
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {
        /* the client aborting mid-body is the behaviour under test */
      });
      socket.write(
        'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"resultSets":',
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as net.AddressInfo;
    return `http://127.0.0.1:${address.port}/stats`;
  }

  it('rejects a stalled player index instead of hanging', { timeout: 30_000 }, async () => {
    process.env.NBA_STATS_BASE_URL = await stalledBaseUrl();
    const client = new PlayerIndexClient();

    await expect(client.fetchPlayerIndex('2026-27')).rejects.toThrow();
  });

  it('rejects a stalled schedule instead of hanging', { timeout: 30_000 }, async () => {
    process.env.NBA_STATS_BASE_URL = await stalledBaseUrl();
    const client = new NbaScheduleClient();

    await expect(client.fetchLeagueSchedule('2026-27', '00')).rejects.toThrow();
  });

  it('rejects a stalled box score instead of hanging', { timeout: 30_000 }, async () => {
    process.env.NBA_STATS_BASE_URL = await stalledBaseUrl();
    const client = new NbaBoxScoreClient();

    await expect(client.fetchBoxScoreSummary('0022500001')).rejects.toThrow();
  });
});

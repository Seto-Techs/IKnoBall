# Prediction Scoring — Implementation Plan

Two scoring modes for game-winner picks, backed by bookmaker odds from the NBA CDN.

## Goal

Let a signed-in user pick the winner of a game in either of two modes:

1. **Flat** — correct = `1` point, wrong = `0`.
2. **Weighted** — a correct pick pays out like a 1-unit bet at the odds available when the pick was made.

A pick's weighted payout is **frozen at submit time** and never re-read from live odds.

## Product decisions (settled)

| Decision        | Value                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Odds source     | `https://cdn.nba.com/static/json/liveData/odds/odds_todaysGames.json` (undocumented, free)                                |
| Market          | `2way` (moneyline) only — the file has no totals market                                                                   |
| Price to use    | FanDuel `US`, falling back to the lowest `sr:book` id present                                                             |
| Odds format     | Decimal strings, as published — no American conversion                                                                    |
| De-vig          | Yes. Normalise the two sides so implied probabilities sum to 1                                                            |
| Scale           | `K = 10`                                                                                                                  |
| Cap             | **No strategic cap.** A validation ceiling of `150` points guards against feed errors                                     |
| Locking         | `d` is captured once at submit; settlement never reads live odds                                                          |
| Pick close      | Exactly at tip-off, no buffer. Rejected when `now >= gameDateTimeUTC` or the game is no longer `scheduled`                |
| Modes per game  | **One pick covers both modes.** A single submit writes a flat row and a weighted row on the same side, in one transaction |
| Leaderboards    | Two fully independent boards (flat, weighted), as in the dashboard mock                                                   |
| Contest format  | Season-long ranked leaderboard (top 50), so no strategic cap                                                              |
| Postponed games | **Voided** — the pick is cancelled, scoring neither a win nor a loss                                                      |

### Scoring formula

Let \(d\) be the de-vigged decimal price of the picked side, locked at submit:

\[
\text{points} =
\begin{cases}
1 & \text{flat, correct} \\
\min(\text{round}(K \cdot d),\ 150) & \text{weighted, correct} \\
0 & \text{incorrect}
\end{cases}
\]

De-vig for a two-way market:

\[
d_{\text{fair,side}} = \frac{d_{\text{side}}}{\frac{1}{d_{\text{home}}} + \frac{1}{d_{\text{away}}}}
\]

Fair odds keep both sides at equal expected value, so no strategy (always-favourite, always-underdog) has an edge. Real overrounds in the feed run 4.9%–8.2%, so de-vigging is not optional.

## Current state

- Predictions are **frontend-only**, stored in `localStorage` under `iknoball.predictions.v1` — `apps/frontend/src/components/predict/predictions.ts`.
- Correctness is recomputed client-side from final scores — `apps/frontend/src/components/predict/slate.ts`.
- All points and leaderboards are mock data — `apps/frontend/src/lib/mock-data.ts`.
- No prediction or odds tables exist in `packages/database`.
- The worker already fetches `cdn.nba.com` with browser headers — `apps/worker/src/nba-cdn-boxscore.client.ts`.

No data migration is needed: there is no server-side prediction data to preserve.

As of phase 6 the whole feature is server-backed end to end: picks, odds, scoring, and both leaderboards.

## Data model

Add to `packages/database/src/schema.ts`.

### `game_odds_snapshots`

One row per game, book, and capture. Append-only; this is the audit trail the CDN file does not provide.

| Column               | Type                      | Notes                          |
| -------------------- | ------------------------- | ------------------------------ |
| `id`                 | text pk                   | `randomUUID`                   |
| `gameId`             | text                      | NBA game id, e.g. `0012600009` |
| `bookName`           | text                      | e.g. `FanDuel`                 |
| `bookCountry`        | text                      | e.g. `US`                      |
| `homeDecimal`        | doublePrecision           | raw, as published              |
| `awayDecimal`        | doublePrecision           | raw, as published              |
| `homeOpeningDecimal` | doublePrecision, nullable | from `opening_odds`            |
| `awayOpeningDecimal` | doublePrecision, nullable | from `opening_odds`            |
| `capturedAt`         | timestamp                 | when the worker fetched it     |

Indexes: `(gameId, capturedAt)`, and a unique `(gameId, bookName, bookCountry, capturedAt)`.

### `prediction_picks`

One row per user, game, and mode.

| Column          | Type                                    | Notes                               |
| --------------- | --------------------------------------- | ----------------------------------- |
| `id`            | text pk                                 | `randomUUID`                        |
| `userId`        | text                                    | references `user.id`                |
| `gameId`        | text                                    | NBA game id. **No FK** — see below  |
| `mode`          | enum `flat` \| `weighted`               | new `pgEnum`                        |
| `side`          | enum `home` \| `away`                   | reuse `scheduleTeamSide`            |
| `lockedDecimal` | doublePrecision, nullable               | null for flat picks                 |
| `lockedBook`    | text, nullable                          | which book the price came from      |
| `lockedAt`      | timestamp, nullable                     |                                     |
| `points`        | integer, nullable                       | null until settled or while voided  |
| `status`        | enum `pending` \| `settled` \| `voided` | new `pgEnum`; defaults to `pending` |
| `settledAt`     | timestamp, nullable                     | set on settle or void               |

Unique index: `(userId, gameId, mode)`. Index `(userId, settledAt)`, `(gameId)`, and `(status)` for settlement.

`gameId` is deliberately **not** a foreign key. `cleanupStaleGames` in `apps/worker/src/schedule-sync.service.ts` hard-deletes `schedule_games` rows for non-final games that drop out of a day's feed. A RESTRICT constraint would make that delete throw and fail the whole `syncSchedule` job; CASCADE would silently destroy the pick. A plain text column lets the schedule sync keep working while the pick survives as a voided record — the settlement cron left-joins the schedule, so a deleted row is exactly what marks a pick as voided.

Cross-mode side consistency is enforced in the service, not the schema: both rows for a `(userId, gameId)` must carry the same `side`. Changing the side on one mode either updates both rows or is rejected — decide at implementation time.

A separate `prediction_standings` table is not needed initially — leaderboards can be an aggregate query over `prediction_picks` grouped by user and mode, counting only rows with `status = 'settled'`. Add a materialised table only if it gets slow.

## Odds ingestion

Odds reach the app through two paths that share one parser and one set of request headers, so the fragile parts — the Akamai-shaped headers and the inconsistent payload — are defined once in `@iknoball/predictions` (`odds-feed.ts`).

- **Worker (warm-up and audit).** `odds-sync.service.ts` polls every 5 minutes and appends a row per game/book to `game_odds_snapshots`, keeping the table populated for games nobody is looking at.
- **Backend (on demand).** `apps/backend/src/odds.service.ts` serves the current price from Redis, refreshing from the CDN when the entry expires.

### Source priority and fallback

A weighted payout needs a price. The price comes from the first source that answers:

1. **Pinnacle** — the primary source. Implemented in `@iknoball/predictions/pinnacle-feed.ts`, with `apps/worker/src/pinnacle-odds.client.ts` and `apps/backend/src/pinnacle-odds.service.ts` behind the shared `OddsProvider` seam, so adding another vendor is a parser-level change rather than a call-site change. It is a single sharp two-way line with far better coverage than the CDN, and it answers in ~40 ms with no rate limiting. It carries **no opening line**.
2. **NBA CDN** (`cdn.nba.com/static/json/liveData/odds/odds_todaysGames.json`) — the fallback, used for games Pinnacle has not opened. Free and key-less, several books per game, and the **only** source carrying an opening line.
3. **No price** — the pick still locks. See _Locking without a price_.

Pinnacle leads because the CDN is genuinely sparse: on 2026-10-03 the slate had 12 preseason games, the CDN had priced **one**, and Pinnacle priced **three**. Leading with the CDN meant eleven games sat at "no odds yet" while a priced line existed.

Both sources fail soft. Either being down leaves the other answering, and a game neither has posted is normal rather than an error — preseason and far-out games routinely have no line at all. Everything downstream is written to tolerate an empty result.

### Odds source research

Probed from this box with Node 24 `fetch` (undici). Findings and raw captures live in `.amp/in/odds-research/` (fallback survey, `REPORT.md` + probes) and `.amp/in/oddschecker-research/` (oddschecker HARs + captured payloads), both git-excluded; the table below is the summary.

**The CDN is gated on the header set, not the client.** Isolated against `odds_todaysGames.json` (2026-10-03):

| Headers                                                                           | Node `fetch` | Bun `fetch` | curl    |
| --------------------------------------------------------------------------------- | ------------ | ----------- | ------- |
| none / UA only / UA + `Accept` / UA + `Accept` + `Origin`                         | 403          | 403         | 403     |
| `Referer` alone (no UA)                                                           | 200          | 403         | 403     |
| UA + `Referer`                                                                    | 200          | **403**     | 403     |
| **full browser set** (UA + `Referer` + `Origin` + `Sec-Fetch-Site/Mode/Dest` + …) | **200**      | **200**     | **403** |

Two things follow. First, `Referer` is necessary but not sufficient on its own for every client: Node is satisfied by `Referer` alone, Bun needs the full `Sec-Fetch-*` set too. Second, **curl is rejected regardless of headers** — a TLS/HTTP fingerprint difference, which is why the feed looked dead in the first probes. A bogus referer (`https://example.com/`) 403s on both, so the value must be an nba.com origin.

The practical rule: send the full browser header set (which is what `oddsHeaders()` already does) and fetch from Node or Bun, never `curl`. Both runtimes work with the full set, so nothing here depends on undici specifically.

`oddsHeaders()` in `@iknoball/predictions/odds-feed.ts` and `nba-cdn-boxscore.client.ts` both send the complete browser set — `Host`, `User-Agent`, `Accept*`, `Referer`, `Origin`, `Sec-GPC`, `Connection`, `Sec-Fetch-Dest/Mode/Site`, `Priority`, `TE`. Both are therefore correct as written and need no change; this note exists so no header is ever "tidied away" as noise. A header comment in `oddsHeaders()` that claimed Bun's `fetch` was rejected like curl was corrected at the same time.

| Source                                  | Verdict               | Evidence                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NBA CDN `odds_todaysGames.json`         | **Primary**           | 200 JSON with a browser-like `Referer` (403 without it); current **and** `opening_odds` on every outcome. Sparse — only games a book has actually posted.                                                                                                                     |
| Pinnacle guest arcadia API              | **Primary (shipped)** | Keyless (public key from `pinnacle.com/config/app.json`), one bulk call → all posted NBA moneylines, 15/15 rapid calls 200, no rate-limit headers. No opening line. Unofficial endpoint. **Wired in and leading** — see _Pinnacle (primary source)_.                          |
| Bovada coupon JSON                      | **Second fallback**   | Keyless, decimal moneylines, widest coverage (17 games incl. Christmas). No opening line. Undocumented endpoint, no explicit anti-scraping clause found.                                                                                                                      |
| Action Network `api.actionnetwork.com`  | **Avoid**             | Works keyless, good coverage — but its ToS **explicitly bans scraping**.                                                                                                                                                                                                      |
| The Odds API free tier                  | **No**                | Needs a key; 500 credits/month ≈ 16 calls/day cannot sustain a 5-minute poll.                                                                                                                                                                                                 |
| oddschecker.com                         | **Dead end (for us)** | A JSON endpoint does exist (`/api/markets/v2/all-odds`), but Cloudflare hard-blocks native Node/Bun fetch (403) even with the required headers; only a curl-class client passes, and market ids must be scraped from page HTML. Fragile undocumented bypass, no opening line. |
| DraftKings / FanDuel / BetMGM / Caesars | **No**                | 403, US-geo-blocked.                                                                                                                                                                                                                                                          |
| ESPN site + core APIs                   | **No odds**           | 200 JSON but zero `odds` keys, tested preseason and in-season; `/nba/odds` variants 404.                                                                                                                                                                                      |
| Betfair / FlashScore / SofaScore        | **No**                | Betfair needs app key + session login; FlashScore needs an `x-fsign` token; SofaScore 403.                                                                                                                                                                                    |
| Covers / SBR / OddsShark / VegasInsider | **No**                | 403 Cloudflare/Akamai bot blocks.                                                                                                                                                                                                                                             |
| BetExplorer / OddsPortal / CBS Sports   | **No (for a poll)**   | Carry opening data, but only behind obfuscated JS flows and anti-bot gating; not shippable for a 5-minute cron.                                                                                                                                                               |

Two operational facts from the probing, both material to shipping:

- **Indonesian ISP DNS-blackholes every betting domain** (MyRepublic resolves them to `block.myrepublic.co.id`). The probes only reached the real origins through a DNS-over-HTTPS preload. Any deployment on an Indonesian network needs the same DoH workaround or a non-ID egress to use Pinnacle or Bovada at all.
- **Opening lines are not available from any free keyless source.** Only the NBA CDN carries `opening_odds`, and only for games a book has posted. If an opening line becomes mandatory for unposted games, the options are a keyed provider with open/close history (odds-api.io `/v3/odds/movements`, SportsGameOdds, or The Odds API paid) or accepting the "lock without odds, resolve later" path already built.

So the shipped chain is **Pinnacle → NBA CDN → opening line**. Bovada (runner-up below) is not wired in; it sits behind the same `OddsProvider` seam if a third source is ever needed.

### Pinnacle (primary source)

Pinnacle's guest (arcadia) API is the primary odds source. It is free and key-less — the `X-API-Key` header carries Pinnacle's own public front-end key from `pinnacle.com/config/app.json`, which is not a user secret — and it answers in ~40 ms with no rate-limit headers. Two things it does not have: an opening line, and more than one book.

**Which league to ask.** Pinnacle splits the NBA calendar, so the league id is not a constant. NBA game ids encode the season type in their first three digits, and that is what selects the league:

| Game id prefix | Season type | Pinnacle league |
| -------------- | ----------- | --------------- |
| `001`          | Preseason   | `5270`          |
| `002`          | Regular     | `487`           |
| `003`          | All-Star    | `487`           |
| `004`          | Playoffs    | `487`           |
| `005`          | Play-In     | `487`           |

`pinnacleLeagueForGameId()` is the whole rule. The worker derives the distinct leagues the sync window needs and fetches only those, so a normal week costs one request per league and the preseason-to-regular-season crossover (when the window holds both) costs two.

This matters because the CDN is genuinely sparse in preseason, and every one of the games Pinnacle priced on 2026-10-03 was a `001` preseason game. Asking only league `487` would have found none of them.

**Team identity.** Pinnacle names teams (`"Boston Celtics"`) rather than carrying NBA ids, so each participant is mapped through `teams.fullName` → `teams.externalId`. All 27 names on the live slate resolved, with zero unmatched. A name that does not resolve is dropped — a game that cannot be identified cannot be priced.

**Two request gotchas, both verified against the live API:**

- `matchups?withSpecials=false` is required. Without the filter the same call returns ~108 entries instead of 12, the extra ~96 being prop and yes/no "special" markets.
- The bulk markets payload tags **both** game moneylines and props as `moneyline` at `period: 0`. Real games label their legs `designation: home|away`; props use `participantId` instead. Filtering on `designation` is what separates them, so a prop can never be scored as a team.

### Locking without a price

A weighted pick never blocks on a missing line. If neither source has a price at submit time the weighted row is written with `lockedDecimal = null` and surfaced to the client as `pendingPrice = true`. The pick is already committed; only its payout is undetermined.

The odds worker resolves those rows on every sync (`resolveDeferredPicks`), even when the live feed returns nothing, so a game that gets posted later is picked up automatically:

- It prefers the **opening line** (`opening_home` / `opening_away`) over the current line, because the opening line is the closest thing to a neutral pre-game price and the current line has already absorbed the money that arrived since.
- It writes `lockedDecimal` / `lockedBook` / `lockedAt` guarded by `lockedDecimal IS NULL`, so a re-run is a no-op and the first resolved price wins permanently.
- It re-runs the same de-vig as the submit path, so a deferred lock and an immediate lock are computed identically.

This is also why submit-time locking does **not** gate on price age. The deferred fallback is the _opening_ line, which is older than any stale snapshot; rejecting a stale snapshot only to hand out an older opening line later would be strictly worse information, not better.

**Only the CDN can supply an opening line.** Pinnacle publishes a current price and nothing else, so a game Pinnacle opens is never deferred (it locks at submit) and a game that stays unpriced until Pinnacle posts it locks Pinnacle's current line at resolve time. The opening-line path therefore applies to games the CDN priced.

**The resulting spread is measured and accepted.** Across every game both feeds priced on 2026-10-03, Pinnacle and CDN agree to within **1 point** — so which source a pick happened to use is not a fairness problem. The real spread is temporal: on TOR@MIA the CDN's opening paid 20/20 where its current line paid 17/25, a swing of up to **6 points**. Both sources de-vig, so expected value stays equal within a game; the residual is the cost of locking the price the user was promised. See _Decisions_.

### Worker files

- `nba-odds.client.ts` — thin `OddsProvider` wrapper over the shared `fetchNbaOdds`.
- `odds-sync.service.ts` — `@Cron` job, mirroring `ScheduleSyncService`.
- `odds.module.ts` — standalone module for the manual runner.
- `run-odds-sync.ts` — manual runner, matching the existing `run-*.ts` convention.

Behaviour:

1. Fetch the file with the shared browser headers.
2. Parse defensively (see Gotchas). Skip entries that cannot be priced or identified.
3. Resolve `gameId`: use the field when present; otherwise match `(homeTeamId, awayTeamId)` against `schedule_games` inside a −3/+7 day window.
4. Insert rows into `game_odds_snapshots`, one per game/book/capture, with `onConflictDoNothing`.
5. Log a warning when the file is empty or nothing matches — the health signal.

Cadence: every 5 minutes via `ODDS_SYNC_CRON` (default `*/5 * * * *`), timezone `America/New_York` to match the existing schedule job. Set `ODDS_SYNC_ENABLED=false` to disable. The cron is guarded against overlapping runs by an in-flight flag, and swallows errors so a bad feed never takes the worker down.

### Backend odds cache

```
GET odds for a game
      │
      ▼
 Redis  odds:game:{id}
      │
      ├── hit ────────────────► return
      │
      └── miss ─► single-flight lock (odds:lock:{id})
                    │
                    ├── acquired ────► Pinnacle (primary)
                    │                    │   └── priced ────► append snapshot ─► SETEX 300 ─► return
                    │                    └── no price ──► NBA CDN (fallback)
                    │                                    ├── priced ────► append snapshot ─► SETEX 300 ─► return
                    │                                    └── unpriced ──► SETEX 60 "missing"
                    │
                    └── not acquired ─► newest row from game_odds_snapshots
```

| Setting                       | Default | Purpose                                                                                |
| ----------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `ODDS_CACHE_TTL_SECONDS`      | 300     | How long a price is served from Redis.                                                 |
| `ODDS_MISS_CACHE_TTL_SECONDS` | 60      | How long a game with no price is remembered, so it is not re-fetched on every request. |
| `ODDS_LOCK_TTL_MS`            | 10000   | Single-flight window, so a burst of requests triggers one fetch rather than one each.  |
| `ODDS_REQUEST_TIMEOUT_MS`     | 15000   | CDN request timeout.                                                                   |

Three properties matter:

- **Redis is optional.** Every cache operation fails soft, so a Redis outage degrades to fetching, never to an error.
- **The feed is not trusted.** If it is unreachable, or has no price for the game, the service falls back to the newest stored snapshot. A feed outage costs freshness, not availability.
- **Every fetch is recorded.** A live refresh appends a snapshot, so the price a pick locks against stays auditable even though the CDN keeps no history.

The worker's poll and the backend's refresh both write snapshots. That is deliberate: the worker covers games nobody opens, and the backend covers the games people are actually picking.

### Running and testing

The worker executes as compiled JS under Node (`start: node dist/main.js`), and **that is the only path where NestJS dependency injection works**. Running the TypeScript directly with Bun (`bun run src/main.ts`, which is what `start:dev` does) fails to resolve constructor parameters, because Bun does not emit `emitDecoratorMetadata`. This is a pre-existing repo condition that affects every worker service, not just the odds sync.

Use `node dist/run-odds-sync.js` after a build to exercise ingestion manually.

### Offseason behaviour

The endpoint returns `200` with `{"games": []}` when no games are scheduled. The sync logs a warning and writes nothing, so an empty feed never wipes existing snapshots.

## Backend API

New `apps/backend/src/predictions.controller.ts` + `predictions.service.ts`, registered in `app.module.ts`. Follow the existing `response(...)` / `ApiDataResponse` / `@Session()` patterns from `user.controller.ts`.

| Method   | Route                            | Purpose                                                |
| -------- | -------------------------------- | ------------------------------------------------------ |
| `POST`   | `/predictions`                   | Place a pick. Writes **both** modes; returns both rows |
| `DELETE` | `/predictions/:gameId`           | Remove a pick before tip-off. Removes **both** modes   |
| `GET`    | `/predictions/me`                | Current user's picks, with locked odds and points      |
| `GET`    | `/predictions/leaderboard?mode=` | Aggregated standings per mode                          |
| `GET`    | `/predictions/odds/:gameId`      | Current odds + potential points for the pick UI        |

### Shared scoring package

`packages/predictions` (`@iknoball/predictions`) holds the logic shared by the backend and the worker, so the two cannot drift:

- `odds.ts` — `deVig(home, away)` and `fairDecimal(home, away, side)`.
- `odds-feed.ts` — `fetchNbaOdds`, `parseOddsPayload`, `pickBook`, `oddsHeaders`, and the `OddsBook` / `OddsGame` / `OddsProvider` types.
- `scoring.ts` — `pointsFor`, `potentialPoints`, `POINTS_SCALE` (10), `POINTS_CEILING` (150).

No framework dependencies, so both apps can import it. The backend locks a price and previews a payout with it; the worker parses and settles with it.

### Locking on submit

On `POST /predictions` (body is `gameId` + `side` — no `mode`):

1. Load the game. Reject unless the game is still `scheduled` **and** `now < gameDateTimeUTC`. The cutoff is the exact tip-off instant with no buffer, checked server-side against the stored timestamp — never a client clock.
2. Resolve a price for the game: the Redis cache first, then Pinnacle, then the CDN, then the newest stored snapshot. A miss is not an error.
3. Write **both** rows in a single `db.transaction` — flat and weighted, same `(userId, gameId, side)`:
   - **flat** — `lockedDecimal = null` always. Flat never needs odds.
   - **weighted** — `lockedDecimal = fairDecimal(snapshot, side)` when a price exists, else `null` with `pendingPrice = true` (resolved later from the opening line).
4. Both rows are upserts keyed on `(userId, gameId, mode)`. The `set` clause deliberately omits the conflict target, so re-submitting re-locks the price without touching the row's identity.

The upsert re-locks the price on every submit. That is deliberate: without it a user could take the favourite early and flip to a longshot after the line moved. Because one submit covers both modes, the flat and weighted rows can never name different sides — the cross-mode side conflict the earlier design had to check for is now impossible by construction.

`DELETE /predictions/:gameId` removes both rows; there is no per-mode delete.

## Settlement

New files in `apps/worker/src`: `prediction-settlement.service.ts`, `settlement.module.ts`, and `run-settlement.ts` (manual runner). The service runs on a `@Cron` every 15 minutes (`PREDICTION_SETTLEMENT_CRON`), guarded against overlapping runs, and swallows errors so a bad batch never takes the worker down. Set `PREDICTION_SETTLEMENT_ENABLED=false` to disable, and `PREDICTION_VOID_AFTER_HOURS` (default 48) to tune the void threshold.

For each pick with `status = 'pending'` whose game is final:

1. Read `scheduleGames.homeTeamScore` / `awayTeamScore` to determine the winner.
2. Flat: `1` if the pick matches, else `0`.
3. Weighted: `min(round(10 * lockedDecimal), 150)` if correct, else `0`. A weighted pick that reached `final` with `lockedDecimal IS NULL` — the feed never posted a price for that game, even after the deferred resolver ran — is **voided, not scored 0**. Scoring it 0 would punish a correct pick for a feed gap; voiding is the honest outcome. Flat picks settle normally with no price.
4. Write `points`, set `status = 'settled'`, and set `settledAt`.

Postponed or cancelled games never reach `final`. Their pending picks are set to `status = 'voided'` with `points` left null, so they count as neither a win nor a loss and drop out of the leaderboard aggregate.

Two conditions void a pick, both evaluated by the settlement cron itself:

- **The schedule row is gone.** The settlement query left-joins `schedule_games`, so a pick whose game was deleted still comes back with a null `gameStatus` and is voided.
- **48 hours past tip-off without a final result.** The backstop.

The 48-hour threshold is what actually catches postponements. `cleanupStaleGames` cannot be relied on: it is scoped to a single `scheduleDayId` (`eq(scheduleGames.scheduleDayId, scheduleDayId)`), and the daily cron only syncs _today_. A game postponed yesterday is therefore never cleaned up — its row lingers with `gameStatus = 1` forever, and only the time threshold notices.

A merely delayed game is never voided early, because the threshold is far longer than any delay. Both paths are idempotent: they act only on `status = 'pending'`.

Idempotent by construction: only rows with `status = 'pending'` are processed.

## Existing game-day lifecycle (for reference)

The worker already tracks game state; the prediction feature should consume it, not duplicate it.

| Mechanism                                   | Location                                                | Behaviour                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gameStatus` (1=scheduled, 2=live, 3=final) | `schedule_games`                                        | Written by schedule sync, refreshed by the live boxscore crawler until `3`                                                                                                                                       |
| Live poller                                 | `apps/worker/src/processors/live-boxscore.processor.ts` | Polls games in the `nba:live:games` Redis set until status `3`, then drops them                                                                                                                                  |
| `cleanupStaleGames`                         | `apps/worker/src/schedule-sync.service.ts`              | Deletes non-final games missing from a day's feed. **Scoped to one `scheduleDayId`**, and the daily cron only syncs today — so it never cleans up a previous day's postponement.                                 |
| `postponedStatus`                           | `schedule_games`                                        | Stored from the feed but **never read**. Verified unreliable: it is `'A'` for whole seasons (2020-21, 2021-22) including games that finished normally, and `'N'` for 2026-27. Do not use it as a postponed flag. |

Note: the live poller treats a game that never reaches `final` as still pending (`remaining++`), so a postponed game keeps the boxscore scheduler alive. Pre-existing behaviour, not introduced here.

## Frontend

The UI is server-backed. `apps/frontend/src/components/predict/predictions.ts` no longer touches `localStorage`; it exposes `usePredictions()`, which reads `GET /predictions/me` and indexes the result by game and then mode:

```ts
type PicksByGame = Record<string, { flat?: SavedPrediction; weighted?: SavedPrediction }>;
```

Both modes are always written together, so the UI shows one side picker and one action:

- `PredictionPanel.tsx` — one side picker, a read-only two-row summary (Classic / Weighted) showing what each row would pay, and a single **Place pick** / **Update pick** button plus one Remove. The confidence slider is gone: the backend has no such field and scoring ignores it.
- `GameCard.tsx` — one pill per mode, showing the locked price while open and the points once settled; a weighted pill with `pendingPrice` reads `awaiting line`.
- `predictions.ts` — `SavedPrediction` carries `pendingPrice` so the panel can distinguish "locked at 2.12" from "no line yet".
- `slate.ts` — a game counts as picked when either mode has a pick; resolved/correct counts are per pick, not per game.
- `dashboard.tsx` / `profile.tsx` — the two leaderboards and the stat cards read the API. The rank card shows the better of the two boards and names it.
- `LeaderboardPanel.tsx` — `LeaderboardEntry` moved here; `lib/mock-data.ts` is deleted.

One bug was found and fixed while verifying this phase:

1. **Profile history was always empty.** It cross-referenced a −200/+200 day `games/range`, but that endpoint rejects any span over 31 days, so the request 400'd and no rows ever rendered. Pre-existing, not introduced here. The profile now builds history straight from `/predictions/me`, which already returns the game, so no schedule window is needed at all.

## Phases

1. **Schema** ✅ — `game_odds_snapshots`, `prediction_picks`, and the `predictionMode` + `predictionStatus` enums; `bun run generate` + `bun run migrate`.
2. **Odds ingestion** ✅ — shared parser, worker cron, and the backend's Redis cache with on-demand refresh. Verified against the live feed.
3. **Backend API** ✅ — `predictions.controller.ts` / `predictions.service.ts`, locking on submit, leaderboard query. Covered by unit tests plus a live database check.
4. **Settlement** ✅ — `prediction-settlement.service.ts`; scores final games from the locked price and voids abandoned picks. Covered by unit tests plus a live database check.
5. **Frontend** ✅ — API-backed picks store, mode-aware panel and cards, real leaderboards; `mock-data.ts` and the `localStorage` store are gone.
6. **Cleanup** ✅ — `mockLeaderboard` / `mockWeightedLeaderboard` deleted with the rest of `mock-data.ts`; the old `iknoball.predictions.v1` key is removed on first load.
7. **One-button pick + opening-line fallback** ✅ — `POST /predictions` writes both modes in one transaction; a weighted pick with no line locks as `pendingPrice` and the odds worker resolves it from the opening line on a later sync; an unpriced weighted pick on a final game is voided rather than scored 0. Covered by unit tests plus live database and worker checks.

## Verification

- **Unit** ✅ — `predictions.scoring.spec.ts`: de-vig maths, the ceiling, flat/weighted payouts, underdog-vs-favourite weighting, equal EV both sides.
- **Service** ✅ — `predictions.service.spec.ts`: tip-off rejection, closed games, both rows written in one transaction on the same side, flat never priced, `pendingPrice` only for an unpriced weighted row, a stale price still locks, the upsert `set` never touches the conflict target, leaderboard ordering, preview shape.
- **Odds cache** ✅ — `odds.service.spec.ts`: cache hit avoids the feed and the database, a second call fetches once, live refresh records a snapshot and caches for 300s, matching by team ids when the feed omits `gameId`, book preference and fallback, fallback to the stored snapshot when the feed is unreachable or has no price, unpriced games cached for 60s, lock holders skip the fetch, and a Redis failure still serves odds.
- **Settlement** ✅ — `prediction-settlement.service.spec.ts`: flat and weighted payouts, the ceiling, correct/wrong, voiding by missing row, by timeout, and for a weighted pick that never got a price, a flat pick with no price still scoring, unreadable and tied finals left pending, mixed batches, idempotency.
- **Odds sync / deferred pricing** ✅ — `odds-sync.service.spec.ts`: the opening line is preferred over the current line, the away side, falling back to the current line when there is no opening, book fallback, no snapshot is a no-op, several picks on one game, and resolution still runs when the feed is empty.
- **Pinnacle parser** ✅ — `pinnacle-feed.spec.ts`: the league rule for all five game-id prefixes, American→decimal both signs, matchup parsing that drops props (no home/away alignment), moneyline parsing that ignores spreads/totals/half markets and `participantId`-only props, and the join dropping unpriced games.
- **Pinnacle provider** ✅ — `pinnacle-odds.client.spec.ts`: preseason slate → `5270`, regular → `487`, a straddling window → both, empty slate → no request, name→id mapping into a single `Pinnacle/CW` book with null openings, and an unresolvable name dropped.
- **Fallback composition** ✅ — `fallback-odds.provider.spec.ts`: CDN prices kept and only uncovered games added, CDN preferred on an overlap, each source surviving the other being down, and an unidentifiable fallback game dropped.
- **Source order (backend)** ✅ — `odds.service.spec.ts`: Pinnacle served without touching the CDN, its snapshot recorded with null openings, its price cached under the game key, the CDN used when Pinnacle has no price or is unreachable, and the stored snapshot used when both are empty.
- **Source order (worker)** ✅ — `fallback-odds.provider.spec.ts`: Pinnacle prices kept and only uncovered games taken from the CDN, Pinnacle preferred on an overlap, each source surviving the other being down, and an unidentifiable game dropped.
- **Cross-source parity** ✅ — compared the two live feeds game by game: 3 games priced by both, Pinnacle vs CDN differing by 0 points on home and at most 1 on away, while the CDN's own opening-vs-current swing reached 6. Recorded under `Decisions`, and reproducible with `.amp/in/odds-research/compare-all-games.mjs`.
- **Live Pinnacle run** ✅ — the compiled clients against the real database and the live API: the 12-game slate resolved to a single league (`5270`), all 12 being preseason; Pinnacle priced 3; all team names mapped; the worker's composition with a CDN stub merged to 3; and the backend's `getGameOdds('0012600009')` returned **Pinnacle/CW 1.5714/2.42, source live** — where the CDN-first order had returned FanDuel — while a game neither source prices returned null rather than throwing.
- **Parser** ✅ — fixture test against archived payloads, including entries with no `gameId`, no team ids, a duplicated book, and a missing `odds_trend`.
- **Integration** ✅ — a pick created after the line moves still settles on the locked price; verified against the dev database, including the leaderboard's raw-SQL aggregation with voided rows excluded and a second settlement pass proving idempotency.
- **End-to-end (browser)** ✅ — signed in against the running stack and drove the real UI: placed a flat and a weighted pick on one game (weighted locked 1.94 from FanDuel/US, matching the hand-computed de-vig), confirmed the conflict, no-odds, and per-mode-remove paths, then read the dashboard and profile back with a settled pick present.
- **Live feed** ✅ — the backend fetched real odds from the CDN end to end: a snapshot persisted with raw 2/1.82 and opening 1.926, a Redis entry at `ttl=284s`, a second request served from cache with no new snapshot, and a weighted pick locking `2.098901` — exactly `deVig(2, 1.82).home`.
- **Live one-button + deferred price** ✅ — against `iknoball_dev`: one `POST` with no `mode` wrote both rows (flat `locked=null`, weighted `locked=2.1184939091915838` from FanDuel/US, matching the hand-computed de-vig of raw 1.806/2.02); a submit on an unpriced game wrote flat `locked=null` and weighted `locked=null, pendingPrice=true`; the resolver then locked the seeded opening line (opening 2.05/1.78 vs current 1.95/1.85) at `2.151685393258427` — the de-vig of the **opening**, not the current line — and a second run reported `priced: 0` with the value unchanged; `DELETE` removed both rows; settlement voided an unpriced weighted pick on a final game (`voided=1`).

## Risks and gotchas

Verified against archived payloads:

| Risk                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gameId` absent from every game in some snapshots                                                                                                   | Resolve by team ids + date; never assume the field exists                                                                                                                                                                                                            |
| Team ids sometimes missing entirely (4 of 21 games in one snapshot)                                                                                 | Skip unresolvable entries; they are a minority                                                                                                                                                                                                                       |
| Same book listed twice (`Novibet` GR and CY, identical odds)                                                                                        | Dedupe on `id` + `countryCode`                                                                                                                                                                                                                                       |
| `odds_trend` and `spread` fields are optional                                                                                                       | Treat as nullable                                                                                                                                                                                                                                                    |
| Some games have a single book, so consensus is meaningless                                                                                          | Pin FanDuel, fall back to any single book                                                                                                                                                                                                                            |
| Akamai gates `cdn.nba.com` on the header set, not the IP or the client — a request without the browser-shaped headers gets `403` from every runtime | Send the full set from `oddsHeaders()` (notably `Referer: https://www.nba.com/` plus `Sec-Fetch-*`). Node and Bun both get `200` with it; `curl` gets `403` regardless. Never trim headers from the client, and run ingestion tests under Node or Bun, never `curl`. |
| Endpoint is undocumented with no SLA                                                                                                                | Narrow `OddsProvider` seam, plus a stored-snapshot fallback so a feed outage costs freshness, not availability                                                                                                                                                       |
| Pinnacle carries **no opening line**, and it is now the primary source                                                                              | A deferred pick can only lock an opening line when the CDN happened to price the game; otherwise it locks Pinnacle's current line at resolve time. A game Pinnacle prices needs no deferral at all, because it locks at submit.                                      |
| Pinnacle is an **undocumented internal endpoint**, and every betting domain is DNS-blackholed on some networks (Indonesian ISPs)                    | Both sources sit behind the `OddsProvider` seam and fail soft, so the CDN still answers if Pinnacle is unreachable. A domestic-network deployment needs a DNS-over-HTTPS resolver or non-domestic egress to reach Pinnacle at all.                                   |
| File covers a rolling multi-day window, not just today                                                                                              | Filter to the games actually on the slate                                                                                                                                                                                                                            |
| Offseason / no games                                                                                                                                | Empty `games` array must not throw or wipe data                                                                                                                                                                                                                      |

## Decisions

| Question                  | Decision                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick close time           | Exactly at tip-off, no buffer                                                                                                                                                                                                                                                                                                                                     |
| Both modes on one game    | One submit writes both modes on one side, in one transaction                                                                                                                                                                                                                                                                                                      |
| Leaderboard independence  | Independent; weighted points do not feed the flat board                                                                                                                                                                                                                                                                                                           |
| Contest format            | Season-long ranked leaderboard, so the cap stays open                                                                                                                                                                                                                                                                                                             |
| Postponed games           | Voided — neither a win nor a loss                                                                                                                                                                                                                                                                                                                                 |
| Delayed tip-off           | Follow the live game status; kept fresh by the worker                                                                                                                                                                                                                                                                                                             |
| Void detection            | Settlement cron: missing schedule row, or 48h past tip-off                                                                                                                                                                                                                                                                                                        |
| `prediction_picks.gameId` | Plain text, no FK — protects the existing delete path                                                                                                                                                                                                                                                                                                             |
| Odds freshness            | Backend serves per-game odds from Redis (5 min TTL), refreshing from Pinnacle then the CDN on expiry                                                                                                                                                                                                                                                              |
| Odds cache keys           | `odds:game:{gameId}` (300s), `odds:lock:{gameId}` (10s single-flight)                                                                                                                                                                                                                                                                                             |
| Source order              | Pinnacle first, NBA CDN as fallback — the CDN is sparse, Pinnacle covers far more of the slate                                                                                                                                                                                                                                                                    |
| Opening-line variance     | **Accepted.** Measured on the live feeds: Pinnacle vs CDN differ by ≤1 point, but CDN opening vs CDN current differs by up to 6. Deferred picks lock the opening line when the CDN priced the game, otherwise Pinnacle's current line. Both sources de-vig, so EV stays equal within a game; the residual spread is the accepted cost of locking a promised price |

## Resolved edge cases

1. **Tip-off race.** A request landing after `gameDateTimeUTC` is rejected by the server-side check. The client clock is never trusted.
2. **Delayed tip-off.** The close check uses live game status, not just the scheduled timestamp. The worker keeps `gameStatus` fresh, so a delayed game that has not started stays pickable and one that has started closes.
3. **Postponed games.** Voided — `status = 'voided'`, `points` null, excluded from the leaderboard. Detected by the settlement cron when the schedule row is gone, or when tip-off is more than 48 hours past without a final result, so a merely-late game is never voided early.
4. **Different sides per mode.** Not allowed. Both modes must name the same side.

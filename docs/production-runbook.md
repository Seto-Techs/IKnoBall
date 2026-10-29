# Production runbook

How IKnoBall is deployed to production on Dokploy, and how to prove it is up.
Staging is the same shape: same images built from the same workflow, same compose
structure, different tag, hostnames, and env.

```
                       ┌──────────────── Dokploy host ─────────────────┐
  iknoball.setotechs.com ──▶ web    (nginx,   :3000)                     │
  api-iknoball.setotechs.com ─▶ api (Nest,    :3000, migrates on boot)   │
                               ├── worker (Nest standalone, no port)     │
                               └── redis  (BullMQ + live cache, :6204)   │
                                              │                          │
                                              ▼                          │
                                    Postgres (external)                  │
                       └──────────────────────────────────────────────────┘
```

Traefik routes by host; every public hostname needs a router label in the
compose (see below) or it answers 404.

## 0. Where production stands (2026-10-20)

| Step                       | State                                                  |
| -------------------------- | ------------------------------------------------------ |
| Migrations (11, 19 tables) | applied to `iknoball_prod`                             |
| Teams                      | 30                                                     |
| Players                    | 518 (8 are 2026 rookies with no NBA games yet)         |
| Career stats               | 6,324 rows across 510 players                          |
| Schedule 2025-26           | 230 days / 1,400 games, all final                      |
| Schedule 2026-27           | 174 days / 1,274 games, statuses from the feed         |
| Dokploy compose            | `production` deployed (appName `iknoball-prod-f0av90`) |

Today is **opening night**: the 2026-27 regular season tips off 2026-10-20 with
BOS@DET (3pm ET), PHI@NYK (7pm ET), OKC@SAS (9:30pm ET). The 67 games already
marked Final in the schedule are _preseason_ (`001…` game ids), which is why
`player_season_stats` has no 2026-27 regular-season rows yet — and why the
leaderboard is legitimately empty until tonight's games are played and settled.
stats.nba.com has not published any 2026-27 regular-season player aggregate or
game log yet, so nothing is missing that could have been fetched.

## 1. Branches and images

| Branch | Image tag | Dokploy compose |
| ------ | --------- | --------------- |
| `dev`  | `staging` | `staging`       |
| `main` | `prod`    | `production`    |

`.github/workflows/cd.yml` runs on every PR merge into `dev` or `main`: it builds
all four images (`iknoball-be`, `iknoball-fe`, `iknoball-worker`,
`iknoball-discord`) tagged for that environment, then calls `compose.deploy` on
the matching compose, found by name inside the `iknoball` project. So a production
release is a PR merged into `main` — nothing is deployed by pushing a branch
directly.

A build job that fails blocks the deploy job: `deploy` needs all four and refuses
to run if any of them failed or was cancelled, so a broken Discord bot image can
never ship a half-updated stack.

The frontend's API origin is baked in at build time (`VITE_API_URL`), which is why
the `:prod` frontend must be built by that workflow rather than reused from
staging.

## 2. The compose

`deploy/dokploy/production.compose.yaml` is the reviewed copy of what Dokploy
runs. Dokploy keeps its own copy (source type `raw`), so **editing the repo file
changes nothing until it is pasted into Dokploy again**.

It mirrors staging: images pinned by tag, Traefik labels per hostname, `env_file:
.env` for app config, its own Redis. Differences are the image tag, the
hostnames, and the Docker project name, so the two stacks can share a host.

Two details worth knowing:

- The API's healthcheck is `bun -e fetch(...)`. The api image is `oven/bun` with
  no real Node and neither `curl` nor `wget`, so `node` or a shell probe would
  not work.
- The worker waits for `api: service_healthy`. The api entrypoint migrates before
  it listens, so this is what stops the worker racing a fresh database.

## 3. The env

Dokploy stores a compose's env in a `.env` file beside its `docker-compose.yml`,
and that file is **not** injected into containers on its own — the compose opts
in with `env_file: .env`. Every app variable therefore lives in Dokploy's
Environment tab for the `production` compose, and is editable there.

Required values:

```dotenv
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/iknoball_prod"

# Better Auth derives its origin from the request host and falls back to this,
# so it must be the API origin, not the web one.
BETTER_AUTH_URL="https://api-iknoball.setotechs.com"
FRONTEND_URL="https://iknoball.setotechs.com"
BETTER_AUTH_SECRET="<openssl rand -base64 32>"

# Redirect URI must be registered in the Discord portal exactly as
# https://api-iknoball.setotechs.com/auth/callback/discord
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."

# Redis. The compose runs it with this password; service DNS is `redis`.
REDIS_PASSWORD="<generated>"
REDIS_URL="redis://:<REDIS_PASSWORD>@redis:6379"
REDIS_LOGGING_URL="redis://:<password>@log-redis:6379"

# Auth mail is queued here and sent by the email worker, not over SMTP.
# Reach it over the `workers_redis-email` network, not the published port: 6199
# is firewalled off from Docker bridges on this host (see section 6).
EMAIL_QUEUE_REDIS_URL="redis://:<password>@email-redis:6379"
EMAIL_QUEUE_KEY="queue:iknoball"
EMAIL_INTERNAL_TOKEN="<generated>"
EMAIL_FROM_NAME="IKnoBall"
EMAIL_FROM_ADDRESS_MAP='{"verify":"...","reset":"...","loginOtp":"...","reminder":"..."}'

NBA_CURRENT_SEASON="2026-27"
```

Deliberately absent:

- **SMTP.** `EMAIL_SMTP_*` is only read by `EmailService.send()`, which nothing
  calls. `SmtpClient` builds a transport at boot without connecting, so missing
  values are harmless.
- **`JWT_SECRET`, `ACTIVITY_LOG_KEY`, `APP_URL`.** Carried over from another
  project's env; nothing in this repo reads them.
- **S3.** `S3Service` is provided and exported but never injected. `AWS_*` only
  needs to exist if that changes.

The NBA and odds variables otherwise have working defaults. `NBA_CURRENT_SEASON`
is what the API reports as the current season, served as written — bump it at the
rollover each July. Unset, the API derives the season from the calendar instead,
so a missing value can never pin it to a hardcoded year. If the two disagree the
API logs `NBA_CURRENT_SEASON=... disagrees with the calendar` once at boot and
serves the configured value anyway; that warning is the signal that the API has
drifted from the worker, which always syncs by the calendar.
`NBA_SEASON_START_DATE` only affects the derived path, for pinning opening night
when the schedule has not been synced yet.

## 4. First boot

The database is already migrated and seeded, so a deploy is just the containers:

1. Dokploy → project `iknoball` → compose `production` → **Deploy**.
2. Watch the api logs. It runs `drizzle-kit migrate` (a no-op now) and then
   starts listening.
3. `curl -s https://api-iknoball.setotechs.com/api` →
   `{"is_success":true,"message":"Service is healthy.","data":{"status":"ok"}}`

On a genuinely empty database, seed it once the api is healthy and the worker is
running:

```bash
docker exec -it iknoball-prod-f0av90-worker-1 node dist/run-bootstrap.js
```

`run-bootstrap.js` is idempotent and prints a coverage report; it exits non-zero
if teams or games come up short. Flags: `--seasons=2025-26,2026-27` to seed more
than the current season, `--skip-players` / `--skip-schedule` to run one half. The
player step enqueues one career crawl per player, which the worker drains at
concurrency 2, so `player_season_stats` fills in over the following minutes.

## 5. Proving it is up

```bash
# Reference data
psql "$DATABASE_URL" -c 'select count(*) from teams;'                    -- 30
psql "$DATABASE_URL" -c 'select "seasonYear", count(*) from schedule_days group by 1;'

# API
curl -s https://api-iknoball.setotechs.com/api
curl -s https://iknoball.setotechs.com/ -o /dev/null -w '%{http_code}\n'  -- 200

# The season the api is serving. `NBA_CURRENT_SEASON` wins when set, so a value
# left behind at the rollover silently serves last season — compare this with the
# calendar and bump it in Dokploy if they disagree. `bun`, not `printenv`: the
# runner image is oven/bun and the healthcheck already relies on it being there.
# `||`, not `??`: the resolver trims and then tests truthiness, so an empty or
# blank value takes the calendar path — `??` would print a blank line here and
# read as a failed command instead of "calendar fallback".
docker exec "$(docker ps -qf 'name=iknoball-prod.*-api-1' | head -1)" \
  bun -e 'console.log(process.env.NBA_CURRENT_SEASON?.trim() || "(unset: calendar fallback)")'

# Worker: should log "Redis: ready", then schedule sync and live poll
# activity once games are in the window.
```

In the browser: landing page, onboarding's team grid, Discord sign-in, and the
dashboard's last-5-games / top-players panels. Those two panels stay empty until
the new season's first games are played and their box scores are crawled;
`/api/leaders` falls back to the previous season when the current one is more than
a week away.

## 6. Things that are easy to get wrong

- **One worker, not several.** Every cron (`player sync`, `schedule`, `odds`,
  `settlement`, `shot zones`) runs in-process, and the overlap guards are
  per-process (`private inFlight`). Two replicas double every upstream fetch and
  write duplicate odds snapshots. Settlement is safe to run concurrently (it
  re-asserts `status = 'pending'`), but scaling needs a Redis lock around each
  cron first.
- **The worker must run on Node.** `cdn.nba.com` answers Bun's fetch with a 403,
  which breaks the live box-score poll and the shot-zone sync. The worker image
  asserts `node` is not bun at build time.
- **`BETTER_AUTH_SECRET` is mandatory.** Unset, Better Auth falls back to a
  publicly known constant and anyone can forge a session.
- **The Discord redirect URI is exact.** No wildcards; a hostname change means
  re-registering it.
- **Migrations only run from the api entrypoint.** The worker assumes the schema
  exists; that is what the healthcheck dependency is for.
- **Port 6199 is unreachable from the containers, even though it works from
  outside.** `workers-aumrfa-email-redis-1` publishes 6199 on the host, but a
  connection from any Docker bridge to it is dropped — `nc` to
  `195.85.19.218:6199` and to `172.17.0.1:6199` both hang, while 5454 (Postgres)
  is fine. Because the SYNs are dropped rather than refused, node-redis retried
  forever and sign-up hung with no error. The api now joins `workers_redis-email`
  and talks to `email-redis:6379` directly, the same way staging reaches
  `log-redis` on `workers_redis-log`. If you would rather use the published port,
  open 6199 to the Docker bridge subnet on the host.
- **`EMAIL_INTERNAL_TOKEN` must match the worker's `INTERNAL_TOKEN_IKNOBALL`.**
  The email worker validates the payload against its own token, so a generated
  value silently gets the mail dropped. Copy it from the `workers` compose's
  `email-switcher` environment.
- **`env_file: .env` is not automatic.** Dokploy writes the env file but does not
  inject it. Drop that line from a service and it boots with no config.
- **`compose.create` ignores `sourceType: "raw"`.** It stores the compose as
  `github`, so the first deploy fails in ~30ms trying to clone a repo that was
  never configured. Send a follow-up `compose.update` with `{"sourceType":"raw"}`
  and check `compose.one` before deploying. `randomize` and `appName` are also
  decided at create time — passing `appName` still yields a random suffix.
- **CD deploys, it does not push compose content.** The workflow only calls
  `compose.deploy`, so edits to `deploy/dokploy/production.compose.yaml` reach
  production only when the compose is pasted into Dokploy again. Dokploy's copy
  is the source of truth at runtime.
- **The career crawl used to wedge itself.** `PlayerIndexClient` aborted only the
  header wait, so `await response.json()` on a stalled body hung forever: the job
  stayed `active` for the life of the process, holding one of two concurrency
  slots, and the queue slowly stopped. Fixed — the abort covers the body read, so
  a stalled body rejects with `AbortError` (retryable). The same shape was fixed
  in the schedule and box-score clients, and pinned by a test.
- **Backfills are manual.** `sync:boxscore`, `refresh:shot-zones` and
  `backfill:starters` are one-off scripts, not crons.
- **Box scores have no cron.** Shot zones and settlement run on crons, but nothing
  crawls a game's box score after it finishes — only the live poll does, while it
  is live. A game that finishes while the worker is down keeps an empty box score
  on the game page until `sync:boxscore` runs by hand. Worth a cron.

## 7. The Discord bot

A fourth container: `ghcr.io/seto-techs/iknoball-discord:<tag>`, declared as the
`discord` service in `deploy/dokploy/production.compose.yaml`. It publishes no
port — it dials out to Discord's gateway — and it shares the compose's Postgres
and Redis with the api and the worker. `depends_on: api: service_healthy` is
load-bearing: the bot calls the api's `/internal/*` routes, and those need the
schema the api's entrypoint migrates.

The process exits non-zero when `DISCORD_TOKEN` is missing or rejected, on
purpose. A container that restarts in a loop with
`discord bot failed to start: ... 401 Unauthorized` is telling you the env did not
take — see 7.4.

### 7.1 Env

```dotenv
# Bot → Discord. Rotate below; nothing else in the stack uses it.
DISCORD_TOKEN="..."

# Bot → api. `IKNOBALL_API_URL` is the compose service name: /internal is never
# reachable from the internet.
IKNOBALL_API_URL="http://api:3000"
INTERNAL_API_TOKEN="<openssl rand -hex 32>"

# Kill switch. `false` stops posting, locking, settlement edits and picks; see 7.5.
DISCORD_ENABLED="true"

# Who may run /status. Comma-separated Discord user ids. Unset means nobody.
DISCORD_OPERATOR_IDS="111111111111111111,222222222222222222"

DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/iknoball_prod"
REDIS_URL="redis://:<REDIS_PASSWORD>@redis:6379"
```

`INTERNAL_API_TOKEN` is one value read by **two** services in the same compose
env: the api validates it, the bot sends it as `x-internal-token`. They cannot
differ unless someone set one of them per-service instead of in the shared env.

`DISCORD_OPERATOR_IDS` fails closed. Unset or blank is not "everyone" — it is
"nobody", and `/status` answers every caller with
`` `/status` is for the bot operator only. `` Add your own Discord user id (right
click your name → Copy User ID, with Developer Mode on) and redeploy.

### 7.2 Deploy path

1. PR merged into `main` → `.github/workflows/cd.yml` builds `iknoball-be`,
   `iknoball-fe`, `iknoball-worker` **and** `iknoball-discord`, each tagged `prod`.
2. The `deploy` job calls `compose.deploy` on the `production` compose.
3. Dokploy pulls `:prod` for every service, including `discord`.

Same caveat as the rest of the stack: CD deploys, it does not push compose
content. The repo's `production.compose.yaml` is the reviewed copy; Dokploy's copy
is what runs. A `discord` service that is missing there is a bot that is never
deployed, no matter what the workflow built.

Restarting only the bot (an env change, a stuck gateway session) is Dokploy →
compose `production` → `discord` → **Restart**. Note that `env_file: .env` is read
when the container is created, so a _changed variable_ needs a redeploy/recreate,
not a restart.

On boot the bot logs two lines worth looking for (real output, `enabled=false`
because this orb had the switch off):

```
[DiscordClientService] Discord: logged in as IKnoBall#1865 (0 guilds, enabled=false)
[DiscordClientService] Discord: registered 7 global commands (/ping, /picks, /leaderboard, /setup, /status, /link, /unlink)
```

`enabled=` on the first line is the kill switch as the process read it, and the
guild count is what the gateway reports — the two numbers to check after any
env change.

### 7.3 `/status`

Operator-only, ephemeral, and it answers while the kill switch is off — a
diagnostic the switch kills is not a diagnostic.

```
**IKnoBall bot** · active
guilds: **12** connected · **12** configured
last slate post: 2 hours ago (<t:1793106000:f>)
cards: **412** posted · **377** locked · **301** settled
queue: 3 waiting
```

Discord renders `<t:…:R>` in the reader's own timezone, which is why both the
relative and the absolute time are on that line.

| Line                  | Source                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `active` / `paused`   | `DISCORD_ENABLED` as the process read it at boot                                                  |
| `guilds: N connected` | the gateway client's `guilds.cache.size` (`—` while the client is not ready)                      |
| `N configured`        | `select count(*) from discord_guilds where enabled and "leftAt" is null`                          |
| `last slate post`     | `max("createdAt")` over `discord_cards` — written when the slate is claimed, just before the send |
| `posted`              | `count(*)` over `discord_cards`                                                                   |
| `locked` / `settled`  | `count("lockedAt")` / `count("settledAt")` — non-null stamps only                                 |
| `queue`               | `RateLimiter.depth()` — queued plus in-flight outbound Discord calls                              |

Everything is read live on every invocation; nothing is cached. What a _fresh_
database looks like — the real output of `formatStatus(await collectStatus(...))`
against this project's database (empty `discord_cards`, empty `discord_guilds`) and
a real gateway login (the bot is in 0 guilds), with two calls parked in the rate
limiter so `queue` is visibly not a constant:

```
**IKnoBall bot** · active
guilds: **0** connected · **0** configured
last slate post: never
cards: **0** posted · **0** locked · **0** settled
queue: 2 waiting
```

`queue: unknown` only appears if `RateLimiter.depth()` is missing from the deployed
build; that is a version skew, not a normal state.

Reading it: `connected` should equal the number of servers the bot is actually in
(the Developer Portal does not show this; `/status` is the count). `configured`
is how many of them ran `/setup`. `configured` below `connected` is normal for a
guild that invited the bot and never finished setup. `locked` should be close to
`posted` minus today's open cards; `settled` trails `locked` by the worker's
settlement cadence. A `last slate post` older than 24 hours while `active` is the
one number that means "posting is broken", not "nothing happened today".

### 7.4 Token rotation

**Discord bot token**

1. Developer Portal → Applications → IKnoBall → **Bot** → **Reset Token** → copy
   it (the portal shows it once).
2. Dokploy → `production` compose → Environment → set `DISCORD_TOKEN`. Same for
   the `staging` compose, with the staging token — the two environments must not
   share a bot token: one gateway session per token, and two processes on one
   token means duplicated posts and double the rate-limit spend.
3. **Deploy** the compose (recreate, so the new `env_file` is read). Restarting
   the container alone re-reads the old env file.
4. The old token stops working the moment it is reset. The running container keeps
   its gateway session until it reconnects, then the login fails, the process exits
   non-zero, and `restart: unless-stopped` retries — so expect a restart loop until
   step 3 lands. That loop is the signal, not a separate bug.
5. Verify: the `logged in as` line in the logs, `/status` answering you, and one
   pick click on a live card.

Nothing else uses the bot token: no data migration, no re-invite, no slash-command
re-registration (the bot re-registers its global commands on every boot).

**`INTERNAL_API_TOKEN` (bot ↔ api)**

One shared secret, two readers: the api's `InternalTokenGuard` and the bot's
`IknoballClient`. If they drift, every bot → api call is a 401: pick clicks and
`/picks` fail, while `/status` keeps working (it reads Postgres and the gateway
directly). The bot logs the failure and the user sees the generic "Something went
wrong" reply. When it is missing entirely the bot says so at boot, as a warning:
`INTERNAL_API_TOKEN is not set: every bot → API /internal call will be rejected.`

1. Generate one: `openssl rand -hex 32`.
2. Set it **once** in the compose's shared env (not per service).
3. Deploy the compose so both containers are recreated from the same file.
4. Verify from anywhere:

   ```bash
   curl -s -X POST https://api-iknoball.setotechs.com/api/internal/health \
     -H "x-internal-token: $INTERNAL_API_TOKEN"
   # {"is_success":true,"message":"Internal API is reachable.","data":{"status":"ok"}}
   ```

   `401` means the api does not have that value (unset, or a stale container). The
   response body tells the two apart: `Internal API is not configured.` is an api
   with `INTERNAL_API_TOKEN` unset (it also logs
   `INTERNAL_API_TOKEN is not set: ...` once, not per request), while
   `Invalid internal token.` is a value that does not match — a drift between the
   two services.

5. A rolling recreate means a window where one side has the new value and the other
   the old one. Expect a minute of 401s, not a broken deploy.

### 7.5 The kill switch

`DISCORD_ENABLED=false` is the switch, and it is read **once, at boot** (the
config service validates the environment when Nest builds it). An env change
without a restart does nothing — that is the one way to get this wrong.

1. Dokploy → `production` → Environment → `DISCORD_ENABLED="false"`.
2. Deploy (recreate) the compose, or at least the `discord` service.
3. The boot line says `enabled=false`, and `/status` starts with
   `paused (`DISCORD_ENABLED=false`)` plus
   `_Posting, locks and settlement edits are off; pick clicks are refused._`

What it stops:

| Stopped          | Where                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Slate posts      | the minute scheduler returns before it looks at any guild, and warns once: `DISCORD_ENABLED=false: no slate is being posted in any guild.` |
| Tip-off locks    | the lock sweep returns before `run()`, so no card is edited and no `lockedAt` is stamped                                                   |
| Settlement edits | the settlement sweep, same                                                                                                                 |
| Picks            | a click is acknowledged and answered with "Picks are paused right now… nothing was saved"; nothing reaches the api                         |

What it does not stop: the gateway connection, slash-command registration, and the
read-only commands (`/picks`, `/leaderboard`, `/status`). The bot stays invited and
connected, so turning the switch back on needs no re-invite.

Turning it back on: set `true` and redeploy. If it is still inside a guild's post
hour, the next minute posts the slate (a paused tick never spends the day key, so
nothing is skipped); otherwise the next day's slate is the next post.

### 7.6 Reading the logs

Every interaction writes exactly one line, from the router. Real output (a no-op
handler, so both times are 0):

```
[Nest] 354648  - 10/27/2026, 6:05:30 PM     LOG [InteractionRouter] interaction outcome=ok guild=1122334455 user=953225a9f5 kind=button id=pick:0022600127:home ack=0ms latency_ms=0
```

The part after `[InteractionRouter]` is the structured line; the prefix is Nest's
own logger. Everything is `key=value` on one line so a filter does not have to
parse JSON, and the event word comes first so
`rg 'interaction '` selects these lines out of everything else the process logs.

| Field         | Meaning                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outcome`     | `ok`, `unknown` (no handler for that id), `ignored` (not a button or command), `paused` (refused by the kill switch), `failed` (the handler threw; the user got the generic reply)                                                                                                                                                    |
| `guild`       | guild id, or `dm`                                                                                                                                                                                                                                                                                                                     |
| `user`        | a 10-hex HMAC of the Discord id, keyed with a salt generated per process. It is stable inside one process and **different after a restart**, so it correlates activity within a deploy, not across one. It is deliberately not reversible: Discord ids are snowflakes, so an unkeyed hash of one day's ids is a GPU dictionary attack |
| `kind` / `id` | `button` + custom id, or `command` + `/name`                                                                                                                                                                                                                                                                                          |
| `ack`         | ms from receipt to the first acknowledgement, or `none`                                                                                                                                                                                                                                                                               |
| `latency_ms`  | ms from receipt to the handler returning                                                                                                                                                                                                                                                                                              |

`ack=none` with `latency_ms` over 3000 is the signature of Discord's silent
failure: the user saw "This interaction failed" and nothing else happened. That is
the number to look at first; everything else on the line explains which action it
was.

Useful greps in Dokploy's log view:

```bash
rg 'outcome=failed'          # handler exceptions
rg 'ack=none'                # missed the 3-second deadline
rg 'outcome=paused'          # users clicking during a maintenance window
rg 'guild=1122334455'        # one server
```

The other lines worth knowing:

- `SlateScheduler`: `Slate post failed for guild <id>: <reason>` — one guild, the
  rest of the sweep continues.
- `CardSweep`: `tip-off lock: edited N card(s) in M message(s)…`,
  `settlement: edited …`, `… is dead, dropping N card(s)` (a 403/404/unknown
  message, never retried), `… pausing for Ns (failure N)` (a transient failure:
  the run stopped and backs off, doubling up to 15 minutes).
- `Discord client error: …` — a gateway-side error from discord.js; it reconnects
  on its own.

### 7.7 Playbooks

**A 401.** Three different 401s, three different fixes:

| Where                     | Symptom                                                                           | Fix                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bot → api                 | pick clicks and `/picks` fail, `/status` fine, api logs `Invalid internal token.` | `INTERNAL_API_TOKEN` drifted between the two services — 7.4              |
| Bot → Discord, at boot    | `discord bot failed to start: … 401 Unauthorized`, restart loop                   | `DISCORD_TOKEN` is wrong, reset, or not in the recreated container — 7.4 |
| Bot → Discord, at runtime | REST 401s in the logs after a token reset                                         | the old token is still in the container; redeploy                        |

A runtime 401 is not retried: `RateLimiter` halts the outbound queue on it
(`Discord rejected the bot token (401); outbound REST is halted until this process
restarts.`) and fails every queued call, because a bad token cannot recover by
trying again. So the symptom is "every edit and post stopped at once", and the fix
is always a redeploy with a good token — never a wait.

**Repeated 429s.** The rate limiter (`apps/discord/src/infrastructure/rate-limiter.ts`)
is the single outbound queue, and it waits out `retry_after` instead of failing a
card edit. Repeated 429s therefore mean something is spending the same token's
budget outside it:

1. Is more than one `discord` container running, or the same token configured in
   two environments? One gateway session per token — stop the extra one.
2. Is `queue` in `/status` growing without draining? That is the queue waiting on
   a bucket, which is normal during a settlement burst.
3. Still 429ing after that: set `DISCORD_ENABLED=false` and redeploy (7.5). It
   stops all outbound work while leaving the connection up, which is what breaks
   the loop; Discord's invalid-request ban (10,000 per 10 minutes) is the thing
   being avoided.

**A guild going dark.** One server stops getting slates while the others are fine.

1. Logs: `Slate post failed for guild <id>: Missing Access` (a 403 on the send) or
   `… is dead, dropping N card(s)` (a 403/404 on an edit). Both name the guild and
   the channel.
2. Cause, in order of likelihood: the bot was removed from that channel's
   permissions; the channel was deleted; the bot was kicked. `/setup` points at a
   channel id — if the channel was replaced, run `/setup` again in that server.
3. Blast radius is one guild by design: a 403 in one guild is caught and the loop
   moves on to the next guild, and a 403 on one message marks that message dead and
   continues with its siblings. Both are pinned by tests
   (`apps/discord/src/ops/isolation.spec.ts`, `apps/discord/src/lock/card-sweep.spec.ts`).
4. The dead-message set is in process memory, so a restart retries a dead card once
   — useful after fixing a permission, harmless otherwise.
5. If _every_ guild is dark, it is not a guild: check `guilds: N connected` in
   `/status` (0 means the gateway never logged in — 7.4) and the `DISCORD_ENABLED`
   line.

### 7.8 Things that are easy to get wrong

- **One bot process per token.** Two replicas mean two gateway sessions, duplicate
  slates, and double the rate-limit spend against one budget.
- **The kill switch is boot-time.** Setting `DISCORD_ENABLED=false` in Dokploy and
  restarting nothing changes nothing.
- **`DISCORD_OPERATOR_IDS` fails closed.** Unset means `/status` refuses everyone,
  including you.
- **`INTERNAL_API_TOKEN` is shared.** The bot and the api must read the same value;
  rotating one without the other breaks picks, not `/status`.
- **`DISCORD_ENABLED=false` does not disconnect.** The bot still answers commands
  and still holds a gateway session; if you want it _gone_, stop the service.
- **Slash-command changes need a boot.** Commands are registered globally on ready;
  a new or renamed command appears after the next deploy, and Discord's client-side
  cache can take a few minutes to show it.

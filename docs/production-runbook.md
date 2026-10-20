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

| Step                       | State                                             |
| -------------------------- | ------------------------------------------------- |
| Migrations (11, 19 tables) | applied to `iknoball_prod`                        |
| Teams                      | 30                                                |
| Players                    | 518 (8 are 2026 rookies with no NBA games yet)    |
| Career stats               | 6,324 rows across 510 players                     |
| Schedule 2025-26           | 230 days / 1,400 games, all final                 |
| Schedule 2026-27           | 174 days / 1,274 games, statuses from the feed    |
| Dokploy compose            | `production` created, env saved, not yet deployed |

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
all three images (`iknoball-be`, `iknoball-fe`, `iknoball-worker`) tagged for that
environment, then calls `compose.deploy` on the matching compose, found by name
inside the `iknoball` project. So a production release is a PR merged into
`main` — nothing is deployed by pushing a branch directly.

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
EMAIL_QUEUE_REDIS_URL="redis://:<password>@HOST:6199"
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
is derived from the calendar — the worker logs a warning when the env disagrees —
but the **backend reads it raw** in `leaders`, `standings`, and `players`, so a
stale value makes the API serve the wrong season. Set it, and bump it each July.

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
- **`env_file: .env` is not automatic.** Dokploy writes the env file but does not
  inject it. Drop that line from a service and it boots with no config.
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

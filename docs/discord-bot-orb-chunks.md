# Discord Bot — Orb Chunks

How to split [the 15 issues](discord-bot-issues.md) across parallel orbs without merge pain.
One issue per orb does not work: several issues edit the same wiring files, and Drizzle
migrations have a single append-only journal. So the split follows **file ownership**, not
issue numbering.

**Result: 12 chunks in 3 waves.** Wave 0 is serial; wave 1 is 4 orbs; wave 2 is 5; wave 3 is 2.

---

## Why not one orb per issue

Three shared resources force serialisation:

1. **`packages/database/migrations`** — `meta/_journal.json` is one append-only file with a
   monotonic `idx` and a snapshot hash per entry. Two orbs running `bun run generate` in
   parallel produce two migrations that both claim `idx: 11` and both rewrite the snapshot.
   There is no merge that recovers from this cleanly. **One orb owns every schema change.**
2. **Wiring files** — `apps/discord/src/app.module.ts`, `apps/discord/src/interactions/registry.ts`,
   `apps/backend/src/internal/internal.module.ts`, `apps/backend/src/app.module.ts`. Every
   feature needs one line in at least one of them. Five orbs each adding a line to the same
   file is five conflicts.
3. **`bun.lock` + `package.json`** — any `bun add` rewrites the lockfile wholesale. Two orbs
   installing at once cannot merge.

The fix is the same for all three: **C0 creates every wiring file and every feature stub
before anyone else starts.** After C0, a chunk owns directories and fills in stubs. It never
creates a file another chunk references, and never edits a wiring file.

That single rule is what makes waves 1 and 2 safe to run in parallel.

---

## Wave map

```
wave 0          C0  trunk — workspace, transport, contracts, stubs
                 │
        ┌────────┼─────────┬───────────┐
        ▼        ▼         ▼           ▼
wave 1  C1      C2        C3          C4
        card    internal  schema      policy
        (02,03, api       + migra-     (13)
         04)    (07,15a)  tions
        └────┬───┴────┬────┴─────┬─────┘
             │        │          │
        ┌────▼──┬─────▼──┬───────▼──┬────────┐
        ▼       ▼        ▼          ▼        ▼
wave 2  C5      C6       C7         C8       C9
        link    lock     setup      board    /picks
        (06)    (05,11)  (09,10)    (08)     (15b)
        └───────┴────────┘
                │
          ┌─────┴─────┐
          ▼           ▼
wave 3    C10         C11
          rate limit  ops
          (12)        (14)
```

Wave 1 and wave 2 both read _left to right only_. Nothing in wave 1 waits on another wave-1
chunk; nothing in wave 2 waits on another wave-2 chunk.

---

## Chunk table

| Chunk | Issues                    | Wave | Owns (tree)                                                      | Depends on | Safe alongside |
| ----- | ------------------------- | ---- | ---------------------------------------------------------------- | ---------- | -------------- |
| C0    | DISC-01                   | 0    | `apps/discord/**` scaffold, `internal.module.ts`                 | —          | — (serial)     |
| C1    | DISC-02, 03, 04           | 1    | `apps/discord/src/cards/`, `scripts/`                            | C0         | C2, C3, C4     |
| C2    | DISC-07, 15 (api)         | 1    | `apps/backend/src/internal/` (predictions, picks)                | C0         | C1, C3, C4     |
| C3    | schema for 05, 06, 08, 09 | 1    | `packages/database/`                                             | C0         | C1, C2, C4     |
| C4    | DISC-13                   | 1    | `content/legal/`, `docs/`                                        | —          | everything     |
| C5    | DISC-06                   | 2    | `apps/backend/src/discord-link/`, `linking/`, route              | C3         | C6, C7, C8, C9 |
| C6    | DISC-05, 11               | 2    | `apps/discord/src/lock/`, `settlement/`                          | C1, C3     | C5, C7, C8, C9 |
| C7    | DISC-09, 10               | 2    | `apps/discord/src/setup/`, `scheduler/`                          | C1, C3     | C5, C6, C8, C9 |
| C8    | DISC-08                   | 2    | `internal/leaderboard.controller.ts`, `leaderboard/`, `members/` | C2, C3     | C5, C6, C7, C9 |
| C9    | DISC-15 (cmd)             | 2    | `apps/discord/src/picks/`                                        | C2         | C5, C6, C7, C8 |
| C10   | DISC-12                   | 3    | `apps/discord/src/infrastructure/rate-limiter.ts`                | C6, C7     | C11            |
| C11   | DISC-14                   | 3    | `apps/discord/src/ops/`                                          | C0, C6, C7 | C10            |

Issue → chunk, the other way round:

| Issue | Chunk | Issue | Chunk | Issue | Chunk   |
| ----- | ----- | ----- | ----- | ----- | ------- |
| 01    | C0    | 06    | C5    | 11    | C6      |
| 02    | C1    | 07    | C2    | 12    | C10     |
| 03    | C1    | 08    | C8    | 13    | C4      |
| 04    | C1    | 09    | C7    | 14    | C11     |
| 05    | C6    | 10    | C7    | 15    | C2 + C9 |
|       |       |       |       |       |         |

---

## File ownership

Every chunk's brief says what it owns. This table is the arbitration when two briefs disagree.

| Path                                                       | Owner | Notes                                                |
| ---------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `apps/discord/package.json`, `tsconfig.json`, `Dockerfile` | C0    | No later chunk runs `bun add`. C0 pre-declares deps. |
| `bun.lock`                                                 | C0    | Only C0 installs.                                    |
| `apps/discord/src/main.ts`, `app.module.ts`                | C0    | C0 registers all feature modules as stubs.           |
| `apps/discord/src/config/**`                               | C0    | Token, internal URL, kill switch.                    |
| `apps/discord/src/infrastructure/database.service.ts`      | C0    | Mirrors `apps/worker/src/database.service.ts`.       |
| `apps/discord/src/infrastructure/redis.service.ts`         | C0    | Mirrors the worker's.                                |
| `apps/discord/src/infrastructure/rate-limiter.ts`          | C10   | Stub created by C0, filled by C10.                   |
| `apps/discord/src/api/iknoball.client.ts`                  | C0    | The contract. Methods stubbed; C2/C5/C8 fill bodies. |
| `apps/discord/src/api/types.ts`                            | C0    | Shared request/response types.                       |
| `apps/discord/src/interactions/router.ts`                  | C0    | `custom_id` dispatch + command dispatch.             |
| `apps/discord/src/interactions/registry.ts`                | C0    | Stub handler entries for every feature.              |
| `apps/discord/src/cards/**`, `apps/discord/scripts/**`     | C1    | Payload, emoji map, team records, upload script.     |
| `apps/discord/src/lock/**`, `settlement/**`                | C6    | Cron + card edit after final.                        |
| `apps/discord/src/setup/**`, `scheduler/**`                | C7    | `/setup`, per-guild slate posting.                   |
| `apps/discord/src/leaderboard/**`                          | C8    | `/leaderboard`.                                      |
| `apps/discord/src/members/**`                              | C8    | Guild membership mirror for definition B.            |
| `apps/discord/src/picks/**`                                | C9    | `/picks`.                                            |
| `apps/discord/src/linking/**`                              | C5    | `/link`, `/unlink`.                                  |
| `apps/discord/src/ops/**`                                  | C11   | Kill switch, `/status`, structured logs.             |
| `apps/backend/src/internal/internal.module.ts`             | C0    | Wiring. Nobody else edits.                           |
| `apps/backend/src/internal/internal-token.guard.ts`        | C0    | `X-Internal-Token` + `@AllowAnonymous()`.            |
| `apps/backend/src/internal/health.controller.ts`           | C0    | Proves the guard pattern end to end.                 |
| `apps/backend/src/internal/predictions.controller.ts`      | C2    | Stub from C0.                                        |
| `apps/backend/src/internal/picks.controller.ts`            | C2    | Stub from C0.                                        |
| `apps/backend/src/internal/leaderboard.controller.ts`      | C8    | Stub from C0.                                        |
| `apps/backend/src/discord-link/**`                         | C5    | `discord_links` CRUD, code issue/consume.            |
| `apps/backend/src/app.module.ts`                           | C0    | Adds `InternalModule` + `DiscordLinkModule` once.    |
| `packages/database/src/schema.ts`                          | C3    | Single writer.                                       |
| `packages/database/migrations/**`                          | C3    | Single writer. Never regenerate elsewhere.           |
| `packages/database/src/index.ts`                           | C3    | New table exports.                                   |
| `apps/frontend/src/routes/settings.discord.tsx`            | C5    | New route. Only C5 runs `router:gen`.                |
| `apps/frontend/src/content/legal/privacy-policy.md`        | C4    | Markdown only.                                       |
| `deploy/dokploy/production.compose.yaml`                   | C0    | Adds the bot service + network membership.           |
| `docs/discord-bot-issues.md`                               | —     | Spec. Read-only for every chunk.                     |
| `docs/discord-bot-orb-chunks.md`                           | —     | This file. Read-only for every chunk.                |
| `docs/production-runbook.md`                               | C11   | Token rotation, kill switch.                         |

Rule of thumb when a chunk needs a file it does not own: **stop and report it**, do not edit
it. Either the trunk stub was missing (fix in C0) or the chunk boundary is wrong (fix here).

---

## C0 — Trunk

**Issues:** DISC-01. **Wave 0. Blocks everything.**

**Goal.** Create `apps/discord` as a NestJS standalone workspace that connects to Discord and
proves the two contracts every other chunk depends on: the bot → API client and the
`/internal/*` token guard.

**Owns.** Everything in `apps/discord/**` initially, plus `internal.module.ts`,
`internal-token.guard.ts`, `health.controller.ts`, `apps/backend/src/app.module.ts`,
`apps/backend/.env.example`, `deploy/dokploy/production.compose.yaml`, root `package.json`.

**Build.**

- `apps/discord` mirroring `apps/worker`: same `DatabaseService` / `RedisService` pattern,
  `tsconfig`, `vitest.config.mjs`, `Dockerfile`, `build`/`lint`/`test`/`start` scripts so
  turbo picks it up (root `workspaces` already globs `apps/*`).
- Gateway transport via `discord.js` 14.x, `Guilds` intent only, no privileged intents.
- **Pre-declare every dependency now** so no later chunk runs `bun add`:
  `discord.js`, `sharp`, `@nestjs/schedule`, `@nestjs/config`, `zod`,
  `@iknoball/database`, `@iknoball/predictions`, `@iknoball/schema`.
- `interactions/router.ts`: dispatch buttons by `custom_id` prefix (`pick:`, `link:`,
  `refresh:`) and commands by name, delegating to a registry.
- `interactions/registry.ts`: **stub entries for every handler**, each a file C0 also creates
  and stubs — `pick.handler.ts`, `link.handler.ts`, plus command stubs for `/picks`,
  `/leaderboard`, `/setup`, `/status`, `/ping`. Later chunks fill bodies; they never add
  registry entries.
- `api/iknoball.client.ts`: typed methods `health()`, `placePick()`, `listPicks()`,
  `leaderboard()`, `resolveLink()`. All but `health` throw `NotImplementedError`.
- `apps/backend/src/internal/`: `InternalModule` importing a health controller, the token
  guard, and four **stub** controllers (predictions, picks, leaderboard — each returning 501).
  Register `InternalModule` and an empty `DiscordLinkModule` in `app.module.ts`.
- `INTERNAL_API_TOKEN` in `apps/backend/.env.example`; `apps/discord/.env.example` with
  `DISCORD_TOKEN`, `IKNOBALL_API_URL`, `INTERNAL_API_TOKEN`, `DISCORD_ENABLED`.
- Compose: add a `discord` service mirroring `worker` — same `env_file: .env`, `depends_on`
  `api: condition: service_healthy` and `redis: service_started`, networks `app_net` only, no
  Traefik labels. It reaches the API at `http://api:3000` by service name.

**Must not touch.** `packages/database/**` (C3 owns schema), any business logic in
`predictions.service.ts`.

**Done when.** `/ping` answers in a test guild; `POST /internal/health` with the token returns
200 and without it 401s; `bun run build && bun run lint && bun run test` green; the bot exits
non-zero on an invalid token instead of retrying.

**Watch out.** The `APP_GUARD` from `AuthModule.forRootAsync` runs before route handlers, so
the health controller needs `@AllowAnonymous()` or the token check never executes. Prove it
with a test that hits the route with no session header.

---

## C1 — Card surface

**Issues:** DISC-02, DISC-03, DISC-04. **Wave 1.**

**Goal.** A game becomes a message with team marks, a local tip-off, two pick buttons, and a
per-user ephemeral confirmation.

**Owns.** `apps/discord/src/cards/**`, `apps/discord/scripts/**`,
`apps/discord/src/interactions/pick.handler.ts`.

**Build.**

- `scripts/build-team-emojis.ts`: 30 SVGs from `teams.logoUrl` → 128×128 transparent PNG →
  `POST /applications/{id}/emojis`, names = tricode. Write the resulting id map to
  `cards/team-emojis.ts`.
- `cards/card-payload.ts`: pure function `cardPayload(game, teams) → embed + action row`.
  Classic embed, not Components V2. `<t:UNIX:f>` + `<t:UNIX:R>` in the description.
  `custom_id` = `pick:<gameId>:<side>`. Three buttons: away, home, "Open on web".
- `interactions/pick.handler.ts`: `deferReply({ flags: Ephemeral })` first, **never**
  `deferUpdate()`, then call `client.placePick()` and `editReply()` with the confirmation.
  Since C2 may not be merged yet, the client method throws `NotImplementedError` — catch it
  and reply "saving is not wired up yet" so the handler is testable in isolation.

**Must not touch.** `interactions/registry.ts`, `api/**`, `app.module.ts`, `packages/database`.

**Done when.** A real game produces a card whose tip-off renders in the reader's timezone and
whose three buttons respond; two users clicking different sides each see only their own
confirmation; a snapshot test covers the payload shape; re-clicking the same side is a no-op.

---

## C2 — Internal API

**Issues:** DISC-07, and the endpoint half of DISC-15. **Wave 1.**

**Goal.** A token-authenticated HTTP door onto the existing prediction services, so the bot
never forks the tip-off check or the two-mode write.

**Owns.** `apps/backend/src/internal/predictions.controller.ts`,
`apps/backend/src/internal/picks.controller.ts`, their Zod DTOs, and specs.

**Build.**

- `POST /internal/predictions` taking `{ userId, gameId, side }` → `placePick` unchanged.
- `GET /internal/picks?userId=` → `listPicks` unchanged.
- Map service exceptions to status codes the bot can branch on: closed picks stay 400 with the
  existing message, unknown user 404, unknown game 404.
- Per-`userId` throttle so a button-mashing script cannot hammer the DB.
- Tests: two rows written (flat + weighted) on the same side; tip-off past writes nothing;
  missing token 401s; wrong token 401s; unknown user 404.

**Must not touch.** `internal.module.ts`, `internal-token.guard.ts` (C0's),
`predictions.service.ts` (reuse, do not modify), `packages/database`.

**Done when.** `bun run backend:test` covers the five cases above and the endpoint works
against a real linked user id.

---

## C3 — Schema and migrations

**Issues:** the tables DISC-05, DISC-06, DISC-08, DISC-09 need. **Wave 1. Single writer.**

**Goal.** Every table and column the bot needs, in one migration set, so no other chunk ever
runs `bun run generate`.

**Owns.** `packages/database/src/schema.ts`, `packages/database/src/index.ts`,
`packages/database/migrations/**`.

**Build.**

- `discord_cards`: `gameId`, `guildId`, `channelId`, `messageId`, `lockedAt`, `settledAt`,
  timestamps; unique on `(gameId, guildId)`; index on `lockedAt, settledAt` for the sweepers.
- `discord_links`: `userId` unique, `discordUserId` unique, `createdAt`. Prefer this over
  hand-writing Better Auth's `account` rows — the bot then reads one table Better Auth will
  never rewrite.
- `discord_guilds`: `guildId` pk, `channelId`, `postHour`, `timezone`, `enabled`,
  `installedAt`, `leftAt`.
- `prediction_picks`: add nullable `source` (`web` | `discord`) and `guildId`, index
  `(guildId, mode, status)`.
- One migration, generated once with `bun run generate`.

**Must not touch.** Any app code. No behaviour lives in this chunk.

**Done when.** `bun run generate` produces one migration; `bun run build` passes for every
workspace; `packages/database` exports the new tables.

**Watch out.** Do not hand-edit the generated SQL beyond what the journal tolerates, and do
not regenerate after another chunk has branched from you.

---

## C4 — Policy and privacy

**Issues:** DISC-13. **Wave 1, and it can start before C0.**

**Goal.** Answer the two external gates and update the documents that must be right before
the bot leaves a test guild.

**Owns.** `apps/frontend/src/content/legal/privacy-policy.md`, `docs/discord-bot-listing.md`.

**Build.**

- Written answer on whether odds-derived _scoring_ trips Discord's gambling clause, and how to
  word the listing. Cite the policy text, not a blog summary.
- Privacy-policy section: Discord user id, guild id, channel id, message id — what, why, and
  how to unlink.
- Listing copy in the no-betting-vocabulary register `docs/promo-copy.md` already uses.

**Must not touch.** Any code, any route.

**Done when.** The policy has a Discord section; the listing draft exists; the gambling
question has a written answer with sources.

**Note.** This is a legal-adjacent change. Do not ship it in the same PR as bot code.

---

## C5 — Account linking

**Issues:** DISC-06. **Wave 2.**

**Goal.** `interaction.member.user.id` becomes a `userId`, using the Discord account the user
already signed in with where possible.

**Owns.** `apps/backend/src/discord-link/**`,
`apps/frontend/src/routes/settings.discord.tsx` (+ `routeTree.gen.ts` regeneration),
`apps/discord/src/linking/**`, `apps/discord/src/interactions/link.handler.ts`.

**Build.**

- Resolution order: `account` where `providerId='discord'` and `accountId=<discord id>` →
  `discord_links` → miss. The first branch is free and covers everyone who signed in with
  Discord.
- `/link` ephemeral: 6-char single-use code, 10 min TTL in Redis, plus a URL to
  `/settings/discord?code=`.
- Web page: signed-in only, consumes the code, writes `discord_links`. Add a "Disconnect
  Discord" control (`/unlink` mirror) that deletes the row and leaves picks intact.
- Miss on click: ephemeral "Link your account first" with a link button straight to sign-in.

**Must not touch.** `app.module.ts` (C0 registered `DiscordLinkModule`), `internal.module.ts`,
`packages/database`.

**Done when.** A Discord-sign-in user is recognised on the first click with no extra step; an
email/password user completes `/link` in under 30 seconds and their next click lands on the
same profile as the web.

**Open decision.** Settled: path A (user, 27 October 2026). An unlinked click is refused with a
`/link` hint and a one-click link button. Path B (24h hold, `pending_discord_picks`) is a week of
extra work — do not build it. Path C is ruled out: `users.email` is required, so auto-creating an
account from Discord needs a synthetic address Better Auth would then treat as real.

---

## C6 — Tip-off lock and results edit

**Issues:** DISC-05, DISC-11. **Wave 2.**

**Goal.** The card stops looking open at tip-off, and shows a final score once the game
settles.

**Owns.** `apps/discord/src/lock/**`, `apps/discord/src/settlement/**`.

**Build.**

- Minute cron sweeping `discord_cards` where the game is past tip-off and `lockedAt is null`;
  edit the card to `disabled: true` plus a "locked at tip-off" line; set `lockedAt`. One REST
  call per card, idempotent on `lockedAt`.
- Settlement sweep: `schedule_games.gameStatus = 3` joined to `discord_cards` where
  `settledAt is null`; edit the card with the final score and disabled buttons; set
  `settledAt`. Poll the table — **do not add a worker cron**, the worker's schedule is
  load-bearing and this chunk does not own it.
- A failed edit (deleted message, 403, missing channel) marks the card dead and moves on.
  A missing card must never break the sweep.

**Must not touch.** `apps/worker/**`, `cards/**` (reuse the payload builder), `packages/database`.

**Done when.** A tipped-off card shows disabled buttons within ~60s; a card for a final game
shows the score within 15 minutes with no duplicate edits; killing the channel mid-sweep leaves
the other cards intact.

---

## C7 — Guild config and daily slate

**Issues:** DISC-09, DISC-10. **Wave 2.**

**Goal.** Each server gets its own channel, local hour, and one message per day with that
day's cards.

**Owns.** `apps/discord/src/setup/**`, `apps/discord/src/scheduler/**`.

**Build.**

- `/setup channel: hour: timezone:` requiring Manage Server; validate the zone against
  `Intl.supportedValuesOf('timeZone')`. No-arg `/setup` shows current config and a card
  preview.
- `guildCreate` DMs the installer a one-line "run /setup" hint; `guildDelete` sets `leftAt`
  rather than deleting the row.
- Minute scheduler: for each enabled guild, when local time matches `postHour` and
  `guildId:YYYY-MM-DD` is not in Redis, post. Write `discord_cards` rows **before** sending so
  a restart cannot double-post.
- Select games with `gameStatus = 1` and `gameDateTimeUTC > now`, mapped to the guild's local
  day via the same ET date-key logic the web slate uses. One card per message: a message's
  embeds all render above its components, so cards can only sit above their own buttons if they
  are separate messages. Post nothing on an empty day.

**Must not touch.** `cards/**`, `lock/**`, `packages/database`.

**Done when.** Two guilds with different hours and timezones each get their slate at their own
local hour; a restart at 9:05 does not re-post; a guild that removes and re-adds the bot gets
its channel config back.

---

## C8 — Per-server leaderboard

**Issues:** DISC-08. **Wave 2.**

**Goal.** `/leaderboard` in a server shows the points of _everyone in that server_ — definition B,
settled by the user on 27 October 2026. A pick carries a `userId` and the board ranks people, so
"in this server" comes from the `discord_members` mirror, not from `prediction_picks.guildId`.
`guildId` on a pick still records where the pick came from; it is provenance, not the board key.

**Owns.** `apps/backend/src/internal/leaderboard.controller.ts`, `apps/discord/src/leaderboard/**`,
**and `apps/discord/src/members/**`** — the membership mirror that definition B needs. The trunk
pre-creates `members/members.module.ts` and registers it in `app.module.ts`; C8 fills it in. The
trunk also already requests `Guilds | GuildMembers` and exposes `DiscordClientService.client`, so
C8 registers its own listeners without editing either file.

**Build.**

- **Member mirror first.** On `ClientReady`, and on `guildCreate`, fetch the guild's full member
  list (`guild.members.fetch()` — paginated by discord.js) and upsert `(guildId, discordUserId,
displayName, joinedAt)`. Then keep it current from `guildMemberAdd`, `guildMemberRemove`, and
  `guildMemberUpdate` (display-name changes). `guildDelete` deletes that guild's rows. Upserts are
  idempotent on the composite primary key; a member-list fetch that fails for one guild logs and
  moves on rather than blocking the rest.
- `GET /internal/leaderboard?guildId=&mode=` — top 10 plus the caller's own row when outside the
  cut (the `viewerRank` pattern the web board already uses), filtered by membership in that guild.
- `/leaderboard [mode]` public reply, both modes in one embed. Its description must read "our
  members' points", not "Points earned in this server." — that string is definition A and is
  currently in `apps/discord/src/leaderboard/leaderboard.command.ts`.
- Names from `user.name`, falling back to the Discord display name only when unset.

**Must not touch.** `internal.module.ts`, `app.module.ts`, `infrastructure/discord-client.service.ts`,
`predictions.service.ts` (add the predicate in the controller or a thin service of your own if the
existing method cannot take it — report before modifying the shared service), `packages/database`.

**Done when.** Two servers return two different boards; a member who has only ever picked on the
website appears on their server's board; someone who leaves the server drops off it and returns when
they rejoin; a user ranked 12th sees their own row appended; the numbers match a manual sum over
`predictions`/`prediction_picks` for the current members of that guild.

**Privileged intent.** The user has enabled Server Members in the Developer Portal. Do not widen
the intent list further; `MESSAGE_CONTENT` and `GUILD_PRESENCES` stay off.

---

## C9 — `/picks`

**Issues:** the command half of DISC-15. **Wave 2.**

**Goal.** Durable per-user pick history, since every ephemeral confirmation vanishes.

**Owns.** `apps/discord/src/picks/**`.

**Build.**

- `/picks [mode]`, **ephemeral**, reading `client.listPicks()` (C2's endpoint) so Discord and
  the web's My Picks can never disagree.
- Open picks first (side, `<t:UNIX:R>` tip-off, whether it can still change), then the last 5
  settled with ✅/❌ and points. Cap at 10 rows, plus a "see all on the web" link button.
- Nothing persisted — rebuilt on each call, so there is no message to keep in sync.

**Must not touch.** `api/**`, `internal/**`, `packages/database`.

**Done when.** After picking two games and restarting the Discord client, `/picks` lists both
with the right sides, and the numbers match the web's My Picks for the same account.

---

## C10 — Rate limits and fan-out

**Issues:** DISC-12. **Wave 3.**

**Goal.** Know what a slate post and a lock pass actually cost, then make the bot survive
100 servers.

**Owns.** `apps/discord/src/infrastructure/rate-limiter.ts`, `docs/discord-rate-limits.md`.

**Build.**

- Measure: REST calls per slate post and per lock pass, per guild. Put the numbers in the doc.
- One queue for all REST traffic with a token bucket under 50/s, honouring
  `X-RateLimit-Bucket` and `retry_after` instead of a fixed delay.
- Check permissions before posting; stop on 401; treat 404 as a dead card, not a retry. The
  10,000-invalid-requests Cloudflare ban is the failure mode to design against.
- Answer the open question: per-card lock edits, or one "all games locked" follow-up message.

**Must not touch.** `cards/**`, `lock/**`, `scheduler/**` — this chunk wraps them, it does not
rewrite them. If a call site needs changing, report it.

**Done when.** A load test at 100 simulated guilds completes a slate post and a full lock pass
with zero 429s and zero invalid requests, and the cost numbers are written down.

---

## C11 — Ops

**Issues:** DISC-14. **Wave 3.**

**Goal.** A public bot fails in public; make the failure contained and visible.

**Owns.** `apps/discord/src/ops/**`, `docs/production-runbook.md`.

**Build.**

- Per-guild error isolation: one guild's 403 must not stop the loop.
- `DISCORD_ENABLED=false` stops posting and locking, and makes clicks answer "picks are
  paused" — refuse the pick too, otherwise the card looks live while the schedule is off.
- Structured logs per interaction: guild id, hashed user id, custom id, outcome, latency.
  Latency is the thing that breaks the 3-second deadline silently.
- `/status` for the operator: guild count, last post time, cards locked, queue depth.
- Token rotation procedure in the runbook.

**Must not touch.** Feature directories. Observe them; do not restructure them.

**Done when.** Killing the switch stops all posting within one scheduler tick; a forced 403 on
one guild leaves the others' posts intact; `/status` reports real numbers.

---

## Merge order

Land in this order. It is the wave order, with C3 pulled forward because migrations must exist
before wave 2 starts.

```
C0 → C3 → (C1, C2, C4) → (C5, C6, C7, C8, C9) → (C10, C11)
```

Within a wave, any order. C4 can merge whenever — it touches no code.

## Verification every chunk runs

```bash
bun run build        # all workspaces
bun run lint
bun run format:check
bun run backend:test # if the chunk touched apps/backend
```

Orb caveats, so a chunk does not get stuck:

- Postgres and Redis are **remote**, injected as project env. A chunk that needs a live
  database to prove behaviour should say so rather than pretending a mock passed.
- Only C3 runs `bun run generate`. Only C0 runs `bun install`.
- Only C5 runs `bun run router:gen` (the codegen watcher does not run in orbs).
- `cdn.nba.com` may not resolve in an orb browser (IPv6-first, no IPv6 egress). Fetch logos
  with `curl` in a script instead of expecting the browser to show them.

---

## If 12 orbs is too many

Three folds that lose little:

| Fold | Into | Cost                                                                      |
| ---- | ---- | ------------------------------------------------------------------------- |
| C9   | C2   | Same person builds the endpoint and the command; loses one parallel slot. |
| C11  | C10  | Both are "make it survive production"; one orb, later.                    |
| C4   | —    | Do it yourself; it is research plus one markdown file.                    |

That gives 9. Below that you are serialising the bot tree, because C1, C6, C7, C9 all live
under `apps/discord/src` and two of them must not touch `app.module.ts` at the same time.

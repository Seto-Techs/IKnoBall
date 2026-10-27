# Discord Bot — Issue Breakdown

Planning doc for a Discord bot backed by the same `prediction_picks` data as the web app.
Each issue is written to paste into Linear. Status legend:

| Tag          | Meaning                                                                      |
| ------------ | ---------------------------------------------------------------------------- |
| **Doable**   | No open question. Can be built from what the repo and Discord's docs expose. |
| **Research** | Needs a decision or a measurement before the code is worth writing.          |
| **Blocked**  | Cannot land until another issue (or an external approval) is resolved.       |

Work is grouped into parallel chunks for separate orbs — see
[discord-bot-orb-chunks.md](discord-bot-orb-chunks.md). The `Chunk` column below is the link
between the two.

Summary:

| ID      | Issue                                         | Status   | Blocked by       | Chunk |
| ------- | --------------------------------------------- | -------- | ---------------- | ----- |
| DISC-01 | Bot foundation: app, transport, deploy        | Doable   | —                | C0    |
| DISC-02 | Team logo assets as application emojis        | Doable   | —                | C1    |
| DISC-03 | Match card message                            | Doable   | DISC-01, DISC-02 | C1    |
| DISC-04 | Pick buttons and per-user confirmation        | Doable   | DISC-03          | C1    |
| DISC-05 | Tip-off lock                                  | Doable   | DISC-04          | C6    |
| DISC-06 | Account linking: Discord user → IKnoBall user | Research | —                | C5    |
| DISC-07 | Write path: a Discord click becomes a pick    | Doable   | DISC-06 (partly) | C2    |
| DISC-08 | Per-server leaderboard                        | Doable   | DISC-07          | C8    |
| DISC-09 | Guild config and `/setup`                     | Doable   | DISC-01          | C7    |
| DISC-10 | Daily slate posting                           | Doable   | DISC-09          | C7    |
| DISC-11 | Results edit after settlement                 | Doable   | DISC-05, DISC-07 | C6    |
| DISC-12 | Fan-out and rate-limit strategy               | Research | DISC-10          | C10   |
| DISC-13 | Policy, privacy, and bot verification         | Research | —                | C4    |
| DISC-14 | Ops: logging, kill switch, token rotation     | Doable   | DISC-01          | C11   |
| DISC-15 | `/picks` — durable per-user pick history      | Doable   | DISC-07          | C2+C9 |

---

## Constraints found while researching

Six facts shape every issue below. They are not opinions; each is sourced.

1. **Component state belongs to the message, not the user.** A button's `disabled` flag is a property of the message component, so one message in a channel shows the same state to everyone. There is no per-user button state. Per-user feedback must be an ephemeral response to the click. ([Component Reference](https://docs.discord.com/developers/components/reference))

2. **Tip-off lock is already enforced server-side.** `PredictionsService.placePick` calls `requireOpenGame`, which rejects a pick when `now >= gameDateTimeUTC` (`apps/backend/src/predictions.service.ts`, "Picks are closed: tip-off has passed"). Disabling the buttons is therefore cosmetic, and correctness does not depend on the edit landing. This is the single most useful fact in this doc: it turns the hardest-looking requirement into a nice-to-have.

3. **Discord does not render SVG.** Every team logo in `teams.logoUrl` points at `cdn.nba.com/.../logo.svg`, and the `.png` sibling path returns 403 (verified with `curl`: `logo.svg` → `200 image/svg+xml`, `logo.png` → `403`). Embeds and thumbnails need a raster image. Application-owned emojis solve this for free.

4. **Timestamps render in each reader's timezone.** `<t:UNIX:f>` resolves client-side, so "7:30 PM" is correct for every viewer without storing a single user timezone. Works in message content and embed descriptions/fields, not in embed titles or footers. ([API Reference](https://docs.discord.com/developers/reference))

5. **The bot and web sign-in are the same Discord application.** Better Auth's Discord provider already writes `providerId='discord'` and `accountId=<Discord user id>` into `account` (`packages/database/src/better-auth.schema.ts`). Anyone who signed in with Discord is linked for free — no new OAuth flow, no new table.

6. **Numbers that bound the design.** Buttons: 5 per action row, 5 action rows per message, `custom_id` 1–100 chars and unique per message, label max 80 chars. Interactions: acknowledge within 3 seconds, response token valid 15 minutes, `UPDATE_MESSAGE` / `DEFERRED_UPDATE_MESSAGE` respond by editing the card. Rate limits: 50 requests/second global per bot, per-route buckets discovered from `X-RateLimit-Bucket`, and 10,000 invalid requests (401/403/429) per 10 minutes earns a temporary Cloudflare ban. Interaction endpoints are exempt from the global limit. Application emojis: 2,000 per app, usable in any guild, and `USE_EXTERNAL_EMOJIS` is not required.

---

## DISC-01 — Bot foundation: app, transport, deploy

- **Status:** Doable · Priority: P0 · Blocks: DISC-03, DISC-09, DISC-14

**Problem**
Nothing exists yet. The repo has three deployable services (frontend, backend, worker) and no Discord presence, no bot token handling, and no decision on how Discord delivers interactions.

**Change**

- New workspace `apps/discord` (NestJS standalone, mirroring `apps/worker`), depending on `@iknoball/database` and `@iknoball/predictions`. Reuse the `DatabaseService` pattern rather than opening its own pool.
- **Transport: gateway (`discord.js` client), not an HTTP interactions endpoint.** Reasons: no public route to expose, no Ed25519 signature verification to bolt onto a backend that runs with `bodyParser: false` (`apps/backend/src/main.ts`), and discord.js handles reconnect/resume and rate-limit buckets for us. `discord.js` 14.x runs on Bun unmodified.
- Intents: `Guilds` only. No privileged intents — slash commands, buttons, and `interaction.member.user.id` need none, which keeps the app under the review threshold.
- Permissions to request at invite: View Channel, Send Messages, Embed Links, Read Message History. No Manage Server, no Manage Expressions.
- A separate service rather than folding into the worker: the worker's crons are load-bearing for schedule, odds, and settlement data, and a bot crash loop must not take them down.

**Acceptance**
Bot connects, registers one global slash command, and answers `/ping` in a test guild. Process exits non-zero on an invalid token instead of retrying forever.

**Tradeoffs**

- A fourth deploy unit to run and monitor.
- With a gateway, clicks during a restart fail with "This interaction failed". The HTTP endpoint alternative has the same user-visible failure, so this is not a reason to switch.
- Interaction endpoints being exempt from the global rate limit is a point in the HTTP option's favour if the bot ever gets big. Revisit then, not now.

---

## DISC-02 — Team logo assets as application emojis

- **Status:** Doable · Priority: P0 · Blocks: DISC-03

**Problem**
Cards and buttons need a team mark, and `teams.logoUrl` is SVG, which Discord will not render. Per-guild emoji uploads are worse: they need Manage Expressions and 30 uploads per server.

**Change**

- Convert the 30 team SVGs to PNG once (128×128, transparent) with `sharp` or `resvg`. A one-off script under `apps/discord/scripts/`, output committed or uploaded to the existing S3 module.
- Upload them as **application-owned emojis** via `POST /applications/{app.id}/emojis` with the bot token. Names must be 2–32 chars of `[A-Za-z0-9_]`, so the tricode is the name (`LAL`, `BOS`, `NOP`). 2,000 emoji allowed per app; 30 is nothing.
- Store `emojiId` per team in a small map in `apps/discord` (or a column on `teams` if the web app ever wants it). Reference in components as `<:LAL:123456789>`.
- No `USE_EXTERNAL_EMOJIS` permission needed, which matters: it stops the invite from asking for a permission that reads as scary to server admins.

**Acceptance**
All 30 emojis render in a button label and in embed fields in a guild the bot has never been added to before.

**Tradeoffs**

- Emoji are 128px and square-ish; wide wordmark logos shrink to mush. Prefer the icon-only mark, or fall back to a coloured circle with the tricode.
- Emoji IDs are tied to one Discord application. Changing apps means re-uploading.

---

## DISC-03 — Match card message

- **Status:** Doable · Priority: P0 · Depends: DISC-01, DISC-02

**Problem**
Need one message per game carrying both teams, the local tip-off, and the two pick buttons.

**Change**

- Classic embed, not Components V2. V2 containers give nicer layouts, but the `IS_COMPONENTS_V2` flag cannot be removed once set and it disables `content` and `embeds` on that message — too rigid for a first version. Revisit as polish.
- Layout: author `IKnoBall`, title `AWY @ HOM`, description with `<t:UNIX:f>` (local clock) and `<t:UNIX:R>` (countdown), two inline fields per side (record, last 5), footer with the game id, thumbnail = one team's PNG.
- One action row: `[<:AWY:…> AWY]` `[<:HOM:…> HOM]` `[Open on web ↗]` (link button). Three buttons, well under the 5-per-row limit.
- `custom_id` format `pick:<gameId>:<side>` — 1–100 chars, parseable without a lookup, and unique per message.
- Build the payload in a pure function (`cardPayload(game, teams)`) so it can be unit-tested without a live client.

**Acceptance**
A card for a real game shows both teams, the tip-off in the reader's own timezone, and three working buttons. Snapshot test covers the payload shape.

**Tradeoffs**

- Embed field values are capped at 1,024 chars and the whole embed at 6,000; records and last-5 fit easily but the card must not grow into a stats dump.
- The link button points at `https://iknoball.setotechs.com/game/<gameId>`; a staging guild gets production links unless the base URL is config.

---

## DISC-04 — Pick buttons and per-user confirmation

- **Status:** Doable · Priority: P0 · Depends: DISC-03

**Problem**
A click has to feel personal, but the card is shared: the message cannot show "you picked LAL" to one person and "you picked BOS" to another.

**Change**

- On click: acknowledge with an **ephemeral** response within 3 seconds, then do the work. Never write to the database before acknowledging — a slow query is a failed interaction.
- Use `deferReply({ flags: MessageFlags.Ephemeral })` then `editReply()`, **not** `deferUpdate()`. `deferUpdate` acknowledges by editing the message in place, which has no per-user copy and therefore cannot be ephemeral. The ephemeral flag also cannot be added after the fact — Discord ignores it on followups and on edits, so it must be right on the very first call.
- Reply content: "Locked in: **Lakers** · pays 18 pts if correct · changes until tip-off", plus two buttons: `Change pick` (link to the card's message) and `Open on web` (link button to `/game/<gameId>`).
- If the user already had a pick on this game, say what it changed from. `placePick` is an upsert on `(userId, gameId, mode)` and silently overwrites, so a Discord click can replace a web pick without either side noticing.
- Re-clicking the same side is idempotent and replies "already picked".
- Do not edit the shared card on every click. Optionally update a "N picks" counter, but that is a per-click edit and a rate-limit cost for no user value — skip it.

**How ephemeral replies actually behave** (verified, and it changes the UX)

- Only the user who clicked can see it. That is what makes it the right surface for personal state.
- It is genuinely temporary: Discord's own FAQ says ephemeral messages "disappear when you dismiss them, wait long enough, or restart Discord". There is no TTL the bot controls and no way to make one stick around.
- The interaction token lives 15 minutes, which is the only window in which the bot can edit or delete that message. After that the bot loses all control of it, and the message is still sitting there until the client drops it.
- Consequence: **a vanishing confirmation cannot be the record of a pick.** A user who clicks, dismisses, and comes back an hour later has no way to see what they chose. That is why DISC-15 (`/picks`) is not optional — the ephemeral reply is feedback, not history.

**Acceptance**
Two users click different sides on the same card and each sees only their own confirmation. Clicking the same side twice is a no-op. Killing the process between ack and write leaves the user with a "saving…" ephemeral that resolves on retry rather than a false "locked in".

**Tradeoffs**

- No visible "picked" state on the card, so a user cannot see at a glance whether they already picked that game. Mitigated by `/picks` (DISC-15) rather than by mutating shared state.
- Ephemeral replies are invisible to everyone else, so the channel never shows social proof of participation. That is the price of per-user state in a shared message.
- Because the ephemeral vanishes, the pick needs to be durable somewhere else before the reply is trusted. Write first, then confirm — not the other way round.

---

## DISC-05 — Tip-off lock

- **Status:** Doable · Priority: P0 · Depends: DISC-04

**Problem**
Buttons must stop accepting picks at tip-off, and the card should visibly say so.

**Change**

- **Correctness comes from the API, not from the edit.** `placePick` already rejects at `now >= gameDateTimeUTC`; the bot surfaces that rejection as "Picks are closed for this game". Even if every disable edit fails, no late pick can be recorded.
- Cosmetic disable: a cron in the bot that, every minute, finds cards whose game is now past tip-off and edits them to `disabled: true` plus a "🔒 Locked at tip-off" line. Keep a `discord_cards` table (`gameId`, `guildId`, `channelId`, `messageId`, `lockedAt`) so the edit is one REST call per card and idempotent via `lockedAt`.
- Prefer editing in place over deleting and reposting: a delete loses the reply chain and the "N people picked" context.
- If the edit fails (message deleted, channel gone, 403), mark the card dead and move on. A missing card must never break the schedule.

**Acceptance**
A card for a game that has tipped off shows disabled buttons within ~60s, and a click on a stale card returns a clear "closed" message rather than an error.

**Tradeoffs**

- Up to 60 seconds where the card looks open but the API refuses the pick. Acceptable: the reply explains it.
- Requires storing channel and message ids, which is the first persistent state the bot owns.

---

## DISC-06 — Account linking: Discord user → IKnoBall user

- **Status:** Research (one product decision) · Priority: P0 · Unblocks: DISC-07 end to end

**Problem**
Requirement 3: when the person clicking is already an IKnoBall user, the pick must land on their existing account, not a parallel Discord-only one.

**What the repo already gives us**

- Sign-in-with-Discord users are already linked: Better Auth writes `account.providerId='discord'`, `account.accountId=<Discord user id>`. Lookup is one indexed-ish query.
- `account_userId_idx` exists; there is no index on `(providerId, accountId)`, so add one before this becomes a hot path.
- The web app has no UI to link Discord to an email/password account, and `prompt: 'consent'` is already set in `auth.config.ts`, so a linking prompt will render correctly.

**The open decision**
What happens when an unlinked Discord user clicks a button?

| Option                                          | Cost                                                     | Benefit                                        |
| ----------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| A. Refuse, reply with a link button             | One extra hop; some clicks abandoned                     | One source of truth; no provisional identities |
| B. Accept, hold for 24h, apply on link          | New `pending_discord_picks` table; expiry sweeper        | Frictionless first click, converts better      |
| C. Auto-create an IKnoBall account from Discord | Email is required by the `users` table and may be absent | Zero friction, but creates zombie accounts     |

Recommendation: **A now, B if the funnel shows drop-off.** A is a day of work; B is a week and a new table. Neither is worth building before DISC-07 proves people click at all.

**Change (path A)**

- `/link` slash command, ephemeral: issues a single-use code (6 chars, 10 min TTL, Redis), plus a URL `…/settings/discord?code=XXXXXX`.
- Web: `/settings/discord` page, signed-in only, consumes the code and writes the link. Because `account` is Better Auth's table, prefer a dedicated `discord_links` table (`userId` unique, `discordUserId` unique) over hand-writing `account` rows — the bot then reads one table that Better Auth will never rewrite.
- Button clicks resolve `interaction.member.user.id` → `discord_links.discordUserId` → `userId`. Miss = ephemeral "Link your account first" with a `/link` hint, and a **link button straight to the web sign-in** so the hop is one click, not a typed URL.

**Why an ephemeral confirmation does not replace this**
The reply the user sees after clicking ("you picked the Lakers", visible only to them, then gone) is the right _presentation_ for a pick — that is DISC-04, and it is the only per-user surface Discord offers. But it is presentation, not identity. The write still has to land on a row in `prediction_picks`, and that row needs a `userId`. An ephemeral reply changes nothing about which account owns the pick; without linking there is no account to own it, and the choice is exactly the A/B/C table above.

So: ephemeral reply = what the click _looks_ like. Linking = what the click _is_. DISC-06 is the second one and DISC-04 is the first, which is why the two issues are separate. DISC-06 does not gate DISC-07's code; it gates DISC-07's last hop, resolving a Discord user id to a `userId`.

**Acceptance**
A user who signed in with Discord on the web is recognised on the first click with no extra step. An email/password user completes `/link` in under 30 seconds and their next click lands on the same profile as the web.

**Tradeoffs**

- `discord_links` duplicates what `account` already knows for Discord sign-in users. Cheap, but the two can disagree if a user unlinks. Write the row for sign-in users too, lazily, on first click.
- A Discord account can be linked to only one IKnoBall user, and vice versa. Enforce with unique constraints, not application checks.

---

## DISC-07 — Write path: a Discord click becomes a pick

- **Status:** Doable · Priority: P0 · Blocks: DISC-08, DISC-11 · Partly waits on: DISC-06

**Problem**
`PredictionsController` is session-authenticated (`@Session()`), so a bot has no way in. Writing to `prediction_picks` directly from the bot would fork the tip-off check, odds locking, and both-mode write into a second implementation that will drift.

**What is and is not blocked**

This issue was originally tagged Blocked, which was wrong. The endpoint takes a `userId: string`; `placePick` does nothing session-shaped with it and never looks at the caller. So the endpoint, the token guard, the bot-side client, and the error mapping can all be built and tested today against any existing user id. None of that waits on anything.

What waits on DISC-06 is the last hop: turning `interaction.member.user.id` into a `userId`. Until that exists the endpoint is callable but nothing in Discord can call it for a real person. That is a missing caller, not a missing capability.

**Change**

- Add one internal endpoint, e.g. `POST /internal/predictions`, guarded by an `X-Internal-Token` header checked against a new `INTERNAL_API_TOKEN` env var — the same shape as the existing `EMAIL_INTERNAL_TOKEN` precedent. Not a user session, not a bearer token.
- Mark the controller `@AllowAnonymous()`. `AuthModule.forRootAsync` installs a **global** `APP_GUARD` (`AuthGuard`) unless `disableGlobalAuthGuard: true` is passed, and it rejects any request without a session before a route handler runs — including one carrying a valid `X-Internal-Token`. The `AllowAnonymous` decorator (aliased `Public`) sets the `PUBLIC` reflector key the guard checks first. Without it the endpoint 401s and the token check never executes.
- The endpoint calls the existing `PredictionsService.placePick(userId, { gameId, side })` unchanged. One write path, one place that enforces the lock and locks both modes.
- Bot client wraps it and maps failures to friendly ephemerals: `Picks are closed: tip-off has passed` → "This game has tipped off", 5xx → "Something went wrong, try the website".
- Idempotency: `placePick` is already an upsert, so a duplicate click is safe without extra work.
- Rate-limit the internal endpoint per `userId` to stop a button-mashing script from hammering the DB.

**Acceptance**
The endpoint alone: a call with a valid token and any existing user id produces exactly two rows in `prediction_picks` (flat + weighted) on the same side, with `lockedDecimal` populated when odds exist; a call after tip-off writes nothing and returns a readable error; a call without the token 401s at the guard. End to end: a real Discord click does the same, which is the part DISC-06 unblocks.

**Tradeoffs**

- A shared secret is weaker than mTLS or signed requests. Acceptable for one service-to-service call on a private network; rotate it with the deploy (DISC-14). The existing compose (`deploy/dokploy/production.compose.yaml`) already puts the `api`, `web`, `worker`, and `redis` services on `app_net`, and the worker already waits on `api` being healthy — so a `discord` service added the same way can call `http://api:3000` and the route never needs to be reachable from the internet. No Traefik label for `/internal`.
- Going through HTTP adds latency to the 3-second budget. Acknowledge first, then call — the budget is the bot's problem, not the API's.

---

## DISC-08 — Per-server leaderboard

- **Status:** Doable (one semantics decision) · Priority: P1 · Depends: DISC-07

**Problem**
Requirement 4: each server wants its own board. The web leaderboard sums every settled pick by a user, with no notion of where the pick came from.

**The decision**
"Server leaderboard" can mean two different things, and they produce different numbers:

| Definition                                              | Needs                                                  | Reads as                          |
| ------------------------------------------------------- | ------------------------------------------------------ | --------------------------------- |
| A. Picks placed through Discord **in that server**      | `guildId` recorded on the pick                         | "this server's board" — honest    |
| B. All picks by users who are **members of** the server | Guild member list (`GUILD_MEMBERS` intent, privileged) | "our members' board" — flattering |

Recommendation: **A.** It is truthful, needs no privileged intent, and cannot be gamed by joining a server to inherit someone's web points. Label it clearly ("points earned in this server").

**Change**

- Schema: add nullable `source` (`web` | `discord`) and `guildId` to `prediction_picks`, index `(guildId, mode, status)`. Migration in `packages/database`.
- `GET /internal/leaderboard?guildId=…&mode=…`, reusing the existing `leaderboard()` query with a `guildId` predicate and its own board size (say top 10 — a server does not need 50 rows).
- `/leaderboard [mode]` slash command, public reply, both modes in one embed, top 10 plus the caller's own row if outside the cut — same pattern the web board already uses via `viewerRank`.
- Names: use `user.name`, falling back to the Discord display name only when the linked user has no name set.

**Acceptance**
`/leaderboard` in two different servers returns two different boards, each summing only its own picks. A user ranked 12th sees their own row appended.

**Tradeoffs**

- A user's web picks never appear on a server board, which may surprise people who think of their account as one thing. The label has to carry that.
- `guildId` is overwritten when the same user re-picks the same game elsewhere (web after Discord, or another server). Last write wins, consistent with how `side` already behaves.

---

## DISC-09 — Guild config and `/setup`

- **Status:** Doable · Priority: P1 · Depends: DISC-01

**Problem**
Posting needs a target channel, a posting hour, and a timezone. None of that can be guessed, and per-guild settings are what makes a multi-server bot sane.

**Change**

- Table `discord_guilds`: `guildId` pk, `channelId`, `postHour` (0–23), `timezone` (IANA), `enabled`, `installedAt`, `leftAt`.
- `/setup channel:#nba hour:9 timezone:America/New_York` — requires Manage Server. Validate the timezone against `Intl.supportedValuesOf('timeZone')` rather than a regex.
- `/setup` with no args shows current config plus a preview of tonight's card.
- On `guildCreate`, DM the installer a one-line "run /setup" hint; on `guildDelete`, set `leftAt` rather than deleting the row (keeps the board history for a reinstall).
- Default `postHour` = 9 in `America/New_York` (NBA convention), so the bot works if the admin skips `/setup` — but post into a channel only after `/setup`, never into a guessed channel.

**Acceptance**
Two guilds configured with different hours and timezones both get their slate at their own local hour. Removing the bot and re-adding it restores the previous channel config.

**Tradeoffs**

- Storing an IANA timezone per guild means the scheduler must be timezone-aware; the alternative (UTC hour) produces 3 a.m. posts for someone. The `Intl` API covers DST correctly, so this is cheap.
- One channel per guild. Multi-channel setups wait for demand.

---

## DISC-10 — Daily slate posting

- **Status:** Doable · Priority: P1 · Depends: DISC-09

**Problem**
The bot has to decide, per guild, which games to post and when — and the games come from `schedule_games`, which the worker already keeps current.

**Change**

- A minute-resolution scheduler that walks `discord_guilds` and posts when the guild's local time matches `postHour` and it has not posted today (idempotency key `guildId:YYYY-MM-DD` in Redis).
- Games: the guild's local "today" mapped to US/Eastern dates (the repo's `gameDateKey` / `shiftEtDate` helpers in `apps/frontend/src/lib/game-utils` are the same logic the slate uses), filtered to `gameStatus=1` and `gameDateTimeUTC > now`.
- Post one card per game in a single message batch where possible: Discord allows up to 10 embeds per message, so a 4-game slate is one message with four cards and one action row each — that stays under 5 action rows per message. Beyond 4 games, thread the remainder.
- Post nothing on a day with no games; do not send an "enjoy the break" message.
- Guard against double posts after a restart by writing `discord_cards` rows before sending, not after.

**Acceptance**
A guild set to 9 a.m. local receives exactly one message containing today's cards, and a bot restart at 9:05 does not re-post.

**Tradeoffs**

- The 5-action-row cap forces a split above 4 games per message. Threading keeps the channel tidy but splits the conversation.
- Posting is driven by the guild's wall clock, so a DST shift can skip or duplicate a minute. The Redis idempotency key absorbs the duplicate; a skipped minute is caught by a 5-minute catch-up window.

---

## DISC-11 — Results edit after settlement

- **Status:** Doable · Priority: P2 · Depends: DISC-05, DISC-07

**Problem**
The card is the only thing a Discord user sees. When the game settles (the worker runs `prediction-settlement` every 15 minutes), the card should say whether the pick was right and what it paid.

**Change**

- On settle, edit the card: final score, a ✅/❌ line for the caller... except the card is shared, so the correct surface is the final score plus "settled" and a link to `/picks`. Per-user results go to an ephemeral reply only if the user clicks a "What did I get?" button.
- Keep the buttons but swap them for a disabled state; never delete the card.
- One edit per card, guarded by `discord_cards.settledAt`.
- Batch: settlement touches many games at once, so queue edits and pace them (see DISC-12).

**Acceptance**
Within 15 minutes of a game going final, the card shows the final score and disabled buttons, with no duplicate edits.

**Tradeoffs**

- Per-user points cannot be shown on a shared card, which is the same constraint as DISC-04. The alternative — posting a per-user summary in the channel — is spam.

---

## DISC-12 — Fan-out and rate-limit strategy

- **Status:** Research · Priority: P1 · Depends: DISC-10

**Problem**
Posting and locking are fan-out operations: `guilds × games` messages and edits landing in the same minute. Discord publishes 50 req/s global, per-route buckets that are only discoverable from response headers, and a 10,000-invalid-requests-per-10-minutes Cloudflare ban. Nobody knows yet where this project sits against those.

**Research questions**

- Measure: how many REST calls does one slate post and one tip-off lock actually cost per guild? (Post + N card edits + N lock edits.)
- What is the real per-channel edit bucket? Discord no longer publishes it; discord.js learns it from headers, but the first burst is blind.
- At what guild count does a single-process gateway need sharding? (Discord's guidance is ~2,500 guilds per shard; irrelevant now, worth writing down.)
- Does the tip-off edit need to be per-card, or can a single "all games locked" follow-up message replace N edits?

**Recommended design regardless of the measurements**

- All REST traffic goes through one queue with a token bucket under 50/s, and honours `X-RateLimit-Bucket` + `retry_after` instead of a hardcoded delay.
- Never let an invalid request through: check permissions before posting, stop after a 401, and treat a 404 message as dead rather than retrying.
- Because the lock is cosmetic (DISC-05), a failed edit degrades gracefully — that is what makes aggressive fan-out safe.

**Acceptance**
A load test at 100 simulated guilds completes a slate post and a full lock pass with zero 429s and zero invalid requests.

**Tradeoffs**

- Serialising all REST traffic through one queue caps throughput below the global limit on purpose. Correctness over speed, for a workload that is bursty by nature.

---

## DISC-13 — Policy, privacy, and bot verification

- **Status:** Research (potential blocker) · Priority: P0 before public launch

**Problem**
Two external gates, and one the repo has already half-decided.

**Research questions**

- **Gambling policy.** Discord's Developer Policy forbids using the API "to promote or facilitate unlawful online gambling". IKnoBall is free, has no prizes, and the product deliberately avoids betting vocabulary (`docs/promo-copy.md`). The open question is whether odds-derived _scoring_ trips any review, and how to describe it in the app listing. Get this read before publishing the bot, not after a takedown.
- **Verification.** Apps can join 100 servers unverified; beyond that they need verification (and a privacy policy, a ToS, and a working support contact). Privileged intents are no longer the gate — that review now triggers at 10,000 unique users, and this bot needs none.
- **Privacy policy.** `apps/frontend/src/content/legal/privacy-policy.md` commits to "no third-party analytics SDKs" and describes account data. It does not mention Discord user ids, message ids, or guild ids — all of which the bot will store. It needs a paragraph before launch.

**Change**

- Draft the listing copy in the no-betting-vocabulary register the web already uses.
- Add a "Discord integration" section to the privacy policy: what is stored (Discord user id, guild id, channel id, message id), why (linking, posting, locking), and how to unlink (`/unlink`, which deletes the `discord_links` row and leaves picks intact).
- `/unlink` command and a "Disconnect Discord" control on `/settings/discord`.

**Acceptance**
Written answer on the gambling question; privacy policy updated and deployed before the bot leaves the test guild.

**Tradeoffs**

- The privacy-policy edit is a legal-adjacent change and should not ship in the same PR as bot code.

---

## DISC-14 — Ops: logging, kill switch, token rotation

- **Status:** Doable · Priority: P2 · Depends: DISC-01

**Problem**
A public bot fails in public: a bad deploy posts garbage into 40 servers, and a leaked token lets someone else post as IKnoBall.

**Change**

- Per-guild error isolation: one guild's 403 must not stop the loop for the rest.
- Global kill switch: `DISCORD_ENABLED=false` stops posting and locks while leaving clicks answering "picks are paused".
- Token in the project's secret store, never in `.env` files that get committed; rotation procedure documented in `docs/production-runbook.md`.
- Structured logs on every interaction: guild id, user id (hashed or truncated in logs), custom id, outcome, latency. Latency matters — the 3-second deadline is the thing most likely to break silently.
- A `/status` command for the operator (guild count, last post time, cards locked, queue depth).

**Acceptance**
Killing the switch stops all posting within one scheduler tick. A forced 403 on one guild leaves the other guilds' posts intact.

**Tradeoffs**

- A kill switch that only stops posting still leaves clicks accepted; decide whether "paused" should also refuse picks (recommended: yes, otherwise the card looks live while the schedule is off).

---

## DISC-15 — `/picks` — durable per-user pick history

- **Status:** Doable · Priority: P1 · Depends: DISC-07

**Problem**
Every confirmation the bot gives is ephemeral, so it is gone within minutes or on the next client restart (see DISC-04). A user who picks five games on Monday and opens Discord on Tuesday has no way to see what they chose. On the web they would open My Picks; in Discord there is nothing, and "I forget what I picked" is a reason to stop picking.

**Change**

- `/picks [mode]` slash command, **ephemeral** — this is a personal view, so it must not spam the channel.
- Reads the same data the web's My Picks reads: `GET /internal/picks?userId=…` wrapping `PredictionsService.listPicks`, so the two surfaces can never disagree. `listPicks` already joins game, teams, scores, and status, and already marks `pendingPrice`.
- Content: open picks first (side, tip-off as `<t:UNIX:R>`, whether it can still be changed), then the last 5 settled (✅/❌, points, both modes). Cap at 10 rows with a "see all on the web" link button.
- Because it is ephemeral and rebuilt on each call, there is no message to keep in sync and no edit cost. It is the cheapest surface in the whole bot.
- `/picks` also answers "did that click actually save?" — which matters most in the one case where the ephemeral confirmation is least trustworthy: a write that failed after the ack.

**Acceptance**
After picking two games and restarting the Discord client, `/picks` lists both with the right sides, and the numbers match the web's My Picks for the same account.

**Tradeoffs**

- A command the user has to remember, versus the card showing state. But the card cannot show per-user state, so this is the only durable option short of a DM.
- Ten rows is a hard cap by choice; a 60-pick season is unreadable in an embed, and the web page already exists for that.

---

## Explicitly out of scope

- Picking by slash command without a card (`/pick LAL`). It duplicates the card's job and adds a second path to the same write.
- Per-guild scoring rules or custom point systems. The two boards are global by design (`docs/prediction-scoring.md`).
- DMs and reminder DMs. A bot cannot DM users who do not share a server, and opt-in DM is a separate consent surface — the email reminder channel is a better fit for that job.
- Anything that reads message content. No `MESSAGE_CONTENT` intent, ever; it would put the app back into privileged-intent review for no feature.

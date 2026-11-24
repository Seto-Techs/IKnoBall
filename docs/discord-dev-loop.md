# Discord bot — local dev loop

The bot is a gateway client, so there is no preview URL and no browser to open. The
equivalent of a preview is a **second Discord application** running from an orb
against a private test guild. Changes to commands, buttons, and cards then take
seconds instead of a deploy.

## Why a second application

Two reasons, both from the deployed setup:

- **One gateway session per token.** Two processes on one token both receive every
  interaction, so every button click gets answered twice and the rate-limit budget
  is spent twice. See [production-runbook.md](production-runbook.md) §7.4.
- **Every boot bulk-overwrites the application's slash commands.** A local run on
  the production application publishes half-finished command definitions to real
  users before you have tested them.

## One-time setup (Discord Developer Portal)

1. <https://discord.com/developers/applications> → **New Application** → name it
   something obvious, e.g. `IKnoBall Dev`.
2. **Bot** → **Reset Token** → copy it. This is the dev `DISCORD_TOKEN`.
3. **Bot** → **Privileged Gateway Intents** → enable **Server Members**. The bot
   requests it at connect for the per-server leaderboard's membership mirror, so an
   app without it fails to log in (`Used disallowed intents`) rather than degrading.
   A small app needs no verification for it.
4. **OAuth2** → **URL Generator** → scopes `bot` + `applications.commands`,
   permissions `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`
   → open the URL and add the bot to a **private test guild you own**.
5. Copy that guild's id (enable Developer Mode, right-click the guild → **Copy Server
   ID**). This is `DISCORD_DEV_GUILD_ID`.
6. **Activities** → **Getting Started** → enable Activities, then add the URL
   mappings from [The Activity, launched from Discord](#the-activity-launched-from-discord).
   Nothing in the REST API can do this: `PATCH /applications/@me` accepts no field
   for it and there is no `embedded_activity_configuration` key to write, so the
   toggle is portal-only. Confirm it took before debugging anything else:

   ```bash
   curl -s https://discord.com/api/v10/applications/@me \
     -H "Authorization: Bot $DISCORD_TOKEN" |
     jq -c '{id, name, flags, embedded_surfaces}'
   ```

   The `EMBEDDED` bit (`1 << 17`, `131072`) must be set in `flags` and
   `embedded_surfaces` must be non-empty. A dev app that still reports only `32768`
   has Activities off, and every symptom downstream — the `play:` button's fallback
   reply, a `50226` on the entry point, no `/iknoball` in the App Launcher — follows
   from that one toggle. The production app usually reads `10649600`, which includes
   `131072`; seeing that number on the dev app means the wrong application's page is
   open, because each app has its own Activities tab at
   `https://discord.com/developers/applications/<app id>/activities`.

7. **Activities** → **Settings** → **Supported Platforms** → tick **Web**, **iOS**
   and **Android** → save. An Activity is launchable only on the platforms ticked
   here, and this is a separate switch from the enable above: with the enable done
   and this still empty, `/iknoball` reaches Discord and comes back rejected with
   `The activity is not configured to support the user's current client platform`.
   That string is Discord's, not ours, so it appears only in the bot log — the user
   sees the generic "could not open here" fallback. Ticking all three avoids having
   to know which client was used, and it is also portal-only.

Until Activities is enabled for the dev app, the `play:` button falls back to its
"could not open here" reply and there is no `/iknoball` entry point. Everything
else — commands, picks, linking, `/setup`, leaderboards, cards — works normally.

## Environment

Orbs read **Amp project env vars**; staging and production read Dokploy's `.env`.
So the orb's `DISCORD_TOKEN` has to be the dev application's token. Do not put a dev
token in Dokploy and do not put the production token here.

```dotenv
DISCORD_TOKEN="<dev application token>"
DISCORD_DEV_GUILD_ID="<test guild id>"
DISCORD_ENABLED="false"
IKNOBALL_API_URL="http://localhost:3000"
INTERNAL_API_TOKEN="<same value the local backend uses>"
```

`DISCORD_ENABLED=false` is the kill switch, and it is the right local default: the
bot still logs in and answers commands and buttons, but every cron — tip-off lock,
stake refresh, settlement, leaderboard — returns before doing any work. That is what
keeps a local bot from editing cards and posting boards the deployed bot also owns.
Set it to `true` only when the cron is the thing you are testing; the sweeps stamp
rows in Postgres and the board poster takes a Redis day key, so the two processes
mostly agree, but you will see both of them in the logs.

## Running it

```bash
amp orb services ensure   # frontend + backend, so /internal calls have somewhere to land
bun run discord           # turbo → apps/discord `dev` → bun --watch
```

Saving a file under `apps/discord/src` restarts the process and reconnects the
gateway. A bad token still exits non-zero instead of looping, so fix the env and run
it again.

On boot, expect:

```text
Discord: logged in as IKnoBall Dev#0000 (1 guilds, enabled=false)
Discord: registered 8 commands in dev guild 123456789012345678 (/ping, /iknoball, /picks, …)
```

With `DISCORD_DEV_GUILD_ID` set, registration is guild-scoped: commands show up in
the test guild within seconds. Without it, commands go global and Discord may take up
to an hour to propagate them, which is the slow loop this exists to avoid.

## The Activity, launched from Discord

The Activity is a web app, but not one a portal URL can serve to Discord: the orb
portal answers an unauthenticated request with Amp's sign-in page, and Discord's
proxy fetches the iframe from its own servers. Discord's own guidance for this is a
tunnel, which also means traffic still goes through the proxy — the same path
production uses, so URL mapping bugs show up locally instead of after a deploy.

A **named** tunnel is used rather than a quick one, because a quick tunnel
(`cloudflared tunnel --url …`) gets a new `trycloudflare.com` host on every
restart, and the Activity's URL mapping would have to be re-pasted each time. The
named tunnel `iknoball-activity-dev` publishes a stable hostname:

The dev Activity needs exactly **one** URL mapping in the developer portal, the
same `/nba` one production uses. Everything else is served through the `/`
mapping, which the tunnel lands on:

| Prefix | Handled by                                                      |
| ------ | --------------------------------------------------------------- |
| `/nba` | Discord's edge → `cdn.nba.com` (portal mapping, not the tunnel) |
| `/api` | Vite proxy → the local backend on `:3000`                       |
| `/`    | the Activity itself                                             |

`/nba` cannot be left out, even in dev. `patchUrlMappings` rewrites
`https://cdn.nba.com/headshots/…` into `/nba/headshots/…` on the `discordsays.com`
origin, and only Discord's edge can serve that prefix. Leave the mapping off and
the request falls through to the `/` mapping instead — Vite answers its SPA
fallback, which is **200 with `index.html`**, so every image is a broken image
rather than a 404 and it reads like a data problem instead of a routing one.

There is deliberately no `/nba` proxy in `vite.config.ts`. It would never be
reached: in a dev-token browser tab the rewrite never runs, so image URLs stay
absolute. A proxy there would only mask a missing portal mapping.

The tunnel's ingress lives in Cloudflare (`config_src: cloudflare`), pointing the
hostname at `http://localhost:5174` with a catch-all `http_status:404`. The
connector only needs its token:

```bash
# Once per orb, if cloudflared is missing:
curl -sL -o ~/.local/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared

# The token is orb-local and must not be committed. Fetch it with
#   GET /accounts/<account>/cfd_tunnel/<tunnel id>/token
# and keep it at 0600.
install -m 600 /dev/null ~/.cloudflared/iknoball-dev.token
$EDITOR ~/.cloudflared/iknoball-dev.token

# Orbs have no UDP egress, so QUIC never connects; --protocol http2 is required.
# `--no-autoupdate` is not a valid flag on `tunnel run` (it belongs to
# `tunnel --url`), so do not copy it over from the quick-tunnel recipe.
amp orb service start activity-tunnel --command \
  '"$HOME/.local/bin/cloudflared" tunnel run --token-file "$HOME/.cloudflared/iknoball-dev.token" --protocol http2'
amp orb service logs activity-tunnel | grep 'Registered tunnel connection'
```

The log line must say `Registered tunnel connection … protocol=http2`. An
`Invalid tunnel secret` error means the token file is wrong, not that the tunnel
is misconfigured.

Three things have to agree on the **dev** application before a launch inside
Discord can sign in and call the API:

- `apps/activity/.env` with `VITE_DISCORD_CLIENT_ID="<dev application id>"`. The
  Activity names the application that serves its iframe, so the production id is
  rejected from the dev app's `discordsays.com` origin. Vite reads `.env` at boot,
  so restart the `activity` service after changing it.
- The backend exchanges the SDK's OAuth code with `DISCORD_CLIENT_ID` /
  `DISCORD_CLIENT_SECRET`. Both are **project-scoped** in Amp, and by default they
  hold the production app's pair. A dev-app launch mints a dev-app code, so the
  exchange fails with "Discord sign-in failed" until both point at the dev
  application. Flipping them also flips the site's Discord sign-in in this orb.

  The pair is testable without a real login — a bogus code separates "wrong
  credentials" from "bad code":

  ```bash
  curl -s -X POST https://discord.com/api/v10/oauth2/token \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "client_id=$DISCORD_CLIENT_ID" \
    --data-urlencode "client_secret=$DISCORD_CLIENT_SECRET" \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode 'code=bogus' | jq -c .error
  ```

  `"invalid_grant"` means the id/secret pair is good; `"invalid_client"` means
  they do not belong to the same application.

- `ACTIVITY_URL=https://<dev application id>.discordsays.com`. The backend's CORS
  allow-list is `FRONTEND_URL` plus `ACTIVITY_URL`, and the Activity's requests
  reach it from Discord's proxy origin. Leave it unset and the preflight is
  refused even though the Activity opened fine.

- `VITE_DISCORD_DEV_GUILD_ID` in `apps/activity/.env` is dev-only and optional.
  The home screen and the boards rank against the guild the SDK reports at launch;
  a browser preview has no SDK, so without this they show the global board alone.
  `?guild=<id>` on the preview URL overrides it for one load.

Environment changes only reach the running processes after
`amp orb restart-processes`, which also restarts the services above.

## Entry point command, and the `/iknoball` that types

There are two separate commands, and only one of them can be typed:

- **The entry point** — type `4`, handler `DISCORD_LAUNCH_ACTIVITY` (2). Enabling
  Activities creates one named `Launch`; rename it to `iknoball`. An app may have
  exactly one, and it must be global. It is **only reachable from the App Launcher**
  (the `+` next to the message box → the app's icon). It never appears in a channel's
  `/` picker, so typing `/iknoball` does not match it and nothing happens.
- **The chat command** — type `1`, name `iknoball`, registered by the bot from
  `apps/discord/src/interactions/iknoball.command.ts`. This is the one that shows up
  when you type `/iknoball` in a channel; it answers with callback type `12`
  (`LAUNCH_ACTIVITY`), which is Discord's instruction to open the app. Command names
  are unique per type, so both may be called `iknoball` at once.

The entry point still matters: it is what puts IKnoBall in the App Launcher, and
Discord creates the Activity's follow-up message from it.

```bash
# Find it — the entry point is the command with type 4.
curl -s https://discord.com/api/v10/applications/<dev app id>/commands \
  -H "Authorization: Bot $DISCORD_TOKEN" | jq '.[] | select(.type == 4) | {id, name}'

# Rename it. Only name and description are settable on this route.
curl -s -X PATCH \
  https://discord.com/api/v10/applications/<dev app id>/commands/<id> \
  -H "Authorization: Bot $DISCORD_TOKEN" -H 'content-type: application/json' \
  -d '{"name":"iknoball","description":"Play IKnoBall"}'
```

Creating one with `POST /applications/<id>/commands` and `{"type":4,"handler":2}`
also works, but only once the app has an Activity: before that Discord rejects it
with `50226`, "PRIMARY_ENTRY_POINT app commands must have APP_HANDLER handler if app
has no activity".

The bot's guild-scoped registration does not touch it. `registerCommands` only
overwrites guild commands when `DISCORD_DEV_GUILD_ID` is set, so the global entry
point survives every restart.

## Things that are still real

- **Data.** The bot writes to the same dev Postgres as staging: picks, stakes, guild
  settings, and board rows you create in the test guild are real rows there.
- **The API.** Anything that calls `/api/internal/*` needs the local backend up and
  `INTERNAL_API_TOKEN` matching it. A 401 shows as the generic "Something went wrong"
  reply, and the reason is in the bot's log.
- **Command definitions are the only thing the dev guild scopes.** Cards, buttons,
  and members come from the guild the interaction happens in, so test in the test
  guild and leave the real ones alone.
- **An orb pause silently kills both long-lived connections.** The tunnel and the
  bot keep their processes and still show `active`, but their sockets are gone:
  Cloudflare answers `530` for the Activity URL and the bot never sees an
  interaction, so `/iknoball` does nothing at all. Neither reconnects on its own.
  `.agents/resume` restarts both on every wake for exactly this reason — it is
  unconditional rather than probed, because a socket that outlived a pause still
  reads `ESTABLISHED` against a peer that is gone, so a liveness check would pass
  a zombie. If a launch misbehaves after the orb has been idle, restart the two by
  hand before looking anywhere else:

  ```bash
  amp orb service restart activity-tunnel
  amp orb service restart discord-bot
  ```

- **A dev-only freeze on the boot screen means two handshakes, not a bad token.**
  `DiscordSDK` is bound to the frame it was constructed in: Discord accepts one
  `HANDSHAKE` per `frame_id` and drops any that follow, so a second instance
  waits for a `READY` that never arrives and the app sits on "Signing you in with
  Discord…" forever. React StrictMode mounts effects twice in development, which
  used to create exactly that second instance; a production build mounts once and
  was never affected. `connectDiscord()` in `apps/activity/src/lib/discord.ts`
  now memoises the in-flight promise so the frame is only ever handshaked once.
  If this symptom returns, check for a second `DiscordSDK` construction before
  touching credentials — the giveaway is a boot screen with no
  `ActivityService` line in the backend log, because the app never gets as far as
  exchanging a code.

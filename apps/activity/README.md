# IKnoBall Activity

The play surface. A Discord Activity — a React app that runs inside Discord's
iframe, launched from a channel by the app's entry point command, which is
named `iknoball` so it reads `/iknoball`.

It replaces the bot as the place where people play: picks, Lebronnect, and the
leaderboard. The bot keeps doing notifications.

```bash
bun run activity        # turbo run dev --filter=activity (port 5174)
bun run activity:build  # tsc -b && vite build
```

## Environment

| Variable                 | Where    | What                                                          |
| ------------------------ | -------- | ------------------------------------------------------------- |
| `VITE_DISCORD_CLIENT_ID` | activity | The bot's application id (`1531941991875743744`).             |
| `VITE_API_URL`           | activity | API base: the path `/be` in a production build, unset in dev. |
| `ACTIVITY_URL`           | backend  | Optional. Only for a cross-origin API; `/be` needs neither.   |

`VITE_API_URL` is a path rather than an origin because inside Discord the app is
served from `<app id>.discordsays.com`, so `/be/api/...` is same-origin and the
portal's `/be` URL mapping forwards it. Discord's CSP blocks the direct
cross-origin call, and same-origin keeps CORS out of it entirely — which is why
`ACTIVITY_URL` is not needed.

## Sign-in

There is no login screen. `connectDiscord()` in `src/lib/discord.ts` runs the
SDK handshake, gets a one-time OAuth `code` from `commands.authorize`, and POSTs
it to `POST /api/activity/session`. The backend trades it for a Discord access
token with the client secret, resolves the Discord id to an existing IKnoBall
account through `DiscordLinkService` (the same link `/link` in the bot writes),
and mints a real Better Auth session. Every later call carries
`Authorization: Bearer <token>`.

An unlinked Discord account gets a 403 that tells the player to run `/link`; the
endpoint never creates a user.

## Images

Headshots and team logos come from `cdn.nba.com`, which Discord's CSP blocks.
The activity registers the URL mapping `/nba → https://cdn.nba.com` with
`patchUrlMappings(mappings, { patchSrcAttributes: true })`. The second argument
is required: the default only patches fetch/XHR/WebSocket, which leaves every
`<img src>` blocked. With it, the SDK watches `src` attributes and added nodes,
so React-mounted avatars are caught too.

## Testing

Three layers, cheapest first. Only the last one needs a deploy.

**Unit tests.** `bun run --filter activity test` covers what fails silently.
`src/lib/discord.spec.ts` drives the SDK's own `patchUrlMappings` with a stubbed
`window`, so a mapping that leaves `cdn.nba.com` URLs untouched fails here
instead of showing up as broken headshots in the client.

**The real UI, against the real API.** In dev, `App.tsx` takes a session token
from `?token=` (it then remembers it in `localStorage` under
`iknoball.activity.dev-token`) and skips the SDK handshake, so a plain browser
tab drives every screen:

```bash
bun run activity   # http://localhost:5174/?token=<session token>
```

That token is a Better Auth session token: sign into the site, then copy the
`set-auth-token` response header from any `/api/auth/...` call in devtools. It
is good for as long as that session is.

**What the harness cannot show.** Outside Discord there is no CSP, no URL
mapping and no iframe, so `cdn.nba.com` loads directly and a broken mapping
looks perfect — that is how a wrong target reached production once. The
handshake and the frame's size are the same story. Those live only in a real
client, which is why the mapping is pinned by a unit test rather than by
looking at the page.

## Deploy

`apps/activity/Dockerfile` builds the bundle and serves it from nginx on port
3000, the same shape as the site's image. Both settings are baked in at build
time by `.github/workflows/cd.yml`:

| Build arg                | Value                 |
| ------------------------ | --------------------- |
| `VITE_API_URL`           | `/be`                 |
| `VITE_DISCORD_CLIENT_ID` | `1531941991875743744` |

`/be` is a path, not an origin, on purpose. Inside Discord the app is served
from `1531941991875743744.discordsays.com`, so `/be/api/me` is same-origin:
Discord's proxy forwards it to `api-iknoball.setotechs.com` and the browser never
makes a cross-origin request. No CORS is involved, and `ACTIVITY_URL` is not
needed for the activity (it stays in the backend's allow-list for the site).

The production host is `activity-iknoball.setotechs.com`, declared in
`deploy/dokploy/production.compose.yaml`. Dokploy keeps its own copy of that
compose, so the repo file has to be pasted back in before the service exists.

## Discord developer portal

Same application as the bot. None of this can be scripted from the repo:

1. **Activities → Settings** — enable Activities.
2. **Activities → URL Mappings** — prefix and target, no scheme on the target:

   | Prefix | Target                            |
   | ------ | --------------------------------- |
   | `/be`  | `api-iknoball.setotechs.com`      |
   | `/nba` | `cdn.nba.com`                     |
   | `/`    | `activity-iknoball.setotechs.com` |

   Order matters: Discord matches globs shortest-last, so `/` goes at the bottom
   or it swallows `/be` and `/nba`.

3. **Entry Point command** — enabling Activities creates one named "Launch".
   Rename it to `iknoball`; do not add a second, an app may have exactly one and
   it must be global:

   ```bash
   # Find it: the entry point is the command with "type": 4.
   curl -s https://discord.com/api/v10/applications/1531941991875743744/commands \
     -H "Authorization: Bot $DISCORD_TOKEN" | jq '.[] | select(.type == 4) | {id, name}'

   # Rename it. Only the name and description are settable on this route.
   curl -s -X PATCH \
     https://discord.com/api/v10/applications/1531941991875743744/commands/<id> \
     -H "Authorization: Bot $DISCORD_TOKEN" -H 'content-type: application/json' \
     -d '{"name":"iknoball","description":"Play IKnoBall"}'
   ```

4. **OAuth2 → Redirects** — the SDK's `authorize` does not need a redirect URI,
   but the site's Discord sign-in still does.

The bot's command sync carries the entry point through untouched: Discord
rejects a bulk overwrite that omits it (error `50240`), so
`DiscordClientService.registerCommands` re-sends whatever entry point exists
alongside the slash commands.

## Dev without Discord

The activity needs an authenticated API call, and in a browser tab there is no
Discord SDK to produce one. In dev only, `?token=<session token>` (or the copy
left in `localStorage`) skips the handshake. A production build always goes
through Discord.

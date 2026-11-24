# IKnoBall Activity

The play surface. A Discord Activity — a React app that runs inside Discord's
iframe, launched from a channel by the `/iknoball` command (or from the App
Launcher).

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
The activity registers the URL mapping `/nba → cdn.nba.com` with
`patchUrlMappings(mappings, { patchSrcAttributes: true })`. The second argument
is required: the default only patches fetch/XHR/WebSocket, which leaves every
`<img src>` blocked. With it, the SDK watches `src` attributes and added nodes,
so React-mounted avatars are caught too.

`target` is a **bare host**, never a URL. The SDK builds its matcher with
`new URL('https://' + target)`, so `'https://cdn.nba.com'` parses to the host
`https` and matches no image at all. That failure is silent: the portal mapping
looks right, no `/nba` request is ever made, and every image stays blocked by
CSP while the avatar (a `cdn.discordapp.com` URL the CSP already allows) renders
fine. `src/lib/discord.ts` derives it from `CDN_ORIGIN` so the two cannot drift.

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

3. **Commands** — two of them, and they are not interchangeable:

   - The **entry point** (type `4`, handler `2`) is what lists the app in the App
     Launcher. Enabling Activities creates one named "Launch"; rename it to
     `iknoball`. An app may have exactly one and it must be global. It is not
     reachable by typing in a channel.

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

   - The **chat command** (type `1`, name `iknoball`) is the one people type. The
     bot registers it from `apps/discord/src/interactions/iknoball.command.ts`
     and it answers with callback type `12`, which opens the Activity. Names are
     unique per type, so it coexists with the entry point above.

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

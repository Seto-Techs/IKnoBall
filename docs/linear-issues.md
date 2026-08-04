# Linear Issue Drafts — IKnoBall

Reusable bodies for Linear issues (Setotechs team, IKnoBall project). Copy the body into Linear and adjust priority/labels as needed. A blank template is at the bottom.

---

## SET-37 — Staging: data layer hits FE origin instead of api-iknoball-staging

- Priority: P1 · Label: (none) · State: Backlog

**Problem**
Staging browsers call `GET https://iknoball-staging.setotechs.com/api/teams` (frontend origin) instead of `https://api-iknoball-staging.setotechs.com/api/teams`. Onboarding shows an empty team grid.

**Root cause**
`apps/frontend/src/lib/api.ts` hardcoded `const API = '/api'` (same-origin relative) while `lib/auth.ts` correctly consumed `import.meta.env.VITE_API_URL` (injected at build by `cd.yml`). Prod nginx has no `/api` proxy, so the request fell through to `index.html` and JSON parsing failed.

**Fix (branch `feat/dash`)**
API base now mirrors auth.ts — `/api` in dev (Vite proxy), `${VITE_API_URL}/api` in prod; `credentials: 'include'` added so the session cookie (scoped to the api subdomain) travels cross-origin. Local dev masked the bug via the Vite proxy; reproducible by prod-build + static serve.

---

## SET-38 — Backend as single source of truth for team data (remove nba-teams.ts)

- Priority: P2 · Label: (none) · State: Backlog

**Scope (branch `feat/dash`)**

- Delete `apps/frontend/src/config/nba-teams.ts` + dead `config/teams.ts` (teamColors).
- Remove local fallbacks from `useTeamInfo` (deleted, had no callers) and `useTeamRecord`.
- New backend endpoint `GET /api/teams/:abbr/record`: W/L computed from `schedule_games` (final games, regular season only — excludes Preseason/All-Star labels, playoffs via `seriesText`, joined `scheduleDays.seasonYear='2025-26'`, BKN-BRK tricode map), conference/division from `teams` row. Validated against cumulative `homeTeamWins/Losses` snapshot columns.

**Verified**
30 teams with leaders; SAS 61-20; BRK 20-62; unknown abbr 404; browser E2E onboarding to dashboard.

**Related**
User team selection storage (localStorage `iknoball_team`) removal is tracked in SET-40 — it supersedes the `__root` session→localStorage sync.

---

## SET-40 — [Frontend] Session as source of truth for selected team (remove localStorage team mechanism)

- Priority: P2 · Label: Improvement · State: Backlog

**Problem**
The dashboard's team selection lives in `localStorage['iknoball_team']`, read synchronously at render and consumed by `useTeamRecord`/`useUpcomingGames`/`useTopPlayers` with no session or backend check. Consequences:

- On any cold open of `/dashboard`, the three hooks fire for whatever abbr is in localStorage — even logged out or with the backend down (observed: SAS/HOU request bursts + ECONNREFUSED spam via the Vite proxy).
- `__root.tsx` carries a session→localStorage sync effect that races the dashboard read — cross-device team changes fetch the _previous_ team's data first.
- The dashboard route has no auth guard: logged-out users with a stale `iknoball_team` get the full dashboard and fire authed requests that 401.

**Change (branch `feat/dash`, uncommitted)**

- Deleted `apps/frontend/src/lib/team.ts` (all four exports) and every call site: `dashboard`, `onboarding`, `__root`, `login`, `index`, `api.ts`.
- `useTeamRecord`/`useUpcomingGames`/`useTopPlayers` now take `abbr` explicitly and gate on `enabled: !!abbr`.
- Dashboard derives the team from `session.user.favoriteTeam`; display metadata (name/color/logo) resolved from the shared `useTeams()` query. Guards: session pending → blank; no session → `/auth/login`; no favoriteTeam → `/onboarding`.
- Onboarding: same session guard; `useTeams` gated on session; Continue now writes the session cache optimistically (`setQueryData(['session'])`) before PATCH `/me/team`, then navigates — no localStorage write, no redirect loop.
- Login/index redirects are session-based (`user.favoriteTeam` from the sign-in response).
- `useSignIn` now invalidates `['session']` in real mode (previously the 5-min stale `null` cache masked the fresh session after login).

**Accepted tradeoffs (grilled + agreed)**

- `useSession` swallows fetch errors → backend-down is indistinguishable from logged-out → users get bounced to the login page instead of an error screen. Follow-up candidate: surface a session-fetch error state.
- Dashboard renders blank until the `teams` metadata query resolves; a teams-fetch failure leaves it blank (accepted corner).
- Continue's optimistic write costs one round trip before the dashboard shows the new team (imperceptible locally).

---

## SET-41 — Standings: conference standings rail

- Priority: P2 · Label: Improvement · State: Backlog

**Problem**
Dashboard has no league context. Standings exist only at stats.nba.com, which blocks browser calls (headers/CORS) and has no backend consumer.

**Change (branch `feat/dash`, uncommitted)**

- `GET /api/standings`: fetch-through leaguestandingsv3 (`GroupBy=conf`, `LeagueID=00`, `Season=NBA_CURRENT_SEASON`, Regular Season, overall) with the `NBA_STATS_*` env headers; 30-min Redis cache (`standings:<season>`, keyExists-guarded); rows joined to teams by externalId (abbr + logoUrl); grouped West/East, sorted by PlayoffRank.
- Clinch markers from API booleans: `w`/`e` (conference title) > `x` (playoff birth) > `pi` (play-in) > `ps` (postseason) > `o` (eliminated).
- FE: dashboard body becomes 3 columns at xl+ (standings rail | team info | blank for future use); rail sticky, hidden below 1280px; two tables (West top, East bottom) with logo, abbr+marker, W, L, GB (`ConferenceGamesBack`); dashed line between ranks 6/7, solid between 10/11; user's team row highlighted.

**Accepted tradeoffs**

- Fetch-through + Redis, no DB table — standings are ephemeral.
- Upstream down after cache expiry → 502 on `/standings`.
- Rail only at >=1280px viewports.

---

## SET-42 — Dashboard data endpoints and panels

- Priority: P2 · Label: Improvement · State: Backlog

**Change (branch `feat/dash`, uncommitted)**

Backend:

- `GET /teams/:abbr/record` returns `lastGames` — top 5 final games with real scores (any phase: regular season, play-in, playoffs; 0-0 placeholder scores excluded; BKN/BRK tricode mapped), team-perspective (`opponentAbbr`, `isHome`, `ourScore`, `oppScore`, `gameDate`).
- `GET /teams/:abbr/games` — next 5 upcoming (`gameStatus=1`, `gameDateTimeUTC >= now`, names via teams join, BKN/BRK mapped).
- `GET /teams/:abbr/players` — top 3 by ppg+rpg+apg with adaptive min-games guard (half of league max gp, capped at 20), 1-decimal rounding, CDN headshot URLs (260x190).

Frontend:

- Last 5 Games strip: away @ home cards (logo, abbr, score per team), green W / red L badge, date; newest leftmost; responsive grid (2-col mobile, 5-col sm+).
- Top Players: 3 cards in a row (headshot, name, position, PTS/REB/AST).
- Stats row reduced to Conference / Division / Record.

**Accepted tradeoffs**

- Per-game stats can skew for low-gp players early in a season — the guard relaxes to half the league's most-played games until 20 is reached.
- The June sync gap (see SET-43) means strips end early for playoff teams.

---

## SET-43 — Worker: June sync gap leaves Finals games incomplete

- Priority: P2 · Label: (none) · State: Backlog

**Problem**
The schedule/boxscore crawl stopped in mid-June 2026: Finals games 4-7 are still `gameStatus=1` and Finals games 2-3 have 0-0 placeholder scores. Last 5 games / last game panels therefore end at Finals Game 1 (Jun 8) for playoff teams, even though the season completed.

**Change**

- Investigate why the worker's schedule + boxscore processors stopped updating after ~Jun 8 (queue stalled? NBA source error? exception swallowed?).
- Ensure all final games reach `gameStatus=3` with real boxscores.
- Add a reconciliation pass: flag/sync games past their scheduled date that are still not final.

---

## Template — blank issue body

- Title:
- Priority: P2 · Label: · State: Backlog · Project: IKnoBall

**Problem**
(What breaks or is missing, with observable symptoms. One paragraph + bullets.)

**Change**
(What to touch, file by file, with the intended behavior. Bullets.)

**Accepted tradeoffs**
(Decisions taken and their costs, so future readers don't relitigate them.)

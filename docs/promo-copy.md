# IKnoBall — promotional copy

Ready-to-post copy for Reddit, Discord, and LinkedIn, plus the screenshot set to
attach to each. Written against the live site: <https://iknoball.setotechs.com>.

**The product in one line:** a free, season-long NBA prediction game where one
pick scores on two leaderboards (flat and dynamic), wrapped in a stats app with
live scores, standings, stat leaders, player pages, and shot-zone charts.

---

## Read this before you post

Four things that will decide whether this lands or gets deleted.

1. **The copy is deliberately free of betting vocabulary.** The weighted board is
   built on real moneyline prices, but nothing user-facing says so: the app now
   talks about _dynamic scoring_ — points scale with how big the call is. That is
   a reframe, not a disguise: the scoring genuinely works that way, and the terms
   of service already describe odds as "only a scoring weight". Keep it consistent
   and do not reintroduce words like _odds_, _moneyline_, _payout_, or _bet_ in
   posts. If you do, r/nba's Rule 4 ("no betting, fantasy sports, parlays, or odds
   talk") and similar rules elsewhere become a live problem instead of a
   non-issue.

2. **Lead with the stats, not the game.** The hook that travels in NBA-adjacent
   spaces is "a stats app for the whole league that also has a prediction game".
   The prediction game is the reason to come back; the stats are the reason to
   click.

3. **Pick the right screenshots.** The 2026-27 season is 67 games old, so the
   dashboard and standings honestly show `0-0` and "No settled picks". Those
   shots undersell the product. Lead with the game page, the slate, the league
   dashboard, and the shot-zone chart — they're full of real data. Put the
   dashboard shot later, if at all.

4. **One pre-flight check, and it is not done yet.** The landing page hero used to
   hardcode "2025–26 season · 30 teams" while the app runs 2026-27. That's fixed
   in code (`7a9013c`, the label is now derived from today's date), **but the fix
   is only on `dev` and production still serves the old bundle.** `cd.yml` fires
   on merged pull requests only — never on a push — and `dev` deploys staging
   while `main` deploys production. So the live site stays stale until a
   `dev` → `main` PR is merged. Check before you send traffic:

   ```bash
   curl -s https://iknoball.setotechs.com/ | grep -o 'assets/[^"]*\.js' | head -1
   # then grep that bundle for "2025–26 season"; it should be gone
   ```

---

## Reddit

Reddit punishes anything that reads like an ad. The pattern that works: open with
an observation or a problem, be specific about what you built and why, disclose
that it's yours, and ask a real question so the thread becomes a conversation.
Reply to every comment in the first hour. Do not cross-post the same text
word-for-word — each sub gets its own version below.

### A. r/SideProject — "show the thing" post

**Title:** I got tired of scoreboard apps that stop at the score, so I built a full NBA stats site with a prediction game on top

**Body:**

> Every NBA app I tried does one of two things. Either it's a scores app that
> tells you the Celtics won by 13 and nothing else, or it's a stats site that
> looks like a spreadsheet from 2009.
>
> I wanted the thing in between: open it, see tonight's slate, see where my team
> actually sits, then actually have a reason to care about the 10pm game I'd
> otherwise skip.
>
> So I built IKnoBall. It's free, no ads, no card.
>
> **The stats half**
>
> - Tonight's slate, the next seven days, and every result by game day
> - Conference standings with games back and clinch markers
> - League and team stat leaders, updated as games finish
> - Player pages with full career tables and a shot-zone chart that colours each
>   zone against the league average from that spot
> - Game pages with the head-to-head series and a live box score that refreshes
>   while you watch
> - Your dashboard takes on your team's colours, because it's their season
>
> **The game half**
>
> Pick the winner of any game before tip-off. One submit, and that pick scores on
> two separate leaderboards:
>
> - **Flat** — 1 point per correct pick. The purist's board.
> - **Dynamic** — points scale with how big the call is. Call a comfortable
>   favourite, earn about 15. Call a genuine upset, earn 40 or more.
>
> The part I'm most pleased with: the weighting is normalised, so the two sides of
> every game carry equal expected value. Always picking favourites and always
> picking underdogs score the same on average, which means the dynamic board
> rewards reading games, not a strategy exploit. Your weighting freezes when you
> submit, so it can't shift under you after the fact.
>
> It's a real product, not a landing page — everything above is live data from the
> NBA's own feeds, ~900 players indexed, five seasons of history.
>
> **https://iknoball.setotechs.com**
>
> Screenshots in the comments. Two things I'd genuinely like opinions on:
>
> 1. Is the two-board split (flat + weighted) actually appealing, or would you
>    rather have one scoring system and less to think about?
> 2. Does "pick your team and the whole UI becomes theirs" read as a feature or
>    as a gimmick to you?
>
> Built it solo. Happy to answer anything about how it works.

**First comment (post yourself, immediately):**

> Screenshots:
>
> - The slate — tonight's games with the pick panel open
> - The league dashboard — tonight, previous game day, next seven days
> - A player page — career table and the shot-zone chart
> - A live game — box score updating mid-game
>
> Stack, since people usually ask: React + TanStack Router/Query on the front,
> NestJS + Postgres behind it, a worker that pulls schedules and live box scores
> from the NBA's feeds, and a Redis cache in front of standings. Dynamic scoring
> is a points multiplier derived from the matchup's implied probability, frozen at
> submit time.

### B. r/webdev — "how it's built" post

**Title:** I built a full NBA stats + prediction app solo — here's what actually took the time

**Body:**

> Side project I've been chipping at: IKnoBall, a stats and prediction app for the
> whole NBA season. Live scores, standings, stat leaders, player pages with
> shot-zone charts, and a prediction game with two scoring modes.
>
> **https://iknoball.setotechs.com**
>
> The interesting problems weren't the ones I expected. In rough order of how much
> time they ate:
>
> **1. The data doesn't want to be used.** There's no public NBA API. Schedules and
> box scores come from stats.nba.com, live scores from cdn.nba.com, and the stats
> endpoint rejects anything that doesn't look like a browser. So the ingestion
> layer carries browser-shaped headers, retries, and a fallback path for every
> source, because a quiet feed is indistinguishable from a broken one.
>
> **2. Dynamic scoring has a fairness trap in it.** To weight a pick by how big the
> call is, you need each side's implied probability. A published two-way price
> doesn't give you that cleanly — the two implied probabilities sum to more than
> 100%, and the excess is the house margin. Score straight off the published number
> and picking favourites is quietly better than picking underdogs, which turns a
> knowledge test into a strategy puzzle. Normalising the two sides so they sum to
> exactly 1 fixes it. Cheap to do, completely changes the game.
>
> **3. One pick, two leaderboards.** Flat and dynamic have to agree on which side
> you picked while scoring differently. A single submit writes both rows in one
> transaction against a frozen multiplier, so the two boards can never disagree
> about what you picked or what it was worth.
>
> **4. Empty states are the real UI.** A stats app is mostly empty for most of the
> day — no games yet, no picks settled, off-season. Getting those screens to look
> deliberate instead of broken was more design work than the populated ones.
>
> **5. Team colours are a trap.** "Make the dashboard your team's colours" sounds
> like a CSS variable. Then you hit a team whose primary colour is white, or navy
> on a dark surface, and you're writing contrast rules per team.
>
> Stack: React 19 + TanStack Router/Query + Tailwind, NestJS + Drizzle + Postgres,
> a NestJS worker on BullMQ for the sync jobs, Redis for the standings cache,
> Docker Compose on a single VPS.
>
> It's free and there's no card. If you're into the NBA, it's more fun with people
> on the leaderboard than sitting there empty. If you're into the build, ask me
> anything — especially if you've fought the same data sources.

### C. If you only get one shot — r/InternetIsBeautiful style

**Title:** A free NBA stats site where picking games actually means something

**Body:**

> No ads, no paywall, no card. Sign in with email or Discord and it's yours.
>
> It shows the whole league properly — tonight's slate, standings with clinch
> markers, stat leaders, player pages with shot-zone charts that compare each zone
> to the league average, live box scores that update while the game runs.
>
> Then there's a prediction game on top. Pick a winner before tip-off and your pick
> scores twice: once on a flat board where every game is worth 1, and once on a
> dynamic board where points scale with how big the call is. Comfortable favourites
> earn a little, genuine upsets earn a lot, and the weighting is normalised so
> neither approach has an edge.
>
> **https://iknoball.setotechs.com**
>
> Made it myself, free for the season.

**Note:** check the sub's rules first — many "cool site" subs ban self-submitted
projects outright, and r/InternetIsBeautiful specifically wants no self-promo.

**On r/nba specifically:** the vocabulary reframe removes the odds problem, but not
the rest of it. Rule 3 still requires a 6+ month old account, prior participation,
90%+ non-promo history, and flair for a standalone post, and r/nba is the single
worst place to learn that the hard way. Use the **Friday Self-Promotion and Fan
Art** thread, and treat it as a bonus channel rather than the plan.

---

## Discord

Discord is a relationship space, not a distribution channel. Three rules: only
post in a channel that allows it (or a `#self-promo` / `#showcase` channel), say
why it's relevant to _that_ server, and disclose you made it. Never DM strangers
with it. Keep it short — long posts get skimmed and ignored.

### D. General self-promo channel

> **Free NBA prediction game I built — one pick, two leaderboards**
>
> I've been building this solo for a while and it's finally at the point where
> other people using it makes it better: **https://iknoball.setotechs.com**
>
> You pick the winner of any game before tip-off. One pick scores on two boards:
>
> - **Flat** — 1 point a correct pick
> - **Dynamic** — points scale with how big the call is. A comfortable favourite
>   earns ~15, a genuine upset earns 40+
>
> The weighting is normalised, so calling favourites and calling upsets are worth
> the same on average — it rewards actually knowing ball, not a strategy.
>
> It's also a full stats app, not just a game: live box scores, standings with
> clinch markers, stat leaders, player pages with shot-zone charts, and your
> dashboard takes your team's colours.
>
> Free, no card, email or Discord login. There's a leaderboard sitting mostly empty
> right now, which is honestly the best time to get on it. Feedback very welcome —
> I'm in here, just ping me.

### E. Short version (for a channel with tight limits)

> Built a free NBA prediction game — pick a winner before tip-off, one pick scores
> on both a flat board and a dynamic one (favourite ≈ 15 pts, upset 40+).
> Also has live box scores, standings, stat leaders and shot-zone charts.
> **https://iknoball.setotechs.com** — no card, email or Discord login. Made it
> myself, feedback welcome 🙏

### F. Posting etiquette, condensed

- Post once per server. Do not repeat it weekly.
- If the server has a `#self-promo` channel, that's the only place it goes.
- React to and reply to anyone who responds. A dropped link with no follow-up is
  what gets promo channels locked.
- If a mod asks you to stop, stop.

---

## LinkedIn

LinkedIn is the "look at what I shipped" audience. Two things matter: the first
two lines, because that's all that shows before "see more", and putting the
problem and the engineering judgement ahead of the feature list. Lead with the
hard part, not the launch.

**Link placement:** a URL in the post body costs roughly 45–55% of reach after
LinkedIn's 2026 algorithm changes; a link in the first comment costs roughly
10–15%. For a portfolio post, reach is the whole point, so put the link in the
first comment and say "link's in the comments". If you want the preview card and
don't care about reach, put it in the body.

### G. Main post

> I spent a season building an NBA app because every one I tried stopped at the
> scoreboard.
>
> IKnoBall is a stats platform for the whole league — live box scores, conference
> standings with clinch markers, league and team stat leaders, player pages with
> career tables and shot-zone charts, and a game page that shows the head-to-head
> series before tip-off. Then, on top of all of it, a prediction game.
>
> Three problems made it worth building:
>
> **The data doesn't want to be used.** There's no public NBA API. Schedules and
> box scores come from one endpoint, live scores from another, and the stats
> endpoint rejects anything that doesn't look like a browser. The sync layer is
> built to fail loudly and recover quietly.
>
> **A naive leaderboard is a broken leaderboard.** To score a pick by how big the
> call is, you need each side's implied probability — and a published two-way price
> doesn't hand it to you cleanly. The two implied probabilities sum to more than
> 100%, and that excess is the house margin. Score straight off the published
> number and picking favourites quietly beats picking underdogs, and your "who
> knows ball" game becomes "who found the exploit". I normalise the two sides so
> they sum to exactly 1. Favourites and underdogs then sit at equal expected value,
> and the dynamic board rewards judgement instead of a strategy.
>
> **Two scoring modes, one pick.** Flat pays 1 per correct pick; dynamic pays a
> multiplier derived from that normalised probability, capped. Both read the same
> submit, against a multiplier frozen at that moment, written in one transaction —
> so the two leaderboards can never disagree about what you picked or what it was
> worth.
>
> The result is a product, not a prototype: ~900 players indexed, five seasons of
> history, live data during games, and a dashboard that takes on your team's
> colours.
>
> Stack: React 19 + TanStack Router/Query + Tailwind, NestJS + Drizzle + Postgres,
> a NestJS worker on BullMQ for ingestion, Redis for caching, Docker Compose on a
> single VPS, CI/CD to staging and production.
>
> Free, no ads, no card. It's live, and the leaderboard has room.
>
> Link in the comments — I'd genuinely like feedback from anyone who's built
> against awkward public data sources, or anyone who watches more basketball than
> is healthy.
>
> #SoftwareEngineering #React #TypeScript #NestJS #SideProject #NBA

**First comment:**

> Here's the site: https://iknoball.setotechs.com
>
> Happy to go deeper on any part of it — the ingestion worker, the probability
> normalisation behind the scoring, or the two-board model.

### H. Shorter variant (if you want it punchier)

> I built an NBA app because I wanted one that didn't stop at the scoreboard.
>
> The stats side: live box scores, standings with clinch markers, stat leaders,
> player pages with shot-zone charts, head-to-head history on every game.
>
> The game side: pick a winner before tip-off. One pick scores on two
> leaderboards — flat, where every game is worth 1, and dynamic, where points scale
> with how big the call is. Comfortable favourites earn ~15, genuine upsets 40+.
>
> The detail I'm proudest of is invisible: the weighting is normalised, so picking
> favourites and picking upsets are worth exactly the same on average. Without
> that, the dynamic board is just an "always pick the favourite" machine. With it,
> it's a test of judgement.
>
> Solo build. React + NestJS + Postgres, a BullMQ worker doing the ingestion,
> Docker Compose on one VPS, CI/CD to staging and prod.
>
> Free, no card. Link in the comments.
>
> #SoftwareEngineering #TypeScript #SideProject #NBA

---

## Screenshots

All under `.amp/in/artifacts/promo/final/`. Captured at 2x from the live app,
1440–1600 px wide depending on the page.

| File                      | What it shows                                           | Use for                                          |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `03-game-pick.png`        | Game page, GSW @ LAL, pick panel with a locked pick     | **Lead image everywhere.** Best single shot      |
| `02-slate.png`            | Predictions slate — stat strip, week strip, all 3 cards | Reddit body, Discord                             |
| `04-league-dashboard.png` | League-wide dashboard: tonight, standings, both boards  | Reddit, LinkedIn                                 |
| `06-shot-zones.png`       | Shot-zone heat map vs league average                    | LinkedIn (the "engineer" shot)                   |
| `07-live.png`             | Live game, 58–45, box score                             | Reddit comment thread                            |
| `05-team-dashboard.png`   | Team dashboard in Lakers purple                         | Second wave / LinkedIn carousel                  |
| `01-landing.png`          | Public landing page, hero reading "2026-27 season"      | Only post once the fix is live (see check above) |

Suggested order per platform:

- **Reddit:** lead with `03-game-pick`, then `02-slate`, `04-league-dashboard`,
  `06-shot-zones`.
- **Discord:** `03-game-pick` + `02-slate` as a two-image message. Discord
  renders them stacked; more than three gets collapsed.
- **LinkedIn:** `03-game-pick` first (it reads at thumbnail size), then
  `06-shot-zones`, then `04-league-dashboard`. A 3-image post is the sweet spot.

---

## Sequencing

1. Fix the landing page season label, then get it deployed — merge a `dev` → `main`
   PR, because that's the only thing that rebuilds production. Verify the live
   bundle no longer says "2025–26" (command above). Then verify the signup →
   verification email → first pick path end to end with a real inbox.
2. Post to **r/SideProject** first. It's the most forgiving audience and gives you
   the honest feedback you'll want before a bigger sub sees it.
3. **r/webdev** a few days later, with the build-focused version. Different text,
   not a repost.
4. **LinkedIn** the same week — it doesn't overlap with Reddit's audience at all.
5. **Discord** last, and only in servers you're already active in. It converts
   best when people recognise you.
6. Reply to every comment for the first hour of each post. That's the single
   highest-leverage thing on Reddit's ranking.

Do not post the same body to multiple subs on the same day. Reddit's spam
detection looks across subreddits, and identical text is the easiest thing in the
world to flag.

# Discord bot — listing copy and the gambling question

Draft for DISC-13 (chunk C4). Two things live here: the written answer to whether odds-derived
**scoring** trips Discord's gambling rules, and the copy for the bot's profile page in the
Developer Portal.

**Status:** draft, not submitted. This file is documentation only — no code reads it.

**Ship separately.** This is a legal-adjacent change. It must not land in the same PR as bot
code; the privacy-policy section in
`apps/frontend/src/content/legal/privacy-policy.md` is the part that has to be live before the
bot leaves a test guild.

---

## 1. Does odds-derived scoring trip Discord's gambling clause?

**Answer: no — not as the product is built. The rules that could bite are not the gambling
clause; they are the App Directory content rules, and they only bite if we ask to be listed.**

Two separate gates, with different texts:

| Gate                              | What it asks                                                | Applies when                  |
| --------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| Operating the bot in servers      | Is this illegal gambling?                                   | Always                        |
| App Directory / Discovery listing | Is this content "gambling-adjacent or addictive behaviour"? | Only if we opt into discovery |

We pass the first on the text. The second is discretionary and is the reason the listing copy
below never mentions prices.

### 1.1 What Discord actually says

All quotes are from Discord's own pages, read on **27 October 2026**. Note that the paths in
`docs/discord-bot-issues.md` (`discord.com/developers/docs/policies-and-agreements/developer-policy`,
`…/developer-terms-of-service`, `…/app-listing-requirements`) now return **404**. The live text
has moved to `support-dev.discord.com`; Discord's own help articles still link to the dead paths,
which is why they are easy to follow into a 404. The URLs below are the ones that served the
quoted text.

**Developer Policy** — <https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy>
(effective 8 July 2024), under "Respect Our Platform Rules":

> **8. Do not use the APIs for any dangerous or illegal activity.** This includes, but is not
> limited to, activities that facilitate or promote:
>
> - Risks to physical safety;
> - Environmental damage;
> - Financial scams; or,
> - Illegal online gambling.

The qualifier is **illegal**. There is no general prohibition on prediction games, sports
content, or sports statistics in the Developer Policy.

**Community Guidelines** — <https://discord.com/guidelines> (effective 29 September 2025), rule 26:

> **26. Do not coordinate or participate in illegal gambling.** Users are responsible for
> complying with applicable gambling laws and regulation.

**Gambling Policy Explainer** — <https://discord.com/safety/gambling-policy-explainer>
(15 March 2024) — this is the definition both of the above point at:

> We define **gambling** as the act of placing a bet or wager involving money or something of
> value on an event or activity with an uncertain outcome. Our gambling policy is violated if the
> following criteria are met:
>
> 1. There is a payment or wager of real-world value to participate (this includes betting or
>    entry fees)
>    - _Real-world value_ is defined as any tangible or intangible asset with a monetary or
>      exchangeable value in the real world. This includes virtual currency or virtual goods that
>      have a real-world market value or can be exchanged for real-world currency or goods
> 2. Prizes of real-world value are awarded
> 3. The outcome of the game is _predominantly_ determined by chance
> 4. The activity is prohibited by applicable gaming laws or regulations

**App Discovery: Content Requirements Policy** —
<https://support-dev.discord.com/hc/en-us/articles/9489299950487-App-Discovery-Content-Requirements-Policy>
— this is the listing gate, and it is **not** limited to illegal activity:

> Your Application's content must not contain any adult content. Adult content includes, but is
> not limited to, content and discussion related to:
>
> - Sexually explicit material such as pornography or sexually explicit text
> - Violent content
> - Illegal, dangerous, and regulated goods such as firearms, tactical gear, alcohol, or drug use
> - **Gambling-adjacent or addictive behavior**

The same page also requires: "Your application must have a connected and publicly available
Privacy Policy and Terms of Service."

**App Directory Inclusion Guidelines** —
<https://support-dev.discord.com/hc/en-us/articles/8852009977879-App-Directory-Inclusion-Guidelines>:

> **1. Abide by the Developer Policy and Terms of Service.** Apps that violate **Discord's
> Developer Policy** and **Developer Terms of Service** are ineligible for Discovery or the App
> Directory.

### 1.2 Why scoring does not meet any of the four criteria

IKnoBall derives a points multiplier from a moneyline price. That is arithmetic on a number we
read from a sports-data feed. Discord's test is not about arithmetic; it is about whether
something of value is at risk. Check each criterion against what the product does:

| Criterion                                       | IKnoBall                                                                                                                                        | Met? |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1. Payment or wager of real-world value to play | Free. No entry fee, no purchase, no credits, no virtual currency. Points cannot be bought, sold, transferred, or redeemed (Terms of Service §2) | No   |
| 2. Prizes of real-world value                   | No prizes. Points only order a leaderboard                                                                                                      | No   |
| 3. Outcome predominantly determined by chance   | Picking the winner of a basketball game is judgement on a scheduled sporting event                                                              | No   |
| 4. Prohibited by applicable gaming laws         | Nothing is staked and nothing is won, so there is no consideration and no prize — the elements gaming law is built around are absent            | No   |

The Explainer's own gloss on "real-world value" is the closest it gets to our points: virtual
currency counts **only if** it has "a real-world market value or can be exchanged for real-world
currency or goods". Our points have neither property, and the Terms of Service say so in §2
("Points are not money… They can't be bought, sold, transferred, withdrawn, or redeemed").

So: **the gambling clause is not the problem.** The scoring is a weight, not a stake, and the
Developer Policy only reaches gambling that is _illegal_.

### 1.3 The residual risk, stated plainly

1. **"Gambling-adjacent" is undefined and discretionary.** The App Discovery policy is the one
   text that could stop a listing without anyone alleging illegality. A reviewer looking at a
   card that shows a pick, a points value, and a favourite/underdog framing has to decide whether
   that reads as gambling-adjacent. We cannot litigate that definition; we can only avoid giving
   it a foothold in the copy.
2. **Our website is one click from the listing.** The Terms of Service (§3) and the app itself
   show moneyline prices as a scoring weight. A reviewer who follows the link can find prices on
   a game page even though the listing never mentions them. Nothing about that is a policy
   breach — the prices are ours, from a sports-data feed, not Discord API Data — but it is the
   context a reviewer will be judging the listing against.
3. **The 18+ gate cuts both ways.** Our Terms require users to be 18+, which is stricter than
   Discord's 13+ floor and is the right call for a game built on sports prices. It does mean the
   listing should not read as aimed at a younger audience.
4. **Enforcement is not only about the gambling clause.** An app removed for a policy breach
   cannot be re-created in substantially similar form (Developer Policy #14), so the cost of
   being wrong is the bot's identity, not one review cycle.

**The cheap way to hold the risk at zero for launch:** do not opt into the App Directory yet.
An unverified app can be in up to 100 servers ("Verification is required for your app to scale
past 100 servers", <https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified>),
which is far more than the first season needs. Distribute by invite link, and treat listing as a
later decision with its own review.

### 1.4 Wording that keeps us clear

The register in `docs/promo-copy.md` already does most of this. For the listing, it is stricter,
because a reviewer reads it as a description of the app's function:

- **Never use:** bet, betting, wager, stake, odds, moneyline, line, spread, price, payout,
  parlay, book, bookmaker, sportsbook, bankroll, "cash out", "lock in", "risk", "implied
  probability", "value".
- **Use instead:** pick, call, points, dynamic scoring, "points scale with how big the call is",
  free, no card, nothing to buy.
- **Say the money facts out loud**, in the listing itself: free to play, no purchases, points have
  no monetary value and cannot be bought, sold, transferred, or redeemed, and there are no prizes.
- **Keep numbers out of the listing.** `docs/promo-copy.md` uses "≈15" and "40+" for social posts,
  which is fine in a Reddit comment. In a listing, a number next to a pick reads like a payout.
  Describe the scale in words, not figures.
- **Do not link to a page that leads with a price.** Link the site root, not a game page.
- **If a reviewer asks what the scoring is built on**, answer with the Terms of Service §3 wording:
  prices are "only a scoring weight", normalised so both sides carry equal expected value, and
  never used to pay out anything.

---

## 2. Listing copy

Register: `docs/promo-copy.md` — stats first, the game second, free and no card throughout, no
betting vocabulary. Short description is what a server owner skims; long description is the
Application Description field.

### 2.1 Short description

> A free NBA stats app for your server: the day's slate, live scores, standings, and a
> pick-the-winner game with two leaderboards. No card, no ads, nothing to buy.

(161 characters. Discord does not publish a length limit for the Application Description in its
current help article — <https://support-dev.discord.com/hc/en-us/articles/6378525413143-App-Directory-App-profile-pages>
— so this is kept short enough to survive any summary field.)

### 2.2 Long description

> **IKnoBall turns your server into an NBA stats desk — with a prediction game on top.**
>
> Every game day the bot posts the slate: tip-off times in your server's timezone, records, and
> where each team sits, with a button on every game. Anyone with an IKnoBall account can call a
> winner before tip-off — sign in with Discord or an email address once and you're set.
>
> **Two ways to score, one pick.** Every pick scores on a flat board, where a correct call is
> worth 1. It also scores on a dynamic board, where points scale with how big the call was — a
> comfortable favourite earns a little, a genuine upset earns a lot. The weighting is normalised,
> so calling favourites and calling upsets are worth the same on average: the board rewards
> reading games, not finding an exploit. Your weighting freezes when you submit, so it can't move
> under you after the fact.
>
> **Your server gets its own board.** `/leaderboard` ranks our members' points — everyone in this
> server, including picks they made on the website — so the board reflects your community, not a
> global leaderboard.
>
> **It's a full stats app, not just a game.** Live box scores, conference standings with clinch
> markers, league and team stat leaders, player pages with career tables and shot-zone charts, and
> a dashboard that takes on your team's colours. The bot posts the slate; the site has the depth.
>
> **Free, and nothing to buy.** No ads, no card, no subscription, no prizes. Points exist to rank
> a leaderboard: they can't be bought, sold, transferred, or redeemed for anything.
>
> **Commands:** `/picks` (your picks, visible only to you) · `/leaderboard` (this server's board,
> both modes) · `/setup` (channel, posting hour and timezone — needs Manage Server) · `/link` and
> `/unlink` (connect or disconnect your IKnoBall account).

Two deliberate choices in that copy: no point figures, and no mention of how the weighting is
derived. Both are available on the site for anyone who asks; neither belongs in a listing.

### 2.3 What the bot stores (for the profile page and any review form)

> The bot stores the Discord IDs it needs to do its job: your user ID when you link your account
> (so a click lands on the profile you already have), the server and channel IDs an admin picks
> with `/setup`, and the ID of each card it posts (so it can edit that card at tip-off and after
> the final). It also holds each server's member list — user ID, display name, and the date someone
> joined — because a server's leaderboard is defined by who is in that server. It reads no message
> content and sees no presence. `/unlink` or the Disconnect control on the website deletes the
> link; picks stay on your account. Full detail is in the privacy policy, §11.

### 2.4 Intents and permissions — justification blurbs

Ready to paste into the Developer Portal's privileged-intent form or an App Review form. It
describes the shipping shape after the leaderboard change (definition B, §2.6). One gap to close
before it is submitted: `apps/discord/src/infrastructure/discord-client.service.ts` still
constructs the client with `intents: [GatewayIntentBits.Guilds]`, and its header comment still says
the app stays out of privileged-intent review. Both need `GatewayIntentBits.GuildMembers` and the
rationale below, or this blurb will not describe the code. That file belongs to the bot chunk, not
this one.

**Intents: Guilds and Guild Members — one privileged intent, with a single purpose.**

> The bot requests two gateway intents: **Guilds** and **Guild Members**.
>
> **Guilds** is the baseline. It needs server-level events to know which servers it is in, to
> register and keep its slash commands current, to notice when it is added to or removed from a
> server (`GUILD_CREATE` sends the installer one hint to run `/setup`; `GUILD_DELETE` marks the
> server as left so a reinstall keeps its settings), and to resolve the channel an admin names in
> `/setup`.
>
> **Guild Members** is needed for one feature, `/leaderboard`. That board ranks the points of the
> people in _this_ server, and a stored pick carries only a user ID — so answering "is this person
> in this server" needs the server's member list. The bot reads the list when it joins a server and
> keeps it current from join, leave, and member-update events. It keeps three fields per member: the
> user ID, the display name Discord shows for them, and the date they joined. The board is then one
> query against that table rather than a paginated member-list call on every render, which is why
> the mirror exists at all.
>
> What the intent is **not** used for: it does not read message content (that is the separate
> Message Content intent, which this app does not request), it does not provide presence or online
> status (that is Guild Presences, also not requested), and it is not used for advertising,
> profiling, or anything outside the leaderboard. The table is scoped per server; the only
> cross-server read is which of your servers a button click came from. A member's row is deleted
> when they leave the server or when the bot is removed from it.
>
> We are requesting **Guild Members only**, and we understand that this puts the app on the
> privileged-intent review path: access is toggled in the Developer Portal below 10,000 unique
> users, and above that a written justification is required, with review renewed each year
> (<https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review>).

**Bot permissions: the minimum that lets a card post, update, and thread a long slate.**

| Permission               | Why                                                            |
| ------------------------ | -------------------------------------------------------------- |
| View Channels            | To see the one channel an admin chose in `/setup`              |
| Send Messages            | To post the slate and to reply to commands                     |
| Embed Links              | Each game on the slate is an embed                             |
| Create Public Threads    | A slate longer than four games threads the remainder (DISC-10) |
| Send Messages in Threads | The card and its pick buttons live in that thread              |

Not requested, and not needed: Administrator, Manage Server, Manage Channels, Manage Roles,
Manage Messages, Kick/Ban Members, Read Message History, Attach Files, Mention Everyone. Three of
those are worth spelling out because they look necessary and aren't:

- **Attach Files** — team logos are application-owned emojis (`<:LAL:…>`), uploaded once by the
  operator and usable in any server, so the card carries no image attachments. `USE_EXTERNAL_EMOJIS`
  isn't required for them either (DISC-02).
- **Read Message History** — the bot only edits messages it posted itself, which its own
  authorship already permits.
- **Manage Server** — `/setup` requires the **person running it** to have Manage Server; the bot
  checks that at runtime and does not hold the permission itself.

Install scopes are `bot` and `applications.commands` — the second is what registers slash commands
and is not a permission.

The member list is not a permission and does not appear in the table: it comes from the **Guild
Members** gateway intent, which is what the review form above is for. No channel or server
permission grants it, so nothing here widens when the intent is enabled.

**The invite URL, for the record.** The permission integer is `309237664768`
(1024 + 2048 + 16384 + 34359738368 + 274877906944 — exactly the five permissions above, nothing
else), and the application id is `1531941991875743744`:

```text
https://discord.com/oauth2/authorize?client_id=1531941991875743744&permissions=309237664768&scope=bot%20applications.commands
```

If the permission set changes, recompute the integer from this table rather than editing it by
hand: Discord's permission calculator is the authority, and a missing bit fails silently at
runtime as `Missing Permissions` on the one call that needed it.

### 2.5 What the portal needs besides the text

From <https://support-dev.discord.com/hc/en-us/articles/6378525413143-App-Directory-App-profile-pages>,
the Discovery checklist requires: a **Support Server** (which must be a community server), an
**Application Description**, at least **one tag**, an **Install URL**, a **Privacy Policy** and a
**Terms of Service**. Both legal documents already exist at
`https://iknoball.setotechs.com/privacy` and `/terms`, and the privacy policy now covers the bot
(§11). The support server does not exist yet — that is a launch prerequisite, not a copy task.

### 2.6 Decision: leaderboard definition B, Guild Members intent accepted (27 October 2026)

**What was decided.** The per-server leaderboard counts _all picks by users who are members of this
server_ — definition B in DISC-08 — not only the picks made inside the server. That choice is what
makes the Guild Members intent necessary: a pick stores a user ID, so turning it into "is this
person in this server" needs the membership list on our side. `discord_members` is the mirror that
answers it, with `(guildId, discordUserId)` as its key and `displayName` and `joinedAt` alongside.
The **Server Members Intent has been enabled in the Developer Portal** by the user, so the toggle
side of this is already done.

**What it costs, in copy and in process.**

1. **Privileged-intent review, on a user threshold.** Since 10 June 2026 the trigger is 10,000
   unique users across all servers, not 100 servers: "If that number exceeds 10,000, your app needs
   to apply for Privileged Intent access"
   (<https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review>).
   Below it we may toggle the intent on ourselves; above it we have 90 days from the notification to
   submit a justification, and access is renewed each year. The blurb in §2.4 is written to be that
   justification, so it has to stay true as the bot grows — an application that claims a narrower
   use than the code has is the failure mode Discord's own guide calls out ("Requests may be denied
   when the information provided in your submission does not demonstrate that the stated use case
   requires access").
2. **The board label changes.** A server's board now sums every settled pick by anyone currently in
   the server, including picks made on the website. `/leaderboard` therefore reads "our members'
   points", not "points earned here" — the latter was true of definition A and is now misleading.
   The long description in §2.2 was updated for this. The command's own description string,
   "Points earned in this server.", is in `apps/discord/src/leaderboard/leaderboard.command.ts` and
   needs the same change; that file is outside this chunk.
3. **Leaving drops you off the board.** Because membership is the join key, someone who leaves the
   server stops counting on it, and counts again if they rejoin, since the row is refreshed from
   Discord either way. That is a product consequence rather than a privacy one, but a server owner
   will ask, so no copy should promise a permanent per-server total.
4. **What did not change.** Message Content and Guild Presences are still not requested: the bot
   reads no messages and sees no online status. The privacy policy's §11 now describes the member
   list, and §2.3 and §2.4 above match it.

**Still open before submission.**

1. **The code has not caught up with the decision.** `apps/discord/src/infrastructure/discord-client.service.ts`
   still builds the client with `intents: [GatewayIntentBits.Guilds]`, and the doc comment in
   `packages/database/src/schema.ts` above `discordMembers` still argues the table avoids a
   "gateway permission the bot does not otherwise need". Both are bot/database chunks' files; this
   file only records that the copy assumes they change.
2. **No reviewer has confirmed the reading in §1.** The verdict is a textual reading of the
   published policies, not a ruling. If Discord ever answers a question about odds-derived scoring,
   paste the reply here and supersede §1.3.
3. **The support server does not exist yet** (see §2.5). Discovery cannot be applied for without it.

---

## 3. Sources

Read 27 October 2026.

| What                                         | URL                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Developer Policy (effective 8 Jul 2024)      | <https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy>                  |
| Developer Terms of Service (§5 privacy)      | <https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service>        |
| Community Guidelines (effective 29 Sep 2025) | <https://discord.com/guidelines>                                                                            |
| Gambling Policy Explainer (15 Mar 2024)      | <https://discord.com/safety/gambling-policy-explainer>                                                      |
| App Discovery: Content Requirements Policy   | <https://support-dev.discord.com/hc/en-us/articles/9489299950487-App-Discovery-Content-Requirements-Policy> |
| App Directory Inclusion Guidelines           | <https://support-dev.discord.com/hc/en-us/articles/8852009977879-App-Directory-Inclusion-Guidelines>        |
| App Directory: App profile pages             | <https://support-dev.discord.com/hc/en-us/articles/6378525413143-App-Directory-App-profile-pages>           |
| How Do I Get My App Verified?                | <https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified>             |
| Privileged Intent review (thresholds)        | <https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review>                 |

Dead ends, for the record: `discord.com/developers/docs/policies-and-agreements/developer-policy`,
`…/developer-terms-of-service` and `…/app-listing-requirements` all return **404** (the first two
show a "Page Not Found" page linking back to the support-dev articles above; the third has no
replacement page — its content is now split across the three App Directory articles listed here).
Everything quoted in this file was read from the live pages in the table, not from those paths.

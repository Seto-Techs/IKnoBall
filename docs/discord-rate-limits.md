# Rate limits and fan-out (DISC-12)

What a slate post and a lock pass actually cost, what that means at 100 guilds and at
shard scale, where the bottleneck really is, and the answer to DISC-12's open question
about per-card lock edits. The numbers below are measured, not estimated: every figure
in the cost tables and in §3 comes from `apps/discord/src/infrastructure/rate-limiter.spec.ts`,
which runs the real `RateLimiter` against a fake Discord that enforces the published
limits. §9 says exactly what that simulation does and does not prove.

Short version: **one guild's four-game day costs thirteen REST calls** (a channel
fetch, four card messages, four lock edits, four settlement edits) and **100 guilds
finish a slate post plus a full lock pass in 22.4 seconds** of a 60-second window, with
no 429 and no invalid request. The global 50-per-second bucket is the wall, not the
per-route buckets, and it is hit at around 180 guilds posting _and_ locking in the same
minute.

The cost is what it is because a card is one message (§1): Discord draws every embed in
a message above every action row, so cards can only sit above their own buttons if each
card is its own message.

## 1. What one slate post costs

`SlatePoster.post()` fetches the channel, then sends one message per card. A card and
its action row have to share a message: a message's embeds all render above all of its
components, so two cards in one message shows both cards and then both button rows, and
a reader cannot tell which buttons pick which game.

| Cards | Calls | What they are                                                 |
| ----: | ----: | ------------------------------------------------------------- |
|     1 |     2 | `GET /channels/{c}`, `POST /channels/{c}/messages`            |
|     4 |     5 | the two above, then three more `POST /channels/{c}/messages`  |
|    12 |    13 | the two above, then eleven more `POST /channels/{c}/messages` |

General form: **`1 + cards`** — one channel fetch, then one message per card. The
channel fetch is real: `channels.fetch` is a `GET`, even when the channel is about to be
used for a send.

Measured by the `cost table` test, which posts slates of 1, 4, 6, 8 and 12 cards and
counts the calls the fake Discord received: 2, 5, 7, 9, 13.

A guild whose channel the bot cannot post in costs **zero** calls: the permission
preflight (`missingPermissions` in `apps/discord/src/scheduler/slate-poster.ts`) runs on
the cached guild member before the first send, and the guild is skipped with a log line. That is
the difference between a skip and a 403, and a 403 is an invalid request against the
10,000-per-ten-minutes ban.

## 2. What one lock pass costs

A lock is **one `PATCH /channels/{c}/messages/{m}` per message**, and a message holds
one card: `lock/card-sweep.ts` groups due cards by message, and `lock/card-editor.ts`
sends the rebuilt payload in a single call. So:

- **1 call per card** — the price of each card having its own buttons;
- 4 calls per guild for a four-card slate, 12 for a twelve-card one.

The settlement pass is the same shape and the same cost.

A guild's whole day, four games: 5 (post) + 4 (lock) + 4 (settlement) = **13 calls**.
A twelve-game day: 13 + 12 + 12 = **37 calls**. Nobody is close to anything.

## 3. 100 guilds in one minute

The load test posts a four-card slate to 100 guilds and then runs a full lock pass over
all of them — 900 REST calls — on the real queue with the default 40 requests/second
and a burst of 5:

|                                       |                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| REST calls                            | **900** (100 `GET /channels/{c}`, 400 `POST /channels/{c}/messages`, 400 `PATCH /channels/{c}/messages/{m}`) |
| 429s                                  | **0**                                                                                                        |
| invalid requests (401/403/404)        | **0**                                                                                                        |
| wall time on the queue's clock        | **22,375 ms**                                                                                                |
| longest single wait the queue imposed | **25 ms**                                                                                                    |
| retries                               | 0                                                                                                            |

That is the queue running at its own cap, not Discord's: 900 calls in 22.4 seconds is
~40 a second, **81% of the 50/s ceiling**, and the whole fan-out spends 37% of the
minute. The ceiling is what the work is paced to, so the same work would take ~18 s at
Discord's full 50/s — the point of sitting at 40 is that nothing has to be discovered
with a 429. The same test with twelve-card slates (100 guilds, 1,300 calls) finishes in
**32,375 ms** (~40/s), still well inside the minute.

The bucket sets the ceiling at 40 calls a second, so a minute holds **2,400 calls**.
A four-game guild's whole day is thirteen of them (five to post, four to lock, four to
settle), so the fan-out fits **~180 guilds in one minute** at 40/s and **~230** at
Discord's 50/s. One card per message is 3.25× the calls of the four-up message it
replaced, which is the price of every card keeping its own buttons. Nothing in the
design is near that today, and the shape of the answer matters more than the number:
the cost is linear in guilds, so the fan-out is a throughput question, not a per-route
one.

## 4. Where the bottleneck actually is

**The global bucket, not the per-route buckets.** Discord keys per-route limits on the
top-level resource in the path — the channel, for every call the bot makes — so 100
guilds are 100 _independent_ buckets. They never bind while the guilds outnumber the
calls per channel in a burst. The per-route table only holds anything back when a single
channel receives a burst, and one card per message makes that the one place worth
watching: a four-game slate is now four `POST`s to one channel where it used to be one.
Four is under the fake's stand-in bucket of five per five seconds, which is why the load
test measures no per-route wait at all; a twelve-card slate is twelve, which a real
bucket of that shape would hold back once. The queue reads `X-RateLimit-*` off every
response (§5), so that wait is learned rather than paid as a 429, and it stays inside one
guild's slate — the other 99 channels keep their own buckets.

So the ordering is:

1. **Global bucket** — 40/s as configured, 50/s as Discord allows. Binds first: ~180
   guilds doing a whole four-game day in the same minute at 40/s, ~230 at 50/s. This is
   the wall.
2. **Per-route buckets** — invisible until they are hit (Discord publishes no numbers),
   and only reachable by a single guild's slate, where one channel now takes one message
   per card. Cheap to stay under, expensive to discover the hard way, which is why the
   queue learns them from headers (§5).
3. **Invalid requests** — not a throughput limit at all, a cliff: 10,000 in ten minutes
   is a sustained 16.7 invalid requests a second, or one bad token retrying everything
   it is given. That is why a 401 halts the process (§8) rather than backing off.

The practical consequence is the one DISC-12's "tradeoffs" section guessed: serialising
everything through one queue caps throughput below the global limit on purpose, and the
cap is the thing that keeps a 100-guild burst from ever producing a 429. There is no
per-guild fan-out tuning to do.

## 5. The per-route bucket we cannot see

DISC-12 asked what the real per-channel edit bucket is. **Discord does not publish it,
and this chunk cannot measure it against real Discord**: the bot is in zero guilds, so
there is nothing to measure. What the code does instead:

- `RateLimiter.observe()` folds `X-RateLimit-Bucket`, `X-RateLimit-Remaining` and
  `X-RateLimit-Reset-After` into a table keyed `hash:majorParameter` — the hash from the
  header, the channel from the path, exactly the grouping Discord documents ("use this
  header as a unique identifier"). Before a hash is known the key falls back to the
  route shape plus channel, so the first burst is still grouped correctly per channel.
- `attachRest()` listens to discord.js's `response` event, because discord.js answers
  its own 429s internally: without the emitter the queue would never see a header or a
  `rateLimited` event at all, and would be blind in production while looking fine in
  tests.
- A task whose bucket is empty **waits for that bucket's reset** instead of spending a
  request to learn what the queue already knows. The dispatcher skips the blocked task
  and runs the next ready one, so one busy channel cannot head-of-line block 99 guilds.

The load test's per-route numbers (5 requests per 5 seconds per channel) are a
**stand-in** for an unpublished limit, chosen to be plausible for message edits. It is
deliberately uniform across routes, which is stricter than reality in some places and
looser in others. The queue does not depend on those numbers being right: it depends on
the headers, and on the 429 path being correct when they are wrong.

## 6. Sharding, and why it does not buy REST headroom

Discord's guidance is ~2,500 guilds per shard. Two separate limits arrive at about the
same place, and they are not the same limit:

- **Gateway**: ~2,500 guilds per shard, so at 2,500 guilds the bot needs a second
  shard — a second process.
- **REST**: the 50/s global limit is **per bot, not per shard**. At 2,500 guilds a
  four-card post is 12,500 calls, which takes 312 seconds at 40/s — five minutes of
  window for a one-minute fan-out — and cannot be made faster by adding a process: two
  processes each running their own 40/s bucket would ask Discord for 80/s and start
  collecting global 429s.

So the fan-out ceiling is **~230 guilds doing a whole day in the same minute** at 50/s
(~180 at the configured 40/s), and it is a property of the bot, not of the shard count.
One card per message is what moved that number down by a factor of about three; the
alternative was cards whose buttons belong to some other card. When the bot reaches that, the fix is
a budget shared across processes (a Redis token bucket behind `RateLimiter`, or one
process owning outbound REST for all shards) — not more shards. Writing that down now is
the point of the question; nothing here needs it below a thousand guilds, and today the
bot is in zero.

## 7. The lock edit, and the "all games locked" follow-up that was rejected

**Keep the message edit.** Before one card per message, this section had to defend
editing a four-card message once instead of each card separately; that question is gone
now — a message holds one card, so a message edit _is_ a card edit, at one call each.

The alternative that is still worth refusing is an "all games locked" follow-up message.

| Approach                                |   Calls | Time at 40/s | What it costs beyond that                                                                                                                                                          |
| --------------------------------------- | ------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `PATCH` per message (today)         | **400** |     **10 s** | none                                                                                                                                                                               |
| One "all games locked" follow-up `POST` |     400 |         10 s | the buttons on the card stay enabled (component state belongs to the message), a second message in the channel, a message id to store, and the settlement edit is still owed later |

The follow-up is the interesting one, because it _looks_ equivalent and is not: it is
the same single call as the edit, and it buys strictly less. A lock's whole visible
effect is `disabled` on the pick buttons, and a message's components are per-message — a
new message cannot disable the buttons on the old one. So the follow-up would announce
"all games locked" above a card whose buttons still look pressable. The edit changes
what a reader sees for the same one call.

It also does not matter much if a lock edit fails. Tip-off is enforced server-side
(`PredictionsService.placePick` → `requireOpenGame`), so a stale-looking card is
cosmetic, which is why the sweep may stop a run on a transient error instead of
retrying hard.

## 8. What the queue does with a failure

One queue for all outbound REST (`apps/discord/src/infrastructure/rate-limiter.ts`),
`schedule(task, route?)`, which every poster and both sweeps call:

- **429** — wait exactly `retry_after` (discord.js's `RateLimitError.retryAfter` in ms,
  or Discord's JSON `retry_after` in seconds, or the `Retry-After` header), block the
  bucket it came from, and **retry the task**. A rate limit never surfaces as a failed
  card. After 3 waits the error is surfaced, so a permanently throttled call ends the
  sweep run and starts its backoff instead of looping.
- **401** — halt the whole process's outbound REST and fail every queued task. A bad
  token cannot recover by retrying, and each retry is another invalid request.
- **403 / 404** — dead, never retried, counted as invalid. `classifyEditFailure`
  (`lock/card-edit.ts`) is the one classifier, so the queue and the sweep agree.
- **Everything else** (5xx, socket reset, timeout) — transient, surfaced to the caller,
  which owns the backoff.

`depth()` (queued plus in flight) and `stats()` (sent, 429s, invalid, retries, longest
wait, queued, in flight, halted) are the observability hooks; `/status` reads `depth()`
(DISC-14, chunk C11).

The token bucket is 40 requests a second with a burst of 5, so no rolling one-second
window can contain more than 45 requests — under 50 with room for the calls this chunk
does not own (interaction responses, command registration).

## 9. The load test: what it runs, and what it does not prove

`apps/discord/src/infrastructure/rate-limiter.spec.ts` drives the **real** `RateLimiter`
through the **real** `SlatePoster` and the **real** `CardSweep`, against a fake Discord
that enforces:

- 50 requests in any rolling second, answered with a global 429 and `retry_after`;
- per-route buckets of 5 per 5 seconds per channel, answered with real
  `X-RateLimit-Bucket` / `-Remaining` / `-Reset-After` / `-Limit` headers, which is how
  the queue learns them;
- 429s with a `retry_after` when a bucket is empty;
- a hard fail — `CloudflareBanError` — on the 10,001st invalid request. A separate test
  drives 10,001 403s to prove the fake really does it, so "zero invalid" in the load
  test means something.

Everything runs on an injected virtual clock, so 900 calls of pacing take milliseconds
of real time while the queue still waits exactly as long as it would have. Tests cover
the bucket (burst, pacing, `depth()`), a 429 being waited out and retried, a 429
blocking its route for the sibling task, a 401 halting the queue, a 404 never being
retried, a per-route bucket holding one channel back with **no** 429, `attachRest`
learning a bucket from an emitted response, the cost table above, and a second
100-guild fan-out of twelve-card slates (1,300 calls, one message per card) to prove a
wide slate is paced as well as a normal one.

**This is a simulation of 100 guilds, not a live run.** The bot is in zero guilds and
cannot post to real Discord. What the simulation cannot tell you: real network latency
and Discord-side queueing; how discord.js's own internal bucket handling interacts with
ours in production (the fake replaces discord.js's REST layer entirely); the true
per-route limits, which are unpublished, including whether a real per-channel bucket
is tighter than the fake's 5-per-5-seconds stand-in for a wide slate; and whether
Discord's own invalid-request counter agrees with ours over ten minutes. The first live
day in a real guild is the measurement that closes those gaps, and `stats()` is what to
read when it happens.

## 10. What still bypasses the queue

Named so a later chunk can decide, not hidden:

- `apps/discord/src/infrastructure/discord-client.service.ts:111` —
  `application.commands.set(...)`, the global command `PUT` on every boot, outside the
  queue. One call at startup.
- `apps/discord/src/setup/guild-lifecycle.ts:127` — `owner.send(...)` (the setup hint DM)
  on guild join, outside the queue. One call per join.
- `apps/discord/src/lock/card-editor.ts:78` — `channels.fetch` inside `editCard`. It is
  inside the sweep's `pace` call, so it shares that task's token, but it carries no route
  of its own; `CardSweep`'s `pace` option takes a bare task, so sweeps are bounded by the
  global bucket and learn per-route state only through `attachRest`.
- `apps/discord/src/interactions/**`, and every slash-command reply beside it
  (`picks/`, `linking/`, `setup/`, `leaderboard/`, `ops/`) — interaction responses.
  Deliberately not queued: interaction endpoints are exempt from the global limit and
  must answer within three seconds, so putting them behind a token bucket would trade a
  guaranteed 3-second deadline for a queue position.

## Re-running the numbers

```bash
cd apps/discord
bunx vitest run src/infrastructure --reporter=verbose
```

The load test logs nothing on success; to see the timings, add a `console.log` beside
the assertions in `100 simulated guilds`, or read `limiter.stats()` from `/status` in a
real deployment.

# Rate limits and fan-out (DISC-12)

What a slate post and a lock pass actually cost, what that means at 100 guilds and at
shard scale, where the bottleneck really is, and the answer to DISC-12's open question
about per-card lock edits. The numbers below are measured, not estimated: every figure
in the cost tables and in §3 comes from `apps/discord/src/infrastructure/rate-limiter.spec.ts`,
which runs the real `RateLimiter` against a fake Discord that enforces the published
limits. §9 says exactly what that simulation does and does not prove.

Short version: **one guild's day costs four REST calls** (a channel fetch, a message,
a lock edit, a settlement edit) and **100 guilds finish a slate post plus a full lock
pass in 7.4 seconds** of a 60-second window, with no 429 and no invalid request. The
global 50-per-second bucket is the wall, not the per-route buckets, and it is hit at
around 800 guilds posting _and_ locking in the same minute.

## 1. What one slate post costs

`SlatePoster.post()` fetches the channel, then sends. Four cards fit one message (four
embeds and four action rows, under Discord's five-row cap), so a wider slate opens a
thread on the first message and puts the rest of the cards in it.

| Cards | Calls | What they are                                                                           |
| ----: | ----: | --------------------------------------------------------------------------------------- |
|   1–4 |     2 | `GET /channels/{c}`, `POST /channels/{c}/messages`                                      |
|   5–8 |     4 | the two above, `POST /channels/{c}/messages/{m}/threads`, `POST /channels/{t}/messages` |
|  9–12 |     5 | the two above, one thread, two messages in it                                           |

General form: **2 calls for up to four cards, then `2 + ceil(cards / 4)`** — the
channel fetch and the first message are fixed, and every four cards past the first
cost one message plus, once, one thread creation. The channel fetch is real: `channels.fetch`
is a `GET`, even when the channel is about to be used for a send.

Measured by the `cost table` test, which posts slates of 1, 4, 5, 6, 8 and 12 cards and
counts the calls the fake Discord received: 2, 2, 4, 4, 4, 5.

A guild whose channel the bot cannot post in costs **zero** calls: the permission
preflight (`missingPermissions` in `apps/discord/src/scheduler/slate-poster.ts`) runs on
the cached guild member before the first send, and the guild is skipped with a log line. That is
the difference between a skip and a 403, and a 403 is an invalid request against the
10,000-per-ten-minutes ban.

## 2. What one lock pass costs

A lock is **one `PATCH /channels/{c}/messages/{m}` per message**, not per card:
`lock/card-sweep.ts` groups due cards by message, and `lock/card-editor.ts` sends the
rebuilt payload in a single call. Four cards to a message, so:

- **0.25 calls per card**;
- 1 call per guild for a four-card slate, 2 for a five-to-eight-card slate, 3 for a
  nine-to-twelve-card one — the same `ceil(cards / 4)` messages a post creates.

The settlement pass is the same shape and the same cost.

A guild's whole day, four games: 2 (post) + 1 (lock) + 1 (settlement) = **4 calls**.
A twelve-game day: 5 + 3 + 3 = **11 calls**. Nobody is close to anything.

## 3. 100 guilds in one minute

The load test posts a four-card slate to 100 guilds and then runs a full lock pass over
all of them — 300 REST calls — on the real queue with the default 40 requests/second
and a burst of 5:

|                                       |                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| REST calls                            | **300** (100 `GET /channels/{c}`, 100 `POST /channels/{c}/messages`, 100 `PATCH /channels/{c}/messages/{m}`) |
| 429s                                  | **0**                                                                                                        |
| invalid requests (401/403/404)        | **0**                                                                                                        |
| wall time on the queue's clock        | **7,375 ms**                                                                                                 |
| longest single wait the queue imposed | **25 ms**                                                                                                    |
| retries                               | 0                                                                                                            |

That is the queue running at its own cap, not Discord's: 300 calls in 7.4 seconds is
~41 a second, **81% of the 50/s ceiling**, and the whole fan-out spends 12% of the
minute. The ceiling is what the work is paced to, so the same work would take ~6 s at
Discord's full 50/s — the point of sitting at 40 is that nothing has to be discovered
with a 429. The same test with twelve-card slates (100 guilds, 500 calls) finishes in
**12,375 ms** (~40/s), still well inside the minute.

The bucket sets the ceiling at 40 calls a second, so a minute holds **2,400 calls**.
A post is two of them, so the post fan-out fits **1,200 guilds in one minute** at 40/s
and **1,500** at Discord's 50/s; adding the lock pass in the same minute (three calls
per guild) brings those down to 800 and 1,000. Nothing in the design is near that
today, and the shape of the answer matters more than the number: the cost is linear in
guilds, so the fan-out is a throughput question, not a per-route one.

## 4. Where the bottleneck actually is

**The global bucket, not the per-route buckets.** Discord keys per-route limits on the
top-level resource in the path — the channel, for every call the bot makes — so 100
guilds are 100 _independent_ buckets with one call each. They never bind. The per-route
table only holds anything back when a single channel receives a burst, which happens
in exactly one place: a wide slate, where one channel gets the message and up to
`ceil(n/4) - 1` more messages in the thread (3 calls for twelve cards). Even that is
three calls in a few milliseconds against a bucket of at least five.

So the ordering is:

1. **Global bucket** — 40/s as configured, 50/s as Discord allows. Binds first: ~1,200
   guilds posting in the same minute at 40/s, ~800 posting and locking. This is the
   wall.
2. **Per-route buckets** — invisible until they are hit (Discord publishes no numbers),
   and only reachable by a single guild's wide slate. Cheap to stay under, expensive to
   discover the hard way, which is why the queue learns them from headers (§5).
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
  four-card post is 5,000 calls, which takes 125 seconds at 40/s and cannot be made
  faster by adding a process: two processes each running their own 40/s bucket would
  ask Discord for 80/s and start collecting global 429s.

So the fan-out ceiling is **~1,500 guilds posting in the same minute** at 50/s, and it
is a property of the bot, not of the shard count. When the bot reaches that, the fix is
a budget shared across processes (a Redis token bucket behind `RateLimiter`, or one
process owning outbound REST for all shards) — not more shards. Writing that down now is
the point of the question; nothing here needs it below a thousand guilds, and today the
bot is in zero.

## 7. Per-card lock edits, or one "all games locked" follow-up message?

**Keep the message-level edit that is already implemented. Reject both alternatives.**
The numbers, for a 100-guild fan-out of four-card slates:

| Approach                                |   Calls | Time at 40/s | What it costs beyond that                                                                                                                                                          |
| --------------------------------------- | ------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `PATCH` per message (today)         | **100** |    **2.4 s** | none                                                                                                                                                                               |
| One `PATCH` per card                    |     400 |         10 s | 4× the calls, and each `PATCH` replaces the whole payload — a per-card edit has to rebuild all four embeds and can delete the siblings if it gets that wrong                       |
| One "all games locked" follow-up `POST` |     100 |        2.4 s | the buttons on the card stay enabled (component state belongs to the message), a second message in the channel, a message id to store, and the settlement edit is still owed later |

The follow-up message is the interesting one, because it _looks_ cheaper and is not:
it is the same single call as the edit, and it buys strictly less. A lock's whole
visible effect is `disabled` on the pick buttons, and a message's components are
per-message — a new message cannot disable the buttons on the old one. So the follow-up
would announce "all games locked" above a card whose buttons still look pressable. The
edit changes what a reader sees for the same one call.

Per-card edits are worse on every axis. A message holds four cards, so per-card is
exactly four calls where the code makes one; and because `PATCH` replaces the payload,
"edit one card" means "rebuild the message with one card changed", which is four
payload constructions and four chances to drop a sibling's embed. `lock/card-sweep.ts`
already says this in the `SweepJob` doc comment; this is the measurement behind it.

It also does not matter much if a lock edit fails. Tip-off is enforced server-side
(`PredictionsService.placePick` → `requireOpenGame`), so a stale-looking card is
cosmetic, which is why the sweep may stop a run on a transient error instead of
retrying hard — and why 0.25 calls per card is the right amount to spend on it.

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

Everything runs on an injected virtual clock, so 300 calls of pacing take milliseconds
of real time while the queue still waits exactly as long as it would have. Tests cover
the bucket (burst, pacing, `depth()`), a 429 being waited out and retried, a 429
blocking its route for the sibling task, a 401 halting the queue, a 404 never being
retried, a per-route bucket holding one channel back with **no** 429, `attachRest`
learning a bucket from an emitted response, the cost table above, and a second
100-guild fan-out of twelve-card slates (500 calls, one thread per guild) to prove the
thread path is paced too.

**This is a simulation of 100 guilds, not a live run.** The bot is in zero guilds and
cannot post to real Discord. What the simulation cannot tell you: real network latency
and Discord-side queueing; how discord.js's own internal bucket handling interacts with
ours in production (the fake replaces discord.js's REST layer entirely); the true
per-route limits, which are unpublished; the thread-creation bucket; and whether
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

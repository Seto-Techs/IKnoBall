# IKnoBall Privacy Policy

**Version 1.0 · Effective 21 October 2026**

SETO Tech runs IKnoBall and decides how your personal data is used — which makes us the **data
controller** for it under Indonesia's Personal Data Protection Law (UU 27/2022, **"PDP Law"**).

Contact for anything in this policy: [rakaiseto@gmail.com](mailto:rakaiseto@gmail.com)

## The short version

- We collect what's needed to run an account and a prediction game: your name, email, password
  hash (or Discord sign-in), favourite team, and your picks.
- **We don't sell your data**, and there's no ad tracking or profiling.
- We never take payment details — the app is free.
- A handful of service providers help us run it, and section 6 names them.
- If you use the Discord bot, it stores the Discord IDs and display names it needs to post cards,
  score picks, and work out each server's leaderboard. Section 11 explains them.
- You can ask for a copy of your data, fix it, or delete it. Section 9 says how.

## 1. What we collect

**What you give us:**

| Data                     | Why                                                                                      | Required?                   |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| **Display name**         | To identify you in the app and on leaderboards                                           | Yes                         |
| **Email address**        | To create and verify your account, sign you in, and send security emails                 | Yes                         |
| **Password**             | To sign you in. Stored only as a salted hash — we never see or store the password itself | Yes, unless you use Discord |
| **Favourite team**       | To theme your dashboard                                                                  | Optional                    |
| **Profile image**        | To show next to your name. If you sign in with Discord we may receive your avatar        | Optional                    |
| **Messages you send us** | To answer support, privacy, and complaint requests                                       | Optional                    |

**What we collect automatically:**

| Data                                                                                                                      | Why                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Session data** — session token, expiry, and the IP address and browser user-agent recorded when the session was created | To keep you signed in and detect account takeover |
| **Account and security events** — sign-up, sign-in, verification, password reset, admin actions, with timestamps          | To secure accounts and investigate abuse          |
| **Your picks** — the game, your side, the mode, the price locked at submit, and the points or void reason                 | To run the game and build leaderboards            |
| **Basic technical logs** — request paths, timestamps, status codes, errors                                                | To run, debug, and protect the service            |

**What we don't collect:**

- **No payment data.** No card, bank account, e-wallet, or crypto address, and no checkout anywhere.
- **No precise location.** We never ask for device location. We may infer an approximate country
  from your IP for security and legal-compliance purposes.
- **No ad tracking.** No advertising pixels, no third-party analytics SDKs, no cross-site profiling.
- **No sensitive data.** We don't ask for health, biometric, genetic, or criminal-record data, or
  data about religion or political views. Please don't put any of that in a free-text field.

## 2. Cookies

We use only what's needed to keep you signed in:

| Type            | Purpose                                         | Duration                         |
| --------------- | ----------------------------------------------- | -------------------------------- |
| Session cookie  | Stores your session token so you stay signed in | Until it expires or you sign out |
| Browser storage | Holds interface state so the app loads faster   | Until cleared                    |

These are **strictly necessary** — block them and you can't sign in. We set no advertising or
analytics cookies.

**One third-party request:** we load our web fonts from Google Fonts (`fonts.googleapis.com`), so
your browser connects to Google to fetch them, which shares your IP address and browser details.
You can block third-party font requests with a browser extension or setting; the app still works
with fallback fonts.

## 3. Why we use your data

| Purpose                                                                                     | Legal basis                                                                            |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Creating and running your account, signing you in, verifying email, resetting passwords     | **Contract** with you (the Terms of Service)                                           |
| Recording picks, locking prices, settling points, building leaderboards                     | **Contract**                                                                           |
| Keeping the service secure — sessions, IP and user-agent, abuse detection, rate limiting    | **Legitimate interest** in protecting the service and its users                        |
| Service and security emails — verification, password reset, material changes to these terms | **Contract** and **legal obligation**                                                  |
| Answering your support and privacy requests                                                 | **Legitimate interest**, and **legal obligation** for statutory rights requests        |
| Complying with legal, tax, and regulatory obligations                                       | **Legal obligation**                                                                   |
| Optional features — favourite team, profile image                                           | **Consent**, which you give by using the feature and can withdraw by removing the data |

We don't use your data for automated decisions with legal or significant effects, and we don't
profile you for advertising. We don't send marketing email — if we ever do, it'll be opt-in with an
unsubscribe link on every message.

## 4. Who can see it

**Other users** see your display name, avatar if you set one, favourite team, and leaderboard
position. They never see your email, IP address, or session data.

**Our people** only access personal data where needed to run, secure, or support the app.

**Authorities** get data only where the law requires it, or where it's needed to establish or
defend a legal claim. Where we're allowed to, we'll tell you.

## 5. How long we keep it

| Data                                                              | Retention                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Account data — name, email, password hash, favourite team, avatar | While your account is open, then deleted or anonymised when you close it                     |
| Picks, points, leaderboard history                                | While your account is open. Deleted or anonymised on closure unless needed for a legal claim |
| Session records                                                   | Until the session expires or you sign out, then purged by routine cleanup                    |
| Verification and reset tokens                                     | Until used or expired (verification tokens expire after 15 minutes)                          |
| Security and activity logs                                        | As long as needed to investigate abuse, then deleted on a rolling basis                      |
| Backups                                                           | Until the backup cycle rotates them out                                                      |
| Records we must keep by law                                       | For the period the law requires                                                              |

When we no longer need data, we delete it or irreversibly anonymise it.

## 6. Who we share it with

Each provider below processes data on our instructions and only for the purpose listed.

| Provider                                           | What it gets                                                                                                                                                                                              | Purpose                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Discord** (optional sign-in)                     | Your Discord user ID, username, display name, email, and avatar, which Discord sends us when you authorise sign-in. Discord also sees your IP and browser as part of the sign-in flow, under their policy | Authentication                     |
| **Email delivery (SMTP)**                          | Your email address, name, and the content of verification and reset emails                                                                                                                                | Sending those emails               |
| **Cloud hosting, database, cache, object storage** | All the data in section 1, as stored and processed by the app                                                                                                                                             | Running the service and backups    |
| **Sports data and odds feeds**                     | **No personal data.** Our servers make these requests, not your browser                                                                                                                                   | Scores, schedules, stats, and odds |
| **Google Fonts**                                   | Your IP and browser details when your browser loads the fonts (see section 2)                                                                                                                             | Interface typography               |

We don't sell personal data and don't share it for behavioural advertising. If the app is ever
acquired or merged, data may transfer as part of that deal — we'll tell you before it does.

Our main hosting is configured in the **AWS Asia Pacific (Jakarta)** region. Some providers may
process data outside Indonesia; where they do, we rely on the transfer bases in Article 56 of the
PDP Law (an adequate protection level, appropriate safeguards, or your consent). Ask us for the
details of a specific transfer.

## 7. Security

We protect your data with salted password hashes, session cookies marked `HttpOnly` and `SameSite`,
HTTPS in transit, restricted access to production data, rate limiting, and logging to catch abuse.

No system is perfectly secure. If you think your account is compromised, email [rakaiseto@gmail.com](mailto:rakaiseto@gmail.com)
and change your password.

**If there's a breach.** Under Article 46 of the PDP Law, if a personal data breach occurs we'll
notify you and the supervisory authority in writing within **3 × 24 hours** of becoming aware of
it — describing what data was involved, how it happened, and what we're doing about it. Where a
breach seriously affects you, we'll also publish a notice.

## 8. Children

IKnoBall is for people **18 and over**. We don't knowingly collect data from children. If we learn
we hold a child's data, we'll delete it and close the account. If you think a child has given us
their data, email [rakaiseto@gmail.com](mailto:rakaiseto@gmail.com).

## 9. Your rights

Under the PDP Law you can:

1. **Be informed** about how your data is processed — this policy is that.
2. **Get a copy** of your personal data.
3. **Correct** data that's wrong or incomplete.
4. **Have your data erased**, subject to records we're legally required to keep.
5. **Withdraw consent** at any time for anything based on consent. That doesn't affect processing
   already done, and may mean you lose a feature that depends on it.
6. **Restrict or object** to processing, where the law allows.
7. **Port your data** in a machine-readable format, where the law provides for it.
8. **Not be subject to** decisions based solely on automated processing that have legal or
   significant effects.
9. **Claim compensation** for unlawful processing, and **complain** to the supervisory authority.

**How to use them:** email [rakaiseto@gmail.com](mailto:rakaiseto@gmail.com) from your account address, say which right you're
using and what you want. We may ask for enough information to confirm it's you, so we don't hand
your data to someone else. We won't charge for a reasonable request.

We may narrow or refuse a request where the law requires us to keep the data, where it would
infringe someone else's rights, or where it's clearly excessive.

**Complaints.** If our answer doesn't satisfy you, you can complain to the Indonesian data
protection supervisory authority, currently within the Ministry of Communication and Digital
Affairs (Komdigi), or to the dedicated agency once it's established. We'd rather sort it out with
you first.

## 10. Changes

We may update this policy as the app, our providers, or the law change. The version and date at the
top will change with them. If a change materially affects how we use your data, we'll tell you in
the app or by email before it takes effect, and where the law requires it we'll ask for your
consent. Older versions are available on request.

## 11. The Discord bot

IKnoBall has an optional Discord bot. Add it to a server and it posts the day's games there, so
people can pick from the card without opening the website. To do that it keeps a record of the
servers it's in and the people in them: Discord IDs — the numbers Discord uses to tell servers,
channels, messages, and accounts apart — plus the display name Discord shows for each member. None
of it is your email, and none of it is anything you write.

**What the bot stores:**

| Data                                                                                                                | Where it comes from                                                                                     | Why we need it                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Discord user ID**                                                                                                 | You, when you link with `/link` in Discord or **Connect Discord** on the Discord settings page          | To know which IKnoBall account a button click belongs to, so a pick lands on the profile you already have instead of creating a second one |
| **Server membership** — your Discord user ID, the display name Discord shows for you there, and the date you joined | Discord, when the bot joins a server, and whenever someone joins, leaves, or changes their display name | To work out whose points count on that server's leaderboard                                                                                |
| **Server ID** and **channel ID**                                                                                    | The server you add the bot to, and the channel an admin chooses with `/setup`                           | To post the card in that channel, and to keep each server's leaderboard separate                                                           |
| **Message ID**                                                                                                      | Discord, when the bot posts a card                                                                      | To edit that same card at tip-off and after the final, rather than posting a new one                                                       |
| **Posting hour and timezone**                                                                                       | An admin, in `/setup`                                                                                   | To post at that server's local time                                                                                                        |
| **Where a pick was placed** — `web` or `discord`, plus the server ID                                                | Your pick                                                                                               | To record that the pick came from Discord, and in which server it was made                                                                 |

If you sign in with Discord, we also hold your Discord user ID as part of that sign-in, as
section 6 describes. That's your login, not the bot; the two are stored separately.

**What the bot can see, and what it can't.** A server's leaderboard is defined by who is in the
server, so the bot asks Discord for the member list of every server it's in. Discord calls that the
Server Members intent, and it's the only privileged one we use. From it we keep three things: your
user ID, the display name Discord shows for you in that server, and the date you joined. We don't
keep your roles or anything else the member record carries.

That intent does **not** let us read messages. Message content is a separate intent, which we don't
request and which Discord reviews on its own. We also don't request the presence intent, so we can't
see who is online or what anyone is playing. The distinction worth being clear about: **we know
that you are in a server, and we don't know what you say in it.** Slash commands and button clicks
arrive with the ID of the person who used them, which is enough to place a pick without reading
anything. The bot sends no direct messages, apart from one to the person who added it, suggesting
`/setup`.

**Why we're allowed to.** Running the bot is part of the contract described in section 3 — it's
the same game on another surface, and the member list is how a server's board is calculated.
Keeping it working and free of abuse is our legitimate interest.

**How long we keep it:**

| Data                                                            | Retention                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord link — your user ID and the account it belongs to       | Until you unlink, or until you close your account                                                                                                                 |
| Server membership — your user ID, display name, and join date   | While you're in the server. It's refreshed from Discord, and the row is deleted when you leave the server or when the bot is removed from it                      |
| Server settings — server ID, channel ID, posting hour, timezone | While the bot is in the server. If it's removed we keep them, marked as removed, so re-adding it restores the same channel and hour. Ask us and we'll delete them |
| Card records — server, channel, and message IDs                 | While the bot still needs them to lock and settle that card, then with the rest of that season's records                                                          |
| Picks placed from Discord                                       | Section 5 applies. They're your picks, so they stay while your account is open — including after you unlink                                                       |

**How to unlink.** Run `/unlink` in Discord, or use **Disconnect Discord** on the Discord settings
page. Either one deletes the link, so your next click can't land on your account until you link
again. Your account and your picks stay exactly as they were — picks belong to your IKnoBall
account, not to the link. Closing your account deletes the link with it, and section 9 covers
asking us to do it for you.

Unlinking is not the same as leaving a server. The membership record follows the server, not the
link, so leaving the server is what deletes it — and because a server's board counts its current
members, your picks stop counting there, and count again if you rejoin.

## 12. Contact

SETO Tech — [rakaiseto@gmail.com](mailto:rakaiseto@gmail.com)

---

_See also our [Terms of Service](/terms)._

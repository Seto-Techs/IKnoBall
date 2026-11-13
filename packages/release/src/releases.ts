/**
 * The changelog, and with it the version of every app in the monorepo.
 *
 * This is the single source of truth for versioning: `RELEASES[0]` is what is
 * live, and `bun run version:sync` copies that version into every `package.json`
 * so the backend, the frontend and the worker can never disagree. A release is
 * one entry here — no separate bump step, no per-app versions.
 *
 * Newest first, strictly. Dates are the day the release went out, in UTC.
 */

export type ChangeKind = 'added' | 'improved' | 'fixed';

export interface ReleaseChange {
  kind: ChangeKind;
  /**
   * One sentence, written for a player rather than for a developer.
   *
   * No implementation detail: not what a query joined on, not a column name, a
   * cache, a table, or a screen width. Say what a player saw and what they see
   * now, and leave how it works out of it.
   */
  text: string;
}

export interface Release {
  /** Semver, and the version every app in the repo reports. */
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** The one line the What's New dialog leads with. */
  headline: string;
  changes: ReleaseChange[];
}

export const RELEASES: Release[] = [
  {
    version: '0.4.0',
    date: '2026-11-13',
    headline: 'LeBronnect lands: two players, and every teammate between them.',
    changes: [
      {
        kind: 'added',
        text: 'LeBronnect is a new daily game — two players, and you bridge them through teammates — where every link has to be real, a link you get right shows the seasons the two shared, and a chain that finishes over par comes back with the shortest route.',
      },
    ],
  },
  {
    version: '0.3.5',
    date: '2026-11-05',
    headline: 'The recap finally lands, and every card says what it pays.',
    changes: [
      {
        kind: 'fixed',
        text: 'The recap now posts once the last game of the night goes final. It never had — it looked for picks in a place they were never written, found none, and said nothing, so since 0.3.1 the night ended with an empty channel.',
      },
      {
        kind: 'added',
        text: 'A card that goes out before the odds are up now fills in its “+N pts” line as soon as a price lands, instead of going out without one and staying that way.',
      },
      {
        kind: 'improved',
        text: 'A card whose line moves before tip-off now updates to the points it actually pays, so the number you pick on is the number on the card.',
      },
      {
        kind: 'improved',
        text: 'The logo’s O is a basketball now rather than a globe, and the letters sit at uneven heights on purpose instead of looking like a few of them slipped.',
      },
    ],
  },
  {
    version: '0.3.4',
    date: '2026-11-03',
    headline: 'The next slate actually arrives — every day, in every server.',
    changes: [
      {
        kind: 'fixed',
        text: 'The next slate now arrives on its own once the night is done. It had never once managed it: it stopped before it ever got as far as reading the schedule, so since 0.3.1 no server rolled onto the next slate.',
      },
      {
        kind: 'fixed',
        text: 'A server in a timezone ahead of New York now gets the slate ahead, not the one that already tipped off. A 9 a.m. post in Jakarta is 10 p.m. the night before in New York, and the bot used to aim at that night — when every game was already over.',
      },
      {
        kind: 'improved',
        text: 'A day the league is off now says so — “No NBA games on Nov 3. The next slate is Nov 4.” — once, instead of leaving the channel silent next to a bot that is working fine.',
      },
    ],
  },
  {
    version: '0.3.3',
    date: '2026-11-02',
    headline: 'The slate turns over on its own, and a closed card looks closed.',
    changes: [
      {
        kind: 'fixed',
        text: 'The next slate now turns over in every server, every night. Some servers were being read as though they had never posted at all, so the night ended with no next slate, no recap, and a pick count of zero.',
      },
      {
        kind: 'fixed',
        text: 'A server that falls a day behind now catches up by itself, onto the next day that still has a game to pick, instead of asking for a night that had already tipped off over and over until morning.',
      },
      {
        kind: 'improved',
        text: 'A card that has closed now looks closed: a 🔒 on the title and a grey bar, so a game that has started no longer reads like one still waiting on you. A finished card keeps both, and shows the final score.',
      },
      {
        kind: 'improved',
        text: 'On a laptop, the dashboard stops squeezing the middle of the page, and a leaderboard row keeps a long username whole instead of chopping it.',
      },
    ],
  },
  {
    version: '0.3.2',
    date: '2026-10-31',
    headline: 'The card tells you how each side is going, and the board knows your name.',
    changes: [
      {
        kind: 'added',
        text: 'Each side of a matchup now shows its record, its last five results, and what a correct pick is worth — so the card is something to decide on, not just a fixture.',
      },
      {
        kind: 'improved',
        text: 'The card is tighter: the teams, the tip-off and both sides’ numbers, with the clutter gone so a long tip-off no longer spills onto a second line.',
      },
      {
        kind: 'fixed',
        text: 'Every game on the slate posts as its own card above its own buttons, so you no longer have to work out which pair of buttons belongs to which game.',
      },
      {
        kind: 'fixed',
        text: '/leaderboard now ranks everyone in the server, including the people who signed in with Discord and never typed /link. If you are outside the top ten, your own row is added underneath.',
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2026-10-31',
    headline: 'The slate comes to you, and the site tells you it is on Discord.',
    changes: [
      {
        kind: 'added',
        text: 'The next slate posts itself the moment the last game of the night settles — no waiting for the morning. A card per game for the day ahead, in the channel you already set.',
      },
      {
        kind: 'added',
        text: 'A recap when the day ends: the server’s board as it stood once the last game went final, so the night’s result is the last thing in the channel rather than something you go looking for.',
      },
      {
        kind: 'added',
        text: 'The site now says so. If you have not tried the bot, the front page has an invite, and the footer has it on every page after you sign in.',
      },
      {
        kind: 'improved',
        text: 'Adding the bot asks for five permissions and nothing else: post in the channel you choose, and make a thread when a day is busy enough to need one.',
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-30',
    headline: 'IKnoBall is on Discord, so picking comes to you.',
    changes: [
      {
        kind: 'added',
        text: 'The day’s slate posts in your server as one card per game — both teams, their records and form, and a tip-off that shows in your own timezone.',
      },
      {
        kind: 'added',
        text: 'Tap a team to pick. The confirmation is yours alone and disappears on its own, so the channel stays a channel and not a wall of receipts.',
      },
      {
        kind: 'added',
        text: 'Cards lock at tip-off. Once a game starts its buttons stop working, so nobody picks a side with the result already in hand.',
      },
      {
        kind: 'added',
        text: '/picks shows what you have open and what has settled, without leaving Discord.',
      },
      {
        kind: 'added',
        text: '/leaderboard ranks the members of the server you are in — its own board, not the whole site’s.',
      },
      {
        kind: 'added',
        text: 'Your Discord picks land on your IKnoBall account. Sign in with Discord and it is already done; otherwise /link connects the two, and the points show up on the web with everything else.',
      },
      {
        kind: 'added',
        text: 'Server admins pick the channel and the hour the slate arrives with /setup, so the bot posts where you want it and nowhere else.',
      },
      {
        kind: 'added',
        text: 'A Discord page in your settings to link and unlink the account from the web.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-28',
    headline: 'IKnoBall gets a version, and tells you what changed.',
    changes: [
      {
        kind: 'added',
        text: 'Release notes. Every update now has a version, and this is where what changed shows up the first time you open the app after one.',
      },
      {
        kind: 'improved',
        text: 'Rankings is built for a phone — standings and both boards stack instead of squeezing into a row.',
      },
      {
        kind: 'fixed',
        text: 'Standings now read the record straight from the final scores, so a result shows up the day it happens instead of a week later.',
      },
      {
        kind: 'fixed',
        text: 'Season stats update a couple of hours after a game ends, once the numbers behind them are in, instead of grabbing a box score that is still being filled in.',
      },
      {
        kind: 'fixed',
        text: 'The prediction panel speaks plainly now: points and scoring, with no bookmaker words.',
      },
      {
        kind: 'fixed',
        text: 'Onboarding’s team picker works on a phone, and coming back from a game keeps the slate day you were on.',
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-22',
    headline: 'Where IKnoBall starts.',
    changes: [
      {
        kind: 'added',
        text: 'A dashboard built on your team: the slate, recent form, standings and the rest of the league at a glance.',
      },
      {
        kind: 'added',
        text: 'Two prediction boards — Flat and Weighted — scored off the points each pick is worth.',
      },
      {
        kind: 'added',
        text: 'Rankings for standings and the league leaderboards.',
      },
      {
        kind: 'added',
        text: 'Player pages with season splits and a shot-zone chart.',
      },
      {
        kind: 'added',
        text: 'Box scores for every final game.',
      },
      {
        kind: 'added',
        text: 'An account page for your avatar, your password, and the devices you are signed in on.',
      },
      {
        kind: 'added',
        text: 'Support us, terms of service and a privacy policy.',
      },
    ],
  },
];

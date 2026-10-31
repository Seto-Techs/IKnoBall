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
  /** One sentence, written for a player rather than for a developer. */
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
        text: 'Standings read the record off the final scores, so a result no longer waits on a week-old cache.',
      },
      {
        kind: 'fixed',
        text: 'Season stats refresh two hours after a game goes final instead of racing the box score.',
      },
      {
        kind: 'fixed',
        text: 'The prediction panel dropped its betting vocabulary and talks about points.',
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
        text: 'An account page for your avatar, password and signed-in sessions.',
      },
      {
        kind: 'added',
        text: 'Support us, terms of service and a privacy policy.',
      },
    ],
  },
];

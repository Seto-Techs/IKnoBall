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

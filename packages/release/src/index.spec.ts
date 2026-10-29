import { describe, expect, it } from 'vitest';
import { LATEST_RELEASE, RELEASES, VERSION, releasesNewerThan } from './index.js';

/**
 * The rule the whole feature hangs on: a player is shown what changed since the
 * version they last dismissed, and nothing they have already read. Getting this
 * wrong either hides a release or replays it on every page load.
 */
describe('releasesNewerThan', () => {
  it('returns nothing when the player has already seen the latest release', () => {
    expect(releasesNewerThan(VERSION)).toEqual([]);
  });

  it('returns only the releases published after a version the player has seen', () => {
    const oldest = RELEASES[RELEASES.length - 1]!.version;
    expect(releasesNewerThan(oldest)).toEqual(RELEASES.slice(0, RELEASES.length - 1));
  });

  it('counts an unknown version as having seen nothing', () => {
    expect(releasesNewerThan('0.0.0-does-not-exist')).toEqual(RELEASES);
  });

  it('counts a missing version as having seen nothing', () => {
    expect(releasesNewerThan(null)).toEqual(RELEASES);
    expect(releasesNewerThan(undefined)).toEqual(RELEASES);
  });

  it('keeps the changelog newest first, so the newest release is what greets a player', () => {
    const versions = RELEASES.map((release) => release.version.split('.').map(Number));
    for (let i = 1; i < versions.length; i += 1) {
      const [major, minor, patch] = versions[i - 1]!;
      const [nextMajor, nextMinor, nextPatch] = versions[i]!;
      expect(
        major! > nextMajor! ||
          (major === nextMajor && minor! > nextMinor!) ||
          (major === nextMajor && minor === nextMinor && patch! > nextPatch!),
      ).toBe(true);
    }
  });
});

describe('VERSION', () => {
  it('is the newest release, so the apps cannot disagree with the changelog', () => {
    expect(VERSION).toBe(RELEASES[0]!.version);
    expect(LATEST_RELEASE).toBe(RELEASES[0]);
  });
});

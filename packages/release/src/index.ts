import { RELEASES, type ChangeKind, type Release, type ReleaseChange } from './releases.js';

export { RELEASES, type ChangeKind, type Release, type ReleaseChange };

/**
 * The version every app in the monorepo reports — backend, frontend, worker.
 *
 * It is derived from the changelog rather than typed out again, so a release
 * cannot ship a version that disagrees with its own notes.
 */
export const VERSION: string = RELEASES[0]!.version;

export const LATEST_RELEASE: Release = RELEASES[0]!;

/**
 * Releases published after `version`, newest first.
 *
 * An unknown version counts as nothing seen — a version can be rolled back out
 * of the changelog, and a user who last saw it should still be told what is new.
 */
export function releasesNewerThan(version: string | null | undefined): Release[] {
  if (!version) return [...RELEASES];
  const index = RELEASES.findIndex((release) => release.version === version);
  return index === -1 ? [...RELEASES] : RELEASES.slice(0, index);
}

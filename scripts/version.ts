/**
 * Keeps every `package.json` in the monorepo on the version in the changelog.
 *
 * IKnoBall ships one version, not one per app: a backend change that merges to
 * `main` is released as the same number the frontend and the worker report, so
 * `@iknoball/release` is the only place a version is written by hand.
 *
 *   bun run version:sync     # copy the changelog version into every package
 *   bun run version:check    # fail if any package disagrees (CI, pre-commit)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RELEASES } from '../packages/release/src/releases';

const ROOT = join(import.meta.dir, '..');

/** The changelog is only trustworthy if it is ordered and well-formed. */
function validateChangelog(): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  RELEASES.forEach((release, index) => {
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) {
      problems.push(`release ${index}: "${release.version}" is not a plain semver version`);
    }
    if (seen.has(release.version)) {
      problems.push(`release ${index}: ${release.version} appears twice`);
    }
    seen.add(release.version);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date)) {
      problems.push(`release ${release.version}: date "${release.date}" is not YYYY-MM-DD`);
    }
    if (release.changes.length === 0) {
      problems.push(`release ${release.version}: has no changes to show`);
    }
    if (!release.headline.trim()) {
      problems.push(`release ${release.version}: has no headline`);
    }

    const previous = RELEASES[index - 1];
    if (previous && compare(previous.version, release.version) <= 0) {
      problems.push(
        `release ${release.version} is listed below ${previous.version}; the changelog is newest first`,
      );
    }
  });

  if (problems.length > 0) {
    throw new Error(`packages/release/src/releases.ts is not usable:\n  ${problems.join('\n  ')}`);
  }
}

/** Numeric semver compare, for ordering only. */
function compare(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The root manifest plus every workspace, found the way bun finds them. */
function manifests(): string[] {
  const paths = ['package.json'];
  for (const group of ['apps', 'packages']) {
    for (const entry of new Bun.Glob(`${group}/*/package.json`).scanSync({ cwd: ROOT })) {
      paths.push(entry);
    }
  }
  return paths;
}

function main(): void {
  validateChangelog();

  const version = RELEASES[0]!.version;
  const check = process.argv.includes('--check');
  const stale: string[] = [];
  const changed: string[] = [];

  for (const path of manifests()) {
    const absolute = join(ROOT, path);
    const source = readFileSync(absolute, 'utf8');
    const manifest = JSON.parse(source) as { version?: string };

    if (manifest.version === version) continue;
    stale.push(`${path} is ${manifest.version ?? 'unversioned'}`);

    if (!check) {
      // Rewriting the parsed object would reformat the manifest, so replace the
      // version in place and keep the file exactly as the author wrote it.
      const updated = manifest.version
        ? source.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
        : source.replace(/("name":\s*"[^"]*",\n)/, `$1  "version": "${version}",\n`);
      writeFileSync(absolute, updated);
      changed.push(path);
    }
  }

  if (check) {
    if (stale.length > 0) {
      throw new Error(
        `every package must be on ${version}, the version in packages/release/src/releases.ts:\n  ${stale.join('\n  ')}\n\nRun \`bun run version:sync\` to fix it.`,
      );
    }
    console.log(`All packages are on ${version}.`);
    return;
  }

  if (changed.length === 0) {
    console.log(`All packages are already on ${version}.`);
    return;
  }

  // bun.lock records each workspace's version. It does not gate an install, but
  // leaving it behind means the next person's `bun install` rewrites it in an
  // unrelated pull request, so refresh it here where the bump belongs.
  const install = Bun.spawnSync(['bun', 'install', '--lockfile-only', '--ignore-scripts'], {
    cwd: ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (install.exitCode !== 0) {
    throw new Error('bun.lock could not be refreshed; run `bun install` and commit the result');
  }

  console.log(`Set ${version} on:\n  ${changed.join('\n  ')}`);
}

main();

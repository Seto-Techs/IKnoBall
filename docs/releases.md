# Releasing

IKnoBall ships **one version for the whole monorepo**. A backend fix is released
as the same number the frontend and the worker report, and players see it in the
What's New dialog the first time they open the app after it lands. There are no
per-app versions.

## The one place a version is written

`packages/release/src/releases.ts` holds the changelog. `RELEASES[0]` is what is
live, and every manifest, the backend health response, the frontend footer and
the worker's boot line read the version from it:

```
packages/release/src/releases.ts   ← the only hand-written version
        │
        ├─ VERSION ──▶ GET /api            (backend)
        │           ──▶ footer, /changelog, profile card, What's New (frontend)
        │           ──▶ "IKnoBall worker x.y.z" at boot (worker)
        │
        └─ bun run version:sync ──▶ package.json × 9 + bun.lock
```

## Cutting a release

1. Add an entry at the **top** of `RELEASES` in `packages/release/src/releases.ts`.
   Newest first, semver, `YYYY-MM-DD` date, one-line headline, and `changes`
   written for a player rather than a developer — no commit subjects.

   ```ts
   {
     version: '0.3.0',
     date: '2026-11-04',
     headline: 'One line on what this release is about.',
     changes: [
       { kind: 'added', text: 'What a player can now do.' },
       { kind: 'fixed', text: 'What stopped being broken.' },
     ],
   }
   ```

2. `bun run version:sync` — copies that version into the root and every
   workspace manifest, then refreshes `bun.lock`.

3. Commit the changelog, the manifests and the lockfile together.

`version:check` fails if any manifest disagrees, and it runs on pre-commit, so a
half-applied bump cannot be committed. It also rejects a changelog that is
unordered, duplicated, not plain semver, or missing a headline or changes.

## What a player sees

- **What's New** — a modal over whatever page they land on, showing the newest
  release only, with a link to the full history. Dismissing it stores the version
  in `localStorage` (`iknoball.release.seen`), so it greets them once per release
  and never again for one they have read. It does not open on `/auth/*`,
  onboarding, or `/changelog`.
- **`/changelog`** — every release, newest first, rendered from the same data.
- **Profile → Release** — the version they are on, and a link to the changelog.
- **`GET /api`** — `{ status: 'ok', version: '0.2.0' }`, so you can check which
  release a deployment is actually running.

## Rolling back

The version is derived from the changelog, so rolling back means removing the
entry and running `bun run version:sync`. A browser that last dismissed the
removed version counts as having seen nothing, so the notes for whatever is live
still appear.

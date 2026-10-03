# AGENTS.md

IKnoBall is a Bun + Turborepo monorepo. Use `bun` for everything.

## Package manager / runtime

- Use **bun** for the frontend and the backend (and the worker, and every package).
- Never use `npm`, `yarn`, or `pnpm` — install, run scripts, and execute TypeScript with `bun`.
- The repo pins the package manager in `package.json` (`"packageManager": "bun@1.3.14"`). Respect it.
- Dependencies live in the root `bun.lock`. Add/remove deps from the workspace that needs them (e.g. `bun add <pkg> --filter frontend`), not with a global install.

## Repo layout

| Path                | Workspace            | Stack                                   |
| ------------------- | -------------------- | --------------------------------------- |
| `apps/frontend`     | `frontend`           | React 19 + Vite + TanStack Router/Query |
| `apps/backend`      | `backend`            | NestJS + Drizzle + BetterAuth           |
| `apps/worker`       | `iknoball-worker`    | NestJS standalone worker (BullMQ, cron) |
| `packages/database` | `@iknoball/database` | Drizzle schema + migrations             |
| `packages/schema`   | `@iknoball/schema`   | Shared Zod schemas + auth types         |

## Running things

Turborepo orchestrates the workspaces. Prefer the root scripts, which wrap `turbo run …`:

```bash
bun install              # install everything
bun run dev              # turbo run dev (all workspaces)
bun run backend          # turbo run dev --filter=backend
bun run frontend         # turbo run dev --filter=frontend
bun run worker           # turbo run dev --filter=iknoball-worker
```

You can also drive a workspace directly, e.g. `bun run --filter frontend dev` or `bun --filter '@iknoball/database' run generate`.

## Build, lint, test

```bash
bun run build            # turbo run build (all)
bun run backend:build    # turbo run build --filter=backend
bun run frontend:build   # turbo run build --filter=frontend
bun run worker:build     # turbo run build --filter=iknoball-worker

bun run lint             # turbo run lint (oxlint)
bun run format           # oxfmt . --write
bun run format:check     # oxfmt . --check

bun run test             # turbo run test
bun run backend:test     # turbo run test --filter=backend
```

- Backend tests use **vitest** (`vitest run --config vitest.config.mjs`).
- Linting is **oxlint**; formatting is **oxfmt**. Run them via the root scripts.
- `lefthook` runs format, lint, and test on pre-commit.

## Database

```bash
bun run generate         # drizzle-kit generate (schema -> migration)
bun run migrate          # drizzle-kit migrate
```

Both filter to `@iknoball/database`. Keep schema changes in `packages/database` (or `packages/schema` for shared Zod types) rather than duplicating them per app.

## Notes for agents

- Run commands from the repo root so turbo can resolve the workspace graph.
- Don't add a second lockfile or a Node-only toolchain; bun is the runtime.
- Environment files (`.env`) exist per app (`apps/backend/.env`, `apps/frontend/.env`). Don't commit them.

FROM oven/bun:1.3.14-slim AS builder
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/predictions/package.json packages/predictions/package.json
COPY packages/shot-zones/package.json packages/shot-zones/package.json

COPY apps/worker apps/worker
COPY packages/database packages/database
COPY packages/predictions packages/predictions
COPY packages/shot-zones packages/shot-zones

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --filter '@iknoball/database' build
RUN bun run --filter '@iknoball/predictions' build
RUN bun run --filter '@iknoball/shot-zones' build

WORKDIR /app/apps/worker
RUN bun run build
FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app/apps/worker

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates adduser nodejs \
  && rm -rf /var/lib/apt/lists/*

# A real Node runtime, and it has to be real. `oven/bun` images ship a `node`
# command that is a symlink to bun, so `CMD ["node", ...]` would silently run
# Bun — which cdn.nba.com answers with a 403 regardless of headers, breaking
# every CDN read (the live box-score poll and the shot-zone sync alike). apt's
# nodejs lands in /usr/bin, which precedes the image's bun-node-fallback-bin on
# PATH, and this assertion fails the build if that ever stops being true.
RUN node --version \
  && node -e "if (process.versions.bun) { console.error('node resolves to bun'); process.exit(1) }"

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/worker/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/worker/package.json ./package.json

# Matches package.json's `start` script, which was already Node while the old
# CMD here said Bun.
CMD ["node", "dist/main.js"]

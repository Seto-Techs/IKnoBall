FROM oven/bun:1.3.14-slim AS builder
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/discord/package.json apps/discord/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/predictions/package.json packages/predictions/package.json
COPY packages/release/package.json packages/release/package.json
COPY packages/shot-zones/package.json packages/shot-zones/package.json

COPY apps/discord apps/discord
COPY packages/database packages/database
COPY packages/predictions packages/predictions

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run --filter '@iknoball/database' build
RUN bun run --filter '@iknoball/predictions' build

WORKDIR /app/apps/discord
RUN bun run build
FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app/apps/discord

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates adduser nodejs \
  && rm -rf /var/lib/apt/lists/*

# A real Node runtime, and it has to be real. `oven/bun` images ship a `node`
# command that is a symlink to bun, so `CMD ["node", ...]` would silently run
# Bun. apt's nodejs lands in /usr/bin, which precedes the image's
# bun-node-fallback-bin on PATH, and this assertion fails the build if that ever
# stops being true. `sharp` in particular needs a real Node ABI to load its
# prebuilt binary.
RUN node --version \
  && node -e "if (process.versions.bun) { console.error('node resolves to bun'); process.exit(1) }"

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/discord/node_modules ./node_modules
COPY --from=builder /app/apps/discord/dist ./dist
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/apps/discord/package.json ./package.json

# Matches package.json's `start` script.
CMD ["node", "dist/main.js"]

FROM oven/bun:1.3.1-slim AS builder
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
RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/worker apps/worker
COPY packages/database packages/database
WORKDIR /app/apps/worker

RUN bun --filter '@iknoball/database' run build
RUN bun run build

FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app/apps/worker

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/worker/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/apps/worker/package.json ./package.json

CMD ["bun", "run", "dist/main.js"]

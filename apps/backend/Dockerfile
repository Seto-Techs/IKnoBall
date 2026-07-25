FROM oven/bun:1.3.1-slim AS builder
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/prisma/package.json packages/prisma/package.json
RUN bun install --frozen-lockfile

COPY apps/backend apps/backend
COPY packages/schema packages/schema
COPY packages/prisma packages/prisma
WORKDIR /app/apps/backend

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ARG DATABASE_URL_SHADOW
ENV DATABASE_URL_SHADOW=$DATABASE_URL_SHADOW

RUN bun --filter '@iknoball/prisma' run generate
RUN bun --filter '@iknoball/prisma' run migrate
RUN bun run build

FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app/apps/backend

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/package.json ./package.json

EXPOSE 3000
CMD ["bun", "run", "dist/src/main.js"]

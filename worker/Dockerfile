FROM oven/bun:1.3.1-slim AS builder
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ARG DATABASE_URL_SHADOW
ENV DATABASE_URL_SHADOW=$DATABASE_URL_SHADOW

RUN bunx prisma generate --config prisma.config.ts

COPY . .

RUN bun run build

FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

CMD ["bun", "run", "dist/main.js"]

# -----------------------------
# 2. Build
# -----------------------------
FROM oven/bun:1.3.1-slim AS builder
WORKDIR /app

# -----------------------------
# system deps (sekali aja)
# -----------------------------
RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# -----------------------------
# deps
# -----------------------------
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# -----------------------------
# prisma FIRST (cache boundary)
# -----------------------------
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
ARG DATABASE_URL_SHADOW
ENV DATABASE_URL_SHADOW=$DATABASE_URL_SHADOW

RUN bunx prisma generate --config prisma.config.ts

# -----------------------------
# app source
# -----------------------------
COPY . .

# -----------------------------
# build steps
# -----------------------------
RUN bunx prisma migrate deploy
RUN bun run build

# -----------------------------
# 3. Runtime
# -----------------------------
FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN addgroup --system app && adduser --system --ingroup app app
USER app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["bun", "run", "dist/main.js"]

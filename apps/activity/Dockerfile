FROM oven/bun:1.3.14-slim AS builder
WORKDIR /app

# Every workspace's package.json is copied before installing: the root
# `bun.lock` covers all of them, so `--frozen-lockfile` fails if a workspace
# named by the glob is missing from the image.
COPY package.json bun.lock ./
COPY apps/activity/package.json apps/activity/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/discord/package.json apps/discord/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/predictions/package.json packages/predictions/package.json
COPY packages/release/package.json packages/release/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/shot-zones/package.json packages/shot-zones/package.json
RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/activity apps/activity
WORKDIR /app/apps/activity

# Vite bakes these into the bundle, so they are build args, not runtime env.
# `VITE_API_URL` is a path (`/be`) rather than an origin: inside Discord every
# request is same-origin through the portal's URL mapping, so the browser never
# makes a cross-origin call and CORS never comes into it.
ARG VITE_API_URL
ARG VITE_DISCORD_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN bun run build

FROM nginx:1.27-alpine
COPY apps/activity/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/activity/dist /usr/share/nginx/html
EXPOSE 3000

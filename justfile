default:
  @just --list

install:
  bun install

generate:
  bun --filter='@iknoball/prisma' run generate

migrate:
  bun --filter='@iknoball/prisma' run migrate

build:
  bun run build

lint:
  bun run lint

test:
  bun run test

dev:
  bun run dev

backend:
  bun --filter=backend run dev

frontend:
  bun --filter=frontend run dev

worker:
  bun --filter=iknoball-worker run dev

backend-build:
  bun --filter=backend run build

frontend-build:
  bun --filter=frontend run build

worker-build:
  bun --filter=iknoball-worker run build

backend-test:
  bun --filter=backend run test

backend-lint:
  bun --filter=backend run lint

frontend-lint:
  bun --filter=frontend run lint

docker-backend:
  docker build -f apps/backend/Dockerfile .

docker-frontend:
  docker build -f apps/frontend/Dockerfile .

docker-worker:
  docker build -f apps/worker/Dockerfile .

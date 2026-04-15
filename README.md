# sona-dashboard

Monorepo containing the Sona personal-life-management dashboard — a Next.js frontend and a Node/Express + Prisma backend.

## Repository layout

```
sona-dashboard/
  frontend/               Next.js 15 app (port 3010)
  backend/                Node/Express API + Prisma ORM (port 3001)
  shared/                 Shared TypeScript types and validators
  docker-compose.yml      Production orchestration (frontend + backend + postgres)
  docker-compose.dev.yml  Dev overlay with hot-reload mounts
  .env.example            Template for required environment variables
```

## Quick start

### Prerequisites
- Docker + Docker Compose v2
- Copy `.env.example` to `.env` and fill in secrets

### Development (hot-reload)

```bash
cp .env.example .env
# edit .env with real values
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Frontend: http://localhost:3010
- Backend API: http://localhost:3001

### Production

```bash
docker compose up --build -d
```

### Run DB migrations only

```bash
docker compose run --rm backend sh -c "npx prisma migrate deploy"
```

## Services

| Service  | Port | Description                              |
|----------|------|------------------------------------------|
| frontend | 3010 | Next.js 15 dashboard UI                  |
| backend  | 3001 | Express REST API + Prisma + PostgreSQL   |
| db       | 5432 | PostgreSQL 16 (internal, exposed for dev)|

## Development workflow

Feature branches follow `feat/<desc>`, `fix/<desc>`, `chore/<desc>`.
All PRs go through `gh pr create` — never commit directly to `main`.

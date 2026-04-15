# sona-dashboard

Monorepo for the Sona dashboard â a Next.js UI that talks to the Sona agent API.

## Structure

```
sona-dashboard/
├── frontend/        # Next.js 15 dashboard UI (served on port 3010)
├── backend/         # Express proxy API â bridges frontend to Sona agent (port 3001)
├── docker-compose.yml       # Production compose
├── docker-compose.dev.yml   # Dev overrides (hot-reload)
└── README.md
```

### frontend/

Next.js 15 app with Tailwind CSS. Pages: `/`, `/jobs`, `/agents`, `/memory`, `/system`.
Talks to `backend` via `NEXT_PUBLIC_API_URL`.

### backend/

Minimal Express app that proxies `/api/*`, `/chat`, and `/tool` requests to the Sona agent HTTP API at `SONA_API_URL` (default `http://localhost:8080`).

## Running (dev)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Frontend hot-reload: http://localhost:3010
- Backend: http://localhost:3001
- Backend health: http://localhost:3001/health

## Running (production)

```bash
docker compose up -d
```

## Environment variables

| Variable | Default | Where |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://backend:3001` | frontend container |
| `PORT` | `3001` | backend container |
| `SONA_API_URL` | `http://host.docker.internal:8080` | backend container |

Copy `backend/.env.example` to `backend/.env` for local dev outside Docker.

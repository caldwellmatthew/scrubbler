# Spotify Cache Service

TypeScript/Node.js service that polls the Spotify recently-played API and caches results to PostgreSQL.

## Architecture

Two separate Node.js processes share one PostgreSQL database:

- **Server** (`src/server/`) — Express HTTP server exposing the REST API and OAuth callback
- **Worker** (`src/worker/`) — setInterval polling loop that fetches and stores Spotify history
- **Shared** (`src/shared/`) — config, DB pool, types, Spotify client, and repositories

## Quick Start

```bash
# 1. Start PostgreSQL (schema applied automatically on first start)
docker compose up -d

# 2. Configure environment
cp .env.example .env
# Fill in: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, OAUTH_STATE_SECRET

# 3. Install dependencies
npm install

# 4. Start both processes (in separate terminals)
npm run dev:server
npm run dev:worker

# 5. Authenticate via browser
open http://localhost:3000/auth/login
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | From Spotify Developer Dashboard |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP server port (default: `3000`) |
| `POLL_INTERVAL_MS` | No | Polling interval in ms (default: `60000`) |
| `NODE_ENV` | No | `development` or `production` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/auth/login` | Redirect to Spotify OAuth |
| GET | `/auth/callback` | OAuth callback handler |
| GET | `/history` | Query cached listen history |

### `GET /history` Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | 50 | Max results (1–200) |
| `offset` | integer | 0 | Pagination offset |
| `before` | ISO date | — | Only events before this timestamp |
| `after` | ISO date | — | Only events after this timestamp |
| `track_id` | string | — | Filter by Spotify track ID |

## Development Commands

```bash
npm run dev:server    # Start server with hot-reload
npm run dev:worker    # Start worker with hot-reload
npm run build         # Compile TypeScript to dist/
npm run start:server  # Run compiled server
npm run start:worker  # Run compiled worker
npm run typecheck     # Type-check without emitting
npm run migrate       # Apply migrations manually
```

## Database Schema

- **`oauth_tokens`** — one row per authenticated Spotify user
- **`tracks`** — normalized track metadata (upserted to keep fresh)
- **`listen_history`** — one row per play event; `UNIQUE(spotify_track_id, played_at)` deduplicates
- **`poll_state`** — single-row cursor table; `last_played_at_ms` is the `after` param for the next poll

## Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add `http://localhost:3000/auth/callback` to Redirect URIs
4. Copy Client ID and Client Secret to `.env`

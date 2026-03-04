# Scrubbler

TypeScript/Node.js app that polls Spotify's recently-played and currently-playing APIs, caches listen history to PostgreSQL, and scrobbles (with tag sanitization) to Last.fm.

## Architecture

Three pieces share one PostgreSQL database:

- **Server** (`src/server/`) — Express HTTP server exposing the REST API and OAuth callbacks. In production, also serves the built client.
- **Worker** (`src/worker/`) — setInterval polling loop that fetches/stores Spotify history, auto-scrobbles to Last.fm, and pushes now-playing status
- **Client** (`src/client/`) — Preact + Vite SPA. In development, runs on its own dev server (port 5173) with API proxy to the Express server. Built to `dist/client/` for production.
- **Shared** (`src/shared/`) — config, DB pool, types, Spotify client, Last.fm client, and repositories

## Quick Start

```bash
# 1. Start PostgreSQL (schema applied automatically on first start)
docker compose up -d

# 2. Configure environment
cp .env.example .env
# Required: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, OAUTH_STATE_SECRET
# Optional: LASTFM_API_KEY, LASTFM_API_SECRET (for scrobbling)
# Dev only: CLIENT_ORIGIN=http://localhost:5173

# 3. Install dependencies
npm install

# 4. Start all three processes (in separate terminals)
npm run dev:server
npm run dev:worker
npm run dev:client

# 5. Authenticate via browser (must use 127.0.0.1, not localhost — Spotify API restriction)
open http://localhost:5173/auth/login
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | From Spotify Developer Dashboard |
| `OAUTH_STATE_SECRET` | Yes | Random secret for OAuth CSRF state |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP server port (default: `3000`) |
| `POLL_INTERVAL_MS` | No | Polling interval in ms (default: `60000`) |
| `NODE_ENV` | No | `development` or `production` |
| `LASTFM_API_KEY` | No | From Last.fm API account (enables scrobbling) |
| `LASTFM_API_SECRET` | No | From Last.fm API account |
| `CLIENT_ORIGIN` | No | Origin of the client app for post-auth redirects. Set to `http://localhost:5173` in development. Leave empty in production. |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/auth/login` | Redirect to Spotify OAuth |
| GET | `/auth/callback` | Spotify OAuth callback handler |
| GET | `/history` | Query cached listen history |
| GET | `/now-playing` | Current Spotify track (with sanitized names) |
| POST | `/now-playing/push` | Push current track to Last.fm now-playing |
| GET | `/poll` | Get polling enabled state |
| POST | `/poll` | Toggle polling on/off |
| GET | `/lastfm/status` | Last.fm connection status |
| GET | `/lastfm/login` | Redirect to Last.fm OAuth |
| GET | `/lastfm/callback` | Last.fm OAuth callback handler |
| POST | `/lastfm/disconnect` | Disconnect Last.fm session |
| GET/POST | `/lastfm/auto-scrobble` | Get/set auto-scrobble toggle |
| GET/POST | `/lastfm/now-playing-enabled` | Get/set Last.fm now-playing update toggle |
| GET/POST | `/lastfm/sanitize-now-playing` | Get/set tag sanitization for now-playing |
| POST | `/lastfm/preview` | Preview sanitized scrobble data for history IDs |
| POST | `/lastfm/scrobble` | Scrobble specific history entries to Last.fm |
| GET | `/explorer/proxy` | Proxy authenticated Spotify API requests |

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
npm run dev:server    # Start Express server with hot-reload (port 3000)
npm run dev:worker    # Start worker with hot-reload
npm run dev:client    # Start Vite dev server with HMR (port 5173)
npm run build         # Compile server (tsc) + client (vite build)
npm run build:server  # Compile server only
npm run build:client  # Build client only
npm run start:server  # Run compiled server (NODE_ENV=production, serves client)
npm run start:worker  # Run compiled worker
npm run typecheck     # Type-check both server and client
npm run migrate       # Apply migrations manually
```

## Client Architecture

The client is a Preact SPA built with Vite (`src/client/`).

- **Config**: `vite.config.ts` (root), `tsconfig.client.json` (separate from server tsconfig)
- **Entry**: `src/client/index.html` → `main.tsx` → `app.tsx`
- **State**: All state lives in `App.tsx` via `useState`, passed as props (2-3 levels deep, no context)
- **Components**: `Header`, `NowPlaying`, `HistoryTab`, `ScrobbleBar`, `ScrobblePreviewModal`, `ExplorerTab`
- **API layer**: `api.ts` — typed fetch wrappers for every endpoint
- **Types**: `types.ts` — client-side types mirroring API JSON (does NOT import from `src/shared/`)
- **CSS**: `app.css` — all styles in one file, uses class selectors plus a few IDs for single-instance elements

In development, the Vite dev server (port 5173) proxies all API routes to the Express server (port 3000). In production, Express serves the built client from `dist/client/` with SPA fallback.

## Database Schema

- **`oauth_tokens`** — one row per authenticated Spotify user
- **`tracks`** — normalized track metadata (upserted to keep fresh)
- **`listen_history`** — one row per play event; `UNIQUE(spotify_track_id, played_at)` deduplicates; `scrobbled_at` tracks Last.fm scrobble time
- **`poll_state`** — single-row cursor table; `last_played_at_ms` is the `after` param for the next poll
- **`lastfm_sessions`** — Last.fm session key and per-user toggles (`auto_scrobble_enabled`, `now_playing_enabled`, `sanitize_now_playing`)

## Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add `http://127.0.0.1:3000/auth/callback` to Redirect URIs (must use `127.0.0.1`, not `localhost`)
4. Copy Client ID and Client Secret to `.env`

## Last.fm App Setup

1. Go to https://www.last.fm/api/account/create
2. Create an application
3. Copy API Key and Shared Secret to `.env` as `LASTFM_API_KEY` and `LASTFM_API_SECRET`
4. Connect via the Last.fm section in the web UI

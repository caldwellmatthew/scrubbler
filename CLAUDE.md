# Scrubbler

TypeScript/Node.js app that polls Spotify's recently-played and currently-playing APIs, caches listen history to PostgreSQL, and scrobbles (with tag sanitization) to Last.fm.

## Architecture

Two separate Node.js processes share one PostgreSQL database:

- **Server** (`src/server/`) — Express HTTP server exposing the REST API, OAuth callbacks, and the web UI
- **Worker** (`src/worker/`) — setInterval polling loop that fetches/stores Spotify history, auto-scrobbles to Last.fm, and pushes now-playing status
- **Shared** (`src/shared/`) — config, DB pool, types, Spotify client, Last.fm client, and repositories

## Quick Start

```bash
# 1. Start PostgreSQL (schema applied automatically on first start)
docker compose up -d

# 2. Configure environment
cp .env.example .env
# Required: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, OAUTH_STATE_SECRET
# Optional: LASTFM_API_KEY, LASTFM_API_SECRET (for scrobbling)

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
| `OAUTH_STATE_SECRET` | Yes | Random secret for OAuth CSRF state |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP server port (default: `3000`) |
| `POLL_INTERVAL_MS` | No | Polling interval in ms (default: `60000`) |
| `NODE_ENV` | No | `development` or `production` |
| `LASTFM_API_KEY` | No | From Last.fm API account (enables scrobbling) |
| `LASTFM_API_SECRET` | No | From Last.fm API account |

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
- **`listen_history`** — one row per play event; `UNIQUE(spotify_track_id, played_at)` deduplicates; `scrobbled_at` tracks Last.fm scrobble time
- **`poll_state`** — single-row cursor table; `last_played_at_ms` is the `after` param for the next poll
- **`lastfm_sessions`** — Last.fm session key and per-user toggles (`auto_scrobble_enabled`, `now_playing_enabled`, `sanitize_now_playing`)

## Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add `http://localhost:3000/auth/callback` to Redirect URIs
4. Copy Client ID and Client Secret to `.env`

## Last.fm App Setup

1. Go to https://www.last.fm/api/account/create
2. Create an application
3. Copy API Key and Shared Secret to `.env` as `LASTFM_API_KEY` and `LASTFM_API_SECRET`
4. Connect via the Last.fm section in the web UI

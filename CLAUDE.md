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
# 1. Start PostgreSQL
docker compose up -d

# 2. Apply database migrations
npm run migrate

# 3. Configure environment
cp .env.example .env
# Required: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, OAUTH_STATE_SECRET
# Optional: LASTFM_API_KEY, LASTFM_API_SECRET (for scrobbling)
# Dev only: CLIENT_ORIGIN=http://localhost:5173

# 4. Install dependencies
npm install

# 5. Start all three processes (in separate terminals)
npm run dev:server
npm run dev:worker
npm run dev:client

# 6. Authenticate via browser (must use 127.0.0.1, not localhost — Spotify API restriction)
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
| GET | `/liked-sync/status` | Loved-track sync state, counts, and Spotify scope check |
| GET | `/liked-sync/pending` | Resolved matches awaiting review |
| POST | `/liked-sync/scan` | Mirror the Last.fm loved list, then resolve a batch against Spotify |
| POST | `/liked-sync/apply` | Save confirmed matches to the Spotify library, or skip them |
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
npm run migrate       # Apply pending migrations
```

## Client Architecture

The client is a Preact SPA built with Vite (`src/client/`).

- **Config**: `vite.config.ts` (root), `tsconfig.client.json` (separate from server tsconfig)
- **Entry**: `src/client/index.html` → `main.tsx` → `app.tsx`
- **State**: All state lives in `App.tsx` via `useState`, passed as props (2-3 levels deep, no context)
- **Components**: `Header`, `NowPlaying`, `HistoryTab`, `ScrobbleBar`, `ScrobblePreviewModal`, `LikedSyncTab`, `ExplorerTab`
- **API layer**: `api.ts` — typed fetch wrappers for every endpoint
- **Types**: `types.ts` — client-side types mirroring API JSON (does NOT import from `src/shared/`)
- **CSS**: `app.css` — all styles in one file, uses class selectors plus a few IDs for single-instance elements

In development, the Vite dev server (port 5173) proxies all API routes to the Express server (port 3000). In production, Express serves the built client from `dist/client/` with SPA fallback.

## Database Schema

- **`oauth_tokens`** — one row per authenticated Spotify user
- **`tracks`** — normalized track metadata (upserted to keep fresh)
- **`listen_history`** — one row per play event; `UNIQUE(spotify_track_id, played_at)` deduplicates; `scrobbled_at` tracks Last.fm scrobble time; `scrobble_skipped_reason` records why a play was deliberately withheld
- **`poll_state`** — single-row cursor table; `last_played_at_ms` is the `after` param for the next poll
- **`lastfm_sessions`** — Last.fm session key and per-user toggles (`auto_scrobble_enabled`, `now_playing_enabled`, `sanitize_now_playing`)
- **`lastfm_loved_matches`** — mirror of a user's Last.fm loved tracks plus the Spotify track each resolved to; doubles as the resolution cache so re-scans skip resolved rows and remember rejections
- **`schema_migrations`** — one row per applied migration file, with the file's checksum; maintained by `npm run migrate`

### What `played_at` means

Spotify stamps a play with the time it **ended**, not the time it began. Verified
against stored history: the interval between consecutive plays matches the *later*
track's duration in the overwhelming majority of cases, and the earlier track's
only rarely. Two things follow, and the scrobble rules depend on both:

- The interval between consecutive plays is the later track's listen time, which
  makes it an **upper bound** on how much of that track was actually heard. It is
  reliable for proving a track was *not* played through, and never for proving it
  was — an interval longer than the track only means a gap sat somewhere inside it.
- Spotify may log a single listen **more than once**, typically once shortly after
  it starts and again when it ends. Entries for one track spaced closer together
  than that track's duration therefore describe one listen, not several.

Spotify also logs plays lasting only a second or two, so there is no minimum
listening time to rely on before a play appears.

## Migrations

Plain `.sql` files in `migrations/`, applied in filename order by `npm run migrate`. Each file runs inside its own transaction and is recorded in `schema_migrations`, so it applies exactly once.

Migrations are **forward-only** — there are no down scripts. Undo a bad migration with a new migration, or by restoring the database.

The checksum of each applied file is re-verified on every run. Editing a migration that has already run is an error, since the recorded schema would no longer match the repository; add a new migration instead.

`npm run migrate -- --baseline` adopts a database whose schema already matches the migration set, recording every file as applied without running any. It is only valid when nothing has been recorded yet.

Both the server and worker containers run the migrator before starting; a Postgres advisory lock serializes concurrent runs so whichever starts second waits.

## Liked Sync

Copies Last.fm loved tracks into Spotify liked songs. Manually triggered from the Liked
Sync tab, **additive only** — it never unlikes or unloves anything — and every write is
confirmed by the user first. Only this direction exists today; the schema doesn't
preclude the reverse.

A scan is two independent passes, and keeping them separate is the point:

1. **Mirror** — page `user.getLovedTracks` and record every loved track as `pending`,
   without searching. Last.fm reports the true total, so once our row count matches and a
   page adds nothing, a re-scan costs a single request.
2. **Resolve** — take a bounded batch of never-searched rows and search Spotify for each,
   concurrently. This is the expensive pass, so it is budgeted separately.

Matching is the hard part: loved tracks are `(artist, title)` strings with no album,
duration, or usable MBID, so `src/shared/spotify/match.ts` scores candidates on those two
fields alone. It is deliberately conservative — a wrong artist silently adds a stranger's
song to the library, so artist similarity is a hard gate and karaoke/tribute releases are
disqualified outright. All of it is pure and unit-tested; nothing there touches the network.

Statuses on `lastfm_loved_matches`:

| Status | Meaning |
|---|---|
| `pending` | mirrored, and either unsearched or awaiting the user's verdict |
| `synced` | we saved it to the Spotify library |
| `already_liked` | a high-confidence match was already in the library |
| `rejected` | the user declined the match; not offered again |
| `no_match` | nothing acceptable in the catalog; skipped unless a scan sets `retryUnmatched` |

Two invariants worth preserving: a search that *fails* (network, 429, 5xx) must leave the
row unsearched rather than recording `no_match`, or the track is hidden from every future
scan; and `apply` writes to Spotify **before** updating status, so a crash re-offers the
track instead of claiming a save that never happened.

Known gap: un-loving a track on Last.fm leaves its mirrored row behind, since nothing
reaps rows that disappear from the loved list.

## Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app
3. Add `http://127.0.0.1:3000/auth/callback` to Redirect URIs (must use `127.0.0.1`, not `localhost`)
4. Copy Client ID and Client Secret to `.env`

Requested scopes live in `src/shared/spotify/scopes.ts`. The granted scope string is
persisted on `oauth_tokens.scope`, and features check it rather than probing the API.
Spotify only grants scopes through a fresh authorization-code flow — refreshing a token
never widens them — so **adding a scope requires every existing user to reconnect** via
`/auth/login`. A token recorded before scopes were tracked has a NULL scope and is
treated as insufficient.

## Last.fm App Setup

1. Go to https://www.last.fm/api/account/create
2. Create an application
3. Copy API Key and Shared Secret to `.env` as `LASTFM_API_KEY` and `LASTFM_API_SECRET`
4. Connect via the Last.fm section in the web UI

# Scrubbler

A personal Spotify listening history tracker that scrobbles to Last.fm — with automatic tag sanitization to strip remaster and edition suffixes before they hit your profile.

## What it does

- Polls Spotify every minute and stores your listening history to a local PostgreSQL database
- Shows a live now-playing bar with the current track
- Scrobbles plays to Last.fm automatically (auto-scrobble) or manually via the history browser
- Sanitizes track and album names before scrobbling — strips noise like *(2021 Remaster)*, *[Deluxe Edition]*, *- Live*, etc.
- Lets you toggle sanitization independently for now-playing vs. scrobbling

## Stack

TypeScript · Node.js · Express · PostgreSQL · Docker

## Setup

### 1. Spotify

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app
2. Add `http://localhost:3000/auth/callback` to the app's Redirect URIs
3. Note your Client ID and Client Secret

### 2. Last.fm (optional)

1. Create an API account at https://www.last.fm/api/account/create
2. Note your API Key and Shared Secret

### 3. Run it

```bash
# Start PostgreSQL
docker compose up -d

# Configure environment
cp .env.example .env
# Fill in SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, OAUTH_STATE_SECRET
# Optionally add LASTFM_API_KEY, LASTFM_API_SECRET

# Install dependencies
npm install

# Start server and worker (separate terminals)
npm run dev:server
npm run dev:worker

# Authenticate
open http://localhost:3000/auth/login
```

Then connect Last.fm from the web UI if desired.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SPOTIFY_CLIENT_ID` | Yes | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | From Spotify Developer Dashboard |
| `OAUTH_STATE_SECRET` | Yes | Random secret for OAuth CSRF protection |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LASTFM_API_KEY` | No | Enables Last.fm scrobbling |
| `LASTFM_API_SECRET` | No | Required alongside API key |
| `PORT` | No | HTTP server port (default: `3000`) |
| `POLL_INTERVAL_MS` | No | Polling interval in ms (default: `60000`) |

## Tag Sanitization

Scrubbler strips common suffixes from track and album names before they reach Last.fm. Examples of what gets removed:

- `(2021 Remaster)` / `- Remastered` / `- 2021 Yoshinori Sunahara Remastering`
- `[Deluxe Edition]` / `(Special Edition)`
- `- Live` / `(Radio Edit)` / `(Bonus Track Version)`
- `(Stereo Mix)` / `(Mono)`

The now-playing bar in the UI shows both the original and sanitized name side-by-side so you can see exactly what will be sent.

-- OAuth tokens: one row per Spotify user
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id              SERIAL PRIMARY KEY,
  spotify_user_id TEXT        NOT NULL UNIQUE,
  access_token    TEXT        NOT NULL,
  refresh_token   TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalized track metadata keyed by Spotify track ID
CREATE TABLE IF NOT EXISTS tracks (
  spotify_track_id TEXT        PRIMARY KEY,
  name             TEXT        NOT NULL,
  artist_name      TEXT        NOT NULL,
  album_name       TEXT        NOT NULL,
  duration_ms      INTEGER     NOT NULL,
  external_url     TEXT,
  preview_url      TEXT,
  image_url        TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per play event; deduplication via UNIQUE constraint
CREATE TABLE IF NOT EXISTS listen_history (
  id               BIGSERIAL   PRIMARY KEY,
  spotify_track_id TEXT        NOT NULL REFERENCES tracks(spotify_track_id),
  spotify_user_id  TEXT        NOT NULL,
  played_at        TIMESTAMPTZ NOT NULL,
  UNIQUE (spotify_track_id, played_at)
);

CREATE INDEX IF NOT EXISTS listen_history_played_at_idx
  ON listen_history (played_at DESC);

-- Single-row cursor table for the polling worker
CREATE TABLE IF NOT EXISTS poll_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  last_played_at_ms  BIGINT,
  last_polled_at     TIMESTAMPTZ
);

-- Pre-seed the single row so workers can always UPDATE instead of INSERT
INSERT INTO poll_state (id, last_played_at_ms, last_polled_at)
VALUES (1, NULL, NULL)
ON CONFLICT DO NOTHING;

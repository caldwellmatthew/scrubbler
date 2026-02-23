CREATE TABLE IF NOT EXISTS lastfm_sessions (
  id          SERIAL      PRIMARY KEY,
  username    TEXT        NOT NULL,
  session_key TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE listen_history
  ADD COLUMN IF NOT EXISTS scrobbled_at TIMESTAMPTZ;

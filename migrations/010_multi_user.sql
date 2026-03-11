-- Multi-user support migration

-- 1. Fix listen_history dedup constraint to be per-user
ALTER TABLE listen_history DROP CONSTRAINT IF EXISTS listen_history_spotify_track_id_played_at_key;
ALTER TABLE listen_history ADD CONSTRAINT listen_history_user_track_played_at_key
  UNIQUE (spotify_user_id, spotify_track_id, played_at);

-- 2. Drop old single-row poll_state and recreate with per-user rows
DROP TABLE IF EXISTS poll_state;
CREATE TABLE poll_state (
  spotify_user_id   TEXT        PRIMARY KEY,
  last_played_at_ms BIGINT,
  last_polled_at    TIMESTAMPTZ,
  poll_enabled      BOOLEAN     NOT NULL DEFAULT TRUE
);

-- 3. Add spotify_user_id to lastfm_sessions
ALTER TABLE lastfm_sessions
  ADD COLUMN IF NOT EXISTS spotify_user_id TEXT;

-- Backfill spotify_user_id from oauth_tokens (single-user case: take the first token)
UPDATE lastfm_sessions ls
SET spotify_user_id = (SELECT spotify_user_id FROM oauth_tokens LIMIT 1)
WHERE ls.spotify_user_id IS NULL;

-- Delete any rows that couldn't be backfilled
DELETE FROM lastfm_sessions WHERE spotify_user_id IS NULL;

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE lastfm_sessions ALTER COLUMN spotify_user_id SET NOT NULL;
ALTER TABLE lastfm_sessions DROP CONSTRAINT IF EXISTS lastfm_sessions_spotify_user_id_key;
ALTER TABLE lastfm_sessions ADD CONSTRAINT lastfm_sessions_spotify_user_id_key UNIQUE (spotify_user_id);

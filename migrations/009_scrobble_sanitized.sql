ALTER TABLE listen_history
  ADD COLUMN IF NOT EXISTS scrobble_sanitized BOOLEAN;

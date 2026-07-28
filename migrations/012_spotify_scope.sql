-- Record the scopes Spotify actually granted, so features gated on a scope can
-- tell "not granted" from "granted". Nullable with no backfill: rows written
-- before this migration have an unknown grant, which callers must treat as
-- insufficient and resolve by sending the user back through /auth/login.
ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS scope TEXT;

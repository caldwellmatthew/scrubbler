ALTER TABLE oauth_tokens
  ADD COLUMN IF NOT EXISTS display_name TEXT;

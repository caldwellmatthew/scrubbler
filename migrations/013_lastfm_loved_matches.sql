-- Mirror of a user's Last.fm loved tracks, plus the Spotify track each one was
-- resolved to. Every loved track gets a row whether or not it was ever acted
-- on, so the table doubles as the resolution cache: re-scanning skips anything
-- already searched, and user rejections are remembered.
--
-- Only the Last.fm -> Spotify direction is populated today. The reverse
-- direction would either widen this table or add a sibling; nothing here
-- assumes a single direction beyond which columns get filled in.
CREATE TABLE IF NOT EXISTS lastfm_loved_matches (
  id                   BIGSERIAL   PRIMARY KEY,
  spotify_user_id      TEXT        NOT NULL,
  lastfm_username      TEXT        NOT NULL,
  lastfm_artist        TEXT        NOT NULL,
  lastfm_track         TEXT        NOT NULL,
  loved_at             TIMESTAMPTZ,
  status               TEXT        NOT NULL DEFAULT 'pending',

  -- The resolved Spotify track. Deliberately not a foreign key to tracks:
  -- that table means "a track we have listen history for" and the poller is
  -- its only writer, so search results are denormalized here instead.
  spotify_track_id     TEXT,
  spotify_track_name   TEXT,
  spotify_artist_names TEXT[],
  spotify_album_name   TEXT,
  spotify_image_url    TEXT,
  spotify_external_url TEXT,
  spotify_duration_ms  INTEGER,

  match_score          REAL,
  -- Runner-up candidates, so the review UI can offer alternate versions and
  -- the apply step can validate a client-chosen track against a known set.
  candidates           JSONB       NOT NULL DEFAULT '[]'::jsonb,

  searched_at          TIMESTAMPTZ,
  synced_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Keyed by Last.fm account as well as Spotify user: connecting a different
  -- Last.fm account must not collide with rows mirrored from the previous one.
  CONSTRAINT lastfm_loved_matches_natural_key
    UNIQUE (spotify_user_id, lastfm_username, lastfm_artist, lastfm_track),

  -- synced (we saved it) and already_liked (it was there) are distinct
  -- outcomes; no_match is soft-terminal and revisited on an explicit retry.
  CONSTRAINT lastfm_loved_matches_status_check
    CHECK (status IN ('pending', 'synced', 'already_liked', 'rejected', 'no_match'))
);

CREATE INDEX IF NOT EXISTS lastfm_loved_matches_user_status_idx
  ON lastfm_loved_matches (spotify_user_id, status);

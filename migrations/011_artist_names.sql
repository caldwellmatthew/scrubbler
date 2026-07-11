-- Store artists as an ordered array (primary artist first); the display
-- string is derived at read time with array_to_string.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artist_names TEXT[];

-- Backfill from the legacy comma-joined string, then drop it. Artist names
-- that themselves contain ", " are mis-split by this; on a database with
-- pre-existing rows, multi-element arrays should be re-verified against the
-- Spotify API (see the backfill script in this migration's introducing
-- commit, retired after it ran).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracks' AND column_name = 'artist_name'
  ) THEN
    UPDATE tracks SET artist_names = string_to_array(artist_name, ', ')
    WHERE artist_names IS NULL;
    ALTER TABLE tracks DROP COLUMN artist_name;
  END IF;
END $$;

ALTER TABLE tracks ALTER COLUMN artist_names SET NOT NULL;

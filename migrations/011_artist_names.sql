-- Store artists as an ordered array (primary artist first); the display
-- string is derived at read time with array_to_string.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artist_names TEXT[];

-- Backfill from the legacy comma-joined string, then drop it. Artist names
-- that themselves contain ", " are mis-split by this; run the backfill
-- script (npm run backfill:artists) afterwards to correct multi-artist rows
-- from the Spotify API.
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

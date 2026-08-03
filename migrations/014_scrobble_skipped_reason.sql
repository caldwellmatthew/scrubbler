-- Why a play was deliberately not sent to Last.fm. NULL means it was never
-- skipped: either it was scrobbled, or nothing has looked at it yet.
--
-- Without this, a skipped play is indistinguishable from one that was never
-- attempted. The duplicate rule only lets a play stand in for the listen a
-- later entry repeats once that listen is accounted for, so a run of three or
-- more entries would scrobble its tail a second time — the skipped middle
-- entry looks unaccounted for. Recording the skip closes that.
--
-- 014 rather than 012: numbers below it are claimed by migrations not yet
-- merged to main.
ALTER TABLE listen_history
  ADD COLUMN IF NOT EXISTS scrobble_skipped_reason TEXT;

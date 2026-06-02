ALTER TABLE adhd_tracker.time_blocks
  ADD COLUMN IF NOT EXISTS mood text
  CHECK (mood IS NULL OR mood IN ('fire', 'ok', 'swamp'));

NOTIFY pgrst, 'reload schema';

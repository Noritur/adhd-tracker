ALTER TABLE adhd_tracker.time_blocks
  ADD COLUMN IF NOT EXISTS notified_ending_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_started_at timestamptz;

NOTIFY pgrst, 'reload schema';

ALTER TABLE adhd_tracker.profiles
  ADD COLUMN IF NOT EXISTS last_proactive_at timestamptz;

NOTIFY pgrst, 'reload schema';

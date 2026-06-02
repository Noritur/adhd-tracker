alter table adhd_tracker.profiles
add column if not exists last_morning_nudge_at timestamptz;

comment on column adhd_tracker.profiles.last_morning_nudge_at is
'Last time the morning planner nudge push was sent. Used for atomic per-day idempotency claim against duplicate cron firings.';

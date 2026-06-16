alter table adhd_tracker.week_summaries
  add column user_note text,
  add column advice text,
  add column advice_json jsonb;

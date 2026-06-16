create table adhd_tracker.week_summaries (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  summary text not null,
  raw_json jsonb,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

alter table adhd_tracker.week_summaries enable row level security;

create policy "own week summaries" on adhd_tracker.week_summaries
  for all using (auth.uid() = user_id);

grant usage on schema adhd_tracker to authenticated;
grant all on adhd_tracker.week_summaries to authenticated;
grant all on adhd_tracker.week_summaries to service_role;
grant usage, select on all sequences in schema adhd_tracker to authenticated;
grant usage, select on all sequences in schema adhd_tracker to service_role;

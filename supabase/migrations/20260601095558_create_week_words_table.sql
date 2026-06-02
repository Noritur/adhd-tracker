create table adhd_tracker.week_words (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  word text not null,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

alter table adhd_tracker.week_words enable row level security;

create policy "own week words"
  on adhd_tracker.week_words
  for all
  using (auth.uid() = user_id);

grant usage on schema adhd_tracker to authenticated;
grant all on adhd_tracker.week_words to authenticated;
grant all on adhd_tracker.week_words to service_role;
grant usage, select on all sequences in schema adhd_tracker to authenticated;
grant usage, select on all sequences in schema adhd_tracker to service_role;

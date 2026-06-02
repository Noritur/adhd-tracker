create schema if not exists adhd_tracker;

create table adhd_tracker.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Madrid',
  work_hours_start time not null default '09:00',
  work_hours_end time not null default '18:00',
  ai_tone text not null default 'gentle' check (ai_tone in ('firm', 'gentle')),
  evening_review_at time not null default '21:00',
  evening_review_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table adhd_tracker.time_blocks (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  category text not null check (category in (
    'coded', 'work_other', 'sport', 'outdoors',
    'social', 'rest', 'chores', 'other'
  )),
  label text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index time_blocks_user_day_idx on adhd_tracker.time_blocks (user_id, start_at desc);

create table adhd_tracker.insights_cache (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('today', 'week')),
  for_date date not null,
  content text not null,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, scope, for_date)
);

create table adhd_tracker.reviews (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  for_date date not null,
  summary text,
  recommendation text,
  raw_json jsonb,
  user_response text check (user_response in ('ok', 'skip', 'not_today')),
  created_at timestamptz not null default now(),
  unique (user_id, for_date)
);

alter table adhd_tracker.profiles enable row level security;
alter table adhd_tracker.time_blocks enable row level security;
alter table adhd_tracker.insights_cache enable row level security;
alter table adhd_tracker.reviews enable row level security;

create policy "own profile select" on adhd_tracker.profiles
  for select using (auth.uid() = id);
create policy "own profile insert" on adhd_tracker.profiles
  for insert with check (auth.uid() = id);
create policy "own profile update" on adhd_tracker.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "own blocks select" on adhd_tracker.time_blocks
  for select using (auth.uid() = user_id);
create policy "own blocks insert" on adhd_tracker.time_blocks
  for insert with check (auth.uid() = user_id);
create policy "own blocks update" on adhd_tracker.time_blocks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own blocks delete" on adhd_tracker.time_blocks
  for delete using (auth.uid() = user_id);

create policy "own insights select" on adhd_tracker.insights_cache
  for select using (auth.uid() = user_id);
create policy "own insights insert" on adhd_tracker.insights_cache
  for insert with check (auth.uid() = user_id);

create policy "own reviews select" on adhd_tracker.reviews
  for select using (auth.uid() = user_id);
create policy "own reviews update" on adhd_tracker.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema adhd_tracker to anon, authenticated;
grant select, insert, update, delete on all tables in schema adhd_tracker to authenticated;
grant usage, select on all sequences in schema adhd_tracker to authenticated;

create or replace function adhd_tracker.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, adhd_tracker
as $$
begin
  insert into adhd_tracker.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function adhd_tracker.handle_new_user();

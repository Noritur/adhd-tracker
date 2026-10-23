-- The parts of a Supabase project that the migrations in supabase/migrations
-- rely on: the API roles, auth.users and auth.uid(). Enough to replay the
-- schema on plain Postgres and exercise RLS the way PostgREST does, by
-- switching role and setting the JWT subject for the transaction.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text
);

-- Same definition as on the live project. PostgREST sets request.jwt.claims.
create function auth.uid() returns uuid
language sql stable
as $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;

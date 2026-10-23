-- Fingerprint of the adhd_tracker schema: one hash per kind of object
-- (policies, grants, RLS flags, constraints, columns, function privileges,
-- the signup trigger). Run it on the replayed test database and on the live
-- project; equal hashes mean the migrations in git describe what is deployed.
-- Read-only.

with lines as (
  select 'policy' as kind, tablename || ' ' || policyname || ' ' || cmd || ' roles=' || array_to_string(roles, ',') || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '') as line
  from pg_policies where schemaname = 'adhd_tracker'
  union all
  select 'grant', c.relname || ' ' || coalesce(g.rolname, 'PUBLIC') || ' ' || string_agg(a.privilege_type, ',' order by a.privilege_type)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  left join pg_roles g on g.oid = a.grantee
  where n.nspname = 'adhd_tracker' and c.relkind = 'r' and (g.rolname in ('anon', 'authenticated', 'service_role') or a.grantee = 0)
  group by c.relname, g.rolname
  union all
  select 'rls', c.relname || ' enabled=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'adhd_tracker' and c.relkind = 'r'
  union all
  select 'constraint', conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
  from pg_constraint where connamespace = 'adhd_tracker'::regnamespace
  union all
  select 'column', table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '')
  from information_schema.columns where table_schema = 'adhd_tracker'
  union all
  select 'privilege', r.rolname || ' exec handle_new_user=' || has_function_privilege(r.rolname, 'adhd_tracker.handle_new_user()', 'execute') || ' usage schema=' || has_schema_privilege(r.rolname, 'adhd_tracker', 'usage')
  from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role')
  union all
  select 'trigger', tgrelid::regclass::text || ' ' || tgname || ' ' || tgfoid::regproc::text
  from pg_trigger where tgfoid = 'adhd_tracker.handle_new_user'::regproc and not tgisinternal
)
select kind, count(*) as n, md5(string_agg(line, E'\n' order by line)) as hash
from lines group by kind order by kind;

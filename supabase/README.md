# Supabase schema

This directory mirrors the migrations applied to the live Supabase project
(`dxbzqvwoxfyegddecdbd`, schema `adhd_tracker`) so reviewers can reproduce
the backend from git.

## Apply to a fresh project

```bash
# Link an empty Supabase project (CLI installed locally)
supabase link --project-ref <your-project-ref>

# Apply all migrations in order
supabase db push
```

Or, manually via the SQL editor — paste each `migrations/*.sql` file in
chronological order (filename prefix is the timestamp).

## Schema overview

All app data lives in the custom `adhd_tracker` schema (not `public`).
RLS is enabled on every table with `auth.uid() = user_id` policies.
The `service_role` is granted explicitly for cron fan-out queries.

### Tables
- `profiles` — one row per `auth.users.id`, auto-inserted by the
  `handle_new_user()` trigger. Carries timezone, work hours, AI tone,
  rest days, evening review preferences, push idempotency timestamps.
- `time_blocks` — the calendar. `tstzrange(start_at, end_at, '[)')` is
  protected by a btree_gist exclusion constraint
  (`time_blocks_no_overlap`) so blocks can never overlap for the same
  user, no matter the write path.
- `insights_cache` — 2h TTL store keyed on `(user_id, scope, for_date)`.
  Invalidated server-side on any block/mood/profile write.
- `reviews` — one row per (user, date) with AI summary + recommendation
  and the user's reaction (ok/skip/not_today).
- `week_words` — episodic-memory anchor: one short phrase per (user, week).
- `push_subscriptions` — Web Push endpoints, auto-cleaned on 404/410.

### Trigger
- `handle_new_user()` runs `after insert on auth.users`, creates the
  profile row. `security definer`, fixed search_path, no execute grant
  to anon/authenticated.

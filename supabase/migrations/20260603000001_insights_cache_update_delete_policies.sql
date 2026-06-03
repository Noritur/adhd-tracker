-- Phase B's B6 (cache invalidation + upsert race-fix) silently failed
-- because the original migration only granted SELECT and INSERT policies.
-- User-session client invocations of upsert (UPDATE on conflict) and
-- delete (invalidate) were denied by RLS, falling through to logged
-- warnings and leaving stale insights in place for up to 2h after any
-- block/mood/profile write.
create policy "own insights update"
on adhd_tracker.insights_cache
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "own insights delete"
on adhd_tracker.insights_cache
for delete
using (auth.uid() = user_id);

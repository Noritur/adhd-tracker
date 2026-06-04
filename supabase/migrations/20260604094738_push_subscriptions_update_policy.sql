-- Same root cause as C1 (insights_cache): upsert via user-session
-- client needs both INSERT and UPDATE policies, but only INSERT/SELECT/
-- DELETE were created originally. `upsertSubscription()` uses
-- onConflict: "endpoint" so re-subscribing from the same browser (key
-- rotation, re-enabling notifications) tries UPDATE → silently denied.
--
-- Predicate matches the other own-row policies on the table.
create policy "Users update their own subscriptions"
  on adhd_tracker.push_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

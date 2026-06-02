-- Trigger helpers should not be exposed as callable RPC. Even though
-- handle_new_user() returns trigger (so direct rpc() probably errors),
-- supabase advisor flags exposed security-definer functions. Tighten it.
revoke execute on function adhd_tracker.handle_new_user() from anon, authenticated;

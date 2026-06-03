-- B11 attempted REVOKE FROM anon, authenticated but postgres functions
-- carry an implicit PUBLIC execute grant. The revoke on specific roles
-- left the PUBLIC grant intact, so supabase advisor kept flagging the
-- function as executable by anon/authenticated.
--
-- Correct fix: revoke from PUBLIC, then the role-specific revoke is
-- redundant (no inherited grant left to strip).
revoke execute on function adhd_tracker.handle_new_user() from public;

GRANT SELECT, INSERT, UPDATE, DELETE ON adhd_tracker.push_subscriptions TO authenticated;
GRANT USAGE ON SEQUENCE adhd_tracker.push_subscriptions_id_seq TO authenticated;
NOTIFY pgrst, 'reload schema';

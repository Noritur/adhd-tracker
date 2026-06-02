CREATE TABLE IF NOT EXISTS adhd_tracker.push_subscriptions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON adhd_tracker.push_subscriptions (user_id);

ALTER TABLE adhd_tracker.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select their own subscriptions"
  ON adhd_tracker.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own subscriptions"
  ON adhd_tracker.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own subscriptions"
  ON adhd_tracker.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT ALL ON adhd_tracker.push_subscriptions TO service_role;
GRANT ALL ON SEQUENCE adhd_tracker.push_subscriptions_id_seq TO service_role;

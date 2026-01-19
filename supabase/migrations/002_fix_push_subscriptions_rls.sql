-- Fix RLS policies for he_push_subscriptions
-- The app uses anonymous key, not authenticated users, so we need to allow inserts
-- based on user_id existing in he_time_users table

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON he_push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON he_push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON he_push_subscriptions;
DROP POLICY IF EXISTS "Service role can delete subscriptions" ON he_push_subscriptions;

-- Create new policies that work with anonymous key
-- Allow insert if user_id exists in he_time_users and user is active
CREATE POLICY "Allow insert for valid users"
  ON he_push_subscriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM he_time_users
      WHERE he_time_users.id = he_push_subscriptions.user_id
      AND he_time_users.is_active = true
    )
    OR auth.role() = 'service_role'
  );

-- Allow update if user_id exists in he_time_users and user is active
CREATE POLICY "Allow update for valid users"
  ON he_push_subscriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM he_time_users
      WHERE he_time_users.id = he_push_subscriptions.user_id
      AND he_time_users.is_active = true
    )
    OR auth.role() = 'service_role'
  );

-- Allow select if user_id exists in he_time_users and user is active
CREATE POLICY "Allow select for valid users"
  ON he_push_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM he_time_users
      WHERE he_time_users.id = he_push_subscriptions.user_id
      AND he_time_users.is_active = true
    )
    OR auth.role() = 'service_role'
  );

-- Allow service role to delete subscriptions (for cleanup)
CREATE POLICY "Service role can delete subscriptions"
  ON he_push_subscriptions
  FOR DELETE
  USING (auth.role() = 'service_role');



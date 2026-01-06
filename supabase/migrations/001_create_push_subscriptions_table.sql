-- Create table for storing push notification subscriptions
CREATE TABLE IF NOT EXISTS he_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES he_time_users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON he_push_subscriptions(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON he_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS (Row Level Security) policies
-- Note: Edge Function uses service role key which bypasses RLS
-- These policies are for direct client access only

ALTER TABLE he_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own subscriptions
CREATE POLICY "Users can insert their own subscriptions"
  ON he_push_subscriptions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR
    auth.role() = 'service_role'
  );

-- Allow authenticated users to update their own subscriptions
CREATE POLICY "Users can update their own subscriptions"
  ON he_push_subscriptions
  FOR UPDATE
  USING (
    auth.uid() = user_id OR
    auth.role() = 'service_role'
  );

-- Allow authenticated users to view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON he_push_subscriptions
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.role() = 'service_role'
  );

-- Allow service role to delete subscriptions (for cleanup)
CREATE POLICY "Service role can delete subscriptions"
  ON he_push_subscriptions
  FOR DELETE
  USING (auth.role() = 'service_role');


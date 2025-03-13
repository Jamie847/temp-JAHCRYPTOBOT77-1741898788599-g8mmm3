-- Drop existing policies
DROP POLICY IF EXISTS "Public read access" ON telegram_channels;
DROP POLICY IF EXISTS "Public write access" ON telegram_channels;
DROP POLICY IF EXISTS "Public update access" ON telegram_channels;
DROP POLICY IF EXISTS "Public delete access" ON telegram_channels;

-- Create single policy for full access
CREATE POLICY "Allow full access"
  ON telegram_channels
  USING (true)
  WITH CHECK (true);

-- Make sure RLS is enabled
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;
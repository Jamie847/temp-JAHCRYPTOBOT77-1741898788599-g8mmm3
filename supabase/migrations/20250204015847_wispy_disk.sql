-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read telegram channels" ON telegram_channels;
DROP POLICY IF EXISTS "Allow authenticated users to insert telegram channels" ON telegram_channels;
DROP POLICY IF EXISTS "Allow authenticated users to update telegram channels" ON telegram_channels;
DROP POLICY IF EXISTS "Allow authenticated users to delete telegram channels" ON telegram_channels;
DROP POLICY IF EXISTS "Public read access" ON telegram_channels;
DROP POLICY IF EXISTS "Public write access" ON telegram_channels;

-- Create new policies for public access
CREATE POLICY "Public read access"
  ON telegram_channels FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public write access"
  ON telegram_channels FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public update access"
  ON telegram_channels FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Public delete access"
  ON telegram_channels FOR DELETE
  TO public
  USING (true);

-- Enable RLS
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;
/*
  # Fix tokens table RLS policies
  
  1. Changes
    - Add insert policy for tokens table
    - Add update policy for tokens table
    - Add delete policy for tokens table
  
  2. Security
    - Ensure proper RLS policies for all operations
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read tokens" ON tokens;
DROP POLICY IF EXISTS "Allow authenticated users to insert tokens" ON tokens;
DROP POLICY IF EXISTS "Allow authenticated users to update tokens" ON tokens;
DROP POLICY IF EXISTS "Allow authenticated users to delete tokens" ON tokens;

-- Create new policies
CREATE POLICY "Allow authenticated users to read tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert tokens"
  ON tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update tokens"
  ON tokens FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete tokens"
  ON tokens FOR DELETE
  TO authenticated
  USING (true);
/*
  # Fix bot status table schema and initialization

  1. Changes
    - Drop and recreate bot_status table with proper schema
    - Add proper RLS policies
    - Add updated_at trigger
    - Add initial bot status record

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Drop existing bot_status table if it exists
DROP TABLE IF EXISTS bot_status;

-- Create bot_status table with integer ID
CREATE TABLE bot_status (
  id integer PRIMARY KEY,
  is_running boolean DEFAULT false,
  last_started timestamptz,
  last_stopped timestamptz,
  active_positions integer DEFAULT 0,
  pending_orders integer DEFAULT 0,
  total_pnl decimal DEFAULT 0,
  win_rate decimal DEFAULT 0,
  total_trades integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read bot status"
  ON bot_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to update bot status"
  ON bot_status FOR UPDATE
  TO authenticated
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_bot_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bot_status_updated_at
  BEFORE UPDATE ON bot_status
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_status_updated_at();

-- Insert initial bot status
INSERT INTO bot_status (id, is_running, active_positions, pending_orders)
VALUES (1, false, 0, 0)
ON CONFLICT (id) DO NOTHING;
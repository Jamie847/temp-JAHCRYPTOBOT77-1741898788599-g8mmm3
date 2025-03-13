/*
  # Update bot status table schema
  
  1. Changes
    - Change bot_status table ID from UUID to serial
    - Keep existing columns and constraints
    - Maintain RLS policies
  
  2. Security
    - Maintain existing RLS policies
    - Keep authenticated user access
*/

-- Drop existing bot_status table if it exists
DROP TABLE IF EXISTS bot_status;

-- Create bot_status table with serial ID
CREATE TABLE bot_status (
  id serial PRIMARY KEY,
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
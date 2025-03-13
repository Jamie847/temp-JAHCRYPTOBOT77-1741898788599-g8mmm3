/*
  # Create Bot Status Table with Policy Checks

  1. New Tables
    - `bot_status`
      - `id` (integer, primary key)
      - `is_running` (boolean)
      - `active_positions` (integer)
      - `pending_orders` (integer)
      - `last_started` (timestamp)
      - `last_stopped` (timestamp)
      - `total_pnl` (numeric)
      - `win_rate` (numeric)
      - `total_trades` (integer)
      - `error` (text)
      - `service_status` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS
    - Add policies with existence checks
*/

-- Create bot_status table if it doesn't exist
CREATE TABLE IF NOT EXISTS bot_status (
  id integer PRIMARY KEY,
  is_running boolean DEFAULT false,
  active_positions integer DEFAULT 0,
  pending_orders integer DEFAULT 0,
  last_started timestamptz,
  last_stopped timestamptz,
  total_pnl numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  total_trades integer DEFAULT 0,
  error text,
  service_status jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS if not already enabled
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'bot_status' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE bot_status ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies with existence checks
DO $$ 
BEGIN
  -- Select policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_status' 
    AND policyname = 'Allow authenticated users to read bot status'
  ) THEN
    CREATE POLICY "Allow authenticated users to read bot status"
      ON bot_status
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- Update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_status' 
    AND policyname = 'Allow authenticated users to update bot status'
  ) THEN
    CREATE POLICY "Allow authenticated users to update bot status"
      ON bot_status
      FOR UPDATE
      TO authenticated
      USING (true);
  END IF;

  -- Insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_status' 
    AND policyname = 'Allow authenticated users to insert bot status'
  ) THEN
    CREATE POLICY "Allow authenticated users to insert bot status"
      ON bot_status
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  -- Delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bot_status' 
    AND policyname = 'Allow authenticated users to delete bot status'
  ) THEN
    CREATE POLICY "Allow authenticated users to delete bot status"
      ON bot_status
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Add updated_at trigger if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_bot_status_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION update_bot_status_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER update_bot_status_updated_at
      BEFORE UPDATE ON bot_status
      FOR EACH ROW
      EXECUTE FUNCTION update_bot_status_updated_at();
  END IF;
END $$;

-- Insert initial status if it doesn't exist
INSERT INTO bot_status (id, is_running, active_positions, pending_orders)
VALUES (1, false, 0, 0)
ON CONFLICT (id) DO NOTHING;
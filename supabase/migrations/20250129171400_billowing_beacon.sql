/*
  # Fix column names and add missing tables
  
  1. Changes
    - Add relative_strength table
    - Fix column names to use snake_case consistently
    - Add missing indexes
  
  2. Security
    - Enable RLS on new table
    - Add policies for authenticated users
*/

-- Create relative_strength table
CREATE TABLE IF NOT EXISTS relative_strength (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price DECIMAL NOT NULL,
  btc_ratio DECIMAL NOT NULL,
  dominance_score DECIMAL NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE relative_strength ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read relative strength"
  ON relative_strength FOR SELECT
  TO authenticated
  USING (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_relative_strength_symbol ON relative_strength(symbol);
CREATE INDEX IF NOT EXISTS idx_relative_strength_timestamp ON relative_strength(timestamp);

-- Fix column names in positions if they don't exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'openedAt'
  ) THEN
    ALTER TABLE positions RENAME COLUMN "openedAt" TO opened_at;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'closedAt'
  ) THEN
    ALTER TABLE positions RENAME COLUMN "closedAt" TO closed_at;
  END IF;
END $$;
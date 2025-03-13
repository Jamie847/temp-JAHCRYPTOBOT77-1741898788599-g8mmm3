/*
  # Add positions table for trading bot

  1. New Tables
    - `positions`
      - `id` (uuid, primary key)
      - `symbol` (text)
      - `exchange` (text)
      - `side` (text)
      - `entry_price` (decimal)
      - `quantity` (decimal)
      - `stop_loss` (decimal)
      - `take_profit` (decimal)
      - `status` (text)
      - `pnl` (decimal)
      - `opened_at` (timestamptz)
      - `closed_at` (timestamptz)
      - `strategy` (text)
      - `confidence` (decimal)
      - `chain` (text)

  2. Security
    - Enable RLS on `positions` table
    - Add policies for authenticated users to read their own positions
*/

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price DECIMAL NOT NULL,
  quantity DECIMAL NOT NULL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  status TEXT NOT NULL,
  pnl DECIMAL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  strategy TEXT NOT NULL,
  confidence DECIMAL NOT NULL,
  chain TEXT NOT NULL DEFAULT 'evm',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read positions"
  ON positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert positions"
  ON positions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update their positions"
  ON positions FOR UPDATE
  TO authenticated
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
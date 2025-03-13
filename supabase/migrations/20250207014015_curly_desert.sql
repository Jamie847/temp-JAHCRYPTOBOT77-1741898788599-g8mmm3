/*
  # Add Raydium trending tokens table

  1. New Tables
    - `raydium_trending_tokens`
      - `address` (text, primary key)
      - `symbol` (text)
      - `name` (text)
      - `volume_24h` (decimal)
      - `liquidity` (decimal)
      - `price_impact` (decimal)
      - `momentum_score` (decimal)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create raydium_trending_tokens table
CREATE TABLE IF NOT EXISTS raydium_trending_tokens (
  address text PRIMARY KEY,
  symbol text NOT NULL,
  name text NOT NULL,
  volume_24h decimal NOT NULL,
  liquidity decimal NOT NULL,
  price_impact decimal NOT NULL,
  momentum_score decimal NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE raydium_trending_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read trending tokens"
  ON raydium_trending_tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert trending tokens"
  ON raydium_trending_tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update trending tokens"
  ON raydium_trending_tokens FOR UPDATE
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_raydium_trending_volume ON raydium_trending_tokens(volume_24h);
CREATE INDEX IF NOT EXISTS idx_raydium_trending_liquidity ON raydium_trending_tokens(liquidity);
CREATE INDEX IF NOT EXISTS idx_raydium_trending_momentum ON raydium_trending_tokens(momentum_score);
CREATE INDEX IF NOT EXISTS idx_raydium_trending_updated ON raydium_trending_tokens(updated_at);
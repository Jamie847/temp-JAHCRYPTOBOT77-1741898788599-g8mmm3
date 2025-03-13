/*
  # Add Market Regimes Table

  1. New Tables
    - market_regimes: Stores market regime data and transitions
      - id (uuid, primary key)
      - symbol (text)
      - regime (text)
      - confidence (decimal)
      - metrics (jsonb)
      - signals (jsonb)
      - timestamp (timestamptz)

  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create market_regimes table
CREATE TABLE IF NOT EXISTS market_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  regime text NOT NULL,
  confidence decimal NOT NULL,
  metrics jsonb NOT NULL,
  signals jsonb NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_market_regimes_symbol ON market_regimes(symbol);
CREATE INDEX IF NOT EXISTS idx_market_regimes_timestamp ON market_regimes(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_regimes_regime ON market_regimes(regime);

-- Enable Row Level Security
ALTER TABLE market_regimes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read market regimes"
  ON market_regimes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert market regimes"
  ON market_regimes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE market_regimes IS 'Stores market regime data and transitions';
COMMENT ON COLUMN market_regimes.regime IS 'Current market regime (low_volatility, high_volatility, trending, ranging, crisis)';
COMMENT ON COLUMN market_regimes.confidence IS 'Confidence score for the regime classification';
COMMENT ON COLUMN market_regimes.metrics IS 'Metrics used to determine the regime';
COMMENT ON COLUMN market_regimes.signals IS 'Trading signals associated with the regime';
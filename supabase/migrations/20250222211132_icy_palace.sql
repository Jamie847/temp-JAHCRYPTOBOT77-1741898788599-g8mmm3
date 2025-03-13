/*
  # Enhanced Monitoring Schema Update

  1. New Tables
    - token_holder_history: Track holder count over time
    - token_holder_distribution: Track token distribution metrics
    - funding_rates: Store perpetual funding rates
    - open_interest: Track perpetual open interest
    - position_data: Store position-related metrics
    - token_transactions: Track large transactions
    - whale_activity: Store whale monitoring metrics

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Create token_holder_history table
CREATE TABLE IF NOT EXISTS token_holder_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  holder_count integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create token_holder_distribution table
CREATE TABLE IF NOT EXISTS token_holder_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  top_10_percentage decimal NOT NULL,
  top_50_percentage decimal NOT NULL,
  top_100_percentage decimal NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create funding_rates table
CREATE TABLE IF NOT EXISTS funding_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  rate decimal NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create open_interest table
CREATE TABLE IF NOT EXISTS open_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  amount decimal NOT NULL,
  usd_value decimal NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create position_data table
CREATE TABLE IF NOT EXISTS position_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  long_value decimal NOT NULL,
  short_value decimal NOT NULL,
  total_notional decimal NOT NULL,
  total_collateral decimal NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create token_transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  signature text NOT NULL,
  wallet_address text NOT NULL,
  amount decimal NOT NULL,
  usd_value decimal NOT NULL,
  is_buy boolean NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create whale_activity table
CREATE TABLE IF NOT EXISTS whale_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  net_flow_24h decimal NOT NULL,
  whale_count integer NOT NULL,
  confidence decimal NOT NULL,
  signals jsonb NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE token_holder_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_holder_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whale_activity ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access"
  ON token_holder_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON token_holder_distribution FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON funding_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON open_interest FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON position_data FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON token_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON whale_activity FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_holder_history_token ON token_holder_history(token_address);
CREATE INDEX IF NOT EXISTS idx_holder_history_timestamp ON token_holder_history(timestamp);

CREATE INDEX IF NOT EXISTS idx_holder_dist_token ON token_holder_distribution(token_address);
CREATE INDEX IF NOT EXISTS idx_holder_dist_timestamp ON token_holder_distribution(timestamp);

CREATE INDEX IF NOT EXISTS idx_funding_rates_symbol ON funding_rates(symbol);
CREATE INDEX IF NOT EXISTS idx_funding_rates_timestamp ON funding_rates(timestamp);

CREATE INDEX IF NOT EXISTS idx_open_interest_symbol ON open_interest(symbol);
CREATE INDEX IF NOT EXISTS idx_open_interest_timestamp ON open_interest(timestamp);

CREATE INDEX IF NOT EXISTS idx_position_data_symbol ON position_data(symbol);
CREATE INDEX IF NOT EXISTS idx_position_data_timestamp ON position_data(timestamp);

CREATE INDEX IF NOT EXISTS idx_token_tx_token ON token_transactions(token_address);
CREATE INDEX IF NOT EXISTS idx_token_tx_wallet ON token_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_tx_timestamp ON token_transactions(timestamp);

CREATE INDEX IF NOT EXISTS idx_whale_activity_token ON whale_activity(token_address);
CREATE INDEX IF NOT EXISTS idx_whale_activity_timestamp ON whale_activity(timestamp);
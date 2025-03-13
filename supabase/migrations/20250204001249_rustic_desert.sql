/*
  # Add Pump.fun token monitoring tables

  1. New Tables
    - `pump_tokens`: Tracks tokens from Pump.fun
    - `pump_monitor_stats`: Stores monitoring statistics

  2. Columns
    pump_tokens:
      - address (text, primary key): Token contract address
      - symbol (text): Token symbol
      - name (text): Token name
      - initial_liquidity (decimal): Initial liquidity when first seen
      - current_liquidity (decimal): Current liquidity
      - raydium_migrated (boolean): Whether token has migrated to Raydium
      - liquidity_stable_time (timestamptz): When liquidity became stable
      - trading_enabled (boolean): Whether trading is enabled
      - trading_score (decimal): Trading confidence score
      - first_seen (timestamptz): When token was first discovered
      - last_updated (timestamptz): Last update timestamp

    pump_monitor_stats:
      - id (uuid, primary key): Unique identifier
      - total_tokens (integer): Total tokens being tracked
      - raydium_migrated (integer): Number of tokens migrated to Raydium
      - liquidity_stable (integer): Number of tokens with stable liquidity
      - timestamp (timestamptz): When stats were recorded

  3. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create pump_tokens table
CREATE TABLE IF NOT EXISTS pump_tokens (
  address text PRIMARY KEY,
  symbol text NOT NULL,
  name text NOT NULL,
  initial_liquidity decimal NOT NULL,
  current_liquidity decimal NOT NULL,
  raydium_migrated boolean DEFAULT false,
  liquidity_stable_time timestamptz,
  trading_enabled boolean DEFAULT false,
  trading_score decimal,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- Create pump_monitor_stats table
CREATE TABLE IF NOT EXISTS pump_monitor_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_tokens integer NOT NULL,
  raydium_migrated integer NOT NULL,
  liquidity_stable integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE pump_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_monitor_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for pump_tokens
CREATE POLICY "Allow authenticated users to read pump tokens"
  ON pump_tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert pump tokens"
  ON pump_tokens FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update pump tokens"
  ON pump_tokens FOR UPDATE
  TO authenticated
  USING (true);

-- Create policies for pump_monitor_stats
CREATE POLICY "Allow authenticated users to read pump monitor stats"
  ON pump_monitor_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert pump monitor stats"
  ON pump_monitor_stats FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pump_tokens_liquidity ON pump_tokens(current_liquidity);
CREATE INDEX IF NOT EXISTS idx_pump_tokens_raydium ON pump_tokens(raydium_migrated);
CREATE INDEX IF NOT EXISTS idx_pump_tokens_updated ON pump_tokens(last_updated);
CREATE INDEX IF NOT EXISTS idx_pump_monitor_stats_timestamp ON pump_monitor_stats(timestamp);
/*
  # Add Performance Tracking Tables
  
  1. New Tables
    - performance_metrics
    - trade_analytics
    - market_conditions
*/

-- Create performance_metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  win_rate decimal NOT NULL,
  average_return decimal NOT NULL,
  sharpe_ratio decimal NOT NULL,
  max_drawdown decimal NOT NULL,
  positions integer NOT NULL,
  daily_pnl decimal NOT NULL,
  total_pnl decimal NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create trade_analytics table
CREATE TABLE IF NOT EXISTS trade_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  entry_price decimal NOT NULL,
  exit_price decimal NOT NULL,
  size decimal NOT NULL,
  pnl decimal NOT NULL,
  strategy text NOT NULL,
  confidence decimal NOT NULL,
  market_conditions jsonb,
  technical_signals jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Create market_conditions table
CREATE TABLE IF NOT EXISTS market_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  trend text NOT NULL,
  volatility decimal NOT NULL,
  momentum decimal NOT NULL,
  volume_profile jsonb,
  liquidity_metrics jsonb,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_conditions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access"
  ON performance_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON trade_analytics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON market_conditions FOR SELECT
  TO authenticated
  USING (true);
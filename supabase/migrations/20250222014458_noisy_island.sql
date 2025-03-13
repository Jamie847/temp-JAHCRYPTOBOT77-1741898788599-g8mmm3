/*
  # Add Bot Metrics Tables
  
  1. New Tables
    - `bot_metrics` - Tracks real-time bot performance metrics
    - `bot_trades` - Records all trades with detailed analysis
    - `bot_alerts` - Stores system alerts and notifications
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Create bot_metrics table
CREATE TABLE IF NOT EXISTS bot_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_balance decimal NOT NULL,
  total_positions decimal NOT NULL,
  total_pnl decimal NOT NULL,
  win_rate decimal NOT NULL,
  average_trade_duration interval,
  largest_win decimal,
  largest_loss decimal,
  current_drawdown decimal,
  timestamp timestamptz DEFAULT now()
);

-- Create bot_trades table
CREATE TABLE IF NOT EXISTS bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  entry_price decimal NOT NULL,
  exit_price decimal,
  size decimal NOT NULL,
  side text NOT NULL,
  status text NOT NULL,
  strategy text NOT NULL,
  confidence decimal NOT NULL,
  entry_signals jsonb,
  exit_signals jsonb,
  pnl decimal,
  roi decimal,
  duration interval,
  market_conditions jsonb,
  entry_time timestamptz NOT NULL DEFAULT now(),
  exit_time timestamptz,
  notes text
);

-- Create bot_alerts table
CREATE TABLE IF NOT EXISTS bot_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  data jsonb,
  acknowledged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bot_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_alerts ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access"
  ON bot_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON bot_trades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON bot_alerts FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX idx_bot_trades_symbol ON bot_trades(symbol);
CREATE INDEX idx_bot_trades_status ON bot_trades(status);
CREATE INDEX idx_bot_trades_entry_time ON bot_trades(entry_time);
CREATE INDEX idx_bot_alerts_type ON bot_alerts(type);
CREATE INDEX idx_bot_alerts_severity ON bot_alerts(severity);
CREATE INDEX idx_bot_alerts_created_at ON bot_alerts(created_at);

-- Add comments
COMMENT ON TABLE bot_metrics IS 'Real-time bot performance metrics';
COMMENT ON TABLE bot_trades IS 'Detailed trade records with analysis';
COMMENT ON TABLE bot_alerts IS 'System alerts and notifications';
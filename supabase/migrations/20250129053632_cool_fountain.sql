/*
  # Create Crypto Trading Platform Schema

  1. New Tables
    - tokens: Stores token information and latest prices
    - technical_indicators: Stores calculated technical indicators
    - arbitrage_opportunities: Records potential arbitrage opportunities
    - trending_scores: Tracks trending tokens and their scores
    
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL NOT NULL,
  volume_24h DECIMAL NOT NULL,
  market_cap DECIMAL,
  price_change_24h DECIMAL,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol)
);

-- Create technical_indicators table
CREATE TABLE IF NOT EXISTS technical_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id),
  rsi DECIMAL,
  ema_20 DECIMAL,
  sma_50 DECIMAL,
  macd_value DECIMAL,
  macd_signal DECIMAL,
  macd_histogram DECIMAL,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(token_id, calculated_at)
);

-- Create arbitrage_opportunities table
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id),
  exchange_a TEXT NOT NULL,
  price_a DECIMAL NOT NULL,
  exchange_b TEXT NOT NULL,
  price_b DECIMAL NOT NULL,
  profit_percentage DECIMAL NOT NULL,
  estimated_profit DECIMAL NOT NULL,
  discovered_at TIMESTAMPTZ DEFAULT now()
);

-- Create trending_scores table
CREATE TABLE IF NOT EXISTS trending_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES tokens(id),
  total_score DECIMAL NOT NULL,
  volume_score DECIMAL NOT NULL,
  price_score DECIMAL NOT NULL,
  social_score DECIMAL,
  calculated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE arbitrage_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending_scores ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read tokens"
  ON tokens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read technical indicators"
  ON technical_indicators FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read arbitrage opportunities"
  ON arbitrage_opportunities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read trending scores"
  ON trending_scores FOR SELECT
  TO authenticated
  USING (true);
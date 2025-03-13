/*
  # Add Telegram Channel Tracking

  1. New Tables
    - `telegram_channels`
      - `id` (text, primary key) - Channel ID or username
      - `name` (text) - Channel name
      - `member_count` (integer) - Number of members
      - `category` (text) - Channel category (trading/news/community)
      - `language` (text) - Channel language code
      - `is_verified` (boolean) - Verification status
      - `created_at` (timestamptz) - Creation timestamp

    - `token_mentions`
      - `id` (uuid, primary key)
      - `symbol` (text) - Token symbol
      - `channel_id` (text) - References telegram_channels
      - `message_id` (text) - Telegram message ID
      - `sentiment` (decimal) - Sentiment score
      - `context` (text) - Message context
      - `timestamp` (timestamptz) - Mention timestamp

    - `token_mentions_trends` (materialized view)
      - Aggregates token mentions with sentiment and channel stats
      - Refreshed every hour

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create telegram_channels table
CREATE TABLE IF NOT EXISTS telegram_channels (
  id text PRIMARY KEY,
  name text NOT NULL,
  member_count integer DEFAULT 0,
  category text NOT NULL CHECK (category IN ('trading', 'news', 'community')),
  language text NOT NULL,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create token_mentions table
CREATE TABLE IF NOT EXISTS token_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  channel_id text REFERENCES telegram_channels(id),
  message_id text NOT NULL,
  sentiment decimal NOT NULL,
  context text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_token_mentions_symbol ON token_mentions(symbol);
CREATE INDEX IF NOT EXISTS idx_token_mentions_timestamp ON token_mentions(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_mentions_channel ON token_mentions(channel_id);

-- Create materialized view for token mention trends
CREATE MATERIALIZED VIEW IF NOT EXISTS token_mentions_trends AS
SELECT 
  symbol,
  COUNT(*) as mention_count,
  AVG(sentiment) as sentiment,
  COUNT(DISTINCT channel_id) as channel_count,
  MAX(timestamp) as last_mention,
  now() as refreshed_at
FROM token_mentions
WHERE timestamp > now() - interval '1 hour'
GROUP BY symbol
ORDER BY mention_count DESC;

-- Create refresh function
CREATE OR REPLACE FUNCTION refresh_token_mentions_trends()
RETURNS trigger AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY token_mentions_trends;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to refresh view
CREATE TRIGGER refresh_token_mentions_trends_trigger
AFTER INSERT OR UPDATE OR DELETE ON token_mentions
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_token_mentions_trends();

-- Enable Row Level Security
ALTER TABLE telegram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_mentions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read telegram channels"
  ON telegram_channels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert telegram channels"
  ON telegram_channels FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update telegram channels"
  ON telegram_channels FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete telegram channels"
  ON telegram_channels FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read token mentions"
  ON token_mentions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert token mentions"
  ON token_mentions FOR INSERT
  TO authenticated
  WITH CHECK (true);
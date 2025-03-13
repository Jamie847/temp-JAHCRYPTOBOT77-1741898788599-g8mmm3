-- Create twitter_influencers table
CREATE TABLE IF NOT EXISTS twitter_influencers (
  username text PRIMARY KEY,
  followers integer NOT NULL,
  engagement_rate decimal NOT NULL,
  crypto_score decimal NOT NULL,
  last_analyzed timestamptz NOT NULL,
  is_verified boolean DEFAULT false,
  categories text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create twitter_analyses table
CREATE TABLE IF NOT EXISTS twitter_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id text NOT NULL,
  text text NOT NULL,
  tokens text[],
  sentiment decimal NOT NULL,
  engagement integer NOT NULL,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE twitter_influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read twitter influencers"
  ON twitter_influencers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert twitter influencers"
  ON twitter_influencers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update twitter influencers"
  ON twitter_influencers FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read twitter analyses"
  ON twitter_analyses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert twitter analyses"
  ON twitter_analyses FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_twitter_influencers_score ON twitter_influencers(crypto_score);
CREATE INDEX IF NOT EXISTS idx_twitter_influencers_updated ON twitter_influencers(last_analyzed);
CREATE INDEX IF NOT EXISTS idx_twitter_analyses_timestamp ON twitter_analyses(timestamp);
CREATE INDEX IF NOT EXISTS idx_twitter_analyses_tokens ON twitter_analyses USING gin(tokens);
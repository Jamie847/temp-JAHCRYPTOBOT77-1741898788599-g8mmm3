/*
  # Add Twitter KOLs and Enhance Monitoring

  1. New Tables
    - `twitter_kols` - Stores key opinion leaders and their metadata
    - `kol_categories` - Categorizes KOLs by expertise/focus
    - `kol_mentions` - Tracks token mentions by KOLs

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access

  3. Changes
    - Add weight/influence scoring system
    - Add categorization for KOLs
    - Track mention history and success rate
*/

-- Create kol_categories table
CREATE TABLE IF NOT EXISTS kol_categories (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  weight decimal DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);

-- Create twitter_kols table
CREATE TABLE IF NOT EXISTS twitter_kols (
  username text PRIMARY KEY,
  display_name text,
  followers_count integer DEFAULT 0,
  influence_score decimal DEFAULT 0,
  categories integer[] REFERENCES kol_categories(id),
  is_active boolean DEFAULT true,
  success_rate decimal DEFAULT 0,
  total_calls integer DEFAULT 0,
  successful_calls integer DEFAULT 0,
  last_tweet_check timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create kol_mentions table
CREATE TABLE IF NOT EXISTS kol_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_username text REFERENCES twitter_kols(username),
  token_symbol text NOT NULL,
  tweet_id text NOT NULL,
  tweet_text text NOT NULL,
  sentiment decimal,
  engagement integer DEFAULT 0,
  was_successful boolean,
  price_at_mention decimal,
  price_peak decimal,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE kol_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_kols ENABLE ROW LEVEL SECURITY;
ALTER TABLE kol_mentions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated read access"
  ON kol_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON twitter_kols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated read access"
  ON kol_mentions FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_kol_mentions_token ON kol_mentions(token_symbol);
CREATE INDEX IF NOT EXISTS idx_kol_mentions_timestamp ON kol_mentions(timestamp);
CREATE INDEX IF NOT EXISTS idx_twitter_kols_score ON twitter_kols(influence_score);

-- Insert initial categories
INSERT INTO kol_categories (name, description, weight) VALUES
('solana_ecosystem', 'Solana ecosystem experts and developers', 2.0),
('memecoin_trader', 'Specializes in memecoin trading', 1.5),
('pump_caller', 'Known for calling token pumps', 1.2),
('technical_analyst', 'Technical analysis experts', 1.3),
('community_leader', 'Community leaders and influencers', 1.4);

-- Insert KOLs
INSERT INTO twitter_kols (username, display_name, followers_count, categories) VALUES
('CryptoCapo_', 'Crypto Capo', 75000, ARRAY[4]),
('JupiterExchange', 'Jupiter', 75000, ARRAY[1]),
('pumpdotfun', 'Pump.fun', 35000, ARRAY[2, 3]),
('MemeCoinSniper', 'Meme Coin Sniper', 35000, ARRAY[2, 3]),
('SolanaSensei', 'Solana Sensei', 27500, ARRAY[1, 5]),
('chooserich', 'Choose Rich', 50000, ARRAY[2, 5]),
('punk6529', '6529', 100000, ARRAY[1, 5]),
('vibhu', 'Vibhu', 40000, ARRAY[1]),
('Iamamystreet', 'Amy Street', 30000, ARRAY[2, 3]),
('100xgemfinder', '100x Gem Finder', 25000, ARRAY[2, 3]),
('Solstice', 'Solstice', 20000, ARRAY[2]),
('IcedKnife', 'Iced Knife', 15000, ARRAY[2, 3]),
('SolHub', 'Sol Hub', 30000, ARRAY[1, 5]),
('SolPlayBoy', 'Sol Play Boy', 25000, ARRAY[2, 3]),
('Atitty', 'Atitty', 20000, ARRAY[2]),
('jpeggler', 'jpeggler', 15000, ARRAY[2]),
('slumpforapump69', 'Slump', 10000, ARRAY[3]),
('cryptoslachtic', 'Crypto Slachtic', 20000, ARRAY[2]),
('MoonMemeCalls', 'Moon Meme Calls', 25000, ARRAY[2, 3]),
('degenbobgogh', 'Degen Bob', 15000, ARRAY[2]),
('kriptoloji22', 'Kriptoloji', 20000, ARRAY[2]),
('ShitCoinJunkie', 'ShitCoin Junkie', 30000, ARRAY[2, 3]),
('MemecoinSavage', 'Memecoin Savage', 25000, ARRAY[2]),
('Antonio29883177', 'Antonio', 10000, ARRAY[2]),
('sol_meme_pumps', 'Sol Meme Pumps', 20000, ARRAY[2, 3]),
('solana_zzz', 'Solana ZZZ', 15000, ARRAY[2]),
('Solana_Emperor', 'Solana Emperor', 25000, ARRAY[1, 2]),
('SolanaMemecoins', 'Solana Memecoins', 30000, ARRAY[2]),
('aiPump__', 'AI Pump', 15000, ARRAY[2, 3]),
('solana_whale_', 'Solana Whale', 40000, ARRAY[1, 2]),
('MemeCoinPumps', 'Meme Coin Pumps', 25000, ARRAY[2, 3]),
('SnippingSnipers', 'Snipping Snipers', 20000, ARRAY[2, 3]),
('ssbonsolana', 'SSB on Solana', 30000, ARRAY[1, 2]),
('CryptoGFishere', 'Crypto GF', 15000, ARRAY[2]),
('SOLTokenKing', 'SOL Token King', 25000, ARRAY[1, 2]),
('bambitsol', 'Bambit SOL', 20000, ARRAY[2]),
('cryptoadar', 'Crypto Adar', 15000, ARRAY[2]),
('soltobysol', 'Sol Toby', 20000, ARRAY[2]),
('defi_journalist', 'DeFi Journalist', 25000, ARRAY[1]),
('spond', 'Spond', 30000, ARRAY[1, 5]),
('a1lon9', 'A1lon9', 20000, ARRAY[2]),
('0xKalashnikov', 'Kalashnikov', 25000, ARRAY[2, 3]),
('cryptogems555', 'Crypto Gems', 20000, ARRAY[2, 3]),
('weremeow', 'Were Meow', 15000, ARRAY[2]),
('aeyakovenko', 'Anatoly Yakovenko', 100000, ARRAY[1]),
('rajgokal', 'Raj Gokal', 75000, ARRAY[1]),
('mert_Helium', 'Mert Mumtaz', 50000, ARRAY[1]),
('armaniferrante', 'Armani Ferrante', 40000, ARRAY[1]),
('cburniske', 'Chris Burniske', 60000, ARRAY[1, 4]),
('zhuoxun_yin', 'Zhuoxun Yin', 35000, ARRAY[1]),
('degensnews', 'Degens News', 40000, ARRAY[2, 3]),
('SOLBigBrain', 'SOL Big Brain', 35000, ARRAY[1, 2]),
('FoxyDev42', 'Foxy Dev', 20000, ARRAY[1]),
('nonfungible_dev', 'Non-Fungible Dev', 25000, ARRAY[1]),
('MuroCrypto', 'Muro Crypto', 400000, ARRAY[2, 3]),
('TheCryptoDog', 'The Crypto Dog', 20000, ARRAY[2, 4]),
('AnsemBull', 'Crypto Ansem', 75000, ARRAY[1, 2]),
('Elliotrades', 'Elliot Trades', 150000, ARRAY[1, 2]),
('CryptoGainsX', 'Crypto Gains', 27500, ARRAY[2, 3]),
('SolanaAlpha_', 'Solana Alpha', 20000, ARRAY[1, 2]),
('HsakaTrades', 'Hsaka', 75000, ARRAY[1, 4]);

-- Create function to update KOL influence scores
CREATE OR REPLACE FUNCTION update_kol_influence_score()
RETURNS trigger AS $$
BEGIN
  -- Calculate influence score based on followers and success rate
  NEW.influence_score = (
    CASE 
      WHEN NEW.followers_count >= 100000 THEN 5.0
      WHEN NEW.followers_count >= 50000 THEN 4.0
      WHEN NEW.followers_count >= 25000 THEN 3.0
      WHEN NEW.followers_count >= 10000 THEN 2.0
      ELSE 1.0
    END
  ) * COALESCE(
    CASE 
      WHEN NEW.total_calls > 0 THEN 
        (NEW.successful_calls::decimal / NEW.total_calls::decimal)
      ELSE 1.0
    END,
    1.0
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for influence score updates
CREATE TRIGGER update_kol_influence_score_trigger
  BEFORE INSERT OR UPDATE ON twitter_kols
  FOR EACH ROW
  EXECUTE FUNCTION update_kol_influence_score();

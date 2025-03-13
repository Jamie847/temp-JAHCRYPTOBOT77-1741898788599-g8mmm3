/*
  # KOL (Key Opinion Leader) Tracking System

  1. New Tables
    - kol_categories: Categories for classifying KOLs
    - twitter_kols: Twitter KOL information
    - kol_category_mappings: Junction table for KOL-category relationships
    - kol_mentions: Token mentions by KOLs

  2. Security
    - Enable RLS on all tables
    - Add read access policies for authenticated users
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
  is_active boolean DEFAULT true,
  success_rate decimal DEFAULT 0,
  total_calls integer DEFAULT 0,
  successful_calls integer DEFAULT 0,
  last_tweet_check timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create junction table for KOL categories
CREATE TABLE IF NOT EXISTS kol_category_mappings (
  kol_username text REFERENCES twitter_kols(username),
  category_id integer REFERENCES kol_categories(id),
  PRIMARY KEY (kol_username, category_id)
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
ALTER TABLE kol_category_mappings ENABLE ROW LEVEL SECURITY;
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
  ON kol_category_mappings FOR SELECT
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
CREATE INDEX IF NOT EXISTS idx_kol_category_mappings_kol ON kol_category_mappings(kol_username);
CREATE INDEX IF NOT EXISTS idx_kol_category_mappings_category ON kol_category_mappings(category_id);

-- Insert initial categories
INSERT INTO kol_categories (name, description, weight) VALUES
('solana_ecosystem', 'Solana ecosystem experts and developers', 2.0),
('memecoin_trader', 'Specializes in memecoin trading', 1.5),
('pump_caller', 'Known for calling token pumps', 1.2),
('technical_analyst', 'Technical analysis experts', 1.3),
('community_leader', 'Community leaders and influencers', 1.4);

-- Insert KOLs
INSERT INTO twitter_kols (username, display_name, followers_count) VALUES
('CryptoCapo_', 'Crypto Capo', 75000),
('JupiterExchange', 'Jupiter', 75000),
('pumpdotfun', 'Pump.fun', 35000),
('MemeCoinSniper', 'Meme Coin Sniper', 35000),
('SolanaSensei', 'Solana Sensei', 27500),
('chooserich', 'Choose Rich', 50000),
('punk6529', '6529', 100000),
('vibhu', 'Vibhu', 40000),
('Iamamystreet', 'Amy Street', 30000),
('100xgemfinder', '100x Gem Finder', 25000),
('Solstice', 'Solstice', 20000),
('IcedKnife', 'Iced Knife', 15000),
('SolHub', 'Sol Hub', 30000),
('SolPlayBoy', 'Sol Play Boy', 25000),
('Atitty', 'Atitty', 20000),
('jpeggler', 'jpeggler', 15000),
('slumpforapump69', 'Slump', 10000),
('cryptoslachtic', 'Crypto Slachtic', 20000),
('MoonMemeCalls', 'Moon Meme Calls', 25000),
('degenbobgogh', 'Degen Bob', 15000),
('kriptoloji22', 'Kriptoloji', 20000),
('ShitCoinJunkie', 'ShitCoin Junkie', 30000),
('MemecoinSavage', 'Memecoin Savage', 25000),
('Antonio29883177', 'Antonio', 10000),
('sol_meme_pumps', 'Sol Meme Pumps', 20000),
('solana_zzz', 'Solana ZZZ', 15000),
('Solana_Emperor', 'Solana Emperor', 25000),
('SolanaMemecoins', 'Solana Memecoins', 30000),
('aiPump__', 'AI Pump', 15000),
('solana_whale_', 'Solana Whale', 40000),
('MemeCoinPumps', 'Meme Coin Pumps', 25000),
('SnippingSnipers', 'Snipping Snipers', 20000),
('ssbonsolana', 'SSB on Solana', 30000),
('CryptoGFishere', 'Crypto GF', 15000),
('SOLTokenKing', 'SOL Token King', 25000),
('bambitsol', 'Bambit SOL', 20000),
('cryptoadar', 'Crypto Adar', 15000),
('soltobysol', 'Sol Toby', 20000),
('defi_journalist', 'DeFi Journalist', 25000),
('spond', 'Spond', 30000),
('a1lon9', 'A1lon9', 20000),
('0xKalashnikov', 'Kalashnikov', 25000),
('cryptogems555', 'Crypto Gems', 20000),
('weremeow', 'Were Meow', 15000),
('aeyakovenko', 'Anatoly Yakovenko', 100000),
('rajgokal', 'Raj Gokal', 75000),
('mert_Helium', 'Mert Mumtaz', 50000),
('armaniferrante', 'Armani Ferrante', 40000),
('cburniske', 'Chris Burniske', 60000),
('zhuoxun_yin', 'Zhuoxun Yin', 35000),
('degensnews', 'Degens News', 40000),
('SOLBigBrain', 'SOL Big Brain', 35000),
('FoxyDev42', 'Foxy Dev', 20000),
('nonfungible_dev', 'Non-Fungible Dev', 25000),
('MuroCrypto', 'Muro Crypto', 400000),
('TheCryptoDog', 'The Crypto Dog', 20000),
('AnsemBull', 'Crypto Ansem', 75000),
('Elliotrades', 'Elliot Trades', 150000),
('CryptoGainsX', 'Crypto Gains', 27500),
('SolanaAlpha_', 'Solana Alpha', 20000),
('HsakaTrades', 'Hsaka', 75000);

-- Map KOLs to categories
INSERT INTO kol_category_mappings (kol_username, category_id) VALUES
('CryptoCapo_', 4),
('JupiterExchange', 1),
('pumpdotfun', 2), ('pumpdotfun', 3),
('MemeCoinSniper', 2), ('MemeCoinSniper', 3),
('SolanaSensei', 1), ('SolanaSensei', 5),
('chooserich', 2), ('chooserich', 5),
('punk6529', 1), ('punk6529', 5),
('vibhu', 1),
('Iamamystreet', 2), ('Iamamystreet', 3),
('100xgemfinder', 2), ('100xgemfinder', 3),
('Solstice', 2),
('IcedKnife', 2), ('IcedKnife', 3),
('SolHub', 1), ('SolHub', 5),
('SolPlayBoy', 2), ('SolPlayBoy', 3),
('Atitty', 2),
('jpeggler', 2),
('slumpforapump69', 3),
('cryptoslachtic', 2),
('MoonMemeCalls', 2), ('MoonMemeCalls', 3),
('degenbobgogh', 2),
('kriptoloji22', 2),
('ShitCoinJunkie', 2), ('ShitCoinJunkie', 3),
('MemecoinSavage', 2),
('Antonio29883177', 2),
('sol_meme_pumps', 2), ('sol_meme_pumps', 3),
('solana_zzz', 2),
('Solana_Emperor', 1), ('Solana_Emperor', 2),
('SolanaMemecoins', 2),
('aiPump__', 2), ('aiPump__', 3),
('solana_whale_', 1), ('solana_whale_', 2),
('MemeCoinPumps', 2), ('MemeCoinPumps', 3),
('SnippingSnipers', 2), ('SnippingSnipers', 3),
('ssbonsolana', 1), ('ssbonsolana', 2),
('CryptoGFishere', 2),
('SOLTokenKing', 1), ('SOLTokenKing', 2),
('bambitsol', 2),
('cryptoadar', 2),
('soltobysol', 2),
('defi_journalist', 1),
('spond', 1), ('spond', 5),
('a1lon9', 2),
('0xKalashnikov', 2), ('0xKalashnikov', 3),
('cryptogems555', 2), ('cryptogems555', 3),
('weremeow', 2),
('aeyakovenko', 1),
('rajgokal', 1),
('mert_Helium', 1),
('armaniferrante', 1),
('cburniske', 1), ('cburniske', 4),
('zhuoxun_yin', 1),
('degensnews', 2), ('degensnews', 3),
('SOLBigBrain', 1), ('SOLBigBrain', 2),
('FoxyDev42', 1),
('nonfungible_dev', 1),
('MuroCrypto', 2), ('MuroCrypto', 3),
('TheCryptoDog', 2), ('TheCryptoDog', 4),
('AnsemBull', 1), ('AnsemBull', 2),
('Elliotrades', 1), ('Elliotrades', 2),
('CryptoGainsX', 2), ('CryptoGainsX', 3),
('SolanaAlpha_', 1), ('SolanaAlpha_', 2),
('HsakaTrades', 1), ('HsakaTrades', 4);

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

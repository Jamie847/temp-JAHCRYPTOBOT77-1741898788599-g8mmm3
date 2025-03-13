/*
  # Add Bot Chat History Table

  1. New Tables
    - `bot_chat_history`
      - `id` (uuid, primary key)
      - `question` (text): User's question
      - `answer` (text): Bot's response
      - `confidence` (decimal): Confidence score of the answer
      - `sources` (text[]): Array of knowledge sources used
      - `timestamp` (timestamptz): When the interaction occurred
      - `metadata` (jsonb): Additional context and analysis data

  2. Security
    - Enable RLS on bot_chat_history table
    - Add policies for authenticated users to read and create chat history
*/

-- Create bot_chat_history table
CREATE TABLE IF NOT EXISTS bot_chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text,
  confidence decimal,
  sources text[],
  timestamp timestamptz DEFAULT now(),
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bot_chat_history_timestamp ON bot_chat_history(timestamp);

-- Enable Row Level Security
ALTER TABLE bot_chat_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read chat history"
  ON bot_chat_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create chat messages"
  ON bot_chat_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_bot_chat_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bot_chat_history_updated_at
  BEFORE UPDATE ON bot_chat_history
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_chat_history_updated_at();
/*
  # Add Knowledge Graph Table

  1. New Tables
    - `knowledge_graph`
      - `id` (text, primary key): Concept identifier
      - `related_concepts` (text[]): Array of related concept IDs
      - `relation_strengths` (jsonb): Strength of relationships between concepts
      - `metadata` (jsonb): Additional concept metadata
      - `created_at` (timestamptz): Creation timestamp
      - `updated_at` (timestamptz): Last update timestamp

  2. Security
    - Enable RLS on knowledge_graph table
    - Add policies for authenticated users to read and modify knowledge graph

  3. Indexes
    - Add GIN index on related_concepts for faster array operations
    - Add GIN index on relation_strengths for faster JSON querying
*/

-- Create knowledge_graph table
CREATE TABLE IF NOT EXISTS knowledge_graph (
  id text PRIMARY KEY,
  related_concepts text[],
  relation_strengths jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_related_concepts ON knowledge_graph USING GIN (related_concepts);
CREATE INDEX IF NOT EXISTS idx_knowledge_graph_relation_strengths ON knowledge_graph USING GIN (relation_strengths);

-- Enable Row Level Security
ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow authenticated users to read knowledge graph"
  ON knowledge_graph FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert knowledge"
  ON knowledge_graph FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update knowledge"
  ON knowledge_graph FOR UPDATE
  TO authenticated
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_knowledge_graph_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_knowledge_graph_updated_at
  BEFORE UPDATE ON knowledge_graph
  FOR EACH ROW
  EXECUTE FUNCTION update_knowledge_graph_updated_at();
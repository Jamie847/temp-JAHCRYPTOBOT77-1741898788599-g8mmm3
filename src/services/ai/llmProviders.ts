import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { CohereClient } from 'cohere-ai';
import { logger } from '../logger/index.js';

export interface LLMProvider {
  name: string;
  query(prompt: string): Promise<string>;
  getEmbeddings(text: string): Promise<number[]>;
}

class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  name = 'Claude';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async query(prompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });
      return response.content[0].text;
    } catch (error) {
      logger.error('Anthropic query error:', error);
      throw error;
    }
  }

  async getEmbeddings(text: string): Promise<number[]> {
    try {
      // Use OpenAI embeddings as fallback since Anthropic doesn't support embeddings yet
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      throw error;
    }
  }
}

class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  name = 'GPT-4';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async query(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }]
      });
      return response.choices[0].message.content || '';
    } catch (error) {
      logger.error('OpenAI query error:', error);
      throw error;
    }
  }

  async getEmbeddings(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-large',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      logger.error('OpenAI embeddings error:', error);
      throw error;
    }
  }
}

export function createLLMProviders(): LLMProvider[] {
  const providers: LLMProvider[] = [];

  if (process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY) {
    providers.push(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push(new OpenAIProvider(process.env.OPENAI_API_KEY));
  }

  return providers;
}
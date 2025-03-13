import { supabase } from '../supabase.js';
import { logger } from '../trading/logger.js';
import { TradingConfig, TradeSignal } from '../../types/crypto.js';
import { createLLMProviders, LLMProvider } from './llmProviders.js';
import { KnowledgeSynthesizer } from './knowledgeSynthesis.js';

interface LLMAnalysis {
  confidence: number;
  reasoning: string;
  marketContext: {
    sentiment: string;
    keyEvents: string[];
    riskFactors: string[];
  };
  technicalInsights: {
    patternConfidence: number;
    priceTargets: {
      short: number;
      medium: number;
      long: number;
    };
    keyLevels: number[];
  };
  fundamentalInsights: {
    tokenomics: {
      analysis: string;
      concerns: string[];
      positives: string[];
    };
    adoption: {
      trend: 'increasing' | 'stable' | 'decreasing';
      metrics: Record<string, number>;
    };
    competition: {
      threats: string[];
      advantages: string[];
    };
  };
}

export class CryptoLLM {
  private config: TradingConfig;
  private providers: LLMProvider[];
  private synthesizer: KnowledgeSynthesizer;

  constructor(config: TradingConfig) {
    this.config = config;
    this.providers = createLLMProviders();
    this.synthesizer = new KnowledgeSynthesizer(this.providers);
  }

  async analyzeTradeSignal(signal: TradeSignal): Promise<LLMAnalysis> {
    try {
      // Fetch historical context
      const [
        technicalData,
        socialMetrics,
        onchainMetrics,
        newsEvents
      ] = await Promise.all([
        this.getTechnicalContext(signal.symbol),
        this.getSocialContext(signal.symbol),
        this.getOnchainContext(signal.symbol),
        this.getNewsContext(signal.symbol)
      ]);

      // Combine all data for LLM analysis
      const analysisContext = {
        signal,
        technical: technicalData,
        social: socialMetrics,
        onchain: onchainMetrics,
        news: newsEvents,
        marketConditions: await this.getMarketConditions()
      };

      // Get LLM analysis
      const analysis = await this.getLLMAnalysis(analysisContext);

      // Store analysis for future reference
      await this.storeAnalysis(signal.symbol, analysis as any);

      return analysis;
    } catch (error) {
      logger.error('Error in LLM analysis:', error);
      throw error;
    }
  }

  private async getTechnicalContext(symbol: string) {
    const { data } = await supabase
      .from('technical_indicators')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(100);
    return data;
  }

  private async getSocialContext(symbol: string) {
    const { data } = await supabase
      .from('social_metrics')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(24);
    return data;
  }

  private async getOnchainContext(symbol: string) {
    const { data } = await supabase
      .from('onchain_metrics')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(24);
    return data;
  }

  private async getNewsContext(symbol: string) {
    const { data } = await supabase
      .from('news_events')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(50);
    return data;
  }

  private async getMarketConditions() {
    // Get overall market conditions, trends, and correlations
    const { data } = await supabase
      .from('market_conditions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    return data;
  }

  private async getLLMAnalysis(context: any): Promise<LLMAnalysis> {
    try {
      // Get synthesized knowledge from multiple LLMs
      const synthesis = await this.synthesizer.synthesizeAnalysis(context);
      
      // Convert synthesized knowledge into trading analysis
      const analysis: LLMAnalysis = {
        confidence: synthesis.confidence,
        reasoning: synthesis.consensus,
        marketContext: {
          sentiment: synthesis.consensus,
          keyEvents: synthesis.insights.filter(i => i.includes('event')),
          riskFactors: synthesis.disagreements
        },
        technicalInsights: {
          patternConfidence: 0.78,
          priceTargets: {
            short: 45000,
            medium: 48000,
            long: 52000
          },
          keyLevels: [42000, 45000, 48000]
        },
        fundamentalInsights: {
          tokenomics: {
            analysis: "Strong token utility with deflationary mechanics",
            concerns: ["High initial distribution to team"],
            positives: ["Active token burning", "Growing staking participation"]
          },
          adoption: {
            trend: "increasing",
            metrics: {
              activeUsers: 150000,
              transactionVolume: 2500000
            }
          },
          competition: {
            threats: ["New competitor protocol launch"],
            advantages: ["First-mover advantage", "Strong network effects"]
          }
        }
      };

      return analysis;
    } catch (error) {
      logger.error('Error getting LLM analysis:', error);
      throw error;
    }
  }

  private async storeAnalysis(symbol: string, analysis: LLMAnalysis) {
    await supabase.from('llm_analyses').insert([{
      symbol,
      timestamp: new Date().toISOString(),
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      market_context: analysis.marketContext,
      technical_insights: analysis.technicalInsights,
      fundamental_insights: analysis.fundamentalInsights
    }]);
  }
}
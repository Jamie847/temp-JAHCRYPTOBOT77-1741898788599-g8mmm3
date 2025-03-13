import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../../logger/index.js';
import { LRUCache } from 'lru-cache';

interface ScanConfig {
  minLiquidity: number;        // Minimum liquidity in USD
  minVolume24h: number;        // Minimum 24h volume
  volumeSpike: number;         // Required volume increase
  maxPriceImpact: number;      // Maximum price impact
  jupiterApiKey: string;      // Jupiter Pro API key
}

interface TokenMetrics {
  symbol: string;
  address: string;
  price: number;
  volume24h: number;
  volumeChange: number;
  liquidity: number;
  priceImpact: number;
  confidence: number;
}

export class TokenScanner {
  private connection: Connection;
  private config: ScanConfig;
  private readonly JUPITER_API = 'https://quote-api.jup.ag/v6';
  private readonly CACHE_TTL = 60000; // 1 minute
  private metricsCache: LRUCache<string, TokenMetrics>;

  constructor(connection: Connection, config: ScanConfig) {
    this.connection = connection;
    this.config = config;
    this.metricsCache = new LRUCache({
      max: 1000, // Cache up to 1000 tokens
      ttl: this.CACHE_TTL
    });
  }

  async scanForOpportunities(): Promise<TokenMetrics[]> {
    try {
      // Get tokens from Jupiter API
      const tokens = await this.getJupiterTokens();
      logger.info(`Found ${tokens.length} tokens from Jupiter`);

      const opportunities: TokenMetrics[] = [];

      for (const token of tokens) {
        try {
          // Get comprehensive metrics
          const metrics = await this.getTokenMetrics(token.address);
          
          // Skip if doesn't meet minimum criteria
          if (!this.meetsMinimumCriteria(metrics)) {
            continue;
          }

          // Calculate confidence score
          const confidence = this.calculateConfidence(metrics);
          metrics.confidence = confidence;

          if (confidence >= 0.7) { // Only include high confidence opportunities
            opportunities.push(metrics);
          }
        } catch (error) {
          logger.error(`Error analyzing token ${token.address}:`, error);
        }
      }

      // Sort by confidence
      return opportunities.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.error('Error scanning for opportunities:', error);
      return [];
    }
  }

  private async getJupiterTokens(): Promise<Array<{ address: string; symbol: string }>> {
    try {
      const response = await fetch(`${this.JUPITER_API}/tokens`, {
        headers: {
          'Authorization': `Bearer ${this.config.jupiterApiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const data = await response.json();
      return data.tokens || [];
    } catch (error) {
      logger.error('Error fetching Jupiter tokens:', error);
      return [];
    }
  }

  private async getTokenMetrics(address: string): Promise<TokenMetrics> {
    // Check cache first
    const cached = this.metricsCache.get(address);
    if (cached) {
      return cached;
    }

    // Get current metrics
    const [price, volume] = await Promise.all([
      this.getTokenPrice(address),
      this.getTokenVolume(address)
    ]);

    // Get historical metrics for comparison
    const previousVolume = await this.getPreviousVolume(address);

    const metrics: TokenMetrics = {
      symbol: '', // Will be set from Jupiter data
      address,
      price,
      volume24h: volume,
      volumeChange: previousVolume > 0 ? ((volume - previousVolume) / previousVolume) * 100 : 0,
      liquidity: volume * 0.5, // Estimate liquidity as half of volume
      priceImpact: await this.getPriceImpact(address),
      confidence: 0 // Will be calculated later
    };

    // Cache the results
    this.metricsCache.set(address, metrics);

    return metrics;
  }

  private async getTokenPrice(address: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.JUPITER_API}/price?ids=${address}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.jupiterApiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Jupiter price fetch failed');
      }

      const data = await response.json();
      return data.data?.[address]?.price || 0;
    } catch (error) {
      logger.error('Error getting token price:', error);
      return 0;
    }
  }

  private async getTokenVolume(address: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.JUPITER_API}/volume?address=${address}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.jupiterApiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Jupiter volume fetch failed');
      }

      const data = await response.json();
      return data.volume24h || 0;
    } catch (error) {
      logger.error('Error getting token volume:', error);
      return 0;
    }
  }

  private async getPriceImpact(address: string): Promise<number> {
    try {
      // Get price impact for a standard size trade
      const response = await fetch(
        `${this.JUPITER_API}/quote?inputMint=${address}&amount=1000000`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.jupiterApiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Jupiter price impact fetch failed');
      }

      const data = await response.json();
      return data.priceImpactPct || 0;
    } catch (error) {
      logger.error('Error getting price impact:', error);
      return 100; // Return high impact to skip token
    }
  }

  private async getPreviousVolume(address: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.JUPITER_API}/volume/history?address=${address}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.jupiterApiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Jupiter volume history fetch failed');
      }

      const data = await response.json();
      return data.previousVolume || 0;
    } catch (error) {
      logger.error('Error getting previous volume:', error);
      return 0;
    }
  }

  private meetsMinimumCriteria(metrics: TokenMetrics): boolean {
    return (
      metrics.volume24h >= this.config.minVolume24h &&
      metrics.liquidity >= this.config.minLiquidity &&
      metrics.volumeChange >= this.config.volumeSpike &&
      metrics.priceImpact <= this.config.maxPriceImpact
    );
  }

  private calculateConfidence(metrics: TokenMetrics): number {
    const weights = {
      volume: 0.4,
      liquidity: 0.3,
      priceImpact: 0.3
    };

    // Calculate individual scores
    const scores = {
      volume: Math.min(metrics.volume24h / (this.config.minVolume24h * 2), 1),
      liquidity: Math.min(metrics.liquidity / (this.config.minLiquidity * 2), 1),
      priceImpact: Math.max(0, 1 - (metrics.priceImpact / this.config.maxPriceImpact))
    };

    // Calculate weighted average
    return Object.entries(weights).reduce(
      (total, [key, weight]) => total + scores[key as keyof typeof scores] * weight,
      0
    );
  }
}

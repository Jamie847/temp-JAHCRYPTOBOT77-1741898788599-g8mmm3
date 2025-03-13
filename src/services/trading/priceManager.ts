import { PublicKey } from '@solana/web3.js';
import { logger } from '../logger/index.js';
import { LRUCache } from 'lru-cache';

interface PriceResult {
  price: number;
  confidence: number;
  timestamp: number;
  source?: string; // Make source optional since it's added in some cases
}

export class PriceManager {
  private priceCache: LRUCache<string, PriceResult>;
  private cacheStats = {
    hits: 0,
    misses: 0
  };
  private readonly CACHE_TTL = 5000; // 5 seconds
  private readonly JUPITER_API = {
    PRICE: process.env.JUPITER_PRICE_API || 'https://price-api.jup.ag/v4/price',
    KEY: process.env.JUPITER_API_KEY
  };
  private readonly SOLANA_MINT = 'So11111111111111111111111111111111111111112';

  constructor() {
    this.priceCache = new LRUCache({
      max: 1000,
      ttl: this.CACHE_TTL,
      updateAgeOnGet: true
    });

    if (!this.JUPITER_API.KEY) {
      logger.warn('JUPITER_API_KEY not set - price fetching may be limited');
    }
  }

  async getTokenPrice(tokenMint: PublicKey, quoteMint: PublicKey): Promise<PriceResult> {
    try {
      const cacheKey = `${tokenMint.toString()}-${quoteMint.toString()}`;

      // Check cache first
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.cacheStats.hits++;
        return cached;
      }
      this.cacheStats.misses++;

      // Adjust amount for SOL
      const amount = tokenMint.toString() === this.SOLANA_MINT ? 1e9 : 1e6;

      // Fetch fresh price from Jupiter Pro API
      const response = await fetch(`${this.JUPITER_API.PRICE}?inputMint=${tokenMint.toString()}&outputMint=${quoteMint.toString()}&amount=${amount}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.JUPITER_API.KEY}`
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.data?.price || data.data.price <= 0) {
        throw new Error('Invalid price data received');
      }

      const result: PriceResult = {
        price: data.data.price,
        confidence: 0.95, // High confidence for Pro API
        timestamp: Date.now(),
        source: 'jupiter_pro'
      };

      // Cache the result
      this.priceCache.set(cacheKey, result);

      logger.debug('Price fetched successfully:', {
        token: tokenMint.toString(),
        quote: quoteMint.toString(),
        price: result.price,
        confidence: result.confidence
      });

      return result;
    } catch (error) {
      logger.error('Error fetching price:', error);
      throw error;
    }
  }

  // Add method to clear cache if needed
  clearCache(): void {
    this.priceCache.clear();
  }

  // Add method to get cache stats
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.priceCache.size,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses
    };
  }
}

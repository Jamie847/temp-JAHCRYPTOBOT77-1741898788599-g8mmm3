import { Storage } from '../../storage/index.js';
import { logger } from '../../logger/index.js';

interface HolderMetrics {
  totalHolders: number;
  newHolders24h: number;
  growthRate: number;
  concentration: {
    top10: number;
    top50: number;
    top100: number;
  };
  confidence: number;
}

// Define the shape of cached holder data
interface HolderData {
  current: { totalHolders: number };
  history: { totalHolders: number }[];
}

// Define the shape of cached concentration data
interface CachedConcentration {
  data: { top10: number; top50: number; top100: number };
  timestamp: number;
}

export class HolderAnalyzer {
  private readonly GROWTH_THRESHOLD = 0.1; // 10% daily growth
  private storage: Storage;
  private readonly HEALTHY_DISTRIBUTION = {
    top10: 0.4,  // 40% max for top 10
    top50: 0.7,  // 70% max for top 50
    top100: 0.8  // 80% max for top 100
  };

  constructor() {
    this.storage = new Storage({
      dataDir: './data/holders',
      backupInterval: 300000 // 5 minutes
    });
  }

  async analyzeHolderGrowth(tokenAddress: string): Promise<HolderMetrics> {
    try {
      // Load cached holder data (cast to HolderData)
      const cached = await this.storage.load(`holders_${tokenAddress}`);
      const holderData: HolderData = cached as HolderData || { current: { totalHolders: 0 }, history: [] };

      // Get fresh holder data from APIs
      const freshData = await this.fetchHolderData(tokenAddress);
      
      // Update cache with new data
      holderData.history.push(holderData.current);
      holderData.current = freshData;
      
      // Keep only last 24 hours of history
      holderData.history = holderData.history.slice(-24);
      
      // Store updated data
      await this.storage.store(`holders_${tokenAddress}`, holderData);

      // Calculate growth metrics
      const yesterday = holderData.history[holderData.history.length - 1] || { totalHolders: 0 };
      const growthRate = yesterday.totalHolders > 0
        ? (freshData.totalHolders - yesterday.totalHolders) / yesterday.totalHolders
        : 0;

      const newHolders24h = freshData.totalHolders - yesterday.totalHolders;

      // Get holder concentration
      const concentration = await this.getHolderConcentration(tokenAddress);

      // Calculate confidence score
      const confidence = this.calculateConfidence({
        growthRate,
        concentration,
        totalHolders: freshData.totalHolders
      });

      return {
        totalHolders: freshData.totalHolders,
        newHolders24h,
        growthRate,
        concentration,
        confidence
      };
    } catch (error) {
      logger.error('Error analyzing holder growth:', error);
      return this.getDefaultMetrics();
    }
  }

  private async fetchHolderData(tokenAddress: string): Promise<{ totalHolders: number }> {
    try {
      // Fetch from Birdeye API
      const response = await fetch(
        `https://public-api.birdeye.so/v1/token/holders?address=${tokenAddress}`,
        {
          headers: {
            'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }
      
      const data = await response.json();
      return { totalHolders: data.data?.holderCount || 0 };
    } catch (error) {
      logger.error('Error fetching holder data:', error);
      return { totalHolders: 0 };
    }
  }

  private async getHolderConcentration(
    tokenAddress: string
  ): Promise<{ top10: number; top50: number; top100: number }> {
    try {
      // Load cached concentration data and cast it
      const cachedRaw = await this.storage.load(`concentration_${tokenAddress}`);
      const cached = cachedRaw as CachedConcentration | null;
      if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return cached.data;
      }

      // Fetch from Birdeye API
      const response = await fetch(
        `https://public-api.birdeye.so/v1/token/holder_list?address=${tokenAddress}`,
        {
          headers: {
            'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }
      
      const data = await response.json();
      const holders = data.data?.holders || [];
      
      // Calculate concentration
      const totalSupply = holders.reduce((sum: number, h: any) => sum + h.amount, 0);
      const concentration = {
        top10: this.calculateConcentration(holders.slice(0, 10), totalSupply),
        top50: this.calculateConcentration(holders.slice(0, 50), totalSupply),
        top100: this.calculateConcentration(holders.slice(0, 100), totalSupply)
      };
      
      // Cache the result
      await this.storage.store(`concentration_${tokenAddress}`, {
        data: concentration,
        timestamp: Date.now()
      });

      return concentration;
    } catch (error) {
      logger.error('Error getting holder concentration:', error);
      return {
        top10: 1,
        top50: 1,
        top100: 1
      };
    }
  }

  private calculateConcentration(holders: any[], totalSupply: number): number {
    const holderSum = holders.reduce((sum, h) => sum + h.amount, 0);
    return holderSum / totalSupply;
  }

  private calculateConfidence(params: {
    growthRate: number;
    concentration: { top10: number; top50: number; top100: number };
    totalHolders: number;
  }): number {
    const weights = {
      growth: 0.4,
      distribution: 0.4,
      holders: 0.2
    };

    // Growth score
    const growthScore = Math.min(params.growthRate / this.GROWTH_THRESHOLD, 1);

    // Distribution score
    const distributionScore = (
      (params.concentration.top10 <= this.HEALTHY_DISTRIBUTION.top10 ? 1 : 0) +
      (params.concentration.top50 <= this.HEALTHY_DISTRIBUTION.top50 ? 1 : 0) +
      (params.concentration.top100 <= this.HEALTHY_DISTRIBUTION.top100 ? 1 : 0)
    ) / 3;

    // Holder count score
    const holderScore = Math.min(params.totalHolders / 1000, 1);

    return (
      growthScore * weights.growth +
      distributionScore * weights.distribution +
      holderScore * weights.holders
    );
  }

  private getDefaultMetrics(): HolderMetrics {
    return {
      totalHolders: 0,
      newHolders24h: 0,
      growthRate: 0,
      concentration: {
        top10: 1,
        top50: 1,
        top100: 1
      },
      confidence: 0
    };
  }
}

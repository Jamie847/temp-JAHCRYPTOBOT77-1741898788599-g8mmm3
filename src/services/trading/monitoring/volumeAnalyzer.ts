import { Storage } from '../../storage/index.js';
import { logger } from '../../logger/index.js';

interface VolumeMetrics {
  rvol: number;
  volumeSpikes: {
    oneHour: number;
    fourHour: number;
    daily: number;
  };
  buyPressure: number;
  confidence: number;
}

// Define the shape of the cached volume data
interface CachedVolumeData {
  volumes: number[];
  timestamp: number;
}

// Define the shape of cached trade data (for buy pressure)
interface CachedTradeData {
  buyPressure: number;
  timestamp: number;
}

export class VolumeAnalyzer {
  private readonly VOLUME_CACHE = new Map<string, number[]>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private storage: Storage;
  private readonly SIGNIFICANT_SPIKE = 2.0; // 200% increase

  constructor() {
    this.storage = new Storage({
      dataDir: './data/volume',
      backupInterval: 300000 // 5 minutes
    });
  }

  async calculateRVOL(symbol: string): Promise<VolumeMetrics> {
    try {
      // Load cached volume data and cast it as CachedVolumeData
      const cachedVolume = await this.storage.load(`volume_${symbol}`);
      const volumeData: CachedVolumeData = cachedVolume as CachedVolumeData || { volumes: [], timestamp: 0 };

      // Fetch new volume data if cache is stale
      if (Date.now() - volumeData.timestamp > this.CACHE_TTL) {
        const freshData = await this.fetchVolumeData(symbol);
        volumeData.volumes = freshData;
        volumeData.timestamp = Date.now();
        await this.storage.store(`volume_${symbol}`, volumeData);
      }

      if (!volumeData.volumes.length) {
        return this.getDefaultMetrics();
      }

      // Calculate 7-day average volume (using all available cached volumes)
      const sevenDayAvg = volumeData.volumes.reduce((sum, v) => sum + v, 0) / volumeData.volumes.length;
      
      // Get current volume (assume the first element is the most recent)
      const currentVolume = volumeData.volumes[0];
      
      // Calculate RVOL
      const rvol = currentVolume / sevenDayAvg;

      // Calculate volume spikes over different time windows
      const volumeSpikes = {
        oneHour: this.calculateVolumeSpike(volumeData.volumes, 1),
        fourHour: this.calculateVolumeSpike(volumeData.volumes, 4),
        daily: this.calculateVolumeSpike(volumeData.volumes, 24)
      };

      // Calculate buy pressure (using volume distribution)
      const buyPressure = await this.calculateBuyPressure(symbol, volumeData.volumes);

      // Calculate confidence based on metrics
      const confidence = this.calculateConfidence({
        rvol,
        volumeSpikes,
        buyPressure
      });

      return {
        rvol,
        volumeSpikes,
        buyPressure,
        confidence
      };
    } catch (error) {
      logger.error('Error calculating RVOL:', error);
      return this.getDefaultMetrics();
    }
  }

  private async fetchVolumeData(symbol: string): Promise<number[]> {
    try {
      // Fetch from Jupiter API
      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote/volume?inputMint=${symbol}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.JUPITER_API_KEY}`,
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.volumes || [];
    } catch (error) {
      logger.error('Error fetching volume data:', error);
      return [];
    }
  }

  // Adjusted to work on an array of numbers
  private calculateVolumeSpike(volumes: number[], hours: number): number {
    const recentVolume = volumes.slice(0, hours).reduce((sum, v) => sum + v, 0);
    const previousVolume = volumes.slice(hours, hours * 2).reduce((sum, v) => sum + v, 0);
    return previousVolume > 0 ? recentVolume / previousVolume : 1;
  }

  private async calculateBuyPressure(symbol: string, volumes: number[]): Promise<number> {
    try {
      // Load cached trade data and cast it as CachedTradeData
      const cachedTrade = await this.storage.load(`trades_${symbol}`);
      const tradeData = cachedTrade as CachedTradeData;
      if (tradeData && Date.now() - tradeData.timestamp < 3600000) { // 1 hour cache
        return tradeData.buyPressure;
      }

      // Calculate buy pressure from volume trend using the most recent 12 data points
      const recentVolumes = volumes.slice(0, 12);
      const volumeTrend = this.calculateVolumeTrend(recentVolumes);
      const buyPressure = volumeTrend > 0 ? 0.5 + (volumeTrend / 200) : 0.5 - (Math.abs(volumeTrend) / 200);

      // Cache the result
      await this.storage.store(`trades_${symbol}`, {
        buyPressure,
        timestamp: Date.now()
      } as CachedTradeData);

      return buyPressure;
    } catch (error) {
      logger.error('Error calculating buy pressure:', error);
      return 0.5;
    }
  }

  private calculateVolumeTrend(volumes: number[]): number {
    if (volumes.length < 2) return 0;
    const first = volumes[volumes.length - 1];
    const last = volumes[0];
    return ((last - first) / first) * 100;
  }

  private calculateConfidence(metrics: {
    rvol: number;
    volumeSpikes: { oneHour: number; fourHour: number; daily: number };
    buyPressure: number;
  }): number {
    const weights = {
      rvol: 0.3,
      volumeSpikes: 0.4,
      buyPressure: 0.3
    };

    const rvolScore = Math.min(metrics.rvol / 3, 1);
    const spikeScore = (
      (metrics.volumeSpikes.oneHour > this.SIGNIFICANT_SPIKE ? 1 : 0) +
      (metrics.volumeSpikes.fourHour > this.SIGNIFICANT_SPIKE ? 1 : 0) +
      (metrics.volumeSpikes.daily > this.SIGNIFICANT_SPIKE ? 1 : 0)
    ) / 3;
    
    return (
      rvolScore * weights.rvol +
      spikeScore * weights.volumeSpikes +
      metrics.buyPressure * weights.buyPressure
    );
  }

  private getDefaultMetrics(): VolumeMetrics {
    return {
      rvol: 1,
      volumeSpikes: {
        oneHour: 1,
        fourHour: 1,
        daily: 1
      },
      buyPressure: 0.5,
      confidence: 0
    };
  }
}

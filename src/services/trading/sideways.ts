import { RSI, BollingerBands } from 'technicalindicators';
import { logger } from './logger.js';
import { supabase } from '../supabase/index.js';

interface SidewaysDetectionConfig {
  minPeriod: number;           // Reduced period for faster detection
  maxDeviation: number;        // Maximum price deviation percentage
  bollingerSqueezeThreshold: number; // Bollinger band squeeze threshold
  rsiRangeMin: number;        // RSI range minimum
  rsiRangeMax: number;        // RSI range maximum
  volumeDeclineThreshold: number; // Volume decline percentage
  minTimeInRange: number;      // Minimum time in sideways range
}

export class SidewaysDetector {
  private config: SidewaysDetectionConfig;

  constructor(config?: Partial<SidewaysDetectionConfig>) {
    this.config = {
      minPeriod: 12,           // Reduced to 12 candles for faster detection
      maxDeviation: 2.5,       // 2.5% max deviation
      bollingerSqueezeThreshold: 2.0, // Bollinger bands within 2%
      rsiRangeMin: 40,         // RSI between 40-60 indicates sideways
      rsiRangeMax: 60,
      volumeDeclineThreshold: 15, // 15% volume decline
      minTimeInRange: 900000,     // 15 minutes minimum sideways time
      ...config
    };
  }

  async check(symbol: string): Promise<{ isSideways: boolean; confidence: number }> {
    try {
      const { data: prices } = await supabase
        .from('token_prices')
        .select('price, volume')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(24);
      if (!prices?.length) return { isSideways: false, confidence: 0 };
      return await this.detectSideways(
        prices.map((p: any) => p.price),
        prices.map((p: any) => p.volume)
      );
    } catch (error) {
      logger.error('Error checking sideways movement:', error);
      return { isSideways: false, confidence: 0 };
    }
  }

  async detectSideways(prices: number[], volumes: number[]): Promise<{
    isSideways: boolean;
    confidence: number;
    metrics: {
      priceDeviation: number;
      bollingerSqueeze: number;
      rsiRange: boolean;
      volumeDecline: number;
      duration: number;
    };
  }> {
    try {
      if (prices.length < this.config.minPeriod) {
        return { 
          isSideways: false, 
          confidence: 0,
          metrics: {
            priceDeviation: 0,
            bollingerSqueeze: 0,
            rsiRange: false,
            volumeDecline: 0,
            duration: 0
          }
        };
      }

      // Calculate price deviation
      const recentPrices = prices.slice(-this.config.minPeriod);
      const priceDeviation = this.calculatePriceDeviation(recentPrices);

      // Calculate Bollinger Band squeeze
      const bb = new BollingerBands({
        period: 20,
        stdDev: 2,
        values: recentPrices
      });
      const bbValues = bb.getResult();
      const latestBB = bbValues[bbValues.length - 1];
      const bollingerSqueeze = ((latestBB.upper - latestBB.lower) / latestBB.middle) * 100;

      // Calculate RSI
      const rsi = new RSI({ values: recentPrices, period: 14 });
      const rsiValues = rsi.getResult();
      const latestRSI = rsiValues[rsiValues.length - 1];
      const rsiRange = latestRSI >= this.config.rsiRangeMin && 
                      latestRSI <= this.config.rsiRangeMax;

      // Calculate volume decline
      const volumeDecline = this.calculateVolumeDecline(volumes);

      // Calculate sideways duration
      const duration = this.calculateSidewaysDuration(prices);

      // Determine if market is sideways
      const isSideways = 
        priceDeviation <= this.config.maxDeviation &&
        bollingerSqueeze <= this.config.bollingerSqueezeThreshold &&
        rsiRange &&
        volumeDecline >= this.config.volumeDeclineThreshold &&
        duration >= this.config.minPeriod;

      // Calculate confidence score
      const confidence = this.calculateConfidence({
        priceDeviation,
        bollingerSqueeze,
        rsiRange,
        volumeDecline,
        duration
      });

      return {
        isSideways,
        confidence,
        metrics: {
          priceDeviation,
          bollingerSqueeze,
          rsiRange,
          volumeDecline,
          duration
        }
      };
    } catch (error) {
      logger.error('Error detecting sideways movement:', error);
      throw error;
    }
  }

  private calculatePriceDeviation(prices: number[]): number {
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const deviations = prices.map(price => Math.abs((price - mean) / mean) * 100);
    return Math.max(...deviations);
  }

  private calculateVolumeDecline(volumes: number[]): number {
    const recentVolumes = volumes.slice(-this.config.minPeriod);
    const averageVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const initialVolume = volumes[volumes.length - this.config.minPeriod];
    return ((initialVolume - averageVolume) / initialVolume) * 100;
  }

  private calculateSidewaysDuration(prices: number[]): number {
    let duration = 0;
    const threshold = this.config.maxDeviation / 100;
    const basePrice = prices[prices.length - 1];

    for (let i = prices.length - 2; i >= 0; i--) {
      const deviation = Math.abs((prices[i] - basePrice) / basePrice);
      if (deviation > threshold) break;
      duration++;
    }

    return duration;
  }

  private calculateConfidence(metrics: {
    priceDeviation: number;
    bollingerSqueeze: number;
    rsiRange: boolean;
    volumeDecline: number;
    duration: number;
  }): number {
    const weights = {
      priceDeviation: 0.3,
      bollingerSqueeze: 0.2,
      rsiRange: 0.2,
      volumeDecline: 0.15,
      duration: 0.15
    };

    const scores = {
      priceDeviation: Math.max(0, 100 - (metrics.priceDeviation / this.config.maxDeviation) * 100),
      bollingerSqueeze: Math.max(0, 100 - (metrics.bollingerSqueeze / this.config.bollingerSqueezeThreshold) * 100),
      rsiRange: metrics.rsiRange ? 100 : 0,
      volumeDecline: (metrics.volumeDecline / this.config.volumeDeclineThreshold) * 100,
      duration: Math.min(100, (metrics.duration / this.config.minPeriod) * 100)
    };

    return Object.entries(weights).reduce(
      (total, [key, weight]) => total + scores[key as keyof typeof scores] * weight,
      0
    );
  }
}

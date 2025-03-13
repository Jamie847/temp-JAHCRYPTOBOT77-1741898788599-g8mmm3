import { PublicKey } from '@solana/web3.js';
import { VolatilityAdjustedPositionSizer } from './positionSizer.js';
import { DynamicStopLossCalculator } from './stopLossCalculator.js';
import { RegimeDetector } from './regimeDetector.js';
import { logger } from '../../logger/index.js';
import { PriceManager } from '../priceManager.js';

interface ForecastResult {
  regime: 'low' | 'medium' | 'high' | 'extreme';
  predictedVolatility: number;
  currentVolatility: number;
  metrics: {
    atrRatio: number;
    [key: string]: any;
  };
}

export class VolatilityManager {
  private positionSizer: VolatilityAdjustedPositionSizer;
  private stopLossCalculator: DynamicStopLossCalculator;
  private regimeDetector: RegimeDetector;
  private priceManager: PriceManager;

  // Re-export PublicKey for use by consumers
  static PublicKey = PublicKey;

  constructor(config: {
    positionSizing: {
      baseSize: number;
      maxSize: number;
      accountSize: number;
      riskPerTrade: number;
      confidenceMultipliers: {
        low: number;
        medium: number;
        high: number;
      };
    };
    stopLoss: {
      baseStopLoss: number;
      maxStopLoss: number;
      minStopLoss: number;
      trailingConfig: {
        enabled: boolean;
        activationThreshold: number;
        callbackRate: number;
        accelerationThreshold: number;
        minCallback: number;
      };
    };
  }) {
    this.priceManager = new PriceManager();
    this.positionSizer = new VolatilityAdjustedPositionSizer(config.positionSizing);
    this.stopLossCalculator = new DynamicStopLossCalculator(config.stopLoss);
    this.regimeDetector = new RegimeDetector();
  }

  async getLatestPrice(tokenMint: PublicKey, quoteMint: PublicKey): Promise<number> {
    const priceResult = await this.priceManager.getTokenPrice(tokenMint, quoteMint);
    return priceResult.price;
  }

  async analyzeVolatility(params: {
    symbol: string;
    strategy: string;
    confidence: number;
    price: number;
    side: 'long' | 'short';
  }): Promise<{
    regime: ForecastResult;
    position: Awaited<ReturnType<typeof VolatilityAdjustedPositionSizer.prototype.calculatePositionSize>>;
    stopLoss: Awaited<ReturnType<typeof DynamicStopLossCalculator.prototype.calculateStopLoss>>;
    priceStats?: {
      current: number;
      confidence: number;
      cacheStats: {
        hits: number;
        misses: number;
      };
    };
  }> {
    try {

      // Get volatility forecast
      const forecast = await this.regimeDetector.getForecast(params.symbol);
      
      // Create forecast object with correct typing
      // Calculate position size
      const position = await this.positionSizer.calculatePositionSize({
        volatilityForecast: forecast,
        confidence: params.confidence,
        price: params.price,
        strategy: params.strategy
      });

      // Calculate stop loss
      const stopLoss = await this.stopLossCalculator.calculateStopLoss({
        entryPrice: params.price,
        volatilityForecast: forecast,
        side: params.side,
        strategy: params.strategy
      });

      logger.info('Volatility analysis completed:', {
        symbol: params.symbol,
        regime: forecast.regime,
        position: {
          size: position.size,
          risk: position.adjustedRisk
        },
        stopLoss: {
          initial: stopLoss.initialStop,
          trailing: stopLoss.trailingConfig
        }
      });

      return {
        regime: forecast,
        position,
        stopLoss
      };
    } catch (error) {
      logger.error('Error in volatility analysis:', error);
      throw error;
    }
  }
}
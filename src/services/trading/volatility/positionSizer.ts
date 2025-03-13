import { logger } from '../../logger/index.js';

interface ForecastResult {
  regime: 'low' | 'medium' | 'high' | 'extreme';
  predictedVolatility: number;
  currentVolatility: number;
  metrics: {
    atrRatio: number;
  };
}

interface PositionSizeConfig {
  baseSize: number;
  maxSize: number;
  accountSize: number;
  riskPerTrade: number;
  confidenceMultipliers: {
    low: number;
    medium: number;
    high: number;
  };
}

export class VolatilityAdjustedPositionSizer {
  private readonly config: PositionSizeConfig;
  private readonly VOLATILITY_ADJUSTMENTS = {
    low: 1.2,      // Increase position size in low volatility
    medium: 1.0,   // Normal position size
    high: 0.7,     // Reduce position size in high volatility
    extreme: 0.5   // Significantly reduce position size in extreme volatility
  };

  constructor(config: PositionSizeConfig) {
    this.config = config;
  }

  calculatePositionSize(params: {
    volatilityForecast: ForecastResult;
    confidence: number;
    price: number;
    strategy: string;
  }): {
    size: number;
    adjustedRisk: number;
    reasoning: string[];
  } {
    try {
      const reasoning: string[] = [];
      
      // Start with base position size
      let size = this.config.baseSize;
      reasoning.push(`Base position size: $${size}`);

      // Adjust for volatility regime
      const volMultiplier = this.VOLATILITY_ADJUSTMENTS[params.volatilityForecast.regime];
      size *= volMultiplier;
      reasoning.push(`Volatility adjustment (${params.volatilityForecast.regime} regime): ${volMultiplier}x`);

      // Adjust for confidence
      const confidenceMultiplier = this.getConfidenceMultiplier(params.confidence);
      size *= confidenceMultiplier;
      reasoning.push(`Confidence adjustment: ${confidenceMultiplier}x`);

      // Adjust for predicted volatility change
      if (params.volatilityForecast.predictedVolatility > params.volatilityForecast.currentVolatility) {
        const volReduction = 1 - (params.volatilityForecast.predictedVolatility - params.volatilityForecast.currentVolatility);
        size *= Math.max(0.5, volReduction);
        reasoning.push(`Predicted volatility increase adjustment: ${volReduction}x`);
      }

      // Strategy-specific adjustments
      size = this.applyStrategyAdjustments(size, params.strategy, reasoning);

      // Risk-based position sizing
      const riskAmount = this.config.accountSize * (this.config.riskPerTrade / 100);
      const maxPositionFromRisk = riskAmount / (params.volatilityForecast.currentVolatility / 100);
      size = Math.min(size, maxPositionFromRisk);
      reasoning.push(`Risk-adjusted maximum: $${maxPositionFromRisk.toFixed(2)}`);

      // Apply maximum size limit
      size = Math.min(size, this.config.maxSize);
      reasoning.push(`Final position size (after max limit): $${size.toFixed(2)}`);

      // Calculate adjusted risk percentage
      const adjustedRisk = (size / this.config.accountSize) * 100;

      return {
        size,
        adjustedRisk,
        reasoning
      };
    } catch (error) {
      logger.error('Error calculating position size:', error);
      return {
        size: 0,
        adjustedRisk: 0,
        reasoning: ['Error calculating position size']
      };
    }
  }

  private getConfidenceMultiplier(confidence: number): number {
    if (confidence >= 0.8) return this.config.confidenceMultipliers.high;
    if (confidence >= 0.6) return this.config.confidenceMultipliers.medium;
    return this.config.confidenceMultipliers.low;
  }

  private applyStrategyAdjustments(
    size: number,
    strategy: string,
    reasoning: string[]
  ): number {
    switch (strategy.toLowerCase()) {
      case 'trend':
        size *= 1.2; // Increase size for trend following
        reasoning.push('Trend strategy adjustment: 1.2x');
        break;
      case 'momentum':
        size *= 1.1; // Slight increase for momentum
        reasoning.push('Momentum strategy adjustment: 1.1x');
        break;
      case 'mean_reversion':
        size *= 0.9; // Reduce size for mean reversion
        reasoning.push('Mean reversion strategy adjustment: 0.9x');
        break;
      case 'arbitrage':
        size *= 1.5; // Larger size for arbitrage
        reasoning.push('Arbitrage strategy adjustment: 1.5x');
        break;
      default:
        reasoning.push('No strategy-specific adjustment applied');
    }
    return size;
  }
}

import { logger } from '../../logger/index.js';

/**
 * ForecastResult defines the structure expected by this module.
 * Adjust the allowed regime values and properties as needed.
 */
interface ForecastResult {
  regime: 'low' | 'medium' | 'high' | 'extreme';
  predictedVolatility: number;
  currentVolatility: number;
  metrics: {
    atrRatio: number;
  };
}

interface StopLossConfig {
  baseStopLoss: number;
  maxStopLoss: number;
  minStopLoss: number;
  trailingConfig: {
    enabled: boolean;
    callbackRate: number;
    accelerationThreshold: number;
    minCallback: number;
  };
}

export class DynamicStopLossCalculator {
  private readonly config: StopLossConfig;
  private readonly VOLATILITY_ADJUSTMENTS = {
    low: 0.8,      // Tighter stops in low volatility
    medium: 1.0,   // Base stop distance
    high: 1.3,     // Wider stops in high volatility
    extreme: 1.5   // Much wider stops in extreme volatility
  };

  constructor(config: StopLossConfig) {
    this.config = config;
  }

  calculateStopLoss(params: {
    entryPrice: number;
    volatilityForecast: ForecastResult;
    side: 'long' | 'short';
    strategy: string;
  }): {
    initialStop: number;
    trailingConfig: {
      enabled: boolean;
      callback: number;
      acceleration: {
        threshold: number;
        minCallback: number;
      };
    };
    reasoning: string[];
  } {
    try {
      const reasoning: string[] = [];
      
      // Start with base stop loss percentage
      let stopDistance = this.config.baseStopLoss;
      reasoning.push(`Base stop distance: ${stopDistance}%`);

      // Adjust for volatility regime using the forecast's regime property
      const volMultiplier = this.VOLATILITY_ADJUSTMENTS[params.volatilityForecast.regime];
      stopDistance *= volMultiplier;
      reasoning.push(`Volatility regime adjustment (${params.volatilityForecast.regime}): ${volMultiplier}x`);

      // Adjust for predicted volatility change
      if (params.volatilityForecast.predictedVolatility > params.volatilityForecast.currentVolatility) {
        const increase = params.volatilityForecast.predictedVolatility / params.volatilityForecast.currentVolatility;
        stopDistance *= increase;
        reasoning.push(`Predicted volatility adjustment: ${increase.toFixed(2)}x`);
      }

      // Strategy-specific adjustments
      stopDistance = this.applyStrategyAdjustments(stopDistance, params.strategy, reasoning);

      // Apply ATR-based adjustment
      const atrAdjustment = this.calculateATRAdjustment(params.volatilityForecast);
      stopDistance *= atrAdjustment;
      reasoning.push(`ATR-based adjustment: ${atrAdjustment.toFixed(2)}x`);

      // Ensure stop loss is within bounds
      stopDistance = Math.max(this.config.minStopLoss, Math.min(this.config.maxStopLoss, stopDistance));
      reasoning.push(`Final stop distance (after bounds): ${stopDistance.toFixed(2)}%`);

      // Calculate actual stop price based on side
      const initialStop = params.side === 'long'
        ? params.entryPrice * (1 - stopDistance / 100)
        : params.entryPrice * (1 + stopDistance / 100);

      // Configure trailing stop
      const trailingConfig = this.configureTrailingStop(params.volatilityForecast, params.strategy);

      return {
        initialStop,
        trailingConfig,
        reasoning
      };
    } catch (error) {
      logger.error('Error calculating stop loss:', error);
      throw error;
    }
  }

  private calculateATRAdjustment(forecast: ForecastResult): number {
    const baseAdjustment = forecast.metrics.atrRatio * 100;
    return Math.max(0.5, Math.min(2.0, baseAdjustment));
  }

  private applyStrategyAdjustments(
    stopDistance: number,
    strategy: string,
    reasoning: string[]
  ): number {
    switch (strategy.toLowerCase()) {
      case 'trend':
        stopDistance *= 1.2; // Wider stops for trend following
        reasoning.push('Trend strategy adjustment: 1.2x');
        break;
      case 'momentum':
        stopDistance *= 1.1; // Slightly wider stops for momentum
        reasoning.push('Momentum strategy adjustment: 1.1x');
        break;
      case 'mean_reversion':
        stopDistance *= 0.8; // Tighter stops for mean reversion
        reasoning.push('Mean reversion strategy adjustment: 0.8x');
        break;
      case 'arbitrage':
        stopDistance *= 0.5; // Much tighter stops for arbitrage
        reasoning.push('Arbitrage strategy adjustment: 0.5x');
        break;
      default:
        reasoning.push('No strategy-specific adjustment applied');
    }
    return stopDistance;
  }

  private configureTrailingStop(
    forecast: ForecastResult,
    strategy: string
  ): {
    enabled: boolean;
    callback: number;
    acceleration: {
      threshold: number;
      minCallback: number;
    };
  } {
    if (!this.config.trailingConfig.enabled) {
      return {
        enabled: false,
        callback: this.config.trailingConfig.callbackRate,
        acceleration: {
          threshold: this.config.trailingConfig.accelerationThreshold,
          minCallback: this.config.trailingConfig.minCallback
        }
      };
    }

    // Start with base callback rate
    let callback = this.config.trailingConfig.callbackRate;

    // Adjust callback based on volatility regime
    callback *= this.VOLATILITY_ADJUSTMENTS[forecast.regime];

    // Strategy-specific adjustments
    switch (strategy.toLowerCase()) {
      case 'trend':
        callback *= 1.2; // Wider trailing stop for trends
        break;
      case 'momentum':
        callback *= 1.1; // Slightly wider trailing stop for momentum
        break;
      case 'mean_reversion':
        callback *= 0.8; // Tighter trailing stop for mean reversion
        break;
      case 'arbitrage':
        callback *= 0.5; // Much tighter trailing stop for arbitrage
        break;
    }

    // Configure acceleration based on volatility
    const acceleration = {
      threshold: this.config.trailingConfig.accelerationThreshold,
      minCallback: Math.max(
        this.config.trailingConfig.minCallback,
        callback * (forecast.regime === 'high' ? 0.4 : 0.3)
      )
    };

    return {
      enabled: true,
      callback,
      acceleration
    };
  }
}

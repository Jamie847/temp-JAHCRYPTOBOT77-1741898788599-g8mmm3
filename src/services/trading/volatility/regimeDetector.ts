import { logger } from '../../logger/index.js';
import { VolatilityForecaster } from './forecaster';
import { supabase } from '../../supabase/index.js';

interface MarketRegime {
  regime: 'low_volatility' | 'high_volatility' | 'trending' | 'ranging' | 'crisis';
  confidence: number;
  metrics: {
    volatility: number;
    trend: number;
    correlation: number;
    momentum: number;
  };
  signals: {
    volatilityBreakout: boolean;
    trendChange: boolean;
    momentumShift: boolean;
    regimeChange: boolean;
  };
  timestamp: Date;
}

export class RegimeDetector {
  private readonly LOOKBACK_PERIODS = 50;
  private readonly TREND_STRENGTH_THRESHOLD = 0.6;
  private readonly CORRELATION_THRESHOLD = 0.7;
  private readonly volatilityForecaster: VolatilityForecaster;
  private lastRegime: MarketRegime | null = null;

  constructor() {
    this.volatilityForecaster = new VolatilityForecaster();
  }

  async getForecast(symbol: string): Promise<{
    regime: 'low' | 'medium' | 'high' | 'extreme';
    predictedVolatility: number;
    currentVolatility: number;
    metrics: {
      atrRatio: number;
      [key: string]: any;
    };
  }> {
    try {
      const forecast = await this.volatilityForecaster.getForecast(symbol);
      const regime = await this.detectRegime(symbol, forecast);

      return {
        regime: regime.regime === 'crisis' ? 'extreme' :
                regime.regime === 'high_volatility' ? 'high' :
                regime.regime === 'low_volatility' ? 'low' : 'medium',
        predictedVolatility: forecast.predictedVolatility,
        currentVolatility: forecast.currentVolatility,
        metrics: {
          atrRatio: forecast.metrics.atrRatio || 0,
          ...forecast.metrics
        }
      };
    } catch (error) {
      logger.error('Error getting volatility forecast:', error);
      return {
        regime: 'medium',
        predictedVolatility: 0,
        currentVolatility: 0,
        metrics: { atrRatio: 0 }
      };
    }
  }
  async detectRegime(
    symbol: string, 
    volatilityForecast: Awaited<ReturnType<VolatilityForecaster['getForecast']>>
  ): Promise<MarketRegime> {
    try {
      // Get historical price data
      const { data: prices } = await supabase
        .from('token_prices')
        .select('price, volume')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(this.LOOKBACK_PERIODS);

      if (!prices || prices.length < this.LOOKBACK_PERIODS) {
        throw new Error('Insufficient price history for regime detection');
      }

      // Calculate regime metrics
      const metrics = {
        volatility: volatilityForecast.currentVolatility,
        trend: this.calculateTrendStrength(prices.map(p => p.price)),
        correlation: this.calculateMarketCorrelation(prices.map(p => p.price)),
        momentum: this.calculateMomentum(prices.map(p => p.price))
      };

      // Determine current regime
      const regime = this.determineRegime(metrics, volatilityForecast);

      // Generate trading signals
      const signals = this.generateSignals(regime, metrics);

      // Calculate confidence in regime classification
      const confidence = this.calculateConfidence(metrics, signals);

      const currentRegime: MarketRegime = {
        regime,
        confidence,
        metrics,
        signals,
        timestamp: new Date()
      };

      // Store regime change if significant
      if (this.isSignificantRegimeChange(this.lastRegime, currentRegime)) {
        await this.storeRegimeChange(symbol, currentRegime);
      }

      this.lastRegime = currentRegime;
      return currentRegime;
    } catch (error) {
      logger.error('Error detecting market regime:', error);
      throw error;
    }
  }

  private calculateTrendStrength(prices: number[]): number {
    const returns = prices.slice(1).map((price, i) => price - prices[i]);
    const positiveReturns = returns.filter(r => r > 0).length;
    return positiveReturns / returns.length;
  }

  private calculateMarketCorrelation(prices: number[]): number {
    const n = prices.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = prices;

    const sum_x = x.reduce((a, b) => a + b, 0);
    const sum_y = y.reduce((a, b) => a + b, 0);
    const sum_xy = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sum_x2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sum_y2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sum_xy - sum_x * sum_y;
    const denominator = Math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y));
    
    return numerator / denominator;
  }

  private calculateMomentum(prices: number[]): number {
    const shortPeriod = 10;
    const longPeriod = 30;

    const shortMA = prices.slice(0, shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
    const longMA = prices.slice(0, longPeriod).reduce((a, b) => a + b, 0) / longPeriod;

    return (shortMA - longMA) / longMA;
  }

  private determineRegime(
    metrics: MarketRegime['metrics'],
    _volatilityForecast: Awaited<ReturnType<VolatilityForecaster['getForecast']>>
  ): MarketRegime['regime'] {
    // Crisis regime detection
    if (metrics.volatility > 0.8 && metrics.correlation > 0.8) {
      return 'crisis';
    }

    // Trending market detection
    if (metrics.trend > this.TREND_STRENGTH_THRESHOLD) {
      return metrics.volatility > 0.3 ? 'high_volatility' : 'trending';
    }

    // Ranging market detection
    if (metrics.trend < 0.3 && metrics.volatility < 0.2) {
      return 'ranging';
    }

    // Volatility regime detection
    return metrics.volatility > 0.3 ? 'high_volatility' : 'low_volatility';
  }

  private generateSignals(
    currentRegime: MarketRegime['regime'],
    metrics: MarketRegime['metrics']
  ): MarketRegime['signals'] {
    return {
      volatilityBreakout: metrics.volatility > (this.lastRegime?.metrics.volatility || 0) * 1.5,
      trendChange: Math.abs(metrics.trend - (this.lastRegime?.metrics.trend || 0)) > this.TREND_STRENGTH_THRESHOLD,
      momentumShift: Math.abs(metrics.momentum) > 2.0,
      regimeChange: this.lastRegime ? currentRegime !== this.lastRegime.regime : false
    };
  }

  private calculateConfidence(
    metrics: MarketRegime['metrics'],
    signals: MarketRegime['signals']
  ): number {
    const weights = {
      volatility: 0.3,
      trend: 0.3,
      correlation: 0.2,
      momentum: 0.2
    };

    // Calculate individual confidence scores
    const scores = {
      volatility: Math.min(1, Math.max(0, 1 - metrics.volatility / 1.0)),
      trend: Math.min(1, metrics.trend / this.TREND_STRENGTH_THRESHOLD),
      correlation: Math.min(1, Math.abs(metrics.correlation) / this.CORRELATION_THRESHOLD),
      momentum: Math.min(1, Math.abs(metrics.momentum) / 2.0)
    };

    // Calculate weighted average confidence
    let confidence = Object.entries(weights).reduce(
      (total, [key, weight]) => total + scores[key as keyof typeof scores] * weight,
      0
    );

    // Adjust confidence based on signals
    if (signals.regimeChange) confidence *= 0.8;
    if (signals.volatilityBreakout) confidence *= 0.9;

    return Math.max(0, Math.min(1, confidence));
  }

  private isSignificantRegimeChange(
    lastRegime: MarketRegime | null,
    currentRegime: MarketRegime
  ): boolean {
    if (!lastRegime) return true;
    if (lastRegime.regime !== currentRegime.regime) return true;
    if (Math.abs(lastRegime.confidence - currentRegime.confidence) > 0.2) return true;
    return false;
  }

  private async storeRegimeChange(symbol: string, regime: MarketRegime) {
    try {
      await supabase.from('market_regimes').insert([{
        symbol,
        regime: regime.regime,
        confidence: regime.confidence,
        metrics: regime.metrics,
        signals: regime.signals,
        timestamp: regime.timestamp.toISOString()
      }]);
    } catch (error) {
      logger.error('Error storing regime change:', error);
    }
  }
}
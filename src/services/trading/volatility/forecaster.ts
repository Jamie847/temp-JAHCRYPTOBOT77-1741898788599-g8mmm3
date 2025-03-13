import { logger } from '../../logger/index.js';
import { RSI, BollingerBands, ATR } from 'technicalindicators';
import { supabase } from '../../supabase/index.js';

export class VolatilityForecaster {
  private readonly LOOKBACK_PERIODS = 20;
  private readonly FORECAST_PERIODS = 5;

  async getForecast(symbol: string): Promise<{
    currentVolatility: number;
    predictedVolatility: number;
    confidence: number;
    metrics: {
      historicalVolatility: number;
      impliedVolatility: number;
      garchForecast: number;
      bollingerWidth: number;
      atrRatio: number;
      rsiVolatility: number;
      volumeProfile: {
        recent: number;
        historical: number;
        ratio: number;
      };
    };
    signals: {
      volatilityBreakout: boolean;
      compressionDetected: boolean;
      regimeChange: boolean;
      trendStrength: number;
    };
  }> {
    try {
      // Get historical price data
      const { data: prices } = await supabase
        .from('token_prices')
        .select('price, volume')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (!prices || prices.length < this.LOOKBACK_PERIODS) {
        return this.getDefaultForecast();
      }

      // Calculate core volatility metrics
      const historicalVol = this.calculateHistoricalVolatility(prices.map(p => p.price));
      const garchForecast = this.calculateGARCHForecast(prices.map(p => p.price));
      const bollingerMetrics = this.calculateBollingerMetrics(prices.map(p => p.price));
      const atrMetrics = this.calculateATRMetrics(prices);
      const rsiVolatility = this.calculateRSIVolatility(prices.map(p => p.price));
      const volumeProfile = this.analyzeVolumeProfile(prices);

      // Generate forecast
      const currentVolatility = this.calculateCurrentVolatility({
        historicalVol,
        garchForecast,
        bollingerMetrics,
        atrMetrics
      });

      const predictedVolatility = this.predictFutureVolatility({
        currentVolatility,
        garchForecast,
        volumeProfile,
        rsiVolatility
      });

      // Generate signals
      const signals = {
        volatilityBreakout: currentVolatility > historicalVol * 1.5,
        compressionDetected: bollingerMetrics.compression,
        regimeChange: Math.abs(predictedVolatility - currentVolatility) / currentVolatility > 0.2,
        trendStrength: atrMetrics.trendStrength
      };

      // Calculate confidence
      const confidence = this.calculateConfidence({
        historicalVol,
        currentVolatility,
        predictedVolatility,
        signals
      });

      return {
        currentVolatility,
        predictedVolatility,
        confidence,
        metrics: {
          historicalVolatility: historicalVol,
          impliedVolatility: 0, // Would require options data
          garchForecast,
          bollingerWidth: bollingerMetrics.width,
          atrRatio: atrMetrics.atrRatio,
          rsiVolatility,
          volumeProfile
        },
        signals
      };
    } catch (error) {
      logger.error('Error generating volatility forecast:', error);
      return this.getDefaultForecast();
    }
  }

  private getDefaultForecast() {
    return {
      currentVolatility: 0.3, // Moderate volatility
      predictedVolatility: 0.3,
      confidence: 0.5,
      metrics: {
        historicalVolatility: 0.3,
        impliedVolatility: 0,
        garchForecast: 0.3,
        bollingerWidth: 0.02,
        atrRatio: 0.02,
        rsiVolatility: 30,
        volumeProfile: {
          recent: 0,
          historical: 0,
          ratio: 1
        }
      },
      signals: {
        volatilityBreakout: false,
        compressionDetected: false,
        regimeChange: false,
        trendStrength: 0.5
      }
    };
  }

  private calculateHistoricalVolatility(prices: number[]): number {
    const returns = prices.slice(1).map((price, i) => 
      Math.log(price / prices[i])
    );
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => 
      sum + Math.pow(ret - mean, 2), 0
    ) / returns.length;
    return Math.sqrt(variance * 252); // Annualized
  }

  private calculateGARCHForecast(prices: number[]): number {
    const returns = prices.slice(1).map((price, i) => 
      Math.log(price / prices[i])
    );
    
    // Simple GARCH(1,1) implementation
    const omega = 0.000001;
    const alpha = 0.1;
    const beta = 0.8;
    
    let variance = returns.reduce((sum, ret) => sum + ret * ret, 0) / returns.length;
    let forecast = variance;
    
    for (let i = 0; i < this.FORECAST_PERIODS; i++) {
      forecast = omega + alpha * returns[returns.length - 1] ** 2 + beta * variance;
      variance = forecast;
    }
    
    return Math.sqrt(forecast * 252); // Annualized
  }

  private calculateBollingerMetrics(prices: number[]): {
    width: number;
    percentB: number;
    compression: boolean;
  } {
    const bb = new BollingerBands({
      period: 20,
      stdDev: 2,
      values: prices
    });
    const bbValues = bb.getResult();
    const latest = bbValues[bbValues.length - 1];
    
    const width = (latest.upper - latest.lower) / latest.middle;
    const percentB = (prices[prices.length - 1] - latest.lower) / (latest.upper - latest.lower);
    
    // Detect Bollinger Band compression
    const previousWidth = (bbValues[bbValues.length - 2].upper - bbValues[bbValues.length - 2].lower) / 
                         bbValues[bbValues.length - 2].middle;
    const compression = width < previousWidth * 0.8; // 20% compression threshold
    
    return { width, percentB, compression };
  }

  private calculateATRMetrics(prices: any[]): {
    atrRatio: number;
    trendStrength: number;
  } {
    const atr = new ATR({
      high: prices.map(p => p.price * 1.001), // Approximate high
      low: prices.map(p => p.price * 0.999),  // Approximate low
      close: prices.map(p => p.price),
      period: 14
    });
    
    const atrValues = atr.getResult();
    const currentATR = atrValues[atrValues.length - 1];
    const atrRatio = currentATR / prices[prices.length - 1].price;
    
    // Calculate trend strength using ATR
    const averageATR = atrValues.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
    const trendStrength = currentATR / averageATR;
    
    return { atrRatio, trendStrength };
  }

  private calculateRSIVolatility(prices: number[]): number {
    const rsi = new RSI({ values: prices, period: 14 });
    const rsiValues = rsi.getResult();
    
    // Calculate RSI volatility as standard deviation of RSI changes
    const rsiChanges = rsiValues.slice(1).map((val, i) => 
      Math.abs(val - rsiValues[i])
    );
    
    const mean = rsiChanges.reduce((sum, val) => sum + val, 0) / rsiChanges.length;
    const variance = rsiChanges.reduce((sum, val) => 
      sum + Math.pow(val - mean, 2), 0
    ) / rsiChanges.length;
    
    return Math.sqrt(variance);
  }

  private analyzeVolumeProfile(prices: any[]): {
    recent: number;
    historical: number;
    ratio: number;
  } {
    const recentPeriod = 20; // Last 20 periods
    const recentVolumes = prices.slice(0, recentPeriod).map(p => p.volume);
    const historicalVolumes = prices.map(p => p.volume);
    
    const recentAvg = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentPeriod;
    const historicalAvg = historicalVolumes.reduce((sum, vol) => sum + vol, 0) / prices.length;
    
    return {
      recent: recentAvg,
      historical: historicalAvg,
      ratio: recentAvg / historicalAvg
    };
  }

  private calculateCurrentVolatility(params: {
    historicalVol: number;
    garchForecast: number;
    bollingerMetrics: { width: number; percentB: number; compression: boolean };
    atrMetrics: { atrRatio: number; trendStrength: number };
  }): number {
    const weights = {
      historical: 0.3,
      garch: 0.3,
      bollinger: 0.2,
      atr: 0.2
    };

    return (
      params.historicalVol * weights.historical +
      params.garchForecast * weights.garch +
      (params.bollingerMetrics.width * 100) * weights.bollinger +
      (params.atrMetrics.atrRatio * 100) * weights.atr
    );
  }

  private predictFutureVolatility(params: {
    currentVolatility: number;
    garchForecast: number;
    volumeProfile: { ratio: number };
    rsiVolatility: number;
  }): number {
    // Adjust GARCH forecast based on volume and RSI volatility
    let prediction = params.garchForecast;

    // Volume adjustment
    if (params.volumeProfile.ratio > 1.5) {
      prediction *= 1.2; // Increase predicted volatility if volume is rising
    } else if (params.volumeProfile.ratio < 0.5) {
      prediction *= 0.8; // Decrease predicted volatility if volume is falling
    }

    // RSI volatility adjustment
    const rsiAdjustment = params.rsiVolatility > 30 ? 1.1 : 0.9;
    prediction *= rsiAdjustment;

    // Mean reversion tendency
    const meanReversionFactor = 0.8;
    prediction = params.currentVolatility * (1 - meanReversionFactor) + prediction * meanReversionFactor;

    return prediction;
  }

  private calculateConfidence(params: {
    historicalVol: number;
    currentVolatility: number;
    predictedVolatility: number;
    signals: {
      volatilityBreakout: boolean;
      compressionDetected: boolean;
      regimeChange: boolean;
      trendStrength: number;
    };
  }): number {
    // Base confidence on forecast consistency
    const volDiff = Math.abs(params.predictedVolatility - params.currentVolatility);
    let confidence = Math.max(0, 1 - volDiff / params.currentVolatility);

    // Adjust confidence based on signals
    if (params.signals.volatilityBreakout) confidence *= 0.8;
    if (params.signals.compressionDetected) confidence *= 1.2;
    if (params.signals.regimeChange) confidence *= 0.7;

    // Trend strength adjustment
    confidence *= 0.8 + (params.signals.trendStrength * 0.4);

    return Math.max(0, Math.min(1, confidence));
  }
}
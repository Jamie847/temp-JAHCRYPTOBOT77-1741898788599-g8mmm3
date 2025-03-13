import { supabase } from '../supabase.js';
import { logger } from '../logger/browser.js';
import { RSI, ATR, BollingerBands } from 'technicalindicators';

const VOLATILITY_CACHE = new Map<string, { value: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface VolatilityMetrics {
  historicalVolatility: number;
  impliedVolatility: number;
  bollingerWidth: number;
  atrRatio: number;
  volatilityRegime: 'low' | 'medium' | 'high' | 'extreme';
  rsiVolatility: number;
  priceSwings: {
    recent: number;
    historical: number;
    ratio: number;
  };
}

export async function calculateVolatility(symbol: string, period: number = 14): Promise<number> {
  try {
    // Check cache first
    const cached = VOLATILITY_CACHE.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value;
    }

    // Get extended historical prices for better analysis
    const { data: prices } = await supabase
      .from('token_prices')
      .select('price, high, low, volume')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(100); // Get more data for comprehensive analysis

    if (!prices || prices.length < period) {
      throw new Error('Insufficient price data');
    }

    const metrics = await calculateVolatilityMetrics(prices);
    const volatility = combineVolatilityMetrics(metrics);

    // Cache combined volatility result
    VOLATILITY_CACHE.set(symbol, { value: volatility, timestamp: Date.now() });

    return volatility;
  } catch (error) {
    logger.error('Error calculating volatility:', error);
    return 0.2; // Return default moderate volatility on error
  }
}

async function calculateVolatilityMetrics(prices: any[]): Promise<VolatilityMetrics> {
  try {
    // Extract price arrays
    const closePrices = prices.map(p => p.price);
    const highPrices = prices.map(p => p.high);
    const lowPrices = prices.map(p => p.low);
    const volumes = prices.map(p => p.volume);

    // Calculate historical volatility (traditional method)
    const returns = prices.slice(1).map((p, i) => 
      Math.log(p.price / prices[i].price)
    );
    const historicalVolatility = calculateHistoricalVolatility(returns);

    // Calculate Bollinger Bands width
    const bb = new BollingerBands({
      period: 20,
      stdDev: 2,
      values: closePrices
    });
    const bbValues = bb.getResult();
    const latestBB = bbValues[bbValues.length - 1];
    const bollingerWidth = (latestBB.upper - latestBB.lower) / latestBB.middle;

    // Calculate ATR ratio
    const atr = new ATR({
      high: highPrices,
      low: lowPrices,
      close: closePrices,
      period: 14
    });
    const atrValues = atr.getResult();
    const atrRatio = atrValues[atrValues.length - 1] / closePrices[closePrices.length - 1];

    // Calculate RSI volatility
    const rsi = new RSI({ values: closePrices, period: 14 });
    const rsiValues = rsi.getResult();
    const rsiVolatility = calculateRSIVolatility(rsiValues);

    // Calculate price swings
    const priceSwings = {
      recent: calculatePriceSwings(closePrices.slice(0, 20)),
      historical: calculatePriceSwings(closePrices),
      ratio: 0
    };
    priceSwings.ratio = priceSwings.recent / priceSwings.historical;

    // Determine volatility regime
    const volatilityRegime = determineVolatilityRegime({
      historicalVolatility,
      bollingerWidth,
      atrRatio,
      rsiVolatility,
      priceSwings
    });

    return {
      historicalVolatility,
      impliedVolatility: 0, // Would require options data
      bollingerWidth,
      atrRatio,
      volatilityRegime,
      rsiVolatility,
      priceSwings
    };
  } catch (error) {
    logger.error('Error calculating volatility:', error);
    throw error;
  }
}

function calculateHistoricalVolatility(returns: number[]): number {
  const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
  const variance = returns.reduce((sum, val) => 
    sum + Math.pow(val - mean, 2), 0
  ) / returns.length;
  return Math.sqrt(variance * 252); // Annualized
}

function calculateRSIVolatility(rsiValues: number[]): number {
  const rsiChanges = rsiValues.slice(1).map((v, i) => 
    Math.abs(v - rsiValues[i])
  );
  return rsiChanges.reduce((sum, val) => sum + val, 0) / rsiChanges.length;
}

function calculatePriceSwings(prices: number[]): number {
  let swings = 0;
  let direction = 0;
  
  for (let i = 1; i < prices.length; i++) {
    const newDirection = Math.sign(prices[i] - prices[i - 1]);
    if (newDirection !== 0 && newDirection !== direction) {
      swings++;
      direction = newDirection;
    }
  }
  
  return swings / prices.length;
}

function determineVolatilityRegime(metrics: {
  historicalVolatility: number;
  bollingerWidth: number;
  atrRatio: number;
  rsiVolatility: number;
  priceSwings: { recent: number; historical: number; ratio: number };
}): 'low' | 'medium' | 'high' | 'extreme' {
  // Weight different volatility indicators
  const weights = {
    historicalVol: 0.3,
    bollingerWidth: 0.2,
    atrRatio: 0.2,
    rsiVolatility: 0.15,
    priceSwings: 0.15
  };

  const normalizedScore = 
    (metrics.historicalVolatility / 0.5) * weights.historicalVol +
    (metrics.bollingerWidth / 0.1) * weights.bollingerWidth +
    (metrics.atrRatio / 0.05) * weights.atrRatio +
    (metrics.rsiVolatility / 20) * weights.rsiVolatility +
    (metrics.priceSwings.ratio / 2) * weights.priceSwings;

  if (normalizedScore > 1.5) return 'extreme';
  if (normalizedScore > 1.0) return 'high';
  if (normalizedScore > 0.5) return 'medium';
  return 'low';
}

function combineVolatilityMetrics(metrics: VolatilityMetrics): number {
  // Combine different volatility measures into a single score
  const baseVolatility = metrics.historicalVolatility;
  
  // Adjust based on regime and other metrics
  const regimeMultiplier = {
    low: 0.8,
    medium: 1.0,
    high: 1.2,
    extreme: 1.5
  }[metrics.volatilityRegime];

  // Apply adjustments
  return baseVolatility * regimeMultiplier * (1 + metrics.priceSwings.ratio / 2);
}

export function getVolatilityBand(volatility: number): {
  upper: number;
  lower: number;
  atr: number;
  confidence: number;
} {
  // Dynamic ATR calculation based on volatility regime
  const atr = volatility * (volatility > 0.3 ? 0.15 : 0.1);
  
  // Calculate confidence based on volatility stability
  const confidence = Math.max(0, 1 - (volatility / 0.5));

  return {
    upper: 1 + (2 * atr), // 2 ATR above
    lower: 1 - (2 * atr), // 2 ATR below
    atr,
    confidence
  };
}

export function calculateVolatilityAdjustedStops(
  entryPrice: number,
  volatility: number,
  side: 'long' | 'short'
): {
  stopLoss: number;
  initialTarget: number;
  volatilityBands: Array<{ price: number; multiplier: number }>;
} {
  const { atr } = getVolatilityBand(volatility);
  const volatilityMultiplier = getVolatilityMultiplier(volatility);

  // Base stop distance is 2 ATR, adjusted by volatility
  const stopDistance = atr * 2 * volatilityMultiplier;
  
  // Initial target is 1.5x the stop distance
  const targetDistance = stopDistance * 1.5;

  const stopLoss = side === 'long' 
    ? entryPrice * (1 - stopDistance)
    : entryPrice * (1 + stopDistance);

  const initialTarget = side === 'long'
    ? entryPrice * (1 + targetDistance)
    : entryPrice * (1 - targetDistance);

  // Calculate volatility bands
  const bands = [0.5, 1, 1.5, 2, 2.5].map(multiplier => ({
    price: side === 'long'
      ? entryPrice * (1 + (atr * multiplier))
      : entryPrice * (1 - (atr * multiplier)),
    multiplier
  }));

  return {
    stopLoss,
    initialTarget,
    volatilityBands: bands
  };
}

function getVolatilityMultiplier(volatility: number): number {
  if (volatility > 0.5) return 1.5;     // Very high volatility - wider stops
  if (volatility > 0.3) return 1.25;    // High volatility
  if (volatility > 0.2) return 1.0;     // Normal volatility
  if (volatility > 0.1) return 0.75;    // Low volatility
  return 0.5;                           // Very low volatility - tighter stops
}
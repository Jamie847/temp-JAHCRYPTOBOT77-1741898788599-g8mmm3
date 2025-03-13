import { RSI, EMA, SMA, Stochastic, WilliamsR, CCI, ROC } from 'technicalindicators';
import { TechnicalIndicators } from '../types/crypto.js';
import { detectPattern } from './patterns.js';

// Add custom EMA calculation function
function calculateCustomEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emaArray: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  emaArray[period - 1] = sum / period;
  for (let i = period; i < prices.length; i++) {
    emaArray[i] = prices[i] * k + (emaArray[i - 1] || prices[i]) * (1 - k);
  }
  return emaArray;
}

function calculateMFI(prices: number[], volumes: number[], period = 14): number {
  if (prices.length < period) return 50;
  
  const moneyFlow = prices.map((price, i) => ({
    price,
    volume: volumes[i],
    flow: price * volumes[i]
  }));

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = 1; i < period; i++) {
    if (moneyFlow[i].price > moneyFlow[i - 1].price) {
      positiveFlow += moneyFlow[i].flow;
    } else {
      negativeFlow += moneyFlow[i].flow;
    }
  }
  return (positiveFlow / (positiveFlow + negativeFlow)) * 100;
}

function calculateKST(prices: number[]): number {
  const rocA = calculateROC(prices, 10);
  const rocB = calculateROC(prices, 15);
  const rocC = calculateROC(prices, 20);
  const rocD = calculateROC(prices, 30);
  return (rocA * 1 + rocB * 2 + rocC * 3 + rocD * 4) / 10;
}

function calculateTrix(prices: number[], period = 15): number {
  const ema1 = calculateCustomEMA(prices, period);
  const ema2 = calculateCustomEMA(ema1, period);
  const ema3 = calculateCustomEMA(ema2, period);
  
  const trix = ema3.map((value, i, arr) => {
    if (i === 0 || arr[i - 1] === 0) return 0;
    return ((value - arr[i - 1]) / arr[i - 1]) * 100;
  });
  return trix[trix.length - 1];
}

function calculateROC(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const currentPrice = prices[prices.length - 1];
  const oldPrice = prices[prices.length - period];
  return ((currentPrice - oldPrice) / oldPrice) * 100;
}

function calculateVortexIndicator(prices: number[], period = 14): { positive: number; negative: number } {
  if (prices.length < period + 1) return { positive: 0, negative: 0 };

  let sumTrPlus = 0;
  let sumTrMinus = 0;
  let sumTr = 0;
  for (let i = 1; i <= period; i++) {
    const vm = Math.abs(prices[i] - prices[i - 1]);
    const vmPlus = Math.max(prices[i] - prices[i - 1], 0);
    const vmMinus = Math.max(prices[i - 1] - prices[i], 0);
    sumTrPlus += vmPlus;
    sumTrMinus += vmMinus;
    sumTr += vm;
  }
  return {
    positive: sumTrPlus / sumTr,
    negative: sumTrMinus / sumTr
  };
}

export const calculateIndicators = (prices: number[], volumes: number[]): TechnicalIndicators => {
  const rsi = new RSI({ period: 14, values: prices });
  const ema = new EMA({ period: 20, values: prices });
  const sma9 = new SMA({ period: 9, values: prices });
  const sma21 = new SMA({ period: 21, values: prices });
  const sma = new SMA({ period: 50, values: prices });
  const sma200 = new SMA({ period: 200, values: prices });
  const stoch = new Stochastic({
    high: prices,
    low: prices,
    close: prices,
    period: 14,
    signalPeriod: 3
  });
  
  const latestPrice = prices[prices.length - 1];
  const highestPrice = Math.max(...prices);
  const lowestPrice = Math.min(...prices);
  
  // Calculate Fibonacci levels
  const fibLevels = calculateFibonacciLevels(highestPrice, lowestPrice, latestPrice);
  
  // Get latest values
  const sma9Value = sma9.getResult().slice(-1)[0];
  const sma21Value = sma21.getResult().slice(-1)[0];
  const sma50Value = sma.getResult().slice(-1)[0];
  const sma200Value = sma200.getResult().slice(-1)[0];
  const stochValues = stoch.getResult().slice(-1)[0];
  
  // Additional oscillators
  const williamsR = new WilliamsR({ period: 14, high: prices, low: prices, close: prices });
  const cci = new CCI({ period: 20, high: prices, low: prices, close: prices });
  const roc = new ROC({ period: 12, values: prices });
  const mfi = calculateMFI(prices, volumes);
  
  // Pattern recognition
  const pattern = detectPattern(prices, volumes);
  
  // Volume profile analysis
  const volumeProfile = calculateVolumeProfile(prices, volumes);
  
  // Calculate trading signals
  const tradingSignals = calculateTradingSignals({
    price: latestPrice,
    sma9: sma9Value,
    sma21: sma21Value,
    sma50: sma50Value,
    sma200: sma200Value,
    stoch: stochValues,
    fib: fibLevels
  });
  
  return {
    rsi: rsi.getResult().slice(-1)[0],
    ema20: ema.getResult().slice(-1)[0],
    sma9: sma9Value,
    sma21: sma21Value,
    sma50: sma50Value,
    sma200: sma200Value,
    stochastic: {
      k: stochValues.k,
      d: stochValues.d
    },
    fibonacci: fibLevels,
    tradingSignals,
    patterns: pattern,
    additionalOscillators: {
      williamsR: williamsR.getResult().slice(-1)[0],
      cci: cci.getResult().slice(-1)[0],
      momentum: 0, // Manual momentum calculation
      roc: roc.getResult().slice(-1)[0],
      mfi
    },
    volumeProfile
  };
};

function calculateVolumeProfile(prices: number[], volumes: number[]): TechnicalIndicators['volumeProfile'] {
  const priceVolumePairs = prices.map((price, i) => ({ price, volume: volumes[i] }));
  const sortedByPrice = [...priceVolumePairs].sort((a, b) => a.price - b.price);
  
  // Calculate Point of Control (price level with highest volume)
  const poc = sortedByPrice.reduce((max, curr) =>
    curr.volume > max.volume ? curr : max
  ).price;
  
  // Calculate Value Area (70% of volume)
  const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0);
  const valueAreaTarget = totalVolume * 0.7;
  let volumeSum = 0;
  let valueAreaPrices: number[] = [];
  for (const pair of sortedByPrice) {
    volumeSum += pair.volume;
    valueAreaPrices.push(pair.price);
    if (volumeSum >= valueAreaTarget) break;
  }
  
  // Calculate volume nodes
  const volumeNodes = priceVolumePairs.map(({ price, volume }) => {
    let strength: 'high' | 'medium' | 'low';
    if (volume > (totalVolume / prices.length) * 1.5) {
      strength = 'high';
    } else if (volume > totalVolume / prices.length) {
      strength = 'medium';
    } else {
      strength = 'low';
    }
    return { price, volume, strength };
  });
  
  return {
    valueArea: {
      high: Math.max(...valueAreaPrices),
      low: Math.min(...valueAreaPrices),
      volume: volumeSum
    },
    poc,
    volumeNodes
  };
}

function calculateFibonacciLevels(high: number, low: number, current: number) {
  const diff = high - low;
  const levels = {
    retracement: [0.236, 0.382, 0.5, 0.618, 0.786],
    extension: [1.618, 2.618, 3.618, 4.236]
  };
  return {
    retracement: levels.retracement.map(level => high - diff * level),
    extension: levels.extension.map(level => high + diff * level)
  };
}

function calculateTradingSignals(data: {
  price: number;
  sma9: number;
  sma21: number;
  sma50: number;
  sma200: number;
  stoch: { k: number; d: number };
  fib: { retracement: number[]; extension: number[] };
}): TechnicalIndicators['tradingSignals'] {
  const fastSlowSignal = data.sma9 > data.sma21 ? 'bullish' : data.sma9 < data.sma21 ? 'bearish' : 'neutral';
  const mediumLongSignal = data.sma50 > data.sma200 ? 'bullish' : data.sma50 < data.sma200 ? 'bearish' : 'neutral';
  const stochasticSignal = data.stoch.k > 80 ? 'overbought' : data.stoch.k < 20 ? 'oversold' : 'neutral';
  const nearestFib = findNearestFibLevel(data.price, data.fib);
  const fibonacciSignal = nearestFib.type === 'retracement' ? 'support' : nearestFib.type === 'extension' ? 'resistance' : 'neutral';
  const sentimentFactors = [
    { signal: Number(fastSlowSignal === 'bullish'), weight: 20 },
    { signal: Number(mediumLongSignal === 'bullish'), weight: 25 },
    { signal: Number(stochasticSignal === 'oversold'), weight: 15 },
    { signal: Number(fibonacciSignal === 'support'), weight: 20 }
  ];
  const overallSentiment = sentimentFactors.reduce((score, factor) => score + (factor.signal ? factor.weight : 0), 0);
  return {
    maSignals: {
      fastSlow: fastSlowSignal,
      mediumLong: mediumLongSignal
    },
    stochasticSignal,
    fibonacciSignal,
    overallSentiment
  };
}

function findNearestFibLevel(price: number, fib: { retracement: number[]; extension: number[] }) {
  const allLevels = [
    ...fib.retracement.map(level => ({ level, type: 'retracement' as const })),
    ...fib.extension.map(level => ({ level, type: 'extension' as const }))
  ];
  return allLevels.reduce((nearest, current) => {
    const currentDiff = Math.abs(price - current.level);
    const nearestDiff = Math.abs(price - nearest.level);
    return currentDiff < nearestDiff ? current : nearest;
  }, allLevels[0]);
}

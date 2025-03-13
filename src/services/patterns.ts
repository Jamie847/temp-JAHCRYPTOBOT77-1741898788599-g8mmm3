import { TechnicalIndicators } from '../types/crypto.js';

interface PatternResult {
  type: TechnicalIndicators['patterns']['type'];
  confidence: number;
  priceTarget?: number;
}

export function detectPattern(prices: number[], volumes: number[]): PatternResult {
  const patterns: PatternResult[] = [
    detectHeadAndShoulders(prices),
    detectDoublePatterms(prices),
    detectTriangle(prices),
    detectWedge(prices)
  ].filter(p => p.confidence > 0.6);

  // Return the pattern with highest confidence
  return patterns.length > 0 ?
    patterns.reduce((max, curr) => curr.confidence > max.confidence ? curr : max) :
    { type: null, confidence: 0 };
}

function detectHeadAndShoulders(prices: number[]): PatternResult {
  const result = { type: 'head_and_shoulders' as const, confidence: 0, priceTarget: 0 };
  
  // Need at least 20 periods for a valid H&S pattern
  if (prices.length < 20) return result;
  
  const peaks = findPeaks(prices);
  if (peaks.length < 3) return result;
  
  // Look for left shoulder, head, right shoulder formation
  for (let i = 0; i < peaks.length - 2; i++) {
    const leftShoulder = peaks[i];
    const head = peaks[i + 1];
    const rightShoulder = peaks[i + 2];
    
    // Check if head is higher than shoulders
    if (prices[head] > prices[leftShoulder] && 
        prices[head] > prices[rightShoulder] &&
        Math.abs(prices[leftShoulder] - prices[rightShoulder]) / prices[head] < 0.1) {
      
      result.confidence = calculatePatternConfidence(prices, [leftShoulder, head, rightShoulder]);
      result.priceTarget = calculateHSTarget(prices, leftShoulder, head, rightShoulder);
      break;
    }
  }
  
  return result;
}

function detectDoublePatterms(prices: number[]): PatternResult {
  const result = { type: 'double_top' as const, confidence: 0, priceTarget: 0 };
  
  const peaks = findPeaks(prices);
  const troughs = findTroughs(prices);
  
  // Check for double top
  if (peaks.length >= 2) {
    const lastTwo = peaks.slice(-2);
    if (Math.abs(prices[lastTwo[0]] - prices[lastTwo[1]]) / prices[lastTwo[0]] < 0.02) {
      result.confidence = calculatePatternConfidence(prices, lastTwo);
      result.priceTarget = Math.min(...prices.slice(lastTwo[0], lastTwo[1]));
      return result;
    }
  }
  
  // Check for double bottom
  if (troughs.length >= 2) {
    const lastTwo = troughs.slice(-2);
    if (Math.abs(prices[lastTwo[0]] - prices[lastTwo[1]]) / prices[lastTwo[0]] < 0.02) {
      return {
        type: 'double_bottom',
        confidence: calculatePatternConfidence(prices, lastTwo),
        priceTarget: Math.max(...prices.slice(lastTwo[0], lastTwo[1]))
      };
    }
  }
  
  return result;
}

function detectTriangle(prices: number[]): PatternResult {
  const result = { type: 'triangle' as const, confidence: 0, priceTarget: 0 };
  
  const highs = findPeaks(prices);
  const lows = findTroughs(prices);
  
  if (highs.length < 3 || lows.length < 3) return result;
  
  // Calculate trend lines
  const highSlope = calculateTrendLineSlope(highs.slice(-3).map(i => ({ x: i, y: prices[i] })));
  const lowSlope = calculateTrendLineSlope(lows.slice(-3).map(i => ({ x: i, y: prices[i] })));
  
  if (Math.abs(highSlope) < 0.1 && Math.abs(lowSlope) < 0.1) {
    result.confidence = 0.7;
    result.priceTarget = prices[prices.length - 1] * (1 + Math.sign(highSlope) * 0.1);
  }
  
  return result;
}

function detectWedge(prices: number[]): PatternResult {
  const result = { type: 'wedge' as const, confidence: 0, priceTarget: 0 };
  
  const highs = findPeaks(prices);
  const lows = findTroughs(prices);
  
  if (highs.length < 3 || lows.length < 3) return result;
  
  const highSlope = calculateTrendLineSlope(highs.slice(-3).map(i => ({ x: i, y: prices[i] })));
  const lowSlope = calculateTrendLineSlope(lows.slice(-3).map(i => ({ x: i, y: prices[i] })));
  
  // Check for converging trend lines
  if (Math.sign(highSlope) === Math.sign(lowSlope) && Math.abs(highSlope - lowSlope) > 0.1) {
    result.confidence = 0.8;
    result.priceTarget = prices[prices.length - 1] * (1 - Math.sign(highSlope) * 0.15);
  }
  
  return result;
}

// Helper functions
function findPeaks(prices: number[]): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < prices.length - 1; i++) {
    if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
      peaks.push(i);
    }
  }
  return peaks;
}

function findTroughs(prices: number[]): number[] {
  const troughs: number[] = [];
  for (let i = 1; i < prices.length - 1; i++) {
    if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
      troughs.push(i);
    }
  }
  return troughs;
}

function calculatePatternConfidence(prices: number[], points: number[]): number {
  // Calculate pattern symmetry and strength
  const heights = points.map(i => prices[i]);
  const avgHeight = heights.reduce((sum, h) => sum + h, 0) / heights.length;
  const deviation = Math.sqrt(heights.reduce((sum, h) => sum + Math.pow(h - avgHeight, 2), 0) / heights.length);
  
  return Math.max(0, Math.min(1, 1 - deviation / avgHeight));
}

function calculateHSTarget(prices: number[], left: number, head: number, right: number): number {
  const neckline = (prices[left] + prices[right]) / 2;
  const height = prices[head] - neckline;
  return neckline - height;
}

function calculateTrendLineSlope(points: Array<{ x: number, y: number }>): number {
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}
import { logger } from '../services/logger/index.js';
import { supabase } from '../services/supabase/index.js';
import { RSI, SMA, EMA, Stochastic } from 'technicalindicators';
import { detectPattern } from './trading/patterns.js';
import { LRUCache } from 'lru-cache';
import type { 
  Token, 
  ArbitrageOpportunity, 
  TrendingScore, 
  RelativeStrength, 
  TechnicalIndicators
  // Remove CandleData from here since we define our local type below.
} from '../types/crypto.js';
import {
  BinanceResponse,
  CoinbaseResponse,
  CoinGeckoResponse,
  isBinanceResponse,
  isCoinbaseResponse,
  isCoinGeckoResponse,
} from '../types/api.js';

// Define a local CandleData type representing an OHLC candle.
type CandleData = {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const API_URL = typeof process !== 'undefined' && process.env.VITE_API_URL 
  ? process.env.VITE_API_URL 
  : typeof window !== 'undefined' && window.env?.VITE_API_URL
    ? window.env.VITE_API_URL
    : 'http://localhost:3000';

// Price cache with 5 second TTL
const priceCache = new LRUCache<string, { price: number; timestamp: number }>({
  max: 1000,
  ttl: 5000 // 5 seconds for faster price updates
});

// Rate limit tracking
const RATE_LIMITS = {
  coingecko: { requests: 30, window: 60000 }, // 30 requests per minute
  binance: { requests: 20, window: 60000 },   // 20 requests per minute
  coinbase: { requests: 10, window: 60000 }   // 10 requests per minute
};

const rateLimiters = {
  coingecko: { requests: [] as number[], nextReset: Date.now() + RATE_LIMITS.coingecko.window },
  binance: { requests: [] as number[], nextReset: Date.now() + RATE_LIMITS.binance.window },
  coinbase: { requests: [] as number[], nextReset: Date.now() + RATE_LIMITS.coinbase.window }
};

// Mapping of token symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
  'SOL': 'solana',
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'BONK': 'bonk',
  'JUP': 'jupiter',
  'RAY': 'raydium',
  'ORCA': 'orca',
  'JTO': 'jito-governance'
};

const TOP_CRYPTOS = ['BTC', 'ETH', 'BNB', 'SOL'];
// Update PRICE_HISTORY_CACHE to expect CandleData arrays, not number arrays.
const PRICE_HISTORY_CACHE = new Map<string, { prices: CandleData[]; timestamp: number }>();
const HISTORY_CACHE_TTL = 600000; // 10 minutes cache
const PRICE_CACHE_TTL = 10000;    // 10 seconds for price cache

// Rate limit tracking type
type RateLimitRequest = number[];

// Circuit breaker configuration
const CIRCUIT_BREAKER = {
  failureThreshold: 3,      // Number of failures before opening circuit
  resetTimeout: 300000,     // 5 minute timeout before attempting reset
  halfOpenMaxAttempts: 2    // Max attempts in half-open state
};

// Circuit breaker state tracking
const circuitStates = {
  binance: { failures: 0, lastFailure: 0, state: 'closed' as 'closed' | 'open' | 'half-open', attempts: 0 },
  coinbase: { failures: 0, lastFailure: 0, state: 'closed' as 'closed' | 'open' | 'half-open', attempts: 0 },
  coingecko: { failures: 0, lastFailure: 0, state: 'closed' as 'closed' | 'open' | 'half-open', attempts: 0 }
};

// Exponential backoff configuration
const BACKOFF_CONFIG = {
  initialDelay: 1000,      // 1 second delay initially
  maxDelay: 32000,         // Maximum delay of 32 seconds
  factor: 2,               // Double the delay each time
  jitter: 0.1              // 10% random jitter
};

async function exponentialBackoff(attempt: number): Promise<void> {
  const delay = Math.min(
    BACKOFF_CONFIG.initialDelay * Math.pow(BACKOFF_CONFIG.factor, attempt),
    BACKOFF_CONFIG.maxDelay
  );
  const jitter = delay * BACKOFF_CONFIG.jitter * (Math.random() - 0.5);
  const finalDelay = delay + jitter;
  logger.info(`Backing off for ${Math.round(finalDelay)}ms (attempt ${attempt + 1})`);
  await new Promise(resolve => setTimeout(resolve, finalDelay));
}

async function checkCircuitBreaker(source: 'binance' | 'coinbase' | 'coingecko'): Promise<boolean> {
  const circuit = circuitStates[source];
  const now = Date.now();
  if (circuit.state === 'open') {
    if (now - circuit.lastFailure >= CIRCUIT_BREAKER.resetTimeout) {
      circuit.state = 'half-open';
      circuit.attempts = 0;
      logger.info(`Circuit for ${source} entering half-open state`);
    } else {
      logger.info(`Circuit for ${source} is open, skipping request`);
      return false;
    }
  }
  if (circuit.state === 'half-open' && circuit.attempts >= CIRCUIT_BREAKER.halfOpenMaxAttempts) {
    circuit.state = 'open';
    logger.info(`Circuit for ${source} reopened due to max attempts in half-open state`);
    return false;
  }
  return true;
}

function recordApiResult(source: 'binance' | 'coinbase' | 'coingecko', success: boolean) {
  const circuit = circuitStates[source];
  if (success) {
    if (circuit.state === 'half-open') {
      circuit.state = 'closed';
      logger.info(`Circuit for ${source} closed after successful request`);
    }
    circuit.failures = 0;
    circuit.attempts = 0;
  } else {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.state === 'half-open') {
      circuit.attempts++;
    }
    if (circuit.failures >= CIRCUIT_BREAKER.failureThreshold) {
      circuit.state = 'open';
      logger.warn(`Circuit for ${source} opened after ${circuit.failures} failures`);
    }
  }
}

export async function getTokenPrice(symbol: string): Promise<number> {
  try {
    const cacheKey = `price:${symbol}`;
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.price;
    }
    const coingeckoId = COINGECKO_IDS[symbol.toUpperCase()];
    if (coingeckoId) {
      try {
        const coingeckoPrice = await fetchCoinGeckoPrice(coingeckoId);
        if (coingeckoPrice > 0) {
          priceCache.set(symbol, { price: coingeckoPrice, timestamp: Date.now() });
          return coingeckoPrice;
        }
      } catch (error) {
        logger.warn('CoinGecko price fetch failed:', error);
      }
    }
    try {
      const binancePrice = await fetchBinancePrice(symbol);
      if (binancePrice > 0) {
        priceCache.set(symbol, { price: binancePrice, timestamp: Date.now() });
        return binancePrice;
      }
    } catch (error) {
      logger.warn('Binance price fetch failed:', error);
    }
    try {
      const coinbasePrice = await fetchCoinbasePrice(symbol);
      if (coinbasePrice > 0) {
        priceCache.set(symbol, { price: coinbasePrice, timestamp: Date.now() });
        return coinbasePrice;
      }
    } catch (error) {
      logger.warn('Coinbase price fetch failed:', error);
    }
    if (cached) {
      logger.warn(`Using stale price for ${symbol} from cache`);
      return cached.price;
    }
    throw new Error(`Could not fetch price for ${symbol} from any source`);
  } catch (error) {
    logger.error('Error getting token price:', error);
    throw error;
  }
}

async function fetchCoinGeckoPrice(id: string): Promise<number> {
  const cacheKey = `coingecko:${id}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  await checkRateLimit('coingecko');
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd${
      process.env.COINGECKO_API_KEY ? `&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}` : ''
    }`,
    { 
      signal: AbortSignal.timeout(10000),
      headers: {
        'Accept': 'application/json'
      }
    }
  );
  if (!response.ok) {
    if (response.status === 429) {
      await exponentialBackoff(rateLimiters.coingecko.requests.length);
      return fetchCoinGeckoPrice(id);
    }
    throw new Error(`CoinGecko API error: ${response.status}`);
  }
  const data = await response.json();
  const price = data[id]?.usd || 0;
  if (price > 0) {
    priceCache.set(cacheKey, { price, timestamp: Date.now() });
  }
  return price;
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  await checkRateLimit('binance');
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }
  const data = await response.json();
  return parseFloat(data.price) || 0;
}

async function fetchCoinbasePrice(symbol: string): Promise<number> {
  await checkRateLimit('coinbase');
  const response = await fetch(
    `https://api.pro.coinbase.com/products/${symbol}-USD/ticker`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!response.ok) {
    throw new Error(`Coinbase API error: ${response.status}`);
  }
  const data = await response.json();
  return parseFloat(data.price) || 0;
}

async function checkRateLimit(source: keyof typeof rateLimiters): Promise<void> {
  const limiter = rateLimiters[source];
  const limit = RATE_LIMITS[source];
  const now = Date.now();
  if (now >= limiter.nextReset) {
    limiter.requests = [];
    limiter.nextReset = now + limit.window;
  }
  limiter.requests = limiter.requests.filter(time => now - time < limit.window);
  if (limiter.requests.length >= limit.requests) {
    const oldestRequest = limiter.requests[0];
    const waitTime = limit.window - (now - oldestRequest);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return checkRateLimit(source);
    }
  }
  limiter.requests.push(now);
}

export async function getRecentPrices(symbol: string, interval = '5m', limit = 288): Promise<CandleData[]> {
  try {
    const cacheKey = `${symbol}-${interval}-${limit}`;
    if (symbol === 'ZNV') {
      const { data: history } = await supabase
        .from('token_prices')
        .select('price, volume, timestamp')
        .eq('symbol', symbol)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (history?.length) {
        const prices: CandleData[] = history.map(h => ({
          timestamp: new Date(h.timestamp),
          open: Number(h.price),
          high: Number(h.price) * 1.001,
          low: Number(h.price) * 0.999,
          close: Number(h.price),
          volume: Number(h.volume) || 0
        }));
        PRICE_HISTORY_CACHE.set(cacheKey, {
          prices,
          timestamp: Date.now()
        });
        return prices;
      }
    }

    const cached = PRICE_HISTORY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
      return cached.prices;
    }

    const historicalData = await fetchHistoricalData(symbol, interval, limit);
    PRICE_HISTORY_CACHE.set(cacheKey, {
      prices: historicalData,
      timestamp: Date.now()
    });
    return historicalData;
  } catch (error) {
    logger.error('Error getting recent prices:', error);
    return [];
  }
}

export async function calculateVolumeTrend(symbol: string): Promise<number> {
  try {
    const historicalData = await fetchHistoricalData(symbol, '5m', 24);
    const recentVolume = historicalData.slice(0, 12).reduce((sum, candle) => sum + candle.volume, 0);
    const previousVolume = historicalData.slice(12, 24).reduce((sum, candle) => sum + candle.volume, 0);
    return ((recentVolume - previousVolume) / previousVolume) * 100;
  } catch (error) {
    logger.error('Error calculating volume trend:', error);
    return 0;
  }
}

export async function calculateRSI(prices: number[]): Promise<number> {
  try {
    const rsi = new RSI({ values: prices, period: 14 });
    const values = rsi.getResult();
    return values[values.length - 1];
  } catch (error) {
    logger.error('Error calculating RSI:', error);
    return 50;
  }
}

export async function fetchArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
  try {
    const { data: opportunities } = await supabase
      .from('arbitrage_opportunities')
      .select(`
        token_id,
        symbol,
        name,
        exchange_a,
        price_a,
        exchange_b, 
        price_b,
        profit_percentage,
        estimated_profit,
        discovered_at
      `)
      .order('discovered_at', { ascending: false })
      .limit(10);

    if (!opportunities) {
      return [];
    }

    return opportunities.map(opp => ({
      token: {
        id: opp.token_id,
        symbol: opp.symbol,
        name: opp.name,
        price: opp.price_a,
        volume24h: 0,
        priceChange24h: 0,
        lastUpdated: new Date(opp.discovered_at)
      },
      exchanges: [
        { name: opp.exchange_a, price: opp.price_a },
        { name: opp.exchange_b, price: opp.price_b }
      ],
      profitPercentage: opp.profit_percentage,
      estimatedProfit: opp.estimated_profit,
      timestamp: new Date(opp.discovered_at)
    }));
  } catch (error) {
    logger.error('Error fetching arbitrage opportunities:', error);
    return [];
  }
}

async function fetchBinanceHistory(symbol: string, interval = '5m', limit = 288): Promise<CandleData[] | null> {
  try {
    if (!await checkCircuitBreaker('binance')) {
      return null;
    }
    await checkRateLimit('binance');
    const cacheKey = `binance:${symbol}:${interval}:${limit}`;
    const cached = PRICE_HISTORY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
      logger.info('Using cached Binance data:', { symbol, interval });
      return cached.prices;
    }
    let attempt = 0;
    while (attempt < 3) {
      try {
        const binanceSymbol = `${symbol}USDC`;
        logger.info('Fetching Binance price:', { symbol: binanceSymbol, attempt: attempt + 1 });
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) {
          logger.info('Falling back to USDT pair:', { symbol: `${symbol}USDT` });
          const usdtResponse = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
          );
          if (!usdtResponse.ok) throw new Error('Both USDC and USDT pairs failed');
          const data = await usdtResponse.json();
          recordApiResult('binance', true);
          return data.map((candle: any[]) => ({
            timestamp: new Date(candle[0]),
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
          }));
        }
        const data = await response.json();
        recordApiResult('binance', true);
        return data.map((candle: any[]) => ({
          timestamp: new Date(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        }));
      } catch (error) {
        logger.warn(`Binance request failed (attempt ${attempt + 1}):`, error);
        await exponentialBackoff(attempt);
        attempt++;
      }
    }
    recordApiResult('binance', false);
    return null;
  } catch (error) {
    logger.error('Error fetching Binance history:', error);
    recordApiResult('binance', false);
    return null;
  }
}

async function fetchCoinbaseHistory(symbol: string, interval = '5m', limit = 288): Promise<CandleData[] | null> {
  try {
    await checkRateLimit('coinbase');
    const cacheKey = `coinbase:${symbol}:${interval}:${limit}`;
    const cached = PRICE_HISTORY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
      logger.info('Using cached Coinbase data:', { symbol, interval });
      return cached.prices;
    }
    logger.info('Fetching Coinbase price:', { symbol, timestamp: new Date().toISOString() });
    const granularity = interval === '5m' ? 300 : 60;
    const response = await fetch(
      `https://api.pro.coinbase.com/products/${symbol}-USD/candles?granularity=${granularity}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.slice(0, limit).map((candle: any[]) => ({
      timestamp: new Date(candle[0] * 1000),
      open: candle[3],
      high: candle[2],
      low: candle[1],
      close: candle[4],
      volume: candle[5]
    }));
  } catch (error) {
    logger.error('Error fetching Coinbase history:', error);
    return null;
  }
}

async function fetchCoinGeckoHistory(symbol: string, interval = '5m', limit = 288): Promise<CandleData[] | null> {
  try {
    await checkRateLimit('coingecko');
    const cacheKey = `coingecko:${symbol}:${interval}:${limit}`;
    const cached = PRICE_HISTORY_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
      logger.info('Using cached CoinGecko data:', { symbol, interval });
      return cached.prices;
    }
    logger.info('Fetching CoinGecko price:', { symbol, timestamp: new Date().toISOString() });
    const days = Math.ceil((limit * 5) / (24 * 60));
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const prices = data.prices || [];
    const volumes = data.total_volumes || [];
    return prices.map((price: any[], i: number) => ({
      timestamp: new Date(price[0]),
      open: price[1],
      high: price[1] * 1.001,
      low: price[1] * 0.999,
      close: price[1],
      volume: volumes[i] ? volumes[i][1] : 0
    })).slice(0, limit);
  } catch (error) {
    logger.error('Error fetching CoinGecko history:', error);
    return null;
  }
}

async function handleDataFetchError(error: Error, symbol: string): Promise<never> {
  logger.error(`Failed to fetch data for ${symbol}:`, error);
  throw new Error(`Unable to fetch market data for ${symbol}`);
}

export async function fetchHistoricalData(symbol: string, interval = '5m', limit = 288): Promise<CandleData[]> {
  try {
    logger.info('Fetching historical data:', { symbol, interval, limit });
    const sources = [
      fetchBinanceHistory,
      fetchCoinbaseHistory,
      fetchCoinGeckoHistory
    ];
    const results = await Promise.allSettled(
      sources.map(source => source(symbol, interval, limit))
    );
    const validData = results
      .filter((result): result is PromiseFulfilledResult<any[]> => 
        result.status === 'fulfilled' && Array.isArray(result.value)
      )
      .map(result => result.value);

    if (validData.length === 0) {
      throw new Error(`No valid data available for ${symbol}`);
    }
    const bestData = validData.reduce((a, b) => a.length > b.length ? a : b);
    logger.info('Historical data fetched successfully:', {
      symbol,
      dataPoints: bestData.length,
      sources: validData.length
    });
    return bestData;
  } catch (error) {
    return handleDataFetchError(error as Error, symbol);
  }
}

export async function fetchTokenData(symbol: string, includeHistory = false) {
  try {
    const { data: token } = await supabase
      .from('tokens')
      .select('*')
      .eq('symbol', symbol)
      .single();
    if (!token) {
      throw new Error('Token not found');
    }
    const { data: indicators } = await supabase
      .from('technical_indicators')
      .select('*')
      .eq('token_id', token.id)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();
    return {
      ...token,
      technicalIndicators: indicators || undefined
    };
  } catch (error) {
    logger.error('Error fetching token data:', error);
    throw error;
  }
}

export async function fetchTrendingTokens() {
  try {
    const { data: tokens } = await supabase
      .from('raydium_trending_tokens')
      .select('*')
      .order('momentum_score', { ascending: false })
      .limit(5);
    if (!tokens) {
      return [];
    }
    return tokens.map(token => ({
      id: token.address,
      symbol: token.symbol,
      name: token.name,
      volume24h: token.volume_24h,
      liquidity: token.liquidity,
      price_impact: token.price_impact,
      trendingScore: {
        score: token.momentum_score,
        volumeScore: token.volume_24h / 1000000,
        priceScore: 100 - (token.price_impact * 100),
        socialScore: 0,
        memeScore: 0,
        viralityScore: 0,
        communityScore: 0
      },
      lastUpdated: new Date(token.updated_at)
    }));
  } catch (error) {
    logger.error('Error fetching trending tokens:', error);
    return [];
  }
}

export interface SupabaseSchema {
  crypto_influencers: {
    username: string;
    platform: string;
  };
  meme_templates: {
    template_hash: string;
  };
  crypto_keywords: {
    term: string;
  };
  arbitrage_opportunities: {
    token_id: string;
    symbol: string;
    name: string;
    price_a: number;
    price_b: number;
    exchange_a: string;
    exchange_b: string;
    profit_percentage: number;
    estimated_profit: number;
    discovered_at: string;
  };
}

export interface TradingBot {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  evaluateSignal(signal: TradeSignal): Promise<Position | null>;
  checkPortfolioValueAndTransferProfits(): Promise<void>;
}

export interface Token {
  id: string;
  symbol: string;
  name: string;
  price: number;
  volume24h: number;
  marketCap?: number;
  priceChange24h: number;
  lastUpdated: Date;
  historicalData?: CandleData[];
  technicalIndicators?: TechnicalIndicators;
}

export interface CandleData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  rsi: number;
  ema20: number;
  sma50: number;
  sma9: number;
  sma21: number;
  sma200: number;
  stochastic: {
    k: number;
    d: number;
  };
  fibonacci: {
    retracement: number[];
    extension: number[];
  };
  tradingSignals: {
    maSignals: {
      fastSlow: 'bullish' | 'bearish' | 'neutral';
      mediumLong: 'bullish' | 'bearish' | 'neutral';
    };
    stochasticSignal: 'overbought' | 'oversold' | 'neutral';
    fibonacciSignal: 'support' | 'resistance' | 'neutral';
    overallSentiment: number; // 0-100 scale
  };
  patterns: {
    type: 'head_and_shoulders' | 'double_top' | 'double_bottom' | 'triangle' | 'wedge' | null;
    confidence: number;
    priceTarget?: number;
  };
  additionalOscillators: {
    williamsR: number;
    cci: number;
    momentum: number; // Manual momentum calculation
    roc: number;
    mfi?: number; // Make MFI optional
  };
  volumeProfile: {
    valueArea: {
      high: number;
      low: number;
      volume: number;
    };
    poc: number; // Point of Control
    volumeNodes: Array<{
      price: number;
      volume: number;
      strength: 'high' | 'medium' | 'low';
    }>;
  };
}

export interface RelativeStrength {
  symbol: string;
  price: number;
  btcRatio: number;
  dominanceScore: number;
  timestamp: Date;
}

export interface ArbitrageOpportunity {
  token: Token;
  exchanges: {
    name: string;
    price: number;
  }[];
  profitPercentage: number;
  estimatedProfit: number;
  timestamp: Date;
}

export interface TrendingScore {
  score: number;
  volumeScore: number;
  priceScore: number;
  socialScore: number;
  memeScore: number;
  viralityScore: number;
  communityScore: number;
}

export interface SocialMetrics {
  id: string;
  symbol: string;
  timestamp: Date;
  twitterMetrics: {
    mentions24h: number;
    sentiment: number;
    influencerMentions: Array<{
      username: string;
      followers: number;
      sentiment: number;
      timestamp: Date;
    }>;
    viralTweets: Array<{
      id: string;
      engagement: number;
      sentiment: number;
    }>;
  };
  telegramMetrics: {
    groupCount: number;
    totalMembers: number;
    activeGroups: Array<{
      name: string;
      members: number;
      messagesPerHour: number;
      sentiment: number;
    }>;
    messageVolume24h: number;
  };
  discordMetrics: {
    serverCount: number;
    totalMembers: number;
    activeServers: Array<{
      name: string;
      members: number;
      messageVolume: number;
      sentiment: number;
    }>;
    messageVolume24h: number;
  };
  redditMetrics: {
    subredditCount: number;
    totalMembers: number;
    postVolume24h: number;
    topPosts: Array<{
      title: string;
      upvotes: number;
      comments: number;
      sentiment: number;
    }>;
  };
  githubMetrics: {
    repositories: number;
    commits24h: number;
    contributors: number;
    forks: number;
    stars: number;
  };
  memeMetrics: {
    viralMemes24h: number;
    totalEngagement: number;
    platforms: Array<{
      name: string;
      memeCount: number;
      engagement: number;
    }>;
  };
  influencerActivity: Array<{
    platform: string;
    username: string;
    followers: number;
    posts: Array<{
      content: string;
      engagement: number;
      sentiment: number;
      timestamp: Date;
    }>;
  }>;
  overallSentiment: number;
  viralityScore: number;
  communityGrowth24h: number;
}

export interface OrderParams {
  symbol: string;
  side: 'long' | 'short';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  exchange?: string;
  chain?: 'evm' | 'solana';
}

export interface SolanaOrderResult {
  signature: string;
  symbol?: string;
  side?: string;
  type?: string;
  amount?: number;
  price: number;
  status: string;
  timestamp: number;
}

export interface MarketCondition {
  isBearish: boolean;
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: number;
  sentiment: number;
  btcDominance: number;
  marketFear: number;
  topTokensDown: number;
  btcRsi: number;
  trendingOpportunities?: Array<{
    symbol: string;
    score: number;
    momentum: number;
    socialScore: number;
    liquidity: number;
    volume: number;
    priceImpact: number;
  }>;
  timestamp: Date;
}

export interface TradingConfig {
  maxPositionSize: number;
  solanaWalletAddress?: string;
  rpcEndpoint?: string; // Only one rpcEndpoint
  walletPublicKey: PublicKey;
  stopLossPercent: number;
  takeProfitPercentage: number;
  maxOpenPositions: number;
  minConfidenceScore: number;
  riskPerTradePercentage: number;
  maxRiskPercentage: number;
  maxPriceImpact: number;
  exchanges: string[];
  tradingPairs: string[];
  arbitrageMinSpread: number;
  arbitrageMinVolume: number;
  socialSignals: {
    minTelegramMembers: number;
    minTwitterMentions: number;
    minDiscordMembers: number;
    minViralTweets: number;
    minMemeScore: number;
    requiredInfluencerCount: number;
  };
  entryCriteria: {
    socialSignalThreshold: number;
    rpcEndpoint?: string;
    minHolders: number;
    maxWalletConcentration: number;
    minTokenAge: number; // in seconds
    minMarketCap: number;
    maxBuyTax: number;
    maxSellTax: number;
    requiredVerifications: string[];
  };
  positionSizing: {
    minSize: number;
    maxSize: number;
    baseSize: number;
    confidenceMultipliers: {
      low: number;
      medium: number;
      high: number;
      momentum: number;
    }
  };
  trendingTokens: {
    minLiquidity: number;
    minVolume24h: number;
    maxPriceImpact: number;
    minPriceChange: number;
    scanInterval: number;
    maxTrackedTokens: number;
    minAge: number;
    blacklistedTokens: Set<string>;
    momentumThreshold: number;
    volumeThreshold: number;
    maxPriceAge: number;
  };
  takeProfitLevels: {
    level1: { percentage: number; size: number };
    level2: { percentage: number; size: number };
    trailingStop: { activation: number; callback: number };
  };
  poolRequirements: {
    minLiquidity: number;
    maxSlippage: number;
    minVolume: number;
    minTrades: number;
    maxSpread: number;
  };
  establishedPairsConfig: {
    takeProfitLevels: Array<{
      percentage: number;
      size: number;
    }>;
    trailingStop: {
      activation: number;
      callback: number;
      acceleration: {
        threshold: number;
        minCallback: number;
      };
    };
    dynamicStopLoss: {
      initial: number;
      breakeven: number;
      trailing: boolean;
    };
  };
}

import { PublicKey } from '@solana/web3.js';

export interface Position {
  id: string;
  symbol: string;
  tokenMint: PublicKey;
  exchange: string;
  chain: 'evm' | 'solana';
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  remainingQuantity: number;
  stopLoss: number;
  takeProfit: number;
  takeProfitLevels: {
    level1: { price: number; size: number; hit: boolean };
    level2: { price: number; size: number; hit: boolean };
    level3?: { price: number; size: number; hit: boolean };
  };
  trailingStop: {
    active: boolean;
    highestPrice: number;
    currentStop: number;
    callback: number;
    activationPrice?: number;
    acceleration?: {
      threshold: number;
      minCallback: number;
    };
  };
  isEstablishedPair: boolean;
  status: 'open' | 'closed';
  pnl?: number;
  openedAt: Date;
  closedAt?: Date;
  strategy: 'trend' | 'arbitrage' | 'pattern';
  confidence: number;
}

export interface PumpToken {
  address: string;
  symbol: string;
  name: string;
  initialLiquidity: number;
  currentLiquidity: number;
  raydiumMigrated: boolean;
  liquidityStableTime: Date | null;
  firstSeen: Date;
  lastUpdated: Date;
  trading_enabled: boolean;
  trading_score: number | null;
}

export interface OrderResult {
  id: string;
  exchange: string;
  symbol: string;
  side: 'long' | 'short';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price: number; // Required price
  stopLoss?: number;
  timestamp: number;
  status: string;
}

export interface TradeSignal {
  symbol: string;
  type: 'entry' | 'exit';
  chain: 'evm' | 'solana';
  side: 'long' | 'short';
  price: number;
  confidence: number;
  strategy: 'test' | 'trend' | 'momentum' | 'arbitrage' | 'pattern' | 'social' | 'pump' | 'news';
  reason: string;
  timestamp: Date;
  momentum?: number;
}

export interface BotStatus {
  isRunning: boolean;
  lastStarted?: Date;
  lastStopped?: Date;
  activePositions: number;
  pendingOrders: number;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  error?: string | null;
  serviceStatus?: {
    jupiter: boolean;
    supabase: boolean;
    whaleMonitor: boolean;
  };
  updated_at?: string;
}

export interface OrderParams {
  symbol: string;
  side: 'long' | 'short';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  exchange?: string;
  chain?: 'evm' | 'solana';
}

// Re-export PublicKey type for convenience
export { PublicKey } from '@solana/web3.js';
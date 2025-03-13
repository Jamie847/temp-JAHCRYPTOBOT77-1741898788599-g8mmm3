const baseConfig = {
  database: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  },
  jupiter: {
    baseUrl: 'https://quote-api.jup.ag/v6',
    retryConfig: {
      attempts: 3,
      delay: 1000,
      backoff: 2,
    },
  },
  scanning: {
    // Reduced thresholds for testing
    minLiquidity: 1000,               // $1K minimum liquidity
    minVolume24h: 500,                // $500 minimum volume
    minHolders: 10,                   // 10 holders minimum
    minVolumeIncrease: 5,             // 5% volume increase
    minHolderIncrease: 2,             // 2% holder increase
    minPriceIncrease: 1,              // 1% price increase
    volumeSpikeFactor: 1.2,           // 20% volume spike
    holderGrowthAcceleration: 1.2,    // 20% growth acceleration
    minSocialMentions: 1,             // Keep single mention
    minViralTweets: 1,                // Keep single viral tweet
    rsiThreshold: 30,                 // Even more aggressive RSI
    macdThreshold: 0,
    scanInterval: 30000,
    maxTrackedTokens: 100,
    confidenceThreshold: 0.2          // Lower confidence threshold for testing
  },

  // Position Sizing and Risk Management
  trading: {
    baseSize: 50,                     // Smaller base position size
    maxSize: 1000,
    accountRiskPerTrade: 5,

    // Confidence Multipliers
    confidenceMultipliers: {
      low: 0.7,                       // Higher multiplier for low confidence
      medium: 1.0,
      high: 2.0,
      extreme: 3.0,
    },

    // Momentum Multipliers
    momentumMultipliers: {
      volumeSpike: 2.0,               // Higher volume spike multiplier
      holderGrowth: 1.3,
      socialMomentum: 1.4,
      technicalBreakout: 1.6,
    },

    // Take Profit Levels
    takeProfitLevels: [
      { percent: 10, size: 0.4 },     // Take 40% at 10% profit
      { percent: 25, size: 0.4 },     // Take 40% at 25% profit
      { percent: 50, size: 0.2 }      // Let 20% ride for 50% profit
    ],

    // Dynamic Stop Loss
    stopLoss: {
      initial: 10,                    // Tighter initial stop
      trailing: {
        activation: 5,                // Earlier trailing stop activation
        callback: 5,
        acceleration: {
          threshold: 25,
          minCallback: 2,
          profitSteps: [
            { profit: 10, callback: 3 },
            { profit: 25, callback: 2 },
            { profit: 50, callback: 1 },
          ],
        },
      },
    },

    // Exit Conditions
    exitTriggers: {
      volumeDecline: 30,              // More lenient volume decline
      holderDecline: 5,               // More lenient holder decline
      momentumLoss: 0.3,              // More lenient momentum loss
      rsiOverbought: 85               // More lenient RSI overbought
    },
  },
};

// Token mint mapping
export const TOKEN_MINTS: Record<string, string> = {
  'SOL': 'So11111111111111111111111111111111111111112',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'ZNV': 'znv3FZt2HFAvzYf5LxzVyryh3mBXWuTRRng25gEZAjh',
  'SOLA': '9xKBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
  'MZEE': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk9nP4XqL9mXzWpump',
  'SPUP': '7g2KBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
  'PAIN': '3pKBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
};

// Custom token configuration
export const CUSTOM_TOKEN_CONFIG: Record<string, {
  address: string;
  minLiquidity: number;
  maxPriceImpact: number;
  monitoring: {
    minVolume24h: number;
    minSocialMentions: number;
    minConfidence: number;
    maxHolderConcentration: number;
  };
}> = {
  'SOLA': {
    address: '9xKBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
    minLiquidity: 1000,              // Lower liquidity requirement
    maxPriceImpact: 10,
    monitoring: {
      minVolume24h: 1000,            // Lower volume requirement
      minSocialMentions: 1,          // Single mention required
      minConfidence: 0.2,            // Lower confidence threshold
      maxHolderConcentration: 25,
    },
  },
  'MZEE': {
    address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk9nP4XqL9mXzWpump',
    minLiquidity: 2500,
    maxPriceImpact: 10,
    monitoring: {
      minVolume24h: 2500,
      minSocialMentions: 2,
      minConfidence: 0.3,
      maxHolderConcentration: 25,
    },
  },
  'SPUP': {
    address: '7g2KBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
    minLiquidity: 2500,
    maxPriceImpact: 10,
    monitoring: {
      minVolume24h: 2500,
      minSocialMentions: 2,
      minConfidence: 0.3,
      maxHolderConcentration: 25,
    },
  },
  'PAIN': {
    address: '3pKBRnN2zY9N6NkU2KQn6d8vJyu9m32zJ2RXDiyk9pump',
    minLiquidity: 5000,
    maxPriceImpact: 8,
    monitoring: {
      minVolume24h: 5000,
      minSocialMentions: 3,
      minConfidence: 0.4,
      maxHolderConcentration: 20,
    },
  },
  'ZNV': {
    address: 'znv3FZt2HFAvzYf5LxzVyryh3mBXWuTRRng25gEZAjh',
    minLiquidity: 5000,
    maxPriceImpact: 5,
    monitoring: {
      minVolume24h: 5000,
      minSocialMentions: 3,
      minConfidence: 0.4,
      maxHolderConcentration: 20,
    },
  },
};

// Define established pairs
export const ESTABLISHED_PAIRS = new Set([
  'SOL/USDC',  // Solana
  'ZNV/USDC',  // Custom token
  'SOLA/USDC', // Solapocalypse
  'MZEE/USDC', // MZee
  'SPUP/USDC', // SolaPup
  'PAIN/USDC'  // PAIN
]);

// Aggressive adjustments as described (further decrease thresholds by an extra 20% on top of our earlier suggestions)
const aggressiveConfig = {
  ...baseConfig,
  scanning: {
    // Liquidity and Volume: 50% of original then an extra 20% decrease → 0.5 * 0.8 = 0.4 of original
    minLiquidity: 10000 * 0.4,       // $4000 minimum liquidity
    minVolume24h: 5000 * 0.4,        // $2000 minimum volume
    minHolders: Math.round(50 * 0.8),  // 40 holders (unchanged, as further reduction might be too aggressive)
    // Growth Metrics: 100% → 100 * 0.5 = 50, then extra 20% → 50 * 0.8 = 40%
    minVolumeIncrease: 100 * 0.4,      // 40% volume increase
    minHolderIncrease: 20 * 0.4,       // 8% holder increase
    minPriceIncrease: 10 * 0.4,        // 4% price increase
    // Momentum Indicators: unchanged
    volumeSpikeFactor: 3,
    holderGrowthAcceleration: 2,
    // Social Signals: Lower thresholds by 20%
    minSocialMentions: Math.round(3 * 0.8),   // ~2 mentions
    minViralTweets: Math.round(1 * 0.8),      // still 1
    // Technical Indicators: Lower RSI threshold by 20%
    rsiThreshold: Math.round(55 * 0.8),         // ~44
    macdThreshold: 0,
    // Operational Settings: Scan interval and token count unchanged, lower confidence threshold
    scanInterval: 30000,
    maxTrackedTokens: 100,
    confidenceThreshold: 0.5
  },
  trading: {
    baseSize: 100,
    maxSize: 1000,
    accountRiskPerTrade: 5,
    confidenceMultipliers: {
      low: 0.5,
      medium: 1.0,
      high: 2.0,
      extreme: 3.0,
    },
    momentumMultipliers: {
      volumeSpike: 1.5,
      holderGrowth: 1.3,
      socialMomentum: 1.4,
      technicalBreakout: 1.6,
    },
    takeProfitLevels: [
      { percent: 20, size: 0.3 },
      { percent: 50, size: 0.3 },
      { percent: 100, size: 0.4 },
    ],
    stopLoss: {
      initial: 15,
      trailing: {
        activation: 10,
        callback: 5,
        acceleration: {
          threshold: 25,
          minCallback: 2,
          profitSteps: [
            { profit: 25, callback: 4 },
            { profit: 50, callback: 3 },
            { profit: 100, callback: 2 },
          ],
        },
      },
    },
    exitTriggers: {
      volumeDecline: 50,
      holderDecline: 10,
      momentumLoss: 0.5,
      rsiOverbought: 80,
    },
  },
};

export const config = aggressiveConfig;
export const productionConfig = aggressiveConfig.trading;
export const pumpMonitorConfig = {
  minLiquidityUSD: 100000,
  liquidityStabilityPeriod: 900000,
  scanInterval: 30000,
  maxTrackedTokens: 100,
};

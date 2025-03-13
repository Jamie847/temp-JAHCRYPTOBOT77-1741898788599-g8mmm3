// src/services/trading/config.ts

// Scanning configuration
export interface ScanningConfig {
  minLiquidity: number;
  minVolume24h: number;
  volumeSpike: number;
  maxPriceImpact: number;
  scanInterval: number;
  maxTrackedTokens: number;
  confidenceThreshold: number;
  jupiterApiKey: string;
}

// Sideways market protection settings
export interface SidewaysProtectionConfig {
  maxHoldingTime: number;
  priceRangeThreshold: number;
  volumeDeclineThreshold: number;
  minimumProgress: number;
  reallocateAfter: number;
}

// Confidence multipliers for position sizing
export interface ConfidenceMultipliers {
  low: number;
  medium: number;
  high: number;
}

// Take profit level settings
export interface TakeProfitLevel {
  percent: number;
  size: number;
}

// Stop-loss trailing configuration
export interface StopLossTrailingConfig {
  activation: number;
  callback: number;
  acceleration: {
    thresholds: { profit: number; callback: number }[];
    minCallback: number;
  };
}

// Stop-loss configuration
export interface StopLossConfig {
  initial: number;
  trailing: StopLossTrailingConfig;
}

// Trading settings including scaling parameters
export interface TradingConfig {
  baseSize: number;
  maxSize: number;
  accountRiskPerTrade: number;
  confidenceMultipliers: ConfidenceMultipliers;
  takeProfitLevels: TakeProfitLevel[];
  stopLoss: StopLossConfig;
  exitTriggers: {
    volumeDecline: number;
    momentumLoss: number;
  };
  // Scaling parameters for good runners
  scaleInThreshold: number;   // Profit percentage to trigger scaling in
  scaleInIncrement: number;   // Fraction of baseSize to add when scaling in
  maxScaleFactor: number;     // Maximum position size relative to baseSize (e.g., 3 means up to 3x baseSize)
}

// Overall configuration interface
export interface Config {
  scanning: ScanningConfig;
  sidewaysProtection: SidewaysProtectionConfig;
  trading: TradingConfig;
}

// Production configuration for live trading
export const productionConfig: Config = {
  scanning: {
    // Core requirements for momentum trades
    minLiquidity: 5000,               // $5K minimum liquidity for initial trades
    minVolume24h: 5000,               // $5K minimum volume
    volumeSpike: 1.5,                 // 1.5x volume increase trigger for early pumps
    maxPriceImpact: 2,                // Max 2% price impact
    scanInterval: 15000,              // 15-second scan interval for faster reaction
    maxTrackedTokens: 100,            // Track top 100 tokens
    confidenceThreshold: 0.5,         // 50% minimum confidence to allow more trades
    jupiterApiKey: '2f55a30f-41b7-49b1-ae89-a33dee91ad51'
  },

  sidewaysProtection: {
    maxHoldingTime: 1800000,          // 30 minutes maximum hold time if no significant movement
    priceRangeThreshold: 2,           // 2% price range for sideways detection
    volumeDeclineThreshold: 30,       // 30% volume decline indicates a sideways market
    minimumProgress: 5,               // Minimum 5% move required within maxHoldingTime
    reallocateAfter: 900000           // Reallocate capital after 15 minutes of sideways movement
  },

  trading: {
    baseSize: 20,                     // Base position size (allows more diversification)
    maxSize: 50,                      // Maximum position size per trade
    accountRiskPerTrade: 2,           // 2% account risk per trade

    confidenceMultipliers: {
      low: 0.4,                       // 40% of base size for low confidence
      medium: 0.6,                    // 60% for medium confidence
      high: 1.0                       // Full size for high confidence
    },

    takeProfitLevels: [
      { percent: 15, size: 0.3 },      // Take 30% profit at 15% gain
      { percent: 30, size: 0.3 },      // Take 30% profit at 30% gain
      { percent: 50, size: 0.2 },      // Take 20% at 50% gain
      { percent: 100, size: 0.2 }      // Let 20% ride for 100%+ gains
    ],

    stopLoss: {
      initial: 5,                     // Tighter 5% initial stop loss for capital preservation
      trailing: {
        activation: 10,               // Activate trailing stop at 10% profit
        callback: 5,                  // Initial callback of 5%
        acceleration: {
          thresholds: [
            { profit: 20, callback: 7 },
            { profit: 40, callback: 10 },
            { profit: 80, callback: 15 }
          ],
          minCallback: 5              // Never tighten below 5%
        }
      }
    },

    exitTriggers: {
      volumeDecline: 40,              // Exit if volume declines by 40%
      momentumLoss: 0.3               // Exit if momentum falls below 30%
    },

    // Scaling parameters for good runners
    scaleInThreshold: 20,             // Trigger scale-in if trade is up 20%
    scaleInIncrement: 0.5,            // Add 50% of baseSize on each scale-in
    maxScaleFactor: 3                 // Maximum scaled position is 3x baseSize
  }
};

// Configuration for pump token monitoring
export const pumpMonitorConfig: Config = {
  scanning: {
    minLiquidity: 10000,              // $10K minimum liquidity for pump tokens
    minVolume24h: 10000,              // $10K minimum volume
    volumeSpike: 2.0,                 // 2x volume increase trigger
    maxPriceImpact: 3,                // Max 3% price impact
    scanInterval: 30000,              // 30-second scan interval
    maxTrackedTokens: 50,             // Track top 50 tokens
    confidenceThreshold: 0.6,         // 60% minimum confidence
    jupiterApiKey: '2f55a30f-41b7-49b1-ae89-a33dee91ad51'
  },

  sidewaysProtection: {
    maxHoldingTime: 900000,           // 15 minutes maximum hold time
    priceRangeThreshold: 3,           // 3% price range for sideways detection
    volumeDeclineThreshold: 40,       // 40% volume decline indicates sideways
    minimumProgress: 8,               // Minimum 8% move required
    reallocateAfter: 600000           // Reallocate after 10 minutes sideways
  },

  trading: {
    baseSize: 15,                     // Smaller base size for pump tokens
    maxSize: 30,                      // Lower max size per trade
    accountRiskPerTrade: 0.3,         // Lower risk per trade

    confidenceMultipliers: {
      low: 0.3,                       // More conservative sizing
      medium: 0.5,
      high: 0.8
    },

    takeProfitLevels: [
      { percent: 30, size: 0.4 },     // Take 40% profit at 30% gain
      { percent: 60, size: 0.4 },     // Take 40% profit at 60% gain
      { percent: 150, size: 0.2 }     // Let 20% ride for 150%+ gains
    ],

    stopLoss: {
      initial: 15,                    // Wider initial stop for volatility
      trailing: {
        activation: 20,               // Activate trailing stop at 20% profit
        callback: 10,                 // Larger callback for volatility
        acceleration: {
          thresholds: [
            { profit: 40, callback: 15 },
            { profit: 80, callback: 20 },
            { profit: 150, callback: 25 }
          ],
          minCallback: 10             // Never tighten below 10%
        }
      }
    },

    exitTriggers: {
      volumeDecline: 50,              // Exit on 50% volume decline
      momentumLoss: 0.4               // Exit on 40% momentum loss
    },

    scaleInThreshold: 25,             // Scale in at 25% profit
    scaleInIncrement: 0.4,            // Add 40% of base size
    maxScaleFactor: 2                 // Maximum 2x base size
  }
};

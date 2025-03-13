import { Connection, PublicKey } from '@solana/web3.js';
import { formatDistanceToNow } from 'date-fns';
import { logger } from '../logger/index.js';
import { supabase } from '../supabase/index.js';
import { productionConfig as config } from './config.js';
import { PerformanceMonitor } from './monitoring/performanceMonitor.js';
import { LiquidityAnalyzer } from './analysis/liquidityAnalysis.js';
import { WhaleMonitor } from './monitoring/whaleMonitor.js';
import { SignalAggregator } from './signalAggregator.js';
import { VolumeAnalyzer } from './monitoring/volumeAnalyzer.js';
import { JupiterDEX } from './solana/jupiter.js';
import { TradeSignal, Position, BotStatus } from '../../types/crypto.js';

// Define USDC public key constant for use in swap and market price lookups.
const USDC_PUBLIC_KEY = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const PROFIT_THRESHOLD_USDC = 100000; // Take profits at $100K
const MIN_TRADE_SIZE_USDC = 1000;     // Minimum $1K trade size
const PROFIT_TAKE_RATE = 0.33;        // Take 33% of profits

export class TradingBot {
  private connection: Connection;
  private signalAggregator: SignalAggregator;
  private volumeAnalyzer: VolumeAnalyzer;
  private jupiter: JupiterDEX;
  private performanceMonitor: PerformanceMonitor;
  private liquidityAnalyzer: LiquidityAnalyzer;
  private whaleMonitor: WhaleMonitor;
  private positionStartTimes: Map<string, number> = new Map();
  private positions: Map<string, Position> = new Map();
  private isRunning = false;
  private botInitialized = false;
  private usdcBalance: number = 0;
  private shutdownRequested = false;
  private profitWallet: PublicKey | null = null;
  private readonly PROFIT_THRESHOLD = 100000; // $100K profit threshold
  private readonly PROFIT_TAKE_RATE = 0.33;   // 33% profit taking rate
  private serviceStatus = {
    jupiter: false,
    supabase: false,
    whaleMonitor: false
  };
  private totalPnL = 0;
  private winningTrades = 0;
  private totalTrades = 0;
  private sessionStartTime: Date = new Date();
  private dailyStats = {
    trades: 0,
    wins: 0,
    pnl: 0,
    bestTrade: 0,
    worstTrade: 0,
  };

  // Market price cache to reduce redundant calls
  private marketPriceCache: { [mint: string]: { price: number; timestamp: number } } = {};
  // In-memory trade history for learning adjustments
  private tradeHistory: { roi: number; confidence: number }[] = [];

  constructor(connection: Connection) {
    this.connection = connection;
    // config.scanning must include jupiterApiKey in its object
    this.signalAggregator = new SignalAggregator(config.scanning);
    this.volumeAnalyzer = new VolumeAnalyzer();
    this.jupiter = new JupiterDEX(connection);
    this.performanceMonitor = new PerformanceMonitor();
    this.liquidityAnalyzer = new LiquidityAnalyzer();
    this.whaleMonitor = new WhaleMonitor(connection);
  }

  async initialize(): Promise<void> {
    try {
      // Set profit wallet if provided
      if (process.env.PROFIT_WALLET_ADDRESS) {
        this.profitWallet = new PublicKey(process.env.PROFIT_WALLET_ADDRESS);
      }

      // Initialize Jupiter first as it's critical
      await this.jupiter.initialize();
      this.serviceStatus.jupiter = true;
      logger.info('Jupiter initialized successfully');
      
      // Verify Supabase connection
      const { data, error } = await supabase.from('bot_status').select('count');
      if (error) throw new Error(`Supabase connection failed: ${error.message}`);
      this.serviceStatus.supabase = true;
      logger.info('Supabase connection verified');

      // Initialize or update bot status
      await this.initializeBotStatus();

      // Start whale monitor
      await this.whaleMonitor.start();
      this.serviceStatus.whaleMonitor = true;
      logger.info('Whale monitor started');

      this.botInitialized = true;
      logger.info('Trading bot initialized successfully', {
        services: this.serviceStatus
      });

      // Recover state if needed
      await this.recoverState();

      // Get initial USDC balance
      await this.updateUSDCBalance();
      logger.info('Initial USDC balance:', { balance: this.usdcBalance });

    } catch (error) {
      logger.error('Error initializing trading bot:', error);
      await this.handleInitializationError(error);
      throw error;
    }
  }

  private async initializeBotStatus(): Promise<void> {
    try {
      const { data: existingStatus } = await supabase
        .from('bot_status')
        .select('*')
        .eq('id', 1)
        .single();

      if (!existingStatus) {
        await supabase
          .from('bot_status')
          .insert([{
            id: 1,
            isRunning: false,
            activePositions: 0,
            pendingOrders: 0,
            lastStarted: null,
            lastStopped: null,
            error: null,
            serviceStatus: this.serviceStatus
          }]);
      } else {
        await this.updateBotStatus({
          serviceStatus: this.serviceStatus,
          error: null
        });
      }
    } catch (error) {
      logger.error('Error initializing bot status:', error);
      throw error;
    }
  }

  private async recoverState(): Promise<void> {
    try {
      // Get existing positions
      const { data: positions } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'open');

      if (positions?.length) {
        logger.info(`Recovering ${positions.length} open positions`);
        for (const position of positions) {
          this.positions.set(position.symbol, {
            ...position,
            tokenMint: new PublicKey(position.tokenMint)
          });
        }
      }

      // Check if bot should be running
      const { data: status } = await supabase
        .from('bot_status')
        .select('isRunning')
        .eq('id', 1)
        .single();

      if (status?.isRunning && !this.shutdownRequested) {
        await this.start();
      }
    } catch (error) {
      logger.error('Error recovering state:', error);
      throw error;
    }
  }

  private async handleInitializationError(error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    try {
      await this.updateBotStatus({
        isRunning: false,
        error: errorMessage,
        serviceStatus: this.serviceStatus
      });
    } catch (updateError) {
      logger.error('Error updating bot status after initialization error:', updateError);
    }
  }

  private async updateBotStatus(status: Partial<BotStatus>): Promise<void> {
    try {
      await supabase
        .from('bot_status')
        .update({
          ...status,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
    } catch (error) {
      logger.error('Error updating bot status:', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning || this.shutdownRequested) return;
    
    // Verify initialization
    if (!this.botInitialized) {
      throw new Error('Bot must be initialized before starting');
    }

    // Verify all services are ready
    if (!Object.values(this.serviceStatus).every(status => status)) {
      throw new Error('Cannot start bot: Not all services are initialized');
    }

    this.isRunning = true;
    this.shutdownRequested = false;
    
    await this.updateBotStatus({
      isRunning: true,
      lastStarted: new Date(),
      error: null,
      activePositions: this.positions.size
    });
    
    this.logBotStatus('started');
    logger.info('Bot started successfully');

    // Start all monitoring loops
    this.startMonitoringLoops();
    this.scheduleDailyReset();

    // Initial market scan
    await this.scanMarketOpportunities();
  }

  private async scanMarketOpportunities() {
    try {
      const signals = await this.signalAggregator.aggregateSignals();
      
      for (const signal of signals) {
        await this.evaluateSignal(signal);
      }
      
      logger.info('Market scan completed', {
        signalsFound: signals.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error scanning market opportunities:', error);
    }
  }

  async stop(): Promise<void> {
    this.shutdownRequested = true;
    this.isRunning = false;

    // Close all positions if any are open
    for (const [symbol, position] of this.positions.entries()) {
      try {
        await this.exitPosition(symbol, position, 'bot_shutdown');
      } catch (error) {
        logger.error(`Error closing position during shutdown: ${symbol}`, error);
      }
    }
    
    await this.updateBotStatus({
      isRunning: false,
      lastStopped: new Date(),
      activePositions: 0,
      error: null
    });
    
    this.logBotStatus('stopped');
    logger.info('Bot stopped successfully');
  }

  private logBotStatus(status: 'started' | 'stopped'): void {
    const stats = {
      status,
      uptime: formatDistanceToNow(this.sessionStartTime, { addSuffix: true }),
      totalPnL: `$${this.totalPnL.toFixed(2)}`,
      winRate:
        this.totalTrades > 0
          ? `${((this.winningTrades / this.totalTrades) * 100).toFixed(1)}%`
          : 'N/A',
      activePositions: this.positions.size,
      dailyStats: {
        trades: this.dailyStats.trades,
        winRate:
          this.dailyStats.trades > 0
            ? `${((this.dailyStats.wins / this.dailyStats.trades) * 100).toFixed(1)}%`
            : 'N/A',
        pnl: `$${this.dailyStats.pnl.toFixed(2)}`,
        bestTrade: `$${this.dailyStats.bestTrade.toFixed(2)}`,
        worstTrade: `$${this.dailyStats.worstTrade.toFixed(2)}`,
      },
    };
    logger.info('Bot Status Update:', stats);
  }

  private logPerformanceMetrics(): void {
    const metrics = {
      totalPnL: `$${this.totalPnL.toFixed(2)}`,
      session: {
        duration: formatDistanceToNow(this.sessionStartTime, { addSuffix: true }),
        trades: this.totalTrades,
        winRate:
          this.totalTrades > 0
            ? `${((this.winningTrades / this.totalTrades) * 100).toFixed(1)}%`
            : 'N/A',
      },
      positions: {
        active: this.positions.size,
        details: Array.from(this.positions.entries()).map(([symbol, pos]) => ({
          symbol,
          entryPrice: `$${pos.entryPrice.toFixed(4)}`,
          remainingQuantity: pos.remainingQuantity,
          duration: formatDistanceToNow(pos.openedAt, { addSuffix: true }),
        })),
      },
    };
    logger.info('Performance Update:', metrics);
  }

  private startMonitoringLoops(): void {
    // Add USDC balance monitoring
    const balanceInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(balanceInterval);
        return;
      }
      try {
        await this.updateUSDCBalance();
        await this.checkAndTransferProfits();
      } catch (error) {
        logger.error('Error monitoring USDC balance:', error);
      }
    }, 60000); // Check every minute

    const performanceInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(performanceInterval);
        return;
      }
      try {
        const metrics = await this.performanceMonitor.trackPerformance();
        await this.updateBotStatusRecord({
          totalPnL: this.totalPnL,
          winRate: this.totalTrades > 0 ? (this.winningTrades / this.totalTrades) * 100 : 0,
          activePositions: this.positions.size,
        });
        this.logPerformanceMetrics();
      } catch (error) {
        logger.error('Error monitoring performance:', error);
      }
    }, 60000);

    const signalsInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(signalsInterval);
        return;
      }
      try {
        const signals = await this.signalAggregator.aggregateSignals();
        for (const signal of signals) {
          await this.evaluateSignal(signal);
        }
      } catch (error) {
        logger.error('Error monitoring signals:', error);
      }
    }, config.scanning.scanInterval);

    const positionsInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(positionsInterval);
        return;
      }
      try {
        for (const [symbol, position] of this.positions.entries()) {
          await this.updatePosition(symbol, position);
        }
      } catch (error) {
        logger.error('Error monitoring positions:', error);
      }
    }, 1000);
  }

  private async updateUSDCBalance(): Promise<void> {
    try {
      const tokenAccount = await this.jupiter.getTokenAccount(USDC_PUBLIC_KEY);
      this.usdcBalance = tokenAccount ? tokenAccount.amount / 1e6 : 0;
    } catch (error) {
      logger.error('Error updating USDC balance:', error);
    }
  }

  private async checkAndTransferProfits(): Promise<void> {
    try {
      // Only transfer profits if we've hit the threshold
      if (this.totalPnL >= this.PROFIT_THRESHOLD && this.profitWallet) {
        const profitToTransfer = this.totalPnL * this.PROFIT_TAKE_RATE;
        
        if (profitToTransfer > 0) {
          logger.info('Taking profits:', { 
            totalPnL: this.totalPnL,
            transferAmount: profitToTransfer,
            remainingBalance: this.totalPnL - profitToTransfer,
            profitThreshold: this.PROFIT_THRESHOLD,
            takeRate: this.PROFIT_TAKE_RATE
          });
          
          const result = await this.jupiter.transferToken(
            USDC_PUBLIC_KEY,
            this.profitWallet,
            profitToTransfer * 1e6 // Convert to USDC decimals
          );

          if (result.status === 'success') {
            logger.info('Profit transfer successful:', {
              amount: profitToTransfer,
              signature: result.signature
            });
            await this.updateUSDCBalance();
            this.totalPnL -= profitToTransfer;
          }
        }
      }
    } catch (error) {
      logger.error('Error transferring profits:', error);
    }
  }

  private async getCachedMarketPrice(tokenMint: PublicKey, cacheDuration = 3000): Promise<number> {
    const key = tokenMint.toString();
    const now = Date.now();
    if (this.marketPriceCache[key] && now - this.marketPriceCache[key].timestamp < cacheDuration) {
      return this.marketPriceCache[key].price;
    }
    // Pass the required USDC public key as the second argument.
    const price = await this.jupiter.getMarketPrice(tokenMint, USDC_PUBLIC_KEY);
    this.marketPriceCache[key] = { price, timestamp: now };
    return price;
  }

  async evaluateSignal(signal: TradeSignal): Promise<void> {
    try {
      if (this.positions.has(signal.symbol)) return;

      const tokenMint = new PublicKey(signal.symbol);
      const [liquidityAnalysis, whaleMetrics, price] = await Promise.all([
        this.liquidityAnalyzer.analyzeLiquidity(tokenMint, config.trading.baseSize),
        this.whaleMonitor.getWhaleMetrics(signal.symbol),
        this.getCachedMarketPrice(tokenMint),
      ]);

      if (!liquidityAnalysis.isSafe) {
        logger.info(`Skipping ${signal.symbol} - ${liquidityAnalysis.reason}`);
        return;
      }
      if (whaleMetrics.signals.distribution) {
        logger.info(`Skipping ${signal.symbol} - Whale distribution detected`);
        return;
      }

      const baseSize = this.calculatePositionSize(signal.confidence);
      // Use SwapParams object
      const tradeResult = await this.jupiter.swap({
        inputToken: tokenMint,
        outputToken: USDC_PUBLIC_KEY,
        amount: baseSize,
        slippage: 1
      });

      if (tradeResult.status === 'success') {
        this.positionStartTimes.set(signal.symbol, Date.now());
        this.positions.set(signal.symbol, {
          symbol: signal.symbol,
          tokenMint,
          entryPrice: price,
          quantity: tradeResult.amountOut,
          remainingQuantity: tradeResult.amountOut,
          stopLoss: price * (1 - config.trading.stopLoss.initial / 100),
          takeProfitLevels: {
            level1: {
              price: price * (1 + config.trading.takeProfitLevels[0].percent / 100),
              size: config.trading.takeProfitLevels[0].size,
              hit: false,
            },
            level2: {
              price: price * (1 + config.trading.takeProfitLevels[1].percent / 100),
              size: config.trading.takeProfitLevels[1].size,
              hit: false,
            },
          },
          trailingStop: {
            active: false,
            highestPrice: price,
            currentStop: 0,
            callback: config.trading.stopLoss.trailing.callback,
          },
          status: 'open',
          strategy: signal.strategy as 'trend' | 'arbitrage' | 'pattern',
          confidence: signal.confidence,
          openedAt: new Date(),
        } as Position);

        logger.info('Entered new position:', {
          symbol: signal.symbol,
          price,
          quantity: tradeResult.amountOut,
        });
      }
    } catch (error) {
      logger.error('Error evaluating signal:', error);
    }
  }

  private async updatePosition(symbol: string, position: Position): Promise<void> {
    try {
      const currentPrice = await this.getCachedMarketPrice(position.tokenMint);
      const positionAge = Date.now() - (this.positionStartTimes.get(symbol) || Date.now());

      if (positionAge > config.sidewaysProtection.maxHoldingTime) {
        const priceChange = Math.abs((currentPrice - position.entryPrice) / position.entryPrice * 100);
        if (priceChange < config.sidewaysProtection.minimumProgress) {
          await this.exitPosition(symbol, position, 'sideways_timeout');
          return;
        }
      }

      if (positionAge > config.sidewaysProtection.reallocateAfter) {
        const volumeMetrics = await this.volumeAnalyzer.calculateRVOL(symbol);
        const priceRange = await this.getPriceRange(position.tokenMint);
        if (
          volumeMetrics.volumeSpikes.oneHour < (1 - config.sidewaysProtection.volumeDeclineThreshold / 100) &&
          priceRange < config.sidewaysProtection.priceRangeThreshold
        ) {
          await this.exitPosition(symbol, position, 'sideways_detected');
          return;
        }
      }

      const whaleMetrics = await this.whaleMonitor.getWhaleMetrics(symbol);
      if (whaleMetrics.signals.distribution && position.trailingStop.active) {
        await this.exitPosition(symbol, position, 'whale_distribution');
        return;
      }

      if (position.trailingStop.active) {
        if (currentPrice > position.trailingStop.highestPrice) {
          position.trailingStop.highestPrice = currentPrice;
          position.trailingStop.currentStop = currentPrice * (1 - position.trailingStop.callback / 100);
        }
        if (currentPrice <= position.trailingStop.currentStop) {
          await this.exitPosition(symbol, position, 'trailing_stop');
          return;
        }
      }

      if (currentPrice <= position.stopLoss) {
        await this.exitPosition(symbol, position, 'stop_loss');
        return;
      }

      if (!position.takeProfitLevels.level1.hit && currentPrice >= position.takeProfitLevels.level1.price) {
        const sellAmount = position.quantity * position.takeProfitLevels.level1.size;
        const sellResult = await this.executeSell(position.tokenMint, sellAmount);
        position.remainingQuantity -= sellAmount;
        position.takeProfitLevels.level1.hit = true;
      }

      if (!position.takeProfitLevels.level2.hit && currentPrice >= position.takeProfitLevels.level2.price) {
        const sellAmount = position.quantity * position.takeProfitLevels.level2.size;
        const sellResult = await this.executeSell(position.tokenMint, sellAmount);
        position.remainingQuantity -= sellAmount;
        position.takeProfitLevels.level2.hit = true;

        position.trailingStop.active = true;
        position.trailingStop.highestPrice = currentPrice;
        position.trailingStop.currentStop = currentPrice * (1 - position.trailingStop.callback / 100);
      }

      const volumeMetrics = await this.volumeAnalyzer.calculateRVOL(symbol);
      if (volumeMetrics.volumeSpikes.oneHour < (1 - config.trading.exitTriggers.volumeDecline / 100)) {
        await this.exitPosition(symbol, position, 'volume_decline');
        return;
      }
    } catch (error) {
      logger.error('Error updating position:', error);
    }
  }

  private async exitPosition(symbol: string, position: Position, reason: string): Promise<void> {
    try {
      const currentPrice = await this.getCachedMarketPrice(position.tokenMint);
      const sellResult = await (this.jupiter.swap as (params: {
        inputToken: PublicKey;
        outputToken: PublicKey;
        amount: number;
        slippage: number;
      }) => Promise<any>)({
        inputToken: position.tokenMint,
        outputToken: USDC_PUBLIC_KEY,
        amount: position.remainingQuantity,
        slippage: 1,
      });
      const pnl = (currentPrice - position.entryPrice) * position.remainingQuantity * currentPrice;
      const roi = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      const holdingTime = formatDistanceToNow(position.openedAt, { addSuffix: true });

      this.totalPnL += pnl;
      this.dailyStats.trades++;
      this.dailyStats.pnl += pnl;
      this.dailyStats.bestTrade = Math.max(this.dailyStats.bestTrade, pnl);
      this.dailyStats.worstTrade = Math.min(this.dailyStats.worstTrade, pnl);
      if (pnl > 0) {
        this.winningTrades++;
        this.dailyStats.wins++;
      }
      this.totalTrades++;
      this.tradeHistory.push({ roi, confidence: position.confidence });
      this.adjustConfidenceMultiplier();

      logger.info('Trade Closed:', {
        symbol,
        result: pnl > 0 ? 'WIN' : 'LOSS',
        metrics: {
          pnl: `$${pnl.toFixed(2)}`,
          roi: `${roi.toFixed(2)}%`,
          holdingTime,
          exitReason: reason,
        },
        position: {
          entry: `$${position.entryPrice.toFixed(4)}`,
          exit: `$${currentPrice.toFixed(4)}`,
          size: position.remainingQuantity,
        },
        strategy: position.strategy,
        confidence: position.confidence,
      });

      await this.storeTradeRecord({
        symbol,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        pnl,
        reason,
        holdingTime,
        roi,
      });

      this.positions.delete(symbol);
    } catch (error) {
      logger.error('Error exiting position:', error);
    }
    this.positionStartTimes.delete(symbol);
  }

  private async storeTradeRecord(trade: {
    symbol: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    reason: string;
    holdingTime: string;
    roi: number;
  }, attempt: number = 0): Promise<void> {
    logger.info('Storing trade record:', trade);
    // Insert your DB/persistent logging code here.
  }

  private async updateBotStatusRecord(status: {
    totalPnL: number;
    winRate: number;
    activePositions: number;
  }): Promise<void> {
    logger.info('Updating bot status:', status);
    // Implement your bot status update mechanism here.
  }

  private async getPriceRange(tokenMint: PublicKey): Promise<number> {
    try {
      const endpoint = this.getPriceApiEndpoint();
      const apiKey = this.getApiKey();
      const response = await fetch(
        `${endpoint}?inputMint=${tokenMint.toString()}&range=1h`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      if (!response.ok) throw new Error('Failed to get price range');
      const data = await response.json();
      const prices = data.data || [];
      if (prices.length < 2) return 0;
      const high = Math.max(...prices.map((p: any) => p.price));
      const low = Math.min(...prices.map((p: any) => p.price));
      return ((high - low) / low) * 100;
    } catch (error) {
      logger.error('Error getting price range:', error);
      return 0;
    }
  }

  private getPriceApiEndpoint(): string {
    return (this.jupiter as any).API_ENDPOINTS.PRICE;
  }

  private getApiKey(): string {
    return (this.jupiter as any).API_KEY;
  }

  private async executeSell(tokenMint: PublicKey, sellAmount: number): Promise<any> {
    // Use SwapParams object
    const result = await this.jupiter.swap({
      inputToken: tokenMint,
      outputToken: USDC_PUBLIC_KEY,
      amount: sellAmount,
      slippage: 1
    });
    return result;
  }

  private resetDailyStats(): void {
    this.dailyStats = {
      trades: 0,
      wins: 0,
      pnl: 0,
      bestTrade: 0,
      worstTrade: 0,
    };
  }

  private adjustConfidenceMultiplier(): void {
    if (this.tradeHistory.length < 5) return;
    const avgROI = this.tradeHistory.reduce((acc, trade) => acc + trade.roi, 0) / this.tradeHistory.length;
    if (avgROI < 0) {
      config.trading.confidenceMultipliers.high *= 0.95;
      config.trading.confidenceMultipliers.medium *= 0.95;
      config.trading.confidenceMultipliers.low *= 0.95;
      logger.info('Adjusted confidence multipliers downward based on trade history');
    } else {
      config.trading.confidenceMultipliers.high *= 1.01;
      config.trading.confidenceMultipliers.medium *= 1.01;
      config.trading.confidenceMultipliers.low *= 1.01;
      logger.info('Adjusted confidence multipliers upward based on trade history');
    }
    if (this.tradeHistory.length > 50) {
      this.tradeHistory = [];
    }
  }

  private calculatePositionSize(confidence: number): number {
    let multiplier = config.trading.confidenceMultipliers.low;
    let accountValue = this.totalPnL + this.usdcBalance;
    let maxRiskAmount = accountValue * (config.trading.accountRiskPerTrade / 100);
    
    if (confidence >= 0.8) {
      multiplier = config.trading.confidenceMultipliers.high;
    } else if (confidence >= 0.6) {
      multiplier = config.trading.confidenceMultipliers.medium;
    }
    
    // Dynamic position sizing based on account growth
    const scaledBaseSize = Math.min(
      config.trading.baseSize * (1 + (accountValue / 1000)),
      maxRiskAmount / (config.trading.stopLoss.initial / 100)
    );
    const size = scaledBaseSize * multiplier;
    
    return Math.min(size, config.trading.maxSize);
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeUntilReset = tomorrow.getTime() - now.getTime();
    setTimeout(() => {
      this.resetDailyStats();
      this.scheduleDailyReset();
    }, timeUntilReset);
  }
}

// Define the SwapParams interface for type safety in swap calls.
interface SwapParams {
  inputToken: PublicKey;
  outputToken: PublicKey;
  amount: number;
  slippage: number;
}

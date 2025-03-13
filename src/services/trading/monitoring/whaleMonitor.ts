import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../../logger/index.js';
import { supabase } from '../../supabase/index.js';

interface WhaleTransaction {
  signature: string;
  type: 'buy' | 'sell';
  amount: number;
  usdValue: number;
  walletAddress: string;
  timestamp: Date;
}

interface WhaleMetrics {
  recentTransactions: WhaleTransaction[];
  netFlow24h: number;
  largestTransaction: WhaleTransaction;
  whaleCount: number;
  confidence: number;
  signals: {
    accumulation: boolean;
    distribution: boolean;
    largeTransfer: boolean;
  };
}

export class WhaleMonitor {
  private connection: Connection;
  private readonly WHALE_THRESHOLD = 100000; // $100K minimum for whale tx
  private readonly SIGNIFICANT_FLOW = 1000000; // $1M significant net flow
  private readonly SCAN_INTERVAL = 60000; // 1 minute
  private isRunning = false;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    while (this.isRunning) {
      try {
        await this.scanWhaleActivity();
        await new Promise(resolve => setTimeout(resolve, this.SCAN_INTERVAL));
      } catch (error) {
        logger.error('Error in whale monitoring loop:', error);
        await new Promise(resolve => setTimeout(resolve, this.SCAN_INTERVAL));
      }
    }
  }

  async stop() {
    this.isRunning = false;
  }

  async getWhaleMetrics(tokenAddress: string): Promise<WhaleMetrics> {
    try {
      // Get recent whale transactions
      const transactions = await this.getRecentWhaleTransactions(tokenAddress);

      // Calculate net flow
      const netFlow24h = transactions.reduce((sum, tx) => 
        sum + (tx.type === 'buy' ? tx.usdValue : -tx.usdValue),
        0
      );

      // Get largest transaction
      const largestTransaction = transactions.reduce((max, tx) =>
        tx.usdValue > (max?.usdValue || 0) ? tx : max,
        transactions[0]
      );

      // Count unique whale wallets
      const whaleWallets = new Set(transactions.map(tx => tx.walletAddress));

      // Generate signals
      const signals = {
        accumulation: netFlow24h > this.SIGNIFICANT_FLOW,
        distribution: netFlow24h < -this.SIGNIFICANT_FLOW,
        largeTransfer: largestTransaction?.usdValue > this.SIGNIFICANT_FLOW
      };

      // Calculate confidence
      const confidence = this.calculateConfidence({
        netFlow: netFlow24h,
        transactions,
        whaleCount: whaleWallets.size
      });

      return {
        recentTransactions: transactions,
        netFlow24h,
        largestTransaction,
        whaleCount: whaleWallets.size,
        confidence,
        signals
      };
    } catch (error) {
      logger.error('Error getting whale metrics:', error);
      return this.getDefaultMetrics();
    }
  }

  private async scanWhaleActivity() {
    try {
      // Get tokens to monitor
      const { data: tokens } = await supabase
        .from('pump_tokens')
        .select('address, symbol')
        .eq('trading_enabled', true);

      if (!tokens) return;

      for (const token of tokens) {
        const metrics = await this.getWhaleMetrics(token.address);
        
        // Store whale activity
        await this.storeWhaleActivity(token.address, metrics);

        // Log significant activity
        if (metrics.confidence > 0.7) {
          logger.info('Significant whale activity detected:', {
            token: token.symbol,
            netFlow: metrics.netFlow24h,
            whaleCount: metrics.whaleCount,
            confidence: metrics.confidence
          });
        }
      }
    } catch (error) {
      logger.error('Error scanning whale activity:', error);
    }
  }

  private async getRecentWhaleTransactions(
    tokenAddress: string
  ): Promise<WhaleTransaction[]> {
    const { data: transactions } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('token_address', tokenAddress)
      .gte('usd_value', this.WHALE_THRESHOLD)
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false });

    return transactions?.map(tx => ({
      signature: tx.signature,
      type: tx.is_buy ? 'buy' : 'sell',
      amount: tx.amount,
      usdValue: tx.usd_value,
      walletAddress: tx.wallet_address,
      timestamp: new Date(tx.timestamp)
    })) || [];
  }

  private async storeWhaleActivity(
    tokenAddress: string,
    metrics: WhaleMetrics
  ) {
    try {
      await supabase.from('whale_activity').insert([{
        token_address: tokenAddress,
        net_flow_24h: metrics.netFlow24h,
        whale_count: metrics.whaleCount,
        confidence: metrics.confidence,
        signals: metrics.signals,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      logger.error('Error storing whale activity:', error);
    }
  }

  private calculateConfidence(params: {
    netFlow: number;
    transactions: WhaleTransaction[];
    whaleCount: number;
  }): number {
    const weights = {
      netFlow: 0.4,
      transactionCount: 0.3,
      whaleCount: 0.3
    };

    // Net flow score
    const netFlowScore = Math.min(
      Math.abs(params.netFlow) / this.SIGNIFICANT_FLOW,
      1
    );

    // Transaction count score
    const txScore = Math.min(params.transactions.length / 10, 1);

    // Whale count score
    const whaleScore = Math.min(params.whaleCount / 5, 1);

    return (
      netFlowScore * weights.netFlow +
      txScore * weights.transactionCount +
      whaleScore * weights.whaleCount
    );
  }

  private getDefaultMetrics(): WhaleMetrics {
    return {
      recentTransactions: [],
      netFlow24h: 0,
      largestTransaction: {
        signature: '',
        type: 'buy',
        amount: 0,
        usdValue: 0,
        walletAddress: '',
        timestamp: new Date()
      },
      whaleCount: 0,
      confidence: 0,
      signals: {
        accumulation: false,
        distribution: false,
        largeTransfer: false
      }
    };
  }
}

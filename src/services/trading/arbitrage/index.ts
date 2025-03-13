import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../../logger/index.js';
import { supabase } from '../../supabase/index.js';
import { ArbitrageOpportunity } from '../../../types/crypto.js';

export class ArbitrageScanner {
  private connection: Connection;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private readonly SCAN_INTERVAL = 30000; // 30 seconds
  private readonly MIN_PROFIT_PERCENTAGE = 0.5; // 0.5% minimum profit

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('Starting arbitrage scanner');

    this.scanInterval = setInterval(
      () => this.scanArbitrageOpportunities(),
      this.SCAN_INTERVAL
    );

    // Initial scan
    await this.scanArbitrageOpportunities();
  }

  async stop() {
    this.isRunning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    logger.info('Arbitrage scanner stopped');
  }

  async fetchArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
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
          price: opp.price_a, // Use price from first exchange
          volume24h: 0, // Not available in this context
          priceChange24h: 0, // Not available in this context
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

  private async scanArbitrageOpportunities() {
    try {
      // Get prices from different DEXes
      const opportunities = await this.findArbitrageOpportunities();

      // Store profitable opportunities
      for (const opp of opportunities) {
        if (opp.profitPercentage >= this.MIN_PROFIT_PERCENTAGE) {
          await this.storeOpportunity(opp);
        }
      }
    } catch (error) {
      logger.error('Error scanning arbitrage opportunities:', error);
    }
  }

  private async findArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
    // This is a placeholder - implement actual DEX price comparison
    // For demonstration, we'll create some sample opportunities
    return [{
      token: {
        id: 'SOL',
        symbol: 'SOL',
        name: 'Solana',
        price: 100,
        volume24h: 1000000,
        priceChange24h: 2.5,
        lastUpdated: new Date()
      },
      exchanges: [
        { name: 'Raydium', price: 100.5 },
        { name: 'Orca', price: 100.0 }
      ],
      profitPercentage: 0.5,
      estimatedProfit: 50,
      timestamp: new Date()
    }];
  }

  private async storeOpportunity(opp: ArbitrageOpportunity) {
    try {
      await supabase.from('arbitrage_opportunities').insert([{
        token_id: opp.token.id,
        symbol: opp.token.symbol,
        name: opp.token.name,
        exchange_a: opp.exchanges[0].name,
        price_a: opp.exchanges[0].price,
        exchange_b: opp.exchanges[1].name,
        price_b: opp.exchanges[1].price,
        profit_percentage: opp.profitPercentage,
        estimated_profit: opp.estimatedProfit,
        discovered_at: new Date().toISOString()
      }]);
    } catch (error) {
      logger.error('Error storing arbitrage opportunity:', error);
    }
  }
}

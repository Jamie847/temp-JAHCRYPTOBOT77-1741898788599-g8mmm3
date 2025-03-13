import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../logger/index.js';
import { supabase } from '../supabase/index.js';
import { LRUCache } from 'lru-cache';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

interface PumpToken {
  address: string;
  symbol: string;
  name: string;
  initialLiquidity: number;
  currentLiquidity: number;
  raydiumMigrated: boolean;
  liquidityStableTime: Date | null;
  firstSeen: Date;
  lastUpdated: Date;
}

interface PumpMonitorConfig {
  minLiquidityUSD: number;         // Minimum liquidity threshold
  liquidityStabilityPeriod: number; // Time in ms liquidity must stay above threshold
  scanInterval: number;            // Scan interval in ms
  maxTrackedTokens: number;        // Maximum number of tokens to track
}

export class PumpMonitor {
  private config: PumpMonitorConfig;
  private connection: Connection;
  private trackedTokens: Map<string, PumpToken> = new Map();
  private liquidityCache: LRUCache<string, number[]>;
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(connection: Connection, config?: Partial<PumpMonitorConfig>) {
    this.connection = connection;
    this.config = {
      minLiquidityUSD: 100000,        // $100K minimum liquidity
      liquidityStabilityPeriod: 3600000, // 1 hour stability period
      scanInterval: 30000,            // 30 second scan interval
      maxTrackedTokens: 100,          // Track up to 100 tokens
      ...config
    };

    this.liquidityCache = new LRUCache({
      max: this.config.maxTrackedTokens,
      ttl: this.config.liquidityStabilityPeriod
    });
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('Starting Pump.fun monitor with config:', {
      minLiquidity: this.config.minLiquidityUSD,
      stabilityPeriod: this.config.liquidityStabilityPeriod / 3600000 + 'h',
      scanInterval: this.config.scanInterval / 1000 + 's'
    });

    this.monitoringInterval = setInterval(
      () => this.scanPumpTokens(),
      this.config.scanInterval
    );

    // Initial scan
    await this.scanPumpTokens();
  }

  async stop() {
    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Pump.fun monitor stopped');
  }

  private async scanPumpTokens() {
    try {
      // Fetch new tokens from Pump.fun
      const newTokens = await this.fetchPumpTokens();

      for (const token of newTokens) {
        const trackedToken = this.trackedTokens.get(token.address);

        if (!trackedToken) {
          // New token found
          await this.trackNewToken(token);
        } else {
          // Update existing token
          await this.updateTokenStatus(trackedToken);
        }
      }

      // Clean up old tokens
      this.cleanupOldTokens();

      // Store monitoring stats
      await this.storeMonitoringStats();
    } catch (error) {
      logger.error('Error scanning Pump.fun tokens:', error);
    }
  }

  private async trackNewToken(token: PumpToken) {
    try {
      // Check if token exists in Raydium
      const raydiumMigrated = await this.checkRaydiumMigration(token.address);
      
      const newToken: PumpToken = {
        ...token,
        raydiumMigrated,
        liquidityStableTime: null,
        firstSeen: new Date(),
        lastUpdated: new Date()
      };

      this.trackedTokens.set(token.address, newToken);

      // Store initial liquidity reading
      const liquidity = await this.getTokenLiquidity(token.address);
      if (liquidity) {
        this.liquidityCache.set(token.address, [liquidity]);
      }

      logger.info('New Pump.fun token tracked:', {
        address: token.address,
        symbol: token.symbol,
        liquidity,
        raydiumMigrated
      });

      // Store token in database
      await this.storeToken(newToken);
    } catch (error) {
      logger.error('Error tracking new token:', error);
    }
  }

  private async updateTokenStatus(token: PumpToken) {
    try {
      const currentLiquidity = await this.getTokenLiquidity(token.address);
      
      // Update liquidity history
      const liquidityHistory = this.liquidityCache.get(token.address) || [];
      liquidityHistory.push(currentLiquidity);
      this.liquidityCache.set(token.address, liquidityHistory);

      // Check if liquidity has remained stable above threshold
      const isLiquidityStable = this.checkLiquidityStability(liquidityHistory);
      
      // Update Raydium migration status if needed
      if (!token.raydiumMigrated) {
        token.raydiumMigrated = await this.checkRaydiumMigration(token.address);
      }

      // Update stability timestamp if conditions are met
      if (isLiquidityStable && token.raydiumMigrated && !token.liquidityStableTime) {
        token.liquidityStableTime = new Date();
        
        logger.info('Token reached stability criteria:', {
          address: token.address,
          symbol: token.symbol,
          liquidity: currentLiquidity,
          stabilityDuration: this.config.liquidityStabilityPeriod / 3600000 + 'h'
        });
      }

      token.currentLiquidity = currentLiquidity;
      token.lastUpdated = new Date();

      // Update token in database
      await this.updateToken(token);
    } catch (error) {
      logger.error('Error updating token status:', error);
    }
  }

  private async fetchBirdeyeTokens(): Promise<PumpToken[]> {
    try {
      const response = await fetch('https://public-api.birdeye.so/v1/token/list?sort_by=volume&sort_type=desc&offset=0&limit=50', {
        headers: {
          'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }

      const data: any = await response.json();
      const tokens: PumpToken[] = [];

      for (const token of data.data.tokens) {
        if (token.volume24h > 50000) { // $50K min volume
          tokens.push({
            address: token.address,
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            initialLiquidity: token.liquidity,
            currentLiquidity: token.liquidity,
            raydiumMigrated: true, // Assume listed tokens are on Raydium
            liquidityStableTime: new Date(),
            firstSeen: new Date(),
            lastUpdated: new Date()
          });
        }
      }

      logger.info('Fetched Birdeye tokens:', {
        count: tokens.length,
        tokens: tokens.map(t => ({
          symbol: t.symbol,
          liquidity: t.currentLiquidity
        }))
      });

      return tokens;
    } catch (error) {
      logger.error('Error fetching Birdeye tokens:', error);
      return [];
    }
  }

  private async fetchDexscreenerTokens(): Promise<PumpToken[]> {
    try {
      const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/solana', {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Dexscreener API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      // Check if data and pairs exist
      if (!data || !data.pairs) {
        logger.warn('Invalid Dexscreener response format:', { data });
        return [];
      }
      
      const tokens: PumpToken[] = [];

      for (const pair of data.pairs) {
        // Validate pair data before using
        if (pair?.liquidity?.usd > 25000 && pair.baseToken?.address && pair.baseToken?.symbol) {
          tokens.push({
            address: pair.baseToken.address,
            symbol: pair.baseToken.symbol.toUpperCase(),
            name: pair.baseToken.name,
            initialLiquidity: pair.liquidity.usd,
            currentLiquidity: pair.liquidity.usd,
            raydiumMigrated: true, // Assume listed tokens are on Raydium
            liquidityStableTime: new Date(),
            firstSeen: new Date(),
            lastUpdated: new Date()
          });
        }
      }

      logger.info('Fetched Dexscreener tokens:', {
        count: tokens.length,
        tokens: tokens.map(t => ({
          symbol: t.symbol,
          liquidity: t.currentLiquidity
        }))
      });

      return tokens;
    } catch (error) {
      logger.error('Error fetching Dexscreener tokens:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  private async getTokenLiquidity(address: string): Promise<number> {
    try {
      // Try multiple sources for liquidity data
      const [birdeye, dexscreener] = await Promise.allSettled([
        this.getBirdeyeLiquidity(address),
        this.getDexscreenerLiquidity(address)
      ]);

      // Use the highest liquidity value
      const liquidities = [
        birdeye.status === 'fulfilled' ? birdeye.value : 0,
        dexscreener.status === 'fulfilled' ? dexscreener.value : 0
      ];

      return Math.max(...liquidities);
    } catch (error) {
      logger.error('Error getting token liquidity:', error);
      return 0;
    }
  }

  private async getBirdeyeLiquidity(address: string): Promise<number> {
    const response = await fetch(`https://public-api.birdeye.so/v1/token/info?address=${address}`, {
      headers: { 
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return 0;
    const data: any = await response.json();
    return data.data?.liquidity || 0;
  }

  private async getDexscreenerLiquidity(address: string): Promise<number> {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!response.ok) return 0;
    const data: any = await response.json();
    return data.pairs?.[0]?.liquidity?.usd || 0;
  }

  private async checkRaydiumMigration(address: string): Promise<boolean> {
    try {
      // Implement Raydium pool checking logic
      // This is a placeholder - actual implementation would check the Raydium program
      return false;
    } catch (error) {
      logger.error('Error checking Raydium migration:', error);
      return false;
    }
  }

  private checkLiquidityStability(liquidityHistory: number[]): boolean {
    // Check if liquidity has stayed above threshold for required period
    return liquidityHistory.every(l => l >= this.config.minLiquidityUSD);
  }

  private async fetchPumpTokens(): Promise<PumpToken[]> {
    try {
      // Fetch from multiple sources
      const tokens = await Promise.allSettled([
        this.scrapePumpFun(),
        this.fetchCoinGeckoTokens(),
        this.fetchBirdeyeTokens(),
        this.fetchDexscreenerTokens()
      ]);
      
      const allTokens = tokens.reduce((acc, result) => {
        if (result.status === 'fulfilled') {
          acc.push(...result.value);
        }
        return acc;
      }, [] as PumpToken[]);

      logger.info('Fetched tokens:', {
        total: allTokens.length,
        sources: {
          pumpfun: tokens[0].status === 'fulfilled' ? tokens[0].value.length : 0,
          coingecko: tokens[1].status === 'fulfilled' ? tokens[1].value.length : 0,
          birdeye: tokens[2].status === 'fulfilled' ? tokens[2].value.length : 0,
          dexscreener: tokens[3].status === 'fulfilled' ? tokens[3].value.length : 0
        }
      });

      return allTokens;
    } catch (error) {
      logger.error('Error fetching tokens:', error);
      return [];
    }
  }

  private async scrapePumpFun(): Promise<PumpToken[]> {
    try {
      const response = await fetch('https://pump.fun', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Pump.fun: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const tokens: PumpToken[] = [];

      // Updated selectors for Pump.fun's actual HTML structure
      $('.token-row').each((_, row) => {
        const $row = $(row);
        const address = $row.data('address')?.toString() || '';
        const symbol = $row.find('.symbol').text().trim();
        const name = $row.find('.name').text().trim();
        const liquidity = parseFloat($row.find('.liquidity').text().replace(/[$,]/g, ''));

        if (address && symbol && name && !isNaN(liquidity)) {
          tokens.push({
            address,
            symbol,
            name,
            initialLiquidity: liquidity,
            currentLiquidity: liquidity,
            raydiumMigrated: false, // Will be checked later
            liquidityStableTime: null,
            firstSeen: new Date(),
            lastUpdated: new Date()
          });
        }
      });
      
      logger.info('Scraped Pump.fun tokens:', {
        count: tokens.length,
        tokens: tokens.map(t => ({
          symbol: t.symbol,
          liquidity: t.currentLiquidity
        }))
      });

      return tokens;
    } catch (error) {
      logger.error('Error scraping Pump.fun:', error);
      return [];
    }
  }

  private async fetchCoinGeckoTokens(): Promise<PumpToken[]> {
    try {
      // Fetch Solana ecosystem tokens from CoinGecko
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?' + 
        new URLSearchParams({
          vs_currency: 'usd',
          category: 'solana-ecosystem',
          order: 'volume_desc',
          per_page: '50',
          page: '1',
          sparkline: 'false'
        }),
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: any = await response.json();
      const tokens: PumpToken[] = [];

      for (const token of data) {
        if (token.market_cap > 0 && token.total_volume > 100000) { // $100K min volume
          tokens.push({
            address: token.id,
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            initialLiquidity: token.total_volume / 2, // Estimate liquidity as half of volume
            currentLiquidity: token.total_volume / 2,
            raydiumMigrated: true, // Assume listed tokens are on Raydium
            liquidityStableTime: new Date(),
            firstSeen: new Date(),
            lastUpdated: new Date()
          });
        }
      }

      logger.info('Fetched CoinGecko tokens:', {
        count: tokens.length,
        tokens: tokens.map(t => ({
          symbol: t.symbol,
          volume: data.find((d: any) => d.id === t.address)?.total_volume
        }))
      });

      return tokens;
    } catch (error) {
      logger.error('Error fetching CoinGecko tokens:', error);
      return [];
    }
  }

  private cleanupOldTokens() {
    const now = Date.now();
    for (const [address, token] of this.trackedTokens.entries()) {
      // Remove tokens that haven't been updated in 24 hours
      if (now - token.lastUpdated.getTime() > 24 * 60 * 60 * 1000) {
        this.trackedTokens.delete(address);
        this.liquidityCache.delete(address);
      }
    }
  }

  private async storeToken(token: PumpToken) {
    try {
      const { error } = await supabase.from('pump_tokens').upsert([{
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        initial_liquidity: token.initialLiquidity,
        current_liquidity: token.currentLiquidity,
        raydium_migrated: token.raydiumMigrated,
        liquidity_stable_time: token.liquidityStableTime,
        first_seen: token.firstSeen.toISOString(),
        last_updated: token.lastUpdated.toISOString()
      }], {
        onConflict: 'address',
        ignoreDuplicates: false
      });

      if (error) {
        logger.warn('Token already exists, updating:', {
          address: token.address,
          symbol: token.symbol
        });
      }
    } catch (error) {
      logger.error('Error storing token:', error);
    }
  }

  private async updateToken(token: PumpToken) {
    try {
      const { error } = await supabase
        .from('pump_tokens')
        .update({
          current_liquidity: token.currentLiquidity,
          raydium_migrated: token.raydiumMigrated,
          liquidity_stable_time: token.liquidityStableTime?.toISOString(),
          last_updated: token.lastUpdated.toISOString()
        })
        .eq('address', token.address);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Error updating token:', error);
    }
  }

  private async storeMonitoringStats() {
    try {
      const { error } = await supabase.from('pump_monitor_stats').insert([{
        total_tokens: this.trackedTokens.size,
        raydium_migrated: Array.from(this.trackedTokens.values())
          .filter(t => t.raydiumMigrated).length,
        liquidity_stable: Array.from(this.trackedTokens.values())
          .filter(t => t.liquidityStableTime !== null).length,
        timestamp: new Date().toISOString()
      }]);

      if (error) {
        throw error;
      }
    } catch (error) {
      logger.error('Error storing monitoring stats:', error);
    }
  }

  // Public methods to access monitoring data
  async getStableTokens(): Promise<PumpToken[]> {
    return Array.from(this.trackedTokens.values()).filter(token => 
      token.raydiumMigrated && 
      token.liquidityStableTime !== null &&
      token.currentLiquidity >= this.config.minLiquidityUSD
    );
  }

  async getTokenStatus(address: string): Promise<PumpToken | null> {
    return this.trackedTokens.get(address) || null;
  }
}

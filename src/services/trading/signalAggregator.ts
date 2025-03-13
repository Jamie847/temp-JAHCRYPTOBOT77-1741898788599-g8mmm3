import { Connection } from '@solana/web3.js';
import { logger } from '../logger/index.js';
import { supabase } from '../supabase/index.js';
import { TradeSignal } from '../../types/crypto.js';
import { TokenScanner } from './scanning/tokenScanner.js';
import { VolumeAnalyzer } from './monitoring/volumeAnalyzer.js';
import { calculateIndicators } from './technical.js';

interface SignalConfig {
  minLiquidity: number;
  minVolume24h: number;
  volumeSpike: number;
  maxPriceImpact: number;
  scanInterval: number;
  maxTrackedTokens: number;
  confidenceThreshold: number;
  jupiterApiKey: string;
}

interface TokenData {
  symbol: string;
  prices: number[];
  volumes: number[];
  price: number;
}

export class SignalAggregator {
  private tokenScanner: TokenScanner;
  private volumeAnalyzer: VolumeAnalyzer;
  private readonly config: SignalConfig;

  constructor(config: SignalConfig) {
    this.config = config;
    this.tokenScanner = new TokenScanner(
      new Connection(process.env.SOLANA_RPC_ENDPOINT || ''),
      {
        minLiquidity: config.minLiquidity,
        minVolume24h: config.minVolume24h,
        volumeSpike: config.volumeSpike,
        maxPriceImpact: config.maxPriceImpact,
        jupiterApiKey: config.jupiterApiKey
      }
    );
    this.volumeAnalyzer = new VolumeAnalyzer();
  }

  async aggregateSignals(): Promise<TradeSignal[]> {
    try {
      logger.info('Starting signal aggregation');

      const opportunities = await this.tokenScanner.scanForOpportunities();
      const signals: TradeSignal[] = [];

      for (const token of opportunities) {
        try {
          const volumeMetrics = await this.volumeAnalyzer.calculateRVOL(token.symbol);

          if (volumeMetrics.volumeSpikes.oneHour < this.config.volumeSpike) {
            continue;
          }

          const tokenData = await this.getTokenData(token.symbol);
          const indicators = calculateIndicators(tokenData.prices, tokenData.volumes);

          const signalConfidence = this.calculateConfidence({
            volumeMetrics,
            token,
            indicators
          });

          if (signalConfidence >= this.config.confidenceThreshold) {
            signals.push({
              symbol: token.symbol,
              type: 'entry',
              chain: 'solana',
              side: 'long',
              price: token.price,
              confidence: signalConfidence,
              strategy: 'momentum',
              reason: `Volume spike ${volumeMetrics.volumeSpikes.oneHour.toFixed(1)}x with strong momentum`,
              timestamp: new Date(),
              momentum: indicators.tradingSignals.overallSentiment
            });

            logger.info('Generated signal:', {
              symbol: token.symbol,
              confidence: signalConfidence,
              volumeSpike: volumeMetrics.volumeSpikes.oneHour
            });
          }
        } catch (error) {
          logger.error(`Error analyzing token ${token.symbol}:`, error);
        }
      }

      return signals;
    } catch (error) {
      logger.error('Error aggregating signals:', error);
      return [];
    }
  }

  private async getTokenData(symbol: string): Promise<TokenData> {
  try {
    const { data: prices } = await supabase
      .from('token_prices')
      .select('price, volume')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(100);

    return {
      symbol,
      prices: prices?.map((p: any) => p.price) || [],
      volumes: prices?.map((p: any) => p.volume) || [],
      price: prices?.[0]?.price || 0
    };
  } catch (error) {
    logger.error('Error getting token data:', error);
    return {
      symbol,
      prices: [],
      volumes: [],
      price: 0
    };
  }
}

  private calculateConfidence(params: {
    volumeMetrics: any;
    token: any;
    indicators: any;
  }): number {
    const weights = {
      volume: 0.4,
      liquidity: 0.3,
      technical: 0.3
    };

    const volumeScore = Math.min(
      params.volumeMetrics.volumeSpikes.oneHour / this.config.volumeSpike,
      1
    );

    const liquidityScore = Math.min(
      params.token.liquidity / this.config.minLiquidity,
      1
    );

    const technicalScore = params.indicators.tradingSignals.overallSentiment / 100;

    return (
      volumeScore * weights.volume +
      liquidityScore * weights.liquidity +
      technicalScore * weights.technical
    );
  }
}

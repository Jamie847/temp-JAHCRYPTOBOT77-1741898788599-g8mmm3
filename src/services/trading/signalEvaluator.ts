import { TradeSignal } from '../../types/crypto.js';
import { logger } from '../logger/index.js';
import { Storage } from '../storage/index.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { VolumeAnalyzer } from './monitoring/volumeAnalyzer.js';
import { HolderAnalyzer } from './monitoring/holderAnalyzer.js';
import { supabase } from '../supabase/index.js';

export class SignalEvaluator {
  // This class is defined later in signalEvaluator.ts
  // (see updated version below)
}

// ----------------------
// SignalAggregator Class
// ----------------------
export class SignalAggregator {
  private connection: Connection;
  private storage: Storage;
  private volumeAnalyzer: VolumeAnalyzer;
  private holderAnalyzer: HolderAnalyzer;
  private readonly SUPPORTED_STRATEGIES = ['scalp', 'whale', 'social', 'pump', 'momentum', 'trend', 'pattern', 'test'];
  private readonly MAX_SIGNALS_PER_STRATEGY = 3;
  private readonly STRATEGY_WEIGHTS: Record<string, number> = {
    whale: 1.2,    
    scalp: 1.3,    
    pump: 1.2,     
    social: 1.1,   
    momentum: 1.0, 
    test: 0.8,     
    trend: 0.9,    
    pattern: 0.8   
  };

  constructor(connection: Connection) {
    this.connection = connection;
    this.storage = new Storage({
      dataDir: './data/signals',
      backupInterval: 300000 // 5 minutes
    });
    this.volumeAnalyzer = new VolumeAnalyzer();
    this.holderAnalyzer = new HolderAnalyzer();
  }

  async aggregateSignals(): Promise<TradeSignal[]> {
    try {
      // For example purposes, load signals from storage (or other sources)
      const signals: TradeSignal[] = await this.storage.load('incoming_signals') || [];

      // Here, for demonstration, update each signal with a ranked score from supabase query
      // (Assume supabase has been set up to query additional signal data)
      for (const signal of signals) {
        const { data, error } = await supabase
          .from('signal_scores')
          .select('score')
          .eq('symbol', signal.symbol)
          .single();
        if (!error && data) {
          // Add score to signal confidence (example logic)
          signal.confidence = signal.confidence * (data.score || 1);
        }
      }
      return signals;
    } catch (error) {
      logger.error('Error aggregating signals:', error);
      return [];
    }
  }

  async evaluateSignals(signals: TradeSignal[]): Promise<TradeSignal[]> {
    try {
      logger.info('Evaluating signals:', {
        totalSignals: signals.length,
        byStrategy: signals.reduce((acc, s) => {
          acc[s.strategy] = (acc[s.strategy] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      });
      
      // Group signals by strategy
      const groupedSignals = this.groupSignalsByStrategy(signals);
      
      // Filter and rank signals within each strategy
      const filteredSignals = await this.filterAndRankSignals(groupedSignals);

      logger.info('Filtered signals:', {
        beforeCount: signals.length,
        afterCount: Array.from(filteredSignals.values())
          .reduce((sum, arr) => sum + arr.length, 0),
        byStrategy: Object.fromEntries(
          Array.from(filteredSignals.entries())
            .map(([k, v]) => [k, v.length])
        )
      });
      
      // Combine and sort final signals
      return this.combineAndSortSignals(filteredSignals);
    } catch (error) {
      logger.error('Error evaluating signals:', error);
      return [];
    }
  }

  private groupSignalsByStrategy(signals: TradeSignal[]): Map<string, TradeSignal[]> {
    const grouped = new Map<string, TradeSignal[]>();
    for (const signal of signals) {
      const strategy = signal.strategy;
      if (!grouped.has(strategy)) {
        grouped.set(strategy, []);
      }
      grouped.get(strategy)?.push(signal);
    }
    return grouped;
  }

  private async filterAndRankSignals(
    groupedSignals: Map<string, TradeSignal[]>
  ): Promise<Map<string, TradeSignal[]>> {
    logger.info('Filtering signals:', {
      totalSignals: Array.from(groupedSignals.values()).flat().length,
      byStrategy: Object.fromEntries(
        Array.from(groupedSignals.entries()).map(([k, v]) => [k, v.length])
      )
    });

    const filtered = new Map<string, TradeSignal[]>();

    for (const [strategy, signals] of groupedSignals.entries()) {
      // Example: For whale signals, perform special evaluation using supabase queries
      if (strategy === 'whale') {
        const whaleSignals = signals.filter(signal => {
          // Use supabase query or other logic (dummy condition here)
          return signal.confidence > 0.7;
        });
        filtered.set(strategy, whaleSignals);
        continue;
      }

      // Accept all signals above minimum threshold (example logic)
      let validSignals = signals.map(signal => ({
        ...signal,
        confidence: signal.confidence >= 0.10 ? signal.confidence : 0.10
      }));

      // Check for existing positions from storage
      const positions = await this.storage.load('positions') || {};
      const openPositions = new Set(
        Object.values(positions)
          .filter((p: any) => p.status === 'open')
          .map((p: any) => p.symbol)
      );
      validSignals = validSignals.filter(s => !openPositions.has(s.symbol));

      // Sort by a combined score of confidence and momentum (if available)
      validSignals.sort((a, b) => {
        const scoreA = (a.confidence * 0.5) + ((a.momentum || 0) * 0.5);
        const scoreB = (b.confidence * 0.5) + ((b.momentum || 0) * 0.5);
        return scoreB - scoreA;
      });

      const maxSignals = (strategy === 'social' || strategy === 'pump') 
        ? this.MAX_SIGNALS_PER_STRATEGY * 2 
        : this.MAX_SIGNALS_PER_STRATEGY;
      
      filtered.set(strategy, validSignals.slice(0, maxSignals));
    }

    return filtered;
  }

  private combineAndSortSignals(
    filteredSignals: Map<string, TradeSignal[]>
  ): TradeSignal[] {
    const scoredSignals: TradeSignal[] = [];

    for (const [strategy, signals] of filteredSignals.entries()) {
      const weight = this.STRATEGY_WEIGHTS[strategy] || 0.1;
      
      for (const signal of signals) {
        const weightedScore = signal.confidence * weight;
        scoredSignals.push({
          ...signal,
          confidence: weightedScore
        });
      }
    }

    scoredSignals.sort((a, b) => b.confidence - a.confidence);

    return scoredSignals;
  }

  async validateSignal(signal: TradeSignal): Promise<boolean> {
    try {
      const positions = await this.storage.load('positions') || {};
      const hasOpenPosition = Object.values(positions).some(
        (p: any) => p.symbol === signal.symbol && p.status === 'open'
      );

      if (hasOpenPosition) {
        logger.info(`Signal rejected: Position already exists for ${signal.symbol}`);
        return false;
      }

      const signalAge = Date.now() - signal.timestamp.getTime(); 
      if (signalAge > 10 * 60 * 1000) {
        logger.info(`Signal rejected: Signal too old for ${signal.symbol}`);
        return false;
      }

      const storedSignals = (await this.storage.load('trade_signals')) as any[] || [];
      storedSignals.push({
        symbol: signal.symbol,
        // Assuming signal.type exists; if not, remove or adjust accordingly
        type: (signal as any).type || 'unknown',
        side: signal.side,
        confidence: signal.confidence,
        strategy: signal.strategy,
        reason: signal.reason,
        timestamp: signal.timestamp.toISOString(),
        id: Math.random().toString(36).substring(7)
      });
      await this.storage.store('trade_signals', storedSignals);

      return true;
    } catch (error) {
      logger.error('Error validating signal:', error);
      return false;
    }
  }
}

import { Connection, PublicKey } from '@solana/web3.js';
import { JupiterDEX } from './solana/jupiter.js';
import { logger } from '../logger/index.js';
import { OrderResult, OrderParams, SolanaOrderResult } from '../../types/crypto.js';

let jupiterDEX: JupiterDEX | null = null;

interface ExchangeConfig {
  name: string;
  chain: 'solana';
  endpoint?: string;
  privateKey?: Uint8Array;
}

interface ExchangeInitConfig {
  exchanges: ExchangeConfig[];
}

export async function initializeExchanges(config: { exchanges: ExchangeConfig[] }) {
  try {
    for (const exchangeConfig of config.exchanges) {
      try {
        if (exchangeConfig.endpoint) {
          const connection = new Connection(exchangeConfig.endpoint, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
            disableRetryOnRateLimit: false
          });
          
          jupiterDEX = new JupiterDEX(connection);
          await jupiterDEX.initialize();
          logger.info('Initialized Jupiter DEX');
        }
      } catch (error) {
        logger.error('Error initializing exchange:', error);
        return { 
          status: 'failed',
          price: 0 // Add default price when initialization fails
        };
      }
    }
  } catch (error) {
    logger.error('Error initializing exchanges:', error);
    throw error;
  }
}

export async function executeOrder(params: OrderParams): Promise<SolanaOrderResult> {
  try {
    return await executeJupiterOrder(params);
  } catch (error) {
    logger.error('Error executing order:', error);
    throw error;
  }
}

async function executeJupiterOrder(params: OrderParams): Promise<SolanaOrderResult> {
  if (!jupiterDEX) {
    throw new Error('Jupiter DEX not initialized');
  }

  try {
    // Get market price
    const tokenMint = new PublicKey(params.symbol);
    const price = await jupiterDEX.getMarketPrice(
      tokenMint,
      new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') // USDC
    );

    // Execute swap
    const result = await jupiterDEX.swap({
      inputToken: tokenMint,
      outputToken: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
      amount: params.quantity,
      slippage: 1 // 1% slippage
    });

    return {
      signature: result.signature,
      status: result.status,
      price: price,
      timestamp: Date.now()
    };
  } catch (error) {
    logger.error('Error executing Jupiter order:', error);
    throw error;
  }
}

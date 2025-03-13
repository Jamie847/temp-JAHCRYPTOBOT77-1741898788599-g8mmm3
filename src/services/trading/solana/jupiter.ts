import {
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram
} from '@solana/web3.js';
import fetch from 'cross-fetch';
import { PhantomWallet } from '../../wallet/phantom.js';
import { logger } from '../../logger/index.js';
import { supabase } from '../../supabase/index.js';
import { LRUCache } from 'lru-cache';
import WebSocket from 'ws';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';

interface SwapParams {
  inputToken: PublicKey;
  outputToken: PublicKey;
  amount: number;
  slippage: number;
}

interface SwapResult {
  signature: string;
  status: 'success' | 'failed';
  amountOut: number;
  route?: any;
  reason?: string;
}

export class JupiterDEX {
  private connection: Connection;
  private wsConnection: WebSocket | null = null;
  private wallet: PhantomWallet | null = null;
  private tokenAccounts: Map<string, { amount: number; lastUpdate: number }> = new Map();
  private readonly API_ENDPOINTS = {
    QUOTE: 'https://quote-api.jup.ag/v6/quote',
    SWAP: 'https://quote-api.jup.ag/v6/swap',
    PRICE: 'https://quote-api.jup.ag/v6/quote' // Use quote endpoint for price
  };
  private readonly API_KEY = process.env.JUPITER_API_KEY;
  private readonly USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  private readonly COMPUTE_BUDGET = {
    units: 1400000,
    microLamports: 150000,
    priorityFeeMultiplier: 5,
    retryAttempts: 3,
    retryDelay: 1000
  };
  private readonly TRANSACTION_TIMEOUT = 45000; // 45 second timeout
  private readonly QUOTE_TIMEOUT = 8000;          // 8 second quote timeout
  private readonly PRICE_CACHE_TTL = 2000;        // 2 second price cache
  private readonly ERROR_RETRY_DELAY = 2000;      // 2 second retry delay

  private priceCache = new LRUCache<string, { price: number; timestamp: number }>({
    max: 1000,
    ttl: 2000
  });

  private wsSubscriptions = new Map<string, number>();
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  constructor(connection: Connection) {
    this.connection = connection;
    const wsEndpoint = (connection as any)._rpcWebSocket?._wsEndpoint;
    if (wsEndpoint) {
      this.initializeWebSocket(wsEndpoint);
    }
  }

  async initialize(): Promise<void> {
    try {
      const testResponse = await fetch(
        this.API_ENDPOINTS.PRICE,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.API_KEY}`
          },
          signal: AbortSignal.timeout(5000)
        }
      );
      await testResponse.json();
      logger.info('JupiterDEX initialized successfully');
    } catch (error) {
      logger.error('Error initializing JupiterDEX:', error);
      throw error;
    }
  }

  async getMarketPrice(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number = 1e6
  ): Promise<number> {
    try {
      const cacheKey = `${inputMint.toString()}-${outputMint.toString()}`;
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
        return cached.price;
      }
      const response = await fetch(
        `${this.API_ENDPOINTS.PRICE}?inputMint=${inputMint.toString()}&outputMint=${outputMint.toString()}&amount=${amount}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.API_KEY}`
          },
          signal: AbortSignal.timeout(this.QUOTE_TIMEOUT)
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Jupiter API error: ${response.status} - ${errorData.error || response.statusText}`);
      }
      const data = await response.json();
      if (!data.data?.price) {
        throw new Error('Invalid price data received');
      }
      const price = data.data.price;
      this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
      return price;
    } catch (error) {
      logger.error('Error getting market price:', error);
      throw error;
    }
  }

  private async initializeWebSocket(wsEndpoint: string) {
    try {
      this.wsConnection = new WebSocket(wsEndpoint);
      this.wsConnection.onopen = () => {
        logger.info('WebSocket connection established');
        this.reconnectAttempts = 0;
      };
      this.wsConnection.onerror = (error) => {
        logger.error('WebSocket error:', error);
      };
      this.wsConnection.onclose = () => {
        logger.warn('WebSocket connection closed');
        this.handleWebSocketReconnect(wsEndpoint);
      };
      setInterval(() => {
        if (this.wsConnection?.readyState === WebSocket.OPEN) {
          this.wsConnection.ping();
        }
      }, 30000);
    } catch (error) {
      logger.error('Error initializing WebSocket:', error);
    }
  }

  private async handleWebSocketReconnect(wsEndpoint: string) {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max WebSocket reconnection attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    logger.info(`Attempting WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => {
      this.initializeWebSocket(wsEndpoint);
    }, delay);
  }

  setWallet(wallet: PhantomWallet | null): void {
    this.wallet = wallet;
  }

  async getQuote(params: SwapParams): Promise<{
    price: number;
    outAmount: number;
    priceImpactPct: number;
    routePlan: any;
    fees: any;
  }> {
    try {
      const response = await fetch(
        this.API_ENDPOINTS.QUOTE,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.API_KEY}`
          },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            inputMint: params.inputToken.toString(),
            outputMint: params.outputToken.toString(),
            amount: params.amount.toString(),
            slippageBps: Math.floor(params.slippage * 100)
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Jupiter quote error: ${response.status}`);
      }
      const data = await response.json();
      if (!data.price || !data.outAmount || data.outAmount <= 0) {
        throw new Error('Invalid quote data received');
      }
      return {
        price: data.price,
        outAmount: data.outAmount,
        priceImpactPct: data.priceImpactPct,
        routePlan: data.routePlan,
        fees: data.fees,
      };
    } catch (error) {
      logger.error('Error getting quote:', error);
      throw error;
    }
  }

  async swap(params: SwapParams): Promise<SwapResult> {
    if (!this.wallet?.isConnected || !this.wallet.publicKey) {
      throw new Error('Wallet not connected');
    }
    const MAX_PRICE_IMPACT = 3;
    const MAX_RETRIES = 3;
    let attempt = 0;
    try {
      while (attempt < MAX_RETRIES) {
        try {
          const quote = await this.getQuote(params);
          if (quote.priceImpactPct > MAX_PRICE_IMPACT) {
            logger.warn('Trade rejected: High price impact', {
              impact: quote.priceImpactPct,
              maximum: MAX_PRICE_IMPACT
            });
            return { status: 'failed', signature: '', amountOut: 0, reason: 'High price impact' };
          }
          const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: this.COMPUTE_BUDGET.units });
          const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.COMPUTE_BUDGET.microLamports });
          const response = await fetch(this.API_ENDPOINTS.SWAP, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.API_KEY}`
            },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({
              quoteResponse: quote,
              userPublicKey: this.wallet.publicKey.toString(),
              wrapUnwrapSOL: true,
              computeUnitPriceMicroLamports: this.COMPUTE_BUDGET.microLamports,
              asLegacyTransaction: true
            })
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Swap API error: ${response.status} - ${errorData.error || response.statusText}`);
          }
          const swapData = await response.json();
          const swapTransaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));
          swapTransaction.instructions.unshift(modifyComputeUnits, addPriorityFee);
          const signedTransaction = await this.wallet.signTransaction(swapTransaction);
          const signature = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
            skipPreflight: true,
            maxRetries: this.COMPUTE_BUDGET.retryAttempts,
            preflightCommitment: 'confirmed'
          });
          const confirmation = await Promise.race([
            this.connection.confirmTransaction(signature, 'confirmed'),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Transaction confirmation timeout')), this.TRANSACTION_TIMEOUT)
            )
          ]) as { value: { err: any } };
          if (confirmation.value?.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
          }
          return {
            signature,
            status: 'success',
            amountOut: quote.outAmount,
            route: quote.routePlan
          };
        } catch (error) {
          attempt++;
          if (attempt >= MAX_RETRIES) throw error;
          logger.warn(`Swap attempt ${attempt} failed, retrying...`, { error });
          await new Promise(resolve => setTimeout(resolve, this.ERROR_RETRY_DELAY));
        }
      }
      throw new Error('Max retry attempts reached');
    } catch (error) {
      logger.error('Error executing swap:', error);
      throw error;
    }
  }

  async getTokenAccount(mint: PublicKey): Promise<{ amount: number; lastUpdate: number } | null> {
    try {
      const key = mint.toString();
      const cached = this.tokenAccounts.get(key);
      if (cached && Date.now() - cached.lastUpdate < 10000) {
        return cached;
      }
      const owner = this.wallet?.publicKey;
      if (!owner) throw new Error('Wallet not connected');
      const response = await this.connection.getTokenAccountsByOwner(owner, { mint });
      if (response.value.length === 0) return null;
      const parsedData = (response.value[0].account.data as any).parsed;
      const amount = Number(parsedData.info.tokenAmount.amount);
      const tokenAccount = { amount, lastUpdate: Date.now() };
      this.tokenAccounts.set(key, tokenAccount);
      return tokenAccount;
    } catch (error) {
      logger.error('Error getting token account:', error);
      return null;
    }
  }

  async transferToken(
    mint: PublicKey,
    recipient: PublicKey,
    amount: number
  ): Promise<{ status: 'success' | 'failed'; signature?: string }> {
    try {
      if (!this.wallet?.isConnected || !this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }
      const senderATA = await getAssociatedTokenAddress(mint, this.wallet.publicKey);
      const recipientATA = await getAssociatedTokenAddress(mint, recipient);
      const transferInstruction = createTransferInstruction(
        senderATA,
        recipientATA,
        this.wallet.publicKey,
        amount
      );
      const transaction = new Transaction().add(transferInstruction);
      const signature = await this.connection.sendTransaction(transaction, [this.wallet as any]);
      await this.connection.confirmTransaction(signature);
      return { status: 'success', signature };
    } catch (error) {
      logger.error('Error transferring token:', error);
      return { status: 'failed' };
    }
  }

  async cleanup() {
    if (this.wsConnection?.readyState === WebSocket.OPEN) {
      for (const [token, subscriptionId] of this.wsSubscriptions) {
        try {
          const unsubscribeMsg = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'accountUnsubscribe',
            params: [subscriptionId]
          });
          this.wsConnection.send(unsubscribeMsg);
          this.wsSubscriptions.delete(token);
        } catch (error) {
          logger.error(`Error unsubscribing from ${token}:`, error);
        }
      }
      this.wsConnection.close();
    }
  }

  async getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const [address] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return address;
  }

  async getTokenProgramId(): Promise<PublicKey> {
    return new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  }

  async getAssociatedTokenProgramId(): Promise<PublicKey> {
    return ASSOCIATED_TOKEN_PROGRAM_ID;
  }
}

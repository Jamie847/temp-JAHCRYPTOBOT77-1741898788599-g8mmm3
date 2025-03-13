import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { logger } from '../logger/browser.js';

interface PhantomWindow extends Window {
  solana?: {
    isPhantom?: boolean;
    isConnected?: boolean;
    connect(): Promise<{ publicKey: { toString(): string } }>;
    disconnect(): Promise<void>;
    signTransaction<T>(transaction: T): Promise<T>;
    signAllTransactions<T>(transactions: T[]): Promise<T[]>;
  };
}

export class PhantomWallet {
  private readonly _connection: Connection;
  private _publicKey: PublicKey | null = null;
  private readonly isBrowser: boolean = false;

  constructor(connection: Connection) {
    this._connection = connection;
    // Safely detect browser environment
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as unknown as { window?: typeof globalThis };
      this.isBrowser = typeof g.window !== 'undefined' && g.window === globalThis;
    }
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get isConnected(): boolean {
    return this._publicKey !== null;
  }

  private get solana(): PhantomWindow['solana'] | undefined {
    if (this.isBrowser) {
      const g = globalThis as unknown as { window?: PhantomWindow };
      return g.window?.solana;
    }
    return undefined;
  }

  async connect(): Promise<PublicKey> {
    try {
      // For server-side or non-browser environments, return mock public key
      if (!this.isBrowser) {
        this._publicKey = new PublicKey('11111111111111111111111111111111');
        logger.info('Connected to mock wallet:', this._publicKey.toBase58());
        return this._publicKey;
      }

      // Check if Phantom is installed
      if (!this.solana?.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      // Connect to wallet
      const response = await this.solana.connect();
      this._publicKey = new PublicKey(response.publicKey.toString());
      logger.info('Connected to Phantom wallet:', this._publicKey.toBase58());
      return this._publicKey;
    } catch (error) {
      logger.error('Error connecting to wallet:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isBrowser && this.solana?.isConnected) {
        await this.solana.disconnect();
      }
      this._publicKey = null;
      logger.info('Disconnected from wallet');
    } catch (error) {
      logger.error('Error disconnecting from wallet:', error);
      throw error;
    }
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    try {
      if (!this.isConnected) {
        throw new Error('Wallet not connected');
      }

      if (!this.isBrowser) {
        // Return unsigned transaction for non-browser environments
        return transaction;
      }

      if (!this.solana?.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      return await this.solana.signTransaction(transaction);
    } catch (error) {
      logger.error('Error signing transaction:', error);
      throw error;
    }
  }

  async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    try {
      if (!this.isConnected) {
        throw new Error('Wallet not connected');
      }

      if (!this.isBrowser) {
        // Return unsigned transactions for non-browser environments
        return transactions;
      }

      if (!this.solana?.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      return await this.solana.signAllTransactions(transactions);
    } catch (error) {
      logger.error('Error signing transactions:', error);
      throw error;
    }
  }
}
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { logger } from '../logger/index.js';
import bs58 from 'bs58';

export class SolanaWallet {
  private connection: Connection;
  private keypair: Keypair | null = null;
  private _publicKey: PublicKey | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get isInitialized(): boolean {
    return this.keypair !== null;
  }

  async initialize(privateKeyString?: string) {
    try {
      if (privateKeyString) {
        // Additional validation
        if (privateKeyString.length !== 88) {
          throw new Error('Invalid private key length');
        }

        // Initialize from provided private key
        const decodedKey = bs58.decode(privateKeyString);
        if (decodedKey.length !== 64) {
          throw new Error('Invalid decoded private key length');
        }

        this.keypair = Keypair.fromSecretKey(decodedKey);
      } else {
        throw new Error('Private key is required');
      }
      
      this._publicKey = this.keypair.publicKey;
      
      // Log initialization success without exposing details
      logger.info('Solana wallet initialized successfully');

      return this._publicKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error initializing Solana wallet:', errorMessage);
      throw error;
    }
  }

  async getBalance(): Promise<number> {
    if (!this._publicKey) throw new Error('Wallet not initialized');
    
    try {
      const balance = await this.connection.getBalance(this._publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  getPrivateKey(): string | null {
    if (!this.keypair) return null;
    return bs58.encode(this.keypair.secretKey);
  }

  async signTransaction<T>(transaction: T): Promise<T> {
    if (!this.keypair) throw new Error('Wallet not initialized');
    // Sign transaction implementation
    return transaction;
  }
}
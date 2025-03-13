import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaWallet } from '../../wallet/solana.js';
import { logger } from '../../logger/index.js';

export class TradingWallet {
  private wallet: SolanaWallet;
  private readonly USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

  constructor(connection: Connection) {
    this.wallet = new SolanaWallet(connection);
  }

  async initialize() {
    try {
      // Check for existing private key in environment
      const privateKey = process.env.SOLANA_WALLET_PRIVATE_KEY?.trim();
      
      if (privateKey) {
        // Validate private key format
        if (!/^[1-9A-HJ-NP-Za-km-z]{88}$/.test(privateKey)) {
          throw new Error('Invalid Solana wallet private key format');
        }

        await this.wallet.initialize(privateKey);
        logger.info('Trading wallet initialized successfully');
      } else {
        throw new Error('SOLANA_WALLET_PRIVATE_KEY environment variable is required');
      }

      // Get initial balance
      const balance = await this.wallet.getBalance();
      logger.info('Trading wallet balance:', {
        sol: balance,
        publicKey: this.wallet.publicKey?.toBase58(),
        usdcMint: this.USDC_MINT.toBase58()
      });

      return this.wallet.publicKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error initializing trading wallet:', errorMessage);
      throw error;
    }
  }

  get publicKey(): PublicKey | null {
    return this.wallet.publicKey;
  }

  async getBalance(): Promise<number> {
    return this.wallet.getBalance();
  }
}
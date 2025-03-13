import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  ParsedAccountData
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { logger } from './logger.js';

export class SolanaTrading {
  private connection: Connection;
  private wallet: Keypair;

  constructor(endpoint: string, privateKey: Uint8Array) {
    this.connection = new Connection(endpoint, 'confirmed');
    this.wallet = Keypair.fromSecretKey(privateKey);
  }

  async getBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / 10 ** 9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Error getting Solana balance:', error);
      throw error;
    }
  }

  async getTokenBalance(tokenMint: string): Promise<number> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const { address: tokenAccount } = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet as Keypair,
        mintPubkey,
        this.wallet.publicKey
      );

      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      return Number(balance.value.amount) / (10 ** balance.value.decimals);
    } catch (error) {
      logger.error('Error getting token balance:', error);
      throw error;
    }
  }

  async sendSol(recipient: string, amount: number): Promise<string> {
    try {
      const recipientPubkey = new PublicKey(recipient);
      const lamports = Math.floor(amount * 1e9); // Convert SOL to lamports as integer

      const transaction = new Transaction();
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: recipientPubkey,
          lamports
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      return signature;
    } catch (error) {
      logger.error('Error sending SOL:', error);
      throw error;
    }
  }

  async sendToken(
    tokenMint: string,
    recipient: string,
    amount: number
  ): Promise<string> {
    try {
      const mintPubkey = new PublicKey(tokenMint);
      const recipientPubkey = new PublicKey(recipient);

      const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet as Keypair,
        mintPubkey,
        this.wallet.publicKey
      );

      const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet as Keypair,
        mintPubkey,
        recipientPubkey
      );

      const transaction = new Transaction().add(
        createTransferInstruction(
          fromTokenAccount.address, // source
          toTokenAccount.address,   // destination
          this.wallet.publicKey,
          amount,                   // amount as number
          []                       // no additional signers needed
        )
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      return signature;
    } catch (error) {
      logger.error('Error sending token:', error);
      throw error;
    }
  }

  async createTokenAccount(tokenMint: string): Promise<PublicKey> {
    try {
      const tokenPublicKey = new PublicKey(tokenMint);
      const { address: tokenAccount } = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet as Keypair,
        tokenPublicKey,
        this.wallet.publicKey
      );

      return tokenAccount;
    } catch (error) {
      logger.error('Error creating token account:', error);
      throw error;
    }
  }

  async getTokenAccounts(): Promise<Array<{ mint: string; balance: number }>> {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      return accounts.value.map(account => ({
        mint: (account.account.data as ParsedAccountData).parsed.info.mint,
        balance: Number((account.account.data as ParsedAccountData).parsed.info.tokenAmount.amount) / 
          Math.pow(10, (account.account.data as ParsedAccountData).parsed.info.tokenAmount.decimals)
      }));
    } catch (error) {
      logger.error('Error getting token accounts:', error);
      throw error;
    }
  }
}
// Declare window as a global object
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      connect(): Promise<{ publicKey: { toString(): string } }>;
      disconnect(): Promise<void>;
      signTransaction<T>(transaction: T): Promise<T>;
      signAllTransactions<T>(transactions: T[]): Promise<T[]>;
    };
    env?: {
      VITE_SUPABASE_URL: string;
      VITE_SUPABASE_ANON_KEY: string;
      [key: string]: string | undefined;
    };
  }

  // Declare process.env for Node.js environment
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
      SUPABASE_URL?: string;
      SUPABASE_SERVICE_KEY?: string;
      PORT?: string;
      [key: string]: string | undefined;
    }
  }

  interface Window {
    env?: {
      VITE_SUPABASE_URL: string;
      VITE_SUPABASE_ANON_KEY: string;
      [key: string]: string | undefined;
    };
  }
}

// Export empty object to make this a module
export {};
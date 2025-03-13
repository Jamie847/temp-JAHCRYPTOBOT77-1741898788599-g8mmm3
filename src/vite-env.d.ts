/// <reference types="vite/client" />

declare global {
  interface Window {
    env?: {
      NODE_ENV?: 'development' | 'production' | 'test';
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_ANON_KEY?: string;
      VITE_API_URL?: string;
      [key: string]: string | undefined;
    };
  }

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

  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_API_URL?: string;
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly PROD: boolean;
    readonly DEV: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
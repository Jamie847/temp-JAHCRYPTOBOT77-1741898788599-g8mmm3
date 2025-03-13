import { createClient } from '@supabase/supabase-js';
import { logger } from '../logger/browser.js';

// Get Supabase config from Vite environment variables
const getSupabaseConfig = () => {
  // Check for server-side environment variables first
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) return { url, key };
  }

  // Check for browser environment variables
  if (typeof window !== 'undefined' && window.env) {
    const url = window.env.VITE_SUPABASE_URL;
    const key = window.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) return { url, key };
  }

  // Fall back to demo project in development
  logger.warn('Using demo Supabase project. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use your own database.');
  return {
    url: 'https://ckwqtkjvfkzjxsgwrvqf.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3F0a2p2Zmt6anhzZ3dydnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDcwMDIxNDAsImV4cCI6MjAyMjU3ODE0MH0.GjUFywU4DMNxlpfJ6dBfMQJKOZCuXyVNA5J_UyDEQTk'
  };
};

const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();

// Create and export Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-application-name': 'cryptoai-trader'
    }
  }
});

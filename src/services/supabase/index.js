import { createClient } from '@supabase/supabase-js';
import { logger } from '../logger/index.js';

// Default to demo project for development/preview
const DEMO_SUPABASE_URL = 'https://ckwqtkjvfkzjxsgwrvqf.supabase.co';
const DEMO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrd3F0a2p2Zmt6anhzZ3dydnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDcwMDIxNDAsImV4cCI6MjAyMjU3ODE0MH0.GjUFywU4DMNxlpfJ6dBfMQJKOZCuXyVNA5J_UyDEQTk';

// Get environment variables with proper browser/server handling
const getSupabaseConfig = () => {
  // Check for server-side environment variables first
  if (typeof process !== 'undefined' && process.env) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) {
      return { url, key };
    }
  }

  // Check for browser environment variables
  if (typeof window !== 'undefined') {
    const url = window.env?.VITE_SUPABASE_URL;
    const key = window.env?.VITE_SUPABASE_ANON_KEY;
    if (url && key) {
      return { url, key };
    }
  }

  // Fall back to demo project
  logger.warn('Using demo Supabase project. Set SUPABASE_URL and SUPABASE_SERVICE_KEY to use your own database.');
  return {
    url: DEMO_SUPABASE_URL,
    key: DEMO_SUPABASE_KEY
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
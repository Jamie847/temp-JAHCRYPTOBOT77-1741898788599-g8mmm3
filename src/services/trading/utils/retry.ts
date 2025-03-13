import { logger } from '../../logger/index.js';

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  shouldRetry: (error: any) => {
    // Retry on network errors or rate limits
    if (error?.response?.status === 429) return true;
    if (error?.code === 'ECONNRESET') return true;
    if (error?.name === 'AbortError') return true;
    return false;
  }
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: any;
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (!opts.shouldRetry(error) || attempt + 1 >= opts.maxAttempts) {
        throw error;
      }

      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt),
        opts.maxDelay
      );

      logger.warn(`Retry attempt ${attempt + 1} failed, retrying in ${delay}ms:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt: attempt + 1,
        maxAttempts: opts.maxAttempts
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw lastError;
}
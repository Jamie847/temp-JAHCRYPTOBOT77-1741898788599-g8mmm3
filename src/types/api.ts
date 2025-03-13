// External API Response Types
export interface BinanceResponse {
  price: string;
}

export interface CoinbaseResponse {
  data: {
    amount: string;
  };
}

export interface CoinGeckoResponse {
  [key: string]: {
    usd: number;
  };
}

// Helper type guards
export function isBinanceResponse(data: unknown): data is BinanceResponse {
  return typeof data === 'object' && data !== null && 'price' in data && typeof (data as any).price === 'string';
}

export function isCoinbaseResponse(data: unknown): data is CoinbaseResponse {
  return typeof data === 'object' && data !== null && 
         'data' in data && typeof (data as any).data === 'object' &&
         'amount' in (data as any).data && typeof (data as any).data.amount === 'string';
}

export function isCoinGeckoResponse(data: unknown): data is CoinGeckoResponse {
  return typeof data === 'object' && data !== null &&
         Object.values(data as object).every(val => 
           typeof val === 'object' && val !== null && 'usd' in val && typeof val.usd === 'number'
         );
}
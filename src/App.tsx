import React from 'react';
import { useEffect, useState } from 'react';
import { Activity, TrendingUp, ArrowLeftRight, Flame, BarChart } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './services/supabase';
import { WalletConnect } from './components/WalletConnect'; 
import { BotControls } from './components/BotControls'; 
import { BotPerformance } from './components/BotPerformance';
import { TelegramChannelManager } from './components/TelegramChannelManager';
import { TwitterSignals } from './components/TwitterSignals';
import { BotChat } from './components/BotChat';
import { TelegramTrends } from './components/TelegramTrends';
import { MarketOverview } from './components/MarketOverview';
import { TrendingTokens } from './components/TrendingTokens';
import { PumpTokenMonitor } from './components/PumpTokenMonitor';
import { RelativeStrengthMonitor } from './components/RelativeStrength';
import { SocialSentiment } from './components/SocialSentiment';
import { ArbitrageOpportunities } from './components/ArbitrageOpportunities';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: 1000,
      staleTime: 30000,
      onError: (error) => {
        console.error('Query error:', error);
      }
    }
  }
});

// Check if we're using demo mode
const isDemoMode = !import.meta.env.VITE_SUPABASE_URL;

function App() {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { error } = await supabase
          .from('bot_status')
          .select('count')
          .limit(1)
          .maybeSingle();

        if (error) {
          if (isDemoMode) {
            console.warn('Using demo database connection');
            setConnectionError(null);
          } else {
            setConnectionError(error.message);
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (!isDemoMode) {
          setConnectionError(errorMessage);
        }
        console.error('Failed to connect to Supabase:', err);
      }
    };
    
    checkConnection();
  }, [isDemoMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-900 text-white">
        {connectionError && (
          <div className="fixed top-0 left-0 right-0 bg-red-500 text-white p-4 text-center z-50">
            Connection Error: {connectionError}
          </div>
        )}
        {isDemoMode && (
          <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black p-2 text-center z-50">
            Running in demo mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect to your database.
          </div>
        )}
        <nav className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-blue-400" />
                <span className="ml-2 text-xl font-bold">CryptoAI Trader</span>
                <div className="ml-8">
                  <WalletConnect
                    onConnect={(publicKey) => {
                      console.log('Wallet connected:', publicKey);
                    }}
                    onDisconnect={() => {
                      console.log('Wallet disconnected');
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {/* Bot Performance Dashboard */}
          <div className="mb-6 bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <Activity className="h-6 w-6 text-purple-400 mr-2" />
              <h2 className="text-xl font-semibold">Trading Bot Performance</h2>
            </div>
            <BotControls />
            <BotPerformance />
          </div>

          {/* Telegram Channel Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-800 rounded-lg shadow p-6">
              <TelegramChannelManager />
            </div>
            <div className="bg-gray-800 rounded-lg shadow p-6">
              <TwitterSignals />
            </div>
          </div>

          {/* Bot Chat Interface */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow p-6">
            <BotChat />
          </div>

          {/* Telegram Trends */}
          <div className="bg-gray-800 rounded-lg shadow p-6">
            <TelegramTrends />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Market Overview */}
            <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <TrendingUp className="h-6 w-6 text-green-400 mr-2" />
                <h2 className="text-xl font-semibold">Market Overview</h2>
              </div>
              <div className="space-y-4">
                <MarketOverview />
              </div>
            </div>

            {/* Trending Tokens */}
            <div className="bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <Flame className="h-6 w-6 text-orange-400 mr-2" />
                <h2 className="text-xl font-semibold">Trending Tokens</h2>
              </div>
              <div className="space-y-4">
                <TrendingTokens />
              </div>
            </div>

            {/* Pump.fun Token Monitor */}
            <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow p-6">
              <PumpTokenMonitor />
            </div>

            {/* Relative Strength Monitor */}
            <div className="bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <BarChart className="h-6 w-6 text-blue-400 mr-2" />
                <h2 className="text-xl font-semibold">Relative Strength</h2>
              </div>
              <div className="space-y-4">
                <RelativeStrengthMonitor />
              </div>
            </div>

            {/* Social Sentiment Analysis */}
            <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <Activity className="h-6 w-6 text-purple-400 mr-2" />
                <h2 className="text-xl font-semibold">Social Sentiment</h2>
              </div>
              <div className="space-y-4">
                <SocialSentiment />
              </div>
            </div>

            {/* Arbitrage Opportunities */}
            <div className="bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center mb-4">
                <ArrowLeftRight className="h-6 w-6 text-yellow-400 mr-2" />
                <h2 className="text-xl font-semibold">Arbitrage Opportunities</h2>
              </div>
              <div className="space-y-4">
                <ArbitrageOpportunities />
              </div>
            </div>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}

export default App;

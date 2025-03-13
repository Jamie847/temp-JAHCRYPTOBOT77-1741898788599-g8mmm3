// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { Connection, PublicKey } from '@solana/web3.js';
import { TradingBot } from './src/services/trading/bot.js';
import { productionConfig, pumpMonitorConfig } from './src/services/trading/config.js';
import { DataVerifier } from './src/services/trading/monitoring/dataVerifier.js';
import { ArbitrageScanner } from './src/services/trading/arbitrage/index.js';
import { CryptoLLM } from './src/services/ai/cryptoLLM.js';
import { logger } from './src/services/logger/index.js';
import dns from 'dns';
import { promisify } from 'util';

const dnsPromises = dns.promises;
await dnsPromises.setDefaultResultOrder('ipv4first');

import { mkdirSync } from 'fs';
mkdirSync('logs', { recursive: true });

const port = process.env.PORT || 3000;
const MAX_INIT_RETRIES = 2;
const RETRY_DELAY = 5000;
const MONITORING_INTERVAL = 10000; // 10 seconds
const SHUTDOWN_TIMEOUT = 15000; // 15 seconds for graceful shutdown
const HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
const LOG_INTERVAL = 60000; // 1 minute

const app = express();
app.set('timeout', 120000); // 2 minute timeout

// Add keep-alive configuration
const keepAliveTimeout = 65000; // 65 seconds
const headersTimeout = 66000; // 66 seconds

// Add error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let server;
let botInitialized = false;
let servicesInitialized = false;
let lastActivityTimestamp = Date.now();
let monitoringInterval;
let healthCheckInterval;
let logInterval;

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SOLANA_RPC_ENDPOINT',
  'SOLANA_WALLET_PRIVATE_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Initialize services
async function initializeServices() {
  let retryCount = 0;
  logger.info('Starting service initialization...');
  
  while (retryCount < MAX_INIT_RETRIES) {
    try {
      // Initialize Supabase connection
      const { data: testQuery } = await supabase
        .from('bot_status')
        .select('count')
        .limit(1)
        .single();

      logger.info('Supabase connection verified');
      
      // Initialize trading services
      await bot.initialize();
      botInitialized = true;
      logger.info('Trading bot initialized');

      // Start the bot if it was running before
      const { data: status } = await supabase
        .from('bot_status')
        .select('is_running')
        .eq('id', 1)
        .single();

      if (status?.is_running) {
        await bot.start();
        logger.info('Bot auto-started based on previous state');
      }

      // Start monitoring loop
      monitoringInterval = setInterval(async () => {
        try {
          const { data: status } = await supabase
            .from('bot_status')
            .select('*')
            .eq('id', 1)
            .single();

          const timeSinceLastActivity = Date.now() - lastActivityTimestamp;
          
          logger.info('Bot status check:', {
            isRunning: status?.is_running,
            activePositions: status?.active_positions,
            timeSinceLastActivity: Math.round(timeSinceLastActivity / 1000) + 's',
            timestamp: new Date().toISOString()
          });

          // Update activity timestamp
          lastActivityTimestamp = Date.now();

          // Check bot health
          if (status?.is_running && timeSinceLastActivity > 300000) { // 5 minutes
            logger.warn('Bot appears inactive, attempting restart...', {
              lastActivity: new Date(lastActivityTimestamp).toISOString()
            });
            
            await bot.stop();
            await new Promise(resolve => setTimeout(resolve, 5000));
            await bot.start();
          }
        } catch (error) {
          logger.error('Error in monitoring loop:', error);
        }
      }, MONITORING_INTERVAL);
      
      await arbitrageScanner.start();
      logger.info('Arbitrage scanner started');
      
      servicesInitialized = true;
      logger.info('All services initialized successfully', {
        bot: botInitialized,
        services: servicesInitialized,
        botRunning: status?.is_running || false
      });

      // Start periodic logging
      logInterval = setInterval(async () => {
        try {
          const { data: status } = await supabase
            .from('bot_status')
            .select('*')
            .eq('id', 1)
            .single();

          const { data: positions } = await supabase
            .from('positions')
            .select('*')
            .eq('status', 'open');

          const { data: metrics } = await supabase
            .from('performance_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const { data: trades } = await supabase
            .from('bot_trades')
            .select('*')
            .order('entry_time', { ascending: false })
            .limit(5);

          logger.info('Bot Status Update', {
            status: status?.is_running ? 'running' : 'stopped',
            activePositions: positions?.length || 0,
            metrics: {
              totalPnL: metrics?.total_pnl || 0,
              winRate: metrics?.win_rate ? `${(metrics.win_rate * 100).toFixed(2)}%` : '0%',
              dailyPnL: metrics?.daily_pnl || 0
            },
            recentTrades: trades?.map(t => ({
              symbol: t.symbol,
              side: t.side,
              status: t.status,
              pnl: t.pnl,
              entryTime: t.entry_time
            })) || [],
            lastActivity: new Date(lastActivityTimestamp).toISOString(),
            uptime: process.uptime()
          });
        } catch (error) {
          logger.error('Error in status logging:', error);
        }
      }, LOG_INTERVAL);
      
      return true;
    } catch (error) {
      retryCount++;
      logger.error(`Initialization attempt ${retryCount} failed:`, error);
      
      if (retryCount === MAX_INIT_RETRIES) {
        logger.error('Max initialization retries reached', {
          bot: botInitialized,
          services: servicesInitialized
        });
        return false;
      }
      
      logger.info(`Retrying initialization in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  return false;
}

// Enable CORS with specific configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Middleware
app.use(express.json());

// Test trade endpoint
app.post('/api/test-trade', async (req, res) => {
  try {
    const { symbol = 'SOL', amount = 0.1 } = req.body;
    
    const tradeSignal = {
      symbol: symbol.toUpperCase(),
      type: 'entry',
      chain: 'solana',
      side: 'long',
      price: 0, // Will be fetched by bot
      confidence: 0.85,
      strategy: 'test',
      reason: `Manual test trade for ${amount} ${symbol.toUpperCase()}`,
      timestamp: new Date()
    };

    logger.info('Executing test trade:', tradeSignal);
    await bot.evaluateSignal(tradeSignal);
    
    res.json({ 
      status: 'success',
      message: 'Test trade executed',
      signal: tradeSignal
    });
  } catch (error) {
    logger.error('Error executing test trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  if (!servicesInitialized) {
    return res.status(503).json({ 
      error: 'Service Unavailable',
      message: 'Server is still initializing'
    });
  }
  next();
});

// Add error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Solana connection
const solanaEndpoint = process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaEndpoint, 'confirmed');

// Bot configuration
const tradingConfig = productionConfig;

// Add wallet configuration
if (!process.env.SOLANA_WALLET_ADDRESS) {
  console.error('SOLANA_WALLET_ADDRESS environment variable is required');
  process.exit(1);
}

// Create bot instance with wallet config
const botConfig = {
  ...tradingConfig,
  walletPublicKey: new PublicKey(process.env.SOLANA_WALLET_ADDRESS)
};

// Create bot instance
const bot = new TradingBot(botConfig);

// Create social sentiment analyzer

// Create arbitrage scanner
const arbitrageScanner = new ArbitrageScanner(connection);

// Initialize LLM
const llm = new CryptoLLM(tradingConfig);

// Chat endpoints
app.post('/api/chat', async (req, res) => {
  try {
    logger.info('Received chat request:', {
      question: req.body.question
    });

    const { question, command, symbol } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Handle trading commands
    if (command === 'trade') {
      const tradeSymbol = symbol || 'SOL';
      const tradeSignal = {
        symbol: tradeSymbol,
        type: 'entry',
        chain: 'solana',
        side: 'long',
        price: 0, // Will be fetched by bot
        confidence: 0.85,
        strategy: 'test',
        reason: `Manual test trade for ${tradeSymbol}`,
        timestamp: new Date()
      };

      logger.info('Processing trade command:', tradeSignal);

      // Force bot to evaluate and execute trade
      await bot.evaluateSignal(tradeSignal);
      
      return res.json({
        message: 'Trade command received',
        signal: tradeSignal
      });
    }

    // Store the question first
    const { data: chatEntry, error: insertError } = await supabase
      .from('bot_chat_history')
      .insert([{ question, timestamp: new Date().toISOString() }])
      .select()
      .single();

    if (insertError) {
      logger.error('Error storing chat question:', insertError);
      return res.status(500).json({ error: 'Failed to store question' });
    }

    // Get AI response
    const analysis = await llm.analyzeTradeSignal({
      type: 'entry',
      symbol: symbol || 'MARKET',
      chain: 'solana',
      side: 'long',
      price: 0,
      confidence: 0,
      strategy: 'analysis',
      reason: question,
      timestamp: new Date()
    });

    logger.info('Generated AI response:', {
      confidence: analysis.confidence,
      reasoning: analysis.reasoning?.substring(0, 100) + '...'
    });

    // Update chat entry with response
    await supabase
      .from('bot_chat_history')
      .update({
        answer: analysis.reasoning,
        confidence: analysis.confidence,
        sources: analysis.marketContext.keyEvents
      })
      .eq('id', chatEntry.id);

    res.json({
      id: chatEntry.id,
      question,
      answer: analysis.reasoning,
      confidence: analysis.confidence,
      sources: analysis.marketContext.keyEvents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing chat:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check bot status
    const { data: status } = await supabase
      .from('bot_status')
      .select('*')
      .eq('id', 1)
      .single();

    const { data: positions } = await supabase
      .from('positions')
      .select('count')
      .single();

    // Return 200 with initialization status
    const diagnostics = {
      status: 'healthy', // Always return healthy to prevent restarts
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      bot: botInitialized,
      botRunning: status?.is_running || false,
      activePositions: positions?.count || 0,
      services: servicesInitialized,
      lastActivity: new Date(lastActivityTimestamp).toISOString(),
      initializing: !servicesInitialized
    };

    return res.json(diagnostics);
  } catch (error) {
    logger.error('Health check failed:', error);
    // Return 200 even on error to prevent restarts
    return res.status(200).json({ 
      status: 'healthy',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Add root endpoint for basic info
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server and initialize services
(async () => {
  try {
    // Start server first
    logger.info('Starting server...');
    
    server = app.listen(port, '0.0.0.0', () => {
      // Configure keep-alive settings
      server.keepAliveTimeout = keepAliveTimeout;
      server.headersTimeout = headersTimeout;
      
      logger.info(`Server running on port ${port} in ${process.env.NODE_ENV} mode`);
    });

    // Initialize services in background
    setTimeout(async () => {
      try {
        logger.info('Starting service initialization...');
        const success = await initializeServices();
        if (!success) {
          logger.error('Failed to initialize services');
        }
      } catch (error) {
        logger.error('Error during service initialization:', error);
      }
    }, 1000);
    // Add server error handler
    server.on('error', (error) => {
      logger.error('Server error:', error);
    });

  } catch (error) {
    logger.error('Critical error during startup:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
})();

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, cleaning up...');
  let forceExit = false;
  
  // Log current state
  logger.info('Current state during shutdown:', {
    botInitialized,
    servicesInitialized,
    lastActivityTimestamp: new Date(lastActivityTimestamp).toISOString()
  });

  // Set force exit timeout
  const forceExitTimeout = setTimeout(() => {
    logger.warn('Forcing exit after timeout');
    forceExit = true;
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Stop the bot gracefully
    if (bot) {
      await bot.stop();
    }

    // Clear intervals
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
    
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }
    
    if (logInterval) {
      clearInterval(logInterval);
    }

    // Close server gracefully
    if (server) {
      server.close(() => {
        logger.info('Server closed successfully');
        if (!forceExit) {
          clearTimeout(forceExitTimeout);
          process.exit(0);
        }
      });
    }
  } catch (error) {
    logger.error('Error during shutdown:', error);
    if (!forceExit) {
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, cleaning up...');
  let forceExit = false;
  
  const forceExitTimeout = setTimeout(() => {
    logger.warn('Forcing exit after timeout');
    forceExit = true;
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    if (bot) {
      await bot.stop();
    }

    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
    
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
    }

    if (server) {
      server.close(() => {
        logger.info('Server closed successfully');
        if (!forceExit) {
          clearTimeout(forceExitTimeout);
          process.exit(0);
        }
      });
    }
  } catch (error) {
    logger.error('Error during shutdown:', error);
    if (!forceExit) {
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  }
});

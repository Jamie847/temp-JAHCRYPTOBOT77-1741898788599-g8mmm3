import { logger as browserLogger } from './browser.js';
import * as winston from 'winston';
import type { Logger } from 'winston';
import { format } from 'winston';

// Create Node.js logger
function createNodeLogger(): Logger {
  const LOG_DIR = './logs';
  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };
  const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
  };
  winston.addColors(colors);
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    winston.format.json(),
    winston.format.printf(
      (info) => {
        const metadata = info.metadata && Object.keys(info.metadata).length
          ? `\n${JSON.stringify(info.metadata, null, 2)}`
          : '';
        return `${info.timestamp} ${info.level}: ${info.message}${metadata}`;
      }
    )
  );
  return winston.createLogger({
    levels,
    format: logFormat,
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          logFormat
        ),
      }),
      new winston.transports.File({
        filename: `${LOG_DIR}/combined.log`,
        format: winston.format.combine(
          winston.format.uncolorize(),
          logFormat
        ),
      }),
      new winston.transports.File({
        filename: `${LOG_DIR}/error.log`,
        level: 'error',
        format: winston.format.combine(
          winston.format.uncolorize(),
          logFormat
        ),
      }),
      new winston.transports.File({
        filename: `${LOG_DIR}/trades.log`,
        format: logFormat,
        level: 'info'
      })
    ],
  });
}

// Determine if we're in a browser environment and export the appropriate logger
export const logger: Logger = typeof window !== 'undefined' ? browserLogger : createNodeLogger();

// Export stream for Express/Morgan middleware
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// Export custom logging methods for specialized use cases
export const customLogger = {
  logTrade: (trade: any) => {
    logger.info('Trade executed', { 
      symbol: trade.symbol,
      side: trade.side,
      price: trade.price,
      quantity: trade.quantity,
      timestamp: new Date().toISOString()
    });
  },
  
  logPosition: (position: any) => {
    logger.info('Position update', {
      id: position.id,
      symbol: position.symbol,
      status: position.status,
      pnl: position.pnl,
      timestamp: new Date().toISOString()
    });
  },
  
  logError: (error: Error, context?: any) => {
    logger.error('Error occurred', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }
};

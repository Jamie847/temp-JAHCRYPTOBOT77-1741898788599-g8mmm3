import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Create format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create the logger
const logger = winston.createLogger({
  levels,
  format,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
    // Write all errors to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
  ],
});

// Add request context if needed
const addRequestContext = (info: any) => {
  const requestId = Math.random().toString(36).substring(7);
  return { ...info, requestId };
};

// Create a stream for Morgan (if using Express)
const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Export the logger instance
export { logger, stream };

// Development vs Production settings
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

// Add custom logging methods if needed
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
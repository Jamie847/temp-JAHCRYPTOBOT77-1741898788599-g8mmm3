import winston from 'winston';

// Create Node.js logger
function createNodeLogger() {
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

  const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  );

  const nodeLogger = winston.createLogger({
    levels,
    format,
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
      new winston.transports.File({
        filename: `${LOG_DIR}/combined.log`,
        format: winston.format.combine(
          winston.format.uncolorize(),
          winston.format.json()
        ),
      }),
      new winston.transports.File({
        filename: `${LOG_DIR}/error.log`,
        level: 'error',
        format: winston.format.combine(
          winston.format.uncolorize(),
          winston.format.json()
        ),
      }),
    ],
  });

  if (process.env.NODE_ENV !== 'production') {
    nodeLogger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }));
  }

  return nodeLogger;
}

export const logger = createNodeLogger();
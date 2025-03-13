import type { Logger } from 'winston';
import type { LeveledLogMethod, LogMethod } from 'winston';

// Browser-safe logger implementation
const ENV =
  typeof process !== 'undefined' && process.env.NODE_ENV
    ? process.env.NODE_ENV
    : typeof window !== 'undefined' && window.env?.NODE_ENV
    ? window.env.NODE_ENV
    : 'production';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof logLevels;

interface Profiler {
  logger: Logger;
  start: number;
  done: (result?: any) => boolean;
}

interface ExceptionHandlerInstance {
  handlers: Map<any, any>;
  getProcessInfo: () => any;
  getOsInfo: () => any;
  getTrace: (err: Error) => any;
  handle: () => Logger;
  unhandle: () => Logger;
  catcher: () => void;
  getAllInfo: () => Record<string, any>;
  logger: Logger;
}

class BrowserLogger implements Partial<Logger> {
  public level: LogLevel = 'info';

  constructor() {
    // Set log level based on environment
    this.level = ENV === 'development' ? 'debug' : 'info';
  }

  error(message: any, ...args: any[]): Logger {
    if (logLevels[this.level] >= logLevels.error) {
      console.error(`%c[ERROR] ${message}`, 'color: #f56565', ...args);
    }
    return this as unknown as Logger;
  }

  warn(message: any, ...args: any[]): Logger {
    if (logLevels[this.level] >= logLevels.warn) {
      console.warn(`%c[WARN] ${message}`, 'color: #ed8936', ...args);
    }
    return this as unknown as Logger;
  }

  info(message: any, ...args: any[]): Logger {
    if (logLevels[this.level] >= logLevels.info) {
      console.info(`%c[INFO] ${message}`, 'color: #4299e1', ...args);
    }
    return this as unknown as Logger;
  }

  debug: LeveledLogMethod = (message: any, ...args: any[]): Logger => {
    if (logLevels[this.level] >= logLevels.debug) {
      console.debug(`%c[DEBUG] ${message.toString()}`, 'color: #9f7aea', ...args);
    }
    return this as unknown as Logger;
  };

  // Overload signatures for log:
  log(info: any): Logger;
  log(level: string, message: any, ...meta: any[]): Logger;
  log(levelOrInfo: any, message?: any, ...meta: any[]): Logger {
    if (
      typeof levelOrInfo === 'object' &&
      levelOrInfo !== null &&
      levelOrInfo.level
    ) {
      const { level, message: msg, ...rest } = levelOrInfo;
      return this.log(level, msg, rest);
    } else {
      const level = levelOrInfo;
      const msg = message;
      switch (level) {
        case 'error':
          return this.error(msg, ...meta);
        case 'warn':
          return this.warn(msg, ...meta);
        case 'info':
          return this.info(msg, ...meta);
        case 'debug':
          return this.debug(msg, ...meta);
        default:
          return this.info(msg, ...meta);
      }
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  add(): Logger {
    return this as unknown as Logger;
  }

  remove(): Logger {
    return this as unknown as Logger;
  }

  close(): Logger {
    return this as unknown as Logger;
  }

  profile(id: string, meta?: Record<string, any>): Logger {
    return this as unknown as Logger;
  }

  startTimer(): Profiler {
    const start = Date.now();
    return {
      logger: this as unknown as Logger,
      start,
      done: (_result?: any) => {
        // In a real implementation, you might log the elapsed time.
        return true;
      },
    };
  }

  clear(): Logger {
    return this as unknown as Logger;
  }

  pause(): Logger {
    return this as unknown as Logger;
  }

  resume(): Logger {
    return this as unknown as Logger;
  }

  end(): Logger {
    return this as unknown as Logger;
  }

  exceptions: ExceptionHandlerInstance = {
    handlers: new Map(),
    getProcessInfo: () => ({}),
    getOsInfo: () => ({}),
    getTrace: () => ({}),
    handle: () => this as unknown as Logger,
    unhandle: () => this as unknown as Logger,
    catcher: () => {},
    getAllInfo: () => ({}),
    logger: this as unknown as Logger,
  };

  rejections: ExceptionHandlerInstance = {
    handlers: new Map(),
    getProcessInfo: () => ({}),
    getOsInfo: () => ({}),
    getTrace: () => ({}),
    handle: () => this as unknown as Logger,
    unhandle: () => this as unknown as Logger,
    catcher: () => {},
    getAllInfo: () => ({}),
    logger: this as unknown as Logger,
  };

  configure() {
    return this as unknown as Logger;
  }

  child() {
    return this as unknown as Logger;
  }

  format = undefined;
  defaultMeta = null;

  query() {
    return Promise.resolve({});
  }

  // Return a dummy NodeJS.ReadableStream to satisfy Winston's interface.
  stream(options?: any): NodeJS.ReadableStream {
    return {
      on: () => this,
      pipe: () => this,
      read: () => null,
      setEncoding: () => this,
      pause: () => this,
      resume: () => this,
    } as unknown as NodeJS.ReadableStream;
  }

  silent = false;
  levels = logLevels;
  exitOnError = false;
}

// Export singleton instance
export const logger = new BrowserLogger() as unknown as Logger;

import fs from 'fs';
import path from 'path';
import { logger } from '../logger/index.js';

interface StorageConfig {
  dataDir: string;
  backupInterval: number;
}

export class Storage {
  private config: StorageConfig;
  private backupTimer: NodeJS.Timeout | null = null;

  constructor(config: StorageConfig) {
    this.config = config;
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
    }
  }

  async store(key: string, data: any): Promise<void> {
    try {
      const filePath = path.join(this.config.dataDir, `${key}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`Error storing data for key ${key}:`, error);
      throw error;
    }
  }

  async load<T>(key: string): Promise<T | null> {
    try {
      const filePath = path.join(this.config.dataDir, `${key}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error(`Error loading data for key ${key}:`, error);
      return null;
    }
  }

  async backup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.config.dataDir, 'backups', timestamp);
      await fs.promises.mkdir(backupDir, { recursive: true });

      const files = await fs.promises.readdir(this.config.dataDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.promises.copyFile(
            path.join(this.config.dataDir, file),
            path.join(backupDir, file)
          );
        }
      }
      logger.info('Backup completed:', { timestamp });
    } catch (error) {
      logger.error('Error creating backup:', error);
    }
  }

  startBackups(): void {
    if (this.backupTimer) return;
    this.backupTimer = setInterval(() => {
      this.backup();
    }, this.config.backupInterval);
  }

  stopBackups(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }
}

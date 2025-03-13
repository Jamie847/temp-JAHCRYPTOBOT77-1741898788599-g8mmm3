import { Connection, ConnectionConfig } from '@solana/web3.js';
import { logger } from '../../logger/index.js';
import { withRetry } from './retry.js';

interface RPCEndpoint {
  url: string;
  weight: number;
  isWss?: boolean;
  status: 'active' | 'failed';
  lastFailure?: number;
  latency?: number;
}

export class RPCManager {
  private endpoints: RPCEndpoint[];
  private currentEndpoint: number = 0;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly FAILURE_COOLDOWN = 300000; // 5 minutes
  private readonly MAX_LATENCY = 2000; // 2 seconds
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(endpoints: { url: string; weight: number; isWss?: boolean }[]) {
    this.endpoints = endpoints.map(e => ({
      ...e,
      status: 'active'
    }));
    this.startHealthChecks();
  }

  async getConnection(): Promise<Connection> {
    const endpoint = await this.getBestEndpoint();
    
    const config: ConnectionConfig = {
      commitment: 'confirmed'
    };

    // Add WebSocket configuration if available
    if (endpoint.isWss) {
      // WebSocket configuration is handled by the Connection constructor
      const wsUrl = endpoint.url.replace('https://', 'wss://');
      return new Connection(wsUrl, config);
    }

    return new Connection(endpoint.url, config);
  }

  private async getBestEndpoint(): Promise<RPCEndpoint> {
    // Filter out failed endpoints still in cooldown
    const availableEndpoints = this.endpoints.filter(e => {
      if (e.status === 'failed' && e.lastFailure) {
        return Date.now() - e.lastFailure > this.FAILURE_COOLDOWN;
      }
      return e.status === 'active';
    });

    if (availableEndpoints.length === 0) {
      throw new Error('No healthy RPC endpoints available');
    }

    // Sort by weight and latency
    return availableEndpoints.sort((a, b) => {
      const scoreA = (a.weight || 1) * (1000 / (a.latency || 1000));
      const scoreB = (b.weight || 1) * (1000 / (b.latency || 1000));
      return scoreB - scoreA;
    })[0];
  }

  private async checkEndpointHealth(endpoint: RPCEndpoint) {
    try {
      const connection = new Connection(endpoint.url);
      const start = Date.now();
      await connection.getRecentBlockhash();
      endpoint.latency = Date.now() - start;
      
      if (endpoint.latency > this.MAX_LATENCY) {
        logger.warn(`High latency on endpoint ${endpoint.url}: ${endpoint.latency}ms`);
      }

      endpoint.status = 'active';
      delete endpoint.lastFailure;
    } catch (error) {
      logger.error(`RPC endpoint ${endpoint.url} health check failed:`, error);
      endpoint.status = 'failed';
      endpoint.lastFailure = Date.now();
    }
  }

  private startHealthChecks() {
    this.healthCheckTimer = setInterval(async () => {
      await Promise.all(
        this.endpoints.map(endpoint => this.checkEndpointHealth(endpoint))
      );
      
      const healthyEndpoints = this.endpoints.filter(e => e.status === 'active');
      logger.info('RPC health check completed', {
        total: this.endpoints.length,
        healthy: healthyEndpoints.length,
        endpoints: this.endpoints.map(e => ({
          url: e.url,
          status: e.status,
          latency: e.latency
        }))
      });
    }, this.HEALTH_CHECK_INTERVAL);
  }

  cleanup() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}
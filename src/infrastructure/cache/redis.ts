import Redis from 'ioredis';
import { logger } from '../../utils/logger';

export class RedisService {
  private client: Redis;
  private isConnected = false;
  private readonly keyPrefix = 'payment_api:';

  get connected(): boolean {
    return this.isConnected;
  }

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis connection error', { error: error.message });
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async setExchangeRate(from: string, to: string, rate: number, ttl: number = 300): Promise<void> {
    const key = this.getKey(`exchange_rate:${from}_${to}`);
    const data = JSON.stringify({
      rate,
      timestamp: new Date().toISOString(),
      from,
      to
    });

    try {
      await this.client.setex(key, ttl, data);
      logger.debug('Exchange rate cached', { from, to, rate, ttl });
    } catch (error) {
      logger.error('Failed to cache exchange rate', { from, to, error });
    }
  }

  async getExchangeRate(from: string, to: string): Promise<{
    rate: number;
    timestamp: string;
  } | null> {
    const key = this.getKey(`exchange_rate:${from}_${to}`);

    try {
      const data = await this.client.get(key);
      if (!data) return null;

      const parsed = JSON.parse(data);
      return parsed;
    } catch (error) {
      logger.error('Failed to get cached exchange rate', { from, to, error });
      return null;
    }
  }

  async setIdempotencyKey(key: string, paymentId: string, ttl: number = 86400): Promise<void> {
    const redisKey = this.getKey(`idempotency:${key}`);
    const data = JSON.stringify({
      paymentId,
      timestamp: new Date().toISOString()
    });

    try {
      await this.client.setex(redisKey, ttl, data);
    } catch (error) {
      logger.error('Failed to store idempotency key', { key, error });
    }
  }

  async getIdempotencyKey(key: string): Promise<{ paymentId: string } | null> {
    const redisKey = this.getKey(`idempotency:${key}`);

    try {
      const data = await this.client.get(redisKey);
      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to get idempotency key', { key, error });
      return null;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
  }> {
    const startTime = Date.now();

    try {
      await this.client.ping();
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime
      };
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis disconnected gracefully');
    } catch (error) {
      logger.error('Error during Redis disconnection', { error });
    }
  }
}

export const redis = new RedisService();
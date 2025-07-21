import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';

declare global {
  var __prisma: PrismaClient | undefined;
}

interface QueryEvent {
  timestamp: Date;
  query: string;
  params: string;
  duration: number;
  target: string;
}

interface LogEvent {
  timestamp: Date;
  message: string;
  target: string;
}

const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'info', emit: 'event' },
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

// Add Prisma event listeners for better logging
prisma.$on('query', (e: QueryEvent) => {
  logger.debug('Prisma Query', {
    query: e.query,
    params: e.params,
    duration: e.duration,
    timestamp: e.timestamp
  });
});

prisma.$on('error', (e: LogEvent) => {
  logger.error('Prisma Error', {
    message: e.message,
    target: e.target,
    timestamp: e.timestamp
  });
});

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private isConnected = false;
  private connectionAttempts = 0;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.debug('Database already connected');
      return;
    }

    while (this.connectionAttempts < this.maxRetries) {
      try {
        await prisma.$connect();
        this.isConnected = true;
        this.connectionAttempts = 0; // Reset attempts on successful connection
        logger.info('Database connected successfully', {
          attempt: this.connectionAttempts + 1,
          maxRetries: this.maxRetries
        });
        return;
      } catch (error) {
        this.connectionAttempts++;
        logger.error('Failed to connect to database', {
          attempt: this.connectionAttempts,
          maxRetries: this.maxRetries,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined
        });

        if (this.connectionAttempts < this.maxRetries) {
          logger.info('Retrying database connection', {
            nextAttempt: this.connectionAttempts + 1,
            delayMs: this.retryDelay
          });
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    throw new Error(`Failed to connect to database after ${this.maxRetries} attempts`);
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      logger.debug('Database already disconnected');
      return;
    }

    try {
      await prisma.$disconnect();
      this.isConnected = false;
      logger.info('Database disconnected gracefully');
    } catch (error) {
      logger.error('Error during database disconnection', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
    connectionStatus: boolean;
  }> {
    const startTime = Date.now();

    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        connectionStatus: this.isConnected
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : error,
        responseTime,
        connectionStatus: this.isConnected
      });

      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionStatus: this.isConnected
      };
    }
  }

  get client() {
    if (!this.isConnected) {
      logger.warn('Attempting to use database client while disconnected');
    }
    return prisma;
  }

  get isConnectedToDB() {
    return this.isConnected;
  }
}

export const db = DatabaseService.getInstance();
export { prisma };
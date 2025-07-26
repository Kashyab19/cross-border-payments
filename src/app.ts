import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

import { db } from './infrastructure/database/prisma';
import { redis } from './infrastructure/cache/redis';
import { logger } from './infrastructure/logger';

import paymentRoutes from './presentation/routes/payments';
import adminRoutes from './presentation/routes/admin';
import webhookRoutes from './presentation/routes/webhook';

const app = express();
const port = process.env.PORT || 3000;
const apiVersion = process.env.API_VERSION || 'v1';

// Load Swagger document
const swaggerDocument = YAML.load(path.join(__dirname, '../swagger.yaml'));

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use(`/api/${apiVersion}`, paymentRoutes);  // This handles /payments and /quote
app.use(`/admin`, adminRoutes);                // Admin routes at /admin
app.use(`/webhooks`, webhookRoutes);           // Webhook routes at /webhooks

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const redisHealth = await redis.healthCheck();

    res.json({
      status: dbHealth.status === 'healthy' && redisHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      checks: {
        database: dbHealth,
        redis: redisHealth
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await db.connect();
    
    // Connect to Redis
    await redis.connect();

    app.listen(port, () => {
      logger.info('🚀 Payment API server running', {
        port,
        environment: process.env.NODE_ENV,
        version: apiVersion,
        database: db.isConnectedToDB ? 'connected' : 'disconnected',
        redis: redis.connected ? 'connected' : 'disconnected'
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
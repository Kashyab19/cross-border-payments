import express from 'express';
import { PaymentProcessor } from '../services/PaymentProcessor';
import { prisma } from '../infrastructure/database/prisma';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

interface PaymentWithRelations {
  id: string;
  status: string;
  sourceAmount: number;
  sourceCurrency: string;
  createdAt: Date;
  events: Array<{
    eventType: string;
  }>;
}

interface PaymentEvent {
  createdAt: Date;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  source: string | null;
  data: any;
}

interface Fee {
  amount: number;
}

const router = express.Router();
const paymentProcessor = new PaymentProcessor();

// POST /admin/payments/:id/process - Manually trigger payment processing
router.post('/payments/:id/process', async (req: express.Request, res: express.Response) => {
  const paymentId = req.params.id;

  try {
    if (!paymentId || paymentId.length !== 36) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Payment ID',
        message: 'Payment ID must be a valid UUID',
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Manual payment processing triggered', { 
      paymentId,
      triggeredBy: 'admin_api'
    });

    // Process payment asynchronously but return result
    const result = await paymentProcessor.processPayment(paymentId);

    const response: ApiResponse = {
      success: result.success,
      data: {
        paymentId: result.paymentId,
        finalStatus: result.status,
        processingTime: result.processingTime,
        steps: result.steps,
        summary: {
          totalSteps: result.steps.length,
          completedSteps: result.steps.filter(s => s.status === 'completed').length,
          failedSteps: result.steps.filter(s => s.status === 'failed').length,
          totalDuration: result.processingTime
        }
      },
      message: result.success 
        ? 'Payment processed successfully'
        : `Payment processing failed: ${result.error}`,
      timestamp: new Date().toISOString()
    };

    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(response);

  } catch (error) {
    logger.error('Payment processing error', { 
      paymentId, 
      error: error instanceof Error ? error.message : error 
    });

    const response: ApiResponse = {
      success: false,
      error: 'Processing Failed',
      message: error instanceof Error ? error.message : 'Payment processing failed',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

// GET /admin/payments - Get all payments with detailed status
router.get('/payments', async (req: express.Request, res: express.Response) => {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        fees: true,
        transactions: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5 // Latest 5 events per payment
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 most recent payments
    });

    const response: ApiResponse = {
      success: true,
      data: {
        payments,
        count: payments.length,
        summary: {
          byStatus: await getPaymentStatusSummary(),
          recentActivity: payments.slice(0, 10).map((payment: PaymentWithRelations) => ({
            id: payment.id,
            status: payment.status,
            amount: payment.sourceAmount,
            currency: payment.sourceCurrency,
            createdAt: payment.createdAt,
            lastEvent: payment.events[0]?.eventType
          }))
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to get admin payments', { error });

    const response: ApiResponse = {
      success: false,
      error: 'Database Error',
      message: 'Unable to retrieve payments',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

// GET /admin/payments/:id/details - Get detailed payment info with full history
router.get('/payments/:id/details', async (req: express.Request, res: express.Response) => {
  const paymentId = req.params.id;

  try {
    if (!paymentId || paymentId.length !== 36) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Payment ID',
        timestamp: new Date().toISOString()
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        fees: true,
        transactions: {
          orderBy: { createdAt: 'asc' }
        },
        events: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment Not Found',
        timestamp: new Date().toISOString()
      });
    }

    // Calculate processing timeline
    const timeline = payment.events.map((event: PaymentEvent) => ({
      timestamp: event.createdAt,
      event: event.eventType,
      details: {
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        source: event.source,
        data: event.data
      }
    }));

    // Calculate totals
    const totalFees = payment.fees.reduce((sum: number, fee: Fee) => sum + Number(fee.amount), 0);
    const netAmount = Number(payment.targetAmount || 0) - totalFees;

    const response: ApiResponse = {
      success: true,
      data: {
        payment: {
          ...payment,
          sourceAmount: Number(payment.sourceAmount),
          targetAmount: payment.targetAmount ? Number(payment.targetAmount) : null,
          exchangeRate: payment.exchangeRate ? Number(payment.exchangeRate) : null
        },
        summary: {
          totalFees,
          netAmount,
          transactionCount: payment.transactions.length,
          eventCount: payment.events.length,
          processingTime: payment.completedAt 
            ? payment.completedAt.getTime() - payment.createdAt.getTime()
            : null
        },
        timeline,
        transactions: payment.transactions,
        fees: payment.fees
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to get payment details', { paymentId, error });

    const response: ApiResponse = {
      success: false,
      error: 'Database Error',
      message: 'Unable to retrieve payment details',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

// GET /admin/health - Comprehensive health check including providers
router.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    const [processorHealth, dbStats] = await Promise.all([
      paymentProcessor.healthCheck(),
      getSystemHealth()
    ]);

    const isHealthy = processorHealth.status === 'healthy';

    const response: ApiResponse = {
      success: isHealthy,
      data: {
        system: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        },
        paymentProcessor: processorHealth,
        database: dbStats,
        environment: {
          nodeEnv: process.env.NODE_ENV,
          version: process.env.API_VERSION,
          memoryUsage: process.memoryUsage()
        }
      },
      timestamp: new Date().toISOString()
    };

    res.status(isHealthy ? 200 : 503).json(response);

  } catch (error) {
    logger.error('Health check failed', { error });

    res.status(503).json({
      success: false,
      error: 'Health Check Failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to get payment status summary
async function getPaymentStatusSummary() {
  const [pending, processing, completed, failed, cancelled] = await Promise.all([
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'PROCESSING' } }),
    prisma.payment.count({ where: { status: 'COMPLETED' } }),
    prisma.payment.count({ where: { status: 'FAILED' } }),
    prisma.payment.count({ where: { status: 'CANCELLED' } })
  ]);

  return {
    PENDING: pending,
    PROCESSING: processing,
    COMPLETED: completed,
    FAILED: failed,
    CANCELLED: cancelled,
    total: pending + processing + completed + failed + cancelled
  };
}

// Helper function to get system health
async function getSystemHealth() {
  try {
    const startTime = Date.now();
    
    // Simple database query to test connection
    await prisma.payment.count();
    
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      responseTime,
      connectionPool: {
        // In a real app, you'd get actual connection pool stats
        active: Math.floor(Math.random() * 5),
        idle: Math.floor(Math.random() * 10),
        total: 15
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Database error'
    };
  }
}

export default router;
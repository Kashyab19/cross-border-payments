import express from 'express';
import { prisma } from '../infrastructure/database/prisma';
import { WebhookService } from '../services/WebhookService';
import { PaymentService } from '../services/PaymentService';
import { PaymentStatus } from '../types';
import { 
  captureRawBody, 
  verifyStripeWebhook, 
  verifyWebhookSignature,
  webhookRateLimit,
  logWebhookRequest
} from '../middleware/webHookAuth';
import { logger } from '../utils/logger';
import { WebhookEventType, ProviderWebhookEvent } from '../types/webhook';

type PrismaTransaction = typeof prisma;

const router = express.Router();
const webhookService = new WebhookService();
const paymentService = new PaymentService();

// Apply webhook middleware to all routes
router.use(captureRawBody);
router.use(webhookRateLimit());
router.use(logWebhookRequest());

// Webhook secrets (in production, these would be from environment variables)
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_demo_stripe_secret';
const OFFRAMP_WEBHOOK_SECRET = process.env.OFFRAMP_WEBHOOK_SECRET || 'demo_offramp_secret';

// POST /webhooks/stripe - Receive webhooks from Stripe
router.post('/stripe', 
  verifyStripeWebhook(STRIPE_WEBHOOK_SECRET),
  async (req: express.Request, res: express.Response) => {
    try {
      const stripeEvent = req.body;

      logger.info('Stripe webhook received', {
        eventId: stripeEvent.id,
        eventType: stripeEvent.type,
        livemode: stripeEvent.livemode
      });

      // Handle different Stripe event types
      switch (stripeEvent.type) {
        case 'payment_intent.succeeded':
          await handleStripePaymentSucceeded(stripeEvent);
          break;
          
        case 'payment_intent.payment_failed':
          await handleStripePaymentFailed(stripeEvent);
          break;
          
        case 'charge.dispute.created':
          await handleStripeChargeDispute(stripeEvent);
          break;

        case 'invoice.payment_succeeded':
          await handleStripeInvoicePayment(stripeEvent);
          break;

        default:
          logger.info('Unhandled Stripe event type', {
            eventType: stripeEvent.type,
            eventId: stripeEvent.id
          });
      }

      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ received: true });

    } catch (error) {
      logger.error('Stripe webhook processing failed', {
        error: error instanceof Error ? error.message : error,
        eventId: req.body?.id
      });

      // Return 500 so Stripe will retry
      res.status(500).json({
        error: 'Webhook processing failed',
        message: 'Internal server error'
      });
    }
  }
);

// POST /webhooks/offramp - Receive webhooks from offramp provider
router.post('/offramp',
  verifyWebhookSignature(OFFRAMP_WEBHOOK_SECRET),
  async (req: express.Request, res: express.Response) => {
    try {
      const offrampEvent: ProviderWebhookEvent = req.body;

      logger.info('Offramp webhook received', {
        eventId: offrampEvent.id,
        eventType: offrampEvent.type,
        paymentId: offrampEvent.data.paymentId
      });

      // Handle offramp events
      switch (offrampEvent.type) {
        case WebhookEventType.OFFRAMP_COMPLETED:
          await handleOfframpCompleted(offrampEvent);
          break;
          
        case WebhookEventType.OFFRAMP_FAILED:
          await handleOfframpFailed(offrampEvent);
          break;

        default:
          logger.info('Unhandled offramp event type', {
            eventType: offrampEvent.type,
            eventId: offrampEvent.id
          });
      }

      res.status(200).json({ received: true });

    } catch (error) {
      logger.error('Offramp webhook processing failed', {
        error: error instanceof Error ? error.message : error,
        eventId: req.body?.id
      });

      res.status(500).json({
        error: 'Webhook processing failed',
        message: 'Internal server error'
      });
    }
  }
);

// POST /webhooks/test - Test webhook endpoint (for development)
router.post('/test', async (req: express.Request, res: express.Response) => {
  try {
    const testEvent = req.body;

    logger.info('Test webhook received', {
      eventType: testEvent.type,
      data: testEvent.data
    });

    // Echo back the received data
    res.status(200).json({
      received: true,
      timestamp: new Date().toISOString(),
      echo: testEvent
    });

  } catch (error) {
    logger.error('Test webhook error', { error });
    res.status(500).json({ error: 'Test webhook failed' });
  }
});

// GET /webhooks/health - Webhook service health check
router.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    const health = await webhookService.healthCheck();
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      status: health.status,
      stats: health.stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Webhook health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

// Handler functions for different webhook events

async function handleStripePaymentSucceeded(stripeEvent: any): Promise<void> {
  try {
    const paymentIntent = stripeEvent.data.object;
    const paymentId = paymentIntent.metadata?.paymentId;

    if (!paymentId) {
      logger.warn('Stripe payment succeeded but no payment ID in metadata', {
        paymentIntentId: paymentIntent.id
      });
      return;
    }

    logger.info('Processing Stripe payment success', {
      paymentId,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

    // Update payment status and create event
    await prisma.$transaction(async (tx: PrismaTransaction) => {
      // Update payment
      await tx.payment.update({
        where: { id: paymentId },
        data: { 
          externalReference: paymentIntent.id,
          updatedAt: new Date()
        }
      });

      // Create event
      await tx.paymentEvent.create({
        data: {
          paymentId,
          eventType: 'stripe_payment_succeeded',
          data: {
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            stripeEventId: stripeEvent.id
          },
          source: 'stripe_webhook'
        }
      });
    });

    // Send customer notification webhook
    await webhookService.sendPaymentWebhook(
      paymentId,
      WebhookEventType.PAYMENT_PROCESSING,
      { 
        step: 'onramp_completed',
        provider: 'stripe',
        externalReference: paymentIntent.id
      }
    );

  } catch (error) {
    logger.error('Failed to handle Stripe payment succeeded', {
      stripeEventId: stripeEvent.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function handleStripePaymentFailed(stripeEvent: any): Promise<void> {
  try {
    const paymentIntent = stripeEvent.data.object;
    const paymentId = paymentIntent.metadata?.paymentId;

    if (!paymentId) {
      logger.warn('Stripe payment failed but no payment ID in metadata', {
        paymentIntentId: paymentIntent.id
      });
      return;
    }

    const failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';

    logger.info('Processing Stripe payment failure', {
      paymentId,
      paymentIntentId: paymentIntent.id,
      reason: failureReason
    });

    // Update payment status to failed
    await paymentService.updatePaymentStatus(paymentId, PaymentStatus.FAILED);

    // Create failure event
    await prisma.paymentEvent.create({
      data: {
        paymentId,
        eventType: 'stripe_payment_failed',
        data: {
          paymentIntentId: paymentIntent.id,
          reason: failureReason,
          stripeEventId: stripeEvent.id
        },
        source: 'stripe_webhook'
      }
    });

    // Send failure notification
    await webhookService.sendPaymentWebhook(
      paymentId,
      WebhookEventType.PAYMENT_FAILED,
      { 
        reason: failureReason,
        provider: 'stripe',
        externalReference: paymentIntent.id
      }
    );

  } catch (error) {
    logger.error('Failed to handle Stripe payment failed', {
      stripeEventId: stripeEvent.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function handleStripeChargeDispute(stripeEvent: any): Promise<void> {
  try {
    const dispute = stripeEvent.data.object;
    const chargeId = dispute.charge;

    logger.info('Stripe dispute created', {
      disputeId: dispute.id,
      chargeId,
      amount: dispute.amount,
      reason: dispute.reason
    });

    // In a real system, you'd:
    // 1. Find the payment associated with this charge
    // 2. Update payment status to disputed
    // 3. Send notification to finance team
    // 4. Potentially freeze related funds

    // For demo, just log it
    logger.warn('Payment dispute requires manual review', {
      disputeId: dispute.id,
      chargeId,
      reason: dispute.reason,
      amount: dispute.amount
    });

  } catch (error) {
    logger.error('Failed to handle Stripe dispute', {
      stripeEventId: stripeEvent.id,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function handleStripeInvoicePayment(stripeEvent: any): Promise<void> {
  // Handle subscription/invoice payments
  logger.info('Stripe invoice payment received', {
    invoiceId: stripeEvent.data.object.id,
    amount: stripeEvent.data.object.amount_paid
  });
}

async function handleOfframpCompleted(event: ProviderWebhookEvent): Promise<void> {
  try {
    const { paymentId, providerTransactionId, amount, currency } = event.data;

    logger.info('Processing offramp completion', {
      paymentId,
      providerTransactionId,
      amount,
      currency
    });

    // Update payment to completed
    await paymentService.updatePaymentStatus(paymentId, PaymentStatus.COMPLETED);

    // Create completion event
    await prisma.paymentEvent.create({
      data: {
        paymentId,
        eventType: 'offramp_completed',
        data: {
          providerTransactionId,
          amount,
          currency,
          webhookEventId: event.id
        },
        source: 'offramp_webhook'
      }
    });

    // Send completion notification
    await webhookService.sendPaymentWebhook(
      paymentId,
      WebhookEventType.PAYMENT_COMPLETED,
      {
        finalAmount: amount,
        currency,
        externalReference: providerTransactionId
      }
    );

  } catch (error) {
    logger.error('Failed to handle offramp completion', {
      eventId: event.id,
      paymentId: event.data.paymentId,
      error: error instanceof Error ? error.message : error
    });
  }
}

async function handleOfframpFailed(event: ProviderWebhookEvent): Promise<void> {
  try {
    const { paymentId, reason } = event.data;

    logger.info('Processing offramp failure', {
      paymentId,
      reason
    });

    // Update payment to failed
    await paymentService.updatePaymentStatus(paymentId, PaymentStatus.FAILED);

    // Send failure notification
    await webhookService.sendPaymentWebhook(
      paymentId,
      WebhookEventType.PAYMENT_FAILED,
      {
        reason,
        stage: 'offramp'
      }
    );

  } catch (error) {
    logger.error('Failed to handle offramp failure', {
      eventId: event.id,
      paymentId: event.data.paymentId,
      error: error instanceof Error ? error.message : error
    });
  }
}

export default router;
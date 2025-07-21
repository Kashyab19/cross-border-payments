import axios from 'axios';
import { prisma } from '../infrastructure/database/prisma';
import { logger } from '../utils/logger';
import { webhookSecurity } from '../utils/crypto';
import { WebhookEventType, PaymentWebhookEvent } from '../types/webhook';

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
  description?: string;
  createdAt: Date;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookEndpointId: string;
  paymentId: string;
  eventType: WebhookEventType;
  payload: any;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
  deliveredAt?: Date;
  attemptNumber: number;
  nextRetryAt?: Date;
  createdAt: Date;
}

// Webhook delivery service with retry logic and failure handling
export class WebhookService {
  private readonly maxRetries = 5;
  private readonly retryDelays = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m
  private readonly webhookTimeout = 30000; // 30 seconds
  private readonly maxPayloadSize = 1024 * 1024; // 1MB

  // Register a new webhook endpoint
  async registerWebhookEndpoint(config: {
    url: string;
    events: WebhookEventType[];
    description?: string;
  }): Promise<WebhookEndpoint> {
    try {
      // Validate URL
      if (!webhookSecurity.isValidWebhookUrl(config.url)) {
        throw new Error('Invalid webhook URL');
      }

      // Generate secret
      const secret = webhookSecurity.generateWebhookSecret();

      // Store in database (simplified - in production, you'd have a webhooks table)
      const endpoint: WebhookEndpoint = {
        id: crypto.randomUUID(),
        url: config.url,
        secret,
        events: config.events,
        isActive: true,
        description: config.description,
        createdAt: new Date()
      };

      logger.info('Webhook endpoint registered', {
        endpointId: endpoint.id,
        url: config.url,
        events: config.events
      });

      return endpoint;

    } catch (error) {
      logger.error('Failed to register webhook endpoint', {
        url: config.url,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Send webhook for payment event
  async sendPaymentWebhook(
    paymentId: string,
    eventType: WebhookEventType,
    eventData: any
  ): Promise<void> {
    try {
      // Get payment details
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { fees: true }
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Create webhook event payload
      const webhookEvent: PaymentWebhookEvent = {
        id: `evt_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`,
        type: eventType,
        timestamp: new Date().toISOString(),
        source: 'payment_api',
        data: {
          paymentId: payment.id,
          status: payment.status,
          amount: Number(payment.sourceAmount),
          currency: payment.sourceCurrency,
          customerId: payment.customerId,
          externalReference: payment.externalReference,
          ...eventData
        }
      };

      // In production, you'd get webhook endpoints from database
      // For demo, we'll use a mock endpoint configuration
      const webhookEndpoints = await this.getMockWebhookEndpoints(eventType);

      // Send to all registered endpoints
      for (const endpoint of webhookEndpoints) {
        await this.deliverWebhook(endpoint, webhookEvent);
      }

      logger.info('Payment webhook sent', {
        paymentId,
        eventType,
        endpointCount: webhookEndpoints.length
      });

    } catch (error) {
      logger.error('Failed to send payment webhook', {
        paymentId,
        eventType,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  // Deliver webhook to specific endpoint with retry logic
  private async deliverWebhook(
    endpoint: WebhookEndpoint,
    event: PaymentWebhookEvent,
    attemptNumber: number = 1
  ): Promise<void> {
    const deliveryId = crypto.randomUUID();

    try {
      const payload = JSON.stringify(event);

      // Check payload size
      if (payload.length > this.maxPayloadSize) {
        throw new Error('Webhook payload too large');
      }

      // Generate security headers
      const headers = webhookSecurity.generateWebhookHeaders(payload, endpoint.secret);

      logger.info('Delivering webhook', {
        deliveryId,
        endpointId: endpoint.id,
        url: endpoint.url,
        eventType: event.type,
        attemptNumber,
        payloadSize: payload.length
      });

      // Make HTTP request with timeout
      const response = await axios.post(endpoint.url, event, {
        headers,
        timeout: this.webhookTimeout,
        validateStatus: () => true // Don't throw on non-2xx status codes
      });

      const isSuccess = response.status >= 200 && response.status < 300;

      if (isSuccess) {
        // Success - log delivery
        logger.info('Webhook delivered successfully', {
          deliveryId,
          endpointId: endpoint.id,
          httpStatus: response.status,
          attemptNumber,
          responseTime: response.headers['x-response-time'] || 'unknown'
        });

        // Store successful delivery record
        await this.recordWebhookDelivery({
          id: deliveryId,
          webhookEndpointId: endpoint.id,
          paymentId: event.data.paymentId,
          eventType: event.type,
          payload: event,
          httpStatus: response.status,
          responseBody: response.data ? JSON.stringify(response.data).substring(0, 1000) : undefined,
          deliveredAt: new Date(),
          attemptNumber,
          createdAt: new Date()
        });

      } else {
        // HTTP error - schedule retry
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.warn('Webhook delivery failed', {
          deliveryId,
          endpointId: endpoint.id,
          httpStatus: response.status,
          error: errorMsg,
          attemptNumber
        });

        await this.handleWebhookFailure(endpoint, event, attemptNumber, errorMsg, response.status);
      }

    } catch (error) {
      // Network/timeout error - schedule retry
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Webhook delivery error', {
        deliveryId,
        endpointId: endpoint.id,
        error: errorMsg,
        attemptNumber
      });

      await this.handleWebhookFailure(endpoint, event, attemptNumber, errorMsg);
    }
  }

  // Handle webhook delivery failure with retry logic
  private async handleWebhookFailure(
    endpoint: WebhookEndpoint,
    event: PaymentWebhookEvent,
    attemptNumber: number,
    error: string,
    httpStatus?: number
  ): Promise<void> {
    const deliveryId = crypto.randomUUID();

    // Record failed attempt
    const deliveryRecord: WebhookDeliveryAttempt = {
      id: deliveryId,
      webhookEndpointId: endpoint.id,
      paymentId: event.data.paymentId,
      eventType: event.type,
      payload: event,
      httpStatus,
      error,
      attemptNumber,
      createdAt: new Date()
    };

    // Schedule retry if we haven't exceeded max attempts
    if (attemptNumber < this.maxRetries) {
      const retryDelay = this.retryDelays[attemptNumber - 1] || this.retryDelays[this.retryDelays.length - 1];
      const nextRetryAt = new Date(Date.now() + retryDelay);
      
      deliveryRecord.nextRetryAt = nextRetryAt;

      logger.info('Scheduling webhook retry', {
        deliveryId,
        endpointId: endpoint.id,
        attemptNumber,
        nextAttempt: attemptNumber + 1,
        retryDelay,
        nextRetryAt
      });

      // In production, you'd use a job queue (Redis Bull, AWS SQS, etc.)
      // For demo, we'll use setTimeout
      setTimeout(async () => {
        await this.deliverWebhook(endpoint, event, attemptNumber + 1);
      }, retryDelay);

    } else {
      // Max retries exceeded - give up
      logger.error('Webhook delivery permanently failed', {
        deliveryId,
        endpointId: endpoint.id,
        maxAttemptsReached: this.maxRetries,
        finalError: error
      });

      // In production, you'd:
      // 1. Send alert to monitoring system
      // 2. Add to dead letter queue for manual review
      // 3. Possibly disable the endpoint temporarily
    }

    await this.recordWebhookDelivery(deliveryRecord);
  }

  // Record webhook delivery attempt (in production, this would be a proper table)
  private async recordWebhookDelivery(delivery: WebhookDeliveryAttempt): Promise<void> {
    try {
      // In a real app, you'd have a webhook_deliveries table
      // For now, we'll store in payment events as a demo
      await prisma.paymentEvent.create({
        data: {
          paymentId: delivery.paymentId,
          eventType: 'webhook_delivery',
          data: {
            webhookEndpointId: delivery.webhookEndpointId,
            eventType: delivery.eventType,
            attemptNumber: delivery.attemptNumber,
            httpStatus: delivery.httpStatus,
            error: delivery.error,
            deliveredAt: delivery.deliveredAt,
            nextRetryAt: delivery.nextRetryAt
          },
          source: 'webhook_service'
        }
      });
    } catch (error) {
      logger.error('Failed to record webhook delivery', {
        deliveryId: delivery.id,
        error
      });
    }
  }

  // Get webhook endpoints for event type (mock implementation)
  private async getMockWebhookEndpoints(eventType: WebhookEventType): Promise<WebhookEndpoint[]> {
    // In production, this would query your webhooks table
    // For demo, return mock endpoints based on environment
    
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          id: 'demo-endpoint-1',
          url: 'https://webhook.site/unique-id', // Replace with real webhook.site URL for testing
          secret: 'demo_secret_key',
          events: [eventType],
          isActive: true,
          description: 'Demo webhook endpoint',
          createdAt: new Date()
        }
      ];
    }

    return []; // No webhooks in test/production without explicit registration
  }

  // Manually retry failed webhook delivery
  async retryWebhookDelivery(deliveryId: string): Promise<boolean> {
    try {
      // In production, you'd look up the delivery record and retry
      logger.info('Manual webhook retry triggered', { deliveryId });
      
      // For demo purposes, just return success
      return true;

    } catch (error) {
      logger.error('Failed to retry webhook delivery', { deliveryId, error });
      return false;
    }
  }

  // Get webhook delivery history for a payment
  async getWebhookDeliveries(paymentId: string): Promise<any[]> {
    try {
      // Get webhook-related events from payment events
      const events = await prisma.paymentEvent.findMany({
        where: {
          paymentId,
          eventType: 'webhook_delivery'
        },
        orderBy: { createdAt: 'desc' }
      });

      return events.map((event: { id: string; data: any; createdAt: Date }) => ({
        id: event.id,
        eventType: event.data?.eventType,
        attemptNumber: event.data?.attemptNumber,
        httpStatus: event.data?.httpStatus,
        error: event.data?.error,
        deliveredAt: event.data?.deliveredAt,
        createdAt: event.createdAt
      }));

    } catch (error) {
      logger.error('Failed to get webhook deliveries', { paymentId, error });
      return [];
    }
  }

  // Health check for webhook service
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    stats: {
      activeEndpoints: number;
      pendingRetries: number;
      recentDeliveries: number;
    };
  }> {
    try {
      // In production, you'd query actual webhook tables
      return {
        status: 'healthy',
        stats: {
          activeEndpoints: 1, // Mock value
          pendingRetries: 0,   // Mock value
          recentDeliveries: 5  // Mock value
        }
      };
    } catch {
      return {
        status: 'unhealthy',
        stats: {
          activeEndpoints: 0,
          pendingRetries: 0,
          recentDeliveries: 0
        }
      };
    }
  }
}
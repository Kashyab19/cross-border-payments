import { logger } from '../logger';
import { ProviderWebhookEvent, WebhookEventType } from '../../domain/entities/webhook';

export interface StripeChargeRequest {
  paymentId: string;
  amount: number; // in cents
  currency: string;
  customerId?: string;
  description?: string;
}

export interface StripeChargeResult {
  success: boolean;
  chargeId?: string;
  error?: string;
  processingTime: number;
}

// Mock Stripe provider - simulates USD onramp collection
export class MockStripeProvider {
  private readonly providerName = 'stripe';
  private readonly webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  // Simulate collecting USD from customer (onramp)
  async createCharge(request: StripeChargeRequest): Promise<StripeChargeResult> {
    const startTime = Date.now();
    
    logger.info('Stripe charge initiated', {
      paymentId: request.paymentId,
      amount: request.amount,
      currency: request.currency
    });

    try {
      // Simulate network delay (1-3 seconds)
      await this.delay(1000 + Math.random() * 2000);

      // Simulate success/failure rates (90% success)
      const isSuccess = Math.random() > 0.1;
      
      const processingTime = Date.now() - startTime;

      if (isSuccess) {
        const chargeId = `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Simulate successful charge
        const result: StripeChargeResult = {
          success: true,
          chargeId,
          processingTime
        };

        logger.info('Stripe charge successful', {
          paymentId: request.paymentId,
          chargeId,
          processingTime
        });

        // Send webhook asynchronously (in real world, Stripe would do this)
        this.sendWebhookAsync({
          paymentId: request.paymentId,
          chargeId,
          amount: request.amount,
          currency: request.currency,
          status: 'completed'
        });

        return result;

      } else {
        // Simulate various failure reasons
        const failureReasons = [
          'insufficient_funds',
          'card_declined', 
          'expired_card',
          'network_error',
          'fraud_detected'
        ];
        
        const reason = failureReasons[Math.floor(Math.random() * failureReasons.length)];

        const result: StripeChargeResult = {
          success: false,
          error: reason,
          processingTime
        };

        logger.warn('Stripe charge failed', {
          paymentId: request.paymentId,
          reason,
          processingTime
        });

        // Send failure webhook
        this.sendWebhookAsync({
          paymentId: request.paymentId,
          amount: request.amount,
          currency: request.currency,
          status: 'failed',
          reason
        });

        return result;
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Stripe charge error', {
        paymentId: request.paymentId,
        error: error instanceof Error ? error.message : error,
        processingTime
      });

      return {
        success: false,
        error: 'provider_error',
        processingTime
      };
    }
  }

  // Simulate refunding a charge
  async refundCharge(chargeId: string, amount?: number): Promise<{
    success: boolean;
    refundId?: string;
    error?: string;
  }> {
    logger.info('Stripe refund initiated', { chargeId, amount });

    try {
      // Simulate refund processing (1-2 seconds)
      await this.delay(1000 + Math.random() * 1000);

      // Refunds are usually more reliable (95% success)
      const isSuccess = Math.random() > 0.05;

      if (isSuccess) {
        const refundId = `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.info('Stripe refund successful', { chargeId, refundId });
        
        return {
          success: true,
          refundId
        };
      } else {
        const error = 'refund_failed';
        logger.warn('Stripe refund failed', { chargeId, error });
        
        return {
          success: false,
          error
        };
      }

    } catch (error) {
      logger.error('Stripe refund error', { chargeId, error });
      return {
        success: false,
        error: 'provider_error'
      };
    }
  }

  // Simulate webhook delivery (in real world, Stripe sends these to us)
  private async sendWebhookAsync(data: {
    paymentId: string;
    chargeId?: string;
    amount: number;
    currency: string;
    status: 'completed' | 'failed';
    reason?: string;
  }): Promise<void> {
    // Simulate webhook delay (Stripe usually sends within 1-5 seconds)
    setTimeout(async () => {
      try {
        const webhookEvent: ProviderWebhookEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: data.status === 'completed' ? WebhookEventType.ONRAMP_COMPLETED : WebhookEventType.ONRAMP_FAILED,
          timestamp: new Date().toISOString(),
          source: this.providerName,
          data: {
            paymentId: data.paymentId,
            providerTransactionId: data.chargeId || 'failed',
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            reason: data.reason,
            processingTime: Date.now(), // Mock processing time
            fees: data.status === 'completed' ? [
              {
                amount: data.amount * 0.029 + 30, // 2.9% + $0.30 (Stripe's fee)
                currency: data.currency,
                type: 'stripe_processing_fee'
              }
            ] : []
          }
        };

        // In a real app, this would be an HTTP POST to our webhook endpoint
        logger.info('Stripe webhook sent', {
          eventId: webhookEvent.id,
          paymentId: data.paymentId,
          status: data.status
        });

        // TODO: Actually send HTTP request to our webhook endpoint
        // await fetch(this.webhookUrl + '/webhooks/stripe', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(webhookEvent)
        // });

      } catch (error) {
        logger.error('Failed to send Stripe webhook', {
          paymentId: data.paymentId,
          error
        });
      }
    }, 1000 + Math.random() * 4000); // 1-5 second delay
  }

  // Get transaction details (for reconciliation)
  async getCharge(chargeId: string): Promise<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    created: Date;
  } | null> {
    try {
      // Simulate API call delay
      await this.delay(200 + Math.random() * 300);

      // Mock charge data
      return {
        id: chargeId,
        amount: Math.floor(Math.random() * 100000), // Random amount for demo
        currency: 'USD',
        status: Math.random() > 0.1 ? 'succeeded' : 'failed',
        created: new Date()
      };

    } catch (error) {
      logger.error('Failed to get Stripe charge', { chargeId, error });
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check
  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const startTime = Date.now();

    try {
      // Simulate API health check
      await this.delay(100 + Math.random() * 200);
      
      return {
        status: Math.random() > 0.05 ? 'up' : 'down', // 95% uptime
        responseTime: Date.now() - startTime
      };
    } catch {
      return {
        status: 'down',
        responseTime: Date.now() - startTime
      };
    }
  }
}
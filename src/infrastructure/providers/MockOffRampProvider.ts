import { logger } from '../logger';
import { ProviderWebhookEvent, WebhookEventType } from '../../domain/entities/webhook';

export interface OfframpTransferRequest {
  paymentId: string;
  amount: number;
  currency: string;
  recipientName: string;
  recipientAccount: string;
  description?: string;
}

export interface OfframpTransferResult {
  success: boolean;
  transferId?: string;
  error?: string;
  estimatedSettlement?: Date; // When recipient will receive funds
  processingTime: number;
}

// Mock offramp provider - simulates local currency bank transfers
export class MockOfframpProvider {
  private readonly providerName = 'offramp_provider';
  private readonly webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  // Simulate sending local currency to recipient's bank account
  async createTransfer(request: OfframpTransferRequest): Promise<OfframpTransferResult> {
    const startTime = Date.now();
    
    logger.info('Offramp transfer initiated', {
      paymentId: request.paymentId,
      amount: request.amount,
      currency: request.currency,
      recipient: request.recipientName
    });

    try {
      // Simulate longer processing time for international transfers (2-8 seconds)
      const processingDelay = 2000 + Math.random() * 6000;
      await this.delay(processingDelay);

      // Different success rates based on destination currency
      const successRates = {
        'EUR': 0.95, // Europe: high success rate
        'GBP': 0.92, // UK: high success rate
        'INR': 0.85, // India: medium success rate
        'NGN': 0.75, // Nigeria: lower success rate (regulatory complexity)
        'PHP': 0.80  // Philippines: medium success rate
      };

      const successRate = successRates[request.currency as keyof typeof successRates] || 0.85;
      const isSuccess = Math.random() < successRate;

      const processingTime = Date.now() - startTime;

      if (isSuccess) {
        const transferId = `tx_${Date.now()}_${request.currency.toLowerCase()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Estimate settlement time based on currency/country
        const settlementHours = this.getSettlementTime(request.currency);
        const estimatedSettlement = new Date(Date.now() + settlementHours * 60 * 60 * 1000);

        const result: OfframpTransferResult = {
          success: true,
          transferId,
          estimatedSettlement,
          processingTime
        };

        logger.info('Offramp transfer successful', {
          paymentId: request.paymentId,
          transferId,
          estimatedSettlement,
          processingTime
        });

        // Send success webhook after additional delay (settlement simulation)
        this.sendWebhookAsync({
          paymentId: request.paymentId,
          transferId,
          amount: request.amount,
          currency: request.currency,
          status: 'completed',
          settlementDelay: settlementHours * 0.1 // Faster for demo (6min instead of 1hr)
        });

        return result;

      } else {
        // Simulate various offramp failure reasons
        const failureReasons = [
          'invalid_account_details',
          'recipient_bank_rejected',
          'compliance_hold',
          'insufficient_liquidity',
          'network_timeout',
          'regulatory_restriction'
        ];
        
        const reason = failureReasons[Math.floor(Math.random() * failureReasons.length)];

        const result: OfframpTransferResult = {
          success: false,
          error: reason,
          processingTime
        };

        logger.warn('Offramp transfer failed', {
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
      
      logger.error('Offramp transfer error', {
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

  // Get transfer status (for tracking/reconciliation)
  async getTransfer(transferId: string): Promise<{
    id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    recipient: string;
    created: Date;
    settled?: Date;
  } | null> {
    try {
      // Simulate API call delay
      await this.delay(300 + Math.random() * 500);

      // Mock transfer data
      const statuses = ['pending', 'processing', 'completed', 'failed'];
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)] as any;

      return {
        id: transferId,
        amount: Math.floor(Math.random() * 100000), // Random amount
        currency: ['EUR', 'GBP', 'INR', 'NGN', 'PHP'][Math.floor(Math.random() * 5)],
        status: randomStatus,
        recipient: 'Mock Recipient',
        created: new Date(Date.now() - Math.random() * 86400000), // Random past date
        settled: randomStatus === 'completed' ? new Date() : undefined
      };

    } catch (error) {
      logger.error('Failed to get offramp transfer', { transferId, error });
      return null;
    }
  }

  // Simulate webhook delivery 
  private async sendWebhookAsync(data: {
    paymentId: string;
    transferId?: string;
    amount: number;
    currency: string;
    status: 'completed' | 'failed';
    reason?: string;
    settlementDelay?: number; // hours
  }): Promise<void> {
    // Simulate settlement delay (in real world, this could be hours/days)
    const webhookDelay = data.settlementDelay 
      ? data.settlementDelay * 60 * 1000 // Convert hours to milliseconds  
      : 2000 + Math.random() * 3000; // 2-5 seconds for demo

    setTimeout(async () => {
      try {
        const webhookEvent: ProviderWebhookEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: data.status === 'completed' ? WebhookEventType.OFFRAMP_COMPLETED : WebhookEventType.OFFRAMP_FAILED,
          timestamp: new Date().toISOString(),
          source: this.providerName,
          data: {
            paymentId: data.paymentId,
            providerTransactionId: data.transferId || 'failed',
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            reason: data.reason,
            processingTime: Date.now(),
            fees: data.status === 'completed' ? [
              {
                amount: this.calculateOfframpFee(data.amount, data.currency),
                currency: 'USD', // Fee charged in USD
                type: 'offramp_transfer_fee'
              }
            ] : []
          }
        };

        logger.info('Offramp webhook sent', {
          eventId: webhookEvent.id,
          paymentId: data.paymentId,
          status: data.status,
          delay: webhookDelay
        });

        // TODO: Actually send HTTP request to our webhook endpoint
        // await fetch(this.webhookUrl + '/webhooks/offramp', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify(webhookEvent)
        // });

      } catch (error) {
        logger.error('Failed to send offramp webhook', {
          paymentId: data.paymentId,
          error
        });
      }
    }, webhookDelay);
  }

  // Get settlement time based on destination currency
  private getSettlementTime(currency: string): number {
    const settlementTimes = {
      'EUR': 1,   // 1 hour (SEPA instant)
      'GBP': 2,   // 2 hours (Faster Payments)  
      'INR': 4,   // 4 hours (UPI/IMPS)
      'NGN': 24,  // 24 hours (local bank processing)
      'PHP': 8    // 8 hours (local bank processing)
    };

    return settlementTimes[currency as keyof typeof settlementTimes] || 12; // Default 12 hours
  }

  // Calculate offramp fees based on amount and currency
  private calculateOfframpFee(amount: number, currency: string): number {
    const feeRates = {
      'EUR': 0.015, // 1.5%
      'GBP': 0.015, // 1.5%
      'INR': 0.025, // 2.5% 
      'NGN': 0.035, // 3.5%
      'PHP': 0.028  // 2.8%
    };

    const rate = feeRates[currency as keyof typeof feeRates] || 0.02; // Default 2%
    return Math.round(amount * rate * 100) / 100; // Round to 2 decimal places
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check
  async healthCheck(): Promise<{ status: 'up' | 'down'; responseTime: number }> {
    const startTime = Date.now();

    try {
      // Simulate API health check
      await this.delay(200 + Math.random() * 400);
      
      return {
        status: Math.random() > 0.08 ? 'up' : 'down', // 92% uptime (lower than Stripe)
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
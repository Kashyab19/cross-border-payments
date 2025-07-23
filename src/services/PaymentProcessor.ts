import { PaymentStatus } from '../types';
import { prisma } from '../infrastructure/database/prisma';
import { logger } from '../utils/logger';
import { MockStripeProvider } from './providers/MockStripProvider';
import { MockOfframpProvider } from './providers/MockOffRampProvider';

export interface ProcessPaymentResult {
  success: boolean;
  paymentId: string;
  status: PaymentStatus;
  error?: string;
  processingTime: number;
  steps: ProcessingStep[];
}

export interface ProcessingStep {
  step: string;
  status: 'completed' | 'failed' | 'skipped';
  duration: number;
  details?: any;
  error?: string;
}

// Payment processor orchestrates the entire cross-border payment flow
export class PaymentProcessor {
  private stripeProvider: MockStripeProvider;
  private offrampProvider: MockOfframpProvider;

  constructor(webhookBaseUrl: string = 'http://localhost:3000') {
    this.stripeProvider = new MockStripeProvider(webhookBaseUrl);
    this.offrampProvider = new MockOfframpProvider(webhookBaseUrl);
  }

  // Main processing function - orchestrates the entire payment flow
  async processPayment(paymentId: string): Promise<ProcessPaymentResult> {
    const startTime = Date.now();
    const steps: ProcessingStep[] = [];
    
    logger.info('Starting payment processing', { paymentId });

    try {
      // Step 1: Get payment details (simplified query first)
      const stepStart = Date.now();
      let payment;
      try {
        payment = await prisma.payment.findUnique({
          where: { id: paymentId }
        });
        logger.info('Payment details retrieved', { 
          paymentId,
          found: !!payment,
          status: payment?.status 
        });
      } catch (dbError) {
        logger.error('Failed to retrieve payment details', {
          paymentId,
          error: dbError instanceof Error ? dbError.message : dbError
        });
        throw dbError;
      }

      if (!payment) {
        logger.error('Payment not found', { paymentId });
        throw new Error('Payment not found');
      }

      if (payment.status !== PaymentStatus.PENDING) {
        logger.error('Invalid payment status', { 
          paymentId,
          currentStatus: payment.status,
          expectedStatus: PaymentStatus.PENDING 
        });
        throw new Error(`Payment status is ${payment.status}, expected PENDING`);
      }

      steps.push({
        step: 'validate_payment',
        status: 'completed',
        duration: Date.now() - stepStart,
        details: { paymentStatus: payment.status }
      });

      // Step 2: Update status to PROCESSING
      try {
        await this.updatePaymentStatus(paymentId, PaymentStatus.PROCESSING, 'Payment processing started');
        logger.info('Payment status updated to PROCESSING', { paymentId });
      } catch (updateError) {
        logger.error('Failed to update payment status to PROCESSING', {
          paymentId,
          error: updateError instanceof Error ? updateError.message : updateError
        });
        throw updateError;
      }

      steps.push({
        step: 'update_status_processing',
        status: 'completed', 
        duration: Date.now() - stepStart
      });

      // Step 3: Onramp - Collect USD from customer (via Stripe)
      const onrampResult = await this.processOnramp(payment);
      steps.push(onrampResult);

      if (onrampResult.status === 'failed') {
        await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED, `Onramp failed: ${onrampResult.error}`);
        
        return {
          success: false,
          paymentId,
          status: PaymentStatus.FAILED,
          error: onrampResult.error,
          processingTime: Date.now() - startTime,
          steps
        };
      }

      // Step 4: Currency conversion (simulated - in reality would involve stablecoin conversion)
      const conversionResult = await this.processCurrencyConversion(payment);
      steps.push(conversionResult);

      if (conversionResult.status === 'failed') {
        // Need to refund the onramp charge
        await this.refundOnramp(onrampResult.details.chargeId);
        await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED, `Currency conversion failed: ${conversionResult.error}`);
        
        return {
          success: false,
          paymentId,
          status: PaymentStatus.FAILED,
          error: conversionResult.error,
          processingTime: Date.now() - startTime,
          steps
        };
      }

      // Step 5: Offramp - Send local currency to recipient
      const offrampResult = await this.processOfframp(payment);
      steps.push(offrampResult);

      if (offrampResult.status === 'failed') {
        // Need to refund everything
        await this.refundOnramp(onrampResult.details.chargeId);
        await this.updatePaymentStatus(paymentId, PaymentStatus.FAILED, `Offramp failed: ${offrampResult.error}`);
        
        return {
          success: false,
          paymentId,
          status: PaymentStatus.FAILED,
          error: offrampResult.error,
          processingTime: Date.now() - startTime,
          steps
        };
      }

      // Step 6: Final success - update payment status
      await this.updatePaymentStatus(paymentId, PaymentStatus.COMPLETED, 'Payment completed successfully');

      const processingTime = Date.now() - startTime;

      logger.info('Payment processing completed successfully', {
        paymentId,
        processingTime,
        totalSteps: steps.length
      });

      return {
        success: true,
        paymentId,
        status: PaymentStatus.COMPLETED,
        processingTime,
        steps
      };

    } catch (error) {
      logger.error('Payment processing failed', {
        paymentId,
        error: error instanceof Error ? error.message : error,
        errorStack: error instanceof Error ? error.stack : undefined,
        processingTime: Date.now() - startTime,
        completedSteps: steps
      });
      throw error;
    }
  }

  // Process USD collection via Stripe
  private async processOnramp(payment: any): Promise<ProcessingStep> {
    const stepStart = Date.now();
    
    try {
      logger.info('Processing onramp (Stripe)', { paymentId: payment.id });

      const result = await this.stripeProvider.createCharge({
        paymentId: payment.id,
        amount: Math.round(Number(payment.sourceAmount) * 100), // Convert to cents
        currency: payment.sourceCurrency,
        customerId: payment.customerId,
        description: payment.description || 'Cross-border payment'
      });

      if (result.success) {
        // Record transaction
        try {
          await prisma.transaction.create({
            data: {
              paymentId: payment.id,
              type: 'PAYMENT',
              amount: payment.sourceAmount,
              currency: payment.sourceCurrency,
              providerId: 'stripe',
              externalTxId: result.chargeId,
              description: 'USD onramp via Stripe'
            }
          });
        } catch (txError) {
          logger.warn('Failed to record onramp transaction', { paymentId: payment.id, txError });
          // Don't fail the whole process for transaction recording issues
        }

        return {
          step: 'onramp_stripe',
          status: 'completed',
          duration: Date.now() - stepStart,
          details: { 
            chargeId: result.chargeId,
            amount: payment.sourceAmount,
            currency: payment.sourceCurrency
          }
        };
      } else {
        return {
          step: 'onramp_stripe',
          status: 'failed',
          duration: Date.now() - stepStart,
          error: result.error
        };
      }

    } catch (error) {
      return {
        step: 'onramp_stripe',
        status: 'failed', 
        duration: Date.now() - stepStart,
        error: error instanceof Error ? error.message : 'Onramp error'
      };
    }
  }

  // Process currency conversion (simulated)
  private async processCurrencyConversion(payment: any): Promise<ProcessingStep> {
    const stepStart = Date.now();

    try {
      logger.info('Processing currency conversion', { 
        paymentId: payment.id,
        from: payment.sourceCurrency,
        to: payment.targetCurrency
      });

      // Simulate conversion processing time (500ms - 2s)
      await this.delay(500 + Math.random() * 1500);

      // Simulate conversion success rate (98% - conversions rarely fail)
      const isSuccess = Math.random() > 0.02;

      if (isSuccess) {
        // Record conversion transaction
        try {
          await prisma.transaction.create({
            data: {
              paymentId: payment.id,
              type: 'PAYMENT',
              amount: payment.targetAmount,
              currency: payment.targetCurrency,
              providerId: 'exchange_service',
              description: `Currency conversion ${payment.sourceCurrency} → ${payment.targetCurrency}`
            }
          });
        } catch (txError) {
          logger.warn('Failed to record conversion transaction', { paymentId: payment.id, txError });
        }

        return {
          step: 'currency_conversion',
          status: 'completed',
          duration: Date.now() - stepStart,
          details: {
            fromAmount: payment.sourceAmount,
            fromCurrency: payment.sourceCurrency,
            toAmount: payment.targetAmount,
            toCurrency: payment.targetCurrency,
            exchangeRate: payment.exchangeRate
          }
        };
      } else {
        const errors = ['liquidity_insufficient', 'rate_expired', 'conversion_timeout'];
        const error = errors[Math.floor(Math.random() * errors.length)];
        
        return {
          step: 'currency_conversion',
          status: 'failed',
          duration: Date.now() - stepStart,
          error
        };
      }

    } catch (error) {
      return {
        step: 'currency_conversion',
        status: 'failed',
        duration: Date.now() - stepStart,
        error: error instanceof Error ? error.message : 'Conversion error'
      };
    }
  }

  // Process local currency transfer to recipient
  private async processOfframp(payment: any): Promise<ProcessingStep> {
    const stepStart = Date.now();

    try {
      logger.info('Processing offramp transfer', { 
        paymentId: payment.id,
        amount: payment.targetAmount,
        currency: payment.targetCurrency
      });

      const result = await this.offrampProvider.createTransfer({
        paymentId: payment.id,
        amount: Number(payment.targetAmount),
        currency: payment.targetCurrency,
        recipientName: payment.recipientName || 'Unknown Recipient',
        recipientAccount: payment.recipientAccount || 'Unknown Account',
        description: payment.description || 'Cross-border payment'
      });

      if (result.success) {
        // Record offramp transaction
        try {
          await prisma.transaction.create({
            data: {
              paymentId: payment.id,
              type: 'PAYMENT',
              amount: payment.targetAmount,
              currency: payment.targetCurrency,
              providerId: 'offramp_provider',
              externalTxId: result.transferId,
              description: `Local currency offramp to ${payment.recipientName}`
            }
          });
        } catch (txError) {
          logger.warn('Failed to record offramp transaction', { paymentId: payment.id, txError });
        }

        return {
          step: 'offramp_transfer',
          status: 'completed',
          duration: Date.now() - stepStart,
          details: {
            transferId: result.transferId,
            amount: payment.targetAmount,
            currency: payment.targetCurrency,
            estimatedSettlement: result.estimatedSettlement
          }
        };
      } else {
        return {
          step: 'offramp_transfer',
          status: 'failed',
          duration: Date.now() - stepStart,
          error: result.error
        };
      }

    } catch (error) {
      return {
        step: 'offramp_transfer',
        status: 'failed',
        duration: Date.now() - stepStart,
        error: error instanceof Error ? error.message : 'Offramp error'
      };
    }
  }

  // Refund onramp charge in case of downstream failures
  private async refundOnramp(chargeId: string): Promise<void> {
    try {
      logger.info('Refunding onramp charge', { chargeId });
      
      const result = await this.stripeProvider.refundCharge(chargeId);
      
      if (result.success) {
        logger.info('Onramp refund successful', { 
          chargeId, 
          refundId: result.refundId 
        });
      } else {
        logger.error('Onramp refund failed', { 
          chargeId, 
          error: result.error 
        });
      }
    } catch (error) {
      logger.error('Refund onramp error', { chargeId, error });
    }
  }

  // Update payment status with event logging
  private async updatePaymentStatus(paymentId: string, status: PaymentStatus, reason: string): Promise<void> {
    try {
      // First check if payment exists before starting transaction
      const paymentExists = await prisma.payment.findUnique({
        where: { id: paymentId },
        select: { id: true }
      });

      if (!paymentExists) {
        logger.error('Cannot update status: Payment not found', { paymentId, status });
        throw new Error(`Payment not found: ${paymentId}`);
      }

      await prisma.$transaction(async (tx) => {
        // Get current payment with full details
        const currentPayment = await tx.payment.findUnique({
          where: { id: paymentId }
        });

        if (!currentPayment) {
          throw new Error(`Payment disappeared during transaction: ${paymentId}`);
        }

        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status,
            updatedAt: new Date(),
            ...(status === PaymentStatus.COMPLETED ? { completedAt: new Date() } : {})
          }
        });

        // Create status change event
        await tx.paymentEvent.create({
          data: {
            paymentId,
            eventType: 'status_changed',
            oldStatus: currentPayment.status,
            newStatus: status,
            data: { reason, timestamp: new Date().toISOString() },
            source: 'payment_processor'
          }
        });
      });

      logger.info('Payment status updated successfully', { 
        paymentId, 
        status, 
        reason 
      });
    } catch (error) {
      logger.error('Failed to update payment status', {
        paymentId,
        status,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Health check for all providers
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    providers: Record<string, any>;
  }> {
    try {
      const [stripeHealth, offrampHealth] = await Promise.all([
        this.stripeProvider.healthCheck(),
        this.offrampProvider.healthCheck()
      ]);

      const allHealthy = stripeHealth.status === 'up' && offrampHealth.status === 'up';

      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        providers: {
          stripe: stripeHealth,
          offramp: offrampHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        providers: {
          error: error instanceof Error ? error.message : 'Health check failed'
        }
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
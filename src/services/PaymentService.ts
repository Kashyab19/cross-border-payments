import { Payment, CreatePaymentRequest, PaymentQuote, PaymentStatus } from '../types';
import { storage } from '../storage/DatabaseStorage';
import { FeeCalculator } from './FeeCalculator';
import { ExchangeService } from './ExchangeService';
import { WebhookService } from './WebhookService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class PaymentService {
  private feeCalculator: FeeCalculator;
  private exchangeService: ExchangeService;
  private webhookService: WebhookService;

  constructor() {
    this.feeCalculator = new FeeCalculator();
    this.exchangeService = new ExchangeService();
    this.webhookService = new WebhookService();
  }

  async createPaymentQuote(request: {
    sourceAmount: number;
    sourceCurrency: string;
    targetCurrency: string;
    destinationCountry?: string;
    paymentMethod?: string;
  }): Promise<PaymentQuote> {
    try {
      // 1. Get exchange rate
      const exchangeRate = await this.exchangeService.getCachedRate(
        request.sourceCurrency,
        request.targetCurrency
      );

      // 2. Calculate fees
      const feeResult = await this.feeCalculator.calculateFees(request);

      // 3. Calculate amounts
      const sourceAmountAfterFees = request.sourceAmount - feeResult.totalFeeAmount;
      const targetAmount = sourceAmountAfterFees * exchangeRate;
      const netAmount = targetAmount; // Net amount recipient receives

      const quote: PaymentQuote = {
        sourceAmount: request.sourceAmount,
        sourceCurrency: request.sourceCurrency,
        targetAmount: Number(targetAmount.toFixed(2)),
        targetCurrency: request.targetCurrency,
        exchangeRate: exchangeRate,
        totalFees: feeResult.totalFeeAmount,
        netAmount: Number(netAmount.toFixed(2)),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // Expires in 15 minutes
      };

      logger.info('Payment quote created', {
        sourceAmount: request.sourceAmount,
        targetAmount: quote.targetAmount,
        totalFees: quote.totalFees,
        exchangeRate: quote.exchangeRate
      });

      return quote;

    } catch (error) {
      logger.error('Failed to create payment quote', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async createPayment(request: CreatePaymentRequest): Promise<{
    payment: Payment;
    quote: PaymentQuote;
    fees: any[];
  }> {
    try {
      // 1. Check for duplicate idempotency key
      const existingPayment = await storage.getPaymentByIdempotencyKey(request.idempotencyKey);
      if (existingPayment) {
        logger.warn('Duplicate payment request detected', {
          idempotencyKey: request.idempotencyKey,
          existingPaymentId: existingPayment.id
        });

        // Return existing payment (idempotent response)
        const fees = await storage.getFeesForPayment(existingPayment.id);
        const quote = await this.createPaymentQuote({
          sourceAmount: existingPayment.sourceAmount,
          sourceCurrency: existingPayment.sourceCurrency,
          targetCurrency: existingPayment.targetCurrency
        });

        return { payment: existingPayment, quote, fees };
      }

      // 2. Create quote
      const quote = await this.createPaymentQuote({
        sourceAmount: request.sourceAmount,
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        destinationCountry: request.destinationCountry,
        paymentMethod: request.paymentMethod
      });

      // 3. Calculate fees
      const feeResult = await this.feeCalculator.calculateFees({
        sourceAmount: request.sourceAmount,
        sourceCurrency: request.sourceCurrency,
        targetCurrency: request.targetCurrency,
        destinationCountry: request.destinationCountry
      });

      // 4. Create payment entity
      const payment: Payment = {
        id: uuidv4(),
        idempotencyKey: request.idempotencyKey,
        sourceAmount: request.sourceAmount,
        sourceCurrency: request.sourceCurrency,
        targetAmount: quote.targetAmount,
        targetCurrency: request.targetCurrency,
        exchangeRate: quote.exchangeRate,
        status: PaymentStatus.PENDING,
        customerId: request.customerId,
        customerEmail: request.customerEmail,
        recipientName: request.recipientName,
        recipientAccount: request.recipientAccount,
        description: request.description,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // 5. Save payment and fees
      await storage.savePayment(payment);
      await storage.saveFeesForPayment(payment.id, feeResult.fees);

      logger.info('Payment created successfully', {
        paymentId: payment.id,
        customerId: payment.customerId,
        sourceAmount: payment.sourceAmount,
        targetAmount: payment.targetAmount,
        totalFees: feeResult.totalFeeAmount
      });

      return {
        payment,
        quote,
        fees: feeResult.fees
      };

    } catch (error) {
      logger.error('Failed to create payment', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async getPayment(paymentId: string): Promise<{
    payment: Payment;
    fees: any[];
  } | null> {
    try {
      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        return null;
      }

      const fees = await storage.getFeesForPayment(paymentId);
      return { payment, fees };

    } catch (error) {
      logger.error('Failed to get payment', { paymentId, error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async getAllPayments(): Promise<Payment[]> {
    try {
      return await storage.getAllPayments();
    } catch (error) {
      logger.error('Failed to get all payments', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  async updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<Payment | null> {
    try {
      const updated = await storage.updatePayment(paymentId, {
        status,
        ...(status === PaymentStatus.COMPLETED ? { completedAt: new Date() } : {})
      });

      if (updated) {
        logger.info('Payment status updated', {
          paymentId,
          newStatus: status
        });
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update payment status', { 
        paymentId, 
        status, 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  // Get service health/stats
  async getStats(): Promise<{
    storage: any;
    supportedCurrencies: string[];
    sampleExchangeRates: Record<string, number>;
  }> {
    const storageStats = await storage.getStats();
    const supportedCurrencies = await this.exchangeService.getSupportedCurrencies();
    
    // Get some sample exchange rates
    const sampleRates: Record<string, number> = {};
    const sampleCurrencies = ['EUR', 'GBP', 'INR'];
    
    for (const currency of sampleCurrencies) {
      try {
        sampleRates[`USD_${currency}`] = await this.exchangeService.getCachedRate('USD', currency);
      } catch {
        sampleRates[`USD_${currency}`] = 0;
      }
    }

    return {
      storage: storageStats,
      supportedCurrencies,
      sampleExchangeRates: sampleRates
    };
  }
}
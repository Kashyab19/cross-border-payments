import { IPayment, IFee } from '../../domain/interfaces';
import { prisma } from '../database/prisma';
import { logger } from '../logger';
import { PaymentMapper } from '../database/mappers/PaymentMapper';

export class DatabaseStorage {
  // Payment operations
  async savePayment(payment: IPayment): Promise<void> {
    try {
      const prismaData = PaymentMapper.toPrisma(payment);
      await prisma.payment.create({
        data: prismaData
      });
      
      logger.info('Payment saved to database', { 
        paymentId: payment.id,
        status: payment.status
      });
    } catch (error) {
      logger.error('Failed to save payment to database', {
        paymentId: payment.id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getPayment(id: string): Promise<IPayment | null> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id }
      });
      return payment ? PaymentMapper.toDomain(payment) : null;
    } catch (error) {
      logger.error('Failed to get payment from database', {
        paymentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getPaymentByIdempotencyKey(key: string): Promise<IPayment | null> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { idempotencyKey: key }
      });
      return payment ? PaymentMapper.toDomain(payment) : null;
    } catch (error) {
      logger.error('Failed to get payment by idempotency key', {
        idempotencyKey: key,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async updatePayment(id: string, updates: Partial<IPayment>): Promise<IPayment | null> {
    try {
      const prismaData = PaymentMapper.toPrisma({ ...updates, updatedAt: new Date() });
      const payment = await prisma.payment.update({
        where: { id },
        data: prismaData
      });
      return PaymentMapper.toDomain(payment);
    } catch (error) {
      logger.error('Failed to update payment', {
        paymentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getAllPayments(): Promise<IPayment[]> {
    try {
      const payments = await prisma.payment.findMany();
      return payments.map(PaymentMapper.toDomain);
    } catch (error) {
      logger.error('Failed to get all payments', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fee operations
  async saveFeesForPayment(paymentId: string, fees: Omit<IFee, 'id' | 'paymentId' | 'createdAt'>[]): Promise<void> {
    try {
      const prismaFees = fees.map(fee => PaymentMapper.feeToPrisma({ ...fee, paymentId }));
      await prisma.fee.createMany({
        data: prismaFees
      });
      
      logger.info('Fees saved to database', { 
        paymentId,
        feeCount: fees.length
      });
    } catch (error) {
      logger.error('Failed to save fees', {
        paymentId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Transactional method to create payment and fees together
  async createPaymentWithFees(payment: IPayment, fees: Omit<IFee, 'id' | 'paymentId' | 'createdAt'>[]): Promise<void> {
    try {
      logger.info('Creating payment with fees transaction', {
        paymentId: payment.id,
        feeCount: fees.length
      });
      
      await prisma.$transaction(async (tx) => {
        // 1. Create payment first
        const prismaData = PaymentMapper.toPrisma(payment);
        logger.debug('Creating payment with data', { 
          paymentId: payment.id,
          prismaDataId: prismaData.id 
        });
        
        const createdPayment = await tx.payment.create({
          data: prismaData
        });
        
        logger.debug('Payment created successfully', { 
          createdPaymentId: createdPayment.id 
        });
        
        // 2. Create fees if any
        if (fees.length > 0) {
          const prismaFees = fees.map(fee => PaymentMapper.feeToPrisma({ ...fee, paymentId: payment.id }));
          logger.debug('Creating fees with paymentId', { 
            paymentId: payment.id,
            feeCount: prismaFees.length 
          });
          
          await tx.fee.createMany({
            data: prismaFees
          });
          
          logger.debug('Fees created successfully');
        }
      });
      
      logger.info('Payment and fees created successfully', {
        paymentId: payment.id,
        feeCount: fees.length
      });
    } catch (error) {
      logger.error('Failed to create payment with fees', {
        paymentId: payment.id,
        feeCount: fees.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getFeesForPayment(paymentId: string): Promise<IFee[]> {
    try {
      const fees = await prisma.fee.findMany({
        where: { paymentId }
      });
      return fees.map(PaymentMapper.feeToDomain);
    } catch (error) {
      logger.error('Failed to get fees for payment', {
        paymentId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getStats(): Promise<{
    totalPayments: number;
    pendingPayments: number;
    completedPayments: number;
  }> {
    try {
      const [total, pending, completed] = await Promise.all([
        prisma.payment.count(),
        prisma.payment.count({ where: { status: 'PENDING' } }),
        prisma.payment.count({ where: { status: 'COMPLETED' } })
      ]);
      
      return {
        totalPayments: total,
        pendingPayments: pending,
        completedPayments: completed
      };
    } catch (error) {
      logger.error('Failed to get payment stats', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
}

// Export singleton instance
export const storage = new DatabaseStorage(); 
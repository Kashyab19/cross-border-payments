import { Payment, Fee } from '../types';
import { prisma } from '../infrastructure/database/prisma';
import { logger } from '../utils/logger';

export class DatabaseStorage {
  // Payment operations
  async savePayment(payment: Payment): Promise<void> {
    try {
      await prisma.payment.create({
        data: payment
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

  async getPayment(id: string): Promise<Payment | null> {
    try {
      return await prisma.payment.findUnique({
        where: { id }
      });
    } catch (error) {
      logger.error('Failed to get payment from database', {
        paymentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    try {
      return await prisma.payment.findUnique({
        where: { idempotencyKey: key }
      });
    } catch (error) {
      logger.error('Failed to get payment by idempotency key', {
        idempotencyKey: key,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    try {
      return await prisma.payment.update({
        where: { id },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to update payment', {
        paymentId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async getAllPayments(): Promise<Payment[]> {
    try {
      return await prisma.payment.findMany();
    } catch (error) {
      logger.error('Failed to get all payments', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // Fee operations
  async saveFeesForPayment(paymentId: string, fees: Fee[]): Promise<void> {
    try {
      await prisma.fee.createMany({
        data: fees.map(fee => ({
          ...fee,
          paymentId
        }))
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

  async getFeesForPayment(paymentId: string): Promise<Fee[]> {
    try {
      return await prisma.fee.findMany({
        where: { paymentId }
      });
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
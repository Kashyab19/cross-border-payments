import { Payment } from '../../../types';
import { BaseRepository } from './BaseRepository';
import { prisma } from '../prisma';
import { logger } from '../../../utils/logger';

export class PaymentRepository implements BaseRepository<Payment> {
  async findById(id: string): Promise<Payment | null> {
    try {
      return await prisma.payment.findUnique({ where: { id } });
    } catch (error) {
      logger.error('Error finding payment by id:', error);
      throw error;
    }
  }

  async findAll(): Promise<Payment[]> {
    try {
      return await prisma.payment.findMany();
    } catch (error) {
      logger.error('Error finding all payments:', error);
      throw error;
    }
  }

  async create(data: Omit<Payment, 'id'>): Promise<Payment> {
    try {
      return await prisma.payment.create({ data });
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  async update(id: string, data: Partial<Payment>): Promise<Payment | null> {
    try {
      return await prisma.payment.update({
        where: { id },
        data
      });
    } catch (error) {
      logger.error('Error updating payment:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.payment.delete({ where: { id } });
      return true;
    } catch (error) {
      logger.error('Error deleting payment:', error);
      return false;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | null> {
    try {
      return await prisma.payment.findUnique({
        where: { idempotencyKey }
      });
    } catch (error) {
      logger.error('Error finding payment by idempotency key:', error);
      throw error;
    }
  }

  async getFeesForPayment(paymentId: string): Promise<any[]> {
    try {
      return await prisma.paymentFee.findMany({
        where: { paymentId }
      });
    } catch (error) {
      logger.error('Error getting fees for payment:', error);
      throw error;
    }
  }

  async saveFeesForPayment(paymentId: string, fees: any[]): Promise<void> {
    try {
      await prisma.paymentFee.createMany({
        data: fees.map(fee => ({ ...fee, paymentId }))
      });
    } catch (error) {
      logger.error('Error saving fees for payment:', error);
      throw error;
    }
  }

  async getStats(): Promise<any> {
    try {
      const totalPayments = await prisma.payment.count();
      const completedPayments = await prisma.payment.count({
        where: { status: 'COMPLETED' }
      });
      
      return {
        totalPayments,
        completedPayments
      };
    } catch (error) {
      logger.error('Error getting payment stats:', error);
      throw error;
    }
  }
} 
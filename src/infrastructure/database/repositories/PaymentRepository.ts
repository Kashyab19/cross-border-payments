import { IPayment, IPaymentRepository, IFee, PaymentFilters } from '../../../domain/interfaces';
import { BaseRepository } from './BaseRepository';
import { prisma } from '../prisma';
import { logger } from '../../logger';
import { PaymentMapper } from '../mappers/PaymentMapper';

export class PaymentRepository implements BaseRepository<IPayment>, IPaymentRepository {
  async findById(id: string): Promise<IPayment | null> {
    try {
      const payment = await prisma.payment.findUnique({ where: { id } });
      return payment ? PaymentMapper.toDomain(payment) : null;
    } catch (error) {
      logger.error('Error finding payment by id:', error);
      throw error;
    }
  }

  async findAll(filters?: PaymentFilters): Promise<IPayment[]> {
    try {
      const whereClause: any = {};
      if (filters?.status) whereClause.status = filters.status;
      if (filters?.customerId) whereClause.customerId = filters.customerId;

      const payments = await prisma.payment.findMany({
        where: whereClause,
        take: filters?.limit,
        skip: filters?.offset,
        orderBy: { createdAt: 'desc' }
      });
      return payments.map(PaymentMapper.toDomain);
    } catch (error) {
      logger.error('Error finding all payments:', error);
      throw error;
    }
  }

  async create(data: Omit<IPayment, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPayment> {
    try {
      const prismaData = PaymentMapper.toPrisma(data);
      const payment = await prisma.payment.create({ data: prismaData });
      return PaymentMapper.toDomain(payment);
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  async update(id: string, data: Partial<IPayment>): Promise<IPayment> {
    try {
      const prismaData = PaymentMapper.toPrisma(data);
      const payment = await prisma.payment.update({
        where: { id },
        data: prismaData
      });
      return PaymentMapper.toDomain(payment);
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

  async findByIdempotencyKey(idempotencyKey: string): Promise<IPayment | null> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { idempotencyKey }
      });
      return payment ? PaymentMapper.toDomain(payment) : null;
    } catch (error) {
      logger.error('Error finding payment by idempotency key:', error);
      throw error;
    }
  }

  async findFeesByPaymentId(paymentId: string): Promise<IFee[]> {
    try {
      const fees = await prisma.fee.findMany({
        where: { paymentId }
      });
      return fees.map(PaymentMapper.feeToDomain);
    } catch (error) {
      logger.error('Error getting fees for payment:', error);
      throw error;
    }
  }

  async createFee(fee: Omit<IFee, 'id' | 'createdAt'>): Promise<IFee> {
    try {
      const prismaData = PaymentMapper.feeToPrisma(fee);
      const createdFee = await prisma.fee.create({ data: prismaData });
      return PaymentMapper.feeToDomain(createdFee);
    } catch (error) {
      logger.error('Error creating fee:', error);
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
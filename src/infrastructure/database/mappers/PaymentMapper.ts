import { Payment as PrismaPayment, Fee as PrismaFee } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { IPayment, IFee } from '../../../domain/interfaces';
import { PaymentStatus, PaymentDirection } from '../../../domain/entities';

export class PaymentMapper {
  static toDomain(prismaPayment: PrismaPayment): IPayment {
    return {
      id: prismaPayment.id,
      idempotencyKey: prismaPayment.idempotencyKey,
      sourceAmount: prismaPayment.sourceAmount.toNumber(),
      sourceCurrency: prismaPayment.sourceCurrency,
      targetAmount: prismaPayment.targetAmount?.toNumber(),
      targetCurrency: prismaPayment.targetCurrency,
      exchangeRate: prismaPayment.exchangeRate?.toNumber(),
      status: prismaPayment.status as PaymentStatus,
      direction: prismaPayment.direction as PaymentDirection,
      externalReference: prismaPayment.externalReference || undefined,
      customerId: prismaPayment.customerId || undefined,
      customerEmail: prismaPayment.customerEmail || undefined,
      recipientName: prismaPayment.recipientName || undefined,
      recipientAccount: prismaPayment.recipientAccount || undefined,
      description: prismaPayment.description || undefined,
      createdAt: prismaPayment.createdAt,
      updatedAt: prismaPayment.updatedAt,
      completedAt: prismaPayment.completedAt || undefined,
    };
  }

  static toPrisma(domainPayment: Partial<IPayment>): any {
    const prismaData: any = {};
    
    if (domainPayment.id) prismaData.id = domainPayment.id;
    if (domainPayment.idempotencyKey) prismaData.idempotencyKey = domainPayment.idempotencyKey;
    if (domainPayment.sourceAmount !== undefined) prismaData.sourceAmount = new Decimal(domainPayment.sourceAmount);
    if (domainPayment.sourceCurrency) prismaData.sourceCurrency = domainPayment.sourceCurrency;
    if (domainPayment.targetAmount !== undefined) prismaData.targetAmount = domainPayment.targetAmount ? new Decimal(domainPayment.targetAmount) : null;
    if (domainPayment.targetCurrency) prismaData.targetCurrency = domainPayment.targetCurrency;
    if (domainPayment.exchangeRate !== undefined) prismaData.exchangeRate = domainPayment.exchangeRate ? new Decimal(domainPayment.exchangeRate) : null;
    if (domainPayment.status) prismaData.status = domainPayment.status;
    if (domainPayment.direction) prismaData.direction = domainPayment.direction;
    if (domainPayment.externalReference !== undefined) prismaData.externalReference = domainPayment.externalReference;
    if (domainPayment.customerId !== undefined) prismaData.customerId = domainPayment.customerId;
    if (domainPayment.customerEmail !== undefined) prismaData.customerEmail = domainPayment.customerEmail;
    if (domainPayment.recipientName !== undefined) prismaData.recipientName = domainPayment.recipientName;
    if (domainPayment.recipientAccount !== undefined) prismaData.recipientAccount = domainPayment.recipientAccount;
    if (domainPayment.description !== undefined) prismaData.description = domainPayment.description;
    if (domainPayment.completedAt !== undefined) prismaData.completedAt = domainPayment.completedAt;
    if (domainPayment.createdAt) prismaData.createdAt = domainPayment.createdAt;
    if (domainPayment.updatedAt) prismaData.updatedAt = domainPayment.updatedAt;

    return prismaData;
  }

  static feeToDomain(prismaFee: PrismaFee): IFee {
    return {
      id: prismaFee.id,
      paymentId: prismaFee.paymentId,
      type: prismaFee.type,
      amount: prismaFee.amount.toNumber(),
      currency: prismaFee.currency,
      rate: prismaFee.rate?.toNumber(),
      provider: prismaFee.provider || undefined,
      description: prismaFee.description || undefined,
      createdAt: prismaFee.createdAt,
    };
  }

  static feeToPrisma(domainFee: Omit<IFee, 'id' | 'createdAt'>): any {
    return {
      paymentId: domainFee.paymentId,
      type: domainFee.type,
      amount: new Decimal(domainFee.amount),
      currency: domainFee.currency,
      rate: domainFee.rate ? new Decimal(domainFee.rate) : null,
      provider: domainFee.provider || null,
      description: domainFee.description || null,
    };
  }
}
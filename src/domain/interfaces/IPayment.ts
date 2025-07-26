import { PaymentStatus, PaymentDirection, TransactionType } from '../entities';

// Core Domain Entities
export interface IPayment {
  id: string;
  idempotencyKey: string;
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount?: number;
  targetCurrency: string;
  exchangeRate?: number;
  status: PaymentStatus;
  direction?: PaymentDirection;
  customerId?: string;
  customerEmail?: string;
  recipientName?: string;
  recipientAccount?: string;
  description?: string;
  externalReference?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface IFee {
  id: string;
  paymentId: string;
  type: string; // 'processing', 'fx', 'network', 'destination'
  amount: number;
  currency: string;
  rate?: number;
  provider?: string;
  description?: string;
  createdAt: Date;
}

export interface ITransaction {
  id: string;
  paymentId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  balance?: number;
  providerId?: string;
  externalTxId?: string;
  description?: string;
  metadata?: any;
  createdAt: Date;
}

export interface IPaymentEvent {
  id: string;
  paymentId: string;
  eventType: string;
  oldStatus?: PaymentStatus;
  newStatus?: PaymentStatus;
  data?: any;
  source?: string;
  createdAt: Date;
}

// Repository Interfaces (Domain Contracts)
export interface IPaymentRepository {
  findById(id: string): Promise<IPayment | null>;
  findByIdempotencyKey(key: string): Promise<IPayment | null>;
  create(payment: Omit<IPayment, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPayment>;
  update(id: string, updates: Partial<IPayment>): Promise<IPayment>;
  findAll(filters?: PaymentFilters): Promise<IPayment[]>;
  findFeesByPaymentId(paymentId: string): Promise<IFee[]>;
  createFee(fee: Omit<IFee, 'id' | 'createdAt'>): Promise<IFee>;
}

export interface IFeeRepository {
  findByPaymentId(paymentId: string): Promise<IFee[]>;
  create(fee: Omit<IFee, 'id' | 'createdAt'>): Promise<IFee>;
  createMany(fees: Omit<IFee, 'id' | 'createdAt'>[]): Promise<IFee[]>;
}

export interface ITransactionRepository {
  findByPaymentId(paymentId: string): Promise<ITransaction[]>;
  create(transaction: Omit<ITransaction, 'id' | 'createdAt'>): Promise<ITransaction>;
}

// Service Interfaces (Domain Contracts)
export interface IPaymentService {
  createPayment(request: any): Promise<IPayment>;
  processPayment(paymentId: string): Promise<void>;
  getPayment(id: string): Promise<IPayment | null>;
  listPayments(filters?: PaymentFilters): Promise<IPayment[]>;
}

export interface IExchangeService {
  getRate(from: string, to: string): Promise<number>;
  convertAmount(amount: number, from: string, to: string): Promise<number>;
}

export interface IFeeCalculator {
  calculateFees(payment: IPayment): Promise<IFee[]>;
}

// Filter Types
export interface PaymentFilters {
  status?: PaymentStatus;
  customerId?: string;
  limit?: number;
  offset?: number;
  from?: Date;
  to?: Date;
}
// Domain Enums
export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND'
}

export enum TransactionType {
  PAYMENT = 'PAYMENT',
  FEE = 'FEE',
  REFUND = 'REFUND',
  CHARGEBACK = 'CHARGEBACK'
}

// Domain Value Objects
export interface Money {
  amount: number;
  currency: string;
}

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
}
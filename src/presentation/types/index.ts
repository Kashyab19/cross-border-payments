import { IPayment, IFee } from '../../domain/interfaces';

// API Request Types
export interface CreatePaymentRequest {
  idempotencyKey: string;
  sourceAmount: number;
  sourceCurrency: string;
  targetCurrency: string;
  customerId?: string;
  customerEmail?: string;
  recipientName?: string;
  recipientAccount?: string;
  description?: string;
  destinationCountry?: string;
  paymentMethod?: string;
}

export interface PaymentQuoteRequest {
  sourceAmount: number;
  sourceCurrency: string;
  targetCurrency: string;
  customerId?: string;
}

// API Response Types
export interface CreatePaymentResponse {
  success: boolean;
  data: {
    payment: IPayment;
    fees: IFee[];
    quote: PaymentQuote;
    summary: PaymentSummary;
  };
}

export interface PaymentQuote {
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRate: number;
  totalFees: number;
  netAmount: number;
  expiresAt: Date;
}

export interface PaymentSummary {
  paymentId: string;
  status: string;
  sourceAmount: number;
  targetAmount: number;
  totalFees: number;
  netAmount: number;
  exchangeRate: number;
}

export interface PaymentDetailsResponse {
  success: boolean;
  data: IPayment;
}

export interface PaymentListResponse {
  success: boolean;
  data: IPayment[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Generic API Response Wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

// Error Response Types (moved from domain)
export interface ErrorResponse {
  name: string;
  code: string;
  message: string;
  statusCode: number;
  timestamp: string;
}
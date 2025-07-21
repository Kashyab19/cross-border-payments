// Payment Status enum
export enum PaymentStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED'
  }
  
  // Basic payment interface (we'll expand this later)
  export interface Payment {
    id: string;
    idempotencyKey: string;
    sourceAmount: number;
    sourceCurrency: string;
    targetAmount?: number;
    targetCurrency: string;
    exchangeRate?: number;
    status: PaymentStatus;
    customerId?: string;
    customerEmail?: string;
    recipientName?: string;
    recipientAccount?: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
  }
  
  // API request/response types
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
  
  export interface CreatePaymentResponse {
    success: boolean;
    payment: Payment;
    fees: Fee[];
    quote: PaymentQuote;
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
  
  export interface Fee {
    id: string;
    type: string;
    amount: number;
    currency: string;
    description: string;
  }
  
  // Error response type
  export interface ErrorResponse {
    error: string;
    message: string;
    timestamp: string;
    details?: any;
  }
  
  // API response wrapper
  export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: string;
  }
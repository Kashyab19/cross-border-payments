import { PaymentStatus } from './index';

// Webhook event types that our system sends/receives
export enum WebhookEventType {
  PAYMENT_CREATED = 'payment.created',
  PAYMENT_PROCESSING = 'payment.processing', 
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_CANCELLED = 'payment.cancelled',
  
  // Provider-specific events
  ONRAMP_COMPLETED = 'onramp.completed',
  ONRAMP_FAILED = 'onramp.failed',
  OFFRAMP_COMPLETED = 'offramp.completed', 
  OFFRAMP_FAILED = 'offramp.failed'
}

// Base webhook event structure
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: any;
  source: string; // 'stripe', 'offramp_provider', 'internal'
}

// Payment-specific webhook events
export interface PaymentWebhookEvent extends WebhookEvent {
  data: {
    paymentId: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    customerId?: string;
    externalReference?: string;
    reason?: string; // For failures
    metadata?: Record<string, any>;
  };
}

// Provider webhook events
export interface ProviderWebhookEvent extends WebhookEvent {
  data: {
    paymentId: string;
    providerTransactionId: string;
    amount: number;
    currency: string;
    status: 'completed' | 'failed' | 'pending';
    reason?: string;
    processingTime?: number; // milliseconds
    fees?: {
      amount: number;
      currency: string;
      type: string;
    }[];
  };
}

// Webhook delivery tracking
export interface WebhookDelivery {
  id: string;
  paymentId: string;
  url: string;
  event: WebhookEventType;
  payload: WebhookEvent;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: Date;
  lastAttempt?: Date;
  lastStatus?: number; // HTTP status code
  lastResponse?: string;
  delivered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Webhook signature for security
export interface WebhookSignature {
  timestamp: string;
  signature: string;
  algorithm: 'sha256'; // We'll use HMAC-SHA256
}
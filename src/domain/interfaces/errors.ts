export abstract class PaymentError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: new Date().toISOString()
    };
  }
}

export class PaymentNotFoundError extends PaymentError {
  readonly code = 'PAYMENT_NOT_FOUND';
  readonly statusCode = 404;
  
  constructor(id: string) {
    super(`Payment with ID ${id} not found`);
  }
}

export class DuplicatePaymentError extends PaymentError {
  readonly code = 'DUPLICATE_PAYMENT';
  readonly statusCode = 409;
  
  constructor(idempotencyKey: string) {
    super(`Payment with idempotency key ${idempotencyKey} already exists`);
  }
}

export class InvalidCurrencyError extends PaymentError {
  readonly code = 'INVALID_CURRENCY';
  readonly statusCode = 400;
  
  constructor(currency: string) {
    super(`Invalid currency: ${currency}`);
  }
}

export class InsufficientFundsError extends PaymentError {
  readonly code = 'INSUFFICIENT_FUNDS';
  readonly statusCode = 400;
  
  constructor(required: number, available: number) {
    super(`Insufficient funds. Required: ${required}, Available: ${available}`);
  }
}

export class ExchangeRateError extends PaymentError {
  readonly code = 'EXCHANGE_RATE_ERROR';
  readonly statusCode = 500;
  
  constructor(from: string, to: string, message?: string) {
    super(message || `Failed to get exchange rate from ${from} to ${to}`);
  }
}

export class PaymentProcessingError extends PaymentError {
  readonly code = 'PAYMENT_PROCESSING_ERROR';
  readonly statusCode = 500;
  
  constructor(message: string) {
    super(`Payment processing failed: ${message}`);
  }
}

export class ValidationError extends PaymentError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  
  constructor(field: string, message: string) {
    super(`Validation failed for ${field}: ${message}`);
  }
}

export class WebhookError extends PaymentError {
  readonly code = 'WEBHOOK_ERROR';
  readonly statusCode = 400;
  
  constructor(message: string) {
    super(`Webhook error: ${message}`);
  }
}

export class ProviderError extends PaymentError {
  readonly code = 'PROVIDER_ERROR';
  readonly statusCode = 502;
  
  constructor(provider: string, message: string) {
    super(`Provider ${provider} error: ${message}`);
  }
}
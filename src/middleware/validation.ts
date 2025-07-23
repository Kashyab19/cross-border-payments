import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Validation schemas
export const createPaymentSchema = z.object({
  idempotencyKey: z.string().min(1, 'Idempotency key is required').max(255, 'Idempotency key too long'),
  sourceAmount: z.number().positive('Source amount must be positive').max(1000000, 'Amount too large'),
  sourceCurrency: z.literal('USD'),
  targetCurrency: z.string().length(3, 'Currency must be 3 characters').regex(/^[A-Z]{3}$/, 'Invalid currency format'),
  customerId: z.string().optional(),
  customerEmail: z.string().email('Invalid email format').optional(),
  recipientName: z.string().min(1, 'Recipient name is required').max(255, 'Name too long').optional(),
  recipientAccount: z.string().max(255, 'Account info too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  destinationCountry: z.string().length(2, 'Country code must be 2 characters').regex(/^[A-Z]{2}$/, 'Invalid country code').optional(),
  paymentMethod: z.string().optional()
}).refine((data) => data.sourceCurrency !== data.targetCurrency, {
  message: 'Source and target currencies must be different',
  path: ['targetCurrency']
});

export const getPaymentQuoteSchema = z.object({
  sourceAmount: z.number().positive('Source amount must be positive').max(1000000, 'Amount too large'),
  sourceCurrency: z.literal('USD'),
  targetCurrency: z.string().length(3, 'Currency must be 3 characters').regex(/^[A-Z]{3}$/, 'Invalid currency format'),
  destinationCountry: z.string().length(2, 'Country code must be 2 characters').regex(/^[A-Z]{2}$/, 'Invalid country code').optional(),
  paymentMethod: z.string().optional()
}).refine((data) => data.sourceCurrency !== data.targetCurrency, {
  message: 'Source and target currencies must be different',
  path: ['targetCurrency']
});

// Generic validation middleware factory
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validatedData = schema.parse(req.body);
      
      // Attach validated data to request
      (req as any).validatedBody = validatedData;
      
      logger.debug('Request validation successful', {
        endpoint: req.path,
        method: req.method
      });
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        logger.warn('Request validation failed', {
          endpoint: req.path,
          method: req.method,
          errors
        });

        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Request data is invalid',
          details: errors,
          timestamp: new Date().toISOString()
        });
      }

      // Unexpected validation error
      logger.error('Unexpected validation error', error);
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred during validation',
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Specific validation middlewares
export const validateCreatePayment = validateRequest(createPaymentSchema);
export const validateGetQuote = validateRequest(getPaymentQuoteSchema);

// Additional validation helpers
export function isValidCurrency(currency: string): boolean {
  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'NGN', 'PHP', 'CAD', 'AUD', 'JPY'];
  return supportedCurrencies.includes(currency);
}

export function isValidCountryCode(code: string): boolean {
  const supportedCountries = ['US', 'GB', 'EU', 'IN', 'NG', 'PH', 'CA', 'AU', 'JP'];
  return supportedCountries.includes(code);
}

// Middleware to check supported currencies
export function validateSupportedCurrencies(req: Request, res: Response, next: NextFunction) {
  const { sourceCurrency, targetCurrency } = (req as any).validatedBody || req.body;

  if (!isValidCurrency(sourceCurrency)) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported Currency',
      message: `Source currency ${sourceCurrency} is not supported`,
      timestamp: new Date().toISOString()
    });
  }

  if (!isValidCurrency(targetCurrency)) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported Currency',
      message: `Target currency ${targetCurrency} is not supported`,
      timestamp: new Date().toISOString()
    });
  }

  next();
}
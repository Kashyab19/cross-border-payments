import express from 'express';
import { PaymentService } from '../services/PaymentService';
import { 
  validateCreatePayment, 
  validateGetQuote, 
  validateSupportedCurrencies 
} from '../middleware/validation';
import { logger } from '../utils/logger';
import { CreatePaymentRequest, ApiResponse } from '../types';

const router = express.Router();
const paymentService = new PaymentService();

// POST /api/v1/payments/quote - Get payment quote
router.post('/quote', 
  validateGetQuote,
  validateSupportedCurrencies,
  async (req: express.Request, res: express.Response) => {
    try {
      const quoteRequest = (req as any).validatedBody;
      
      const quote = await paymentService.createPaymentQuote(quoteRequest);
      
      const response: ApiResponse = {
        success: true,
        data: {
          quote,
          breakdown: `$${quote.sourceAmount} USD → $${quote.targetAmount} ${quote.targetCurrency} (Rate: ${quote.exchangeRate}, Fees: $${quote.totalFees})`
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(response);

    } catch (error) {
      logger.error('Quote request failed', { error: error instanceof Error ? error.message : error });
      
      const response: ApiResponse = {
        success: false,
        error: 'Quote Failed',
        message: error instanceof Error ? error.message : 'Unable to generate quote',
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

// POST /api/v1/payments - Create payment
router.post('/',
  validateCreatePayment,
  validateSupportedCurrencies,
  async (req: express.Request, res: express.Response) => {
    try {
      const paymentRequest: CreatePaymentRequest = (req as any).validatedBody;
      
      const result = await paymentService.createPayment(paymentRequest);
      
      const response: ApiResponse = {
        success: true,
        data: {
          payment: result.payment,
          quote: result.quote,
          fees: result.fees,
          summary: {
            paymentId: result.payment.id,
            status: result.payment.status,
            sourceAmount: result.payment.sourceAmount,
            targetAmount: result.payment.targetAmount,
            totalFees: result.quote.totalFees,
            netAmount: result.quote.netAmount,
            exchangeRate: result.quote.exchangeRate
          }
        },
        message: 'Payment created successfully',
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);

    } catch (error) {
      logger.error('Payment creation failed', { error: error instanceof Error ? error.message : error });
      
      const response: ApiResponse = {
        success: false,
        error: 'Payment Creation Failed',
        message: error instanceof Error ? error.message : 'Unable to create payment',
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

// GET /api/v1/payments/:id - Get payment by ID
router.get('/:id', async (req: express.Request, res: express.Response) => {
  try {
    const paymentId = req.params.id;
    
    if (!paymentId || paymentId.length !== 36) { // UUID length check
      return res.status(400).json({
        success: false,
        error: 'Invalid Payment ID',
        message: 'Payment ID must be a valid UUID',
        timestamp: new Date().toISOString()
      });
    }

    const result = await paymentService.getPayment(paymentId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Payment Not Found',
        message: `Payment with ID ${paymentId} not found`,
        timestamp: new Date().toISOString()
      });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        payment: result.payment,
        fees: result.fees
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to get payment', { 
      paymentId: req.params.id,
      error: error instanceof Error ? error.message : error 
    });
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal Server Error',
      message: 'Unable to retrieve payment',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

// GET /api/v1/payments - Get all payments (for debugging)
router.get('/', async (req: express.Request, res: express.Response) => {
  try {
    const payments = await paymentService.getAllPayments();
    
    const response: ApiResponse = {
      success: true,
      data: {
        payments,
        count: payments.length
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to get payments', { error: error instanceof Error ? error.message : error });
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal Server Error',
      message: 'Unable to retrieve payments',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

// GET /api/v1/payments/stats - Get service stats
router.get('/stats', async (req: express.Request, res: express.Response) => {
  try {
    const stats = await paymentService.getStats();
    
    const response: ApiResponse = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to get stats', { error: error instanceof Error ? error.message : error });
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal Server Error',
      message: 'Unable to retrieve stats',
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

export default router;
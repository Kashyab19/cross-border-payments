import { Request, Response, NextFunction } from 'express';
import { webhookSecurity } from '../../infrastructure/crypto';
import { logger } from '../../infrastructure/logger';

// Extend Express Request to include webhook validation
interface WebhookRequest extends Request {
  webhookVerified?: boolean;
  webhookTimestamp?: string;
  rawBody?: string;
}

// Middleware to capture raw body for webhook signature verification
export function captureRawBody(req: WebhookRequest, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/webhooks/')) {
    let rawBody = '';
    
    req.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString();
    });
    
    req.on('end', () => {
      req.rawBody = rawBody;
      
      // Parse JSON body manually since we captured raw
      try {
        req.body = JSON.parse(rawBody);
      } catch (error) {
        logger.warn('Failed to parse webhook JSON body', { 
          path: req.path,
          rawBody: rawBody.substring(0, 200) 
        });
      }
      
      next();
    });
  } else {
    next();
  }
}

// Stripe webhook signature verification
export function verifyStripeWebhook(secret: string) {
  return async (req: WebhookRequest, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const signatureHeader = req.headers['stripe-signature'] as string;
      const rawBody = req.rawBody;

      if (!signatureHeader) {
        logger.warn('Missing Stripe signature header', { path: req.path });
        return res.status(400).json({
          error: 'Missing signature',
          message: 'Stripe-Signature header required'
        });
      }

      if (!rawBody) {
        logger.warn('Missing raw body for signature verification', { path: req.path });
        return res.status(400).json({
          error: 'Missing body',
          message: 'Request body required for verification'
        });
      }

      // Parse Stripe signature header
      const parsedSignature = webhookSecurity.parseStripeSignature(signatureHeader);

      if (!parsedSignature.timestamp) {
        logger.warn('Missing timestamp in Stripe signature', { path: req.path });
        return res.status(400).json({
          error: 'Invalid signature format',
          message: 'Timestamp missing in signature header'
        });
      }

      // Verify signature
      const verification = webhookSecurity.verifySignature(
        rawBody,
        parsedSignature.signatures[0], // Use first signature
        secret,
        parsedSignature.timestamp,
        300 // 5 minutes tolerance
      );

      if (!verification.isValid) {
        logger.warn('Stripe webhook signature verification failed', {
          path: req.path,
          error: verification.error,
          timestamp: parsedSignature.timestamp
        });
        
        return res.status(401).json({
          error: 'Invalid signature',
          message: verification.error || 'Signature verification failed'
        });
      }

      // Mark request as verified
      req.webhookVerified = true;
      req.webhookTimestamp = parsedSignature.timestamp;

      logger.debug('Stripe webhook signature verified', {
        path: req.path,
        timestamp: parsedSignature.timestamp
      });

      next();

    } catch (error) {
      logger.error('Stripe webhook verification error', {
        path: req.path,
        error: error instanceof Error ? error.message : error
      });

      return res.status(500).json({
        error: 'Verification failed',
        message: 'Internal signature verification error'
      });
    }
  };
}

// Generic webhook signature verification
export function verifyWebhookSignature(secret: string) {
  return async (req: WebhookRequest, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const timestamp = req.headers['x-webhook-timestamp'] as string;
      const signature = req.headers['x-webhook-signature'] as string;
      const rawBody = req.rawBody;

      if (!timestamp || !signature) {
        logger.warn('Missing webhook security headers', { 
          path: req.path,
          hasTimestamp: !!timestamp,
          hasSignature: !!signature
        });
        
        return res.status(400).json({
          error: 'Missing headers',
          message: 'X-Webhook-Timestamp and X-Webhook-Signature headers required'
        });
      }

      if (!rawBody) {
        return res.status(400).json({
          error: 'Missing body',
          message: 'Request body required for verification'
        });
      }

      // Verify signature
      const verification = webhookSecurity.verifySignature(
        rawBody,
        signature,
        secret,
        timestamp,
        300 // 5 minutes tolerance
      );

      if (!verification.isValid) {
        logger.warn('Webhook signature verification failed', {
          path: req.path,
          error: verification.error,
          timestamp
        });
        
        return res.status(401).json({
          error: 'Invalid signature',
          message: verification.error || 'Signature verification failed'
        });
      }

      req.webhookVerified = true;
      req.webhookTimestamp = timestamp;

      logger.debug('Webhook signature verified', {
        path: req.path,
        timestamp
      });

      next();

    } catch (error) {
      logger.error('Webhook verification error', {
        path: req.path,
        error: error instanceof Error ? error.message : error
      });

      return res.status(500).json({
        error: 'Verification failed',
        message: 'Internal signature verification error'
      });
    }
  };
}

// Rate limiting for webhook endpoints
export function webhookRateLimit() {
  const attempts = new Map<string, { count: number; resetTime: number }>();
  const maxAttempts = 100; // Max attempts per IP per hour
  const windowMs = 60 * 60 * 1000; // 1 hour

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    for (const [ip, data] of attempts.entries()) {
      if (now > data.resetTime) {
        attempts.delete(ip);
      }
    }

    // Check current IP
    const current = attempts.get(clientIp);
    
    if (!current) {
      // First request from this IP
      attempts.set(clientIp, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
    } else if (current.count >= maxAttempts) {
      // Rate limit exceeded
      logger.warn('Webhook rate limit exceeded', {
        clientIp,
        attempts: current.count,
        path: req.path
      });

      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many webhook requests from this IP',
        retryAfter: Math.ceil((current.resetTime - now) / 1000)
      });
    } else {
      // Increment counter
      current.count++;
      next();
    }
  };
}

// Webhook request logging
export function logWebhookRequest() {
  return (req: WebhookRequest, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Log request
    logger.info('Webhook request received', {
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      clientIp: req.ip,
      verified: req.webhookVerified || false
    });

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info('Webhook response sent', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        verified: req.webhookVerified || false
      });
    });

    next();
  };
}
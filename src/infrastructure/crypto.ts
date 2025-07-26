import crypto from 'crypto';
import { logger } from './logger';

// Webhook signature utilities for security
export class WebhookSecurity {
  private readonly algorithm = 'sha256';
  
  // Generate HMAC signature for outgoing webhooks
  generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac(this.algorithm, secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  // Verify incoming webhook signature (Stripe-style)
  verifySignature(
    payload: string,
    signature: string,
    secret: string,
    timestamp: string,
    toleranceSeconds: number = 300 // 5 minutes
  ): { isValid: boolean; error?: string } {
    try {
      // Check timestamp freshness (prevent replay attacks)
      const currentTime = Math.floor(Date.now() / 1000);
      const webhookTime = parseInt(timestamp);
      
      if (Math.abs(currentTime - webhookTime) > toleranceSeconds) {
        return {
          isValid: false,
          error: `Webhook timestamp too old. Current: ${currentTime}, Webhook: ${webhookTime}`
        };
      }

      // Create signed payload (timestamp + payload)
      const signedPayload = `${timestamp}.${payload}`;
      
      // Generate expected signature
      const expectedSignature = this.generateSignature(signedPayload, secret);
      
      // Compare signatures using constant-time comparison
      const isValid = this.constantTimeCompare(signature, expectedSignature);
      
      if (!isValid) {
        return {
          isValid: false,
          error: 'Signature verification failed'
        };
      }

      return { isValid: true };

    } catch (error) {
      logger.error('Signature verification error', {
        error: error instanceof Error ? error.message : error
      });
      
      return {
        isValid: false,
        error: 'Signature verification error'
      };
    }
  }

  // Constant-time string comparison (prevents timing attacks)
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // Parse Stripe-style signature header
  parseStripeSignature(signatureHeader: string): {
    timestamp?: string;
    signatures: string[];
  } {
    const elements = signatureHeader.split(',');
    const parsedHeader: { timestamp?: string; signatures: string[] } = {
      signatures: []
    };

    for (const element of elements) {
      const [key, value] = element.split('=');
      
      if (key === 't') {
        parsedHeader.timestamp = value;
      } else if (key === 'v1') {
        parsedHeader.signatures.push(value);
      }
    }

    return parsedHeader;
  }

  // Generate webhook headers for outgoing requests
  generateWebhookHeaders(payload: string, secret: string): {
    'X-Webhook-Timestamp': string;
    'X-Webhook-Signature': string;
    'Content-Type': string;
    'User-Agent': string;
  } {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const signature = this.generateSignature(signedPayload, secret);

    return {
      'X-Webhook-Timestamp': timestamp,
      'X-Webhook-Signature': signature,
      'Content-Type': 'application/json',
      'User-Agent': 'PaymentAPI-Webhooks/1.0'
    };
  }

  // Generate random webhook secret
  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Validate webhook URL
  isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Only allow HTTPS in production
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        return false;
      }
      
      // Allow HTTP for development/testing
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      // Block internal/private IPs in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = parsed.hostname;
        
        // Block localhost, private IPs, etc.
        if (
          hostname === 'localhost' ||
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
        ) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const webhookSecurity = new WebhookSecurity();
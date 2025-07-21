import { Payment, Fee } from '../types';

// Simple in-memory storage before we add database
export class InMemoryStorage {
  private payments: Map<string, Payment> = new Map();
  private fees: Map<string, Fee[]> = new Map(); // paymentId -> fees[]
  private idempotencyKeys: Map<string, string> = new Map(); // key -> paymentId

  // Payment operations
  async savePayment(payment: Payment): Promise<void> {
    this.payments.set(payment.id, { ...payment });
    
    // Track idempotency key
    this.idempotencyKeys.set(payment.idempotencyKey, payment.id);
  }

  async getPayment(id: string): Promise<Payment | null> {
    const payment = this.payments.get(id);
    return payment ? { ...payment } : null;
  }

  async getPaymentByIdempotencyKey(key: string): Promise<Payment | null> {
    const paymentId = this.idempotencyKeys.get(key);
    return paymentId ? this.getPayment(paymentId) : null;
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const existing = this.payments.get(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    this.payments.set(id, updated);
    return { ...updated };
  }

  async getAllPayments(): Promise<Payment[]> {
    return Array.from(this.payments.values());
  }

  // Fee operations
  async saveFeesForPayment(paymentId: string, fees: Fee[]): Promise<void> {
    this.fees.set(paymentId, [...fees]);
  }

  async getFeesForPayment(paymentId: string): Promise<Fee[]> {
    return [...(this.fees.get(paymentId) || [])];
  }

  // Utility methods
  async clear(): Promise<void> {
    this.payments.clear();
    this.fees.clear();
    this.idempotencyKeys.clear();
  }

  async getStats(): Promise<{
    totalPayments: number;
    pendingPayments: number;
    completedPayments: number;
  }> {
    const payments = Array.from(this.payments.values());
    
    return {
      totalPayments: payments.length,
      pendingPayments: payments.filter(p => p.status === 'PENDING').length,
      completedPayments: payments.filter(p => p.status === 'COMPLETED').length
    };
  }
}

// Singleton instance for now
export const storage = new InMemoryStorage();
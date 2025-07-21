import { Fee } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface FeeCalculationRequest {
  sourceAmount: number;
  sourceCurrency: string;
  targetCurrency: string;
  destinationCountry?: string;
}

export interface FeeCalculationResult {
  fees: Fee[];
  totalFeeAmount: number;
  breakdown: string[];
}

export class FeeCalculator {
  // Fee configuration (in a real app, this would come from database/config)
  private readonly config = {
    // Base processing fee: $2.99 + 2.9%
    baseFee: {
      fixed: 2.99,
      percentage: 0.029
    },
    
    // FX fees by currency pair
    fxFees: {
      'USD_EUR': 0.008, // 0.8%
      'USD_GBP': 0.008, // 0.8%
      'USD_INR': 0.012, // 1.2%
      'USD_NGN': 0.020, // 2.0%
      'USD_PHP': 0.015  // 1.5%
    } as Record<string, number>,
    
    // Destination-based fees
    destinationFees: {
      'GB': 0.005, // UK: 0.5%
      'EU': 0.007, // EU: 0.7%
      'IN': 0.015, // India: 1.5%
      'NG': 0.025, // Nigeria: 2.5%
      'PH': 0.018  // Philippines: 1.8%
    } as Record<string, number>
  };

  async calculateFees(request: FeeCalculationRequest): Promise<FeeCalculationResult> {
    const fees: Fee[] = [];
    const breakdown: string[] = [];
    let totalFeeAmount = 0;

    // 1. Base processing fee
    const processingFee = this.calculateProcessingFee(request.sourceAmount);
    if (processingFee.amount > 0) {
      fees.push(processingFee);
      totalFeeAmount += processingFee.amount;
      breakdown.push(`Processing: $${processingFee.amount.toFixed(2)}`);
    }

    // 2. Foreign exchange fee (if cross-currency)
    if (request.sourceCurrency !== request.targetCurrency) {
      const fxFee = this.calculateFxFee(request);
      if (fxFee.amount > 0) {
        fees.push(fxFee);
        totalFeeAmount += fxFee.amount;
        breakdown.push(`FX (${request.sourceCurrency}→${request.targetCurrency}): $${fxFee.amount.toFixed(2)}`);
      }
    }

    // 3. Destination-based fee
    if (request.destinationCountry) {
      const destFee = this.calculateDestinationFee(request);
      if (destFee.amount > 0) {
        fees.push(destFee);
        totalFeeAmount += destFee.amount;
        breakdown.push(`Destination (${request.destinationCountry}): $${destFee.amount.toFixed(2)}`);
      }
    }

    return {
      fees,
      totalFeeAmount: Number(totalFeeAmount.toFixed(2)),
      breakdown
    };
  }

  private calculateProcessingFee(sourceAmount: number): Fee {
    const fixedFee = this.config.baseFee.fixed;
    const percentageFee = sourceAmount * this.config.baseFee.percentage;
    const totalAmount = fixedFee + percentageFee;

    return {
      id: uuidv4(),
      type: 'processing',
      amount: Number(totalAmount.toFixed(2)),
      currency: 'USD',
      description: `Processing fee: $${fixedFee.toFixed(2)} + ${(this.config.baseFee.percentage * 100).toFixed(1)}%`
    };
  }

  private calculateFxFee(request: FeeCalculationRequest): Fee {
    const pairKey = `${request.sourceCurrency}_${request.targetCurrency}`;
    const fxRate = this.config.fxFees[pairKey] || 0.01; // Default 1%
    const feeAmount = request.sourceAmount * fxRate;

    return {
      id: uuidv4(),
      type: 'fx',
      amount: Number(feeAmount.toFixed(2)),
      currency: 'USD',
      description: `Foreign exchange fee: ${(fxRate * 100).toFixed(1)}%`
    };
  }

  private calculateDestinationFee(request: FeeCalculationRequest): Fee {
    const destRate = this.config.destinationFees[request.destinationCountry!] || 0;
    const feeAmount = request.sourceAmount * destRate;

    return {
      id: uuidv4(),
      type: 'destination',
      amount: Number(feeAmount.toFixed(2)),
      currency: 'USD',
      description: `Destination fee (${request.destinationCountry}): ${(destRate * 100).toFixed(1)}%`
    };
  }

  // Get a quote without creating fees
  async getQuote(request: FeeCalculationRequest): Promise<{
    totalFees: number;
    breakdown: string[];
  }> {
    const result = await this.calculateFees(request);
    return {
      totalFees: result.totalFeeAmount,
      breakdown: result.breakdown
    };
  }
}
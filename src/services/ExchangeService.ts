// Mock exchange rate service (in production, this would call real APIs)
export class ExchangeService {
    // Mock exchange rates (USD as base currency)
    private readonly mockRates: Record<string, number> = {
      'USD': 1.0,
      'EUR': 0.85,
      'GBP': 0.73,
      'INR': 83.12,
      'NGN': 907.50,
      'PHP': 56.25,
      'CAD': 1.35,
      'AUD': 1.52,
      'JPY': 149.80
    };
  
    async getExchangeRate(from: string, to: string): Promise<number> {
      // Same currency
      if (from === to) {
        return 1.0;
      }
  
      // We only support USD as base currency for now
      if (from !== 'USD') {
        throw new Error(`Exchange rate from ${from} not supported. Only USD as source currency is currently supported.`);
      }
  
      const rate = this.mockRates[to];
      if (!rate) {
        throw new Error(`Exchange rate for ${from} to ${to} not available`);
      }
  
      // Add some randomness to simulate real market fluctuations (+/- 2%)
      const fluctuation = (Math.random() - 0.5) * 0.04; // -2% to +2%
      const adjustedRate = rate * (1 + fluctuation);
  
      return Number(adjustedRate.toFixed(6));
    }
  
    async getSupportedCurrencies(): Promise<string[]> {
      return Object.keys(this.mockRates);
    }
  
    async getRateWithTimestamp(from: string, to: string): Promise<{
      rate: number;
      timestamp: Date;
      source: string;
    }> {
      const rate = await this.getExchangeRate(from, to);
      
      return {
        rate,
        timestamp: new Date(),
        source: 'mock_exchange_service'
      };
    }
  
    // Simulate rate caching (rates expire after 5 minutes)
    private rateCache: Map<string, { rate: number; timestamp: Date }> = new Map();
    private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes
  
    async getCachedRate(from: string, to: string): Promise<number> {
      const cacheKey = `${from}_${to}`;
      const cached = this.rateCache.get(cacheKey);
  
      if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTimeout) {
        return cached.rate;
      }
  
      // Get fresh rate
      const rate = await this.getExchangeRate(from, to);
      
      // Cache it
      this.rateCache.set(cacheKey, {
        rate,
        timestamp: new Date()
      });
  
      return rate;
    }
  }
# Cross-Border Payment API

A production-ready REST API demonstrating cross-border payment processing with USD onramp and multi-currency payout capabilities.

## 🔗 Link to a mock UI: 
`Note: This is not connected to the mock API in the repo since its not deployed but uses a simulated mock-mock API (double mock, yep!)`

https://cross-border-payments.replit.app/
: 
## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd cross-border-payment-api
npm install

# 2. Start infrastructure (PostgreSQL + Redis)
Ensure that your docker is installed and the daemon is running
docker-compose -f docker/docker-compose.yml up postgres redis -d

# 3. Set up database
cp .env.example .env  (Do not forget to put your own password)
npx prisma generate
npx prisma migrate dev --name init

# 4. Start API
npm run dev

# 5. Test it works
curl http://localhost:3000/health
```



## 🏗️ Architecture

### Domain-Driven Design Structure

```
src/
├── domain/                    # Core business logic
│   ├── entities/              # Domain entities and enums
│   └── interfaces/             # Domain interfaces and errors
├── application/               # Application layer
│   ├── services/              # Business services
│   └── use-cases/             # Use case implementations
├── infrastructure/            # External concerns
│   ├── database/              # Database and repositories
│   ├── storage/               # Data persistence
│   ├── cache/                 # Redis caching
│   ├── providers/             # External service providers
│   └── [crypto, logger, migrations]
└── presentation/              # API layer
    ├── routes/                # REST API routes
    └── middleware/            # HTTP middleware
```

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────── ┐
│   Client App    │    │   Admin Panel   │    │  Mocked External APIs  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬──────────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Payment API (Domain-Driven)                    │
│                                                                 │
│  Presentation Layer    Application Layer    Infrastructure      │
│  ┌─────────────┐     ┌─────────────────┐   ┌─────────────────┐  │
│  │   Routes    │────▶│    Services     │──▶│   Repositories  │  │
│  │- payments   │     │- PaymentService │   │- PaymentRepo    │  │
│  │- admin      │     │- PaymentProc.   │   │- DatabaseStore  │  │
│  │- webhooks   │     │- WebhookService │   │- CacheService   │  │
│  │             │     │- ExchangeSvc    │   │- Providers      │  │
│  │ Middleware  │     │- FeeCalculator  │   │                 │  │
│  │- validation │     └─────────────────┘   └─────────────────┘  │
│  │- auth       │            │                       │           │
│  └─────────────┘            ▼                       ▼           │
│                    Domain Interfaces        Domain Entities     │
│                    ┌─────────────────┐    ┌─────────────────┐   │
│                    │- IPayment       │    │- PaymentStatus  │   │
│                    │- IPaymentRepo   │    │- Payment        │   │
│                    │- Custom Errors  │    │- Fee            │   
│                    └─────────────────┘    └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌─────────┐ ┌──────────┐
    │PostgreSQL│ │  Redis  │ │ Providers│ (Note: I mocked the whole thing)
    │ Database │ │  Cache  │ │ - Stripe │
    └──────────┘ └─────────┘ │ - Offramp│
                             └──────────┘
```

### Payment Processing Flow

```
1. CREATE      → Payment created (PENDING status)
2. QUOTE       → Fee calculation + exchange rate lookup
3. PROCESS     → Admin triggers processing via /admin/payments/:id/process
   ├─ USD ONRAMP    → Stripe collects USD from customer
   ├─ FX CONVERSION → Convert USD to target currency (EUR/GBP)
   ├─ LOCAL TRANSFER → Send target currency to recipient
   └─ COMPLETION    → Update status to COMPLETED
4. WEBHOOK     → Send notifications to customer
```

**Payment Status States:**
- `PENDING` → Created, awaiting processing
- `PROCESSING` → USD collection and conversion in progress  
- `COMPLETED` → Successfully delivered to recipient
- `FAILED` → Processing failed at any step
- `CANCELLED` → Cancelled by user/admin

**Processing Example Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "pay_abc123...",
    "finalStatus": "COMPLETED",
    "processingTime": 2500,
    "steps": [
      {
        "step": "usd_collection",
        "status": "completed",
        "duration": 1200
      },
      {
        "step": "currency_conversion", 
        "status": "completed",
        "duration": 300
      },
      {
        "step": "local_transfer",
        "status": "completed", 
        "duration": 1000
      }
    ]
  }
}
```



## 📡 API Endpoints

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/quote` | Get payment quote with fees |
| `POST` | `/api/v1/payments` | Create new payment |
| `GET` | `/api/v1/payments/:id` | Get payment details |
| `GET` | `/api/v1/payments` | List all payments |
| `GET` | `/api/v1/payments/stats` | Get payment statistics |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/payments/:id/process` | Trigger payment processing |
| `GET` | `/admin/payments/:id/details` | Detailed payment view |
| `GET` | `/admin/health` | System health check |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/stripe` | Stripe webhook endpoint |
| `POST` | `/webhooks/offramp` | Offramp provider webhooks |

## 🧪 Testing the Complete Flow

```bash
# 1. Get a quote first
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAmount": 1000,
    "sourceCurrency": "USD",
    "targetCurrency": "EUR"
  }'

# 2. Create a payment
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "test-001",
    "sourceAmount": 1000,
    "sourceCurrency": "USD",
    "targetCurrency": "EUR",
    "customerId": "customer-123",
    "customerEmail": "test@example.com",
    "recipientName": "John Doe",
    "recipientAccount": "FR1420041010050500013M02606",
    "description": "Test payment"
  }'

# 3. Process the payment (use the ID from step 2)
curl -X POST http://localhost:3000/admin/payments/{PAYMENT_ID}/process \
  -H "Content-Type: application/json"

# 4. Check payment status
curl -X GET http://localhost:3000/api/v1/payments/{PAYMENT_ID}

# 5. View all payments
curl -X GET http://localhost:3000/api/v1/payments
```

## 🚀 **Complete Automated Testing**

Use the provided test script for full end-to-end testing under `test_scripts` folder


**Or create your own test:**

```bash
#!/bin/bash
echo "🔄 Complete Payment Flow Test"

# 1. Health Check
curl -X GET http://localhost:3000/health

# 2. Get Quote
curl -X POST http://localhost:3000/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAmount": 1000,
    "sourceCurrency": "USD",
    "targetCurrency": "EUR"
  }'

# 3. Create Payment
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "auto-test-'$(date +%s)'",
    "sourceAmount": 1000,
    "sourceCurrency": "USD",
    "targetCurrency": "EUR",
    "customerId": "test_customer",
    "customerEmail": "test@example.com",
    "recipientName": "Test User",
    "recipientAccount": "FR1420041010050500013M02606",
    "description": "Automated test payment"
  }')

# 4. Extract Payment ID and Process
if command -v jq &> /dev/null; then
    PAYMENT_ID=$(echo "$RESPONSE" | jq -r '.data.payment.id')
    
    # Process the payment
    curl -X POST "http://localhost:3000/admin/payments/$PAYMENT_ID/process" \
      -H "Content-Type: application/json"
    
    # Check final status
    curl -X GET "http://localhost:3000/api/v1/payments/$PAYMENT_ID"
fi
```


## 📊 Database Schema

### Key Models

- **Payment**: Core payment entity with Decimal precision for amounts
- **Fee**: Associated fees with proper currency handling
- **Transaction**: Ledger entries for audit trail
- **PaymentEvent**: Event sourcing for status changes
- **ExchangeRate**: Historical rate tracking

### Type Safety

- **Prisma Decimal ↔ Domain number**: Automatic conversion via mappers
- **Strong typing**: All interfaces properly typed
- **Validation**: Input validation with custom error types

## 🔍 Development Tools

```bash
# Database visualization
npx prisma studio

# Type checking
npm run build

# Development with hot reload
npm run dev

# View logs
docker-compose -f docker/docker-compose.yml logs -f
```


**❌ Server won't start:**
```bash
# Check if ports are available
lsof -i :3000  # API port
lsof -i :5432  # PostgreSQL port  
lsof -i :6379  # Redis port

# Start infrastructure
docker-compose -f docker/docker-compose.yml up -d
```

**❌ Database connection issues:**
```bash
# Reset database
npx prisma migrate reset
npx prisma generate
npx prisma migrate deploy

# Visualize the Database
npx prisma studio
```

**❌ Payment processing fails:**
```bash
# Check payment status first
curl -X GET http://localhost:3000/api/v1/payments/{PAYMENT_ID}

# Ensure payment is in PENDING status before processing
# Only PENDING payments can be processed
```

### **Testing & Debugging**

```bash
# Run full test suite
/test_scripts/.process_payments.sh

# Check server logs for detailed errors
npm run dev  # Shows real-time logs

# Health check all services
curl http://localhost:3000/health
curl http://localhost:3000/admin/health
```

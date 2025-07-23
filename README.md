# Cross-Border Payment API

A production-ready REST API demonstrating cross-border payment processing with USD onramp and multi-currency payout capabilities.

## 🔗 Link to a mock UI: 
`Note: This is not connected to the mock API in the repo since its not deployed but uses a simulated mock-mock API (double mock, yep!)`

https://cross-border-payments.replit.app/
: 

## 🎯 What This Demonstrates

This API showcases **senior-level engineering patterns** commonly used in fintech:

- ✅ **Complex Payment Orchestration**: Multi-step async processing with rollback logic
- ✅ **Database Design**: Proper financial data modeling with audit trails
- ✅ **Caching Strategy**: Redis for performance and idempotency
- ✅ **Webhook System**: Event-driven architecture with security and retry logic  
- ✅ **Error Handling**: Comprehensive failure scenarios and recovery
- ✅ **State Management**: Clean payment status transitions
- ✅ **Provider Integration**: Mock implementations of Stripe and offramp providers
- ✅ **Security**: HMAC signature verification and rate limiting
- ✅ **Observability**: Structured logging and health checks

## 🏗️ Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────── ┐
│   Client App    │    │   Admin Panel   │    │  Mocked External APIs  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬──────────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Payment API                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Routes    │  │ Middleware  │  │       Services          │  │
│  │ - Payments  │  │ - Auth      │  │ - PaymentService        │  │
│  │ - Admin     │  │ - Validate  │  │ - PaymentProcessor      │  │
│  │ - Webhooks  │  │ - Rate Lmt  │  │ - WebhookService        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    ┌──────────┐ ┌─────────┐ ┌──────────┐
    │PostgreSQL│ │  Redis  │ │ Providers│
    │ Database │ │  Cache  │ │ - Stripe │
    └──────────┘ └─────────┘ │ - Offramp│
                             └──────────┘
```

### Payment Flow

```
1. CREATE      → Payment created (PENDING)
2. QUOTE       → Fee calculation + exchange rate  
3. PROCESS     → USD collection via Stripe
4. CONVERT     → Currency conversion (USD → EUR/GBP/etc)
5. TRANSFER    → Local currency to recipient
6. COMPLETE    → Payment successful
7. WEBHOOK     → Customer notification
```

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
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init

# 4. Start API
npm run dev

# 5. Test it works
curl http://localhost:3000/health
```

## 📡 API Endpoints

### Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/payments/quote` | Get payment quote with fees |
| `POST` | `/api/v1/payments` | Create new payment |
| `GET` | `/api/v1/payments/:id` | Get payment details |
| `GET` | `/api/v1/payments` | List all payments |

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
| `GET` | `/webhooks/health` | Webhook service status |

## 🧪 Testing the Complete Flow

```bash
# 1. Create a payment
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
    "description": "Test payment"
  }'

# 2. Process the payment (use the ID from step 1)
curl -X POST http://localhost:3000/api/v1/admin/payments/{PAYMENT_ID}

## Misc.

To open the prisma studio: `npx prisma studio` (helps you visualize the database in a clean UI)
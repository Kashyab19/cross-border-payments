#!/bin/bash

  echo "🔄 Complete Payment Processing Test"
  echo "==================================="

  # 1. Create Payment
  echo "1. Creating payment..."
  RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/payments \
    -H "Content-Type: application/json" \
    -d '{
      "idempotencyKey": "full-flow-test-'$(date +%s)'",
      "sourceAmount": 1000,
      "sourceCurrency": "USD",
      "targetCurrency": "EUR",
      "customerId": "test_customer",
      "customerEmail": "test@example.com",
      "recipientName": "Test Recipient",
      "recipientAccount": "FR1420041010050500013M02606",
      "description": "End-to-end processing test"
    }')

  echo "Payment Creation Response:"
  echo "$RESPONSE" | jq .

  # 2. Extract Payment ID
  if command -v jq &> /dev/null; then
      PAYMENT_ID=$(echo "$RESPONSE" | jq -r '.data.payment.id')

      if [ "$PAYMENT_ID" != "null" ] && [ "$PAYMENT_ID" != "" ]; then
          echo -e "\n2. Payment created with ID: $PAYMENT_ID"

          # 3. Check initial status
          echo -e "\n3. Checking initial payment status..."
          curl -s -X GET "http://localhost:3000/api/v1/payments/$PAYMENT_ID" | jq .

          # 4. Process the payment
          echo -e "\n4. Processing payment..."
          curl -s -X POST "http://localhost:3000/admin/payments/$PAYMENT_ID/process" \
            -H "Content-Type: application/json" | jq .

          # 5. Check final status
          echo -e "\n5. Checking final payment status..."
          curl -s -X GET "http://localhost:3000/api/v1/payments/$PAYMENT_ID" | jq .

      else
          echo "❌ Could not extract payment ID from response"
      fi
  else
      echo "❌ jq not installed - install with: brew install jq"
  fi

  echo -e "\n✅ Processing test completed!"
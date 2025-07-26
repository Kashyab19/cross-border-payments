#!/bin/bash

# High-Risk Payment Testing Script
# Tests various high-risk scenarios for payment processing

echo "🚨 High-Risk Payment Testing Suite"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
TIMESTAMP=$(date +%s)

# Function to test high-risk payment scenarios
test_high_risk_payment() {
    local test_name=$1
    local payment_data=$2
    local expected_behavior=$3
    
    echo -e "${YELLOW}🧪 Testing: $test_name${NC}"
    echo "Expected: $expected_behavior"
    echo ""
    
    # Create payment
    echo "Creating high-risk payment..."
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -d "$payment_data")
    
    echo "Response:"
    echo "$RESPONSE" | jq .
    
    # Extract payment ID if successful
    if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
        PAYMENT_ID=$(echo "$RESPONSE" | jq -r '.data.payment.id')
        
        echo -e "\n${BLUE}💰 Payment created: $PAYMENT_ID${NC}"
        
        # Try to process the payment
        echo "Attempting to process high-risk payment..."
        PROCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/payments/$PAYMENT_ID/process" \
            -H "Content-Type: application/json")
        
        echo "Processing Response:"
        echo "$PROCESS_RESPONSE" | jq .
        
        # Check final status
        echo -e "\nChecking final payment status..."
        FINAL_STATUS=$(curl -s -X GET "$BASE_URL/api/v1/payments/$PAYMENT_ID")
        echo "$FINAL_STATUS" | jq .
        
    else
        echo -e "${RED}❌ Payment creation failed${NC}"
    fi
    
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Test 1: Extremely Large Amount (Potential Money Laundering)
echo -e "${RED}🚨 HIGH-RISK TEST 1: LARGE AMOUNT TRANSACTION${NC}"
test_high_risk_payment \
    "Large Amount Payment ($100,000)" \
    '{
        "idempotencyKey": "high-risk-large-'$TIMESTAMP'",
        "sourceAmount": 100000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "suspicious_customer_001",
        "customerEmail": "large.transaction@example.com",
        "recipientName": "Shell Company Ltd",
        "recipientAccount": "CH9300762011623852957",
        "description": "Large business transfer - urgent"
    }' \
    "Should process but may trigger compliance alerts"

# Test 2: High-Risk Country Transfer
echo -e "${RED}🚨 HIGH-RISK TEST 2: SANCTIONED COUNTRY TRANSFER${NC}"
test_high_risk_payment \
    "Transfer to High-Risk Country" \
    '{
        "idempotencyKey": "high-risk-country-'$TIMESTAMP'",
        "sourceAmount": 5000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "risky_customer_002",
        "customerEmail": "sanctions.test@example.com",
        "recipientName": "Suspicious Entity",
        "recipientAccount": "DE89370400440532013000",
        "description": "Transfer to restricted region",
        "destinationCountry": "IR"
    }' \
    "Should potentially block or require manual review"

# Test 3: Rapid Sequential Payments (Structuring)
echo -e "${RED}🚨 HIGH-RISK TEST 3: RAPID SEQUENTIAL PAYMENTS${NC}"
echo "Creating multiple payments in quick succession (potential structuring)..."

for i in {1..5}; do
    echo "Creating payment $i/5..."
    STRUCTURING_DATA='{
        "idempotencyKey": "structuring-'$TIMESTAMP'-'$i'",
        "sourceAmount": 9500,
        "sourceCurrency": "USD", 
        "targetCurrency": "EUR",
        "customerId": "structuring_customer_003",
        "customerEmail": "structuring.test@example.com",
        "recipientName": "Split Payment Recipient",
        "recipientAccount": "GB82WEST12345698765432",
        "description": "Business payment part '$i' of 5"
    }'
    
    curl -s -X POST "$BASE_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -d "$STRUCTURING_DATA" | jq -r '.data.payment.id // "FAILED"'
    
    sleep 1  # Small delay between payments
done

# Test 4: Cryptocurrency-Related Payment
echo -e "${RED}🚨 HIGH-RISK TEST 4: CRYPTOCURRENCY EXCHANGE${NC}"
test_high_risk_payment \
    "Cryptocurrency Exchange Payment" \
    '{
        "idempotencyKey": "crypto-exchange-'$TIMESTAMP'",
        "sourceAmount": 25000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "crypto_trader_004",
        "customerEmail": "crypto.trader@example.com",
        "recipientName": "CryptoMax Exchange Ltd",
        "recipientAccount": "MT84MALT011000012345MTLCAST001S",
        "description": "Bitcoin purchase - cryptocurrency exchange"
    }' \
    "Should process but flag for AML monitoring"

# Test 5: Shell Company Transfer
echo -e "${RED}🚨 HIGH-RISK TEST 5: SHELL COMPANY TRANSFER${NC}"
test_high_risk_payment \
    "Shell Company Payment" \
    '{
        "idempotencyKey": "shell-company-'$TIMESTAMP'",
        "sourceAmount": 15000,
        "sourceCurrency": "USD",
        "targetCurrency": "GBP",
        "customerId": "shell_company_005",
        "customerEmail": "info@offshoreentity.com",
        "recipientName": "Offshore Holdings Inc",
        "recipientAccount": "KY12ABCD1234567890123456",
        "description": "Investment transfer to subsidiary"
    }' \
    "Should trigger enhanced due diligence"

# Test 6: Unusual Time Pattern (Off-Hours)
echo -e "${RED}🚨 HIGH-RISK TEST 6: OFF-HOURS TRANSACTION${NC}"
test_high_risk_payment \
    "Off-Hours Large Payment" \
    '{
        "idempotencyKey": "off-hours-'$TIMESTAMP'",
        "sourceAmount": 50000,
        "sourceCurrency": "USD",
        "targetCurrency": "CHF",
        "customerId": "night_trader_006",
        "customerEmail": "night.operations@example.com",
        "recipientName": "Midnight Trading Corp",
        "recipientAccount": "CH1234567890123456789",
        "description": "Urgent overnight business transfer"
    }' \
    "Should process but log unusual timing"

# Test 7: Round Number Payment (Potential Indicator)
echo -e "${RED}🚨 HIGH-RISK TEST 7: SUSPICIOUS ROUND AMOUNTS${NC}"
test_high_risk_payment \
    "Suspicious Round Amount" \
    '{
        "idempotencyKey": "round-amount-'$TIMESTAMP'",
        "sourceAmount": 10000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "round_number_007",
        "customerEmail": "round.amounts@example.com",
        "recipientName": "Exact Amount Ltd",
        "recipientAccount": "LU280019400644750000",
        "description": "Exactly ten thousand dollar payment"
    }' \
    "Should process but may trigger pattern analysis"

# Test 8: High-Frequency Customer
echo -e "${RED}🚨 HIGH-RISK TEST 8: HIGH-FREQUENCY CUSTOMER${NC}"
echo "Testing customer with high transaction frequency..."

HIGH_FREQ_CUSTOMER="high_frequency_008"
for i in {1..3}; do
    echo "High-frequency payment $i/3..."
    FREQ_DATA='{
        "idempotencyKey": "high-freq-'$TIMESTAMP'-'$i'",
        "sourceAmount": '$((3000 + i * 500))',
        "sourceCurrency": "USD",
        "targetCurrency": "EUR", 
        "customerId": "'$HIGH_FREQ_CUSTOMER'",
        "customerEmail": "frequent.trader@example.com",
        "recipientName": "Regular Recipient '$i'",
        "recipientAccount": "ES9121000418450200051332",
        "description": "Regular business payment #'$i'"
    }'
    
    curl -s -X POST "$BASE_URL/api/v1/payments" \
        -H "Content-Type: application/json" \
        -d "$FREQ_DATA" | jq -r '.data.payment.id // "FAILED"'
done

# Test 9: PEP (Politically Exposed Person) Simulation
echo -e "${RED}🚨 HIGH-RISK TEST 9: PEP TRANSACTION${NC}"
test_high_risk_payment \
    "Politically Exposed Person Payment" \
    '{
        "idempotencyKey": "pep-payment-'$TIMESTAMP'",
        "sourceAmount": 75000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "pep_customer_009",
        "customerEmail": "political.figure@government.com",
        "recipientName": "Political Campaign Fund",
        "recipientAccount": "FR1420041010050500013M02606",
        "description": "Political donation - campaign contribution"
    }' \
    "Should trigger enhanced PEP screening"

# Test 10: Cash-Intensive Business
echo -e "${RED}🚨 HIGH-RISK TEST 10: CASH-INTENSIVE BUSINESS${NC}"
test_high_risk_payment \
    "Cash-Intensive Business Payment" \
    '{
        "idempotencyKey": "cash-business-'$TIMESTAMP'",
        "sourceAmount": 30000,
        "sourceCurrency": "USD",
        "targetCurrency": "EUR",
        "customerId": "cash_business_010",
        "customerEmail": "owner@cashonlystore.com",
        "recipientName": "Cash Only Electronics",
        "recipientAccount": "IT60X0542811101000000123456",
        "description": "Cash business inventory purchase"
    }' \
    "Should require source of funds verification"

# Summary and Analysis
echo -e "${GREEN}📊 HIGH-RISK TESTING SUMMARY${NC}"
echo "=================================="
echo ""
echo "✅ Completed high-risk payment scenarios:"
echo "   1. Large amount transactions ($100K+)"
echo "   2. High-risk country transfers"
echo "   3. Rapid sequential payments (structuring)"
echo "   4. Cryptocurrency-related transfers"
echo "   5. Shell company transactions"
echo "   6. Off-hours unusual timing"
echo "   7. Suspicious round amounts"
echo "   8. High-frequency customer patterns"
echo "   9. PEP (Politically Exposed Person) transfers"
echo "   10. Cash-intensive business payments"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT COMPLIANCE NOTES:${NC}"
echo "• All high-risk payments should be logged for AML monitoring"
echo "• Large amounts (>$10K) should trigger CTR (Currency Transaction Report)"
echo "• Sanctioned countries should be blocked immediately"
echo "• Rapid sequential payments should trigger SAR (Suspicious Activity Report)"
echo "• PEP transactions require enhanced due diligence"
echo "• Cash-intensive businesses need source of funds verification"
echo ""
echo -e "${BLUE}🔍 NEXT STEPS FOR PRODUCTION:${NC}"
echo "1. Implement automated risk scoring"
echo "2. Add real-time sanctions screening"
echo "3. Set up compliance alert systems"
echo "4. Configure transaction monitoring rules"
echo "5. Integrate with KYC/AML databases"
echo "6. Set up regulatory reporting"
echo ""
echo -e "${GREEN}🎯 High-risk testing completed!${NC}"

# Check if any payments need manual review
echo ""
echo "Checking for payments that may need manual review..."
curl -s -X GET "$BASE_URL/api/v1/payments" | jq -r '.data.payments[] | select(.sourceAmount >= 10000) | "Payment ID: \(.id) - Amount: $\(.sourceAmount) - Status: \(.status)"'
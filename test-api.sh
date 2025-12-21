#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"

echo -e "${BLUE}=== Payment Settlement System API Test ===${NC}\n"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. Install it for pretty JSON output.${NC}"
    JQ_CMD="cat"
else
    JQ_CMD="jq"
fi

# 1. Health Check
echo -e "${GREEN}1. Health Check${NC}"
HEALTH=$(curl -s $BASE_URL/health)
echo "$HEALTH" | $JQ_CMD
if [ $? -ne 0 ]; then
    echo "Error: API is not responding. Make sure services are running."
    exit 1
fi
echo ""

# 2. Create Payment
echo -e "${GREEN}2. Create Payment${NC}"
IDEMPOTENCY_KEY="test-$(date +%s)"
PAYMENT_RESPONSE=$(curl -s -X POST $BASE_URL/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "customerId": "customer_test",
    "vendorId": "vendor_001",
    "amount": 1000.00,
    "currency": "USD",
    "description": "Test payment"
  }')

echo "$PAYMENT_RESPONSE" | $JQ_CMD

# Extract payment ID
if command -v jq &> /dev/null; then
    PAYMENT_ID=$(echo $PAYMENT_RESPONSE | jq -r '.id')
else
    # Fallback: extract ID using grep/sed
    PAYMENT_ID=$(echo $PAYMENT_RESPONSE | grep -o '"id":[0-9]*' | grep -o '[0-9]*' | head -1)
fi

if [ -z "$PAYMENT_ID" ] || [ "$PAYMENT_ID" = "null" ]; then
    echo "Error: Failed to create payment"
    exit 1
fi

echo -e "\nPayment ID: $PAYMENT_ID\n"

# 3. Test Idempotency
echo -e "${GREEN}3. Test Idempotency (same key)${NC}"
IDEMPOTENT_RESPONSE=$(curl -s -X POST $BASE_URL/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d '{
    "customerId": "customer_test",
    "vendorId": "vendor_001",
    "amount": 1000.00,
    "currency": "USD"
  }')

echo "$IDEMPOTENT_RESPONSE" | $JQ_CMD
IDEMPOTENT_ID=$(echo $IDEMPOTENT_RESPONSE | jq -r '.id 2>/dev/null' || echo $IDEMPOTENT_RESPONSE | grep -o '"id":[0-9]*' | grep -o '[0-9]*' | head -1)

if [ "$IDEMPOTENT_ID" = "$PAYMENT_ID" ]; then
    echo -e "${GREEN}✓ Idempotency test passed${NC}\n"
else
    echo -e "${YELLOW}⚠ Idempotency test may have failed${NC}\n"
fi

# 4. Get Payment
echo -e "${GREEN}4. Get Payment by ID${NC}"
curl -s $BASE_URL/api/payments/$PAYMENT_ID | $JQ_CMD
echo ""

# Wait a bit for settlement processing (Kafka async processing)
echo -e "${BLUE}Waiting 5 seconds for settlement processing...${NC}"
sleep 5

# Check if settlement was created, retry if needed
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  SETTLEMENT_CHECK=$(docker-compose exec -T mysql mysql -uroot -ppassword payment_settlement -e "SELECT COUNT(*) as count FROM settlements WHERE payment_id = $PAYMENT_ID" 2>/dev/null | tail -1 | awk '{print $2}')
  if [ "$SETTLEMENT_CHECK" = "1" ] || [ "$SETTLEMENT_CHECK" = "1" ]; then
    break
  fi
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo -e "${YELLOW}Waiting for settlement... (attempt $RETRY_COUNT/$MAX_RETRIES)${NC}"
    sleep 2
  fi
done

# 5. Create Refund
echo -e "${GREEN}5. Create Refund${NC}"
REFUND_RESPONSE=$(curl -s -X POST $BASE_URL/api/refunds \
  -H "Content-Type: application/json" \
  -d "{
    \"paymentId\": $PAYMENT_ID,
    \"amount\": 1000.00,
    \"reason\": \"Test refund\"
  }")

echo "$REFUND_RESPONSE" | $JQ_CMD
echo ""

# 6. Verify Payment Status After Refund
echo -e "${GREEN}6. Verify Payment Status (should be REFUNDED)${NC}"
curl -s $BASE_URL/api/payments/$PAYMENT_ID | $JQ_CMD
echo ""

echo -e "${GREEN}=== Test completed! ===${NC}"
echo -e "\nTo check database:"
echo "  docker-compose exec mysql mysql -uroot -ppassword payment_settlement"
echo -e "\nTo view logs:"
echo "  docker-compose logs -f app"


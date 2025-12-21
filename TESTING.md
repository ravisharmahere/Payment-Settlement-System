# Testing Guide

This guide will help you run and test the Payment Settlement System.

## Prerequisites

- Docker and Docker Compose installed
- `curl` or `httpie` for API testing (or use Postman/Insomnia)
- Optional: `jq` for pretty JSON output

## Quick Start

### 1. Start All Services

Start all services from the project root:

```bash
docker-compose up -d
```

This will start:
- MySQL database
- Kafka (KRaft mode)
- Redis
- Payment Settlement Application

### 2. Check Service Status

Verify all services are running:

```bash
docker-compose ps
```

All services should show "Up" status. Wait for health checks to pass (may take 30-60 seconds).

### 3. View Logs

Watch application logs:

```bash
docker-compose logs -f app
```

Or view all logs:

```bash
docker-compose logs -f
```

## Testing the API

### Health Check

First, verify the API is running:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### 1. Create a Payment (with Idempotency)

Create a payment with an idempotency key:

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-payment-001" \
  -d '{
    "customerId": "customer_123",
    "vendorId": "vendor_001",
    "amount": 1000.00,
    "currency": "USD",
    "description": "Test payment"
  }'
```

Expected response (201 Created):
```json
{
  "id": 1,
  "customerId": "customer_123",
  "vendorId": "vendor_001",
  "amount": 1000,
  "currency": "USD",
  "description": "Test payment",
  "status": "CAPTURED",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Test Idempotency

Send the same request again with the same idempotency key:

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-payment-001" \
  -d '{
    "customerId": "customer_123",
    "vendorId": "vendor_001",
    "amount": 1000.00,
    "currency": "USD",
    "description": "Test payment"
  }'
```

Expected response (200 OK) - same payment ID returned:
```json
{
  "id": 1,
  "customerId": "customer_123",
  "vendorId": "vendor_001",
  "amount": 1000,
  "currency": "USD",
  "description": "Test payment",
  "status": "CAPTURED",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. Get Payment by ID

```bash
curl http://localhost:3000/api/payments/1
```

### 4. Create Multiple Payments

Create payments for different vendors:

```bash
# Payment 1
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-002" \
  -d '{
    "customerId": "customer_456",
    "vendorId": "vendor_001",
    "amount": 2000.00,
    "currency": "USD"
  }'

# Payment 2
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: payment-003" \
  -d '{
    "customerId": "customer_789",
    "vendorId": "vendor_002",
    "amount": 1500.00,
    "currency": "USD"
  }'
```

### 5. Check Settlement Status

After a payment is created and captured, the settlement orchestrator should process it. Check the logs:

```bash
docker-compose logs app | grep -i settlement
```

You should see logs like:
```
[INFO] Processing settlement for payment 1
[INFO] Settlement 1 created for payment 1
```

### 6. Check Database

Connect to MySQL to verify data:

```bash
docker-compose exec mysql mysql -uroot -ppassword payment_settlement
```

Then run SQL queries:

```sql
-- Check payments
SELECT * FROM payments;

-- Check settlements
SELECT * FROM settlements;

-- Check settlement splits
SELECT * FROM settlement_splits;

-- Check ledger entries (verify double-entry)
SELECT 
  settlement_id,
  account_type,
  vendor_id,
  SUM(debit) as total_debits,
  SUM(credit) as total_credits
FROM ledger_entries
GROUP BY settlement_id, account_type, vendor_id;

-- Verify double-entry balance
SELECT 
  settlement_id,
  SUM(debit) as total_debits,
  SUM(credit) as total_credits,
  ABS(SUM(debit) - SUM(credit)) as difference
FROM ledger_entries
GROUP BY settlement_id
HAVING ABS(SUM(debit) - SUM(credit)) > 0.01;
```

The last query should return no rows (all settlements should balance).

### 7. Test Refund

Create a refund for a payment:

```bash
curl -X POST http://localhost:3000/api/refunds \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": 1,
    "amount": 1000.00,
    "reason": "Customer requested refund"
  }'
```

Expected response:
```json
{
  "message": "Refund processed successfully",
  "paymentId": 1,
  "amount": 1000
}
```

Verify the payment status changed to REFUNDED:

```bash
curl http://localhost:3000/api/payments/1
```

### 8. Monitor Kafka Events

Check Kafka topics and messages:

```bash
# List topics
docker-compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list

# Consume messages from payments topic
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic payments \
  --from-beginning

# Consume messages from settlement.tasks topic
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic settlement.tasks \
  --from-beginning
```

### 9. Check Redis Cache

Verify idempotency keys are cached:

```bash
docker-compose exec redis redis-cli

# In Redis CLI:
KEYS idempotency:*
GET idempotency:test-payment-001
```

## Testing Payout Retry Logic

The payout worker simulates random failures (20% failure rate). To test retry logic:

1. Create multiple payments
2. Watch the logs for payout attempts:

```bash
docker-compose logs -f app | grep -i payout
```

You should see logs like:
```
[INFO] Processing payout for settlement 1
[WARN] Payout to vendor_001 for 700 failed (simulated)
[INFO] Processing payout for settlement 1
[INFO] Payout to vendor_001 for 700 succeeded
```

## Running Unit Tests

If you want to run the unit tests locally (outside Docker):

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Troubleshooting

### Services Not Starting

Check if ports are already in use:

```bash
# Check port 3000
lsof -i :3000

# Check port 9092 (Kafka)
lsof -i :9092

# Check port 3306 (MySQL)
lsof -i :3306

# Check port 6379 (Redis)
lsof -i :6379
```

Or use docker-compose commands:

```bash
docker-compose ps
```

### Database Connection Issues

Ensure MySQL is ready:

```bash
docker-compose exec mysql mysqladmin ping -h localhost -uroot -ppassword
```

### Kafka Connection Issues

Test Kafka connectivity:

```bash
docker-compose exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Reset Everything

To start fresh:

```bash
# Stop and remove containers, networks, and volumes
docker-compose down -v

# Start again
docker-compose up -d
```

## Example Test Script

Create a file `test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "1. Health Check"
curl -s $BASE_URL/health | jq

echo -e "\n2. Create Payment"
PAYMENT_RESPONSE=$(curl -s -X POST $BASE_URL/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "customerId": "customer_test",
    "vendorId": "vendor_001",
    "amount": 1000.00,
    "currency": "USD"
  }')

echo $PAYMENT_RESPONSE | jq
PAYMENT_ID=$(echo $PAYMENT_RESPONSE | jq -r '.id')

echo -e "\n3. Get Payment"
curl -s $BASE_URL/api/payments/$PAYMENT_ID | jq

echo -e "\n4. Create Refund"
curl -s -X POST $BASE_URL/api/refunds \
  -H "Content-Type: application/json" \
  -d "{
    \"paymentId\": $PAYMENT_ID,
    \"amount\": 1000.00
  }" | jq

echo -e "\nTest completed!"
```

Make it executable and run:

```bash
chmod +x test-api.sh
./test-api.sh
```


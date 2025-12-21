# Payment Settlement System

A comprehensive payment settlement system built with Node.js, TypeScript, MySQL, Kafka, and Redis. The system handles payment processing, settlement orchestration, vendor payouts, and refunds with idempotency guarantees and double-entry accounting.

## Architecture

The system consists of the following components:

- **REST API**: Payment creation with idempotency key handling
- **Settlement Orchestrator**: Processes captured payments, calculates splits, creates ledger entries
- **Payout Worker**: Handles vendor payouts with retry logic
- **Refund Worker**: Processes refunds and creates reversing ledger entries
- **MySQL**: Persistent storage with InnoDB transactions
- **Kafka**: Event streaming for payment lifecycle
- **Redis**: Idempotency caching and distributed locking

## System Flow

```
1. Client creates payment with Idempotency-Key header
2. API checks Redis cache, then MySQL for existing key
3. Payment created in MySQL, events emitted to Kafka
4. Settlement Orchestrator consumes captured payments
5. Splits calculated, double-entry ledger entries created
6. Payout Worker processes vendor payouts with retry
7. Refund Worker handles refunds and creates reversing entries
```

## Features

- **Idempotency**: REST API supports idempotency keys via header
- **Double-Entry Accounting**: All ledger entries ensure debits equal credits
- **Event-Driven**: Kafka events for payment lifecycle management
- **Retry Logic**: Exponential backoff for payout failures
- **Transaction Safety**: MySQL InnoDB transactions for data consistency
- **Redis Caching**: Fast idempotency key lookups

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- MySQL 8.0+
- Kafka
- Redis

## Quick Start with Docker

1. Navigate to the project directory:

```bash
cd "Payment Settlement System"
```

2. Start all services using Docker Compose:

```bash
docker-compose up -d
```

3. Wait for all services to be healthy (check with `docker-compose ps`)

4. The API will be available at `http://localhost:3000`

5. Run the test script:

```bash
cd ..
./test-api.sh
```

Or test manually using curl (see [TESTING.md](TESTING.md) for detailed instructions).

## Local Development Setup

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=payment_settlement
REDIS_HOST=localhost
REDIS_PORT=6379
KAFKA_BROKERS=localhost:9092
```

3. Run database migrations:

```bash
npm run migrate
```

4. Seed vendor data (optional):

```bash
mysql -u root -p payment_settlement < src/database/seeders/vendors.sql
```

5. Start the development server:

```bash
npm run dev
```

## API Endpoints

### Create Payment

```bash
POST /api/payments
Headers:
  Idempotency-Key: <unique-key>
  Content-Type: application/json

Body:
{
  "customerId": "customer_123",
  "vendorId": "vendor_001",
  "amount": 1000.00,
  "currency": "USD",
  "description": "Payment for services"
}
```

### Get Payment

```bash
GET /api/payments/:id
```

### Create Refund

```bash
POST /api/refunds
Content-Type: application/json

Body:
{
  "paymentId": 1,
  "amount": 1000.00,
  "reason": "Customer requested refund"
}
```

### Health Check

```bash
GET /health
```

## Database Schema

### Tables

- **payments**: Payment records with status tracking
- **idempotency_keys**: Idempotency key storage
- **vendors**: Vendor configuration with split percentages
- **settlements**: Settlement records
- **settlement_splits**: Individual vendor splits
- **ledger_entries**: Double-entry accounting ledger

### Migrations

Run migrations with:

```bash
npm run migrate
```

## Kafka Topics

- `payments`: Payment lifecycle events (initiated, captured)
- `settlement.tasks`: Settlement tasks for payout processing
- `refunds`: Refund events

## Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Worker Modes

The application can run in different modes:

- `all`: Run API server and all workers (default)
- `api`: Run only the API server
- `settlement`: Run only the settlement orchestrator
- `payout`: Run only the payout worker
- `refund`: Run only the refund worker

Set via environment variable:

```bash
WORKER_MODE=all npm start
```

## Project Structure

```
payment-settlement-system/
├── src/
│   ├── api/              # REST API routes and middleware
│   ├── services/          # Business logic services
│   ├── models/           # TypeScript models
│   ├── database/         # MySQL connection and migrations
│   ├── kafka/            # Kafka producer and consumers
│   ├── redis/            # Redis client
│   ├── workers/          # Background workers
│   └── utils/            # Utility functions
├── tests/                # Unit and integration tests
├── Dockerfile            # Docker image definition
├── docker-compose.yml   # Docker Compose configuration
└── README.md
```

## Key Features Explained

### Idempotency

The API uses the `Idempotency-Key` header to ensure idempotent requests. Keys are cached in Redis (24h TTL) and persisted in MySQL. Duplicate requests return the cached response.

### Double-Entry Accounting

All ledger entries follow double-entry accounting principles:
- Debits must equal credits
- Cash account debited when payment received
- Revenue account credited (platform share)
- Payable accounts credited (vendor shares)

### Settlement Flow

1. Payment captured → `payments.captured` event
2. Settlement orchestrator calculates splits based on vendor configuration
3. Double-entry ledger entries created
4. `settlement.tasks` event emitted
5. Payout worker processes each vendor split
6. On success: Settlement marked as SETTLED
7. On failure: Retry with exponential backoff (max 5 retries)

### Refund Processing

Refunds create reversing ledger entries (swap debit/credit) to maintain double-entry balance.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `MYSQL_HOST` | MySQL host | localhost |
| `MYSQL_PORT` | MySQL port | 3306 |
| `MYSQL_USER` | MySQL user | root |
| `MYSQL_PASSWORD` | MySQL password | password |
| `MYSQL_DATABASE` | Database name | payment_settlement |
| `REDIS_HOST` | Redis host | localhost |
| `REDIS_PORT` | Redis port | 6379 |
| `KAFKA_BROKERS` | Kafka broker addresses | localhost:9092 |
| `WORKER_MODE` | Worker execution mode | all |
| `IDEMPOTENCY_TTL_HOURS` | Idempotency key TTL | 24 |

## Troubleshooting

### Database Connection Issues

Ensure MySQL is running and accessible:

```bash
mysql -u root -p -e "SHOW DATABASES;"
```

### Kafka Connection Issues

Check Kafka is running:

```bash
docker-compose ps kafka
```

### Redis Connection Issues

Test Redis connection:

```bash
redis-cli ping
```

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request


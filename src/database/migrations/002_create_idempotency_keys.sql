CREATE TABLE IF NOT EXISTS idempotency_keys (
    `key` VARCHAR(255) PRIMARY KEY,
    payment_id BIGINT,
    response JSON NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    settlement_id BIGINT,
    payment_id BIGINT,
    account_type ENUM('CASH', 'REVENUE', 'PAYABLE') NOT NULL,
    vendor_id VARCHAR(255),
    debit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_settlement_id (settlement_id),
    INDEX idx_payment_id (payment_id),
    INDEX idx_account_type (account_type),
    INDEX idx_vendor_id (vendor_id),
    FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


INSERT INTO vendors (id, name, split_percentage) VALUES
('vendor_001', 'Vendor A', 70.00),
('vendor_002', 'Vendor B', 30.00)
ON DUPLICATE KEY UPDATE name=VALUES(name), split_percentage=VALUES(split_percentage);


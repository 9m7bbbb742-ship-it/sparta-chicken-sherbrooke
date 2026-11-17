-- Indexes for live orders and unassigned deliveries. Additive migration only.
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_unassigned ON deliveries(status, driver_name, created_at);

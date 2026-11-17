-- Add customer fulfillment details to orders. Additive only; preserves all existing rows.
ALTER TABLE orders ADD COLUMN customer_email TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN fulfillment TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN delivery_address TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN notes TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_unassigned ON deliveries(status, driver_name, created_at);

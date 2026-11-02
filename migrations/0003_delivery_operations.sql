-- Sparta Chicken: informations opérationnelles pour les livraisons et reçus.
-- Migration additive : ne supprime aucune donnée existante.
ALTER TABLE deliveries ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE deliveries ADD COLUMN items_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE deliveries ADD COLUMN scheduled_at TEXT;
ALTER TABLE deliveries ADD COLUMN eta_minutes INTEGER;
ALTER TABLE deliveries ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'unconfigured';
ALTER TABLE deliveries ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
CREATE INDEX IF NOT EXISTS idx_deliveries_schedule ON deliveries(driver_name,status,scheduled_at);

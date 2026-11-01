-- Sparta Chicken Sherbrooke — Cloudflare D1
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  category TEXT NOT NULL DEFAULT 'Autres',
  available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','preparing','ready','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending','paid','refunded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK(party_size > 0),
  reservation_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  discount_percent INTEGER NOT NULL CHECK(discount_percent BETWEEN 1 AND 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  starts_at TEXT,
  ends_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Modules d'exploitation : inventaire, livraison, coûts et horaires
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unité',
  low_stock_threshold REAL NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_costs (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_cents >= 0),
  prep_minutes INTEGER NOT NULL DEFAULT 15 CHECK(prep_minutes BETWEEN 0 AND 240)
);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  customer_name TEXT NOT NULL,
  address TEXT NOT NULL,
  driver_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigned','picked_up','delivered','cancelled')),
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  driver_cost_cents INTEGER NOT NULL DEFAULT 0,
  distance_km REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Autre',
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS restaurant_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_status ON deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);

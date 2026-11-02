-- Comptes individuels employés et livreurs. Migration additive, sans suppression de données.
CREATE TABLE IF NOT EXISTS staff_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('employee','driver')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_staff_role_active ON staff_accounts(role,active);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_status ON deliveries(driver_name,status);

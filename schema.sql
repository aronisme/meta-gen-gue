-- Schema for Cloudflare D1 Database (metagen-db)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  picture TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  daily_quota INTEGER DEFAULT 100,
  usage_count INTEGER DEFAULT 0,
  last_login TEXT,
  created_at TEXT
);

-- Inisialisasi Admin Utama (adobestpro@gmail.com)
INSERT OR IGNORE INTO users (email, name, role, status, daily_quota, usage_count, last_login, created_at)
VALUES (
  'adobestpro@gmail.com',
  'Admin Adobest',
  'admin',
  'active',
  1000,
  0,
  datetime('now'),
  datetime('now')
);

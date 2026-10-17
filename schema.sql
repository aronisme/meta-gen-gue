-- Schema for Cloudflare D1 Database (metagen-db)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  name TEXT NOT NULL,
  picture TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  daily_quota INTEGER DEFAULT 100,
  usage_count INTEGER DEFAULT 0,
  quota_reset_date TEXT,
  last_login TEXT,
  created_at TEXT
);

-- Inisialisasi Admin Utama (adobestpro@gmail.com)
INSERT OR IGNORE INTO users (email, name, role, status, daily_quota, usage_count, quota_reset_date, last_login, created_at)
VALUES (
  'adobestpro@gmail.com',
  'Admin Adobest',
  'admin',
  'active',
  1000,
  0,
  strftime('%Y-%m-%d', 'now'),
  datetime('now'),
  datetime('now')
);

-- 1. Riwayat Metadata Item
CREATE TABLE IF NOT EXISTS metadata_history (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL COLLATE NOCASE,
  session_id TEXT,
  filename TEXT NOT NULL,
  asset_type TEXT DEFAULT 'image',
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT NOT NULL,
  category TEXT,
  shutterstock_category TEXT,
  is_illustration INTEGER DEFAULT 0,
  ai_model TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metadata_user ON metadata_history(user_email COLLATE NOCASE, created_at DESC);

-- 2. Sesi Batch Tugas
CREATE TABLE IF NOT EXISTS generation_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  item_ids TEXT,
  status TEXT DEFAULT 'completed',
  total_files INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON generation_sessions(user_email COLLATE NOCASE, created_at DESC);

-- 3. Akun FTP/SFTP Agensi Microstock
CREATE TABLE IF NOT EXISTS ftp_accounts (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL COLLATE NOCASE,
  agency_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  protocol TEXT DEFAULT 'sftp',
  username TEXT NOT NULL,
  password TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ftp_accounts_user ON ftp_accounts(user_email COLLATE NOCASE);

-- 4. Buku Besar Riwayat Unggah (Upload Ledger Anti-Duplicate)
CREATE TABLE IF NOT EXISTS upload_ledger (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL COLLATE NOCASE,
  file_hash TEXT NOT NULL,
  filename TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  account_id TEXT,
  account_label TEXT,
  status TEXT DEFAULT 'success',
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON upload_ledger(user_email COLLATE NOCASE, file_hash, agency_id);

-- 5. Preferensi Pengaturan Pengguna
CREATE TABLE IF NOT EXISTS user_settings (
  user_email TEXT PRIMARY KEY COLLATE NOCASE,
  provider TEXT DEFAULT 'gas-proxy',
  model TEXT DEFAULT 'gemini-2.5-flash',
  file_type TEXT DEFAULT 'auto',
  title_length INTEGER DEFAULT 120,
  description_length INTEGER DEFAULT 60,
  keywords_count INTEGER DEFAULT 35,
  extra_instructions TEXT,
  updated_at TEXT NOT NULL
);

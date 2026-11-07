-- 0001_init.sql — admin auth, audit, rate limits, analytics, settings, encrypted secrets.
-- Timestamps are unix seconds (UTC). Days are 'YYYY-MM-DD' (UTC).

-- Single owner account (id is always 1).
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,              -- pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
  totp_secret_enc TEXT,                     -- AES-GCM (SECRETS_KEK) ciphertext, JSON {iv, ct}
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last_step INTEGER NOT NULL DEFAULT 0, -- replay protection
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL
);

-- Sessions: only SHA-256 of the session token and of the CSRF token are stored.
CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_exp ON admin_sessions(expires_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,                      -- 'owner' | 'system' | 'anonymous'
  action TEXT NOT NULL,
  detail TEXT,                              -- JSON, secrets stripped, <= 1000 chars
  ip_hash TEXT                              -- day-salted HMAC, never the IP
);
CREATE INDEX audit_log_ts ON audit_log(ts);

-- Fixed-window counters. Keys are built from day-salted hashes, never from raw IPs.
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- One random salt per UTC day; yesterday's salt is deleted by the daily cron, so hashes cannot be linked across days.
CREATE TABLE daily_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

-- Raw analytics events (coarse, allowlisted fields only — see src/analytics.js). Purged after RAW_EVENT_DAYS.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  sid TEXT NOT NULL,                        -- random per-tab session id (sessionStorage), not persistent
  vh TEXT,                                  -- day-salted visitor hash (unlinkable after the salt is deleted)
  page TEXT, feature TEXT, domain TEXT, step TEXT, err TEXT,
  lang TEXT, device TEXT, dur TEXT, ret TEXT
);
CREATE INDEX events_day ON events(day);

-- Aggregates (kept): one row per day × metric × key.
CREATE TABLE daily_agg (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL,
  PRIMARY KEY (day, metric, key)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                      -- JSON
  updated_at INTEGER NOT NULL
);

-- Secrets set from the admin UI, AES-GCM encrypted with SECRETS_KEK (a Worker secret). Never returned to the browser.
CREATE TABLE secrets (
  name TEXT PRIMARY KEY,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  kek_id TEXT NOT NULL,                     -- first 8 hex of SHA-256(KEK) — detects a rotated KEK
  updated_at INTEGER NOT NULL
);

-- Per-subject usage (subject = day-salted hash or customer id) for plan quotas.
CREATE TABLE usage_counters (
  day TEXT NOT NULL,
  subject TEXT NOT NULL,
  feature TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, subject, feature)
);

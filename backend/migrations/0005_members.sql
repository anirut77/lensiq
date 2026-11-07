-- 0005_members.sql — member accounts ("Sign in with Google"), member sessions, sign-in nonces, a per-user usage /
-- transaction ledger, optional saved readings, and user_id links on the billing tables.
-- Data minimisation: no profile photo, no Google access token, no reading content unless the member saves it.

CREATE TABLE users (
  id TEXT PRIMARY KEY,                      -- random 128-bit handle (never the Google sub)
  google_sub TEXT NOT NULL UNIQUE,          -- stable Google account id ("sub" claim)
  email TEXT NOT NULL,                      -- from the verified ID token; support + receipts only
  email_verified INTEGER NOT NULL DEFAULT 1,
  display_name TEXT,                        -- optional, <= 80 chars (given name from the token); no photo
  status TEXT NOT NULL DEFAULT 'active',    -- active | disabled
  consent_version TEXT NOT NULL,            -- version of the terms + privacy notice accepted at sign-up / last change
  consent_at INTEGER NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0, -- separate explicit checkbox; default no
  marketing_opt_in_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);
CREATE INDEX users_email ON users(email);
CREATE INDEX users_created ON users(created_at);

-- Member bearer sessions (the site is on github.io, the API on another origin: no third-party cookies).
-- Only SHA-256 of the token is stored; revoked by logout, account deletion, disabling, or expiry.
CREATE TABLE member_sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX member_sessions_user ON member_sessions(user_id);
CREATE INDEX member_sessions_exp ON member_sessions(expires_at);

-- One-time nonces for the Google ID token (replay protection). Only the hash is stored; 10-minute lifetime.
CREATE TABLE auth_nonces (
  hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Per-user ledger / transaction history: what was used, never what was read.
-- kind: signup | reading | ai | payment ; domain = fortune domain id (enum); ref = payment id; amount in satang.
CREATE TABLE member_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  domain TEXT,
  ref TEXT,
  amount_satang INTEGER
);
CREATE INDEX member_ledger_user ON member_ledger(user_id, ts);

-- Readings the member explicitly chose to save (derived result only: summary lines + section titles/paragraphs,
-- <= 16 KB JSON). Deletable one by one and with the account.
CREATE TABLE saved_readings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  data TEXT NOT NULL
);
CREATE INDEX saved_readings_user ON saved_readings(user_id, created_at);

-- Billing is linked to the member (customers stay the receipt / tax-invoice party). NULL = legacy order-token
-- checkout or an account that was deleted (the payment row itself is kept for tax retention, unlinked).
ALTER TABLE customers ADD COLUMN user_id TEXT;
ALTER TABLE subscriptions ADD COLUMN user_id TEXT;
ALTER TABLE payments ADD COLUMN user_id TEXT;
CREATE INDEX customers_user ON customers(user_id);
CREATE INDEX subscriptions_user ON subscriptions(user_id);
CREATE INDEX payments_user ON payments(user_id);

-- 0002_billing.sql — billing scaffold (FREE_MODE today). Amounts are integers in satang (1 THB = 100 satang).

CREATE TABLE plans (
  id TEXT PRIMARY KEY,                      -- free | pro | business | enterprise
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL,
  price_month_satang INTEGER,               -- NULL = contact sales; VAT-inclusive when VAT_REGISTERED
  price_year_satang INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | active | retired
  sort INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- Feature flags / quotas per plan. quota NULL = unlimited, 0 = not included.
CREATE TABLE entitlements (
  plan_id TEXT NOT NULL REFERENCES plans(id),
  feature TEXT NOT NULL,
  quota INTEGER,
  period TEXT NOT NULL DEFAULT 'day',       -- day | month
  PRIMARY KEY (plan_id, feature)
);

-- Buyer records (only once paid plans exist). Tax-invoice fields are optional for B2C.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  tax_id TEXT,
  address TEXT,
  branch TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL,                     -- active | expired | cancelled
  period TEXT NOT NULL,                     -- month | year
  current_period_start INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_customer ON subscriptions(customer_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,                      -- random, unguessable (also the polling handle)
  customer_id TEXT REFERENCES customers(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  plan_id TEXT,
  period TEXT,
  kind TEXT NOT NULL DEFAULT 'checkout',    -- checkout | admin_test
  provider TEXT NOT NULL DEFAULT 'opn',
  method TEXT NOT NULL DEFAULT 'promptpay',
  provider_charge_id TEXT UNIQUE,
  livemode INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  amount_satang INTEGER NOT NULL,           -- total charged
  subtotal_satang INTEGER NOT NULL,         -- amount before VAT
  vat_satang INTEGER NOT NULL,
  vat_rate_bp INTEGER NOT NULL,             -- basis points: 700 = 7 %
  status TEXT NOT NULL,                     -- pending | successful | failed | expired
  failure_code TEXT,
  qr_download_uri TEXT,
  expires_at INTEGER,
  paid_at INTEGER,
  receipt_no TEXT UNIQUE,                   -- LQ-YYYYMM-000001 (tax invoice no. when VAT registered)
  doc_type TEXT,                            -- receipt | tax_invoice_receipt
  buyer_name TEXT, buyer_tax_id TEXT, buyer_address TEXT, buyer_branch TEXT, buyer_email TEXT,
  seller_name TEXT, seller_tax_id TEXT, seller_address TEXT, seller_branch TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX payments_created ON payments(created_at);

-- Incoming webhooks (deduplicated by provider event id). Raw payload is purged after WEBHOOK_PAYLOAD_DAYS.
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_key TEXT,
  charge_id TEXT,
  signature_ok INTEGER NOT NULL,
  result TEXT,
  payload TEXT,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE (provider, event_id)
);
CREATE INDEX webhooks_received ON webhooks(received_at);

-- Gap-free document numbering (receipts / tax invoices).
CREATE TABLE counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- 0021_seller.sql — "ข้อมูลกิจการ" seller details + quotation / invoice / receipt documents (owner order 2026-11-18).
-- The seller's business details live ONLY in this database (never in the repository, which is public; never in a log
-- line, an audit row or analytics; never sent to AI). Owner-only routes in backend/src/seller.js; every change needs the
-- owner's password + a 6-digit code in that request and is audited as who / when / which fields (no values).
-- Apply this migration BEFORE deploying the Worker that uses it (new code without 0021 = the seller tab answers 500).

-- one row (id = 1); NULL / '' = not filled in yet
CREATE TABLE seller_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  legal_name TEXT,
  tax_id TEXT,                    -- 13 digits
  branch TEXT,                    -- e.g. สำนักงานใหญ่ / สาขาที่ 00001
  address TEXT,
  vat_registered INTEGER,         -- NULL = not answered yet, 0 = not registered, 1 = registered
  vat_rate_bp INTEGER,            -- basis points (700 = 7 %); used only when vat_registered = 1
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_no TEXT,           -- digits only
  contact_phone TEXT,             -- digits (optional leading +)
  contact_email TEXT,
  contact_line TEXT,
  doc_prefix TEXT,                -- A-Z 0-9 -, at most 10
  logo_mime TEXT,                 -- image/png | image/jpeg | image/webp
  logo_data TEXT,                 -- base64, at most seller.js LOGO_MAX_BYTES decoded (no R2 binding on this account today)
  logo_bytes INTEGER,
  updated_at INTEGER
);
INSERT INTO seller_profile (id) VALUES (1);

-- documents: a draft shows the CURRENT seller details; issuing freezes them (seller_json) and takes the next number
CREATE TABLE seller_docs (
  id TEXT PRIMARY KEY,            -- 32 hex
  doc_type TEXT NOT NULL CHECK (doc_type IN ('quotation', 'invoice', 'receipt')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
  number TEXT UNIQUE,             -- <prefix>-<QT|IV|RC>-<6 digits>; NULL while a draft; kept when voided (never reused)
  seq INTEGER,
  issue_token TEXT,
  buyer_json TEXT NOT NULL,       -- {name, tax_id?, address?, branch?}
  lines_json TEXT NOT NULL,       -- [{id, qty}] — prices are read from backend/src/price-list.js, never from the client
  extra_json TEXT,                -- {valid_days?, due_days?, paid_on?, ref?, note?}
  seller_json TEXT,               -- frozen seller details at issue time (without the logo bytes: see logo_hash)
  lines_frozen_json TEXT,         -- frozen lines at issue time (names TH/EN/ZH, unit price, minimum, amount): a later price
                                  -- change or a removed price line never changes an issued document
  logo_hash TEXT,                 -- the logo printed on the issued document (seller_logos.hash), NULL = no logo
  subtotal_satang INTEGER,        -- frozen at issue time (excl. VAT)
  vat_rate_bp INTEGER,
  vat_satang INTEGER,
  total_satang INTEGER,
  created_at INTEGER NOT NULL,
  issued_at INTEGER,
  voided_at INTEGER
);
CREATE UNIQUE INDEX seller_docs_type_seq ON seller_docs (doc_type, seq);
CREATE INDEX seller_docs_created ON seller_docs (created_at);

-- logos printed on issued documents, one row per distinct logo (content hash), so documents do not each copy the image
CREATE TABLE seller_logos (
  hash TEXT PRIMARY KEY,          -- sha256 hex of the base64 data
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- the number sequence per document type: only ever incremented (inside the issuing D1 batch), never reset
CREATE TABLE seller_doc_seq (
  doc_type TEXT PRIMARY KEY,
  last INTEGER NOT NULL
);

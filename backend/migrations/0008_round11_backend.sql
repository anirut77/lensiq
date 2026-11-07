-- 0008_round11_backend.sql — round 11: atomic + self-healing fulfilment, partial refunds with per-payment revocation,
-- credit notes, admin re-auth rate limit / sudo window, quota tombstones across erasure, B2B leads inbox,
-- age-of-majority confirmation at checkout.

-- ---- fulfilment: what a successful payment granted, and when -----------------------------------------------------------
-- fulfilled_at  set in the SAME transaction that grants the plan / credits (billing.js fulfilStatements); a successful
--               payment with fulfilled_at IS NULL is repaired by applyCharge (webhook retry / poll) and the reconcile cron
-- fulfil_token  random claim token written by the winning transaction; the grant statements only run when it matches
-- ext_seconds   how much subscription time THIS payment added (a refund of a renewal removes only its own days)
ALTER TABLE payments ADD COLUMN fulfilled_at INTEGER;
ALTER TABLE payments ADD COLUMN fulfil_token TEXT;
ALTER TABLE payments ADD COLUMN ext_seconds INTEGER;
ALTER TABLE payments ADD COLUMN age_confirm TEXT;      -- 'adult' (20+) | 'guardian' (minor with guardian consent) | 'adult_or_guardian'
ALTER TABLE payments ADD COLUMN refund_token TEXT;     -- claim token of the refund transaction that last changed refund_satang
CREATE INDEX payments_unfulfilled ON payments(status, fulfilled_at);

-- payments that were already fulfilled before this migration (evidence: a linked subscription or credits rows, or a kind
-- that grants nothing) are marked fulfilled so the repair pass never grants them twice
UPDATE payments SET fulfilled_at = COALESCE(paid_at, updated_at)
  WHERE status IN ('successful', 'refunded') AND fulfilled_at IS NULL
    AND (kind != 'checkout' OR subscription_id IS NOT NULL OR id IN (SELECT payment_id FROM credits WHERE payment_id IS NOT NULL));

-- ---- refunds: one row per (partial) refund; payments.refund_satang stays the running total --------------------------------
-- payment status: 'partially_refunded' while refund_satang < amount_satang, 'refunded' once fully refunded
CREATE TABLE refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  amount_satang INTEGER NOT NULL,
  reference TEXT NOT NULL,                 -- bank-transfer reference (PromptPay cannot be refunded through Opn)
  note TEXT,
  credit_note_no TEXT UNIQUE,              -- CN-YYYYMM-000001 (ใบลดหนี้) when the payment was a VAT tax invoice
  seconds_removed INTEGER NOT NULL DEFAULT 0,
  credits_revoked INTEGER NOT NULL DEFAULT 0,
  subscription_cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX refunds_payment ON refunds(payment_id, ts);

-- ---- admin sessions: re-auth rate limit + "sudo" window ------------------------------------------------------------------
ALTER TABLE admin_sessions ADD COLUMN reauth_at INTEGER NOT NULL DEFAULT 0;     -- last successful POST /admin/api/reauth
ALTER TABLE admin_sessions ADD COLUMN reauth_fails INTEGER NOT NULL DEFAULT 0;  -- wrong re-auths in this session

-- ---- B2B demo requests (POST /v1/leads, Turnstile-protected); purged after LEADS_DAYS ----------------------------------------
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  product TEXT NOT NULL,                   -- the form's "interest": marketing | store | photobooth | addons | hr | creative | fortune | unsure | …
  plan TEXT,                               -- package the requester picked (optional)
  source TEXT,                             -- page / box the request came from (index, pricing, account, …)
  name TEXT NOT NULL,
  company TEXT,                            -- the form's "org" field
  email TEXT,
  phone TEXT,
  message TEXT,
  lang TEXT,
  consent_version TEXT NOT NULL,           -- the contact notice the requester accepted
  status TEXT NOT NULL DEFAULT 'new',      -- new | acked
  acked_at INTEGER
);
CREATE INDEX leads_open ON leads(status, created_at);

-- ---- member sessions: fresh Google re-auth for erasure / export (DELETE /api/me, export) ------------------------------------
ALTER TABLE member_sessions ADD COLUMN reauth_at INTEGER NOT NULL DEFAULT 0;   -- last POST /api/auth/reauth (new ID token + nonce)

-- 0006_consumer_pricing.sql — round 10: owner-decided Thai consumer pricing, one-time purchases (credits), refunds,
-- idempotent checkout, admin alerts, complimentary / cancelled subscriptions.
-- Amounts in satang (1 THB = 100 satang), VAT-inclusive when VAT_REGISTERED. Every price stays editable from the admin
-- API (PUT /admin/api/billing/plans/:id). Only plans with status 'active' can be bought (draft / retired refused).

-- ---- plans: kind (subscription | one_time), audience (consumer | business), one-time price, Chinese name ----------------
ALTER TABLE plans ADD COLUMN kind TEXT NOT NULL DEFAULT 'subscription';
ALTER TABLE plans ADD COLUMN audience TEXT NOT NULL DEFAULT 'business';
ALTER TABLE plans ADD COLUMN price_once_satang INTEGER;
ALTER TABLE plans ADD COLUMN name_zh TEXT;

UPDATE plans SET audience = 'consumer', name_zh = '免费' WHERE id = 'free';
-- existing Pro / Business keep their prices (990 / 3,900 THB per month) as business / creator plans
UPDATE plans SET name_zh = '专业版', notes = 'Business / creator plan — 990 THB/month, 9,900 THB/year' WHERE id = 'pro';
UPDATE plans SET name_zh = '商业版', notes = 'Business plan — 3,900 THB/month, 39,000 THB/year' WHERE id = 'business';
UPDATE plans SET name_zh = '企业版' WHERE id = 'enterprise';
UPDATE plans SET sort = sort + 10 WHERE id IN ('pro', 'business', 'enterprise');

INSERT INTO plans (id, name_th, name_en, name_zh, price_month_satang, price_year_satang, price_once_satang, status, sort, notes, kind, audience) VALUES
  ('plus',          'พลัส',             'Plus',                 '加强版',     14900, 99000, NULL,  'active', 1, 'Member plan — 149 THB/month, 990 THB/year', 'subscription', 'consumer'),
  ('report_basic',  'รายงานดวงพื้นฐาน',  'Basic reading report', '基础运势报告', NULL,  NULL,  4900,  'active', 2, 'One-time purchase — 49 THB',  'one_time', 'consumer'),
  ('report_compat', 'รายงานดวงคู่',      'Compatibility report', '合盘报告',    NULL,  NULL,  9900,  'active', 3, 'One-time purchase — 99 THB',  'one_time', 'consumer'),
  ('report_annual', 'รายงานดวงรายปี',    'Annual forecast report', '年度运势报告', NULL, NULL,  19900, 'active', 4, 'One-time purchase — 199 THB', 'one_time', 'consumer');

-- Subscription plans: quota per period (day | month). One-time plans: period 'once' = credits granted per purchase
-- (credits table below), consumed by checkEntitlement() after the plan quota.
INSERT INTO entitlements (plan_id, feature, quota, period) VALUES
  ('plus',          'ai_reading',    30, 'month'),
  ('plus',          'csv_export',    0,  'month'),
  ('report_basic',  'report_basic',  1,  'once'),
  ('report_basic',  'ai_reading',    1,  'once'),
  ('report_compat', 'report_compat', 1,  'once'),
  ('report_compat', 'ai_reading',    2,  'once'),
  ('report_annual', 'report_annual', 1,  'once'),
  ('report_annual', 'ai_reading',    3,  'once');

-- ---- credits (one-time purchase entitlements, complimentary grants) ---------------------------------------------------
-- Owned by a member (user_id) or, for a legacy guest checkout, by the customer until POST /v1/billing/claim links it.
CREATE TABLE credits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  customer_id TEXT,
  feature TEXT NOT NULL,
  granted INTEGER NOT NULL,
  remaining INTEGER NOT NULL,
  payment_id TEXT,                          -- the purchase (NULL = complimentary grant by the owner)
  source TEXT NOT NULL DEFAULT 'purchase',  -- purchase | comp
  created_at INTEGER NOT NULL,
  expires_at INTEGER                        -- NULL = no expiry
);
CREATE INDEX credits_user ON credits(user_id, feature);
CREATE INDEX credits_customer ON credits(customer_id);
CREATE INDEX credits_payment ON credits(payment_id);

-- ---- payments: idempotent checkout, manual refunds (PromptPay cannot be refunded through Opn: bank transfer) ----------
ALTER TABLE payments ADD COLUMN idem_scope TEXT;     -- 'u:<user id>' or 'g:<day-salted caller hash>'
ALTER TABLE payments ADD COLUMN idem_key TEXT;       -- client Idempotency-Key
ALTER TABLE payments ADD COLUMN refund_ref TEXT;     -- bank-transfer reference of the manual refund
ALTER TABLE payments ADD COLUMN refund_satang INTEGER;
ALTER TABLE payments ADD COLUMN refund_note TEXT;
ALTER TABLE payments ADD COLUMN refunded_at INTEGER;
ALTER TABLE payments ADD COLUMN mismatch_detail TEXT; -- JSON {amount, currency} the provider reported (status 'mismatch')
CREATE UNIQUE INDEX payments_idem ON payments(idem_scope, idem_key);

-- ---- subscriptions: complimentary grants, cancellation -----------------------------------------------------------------
ALTER TABLE subscriptions ADD COLUMN source TEXT NOT NULL DEFAULT 'purchase'; -- purchase | comp
ALTER TABLE subscriptions ADD COLUMN cancelled_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN note TEXT;

-- ---- admin alerts (payment mismatch, …): shown in the admin until acknowledged --------------------------------------
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                       -- payment_mismatch
  ref TEXT,                                 -- payment id
  detail TEXT,                              -- JSON, no personal data
  acknowledged_at INTEGER
);
CREATE INDEX alerts_open ON alerts(acknowledged_at, ts);

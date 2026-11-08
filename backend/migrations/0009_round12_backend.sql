-- 0009_round12_backend.sql — round 12: expiry sweep index, short-lived member sessions + token refresh, transactional
-- e-mail (opt-outs + delivery log), CSP violation report counters.

-- ---- pending-payment expiry sweep (billing.js expirySweep): pending rows ordered by their QR expiry -----------------------
CREATE INDEX payments_pending_expiry ON payments(status, expires_at);

-- ---- member sessions: 'long' (default: 30 days absolute / 14 days idle, "remember me") or 'short' (members.js
-- SHORT_SESSION_*: 12 h absolute / 1 h idle, rotated with POST /api/auth/refresh up to 7 days after sign-in) -----------------
ALTER TABLE member_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'long';
ALTER TABLE member_sessions ADD COLUMN signed_in_at INTEGER;   -- first sign-in of a refreshed session chain (short sessions)

-- ---- transactional e-mail (mail.js): per-member opt-outs. Receipts / credit notes / renewal reminders are ALSO always in the
-- account page; turning the e-mail off never hides a document. Marketing stays the separate marketing_opt_in. -------------
ALTER TABLE users ADD COLUMN email_receipts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;

-- delivery log: one row per (kind, ref) — the UNIQUE key also makes every mail idempotent (a retried webhook never sends a
-- second receipt). No address, subject or body is stored: only the member id (cleared on erasure), the provider's
-- message id and the outcome. Purged after AUDIT_DAYS (retention.js).
CREATE TABLE mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- receipt | credit_note | renewal_reminder
  ref TEXT NOT NULL,                       -- payment id | refund id | subscription id + ':' + period end
  user_id TEXT,
  provider TEXT NOT NULL,                  -- resend | mailchannels | none
  status TEXT NOT NULL,                    -- sent | failed | skipped_not_configured | skipped_opt_out | skipped_no_address
  provider_id TEXT,
  error TEXT,                              -- HTTP status / error name only
  UNIQUE (kind, ref)
);
CREATE INDEX mail_log_ts ON mail_log(ts);

-- ---- CSP violation reports (POST /v1/csp-report): daily COUNTERS only — directive, blocked origin (scheme + host) and page
-- path without query; no IP, no user agent, no full URL, no script sample. Purged after CSP_REPORT_DAYS (retention.js). -----
CREATE TABLE csp_reports (
  day TEXT NOT NULL,
  directive TEXT NOT NULL,
  blocked TEXT NOT NULL,
  page TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, directive, blocked, page)
);

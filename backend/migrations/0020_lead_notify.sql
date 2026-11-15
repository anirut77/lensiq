-- 0020_lead_notify.sql — "LINE lead notification is never silent" (owner order 2026-11-15).
-- Production showed two leads with no LINE push and no trace of why. Each lead now records the result of its one LINE
-- notification attempt, written once (never overwritten):
--   notify_state   sent | skipped (a LINE secret is missing or malformed) | failed (LINE answered non-2xx or no answer) |
--                  capped (LEAD_NOTIFY_LINE_DAY reached); 'pending' = written at INSERT by the new code until the result
--                  is recorded (still pending after 60 s = "unknown" in the inbox, review D3); NULL = rows from before
--                  this migration / this code (no badge). Apply this migration BEFORE deploying the Worker that uses it.
--   notify_detail  short code, no personal data and never a secret value:
--                  "http_<status>" (0 = network error / timeout), "cap_<n>", or "<SECRET_NAME>:<reason>[,...]"
--                  (reasons: missing, whitespace, too_short, starts_with_at, wrong_length, not_u32hex)
--   notify_at      unix seconds of the result (the time of the success for "sent")
-- No personal data is added (docs/PDPA-NOTES-FOR-COUNSEL.md); the columns go with the lead when it is purged or deleted.
ALTER TABLE leads ADD COLUMN notify_state TEXT;
ALTER TABLE leads ADD COLUMN notify_detail TEXT;
ALTER TABLE leads ADD COLUMN notify_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_leads_notify ON leads (notify_state, notify_at);

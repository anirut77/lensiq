-- 0018_accounts.sql (written as 0017, renumbered after 0017_tryon.sql merged first) — stream G (owner decisions 2026-11-13): accounts + billing groundwork. Additive only: nothing
-- existing is dropped, renamed or rewritten.
--   * LINE Login next to Google sign-in: linked sign-in identities + short-lived LINE sign-in flows
--   * organisation account LITE: organisation name, billing details, admins and staff, invitations, a per-organisation
--     audit log (hash chain). NO table for the customer's people data (employees, plates, residents, candidates): that
--     data stays on the customer's devices
--   * licence plans for back-office orders (Gate, Attendance, Exam lab, Crowd report) WITHOUT prices: the price is in the
--     quotation; the order row records the amount the owner entered from the quotation / bank transfer
-- Timestamps are unix seconds UTC; ids are random 128-bit hex handles, like users.id.

-- Sign-in identities other than the Google account in users.google_sub (today: LINE). A LINE-only account keeps a
-- placeholder users.google_sub = 'nogoogle:<users.id>' (':' cannot occur in a Google sub, so it never matches one) and
-- users.email = '' (LINE Login is used without the e-mail permission). `sub` is the provider's stable account id; it is
-- used only to recognise the sign-in and is never exported, logged or shown.
CREATE TABLE user_identities (
  provider TEXT NOT NULL,                   -- line
  sub TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX user_identities_user ON user_identities(user_id);

-- One LINE authorisation round trip (10 minutes, single use, deleted when used; expired rows purged daily). Only hashes
-- of the `state` sent to LINE and of the browser binding (kept in the starting tab's sessionStorage) are stored. The PKCE
-- verifier and the nonce live only as long as the row.
CREATE TABLE line_auth_flows (
  state_hash TEXT PRIMARY KEY,
  binding_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  mode TEXT NOT NULL,                       -- signin | link | reauth
  user_id TEXT,                             -- link / reauth: the signed-in member who started it
  session_hash TEXT,                        -- link / reauth: member_sessions.id_hash that must finish it
  accept_terms INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  session_kind TEXT NOT NULL DEFAULT 'long',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX line_auth_flows_exp ON line_auth_flows(expires_at);

-- Security review 2026-11-14 (M1): a nonce knows what it was issued for. NULL = sign-in; 'reauth' = a fresh
-- confirmation (export, erasure, linking / unlinking a sign-in method, org role changes). A Google ID token without
-- auth_time is accepted as a fresh confirmation only with a 'reauth' nonce; a 'reauth' nonce never signs anyone in.
ALTER TABLE auth_nonces ADD COLUMN purpose TEXT;

-- Organisation account (lite).
CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                       -- <= 120
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended | closed
  billing_name TEXT,                        -- legal name on quotations / receipts (<= 120)
  billing_tax_id TEXT,                      -- 13 digits
  billing_address TEXT,                     -- <= 300
  billing_branch TEXT,                      -- <= 60
  billing_email TEXT,                       -- where quotations / receipts go (<= 254)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,                       -- admin | staff
  is_owner INTEGER NOT NULL DEFAULT 0,      -- at most one per organisation (an admin)
  status TEXT NOT NULL DEFAULT 'active',    -- active | disabled
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user ON org_members(user_id);

-- Invitation links (72 h, single use). Only the SHA-256 of the link token is stored; an optional e-mail binding is an
-- HMAC (key derived from SECRETS_KEK) of the lower-cased address, never the address itself.
CREATE TABLE org_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  role TEXT NOT NULL,                       -- admin | staff
  owner_invite INTEGER NOT NULL DEFAULT 0,  -- 1 = accepting makes the organisation owner (issued by the LENSIQ owner only)
  token_hash TEXT NOT NULL UNIQUE,
  email_hmac TEXT,
  created_by_ref TEXT NOT NULL,             -- pseudonymous actor ref (see org_audit) or 'lensiq_owner'
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX org_invites_org ON org_invites(org_id);
CREATE INDEX org_invites_exp ON org_invites(expires_at);

-- Per-organisation audit log, SHA-256 hash chain (tamper evidence, not a legal signature). Actors and target members are
-- stored as pseudonymous refs (SHA-256 of "org-actor|" + users.id, 32 hex): after a member's erasure the ref links to
-- nobody, and the chain stays verifiable. `detail` holds field names / counts only, never values such as a tax id.
CREATE TABLE org_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  actor_kind TEXT NOT NULL,                 -- user | lensiq_owner | system
  actor_ref TEXT,
  action TEXT NOT NULL,
  ref TEXT,
  detail TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX org_audit_org ON org_audit(org_id, id);

-- Back-office order plans (owner decision 2026-11-13: only Gate, Attendance, Exam lab room and Crowd report; no online
-- purchase). No price column on purpose: prices live in the quotation and the approved price list (docs/BILLING-PLAN.md
-- §4.1); the order row keeps the amount actually quoted.
CREATE TABLE licence_plans (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,                    -- gate | attendance | exam | crowd
  unit TEXT NOT NULL,                       -- lane_month | person_month | candidate | room_month | device_day | trial
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'order_only',
  sort INTEGER NOT NULL DEFAULT 0
);
INSERT INTO licence_plans (id, product, unit, name_th, name_en, name_zh, sort) VALUES
  ('gate_trial', 'gate', 'trial', 'Gate ทดลองใช้ 30 วัน (1 ช่องทาง)', 'Gate 30-day trial (1 lane)', 'Gate 30 天试用（1 条车道）', 10),
  ('gate_lane', 'gate', 'lane_month', 'Gate รายเดือนต่อช่องทาง', 'Gate per lane per month', 'Gate 每条车道每月', 11),
  ('attendance_person', 'attendance', 'person_month', 'ลงเวลาทำงาน ต่อคนต่อเดือน', 'Attendance per person per month', '考勤 每人每月', 20),
  ('exam_lab_candidate', 'exam', 'candidate', 'Exam ห้องคอมพิวเตอร์ ต่อผู้สอบ', 'Exam lab per candidate', 'Exam 机房 每名考生', 30),
  ('exam_lab_room', 'exam', 'room_month', 'Exam ห้องคอมพิวเตอร์ ต่อห้องต่อเดือน', 'Exam lab per room per month', 'Exam 机房 每间每月', 31),
  ('crowd_report', 'crowd', 'device_day', 'Crowd รายงานวันงาน ต่อเครื่องต่อวัน', 'Crowd event report per device per day', 'Crowd 活动报告 每台设备每天', 40);

-- Licence orders entered by the LENSIQ owner after a quotation and a bank transfer.
CREATE TABLE org_licences (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  plan_id TEXT NOT NULL REFERENCES licence_plans(id),
  quantity INTEGER NOT NULL,                -- lanes / people / candidates / rooms / device-days
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',    -- active | cancelled
  order_ref TEXT,                           -- quotation / transfer reference (<= 80)
  amount_satang INTEGER,                    -- excl. 7 % VAT, as quoted (back office only)
  note TEXT,                                -- <= 300
  created_at INTEGER NOT NULL,
  cancelled_at INTEGER
);
CREATE INDEX org_licences_org ON org_licences(org_id, status);

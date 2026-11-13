# Organisation accounts: design (round 16, item 4)

> **Status: DESIGN ONLY. No code, no migration and no deploy are part of this document.** It waits for the owner's
> approval and a lawyer's review of section 9 before any build starts. Target is Cloudflare **staging** only (Workers +
> D1, test data, no real keys). Not legal advice: every lawful basis below is a draft "to be confirmed by counsel".
>
> **Update 2026-11-13 (owner decision):** the first version of organisation accounts is the **lite** one, planned and not built: organisation name, billing details, admins and staff, invitations, and **no syncing of the customer's people data**. The sync design below (sections on sync, data model for synced records, and the PDPA analysis for central storage) stays on file as a later option and is not the next build. A licence works offline for 14 days (planned).
>
> Written 2026-11-08 from the code as it is today: `backend/migrations/0001–0009`, `docs/BACKEND.md`, `docs/EXAM.md`,
> `docs/GATE.md`, `docs/ATTENDANCE-READINESS.md`, `docs/pdpa/*`, `docs/PDPA-NOTES-FOR-COUNSEL.md`, `gate-kit.js`,
> `gate-rules.js`, `parking.js`, `village.js`, `attendance-hr.js`, `lensiq-timeclock.js`, `lensiq-exam-clip.js`,
> `exam-link.js`.

## สรุปสั้นสำหรับเจ้าของและทนาย (Thai summary)

- **สิ่งที่เปลี่ยน:** วันนี้ข้อมูล Exam, Gate และลงเวลาอยู่ในเครื่องของลูกค้าเท่านั้น LENSIQ ไม่ได้รับข้อมูลเลย บัญชีองค์กรจะทำให้
  ข้อมูลบางส่วน (ทะเบียนรถ, รายชื่อลูกบ้าน, เวลาเข้าออกงาน, รายการแจ้งเตือนในห้องสอบ) **ถูกเก็บรวมศูนย์บน
  Cloudflare** ซึ่งอยู่นอกประเทศไทย LENSIQ จึงเปลี่ยนจาก "ผู้ขายซอฟต์แวร์" เป็น **ผู้ประมวลผลข้อมูล (ม.40)** ของแต่ละองค์กร
  และต้องมีสัญญาประมวลผลข้อมูล (DPA) กับลูกค้าทุกราย
- **สิ่งที่ไม่เปลี่ยน (ค่าเริ่มต้น):** ค่าใบหน้า (face descriptor), คลิปหลักฐานการสอบ, ภาพครอปป้ายทะเบียน, ภาพจากกล้อง,
  แฮช PIN และโทเค็นบัตร QR **ยังอยู่ในเครื่องเท่านั้น** เว้นแต่เจ้าของจะตัดสินใจเป็นอย่างอื่นหลังทนายตรวจ
- **ชื่อผู้มาติดต่อ (visitor names) ก็อยู่ในเครื่องที่สร้างบัตรผ่านเท่านั้นเป็นค่าเริ่มต้น** เครื่องอื่นเห็นเพียง "ผู้มาติดต่อบ้านเลขที่ X"
  ชื่อจะซิงก์ก็ต่อเมื่อองค์กรเปิดตัวเลือก `sync_visitor_names` เอง (การตัดสินใจ D4, ค่าเริ่มต้นปิด)
- **การซิงก์ปิดเป็นค่าเริ่มต้น** เปิดได้ต่อองค์กรและต่อผลิตภัณฑ์โดย **เจ้าของบัญชีองค์กร (org owner) เท่านั้น** หลังยอมรับ DPA
  แล้ว และแต่ละเครื่องต้องลงทะเบียนพร้อมติ๊กยืนยันรายการข้อมูลที่จะส่ง
- **คำถามสำหรับทนาย** อยู่ที่ข้อ 10 (16 ข้อ) **สิ่งที่เจ้าของต้องเตรียม** อยู่ที่ข้อ 12

## 0. Fixed coverage list (written before the design)

The design is complete only when every row below has an answer in this document. Row = spec requirement (R16-SPEC S4).

| # | Requirement | Section |
|---|---|---|
| C1 | D1 data model: tables, keys, which existing migrations it extends | 2 |
| C2 | Roles org / admin / staff and a permission matrix | 3 |
| C3 | Device enrolment | 4 |
| C4 | Sync per product (Exam, Gate, Attendance): what syncs, what stays on the device; default face descriptors and exam clips stay | 5 |
| C5 | Conflict handling | 6 |
| C6 | Export and backup format | 7 |
| C7 | PDPA per data type: plates, face descriptors, attendance records, exam flags and clips, visitor names — lawful basis, controller / processor, cross-border transfer (Cloudflare), retention, data-subject rights | 9 |
| C8 | DPIA delta | 9.4 |
| C9 | Open questions for the lawyer | 10 |
| C10 | Effort per phase | 11 |
| C11 | What the owner must prepare | 12 |

Data-type inventory used for C4 and C7 (from the current code, not invented):

| Product | Record (today, on the device) | Where it lives today | Personal data? |
|---|---|---|---|
| Gate | gate event `ev` {at, dir, key (plate), province, moto, gate, by (operator), decision, pass, paid…} | IndexedDB `lq-gate-parking` / `lq-gate-village`, store `rec` | yes, when linkable to a person |
| Gate | resident `res` {house, key, province} | same | yes (house + plate) |
| Gate | deny `deny` {key, province, why, by} | same | yes, and adverse (reason) |
| Gate | visitor pass `pass` {code, house, key, province, **name** (≤ 60), from, to, uses, used, revoked} | same | yes (visitor name) |
| Gate | monthly pass `mpass`, receipt `rc`, shift `shift`, shop `shop`, stamp use `stampUsed` | same | receipts: plate + amount |
| Gate | plate crop `img` (optional, off by default, 7–30 days) | same | yes (image) |
| Gate | correction audit `au` (FNV-1a chain) | same | operator names |
| Gate | settings incl. relay URL + **relay token**, PromptPay id | localStorage | secret / business |
| Attendance | employee {id, code, name, dept, shift}; PIN salt+hash; QR token | localStorage `att-hr-emps` | yes |
| Attendance | punch {id, emp, ts, type, method, dev} | `att-hr-punches` | yes (time records, s.114) |
| Attendance | audit (SHA-256 chain), leave, shifts, holidays, settings | `att-hr-*` | yes (leave type can hint at health: sick leave) |
| Attendance | face descriptors (encrypted, LQVault) | `lqv-att-faces` | **sensitive, s.26 biometric** |
| Exam | event `ev` {room, node, src, seat, sig, lvl, t, dur, n, what, code} | BroadcastChannel / JSON file / `lq-exam-board-<room>` | yes when the seat maps to a candidate |
| Exam | board actions (check, no issue, note, escalate) with **invigilator name**, tallies, summary | `lq-exam-board-<room>` | yes |
| Exam | accommodation profile per seat {gazeOff, noFaceX, readAloud, breaks, ticX} (no diagnosis) | board + `prof` message | yes; may **reveal a disability / health need** |
| Exam | evidence clip (opt-in, 10 s, encrypted) + metadata | IndexedDB `lq-exam-clips`, key in `lensiq-vault` | yes (video of candidates) |
| Exam | clip PIN hash | localStorage `lq-exam-clip-pin` | secret |
| Platform (new) | org admin / staff accounts: e-mail, Google `sub`, role | D1 (new) | yes |
| Platform (new) | enrolled devices, sync audit | D1 (new) | pseudonymous / operational |

## 1. Goals, non-goals and principles

Goals (round 16 item 4): an organisation (a school, a condo juristic person, a company) has one account with admins and
staff, several devices share live data (multi-lane gate, several exam-room cameras + dashboard, several time clocks and
branches), and the organisation can export and back up its own data.

Non-goals for this phase: production deploy, payment for org plans (billing exists in `0002/0006`; org plans are
an owner pricing decision, item 6), face matching on the server, any server-side vision, LINE OA, payroll API.

Principles (all from CLAUDE.md and the existing backend):

1. **Off by default.** With `LENSIQ_API_BASE = ""` nothing changes. Sync is per org and per product, switched on by
   the **org owner only** (permission matrix §3) after accepting the DPA version. A device that is not enrolled never sends anything.
2. **Only derived, allowlisted records leave the device.** The server reuses the same strict allowlists the pages
   already use (`LQExam.cleanMsg`, `LQClock.cleanPack`, a new `GateRules.cleanRec`): an unknown key rejects the
   record. No image, frame, crop, clip, descriptor, PIN hash, QR token or relay token is ever accepted (server test).
3. **Device keeps working offline.** Every product stays fully usable without the network; sync is a background
   outbox. A gate decision never waits for the server.
4. **A person confirms decisions.** Sync does not add automation: no server-side auto-open, no server-side verdicts.
5. **Tenant isolation is a code invariant.** Every org table carries `org_id`; every query goes through one helper that
   requires it; tests run with two orgs and assert zero cross-org rows.
6. **Retention is enforced on the server too** (`expires_at` per row + the existing daily cron in `retention.js`).
7. **Transport is pluggable.** The same sync protocol can target the Cloudflare Worker or the LAN hub (`server.py`), so
   a customer that refuses a cross-border transfer can keep everything on premises.

## 2. Data model (Cloudflare D1, staging)

Proposed new migration: `backend/migrations/0010_org_accounts.sql` (one file, additive only; nothing existing is
dropped or renamed). Timestamps unix seconds UTC, like `0001`. IDs are random 128-bit handles (base32), never
sequential, like `users.id`.

### 2.1 What it reuses / extends from existing migrations

| Existing (migration) | Use in org accounts | Change |
|---|---|---|
| `users` (0005) | org admins and staff sign in with the existing Google sign-in; one user may belong to several orgs | none; membership lives in `org_members` |
| `member_sessions` (0005, 0007, 0009) | same bearer session; short sessions (`kind='short'`, 0009) **required** for org admins | `ALTER TABLE member_sessions ADD COLUMN org_id TEXT` (active org context, NULL = consumer) |
| `member_sessions.reauth_at` (0008) | fresh Google re-auth before export, erasure, role change, device revoke | none |
| `audit_log` (0001) | platform-level actions (org created, DPA accepted, owner break-glass) | none; per-org actions go to `org_audit` |
| `counters` (0002) | per-org server sequence `seq:<org_id>` for sync cursors | none (rows only) |
| `settings` (0001) | global switch `org_accounts_enabled` (default false) | rows only |
| `plans` / `entitlements` (0002, 0006) | org plan limits: `org_devices`, `org_sites`, `org_sync`, `org_export` | rows only (draft, item 6) |
| `usage_counters` (0001) | per-org push quota (abuse cap) | rows only |
| `customers` / `subscriptions` (0002, 0005) | an org's billing party later | `ALTER TABLE customers ADD COLUMN org_id TEXT` (later phase, only when org billing is approved) |
| `daily_salts`, `rate_limits` (0001) | rate limits for enrolment and push | none |

### 2.2 New tables

```sql
-- 0010_org_accounts.sql (PROPOSED, not written to the repo)

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                       -- <= 120
  kind TEXT NOT NULL,                       -- school | university | condo | village | carpark | company | other
  status TEXT NOT NULL DEFAULT 'active',    -- active | suspended | closing (export window) | deleted
  controller_name TEXT,                     -- legal name of the data controller (the customer)
  dpo_contact TEXT,                         -- controller's DPO / privacy contact (shown in notices)
  dpa_version TEXT,                         -- version of the LENSIQ DPA accepted; NULL = sync refused
  dpa_accepted_at INTEGER,
  dpa_accepted_by TEXT,                     -- users.id
  retention TEXT NOT NULL,                  -- JSON per record type (days), validated against floors/ceilings (§8)
  products TEXT NOT NULL DEFAULT '[]',      -- JSON ["exam","gate","attendance"] where sync is ON
  created_at INTEGER NOT NULL,
  closing_at INTEGER                        -- when status became 'closing'; data deleted 30 days later
);

CREATE TABLE org_sites (                    -- a campus, a car park, a village, a branch
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  product TEXT NOT NULL,                    -- exam | gate_parking | gate_village | attendance
  tz TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX org_sites_org ON org_sites(org_id);

CREATE TABLE org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,                       -- admin | staff   (owner of the org = an admin with is_owner = 1)
  is_owner INTEGER NOT NULL DEFAULT 0,      -- exactly one per org; cannot be removed, only transferred
  sites TEXT NOT NULL DEFAULT '*',          -- '*' or JSON array of org_sites.id the staff member may use
  products TEXT NOT NULL DEFAULT '*',       -- '*' or JSON array (exam | gate | attendance)
  status TEXT NOT NULL DEFAULT 'active',    -- active | disabled
  invited_by TEXT,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user ON org_members(user_id);

CREATE TABLE org_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  email_hash TEXT NOT NULL,                 -- HMAC(SECRETS_KEK-derived key, lower(e-mail)); the e-mail itself is not stored
  role TEXT NOT NULL,
  sites TEXT NOT NULL DEFAULT '*',
  token_hash TEXT NOT NULL UNIQUE,          -- SHA-256 of the one-time link token
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,              -- 72 h
  accepted_at INTEGER
);

CREATE TABLE org_devices (
  id TEXT PRIMARY KEY,                      -- also the device prefix of every record id it creates
  org_id TEXT NOT NULL REFERENCES orgs(id),
  site_id TEXT NOT NULL REFERENCES org_sites(id),
  product TEXT NOT NULL,
  name TEXT NOT NULL,                       -- "Gate A in", "Room 301 cam 2", "Branch 2 kiosk"
  pubkey TEXT NOT NULL,                     -- JWK of a non-extractable ECDSA P-256 key made on the device
  token_hash TEXT NOT NULL UNIQUE,          -- SHA-256 of the device bearer token
  ua_label TEXT,                            -- coarse "Chrome · Android", like 0007
  status TEXT NOT NULL DEFAULT 'active',    -- active | revoked
  enrolled_by TEXT NOT NULL,                -- users.id of the admin who approved
  enrolled_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  last_push_seq INTEGER NOT NULL DEFAULT 0, -- client-side sequence last accepted (gap detection)
  revoked_at INTEGER,
  revoked_by TEXT
);
CREATE INDEX org_devices_org ON org_devices(org_id, site_id);

CREATE TABLE org_enrol_codes (
  hash TEXT PRIMARY KEY,                    -- SHA-256 of an 8-char code + QR; one-time, 10 minutes
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  product TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_device TEXT
);

-- One table for every synced record; `type` selects the allowlist (§5). JSON `data` is the cleaned record only.
CREATE TABLE sync_records (
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  type TEXT NOT NULL,                       -- e.g. gate.ev, gate.res, att.punch, exam.ev (closed list in constants.js)
  id TEXT NOT NULL,                         -- client id: "<device id>-<ulid>" (append-only) or stable id (mutable)
  version INTEGER NOT NULL DEFAULT 1,       -- bumped on every accepted change of a mutable record
  deleted INTEGER NOT NULL DEFAULT 0,       -- tombstone
  data TEXT NOT NULL,                       -- JSON <= 8 KB after the allowlist
  device_id TEXT NOT NULL,                  -- who wrote this version
  actor TEXT,                               -- operator / invigilator / manager name as typed on the device (<= 60)
  client_ts INTEGER NOT NULL,
  server_ts INTEGER NOT NULL,
  seq INTEGER NOT NULL,                     -- per-org monotonically increasing (counters 'seq:<org>')
  expires_at INTEGER,                       -- retention (§8); NULL only for types with a legal floor handled by policy
  PRIMARY KEY (org_id, type, id)
);
CREATE INDEX sync_records_pull ON sync_records(org_id, site_id, seq);
CREATE INDEX sync_records_exp ON sync_records(expires_at);

CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL,
  rec_id TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  proposed TEXT NOT NULL,                   -- the rejected cleaned record (JSON)
  rule TEXT NOT NULL,                       -- which rule decided (CR1–CR9, §6)
  ts INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution TEXT                           -- kept_server | took_device | merged
);
CREATE INDEX sync_conflicts_open ON sync_conflicts(org_id, resolved_at);

-- Per-org audit, SHA-256 hash chain on the server (cross-device tamper evidence; still not a legal signature).
CREATE TABLE org_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  actor_kind TEXT NOT NULL,                 -- user | device | system | lensiq_owner (break-glass)
  actor_id TEXT,
  action TEXT NOT NULL,                     -- member.invite, device.enrol, device.revoke, export.create, record.purge …
  ref TEXT,
  detail TEXT,                              -- JSON <= 1000, no personal data beyond ids
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX org_audit_org ON org_audit(org_id, ts);

-- Data-subject requests the controller logs (helps it meet the 30-day reply period, PDPA s.30).
CREATE TABLE org_dsr (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,                       -- access | rectify | erase | object | restrict | portability | withdraw
  subject_ref TEXT NOT NULL,                -- plate / employee code / seat+exam id, as typed (HMAC-hashed after closing)
  received_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  closed_at INTEGER,
  outcome TEXT,
  handled_by TEXT
);

CREATE TABLE org_exports (                  -- log only; the file is streamed, never stored on Cloudflare
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  ts INTEGER NOT NULL,
  scope TEXT NOT NULL,                      -- JSON {products, sites, from, to, types}
  records INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                     -- of the plaintext bundle, so a restore can be verified
  encrypted INTEGER NOT NULL
);
```

Size check against D1 limits ([limits](https://developers.cloudflare.com/d1/platform/limits/), accessed 2026-11-08: 500 MB per database on
Free, 10 GB on Paid; 2 MB per row; 100 bound parameters per query; 50 / 1,000 queries per invocation on Free / Paid,
`batch()` counts as one). A car-park lane with 1,500 events/day × ~400 bytes ≈ 220 MB per year per lane; a 200-staff
company ≈ 200 × 4 punches × 250 working days × ~200 bytes ≈ 40 MB/year. **The inputs (1,500 events a day per lane,
~400 bytes per gate row, ~200 bytes per punch row) are estimates, not measured**; P3 measures real row sizes on the
D1 shim and P9 replaces them with staging numbers. **One shared staging database is enough;
for production, plan one D1 database per org** (also simplifies erasure and a per-org location hint).

## 3. Roles and permission matrix

Roles: **LENSIQ owner** (the existing single platform admin, `admin_users.id = 1`, not a member of any org),
**org admin** (`role = admin`; one of them `is_owner`), **staff** (`role = staff`, limited to `sites` / `products`),
**device** (an enrolled browser; not a person). Staff on a shared kiosk do not need their own account: the device is
enrolled, and the name the guard / invigilator / manager types stays the `actor` like today.

| Action | LENSIQ owner | Org owner | Org admin | Staff | Device |
|---|---|---|---|---|---|
| Create org (staging: owner-created only) | ✓ | – | – | – | – |
| Accept DPA version, turn sync on/off per product | – | ✓ | – | – | – |
| Edit org profile, controller name, DPO contact | – | ✓ | ✓ | – | – |
| Set retention per type (within floors / ceilings) | – | ✓ | ✓ | – | – |
| Invite / disable members, change roles | – | ✓ | ✓ (not the owner) | – | – |
| Transfer org ownership | – | ✓ | – | – | – |
| Create sites | – | ✓ | ✓ | – | – |
| Issue enrolment code, revoke device | – | ✓ | ✓ | ✓ own sites, if the admin allows (`staff_can_enrol`, default off) | – |
| Push records (own site, own product) | – | – | – | – | ✓ |
| Pull records (own site, own product) | – | – | – | – | ✓ |
| View dashboards / reports across sites | – | ✓ | ✓ | ✓ own sites | – |
| Edit residents, deny list, passes, employees, shifts, seat maps | – | ✓ | ✓ | ✓ own sites (from an enrolled device) | ✓ (on behalf of the typed operator) |
| Resolve sync conflicts | – | ✓ | ✓ | – | – |
| Export / backup (fresh re-auth) | – | ✓ | ✓ | – | – |
| Restore from a backup into the org | – | ✓ | – | – | – |
| Log / close data-subject requests, erase one subject | – | ✓ | ✓ | – | – |
| Read org records | **break-glass only** (see below) | ✓ | ✓ | ✓ own sites | own site |
| Delete the org (30-day closing window with export) | on request, audited | ✓ | – | – | – |
| Suspend an org (abuse, unpaid) | ✓ (data kept, no read) | – | – | – | – |

**LENSIQ owner has no data view by default.** Support access is "break-glass": the org owner grants a time-limited
(≤ 24 h) support grant from the org settings, the LENSIQ owner re-authenticates with TOTP (mandatory on this path,
see below), every read is written to
`org_audit` with `actor_kind = lensiq_owner` and shown to the org admins. This keeps LENSIQ a processor acting only on
instructions (s.40(1)).

All org-admin actions need a short session (0009) and a **fresh Google re-auth** (the member re-auth of 0008: a new
Google ID token + nonce sets `member_sessions.reauth_at`; this is not TOTP) for export, restore, erasure, role change
and device revoke.

Break-glass is different: it is a LENSIQ-owner action on the admin side, where TOTP is optional today
(`backend/src/auth.js`, TOTP "optional", mandatory only via `requireOwnerTotpFor` for money ops). **This design makes
owner TOTP mandatory for the break-glass path**: a support grant cannot be used unless the owner's TOTP is switched on,
and the TOTP code is checked on that request (the same rule as money ops with `REQUIRE_OWNER_TOTP=true`).

## 4. Device enrolment

1. An org admin opens Org settings → Devices → "Add device", picks the site and product. The Worker creates an
   **8-character one-time code + QR** (`org_enrol_codes`, only the hash stored, 10 minutes, rate-limited 10/h per org).
2. On the device (the existing page: `parking.html`, `village.html`, `exam-hall.html`, `exam-lab.html`,
   `exam-dashboard.html`, `attendance.html`) the operator chooses "Connect to organisation" and scans / types the code.
   The page shows the org name, site and **what will be sent** (the per-product list from §5) and needs a tick.
3. The page makes a **non-extractable ECDSA P-256 key pair** with WebCrypto (kept in IndexedDB like `lensiq-vault`
   keys) and sends `{code, pubkey, name, ua_label}`. The Worker consumes the code atomically, stores the public key
   and returns a device id + a 256-bit device token (only its hash is stored).
4. Every push / pull carries `Authorization: Device <token>` **and** a signature over
   `method + path + sha256(body) + ts + nonce` with the device key; the Worker checks the signature, `|ts| ≤ 120 s`
   and nonce reuse (stored 5 min). A copied token alone is useless without the non-extractable key.
5. The device is bound to **one org, one site, one product**. It can pull only its site's records of its product.
6. Revocation: admin revokes → token hash invalidated; on its next call the device gets `401 device_revoked`,
   **stops syncing and keeps its local data** (the guard can keep working, nothing is wiped remotely without a local
   confirm). Admin can also mark "wipe on next contact" (the page asks the operator to confirm the local wipe).
7. Lost device: revoke + optional "rotate site data" (passes regenerated). No remote camera access ever exists.
8. Exam lab candidate computers (`exam-lab.html`) are **not enrolled devices**: they keep using a room pairing code
   (the existing relay design in `docs/EXAM.md`) that is valid only during the exam window, issued by the enrolled
   dashboard device. Candidates never get an org account.

## 5. Sync design per product

Protocol (same for all products):

- **Push** `POST /v1/org/sync/push` — batch of ≤ 200 records / 256 KB: `{type, id, base_version, deleted, data,
  client_ts, dseq}`. Each record passes the type's allowlist (unknown key → whole record rejected, reported back), the
  site / product scope of the device and size caps. Idempotent: the same `(type, id, version)` twice is a no-op.
  `dseq` = the device's own counter; a gap is reported (lost outbox) but not fatal.
- **Pull** `GET /v1/org/sync/pull?since=<seq>&limit=500` — records of the device's site + product with `seq > since`.
- **Outbox** on the device: IndexedDB `lq-sync-outbox`; retried with backoff; survives reloads; a status chip shows
  "synced / N waiting / offline / revoked". The page keeps its own local store as the source of truth for the UI.
- **Server time** `server_ts` is recorded; a device clock more than 2 minutes off is flagged on the admin page (this
  also fixes the "trusted time" partial in `docs/ATTENDANCE-READINESS.md` §4: a server receipt time exists for every
  punch that synced).
- Live latency target: pull every 5 s while the page is active (exam room: 2 s), every 60 s in background. No
  WebSockets / Durable Objects in phase 1 (simpler, cheaper); Durable Objects only if exam rooms need < 1 s.

### 5.1 Gate (car park + village)

| Record (type) | Syncs? | Why |
|---|---|---|
| `gate.ev` entry / exit event: at, dir, key, province, moto, gate, by, decision, pass code, opened (how), paid ref | **yes** | multi-lane pairing (entry on lane A, exit on lane B) is the main reason for sync |
| `gate.res` resident {house, key, province} | **yes** | every guard device needs the same allow-list |
| `gate.deny` {key, province, why, by} | **yes** | must reach every lane; reason is required |
| `gate.pass` visitor pass {code, house, key, province, name, from, to, uses, revoked} | **yes**, `name` optional per org setting `sync_visitor_names` (default **off**: the name stays on the creating device, the other lanes see "visitor of house X") | data minimisation for visitor names |
| `gate.passuse` one row per use (replaces the mutable `used` counter, §6) | **yes** | conflict-free counting |
| `gate.mpass`, `gate.shop`, `gate.stampUsed`, `gate.rc` receipt, `gate.shift` reconciliation | **yes** | cashier shifts across lanes; stamps single-use across lanes |
| `gate.au` correction audit entries | **yes** | central tamper evidence |
| `gate.cfg` fee rules, province list order, overstay grace, auto-open **thresholds** | **yes** (admin-edited) | same rules on every lane |
| `gate.img` plate crops | **no — stays on the device** | images; already off by default |
| frames / video | **never** | — |
| relay URL + relay token, Shelly IP | **no — stays on the device** | a secret that opens a barrier must not sit in a cloud database |
| auto-open on/off switch | **no — per device**, set locally by an admin on that kiosk | an automated barrier decision must be a local, physical-site choice |
| PromptPay id | yes (`gate.cfg`) | business identifier, not personal data for a juristic person (sole trader: phone number → counsel) |

Offline rule: a lane that is offline still decides from its last pulled allow / deny list and shows "list updated
N minutes ago"; a deny added elsewhere while it was offline cannot reach it — stated in the pilot kit.

### 5.2 Attendance (employee mode)

| Record | Syncs? | Why |
|---|---|---|
| `att.emp` {id, code, name, dept, shift} — exactly the fields `LQClock.cleanPack` already allows | **yes** | one employee list for all clocks |
| `att.punch` {id, emp, ts, type, method, dev} | **yes** | the main reason for sync; s.114 records |
| `att.audit` manager corrections (punch_add / edit / void, ot_approve, leave changes) | **yes** | append-only, chain verified on the server |
| `att.leave` {emp, type, from, to, half, note?} | **yes**; free-text `note` **not synced** by default (may contain health details) | minimisation |
| `att.shift`, `att.shiftHist`, `att.holiday`, non-secret settings (grace, OT rules, retention years) | **yes** | same rules everywhere |
| face descriptors (`lqv-att-faces`) | **no — stays on the device (default)** | s.26 biometric data; see owner decision D1 |
| PIN salt + hash | **no** | a 4–6 digit PIN hash is brute-forceable offline; a central copy would be a breach multiplier |
| QR badge token | **no (default)**; option D2: sync an HMAC of the token so a badge works at every clock | owner decision |
| training-mode check-in (`att-people`) | **no** | out of scope for org sync |

Consequence of the default: an employee who uses face check-in is enrolled **once per clock device** (as today); PIN
and QR work only on the devices where they were set, unless D2 is chosen. The pilot kit must say this.

### 5.3 Exam

| Record | Syncs? | Why |
|---|---|---|
| `exam.room` room / exam session config {room, title, start, end, mode, signal thresholds} | **yes** | dashboard + camera nodes share one config |
| `exam.seatmap` seat polygons / grid per camera view | **yes** | set once, reused next session |
| `exam.ev` events — exactly `LQExam.cleanMsg` `ev` fields | **yes** | an **additional** transport: BroadcastChannel, the optional LAN / server relay client already in `exam-link.js` (`/api/exam/push|pull`, `docs/EXAM.md`) and JSON file export / import all stay |
| `exam.hb` heartbeat | **no — not stored**; relayed in memory only | operational noise |
| `exam.action` invigilator actions (going to check, no issue, note, escalate, keepclip marker) with the invigilator name | **yes** | the incident log the institution needs |
| `exam.tally` on-site tally ("flag was right / wrong"), `exam.summary` per room | **yes** | accuracy evaluation (EU AI Act logging if relevant) |
| `exam.prof` accommodation profile per seat (flags only, no diagnosis) | **yes but per-exam only**: expires with the exam session (`expires_at = end + 24 h`) | the nodes need it during the exam; a long-term central record of who needs adjustments is not needed. Counsel question Q9 |
| seat → candidate mapping (names, student ids) | **no — not part of the product today, and not added** | the institution keeps its seating list; LENSIQ data stays pseudonymous (seat numbers) |
| evidence clips (`lq-exam-clips`) | **no — stay on the camera device (default)** | owner decision D3; the dashboard already shows "clip on the camera device" |
| `exam.clipref` metadata only {flag id, node, kept, expires} | **yes** | the dashboard on another device knows a clip exists |
| candidate lab page own log | **no** | it is the candidate's own copy |
| clip PIN hash | **no** | secret |

## 6. Conflict handling

Most records are **append-only** and cannot conflict: `gate.ev`, `gate.passuse`, `gate.rc`, `gate.au`,
`att.punch`, `att.audit`, `exam.ev`, `exam.action`, `exam.tally`, `exam.clipref`. Their ids are
`<device id>-<ULID>`; duplicates are dropped by primary key. Raw punches are never edited (already the rule today:
corrections are audit entries and the effective punches are derived), so time records never conflict.

**Design rule: counters become events.** The mutable `pass.used` counter and `shop.serial` become append-only
`gate.passuse` rows and server-allocated serial ranges, so two lanes using one pass at the same time are counted twice
correctly instead of overwriting each other.

Mutable records (`gate.res`, `gate.deny`, `gate.pass`, `gate.mpass`, `gate.shop`, `gate.cfg`, `att.emp`,
`att.shift`, `att.holiday`, `att.leave`, `exam.room`, `exam.seatmap`, `exam.prof`) use **optimistic concurrency**:
the device sends `base_version`; if the server version is newer the push is refused for that record, the server's
version is returned, a row goes to `sync_conflicts`, and the rules below decide what the device shows until an admin
resolves it:

| # | Case | Rule | Reason |
|---|---|---|---|
| CR1 | deny vs resident / pass for the same plate | **deny wins** until an admin resolves | safety: never open on a conflict |
| CR2 | a pass revoked on one lane, edited on another | **revoked wins** | same |
| CR3 | field-disjoint edits (e.g. one device changed `dept`, another `shift`) | merged field by field, recorded `merged` | no human work for harmless cases |
| CR4 | same field edited on two devices | **server (first accepted) wins**, the other value kept in `sync_conflicts.proposed` for the admin | deterministic; nothing is lost |
| CR5 | delete vs edit | tombstone wins for `gate.res` / `gate.deny` / passes only after admin confirm; edit wins for `att.emp` (an employee is never deleted, only `removed`, as today) | s.114: an employee's records must stay |
| CR6 | `exam.room` config after the exam started | **locked**: changes refused once `start` passed, except `end` (extension) | consent was given for the announced setting (same as the lab clip lock) |
| CR7 | `gate.cfg` fee rules | versioned with an `effective_from`; a receipt always records the rule version it used | fees never change retroactively |
| CR8 | clock skew | ordering for display uses `client_ts`; `server_ts` is kept; skew > 2 min flagged | punches belong to the time the person punched |
| CR9 | hash-chain continuity | a device's `att.audit` / `gate.au` chain must continue from its last accepted entry; a break is accepted but marked `chain_break` and shown to admins | tamper evidence, not silent rejection |

The admin page lists open conflicts with both versions side by side (TH / EN / ZH) and the chosen rule.

## 7. Export and backup format

**Org export bundle** — `lensiq-org-export` v1, a single `.zip` streamed by the Worker (never stored on Cloudflare):

```
manifest.json      {format:"lensiq-org-export", v:1, org:{id,name}, exported_at, exported_by, scope,
                    schema:"0010", counts:{type:n}, files:{name:sha256}, retention, dpa_version}
records/<type>.jsonl   one cleaned record per line, the same allowlisted shape as sync (round-trips through cleanRec)
csv/gate-events.csv, csv/gate-receipts.csv, csv/att-daily.csv, csv/att-payroll.csv, csv/att-audit.csv,
csv/exam-incidents.csv   built with the existing CSV builders (UTF-8 BOM, formula cells neutralised, bilingual headers)
audit/org_audit.jsonl  with prev_hash / hash so the chain can be re-verified offline
README.txt         TH / EN / ZH: what is inside, what is NOT inside (faces, clips, crops, PINs, tokens), how to verify
```

- **Encrypted by default**: the bundle is encrypted in the admin's browser before saving (AES-GCM 256, key from a
  passphrase with PBKDF2-SHA-256, 600,000 iterations, random salt; envelope `{v, kdf, salt, iv, ct}` like LQVault).
  Unencrypted CSV export stays possible with an explicit second tick, for payroll hand-off.
- Excluded always: face descriptors, clips, plate crops, frames, PIN hashes, QR tokens, relay tokens, device tokens.
- **Restore**: `POST /v1/org/restore` (org owner, fresh re-auth) into an **empty** org or a staging copy only; every
  line passes the same allowlist; the manifest hashes must match. Partial restore into a live org is not offered
  (conflict risk) — open for phase 2.
- **Per-device backup without the server** keeps working as today (gate CSV, timeclock JSON pack, exam JSON files).
- **Platform disaster recovery**: D1 Time Travel is always on, 7 days on Workers Free and 30 days on Paid
  ([time travel](https://developers.cloudflare.com/d1/reference/time-travel/), accessed 2026-11-08). Staging can use Free; production
  should use Paid (30 days). No separate R2 copy of personal data in phase 1.
- **Per-subject export** (access request, s.30): admin enters a plate / employee code / seat+exam → a small bundle
  with only that subject's records + the corrections made to them (the attendance page already does this per
  employee locally).

## 8. Retention on the server

Each type has a default, a floor and a ceiling; the org admin sets the value within them. `expires_at` is set on write;
the daily cron (`retention.js`, after aggregation) deletes expired rows and writes one `record.purge` line per type
to `org_audit` (counts only).

| Type | Default | Floor | Ceiling | Basis for the number |
|---|---|---|---|---|
| `gate.ev` (plates, times) | 90 days | 7 | 400 | same as the on-device default (`docs/GATE.md` §5) |
| `gate.rc`, `gate.shift` | 5 years | 5 years (if a tax document) | 10 years | Revenue Code record keeping, as for LENSIQ's own receipts |
| `gate.res`, `gate.mpass` | until removed + 30 days | — | — | active relationship |
| `gate.deny` | until removed; review reminder every 180 days | — | 2 years | adverse data must not linger |
| `gate.pass` + `gate.passuse` | pass end + 30 days | 1 | 90 | short-lived visitor data |
| `att.punch`, `att.audit`, `att.leave` | 2 years | **2 years (s.114)** | 10 years | Labour Protection Act s.114 (already enforced locally by `retentionYears`) |
| `att.emp` | employment end + retention years | — | — | needed to read old punches |
| `exam.ev`, `exam.action`, `exam.tally`, `exam.summary` | 90 days after the exam | 30 | 400 | the notice template says "no more than 90 days or as the institution's rules say" |
| `exam.prof` | exam end + 24 h, fixed | — | exam end + 24 h (not configurable) | §5.3, R46; any longer period needs counsel (Q9) |
| `exam.clipref` | same as the clip on the device | — | — | metadata only |
| `sync_conflicts` | 90 days after resolution | | | |
| `org_audit` | 400 days (`AUDIT_DAYS`) | | | same as the platform audit |
| tombstones | 30 days | | | devices that were offline longer re-pull a full snapshot |
| org closing | 30-day export window, then all org rows deleted; receipts kept 5 years if the org asks (it is their tax record) | | | |

## 9. PDPA impact

### 9.1 The big change: controller / processor

Today (`docs/PDPA-NOTES-FOR-COUNSEL.md` §D Q1) LENSIQ assumes it is a **software supplier with no access** to the
customer's data. With org accounts LENSIQ **stores** the customer's personal data on infrastructure it chose:

- **The org (customer) = controller** for all records in `sync_records` (it decides purpose and means: who may enter,
  how attendance is recorded, how an exam is invigilated).
- **LENSIQ = processor (s.40)** for those records: acts only on documented instructions, keeps them secure and
  notifies the controller of a breach without delay (s.40(2)), keeps a record of processing
  (s.40(3)), deletes / returns data at the end. This needs a **Data Processing Agreement** with every org, accepted in
  the product before sync turns on (`orgs.dpa_version`).
- **Cloudflare, Inc. = sub-processor** of LENSIQ (Workers + D1). The DPA must list it and let the controller object to
  changes. Cloudflare's own DPA / customer terms apply between LENSIQ and Cloudflare.
- **LENSIQ = controller** for its own platform data about the org's admins and staff accounts (e-mail, Google `sub`,
  sessions, billing) — as today for members (M22) and billing (M18).
- A possible **DPO duty for LENSIQ** (s.41): if storing plates / attendance for many orgs counts as "regular and
  systematic monitoring on a large scale" under the PDPC DPO notification, LENSIQ itself needs a DPO (Q3).

### 9.2 Per data type

Draft lawful bases follow the existing notes (B1–B3). "Server" = what changes when the type syncs.

| Data type | Syncs by default? | Lawful basis (draft, controller = org) | Controller / processor | Cross-border (Cloudflare) | Retention (server) | Data-subject rights — how they are served | Risk change vs today |
|---|---|---|---|---|---|---|---|
| **Licence plates + entry/exit times** (`gate.ev`, receipts) | yes | car park: contract s.24(3) for paying customers, legitimate interest s.24(5) for security; village / condo: legitimate interest s.24(5) (juristic person managing access) | org controller; LENSIQ processor; Cloudflare sub-processor | yes — stored outside Thailand (§9.3) | 90 days default (7–400); receipts 5 years | access: per-subject export by plate; rectify: admin edit (audited); erase: per-plate erase except receipts / records under a legal duty; object: handled by the org (sign + notice name the org) | **up**: a central, searchable movement history across lanes and months; mitigated by retention, no cross-org search, site scope |
| **Resident allow-list** (house + plate) and **deny list** (plate + reason) | yes | s.24(5) / contract with the juristic person (house rules); deny reason: s.24(5), must be factual | same | yes | until removed; deny reviewed every 180 days, ≤ 2 years | access / rectify via the juristic office; a denied person can ask for the reason | **up** for the deny list (adverse data now central); reason required + review reminder |
| **Visitor names** (`gate.pass.name`) | **no** by default (name stays on the creating device); option per org | s.24(5) (security of the estate) or the resident's request (contract with the resident) | same | only if the org turns name sync on | pass end + 30 days (≤ 90) | access / erase via the juristic office; short retention makes most requests moot | **neutral** by default; **up** if turned on |
| **Face descriptors** (attendance) | **no — never in phase 1** | s.26 explicit consent (biometric), with PIN / QR alternative (already built) | org controller; LENSIQ no access | none | on device only (30–730 days unused, existing) | erase / withdraw on the device (existing per-person wipe) | **unchanged** — stated as a hard default; changing it needs owner decision D1 + counsel |
| **Attendance records** (punches, corrections, leave, employee list) | yes | legal obligation s.24(6) for time records (Labour Protection Act s.114); contract s.24(3) for payroll; leave of type "sick": s.26 health? only the type is kept, no diagnosis, no free-text note by default | same | yes | ≥ 2 years (s.114 floor), default 2 | access: per-employee export (exists locally, added on server); rectify: manager correction with reason (exists); erase: refused within the s.114 period, stated in the notice; withdraw face consent: does not touch time records | **up**: central employee time history; but it **improves** integrity (server time, cross-device chain) |
| **Exam flags / events, invigilator actions, tallies** | yes | public institution: public task s.24(4); private: contract s.24(3) / legitimate interest s.24(5); minors: see Q8 | institution controller; LENSIQ processor | yes | 90 days after the exam (30–400) | access: per seat + exam export; rectify: an invigilator note, the event itself is not edited; erase after the appeal period | **up** slightly: events are pseudonymous (seat numbers), but the institution can re-identify; central copy outlives the room device |
| **Accommodation profiles** (per seat) | yes, per exam only (expires end + 24 h) | as above; may reveal disability → treat as **s.26 health data** unless counsel says otherwise (Q9) | same | yes, briefly | exam end + 24 h | as above | **up** for a short window; mitigated by the short expiry and "no diagnosis" rule |
| **Exam evidence clips** | **no — stay on the camera device** (only `exam.clipref` metadata syncs) | consent / public task as in C2 of the counsel notes | institution | none | on device, as today | as today (`docs/PDPA-NOTES-FOR-COUNSEL.md` C2) | **unchanged** |
| **Org admin / staff accounts** (e-mail, Google `sub`, role, sessions) | n/a (platform) | LENSIQ controller: contract s.24(3) with the org; staff: the org's legitimate interest in giving access | LENSIQ controller (like M22) | yes | until removed + 30 days; audit 400 days | `GET /api/me/export`, `DELETE /api/me` (existing) — a user who is an org owner must transfer ownership first | **new** but the same as the existing member accounts |
| **Operator / guard / manager / invigilator names** typed on devices (`actor`) | yes (with the record) | org's legitimate interest (accountability), employment contract | org controller | yes | with the record | via the org | **up** slightly (central) |
| **Device records** (name, coarse UA, public key) | n/a | not personal data in most cases (shared kiosks); s.24(5) | LENSIQ / org | yes | until revoked + 90 days | — | new, low |

### 9.3 Cross-border transfer (s.28–29)

- Cloudflare is a US company; D1 data runs and is stored where Cloudflare places it. A D1 **location hint** (`apac`
  is the closest available) is **not a guarantee**, and the only data-location **jurisdictions** offered are `eu`,
  `us` and `fedramp` — there is **no Thailand option**
  ([data location](https://developers.cloudflare.com/d1/configuration/data-location/), accessed 2026-11-08). Read replication would create
  copies in every region, so **read replication stays off**.
- So every synced record is a transfer abroad. Options for counsel (Q1): appropriate safeguards under the PDPC
  cross-border notifications (contractual clauses in the LENSIQ ↔ Cloudflare terms, checked against what the PDPC
  accepts), plus disclosure in the org's privacy notice and the gate / exam / employee notices ("stored with
  Cloudflare, outside Thailand"). Consent is **not** a good basis here (employees, residents, candidates cannot freely
  refuse).
- **Alternative that avoids the transfer:** the same sync protocol on the customer's LAN hub (`server.py`) or a
  Thai-hosted server. Design keeps the transport pluggable so a school or condo that refuses the transfer can still
  have multi-device sync (phase 2+, not built).

### 9.4 DPIA delta (adds to `docs/pdpa/DPIA.md` §7; same scoring L × S)

New module codes proposed: **M30** org accounts + devices, **M31** Gate sync, **M32** Attendance sync, **M33** Exam
sync.

| # | Risk | Module | L | S | Before | Measures in the software (design) | Measures the controller must take | L' | S' | Residual |
|---|---|---|---|---|---|---|---|---|---|---|
| R38 | Breach of the central database exposes many orgs' plates / time records at once | M30–M33 | 2 | 4 | 8 medium | no images / faces / PINs / tokens on the server; per-org database in production; secrets only as Worker secrets; minimal fields; retention purge; incident plan (`docs/pdpa/INCIDENT-RESPONSE.md`) with processor → controller notice; the 72-hour duty itself stays the existing **R37** (extended to M30–M33) | sign the DPA; keep their notice current | 1 | 4 | 4 low |
| R39 | Cross-tenant leak (a bug returns another org's rows) | M30 | 2 | 5 | 10 medium | `org_id` on every row, one query helper that requires it, two-org tests on every endpoint, pull scoped by device site | — | 1 | 5 | 5 low |
| R40 | Stolen / copied device token pushes false records or pulls a site's data | M30 | 3 | 4 | 12 medium | token + non-extractable signing key, nonce + time window, one site / product per device, revocation, rate limits, anomaly flag (push volume) | revoke lost devices at once; physical kiosk security | 2 | 3 | 6 low |
| R41 | Function creep: plate history used to track a resident's movements, attendance used for surveillance | M31 M32 | 3 | 3 | 9 medium | retention defaults; no cross-site / cross-org plate search; no location or movement report; purpose stated in the DPA | written purpose limitation; staff training | 2 | 3 | 6 low |
| R42 | Transfer abroad without a valid mechanism (extends the existing **R21**, Cloudflare transfer for M16–M18, to org data) | M30–M33 | 3 | 3 | 9 medium | notice texts name Cloudflare / outside Thailand; read replication off; LAN-hub alternative | counsel confirms the mechanism (Q1) | 2 | 2 | 4 low |
| R43 | LENSIQ insider access | M30 | 2 | 4 | 8 medium | no data view by default; break-glass grant by the org owner, ≤ 24 h, audited and visible to the org | review the org audit | 1 | 4 | 4 low |
| R44 | Wrong conflict resolution opens a barrier for a denied vehicle | M31 | 2 | 4 | 8 medium | deny wins, revoked wins, a guard still confirms every read, auto-open stays local and off by default | review the conflict list daily during the pilot | 1 | 3 | 3 low |
| R45 | Export file leaks (USB / e-mail) | M30 | 3 | 3 | 9 medium | encrypted by default, excludes faces / clips / crops / secrets, every export audited | store and delete exports per policy | 2 | 3 | 6 low |
| R46 | Accommodation flags reveal a disability centrally | M33 | 2 | 4 | 8 medium | flags only, no diagnosis, expiry at exam end + 24 h, visible only to the room's devices and admins | institution decides who sets profiles | 1 | 4 | 4 low |
| R47 | Server keeps data longer than the device would (retention overrun) | M31–M33 | 3 | 3 | 9 medium | `expires_at` on write, daily purge with audited counts, floors / ceilings per type | set retention at onboarding | 2 | 2 | 4 low |

Before / after summary of this delta: before measures 0 high, 10 medium; **residual 0 high, 0 medium, 10 low**,
conditional on counsel answering Q1–Q4 and the controller measures being done. Unchanged: R1–R37 (existing rows up to §14 of `docs/pdpa/DPIA.md`). Numbering starts at R38
so nothing collides with the existing R16–R37.

### 9.5 Documents that must change before sync is offered to a real customer (not done in this round)

ROPA rows M30–M33; DPIA rows R38–R47 in a new §15 annex (existing R1–R37 unchanged); retention table; consent / notice texts (gate sign, employee
notice, exam notice: add "stored with LENSIQ's cloud provider Cloudflare, outside Thailand, for N days"); a **DPA
template** (new, `docs/pdpa/DPA-template.md`); privacy.html and terms.html (shared files: integrator); a sub-processor
list page.

## 10. Open questions for the lawyer

1. **Transfer mechanism (s.28–29)**: which mechanism do you accept for storing org data on Cloudflare (US company, no
   Thai data location; `apac` hint only)? Are Cloudflare's contractual clauses enough under the current PDPC
   cross-border notifications, or do we need extra clauses / a Thai-hosted option for public bodies?
2. **Processor status**: confirm that LENSIQ becomes a processor (s.40) for synced data and review the DPA template
   we will draft: instructions, sub-processors (Cloudflare), breach notice timing to the controller, deletion /
   return, audits, liability cap.
3. **DPO for LENSIQ (s.41)**: does processing plates / attendance / exam events for many orgs make LENSIQ's core
   activity "large-scale regular monitoring" so that LENSIQ needs its own DPO?
4. **Public institutions**: can a public school / university use a cloud processor abroad for exam events under its
   public task (s.24(4)), or do government cloud rules (e.g. the Digital Government Development Agency standards)
   require a Thai-hosted option?
5. **Plates in car parks vs villages**: is s.24(3) / s.24(5) still right once the history is central and kept up to
   400 days? Is 90 days a defensible default?
6. **Deny list**: is a central list of denied plates with a reason "adverse" data that needs extra safeguards, and is
   a 180-day review reminder enough?
7. **Visitor names**: is our default (name stays on the device; only "visitor of house X" syncs) the right minimum,
   and what notice does a visitor need when the resident creates the pass?
8. **Minors in exams**: with central storage of seat-level events, does a private school need parental consent, or
   does the contract with the parents cover it? Does the 90-day default work for appeal periods?
9. **Accommodation profiles**: are seat flags like "read aloud" or "extra breaks" health data under s.26 even without
   a diagnosis? Is "exam end + 24 h" retention acceptable, or must they never leave the room device?
10. **Attendance**: confirm s.24(6) (legal obligation, s.114 LPA) for central time records, and that erasure requests
    within the 2-year period can be refused. Is the leave type "sick" health data under s.26?
11. **Face descriptors**: if the owner later wants descriptors synced (end-to-end encrypted so LENSIQ cannot read
    them), is an encrypted biometric template still "collected" by LENSIQ as processor, and what extra consent text
    does the employee need?
12. **Break-glass support access**: is an org-owner-granted, time-limited, audited support grant enough to stay within
    "acting on instructions"?
13. **Evidence value**: does the server-side SHA-256 audit chain plus server receipt time change how the terms may
    describe the evidential value of attendance corrections and gate corrections (currently "tamper-evident, not
    tamper-proof")?
14. **Breach notification**: as processor, what timing do we promise the controller so that the controller can meet
    its own 72-hour duty (s.37(4))?
15. **Org closing**: is a 30-day export window then deletion acceptable, and may we keep gate receipts for 5 years on
    the org's request?
16. **EU AI Act**: if an exam customer is in the EU, does central logging change our obligations as provider of a
    high-risk system (Annex III 3(d))?

## 11. Effort per phase (after approval)

S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 6–10 days of agent work, each with its own fixed test set and an independent reviewer
as in the working rules. Staging only throughout.

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| P0 | Owner decisions D1–D7 (below) + lawyer review of §9–10; DPA template draft | S (docs) | owner, counsel |
| P1 | Migration 0010 + org / site / member / invite endpoints + role checks + `org_audit` chain; D1-shim tests with two orgs | M | P0 |
| P2 | Device enrolment (codes, WebCrypto key, signed requests, revoke) + admin device list | M | P1 |
| P3 | Generic sync engine (push / pull / cursor / tombstones / conflicts / retention cron) + client `lensiq-sync.js` outbox + status chip | L | P2 |
| P4 | Exam adapter (an extra transport beside BroadcastChannel, the `exam-link.js` relay and file import, which all stay; heartbeats in memory; profiles expiry) + e2e with two browser contexts | M | P3 |
| P5 | Gate adapter (multi-lane pairing, pass uses as events, deny-wins) + e2e with two lanes | M | P3 |
| P6 | Attendance adapter (reuses `cleanPack`; server time; chain check) + e2e with two clocks | M | P3 |
| P7 | Export / restore / per-subject export + DSR log | M | P4–P6 |
| P8 | Org admin UI (new `org.html`, TH / EN / ZH, phone widths) | M | P1–P7 |
| P9 | Staging deploy by the owner + security review + independent re-measure (sync latency, offline recovery, conflict tests) | S | all |

Total ≈ 6–9 weeks of rounds, not one round. Suggested build order inside the item: **Exam → Gate → Attendance**
(Exam events are pseudonymous and the exam pilot needs multi-device rooms; Gate needs multi-lane for car parks;
Attendance already has file-based merging). The owner can reorder.

Targets to measure in P9 (fixed now, not tuned later): push → visible on another device ≤ 10 s at p95 (exam ≤ 5 s);
zero lost records after 24 h offline with 2,000 queued records; zero cross-org rows in the two-org test; zero
non-allowlisted keys accepted (fuzz test); conflict rules CR1–CR9 of §6 each covered by a test.

## 12. What the owner must prepare / decide

Prepare (staging):

1. A **Cloudflare account for staging** (separate from any future production account), Workers Free is enough for
   staging; Workers Paid (minimum USD 5 per month per account,
   [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), accessed 2026-11-08) gives 30-day D1 Time Travel and the 1,000-query limit — needed for
   production. Run `wrangler login` yourself; agents never hold real keys.
2. A **staging D1 database** (`lensiq-staging`, location hint `apac`, read replication off) and a **staging Google
   OAuth client id** (test users only).
3. **Test data only** in staging: fake plates, fake employees, a test exam room. No real people's data until counsel
   signs off.
4. Engage **counsel** for §9–10 and the DPA template.
5. One pilot customer per product willing to try sync after counsel (optional for staging).

Decide (needed before P1):

| # | Decision | Default in this design |
|---|---|---|
| D1 | Face descriptors sync? | **No** (stay on each clock) |
| D2 | QR badge works at every clock (sync an HMAC of the token)? | No |
| D3 | Exam clips ever leave the camera device? | **No** |
| D4 | Visitor names sync across lanes? | No (per-org option, default off) |
| D5 | Production: one D1 database per org, or shared with `org_id`? | Per org in production, shared in staging |
| D6 | Offer a LAN-hub / Thai-hosted option for customers who refuse transfer abroad? | Yes, later phase |
| D7 | Org plan limits and price (devices, sites) | Item 6 (pricing), not here |

## 13. Integrator notes (no shared file is edited by this story)

When the build is approved, these shared files will need edits (not now): `backend/src/constants.js` (record types,
retention floors / ceilings), `docs/CTO-BRIEF.md` (item 4 status), `docs/PDPA-NOTES-FOR-COUNSEL.md` (a new section
pointing to §9–10 of this file), `privacy.html` / `terms.html` (processor + Cloudflare wording),
`tsconfig.typecheck.json` / `eslint.config.mjs` (new `lensiq-sync.js`), `nav.js` (link to `org.html`).

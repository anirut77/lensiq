# Merit MVP: results (2026-11-12)

> Owner order 2026-11-12 (moved ahead of Nutrition). Design: `docs/MERIT-DESIGN.md` (approved 2026-11-10). Rules:
> CLAUDE.md "Remedies and merit" and the Fortune bans. Legal rows: CTO-BRIEF L42, L43 (must answer before charging),
> L44 (wording review). PDPA: `docs/PDPA-NOTES-FOR-COUNSEL.md` §G1. Every figure below is **synthetic** (fixed test sets
> written and hash-locked before the product code); no field data exists yet.

## สรุปสำหรับเจ้าของ (ภาษาไทย)

- **สร้างแล้ว**
  1. **คำแนะนำตามความเชื่อ (ฟรี):** หลังอ่านดวงบนหน้าดูดวง 14 หน้า (หน้าที่ใช้ FortuneAI) จะมีกล่อง "สิ่งที่ทำได้ตามความเชื่อ" ใต้คำทำนาย
     - แสดงสถานที่ไหว้หรือทำบุญ ของถวายและวิธีไหว้ ธรรมเนียมปีชง และของมงคล
     - ผู้ใช้เลือกความเชื่อเอง (พุทธแบบไทย / ความเชื่อแบบจีน / ฮินดู–พราหมณ์ / ไม่ระบุ / ไม่ต้องแสดง) ระบบจำไว้ในเครื่องนี้เท่านั้น
     - การจับคู่กับผลดวงทำในเครื่อง ผลดวงและความเชื่อที่เลือกไม่ถูกส่งออกไป
     - ทุกการ์ดมีป้าย "ตามความเชื่อ โปรดใช้วิจารณญาณ" และท้ายกล่องมี "ไม่มีสิ่งใดรับประกันผล" (ข้อความตายตัว แก้จากหลังบ้านไม่ได้)
     - ไม่มีราคา ไม่มีลิงก์ร้านค้า ไม่มีปุ่มซื้อ ธรรมเนียมปีชงแสดงเฉพาะเมื่อผลดวงเป็นปีชงจริง
  2. **หลังบ้าน:** แท็บใหม่ "คำแนะนำตามความเชื่อ" ใน admin เดิม (ใช้การเข้าสู่ระบบเดิม)
     - เพิ่ม แก้ไข ซ่อน/แสดง และลบรายการได้ ครบ 3 ภาษา เลือกการจับคู่จากรายการตายตัว (ไม่พิมพ์เอง)
     - ระบบตรวจถ้อยคำทุกครั้งก่อนบันทึก (ห้ามคำรับประกัน แก้ดวง ขู่ให้กลัว สุขภาพ หวย ราคา ร้านค้า เร่งรัด ลิงก์ เบอร์โทร/อีเมล)
     - ทุกการแก้ไขอยู่ใน audit log การลบต้องใส่รหัสผ่านอีกครั้ง
     - มีรายการตัวอย่าง 16 รายการ ติดป้าย "ตัวอย่าง" ทุกรายการ เขียนเอง ไม่มีชื่อวัดจริงหรือค่าใช้จ่ายจริง ให้ทีมแทนที่ด้วยข้อมูลจริง
  3. **บริการทำบุญแทน (เสียเงิน):** สร้างเพียงแบบฟอร์ม "แจ้งความสนใจ" และ **ปิดไว้** (ต้องเปิดทั้งบนเซิร์ฟเวอร์และบนหน้าเว็บ)
     - ถ้าเปิดในอนาคต จะอยู่ใต้คำแนะนำฟรี บอกชัดว่าค่าบริการแยกจากเงินทำบุญ เงินทำบุญส่งต่อเต็มจำนวน พร้อมรูป/วิดีโอและใบเสร็จ
     - ไม่มีนับถอยหลัง ไม่มี "เหลือน้อย" ไม่มี "แก้ดวง"
     - เก็บเฉพาะชื่อเล่น ช่องทางติดต่อ รายการที่สนใจ และช่วงวันที่ ลบอัตโนมัติใน 90 วัน
     - **ไม่แสดงเลย** เมื่อตาข่ายวิกฤตทำงานใน 24 ชั่วโมงที่ผ่านมา (ทดสอบแล้ว)
- **ผลทดสอบ (ข้อมูลสังเคราะห์):** unit 22/22, backend 20/20, e2e หน้าดูดวง 8/8, e2e หลังบ้าน 5/5
  - ตัวตรวจถ้อยคำจับคำต้องห้ามได้ 44/44 ประโยค (TH 16, EN 15, ZH 13) และไม่จับผิดประโยคปกติ 0/23
  - ข้อความวิกฤตในแบบฟอร์มถูกปฏิเสธ 100% ทั้งบนเครื่องและบนเซิร์ฟเวอร์ ไม่ถูกเก็บ
- **ปิดอยู่และวิธีเปิด:** แบบฟอร์มแจ้งความสนใจปิดไว้ จนกว่าทนายตอบ L42/L43 และเจ้าของตัดสินใจ (ดู §4)
- **เจ้าของต้องตัดสินใจ:** ดู §7 (เปิดแบบฟอร์มเมื่อไร, ย่อหน้าในหน้าความเป็นส่วนตัว, ผู้เขียนเนื้อหาจริง, ผู้ตรวจที่รู้ศาสตร์)

---

## 1. What was built

| Part | Files | Notes |
|---|---|---|
| Panel on 14 fortune pages | `lensiq-merit-core.js` (pure logic), `lensiq-merit-lint.js` (wording lint shared with the Worker), `lensiq-merit.js` (DOM), loaded by `nav.js` on the 14 fortune pages that run FortuneAI readings: faceread, palm, horoscope, tarot, fengshui, numbers, iching, zodiac, astro, dream, bazi, taksa, lek7, lifegraph (planner and luckycolor do not run FortuneAI, so they get no panel) | **No fortune page file was edited.** The module wraps `FortuneAI.interpret` / `regenerate` (reads the facts on the device) and `FortuneAI.renderSections` (puts one panel after the reading container) from the outside, the same pattern as `lensiq-report.js`. The reading text is never changed and never mentions the panel, so the existing `remedy-safety` and `paid` lints in `fortune-ai.js` are untouched. |
| Sample content | `lensiq-merit-seed.js` (16 items) = the rows seeded by migration 0015 | Used by the static site when there is no backend. A test keeps the two identical. |
| Worker | `backend/src/merit.js`, routes in `backend/src/index.js`, retention in `retention.js`, probe in `health.js` | See §2 and §3. The crisis check is `FortuneAI.crisis.check` imported from `fortune-ai.js` (not a copy), and the wording lint is `lensiq-merit-lint.js`, the same module the page uses. |
| Admin | `admin.html` / `admin.js` / `admin.css`, `i18n/en-admin.js`, `i18n/zh-admin.js` (`am.*`) | New tab "คำแนะนำตามความเชื่อ / Belief guidance / 信仰指引" behind the existing admin sign-in. |
| Config | `lensiq-config.js` `LENSIQ_MERIT_INTEREST_FORM` (false), `backend/wrangler.toml` `MERIT_INTEREST_FORM = "off"`, `MERIT_INTEREST_DAYS = "90"`, `MERIT_INTEREST_GLOBAL_DAY = "100"` (top level and `[env.test]`) | |

### 1.1 Screens

1. **Under a reading** ("สิ่งที่ทำได้ตามความเชื่อ / What believers do / 按习俗可以做的事"): intro, the tradition choice
   (all traditions / Thai Buddhist / Chinese folk / Hindu–Brahman / no particular tradition / don't show this section),
   a privacy line ("this choice and your reading stay on this device"), cards grouped by type (places, offerings, ชง
   customs, lucky items; at most 2 per type, 8 in total), each with a "Sample" badge when it is a sample, the place and
   area when given, and the fixed belief label; then the fixed no-guarantee line.
2. **Paid section** (only with both switches on and no crisis state): heading "Merit on your behalf (optional)", "for
   people who cannot travel … a service of staff time and travel, not a purchase of any result", the fee shown
   separately from the donation, the donation passed on in full with photo or video proof and a receipt, "booking is
   not open and no payment is taken", then the interest form (name or nickname, channel, contact, item, date window,
   explicit consent naming the religious-belief point, PDPA notice with a link to `privacy.html`).
3. **Crisis:** crisis wording typed into the form replaces the panel content with the existing FortuneAI support card
   (1323 / 1669 / 191 / 1300) and sends nothing; a support card anywhere on a fortune page withdraws the whole panel.
   Owner decision 2026-11-12 (session only, L59): Merit keeps no crisis state and stores nothing about a crisis; it
   reads the shared fortune crisis state (`FortuneAI.crisis.allow("merit")`, fortune-crisis.js) and the panel carries
   `data-lq-remedy`, so `<html data-lq-crisis>` hides it. The earlier 24 h `lq-crisis-at` flag is removed.
4. **Admin tab:** list (title, type, tradition, status, number of match keys, "Sample" badge; Edit / Hide or Show /
   Delete), the edit form (type, tradition, title / content / place / area in TH, EN and ZH, the fixed key picker,
   status, order, sample flag; plain error messages naming the field and the problem), and the interest card (states
   that the form is off and why; lists requests with erase when it is on).

All three screens are complete in Thai, English and Chinese and work at 320 / 360 / 390 px.

## 2. Data model (migration `0015_merit.sql`)

```
merit_items     id (sample-… | mi-<hex>), type (place|offering|chong|lucky_item),
                tradition (thai_buddhist|chinese_folk|hindu_brahman|general),
                title, body, place?, area?   -- JSON {th, en, zh}, complete in all three languages
                match_keys  -- JSON array from KEYS_ALLOWED: any, chong, weak, domain:<17 disciplines>,
                               animal:<0-11>, element:<wood|fire|earth|metal|water>
                sample (0|1), status (published|hidden), sort, created_at, updated_at
                -- no price, vendor, link or personal-data column
merit_interest  id, created_at, item_id, name, channel (line|phone|email), contact, date_from, date_to, lang,
                consent_version, status   -- the minimum; purged after MERIT_INTEREST_DAYS (90)
```

`/health/deep` probes both tables (`health.js` MIGRATIONS + PROBES); a missing table names `0015_merit.sql`.

**Matching keys from a reading** (on the device, `LQMeritCore.keysFromFacts`): `domain:<facts.domain>` (or the page
name); `animal:<n>` from `animal.<n>`; `chong` from `rel.clash|same|harm|punish|break` (zodiac `isChong`) and
`today.clash` / `today|month.rel.<chong>`; `element:<el>` from `*.useful.<el>`, `*.lack.<el>`, `el.lo.<el>`,
`element.<el>`; `weak` from a caution tone, a challenge polarity or `str.weak`. A chong-type item is shown only for a ชง
reading, whatever keys an admin gives it.

## 3. API

| Route | Who | Notes |
|---|---|---|
| `GET /v1/merit/guidance` | public | every published item (max 500) + `interest_form`; no query read; `Cache-Control: public, max-age=300` |
| `POST /v1/merit/interest` | public | 404 `merit_interest_off` unless `MERIT_INTEREST_FORM=on` (checked before anything else, nothing written); then Turnstile action "merit" (fail closed), unknown fields refused, crisis text → 403 `support` with the help lines (never stored, a counter only), consent, field checks, published item only, 5 per caller per hour, `MERIT_INTEREST_GLOBAL_DAY` per Bangkok day |
| `GET/POST /admin/api/merit/items` | admin | list (+ fixed types, traditions, allowed keys) / create; audited `merit.item.created` |
| `PUT /admin/api/merit/items/:id` | admin | partial update, merged and re-validated; audited `merit.item.updated` with field names only |
| `DELETE /admin/api/merit/items/:id` | admin + re-auth | audited `merit.item.deleted` |
| `GET /admin/api/merit/interest` | admin | requests + switch state + retention days |
| `DELETE /admin/api/merit/interest/:id` | admin + re-auth | audited `merit.interest.deleted` (id only) |

Wording lint (`lensiq-merit-lint.js`, one module for the Worker and the page; TH / EN / ZH): guarantee, fix_luck, fear
(incl. threats such as "if you do not pray…"), health, lottery, price (incl. Thai digits and Thai / Chinese number
words), purchase, urgency, link (any scheme, short links, "x . com", "[dot]"), markup, personal (phone numbers in any
layout, e-mail, @handles, LINE IDs). Before matching it normalises NFKC, removes zero-width / soft-hyphen / word-joiner /
BOM characters, maps Cyrillic and Greek look-alikes to Latin and Thai digits to 0-9; Thai and Chinese rules ignore spaces
and punctuation. Every admin text and every seeded text must pass; the page also drops any item that fails it.

## 4. What is OFF and how to turn it on

| Switch | Default | Turn on (only after counsel answers L42 / L43 and the owner decides) |
|---|---|---|
| Worker `MERIT_INTEREST_FORM` | `"off"` | set `"on"` in `backend/wrangler.toml` (top level or `[env.test.vars]`) and deploy |
| Page `window.LENSIQ_MERIT_INTEREST_FORM` | `false` | set `true` in `lensiq-config.js` (or a deploy config); the page also needs `LENSIQ_API_BASE`, and Turnstile site key for the token |
| Crisis hide window | as long as the shared fortune crisis state | none of Merit's own (owner decision 2026-11-12, session only; 24 h waits for counsel, L59); checked before drawing and again when the form is submitted |
| Interest retention | 90 days | `MERIT_INTEREST_DAYS` (7–365); the form notice shows the configured number (sent with the guidance) |

Both switches are needed; either one alone shows nothing. Booking and payment are not built.
The test deployment (`[env.test]`) does not list `/v1/merit/*` in `PUBLIC_ROUTES`, so there the page uses the bundled
samples; adding the guidance route to the test deployment is a deploy decision, not made here.

## 5. Tests and numbers (all synthetic; fixed sets locked before the product code)

Lock file: `~/LENSIQ-field/evals/merit/locked.sha256` (one documented re-lock of `tests/e2e/admin-merit.e2e.mjs`: a
selector picked the wrong `dialog.ad-reauth` element; no assertion changed; and the review amendment in §5.1).

| Test | Set | Result | Target |
|---|---|---|---|
| `tests/unit/merit.test.js` (R1–R8) | labels, tradition filter, keys, ชง rule, paid gate, crisis window, seed, UI wording, crisis parity | 22 / 22 | all |
| `tests/unit/backend-merit.test.js` (B1–B7) | migration + probe, seed parity, public API, admin CRUD + audit + re-auth, validation, interest off / on, retention | 20 / 20 | all |
| Wording lint, refused | 44 fixed phrases (TH 16, EN 15, ZH 13) | 44 / 44 caught | 100 % |
| Wording lint, false positives | 23 fixed ordinary phrases (TH 8, EN 8, ZH 7) | 0 / 23 flagged | 0 |
| Crisis text in the interest form (server) | 5 phrases (TH, EN, ZH, abuse) | 5 / 5 refused, 0 stored | 100 % |
| Crisis gate (browser) | form crisis text; support card on tarot then zodiac | paid offer and panel withdrawn in both; nothing sent | 100 % |
| `tests/e2e/merit.e2e.mjs` | panel, filter, paid section, crisis, EN / ZH, 320–390 px | 8 / 8 | all |
| `tests/e2e/admin-merit.e2e.mjs` | list, create + refusals, hide / show / delete + re-auth, interest card, phones + EN / ZH | 5 / 5 | all |

Measured on 2026-11-12 in this branch. The independent review of 4252648 re-measured 42/42 unit + backend and 58/58
e2e and found the gaps fixed in §5.1.

### 5.1 Review amendment (2026-11-12, stricter only; tests locked before the fixes)

| Test | Set | Result | Target |
|---|---|---|---|
| `tests/unit/merit-review.test.js` V1 | the reviewer's disguised / new wordings (zero-width splits, fullwidth, Cyrillic, traditional Chinese, hype, threats, contacts, links, markup, prices in words) | 73 / 73 caught (was 23 / 73 before the fix) | 100 % |
| V1 false flags | 5 reviewer clean phrases + 23 earlier ordinary phrases + 3 "call ahead / dates" phrases | 0 / 31 flagged | 0 |
| V2 | one lint for Worker and page; the page drops items that fail it | pass | all |
| V3 | Worker crisis check = `FortuneAI.crisis.check` (imported) | pass | all |
| V4 | crisis state with blocked / missing / full storage | kept in memory | all |
| V5 | notice shows configured retention days | pass | all |
| V6 | panel only on the 14 FortuneAI pages | pass | all |
| `tests/e2e/merit-crisis.e2e.mjs` | second tab; submit-time crisis check; blocked storage; horoscope overview tab | see the round numbers below | all |
| `tests/unit/merit.test.js` R5, R8 (amended) | R5: blocked storage now keeps the crisis state; R8: reuse instead of copied patterns | pass | all |

## 6. Risks

- Sample content only: the 16 samples are generic and written by us; real places, offerings and ชง customs need a
  knowledgeable editor and reviewer (design §5, T1) before the panel says anything specific.
- The lint is a first filter (L44): it cannot judge tone or respectfulness; human review of real content is still needed.
- Facts from pages that render without `FortuneAI.interpret` (cached results) fall back to the page's discipline only,
  so element / ชง matching may be less specific there; ชง customs are then not shown (safe side).
- The crisis state is per browser (`localStorage`, with an in-memory copy per page); another browser or a private window
  does not know about it.
- The lint is a pattern filter; new disguises will appear. The page re-checks every item with the same module, and
  real content still needs a human editor and reviewer.

## 7. Owner decisions needed

1. When (if ever) to switch the interest form on: after counsel answers L42 / L43 and PDPA §G1 questions.
2. Whether `privacy.html` gets a merit paragraph now or only when the form is switched on (counsel question G1(c)(3)).
3. Who writes the real content (Thai editor who knows the traditions) and who reviews it (design §12); until then the
   samples stay, clearly marked.
4. Whether the test deployment should serve `/v1/merit/guidance` (add to `PUBLIC_ROUTES`) so admin edits appear on the
   live test site; today it shows the bundled samples.

## 8. Reviewer role and review queue (owner decision 2026-11-12)

### 8.1 คำแนะนำสำหรับเจ้าของ: สร้างบัญชีผู้ตรวจ (ภาษาไทย ย่อ)

1. เข้าหลังบ้าน แท็บ **ความปลอดภัย** การ์ด **บัญชีผู้ตรวจเนื้อหา**
2. ใส่ชื่อผู้ใช้ของผู้ตรวจ (ตัวอักษรอังกฤษ ตัวเลข จุด ขีด 3–64 ตัว) กด **สร้างบัญชีและลิงก์ตั้งค่า**
3. ระบบถามรหัสผ่านและรหัส 6 หลักของคุณอีกครั้ง
4. คัดลอก **ลิงก์ตั้งค่าครั้งแรก** ส่งให้ผู้ตรวจทางช่องทางส่วนตัว (ลิงก์แสดงครั้งเดียว ใช้ได้ครั้งเดียว หมดอายุใน 3 วัน)
5. ส่งไฟล์ `docs/MERIT-REVIEWER-GUIDE-TH.md` ให้ผู้ตรวจด้วย ผู้ตรวจตั้งรหัสผ่านเองและต้องเปิดการยืนยันตัวตนสองชั้น
6. ในการ์ดเดียวกัน คุณ **ออกลิงก์ตั้งค่าใหม่** (เช่น ผู้ตรวจลืมรหัสหรือโทรศัพท์หาย) **ปิดการใช้งาน** (ออกจากระบบทันที)
   **เปิดใช้งาน** หรือ **ลบบัญชี** ได้ ทุกครั้งระบบถามรหัสผ่านอีกครั้ง และบันทึกไว้ในบันทึกการใช้งานหลังบ้าน
7. นำเข้าร่าง 108 รายการ: แท็บ **คำแนะนำตามความเชื่อ** เลือกไฟล์ `drafts-2026-11-12.json` กด **ตรวจไฟล์ก่อนนำเข้า**
   แล้วกด **นำเข้าเป็นร่าง** (ถามรหัสผ่านอีกครั้ง) ทุกรายการเข้าเป็น **ร่าง** ยังไม่แสดงต่อผู้ใช้จนกว่าจะอนุมัติ
   ตรวจไฟล์ในเครื่องก่อนได้ด้วย `node tools/merit-drafts-check.mjs ~/LENSIQ-field/merit-content/drafts-2026-11-12.json`
   (ผลวันนี้: ผ่าน 108 จาก 108) ยังไม่ได้นำเข้าในเซิร์ฟเวอร์ทดสอบ (ตามคำสั่ง)

### 8.2 Role / route matrix (enforced on the Worker per request: `index.js` REVIEWER_ROUTES, default deny)

| Route (admin API) | Owner | Reviewer |
|---|---|---|
| `GET /me`, `POST /logout` | yes | yes (own account) |
| `GET /merit/items`, `POST /merit/items` | yes | yes; a reviewer's new item is always a draft; `status` / `sample` refused (403 forbidden_field) |
| `PUT /merit/items/:id` | yes (may set draft / published / hidden) | yes, content only; the item goes back to draft; `status` / `sample` refused |
| `POST /merit/items/:id/review` (reviewed / approve / reject + comment) | yes | yes |
| `GET /merit/items/:id/history` | yes | yes |
| `DELETE /merit/items/:id` (re-auth) | yes | 403 forbidden_role |
| `POST /merit/import` (re-auth) | yes | 403 |
| `GET /merit/interest`, `DELETE /merit/interest/:id` (personal data) | yes | 403 |
| `GET/POST /reviewers`, `POST /reviewers/:id/disable|enable|reset`, `DELETE /reviewers/:id` (re-auth) | yes | 403 |
| every other admin route: settings, AI, AI keys, gateway, Product Check lookup, billing, refunds, plans, members, membership, leads, alerts, audit, mail, CSP reports, analytics, retention, devices, password, 2-step, recovery codes, re-auth, unknown routes | yes | 403 forbidden_role (audited as `role.denied`, no side effect) |

Unauthenticated: `POST /reviewer-setup` and `POST /reviewer-setup/confirm` (the one-time setup code; rate limited per
caller, 10 per 15 min; behind the admin unauthenticated-write ceiling like `/login`).

### 8.3 Accounts and sign-in

- `admin_reviewers` (migration `0016_merit_review.sql`): username, PBKDF2 password hash (same function as the owner), TOTP
  secret AES-GCM-encrypted with SECRETS_KEK (additional data `totp:reviewer:<id>`), status pending / active / disabled,
  its own failure counter and slow-down. The setup code is random (24 bytes), stored only as SHA-256, valid 3 days, works
  once. At most 10 reviewers.
- Sign-in is the normal `/login`. A reviewer must give the 6-digit code every time (no recovery codes; the owner resets).
  A reviewer's failures never count on the owner; a reviewer's trusted device does not skip the owner's slow-down.
- Every request of a reviewer session re-reads the reviewer row: disable, reset or delete sign the reviewer out at once.
  Sessions use the same idle (30 min) and absolute (12 h) limits as the owner's.

### 8.4 Queue and history

- Status: draft → reviewed → published; rejected (comment required) from draft, reviewed or published; hidden by the
  owner. Approve only from reviewed. Only `published` is served by `GET /v1/merit/guidance`.
- `merit_revisions`: one row per create, edit (changed field names), status change, review decision (with comment),
  import and delete, with the account name and time; shown in the review view. The audit log keeps ids, field names and
  decisions only (no item text, no comment text).
- Import: owner + re-auth, up to 300 items and 1 MB per file; every item becomes a non-sample draft (a status, sample flag
  or id in the file is ignored); invalid items are listed by number and skipped; "check first" (dry run) writes nothing.
  Reviewer notes in the file (`draft_id`, `disciplines`, `sources`, `uncertain`) are kept in `review_meta` and shown in
  the review view only (the "uncertain" note in a yellow box at the top); they are never served to users.
- The 16 samples stay published and labelled as samples.

### 8.5 Tests (locked before the code, except the drafts-notes file; `~/LENSIQ-field/evals/merit/locked.sha256`)

| Test | Result |
|---|---|
| `tests/unit/backend-merit-reviewer.test.js` RV1–RV11 (role matrix of 64 denied routes, queue, history, import, account life cycle, device / counter separation) | 12 / 12 |
| `tests/unit/backend-merit-drafts.test.js` D1–D3 (reviewer notes kept and never served; malformed notes refused; offline checker) | 3 / 3 (written after the code, at the coordinator's request) |
| `tests/e2e/admin-merit-review.e2e.mjs` (owner creates a reviewer, setup link, password + 2-step, sign-in, merit tab only, edit / review / approve / reject with history, Worker 403s, disable signs out, phones + EN / ZH) | 6 / 6 |
| Real drafts file through the offline checker | 108 / 108 pass |

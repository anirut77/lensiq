# Owner-specific values inventory

> Owner order 2026-11-18, item 3. Documents only: no product code was changed. Counted on `origin/main` (b2a6e76c) on
> 2026-11-18. The repo is public: this file says WHERE a value lives, never the value of anything sensitive. Public
> brand facts (brand name, public domain, public help-line numbers) are named.

## สรุปภาษาไทย (Thai summary)

เอกสารนี้ไล่ดูทั้ง repo แล้วรวม "ค่าเฉพาะของเจ้าของ" ที่ฝังอยู่ในโค้ดหรือเนื้อหา 10 หมวด: ชื่อแบรนด์ โลโก้ โดเมน
ข้อมูลผู้ขายและช่องทางติดต่อ ราคาและแผน เบอร์สายด่วน ข้อความหน้ากฎหมาย จุดวิเคราะห์สถิติและแจ้งเตือน ค่าติดตั้งฝั่ง Cloudflare
และชื่อเจ้าของในไฟล์ลิขสิทธิ์ แต่ละหมวดระบุตำแหน่งไฟล์:บรรทัด หรือจำนวน เป็นข้อมูลสาธารณะหรือเป็นความลับ และข้อแนะนำ
(ย้ายไปแผงแอดมิน "ข้อมูลกิจการ" / เก็บเป็นค่าตั้งต่อการติดตั้ง / เก็บในโค้ด) พร้อมเหตุผล

ข้อแนะนำหลัก 5 ข้อ: (1) ข้อมูลผู้ขาย ผู้ติดต่อ DPO อีเมล LINE OA ย้ายเข้าแผงแอดมินที่เก็บใน DB (กำลังทำที่ branch
`seller-settings`) แล้วให้ `legal.js`, ใบเสร็จ และแบบฟอร์มขอใบเสนอราคาอ่านจากที่เดียว (2) เบอร์สายด่วน (1323, 1669, 191, 1300,
สะมาริตันส์) อยู่ในโค้ดและมีเทสต์ล็อก ไม่ย้าย (3) ราคา B2B ที่ฝังในหน้า gate/exam/crowd/attendance (22 บรรทัดใน HTML และ
อีก 42 บรรทัดใน i18n) ควรย้ายเป็นตารางราคาในแผงแอดมิน แต่เป็นงานที่ต้องล็อกเทสต์ใหม่ จึงเสนอเป็นขั้นที่สอง (4) ชื่อแบรนด์ 3,705
จุดใน 874 ไฟล์ ให้ย้ายเฉพาะข้อความที่ผู้ใช้เห็นผ่านค่าเดียว (`BRAND` ใน `nav.js` และคำแปล) ส่วนชื่อไฟล์ ตัวแปร `LENSIQ_*` และ
คีย์ `lq-*` คงไว้ (5) ค่าที่เป็นความลับ (โทเคน LINE, คีย์ AI, Opn, Turnstile secret ฯลฯ) ไม่เคยอยู่ใน repo อยู่เป็น Worker secret
ต่อการติดตั้ง ใส่ด้วย `npm run secrets:setup` ต่อไป

## Reading the tables

- **Where** = file:line, or a count when a value is spread over many files. Counts exclude `node_modules/`, `vendor/`,
  `.git/` and lock files unless stated.
- **P/S** = Public (visible to every visitor or already published) or Sensitive (a secret, or an identifier that must
  not be committed). Nothing marked Sensitive is in the repo; the table says which secret store holds it.
- **Recommendation** uses three labels: **ADMIN** = move to the admin panel "ข้อมูลกิจการ" / settings (DB-backed, no
  redeploy), **CONFIG** = keep in config per deployment (`lensiq-config.js`, `backend/wrangler.toml`, Worker secrets),
  **CODE** = keep in code (tested, safety or licence reasons).

## Counts per category

| # | Category | Distinct values | Occurrences (approx.) | Recommendation |
|---|---|---|---|---|
| 1 | Brand name | 1 (LENSIQ) | 3,705 in 874 files, 75 of 75 pages, 414 in 159 i18n files, 52 in backend, 155 docs | ADMIN for visible text (phase 2); CODE for identifiers |
| 2 | Logo and icons | 2 (wordmark, favicon) | wordmark 1 (`nav.js:6`), favicon 75 (one per page) | ADMIN (logo upload) + CONFIG |
| 3 | Domain and URLs | 3 (public site, API Worker, test Worker) | 34 files with `/lensiq/`; 35 files name the public host (12 outside docs) | CONFIG |
| 4 | Seller and contact details | 17 keys in `LENSIQ_SELLER` + 4 backend vars + 1 LINE OA | 77 `data-seller` slots in 3 pages, 6 code readers | ADMIN (in progress, `seller-settings`) |
| 5 | Prices and plans | ~30 B2B price points, 7 consumer plans, 5 fortune prices | 22 HTML lines, 42 i18n lines, 4 decks, 3 templates, 7 migration rows | ADMIN (consumer: already; B2B: phase 2) |
| 6 | Help-line numbers | 5 | 971 mentions of 1323 in 123 code files, 49 test files | CODE |
| 7 | Legal page text | 3 pages + 6 customer drafts + 8 PDPA files | terms 546 lines, privacy 560, help 450 | CODE text, ADMIN party details |
| 8 | Analytics and notification targets | 6 public ids + 14 secrets + 3 vars | see section 8 | CONFIG / Worker secrets |
| 9 | Cloudflare resource names | 4 (Worker, D1, cron, env names) | `wrangler.toml`, `deploy/*.json` | CONFIG |
| 10 | Owner identity in files | 4 places | LICENSE, one user-agent, docs sign-offs, CLAUDE.md | CODE (change per buyer repo) |

## 1. Brand name

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Display brand "LENSIQ" (header wordmark, tagline) | `nav.js:6` (`BRAND = {name, accent, full, tagline}`); product names in the menu `nav.js:13-96` ("LENSIQ Gate", "LENSIQ Exam" ...) | P | **ADMIN (phase 2)**: one brand object read from settings, so a buyer changes the name once. Today the name is written in the code of every page. |
| Brand in page text | 75 `*.html` pages (`<title>`, headings, footer `© 2026 LENSIQ`: `index.html:482`, `about.html:87`) | P | **ADMIN (phase 2)** via a `{brand}` token in the i18n layer. Do this only with a locked test that the default output is byte-identical (current tests assert wording). |
| Brand in translations | `i18n/en-*.js` + `i18n/zh-*.js`: 414 occurrences, 159 files (80 en, 79 zh) | P | **ADMIN (phase 2)** as above. |
| Brand in server messages | `backend/src`: 52 occurrences (receipt and e-mail subjects `mail.js:44,53,61`; owner alerts `alerts.js:10-15`; AI prompt `fortune-prompt.js`) | P | **ADMIN**: read the brand from the settings table. Alerts go to the owner only, so they can stay English. |
| Brand in `admin.html:337`, `admin-lead-notify.js:27` | literal LINE OA text inside admin help strings | P | **ADMIN**: build the sentence from the setting. |
| Code identifiers: `lensiq-*.js` (about 150 files), `window.LENSIQ_*` flags (115 uses of `LENSIQ_SELLER`, 97 of `LENSIQ_API_BASE`), `lq-*` storage keys and caches (`sw.js:12`), `LQ*` globals | all JS | P | **CODE**: not visible to users; renaming breaks tests, the service worker cache and stored user state. A buyer keeps these names. |
| Brand in docs (155 files), sales kit, one-pagers | `docs/` | P | Generated per buyer from templates; not a runtime setting. |

## 2. Logo and icons

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Wordmark (text "LENS" + accent "IQ", no image file) | `nav.js:6`; CSS in `styles.css` | P | **ADMIN (phase 2)**: allow text plus an uploaded SVG/PNG logo. There is no logo file in the repo today. |
| Favicon (inline SVG data URI) | `<link rel="icon">` in all 75 pages (`index.html:19`) | P | **CONFIG**: replace through the build step (`tools/build-site.mjs`) per buyer; a runtime setting cannot change `<head>` of a static page without a script, and a script icon is slow on first paint. |
| Colours and fonts | `styles.css` and per-page `*.css`; Prompt and Inter (SIL OFL) | P | **CONFIG**: theme tokens per deployment. Not an admin setting. |

## 3. Domain and URLs

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Public site `https://anirut77.github.io/lensiq/` | `README.md:5`, `CLAUDE.md:4`, `.github/workflows/pages-lfs.yml:1`, `tools/backend-smoke.mjs:8,40`, `tools/pc-public-photos.mjs:19`, `backend/wrangler.toml` ([env.test] `ALLOWED_ORIGINS`, `TURNSTILE_HOSTNAMES`, `LINE_LOGIN_REDIRECT_URI`, `SITE_URL`), `deploy/created.json`, `deploy/public-site.json` (hostname list), 3 test files, 23 doc files | P | **CONFIG**: this is infrastructure, per deployment. It must also agree with Worker CORS and Turnstile hostnames, so it cannot be a DB setting. Steps: `docs/CUSTOM-DOMAIN.md`. |
| Base path `/lensiq/` | 34 files (build and check tools, workflows, tests, docs) | P | **CONFIG**: GitHub Pages project-site path. A custom domain serves from `/`. |
| API origin (`LENSIQ_API_BASE`) | `lensiq-config.js:7` (empty by default); `deploy/public-site.json` `apiBase`; generated by `tools/build-site.mjs` | P | **CONFIG**. Allowed API hostnames: `deploy/domains.json` (empty). |
| Test Worker URL on the owner's account `workers.dev` subdomain | `deploy/created.json`, `deploy/public-site.json`, `tools/*` defaults | P (account subdomain) | **CONFIG**: replace per buyer; do not reuse the owner's account subdomain in a buyer repo. |

## 4. Seller and contact details

The single source today is `window.LENSIQ_SELLER` (`lensiq-config.js:111-129`). Readers: `legal.js:60-120`
(terms, privacy, help), `lensiq-leads.js:45` (quote form), `products.js:22`, `home.js`, `lensiq-golive.js`, and
`tools/check-legal.mjs`. The backend has its own copy as `SELLER_*` Worker vars. **Seller details are being moved
to a DB-only admin page on branch `seller-settings`** (no diff on `origin/main` yet at the time of counting), so
the recommendation below is the target for that page.

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Seller name, tax ID, address, branch | `lensiq-config.js:113-115` (empty); `backend/wrangler.toml` `SELLER_NAME/TAX_ID/ADDRESS/BRANCH` (empty, both envs); `backend/src/receipt.js:35-36` | P once filled (they print on invoices) | **ADMIN (`seller-settings`)**, and the Worker reads the DB first, wrangler var as fallback. Today the two copies must match (`tools/check-legal.mjs:90-94` fails when they differ): one DB row removes that drift. |
| Support e-mail, DPO name, DPO e-mail, status URL | `lensiq-config.js:116,119-121` (empty) | P once filled | **ADMIN**. |
| LINE OA for quotes (`quote_line`) | `lensiq-config.js:118` (the brand OA, public); literal mentions `admin.html:337`, `admin-lead-notify.js:27`, `tools/secrets-setup.mjs:56` | P (public OA id) | **ADMIN**; remove the literals in the three other places (they would show the owner's OA to a buyer). Locked tests (`leads-form-off.test.js`, `leads-public-id.test.js`) pin the current id and must be re-locked with the move. |
| General LINE OA (`line`), effective date, e-mail provider and location, cookie name and duration, Anthropic retention text, `counsel_confirmed`, `sales_open` | `lensiq-config.js:117,122-128` | P | **ADMIN**. `sales_open` and `counsel_confirmed` are go-live switches: changing them needs the owner's TOTP re-auth (existing money-switch rule), not a plain field. |
| Placeholders for the above in the legal pages | `terms.html` 15, `help.html` 15, `privacy.html` 47 `data-seller` slots (keys: name, tax_id, address, email, dpo_*, line, quote_line, status_url, effective_date, draft, counsel ...) | P | Keep the slot mechanism (CODE); only the data source changes. |
| Owner LINE user ID and channel token for lead pushes | Worker secrets `LEAD_NOTIFY_LINE_TO`, `LINE_CHANNEL_ACCESS_TOKEN` (format checks only: `backend/src/line-config.js`) | **S** | **CONFIG (Worker secret)**: never DB-readable in the admin UI. Admin may show "set / not set" only. |
| Sender address for e-mail | `MAIL_FROM`, `MAIL_PROVIDER` in `wrangler.toml` (empty); key `MAIL_API_KEY` | P (address) / **S** (key) | Address: **ADMIN**. Key: **CONFIG (secret)**. |

## 5. Prices and plans

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Consumer plans (Plus, report credits 49/99/199, draft Pro/Business/Enterprise) | D1 seed rows: `backend/migrations/0003_seed_plans.sql`, `0006_consumer_pricing.sql`; edited in the admin "billing" tab; fallback copy `pricing.js:43` | P | **ADMIN already** for the live values. Keep the seed as defaults; make the `pricing.js` fallback read the same rows. |
| Fortune paid prices (49 / 99 / 199 / Plus 149 / plan 99) | `fortune-paid.js:25` (`PRICES`), behind `LENSIQ_FORTUNE_PAID` (off); `docs/PENDING-DECISIONS.md` | P | **ADMIN** when the paid switch goes live: the page must show the same number the server charges (one source). Until then CODE (off). |
| B2B list prices (pilot and regular, excl. 7 % VAT) in the product pages | `gate.html` 9 lines, `exam.html` 8 (`:184-201`), `crowd.html` 2 (`:229-230`), `attendance.html` 3 (`:369`) | P | **ADMIN (phase 2)**: a price table (product, unit, pilot price, regular price) read by the pages. Needs the claim and wording tests re-locked, so it is a separate round. |
| Same prices in translations | `i18n/en-*.js` and `i18n/zh-*.js`: gate 9, exam 8, crowd 2, attendance 2 each (21 per language, 42 in total; Chinese writes 泰铢) | P | As above. |
| B2B prices in sales documents | `docs/sales/` quotation/invoice/receipt/order templates, 4 decks (`DECK-*.md`), 11 one-pagers `ONE-PAGER-*.md`, `docs/SALES-PACKAGES.md`, `docs/PRICING-RESEARCH.md`, `docs/BILLING-PLAN.md` | P | Per buyer: generated from the price table. Not a runtime setting. |
| VAT rate 7 % and `VAT_REGISTERED` | text in pages and docs; `VAT_REGISTERED` in `wrangler.toml` | P | VAT rate: **CODE** (law). `VAT_REGISTERED` and seller VAT status: **ADMIN** with the seller details. |
| Tests that pin prices | `tests/unit/pricing.test.js:26`, `backend-billing-receipts.test.js:417` | P | Move with the feature, never loosened (project rule). |

## 6. Help-line numbers (crisis rules)

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| 1323 (mental health), 1669 (medical emergency), 191 (police), 1300 (social assistance), 02 113 6789 (Samaritans of Thailand) | the single component `lensiq-helpline.js:20-51` (`LINES`, TH/EN/ZH words, hours); verification record `docs/CRISIS-RESOURCES.md`, `tools/helpline-sources.json`; recheck job `.github/workflows/helpline-recheck.yml` | P (public agency numbers) | **CODE**: owner decision. They are safety content with locked wording tests (forbidden-word list `lensiq-helpline.js:56-60`), a crisis flow that overrides everything else, and a periodic source check. An admin field could let a number be edited or removed with no review. |
| Mentions across the site | 971 mentions of 1323 in 123 code files (all fortune pages, `fortune-crisis.js`, `fortune-ai.js`, `lensiq-crisis-takeover.js`, `terms.html`, `nutrition.html`, `lensiq-med.js` ...); 49 test files | P | **CODE**. Every page draws numbers through the one component. |
| Resale note | numbers are Thailand-only | P | A buyer outside Thailand needs a different crisis-line pack (see `docs/RESALE-READINESS.md` section 6). Do not make it editable; make it a reviewed locale pack. |

## 7. Legal page text

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Terms of use (draft for legal review; Thai law, 30-day contact, Thai courts: `terms.html:195`, `:368`) | `terms.html` (546 lines, 26 brand mentions), `i18n/*-terms*` in en/zh | P | **CODE** text (lawyer-reviewed, test-locked); party names via ADMIN slots (section 4). A buyer needs its own reviewed text, so version it per deployment, not edit it live. |
| Privacy notice (processors named: Cloudflare, Anthropic, Google, Opn, LINE; retention numbers marked "draft": 12 `draft` slots) | `privacy.html` (560 lines, 47 `data-seller` slots) | P | **CODE** text; retention days from the existing admin "retention" tab and Worker vars (`LEADS_DAYS`, `RAW_EVENT_DAYS`, `AUDIT_DAYS`, `MEMBER_LEDGER_DAYS`, `WEBHOOK_PAYLOAD_DAYS`, `CSP_REPORT_DAYS`): **CONFIG/ADMIN** so the notice and the cron cannot disagree. |
| Help page and notices | `help.html` (450 lines), `camera-notice.html`, `gate-notice.html` | P | **CODE** text, ADMIN party details. |
| Legal-ready flags | `LEGAL_TERMS_READY`, `LEGAL_PRIVACY_READY`, `GO_LIVE_GATE` in `wrangler.toml`; `lensiq-golive.js` | P | **CONFIG** (go-live gate; stays behind owner approval). |
| Customer documents (draft for legal review) | `docs/legal/customer/` (terms of service B2B, DPA, pilot agreement, privacy notice template, consent forms), `docs/pdpa/` (8 files: DPIA, ROPA, retention, incident response ...) | P | Templates with party slots; generated per buyer. |
| Support terms | `docs/SUPPORT.md` | P | Per buyer (see resale note section 5). |

## 8. Analytics and notification targets

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Analytics and API endpoint | `LENSIQ_API_BASE` (`lensiq-config.js:7`) loads `lensiq-api.js` and `lensiq-analytics.js`; off unless the API origin is set; `LENSIQ_ANALYTICS` switch `:22` | P | **CONFIG**. No third-party analytics: events go to the deployment's own Worker. |
| Analytics allow-lists (pages, features, errors, consent versions) | `backend/src/constants.js:7-37`, mirrored in `lensiq-analytics.js:30-45` (drift test) | P | **CODE**: list of our own pages; a buyer who adds a page edits it in code. Optional extra features through var `ANALYTICS_FEATURES`. |
| Turnstile site key | `lensiq-config.js:12` (empty), `deploy/public-site.json`, `deploy/created.json` | P | **CONFIG** per deployment (site key is public). Secret `TURNSTILE_SECRET` is **S**: Worker secret. |
| Google sign-in client id | `lensiq-config.js:18`, `wrangler.toml` `GOOGLE_CLIENT_ID` (empty) | P | **CONFIG**; must match on both sides. |
| LINE Login redirect, LINE Login channel | `wrangler.toml` `LINE_LOGIN_REDIRECT_URI`; secrets `LINE_LOGIN_CHANNEL_ID/SECRET` | P / **S** | **CONFIG** / Worker secrets. |
| Owner alerts: webhook (Slack, Discord, ntfy ...) | secret `ALERT_WEBHOOK_URL` (`backend/src/alerts.js`; message texts `:10-15` carry no personal data) | **S** | **CONFIG (Worker secret)**. Admin shows set / not set, plus a test button (`/health/notify-test`). |
| Lead notification (LINE push) and its daily cap | secrets `LEAD_NOTIFY_LINE_TO`, `LINE_CHANNEL_ACCESS_TOKEN`; var `LEAD_NOTIFY_LINE_DAY` | **S** / P | Secrets: **CONFIG**. Cap: **ADMIN** (retention/limits tab). |
| Other secrets (names only, values live in Cloudflare) | `ADMIN_BOOTSTRAP_TOKEN`, `SECRETS_KEK`, `ANTHROPIC_API_KEY`, `OPN_SECRET_KEY`, `OPN_PUBLIC_KEY`, `OPN_WEBHOOK_SECRET`, `MAIL_API_KEY`, `HEALTH_TOKEN`, `TESTER_ACCESS_CODE`, `OPENFDA_API_KEY`, `DASHSCOPE_WORKSPACE_ID` | **S** | **CONFIG**: entered by the buyer with `npm run secrets:setup`; the agent never sees them. The AI provider key may also be saved from the admin panel (AES-GCM under `SECRETS_KEK`, already built). |
| Deployment behaviour vars | `wrangler.toml` `[vars]` (about 50: `FREE_MODE`, `BILLING_ENABLED`, `OPN_ALLOW_LIVE`, rate limits, cron `crons`) | P | **CONFIG**; money switches stay out of the admin UI unless behind TOTP re-auth (`MONEY_REAUTH`). |

## 9. Cloudflare resources and deploy records

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Worker names `lensiq-api`, `lensiq-api-test` | `backend/wrangler.toml` top and `[env.test]` | P | **CONFIG**: a buyer deploys under its own name (rename guard: `tools/lib/cf-guard.mjs` allows only `lensiq-*` names on the owner's shared account; a buyer's own account needs its own guard prefix). |
| D1 database name and id | `wrangler.toml` (top: placeholder id; `[env.test]`: the owner's real test id), `deploy/created.json` | P (account resource id) | **CONFIG**. Never reuse the test id in a buyer repo. |
| Turnstile widget record, created resources, rollback ids | `deploy/created.json`, `deploy/public-site.json` | P | **CONFIG**, per buyer. |
| Cron schedule | `wrangler.toml` `crons` | P | **CONFIG**. |
| CI and deploy workflows (repo, branch, Pages) | `.github/workflows/ci.yml`, `pages-lfs.yml`, `helpline-recheck.yml` | P | **CONFIG** per buyer repo. |

## 10. Owner identity in files

| Value | Where | P/S | Recommendation and reason |
|---|---|---|---|
| Copyright holder in the MIT licence | `LICENSE:3` (the public GitHub handle) | P | **CODE**: keep for our repo. A buyer's licence terms are a legal question (`docs/RESALE-READINESS.md` Q1). |
| HTTP user-agent naming a contact | `tools/pc-public-photos.mjs:19` | P | **CODE** (dev tool, not shipped). Change if the tool is handed over. |
| Owner name in docs and sign-offs | `docs/LICENCE-REQUESTS.md` (about 10 sign-off lines), `docs/LEGAL-PACKET.md:5`, `CLAUDE.md:6` | P | **CODE**: internal; excluded from a buyer package. |
| Owner's personal LINE ID | none. A test (`tests/unit/leads-public-id.test.js`) forbids it anywhere | - | Keep the test. |

## Gaps and notes

1. The legal pages show a neutral "announced before sales open" wording for every empty seller field, so an unconfigured
   buyer deployment is safe by default (`legal.js:60-70`). `check-legal.mjs` blocks go-live when fields are missing.
2. Two copies of seller data exist today (frontend `LENSIQ_SELLER`, Worker `SELLER_*`) and one drift check
   (`tools/check-legal.mjs`). The `seller-settings` branch should make the DB row the single source for both.
3. Nothing in this inventory is a secret committed to the repo. The Turnstile site key, Worker URL and D1 id in
   `deploy/*.json` are public identifiers of the owner's account; they are listed as per-buyer values to replace.

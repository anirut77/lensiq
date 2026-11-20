# Production move plan: off GitHub Pages before the first paid customer

Status: **PLAN ONLY (owner order D, 2026-11-18).** Nothing in this document has been created, bought, deployed or
changed. No DNS record, Cloudflare resource, GitHub setting or secret was touched while writing it. Every price and
limit below was read from the official page on **2026-11-18**; the URL is next to each figure. Prices change: the
figure shown at checkout on the day is the one that counts.

---

## สรุปภาษาไทย (อ่านส่วนนี้ก่อน)

**ทำไมต้องย้าย:** ข้อกำหนดของ GitHub Pages เขียนไว้ชัดว่า "GitHub Pages is not intended for or allowed to be used as a
free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed
at either facilitating commercial transactions or providing commercial software as a service (SaaS)."
(https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits, อ่านเมื่อ 2026-11-18)
ดังนั้นต้องย้ายเว็บไซต์ก่อนออกใบเสนอราคา/เก็บเงินลูกค้ารายแรก

**ข้อเสนอ:** ย้ายเว็บไปที่ **Cloudflare Pages** ในบัญชี Cloudflare เดิม (บัญชีเดียวกับ Worker `lensiq-api-test` และ D1
`lensiq-test`) และสร้าง **ชุด production แยกใหม่ทั้งหมด** ชื่อขึ้นต้น `lensiq-prod-*` (Worker, D1, Turnstile, Pages)
ไม่แตะ Worker/โดเมนของโปรเจกต์อื่น (dearday, aidanex, faksak.com, tripsdna.com)

| ตัวเลือก | ค่าใช้จ่าย | เหตุผล |
|---|---|---|
| **Cloudflare Pages (แนะนำ)** | เว็บ: ฟรี (ไฟล์ static ไม่จำกัดคำขอ ไม่คิดเงิน) / API: แนะนำ Workers Paid **5 USD ต่อเดือนต่อบัญชี** ตอนเปิดขายจริง | อยู่บัญชีเดียวกับ API และ D1 เดิม, ไม่มีค่าแบนด์วิดท์ (โมเดล AI บนเครื่องไฟล์ใหญ่ถึง ~25 MB), ใช้ข้อกำหนดที่อนุญาตให้โฮสต์เนื้อหา |
| Hostinger (Premium) | 1.99 USD/เดือน ต้องจ่ายล่วงหน้า 48 เดือน = 95.52 USD, ต่ออายุ 10.99 USD/เดือน | ข้อกำหนดอนุญาตใช้เชิงพาณิชย์ แต่ API ยังต้องอยู่ Cloudflare อยู่ดี = 2 ผู้ให้บริการ, deploy ผ่าน CI ยากกว่า |
| Netlify | ฟรี 300 เครดิต/เดือน (deploy ครั้งละ 15 เครดิต, แบนด์วิดท์ 20 เครดิต/GB), หมดแล้ว **เว็บถูกปิด**; Personal 9 USD/เดือน | ไฟล์โมเดลใหญ่ทำให้เครดิตหมดเร็ว; ยืนยันข้อกำหนดการใช้เชิงพาณิชย์ของแผนฟรีไม่ได้ (ไฟล์สัญญาอ่านไม่ได้) |
| (ตัดออก) Vercel Hobby | ฟรี | ข้อกำหนดห้ามใช้เชิงพาณิชย์: "only use the Services under a Hobby plan for your personal or non-commercial use" |

**ต้องจ่ายเมื่อไร:**
1. **โดเมนใหม่** (ราคาต่อปีตามหน้าชำระเงิน): ก่อนย้าย (ขั้นที่ 1) — เป็นการใช้เงิน ต้องให้คุณตัดสินใจ
2. **Workers Paid 5 USD/เดือน (ทั้งบัญชี)**: แนะนำให้เปิดก่อนวันย้ายจริง เพราะโควตาฟรี 100,000 คำขอ/วัน, cron 5 ตัว/บัญชี และ D1
   เขียน 100,000 แถว/วัน **ใช้ร่วมกับโปรเจกต์อื่นของคุณ** ถ้าโปรเจกต์อื่นใช้เยอะ ระบบ LENSIQ ของลูกค้าก็ล่มไปด้วย
3. Pages, Turnstile: ฟรีพอ

**สิ่งที่คุณต้องทำเอง:** ซื้อโดเมน; เพิ่มโดเมนใน Cloudflare; สร้าง Pages project และ Turnstile widget ใหม่ใน dashboard;
สร้าง API token ของ Cloudflare (สิทธิ์ Pages อย่างเดียว) แล้วใส่เป็น GitHub secret เอง; ใส่ค่า secret ทุกตัวของ Worker
production เอง (`npm run secrets:setup`); แก้ callback ใน LINE Developers console; ตัดสินใจเปิด Workers Paid

**เวลารวม:** งานเอเจนต์ประมาณ 1.5–2 วันทำงาน (สาขา + CI) + งานของคุณประมาณ 2–3 ชั่วโมง กระจายใน 3–7 วัน (รอ DNS/โดเมน)

**ชื่อโดเมนที่เสนอ (คุณต้องตรวจว่าว่างหรือไม่เอง):** `lensiq.ai`, `lensiq.app`, `getlensiq.com`, `lensiq.co.th`
(ต้องมีบริษัท/เครื่องหมายการค้าชื่อตรงกัน), `lensiqthai.com`

**ความเสี่ยงสำคัญ:** ข้อมูลที่ผู้ใช้เก็บไว้ในเครื่อง (localStorage/IndexedDB) ผูกกับที่อยู่เว็บเดิม เมื่อย้ายโดเมนข้อมูลจะไม่ตามไป
ต้องมีหน้าส่งออกข้อมูลที่ที่อยู่เดิม (ดูข้อ 2.7) — รายการ "รอคุณตัดสิน" อยู่ท้ายเอกสาร

---

## 1. Why we move, and where to

### 1.1 The GitHub Pages clause

Source: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (read 2026-11-18):

> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business,
> e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or
> providing commercial software as a service (SaaS)."

Same page: published sites "may be no larger than 1 GB", "soft bandwidth limit of 100 GB per month".

Today LENSIQ is a free, closed-test service (`FREE_MODE = "true"`, `BILLING_ENABLED = "false"`). Selling Exam, Gate,
Attendance and Crowd by quotation (Sellable pack) makes it a commercial SaaS front end, so the move must happen **before
the first quotation is issued that points customers to the site**.

### 1.2 Options compared (all figures read 2026-11-18)

| | **Cloudflare Pages (recommended)** | Hostinger web hosting | Netlify |
|---|---|---|---|
| Commercial use | Allowed. Developer Platform terms: "Unlike most Cloudflare products, the Developer Platform can be used to host content." (https://www.cloudflare.com/service-specific-terms-developer-platform/). The Self-Serve Subscription Agreement (https://www.cloudflare.com/terms/) has no commercial-use restriction; it forbids reselling access (§2.2.1(a)) | Allowed. Universal ToS §6.1: "The Site and the Services are intended for your commercial or professional use." (https://www.hostinger.com/legal/universal-terms-of-service-agreement) | **Not confirmed.** Terms of Use defer to the Self-Serve Subscription Agreement (https://www.netlify.com/legal/terms-of-use/); that agreement is a PDF we could not read on 2026-11-18. Owner or agent must confirm before choosing it |
| Price, static site | Free | Premium 1.99 USD/mo on a 48-month term, 95.52 USD paid upfront, renews at 10.99 USD/mo (https://www.hostinger.com/web-hosting) | Free: 300 credits/mo; Personal 9 USD/mo (1,000 credits); Pro 20 USD/mo (3,000 credits) (https://www.netlify.com/pricing/) |
| Bandwidth / requests | "Requests to static assets are free and unlimited" (https://developers.cloudflare.com/workers/platform/pricing/) | "Unmetered", subject to a Fair Usage Policy (https://www.hostinger.com/web-hosting) | 20 credits per GB, 2 credits per 10,000 requests, 15 credits per production deploy (https://www.netlify.com/pricing/). Free plan is a hard limit: "all of your web projects (sites/apps) are paused" when credits run out (https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) |
| File limits | 20,000 files per site (Free); **25 MiB per file** (https://developers.cloudflare.com/pages/platform/limits/) | Premium (v6): 400,000 inodes, 20 GB disk (https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans) | not limiting at our size |
| Deploys | 500 builds/month Free; we upload from GitHub Actions after CI is green | FTP / Git; no first-party CI action | 15 credits per production deploy (20 deploys = whole free month) |
| Backend (API Worker, D1) | Same account as today's `lensiq-api-test` and `lensiq-test` | None: API stays on Cloudflare anyway (two vendors) | Would stay on Cloudflare (two vendors) |
| HTTP headers (real CSP, `frame-ancestors`) | `_headers` file: 100 rules (same limits page) | `.htaccess` | `_headers` |

**Excluded: Vercel Hobby.** Its terms, §4: "You shall only use the Services under a Hobby plan for your personal or
non-commercial use." (https://vercel.com/legal/terms, read 2026-11-18). Vercel Pro is 20 USD per developer seat per
month (https://vercel.com/docs/plans/hobby) and adds a third vendor; no advantage over Cloudflare for a static site.

**Why Cloudflare Pages:**
1. LENSIQ ships its AI models to the phone (on-device processing). Several files are large: `vendor/models/modnet.onnx`
   25,888,640 bytes, `ppocrv5_mobile_rec.onnx` 16.5 MB, `ort-wasm-simd-threaded.wasm` 11.2 MB. On Netlify, each GB costs
   20 of the 300 free credits, so a few hundred first visits would pause the site. On Cloudflare static requests are free.
2. One account, one dashboard, one deploy tool (wrangler) for site, API, D1 and Turnstile; the deploy guard in
   `tools/backend-deploy.mjs` already refuses non-`lensiq-*` names.
3. Free plan covers the site; the only recommended spend is Workers Paid (section 3).

**Note:** Cloudflare now also serves static sites from a Worker with static assets. Pages is chosen because the owner
expects it and its limits are documented above; switching later is a deploy-tool change, not a migration of data.

**Pages limit to watch:** 25 MiB per file = 26,214,400 bytes. `modnet.onnx` is 25,888,640 bytes (margin 325,760 bytes,
1.2 %). The build must fail early if any file in `_site/` exceeds 25 MiB (new check in step A3).

---

## 2. Separate production environment

### 2.1 What exists today (read from the repo on 2026-11-18)

| Part | Today | Source |
|---|---|---|
| Public site | `https://anirut77.github.io/lensiq/`, built by `tools/build-site.mjs`, deployed by `.github/workflows/pages-lfs.yml` only after CI is green | workflows |
| API Worker | `lensiq-api-test` at `https://lensiq-api-test.anirut-s-4df.workers.dev`, `[env.test]` in `backend/wrangler.toml`, cron `17 3 * * *` only | `deploy/created.json` |
| D1 | `lensiq-test` (id `3385c7cc-…`), binding `DB`, migrations through `0013_recovery_slow_hash.sql` | `deploy/created.json` |
| Turnstile | widget `lensiq-test`, site key `0x4AAAAAAF8DHx23TkGQgxdj` (public), hostname `anirut77.github.io`, Managed | `deploy/created.json` |
| Site → API config | `deploy/public-site.json` (`apiBase`, `turnstileSiteKey`, pages, `testerGate: true`) | repo |
| Approved API hostnames | `deploy/domains.json` `apiHosts: []` | repo |
| CORS | `ALLOWED_ORIGINS = "https://anirut77.github.io"`, `ADMIN_ORIGINS = ""` (admin is same-origin on the Worker) | `[env.test.vars]` |
| Turnstile hostnames | `TURNSTILE_HOSTNAMES = "anirut77.github.io"` | `[env.test.vars]` |
| LINE | Messaging API push only (lead alerts, no webhook receives anything); LINE Login callback `LINE_LOGIN_REDIRECT_URI = https://anirut77.github.io/lensiq/account.html` | `[env.test.vars]`, `backend/src/line.js` |
| Opn webhook | route `/v1/billing/webhook/opn` (billing off) | `backend/src` |
| Admin | `/admin` on the Worker host, `__Host-` cookie | `docs/CUSTOM-DOMAIN.md` |
| Never touched | `dearday-staging`, `aidanex-staging`, `aidanex-pet-clinic-pilot`, `aidanex-sales-staging`, `aidanex-pet-clinic`, `kaguwood-store`, `faksak.com`, `tripsdna.com` | `deploy/created.json` |

### 2.2 Proposed production resources (all new; test stays as it is)

| Resource | Proposed name | Notes |
|---|---|---|
| Pages project (site) | `lensiq-prod-site` | serves `_site/` at `https://www.<domain>/` (and `lensiq-prod-site.pages.dev`) |
| API Worker | `lensiq-prod-api` | new `[env.production]` in `backend/wrangler.toml` (all vars repeated, as the unit test requires for `[env.test]`) |
| D1 database | `lensiq-prod` | fresh database, migrations 0001 → latest; **no test data copied** |
| Turnstile widget | `lensiq-prod` | Managed; hostnames `www.<domain>`, `<domain>` (10 per widget on Free: https://developers.cloudflare.com/turnstile/plans/) |
| API hostname | `api.<domain>` | Worker Custom Domain (Cloudflare creates the record and certificate) |
| Admin | `https://api.<domain>/admin` | same-origin as today; option later `admin.<domain>` |
| Zone | `<domain>` | new zone holding only LENSIQ records |
| GitHub secret | `CLOUDFLARE_PAGES_TOKEN` (name only) | Cloudflare API token scoped to *Account → Cloudflare Pages → Edit* on this account only; the owner creates it and enters it in GitHub. Plus `CLOUDFLARE_ACCOUNT_ID` (not secret) |

`tools/backend-deploy.mjs` today accepts only `--env test`. Step A2 adds `--env production` with the same guard
(prints target, refuses any name not starting `lensiq-prod-` for that env, never `--name` with secret commands).

### 2.3 Production variables that differ from test

| Var | Test | Production |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://anirut77.github.io` | `https://www.<domain>,https://<domain>` (old origin **not** included) |
| `TURNSTILE_HOSTNAMES` | `anirut77.github.io` | `www.<domain>,<domain>` |
| `SITE_URL` | `https://anirut77.github.io/lensiq` | `https://www.<domain>` |
| `LINE_LOGIN_REDIRECT_URI` | `…github.io/lensiq/account.html` | `https://www.<domain>/account.html` |
| `TESTER_GATE` | `required` | owner decision (see "รอคุณตัดสิน" D-3); recommendation: `required` until terms/privacy are signed off |
| `PC_BUILD` | `demo` | `customer` (licence-limited sources off, CLAUDE.md "customer builds") |
| `DAILY_REQUEST_CAP` | `20000` | `20000` on Free; raise only after Workers Paid |
| `D1_WRITE_BUDGET` | `5000` | same on Free |
| crons | `17 3 * * *` | `17 3 * * *`; add `*/15 * * * *` only when billing is switched on |
| `FREE_MODE`, `BILLING_ENABLED`, `OPN_ALLOW_LIVE`, `LEGAL_*_READY`, `GO_LIVE_GATE` | unchanged | unchanged (`true`, `false`, `false`, `false`, `enforce`); sales are by quotation and bank transfer, no online payment |

The site build gets a second config `deploy/public-site.prod.json` (apiBase `https://api.<domain>`, new site key) so
test and production builds cannot mix.

- `/api/fortune/status` is called only when `LENSIQ_API_BASE` is set (decision 190, 2026-11-20); the site never guesses
  from the host name. Set it for the new domain if the AI writer is ever enabled. With no API base the fortune pages make
  no status request and the AI writer stays off (same as on `github.io` today). Locked test: `api-status-guard`.

### 2.4 Secrets (names only; the owner enters every value in his own terminal)

Entered with `npm run secrets:setup -- --env production` (step A2 adds the flag). **New values for production**; never
copy test values, and `SECRETS_KEK` must be a new key (it encrypts the admin TOTP secret).

| Name | When |
|---|---|
| `SECRETS_KEK` | before first deploy (generated, never shown) |
| `ADMIN_BOOTSTRAP_TOKEN` | before first deploy; closed with `backend:bootstrap:close` right after the owner account exists |
| `TURNSTILE_SECRET` | before first deploy (secret key of widget `lensiq-prod`) |
| `TESTER_ACCESS_CODE` | only if `TESTER_GATE = required` |
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` | only if AI features are on in production |
| `HEALTH_TOKEN` | recommended (protects `/health/deep`, enables LINE test) |
| `ALERT_WEBHOOK_URL` | recommended |
| `LINE_CHANNEL_ACCESS_TOKEN`, `LEAD_NOTIFY_LINE_TO` | for quote-request alerts |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` | only if LINE sign-in is on |
| `OPENFDA_API_KEY` | optional |
| `MAIL_API_KEY` | only when e-mail is set up |
| `OPN_SECRET_KEY`, `OPN_PUBLIC_KEY`, `OPN_WEBHOOK_SECRET` | not now (no online payment) |

### 2.5 Turnstile, LINE, CORS

- **Turnstile:** new widget `lensiq-prod` (owner, dashboard). Keep `lensiq-test` for the test site. The public site key
  goes into `deploy/public-site.prod.json`; the secret key goes only into `secrets:setup`.
- **LINE:** there is no LINE webhook today (LENSIQ only pushes). Two console changes: (1) LINE Login channel → Callback
  URL: add `https://www.<domain>/account.html` (keep the old one until cut-over + 7 days); (2) nothing for Messaging API
  pushes; the same OA can serve test and production, or the owner issues a second channel access token for production
  so test can be revoked separately (recommended).
- **CORS:** production `ALLOWED_ORIGINS` lists only the new origins. The old GitHub Pages origin keeps talking to
  `lensiq-api-test` until it becomes a redirect site; after that it calls no API at all.

### 2.6 Redirects from `https://anirut77.github.io/lensiq/`

GitHub Pages cannot send HTTP 301s. After cut-over, `pages-lfs.yml` publishes a **redirect-only site** (no tools, no
models) built by a new `tools/build-redirect-site.mjs`:

- one stub per old page, e.g. `exam.html`:
  ```html
  <!doctype html><html lang="th"><head><meta charset="utf-8">
  <title>LENSIQ ย้ายแล้ว / moved / 已迁移</title>
  <link rel="canonical" href="https://www.<domain>/exam.html">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=https://www.<domain>/exam.html">
  <script>location.replace("https://www.<domain>/exam.html"+location.search+location.hash)</script>
  </head><body><p><a href="https://www.<domain>/exam.html">LENSIQ ย้ายไปที่ www.&lt;domain&gt; / has moved / 已迁移</a></p></body></html>
  ```
  (the script keeps the query string and `#hash`, e.g. QR links; the meta refresh covers browsers without JS);
- `index.html` → `https://www.<domain>/`, and `404.html` with a small script that maps any unknown path to the same
  file name on the new host;
- the stubs carry the same `<meta>` CSP style as today (`script-src` allows only that inline hash);
- `sw.js` on the old origin is replaced by a service worker that unregisters itself and clears its caches, so phones
  that cached the old site load the redirect;
- keep the redirect site for at least 12 months (QR codes and printed material point at the old URL).

The production site carries `<link rel="canonical">` to its own `https://www.<domain>/…` URL on every page.

### 2.7 On-device data does not follow the move (risk)

Everything LENSIQ stores on a phone (settings, the 18+ "read it straight" choice, local records in localStorage /
IndexedDB) belongs to the origin `https://anirut77.github.io`. The new origin starts empty. Mitigation (proposal,
needs D-4): the old origin keeps **one extra page** `export.html` that reads that origin's local data and offers it as a
file the user saves, plus an import button on the new site. No data passes through a server. Without it, testers re-enter
their settings; customer data is not affected because no paying customer exists yet.

### 2.8 Rollback

| Situation | Action | Time |
|---|---|---|
| New site broken after cut-over | Re-run the last green `pages-lfs.yml` on the commit **before** the redirect switch (the full site returns at the old URL); `lensiq-api-test` was never changed | ~10 min (CI must already be green for that commit) |
| New site bad deploy | Cloudflare Pages → `lensiq-prod-site` → Deployments → previous → Rollback | 1 min |
| Production Worker bad | `npm run backend:rollback -- <VERSION_ID> --env production` (to be added in A2); D1 data is **not** rolled back | 1 min |
| D1 data damaged | D1 Time Travel: 7 days on Free, 30 days on Paid (https://developers.cloudflare.com/d1/platform/limits/) | ~15 min |
| Everything off | `npm run backend:off -- --env production` (every public route except `/health` answers 503) | seconds |

The old URL keeps the full site until the very last cut-over step, so up to that point rollback is "do nothing".

---

## 3. Paid plans: what, when, how much (read 2026-11-18)

Source unless noted: https://developers.cloudflare.com/workers/platform/pricing/ and
https://developers.cloudflare.com/workers/platform/limits/.

| Item | Free (shared by the **whole account**, incl. dearday/aidanex) | Paid | Trigger for LENSIQ |
|---|---|---|---|
| Workers requests | 100,000 / day | 5 USD / month per account minimum; 10 M / month included, then 0.30 USD per M | **Recommended at cut-over**: on Free, another project's traffic can exhaust the account's daily quota and take LENSIQ customers down |
| CPU per request | 10 ms | 30 M CPU ms / month included, then 0.02 USD per M | if slow-hash sign-in or AI routes hit the 10 ms limit (watch errors 1102) |
| Cron triggers | 5 per account | 250 | production needs 1 (2 when billing is on); test uses 1; other projects' crons count too |
| D1 rows written | 100,000 / day | 50 M / month incl., then 1.00 USD per M | when `D1_WRITE_BUDGET` 429s appear |
| D1 rows read | 5 M / day | 25 billion / month incl. | unlikely |
| D1 size | 500 MB per database, 5 GB per account (https://developers.cloudflare.com/d1/platform/limits/) | 10 GB per DB; storage beyond 5 GB 0.75 USD per GB-month | far off |
| D1 Time Travel | 7 days | 30 days | Paid gives a safer restore window |
| Workers Logs | 200,000 events / day, 3 days (https://developers.cloudflare.com/workers/observability/logs/workers-logs/) | 20 M / month, then 0.60 USD per M, 7 days | page says pricing moves to "Cloudflare Observability pricing" on **2026-12-01**: re-check before cut-over |
| Pages | 500 builds / month, 20,000 files, 25 MiB per file, 100 custom domains per project | Pro: 5,000 builds, 100,000 files | not expected |
| Static asset requests | free and unlimited | same | none |
| Turnstile | free, up to 20 widgets, 10 hostnames each, unlimited challenges (https://developers.cloudflare.com/turnstile/plans/) | Enterprise | none |
| Domain | yearly fee at Cloudflare Registrar, which "does not mark up domain prices at all" (https://www.cloudflare.com/products/registrar/) | | before step O1 |

**Recommendation:** one spend now (domain) and one at cut-over (Workers Paid, 5 USD / month for the whole account).
Both are owner decisions (money).

### 3.1 What the owner does personally

1. Choose and buy the domain (money; agent never buys).
2. Cloudflare dashboard: add the zone (automatic if bought at Cloudflare Registrar).
3. Cloudflare dashboard: create Pages project `lensiq-prod-site` with **Direct Upload** (no Git connection, so only green
   CI deploys), add custom domains `www.<domain>` and `<domain>`.
4. Cloudflare dashboard: Turnstile widget `lensiq-prod` (Managed) with both hostnames; send the agent the site key.
5. Cloudflare dashboard: API token (Pages Edit, this account only) → enter it in GitHub as secret
   `CLOUDFLARE_PAGES_TOKEN` (the agent does not change repo settings and never sees the value).
6. Own terminal: `npm run secrets:setup -- --env production` (section 2.4).
7. Cloudflare dashboard: Worker `lensiq-prod-api` → Custom domain `api.<domain>`.
8. LINE Developers console: callback URL; optionally a production channel access token.
9. Decide Workers Paid (5 USD / month) and enable it in Billing.
10. First admin sign-in at `https://api.<domain>/admin` with the one-time bootstrap token, set up TOTP.

---

## 4. Brand domain suggestions

**Availability to be checked by the owner.** No registrar or WHOIS service was queried with these names.

| Name | Note |
|---|---|
| `lensiq.ai` | short, fits an AI product; supported at Cloudflare Registrar (".ai" listed on the Registrar page) |
| `lensiq.app` | `.app` is HTTPS-only by design; supported at Cloudflare Registrar |
| `getlensiq.com` | `.com` is the most trusted ending for Thai B2B buyers; use if `lensiq.com` is taken |
| `lensiq.co.th` | strongest local signal, but THNIC requires a registered company or trademark whose name matches (THNIC SLD guideline, https://thnic.or.th/doc/SLD_Guideline2026_EN.pdf); not sold by Cloudflare: register with a Thai registrar and point nameservers to Cloudflare |
| `lensiqthai.com` | fallback `.com` |

Also check before buying: a trademark search for "LENSIQ" in Thailand (DIP) and for conflicting brands (legal packet).

---

## 5. Step list

Who: **A** = agent (repo, branch, CI; never DNS, never money, never secrets), **O** = owner.
Times are working time, not waiting time.

| # | Who | Step | Time |
|---|---|---|---|
| O1 | O | Decide domain (section 4) and buy it; Workers Paid decision | 30 min + registrar wait (minutes for .com/.ai at Cloudflare; ~3 working days for .co.th) |
| A1 | A | Branch `prod-env`: `[env.production]` in `wrangler.toml` (all vars, `lensiq-prod-api`, D1 placeholder), unit test that every var exists and names start `lensiq-prod-` | 2 h |
| A2 | A | `tools/backend-deploy.mjs` and `secrets-setup` accept `--env production` with the name guard; `deploy/created.prod.json`; `deploy/public-site.prod.json`; tests | 3 h |
| A3 | A | Build: root-path build of `_site/` (today CI checks every page under `/lensiq/`; add the same crawl at `/`), file-size check < 25 MiB, `_headers` (same CSP as today's meta tags, plus `frame-ancestors` as header), canonical tags | 3 h |
| A4 | A | Workflow `deploy-prod.yml`: after CI green on main, `wrangler pages deploy _site --project-name lensiq-prod-site --branch main` with the token secret; refuses any project name not `lensiq-prod-*`. Off until the secret exists | 2 h |
| A5 | A | `tools/build-redirect-site.mjs` + self-unregistering `sw.js` + optional `export.html` (D-4) + tests; **not** wired into `pages-lfs.yml` yet | 3 h |
| A6 | A | Full gate on the branch in GitHub Actions; independent reviewer (CLAUDE.md); merge by coordinator | CI time |
| O2 | O | Steps 2–5 of §3.1 (zone, Pages project + domains, Turnstile, API token into GitHub) | 45 min |
| A7 | A | `npm run backend:d1:create -- --env production` (D1 `lensiq-prod`), migrations, first deploy of `lensiq-prod-api` (prints each target first) | 30 min |
| O3 | O | `secrets:setup -- --env production`; custom domain `api.<domain>`; admin bootstrap + TOTP | 40 min |
| A8 | A | `bootstrap:close`, smoke test (`backend:smoke -- --base https://api.<domain> --origin https://www.<domain>`), first Pages deploy, crawl of `https://www.<domain>/` in TH/EN/ZH | 1 h |
| O4 | O | Owner test checklist on the new domain on a real iPhone and Android (quote form, Exam, Gate, Attendance, Crowd) | 1 h |
| — | both | Cut-over day (below) | 2 h |
| A9 | A | Day +7: remove old callback in docs; day +30: report; month 12: ask before removing redirect site | 15 min each |

Total: agent ≈ 14–16 h (1.5–2 working days plus CI), owner ≈ 3–4 h, spread over 3–7 calendar days.

### 5.1 Cut-over day checklist

Before (T-1 day):
- [ ] CI green on main; latest `lensiq-prod-site` deploy is that commit; `lensiq-prod-api` smoke test passes.
- [ ] Quote form on `https://www.<domain>/` sends a test request; owner receives the LINE alert.
- [ ] Turnstile passes on `www.<domain>` and `<domain>`; admin sign-in with TOTP works.
- [ ] Every page loads in TH, EN, ZH with no 404 (crawl report attached).
- [ ] Legal pages show the "draft for legal review" banner as today (no claim beyond what was measured).
- [ ] Workers Logs pricing re-checked (changes 2026-12-01).
- [ ] Rollback commit id noted (the last green commit of the full site on GitHub Pages).

Cut-over (T, about 2 h, owner present):
1. [ ] A: merge the branch that switches `pages-lfs.yml` to publish the redirect site (CI green first).
2. [ ] A: confirm `https://anirut77.github.io/lensiq/exam.html?x=1#y` lands on `https://www.<domain>/exam.html?x=1#y`.
3. [ ] A: confirm an old phone with the cached site gets the redirect after one reload (service worker unregisters).
4. [ ] O: update links in the LINE OA profile, rich menu, e-mail signature, sales kit, one-pagers and decks.
5. [ ] A: update `docs/CTO-BRIEF.md`, `docs/FIELD-PILOT.md`, `docs/CUSTOM-DOMAIN.md`, `docs/DEPLOY.md`, sales templates
       (quotation/invoice footers) with the new URL; commit on a branch, CI, merge.
6. [ ] A: watch `lensiq-prod-api` errors and 429s for 2 h; report numbers.

After:
- [ ] Day +1: owner test checklist again on real phones.
- [ ] Day +7: remove the old LINE Login callback; decide whether `lensiq-api-test` stays as the test environment
      (recommended: yes, it keeps serving testers).
- [ ] No quotation goes out with the `github.io` address after T.

---

## รอคุณตัดสิน

**D-1 โดเมน (ใช้เงิน):** ต้องเลือกและซื้อชื่อโดเมนก่อนเริ่มขั้น O2 ตัวเลือก: `lensiq.ai`, `lensiq.app`, `getlensiq.com`,
`lensiq.co.th` (ต้องมีบริษัท/เครื่องหมายการค้าชื่อ LENSIQ), `lensiqthai.com` ราคาเป็นรายปีตามหน้าชำระเงินของผู้จดทะเบียน
(Cloudflare Registrar ไม่บวกกำไร) **ข้อแนะนำ:** `.com` ถ้าว่าง (`lensiq.com` หรือ `getlensiq.com`) จดที่ Cloudflare Registrar
บวก `lensiq.co.th` ภายหลังเมื่อจดบริษัทแล้ว **ถ้าไม่ตอบ:** เอเจนต์ทำขั้น A1–A6 (โค้ดและเอกสาร) ต่อได้ แต่หยุดก่อนขั้น O2/A7
เว็บยังอยู่ที่ GitHub Pages และ**ยังไม่ควรออกใบเสนอราคาที่ชี้ลูกค้าไปที่เว็บ**

**D-2 Workers Paid 5 USD/เดือน (ใช้เงิน, ทั้งบัญชี):** แผนฟรีให้ 100,000 คำขอ/วัน, cron 5 ตัว, D1 เขียน 100,000 แถว/วัน
**รวมทั้งบัญชี** ที่ใช้ร่วมกับ dearday/aidanex ตัวเลือก: (ก) เปิด Paid ก่อนวันย้าย (ข) อยู่แผนฟรีและพึ่งเพดาน 20,000 คำขอ/วัน
ที่ LENSIQ ตั้งไว้เอง **ข้อแนะนำ:** (ก) ก่อนลูกค้ารายแรกที่จ่ายเงิน **ถ้าไม่ตอบ:** อยู่แผนฟรี (ข) ไม่มีการใช้เงิน
ความเสี่ยงคือถ้าโปรเจกต์อื่นใช้โควตาหมด ระบบของลูกค้า LENSIQ จะตอบผิดพลาดจนถึงเวลา 07:00 น. (00:00 UTC) วันถัดไป

**D-3 ประตูรหัสผู้ทดสอบใน production:** ตัวเลือก: (ก) `TESTER_GATE = required` ต่อไปจนทนายรับรองข้อกำหนด/นโยบายความเป็นส่วนตัว
(ฟีเจอร์ AI และแหล่งข้อมูลที่ยังไม่ยืนยันใบอนุญาตใช้ได้เฉพาะคนมีรหัส) (ข) เปิดให้ทุกคน **ข้อแนะนำ:** (ก) เพราะ
`LEGAL_TERMS_READY` และ `LEGAL_PRIVACY_READY` ยังเป็น false **ถ้าไม่ตอบ:** ใช้ (ก)

**D-4 หน้าส่งออกข้อมูลในเครื่องที่ที่อยู่เดิม:** ข้อมูลที่ผู้ทดสอบเก็บในเครื่อง (การตั้งค่า, การยืนยันอายุ 18+, บันทึกในเครื่อง)
ไม่ตามมาที่โดเมนใหม่ ตัวเลือก: (ก) สร้าง `export.html` ที่ที่อยู่เดิม + ปุ่มนำเข้าที่เว็บใหม่ (งานเอเจนต์ประมาณ 3 ชั่วโมง ข้อมูลไม่ผ่านเซิร์ฟเวอร์)
(ข) ไม่ทำ ผู้ทดสอบตั้งค่าใหม่ **ข้อแนะนำ:** (ก) **ถ้าไม่ตอบ:** ทำ (ก) เพราะไม่ใช้เงินและไม่ส่งข้อมูลออกจากเครื่อง

**D-5 ปิดเว็บไซต์ทดสอบเดิม:** หลังย้าย Worker `lensiq-api-test` และ D1 `lensiq-test` ยังทำงานต่อสำหรับผู้ทดสอบ
**ข้อแนะนำ:** เก็บไว้ (การลบเป็นเงื่อนไขต้องถามคุณ) **ถ้าไม่ตอบ:** เก็บไว้ ไม่ลบอะไร

# LENSIQ backend — Cloudflare Worker + D1

> Status: **scaffold, not deployed.** The public site keeps working with no backend at all (`LENSIQ_API_BASE = ""`).
> The service is **free** (`FREE_MODE=true`); billing code is ready but switched off.
>
> **Owner decisions of 2026-11-13:** payment is by **bank transfer only** for now, so the Opn / PromptPay billing code below is a dormant scaffold, not the way customers pay. Receipts for transfers are issued by the owner
> from the template (`docs/sales/RECEIPT-TEMPLATE.md`); the system does not number them yet (plan: system numbering `LQ-YYYYMM-000001` after the accountant confirms). Only Gate, Attendance, Exam (lab room) and Crowd report
> get back-office order plans, with no online purchase. Free-tier limits are not enforced in the code yet (`docs/PRICING-RESEARCH.md`, `docs/BILLING-PLAN.md`). Planned, not built: a licence that works offline for 14 days,
> and organisation accounts (lite: organisation name, billing details, admins and staff, invitations, no syncing of the customer's people data).

## 1. Architecture

```
 GitHub Pages (static, allowlisted build)                  Cloudflare (processor)
 ┌──────────────────────────────────────────┐   HTTPS   ┌───────────────────────────────────────────┐
 │ *.html + lensiq-config.js                │──────────▶│ Worker  backend/src/index.js              │
 │   LENSIQ_API_BASE = "" (default: offline)│  CORS:    │   /api/fortune      AI writing assistant  │──▶ Anthropic Messages API
 │   └ when set → lensiq-api.js             │  Origin   │   /v1/events        privacy-first stats   │    (official SDK, claude-opus-5-5)
 │                lensiq-analytics.js (opt-in)│ allowlist│   /v1/billing/*     PromptPay via Opn     │──▶ api.omise.co
 │                lensiq-fortune-hook.js     │           │   /admin/api/*      back office           │
 │ admin.html  (back office shell, noindex) │           │   cron 03:17 UTC    aggregate + purge     │
 │ pricing.html (draft, hidden)             │           │ D1 (SQLite)  backend/migrations/*.sql     │
 └──────────────────────────────────────────┘           └───────────────────────────────────────────┘
 server.py (LAN, Flask) keeps serving /api/fortune, /api/agg … for on-premise installs; unchanged.
```

| Module | File | What |
|---|---|---|
| Entry | `backend/src/worker.js` | wrangler `main`: exports ONLY the default handler (workerd refuses non-handler named exports of the main module) |
| Router | `backend/src/index.js` | public + admin routes, security headers, CORS, error mapping, `scheduled()` |
| Go-live gate | `backend/src/golive.js` | refuses billing / live keys / new Google sign-ins while seller, legal or owner TOTP are not ready |
| Leads | `backend/src/leads.js` | `POST /v1/leads` B2B demo requests (Turnstile), admin inbox |
| Alerts / health | `backend/src/alerts.js`, `health.js` | optional push of owner alerts (`ALERT_WEBHOOK_URL`); `GET /health/deep` |
| Auth | `backend/src/auth.js` | single owner: bootstrap → PBKDF2 password → optional TOTP; sessions, CSRF, lockout |
| Crypto | `backend/src/crypto.js` | WebCrypto PBKDF2-SHA256 (100 000 it. = Workers maximum), TOTP RFC 6238, AES-GCM envelope |
| Store | `backend/src/store.js` | daily salts, day-salted caller hashes, fixed-window rate limits, audit log, settings |
| Analytics | `backend/src/analytics.js` | strict event allowlist, ingest, daily aggregation, dashboard, CSV |
| Retention | `backend/src/retention.js` | cron: aggregate first, then purge (table in §6) |
| AI | `backend/src/fortune.js`, `settings.js`, `fortune-prompt.js` | port of `server.py` `/api/fortune`; admin AI settings; API key storage |
| AI gateway (round 17) | `backend/src/ai/` (provider code only in `ai/adapters/`) | `POST /v1/ai/:feature`, `GET /v1/ai/providers`, budget, fallback chain, admin `/admin/api/ai/gateway`, `/admin/api/ai/usage`; fortune calls the model through it — see `docs/AI-GATEWAY.md` |
| Billing | `backend/src/billing.js`, `billing-admin.js`, `receipt.js`, `opn.js` | plans/entitlements, FREE_MODE, PromptPay charge, polling, webhook, atomic fulfilment + repair, refunds, receipts / tax invoices / credit notes |
| Members | `backend/src/members.js`, `google.js` | Sign in with Google (ID token verified with WebCrypto RS256 + JWKS), member sessions, tiers/quotas, ledger, saved readings, export/erasure, admin Members tab |

### Security design (summary)

* **Admin auth** — one owner account (`admin_users.id = 1`). First run: `POST /admin/api/bootstrap` with the Worker
  secret `ADMIN_BOOTSTRAP_TOKEN` (≥ 32 chars, constant-time compare, 5 tries/h). Password ≥ 12 chars, PBKDF2-SHA256
  100 000 iterations + 16-byte salt (Argon2 is not available in WebCrypto; Workers cap PBKDF2 at 100 000 — the gap is
  covered by rate limits, the progressive delay and TOTP). Optional TOTP (secret AES-GCM-encrypted with `SECRETS_KEK`,
  ±30 s window); the used time step is claimed with one conditional `UPDATE … WHERE totp_last_step < ?`, so a code
  cannot be used twice even by parallel requests. **Re-authentication:** TOTP setup needs the password; password change
  and TOTP disable need the password **and** a fresh TOTP code when TOTP is on.
* **Serve the admin from its own origin (recommended).** `npm run build:admin` (also `predev`/`predeploy`) copies the
  admin shell into `backend/admin-dist/`, served by the Worker through the Static Assets binding `ASSETS`
  (`run_worker_first`). Add a custom domain such as `admin.<domain>` to the Worker (Workers → Settings → Domains &
  Routes). The Worker adds real HTTP headers a `<meta>` cannot carry: `Content-Security-Policy: … frame-ancestors 'none'`,
  `X-Frame-Options: DENY`, `no-store`, `no-referrer`, COOP. The page and the API are then the **same origin**, so the
  cookie session works and nothing needs CORS. The copy of admin.html on GitHub Pages remains a fallback (bearer mode,
  framing protection there is only what the Pages host sends).
* **Sessions** — 256-bit random token; only its SHA-256 is stored. 30 min idle / 12 h absolute. Two modes:
  * *cookie* — `__Host-lq_admin`, `HttpOnly; Secure; SameSite=Strict; Path=/`, used when admin.html is served from the
    API's own origin. Unsafe requests need `X-CSRF-Token` (synchronizer token, hashed per session, rotated by
    `GET /admin/api/me`) **and** an allowed `Origin`. admin.js picks cookie mode only when `origin(API) === location.origin`
    (no guessing of "same site" from domain labels, which fails for public suffixes such as `co.th`).
  * *bearer* — any other origin: the token is returned once and kept **in memory only** (reload = sign in again).
* **Brute force without lockout DoS** —
  * per caller (day-salted IP hash): 10 attempts and 5 failures per 15 min → 429 for that caller only;
  * global: 100 attempts per 15 min from callers without a trusted device → 429;
  * account: only failures whose **username matched** count; the counter is incremented atomically
    (`UPDATE … RETURNING`), **decays** (a failure > 1 h after the previous one restarts it) and causes a **progressive
    delay** from the 10th failure (30 s, doubling every 5 failures, max 15 min) — never a hard lock;
  * **trusted device:** a successful login issues a device token (`__Host-lq_dev` cookie + `device` in the JSON, kept in
    the browser's localStorage and sent as `X-LQ-Device`; only its hash is stored, 90 days, all revoked on password
    change). A trusted device skips the global limit and the account delay, so an attacker cannot keep the owner out; it
    never replaces the password or TOTP.
* **Audit log** — bootstrap, logins (ok/failed/delayed, with "owner"/"other" username and the failure count), logout,
  password/TOTP changes, AI settings/key changes (never the key), billing settings, test charges, payments, CSV exports,
  retention runs. Secret-looking fields are redacted.
* **Origin allowlist** — `ALLOWED_ORIGINS` (public API). Admin API: the Worker's own origin plus `ADMIN_ORIGINS` —
  **no fallback** to `ALLOWED_ORIGINS` (the public site never gets admin access). `null` origin always refused; unsafe
  requests must carry an allowed `Origin`. `GET /admin/api/state` returns only `{bootstrapped}`.
* **Responses** — `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, `CSP: default-src 'none';
  frame-ancestors 'none'; sandbox`, HSTS (API); admin shell headers as above.
* **Logs** — `log()` drops any field named like key/secret/token/password/facts/body/ip/email; fortune facts and event
  payloads are never logged.

### AI writing assistant (`/api/fortune`)

Same contract as `server.py`, so `fortune-ai.js` needs **no change**: it already calls `LENSIQ_API_BASE + "/api/fortune"`.

* **Not an open LLM proxy.** The model's reply goes through the **same grounding gate and safety filter as the browser**
  — the Worker imports `fortune-ai.js` itself (`safety.groundAI`, `safety.filterText`, `compose`; one module, so no
  drift; a test asserts it is the same instance). Every sentence must restate a curated meaning of the facts or the
  local composer's own wording; ungrounded/unsafe sentences are dropped and a mostly-ungrounded reply is refused
  (502 + `fallback`). Prompt-injected or arbitrary output therefore never reaches the caller.
* **Inputs:** consent (`consent: true`) required · strict key allowlist with the same per-field clips as
  `fortune-ai.js compactFacts` (label 160, evidence/headline/extras 200, meaning 300, tag 24 chars; no `<>`/backticks/
  control chars) · ≤ 60 items · request facts ≤ 20 KB (what the browser sends) then **compacted server-side to ≤ 6 KB**
  for the model (strongest items first) · `extras` keys `luckyColors, energyWords, directions, tips` (same names as
  the client; `luckyNumbers` is never accepted).
* **Output size / cost:** `max_tokens` hard-capped at **2048** (admin range 512–2048), effort default **`low`** so adaptive
  thinking stays short. If a reading is cut off (`stop_reason: max_tokens`) the page falls back to the local composer —
  watch the `fortune.error kind=parse` log rate after go-live and lower the target length if needed.
* **Cloudflare Turnstile — fail closed** (`backend/src/turnstile.js`). With the AI writing assistant enabled, every
  `/api/fortune` call is refused (`503`, `code: "turnstile_not_configured"`, `fallback: true`) and
  `/api/fortune/status` reports `enabled: false` until **both** `TURNSTILE_SECRET` (`wrangler secret put
  TURNSTILE_SECRET`) and `TURNSTILE_HOSTNAMES` (var, comma-separated) are set. The admin AI and Billing tabs show a
  warning while it is missing. The siteverify response must have `success: true`, the expected `action`
  (`fortune` / `checkout`) and a `hostname` listed in `TURNSTILE_HOSTNAMES`. Site key: `window.LENSIQ_TURNSTILE_SITEKEY`
  in `lensiq-config.js`, then `node tools/csp-meta.mjs` (adds `https://challenges.cloudflare.com` to
  `script-src`/`frame-src`/`connect-src` only when a site key is set). Tokens come from `LQApi.turnstile(action)`
  (lensiq-api.js); the fortune hook adds `X-Turnstile-Token` to the `/api/fortune` POST only, pricing.js to checkout.
  **Local development:** `TURNSTILE_DISABLED_FOR_LOCAL_DEV=true` (e.g. in `.dev.vars`) skips verification **only** for
  requests whose `Origin` is `http(s)://localhost`, `127.0.0.1` or `[::1]`; any other origin is still refused.
* **Limits (admin-configurable):** per caller per minute (10) and per day (20), all callers per minute (60) and per day
  (500), plan quota (counted always, enforced only when `FREE_MODE=false`), per-domain on/off, Origin allowlist.
* Every failure returns `fallback: true` so the page uses its local composer.

Calls Claude via the official SDK `@anthropic-ai/sdk` (`client.beta.messages.create`) with model `claude-opus-5-5`
(admin-configurable), `output_config: {effort, format: json_schema}`, prompt caching on the system prompt, and the
server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`). Errors are mapped by
typed SDK classes (`RateLimitError` → 429, `APIConnectionError` → 504, `APIError` → 502). **Temperature** is stored in
the settings for reference but never sent: Claude Opus 5.5 (and every model from API version 2026-10-21, which the SDK
sends) rejects `temperature`/`top_p`/`top_k`; use **effort** to trade depth for cost.

To regenerate the prompt after editing `server.py`:

```sh
node -e 'const s=require("fs").readFileSync("server.py","utf8");const m=/FORTUNE_SYSTEM = """([\s\S]*?)"""/.exec(s);require("fs").writeFileSync("backend/src/fortune-prompt.js","// backend/src/fortune-prompt.js — GENERATED from server.py FORTUNE_SYSTEM (same server-side prompt rules).\n// Keep in sync: tests/unit/backend-fortune.test.js fails when the two differ.\nexport const FORTUNE_SYSTEM = "+JSON.stringify(m[1])+";\n")'
```

**API key** — preferred: `wrangler secret put ANTHROPIC_API_KEY` (never touches a browser). Alternative: the admin AI
tab stores it AES-GCM-encrypted with the KEK Worker secret `SECRETS_KEK` (AAD-bound to its slot; a rotated KEK makes it
unreadable → AI fails closed). The key is never returned to the browser (not even the last 4 characters), never logged,
never in the audit log.

### Analytics

See `lensiq-analytics.js` header and §6. Opt-in banner (equal-prominence Accept / Decline), Do-Not-Track and Global
Privacy Control respected in the browser **and** on the Worker, batching (10 s / 20 events), `sendBeacon` with
`text/plain` (no preflight). Events: `page_view, feature_used, reading_domain, studio_render_done, error, session_end`.

* **Validation:** every field is an enum or a slug; `sid` must be exactly 32 hex (128-bit random per tab). The whole
  batch is rejected on any unknown or PII-looking key/value: `@`, **6 or more digits anywhere** (separators such as
  `-` `.` `_` are ignored, so `081-234-5678` and `1.2345.67890.12.3` are caught), URLs, e-mail-like slugs
  (`_gmail.com`, `-hotmail`, `.co.th` endings …), whitespace / non-ASCII free text.
* **Server allowlists, enforced** (`backend/src/constants.js`): `ANALYTICS_PAGES` (every public page — a test fails when
  a page is missing), `ANALYTICS_FEATURES` (extendable with the `ANALYTICS_FEATURES` var) and `ANALYTICS_ERRORS`. A
  value that is not listed **rejects the batch** (`"somchai-jaidee"` is never stored). `lensiq-analytics.js` carries the
  same lists (a drift test compares them) and sends anything unlisted as `"other"`. To add a feature: add it to both
  lists (or the var) before the page sends it.
* **sid:** exactly 32 hex with no run of 6+ digits (the client avoids such runs); the Worker stores only a day-salted
  HMAC of it, so a crafted sid cannot carry data into the database.
* **Consent is claimed by the client.** The Worker cannot verify that a person clicked "Accept"; it requires
  `consent: true` plus the consent-text version `cv` (currently `a1`, `CONSENT_VERSIONS`), refuses unknown versions and
  **stores `cv` with every event**, so the data can be tied to the text that was shown. When the banner text changes,
  bump `CONSENT_VERSION` in `lensiq-analytics.js` and add the new value to `CONSENT_VERSIONS` — stored choices for the
  old text are then treated as undecided and the banner is shown again.
* No IP or user agent is stored: a day-salted HMAC of (IP, UA) gives same-day unique visitors; the salt is deleted the
  next day. Retention is approximated from a coarse "days since last visit" bucket the consenting browser computes.

Hooks for page teams (no edits needed in shared files):
`LQAnalytics.feature("studio.render", "start"|"complete")`, `LQAnalytics.renderDone()`, `LQAnalytics.domain("palm")`,
or `document.dispatchEvent(new CustomEvent("lensiq:track", {detail: {n: "feature_used", feature: "x", step: "start"}}))`.
All are no-ops without API/consent. The fortune pages get `lensiq-fortune-hook.js` (wraps `FortuneAI.interpret`
transparently to record the domain + start/complete).

### Billing (scaffold — see docs/BILLING-PLAN.md)

Tables `plans, entitlements, customers, subscriptions, payments, webhooks, counters` (+ `credits, alerts`, migration
`0006_consumer_pricing.sql`: owner-decided consumer prices, one-time purchases, refunds, idempotency, alerts). `checkEntitlement()` is the
single server-side gate; with `FREE_MODE=true` it always allows but still counts usage (so we learn real demand).

* **Checkout** (`BILLING_ENABLED=true` **and** `FREE_MODE=false` only): **a signed-in member is required**
  (`401 member_required`; round 10 — a purchase always raises the quota of the account that bought it). Then
  `Idempotency-Key` replay check, Turnstile (fail closed, action `checkout`; `503 turnstile_not_configured` without
  it), 5 per caller per hour **and a global cap of 30 per hour** (`CHECKOUT_GLOBAL_HOUR` var): PromptPay charge
  (`POST /charges`, `source[type]=promptpay`), QR proxied through the Worker as SVG (page CSP allows `img-src blob:`
  only), status polling (`GET /charges/:id`). Only plans with `status='active'` can be bought (draft / retired → `400
  plan_unavailable`). **Legacy guest checkout** only with the opt-in var `ALLOW_GUEST_CHECKOUT=true` (and membership
  not required): the response then includes `customer_id` and a secret `order_token` shown once (only its hash is
  stored); the buyer links the purchase to an account with `POST /v1/billing/claim`.
* **One-time purchases** (`plans.kind='one_time'`, e.g. `report_annual`): on success the plan's `period='once'`
  entitlements become **credits** (`credits` table, 365 days) instead of a subscription. `checkEntitlement()` and the
  member AI quota use the period quota first, then a credit.
* **Mismatch is final.** If the provider's amount / currency differs from the payment, the payment becomes
  `status='mismatch'` (`mismatch_detail` JSON), nothing is activated, the webhook is marked processed and answered
  `200 {result:"mismatch"}` (no endless 503 retries), an audit row `payment.mismatch` and an admin alert
  (`alerts`, `GET /admin/api/alerts`) are written; the reconcile cron skips it (it only reads `pending`).
* **Refunds** are manual bank transfers (Opn cannot refund PromptPay): admin `POST
  /admin/api/billing/payments/:id/refund` (re-auth) sets `status='refunded'`, records the reference / amount, cancels
  the subscription and zeroes the payment's credits (both optional), writes a `refund` ledger row for the member.
* **Webhook** `POST /v1/billing/webhook/opn` verified with `Omise-Signature` (hex HMAC-SHA256 over
  `<Omise-Signature-Timestamp>.<raw body>`, base64-decoded secret, comma-separated signatures during rotation, 5-minute
  tolerance); the charge is then **re-fetched from the Opn API** (the payload is never trusted). An event is a
  duplicate only once it was **processed**: if the Opn API fails (e.g. 503) the Worker answers 503, the row stays
  unprocessed and Opn's retry is handled normally.
* **Reconcile cron** (`*/15 * * * *`): pending payments from the last 3 days are re-checked with Opn (lost webhooks).
* **Receipts:** success is claimed and numbered in **one transaction** (`UPDATE … WHERE status='pending'`, counter
  incremented only when that update changed a row, number written in the same batch) — gap-free and assigned once even
  when webhook, poll and cron race. Numbers `LQ-YYYYMM-000001` (Bangkok month); VAT 7 % (inclusive) only when
  `VAT_REGISTERED=true`; buyer/seller tax-invoice fields stored per payment. Live keys are refused unless
  `OPN_ALLOW_LIVE=true`. **Printable receipt / tax invoice** (`backend/src/receipt.js`): `GET
  /api/me/payments/:id/receipt` (the payer) and `GET /admin/api/billing/payments/:id/receipt` return self-contained
  HTML (Thai, with EN / ZH labels, no script, CSP `default-src 'none'`), or JSON with `?format=json`. Title
  "ใบเสร็จรับเงิน / ใบกำกับภาษี" only for a VAT payment with a seller tax ID; VAT lines only when the payment carried VAT;
  stamped **ฉบับร่าง / DRAFT** while seller name, tax ID or address is missing (stored fields, falling back to the
  current `SELLER_*` vars); refunded payments carry a "คืนเงินแล้ว" stamp; test-mode payments a "TEST MODE" stamp.
* **Perks registry** (`constants.js PERKS`, served as `perks` by `GET /v1/billing/plans`; each plan entitlement also
  carries `status`): `active` = enforced by the server (`ai_reading`, `report_*`, `csv_export` via the server check
  `POST /api/me/entitlements/use`); `coming_soon` = listed but not delivered (`analytics_days`, `hub_nodes`) — the
  pricing page must label these "เร็ว ๆ นี้" and not sell them.

#### Round-10 API for the pricing / account / admin UI

All amounts are integers in satang (÷ 100 = THB, VAT-inclusive when `vat_registered`). Member calls send
`Authorization: Bearer <member token>`; admin calls are the usual admin session (+ `X-CSRF-Token` with cookies).

| Call | Request | Response / notes |
|---|---|---|
| `GET /v1/billing/plans` | — | `{free_mode, billing_enabled, pricing_enabled, vat_registered, member_required_for_checkout, perks:{feature:{status, enforcement, unit, th, en, zh}}, plans?:[{id, name_th, name_en, name_zh, kind:"subscription"\|"one_time", audience:"consumer"\|"business", price_month_satang, price_year_satang, price_once_satang, status, purchasable, sort, entitlements:{feature:{quota, period, status}}}]}` — `plans` only when the pricing page is enabled. Show a plan's Buy button only when `purchasable`; label entitlements whose `status` is `coming_soon` |
| `POST /v1/billing/checkout` | headers `Authorization` (member), `X-Turnstile-Token`, optional `Idempotency-Key` (8–64 `[A-Za-z0-9_-]`; reuse it when retrying the same purchase); body `{plan_id, period:"month"\|"year" (ignored for one-time), accept_terms:true, buyer?:{name, email, tax_id (13 digits), address, branch}}` | `201 {payment_id, plan_id, period:"month"\|"year"\|"once", amount_satang, vat_satang, expires_at, qr_path, status_path, test_mode, customer_id, linked_to_account:true}`; a replay with the same key → `200 {…, status, idempotent_replay:true}`; `401 member_required`, `400 plan_unavailable`, `422 idempotency_mismatch`, `403/503` Turnstile, `429` |
| `GET /v1/billing/payments/:id` | — | `{status: pending\|successful\|failed\|expired\|mismatch\|refunded, plan_id, period, amount_satang, vat_satang, receipt_no, doc_type, expires_at, paid_at}`. `mismatch` = final ("we are checking your payment — contact support") |
| `POST /v1/billing/claim` | member bearer; `{customer_id, order_token}` (from a legacy guest checkout) | `200 {ok, linked:{subscriptions, payments, credits}, plan:{id, current_period_end}\|null, credits:{feature:n}}`; `403 claim_invalid`, `409 claim_taken`, `400 claim_invalid` (format), `429` |
| `GET /api/me` | member | adds `paying` (bool), `credits:{feature:n}`, `plan.{source:"purchase"\|"comp", subscription_id, name_zh}`, `quotas.ai.{credits, timezone:"Asia/Bangkok"}`; `readings_today` counts from 00:00 Bangkok |
| `GET /api/me/history` | member | `payments[]` gain `refund_satang, refunded_at, receipt_path` (null until a receipt exists); `ledger[].kind` ∈ signup, reading, ai, payment, **refund**, **grant**, **claim**, **credit** |
| `GET /api/me/payments/:id/receipt[?format=json]` | member (own payment, status successful / refunded) | `text/html` printable receipt (open the fetched HTML in a new window / blob URL — the bearer token cannot ride on a plain link) or JSON `{receipt_no, doc_type, draft, missing_seller_fields, title_th/en/zh, date:{th, iso}, seller, buyer, item, vat\|null, total_satang, refund\|null, livemode}`; 404 otherwise |
| `GET /api/me/entitlements` | member | `{plan, free_mode, timezone, perks:{feature:{status, enforcement, quota, period, used, remaining, credits, allowed}}}` (nothing consumed) |
| `GET /api/me/sessions` | member | `{sessions:[{id (16 hex, opaque — first 16 hex of the stored token hash, never the token), created_at, last_seen_at, expires_at, label ("Chrome · Android"; coarse browser · OS derived at sign-in, raw User-Agent never stored — migration 0007), current}]}` — active sessions only (not expired, not idle > 14 days), newest first |
| `POST /api/me/sessions/revoke` | member; `{id}` or `{all:true, keep_current:true}` ("sign out everywhere"; `keep_current:false` also signs out this device) | `200 {ok, revoked, current_revoked}`; `404` unknown id (scoped to the caller), `400` bad body; audit `member.sessions.revoked`. After `current_revoked:true` drop the stored token |
| `POST /api/me/entitlements/use` | member; `{feature}` ∈ `csv_export`, `report_basic`, `report_compat`, `report_annual` | counts one use / takes one credit: `200 {feature, allowed, via:"quota"\|"credit"\|null, plan, quota, used, remaining, credits, period, free_mode}` (`allowed:false` = not included — show the upgrade card); `400 unknown_feature` for coming-soon / unknown perks |

Admin (re-auth = body also carries `{password, totp}`; `403` when wrong, audited as `reauth.failed`):

| Call | Body | Notes |
|---|---|---|
| `GET /admin/api/billing` | — | adds `open_alerts`, `guest_checkout`, plans with `kind, audience, price_once_satang, name_zh, purchasable`, entitlement `status` |
| `GET /admin/api/billing/payments?status=` | status ∈ pending, successful, failed, expired, mismatch, refunded | rows add `mismatch_detail, refund_satang, refund_ref, refunded_at, user_id, subscription_id`; totals add `live_refunds_satang, mismatches` |
| `GET /admin/api/billing/payments/:id` | — | `{payment, subscription, credits, receipt_path}` |
| `GET /admin/api/billing/payments/:id/receipt[?format=json]` | — | same document as the member's |
| `POST /admin/api/billing/payments/:id/refund` | **re-auth** + `{reference (required, ≤ 80), amount_satang? (default full), note?, cancel_subscription? = true, revoke_credits? = true}` | successful / mismatch payments only (`409 not_refundable`); audit `billing.refund` |
| `GET /admin/api/billing/subscriptions?user_id=&status=` | — | subscriptions with the member e-mail |
| `POST /admin/api/billing/subscriptions/:id/cancel` | **re-auth** + `{reason?}` | audit `billing.subscription.cancel` |
| `POST /admin/api/billing/subscriptions/:id/extend` | **re-auth** + `{days: 1–3650, reason?}` | from max(now, end); re-activates; audit |
| `POST /admin/api/members/:id/grant` | **re-auth** + `{plan_id, days, reason?}` (complimentary subscription, `source:"comp"`) or `{feature, credits: 1–1000, days? = 365}` | `201`; ledger `grant`; audit `billing.grant` |
| `GET /admin/api/members/:id` | — | `{user, subscriptions, payments, credits, ledger}` |
| `POST /admin/api/members/:id/status` | **re-auth** + `{status}` | (round 10: re-auth now required) |
| `PUT /admin/api/billing/plans/:id` | any of `{name_th, name_en, name_zh, price_month_satang, price_year_satang, price_once_satang (null or 0 / 2000–15,000,000), status: draft\|active\|retired, sort, notes, kind, audience, entitlements:{feature:{quota:null\|int, period:"day"\|"month" (subscriptions) \| "once" (one-time)} \| null}}` | features must be in `perks`; an active plan needs a price for its kind; the free plan stays active at 0; audit `billing.plan.updated` with old → new prices |
| `POST /admin/api/billing/plans` | same + `id` (`[a-z][a-z0-9_]{1,31}`) | `201`; audit `billing.plan.created` |
| `GET /admin/api/alerts[?all=1]`, `POST /admin/api/alerts/:id/ack` | — | `{alerts:[{id, ts, kind:"payment_mismatch", ref, detail, acknowledged_at}], open}` |
| `GET /admin/api/devices`, `DELETE /admin/api/devices/:id`, `DELETE /admin/api/devices` | — | trusted login devices `{id (16 hex), created_at, last_used, expires_at, current}`; revoke one / all |
| `POST /admin/api/retention/run` | **re-auth** | (round 10: re-auth now required) |
| `PUT /admin/api/ai` | adds `paid_per_user_daily` (1–1000, default 100), `paid_daily_max` (1–100000, default 2000) | separate AI buckets for paying members |

### Round 11 — money safety, re-auth, refunds, erasure, go-live gate

* **Atomic, self-healing fulfilment.** A successful charge is claimed (`status 'pending' -> 'successful'` with a random
  `fulfil_token`), numbered (receipt counter, `changes() = 1`) **and fulfilled** (subscription insert / extension or
  credit rows, each `… WHERE EXISTS (payment with that token)`, then `fulfilled_at`) in **one** `db.batch`. Any failing
  statement rolls the whole success back: the payment stays `pending`, the webhook answers 503 (Opn retries), the
  reconcile cron re-applies it, and an alert `fulfilment_failed` is raised. A payment that is `successful` with
  `fulfilled_at IS NULL` (from before migration 0008, or any future path) is repaired by the webhook retry, the payment
  poll and the cron (`repairFulfilment`, alert `fulfilment_repaired`), never twice (the repair claim only succeeds while
  `fulfilled_at IS NULL`). Migration 0008 marks existing payments with evidence of fulfilment (subscription id /
  credits) as fulfilled. Regression tests inject a D1 failure into the grant statements
  (`tests/unit/backend-fulfilment-refunds.test.js`). `GET /admin/api/billing/payments` reports `unfulfilled`.
* **Alerts** are stored (`alerts`), logged as `alert.<kind>` (make a Workers Logs alert on that event) and, when the
  secret `ALERT_WEBHOOK_URL` (https incoming webhook: Slack / Discord / Google Chat / ntfy …) is set, pushed with the
  kind and a reference only — no personal data. Kinds: `payment_mismatch`, `fulfilment_failed`, `fulfilment_repaired`,
  `lead_new`; round 12: `late_payment_fulfilled`, `charge_stuck_pending`, `test_charge_cap`.
* **Admin re-auth is rate limited** per session: 5 wrong answers per 15 min -> 429 `reauth_rate_limited`; 10 wrong in
  one session -> the session is revoked (401 `reauth_revoked`). Applies to every re-auth (money ops, retention/run,
  member status, password change, TOTP setup / disable); every failure is audited (`reauth.failed`).
* **Re-auth for config edits**: `POST|PUT /billing/plans…`, `PUT /billing/settings`, `PUT /membership`,
  `PUT|DELETE /ai/key` need `{password, totp}` in the body or the 5-min **sudo window** opened by
  `POST /admin/api/reauth {password, totp}` (403 `reauth_required` otherwise; admin.js asks for the password and
  retries). Password / TOTP are stripped before the strict validators see the body.
* **Owner TOTP is mandatory for money ops** (refund, grant, cancel, extend) while billing or live keys are on
  (`REQUIRE_OWNER_TOTP=true` makes it always): 403 `owner_totp_required`.
* **Refunds** (`POST /admin/api/billing/payments/:id/refund {reference, amount_satang?, note?, cancel_subscription?,
  revoke_credits?}`): several partial refunds up to the amount paid; status `partially_refunded` until the total is
  refunded, then `refunded`. Only what **this** payment bought is taken back, pro rata: its credits
  (`floor(granted × refund / amount)`, the rest on the completing refund) and the subscription time it added
  (`payments.ext_seconds`; a renewal refund removes only that renewal's days). The subscription is cancelled only when
  no paid time is left (`cancel_subscription: true` = cancel it all, `false` = leave it). Each refund is a row in
  `refunds`; for a VAT tax invoice it gets a gap-free credit-note number `CN-YYYYMM-000001` and a printable
  **ใบลดหนี้** (TH/EN/ZH): `GET /admin/api/billing/payments/:id/refunds/:n/credit-note[?format=json]` and the member's
  `GET /api/me/payments/:id/refunds/:n/credit-note`. All of it commits in one transaction.
* **Age of majority at checkout**: `age_confirm: "adult" | "guardian" | true` is required (400
  `age_confirmation_required`); an optional `birth_year` that shows the buyer may be under 20 needs `"guardian"`
  (403 `guardian_consent_required`). Stored as `payments.age_confirm`; nothing else about age is kept.
* **Renewal reminder data**: `GET /api/me` returns `renewal_due` and `renewal {plan_id, period, current_period_end,
  days_left, renew_path}` when the paid period ends within 7 days (PromptPay does not renew by itself; the account page
  / nav show the banner). Round 12: plus an e-mail reminder 3 days before the end once a mail provider is configured.
* **Erasure / export need a fresh Google confirmation**: `DELETE /api/me` and the export need a NEW Google ID token
  (fresh nonce, same `sub`, `auth_time` — or `iat` when Google omits it — within 5 min), inline
  (`{confirm:"DELETE", credential, nonce}`, `POST /api/me/export {credential, nonce}`) or via
  `POST /api/auth/reauth {credential, nonce}` which opens a 5-min window (401 `reauth_required` / `reauth_stale`,
  403 `reauth_wrong_account`). A stolen bearer token alone can no longer erase or export an account.
* **Quota tombstone across erasure**: on `DELETE /api/me` today's used counters are kept under
  `x:` + HMAC(daily salt, `quota-tomb|` + Google sub) and seed a re-created account of the same Google account the
  same Bangkok day (so delete + re-join does not reset limits). The tombstone is purged the next day and the salt is
  deleted, so it links to nobody.
* **Go-live gate** (`golive.js`): with `GO_LIVE_GATE=enforce` (wrangler.toml) checkout and NEW Google sign-ins answer
  503 `go_live_blocked` while `SELLER_NAME/TAX_ID/ADDRESS` are empty, `LEGAL_TERMS_READY` / `LEGAL_PRIVACY_READY` are not
  `true`, `ALLOWED_ORIGINS` contains localhost while `TURNSTILE_DISABLED_FOR_LOCAL_DEV=true`, or (billing / live keys on)
  the owner has no TOTP. A live Opn charge is **always** refused while any of these is open. `GO_LIVE_GATE=report`
  (default when the var is missing: tests, `wrangler dev`, staging test-mode runs) only reports. The signed-in owner sees
  it in `GET /admin/api/state` (`go_live`), `GET /admin/api/go-live` and `GET /admin/api/billing`. The site-side twin
  is `tools/check-legal.mjs`.
* **B2B leads**: `POST /v1/leads {name, org?, email?, phone?, interest, plan?, message?, source?, lang?, consent: true}`
  with `X-Turnstile-Token` (action `lead`, fail closed), 5 per caller per hour, `LEADS_GLOBAL_DAY` per day; stored in
  `leads` without IP / user agent, purged after `LEADS_DAYS` (180). Admin: `GET /admin/api/leads?status=new|acked|all`,
  `POST /admin/api/leads/:id/ack`, `DELETE /admin/api/leads/:id`. Front end: `lensiq-leads.js`.
* **Reconcile**: `RECONCILE_BATCH` (25) per run for both the repair pass and pending re-checks; least-recently-checked
  first (`updated_at` is touched on every check) so a backlog rotates instead of starving.
* **`GET /health/deep`**: D1 reachable + migrations current (wrangler's `d1_migrations` table, or a schema probe);
  503 otherwise; protect with the `HEALTH_TOKEN` secret if wanted.
* **`scheduled()`** catches every job failure and logs `cron.failed` with the error name only (never the message).
* **Perk consumers**: `PERKS[*].consumer` names the page that delivers a perk; a unit test fails when an active perk sold
  as credits (`report_*`) has no page that redeems it through `POST /api/me/entitlements/use` (today: `report.js`).
* **Real runtime**: `npm run test:integration` runs the bundled Worker in **workerd** (Miniflare from
  `backend/node_modules`) with a real local D1, the real migrations and a faked Opn / Google / Turnstile: health,
  sign-in, checkout + idempotent replay, three racing signed webhooks (one receipt number, one subscription), receipt,
  TOTP + sudo window, two partial refunds with credit-note numbers. It found that the old entry module exported
  non-handler constants, which workerd refuses at start-up (`Incorrect type for map entry 'RECONCILE_CRON'`) — fixed with
  `src/worker.js`. CI runs it after the wrangler dry-run.

### Round 12 — fulfilment race, expiry sweep, admin money gates, IPv6 keys, short tokens, e-mail, CSP reports

* **Duplicate-subscription race fixed.** `fulfilStatements` reads the current subscription outside the transaction, so
  two FIRST purchases of the same plan by the same buyer confirmed at the same moment both used to INSERT a subscription
  (and `activeSub` only shows the one that ends last: one paid period lost). Now, inside the batch, the INSERT only runs
  while there is still no active subscription of that buyer (customer or member) for that plan; otherwise the next
  statement extends the one that won by this payment's length, and `payments.subscription_id` points at it. Tests:
  the old race reproduced deterministically (both statement lists built before either batch runs) in
  `tests/unit/backend-hardening.test.js`, and two concurrent signed webhooks in workerd (`tests/integration/`).
* **Expiry sweep** (`expirySweep`, part of the 15-min reconcile cron): every `pending` payment whose QR `expires_at` is
  more than `EXPIRY_GRACE` (1 h) in the past — whatever its age, so the 3-day re-check window no longer leaves rows
  pending for ever — gets one final `retrieveCharge`: success is fulfilled normally, Opn `failed` / `expired` applied;
  if Opn still says `pending` (or there is no charge id) the row becomes `expired` with `failure_code = 'expired_local'`.
  Such a row stays open for a **late success** (webhook, poll, cron → fulfilled, audit `payment.late_success`, alert
  `late_payment_fulfilled`). A charge older than 24 h that Opn still reports `pending` raises one
  `charge_stuck_pending` alert per payment. A failing Opn call never closes anything (`sweep_errors`). The cron log line
  carries `expired_local`, `late_success`, `stuck_alerts`, `sweep_errors`.
* **Admin test charge** (`POST /admin/api/billing/test-charge`) now needs re-auth like the other money ops, is capped
  at `TEST_CHARGE_HOUR` (10) per hour for the whole admin (429 `test_charge_cap`, alert `test_charge_cap` once per
  window) and every attempt — including refused ones — is audited (`billing.test_charge`, `billing.test_charge.refused`).
* **Money re-auth mode** (corrects the round-11 header comment in `auth.js`, which said money ops always needed the
  password in the body — they accepted the sudo window too). `auth.moneyReauthMode(env)`: `window` (default with test
  keys) = body `{password, totp}` or the 5-min sudo window; `inline` (`MONEY_REAUTH=inline`, and automatically once
  `OPN_ALLOW_LIVE=true` unless `MONEY_REAUTH=window`) = the password (+ TOTP) must be in that very request — 403
  `reauth_inline_required`; admin.js asks and resends the request with the credentials. Both paths are kept.
* **`REQUIRE_OWNER_TOTP = "true"` in `backend/wrangler.toml`** (production): grants / refunds / test charges need the
  owner's TOTP from day one. Without the var (tests, `wrangler dev`) the old rule applies (only while billing / live
  keys are on).
* **IPv6 callers are keyed on their /64** (`util.js ipv6Prefix64` / `callerIp`, used by `store.js callerHash`): every
  per-caller limit (sign-in, checkout, claim, leads, fortune, CSP reports) and the day-salted analytics pseudonym. An
  IPv4-mapped address counts as its IPv4. Turnstile `remoteip` still gets the full address.
* **Short-lived member token (optional) + refresh.** Sign-in body `session: "short"` (the page's "do not remember me"
  choice) gives a 12 h token with a 1 h idle timeout; `POST /api/auth/refresh` rotates the token (the old one dies in the
  same statement) and extends a short session by 12 h, at most 7 days after the Google sign-in (then 401
  `session_chain_ended`: sign in again). Long sessions (default, "remember me") are unchanged — 30 days / 14 days idle —
  and can rotate too (expiry kept). `GET /api/me/sessions` shows each session's `kind`. Wiring the choice into
  `lensiq-member.js` (short by default in sessionStorage, long only with an explicit "remember me") is front-end work
  and not part of this backend change.
* **Transactional e-mail** (`src/mail.js`, OFF until `MAIL_PROVIDER` = `resend` | `mailchannels`, `MAIL_FROM` and the
  secret `MAIL_API_KEY` are set; `SITE_URL` for the account link): a receipt / tax-invoice notice after a successful
  payment, a refund / credit-note notice after each refund, and a renewal reminder 3 days before a paid period ends
  (daily cron). Fixed TH/EN/ZH text + document number + amount + a link to the signed-in account page — never the
  document, tax ID, address or a sign-in link. Opt-outs `email_receipts` / `email_reminders`
  (`POST /api/me/preferences`) stop the e-mail only; documents and the banner stay in the account. Delivery log
  `mail_log` (UNIQUE `(kind, ref)`: a retried webhook / cron never sends twice; no address / subject / body stored;
  member id cleared on erasure; purged after `AUDIT_DAYS`; included in the member export). Admin: `GET /admin/api/mail`
  (status without the key + log); `GET /admin/api/billing` carries `mail` and `money_reauth`. A provider failure never
  fails a payment, refund or cron run.
* **CSP report collection**: `POST /v1/csp-report` (`application/csp-report` or `application/reports+json`) stores
  only daily counters `csp_reports(day, directive, blocked origin, page path)` — no IP, user agent, query, script sample
  or source line; 60 reports per caller per hour, `CSP_REPORT_GLOBAL_DAY` (5000) per day, always 204; purged after
  `CSP_REPORT_DAYS` (90). Admin: `GET /admin/api/csp-reports?days=7`. The Worker-served admin shell now sends
  `report-uri /v1/csp-report; report-to csp` + `Reporting-Endpoints`. **The GitHub Pages site cannot report**: browsers
  ignore `report-uri` / `report-to` in a `<meta>` CSP — reports from the public pages start once the site is served
  behind a header-capable host (Cloudflare Pages / a Worker in front) that sends the CSP as a header with
  `report-uri https://<api>/v1/csp-report`.
* **Migration `0009_round12_backend.sql`**: pending-expiry index, `member_sessions.kind / signed_in_at`,
  `users.email_receipts / email_reminders`, `mail_log`, `csp_reports`. `/health/deep` lists and probes it.
* **Real runtime coverage** (`npm run test:integration`, workerd): Turnstile wrong action / hostname, webhook bad
  signature and replay outside the 5-min window (nothing stored), claim brute force (10 wrong → 429, audited), credit
  exhaustion, wrong-account Google re-auth, a disabled member's session and sign-in, IPv6 /64 sign-in limit, the
  subscription race, the expiry sweep through the real `scheduled()` handler + late success, token refresh, test-charge
  re-auth + cap, CSP counters.
* **Incident response / secrets rotation**: `docs/pdpa/INCIDENT-RESPONSE.md` (72-hour PDPC notification runbook,
  rotation steps for `SECRETS_KEK`, `TURNSTILE_SECRET`, Opn keys, `MAIL_API_KEY`, `ADMIN_BOOTSTRAP_TOKEN`).
* **Still needs outside resources**: a staging Cloudflare account + D1 and a real Opn TEST-mode charge / signed webhook /
  refund run, a real Google OAuth client, a mail provider account + sender-domain DNS, a load test and an independent
  penetration test (auth, CORS, CSRF, webhooks, IDOR on `/api/me/payments`). Read-only staff roles for the admin are not
  built yet (one owner account).

### Member sign-in (Google) and tiers (ready, OFF by default)

Owner's goal: free use gets a light version; signing up with Google (free) unlocks the full reading and keeps the
transaction history, so charging later is easy. **Nothing changes until the owner turns it on**: with no backend
(GitHub Pages today) `lensiq-member.js` is never loaded; with a backend it stays inert unless **all** of
`GOOGLE_CLIENT_ID` (Worker var), `window.LENSIQ_GOOGLE_CLIENT_ID` (lensiq-config.js) and the admin switch
**Members → membership_required** (D1 setting, default `false`) are set.

| Tier | Who | Fortune pages | AI writing assistant | Other |
|---|---|---|---|---|
| guest | not signed in | **light reading**: summary + first `guest_light_sections` (2) sections + every gentle caution from the hidden sections + the Kalama reminder + notes; the rest (and the 3-point plan) is replaced by a "sign in free with Google" card. Soft per-device counter `guest_daily_readings` (3/day, localStorage) — after that only summary + cautions + reminder | refused by the Worker (`401 member_required`, page falls back to the local composer; status reports `enabled:false`) | every on-device tool unchanged |
| member | Google sign-in, free | full reading, "save to my history", print / PDF | `member_ai_daily` (3/day), **server-enforced** | `account.html`: plan, quota, history, export, delete |
| paid | active subscription linked to `user_id` (purchased, claimed or complimentary), or purchased credits | full | plan entitlement `ai_reading` (plus 30/month, pro 100/month, business 600/month; enforced when `FREE_MODE=false`), then `ai_reading` credits; **own AI buckets** (`fortune:pd:<user>` = `paid_per_user_daily`, `fortune:daily:paid` = `paid_daily_max`) — free traffic cannot use them up | checkout always requires a member while billing is on |

Round 10 quota rules: quota days / months and `readings_today` follow **Asia/Bangkok** (UTC+7; daily rate-limit
windows start 00:00 Bangkok); a refused call is **not counted** (atomic `… WHERE n < quota`, every rate-limit bucket
counted for it is given back); when the **provider** call fails (rate limit, connection, API error) the quota use /
credit and the daily buckets are given back (a reply that arrived but failed grounding stays counted — it cost
tokens). With `FREE_MODE=false` the member tier (`member_ai_daily`) is enforced even when membership is not required,
so signing in never escapes the guest limits.

Safety and consent texts (Kalama reminder, gentle cautions, AI consent text) are **never gated**. Limits are editable
in admin → Members (D1 `settings.membership`; paid-plan AI quotas update `entitlements`).

* **Sign-in flow.** The header chip / gate card opens our own dialog (purpose, lawful basis s.24(3), no marketing
  without the separate opt-in, Cloudflare outside Thailand, links to terms/privacy; terms checkbox required, marketing
  checkbox separate and unticked). Only after "Continue with Google" is `https://accounts.google.com/gsi/client`
  loaded (no third-party request on page load — e2e-tested). `POST /api/auth/nonce` issues a one-time nonce (hash
  stored, 10 min); GIS returns an ID token; `POST /api/auth/google` (Turnstile action `signin`, fail closed; 10 per caller
  and `SIGNIN_GLOBAL_15MIN` (300) per 15 min — the global cap is counted only **after** the Turnstile check passed,
  so junk requests cannot exhaust it) consumes the nonce atomically and verifies the token itself
  (`google.js`): RS256 with WebCrypto against `https://www.googleapis.com/oauth2/v3/certs` (cached per Cache-Control
  max-age, clamped 60 s–24 h; an unknown `kid` forces one refetch, throttled to one per 30 s), `iss` ∈
  {`accounts.google.com`, `https://accounts.google.com`}, `aud == GOOGLE_CLIENT_ID` (`azp` with multi-audience), `exp`
  / `iat` with 60 s skew, `email_verified`, `nonce`. No client secret, no Google SDK, no Google API call with user data.
  A network error or empty key set while fetching the JWKS is `503 jwks_unavailable` (retry later), never a 500.
* **Session.** 256-bit random member token returned once, only its SHA-256 stored (`member_sessions`), 30 days
  absolute / 14 days idle; revoked by `POST /api/auth/logout`, account deletion, or the admin disabling the account.
  The site (github.io) and the API are different origins, so the token is kept in localStorage (try/catch) and sent as
  `Authorization: Bearer` — no third-party cookies. `lensiq-fortune-hook.js` adds it to `/api/fortune` and its status
  probe only when a member is signed in.
* **Data (migration 0005).** `users` (google_sub unique, verified e-mail, optional first name ≤ 40 chars — **no photo**,
  consent version + time, `marketing_opt_in` default 0, status), `member_ledger` (signup / reading / ai / payment rows:
  kind, domain slug, payment id, amount — never reading content), `saved_readings` (only the derived result the member
  chose to save, ≤ 16 KB, deletable), `auth_nonces`, and `user_id` on `customers`, `subscriptions`, `payments`
  (legacy order-token checkouts keep `user_id` NULL; a member's checkout reuses their customer row and gets no order
  token).
* **PDPA rights.** `GET /api/me/export` (JSON, portability), `DELETE /api/me {"confirm":"DELETE"}` (erasure): user,
  sessions, ledger, saved readings and quota counters deleted in one batch; payments/receipts are kept ≥ 5 years for
  tax but unlinked (`user_id` NULL, e-mail removed; tax-invoice buyer fields stay); credits deleted. Audit log rows
  carry the user id only, never the e-mail — and on erasure every earlier audit row's user id is rewritten to a one-way
  pseudonym (`erased:<16 hex>`), the `member.deleted` row carries only that pseudonym. See `docs/pdpa/ROPA.md` M22 and
  `docs/pdpa/DPIA.md` §13.
* **Known limits.** The guest counter is client-side (soft by design — it only shapes the free experience; AI cost is
  enforced server-side). Guests already get the light version; a determined visitor could clear storage. The AI
  status probe is cached per page load by `fortune-ai.js`, so after signing in the AI consent box appears on the next
  page load. On the very first visit the reading can render before `/v1/config` arrives; it is re-rendered (light)
  within the round-trip, later visits use the cached config.

### Stream G (owner decisions 2026-11-13): LINE Login, organisation account lite, licences, free tiers — groundwork

Built on branch `accounts-g`; migration `0018_accounts.sql` (additive; renumbered from 0017 after `0017_tryon.sql`). **Nothing changes for visitors until the owner
switches it on**: LINE Login answers `503 line_not_configured` until the three LINE settings below exist; organisation
accounts exist only when the owner creates one in the back office; free-tier limits are counted on the device and are
**not enforced** (code constant `FREE_TIER_ENFORCE = false`).

**LINE Login** (`backend/src/line.js` primitives, `backend/src/identities.js` routes; tests
`tests/unit/backend-line-signin.test.js`, `tests/e2e/accounts.e2e.mjs`):

* Settings: `LINE_LOGIN_CHANNEL_ID` and `LINE_LOGIN_CHANNEL_SECRET` (the owner sets both with `wrangler secret put`; the
  agent never sees them) and `LINE_LOGIN_REDIRECT_URI` (var): the public account page, `https`, on an `ALLOWED_ORIGINS`
  origin, registered as the channel's callback URL. Today: `https://anirut77.github.io/lensiq/account.html` (after a
  custom domain: add the new address in the LINE console and change the var). `GET /v1/config` reports
  `membership.line_enabled` (never the secret).
* Flow (OpenID Connect, authorisation code + PKCE S256, scope `openid profile` only — no e-mail permission):
  `POST /api/auth/line/start {mode}` → `{authorize_url, binding}`; the page keeps `binding` in this tab's
  sessionStorage and goes to `access.line.me`; LINE returns to `account.html?code&state`; the page posts
  `POST /api/auth/line/finish {code, state, binding}`. The Worker stores only SHA-256 of `state` and of `binding`
  (10 minutes, single use, purged daily), exchanges the code at `api.line.me/oauth2/v2.1/token` with the channel secret
  and the PKCE verifier, and verifies the ID token itself: HS256 (channel secret) or ES256 (LINE JWKS by `kid`), `iss`,
  `aud` = channel id, `exp` / `iat` (60 s skew), `nonce`, `sub` = `U` + 32 hex. LINE's access / refresh tokens are
  dropped at once; no picture is stored. The binding stops login CSRF (a planted `code/state` link lacks it).
* Modes: `signin` (Turnstile action `signin`, go-live gate `line_signin`, consent at start as for Google), `link`
  (signed-in member; must start and finish in the same account), `reauth` (`max_age=300`; opens the same 5-minute
  window as the Google re-auth, so a LINE-only account can export / delete / change org roles).
* Accounts: a LINE-only account has no e-mail (`users.email = ''`) and the placeholder `users.google_sub =
  'nogoogle:<id>'`; the LINE id lives in `user_identities`. Linking rules: one LINE account belongs to at most one
  LENSIQ account; an account has at most one Google and one LINE; nothing is ever merged (`line_already_linked`,
  `google_already_linked`); no linking by e-mail; unlinking needs a fresh confirmation and never removes the last
  method (`last_sign_in_method`). Routes: `POST /api/auth/link/google`, `GET /api/me/identities`,
  `POST /api/me/identities/unlink`. Export lists the methods (never the provider ids); erasure deletes them.
* `bot_prompt=normal` asks LINE to offer adding the linked official account (@632yliiw) as a friend on the consent
  screen; we never receive or store the friendship status.
* **Security review fixes (2026-11-14).** Linking LINE or Google needs a fresh confirmation (the 5-minute window) at the
  start and still valid at the finish; a link / reauth flow must be finished by the very session that started it; LINE
  re-auth needs a numeric `auth_time` within `max_age` (300 s); a Google re-auth token without `auth_time` is accepted only
  for a nonce issued with `POST /api/auth/nonce {"purpose":"reauth"}` (a re-auth nonce never signs anyone in) — residual:
  Google Identity Services cannot force Google to ask for the password, so a Google confirmation proves control of the
  Google account in that browser now; removing a sign-in method is one conditional write; unlinking Google also removes
  the Google e-mail; creating an organisation (which issues an owner link) needs the owner's re-auth, and an accepted owner
  link revokes the other open owner links and logs `org.owner_replaced` when it replaces an owner. Migration 0018 adds
  `auth_nonces.purpose`. In practice a Google confirmation may need only one click on an account that is already
  signed in to Google: it shows that someone can act in that browser now, not who is at the device.

**Organisation account lite** (`backend/src/orgs.js`, `backend/src/orgaudit.js`; tests `tests/unit/backend-orgs.test.js`,
`tests/e2e/admin-orgs.e2e.mjs`): organisation name, billing details (name, 13-digit tax id, address, branch, e-mail),
admins and staff (one admin is the owner), invitation links (`account.html#org_invite=<token>`, 72 h, single use,
SHA-256 stored; optional e-mail binding stored as an HMAC under a key derived from `SECRETS_KEK`), and a per-organisation
audit log (SHA-256 hash chain, people as pseudonymous refs, field names only). **No customer people data**: there is no
table or field for employees, plates, residents or candidates, and unknown request fields are refused
(`unknown_field`). The LENSIQ owner creates organisations in admin → Organisations, which also shows a one-time owner
invitation link (absolute when `SITE_URL` — the public site, may include `/lensiq` — is set), billing details, members
(names and roles only), status (suspend / close need re-auth) and the audit log. Member routes: `GET /api/me/orgs`,
`GET /api/orgs/:id`, `POST /api/orgs/:id/profile|invites|transfer`, `DELETE /api/orgs/:id/invites/:id`,
`POST /api/orgs/:id/members/:user/role`, `DELETE /api/orgs/:id/members/:user`, `GET /api/orgs/:id/audit|licences`,
`POST /api/org-invites/accept`. Role changes, removals and ownership transfer need a fresh Google / LINE confirmation.

**Licences (back-office orders, bank transfer only).** `licence_plans` seeds only Gate (`gate_trial`, `gate_lane`),
Attendance (`attendance_person`), Exam lab (`exam_lab_candidate`, `exam_lab_room`) and Crowd report (`crowd_report`),
**without a price column**: prices stay in the quotation and the approved price list. The owner records an order after
the quotation and the transfer (`POST /admin/api/orgs/:id/licences`, re-auth: plan, quantity, dates, quotation /
transfer reference, quoted amount excl. VAT, note); members see the licence status per product, never the amount.
`GET /api/orgs/:id/licences` returns `offline_until` = min(check + 14 days, licence end): a device may use a cached
status offline for 14 days (`LQFreeTier.offlineValid`). There is no signed licence token yet (it would need a signing
key — an owner secret); the honest note applies: a check on the device can be bypassed, the contract binds.

**Free tiers** (`backend/src/freetier.js` = `lensiq-freetier.js`; test `tests/unit/free-tier.test.js`): Gate 30-day trial,
1 lane, 100 plate reads per day; Attendance up to 5 people; Exam up to 5 candidates per session; Crowd 2 hours per device
per day; Fortune and the general tools unlimited. Counted on the device only (numbers and dates in localStorage
`lq-ft-*`; nothing is sent): parking / village reads, the attendance staff list, the exam dashboard's seats, Crowd running
time outside the demo. `status().allowed` is always true. Limits may start only 30 days after an announcement made at
least 30 days ahead (`announcementOk`); export always works.

## 2. Local development (no Cloudflare account needed)

```sh
cd backend
npm install                       # @anthropic-ai/sdk + wrangler (dev)
cp .dev.vars.example .dev.vars    # placeholders; git-ignored
npx wrangler d1 migrations apply lensiq --local
npx wrangler dev                  # http://localhost:8787 (local D1 + local cron trigger: curl "http://localhost:8787/__scheduled")
```

Tests run without wrangler or network, on an in-memory D1 shim over Node's built-in `node:sqlite`:
`npm run test:backend` (also part of `npm run test:unit` and CI). With `npm ci` done in `backend/`,
`npm run test:integration` (repo root) runs the Worker in real workerd with a local D1 (still offline).
Local dev with the Turnstile bypass: put `GO_LIVE_GATE=report` in `.dev.vars` (the gate reports localhost + bypass).

## 3. Deploy steps (owner — not done by CI)

> **Test deployment to the owner's (shared) Cloudflare account, 2026-11-10: use `docs/DEPLOY.md`, not the generic steps
> below.** It deploys only Worker `lensiq-api-test` + D1 `lensiq-test` through `[env.test]` of `wrangler.toml` and the
> guarded scripts (`npm run backend:deploy:test`, `backend:off` / `backend:on`, `secrets:setup`, `ai:deploy-defaults`,
> `backend:smoke`). New switches of that environment (`src/tester.js`): `TESTER_GATE` + secret `TESTER_ACCESS_CODE`
> (header `X-Tester-Code`; gates `/v1/ai/*`, `/api/fortune*` and the testing-only lookup sources), `SERVICE_OFF` (kill
> switch: every public route except `/health` answers 503 `{off:true}`), `DAILY_REQUEST_CAP` (LENSIQ-side cap on public
> requests per UTC day; 429 `daily_cap`), `AI_ROUTE_PIN` (router models pinned to the serving provider named on the
> consent screen; a model without a pin is refused), `PUBLIC_ROUTES` (allow-list of public routes; others 404 `route_off` before
> D1), `D1_WRITE_BUDGET` (approximate daily budget of write statements; 429 `d1_budget`), `ADMIN_UNAUTH_WRITES_HOUR` (failed admin
> sign-ins stop writing over this many statements an hour; a correct sign-in is never refused). All are unset in the default configuration, where nothing changes. `POST /v1/tester/check`
> answers `{ok:true}` for a valid code. The generic steps below describe a fresh install on an account of its own.

> **Try-On MVP (2026-11-14): apply migration `0017_tryon.sql` BEFORE deploying this Worker.** From this version on,
> creating any restricted back-office account writes `admin_reviewers.role` and the try-on routes read `tryon_items` /
> `tryon_assets`; a Worker deployed on a database without 0017 refuses new reviewer accounts and `/health/deep` names
> the missing migration. Order: `npm run backend:migrate` (or `wrangler d1 migrations apply`) first, then deploy. The
> try-on public routes (`/v1/tryon/catalog`, `/v1/tryon/asset/*`) must be added to `PUBLIC_ROUTES` where that list is set.
> Images: R2 binding `TRYON_BUCKET` when the owner enables R2 (not today); otherwise the D1 fallback (≤ 1 MB per image).

1. `cd backend && npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create lensiq` → copy the printed `database_id` into `backend/wrangler.toml`.
4. `npx wrangler d1 migrations apply lensiq --remote`
5. Secrets (each prompts for the value; nothing is written to disk):
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # bootstrap token
   npx wrangler secret put ADMIN_BOOTSTRAP_TOKEN
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # KEK (keep an offline copy)
   npx wrangler secret put SECRETS_KEK
   npx wrangler secret put ANTHROPIC_API_KEY        # optional — enables the AI writing assistant
   npx wrangler secret put OPN_SECRET_KEY           # TEST key skey_test_… only, until go-live
   npx wrangler secret put OPN_PUBLIC_KEY           # pkey_test_…
   npx wrangler secret put OPN_WEBHOOK_SECRET       # from Opn dashboard → Webhooks
   npx wrangler secret put TURNSTILE_SECRET         # REQUIRED before opening the AI writing assistant to the public
   npx wrangler secret put ALERT_WEBHOOK_URL        # optional: push owner alerts (payment mismatch, fulfilment, leads)
   ```
6. Edit `[vars]` in `wrangler.toml`: `ALLOWED_ORIGINS` = the exact Pages origin(s), e.g.
   `https://<user>.github.io` (no path) and/or your custom domain; `ADMIN_ORIGINS` if the admin page is served elsewhere.
7. `npx wrangler deploy` — `GO_LIVE_GATE = "enforce"` keeps checkout and Google sign-in closed until `SELLER_*`,
   `LEGAL_TERMS_READY` / `LEGAL_PRIVACY_READY` and owner TOTP are done (see admin → state / `GET /admin/api/go-live`);
   for a staging test-mode run set `GO_LIVE_GATE = "report"` there (live keys stay refused anyway).
8. **Custom domain** (recommended, enables the cookie session): Cloudflare dashboard → Workers → `lensiq-api` →
   Settings → Domains & Routes → add `api.<your-domain>` (the zone must be on Cloudflare). Put the Pages site on
   `www.<your-domain>` (GitHub Pages custom domain + HTTPS) so both are the same site.
9. **Front end**: in `lensiq-config.js` set
   `window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "https://api.<your-domain>";`, then
   `node tools/csp-meta.mjs` (adds that origin to `connect-src` of every page — only when set) and commit.
10. Add the custom domain `admin.<your-domain>` to the same Worker, open `https://admin.<your-domain>/admin` (served by the
    Worker with frame-ancestors/X-Frame-Options headers; cookie session), bootstrap the owner, enable TOTP, then
    `npx wrangler secret delete ADMIN_BOOTSTRAP_TOKEN`.
11. Opn dashboard → Webhooks → endpoint `https://api.<your-domain>/v1/billing/webhook/opn`.
12. Cloudflare dashboard: enable a WAF rate-limiting rule on `/admin/api/login` and `/api/fortune` as a second layer.
13. **Member sign-in (optional, when you want the light/full split):**
    1. Google Cloud Console → APIs & Services → **OAuth consent screen**: External, app name "LENSIQ", support e-mail,
       app home page, privacy policy (`https://anirut77.github.io/<repo>/privacy.html`) and terms links; scopes: the
       defaults only (`openid`, `email`, `profile`); publish the app.
    2. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised JavaScript origins:
       `https://anirut77.github.io` (and your custom domain if any) plus `http://localhost` and
       `http://localhost:8000` for development. No redirect URI is needed (popup / FedCM flow). No client secret is used.
    3. Copy the **Client ID** (public, `…apps.googleusercontent.com`): set `GOOGLE_CLIENT_ID` in `backend/wrangler.toml`
       `[vars]` and `window.LENSIQ_GOOGLE_CLIENT_ID` in `lensiq-config.js`, then `node tools/csp-meta.mjs` (adds
       `https://accounts.google.com/gsi/client` to script-src, `/gsi/style` to style-src, `/gsi/` to frame-src and
       connect-src — only when set), `npx wrangler d1 migrations apply lensiq --remote` (0005), deploy, commit.
    4. Turnstile must be configured (sign-in is fail closed like the AI and checkout).
    5. Admin → **Members**: set the limits, then tick **membership_required**. Untick to return to full readings for all.

Rollback: `npx wrangler rollback`; disable everything client-side by setting `LENSIQ_API_BASE` back to `""`.

## 4. Configuration reference

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `ALLOWED_ORIGINS` | var | example | public API origin allowlist (comma separated) |
| `ADMIN_ORIGINS` | var | empty | extra admin API origins (the Worker's own origin is always allowed; no fallback) |
| `TURNSTILE_SECRET` | secret | — | Cloudflare Turnstile for `/api/fortune` and checkout — **required** (fail closed) |
| `TURNSTILE_HOSTNAMES` | var | empty | **required** with the secret: hostnames the siteverify `hostname` must match |
| `TURNSTILE_DISABLED_FOR_LOCAL_DEV` | var | — | `true` = skip Turnstile for `localhost` origins only (development) |
| `CHECKOUT_GLOBAL_HOUR` | var | 30 | global hourly checkout cap |
| `ANALYTICS_FEATURES` | var | empty | extra allowlisted analytics feature slugs |
| `GOOGLE_CLIENT_ID` | var | empty | public OAuth Web client id for member sign-in (empty = members off); same value as `LENSIQ_GOOGLE_CLIENT_ID` |
| `SIGNIN_GLOBAL_15MIN` | var | 300 | global cap on Google sign-ins per 15 min (10 per caller) |
| `MEMBER_LEDGER_DAYS` | var | 400 | member usage rows kept (payment rows are kept with the payment) |
| `FREE_MODE` | var | `true` | all features unlocked; anything but `false` counts as true |
| `BILLING_ENABLED` | var | `false` | public checkout (also needs FREE_MODE=false); a signed-in member is required |
| `ALLOW_GUEST_CHECKOUT` | var | `false` | legacy opt-in: guests may buy (order token + `POST /v1/billing/claim`); ignored while membership is required |
| `OPN_ALLOW_LIVE` | var | `false` | accept a live `skey_…` |
| `VAT_REGISTERED`, `SELLER_*` | var | `false`, empty | VAT 7 % + tax-invoice seller fields |
| `RAW_EVENT_DAYS`, `AUDIT_DAYS`, `WEBHOOK_PAYLOAD_DAYS` | var | 90, 400, 90 | retention |
| `GO_LIVE_GATE` | var | `report` (wrangler.toml: `enforce`) | `enforce` refuses checkout + new sign-ins while the go-live checks fail; live money always refused |
| `LEGAL_TERMS_READY`, `LEGAL_PRIVACY_READY` | var | `false` | set `true` only after counsel signed off terms / privacy |
| `REQUIRE_OWNER_TOTP` | var | `false` (wrangler.toml: `true`, round 12) | owner TOTP for money ops always (it is required anyway while billing / live keys are on) |
| `MONEY_REAUTH` | var | empty (= `window`; `inline` once `OPN_ALLOW_LIVE=true`) | `inline`: money ops need `{password, totp}` in the request body; `window`: body or the 5-min sudo window |
| `TEST_CHARGE_HOUR` | var | 10 | admin test charges per hour (re-auth required) |
| `MAIL_PROVIDER`, `MAIL_FROM`, `SITE_URL` | var | empty | transactional e-mail (`resend` or `mailchannels`); off while empty |
| `MAIL_API_KEY` | secret | — | the mail provider's API key |
| `CSP_REPORT_DAYS`, `CSP_REPORT_GLOBAL_DAY` | var | 90, 5000 | CSP report counter retention / daily cap |
| `RECONCILE_BATCH` | var | 25 | payments repaired / re-checked per 15-min cron run (1–500) |
| `LEADS_DAYS`, `LEADS_GLOBAL_DAY` | var | 180, 200 | B2B demo-request retention / daily cap |
| `ALERT_WEBHOOK_URL` | secret | — | optional https incoming webhook for owner alerts (no PII sent) |
| `HEALTH_TOKEN` | secret | — | optional bearer for `GET /health/deep` |
| `ADMIN_BOOTSTRAP_TOKEN` | secret | — | one-time owner bootstrap (delete afterwards) |
| `SECRETS_KEK` | secret | — | base64 32 bytes; encrypts TOTP secret + admin-set API key |
| `ANTHROPIC_API_KEY` | secret | — | AI writing assistant |
| `OPN_SECRET_KEY`, `OPN_PUBLIC_KEY`, `OPN_WEBHOOK_SECRET` | secret | — | Opn (test keys) |

## 5. API

Public: `GET /health`, `GET /health/deep`, `GET /v1/config` (incl. `membership`), `POST /v1/events`, `GET /api/fortune/status`, `POST /api/fortune`,
`GET /v1/billing/plans`, `POST /v1/billing/checkout`, `POST /v1/billing/claim`, `GET /v1/billing/payments/:id[/qr]`,
`POST /v1/billing/webhook/opn`, `POST /v1/leads`, `POST /v1/csp-report`.
Members (bearer): `POST /api/auth/nonce|google|logout|reauth|refresh`, `GET|DELETE /api/me`, `POST /api/me/preferences|usage|saved|export`,
`GET /api/me/history|export|entitlements|sessions`, `POST /api/me/entitlements/use|sessions/revoke`, `GET /api/me/payments/:id/receipt`,
`GET /api/me/payments/:id/refunds/:n/credit-note`, `GET|DELETE /api/me/saved/:id` (erasure + export: fresh Google confirmation).
Admin (`/admin/api`): `GET state`, `POST bootstrap|login|logout|password|reauth|totp/setup|totp/enable|totp/disable`,
`GET me|go-live|leads|analytics/summary|analytics/csv|ai|billing|billing/payments|billing/payments/:id[/receipt]|billing/payments/:id/refunds/:n/credit-note|billing/subscriptions|billing/webhooks|members|members/:id|membership|alerts|devices|audit|retention|csp-reports|mail`,
`PUT ai|ai/key|billing/settings|billing/plans/:id|membership`, `DELETE ai/key|devices|devices/:id|leads/:id`,
`POST billing/test-charge|billing/plans|billing/payments/:id/refund|billing/subscriptions/:id/cancel|billing/subscriptions/:id/extend|members/:id/grant|members/:id/status|alerts/:id/ack|leads/:id/ack|retention/run`
(re-auth — `{password, totp}` in the body or the 5-min window of `POST reauth`; body only for money ops under
`MONEY_REAUTH=inline` / live keys — for test-charge (round 12, capped), refund, cancel, extend, grant,
member status, retention/run, plan / price / billing-settings / membership edits and the AI key; owner TOTP on for the
money ops while billing is on). Details: §1 "Round-10 API …" and "Round 11".

Product Check official lookups (round 17 P4, `src/pc.js`; not deployed):
- **Routes:**
  - `GET /api/pc/status|thfda|openfda|safetygate|rasff|healthcanada|hsa|label|ndc|dailymed|rxnav`;
  - `POST /api/pc/batch {lookups:[{source, op?, by?, q}]}`, 1–16 lookups. This is the card's single call per tap: the
    Worker fans out and counts **one** rate-limit hit.
- **Requests:** text only, sent after the user taps "check official sources".
  - The browser sends a registration number, a GTIN, a TMT product name or an ingredient name, never the label text or
    an image.
  - Origin is required. Lookups are GET; the batch is POST `application/json`, at most 4 KB.
  - Thai FDA: only the operations the card uses are public (`drug, food, cosmetic, herbal, device, advert, all`). The
    licensee-name searches (`lcn_*`, `drug_lcn_info`) and the rest are not exposed.
- **Rate limit:** `PC_RATE_MIN` per caller per minute (default 30). It uses D1 when it is bound and an in-memory window
  per isolate otherwise.
- **Accepted answers:** only each source's documented shape.
  - Thai FDA: the operation's `…Response` / `…Result` and no SOAP Fault.
  - JSON sources: the expected array — `results`, `content`, `notifications`, `result.records`, `data`, plus RxNav's
    `approximateGroup` / `relatedGroup`.
  - Anything else (an HTML / WAF page, a Fault, an empty 200, other JSON) is `could_not_check` (`bad_response`), never
    "not found", and is never cached.
- **Caches:** keyed by a SHA-256 of the query, never the query itself. Errors are never cached. Lifetimes:
  - recalls: 1 h;
  - registers: 6 h;
  - labels: 24 h.
- **TMT brand table:** also static. `tools/pc-tmt-build.mjs` writes `vendor/pc-drugs/tmt/`: `meta.json` plus 473 key-prefix
  shards. The page loads only the shards a label needs (owner decision 2026-11-10).
- **Health Canada:** never fetched by the Worker. `GET /api/pc/healthcanada` always answers `on_device`.
  - `tools/pc-hc-build.mjs` shards the 16 MB open-data file offline into `vendor/pc-recalls/hc/`: word postings by
    2-letter prefix plus 100-item chunks, with the OGL-Canada credit in `meta.json`.
  - The page searches those static files itself, so it works on the Workers free plan and on `*.workers.dev`, and the
    search words are not sent anywhere.
  - Re-run the tool on each Health Canada release; `--check` verifies the committed files (owner decision 2026-11-10).
- **Failures:** a source that fails answers `{ok:false, could_not_check:true, reason}`: HTTP 502 when it is down, 503 when
  it is switched off. Reasons: `upstream_<status>`, `timeout`, `rate_limited`, `bad_response`, `switched_off`,
  `testing_only_off`, `on_device`, `link_out`.
- **Thai FDA personal data:**
  - Rows are whitelisted.
  - Licensee names are kept only for companies: the name starts with บริษัท… or ends with จำกัด / Co., Ltd. …,
    after NFKC and zero-width stripping.
  - A name that starts with a person's title (civil, academic, medical, military / police ranks) is always dropped.
  - Addresses and foreign-maker fields are always dropped.
- **Switches:**
  - `PC_ENABLED` turns the routes on or off.
  - `PC_THFDA_MODE`: `live` (demo / testing) or `link` (no Thai FDA call). Written permission is needed before charging
    (CTO-BRIEF L13).
  - `PC_BUILD`: `demo` (this repo) or `customer`. In a customer build the testing-only sources (Thai FDA, EU Safety
    Gate, RASFF; L13 / L16) are **off** unless the owner switches them on, and their answers keep the licence label.
  - Admin API `GET|PUT /admin/api/pc/lookup`: Thai FDA mode plus per-source on/off. PUT needs re-auth and is audited;
    only explicit owner choices are stored. There is no admin.html control yet. `wrangler.toml` says the same.
- **Licences and testing-only flags per source:** `docs/product-check/P4-RESULTS.md` §3.

Type checking: `npm run typecheck` also runs `tsc -p backend/tsconfig.json` (every `backend/src` file is
`// @ts-check`; minimal ambient Workers / D1 / SDK types in `backend/types/worker.d.ts`, so no network install is
needed). CI additionally runs `npm ci` in `backend/` (pinned by `backend/package-lock.json`) and
`wrangler deploy --dry-run --outdir …` to prove the Worker bundles (nothing is deployed, no account needed).

## 6. Data retention (cron `17 3 * * *`; payment reconcile `*/15 * * * *`)

| Data | Kept | Notes |
|---|---|---|
| raw analytics events | 90 days (`RAW_EVENT_DAYS`) | only days already aggregated are deleted |
| daily aggregates | indefinitely | counts only, no identifiers |
| daily salt | until the next day | visitor hashes become unlinkable |
| rate-limit windows | 1 day | |
| admin sessions | until expiry (≤ 12 h) | |
| trusted admin devices | 90 days | all revoked on password change |
| usage counters (quotas) | 35 days | |
| webhook raw payloads | 90 days | event id / result kept with the payment |
| audit log | 400 days (`AUDIT_DAYS`) | |
| member accounts | until the member deletes the account (or the owner on request) | `DELETE /api/me` |
| member sessions / sign-in nonces | 30 days (14 idle); short sessions 12 h (1 h idle), refresh chain ≤ 7 days / 10 min | |
| e-mail delivery log (`mail_log`) | 400 days (`AUDIT_DAYS`) | no address / body; member id cleared on erasure |
| CSP report counters (`csp_reports`) | 90 days (`CSP_REPORT_DAYS`) | directive + blocked origin + page path counts only |
| member usage ledger | 400 days (`MEMBER_LEDGER_DAYS`) | payment and refund rows kept |
| credits (one-time purchases / grants) | until used, expired (365 days) or the account is deleted | |
| admin alerts | kept (small) | acknowledged in the admin |
| B2B demo requests (`leads`) | 180 days (`LEADS_DAYS`) | no IP / user agent; deletable one by one in the admin |
| quota tombstones (`usage_counters` subject `x:…`) | the Bangkok day they were written for | HMAC with the day salt (deleted next day) |
| refunds / credit notes | with the payment (≥ 5 years) | accounting records |
| saved readings | until the member deletes them / the account | |
| payments, receipts, tax-invoice fields | ≥ 5 years (Thai Revenue Code) | never purged automatically; unlinked from a deleted account |

## 7. Publishing safety

`tools/build-site.mjs` publishes root `*.html/*.js/*.css`, `i18n/`, `vendor/` only; `backend/`, `wrangler*.toml`,
`.dev.vars*`, `.wrangler/`, `migrations/*.sql` are additionally in `FORBIDDEN` (build fails if one slips in).
`admin.html`/`admin.js`/`admin.css` and `pricing.*` are published as static shells (no data, `noindex`, not linked).
`tests/unit/backend-site.test.js` checks all of this plus "no key-looking strings under backend/".
New files must be `git add`-ed before they are published (the build uses `git ls-files`).

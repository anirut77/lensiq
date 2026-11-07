# LENSIQ backend — Cloudflare Worker + D1

> Status: **scaffold, not deployed.** The public site keeps working with no backend at all (`LENSIQ_API_BASE = ""`).
> The service is **free** (`FREE_MODE=true`); billing code is ready but switched off.

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
| Router | `backend/src/index.js` | public + admin routes, security headers, CORS, error mapping, `scheduled()` |
| Auth | `backend/src/auth.js` | single owner: bootstrap → PBKDF2 password → optional TOTP; sessions, CSRF, lockout |
| Crypto | `backend/src/crypto.js` | WebCrypto PBKDF2-SHA256 (100 000 it. = Workers maximum), TOTP RFC 6238, AES-GCM envelope |
| Store | `backend/src/store.js` | daily salts, day-salted caller hashes, fixed-window rate limits, audit log, settings |
| Analytics | `backend/src/analytics.js` | strict event allowlist, ingest, daily aggregation, dashboard, CSV |
| Retention | `backend/src/retention.js` | cron: aggregate first, then purge (table in §6) |
| AI | `backend/src/fortune.js`, `settings.js`, `fortune-prompt.js` | port of `server.py` `/api/fortune`; admin AI settings; API key storage |
| Billing | `backend/src/billing.js`, `opn.js` | plans/entitlements, FREE_MODE, PromptPay charge, polling, webhook, receipts / VAT |
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

Tables `plans, entitlements, customers, subscriptions, payments, webhooks, counters`. `checkEntitlement()` is the
single server-side gate; with `FREE_MODE=true` it always allows but still counts usage (so we learn real demand).

* **Checkout** (`BILLING_ENABLED=true` **and** `FREE_MODE=false` only): Turnstile required (fail closed, action
  `checkout`; `503 turnstile_not_configured` without it), then 5 per caller per hour **and a global cap of 30 per hour**
  (`CHECKOUT_GLOBAL_HOUR` var): PromptPay charge (`POST /charges`, `source[type]=promptpay`), QR proxied through the Worker as SVG (page CSP
  allows `img-src blob:` only), status polling (`GET /charges/:id`). The response includes `customer_id` and a secret
  `order_token` shown once to the buyer (only its hash is stored) — the handle that links the paid plan to the buyer.
* **Webhook** `POST /v1/billing/webhook/opn` verified with `Omise-Signature` (hex HMAC-SHA256 over
  `<Omise-Signature-Timestamp>.<raw body>`, base64-decoded secret, comma-separated signatures during rotation, 5-minute
  tolerance); the charge is then **re-fetched from the Opn API** (the payload is never trusted). An event is a
  duplicate only once it was **processed**: if the Opn API fails (e.g. 503) the Worker answers 503, the row stays
  unprocessed and Opn's retry is handled normally.
* **Reconcile cron** (`*/15 * * * *`): pending payments from the last 3 days are re-checked with Opn (lost webhooks).
* **Receipts:** success is claimed and numbered in **one transaction** (`UPDATE … WHERE status='pending'`, counter
  incremented only when that update changed a row, number written in the same batch) — gap-free and assigned once even
  when webhook, poll and cron race. Numbers `LQ-YYYYMM-000001`; VAT 7 % (inclusive) only when `VAT_REGISTERED=true`;
  buyer/seller tax-invoice fields stored per payment. Live keys are refused unless `OPN_ALLOW_LIVE=true`.

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
| paid | active subscription linked to `user_id` | full | plan entitlement `ai_reading` (pro 100/month, business 600/month; enforced when `FREE_MODE=false`) | checkout requires a member when membership is on |

Safety and consent texts (Kalama reminder, gentle cautions, AI consent text) are **never gated**. Limits are editable
in admin → Members (D1 `settings.membership`; paid-plan AI quotas update `entitlements`).

* **Sign-in flow.** The header chip / gate card opens our own dialog (purpose, lawful basis s.24(3), no marketing
  without the separate opt-in, Cloudflare outside Thailand, links to terms/privacy; terms checkbox required, marketing
  checkbox separate and unticked). Only after "Continue with Google" is `https://accounts.google.com/gsi/client`
  loaded (no third-party request on page load — e2e-tested). `POST /api/auth/nonce` issues a one-time nonce (hash
  stored, 10 min); GIS returns an ID token; `POST /api/auth/google` (Turnstile action `signin`, fail closed; 10 per caller
  and `SIGNIN_GLOBAL_15MIN` (300) per 15 min) consumes the nonce atomically and verifies the token itself
  (`google.js`): RS256 with WebCrypto against `https://www.googleapis.com/oauth2/v3/certs` (cached per Cache-Control
  max-age, clamped 60 s–24 h; an unknown `kid` forces one refetch, throttled to one per 30 s), `iss` ∈
  {`accounts.google.com`, `https://accounts.google.com`}, `aud == GOOGLE_CLIENT_ID` (`azp` with multi-audience), `exp`
  / `iat` with 60 s skew, `email_verified`, `nonce`. No client secret, no Google SDK, no Google API call with user data.
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
  tax but unlinked (`user_id` NULL, e-mail removed; tax-invoice buyer fields stay). Audit log rows carry the user id
  only, never the e-mail. See `docs/pdpa/ROPA.md` M22 and `docs/pdpa/DPIA.md` §13.
* **Known limits.** The guest counter is client-side (soft by design — it only shapes the free experience; AI cost is
  enforced server-side). Guests already get the light version; a determined visitor could clear storage. The AI
  status probe is cached per page load by `fortune-ai.js`, so after signing in the AI consent box appears on the next
  page load. On the very first visit the reading can render before `/v1/config` arrives; it is re-rendered (light)
  within the round-trip, later visits use the cached config.

## 2. Local development (no Cloudflare account needed)

```sh
cd backend
npm install                       # @anthropic-ai/sdk + wrangler (dev)
cp .dev.vars.example .dev.vars    # placeholders; git-ignored
npx wrangler d1 migrations apply lensiq --local
npx wrangler dev                  # http://localhost:8787 (local D1 + local cron trigger: curl "http://localhost:8787/__scheduled")
```

Tests run without wrangler or network, on an in-memory D1 shim over Node's built-in `node:sqlite`:
`npm run test:backend` (also part of `npm run test:unit` and CI).

## 3. Deploy steps (owner — not done by CI)

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
   ```
6. Edit `[vars]` in `wrangler.toml`: `ALLOWED_ORIGINS` = the exact Pages origin(s), e.g.
   `https://<user>.github.io` (no path) and/or your custom domain; `ADMIN_ORIGINS` if the admin page is served elsewhere.
7. `npx wrangler deploy`
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
| `BILLING_ENABLED` | var | `false` | public checkout (also needs FREE_MODE=false) |
| `OPN_ALLOW_LIVE` | var | `false` | accept a live `skey_…` |
| `VAT_REGISTERED`, `SELLER_*` | var | `false`, empty | VAT 7 % + tax-invoice seller fields |
| `RAW_EVENT_DAYS`, `AUDIT_DAYS`, `WEBHOOK_PAYLOAD_DAYS` | var | 90, 400, 90 | retention |
| `ADMIN_BOOTSTRAP_TOKEN` | secret | — | one-time owner bootstrap (delete afterwards) |
| `SECRETS_KEK` | secret | — | base64 32 bytes; encrypts TOTP secret + admin-set API key |
| `ANTHROPIC_API_KEY` | secret | — | AI writing assistant |
| `OPN_SECRET_KEY`, `OPN_PUBLIC_KEY`, `OPN_WEBHOOK_SECRET` | secret | — | Opn (test keys) |

## 5. API

Public: `GET /health`, `GET /v1/config` (incl. `membership`), `POST /v1/events`, `GET /api/fortune/status`, `POST /api/fortune`,
`GET /v1/billing/plans`, `POST /v1/billing/checkout`, `GET /v1/billing/payments/:id[/qr]`, `POST /v1/billing/webhook/opn`.
Members (bearer): `POST /api/auth/nonce|google|logout`, `GET|DELETE /api/me`, `POST /api/me/preferences|usage|saved`,
`GET /api/me/history|export`, `GET|DELETE /api/me/saved/:id`.
Admin (`/admin/api`): `GET state`, `POST bootstrap|login|logout|password|totp/setup|totp/enable|totp/disable`,
`GET me|analytics/summary|analytics/csv|ai|billing|billing/payments|billing/webhooks|members|membership|audit|retention`,
`PUT ai|ai/key|billing/settings|membership`, `DELETE ai/key`, `POST billing/test-charge|retention/run|members/:id/status`.

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
| member sessions / sign-in nonces | 30 days (14 idle) / 10 min | |
| member usage ledger | 400 days (`MEMBER_LEDGER_DAYS`) | payment rows kept |
| saved readings | until the member deletes them / the account | |
| payments, receipts, tax-invoice fields | ≥ 5 years (Thai Revenue Code) | never purged automatically; unlinked from a deleted account |

## 7. Publishing safety

`tools/build-site.mjs` publishes root `*.html/*.js/*.css`, `i18n/`, `vendor/` only; `backend/`, `wrangler*.toml`,
`.dev.vars*`, `.wrangler/`, `migrations/*.sql` are additionally in `FORBIDDEN` (build fails if one slips in).
`admin.html`/`admin.js`/`admin.css` and `pricing.*` are published as static shells (no data, `noindex`, not linked).
`tests/unit/backend-site.test.js` checks all of this plus "no key-looking strings under backend/".
New files must be `git add`-ed before they are published (the build uses `git ls-files`).

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

### Security design (summary)

* **Admin auth** — one owner account (`admin_users.id = 1`). First run: `POST /admin/api/bootstrap` with the Worker
  secret `ADMIN_BOOTSTRAP_TOKEN` (≥ 32 chars, constant-time compare, 5 tries/h). Password ≥ 12 chars, PBKDF2-SHA256
  100 000 iterations + 16-byte salt (Argon2 is not available in WebCrypto; Workers cap PBKDF2 at 100 000 — the gap is
  covered by rate limits, lockout and TOTP). Optional TOTP (secret AES-GCM-encrypted with `SECRETS_KEK`, ±30 s window,
  replay-protected).
* **Sessions** — 256-bit random token; only its SHA-256 is stored. 30 min idle / 12 h absolute. Two modes:
  * *cookie* — `__Host-lq_admin`, `HttpOnly; Secure; SameSite=Strict; Path=/`. Works when admin.html and the API are on
    the **same site** (e.g. `www.example.co.th` + `api.example.co.th`). Unsafe requests need `X-CSRF-Token`
    (synchronizer token, hashed per session, rotated by `GET /admin/api/me`) **and** an allowlisted `Origin`.
  * *bearer* — for an admin page on another site (e.g. `*.github.io`, where a SameSite=Strict cookie is never sent):
    the token is returned once and kept **in memory only** by admin.js (reload = sign in again). No CSRF exposure because
    nothing is ambient.
* **Lockout / rate limits** — login 10 per 15 min per caller; account locked after every 5th failure (15 min, doubling,
  max 24 h). Rate-limit keys are day-salted HMACs, never IPs.
* **Audit log** — bootstrap, logins (ok/failed/locked), logout, password/TOTP changes, AI settings/key changes (never the
  key), billing settings, test charges, payments, CSV exports, retention runs. Secret-looking fields are redacted.
* **Origin allowlist** — `ALLOWED_ORIGINS` (public API) and `ADMIN_ORIGINS` (admin API; defaults to the former). `null`
  origin always refused; unsafe requests must carry an allowlisted `Origin`.
* **Responses** — `Cache-Control: no-store`, `nosniff`, `Referrer-Policy: no-referrer`, `CSP: default-src 'none';
  frame-ancestors 'none'; sandbox`, HSTS.
* **Logs** — `log()` drops any field named like key/secret/token/password/facts/body/ip/email; fortune facts and event
  payloads are never logged.

### AI writing assistant (`/api/fortune`)

Same contract and safety design as `server.py`, so `fortune-ai.js` needs **no change**: it already calls
`LENSIQ_API_BASE + "/api/fortune"`. Consent (`consent: true`) required · derived facts only (strict allowlist —
birth dates, phone numbers, images, descriptors are dropped) · server-side prompt rules (`fortune-prompt.js` is
generated from `server.py` `FORTUNE_SYSTEM`; a unit test fails if they drift) · 80 KB body / 20 KB facts / 80 items /
600 chars · Origin allowlist · per-caller RPM + global daily cap (admin-configurable) · per-domain on/off · plan quota
(counted always, enforced only when `FREE_MODE=false`) · every failure returns `fallback: true` so the page uses its
local composer.

Calls Claude via the official SDK `@anthropic-ai/sdk` (`client.beta.messages.create`) with model `claude-opus-5-5`
(admin-configurable), `output_config: {effort, format: json_schema}`, prompt caching on the system prompt, and the
server-side refusal fallback (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`). Errors are mapped by
typed SDK classes (`RateLimitError` → 429, `APIConnectionError` → 504, `APIError` → 502). **Temperature** is stored in
the settings for reference but never sent: Claude Opus 5.5 (and every model from API version 2026-10-21, which the SDK
sends) rejects `temperature`/`top_p`/`top_k`; use **effort** (`low`…`max`, default `medium`) to trade depth for cost.

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
`text/plain` (no preflight). Events: `page_view, feature_used, reading_domain, studio_render_done, error, session_end`;
fields are enums/slugs only; the Worker rejects the whole batch on any unknown or PII-looking key/value (e-mail,
6+ digit runs, URLs, whitespace/non-ASCII free text). No IP or user agent is stored: a day-salted HMAC of (IP, UA) gives
same-day unique visitors; the salt is deleted the next day. Retention is approximated from a coarse "days since last
visit" bucket the consenting browser computes locally.

Hooks for page teams (no edits needed in shared files):
`LQAnalytics.feature("studio.render", "start"|"complete")`, `LQAnalytics.renderDone()`, `LQAnalytics.domain("palm")`,
or `document.dispatchEvent(new CustomEvent("lensiq:track", {detail: {n: "feature_used", feature: "x", step: "start"}}))`.
All are no-ops without API/consent. The fortune pages get `lensiq-fortune-hook.js` (wraps `FortuneAI.interpret`
transparently to record the domain + start/complete).

### Billing (scaffold — see docs/BILLING-PLAN.md)

Tables `plans, entitlements, customers, subscriptions, payments, webhooks, counters`. `checkEntitlement()` is the
single server-side gate; with `FREE_MODE=true` it always allows but still counts usage (so we learn real demand).
Checkout (`BILLING_ENABLED=true` **and** `FREE_MODE=false` only): PromptPay charge (`POST /charges`,
`source[type]=promptpay`), QR proxied through the Worker as SVG (page CSP allows `img-src blob:` only), status polling
(`GET /charges/:id`), webhook `POST /v1/billing/webhook/opn` verified with `Omise-Signature` (hex HMAC-SHA256 over
`<Omise-Signature-Timestamp>.<raw body>`, base64-decoded secret, comma-separated signatures during rotation, 5-minute
tolerance), deduplicated by event id, then the charge is **re-fetched from the Opn API** (the payload is never trusted).
Live keys are refused unless `OPN_ALLOW_LIVE=true`. Receipt numbers `LQ-YYYYMM-000001`; VAT 7 % (inclusive) only when
`VAT_REGISTERED=true`; buyer/seller tax-invoice fields stored per payment.

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
10. Open `https://<site>/admin.html`, bootstrap the owner, enable TOTP, then `npx wrangler secret delete ADMIN_BOOTSTRAP_TOKEN`.
11. Opn dashboard → Webhooks → endpoint `https://api.<your-domain>/v1/billing/webhook/opn`.
12. Cloudflare dashboard: enable a WAF rate-limiting rule on `/admin/api/login` and `/api/fortune` as a second layer.

Rollback: `npx wrangler rollback`; disable everything client-side by setting `LENSIQ_API_BASE` back to `""`.

## 4. Configuration reference

| Name | Kind | Default | Meaning |
|---|---|---|---|
| `ALLOWED_ORIGINS` | var | example | public API origin allowlist (comma separated) |
| `ADMIN_ORIGINS` | var | = ALLOWED_ORIGINS | admin API origin allowlist |
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

Public: `GET /health`, `GET /v1/config`, `POST /v1/events`, `GET /api/fortune/status`, `POST /api/fortune`,
`GET /v1/billing/plans`, `POST /v1/billing/checkout`, `GET /v1/billing/payments/:id[/qr]`, `POST /v1/billing/webhook/opn`.
Admin (`/admin/api`): `GET state`, `POST bootstrap|login|logout|password|totp/setup|totp/enable|totp/disable`,
`GET me|analytics/summary|analytics/csv|ai|billing|billing/payments|billing/webhooks|audit|retention`,
`PUT ai|ai/key|billing/settings`, `DELETE ai/key`, `POST billing/test-charge|retention/run`.

## 6. Data retention (cron `17 3 * * *`)

| Data | Kept | Notes |
|---|---|---|
| raw analytics events | 90 days (`RAW_EVENT_DAYS`) | only days already aggregated are deleted |
| daily aggregates | indefinitely | counts only, no identifiers |
| daily salt | until the next day | visitor hashes become unlinkable |
| rate-limit windows | 1 day | |
| admin sessions | until expiry (≤ 12 h) | |
| usage counters (quotas) | 35 days | |
| webhook raw payloads | 90 days | event id / result kept with the payment |
| audit log | 400 days (`AUDIT_DAYS`) | |
| payments, receipts, tax-invoice fields | ≥ 5 years (Thai Revenue Code) | never purged automatically |

## 7. Publishing safety

`tools/build-site.mjs` publishes root `*.html/*.js/*.css`, `i18n/`, `vendor/` only; `backend/`, `wrangler*.toml`,
`.dev.vars*`, `.wrangler/`, `migrations/*.sql` are additionally in `FORBIDDEN` (build fails if one slips in).
`admin.html`/`admin.js`/`admin.css` and `pricing.*` are published as static shells (no data, `noindex`, not linked).
`tests/unit/backend-site.test.js` checks all of this plus "no key-looking strings under backend/".
New files must be `git add`-ed before they are published (the build uses `git ls-files`).

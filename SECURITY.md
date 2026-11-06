# LENSIQ security

LENSIQ is a set of static pages that run all camera inference in the browser. There is also an optional Flask
server (`server.py`) for LAN/HTTPS use, PDF→DOCX conversion, the Claude text rewrite, Replicate try-on and multi-device
aggregation. This document covers the threat model, the controls in place, how they are tested and what remains open.

Report a vulnerability privately to the repository owner (GitHub: open a *private* security advisory on the repo).
Do not file a public issue. We aim to acknowledge reports within 3 working days.

## 1. Assets

| Asset | Where it lives | Sensitivity |
|---|---|---|
| Camera frames | browser memory only (never stored or sent by default) | high, personal data |
| Face descriptors (128-d vectors) for customers / attendance / booth "remember" | localStorage, **AES-GCM encrypted** (`lensiq-facevault.js`) | **sensitive (biometric) — PDPA s.26** |
| Member names, phones, orders, attendance logs, leads | localStorage (plaintext) | personal data |
| Daily aggregate counts (people in/out, dwell, zones) | localStorage; hub: `data/agg.json` (0600, dir 0700) | low, no personal data |
| Pairing code / node tokens for `/api/agg` | hub `data/agg.json` (token **hashes** only); node: localStorage | secret |
| `ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN` | server environment only | secret, costs money |
| Photos sent to try-on (opt-in) | in transit to Replicate (US); not stored by server.py | high |
| Derived fortune "facts" sent to Claude (opt-in) | in transit to Anthropic (US) | low–medium |

## 2. Trust boundaries and attackers

1. **Visitor's browser ↔ static host** (GitHub Pages / any static host). The attacker is on the network or is a
   malicious third-party script. Controls: HTTPS (Pages), CSP `<meta>` (§3.1), no third-party scripts at all.
2. **Other websites the operator visits ↔ the LAN server**. The attacker is a web page that tries CSRF or DNS
   rebinding against `http://192.168.x.x:8000/api/*`. Controls: Host allowlist, Origin / `Sec-Fetch-Site` checks,
   no CORS wildcard on authenticated APIs (§3.3).
3. **Devices on the same Wi-Fi ↔ the LAN server**. The attacker is a guest phone on the shop Wi-Fi. Controls:
   pairing code + per-node bearer tokens, lockout after failed codes, rate limits, strict numeric schema, LAN-only
   remote address (§3.4).
4. **Server ↔ third-party APIs** (Anthropic, Replicate). The attacker is a compromised or malicious API response.
   Controls: the token is only sent to `https://api.replicate.com`, result URLs must be `https://`, response size is
   capped, and upstream error text is never echoed to clients (§3.5).
5. **Physical access to a kiosk / lost device**. The attacker can read localStorage. Controls: face descriptors are
   encrypted with a **non-extractable** WebCrypto key held in IndexedDB, retention limits and "delete all". Residual
   risk is covered in §5.

Out of scope: a malicious operator, a compromised OS or browser, and side channels in the browser's WebCrypto.

## 3. Controls

### 3.1 Content-Security-Policy

- **server.py** sends this header on every response: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline'; font-src 'self' data:;
  img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob: [LENSIQ_CSP_CONNECT];
  worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'self'`.
- It also sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy:
  camera=(self), microphone=() …`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-origin`.
- **GitHub Pages** cannot set headers. `node tools/csp-meta.mjs` writes the same policy as a `<meta>` as the first
  element after `<meta charset>` in every page, and running it twice changes nothing. A `<meta>` policy cannot carry
  `frame-ancestors`, so framing protection on Pages is not available. No page holds secrets, and the camera
  permission prompt names the real origin.
- `node tools/csp-meta.mjs --check` fails CI when a page is missing the meta or has an outdated one. It also flags
  inline `<script>`, `on*=` handlers, `javascript:` URLs and third-party script origins.
- `node tools/check-csp.mjs` opens every page in headless Chrome under the meta policy, served like Pages with no
  headers. `tests/e2e/csp.e2e.mjs` does the same under the server header, including TF.js wasm, MediaPipe,
  onnxruntime-web and the pdf.js worker.
- `'wasm-unsafe-eval'` is required by the WASM runtimes. `'unsafe-inline'` applies to styles only, because pages
  use `style=""`. Scripts never use it.

### 3.2 Face data at rest (`lensiq-facevault.js`)

- Envelope `{"enc":"lq1","iv","ct"}`: AES-GCM 256 with a fresh 96-bit IV per write. The localStorage key name is the
  AAD, so an envelope copied to another key does not decrypt.
- One key per data set, generated with `extractable: false` and stored as a `CryptoKey` in IndexedDB. Script can use
  it but cannot read it out. "Delete all face data" deletes the key as well, so any leftover copy of the envelope is
  unrecoverable.
- **Secure context required; there is no plaintext fallback.** Without `isSecureContext`, `crypto.subtle` or
  IndexedDB, every write throws `VaultInsecureError` (`e.code === "insecure-context"`, `e.reason` is one of
  `insecure-context`, `no-webcrypto`, `no-indexeddb` or `encrypt-failed`) and nothing is written. Pages call
  `LQVault.enrollBlockReason()` before enrolment and show its Thai message, which is also `LQVault.STATE_TH.insecure`.
  The old plaintext mode exists only as an explicit opt-in (`LQVault.configure({allowPlaintext: true})`). No page
  uses it.
- Legacy plaintext descriptors from older versions stay readable and are re-encrypted on the next load in a secure
  context. Without one they are left untouched rather than lost, and no new plaintext copy is ever written.
- A lost key puts the data in the `locked` state. It is never overwritten silently and the user must "delete all".
- Retention: 30, 90, 180, 365 or 730 days since last seen (`LQVault.expired`).
- Tested in `tests/unit/facevault.test.js`.

### 3.3 Shared API guard (`/api/convert`, `/api/tryon`, `/api/fortune`)

1. **Host.** The Host header must be an IP, `localhost`, `*.local` or a name in `LENSIQ_HOSTS`. This blocks DNS
   rebinding.
2. **Origin.** The Origin must be same-origin or in the allowlist. `Origin: null` is always refused. A request with
   no Origin but with `Sec-Fetch-Site: cross-site` is refused too. This blocks CSRF.
3. **Remote address.** Only loopback and private LAN addresses are accepted, unless `LENSIQ_API_ALLOW_ANY=1`.
   `X-Forwarded-For` is honoured only with `LENSIQ_TRUST_PROXY=1`, counted `LENSIQ_PROXY_HOPS` from the right.
4. **Rate limits per IP.** 60 requests per minute overall; 6 conversions, 4 try-ons and 10 fortune requests per
   minute; 500 fortune requests per day per server. A malformed environment value falls back to the default instead
   of returning a 500.
5. **Size and type.** `Content-Length` is required, and the size limits are 50 MB, 20 MB and 80 KB. Content-Type is
   enforced, and try-on checks PNG, JPEG and WebP magic bytes.
6. **Consent** is enforced server-side for try-on (`consent=yes`) and fortune (`consent: true`).

### 3.4 Multi-device aggregation (`/api/agg`)

- **Pairing code.** 12 characters from a 30-symbol alphabet (about 59 bits), shown only on the hub's own screen or
  terminal (loopback) and compared with `hmac.compare_digest`.
- **Failed attempts.** 20 wrong codes in 10 minutes lock out that IP for 10 minutes. The overall limit is 120
  requests per minute per IP.
- **Node tokens.** 256-bit `secrets.token_urlsafe`. Only the SHA-256 hash is stored, and lookup compares in constant
  time against all nodes. The node id comes from the token, never from the request body.
- **Schema.** The pack is numeric and allowlisted (unknown keys, strings, images and descriptors are rejected), with
  a 16 KB body limit. Data older than 62 days is deleted.
- **Storage.** `data/` is written atomically with mode 0600 and is never served.
- **Revocation.** `DELETE /api/agg/node/<id>` revokes one device. Rotating the pairing code stops new pairings only;
  devices already paired keep working until they are deleted.

### 3.5 Error handling, logging and outbound calls

- `/api/*` errors (404, 405, 413, 500) return short JSON such as `{"error": "..."}`. They never include a stack
  trace, exception text, path or upstream body. Debug mode is never enabled.
- Logs record the error type, status code and Anthropic `request_id` only. They never contain fortune facts, image
  bytes, API keys, pairing codes or tokens. Bearer values are not logged by Werkzeug's access log. The only place the
  pairing code appears is the terminal of `./start.sh mobile`, which is intentional so the operator can read it.
- Try-on: provider error details (`TryOnError.detail`) go to the server log only; the client sees a generic Thai
  message. The poll URL must start with `https://api.replicate.com/` before the bearer token is attached. The result
  URL must be `https://`, which blocks `file://` and plain-http LAN SSRF. The download is capped at 25 MB.
- The static file route refuses `server.py`, `tryon.py`, `requirements*`, `start.sh`, `tools/`, `tests/`,
  `node_modules/`, `package*.json`, `eslint.config*`, `data/`, `logs/`, `certs/`, any dot-path, and files ending in
  `.py`, `.sh`, `.pem`, `.key`, `.crt`, `.log`, `.env`, `.db` or `.sqlite`. Checks are case-insensitive for macOS.

### 3.6 Service worker (`sw.js`)

The service worker caches **only** same-origin `GET` requests under `vendor/` (models and runtimes), cache-first and
versioned (`lq-models-v1`). It never caches pages, page scripts or `/api/*`, so a security fix to a page is never
hidden behind a stale cache. Range requests and responses that are not `200` or not same-origin are not cached.
Registration happens only in a secure context, and `?nosw` disables it.

## 4. Dependency pinning

- **Python.** `requirements.txt` pins every direct and transitive package exactly (`==`), and
  `tests/python/test_security.py` fails if a range slips in. For a hash-locked production install:

  ```sh
  pip install pip-tools
  pip-compile --generate-hashes --strip-extras -o requirements.lock requirements.txt
  pip install --require-hashes -r requirements.lock
  ```

- **JavaScript.** The site has no npm runtime dependencies. All browser libraries are vendored under `vendor/` and
  inventoried with versions and licences in `LICENSES/THIRD_PARTY.md`. ESLint is the only dev dependency, locked by
  `package-lock.json` and installed with `npm ci`.
- **CI actions.** The workflow uses major-version tags (`actions/checkout@v4` …). Pin them to commit SHAs if your
  policy requires it.

## 5. Known residual risks

| Risk | Status / mitigation |
|---|---|
| Names, phones and orders in localStorage are not encrypted | Rely on device disk encryption and OS login; use "delete all" / retention; the PDPA pack documents it |
| Booth "same-day" descriptors live in `sessionStorage` unencrypted, per tab, for one day | Only the opt-in "remember" copy is persisted (encrypted); closing the tab clears it |
| No `frame-ancestors` on GitHub Pages | No secrets on the pages; serve via server.py or a host with headers for kiosks |
| Self-signed certificate for `./start.sh mobile` | LAN-only, trust-on-first-use; use a real certificate (e.g. a local CA) for permanent installs |
| Rate limits are in-memory, per process | Fine for a single LAN server; put a proxy limit in front of internet deployments |
| Rotating the pairing code doesn't revoke nodes | By design; delete nodes individually (checklist in docs/DEPLOYMENT-CHECKLIST.md) |

## 6. Tests

- `npm run test:py` runs the server tests: `tests/python/test_api_guard.py`, `test_agg.py` and `test_security.py`.
  `test_security.py` covers the static deny list, JSON errors without internals, provider details never leaked, the
  token sent only to Replicate, https-only results, malformed environment values and exact pins.
- `npm run test:unit` covers `facevault.test.js` (encryption, secure-context refusal, no plaintext fallback, locked
  state, retention) and `csp-meta.test.js` (idempotency, parity with server.py, lint).
- `npm run test:e2e` runs `csp.e2e.mjs` and `agg.e2e.mjs`, among others. `node tools/check-csp.mjs` checks the pages
  under the Pages policy.

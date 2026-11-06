# LENSIQ architecture

LENSIQ is a static multi-page web app. There is no build step: plain HTML, CSS and classic `<script>` JS. All computer
vision runs in the visitor's browser (WASM / CPU, with WebGL optional). An optional Flask server (`server.py`) adds a
LAN hub for numbers, PDF conversion and two opt-in cloud AI relays. The same files deploy unchanged to GitHub Pages,
any static host, or `server.py`.

```
 browser (kiosk / laptop / phone)                                      server.py (optional, LAN; Flask)
 ┌───────────────────────────────────────────────────────────────┐    ┌────────────────────────────────────────┐
 │ page.html ─ nav.js ─┬─ lensiq-i18n.js + i18n/zh-common.js      │    │ static files (deny-list: *.py, data/…) │
 │                     ├─ sw.js (cache-first vendor/ models)      │    │ CSP + security headers on every reply  │
 │                     └─ window.LQModels (download notice)       │    │ api_guard: Host, Origin, LAN-only,     │
 │ shared: lensiq-camera  lensiq-detect  lensiq-track  lensiq-hand │    │   rate limit, size, content-type      │
 │         lensiq-stats   lensiq-agg     lensiq-facevault          │    │ /api/agg      numbers-only hub (62 d) │
 │         fortune-ai / fortune-kit   studio-core   insights-*     │    │ /api/convert  pdfconvert.py (MIT)     │
 │ vendor/: face-api (TF.js 4.7), MediaPipe Tasks, ORT-web, pdf.js,│    │ /api/fortune  → Anthropic (opt-in)    │
 │          docx, models (~120 MB), fonts (Prompt, OFL)            │    │ /api/tryon    → Replicate (opt-in,    │
 │ camera → in-memory frames → detections → numbers               │    │               licence-gated)          │
 │ storage: localStorage / sessionStorage / IndexedDB (per origin) │    └────────────────────────────────────────┘
 └───────────────────────────────────────────────────────────────┘
```

## 1. Modules

### Platform layer (shared; type-checked with `npm run typecheck`)

| File | Global | Responsibility |
|---|---|---|
| `nav.js` | `LENSIQ_BRAND`, `LQModels` | Site header and menu (data-driven `MENU`), TH/中文 switch, injects `lensiq-i18n.js` and `i18n/zh-common.js`, Thai word-break rewriting (`Intl.Segmenter` with a loanword list), model-download notice, service-worker registration |
| `lensiq-i18n.js` | `LQI18N` | Dictionaries, `t()` / `tf()`, `data-i18n` / `data-i18n-attr` application, MutationObserver while Chinese is active, `lq-lang` event, `coverage()` and the `?i18n=debug` overlay |
| `i18n/zh-common.js` | (queue) | Chinese for nav, footer, common buttons, model notice, vault states, PDPA texts and the landing page |
| `lensiq-facevault.js` | `LQVault` | AES-GCM-256 encrypted face-descriptor storage with a non-extractable key in IndexedDB; split meta/vault records; retention expiry; wipe |
| `lensiq-agg.js` | `LQAgg` | Daily aggregate "pack" schema v1 (`cleanPack`), builds packs from store days, merges multi-device days, local cache. Must stay in sync with `server.py clean_agg`. |
| `sw.js` | (service worker) | Cache-first for same-origin `vendor/` GETs only; versioned cache `lq-models-vN` |
| `styles.css` | n/a | Theme tokens, header, self-hosted `@font-face`, Thai/CJK font stacks, shared components |
| `home.js`, `home.css`, `index.html` | n/a | Landing page: hero canvas, demo-request form (stored locally only) |

### Vision and analytics helpers (camera team)

| File | Global | Responsibility |
|---|---|---|
| `lensiq-camera.js` | `LQCam` | Camera factory, multi-camera hub (up to 4), inference scheduler |
| `lensiq-detect.js` | `LQDetect` | TF.js backend chain (webgl → wasm → cpu), COCO-SSD loader |
| `lensiq-track.js` | `LQTrack` | Multi-object tracker (pure maths) |
| `lensiq-hand.js` | `LQHand` | MediaPipe Hands (TF.js lite) pipeline |
| `lensiq-stats.js` | `LQStats` | Robust statistics for the dashboard (no DOM) |
| `lensiq-i18n-rt.js` | n/a | Run-time Chinese for text that page scripts write in Thai (camera pages) |
| `insights-*.js` | `LQInsights*` | Dashboard data, analysis, cards, charts, demo data, UI |
| `fortune-ai.js`, `fortune-kit.js`, `*-kb.js` | `LQFortune`, `LQKit` | Fortune engines: local composer, AI relay client, knowledge bases |
| `studio-core.js`, `photobooth-*.js` | `StudioCore`, `PB*` | Image processing for the studio and photobooth (typed arrays, no WebGL) |

### Pages

There are 26 pages. Each loads `styles.css`, `nav.js`, its own `<page>.css/.js` and an optional `i18n/zh-<page>.js`.
The README has the module table. The groups are marketing (neuro, signage, customers, booth), fortune (fortune, faceread,
palm, horoscope, tarot, fengshui, numbers, iching, zodiac, astro, dream), analytics (store, insights), photo (photobooth,
studio), and extra systems (cameras, checkout, attendance, qc, driver, converter).

### Server (`server.py`, `pdfconvert.py`, `tryon.py`)

| Endpoint | Purpose | Default |
|---|---|---|
| `GET /…` | Static files, with a deny-list (`*.py`, `data/`, `certs/`, `tests/`, `tools/`, dotfiles …) | on |
| `/api/agg/*` | Multi-device hub. Pairing code, bearer tokens stored as SHA-256 hashes, numbers-only schema, 62 days in `data/agg.json` | on (LAN only) |
| `POST /api/convert`, `GET /api/convert/status` | PDF → DOCX. Engine `permissive` (pdfplumber + python-docx, MIT). `pdf2docx` (AGPL) is opt-in. | on |
| `POST /api/fortune`, `GET /api/fortune/status` | Rewrites derived fortune facts with Claude. Needs `consent: true`. | off without `ANTHROPIC_API_KEY` |
| `POST /api/tryon`, `GET /api/tryon/status` | Replicate try-on. Needs token + model + `LENSIQ_TRYON_LICENSE` + `consent=yes`. | off |

## 2. Data flow

1. **Camera → numbers.** `getUserMedia` frames go to an off-DOM canvas, then to the detector (face-api / COCO-SSD /
   MediaPipe / ORT), then to the tracker and page logic. The output is numbers (counts, dwell, expressions). Frames are
   never stored or sent.
2. **Identity (opt-in, consent).** customers and attendance compute 128-D descriptors, which go to `LQVault.splitSave`.
   The encrypted envelope goes to `lqv-*` in localStorage, the key stays in IndexedDB `lensiq-vault`, and the readable
   meta goes to `cx-members` / `att-people`.
3. **Multi-device.** On a node, `store.js` passes the day to `LQAgg.packFromDay`, then `POST /api/agg/push` (bearer
   token). The hub runs `clean_agg`, stores the result in `data/agg.json`, answers `GET /api/agg/day`, and
   `LQAgg.cacheFromServer` / `mergeDay` produce the merged dashboard.
4. **Dashboard.** `insights-data.js` reads every module's keys from localStorage. The results are analysed and
   rendered locally. Backup and restore use a JSON file that excludes `lqv-*` and the hub token.
5. **Cloud AI (opt-in).** fortune sends derived facts to `/api/fortune`, then on to Anthropic. try-on sends a photo
   to `/api/tryon`, then on to Replicate. Both are consent-gated in the page **and** on the server.

## 3. Storage keys

The complete list, with retention and delete procedures, is in [`pdpa/retention-table.md`](pdpa/retention-table.md).
Prefixes are owned per module so that "clear" buttons can remove their own data:

| Prefix | Owner | | Prefix | Owner |
|---|---|---|---|---|
| `lq-` (`lq-lang`, `lq-leads`, `lq-agg`, `lq-camcap`, `lq-i18n-debug`) | platform | | `st-` | store |
| `lqv-` (encrypted vault envelopes) | `lensiq-facevault.js` | | `booth-` | booth |
| `cx-` | customers | | `att-` | attendance |
| `sg-` | signage | | `nm-` | neuro |
| `dr-` | driver | | `co-` | checkout |
| `qc-` | qc | | `pb-` | photobooth / studio |
| `iq-` | insights | | `fr- palm- hs- tarot- fs- ic- zd- as- dm- fa-` | fortune pages |

The IndexedDB databases are `lensiq-vault` (keys), `sg-media`, `co-checkout`, `lensiq-qc` and `pb-templates`. The
Cache Storage is `lq-models-vN`.

## 4. Internationalisation

- Thai is the source of truth and lives in the markup and JS. Chinese comes from dictionaries:
  `i18n/zh-common.js` (shared), `i18n/zh-<page>.js`, and run-time dictionaries `i18n/zh-rt-*.js` used through
  `lensiq-i18n-rt.js`.
- `<html lang>` is `th` or `zh-Hans`. The CSS switches the font stack. Chinese uses OS CJK fonts, because no CJK web
  font is vendored (they are 5–20 MB).
- **Coverage.** `node tools/zh-coverage.mjs` reports, for all 26 pages, the visible Thai % in 中文 mode after the
  typical interactions. `--shared --max 0` gates the shared components. `?i18n=debug` outlines leftovers live.
  Content that should stay Thai is marked `lang="th"` or `translate="no"`.
- Details: [`I18N.md`](I18N.md).

## 5. Security model (summary; full threat model in `SECURITY.md`)

| Layer | Control |
|---|---|
| Browser | CSP `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, no inline scripts or handlers, **no third-party origins** (fonts are self-hosted; `tools/check-external.mjs`). The `<meta>` copy for GitHub Pages comes from `tools/csp-meta.mjs`. Text is set with `textContent`, and i18n never writes HTML. |
| Sensitive data | Face descriptors: AES-GCM-256 with a non-extractable key, AAD = storage key, enrolment only in a secure context, retention expiry, wipe destroys the key. No images are stored. |
| Server | Host allow-list (DNS rebinding), Origin / Sec-Fetch-Site checks (CSRF), LAN-only unless `LENSIQ_API_ALLOW_ANY`, per-IP rate limits, size and content-type limits, JSON errors without internals, static deny-list, security headers |
| Hub | Pairing code + per-device bearer tokens (hashed), lockout, strict numeric schema (unknown keys reject the whole pack), file mode 0600, 62-day cap |
| Cloud AI | Off by default; server-side consent checks; fortune never sends photos; try-on is licence-gated; provider error detail is logged, never returned |
| Supply chain | Exact Python pins (`requirements.txt`, permissive only); npm lockfile; everything vendored; licences in `LICENSES/THIRD_PARTY.md` |
| Privacy | No telemetry. PDPA pack in `docs/pdpa/` (filled DPIA, ROPA, consent texts, retention). |

## 6. Tooling and quality gates

| Command | What it checks | CI |
|---|---|---|
| `npm run lint` | ESLint flat config (bug-class rules) | yes |
| `npm run typecheck` | `tsc --checkJs` on the platform modules (`tsconfig.typecheck.json`, `types/lensiq-globals.d.ts`). `node tools/typecheck.mjs --report` gives per-file error counts for the other files. | yes |
| `npm run test:unit` | `node --test tests/unit` | yes |
| `npm run test:py` | Flask test client: guard, hub, security, licensing | yes |
| `npm run test:e2e` | Headless Chrome without WebGL: smoke, CSP, i18n, hub, privacy scans | yes |
| `node tools/csp-meta.mjs --check`, `node tools/check-csp.mjs` | CSP meta current; pages work under it | yes |
| `node tools/self-host-fonts.mjs --check`, `node tools/check-external.mjs --as-is` | No Google Fonts references; no third-party request on any page | yes |
| `node tools/zh-coverage.mjs --shared --max 0` | Shared components fully Chinese in 中文 mode | yes |
| `node tools/zh-coverage.mjs --json …` | Per-page Thai % report (artifact) | report |
| `node tools/check-lfs.mjs` | No Git LFS pointer files in place of binaries | yes |
| `node tools/mobile-audit.mjs` | 390 px layout report | report |

## 7. Conventions

- Pages are classic scripts that share globals, listed in `eslint.config.mjs` and `types/lensiq-globals.d.ts`. Pure
  logic is UMD (`module.exports` under Node), so it can be unit-tested without a DOM.
- Do not add a CDN, `<script>` from another origin, inline script or `on*=` handler. CSP blocks them, and CI fails.
- New storage keys use the owning module's prefix and are added to `docs/pdpa/retention-table.md`.
- New vendored files get a row in `LICENSES/THIRD_PARTY.md`. After the migration in `LFS-MIGRATION.md`, large
  binaries go to LFS.

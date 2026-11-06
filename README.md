# LENSIQ

LENSIQ is a set of computer-vision tools for marketing, store analytics, events and photo booths. The interface is in Thai. Every vision model runs **in the browser on the device**. Camera frames are never uploaded. A small, optional Flask server (`server.py`) adds LAN/HTTPS hosting, PDF to Word conversion, multi-device aggregation, and two opt-in cloud AI features.

- Live static demo: <https://anirut77.github.io/lensiq/>
- Licence of this repository's own code: MIT (see [`LICENSE`](LICENSE)). **Third-party models and libraries have their own terms.** Some are not cleared for commercial use. Read [`LICENSES/THIRD_PARTY.md`](LICENSES/THIRD_PARTY.md) before any paid deployment.

> Status: commercial pilot / demo quality. Age, gender and emotion estimates are probabilistic and can be wrong. All fortune-telling pages are entertainment only.

---

## Contents

1. [Modules](#modules)
2. [Architecture](#architecture)
3. [Deployment options](#deployment-options)
4. [Hardware and browser requirements](#hardware-and-browser-requirements)
5. [Privacy model](#privacy-model)
6. [Testing](#testing)
7. [Large model files / Git LFS](#large-model-files--git-lfs)
8. [Further documentation](#further-documentation)

---

## Modules

The site header (`nav.js`, `MENU`) and the "all systems" page (`cameras.html`) list every module. The page entry point is `index.html`.

### Marketing (การตลาด)

| Page | What it does | Models | Personal data kept |
|---|---|---|---|
| `neuro.html` Neuromarketing | Measures facial expression, attention and arousal while participants watch an ad or package. Up to 4 faces. Participant consent is required. | face-api tiny detector, 68 landmarks, expression | Numeric session series (`nm-sessions`). No images. |
| `signage.html` Smart signage | Counts viewers and dwell time in front of a screen and picks an ad by audience. Touch-free hand-gesture kiosk. Age/gender estimation only when the setting is enabled. | face-api (+ age/gender optional), MediaPipe hand landmarker / TF.js hand | Aggregate stats (`sg-stats`), ad images you upload (IndexedDB `sg-media`). |
| `customers.html` Customer recognition | Recognises **enrolled members who gave explicit consent**, then shows their usual and last orders and recommendations. | face-api detector, landmarks, recognition (128-D descriptor) | Name, phone, orders, **encrypted face descriptor**. Retention is selectable. |
| `booth.html` Booth analytics | Counts visitors, recognises repeat visitors anonymously **within the same day**, and measures dwell and engagement. Multi-camera. | face-api detector, landmarks, recognition, expression | Aggregate counts. Same-day anonymous descriptors are purged at midnight. |

### Fortune / entertainment (ดูดวงอัจฉริยะ)

`fortune.html` (hub), `faceread.html` (face reading), `palm.html` (palm reading), `horoscope.html` (Thai/Chinese/numerology from birth date), `tarot.html` (tarot and เซียมซี), `fengshui.html`, `numbers.html` (lucky numbers), `iching.html`, `zodiac.html`, `astro.html` (Western sun/moon/ascendant), `dream.html`.

**These pages are entertainment.** Readings come from **rule-based knowledge bases** (`*-kb.js`) using face landmarks, hand landmarks, dates, card draws or keywords. They are not scientific or predictive, and the pages say so. One part is optional: when the operator configures `ANTHROPIC_API_KEY` on `server.py` **and** the user ticks a consent box, the derived facts (never the photo) are sent to Claude to **reword** the rule-based reading (`fortune-ai.js`, `/api/fortune`). If the AI service is unavailable, the page falls back to the local composer.

### Analytics (วิเคราะห์)

| Page | What it does |
|---|---|
| `store.html` Store analytics | Counts people in and out across lines, measures occupancy, builds a heatmap, and tracks queue length and wait. Up to 4 cameras. Optional short-window appearance re-ID (MobileNet embedding, in memory only, off by default) suppresses double counts. Can act as a **hub** or **node** for multi-device aggregation. Models: COCO-SSD (person) and MobileNetV2. |
| `insights.html` Dashboard | Reads the other modules' local stats, adds statistics (trends, comparisons, goals, alerts) and exports reports. It uses no camera. Demo data is clearly tagged. |

### Photo booth (ตู้ถ่ายรูป)

| Page | What it does |
|---|---|
| `photobooth.html` | Sticker and ID-photo booth: frames, stickers, background replacement (MediaPipe selfie segmenter; MODNet for high quality), outfit templates. Optional AI virtual try-on via Replicate (server, consent). |
| `studio.html` | Outfit studio: fits a template outfit to neck and shoulders, cuts out the background (MODNet + guided filter), refines hair, matches light and colour, retouches skin, and exports ID photos. An optional face-parse model (off by default, see licence flags). |

### Supporting tools (ระบบเสริม)

| Page | What it does |
|---|---|
| `checkout.html` | Camera product recognition (teach-by-example on MobileNet) for self-checkout and stock counts. |
| `qc.html` | Production-line QC: fill level, cap and label checks with classical CV. Multi-lane. |
| `driver.html` | Driver drowsiness: eye closure (PERCLOS), yawns, nodding and looking away, with an audio alert. |
| `attendance.html` | Face check-in for training or seminars. **Explicit biometric consent** is required at enrolment. Encrypted descriptors. Retention is selectable. |
| `about.html` | About, privacy principles and open-source licence attributions (OFL / Apache NOTICE obligations), in TH and 中文. Linked from the landing-page footer. |
| `converter.html` | PDF to DOCX. Uses `server.py` (`/api/convert`, `pdfconvert.py`). The default engine is permissive (pdfplumber + python-docx, MIT) and keeps headings, bold, tables and page breaks. The AGPL layout-preserving engine is opt-in (`LENSIQ_CONVERT_ENGINE=pdf2docx`). Without a server, the page falls back to in-browser conversion. Files are processed in a temp dir and are not kept. |

---

### Languages

Thai is the default and Simplified Chinese (中文) is available through the **TH | 中文** switch in the header. The
choice is remembered as `lq-lang`, and `?lang=zh` overrides it. Shared UI (menu, footer, landing page, common buttons,
PDPA texts) is translated in `i18n/zh-common.js`; page dictionaries live in `i18n/zh-<page>.js`. See
[docs/I18N.md](docs/I18N.md).

## Architecture

```
Browser (all inference on-device)                         Optional server.py (Flask)
-------------------------------------------------         -------------------------------------------
TF.js 4.7 (bundled in face-api.js 1.7.12)                  static file host (+ CSP & security headers)
  backends: webgl -> wasm (SIMD/threads) -> cpu            /api/convert   PDF->DOCX (pdfplumber+python-docx; AGPL engine opt-in)
  face-api models, COCO-SSD, MobileNetV2, TF.js hands      /api/agg*      multi-device numeric aggregates
MediaPipe Tasks Vision (vendor/mediapipe, wasm)            /api/fortune   Claude rewrite (opt-in, consent)
  hand_landmarker.task, selfie_segmenter.tflite            /api/tryon     Replicate try-on (opt-in, consent)
onnxruntime-web 1.20.1 (wasm)
  MODNet portrait matting, optional BiSeNet face-parse
pdf.js 3.11.174, docx (client-side document helpers)
localStorage / IndexedDB  (per-browser, per-origin)
```

- **No build step.** Plain HTML, CSS and JS. Shared helpers: `lensiq-camera.js` (multi-camera hub), `lensiq-detect.js` (backend chain, COCO-SSD), `lensiq-track.js` (tracking), `lensiq-hand.js`, `lensiq-stats.js`, `lensiq-agg.js` (aggregate pack schema), `lensiq-facevault.js` (encrypted descriptors), `fortune-kit.js` / `fortune-ai.js`.
- **Everything is vendored** under `vendor/`, including the Prompt web font (`vendor/fonts/`, OFL). No page makes a request to any third-party origin: the CSP allows only `'self'`, and `node tools/check-external.mjs` checks this headless.
- **WebGL is optional.** Pages run on WASM or CPU (`?cpu` forces it). The MediaPipe segmenter is skipped without WebGL.
- **Service worker** (`sw.js`) caches `vendor/` models **cache-first** under a versioned cache name. Repeat visits and offline booths then do not re-download about 100 MB. Bump the version to roll out new models.
- **Content-Security-Policy.** `server.py` sends a strict CSP header (`script-src 'self' 'wasm-unsafe-eval'`, no inline scripts). On GitHub Pages, where headers cannot be set, an equivalent `<meta http-equiv="Content-Security-Policy">` is injected by `tools/csp-meta.mjs`.

---

## Deployment options

Browsers allow camera access only in a **secure context**: `https://` or `http://localhost`. Face enrolment (customers, attendance) also needs a secure context because descriptors are encrypted with WebCrypto.

### A. Static hosting (GitHub Pages or any static host)

Publish the repository root as-is. All camera modules, fortune pages (local composer) and the dashboard work. Not available: PDF conversion, `/api/agg` hub (use the file export/import fallback on `store.html`), AI fortune, and try-on, unless you point `window.LENSIQ_API_BASE` in `lensiq-config.js` at a separately hosted `server.py` (option D). The host must serve HTTPS.

### B. Local single machine

```sh
./start.sh            # creates .venv, installs requirements.txt, serves http://localhost:8000
```

### C. LAN hub for phones and tablets as camera nodes

```sh
./start.sh mobile     # HTTPS on 0.0.0.0:8443 with a self-signed cert (certs/, regenerated when the IP changes)
```

The terminal prints `https://<LAN-IP>:8443` and a **pairing code**. On the hub machine, open `https://localhost:8443/store.html` and go to "เชื่อมหลายเครื่อง" (connect multiple devices), then choose "เครื่องหลัก" (hub). On each phone, open `https://<LAN-IP>:8443/store.html`, choose "เครื่องลูก" (node), and enter the pairing code. Nodes push **numeric daily aggregates** every 15 s, queue them while offline, and retry. Each device must accept the self-signed certificate once. Use this mode only on a trusted network. See [`docs/DEPLOYMENT-CHECKLIST.md`](docs/DEPLOYMENT-CHECKLIST.md).

### D. `server.py` on the internet behind a reverse proxy (e.g. Render)

Run `python server.py` (or a WSGI server) behind TLS-terminating proxy. Environment variables (from the `server.py` docstring):

| Variable | Purpose |
|---|---|
| `LENSIQ_PORT`, `LENSIQ_MOBILE=1` | Port; mobile mode (HTTPS on 0.0.0.0 with `certs/`) |
| `LENSIQ_HOSTS` | Extra accepted `Host` names, comma-separated (DNS-rebinding guard). Set it to your API domain. |
| `LENSIQ_API_ALLOW_ANY=1` | Accept callers from public IPs. **Required** on internet hosts. The default is loopback/LAN only. |
| `LENSIQ_TRUST_PROXY=1`, `LENSIQ_PROXY_HOPS` | Take the client IP from `X-Forwarded-For` (counted from the right, default 1 hop) |
| `LENSIQ_ALLOW_ORIGIN` | Cross-origin caller allowed for `/api/fortune` (e.g. `https://<user>.github.io`) |
| `LENSIQ_API_ALLOW_ORIGIN` | Extra origins for `/api/convert`, `/api/tryon` (default same-origin) |
| `LENSIQ_API_RPM` 60, `LENSIQ_CONVERT_RPM` 6, `LENSIQ_TRYON_RPM` 4, `LENSIQ_FORTUNE_RPM` 10, `LENSIQ_FORTUNE_DAILY_MAX` 500 | Per-IP per-minute and daily limits |
| `LENSIQ_CONVERT_MAX_MB` 50, `LENSIQ_TRYON_MAX_MB` 20 | Upload size caps |
| `LENSIQ_CSP_CONNECT`, `LENSIQ_CSP=off` | Extra `connect-src` origins; disable CSP (debug only) |
| `LENSIQ_AGG_ALLOW_ANY`, `LENSIQ_AGG_ALLOW_ORIGIN`, `LENSIQ_AGG_RPM`, `LENSIQ_DATA_DIR` | `/api/agg` network scope, CORS, rate, storage dir (default `data/`) |
| `ANTHROPIC_API_KEY`, `LENSIQ_FORTUNE_MODEL` | Enable AI fortune rewrite. See [`AI-SETUP.md`](AI-SETUP.md). |
| `REPLICATE_API_TOKEN`, `REPLICATE_TRYON_MODEL`, `LENSIQ_TRYON_LICENSE`, `REPLICATE_TRYON_VERSION` | Enable AI try-on (`tryon.py`). All three of token, model and licence attestation are required, and there is no default model. See [`docs/TRYON-LICENSING.md`](docs/TRYON-LICENSING.md). |
| `LENSIQ_CONVERT_ENGINE` | `permissive` (default, MIT/BSD) or `pdf2docx` (AGPL/GPL, needs `requirements-agpl.txt`) |

`server.py` never serves `server.py`, `tryon.py`, `data/`, `certs/`, `logs/`, `tests/`, `.venv` or dotfiles. Every response carries CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: camera=(self)` and `X-Frame-Options`. See [`SECURITY.md`](SECURITY.md).

---

## Hardware and browser requirements

| Item | Minimum | Recommended |
|---|---|---|
| Browser | Chrome / Edge 110+, Safari 16.4+ (iOS 16.4+), Firefox 115+ (MediaPipe segmenter and some camera controls may be limited) | Current Chrome/Edge on a desktop or Android, current Safari on iPad |
| CPU / RAM | 4 GB RAM; any 2018+ laptop for a single camera | 8 GB+ RAM, Apple M-series or recent Intel/AMD i5/Ryzen 5 for 2–4 cameras or the studio |
| GPU | Not required (WASM/CPU fallback) | WebGL2 for higher frame rates |
| Camera | 640×480 @ 15 fps (used per camera when 2+ cameras are live) | 1280×720 (default for a single camera); USB webcam with fixed focus. IR camera for `driver.html` at night |
| Network | None after the first load (models are vendored and cached by the service worker) | LAN Wi-Fi for option C; HTTPS domain for permanent installs |

**Model download per module** (first visit, uncompressed on disk; the service worker caches them afterwards):

| Module(s) | Assets | Approx. size |
|---|---|---|
| Face pages (neuro, booth, customers, attendance, driver, faceread) | `face-api.js` 1.3 MB + tiny detector 0.2 MB + landmarks 0.35 MB + expression 0.32 MB + recognition 6.1 MB (recognition pages only) + TF.js wasm 0.3–0.4 MB | 2.5–8.5 MB |
| Signage | face set + age/gender 0.42 MB + MediaPipe wasm 9 MB + hand landmarker 7.5 MB | ~19 MB |
| Store | COCO-SSD 18 MB (+ MobileNetV2 13 MB if re-ID is on) | 18–31 MB |
| Checkout | MobileNetV2 13 MB | ~14 MB |
| Palm | TF.js hand detector + landmark 3.9 MB | ~5 MB |
| Photo booth | MediaPipe wasm 9 MB + selfie segmenter 0.25 MB + onnxruntime-web 11 MB + MODNet 25 MB | ~45 MB |
| Studio | onnxruntime-web 11 MB + MODNet 25 MB (+ optional face-parse 13 MB) | 36–49 MB |

Totals on disk: `vendor/models` 88 MB (including the git-ignored 13 MB face-parse model when present), `vendor/mediapipe` 18 MB, `vendor/ort` 11 MB, `vendor/tarot` 2.7 MB.

---

## Privacy model

Summary only. The operator's compliance pack is in [`docs/pdpa/`](docs/pdpa/README.md).

- **On-device processing.** Video frames are processed in memory in the browser. No page uploads images or video. The exceptions are the opt-in try-on and the PDF converter, and both send only what the user chooses.
- **No images stored** by the analytics modules. They store numbers: counts, dwell, hourly series and expression scores. Product and template images that the operator uploads (checkout, QC, signage, photobooth templates) stay in local IndexedDB.
- **Face descriptors** (128 numbers, not photos) are kept only for **enrolled, consenting** people (`customers.html`, `attendance.html`) and, in `booth.html`, for same-day anonymous repeat-visitor matching.
  - Encrypted with **AES-GCM 256** by `lensiq-facevault.js`. The key is a **non-extractable** WebCrypto key in IndexedDB `lensiq-vault`. The ciphertext is in localStorage, with the storage key as AAD. Clearing site data or the IndexedDB destroys the key, so remaining ciphertext becomes unreadable.
  - **Enrolment requires a secure context** (https or localhost). There is no plaintext fallback for new enrolments.
  - **Retention**: selectable 30 / 90 / 180 / 365 / 730 days since last seen (default 365). Expired descriptors are deleted on load. A "delete all face data" button wipes the ciphertext **and** its key. Booth descriptors are purged at the start of each day.
- **Multi-device `/api/agg`** accepts only a strict numeric daily schema: in/out, hourly series, zones, queue and per-camera counts, plus a device/zone name of up to 40 characters. Unknown keys, strings in numeric fields, and images are rejected. The server keeps **62 days** (`AGG_LIM.days_kept`) in `data/agg.json` (mode 0600). Device tokens are stored as SHA-256 hashes.
- **AI fortune (Claude, Anthropic, USA)**: off unless the server has a key **and** the user ticks consent. It sends only derived facts (e.g. face-shape element, palm line categories, card names) and an optional nickname. It never sends photos, real names, birth dates or contact details. Facts are not logged on the server. This is a cross-border transfer, and the consent text says so.
- **AI try-on (Replicate, USA)**: off unless the operator configures a token, a model **and** a licence attestation (`LENSIQ_TRYON_LICENSE`), **and** the user consents (`consent=yes` is checked server-side). Known non-commercial models (IDM-VTON and similar) are refused as `commercial`. It sends the person photo and garment image. Nothing is stored on the LENSIQ server.
- **No third-party requests**: the font is self-hosted. Nothing is fetched from Google or from any CDN.

---

## Testing

```sh
npm run test:unit   # node --test tests/unit           (pure JS, no browser)
npm run test:py     # Flask test client: /api/agg, API guard, CSP and headers
npm run test:e2e    # headless Chrome (no WebGL): smoke on every page, CSP, multi-device, studio, privacy scans
npm run lint
```

Requirements: Node 22+, Python 3 with `.venv` (`./start.sh` creates it), and Google Chrome. Details and per-file coverage are in [`tests/README.md`](tests/README.md). CI runs the same scripts on every push.

---

## Large model files / Git LFS

About 120 MB of binaries live in `vendor/`. For **new** repositories or forks, track them with Git LFS:

```sh
git lfs install
git lfs track "vendor/models/*.onnx" "vendor/models/*.task" "vendor/models/*.bin" "vendor/models/*.tflite" \
              "vendor/models/**/group1-shard*" "vendor/**/*.wasm"
git add .gitattributes
```

Caveats:

- **GitHub Pages "deploy from branch" serves the LFS *pointer* files, not their contents.** The models would then fail to load. If you adopt LFS, deploy Pages with GitHub Actions: `actions/checkout` with `lfs: true`, then `actions/upload-pages-artifact` and `actions/deploy-pages`.
- For **this** repository, follow [`docs/LFS-MIGRATION.md`](docs/LFS-MIGRATION.md): forward-only migration with no history rewrite, together with the Actions-based Pages deployment in `.github/workflows/pages-lfs.yml`. `node tools/check-lfs.mjs` (run before e2e and in CI) fails clearly if a checkout holds LFS pointers instead of binaries.
- `vendor/models/faceparse-*.onnx` is git-ignored on purpose (licence not cleared). Do not commit it.

---

## Further documentation

| Document | Contents |
|---|---|
| [`SECURITY.md`](SECURITY.md) | Threat model, server hardening, reporting vulnerabilities |
| [`docs/pdpa/`](docs/pdpa/README.md) | PDPA pack: filled DPIA (TH + EN summary, needs legal review), ROPA, consent texts (TH/EN), retention table, data map |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modules, data flow, storage keys, i18n, security model, tooling |
| [`docs/PILOT-PLAN.md`](docs/PILOT-PLAN.md) | How to run a store pilot: labelled footage, accuracy acceptance criteria |
| [`docs/SUPPORT.md`](docs/SUPPORT.md) | Support and SLA template |
| [`docs/ONE-PAGER-TH.md`](docs/ONE-PAGER-TH.md), [`docs/ONE-PAGER-ZH.md`](docs/ONE-PAGER-ZH.md) | Product one-pagers (Thai / Chinese) |
| [`docs/TRYON-LICENSING.md`](docs/TRYON-LICENSING.md) | Commercial licensing of try-on models and the PDF engines |
| [`docs/LFS-MIGRATION.md`](docs/LFS-MIGRATION.md) | Step-by-step move of `vendor/` binaries to Git LFS (no history rewrite) |
| [`docs/DEPLOYMENT-CHECKLIST.md`](docs/DEPLOYMENT-CHECKLIST.md) | Operator checklist from install to decommission |
| [`LICENSES/THIRD_PARTY.md`](LICENSES/THIRD_PARTY.md) | Third-party models, libraries and assets with commercial-use flags |
| [`AI-SETUP.md`](AI-SETUP.md) | Enabling Claude fortune rewrite and Replicate try-on |
| [`CHANGELOG.md`](CHANGELOG.md) | Release history |
| [`tests/README.md`](tests/README.md) | Test suites |

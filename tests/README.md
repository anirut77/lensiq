# LENSIQ tests

Needs Node 22+, `python3` and Google Chrome. `npm ci` is only needed for `npm run lint` (ESLint).

| Command | What |
|---|---|
| `npm run test:unit` | `node --test tests/unit/*.test.js` (all unit files, including ones not listed in `index.js`) |
| `npm run test:py` | server tests with the repo `.venv` |
| `npm run test:e2e` / `test:e2e:ci` | headless Chrome; `:ci` re-runs a failing file once (`--retry=1`) |
| `npm run lint` | ESLint flat config (`eslint.config.mjs`): undefined names, duplicate keys, unreachable code |
| `node tools/csp-meta.mjs [--check]` | insert/update the CSP `<meta>` in every page (idempotent) / verify |
| `node tools/check-csp.mjs [--as-is]` | every page in headless Chrome under the Pages `<meta>` policy (injects it on the fly unless `--as-is`) |
| `node tools/mobile-audit.mjs [--lang zh] [--json f] [--selftest]` | 390 px phone audit per page: overflow, targets < 44 px, text < 12 px, mid-word Thai breaks |

CI (`.github/workflows/ci.yml`) runs lint, unit, csp-meta `--check`, Python (3.11, pinned `requirements.txt`),
the mobile-audit self-test, e2e with one retry, check-csp and a mobile-audit JSON artifact. Chrome comes from
`browser-actions/setup-chrome` (`LQ_CHROME`); `cdp.mjs` also finds `/usr/bin/google-chrome`/`chromium` and adds
`--no-sandbox` when `CI` is set.

## Unit tests (pure JS, no browser)

```sh
node --test tests/unit            # or: node --test "tests/unit/*.test.js"
```

`agg.test.js` covers `lensiq-agg.js` (pack schema allowlist, `packFromDay`, `mergeDay`, cache merge) and its use in
`insights.js`. Covers `lensiq-track.js` (bit-for-bit parity with `store.js` `updateTracker`, Hungarian `lsa` vs brute force,
crossing paths, lost-track pool, `assignUnique`, `createConfirm`, `pickPrimary`, `snapshot` privacy),
`lensiq-camera.js` pure helpers + scheduler, and `lensiq-detect.js` `decodeCoco` parity with `store.decodePersons`.
`studio.test.js` covers `studio-core.js` (สตูดิโอแต่งชุด): guided filter vs brute force, matte refinement, foreground
estimation, Reinhard transfer, Laplacian blend seam continuity, TPS anchors, silhouette shoulders, skin smoothing mask
isolation, grain, composite ordering (head over collar, original clothes hidden).

## Server (Python, Flask test client)

```sh
.venv/bin/python -m unittest discover -s tests/python -v
```

`test_agg.py` covers the multi-device `/api/agg*` endpoints in `server.py`: pairing code only on loopback, join/push/get,
token-derived node id, wrong-code lockout, rotate/revoke, LAN-only remote address, Host/Origin checks (no CORS wildcard),
rate limit, strict numeric schema (unknown keys, strings, images rejected) and that `data/` is never served.
`test_security.py` covers the static deny list (source, tools, certs, data, dot-paths), JSON errors without internals,
try-on provider details never returned, the Replicate token only sent to `api.replicate.com`, https-only result URLs,
malformed env values, and exact version pins in `requirements.txt`.
`test_api_guard.py` covers the shared guard on `/api/convert`, `/api/tryon`, `/api/fortune`: Host (DNS rebinding), Origin /
`Sec-Fetch-Site` (CSRF), LAN-only remote address + `LENSIQ_API_ALLOW_ANY`, `X-Forwarded-For` hops, per-IP rate limits,
size and content-type limits, try-on image checks, a Render-style deployment, and the CSP / security headers on every response.

## End-to-end (headless Chrome, no WebGL)

```sh
node tests/e2e/run.mjs            # all *.e2e.mjs
node tests/e2e/run.mjs hub        # only files whose name contains "hub"
node tests/e2e/run.mjs agg csp    # several filters
node tests/e2e/run.mjs --retry=1  # re-run a failing file once (LQ_RETRY=1); LQ_FILE_TIMEOUT=ms per file (default 900000)
LQ_BASE=http://127.0.0.1:8000 node tests/e2e/run.mjs   # reuse a running server
LQ_CHROME=/path/to/chrome node tests/e2e/run.mjs       # other Chrome binary
```

- `run.mjs` serves the repo with `python3 -m http.server` on 127.0.0.1 (random port) and runs each file.
- `cdp.mjs` is a tiny DevTools-protocol client. Chrome starts with `--headless=new --disable-gpu --disable-webgl
  --disable-3d-apis` and a throw-away profile in the OS temp dir. No screenshots or files are written to the repo.
- `fake-cams.js` is injected before page scripts. It fakes up to 4 cameras (`window.__LQ_FAKE_CAMS = {n, mode}`;
  modes `ok`, `muteOthers`, `throwOthers`) and adds `window.__LQ_FAKE.unplug(id)` and `window.__LQ_FAKE_DET(key, now)`.
  Each camera draws its own colour plus a white box at the scripted position.
- `smoke.e2e.mjs` opens every camera page with `?cpu` and fails only on uncaught exceptions. It also checks that
  WebGL is absent and that the TF.js backend is `wasm`.
- `agg.e2e.mjs` starts `server.py` itself (repo `.venv` python, random port, temp `LENSIQ_DATA_DIR`) and drives one hub and
  two node devices in isolated browser contexts (`newPage(url, {isolated: true})`): pairing, push, `pagehide` keepalive,
  offline queue + retry, insights totals, revoke; then the no-server fallback (export/import) under `http.server`.
  Skipped when `.venv/bin/python` is missing.
- `studio.e2e.mjs` runs `studio.html?cpu` on a synthetic canvas portrait: MODNet matte, fit, blend, retouch, brush,
  handle drag, PNG garment template (IndexedDB), PNG/JPEG/ID/4x6 export, fake-camera capture, overflow 390/1280, privacy.
- `csp.e2e.mjs` starts `server.py` and opens every page under its Content-Security-Policy, failing on any violation; it also
  starts TF.js wasm, MediaPipe, onnxruntime-web and the pdf.js worker under the policy. Skipped when `.venv/bin/python` is missing.
- `hub.e2e.mjs` builds a blank grid inside `/index.html` and drives `LQCam.createHub`: add/restore/scheduler/unplug,
  the capacity proof (`muteOthers`, `throwOthers` -> `CapacityError`, `lq-camcap.maxLive === 1`) and the privacy scan
  (no `data:image` or value over 200 KB in localStorage, no `/api/*` requests).
- `i18n.e2e.mjs` switches TH ↔ 中文 on `index.html` and `fortune.html` at 390 and 1280 px: Chinese applied (nav, hero,
  form, `<title>`, `<html lang>`), persisted across reload, Thai restored exactly, no overflow, no exceptions.

Unit additions: `i18n.test.js` (LQI18N API, persistence, queue, every nav/index key has Chinese, placeholders match),
`csp-meta.test.js` (idempotent on `tests/unit/fixtures/*.html`, CRLF, parity with server.py `_csp()`, lint, CLI `--check`),
`facevault.test.js` (secure-context refusal — no plaintext fallback, encrypt failure, opt-in legacy mode).

- `camera-mobile.e2e.mjs` opens every camera page at 390×844 (touch) and fails on controls smaller than 44×44 px (inline
  text links exempt), text below 12 px or horizontal scrolling.
- `face-insecure.e2e.mjs` simulates an insecure context (`isSecureContext = false`) on attendance/customers: enrolment is
  blocked with `LQVault.enrollBlockReason()`'s text and no face data is written.
- `qc-lanes.e2e.mjs`: the QC simulator clock is frame-paced (at most 70 ms of belt time per drawn frame), so a loaded
  machine slows the simulated belt instead of skipping the still phase; the waits are generous upper bounds.

## Accuracy benchmarks (real public footage, optional)

Not part of the normal test run: they need public datasets that are **never** committed (licences below) and take
10–40 minutes on WASM. Results and the method are published in [ACCURACY.md](../ACCURACY.md).

```sh
python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data          # mot lfw utk hagrid oceyes cew fer (pyarrow for lfw/oceyes, bsdtar for cew); outside the repo only
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/people.bench.mjs [--model yolox_nano_416|coco] [--split auto] [--fps 5] [--sweep] [--seq PETS] [--json out.json]
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face.bench.mjs   [--json out.json]   # LFW pairs + 1:N, UTKFace age/gender
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face1n.bench.mjs [--json out.json]   # 1:N round 4: full LFW (tuning) + CASIA-FaceV5 (Asian, held out)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/hand.bench.mjs   [--json out.json]   # HaGRID subset (hagrid/index.json)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver.bench.mjs [--json out.json]   # eye closure (EAR): oceyes (ODC-BY) + CEW
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver-session.bench.mjs [--minutes 10] [--json out.json]   # eye closure: calibrate on one LFW photo, drive on another (needs lfwfull + cew); alarms/min on simulated drives
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/neuro.bench.mjs  [--json out.json]   # expressions: FER-2013 sample (eval only)
node tests/bench/qc.bench.mjs       [--cond light] [--json out.json]   # synthetic bottles vs qc.js inspect (no data, ~15 min)
node tests/bench/checkout.bench.mjs [--n 60] [--json out.json]         # synthetic EAN-13/UPC-A/Code 128 vs BarcodeDetector
```

- Every script exits 0 with `skip …` when `LQ_BENCH_DATA` (or the dataset inside it) is missing.
- `lib.mjs` serves the repo plus the dataset folder (read-only, `/__data/`) and opens `tests/bench/bench.html` in headless
  Chrome without WebGL. `bench-page.js` calls the production code: `LQDetect.detectPeople` (YOLOX-Nano on ORT WASM, or COCO-SSD) / `LQDetect.embedBox` (store
  re-ID), face-api with the attendance/customers/signage options, `LQHand.createDetector().detect`.
- Tracking and counting run in Node through `store.js` `stepCam()` (the page's own per-frame function) on the browser
  detections; MOT17 frames are analysed at 10 fps, the rate the store page reaches on WASM.
- `metrics.cjs` (precision/recall/AP, CLEAR-MOT, IDF1, crossing events, TAR/FAR, 1:N) is unit-tested in
  `tests/unit/bench-metrics.test.js`. Detections are cached in `$LQ_BENCH_CACHE` (default `<data>/.lq-cache`).
- Licences: MOTChallenge CC BY-NC-SA 3.0 · LFW research use · UTKFace non-commercial research only · HaGRID CC BY-SA 4.0 · Open/Closed Eyes (AI-generated) ODC-BY 1.0 · CEW research use only, no redistribution · FER-2013 research use only (evaluation only).

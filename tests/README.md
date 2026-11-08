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
| `node tools/check-legal.mjs [--billing] [--dir _site]` | legal guard: fails on raw `[placeholder]` text in help / terms / privacy, and when billing is on (`LENSIQ_SELLER.sales_open`, `BILLING_ENABLED`, `FREE_MODE=false` or `--billing`) while seller details are missing |

CI (`.github/workflows/ci.yml`) runs lint, unit, csp-meta `--check`, Python (3.11, pinned `requirements.txt`),
the mobile-audit self-test, e2e with one retry, check-csp and a mobile-audit JSON artifact. Chrome comes from
`browser-actions/setup-chrome` (`LQ_CHROME`); `cdp.mjs` also finds `/usr/bin/google-chrome`/`chromium` and adds
`--no-sandbox` when `CI` is set.

## Unit tests (pure JS, no browser)

**Naming:** a test file is named after the feature it covers (`fortune-safety-lint.test.js`, `camera-accuracy.test.js`),
never after the agent round that added it; round history goes in `CHANGELOG.md`. `unit-index.test.js` fails on a new
`*-rN.test.js` file (the few round-named files still pending a feature name are listed there and may only shrink).
Round 11 renamed 7 files with every test kept (49 tests before = 49 after): face-r5 → face-gallery-calibration,
camera-r4 → camera-accuracy, fortune-r5 → fortune-safety-lint, fortune-r6 → fortune-topic-grounding, fortune-r10 →
fortune-facts-grounding, lifecal-r10 → lifecal-solar-terms, studio-r10 → studio-idphoto-outfit.

`i18n-integrity.test.js` (no Chrome, ~4 s): en/zh dictionaries have identical key sets, every `data-i18n` key has an
English and a Chinese entry, no stale Thai run-time key (its Thai text no longer occurs in any root *.js / *.html — a
Thai copy edit that orphans a translation fails here), template placeholders survive, no Thai left in en/zh values.

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
`creative.test.js` covers `creative-core.js` (Creative Lab): WCAG contrast, CIELAB + colour families, FFT vs naive DFT,
pop-out saliency (spectral residual, Itti-lite), priors, winner-take-all order, NSS/CC/AUC-Judd/AUC-Borji on hand-checked
maps, edge density/colourfulness/complexity, text-line detection + contrast grading, k-means palette, gaze targets,
findings/compare rules, and that every Thai string key has a 中文 entry (`i18n/zh-creative.js`).

`backend-*.test.js` cover the Cloudflare Worker in `backend/` (docs/BACKEND.md) on an in-memory D1 shim over Node's
built-in `node:sqlite` (`backend-d1-shim.js`, all migrations applied; no wrangler, no network, fake Anthropic SDK and fake
Opn API): admin auth (PBKDF2, TOTP RFC 6238 vectors, sessions, CSRF, Origin allowlist, lockout, rate limit, audit),
analytics validation (rejects PII-ish fields/values, consent, DNT/GPC), aggregation + CSV, retention purge + cron,
entitlements / FREE_MODE, VAT split, PromptPay checkout → webhook (signature, replay, re-fetch), AI proxy guards (consent,
size, allowlist, rate limits, per-domain switch, typed SDK error mapping, key never returned, prompt == server.py), and the
site integration (backend/ never published, CSP connect-src only when `LENSIQ_API_BASE` is set, opt-in client).
Run only these: `npm run test:backend`.

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
python3 -I tests/bench/fetch_datasets.py ~/lq-bench-data          # mot lfw utk hagrid oceyes cew fer mit1003 (pyarrow for lfw/oceyes, bsdtar for cew); outside the repo only
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/people.bench.mjs [--model yolox_nano_416|coco] [--split auto] [--fps 5] [--sweep] [--seq PETS] [--json out.json]
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face.bench.mjs   [--json out.json]   # LFW pairs + 1:N, UTKFace age/gender
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/face1n.bench.mjs [--json out.json]   # 1:N round 4: full LFW (tuning) + CASIA-FaceV5 (Asian, held out)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/hand.bench.mjs   [--json out.json]   # HaGRID subset (hagrid/index.json)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver.bench.mjs [--json out.json]   # eye closure (EAR): oceyes (ODC-BY) + CEW
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/driver-session.bench.mjs [--minutes 10] [--json out.json]   # eye closure: calibrate on one LFW photo, drive on another (needs lfwfull + cew); alarms/min on simulated drives
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/neuro.bench.mjs  [--json out.json]   # expressions: FER-2013 sample (eval only)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/creative.bench.mjs [--fit] [--limit N] [--json out.json]   # creative attention map: MIT1003 eye fixations, 300 tuning / 703 held out (eval only)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/studio.bench.mjs --render --sheets [--split dev|test] [--ids d01,t05] [--query wear=0.42,0.7]   # studio outfit renders on 62 public-domain portraits; review sheets stay in the cache (photos of people); stage 2 joins tests/bench/studio-labels.json (ACCURACY.md §11)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/studio.bench.mjs --variants plain,cover --log tests/bench/studio-gate-log-r10.json   # write the per-render gate log (no images); --only none renders just the no-outfit version (round 11)
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/photobooth.bench.mjs --render --log tests/bench/photobooth-gate-log-r11.json            # photo booth ID photo: outfit check + review-step findings per portrait (no images)
node tests/bench/studio-figures.mjs [--check]   # regenerate / verify StudioQA.FIGURES (the numbers studio.html quotes) from the labels + gate logs (CI: tests/unit/studio-figures.test.js)
node tests/bench/studio-tables.mjs [--check] [--json f]   # recompute every ACCURACY.md §11/§11b table from the committed labels + gate logs (no data, no browser; CI via tests/unit/studio-tables.test.js)
node tests/bench/qc.bench.mjs       [--cond light] [--json out.json]   # synthetic bottles vs qc.js inspect (no data, ~15 min)
node tests/bench/checkout.bench.mjs [--n 60] [--json out.json]         # synthetic EAN-13/UPC-A/Code 128 vs BarcodeDetector
LQ_BENCH_DATA=~/lq-bench-data node tests/bench/people.bench.mjs --seq PETS09,TUD --degrade dark:0.1 [--health] [--frame-drop 0.3] [--quick]   # robustness: camera-like degradation before detection + replay of the camera-health monitor (lensiq-sitecheck.js)
LQ_SOAK_VIDEO=/path/clip.mp4 node tests/bench/soak.mjs [--minutes 60] [--json out.json]   # long-run stability of store.html on WASM: retained heap, DOM nodes, listeners, rate (clip with people, never committed)
node tests/bench/soak.mjs --source fake --cams 4 --hours 8 [--real] [--hide-every 30 --hide-for 2 [--freeze]] [--sample-min 5] [--json f]   # round 12: multi-camera / overnight / hidden-tab soak (no data needed) with a drift report (heap & RSS slope, rate drift, DOM growth, hidden time injected vs recorded offline)
node tests/bench/results.mjs manifest [--content]   # round 12: tests/bench/results/manifest.json — per dataset "present" + file-list fingerprint, or "not reproducible here: datasets absent"; per bench whether it can be re-run here (benches update it when they find their data)
node tests/bench/results.mjs --check --strict        # fails while a customer-facing figure's datasets have no content fingerprint (use after re-running the benches)
node tests/bench/health-holdout.mjs --plan | <dir of people.bench --degrade JSONs> [--json f] | --selftest   # round 12: shipped camera-health thresholds scored on sequences NOT used to tune them (MOT17) vs PETS09/TUD
```

- **Committed result summaries (round 11):** `tests/bench/results/*.json` hold numbers only (never images or dataset
  files), the dataset fingerprints and the reproduce command. After a run: `node tests/bench/results.mjs record <bench>
  out.json` (fingerprints every dataset folder the bench reads: sorted path + size + sha256 of each file). Compare your
  copy with `node tests/bench/results.mjs hash`. `headlines.json` lists what the pages quote (from
  `docs/accuracy-figures.json`); its fingerprints are `null` with a note until the benches are re-run with `record`.
  `tests/unit/bench-results.test.js` validates the folder.
- **Customer-facing accuracy text** comes from `docs/accuracy-figures.json` only: edit it, run `node tools/accuracy-sync.mjs`
  (rewrites the Thai markup and the en/zh entries of cameras.html#accuracy and every acc-note banner); `--check` and
  `tests/unit/accuracy-figures.test.js` fail when a page disagrees, when a figure's evidence line has left ACCURACY.md, or
  when a known stale phrase comes back.
- Every script exits 0 with `skip …` when `LQ_BENCH_DATA` (or the dataset inside it) is missing.
- `lib.mjs` serves the repo plus the dataset folder (read-only, `/__data/`) and opens `tests/bench/bench.html` in headless
  Chrome without WebGL. `bench-page.js` calls the production code: `LQDetect.detectPeople` (YOLOX-Nano on ORT WASM, or COCO-SSD) / `LQDetect.embedBox` (store
  re-ID), face-api with the attendance/customers/signage options, `LQHand.createDetector().detect`.
- Tracking and counting run in Node through `store.js` `stepCam()` (the page's own per-frame function) on the browser
  detections; MOT17 frames are analysed at 10 fps, the rate the store page reaches on WASM.
- `metrics.cjs` (precision/recall/AP, CLEAR-MOT, IDF1, crossing events, TAR/FAR, 1:N) is unit-tested in
  `tests/unit/bench-metrics.test.js`. Detections are cached in `$LQ_BENCH_CACHE` (default `<data>/.lq-cache`).
- Licences: MOTChallenge CC BY-NC-SA 3.0 · LFW research use · UTKFace non-commercial research only · HaGRID CC BY-SA 4.0 · Open/Closed Eyes (AI-generated) ODC-BY 1.0 · CEW research use only, no redistribution · FER-2013 research use only (evaluation only).

`tests/unit/commercial-r11.test.js` + `tests/e2e/commercial.e2e.mjs` (round 11): report deliverables (`report.js` builders,
saved copy accepted by the Worker's `cleanSaved`, redeem = `entitlements/use` before the report, then `saved`), `lensiq-leads.js`
(`/v1/leads`, mailto / LINE fallback), the `LENSIQ_SELLER` config + `check-legal`, member `CAUTION_RE` kept in sync with
`fortune-ai.js`, renewal reminder, quota upsell card, sign-in dialog focus / footer, SLA cards at 360 px.

`tests/unit/commercial-collateral.test.js` (+ `commercial.e2e.mjs`, `products.e2e.mjs`): pricing `DRAFT` ↔ migrations 0003/0006
drift, one description of the basic report (3 systems), CSV labelled free on-device, the deeper basic report (deep-dive /
next 3 months / 4-week plan, saved copy keeps the plan first), the on-device lead queue (`lq-leads`), the owner go-live
checklist (`lensiq-golive.js`, `help.html?owner=1`, same list in `check-legal`), product one-pagers (contact + print),
collateral wording and the privacy §9 storage rows.

## Code-quality gates (round 12)

- **Size budget** — `max-lines` is an ESLint error: 1500 code lines per file; the existing monoliths are capped at their
  size in `eslint.config.mjs` `SIZE_CAPS`. `tests/unit/size-budget.test.js` fails when a cap has more than 5 % slack
  (lower it when a file shrinks) or when a capped file falls under 1500 (delete its entry). Never raise a cap: split
  pure logic into a module behind the existing global.
- **Type checking** — `npm run typecheck` (gate) and `npm run typecheck:report` (per-file counts). Page scripts whose
  top-level names collide with another page's (`$`, `video`, `mode`) go in `tsconfig.typecheck.json` "pages" and are
  checked in their own program (`photobooth.js` + `types/lensiq-photobooth.d.ts`). Files in "strictNull" must also pass
  with `strictNullChecks`. CI's `TYPECHECK_MAX` ratchet may only go down.
- **Format** — `npm run format:check` (`tools/format-check.mjs`): only lines a change adds are checked against
  `.editorconfig` (LF, spaces, no trailing whitespace, ≤ 200 characters; 160 is reported as a note). `--selftest`
  checks the detector. Fails pull requests; warns on pushes to `main`.
- **Test names** — unit files are named after the feature (`backend-fulfilment-refunds.test.js`, `stats-tails-forecast`),
  never the round (`unit-index.test.js`). Round 12 renamed backend-billing-r10, backend-r11, camera-r11, stats-r10,
  stats-r11 and studio-r11 (every test kept); `commercial-r11` is the last pending one.
- **Hooks** — `tests/unit/fortune-hooks.test.js`: `FortuneAI.registerHooks` gives the same page in either script load
  order (see docs/ARCHITECTURE.md §8).
- **Phone states** — `node tools/mobile-audit.mjs --states --width 360 --lang th|en|zh --strict` (CI) audits the open
  drawer, compact language menu, sign-in dialog, guest and full readings, signed-in account page and its error state,
  with the mocked API Worker exported by `tests/e2e/member.e2e.mjs`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens one grouped minor/patch PR per ecosystem each Monday. Semver-major bumps of
`typescript`, `eslint` / `@eslint/js`, `wrangler`, `anthropic` and `numpy` are ignored: upgrade those by hand in a
branch (`npm run typecheck`, the `TYPECHECK_MAX` ratchet, `npm run test:py` and `npm run test:integration` green), then
merge. A round is done when CI is green on the pushed commit, not before.

### Round 14 tests (crowd, exam clip, case review, medicine, OMR, planner, lucky colour)

- Unit: `crowd.test.js` (line crossing agrees with store.js, compaction + 60-day prune), `exam-clip.test.js` (default
  OFF, encrypted store, auto-delete, PIN, no emotion API / model name in any exam file), `case.test.js` (hash chain,
  replay, crafted imports, match states, ledger), `med.test.js` + `backend-med.test.js` (registration numbers, ≥ 3
  candidates or none, emergency wording, Thai marks kept, Worker guards, hashed cache key, worker entry routing),
  `omr.test.js`, `planner.test.js` (good days only, no storage / network), `luckycolor.test.js`.
- E2e: `crowd.e2e.mjs`, `exam-clip.e2e.mjs`, `case-review.e2e.mjs`, `medicine.e2e.mjs`, `omr.e2e.mjs`,
  `planner.e2e.mjs`, `luckycolor.e2e.mjs` (320 / 360 / 390 px, 0 % Thai in en / zh, no images or `/api/` leaving the
  page). `smoke`, `camera-mobile` and `i18n-camera` list the new pages; `i18n.e2e.mjs` checks that the desktop menu fits
  one line at 1100–1440 px in TH / EN / 中文 and that the drawer keeps the full group names.

### Round 13 tests (Exam, Gate, employee time attendance, zones)

- Unit: `exam.test.js`, `exam-i18n.test.js` (Exam logic + 0 % Thai in en/zh), `attendance-timeclock.test.js` (shifts, OT,
  holidays, leave, corrections hash chain), `gate-plate.test.js`, `gate-rules.test.js`, `promptpay.test.js` (plate
  format / look-alike matching, fee rules, PromptPay payload + CRC), `zones.test.js`, `solutions.test.js`.
- E2e: `exam.e2e.mjs`, `exam-lab.e2e.mjs`, `exam-hall.e2e.mjs`, `exam-dashboard.e2e.mjs` (shared helper `exam-kit.mjs`,
  not a test file), `attendance-hr.e2e.mjs`, `gate.e2e.mjs`, `gate-parking.e2e.mjs`, `gate-village.e2e.mjs`,
  `queue.e2e.mjs`, `tables.e2e.mjs`, `afterhours.e2e.mjs`, `bays.e2e.mjs`, `solutions.e2e.mjs` (shared helper
  `zones-lib.mjs`). Each checks 320 / 360 / 390 px (no overflow, 44 px targets, text >= 12 px), 0 % Thai in en / zh,
  and that no images or `/api/` requests leave the page. `smoke`, `camera-mobile` and `i18n-camera` also list the new
  camera pages; `products.e2e.mjs` checks the new-product-lines chooser on index.html.

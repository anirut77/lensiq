# LENSIQ tests

Nothing to install. Needs Node 22+, `python3` and Google Chrome.

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
`test_api_guard.py` covers the shared guard on `/api/convert`, `/api/tryon`, `/api/fortune`: Host (DNS rebinding), Origin /
`Sec-Fetch-Site` (CSRF), LAN-only remote address + `LENSIQ_API_ALLOW_ANY`, `X-Forwarded-For` hops, per-IP rate limits,
size and content-type limits, try-on image checks, a Render-style deployment, and the CSP / security headers on every response.

## End-to-end (headless Chrome, no WebGL)

```sh
node tests/e2e/run.mjs            # all *.e2e.mjs
node tests/e2e/run.mjs hub        # only files whose name contains "hub"
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

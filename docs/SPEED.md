# Page speed on a mid-range phone (speed pass, owner order 2026-11-14 C)

**Source of every number here: synthetic, emulated mid-range phone** (headless Chrome on the shared Mac, CDP throttling).
No number here is from a real phone. Real-phone checks stay in [`docs/owner-checklists/`](owner-checklists/README.md).

Locked test set: `evals-locks/speed.sha256` (copy of `~/LENSIQ-field/evals/speed/locked.sha256`), written before any
product change of this pass (entry 1: tests + tool; entry 2: budgets from the measured baseline).

## Profile

`tools/perf-measure.mjs` (locked), one Chrome, pages one after the other:

| Setting | Value |
|---|---|
| CPU | `Emulation.setCPUThrottlingRate` 4 (4x slower than the host CPU) |
| Network | Chrome DevTools "Fast 3G": 1.44 Mbit/s down (180,000 B/s), 675 kbit/s up (84,375 B/s), 562.5 ms round trip |
| Screen | 390 x 844 CSS px, DPR 1, mobile, touch |
| Cache | cold: own browser context per run, HTTP cache off, service workers bypassed |
| Action | none: what is fetched is fetched before the user opens a camera or does anything |
| Runs | 3 per page, median reported; a run is cut at 60 s ("> 60") |

Measured per run: bytes transferred (sum of `encodedDataLength`), requests, first contentful paint (paint timing), load
event, TTI (approximation: end of the last long task of 50 ms or more, once 5 s passed without one; never earlier than FCP
or DOMContentLoaded), JS heap in use at the end (`Performance.getMetrics` `JSHeapUsedSize`), and every model-like request.
Bytes and requests are also measured without throttling (they do not depend on the profile or the machine load).

**Machine load.** The Mac is shared with other teams. Coordinator order 2026-11-14: timings only while the 1-minute load
average is below 20; the load average is recorded after each page. A first throttled baseline taken at load 30 to 460
was discarded (kept as `baseline/throttled.DISCARDED-load-over-20.*` in the field folder, not used anywhere).

## Pages that downloaded models before the camera opened (baseline origin/main 4413bc3)

Found by the unthrottled pass (every root page, no user action) and confirmed by the locked test
`tests/e2e/speed-models.e2e.mjs`, which fails on the baseline for exactly these 5 pages and passes after the change
(82 / 82 checks, 2026-11-14):

| Page | Fetched at page load, before any camera | Now |
|---|---|---|
| studio | MODNet (25 MB) + Selfie Multiclass + face-api detector / landmarks + both WASM runtimes (45.2 MB in all) | on camera open or the first photo; the status lines say "loads when you open the camera or choose a photo"; the first photo waits for them with a busy line |
| booth | face-api detector, landmarks, recognition + TF.js WASM (7.3 MB) | on the first camera start ("เริ่มกล้อง") |
| palm | hand detector + landmarks + TF.js WASM (4.4 MB) | on camera open or photo upload |
| faceread | face-api detector + landmarks + TF.js WASM (1.0 MB) | on camera open or photo upload |
| checkout | MobileNetV2 + TF.js WASM (14.2 MB), started before the page opened its camera | after the camera is open |

Pages that open the camera by themselves at load (attendance, customers, driver, photobooth) fetched their models in
parallel with the camera start. They now start the download only after the camera is open. On attendance, customers and
driver a refused or missing camera downloads nothing; photobooth still loads its models after a refused camera, because
photo upload needs them. Their bytes with an allowed camera are unchanged (the camera opens by itself).
**Decision for the owner (not changed here):** attendance is "PIN / QR by default, face optional", yet it opens the
camera and downloads 7.3 MB of face models on every visit; photobooth downloads 37 MB the same way. Making the camera
wait for a tap would cut that to zero for PIN / QR users, but it changes what users see, so it is left for the owner.

While the models download, every changed page shows a loading line (TH / EN / ZH): checked by the locked test
(network slowed to 1 MB/s, the page must show "กำลังโหลด" / "กำลังเตรียม" while the model requests run).

## Other changes (no feature removed)

- One `?v=` per file: 17 files (20 after merging main) were loaded with two different cache keys on different pages (for example
  `lensiq-camera.js` v2 / v4 / v5, `lensiq-detect.js` v2 / v4 / v5, `nav.js` v15 / v16, `styles.css` v12 / v13). A phone
  downloaded the same file twice when moving between pages, and the older key could serve a stale copy. Every page now
  uses the highest key; every changed file got a new key. `tools/cat-pages.mjs` follows (`solutions.css` v2,
  `styles.css` v13).
- Checked, nothing to fix: no library is loaded twice on any page (face-api.js bundles TF.js; the two exam pages load
  TF.js alone); images that are not visible at load are already `loading="lazy"` (tarot cards) or built on demand.
- Not done (bigger, not "safe"): camera pages still load face-api.js (1.3 MB) and the ONNX runtime as script tags before
  the camera opens, and every page loads its Chinese dictionaries even in Thai. Moving those behind the camera / the
  language switch is the next speed step (estimated 1.3 MB less on 20 camera pages; 50 to 250 KB less on most pages).

## Budgets (locked)

`tests/e2e/speed-budget.e2e.mjs`: every page, cold, no user action, unthrottled (bytes and requests do not depend on
the profile): bytes <= budget and requests <= budget. Budget = baseline x 1.10 (KB up to the next 10, requests up), from
`~/LENSIQ-field/evals/speed/baseline/bytes.json` (3 runs per page, identical to the KB). The 10 % covers text edits other
teams make in parallel. A budget may only be lowered. Lowered 2026-11-15 to lock in the measured gain: studio 2,550 KB, booth 2,260 KB,
palm 3,390 KB, faceread 3,650 KB (measured after-weight x 1.10, same rounding).

## Before / after per page

Before = origin/main 4413bc3 (2026-11-14). After = speed-pass d78ba51 (includes the other teams' work merged from main
in parallel: consistency-pass, beauty-look, org-p1, stale-docs, pc-jk; a few KB on most pages come from them).

- **Bytes / requests** (all 73 pages): cold, no user action, unthrottled. Before: Mac, 3 runs, median
  (`baseline/bytes.json`, the 3 runs agreed to the KB). After: CI `ubuntu-latest` run 43611756050 (`speed-budget`
  output, `after-bytes-ci-43611756050.json`). `*` = the run was cut at 60 s (checkout: MobileNetV2 still downloading).
- **Model KB at load** = model files fetched before the camera opened in the baseline (0 after on every page: locked).
- **Timings** (FCP, load event, TTI, JS heap): the emulated mid-range phone profile above, 3 runs each side, median,
  interleaved before / after on the same page, each run kept only when the 1-minute load average stayed below 20 during
  it; "Load avg" = the highest load seen in the kept runs. "> 60" = the network was never idle for 2 s within 60 s.
  **Timed: 32 of 73 pages.** The other 41 were not timed: the shared Mac stayed at load 20 to 25 for the rest of the
  session (coordinator rule: no timings at load >= 20). `~/LENSIQ-field/evals/speed/timings.jsonl` holds every kept run;
  the driver resumes where it stopped. The first 21 rows were timed against an earlier after-snapshot (da4c3fd, before
  the consistency-pass merge); the code of those pages differs from d78ba51 only by the other teams' merges.

| Page | KB before → after | Requests | Model KB at load | FCP s | Load s | TTI s | JS heap MB | Load avg |
|---|---|---|---|---|---|---|---|---|
| about | 264 → 267 | 13 → 13 | 0 | 1.9 → 1.8 | 3.4 → 3.4 | 3.0 → 3.0 | 1.2 → 1.1 | ≤ 2.3 |
| account | 363 → 369 | 18 → 18 | 0 | 1.9 → 1.9 | 5.3 → 5.3 | 5.3 → 5.3 | 1.3 → 1.3 | ≤ 2.3 |
| admin | 629 → 631 | 15 → 15 | 0 | 1.3 → 1.3 | 11.6 → 11.6 | 11.6 → 11.6 | 1.3 → 1.3 | ≤ 2.5 |
| afterhours | 1850 → 1854 | 27 → 27 | 0 | 1.9 → 1.9 | 19.1 → 19.1 | 19.0 → 19.1 | 3.6 → 3.6 | ≤ 5.2 |
| astro | 1451 → 1457 | 33 → 33 | 0 | 1.9 → 1.9 | 17.1 → 17.1 | 17.1 → 17.1 | 2.6 → 2.6 | ≤ 5.1 |
| attendance | 9479 → 9482 | 42 → 42 | 7277 | 4.0 → 4.0 | 26.6 → 26.3 | > 60 → > 60 | 3.7 → 3.7 | ≤ 5.5 |
| bays | 1851 → 1854 | 27 → 27 | 0 | 2.0 → 1.9 | 19.0 → 19.2 | 19.0 → 19.2 | 3.6 → 3.6 | ≤ 4.9 |
| bazi | 1289 → 1295 | 32 → 32 | 0 | 2.0 → 2.0 | 16.0 → 16.0 | 16.0 → 16.0 | 2.4 → 2.4 | ≤ 4.2 |
| booth | 9322 → 2049 | 36 → 29 | 7277 | 2.0 → 2.4 | 21.3 → 21.6 | > 60 → > 60 | 3.5 → 3.2 | ≤ 5.0 |
| camera-notice | 349 → 352 | 18 → 18 | 0 | 1.9 → 1.9 | 4.1 → 4.0 | 4.1 → 4.0 | 1.3 → 1.3 | ≤ 4.1 |
| cameras | 420 → 423 | 19 → 19 | 0 | 1.8 → 1.9 | 6.0 → 6.0 | 5.9 → 6.0 | 1.9 → 1.9 | ≤ 5.9 |
| case-review | 372 → 375 | 18 → 18 | 0 | 1.9 → 2.0 | 5.3 → 5.4 | 5.3 → 5.4 | 1.5 → 1.5 | ≤ 8.8 |
| cat-education | 312 → 316 | 18 → 18 | 0 | 2.0 → 2.1 | 3.9 → 3.9 | 3.9 → 3.9 | 1.2 → 1.2 | ≤ 8.8 |
| cat-fortune | 329 → 332 | 18 → 18 | 0 | 2.1 → 2.1 | 4.0 → 4.0 | 3.9 → 4.0 | 1.2 → 1.2 | ≤ 11.7 |
| cat-health | 298 → 301 | 17 → 17 | 0 | 2.1 → 2.2 | 3.9 → 4.0 | 3.8 → 3.9 | 1.2 → 1.2 | ≤ 10.1 |
| cat-hr | 311 → 314 | 18 → 18 | 0 | 2.2 → 2.1 | 4.1 → 3.9 | 4.0 → 3.9 | 1.2 → 1.2 | ≤ 10.7 |
| cat-marketing | 327 → 330 | 18 → 18 | 0 | 2.1 → 2.0 | 3.9 → 3.9 | 3.9 → 3.9 | 1.2 → 1.2 | ≤ 9.6 |
| cat-security | 315 → 318 | 18 → 18 | 0 | 2.2 → 2.1 | 4.0 → 4.0 | 4.0 → 4.0 | 1.2 → 1.2 | ≤ 8.5 |
| cat-studio | 309 → 312 | 18 → 18 | 0 | 2.2 → 2.2 | 4.0 → 4.0 | 4.0 → 4.0 | 1.2 → 1.2 | ≤ 10.8 |
| checkout | 15902 → 15490* | 26 → 25 | 14183 | 2.4 → 2.5 | 15.1 → 15.2 | > 60 → > 60 | 3.4 → 3.4 | ≤ 9.8 |
| converter | 1354 → 1357 | 21 → 21 | 0 | 2.0 → 2.1 | 13.2 → 13.3 | 13.2 → 13.3 | 2.9 → 2.9 | ≤ 7.4 |
| creative-suite | 314 → 317 | 18 → 18 | 0 | 2.0 → 2.0 | 4.5 → 4.5 | 4.5 → 4.5 | 1.2 → 1.2 | ≤ 7.9 |
| creative | 1744 → 1747 | 20 → 20 | 0 | 2.1 → 2.0 | 15.2 → 15.1 | 15.2 → 15.1 | 3.6 → 3.6 | ≤ 7.5 |
| crowd | 2049 → 2052 | 37 → 37 | 0 | 4.1 → 4.1 | 24.9 → 24.8 | > 60 → > 60 | 3.2 → 3.2 | ≤ 9.0 |
| customers | 9309 → 9312 | 38 → 38 | 7277 | 2.3 → 2.2 | 21.0 → 20.8 | > 60 → > 60 | 3.4 → 3.4 | ≤ 9.8 |
| dream | 1263 → 1269 | 31 → 31 | 0 | 2.5 → 2.0 | 15.3 → 15.1 | 15.3 → 15.1 | 2.7 → 2.7 | ≤ 8.9 |
| driver | 2989 → 2992 | 34 → 34 | 964 | 2.3 → 2.4 | 20.6 → 20.7 | > 60 → > 60 | 3.4 → 3.4 | ≤ 19.0 |
| exam-dashboard | 514 → 517 | 25 → 25 | 0 | 4.3 → 4.3 | 11.2 → 11.4 | 11.2 → 11.4 | 1.5 → 1.5 | ≤ 19.4 |
| exam-hall | 1964 → 1967 | 31 → 31 | 0 | 2.3 → 2.3 | 22.9 → 22.4 | > 60 → > 60 | 2.6 → 2.6 | ≤ 19.9 |
| exam-lab | 1967 → 1970 | 32 → 32 | 0 | 4.2 → 4.3 | 24.1 → 24.1 | > 60 → > 60 | 2.6 → 2.6 | ≤ 18.5 |
| exam | 408 → 411 | 20 → 20 | 0 | not timed |  |  |  |  |
| faceread | 4147 → 3311 | 42 → 42 | 964 | 2.3 → 2.3 | 29.6 → 33.1 | > 60 → > 60 | 4.4 → 4.2 | ≤ 19.9 |
| fengshui | 1250 → 1256 | 32 → 32 | 0 | not timed |  |  |  |  |
| fortune | 394 → 400 | 21 → 21 | 0 | not timed |  |  |  |  |
| gate-notice | 286 → 286 | 16 → 16 | 0 | not timed |  |  |  |  |
| gate | 294 → 294 | 15 → 15 | 0 | not timed |  |  |  |  |
| help | 358 → 361 | 19 → 19 | 0 | not timed |  |  |  |  |
| horoscope | 1419 → 1425 | 29 → 29 | 0 | not timed |  |  |  |  |
| hr | 318 → 321 | 18 → 18 | 0 | not timed |  |  |  |  |
| iching | 1212 → 1218 | 31 → 31 | 0 | not timed |  |  |  |  |
| index | 427 → 430 | 22 → 22 | 0 | not timed |  |  |  |  |
| insights | 910 → 913 | 23 → 23 | 0 | not timed |  |  |  |  |
| interview | 1837 → 1839 | 20 → 20 | 0 | not timed |  |  |  |  |
| lek7 | 1288 → 1294 | 32 → 32 | 0 | not timed |  |  |  |  |
| lifegraph | 1289 → 1295 | 32 → 32 | 0 | not timed |  |  |  |  |
| luckycolor | 499 → 503 | 26 → 26 | 0 | not timed |  |  |  |  |
| medicine | 1267 → 1291 | 37 → 37 | 0 | not timed |  |  |  |  |
| neuro | 1810 → 1813 | 27 → 27 | 0 | not timed |  |  |  |  |
| numbers | 1185 → 1191 | 30 → 30 | 0 | not timed |  |  |  |  |
| nutrition | 496 → 499 | 23 → 23 | 0 | not timed |  |  |  |  |
| omr | 435 → 438 | 21 → 21 | 0 | not timed |  |  |  |  |
| palm | 7523 → 3077 | 42 → 37 | 4452 | 2.1 → 2.3 | 28.6 → 28.8 | > 60 → > 60 | 5.3 → 4 | ≤ 19.4 |
| parking | 868 → 871 | 32 → 32 | 0 | not timed |  |  |  |  |
| photobooth | 39545 → 39548 | 39 → 39 | 37229 | not timed |  |  |  |  |
| planner | 706 → 711 | 25 → 25 | 0 | not timed |  |  |  |  |
| pricing | 361 → 364 | 19 → 19 | 0 | not timed |  |  |  |  |
| privacy | 392 → 395 | 17 → 17 | 0 | not timed |  |  |  |  |
| qc | 717 → 720 | 25 → 25 | 0 | not timed |  |  |  |  |
| queue | 1851 → 1854 | 27 → 27 | 0 | not timed |  |  |  |  |
| report | 1334 → 1340 | 29 → 29 | 0 | not timed |  |  |  |  |
| retail | 308 → 310 | 17 → 17 | 0 | not timed |  |  |  |  |
| signage | 2105 → 2108 | 31 → 31 | 0 | not timed |  |  |  |  |
| solutions | 442 → 445 | 18 → 18 | 0 | not timed |  |  |  |  |
| store | 2153 → 2156 | 29 → 29 | 0 | not timed |  |  |  |  |
| studio | 47568 → 2315 | 38 → 29 | 45235 | not timed |  |  |  |  |
| tables | 1853 → 1856 | 27 → 27 | 0 | not timed |  |  |  |  |
| taksa | 1288 → 1294 | 32 → 32 | 0 | not timed |  |  |  |  |
| tarot | 1469 → 1475 | 31 → 31 | 0 | not timed |  |  |  |  |
| teamface | 2392 → 2396 | 22 → 22 | 0 | not timed |  |  |  |  |
| terms | 366 → 369 | 17 → 17 | 0 | not timed |  |  |  |  |
| tryon | 567 → 570 | 19 → 19 | 0 | not timed |  |  |  |  |
| village | 865 → 868 | 32 → 32 | 0 | not timed |  |  |  |  |
| zodiac | 1299 → 1305 | 32 → 32 | 0 | not timed |  |  |  |  |

### Reading

- The win is on the pages that downloaded models at load: studio 47.6 MB -> 2.3 MB (-95 %), booth 9.3 -> 2.0 MB,
  palm 7.5 -> 3.1 MB, faceread 4.1 -> 3.3 MB (faceread gained 5 look scripts from beauty-look in parallel). On Fast 3G
  that is roughly 250 s (studio), 40 s (booth) and 25 s (palm) of download a visitor no longer pays before using the page.
- The load event and FCP do not change on those pages (the models were fetched after load); what changes is the data
  used, the JS heap (booth 3.5 -> 3.2 MB, palm 5.3 -> 4.0 MB) and the time until the network is idle.
  Exception: faceread's load event moved from 29.6 to 33.1 s; that page gained 5 look-suggestion scripts (beauty-look,
  merged from main in parallel), not from this pass. Studio and photobooth were not timed (load >= 20).
- Pages that open the camera by themselves (attendance, customers, driver, photobooth, checkout) are unchanged with an
  allowed camera; with a refused camera attendance, customers, driver and checkout download no model (photobooth still
  does, for photo upload).
- Every other page: within run-to-run noise (FCP +-0.5 s at load 15 to 20; bytes +-1 %).
- Heaviest pages left: photobooth 39.5 MB and attendance / customers 9.5 MB (auto camera), checkout 15.5 MB (auto
  camera), then the camera pages that load face-api.js before the camera (about 1.8 MB each, load event 19 to 25 s on
  Fast 3G).



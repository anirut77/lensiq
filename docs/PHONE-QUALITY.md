# Real-phone quality (stream B, 2026-11-13)

What is checked automatically about phones, the numbers, and what still needs a real phone in a hand.
Every number below states its source. **No number here is from a real phone**: they are synthetic, headless
measurements (CI `ubuntu-latest` and a Mac). Field checks on real iPhones and Android phones are the owner checklists in
[`docs/owner-checklists/`](owner-checklists/README.md).

Locked test set: `evals-locks/phone-quality.sha256` (copy of `~/LENSIQ-field/evals/phone-quality/locked.sha256`),
written before any product change of this stream.

## 1. WebKit (iOS engine) flows at iPhone width

`tests/e2e/phone-webkit-a.e2e.mjs`, `tests/e2e/phone-webkit-b.e2e.mjs` (helpers `tests/e2e/phone-kit.mjs`). Playwright
1.64.1 WebKit, `devices["iPhone 13"]` (390 x 664 CSS px, touch, mobile Safari user agent), service workers blocked, the
fake camera of `tests/e2e/fake-cams.js` (canvas stream) and the localhost test seams for detections / plates / OCR.
Pass rule per flow: the page loads, the main action works, no page error, no crash event, no reload (one document load
per navigation and an in-page marker still present at the end), no horizontal overflow, and on camera flows the page
really used the test camera. The quote form is covered by `tests/e2e/lead-form-webkit.e2e.mjs` (team A1).

| Flow | Main action checked |
|---|---|
| Home | menu opens / closes by tap, contact section present |
| Tarot / Horoscope / Zodiac | a reading of at least 3 sections |
| Face reading | fake camera + scripted face -> reading |
| Exam lab | consent -> camera -> face -> calibration -> exam phase |
| Attendance (PIN / QR) | add employees, punch by PIN, punch by QR badge |
| Gate | landing links; parking: PDPA acknowledgement -> camera -> plate read -> entry confirmed |
| Crowd | notice -> camera -> 3 people counted |
| Product Check | live scan of a steady label -> Thai registration number |
| Nutrition | sample label card; camera opens |
| Studio | engine ready -> camera -> shoot -> portrait done |
| Photo booth | one photo -> result sheet |

Results: see section 4.

Finding while building the tests: WebKit can give the document a new `navigator.mediaDevices` object after init scripts
ran, so a test that patches `getUserMedia` silently tests WebKit's own mock camera instead. `phone-kit.mjs` pins the
object (`MD_SHIM`) and every camera flow asserts that the page opened the test camera.

## 2. Crash guard

`lensiq-crashguard.js`, loaded before `lensiq-camera.js` on every page that uses the camera (28 pages). iOS Safari
reloads a tab whose page was killed for memory; no `pagehide` runs then.

- While a camera stream is live, LQCam marks heavy work: sessionStorage `lq-heavy` = `"1"` (one boolean, nothing
  else is stored or sent). Stopping, pausing or losing the camera, or leaving the page normally (`pagehide`), clears it.
- A load that finds the marker is a restart after a crash: a short note (role=status, TH / EN / ZH, close button 44 px)
  "the page restarted; we switched to a lighter mode", and this load runs light: every LQCam camera is asked for at
  most 640 px wide (aspect kept, never raised). The marker is consumed, so the next normal load is clean.
  Pages can read `LQCrashGuard.lite` to choose a smaller model or a lower analysis rate (none does yet).
- Tests: `tests/unit/crashguard.test.js` (10 checks), `tests/e2e/crash-guard.e2e.mjs` (5 checks, TH / EN / ZH, the
  restart reproduced with the dying page's own sessionStorage).

## 3. Memory budget per camera page

`tests/e2e/phone-memory.e2e.mjs`: each camera page runs its main camera action for 60 s at 390 x 844 (mobile, touch)
in its own headless Chrome; sampled every 5 s: JS heap in use (CDP `Performance.getMetrics` `JSHeapUsedSize`) and the
renderer process's resident memory (CDP `SystemInfo.getProcessInfo` + `ps -o rss`; includes WebAssembly memory,
canvases and video frames). The check fails when a page's peak goes above its budget.

Budget rule: budget = the highest peak measured (CI or Mac) x 1.5, rounded up to the next 10 MB (heap: next 5 MB).

Measured peaks over 60 s, MB (source: synthetic, headless Chrome; "Mac" = local run 2026-11-13, "CI" = GitHub Actions
`ubuntu-latest`, run 43449439495). Renderer RSS = the largest renderer process (v2 of the procedure). With `?fakedet`
most pages skip their detector model, so these are camera + page + frame-loop figures; studio and photobooth load their
real segmentation models.

| Page | JS heap Mac | JS heap CI | Renderer RSS Mac | Renderer RSS CI | Budget heap | Budget RSS |
|---|---|---|---|---|---|---|
| exam-lab | 4.7 | 4.3 | 116.6 | 293.4 | 10 | 450 |
| attendance | 5.7 | 5.6 | 122.5 | 289.7 | 10 | 440 |
| parking | 2.6 | 2.6 | 136.6 | 281.0 | 5 | 430 |
| crowd | 5.1 | 5.5 | 172.7 | 235.1 | 10 | 360 |
| product-check (medicine.html) | 3.4 | 3.1 | 119.2 | 553.6 | 10 | 840 |
| nutrition | 2.0 | 2.1 | 108.1 | 203.2 | 5 | 310 |
| faceread | 5.5 | 5.0 | 154.7 | 513.8 | 10 | 780 |
| studio | 5.3 | 5.6 | 118.6 | 408.3 | 10 | 620 |
| photobooth | 4.7 | 4.8 | 187.5 | 873.1 | 10 | 1310 |

Reading: the JS heap is small everywhere (models and frames live outside it). Renderer memory on Linux is the
figure to watch: **photobooth (873 MB) and product check (554 MB) are the heaviest**; on an iPhone, Safari may kill a
tab well below 1 GB on older models, so these two pages are the first to check with the owner checklist (a reload or
the crash-guard note is the symptom). Mac figures are lower because macOS compresses memory. One run per platform:
the 1.5x headroom covers run-to-run noise; if CI flakes on a budget, the fix is in the page or a new measured
budget with a written reason, never a silent raise.

WebKit gives Playwright no memory figure, so iPhone memory is not measured automatically; the owner checklists ask
for reloads, the crash-guard note, heat and battery on a real iPhone instead.

## 4. Results

(filled in below)

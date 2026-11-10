# Product Check P2 — on-device recognition: measured numbers

Run 2026-11-09 with `node tools/pc-ondevice-eval.mjs` (raw per-image output: `~/LENSIQ-field/product-check/eval/
p2-ondevice-2026-11-09.json`, never in the repo). Every number states its source. Rates carry n and a Wilson 95 % interval.
The pipeline measured is the one the "Product check" tab runs (`lensiq-pc-run.js`): PP-OCRv5 mobile det on the whole
picture -> crop = union of text boxes + margin -> det + per-script rec on the crop; native `BarcodeDetector` and the
vendored zxing-wasm ponyfill on the whole picture; BlazeFace face gate on frame + 2 x 2 tiles + crop.

**Hardware: Apple M1 (8 cores, 8 GB RAM), macOS (Darwin 25.5), headless Chrome 156, ONNX Runtime Web WASM 1 thread.
This is not a phone; phone latency is not measured yet.** WebGL2 (SwiftShader) was switched on for the face detector only.

## สรุปสำหรับเจ้าของ (Thai summary)

- อ่านตัวอักษรบนเครื่องได้ 4 กลุ่มภาษา บนฉลากสังเคราะห์ (ภาพที่วาดเอง) อ่านถูกเฉลี่ย 94.9 % ของตัวอักษร (150 ฉลาก)
  ภาษาไทย 97.1 % จีน 97.3 % เกาหลี 97.2 % ญี่ปุ่น 95.8 % อังกฤษ 98.2 % **เวียดนาม 83.7 % เพราะโมเดลไม่มีวรรณยุกต์เวียดนาม**
- ภาพสินค้าจริงจากฐานข้อมูลสาธารณะ Open Food Facts (281 ภาพ ข้อมูลอ้างอิงที่ชุมชนกรอก ยังไม่ได้ตรวจ) พบชื่อแบรนด์หรือชื่อสินค้า
  ในข้อความที่อ่านได้ 47.0 % (ภาพด้านหน้า 62.3 %) ภาพเป็นขนาด 400 px ซึ่งเล็กกว่าภาพจากกล้องมือถือมาก
- บาร์โค้ด: อ่านได้ 1.8–2.5 % ของภาพ เพราะภาพชุดนี้เป็นด้านหน้าและส่วนประกอบ ส่วนใหญ่ไม่เห็นบาร์โค้ด ตัวเลขนี้จึงไม่ใช่ความแม่นยำของตัวอ่าน
  ตัวอ่านทำงานถูกบนบาร์โค้ด EAN-13 และ GS1 DataMatrix ที่สร้างขึ้น (ทดสอบอัตโนมัติ) ต้องวัดใหม่ด้วยภาพจริงของเจ้าของ (P1 ชุด 300 ภาพ)
- ตัวกันใบหน้า (สำหรับ P7): บล็อกภาพที่มีคนเป็นลายบนกล่อง 10 จาก 11 ภาพ แต่บล็อกภาพสินค้าที่ไม่มีคนด้วย 60.4 % (163/270)
  **ถ้าใช้ตามนี้ โหมดส่งภาพจะถูกบล็อกบ่อยมาก** ต้องให้เจ้าของตัดสินเกณฑ์ใน P7 หลังมีชุดภาพที่มีใบหน้าจริง 100 ภาพ (ข้อ 9.3)
- เวลาอ่านต่อภาพบน Mac M1: มัธยฐาน 0.45 วินาที (p90 1.1 วินาที) ยังไม่ได้วัดบนมือถือ

## 1. Model download per script (source: file sizes; load time on this machine)

| Model | Bytes | MiB | First load (ms) |
|---|---|---|---|
| PP-OCRv5 mobile det | 4,826,518 | 4.6 | 1,425 |
| rec Thai + English (shared with Gate) | 7,891,015 | 7.5 | 209 |
| rec Chinese / Japanese + English | 16,534,782 | 15.8 | 246 |
| rec Korean + English | 13,418,787 | 12.8 | 142 |
| rec Latin script | 8,042,023 | 7.7 | 136 |
| **Download on first use (det + rec)** | Thai 12.1 · Chinese / Japanese 20.4 · Korean 17.4 · Latin 12.3 MiB | | |
| BlazeFace short range (face gate) | 229,746 | 0.2 | 513 (incl. MediaPipe runtime) |
| zxing-wasm reader | 946,860 | 0.9 | — |

## 2. Public photo set (source: public dataset — Open Food Facts / Open Beauty Facts, community-entered, unverified ground truth)

281 images (400 px, front 167, ingredients 114; strata per `docs/product-check/TEST-SETS.md` §3). Script = the one a user
would pick for the pack's country (th / cjk / ko / latin); "Thai default" re-reads every crop with the Thai model.

Metric definitions (fixed before the run, also in the tool header):
- **Barcode read** = a decoded code equals the manifest barcode after both are left-padded to 14 digits (GTIN-14).
  Denominator = all images; whether a barcode is visible is not labelled, so this is a lower bound, not the reader's accuracy.
- **Token found** = at least one token of the brand(s) / product name (Latin or digit runs >= 3 characters, Thai / Hangul /
  kana / Han runs >= 2, NFKC, lower case) appears in the OCR text with whitespace removed (`LQPC.tokenHit`). Images without
  any token are not scored ("brand" column: 37 images have no brand).
- **OCR latency** = det on the whole picture + det and rec on the crop, models already loaded.

| Stratum (script) | Images | Barcode read, native (macOS) | Barcode read, zxing-wasm | Wrong GTIN (zxing) | Brand token found | Brand-or-name token found | same, Thai default | OCR ms median / p90 |
|---|---|---|---|---|---|---|---|---|
| Thailand (th) | 171 | 5 / 171 = 2.9 % [1.3 – 6.7] | 3 / 171 = 1.8 % [0.6 – 5.0] | 2 | 46 / 150 = 30.7 % [23.8 – 38.5] | 64 / 171 = 37.4 % [30.5 – 44.9] | 64 / 171 = 37.4 % [30.5 – 44.9] | 455 / 923 |
| China (cjk) | 19 | 0 / 19 [0 – 16.8] | 0 / 19 [0 – 16.8] | 0 | 6 / 16 = 37.5 % [18.5 – 61.4] | 13 / 19 = 68.4 % [46.0 – 84.6] | 12 / 19 = 63.2 % [41.0 – 80.9] | 437 / 1,060 |
| Japan (cjk) | 24 | 1 / 24 = 4.2 % [0.7 – 20.2] | 1 / 24 = 4.2 % [0.7 – 20.2] | 0 | 4 / 22 = 18.2 % [7.3 – 38.5] | 9 / 24 = 37.5 % [21.2 – 57.3] | 9 / 24 = 37.5 % [21.2 – 57.3] | 477 / 1,220 |
| South Korea (ko) | 11 | 0 / 11 [0 – 25.9] | 0 / 11 [0 – 25.9] | 0 | 3 / 7 = 42.9 % [15.8 – 75.0] | 8 / 11 = 72.7 % [43.4 – 90.3] | 8 / 11 = 72.7 % [43.4 – 90.3] | 396 / 879 |
| Malaysia (latin) | 14 | 0 / 14 [0 – 21.5] | 0 / 14 [0 – 21.5] | 0 | 4 / 9 = 44.4 % [18.9 – 73.3] | 10 / 14 = 71.4 % [45.4 – 88.3] | 9 / 14 = 64.3 % [38.8 – 83.7] | 460 / 1,458 |
| USA (latin) | 15 | 0 / 15 [0 – 20.4] | 0 / 15 [0 – 20.4] | 0 | 6 / 15 = 40.0 % [19.8 – 64.3] | 11 / 15 = 73.3 % [48.0 – 89.1] | 13 / 15 = 86.7 % [62.1 – 96.3] | 374 / 2,116 |
| EU (latin) | 15 | 1 / 15 = 6.7 % [1.2 – 29.8] | 1 / 15 = 6.7 % [1.2 – 29.8] | 0 | 6 / 15 = 40.0 % [19.8 – 64.3] | 9 / 15 = 60.0 % [35.7 – 80.2] | 10 / 15 = 66.7 % [41.7 – 84.8] | 688 / 1,206 |
| Germany (latin) | 12 | 0 / 12 [0 – 24.3] | 0 / 12 [0 – 24.3] | 0 | 6 / 10 = 60.0 % [31.3 – 83.2] | 8 / 12 = 66.7 % [39.1 – 86.2] | 11 / 12 = 91.7 % [64.6 – 98.5] | 470 / 1,035 |
| **All** | **281** | **7 / 281 = 2.5 % [1.2 – 5.1]** | **5 / 281 = 1.8 % [0.8 – 4.1]** | **2** | **81 / 244 = 33.2 % [27.6 – 39.3]** | **132 / 281 = 47.0 % [41.2 – 52.8]** | **136 / 281 = 48.4 % [42.6 – 54.2]** | **453 / 1,060** |
| front images | 167 | 2 / 167 = 1.2 % | 2 / 167 = 1.2 % | 1 | 66 / 137 = 48.2 % [40.0 – 56.5] | 104 / 167 = 62.3 % [54.7 – 69.3] | 104 / 167 = 62.3 % | 347 / 692 |
| ingredients images | 114 | 5 / 114 = 4.4 % | 3 / 114 = 2.6 % | 1 | 15 / 107 = 14.0 % [8.7 – 21.8] | 28 / 114 = 24.6 % [17.6 – 33.2] | 32 / 114 = 28.1 % | 707 / 1,359 |

Reading the table:
- The barcode columns say almost nothing about the reader: these photos rarely show a barcode. 2 images gave a code that
  is not the manifest barcode (a misread, another code on the pack, or a wrong manifest entry — not checked by hand).
  The reader itself is covered by the automated tests (generated EAN-13 and GS1 DataMatrix). **A barcode accuracy figure
  needs the owner's photo set (P1 protocol, a `barcode` photo per product).**
- The Thai default model reads Latin text about as well as the Latin model on these packs (48.4 % vs 47.0 %).
- Token found is a weak proxy for "the product name was read" (a generic word such as "milk" counts). Brand-only is lower
  (33.2 %) because brand names are often logos / stylised lettering. Images are 400 px: real phone photos are larger.
- Quality hints raised (heuristic thresholds, not validated against anything): glare 33, small text 13, no text 2, blur 1,
  bright 1 of 281 images.

## 3. Face gate (source: public dataset images + synthetic drawings)

BlazeFace short range on the whole frame, 2 x 2 overlapping tiles (60 % per side) and the crop; any score >= 0.3 blocks
(design §8.2); fails closed (no model, the detector cannot run, any error = blocked).

| Set | Blocked | Notes |
|---|---|---|
| Pack art with printed / drawn people (`pack_art_person`) | **10 / 11 = 90.9 % [62.3 – 98.4]** | the one miss scored below 0.3; packaging faces count as faces for the gate (acceptable, fail-closed) |
| Other images (no person after the P1 manual check) | **163 / 270 = 60.4 % [54.4 – 66.0]** | false blocks: frame 75, tiles 148, crop 73 images had a score >= 0.3 |
| Drawn cartoon faces (synthetic, 5 sizes) | 5 / 5 [56.6 – 100] | scores 0.83 – 0.87 |
| No WebGL (CI browser) | ~~blocked by design~~ **corrected 2026-11-10:** the detector runs without WebGL | CI's Chrome reports no WebGL at all (neither webgl2 nor webgl) and BlazeFace still ran on frame, tiles and crop there. The earlier claim "MediaPipe uploads images through WebGL even on the CPU delegate" was wrong. Fail-closed is now tested by removing WebAssembly (the detector cannot run -> blocked) |

For comparison only (the gate stays at 0.3): at 0.5 the gate blocks 4 / 11 pack-art and 62 / 270 other images; at 0.7,
0 / 11 and 6 / 270. **Miss rate on real faces is not measured** (needs the 100-photo face set of design §9.3; no photos
of people are collected for this round). Decision for P7, with the owner: keep 0.3 and accept that image mode is blocked
on about 60 % of clean packs (text-only fallback), or tune after the face set exists. The full-range BlazeFace model is not
usable with the vendored MediaPipe bundle (graph built for 896 anchors, the model has 2,304), so tiles replace it; tiles
cause most of the false blocks.

## 4. Synthetic labels (source: synthetic)

150 labels drawn on canvas in the browser: 6 languages x 5 texts (3 label-style lines each, known text) x 5 conditions
(clean; blur = 2 px Gaussian; glare = white radial highlight over the middle; rotate = 8 degrees; small = 15 px text).
Fonts: Prompt (Thai, OFL, vendored), Liberation Sans (English / Vietnamese, OFL, test fixture), macOS system PingFang SC
(Chinese), Hiragino Sans (Japanese), Apple SD Gothic Neo (Korean). Metric: character accuracy = 1 - edit distance /
reference length (whitespace ignored, NFKC, lower case), mean per cell (n = labels).

| Language (model) | clean | blur | glare | rotate 8° | small | all | labels >= 95 % |
|---|---|---|---|---|---|---|---|
| Thai (th) | 99.3 (5) | 100.0 (5) | 99.3 (5) | 86.8 (5) | 100.0 (5) | 97.1 (25) | 20 / 25 = 80.0 % [60.9 – 91.1] |
| English (latin) | 100.0 (5) | 100.0 (5) | 100.0 (5) | 91.1 (5) | 100.0 (5) | 98.2 (25) | 21 / 25 = 84.0 % [65.3 – 93.6] |
| Vietnamese (latin) | 85.6 (5) | 85.2 (5) | 85.6 (5) | 78.0 (5) | 84.3 (5) | 83.7 (25) | 0 / 25 = 0.0 % [0 – 13.3] |
| Chinese (cjk) | 98.5 (5) | 100.0 (5) | 98.5 (5) | 89.4 (5) | 100.0 (5) | 97.3 (25) | 20 / 25 = 80.0 % [60.9 – 91.1] |
| Japanese (cjk) | 98.9 (5) | 93.8 (5) | 98.3 (5) | 90.0 (5) | 97.8 (5) | 95.8 (25) | 17 / 25 = 68.0 % [48.4 – 82.8] |
| Korean (ko) | 100.0 (5) | 100.0 (5) | 100.0 (5) | 85.8 (5) | 100.0 (5) | 97.2 (25) | 20 / 25 = 80.0 % [60.9 – 91.1] |
| **All** | 97.1 (30) | 96.5 (30) | 97.0 (30) | 86.9 (30) | 97.0 (30) | **94.9 (150)** | **98 / 150 = 65.3 % [57.4 – 72.5]** |

- **Vietnamese:** the Latin model's dictionary has no tone-marked vowels (ố, ạ, ả …), so they are dropped; the UI says
  "Vietnamese without tone marks". Registration numbers and Latin letters are unaffected. **Owner decision (2026-11-10):**
  tone marks are a known limit; the opt-in AI step (P5-P7) handles Vietnamese text for now.
- **Rotation (tuned on the same synthetic set, optimistic):** the first run (axis-aligned boxes only) scored 22.5 % at
  8°. Rotated text boxes (orientation from each component's second moments, crop along it, as PaddleOCR's min-area box)
  raised it to 86.9 %; all other cells unchanged. The change was made after seeing this set, so 86.9 % is optimistic. The
  fixed set itself was not changed; the held-out set below was generated afterwards.
- English read with the Thai default model: 100.0 % (5 clean labels). OCR time per label: median 358 ms, p90 424 ms.
- Synthetic text is clean typography; it shows the models work per script, not how they do on real packs.

### 4.1 Held-out rotated labels (source: synthetic, held out)

72 labels generated after the rotated-box change, never used for tuning: new texts (6 languages x 3 two-line labels, e.g.
"Keep out of reach of children / Batch 6A0912"), angles -12 / -5 / +5 / +12 degrees (8° of the tuned set excluded), 32 px,
same fonts. Run: `node tools/pc-ondevice-eval.mjs --heldout-only` (2026-11-10).

| Language (model) | -12° | -5° | +5° | +12° | all | labels >= 95 % |
|---|---|---|---|---|---|---|
| Thai (th) | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 (12) | 12 / 12 [75.7 – 100] |
| English (latin) | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 (12) | 12 / 12 [75.7 – 100] |
| Vietnamese (latin) | 85.9 | 85.9 | 85.9 | 85.9 | 85.9 (12) | 0 / 12 [0 – 24.3] |
| Chinese (cjk) | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 (12) | 12 / 12 [75.7 – 100] |
| Japanese (cjk) | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 (12) | 12 / 12 [75.7 – 100] |
| Korean (ko) | 100.0 | 100.0 | 100.0 | 100.0 | 100.0 (12) | 12 / 12 [75.7 – 100] |
| **All** | 97.7 | 97.7 | 97.7 | 97.7 | **97.7 (72)** | **60 / 72 = 83.3 % [73.1 – 90.2]** |

Caveat: the held-out labels have 2 lines with 70 px spacing (the tuned set has 3 lines with about 65 px spacing), so
neighbouring rotated lines overlap less. They show the rotated reader generalises to new text and angles; they are
easier than the tuned set, not a measure of real tilted packs.

## 5. Automated tests (fixed before building)

- `tests/unit/pc-ondevice.test.js` — 15 tests: registration-number shapes (TH drug / herbal / food / cosmetic 13 and 10
  digits / device / advert permits; MY MAL / NOT; SG SIN; CA DIN / NPN; US NDC; CN; EU; AU), GTIN check digits and GS1 issuer
  prefixes, GS1 element strings (AI 01 / 17 with DD = 00 / 10 / 21, FNC1, symbology ids, "(01)…" text, century window),
  quality metrics on synthetic images, DB boxes incl. rotated lines, reading order, crop, CTC on synthetic logits, face gate
  decisions, measurement helpers, page safety rules and TH / EN / ZH coverage of every `md.pc.*` key.
  Corrections made while building (all were wrong expectations, none loosened): the GS1 example GTIN 09501101530003 has
  prefix 950 (GS1 Global Office), not US; crop-clamp arithmetic; a float comparison; token order. The SARA AM test exposed a
  product bug (NFKC splits ำ) — fixed in the product.
  Added after the independent review (2026-11-10): a detection without a finite score (missing / null / NaN / string)
  counts as a face (the gate used to read it as 0 — fixed in the product); expiry vs the device's LOCAL date (past / today /
  future and the 00:00-07:00 Bangkok edge, where UTC is still on the previous day — the page used UTC; fixed).
- `tests/e2e/product-check.e2e.mjs` — 8 checks: tab offline / nothing stored; real models read a synthetic Thai + Latin +
  Chinese label (TH drug + food number, CN approval number, Thai and Chinese lines >= 80 % character accuracy); EAN-13 and
  GS1 DataMatrix via self-hosted zxing-wasm; face gate blocks (seam face, missing model, detector cannot run; since 2026-11-10 tested with WebAssembly removed, not WebGL); history opt-in ON
  stores only number norms, GTINs and country codes (never OCR text or an image) and emergency wording opens the emergency
  card without being stored; a GS1 expiry before today's local date shows the risk signal, today / future do not;
  EN / ZH with no Thai; phones 320 / 360 / 390.

## 6. Not measured yet

Field photos (owner's 300-photo set, P1 protocol); registration-number read rate on real packs; barcode read rate on photos
that show the barcode; phone latency and memory; face-gate miss rate on real faces; over-claims (P3); lookups (P4).
Independent review (2026-11-10): passed; every number in sections 1-4 reproduced. The should-fix items are done in this
revision (face-score fail-closed, history test, local-date expiry signal with a next step, emergency check in the tab,
model notice wording, held-out rotated set, PDPA note, stale comments).

Owner decision for P7 (2026-11-10, not built in P2): the face check changes from "block" to "blur": every detected face
region is blurred before any upload, the user sees the blurred preview, and an upload is never blocked because of a
face. The P2 runs already carry each face's box in frame pixels (`lensiq-pc-run.js faceCheck`) for a later
`faceBlur(canvas, faces)`; the false-block figures in section 3 then become "regions blurred unnecessarily".

**Built 2026-11-10 (face blur):** the upload path now blurs instead of blocking. Fixed test set (packs + 160 Open Images V7
real-face images), the 30-setting sweep, the picked setting (round 2: 3 x 3 overlapping tiles, threshold 0.5, 15 % padding) and its dev /
held-out numbers: `docs/product-check/FACE-BLUR-RESULTS.md`. `faceGate` and section 3 above stay as they were (API kept).

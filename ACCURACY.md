# LENSIQ camera systems — measured accuracy

Measured on **public datasets with ground truth**, using the same browser code the pages run (TF.js / ONNX Runtime Web on **WASM, no WebGL**,
headless Chrome on an Apple-silicon Mac). The harness is in [`tests/bench/`](tests/bench) and can be re-run by anyone
(see [tests/README.md](tests/README.md#accuracy-benchmarks-real-public-footage-optional)). Datasets are downloaded outside
the repository and are never committed.

**Read this first.**

- These are public research datasets: street, news and studio photos. They are not your shop, your lighting or your
  camera angle. Expect different numbers on site, usually worse. Run a short pilot with a manual count before you rely
  on any total.
- Every number is from one run on one machine. Small test sets are marked; percentages from a few dozen events have wide
  error bars.
- Round 4 changed the store detector and tracker, the face-matching rules, the driver eye threshold and the checkout
  read gate. Round 5 (this version) changed:
  - face matching: group-calibrated limits, a detector cascade, and confirmation when unsure (§2);
  - driver eye closure: an eye-patch classifier (§5);
  - QC: lighting normalisation and a label-angle check (§7);
  - door counting: crossings by tracks lost mid-confirmation now count (§1).

  Each section shows before → after.
- **Round 9 measures nothing new at a customer site, because there is none yet.** It adds the means to do so. The
  seven analytics camera pages (store, customers, attendance, driver, qc, booth and signage; booth, customers and
  signage since round 10) have an on-site accuracy check that the shop runs on its own premises. Checkout, neuro and the
  photo / fortune pages do not. The check gives the result with confidence intervals and keeps a JSON record. Each of
  those cameras also shows a health indicator, checked against a robustness benchmark, and a soak test covers long runs
  (§12).
- **Round 10: a site check passes only when its confidence interval clears the target.** "Pass (confirmed)" needs the
  whole 95% interval on the right side of every target. A result whose measured values meet the targets while the
  interval still crosses one is reported as "on target so far — collect N more", with N. So 44 of 50 crossings matched
  with 7 false counts, or 0 errors in 30 good + 10 bad bottles, is not a pass. The round-9 point verdict is still shown,
  labelled "provisional". Frozen and disconnected cameras are now detected, and the affected hours are flagged next to
  the counts (§12).
- **Round 11 measures nothing new either.** It makes the pages say what this file says. Every customer-facing figure
  (cameras.html#accuracy and the accuracy note on store, customers, attendance, booth, driver, qc and signage) now comes
  from one file, `docs/accuracy-figures.json`. Each figure there names the line of this file it comes from.
  `tools/accuracy-sync.mjs` writes the Thai, English and Chinese text from it, and `tests/unit/accuracy-figures.test.js`
  fails when a page disagrees, when the evidence line changes here, or when one of the stale phrases below comes back.
  Run on the round-10 pages, the check found all 7 banners and 7 table cells out of line with this file, and 25 stale
  phrases in 9 files: Asian faces "54% / 3.4%", the withdrawn
  "about 50 enrolled" advice, "label skew not checked", driver "18–43% per frame, false alarms ≤ 0.1%", and attendance
  "strangers 6%". The driver page is now labelled an eyes-closed awareness aid, not a safety device (§5). The on-site
  check adds a pilot grade (§12), and IP cameras are described as working through a virtual-webcam tool, with a guide on
  cameras.html#ipcam.
- Pages whose accuracy is modest or not yet measured show a **Beta** or accuracy note at the top (Thai). Thai summary:
  [cameras.html#accuracy](cameras.html#accuracy).

## 1. People detection, tracking and line counting — store (วิเคราะห์หน้าร้าน)

**Pipeline under test (round 4).** `LQDetect.detectPeople` runs **YOLOX-Nano** (Megvii, Apache-2.0, official ONNX release,
416×416 input) on **ONNX Runtime Web, WASM, one thread, no WebGL** and keeps the person class. COCO-SSD lite (TF.js) is
still shipped as the fallback when ONNX Runtime cannot start, or with `?coco`. `store.js` `stepCam()` does the rest: the
LQTrack tracker in the new ByteTrack-style `byte` mode, line counting with a hysteresis band and confirmation
(`crossStep`), and optional re-ID ("ลดการนับซ้ำ"). Detection runs in headless Chrome; tracking and counting run in Node
through `stepCam`. Both are the page's own code, unchanged.

**Data.** Five static-camera sequences with ground-truth boxes and identities. All are outdoor or station scenes; none
is a shop doorway.

| sequence | frames analysed at 10 fps | resolution | people boxes | scene | role in tuning |
| --- | --- | --- | --- | --- | --- |
| PETS09-S2L1 | 795 (7 fps) | 768×576 | 4,476 | elevated camera, campus crossing, small people | tuning |
| TUD-Stadtmitte | 60 (8.3 fps) | 640×480 | 387 | eye level, pedestrians close to the camera | tuning |
| MOT17-02 | 200 | 1920×1080 | 6,189 | square, many small and partly hidden people | **held out** |
| MOT17-04 | 350 | 1920×1080 | 15,848 | high camera over a crowded pedestrian street | **held out** |
| MOT17-09 | 175 | 1920×1080 | 1,773 | eye level, shop-front walkway | **held out** |

**Counting ground truth.** Each sequence gets five virtual counting lines (x = 0.3 / 0.5 / 0.7 and y = 0.4 / 0.6).
Ground-truth crossings come from running the store's round-3 `checkCrossing` rule (unchanged, frozen in the benchmark)
on the ground-truth tracks, so any error comes from detection and tracking. That gives 273 ground-truth crossings at
5 fps and 275 at 10 fps. A counted event is correct when the direction matches, the time is within 1.5 s and the
position along the line is within 15%.

### Detector: YOLOX-Nano replaces COCO-SSD

Candidates had to be commercially licensed and run on ORT/TF.js WASM without WebGL. Ultralytics models (AGPL) were
excluded. Every candidate was measured on the same frames, IoU ≥ 0.5, one WASM thread on an Apple-silicon Mac that was
running other benchmarks at the same time, so absolute times are pessimistic.

| detector (licence) | size | time per frame, median / p90 | AP@0.5 PETS / TUD | AP@0.5 MOT17-02 / 04 / 09 | pooled precision / recall at score 0.4 |
| --- | --- | --- | --- | --- | --- |
| COCO-SSD lite MobileNetV2 (Apache-2.0), round 3 | 18 MB | 123 / 187 ms | 69.1 / 81.4% | 13.7 / 21.5 / 49.6% | 76.3% / 24.0% |
| **YOLOX-Nano 416 (Apache-2.0), new default** | **3.7 MB** | **111 / 158 ms** | **88.6 / 85.9%** | **24.4 / 39.0 / 65.0%** | **83.1% / 36.5%** |
| YOLOX-Tiny 416 (Apache-2.0), evaluated, not shipped | 20 MB | 436 / 570 ms | 90.5 / 86.8% | 26.4 / 45.2 / 68.0% | 90.7% / 38.2% |
| YOLOX-Nano, wide frames as 2 square halves (`split:'auto'`) | 3.7 MB | ~2 × 111 ms on 16:9 | 88.6 / 85.9% (4:3, no split) | 32.5 / **55.1** / 63.8% | — |

YOLOX-Tiny is only a few points better than Nano at four times the cost, too slow for line counting on WASM, so it is
not vendored. NanoDet-Plus and PP-PicoDet (both Apache-2.0) were not evaluated in this round. A dynamically quantised
INT8 Nano (1 MB) was not faster on CPU, so the original FP32 file is shipped unchanged (sha256 in
`vendor/models/yolox/README.txt`).

Recall by person size (box height ÷ frame height, visibility ≥ 50%, score 0.4):

| person height | detector | MOT17-02 | MOT17-04 | MOT17-09 | PETS09 | TUD |
| --- | --- | --- | --- | --- | --- | --- |
| < 10% | COCO-SSD → YOLOX-Nano | 5% → 3% | — | — | — | — |
| 10–20% | COCO-SSD → YOLOX-Nano | 7% → **20%** | 12% → **28%** | 34% → **59%** | 75% → **90%** | — |
| 20–35% | COCO-SSD → YOLOX-Nano | 62% → **96%** | 35% → **87%** | 62% → **93%** | 79% → **88%** | 69% → 78% |
| ≥ 35% | COCO-SSD → YOLOX-Nano | 82% → **98%** | — | 91% → **99%** | — | 81% → 94% |

**Small and far people are still the weak spot.** People shorter than a tenth of the frame are almost never found by
either model. Between 10% and 20% of the frame, recall rose from 7–34% to 20–59% on MOT17, but is still far from the
90% seen on PETS. Two things help further, both at a cost. The per-camera setting "คนตัวเล็ก/อยู่ไกล" (tiling) now also
works with YOLOX. On 16:9 cameras the two-halves split lifts MOT17-04 AP from 39% to 55% for double the compute.

### Tracking and line counting

What changed in the tracker (`lensiq-track.js`, `store.js` `ST_TRACK`):

1. **Two-stage, ByteTrack-style association.** Confident detections (score ≥ 0.5) are matched first. Tracks still
   unmatched may then take a low-score detection (0.3–0.5) under a stricter gate, so a half-hidden person keeps the same
   track. Only confident detections can start a new track, and a size-ratio gate stops a track jumping to a person of a
   very different size.
2. **Line hysteresis band.** A person counts as being on a side of the line only when the box centre is more than
   max(1.2% of the frame, 8% of the person's height) away from the line.
3. **Confirmation.** The person must stay on the new side for 2 consecutive analysed frames before the crossing counts.
   A track that flips back before that, typically two people swapping IDs at the line, counts nothing.

The values were chosen on **PETS09 + TUD only**: 25 + 25 + 6 configurations, at 5 and 10 fps (`LQ_BENCH_EXTRA`). MOT17
was run **once** with the chosen values and is reported as held out. A later check of a low-fps gate cap (`GATE_CAP`)
made no difference on the tuning set, so it was not adopted.

**Pooled over all five sequences** (net error = total counted vs. true; event P = share of counted events that really
happened; event R = share of true crossings that were counted):

| analysis rate | detector + tracker | counted / GT | net error | direction error | event P | event R | IDF1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 fps | round 3: COCO-SSD + round-3 tracker | 294 / 273 | +7.7% | 19.4% | 72.4% | 78.0% | 20.1% |
| 5 fps | YOLOX-Nano + round-3 tracker | 338 / 273 | +23.8% | 28.9% | 67.2% | 83.2% | 32.8% |
| 5 fps | **round 4: YOLOX-Nano + byte + band + confirm** | **266 / 273** | **−2.6%** | **15.0%** | **80.8%** | 78.8% | 32.9% |
| 5 fps | round 4 + re-ID | 246 / 273 | −9.9% | 17.2% | 81.7% | 73.6% | 32.6% |
| 10 fps | round 3: COCO-SSD + round-3 tracker | 250 / 275 | −9.1% | 25.1% | 77.6% | 70.5% | 18.2% |
| 10 fps | YOLOX-Nano + round-3 tracker | 278 / 275 | +1.1% | 14.9% | 81.7% | 82.5% | 31.9% |
| 10 fps | **round 4** | **234 / 275** | **−14.9%** | 17.1% | **90.6%** | 77.1% | 32.9% |
| 10 fps | round 4, 16:9 frames split in two halves | 275 / 275 | 0.0% | 10.9% | 84.4% | 84.4% | 40.8% |
| 5 fps | round 4, 16:9 split | 314 / 273 | +15.0% | 22.3% | 74.5% | 85.7% | 39.8% |
| 5 fps | COCO-SSD fallback + round-4 tracker | 223 / 273 | −18.3% | 24.9% | 82.1% | 67.0% | 20.2% |
| 5 fps | **round 5: round 4 + `flushLost`** | **272 / 273** | **−0.4%** | 17.2% | 79.0% | 78.8% | 32.9% |
| 10 fps | **round 5** | **239 / 275** | **−13.1%** | 16.0% | 90.4% | **78.5%** | 32.9% |
| 10 fps | round 5, 16:9 split | 282 / 275 | +2.5% | 12.0% | 81.9% | 84.0% | 40.8% |
| 5 fps | round 5, 16:9 split | 320 / 273 | +17.2% | 24.5% | 72.8% | 85.3% | 39.8% |
| 5 fps | round-5 candidate, rejected: + byte `HIGH` 0.4 | 294 / 273 | +7.7% | 22.3% | 74.1% | 79.9% | 33.2% |
| 10 fps | round-5 candidate, rejected: + byte `HIGH` 0.4 | 249 / 275 | −9.5% | 13.8% | 87.1% | 78.9% | 32.0% |

**Per sequence**, before (round 3 as shipped: COCO-SSD + round-3 tracker) → after (round 4: YOLOX-Nano + round-4 tracker):

| sequence | rate | counted / GT before → after | net error before → after | event P before → after | event R before → after |
| --- | --- | --- | --- | --- | --- |
| PETS09-S2L1 (tuning) | 5 fps | 141 → 129 / 126 | +11.9% → **+2.4%** | 80.1% → **93.8%** | 89.7% → **96.0%** |
| TUD-Stadtmitte (tuning, 8 events) | 5 fps | 11 → 7 / 8 | +37.5% → −12.5% | 72.7% → **100%** | 100% → 87.5% |
| MOT17-02 (held out) | 5 fps | 50 → 34 / 39 | +28.2% → −12.8% | 56.0% → 67.6% | 71.8% → 59.0% |
| MOT17-04 (held out) | 5 fps | 53 → 64 / 54 | −1.9% → +18.5% | 56.6% → 60.9% | 55.6% → 72.2% |
| MOT17-09 (held out) | 5 fps | 39 → 32 / 46 | −15.2% → −30.4% | 87.2% → 78.1% | 73.9% → 54.3% |
| PETS09-S2L1 (tuning) | 10 fps | 141 → 129 / 126 | +11.9% → **+2.4%** | 80.1% → **93.8%** | 89.7% → **96.0%** |
| TUD-Stadtmitte (tuning, 9 events) | 10 fps | 12 → 6 / 9 | +33.3% → −33.3% | 66.7% → **100%** | 88.9% → 66.7% |
| MOT17-02 (held out) | 10 fps | 32 → 27 / 40 | −20.0% → −32.5% | 62.5% → 70.4% | 50.0% → 47.5% |
| MOT17-04 (held out) | 10 fps | 28 → 39 / 54 | −48.1% → −27.8% | 78.6% → **92.3%** | 40.7% → 66.7% |
| MOT17-09 (held out) | 10 fps | 37 → 33 / 46 | −19.6% → −28.3% | 83.8% → **90.9%** | 67.4% → 65.2% |

### Round 5: counting a crossing that is cut short by occlusion

**Diagnosis.** A new `--why` option in `people.bench.mjs` sorts every missed or false crossing on the tuning set. Most
misses were "not counted, same id": two people swapping ids at the line, or a person crossing and then disappearing
before the 2-frame confirmation. To make the easy tuning scenes look more like MOT17, two stress options were added and
used on **PETS09 + TUD only**: `--occlude 0.25` hides each ground-truth person from the detector for random 1-second
blocks, and `--score-k 0.75` lowers every detector score, as for far or small people.

**Tried on the tuning set (5 and 10 fps, clean + 3 stress conditions):**

| idea | result on tuning (clean / stressed) | adopted |
| --- | --- | --- |
| hand-off of the line memory from a lost track to a new track born nearby within 1–2 s | no change; the 2-s coasting already bridges these gaps | no, code removed |
| direction voting (2 of 3 frames instead of 2 consecutive) | no change; flip-backs inside the band are rare | no, code removed |
| confirmation 3 frames | −1.5 to −11% net, lower recall | no |
| `MIN_HITS` 3 before a track may count | slightly lower recall | no |
| **`flushLost`: a crossing still awaiting confirmation counts when the track disappears** (it did not turn back) | clean: +1 event (net +1.5 → +2.2% at 5 fps); stressed: net error 1–2 points smaller, recall +1.5–2 points | **yes** |
| byte stage-1 threshold `HIGH` 0.5 → 0.4 (0.4–0.5 boxes keep their track with the normal gate) | clean: precision −2 to −3 points; stressed: net error −7.5 → −3.0% (5 fps) and −9.6 → −3.7% (10 fps) | tuning said yes, **rejected after MOT17** |

**Held-out check, and an honest caveat.** The first MOT17 run used `flushLost` + `HIGH` 0.4. At 10 fps every MOT17
sequence improved (−32.5 / −27.8 / −28.3% → −27.5 / −20.4 / −15.2%), but at 5 fps MOT17-04 went from +18.5% to
**+55.6%** with precision 44%. `HIGH` 0.4 adds ID switches in the crowd (192 → 229 on MOT17 at 5 fps). An ablation on
MOT17 then showed that `flushLost` alone helps at both rates, so only `flushLost` is shipped. **Because that choice was
made after looking at MOT17, the round-5 MOT17 numbers below are a second look, not a clean held-out test.**

`flushLost` has a known failure mode, covered by a unit test. If the tracker breaks a track exactly when someone steps
over the line and turns back, that crossing now counts.

**Per sequence, round 4 → round 5:**

| sequence | rate | counted / GT round 4 → 5 | net error round 4 → 5 | event P round 4 → 5 | event R round 4 → 5 |
| --- | --- | --- | --- | --- | --- |
| PETS09-S2L1 (tuning) | 5 and 10 fps | 129 → 130 / 126 | +2.4% → +3.2% | 93.8% → 93.1% | 96.0% → 96.0% |
| TUD-Stadtmitte (tuning) | 5 fps | 7 → 7 / 8 | −12.5% → −12.5% | 100% → 100% | 87.5% → 87.5% |
| TUD-Stadtmitte (tuning) | 10 fps | 6 → 6 / 9 | −33.3% → −33.3% | 100% → 100% | 66.7% → 66.7% |
| MOT17-02 | 5 fps | 34 → 38 / 39 | −12.8% → **−2.6%** | 67.6% → 60.5% | 59.0% → 59.0% |
| MOT17-04 | 5 fps | 64 → 64 / 54 | +18.5% → +18.5% | 60.9% → 60.9% | 72.2% → 72.2% |
| MOT17-09 | 5 fps | 32 → 33 / 46 | −30.4% → −28.3% | 78.1% → 75.8% | 54.3% → 54.3% |
| MOT17-02 | 10 fps | 27 → 29 / 40 | −32.5% → −27.5% | 70.4% → 72.4% | 47.5% → 52.5% |
| MOT17-04 | 10 fps | 39 → 40 / 54 | −27.8% → −25.9% | 92.3% → 92.5% | 66.7% → 68.5% |
| MOT17-09 | 10 fps | 33 → 34 / 46 | −28.3% → −26.1% | 90.9% → 91.2% | 65.2% → 67.4% |

The gain is small: 1 to 4 events per sequence. Pooled at 5 fps net error goes from −2.6% to −0.4%, with precision down
from 80.8% to 79.0%. At 10 fps it goes from −14.9% to −13.1%, precision unchanged (90.6% → 90.4%), recall
77.1% → 78.5%. On the 16:9 split it overcounts a little more than round 4 (10 fps +0.0% → +2.5%).

**Honest bottom line.**

- **Targets: net error within ±10% and event precision ≥ 85%.** These are met on the door-like tuning scene: PETS09
  gives +3.2% net and 93% precision at both 5 and 10 fps. Pooled over all five sequences they are met for net error at
  5 fps (−0.4%), but precision there is 79%. At 10 fps precision is 90%, but net error is −13%.
- **They are not met on the MOT17 crowds.** Per sequence, net error is −28% to +19% (round 4: −32.5% to +18.5%) and
  precision 61–92%. Software changes to the counting rule move this by only a few events. The remaining cause is
  detection and identity, not the counting rule: people under a fifth of the frame are rarely detected, and ids swap in
  crowds. Splitting 16:9 frames in two (10 fps) brings the pooled result to +2.5% net and 82% precision, at double the
  compute.
- **About 1 in 5 counted events is still wrong pooled at 5 fps, and about 1 in 10 at 10 fps.** Round 3 was about 1 in 4.
  The rule waits for 2 frames, so it still misses some real crossings in crowds. That is why it undercounts at 10 fps.
- **Practical guidance.** Use a ceiling or high camera over the door, keep people at least 1/4 of the frame tall, and
  draw the line across the walking direction. Run a 30-minute manual count to calibrate. The page still labels counts
  as estimates (Beta).

## 2. Face recognition — attendance, customers, booth

Pipeline: face-api.js TinyFaceDetector (input 320, score 0.5) → 68 landmarks → 128-D descriptor → Euclidean distance.
These are the options `attendance.js` and `customers.js` use (1:1 table below: round-3 single-pair test). Data: **LFW View-1 pairs**, 2,200 pairs (1,100 same person,
1,100 different people) from the Hugging Face mirror `logasja/lfw`. Faces were found in 95.5% of images. A pair with a
missing face counts as "not matched", as it would on the page.

### 1:1 verification

| distance threshold | used by | same person accepted (TAR) [95% CI] | different person accepted (FAR) [95% CI] | FAR CI as published before round 10 (per pair) |
| --- | --- | --- | --- | --- |
| 0.45 | | 50.7% [47.6–53.9%] | 0.00% [0.00–0.64%] | [0.0–0.3%] |
| **0.50** | **customers, booth** | **72.6% [69.7–75.3%]** | **0.00% [0.00–0.64%]** | [0.0–0.3%] |
| **0.55** | **attendance (default)** | **86.5% [84.3–88.6%]** | **0.09% [0.00–0.53%]** | [0.0–0.5%] |
| 0.60 | | 91.0% [89.1–92.7%] | 0.55% [0.18–1.18%] | [0.3–1.2%] |
| 0.65 | | 91.9% [90.1–93.6%] | 2.45% [1.54–3.55%] | [1.7–3.5%] |

**How the intervals are computed (round 10).** The 1,100 different-person pairs involve 1,695 people, and many people
appear in more than one pair, so the pairs are not independent. The intervals are an **identity-cluster bootstrap**
(2,000 resamples). The clusters are the 595 groups of pairs that share nobody, even indirectly. The same-person pairs are
clustered by person (788 people). Where the bootstrap is too short (no or very few accepted pairs), a Wilson interval on the
effective sample size is used instead (n / design effect; with no accepted pairs, n = the 595 groups). The reported
interval is the wider of the two (`tests/bench/metrics.cjs` `clusterBootstrap`, `identityComponents`). The old per-pair
Wilson intervals are kept in the last column. They were too narrow: for example, 0 of 1,100 was reported as "≤ 0.3%",
but the data support only "≤ 0.6%". Method notes and the unit tests behind them: `docs/STATS.md` §5.

The equal error rate on pairs where both faces were found is 1.4% (at distance 0.627). From round 10 the EER uses the same
acceptance rule as the table (distance < threshold, swept over midpoints between observed distances). The value is unchanged. face-api's descriptor is a port of
dlib's ResNet model, and LFW was not in its training set as far as published.

### 1:N identification (what the pages actually do), round 4

The pages compare a face with **every** enrolled person, so the risk grows with the number of people enrolled. Round 3
measured this on LFW View-1 with one photo per person. Round 4 uses a larger, harder setup, `tests/bench/face1n.bench.mjs`:

- **Tuning set: full LFW**, 13,233 images. The 610 people with ≥ 4 photos are members: photos 1–3 are enrolment, photo
  4 is the probe. 1,200 one-photo people are strangers.
- **Held-out per-group check: CASIA-FaceV5**, 500 Asian (Chinese) people × 5 photos, research use, evaluation only.
  250 people are members and 250 are strangers.
- **A "visit"** is 3 video frames of one photo: the photo plus 2 seeded jitters (±6% scale, ±3% shift, ±15% exposure,
  slight defocus). That is what a page sees while someone stands still for under a second. Each row averages 200
  random galleries; about 12,000 stranger visits per row. **Those visits come from far fewer people**: about 1,800
  distinct strangers on LFW and 500 on CASIA, each re-used in many galleries.

**Note on the intervals in the two round-4 tables below.** They are per-visit Wilson intervals. They treat the ~12,000
visits as independent, but the visits are not independent, so **the true intervals are wider**. These tables come from
the round-4 run, which cannot be reproduced exactly, so they are left as published. The round-5 tables further down were
re-run in round 10 with identity-cluster intervals. On the same rows, those intervals are 1.1–7× wider than the per-visit
ones.

**What changed** (`lensiq-track.js`, `attendance.js`, `customers.js`):

1. **Enrolment from 3 poses.** The pages capture straight, slightly left and slightly right, 2 good frames each, and
   average them. The benchmark approximates this with the centroid of 3 photos.
2. **Per-person limit** (`enrolGallery`). A person's acceptance distance is
   min(0.55, max(0.45, 0.85 × the distance to the nearest *other* enrolled person)). Look-alikes get a stricter limit,
   so the space between two similar members is not handed to strangers.
3. **Quality gate** (`faceQuality` / `qualityOk`). Frames are skipped when the face is under 40 px, the detector score
   is under 0.5, or yaw (nose between the eye corners) is over 0.6.
4. **Consensus.** The same member must win 2 frames: attendance `createConfirm`, customers 2 consecutive frames.
5. **Unchanged:** the margin rule (the runner-up at least 0.05 further). Customers moves from 0.50 to the same
   0.55 + per-person rule as attendance.

**LFW (tuning set)**:

| enrolled | rule | member recognised per visit | member shown as someone else | stranger accepted [95% CI per visit, not independent — true interval wider] |
| --- | --- | --- | --- | --- |
| 100 | round 3 attendance: 1 photo, 0.55 + margin, 1 frame | 89.0% | 0.36% | 8.72% [8.2–9.2%] |
| 100 | round 3 customers: 1 photo, 0.50 + margin, 1 frame | 80.5% | 0.09% | 1.88% [1.6–2.1%] |
| 100 | **round 4 default (3 poses, per-person limit, quality, 2 frames)** | **85.1%** | **0.03%** | **0.79% [0.6–1.0%]** |
| 100 | round 4 without the quality gate | 87.8% | 0.03% | 0.82% [0.7–1.0%] |
| 100 | round 4 without the per-person limit | 90.9% | 0.08% | 9.14% [8.6–9.7%] |
| 100 | round 4 without consensus (1 frame) | 90.0% | 0.03% | 1.24% [1.1–1.5%] |
| 100 | round 4 rules on a member enrolled with 1 photo (pre-round-4 enrolments) | 73.7% | 0.10% | 1.27% [1.1–1.5%] |
| 100 | round 4 rules, 2 photos | 81.9% | 0.03% | 0.73% [0.6–0.9%] |
| 20 | round 4 default | 88.9% | 0.00% | 1.43% [1.2–1.7%] |
| 200 | round 4 default | 84.1% | 0.06% | 0.92% [0.8–1.1%] |
| 200 | round 3 attendance | 86.8% | 0.65% | 11.56% [11.0–12.1%] |

**The per-person limit does most of the work at 100 enrolled.** Removing it brings stranger acceptance back to 9%.
Consensus and the quality gate add smaller gains. Members enrolled before round 4, from a single capture, are recognised
only 74% of the time, so re-enrol them.

**CASIA-FaceV5, Asian faces (held out)**, round 4 as published:

| enrolled | rule | face found per frame | member recognised per visit | member shown as someone else | stranger accepted [95% CI per visit, not independent — true interval wider] |
| --- | --- | --- | --- | --- | --- |
| 20 | round 4 default | 59.6% | 55.7% | 0.00% | **6.49% [6.1–6.9%]** |
| 100 | round 3 attendance | 59.6% | 69.0% | 0.18% | 7.96% [7.5–8.5%] |
| 100 | round 4 default | 59.6% | 54.1% | 0.00% | 3.38% [3.1–3.7%] |
| 100 | round 4 without consensus | 59.6% | 74.2% | 0.00% | 5.77% [5.4–6.2%] |
| 200 | round 4 default | 59.6% | 51.9% | 0.00% | 2.18% [1.9–2.5%] |

**Correction to round 4.** The round-4 version of this page left out the 20-enrolled CASIA row above and advised "do not
rely on face matching alone with more than about 50 enrolled people". That advice was wrong: it implied small groups are
safer. They were the **least** safe. Round 4 accepted 6.5% of strangers with 20 enrolled and 11% with 5 enrolled,
against 3.4% with 100 enrolled. The cause: the per-person limit (0.85 × distance to the nearest other member) only
tightens when the group is large enough for members to have close neighbours. In a small group every member got the
fixed 0.55 limit, and on these faces 0.55 is very loose.

### Round 5: limits calibrated to the enrolled group, detector cascade, confirm when unsure

**Why the limits must depend on the group.** On CASIA-FaceV5 every distance is about 30% shorter than on LFW.
Different people have a median distance of 0.52 instead of 0.78, and the same person 0.25 instead of 0.37. The ratio
between "same person" and "different people" is almost identical on both sets (0.49). So a fixed limit that is right for
LFW is far too loose for this population. The pages cannot know a shop's population in advance, but the enrolled
members are a sample of it.

**What changed** (`lensiq-track.js` `gallerySpread` / `enrolGallery(FACE_RULES)` / `matchFace`, `lensiq-detect.js`
`detectFacesCascade`, `attendance.js`, `customers.js`):

1. **Group-calibrated limits.** The page takes the median distance between the enrolled people's descriptors and divides
   it by the LFW value (0.736). This scale is never more than 1. The distance limit (0.50), the per-person floor (0.44)
   and the margin to the runner-up (0.09) are all multiplied by it. Groups whose faces sit closer together in the model,
   such as Asian faces with this descriptor, therefore get proportionally stricter limits. A group with fewer than 5
   people is not calibrated, so every match there needs a person to confirm it.
2. **Detector cascade.** If TinyFaceDetector finds no face at input 320, it tries 224, then 160. A face that fills much
   of the frame, such as a person close to a kiosk camera, is often missed at 320 and found at a smaller input. Faces
   found on CASIA rose from 59.6% to 85.3% of frames, and on LFW from 92.7% to 99.5%. The extra passes run only on
   frames where nothing was found. On CASIA crops the average detection time went from about 42 to 60 ms per frame on
   WASM.
3. **Confident or "please confirm".** A match is *confident* when the distance is at most 0.85 × that member's limit in
   a calibrated group. Attendance checks someone in automatically only after 2 confident frames. Otherwise it shows
   "ไม่แน่ใจ — กรุณากดยืนยันตัวตน" with **ยืนยัน** and **ไม่ใช่** buttons. Customers selects the member automatically only
   after 2 confident frames. Otherwise it shows the name as a chip for the cashier to tap.
4. Unchanged: 3-pose enrolment, quality gate, 2-of-3-frame consensus.

**How the values were chosen.** All values were tuned on **LFW only**: 24 settings of limit, margin, k and floor. The
rule was the highest mean LFW recognition among the settings that kept LFW stranger acceptance ≤ 0.5% at every group
size from 5 to 200. The 0.85 "confident" fraction was also chosen on LFW. CASIA-FaceV5 was then run as the held-out check.
Each row is 200 random groups, about 12,000 stranger visits from 500 (CASIA) or about 1,800 (LFW) distinct strangers.

**Intervals (round 10 re-run, same random groups, so the same point estimates).** "[95% CI]" is an identity-cluster
bootstrap over the stranger identities (2,000 resamples), with the design-effect Wilson guard described under 1:1
verification. "Strangers ever accepted" is the number of distinct people behind the accepted visits. When it is in single
digits, as for CASIA at 50–200 enrolled, the rate rests on a handful of look-alikes and the interval is wide. The last
column is the per-visit Wilson interval published in round 5. It was too narrow.

Disclosure: CASIA was not completely untouched. While exploring the idea, a few early settings were also scored on CASIA
from cached descriptors. The chosen values follow the LFW-only rule above, but the CASIA check is not perfectly blind.

**CASIA-FaceV5 (held out), round 4 → round 5** ("without confirmation" = recognised automatically; the rest are
recognised as a suggestion that a person confirms):

| enrolled | member recognised R4 → R5 | of which without confirmation (R5) | member shown as someone else R5 | stranger accepted R4 → **R5** [95% CI] | distinct strangers (ever accepted, R5) | stranger accepted without confirmation (R5) [95% CI] | R5 CI as published in round 5 (per visit) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 57.4% → **75.6%** | 56.2% | 0.00% | 10.97% → **0.89%** [0.67–1.15%] | 500 (69) | 0.03% [0.00–0.07%] | [0.7–1.1%] |
| 10 | 55.2% → **75.0%** | 56.1% | 0.00% | 8.83% → **0.56%** [0.41–0.74%] | 500 (52) | 0.02% [0.00–0.06%] | [0.4–0.7%] |
| 20 | 55.8% → **73.8%** | 54.7% | 0.00% | 6.34% → **0.33%** [0.20–0.51%] | 500 (27) | 0.00% [0.00–0.76%] | [0.2–0.5%] |
| 50 | 55.1% → **71.3%** | 50.6% | 0.00% | 4.23% → **0.18%** [0.05–0.44%] | 500 (7) | 0.00% [0.00–0.76%] | [0.1–0.3%] |
| 100 | 53.5% → **68.7%** | 47.4% | 0.00% | 3.13% → **0.18%** [0.04–0.45%] | 500 (8) | 0.00% [0.00–0.76%] | [0.1–0.3%] |
| 200 | 52.0% → **66.4%** | 44.5% | 0.00% | 2.25% → **0.22%** [0.00–1.15%] | 499 (2) | 0.00% [0.00–0.76%] | [0.1–0.3%] |

The round-4 numbers in this table come from the round-5 benchmark run, which uses different random groups from the
round-4 run (6.34% vs 6.49% at 20 enrolled).

**LFW (tuning set), round 4 → round 5:**

| enrolled | member recognised R4 → R5 | of which without confirmation (R5) | stranger accepted R4 → **R5** [95% CI] | distinct strangers (ever accepted, R5) | stranger accepted without confirmation (R5) [95% CI] | R5 CI as published in round 5 (per visit) |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 90.9% → 91.7% | 68.6% | 1.27% → **0.27%** [0.17–0.39%] | 1,807 (29) | 0.03% [0.00–0.07%] | [0.2–0.4%] |
| 10 | 89.8% → 90.4% | 69.2% | 1.38% → **0.39%** [0.27–0.54%] | 1,805 (38) | 0.03% [0.00–0.10%] | [0.3–0.5%] |
| 20 | 88.7% → 89.6% | 66.1% | 1.10% → **0.46%** [0.32–0.62%] | 1,807 (46) | 0.03% [0.00–0.07%] | [0.4–0.6%] |
| 50 | 86.2% → 87.1% | 61.2% | 1.04% → **0.43%** [0.30–0.60%] | 1,809 (41) | 0.01% [0.00–0.05%] | [0.3–0.6%] |
| 100 | 84.9% → 85.0% | 57.3% | 0.89% → **0.42%** [0.27–0.60%] | 1,809 (36) | 0.05% [0.01–0.12%] | [0.3–0.5%] |
| 200 | 84.2% → 82.9% | 53.9% | 1.00% → **0.36%** [0.20–0.56%] | 1,807 (27) | 0.07% [0.00–0.22%] | [0.3–0.5%] |

**What each part contributes** (CASIA, held out; 5 / 20 / 200 enrolled; stranger accepted, then member recognised):

| variant | stranger accepted | member recognised |
| --- | --- | --- |
| round 4 rules + cascade, no calibration | 14.7 / 8.6 / 2.7% | 85 / 84 / 78% |
| round-5 values without the group scale (fixed 0.50 / 0.44 / margin 0.09) + cascade | 4.6 / 0.90 / 0.04% | 82 / 78 / 64% |
| round 5 calibrated, detector 320 only | 0.87 / 0.26 / 0.31% | 52 / 49 / 43% |
| **round 5 (calibrated + cascade)** | **0.89 / 0.33 / 0.22%** | **76 / 74 / 66%** |
| round 5 without consensus (1 frame) | 1.25 / 0.57 / 0.30% | 82 / 80 / 73% |

**Findings.**

- **Point estimates meet the target on the held-out set; the intervals do not fully.** Stranger acceptance on CASIA is
  ≤ 1% at every group size from 5 to 200, down from 2.3–11%. The upper end of the identity-cluster 95% interval is still
  above 1% at 5 enrolled and at 200 enrolled (1.15% for both). Fewer than 0.05% of strangers are accepted *without* a
  person confirming. With no such events at 20–200 enrolled, the data rule out only rates above 0.76%.
- **5 enrolled is closest to the limit.** The point estimate is 0.89%, and the upper end of the 95% interval is 1.15%
  (1.1% before round 10, when visits were wrongly treated as independent). Groups this small also have the noisiest
  calibration, which is why the pages ask for confirmation below 5 people.
- **Large CASIA groups rest on very few people.** At 50–200 enrolled, every accepted stranger visit came from 2–8
  distinct people. The 0.18–0.22% rates are therefore a few look-alikes repeated across galleries, not a stable rate.
  A larger held-out set is needed before quoting them to one decimal.
- **The group scale is what fixes small groups.** Without it, the same values still accept 4.6% of strangers at 5
  enrolled.
- **The cascade pays for the stricter limits.** Calibration alone would cut CASIA recognition to 43–52%. With the
  cascade it is 66–76%, higher than round 4 (52–57%) at a fraction of the stranger risk. On LFW recognition is unchanged
  (within ±1.3 points).
- **The cost is more confirmations.** About 25–35% of recognised members on LFW, and 25–33% on CASIA, are shown as
  "please confirm" instead of being handled automatically.
- **Unchanged limits:**
  - CASIA-FaceV5 was photographed with one camera in one session. A real Thai workplace has not been measured.
  - Recognition on Asian faces (66–76%) is still well below LFW (83–92%).
  - The benchmark's "visits" are jittered copies of one photo, not real video.
- **Recommendation:**
  - Enrol at least 5 people before relying on automatic check-in.
  - Keep the on-screen confirmation.
  - Pilot on your own staff, with a manual list for the first week.
  - Re-enrol members captured before round 4.

A stronger, commercially licensed face model is still the real fix. None that runs on WASM without WebGL was available
to evaluate.

Store re-ID ("ลดการนับซ้ำ") uses body appearance (MobileNetV2), not faces, and only to avoid double counts, so it never
names a person and needs no confirmation step. Booth's optional "recognise returning visitors" mode still uses the fixed
0.50 distance (section 9) and only affects counts.

**UTKFace** has race labels but no identities, so it cannot give a genuine 1:N test. It is used for age/gender only
(section 3).

## 3. Age and gender — signage audience estimate

Model: face-api.js `ageGenderNet`, with signage.js's rules: age bands <18, 18–34, 35–54 and 55+; gender is called only
when the probability is above 0.6, otherwise "unsure". Data: a **UTKFace** aligned & cropped random subset of 2,000
faces (seed 42). Each image was centred on a 400 px grey canvas so the detector has some context.

| group | images | face found | age MAE | age band correct | gender correct (when decided) |
| --- | --- | --- | --- | --- | --- |
| all | 2000 | 78.9% | 5.0 y | 78.6% | 96.0% (97% decided) |
| adults 18–70 | 1540 | 82.8% | 5.4 y | 75.2% | 98.2% |
| Asian | 319 | 72.4% | 4.9 y | 81.4% | 92.2% |
| White | 843 | 79.5% | 5.0 y | 79.3% | 96.4% |
| Black | 363 | 84.0% | 5.7 y | 72.1% | 97.0% |
| Indian | 336 | 78.0% | 4.7 y | 81.7% | 99.2% |

**Caveat: these numbers are optimistic.** face-api's age/gender model was trained on an 80/20 split that includes
UTKFace, so part of this subset was in its training data. Treat the result as an upper bound. "Face found" is lowered by
the tight crops. The page averages over a person's frames and reports only the dominant segment of the audience. Use it
for audience mix, never for decisions about one person. Asian faces, the relevant case for Thailand, have the lowest
gender accuracy (92%) and detection rate.

## 4. Hand detection — signage touch-free kiosk

Model: `LQHand` (tfjs MediaPipe-Hands lite palm detector + landmarks, quick mode, the same call signage.js makes). Data:
a **HaGRID** 384p sample: 720 images, 40 per gesture × 18 gestures (seed 42). Ground truth is every annotated hand box.

| match | all hands (862) recall / precision | raised gesture hands (720) recall / precision |
| --- | --- | --- |
| IoU ≥ 0.3 | 84.7% / 98.8% | 88.2% / 98.6% |
| IoU ≥ 0.5 | 73.2% / 85.4% | 77.8% / 83.8% |

Recall by gesture (IoU ≥ 0.3) runs from 75% for "stop inverted" and 80% for fist to 95% for open palm and "ok". The kiosk
uses open palm, pinch and swipe. The median time was 35 ms per image on WASM. LQHand boxes span the landmarks, which is
tighter than HaGRID's boxes, so IoU 0.3 is the fairer match. HaGRID shows people 0.5–4 m from a phone or webcam, which
is close to kiosk use.

## 5. Driver drowsiness: eye closure (driver)

**Pipeline under test.** The same as `driver.js`: face-api TinyFaceDetector (input 224, score 0.4) + 68 landmarks →
eye aspect ratio (`faceMetrics()`). A frame counts as "closed" when EAR < threshold. After calibration the threshold is
clamp(baseline EAR × ratio, 0.12, 0.35); when calibration fails it is 0.25. Script: `tests/bench/driver.bench.mjs`.

**Data.**

- **Open/Closed Eyes** (AI-generated 512 px faces, ODC-BY 1.0): 1,600 closed and 400 open.
- **CEW, Closed Eyes in the Wild** (real photos; 100×100 aligned faces upscaled ×2.4; research use only): 1,192 closed
  and 1,231 open.

The photos show different people, so for the "closed eyes caught" column a driver's own baseline is approximated by the
median EAR of the open-eye photos. False alarms use each person's own baseline: every open-eye photo is shown as 8
video-like frames with shift, scale, exposure and blur, as calibration would see it.

| data set | face found (closed / open) | median EAR closed / open | AUC (EAR separates open from closed) |
| --- | --- | --- | --- |
| Open/Closed Eyes (AI-generated) | 98.1% / 96.5% | 0.277 / 0.321 | 0.85 |
| CEW (real, small crops) | 36.8% / 49.4% | 0.273 / 0.294 | 0.75 |

| rule | closed eyes caught per frame (AI-gen / CEW) | open-eye frames called closed, own baseline (AI-gen / CEW) |
| --- | --- | --- |
| baseline × 0.70 (old default) | 0.6% / 0.7% | 0.0% / 0.0% |
| baseline × 0.80 | 16.7% / 9.1% | 0.1% / 0.0% |
| **baseline × 0.85 (new default)** | **43.1% / 17.5%** | **0.1% / 0.0%** |
| baseline × 0.90 | 64.5% / 36.9% | 0.1% / 0.1% |
| fallback 0.25 (calibration failed) | 9.6% / 17.8% | 0.3% / 2.5%\* |

\* The fallback row is measured across all photos, not against each person's own baseline.

**Finding.** face-api's 68-point landmark model barely closes the eyelid points when the eyes are closed. Median EAR
drops only 7–14%, while the dlib-style ×0.7 rule assumes a drop of 30% or more. So the old default caught under 1% of
closed-eye frames. The default is now **×0.85**, which leaves open eyes alone in these tests. The settings allow up to
×0.95 for drivers whose closures are missed.

### Round 5: eye-patch classifier shipped

**What changed** (`driver.js`). Every analysed frame, the page crops a 32×16 grey patch around each eye from the video
(`eyePatchRect`: 1.8 × the eye width, centred on the 6 eye landmarks, kept in memory only) and scores it with a
130-number logistic classifier (`eyeClosedScore`: 16×8 normalised patch per eye, image-right eye mirrored, plus one EAR
term; mean logit of both eyes). Calibration now also records the driver's own median eye score; a frame is **closed when
its score exceeds that baseline + 3** (`eyeDelta`). EAR < threshold is still used for frames where no crop is available,
when calibration fails, and when the calibration frames already score above 2 (`eyeMaxBase`: dark glasses, back-light).
The blink / microsleep / long-closure / PERCLOS timing rules are unchanged.

**Training is on Open/Closed Eyes only** (ODC-BY 1.0, attribution in `LICENSES/THIRD_PARTY.md`), with
`tests/bench/driver-eye-train.cjs` (reproduces the shipped weights exactly). 5-fold out-of-fold AUC on that set is 0.999.
`eyeDelta` 3 was chosen on that set's jittered open-eye frames (0.5% called closed). **CEW was used only to evaluate**,
never to train or to pick a threshold; the one guard value `eyeMaxBase` 2 was set after seeing that 23 of 101 CEW people
calibrate above 0, so treat it as weakly tuned on CEW.

Results (`tests/bench/driver.bench.mjs`, faces found, input 224). The Open/Closed Eyes rows are the training set, so they
are optimistic; **CEW is the held-out, real-photo result.**

The page rule end to end. Each person is calibrated on 8 jittered frames of their own open-eye photo, the way
`calibrate()` sees a driver. Their thresholds are then applied to their own open frames ("called closed"), and to every
closed-eye photo of the set ("caught", averaged over people):

| data set | people / open frames | closed-eye frames caught, old (EAR × 0.85) → new | open frames called closed, old → new | people where the classifier stays off |
| --- | --- | --- | --- | --- |
| Open/Closed Eyes (AI-generated, training set) | 150 / 1,165 | 49.5% → **99.5%** | 0.09% → 0.52% | 0 |
| **CEW (real photos, held out)** | 101 / 682 | 25.7% → **84.4%** | 0.00% → **0.00%** (0 of 682) | 4 |

Pooled over the whole set (one baseline for everyone = the set's median open-eye score, as in the round-4 table above;
this overstates false alarms because people are not compared with their own baseline):

| data set | AUC EAR → classifier | EAR × 0.85: caught · open called closed · precision | classifier: caught · open called closed · precision |
| --- | --- | --- | --- |
| Open/Closed Eyes (training set) | 0.847 → 0.999 | 43.1% · 2.1% · 98.8% | 99.6% · 3.6% · 99.1% |
| **CEW (held out)** | 0.750 → **0.954** | 17.5% · 2.1% · 85.6% | **91.3%** · 15.3% · 81.2% |

Precision is the share of frames called closed that really are closed, at each set's mix (CEW about 1 : 1). Without a
personal baseline, a fixed score cut-off does not transfer from the AI-generated faces to real photos: score > 0 calls
20% of CEW open eyes closed. That is why the page uses the classifier only after calibration.

**Bottom line.**

- Per frame, on real photos, closed eyes caught rose from about **18–26% to 84%**. Open-eye frames called closed
  against the driver's own baseline stayed at **0 of 682**. *Round 6 correction: that figure calibrates and tests on
  jittered copies of the same photo, so it only measures frame-to-frame noise. Calibrating on one photo and testing on
  another photo of the same person gives **12.5%** — see "Round 6" below.*
- 95% upper bound on that false-alarm rate: about 0.5% per frame. Long-closure alerts need 1.5 s of consecutive closed
  frames, so single false frames do not raise alerts.
- Still not tested: video of real drowsy drivers, looking down, glasses, and IR or night cabins. A driver who calibrates
  with half-closed eyes, or the 4% whose calibration frames look closed, falls back to EAR.
- CEW photos are 100 px faces upscaled; video crops of a driver close to the camera are sharper.
- The page is a driver-assistance demo, not a safety device.

**Round 11 (what the page says).** The page is relabelled "เครื่องช่วยเตือนการหลับตา (ไม่ใช่อุปกรณ์ความปลอดภัย)" / "eyes-closed
awareness aid (not a safety device)". The round-6 figures below are shown before the trip starts, above the start button:
about 25% of 2-s closures alerted and about 1.4 false alarms per hour. The old "18–43% per frame, ≤ 0.1% false" text is
gone. When calibration fails, or the eye-patch classifier cannot be used (`eyeThr` null: dark glasses, backlight, eyes
that look closed during calibration), the live panel shows a warning with no close button. It quotes the per-frame catch
rate of that mode (fallback 0.25: about 18% on CEW; EAR only: about 18–26%) and stays until a recalibration succeeds with
the classifier, or the trip ends. Nothing in the detection changed.

### Round 6: honest false-alarm benchmark and an adaptive baseline

**Why the round-5 headline was optimistic.** "0 of 682" calibrated each person on 8 jittered copies of one open-eye
photo and tested on the same photo. Real driving differs from the 5-second calibration in light, pose and camera
position, and that shift is what causes false alarms.

**New benchmark** (`tests/bench/driver-session.bench.mjs`). CEW's open-eye faces are cut from LFW, with LFW file names
kept. So for 349 people we have one photo that CEW verified as open-eyed, plus 1–3 other LFW photos of the same person.
Each pair is calibrated on another photo (session A, 8 jittered frames, `calibrate()`). It is then tested on the
CEW-verified open photo (session B, 8 different jittered frames). That gives 643 pairs. Everything runs at LFW's native
250 px through the page pipeline (TinyFaceDetector 224 + landmarks + eye patches). The calibration photos are not labelled
for eye state. A blink in one would raise that person's baseline, which can hide a false alarm but not create one.

| calibration → driving | pairs / people | open frames | open frames called closed | people with ≥ 1 false frame |
| --- | --- | --- | --- | --- |
| same photo, other jitter (round-5 method) | 349 / 349 | 2,751 | 0.36% (10) | 10 |
| **different photo of the same person** | 643 / 349 | 5,058 | **12.50%** (632) | 118 |
| no personal baseline: pooled median of everyone's calibration (−2.96) + 3 | — | 5,058 | 10.41% | — |
| no personal baseline: fixed score > 3 | — | 5,058 | 1.97% | — |

The fixed score > 3 rule gave 4.1% on CEW's own 100 px crops (the evaluator's figure) and 2.0% on these LFW frames.
Between two photos of the same person, the median open-eye score moves by −3.6 / −0.3 / +3.0 / +6.0 (p10 / p50 / p90 /
p99). In 10.3% of pairs it moves by more than `eyeDelta` (3), so a baseline fixed at calibration is only as good as the
calibration light.

**What changed** (`driver.js`, `createMonitor`). The eye-score threshold now follows the trip: it is the larger of
the calibration threshold and (20th percentile of the last 10 s of eye scores) + `eyeDelta`, with a cap of calibration
+ 6 (`eyeAdaptive`, `eyeAdaptWindowMs`, `eyeAdaptQ`, `eyeAdaptMaxRise`; `adaptiveEyeBase()`).

- It can only rise, so it never becomes more sensitive than calibration.
- It starts only once the window is 80% full (8 s), so a closure right after calibration is not absorbed.
- A low percentile moves only when eyes are closed for more than 80% of the window. A 1.5-s long-closure alert and a
  3-s danger alert fire well before that.
- The blink, microsleep, long-closure and PERCLOS timing rules are unchanged.

**Simulated drives** (15 fps through `createMonitor`, 643 pairs, seeded). There are three scenarios:

- Open eyes for 10 min on session-B frames. The trip starts in light that differs from calibration, so every alert is
  false.
- 2 min on session A, then 2 min on session B. This models a light change mid-trip; alerts in the B half are false.
- Drowsy: 1 min open, then 5 min with a 2-s closure every 12 s (PERCLOS ≈ 17%). The closed frames are CEW closed-eye
  photos of other people, so these rates are approximate.

| monitor | open frames called closed | false alarms / min (long closure + PERCLOS) | pairs with ≥ 1 false alarm in 10 min | microsleeps / min | false alarms per mid-trip light change | drowsy: 2-s closures alerted | drowsy: PERCLOS alert raised |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixed baseline (round 5) | 12.65% | 0.123 | 147 / 643 | 1.195 | 0.428 | 32.4% | 75.6% |
| **adaptive, 20th pct of 10 s (default)** | **1.92%** | **0.024** | 108 / 643 | **0.044** | **0.110** | 25.1% | 72.9% |
| adaptive, 35th pct of 10 s | 1.26% | 0.022 | 100 / 643 | 0.038 | 0.073 | 23.0% | 71.7% |
| adaptive, median of 10 s | 1.06% | 0.022 | 96 / 643 | 0.037 | 0.062 | 21.2% | 70.5% |
| adaptive, 20th pct of 30 s | 2.24% | 0.031 | 134 / 643 | 0.076 | 0.236 | 24.9% | 74.0% |

Per frame, CEW closed-eye photos caught against each pair's threshold: fixed 86.3%, adaptive 83.8%.

**Bottom line.**

- When the drive does not match calibration, false alarms drop about 5× with the adaptive baseline: 0.12 → 0.024 per
  minute (7.4 → about 1.4 per hour). Microsleep notices drop 27×. A light change mid-trip now causes 0.11 false alarms
  instead of 0.43.
- That is still **not zero**. About 1 in 6 simulated 10-minute drives had at least one false alarm, mostly in the first
  8 s, before the window fills, and from PERCLOS.
- The cost is sensitivity: 2-s closures alerted fell from 32% to 25%, and per-frame catch from 86% to 84%, in this
  approximate drowsy simulation. The 20th percentile was kept rather than the median because it is the hardest for real
  closures to pull up.
- Recalibrating after a big light change ("ปรับเทียบใหม่") remains the best fix.
- Still not tested: video of real drowsy drivers, and IR or night cabins. Still photos jittered into "video" do not
  reproduce real blink dynamics.

## 6. Facial expression (neuro)

**Pipeline under test.** face-api `faceExpressionNet` with neuro.js's detector (TinyFaceDetector 320, score 0.45) plus
landmarks. Data: **FER-2013** PrivateTest, 100 faces per class (700 in total); research use only, evaluation only. The
48×48 faces were upscaled ×4 onto a 320 px canvas. Script: `tests/bench/neuro.bench.mjs`.

| | faces used | accuracy (7 classes, chance 14%) | valence sign (+ / 0 / −) correct | neutral | happy | surprised | sad | angry | fearful | disgusted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| page pipeline (face found 49%) | 346 | 52.0% | 68.2% | 68% | 87% | 72% | 47% | 36% | 14% | 38% |
| classifier alone on the face crop | 700 | 59.1% | 74.4% | 66% | 81% | 73% | 45% | 43% | 20% | 86% |

The main confusions are sad → neutral (30%), fearful → neutral or sad (27% / 26%) and angry → neutral (20%). For
reference, human agreement on FER-2013 is about 65%.

**What this means.**

- The model reads happy, surprised and disgusted reasonably well. Sad and angry are weak, and fearful is close to
  unusable.
- **A facial expression is not a felt emotion** (Barrett et al. 2019). The page reports what faces show on average
  across a test group, never what one person feels.
- It is not known whether face-api's training data overlapped FER-2013.

## 7. Quality control: bottle inspection (qc)

**Pipeline under test.** `QC.calibrate` and `QC.inspect` with the page's default tolerances: fill ±6 px, cap ΔE 15, tilt
6°, lift 4 px, label similarity 80, label shift 6 px, and (round 5) label angle 3.5°. Script: `tests/bench/qc.bench.mjs`.

**Images are synthetic.** The renderer is independent of the page's simulator and is designed to be harder:
anti-aliased PET bottle, cylindrical shading, a highlight running through the fill window, concave meniscus,
wrap-around label, ridged cap. Defects come in graded sizes, some inside tolerance (they should pass) and some outside
(they should be rejected). The operator procedure is followed: capture the empty belt, calibrate on one good bottle,
then run. Lighting conditions are applied *after* calibration: brightness = gain on every pixel, contrast = stretch
around mid-grey, both clipped at 0–255 like a camera.

**What changed in round 5** (`qc.js`):

1. **Per-frame photometric normalisation.** At calibration the page keeps a small sample of the golden bottle's pixels
   (one in every 2–3 px over the box around the fill, cap and label areas, about 12 KB per recipe). On each inspection it
   fits, per colour channel, *current ≈ gain × golden + offset* with a robust fit (Theil–Sen on binned medians, then
   Tukey-weighted least squares; saturated pixels ignored). A defect changes a minority of pixels, while a lighting
   or exposure change moves all of them together, so the fit follows the light, not the defect. The fit is only used
   when it explains the frame better than "no change". The frame is then mapped back to calibration lighting for the
   fill, label and cap-colour checks, and the empty-belt image is mapped forward to the current lighting for the cap
   mask, so clipped highlights still match. Recipes calibrated before round 5 work as before until recalibrated;
   `rec.photoNorm = false` switches it off.
2. **Label angle check.** The label area is cut into 5 vertical strips. Each strip's row profile is matched against the
   same strip of the golden label (correlation, so it ignores brightness and contrast, with sub-pixel refinement). A
   straight line through the strip offsets gives the label angle. A label tilted more than `tol.labelAngle` (default
   3.5°) is rejected as "ฉลากเบี้ยว/ผิดตำแหน่ง", and the angle is shown in the result.

**Before → after** (dark drink, with the empty-belt image; before = round 4, 30 good bottles and 10 per defect per
condition; the light ±10% / +25% / −30% "before" columns are the round-4 run with 60 good and 25 per defect):

| condition after calibration | good bottles falsely rejected | label skewed 5° / 10° rejected |
| --- | --- | --- |
| none (as calibrated) | 0% → 0% | 0 / 0% → **100 / 100%** |
| light ±10% | **100% → 0%** | — → 100 / 100% |
| light +25% / −30% | **100% → 0%** | — → 100 / 100% |
| brightness +20% | **100% → 0%** | 100 / 100%\* → 100 / 100% |
| brightness −20% | **100% → 0%** | 100 / 100%\* → 100 / 100% |
| contrast +10% / −10% | 0% → 0% | 0 / 0% → 100 / 100% |
| brightness +20% with contrast −10% | **100% → 0%** | 100 / 100%\* → 100 / 100% |
| brightness −20% with contrast +10% | **100% → 0%** | 100 / 100%\* → 100 / 100% |

\* Before round 5 these "rejections" were not skew detections: every bottle was rejected for cap colour, cap tilt or
"no label", good or not. Without the empty-belt image, round 4 already passed +20% brightness but rejected every
bottle at −20% ("no label").

**After round 5, all conditions** (30 good + 10 per defect; dark drink with the empty-belt image; the dark drink without
it and clear water gave the same pattern):

| | as calibrated | stop position ±8/±3 px | light ±10%, +25%, −30% | brightness ±20% | contrast ±10% | brightness ±20% with contrast ∓10% | side light ±15% | glare | defocus σ 1.2 | noise σ 10 | all at once |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| good bottles falsely rejected | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| fill 9 px low / 16 px low / 9 px high rejected | 100% | 95 / 100 / 90%† | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| no cap / wrong cap colour rejected | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| cap tilted 9° / 15° rejected | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| cap raised 6 px / 10 px rejected | 100% | 83 / 100%† | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100 / 100% (80 / 100% without the belt image) |
| no label / label 10 px or 20 px low rejected | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| **label skewed 5° / 10° rejected** | **100 / 100%** | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% | 100 / 100% |
| within-tolerance defects passed (incl. label skewed 2°) | 100% | 90–100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 90–100% |
| scratch on the body | not inspected (passes) | | | | | | | | | | |

† Stop jitter, re-measured with 40 per defect: identical with normalisation on and off (95 / 100 / 90% fill, 83% cap
lift), so these misses come from the belt position, not the new step. Round 4 measured 96 / 100 / 92% and 72%.

`tests/unit/qc.test.js` locks this in on the page's own simulator: no false rejects at ±20% brightness, ±10% contrast
and their combinations (with and without the belt image, three stop positions), every simulated defect still rejected
under those changes, labels rotated ±5°, 7° and ±10° rejected (also at −20% light), 0–2° passed.

**Findings.**

1. With stable lighting and a fixed camera the checks work, with 0% false rejects. Belt stop jitter of ±8 px still costs
   some misses on 6 px cap lifts (about 80% caught).
2. **Global lighting changes after calibration no longer reject good bottles.** Round 4 rejected every bottle after a
   ±10% change. Now ±10%, ±20%, +25% / −30% brightness and ±10% contrast give 0% false rejects with every defect still
   caught. This covers a lamp dimming, a shutter or auto-exposure change, or camera contrast drift. It does **not** cover
   a light that changes *shape* (a new shadow, a reflection moving across the bottle), a colour-temperature change
   much larger than tested, or a light so bright that the bottle itself clips. Recalibrate after moving lamps.
3. **Skewed labels are now detected:** 5° and 10° are rejected in every condition, 2° passes. The angle is measured
   relative to the golden bottle, so calibrate on a straight label.
4. The continuous-mode trigger (bottle presence) still compares raw brightness with the empty-belt image. A large
   lighting change can keep it "present", so recapture the empty belt after changing the light.
5. Scratches and dents are not inspected at all.

These are synthetic images: they show which conditions break which check, not the rate on a real line. Run a pilot with
labelled rejects.

## 8. Checkout: camera barcode reading

**Pipeline under test.** checkout.js `BarcodeDetector` with every supported format, plus the page's code gate. Formats on
this Mac: aztec, code_128, code_39, code_93, data_matrix, ean_13, ean_8, itf, pdf417, qr_code, upc_e.

**Data.** Synthetic. EAN-13 (885 prefix), UPC-A and Code 128-B codes are drawn by our own renderer onto a 640×480
package scene. Each symbology gets 60 codes per condition, 4 frames each (the page's 250 ms ticks, with slight
movement). Script: `tests/bench/checkout.bench.mjs`.

| condition | read in one frame (EAN-13 / UPC-A / Code 128) | right item added within 1 s, new rule (2 agreeing reads) | wrong code added: 1 read → 2 reads |
| --- | --- | --- | --- |
| baseline (code ≈ 35% of frame width) | 100 / 100 / 100% | 100% | 0% → 0% |
| code 22% of width | 98 / 100 / 98% | 98% | 0.6% → 0% |
| code 18% of width | 68 / 77 / 83% | 57% | 3.9% → 0% |
| code 13% of width | 0 / 0 / 0% | 0% | 3.9% → 0% |
| rotated 30–180°, tilted 45°, on a can (±50° wrap) | 100% | 100% | 0% |
| tilted 65° | 0% | 0% | 11.1% → 0% |
| defocus σ 1 px / 2 px | 77 / 75 / 100% · 0% | 85% · 0% | 0% → 0% |
| motion blur 6 px | 0% | 0% | 2.8% → 0% |
| noise σ 35, 35% exposure, JPEG q 0.1 | 100% | 100% | 0% |
| glare spot | 97 / 100 / 100% | 99% | 5.6% → 0.6% |
| 15–30% of the code covered | 0% | 0% | 5.6–10.6% → 0.6% |
| random hand-held mix | 78 / 78 / 80% | 79% | 0% → 0% |
| empty scenes (300) | 0 false reads | | |

Averaged over all conditions, the share of scans that put a wrong code through is **1.69% with 1 read and 0.06% with 2
reads**.

**Change made.** The camera now needs **two agreeing reads** (about 250 ms apart) before a code counts. Most wrong reads
were partial EAN-8 or UPC-E decodes of a larger code, or EAN-13 reads that still passed the checksum under glare.

**Limits.**

- The decoder comes from the OS: Apple Vision on macOS, ML Kit on Android. Desktop Chrome on Windows and Linux usually
  has no BarcodeDetector; the page then falls back to a USB scanner or typing.
- Keep the code at least about 1/5 of the frame width, sharp, and not covered.
- Product recognition without barcodes (the shop's own taught SKUs) is still unmeasured: no public dataset exists.

## 9. Not yet benchmarked

| page | why there is no number yet |
| --- | --- |
| booth (visitor counting) | no booth video with ground truth. Since round 4 the default is **count-only**: faces are tracked by position only, and no face descriptor is computed or stored (DPIA R2). That avoids biometric data but counts a returning visitor, or one seen by two cameras, again. The optional "recognise returning visitors" mode uses the face pipeline of section 2 at distance 0.50. |
| checkout product recognition (no barcode) | depends on the products each shop teaches; there is no public dataset of a shop's own SKUs |

## 10. Predicted attention (creative, Creative Lab)

**Pipeline under test.** `creative-core.js` exactly as `creative.js` runs it: image → canvas ≤ 1600 px (faces: face-api
TinyFaceDetector 416 / 0.5) and ≤ 512 px (`detectText`, then `components`: spectral residual (Hou & Zhang 2007) and an
Itti–Koch-style centre–surround model at 128 px), `combine` with face/text priors and a centre bias. No deep saliency
model is used (licence reasons: LICENSES/THIRD_PARTY.md). Data: **MIT1003** (Judd et al. 2009), 1,003 images, 15
viewers each, 3 s free viewing. No stated licence: evaluation and the choice of 7 weights only, nothing is shipped.
Split: seeded shuffle, 300 tuning images (`--fit`, coordinate search on NSS + CC), **703 held-out images** reported
below. Metrics as in Bylinskii et al. (PAMI 2019), computed on the 128 px map grid: AUC-Judd, AUC-Borji (100 splits),
NSS, CC. Script: `tests/bench/creative.bench.mjs`.

| model (703 held-out images) | AUC-Judd | AUC-Borji | NSS | CC |
| --- | --- | --- | --- | --- |
| chance (uniform map) | 0.509 | 0.500 | 0.000 | 0.000 |
| centre bias only (σ 0.24) | 0.817 | 0.806 | 1.245 | 0.401 |
| spectral residual only | 0.699 | 0.672 | 0.735 | 0.204 |
| Itti-lite only | 0.663 | 0.653 | 0.589 | 0.173 |
| SR + Itti-lite + face/text priors, no centre bias | 0.724 | 0.708 | 0.943 | 0.262 |
| SR + Itti-lite + centre bias, no face/text priors | 0.822 | 0.806 | 1.471 | 0.439 |
| **shipped (creative.html)** | **0.831** | **0.814** | **1.591** | **0.470** |
| fitted optimum (pure centre bias, σ 0.18; not shipped) | 0.852 | 0.817 | 1.719 | 0.517 |
| unfitted defaults (sr/ik 0.5, face 0.5, cb 0.75) | 0.822 | 0.811 | 1.412 | 0.429 |
| shipped, 74 images with a detected face | 0.878 | 0.856 | 2.247 | 0.591 |
| same 74 images, no face prior | 0.832 | 0.820 | 1.413 | 0.386 |
| shipped, 605 images with detected text boxes | 0.828 | 0.811 | 1.573 | 0.464 |
| same 605 images, no text prior | 0.823 | 0.806 | 1.544 | 0.455 |

**What this means.**

- On ordinary photos most of the signal is the **centre bias**: "look at the middle" alone reaches AUC-Judd 0.82. The
  image-driven part adds a modest but real gain (NSS 1.25 → 1.59, CC 0.40 → 0.47).
- The **face prior** is the biggest single help where faces exist (NSS 1.41 → 2.25). The text prior helps a little.
- The fit wanted a pure, tight centre bias. That is partly a lab artefact (centred images, first fixation at the
  screen centre) and would bury logos and CTAs at the edges of real creatives, so a milder one ships (NSS 1.59 vs 1.72).
- Modern deep models score much higher on this kind of benchmark. This map is a coarse, explainable estimate. Use it to
  compare versions of one creative, not as a measurement of where people look.
- MIT1003 is natural scenes, not ads, packaging or shelves; there is no public eye-tracking set of Thai/Chinese ads.
  The predicted order (winner-take-all + inhibition of return) has **not** been validated against real scanpaths.
- Clarity metrics are not benchmarked against human ratings: complexity (edge density + colour count) is a documented
  heuristic; text boxes come from an edge-morphology heuristic (no OCR), checked only on synthetic text in the unit/e2e
  tests; WCAG contrast is computed exactly on the two colour clusters of each box.

## 11. Studio: outfit change on a portrait (studio)

**What is measured.** Whether the picture the page shows has a defect a person would notice. Script:
`tests/bench/studio.bench.mjs`; it renders `studio.html?cpu` in headless Chrome without WebGL, the way the page runs.
Each portrait is rendered with no outfit (new background and retouch only) and with each of the four built-in outfits
(civil, khaki, suit_navy, lady).

**Data.** 62 public-domain Wikimedia portraits, mostly official and press photos: front-facing, one person, head and
shoulders. The pinned list is `tests/bench/studio-portraits.json`. The portraits are split **by person**:

- 27 "dev" people, used while building the fix and the checks;
- 35 "test" people, rendered only once the code was frozen.

**Labels** (`tests/bench/studio-labels.json`). One rater, the AI coding agent that also wrote the code, judged every
render from a review sheet (the full image plus a neck crop), without seeing any QA output. There were **no human
raters**, the rater was not independent, and the rater knew which code version was rendered. A render counts as
defective for any of these:

- a visible join at the neck or jaw (notch, straight cut, white gap, pasted or wrong-coloured neck);
- clearly wrong garment geometry;
- leftovers of the original clothes or background.

The CG look of the garment itself is not counted. Treat the numbers as an honest estimate, not a calibrated measurement.

| 35 test people (140 outfit renders) | result [person-cluster 95 %] |
| --- | --- |
| outfit renders with a visible defect, before the check | **72.9 % [56.7–87.1]** (102/140) |
| defects the automatic check catches (outfit withheld) | 36.3 % [21.2–52.9] (37/102) |
| clean outfit renders the check withholds anyway | 21.1 % [5.3–44.8] (8/38) |
| outfit renders shown after the check that still have a defect | **68.4 % [49.0–85.4]** (65/95) |
| what the page shows (outfit, or the no-outfit version when withheld) with a visible defect | 56.4 % [41.4–71.4] (79/140) |
| no-outfit version (new background + retouch) with a defect | 22.9 % [11.4–39.0] (8/35) |
| people with all four outfits clean | 9/35 |

**Intervals (round 11).** The brackets are person-cluster bootstrap intervals (4,000 resamples of people,
`tests/bench/metrics.cjs` `personClusterCI`; reproduce with `node tests/bench/studio-intervals.mjs`). Each person gives 4
outfit renders and the labels follow the photo far more than the outfit, so the 140 renders are not 140 independent draws: the
design effect is 2.3–3.9 (3.87 for the first row), and the per-render Wilson intervals published before round 11 (for example
[65.0–79.5] for the first row) were about half the honest width. Rows with one render per person (the no-outfit version) are
unchanged.

On the dev people the figures are similar: 64.8 % (70/108) of outfit renders are defective, the check catches
37.1 % (26/70), and 59.5 % (44/74) of the outfit renders it lets through still have a defect.

**Round 9 change: a wider neck under the ears.** The synthetic neck is now as wide as the face at earlobe level and
tapers to the collar. On sides covered by long hair, it keeps the old, narrower width. Effect on the same people,
with old and new renders labelled the same way:

- dev: 77 → 70 of 108 renders defective;
- the 19 test people labelled in both rounds: 57 → 56 of 76.

So it is a small, real gain on ear-exposed men whose neck used to look pinched, and almost nothing on unseen people. It
also has a known side effect: beside a hijab the wider neck can show as a skin-coloured band (one dev person).

Two other ideas were tried and **not shipped**:

- Closing the outline under the head (a morphological fill of the gaps between jaw, hair and shoulder). It filled
  real gaps between bob hair and shoulders with dark blocks.
- A "jaw covered by hair" rule (`jawCover`). On dev it made the shown set worse: 12 of the 19 renders it kept were
  defective (63 %), against 44 of 74 (59 %) without it.

**What this means.**

- **The outfit change is a preview, not a finished photo.** About 7 in 10 outfit renders on clean, front-facing
  official portraits have a visible defect. The most common one is a straight cut, notch or white gap beside the jaw
  or under the ear, usually on one side. Next come gaps between long hair and the shoulder, leftovers of flags,
  necklaces and chairs, and balloon-shaped jackets on crossed arms or leaning poses.
- **It depends on the photo, not on the outfit.** Of 35 test people, 9 got four clean outfits, 25 got four defective
  ones and 1 got a mix. Trying another outfit rarely helps; trying another photo might.
- **The automatic check works as a filter, not as a guarantee.** When it withholds an outfit, it is usually right
  (82 % of withheld renders were defective). But it misses about two thirds of the defects. None of its
  measurements separates good from bad renders well (AUC 0.41–0.65 on dev).
- The page therefore says so every time it shows an outfit: the outfit is labelled a preview, with the measured miss
  rate, and a one-tap switch to the version without the outfit. When the check fails, the page shows the no-outfit
  version by default, and the outfit only as a draft on request.
- The version without the outfit (new background + retouch) is the dependable output, though not flawless: 23 % have
  a leftover, usually a piece of flag or chair that the person matte kept.
- A reliable outfit change on arbitrary portraits would need a generative inpainting model for the neck and jaw. This
  page does not use one: everything runs in the browser.

### Round 10: a high-collar cover, a second rater, and the outfit off by default

**What changed on the page.**

- The page now opens on the version **without an outfit** (new background, lighting, retouch). That is the dependable output. An outfit
  appears only when the user picks one, and it is labelled "ชุดตัวอย่าง (พรีวิว) / outfit preview".
- **High-collar cover** (`studio-core.js` `coverLayer`). A knit turtleneck is drawn from just under the jaw (hidden behind the chin)
  down into the collar, as wide as the neck. The synthetic neck is not drawn in this version. In the default mode ("auto"), the page
  uses it when the strip beside the lower jaw is not covered by hair (`jawFeatures.open ≥ 0.5` on the plain render). The plain
  version stays available ("ไม่ใช้" / never).
- Exports that contain a synthetic garment carry a corner label "ภาพจำลองชุด / outfit preview" (it can be switched off only for
  ordinary PNG/JPEG files, never for ID photos), the filename suffix `-outfit-preview`, and a PNG `tEXt`/`iTXt` note (a JPEG `COM`
  note for JPEG files). Exporting a draft that failed the check, or making an ID photo with an outfit, asks for confirmation first.
  ID photos use the no-outfit composition unless the user ticks "ใส่ชุดตัวอย่างในรูปติดบัตร".
- An **ID-photo checker** (`studio-qa.js` `idSpecCheck`) checks the pixel size at 300 DPI, the head height (crown to chin, 50–75 %
  of the photo; ICAO passport photos need 71–80 %), the space above the head, centring, a plain background (RGB deviation < 10),
  face exposure, and whether a synthetic outfit is present. It also says that many agencies reject edited photos: for example,
  Australian passport photo guidance (Australian Embassy Thailand) asks for photos that are not digitally altered, and South
  Korea does not accept AI-generated or AI-edited ID photos.

**Data and labels.** The same 62 portraits and the same person split. The round-9 renders were reproduced exactly: all 248
garment renders gave the same gate result as in round 9, logged per render. Each person × garment was rendered twice: as before
("plain") and with the cover. The new labels (`tests/bench/studio-labels-r10.json`) come from a **second rater**: fresh AI agent
instances that did not write the code. They saw blind review sheets, with the 9 cells per person in random order under neutral
codes and no QA output, and used the same criteria. There are still no human raters. The second rater applied the garment-shape
criterion more strictly than the round-9 rater (sack bodies, tube sleeves and pasted hands count). On the 248 plain renders, the
two raters agree on 87/108 (dev) and 117/140 (test).
Raw agreement is inflated when about 70 % of renders are defective, so round 12 adds chance-corrected agreement with
person-cluster 95 % intervals (`node tests/bench/studio-intervals.mjs`, `lensiq-stats.js` `raterAgreement`): Cohen's κ = 0.54
[0.19–0.83] (dev) and 0.60 [0.28–0.84] (test), Gwet's AC1 = 0.67 [0.40–0.89] and 0.72 [0.48–0.90]. That is moderate agreement, and
the lower bounds are low. Rows counted from fewer than 15 people (for example "calibrated confidence: rule-passing plain renders",
6 people) are marked "indicative only" in that output. Read their intervals as a rough range, not a measured rate.

| test: 35 people, 140 person × garment pairs (second rater) [person-cluster 95 %] | round 9 page | round 10 page |
| --- | --- | --- |
| outfit render with a visible defect | 69.3 % [53.4–83.6] (97/140) plain | **45.7 % [30.7–61.4] (64/140)** with the cover |
| outfit renders the page shows (gate passed) that are defective | 61.1 % [42.7–79.4] (58/95) | **36.2 % [20.6–52.9] (34/94)** |
| what the page shows once an outfit is picked, with a defect | 51.4 % [36.4–66.4] (72/140) | **34.3 % [21.4–48.6] (48/140)** |
| defects the gate withholds (recall) / withheld renders that were defective (precision) | 40.2 % (39/97) / 86.7 % (39/45) | 46.9 % (30/64) / 65.2 % (30/46) |
| what the page shows on opening a photo (no outfit), with a defect | — | 20.0 % [8.6–35.9] (7/35) |

**Intervals and the paired test (round 11).** Brackets are person-cluster bootstrap intervals (design effect 2.6–3.7 on the
outfit rows; per-render Wilson intervals, such as [61.2–76.3] for the plain row, were about half as wide). Plain and cover are
the same person × garment, so they are compared as pairs. On test the cover fixed 36 pairs and broke 3: McNemar exact
p = 3.6 × 10⁻⁸ if the 140 pairs were independent; clustered by person (sign-flip test on the 14 of 35 people whose result
changed) p = 0.003, and the defect rate falls by 23.6 points [10.0–37.9, person-cluster]. On dev (13 fixed, 4 broke) the
clustered test gives p = 0.31 (McNemar 0.049), a fall of 8.3 points [−5.6–21.3]: not distinguishable from no effect.
`node tests/bench/studio-intervals.mjs` prints every row with both interval methods.

On test, the cover fixed 36 of the person × garment pairs and introduced a defect in 3. On dev, where it was designed (6 people
looked at while tuning its width and height), the gain is smaller. Plain outfits had a defect in 83/108, outfits with the cover
in 74/108, and the auto mode in 70/108. The cover fixed 13 pairs and broke 4. What the page shows was defective in 64/108 in
round 9 and 53/108 in round 10. The cover does not touch defects above the jaw angle: ears cut by a straight line, leftover
flags and chairs, holes in hats, and sack-shaped bodies on crossed arms. These remain.

**Learned gate: tried, not shipped.** A logistic regression was trained on dev (plain and cover renders, 216 rows, 27 people).
Its inputs were the QA measurements (number of failed rules, `revealed`, body width, `jawCover`, neck lightness) and new
measurements on a standard-scale jaw/ear crop (`jawCrop` / `jawFeatures`: gap under the jaw, open jaw strip, straight ear cut,
cut pixels, edge jumps, straight edges) plus a cover flag. With person-grouped 5-fold CV on dev, its AUC was **0.40–0.47**: no
better than chance. Labels follow the person far more than the outfit (in 26 of 27 dev people, all four plain outfits got the
same label), so 27 people are too few to learn from. The model trained on all of dev scored AUC 0.68 on test, once. Since dev
gave no reason to trust it, it does not decide anything on the page. What the page uses instead is a **calibrated confidence by
group**: the share of rule-passing renders that were clean on dev. It was 45 % with the cover (24/53) and 41 % without (7/17).
The stated bar for showing an outfit without being asked is 50 %. No group reaches it, so the page never picks an outfit by
itself (`StudioQA.defaultOutfitAllowed()` is false). On test, the same groups came out at 69 % (50/72) with the cover and 45 %
(10/22) without. The bar was fixed on dev and was not moved after seeing test. More labelled people are needed before the
default changes.

**What this means.** With the cover, about 1 in 3 of the outfit images the page shows still has a visible defect on unseen people
(36 %), down from about 3 in 5. The page says so on every outfit. The outfit remains a preview, not a photo.

## 11b. Photo booth ID photo with an outfit (photobooth, round 10)

**What is measured.** The ID-photo mode of `photobooth.html`. Script: `tests/bench/photobooth.bench.mjs`. Each of the same 62 portraits
goes through the same processing as a camera capture (face landmarks, MODNet cut-out, quality check). The 1-inch ID photo is
then made with no outfit, and with the two outfits that the civil-service presets choose: "สอบ/สมัครราชการ" picks civil and
"ราชการ (ชุดกากี)" picks khaki. Labels (`tests/bench/photobooth-labels.json`) come from fresh AI agent instances working on blind
sheets, with the same criteria. There are no human raters.

| ID photo [person-cluster 95 %] | dev (27 people) | test (35 people) |
| --- | --- | --- |
| drawn outfit with a visible defect | **100 % [87.5–100] (54/54)** | **100 % [90.1–100] (70/70)** |
| the new outfit check (`boothCheck`: original clothes showing, straight hair cut, gap at the neck) withholds | 41/54 (75.9 % [57.7–90.7]), all defective | 43/70 (61.4 % [45.6–77.1]), all defective |
| outfit renders the check lets through that are still defective | 13/13 [64.6–100] | 27/27 [78.5–100] |
| no-outfit ID photo with a defect | 14.8 % [3.7–32.9] (4/27) | 37.1 % [22.9–54.3] (13/35) |

Brackets (round 11): person-cluster bootstrap 95 % intervals (2 outfit renders per person; design effect ≈ 1.9 for the
withheld row). `node tests/bench/studio-intervals.mjs` reproduces them.

The drawn outfit is placed under the chin and the head is redrawn over it. On these head-and-shoulders portraits, the person's own
jacket, collar or necklace almost always shows above or around it. The check's limits were set before labelling and were not
tuned; nothing could have been tuned, because every dev render was defective. **What ships:** the presets still pick their outfit,
but the page shows the no-outfit photo first, with a note giving these numbers and a button to view the outfit as a draft.
The draft carries the corner label "ภาพจำลองชุด / outfit preview" on screen, in the 4×6 sheet and in the file (PNG note,
`-outfit-preview` filename). Download, print, share and hand-off ask for confirmation while an outfit is shown. In the test
split, the no-outfit photo itself is defective in 13 of 35 people, mostly from leftover flags or background and from torsos cut
by a straight line; one photo lost the person completely (t07). Treat it as a draft too, and check it before printing.

### Round 11: reproducible tables, a no-outfit clean-up, a photo pre-check and a review step before printing

**Reproducible from the repo.** The per-render gate results are now committed next to the labels, with no image data:
`tests/bench/studio-gate-log-r10.json` (person, garment, plain/cover, what the page showed, gate pass, fail reasons, QA
measurements, jaw-strip features, timings; written by `studio.bench.mjs --log`) and `tests/bench/photobooth-gate-log-r10.json`.
They were re-rendered from commit b8956a6 on this machine and reproduce every §11 / §11b count above exactly.
`node tests/bench/studio-tables.mjs --check` recomputes every table from labels + logs (no portraits, no browser) and fails when a
count is missing from this section; it runs in CI through `tests/unit/studio-tables.test.js`. The learned-gate AUCs come out at
0.473 (dev CV) and 0.684 (test). Median first result after load in that run: 2.6 s (dev) and 2.4 s (test), p95 3.0–3.1 s
(900–1200 px portraits, CPU only).

**No-outfit clean-up** (`studio-core.js` `cleanLeftovers`, used by studio and the photo booth). It removes pieces not
connected to the person (anything smaller than 35 % of the main body) and faint lines far from the body. When the person
matte covers less than 5 % of the photo, the page shows the original photo with a note instead of an image with the person
missing (t07). The photo booth also fills a small gap under the torso (at most 0.35 face widths) when the original photo is a
little shorter than the ID frame. Tried and **not shipped**: removing matte regions that the 6-class parser calls background
(it cut holes in dark suits in 9+ of 62 people), and stretching the photo's edges further (stripes and bars in d18, t33, t35).
Attached flags and chairs (t01, t34, t35) are still there.

Labels for the changed renders (`tests/bench/studio-labels-r11.json`) are **not independent**: renders whose pixels did not
change keep their round-10 label, and the 14 changed renders were judged by the coding agent that made the change, side by side
and not blind.

| no-outfit output with a visible defect | dev round 10 → 11 | test round 10 → 11 |
| --- | --- | --- |
| studio (new background + retouch) | 6/27 → 5/27 | 7/35 → 7/35 |
| photo booth 1-inch ID photo | 4/27 → 3/27 | 13/35 → 11/35 |

On test, t07 now shows the original photo and is still counted as a defect. No-outfit output is still far from the 5 % target.

**Photo pre-check before outfits** (`studio-qa.js` `photoSuitability`: frontal, neck visible, hair off the shoulders, plain top,
shoulders in frame; measurements in `tests/bench/studio-gate-log-r11.json`). The limits were set on dev, where they separated
well: on flagged photos 52/56 outfit renders (auto mode) were defective, on passed photos 18/52. On test they do **not**
separate: 33/76 defective on flagged photos against 31/64 on passed ones. The page therefore shows the pre-check as advice in
the outfit section and never hides or withholds an outfit because of it.

**Review before printing** (photo booth ID mode, mandatory once per photo). Before download, print, share or hand-off, the
page shows the ID photo with red frames on detached pieces and straight torso cuts (`studio-qa.js` `idLeftovers`) plus the
ID-photo requirements (`idSpecCheck`). The user must tick "checked" to continue. The result is written into the PNG as a
`LENSIQ-ID-Check` text chunk. The automatic marks are a weak aid: they show a finding on 4/11 of the defective round-11 test
photos, and mark a leftover or cut on 2/24 clean ones. The point of the step is that a person looks at the photo.
`photobooth-gate-log-r11.json` records what the step found for every portrait.

### Round 12: a no-outfit check that falls back to the original photo, the outfit check fails closed, booth outfits off by default

**Not measured yet.** The portraits are not in the repo and were not available for this round, so nothing below changes a count
in §11 / §11b. The next run of `studio.bench.mjs --render --only none --log …` records the new verdict per portrait (`nq`: pass,
fails, measurements, and whether the page showed the original photo), and the labels then give its effect.

- **No-outfit check** (`studio-qa.js` `noOutfitCheck`). The round 10–11 labels name the common defects of the no-outfit output:
  background attached to the person (flags, chair backs: t01, t34, t35), torsos cut by a straight line, and a lost person (t07).
  The check looks for each: the person piece under 5 % of the photo, a detached piece ≥ 0.15 % of the photo, cut-out kept beside
  the head above the chin (more than 1.1 face widths from the face centre, not hair, not skin; area > 0.08 face widths²), the torso
  ending above the bottom edge, and a perfectly straight vertical person edge ≥ 0.6 face widths inside the frame. The limits were
  set before any labelled render was looked at, not tuned. When it fails, studio.html shows **the untouched original photo** with
  red frames on what it found; the edited version is one tap away, marked, and confirmed before export. When the checker cannot
  run, the same fallback applies (fail closed). Expected cost: some clean photos also fall back to the original.
- **Outfit check fails closed.** If `studio-qa.js` or the fit is missing, the outfit is withheld like a failed check; on request it
  shows as "unchecked", with its own banner, the corner mark, and a confirmation before export.
- **Review before export** (studio, as in the photo booth): PNG / JPEG / high-resolution and ID exports show the image with the red
  frames and require a tick, once per image state.
- **Photo booth outfits are off by default** behind an "experimental outfit simulation" switch (124/124 drawn outfits were defective
  in §11b). The presets still remember their outfit; with the switch on, the round-10 flow (no-outfit first, draft on request) is
  unchanged.
- **On-screen numbers are generated** (`tests/bench/studio-figures.mjs` → `StudioQA.FIGURES`, checked in CI): the outfit miss rate
  is quoted for both splits (36 % test, 56 % dev, AI-rated), and the calibrated-confidence line uses the same figures.

## 12. On-site accuracy check, camera health and long-run stability (round 9, extended in round 10)

**Why.** Every number above comes from public footage: streets, news photos, studio faces, synthetic bottles. None of it
is a Thai shop door, a consented staff group, a real cab or a real bottling line, and there is no pilot site yet. Round 9
does not claim field accuracy. It adds the tools that produce it: each camera page can now measure its own accuracy on
the customer's premises on day 1, and each camera shows when its image is too poor for the numbers to be trusted.

### On-site accuracy check ("ตรวจความแม่นยำหน้างาน")

`lensiq-sitecheck.js`, wired into `store.html`, `attendance.html` (tab "ตรวจความแม่นยำ"), `driver.html` and `qc.html`,
and since round 10 also `customers.html`, `booth.html` and `signage.html` (rows below). Pages that use a camera but have
no on-site check: `checkout.html`, `neuro.html` and the photo / fortune pages.
A person labels what really happened while the page runs as usual. The page then compares its own output with those
labels and reports the result with 95% confidence intervals, a verdict against fixed targets, and recommended settings.
Everything is computed on the device. No images are stored. The JSON export holds only tap times, labels, the system's
own events and the computed numbers. Attendance exports use pseudonyms (m1, m2 …), never names or face data.

| page | what the person does | what is measured | targets for "pass" | minimum sample |
| --- | --- | --- | --- | --- |
| store | taps "+ เข้า" / "+ ออก" (or ↑/↓) each time someone really crosses the line, live or on a video file filmed at the door | count vs. taps (net error, block-bootstrap CI), event precision and recall (Wilson CI), direction accuracy | net error within ±10%, precision ≥ 85%, direction ≥ 90% | 50 crossings |
| attendance | per trial, picks who stands at the camera (an enrolled person or "not enrolled") | recognised (auto + confirm prompt), automatic recognition, wrong person, strangers checked in automatically (Wilson upper bound), strangers offered a name | members ≥ 90% recognised, **no** automatic wrong check-in | 20 member + 20 stranger trials |
| driver | parked only: follows a randomised voice prompt "close your eyes" for 3 s, 5–14 times | prompted closures alerted, alert latency, false alarms per hour with eyes open (exact Poisson CI), per-frame open/closed rates | ≥ 90% alerted, ≤ 1 false alarm per hour | 8 prompts |
| qc | marks each inspected bottle "good" or "bad" (the simulator labels itself) | good bottles rejected and bad bottles passed (Wilson CI); per check, the limit that would pass every good bottle while still rejecting every labelled bad one | ≤ 2% each | 30 good + 10 bad |
| customers (round 10) | per trial, picks which member stands at the counter, or "not a member" with a number per outsider | same report as attendance, on the cashier's scan rules; no customer is selected and nothing is written during the test | members ≥ 90% recognised, **no** automatic wrong selection | 20 member + 20 non-member trials |
| booth (round 10) | taps "+1 ผู้มาบูธ" (or ↑) for every real arrival | visitors the system created vs taps: net error (block-bootstrap CI), precision and recall (Wilson CI); tap lag removed, match window 4 s | net error within ±15%, precision ≥ 85%, recall ≥ 80% | 30 arrivals |
| signage (round 10) | for each passer the page lists, picks the real age band and gender (or skips) | gender correct where a gender was called, age band exact and within one band (Wilson CI), share estimated, two confusion tables | gender ≥ 90%, exact age band ≥ 70% | 50 passers |

How the numbers are computed:

- **Door taps.** People tap a little late or early, so the median offset between mutual-nearest system/tap pairs (within
  4 s, at least 5 pairs) is removed first. Then pairs within 2 s are matched one to one, closest first. Direction is not
  required for a match; a matched pair with the wrong direction is a direction error. The net-error interval is a block
  bootstrap over 60-s blocks, so bursts of people are not treated as independent events.
- **Attendance trials** use the same rules as check-in: 2 matching frames within 1.5 s, and 2 "confident" frames for an
  automatic check-in. The result is decided within 6 s of the first face. No attendance is written during the test.
- **Driver prompts** are scheduled at random, at least 9 s apart, after a 15-s settling time. A hit is a long-closure
  alert starting within the closure + 2 s. A false alarm is a long-closure or PERCLOS alert outside every prompt window
  (−1 s / +5 s). Prompts the driver did not follow can be skipped.
- **Verdict (round 10, CI-aware).** There are four outcomes:
  - **"Pass (confirmed)"** needs the minimum sample and the whole 95% interval on the right side of every target. For
    precision, recall, sensitivity and recognition the Wilson lower bound must be at or above the target. For strangers
    checked in automatically, QC misses and false rejects the Wilson upper bound must be at or below the target. For
    false alarms per hour the exact Poisson upper bound must be at or below it. The block-bootstrap interval of the net
    count error must lie inside ±target.
  - **"On target so far — collect N more"** means every measured value meets its target but an interval still crosses
    it. N comes from `needN()` and is then refined against the bound actually used (Wilson, Poisson or bootstrap width
    ∝ 1/√n). For attendance and customers it is inflated by the cluster design effect.
  - **"Fail"** is given as soon as an interval lies entirely on the wrong side of a target, or for any automatic wrong
    check-in.
  - **"Not conclusive yet"** covers the rest.

- **Pilot grade (round 11).** A strict "pass (confirmed)" needs hundreds of trials, so a one-day pilot used to end at
  "on target so far". Every report now also has `rep.pilot`. It uses relaxed targets with a 90% interval (one-sided
  95%) and minimum samples a shop can collect in one day, and the page shows it under the strict verdict, never instead
  of it:

  | page | pilot targets (90% interval must clear them) | minimum sample |
  | --- | --- | --- |
  | store | net error within ±20% (95% block bootstrap), precision ≥ 75%, direction ≥ 80% | 50 crossings |
  | attendance, customers | members ≥ 75% recognised, strangers checked in automatically ≤ 10%; any automatic wrong check-in fails | 20 member + 30 stranger trials |
  | driver | prompted closures alerted ≥ 70%, false alarms ≤ 3 per hour (exact Poisson) | 8 prompts (about 45 min of open-eye time for the false-alarm bound with no alarm) |
  | qc | good bottles rejected ≤ 10%, bad bottles passed ≤ 10% | 30 good + 25 bad |
  | booth | net error within ±25%, precision ≥ 70%, recall ≥ 65% | 30 arrivals |
  | signage | gender ≥ 80%, exact age band ≥ 55% | 50 passers |

  With these targets the evaluator's cases resolve in one day. 50 crossings with 44 matched and 7 false counts give a
  pilot pass (strict: on target so far). QC with 0 errors in 30 good + 25 bad bottles is a pilot pass, and 30 + 10 asks
  for about 15 more bad bottles. Attendance with 0 of 30 strangers checked in is a pilot pass (90% upper bound 8.3%).
  A pilot pass means "fine to continue the trial". It is not an accuracy certification. The relaxed targets are a
  judgement, not a measurement. Tests: `tests/unit/sitecheck-pilot.test.js`.
  The round-9 point verdict (point estimates vs targets) is still computed and shown as "provisional". Examples from
  `tests/unit/sitecheck.test.js`:
  - 50 crossings, 44 matched, 7 false counts: precision 86%, Wilson 74–93%, so "on target so far", about 3,000 more
    crossings.
  - QC 0/30 false rejects and 0/10 misses: upper bounds 11% and 28% against 2%, so "on target so far", about 160 more
    good and 180 more bad bottles.
  - Attendance with 0 strangers checked in out of 20: the upper bound is about 16%. The page says "no automatic errors so
    far — about 360 more stranger trials needed" to show ≤ 1%.
- **Repeated people and neighbouring frames are not independent.** Attendance and customer trials of the same people are
  resampled per person (cluster bootstrap), and the wider of that interval and the Wilson interval is used. Outsiders
  carry a number, so "the same outsider again" counts once. Exports record the number of distinct people. The driver's
  per-frame open/closed rates use a 10-s (3-s for closed frames) block bootstrap and are labelled "frames not
  independent". The driver test is one person, and its export says so.
- **Recommendations** are rules on the measured numbers. Examples: in/out almost always reversed → "swap direction";
  median person height < 12% of the frame → move the camera closer or use tiling; analysis rate < 4 Hz → fewer cameras;
  overcounting with high recall → reduce double counting and move the line; automatic wrong check-in → lower the face
  distance limit by 0.03; QC false rejects from one check → suggested limit, only if good and bad bottles stay separable,
  applied with one tap ("ใช้เกณฑ์ที่แนะนำ") after confirmation.
- In normal attendance use, the existing "ยืนยัน / ไม่ใช่" buttons are now also counted (numbers only), so the share of
  offered names that were right is visible with its confidence interval.

**Verified wiring.** `tests/e2e/sitecheck.e2e.mjs` drives the shipped pages: store taps against the real counter
(direction, lag, matched/missed arithmetic, history, export without image data); attendance trials giving auto / ask /
none and a stranger checked in automatically → "fail", with nothing written to the attendance log and names absent from
the export; QC on the simulator (simulated truth applied, 0 false rejects / 0 misses); driver prompts compressed to
3 closures on the real `createMonitor` (3/3 alerted); and the panels in 中文 and English (< 5% Thai left).
`tests/unit/sitecheck.test.js` checks the statistics against published values (Wilson 81/263 → 0.255–0.366; Garwood
Poisson 0 → 3.689, 5 → 1.62–11.67) and every report on scripted data.

Round 10 adds three checks to `sitecheck.e2e.mjs`. A frozen fake camera (canvas no longer painted) is flagged
"stalled". An unplugged one shows "offline since HH:MM", reconnects by itself once it is back, and its offline seconds
are stored with that hour's counts. A seeded store check, an old-format QC result and a flagged hour appear in the
insights accuracy and flagged-hour cards. Excluding flagged hours there leaves the stored data unchanged
(`insights.e2e.mjs`). The customers, booth and signage checks are covered in their own e2e files.

**Pilot protocol (no pilot site yet).** Run each check on day 1 at the customer's site, then again in different light
(day / evening / night for the driver) and after any camera move. Keep the exported JSON files as the acceptance record.
Until those files exist, the numbers in sections 1–7 are the only evidence, and they are not from the customer's site.

### Camera health indicator

Each camera tile (store), and the camera on attendance, driver and qc, shows a health pill ("ภาพปกติ / ภาพมีปัญหา /
ภาพไม่พร้อม") with the reason and what to do. About once per second the page downsizes the frame to 160 px and measures
median brightness, clipped and dark pixels, the brightest 4×3 cell, contrast (p95 − p5), sharpness (mean |Laplacian| relative
to contrast), and a global shift between thumbnails (camera shake). It adds the analysis rate and the median
person height (store) or face width (attendance, driver). Each flag uses the median of the last 8 samples with separate
enter and leave thresholds, so it does not flicker. Cost: well under 1 ms per sample. Only numbers are kept, and only in
memory.

**Does it fire when accuracy drops, and stay quiet when it does not?** `people.bench.mjs --degrade` degrades each frame
in the browser before detection (`tests/bench/bench-page.js`). Under-exposure (`dark`) is exposure × K in linear light
with shot and read noise. `night` adds a 2.5 px blur for the longer shutter. `back` clips the top quarter white,
adds veiling glare, and leaves the subjects at exposure × K. `blur` is a Gaussian blur at 640 px. `shake` is a random
translation of up to ±S of the frame width on every frame. `--frame-drop` skips analysed frames. Counting runs through
`store.stepCam` as in §1. The health monitor is replayed on the same per-frame statistics at about 1 sample per second.
Data: PETS09-S2L1 (795 frames, 7 fps, 126 crossings on 5 lines) and TUD-Stadtmitte (179 frames, 9 crossings). One run per
condition.

| condition | detection AP@0.5 PETS / TUD | PETS09 counted / true | net error | event P / R | median luma | health flag shown (share of 1-s samples, PETS / TUD) |
| --- | --- | --- | --- | --- | --- | --- |
| clean | 88.6 / 85.9% | 130 / 126 | +3.2% | 93.1 / 96.0% | 110 | none / none |
| dark ×0.25 (−2 stops) | 88.9 / 86.0% | 129 / 126 | +2.4% | 93.0 / 95.2% | 58 | none / none |
| dark ×0.1 (−3.3 stops) | 88.6 / 86.2% | 128 / 126 | +1.6% | 95.3 / 96.8% | 38 | none / none |
| dark ×0.04 (−4.6 stops) | 88.4 / 84.8% | 126 / 126 | 0.0% | 96.0 / 96.0% | 24 | dark 100 / 100% |
| dark ×0.015 (−6 stops) | 88.6 / 78.9% | 126 / 126 | 0.0% | 96.0 / 96.0% | 15 | dark 100 / 100% |
| night ×0.1 (dark + blur) | 86.2 / 84.1% | 129 / 126 | +2.4% | 89.9 / 92.1% | 38 | none / none |
| night ×0.04 | 85.4 / 81.6% | 133 / 126 | +5.6% | 91.0 / 96.0% | 25 | dark 100 / 100% |
| backlight ×0.5 | 81.0 / 59.3% | 125 / 126 | −0.8% | 92.0 / 91.3% | 137 | backlight 100 / 100% |
| backlight ×0.25 | 79.2 / 48.7% | 122 / 126 | −3.2% | 95.1 / 92.1% | 118 | backlight 100 / 100% |
| blur 2 px | 87.0 / 84.6% | 134 / 126 | +6.3% | 91.8 / 97.6% | 110 | none / none |
| blur 4 px | 78.6 / 82.2% | 136 / 126 | +7.9% | 86.8 / 93.7% | 111 | blur 100 / 0% |
| **shake ±2%** | 37.9 / 79.8%\* | **154 / 126** | **+22.2%** | **79.2** / 96.8% | 108 | shake 92 / 50% |
| **shake ±5%** | 5.7 / 30.5%\* | **272 / 126** | **+115.9%** | **44.5** / 96.0% | 107 | shake 99 / 83% |
| 30% of frames dropped (4.9 Hz) | 88.1 / 88.4% | 129 / 126 | +2.4% | 93.8 / 96.0% | 110 | none / none |
| 60% of frames dropped (2.8 Hz) | 87.9 / 92.6% | 126 / 126 | 0.0% | 90.5 / 90.5% | 110 | slow 100% / — |

\* AP under shake is measured against the unshifted ground truth, so it mostly shows the misalignment, not missed
people.

**Findings.**

- **Camera shake is the dangerous one.** A camera that jitters by ±2% of the frame overcounts PETS09 by 22%, and ±5%
  more than doubles the count. Each jump moves people across the fixed line, and the hysteresis band (1.2% / 8% of
  person height) is smaller than the jitter. The health flag catches ±2% in 92% of samples on PETS09 (50% on TUD, from
  only 6 samples). Mount the camera rigidly and treat a shake warning as "do not use these counts".
- **Darkness alone did not hurt counting here.** Even at −6 stops with sensor noise, PETS09 counted 126/126, and
  dark + blur ("night") stayed within +5.6%. The synthetic noise is milder than a real cheap camera at night, which also
  adds compression and motion smear. So the dark flag is advisory: it starts at median luma < 30 and asks for an on-site
  check in that light. The first version flagged at < 45 and called the numbers "far off". That was not supported by the
  data, so it was changed.
- **Backlight costs detection more than counting.** AP fell 8–37 points, worst on TUD's close-up people, while PETS09
  line counts moved only −1 to −3%. Zones, occupancy and the heat map rely on every detection, so they are hit harder.
  The flag fires on both backlight levels.
- **Blur:** 2 px is not flagged (+6.3%); 4 px is flagged on PETS09 (+7.9%, precision 86.8%) but not on TUD, whose large
  close-up people keep the frame looking sharp.
- **Slow devices:** dropping 60% of frames (2.8 Hz) did not hurt PETS09's slow walkers, but the 4 Hz "slow" warning still
  fires there. Faster walkers, closer to the camera, need more frames. §1 measured 5 and 10 fps only.
- **Disclosure: these thresholds were tuned on these same runs.** That covers the dark threshold, the second backlight
  rule (a large clipped region beside unclipped cells) and the sub-cell shake estimate (1.2% threshold, robust median
  match), all set after seeing this table. There is no held-out set: MOT17 could not be downloaded again because the disk
  was full. Clean, dark ×0.1, both blur levels and frame drops raised no false backlight, blur or shake flag, but that
  is in-sample too.

**Round 10: frozen and disconnected cameras, and health stored with the counts.**
- **Stalled.** `createStall()` treats a camera as stalled after 3 s without a new frame. New frames are counted with
  `requestVideoFrameCallback`; without it, `video.currentTime` stops advancing. A live camera whose 32×18 thumbnail is
  bit-identical for 9 s also counts, because real sensors always add noise. A paused video file does not. The flag sets
  the pill to "ภาพไม่พร้อม" (level 2) on every page with a health pill. The test freezes the fake camera's canvas: the
  track stays "live", requestVideoFrameCallback stops, and the flag appears.
- **Auto-reconnect.** A track that ends by itself (unplugged, driver crash) is reopened by `LQCam` with exponential
  backoff (1, 2, 4 … 30 s) until it works or the page stops the camera. While it is down, the camera shows "กล้องออฟไลน์
  ตั้งแต่ HH:MM — กำลังเชื่อมต่อใหม่", and the outage is logged (numbers only). The hub does not reconnect a track that
  ends during its capacity probe. The store keeps running while a camera reconnects instead of stopping; "หยุด" still
  stops it.
- **Per-hour quality flags.** Each 1-s health sample adds to the hour's seconds of shake, dark, backlight, slow,
  offline/stalled and unclear image. These are stored next to the hourly counts (`st-day-*.quality`,
  `booth-state.quality`). An hour with ≥ 5 minutes of any problem is:
  - greyed in the store's hourly chart and the insights trend;
  - annotated in the store CSVs, the booth CSV and the insights CSV;
  - listed in an insights card, which has an optional "exclude flagged hours" view. The stored counts never change.
  The 5-minute threshold is a judgement, not a measurement. Its effect on counting accuracy is not measured, because the
  robustness table above degrades whole runs, not single hours.
- **Insights accuracy status.** A read-only card lists the latest on-site check per page and camera. It reads the
  pages' local histories, so it shows this device only. Round-9 results, which had only the point verdict, are shown as
  "older result — re-run to confirm", never as a confirmed pass.

### Long-run stability (soak test)

`tests/bench/soak.mjs` runs `store.html` exactly as a shop would: YOLOX-Nano on ORT WASM, no WebGL, headless Chrome on
the Apple-silicon Mac. The source is a video file (PETS09-S2L1, 795 real frames encoded locally and looped about every
2 minutes), with one counting line, one zone and the health monitor on. Samples are taken every minute after a forced
garbage collection. The machine was running other benchmarks at the same time, so the rate is pessimistic.

| run | duration | retained JS heap start → end (max) | heap slope (last ⅔) | DOM nodes start → end (max) | listeners | Chrome process-tree RSS | rate | counted | exceptions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 30 min | 4.2 → 4.8 MB (6.0) | +0.19 MB/hour | 4,448 → 4,455 (4,530) | 115 → 115 | not sampled | 3.4–4.6 Hz | 274 in / 219 out | 0 |
| 2 | 30 min | 4.3 → 4.8 MB (4.8) | +0.24 MB/hour | 4,451 → 4,457 (4,465) | 115 → 115 | 1,279 → 690 MB (median 895, range 599–1,279) | 4.0–6.9 Hz | 268 in / 218 out | 0 |

- **No leak in page code.** The retained heap settles within the first few minutes and then grows by about 0.2 MB per
  hour, which would be about 5 MB in a 24-hour day. DOM nodes and event listeners stay flat.
- **RSS is noisy, not growing.** The process-tree RSS includes the ONNX Runtime WASM heap and every Chrome helper
  process. It moved between 0.6 and 1.3 GB and fell over the run. The disk was nearly full, so macOS was compressing
  memory, and the slope (−1,058 MB/hour) is not meaningful as a leak measure. Nothing grew without bound.
- **Not covered:** runs of 8 hours or more, several cameras at once, tabs left in the background, and mobile browsers.
  The tool takes `--minutes 480` for an overnight run.

### Round 11: optional liveness, biometric wipe, commercial profile, bench summaries

- **Liveness (attendance, off by default).** "ตรวจว่าเป็นคนจริงก่อนเช็คชื่อ" asks the person to turn their head slightly
  left or right. `LQTrack.createLiveness` passes a person once the signed yaw (nose between the outer eye corners) has
  spanned ≥ 0.3 within 8 s, or the eye aspect ratio has dropped by ≥ 18% (a slow blink; the 68-point model closes the
  eyelids only partly, §5). Both automatic and button-confirmed check-ins wait for it. **It is not measured.** It stops a
  still photo held up to the camera. It does not stop a video, a picture on a screen or a mask. The page says so.
- **Biometric data per device.** customers and attendance show when their face data expires ("deleted automatically
  when unused for more than N days · K people within 30 days"). They also have an admin action, "ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้",
  that deletes every encrypted face envelope (`lqv-*`), the attendance enrolments and every key in IndexedDB
  (`LQVault.wipeAll`). Attendance logs, members and order history stay. The per-page "ลบข้อมูลใบหน้าทั้งหมด" is unchanged.
- **Commercial profile.** `window.LENSIQ_PROFILE = "commercial"` (set before `lensiq-config.js`) forces
  `LENSIQ_AGE_GENDER = false` and `LENSIQ_FACEPARSE = false`. The pages that run face-api.js models (attendance,
  customers, booth, driver, signage) show a "โมเดลใบอนุญาตวิจัย / research-licence models" badge in their accuracy note in
  both profiles, because the detector, landmark and recognition weights still await a legal opinion
  (LICENSES/THIRD_PARTY.md F5/F6).
- **Bench summaries.** `tests/bench/results/` holds committed summaries: numbers only, the reproduce command, and a
  sha256 fingerprint of every dataset folder the bench read (`node tests/bench/results.mjs record`). `headlines.json`
  mirrors `docs/accuracy-figures.json`. Its dataset fingerprints are `null` with a note, because the round 3–6 runs that
  produced the published figures were not fingerprinted and the datasets are not on this machine. They are filled the
  next time each bench is re-run.

### Round 12: unattended operation, reproducibility status, held-out health tooling, install guards

- **Hidden tabs and locked screens.** The camera pages pause their cameras when the tab is hidden or the screen locks
  (`LQCam` autoPause), so a hidden tab means no analysis at all, not slower analysis. Before round 12 this was silent: the
  store's 1-s quality loop added a fixed 1 s per sample, and a throttled timer recorded far less than the real hidden
  time. Now `LQCam.unattended` (store, booth, signage, attendance, QC line, driver) keeps a Wake Lock while running where
  the browser supports it, and says once when it does not. It marks the tab title "[หยุดนับ]" while hidden. On return it
  shows a notice that stays until dismissed: when analysis stopped, for how long, and that the time was recorded. Store and
  booth record each gap as real "offline" seconds split over the hours it spans (`LQSite.noteGap`), so a 20-minute
  hidden tab flags its hour (≥ 5 min) in the chart, the CSVs and insights. Health samples now add their real elapsed seconds
  (`LQCam.sampleSec`, capped at 10 s) instead of 1 s each. After a gap, store starts tracking afresh (`resumePipe`): a
  track from before the gap could otherwise be matched to a different person across the line. The unit test reproduces
  that phantom crossing and shows it is gone. Gaps are also logged (numbers only) in `st-day-*.gaps`, `booth-state.gaps`,
  `sg-stats.gaps`, the QC shift and the driver trip. An on-site check that was hidden for part of its run gets a warning
  in its recommendations and `hiddenMs` in its export.
- **Per-camera quality.** `day.qualityCam[slot][hour]` is stored next to the combined `day.quality`, which is unchanged
  and still conservative. A flagged hour in the store note now names the camera at fault.
- **Short on-site checks.** When a door or booth check is too short for the net-count interval, because netErrorCI
  returns null below 3 blocks or marks it `short` below the minimum blocks, the report adds need "เวลาตรวจ (อีกราว N
  นาที)" and a recommendation to run longer. Before, a 2-minute check with 60 perfect crossings said "on target so far"
  with no next step. The interval maths and the block rule belong to the statistics work (see `docs/STATS.md`).
- **Soak harness.** `tests/bench/soak.mjs` now takes `--hours`, `--sample-min`, `--source fake --cams N` (fake live
  cameras: the hub, scheduler and hidden-tab path; `--real` runs YOLOX on the fake frames) and `--hide-every M
  --hide-for H [--freeze]`. It ends with a drift report: heap and RSS slope, analysis-rate change from the first to the
  last quarter, DOM growth, exceptions, and hidden time injected vs recorded. One run so far, on this machine
  (Apple silicon, headless, no WebGL): 4 fake cameras with scripted detections, 10 minutes, two 1-minute hidden periods.
  Retained heap went 2.9 → 3.6 MB. The analysis rate stayed at 2.5 Hz per camera from the first quarter to the last. DOM
  nodes went 5,165 → 5,575, and no listeners were left behind. Hidden time was 120 s injected and 120 s recorded offline
  in 2 gaps. Counting resumed after each gap, with 0 exceptions. **Not yet run:** 8–24 h, the real model on several
  cameras, real background-tab throttling (headless Chrome does not reproduce it; the harness overrides visibility), and
  mobile browsers.
- **Reproducibility status.** `node tests/bench/results.mjs manifest` writes `tests/bench/results/manifest.json`. For each
  dataset folder a bench reads, it records "present" with a file-list fingerprint (sha256 of sorted path + size; add
  `--content` for the full content hash) or "not reproducible here: datasets absent". For each bench it records whether
  the bench can be re-run on this machine. The benches update it themselves when they find their data
  (`lib.mjs needData`). `headlines.json` now gives every figure its bench and an explicit status instead of a bare
  `null`. `results.mjs --check --strict` fails while a customer-facing figure's datasets have no content fingerprint. It
  fails today: 54 figure/dataset pairs, because no dataset is on this machine (`~/lq-bench-data` is absent). Only the
  synthetic QC and checkout benches are "reproducible here".
- **Held-out health thresholds (tooling only).** `tests/bench/health-holdout.mjs` scores the shipped thresholds on
  sequences that were not used to tune them. A (sequence, degradation) case is harmful when |net error| > 10% or event
  precision < 85%, and flagged when the pill warned in ≥ 50% of samples. The report gives sensitivity and false-alarm
  rate with Wilson intervals, for the tune split (PETS09, TUD) and the hold-out split (MOT17). `--plan` prints the
  people.bench runs. **No hold-out number exists yet**, because the datasets are not on this machine.
- **Driver.** The page now spells out what 25% means: only about 25% of 2-second closures get an alert, and the rest get
  none. It says the tool is an extra aid and that a drowsy driver should stop, not wait for an alert. The line comes from
  `docs/accuracy-figures.json` (`driver.accstart2`). A per-driver readiness line shows "not ready to assist this driver"
  until the prompted eyes-closed check in that vehicle has caught ≥ 70% of at least 8 prompts within the last 30 days.
  Monitoring still runs, but a trip started without that shows a warning. An IR-camera profile was not added; it needs
  IR hardware to test.
- **Install guards.** Commercial use is selectable per device on cameras.html#profile (`localStorage "lq-profile"`). It
  can only move demo → commercial. A red bar appears on camera pages served from a non-demo origin while the demo profile
  is active. Turning on booth "recognise" mode or signage age/gender now needs an operator tick ("notice posted / consent
  obtained"). The time of that acknowledgement is exported (`consentAckAt`, `noticeAckAt`). Settings saved before round 12
  keep working but show the box until confirmed.

### What is still missing

- **No field data.** Nothing here was measured at a real customer site. The on-site check makes that measurement
  possible and repeatable, but someone still has to run it. With the round-10 verdict, a confirmed pass needs large
  samples. To show ≤ 1% strangers checked in, about 380 stranger trials without an error are needed; for ≤ 2% QC errors,
  about 190 good and 190 bad bottles. A one-day check usually ends "on target so far", and that is the honest result.
- MOT17 (crowds, held out) could not be re-downloaded for the robustness run because the disk was full, so the robustness
  table uses only PETS09-S2L1 and TUD-Stadtmitte. These are the tuning sequences, and TUD has only 9 crossings.
- The degradations are synthetic. Real low light also brings motion blur and compression noise. Real backlight depends
  on the door. Real shake is not a random jump per frame.
- Face recognition with consented Thai faces, real drowsy-driver video and real bottles remain untested. The checks
  above are the protocol for collecting them.
- The driver check uses deliberate closures while parked, not real drowsiness. It shows that the camera, angle and
  light in that vehicle work. It does not certify safety.
- Round 12 added the tools (manifest, `--strict`, `health-holdout.mjs`, longer soak) but still has no held-out degradation
  run (MOT17) for the health thresholds and no content fingerprints for the published runs: both need the datasets
  re-downloaded. There is still no measurement of the liveness option or of IP cameras through a virtual webcam (added
  latency, compression), and no field data from a real site.

## 13. Exam: face presence, face count and head turn (exam-lab, 2026-11-10)

**Pipeline under test.** The Exam lab face engine (`lensiq-exam-face.js`), both versions on the same frames:
OLD = face-api.js TinyFaceDetector (320 → 224, score 0.5) + 68 landmarks, as on `main` before the switch; NEW =
MediaPipe Face Landmarker (Apache-2.0), CPU delegate, detection 0.5, pose "mesh68". Frames are 640 × 480 (the lab
camera size). Headless Chrome 156, Apple M1, WebGL through SwiftShader. Fixed test set, metrics and pick rule written
before the run: `docs/exam/FACE-ENGINE-RESULTS.md` §1 (full tables there). Sources: **public dataset** (Open Images V7
validation, CC BY 2.0 images) and **synthetic** (low light and mask derived from those photos, fake-camera frames,
head-turn renders). Held-out half shown; it was never used to pick a setting.

| Signal (held-out) | OLD face-api.js | NEW MediaPipe |
|---|---|---|
| face found, one person at desk distance (n = 26) | 22 / 26 = 84.6% | 22 / 26 = 84.6% |
| face found, low light (synthetic, n = 26) | 16 / 26 = 61.5% | 20 / 26 = 76.9% |
| face found, mask (synthetic, n = 26) | 14 / 26 = 53.8% | 17 / 26 = 65.4% |
| face found, glasses (n = 11) | 11 / 11 | 9 / 11 (all 60 frames: 24 / 30 both) |
| face found, 24 – 48 px wide (n = 12) | 0 / 12 | 0 / 12 |
| false face on no-person / fake-camera frames (n = 37) | 0 / 37 | 0 / 37 |
| face count 0 / 1 / 2+ correct, all groups (n = 155) | 67.1% [59.4–74.0%] | 70.3% [62.7–77.0%] |
| two or more faces read as ≥ 2 (group photos, n = 17) | 3 / 17 | 4 / 17 |
| head-turn class correct, renders (n = 90; synthetic render; favours the new engine; not a claim until measured on real video (pilot)) | 84.4% [75.6–90.5%] | 81.1% [71.8–87.9%] |
| yaw error median, renders (same caveat) | 9.2° | 17.2° |
| time per frame, median, two runs on the same M1 | 57.5–85.9 ms (WASM) | 12.8–18.7 ms — about 4.5× faster |

**Read with care.** Single frames, not the debounced monitor. The head-turn renders use MediaPipe's own 3-D mesh as
geometry, which favours NEW. No skin-tone breakdown (no labels). If MediaPipe fails to run (seen on a Mac Chrome with WebGL
disabled; CI's Linux Chrome without reported WebGL runs it), the page switches the face signals off and says so
instead of reporting "no face". Not measured: mouth movement, real exam rooms.

## Datasets and licences

| dataset | used for | source | licence / terms |
| --- | --- | --- | --- |
| MOT17 train (02, 04, 09) | people detection, tracking, counting | motchallenge.net | CC BY-NC-SA 3.0 |
| 2DMOT2015 train (PETS09-S2L1, TUD-Stadtmitte) | same | motchallenge.net | CC BY-NC-SA 3.0 (PETS 2009: research use) |
| LFW View-1 pairs + full LFW (13,233 images) | face verification, 1:N | HF mirror `logasja/lfw`; figshare mirror used by scikit-learn | research use, no explicit licence |
| CASIA-FaceV5 (500 Asian people × 5) | 1:N per-group check | HF `JustinLeee/Cleaned_Augmented_CASIA_FaceV5` (original photos only) | CASIA: research use; the mirror says Apache-2.0, which is not relied on — evaluation only |
| UTKFace aligned & cropped | age, gender | HF mirror `py97/UTKFace-Cropped` | non-commercial research only |
| HaGRID 384p sample | hand detection | HF `cj-mills/hagrid-sample-30k-384p` | CC BY-SA 4.0 |
| Open/Closed Eyes | driver eye closure | HF `MichalMlodawski/closed-open-eyes` | ODC-BY 1.0 |
| CEW, Closed Eyes in the Wild | driver eye closure | NUAA (Song et al. 2014) | research only, no redistribution — evaluation only |
| FER-2013 PrivateTest (700) | neuro expressions | HF `3una/Fer2013` | research only — evaluation only |
| MIT1003 (1,003 images, 15 viewers) | creative attention map (300 tuning, 703 test) | people.csail.mit.edu/tjudd/WherePeopleLook | no licence stated — evaluation and choice of 7 weights only, nothing shipped |
| 62 Wikimedia Commons portraits (`tests/bench/studio-portraits.json`) | studio outfit renders (27 dev / 35 test people) | commons.wikimedia.org | public domain (checked per file at download) — evaluation only, never committed |
| synthetic bottles and barcodes | qc, checkout | generated by `tests/bench` | ours |
| Open Images V7 validation (220 images: no person, one face, groups, glasses, small faces) | exam face engine (§13) | storage.googleapis.com/openimages, images from the Open Images S3 mirror | images CC BY 2.0 (checked per image, credits kept outside the repo), annotations CC BY 4.0 — evaluation only, images deleted after the run |

All datasets were used only for evaluation. No data or derived model was shipped or committed. The shipped YOLOX-Nano
weights are Megvii's unchanged release, trained on COCO, not on any of the sets above.

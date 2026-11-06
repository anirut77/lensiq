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

| distance threshold | used by | same person accepted (TAR) | different person accepted (FAR) [95% CI] |
| --- | --- | --- | --- |
| 0.45 | | 50.7% | 0.00% [0.0–0.3%] |
| **0.50** | **customers, booth** | **72.6%** | **0.00% [0.0–0.3%]** |
| **0.55** | **attendance (default)** | **86.5%** | **0.09% [0.0–0.5%]** |
| 0.60 | | 91.0% | 0.55% [0.3–1.2%] |
| 0.65 | | 91.9% | 2.45% [1.7–3.5%] |

The equal error rate on pairs where both faces were found is 1.4% (at distance 0.627). face-api's descriptor is a port of
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
  random galleries; about 12,000 stranger visits per row.

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

| enrolled | rule | member recognised per visit | member shown as someone else | stranger accepted [95% CI] |
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

| enrolled | rule | face found per frame | member recognised per visit | member shown as someone else | stranger accepted [95% CI] |
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
Each row is 200 random groups, about 12,000 stranger visits.

Disclosure: CASIA was not completely untouched. While exploring the idea, a few early settings were also scored on CASIA
from cached descriptors. The chosen values follow the LFW-only rule above, but the CASIA check is not perfectly blind.

**CASIA-FaceV5 (held out), round 4 → round 5** ("without confirmation" = recognised automatically; the rest are
recognised as a suggestion that a person confirms):

| enrolled | member recognised R4 → R5 | of which without confirmation (R5) | member shown as someone else R5 | stranger accepted R4 → **R5** [95% CI] | stranger accepted without confirmation (R5) |
| --- | --- | --- | --- | --- | --- |
| 5 | 57.4% → **75.6%** | 56.2% | 0.00% | 10.97% → **0.89%** [0.7–1.1%] | 0.03% |
| 10 | 55.2% → **75.0%** | 56.1% | 0.00% | 8.83% → **0.56%** [0.4–0.7%] | 0.02% |
| 20 | 55.8% → **73.8%** | 54.7% | 0.00% | 6.34% → **0.33%** [0.2–0.5%] | 0.00% |
| 50 | 55.1% → **71.3%** | 50.6% | 0.00% | 4.23% → **0.18%** [0.1–0.3%] | 0.00% |
| 100 | 53.5% → **68.7%** | 47.4% | 0.00% | 3.13% → **0.18%** [0.1–0.3%] | 0.00% |
| 200 | 52.0% → **66.4%** | 44.5% | 0.00% | 2.25% → **0.22%** [0.1–0.3%] | 0.00% |

The round-4 numbers in this table come from the round-5 benchmark run, which uses different random groups from the
round-4 run (6.34% vs 6.49% at 20 enrolled).

**LFW (tuning set), round 4 → round 5:**

| enrolled | member recognised R4 → R5 | of which without confirmation (R5) | stranger accepted R4 → **R5** [95% CI] | stranger accepted without confirmation (R5) |
| --- | --- | --- | --- | --- |
| 5 | 90.9% → 91.7% | 68.6% | 1.27% → **0.27%** [0.2–0.4%] | 0.03% |
| 10 | 89.8% → 90.4% | 69.2% | 1.38% → **0.39%** [0.3–0.5%] | 0.03% |
| 20 | 88.7% → 89.6% | 66.1% | 1.10% → **0.46%** [0.4–0.6%] | 0.03% |
| 50 | 86.2% → 87.1% | 61.2% | 1.04% → **0.43%** [0.3–0.6%] | 0.01% |
| 100 | 84.9% → 85.0% | 57.3% | 0.89% → **0.42%** [0.3–0.5%] | 0.05% |
| 200 | 84.2% → 82.9% | 53.9% | 1.00% → **0.36%** [0.3–0.5%] | 0.07% |

**What each part contributes** (CASIA, held out; 5 / 20 / 200 enrolled; stranger accepted, then member recognised):

| variant | stranger accepted | member recognised |
| --- | --- | --- |
| round 4 rules + cascade, no calibration | 14.7 / 8.6 / 2.7% | 85 / 84 / 78% |
| round-5 values without the group scale (fixed 0.50 / 0.44 / margin 0.09) + cascade | 4.6 / 0.90 / 0.04% | 82 / 78 / 64% |
| round 5 calibrated, detector 320 only | 0.87 / 0.26 / 0.31% | 52 / 49 / 43% |
| **round 5 (calibrated + cascade)** | **0.89 / 0.33 / 0.22%** | **76 / 74 / 66%** |
| round 5 without consensus (1 frame) | 1.25 / 0.57 / 0.30% | 82 / 80 / 73% |

**Findings.**

- **Target met on the held-out set.** Stranger acceptance on CASIA is ≤ 1% at every group size from 5 to 200, down from
  2.3–11%. Fewer than 0.05% of strangers are accepted *without* a person confirming.
- **5 enrolled is closest to the limit.** The point estimate is 0.89%, and the upper end of the 95% interval is 1.1%.
  Groups this small also have the noisiest calibration, which is why the pages ask for confirmation below 5 people.
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
  against the driver's own baseline stayed at **0 of 682**.
- 95% upper bound on that false-alarm rate: about 0.5% per frame. Long-closure alerts need 1.5 s of consecutive closed
  frames, so single false frames do not raise alerts.
- Still not tested: video of real drowsy drivers, looking down, glasses, and IR or night cabins. A driver who calibrates
  with half-closed eyes, or the 4% whose calibration frames look closed, falls back to EAR.
- CEW photos are 100 px faces upscaled; video crops of a driver close to the camera are sharper.
- The page is a driver-assistance demo, not a safety device.

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
| synthetic bottles and barcodes | qc, checkout | generated by `tests/bench` | ours |

All datasets were used only for evaluation. No data or derived model was shipped or committed. The shipped YOLOX-Nano
weights are Megvii's unchanged release, trained on COCO, not on any of the sets above.

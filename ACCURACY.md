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
- Round 4 (this version) changed the store detector and tracker, the face-matching rules, the driver eye threshold and
  the checkout read gate. Each section shows before → after.
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

**Honest bottom line.**

- **Targets: net error within ±10% and event precision ≥ 85%.** These are met on the door-like tuning scene: PETS09
  gives +2.4% net and 94% precision at both 5 and 10 fps. Pooled over all five sequences they are met for net error at
  5 fps (−2.6%), but precision there is 81%. At 10 fps precision is 91%, but net error is −15%.
- **They are not met on the held-out MOT17 crowds.** Per sequence, net error is −30% to +19% and precision 61–92%.
  The remaining cause is mostly detection: people under a fifth of the frame and heavy occlusion, not the counting
  rule. Splitting 16:9 frames in two (10 fps) brings the pooled result to 0.0% net and 84% precision, at double the
  compute.
- **About 1 in 5 counted events is still wrong pooled at 5 fps, and about 1 in 10 at 10 fps.** Round 3 was about 1 in 4.
  The new rule waits for 2 frames, so it misses some real crossings in crowds. That is why it undercounts at 10 fps.
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

**The per-person limit does most of the work.** Removing it brings stranger acceptance back to 9%. Consensus and the
quality gate add smaller gains. At 100 enrolled the target (≤ 1% strangers accepted, ≥ 85% recognised) is met on
LFW at 0.79% and 85.1%. It holds only with 3-pose enrolment. Members enrolled before round 4, from a single capture, are
recognised only 74% of the time, so re-enrol them. With 20 enrolled the per-person limits are looser (fewer
look-alikes), so stranger acceptance is 1.4%.

**CASIA-FaceV5, Asian faces (held out)**:

| enrolled | rule | face found per frame | member recognised per visit | member shown as someone else | stranger accepted [95% CI] |
| --- | --- | --- | --- | --- | --- |
| 100 | round 3 attendance | 59.6% | 69.0% | 0.18% | 7.96% [7.5–8.5%] |
| 100 | **round 4 default** | 59.6% | **54.1%** | 0.00% | **3.38% [3.1–3.7%]** |
| 100 | round 4 without consensus | 59.6% | 74.2% | 0.00% | 5.77% [5.4–6.2%] |
| 100 | round 4 with limit 0.40 (diagnostic, not adopted) | 59.6% | 51.3% | 0.00% | 1.90% [1.6–2.3%] |
| 200 | round 4 default | 59.6% | 51.9% | 0.00% | 2.18% [1.9–2.5%] |

**Finding: the face descriptor is much weaker on these Asian faces, the case that matters in Thailand.**

- At 100 enrolled, round 4 cuts stranger acceptance from 8.0% to 3.4%, still above the 1% target. Even a limit of 0.40
  leaves 1.9%.
- Recognition on this set is capped by the detector, which finds only 60% of the faces in its tight 112-px crops.
  Consensus needs 2 found frames, so recognition falls to 54%.
- CASIA-FaceV5 was photographed with one camera in one session, which makes strangers look alike. A real Thai
  workplace may sit between the two data sets, but this has not been measured.
- **Recommendation:**
  - In Thailand, do not rely on face matching alone with more than about 50 enrolled people.
  - Keep attendance confirmation on screen. On the customers page the cashier sees the matched member's name and can change the
    selection.
  - Pilot on your own staff.

A stronger, commercially licensed face model is the real fix. None that runs on WASM without WebGL was available to
evaluate in this round.

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

An experiment (not shipped) with a 130-weight linear classifier on 16×8 eye patches plus EAR did much better:

- Trained on the ODC-BY set and tested on CEW: AUC **0.954**, against 0.750 for EAR alone.
- At its default cut it catches 94% of closed eyes, but calls 20% of open eyes closed.

It needs video-pixel crops in `driver.js`, which is a bigger change.

**Bottom line.** Eye-closure detection is weak:

- At best it catches about half of closed-eye frames.
- Long-closure and microsleep alerts need consecutive closed frames, so many real closures will be missed.
- Looking down, glasses, and IR or night cabins were not tested.

The page is a driver-assistance demo, not a safety device. CEW face detection is low because its crops are 100 px.

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
6°, lift 4 px, label similarity 80, label shift 6 px. Script: `tests/bench/qc.bench.mjs`.

**Images are synthetic.** The renderer is independent of the page's simulator and is designed to be harder:
anti-aliased PET bottle, cylindrical shading, a highlight running through the fill window, concave meniscus,
wrap-around label, ridged cap. Defects come in graded sizes, some inside tolerance (they should pass) and some outside
(they should be rejected). The operator procedure is followed: capture the empty belt, calibrate on one good bottle,
then run. Each cell is 60 good bottles or 25 per defect. Results are for a dark drink with the background image; clear
water gave identical results.

| | as calibrated | stop position ±8/±3 px | light ±10% after calibration | light +25% / −30% | side light ±15% | glare | defocus σ 1.2 | noise σ 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| good bottles falsely rejected | 0% | 0% | **100%** | **100%** | 0% | 0% | 0% | 0% |
| fill 9 px low / 16 px low / 9 px high rejected | 100 / 100 / 100% | 96 / 100 / 92% | 100% | 100% | 100% | 100% | 100% | 100% |
| no cap / wrong cap colour rejected | 100 / 100% | 100 / 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| cap tilted 9° / 15° rejected | 100 / 100% | 100 / 100% | 100% | 100% | 100% | 100% | 100% | 96 / 100% |
| cap raised 6 px / 10 px rejected | 100 / 100% | 72 / 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| no label / label 10 px or 20 px low rejected | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| **label skewed 5° / 10° rejected** | **0 / 0%** | 0 / 0% | — | — | 0 / 0% | 0 / 0% | 0 / 0% | 0 / 0% |
| within-tolerance defects passed | 100% | 92–100% | 0% | 0% | 100% | 100% | 100% | 100% |
| scratch on the body | not inspected (passes) | | | | | | | |

**Findings.**

1. With stable lighting and a fixed camera the checks work, with 0% false rejects. Belt stop jitter of ±8 px costs a few
   misses on 6 px cap lifts (72% caught).
2. **Any change in lighting after calibration, as small as ±10%, makes the page reject every bottle.** The cap colour
   (ΔE), the background-difference mask and the label colour histogram all shift together. You need fixed lighting,
   camera auto-exposure turned off, and recalibration whenever the light changes.
3. **Skewed labels are not detected.** The label check only looks at vertical shift and colour.
4. Scratches and dents are not inspected at all.

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

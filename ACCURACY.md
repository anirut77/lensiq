# LENSIQ camera systems — measured accuracy

Measured on **public datasets with ground truth**, using the same browser code the pages run (TF.js on **WASM, no WebGL**,
headless Chrome on an Apple-silicon Mac). The harness is in [`tests/bench/`](tests/bench) and can be re-run by anyone
(see [tests/README.md](tests/README.md#accuracy-benchmarks-real-public-footage-optional)). Datasets are downloaded outside
the repository and are never committed.

**Read this first.**

- These are public research datasets: street, news and studio photos. They are not your shop, your lighting or your
  camera angle. Expect different numbers on site, usually worse. Run a short pilot with a manual count before you rely
  on any total.
- Every number is from one run on one machine. Small test sets are marked; percentages from a few dozen events have wide
  error bars.
- Pages whose accuracy is modest or not yet measured show a **Beta** or accuracy note at the top (Thai). Thai summary:
  [cameras.html#accuracy](cameras.html#accuracy).

## 1. People detection, tracking and line counting — store (วิเคราะห์หน้าร้าน)

**Pipeline under test.** `LQDetect.detectCoco` runs COCO-SSD lite (MobileNetV2) in the browser and keeps the person
class. `store.js` `stepCam()` does the rest: the LQTrack Hungarian tracker, `checkCrossing` line counting and, when
switched on, re-ID ("ลดการนับซ้ำ", MobileNetV2 appearance embeddings cropped by `LQDetect.embedBox`). Detection runs in
headless Chrome; tracking and counting run in Node through `stepCam`. Both are the page's own code, unchanged.

**Data.** Five static-camera sequences with ground-truth boxes and identities. All are outdoor or station scenes; none
is a shop doorway.

| sequence | frames analysed | resolution | people boxes | scene |
| --- | --- | --- | --- | --- |
| PETS09-S2L1 | 795 (7 fps) | 768×576 | 4,476 | elevated camera, campus crossing, small people |
| TUD-Stadtmitte | 60 (8.3 fps) | 640×480 | 387 | eye level, pedestrians close to the camera |
| MOT17-02 | 200 (10 fps) | 1920×1080 | 6,189 | square, many small and partly hidden people |
| MOT17-04 | 350 (10 fps) | 1920×1080 | 15,848 | high camera over a crowded pedestrian street |
| MOT17-09 | 175 (10 fps) | 1920×1080 | 1,773 | eye level, shop-front walkway |

**Counting ground truth.** Each sequence gets five virtual counting lines (x = 0.3 / 0.5 / 0.7 and y = 0.4 / 0.6).
Ground-truth crossings come from running the store's own `checkCrossing` on the ground-truth tracks (box centres), so
any error comes from detection and tracking, not from a different counting rule. That gives 275 ground-truth crossings
in total. A counted event is correct when the direction matches, the time is within 1.5 s and the position along the
line is within 15%.

### Detection (person, IoU ≥ 0.5, minScore 0.4)

| | precision | recall | AP@0.5 |
| --- | --- | --- | --- |
| PETS09-S2L1 | 78% | 75% | 69% |
| TUD-Stadtmitte | 96% | 73% | 81% |
| MOT17-09 | — | — | 50% |
| MOT17-02 / MOT17-04 | — | — | 14% / 22% |
| **all 5 pooled** | **76%** | **24%** | |

Recall by person size, measured as box height ÷ frame height:

| person height | MOT17-02 | MOT17-04 | MOT17-09 | PETS09 | TUD |
| --- | --- | --- | --- | --- | --- |
| < 10% | 5% | — | — | — | — |
| 10–20% | 7% | 12% | 34% | 75% | — |
| 20–35% | 62% | 35% | 62% | 79% | 69% |
| ≥ 35% | 82% | — | 91% | — | 81% |

**Finding: small and far people are the main weakness.** COCO-SSD shrinks every input to a fixed 300×300 tensor
(the graph contains `Preprocessor/ResizeImage`). Running detection at 320, 416 or 640 px therefore gave the **same AP**
on every sequence: 69.1% vs 69.1% vs 69.1% on PETS, and 21.3 / 21.5 / 21.6% on MOT17-04. The old store setting
"512px – แม่นยำ (กล้องไกล คนตัวเล็ก)" ("512 px – accurate, for far cameras and small people") promised something it
could not deliver, so it has been replaced.

**Fix: tiling.** `LQDetect.detectCoco(…, {tiles: {cols: 2, rows: 2}})` also runs the model on four overlapping crops
and merges the results. Boxes cut by a tile edge are dropped, and duplicates are removed by IoU, or by "intersection
over the smaller box" ≥ 0.7. In the store page this is the per-camera setting **"คนตัวเล็ก/อยู่ไกล"** (small / far
people).

| detection, minScore 0.4 | pooled recall | pooled precision | AP MOT17-02 / 04 / 09 | AP PETS / TUD | time per frame (WASM, loaded machine) |
| --- | --- | --- | --- | --- | --- |
| full frame (default) | 24.0% | 76.3% | 13.7 / 21.5 / 49.6% | 69.1 / 81.4% | 120 ms |
| full frame + 2×2 tiles | **33.2%** | **79.4%** | 17.7 / **39.2** / 50.1% | 75.4 / 79.6% | 370–650 ms |

With tiling, recall for 10–20%-tall people on MOT17-04 rises from 12% to 29%, and on PETS from 75% to 83%. The price is
3–5× more compute. On WASM that means about 2 frames/s, which is too slow for reliable line counting (see below). Use
tiling for occupancy, zones, queue and heat map on wide shots, or on a faster (WebGL) device.

### Tracking and line counting

All 5 sequences pooled, 275 ground-truth crossings, minScore 0.4. **Net error** is the over- or under-count of the
total. **Direction error** is |in − in_gt| + |out − out_gt| divided by the ground-truth total. **Event P/R** is the share
of counted events that really happened (P), and the share of real crossings that were counted (R).

| analysis rate | config | MOTA | IDF1 | ID switches | counted / GT | net error | direction error | event P | event R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 fps (typical, WASM) | previous tracker (DIST_MAX 0.12, lost after 1 s) | 19.0% | 17.3% | 425 | 360 / 273 | +31.9% | 39.2% | 60.0% | 79.1% |
| 5 fps | **new store default (DIST_MAX 0.09, lost after 2 s)** | 19.4% | 20.1% | 371 | 294 / 273 | **+7.7%** | **19.4%** | **72.4%** | 78.0% |
| 5 fps | new default + ลดการนับซ้ำ (re-ID) | 19.4% | 20.2% | 369 | 276 / 273 | +1.1% | 15.8% | 72.1% | 72.9% |
| 10 fps | previous tracker | 15.0% | 16.4% | 403 | 281 / 275 | +2.2% | 34.9% | 70.1% | 71.6% |
| 10 fps | **new store default** | 15.1% | 18.2% | 390 | 250 / 275 | −9.1% | **25.1%** | **77.6%** | 70.5% |
| 10 fps | new default + re-ID | 15.1% | 19.2% | 387 | 234 / 275 | −14.9% | 22.9% | 76.9% | 65.5% |
| 10 fps, 2×2 tiles | new store default | 22.6% | 25.0% | 573 | 350 / 275 | +27.3% | 33.1% | 62.9% | 80.0% |
| 2 fps, 2×2 tiles (realistic on WASM) | new store default | 20.7% | 22.2% | 321 | 395 / 270 | +46.3% | 57.4% | 53.4% | 78.1% |

Per sequence at 5 fps with the new default:

| sequence | counted / GT | net error | event P | event R |
| --- | --- | --- | --- | --- |
| PETS09-S2L1 | 141 / 126 | +11.9% | 80.1% | 89.7% |
| TUD-Stadtmitte | 11 / 8 | +37.5% (tiny sample) | 72.7% | 100% |
| MOT17-02 | 50 / 39 | +28.2% | 56.0% | 71.8% |
| MOT17-04 | 53 / 54 | −1.9% | 56.6% | 55.6% |
| MOT17-09 | 39 / 46 | −15.2% | 87.2% | 73.9% |

**How the defaults were tuned.** Sweeps over minScore (0.25–0.6), detection width, MIN_HITS, a lost-track pool,
re-ID SIM_MIN (0.75–0.88), DIST_MAX (0.05–0.12) and MAX_MISSED (1–2 s) were first run on PETS09 and TUD
(`--sweep` and `LQ_BENCH_EXTRA`), then checked on MOT17, which was held out. The old gate (DIST_MAX 0.12, which grows
further at low frame rates) let tracks jump to a neighbour, and two people swapping IDs near a line produce phantom
in/out pairs. DIST_MAX 0.07 was best on PETS (+31% → +3%) but undercounted MOT17 (−47%). 0.09 with a 2 s grace period
was the most robust on both sets and at both frame rates, so it is the new `ST_TRACK` in `store.js`. minScore stays at
0.4: 0.3–0.35 adds recall but also ID switches and false counts. Re-ID stays **off by default**. It removes 5–15% of
counts, which helps where people linger around the door (PETS: +11.9% → +3.2%) and hurts where the store already
undercounts (MOT17-02: −20% → −30% at 10 fps).

**Honest bottom line.**

- On these public scenes the door count is within about **±10–30% per day per line**, and roughly **1 in 4 counted
  events is wrong** even when the total looks right. Errors partly cancel: MOT17-04 totals −2%, but event P/R is about
  56%.
- Crowds, people under about 1/5 of the frame height, and low frame rates make it worse.
- A ceiling camera above the door, people at least 1/4 of the frame tall, and a line drawn where people walk across it
  (not along it) should do better. That has not been measured; run a 30-minute manual count to calibrate.
- The page labels the counts as estimates (Beta).

## 2. Face recognition — attendance, customers, booth

Pipeline: face-api.js TinyFaceDetector (input 320, score 0.5) → 68 landmarks → 128-D descriptor → Euclidean distance.
These are the options `attendance.js` and `customers.js` use. Data: **LFW View-1 pairs**, 2,200 pairs (1,100 same person,
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

### 1:N identification (what the pages actually do)

The pages compare a face with **every** enrolled person, so the risk grows with the number of people enrolled. This was
simulated on LFW identities: one enrolment photo per person; 757 people have at least 2 photos and act as members, and
the 1,304 people with a single photo act as strangers. Each row averages 200 random galleries.

| enrolled | rule | member recognised in one frame | member shown as someone else | stranger accepted as a member |
| --- | --- | --- | --- | --- |
| 20 | 0.55 (old attendance rule) | 92.4% | 0.19% | 2.4% |
| 20 | **0.55 + margin 0.05 (new attendance)** | 91.7% | 0.05% | 2.0% |
| 100 | 0.55 (old attendance rule) | 92.3% | 0.88% | 9.9% |
| 100 | **0.55 + margin 0.05 (new attendance)** | 89.4% | **0.24%** | **5.9%** |
| 200 | 0.55 + margin 0.05 | 86.9% | 0.32% | 6.7% |
| 100 | 0.50 (old customers rule) | 78.3% | 0.24% | 2.3% |
| 100 | **0.50 + margin 0.05 (new customers)** | 77.6% | **0.09%** | **1.5%** |
| 200 | 0.50 + margin 0.05 | 76.8% | 0.13% | 1.9% |

**Change made:** `LQTrack.matchFace` now accepts the nearest person only if the runner-up (a different person) is at
least **0.05** further away. With 100 people enrolled this cuts "checked in as a colleague" from 0.88% to 0.24%, at a
cost of about 3 points of recognition. Attendance also needs 2 matching frames before it records anyone. The pages
enrol the average of 3 frames, which should do somewhat better than the single-photo enrolment simulated here.

**Limitations.** LFW is press photos of mostly adult public figures, with few East/South-East Asian faces. Recognition is
measured per frame; a person standing in front of the camera gets several frames. With more than about 100 people
enrolled, the attendance page's distance slider should be lowered to 0.50.

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

## 5. Not yet benchmarked (shown as Beta on the page)

| page | why there is no number yet |
| --- | --- |
| checkout (product scan) | accuracy depends on the products the shop teaches; there is no public dataset of the shop's own SKUs |
| qc (bottle inspection) | the bundled simulator is not evidence; this needs images from a real line with labelled defects |
| driver (drowsiness) | needs a licensed drowsiness video set (e.g. NTHU-DDD, UTA-RLDD) — not yet run |
| neuro (emotion) | facial expression is not felt emotion; a FER test (e.g. FER-2013) would measure the classifier only |
| booth (visitor counting) | uses the face pipeline above for repeat-visitor matching, but there is no booth video with ground truth |

## Datasets and licences

| dataset | used for | source | licence / terms |
| --- | --- | --- | --- |
| MOT17 train (02, 04, 09) | people detection, tracking, counting | motchallenge.net | CC BY-NC-SA 3.0 |
| 2DMOT2015 train (PETS09-S2L1, TUD-Stadtmitte) | same | motchallenge.net | CC BY-NC-SA 3.0 (PETS 2009: research use) |
| LFW View-1 pairs | face verification, 1:N | HF mirror `logasja/lfw` (UMass site unreachable) | research use, no explicit licence |
| UTKFace aligned & cropped | age, gender | HF mirror `py97/UTKFace-Cropped` | non-commercial research only |
| HaGRID 384p sample | hand detection | HF `cj-mills/hagrid-sample-30k-384p` | CC BY-SA 4.0 |

All datasets were used only for evaluation. No data or derived model was shipped or committed.

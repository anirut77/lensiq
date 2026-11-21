# Exam lab phone-in-hand set (locked 2026-11-19, owner decision 134)

Purpose: a locked public still-image set for Exam lab phone detection, acceptance sheet `docs/acceptance/exam-lab.md`
criterion **A2** (phone recall at desk distance >= 80 % on a locked set of >= 50 phone-in-hand frames). The current
figure was measured on n = 26. Source label for any number measured on it: **public dataset**.

## Where things are

| Item | Location | In the repo? |
|---|---|---|
| Images (358 JPEG, longest side <= 1280 px, 70 MB) | `~/LENSIQ-field/evals/examlab-phone/images/` | **No, never.** These are photos of real people |
| `manifest.jsonl` (id, file, sha256 of each image, size, label, split, phone boxes, `phoneLong`) | field folder + copy in `docs/exam/examlab-phone/manifest.jsonl` | copy only |
| `labels.csv` (id, pos / neg, hand-check note) | field folder | no (hash locked) |
| `ATTRIBUTION.csv` (image id, original URL, landing URL, author, author URL, licence, title) | field folder | copy in `docs/exam/examlab-phone/ATTRIBUTION.csv`, titles withheld (Flickr titles can name the people pictured) |
| `handcheck-dropped.csv` (candidates removed by the hand-check, with reason) | field folder | no |
| Lock | `evals-locks/examlab-phone.sha256` (manifest.jsonl, labels.csv, ATTRIBUTION.csv) | yes |
| Harness | `tools/examlab-phone-eval.mjs` (calls `assertLocked`, then checks every image against its manifest sha256) | yes |

## How the set was built (fixed before any measurement)

- Source: Open Images V7 (Google LLC; annotations CC BY 4.0). Only images whose own `License` field in the Open Images
  metadata is `https://creativecommons.org/licenses/by/2.0/` were taken (checked per image; every candidate passed,
  0 refused). Rotation 0 only. Images already used in `exam-faces`, `exam-faces-hall` and `hall-detector` excluded.
- Positives, two pools, in sha256 order of `"lensiq-examlab-phone:" + id`:
  - test split: a `Mobile phone` box (not group, not depiction) overlapping a `Person` / `Man` / `Woman` / `Boy` /
    `Girl` / `Human hand` box (90 candidates); a second pool of phone boxes without any human box (110 downloaded) was
    almost all product shots and was dropped at hand-check;
  - train split: a `Mobile phone` box overlapping a `Human hand` box (150 candidates; the validation split had only 7
    unused phone images).
- Negatives (test split): no `Mobile phone`, `Telephone`, `Corded phone` or `Tablet computer` box or positive image
  label; 1–4 person boxes, at least one >= 5 % of the image; a `Desk` / `Table` / `Coffee table` /
  `Kitchen & dining room table` box; no depicted humans (160 candidates).
- Hand-check (contact sheets with the phone boxes drawn, one pass, before any detector ran): a positive is kept only if
  a mobile phone is visibly held in a hand; a negative only if no phone is visible anywhere. Removed: tablets, GPS units,
  phones on a surface, adverts / screenshots, unverifiable crowds, cluttered tables, one phone lying on a desk, one
  unsuitable image. Reasons per image in `handcheck-dropped.csv`.

| | Positives | Negatives |
|---|---|---|
| Candidates | 350 | 160 |
| Kept after hand-check | **223** (80 test + 143 train) | **135** |

Phone size in the positives: < 0.15: 11 · 0.15 – 0.4: 70 · >= 0.4 (close-up): 142. `phoneLong` is
max(normalised box width, normalised box height) of the largest phone box, relative to the original image, so for a
portrait image it is larger than the phone's share of the 640 x 480 frame after letterboxing. Public phone photos are
mostly close-ups, so A2 is decided on the 81 positives with `phoneLong` < 0.4 only.

## Protocol (in `tools/examlab-phone-eval.mjs`)

Letterbox each image into 640 x 480 (the lab camera request); run the lab page's own call
`LQDetect.detectCocoMulti(coco, frame, [{classes: [76, 83, 72, 71], minScore: 0.4, max: 10}])` in headless Chrome
(`exam-lab.html?cpu`); a frame is flagged when a phone detection scores >= `LQExam.DEFAULTS.phoneConf` (0.6).
A2 decision (primary): recall on the positives with `phoneLong` < 0.4 only (n = 81, >= 50), Wilson 95 % interval,
target >= 80 %. Secondary rows only, never used for the decision: recall on all 223 positives, recall on the >= 0.4
close-up band and the two smaller bands, false flags on the 135 negatives, score cuts 0.4 and 0.5. Every number from
this set is stated as **public stills, not lab webcam; field pilot confirms**. `--from` refuses a saved run unless its
`manifestSha256` equals the locked manifest hash and its frame ids match the manifest ids one for one. Not measured
yet: the Exam lab team measures after merge. **Measured 2026-11-20, see Result below.**

## Result (first measurement, 2026-11-20, branch examlab-s2 on main 299370b8)

Run: `node tools/examlab-phone-eval.mjs --run` (eval-guard OK, phase examlab-phone, lock commit 6583d967), headless Chrome,
TF.js wasm backend, Apple M1 (re-run on the branch after the S2 change, TF.js loaded on demand: identical, 24 / 81;
`results/examlab-phone-2026-11-20-after-s2.json`). Result file (image ids and scores only, no images):
`~/LENSIQ-field/evals/examlab-phone/results/examlab-phone-2026-11-20.json`. Source: **public dataset**; public stills, not
lab webcam; the field pilot confirms.

**A2: fail. Recall at desk-like sizes (phoneLong < 0.4) = 29.6 % (24 / 81), Wilson 95 % 20.8 % – 40.3 %, target >= 80 %.**
The model finds close-up phones (90.8 %, 129 / 142) but misses most phones that are small in the frame (0 / 11 below 0.15;
24 / 70 between 0.15 and 0.4). No false flags on the 135 negatives at any cut. Lowering the cut to 0.4 would give 48.1 %
(39 / 81), still far under the target, and is not changed (no threshold is tuned on this locked set).

What this means for the product: the "phone in view" signal is an aid that catches a phone held close to the webcam; it
should not be described as catching a phone held low at the desk. No page states a phone rate today
(`docs/ACCURACY-CLAIMS.md`, "phone / book detection on exam footage: not measured"), so no wording changes here.

### Table (public dataset: Open Images V7, CC BY 2.0 images; public stills, not lab webcam; field pilot confirms)

| Row | Use | Score cut | Rate | 95 % CI |
|---|---|---|---|---|
| recall, positives with phoneLong < 0.4 (A2 decision) | **primary** | 0.6 | 29.6 % (24 / 81) | 20.8 % – 40.3 % |
| recall, all positives | secondary | 0.6 | 68.6 % (153 / 223) | 62.2 % – 74.3 % |
| recall, close-up band phoneLong >= 0.4 | secondary | 0.6 | 90.8 % (129 / 142) | 85.0 % – 94.6 % |
| recall, band phoneLong < 0.15 | secondary | 0.6 | 0.0 % (0 / 11) | 0.0 % – 25.9 % |
| recall, band 0.15 <= phoneLong < 0.4 | secondary | 0.6 | 34.3 % (24 / 70) | 24.2 % – 46.0 % |
| recall, positives with phoneLong < 0.4, score cut 0.4 | secondary | 0.4 | 48.1 % (39 / 81) | 37.6 % – 58.9 % |
| recall, positives with phoneLong < 0.4, score cut 0.5 | secondary | 0.5 | 37.0 % (30 / 81) | 27.3 % – 47.9 % |
| false flags, negatives | secondary | 0.6 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |
| false flags, negatives, score cut 0.4 | secondary | 0.4 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |
| false flags, negatives, score cut 0.5 | secondary | 0.5 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |

A2 (recall >= 80.0 % on >= 50 phone-in-hand frames with phoneLong < 0.4): **fail** · source: public dataset · public stills, not lab webcam; field pilot confirms

Machine: {"tf":"wasm","cpu":"Apple M1","cores":8,"ramGB":8,"os":"darwin 25.5.0"}

## Tuning set and phone zoom pass (owner decision 217 ก, 2026-11-21; written before any tuning measurement)

The owner's words: "Build the tuning set from Open Images (CC BY 2.0, attribution as in decision 134), disjoint from the
locked set, boxes from the dataset only, nobody opens images. Lock the tuning/test separation before measuring. Report the
result honestly even if it stays under 80%."

### The tuning set (`~/LENSIQ-field/evals/examlab-phone-tune/`, built by `tools/examlab-phone-tune-build.py`)

- Source and licence as above: Open Images V7, only images whose own `License` field is CC BY 2.0, Rotation 0. Credits per
  image in `ATTRIBUTION.csv` (field copy with titles; repo copy `docs/exam/examlab-phone-tune/ATTRIBUTION.csv`, titles
  withheld), the decision-134 format. 359 / 359 images CC BY 2.0, 0 refused after selection.
- Disjoint from the locked set: every Open Images id and Flickr photo already used in `examlab-phone` (all 510 candidates,
  including the ones dropped at hand-check), `exam-faces`, `exam-faces-hall`, `hall-detector` and any other field-eval
  manifest is excluded (1335 ids, 1332 Flickr photos). Checked after download by id, image sha256, file name and Flickr
  photo id: **0 / 0 / 0 / 0 shared** (`tools/examlab-phone-separation.mjs`, run by
  `tests/unit/examlab-phone-tune-separation.test.js` on the repo copies in CI and by the tuning harness before every run).
- Labels from the dataset's own boxes only. **Nobody opened or viewed any image** (no hand-check, no contact sheet), so the
  labels carry the dataset's noise (the locked set's hand-check kept 80 of 90 test-split candidates of the same rule):
  - positives (train split): the locked set's rule, a `Mobile phone` box (not group, not depiction) overlapping a `Person` /
    `Man` / `Woman` / `Boy` / `Girl` / `Human hand` box (not depiction); images with a `Tablet computer`, `Telephone` or
    `Corded phone` box left out; desk-size only, `phoneLong` < 0.4 (the size band A2 is decided on). The train phone + hand
    pairs are exhausted by the locked set (161 images, 150 used), so the person-box rows of the 4312 train phone images were
    read from the public `train-annotations-bbox.csv` (streamed, only matching rows kept);
  - negatives (test split): the locked set's negative rule (no phone / telephone / tablet box or positive label; 1 – 4
    person boxes, one >= 5 % of the image; a desk / table box; no depicted humans).
  - Order: sha256 of `"lensiq-examlab-phone-tune:" + id`; unavailable Flickr photos skipped (68) and 4 non-JPEG replies.
- Size: Flickr size "b" (longest side <= 1024 px; the frame is 640 x 480, so nothing is lost): **359 images, 49.1 MB**
  (180 positives: 24 below 0.15, 156 between 0.15 and 0.4; 179 negatives).
- Locks (committed before any measurement): `evals-locks/examlab-phone-tune.sha256` (manifest, labels, credits),
  `evals-locks/examlab-phone-tune__harness1.sha256` (tuning harness, separation module and test, builder, repo credits),
  `evals-locks/examlab-phone__harness2.sha256` (locked-set harness through the page's object pass).

### The product change and how it is chosen

- `exam-lab.js` `objectPass()`: the same full-frame COCO-SSD call as before; when it finds no phone at `phoneConf` (0.6),
  the frame is also run as overlapping crops (`LQExam.LAB_PHONE_ZOOM`, `LQExam.phoneZoomRects`, `LQDetect.detectCocoRects`);
  each crop is scaled up to the model's 300 x 300 input, so a phone low at the desk is larger to the model. A crop phone
  counts only at `minScore` (never below `phoneConf`). The live loop and both harnesses call this one function.
- Candidates (fixed in `tools/examlab-phone-tune-eval.mjs` before measuring): grids 2x2, 3x2, 3x3, 4x3 over the frame;
  bands of 2 or 3 crops over y 0.35 – 1 and 3x2 over y 0.25 – 1; zoom cuts 0.6, 0.7, 0.8, 0.9.
- Selection rule (fixed before measuring): at most 9 crops; false flags on the 179 tuning negatives <= 1; then the
  highest recall on the 180 tuning positives; ties: fewer crops, then the higher cut. If no candidate passes, the zoom pass
  stays off.
- Then ONE run on the locked A2 set with `tools/examlab-phone-eval2.mjs` (refuses a second run). The locked harness
  `tools/examlab-phone-eval.mjs` reproduces only the full-frame call, so it cannot see a zoom pass; harness 2 is the same
  protocol, statistics and tables (imported from harness 1) through the page's own `objectPass`. No setting is changed after
  the locked result is seen.

### Tuning result (tuning set only; public dataset; tuning set, public stills, not lab webcam)

Sweep `tools/examlab-phone-tune-eval.mjs --sweep`, 2026-11-21, on commit `cdbabc5e` (locks committed), headless Chrome,
TF.js wasm, Apple M1. Result file (ids and scores only): `~/LENSIQ-field/evals/examlab-phone-tune/results/tune-sweep-2026-11-21T04-26-35.json`.
Positives n = 180 (all phoneLong < 0.4), negatives n = 179.

| Config | Crops | Zoom cut | Desk-size recall | 95 % CI | False flags | 95 % CI |
|---|---|---|---|---|---|---|
| off (full frame only, as shipped before) | 0 | – | 31.7 % (57 / 180) | 25.3 % – 38.8 % | 0 / 179 | 0.0 % – 2.1 % |
| g2x2 | 4 | 0.6 | 56.1 % (101 / 180) | 48.8 % – 63.2 % | 2 / 179 | 0.3 % – 4.0 % |
| g3x2 | 6 | 0.6 | 61.1 % (110 / 180) | 53.8 % – 67.9 % | 2 / 179 | 0.3 % – 4.0 % |
| g3x2 | 6 | 0.7 | 56.1 % (101 / 180) | 48.8 % – 63.2 % | 1 / 179 | 0.1 % – 3.1 % |
| **g3x3 (chosen)** | 9 | 0.6 | **70.6 % (127 / 180)** | 63.5 % – 76.7 % | **0 / 179** | 0.0 % – 2.1 % |
| g3x3 | 9 | 0.7 | 66.1 % (119 / 180) | 58.9 % – 72.6 % | 0 / 179 | 0.0 % – 2.1 % |
| g4x3 (over the 9-crop cap) | 12 | 0.6 | 65.0 % (117 / 180) | 57.8 % – 71.6 % | 0 / 179 | 0.0 % – 2.1 % |
| band2 (y 0.35 – 1) | 2 | 0.6 | 55.6 % (100 / 180) | 48.3 % – 62.6 % | 0 / 179 | 0.0 % – 2.1 % |
| band3 (y 0.35 – 1) | 3 | 0.6 | 57.2 % (103 / 180) | 49.9 % – 64.2 % | 0 / 179 | 0.0 % – 2.1 % |
| band3x2 (y 0.25 – 1) | 6 | 0.6 | 68.9 % (124 / 180) | 61.8 % – 75.2 % | 0 / 179 | 0.0 % – 2.1 % |

(All 29 rows, cuts 0.6 – 0.9, are in the result file; every higher cut lowers recall.) By the fixed rule: **g3x3, overlap
0.25, zoom cut 0.6**, shipped as `LQExam.LAB_PHONE_ZOOM` (commit `d986f36e`). The page's own path, re-measured on the
tuning set (`--product`, `tune-product-2026-11-21T04-39-43.json`): identical, 127 / 180 and 0 / 179. Cost: about 9 extra
model runs (median 551 ms per analysed frame against 53 ms for the full frame alone, M1, wasm, on a busy machine) on frames
where the full frame shows no phone; the lab analyses objects on every third frame.

### Locked A2 result with the zoom pass (single run, 2026-11-21, settings frozen at `d986f36e`)

Run: `node tools/examlab-phone-eval2.mjs --run` (eval-guard OK, phase examlab-phone, lock commit 6583d967), once; the harness
refuses a second run. Result file: `~/LENSIQ-field/evals/examlab-phone/results/examlab-phone-zoom-2026-11-21.json`.
Source: **public dataset**; public stills, not lab webcam; the field pilot confirms.

**A2: still fail. Recall at desk-like sizes (phoneLong < 0.4) = 65.4 % (53 / 81), Wilson 95 % 54.6 % – 74.9 %, target
>= 80 %** (before: 29.6 %, 24 / 81). False flags 0 / 135 (0.0 % – 2.8 %), unchanged.

| Row | Use | Score cut | Rate | 95 % CI |
|---|---|---|---|---|
| recall, positives with phoneLong < 0.4 (A2 decision) | **primary** | 0.6 | 65.4 % (53 / 81) | 54.6 % – 74.9 % |
| recall, all positives | secondary | 0.6 | 82.1 % (183 / 223) | 76.5 % – 86.5 % |
| recall, close-up band phoneLong >= 0.4 | secondary | 0.6 | 91.5 % (130 / 142) | 85.8 % – 95.1 % |
| recall, band phoneLong < 0.15 | secondary | 0.6 | 27.3 % (3 / 11) | 9.7 % – 56.6 % |
| recall, band 0.15 <= phoneLong < 0.4 | secondary | 0.6 | 71.4 % (50 / 70) | 59.9 % – 80.7 % |
| recall, positives with phoneLong < 0.4, score cut 0.4 | secondary | 0.4 | 71.6 % (58 / 81) | 61.0 % – 80.3 % |
| recall, positives with phoneLong < 0.4, score cut 0.5 | secondary | 0.5 | 66.7 % (54 / 81) | 55.9 % – 76.0 % |
| false flags, negatives | secondary | 0.6 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |
| false flags, negatives, score cut 0.4 | secondary | 0.4 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |
| false flags, negatives, score cut 0.5 | secondary | 0.5 | 0.0 % (0 / 135) | 0.0 % – 2.8 % |

Nothing is re-tuned after this result. Page wording does not change here (claims change only through the separate 213
work). The tuning set is noisier than the locked set (no hand-check), and its recall (70.6 %) and the locked recall
(65.4 %) agree within their intervals.

## Licence and credits

Eval-only, not shipped, nothing trained on it. Row in `LICENSES/THIRD_PARTY.md` (Test-only fixtures). Each image is
credited to its Flickr author under CC BY 2.0 in `ATTRIBUTION.csv`; Open Images annotations are CC BY 4.0
(Google LLC).

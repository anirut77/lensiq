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
**Update 2026-11-21 (owner item 213):** exam.html (`exam.l.cl3`, TH / EN / ZH), the one-pager, the deck, the demo script
and `docs/LAUNCH-READINESS.md` now state these figures with this source, and say plainly that a phone lying on the desk
is usually missed (`tests/unit/exam-phone-claims-213.test.js`, locked).

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

## Licence and credits

Eval-only, not shipped, nothing trained on it. Row in `LICENSES/THIRD_PARTY.md` (Test-only fixtures). Each image is
credited to its Flickr author under CC BY 2.0 in `ATTRIBUTION.csv`; Open Images annotations are CC BY 4.0
(Google LLC).

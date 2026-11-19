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

Phone size in the positives (`phoneLong` = longest phone box side as a fraction of the image side): < 0.15: 11 ·
0.15 – 0.4: 70 · >= 0.4 (close-up): 142. Public phone photos are mostly close-ups; the harness reports recall per size
band so the desk-distance view (< 0.4, 81 frames) is visible on its own.

## Protocol (in `tools/examlab-phone-eval.mjs`)

Letterbox each image into 640 x 480 (the lab camera request); run the lab page's own call
`LQDetect.detectCocoMulti(coco, frame, [{classes: [76, 83, 72, 71], minScore: 0.4, max: 10}])` in headless Chrome
(`exam-lab.html?cpu`); a frame is flagged when a phone detection scores >= `LQExam.DEFAULTS.phoneConf` (0.6).
Primary: recall on positives with a Wilson 95 % interval, target >= 80 %. Reported only: false flags on negatives,
score cuts 0.4 and 0.5, recall by size band. Not measured yet: the Exam lab team measures after merge.

## Licence and credits

Eval-only, not shipped, nothing trained on it. Row in `LICENSES/THIRD_PARTY.md` (Test-only fixtures). Each image is
credited to its Flickr author under CC BY 2.0 in `ATTRIBUTION.csv`; Open Images annotations are CC BY 4.0
(Google LLC).

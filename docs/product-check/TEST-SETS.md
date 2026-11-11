# Product Check test sets: frozen 2026-11-09 (P1)

> Phase P1 "test sets first" (design §5.3, §9.1). Fixed **before** any detector or pattern is tuned. **Counts and checksums
> only**: no texts, photos or product data are in the repo. The data lives in `~/LENSIQ-field/product-check/` on the
> owner's machine (the design's `field-data/` folder is the same idea; this path keeps it outside the repo tree entirely).
> Every number says its source: **public dataset** (texts collected from public regulator, news and maker pages; Open Food
> Facts photos), **field** (the owner's photos, not taken yet) or **synthetic** (unit-test fixtures only).

## สรุปสำหรับเจ้าของ (Thai summary)

- ชุดข้อความ 534 ข้อความ (โฆษณาเกินจริงที่หน่วยงานรัฐเคยเตือน 196 + ข้อความบนฉลากหรือหน้าสินค้าของผู้ผลิต 338) ภาษาไทย 258
  อังกฤษ 251 จีน 25 ทุกข้อความมีลิงก์แหล่งที่มา
- ติดป้ายกฎ 2 ชุดแยกกัน (agentA กับ agentB ซึ่งเป็น AI ทั้งคู่ ยังไม่ใช่คน) ความสอดคล้อง κ รวม 0.915 ต่ำสุดคือกลุ่มสมุนไพร κ 0.54
  มี 59 ข้อความที่ไม่ตรงกัน รอเภสัชกรตัดสิน
- แบ่ง dev 270 / held-out 264 ด้วย seed คงที่ ห้ามใช้ held-out ปรับกฎ
- ภาพสาธารณะชั่วคราวจาก Open Food Facts / Open Beauty Facts เหลือ 281 ภาพ (สินค้า 190 ชิ้น ไทย 114 ชิ้น) ใช้วัดผล P2 ก่อนได้ภาพจริง
  ใช้ในเครื่องเท่านั้น ห้าม commit หรือแจกต่อ ลบภาพที่มีคนหรือส่วนของร่างกายคนจริงออกรวม 66 ภาพ (ตัวตรวจอัตโนมัติจับได้ 6
  และตรวจด้วยตาอีก 60 ภาพ ส่วนใหญ่เป็นมือที่ถือสินค้า) เก็บภาพคนที่เป็นลายพิมพ์บนบรรจุภัณฑ์ไว้ 11 ภาพเพื่อทดสอบตัวกันใบหน้า
- ค่าตั้งต้นของ regex ฉบับร่าง (ยังไม่ปรับ) บนชุด held-out: precision 0.68 recall 0.46 วัดโดยผู้ตรวจอิสระ (ดูข้อ 1.5)
- ภาพจริงของเจ้าของ (≥ 305 ภาพ) ยังไม่มี ดูวิธีถ่ายใน `PHOTO-SET-PROTOCOL.md`

## 1. Over-claim text set (design §5.3)

**Source: public dataset** (regulator / court / news pages and makers' own label pages, collected 2026-11-09; every row has
its `source_url`). Files in `~/LENSIQ-field/product-check/texts/`.

### 1.1 Counts per stratum

| Stratum / category | th | en | zh | Total |
|---|---|---|---|---|
| over-claim / supplement | 56 | 56 | 3 | 115 |
| over-claim / food | 23 | 1 | 4 | 28 |
| over-claim / cosmetic | 13 | 11 | 1 | 25 |
| over-claim / herbal | 8 | 9 | 0 | 17 |
| over-claim / drug | 6 | 4 | 1 | 11 |
| **over-claim total** | 106 | 81 | 9 | **196** (target ≥ 150) |
| compliant / supplement | 39 | 55 | 4 | 98 |
| compliant / food | 34 | 41 | 0 | 75 |
| compliant / drug | 14 | 43 | 10 | 67 |
| compliant / cosmetic | 32 | 28 | 2 | 62 |
| compliant / herbal | 33 | 3 | 0 | 36 |
| **compliant total** | 152 | 170 | 16 | **338** (target ≥ 250) |
| **All** | 258 | 251 | 25 | **534** (target ≥ 400) |

- **"Over-claim" stratum** = wording that Thai FDA, a Thai provincial office, Thai police, US FDA, FTC, UK ASA, Singapore HSA
  or a Chinese market regulator cited (press releases, warning letters, rulings, or news of the case), plus 9 Thai rows of
  example wording from regulator guidance. 192 of 196 carry at least one rule id; 4 carry none under the v1 rules
  (e.g. "100% natural", an infant-age supplement claim, a cosmetic pigmentation claim).
- **"Compliant" stratum** = the product's own label or listing text from makers' pages and official label databases
  (openFDA / DailyMed, NIH DSLD, Open Food Facts legal names). "Compliant" means "sold as a registered or lawfully marketed
  product", **not** "free of risk signals": 96 of 338 carry a rule id, mostly F10 (nutrient-function and structure /
  function claims such as "calcium helps build strong bones" or "supports immune health"). Under the labelling guide these
  count as F10 risk signals because Thai law allows them only as approved claims; P3 needs an allowlist of approved Thai
  nutrient-function wording so that approved claims are not flagged (open point for the pharmacist).
- Dropped before freezing: 12 rows (7 medical-device rows, no rule family in v1; 5 "other" rows mixing product types).
- Verbatim check: the 90 English / Chinese over-claim rows were re-fetched and matched against the source page: 87 fully
  found, 3 partially found (summariser trim; marked in `notes`). The Thai rows and the compliant rows were checked against
  stored copies of their pages by the collectors; ~15 Thai rows are claims "as reported" by the regulator without
  quotation marks and 8 compliant rows join label lines from different headings of one page (marked in `notes`).
- No person names (brand names only): one brand that is a person's name was replaced by "[ชื่อแบรนด์]", and a person's
  name in PCT-0145 was replaced by "[name]" after the P1 review. No images.
- PCT-0050 to PCT-0060 (11 rows from one Matichon article listing 11 products) are marked "as reported": the word
  "อ้างว่า" between the product name and the claim was removed; the rest is verbatim.

### 1.2 Labels and agreement (Cohen's κ)

- **Labelling guide** and **rule list** used by both labellers: `~/LENSIQ-field/product-check/texts/LABELLING-GUIDE.md` and
  `rules-for-labelling.md` (the 36 text-detectable rules of `RULES.md`; a text gets only rules of its category's family).
- **agentA** labelled in `set.jsonl`; **agentB**, a separate agent that saw only id + language + category + text and the
  rule list, labelled in `labels-agentB.jsonl`. **Both labellers are AI agents, not people.** The design asks for two
  people plus a pharmacist; these labels are a P1 baseline until the pharmacist adjudicates.
- Unit for κ = (text, rule) pair over the text rules of the text's family. Computed with `node tools/pc-texts.mjs`.

| Family | κ | Pairs | A positives | B positives | Both |
|---|---|---|---|---|---|
| All (pooled) | **0.915** | 7,284 | 477 | 494 | 447 |
| F food / supplement | 0.933 | 6,004 | 386 | 410 | 373 |
| D drug | 0.962 | 546 | 14 | 13 | 13 |
| C cosmetic | 0.898 | 522 | 56 | 54 | 50 |
| H herbal | **0.538** | 212 | 21 | 17 | 11 |
| Any flag per text (yes / no) | 0.962 | 534 texts | 288 | 284 | — |

- Lowest per-rule κ: H02 0.33, F18 0.00 (B 2, A 0), F20 0.54, H05 0.60, F02 0.70, F19 0.78, C08 0.81.
- **59 texts disagree**; all are in `disagreements.jsonl`, each marked `"status": "pending pharmacist adjudication"`.
- **Independence caveat:** agentB's short hand-back report (its counts per rule and about 35 ids it found ambiguous, without
  its label file) reached agentA before agentA labelled ids 0191-0534. κ on the 337 texts never mentioned in that report is
  0.914 (F 0.928, D 1.00, C 0.93, H 0.52), the same as on all texts, so the effect looks small; the pharmacist's
  adjudication remains the reference.

### 1.3 Split (fixed before tuning)

- Stratified by category × stratum (over-claim / compliant); ids sorted, seeded Fisher-Yates shuffle, first ceil(n/2) to
  dev. Seed `lensiq-pc-p1-text-2026-11-09`. File `split.json`.
- **dev 270 / held-out 264.** Held-out: 93 over-claim texts with a rule, 3 over-claim without, 48 compliant with a rule,
  120 compliant without. Only dev may be used to tune patterns (P3); held-out is for the reported numbers.

| Category / stratum | dev | held-out |
|---|---|---|
| supplement / over-claim | 58 | 57 |
| supplement / compliant | 49 | 49 |
| food / over-claim | 14 | 14 |
| food / compliant | 38 | 37 |
| cosmetic / over-claim | 13 | 12 |
| cosmetic / compliant | 31 | 31 |
| herbal / over-claim | 9 | 8 |
| herbal / compliant | 18 | 18 |
| drug / over-claim | 6 | 5 |
| drug / compliant | 34 | 33 |

### 1.4 Freeze (SHA-256)

| File (in `~/LENSIQ-field/product-check/texts/`) | SHA-256 |
|---|---|
| `set.jsonl` (534 rows, agentA labels; v1.1 after the P1 review: PCT-0145 name redacted, notes on PCT-0050..0060; labels unchanged) | `8d93deea37713dcc8075609109af8bdf9544b507775f3a10f31a885358fea4de` |
| `set.jsonl` v1.0 (superseded, same labels) | `277032457effba6ccc54d225c770dceabe8e900da67de8a0967d51991b34b340` |
| `split.json` | `ab22ce6e464cc5776970b0f52ae592ef70b6052ac8eebee48ed5140edab8a0e3` |
| `labels-agentB.jsonl` | `5250f0c20c124e7d5869d72888ffa6119187aefe258c88dc6dc0c57b38ee3acd` |
| `disagreements.jsonl` (59 rows) | `9f58ea54b48d539a5d5c09e954ad7cc73c060f31dff2079f012ab9a1560a3aca` |

κ, split and disagreements are unchanged by v1.1 (labels and ids did not change).

### 1.5 Pre-tuning regex baseline (held-out, recorded by the independent reviewer)

**Source: public dataset; labels = agentA (not yet adjudicated); detector = the DRAFT regex in `tools/pc-rules-draft.json`,
NOT tuned** (measured by the independent P1 reviewer agent before the F05 lookahead / F18 context fixes, on the 264 held-out
texts). This is a starting point, not a product claim; targets (design §9.2) are recall ≥ 80 % and precision ≥ 80 %.

| Family | Precision | Recall |
|---|---|---|
| All | 0.68 | 0.46 (TP 104, FP 48, FN 122) |
| F food / supplement | 0.66 | 0.50 |
| C cosmetic | 1.00 | 0.24 |
| H herbal | 1.00 | 0.33 |
| D drug | 1.00 | 0.29 |

- False flags on the 120 held-out compliant texts with no expected rule: 3 (2.5 per 100; target ≤ 5).
- P3 tunes patterns on dev only and reports the held-out numbers again with the same labels (or the adjudicated v2).

Re-check: `node tools/pc-texts.mjs ~/LENSIQ-field/product-check/texts/set.jsonl --labels-b …/labels-agentB.jsonl --json`.
After the pharmacist adjudicates, the adjudicated labels become `set.v2.jsonl` with a new checksum row here; the split
(by id) does not change.

## 2. Owner photo set (design §9.1)

**Source: field. Not collected yet.** Protocol: `PHOTO-SET-PROTOCOL.md`; sheet template: `photo-labels-template.csv`;
validator: `node tools/pc-photo-labels.mjs ~/LENSIQ-field/products/labels.csv`. Minimums: 140 Thai (40 drug, 40 supplement,
30 cosmetic, 30 food), 90 foreign (15 each CN, JP, KR, MY/SG, US, EU), ≥ 75 illegal / warned, ≥ 40 over-claim (overlap).

## 3. Interim public photo set (until the owner's photos arrive)

**Source: public dataset** — Open Food Facts (food) and Open Beauty Facts (cosmetics), fetched 2026-11-09 with
`tools/pc-public-photos.mjs` (search.openfoodfacts.org; the OFF v2 `/search` endpoint returned "temporarily unavailable"
that day). Ground truth = what OFF provides: **barcode, product name, brands (missing on 35 images), countries,
categories**; labelled **"public dataset, community-entered, unverified"**. No registration numbers, lots, expiry or claims
are provided by OFF, so this set measures barcode reading, OCR of names and multilingual text only, not the full field set
of §9.1.

- **Licence:** database ODbL 1.0, images CC BY-SA 3.0. Used locally for evaluation only; never committed, shipped or
  redistributed; kept apart from any LENSIQ register (design §4.5, risk PR11).
- **Person check, step 1 (automatic):** every downloaded image (347) was run through macOS Vision face and human-body
  detectors (`VNDetectFaceRectanglesRequest`, `VNDetectHumanRectanglesRequest`); 6 images with any detection were deleted.
- **Person check, step 2 (manual, after the P1 review):** all 341 remaining images were viewed in contact sheets (and
  zoomed where unclear). **The Vision detectors missed at least 60 images with real people's body parts in 341** (mostly
  hands holding the product, also arms, legs / feet and a bystander); **all 60 were deleted** (conservative: any visible real
  hand or finger counts until the owner rules on hands). 66 images deleted in total; reasons per file in `excluded.jsonl`.
- **Pack art kept:** 11 images show printed or drawn people that are part of the pack design (cartoon figures, brand
  portraits, label illustrations). They are kept as negative cases for the P2 face gate and flagged `pack_art_person: true`
  in the manifest. No real person is visible in the 281 images that remain.
- Files: `~/LENSIQ-field/product-check/public-photos/images/` (281 JPEG, 400 px), `manifest.jsonl` (barcode, product_name,
  brands, countries, categories, image_kind, image_url, licence, accessed, sha256, face_check, manual_check,
  pack_art_person), `excluded.jsonl` (66 rows, file and barcode only).

| Country stratum (OFF `countries_tags`) | Products | Front images | Ingredients images | Images |
|---|---|---|---|---|
| Thailand, food (OFF; barcode prefix 885) | 93 | 76 | 74 | 150 |
| Thailand, cosmetics (OBF) | 21 | 21 | 0 | 21 |
| China | 13 | 13 | 6 | 19 |
| Japan | 15 | 12 | 12 | 24 |
| South Korea | 10 | 9 | 2 | 11 |
| Malaysia | 10 | 9 | 5 | 14 |
| United States | 13 | 12 | 3 | 15 |
| EU (France 8, Germany 7) | 15 | 15 | 12 | 27 |
| **Total** | **190** | **167** | **114** | **281** (target ≥ 200) |

Counts are after both person checks ("Products" = products with at least one image left). Before them: 227 products,
347 images downloaded. Korea, Malaysia and China are now below 15 products each.

- "Sold in" = OFF `countries_tags` (where contributors scanned it), not an official market record. Thai OFF items were
  limited to GS1 Thailand barcodes (885…); 107 of 114 Thai products have an 885 prefix (the OBF ones may not).
- Category mix (first OFF category): mostly plant-based foods, snacks, beverages and dairy; **no drugs and almost no
  supplements**, so this set cannot stand in for the drug / supplement strata or the illegal-product stratum.
- `manifest.jsonl` SHA-256 (281 rows, after the manual pass): `fa4e4d0df619d50c11ac5a4107e776f087459f0d33ddf431b93889d5d27ca99b`
  (superseded: `7ded3ca8e7a9b197e68a5569b97dc59e2991fa8f63987b5bf41a09eb934d2af9`, 341 rows).
- `excluded.jsonl` SHA-256 (66 rows): `c8fe7d0dbeac4b9b3c4ccefab81cf77c578c34b5e8d89c3046a7e34654cc97ae`.

## 4. Synthetic fixtures

`tests/unit/pc-texts.test.js` and `tests/unit/pc-photo-labels.test.js` build their own fake rows (example.invalid URLs,
"FAKE" rows). They test the tools, not detection accuracy, and produce no accuracy number.

## 4. Fresh advert / claim texts (collected 2026-11-11)

402 texts (239 over-claim, 163 compliant; th 158, en 210, zh 34) quoted from public pages, for one held-out measurement of the
on-device advert rules (approved item 4, adverts option B). Stored outside the repo in `~/LENSIQ-field/product-check/texts-fresh/`;
the README there lists every source and the licence of each row. **Owner decision 2026-11-11:** internal measurement only, not
redistributed, not used for training, never committed; on the legal list as CTO-BRIEF L53. Rules are tuned on the old P3 data
only; this set is labelled blind by two labellers, locked with sha256 recorded here, and scored once by an independent agent.

**Locked 2026-11-11, before any scoring** (`~/LENSIQ-field/evals/adverts/fresh/`, files read-only). Two blind AI labellers
(A and B, separate agents; each saw only id, language, category, text, the labelling guide and the rule list): text-level
agreement κ = 0.887 (246 both flagged, 135 both clean, 21 disagree); rule labels A 367, B 372, agreed 342 (Jaccard 0.861).
Both labellers are AI agents, not people (same as P3).

| File | sha256 |
|---|---|
| `blind-input.jsonl` (402 rows: id, lang, category, text) | `2a7da71fefd9806acd5dc5e5f95ad75999c450ac211124599f93b73f437eed13` |
| `labels-A.jsonl` | `582c86f59ba285996325c7cfe9cf33dda7232e8e0581868411a423e294998e49` |
| `labels-B.jsonl` | `e25c605f4902f0f418a60abf2d156cd1fa589ae00188cfec1f375a3cab685e41` |

Scoring rule fixed before scoring: an "over-claim text" is one both labellers flagged (≥ 1 rule each); a "compliant
text" is one both left empty; the 21 disagreements are reported apart. Recall = over-claim texts with ≥ 1 on-device signal
(target 80 %); false flags = signals on compliant texts per 100 compliant texts; both for the advert card default
(product type guessed) and with the labelled category chosen. One independent run; the set is then spent.

## 5. Second fresh advert set "fresh-2" (collected and locked 2026-11-11)

635 texts (380 over-claim, 255 compliant; th 193, en 220, zh 222; food 217, herbal 223), aimed at the misses of the
first independent run (cure / body-function / prevention claims, food, herbal, Chinese). Same licence decision as §4
(internal measurement only, outside the repo, L53). Stored in `~/LENSIQ-field/product-check/texts-fresh-2/`; README lists
sources, de-duplication against all earlier sets (0 shared URLs, 0 contained texts) and thin cells. Two blind AI
labellers: text-level κ = 0.916 (455 both flagged, 159 both clean, 21 disagree); rule labels A 691, B 733, agreed 629
(Jaccard 0.791). Locked before any rule change or scoring (`~/LENSIQ-field/evals/adverts/fresh2/`, read-only):

| File | sha256 |
|---|---|
| `blind-input.jsonl` | `e261cac0968b4646fb916b7b0a7ecd3bce30d6c3a1cd32e394bf496307ddfda4` |
| `labels-A.jsonl` | `5a5fe55d8a1ab4cbc653dc9ba6f4613aa6e49886ac5acaaf9ded1d81c8c803d6` |
| `labels-B.jsonl` | `1ee7431a87f7fbcddc5050f4b5bf8bf5f286950fff8b72896a384800ba8bb5e1` |

Scoring rule (same as §4): over-claim = both labellers flagged; compliant = both empty; disagreements apart; recall
(text with ≥ 1 signal) and false flags per 100 compliant texts with the product type chosen (the released mode), by
language and category. Owner targets for the rule work: misses first, false flags ≤ 5 per 100. Rules are tuned only on
the P3 dev split and the spent first fresh set (§4); this set is scored once by an independent agent, then spent.

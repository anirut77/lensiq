# Product Check P3: over-claim rules, results (2026-11-09)

> Phase P3 of `docs/PRODUCT-CHECK-DESIGN.md` §5.1 / §5.3 / §9.2. **Source of every number: public dataset (labelled by two
> AI agents, pending pharmacist adjudication).** The text set and labels are in `~/LENSIQ-field/product-check/texts/`
> (frozen in `TEST-SETS.md` §1.4); no text from it is in the repo. Every flag is a **risk signal** ("สัญญาณเสี่ยง",
> "风险信号"), never a finding that a product is illegal. Not wired into any page yet (P7 integrates it).

## สรุปสำหรับเจ้าของ (Thai summary)

- สร้างตัวตรวจข้อความโฆษณาเกินจริงแบบกฎตายตัว ทำงานในเครื่อง (`lensiq-claims.js`) บอกข้อความที่พบตรงตัวอักษร ตำแหน่ง รหัสกฎ
  ฐานกฎหมาย ลิงก์ และคำอธิบาย 3 ภาษา ทุกข้อขึ้นต้นว่า "สัญญาณเสี่ยง" ไม่มีคำว่า "ผิดกฎหมาย"
- ปรับกฎบนชุด dev 270 ข้อความเท่านั้น แล้ววัดชุด held-out 264 ข้อความ **ครั้งเดียว** (บันทึก hash ไว้ด้านล่าง)
- ผล held-out เทียบป้าย agentA: precision **91.9 %** (เป้า ≥ 80 % ผ่าน), recall **65.5 %** (เป้า ≥ 80 % **ไม่ผ่าน**),
  แจ้งเตือนผิดบนข้อความที่ไม่มีกฎ **3.3 ต่อ 100** (เป้า ≤ 5 ผ่าน) ดีขึ้นจากร่างเดิม (precision 0.68 recall 0.46) แต่ recall ยังไม่ถึงเป้า
- บน dev ได้ recall 94 % แต่ held-out 66 % แปลว่ากฎที่เพิ่มจับถ้อยคำแบบที่เห็นใน dev ได้ แต่ถ้อยคำใหม่ ๆ ยังหลุด ต้องเพิ่มข้อมูลหรือใช้
  LLM (design §5.2) ช่วย ห้ามปรับกฎด้วย held-out ชุดนี้อีก ต้องใช้ชุดใหม่หากจะวัดซ้ำ
- รายการข้อความกล่าวอ้างหน้าที่ของสารอาหารที่ อย. อนุญาต (ประกาศกระทรวงสาธารณสุข ฉบับที่ 447 พ.ศ. 2566 บัญชีหมายเลข 1, 135 ข้อความ
  ไทยและอังกฤษ) ใส่เป็นรายการยกเว้น ข้อความที่ตรงกับรายการนี้จะไม่ถูกเตือน แต่ป้ายของ agentA นับข้อความเหล่านี้เป็น F10 จึงนับเป็น
  "พลาด" 6 ครั้งใน held-out เรื่องนี้ต้องให้เภสัชกรตัดสิน
- ป้ายทั้งหมดยังเป็นของ AI 2 ตัว เภสัชกรยังไม่ได้ตัดสิน ตัวเลขทั้งหมดจึงเป็นผลเบื้องต้น

## 1. What was built

| File | What |
|---|---|
| `lensiq-claims.js` | `LQClaims` (browser global + Node module). `detect(text, {category, lang, context, wholeLabel, kind})` → `[{rule_id, family, span:{start,end}, text, severity, basis, url, status, explain:{th,en,zh}, label}]`; `normalize`, `explain`, `missingWarnings`, `RULES`, `ALLOW`, `MASKS` |
| `lensiq-claims-rules.js` | Rule DATA (`LQClaimsRules`), **generated** by `tools/pc-rules-build.mjs` from `tools/pc-rules-draft.json` (the draft is unchanged: SHA-256 `ecbb4707…85da`) |
| `tools/pc-rules-build.mjs` | Builds the data: Chinese titles, masks, F15 required lines, the MoPH No. 447 allowlist and the 25 named tuning changes (`--changes` lists them, `--check` verifies the generated file) |
| `tools/pc-claims-eval.mjs` | `--split dev` or `--split heldout`; refuses data or output paths inside the repo; per-rule confusion table (`--out` CSV); held-out runs are logged with hashes in `p3-heldout-runs.jsonl` next to the data; never prints held-out texts |
| `tests/unit/pc-claims.test.js` | Fixed test set (written before tuning, synthetic strings only): each family positive / negative, category scope, exact spans after normalisation, F18 context gating, อย. vs อย่าง, allowlist suppression, masks, F15 absence logic, no "illegal / ผิดกฎหมาย / 违法" in any output, TH / EN / ZH explanation for every rule (49), robustness. One test added during tuning for the new `เเ` fold and verb sets |
| `tests/unit/pc-claims-eval.test.js` | Scorer on synthetic rows: Wilson interval, per-rule counts, scope, false flags per 100, in-repo path refusal |

How the engine works:

- **Normalisation with an exact map back.** Zero-width characters removed; full-width and compatibility forms folded (NFKC
  per character, Thai untouched); Thai digits → 0-9; curly quotes and dashes folded; whitespace runs → one space, dropped
  between two Thai letters (OCR spacing); nikhahit + aa → sara am; `เเ` → `แ`. Every folded character keeps the start / end
  of the original characters it came from, so `flag.text === text.slice(span.start, span.end)` always (tested).
- **Scope.** A rule fires only for its categories (D drug, F food / supplement, H herbal, C cosmetic; F15 supplement only;
  F22 food only). Patterns of all three languages run on every text (labels mix scripts).
- **Gating.** `requires_claim_verb` rules (D08, F09, H05) need a verb within a window (40-80 characters); F09 and D08 use a
  treat / relieve verb set, H05 adds prevention. `requires_context` (F18) needs kratom / cannabis / hemp / CBD / THC in the
  text or in `opts.context` (the product record). Per-rule `exclude` patterns drop known false matches (for example blood
  clotting "เลือดแข็งตัว" for F11, storage instructions "บริโภคภายใน 7 วัน" for F06).
- **Masks.** Official warning and disclaimer wording is never read as a claim (and a claim verb inside it does not count):
  N293 label warnings, the F69 advert line "อ่านคำเตือนในฉลากก่อนบริโภค", the MoPH 2554 statement
  "ผลิตภัณฑ์นี้ไม่ใช้สำหรับรักษา บำบัด บรรเทา หรือป้องกันโรค", and the US 21 CFR 101.93(c) disclaimer.
- **Allowlist.** Approved nutrient-function statements (below) suppress F-family flags that overlap them, for food and
  supplement texts only. A different claim elsewhere in the same text is still flagged (tested).
- **F15 (missing supplement warnings)** runs only with `wholeLabel: true` and `category: "supplement"`. Label mode (default)
  requires the three N293 label lines; advert mode (`kind: "ad"`) the three F69 Annex 4 lines. The flag has `absence: true`,
  an empty span and the list of missing lines. F15 is not in the text-set labels, so it has no measured accuracy.

## 2. Tuning discipline and hashes

- Patterns were tuned on **dev (270 texts) only**. The held-out split (264) was scored **once**, after the unit tests, lint
  and typecheck passed, with:
  - `lensiq-claims-rules.js` SHA-256 `209088e515d642bd77ecc3d86fae5138e65d37e544136e47543843ce63da79f0`
  - `lensiq-claims.js` SHA-256 `f41bed9c14edd4cfb96a3c3c831dd9c1170d75e267f3aa1825ff6eb318dfcaa5`
  - logged at 2026-11-09T14:15:31Z in `~/LENSIQ-field/product-check/texts/p3-heldout-runs.jsonl`.
- After the run, one **description** string in the generated file was corrected (the F09 "what" text still named two
  patterns that had been removed during tuning). Detection data is identical: the content hash of
  `rules + masks + allow + warnings + claim_verbs` is `6b7d96e8…11b8ce` for both files. Shipped file SHA-256:
  `27817f42d2c253a796219d68279ebdcc93dfb0b3f144ccb0730d75aa8438d7d9`.
- No change was made after seeing the held-out numbers. A new measurement needs a new, unseen split or the pharmacist's
  adjudicated set plus new texts.

## 3. Held-out results (264 texts, scored once)

Unit = (text, rule) over the text-detectable rules in the text's category scope. 95 % Wilson intervals.
Targets (design §9.2): recall ≥ 80 %, precision ≥ 80 %, ≤ 5 false flags per 100 compliant texts.

### vs agentA labels (primary)

| Scope | TP | FP | FN | Precision [95 % CI] | Recall [95 % CI] |
|---|---|---|---|---|---|
| **All** | 148 | 13 | 78 | **91.9 %** [86.7, 95.2] | **65.5 %** [59.1, 71.4] |
| F food / supplement | 128 | 9 | 57 | 93.4 % [88.0, 96.5] | 69.2 % [62.2, 75.4] |
| D drug | 3 | 0 | 4 | 100.0 % [43.9, 100.0] | 42.9 % [15.8, 75.0] |
| H herbal | 4 | 0 | 5 | 100.0 % [51.0, 100.0] | 44.4 % [18.9, 73.3] |
| C cosmetic | 13 | 4 | 12 | 76.5 % [52.7, 90.4] | 52.0 % [33.5, 70.0] |

False flags on the 123 held-out texts with no expected rule: **4 flags = 3.3 per 100**; texts with any flag 4 / 123
(Wilson [1.3, 8.1] %).

### vs agentB labels

| Scope | TP | FP | FN | Precision [95 % CI] | Recall [95 % CI] |
|---|---|---|---|---|---|
| **All** | 144 | 17 | 97 | 89.4 % [83.7, 93.3] | 59.8 % [53.5, 65.7] |
| F | 125 | 12 | 76 | 91.2 % [85.3, 94.9] | 62.2 % [55.3, 68.6] |
| D | 3 | 0 | 4 | 100.0 % [43.9, 100.0] | 42.9 % [15.8, 75.0] |
| H | 3 | 1 | 5 | 75.0 % [30.1, 95.4] | 37.5 % [13.7, 69.4] |
| C | 13 | 4 | 12 | 76.5 % [52.7, 90.4] | 52.0 % [33.5, 70.0] |

False flags on 123 texts with no expected rule (B): 4 = 3.3 per 100.

### On the 233 held-out texts where agentA and agentB agree

| Scope | TP | FP | FN | Precision [95 % CI] | Recall [95 % CI] |
|---|---|---|---|---|---|
| **All** | 113 | 12 | 58 | 90.4 % [84.0, 94.4] | 66.1 % [58.7, 72.8] |
| F | 96 | 8 | 43 | 92.3 % [85.6, 96.1] | 69.1 % [61.0, 76.1] |
| D | 3 | 0 | 4 | 100.0 % [43.9, 100.0] | 42.9 % [15.8, 75.0] |
| H | 1 | 0 | 1 | 100.0 % [20.7, 100.0] | 50.0 % [9.5, 90.5] |
| C | 13 | 4 | 10 | 76.5 % [52.7, 90.4] | 56.5 % [36.8, 74.4] |

False flags on 122 texts with no expected rule: 4 = 3.3 per 100.

### Against the targets

| Target | Held-out (vs agentA) | Met? |
|---|---|---|
| Precision ≥ 80 % | 91.9 % [86.7, 95.2] | **yes** (lower bound also above 80 %) |
| Recall ≥ 80 % | 65.5 % [59.1, 71.4] | **no** (upper bound 71.4 %) |
| ≤ 5 false flags per 100 compliant | 3.3 | **yes** (point estimate; texts-flagged upper bound 8.1 %) |
| Per family | D, H, C recall 43-52 %; C precision 76.5 % | **no** for D, H, C recall and C precision (small n) |

Compared with the untuned draft on the same held-out split (P1 reviewer, `TEST-SETS.md` §1.5): precision 0.68 → 0.92,
recall 0.46 → 0.66, false flags 2.5 → 3.3 per 100.

**Label conflict with the allowlist.** 6 of the 17 held-out F10 misses are texts that contain an approved MoPH No. 447
statement, which the allowlist suppresses by design but agentA labelled F10 (the labelling guide counts any structure /
function wording as F10). If the pharmacist rules that approved statements are not risk signals, those 6 pairs leave the
reference and recall vs agentA becomes 148 / 220 = 67.3 %; still below target.

### Per rule, held-out vs agentA

| Rule | TP | FP | FN | | Rule | TP | FP | FN |
|---|---|---|---|---|---|---|---|---|
| F02 | 4 | 1 | 2 | | F19 | 2 | 0 | 6 |
| F03 | 2 | 0 | 0 | | F21 | 0 | 0 | 1 |
| F04 | 1 | 1 | 0 | | D01 | 1 | 0 | 1 |
| F05 | 1 | 0 | 1 | | D02 | 2 | 0 | 3 |
| F06 | 4 | 0 | 4 | | H01 | 1 | 0 | 0 |
| F07 | 12 | 0 | 4 | | H02 | 0 | 0 | 4 |
| F08 | 13 | 3 | 8 | | H05 | 3 | 0 | 1 |
| F09 | 27 | 2 | 12 | | C01 | 9 | 3 | 6 |
| F10 | 40 | 1 | 17 | | C03 | 3 | 0 | 2 |
| F11 | 3 | 0 | 0 | | C04 | 1 | 0 | 0 |
| F12 | 2 | 0 | 0 | | C08 | 0 | 1 | 4 |
| F13 | 15 | 1 | 2 | | F14 | 2 | 0 | 0 |

Weakest: H02 (exaggerated herbal efficacy, 0 / 4), F19 (research / statistics, 2 / 8), C08 (cosmetic body-function, 0 / 4),
D02 (drug exaggeration, 2 / 5), F10 (structure / function, 40 / 57).

## 4. Dev results (tuning set, for reference only: not a product claim)

| Reference | Precision | Recall | False flags / 100 compliant |
|---|---|---|---|
| agentA | 97.9 % [95.3, 99.1] (237 / 242) | 94.4 % [90.9, 96.6] (237 / 251) | 0.8 |
| agentB | 92.1 % [88.1, 94.9] | 88.1 % [83.6, 91.6] | 4.7 |
| A = B subset (242 texts) | 98.5 % [95.7, 99.5] | 95.2 % [91.4, 97.4] | 0.8 |

Before tuning (draft, same engine) on dev vs agentA: precision 92.6 %, recall 44.6 %. The gap between dev recall (94 %) and
held-out recall (66 %) shows the added patterns fit the dev wording and generalise only in part.

## 5. Changes from the draft (all in `tools/pc-rules-build.mjs` → `CHANGES`; draft file unchanged)

Structural (all rules): category lists split into arrays; Chinese title added for all 49 rules (`TITLE_ZH`);
`claim_window` (40 default); `exclude` list; masks; F15 split into label lines (N293: no-prevent / treat, children and
pregnant women, five food groups) and advert lines (F69 Annex 4: children and pregnant women, no-prevent / treat, read the
label warning); the design's "คำเตือน box" check is not text-detectable and is not included.

Rule changes (25), dev evidence only:

- **D01** add หายเกลี้ยง / หายแน่นอน / หายเด็ดขาด / ไม่หายคืนเงิน.
- **D02** add fast-result ("เห็นผลใน N"), "ทุกปัญหา", "ได้ผลจริง", organ tonic (บำรุงหัวใจ / ปอด / สมอง / ตับ / ไต), slimming words,
  and English virus-killing / immune-boosting / antiviral wording.
- **D08** treat-only verb set, window 60.
- **F01** `\bmiracl(?:e|ous)` → `\bmiracu?l(?:e|ous)` ("miraculous" was missed).
- **F04** add lists of absent effects (ไม่ใจสั่น, ไม่ดีด, ไม่มีเอฟเฟค …), "devoid of side effects", 不良反应.
- **F06** add "ใน N วัน", "ในสัปดาห์เดียว", "<result> ทันที", ทันใจ, อย่างรวดเร็ว, "within the first week"; exclude storage / use-by
  wording.
- **F07** add control / keep-steady wording (ควบคุมระดับน้ำตาล, น้ำตาลในเลือดคงที่, "keep blood sugar …", "fights insulin resistance").
- **F08** prevention of any disease (ป้องกันโรค… / อาการ…), named conditions (กระดูกพรุน, ข้อเสื่อม, แทรกซ้อน …), "ลดความเสี่ยง…โรค",
  "reduce the risk of", "fight against", "protects against …", broader "kills … bacteria", 预防 / 可防.
- **F09** treat-only verbs (prevention moved to F08) with window 80; more symptoms (back / joint pain, ทับเส้น, haemorrhoid
  slang, paralysis, allergy, sinus, infertility, เก๊าท์ spelling, headache, "symptoms of", disorders, inflammation, Chinese
  阳痿 / 早泄 / 血栓 / 肿瘤 …); exclude risk-reduction wording; **bug fix**: draft pattern `ต้อ` (cataract) also matched `ต้อง`
  ("must") → `ต้อ(?!ง)`.
- **F10** structure / function wording (support / promote / maintain … health or an organ, ฟื้นฟู…การทำงาน, ดูแลลำไส้,
  สุขภาพหัวใจ, …แข็งแรง, antioxidant, height, muscle gain, immune, Chinese 維持 / 有助於 + body system, 抗氧化).
- **F11** `แข็งตัว` only for sexual organs (draft flagged a blood-clotting warning); add อึด ทน, เพิ่มขนาด, น้องชาย, อสุจิ, นกเขา,
  阳痿 / 早泄; exclude เลือดแข็งตัว.
- **F12** add ผิวสวย / หน้าใส / ผิวใส / บำรุงผิว, "healthy … skin / hair / nails".
- **F13** `Block / Burn` only as fat / carb blockers or burners (draft flagged "building block"); add body-part slimming,
  ลดไขมัน (not ในเลือด), เผาผลาญ, weight management, "N kg gone", fat reduction, -zempic look-alikes.
- **F19** add ตามหลักวิทยาศาสตร์, "clinically backed / validated", "N % would recommend / saw".
- **F20** add "…อื่น" comparisons, "compared to other", "superior absorption".
- **F21** add เป็นมิตรต่อสิ่งแวดล้อม.
- **F22** add สำหรับ(เด็ก)ทารก; exclude "not suitable for infants" warnings.
- **H02** add fast-result, "N เท่า" stronger, "devoid of side effects".
- **H05** treat + prevent verbs, window 60; add เก๊าท์ spelling, รูมาตอยด์, corona, anti-hyperglycemic.
- **C01** add acne / melasma reduction, anti-bacteria, "relieve", minor cuts / burns, Chinese 炎症 / 愈合 / 缓解; exclude
  "Eczema Association" (an endorsement, now C04).
- **C02** `แข็งตัว` only for sexual organs.
- **C03** add speed claims (ขาวไว, ใน N วัน / คืน, ทันใจ, หายวับ) and extremes (ขั้นสุด, สุดขั้ว, ไม่มีใครเหมือน), 最佳.
- **C04** add "หมอแนะน…" (typo-tolerant), "approved / endorsed by", "research has shown".
- **C07** exclude spraying ("หลังฉีด", spray context) from the injection rule.
- **C08** add grey-hair reversal, nose shaping, cell regeneration, collagen increase.

Not changed: lookup / absence / image rules (D03, D06, D09, D11-D13, F16, F17, H03, H06, C05, C06) have no text patterns and
never fire from text; F18 patterns unchanged (context gating as drafted); legal bases, URLs and statuses unchanged.

## 6. Allowlist and mask sources (official only; nothing taken from the labelled set)

| Item | Source | URL |
|---|---|---|
| 135 Thai + 135 English approved nutrient-function statements (28 nutrients) | MoPH Notification No. 447 (B.E. 2566) "Health claims made on foods", Annex 1; in force 2 Jul 2567 (EN 3.6 and 5.6 trimmed post-review, §8) | Thai: <https://food.fda.moph.go.th/media.php?id=583907022966235136&name=P447.pdf> · English (official FDA translation): <https://food.fda.moph.go.th/media.php?id=607838556769099776&name=P447_EN.pdf> · index: <https://food.fda.moph.go.th/food-law/category/food-labeling-and-nutrition-labeling> |
| Definition of nutrient function claim; required statement "ผลิตภัณฑ์นี้ไม่ใช้สำหรับรักษา บำบัด บรรเทา หรือป้องกันโรค" | MoPH notice on probiotic micro-organisms in food (27 Jun 2554), cl.1, cl.3(3.1) (FDA compilation incl. No. 339 / 346) | <https://exfood.fda.moph.go.th/law/data/complilation/Compi_339_346.pdf> |
| Supplement label warnings (masks + F15 label lines) | MoPH Notification No. 293 (B.E. 2548), Annex item 1 | <https://exfood.fda.moph.go.th/law/data/complilation/Compi_293.pdf> |
| Advert warning "อ่านคำเตือนในฉลากก่อนบริโภค" (mask + F15 advert line) | FDA food-advert notice B.E. 2569, Annex 4 item 1 | <https://ratchakitcha.soc.go.th/documents/123102.pdf> |
| US supplement disclaimer (mask) | 21 CFR 101.93(c) | <https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-F/section-101.93> |

- The Thai No. 447 PDF has a broken font layer; Annex 1 was read with on-device OCR (macOS Vision) and checked against the
  page. OCR slips fixed by hand are listed in `N447_FIXES` in the build script (item numbers for 6.1, 14.1, 20.1, 23.1,
  24.6, 26.1; "แมกนี้เซียม" → "แมกนีเซียม"). PDF SHA-256s are in `N447_SOURCE`. Accessed 2026-11-09.
- Matching is spacing-tolerant (any spacing between Thai letters; flexible spaces and hyphens in English). Only the exact
  approved wording is allowed; paraphrases ("calcium helps build strong bones") are still flagged F10, as the guide asks.
- Licence: Thai government notifications and the US CFR are official texts; only the statements themselves are used as
  matching data, with the source recorded.

## 7. Open issues

1. **Recall target not met** (65.5 % vs 80 %). Most misses are paraphrased structure / function claims (F10), disease
   wording without a listed verb (F09), research claims (F19) and exaggeration that needs meaning, not words (H02, D02,
   C08). Options for the owner: (a) the opt-in LLM classifier of design §5.2 for recall, rules kept for precision; (b) a
   larger labelled set for the next tuning round, measured on a new unseen split. The held-out split used here is now
   spent for tuning purposes.
2. **Labels are AI-only.** All numbers depend on agentA / agentB labels (κ 0.915); the pharmacist's adjudication of the 59
   disagreements and of the allowlist conflict (approved No. 447 statements labelled F10) is pending.
3. **Small families.** D (7 positive pairs), H (9) and C (25) held-out counts are small; their intervals are wide.
4. **F15 unmeasured.** The text set has no whole labels; F15 needs the owner photo set (design §9.1).
5. **Scope on packs.** Whether food / cosmetic / supplement advert rules apply to labels and listings is a counsel question
   (design §15). Flags stay "risk signals".
6. **Unverified rule bases carried over from P1:** the s.77 disease list (D08), cosmetic ministerial regulation (C07),
   herbal advert criteria (H05), permit number formats.
7. Not done here (owned by others): page integration (P7), `docs/CTO-BRIEF.md` / `docs/FIELD-PILOT.md` round notes.

## 8. Independent review and post-review changes

The independent P3 reviewer reproduced every number above exactly and accepted with three fixes. **The held-out split is
spent: it was NOT re-run.** The fixes were measured on dev only and are listed in `POST_REVIEW` in the build script (and in
the `changes` array of the generated file).

| Fix | Change | Dev effect |
|---|---|---|
| F1 | Allowlist EN 3.6 and EN 5.6 had text from the next PDF cell appended ("… precursor of Vitamin A”", "… acid) 11 วิตามินบี 12"); trimmed to the official statement. Unit test: every English allowlist entry is plain ASCII with no stray quote or bracket | none (0 TP / FP / FN change) |
| F2 | English storage / use-by wording ("Refrigerate after opening and consume within 3 days", "use within 2 weeks", "best eaten within 24 hours") flagged F06; added English excludes to the shared fast-result exclude list (F06, C03). Synthetic unit test, incl. a real speed claim that still fires | none |
| F3 | Draft zh wording "可能违反 {rule} 的风险信号" ("may violate") → "{rule} 风险信号"; status line, the CM source citation, the C03 and C08 notes and the file header rephrased so the generated data has no "illegal / unlawful / 违反 / 违法 / ผิดกฎหมาย" anywhere. Unit test scans the whole generated file | none |

- Dev after the fixes, vs agentA: precision 97.9 %, recall 94.4 %, 0.8 false flags per 100 compliant texts; the list of
  dev misses and false flags is identical to the pre-review run.
- Hashes after the fixes: `lensiq-claims-rules.js` `9bd6684a10583b9b59e295b2d460b7be31f1a45ce188267d196535f2bf2fb0db`,
  `lensiq-claims.js` unchanged (`f41bed9c…cfaa5`). The held-out numbers in §3 belong to the earlier rules file
  (`209088e5…`); the detection differences since then are only the F1 allowlist trims and the F2 excludes, whose held-out
  effect is not measured.
- **Reviewer probes** (synthetic, reviewer-written, optimistic; not a product claim): 1 of 30 compliant texts flagged; 29
  of 30 over-claims flagged (the miss: "ช่วยให้เด็กฉลาด ไอคิวสูง").
- **Reviewer note on tuning:** 3 tuning-added patterns match held-out texts but no dev text (`\binflammation`,
  `ลดไขมัน(?!ใน)`, `\bminor\s+(?:cuts|burns|scrapes)`). They are generic terms with dev sources (added for dev misses
  written in close wording); removing them changes held-out recall by 1 TP. The next re-measurement needs a new unseen split.

## 9. Re-run

```
node tools/pc-rules-build.mjs --check
node tools/pc-claims-eval.mjs --split dev            # tuning set: tables + misses
node tools/pc-claims-eval.mjs --split heldout        # tables only; logged with hashes next to the data
node --test tests/unit/pc-claims.test.js tests/unit/pc-claims-eval.test.js
```

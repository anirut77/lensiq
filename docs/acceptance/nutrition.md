# Acceptance sheet: Nutrition label reader (`nutrition.html`)

> **สรุป:** อ่านฉลากโภชนาการบนเครื่อง แสดงค่าตามฉลากพร้อมบรรทัดที่มา ให้ผู้ใช้แก้ได้ เกณฑ์เดิม (ล็อกแล้ว) ผ่านบนชุดจำลอง
> แต่ยัง **ไม่มีภาพฉลากจริง** ต้องการภาพฉลากจริง ≥ 200 ภาพ (เจ้าของถ่ายได้) จึงจะถึง 90

**Purpose.** Reads a printed nutrition label on the device and shows each value with the line it came from. The user
can correct any value. No medical advice. Food-photo mode is not part of this sheet.

**Must-do functions.** Each one is an F item.
1. Camera or photo of a label.
2. On-device OCR.
3. Values with their source line.
4. User correction of any value.
5. Allergen statement.
6. Tilt and glare guidance.
7. No medical advice. The optional AI step is opt-in only, with a preview.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–7, per item | each exercised by a test on main | `nutrition.e2e.mjs`, `nutrition-tilt.e2e.mjs` | 20 |
| A1 | Silent wrong value (synthetic, locked) | Wilson upper bound ≤ 3 %, pooled and per format (needs ≥ 120 read fields with ≤ 1 error per format) (existing I2: `docs/nutrition/NUTRITION-ACCURACY.md`, `docs/NUTRITION-DESIGN.md:458`, lock `nutrition__v5`) | locked v5 set | 6 |
| A2 | Allergen statement (synthetic, locked) | ≥ 95 % found (verbatim match ≥ 90 % of characters), 0 false (existing I3, `docs/NUTRITION-DESIGN.md:460`, lock `nutrition__v5`) | locked v5 set | 4 |
| A3 | Key values (synthetic, locked) | energy, sugar, sodium and fat correct ≥ 90 % each on the Thai new format; recalculation (half pack, n servings, grams with and without serving weight) 100 % of unit tests pass (existing I1, `docs/NUTRITION-DESIGN.md:457`, `:461`, lock `nutrition__v5`) | locked v5 set | 4 |
| A4 | Real label photos | I1–I3 met on ≥ 200 real photos with the per-stratum minimums: Thai new format 60, Thai old format 40, Thai GDA front of pack 30, foreign formats 10 each (USA, EU / UK, China, Japan, Korea, Malaysia / Singapore) = 60, panels with an allergen statement ≥ 60 (existing: `docs/NUTRITION-DESIGN.md` §5.1, lines 441-448) | new locked set `~/LENSIQ-field/evals/nutrition-real/` | 16 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1, plus S2 with "values shown ≤ 6 s after the photo" (**proposed**; today 3.8 s p90 measured on an M1, not a phone), per item | both pass | README S | 7 |
| E | Camera refused, no frames, crash guard, no label found, unreadable value, per item | all pass | README E | 8 |
| X | Copy or export of the values with their source, per item | pass | e2e | 7 |
| G | Gate: on-device by default; AI only on opt-in, after a preview; no medical or diet advice | all pass | e2e and unit tests | 10 |

**Needs from the owner or outside**
- ≥ 200 real label photos (the owner can take them in a shop; no people in frame) (A4).
- A dietitian adviser before any diet wording is added.
- INMU / Department of Health data permission, only if their tables are used.

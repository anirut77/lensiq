# Acceptance sheets: how "90" is defined and scored

Owner standing order 2026-11-18 ("Define 90 first"). One sheet per product in this folder. The sheets are locked
(`evals-locks/acceptance.sha256`, field copy `~/LENSIQ-field/evals/acceptance/`) BEFORE any scoring. Scores live in
`SCORES.md`, which is not locked (it changes every round).

## สรุปภาษาไทย

- ทุกผลิตภัณฑ์มีใบเกณฑ์ 1 ใบ: ต้องทำอะไรได้, เกณฑ์วัดได้พร้อมน้ำหนักรวม 100 คะแนน, วัดอย่างไร, ต้องการอะไรจากเจ้าของหรือภายนอก
- เกณฑ์ที่มีอยู่แล้วใช้ตามเดิม (อ้างไฟล์และ lock) เกณฑ์ใหม่ติดป้าย "proposed" (เสนอ) ไม่มีการลดเกณฑ์เพื่อให้คะแนนสูงขึ้น
- คะแนนแต่ละข้อติดป้าย M (วัดแล้ว มีไฟล์และวันที่) หรือ E (ประมาณ มีเหตุผล)
- "เกิน 90" ได้เมื่อ: คะแนนจากข้อที่วัดแล้วอย่างเดียว ≥ 90, ประตูความปลอดภัยผ่านทุกข้อ, โค้ดอยู่บน main และ CI เขียว,
  และผู้ตรวจอิสระวัดซ้ำแล้วยืนยันตามใบนี้

## Scoring rules (apply to every sheet)

1. **Points.** Each criterion has a weight; the weights of a sheet add up to 100. A criterion with sub-items (marked
   "per item") earns weight × items passing / items. Every other criterion earns its full weight only when its target is
   met, otherwise 0. No other partial credit.
2. **Evidence tag.** Every scored criterion is tagged **M** (measured: a test, CI run or locked-set result, with file and
   date) or **E** (estimated: no measurement yet, the reason is written). *Measured share* = the weight of M-tagged
   criteria / 100.
3. **Gates.** Criteria in the group **G** (safety and privacy), **V** (crisis v3, fortune pages) and every criterion
   whose text starts with "Gate:" are gates. If any gate fails on a measurement, the product score is capped at 50,
   whatever the sum. A gate that has not been measured yet scores 0 and is tagged E.
4. **Above 90.** A product is "above 90" only when all four hold: (a) the sum of **M** points alone is ≥ 90; (b) every
   gate passes on a measurement; (c) the code is on `main` with a green full CI run; (d) an independent reviewer who did
   not build it re-measures and confirms the result against this locked sheet, in a written report.
5. **What is scored.** `origin/main`. Work that exists only on a branch is shown next to the score ("on branch") and is
   not counted until merged.
6. **Targets.** "existing" = copied from the cited file and lock; "proposed" = new, based on industry or reasonable
   practice, waiting for the owner. A target is never lowered to raise a score. A change needs an owner decision and a
   new lock line (the old sheet stays in the ledger).
7. **Accuracy claims** state their source class: synthetic, public dataset or field (CLAUDE.md).
8. **Outside inputs.** Each sheet names what engineering cannot supply. `SCORES.md` gives the highest score reachable
   without those inputs.

## Shared criterion definitions

Sheets refer to these by letter, and they are measured the same way on every sheet.

- **F (function).** Scored per item: each must-do on the sheet is one item, and it passes when an e2e or unit test on
  main exercises it and CI is green.
- **P (phone and computer).** Scored per item:
  - P1: line-wrap at 360 / 375 / 393 / 414 / 430 px in TH/EN/ZH (`tests/e2e/line-wrap-*.e2e.mjs`, lock `line-wrap`);
  - P2: overlap at 360×640, 375×667, 414×736 and 1280×800 (`tests/e2e/overlap-*.e2e.mjs`, locks `overlap-d`, `overlap-d2`);
  - P3: the product's main flow in WebKit at 390 px (`iphone-pages-webkit`, `phone-webkit-a/b` or a product WebKit file);
  - P4: the product's main flow (not only the landing) in Chrome at 360 px and at 430 px;
  - P5: one owner run on a real phone, recorded in `docs/PHONE-QUALITY.md` §5.
- **L (languages).** Scored per item:
  - L1: `tests/unit/i18n-integrity.test.js` reports 0 missing keys;
  - L2: an e2e flow of the product in EN and one in ZH;
  - L3: generated output (results, CSV headers, print, error text) is in the chosen language, checked by a test.
- **S (speed).** Scored per item:
  - S1 (existing): bytes and requests stay within the locked budget (`tests/e2e/speed-budget.e2e.mjs`, lock `speed`,
    `docs/SPEED.md` "Budgets (locked)"). A page with no budget fails S1.
  - S2 (proposed): on the `docs/SPEED.md` profile (4× CPU, Fast 3G, 390×844), first contentful paint ≤ 3 s and the
    first usable control ≤ 8 s; camera pages: camera ready ≤ 15 s; plus the product-specific result time on its sheet.
    Industry reference: Google "good" FCP is ≤ 1.8 s on a real 4G phone, so 3 s on Fast 3G emulation is lenient, not strict.
- **E (error and empty states).** Scored per item. Each state has its own plain message in the page language, and
  nothing stays busy:
  - camera refused;
  - camera with no frames;
  - crash guard loaded (`lensiq-crashguard.js`);
  - bad input;
  - an empty list or no data yet.

  Each is checked by a test.
- **X (print, share, export).** Scored per item, only where the product needs it. Each listed output works and is
  checked by a test.
- **G (gate: safety and privacy).** Product-specific. Always included: nothing leaves the device without opt-in, no
  images of people stored by default, and a human decides where money, access or a person is affected.
- **V (gate: crisis v3, fortune pages).** The crisis v3 tests for the page are on main and green
  (`tests/e2e/crisis-v3-{a,b,c,d}.e2e.mjs`, `tests/unit/crisis-v3.test.js`, locks `crisis-v3`, `crisis-v3-protect`,
  `crisis-escape-guard`), and the latest independent crisis review passes.

## Sheets

| # | Product | Sheet |
|---|---|---|
| 1 | Attendance PIN/QR | `attendance.md` |
| 2 | Exam lab | `exam-lab.md` |
| 3 | Face reading | `faceread.md` |
| 4 | Compatibility | `compat.md` |
| 5 | Other fortune pages (one row per page) | `fortune-pages.md` |
| 6 | Auspicious-date planner | `planner.md` |
| 7 | Studio + photobooth | `studio-photobooth.md` |
| 8 | Nutrition label | `nutrition.md` |
| 9 | Pet reading | `petread.md` |
| 10 | Product Check | `product-check.md` |
| 11 | Crowd | `crowd.md` |
| 12 | Look suggestions + salon mode | `look-salon.md` |
| 13 | Gate | `gate.md` |
| 14 | Exam hall | `exam-hall.md` |
| 15 | Clothing try-on | `tryon.md` |
| 16 | Personal Colour | `personal-colour.md` |
| 17 | OMR answer-sheet reader (added by the owner 2026-11-18) | `omr.md` |

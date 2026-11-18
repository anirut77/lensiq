# Acceptance sheet: other fortune pages (one sheet, one row per page)

> **สรุป:** หน้าดูดวงอื่น ๆ ทั้งหมดในหมวด 6 ใช้เกณฑ์ชุดเดียวกับหน้าโหงวเฮ้ง (`faceread.md`) ยกเว้นข้อ C2 การถ่ายซ้ำ
> และหน้าที่ไม่มีคำทำนาย (fortune, luckycolor) ที่ไม่มีข้อ Q คะแนนของกลุ่มคือ **คะแนนของหน้าที่ต่ำที่สุด** กลุ่มจะผ่าน 90
> ได้เมื่อทุกหน้าผ่าน 90

**Purpose.** Belief-based readings from birth data, questions, card draws or numbers. No accuracy claim, because they
are a matter of belief. Consistency, safety, depth and language quality are measured instead.

**Group score.** The lowest page score. Each page is scored on the criteria below.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | The page's must-do (column "must-do" below), per item | each exercised by a test on main | page e2e, `iphone-pages-webkit` | 15 |
| C | Consistency | the same input (and the same date seed for draws) gives an identical reading, 100 %; evidence and meaning agree (existing: `tests/unit/fortune-consistency.test.js`, `fortune-engines.test.js`) | unit tests | 10 |
| V | Gate: crisis v3 | README V. Pages with a free-text field are in crisis-v3 a/b/c; every page is in crisis-v3-d | README V | 15 |
| H | Gate: hard limits | 0 breaches on the locked probes (existing: `fortune-honest`, 60/60) | `docs/FORTUNE-HONEST-READINGS.md` tests | 10 |
| Q1 | Depth | depth audit floors met (existing: `fortune-depth` lock, `AUDIT-TH.md`); the ceilings C5–C7 count once merged | depth audit | 5 |
| Q2 | No cut text | 0 % cut summary bullets, 30 profiles × 3 languages (**proposed**) | fortune-quality check | 5 |
| Q3 | Content review | `docs/FORTUNE-REVIEW.md` rubric: mean ≥ 4.0, 0 safety fails, ≥ 80 % agreement | review sheet | 5 |
| P | P1–P5, per item; wheel pages also pass `fortune-wheel-labels.e2e.mjs` (≤ 1 px overlap, ≥ 12 px labels, lock `fortune-wheels`) | all pass | README P | 10 |
| L | L1–L3, per item; the page is in `fortune-zh.e2e.mjs` and `fortune-en.test.js` | all pass | README L | 8 |
| S | S1 (with ≥ 2 % headroom left, so that the next fix fits: **proposed**), S2, per item | both pass | README S | 5 |
| E | Bad or missing input (date, name, question), crash guard, empty draw history, per item | all pass | page e2e | 6 |
| X | Print (A4 / A5 / 80 mm) and share, per item | all pass on main; the owner approves the samples | `fortune-print-*`, `fortune-share-print-*` | 6 |

On pages with no reading (fortune hub, luckycolor), the Q weight (15) moves to F (+10) and E (+5).

| Page | Must-do (F items) | Free-text field (crisis a/b/c) | Wheel test |
|---|---|---|---|
| fortune (hub) | lists every tool; cards open the right page; daily card | no (in d) | — |
| palm | camera or upload, hand lines, reading, photo not stored | `#plNick` | — |
| horoscope | birth data, chart wheel, reading | `#hsName` | yes |
| tarot (+ Siam Si) | question, draw, reading; Siam Si; daily card not drawn while in crisis | `#trQuestion` | — |
| iching | question, cast, hexagram reading | `#icQuestion` | — |
| bazi | birth data, four pillars, reading | no (d) | — |
| taksa | birth day, taksa table, reading | no (d) | — |
| lek7 | birth data, lek 7 table, reading | no (d) | — |
| numbers | name or number, numerology ring, reading | `#nmName` | yes |
| fengshui | birth year, direction compass, advice | no (d) | yes |
| dream | dream text, meaning; no lottery numbers | `#drText` | — |
| zodiac | birth year, animal, yearly reading | no (d) | — |
| astro | birth data, chart wheel, reading | no (d) | yes |
| lifegraph | birth data, life graph, reading | no (d) | — |
| luckycolor | day, colours, labelled "according to belief" | no (d) | — |
| report | combined report from several pages; the sample tag is hidden in crisis | `#rpName` | — |

**Needs from the owner or outside**
- A practitioner or native-speaker review for each page (Q3).
- Owner approvals:
  - the print PDFs;
  - the depth branch;
  - the cut-text rule (`RECHECK-86c`);
  - the budget headroom for luckycolor and the hub;
  - straight mode.
- L63 crisis wording review.
- A manual 1669/1300 help-line check, because the automatic re-check fails to fetch those sites.

# Acceptance sheet: Pet reading (`petread.html`, branch `fortune-pet`)

> **สรุป:** ดูดวงสัตว์เลี้ยงตามความเชื่อ จากภาพสัตว์หรือการ์ดวาด พร้อมเลือกลักษณะนิสัย ใช้เกณฑ์ชุดเดียวกับหน้าดูดวงอื่น
> (`fortune-pages.md`) วันนี้ยังอยู่บนกิ่ง ยังไม่ขึ้น main คะแนนบน main จึงเป็น 0 จนกว่าจะรวม ต้องการแหล่งความรู้ที่แข็งแรงกว่าเดิม
> (ผู้ตรวจระบุว่าแหล่งอ่อน)

**Purpose.** A belief-based reading for a pet, from a pet photo or a drawn card and a trait picker. Fortune category 6
(owner decision 100).

**Must-do functions.** Each one is an F item.
1. A pet photo (no people; the photo is not stored) or a drawn card.
2. Trait picker.
3. The reading, with no lucky numbers and no price.
4. Linked from the fortune hub.
5. Crisis: a gentle reading, no echo of the typed text, no paid part.

Criteria and weights are those of `fortune-pages.md` (F 15, C 10, V 15, H 10, Q1–Q3 15, P 10, L 8, S 5, E 6, X 6),
with these additions:
- **Q1** also requires that each trait meaning has two back-office sources from a source with a clear licence.
- **P** requires that `petread` is in `line-wrap`, `overlap` and `iphone-pages-webkit` on main.
- **S1** requires that a budget exists for the page.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–5, per item | on main, tested | petread e2e, W4 `petread-webkit` | 15 |
| C | Consistency | the same photo or card and the same traits give an identical reading, 100 % | unit test | 10 |
| V | Gate: crisis v3 | README V; petread is in crisis-v3 a/b/c (the kit includes it "when present") | README V | 15 |
| H | Gate: hard limits | 0 breaches on the locked probes, run on petread | probes | 10 |
| Q1–Q3 | Depth, no cut text, content and source review | as `fortune-pages.md`, with source licences | depth audit, review | 15 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item (P4 lock TH/EN/ZH) | all pass | README L | 8 |
| S | S1, S2, per item | both pass | README S | 5 |
| E | No animal found in the photo, photo refused, crash guard, per item | all pass | e2e | 6 |
| X | Print and share, per item | all pass | e2e | 6 |

**Needs from the owner or outside**
- Stronger, licence-clear sources for pet traits (`~/Desktop/LENSIQ-review/expert-pack/04-ดูดวงสัตว์เลี้ยง-แหล่งอ่อน.docx`).
- Owner go-live approval.
- A practitioner review.
- L63 crisis wording review.

# Acceptance sheet: OMR multiple-choice answer-sheet reader (`omr.html`, `lensiq-omr.js`)

> **สรุป:** อ่านกระดาษคำตอบแบบฝนวงจากกล้องมือถือหรือภาพ ให้คะแนนและวิเคราะห์ข้อสอบ ทุกวงที่ไม่แน่ใจต้อง **แจ้งครูเสมอ ห้ามเดา**
> ครูแก้ได้ทุกวงก่อนคะแนนเป็นที่สุด ข้อมูลนักเรียนอยู่ในเครื่องจนกว่าครูจะส่งออก เกณฑ์ความแม่นยำต่อวงแยกตามสภาพ (สะอาด, ฝนจาง,
> ฝนเลยวง, ฝนสองวง, ลบ, กระดาษเอียง/ยับ, เงา, ถ่ายเฉียง) เป็นเกณฑ์ **เสนอ** ทีม OMR กำลังวัดบนชุดใหม่ที่ล็อก
> ต้องการภาพกระดาษคำตอบจริงจากโรงเรียน (พร้อมอนุญาตใช้ข้อมูล) จึงจะถึง 90

**Purpose.** A teacher prints the sheet, then scans the answer sheets with a phone camera or photo on the device. The
page reads the marks and the student ID, grades the sheets and gives item analysis (p, d, point-biserial, KR-20). It
uses plain canvas maths: no AI, no faces, no network.

**Per-mark outcome definitions.** These are used by A1–A9.
- *Correct*: the read state equals the truth (filled, empty, or both bubbles of a double mark).
- *Flagged*: shown as `unsure`, `multi` or `?` for the teacher to decide.
- *Silent wrong*: a wrong state with no flag.

Erasures count as truth = empty when the erasure is clean, and truth = the remaining mark otherwise. A double mark is
correct only when flagged `multi`.

**Must-do functions.** Each one is an F item.
1. Printable sheet (A4) with markers and an ID block.
2. Scan by camera or photo: marker search, perspective correction, rotation (including upside down).
3. Mark and student-ID reading with `blank`, `multi`, `unsure` and `?` flags.
4. A review screen where the teacher can correct ANY bubble or ID digit before scores are final. Scores stay "not
   final" while any flag is unresolved.
5. Grading against the answer key, and item analysis.
6. CSV export with the formula-injection guard, and print.
7. Demo mode (`?demo=1`, sample data only).
8. Student data stays on the device unless the teacher exports it.

| ID | Criterion | Target (all **proposed**; industry OMR scanners claim ≥ 99.9 % on clean scans, so phone photos are given a lower bar but the same zero-guess rule) | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main | `tests/e2e/omr.e2e.mjs`, `tests/unit/omr.test.js` | 20 |
| A1 | Clean marks | correct ≥ 99.5 %; flagged ≤ 1 % | locked set `~/LENSIQ-field/evals/omr/clean/` (OMR team) | 6 |
| A2 | Light marks | correct-or-flagged 100 %; correct ≥ 97 % | `.../omr/light/` | 4 |
| A3 | Mark outside the bubble | correct-or-flagged 100 %; correct ≥ 95 % | `.../omr/outside/` | 3 |
| A4 | Double marks | flagged `multi` 100 % | `.../omr/double/` | 4 |
| A5 | Erasures | correct-or-flagged 100 %; correct ≥ 90 % | `.../omr/erasure/` | 3 |
| A6 | Skewed or creased paper | correct ≥ 99 %; correct-or-flagged 100 %; a sheet that cannot be aligned is refused, never graded | `.../omr/skew/` (plus a creased set) | 3 |
| A7 | Shadows | correct ≥ 98 %; correct-or-flagged 100 % | shadow set (OMR team) | 3 |
| A8 | Angled phone photos (up to 30°) | correct ≥ 98 %; correct-or-flagged 100 %; refused beyond the limit | angled set (OMR team) | 3 |
| A9 | Gate: no guessing | silent wrong marks = 0 across all locked categories, and the Wilson 95 % upper bound ≤ 0.1 % on ≥ 3,000 marks | all sets above | 6 |
| A10 | Real sheets | A1–A9 on ≥ 300 real filled sheets from a school, with permission | field set | 5 |
| P | P1–P5, per item | all pass | README P | 8 |
| L | L1–L3, per item (the printed sheet and CSV headers in the chosen language) | all pass | README L | 7 |
| S | S1; S2 with "a sheet read ≤ 3 s after the shot" (**proposed**); per item | both pass | README S | 5 |
| E | Camera refused, no frames, crash guard, markers not found, wrong sheet format, empty class list, per item | all pass | README E | 6 |
| X | CSV, print of results and item analysis, per item | all pass | omr e2e | 4 |
| G | Gate: the teacher confirms or corrects every flag before scores are final; no student data leaves the device without the teacher's export; no network request during a scan | all pass | e2e with a network hook | 10 |

The OMR team's locked set and harness must call `tools/eval-guard.mjs`. When their lock (`evals-locks/omr.sha256` or
similar) lands, its categories map onto A1–A8 as named above. A category they do not cover stays unmeasured.

**Needs from the owner or outside**
- Real filled answer sheets from a school, with written permission (A10).
- Optional: one teacher to time the review screen in use.

# Acceptance sheet: Auspicious-date planner (`planner.html`)

> **สรุป:** หาฤกษ์ดีตามความเชื่อสำหรับงานต่าง ๆ แสดงเฉพาะวันดี ไม่ขู่ ส่งออกปฏิทินได้ ต้องคำนวณวันตามกฎที่ล็อกถูกต้อง 100%
> ครบ 3 ภาษา และการ์ดช่วยเหลือ crisis v3 ทำงาน ต้องการผู้รู้ตรวจกฎฤกษ์ และเจ้าของอนุมัติภาพหน้าจอ "งานมงคล 21 แบบ"

**Purpose.** Suggests good days for an occasion from belief rules (no kalakini or clash day), shows announced Buddhist
holidays, and exports them to a calendar.

**Must-do functions.** Each one is an F item.
1. Choose an occasion and a month range.
2. Good days only, each with its reason. Never a warning.
3. Buddhist holidays matched to the announced dates.
4. iCalendar export.
5. Occasions list with two sources each (21 occasions in 5 groups, on branch `planner-occasions`).
6. Every reason respects the hard limits, in TH/EN/ZH.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–6, per item | each exercised by a test on main | `tests/e2e/planner.e2e.mjs`, `tests/unit/planner.test.js` | 15 |
| C1 | Rule correctness | 100 % of days on a locked calendar set (≥ 24 months × all occasions) match the hand-checked rule table (**proposed**, as a locked set; the rules are already in `planner.test.js`) | locked set `~/LENSIQ-field/evals/planner-rules/` | 7 |
| C2 | Holidays | 100 % match with the announced Buddhist holiday dates for the years shown | unit test | 3 |
| V | Gate: crisis v3 | README V (`crisis-v3-d`, a page with no reading) | README V | 15 |
| H | Gate: hard limits | 0 breaches; no day is called bad or dangerous | `planner.test.js` | 10 |
| Q1 | Sources | each occasion rule has two cited back-office sources (existing practice: `docs/FORTUNE-SOURCES.md`) | doc lint | 5 |
| Q2 | Content review | practitioner review of the rule table: 0 errors found | review sheet | 10 |
| P | P1–P5, per item; 13 months × 360 / 412 px with 0 cut labels (existing planner-defects review method) | all pass | README P | 10 |
| L | L1–L3, per item; the exported calendar text is in the chosen language | all pass | README L | 8 |
| S | S1, S2, per item | both pass | README S | 5 |
| E | No good day in range, range too long, bad date, per item | all pass | e2e | 6 |
| X | iCalendar export, print, share, per item | all pass | e2e | 6 |

**Needs from the owner or outside**
- A practitioner review of the rule table (Q2).
- Owner approval of the occasions screenshots (`~/Desktop/LENSIQ-review/planner/occasions/README-TH.md`).
- L63 crisis wording review.

# Acceptance sheet: Attendance PIN/QR (`attendance.html?mode=employee`)

> **สรุป:** ระบบลงเวลาพนักงานด้วย PIN/QR เป็นหลัก ใบหน้าเป็นทางเลือก ต้องคำนวณเวลา กะ OT และส่งออกเงินเดือนถูกต้อง 100%
> บนชุดทดสอบที่ล็อก ทำงานบนมือถือ 360–430 px และคอมพิวเตอร์ ครบ 3 ภาษา สิ่งที่ต้องการจากภายนอก: ไซต์นำร่อง 5–20 คน
> (เทียบ CSV เงินเดือน 1 เดือน) และคำตอบเรื่องสิทธิ์โมเดลใบหน้า (L23) ถ้าจะขายโหมดใบหน้า

**Purpose.** A small business clocks staff in and out with PIN or QR on a shared device. It works out hours, shifts and
OT, and exports payroll CSV. Face check-in is optional and needs consent.

**Must-do functions.** Each one is an F item.
1. PIN clock-in and clock-out: salted, iterated hash; locks after 5 misses.
2. Printable QR badge, and badge scan on the device's camera, including iPhone Safari.
3. Shifts, night shifts across midnight, grace minutes, OT rules and OT approval.
4. Holidays and leave entry.
5. Hash-chained corrections, with the reason recorded.
6. Payroll CSV, and PDPA export of one person's data.
7. Kiosk mode and demo mode (`?demo=1`, sample data only).
8. Optional face mode: consent first, no photos stored, encrypted descriptor, off by default.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each item exercised by a test on main, CI green | `tests/e2e/attendance.e2e.mjs`, `tests/e2e/attendance-hr.e2e.mjs`, `tests/unit/attendance-timeclock.test.js` | 25 |
| A1 | Time maths on a locked set | 100 % of hours, OT, night-shift and holiday totals equal the hand-worked answer, on ≥ 60 synthetic staff-months covering every rule (**proposed**) | new locked set `~/LENSIQ-field/evals/attendance-time/`, harness calls `tools/eval-guard.mjs` | 15 |
| A2 | Field payroll match | one month's payroll CSV matches the shop's own records with 0 unexplained differences (existing: `docs/PILOT-PLAN.md` §3.2) | pilot result sheet | 5 |
| A3 | Face mode pilot (only if face mode is offered; volunteers who consented) | false accept ≤ 1 %; false reject ≤ 10 % (existing: `docs/PILOT-PLAN.md` §3.2, lines 67–68; `docs/LAUNCH-READINESS.md:115`) | pilot result sheet | 0 until face mode is offered |
| P | P1–P5 (README), per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass; L3 includes CSV headers and the badge print | README L | 10 |
| S | S1, plus S2 with "PIN pad usable ≤ 5 s; PIN mode loads no face model" (**proposed**), per item | both pass | `speed-budget.e2e.mjs`; timing run per `docs/SPEED.md` | 8 |
| E | Camera refused, no frames, crash guard, wrong PIN / lockout, storage near full (3.5 MB warning), per item | all pass | `iphone-pages-webkit`, `camera-noframes`, attendance e2e | 10 |
| X | Payroll CSV, PDPA export, QR badge print, per item | all pass | attendance-hr e2e | 7 |
| G | Gate: PIN never stored in clear; face off by default and only after consent; no photos stored; nothing leaves the device without opt-in; a corrected record keeps its history | all pass | unit and e2e tests above | 10 |

**Needs from the owner or outside**
- A pilot site with 5–20 staff for 2 weeks, plus their payroll records (A2). Existing face pilot targets for later, not
  scored here: false accept ≤ 1 %, false reject ≤ 10 % (`docs/PILOT-PLAN.md` §3.2).
- L23 face-model licence. This does not block PIN/QR, but it blocks selling face mode.
- One owner real-phone run (P5).

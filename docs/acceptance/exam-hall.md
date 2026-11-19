# Acceptance sheet: Exam hall (`exam-hall.html`, seat watch, experimental)

> **สรุป:** กล้องเฝ้าที่นั่งในห้องสอบใหญ่ (ไม่ขายจนกว่าจะผ่าน) เกณฑ์ (เสนอในแผนนำร่อง): ที่นั่งว่าง/หันหลัง/ทางเดิน ≥ 80%
> (Wilson lower bound) แจ้งเกิน ≤ 3 ครั้งต่อรอบ 3 ชั่วโมง วันนี้หาคนที่ขนาดเล็กในห้องได้ 34–58% และหาใบหน้า 24–48 px ได้ 0/195
> ต้องการ **การสอบจำลองกับอาสาสมัคร 6–10 คน** และงานวิจัยเรื่องคน/ใบหน้าขนาดเล็กในห้องโถงที่ยังไปไม่ถึง

**Purpose.** A camera watches the seats in an exam hall and raises signals for an invigilator, who decides each one.
There is no face identification.

**Must-do functions.** Each one is an F item.
1. Placement check of the camera view.
2. Seat map.
3. Signals: empty, back turned, aisle, extra person, lean, early leave, phone.
4. A standing signal.
5. The invigilator decides each signal.
6. Session log export.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–6, per item | each exercised by a test on main | `exam-hall*.e2e.mjs`, `hall-seatwatch-*.test.js` (lock `gate-hall-h`) | 20 |
| A1 | Empty, back, aisle | recall Wilson lower bound ≥ 80 % per signal (empty ≥ 55 / 60, back ≥ 63 / 70, aisle ≥ 65 / 72 events; `docs/pilot/PILOT-HALL-SEATWATCH.md:176`) (existing proposal: `docs/pilot/PILOT-HALL-SEATWATCH.md`) | mock exam, locked replay | 12 |
| A2 | Extra person, lean | recall Wilson lower bound ≥ 70 % each (≥ 49 / 60 events each) (existing proposal: `docs/pilot/PILOT-HALL-SEATWATCH.md:177`) | mock exam | 8 |
| A3 | False alerts | ≤ 3 per 30-seat, 3-hour session; of these, Watch / Check ≤ 1 (existing proposal: `docs/pilot/PILOT-HALL-SEATWATCH.md:179`, T4) | mock exam | 8 |
| A4 | Timing | alert: median ≤ H + 5 s and 90th percentile ≤ H + 10 s; time-away error median ≤ 10 s; ≥ 2 rounds per second (existing proposal: `docs/pilot/PILOT-HALL-SEATWATCH.md:181-183`, T5–T7) | replay harness | 7 |
| P | P1–P5, per item | all pass | README P | 8 |
| L | L1–L3, per item | all pass | README L | 7 |
| S | S1; S2 with camera ready ≤ 15 s; per item | both pass | README S | 5 |
| E | Camera refused, no frames, crash guard, bad placement, per item | all pass | README E | 7 |
| X | Session log CSV and print, per item | all pass | e2e | 8 |
| G | Gate: an invigilator decides every signal; no face identification, emotion or deception inference; notice to candidates | all pass | e2e and unit tests | 10 |

**Needs from the owner or outside**
- A mock exam with 6–10 consenting volunteers (A1–A3; pack in `docs/pilot/*HALL-SEATWATCH*`).
- Research: seated people and small faces at hall distance. This is not solved by any clean-licence detector measured
  so far (`docs/exam/HALL-DETECTOR-RESULTS.md`).

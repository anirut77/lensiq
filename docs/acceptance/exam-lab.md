# Acceptance sheet: Exam lab (`exam-lab.html`, `exam.html`, `exam-dashboard.html`)

> **สรุป:** ระบบช่วยคุมสอบในห้องคอมพิวเตอร์ คนตัดสินทุกสัญญาณ ไม่อ่านอารมณ์ เกณฑ์ความแม่นยำใช้ตามแผนนำร่อง
> (`docs/pilot/PILOT-EXAM.md`) ข้อที่ต้องวัดในห้องสอบจริง (ความแม่นยำของการแจ้ง, แจ้งเกินต่อชั่วโมง, ช่องว่างระหว่างกลุ่ม)
> ต้องมี **การนำร่องที่สถาบันจริง** จึงถึง 90 ไม่ได้ด้วยงานวิศวกรรมอย่างเดียว

**Purpose.** A proctoring aid for computer-room and online exams (Mode B). It raises signals and a person decides each
one.

**Must-do functions.** Each one is an F item.
1. Notice and consent; a candidate who does not consent sits the exam with no camera.
2. Camera and light check, then calibration.
3. Fullscreen exam with browser events (fullscreen exit, second screen).
4. Signals: face count, head turn, phone or book, frozen feed. The candidate gets a gentle prompt first and sees their
   own log.
5. Dashboard tally with a person's decision on every flag.
6. CSV export and the printed report.
7. Demo mode (`?demo=1`).
8. Evidence clip, off by default.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main, CI green | `exam.e2e.mjs`, `exam-lab.e2e.mjs`, `exam-dashboard.e2e.mjs`, `exam-dashboard-demo.e2e.mjs`, `exam-clip.e2e.mjs`, unit `exam*.test.js` | 20 |
| A1 | Face found, good light, desk distance | ≥ 98 % (existing: `docs/pilot/PILOT-EXAM.md` target table). Measured on a locked public set of ≥ 100 frames (the current n = 26 is too small to show 98 %) | locked set under `~/LENSIQ-field/evals/exam-lab-face/` plus the field pilot | 8 |
| A2 | Phone recall at desk distance | ≥ 80 % (existing, PILOT-EXAM) on a locked set of ≥ 50 phone-in-hand frames | locked set | 4 |
| A3 | Browser events | fullscreen exit and second screen caught 100 % (existing, PILOT-EXAM) | exam-lab e2e | 3 |
| A4 | No over-claim | 0 page or document claims beyond the measurement; "detects a second person" only at ≥ 90 % (existing, owner 2026-11-10) | `npm run accuracy:check`, `tests/unit/claim-rules.test.js` | 3 |
| A5 | Field: precision and noise | flag precision Wilson lower bound ≥ 70 % for signals with ≥ 20 flags; extra flags ≤ 1 per volunteer-hour; light or skin-tone gap ≤ 5 points; invigilator response ≤ 60 s; staged exam: empty-seat recall ≥ 95 %; candidates rating "fair and clear" (1–5) ≥ 4.0; 100 % of decliners sit the exam by the alternative (existing, PILOT-EXAM §6: `docs/pilot/PILOT-EXAM.md:279`, `:284`, `:285`; the Wilson rule is still an owner decision) | pilot result sheet `docs/pilot/exam-lab/` | 12 |
| P | P1–P5, plus P3 also for `exam.html` and the dashboard, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass (`tests/unit/exam-i18n.test.js`) | README L | 8 |
| S | S1, plus S2 camera ready ≤ 15 s, per item | both pass | README S | 7 |
| E | Camera refused, no frames, crash guard on all three pages, face not found, no candidates yet on the dashboard, per item | all pass | README E | 8 |
| X | Dashboard CSV, printed report, candidate's own log, per item | all pass | `exam-dashboard.e2e.mjs` | 7 |
| G | Gate: a person decides every flag; no emotion inference; consent and opt-out; clip off by default; minors need a guardian notice | all pass | e2e and unit tests above | 10 |

**Needs from the owner or outside**
- One pilot institution: ≤ 4 weeks, ≤ 3 rooms, a staged exam and a real exam with tallies (A5,
  `docs/pilot/PILOT-EXAM.md`).
- The owner's decision on keeping "Wilson lower bound ≥ 70 %".
- Counsel on minors and the lawful basis (B1, C2).
- Optional: volunteers with self-identified skin tone for the gap check.

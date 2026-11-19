# Acceptance sheet: Gate (`gate.html`, `parking.html`, `village.html`, assisted)

> **สรุป:** ช่วย รปภ. อ่านป้ายทะเบียน คนยืนยันทุกป้าย เกณฑ์เดิมจากแผนนำร่อง: อ่านถูกกลางวัน ≥ 95% กลางคืน ≥ 85%
> (Wilson lower bound) ต้องแตะแก้ ≤ 10% บันทึกผิดแบบเงียบ 0 วันนี้บนภาพสาธารณะต้องแตะแก้ 78% ต้องการ **ภาพป้ายจากเจ้าของ
> ~100 ภาพ** ไฟล์ตัวตรวจจับที่ฝึกกับป้ายไทย (YOLOX-nano) และนำร่องลานจอด + หมู่บ้าน

**Purpose.** Assisted plate reading for car parks and villages. The guard confirms or corrects every read.

**Must-do functions.** Each one is an F item.
1. Plate finder, OCR and a 5-frame vote.
2. Plate pattern check and province pick-list.
3. The guard confirms or corrects every read.
4. Hash-chained audit.
5. Car park: entry, exit, fee, stamps, static PromptPay, receipt, shift close.
6. Village: visitor pass and watch list.
7. Numbers-only and legacy plates.
8. Sign and notice template (`gate-notice.html`).

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main | `gate*.e2e.mjs`, unit `gate-*.test.js` | 20 |
| A1 | Field exact read | day ≥ 95 %, night ≥ 85 % (Wilson 95 % lower bound) over ≥ 200 reads (night ≥ 40, motorcycles ≥ 30) (existing: `docs/pilot/PILOT-GATE.md`, owner Wilson rule 2026-11-09) | pilot result sheet | 15 |
| A2 | Taps needed | ≤ 10 % (Wilson upper bound) (existing, PILOT-GATE) on the owner's locked photo set (phase 0, ~100 photos), then in the field; phase 0 also: no category above 10 % wrong-text automatic reads (`docs/pilot/PILOT-GATE.md:200`) and plate finder det ≥ 90 % per category (`docs/GATE.md:166`) | locked set `~/LENSIQ-field/evals/gate-owner/` | 8 |
| A3 | No plate, no auto-read | 0 automatic reads on ≥ 15 photos without a plate (existing phase-0 gate, PILOT-GATE) | public set labels v3, then the owner set | 5 |
| A4 | No silent wrong save | 0 (existing, PILOT-GATE): every saved plate was confirmed or corrected by the guard | gate-guard e2e and unit tests | 7 |
| P | P1–P5, per item; P3 includes `gate.html` itself | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2 with "a read shown ≤ 2 s after the plate is steady" (**proposed**); per item | both pass | README S | 5 |
| E | Camera refused, no frames, crash guard on all three pages, no plate, unreadable plate, per item | all pass | README E | 7 |
| X | Receipt print, shift-close report, CSV of the log, per item | all pass | gate-parking / gate-village e2e | 5 |
| G | Gate: a person confirms every read; logs kept only for the set period; sign in place before use; no face processing | all pass | e2e and unit tests | 10 |

**Needs from the owner or outside**
- About 100 owner phone photos of Thai plates, day and night, including motorcycles (A2).
- The Thai-trained YOLOX-nano detector file.
- A car park and a village pilot for ≥ 5 days (A1).
- L24 sign wording and legal basis.
- Fix the conflict in `docs/GATE.md:51` ("≥ 100 vehicles") so it matches PILOT-GATE ("≥ 200 reads").

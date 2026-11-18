# Acceptance sheet: Studio + photobooth (`studio.html`, `photobooth.html`)

> **สรุป:** ถ่ายรูปเปลี่ยนพื้นหลัง/รีทัช และตู้ถ่ายรูปบัตรสำหรับอีเวนต์ เกณฑ์เดิม: ภาพแบบไม่เปลี่ยนชุดต้องมีตำหนิที่เห็นได้
> ไม่เกิน 5% (วันนี้ 20–31% ประเมินด้วย AI) การวัดที่นับได้ต้องใช้ **ชุดภาพบุคคลที่ยินยอม** และ **ผู้ให้คะแนนที่เป็นคนแบบปิดตา**
> ซึ่งงานวิศวกรรมทำเองไม่ได้ ชุดจำลองต้องปิดไว้จนกว่าจะผ่านเกณฑ์

**Purpose.** A portrait with a new background and retouch (studio), and an event ID-photo booth (photobooth). Drawn
outfits stay off until they meet their bar.

**Must-do functions.** Each one is an F item.
1. Camera or upload, after consent.
2. Background replace and retouch.
3. A "review before export" tick.
4. Export or download.
5. Photobooth event flow: queue, shot, print size.
6. A camera-off control on both pages.
7. No call to a backend that is off (no `/api/tryon/status` 404).
8. Outfits off by default.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main | `studio.e2e.mjs`; a photobooth e2e is needed | 20 |
| A1 | No-outfit quality | visible defect ≤ 5 % (existing: `ACCURACY.md` "5 % target"), rated blind by ≥ 2 human raters on a locked consented portrait set of ≥ 60 people, for studio and photobooth separately | locked set `~/LENSIQ-field/evals/studio-portraits/`; `tests/bench/studio.bench.mjs` | 20 |
| A2 | Outfits stay off | outfits shown only when defect ≤ 50 % (existing bar, `ACCURACY.md`), measured as A1; otherwise the switch stays off | config test | 5 |
| A3 | ID-photo spec | 100 % of booth exports meet the chosen print size, head-size range and plain background on the locked set (**proposed**) | bench | 5 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1, plus S2 with "result ≤ 10 s after the shot" (**proposed**), per item | both pass | README S | 7 |
| E | Camera refused, no frames, crash guard, no person found, per item | all pass | README E | 8 |
| X | Download, print at booth size, per item | all pass | e2e | 7 |
| G | Gate: no photos stored by default; non-commercial `faceparse-*` never shipped or loaded in a customer build (including `?faceparse=1`); nothing leaves the device without opt-in | all pass | unit and config tests | 10 |

**Needs from the owner or outside**
- A consented portrait set (≥ 60 people, with written consent) and ≥ 2 blind human raters (A1, A2).
- A paid cloud provider if realistic outfits are wanted.
- A decision on MODNet training data (letter L).

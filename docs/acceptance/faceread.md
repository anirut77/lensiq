# Acceptance sheet: Face reading (`faceread.html`)

> **สรุป:** ดูโหงวเฮ้งจากภาพใบหน้าบนเครื่อง ต้องให้ผลเหมือนเดิมเมื่อใช้ภาพเดิม และต้องคงที่พอสมควรเมื่อถ่ายคนเดิมหลายครั้ง
> การ์ดช่วยเหลือ crisis v3 และขีดจำกัดเด็ดขาด 4 ข้อเป็นประตูผ่าน ต้องการจากภายนอก: ผู้รู้ศาสตร์โหงวเฮ้งหรือเจ้าของภาษาตรวจเนื้อหา
> (ตามแบบประเมินใน `docs/FORTUNE-REVIEW.md`) และคำตอบเรื่องสิทธิ์โมเดล face-api (F5/F6) ก่อนขาย

**Purpose.** A belief-based face reading from a camera or uploaded photo, processed on the device. No emotion
inference.

**Must-do functions.** Each one is an F item.
1. Camera or upload. Consent comes first and no photo is stored.
2. Capture guidance (distance, light, angle). The scan never hangs silently: it has timeouts, a backend fallback and
   plain stop messages.
3. A landmark-based reading with sections, a summary and cautions. The gentle wording is the default; straight mode
   is only for those who confirm they are 18 or older, when the owner switches it on.
4. Look suggestions labelled "according to belief" (sheet `look-salon.md`).
5. Free belief advice. Paid content stays behind its off switch.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–5, per item | each exercised by a test on main | `faceread-webkit*.e2e.mjs`, `face-capture*.e2e.mjs`, `crash-guard.e2e.mjs`, locks `face-capture`, `faceread-ios` | 15 |
| C1 | Same input, same reading | the same image gives an identical reading, 100 % on a locked set of ≥ 30 images (existing rule: `tests/unit/fortune-consistency.test.js`) | unit test plus the locked set | 5 |
| C2 | Same person, repeated captures | ≥ 80 % of the headline traits are unchanged across 5 photos of the same person, on ≥ 50 people of a licensed public set with several photos per person (**proposed**) | new locked set `~/LENSIQ-field/evals/faceread-repeat/` | 5 |
| V | Gate: crisis v3 | README V; the page's free-text field (`#frNick`) is covered by crisis-v3 a/b/c | README V | 15 |
| H | Gate: hard limits | 0 breaches on the locked probes: no dated death, illness or accident; no stop-medication, investment or break-up instruction; no fear-selling; no lottery numbers (existing: `fortune-honest` lock, 60/60 probes) | `docs/FORTUNE-HONEST-READINGS.md` §c tests | 10 |
| Q1 | Depth | meets the depth audit floors (existing: `fortune-depth` lock, `~/Desktop/LENSIQ-review/fortune-depth/AUDIT-TH.md`) | depth audit, 30 profiles | 5 |
| Q2 | No cut text | 0 % of TH/EN/ZH readings have a cut summary bullet (`gist()`), on 30 profiles × 3 languages (**proposed**; current live rate about 12 % TH per `RECHECK-86c`) | fortune-quality check | 5 |
| Q3 | Content review | practitioner or native-speaker review: mean ≥ 4.0, 0 safety fails, ≥ 80 % agreement (existing: `docs/FORTUNE-REVIEW.md`) | review sheet | 5 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass; the reading is 100 % in the chosen language (`tests/unit/fortune-en.test.js`, `fortune-zh.e2e.mjs`) | README L | 8 |
| S | S1, plus S2 with "reading shown ≤ 8 s after the photo" (**proposed**), per item | both pass | README S | 5 |
| E | Camera refused, no face found, face too small or dark, crash guard, per item | all pass | README E | 6 |
| X | Print A4 and 80 mm (photo off by default) and share, per item | all pass on main; the owner approves the sample PDFs | `fortune-print-*`, `fortune-share-print-*` e2e (branch `print-report` today) | 6 |

**Needs from the owner or outside**
- A practitioner or native-speaker content review (Q3).
- Approval of the print PDFs (`~/Desktop/LENSIQ-review/print/`).
- A decision on straight mode (off since 2026-11-12).
- A legal opinion on the face-api models (F5/F6). This blocks sale, whatever the score.
- A mental-health professional's review of the crisis wording (L63, `docs/LEGAL-PACKET.md`).

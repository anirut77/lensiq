# Acceptance sheet: Look suggestions + salon mode (`lensiq-look.js`, salon mode)

> **สรุป:** แนะนำการแต่งลุคแบบย้อนกลับได้ตามคำทำนาย พร้อมภาพตัวอย่าง และโหมดร้านเสริมสวย (แคตตาล็อกรูปทรงของร้าน)
> ห้ามแนะนำหัตถการ ห้ามให้คะแนนความสวย ห้ามบอกว่าส่วนใดไม่ดี วันนี้มีเฉพาะริมฝีปาก อายไลเนอร์ และคิ้ว ยังขาดทรงผม สีผม หนวด
> เครื่องประดับ ต้องการอาสาสมัครผู้ใหญ่ที่ยินยอม ≥ 20 คน และโทรศัพท์จริงวัดความเร็ว

**Purpose.** Reversible styling suggestions tied to a fortune reading, each previewed and labelled "according to belief,
please use your own judgement". Salon mode is a consultation aid on SHAPE, using the salon's own catalogue.

**Must-do functions.** Each one is an F item.
1. Brows: shape, thickness, arch.
2. Hairstyle.
3. Hair colour.
4. Facial hair.
5. Make-up: lip colour, eye make-up, eyeliner.
6. Accessories: earrings, glasses, necklaces.
7. Each suggestion names its reading and carries the belief label.
8. Salon catalogue with an approval flow (branch `salon-approval`).

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main | `look*.e2e.mjs`, `tests/unit/look-*.test.js` | 20 |
| A1 | Preview fit (synthetic, locked) | lip outer contour distance median / p90 ≤ 0.05 / 0.08 IPD; lip IoU median ≥ 0.80; eyeliner contour distance median / p90 ≤ 0.04 / 0.06 IPD; brow IoU median ≥ 0.60; brow coverage by the overlay median ≥ 0.85; brow arch change: erased-area ΔE76 vs skin median ≤ 8; jitter median ≤ 0.008 IPD; glasses (if on) anchor error median / p90 ≤ 0.05 / 0.08 IPD (existing: `docs/LOOK-PREVIEW-EVAL.md:36-42`, lock `beauty-look`), for each preview type that is on | locked synthetic set | 12 |
| A2 | Real faces | A1 targets met on ≥ 20 consenting adult volunteers (existing protocol: `docs/LOOK-VOLUNTEER-PROTOCOL.md`) | volunteer set | 8 |
| A3 | Frame rate | ≥ 20 fps on a real phone (existing, LOOK-PREVIEW-EVAL) | real phone | 5 |
| G1 | Gate: wording | 0 procedure names (tattoo, microblading, semi-permanent pigment, injection, thread lift, laser, surgery), whitening, beauty score or "feature is bad" wording reaches the screen, on the locked attack set and its misspelling variants, in TH/EN/ZH (existing: salon review, 175 checks; lint `lensiq-look-lint.js`) | `look-lint*.test.js`, salon attack harness | 15 |
| G2 | Gate: when it is shown | adults only; hidden when the crisis flag or the calm tab is set; no photo stored by default; never tied to a purchase | e2e | 8 |
| P | P1–P5 for the look panel (after a scan), per item | all pass | README P | 8 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2 with "preview starts ≤ 2 s after the tap" (**proposed**); per item | both pass | README S | 5 |
| E | No face or too dark, model failed to load, empty salon catalogue, per item | all pass | e2e | 6 |
| X | Save the preview image on the device, per item | pass | e2e | 5 |

**Needs from the owner or outside**
- ≥ 20 consenting adult volunteers (A2).
- A real phone (A3).
- Human salon approvers for the catalogue flow.

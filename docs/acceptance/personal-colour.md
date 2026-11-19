# Acceptance sheet: Personal Colour

> **สรุป:** วิเคราะห์โทนสีผิว (undertone) และฤดูสี เกณฑ์เดิม C4 (ล็อกบนกิ่ง): ค่าสีคลาดเคลื่อน ≤ 2.0°, undertone เดิมข้ามแสง
> ≥ 80%, ฤดูอันดับ 1 เดิม ≥ 70% วันนี้ไม่มีหน้า และรอบทดลองกระดาษขาว (18 พ.ย.) ไม่ผ่าน (undertone 1.1%) **วิศวกรรมอย่างเดียว
> ไปไม่ถึง:** ต้องมีงานวิจัยเรื่องสีภายใต้แสงที่เปลี่ยน ภาพอาสาสมัครภายใต้แสงจริง และการ์ดสีมาตรฐาน

**Purpose.** Suggests an undertone and colour season, with a palette, from a phone photo taken with a white-balance
card. The owner parked it on 2026-11-14 and allowed one paper round on 2026-11-18, which failed.

**Must-do functions.** Each one is an F item.
1. A page with consent; no photo stored.
2. White-balance card step.
3. Undertone and season, with a palette labelled as a suggestion.
4. Refuses when the light is not good enough.
5. No skin-whitening advice and no beauty score.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–5, per item | each exercised by a test on main | page e2e (none yet) | 15 |
| A1 | Colour accuracy and hue stability | median CIEDE2000 over 24 patches after card correction ≤ 4.0 and ≤ 6.0 at the 90th percentile, per light and phone (copy paper reported separately; `docs/STYLE-DESIGN.md:297`); hue SD ≤ 2.0° and L* SD ≤ 2.0 (existing C4; L* SD: `docs/STYLE-DESIGN.md:298`, `targets.json` `L_sd_median`; hue: `~/LENSIQ-field/evals/personal-colour-paper/targets.json`, lock `style-mvp` / `personal-colour-paper` on branches) | locked synthetic set, then volunteers | 8 |
| A2 | Undertone across lights | the same undertone ≥ 80 % (existing C4) | as A1 | 10 |
| A3 | Season | the same top-1 season ≥ 70 %; the top-2 contains the usual season ≥ 90 % (existing C4) | as A1 | 10 |
| A4 | Fairness | gap between skin-lightness groups ≤ 10 points (existing C4) | as A1 | 7 |
| A5 | Real people | A1–A4 on ≥ 30 consenting volunteers under real lights | volunteer set | 5 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2 plus time to result ≤ 3 s after capture on a mid-range Android (existing: `docs/STYLE-DESIGN.md:305`, §4.2); per item | both pass | README S | 5 |
| E | Camera refused, no card found, light too poor (refusal), per item | all pass | e2e | 7 |
| X | Save the palette, per item | pass | e2e | 5 |
| G | Gate: no whitening, no beauty score, no photo stored, on-device | all pass | lint and e2e | 10 |

**Needs from the owner or outside**
- Research on colour under changing light. The paper round shows that even with the light known exactly the result is
  6.7 % top-1, so the method itself needs research, not just tuning.
- About 30 consenting volunteers photographed under real lights.
- Standard colour charts and several phone models (paid).
- An owner decision on the targets or design (for example 3 undertone bands, 4 seasons). Any change of target needs
  the owner and a new lock.

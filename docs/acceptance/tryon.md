# Acceptance sheet: Clothing try-on (`tryon.html`)

> **สรุป:** ลองแว่น หมวก ต่างหู และเสื้อผ้า (เสื้อ แจ็กเก็ต ชุด กระโปรง กางเกง) บนภาพกล้องหรือภาพในเครื่อง เป็น "ภาพตัวอย่าง
> ตำแหน่งและสี ไม่ใช่การลองจริง" ชุดทดสอบจำลองผ่าน แต่ยังไม่วัดกับคนจริง การลองแบบสมจริงต้องใช้ **บริการคลาวด์แบบเสียเงิน**
> (โมเดลเปิดที่มีอยู่เป็นแบบห้ามใช้เชิงพาณิชย์) และอาสาสมัคร ≥ 24 คน กับเสื้อผ้าที่ได้สิทธิ์จากร้าน

**Purpose.** An on-device preview of placement and colour for accessories and garments, with a shop catalogue back
office. The disclaimer reads "a preview of placement and colour, not a realistic fitting".

**Must-do functions.** Each one is an F item.
1. Glasses, hats, earrings.
2. Tops, outerwear, dresses, skirts and trousers anchored to the pose.
3. Camera or a photo on the device, after consent.
4. The disclaimer in TH/EN/ZH.
5. Shop catalogue back office, which needs the backend.
6. Reachable from the menu or category page.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–6, per item | each exercised by a test on main | `tryon*.e2e.mjs`, locks `tryon-mvp`, `tryon-fit`, `tryon-pose`, `tryon-off` | 20 |
| A1 | Pose anchors (synthetic, locked) | all anchors within their mean / p90 limits (fractions of the shoulder-tip width B): neck base 0.05 / 0.09, shoulder tips 0.06 / 0.10, waist 0.08 / 0.13, hip outline 0.08 / 0.13, crotch 0.10 / 0.16, knee outline 0.09 / 0.15, ankle outline 0.09 / 0.15; place-or-refuse 100 % (existing, lock `tryon-pose`; `docs/TRYON-POSE-RESULTS.md:35-45`). Counts only with a set whose fixture ranges are independent of the code offsets (reviewer note, `REVIEW-pose.md`) | locked synthetic set | 10 |
| A2 | Real people | anchor limits of A1 met on ≥ 24 consenting volunteers (existing plan: `docs/TRYON-DESIGN.md` M-targets) | volunteer set | 10 |
| A3 | Realistic try-on (cloud) | fit realism mean ≥ 3.5 (1–5, default cloud chain, held-out); garment fidelity ≥ 3.5; identity preserved ≥ 95 %; artefacts ≤ 20 %; rater agreement Krippendorff's alpha ≥ 0.6; p95 ≤ 20 s; cut-out mask IoU ≥ 0.90 on flat-lay and fix time ≤ 60 s median; false blocks of modest items ≤ 5 %; live-only enforcement 100 % (existing: `docs/TRYON-DESIGN.md:358-369`, M1–M4, M6, M7, M9, M10, M12) | cloud eval, 3 blind raters | 10 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2 plus ≥ 15 fps on a real phone (existing M-target); per item | both pass | README S | 7 |
| E | Camera refused, no frames, crash guard, no person or pose found, garment refused, per item | all pass | README E | 8 |
| X | Save the preview on the device, per item | pass | e2e | 7 |
| G | Gate: no network request carries an image; nothing stored except the language and the model cache (lock `tryon-pose` E4); consent before the camera; cloud try-on off until its eval passes | all pass | tryon-pose e2e | 10 |

**Needs from the owner or outside**
- A paid cloud try-on provider and budget (A3; about USD 0.06 per image, owner approval).
- ≥ 24 consenting volunteers (A2).
- ≥ 220 garments with written rights from a partner shop.
- Cloudflare R2 for the catalogue.

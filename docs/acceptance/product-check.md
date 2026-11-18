# Acceptance sheet: Product Check (`medicine.html`)

> **สรุป:** ตรวจฉลากยาและผลิตภัณฑ์ โหมดเดินทาง (ชื่อสามัญยา INN) ตรวจคำโฆษณา และสแกนสด เกณฑ์ที่ล็อกแล้วหลายข้อ
> **ยังไม่ผ่าน** บนชุดทดสอบ (INN recall 0.811 จากเป้า 0.85, ค่าตามคำนำ 0.834 จากเป้า 0.90, คำโฆษณา 71.1% จากเป้า 80%)
> และมีข้อด้านความเป็นส่วนตัว 1 ข้อที่พลาด (pc-jk: 29 รายการหลุดเมื่อผู้ใช้กดส่งหลังดูตัวอย่าง) ต้องการสิทธิ์ใช้ข้อมูล อย. / TMT
> และนำร่อง 100 กล่องกับเภสัชกร

**Purpose.** Reads medicine and product labels on the device. It adds a travel mode (finding the INN), a check of
advert wording, and a live scan. AI is opt-in, after a preview. A person decides everything.

**Must-do functions.** Each one is an F item.
1. Label scan, with the values and their source.
2. Travel INN mode.
3. Advert wording check.
4. Live scan (barcode first).
5. Opt-in AI with a preview of exactly what is sent.
6. Guards for patient names and other personal data.
7. Thai FDA register lookup. This needs a backend and data permission.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–7, per item | each exercised by a test on main (item 7 against the deployed backend) | 8 product-check e2e files, `medicine.e2e.mjs` | 20 |
| A1 | INN recall | ≥ 0.85 on the hold-out (existing: lock `p9__holdout`, `P9-RESULTS.md`) | p9 harness | 5 |
| A2 | INN precision | ≥ 0.95 on the hold-out (existing, `p9__holdout`) | p9 harness | 3 |
| A3 | Cued-value recall | ≥ 0.90 (existing: lock `pc-f`, `PC-F-RESULTS.md`) | pc-f harness | 6 |
| A4 | Advert wording recall | ≥ 80 % (existing: locks `adverts*`, `ADVERT-RESULTS.md`) | adverts harness | 5 |
| A5 | Patient-name guard | the target is met (existing: locks `p7`, `p7b`, `P7-RESULTS.md`) | p7 harness | 5 |
| A6 | Field | 100-box pilot with a pharmacist: 0 wrong INN or dose read shown as certain (existing plan: `docs/FIELD-PILOT.md` §2.2) | pilot result sheet | 6 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2a: the first on-device result ≤ 1 s with a barcode (existing, `LIVE-SCAN-RESULTS.md`); S2b: AI fields ≤ 3 s (existing), on a real mid-range phone; per item | all pass | README S, live-scan harness | 7 |
| E | Camera refused, crash guard, no text found, AI refused or offline, per item | all pass | README E | 8 |
| X | Copy or export of the result, per item | pass | e2e | 7 |
| G | Gate: 0 personal items reach the AI on the live scan (existing: lock `live-scan`); 0 leaks on JA/KO text, with or without the user's own send after a preview (existing: lock `pc-jk`); no dosing advice | all pass | live-scan and pc-jk harnesses | 10 |

**Needs from the owner or outside**
- Thai FDA register and TMT data permission (L13, L29), and deploying the backend (F item 7).
- A 100-box pilot with a pharmacist (A6).
- Real advert screenshots for A4.
- A paid AI key for the P8 eval; ask the owner about the cost first.
- A real mid-range phone (S2b).

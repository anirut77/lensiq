# ใบเสนอราคา (Quotation) — แม่แบบ / Template

> **ร่าง (DRAFT) 2026-11-11 — ยังไม่ผ่านการตรวจโดยนักบัญชีและทนาย** ห้ามส่งลูกค้าจนกว่าเจ้าของกรอกข้อมูลผู้ขายและปิดจุดเปิดที่ระบุ
> ขายโดยใบเสนอราคาและโอนผ่านธนาคาร ไม่มีการชำระเงินออนไลน์
> ราคาทุกบรรทัดมาจากรายการราคาที่เจ้าของอนุมัติใน `docs/PRICING-RESEARCH.md` §3 เท่านั้น (ไม่รวม VAT 7%)
> แพ็กเกจรวม (บันเดิล) มาจาก `docs/SALES-PACKAGES.md` ซึ่งเป็น **ร่าง ยังไม่อนุมัติ** จึงติดป้าย "ร่าง" ทุกครั้ง
> รายการจุดเปิดทั้งหมดอยู่ใน `docs/sales/README.md` (รหัส OP-xx)

อย่าแต่งข้อมูลผู้ขาย อย่าแต่งราคา อย่าแต่งเลขที่เอกสาร ช่องใน [วงเล็บ] ให้เจ้าของกรอก

## 0. วิธีใช้แม่แบบนี้

1. เลือกแบบเอกสารตามสถานะ VAT ของผู้ขาย **[ต้องยืนยัน / to confirm] OP-02**
   - **แบบ V (ผู้ขายจดทะเบียน VAT):** แสดงบรรทัด VAT 7% และยอดรวมทั้งสิ้น
   - **แบบ N (ผู้ขายยังไม่จดทะเบียน VAT):** ไม่มีบรรทัด VAT ยอดรวมเท่ากับยอดก่อน VAT
     (`docs/BILLING-PLAN.md` §5: ถ้าไม่จดทะเบียน ไม่มีบรรทัด VAT)
2. ใบกำกับภาษี (tax invoice) ออกได้เฉพาะผู้ขายที่จดทะเบียน VAT เท่านั้น ถ้ายังไม่จดทะเบียน ออกได้เฉพาะใบเสนอราคา ใบแจ้งหนี้
   และใบเสร็จรับเงินธรรมดา
   - สิ่งที่รู้แล้ว (`docs/BILLING-PLAN.md` §5): ต้องจด VAT เมื่อรายได้เกิน 1.8 ล้านบาทต่อปี และจดโดยสมัครใจได้ถ้าต่ำกว่า
     ข้อมูลในใบกำกับภาษีเต็มรูป (มาตรา 86/4) คือ ชื่อ เลขผู้เสียภาษี ที่อยู่ สาขาของผู้ขายและผู้ซื้อ เลขที่เอกสาร วันที่
     รายการ ยอดก่อน VAT VAT ยอดรวม
   - ยังไม่ชัด (`docs/LEGAL-REVIEW-PACK.md` §3.5 R1–R6): จดทะเบียนตอนเปิดขายหรือไม่ (R1) ออกใบกำกับจากระบบบัญชีหรือใช้
     e-Tax Invoice by Email และเลขที่เอกสารไม่ขาดตอน (R2) การหักภาษี ณ ที่จ่าย 3% ของลูกค้านิติบุคคล (R4)
     การเก็บเอกสาร 5 ปี (R5) **[ต้องยืนยัน / to confirm] OP-02, OP-03, OP-04, OP-05**
   - ตอนนี้ **เจ้าของออกเลขที่เอกสารและใบเสร็จเองจากแม่แบบ ระบบไม่ออกเลขให้** (2026-11-13) คำถามถึงนักบัญชีอยู่ที่ `ACCOUNTANT-QUESTIONS-TH.md`
3. ราคา: ใช้ **ราคาช่วงนำร่อง** ไปก่อน ราคา "หลังนำร่อง" ใช้ได้เมื่อไซต์นั้นผ่านเกณฑ์ในชุดนำร่องของตัวเองแล้วเท่านั้น
   (`docs/PRICING-RESEARCH.md` §3) ข้อความในสัญญาเรื่องนี้ **[ต้องยืนยัน / to confirm] OP-10**
4. หน้าเว็บยังติดป้าย "ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย" (`PRICING-RESEARCH.md` หัวเรื่อง) เจ้าของต้องยืนยันว่าเสนอราคาได้แล้ว
   **[ต้องยืนยัน / to confirm] OP-09**

## 1. แม่แบบ (กรอกแล้วพิมพ์เป็น PDF)

### หัวเอกสาร

| ช่อง | ค่า |
|---|---|
| ผู้เสนอราคา (ชื่อบริษัทหรือชื่อผู้ขาย) | [ชื่อบริษัท / ชื่อผู้ขาย] (OP-01) |
| เลขประจำตัวผู้เสียภาษี | [เลข 13 หลัก] (OP-01) |
| ที่อยู่ | [ที่อยู่ตามทะเบียน] |
| สำนักงานใหญ่ / สาขา | [สำนักงานใหญ่ หรือ สาขาที่ xxxxx] |
| ติดต่อ | [อีเมล] · [โทรศัพท์] · [LINE OA] (OP-16) |
| สถานะ VAT | [จดทะเบียน VAT (แบบ V) / ไม่ได้จดทะเบียน (แบบ N)] (OP-02) |
| เลขที่ใบเสนอราคา | [เลขที่เอกสาร] (OP-04) |
| วันที่ออก | [วัน/เดือน/ปี] |
| ใช้ได้ถึง | [วัน/เดือน/ปี] ([30] วันนับจากวันที่ออก; SALES-PACKAGES A.5 ระบุ 30–60 วัน ยังไม่ยืนยัน) (OP-06) |

### ลูกค้า

| ช่อง | ค่า |
|---|---|
| ชื่อองค์กร | [ชื่อองค์กร] |
| เลขประจำตัวผู้เสียภาษี | [เลข 13 หลัก] |
| ที่อยู่ออกเอกสาร | [ที่อยู่] |
| สำนักงานใหญ่ / สาขา | [ ... ] |
| ผู้ติดต่อ | [ชื่อ ตำแหน่ง อีเมล โทรศัพท์] |
| ไซต์ที่ใช้งาน | [ชื่อห้อง / อาคาร / ช่องทาง / งาน] |

### รายการ

| # | รายการ | หน่วย | จำนวน | ราคาต่อหน่วย (บาท ไม่รวม VAT 7%) | จำนวนเงิน (บาท) |
|---|---|---|---|---|---|
| 1 | [ชื่อผลิตภัณฑ์ — แพ็กเกจ — ช่วง "นำร่อง"] | [หน่วยตามตารางราคา §2] | [จำนวน] | [ราคา] | [จำนวน × ราคา] |
| 2 | ... | | | | |

### ยอดรวม

| รายการ | แบบ V | แบบ N |
|---|---|---|
| รวมเป็นเงิน (ก่อน VAT) | [ยอดก่อน VAT] | [ยอดรวม] |
| ภาษีมูลค่าเพิ่ม 7% | [ยอดก่อน VAT × 0.07 ปัดเป็นสตางค์] | (ไม่มีบรรทัดนี้) |
| **รวมทั้งสิ้น** | **[ยอดก่อน VAT + VAT]** | **[ยอดรวม]** |

ตัวอักษร: [จำนวนเงินเป็นตัวอักษรไทย]

### เงื่อนไข

1. **การชำระเงิน:** โอนผ่านธนาคารเท่านั้น ไม่มีการชำระออนไลน์
   - ธนาคาร: [ชื่อธนาคาร] · ชื่อบัญชี: [ชื่อบัญชี] · เลขที่บัญชี: [เลขที่บัญชี] · สาขา: [สาขา] (OP-01)
   - ใส่เลขที่ใบเสนอราคาหรือใบแจ้งหนี้ในช่องบันทึกการโอน แล้วส่งหลักฐานการโอนทางอีเมลหรือ LINE
2. **กำหนดชำระ:** [ชำระภายใน __ วันนับจากวันที่ใบแจ้งหนี้ / มัดจำ __ % ก่อนเริ่ม] (OP-06 เจ้าของกำหนด ยังไม่มีค่ามาตรฐาน)
3. **ภาษีหัก ณ ที่จ่าย:** ลูกค้านิติบุคคลอาจหักภาษี ณ ที่จ่ายและส่งหนังสือรับรอง (50 ทวิ) `BILLING-PLAN.md` §5 บันทึกว่าลูกค้านิติบุคคลมักหัก 3%
   และให้โอนยอดหลังหัก **อัตรา ฐานภาษี และเวลาส่งหนังสือรับรอง [ต้องยืนยัน / to confirm] กับนักบัญชี** (OP-05)
4. **ใบกำกับภาษี:** ออกให้เฉพาะเมื่อผู้ขายจดทะเบียน VAT (แบบ V) **[ต้องยืนยัน / to confirm]** (OP-02, OP-03)
5. **ขอบเขต:** ซอฟต์แวร์ทำงานบนอุปกรณ์ของลูกค้า ไม่ขายอุปกรณ์ ไม่ขายไม้กั้นหรือกล้อง ไม่ส่งภาพออกจากอุปกรณ์
   ทุกการตัดสินใจเกี่ยวกับเงิน สิทธิ์เข้าออก หรือบุคคล คนเป็นผู้ยืนยัน
6. **ความแม่นยำ:** ตัวเลขความแม่นยำที่ให้ลูกค้าต้องมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตาม `docs/ACCURACY-CLAIMS.md`
   ผลหน้างานจริงยังไม่ได้วัด ห้ามเขียนรับประกันตัวเลขในใบเสนอราคา
7. **เงื่อนไขอื่น:** ข้อกำหนดการใช้บริการ การยกเลิก การคืนเงิน ความรับผิด ยังไม่มีเอกสารสำหรับการขาย (มีเฉพาะสัญญานำร่อง
   `docs/pilot/AGREEMENT-TH.md`) **[ต้องยืนยัน / to confirm]** (OP-13)
8. **การประมวลผลข้อมูล:** ดู `ORDER-FORM.md` ข้อ 6 (OP-12)

ลงชื่อผู้เสนอราคา: ____________________ ([ชื่อ ตำแหน่ง]) วันที่ ____________
ลงชื่อลูกค้าผู้ยอมรับ: ____________________ ([ชื่อ ตำแหน่ง]) วันที่ ____________

## 2. ตารางราคาที่ใช้ในรายการได้ (อนุมัติแล้ว 2026-11-09 ไม่รวม VAT 7%)

แหล่ง: `docs/PRICING-RESEARCH.md` §3.1–3.4 และ `docs/BILLING-PLAN.md` §4.1 อย่าใช้ตัวเลขนอกตารางนี้
คอลัมน์ "นำร่อง" ใช้ตอนนี้ คอลัมน์ "หลังนำร่อง" ใช้เมื่อไซต์ผ่านเกณฑ์แล้วเท่านั้น (OP-10)

| ผลิตภัณฑ์ | รายการ (รหัสแผน) | หน่วย | นำร่อง (บาท) | หลังนำร่อง (บาท) |
|---|---|---|---|---|
| Exam | โครงการนำร่องภาคสนาม (`exam_pilot`) 1 สถาบัน ≤ 4 สัปดาห์ ≤ 3 ห้อง | โครงการ | ฟรี (แลกกับการจดผลของผู้คุมสอบ) | — |
| Exam | ระดับฟรี: ไม่เกิน 5 ผู้สอบต่อรอบสอบ (เกินนั้นต้องมีใบอนุญาต; ข้อจำกัดเริ่มตามวันที่จะประกาศ) | รอบสอบ | ฟรี | ฟรี |
| Exam | ห้องคอมพิวเตอร์/ออนไลน์ ต่อผู้สอบ (`exam_lab`) | ผู้สอบต่อการสอบ | 10 (ขั้นต่ำ 300 ต่อรอบ) | 15–30 |
| Exam | ห้องคอมพิวเตอร์/ออนไลน์ รายเดือน (`exam_lab`) | ห้องปฏิบัติการต่อเดือน | 990 | 990–1,490 |
| Exam | ใบอนุญาตทั้งสถาบัน (`exam_institution`) | ปี (≤ 1,000 ผู้สอบ) | เริ่ม 19,900 | 30,000–120,000 ตามขนาด |
| Exam | ห้องสอบที่มีกล้อง (`exam_hall`) | — | **รุ่นทดลอง ไม่ขาย ห้ามใส่ในใบเสนอราคา** | — |
| Attendance | ฟรี (`attendance_free`) ไม่เกิน 5 คน PIN/QR 1 เครื่อง (เกินนั้นต้องมีใบอนุญาต; ข้อจำกัดเริ่มตามวันที่จะประกาศ) | — | ฟรี | ฟรี |
| Attendance | มาตรฐาน (`attendance_employee`) | คนที่ใช้งานต่อเดือน | 19 (ขั้นต่ำ 190 ต่อเดือน) | 29 (ขั้นต่ำ 290 ต่อเดือน) |
| Attendance | ช่วยตั้งค่า (`attendance_setup`) ไม่บังคับ | ครั้งเดียว | 2,900 | 4,900 |
| Attendance | ซิงก์หลายสาขา/สำรองบนคลาวด์ | — | **ไม่ขาย** (รอระบบบัญชีองค์กร) | ใบเสนอราคาแยกหลังระบบเสร็จ |
| Gate | ทดลองใช้ 30 วัน (`gate_trial`) 1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน | 30 วัน | ฟรี | ฟรี |
| Gate | หมู่บ้าน/คอนโด (`gate_village_basic`) | ช่องทางต่อเดือน | 490 | 990 |
| Gate | หมู่บ้าน Pro 3 ช่องทาง (`gate_village_pro`) | เดือน | 490 ต่อช่องทาง | 1,990 (3 ช่องทาง) |
| Gate | ลานจอดรถ (`gate_parking`) รวมพร้อมเพย์ ใบเสร็จ ปิดกะ | ช่องทางต่อเดือน | 790 | 1,490 |
| Gate | ติดตั้งหน้างาน (`gate_setup`) | ครั้ง | 2,500 | 3,000–5,000 |
| Gate | ไม้กั้น/รีเลย์/อุปกรณ์ | — | **ไม่ขาย** | ใบเสนอราคาแยกหลังนำร่อง |
| Crowd | ระดับฟรี: 2 ชั่วโมงต่อเครื่องต่อวัน (เกินนั้นต้องมีใบอนุญาต; ข้อจำกัดเริ่มตามวันที่จะประกาศ) | เครื่องต่อวัน | ฟรี | ฟรี |
| Crowd | วันงาน (`crowd_event_day`) | เครื่องต่อวัน | 590 | 990 |
| Crowd | สัปดาห์งาน 7 วัน (`crowd_event_week`) | เครื่อง | 2,490 | 3,900 |
| Crowd | รายเดือนพื้นที่ถาวร (`crowd_monthly`) | — | **ไม่ขาย** จนกว่าโครงการนำร่องพื้นที่ถาวรผ่าน | — |
| Crowd | ฝูงชนหนาแน่น (ประมาณ 50 คนขึ้นไปในภาพ) | — | **ไม่ขาย** | **ไม่ขาย** |

ปี = 10 × เดือน (กฎใน `BILLING-PLAN.md`) ใช้กับรายการรายเดือนที่ขายเป็นรายปี

**ข้อความที่ต้องใส่ในใบเสนอราคาเมื่อมีระดับฟรี (เจ้าของตัดสินใจ 2026-11-13, OP-26):** ดูดวงและเครื่องมือทั่วไปยังฟรี ผลิตภัณฑ์ธุรกิจมีระดับฟรีแบบจำกัด (Gate ทดลอง 30 วัน 1 ช่องทาง 100 ป้ายต่อวัน · Attendance ถึง 5 คน · Exam ถึง 5 ผู้สอบต่อรอบสอบ · Crowd 2 ชั่วโมงต่อเครื่องต่อวัน) เกินกว่านั้นต้องมีใบอนุญาต **ข้อจำกัดนี้ยังไม่ถูกบังคับในระบบ** จะเริ่มใช้ตั้งแต่วันที่จะประกาศ โดยประกาศล่วงหน้าอย่างน้อย 30 วัน และเริ่มใช้หลังประกาศ 30 วัน เจ้าของบังคับใช้ผ่านสัญญา ข้อจำกัดที่ทำงานบนเครื่องของผู้ใช้อาจถูกข้ามได้โดยผู้ที่แก้โค้ด สัญญาเป็นสิ่งที่ผูกพัน ลูกค้าส่งออกข้อมูลของตนได้เสมอ ใบอนุญาตใช้ออฟไลน์ได้ 14 วัน (วางแผน ยังไม่สร้าง) การชำระเงิน: โอนผ่านธนาคารเท่านั้น

คำจำกัดความที่ยังไม่มี: "รอบสอบ" และ "ห้องปฏิบัติการ" (Exam) "คนที่ใช้งาน" (Attendance) "วัน" (Crowd) "ช่องทาง" (Gate)
**[ต้องยืนยัน / to confirm]** (OP-08, OP-18)
ค่าเดินทางและการติดตั้งนอกพื้นที่ไม่อยู่ในราคาอนุมัติ ห้ามเพิ่มบรรทัดเอง (OP-19)

## 3. ตัวอย่างที่คำนวณแล้ว (ราคานำร่องที่อนุมัติ แสดงวิธีคิด ไม่ใช่ใบเสนอราคาจริง)

VAT = ยอดก่อน VAT × 0.07 ปัดเป็นสตางค์ (แบบ V) แบบ N ไม่มี VAT ยอดรวมเท่ากับยอดก่อน VAT

### ตัวอย่าง Exam (ห้องคอมพิวเตอร์ 1 การสอบ 40 ผู้สอบ)

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Exam ห้องคอมพิวเตอร์ ต่อผู้สอบ ช่วงนำร่อง | 40 ผู้สอบ | 10.00 | 400.00 |

ยอดก่อน VAT 400.00 (มากกว่าขั้นต่ำ 300 ต่อรอบ) · แบบ V: VAT 28.00 → **รวม 428.00** · แบบ N: **รวม 400.00**
(ตรงกับตัวอย่างใน `PRICING-RESEARCH.md` §3.1: 10 × 40 = 400)

### ตัวอย่าง Attendance (ร้าน 12 คน เดือนแรก พร้อมช่วยตั้งค่า)

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Attendance มาตรฐาน ช่วงนำร่อง | 12 คน × 1 เดือน | 19.00 | 228.00 |
| 2 | Attendance ช่วยตั้งค่า (ครั้งเดียว) | 1 | 2,900.00 | 2,900.00 |

ยอดก่อน VAT 3,128.00 (228 มากกว่าขั้นต่ำ 190 ต่อเดือน) · แบบ V: VAT 218.96 → **รวม 3,346.96** · แบบ N: **รวม 3,128.00**

### ตัวอย่าง Gate (หมู่บ้าน 2 ช่องทาง เดือนแรก พร้อมติดตั้งหน้างาน)

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Gate หมู่บ้าน/คอนโด ช่วงนำร่อง | 2 ช่องทาง × 1 เดือน | 490.00 | 980.00 |
| 2 | Gate ติดตั้งหน้างาน ช่วงนำร่อง | 1 ครั้ง | 2,500.00 | 2,500.00 |

ยอดก่อน VAT 3,480.00 · แบบ V: VAT 243.60 → **รวม 3,723.60** · แบบ N: **รวม 3,480.00**
(ทดลองใช้ฟรี 30 วันก่อนหน้านี้ไม่ต้องใส่เป็นบรรทัดราคา หรือใส่ 0.00 ได้)

### ตัวอย่าง Crowd (งาน 2 วัน 2 เครื่อง)

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Crowd วันงาน ช่วงนำร่อง (ประมาณความหนาแน่น ไม่ใช่จำนวนที่แน่นอน) | 2 เครื่อง × 2 วัน = 4 หน่วย | 590.00 | 2,360.00 |

ยอดก่อน VAT 2,360.00 · แบบ V: VAT 165.20 → **รวม 2,525.20** · แบบ N: **รวม 2,360.00**
หมายเหตุในใบเสนอราคา Crowd: เหมาะกับฝูงชนเบาบางถึงปานกลาง ยังไม่เหมาะกับฝูงชนหนาแน่น ห้ามใช้ตัดสินความปลอดภัยของฝูงชน

### ตัวอย่างแพ็กเกจรวม — **ร่าง ยังไม่อนุมัติ** (สถาบันการศึกษา ปีแรก ช่วงนำร่อง)

ที่มา: `docs/SALES-PACKAGES.md` §A.2 ตัวอย่าง S (ไม่มีส่วนลดบันเดิล ส่วนลดเป็นคำถามของเจ้าของ B-1) (OP-11)

| # | รายการ | คำนวณ | จำนวนเงิน |
|---|---|---|---|
| 1 | Exam ใบอนุญาตทั้งสถาบัน (≤ 1,000 ผู้สอบ) | 1 ปี | 19,900.00 |
| 2 | Attendance 30 คน × 10 เดือน (ปี = 10 × เดือน) | 30 × 19 × 10 | 5,700.00 |
| 3 | Crowd สัปดาห์งาน 2 สัปดาห์ | 2 × 2,490 | 4,980.00 |
| 4 | Crowd วันงาน 4 วัน | 4 × 590 | 2,360.00 |

ยอดก่อน VAT **32,940.00** · แบบ V: VAT 2,305.80 → **รวม 35,245.80** · แบบ N: **รวม 32,940.00**
ตัวเลขตรงกับ `SALES-PACKAGES.md` §A.2 บรรทัด "Yearly total" ช่วงนำร่อง ป้าย "ร่าง" ต้องอยู่บนใบเสนอราคาจนกว่าเจ้าของอนุมัติแพ็กเกจ

---

# English

> **DRAFT 2026-11-11. Not yet checked by an accountant or a lawyer.** Do not send to a customer until the owner fills the seller
> details and closes the open points. The owner sells by quotation and bank transfer. There is no online payment.
> Every price line comes only from the approved price list in `docs/PRICING-RESEARCH.md` §3 (excluding 7% VAT).
> Combined packages come from `docs/SALES-PACKAGES.md`, which is a **draft, not approved**, so they carry a "draft" label.
> All open points have codes (OP-xx) and are listed in `docs/sales/README.md`.

Never invent seller details, prices or document numbers. Fields in [brackets] are for the owner to fill.

## 0. How to use

1. Pick the form by the seller's VAT status **[to confirm] OP-02**:
   **Form V** (seller is VAT-registered) shows a 7% VAT line and a grand total. **Form N** (not registered) has no VAT line; the total
   equals the subtotal (`docs/BILLING-PLAN.md` §5).
2. A tax invoice (ใบกำกับภาษี) can be issued only by a VAT-registered seller. Without registration the seller can issue only a quotation,
   an invoice and a plain receipt.
   - Known (`BILLING-PLAN.md` §5): VAT registration is mandatory above 1.8 M THB turnover per year and voluntary below it. A full tax invoice
     (Revenue Code s.86/4) needs seller and buyer name, tax ID, address and branch, a document number, a date, the items, the subtotal, the VAT and the total.
   - Open (`docs/LEGAL-REVIEW-PACK.md` §3.5, R1–R6): whether to register at launch (R1); issue tax invoices from an accounting system or by
     e-Tax Invoice by Email, and gap-free numbering (R2); the 3% withholding of juristic customers (R4); record keeping for 5 years (R5).
     **[to confirm] OP-02, OP-03, OP-04, OP-05**
   - For now **the owner numbers documents and issues receipts by hand from the templates; the system does not number them** (2026-11-13). The questions for the accountant are in `ACCOUNTANT-QUESTIONS-TH.md` (Thai).
3. Price stage: use the **pilot-stage price** now. The "after pilot" price applies only after that site passes the thresholds of its own
   pilot kit (`PRICING-RESEARCH.md` §3). Contract wording: **[to confirm] OP-10**.
4. The product pages still say "approved price list, not on sale yet". The owner must confirm that quotations may go out **[to confirm] OP-09**.

## 1. Template

Header: seller name, tax ID, address, head office or branch, contact, VAT status, quotation number (OP-04), issue date, valid until
([30] days; SALES-PACKAGES A.5 says 30–60 days, unverified, OP-06). Customer: organisation, tax ID, billing address, branch, contact, site.

Items table: `# | item | unit | quantity | unit price (THB, excl. 7% VAT) | amount (THB)`.
Totals: subtotal; VAT 7% (Form V only, rounded to the satang); **grand total**; amount in words.

Conditions:

1. **Payment:** bank transfer only. Bank [name], account name [name], account no. [number], branch [branch] (OP-01). Write the document number in the
   transfer note and send the slip by e-mail or LINE.
2. **Payment terms:** [pay within __ days of the invoice date / __ % deposit before start] (OP-06; the owner decides; there is no standard value yet).
3. **Withholding tax:** a juristic customer may withhold tax and send a certificate (50 ทวิ). `BILLING-PLAN.md` §5 notes 3% as usual. **Rate, base and
   timing: [to confirm] with the accountant** (OP-05).
4. **Tax invoice:** only if the seller is VAT-registered (Form V) **[to confirm]** (OP-02, OP-03).
5. **Scope:** the software runs on the customer's devices. No hardware, barrier or camera is sold. No image leaves the device. A person confirms every
   decision about money, access or a person.
6. **Accuracy:** any figure given to the customer states its source (synthetic / public dataset / field), as in `docs/ACCURACY-CLAIMS.md`. Field accuracy
   is not yet measured. Never write a guarantee into a quotation.
7. **Other terms:** terms of service, cancellation, refund and liability for sale do not exist yet (only the pilot agreement `docs/pilot/AGREEMENT-TH.md`).
   **[to confirm]** (OP-13).
8. **Data processing:** see `ORDER-FORM.md` section 6 (OP-12).

Signature blocks: seller and accepting customer, with name, position and date.

## 2. Price table allowed in line items (approved 2026-11-09, excl. 7% VAT)

Source: `docs/PRICING-RESEARCH.md` §3.1–3.4 and `BILLING-PLAN.md` §4.1. Use no number outside this table.

| Product | Item (plan id) | Unit | Pilot stage (THB) | After pilot (THB) |
|---|---|---|---|---|
| Exam | Field pilot (`exam_pilot`), 1 institution, up to 4 weeks, up to 3 rooms | project | free (in exchange for invigilator tallies) | — |
| Exam | Free tier: up to 5 candidates per session (beyond it a licence is needed; limits apply from a date to be announced) | session | free | free |
| Exam | Computer room / online, per candidate (`exam_lab`) | candidate per exam | 10 (minimum 300 per session) | 15–30 |
| Exam | Computer room / online, monthly (`exam_lab`) | lab per month | 990 | 990–1,490 |
| Exam | Institution licence (`exam_institution`) | year (up to 1,000 candidates) | from 19,900 | 30,000–120,000 by size |
| Exam | Camera exam hall (`exam_hall`) | — | **experimental, not sold, do not quote** | — |
| Attendance | Free (`attendance_free`), up to 5 people, PIN/QR, 1 device (beyond it a licence is needed; limits apply from a date to be announced) | — | free | free |
| Attendance | Standard (`attendance_employee`) | active person per month | 19 (minimum 190 per month) | 29 (minimum 290 per month) |
| Attendance | Set-up help (`attendance_setup`), optional | one-off | 2,900 | 4,900 |
| Attendance | Multi-branch sync / cloud backup | — | **not sold** (waits for organisation accounts) | quoted separately later |
| Gate | Trial (`gate_trial`): 1 lane, 100 plates per day, 7-day log | 30 days | free | free |
| Gate | Village / condo (`gate_village_basic`) | lane per month | 490 | 990 |
| Gate | Village Pro, 3 lanes (`gate_village_pro`) | month | 490 per lane | 1,990 (3 lanes) |
| Gate | Car park (`gate_parking`), PromptPay, receipts and shift close included | lane per month | 790 | 1,490 |
| Gate | On-site set-up (`gate_setup`) | visit | 2,500 | 3,000–5,000 |
| Gate | Barrier / relay / hardware | — | **not sold** | quoted separately after the pilot |
| Crowd | Free tier: 2 hours per device per day (beyond it a licence is needed; limits apply from a date to be announced) | device per day | free | free |
| Crowd | Event day (`crowd_event_day`) | device per day | 590 | 990 |
| Crowd | Event week, 7 days (`crowd_event_week`) | device | 2,490 | 3,900 |
| Crowd | Monthly, fixed site (`crowd_monthly`) | — | **not sold** until a fixed-site pilot passes | — |
| Crowd | Dense crowds (about 50+ people in view) | — | **not sold** | **not sold** |

Yearly = 10 × monthly (BILLING-PLAN rule) for monthly lines sold yearly.

**Text required on a quotation that mentions a free tier (owner decision 2026-11-13, OP-26):** Fortune and the general tools stay free. The business products have a limited free tier (Gate 30-day trial, 1 lane, 100 plates per day · Attendance up to 5 people · Exam up to 5 candidates per session · Crowd 2 hours per device per day); beyond it a licence is needed. **These limits are not enforced in the product yet.** They apply from a date to be announced, with at least 30 days' notice, and start 30 days after the announcement. The owner enforces them by contract. A limit that runs on the user's device can be bypassed by someone who edits the code; the contract is what binds. Customers can always export their own data. A licence works offline for 14 days (planned, not built). Payment: bank transfer only.
Definitions still missing: "exam session" and "lab" (Exam), "active person" (Attendance), "day" (Crowd), "lane" (Gate) **[to confirm]** (OP-08, OP-18).
Travel and out-of-area installation are not in the approved prices. Do not add a line yourself (OP-19).

## 3. Worked examples (approved pilot-stage prices; they show the method, they are not real quotations)

VAT = subtotal x 0.07, rounded to the satang (Form V). Form N has no VAT; total = subtotal.

| Example | Lines | Subtotal | Form V: VAT / total | Form N: total |
|---|---|---|---|---|
| Exam: one computer-room exam, 40 candidates | 40 x 10.00 = 400.00 (above the 300 minimum) | 400.00 | 28.00 / **428.00** | 400.00 |
| Attendance: shop with 12 people, month 1, with set-up | 12 x 19.00 = 228.00 (above the 190 minimum) + set-up 2,900.00 | 3,128.00 | 218.96 / **3,346.96** | 3,128.00 |
| Gate: village, 2 lanes, month 1, with on-site set-up | 2 x 490.00 = 980.00 + set-up 2,500.00 | 3,480.00 | 243.60 / **3,723.60** | 3,480.00 |
| Crowd: 2-day event, 2 devices | 2 devices x 2 days = 4 units x 590.00 | 2,360.00 | 165.20 / **2,525.20** | 2,360.00 |
| **Draft package** (not approved): institution, year 1, pilot stage | Exam licence 19,900 + Attendance 30 x 19 x 10 = 5,700 + Crowd 2 event weeks 4,980 + Crowd 4 event days 2,360 | 32,940.00 | 2,305.80 / **35,245.80** | 32,940.00 |

The draft package follows `docs/SALES-PACKAGES.md` §A.2 example S, with no bundle discount (owner question B-1, OP-11).
Crowd quotations must say: suited to sparse and medium crowds, not yet suitable for dense crowds, not for crowd-safety decisions.

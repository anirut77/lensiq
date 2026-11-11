# ใบสั่งซื้อ (Order Form) — แบบฟอร์มลูกค้า / Customer order form

> **ร่าง (DRAFT) 2026-11-11 — ยังไม่ผ่านการตรวจโดยทนาย** ใช้คู่กับใบเสนอราคาที่ลูกค้ายอมรับแล้ว (`QUOTATION-TEMPLATE.md`)
> ขอเฉพาะข้อมูลที่จำเป็นต่อการส่งมอบและออกเอกสาร ไม่ขอรายชื่อผู้สอบ พนักงาน หรือเลขทะเบียนรถ
> จุดเปิดมีรหัส OP-xx อยู่ใน `docs/sales/README.md` ช่อง [วงเล็บ] ผู้ขายหรือลูกค้ากรอก

## 1. ข้อมูลองค์กรลูกค้า (ใช้ออกใบแจ้งหนี้และติดต่อ)

| ช่อง | ค่า |
|---|---|
| ชื่อองค์กร (ตามทะเบียน) | [ชื่อองค์กร] |
| เลขประจำตัวผู้เสียภาษี | [เลข 13 หลัก] |
| ที่อยู่ออกเอกสาร / สำนักงานใหญ่ หรือสาขา | [ที่อยู่] / [สำนักงานใหญ่ หรือ สาขาที่ xxxxx] |
| ประเภทองค์กร | [โรงเรียน / มหาวิทยาลัย / บริษัท / นิติบุคคลหมู่บ้านหรือคอนโด / ผู้จัดงาน / อื่น ๆ] |
| ผู้มีอำนาจลงนาม (ชื่อ ตำแหน่ง) | [ชื่อ ตำแหน่ง] |
| อ้างอิงใบเสนอราคาเลขที่ | [เลขที่ใบเสนอราคา] |
| เลขที่ใบสั่งซื้อของลูกค้า (ถ้ามี) | [เลขที่] |

## 2. ผู้ติดต่อ

| บทบาท | ชื่อ | อีเมล | โทรศัพท์ / LINE |
|---|---|---|---|
| ผู้รับผิดชอบโครงการ (ตัดสินใจ) | [ ] | [ ] | [ ] |
| ผู้ติดต่อด้านไอที/ติดตั้ง | [ ] | [ ] | [ ] |
| ผู้ติดต่อด้านข้อมูลส่วนบุคคล (DPO หรือผู้ที่องค์กรกำหนด) | [ ] | [ ] | [ ] |
| ผู้รับใบแจ้งหนี้ / ฝ่ายบัญชี | [ ] | [ ] | [ ] |

## 3. ผลิตภัณฑ์ที่สั่ง (ติ๊กและกรอกเฉพาะที่ใช้)

ราคาทุกรายการ: ตามใบเสนอราคาที่อ้างถึง ไม่รวม VAT 7% ช่วงราคา: [นำร่อง / หลังนำร่อง] (OP-10)

### ☐ Exam (ห้องคอมพิวเตอร์/ออนไลน์ `exam-lab.html`)

| ช่อง | ค่า |
|---|---|
| รูปแบบการสั่ง | [ต่อผู้สอบ / รายเดือนต่อห้องปฏิบัติการ / ใบอนุญาตทั้งสถาบัน / โครงการนำร่องฟรี] |
| จำนวนผู้สอบโดยประมาณต่อรอบ / จำนวนห้องปฏิบัติการ | [จำนวน] / [จำนวน] |
| ระดับการสอบ | [ย่อย/กลางภาค/ปลายภาค/อื่น ๆ] (ชุดนำร่องใช้เฉพาะรอบที่ไม่ชี้ขาดสูง) |
| มีผู้สอบที่ยังไม่บรรลุนิติภาวะหรือไม่ | [ใช่/ไม่] (ถ้าใช่ ต้องมีขั้นตอนความยินยอมของผู้ปกครอง ให้ทนายยืนยัน OP-22) |
| ทางเลือกสำหรับผู้ไม่ยินยอมเปิดกล้อง | [อธิบายวิธีสอบโดยไม่เปิดกล้อง] (จำเป็น) |
| ห้องสอบที่มีกล้อง (`exam-hall.html`) | **รุ่นทดลอง ไม่ขาย ไม่อยู่ในใบสั่งซื้อนี้** |

### ☐ Attendance (ลงเวลาพนักงาน `attendance.html?mode=employee`)

| ช่อง | ค่า |
|---|---|
| จำนวนพนักงานที่ใช้งานโดยประมาณ / จำนวนจุดลงเวลา (เครื่อง) | [จำนวน] / [จำนวน] (ข้อมูลอยู่ในเบราว์เซอร์ของแต่ละเครื่อง ประมาณ 20 คน × 2 ปีต่อเครื่อง `ATTENDANCE-READINESS.md` §6) |
| วิธีลงเวลา | PIN / QR เป็นค่าเริ่มต้น ☐ ขอเปิดตัวเลือกใบหน้า (ต้องมีความยินยอมเป็นรายบุคคลและทางเลือก PIN/QR เสมอ รอข้อสรุปใบอนุญาตโมเดล OP-14) |
| ช่วยตั้งค่า (ไม่บังคับ) | ☐ ต้องการ (ตารางกะ จับคู่คอลัมน์ CSV เงินเดือน DPIA) |
| ระบบเงินเดือนที่ใช้ (เพื่อจับคู่คอลัมน์ CSV) | [ชื่อระบบ + ไฟล์ตัวอย่างที่ไม่มีข้อมูลบุคคล] |

### ☐ Gate (ผู้ช่วย รปภ. อ่านป้ายทะเบียน)

| ช่อง | ค่า |
|---|---|
| รูปแบบ | [หมู่บ้าน/คอนโด `village.html` / ลานจอดรถ `parking.html` / ทดลองใช้ 30 วัน] |
| จำนวนช่องทาง (เลนที่มีกล้องหนึ่งตัว) | [จำนวน] (OP-18) |
| อุปกรณ์ต่อช่องทาง (ลูกค้าจัดหาเอง) | [มือถือ/โน้ตบุ๊ก/กล้อง IP ผ่านตัวกลาง] |
| ไม้กั้น/รีเลย์ | ไม่รวมในใบสั่งซื้อนี้ (ไม่ขายอุปกรณ์ รปภ. แตะยืนยันทุกคัน) |
| ต้องการติดตั้งหน้างาน | ☐ ใช่ [วันที่ที่สะดวก] (ค่าเดินทางนอกราคาอนุมัติ OP-19) |
| ติดป้ายแจ้งก่อนถึงกล้อง (`gate-notice.html`) | ☐ ลูกค้ารับผิดชอบพิมพ์และติดก่อนเริ่มใช้งาน |

### ☐ Crowd (ประมาณความหนาแน่นของคนในงาน `crowd.html`)

| ช่อง | ค่า |
|---|---|
| ชื่องาน/สถานที่ | [ชื่องาน] / [สถานที่] |
| วันที่จัด / จำนวนวัน | [วันที่] / [จำนวนวัน] |
| จำนวนเครื่อง (กล้อง 1 ตัวต่อเครื่อง) | [จำนวน] |
| จำนวนคนสูงสุดโดยประมาณที่คาดว่าจะอยู่ในภาพเดียวช่วงพีค | [จำนวน] (ถ้า **ประมาณ 50 คนขึ้นไป** ขายไม่ได้ ระบบยังไม่เหมาะกับฝูงชนหนาแน่น) |
| ใช้ตัดสินใจเรื่องความปลอดภัยของฝูงชนหรือไม่ | ต้องเป็น "ไม่" ระบบให้ค่าประมาณ ไม่ใช่จำนวนที่แน่นอน |
| ติดป้ายแจ้ง (ป้าย A `camera-notice.html`) ที่ทางเข้าพื้นที่ | ☐ ลูกค้ารับผิดชอบ |

## 4. ไซต์และวันเริ่ม

| ช่อง | ค่า |
|---|---|
| ที่อยู่ไซต์ / ห้อง / ช่องทาง | [รายละเอียด] |
| วันเริ่มใช้งาน | [วัน/เดือน/ปี] |
| ระยะเวลา / วันสิ้นสุด | [ระยะเวลา] / [วัน/เดือน/ปี] |
| วันที่สะดวกสำหรับการเริ่มต้นใช้งานและการฝึกอบรม (ดู `ONBOARDING-*.md`) | [วันที่] |

## 5. ข้อมูลที่ระบบประมวลผล (เพื่อให้ลูกค้าทราบ)

- ภาพจากกล้องประมวลผลบนอุปกรณ์ของลูกค้า ไม่ส่งภาพออกจากอุปกรณ์ ไม่เก็บภาพบุคคล ค่าเริ่มต้นผู้ขายไม่ได้รับข้อมูลใด ๆ
  (`docs/SALES-PACKAGES.md` ข้อความเปิดของส่วน A และ `docs/pdpa/data-map.md`)
- ข้อมูลที่เก็บบนอุปกรณ์: Exam ตัวเลขเหตุการณ์และชื่อผู้คุมสอบ Attendance เวลาลงเวลา Gate ข้อความป้ายทะเบียนและบันทึก Crowd ตัวเลขนับ
- ผู้ขายไม่ขอและไม่รับ: รายชื่อผู้สอบ รายชื่อพนักงาน ภาพใบหน้า ภาพป้ายทะเบียน วิดีโอ ขอเฉพาะข้อมูลในข้อ 1–4

## 6. การประมวลผลข้อมูลส่วนบุคคล (DPA) — ลูกค้ารับทราบ

1. ลูกค้าเป็น **ผู้ควบคุมข้อมูล** ของข้อมูลที่เกิดบนอุปกรณ์ของตน ต้องแจ้งผู้ถูกเก็บข้อมูล (ป้าย ประกาศก่อนสอบ แบบยินยอม) กำหนดระยะเก็บ
   และดูแลการลบ ตามชุดเอกสารใน `docs/pdpa/` และ `docs/DEPLOYMENT-CHECKLIST.md` ข้อ 1
2. ผู้ขายไม่เข้าถึงข้อมูลบนอุปกรณ์โดยค่าเริ่มต้น ผู้ขายจะเป็น **ผู้ประมวลผลข้อมูล** (PDPA ม.40) เมื่อมีการเข้าถึงอุปกรณ์ระยะไกล หรือเมื่อมีการซิงก์ขึ้น
   Cloudflare ในอนาคต ซึ่งต้องมีข้อตกลงประมวลผลข้อมูล (DPA) ก่อนเปิดใช้ (`docs/PDPA-NOTES-FOR-COUNSEL.md` ข้อ E3)
3. **ฉบับร่างข้อตกลง DPA ยังไม่มีเป็นไฟล์** สิ่งที่มีคือสรุปข้อกำหนดผู้ประมวลผล `docs/SUPPORT.md` §5 (ประมวลผลตามคำสั่ง แจ้งเหตุละเมิดภายใน [24 ชม.]
   ลบข้อมูลที่ผู้ขายถืออยู่ภายใน [30 วัน] เมื่อสิ้นสุด ค่าในวงเล็บยังต่อรองได้) และคำถามสำหรับทนายใน `PDPA-NOTES-FOR-COUNSEL.md`
   **[ต้องยืนยัน / to confirm]** ต้องให้ทนายร่าง DPA ก่อนขายครั้งแรก (OP-12, OP-23)
4. ลูกค้า ☐ รับทราบข้อ 1–3 และ ☐ ยอมรับให้ผู้ขายเข้าถึงอุปกรณ์ระยะไกลเฉพาะเมื่อมีผู้แทนลูกค้าอยู่ด้วย (SUPPORT.md §5)

## 7. คำรับทราบเกี่ยวกับการใช้ผลิตภัณฑ์

ลูกค้ารับทราบว่า (ติ๊กทุกข้อ):

- ☐ ทุกการตัดสินใจเกี่ยวกับเงิน สิทธิ์เข้าออก หรือบุคคล คนเป็นผู้ยืนยัน: Exam แจ้งให้ผู้คุมสอบไปดู ไม่ตัดสินทุจริต Gate รปภ. ยืนยันทุกการอ่านป้าย Attendance ผู้จัดการตรวจรายการผิดปกติ
- ☐ ระบบไม่วิเคราะห์อารมณ์ ไม่ตรวจจับการโกหก ไม่ให้คะแนนความน่าสงสัย และไม่ใช้โมเดลอายุ/เพศ/สีหน้าในเวอร์ชันลูกค้า
- ☐ ตัวเลขความแม่นยำเป็นผลจากข้อมูลจำลองหรือชุดข้อมูลสาธารณะตามที่ระบุ ผลหน้างานจริงยังไม่ได้วัด ไม่มีการรับประกันตัวเลข
- ☐ Crowd เหมาะกับฝูงชนเบาบางถึงปานกลาง ไม่ใช้ตัดสินความปลอดภัยของฝูงชน
- ☐ ลูกค้าจัดหาอุปกรณ์ เครือข่าย และไฟฟ้าเอง ผู้ขายไม่ขายอุปกรณ์
- ☐ ค่าบริการชำระโดยโอนผ่านธนาคารตามใบแจ้งหนี้ ไม่มีชำระออนไลน์
- ☐ ข้อกำหนดการใช้บริการ การยกเลิก การคืนเงิน ความรับผิด: [ยังไม่มีเอกสารสำหรับการขาย ต้องยืนยัน / to confirm] (OP-13)

## 8. ลงนาม

| | ผู้ขาย | ลูกค้า |
|---|---|---|
| ชื่อองค์กร | [ชื่อผู้ขาย] (OP-01) | [ชื่อองค์กร] |
| ลงชื่อ | ____________________ | ____________________ |
| ชื่อ ตำแหน่ง | [ ] | [ ] |
| วันที่ | ____________ | ____________ |

---

# English

> **DRAFT 2026-11-11. Not yet checked by a lawyer.** Use it with an accepted quotation (`QUOTATION-TEMPLATE.md`). It asks only for data needed to deliver
> and to issue documents. It does not ask for lists of candidates, employees or number plates. Open points (OP-xx) are in `docs/sales/README.md`.

## 1. Customer organisation (for invoicing and contact)

Organisation name (as registered), tax ID, billing address and head office or branch, type of organisation, authorised signatory (name, position),
quotation number, customer purchase order number (if any).

## 2. Contacts

Project owner (decides), IT / installation contact, personal-data contact (DPO or the person the organisation names), invoice recipient / accounts.
For each: name, e-mail, phone or LINE.

## 3. Products ordered (tick and fill only what applies)

Prices: as in the quoted quotation, excluding 7% VAT. Price stage: [pilot / after pilot] (OP-10).

- **Exam (computer room / online, `exam-lab.html`):** order type (per candidate, monthly per lab, institution licence, free pilot); candidates per exam and
  number of labs; exam level (the pilot kit is for low-stakes exams only); any minors among candidates (if yes, a parental-consent step and counsel's
  confirmation, OP-22); the way to sit the exam without the camera (required). The camera exam hall (`exam-hall.html`) is **experimental and not part of this order**.
- **Attendance (`attendance.html?mode=employee`):** active employees and number of clock-in devices (data stays in each device's browser, about 20 people x 2 years per
  device); PIN / QR is the default; optional face check-in only with individual consent and a PIN / QR alternative, pending the model-licence decision (OP-14);
  optional set-up help; payroll system name and a sample file with no personal data.
- **Gate:** village / condo, car park or 30-day trial; number of lanes (OP-18); the customer's own device per lane; no barrier or relay in this order (a guard
  confirms every read); on-site set-up if wanted (travel is outside the approved prices, OP-19); the customer prints and posts the sign (`gate-notice.html`) before go-live.
- **Crowd:** event name and place; dates and days; number of devices (one camera each); the expected maximum number of people in one view at the peak
  (**about 50 or more cannot be sold**: not yet suitable for dense crowds); not to be used for crowd-safety decisions; the customer posts sign A (`camera-notice.html`).

## 4. Site and start date

Address, room or lane; start date; duration or end date; preferred dates for onboarding and training (see `ONBOARDING-*.md`).

## 5. Data processed (for the customer's information)

Camera images are processed on the customer's device. No image leaves the device and no person image is stored. By default the seller receives no data
(`docs/SALES-PACKAGES.md` opening notes and `docs/pdpa/data-map.md`). Kept on the device: Exam event counts and the invigilator name; Attendance punch times;
Gate plate text and logs; Crowd counts. The seller does not ask for or accept candidate lists, staff lists, face images, plate images or video.

## 6. Data processing (DPA) — customer acknowledges

1. The customer is the **data controller** for data created on its devices. It gives notice to the people recorded (signs, pre-exam notice, consent forms),
   sets retention and runs deletion, using `docs/pdpa/` and `docs/DEPLOYMENT-CHECKLIST.md` section 1.
2. The seller has no access to device data by default. The seller becomes a **processor** (PDPA s.40) when it accesses a device remotely, or when sync to
   Cloudflare exists in future. A data processing agreement is needed before that (`docs/PDPA-NOTES-FOR-COUNSEL.md` E3).
3. **A DPA draft does not exist as a file yet.** What exists is the processor-terms summary in `docs/SUPPORT.md` §5 (process on instructions; breach notice within
   [24 h]; delete held data within [30 days] at the end; bracketed values are negotiable) and the questions for counsel. **[to confirm]** Counsel must draft
   the DPA before the first sale (OP-12, OP-23).
4. The customer ticks: acknowledged items 1–3; and agrees to remote access to its devices only with its representative present (SUPPORT.md §5).

## 7. Acknowledgements about using the product (tick all)

- A person confirms every decision about money, access or a person: Exam points an invigilator to a seat and never decides misconduct; at Gate a guard
  confirms every plate read; in Attendance a manager reviews exceptions.
- No emotion analysis, no lie detection, no suspicion score, and no age / gender / expression models in customer builds.
- Accuracy figures come from synthetic data or public datasets as stated. Field accuracy is not yet measured. No figure is guaranteed.
- Crowd suits sparse and medium crowds and is not used for crowd-safety decisions.
- The customer supplies devices, network and power. The seller sells no hardware.
- Fees are paid by bank transfer against the invoice. There is no online payment.
- Terms of service, cancellation, refund and liability: [no sales document exists yet; to confirm] (OP-13).

## 8. Signatures

Seller (name per OP-01) and customer: signature, name, position, date.

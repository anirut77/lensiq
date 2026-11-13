# LENSIQ Attendance — ลงเวลาพนักงานด้วย PIN / QR (ใบหน้าเป็นตัวเลือก) สำหรับร้านและบริษัทขนาดเล็ก

**ใช้มือถือหรือแท็บเล็ตที่มีอยู่เป็นเครื่องลงเวลา กะ OT วันหยุด และ CSV สำหรับทำเงินเดือน ข้อมูลอยู่บนเครื่องของคุณ**

> **ราคาที่อนุมัติแล้ว (ยังไม่เปิดขาย)** ราคาในเอกสารนี้มาจากรายการราคาที่เจ้าของอนุมัติ 2026-11-09 (`docs/PRICING-RESEARCH.md` §3.4) ยังไม่มีการเก็บเงิน

## ปัญหา
- ร้านและบริษัท 5–20 คนยังลงเวลาด้วยกระดาษหรือ LINE รวมชั่วโมงและ OT ปลายเดือนช้าและผิดง่าย
- เครื่องสแกนใบหน้าราคา 2,699–10,700 บาทต่อเครื่อง และแอปลงเวลาบนคลาวด์ราว 25–60 บาทต่อคนต่อเดือน (`docs/PRICING-RESEARCH.md` §1E–1F)

## สิ่งที่ได้
| ระบบ | ผลลัพธ์ |
|---|---|
| ลงเวลา (`attendance.html` โหมดพนักงาน) | PIN หรือบัตร QR เป็นค่าเริ่มต้น ใบหน้าเป็นตัวเลือกเมื่อพนักงานยินยอม (เก็บค่าใบหน้าเข้ารหัสบนเครื่อง ไม่เก็บภาพ) |
| กะและ OT | กะต่อพนักงาน วันทำงาน วันหยุดนักขัตฤกษ์ ทำงานวันหยุด OT หลังเลิกกะ เตือนสัปดาห์เกิน 48 ชั่วโมง |
| การแก้ไข | ผู้จัดการเพิ่ม/แก้/ยกเลิกการลงเวลาเป็นรายการตรวจสอบย้อนหลัง ไม่แก้ข้อมูลดิบ |
| ส่งออก | CSV สำหรับทำเงินเดือน (หัวคอลัมน์สองภาษา) รายงานรายเดือน |
| หลายจุดลงเวลา | แต่ละเครื่องส่งออกไฟล์ JSON แล้วนำเข้าเครื่องหลัก (ยังไม่มีการซิงก์ผ่านคลาวด์) |

ข้อจำกัดวันนี้ (`docs/ATTENDANCE-READINESS.md`): พื้นที่ในเบราว์เซอร์ราว 20 คน × 2 ปี · ยังไม่มีกะหมุนเวียน / OT ก่อนเข้ากะ ·
ยังไม่มีขออนุมัติลาออนไลน์ · ไม่คำนวณค่าจ้าง ภาษี ประกันสังคม (เป็นงานของระบบเงินเดือน) · เวลาอิงนาฬิกาเครื่อง (เตือนเมื่อถูกตั้งย้อน)

## ความแม่นยำและที่มา

รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)
ตัวเลขใบหน้าใช้เฉพาะเมื่อเปิดตัวเลือกใบหน้า PIN / QR ไม่มีความคลาดเคลื่อนจากการจดจำ

| ข้อกล่าวอ้าง | ค่า | n | ที่มา | เอกสาร |
|---|---|---|---|---|
| ตัวเลขหลัก: ใบหน้าเอเชีย จำได้ต่อการสแกน (ลงทะเบียน 5 / 20 / 200 คน) | 66–76% | n = 500 คน × 5 ภาพ (ชุดทดสอบแยก แต่ไม่ได้ปิดตาสมบูรณ์ ตามที่ `ACCURACY.md` เปิดเผย) | ชุดข้อมูลสาธารณะ (CASIA-FaceV5) | `ACCURACY.md` ข้อ 2 |
| จำผู้ลงทะเบียนได้ต่อการสแกน (ลงทะเบียน 100 คน) วัดบนชุดที่ใช้ปรับค่า ตัวเลขจึงดีเกินจริง | 85% (ชุดที่ใช้ปรับค่า ดีเกินจริง) | n = 610 ภาพทดสอบของสมาชิก (1 ภาพต่อคน; กลุ่มละ 100 คน สุ่ม 200 กลุ่ม) | ชุดข้อมูลสาธารณะ (LFW) | `ACCURACY.md` ข้อ 2 |
| คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อ | ใบหน้าเอเชีย (ชุดทดสอบแยก ลงทะเบียน 100 คน) 0.2% [0.04–0.45%] ขอบบน 95% สูงสุด 1.15% ที่ลงทะเบียน 5 หรือ 200 คน · LFW (ชุดที่ใช้ปรับค่า) 0.4% | n = ประมาณ 12,000 ครั้งต่อแถว (คนต่างกันราว 1,800 / 500 คน) | ชุดข้อมูลสาธารณะ | `ACCURACY.md` ข้อ 2 |
| คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน | ใบหน้าเอเชีย (ชุดทดสอบแยก) ≤ 0.03% · LFW (ชุดที่ใช้ปรับค่า) 0.01–0.07% | n = ประมาณ 12,000 ครั้งต่อแถว (คนต่างกันราว 1,800 / 500 คน) | ชุดข้อมูลสาธารณะ | `ACCURACY.md` ข้อ 2 |
| ตัวเลือกตรวจว่าเป็นคนจริง (หันหน้า) | ยังไม่ได้วัด | — | ยังไม่ได้วัด | `ACCURACY.md` |
| ลงเวลาด้วย PIN / QR | ไม่มีตัวเลขความแม่นยำ (ไม่มีการจดจำ) | — | ไม่เกี่ยวข้อง | `docs/ATTENDANCE-READINESS.md` |
| ที่ทำงานจริงในไทย | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `ACCURACY.md` |

## โครงการนำร่อง
2 สัปดาห์ที่ร้านหรือบริษัท 5–20 คน ตาม `docs/PILOT-PLAN.md` ข้อ 3.2 (ใบหน้าเฉพาะอาสาสมัครที่ยินยอม: รับคนผิด ≤ 1%, ปฏิเสธคนถูก ≤ 10%)
และเทียบ CSV เงินเดือนกับบันทึกเดิมของร้าน 1 รอบเดือน (ชั่วโมงและ OT ตรงกัน) ใช้แท็บ "ตรวจความแม่นยำ" ในหน้าเพื่อวัดกับพนักงานของคุณเอง

## ราคา (ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย — ราคาไม่รวม VAT 7% ลูกค้าชำระราคา + 7%)
| แพ็กเกจ | ช่วงนำร่อง (ตอนนี้) | หลังผ่านเกณฑ์นำร่อง |
|---|---|---|
| ฟรี | ไม่เกิน 5 คน PIN / QR 1 เครื่อง | ไม่เกิน 5 คน |
| มาตรฐาน (กะ OT วันหยุด CSV เงินเดือน ใบหน้าเป็นตัวเลือก) | 19 บาท/คนที่ใช้งาน/เดือน ไม่รวม VAT 7% (ขั้นต่ำ 190 บาท/เดือน ไม่รวม VAT 7%) | 29 บาท/คน/เดือน ไม่รวม VAT 7% (ขั้นต่ำ 290 บาท/เดือน ไม่รวม VAT 7%) |
| ช่วยตั้งค่า (ตารางกะ จับคู่คอลัมน์ CSV เงินเดือน DPIA) | 2,900 บาท ครั้งเดียว ไม่รวม VAT 7% (ไม่บังคับ) | 4,900 บาท ไม่รวม VAT 7% |
| ซิงก์หลายสาขา / สำรองข้อมูลบนคลาวด์ | ยังไม่ขาย (รอระบบบัญชีองค์กร) | ใบเสนอราคา |

ระดับฟรี (ถึง 5 คน) เกินนั้นต้องมีใบอนุญาต ยังไม่บังคับในระบบ ข้อจำกัดเริ่มใช้ตั้งแต่วันที่จะประกาศล่วงหน้าอย่างน้อย 30 วัน เจ้าของบังคับใช้ผ่านสัญญา ข้อจำกัดบนเครื่องผู้ใช้อาจถูกข้ามได้โดยผู้ที่แก้โค้ด สัญญาเป็นสิ่งที่ผูกพัน ลูกค้าส่งออกข้อมูลของตนได้เสมอ ชำระโดยโอนผ่านธนาคารเท่านั้น (เจ้าของตัดสินใจ 2026-11-13)

เทียบตลาด: แอปลงเวลาในไทย 25–60 บาทต่อคนต่อเดือน (TimeMint, แต้มต่อ) หรือเหมา 5,000 บาท/เดือนสำหรับ 1–50 คน (TikTrack) และเครื่องสแกน
2,699–10,700 บาท (`docs/PRICING-RESEARCH.md` §1E–1F) ราคาช่วงนำร่องต่ำกว่า เพราะยังไม่มีซิงก์คลาวด์และยังไม่มีผลวัดที่ทำงานจริง
ราคาตลาดเป็นราคาตามที่แหล่งที่มาแสดง ร้านในไทยมักรวม VAT แล้ว จึงเทียบกับราคา LENSIQ (ไม่รวม VAT) ได้โดยประมาณ ต่างกันราว 7%

## PDPA และกฎหมาย
ใบหน้าเป็นข้อมูลชีวภาพ (PDPA ม.26): ต้องได้ความยินยอมโดยชัดแจ้งและมีทางเลือก PIN / QR เสมอ แบบฟอร์มยินยอม: ป้าย G (`camera-notice.html`)
น้ำหนักโมเดลใบหน้าฝึกจากชุดข้อมูลที่มีเงื่อนไขเพื่อการวิจัย — รอความเห็นทางกฎหมายก่อนขายเชิงพาณิชย์ (`LICENSES/THIRD_PARTY.md`) ข้อความด้านกฎหมายแรงงาน
ให้ทนายแรงงานไทยตรวจ (`docs/ATTENDANCE-READINESS.md`)

**ติดต่อ:** แบบฟอร์ม `index.html?interest=hr#contact` · ชื่อบริษัท อีเมล และ LINE OA จะประกาศก่อนเปิดขาย (`LENSIQ_SELLER`)

> **ต้นฉบับภายใน** (มีชื่อไฟล์ในระบบ) — round 16 ราคาเจ้าของอนุมัติแล้ว 2026-11-09 (ยังไม่เปิดขาย) ข้อความตรวจกับเจ้าของก่อนส่งลูกค้า

---

# English

## LENSIQ Attendance — employee time attendance with PIN / QR (face optional) for small shops and companies

It uses a phone or tablet you already have, and includes shifts, OT, holidays and a payroll CSV. The data stays on your
device. **Approved price list (not on sale yet)**: prices approved by the owner 2026-11-09 (`docs/PRICING-RESEARCH.md`
§3.4); nothing is charged yet.

**What you get:**
- **Check-in:** PIN or QR badge by default. Face check-in is optional, with the employee's consent (an encrypted face
  descriptor on the device, no photos).
- **Shifts and pay rules:** shifts, holidays, rest-day work and OT after the shift, with a warning when a week goes over
  48 hours.
- **Corrections:** audited manager corrections; raw punches are never edited.
- **Export:** a bilingual payroll CSV.
- **Several check-in points:** merged by exporting a JSON pack from each device and importing it on the main one.

**Limits today** (`docs/ATTENDANCE-READINESS.md`):
- Browser storage holds about 20 people × 2 years.
- No rotating rosters or early-in OT.
- No online leave approval.
- No wage, tax or social-security calculation.
- The time comes from the device clock (a clock set back is warned about).

## Accuracy and source

The face figures apply only when face check-in is switched on. PIN / QR involves no recognition error.

| Claim | Value | n | Source | Document |
|---|---|---|---|---|
| Headline: Asian faces recognised per scan (5 / 20 / 200 enrolled) | 66–76% | n = 500 people × 5 photos (held out, not perfectly blind: `ACCURACY.md` disclosure) | public dataset (CASIA-FaceV5) | `ACCURACY.md` §2 |
| Enrolled person recognised per scan, 100 enrolled, measured on the tuning set | 85% (tuning set, optimistic) | n = 610 member probe photos (one per member; 100 per group, 200 random groups) | public dataset (LFW) | `ACCURACY.md` §2 |
| Stranger offered a name | Asian (held out, 100 enrolled) 0.2% [0.04–0.45%], upper 95% bound up to 1.15% at 5 or 200 enrolled; LFW (tuning set) 0.4% | n = about 12,000 stranger visits per row (about 1,800 / 500 different people) | public dataset | `ACCURACY.md` §2 |
| Stranger checked in with no confirmation | Asian (held out) ≤ 0.03%; LFW (tuning set) 0.01–0.07% | n = about 12,000 per row | public dataset | `ACCURACY.md` §2 |
| Liveness (head-turn) option | not measured | — | not measured | `ACCURACY.md` |
| PIN / QR check-in | no accuracy figure (no recognition) | — | not applicable | `docs/ATTENDANCE-READINESS.md` |
| A real Thai workplace | not measured | — | field: not measured (no pilot yet) | `ACCURACY.md` |

**Pilot:**
- 2 weeks at a shop or company with 5–20 staff (`docs/PILOT-PLAN.md` §3.2).
- Face check-in only with consenting volunteers: false accept ≤ 1%, false reject ≤ 10%.
- One month's payroll CSV is compared with the shop's own records (hours and OT must match).

**Price (approved price list, not on sale yet; excl. 7% VAT, so the customer pays the price + 7%):**

| Package | Pilot stage (now) | After pilot |
|---|---|---|
| Free | up to 5 people, PIN / QR, 1 device | up to 5 people |
| Standard | 19 THB per active person / month excl. 7% VAT (minimum 190 THB / month excl. 7% VAT) | 29 THB per person / month excl. 7% VAT (minimum 290 THB / month excl. 7% VAT) |
| Set-up help | 2,900 THB one-off excl. 7% VAT (optional) | 4,900 THB excl. 7% VAT |
| Multi-branch sync / cloud backup | not sold (waits for organisation accounts) | quotation |

Beyond 5 people a licence is needed. This is not enforced in the product yet: the limit applies from a date to be announced at least 30 days ahead, and the owner enforces it by contract. A limit on the user's device can be bypassed by someone who edits the code; the contract is what binds. Customers can always export their data. Payment is by bank transfer only (owner decision 2026-11-13).

Market comparison (`docs/PRICING-RESEARCH.md` §1E–1F):
- Thai cloud apps: 25–60 THB per user per month, or a 5,000 THB / month flat fee for 1–50 staff.
- Scanners: 2,699–10,700 THB.

Market prices are as the sources show them. Thai shop prices are usually VAT-inclusive, so the comparison with LENSIQ
prices (excl. VAT) is approximate by about 7%.

**PDPA and licences:**
- A face is biometric data (PDPA s.26). It needs explicit consent, and PIN / QR is always offered as an alternative.
- The face-model weights come from research-only data. A legal opinion is pending before commercial sale.

**Contact:** `index.html?interest=hr#contact`.

> **Internal copy** (contains file names). Round 16. Prices approved by the owner 2026-11-09 (not on sale yet); the text is checked with the owner before it goes to customers.

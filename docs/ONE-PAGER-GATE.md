# LENSIQ Gate — ผู้ช่วย รปภ. อ่านป้ายทะเบียนไทย สำหรับหมู่บ้าน คอนโด และลานจอดรถ

**ใช้มือถือ โน้ตบุ๊ก หรือกล้องที่มีอยู่ ไม่ต้องซื้อกล้อง LPR ราคาหลายหมื่น ระบบเสนอเลขป้าย รปภ. ยืนยันทุกคัน**

> **อ่านป้ายแบบช่วย รปภ.**: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ตัวเลขละเอียดอยู่ในเอกสารเทคนิค (`docs/tech-sheets/gate-TH.md`)

> **ราคาที่อนุมัติแล้ว (ยังไม่เปิดขาย)** ราคาในเอกสารนี้มาจากรายการราคาที่เจ้าของอนุมัติ 2026-11-09 (`docs/PRICING-RESEARCH.md` §3.2) ยังไม่มีการเก็บเงิน

## ปัญหา
- รปภ. จดเลขทะเบียนด้วยมือ ช้า อ่านผิด ตรวจย้อนหลังยาก
- กล้องอ่านป้ายทะเบียน (LPR) ราคาเริ่ม 29,900 บาท (กล้องอย่างเดียว) กล้องติดกับไม้กั้นที่มีอยู่ 55,000 บาท และชุดไม้กั้นพร้อมกล้อง 85,000 บาท (ราคาปกติ 115,000) ต่อช่องทาง (ราคาประกาศของร้านในไทย `docs/PRICING-RESEARCH.md` §1A) แพงเกินไปสำหรับหมู่บ้านเล็กและลานจอดรายย่อย

## สิ่งที่ได้
| ระบบ | ผลลัพธ์ |
|---|---|
| หมู่บ้าน / คอนโด (`village.html`) | รถลูกบ้าน บัตรผ่านผู้มาติดต่อ รายการเฝ้าระวัง (ต้องบันทึกเหตุผล) แจ้งเตือน บันทึกเข้าออก |
| ลานจอดรถ (`parking.html`) | คิดค่าจอด ตราประทับร้านค้า QR พร้อมเพย์ ใบเสร็จ ปิดกะ |
| ตรวจว่าเป็นป้ายก่อนอ่านอัตโนมัติ | อ่านอัตโนมัติเฉพาะกรอบที่ดูเหมือนป้ายทะเบียนไทย (สัดส่วน จำนวนบรรทัด รูปแบบอักษรไทยกับตัวเลข) ป้ายร้าน ป้ายบ้านเลขที่ ไม่ถูกอ่านอัตโนมัติ รปภ. แตะกรอบป้ายหรือพิมพ์เองได้เสมอ |
| ทดสอบหน้างาน | เมนูในหน้า Gate นับอ่านถูก/ผิด/ต้องแตะ แยกกลางวันกลางคืน |

ไม่ทำ: ไม่จดจำใบหน้า ไม่ถ่ายผู้ขับขี่โดยเจตนา ไม่เปิดไม้กั้นเองโดยไม่มีคนยืนยัน (รีเลย์เป็นตัวเลือกที่ต้องติดตั้งแยก)

## ใช้ทำอะไร และข้อจำกัดสำคัญ

อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน เจ้าหน้าที่ยืนยันทุกคันก่อนเปิดไม้กั้นหรือคิดเงิน
ภาพจากกล้องจริงส่วนใหญ่ยังต้องให้เจ้าหน้าที่แตะเลือกป้ายหรือแก้เลข ป้ายเอียง มืด สกปรก หรือป้ายมอเตอร์ไซค์อาจอ่านผิด

เอกสารเทคนิคขอได้จากฝ่ายขาย

## โครงการนำร่อง
ขั้น 0: ภาพมือถือของเจ้าของ ~100 ภาพ (`tools/plate-field-eval.mjs`) → ขั้น 1: ลานจอด 1 + หมู่บ้าน 1 อย่างน้อย 5 วัน ≥ 200 การอ่านจริง
เกณฑ์ที่เสนอ: อ่านถูก ≥ 95% กลางวัน ≥ 85% กลางคืน ไม่มีค่าผิดที่บันทึกโดยไม่มีใครเห็น วิธีตัดสินและการรายงานค่าเฉลี่ยคู่กันอยู่ใน `docs/pilot/PILOT-GATE.md` §5 (เจ้าของตัดสินใจแล้ว 2026-11-09) แผนและเช็กลิสต์: `docs/pilot/PILOT-GATE.md` §5

## ราคา (ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย — ราคาไม่รวม VAT 7% ลูกค้าชำระราคา + 7% ไม่รวมอุปกรณ์)
| แพ็กเกจ | ราคานำร่อง (ใช้ตอนนี้) | ราคาปกติหลังผ่านเกณฑ์นำร่อง |
|---|---|---|
| ทดลองใช้ | ทดลองใช้ฟรี 30 วัน: 1 ช่องทาง อ่านได้ 100 ครั้ง/วัน เก็บบันทึก 7 วัน (เกินนี้ต้องมีใบอนุญาต) | ทดลองใช้ฟรี 30 วัน: 1 ช่องทาง อ่านได้ 100 ครั้ง/วัน เก็บบันทึก 7 วัน (เกินนี้ต้องมีใบอนุญาต) |
| หมู่บ้าน / คอนโด | 490 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% | 990 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% · 1,990 บาท/เดือน (3 ช่องทาง) ไม่รวม VAT 7% |
| ลานจอดรถ (รวมพร้อมเพย์ ใบเสร็จ ปิดกะ ไม่มีค่าเสริม) | 790 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% | 1,490 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% |
| ติดตั้งหน้างาน (มุมกล้อง แสง ทดสอบหน้างานร่วมกัน) | 2,500 บาท/ครั้ง ไม่รวม VAT 7% | 3,000–5,000 บาท/ครั้ง ไม่รวม VAT 7% |

ระดับทดลองยังไม่บังคับในระบบ ข้อจำกัดเริ่มใช้ตั้งแต่วันที่จะประกาศล่วงหน้าอย่างน้อย 30 วัน เจ้าของบังคับใช้ผ่านสัญญา ข้อจำกัดบนเครื่องผู้ใช้อาจถูกข้ามได้โดยผู้ที่แก้โค้ด สัญญาเป็นสิ่งที่ผูกพัน ลูกค้าส่งออกข้อมูลของตนได้เสมอ ชำระโดยโอนผ่านธนาคารเท่านั้น (เจ้าของตัดสินใจ 2026-11-13)

เทียบตลาด (ซื้อขาด): กล้อง LPR อย่างเดียว 29,900 บาทขึ้นไป กล้องติดกับไม้กั้นที่มีอยู่ 55,000 บาท ชุดไม้กั้นพร้อมกล้อง 85,000 บาท (ราคาปกติ 115,000) ระบบแลกบัตรผู้มาติดต่อเริ่ม
300 บาท/เดือน (แหล่งที่มาและวันที่ใน `docs/PRICING-RESEARCH.md` §1A–1B) ราคานำร่องต่ำกว่า เพราะยังไม่มีผลทดสอบหน้างานจริง
ราคาตลาดเป็นราคาตามที่แหล่งที่มาแสดง ร้านในไทยมักรวม VAT แล้ว จึงเทียบกับราคา LENSIQ (ไม่รวม VAT) ได้โดยประมาณ ต่างกันราว 7%

## PDPA
ป้ายทะเบียนที่เชื่อมกับบุคคลเป็นข้อมูลส่วนบุคคล ติดป้าย `gate-notice.html` ก่อนถึงกล้อง ประกาศความเป็นส่วนตัว (ฐานกฎหมายรอที่ปรึกษายืนยัน)
ภาพป้ายปิดเป็นค่าเริ่มต้น บันทึกเก็บ 90 วัน รายการเฝ้าระวังต้องมีเหตุผล ข้อมูลอยู่บนเครื่องของไซต์

**ติดต่อ:** แบบฟอร์ม `index.html?interest=security#contact` · ชื่อบริษัท อีเมล และ LINE OA จะประกาศก่อนเปิดขาย (`LENSIQ_SELLER`)

> **ต้นฉบับภายใน** (มีชื่อไฟล์ในระบบ) — round 16 ราคาเจ้าของอนุมัติแล้ว 2026-11-09 (ยังไม่เปิดขาย) ข้อความตรวจกับเจ้าของก่อนส่งลูกค้า

---

# English

## LENSIQ Gate — a guard's assistant for Thai licence plates (villages, condos, car parks)

It uses a phone, a laptop or an existing camera, with no LPR camera to buy. The system suggests the plate and the
guard confirms every vehicle. **Approved price list (not on sale yet)**: prices approved by the owner 2026-11-09
(`docs/PRICING-RESEARCH.md` §3.2); nothing is charged yet.

> **Assisted reading**: the system suggests the plate and the guard taps to confirm every vehicle. It is not fully automatic until a plate finder trained on Thai plates exists. The detailed figures are in the technical sheet (`docs/tech-sheets/gate-EN.md`).

**What you get:**
- **Village / condo** (`village.html`): resident cars, visitor passes, a watch list (each entry needs a reason),
  alerts and a log.
- **Car park** (`parking.html`): fees, shop stamps, PromptPay QR, receipts and shift close.
- **Plate-likeness check before any auto-read:** shop signs and house numbers are not read automatically, and the guard
  can always tap or type.
- **On-site test:** right / wrong / tap counts, day and night.

**Never:** face recognition, or opening the barrier without a person confirming.

## What it is for and its main limits

Reads Thai licence plates on the device for car parks and villages. Staff confirm every car before the barrier opens or a fee is charged.
On real camera images most cars still need staff to tap the plate or correct the number; tilted, dark, dirty or motorcycle plates may be misread.

The technical sheet is available from sales on request.

**Pilot:** two phases (`docs/pilot/PILOT-GATE.md`).
- Phase 0: about 100 of the owner's phone photos.
- Phase 1: 1 car park and 1 village for at least 5 days and at least 200 reads.
- Proposed targets: ≥ 95% exact reads by day and ≥ 85% at night, and 0 silent wrong saves. How they are judged, with the plain average always shown next to it, is in `docs/pilot/PILOT-GATE.md` §5 (owner decision, 2026-11-09).

**Price (approved price list, not on sale yet; excl. 7% VAT, so the customer pays the price + 7%; hardware not included):**

| Package | Pilot price (now) | Regular price after the pilot thresholds are met |
|---|---|---|
| Trial | free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days (beyond it a licence is needed) | free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days (beyond it a licence is needed) |
| Village / condo | 490 THB / month per lane excl. 7% VAT | 990 THB / month per lane excl. 7% VAT; 1,990 THB / month for 3 lanes excl. 7% VAT |
| Car park (PromptPay, receipts and shift close included, no add-on) | 790 THB / month per lane excl. 7% VAT | 1,490 THB / month per lane excl. 7% VAT |
| Set-up visit | 2,500 THB per visit excl. 7% VAT | 3,000–5,000 THB per visit excl. 7% VAT |

The trial limits are not enforced in the product yet: they apply from a date to be announced at least 30 days ahead, and the owner enforces them by contract. A limit on the user's device can be bypassed by someone who edits the code; the contract is what binds. Customers can always export their data. Payment is by bank transfer only (owner decision 2026-11-13).

Market comparison (`docs/PRICING-RESEARCH.md` §1A–1B):
- LPR camera only: from 29,900 THB one-off.
- Camera fitted to an existing barrier: 55,000 THB one-off.
- Full barrier kit with camera: 85,000 THB one-off (list 115,000).
- Visitor-pass software: from 300 THB / month.

Market prices are as the sources show them. Thai shop prices are usually VAT-inclusive, so the comparison with LENSIQ
prices (excl. VAT) is approximate by about 7%.

**Contact:** `index.html?interest=security#contact`.

> **Internal copy** (contains file names). Round 16. Prices approved by the owner 2026-11-09 (not on sale yet); the text is checked with the owner before it goes to customers.

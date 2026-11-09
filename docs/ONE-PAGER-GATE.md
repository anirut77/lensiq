# LENSIQ Gate — ผู้ช่วย รปภ. อ่านป้ายทะเบียนไทย สำหรับหมู่บ้าน คอนโด และลานจอดรถ

**ใช้มือถือ โน้ตบุ๊ก หรือกล้องที่มีอยู่ ไม่ต้องซื้อกล้อง LPR ราคาหลายหมื่น ระบบเสนอเลขป้าย รปภ. ยืนยันทุกคัน**

> **อ่านป้ายแบบช่วย รปภ.**: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ผลกับภาพถ่ายจริง 51 ภาพ (ชุดข้อมูลสาธารณะ Wikimedia Commons): อ่านถูกทั้งป้ายโดยไม่ต้องแตะ 32% (7 / 22 · n = 22 · บางภาพอยู่ในชุดที่ใช้ปรับค่า จึงดีเกินจริง) และต้องแตะเลือกกรอบป้าย 78% (25 / 32 · n = 32) (`docs/GATE.md` §3c)

> **ฉบับร่าง (DRAFT) — ราคาและเนื้อหารอเจ้าของอนุมัติ** ราคาในเอกสารนี้มาจาก `docs/PRICING-RESEARCH.md` §3.2 ยังไม่เปิดขาย

## ปัญหา
- รปภ. จดเลขทะเบียนด้วยมือ ช้า อ่านผิด ตรวจย้อนหลังยาก
- กล้องอ่านป้ายทะเบียน (LPR) ราคาเริ่ม 29,900 บาท (กล้องอย่างเดียว) กล้องติดกับไม้กั้นที่มีอยู่ 55,000 บาท และชุดไม้กั้นพร้อมกล้อง 85,000 บาท (ราคาปกติ 115,000) ต่อช่องทาง (ราคาประกาศของร้านในไทย `docs/PRICING-RESEARCH.md` §1A) แพงเกินไปสำหรับหมู่บ้านเล็กและลานจอดรายย่อย

## สิ่งที่ได้
| ระบบ | ผลลัพธ์ |
|---|---|
| หมู่บ้าน / คอนโด (`village.html`) | รถลูกบ้าน บัตรผ่านผู้มาติดต่อ รายการเฝ้าระวัง (ต้องบันทึกเหตุผล) แจ้งเตือน บันทึกเข้าออก |
| ลานจอดรถ (`parking.html`) | คิดค่าจอด ตราประทับร้านค้า QR พร้อมเพย์ ใบเสร็จ ปิดกะ |
| ตรวจว่าเป็นป้ายก่อนอ่านอัตโนมัติ | อ่านอัตโนมัติเฉพาะกรอบที่ดูเหมือนป้ายทะเบียนไทย (สัดส่วน จำนวนบรรทัด รูปแบบอักษรไทยกับตัวเลข) ป้ายร้าน ป้ายบ้านเลขที่ ไม่ถูกอ่านอัตโนมัติ รปภ. แตะกรอบป้ายหรือพิมพ์เองได้เสมอ |
| ตรวจความแม่นยำหน้างาน | เมนูในหน้า Gate นับอ่านถูก/ผิด/ต้องแตะ แยกกลางวันกลางคืน พร้อมช่วงความเชื่อมั่น 95% |

ไม่ทำ: ไม่จดจำใบหน้า ไม่ถ่ายผู้ขับขี่โดยเจตนา ไม่เปิดไม้กั้นเองโดยไม่มีคนยืนยัน (รีเลย์เป็นตัวเลือกที่ต้องติดตั้งแยก)

## ความแม่นยำและที่มา

รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)

| ข้อกล่าวอ้าง | ค่า | n | ที่มา | เอกสาร |
|---|---|---|---|---|
| หาป้ายเจอ (กรอบแรก) ชุดเดโมที่ไม่ได้ใช้ปรับแต่ง | 97.1% (136 / 140) | n = 140 ฉาก (20 ต่อประเภท) | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3b |
| อ่านถูกทั้งป้ายจากภาพเดียว | 58% (81 / 140) | n = 140 ฉาก | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3b |
| ฉากที่ไม่มีป้ายถูกอ่านอัตโนมัติ | 0 / 20 | n = 20 ฉาก | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง กรอบแรกอยู่บนป้าย | 41% (13 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ (Wikimedia Commons) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง อ่านอัตโนมัติถูกทั้งป้าย | 32% (7 / 22); นับภาพที่ไม่แน่ใจอีก 1 ภาพ: 30% (7 / 23) | n = 22 ภาพที่อ่านป้ายได้แน่นอน (12 ภาพใช้ปรับการตรวจว่าเป็นป้าย จึงมองในแง่ดี) | ชุดข้อมูลสาธารณะ (Wikimedia Commons) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง ต้องแตะกรอบเอง | 78% (25 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ (Wikimedia Commons) | `docs/GATE.md` §3c |
| ภาพถ่ายจริงที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ | 0 / 19 (ก่อนมีการตรวจว่าเป็นป้าย 3 / 19; ช่วง 95%: 0–17%; ภาพที่ไม่ได้ใช้ปรับ 0 / 9: 0–30%) | n = 19 ภาพ | ชุดข้อมูลสาธารณะ (Wikimedia Commons) | `docs/GATE.md` §3c |
| ภาพมือถือของเจ้าของ (~100 ภาพ) | ยังไม่ได้วัด | — | หน้างานจริง (ภาพของเจ้าของ): ยังไม่ได้วัด | `docs/field-pilot/plates-photo-labels.md` |
| ลานจอดหรือหมู่บ้านจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `docs/pilot/PILOT-GATE.md` |

อ่านอย่างตรงไปตรงมา: บนภาพจริงวันนี้ รปภ. ยังต้องแตะกรอบป้ายเองเกือบ 4 ใน 5 คัน ระบบจึงขายเป็น "ผู้ช่วย รปภ." ไม่ใช่ไม้กั้นอัตโนมัติ

## โครงการนำร่อง
ขั้น 0: ภาพมือถือของเจ้าของ ~100 ภาพ (`tools/plate-field-eval.mjs`) → ขั้น 1: ลานจอด 1 + หมู่บ้าน 1 อย่างน้อย 5 วัน ≥ 200 การอ่านจริง
เกณฑ์ที่เสนอ: อ่านถูก ≥ 95% กลางวัน ≥ 85% กลางคืน ไม่มีค่าผิดที่บันทึกโดยไม่มีใครเห็น ตัดสินด้วยขอบล่าง Wilson 95% (เจ้าของตัดสินใจแล้ว 2026-11-09) และรายงานค่าเฉลี่ยธรรมดา (อ่านถูก k / n) คู่กันเสมอ — ที่จำนวนตัวอย่างตามแผน ต้องอ่านถูกจริงราว 98.8% กลางวัน และ 97.5% กลางคืน แผนและเช็กลิสต์: `docs/pilot/PILOT-GATE.md` §5

## ราคา (ฉบับร่าง รอเจ้าของอนุมัติ — ยังไม่เปิดขาย ราคาไม่รวม VAT 7% ลูกค้าชำระราคา + 7% ไม่รวมอุปกรณ์)
| แพ็กเกจ | ช่วงนำร่อง (ตอนนี้) | หลังผ่านเกณฑ์นำร่อง |
|---|---|---|
| ทดลองใช้ | ทดลองใช้ฟรี 30 วัน: 1 ช่องทาง อ่านได้ 100 ครั้ง/วัน เก็บบันทึก 7 วัน | ทดลองใช้ฟรี 30 วัน: 1 ช่องทาง อ่านได้ 100 ครั้ง/วัน เก็บบันทึก 7 วัน |
| หมู่บ้าน / คอนโด | 490 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% | 990 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% · 1,990 บาท/เดือน (3 ช่องทาง) ไม่รวม VAT 7% |
| ลานจอดรถ | 790 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% | 1,490 บาท/เดือน/ช่องทาง ไม่รวม VAT 7% |
| ติดตั้งหน้างาน (มุมกล้อง แสง ตรวจความแม่นยำร่วมกัน) | 2,500 บาท/ครั้ง ไม่รวม VAT 7% | 3,000–5,000 บาท/ครั้ง ไม่รวม VAT 7% |

เทียบตลาด (ซื้อขาด): กล้อง LPR อย่างเดียว 29,900 บาทขึ้นไป กล้องติดกับไม้กั้นที่มีอยู่ 55,000 บาท ชุดไม้กั้นพร้อมกล้อง 85,000 บาท (ราคาปกติ 115,000) ระบบแลกบัตรผู้มาติดต่อเริ่ม
300 บาท/เดือน (แหล่งที่มาและวันที่ใน `docs/PRICING-RESEARCH.md` §1A–1B) ราคาช่วงนำร่องต่ำกว่า เพราะยังไม่มีผลวัดหน้างานจริง
ราคาตลาดเป็นราคาตามที่แหล่งที่มาแสดง ร้านในไทยมักรวม VAT แล้ว จึงเทียบกับราคา LENSIQ (ไม่รวม VAT) ได้โดยประมาณ ต่างกันราว 7%

## PDPA
ป้ายทะเบียนที่เชื่อมกับบุคคลเป็นข้อมูลส่วนบุคคล ติดป้าย `gate-notice.html` ก่อนถึงกล้อง ประกาศความเป็นส่วนตัว (ฐานกฎหมายรอที่ปรึกษายืนยัน)
ภาพป้ายปิดเป็นค่าเริ่มต้น บันทึกเก็บ 90 วัน รายการเฝ้าระวังต้องมีเหตุผล ข้อมูลอยู่บนเครื่องของไซต์

**ติดต่อ:** แบบฟอร์ม `index.html?interest=security#contact` · ชื่อบริษัท อีเมล และ LINE OA จะประกาศก่อนเปิดขาย (`LENSIQ_SELLER`)

> **ต้นฉบับภายใน** (มีชื่อไฟล์ในระบบ) — ฉบับร่าง round 16 ราคาและข้อความรอเจ้าของอนุมัติก่อนส่งลูกค้า

---

# English

## LENSIQ Gate — a guard's assistant for Thai licence plates (villages, condos, car parks)

It uses a phone, a laptop or an existing camera, with no LPR camera to buy. The system suggests the plate and the
guard confirms every vehicle. **DRAFT: prices and text await owner approval** (`docs/PRICING-RESEARCH.md` §3.2, not on
sale).

> **Assisted reading**: the system suggests the plate and the guard taps to confirm every vehicle. It is not fully automatic until a plate finder trained on Thai plates exists. On 51 real photos (public dataset, Wikimedia Commons): exact read with no tap 32% (7 / 22 · n = 22 · some photos are in the tuning set, so this is optimistic); a tap to pick the plate was needed in 78% (25 / 32 · n = 32) (`docs/GATE.md` §3c)

**What you get:**
- **Village / condo** (`village.html`): resident cars, visitor passes, a watch list (each entry needs a reason),
  alerts and a log.
- **Car park** (`parking.html`): fees, shop stamps, PromptPay QR, receipts and shift close.
- **Plate-likeness check before any auto-read:** shop signs and house numbers are not read automatically, and the guard
  can always tap or type.
- **On-site accuracy check:** right / wrong / tap counts, day and night, with 95% intervals.

**Never:** face recognition, or opening the barrier without a person confirming.

## Accuracy and source

| Claim | Value | n | Source | Document |
|---|---|---|---|---|
| Plate found (top box), demo set not used for tuning | 97.1% (136 / 140) | n = 140 scenes | synthetic (demo set, seed 7) | `docs/GATE.md` §3b |
| Exact read from one frame | 58% (81 / 140) | n = 140 scenes | synthetic | `docs/GATE.md` §3b |
| Plate-less scenes auto-read | 0 / 20 | n = 20 scenes | synthetic | `docs/GATE.md` §3c |
| Real photos, top box on the plate | 41% (13 / 32) | n = 32 photos with a plate | public dataset (Wikimedia Commons) | `docs/GATE.md` §3c |
| Real photos, exact automatic read | 32% (7 / 22); 30% (7 / 23) with one "unsure" photo counted | n = 22 (12 of them used for tuning, so optimistic) | public dataset | `docs/GATE.md` §3c |
| Real photos, taps needed | 78% (25 / 32) | n = 32 | public dataset | `docs/GATE.md` §3c |
| Real photos without a plate read automatically | 0 / 19 (3 / 19 before the check; 95% interval 0–17%; held-out half 0 / 9, 0–30%) | n = 19 | public dataset | `docs/GATE.md` §3c |
| Owner's ~100 phone photos | not measured | — | field (owner photos): not measured | `docs/field-pilot/plates-photo-labels.md` |
| Real car park or village | not measured | — | field: not measured (no pilot yet) | `docs/pilot/PILOT-GATE.md` |

Read plainly: on real photos today the guard still taps almost 4 in 5 plates, so Gate is sold as a guard's assistant,
not as an automatic barrier.

**Pilot:** two phases (`docs/pilot/PILOT-GATE.md`).
- Phase 0: about 100 of the owner's phone photos.
- Phase 1: 1 car park and 1 village for at least 5 days and at least 200 reads.
- Proposed targets: ≥ 95% exact reads by day and ≥ 85% at night, and 0 silent wrong saves. Judged on the Wilson 95%
  lower bound (owner decision, 2026-11-09), with the plain average (exact reads, k / n) always shown next to it. At the
  planned sample sizes this needs about 98.8% observed by day and 97.5% at night (`docs/pilot/PILOT-GATE.md` §5).

**Price (DRAFT, awaiting owner approval; excl. 7% VAT, so the customer pays the price + 7%; hardware not included):**

| Package | Pilot stage (now) | After pilot |
|---|---|---|
| Trial | free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days | free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days |
| Village / condo | 490 THB / month per lane excl. 7% VAT | 990 THB / month per lane excl. 7% VAT; 1,990 THB / month for 3 lanes excl. 7% VAT |
| Car park | 790 THB / month per lane excl. 7% VAT | 1,490 THB / month per lane excl. 7% VAT |
| Set-up visit | 2,500 THB per visit excl. 7% VAT | 3,000–5,000 THB per visit excl. 7% VAT |

Market comparison (`docs/PRICING-RESEARCH.md` §1A–1B):
- LPR camera only: from 29,900 THB one-off.
- Camera fitted to an existing barrier: 55,000 THB one-off.
- Full barrier kit with camera: 85,000 THB one-off (list 115,000).
- Visitor-pass software: from 300 THB / month.

Market prices are as the sources show them. Thai shop prices are usually VAT-inclusive, so the comparison with LENSIQ
prices (excl. VAT) is approximate by about 7%.

**Contact:** `index.html?interest=security#contact`.

> **Internal draft** (contains file names). Round 16. Prices and text await owner approval before they go to customers.

# ชุดนำร่องภาคสนาม: LENSIQ Gate (ลานจอดรถ / หมู่บ้าน / คอนโด) / Field pilot kit: LENSIQ Gate

> **สถานะ:** ฉบับร่าง round 16 (2026-11-09) ตามแผนทั่วไปใน [`docs/FIELD-PILOT.md`](../FIELD-PILOT.md) และ
> [`docs/PILOT-PLAN.md`](../PILOT-PLAN.md) เกณฑ์ทุกข้อเป็น **ข้อเสนอให้เจ้าของปรับ** ไม่ใช่มาตรฐานอุตสาหกรรม
> **Status:** round 16 draft. Thresholds are a **proposal for the owner**, not industry standards. English: second half.

ใช้เครื่องมือของ item 7 (round 16): **การตรวจว่าเป็นป้ายก่อนอ่านอัตโนมัติ** (`LQPlate.plateGuard`, `docs/GATE.md` §3c) และ
**ชุดภาพป้ายของเจ้าของ** (`tools/plate-field-eval.mjs`, `docs/field-pilot/plates-photo-labels.md`)

---

# ภาษาไทย

## 1. เป้าหมาย

วัดว่า LENSIQ Gate ช่วย รปภ. ที่ป้อม/ไม้กั้นจริงได้แค่ไหน: อ่านป้ายอัตโนมัติถูกทั้งป้ายกี่เปอร์เซ็นต์ (กลางวัน / กลางคืน)
ต้องแตะกรอบป้ายเองบ่อยแค่ไหน และ **ไม่มีค่าผิดถูกบันทึกโดยไม่มีใครเห็น (silent wrong save = 0)** ระบบยังเป็น "ข้อเสนอให้ รปภ.
ยืนยัน" ทุกครั้ง โครงการนำร่องนี้ไม่ข้ามหรือปิดขั้นตอนยืนยันใด ๆ และไม่ต่อรีเลย์เปิดไม้กั้นอัตโนมัติ

ตัวเลขที่มีวันนี้ (ยังไม่ใช่หน้างานจริง):

| สิ่งที่วัด | ค่า | n | ที่มา |
|---|---|---|---|
| อ่านอัตโนมัติถูกทั้งป้าย | 32% (7 / 22) | n = 22 ภาพ | ชุดข้อมูลสาธารณะ (Wikimedia Commons; 12 ภาพใช้ปรับค่า) |
| ต้องแตะกรอบเอง | 78% (25 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ |
| ภาพไม่มีป้ายแต่ถูกอ่านอัตโนมัติ | 0 / 19 (ช่วง 95%: 0–17%; ภาพที่ไม่ได้ใช้ปรับ 0 / 8: 0–32%) | n = 19 ภาพ | ชุดข้อมูลสาธารณะ |
| อ่านถูกจากภาพเดียว | 58% (81 / 140) | n = 140 ฉาก | ข้อมูลจำลอง (seed 7) |
| ลานจอด / หมู่บ้านจริง | ยังไม่ได้วัด | — | หน้างานจริง |

## 2. สองขั้นตอน

| ขั้น | ที่ไหน | ใครทำ | ใช้เวลา | ผลที่ได้ |
|---|---|---|---|---|
| **ขั้น 0: ภาพถ่ายของเจ้าของ** | นอกไซต์ (ถนน ลานจอดสาธารณะ) | เจ้าของ | 1–2 วัน ถ่าย + 2–3 ชม. กรอกแผ่นป้ายกำกับ | ตัวเลข "field (owner photos)" แยกตามประเภทป้าย ก่อนไปไซต์ |
| **ขั้น 1: ไซต์นำร่อง** | ลานจอด 1 แห่ง + หมู่บ้าน/คอนโด 1 แห่ง | รปภ. + ผู้บันทึกค่าจริง + หัวหน้าภาคสนาม | ≥ 5 วันต่อไซต์ (วันธรรมดา + วันหยุด เช้า/เย็น/กลางคืน) | ≥ 200 การอ่านจริง เทียบเกณฑ์ §5 |

### ขั้น 0: ชุดภาพของเจ้าของ (ทำก่อนไปไซต์)

1. ถ่ายภาพป้ายจริงด้วยมือถือประมาณ 100 ภาพ ตาม `docs/field-pilot/plates-photo-labels.md` ข้อ 1 (ทุกประเภทอย่างน้อย 10 ภาพ:
   `white yellow green red blue moto night graphic other` และภาพ **ไม่มีป้าย** อย่างน้อย 15 ภาพ `none`)
2. iPhone: ตั้ง การตั้งค่า > กล้อง > รูปแบบ > "เข้ากันได้มากที่สุด" ก่อนถ่าย (HEIC ไม่ถูกนับ เครื่องมือจะแสดงว่า "convert to JPEG first")
3. วางภาพใน `~/LENSIQ-field/plates/` (นอก repo) คัดลอกแผ่น `docs/field-pilot/plates-photo-labels.csv` ไปไว้ในโฟลเดอร์ภาพแล้วกรอกที่นั่น
   (**ห้ามกรอกในไฟล์ต้นแบบใน `docs/`** เครื่องมือจะไม่ยอมอ่าน)
4. แบ่งครึ่ง: ใส่ `split` = `dev` / `heldout` สลับกันในแต่ละประเภท **ก่อนรันครั้งแรก** ห้ามแก้ป้ายกำกับหลังเห็นผล ถ้าจำเป็นต้องแก้
   ให้จดไว้ในคอลัมน์ `notes` ว่าแก้เมื่อไรและทำไม (เหมือนกรณี w07 ใน `docs/GATE.md` §3c)
5. รัน `node tools/plate-field-eval.mjs --split heldout --out ~/LENSIQ-field/result-heldout.json` และ `--split all`
6. ส่งตารางผล (ตัวเลขเท่านั้น ไม่ส่งภาพ ไม่ส่งเลขทะเบียน) กลับให้ทีม

**ไปขั้น 1 ได้เมื่อ:** ภาพ `none` ถูกอ่านอัตโนมัติ = 0 (จากอย่างน้อย 15 ภาพ) และไม่มีประเภทใดที่ "อ่านอัตโนมัติผิดตัวอักษร"
เกิน 10% ถ้าไม่ผ่าน ให้ทีมแก้ก่อน (ปรับ/เพิ่ม ไม่ลบฟีเจอร์) ตัวเลขขั้น 0 **ไม่ใช่** ผลหน้างานจริงของไซต์ เพราะเป็นภาพมือถือ ไม่ใช่กล้องที่ป้อม

### ขั้น 1: ไซต์นำร่อง (ตาม `docs/FIELD-PILOT.md` §2–§6)

| วัน | งาน | ผลที่ได้ |
|---|---|---|
| −7 ถึง −1 | ขออนุญาตนิติบุคคล/เจ้าของลานจอด ลงนามสัญญานำร่อง (`docs/pilot/AGREEMENT-TH.md`) สำรวจจุดติดกล้อง ทำ DPIA เพิ่มเติม (`docs/pdpa/DPIA-template.md`) พิมพ์ป้าย `gate-notice.html` | สัญญา แบบสำรวจไซต์ ป้ายติดแล้ว |
| 1 | ติดตั้งอุปกรณ์ (§3) ตั้งค่า ช่องทาง ผู้ปฏิบัติงานยอมรับประกาศ ทดลอง 1 ชม. | บันทึกการตั้งค่า |
| 1 | อบรม รปภ. 30 นาที: ยืนยัน/แก้ทุกค่า แตะกรอบป้ายเมื่อระบบขึ้น "ไม่เหมือนป้าย" พิมพ์เองได้เสมอ | รายชื่อผู้ผ่านการอบรม |
| 2–6 | ใช้งานจริงทุกวัน ช่วงสุ่ม 30 นาที × 3 ช่วง/วัน (เช้า เย็น กลางคืน) ผู้บันทึกค่าจริงจดเลขจากตัวรถ **โดยไม่ดูหน้าจอ** | `plates.csv` ต่อวัน |
| ทุกวัน | เปิดเมนู "ตรวจความแม่นยำ" ในหน้า Gate บันทึกผลรวมวัน (กลางวัน/กลางคืน/แตะ) | ภาพหน้าจอตัวเลข (ไม่มีป้าย) |
| 7 | รวม CSV รัน `node tools/field-pilot-metrics.mjs --plates plates.csv --lower-bound --strict` | ตารางผลพร้อม Wilson 95% |
| 8 | ประชุมสรุปผลกับไซต์ เซ็นแบบสรุปผล (§6) | ผลลงนาม |
| ≤ 30 วันหลังรายงาน | ลบภาพและ CSV ที่มีเลขทะเบียน บันทึกการลบ | บันทึกการลบ |

## 3. สิ่งที่เจ้าของต้องเตรียมที่ไซต์

| รายการ | รายละเอียด | ใครจัดหา |
|---|---|---|
| ไซต์ 2 แห่ง | ลานจอด 1 + หมู่บ้าน/คอนโด 1 มีรถผ่านอย่างน้อย ~40 คัน/วัน มีป้อม/จุดจอดให้รถหยุด | เจ้าของ (ติดต่อ) |
| หนังสืออนุญาต | จากนิติบุคคลหมู่บ้าน/อาคารชุด หรือเจ้าของลานจอด ระบุวัน เวลา และว่าจะเก็บภาพป้ายเพื่อทดสอบ | ไซต์ |
| อุปกรณ์ต่อช่องทาง | มือถือ Android/iPhone หรือโน้ตบุ๊ก + กล้อง 1080p, ขาตั้ง/ตัวยึดแน่น, สายไฟ/พาวเวอร์แบงก์, ที่บังแดด | เจ้าของ |
| ตำแหน่งกล้อง | ป้ายกว้าง ≥ 120 px ในภาพ (มอเตอร์ไซค์ ≥ 160 px) สูง 1–1.5 ม. ห่าง 3–6 ม. ก่อนไม้กั้น มุม ≤ 30° (`docs/GATE.md` §4) | ทีม + เจ้าของ |
| แสงกลางคืน | ไฟส่องป้าย หรือไฟ IR 850 nm ใกล้เลนส์ ทดสอบก่อนคืนแรก | เจ้าของ |
| รปภ. | ผู้ปฏิบัติงานตามปกติ อย่างน้อย 2 คน (กะกลางวัน/กลางคืน) อบรม 30 นาที | ไซต์ |
| ผู้บันทึกค่าจริง | คนที่สอง 1 คนต่อช่วงสุ่ม อ่านเลขจากตัวรถ ไม่ดูหน้าจอ | เจ้าของ |
| ป้ายแจ้ง PDPA | `gate-notice.html` (TH/EN) ติดก่อนถึงกล้อง + ป้าย E (`camera-notice.html`) ถ้าเก็บภาพระหว่างนำร่อง | เจ้าของพิมพ์ |
| ที่เก็บข้อมูล | ไดรฟ์เข้ารหัส (FileVault/BitLocker/VeraCrypt) สำหรับภาพและ CSV ที่มีเลขทะเบียน รายชื่อผู้เข้าถึง | เจ้าของ |
| ไม่ต้องมี | ไม้กั้น/รีเลย์ (ไม่ต่อในโครงการนี้) อินเทอร์เน็ต (ใช้ได้แบบออฟไลน์หลังโหลดครั้งแรก) | — |

## 4. เช็กลิสต์

ก่อนวันแรก
- [ ] ขั้น 0 ผ่าน (ภาพ `none` อ่านอัตโนมัติ = 0) และส่งตารางผลแล้ว
- [ ] สัญญานำร่องลงนาม หนังสืออนุญาตจากไซต์
- [ ] DPIA เพิ่มเติม + บันทึก ROPA ฐานกฎหมายให้ที่ปรึกษายืนยัน
- [ ] ป้าย `gate-notice.html` ติดก่อนถึงกล้อง (และป้าย E ถ้าเก็บภาพ)
- [ ] ตำแหน่งกล้อง: ป้ายกว้าง ≥ 120 px (ดูจากภาพทดสอบ) ความเร็วชัตเตอร์ ≤ 1/500 s ถ้าตั้งได้
- [ ] สำเนา `docs/field-pilot/plates-template.csv` ไว้ในไดรฟ์เข้ารหัส (ลบ 2 แถวตัวอย่าง)

ทุกวัน
- [ ] ช่วงสุ่ม 3 ช่วง บันทึก **ทุกคัน** ที่ผ่าน (ไม่เลือกป้ายง่าย) แท็กเงื่อนไขตาม `docs/FIELD-PILOT.md` §2.1
- [ ] กรอก `tapped` = 1 เมื่อ รปภ. ต้องแตะกรอบหรือพิมพ์เอง และ `guard_edited` เมื่อแก้ค่า
- [ ] บันทึกครั้งที่หน้าจอขึ้น "ไม่เหมือนป้ายทะเบียน" ในคอลัมน์ `notes` (ตรวจว่าการตรวจว่าเป็นป้ายบล็อกป้ายจริงบ่อยแค่ไหน)
- [ ] รถคันเดิมนับไม่เกิน 3 ครั้ง

หลังจบ
- [ ] รัน `tools/field-pilot-metrics.mjs --lower-bound --strict` และแนบผล
- [ ] กรอกแบบสรุปผล §6 ลงนามทั้งสองฝ่าย
- [ ] ลบภาพ/CSV ภายใน 30 วัน บันทึกการลบ ตัวเลขสรุป (ไม่มีเลขทะเบียน) เพิ่มใน `docs/FIELD-PILOT.md` "Status per round" และ `ACCURACY.md`

## 5. ตัวชี้วัดและเป้า (ข้อเสนอ)

**วิธีตัดสิน (เจ้าของตัดสินใจแล้ว 2026-11-09):** เป้าที่เป็นอัตราตัดสินด้วย**ขอบล่าง Wilson 95%** (อัตราที่ต้อง "ต่ำ" เช่น ต้องแตะกรอบเอง
ใช้**ขอบบน** Wilson 95%) และตารางผลต้องแสดง**ค่าเฉลี่ยธรรมดา** (อัตราที่เห็นจริง k / n) คู่กับขอบที่ใช้ตัดสินเสมอ
`node tools/field-pilot-metrics.mjs --plates plates.csv --lower-bound` พิมพ์ทั้งสองค่าในตาราง THRESHOLDS (คอลัมน์ "judged value" กับ
"observed (k/n)") และใน `--json` (`value`, `basis`, `observed`, `x`, `n`) ตัวเลขเป้าด้านล่างยังเป็นข้อเสนอ

| ตัวชี้วัด | เป้า | ตัดสินด้วย |
|---|---|---|
| จำนวนการอ่าน | ≥ 200 (กลางคืน ≥ 40, มอเตอร์ไซค์ ≥ 30) | นับแถว |
| อ่านถูกทั้งป้าย กลางวันแสงดี | ≥ 95% | ขอบล่าง Wilson 95% (`--lower-bound`) |
| อ่านถูกทั้งป้าย กลางคืน | ≥ 85% | ขอบล่าง Wilson 95% |
| Silent wrong save | **0** | นับ |
| ต้องแตะกรอบเอง กลางวันแสงดี | ≤ 10% | ขอบบน Wilson 95% |
| อ่านอัตโนมัติบนสิ่งที่ไม่ใช่ป้าย (ป้ายร้าน ป้ายบ้าน ฯลฯ) | 0 ครั้งที่ถูกบันทึก | นับจาก `notes` + `saved_value` |
| ป้ายจริงที่ถูกบล็อกว่า "ไม่เหมือนป้าย" | รายงาน (ไม่มีเกณฑ์รอบแรก) | นับจาก `notes` |
| เวลาจนกดยืนยัน | รายงานค่ามัธยฐาน | `confirm_s` |

**สิ่งที่เกณฑ์ขอบล่าง Wilson แปลว่าในทางปฏิบัติ** — ขอบล่างต้องถึงเป้า จึงต้องอ่านถูกจริงสูงกว่าเป้ามาก
เมื่อ n น้อย คำนวณด้วย Wilson 95% (z = 1.96) ด้วยสคริปต์ node บรรทัดเดียว:

| เป้า | n ที่วางแผน | ต้องอ่านถูกอย่างน้อย (ค่าที่เห็นจริง) | ถ้าเพิ่ม n |
|---|---|---|---|
| กลางวัน ≥ 95% | ≈ 160 (200 − กลางคืน 40) | 158 / 160 = **98.8%** | 197 / 200 = 98.5% · 293 / 300 = 97.7% · 389 / 400 = 97.3% |
| กลางคืน ≥ 85% | 40 (ขั้นต่ำ) | 39 / 40 = **97.5%** | 57 / 60 = 95.0% · 75 / 80 = 93.8% · 110 / 120 = 91.7% · 180 / 200 = 90.0% |
| ต้องแตะ กลางวัน ≤ 10% (ขอบบน) | ≈ 160 | แตะได้ไม่เกิน 8 / 160 = **5.0%** | 11 / 200 = 5.5% |

ที่ n = 40 เกณฑ์กลางคืนจึง**เข้มกว่า**กลางวัน และวันนี้ภาพถ่ายสาธารณะอ่านอัตโนมัติถูก 32% (n = 22, `docs/GATE.md` §3c)
เก็บการอ่านกลางคืนมากกว่าขั้นต่ำ 40 ครั้งทำให้ค่าที่ต้องเห็นจริงลดลง (คอลัมน์ "ถ้าเพิ่ม n") วิธีตัดสินนี้กำหนดไว้**ก่อน**เริ่มขั้น 1
และไม่เปลี่ยนหลังเห็นผล

ตัวอย่างแถวในตารางผล (ตัวเลขสมมติ): `อ่านถูก กลางคืน · ค่าที่ใช้ตัดสิน 87.1% (ขอบล่าง Wilson 95%) · ค่าเฉลี่ยธรรมดา 97.5% (39 / 40) · เป้า ≥ 85% · ผ่าน`

ผลลัพธ์: **ผ่าน** = ทุกข้อผ่าน → ใช้ราคา "หลังนำร่อง" ใน `docs/PRICING-RESEARCH.md` ได้ · **ผ่านแบบมีเงื่อนไข** = กลางวันผ่าน
กลางคืนไม่ผ่าน → ใช้เฉพาะกลางวัน หรือ รปภ. ตรวจทุกคันกลางคืน · **ไม่ผ่าน** = ทำต่อในรอบถัดไป (เช่น โมเดลหาป้ายที่ฝึกกับป้ายไทย)

## 6. แบบฟอร์มและแผ่นบันทึกที่ใช้

| แผ่น | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| แผ่นป้ายกำกับภาพของเจ้าของ | `docs/field-pilot/plates-photo-labels.csv` (สำเนาไปไว้นอก repo) | ขั้น 0 |
| วิธีถ่ายและกรอก | `docs/field-pilot/plates-photo-labels.md` | ขั้น 0 |
| บันทึกการอ่านที่ไซต์ | `docs/field-pilot/plates-template.csv` | ขั้น 1 ทุกช่วงสุ่ม |
| คำนวณผล | `tools/field-pilot-metrics.mjs`, `tools/plate-field-eval.mjs` | ขั้น 0 / ขั้น 1 |
| สัญญานำร่อง | `docs/pilot/AGREEMENT-TH.md` | ก่อนเริ่ม |
| ป้ายแจ้ง | `gate-notice.html`, `camera-notice.html` (ป้าย E) | ก่อนเริ่ม |
| สรุปผล (กรอกตารางข้างล่าง แนบท้าย `docs/pilot/RESULTS-FORM.md`) | — | วันที่ 8 |

ตารางสรุปผล Gate (คัดลอกไปกรอก):

| ตัวชี้วัด | ค่าที่ใช้ตัดสิน (ขอบ Wilson 95%) | ค่าเฉลี่ยธรรมดา (k / n) | เป้า | สถานะ |
|---|---|---|---|---|
| ขั้น 0: อ่านอัตโนมัติถูก (held-out) | [ ] | [ ] / [ ] ภาพ | รายงาน | |
| ขั้น 0: ภาพ `none` ถูกอ่านอัตโนมัติ | [ ] | [ ] / [ ] ภาพ | 0 | |
| อ่านถูก กลางวันแสงดี | [ ] | [ ] / [ ] คัน | ≥ 95% (ขอบล่าง) | |
| อ่านถูก กลางคืน | [ ] | [ ] / [ ] คัน | ≥ 85% (ขอบล่าง) | |
| Silent wrong save | — (นับจำนวน) | [ ] / [ ] คัน | 0 | |
| ต้องแตะเอง กลางวัน | [ ] | [ ] / [ ] คัน | ≤ 10% (ขอบบน) | |

## 7. PDPA และข้อห้าม

- ป้ายทะเบียนที่เชื่อมกับบุคคลได้เป็นข้อมูลส่วนบุคคล ภาพและ CSV ไม่เข้า repo ไม่อัปโหลด ลบภายใน 30 วันหลังรายงาน
- ไม่ทำการจดจำใบหน้า ไม่ถ่ายผู้ขับขี่โดยเจตนา ไม่อนุมานพฤติกรรม/อารมณ์
- รปภ. ยืนยันทุกการอ่าน ไม่ต่อรีเลย์เปิดไม้กั้นอัตโนมัติในโครงการนี้

---

# English

## 1. Goal

Measure how well LENSIQ Gate helps a guard at a real gate: the exact automatic read rate (day / night), how often the
guard has to tap the plate, and **no wrong value saved without anyone noticing (silent wrong saves = 0)**. Every read is
still a suggestion that the guard confirms. This pilot skips no confirmation step and does not wire the barrier relay.

Today's numbers (not field yet):

| What | Value | n | Source |
|---|---|---|---|
| Exact automatic read | 32% (7 / 22) | n = 22 photos | public dataset (Wikimedia Commons; 12 used for tuning) |
| Taps needed | 78% (25 / 32) | n = 32 photos with a plate | public dataset |
| Photos without a plate read automatically | 0 / 19 (95% interval 0–17%; held-out half 0 / 8: 0–32%) | n = 19 photos | public dataset |
| Exact read from one frame | 58% (81 / 140) | n = 140 scenes | synthetic (seed 7) |
| Real car park / village | not measured | — | field |

## 2. Two phases

| Phase | Where | Who | Time | Output |
|---|---|---|---|---|
| **Phase 0: owner photos** | off-site (streets, public car parks) | owner | 1–2 days shooting + 2–3 h labelling | "field (owner photos)" numbers per plate category, before any site |
| **Phase 1: pilot sites** | 1 car park + 1 village / condo | guards + truth recorder + field lead | ≥ 5 days per site (weekday + weekend, morning / evening / night) | ≥ 200 real reads against §5 |

**Phase 0.** About 100 phone photos per `docs/field-pilot/plates-photo-labels.md` (≥ 10 per category and ≥ 15 photos
**without** a plate). iPhone: Settings > Camera > Formats > Most Compatible before shooting. Photos in
`~/LENSIQ-field/plates/` (outside the repo). Copy the labelling sheet there and fill it in there (never in `docs/`). Set the
`dev` / `heldout` split per category **before the first run**. Do not change labels after seeing results; if one must
change, note when and why in `notes` (as for w07 in `docs/GATE.md` §3c). Run
`node tools/plate-field-eval.mjs --split heldout --out ~/LENSIQ-field/result-heldout.json` and `--split all`. Send back the
tables only (no photos, no plate numbers).
**Go to phase 1 when:** 0 automatic reads on the `none` photos (of ≥ 15) and no category above 10 % wrong-text automatic
reads. Phase-0 numbers are **not** the site's field result (phone photos, not the gate camera).

**Phase 1 schedule.**
- Days −7 to −1: site permission, pilot agreement, site survey, DPIA addendum, signs.
- Day 1: install, then a 30-minute guard briefing.
- Days 2–6: three random 30-minute windows per day (morning / evening / night). The truth recorder writes the plate
  from the vehicle without looking at the screen.
- Day 7: run `node tools/field-pilot-metrics.mjs --plates plates.csv --lower-bound --strict`.
- Day 8: sign the results.
- Within 30 days of the report: delete the photos and CSVs and log the deletion.

## 3. What the owner prepares on site

- **Sites:** 2 sites (1 car park and 1 village or condo), each with about 40+ vehicles a day and a stop point.
- **Permission:** written permission from the juristic person or car-park owner. It names the dates and says that plate
  photos are kept for the test.
- **Equipment per lane:** a phone or laptop with a 1080p camera, a rigid mount, power and a sun hood.
- **Camera placement:** the plate must be at least 120 px wide in the frame (160 px for motorcycles). Mount the camera
  1–1.5 m high, 3–6 m before the barrier, at an angle of 30° or less (`docs/GATE.md` §4).
- **Night:** plate lighting or an 850 nm IR lamp near the lens, tested before the first night.
- **People:** at least 2 trained guards (day and night shifts), plus 1 truth recorder per window.
- **Signs:** `gate-notice.html` posted before the camera, plus sign E (`camera-notice.html`) if photos are kept during
  the pilot.
- **Storage:** an encrypted drive for photos and CSVs, with a list of the people who have access.
- **Not needed:** a barrier relay (it is not wired in this pilot) or internet (the pages work offline after the first
  load).

## 4. Checklist

**Before day 1**
- [ ] Phase 0 passed and its tables sent.
- [ ] Agreement and site permission signed.
- [ ] DPIA addendum and ROPA entry done (counsel confirms the legal basis).
- [ ] Signs posted.
- [ ] Camera placement checked: plate at least 120 px wide on a test frame.
- [ ] Copy of `plates-template.csv` on the encrypted drive, with the example rows deleted.

**Every day**
- [ ] Record **every** vehicle in each window, with condition tags (FIELD-PILOT §2.1).
- [ ] Fill in `tapped` and `guard_edited`.
- [ ] Note each "does not look like a plate" status in `notes`.
- [ ] Count the same vehicle at most 3 times.

**After**
- [ ] Run the metrics script and attach the output.
- [ ] Sign the results table.
- [ ] Delete the photos and CSVs within 30 days.
- [ ] Add the aggregates (no plate text) to FIELD-PILOT "Status per round" and to `ACCURACY.md`.

## 5. Metrics and targets (proposal)

**How targets are judged (owner decision, 2026-11-09):** a rate target is judged on the **Wilson 95% lower bound** (the
**upper** bound for a rate that must stay low, such as taps needed). The results table always shows the **plain
average** (the observed rate, k / n) next to the bound it is judged on. `node tools/field-pilot-metrics.mjs --plates
plates.csv --lower-bound` prints both in the THRESHOLDS table (columns "judged value" and "observed (k/n)") and in
`--json` (`value`, `basis`, `observed`, `x`, `n`). The target numbers below are still a proposal.

| Metric | Target | Judged on |
|---|---|---|
| Reads | ≥ 200 (night ≥ 40, motorcycle ≥ 30) | count |
| Exact read, good light | ≥ 95% | Wilson 95% lower bound |
| Exact read, night | ≥ 85% | Wilson 95% lower bound |
| Silent wrong saves | **0** | count |
| Taps needed, good light | ≤ 10% | Wilson 95% upper bound |
| Automatic read of a non-plate saved | 0 | count (`notes`, `saved_value`) |
| Real plates blocked as "does not look like a plate" | report | count (`notes`) |
| Time to confirm | report median | `confirm_s` |

**What the Wilson lower-bound rule means in practice.** The lower bound must reach the target, so at
small n the observed rate has to be far above it. Computed with Wilson 95% (z = 1.96) in a node one-liner:

| Target | Planned n | Observed rate needed | With more reads |
|---|---|---|---|
| Day ≥ 95% | ≈ 160 (200 minus 40 night) | 158 / 160 = **98.8%** | 197 / 200 = 98.5% · 293 / 300 = 97.7% · 389 / 400 = 97.3% |
| Night ≥ 85% | 40 (minimum) | 39 / 40 = **97.5%** | 57 / 60 = 95.0% · 75 / 80 = 93.8% · 110 / 120 = 91.7% · 180 / 200 = 90.0% |
| Taps needed, day ≤ 10% (upper bound) | ≈ 160 | at most 8 / 160 = **5.0%** | 11 / 200 = 5.5% |

At n = 40 the night target is therefore **stricter** than the day target. Today's exact automatic read on public
photos is 32% (n = 22, `docs/GATE.md` §3c). Collecting more night reads than the minimum of 40 lowers the observed
rate needed (the "with more reads" column). This rule is fixed **before** phase 1 starts and not changed after results.

Example results row (made-up numbers): `exact read, night · judged value 87.1% (Wilson 95% lower) · plain average 97.5%
(39 / 40) · target ≥ 85% · PASS`

- **Accept:** every metric passes. The "after pilot" price in `docs/PRICING-RESEARCH.md` may then apply.
- **Conditional:** day passes and night fails. Use the system by day only, or have the guard check every night read.
- **Reject:** next-round work, for example a plate detector trained on Thai plates.

## 6. Sheets

- **Phase 0:** `docs/field-pilot/plates-photo-labels.csv` and `.md`.
- **Phase 1:** `docs/field-pilot/plates-template.csv`.
- **Tools:** `tools/plate-field-eval.mjs` and `tools/field-pilot-metrics.mjs`.
- **Agreement:** `docs/pilot/AGREEMENT-TH.md`.
- **Signs:** `gate-notice.html` and `camera-notice.html`.
- **Results:** fill in this table and attach it to `docs/pilot/RESULTS-FORM.md`:

| Measure | Judged value (Wilson 95% bound) | Plain average (k / n) | Target | Status |
|---|---|---|---|---|
| Phase 0: exact automatic read (held-out) | [ ] | [ ] / [ ] photos | report | |
| Phase 0: `none` photos read automatically | [ ] | [ ] / [ ] photos | 0 | |
| Exact read, good light | [ ] | [ ] / [ ] vehicles | ≥ 95% (lower bound) | |
| Exact read, night | [ ] | [ ] / [ ] vehicles | ≥ 85% (lower bound) | |
| Silent wrong save | — (count) | [ ] / [ ] vehicles | 0 | |
| Taps needed, good light | [ ] | [ ] / [ ] vehicles | ≤ 10% (upper bound) | |

## 7. PDPA and never-do

- Plates are personal data. Photos and CSVs never enter the repo, are never uploaded, and are deleted within 30 days.
- No face recognition, and drivers are not photographed on purpose.
- No behaviour or emotion inference.
- The guard confirms every read. There is no automatic barrier opening in this pilot.

# แผนทดสอบภาคสนาม — ป้ายทะเบียน (LENSIQ Gate) และกล่องยา (medicine.html) / Field pilot test plan — plates and medicine boxes

> เอกสารนี้ปรับปรุงทุก round (ดู "Changelog / last reviewed" และ "Status per round" ท้ายเอกสาร)
> This document is maintained every round (see "Changelog / last reviewed" and "Status per round" at the end).
>
> **ราคาระหว่างนำร่อง (เจ้าของอนุมัติ 9 พ.ย. 2569; ป้ายราคาตัดสิน 13 พ.ย. 2569):** ระหว่างนำร่องใช้ "ราคานำร่อง" และนำร่อง Exam ฟรี "ราคาปกติหลังผ่านเกณฑ์นำร่อง" ใช้เมื่อหน้างานผ่านเกณฑ์ในชุดนำร่องเท่านั้น (`docs/PRICING-RESEARCH.md` §3)
> **Pilot pricing (owner approved 2026-11-09; labels decided 2026-11-13):** the "pilot price" applies during pilots and the Exam field pilot is free;
> the "regular price after the pilot thresholds are met" applies only once a site passes its pilot kit thresholds (`docs/PRICING-RESEARCH.md` §3).
> Product Check (round 17) has its own photo-set protocol: `docs/product-check/PHOTO-SET-PROTOCOL.md`.

ไฟล์ที่เกี่ยวข้อง / Related files:

| ไฟล์ / File | หน้าที่ / Purpose |
|---|---|
| [`docs/field-pilot/plates-template.csv`](field-pilot/plates-template.csv) | แบบบันทึกการอ่านป้ายทะเบียน / plate read log (2 synthetic example rows — delete before use) |
| [`docs/field-pilot/medicine-template.csv`](field-pilot/medicine-template.csv) | แบบบันทึกกล่องยา / medicine box log (2 synthetic example rows — delete before use) |
| `tools/field-pilot-metrics.mjs` | คำนวณตัวชี้วัด + เทียบเกณฑ์ / computes the metrics and compares them with the thresholds |
| `tests/unit/field-pilot-metrics.test.js` | unit tests of the tool |
| [`docs/GATE.md`](GATE.md), [`docs/MEDICINE.md`](MEDICINE.md) | วิธีอ่านของระบบ / how the products read |
| [`docs/PILOT-PLAN.md`](PILOT-PLAN.md), [`docs/pdpa/`](pdpa/) | ชุดนำร่องทั่วไป + PDPA / general pilot kit + PDPA documents |
| [`docs/pilot/PILOT-GATE.md`](pilot/PILOT-GATE.md), [`PILOT-EXAM.md`](pilot/PILOT-EXAM.md), [`PILOT-CROWD.md`](pilot/PILOT-CROWD.md) | ชุดนำร่องรายผลิตภัณฑ์ (รอบ 16) / per-product pilot kits (round 16) |
| `tools/plate-field-eval.mjs`, [`docs/field-pilot/plates-photo-labels.md`](field-pilot/plates-photo-labels.md) | ระยะ 0 ของ Gate: ภาพถ่ายป้ายจากโทรศัพท์ของเจ้าของ (~100 ภาพ เก็บนอก repo) / Gate phase 0: the owner's ~100 phone photos (kept outside the repo) |

---

# ภาษาไทย

## 1. เป้าหมาย

วัดความแม่นยำ **จริงหน้างาน** ของการอ่านป้ายทะเบียน (LENSIQ Gate: `parking.html`, `village.html`) และการอ่านเลขทะเบียนยา /
เลขที่ผลิต / วันหมดอายุบนกล่องยา (`medicine.html`) เทียบกับค่าจริงที่คนตรวจ ปัจจุบัน **ยังไม่มีตัวเลขความแม่นยำจากหน้างานจริง**
(e2e ทดสอบเพียงป้ายและฉลากสังเคราะห์) ผลจากแผนนี้จะเป็นตัวตัดสินว่าฟีเจอร์ใดเปิดใช้โดยไม่ต้องให้คนตรวจทุกครั้งได้หรือยัง
ระบบยังคงเป็น "ข้อเสนอให้คนยืนยัน" (human-in-the-loop) เสมอ — แผนนี้ไม่ได้ลบหรือข้ามขั้นตอนยืนยันใด ๆ

## 2. ขนาดตัวอย่างและเงื่อนไข

### 2.1 ป้ายทะเบียน — อย่างน้อย 200 การอ่านจริง

ทุกการอ่านติดแท็กเงื่อนไข (คอลัมน์ `conditions` คั่นด้วย `;`) ใช้ชื่อแท็กตามตารางนี้ให้ตรงกันทุกไซต์:

| แท็ก | เงื่อนไข | ขั้นต่ำที่แนะนำ |
|---|---|---|
| `day` | กลางวัน แสงดี | 80 |
| `night` | กลางคืน (18:00–06:00 หรือภาพมืด) | 40 |
| `rain` | ฝนตก / กระจกเปียก | 15 |
| `backlight` | ย้อนแสง (แดดหลังรถ, ไฟหน้ารถ) | 15 |
| `side-angle` | มุมเอียง > ~30° | 15 |
| `2m` `3m` `4m` `5m` | ระยะกล้อง–ป้าย 2–5 เมตร (ใส่ตัวเลขในคอลัมน์ `distance_m` ด้วย) | ครอบคลุมทุกระยะ |
| `dirty` / `bent` | ป้ายสกปรก / งอ | 15 รวมกัน |
| `motorcycle` | รถจักรยานยนต์ (ป้าย 3 บรรทัด) | 30 |
| `leading-digit` | ป้ายที่มีตัวเลขนำหน้า (เช่น 1กข) | 30 |
| `special-red` `special-green` `special-yellow` `special-graphic` | ป้ายแดง (ป้ายพิเศษผู้ค้า), ป้ายเขียว, ป้ายเหลือง, ป้ายกราฟิก/ประมูล | 5 ต่อชนิด (ถ้ามี) |

### 2.2 กล่องยา — อย่างน้อย 100 กล่องจริง

แท็กที่ใช้: `flat` `curved` (ขวด/หลอด), `glossy-foil` (ฟอยล์มันวาว), `matte`, `small-print` (ตัวอักษรเล็ก), `low-light`,
`good-light`. หลายยี่ห้อ หลายผู้ผลิต (ไม่ควรเกิน 10 กล่องต่อยี่ห้อ) บันทึกทั้ง **เลขทะเบียนยา, เลขที่ผลิต (lot), วันหมดอายุ** —
แต่ละช่องบันทึกค่าที่ OCR อ่านได้เทียบกับค่าจริง

## 3. สิ่งที่บันทึกต่อการอ่าน

**ป้าย** (`plates-template.csv`): `read_id`, วันที่/เวลา, ไซต์, อุปกรณ์, `photo_ref` (ชื่อไฟล์ภาพ — **ภาพเก็บโดยทีมภาคสนามตามความยินยอม
และระยะเวลาเก็บ ห้าม commit ลง repo**), `ocr_result` (ค่าที่ระบบเสนอครั้งแรก), `ground_truth` (ค่าจริงที่คนตรวจจากตัวรถ),
จังหวัดที่อ่านได้/จริง, `saved_value` (ค่าที่บันทึกจริง), `guard_edited` (yes/no — รปภ. แก้ก่อนบันทึกหรือไม่), `confirm_s`
(วินาทีจนกดยืนยัน), `alternatives` (ตัวเลือกอื่นที่หน้าจอเสนอ คั่นด้วย `|`), `tapped` (1/0 — รปภ. ต้องแตะ/ลากกรอบรอบป้ายเอง
เพราะระบบหาป้ายไม่เจอ; เพิ่มใน round 15), `conditions`, `distance_m`, ชนิดรถ, ชนิดป้าย, หมายเหตุ

**ยา** (`medicine-template.csv`): `box_id`, วันที่, ไซต์, อุปกรณ์, `photo_ref`, ยี่ห้อ, `reg_ocr`/`reg_truth`/`reg_edited`,
`lot_ocr`/`lot_truth`/`lot_edited`, `expiry_ocr`/`expiry_truth`/`expiry_edited`, `confirm_s`, `conditions`, หมายเหตุ
(คอลัมน์ `reg_saved` / `lot_saved` / `expiry_saved` ใส่เพิ่มได้ถ้าค่าที่บันทึกต่างจากที่อ่าน)

ค่าจริง (ground truth) ต้องอ่านจาก **ตัวป้าย/ตัวกล่อง** โดยคนที่สอง ไม่ใช่ดูจากหน้าจอ เพื่อไม่ให้ค่าที่ระบบเสนอชี้นำ

## 4. ตัวชี้วัด

คำนวณทั้งภาพรวมและแยกตามแท็กเงื่อนไข พร้อมช่วงความเชื่อมั่น Wilson 95 %:

- **Exact-match rate** — สัดส่วนที่ค่า OCR (หลัง normalise) ตรงกับค่าจริงทุกตัวอักษร ป้ายใช้ `LQPlate.normalize` ของ
  `lensiq-plate.js` (เลขไทย → 0-9, ตัดช่องว่าง/ขีด/จุด); เลขทะเบียนยาใช้ `LQMed.parseThaiReg`
- **CER (character error rate)** — ผลรวม Levenshtein(OCR, จริง) / ผลรวมความยาวค่าจริง
- **Edit rate** — สัดส่วนที่ผู้ใช้แก้ก่อนบันทึก
- **เวลาต่อการอ่าน** — ค่าเฉลี่ยและมัธยฐานของ `confirm_s`
- **Silent wrong saves** — ค่าที่บันทึก ≠ ค่าจริง **และ** ไม่ได้แก้ → **ต้องเป็น 0** (เป็นความเสี่ยงที่ร้ายแรงที่สุด: ค่าผิดเข้าระบบโดยไม่มีใครเห็น)
- (ป้าย) **Alternatives hit** — เมื่อค่าแรกผิด ค่าจริงอยู่ในตัวเลือกอื่นที่เสนอหรือไม่
- (ป้าย) **Taps needed** — สัดส่วนการอ่านที่ รปภ. ต้องแตะกรอบป้ายเอง (คอลัมน์ `tapped`) แยกตามเงื่อนไข พร้อม Wilson 95 %
  แถวที่ช่อง `tapped` ว่างไม่นับ หน้า Gate นับค่านี้ให้อัตโนมัติในเมนูตรวจความแม่นยำ (แยกกลางวัน/กลางคืน) รวมรถที่ระบบอ่านไม่ได้เลย
  แล้ว รปภ. พิมพ์เลขเอง (นับเป็น "ต้องแตะ" แต่ไม่นับในความแม่นยำการอ่าน) ในแบบฟอร์ม CSV ให้กรอก `tapped` = 1 สำหรับรถแบบนี้ด้วย

## 5. เกณฑ์เปิดใช้งาน — **PROPOSAL (ข้อเสนอให้เจ้าของปรับ ไม่ใช่มาตรฐานอุตสาหกรรม)**

| ตัวชี้วัด | เกณฑ์ที่เสนอ |
|---|---|
| ป้าย: จำนวนการอ่าน | ≥ 200 |
| ป้าย (ค่าจอด / เปิดไม้กั้น): exact-match กลางวันแสงดี (`day` ไม่มี `rain`/`backlight`/`night`/`low-light`) | ≥ 95 % |
| ป้าย: exact-match กลางคืน (`night`) | ≥ 85 % |
| ป้าย: silent wrong saves | 0 |
| ป้าย: ต้องแตะกรอบป้ายเอง กลางวันแสงดี (`tapped`, ตรวจเมื่อแถวกลางวันแสงดีมีข้อมูลคอลัมน์นี้) | ≤ 10 % |
| ยา: จำนวนกล่อง | ≥ 100 |
| ยา: exact-match เลขทะเบียนยา — ก่อนฟีเจอร์ใดจะใช้ค่านี้โดยไม่ให้คนตรวจ | ≥ 95 % |
| ยา: silent wrong saves (ทะเบียน + lot + วันหมดอายุ) | 0 |

ค่าเริ่มต้นของสคริปต์ตัดสินที่ค่าประมาณ (point estimate) แต่**นำร่อง Gate ต้องใช้ `--lower-bound` เสมอ** (เจ้าของตัดสิน 2026-11-09; ตารางแสดงค่าเฉลี่ยธรรมดา k / n ข้างขอบ Wilson); `--lower-bound` ตัดสินที่ขอบล่าง Wilson 95 % (เข้มกว่า สอดคล้องกับ site check
ในหน้า Gate ที่ใช้ขอบล่าง; เกณฑ์ที่ต้อง "ต่ำ" เช่น taps ใช้ขอบบน) เจ้าของปรับเกณฑ์ได้ด้วย `--targets targets.json` (ชื่อคีย์ตาม `PROPOSAL` ในสคริปต์)

## 6. แผนการสุ่มตัวอย่าง

- อย่างน้อย 2 ไซต์ (ลานจอด 1 + หมู่บ้าน/คอนโด 1) อย่างน้อย 5 วัน ครอบคลุมวันธรรมดาและวันหยุด ช่วงเช้า/เย็น/กลางคืน
- บันทึก **ทุกคันที่ผ่าน** ในช่วงเวลาที่สุ่มไว้ (เช่น 30 นาทีต่อช่วง) ไม่เลือกเฉพาะป้ายที่อ่านง่าย; เงื่อนไขที่หายาก (ป้ายพิเศษ,
  ฝน) เก็บเพิ่มแบบเจาะจงได้ แต่ติดแท็ก `targeted` เพื่อรายงานแยก
- รถคันเดียวกันนับซ้ำได้ไม่เกิน 3 ครั้ง (ติดหมายเหตุ) เพื่อไม่ให้ป้ายเดียวครองผล
- ยา: สุ่มจากชั้นวางร้านยา/คลังที่ร่วมทดสอบ ไม่เกิน 10 กล่องต่อยี่ห้อ ครอบคลุมทุกแท็กอย่างน้อย 10 กล่อง
- ขนาดตัวอย่างเป็นขั้นต่ำ: ถ้าช่วงความเชื่อมั่นยังคร่อมเกณฑ์ ให้เก็บเพิ่ม (`LQSite.needMoreProp` ใน `lensiq-sitecheck.js`
  ใช้ประมาณจำนวนที่ต้องเก็บเพิ่มได้)

## 7. บทบาท

| บทบาท | หน้าที่ |
|---|---|
| เจ้าของโครงการ (owner) | อนุมัติแผน ปรับเกณฑ์ ตัดสิน go-live |
| หัวหน้าภาคสนาม | ติดป้ายแจ้ง PDPA, ดูแลอุปกรณ์, เก็บภาพตามนโยบาย, รวม CSV |
| ผู้ใช้งาน (รปภ. / เภสัชกร) | ใช้งานตามปกติ ยืนยัน/แก้ค่าที่ระบบเสนอ |
| ผู้บันทึกค่าจริง (คนที่สอง) | อ่านค่าจริงจากตัวป้าย/กล่องโดยไม่ดูหน้าจอ |
| ผู้วิเคราะห์ | รันสคริปต์ ตรวจข้อมูล เขียนรายงานผลต่อ round |
| ผู้ประสานงาน PDPA / ที่ปรึกษากฎหมาย | ตรวจป้ายแจ้ง ฐานกฎหมาย ระยะเวลาเก็บ และการลบ |

## 8. ความยินยอม / ป้ายแจ้ง PDPA (ทำก่อนเริ่มเก็บข้อมูล)

1. ติดป้ายแจ้ง (`gate-notice.html`, ป้าย E ใน `camera-notice.html` สำหรับการบันทึกระหว่างนำร่อง) ก่อนถึงกล้อง
2. เผยแพร่ประกาศความเป็นส่วนตัว ระบุวัตถุประสงค์ "ทดสอบความแม่นยำ" ระยะเวลาเก็บ และช่องทางติดต่อ (ฐานกฎหมายให้ที่ปรึกษายืนยัน)
3. ทำ/ปรับ DPIA (`docs/pdpa/DPIA-template.md`) และบันทึกใน ROPA
4. ร้านยา: ภาพกล่องยาไม่ควรมีชื่อผู้ป่วย/ใบสั่งยา — ถ้ามีให้ปิดก่อนถ่าย หรือไม่ถ่าย
5. ไม่ทำการจดจำใบหน้า ไม่ถ่ายผู้ขับขี่โดยเจตนา

## 9. การจัดการข้อมูล

- **ภาพไม่เข้า repo เด็ดขาด** — `photo_ref` เป็นเพียงชื่อไฟล์อ้างอิง ภาพเก็บในไดรฟ์เข้ารหัสของทีมภาคสนาม ผู้มีสิทธิ์เข้าถึงระบุชื่อ
  ลบเมื่อครบระยะเวลาเก็บ (ตาม `docs/pdpa/retention-table.md`; เสนอ ≤ 30 วันหลังรายงานผล) และบันทึกการลบ
- CSV มีเลขทะเบียนรถจริง = ข้อมูลส่วนบุคคล → เก็บนอก repo เช่นกัน; ใน repo มีเพียงเทมเพลตที่เป็นข้อมูลสังเคราะห์และรายงานสรุปตัวเลข
  (ไม่มีเลขป้ายจริง)
- เปิดไฟล์ด้วยโปรแกรมที่รองรับ UTF-8 (สคริปต์รองรับ BOM ของ Excel)

## 10. วิธีรันสคริปต์

```sh
node tools/field-pilot-metrics.mjs --plates plates.csv --medicine medicine.csv          # ตาราง
node tools/field-pilot-metrics.mjs --plates plates.csv --json > result.json            # JSON
node tools/field-pilot-metrics.mjs --plates plates.csv --medicine medicine.csv --strict # exit 1 ถ้าไม่ผ่านเกณฑ์
node tools/field-pilot-metrics.mjs --plates plates.csv --lower-bound --targets owner-targets.json
```

ไม่มี dependency ไม่ใช้เครือข่าย อ่านเฉพาะข้อความ CSV; exit code 0 = ปกติ, 1 = `--strict` และมีเกณฑ์ไม่ผ่าน, 2 = argument/ไฟล์ผิด

## 11. ผลย้อนกลับเข้าสู่ผลิตภัณฑ์

- ตัวเลขที่วัดได้ (พร้อม CI, n, ไซต์, วันที่) บันทึกใน "Status per round" และใน `ACCURACY.md` /
  `docs/accuracy-figures.json` (ผ่าน `npm run accuracy:sync`) — ข้อความในหน้าเว็บอ้างได้เฉพาะตัวเลขที่วัดแล้ว
- เกณฑ์ที่เจ้าของยืนยันแล้ว → ปรับ `LQPlate.TARGETS` (site check ในหน้า Gate: ปัจจุบัน plate 0.95, char 0.98, ≥100 คัน, ≥30
  กลางคืน) ให้ตรงกับเกณฑ์ใหม่ (เช่น เพิ่มเกณฑ์กลางคืน 0.85) และเพิ่ม site check แบบเดียวกันให้หน้า medicine
- เงื่อนไขที่ตกเกณฑ์ → งานใน round ถัดไป (เช่น ปรับ `trimBorder`/`splitLines` สำหรับป้ายมอเตอร์ไซค์, ตัวเลือกอื่นเพิ่มเติม, คำเตือน
  ย้อนแสงบนหน้าจอ) — แก้ไขเพิ่ม/ปรับ ไม่ลบฟีเจอร์เดิม
- Silent wrong save ทุกกรณี → ตรวจหาสาเหตุ (UI ทำให้กดยืนยันง่ายเกินไป? ตัวอักษรที่คล้ายกันไม่ถูกขีดเส้นใต้?) ก่อน go-live

---

# English

## 1. Goal

Measure the **real on-site** accuracy of plate reading (LENSIQ Gate: `parking.html`, `village.html`) and of reading the drug
registration number / lot number / expiry date on medicine boxes (`medicine.html`) against a human ground truth. Today
there is **no field accuracy figure** (the e2e tests only read synthetic plates and labels). The results decide whether
a feature may rely on a reading without review. The system stays a human-in-the-loop suggestion — this plan removes or
bypasses no confirmation step.

## 2. Sample size and conditions

### 2.1 Plates — at least 200 real reads

Every read carries condition tags (`conditions` column, `;`-separated). Use these tag names at every site:

| Tag | Condition | Suggested minimum |
|---|---|---|
| `day` | daylight, good light | 80 |
| `night` | night (18:00–06:00 or dark frame) | 40 |
| `rain` | rain / wet glass | 15 |
| `backlight` | backlight (sun behind the vehicle, headlights) | 15 |
| `side-angle` | angle > ~30° | 15 |
| `2m` `3m` `4m` `5m` | camera–plate distance 2–5 m (also fill `distance_m`) | cover every distance |
| `dirty` / `bent` | dirty / bent plate | 15 combined |
| `motorcycle` | motorcycle (3-line plate) | 30 |
| `leading-digit` | plate with a leading digit (e.g. 1กข) | 30 |
| `special-red` `special-green` `special-yellow` `special-graphic` | red trade plate, green, yellow, graphic / auction plate | 5 each (if available) |

### 2.2 Medicine boxes — at least 100 real boxes

Tags: `flat`, `curved` (bottles / tubes), `glossy-foil`, `matte`, `small-print`, `low-light`, `good-light`. Many brands and
manufacturers (≤ 10 boxes per brand). Record the **registration number, lot number and expiry date** — each OCR value
against the truth.

## 3. What is recorded per read

**Plates** (`plates-template.csv`): `read_id`, date / time, site, device, `photo_ref` (file name only — **photos are kept by
the field team under the consent / retention rules and are never committed to the repo**), `ocr_result` (the system's
first suggestion), `ground_truth` (read from the vehicle by a person), province read / truth, `saved_value`,
`guard_edited` (yes/no), `confirm_s` (seconds to confirm), `alternatives` (other candidates shown, `|`-separated),
`tapped` (1/0: the guard had to tap / draw the plate box because the finder did not find it; added in round 15),
`conditions`, `distance_m`, vehicle, plate type, notes.

**Medicine** (`medicine-template.csv`): `box_id`, date, site, device, `photo_ref`, brand, `reg_ocr`/`reg_truth`/`reg_edited`,
`lot_ocr`/`lot_truth`/`lot_edited`, `expiry_ocr`/`expiry_truth`/`expiry_edited`, `confirm_s`, `conditions`, notes (optional
`reg_saved` / `lot_saved` / `expiry_saved` when the saved value differs from the read).

Ground truth is read **from the plate / box itself** by a second person, not from the screen, so the suggestion cannot
anchor it.

## 4. Metrics

Overall and per condition tag, with Wilson 95 % intervals:

- **Exact-match rate** — normalised OCR equals normalised truth. Plates: `LQPlate.normalize` from `lensiq-plate.js`
  (Thai digits → 0-9, spaces / dashes / dots dropped); registration numbers: `LQMed.parseThaiReg`.
- **CER** — sum of Levenshtein(OCR, truth) / sum of len(truth).
- **Edit rate** — share edited by the user before saving.
- **Time per read** — mean and median `confirm_s`.
- **Silent wrong saves** — saved value ≠ truth **and** not edited → **must be 0** (the worst failure: a wrong value enters
  the system unseen).
- (plates) **Alternatives hit** — when the first read is wrong, was the truth among the alternatives offered?
- (plates) **Taps needed** — share of reads where the guard had to tap the plate (`tapped`), per condition, Wilson 95 %.
  Rows with an empty `tapped` are not counted. The Gate pages tally it automatically in the on-site accuracy check
  (day / night), including vehicles the system did not read at all and the guard typed by hand (counted as a tap, left
  out of the read-accuracy numbers). In the CSV, fill `tapped` = 1 for those vehicles too.

## 5. Go-live thresholds — **PROPOSAL (for the owner to adjust; not industry standards)**

| Metric | Proposed threshold |
|---|---|
| Plates: number of reads | ≥ 200 |
| Plates (fees / gate): exact match in good light (`day` without `rain`/`backlight`/`night`/`low-light`) | ≥ 95 % |
| Plates: exact match at night (`night`) | ≥ 85 % |
| Plates: silent wrong saves | 0 |
| Plates: reads that needed a tap, good light (`tapped`; checked only when good-light rows have the column filled) | ≤ 10 % |
| Medicine: number of boxes | ≥ 100 |
| Medicine: registration-number exact match — before any feature relies on it without review | ≥ 95 % |
| Medicine: silent wrong saves (reg + lot + expiry) | 0 |

By default the script judges a rate on the point estimate, but **the Gate pilot always uses `--lower-bound`** (owner decision 2026-11-09; the table shows the plain average k / n beside the Wilson bound); `--lower-bound` judges on the Wilson 95 % lower bound (stricter, as the
Gate site check does) and a rate that must stay low (taps) on the upper bound. The owner overrides values with `--targets targets.json` (keys as in `PROPOSAL` in the script).

## 6. Sampling plan

- At least 2 sites (1 car park + 1 village / condo), at least 5 days, weekdays and weekends, morning / evening / night.
- Record **every vehicle** passing in pre-chosen windows (e.g. 30 min each) — never only easy plates. Rare conditions
  (special plates, rain) may be collected on purpose but are tagged `targeted` and reported separately.
- The same vehicle counts at most 3 times (note it) so one plate cannot dominate.
- Medicine: random boxes from the participating pharmacy / store shelves, ≤ 10 per brand, ≥ 10 boxes per tag.
- Sizes are minimums: if a CI still straddles a threshold, collect more (`LQSite.needMoreProp` in `lensiq-sitecheck.js`
  estimates how many).

## 7. Roles

| Role | Duties |
|---|---|
| Owner | approves the plan, adjusts thresholds, decides go-live |
| Field lead | PDPA signage, devices, photo storage per policy, collects CSVs |
| Operator (guard / pharmacist) | normal use: confirms or corrects suggestions |
| Truth recorder (second person) | reads the truth from the plate / box without looking at the screen |
| Analyst | runs the script, checks the data, writes the round report |
| PDPA coordinator / counsel | reviews signage, legal basis, retention and deletion |

## 8. Consent / PDPA signage (before any collection)

1. Post the sign (`gate-notice.html`; sign E in `camera-notice.html` for pilot recording) before the camera.
2. Publish the privacy notice: purpose "accuracy test", retention, contact (legal basis to be confirmed by counsel).
3. Complete / update the DPIA (`docs/pdpa/DPIA-template.md`) and the ROPA entry.
4. Pharmacy: box photos must not show patient names / prescriptions — cover them or do not photograph.
5. No face recognition; drivers are not photographed on purpose.

## 9. Data handling

- **Photos never enter the repo** — `photo_ref` is only a reference. Photos live on the field team's encrypted drive, with
  named people having access, deleted at the end of retention (`docs/pdpa/retention-table.md`; proposed ≤ 30 days after
  the report), deletion logged.
- CSVs with real plates are personal data → also kept outside the repo. The repo only holds the synthetic templates and
  aggregate numbers (no real plate text).
- Open the files in a UTF-8 aware editor (the script accepts Excel's BOM).

## 10. Running the script

```sh
node tools/field-pilot-metrics.mjs --plates plates.csv --medicine medicine.csv          # tables
node tools/field-pilot-metrics.mjs --plates plates.csv --json > result.json            # JSON
node tools/field-pilot-metrics.mjs --plates plates.csv --medicine medicine.csv --strict # exit 1 on a failed threshold
node tools/field-pilot-metrics.mjs --plates plates.csv --lower-bound --targets owner-targets.json
```

No dependencies, no network, CSV text only. Exit code 0 = ok, 1 = `--strict` and a threshold failed, 2 = bad arguments /
input. Rows without ground truth are skipped and counted.

## 11. How results feed back into the product

- Measured figures (with CI, n, sites, dates) go into "Status per round" below and into `ACCURACY.md` /
  `docs/accuracy-figures.json` (`npm run accuracy:sync`) — pages may only quote measured figures.
- Owner-confirmed thresholds → update `LQPlate.TARGETS` (the Gate on-site check: today plate 0.95, char 0.98, ≥ 100
  vehicles, ≥ 30 at night) to match (e.g. add a night target of 0.85), and add the same kind of site check to the
  medicine page.
- Conditions that fail → work items for the next round (e.g. `trimBorder` / `splitLines` for motorcycle plates, more
  alternatives, a backlight warning on screen) — additions and adjustments only, no feature is removed.
- Every silent wrong save → root cause (confirm too easy? look-alike characters not underlined?) before go-live.

---

## Status per round

| Round | Date | Plates (n / good-light exact / night exact / silent) | Medicine (n / reg exact / silent) | Verdict | Notes |
|---|---|---|---|---|---|
| 15 | 2026-11-08 | — / — / — / — | — / — / — | not started | plan, templates and `tools/field-pilot-metrics.mjs` added; no field data yet |
| 15b | 2026-11-08 | — / — / — / — · taps — | — / — / — | not started | "taps needed" added (template column `tapped`, metric + PROPOSAL ≤ 10 % good light, Gate site check tallies taps). Plate finder upgraded; synthetic demo set only: 136–137 / 140 found (docs/GATE.md), real photos 2 / 6 — the pilot's taps share is the real measure |
| 16 | 2026-11-09 | — / — / — / — · taps — | — / — / — | not started | Plate check before every auto-read (`LQPlate.plateGuard`). **Public dataset** (51 Wikimedia Commons photos, not field): exact automatic read 7 / 22, photos without a plate auto-read 0 / 19 (held-out 0 / 9), taps needed 25 / 32. Owner photo tool and sheet ready; **field (owner photos): not measured**. Per-product kits in `docs/pilot/`. Owner decided 2026-11-09: Gate targets are judged on the Wilson 95 % lower bound (upper bound for taps), with the plain average k / n shown beside it. |

## Changelog / last reviewed

- **2026-11-12 (fortune help line)**: no change to the plate or medicine pilots. The fortune pages (not a field-pilot
  product) now carry an always-visible help line with numbers verified in `docs/CRISIS-RESOURCES.md`; if fortune ever
  runs at a pilot booth, staff should know the line is there and that 1669 is the medical emergency number. Last
  reviewed: 2026-11-12.
- **2026-11-10 (backend test deployment prepared)**: Product Check online parts are prepared for a **closed tester
  group** (`docs/DEPLOY.md`): official lookups on `medicine.html`, AI field reading and translation behind a tester code.
  This is a functional test, not a field pilot: no accuracy figure comes from it. Testers are asked to note, per label,
  whether the AI fields matched the pack (type, brand, registration number, lot, expiry) so a later field round can be
  planned; photos of prescriptions or dispensing labels are not to be used.

- **2026-11-10 (round 17, follow-ups)**: Exam **hall mode is experimental** (owner decision) and not the lead mode of the
  pilot; the pilot leads with the lab mode (`docs/pilot/PILOT-EXAM.md`). Small faces in the hall view are still not found
  (public dataset: 0 / 195 at 24 – 48 px; `docs/exam/FACE-ENGINE-RESULTS.md` §7.1). If a hall trial runs alongside, record
  per camera: distance to the nearest and farthest row, face width in px at each row (screenshot ruler), and frames per
  second on the device, so the next round can be measured on real footage with complete labels. Lab: "more than one
  person" now also uses a person count (public dataset: 28.8 % of frames with a second person, 0 / 17 false alarms); in
  phase 0 count how often it fires for a neighbour sitting normally at the next desk. **Field: not measured.**
  Owner decisions the same day: the Exam kit leads with lab mode and accepts that lab mode has no live feed to a
  dashboard on another machine; the kit and the invigilator-facing pages (not the candidate notice) state 28.8 % (15 / 52, public dataset, held-out)
  for "more than one person" and call it an aid, not complete detection; "second face ≥ 90 %" stays as the bar for the
  claim "detects a second person" and the pilot reports the measured rate; the number of hall cameras depends on room
  size (see the guide); a hall camera placement guide (face ≥ 48 px wide; a
  calculation, not a measurement) is in `docs/EXAM.md` with the list of what to write down when the owner tests a 4K
  webcam in a real room. Hall setup check (same day, separate commit): during room setup use "ตรวจการติดตั้งกล้อง" on
  `exam-hall.html` and write down the frame size received, the smallest face width in px per row and "people seen vs
  faces measured"; 48 px is a minimum, not a guarantee. The check measures at most 16 faces at a time (check one group
  at a time); write down "received less than asked" when the page shows it; look once at every seat layout saved before
  this update (a camera can change picture shape at a higher size). **Field: not measured.**
- **2026-11-10 (round 17)**: Exam lab face engine switched to MediaPipe Face Landmarker (owner decision); public /
  synthetic numbers in `docs/exam/FACE-ENGINE-RESULTS.md`. For the Exam pilot phase 0: (1) open the lab page on each lab computer
  and check the face check runs (if the detector cannot run there, the page switches the face signals off and says "fix setup"); (2) record no-face misses per
  light level and self-reported skin tone as planned; (3) record real head turns (left / right / down) with the scripted
  sheet, because the head-turn numbers so far come from synthetic renders that favour the new engine; (4) faces smaller
  than ~48 px (a second person far behind the candidate) are not detected by either engine. **Field: not measured.**
- **2026-11-10 (round 17)**: P7 "Ask AI" step built (off by default; needs the owner's keys and the P8 run before any
  pilot). Before enabling AI at a pilot pharmacy, test the patient-name guard on 30+ staged dispensing labels from that
  pharmacy's own printer and record misses; keep photo mode off on pilot devices until that result is reviewed.
- **2026-11-10 (round 17)**: product-label evidence filter built (dev numbers only; `docs/product-check/P7-RESULTS.md`
  §3.4). At a pilot site also stage 30+ captures that are NOT product labels (parcel labels, receipts, appointment
  slips, notes left with medicine) and 50+ real packs photographed badly (glare, half the label, curved bottle): record
  every non-product capture that still offers AI and every real pack that is refused. **Field: not measured.**
- **2026-11-10 (round 17)**: face blur before upload built (no upload path until P7); its numbers are public-dataset
  only. A field check of the blurred preview on the owner's phone (photos with a hand or a face in frame) is still to do.
- **2026-11-12 (Gate, labels v3)**: the owner confirmed the public-photo plate labels (v3). Gate public-photo figures
  now: top box on the plate 14 / 32, exact automatic read 7 / 22, taps needed 25 / 32, photos without a plate auto-read
  0 / 19 (held-out 0 / 8; w30 moved to dev, same scene as w29). Tiny unreadable plates are "ignore" regions in the scorer.
  Source: public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 — **field: not measured**.
- **2026-11-10 (round 17)**: Product Check P2 tab (`medicine.html` → "ตรวจสินค้า (ทุกประเทศ)") ready for the owner's
  first phone test (checklist given in the round report). Numbers so far: synthetic labels and the public photo set
  only (`docs/product-check/P2-RESULTS.md`); **field and phone: not measured**. Photo protocol:
  `docs/product-check/PHOTO-SET-PROTOCOL.md`.
- **2026-11-10 (round 17, P7)**: Product Check AI is offered only for a capture that shows product-label evidence.
  Pilots should photograph the side of the pack with the registration number or the barcode; adverts and other sides
  get the on-device results only (`docs/product-check/P7-RESULTS.md` §3.4, §3.6). Field: not measured.
- **2026-11-10 (round 17, P7, owner decision ก)**: the filter was measured by an independent agent on a locked
  synthetic set: 0/260 personal-data items reached the AI; 19.2 % of real product labels were refused (front panel
  38.9 %, short capture 28.9 %, long label 7.8 %, back panel 1.1 %; with a decoded barcode or a parsed registration
  number 5.0 %). When a capture is refused for lack of evidence the page now tells the user to photograph the side
  with the registration number or the ingredients list, or to scan the barcode. At a pilot site record, per pack:
  which side was photographed first, whether AI was refused, whether the user followed the guidance and whether the
  second capture was accepted; and every pack that is still refused after the barcode side was photographed.
  **Field: not measured.** (`docs/product-check/P7-RESULTS.md` §3.7)

- **2026-11-09 (round 16)** — per-product pilot kits `docs/pilot/PILOT-GATE.md` / `PILOT-EXAM.md` / `PILOT-CROWD.md`.
  The Gate kit starts with phase 0: the owner's ~100 phone photos run through `tools/plate-field-eval.mjs` with a dev /
  held-out split fixed before the first run; the site visit goes ahead only if no plate-less photo is auto-read. The
  plates sheet for that phase is `docs/field-pilot/plates-photo-labels.csv` (template only — a filled-in sheet stays
  outside the repo or under the git-ignored `field-data/`). PILOT-GATE §5 shows the observed rate each Wilson
  lower-bound target needs at the planned n (night ≥ 85 % needs 39 / 40 at n = 40); the choice of rule is an owner
  decision before phase 1. Last reviewed: 2026-11-09.
- **2026-11-08 (round 15b, review fixes)** — the good-light taps check runs only when good-light rows carry `tapped`
  (night-only tap data no longer fails `--strict` for missing data); the Gate site check also records vehicles saved
  with no system read (finder missed, guard typed the plate) as a tap, so the taps share is not flattered. Unit tests.
- **2026-11-08 (round 15b)** — "taps needed" metric: `tapped` column in `plates-template.csv`, per-condition share with
  Wilson CI in `tools/field-pilot-metrics.mjs`, PROPOSAL threshold `plateTapsGoodLight` ≤ 10 % (checked only when the
  column is filled; `--lower-bound` uses the upper bound), unit tests; the Gate on-site accuracy check records whether
  each read was tapped and reports taps (day, with the 10 % proposal) and taps (night). Last reviewed: 2026-11-08.
- **2026-11-08 (round 15)** — first version: test plan (TH/EN), CSV templates with synthetic rows, metrics script, unit
  tests. Thresholds are a PROPOSAL awaiting the owner. Last reviewed: 2026-11-08.

## ภาคผนวก: Nutrition (อ่านฉลากโภชนาการ) — 2026-11-13

ยังไม่มีการนำร่องภาคสนาม ตัวเลขทั้งหมดมาจากฉลากสังเคราะห์ (`docs/nutrition/NUTRITION-ACCURACY.md`) การวัดกับฉลากจริงต้องใช้ภาพฉลากจริง
อย่างน้อย 200 ภาพจากเจ้าของ (`docs/NUTRITION-DESIGN.md` §5.1, §11) เก็บไว้นอก repo ที่ `~/LENSIQ-field/nutrition/labels/`

## Status 2026-11-13 — accounts groundwork (stream G)

No field figure changed. Field pilots of Gate, Attendance, Exam and Crowd now run inside the free tiers (Gate 30-day trial,
1 lane, 100 reads per day; Attendance up to 5 people; Exam up to 5 candidates per session; Crowd 2 hours per device per
day), which are counted on the device and not enforced. A pilot beyond those sizes needs a licence order entered by the
owner after the quotation and transfer (admin → Organisations), or the pilot terms in the contract (the Exam field pilot stays free).

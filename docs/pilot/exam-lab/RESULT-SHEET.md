# แบบบันทึกผล: นำร่อง LENSIQ Exam ห้องคอมพิวเตอร์ (โหมด B) / Result sheet: Exam lab pilot (Mode B)

> **สถานะ:** ฉบับร่าง 11 พ.ย. 2569 (คำสั่งประจำเจ้าของ "Sellable pack" ข้อ 7) กรอก 1 ชุดต่อช่วง (block) ต่อห้อง ไฟล์ตารางคู่กันคือ [`result-sheet.csv`](result-sheet.csv)
> กติกาการนับตามแผนหลัก [`docs/pilot/PILOT-EXAM.md`](../PILOT-EXAM.md) §6–7 และรูปแบบของ [`docs/pilot/RESULTS-FORM.md`](../RESULTS-FORM.md) (Wilson 95% ผลต่อโมดูล เหตุขัดข้อง การลบข้อมูล ลายเซ็น)
> **ไม่มีตัวเลขความแม่นยำใดในเอกสารนี้เป็นผลวัดแล้ว** ทุกช่องว่างรอการวัดในวันนำร่อง ตัวเลขเดิมที่อ้างถึงระบุที่มาทุกตัว
> **Status:** draft. No figure on this sheet has been measured yet; every blank waits for the pilot day. Earlier figures quoted here carry their source. English: second half.

---

# ภาษาไทย

## 1. ข้อมูลช่วง (กรอกทุกช่วง)

| | |
|---|---|
| รหัสช่วง (`session_id`) | [เช่น LAB1-2026-xx-xx-B1] |
| สถาบัน / ห้อง | [ ] / [ ] |
| ขั้น | ☐ ขั้น 0 (ตรวจกล้องและแสง) ☐ ขั้น 1 (สอบจำลองตามบท) ☐ ขั้น 2 (สอบจริง) |
| โหมด | B ห้องคอมพิวเตอร์ (`exam-lab.html`) เครื่องผู้สอบแต่ละเครื่อง **ไม่ส่งสด** ตรวจแจ้งถูก/แจ้งผิดหลังรอบ |
| วันที่ / เวลาเริ่ม–สิ้นสุด / ระยะเวลา (นาที) | [ ] / [ ] – [ ] / [ ] |
| จำนวนเครื่องที่ใช้ / จำนวนอาสาสมัครหรือผู้สอบ | [ ] / [ ] |
| เบราว์เซอร์ + เวอร์ชัน / รุ่นเครื่อง | [ ] / [ ] |
| รหัส commit หรือเวอร์ชันของเว็บที่ใช้ (บันทึกจากหน้า) | [ ] |
| ตัวตรวจใบหน้า | ทำงาน [ ] เครื่อง / ปิดตัวเอง (`faceoff`) [ ] เครื่อง |
| ตั้งค่า | คลิปหลักฐาน ปิด ☐ · บันทึกปากขยับ ปิด ☐ · อนุญาตหนังสือ/แล็ปท็อป/จอที่สอง: [ ] |
| ผู้ตรวจแจ้งถูก/แจ้งผิด (ชื่อ) / ผู้บันทึก | [ ] / [ ] |
| ที่มาของตัวเลขในใบนี้ (เลือกหนึ่ง) | ☐ หน้างาน (สอบจำลอง ขั้น 1) ☐ หน้างาน (สอบจริง ขั้น 2) ☐ หน้างาน (ตรวจกล้องและแสง ขั้น 0) · **ห้ามรวมขั้นเข้าด้วยกันในตัวเลขเดียว** |

## 2. กติกาการนับ (ตัดสินก่อนวัน ห้ามแก้หลังเห็นผล)

กติกาเหล่านี้ตรงกับ `docs/pilot/PILOT-EXAM.md` §6–7 และกลไกของ `docs/EXAM.md` ที่ข้อใดเป็นการตัดสินใจของผู้เขียนร่างนี้ในที่ที่เอกสารเดิมไม่ได้ระบุ จะทำเครื่องหมาย **[ตัดสินใจร่าง]** ให้เจ้าของยืนยัน

1. **"ข้อสังเกตที่ระบบแจ้ง" (alert)** = 1 รายการในรายการ "ที่ควรไปดู" ของแดชบอร์ด ต่อที่นั่งต่อชนิดสัญญาณ ระบบมี cooldown 90 วินาทีต่อที่นั่ง+ชนิด การแจ้งซ้ำภายใน cooldown
   ระบบนับเป็น "held re-fire" ไม่ใช่ข้อสังเกตใหม่ ให้นับแยกในช่อง `held_refires` ไม่รวมใน alerts
2. **เหตุประเภท "setup"** (แสงไม่ดี ตัวตรวจปิด `faceoff`) **ไม่ใช่ข้อสังเกต** ไม่นับใน alerts ไม่นับในความแม่นยำ นับแยกในช่อง `setup_events`
3. **ระดับ** นับแยก: ข้อมูล (info) · เฝ้าดู (watch) · ควรตรวจ (check) ตัวชี้วัดความแม่นยำหลักใช้ระดับ **ควรตรวจ** ตามตาราง `PILOT-EXAM.md` §6 ("ระดับ Check") รายงานระดับอื่นแยก
4. **ตรงบท (matched)** = ข้อสังเกตชนิดเดียวกับเหตุตามบท ที่นั่งเดียวกัน และเวลาเริ่มของข้อสังเกตอยู่ภายใน **10 วินาที** หลังเวลาจริงที่ผู้บันทึกจด (เทียบด้วยตารางนาฬิกาที่จดไว้) ตามคำนิยาม recall ใน `PILOT-EXAM.md` §7
5. **recall ต่อเหตุตามบท** = เหตุตามบทที่ถูกต้อง (valid) และมีข้อสังเกตตรงบท ÷ เหตุตามบทที่ valid ทั้งหมด เหตุที่ **ไม่ valid** คือ อาสาสมัครทำไม่ตรงบท / เครื่องขัดข้อง / ที่นั่งลบข้อมูล / ช่วงเหตุขัดข้อง: ตัดออกจากตัวหารและจดเหตุผล
6. **เหตุที่พลาด (missed scripted)** = เหตุตามบทที่ valid แต่ไม่มีข้อสังเกตตรงบท (= valid − matched)
7. **ข้อสังเกตเกินบท (unscripted alert)** = ข้อสังเกตที่ไม่ตรงบทใด ๆ นับ**ทุกข้อ** ไม่ว่าผู้ตรวจจะกดแจ้งถูกหรือผิด รายงานเป็นจำนวนต่อผู้ร่วม-ชั่วโมง (เป้า ≤ 1, `PILOT-EXAM.md` §6) และรายงานส่วนที่ผู้ตรวจกด "แจ้งผิด" แยก
   **[ตัดสินใจร่าง: นับทุกข้อเกินบท เป็นการตีความที่เข้มกว่าการนับเฉพาะ "แจ้งผิด"]**
8. **ยืนยันโดยคน (confirmed right)** = ผู้ตรวจ**เห็นเหตุนั้นด้วยตนเอง** (ผู้บันทึกหรือผู้ตรวจอยู่ในห้องและจดไว้ในแผ่น 5.1/5.2) แล้วกด "แจ้งถูก" ความหมายคือ "สิ่งที่ระบบบอกว่ามีนั้นมีจริง" (เช่น มีโทรศัพท์จริง) **ไม่ใช่** "มีการทุจริต"
   เหตุตามบทที่ตรงบท = แจ้งถูกอัตโนมัติ ไม่ต้องกดซ้ำ แต่ให้นับในช่อง `confirmed_right` เพื่อให้ผลรวมสอดคล้อง **[ตัดสินใจร่าง]**
9. **แจ้งผิด (false alarm)** = ข้อสังเกตที่ผู้ตรวจเห็นว่าไม่มีสิ่งนั้นจริง ณ ที่นั่งและเวลานั้น
10. **ยังไม่ตรวจ (not reviewed)** = ข้อสังเกตที่ไม่แน่ใจ หรือไม่มีใครเห็นเหตุ ไม่กดแจ้งถูกหรือผิด นับในช่อง `not_reviewed` ไม่นำเข้าตัวหารของความแม่นยำ แต่ถ้า `not_reviewed` เกิน 10% ของ alerts ให้ติดป้าย "ความแม่นยำไม่สมบูรณ์" ในผล **[ตัดสินใจร่าง]**
    **ตรวจความสอดคล้องทุกแถวก่อนบันทึก:** alerts (info + watch + check) = ตรงบท + เกินบท = แจ้งถูก + แจ้งผิด + ยังไม่ตรวจ ถ้าไม่เท่ากัน ให้กลับไปนับใหม่
11. **เหตุที่ผู้คุมสอบ/ผู้บันทึกเห็นแต่ระบบไม่แจ้ง (missed, seen by proctor)** = รายการในแผ่น 5.2 ที่นอกบท ระบบไม่แจ้งชนิดที่ตรงกันภายใน 10 วินาที นับในช่อง `missed_unscripted_seen`
    (รายงาน ไม่ตั้งเกณฑ์รอบแรก `PILOT-EXAM.md` §6)
12. **ความแม่นยำ "แจ้งถูก"** = confirmed_right ÷ (confirmed_right + confirmed_wrong) ของแต่ละชนิดสัญญาณ ที่ระดับควรตรวจ คิดช่วง Wilson 95% (สูตร §6 ล่าง)
13. **เวลา:** `latency` = เวลาที่ข้อสังเกตปรากฏ − เวลาจริงที่ผู้บันทึกจด (แปลงด้วยตารางเทียบนาฬิกา) รายงานมัธยฐานและ p90 ต่อชนิด · `response time` ของผู้คุมสอบ (เวลาจากข้อสังเกตถึงการกด)
    **วัดไม่ได้ในโหมด B** เพราะไม่มีการส่งสดและการตรวจทำหลังรอบ ให้เขียน "ไม่วัด" (เป้า ≤ 60 วินาทีของ `PILOT-EXAM.md` §6 ใช้ได้เฉพาะโหมดที่ผู้คุมสอบเห็นแดชบอร์ดสด)
14. **ปัดเศษ:** เปอร์เซ็นต์ปัดทศนิยม 1 ตำแหน่ง รายงานเป็น k / n เสมอ ห้ามรายงานเปอร์เซ็นต์เดี่ยว ๆ ถ้า n < 20 ให้เขียน "n น้อย" ข้างตัวเลข

## 3. ตัวเลขต่อชนิดสัญญาณ (กรอกต่อช่วง)

รหัสบท S1–S8 ดู [`DAY-PLAN.md`](DAY-PLAN.md) §5 ใช้แถวเดียวต่อรหัสบท และ 1 แถวรวม (ALL) ใน `result-sheet.csv` (คอลัมน์ `signal`)

| รหัส / ข้อสังเกต | เหตุตามบทที่ valid | ตรงบทภายใน 10 วินาที | พลาด | alerts (info / watch / check) | แจ้งถูก | แจ้งผิด | ยังไม่ตรวจ | เกินบท | latency มัธยฐาน / p90 (วินาที) |
|---|---|---|---|---|---|---|---|---|---|
| S1 ไม่เห็นใบหน้า | | | | / / | | | | | / |
| S2 หันศีรษะ | | | | / / | | | | | / |
| S3 โทรศัพท์ | | | | / / | | | | | / |
| S4 มากกว่าหนึ่งคน | | | | / / | | | | | / |
| S5 ออกจากเต็มจอ | | | | / / | | | | | / |
| S6 ออกจากหน้า | | | | / / | | | | | / |
| S7 วาง | | | | / / | | | | | / |
| S8 ลุกจากที่นั่ง (ไม่เห็นใบหน้า) | | | | / / | | | | | / |
| **รวม ALL** | | | | / / | | | | | / |
| setup (ไม่นับ) | — | — | — | — | — | — | — | — | — |
| held re-fires (ไม่นับ) | — | — | — | — | — | — | — | — | — |

เหตุที่ผู้บันทึกเห็นแต่ระบบไม่แจ้ง (แผ่น 5.2) ต่อชนิด: [ ] รายการ (เหตุผลสั้น ๆ ไม่ระบุชื่อ)

## 4. ขั้น 0: ตรวจกล้องและแสง (ถ้าทำช่วงนี้)

อ้างแผ่น 5.3 ของ `PILOT-EXAM.md` และหมายเหตุ: วินาทีที่ "หาใบหน้าเจอ" ยังไม่มีตัวนับในหน้า ใช้ผลรวมระยะเวลาเหตุ "ไม่เห็นใบหน้า" ในไฟล์ส่งออก ÷ ระยะเวลาช่วง
ซึ่งเป็นค่า**ประมาณต่ำกว่าจริง**เพราะเหตุเริ่มบันทึกหลังรอเตือน 5 วินาทีเท่านั้น [ตัดสินใจร่าง: ใช้วิธีนี้จนกว่าจะมีตัวนับ]

| คำตัดสินแสงของหน้า | ที่นั่ง (จำนวน) | เวลารวม (วินาที) | "ไม่เห็นใบหน้า" รวม (วินาที) | สัดส่วนที่เห็นใบหน้า (ประมาณ) | เป้า | สถานะ |
|---|---|---|---|---|---|---|
| ดี | | | | | ≥ 98% | |
| พอใช้ | | | | | รายงาน | |
| แย่ | | | | | รายงาน | |

ช่องว่างระหว่างกลุ่ม (ดีที่สุด − แย่ที่สุด) = [ ] จุด เป้า ≤ 5 จุด (ถ้าเกิน = ห้ามใช้ข้อสังเกต "ไม่เห็นใบหน้า" ในสภาพนั้นจนกว่าจะแก้ `PILOT-EXAM.md` §6)
กลุ่มสีผิว (Monk, ผู้ร่วมเลือกระบุเอง): ☐ เก็บ ☐ ไม่เก็บ (เก็บเมื่อทนายยืนยัน ม.26 และผู้ร่วมยินยอมเป็นหนังสือเท่านั้น รายงานแบบรวมกลุ่ม ไม่ผูกชื่อ)

## 5. สรุปเทียบเกณฑ์ (เกณฑ์เป็นข้อเสนอของ `PILOT-EXAM.md` §6 เจ้าของปรับได้)

| ตัวชี้วัด | ค่าที่วัด (k / n, Wilson 95%) | เกณฑ์ที่เสนอ | สถานะ |
|---|---|---|---|
| recall: โทรศัพท์ (S3) | [ ] / [ ] ([ ]–[ ] %) | ≥ 80% | |
| recall: ออกจากเต็มจอ (S5) | [ ] / [ ] | 100% | |
| recall: ไม่เห็นใบหน้า (S1, S8), หันศีรษะ (S2), ออกจากหน้า (S6), วาง (S7) | [ ] / [ ] แต่ละชนิด | รายงาน (ไม่มีเกณฑ์ในเอกสารแผน) | |
| recall: มากกว่าหนึ่งคน (S4) | [ ] / [ ] | รายงานค่าที่วัดได้ **เกณฑ์ ≥ 90% ก่อนอ้างว่า "ตรวจจับคนที่สอง"** ค่าเดิม 28.8% = 15 / 52 ภาพ (ชุดข้อมูลสาธารณะ ไม่ใช่ห้องสอบจริง `docs/exam/FACE-ENGINE-RESULTS.md` §7.2) | |
| ข้อสังเกตเกินบท ต่อผู้ร่วม-ชั่วโมง | [ ] (= [ ] ÷ ([ ] คน × [ ] ชม.)) | ≤ 1 | |
| ความแม่นยำ "แจ้งถูก" ระดับควรตรวจ ต่อชนิดที่มี ≥ 20 ข้อสังเกต | [ ] / [ ] ขอบล่าง [ ] % | ขอบล่าง Wilson ≥ 70% (ต้องเห็นแจ้งถูก 19/20, 34/40, 49/60, 79/100; **เจ้าของยังไม่ตัดสิน**ว่าจะคงเกณฑ์นี้ `PILOT-EXAM.md` §6) | |
| เหตุที่ผู้บันทึกเห็นแต่ระบบไม่แจ้ง | [ ] รายการ | รายงาน | |
| เวลาตอบสนองผู้คุมสอบ (มัธยฐาน) | ไม่วัดในโหมด B | ≤ 60 วินาที (ใช้ในโหมดที่เห็นแดชบอร์ดสด) | ไม่ใช้ |
| ผู้เข้าร่วมเห็นว่า "ยุติธรรมและเข้าใจ" (1–5) | [ ] (n = [ ]) | ≥ 4.0 | |
| ผู้ไม่ยินยอมได้ทางเลือกโดยไม่เสียสิทธิ | [ ] / [ ] | 100% | |
| ข้อร้องเรียนที่ยังไม่ได้แก้ | [ ] | 0 | |
| ข้อสังเกตถูกนำไปตัดสินโดยไม่มีผู้ตรวจ | [ ] | 0 | |
| ภาพ/วิดีโอ/ชื่อ/ข้อความที่พิมพ์ ในไฟล์ส่งออก | [ ] | 0 | |

ที่มาของตัวเลขในตารางนี้: ☐ หน้างาน (สอบจำลอง ขั้น 1) ☐ หน้างาน (สอบจริง ขั้น 2) · n = [ ] · วันที่วัด [ ] · ผู้ตรวจ [ ]

## 6. สูตร Wilson 95% (ใช้ด้วยมือหรือสเปรดชีต)

สำหรับ k สำเร็จจาก n และ z = 1.96, p = k ÷ n:

    ขอบล่าง = ( p + z²/(2n) − z × √( p(1−p)/n + z²/(4n²) ) ) ÷ ( 1 + z²/n )
    ขอบบน   = ( p + z²/(2n) + z × √( p(1−p)/n + z²/(4n²) ) ) ÷ ( 1 + z²/n )

ตัวอย่างตรวจสูตร: k = 19, n = 20 ให้ขอบล่าง ≈ 76% (ผ่านเกณฑ์ ≥ 70%) และ k = 18, n = 20 ให้ ≈ 70% ต่ำกว่าเล็กน้อย (ไม่ผ่าน) ตรงกับตาราง 19/20 ใน `PILOT-EXAM.md` §6
แดชบอร์ดคำนวณ Wilson ของ "แจ้งถูก/แจ้งผิด" ให้อยู่แล้ว (`docs/EXAM.md`) ใช้สูตรนี้กับ recall ซึ่งแดชบอร์ดยังไม่คำนวณให้ (`PILOT-EXAM.md` §7)

## 7. เหตุขัดข้องและข้อสังเกตของช่วงนี้

ตารางเหตุขัดข้องใช้รูปแบบของ `docs/pilot/RESULTS-FORM.md` §4

| วันที่ | ระดับ (S1–S4) | เกิดอะไรขึ้น | เวลาตอบสนอง | การแก้ไข | กระทบตัวเลขข้อใด |
|---|---|---|---|---|---|
| | | | | | |

## 8. การลบข้อมูล (รูปแบบเดียวกับ `docs/pilot/RESULTS-FORM.md` §6)

| ข้อมูล | ลบเมื่อ | โดย | พยาน | วิธี |
|---|---|---|---|---|
| ข้อมูลเว็บของ `exam-lab.html` บนเครื่องผู้สอบทุกเครื่อง (ตรวจว่า "บันทึกเหตุการณ์ของฉัน" ว่าง) | [ ] | [ ] | [ ] | ลบข้อมูลเว็บไซต์ในเบราว์เซอร์ |
| ไฟล์ JSON/CSV ที่มีที่นั่งและเวลา (ทุกสำเนา) | [ ] (ไม่เกิน 14 วัน) | [ ] | [ ] | ลบอย่างปลอดภัย |
| USB ที่ใช้ขนไฟล์ | [ ] | [ ] | [ ] | ฟอร์แมต/ลบอย่างปลอดภัย |
| ใบยินยอม | [ ] | [ ] | [ ] | ทำลาย |
| เก็บไว้: ตัวเลขรวมในใบนี้, `result-sheet.csv`, สำเนาบทที่ล็อก | เก็บที่ [ ] ถึง [ ] | | | |

## 9. ผลและลายเซ็น

ผลของช่วง/ห้อง: ☐ ผ่าน ☐ ผ่านแบบมีเงื่อนไข (ข้อจำกัดใน §7) ☐ ไม่ผ่าน (สิ่งที่ต้องแก้ใน §7) · ผลของนำร่องทั้งหมดตัดสินเมื่อครบทุกห้อง/ช่วง ตามเงื่อนไขใน `PILOT-EXAM.md` §6

| | ชื่อ | ลายเซ็น | วันที่ |
|---|---|---|---|
| เจ้าของนำร่อง (LENSIQ) | | | |
| ผู้แทนสถาบัน | | | |
| ผู้ติดต่อด้านข้อมูลส่วนบุคคลของสถาบัน | | | |

---
---

# English

## 1. Session details (fill for every block)

One copy per block per room; the companion table is [`result-sheet.csv`](result-sheet.csv). Counting rules follow [`docs/pilot/PILOT-EXAM.md`](../PILOT-EXAM.md) §6–7 and the layout of [`docs/pilot/RESULTS-FORM.md`](../RESULTS-FORM.md)
(Wilson 95 %, results per module, incidents, deletion, signatures). **No accuracy number on this sheet has been measured yet.**

Fields (see the Thai table): session id · institute / room · phase (0 camera and light, 1 staged exam, 2 real exam) · mode B (no live feed; right / wrong reviewed after the session) · date, start–end, minutes ·
PCs used / volunteers or candidates · browser + version / PC model · build id · face engine working on [ ] PCs / switched itself off (`faceoff`) on [ ] · settings (evidence clip off, mouth movement off, allowed items) · reviewer / recorder ·
**source of the numbers on this sheet: field (staged exam, phase 1), field (real exam, phase 2) or field (camera and light, phase 0). Never merge phases into one number.**

## 2. Counting rules (decided before the day; never changed after seeing results)

They follow `docs/pilot/PILOT-EXAM.md` §6–7 and the mechanics in `docs/EXAM.md`. Where the existing documents are silent, the draft's choice is marked **[draft decision]** for the owner to confirm.

1. **Alert** = one entry in the dashboard's "worth a look" queue per seat per signal type. The system has a 90 s cooldown per seat + signal; re-fires inside it are "held re-fires", counted separately (`held_refires`), not in alerts.
2. **Setup events** (poor light, detector off with `faceoff`) are **not observations**: not in alerts, not in accuracy; counted in `setup_events`.
3. **Levels** are counted separately: info, watch, check. The headline precision uses the **check** level, as in the `PILOT-EXAM.md` §6 table; other levels are reported separately.
4. **Matched** = same signal type as the scripted event, same seat, and the alert starts within **10 s** after the true time the recorder noted (converted with the clock table), per the recall definition in `PILOT-EXAM.md` §7.
5. **Recall per scripted event** = valid scripted events with a matched alert ÷ all valid scripted events. An event is **not valid** if the volunteer went off script, the PC failed, the seat's data was deleted, or it fell in an incident period: remove it from the denominator and note why.
6. **Missed scripted event** = valid and not matched (valid − matched).
7. **Unscripted alert** = an alert that matches no scripted event. Count **all** of them whether the reviewer presses right or wrong; report per participant-hour (target ≤ 1, `PILOT-EXAM.md` §6) and, separately, those marked "wrong". **[draft decision: counting every unscripted alert is stricter than counting only "wrong" ones]**
8. **Confirmed by a human (right)** = the reviewer **saw the event in person** (a recorder or reviewer in the room who noted it on sheet 5.1 / 5.2) and pressed "flag was right", meaning "what the system said was there was really there" (e.g. a real phone), **not** "misconduct".
   A matched scripted event counts as right automatically and is included in `confirmed_right` so totals add up. **[draft decision]**
9. **False alarm (wrong)** = an alert where the reviewer saw that nothing of that kind was there at that seat and time.
10. **Not reviewed** = unsure, or nobody saw the event; press neither. Counted in `not_reviewed`, left out of the precision denominator; if it exceeds 10 % of alerts, label the result "precision incomplete". **[draft decision]**
    **Consistency check for every row before saving:** alerts (info + watch + check) = matched + unscripted = right + wrong + not reviewed. If they differ, recount.
11. **Missed event seen by the proctor** = an off-script entry on sheet 5.2 for which the system raised no matching alert within 10 s; counted in `missed_unscripted_seen` (report only; no threshold in round 1, `PILOT-EXAM.md` §6).
12. **Precision** = confirmed_right ÷ (confirmed_right + confirmed_wrong) per signal at the check level, with a Wilson 95 % interval (formula below).
13. **Timings:** `latency` = alert time − true time noted by the recorder (via the clock table); median and p90 per signal. The invigilator **response time** (alert to press) **cannot be measured in Mode B**: there is no live feed and review happens after the session;
    write "not measured" (the ≤ 60 s target of `PILOT-EXAM.md` §6 applies only where the invigilator sees a live dashboard).
14. **Rounding:** percentages to one decimal; always report k / n, never a bare percentage; if n < 20 write "small n" next to it.

## 3. Per-signal table

Codes S1–S8 are in [`DAY-PLAN.md`](DAY-PLAN.md) §5. One row per script code plus one total row (ALL) in `result-sheet.csv` (column `signal`). Columns: valid scripted events · matched within 10 s · missed · alerts (info / watch / check) ·
right · wrong · not reviewed · unscripted · latency median / p90 (s). Setup events and held re-fires are listed but not counted. Also list the off-script events the recorder saw that the system did not flag (sheet 5.2), per signal.

## 4. Phase 0: camera and light (if run)

Uses sheet 5.3 of `PILOT-EXAM.md`. Note: there is no on-page counter for "seconds with a face found", so use the total duration of "no face" events in the export ÷ block duration. This is an **under-estimate** of the true no-face time
because the event is logged only after the 5 s prompt delay. **[draft decision: use this until a counter exists]**

| Light verdict of the page | Seats | Total seconds | "No face" seconds | Share with a face (approx.) | Target | Status |
|---|---|---|---|---|---|---|
| good | | | | | ≥ 98 % | |
| fair | | | | | report | |
| poor | | | | | report | |

Gap between groups (best − worst) = [ ] points, target ≤ 5 points (if larger, the "no face" signal must not be used in that condition until fixed; `PILOT-EXAM.md` §6). Skin-tone groups (Monk, self-identified): collect only if counsel confirms PDPA s.26 and the volunteer consented in writing; group totals only, never tied to names.

## 5. Summary against the criteria (proposals from `PILOT-EXAM.md` §6; the owner may change them)

| Metric | Measured (k / n, Wilson 95 %) | Proposed target | Status |
|---|---|---|---|
| recall: phone (S3) | | ≥ 80 % | |
| recall: leave fullscreen (S5) | | 100 % | |
| recall: no face (S1, S8), head turn (S2), away (S6), paste (S7) | each | report (no target in the plan) | |
| recall: more than one person (S4) | | report the measured value; **≥ 90 % before claiming "detects a second person"**; earlier value 28.8 % = 15 / 52 frames (public dataset, not exam rooms; `docs/exam/FACE-ENGINE-RESULTS.md` §7.2) | |
| unscripted alerts per participant-hour | | ≤ 1 | |
| precision ("flag was right") at check level, per signal with at least 20 alerts | | Wilson lower bound ≥ 70 % (needs 19/20, 34/40, 49/60, 79/100 right; **the owner has not yet decided to keep this**, `PILOT-EXAM.md` §6) | |
| events the recorder saw that the system did not flag | | report | |
| invigilator response time (median) | not measured in Mode B | ≤ 60 s (only with a live dashboard) | n/a |
| participants rating "fair and clear" (1–5) | | ≥ 4.0 | |
| non-consenting people given the alternative without penalty | | 100 % | |
| unresolved complaints | | 0 | |
| observations used for a decision without a reviewer | | 0 | |
| images / video / names / typed text in any export | | 0 | |

Source of the numbers: field (staged exam, phase 1) or field (real exam, phase 2); n; date measured; reviewer.

## 6. Wilson 95 % formula

For k successes out of n, z = 1.96, p = k ÷ n:

    lower = ( p + z²/(2n) − z × √( p(1−p)/n + z²/(4n²) ) ) ÷ ( 1 + z²/n )
    upper = ( p + z²/(2n) + z × √( p(1−p)/n + z²/(4n²) ) ) ÷ ( 1 + z²/n )

Check: k = 19, n = 20 gives a lower bound of about 76 % (meets ≥ 70 %); k = 18, n = 20 gives about 70 %, just under. This agrees with the 19/20 row in `PILOT-EXAM.md` §6.
The dashboard already computes Wilson for right / wrong (`docs/EXAM.md`); apply this formula to recall, which the dashboard does not compute (`PILOT-EXAM.md` §7).

## 7–9. Incidents, deletion, outcome and signatures

Same tables as the Thai half: incidents in the layout of `docs/pilot/RESULTS-FORM.md` §4; deletion record (site data on every candidate PC, files with seat and time within 14 days, USB drives, consent forms; kept: totals, `result-sheet.csv`,
locked script) in the layout of `RESULTS-FORM.md` §6; outcome pass / conditional / fail; signatures of the owner, the institute's representative and the institute's data-protection contact.

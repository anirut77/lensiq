# แผนวันนำร่อง: LENSIQ Exam ห้องคอมพิวเตอร์ (โหมด B) / Pilot day plan: Exam lab (Mode B)

> **สถานะ:** ฉบับร่าง 11 พ.ย. 2569 (คำสั่งประจำเจ้าของ "Sellable pack" ข้อ 7) เวลาทุกช่วงเป็น **ข้อเสนอให้เจ้าของปรับ** ยังไม่เคยลองทำจริง
> ใช้คู่กับ [`EQUIPMENT.md`](EQUIPMENT.md), [`CONSENT-TH.md`](CONSENT-TH.md) (รอทนายตรวจ), [`RESULT-SHEET.md`](RESULT-SHEET.md) และแผนหลัก
> [`docs/pilot/PILOT-EXAM.md`](../PILOT-EXAM.md) (ขั้น 0 ตรวจกล้องและแสง, ขั้น 1 สอบจำลองตามบท)
> **Status:** draft; every duration is a proposal for the owner and has never been rehearsed. English: second half.

---

# ภาษาไทย

## 1. กติกาของวัน

- **โหมด B ไม่ส่งสดไปแดชบอร์ดเครื่องอื่น** (ข้อจำกัดที่เจ้าของยอมรับ 10 พ.ย. 2569, `PILOT-EXAM.md` §2) ผู้ควบคุมจึง**ไม่เห็นเหตุการณ์ระหว่างรอบ** การตรวจว่า "แจ้งถูก/แจ้งผิด" ทำหลังรอบ
  จากไฟล์ส่งออก เทียบกับแผ่นบันทึกของผู้บันทึก (ต่างจากขั้น 2 ใน `PILOT-EXAM.md` ที่ผู้คุมสอบกดแจ้งถูก/ผิดระหว่างสอบ ให้บันทึกเรื่องนี้ในผลทุกครั้ง)
- ไม่มีการบันทึกภาพ วิดีโอ หรือเสียง **คลิปหลักฐานปิด** ช่อง "บันทึกปากขยับต่อเนื่อง" **ปิด** (ไม่ได้วัดความแม่นยำของสัญญาณนี้ `docs/EXAM.md`)
- ผู้เข้าร่วมเป็นอาสาสมัครผู้ใหญ่ (≥ 20 ปี) ที่เซ็นยินยอมแล้วเท่านั้น คนที่ไม่ยินยอมไม่เปิดกล้อง ไม่เสียสิทธิ
- ห้ามใช้คำว่า "ทุจริต" "โกง" "จับได้" ในห้อง ในแผ่นบันทึก และในรายงาน ใช้ "ข้อสังเกต" "เหตุตามบท"
- ห้ามแก้บทหรือเกณฑ์หลังเห็นผล ถ้าต้องแก้ ให้จดวัน เวลา และเหตุผลในช่องหมายเหตุ

## 2. บทบาท (ตามจำนวนอาสาสมัคร 10 คน)

| บทบาท | จำนวน | หน้าที่ |
|---|---|---|
| หัวหน้างาน (เจ้าของ) | 1 | ตัดสินใจเมื่อเกิดเหตุ เปิดแดชบอร์ด นำเข้าไฟล์ ลงนามผล |
| ผู้ควบคุมนาฬิกาและบท | 1 | ถือนาฬิกากลางห้อง ประกาศ "เริ่มช่วง/จบช่วง" จดเวลานาฬิกาเครื่องแต่ละเครื่องเทียบกับนาฬิกากลางห้อง |
| ผู้บันทึก | 2 (ดู 5 เครื่องต่อคน) | จดเวลาจริงของแต่ละเหตุตามบท จดเหตุที่ไม่อยู่ในบท ไม่ดูหน้าจอเครื่องผู้สอบ |
| ผู้ดูแลห้องของสถาบัน | 1 | เครื่องและเครือข่าย |
| ผู้ติดต่อด้านข้อมูลส่วนบุคคลของสถาบัน | 1 | พยานการลบข้อมูลและรับข้อร้องเรียน |

## 3. ก่อนวันจริง

| เมื่อไร | งาน | ผลที่ได้ |
|---|---|---|
| −14 ถึง −8 | ลงนามสัญญานำร่อง (`docs/pilot/AGREEMENT-TH.md`) ขอหนังสืออนุญาตจากผู้บริหาร เลือกวันที่ไม่ใช่วันสอบชี้ขาด ส่ง [`CONSENT-TH.md`](CONSENT-TH.md) ให้ทนายตรวจ และทำ DPIA เพิ่มเติม | สัญญา หนังสืออนุญาต ความเห็นทนาย |
| −10 | รับอาสาสมัครผู้ใหญ่ ≥ 10 คน (เกินไว้ 2 คนเผื่อไม่มา) แจ้งรายละเอียดตามใบยินยอม แจ้งเรื่องไม่มีการส่งสดและค่าตอบแทน (ถ้ามี) | รายชื่อ (เก็บแยก ไม่ผูกกับที่นั่ง) |
| −7 | ติดประกาศผู้สอบ `exam.html#notice` อย่างน้อย 7 วันก่อน (ถ้าเป็นขั้น 2) เขียนบทเหตุการณ์ ล็อกบท จด sha256 ของไฟล์บท | แผ่นบทที่ล็อกแล้ว |
| −3 | ตรวจรายการ [`EQUIPMENT.md`](EQUIPMENT.md) ทุกช่อง พิมพ์เอกสาร | รายการติ๊กครบ |
| −1 | ทดลองบนเครื่องห้องจริง 1 เครื่อง: เปิด `exam-lab.html` → ผ่านขั้น 1–4 → ส่งออก JSON → นำเข้า `exam-dashboard.html` (ดู `EQUIPMENT.md` §5) จดเวลาโหลดและรุ่นเครื่อง | บันทึกทดสอบ |

## 4. ตารางวันจริง (ข้อเสนอ ใช้ T = เวลาเริ่มช่วงที่ 1 หลังอาสาสมัครพร้อม)

| เวลา | งาน | ใคร | ผลที่ได้ / ตรวจอะไร |
|---|---|---|---|
| T−120 | **ตั้งห้อง:** ติดป้ายเลขที่นั่ง ตั้งนาฬิกากลางห้องให้เห็นจากทุกที่นั่ง ติดป้ายหน้าประตู (ปรับข้อความให้ตรงโหมด B) **ปิดเลนส์ทุกเครื่อง** วางบัตรคิวคว่ำบนโต๊ะ | หัวหน้างาน ผู้ดูแลห้อง | รายการติ๊กใน `EQUIPMENT.md` |
| T−90 | **ตั้งเครื่อง:** ทุกเครื่องผู้สอบเปิด `exam-lab.html` (รหัสห้อง [LAB1] ก่อนอาสาสมัครมา **ยังไม่กรอกเลขที่นั่งและยังไม่ติ๊กยินยอมแทนใคร**) ตรวจสถานะตัวตรวจใบหน้า ล้างข้อมูลเก่าของเว็บ ตรวจช่อง "บันทึกปากขยับต่อเนื่อง" ปิด และ "คลิปหลักฐาน" ปิด จดรุ่น CPU RAM เว็บแคม ความละเอียดที่เบราว์เซอร์ให้ | ผู้ดูแลห้อง ผู้บันทึก | แผ่นสเปกเครื่อง (รหัสที่นั่งเท่านั้น) |
| T−60 | **ซ้อมสั้น** ด้วยเจ้าหน้าที่ 1 คน: ผ่านขั้น 1–4 ของหน้า ทำเหตุตามบท 2 อย่าง ส่งออก นำเข้า ดูว่าเหตุที่ทำปรากฏในแดชบอร์ด และ**ลองกด "แจ้งถูก" / "แจ้งผิด" กับเหตุที่นำเข้า** (ยังไม่ได้ยืนยันว่าทำได้กับเหตุที่นำเข้าจากไฟล์ ถ้าทำไม่ได้ ใช้แผ่นกระดาษนับแทนและแจ้งทีมพัฒนา) | ผู้ควบคุม | ผ่าน/ไม่ผ่าน ถ้าไม่ผ่านดู §6 |
| T−45 | **เทียบนาฬิกา:** จดเวลาของนาฬิกาเครื่องแต่ละเครื่อง (ชั่วโมง:นาที:วินาที) คู่กับนาฬิกากลางห้อง ใช้แปลงเวลาแจ้งเตือนเป็นเวลานาฬิกากลางห้อง | ผู้ควบคุม | ตารางเทียบนาฬิกา (เริ่มรอบ) |
| T−30 | **อาสาสมัครมาถึง (รอนอกห้อง):** ลงทะเบียน (ไม่จดที่นั่ง) **ชี้แจงด้วยวาจา 10 นาที** ตามใบยินยอม: สมัครใจ หยุดได้ทุกเมื่อ ระบบบันทึกอะไรและไม่บันทึกอะไร ไม่วิเคราะห์อารมณ์ ไม่ตรวจจับการโกหก ผู้ควบคุมไม่เห็นเหตุการณ์สด ทางเลือกสำหรับผู้ไม่ยินยอม | หัวหน้างาน | อาสาสมัครรู้ครบ |
| T−20 | **ลงนามยินยอม:** อ่านเอง ถามได้ เซ็น 2 ชุด เก็บชุดผู้จัดใส่ซองปิดผนึก ผู้ที่ไม่ยินยอมไปทางเลือก (ไม่เปิดกล้อง) | ผู้ติดต่อด้านข้อมูลของสถาบัน | ซองยินยอม (แยกจากข้อมูลวัด) |
| T−10 | **เข้าห้อง:** แต่ละคนหยิบบัตรคิว (คว่ำ) แล้วนั่งที่นั่งตามบัตร ไม่จดว่าใครนั่งที่ใด แต่ละคนกรอกรหัสห้อง + เลขที่นั่ง ติ๊กยินยอมในหน้า **เปิดเลนส์** เมื่ออาสาสมัครทำขั้น "ตรวจกล้องและแสง" | อาสาสมัคร ผู้บันทึกช่วย | ทุกเครื่องถึงขั้น 2 |
| T+0 | **ขั้น 0: ตรวจกล้องและแสง (≈ 30 นาที):** (ก) แสงปกติ 10 นาที (ข) ปิดไฟครึ่งห้อง 10 นาที (ค) ปิดม่านหลังผู้สอบ/ย้อนแสง 10 นาที ผู้บันทึกจดคำตัดสินแสงของหน้าเว็บของแต่ละที่นั่งทุก 5 นาที และจดว่าเห็นข้อความ "ปรับการติดตั้ง" หรือไม่ ลงแผ่นตรวจกล้องและแสง (`PILOT-EXAM.md` §5.3) | ผู้บันทึก | แผ่น 5.3 |
| T+30 | **ปรับเทียบท่าศีรษะ** 2 นาที (ค่าเริ่มต้นของหน้า) ทุกเครื่องเข้าเต็มจอ | อาสาสมัคร | ทุกเครื่องอยู่ขั้น "ทำข้อสอบ" ถ้าปรับเทียบล้มเหลว จดที่นั่ง (หันศีรษะปิดอัตโนมัติ) |
| T+35 | **ขั้น 1 ช่วง 1: สอบจำลองตามบท (≈ 30 นาที):** ผู้ควบคุมประกาศ "เริ่มช่วง" พร้อมกดเริ่มนาฬิกากลางห้อง อาสาสมัครทำแบบฝึกหัดบนหน้า และทำเหตุตามบัตรคิวเมื่อนาฬิกาถึงเวลา (ตัวอย่างเหตุ §5) ผู้บันทึกจดเวลาจริงลงแผ่นบท (`PILOT-EXAM.md` §5.1) ช่องเหตุที่ไม่อยู่ในบท จดลงแผ่น 5.2 | ทุกคน | แผ่นบท 5.1 และ 5.2 |
| T+65 | **จบช่วง 1:** ผู้ควบคุมประกาศจบ จดเวลานาฬิกาเครื่องเทียบนาฬิกากลางห้องอีกรอบ อาสาสมัครกด "ส่งข้อสอบและปิดกล้อง" แล้ว "ส่งออกบันทึก (ไฟล์สำหรับผู้คุมสอบ)" บันทึกลง USB ตั้งชื่อเพิ่ม `-b1` ท้ายชื่อไฟล์ | อาสาสมัคร ผู้ดูแลห้อง | ไฟล์ `lensiq-exam-<ห้อง>-<ที่นั่ง>-b1.json` ทุกเครื่อง |
| T+75 | **พัก 10 นาที** (ปิดเลนส์ ลุกได้) | — | |
| T+85 | **ขั้น 1 ช่วง 2** (≈ 30 นาที) เปิดหน้าใหม่ ใช้ขั้นตอนเดิมแต่บทอีกชุด (สลับที่นั่งไม่จำเป็น) | ทุกคน | แผ่นบทช่วง 2 |
| T+120 | **จบช่วง 2:** ส่งออกเป็น `-b2` | | ไฟล์ `-b2` ทุกเครื่อง |
| T+125 | **แบบสอบถาม** อาสาสมัคร 1–5 "ยุติธรรมและเข้าใจ" (ไม่ใส่ชื่อ) ถามเพิ่มว่ามีอะไรที่ไม่สบายใจ แล้วอาสาสมัครออกจากห้อง | หัวหน้างาน | แบบสอบถาม |
| T+135 | **นำเข้าและตรวจ:** หัวหน้างานนำ USB ไปเครื่องแดชบอร์ด เปิด `exam-dashboard.html` กรอกรหัสห้อง ชื่อผู้คุมสอบ (ชื่อจริงของผู้ตรวจ) และที่นั่ง นำเข้าไฟล์ทีละไฟล์ ดูว่านำเข้าไม่มีข้อผิดพลาด นับจำนวนไฟล์ = จำนวนเครื่อง × 2 | หัวหน้างาน | แดชบอร์ดมีเหตุการณ์ครบ |
| T+150 | **ตรวจแจ้งถูก/แจ้งผิด** (หลังรอบ): ผู้ตรวจ (ผู้บันทึกหรือหัวหน้างาน ที่เห็นเหตุด้วยตัวเอง) เทียบแต่ละข้อสังเกตกับแผ่น 5.1/5.2 แล้วกด "แจ้งถูก" หรือ "แจ้งผิด" ตามกฎใน [`RESULT-SHEET.md`](RESULT-SHEET.md) §2 ข้อที่ไม่แน่ใจ **ไม่กด** (นับเป็น "ยังไม่ตรวจ") | ผู้ตรวจ | ตาราง "ตรวจความแม่นยำหน้างาน" ในแดชบอร์ด |
| T+210 | **ส่งออก CSV และกรอกผล** `result-sheet.csv` ต่อช่วง ตาม [`RESULT-SHEET.md`](RESULT-SHEET.md) | หัวหน้างาน | `result-sheet.csv` |
| T+240 | **รื้อห้อง:** ดู §7 | ทุกคน | |

ขั้น 2 (สอบจริง ห้องละ 20–40 คน อย่างน้อย 3 ห้อง) ใช้ขั้นตอน T−120 ถึง T−10 และ T+135 เป็นต้นไปเหมือนกัน เปลี่ยนเฉพาะ: ผู้สอบเป็นผู้เข้าสอบจริงที่ได้รับประกาศ ≥ 7 วันก่อน
(ต้องมีทางเลือกไม่เปิดกล้องที่ไม่เสียสิทธิ) ไม่มีบทเหตุการณ์ ผู้คุมสอบเดินตรวจตามปกติและจดเหตุที่เห็นลงแผ่น 5.2 ผลแยกจากขั้น 1 เสมอ

## 5. ตัวอย่างบทเหตุการณ์ของโหมด B (ล็อกก่อนวันจริง)

เหตุทั้งหมดตรงกับข้อสังเกตเชิงวัตถุของ `LQExam` (`PILOT-EXAM.md` §5.1) ห้ามใส่เหตุที่เป็นอารมณ์หรือสีหน้า ทำแต่ละเหตุ 3 ครั้งต่ออาสาสมัคร เว้น ≥ 90 วินาที (ค่า cooldown ของระบบต่อที่นั่ง+ข้อสังเกต,
`docs/EXAM.md`) และกระจายเวลาไม่ให้ทุกคนทำเหตุเดียวกันพร้อมกัน

| รหัส | เหตุตามบท | ระยะเวลา | ข้อสังเกตของระบบที่คาด (ตารางสัญญาณ `docs/EXAM.md`) |
|---|---|---|---|
| S1 | ก้มหรือหันหน้าออกจากกล้อง | ≥ 10 วินาที | ไม่เห็นใบหน้า |
| S2 | หันศีรษะไปด้านข้าง | > 8 วินาที | หันศีรษะ |
| S3 | ถือโทรศัพท์ให้เห็นบนโต๊ะ/ในกรอบ | 10 วินาที | โทรศัพท์ |
| S4 | อาสาสมัครอีกคนยืนหรือก้มเข้ามาในกรอบ (อยู่หลัง) | 10 วินาที | มากกว่าหนึ่งคน (เป็นตัวช่วย ไม่ครบถ้วน: 28.8%, 15 / 52 ภาพ, ชุดข้อมูลสาธารณะ, `docs/exam/FACE-ENGINE-RESULTS.md` §7.2) |
| S5 | ออกจากเต็มจอ (Esc) | จนกว่าจะกดกลับ | ออกจากเต็มจอ |
| S6 | สลับไปแท็บอื่น | ≥ 5 วินาที | ออกจากหน้า |
| S7 | วางข้อความยาว > 50 ตัวอักษร | ทันที | วาง |
| S8 | ลุกออกจากที่นั่ง | 20 วินาที | ไม่เห็นใบหน้า (โหมด B ไม่มีสัญญาณ "ที่นั่งว่าง") |

กฎเวลา: เวลาจริงของเหตุ = เวลาบนนาฬิกากลางห้องที่ผู้บันทึกเห็นอาสาสมัครเริ่มทำ ไม่ใช่เวลาตามบัตรคิว ถ้าอาสาสมัครทำไม่ตรงบท ผู้บันทึกจดเวลาจริงและทำเครื่องหมาย "ไม่ตรงบท" เหตุนั้นไม่นับใน recall

## 6. เหตุขัดข้อง (ตัดสินใจหน้างาน)

บันทึกลงตาราง §4 ของ [`docs/pilot/RESULTS-FORM.md`](../RESULTS-FORM.md) (วัน ระดับ S1–S4 เกิดอะไร เวลาตอบสนอง การแก้) และในช่อง `incident_notes` ของ `result-sheet.csv`

| เหตุ | ทำอย่างไร | แล้วนับผลอย่างไร |
|---|---|---|
| อาสาสมัครขอหยุด หรือไม่สบาย | หยุดทันที ไม่ต้องบอกเหตุผล ปิดเลนส์ ใช้ปุ่ม "ส่งข้อสอบและปิดกล้อง" ได้ ค่าตอบแทนเต็มจำนวน (ถ้ามี) ถ้าขอลบ ให้ลบบันทึกของที่นั่งนั้นในวันนั้น | นับเฉพาะส่วนที่ทำครบ ระบุในหมายเหตุ ถ้าลบบันทึกให้ตัดที่นั่งนั้นออกทั้งหมด |
| มีคนเข้าห้องโดยไม่ได้ยินยอม | ปิดเลนส์ทุกเครื่องทันที พาออก แล้วเปิดต่อเมื่อออกแล้ว | ช่วงนั้นไม่นับ บันทึกเวลาเป็นเหตุขัดข้อง |
| หน้าแจ้ง "ปรับการติดตั้ง" หรือตัวตรวจใบหน้าโหลดไม่ได้ | ปรับแสง/ตำแหน่ง/ลองโหลดใหม่ 1 ครั้ง ไม่ได้ให้ย้ายเครื่องสำรอง (**ไม่ใช่เหตุแจ้งเตือน** ไม่นับเป็นข้อสังเกต) | บันทึกในแผ่น 5.3 และ `setup_events` ไม่นับใน recall ของที่นั่งนั้น |
| เครื่องค้าง หน้ารีโหลด | หน้าจดการรีโหลดเป็นเครื่องหมายเริ่มใหม่ ให้เริ่มขั้นตอนใหม่ที่ขั้น 1 และใช้ไฟล์ส่งออกต่อกัน จดเวลาเริ่มใหม่ | เหตุตามบทที่ตกช่วงเครื่องค้างไม่นับ |
| เครือข่ายหลุด | ดูว่าหน้ายังทำงานต่อ (จดผล "ยังไม่ได้วัด" ใน `EQUIPMENT.md` §5) ถ้าไม่ได้ ใช้สำรอง | นับเฉพาะช่วงที่ทำงาน |
| หน้าจอแสดงข้อความที่ฟังเป็นคำตัดสินคน (เช่น "ทุจริต") | หยุดรอบ ถ่ายภาพหน้าจอ**เฉพาะข้อความ** (ไม่ให้เห็นหน้าคน) แจ้งทีมพัฒนา | เป็นข้อบกพร่องของผลิตภัณฑ์ ไม่ผ่านการนำร่อง ห้ามแก้เกณฑ์ |
| ข้อร้องเรียนเรื่องความเป็นส่วนตัว | หยุดรอบ ให้ผู้ติดต่อของสถาบันรับเรื่อง ลบข้อมูลของที่นั่งนั้น | นับเป็นข้อร้องเรียนที่ยังไม่ปิด จนกว่าจะแก้ (เกณฑ์ผ่าน = 0) |
| USB หาย หรือไฟล์รั่ว | แจ้งหัวหน้างานทันที ไฟล์ไม่มีภาพหรือชื่อ แต่มีที่นั่งและเวลา ประเมินและแจ้งผู้ติดต่อข้อมูลของสถาบัน | บันทึกเป็น S1 หยุดนำเข้าไฟล์ที่ไม่ได้ตรวจ |
| ไฟดับ สัญญาณเตือนภัย | อพยพตามแผนของสถาบัน ปิดเลนส์ภายหลัง | ช่วงนั้นไม่นับ |
| บทผิดพลาด (เช่น สองคนทำเหตุเดียวกันที่ที่นั่งเดียว) | ทำต่อ จดตามจริง ไม่แก้แผ่นบท | เหตุนั้นไม่นับใน recall ระบุเหตุผล |

## 7. รื้อห้องและลบข้อมูล

| ลำดับ | งาน | ใคร | ตรวจ |
|---|---|---|---|
| 1 | ปิดเลนส์ทุกเครื่อง ปิดแท็บ `exam-lab.html` | ผู้ดูแลห้อง | |
| 2 | **ลบข้อมูลเว็บของ `exam-lab.html` ในทุกเครื่อง** (ตั้งค่าเบราว์เซอร์ → ข้อมูลเว็บไซต์ → ลบ) แล้วเปิดหน้าใหม่ดูว่า "บันทึกเหตุการณ์ของฉัน" ว่าง | ผู้ดูแลห้อง + ผู้ติดต่อข้อมูลของสถาบัน | ติ๊กทีละที่นั่ง |
| 3 | ลบไฟล์ส่งออกจากเครื่องผู้สอบ (โฟลเดอร์ดาวน์โหลด) และล้างถังขยะ | ผู้ดูแลห้อง | |
| 4 | ในแดชบอร์ด กด "ล้างข้อมูลห้องนี้" **หลัง**ส่งออก CSV และกรอกผลเสร็จ | หัวหน้างาน | |
| 5 | ลบไฟล์ใน USB ทั้งสองแท่ง (ฟอร์แมตแบบเข้ารหัสหรือลบอย่างปลอดภัย) | หัวหน้างาน | |
| 6 | เก็บแผ่นบันทึกที่พิมพ์ไว้ในซองปิดผนึก (จนกว่าจะคีย์ลง CSV ครบ) แล้วทำลาย | หัวหน้างาน | |
| 7 | รื้อป้ายเลขที่นั่ง ป้ายหน้าประตู นาฬิกา ปลั๊ก เก็บที่ปิดเลนส์คืน คืนห้องสภาพเดิม | ทุกคน | |
| 8 | **ภายใน 14 วันหลังวันจัด** (ข้อเสนอ ตาม `PILOT-EXAM.md` §3): ลบไฟล์ JSON/CSV ที่มีที่นั่งและเวลาออกจากเครื่องเจ้าของและสำเนาทั้งหมด เก็บเฉพาะตัวเลขรวมใน [`RESULT-SHEET.md`](RESULT-SHEET.md) และสำเนาบทที่ล็อก | หัวหน้างาน + พยาน | บันทึกการลบ (ตาราง §6 ของ `docs/pilot/RESULTS-FORM.md`) |
| 9 | ทำลายใบยินยอมตามวันที่ที่ระบุในใบ | หัวหน้างาน + พยาน | บันทึกการลบ |
| 10 | ภาพถ่ายห้อง (ตอนไม่มีคน) เก็บได้ ไม่ต้องลบ ไม่มีภาพคน | — | |

## 8. หลังวัน

- กรอก [`RESULT-SHEET.md`](RESULT-SHEET.md) และ `result-sheet.csv` ภายใน 3 วัน ตัวเลขทุกตัวระบุที่มา "หน้างาน (สอบจำลอง ขั้น 1)" หรือ "หน้างาน (สอบจริง ขั้น 2)" และ n
- เขียนสรุปรอบลง `docs/CTO-BRIEF.md` และ `docs/FIELD-PILOT.md` (ตามกติกาโครงการ: ปรับเอกสารทุกรอบ) โดยเจ้าของหรือทีมที่รับผิดชอบเอกสารนั้น คู่มือนี้ไม่แก้ไฟล์เหล่านั้น
- เกณฑ์ผ่านเป็น**ข้อเสนอ** ตาม `PILOT-EXAM.md` §6 เจ้าของตัดสินใจก่อนเริ่มขั้น 2 ว่าจะคงเกณฑ์ Wilson ≥ 70% หรือตัดสินด้วยค่าที่เห็นจริงพร้อมช่วง 95%

---
---

# English

## 1. Ground rules

- **Mode B has no live feed to another machine** (limit accepted by the owner on 2026-11-10, `PILOT-EXAM.md` §2). The controller does **not** see events during a session; "flag was right / wrong" is decided after the session from the exported
  files against the recorder's sheets. This differs from phase 2 in `PILOT-EXAM.md`, where invigilators press right / wrong during the exam; state it in every result.
- No image, video or audio is recorded. **Evidence clips are off.** "Record continuous mouth movement" is **off** (its accuracy is unmeasured; `docs/EXAM.md`).
- Participants are adult volunteers (20 or older) who signed the consent. Anyone who does not consent has the camera off and loses nothing.
- Never say "cheating", "caught" in the room, on sheets or in reports. Use "observation" and "scripted event".
- Do not change the script or criteria after seeing results; if you must, write the date, time and reason in the notes.

## 2. Roles (10 volunteers)

| Role | Count | Duty |
|---|---|---|
| Lead (owner) | 1 | decides on incidents, runs the dashboard, imports files, signs the result |
| Clock and script controller | 1 | holds the room clock, calls "start / end of block", notes each PC's clock against the room clock |
| Recorders | 2 (5 PCs each) | note the real time of each scripted event and any unscripted one; do not look at candidate screens |
| Institute lab technician | 1 | machines and network |
| Institute data-protection contact | 1 | witness for deletion, receives complaints |

## 3. Before the day

| When | Task | Output |
|---|---|---|
| −14 to −8 | Sign the pilot agreement (`docs/pilot/AGREEMENT-TH.md`); written permission from management; choose a day that is not a high-stakes exam; send [`CONSENT-TH.md`](CONSENT-TH.md) to counsel; DPIA addendum | agreement, permission, counsel's view |
| −10 | Recruit at least 10 adult volunteers (plus 2 in case of no-shows); explain per the consent form, including the lack of live feed and any payment | list (kept apart, not tied to seats) |
| −7 | Post the candidate notice `exam.html#notice` at least 7 days before (phase 2); write and lock the script; record the script file's sha256 | locked script |
| −3 | Tick every line of [`EQUIPMENT.md`](EQUIPMENT.md); print documents | checklist complete |
| −1 | Rehearse on one real lab PC: `exam-lab.html` steps 1–4, export JSON, import into `exam-dashboard.html` (`EQUIPMENT.md` §5); write down load time and PC model | test note |

## 4. Pilot-day timetable (proposal; T = start of the first block once volunteers are ready)

| Time | Task | Who | Output / check |
|---|---|---|---|
| T−120 | **Room setup:** seat numbers; room clock visible from every seat; door signs (adapt wording to Mode B); **cover every lens**; queue cards face down | lead, technician | `EQUIPMENT.md` checklist |
| T−90 | **PC setup:** open `exam-lab.html` on each PC (room code [LAB1]; seat number not yet entered; consent not ticked for anyone); check the face-engine status; clear old site data; confirm "record mouth movement" **off** and evidence clip **off**; record CPU, RAM, webcam, resolution the browser delivers | technician, recorders | PC spec sheet (seat code only) |
| T−60 | **Short rehearsal** with one staff member: steps 1–4, two scripted events, export, import, see the events on the dashboard, and **try "flag was right / wrong" on an imported event** (not yet confirmed to work on events imported from a file; if not, tally on paper and tell the development team) | controller | pass / fail; see §6 |
| T−45 | **Clock comparison:** note each PC's clock (h:m:s) against the room clock; used to convert alert times to room-clock time | controller | clock table (start) |
| T−30 | **Volunteers arrive (wait outside):** sign in (no seat recorded); **10-minute verbal briefing** per the consent: voluntary, stop any time, what is and is not recorded, no emotion analysis, no lie detection, the controller sees no live events, the alternative for non-consent | lead | volunteers informed |
| T−20 | **Consent:** read, ask, sign two copies; the organiser's copy goes into a sealed envelope; those who decline take the alternative (camera off) | institute data contact | consent envelope (apart from measurements) |
| T−10 | **Enter the room:** each takes a queue card (face down) and sits at that seat; nobody records who sits where; each enters room code + seat number and ticks consent on the page; **uncover the lens** when the volunteer reaches the camera step | volunteers, recorders | every PC at step 2 |
| T+0 | **Phase 0, camera and light (≈ 30 min):** (a) normal light 10 min (b) half the lights off 10 min (c) curtain closed behind candidates 10 min; recorders note the page's light verdict per seat every 5 minutes and whether "fix setup" appears (sheet in `PILOT-EXAM.md` §5.3) | recorders | sheet 5.3 |
| T+30 | **Pose calibration** 2 min (the page default); every PC enters fullscreen | volunteers | all PCs at the exam step; note seats where calibration fails (head-turn off automatically) |
| T+35 | **Phase 1, block 1: staged exam (≈ 30 min).** The controller calls "start" and starts the room clock; volunteers work on the page and perform the scripted events from their queue card at the clock times (examples §5); recorders write the real times on the script sheet (`PILOT-EXAM.md` §5.1) and unscripted events on sheet 5.2 | everyone | sheets 5.1 and 5.2 |
| T+65 | **End of block 1:** controller calls the end; PC clocks noted again; volunteers press "end exam and close camera" then export the log to the USB drive with `-b1` added to the file name | volunteers, technician | files `lensiq-exam-<room>-<seat>-b1.json` |
| T+75 | **Break 10 min** (lenses covered) | — | |
| T+85 | **Block 2** (≈ 30 min): open the page afresh, same steps, second script | everyone | block-2 sheets |
| T+120 | **End of block 2:** export as `-b2` | | `-b2` files |
| T+125 | **Survey** 1–5 "fair and clear" (no names); ask what felt uncomfortable; volunteers leave | lead | surveys |
| T+135 | **Import and review:** the lead takes the USB drives to the dashboard laptop; opens `exam-dashboard.html`; enters room code, reviewer name and seats; imports each file; checks no import errors; file count = PCs × 2 | lead | dashboard holds all events |
| T+150 | **Right / wrong review (after the session):** a reviewer who saw the event (recorder or lead) compares each observation with sheets 5.1 / 5.2 and presses "flag was right" or "flag was wrong" per the rules in [`RESULT-SHEET.md`](RESULT-SHEET.md) §2; when unsure **do not press** (counts as "not reviewed") | reviewer | the dashboard's on-site accuracy table |
| T+210 | **Export CSV and fill `result-sheet.csv`** per block | lead | `result-sheet.csv` |
| T+240 | **Teardown:** §7 | everyone | |

Phase 2 (real exam, 20–40 per room, at least 3 rooms) uses T−120 to T−10 and T+135 onwards unchanged. Differences: candidates are real examinees given the notice at least 7 days before (an alternative without camera and without penalty is required);
there is no script; invigilators walk the room as usual and note what they see on sheet 5.2. Report phase 2 separately from phase 1, always.

## 5. Example Mode B script (lock it before the day)

All events match the objective observations of `LQExam` (`PILOT-EXAM.md` §5.1). Never script emotions or expressions. Each event 3 times per volunteer, at least 90 s apart (the system's per-seat, per-signal cooldown,
`docs/EXAM.md`), with times staggered so not everybody does the same event at once.

| Code | Scripted event | Duration | Expected system observation (signal table, `docs/EXAM.md`) |
|---|---|---|---|
| S1 | look down or away from the camera | at least 10 s | no face |
| S2 | turn the head sideways | over 8 s | head turn |
| S3 | hold a phone in view | 10 s | phone |
| S4 | another volunteer stands or leans into the frame behind | 10 s | more than one person (an aid, not complete: 28.8 %, 15 / 52 frames, public dataset, `docs/exam/FACE-ENGINE-RESULTS.md` §7.2) |
| S5 | leave fullscreen (Esc) | until they return | fullscreen exit |
| S6 | switch to another tab | at least 5 s | away |
| S7 | paste text longer than 50 characters | instant | paste |
| S8 | stand up and leave the seat | 20 s | no face (Mode B has no "empty seat" signal) |

Time rule: the true event time is the room-clock time at which the recorder saw the volunteer start, not the time on the queue card. If a volunteer deviates, the recorder notes the real time and marks it "off-script"; that event does not count in recall.

## 6. Incidents

Log them in table §4 of [`docs/pilot/RESULTS-FORM.md`](../RESULTS-FORM.md) (date, severity S1–S4, what happened, response time, resolution) and in the `incident_notes` column of `result-sheet.csv`.

| Incident | Action | How it is counted |
|---|---|---|
| A volunteer asks to stop, or is unwell | Stop at once, no reason needed, cover the lens, "end exam and close camera" is fine; full payment (if any); if they ask for deletion, delete that seat's log the same day | count only the completed part; if deleted, drop that seat entirely |
| Someone without consent enters the room | Cover every lens at once, escort them out, resume after | that period does not count; log the time as an incident |
| The page says "fix setup" or the face detector fails to load | Fix light or position, reload once, otherwise move to a spare PC (**not an alert**, not an observation) | record on sheet 5.3 and in `setup_events`; not counted in recall for that seat |
| A PC freezes or the page reloads | The page logs a reload marker; restart from step 1 and join the exported files; note the restart time | scripted events during the freeze do not count |
| Network drops | See whether the page keeps working (recorded as "not measured" in `EQUIPMENT.md` §5); otherwise use a spare | count only the working period |
| The screen shows wording that reads like a verdict on a person (e.g. "cheating") | Stop the session; screenshot **the text only** (no face visible); tell the development team | a product defect; the pilot fails; do not change the criteria |
| Privacy complaint | Stop the session; the institute's contact handles it; delete that seat's data | an open complaint until resolved (pass criterion = 0) |
| USB drive lost or file leaked | Tell the lead at once; files hold no image or name but do hold seat and time; assess and inform the institute's data contact | log as S1; stop importing unreviewed files |
| Power cut, fire alarm | Evacuate per the institute's plan; cover lenses afterwards | that period does not count |
| Script error (e.g. two people do the same event at one seat) | Carry on, record what really happened, do not edit the sheet | that event does not count in recall; give the reason |

## 7. Teardown and deletion

| # | Task | Who | Check |
|---|---|---|---|
| 1 | Cover every lens; close `exam-lab.html` | technician | |
| 2 | **Clear the site data of `exam-lab.html` on every PC** (browser settings, site data, delete), then reopen the page and confirm "my event log" is empty | technician + institute data contact | tick per seat |
| 3 | Delete exported files from candidate PCs (downloads folder) and empty the bin | technician | |
| 4 | In the dashboard press "clear this room" **after** exporting the CSV and filling the result | lead | |
| 5 | Erase both USB drives (encrypted format or secure erase) | lead | |
| 6 | Keep printed sheets in a sealed envelope until all are keyed into the CSV, then destroy them | lead | |
| 7 | Remove seat labels, door signs, clock, sockets; return lens covers; restore the room | everyone | |
| 8 | **Within 14 days of the pilot day** (proposal, `PILOT-EXAM.md` §3): delete JSON / CSV files holding seat and time from the owner's laptop and every copy; keep only the totals in [`RESULT-SHEET.md`](RESULT-SHEET.md) and the locked script | lead + witness | deletion record (`docs/pilot/RESULTS-FORM.md` §6) |
| 9 | Destroy the consent forms on the date printed on them | lead + witness | deletion record |
| 10 | Photos of the empty room may be kept (no person in them) | — | |

## 8. After the day

- Fill in [`RESULT-SHEET.md`](RESULT-SHEET.md) and `result-sheet.csv` within 3 days. Every number carries its source, "field (staged exam, phase 1)" or "field (real exam, phase 2)", and n.
- The round summary goes into `docs/CTO-BRIEF.md` and `docs/FIELD-PILOT.md` (project rule: update each round), by the owner or the team owning those files; this kit does not edit them.
- The pass criteria are a **proposal** from `PILOT-EXAM.md` §6. The owner decides before phase 2 whether to keep the Wilson lower bound ≥ 70 % or to judge by the observed value with its 95 % interval.

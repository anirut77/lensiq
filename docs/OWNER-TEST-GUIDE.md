# คู่มือเจ้าของทดสอบเอง 4 ผลิตภัณฑ์ก่อนขาย / Owner self-test guide for the four products

> **สถานะ:** ฉบับร่าง 11 พ.ย. 2569 (คำสั่งประจำเจ้าของ "Sellable pack" ข้อ 7) ใช้เฉพาะชื่อหน้าและขั้นตอนที่มีอยู่จริงใน repo
> **ไม่ต้องซื้ออะไรเพิ่ม ไม่ต้องจ่ายเงิน ไม่ต้องใส่รหัสลับหรือคีย์** ใช้เครื่องที่มีอยู่ (โน้ตบุ๊ก มือถือ เว็บแคม)
> **Status:** draft, 2026-11-11. Real page names and flows only. Nothing to buy, pay or enter as a key. English: second half.

---

# ภาษาไทย

## 0. อ่านก่อน

**คู่มือนี้ตรวจอะไร:** ตรวจว่าแต่ละผลิตภัณฑ์ (1) ทำงานตามที่หน้าเว็บบอก (2) บอกข้อจำกัดตามจริง (3) ไม่เก็บหรือส่งอะไรที่ไม่ควร
และ (4) คนยังเป็นผู้ตัดสินใจเสมอ **ไม่ได้วัดความแม่นยำ** การทดสอบด้วยคนไม่กี่คนไม่พอจะออกตัวเลขความแม่นยำ ตัวเลขความแม่นยำต้องมาจากชุดนำร่อง
(`docs/pilot/PILOT-EXAM.md`, `PILOT-GATE.md`, `PILOT-CROWD.md`, `docs/PILOT-PLAN.md`) และห้ามนำผลจากคู่มือนี้ไปเขียนเป็นข้อกล่าวอ้างในเอกสารขาย

**ข้อกำหนดทั่วไป**

| รายการ | ทำอย่างไร |
|---|---|
| เบราว์เซอร์ | Chrome หรือ Edge รุ่นล่าสุด (Exam ใช้ Chrome/Edge ตาม `docs/pilot/PILOT-EXAM.md` §4) จดชื่อรุ่นและเวอร์ชัน |
| ที่อยู่หน้าเว็บ | `https://anirut77.github.io/lensiq/<ชื่อหน้า>` เช่น `exam-lab.html` |
| โปรไฟล์ทดสอบ | สร้างโปรไฟล์ Chrome ใหม่สำหรับทดสอบ เสร็จแล้วลบโปรไฟล์ทิ้ง ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์ของเครื่องนี้ (localStorage / IndexedDB) จึงลบได้ครบ |
| ข้อมูลทดสอบ | ใช้ชื่อสมมติ เช่น "ทดสอบ หนึ่ง" รหัส E001 ห้ามใช้ชื่อ เลขบัตร หรือเบอร์จริงของพนักงานหรือลูกค้า |
| คนในภาพ | ใช้ตัวเองและผู้ช่วยที่ยินยอมด้วยวาจา ก่อนเปิดกล้อง บอกว่าภาพประมวลผลสดในเครื่อง ไม่บันทึก |
| ไฟล์ที่ได้ | ไฟล์ส่งออก (JSON, CSV) เก็บในโฟลเดอร์นอก repo เช่น `~/LENSIQ-field/owner-tests/` ห้ามเอาภาพคนหรือป้ายทะเบียนจริงเข้า repo (`CLAUDE.md`) |
| ภาษา | ทุกหน้า สลับ ไทย / EN / 中文 จากปุ่มภาษาที่แถบด้านบน ตรวจว่าข้อความไม่ปะปนและไม่ขาด |
| ผ่าน/ไม่ผ่าน | ข้อที่ทำเครื่องหมาย ★ ต้องผ่านทุกข้อจึงจะนับว่า "ผ่าน" ข้อที่ไม่ผ่านให้จดอาการ (ไม่ต้องแก้เอง) แล้วส่งให้ทีมแก้ในรอบถัดไป |

**ตัวเลขที่มีอยู่แล้วใน repo (ใช้เทียบว่าหน้าเว็บบอกตรงกับเอกสาร ไม่ใช่ผลของคู่มือนี้)**

| เรื่อง | ค่า | n | ที่มา | เอกสาร |
|---|---|---|---|---|
| Exam: สัญญาณ "มากกว่าหนึ่งคน" ในโหมดห้องคอมพิวเตอร์ ตรวจเจอคนที่สอง | 28.8% (15 / 52 ภาพ) แจ้งผิดเมื่อมีคนเดียว 0 / 17 | 52 + 17 ภาพ | ชุดข้อมูลสาธารณะ (Open Images V7 ชุดทดสอบแยก ไม่ใช่ภาพห้องสอบจริง) | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2, `docs/EXAM.md` |
| Exam: ห้องสอบจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด | `docs/EXAM.md` |
| Attendance: จำใบหน้าเอเชียได้ต่อการสแกน (ลงทะเบียน 5 / 200 คน) | 76% / 66% | 500 คน × 5 ภาพ | ชุดข้อมูลสาธารณะ (CASIA-FaceV5) ใช้เฉพาะเมื่อเปิดตัวเลือกใบหน้า | `docs/ONE-PAGER-ATTENDANCE.md` |
| Attendance: PIN / QR | ไม่มีตัวเลขความแม่นยำ (ไม่มีการจดจำ) | — | ไม่เกี่ยวข้อง | `docs/ATTENDANCE-READINESS.md` |
| Gate: หาป้ายเจอ (กรอบแรก) ชุดเดโมที่ไม่ได้ใช้ปรับแต่ง | 97.1% (136 / 140) | 140 ฉาก | ข้อมูลจำลอง (seed 7) | `docs/GATE.md` §3b |
| Gate: ภาพถ่ายจริง อ่านถูกทั้งป้ายโดยไม่ต้องแตะ / ต้องแตะกรอบเอง | 32% (7 / 22) / 78% (25 / 32) | 22 / 32 ภาพ | ชุดข้อมูลสาธารณะ (Wikimedia Commons) บางภาพอยู่ในชุดที่ใช้ปรับค่า | `docs/GATE.md` §3c, `docs/ONE-PAGER-GATE.md` |
| Gate: ไซต์จริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด | `docs/pilot/PILOT-GATE.md` |
| Crowd: ฝูงชนราว 300 คน | นับได้ราว 1 คนต่อภาพ (ยังไม่เหมาะกับฝูงชนหนาแน่น) | 2 + 7 ภาพ | ชุดข้อมูลสาธารณะ ผลเบื้องต้น (AI นับเทียบ ไม่ใช่คน 2 คน) | `docs/CROWD-ACCURACY.md`, `docs/ONE-PAGER-CROWD.md` |
| Crowd: 15–22 คน / 30–50 คน | นับต่ำกว่าจริง 26% / 58% | 12 / 20 ภาพ | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| Crowd: ไซต์จริง | ยังไม่ได้วัด (รอผู้นับ 2 คน) | — | หน้างานจริง: ยังไม่ได้วัด | `docs/pilot/PILOT-CROWD.md` |

**แผ่นจด:** ทุกผลิตภัณฑ์ใช้หัวข้อเดียวกัน: วันที่ · เครื่อง/เบราว์เซอร์/เวอร์ชัน · ข้อที่ผ่าน · ข้อที่ไม่ผ่านพร้อมอาการและข้อความที่หน้าจอแสดง · ข้อที่งง (ข้อความอ่านไม่รู้เรื่อง)
บันทึกลงไฟล์เดียวต่อผลิตภัณฑ์ เช่น `~/LENSIQ-field/owner-tests/2026-11-xx-exam.md`

---

## 1. Exam (โหมดห้องคอมพิวเตอร์: `exam-lab.html`, `exam.html`, `exam-dashboard.html`)

**ขอบเขต:** โหมด B (ห้องคอมพิวเตอร์) เป็นตัวหลักของการนำร่อง ตามที่เจ้าของตัดสินใจ 10 พ.ย. 2569 (`docs/pilot/PILOT-EXAM.md` §2)
โหมด A (`exam-hall.html`) เป็นรุ่นทดลอง ยังไม่เปิดขาย ไม่ต้องทดสอบรอบนี้ ข้อจำกัดที่ยอมรับแล้ว: โหมด B **ยังไม่ส่งสด** เหตุการณ์ไปแดชบอร์ดบนเครื่องอื่น
ต้องส่งออกไฟล์ JSON จากเครื่องผู้สอบแล้วนำเข้าแดชบอร์ด

### 1.1 เตรียม

- โน้ตบุ๊กที่มีเว็บแคม 1 เครื่อง (ถ้ามีเครื่องที่สองสำหรับแดชบอร์ดยิ่งดี ถ้าไม่มีใช้อีกแท็บของเครื่องเดียวกัน)
- ผู้ช่วย 1 คน (คนที่สองเข้าภาพ ใช้ทดสอบสัญญาณ "มากกว่าหนึ่งคน")
- โทรศัพท์ของตัวเอง 1 เครื่อง (ใช้ถือให้กล้องเห็น)
- ห้องที่แสงหน้าตรงปกติ และสถานที่ที่ทำให้แสงน้อยหรือย้อนแสงได้ (ปิดไฟ / หันหลังให้หน้าต่าง)
- แผ่นจด หรือไฟล์ข้อความเปล่า และนาฬิกาจับเวลา

### 1.2 ขั้นตอน

| # | ทำ | ควรเห็น |
|---|---|---|
| E1 ★ | เปิด `exam.html` อ่านรายการ "ไม่ทำ" และตารางสัญญาณ เลื่อนไปที่ `#notice` | ประกาศพิมพ์ได้ 3 ภาษา ไม่มีคำว่า "ตรวจพบทุจริต" ไม่มีคะแนนความน่าสงสัย ระบุว่าโหมดห้องสอบที่มีกล้อง (A) เป็นรุ่นทดลอง สัญญาณ "มากกว่าหนึ่งคน" ระบุว่าเป็นตัวช่วย (ตัวเลข 28.8% = 15 / 52) |
| E2 ★ | เปิด `exam-lab.html` แถบขั้นตอน 4 ขั้น: 1 ประกาศและความยินยอม · 2 กล้องและแสง · 3 ปรับเทียบ · 4 ทำข้อสอบ ดูแถวสถานะตัวตรวจใบหน้า | ตัวตรวจใบหน้าโหลดได้ ถ้าโหลดไม่ได้ หน้าต้องแจ้ง "ปรับการติดตั้ง" ไม่ใช่ทำเงียบ ๆ |
| E3 ★ | กรอก "รหัสห้องสอบ" (เช่น LAB1) และ "เลขที่นั่ง / เลขประจำตัวสอบ" (ใช้เลขที่นั่ง เช่น 12 ไม่ใช้เลขประจำตัวนักศึกษาจริง) **ยังไม่ติ๊ก** ยินยอม กด "ถัดไป: ตรวจกล้องและแสง" | ไปต่อไม่ได้ ข้อความบอกให้ยินยอมก่อน กล้องยังไม่เปิด |
| E4 ★ | กด "ไม่ยินยอม / ขอทางเลือกอื่น" | หน้าบอกทางเลือกสำหรับผู้ไม่ยินยอม กล้องไม่เปิด (การไม่ยินยอมต้องไม่เสียสิทธิสอบ ตาม `docs/pilot/PILOT-EXAM.md` §8) |
| E5 | ติ๊กยินยอม แล้วกด "ถัดไป: ตรวจกล้องและแสง" อนุญาตกล้อง | เห็นภาพกล้อง มาตร "คุณภาพภาพและแสง" และรายการตรวจ มีตัวบอกว่าแสงดี/พอใช้/แย่ |
| E6 ★ | ปิดไฟหรือหันหลังให้หน้าต่างให้แสงแย่ | หน้าขอ "ปรับการติดตั้ง" (แสง/ตำแหน่งกล้อง) ไม่ขึ้นเป็นการแจ้งเตือนต่อผู้สอบ ตามกฎ "แสงแย่ = แก้การติดตั้ง ไม่ใช่แจ้งเหตุ" (`docs/EXAM.md`) |
| E7 | แสงปกติ กด "ถัดไป: ปรับเทียบ" เลือก 15 วินาที (รอบทดสอบ; การนำร่องใช้ 2 นาที) นั่งหน้าตรง | แถบความคืบหน้าเดิน ปุ่ม "เข้าเต็มจอและเริ่มสอบ" เปิดใช้เมื่อเสร็จ ถ้าใบหน้าเดี่ยวน้อยกว่า 60% ของเฟรม ปรับเทียบล้มเหลวและปิดสัญญาณหันศีรษะ แต่เริ่มสอบได้ (`docs/EXAM.md`) |
| E8 ★ | กด "เข้าเต็มจอและเริ่มสอบ" | เต็มจอ มีตัวบอก "กล้องช่วยผู้คุมสอบทำงานอยู่ · ไม่มีการส่งภาพ" ตลอดเวลา มีช่อง "พื้นที่ทำข้อสอบ" ใช้พิมพ์ได้ และมี "บันทึกเหตุการณ์ของฉัน" |
| E9 | **ทำเหตุการณ์ตามบท** แล้วจดเวลาจริง (ดู §1.3) | ผู้สอบเห็นข้อความเตือนแบบสุภาพก่อน ไม่ขึ้นคำตัดสิน เหตุการณ์ปรากฏใน "บันทึกเหตุการณ์ของฉัน" โดยไม่มีระดับหรือคะแนน |
| E10 ★ | กด "ส่งข้อสอบและปิดกล้อง" แล้วกด "ส่งออกบันทึก (ไฟล์สำหรับผู้คุมสอบ)" | ได้ไฟล์ `lensiq-exam-<ห้อง>-<ที่นั่ง>.json` กล้องดับ |
| E11 ★ | เปิดไฟล์ JSON ด้วยโปรแกรมแก้ข้อความ | มีเฉพาะห้อง เลขที่นั่ง เวลา ชนิดเหตุการณ์ ระดับ (Info/Watch/Check) ระยะเวลา **ไม่มีภาพ ไม่มีชื่อ ไม่มีข้อความที่พิมพ์ในช่องทำข้อสอบ** |
| E12 ★ | เปิด `exam-dashboard.html` กรอกรหัสห้องเดียวกัน ชื่อผู้คุมสอบ (ชื่อสมมติ) และที่นั่ง (เช่น `1-20`) กด "เปิดแดชบอร์ดห้องนี้" แล้วนำเข้า JSON ด้วยช่อง "นำเข้าไฟล์เหตุการณ์จากเครื่องที่ไม่มีเครือข่าย (.json)" | ผังที่นั่งและรายการ "ที่ควรไปดู" แสดงเหตุการณ์ที่ทำไว้ใน E9 ไม่มีข้อผิดพลาดตอนนำเข้า |
| E13 ★ | ในรายการ ลองกดดำเนินการโดย**ไม่ใส่**ชื่อผู้คุมสอบ / ลองบันทึกหมายเหตุหรือ Escalate โดยไม่เขียนหมายเหตุ | ระบบไม่ยอม (ทุกการกระทำต้องมีชื่อผู้คุมสอบ; หมายเหตุและ Escalate ต้องมีข้อความ ตาม `docs/EXAM.md`) |
| E14 | กด "แจ้งถูก" / "แจ้งผิด" ในบางข้อสังเกต แล้วดูตาราง "ตรวจความแม่นยำหน้างาน" | ตารางแสดงจำนวนแจ้งถูก/แจ้งผิดต่อข้อสังเกต พร้อมช่วง 95% (Wilson) "แจ้งถูก" หมายถึงสิ่งที่ระบบบอกว่ามี ไม่ใช่การทุจริต |
| E15 ★ | กด "ส่งออก CSV" และ "พิมพ์รายงานสำหรับคณะกรรมการ (PDF)" | CSV เรียงตามเวลา (ไม่เรียงตามความน่าสงสัย) เปิดในสเปรดชีตแล้วภาษาไทยอ่านได้ รายงานพิมพ์ระบุว่าข้อสังเกตไม่ใช่หลักฐานการทุจริต ไม่มีรูปภาพ |
| E16 | กรอกฟอร์ม "เงื่อนไขเฉพาะบุคคล" ให้ที่นั่งหนึ่ง (เช่น ยืดเวลา "ไม่เห็นใบหน้า") กด "บันทึกเงื่อนไข" | แสดงในรายการเงื่อนไข ไม่ต้องระบุการวินิจฉัย |
| E17 ★ | เปิดแดชบอร์ดบน**เครื่องอื่น** (หรือเบราว์เซอร์อื่น) ขณะผู้สอบกำลังสอบอยู่ แล้วดู | **ไม่เห็นเหตุการณ์สด** (ข้อจำกัดที่ยอมรับแล้ว ต้องแจ้งไซต์ก่อนนำร่อง) ถ้าเห็น ให้จดไว้ว่าเกิดได้อย่างไร (แท็บในเบราว์เซอร์เดียวกันใช้ BroadcastChannel ร่วมกันได้) |
| E18 | กด "ล้างข้อมูลห้องนี้" ในแดชบอร์ด | ผังและรายการเหตุการณ์ของห้องนั้นหายไป |
| E19 | ไม่มีกล้อง/ไม่อยากเข้าภาพ: กด "สาธิต: จำลองเหตุการณ์" ในแดชบอร์ด | เห็นเหตุการณ์จำลองครบวงจร (ใช้ดูหน้าตาเท่านั้น ไม่นับเป็นผลทดสอบ) |

### 1.3 บทเหตุการณ์ (ทำทีละอย่าง จดเวลาที่ทำ และเวลาที่เห็นข้อความ)

| ลำดับ | ทำ | ค่าตั้งต้นของระบบ (ตารางสัญญาณใน `docs/EXAM.md`) | เวลาที่ทำ | ระบบแจ้งหรือไม่ / ใช้กี่วินาที |
|---|---|---|---|---|
| 1 | ก้มหรือหันหน้าออกจากกล้อง 10 วินาที | ไม่เห็นใบหน้า: เตือนที่ 5 วินาที Watch ที่ 10 วินาที | | |
| 2 | หันศีรษะไปด้านข้างนาน > 8 วินาที | หันศีรษะ > 35° เกิน 8 วินาที = Info | | |
| 3 | ถือโทรศัพท์ให้กล้องเห็นชัด 10 วินาที | โทรศัพท์ = Check (ต้องเห็นใน 3 จาก 5 เฟรมตรวจ) | | |
| 4 | ให้ผู้ช่วยเข้าภาพข้างหลังเรา 10 วินาที | "มากกว่าหนึ่งคน" เป็นตัวช่วย ไม่ครบถ้วน (วัดได้ 28.8% บนภาพสาธารณะ) **การไม่แจ้งไม่ใช่ความผิดพลาดที่ต้องรายงานเป็นบั๊ก** จดผลเฉย ๆ | | |
| 5 | กด Esc ออกจากเต็มจอ | Watch + ปุ่ม "กลับเข้าเต็มจอ" | | |
| 6 | สลับไปแท็บอื่น ≥ 5 วินาที แล้วกลับ | ออกจากหน้า = Watch | | |
| 7 | วางข้อความยาวกว่า 50 ตัวอักษรในช่องทำข้อสอบ | paste > 50 ตัวอักษร = Watch (เก็บเพียงจำนวนตัวอักษร ไม่เก็บข้อความ) | | |
| 8 | คัดลอก / คลิกขวา | Info (จดไว้ ไม่เตือน) | | |
| 9 | ปิดเลนส์กล้อง 15 วินาที | ไม่เห็นใบหน้า | | |
| 10 | ปิดอินเทอร์เน็ตของเครื่อง 10 วินาที แล้วเปิดใหม่ | offline / online ถูกบันทึก | | |

### 1.4 จดอะไร

- เบราว์เซอร์ + เวอร์ชัน ระบบปฏิบัติการ รุ่นเครื่อง เว็บแคม (รุ่น ความละเอียดที่หน้าแจ้ง)
- สถานะตัวตรวจใบหน้า (โหลดได้/ไม่ได้) เวลาโหลดโดยประมาณ คำตัดสินแสงแต่ละครั้ง
- ตาราง §1.3: เหตุการณ์ไหนแจ้ง ไหนไม่แจ้ง ใช้กี่วินาที (ใช้เทียบกับตารางสัญญาณ ไม่ใช่การวัดความแม่นยำ)
- ข้อความบนหน้าจอที่อ่านแล้วไม่เข้าใจ หรือฟังดูเหมือนตัดสินคน (ถ้ามี ถือว่าไม่ผ่านข้อ E1/E9)
- ขนาดไฟล์ JSON/CSV และจำนวนเหตุการณ์

### 1.5 ผ่าน / ไม่ผ่าน

**ผ่าน** = E1 E2 E3 E4 E6 E8 E10 E11 E12 E13 E15 E17 ผ่านทั้งหมด **และ** ไม่พบภาพ ชื่อ หรือข้อความที่พิมพ์ในไฟล์ส่งออกเลย **และ** ไม่มีหน้าใดใช้คำตัดสิน
("ทุจริต" "โกง" คะแนนความน่าสงสัย) **ไม่ผ่าน** = ข้อใดข้างต้นไม่ผ่าน หรือ E6 ขึ้นเป็นการแจ้งเตือนแทนที่จะขอปรับการติดตั้ง
ผลบทเหตุการณ์ (§1.3) ไม่ใช่เกณฑ์ผ่าน/ไม่ผ่าน เพราะความแม่นยำยังไม่ได้วัดในห้องสอบจริง (`docs/EXAM.md`) เกณฑ์ความแม่นยำอยู่ในชุดนำร่อง `docs/pilot/exam-lab/`

---

## 2. Attendance (`attendance.html` โหมดลงเวลาทำงานพนักงาน: PIN / QR เป็นค่าเริ่มต้น ใบหน้าเป็นตัวเลือก)

**ขอบเขต:** ตามคำตัดสินของเจ้าของ PIN / QR คือค่าเริ่มต้น ใบหน้าเป็นตัวเลือกเมื่อพนักงานยินยอมเท่านั้น (`docs/ATTENDANCE-READINESS.md`)
ข้อจำกัดที่ต้องรู้ก่อนขาย: เก็บในเบราว์เซอร์เครื่องเดียวราว 20 คน × 2 ปี · ยังไม่มีกะหมุนเวียน · ยังไม่มีขออนุมัติลาออนไลน์ · ไม่คำนวณค่าจ้าง ภาษี ประกันสังคม · เวลาอิงนาฬิกาเครื่อง

### 2.1 เตรียม

- เครื่อง 1 เครื่องสำหรับเป็นจุดลงเวลา (โน้ตบุ๊กหรือแท็บเล็ต) และโปรไฟล์ Chrome ใหม่
- โปรแกรมตารางคำนวณ (Excel / Google Sheets / Numbers) สำหรับเปิดไฟล์ CSV
- เครื่องที่สอง หรือเบราว์เซอร์ที่สอง (ใช้ทดสอบรวมข้อมูลหลายจุด)
- พนักงานสมมติ 3 คน: E001 "ทดสอบ หนึ่ง" (PIN 1234, ใช้บัตร QR), E002 "ทดสอบ สอง" (ติ๊ก "ไม่ใช้ข้อมูลใบหน้า", PIN 5678), E003 "ทดสอบ สาม" (ไม่ตั้ง PIN)
- กะสมมติ 09:00–18:00 พัก 60 นาที ผ่อนผันมาสาย 5 นาที

### 2.2 ขั้นตอน

| # | ทำ | ควรเห็น |
|---|---|---|
| A1 ★ | เปิด `attendance.html` ค่าเริ่มต้นเป็นโหมด "เช็คชื่ออบรม/กิจกรรม" กดปุ่ม "ลงเวลาทำงานพนักงาน" | เปลี่ยนเป็นโหมดพนักงาน เห็นนาฬิกา ตัวเลือกประเภทการลงเวลา ปุ่ม "โหมดคิออสก์" และส่วน "จัดการเวลาทำงาน" |
| A2 ★ | เปิดกล่อง "ข้อมูลส่วนบุคคลในการลงเวลาทำงาน (PDPA) — อ่านก่อนใช้" | ระบุฐานกฎหมายและเก็บอย่างน้อย 2 ปี ใบหน้าเป็นข้อมูลชีวมิติ ใช้เมื่อยินยอมโดยชัดแจ้ง **ผู้ไม่ยินยอมลงเวลาด้วย PIN หรือ QR ได้ทันทีโดยไม่มีผลต่อการจ้างงาน** ไม่เก็บภาพ ไม่อ่านอารมณ์ |
| A3 ★ | แท็บ "ตั้งค่าและข้อมูล": ตั้งชื่อจุดลงเวลา ตั้ง PIN ผู้จัดการ (เช่น 9999) กด "บันทึกการตั้งค่า" ดูตัวเลือก "เก็บบันทึกเวลาทำงาน" | ตัวเลือกเริ่มที่ 2 ปี (ขั้นต่ำตามกฎหมาย) ไม่มีตัวเลือกต่ำกว่านี้ |
| A4 | แท็บ "กะการทำงาน": ตรวจกะที่มี หรือเพิ่มกะ 09:00–18:00 กด "บันทึกกะ" | กะถูกบันทึก และมีข้อความอธิบายกฎมาสาย/OT |
| A5 ★ | แท็บ "พนักงาน": เพิ่ม E001, E002 (ติ๊ก "ไม่ใช้ข้อมูลใบหน้า"), E003 กด "บันทึกพนักงาน" เปิดบัตร QR ของ E001 | ตารางแสดงทั้ง 3 คน มีบัตร QR ของ E001 พร้อมปุ่ม "พิมพ์บัตร" และ "ออกบัตรใหม่" (บัตรเดิมใช้ไม่ได้) |
| A6 ★ | แท็บ "PIN / QR": ใส่ E001 + PIN 1234 กด "ลงเวลา" | ขึ้นข้อความลงเวลาสำเร็จ และแถวใหม่ใน "ลงเวลาวันนี้" (ครั้งแรก = เข้างาน เมื่อเลือกประเภทอัตโนมัติ) |
| A7 ★ | ใส่ E001 + PIN ผิด 5 ครั้ง | ถูกล็อก (ล็อกหลังพลาด 5 ครั้งตาม `docs/ATTENDANCE-READINESS.md` ข้อ 4) |
| A8 | เปลี่ยนประเภทลงเวลาเป็น "เริ่มพัก" แล้วลงเวลา จากนั้น "กลับจากพัก" และ "ออกงาน" | 4 แถวในวันนี้ ลำดับถูกต้อง |
| A9 | กด "ออกบัตรใหม่" ที่ E001 แล้วลองวางรหัสบัตรเก่าในช่อง "บัตร QR" | บัตรเก่าใช้ไม่ได้ บัตรใหม่ใช้ได้ (ถ้า Chrome นี้สแกน QR ด้วยกล้องไม่ได้ จะมีข้อความให้ใช้เครื่องอ่านบัตรหรือ PIN) |
| A10 ★ | กด "โหมดคิออสก์" แล้วลองออกโดยใส่ PIN ผู้จัดการผิด แล้วใส่ถูก "ออกจากคิออสก์" | PIN ผิดออกไม่ได้ PIN ถูกออกได้ ระหว่างคิออสก์ใช้เฉพาะลงเวลา |
| A11 ★ | แท็บ "แก้ไขเวลาและประวัติ": เพิ่มเวลาที่ขาดให้ E003 ลอง**ไม่ใส่**ชื่อผู้ทำรายการและเหตุผล แล้วใส่ครบ | ไม่ยอมบันทึกถ้าขาดชื่อหรือเหตุผล เมื่อครบ รายการปรากฏใน "ประวัติการแก้ไข (ใคร · ก่อน · หลัง · เหตุผล)" และ**ไม่แก้บันทึกดิบ** (เพิ่มต่อท้ายเท่านั้น) |
| A12 ★ | แท็บ "สรุปเดือนและเงินเดือน": กด "ส่งออก CSV เงินเดือน" "ส่งออก CSV รายวัน" "ส่งออก CSV ประวัติการแก้ไข" เปิดในสเปรดชีต | ภาษาไทยอ่านได้ (UTF-8 BOM) หัวคอลัมน์สองภาษา ชั่วโมงเป็นทศนิยม ตัวเลขตรงกับที่ลงเวลาไว้ ชื่อที่ขึ้นต้นด้วย `=` ถูกทำให้ปลอดภัย (ลองตั้งชื่อ E003 เป็น `=1+1` หนึ่งรอบ) |
| A13 | ตั้งวันหยุดและบันทึกวันลา 1 รายการ (แท็บ "วันหยุดและการลา") | แสดงในปฏิทินและสรุปเดือน มีคำเตือนถ้าปีนั้นมีวันหยุดไม่ครบ 13 วัน |
| A14 ★ | รวมข้อมูล 2 เครื่อง: ที่เครื่องที่สองลงเวลาอีก 2 รายการ แล้วกด "ส่งออกไฟล์บันทึกเวลา" นำเข้าที่เครื่องหลักด้วย "นำเข้าไฟล์จากเครื่องอื่น" แล้วนำเข้าไฟล์เดิมซ้ำ | รายการรวมเข้ามา ครั้งที่สองไม่เพิ่มซ้ำ เปิดไฟล์ JSON: **ไม่มี PIN แฮช รหัสบัตร ค่าใบหน้า หรือภาพ** ไฟล์ที่มีคีย์แปลกถูกปฏิเสธ |
| A15 ★ | กด "ส่งออกบันทึกของพนักงานคนนี้ (คำขอเข้าถึงข้อมูลตาม PDPA)" ของ E001 | ได้ไฟล์เฉพาะของ E001 |
| A16 | **ใบหน้า (เฉพาะใบหน้าของเจ้าของเองเท่านั้น)** แท็บ "ลงทะเบียนใบหน้า": ลงทะเบียนด้วยรหัส E001 แล้วที่แท็บ "เช็คชื่อ" กด "เริ่มสแกน" ลองลงทะเบียน E002 | E001 ลงเวลาด้วยใบหน้าได้ และซ้ำภายใน 60 วินาทีถูกเมินเฉย **E002 ลงทะเบียนใบหน้าไม่ได้** (ติ๊กไม่ใช้ใบหน้าไว้) |
| A17 ★ | ในส่วน "ความเป็นส่วนตัวของข้อมูลใบหน้า" กด "ลบข้อมูลใบหน้าทั้งหมด" แล้วลงเวลา E001 ด้วย PIN | ใบหน้าถูกลบ ลงเวลาด้วย PIN ได้ตามปกติ บันทึกเวลาเดิมยังอยู่ (ระยะเก็บแยกจากข้อมูลใบหน้า) |
| A18 | ดูพื้นที่เก็บข้อมูลที่หน้าแสดง | มีตัวบอกการใช้พื้นที่ และเตือนเมื่อเกินราว 3.5 MB |
| A19 | ลองสลับภาษา EN / 中文 | ข้อความพนักงาน/กะ/ลา/ข้อความเตือนแปลครบ |
| A20 | เสร็จแล้วลบโปรไฟล์ Chrome ทดสอบ | ข้อมูลทดสอบหายหมด |

### 2.3 จดอะไร

- ทุกข้อ ★ ผ่านหรือไม่ พร้อมข้อความที่หน้าจอแสดงเมื่อไม่ผ่าน
- ตรวจ CSV: เทียบ 3 คน × ชั่วโมงทำงาน / สาย (นาที) / OT ที่ระบบคำนวณกับที่คำนวณมือ (กะ 09:00–18:00 ผ่อนผัน 5 นาที) จดความต่าง (ถ้ามี)
- เวลาที่ใช้ลงเวลาด้วย PIN ต่อคน (วินาที) และจำนวนคลิก
- ถ้าทำ A16: จำนวนครั้งที่สแกนจนติด อย่านำไปอ้างเป็นความแม่นยำ (ใช้ตัวเองคนเดียว n = 1)
- ข้อความที่อ่านไม่เข้าใจ ทั้ง 3 ภาษา

### 2.4 ผ่าน / ไม่ผ่าน

**ผ่าน** = ทุกข้อ ★ ผ่าน และตัวเลขใน CSV ตรงกับการคำนวณมือ **ไม่ผ่าน** = ข้อ ★ ใดไม่ผ่าน หรือ CSV ไม่ตรง หรือพบภาพ/ค่าใบหน้า/PIN ในไฟล์ส่งออก
ใบหน้า (A16–A17) ไม่เป็นเกณฑ์ขาย เพราะเป็นตัวเลือก และน้ำหนักโมเดลใบหน้ารอความเห็นทางกฎหมายก่อนขายเชิงพาณิชย์ (`docs/ONE-PAGER-ATTENDANCE.md` ท้ายเอกสาร)
ข้อความด้านกฎหมายแรงงานต้องให้ทนายแรงงานไทยตรวจก่อนขาย (`docs/ATTENDANCE-READINESS.md`)

---

## 3. Gate (ช่วย รปภ.: `gate.html` → `parking.html` / `village.html` คนยืนยันป้ายทุกคัน)

**ขอบเขต:** ระบบเสนอเลขป้าย **รปภ. ยืนยันทุกคัน** ไม่เปิดไม้กั้นเองโดยไม่มีคน (ปิด "เปิดอัตโนมัติ" เป็นค่าเริ่มต้น) ไม่ใช้รีเลย์ในการทดสอบนี้
ข้อจำกัดที่ต้องรู้: บนภาพถ่ายจริง รปภ. ต้องแตะกรอบป้ายเองราว 4 ใน 5 คัน (78% = 25 / 32 ภาพ ชุดข้อมูลสาธารณะ Wikimedia Commons, `docs/GATE.md` §3c)

### 3.1 เตรียม

- โน้ตบุ๊กหรือมือถือที่มีกล้อง และโปรไฟล์ Chrome ใหม่
- ภาพป้ายทะเบียนจริง 5–10 ใบ: ใช้**รถของตัวเองหรือรถครอบครัวที่ยินยอม**ถ่ายด้วยมือถือ (กลางวัน 3–5 ภาพ กลางคืนหรือในที่มืด 2–3 ภาพ มอเตอร์ไซค์ 1 ภาพถ้ามี) เก็บภาพนอก repo ห้ามถ่ายป้ายรถคนอื่นโดยไม่จำเป็น
- ภาพที่ **ไม่มีป้าย** 3 ภาพ (ป้ายร้าน ป้ายบ้านเลขที่ เป็นต้น)
- แผ่นจด (ตาราง §3.3)
- (ถ้าจะทดสอบลานจอดจนถึงจ่ายเงิน) เบอร์พร้อมเพย์ของตัวเอง หรือข้ามการแสดง QR ไปทดสอบเงินสดอย่างเดียว

### 3.2 ขั้นตอน

| # | ทำ | ควรเห็น |
|---|---|---|
| G1 ★ | เปิด `gate.html` อ่านหัวข้อ "ความแม่นยำ: บอกตามจริง" และ "ตัวเลขที่วัดได้และที่มา" | มีตัวเลขพร้อม n และที่มา (จำลอง / ชุดข้อมูลสาธารณะ / "ยังไม่ได้วัด" สำหรับไซต์จริง) ตรงกับตารางใน §0 ไม่มีคำว่า "อัตโนมัติเต็มรูปแบบ" หรือแม่นยำ 99% |
| G2 ★ | เปิด `gate-notice.html` | ป้ายพิมพ์ได้ 3 ภาษา ระบุวัตถุประสงค์ ระยะเก็บ และช่องทางติดต่อ ไม่มีการจดจำใบหน้า |
| G3 ★ | เปิด `parking.html` หน้าแรกคือ "ก่อนเริ่ม: ประกาศข้อมูลส่วนบุคคล (PDPA)" ยัง**ไม่ติ๊ก**ข้อรับทราบ กด "เริ่ม" | เริ่มไม่ได้ ต้องติ๊กทั้งข้อ "ติดป้ายแจ้งแล้ว" และ "เข้าใจว่าระบบเสนอ คนเป็นผู้ตัดสิน" |
| G4 | ใส่ชื่อเจ้าหน้าที่สมมติ และชื่อช่องทาง ติ๊กรับทราบ กด "เริ่ม" | เข้าหน้าหลัก 6 แท็บ: ช่องทางเข้า-ออก · รถในลาน · บันทึก · ปิดกะ · ตั้งค่า · ตรวจความแม่นยำ |
| G5 ★ | แท็บ "ช่องทางเข้า-ออก" กด "ใช้ภาพตัวอย่าง" แล้ว "อ่านป้ายตอนนี้" (ครั้งแรกจะโหลดโมเดลอ่านอักษรไทย 7.5 MB และตัวหาป้าย 4.1 MB ต้องต่ออินเทอร์เน็ต) | ขึ้นเลขป้ายตัวอย่าง (เช่น 1กข 2345) ใน "ยืนยันเลขทะเบียน" ตัวอักษรที่ไม่แน่ใจมีขีดเส้นใต้ ปุ่ม "บันทึกรถเข้า" ยังต้องให้คนกด |
| G6 ★ | แก้เลขป้ายให้ผิดโดยตั้งใจ (เช่น ลบเลขตัวแรก) แล้วบันทึกรถเข้า | ถ้าไม่แน่ใจเลขหน้า ระบบบังคับให้เลือกการอ่านก่อนบันทึก การแก้ปรากฏในแท็บ "บันทึก" ส่วนประวัติการแก้ไข (ใคร · ก่อน · หลัง · เวลา) แก้ย้อนหลังไม่ได้ |
| G7 ★ | ในกล่อง "ผลการอ่านของระบบ" กด "✓ อ่านถูก" / "✗ อ่านผิด" สลับกัน 2–3 คัน | ปุ่มทำงาน นับเข้าการตรวจความแม่นยำ ไม่บันทึกอัตโนมัติโดยไม่มีคน |
| G8 ★ | กด "เปิดกล้อง" ชี้ไปที่ภาพป้ายจริงของคุณทีละใบ (หรือภาพบนจอ) แล้ว "อ่านป้ายตอนนี้" ถ้าตัวหาป้ายไม่เจอ แตะหรือลากกรอบรอบป้าย บันทึกใน §3.3 | ผลแต่ละใบมีให้ดู ถ้าอ่านผิด คนต้องแก้ ไม่มีอะไรบันทึกโดยไม่ผ่านการยืนยัน |
| G9 ★ | ชี้กล้องไปที่ภาพที่**ไม่มีป้าย** (3 ภาพ) กด "อ่านป้ายตอนนี้" และเปิด "อ่านอัตโนมัติ" ด้วย | ไม่ขึ้นเลขป้ายอัตโนมัติ (ผลวัดบนภาพจำลอง 0 / 20 และบนภาพสาธารณะ 0 / 19, `docs/GATE.md` §3c) ถ้าขึ้น จดภาพนั้นและข้อความ ถือว่า**ไม่ผ่าน** |
| G10 | บันทึกรถเข้า แล้วทำ "รถออก: คิดค่าจอด" กับป้ายเดียวกัน | ระบบจับคู่เข้า-ออกและคิดค่าจอดตามกฎในแท็บ "ตั้งค่า" (ตรวจกับการคำนวณมือ 2 กรณี: ในเวลาฟรี / เกินเวลา) |
| G11 | ชำระ "รับเงินสด" และ "พร้อมเพย์ (QR)" (ถ้าใส่เบอร์ของตัวเอง) แล้วพิมพ์ใบเสร็จ | QR แสดงยอด ระบบ**ไม่ตรวจว่าเงินเข้า** ต้องกด "ตรวจยอดเข้าแล้ว — ยืนยันชำระ" เอง ใบเสร็จมีเลขที่ |
| G12 | แท็บ "ปิดกะ": เปิดกะ ใส่เงินทอนตั้งต้น ปิดกะด้วยเงินสดที่นับได้ | สรุปกะตรงกับใบเสร็จที่ทำ ส่วนต่างแสดงชัด |
| G13 ★ | แท็บ "ตรวจความแม่นยำ" กด "เริ่มตรวจ" อ่านอย่างน้อย 10 คัน (ใช้ ✓/✗) แล้ว "จบและคำนวณ" ส่งออกผล (.json) | ผลขึ้นข้อความว่าข้อมูลยังไม่พอ (เกณฑ์ต้อง ≥ 100 คัน รวม ≥ 30 กลางคืน) **ห้ามถือว่าเป็นผลความแม่นยำของไซต์** ไฟล์ส่งออกไม่มีภาพ |
| G14 ★ | ส่วน "การเก็บรักษา (ลบอัตโนมัติ)" | ภาพครอปป้าย**ปิดเป็นค่าเริ่มต้น** ถ้าเปิดเก็บ 7–30 วัน บันทึกเข้า-ออก 90 วันเป็นค่าเริ่มต้น (`docs/ONE-PAGER-GATE.md` หัวข้อ PDPA) |
| G15 ★ | เปิด `village.html` ทำขั้นเดียวกับ G3–G4 แล้วเพิ่มรถลูกบ้าน (บ้านเลขที่ ป้าย) เพิ่มรถในแท็บ "ห้ามเข้า" โดย**ไม่ใส่เหตุผล** แล้วใส่เหตุผล | ต้องมีเหตุผลทุกครั้ง |
| G16 ★ | แท็บ "ป้อมยาม" ลองอ่านป้าย 4 กรณี: รถลูกบ้าน / รถที่มีบัตรผ่านผู้มาติดต่อ / รถไม่รู้จัก / รถในรายการห้ามเข้า | ผลแสดงต่างกัน 4 แบบ ไม่รู้จัก = "ถามและติดต่อบ้านก่อนเปิด" ห้ามเข้า = "ห้ามเปิด แจ้งหัวหน้า" ไม่มีอะไรเปิดเองโดยไม่มีคนกด |
| G17 ★ | แท็บ "บัตรผ่านผู้มาเยือน": ออกบัตร (รหัส `V-XXXXXX`) กำหนดเวลาและจำนวนครั้ง แล้วตรวจรหัสหลังหมดเวลา | บัตรหมดอายุแสดงว่าหมดอายุ ปุ่ม "ส่งทาง LINE" แค่เปิดลิงก์แชร์ LINE ของผู้ใช้เอง |
| G18 ★ | แท็บ "ตั้งค่า" ส่วน "เปิดอัตโนมัติ (ปิดเป็นค่าเริ่มต้น)" | ปิดอยู่ กด "เปิดไม้กั้น (รปภ. ไม่ใช้ป้าย)" ได้เสมอและถูกบันทึก ถ้าไม่มีรีเลย์ ขึ้นให้เปิดที่กล่องควบคุม (บันทึกแล้ว) **ห้ามเปิดฟังก์ชันเปิดอัตโนมัติ** ในการทดสอบนี้ (ต้องผ่านการตรวจความแม่นยำหน้างานก่อน) |
| G19 ★ | ส่วน "การเก็บรักษา" กด "ลบข้อมูลทั้งหมดในเครื่องนี้" | ถามยืนยัน แล้วบันทึกทั้งหมดของหน้านี้หายไป |

### 3.3 จดอะไร (ต่อป้ายหนึ่งใบ)

| ป้ายจริง | ประเภท (รถ/มอเตอร์ไซค์) | แสง (กลางวัน/กลางคืน) | ระยะ (ม.) | ระบบเสนอ | หาป้ายเจอเองหรือต้องแตะ | แก้ไขหรือไม่ | วินาทีที่ใช้ยืนยัน |
|---|---|---|---|---|---|---|---|

- สรุปท้ายตาราง: อ่านถูกโดยไม่ต้องแตะ k / n, ต้องแตะ k / n, แก้ไข k / n (เป็นจำนวนดิบ ไม่ใช่ความแม่นยำ n เล็ก)
- ภาพที่ไม่มีป้าย: อ่านอัตโนมัติ k / 3
- ความเร็วการอ่าน (วินาทีต่อป้าย) ครั้งแรกและครั้งถัด ๆ ไป ความร้อนของเครื่อง

### 3.4 ผ่าน / ไม่ผ่าน

**ผ่าน** = ทุกข้อ ★ ผ่าน โดยเฉพาะ G6 G7 G9 G18 (คนยืนยัน ไม่มีการเปิด/บันทึกเองโดยไม่มีคน ไม่อ่านป้ายอัตโนมัติจากภาพที่ไม่มีป้าย) **ไม่ผ่าน** = ข้อ ★ ใดไม่ผ่าน
ไม่มีเกณฑ์ผ่านตามความแม่นยำในคู่มือนี้ เพราะผลบนภาพจริงยังต่ำ (32% อ่านถูกโดยไม่แตะ, n = 22) ผลิตภัณฑ์ขายเป็น "ผู้ช่วย รปภ." ไม่ใช่การอ่านอัตโนมัติ
(`docs/ONE-PAGER-GATE.md`) เกณฑ์ความแม่นยำที่ไซต์จริง (ขอบล่าง Wilson 95% ≥ 95% กลางวัน ≥ 85% กลางคืน) เป็นข้อเสนอในชุดนำร่อง `docs/pilot/PILOT-GATE.md` §5

---

## 4. Crowd (งานอีเวนต์: `crowd.html` — ทดลอง ผลเบื้องต้น)

**ขอบเขต:** ฝูงชนเบาบางถึงปานกลางเท่านั้น **ยังไม่เหมาะกับฝูงชนหนาแน่น** และห้ามใช้ตัดสินความปลอดภัยของฝูงชน (`docs/ONE-PAGER-CROWD.md`)
ตัวเลขทั้งหมดของหน้านี้เป็น "ผลเบื้องต้น" ที่ AI นับเทียบกับภาพนิ่ง ไม่ใช่คนนับสองคน (`docs/CROWD-ACCURACY.md`)

### 4.1 เตรียม

- โน้ตบุ๊กหรือมือถือที่มีกล้อง ขาตั้ง หรือที่วางให้กล้องอยู่สูงเห็นพื้นที่กว้าง
- ผู้ช่วยที่ยินยอม 3–6 คน (เดินผ่านเส้น ยืนในโซน)
- สถานที่ที่มีคนสัญจรจริง: โถง บูธ หรือทางเข้า (ถ้าไม่มี ใช้ผู้ช่วยในห้องกว้าง)
- เครื่องกดนับมือ 1 เครื่อง และผู้นับที่เป็นคนอีก 1 คนที่ไม่ดูจอ
- แผ่นจด: เวลา · จำนวนจริงในโซน · จำนวนที่หน้าจอแสดง

### 4.2 ขั้นตอน

| # | ทำ | ควรเห็น |
|---|---|---|
| C1 ★ | เปิด `crowd.html` ดูหัวข้อ "ความแม่นยำของการนับคน: ผลวัดเบื้องต้น" ป้าย "เบื้องต้น (PRELIMINARY)" | ตัวเลขมีที่มา (ชุดข้อมูลสาธารณะ ผลเบื้องต้น) และระบุว่ายังไม่เหมาะกับฝูงชนหนาแน่น (ราว 300 คน นับได้ราว 1 คนต่อภาพ) ไม่มีคำว่า "แม่นยำ 9x%" |
| C2 ★ | ยังไม่ติ๊ก "ติดป้ายแจ้งแล้ว และเข้าใจว่าหน้านี้ไม่บันทึกภาพ" กด "รับทราบ เริ่มใช้งาน" แล้วค่อยติ๊ก | ต้องติ๊กก่อนจึงเริ่มได้ ลิงก์ "พิมพ์ป้ายแจ้งการใช้กล้อง" (`camera-notice.html`) ใช้ได้ ข้อความ: นับกรอบตัวคนแบบไม่ระบุตัวตน ไม่จดจำใบหน้า ไม่บันทึกภาพหรือวิดีโอ |
| C3 | กด "ดูตัวอย่าง (ข้อมูลจำลอง)" แล้ว "หยุด" | เห็นกรอบคนและตัวเลขจำลอง |
| C4 ★ | กด "เปิดกล้อง" อนุญาตกล้อง ตั้ง "ชื่อจุดหรืออีเวนต์" | มีกรอบตัวคนทับภาพ ไม่มีปุ่มบันทึกวิดีโอ |
| C5 | "วาดโซน" คลิกมุมบนภาพ แล้ว "เสร็จ" หรือ "เพิ่มโซนสี่เหลี่ยม" กำหนดบทบาทโซน จำนวนสูงสุด และพื้นที่ (ตร.ม.) | โซนปรากฏ จำนวนคนในโซนแสดงในส่วน "ตอนนี้" |
| C6 ★ | **ทดสอบนับสั้น** ให้ผู้ช่วย 1, 3, 5 คนยืนใกล้กล้องในโซน และ 5 คนยืนไกลจากกล้อง ครั้งละ 30 วินาที จดจำนวนจริงเทียบกับ "คนในภาพตอนนี้" (ค่ามัธยฐาน 5 ภาพ) | คนใกล้และเห็นชัด: ค่าใกล้เคียง เมื่อคนตัวเล็ก/อยู่ไกล หน้าต้องเตือน "คนดูเล็ก" พร้อมวิธีแก้ (ผลเบื้องต้น: คนตัวเล็ก/ไกล นับต่ำกว่าจริง 37–59% ชุดข้อมูลสาธารณะ n = 29 ภาพ) |
| C7 ★ | "วาดเส้นนับเข้า–ออก" ให้ผู้ช่วยเดินข้ามเส้น เข้า 10 ครั้ง ออก 10 ครั้ง (ใช้ "สลับทิศเข้า/ออก" ถ้าทิศกลับ) | ตัวเลขเข้า/ออกใกล้ 10/10 จดจำนวนที่ขาด/เกิน ผลเบื้องต้นมีเพียงการข้ามเส้น 1 / 1 ครั้ง (n = 1, ชุดข้อมูลสาธารณะ) ผลของคุณจึงเป็นข้อมูลใหม่ |
| C8 ★ | ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค (อีเวนต์)" เป็น 100 ขณะในภาพมี 5 คน | หน้าเตือนว่าตัวตรวจจับล้า ตัวเลขใช้นับจำนวนไม่ได้ (ตรวจพบไม่ถึงครึ่งของที่คาด) |
| C9 | ตั้งจำนวนสูงสุดของโซนเป็น 2 ให้ 4 คนยืนต่อเนื่อง | ขึ้นเตือนโซนแน่นหลังเวลาที่ตั้ง และกลับปกติเมื่อลดลง |
| C10 ★ | ถ้ามีคนตั้งแต่ 15 คนในภาพ (หรือโซนแน่น ≥ 2 คน/ตร.ม.) | ตัวเลขแสดงเป็น "≈ ค่าประมาณ ไม่ใช่จำนวนที่แน่นอน" |
| C11 ★ | หลังใช้ ≥ 15 นาที ดู "ความหนาแน่นตามพื้นที่และเวลา" "รายงานช่วงเวลาคนเยอะ" แล้วกด "ส่งออก CSV รายงานการตลาด" และ "ส่งออกสรุปรวมยอด (JSON)" | หัว CSV ระบุว่าเป็นค่าประมาณ ไฟล์มีเฉพาะตัวเลขรวม ไม่มีภาพ |
| C12 | กด "พิมพ์สรุป" "พิมพ์รายงานช่วงคนเยอะ" | รายงานพิมพ์ได้ ระบุว่าเป็นค่าประมาณ |
| C13 ★ | กด "ลบข้อมูลสถิติทั้งหมด" | ถามยืนยัน แล้วข้อมูลสถิติหาย |
| C14 | (ถ้ามี) ทดสอบบนมือถือระดับกลาง: เปิด `crowd.html` ดูว่ากรอบคนลื่นไหลหรือกระตุก จดรุ่นเครื่อง | ผลที่มีอยู่: 355 ms ต่อภาพ (≈ 2.8 ครั้งต่อวินาที) จากเครื่องจำลองช้า ×4 บน Mac **ไม่ใช่มือถือจริง** (`docs/CROWD-ACCURACY.md`) |

### 4.3 จดอะไร

| เวลา | จำนวนจริงในโซน | จำนวนในภาพที่หน้าจอแสดง | แสง | ระยะคนจากกล้อง | หมายเหตุ ("≈" ขึ้นหรือไม่ "คนดูเล็ก" ขึ้นหรือไม่) |
|---|---|---|---|---|---|

- ข้ามเส้น: เข้าจริง / เข้าที่ระบบนับ · ออกจริง / ออกที่ระบบนับ
- รุ่นเครื่องและเบราว์เซอร์ ความสูงกล้อง มุม
- เขียนเป็น k / n (ไม่ใช่เปอร์เซ็นต์ล้วน) ผลของคุณเป็น**ข้อมูลภายใน** ไม่ใช้เป็นข้อกล่าวอ้างในเอกสารขาย

### 4.4 ผ่าน / ไม่ผ่าน

**ผ่าน** = ทุกข้อ ★ ผ่าน (ข้อความซื่อสัตย์ปรากฏ ไม่บันทึกภาพ ลบข้อมูลได้ รายงานระบุค่าประมาณ) ไม่มีเกณฑ์ผ่านตามความแม่นยำ เพราะความแม่นยำสุดท้ายรอผู้นับที่เป็นคนสองคน
(`docs/pilot/PILOT-CROWD.md` ขั้น 0a) และหน้างานจริงยังไม่ได้วัด **ไม่ผ่าน** = ข้อ ★ ใดไม่ผ่าน ถ้าคนน้อย (1–3 คนใกล้กล้อง แสงดี) แล้วคลาดเกิน ±2 คนต่อภาพซ้ำ ๆ ให้จดเป็นปัญหา
และห้ามเสนอสำหรับงานที่คาดว่ามีคนราว 50 คนขึ้นไปในภาพเดียว (นอกขอบเขตนำร่อง)

---

## 5. สรุปหลังทดสอบครบ 4 ผลิตภัณฑ์

| ผลิตภัณฑ์ | ผลการทดสอบ | เสนอได้ในรูปแบบ | ต้องบอกลูกค้าตรง ๆ |
|---|---|---|---|
| Exam (ห้องคอมพิวเตอร์) | ☐ ผ่าน ☐ ไม่ผ่าน | นำร่อง (ชุดใน `docs/pilot/exam-lab/`) | ไม่ส่งสดไปแดชบอร์ดเครื่องอื่น · "มากกว่าหนึ่งคน" เป็นตัวช่วย 28.8% (15 / 52 ภาพสาธารณะ) · ยังไม่วัดในห้องสอบจริง · ผู้คุมสอบตัดสินเสมอ |
| Attendance (PIN / QR) | ☐ ผ่าน ☐ ไม่ผ่าน | PIN / QR เป็นหลัก ใบหน้าเป็นตัวเลือก | เก็บในเบราว์เซอร์ราว 20 คน × 2 ปี · ไม่คำนวณเงินเดือน · รอทนายแรงงานตรวจ |
| Gate (ช่วย รปภ.) | ☐ ผ่าน ☐ ไม่ผ่าน | นำร่อง ช่วย รปภ. ยืนยันทุกคัน | ภาพจริง อ่านถูกโดยไม่แตะ 32% (7 / 22) รปภ. ต้องแตะเอง 78% · ไม่เปิดไม้กั้นเอง |
| Crowd (อีเวนต์) | ☐ ผ่าน ☐ ไม่ผ่าน | ทดลอง ฝูงชนเบาบางถึงปานกลาง | ยังไม่เหมาะกับฝูงชนหนาแน่น · ผลเบื้องต้น AI นับเทียบ · ห้ามใช้ตัดสินความปลอดภัย |

ยังไม่เปิดขาย: ราคาที่อนุมัติแล้วเป็น "ยังไม่เปิดขาย" (`docs/SALES-PACKAGES.md` และ one-pager แต่ละตัว) การเปิดขายเป็นการตัดสินใจของเจ้าของ และต้องให้ทนายความตรวจก่อน (`CLAUDE.md`)

---
---

# English

## 0. Read first

**What this guide checks:** each product (1) works as its page says, (2) states its limits honestly, (3) stores or sends nothing it should not, and
(4) leaves the decision to a person. **It does not measure accuracy.** A few people cannot produce an accuracy number. Accuracy numbers come from
the pilot kits (`docs/pilot/PILOT-EXAM.md`, `PILOT-GATE.md`, `PILOT-CROWD.md`, `docs/PILOT-PLAN.md`). Do not copy results from this guide into sales material.

**General rules**

| Item | How |
|---|---|
| Browser | Latest Chrome or Edge (`docs/pilot/PILOT-EXAM.md` §4). Write down the version. |
| Address | `https://anirut77.github.io/lensiq/<page>`, e.g. `exam-lab.html`. |
| Test profile | Make a new Chrome profile for the test and delete it afterwards. All data lives in this browser (localStorage / IndexedDB), so deleting the profile removes it all. |
| Test data | Made-up names ("Test One", code E001). Never real employee or customer names, ID numbers or phones. |
| People in view | Yourself and helpers who agree aloud. Before the camera starts, tell them the picture is processed live on this device and not recorded. |
| Files | Export files (JSON, CSV) go to a folder outside the repo, e.g. `~/LENSIQ-field/owner-tests/`. Never put images of people or real plates in the repo (`CLAUDE.md`). |
| Language | On every page switch TH / EN / 中文 with the language buttons in the top bar. Check nothing is missing or mixed. |
| Pass / fail | Steps marked ★ must all pass for "pass". For a failure, write the symptom (do not fix it yourself) and send it to the team. |

**Figures that already exist in the repo** (to check that each page says the same; they are not results of this guide):
Exam "more than one person": 28.8 % (15 / 52 frames with a second person; 0 / 17 false alarms; public dataset Open Images V7 held-out set, not exam rooms; `docs/exam/FACE-ENGINE-RESULTS.md` §7.2); exam rooms: not measured.
Attendance face (optional): 66–76 % recognised per scan, 200 / 5 enrolled (CASIA-FaceV5, 500 people × 5 images, public dataset; `docs/ONE-PAGER-ATTENDANCE.md`); PIN / QR has no accuracy figure.
Gate: plate found 97.1 % (136 / 140, synthetic, seed 7; `docs/GATE.md` §3b); real photos exact read without a tap 32 % (7 / 22) and tap needed 78 % (25 / 32), public dataset (Wikimedia Commons), some images used for tuning (`docs/GATE.md` §3c); real sites: not measured.
Crowd: about 300 people counted as about 1 per frame (n = 2 + 7 frames, public dataset, preliminary: an AI reference, not two humans); 15–22 people under-counted by 26 % (n = 12), 30–50 by 58 % (n = 20) (`docs/CROWD-ACCURACY.md`); real sites: not measured.

**Notes sheet** (same for every product): date · device / browser / version · steps passed · steps failed with symptom and on-screen text · anything confusing.
One file per product, e.g. `~/LENSIQ-field/owner-tests/2026-11-xx-exam.md`.

---

## 1. Exam (lab mode: `exam-lab.html`, `exam.html`, `exam-dashboard.html`)

**Scope:** Mode B (computer room) leads the pilot (owner decision 2026-11-10, `docs/pilot/PILOT-EXAM.md` §2). Mode A (`exam-hall.html`) is experimental, not on sale, not tested here.
Accepted limit: Mode B has **no live feed** to a dashboard on another machine; export JSON from the candidate PC and import it into the dashboard.

**Prepare:** a laptop with a webcam (a second machine for the dashboard if you have one, otherwise another tab); one helper (for the "more than one person" signal); your own phone; a place with
normal light and a way to make it dark or backlit; a stopwatch and a notes file. The Thai half (§1.2) gives the on-screen Thai labels.

| # | Do | Expect |
|---|---|---|
| E1 ★ | Open `exam.html`; read the "never" list, the signal table and `#notice`. | Printable notice in 3 languages; no "cheating detected", no suspicion score; Mode A marked experimental; "more than one person" described as an aid (28.8 % = 15 / 52). |
| E2 ★ | Open `exam-lab.html` (4 steps: notice and consent, camera and light, calibration, exam); look at the engine status line. | Face engine loads; if not, the page says "fix setup", never silent. |
| E3 ★ | Enter room code (e.g. LAB1) and seat number (a seat number, not a real student ID). Do not tick consent; press next. | Blocked with a message; camera stays off. |
| E4 ★ | Press the decline button. | The alternative for non-consenting candidates is shown; camera stays off; declining costs the candidate nothing (`docs/pilot/PILOT-EXAM.md` §8). |
| E5 | Tick consent, next, allow the camera. | Camera image, light meter, checks, light verdict (good / fair / poor). |
| E6 ★ | Make the light poor (lights off or window behind you). | The page asks to fix the setup; it does not raise an alert against the candidate (`docs/EXAM.md`). |
| E7 | Normal light; next to calibration; choose 15 s for the test (the pilot uses 2 min). | Progress bar runs; the start button enables. If fewer than 60 % of frames show a single face, calibration fails and head-turn is switched off, but the exam can still start. |
| E8 ★ | Enter fullscreen and start. | Fullscreen; a permanent "monitoring active, no image sent" indicator; an answer box; "my event log". |
| E9 | Do the scripted events (table below) and note real times. | Gentle prompts first, no verdict wording; events appear in the candidate's own log with no level or score. |
| E10 ★ | End the exam, then export the log. | File `lensiq-exam-<room>-<seat>.json`; camera off. |
| E11 ★ | Open the JSON in a text editor. | Only room, seat, time, event type, level (Info / Watch / Check), duration. **No image, no name, none of the text typed in the answer box.** |
| E12 ★ | Open `exam-dashboard.html`; enter the same room code, an invigilator name (made up) and seats (e.g. `1-20`); open the dashboard; import the JSON. | Seat map and "worth a look" queue show the events from E9; no import error. |
| E13 ★ | Try an action without an invigilator name; try Note / Escalate without a note. | Refused (every action needs a name; Note and Escalate need text; `docs/EXAM.md`). |
| E14 | Press "flag was right" / "flag was wrong" on some observations. | Per-signal table with a 95 % Wilson interval; "right" means what the system said was there, not misconduct. |
| E15 ★ | Export CSV and print the committee report. | CSV in time order (never ranked by suspicion), Thai readable in a spreadsheet; the report says a flag is not evidence of misconduct; no images. |
| E16 | Save an accommodation for one seat. | Listed; no diagnosis needed. |
| E17 ★ | While a candidate PC is running, open the dashboard on **another machine or browser**. | **No live events** (accepted limit; tell the site before the pilot). If you do see them, note how (tabs of one browser can share through BroadcastChannel). |
| E18 | Press "clear this room". | The room's seat map and log are gone. |
| E19 | No camera? Use the dashboard demo button. | Full simulated flow (for looks only; not a test result). |

**Scripted events** (one at a time; note when you did it and when the prompt appeared). Defaults are from the signal table in `docs/EXAM.md`:

| # | Do | System default |
|---|---|---|
| 1 | Look away from the camera for 10 s | no face: prompt at 5 s, Watch at 10 s |
| 2 | Turn the head sideways for more than 8 s | yaw > 35° for 8 s = Info |
| 3 | Hold a phone clearly in view for 10 s | phone = Check (3 of 5 detector frames) |
| 4 | Let the helper stand behind you for 10 s | "more than one person" is an aid (28.8 % on public photos); not alerting is not a bug to report, just record it |
| 5 | Press Esc to leave fullscreen | Watch + "return to fullscreen" button |
| 6 | Switch to another tab for 5 s or more | away = Watch |
| 7 | Paste more than 50 characters | Watch (only the length is kept, not the text) |
| 8 | Copy / right-click | Info |
| 9 | Cover the lens for 15 s | no face |
| 10 | Turn the network off for 10 s, then on | offline / online logged |

**Write down:** browser and version, OS, laptop and webcam model; face-engine status and load time; each light verdict; per scripted event: fired or not and after how many seconds
(a check against the signal table, not an accuracy measure); any text that reads like a verdict on a person; size of the JSON / CSV and number of events.

**Pass / fail:** **Pass** = E1, E2, E3, E4, E6, E8, E10, E11, E12, E13, E15 and E17 all pass, no image / name / typed text in any export, and no page uses verdict wording.
**Fail** = any of those fails, or E6 shows an alert instead of a setup request. Scripted-event results are not a pass criterion because accuracy in real exam rooms is not measured (`docs/EXAM.md`); accuracy criteria live in `docs/pilot/exam-lab/`.

---

## 2. Attendance (`attendance.html`, employee mode: PIN / QR by default, face optional)

**Scope:** PIN / QR is the default; face only for employees who explicitly consent (`docs/ATTENDANCE-READINESS.md`). Limits to know before selling: browser storage on one device, about 20 employees × 2 years;
no rotating rosters; no online leave approval; no wage, tax or social-security calculation; time comes from the device clock.

**Prepare:** one device as the clock-in point with a fresh Chrome profile; a spreadsheet program; a second device or browser (for the merge test); three made-up employees:
E001 "Test One" (PIN 1234, QR badge), E002 "Test Two" (tick "no face data", PIN 5678), E003 "Test Three" (no PIN); a made-up shift 09:00–18:00, 60 min break, 5 min late grace.

| # | Do | Expect |
|---|---|---|
| A1 ★ | Open `attendance.html` (default: training / event check-in). Press the employee-mode button ("ลงเวลาทำงานพนักงาน"). | Employee mode: clock, punch-type selector, kiosk button, "manage working time" section. |
| A2 ★ | Open the PDPA box at the top of employee mode. | Legal basis and a minimum 2-year retention; face is biometric data, used only with explicit consent; **anyone who declines uses PIN or QR at once with no effect on employment**; no image stored; no emotion reading. |
| A3 ★ | Tab "settings and data": device name, manager PIN, save; look at the retention options. | Options start at 2 years (the legal minimum); nothing lower. |
| A4 | Tab shifts: check or add the 09:00–18:00 shift and save. | Saved, with the late / OT rules explained. |
| A5 ★ | Tab employees: add E001, E002 (tick no face data), E003; open E001's QR badge. | Three rows; badge with print and "issue a new badge" (the old one stops working). |
| A6 ★ | Tab "PIN / QR": E001 + PIN 1234, punch. | Success message; a row in today's list (first punch = in with the automatic type). |
| A7 ★ | Enter a wrong PIN 5 times. | Locked (lock after 5 misses, `docs/ATTENDANCE-READINESS.md` §4). |
| A8 | Punch break out, break in, out. | Four rows today in order. |
| A9 | Issue a new badge for E001, then try the old badge text. | Old badge refused, new one works (if this Chrome cannot scan QR with the camera, the page says use a reader or PIN). |
| A10 ★ | Kiosk mode; try to exit with a wrong manager PIN, then the right one. | Wrong PIN stays in; right PIN exits. |
| A11 ★ | Tab corrections: add a missed punch for E003 first without a name and reason, then with both. | Refused without them; afterwards listed in the history (who, before, after, reason); raw punches are not edited (append-only). |
| A12 ★ | Tab month and payroll: export the payroll CSV, daily CSV and audit CSV; open in a spreadsheet. | Thai readable (UTF-8 BOM); bilingual headers; decimal hours; numbers match your punches; a name starting with `=` is neutralised (try `=1+1` once). |
| A13 | Add holidays and one leave record. | Shown in the calendar and month summary; warning if a year has fewer than 13 holidays. |
| A14 ★ | Merge two devices: punch twice on the second device, export the time file, import it on the main device, then import the same file again. | Entries merged; the second import adds no duplicates; the JSON holds **no PIN hash, badge token, face data or image**; a pack with unknown keys is refused. |
| A15 ★ | Export one employee's records (the PDPA access-request button). | A file for that employee only. |
| A16 | **Face, your own face only.** Register E001's face, scan; try registering E002. | E001 can punch by face; a repeat within 60 s is ignored; **E002 cannot be enrolled** (opted out). |
| A17 ★ | "Delete all face data", then punch E001 with the PIN. | Face data gone; PIN works; time records stay (retention is separate). |
| A18 | Look at the storage indicator. | Shows usage and warns from about 3.5 MB. |
| A19 | Switch to EN and 中文. | Employee / shift / leave / warning texts translated. |
| A20 | Delete the test Chrome profile. | All test data gone. |

**Write down:** each ★ pass / fail with the on-screen text on failure; for the CSV, hours / late minutes / OT for the 3 people compared with your hand calculation (shift 09:00–18:00, grace 5 min) and any difference;
seconds and clicks per PIN punch; if A16 was done, how many scans until accepted (n = 1, yourself: never quote it as accuracy); anything unclear in the three languages.

**Pass / fail:** **Pass** = all ★ steps pass and the CSV numbers equal your hand calculation. **Fail** = any ★ step fails, a CSV mismatch, or an image / face value / PIN in an export.
Face (A16, A17) is not a sale criterion: it is optional, and the face model weights await counsel's view before commercial sale (`docs/ONE-PAGER-ATTENDANCE.md`, last section).
A Thai labour lawyer must check the labour-law wording before sale (`docs/ATTENDANCE-READINESS.md`).

---

## 3. Gate (assisted: `gate.html` to `parking.html` / `village.html`; a person confirms every plate)

**Scope:** the system suggests a plate and **the guard confirms every vehicle**. No barrier opens by itself (auto-open is off by default); no relay is used in this test.
Known limit: on real photos the guard has to tap the plate box themselves for about 4 in 5 vehicles (78 % = 25 / 32 photos; public dataset, Wikimedia Commons; `docs/GATE.md` §3c).

**Prepare:** a laptop or phone with a camera; a fresh Chrome profile; 5–10 photos of real plates from **your own or a consenting family member's car** (3–5 daytime, 2–3 dark, 1 motorcycle if available), kept outside the repo;
3 photos **without** a plate (shop sign, house number, …); the notes table below; optionally your own PromptPay number (otherwise test cash only).

| # | Do | Expect |
|---|---|---|
| G1 ★ | Open `gate.html`; read "Accuracy: honestly" and "Measured numbers and sources". | Numbers with n and source (synthetic / public dataset / "not measured" for real sites) matching the figures in §0; no "fully automatic" or "99 %". |
| G2 ★ | Open `gate-notice.html`. | Printable sign in 3 languages with purpose, retention and a contact; no face recognition. |
| G3 ★ | Open `parking.html`; the first screen is the PDPA notice. Press start without ticking the acknowledgements. | Cannot start; both acknowledgements (sign posted; the system suggests and staff decide) are needed. |
| G4 | Enter a made-up staff name and lane name, tick, start. | Six tabs: lane, cars inside, log, close shift, settings, accuracy check. |
| G5 ★ | Lane tab: "use sample image", then "read plate now" (first use downloads the 7.5 MB Thai text model and the 4.1 MB plate finder; needs internet). | A sample plate (e.g. 1กข 2345) appears in "Confirm the plate"; uncertain characters underlined; "record entry" still needs a human press. |
| G6 ★ | Deliberately make the plate wrong (delete the first digit) and save the entry. | If the leading digit is unclear you must pick a reading before saving; the correction appears in the log tab's edit history (who, before, after, when); it cannot be edited afterwards. |
| G7 ★ | In "System read" press ✓ / ✗ on 2–3 vehicles. | Works and feeds the accuracy check; nothing is saved without a person. |
| G8 ★ | Start the camera and point it at each of your real plate photos (or the screen); "read plate now"; if the finder misses, tap or drag a box. Note in the table below. | A result per plate; wrong reads must be corrected by a person; nothing is saved unconfirmed. |
| G9 ★ | Point at the **no-plate** photos and read, also with "read automatically" on. | No plate is read automatically (measured 0 / 20 synthetic and 0 / 19 public photos, `docs/GATE.md` §3c). If one is, record the photo and text: **fail**. |
| G10 | Record an entry, then "exit: calculate fee" for the same plate. | Entry / exit paired; fee follows the rules in settings (check by hand: one case inside free time, one over). |
| G11 | Pay cash, then PromptPay QR (if you entered your own number); print the receipt. | QR shows the amount; the page **does not verify payment**, you press "payment checked — confirm"; numbered receipt. |
| G12 | Close-shift tab: open a shift with a float, close with a counted drawer. | The summary matches the receipts you made; difference shown. |
| G13 ★ | Accuracy check tab: start, read at least 10 vehicles with ✓ / ✗, finish and calculate, export the result. | "Not enough data yet" (needs at least 100 vehicles incl. 30 at night). **Do not treat it as site accuracy.** The export has no images. |
| G14 ★ | "Retention (automatic deletion)". | Plate crops off by default; if switched on, deleted in 7–30 days; logs 90 days by default (`docs/ONE-PAGER-GATE.md`, PDPA section). |
| G15 ★ | Open `village.html`, repeat G3–G4, add a resident vehicle, then add to the deny list first without a reason, then with one. | A reason is required every time. |
| G16 ★ | Guard post: read 4 cases: resident, visitor with a pass, unknown, deny-listed. | Four distinct results; unknown = "ask and contact the house before opening"; deny = "do not open, inform the supervisor"; nothing opens without a press. |
| G17 ★ | Visitor passes: issue a pass (`V-XXXXXX`) with time and uses; check the code after it expires. | Expired pass shown as expired; the LINE button only opens the user's own LINE share link. |
| G18 ★ | Settings, "Auto-open (off by default)". | Off. "Open barrier (guard, no plate)" is always available and logged; with no relay it says to open at the control box (recorded). **Do not switch auto-open on** in this test (the on-site accuracy check comes first). |
| G19 ★ | "Delete all data on this device". | Asks to confirm, then everything on that page is gone. |

**Write down per plate:** real plate · type · day / night · distance (m) · suggested · found itself or tapped · edited · seconds to confirm.
Totals: exact without a tap k / n, tap needed k / n, edited k / n (raw counts, not accuracy; n is small); no-plate photos read automatically k / 3; read speed (first and later reads); device heat.

**Pass / fail:** **Pass** = all ★ steps pass, above all G6, G7, G9, G18 (a person confirms, nothing opens or saves by itself, no automatic read of a no-plate image).
**Fail** = any ★ step fails. There is no accuracy pass mark here because real-photo accuracy is still low (32 % exact without a tap, n = 22); the product is sold as a "guard assistant",
not as automatic reading (`docs/ONE-PAGER-GATE.md`). The proposed site criteria (Wilson 95 % lower bound ≥ 95 % day, ≥ 85 % night) are in `docs/pilot/PILOT-GATE.md` §5.

---

## 4. Crowd (events: `crowd.html`, experimental, preliminary numbers)

**Scope:** sparse to medium crowds only. **Not yet suitable for dense crowds** and never to be used for crowd-safety decisions (`docs/ONE-PAGER-CROWD.md`). All accuracy figures on the page are
preliminary: an AI reviewer counting still frames, not two humans (`docs/CROWD-ACCURACY.md`).

**Prepare:** a laptop or phone with a camera and somewhere to hold it high; 3–6 consenting helpers; a place with real foot traffic (hall, booth, entrance) or a large room; a hand tally counter and a human counter
who does not look at the screen; a notes table (time · real count in the zone · count on screen).

| # | Do | Expect |
|---|---|---|
| C1 ★ | Open `crowd.html`; the "counting accuracy: preliminary results" box and the PRELIMINARY badge. | Figures carry source (public dataset, preliminary) and say it is not yet suitable for dense crowds (about 300 people counted as about 1 per frame); no "9x % accurate". |
| C2 ★ | Press "acknowledge, start" without ticking "sign posted and I understand the page records no images". | Must tick first; link to the printable camera notice (`camera-notice.html`) works; text says anonymous person boxes, no face recognition, no image or video stored. |
| C3 | Press the demo button, then stop. | Simulated boxes and numbers. |
| C4 ★ | "Start camera", allow, set the site name. | Person boxes over the picture; there is no record-video control. |
| C5 | Draw a zone (click points, finish) or add a rectangle; set zone role, maximum people, area (m²). | Zone shown; its count appears under "Now". |
| C6 ★ | **Short counts:** 1, 3 and 5 helpers in the zone close to the camera, and 5 far from it, 30 s each; note the true count and the "people in view now" value (5-frame median). | Close and clear: near the true count. Small or far people: the page warns "people look small" with a fix (preliminary reference: small or far people under-counted 37–59 %, n = 29 frames, public dataset). |
| C7 ★ | Draw the in / out line; helpers cross 10 times in and 10 times out (use "swap direction" if reversed). | In / out near 10 / 10; note misses and extras. Preliminary evidence is one crossing, 1 / 1 (n = 1, public dataset): your numbers are new data. |
| C8 ★ | Set "expected peak crowd" to 100 while 5 people are in view. | The page warns that the detector is falling behind and the number cannot be used as a count (fewer than half of the expected). |
| C9 | Set the zone maximum to 2 and keep 4 people in it. | "Zone full" alert after the hold time; back to normal when it drops. |
| C10 ★ | Reach 15 or more people in view, or a zone at 2 or more per m². | The number is shown as "≈ estimate, not an exact count". |
| C11 ★ | After at least 15 minutes, look at the density views and the peak report; export the marketing CSV and the summary JSON. | The CSV header says estimate; files hold only totals, no images. |
| C12 | Print the summary and the peak report. | Printable and labelled as an estimate. |
| C13 ★ | "Delete all statistics". | Asks to confirm, then the statistics are gone. |
| C14 | If you have a mid-range phone, open `crowd.html` on it and note smoothness and model. | Existing reference: 355 ms per frame (about 2.8 per second) on a ×4 slowed Mac, **simulated, not a real phone** (`docs/CROWD-ACCURACY.md`). |

**Write down:** the table of times and counts; in / out true versus counted; device, browser, camera height and angle; use k / n counts, not bare percentages. Your results are **internal data**, never a sales claim.

**Pass / fail:** **Pass** = all ★ steps pass (honest texts present, no images stored, data can be deleted, reports say estimate). No accuracy pass mark: final accuracy awaits two human counters (`docs/pilot/PILOT-CROWD.md` phase 0a) and real sites are not measured.
**Fail** = any ★ step fails. If few people close to the camera in good light are repeatedly off by more than 2 per frame, record it as an issue. Do not offer Crowd for events expecting about 50 or more people in one view (outside the pilot scope).

---

## 5. After all four

| Product | Result | May be offered as | Tell the customer plainly |
|---|---|---|---|
| Exam (lab) | ☐ pass ☐ fail | pilot (kit in `docs/pilot/exam-lab/`) | no live feed to other machines; "more than one person" is an aid, 28.8 % (15 / 52 public photos); not measured in real exam rooms; the invigilator always decides |
| Attendance (PIN / QR) | ☐ pass ☐ fail | PIN / QR first, face optional | browser storage about 20 people × 2 years; no payroll calculation; labour lawyer pending |
| Gate (assisted) | ☐ pass ☐ fail | pilot, guard confirms every vehicle | real photos 32 % exact without a tap (7 / 22), 78 % need a tap; never opens a barrier by itself |
| Crowd (events) | ☐ pass ☐ fail | experimental, sparse to medium crowds | not for dense crowds; preliminary AI-reference numbers; never for crowd-safety decisions |

Nothing is on sale yet: approved prices are marked "not on sale" (`docs/SALES-PACKAGES.md` and each one-pager). Opening sales is the owner's decision and needs counsel's review first (`CLAUDE.md`).

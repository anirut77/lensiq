# LENSIQ Exam — ผู้ช่วยผู้คุมสอบ บอกว่าควรไปดูที่นั่งไหน ไม่ตัดสินแทนคน

**ใช้กล้องและคอมพิวเตอร์ที่สถาบันมีอยู่แล้ว ประมวลผลบนเครื่อง ไม่ส่งภาพขึ้นคลาวด์ ไม่มีการวิเคราะห์อารมณ์ ไม่มีการจดจำใบหน้า**

> **ราคาที่อนุมัติแล้ว (ยังไม่เปิดขาย)** ราคาในเอกสารนี้มาจากรายการราคาที่เจ้าของอนุมัติ 2026-11-09 (`docs/PRICING-RESEARCH.md` §3.1) ยังไม่มีการเก็บเงิน

## ปัญหา
- ห้องสอบใหญ่ ผู้คุมสอบ 1–2 คนมองไม่ทั่ว เห็นเหตุเมื่อสายไปแล้ว
- ระบบคุมสอบอัตโนมัติจากต่างประเทศแพง (ใบอนุญาตต่อผู้สอบต่อวิชา) และหลายระบบ "ตัดสิน" แทนคน ทำให้เกิดการแจ้งผิดกับผู้สอบที่ผิวคล้ำ อยู่ในแสงน้อย หรือมีความต้องการพิเศษ

## สิ่งที่ได้
| ระบบ | ผลลัพธ์ |
|---|---|
| ห้องสอบที่มีกล้อง (`exam-hall.html`) **— รุ่นทดลอง ยังไม่เปิดขาย** | มือถือ/โน้ตบุ๊ก 1–3 เครื่องต่อห้อง กำหนดที่นั่งบนภาพ แจ้ง "ข้อสังเกต" เช่น ที่นั่งว่าง เอนไปที่นั่งข้าง ๆ มีโทรศัพท์ในภาพ |
| ห้องคอมพิวเตอร์ / สอบออนไลน์ (`exam-lab.html`) | ผู้สอบรับทราบประกาศและยินยอมก่อน ตรวจแสงและกล้อง เตือนเบา ๆ ก่อน (ไม่เห็นใบหน้า ออกจากเต็มจอ) และเห็นบันทึกของตัวเองเหมือนที่ผู้คุมสอบเห็น |
| แดชบอร์ดผู้คุมสอบ (`exam-dashboard.html`) | แผนผังที่นั่ง คิวข้อสังเกตตามลำดับ ทุกการกระทำต้องใส่ชื่อผู้คุมสอบ ตรวจความแม่นยำหน้างาน ("แจ้งถูก/แจ้งผิด") CSV เรียงตามเวลา รายงานพิมพ์ |
| การปรับการสอบ | สถาบันกำหนดต่อที่นั่ง (พักบ่อย อ่านออกเสียง ฯลฯ) โดยไม่บันทึกการวินิจฉัย |

## สิ่งที่ระบบไม่ทำ (เด็ดขาด)
ไม่ตัดสินว่าทุจริต · ไม่ให้ตกอัตโนมัติ · ไม่มีคะแนนความน่าสงสัย · ไม่วิเคราะห์อารมณ์หรือสีหน้า · ไม่จดจำใบหน้า · ไม่บังคับสแกนห้อง ·
ไม่บันทึกวิดีโอต่อเนื่อง (คลิปหลักฐาน 10 วินาทีเปิดได้เฉพาะเมื่อสถาบันเลือกและประกาศไว้ ค่าเริ่มต้นปิด)
หน้าเว็บมองไม่เห็นโปรแกรมอื่น อุปกรณ์นอกกรอบภาพ หรือหูฟัง: การสอบเดิมพันสูงต้องใช้ร่วมกับผู้คุมสอบและ Safe Exam Browser

## ความแม่นยำและที่มา

รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)

| ข้อกล่าวอ้าง | ค่า | n | ที่มา | เอกสาร |
|---|---|---|---|---|
| ข้อสังเกตถูก/ผิดในห้องสอบจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `docs/EXAM.md` |
| หาใบหน้าไม่เจอ (คนเดียว ระยะนั่งหน้าโต๊ะ ตัวตรวจ MediaPipe) | 15% (ใบหน้ากว้าง 24–48 px: ไม่พบเลย) | n = 26 ภาพ (n = 12) | ชุดข้อมูลสาธารณะ (Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า) · แยกตามสีผิว: ยังไม่ได้วัด · ในห้องสอบจริง: ยังไม่ได้วัด (ชุดนำร่อง ขั้น 0) | `docs/exam/FACE-ENGINE-RESULTS.md`, `docs/pilot/PILOT-EXAM.md` |
| สัญญาณ “มากกว่าหนึ่งคน” (ห้องคอมพิวเตอร์): มีคนที่สองในภาพแล้วระบบแจ้ง. **เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน** | 28.8% (15 / 52) · แจ้งผิดเมื่อมีคนเดียว 0 / 17 | n = 52 ภาพ (n = 17) | ชุดข้อมูลสาธารณะ (ภาพถ่ายสาธารณะจาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · ในห้องสอบจริง: ยังไม่ได้วัด | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2 |
| ตรวจพบโทรศัพท์/หนังสือในภาพการสอบ | ยังไม่ได้วัด | — | ยังไม่ได้วัด (แผนวัดในการสอบจำลองตามบท ขั้น 1) | `docs/EXAM.md` |
| ระบบคุมสอบด้วย AI อย่างเดียวจับผู้ที่ถูกสั่งให้โกงได้ (การทดลองของ University of Twente กับ Proctorio) | 0 จาก 6 คน | — | งานวิจัยที่ตีพิมพ์ (ไม่ใช่ผลวัดของ LENSIQ) | `docs/EXAM.md` "Why it does not decide" |

เหตุผลที่ระบบ "ไม่ตัดสินแทนคน" อยู่ที่แถวสุดท้าย: ระบบอัตโนมัติพลาดได้ ผู้คุมสอบจึงเป็นผู้ตัดสินเสมอ

## โครงการนำร่อง (ฟรี)
1 สถาบัน ≤ 4 สัปดาห์ ≤ 3 ห้อง ในรอบสอบที่ไม่ชี้ขาดสูง: ตรวจกล้องและแสงกับอาสาสมัคร → การสอบจำลองตามบท → การสอบจริงพร้อมผู้คุมสอบนับ
"แจ้งถูก/แจ้งผิด" แผนและเช็กลิสต์: `docs/pilot/PILOT-EXAM.md` ผลเป็นตัวเลขของสถาบันเองพร้อมช่วงความเชื่อมั่น 95%

## ราคา (ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย — ราคาไม่รวม VAT 7% ลูกค้าชำระราคา + 7%)
ห้องคอมพิวเตอร์ / สอบออนไลน์คิดต่อผู้สอบ ห้องสอบที่มีกล้องคิดต่อห้อง

**ห้องสอบที่มีกล้องเป็นรุ่นทดลอง (เจ้าของตัดสินใจ 2026-11-10):** ยังไม่เปิดขายจนกว่าจะแก้ปัญหาใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (`docs/exam/FACE-ENGINE-RESULTS.md` §7) ราคาในแถวนั้นใช้เมื่อเปิดขายแล้วเท่านั้น ห้องคอมพิวเตอร์ (`exam-lab.html`) พร้อมโครงการนำร่อง

| แพ็กเกจ | ช่วงนำร่อง (ตอนนี้) | หลังผ่านเกณฑ์นำร่อง |
|---|---|---|
| ห้องคอมพิวเตอร์ / ออนไลน์ (ต่อผู้สอบ) | 10 บาท ต่อผู้สอบต่อการสอบ ไม่รวม VAT 7% (ขั้นต่ำ 300 บาทต่อรอบ ไม่รวม VAT 7%) หรือ 990 บาท/เดือน/ห้อง ไม่รวม VAT 7% | 15–30 บาท ต่อผู้สอบต่อการสอบ ไม่รวม VAT 7% หรือ 990–1,490 บาท/เดือน ไม่รวม VAT 7% |
| ห้องสอบที่มีกล้อง (ต่อห้อง ≤ 3 เครื่องต่อห้อง) **— รุ่นทดลอง ยังไม่เปิดขาย** | 290 บาท ต่อห้องต่อวันสอบ ไม่รวม VAT 7% หรือ 990 บาท/เดือน/ห้อง ไม่รวม VAT 7% | 300–600 บาท ต่อห้องต่อวันสอบ ไม่รวม VAT 7% หรือ 1,990 บาท/เดือน/ห้อง ไม่รวม VAT 7% |
| ใบอนุญาตทั้งสถาบัน | เริ่ม 19,900 บาท/ปี ไม่รวม VAT 7% (≤ 1,000 ผู้สอบ) | 30,000–120,000 บาท/ปี ไม่รวม VAT 7% |

ราคาหลังผ่านเกณฑ์ใช้เมื่อสถานที่ผ่านเกณฑ์ใน `docs/pilot/PILOT-EXAM.md` แล้วเท่านั้น โครงการนำร่องภาคสนาม (1 สถาบัน ≤ 4 สัปดาห์ ≤ 3 ห้อง) ฟรี

เทียบตลาด: ใบอนุญาตคุมสอบผ่านเว็บแคมจากต่างประเทศราว 196 บาทต่อผู้สอบต่อวิชา (Respondus Monitor, 1,000 ที่นั่งแรก เป็นราคาอเมริกาเหนือ อาจไม่เปิดขายในไทย และต้องซื้อ LockDown Browser เพิ่ม) และค่าตอบแทนผู้คุมสอบ
ไม่เกิน 600 บาทต่อชั่วโมงในประกาศของมหาวิทยาลัยแห่งหนึ่ง (แหล่งที่มาและวันที่ใน `docs/PRICING-RESEARCH.md` §1C)
ราคาตลาดเป็นราคาตามที่แหล่งที่มาแสดง ร้านในไทยมักรวม VAT แล้ว จึงเทียบกับราคา LENSIQ (ไม่รวม VAT) ได้โดยประมาณ ต่างกันราว 7%

## PDPA และกฎหมาย
ประกาศก่อนสอบ (`exam.html#notice` พิมพ์ได้ 3 ภาษา) ช่องยินยอม ทางเลือกสำหรับผู้ไม่ยินยอมโดยไม่เสียสิทธิสอบ EU AI Act: การเฝ้าดูพฤติกรรมการสอบเป็นความเสี่ยงสูง
(Annex III 3(d)) และห้ามรู้จำอารมณ์ในสถานศึกษา (มาตรา 5(1)(f)) — ระบบไม่มี ข้อความกฎหมายรอทนายตรวจ

**ติดต่อ:** แบบฟอร์ม `index.html?interest=education#contact` · ชื่อบริษัท อีเมล และ LINE OA จะประกาศก่อนเปิดขาย (`LENSIQ_SELLER`)

> **ต้นฉบับภายใน** (มีชื่อไฟล์ในระบบ) — round 16 ราคาเจ้าของอนุมัติแล้ว 2026-11-09 (ยังไม่เปิดขาย) ข้อความตรวจกับเจ้าของก่อนส่งลูกค้า

---

# English

## LENSIQ Exam — an invigilator's assistant: it says which seat to check, it never decides

Uses the institution's own cameras and computers, processes on the device, sends no images to a cloud, has no emotion
analysis and no face recognition. **Approved price list (not on sale yet)**: prices approved by the owner 2026-11-09
(`docs/PRICING-RESEARCH.md` §3.1); nothing is charged yet.

**What you get:**
- **Camera exam hall** (`exam-hall.html`), **experimental, not on sale yet**: seat polygons and objective observations (empty seat, leaning, phone in view).
- **Computer room / online** (`exam-lab.html`): notice and consent, a light check, gentle prompts first, and the
  candidate sees their own log.
- **Dashboard:** a seat map, a queue, a named action for every response, the on-site tally (right / wrong), a CSV in
  time order and a printable report.
- **Accommodations:** set per seat, with no diagnosis stored.

**Never:**
- a cheating verdict;
- an automatic fail;
- a suspicion score;
- emotion or expression analysis;
- face recognition;
- mandatory room scans;
- continuous video. The 10 s evidence clip is opt-in per exam and off by default.

## Accuracy and source

| Claim | Value | n | Source | Document |
|---|---|---|---|---|
| Observations right / wrong in a real exam room | not measured | — | field: not measured (no pilot yet) | `docs/EXAM.md` |
| Face not found (one person at desk distance, MediaPipe engine) | 15% (faces 24–48 px wide: none found) | n = 26 frames (n = 12) | public dataset (Open Images V7, held-out half) · by skin tone: not measured · real exam rooms: not measured (pilot phase 0) | `docs/exam/FACE-ENGINE-RESULTS.md`, `docs/pilot/PILOT-EXAM.md` |
| "More than one person" signal (computer room): a second person in view is flagged. **An aid, not complete detection** | 28.8% (15 / 52) · false alarms with one person 0 / 17 | n = 52 frames (n = 17) | public dataset (public photos from Open Images V7, held-out half; not exam-room footage) · real exam rooms: not measured | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2 |
| Phone / book detection on exam footage | not measured | — | not measured (planned in the staged exam, phase 1) | `docs/EXAM.md` |
| AI-only proctoring caught instructed cheaters (University of Twente trial with Proctorio) | 0 of 6 | — | published research (not a LENSIQ measurement) | `docs/EXAM.md` |

**Pilot (free):** 1 institution, ≤ 4 weeks, ≤ 3 rooms, in low-stakes sessions. It runs a light check, then a staged
exam, then a real exam with invigilator tallies (`docs/pilot/PILOT-EXAM.md`).

**Price (approved price list, not on sale yet; excl. 7% VAT, so the customer pays the price + 7%). Computer rooms and
online exams are priced per candidate, camera halls per room:**

**The camera hall is experimental (owner decision 2026-11-10):** it is not sold until small faces in the wide
exam-room view are detected well enough (`docs/exam/FACE-ENGINE-RESULTS.md` §7); its row applies only once it is on
sale. The computer-room mode (`exam-lab.html`) is ready for a field pilot.

| Package | Pilot stage (now) | After pilot |
|---|---|---|
| Computer room / online (per candidate) | 10 THB per candidate per exam excl. 7% VAT (minimum 300 THB per session excl. 7% VAT), or 990 THB / month per lab excl. 7% VAT | 15–30 THB per candidate per exam excl. 7% VAT, or 990–1,490 THB / month excl. 7% VAT |
| Camera hall (per room), **experimental, not on sale yet** | 290 THB per room per exam day excl. 7% VAT, or 990 THB / month per room excl. 7% VAT | 300–600 THB per room per exam day excl. 7% VAT, or 1,990 THB / month per room excl. 7% VAT |
| Institution licence | from 19,900 THB / year excl. 7% VAT | 30,000–120,000 THB / year excl. 7% VAT |

The "after pilot" price applies only once the site has passed `docs/pilot/PILOT-EXAM.md`. The field pilot (1
institution, ≤ 4 weeks, ≤ 3 rooms) is free.

Market comparison: about 196 THB per student per course for an international webcam-proctoring licence (Respondus;
North-American price, may not be offered in Thailand, LockDown Browser licence extra), and up to
600 THB per invigilator-hour in one university's rules (`docs/PRICING-RESEARCH.md` §1C).
Market prices are as the sources show them. Thai shop prices are usually VAT-inclusive, so the comparison with LENSIQ
prices (excl. VAT) is approximate by about 7%.

**Contact:** `index.html?interest=education#contact`.

> **Internal copy** (contains file names). Round 16. Prices approved by the owner 2026-11-09 (not on sale yet); the text is checked with the owner before it goes to customers.

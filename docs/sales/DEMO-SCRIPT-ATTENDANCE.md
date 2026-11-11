# สคริปต์เดโม 10 นาที: LENSIQ Attendance (ลงเวลาพนักงาน PIN / QR เป็นค่าเริ่มต้น ใบหน้าเป็นตัวเลือก)

> **ร่าง (DRAFT) 2026-11-11** ใช้พนักงานสมมติเท่านั้น ห้ามกรอกชื่อ PIN หรือบัตรของพนักงานจริงของลูกค้า
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน A1–A6) และ `docs/ONE-PAGER-ATTENDANCE.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> สถานะ (`docs/PAGE-STATUS.md`): `attendance.html` = พร้อมนำร่อง (PIN/QR เป็นค่าเริ่มต้น ใบหน้ารอสรุปใบอนุญาตโมเดล OP-14)

## เตรียมก่อนเดโม

- เปิด https://anirut77.github.io/lensiq/attendance.html?mode=employee ใน Chrome/Edge หน้าต่างใหม่ (โปรไฟล์ว่าง) เพื่อไม่ให้มีข้อมูลเก่า
- เตรียมโทรศัพท์หรือแท็บเล็ตเป็น "เครื่องลงเวลา" (เปิดหน้าเดียวกัน) ถ้ามี
- เตรียมชื่อสมมติ: "พนักงานตัวอย่าง 1" (รหัส E01, PIN 1234) และ "พนักงานตัวอย่าง 2" (รหัส E02, PIN 5678) ตั้ง PIN ผู้จัดการสมมติ
- สำรอง: ภาพหน้าจอแท็บ "สรุปเดือนและเงินเดือน" และไฟล์ CSV ตัวอย่างที่ทำจากพนักงานสมมติ
- ไม่เปิดตัวเลือกใบหน้าในการเดโมกับลูกค้า ถ้าลูกค้าถามเรื่องใบหน้า ให้ใช้ขั้นตอนนาทีที่ 9 เท่านั้น

## สคริปต์ทีละนาที

| นาที | เปิดหน้า | พูด | แสดง | ถามลูกค้า |
|---|---|---|---|---|
| 0:00–1:00 | `attendance.html?mode=employee` | "ลงเวลาด้วย PIN หรือบัตร QR เป็นค่าเริ่มต้น ใช้มือถือหรือแท็บเล็ตที่มีอยู่ ข้อมูลอยู่บนเครื่องของคุณ เหมาะกับร้านและบริษัท 5–20 คน" | ปุ่มโหมด 2 ปุ่ม (เช็คชื่ออบรม / ลงเวลาทำงานพนักงาน) เลือกโหมดพนักงาน | "ตอนนี้ลงเวลาด้วยอะไร กระดาษ LINE หรือเครื่องสแกน และมีพนักงานกี่คน" |
| 1:00–2:00 | ส่วน "ข้อมูลส่วนบุคคลในการลงเวลาทำงาน (PDPA)" | "ก่อนใช้ต้องแจ้งพนักงาน ใบหน้าเป็นข้อมูลชีวภาพ ต้องได้ความยินยอมโดยชัดแจ้ง และต้องมี PIN/QR ให้เลือกเสมอ ไม่มีผลเสียต่อพนักงานที่ไม่ใช้ใบหน้า ระบบไม่วิเคราะห์อารมณ์ ไม่เก็บภาพ" | ประกาศพับได้ ลิงก์ป้ายและแบบยินยอม (`camera-notice.html`) | "ใครในองค์กรดูแลเรื่องข้อมูลส่วนบุคคล" |
| 2:00–4:00 | แท็บ "พนักงาน" และ "กะการทำงาน" | "เพิ่มพนักงาน กำหนดกะ เวลาผ่อนผันสาย กติกา OT ถ้า OT ต้องอนุมัติ ผู้จัดการอนุมัติรายวัน" | เพิ่ม E01 E02 พร้อม PIN สร้างกะ 09:00–18:00 พักหนึ่งชั่วโมง ผ่อนผัน 10 นาที (ค่าตัวอย่าง) ออกบัตร QR พิมพ์ได้ | "เวลาทำงานและกะของร้านเป็นแบบไหน มีกะกลางคืนหรือไม่" |
| 4:00–5:30 | แท็บ "PIN / QR" และโหมดคิออสก์ | "พนักงานใส่รหัสกับ PIN หรือสแกนบัตร ล็อกหลังใส่ผิด 5 ครั้ง โหมดคิออสก์ออกได้ด้วย PIN ผู้จัดการ" | ลงเวลาเข้า/ออกของ E01 และ E02 ด้วย PIN (ลองใส่ผิดหนึ่งครั้ง) แสดง "ลงเวลาวันนี้" ปุ่มโหมดคิออสก์ | "พนักงานเข้างานพร้อมกันที่จุดเดียวหรือหลายจุด" |
| 5:30–7:00 | แท็บ "สรุปเดือนและเงินเดือน" | "สรุปรายเดือนต่อคน มาสายกี่นาที ออกก่อน OT วันหยุดนักขัตฤกษ์ วันลา เตือนสัปดาห์เกิน 48 ชั่วโมง ส่งออก CSV สำหรับเงินเดือน หัวคอลัมน์สองภาษา" | ตารางเดือนและปุ่มส่งออก CSV **มีแล้ว** (`attendance.html?mode=employee&demo=1`) `attendance.html?mode=employee&demo=1` เติมพนักงานสมมติ 8 คนและบันทึกเวลาหนึ่งเดือนไว้ก่อน ตอนนี้เดือนจะว่างเกือบหมด ให้ใช้ภาพหน้าจอสำรอง | "ระบบเงินเดือนที่ใช้คืออะไร ขอไฟล์ตัวอย่างที่ไม่มีข้อมูลบุคคลได้ไหม" |
| 7:00–8:00 | แท็บ "แก้ไขเวลาและประวัติ" | "ผู้จัดการแก้ได้แต่ไม่แก้ข้อมูลดิบ ทุกการแก้เป็นรายการตรวจสอบย้อนหลัง ต้องใส่ชื่อผู้แก้และเหตุผล ลบหรือสลับลำดับแล้วระบบเตือน" | เพิ่มการลงเวลาที่ลืม แล้วดูรายการประวัติ ลิงก์ส่งออก "ข้อมูลของพนักงานคนนี้" (สิทธิเข้าถึง PDPA) | "ใครอนุมัติการแก้เวลา" |
| 8:00–9:00 | แท็บ "ตั้งค่าและข้อมูล" | พูดข้อจำกัดตรง ๆ: "พื้นที่ในเบราว์เซอร์ราว 20 คน × 2 ปีต่อเครื่อง ยังไม่มีซิงก์คลาวด์ หลายเครื่องรวมกันด้วยไฟล์ส่งออก/นำเข้า ยังไม่มีกะหมุนเวียน ไม่มีขออนุมัติลาออนไลน์ ไม่คำนวณค่าจ้าง ภาษี ประกันสังคม และเวลาอิงนาฬิกาเครื่อง" | ส่วน "รวมข้อมูลจากหลายจุดลงเวลา" มิเตอร์พื้นที่ | "มีกี่สาขา กี่คน ต้องการซิงก์ทันทีหรือไม่" |
| 9:00–9:45 | `attendance.html` ส่วน "ตัวเลขและที่มา" | ถ้าลูกค้าถามใบหน้า: "ใบหน้าเป็นตัวเลือก ใช้เมื่อพนักงานยินยอม ใบหน้าเอเชีย จำได้ต่อการสแกน 66–76% (n = 500 คน × 5 ภาพ ชุดข้อมูลสาธารณะ CASIA ชุดทดสอบแยกแต่ไม่ปิดตาสมบูรณ์) คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน ≤ 0.03% ที่ทำงานจริงในไทย ยังไม่ได้วัด การหันหน้ายืนยันคนจริง ยังไม่ได้วัด PIN/QR ไม่มีความคลาดเคลื่อนจากการจดจำ" | แถว A2 A4 A5 A6 ป้าย "โมเดลใบอนุญาตวิจัย" (รอความเห็นทางกฎหมายก่อนขายเชิงพาณิชย์ OP-14) | "พนักงานจะยินยอมใช้ใบหน้าหรือไม่ หรือ PIN/QR เพียงพอ" |
| 9:45–10:00 | `attendance.html` ส่วนราคา | "ฟรีไม่เกิน 5 คน PIN/QR 1 เครื่อง มาตรฐานช่วงนำร่อง 19 บาทต่อคนที่ใช้งานต่อเดือน ขั้นต่ำ 190 บาทต่อเดือน ไม่รวม VAT 7% ช่วยตั้งค่า 2,900 บาทครั้งเดียว ไม่บังคับ นำร่อง 2 สัปดาห์ เทียบ CSV เงินเดือนกับของเดิมหนึ่งรอบเดือน" | ตารางราคา (ราคาที่อนุมัติ) | "เริ่มนำร่องได้เมื่อไร" |

## จุดที่ต้องมีโหมดเดโม (`?demo=1`)

| ขั้นตอน | สถานะ |
|---|---|
| เพิ่มพนักงาน กะ ลงเวลาด้วย PIN สดบนหน้า | ทำได้แล้ว (ข้อมูลสมมติ) |
| พนักงานสมมติ 8 คน + บันทึกเวลาหนึ่งเดือน + สรุปเดือน + CSV ตัวอย่าง | **มีแล้ว** (`attendance.html?mode=employee&demo=1`) `?mode=employee&demo=1` |
| ล้างข้อมูลเดโมหลังจบด้วยปุ่มเดียว | **มีแล้ว** (`attendance.html?mode=employee&demo=1`) ตอนนี้ใช้ปุ่ม "ล้างบันทึกทั้งหมด" ในแท็บตั้งค่าและข้อมูล |

## ห้ามพูด / ห้ามกล่าวอ้าง (NOT to claim)

- ห้ามบอกความแม่นยำของใบหน้า "ที่ทำงานจริง" (ยังไม่ได้วัด) ห้ามบอก 85% (เป็นตัวเลขชุดที่ใช้ปรับค่า ดีเกินจริง) เป็นตัวเลขหลัก ตัวเลขหลักคือ 66–76% ใบหน้าเอเชีย
- ห้ามบอกว่ากัน "ลงเวลาแทนกัน" ได้ (PIN และบัตรแชร์ได้ ไม่มีภาพตอนลงเวลาโดยตั้งใจ ตัวเลือกหันหน้ายังไม่ได้วัด)
- ห้ามบอกว่าคำนวณเงินเดือน ภาษี หรือประกันสังคม (เป็นงานของระบบเงินเดือน) ห้ามบอกว่ามีจับคู่โดยตรงกับโปรแกรมเงินเดือนยี่ห้อใด (ยังไม่มี ต้องใช้ไฟล์ตัวอย่างจากลูกค้า)
- ห้ามบอกว่ามีซิงก์หลายสาขา สำรองบนคลาวด์ ขออนุมัติลาออนไลน์ กะหมุนเวียน หรือแอปสำหรับพนักงาน (ยังไม่มี)
- ห้ามบอกว่าถูกต้องตามกฎหมายแรงงานหรือ PDPA ครบ (รอทนายแรงงานและทนายข้อมูลส่วนบุคคล) ห้ามบอกว่าใช้ใบหน้าเชิงพาณิชย์ได้แล้ว (รอข้อสรุปใบอนุญาตโมเดล)
- ห้ามพูดถึงการวิเคราะห์อารมณ์ การให้คะแนนพนักงาน หรือการตรวจจับการโกหก ระบบไม่มี ระบบแสดงรายการผิดปกติให้ผู้จัดการตรวจ ไม่ตัดสินให้
- ห้ามบอกว่า "ราคาเริ่มต้น 29" เป็นราคาปัจจุบัน (หลังนำร่องเท่านั้น)

## หลังเดโม

ล้างข้อมูลเดโมออกจากเบราว์เซอร์ (แท็บตั้งค่าและข้อมูล) บันทึกจำนวนพนักงาน จุดลงเวลา ระบบเงินเดือน และความเห็นเรื่องใบหน้า ส่งใบเสนอราคา

---

# English

> **DRAFT 2026-11-11.** Use fictitious employees only. Never enter a real customer employee's name, PIN or badge.
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register A1–A6) and `docs/ONE-PAGER-ATTENDANCE.md`. Open points (OP-xx) are in `docs/sales/README.md`.
> Status (`docs/PAGE-STATUS.md`): `attendance.html` = pilot-ready (PIN / QR default; the face option waits for the model-licence decision, OP-14).

**Prepare:** open https://anirut77.github.io/lensiq/attendance.html?mode=employee in a fresh Chrome/Edge window (empty profile). Optional phone or tablet as the "clock". Fictitious
employees "Sample employee 1" (E01, PIN 1234) and "Sample employee 2" (E02, PIN 5678) and a fictitious manager PIN. Backup screenshots of the month tab and a sample CSV.
Do not switch on the face option during a customer demo; use minute 9 only if asked.

| Min | Open | Say | Show | Ask |
|---|---|---|---|---|
| 0:00–1:00 | `attendance.html?mode=employee` | Clock-in with a PIN or QR badge by default, on a phone or tablet you already own; data stays on your device; suited to shops and companies of 5–20 people. | The two mode buttons; pick employee mode | How do you record time today (paper, LINE, scanner)? How many staff? |
| 1:00–2:00 | PDPA notice (collapsible) | Staff must be told before use. A face is biometric data and needs explicit consent and a PIN / QR alternative with no penalty. No emotion analysis, no images stored. | The notice; links to the sign and consent form (`camera-notice.html`) | Who handles personal data in your organisation? |
| 2:00–4:00 | Tabs "Employees" and "Shifts" | Add staff, set shifts, grace minutes, OT rules; OT can need approval. | Add E01 and E02 with PINs; a 09:00–18:00 shift with a one-hour break and 10 minutes' grace (sample values); printable QR badge | What are your hours and shifts? Any night shift? |
| 4:00–5:30 | Tab "PIN / QR", kiosk mode | Staff enter a code and PIN or scan a badge. Five wrong PINs lock the code. The kiosk exits only with the manager PIN. | Clock E01 and E02 in and out (try one wrong PIN); "today's punches"; kiosk mode | One clock point or several? |
| 5:30–7:00 | Tab "Month and payroll" | Monthly summary per person: late minutes, early leave, OT, public-holiday work, leave, a warning over 48 hours a week; payroll CSV with bilingual headers. | Month table and CSV export. **Needs demo mode (in progress) OP-15**: `attendance.html?mode=employee&demo=1` should preload 8 sample employees and a month of punches. Today the month is almost empty, so use the backup screenshot. | Which payroll system do you use? Can you share a sample file with no personal data? |
| 7:00–8:00 | Tab "Corrections and history" | A manager can correct, but raw punches are never edited. Each correction is an audit entry with the manager's name and a reason; a deleted or reordered entry is flagged. | Add a missed punch and read the history; the per-employee export (PDPA access right) | Who approves time corrections? |
| 8:00–9:00 | Tab "Settings and data" | State the limits plainly: browser storage holds about 20 people x 2 years per device; no cloud sync; several devices merge by file export / import; no rotating rosters; no online leave approval; no wage, tax or social-security calculation; time follows the device clock. | "Merge data from several clock-in points"; the storage meter | How many branches and people? Do you need instant sync? |
| 9:00–9:45 | `attendance.html`, "Figures and sources" | Only if asked about faces: the face is optional and used only with consent. Asian faces recognised per scan 66–76% (n = 500 people x 5 photos, public dataset CASIA; held-out but not perfectly blind). Strangers auto-checked-in with no confirmation: at most 0.03%. A real Thai workplace: not measured. The head-turn liveness option: not measured. PIN / QR has no recognition error. | Rows A2, A4, A5, A6; the "research-licence model" label (waiting for legal opinion before commercial sale, OP-14) | Would your staff consent to a face, or is PIN / QR enough? |
| 9:45–10:00 | `attendance.html`, price | Free up to 5 people (PIN / QR, 1 device). Standard at pilot stage 19 THB per active person per month, minimum 190 THB per month, excl. 7% VAT. Optional set-up help 2,900 THB one-off. A 2-week pilot compares the payroll CSV with your existing record for one month. | Price table (approved list) | When can we start a pilot? |

**Demo mode (`?demo=1`):** available on `attendance.html?mode=employee&demo=1`: eight sample employees with a month of punches, a month summary and a CSV
labelled SAMPLE; "reset sample data" reloads the page. Real records on the device are never read or changed in demo mode.

**Do NOT claim:** workplace face accuracy (not measured); 85% as the headline (it is a tuning-set figure, optimistic; the headline is 66–76% on Asian faces); that it stops buddy punching (a PIN or badge can be shared; no
photo on punch by design; liveness unmeasured); wage, tax or social-security calculation; a direct export for any named payroll product (none yet; a sample file is needed); multi-branch sync,
cloud backup, online leave approval, rotating rosters or an employee app (none exist); labour-law or PDPA compliance (labour lawyer and counsel pending); commercial use of the face option (model licence pending);
anything about emotion, scoring staff or lie detection; "from 29 THB" as today's price (after pilot only).

**After the demo:** clear the demo data from the browser; note staff count, clock points, payroll system and views on faces; send the quotation.

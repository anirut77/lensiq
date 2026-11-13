# สคริปต์เดโม 10 นาที: LENSIQ Exam (ห้องคอมพิวเตอร์ / lab mode)

> **ร่าง (DRAFT) 2026-11-11** ใช้ข้อมูลตัวอย่างเท่านั้น ห้ามเปิดข้อมูลลูกค้า ห้ามให้ผู้สอบจริงนั่งหน้ากล้องในการเดโม
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน E1–E5) และ `docs/ONE-PAGER-EXAM.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> สถานะหน้า (`docs/PAGE-STATUS.md`): `exam.html`, `exam-lab.html`, `exam-dashboard.html` = พร้อมนำร่อง · `exam-hall.html` = **ทดลอง ไม่ขาย**

## เตรียมก่อนเดโม (10 นาทีก่อนเริ่ม)

- เบราว์เซอร์ Chrome หรือ Edge รุ่นใหม่ เปิด 3 แท็บ จากเว็บสาธิต https://anirut77.github.io/lensiq/ :
  `exam.html`, `exam-lab.html?demo=1`, `exam-dashboard.html?demo=1` (โหมดเดโมมีแถบ "ข้อมูลตัวอย่าง" ติดตลอด ไม่ใช้กล้อง ไม่แตะข้อมูลจริงในเครื่อง)
- เว็บแคมของเครื่องผู้นำเสนอใช้ได้ (ใช้ใบหน้าผู้นำเสนอเองเท่านั้น) เครื่องที่ไม่มีเว็บแคม: ใช้ขั้นตอน "ต้องมีโหมดเดโม"
- ปิดการแจ้งเตือนอื่นบนจอ ในโหมดเดโม รหัสห้อง ชื่อผู้คุมสอบ ("ผู้คุมสอบตัวอย่าง") และที่นั่ง 1-12 ถูกเติมให้แล้ว
- สำรอง: ภาพหน้าจอ `exam.html` ส่วน "ความแม่นยำและที่มา" (เผื่อเน็ตหลุด)
- ห้ามแสดงรายชื่อผู้สอบจริง ห้ามนำเข้าไฟล์ .json จากการสอบจริง

## สคริปต์ทีละนาที

| นาที | เปิดหน้า | พูด | แสดง | ถามลูกค้า |
|---|---|---|---|---|
| 0:00–1:00 | `exam.html` (ส่วนบนสุด) | "LENSIQ Exam เป็นผู้ช่วยผู้คุมสอบ บอกว่าควรไปดูที่นั่งไหน ไม่ตัดสินแทนคน ใช้คอมพิวเตอร์และเว็บแคมที่สถาบันมีอยู่ ประมวลผลบนเครื่อง ไม่ส่งภาพขึ้นคลาวด์" | หัวเรื่อง ปุ่ม 3 ปุ่ม (หน้าผู้เข้าสอบ / เครื่องกล้อง (ทดลอง) / แดชบอร์ด) | "ตอนนี้ห้องสอบหนึ่งห้องมีผู้คุมสอบกี่คน และเกิดอะไรขึ้นเมื่อมีใครแจ้งผิด" |
| 1:00–2:30 | `exam.html` เลื่อนไป "ไม่ทำเด็ดขาด" และ "สิ่งที่หน้าเว็บมองไม่เห็น" | "ระบบไม่ตัดสินทุจริต ไม่ให้ตกอัตโนมัติ ไม่มีคะแนนความน่าสงสัย ไม่วิเคราะห์อารมณ์ ไม่จดจำใบหน้า และมองไม่เห็นโปรแกรมอื่น โทรศัพท์นอกภาพ หรือหูฟัง การสอบเดิมพันสูงต้องใช้ร่วมกับผู้คุมสอบและ Safe Exam Browser" | รายการ never1–never4 และ cant1–cant3 | "การสอบของท่านชี้ขาดสูงหรือไม่ (ย่อย กลางภาค ปลายภาค)" |
| 2:30–4:00 | `exam-lab.html` | "ผู้สอบต้องอ่านประกาศและติ๊กยินยอมก่อน ถ้าไม่ยินยอมก็สอบได้โดยไม่เปิดกล้อง ผู้สอบเห็นบันทึกของตัวเองเหมือนที่ผู้คุมสอบเห็น และได้รับคำเตือนแบบเบา ๆ ก่อน" | ประกาศ ช่องยินยอม ตรวจแสง/กล้อง การปรับเทียบ ตัวบอก "กำลังเฝ้าดู" ตลอดเวลา (ใช้ใบหน้าผู้นำเสนอ) ถ้าไม่มีกล้อง: `exam-lab.html?demo=1` เปิดเซสชันตัวอย่างโดยไม่ใช้กล้อง | "ท่านมีทางเลือกอะไรสำหรับผู้ที่ไม่ยินยอม" |
| 4:00–6:30 | `exam-dashboard.html` | "นี่คือสิ่งที่ผู้คุมสอบเห็น ห้องสมมติ DEMO 12 ที่นั่ง มีการแจ้งตัวอย่าง 18 รายการ ข้อมูลเป็นของจำลองทั้งหมด" | `exam-dashboard.html?demo=1` เปิดมาพร้อมข้อมูลตัวอย่างแล้ว (ปุ่ม "สาธิต: จำลองเหตุการณ์" ยังเพิ่มเหตุการณ์ได้อีก) ผังที่นั่งสีพร้อมคำกำกับ คิวเรียงลำดับ ปุ่ม "กำลังไปตรวจ / ไม่พบปัญหา / บันทึก / ส่งต่อ" ทุกการกระทำต้องใส่ชื่อ บันทึกและส่งต่อต้องมีหมายเหตุ ส่งออก CSV เรียงตามเวลา (ไม่เรียงตามความน่าสงสัย) | "ใครในสถาบันจะเป็นผู้ดูแผงนี้" |
| 6:30–7:30 | `exam-dashboard.html` (ส่วนตรวจความแม่นยำ) | "ผู้คุมสอบกด 'แจ้งถูก' หรือ 'แจ้งผิด' เมื่อไปดูแล้ว ระบบคำนวณความแม่นยำต่อสัญญาณพร้อมช่วงความเชื่อมั่น 95% นี่คือวิธีที่เราวัดที่ห้องของท่านเอง ตัวเลขในตารางนี้เป็นข้อมูลจำลองเพื่อสาธิตวิธีนับ ไม่ใช่ความแม่นยำที่วัดได้" | ตาราง tally ที่เติมไว้แล้ว (รวม 8 ถูกจาก 15 ข้อมูลจำลอง: โทรศัพท์ 3/1, ไม่เห็นใบหน้า 2/3, มากกว่าหนึ่งคน 1/2, ออกเต็มจอ 2/0, เอนตัว 0/1) ให้กดแจ้งถูก/แจ้งผิดกับ 3 รายการที่ยังค้างในคิวเพื่อดูตารางขยับ ปุ่ม "ไปที่ตารางความแม่นยำ" ในแผงเดโม ส่วนการปรับการสอบต่อที่นั่ง (พักบ่อย อ่านออกเสียง) ไม่บันทึกการวินิจฉัย | "มีผู้สอบที่ต้องปรับการสอบกี่คนต่อรอบ" |
| 7:30–8:30 | `exam.html` ส่วน "ความแม่นยำและที่มา" | อ่านตัวเลขตามจริง: "ในห้องสอบจริง ยังไม่ได้วัด หาใบหน้าไม่เจอ 15% (n = 26 ภาพ ชุดข้อมูลสาธารณะ ไม่ใช่ห้องสอบจริง) สัญญาณ 'มากกว่าหนึ่งคน' แจ้งได้ 28.8% (15 / 52) ไม่แจ้งผิด 0 / 17 เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน ผู้คุมสอบต้องเดินตรวจตามปกติ" | แถว E1 E2 E5 และงานวิจัย Twente (0 จาก 6 งานวิจัยที่ตีพิมพ์ ไม่ใช่ผลวัดของเรา) | "ท่านต้องการความแม่นยำเท่าไรจึงจะใช้ได้ และใช้เกณฑ์อะไรตัดสิน" |
| 8:30–9:30 | `exam.html` ส่วนราคา/โครงการนำร่อง | "เสนอโครงการนำร่องฟรี 1 สถาบัน ไม่เกิน 4 สัปดาห์ ไม่เกิน 3 ห้อง ในรอบสอบที่ไม่ชี้ขาดสูง นำด้วยห้องคอมพิวเตอร์ ผู้คุมสอบจดแจ้งถูก/แจ้งผิด ตัวเลขที่ได้เป็นของสถาบันเอง ข้อจำกัดที่ต้องทราบ: ยังดูสดข้ามเครื่องไม่ได้ ต้องส่งออกไฟล์หลังสอบมาเปิดในแดชบอร์ด (OP-25)" | ตารางราคา (ราคาที่อนุมัติ ไม่รวม VAT 7%) ช่วงนำร่อง 10 บาทต่อผู้สอบต่อการสอบ ขั้นต่ำ 300 บาทต่อรอบ · ระดับฟรี ถึง 5 ผู้สอบต่อรอบสอบ เกินนั้นต้องมีใบอนุญาต ยังไม่บังคับในระบบ ข้อจำกัดเริ่มตามวันที่จะประกาศ (ล่วงหน้า 30 วันขึ้นไป และเริ่มใช้หลังประกาศ 30 วัน) บังคับผ่านสัญญา (OP-26) | "ห้องคอมพิวเตอร์กี่ห้อง มีเว็บแคมทุกเครื่องหรือไม่" |
| 9:30–10:00 | `exam.html#notice` | "ถ้าสนใจ ขั้นต่อไปคือ ส่งใบเสนอราคาและแบบฟอร์มสั่งซื้อ นัดวันตรวจกล้องและแสง อบรมผู้คุมสอบ 1 ชั่วโมง และประกาศผู้สอบอย่างน้อย 7 วันก่อนสอบ" | ประกาศพิมพ์ได้ 3 ภาษา | "วันไหนเหมาะที่สุดสำหรับตรวจกล้องและแสง ใครเป็นผู้ลงนามอนุมัติ" |

## จุดที่ต้องมีโหมดเดโม (`?demo=1`)

| ขั้นตอน | สถานะ |
|---|---|
| `exam-dashboard.html` ปุ่ม "สาธิต: จำลองเหตุการณ์" | มีอยู่แล้ว (ใช้ได้ในโหมดเดโมด้วย) |
| `exam-lab.html?demo=1` เซสชันตัวอย่างไม่ใช้กล้อง มีปุ่มจำลองเหตุการณ์ 4 แบบ | **มีแล้ว** (เหตุการณ์อยู่ในบันทึกของผู้สอบ ยังไม่ส่งไปแดชบอร์ด) |
| `exam-dashboard.html?demo=1` แดชบอร์ดที่มี tally และการปรับการสอบตัวอย่างเติมไว้แล้ว (ห้อง DEMO 12 ที่นั่ง 18 การแจ้ง ไฟล์ส่งออกขึ้นต้น SAMPLE ไม่แตะข้อมูลจริง) | **มีแล้ว** (OP-15 ปิด) ทดสอบ `tests/e2e/exam-dashboard-demo.e2e.mjs` |

## ห้ามพูด / ห้ามกล่าวอ้าง (NOT to claim)

- ห้ามบอกว่าระบบ "จับโกง" "ตรวจจับการทุจริต" หรือ "ตัดสิน" ระบบแจ้งข้อสังเกตให้ผู้คุมสอบไปดู ผู้คุมสอบตัดสินเสมอ
- ห้ามบอกว่าตรวจโทรศัพท์หรือหนังสือได้แม่น (ยังไม่ได้วัดบนภาพห้องสอบ) ห้ามบอกว่าตรวจคนที่สองได้ครบ (28.8% บนชุดข้อมูลสาธารณะ)
- ห้ามบอกความแม่นยำตามสีผิวหรือแสงน้อย (ยังไม่ได้วัด) ห้ามบอกตัวเลขหน้างานจริง (ยังไม่มี)
- ห้ามพูดถึงอารมณ์ สีหน้า คะแนนความน่าสงสัย หรือการตรวจจับการโกหก ระบบไม่มี
- ห้ามเสนอขายห้องสอบที่มีกล้อง (`exam-hall.html`) เป็นผลิตภัณฑ์ เป็นรุ่นทดลอง ใช้ควบคู่ในการนำร่องเท่านั้น
- ห้ามบอกว่ามีแดชบอร์ดสดข้ามเครื่องในโหมดห้องคอมพิวเตอร์ (ยังไม่มี ต้องส่งออกไฟล์ JSON หลังสอบ)
- ห้ามบอกว่าถูกกฎหมาย PDPA ครบ หรือผ่านทนายแล้ว (รอทนายตรวจ) ห้ามบอกว่าแทนผู้คุมสอบหรือ Safe Exam Browser ได้
- ห้ามบอกว่าตัวเลขใน tally ของโหมดเดโมเป็นความแม่นยำของระบบ (เป็นข้อมูลจำลอง)
- ห้ามอ้างราคา "หลังนำร่อง" เป็นราคาปัจจุบัน และห้ามพูดว่า "เปิดขายแล้ว" ก่อนเจ้าของยืนยัน (OP-09)

## หลังเดโม

บันทึก: จำนวนผู้สอบ ห้อง ระดับการสอบ ผู้ลงนาม ข้อกังวลเรื่อง PDPA ห้ามบันทึกภาพหน้าจอที่มีใบหน้า ส่งใบเสนอราคา (`QUOTATION-TEMPLATE.md`) ตามราคาที่อนุมัติ

---

# English

> **DRAFT 2026-11-11.** Use sample data only. Never open customer data. Never put a real candidate in front of the camera during a demo.
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register E1–E5) and `docs/ONE-PAGER-EXAM.md`. Open points (OP-xx) are in `docs/sales/README.md`.
> Page status (`docs/PAGE-STATUS.md`): `exam.html`, `exam-lab.html`, `exam-dashboard.html` = pilot-ready; `exam-hall.html` = **experimental, not for sale**.

**Prepare:** current Chrome or Edge; three tabs from the public demo https://anirut77.github.io/lensiq/ (`exam.html`, `exam-lab.html?demo=1`, `exam-dashboard.html?demo=1`; demo mode keeps a "sample data" bar on screen, uses no camera and does not touch real data on the device);
the presenter's own webcam and face only for the non-demo steps; in demo mode the room code, a sample invigilator name and seats 1-12 are already filled; a screenshot of the accuracy section as backup.
Never show real candidate lists or import a real .json file.

| Min | Open | Say | Show | Ask |
|---|---|---|---|---|
| 0:00–1:00 | `exam.html` top | An invigilator's assistant: it says which seat to check and never decides. It uses the institution's own computers and webcams, processes on the device, and sends no image to a cloud. | Title; the three buttons | How many invigilators does a room have today? What happens when a flag is wrong? |
| 1:00–2:30 | `exam.html`, "never" and "cannot see" lists | No misconduct verdict, no automatic fail, no suspicion score, no emotion analysis, no face recognition. A web page cannot see other programs, phones outside the frame or earpieces. High-stakes exams need invigilators and Safe Exam Browser. | never1–4, cant1–3 | Is your exam high-stakes (quiz, midterm, final)? |
| 2:30–4:00 | `exam-lab.html` | The candidate reads the notice and consents first. A candidate who declines can sit the exam without the camera. The candidate sees the same log as the invigilator, with gentle prompts first. | Notice, consent box, light and camera check, calibration, "monitoring active" indicator (presenter's face). No webcam: `exam-lab.html?demo=1` opens a sample session with no camera. | What is your option for candidates who decline? |
| 4:00–6:30 | `exam-dashboard.html` | This is what the invigilator sees: a made-up room DEMO with 12 seats and 18 sample flags. All data is simulated. | `exam-dashboard.html?demo=1` opens with the sample data already loaded (the "Demo: simulate events" button can still add events); coloured seat map with words; time-ordered queue; Going to check / No issue / Note / Escalate; a name for every action; a note for Note and Escalate; CSV in time order (never ranked by suspicion) | Who will watch this panel? |
| 6:30–7:30 | dashboard, tally | After checking, the invigilator presses "flag was right" or "wrong". The page computes precision per signal with a 95% interval. This is how we measure in your room. The numbers in this table are simulated, to show how the tally works; they are not a measured accuracy. | Pre-filled tally (8 right out of 15, simulated: phone 3/1, face not visible 2/3, more than one person 1/2, fullscreen exit 2/0, leaning 0/1); press right / wrong on the 3 flags still in the queue to see the table move; the "Go to the precision table" button in the demo panel; per-seat accommodations (breaks, reading aloud) with no diagnosis stored | How many candidates need accommodations per exam? |
| 7:30–8:30 | `exam.html`, accuracy table | Read the numbers as they are: real exam rooms not measured. Face not found 15% (n = 26 frames, public dataset, not exam rooms). The "more than one person" signal fires on 28.8% (15 / 52) of frames with a second person, with 0 / 17 false alarms. It is an aid, not complete detection. | Rows E1, E2, E5; the Twente study (0 of 6, published research, not our measurement) | What accuracy would you need, and how would you judge it? |
| 8:30–9:30 | `exam.html`, pilot and price | Offer a free pilot: 1 institution, up to 4 weeks, up to 3 rooms, low-stakes sessions, led by the computer-room mode; invigilators tally right / wrong; the numbers become yours. Known limit: no live view across devices yet (OP-25); export a file after the exam and open it in the dashboard. | Price table (approved list, excl. 7% VAT); pilot stage 10 THB per candidate per exam, minimum 300 THB per session; free tier up to 5 candidates per session, beyond that a licence is needed, not enforced in the product yet, starting on a date announced at least 30 days ahead and 30 days after the announcement (enforced by contract, OP-26) | How many computer rooms? Does every machine have a webcam? |
| 9:30–10:00 | `exam.html#notice` | Next steps: quotation and order form; a camera and light check day; one hour of invigilator training; notice to candidates at least 7 days before the exam. | Printable notice in three languages | Which date suits the camera check? Who signs for approval? |

**Demo mode (`?demo=1`):** available on `exam-lab.html?demo=1` (camera-free sample session, four simulated events in the candidate's own log). The dashboard
has its own demo button, and `exam-dashboard.html?demo=1` opens a pre-filled sample board (room DEMO, 12 seats, 18 flags, tally 8 right out of 15, two sample accommodations; exports named SAMPLE; real data untouched). Test: `tests/e2e/exam-dashboard-demo.e2e.mjs` (OP-15 closed).

**Do NOT claim:** that it catches cheating or decides; that phone or book detection is accurate (not measured on exam footage); that it finds every second person (28.8% on public
photos); accuracy by skin tone or in low light (not measured); any field figure (none exists); anything about emotion, expression, suspicion score or lie detection (none exists);
that the demo tally is LENSIQ's accuracy (it is simulated); that the camera exam hall is a product (experimental, pilot companion only); a live cross-device dashboard in computer-room mode (not built); full PDPA compliance or lawyer approval (pending);
that it replaces invigilators or Safe Exam Browser; the after-pilot price as the current price; or "on sale now" before the owner confirms (OP-09).

**After the demo:** note candidates, rooms, exam level, signatory and PDPA concerns. Do not keep screenshots with faces. Send the quotation (`QUOTATION-TEMPLATE.md`) at approved prices.

# LENSIQ Exam: คู่มือเริ่มต้นใช้งานสำหรับลูกค้า (ห้องคอมพิวเตอร์) / Customer onboarding guide (computer-lab mode) / 客户入门指南（机房模式）

ฉบับ 2026-11-14 / Version 2026-11-14 / 版本 2026-11-14

## ภาษาไทย

คู่มือนี้ใช้กับหน้า `exam-lab.html` (หน้าผู้สอบ) และ `exam-dashboard.html` (แดชบอร์ดผู้คุมสอบ) ซึ่งเป็นรุ่นที่จำหน่าย ได้แก่การสอบในห้องคอมพิวเตอร์หรือการสอบออนไลน์
ห้องสอบที่ติดกล้องในห้องโถง (`exam-hall.html`) เป็นรุ่นทดลอง ไม่จำหน่าย และไม่อยู่ในคู่มือนี้ เว็บไซต์: https://anirut77.github.io/lensiq/

หลักการที่ต้องแจ้งผู้คุมสอบทุกคน: ระบบไม่ตัดสินว่าใครทุจริต ผู้คุมสอบเป็นผู้ตัดสินเสมอ ข้อสังเกตที่ระบบแสดงไม่ใช่หลักฐานการทุจริต ระบบไม่วิเคราะห์อารมณ์ และไม่ทำการจดจำใบหน้าเพื่อระบุตัวบุคคล
ภาพทั้งหมดประมวลผลบนเครื่องของผู้สอบ ไม่ส่งภาพออกจากเครื่อง

ระดับใช้งานฟรี: Exam ถึง 5 ผู้สอบต่อรอบสอบ เกินนั้นต้องมีใบอนุญาต ปัจจุบันยังไม่มีตัวนับหรือตัวจับเวลาในระบบ ข้อจำกัดจะเริ่มตามวันที่ประกาศ โดยประกาศล่วงหน้าอย่างน้อย 30 วันและเริ่มใช้หลังประกาศ 30 วัน
ลูกค้าส่งออกข้อมูลของตนได้เสมอ

### 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ | คอมพิวเตอร์ในห้องที่มีเว็บแคมทุกเครื่อง (ผู้สอบ 1 คน 1 เครื่อง) และเครื่องของผู้คุมสอบสำหรับแดชบอร์ด 1 เครื่องต่อห้อง |
| เบราว์เซอร์ | Chrome หรือ Edge รุ่นปัจจุบัน (110 ขึ้นไป) เปิดอัปเดตอัตโนมัติ ใช้โปรไฟล์เบราว์เซอร์เฉพาะสำหรับการสอบ ไม่ใช้หน้าต่างส่วนตัว (ข้อมูลหายเมื่อปิด) |
| ที่อยู่หน้าเว็บ | ต้องเปิดผ่าน `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น มิฉะนั้นกล้องใช้ไม่ได้ ที่อยู่หลักคือ https://anirut77.github.io/lensiq/ หรือที่อยู่ที่ทีมงานแจ้งให้ใช้ในห้องสอบของท่าน |
| กล้อง | เว็บแคมที่หน้าจอ ผู้สอบนั่งหน้ากล้อง ใบหน้าอยู่กลางภาพ แสงมาจากด้านหน้า หลีกเลี่ยงหน้าต่างอยู่หลังผู้สอบ |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรกเพื่อโหลดโมเดล (MediaPipe Face Landmarker และ COCO-SSD) โมเดลถูกเก็บไว้ในเบราว์เซอร์ แต่หน้าเว็บเองไม่ได้ถูกเก็บ การโหลดหน้าใหม่โดยไม่มีเครือข่ายอาจล้มเหลว ให้เปิดหน้าไว้ก่อนสอบและอย่ารีโหลดในห้องสอบจริง |
| ความปลอดภัยของเครื่อง | ผู้ใช้เครื่องไม่ใช่ผู้ดูแลระบบ ล็อกหน้าจอ เข้ารหัสดิสก์ (FileVault หรือ BitLocker) ปิดโหมดหลับ ต่อไฟตลอด |
| ระบบข้อสอบ | ใช้ระบบข้อสอบของสถาบันเอง หน้า Exam เป็นผู้ช่วยสังเกต ไม่ใช่ระบบข้อสอบ การสอบที่มีผลสูงต้องมีผู้คุมสอบและ Safe Exam Browser ร่วมด้วย |
| เอกสาร | ประกาศถึงผู้สอบ (`exam.html#notice` พิมพ์ได้ 3 ภาษา) ทางเลือกสำหรับผู้ไม่ยินยอมให้ใช้กล้อง การประเมินผลกระทบด้านข้อมูลส่วนบุคคล (DPIA) และผู้มีอำนาจลงนามของสถาบัน ทีมงานจะส่งแบบฟอร์มและคู่มือฉบับเต็มให้ |

### 2. ตารางเวลาเริ่มต้นใช้งาน

| วัน | งาน | ผู้ทำ |
|---|---|---|
| −14 ถึง −8 | เลือกรอบสอบที่ไม่ใช่การสอบชี้ขาดสูง เช่น สอบย่อยหรือสอบกลางภาค ลงนามเอกสาร ทำ DPIA | สถาบัน |
| −7 | ประกาศผู้สอบอย่างน้อย 7 วันก่อนสอบ พร้อมทางเลือกสำหรับผู้ไม่ยินยอม | สถาบัน |
| −5 | ตรวจกล้องและแสงในห้องจริง 2–3 ชั่วโมง ช่วงเวลาและแสงเดียวกับวันสอบ | ทีมงาน LENSIQ + สถาบัน |
| −4 | อบรมผู้คุมสอบ 1 ชั่วโมง | ทีมงาน LENSIQ |
| วันสอบ | ตามหัวข้อ 3 | สถาบัน |
| +1 ถึง +3 | ส่งออกไฟล์ นำเข้าแดชบอร์ด ดูรายงาน ประชุมสรุป | สถาบัน + ทีมงาน LENSIQ |

### 3. วันแรก (วันสอบ) ทีละขั้น

1. **มาถึง 45 นาทีก่อนสอบ** เปิดเครื่องทุกเครื่อง ต่ออินเทอร์เน็ต เปิด Chrome หรือ Edge โปรไฟล์สำหรับสอบ
2. **ผู้คุมสอบเปิด `exam-dashboard.html`** ใส่รหัสห้อง ชื่อผู้คุมสอบ (ทุกการกระทำบันทึกภายใต้ชื่อนี้) และช่วงที่นั่ง เช่น 1-40 แล้วกด "เปิดแดชบอร์ดห้องนี้"
   ถ้าต้องปรับการสอบเป็นรายที่นั่ง (พักบ่อย อ่านข้อสอบออกเสียง) ให้ตั้งก่อนเริ่ม ระบบไม่บันทึกการวินิจฉัยใด ๆ
3. **เปิด `exam-lab.html` บนเครื่องผู้สอบทุกเครื่อง** ให้ผู้สอบอ่านประกาศและติ๊กยินยอม ผู้ที่ไม่ยินยอมสอบโดยไม่เปิดกล้องและไม่เสียสิทธิ์สอบ
4. **ตรวจแสงและกล้อง** ถ้าคำตัดสินแสงเป็น "แย่" ให้ปรับแสงหรือมุมก่อน ระบบจะไม่ประเมินสัญญาณใบหน้าและแสดง "ปรับการติดตั้ง" ซึ่งไม่ใช่การแจ้งเหตุ
5. **ปรับเทียบท่านั่ง** (ประมาณ 2 นาที) ถ้าเฟรมที่มีใบหน้าเดียวต่ำกว่า 60% การปรับเทียบจะไม่ผ่านและระบบปิดสัญญาณหันศีรษะ แต่การสอบยังเริ่มได้
6. **เริ่มสอบ** ผู้สอบเข้าโหมดเต็มจอ ผู้คุมสอบเดินตรวจตามปกติ ข้อจำกัดสองข้อที่ต้องบอกผู้คุมสอบ: ในโหมดห้องคอมพิวเตอร์ยังไม่มีการส่งข้อมูลสดไปแดชบอร์ดข้ามเครื่อง
   และสัญญาณ "มากกว่าหนึ่งคน" เป็นตัวช่วยที่ไม่ครบถ้วน (28.8% บนชุดข้อมูลสาธารณะ)
7. **หลังสอบ** แต่ละเครื่องส่งออกไฟล์ JSON ผู้คุมสอบนำเข้าที่แดชบอร์ด (ส่วน "นำเข้าไฟล์เหตุการณ์") ตรวจข้อสังเกตทีละรายการ แล้วเลือก "ไปตรวจ / ไม่พบปัญหา / บันทึก / ส่งต่อ"
   และกด "แจ้งถูก" หรือ "แจ้งผิด" ทุกข้อสังเกตที่ไปตรวจ
8. **ส่งออก** ไฟล์ CSV (เรียงตามเวลา) และรายงานพิมพ์ ("บันทึกเป็น PDF" จากเบราว์เซอร์) ข้อสังเกตไม่ใช่หลักฐานการทุจริต และรายงานระบุข้อความนี้ไว้
9. **ลบ** ไฟล์ส่งออกที่มีชื่อผู้คุมสอบหรือหมายเลขที่นั่งตามตารางเก็บรักษา (ในชุดนำร่อง: ภายในวันที่ +14 เว้นแต่สถาบันเก็บไว้เป็นเอกสารของสถาบันเอง)

คลิปหลักฐาน 10 วินาทีปิดเป็นค่าเริ่มต้น จะเปิดก็ต่อเมื่อสถาบันขอเป็นหนังสือและได้แจ้งผู้สอบแล้วเท่านั้น

### 4. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| เบราว์เซอร์ไม่ขออนุญาตกล้อง หรือกล้องไม่เปิด | เปิดผ่าน `http://` ที่ไม่ใช่ localhost หรือสิทธิ์กล้องถูกปิดไว้ | ใช้ `https://` ที่ถูกต้อง เปิดสิทธิ์กล้องของเว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วโหลดหน้าใหม่ก่อนเริ่มสอบ |
| หน้าแจ้งว่าตัวตรวจใบหน้าทำงานไม่ได้ ("ปรับการติดตั้ง") | โมเดลโหลดไม่ได้ (เครือข่าย) หรือเบราว์เซอร์ปิด WebAssembly | ตรวจเครือข่ายและอัปเดตเบราว์เซอร์ โหลดหน้าใหม่ก่อนสอบ ระบบจะปิดสัญญาณใบหน้าและแจ้งผู้สอบ โดยไม่แสดงเป็น "ไม่เห็นใบหน้า" การสอบดำเนินต่อได้ |
| แสง "แย่" ซ้ำ ๆ | หน้าต่างอยู่หลังผู้สอบ ไฟน้อย | ปิดม่าน เปิดไฟด้านหน้าห้อง หมุนจอ ระบบไม่ตีความเป็นพฤติกรรมของผู้สอบ |
| แจ้ง "ไม่เห็นใบหน้า" บ่อยกับผู้สอบบางคน | ใบหน้าเล็กในภาพ มุมกล้อง ผิวคล้ำในแสงน้อย (ยังไม่ได้วัดตามสีผิว) | ปรับมุมและแสงก่อน ผู้คุมสอบไปดูก่อนตัดสิน ห้ามใช้สัญญาณนี้ตัดสินผู้สอบ ถ้าไม่พบเหตุให้บันทึกเป็น "แจ้งผิด" |
| แจ้ง "จอที่สอง" หรือ "ออกจากเต็มจอ" | ผู้สอบต่อจอที่สอง หรือกดออกจากโหมดเต็มจอ | ระบบแสดงปุ่ม "กลับเข้าเต็มจอ" ให้ผู้สอบ การดำเนินการต่อเป็นไปตามกติกาสอบของสถาบัน |
| แจ้ง "กล้องเสมือน" | ชื่ออุปกรณ์กล้องมีคำว่า virtual เช่น OBS | ตรวจให้ใช้กล้องจริง บางโปรแกรมใช้ชื่อเหมือนกล้องจริงซึ่งระบบมองไม่เห็น |
| ผู้สอบรีโหลดหน้า | เครือข่ายหลุดหรือเบราว์เซอร์ค้าง | ระบบบันทึกเป็นเครื่องหมายเซสชัน ผู้คุมสอบดูเหตุผล หากไม่มีเครือข่ายการโหลดใหม่อาจล้มเหลว (ดูหัวข้อ 1) |
| ไม่เห็นเหตุการณ์ของผู้สอบบนแดชบอร์ดระหว่างสอบ | โหมดห้องคอมพิวเตอร์ยังไม่ส่งข้อมูลสดข้ามเครื่อง | ผู้คุมสอบเดินตรวจตามปกติ หลังสอบส่งออกไฟล์ JSON จากแต่ละเครื่องแล้วนำเข้าแดชบอร์ด |
| นำเข้าไฟล์แล้วไม่ขึ้น | ไฟล์ไม่ใช่ไฟล์ของ LENSIQ หรือมีคีย์ที่ไม่รู้จัก (ระบบปฏิเสธทั้งไฟล์) | ส่งออกใหม่จากหน้าผู้สอบ อย่าแก้ไฟล์ด้วยมือ |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัว หรือล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ และส่งออกไฟล์ก่อนปิดเสมอ |
| ผู้สอบไม่ยินยอมเปิดกล้อง | เป็นสิทธิ์ของผู้สอบ | ให้สอบโดยไม่เปิดกล้องตามทางเลือกที่ประกาศไว้ ไม่ลงโทษ ไม่เสียสิทธิ์สอบ |

### 5. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| ปัญหาการใช้งาน ข้อสงสัย | LINE: @632yliiw · อีเมล: [เจ้าของจะแจ้ง] · โทร: [เจ้าของจะแจ้ง] |
| เหตุขัดข้องระดับสูง (ระบบใช้ไม่ได้ในเวลาสอบ) หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 (เหตุร้ายแรง: ใช้งานไม่ได้หรือสงสัยข้อมูลรั่ว) เวลาตอบรับเป็นไปตามแผนสนับสนุนในใบเสนอราคา |
| คำขอสิทธิ์ข้อมูลส่วนบุคคลของผู้สอบ | สถาบันของท่านเป็นผู้ควบคุมข้อมูล ติดต่อผู้รับผิดชอบด้านข้อมูลส่วนบุคคลของสถาบัน |

เมื่อแจ้งปัญหา บอกเพียง: สถาบันและห้อง ชื่อหน้า เวลา ขั้นตอนที่ทำ รุ่นเบราว์เซอร์ และข้อความในคอนโซลถ้ามี **ห้ามส่งภาพผู้สอบ ใบหน้า หรือรายชื่อผู้สอบ**

## English

This guide covers `exam-lab.html` (the candidate page) and `exam-dashboard.html` (the invigilator dashboard). These are the product on sale: the computer-lab or online exam mode.
The camera-in-hall mode (`exam-hall.html`) is experimental, not sold and not covered here. Website: https://anirut77.github.io/lensiq/

Principles to tell every invigilator: the system never decides that anyone cheated; the invigilator always decides. An observation shown by the system is not evidence of misconduct. There is no emotion analysis and no face recognition to identify people.
All image processing happens on the candidate's own machine; no image leaves the device.

Free tier: Exam up to 5 candidates per session; beyond that a licence is needed. There is no counter or timer in the system yet. The limits start on a date that is announced at least 30 days ahead and take effect 30 days after the announcement.
Customers can always export their own data.

### 1. Before installing

- **Devices:** a computer with a webcam for every candidate (one candidate per machine), and one invigilator machine per room for the dashboard.
- **Browser:** current Chrome or Edge (110 or newer), auto-update on, a dedicated browser profile for exams, no private window (data disappears when it closes).
- **Page address:** `https://` with a valid certificate, or `http://localhost`; otherwise the camera does not work. The main address is https://anirut77.github.io/lensiq/ or the address the team gives you for your rooms.
- **Camera and light:** webcam at the screen; the candidate's face centred; light from the front; no window behind the candidate.
- **Network:** internet is needed when the page is first opened, to load the models (MediaPipe Face Landmarker and COCO-SSD). The models are kept in the browser but the page itself is not, so reloading without a network may fail. Open the page before the exam and do not reload it in the live room.
- **Machine security:** a non-admin user, screen lock, disk encryption (FileVault or BitLocker), sleep off, mains power.
- **The exam itself:** stays in the institution's own exam system. The Exam page only helps observation; it is not an exam system. High-stakes exams need invigilators and Safe Exam Browser as well.
- **Documents:** a notice to candidates (`exam.html#notice`, printable in 3 languages), the way to sit the exam without the camera, a data protection impact assessment (DPIA) and an authorised signatory at the institution. The team will send you the forms and the full guide.

### 2. Timeline

| Day | Task | Who |
|---|---|---|
| −14 to −8 | Choose a low-stakes session such as a quiz or mid-term; sign the documents; complete the DPIA | Institution |
| −7 | Notice to candidates, at least 7 days before the exam, with the route for those who decline | Institution |
| −5 | Camera and light check in the real room, 2–3 hours, same time of day and light as the exam | LENSIQ team + institution |
| −4 | One hour of invigilator training | LENSIQ team |
| Exam day | See section 3 | Institution |
| +1 to +3 | Export files, import them in the dashboard, review, wrap-up meeting | Institution + LENSIQ team |

### 3. Exam day, step by step

1. **Arrive 45 minutes before the exam.** Switch on all machines, connect to the internet, open Chrome or Edge with the exam profile.
2. **The invigilator opens `exam-dashboard.html`,** enters a room code, their name (every action is recorded under it) and a seat range such as 1-40, then presses "Open dashboard for this room".
   Set any per-seat accommodations (frequent breaks, reading aloud) before the start; no diagnosis is stored.
3. **Open `exam-lab.html` on every candidate machine.** Candidates read the notice and tick consent. A candidate who declines sits without the camera and keeps the right to sit the exam.
4. **Check light and camera.** If the light verdict is "poor", fix light or angle first. The page then does not evaluate face signals and shows "fix setup", which is not an alert.
5. **Calibrate the sitting position** (about 2 minutes). If fewer than 60% of frames have a single face, calibration fails and head-turn is switched off; the exam can still start.
6. **Start.** Candidates go full-screen; invigilators walk the room as usual. Tell invigilators the two limits: in computer-lab mode there is no live feed to the dashboard across devices,
   and the "more than one person" signal is an aid and not complete (28.8% on a public dataset).
7. **After the exam** each machine exports a JSON file. The invigilator imports them in the dashboard ("import events file"), reviews each observation (Go and check / No issue / Note / Escalate)
   and presses "flag was right" or "flag was wrong" for every observation checked.
8. **Export** the CSV (in time order) and the printable report ("Save as PDF" from the browser). A flag is not evidence of misconduct, and the report says so.
9. **Delete** exports that hold invigilator names or seat numbers according to the retention schedule (in the pilot kit: by day +14, unless the institution keeps them as its own records).

The 10-second evidence clip is off by default. It stays off unless the institution asks in writing and has told the candidates.

### 4. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| No camera prompt, or the camera will not start | `http://` that is not localhost, or camera permission blocked | Use a valid `https://`; allow the camera for the site in browser settings; reload before the exam |
| "Fix setup": the face detector cannot run | The model did not load (network) or WebAssembly is off | Check the network, update the browser, reload before the exam. Face signals switch off and candidates are told; this never reads as "no face"; the exam continues |
| Light "poor" again and again | Window behind the candidate, dim room | Close curtains, switch on front lights, turn the screen. It is not read as candidate behaviour |
| Frequent "no face" for some candidates | Small face in the frame, camera angle, dark skin in dim light (not yet measured by skin tone) | Fix angle and light first; the invigilator looks before judging; never judge a candidate on this signal; log it as "flag was wrong" if nothing was found |
| "Second screen" or "left full-screen" | The candidate connected a second display or left full-screen | A "return to full-screen" button is shown to the candidate; follow the institution's exam rules |
| "Virtual camera" | The camera device name contains "virtual", for example OBS | Check that a real camera is used; some tools use a real camera's name and cannot be seen |
| Candidate reloads the page | Network drop or browser freeze | Recorded as a session marker; the invigilator reads the reason; without a network a reload may fail (see section 1) |
| No candidate events on the dashboard during the exam | Computer-lab mode has no live feed across devices | Walk the room as usual; after the exam export each machine's JSON file and import it |
| Import shows nothing | Not a LENSIQ file, or an unknown key (the whole file is rejected) | Export again from the candidate page; do not edit the file by hand |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; always export before closing |
| A candidate declines the camera | Their right | Let them sit without the camera as announced; no penalty and no loss of the right to sit |

### 5. Who to contact

| Topic | Channel |
|---|---|
| Usage problems and questions | LINE: @632yliiw · E-mail: [to be provided by the owner] · Phone: [to be provided by the owner] |
| Serious incident (service unusable during the exam) or a suspected data leak | The same channels, marked S1 (serious: the system cannot be used, or data may have leaked). Response times are as agreed in your quotation |
| Data-subject requests from candidates | Your institution is the data controller; contact the institution's personal-data officer |

When reporting, give only: institution and room, page name, time, steps taken, browser version, and the console message if any. **Never send images of candidates, faces or candidate lists.**

## 中文

本指南适用于 `exam-lab.html`（考生页面）和 `exam-dashboard.html`（监考员仪表板），即正式销售的版本：机房考试或在线考试模式。
大型考场摄像头模式（`exam-hall.html`）属于试验版，不销售，也不在本指南范围内。网站：https://anirut77.github.io/lensiq/

请告知每位监考员以下原则：系统从不判定任何人作弊，最终由监考员判断。系统显示的观察提示不是作弊证据。系统不做情绪分析，也不做用于识别身份的人脸识别。
所有图像都在考生自己的设备上处理，图像不会离开设备。

免费层：每场考试最多 5 名考生，超出需要许可。目前系统内没有计数器或计时器。限制将从公布的日期开始，至少提前 30 天公布，并在公布 30 天后生效。
客户随时可以导出自己的数据。

### 1. 安装前的准备

- **设备：** 每位考生一台带摄像头的电脑（一人一机），每个考场另备一台监考员电脑用于仪表板。
- **浏览器：** 当前版本的 Chrome 或 Edge（110 及以上），开启自动更新，为考试使用专用的浏览器配置文件，不使用隐私窗口（关闭后数据会消失）。
- **页面地址：** 必须通过证书有效的 `https://` 或 `http://localhost` 打开，否则摄像头无法使用。主要地址为 https://anirut77.github.io/lensiq/，或团队为您的考场提供的地址。
- **摄像头与光线：** 摄像头在屏幕上方；考生坐在镜头前，面部位于画面中央；光线来自正面；避免考生身后有窗户。
- **网络：** 第一次打开页面时需要联网，以加载模型（MediaPipe Face Landmarker 和 COCO-SSD）。模型保存在浏览器中，但页面本身不会被缓存，因此无网络时重新加载页面可能失败。请在考试前打开页面，在正式考场内不要刷新页面。
- **设备安全：** 使用非管理员账户，设置屏幕锁，磁盘加密（FileVault 或 BitLocker），关闭睡眠，接通电源。
- **考试本身：** 仍在学校或机构自己的考试系统中进行。Exam 页面只是辅助观察，不是考试系统。高风险考试还需要监考员和 Safe Exam Browser。
- **文件：** 给考生的告知书（`exam.html#notice`，可打印，提供三种语言）、不同意使用摄像头的考生的替代方式、个人数据影响评估（DPIA）以及机构的授权签署人。团队会把表格和完整指南发给您。

### 2. 时间表

| 日期 | 工作 | 负责方 |
|---|---|---|
| −14 至 −8 | 选择一场非高风险的考试，例如小测验或期中考试；签署文件；完成 DPIA | 机构 |
| −7 | 至少在考试前 7 天向考生发出告知，并说明不同意者的替代方式 | 机构 |
| −5 | 在真实考场检查摄像头和光线，2–3 小时，时段和光线与考试当天一致 | LENSIQ 团队 + 机构 |
| −4 | 监考员培训 1 小时 | LENSIQ 团队 |
| 考试日 | 见第 3 节 | 机构 |
| +1 至 +3 | 导出文件、导入仪表板、查看报告、总结会议 | 机构 + LENSIQ 团队 |

### 3. 考试日逐步操作

1. **考前 45 分钟到场。** 打开所有电脑，连接互联网，用考试专用配置文件打开 Chrome 或 Edge。
2. **监考员打开 `exam-dashboard.html`，** 输入考场代码、监考员姓名（所有操作都记在此姓名下）和座位范围（例如 1-40），然后点击“打开本考场仪表板”。
   如需按座位调整考试安排（多次休息、朗读试题），请在开始前设置；系统不记录任何诊断信息。
3. **在每台考生电脑上打开 `exam-lab.html`。** 考生阅读告知书并勾选同意。不同意者不开摄像头参加考试，且不丧失考试资格。
4. **检查光线和摄像头。** 如果光线判定为“差”，先调整光线或角度。此时页面不会评估人脸信号，而是显示“调整设置”，这不是警报。
5. **校准坐姿**（约 2 分钟）。如果只有一张人脸的画面帧低于 60%，校准不通过，转头信号将被关闭；考试仍可开始。
6. **开始考试。** 考生进入全屏模式，监考员照常巡视。请告知监考员两点限制：机房模式下尚不能把实时数据跨设备发送到仪表板；
   “多于一人”信号只是辅助手段，并不完整（在公开数据集上为 28.8%）。
7. **考试结束后，** 每台电脑导出一个 JSON 文件。监考员在仪表板中导入（“导入事件文件”），逐条查看观察提示，选择“去核查 / 无问题 / 记录 / 上报”，
   并对每条已核查的提示点击“提示正确”或“提示有误”。
8. **导出** CSV（按时间排序）和可打印报告（用浏览器“另存为 PDF”）。观察提示不是作弊证据，报告中也注明了这一点。
9. **删除** 含有监考员姓名或座位号的导出文件，按保存期限表执行（试点套件：在第 +14 天之前，除非机构将其作为自己的记录保存）。

10 秒的取证片段默认关闭。只有机构书面提出要求并已告知考生后才会开启。

### 4. 常见问题与解决办法

| 现象 | 可能原因 | 解决办法 |
|---|---|---|
| 浏览器不请求摄像头权限，或摄像头无法启动 | 通过非 localhost 的 `http://` 打开，或摄像头权限被禁止 | 使用有效的 `https://`；在浏览器设置中允许本网站使用摄像头；考试前重新加载页面 |
| “调整设置”：人脸检测器无法运行 | 模型未能加载（网络问题）或 WebAssembly 被关闭 | 检查网络，更新浏览器，考试前重新加载。人脸信号会关闭并通知考生；这不会被显示为“看不到人脸”；考试继续进行 |
| 光线反复显示“差” | 考生身后有窗户，房间太暗 | 拉上窗帘，打开前方灯光，转动屏幕。这不会被当作考生的行为 |
| 部分考生频繁出现“看不到人脸” | 画面中人脸小、摄像头角度问题、弱光下肤色较深（尚未按肤色测量） | 先调整角度和光线；监考员先查看再判断；绝不能仅凭该信号判断考生；如果没有发现问题，请记为“提示有误” |
| “第二块屏幕”或“退出全屏” | 考生连接了第二块显示器或退出了全屏 | 页面会向考生显示“返回全屏”按钮；后续按机构的考试规则处理 |
| “虚拟摄像头” | 摄像头设备名称含有 virtual，例如 OBS | 确认使用的是真实摄像头；有些工具使用真实摄像头的名称，系统无法发现 |
| 考生重新加载页面 | 网络中断或浏览器卡死 | 系统记录为会话标记，由监考员查看原因；没有网络时重新加载可能失败（见第 1 节） |
| 考试期间仪表板上看不到考生事件 | 机房模式尚不支持跨设备实时传输 | 监考员照常巡视；考试结束后从每台电脑导出 JSON 文件并导入仪表板 |
| 导入文件后没有显示 | 不是 LENSIQ 文件，或含有未知字段（整个文件会被拒绝） | 从考生页面重新导出；不要手工修改文件 |
| 关闭浏览器后数据丢失 | 使用了隐私窗口，或清除了网站数据 | 使用专用配置文件；关闭前务必先导出 |
| 考生不同意开启摄像头 | 这是考生的权利 | 按已公布的替代方式让其不开摄像头参加考试；不处罚，不丧失考试资格 |

### 5. 联系方式

| 事项 | 渠道 |
|---|---|
| 使用问题与咨询 | LINE：@632yliiw · 电子邮件：[由业主提供] · 电话：[由业主提供] |
| 严重故障（考试期间系统无法使用）或怀疑数据泄露 | 同一渠道，并注明 S1（严重：系统无法使用或怀疑数据泄露）。响应时间以报价单中的支持方案为准 |
| 考生的个人数据权利请求 | 贵机构是数据控制者，请联系机构的个人数据负责人 |

报告问题时，只需说明：机构和考场、页面名称、时间、已执行的步骤、浏览器版本，以及控制台信息（如有）。**请勿发送考生图像、人脸或考生名单。**

# สคริปต์เดโม 10 นาที: LENSIQ Crowd (ประมาณความหนาแน่นของคนในงาน รุ่นทดลอง ไม่เหมาะกับฝูงชนหนาแน่น)

> **ร่าง (DRAFT) 2026-11-11** ใช้ "ดูตัวอย่าง (ข้อมูลจำลอง)" ในหน้าเท่านั้น ไม่ใช้กล้อง ไม่มีภาพคน ห้ามชี้กล้องไปที่ผู้ชมเดโมแล้วบันทึก
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน C1–C8) `docs/CROWD-ACCURACY.md` และ `docs/ONE-PAGER-CROWD.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> สถานะ (`docs/PAGE-STATUS.md`, OP-21): `crowd.html` = พร้อมนำร่องเฉพาะฝูงชนเบาบางถึงปานกลางในโซนที่วาด ตัวเลขเบื้องต้น **ยังไม่เหมาะกับฝูงชนหนาแน่น**

## เตรียมก่อนเดโม

- เปิด https://anirut77.github.io/lensiq/crowd.html ใน Chrome/Edge รุ่นใหม่ (โหมดสาธิต ข้อมูลจำลอง ไม่ใช้กล้อง) และ `camera-notice.html` (ป้าย A)
- เตรียมภาพหน้าจอสำรองของตาราง "ตัวเลขและที่มา" ใน `crowd.html`
- ห้ามโหลดคลิปจริงของลูกค้า ห้ามชี้กล้องมือถือไปที่ผู้เข้าร่วมประชุม
- ถามล่วงหน้าหรือตอนต้น: งานมีคนมากที่สุดประมาณเท่าไรต่อหนึ่งภาพกล้อง (ถ้า 50 คนขึ้นไป ให้ตอบตรง ๆ ว่ายังขายไม่ได้ ดูนาทีที่ 7:00)

## สคริปต์ทีละนาที

| นาที | เปิดหน้า | พูด | แสดง | ถามลูกค้า |
|---|---|---|---|---|
| 0:00–1:00 | `crowd.html` | "Crowd ประมาณจำนวนคนในโซนและนับคนเข้าออก ใช้มือถือหรือโน้ตบุ๊กที่มีกล้อง ประมวลผลบนเครื่อง ไม่จดจำใบหน้า ไม่เก็บภาพ เหมาะกับบูธ ล็อบบี้ ทางเข้างาน คนเบาบางถึงปานกลาง ให้ค่าประมาณ ไม่ใช่จำนวนที่แน่นอน" | แถบประกาศ "ยังไม่เหมาะกับฝูงชนหนาแน่น" ส่วนบนของหน้า | "งานอะไร กี่วัน ช่วงพีคมีคนประมาณเท่าไรในมุมกล้องเดียว" |
| 1:00–2:30 | `crowd.html` ส่วนกล้อง | "กด 'ดูตัวอย่าง (ข้อมูลจำลอง)' ไม่ใช้กล้อง เป็นพื้นแผนผังกับกล่องสีเทา ไม่มีภาพคน" | กดปุ่มตัวอย่าง: ฉากตัวอย่างเป็นคนเดินหน้าตู้โชว์ (ไม่ใช่ฉากงานอีเวนต์) "คนในภาพตอนนี้" เป็นค่ามัธยฐาน 5 ภาพ โซน เส้นนับเข้า/ออกที่ประตู | "มุมกล้องที่เป็นไปได้ที่งานอยู่ตรงไหน ความสูงเท่าไร" |
| 2:30–4:00 | `crowd.html` เครื่องมือโซน | "ผู้ใช้วาดโซนและเส้นนับเอง ตัวติดตามไม่ระบุตัวตน นับคนข้ามเส้นต่อช่วงเวลา" | ปุ่ม "วาดโซน" เส้นนับ "ตั้งจำนวนคนที่คาดว่าจะมีช่วงพีค" (เมื่อตัวตรวจจับล้าจะเตือน) | "ต้องการดูโซนไหน ทางเข้า คิว บูธ" |
| 4:00–5:30 | `crowd.html` คำเตือนบนหน้า | "ระบบเตือนเอง: คนดูเล็กเมื่อสูงไม่ถึง 10% ของภาพ พร้อมวิธีแก้ (ขยับกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้) และขึ้นเครื่องหมาย ≈ 'ค่าประมาณ' เมื่อเห็นตั้งแต่ 15 คน หรือโซนแน่น ≥ 2 คนต่อตารางเมตร" | ป้าย ≈ ข้อความ "คนดูเล็ก" **มีแล้ว** `crowd.html?demo=1` ให้เริ่มด้วยฉากตัวอย่างที่มีคนเล็กและฉากที่มีคน 15+ เพื่อโชว์ทั้งสองคำเตือนทันที ตอนนี้อาจต้องรอฉากตัวอย่างหมุนมาถึง (ฉากที่มีอยู่ไม่มีคนเล็กหรือ 15+) | "ตั้งกล้องสูงได้ถึง 2.5–3 เมตรหรือไม่" |
| 5:30–7:00 | `crowd.html` ส่วน "ตัวเลขและที่มา" | อ่านตรง ๆ: "ผลเบื้องต้น ค่าอ้างอิงนับโดย AI จากภาพนิ่ง ยังไม่ใช่คนนับ 2 คน (รอผลสุดท้าย) คน 15–22 คนเต็มภาพ นับต่ำกว่าจริง 26% (n = 12 ภาพ) คน 30–50 คน หลายคนอยู่ไกล นับต่ำกว่าจริง 58% (n = 20 ภาพ) คนตัวเล็ก/ไกล 37–59% (n = 29 ภาพ) โซนใกล้กล้อง 0–13 คน คลาด 1.2 คนต่อภาพ (31%, n = 20 ภาพ) เส้นนับเข้า/ออก 1 / 1 ครั้ง (n = 1 ซึ่งน้อยมาก) ที่มา ชุดข้อมูลสาธารณะ ที่ไซต์ลูกค้าจริง ยังไม่ได้วัด" | แถว C2–C5, C7, C8 | "ค่าคลาดระดับนี้ยอมรับได้สำหรับวัตถุประสงค์ของท่านหรือไม่" |
| 7:00–8:00 | `crowd.html` ส่วนข้อจำกัด | "ฝูงชนหนาแน่น ยังไม่เหมาะ: ที่ชิบูย่า ราว 300 คนถูกนับได้ราว 1 คนต่อภาพ (0–2 ในคลิปไทม์แลปส์ n = 2 + 7 ภาพ) ตัวนับไม่ได้สูงขึ้นแต่ล้มลง จึงไม่มีสัญญาณเตือนเองเสมอไป ต้องตั้งจำนวนคนที่คาดว่าจะมีช่วงพีค ห้ามใช้ตัดสินความปลอดภัยของฝูงชน เช่น จำกัดคนเข้า ถ้างานคาดว่าราว 50 คนขึ้นไปในภาพเดียว เรายังขายไม่ได้" | แถว C1 และส่วน 'Where it breaks' ใน `docs/CROWD-ACCURACY.md` (ใช้พูด) | "ช่วงพีคที่คาดไว้อยู่ที่เท่าไร" |
| 8:00–9:00 | `crowd.html` ส่วนรายงาน และ `camera-notice.html` | "รายงานเป็นตัวเลขอย่างเดียว CSV รายงานการตลาด หัวไฟล์ระบุว่าเป็นค่าประมาณ ไม่มีภาพ ไม่มีชื่อ ต้องติดป้าย A ที่ทางเข้าพื้นที่ ไม่ประมาณอายุ เพศ หรือสีหน้า (ปิดในเวอร์ชันลูกค้า)" | ปุ่มส่งออก CSV จากโหมดตัวอย่าง (ไฟล์ระบุว่าเป็นข้อมูลจำลอง) ป้าย A พิมพ์ได้ 3 ภาษา | "ใครเป็นผู้จัดและติดป้ายที่ทางเข้า" |
| 9:00–10:00 | `crowd.html` ส่วนราคา | "ขายแบบวันงานและสัปดาห์งานก่อน ช่วงนำร่อง 590 บาทต่อเครื่องต่อวัน หรือ 2,490 บาทต่อเครื่องต่อสัปดาห์ (7 วัน) ไม่รวม VAT 7% ไม่รวมอุปกรณ์ รายเดือนพื้นที่ถาวรยังไม่ขาย จนกว่าจะผ่านโครงการนำร่องพื้นที่ถาวร นำร่องที่ไซต์ 2–3 วัน เทียบกับคนนับ 2 คนทุก 5 นาที" | ตารางราคา (ราคาที่อนุมัติ) เกณฑ์ใน `docs/pilot/PILOT-CROWD.md` §6 | "วันที่จัดงานคือเมื่อไร ใครเป็นผู้ติดต่อฝั่งผู้จัดงาน" |

## จุดที่ต้องมีโหมดเดโม (`?demo=1`)

| ขั้นตอน | สถานะ |
|---|---|
| ปุ่ม "ดูตัวอย่าง (ข้อมูลจำลอง)" ไม่ใช้กล้อง มีโซน เส้นนับที่ประตู สรุปและ CSV ที่ติดป้าย "ข้อมูลจำลอง (โหมดตัวอย่าง) — ไม่ใช่ตัวเลขจริง" | มีอยู่แล้ว |
| `crowd.html?demo=1` เริ่มด้วยฉากตัวอย่างคนเล็ก/คน 15+ เพื่อโชว์คำเตือนและป้าย ≈ ทันที | **มีแล้ว** ฉากตัวอย่างที่มีอยู่เป็นคนเดินหน้าตู้โชว์และเข้าประตู ซึ่งเบาบาง ไม่มีฉากคนเล็กหรือคน 15+ |

## ห้ามพูด / ห้ามกล่าวอ้าง (NOT to claim)

- ห้ามบอกว่านับจำนวนคนได้แน่นอน ต้องพูดว่า "ค่าประมาณความหนาแน่น" ห้ามบอกความแม่นยำที่ไซต์ลูกค้า (ยังไม่ได้วัด) ห้ามบอกตัวเลขสุดท้าย (ผลสุดท้ายรอคนนับ ตอนนี้เป็นผลเบื้องต้นเทียบ AI)
- ห้ามบอกว่าใช้กับฝูงชนหนาแน่น คอนเสิร์ต ทางข้าม หรือราว 50 คนขึ้นไปต่อภาพ (ยังไม่เหมาะ ไม่ขาย) ห้ามบอกว่าใช้ตัดสินความปลอดภัยของฝูงชน
- ห้ามบอกความเร็วบนมือถือจริง ตัวเลข 355 ms ต่อภาพ (ราว 2.8 ครั้งต่อวินาที) มาจากการจำลองด้วยการลดความเร็ว CPU ×4 บนคอมพิวเตอร์ ไม่ใช่มือถือจริง
- ห้ามบอกว่าเส้นนับเข้า/ออกแม่น (มีเพียง 1 ครั้งที่ข้ามเส้นในชุดทดสอบ n = 1)
- ห้ามบอกว่าจดจำใบหน้า ประมาณอายุ/เพศ/สีหน้า วิเคราะห์อารมณ์ หรือบันทึกวิดีโอ (ไม่ทำ ปิดในเวอร์ชันลูกค้า)
- ห้ามเสนอรายเดือนพื้นที่ถาวร (ยังไม่ขาย) ห้ามบอกราคา "หลังนำร่อง" เป็นราคาปัจจุบัน ห้ามบอกว่าเปิดขายแล้วก่อนเจ้าของยืนยัน (OP-09)
- ห้ามเปรียบว่าดีกว่าเครื่องนับที่ประตู (ราคาเทียบได้ แต่ความแม่นยำเทียบไม่ได้ ของเรายังต่ำกว่าจริงในคนไกล/เล็ก)

## หลังเดโม

บันทึก: วันงาน จำนวนวัน พีคที่คาด มุมกล้อง ผู้ติดต่อ ส่งใบเสนอราคา ย้ำในอีเมลว่าเป็นรุ่นทดลอง ไม่เหมาะกับฝูงชนหนาแน่น

---

# English

> **DRAFT 2026-11-11.** Use only "Try the demo (simulated data)" in the page: it uses no camera and shows no people. Never point a camera at the demo audience and record.
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register C1–C8), `docs/CROWD-ACCURACY.md` and `docs/ONE-PAGER-CROWD.md`. Open points (OP-xx) are in `docs/sales/README.md`.
> Status (`docs/PAGE-STATUS.md`): `crowd.html` = pilot-ready only for sparse-to-medium crowds in a drawn zone; figures are preliminary; **not yet suitable for dense crowds**.

**Prepare:** open https://anirut77.github.io/lensiq/crowd.html in current Chrome or Edge (demo mode, simulated, no camera) and `camera-notice.html` (sign A). Keep a screenshot of the "figures and sources"
table as a backup. Do not load a customer clip. Ask early how many people are in one camera view at the peak; if about 50 or more, say plainly that we cannot sell it yet (minute 7).

| Min | Open | Say | Show | Ask |
|---|---|---|---|---|
| 0:00–1:00 | `crowd.html` | Crowd estimates people in a zone and counts entries and exits. It uses a phone or laptop camera, processes on the device, does no face recognition and stores no image. For booths, lobbies and entrances with sparse to medium crowds. It gives an estimate, not an exact count. | The banner "not yet suitable for dense crowds" | What event, how many days, how many people in one camera view at the peak? |
| 1:00–2:30 | `crowd.html` camera area | Press "Try the demo (simulated data)". No camera is used: a floor plan with grey blocks, no imagery of people. | After pressing: a shopfront sample scene (not an event scene); "people in view now" as the median of 5 frames; zone; the door entry / exit line | Where could the camera go at your event? How high? |
| 2:30–4:00 | `crowd.html` zone tools | The user draws the zone and the line. The tracker is anonymous and counts crossings per period. | "Draw zone", counting line, "expected crowd at peak" (it warns when the detector falters) | Which area do you want to watch: entrance, queue, booth? |
| 4:00–5:30 | `crowd.html` warnings | The page warns by itself: "people look small" when people are under 10% of the frame height, with the fix (move closer or draw the zone on the near part), and shows "≈ estimate" from 15 people or a zone at 2 people per m² or more. | The ≈ mark and the "people look small" hint. **Needs demo mode (in progress) OP-15**: `crowd.html?demo=1` should start with a small-people scene and a 15+ scene so both warnings show at once; the existing sample scene is sparse and has neither. | Can the camera be 2.5–3 m high? |
| 5:30–7:00 | `crowd.html` "figures and sources" | Read plainly. Preliminary: the reference was counted by an AI from still frames, not two human counters (final result pending). 15–22 people filling the frame: undercount 26% (n = 12 frames). 30–50 people, many far: undercount 58% (n = 20 frames). Small or far people: 37–59% (n = 29 frames). Near zone, 0–13 people: off by 1.2 people per frame (31%, n = 20 frames). Entry / exit line: 1 / 1 (n = 1, very small). Source: public dataset. At a real customer site: not measured. | Rows C2–C5, C7, C8 | Is an error of this size acceptable for your purpose? |
| 7:00–8:00 | `crowd.html` limits | Dense crowds are not suitable: at Shibuya about 300 people were counted as about 1 per frame (0–2 on the time-lapse; n = 2 + 7 frames). The count collapses, it does not rise, so there is not always an automatic warning; the operator sets the expected peak. Never use it for crowd-safety decisions such as limiting entry. If you expect about 50 or more people in one view, we cannot sell it yet. | Row C1; the "where it breaks" list in `docs/CROWD-ACCURACY.md` (use it to talk) | What peak do you expect? |
| 8:00–9:00 | `crowd.html` report, `camera-notice.html` | Reports are numbers only: marketing CSV whose header says "estimate"; no images, no names. Sign A must be posted at the entrance to the area. No age, gender or expression estimate (off in customer builds). | CSV export from the demo mode (the file says it is simulated); sign A in three languages | Who organises and posts the sign at the entrance? |
| 9:00–10:00 | `crowd.html` price | Sold by event day and event week first. Pilot stage: 590 THB per device per day or 2,490 THB per device per week (7 days), excl. 7% VAT, hardware not included. Monthly at a fixed site is not sold until a fixed-site pilot passes. The site pilot lasts 2–3 days and compares with two human counters every 5 minutes. | Price table (approved list); thresholds in `docs/pilot/PILOT-CROWD.md` §6 | What are the event dates? Who is the organiser's contact? |

**Demo mode (`?demo=1`):** available. `crowd.html?demo=1` starts without a camera on a far-crowd scene (both warnings and the ≈ label), with small-people,
15+ and shopfront scenes; people are drawn as grey blocks, no images of people.

**Do NOT claim:** an exact count (say "density estimate"); accuracy at the customer's site (not measured) or a final figure (pending a human count; today's are preliminary against an AI reference);
use in dense crowds, concerts, crossings or about 50+ people in one view (not suitable, not sold); use for crowd-safety decisions; speed on a real phone (355 ms per frame, about 2.8 per second, is
emulated by slowing a computer's CPU by four, not a real phone); that the entry / exit line is accurate (only 1 crossing in the test set, n = 1); face recognition, age / gender / expression estimates, emotion
analysis or video recording (not done; off in customer builds); fixed-site monthly (not sold); the after-pilot price as the current price; "on sale now" before the owner confirms (OP-09); that it beats a door counter
(prices compare, accuracy does not: ours undercounts far and small people).

**After the demo:** note event dates, days, expected peak, camera position and contact; send the quotation, and say in the e-mail that it is experimental and not for dense crowds.

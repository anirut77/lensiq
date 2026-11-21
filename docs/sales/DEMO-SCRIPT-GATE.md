# สคริปต์เดโม 10 นาที: LENSIQ Gate (ผู้ช่วย รปภ. อ่านป้ายทะเบียน รปภ. ยืนยันทุกคัน)

> **ร่าง (DRAFT) 2026-11-11** ใช้ป้ายทะเบียนจำลองในหน้า ("ใช้ภาพตัวอย่าง") เท่านั้น ห้ามถ่ายรถหรือป้ายของลูกค้าหรือคนอื่นมาเดโม
> ตัวเลขการทดสอบอยู่ในเอกสารเทคนิค `docs/tech-sheets/gate-TH.md` (ถ้าถูกถามตัวเลข ให้มอบเอกสารเทคนิค) และ `docs/ONE-PAGER-GATE.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> สถานะ (`docs/PAGE-STATUS.md`): `gate.html`, `parking.html`, `village.html` ใช้นำเดโมได้ รปภ. ยืนยันทุกการอ่าน ภาพจากกล้องจริงส่วนใหญ่ยังต้องให้ รปภ. แตะเลือกป้ายหรือแก้เลข

## เตรียมก่อนเดโม

- เปิด 3 แท็บ จาก https://anirut77.github.io/lensiq/ : `gate.html`, `village.html`, `parking.html` ใช้ Chrome/Edge รุ่นใหม่
- ไม่ต้องใช้กล้อง ใช้ปุ่ม "ใช้ภาพตัวอย่าง" และ "รถคันถัดไป (ตัวอย่าง)" (ป้ายวาดบนผืนผ้าใบ ไม่มีรถจริง ไม่มีคน)
- ตั้งบ้านสมมติ "บ้านเลขที่ 99/1" กับป้ายตัวอย่างที่ระบบให้ ห้ามใส่เลขทะเบียนจริง
- ใช้ PromptPay ตัวอย่างเฉพาะเมื่อมีหมายเลขทดสอบของผู้นำเสนอเอง อย่าใช้เบอร์ลูกค้า หรือแสดง QR โดยไม่ใส่ยอดสมมติ
- สำรอง: ภาพหน้าจอส่วน "ใช้ทำอะไร และข้อจำกัดสำคัญ" ใน `gate.html`

## สคริปต์ทีละนาที

| นาที | เปิดหน้า | พูด | แสดง | ถามลูกค้า |
|---|---|---|---|---|
| 0:00–1:00 | `gate.html` | "Gate เป็นผู้ช่วย รปภ. ระบบเสนอเลขป้าย รปภ. แตะยืนยันทุกคัน ไม่ใช่ไม้กั้นอัตโนมัติ ใช้มือถือ โน้ตบุ๊ก หรือกล้องที่มีอยู่ ไม่ต้องซื้อกล้อง LPR หลายหมื่นบาท" | แถบ "อ่านป้ายแบบช่วย รปภ." ปุ่มเลือกแบบ A (ลานจอด) และ B (หมู่บ้าน/คอนโด) | "เป็นหมู่บ้าน คอนโด หรือลานจอด มีกี่ช่องทาง รปภ. กี่คนต่อกะ" |
| 1:00–3:00 | `village.html?demo=1` (ช่องทาง) | (ก่อนเริ่ม: ในกล่อง PDPA ชื่อเจ้าหน้าที่ตัวอย่างกรอกไว้แล้ว ติ๊ก 2 ช่องแล้วกด "เริ่มใช้งาน" ถ้ากด "ใช้ภาพตัวอย่าง" ก่อน หน้าจะพาไปที่กล่องนี้เอง) "กด 'ใช้ภาพตัวอย่าง' แล้วกด 'อ่านป้ายตอนนี้' (ระบบไม่อ่านเองจนกว่าจะกด หรือติ๊กอ่านอัตโนมัติ ครั้งแรกโหลดโมเดลประมาณ 12 MB รอ 2–3 วินาที) ระบบหากรอบป้าย อ่าน 5 ภาพ โหวตทีละตัวอักษร ตัวอักษรที่ไม่แน่ใจขีดเส้นใต้ให้ รปภ. ดู จังหวัดเลือกจากรายการ 77 จังหวัด รปภ. ยืนยันหรือแก้ได้เสมอ แตะกรอบป้ายหรือพิมพ์เองก็ได้" | ภาพตัวอย่าง กรอบป้าย หน้าจอยืนยัน ตัวอักษรเสี่ยง จังหวัด; แก้เลขหนึ่งตัว แล้วบอกว่าการแก้ถูกบันทึกในประวัติแบบต่อเนื่องที่ตรวจการแก้ไขได้บนเครื่อง · เตือนล่วงหน้า: ป้ายตัวอย่าง "1กข 2345" อาจขึ้น "เลขนำหน้าไม่แน่ชัด" ให้เลือกระหว่าง "1กข 2345" กับ "กข 2345" ก่อนกดเปิดไม้กั้น นี่คือการออกแบบ (รปภ. ยืนยันทุกการอ่าน) ใช้เป็นจังหวะอธิบายว่าระบบไม่เดาแทนคน | "รปภ. ของท่านถนัดแตะหน้าจอหรือพิมพ์" |
| 3:00–4:30 | `village.html` (ลูกบ้าน ผู้มาเยือน) | "รายชื่อรถลูกบ้านตามบ้านเลขที่ รายการห้ามเข้าต้องมีเหตุผล บัตรผ่านผู้มาเยือนจำกัดเวลา รหัส V-XXXXXX และ QR ส่งทาง LINE ได้ รถไม่รู้จักขึ้นแจ้งเตือน ผู้มาเยือนอยู่เกินเวลาขึ้นแจ้งเตือน ปุ่มเปิดไม้กั้นเป็นของ รปภ. เปิดอัตโนมัติปิดเป็นค่าเริ่มต้น" | เพิ่มรถสมมติเข้าบ้าน 99/1 สร้างบัตรผู้มาเยือน อ่านป้ายตัวอย่างแล้วดูการตัดสิน: ลูกบ้าน / ผู้มาเยือน / ไม่รู้จัก ปุ่ม "เปิด (รปภ. ไม่มีป้าย)" บันทึกทุกครั้ง **มีแล้ว** `village.html?demo=1` โหลดบ้าน รถลูกบ้าน บัตรผู้มาเยือน และรายการห้ามเข้าสมมติไว้ให้แล้ว ไม่ต้องกรอกเอง | "ผู้มาเยือนเข้าอย่างไรตอนนี้ และมีรถที่ต้องห้ามหรือไม่" |
| 4:30–6:30 | `parking.html` | "ลานจอดรถ จับคู่ขาเข้าและขาออกด้วยทะเบียน คิดค่าจอดตามกติกา จอดฟรี N นาที เพดานรายวัน ค้างคืน บัตรหาย ตราประทับร้านค้า ใช้ครั้งเดียว QR พร้อมเพย์ยอดตรง ใบเสร็จ ปิดกะเทียบเงินสด ราคาลานจอดรวมทั้งหมดนี้ ไม่มีค่าเสริม" | ป้ายตัวอย่างเข้า แล้วออก ค่าจอด QR พร้อมเพย์ (สร้างในเครื่อง) ใบเสร็จ ปิดกะ จำนวนรถในลาน ต้องบอกว่า "หน้านี้ไม่ตรวจว่าเงินเข้า แคชเชียร์ดูแอปธนาคารก่อนกดรับเงิน" | "ค่าจอดคิดอย่างไร ใครปิดกะ" |
| 6:30–8:00 | `gate.html` ส่วน "ใช้ทำอะไร และข้อจำกัดสำคัญ" + เมนู "ทดสอบหน้างาน" ในหน้า | อ่านสองบรรทัดตามจริง: "อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน เจ้าหน้าที่ยืนยันทุกคันก่อนเปิดไม้กั้นหรือคิดเงิน ภาพจากกล้องจริงส่วนใหญ่ยังต้องให้เจ้าหน้าที่แตะเลือกป้ายหรือแก้เลข ป้ายเอียง มืด สกปรก หรือป้ายมอเตอร์ไซค์อาจอ่านผิด จึงขายเป็นผู้ช่วย รปภ." ถ้าถูกถามตัวเลข ให้มอบเอกสารเทคนิค | สองบรรทัดข้อจำกัดบนหน้า (ห้ามอ่านตัวเลขเอง) + เมนูทดสอบหน้างาน: กด ✓ ✗ ตัวอย่าง ดูผลกลางวัน/กลางคืน | "ท่านรับได้หรือไม่ถ้ารปภ.ต้องแตะเองบ่อย" |
| 8:00–9:00 | `gate.html` ส่วน "ทำงานอย่างไร" และคู่มืออุปกรณ์ | "ป้ายกว้างอย่างน้อย 120 px ในภาพ (มอเตอร์ไซค์ 160 px) มุมไม่เกิน 30° สูง 1–1.5 ม. ห่างก่อนไม้กั้น 3–6 ม. หลีกเลี่ยงแสงตรงกล้อง กลางคืนใช้ไฟ IR 850 nm ใกล้เลนส์ เราไม่ขายกล้องหรือไม้กั้น รีเลย์ต่อได้แต่ รปภ. กดเปิดหลังยืนยัน" | ตารางตำแหน่งกล้อง ป้ายแจ้ง PDPA `gate-notice.html` | "ตำแหน่งป้อมและแสงตอนกลางคืนเป็นอย่างไร ส่งรูปที่ไม่มีคนมาได้ไหม" |
| 9:00–10:00 | `gate.html` ส่วนราคา | "ทดลองใช้ฟรี 30 วัน 1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน ราคานำร่อง หมู่บ้าน 490 บาทต่อเดือนต่อช่องทาง ลานจอด 790 บาท ติดตั้งหน้างาน 2,500 บาทต่อครั้ง ไม่รวม VAT 7% ไม่รวมอุปกรณ์ นำร่อง 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง" | ตารางราคา (ราคาที่อนุมัติ) เกณฑ์ใน `docs/pilot/PILOT-GATE.md` §5 | "เริ่มทดลอง 30 วันได้เมื่อไร ใครติดป้าย PDPA" |

## จุดที่ต้องมีโหมดเดโม (`?demo=1`)

| ขั้นตอน | สถานะ |
|---|---|
| อ่านป้ายตัวอย่าง ("ใช้ภาพตัวอย่าง" / "รถคันถัดไป") และเมนูทดสอบหน้างาน | มีอยู่แล้ว (ป้ายวาดบนผืนผ้าใบ ไม่มีรถจริง) |
| `village.html?demo=1` โหลดบ้านสมมติ รถลูกบ้าน บัตรผู้มาเยือน และรายการห้ามเข้า | **มีแล้ว** |
| `parking.html?demo=1` โหลดกติกาค่าจอด ตราประทับร้าน และรถที่เข้าลานไว้ก่อน | **มีแล้ว** |

## ห้ามพูด / ห้ามกล่าวอ้าง (NOT to claim)

- ห้ามบอกว่าอ่านป้ายอัตโนมัติ เปิดไม้กั้นอัตโนมัติ หรือเป็น LPR/ANPR แทนที่ รปภ. ต้องบอกว่า "ผู้ช่วย รปภ. แตะยืนยันทุกคัน"
- ห้ามบอกผลหน้างานจริงหรือกลางคืน (ยังไม่มี) ห้ามอ้าง "99%" ของผู้ขายกล้อง LPR รายอื่น ห้ามอ่านตัวเลขทดสอบเอง ถ้าถูกถามตัวเลข ให้มอบเอกสารเทคนิค
- ห้ามบอกว่ามีโมเดลที่ฝึกด้วยป้ายไทย (ยังไม่มี) ห้ามบอกว่าอ่านป้ายขณะรถวิ่งเร็วได้
- ห้ามบอกว่าจดจำใบหน้า หรือถ่ายผู้ขับขี่ (ไม่ทำ)
- ห้ามบอกว่าหน้านี้ยืนยันการชำระเงินพร้อมเพย์ (ไม่ยืนยัน แคชเชียร์ตรวจเอง)
- ห้ามเสนอขายกล้อง ไม้กั้น หรือรีเลย์ (ไม่ขาย) ห้ามบอกว่ามีเปิดไม้กั้นอัตโนมัติเป็นค่าเริ่มต้น (ปิดอยู่ และเปิดได้เฉพาะรถลูกบ้านที่ตรงทุกเงื่อนไข)
- ห้ามบอกว่าถูกต้องตาม PDPA ครบ (ฐานทางกฎหมายอยู่ระหว่างให้ที่ปรึกษายืนยัน) ห้ามเอาป้ายทะเบียนหรือรถของคนอื่นมาแสดง
- ห้ามบอกราคาปกติหลังผ่านเกณฑ์นำร่อง เป็นราคาปัจจุบัน ห้ามบอกว่าทดลอง 30 วันมีตัวจับเวลาในระบบ (ยังเป็นข้อความ ไม่มีตัวนับเวลาในโค้ด OP-20)

## หลังเดโม

ล้างข้อมูลสมมติจากเบราว์เซอร์ บันทึกจำนวนช่องทาง รปภ. สภาพแสง ป้ายแจ้ง ส่งใบเสนอราคา

---

# English

> **DRAFT 2026-11-11.** Use only the simulated plates in the page ("Use sample image"). Never photograph a customer's or anyone's vehicle or plate for a demo.
> Numbers are in the technical sheet `docs/tech-sheets/gate-EN.md` (if asked for numbers, hand over the technical sheet) and `docs/ONE-PAGER-GATE.md`. Open points (OP-xx) are in `docs/sales/README.md`.
> Status (`docs/PAGE-STATUS.md`): `gate.html`, `parking.html`, `village.html` = fine to demo. A guard confirms every read; on real camera images most cars still need staff to tap the plate or correct the number.

**Prepare:** three tabs from https://anirut77.github.io/lensiq/ (`gate.html`, `village.html`, `parking.html`) in current Chrome or Edge. No camera is needed: use "Use sample image"
and "Next vehicle (sample)" (a plate drawn on a canvas; no real vehicle, no person). Use a fictitious house "99/1" and the sample plates the page provides; never type a real plate. Use a
PromptPay QR only with the presenter's own test number and a fictitious amount. Backup: a screenshot of the "What it is for and its main limits" section in `gate.html`.

| Min | Open | Say | Show | Ask |
|---|---|---|---|---|
| 0:00–1:00 | `gate.html` | Gate is a guard's assistant. It suggests a plate; the guard taps to confirm every vehicle. It is not an automatic barrier. It uses the phone, laptop or camera you already have; no LPR camera costing tens of thousands. | The "assisted reading" banner; variant A (car park) and B (village / condo) | Village, condo or car park? How many lanes? How many guards per shift? |
| 1:00–3:00 | `village.html` lane | Press "Use sample image". The page finds the plate box, reads 5 frames and votes character by character. Doubtful characters are underlined for the guard. The province comes from a 77-province list. The guard confirms or corrects; tapping a box or typing is always possible. | Sample image, box, confirm screen, weak characters, province; correct one character and say the correction is kept in a tamper-evident on-device history | Do your guards prefer tapping or typing? |
| 3:00–4:30 | `village.html` residents and visitors | Resident plates per house; a deny list needs a reason; time-limited visitor passes (code V-XXXXXX, QR, LINE share); unknown vehicles and overstaying visitors raise alerts. The open button is the guard's; auto-open is off by default. | Add a fictitious car to house 99/1; make a visitor pass; read the sample plate and see the decision (resident / visitor / unknown); the always-logged "open (guard, no plate)" button. Demo mode: `village.html?demo=1` preloads sample houses, cars, passes and a deny list. | How do visitors enter now? Do you have a deny list? |
| 4:30–6:30 | `parking.html` | Car park: pair entry and exit by plate; fee rules (free minutes, daily cap, overnight, lost ticket, one-use shop stamps); exact-amount PromptPay QR; receipts; shift close against cash. The car-park price includes all of this, with no add-ons. | Sample plate in, then out; the fee; PromptPay QR (made on the device); receipt; shift close; cars inside. Say: "this page does not verify payment; the cashier checks the bank app before pressing money received." | How are fees charged? Who closes the shift? |
| 6:30–8:00 | `gate.html` "What it is for and its main limits" + the on-page on-site test | Read the two lines as they are: "Reads Thai licence plates on the device for car parks and villages. Staff confirm every car before the barrier opens or a fee is charged. On real camera images most cars still need staff to tap the plate or correct the number; tilted, dark, dirty or motorcycle plates may be misread." So we sell an assistant. If asked for numbers, hand over the technical sheet. | The two limit lines on the page (do not read figures aloud); press tick / cross on the on-site test; day / night split | Is a guard who taps often acceptable to you? |
| 8:00–9:00 | `gate.html` "How it works", hardware guide | Plate at least 120 px wide in the frame (160 px for motorcycles), angle up to 30 degrees, 1–1.5 m high, 3–6 m before the barrier, no direct sun; at night an 850 nm IR light near the lens. We do not sell cameras or barriers. A relay can be wired, but the guard presses open after confirming. | Camera placement table; the PDPA sign `gate-notice.html` | Where is the guard post and what is the night lighting? Can you send a photo with no people? |
| 9:00–10:00 | `gate.html` price | Free 30-day trial: 1 lane, 100 plates a day, 7-day log. Pilot price: village 490 THB per lane per month, car park 790 THB, on-site set-up 2,500 THB per visit, excl. 7% VAT, hardware not included. The pilot runs at least 5 days per site and at least 200 real reads. | Price table (approved list); thresholds in `docs/pilot/PILOT-GATE.md` §5 | When can the 30-day trial start? Who posts the PDPA sign? |

**Demo mode (`?demo=1`):** available. `village.html?demo=1` preloads sample houses, cars, visitor passes and a deny list; `parking.html?demo=1` preloads
fee rules, shop stamps and parked cars (no PromptPay ID, so no real payment). A person still confirms every plate read.

**Do NOT claim:** automatic reading, automatic barrier opening, or "LPR / ANPR that replaces the guard" (say: a guard's assistant, taps to confirm every vehicle); any field or night result (none yet); read no test figures aloud, and if asked for numbers hand over the technical sheet;
a competitor's "99%"; a model trained on Thai plates (none exists); reading plates at speed; face recognition or photographing the driver (not done);
that the page confirms a PromptPay payment (it does not); that we sell cameras, barriers or relays (we do not); that auto-open is on by default (it is off); full PDPA compliance (legal basis is with counsel for review);
the regular price after the pilot thresholds are met as the current price (it may be shown beside the pilot price when labelled); that the 30-day trial is enforced by a timer (text only, no timer in code, OP-20). Never show anyone else's plate or vehicle.

**After the demo:** clear the sample data from the browser; note lanes, guards, lighting and signage; send the quotation.

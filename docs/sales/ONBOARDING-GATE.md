# คู่มือเริ่มต้นใช้งาน: LENSIQ Gate (ผู้ช่วย รปภ. อ่านป้ายทะเบียน รปภ. ยืนยันทุกคัน)

> **ร่าง (DRAFT) 2026-11-11** สำหรับลูกค้าหลังตกลงซื้อหรือเริ่มทดลอง ใช้กับ `village.html` (หมู่บ้าน/คอนโด) และ `parking.html` (ลานจอดรถ)
> ฐานข้อมูล: `docs/GATE.md` (§1–§5), `docs/pilot/PILOT-GATE.md`, `docs/DEPLOYMENT-CHECKLIST.md`, `docs/SUPPORT.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> ช่อง [วงเล็บ] เจ้าของกรอก ห้ามแต่งข้อมูลติดต่อ LENSIQ ไม่ขายกล้อง ไม้กั้น หรือรีเลย์ ระบบเสนอเลขป้าย รปภ. แตะยืนยันทุกคัน

> ความแม่นยำหน้างานจริงยังไม่ได้วัด ตัวเลขในคู่มือนี้มาจากชุดข้อมูลสาธารณะหรือข้อมูลจำลอง (ที่มาใน `docs/ACCURACY-CLAIMS.md`)

## 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ต่อช่องทาง | มือถือ Android/iPhone หรือโน้ตบุ๊กที่มีกล้อง 1080p ขาตั้งหรือตัวยึดแน่น สายไฟหรือพาวเวอร์แบงก์ ที่บังแดด (สำหรับ 24 ชั่วโมงแนะนำกล้อง IP แบบติดตั้งถาวร) |
| เบราว์เซอร์ | Chrome/Edge รุ่นปัจจุบัน (110 ขึ้นไป) หรือ Safari 16.4 ขึ้นไป ใช้โปรไฟล์เฉพาะ ไม่ใช้หน้าต่างส่วนตัว |
| ที่อยู่หน้าเว็บ | `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น มิฉะนั้นเปิดกล้องไม่ได้ ที่อยู่ที่ใช้จริง [ที่อยู่เว็บ — ต้องยืนยัน / to confirm] |
| กล้อง IP | เบราว์เซอร์เปิด RTSP ไม่ได้ ต้องผ่านตัวกลาง go2rtc บนมินิพีซีในเครือข่ายภายใน (การต่อเป็นแหล่งกล้องในหน้ายังเป็นงานรุ่นถัดไป ตอนนี้ใช้กล้อง USB/มือถือ หรือหน้า go2rtc ข้างกันแล้วพิมพ์เลขเอง) แยกกล้องไว้ใน VLAN ปิด ห้ามเปิด RTSP ออกอินเทอร์เน็ต |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรกเพื่อโหลดโมเดล หลังนั้นใช้ออฟไลน์ได้ การโหลดหน้าใหม่โดยไม่มีเครือข่ายอาจล้มเหลว ไม่ต้องมีอินเทอร์เน็ตตลอด |
| ตำแหน่งกล้อง | ป้ายกว้าง ≥ 120 px ในภาพ (มอเตอร์ไซค์ ≥ 160 px) มุมแนวนอน/แนวตั้ง ≤ 30° สูง 1–1.5 ม. ห่างก่อนไม้กั้น 3–6 ม. ชี้ไปที่จุดที่รถหยุด หลีกเลี่ยงแสงแดดหรือไฟหน้าตรงเข้ากล้อง |
| ชัตเตอร์/แสง | ภาพเบลอจากการเคลื่อนไหวคือสาเหตุผิดพลาดหลัก ตั้งชัตเตอร์ ≤ 1/500 s (ถ้ารถไม่หยุด 1/1000 s) โฟกัสคงที่ที่เส้นหยุด เปิด WDR/BLC ถ้าย้อนแสง ทำให้รถหยุดหรือชะลอ (ไม้กั้น ลูกระนาด) |
| กลางคืน | ป้ายไทยสะท้อนแสง ใช้ไฟ IR 850 nm ใกล้เลนส์ ลดกำลังไฟหรือชัตเตอร์ถ้าป้ายสว่างจ้า ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
| ไม้กั้น/รีเลย์ | ไม่ขายและไม่รวมในบริการ ถ้าลูกค้าหรือผู้ติดตั้งต่อรีเลย์เอง รปภ. ต้องกดเปิดหลังยืนยัน ห้ามต่อให้เปิดโดยไม่มีคนยืนยัน และห้ามต่อในวงจรมอเตอร์ (ดู `docs/GATE.md` §4) |
| ป้ายแจ้ง PDPA | ติด `gate-notice.html` (ไทย/อังกฤษ) ก่อนถึงกล้อง เผยแพร่ประกาศความเป็นส่วนตัว (ฐานทางกฎหมายรอที่ปรึกษา) กำหนดระยะเก็บ ตั้งชื่อผู้ปฏิบัติงานที่ยอมรับประกาศก่อนเปิดกล้อง |
| เอกสาร | หนังสืออนุญาตจากนิติบุคคลหมู่บ้าน/อาคารชุดหรือเจ้าของลานจอด DPIA (`docs/pdpa/DPIA-template.md`) |

## 2. วันแรกทีละขั้น

1. **ติดป้ายแจ้ง** ก่อนถึงกล้อง ตรวจว่าเห็นชัดจากรถที่เข้าเขต
2. **ติดตั้งอุปกรณ์** ตามตำแหน่งกล้อง ทดสอบภาพ: ป้ายกว้าง ≥ 120 px ไม่เบลอเมื่อรถหยุด
3. **เปิดหน้า** `village.html` หรือ `parking.html` บนอุปกรณ์ เลือกเปิดกล้อง ให้ผู้ปฏิบัติงานอ่านและยอมรับประกาศก่อนกล้องเริ่ม
4. **ตั้งค่า** ชื่อผู้ปฏิบัติงาน (บันทึกในประวัติแก้ไข) จังหวัดที่พบบ่อยที่จุดนั้น (ขึ้นต้นรายการ) ระยะเก็บบันทึก (ค่าเริ่มต้น 90 วัน ภาพตัดป้ายปิดไว้ ถ้าเปิดเก็บ 7–30 วัน ใบเสร็จ 5 ปี)
   - หมู่บ้าน: นำเข้ารายชื่อรถลูกบ้านเป็น `บ้านเลขที่,ป้าย,จังหวัด` (จำกัดจำนวนต่อบ้าน) รายการห้ามเข้า (ต้องใส่เหตุผล) บัตรผ่านผู้มาเยือนจำกัดเวลา (V-XXXXXX / QR / แชร์ LINE) เปิดไม้กั้นอัตโนมัติ **ปิดไว้เป็นค่าเริ่มต้น**
   - ลานจอด: กฎค่าจอด (จอดฟรี N นาที หน่วยเวลา อัตรา เพดานรายวัน ค้างคืน บัตรหาย) ตราประทับร้านค้า พร้อมเพย์ (หมายเลขของลูกค้าเอง) ใบเสร็จ
5. **อบรม รปภ. 30 นาที**: ยืนยันหรือแก้ทุกค่า แตะกรอบป้ายเมื่อระบบขึ้น "ไม่เหมือนป้ายทะเบียน" พิมพ์เลขเองได้เสมอ ปุ่ม "เปิด (รปภ. ไม่มีป้าย)" ใช้ได้และบันทึกทุกครั้ง
   พร้อมเพย์: ต้องเปิดแอปธนาคารตรวจเงินเข้าก่อนกด "รับเงินแล้ว" หน้าไม่ตรวจการชำระ
6. **ทดลอง 1 ชั่วโมง** ผ่านรถจริงอย่างน้อย 10 คัน ตรวจว่ากรอบป้ายถูก ตัวอักษรเสี่ยงถูกขีดเส้นใต้ จังหวัดถูกเลือก
7. **เปิดเมนู "ตรวจความแม่นยำ"** ตั้งแต่วันแรก: รปภ. กด ✓ หรือ ✗ ทุกการอ่าน (การแก้ค่านับเป็น ✗) ระบบแยกกลางวัน/กลางคืนและแสดงช่วงความเชื่อมั่น 95%
8. **สัปดาห์แรก**: ตรวจตัวเลขวันละครั้ง ถ้ากลางคืนต่ำ ปรับไฟ IR/ชัตเตอร์ก่อน ผู้ทดลองใช้ฟรี 30 วัน (1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน) นับวันเอง ระบบยังไม่มีตัวจับเวลา (OP-20)
9. **นำร่อง** (ถ้าสั่ง): อย่างน้อย 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง กลางคืน ≥ 40 มอเตอร์ไซค์ ≥ 30 ตัดสินด้วยขอบล่าง Wilson 95% (เป้าตาม `docs/pilot/PILOT-GATE.md` §5)

## 3. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| ไม่ขออนุญาตกล้อง / เปิดกล้องไม่ได้ | `http://` ที่ไม่ใช่ localhost หรือสิทธิ์กล้องถูกปิด | ใช้ `https://` เปิดสิทธิ์กล้องของเว็บนี้ โหลดใหม่ |
| ระบบหาป้ายไม่เจอ ต้องแตะกรอบเองบ่อย | ป้ายเล็กในภาพ มุมเกิน 30° เบลอ แสงย้อน | เข้าใกล้ ปรับมุม/ชัตเตอร์ ให้รถหยุด การหาป้ายในภาพจริงยังอ่อน (ภาพจริงสาธารณะ ต้องแตะเอง 78%) เป็นเรื่องปกติ รปภ. แตะกรอบหรือพิมพ์เอง |
| อ่านผิดตัวอักษรที่หน้าตาคล้ายกัน (ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ) | ตัวอ่านเป็นแบบทั่วไป ไม่ได้ฝึกกับป้ายไทย | ดูตัวอักษรที่ขีดเส้นใต้ รปภ. แก้ การจับคู่ขาเข้า-ขาออกยอมให้ตัวคล้ายกันต่างกันครึ่งค่า |
| ขึ้น "ไม่เหมือนป้ายทะเบียน" กับป้ายจริง | ตัวตรวจว่าเป็นป้ายเข้มงวดเกินสำหรับป้ายบางแบบ | แตะกรอบป้ายเอง/พิมพ์เอง จดจำนวนครั้งในช่องหมายเหตุเพื่อทีมปรับ |
| ป้ายมอเตอร์ไซค์ 3 บรรทัด ป้ายประมูล ป้ายสีพิเศษ อ่านยาก | ข้อจำกัดที่ทราบ | พิมพ์เอง |
| กลางคืนอ่านไม่ได้ | แสงไม่พอ ป้ายสว่างจ้างจากไฟ IR | เพิ่ม/ลดไฟ IR ตั้งชัตเตอร์ ตรวจแยกกลางคืนในเมนูตรวจความแม่นยำ |
| รีเลย์ไม่ทำงานจากหน้าเว็บ | หน้ามีนโยบายที่ห้ามเรียกอุปกรณ์ในเครือข่ายโดยตรง และเบราว์เซอร์อาจบล็อก (HTTPS เรียก HTTP ไม่ได้) | หน้าแจ้งผล รปภ. เปิดที่กล่องควบคุม เหตุการณ์ยังบันทึก ผู้ติดตั้งใช้ตัวกลางในเครื่องเดียวกัน (`docs/GATE.md` §4) |
| QR พร้อมเพย์สแกนแล้วยอดไม่ตรง | หมายเลขพร้อมเพย์ตั้งค่าไม่ถูก | ตรวจหมายเลขในหน้าตั้งค่า ใช้หมายเลขของลูกค้าเอง ทดสอบด้วยยอดเล็กน้อย |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัวหรือล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ ส่งออก CSV สำรองสม่ำเสมอ (มีเลขทะเบียน เก็บแบบเข้ารหัส) |
| รถคันเดิมนับหลายครั้ง | รถหยุดนาน | นับไม่เกิน 3 ครั้งต่อคันในชุดนำร่อง ตรวจที่ผลสรุป |

## 4. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| คำถามการใช้งาน การตั้งค่า | อีเมล [อีเมลสนับสนุน] · LINE OA [LINE OA] · โทร [เบอร์โทร] (OP-16 ยังไม่ประกาศ) |
| ระบบใช้ไม่ได้ที่ป้อมในเวลาเปิด หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 เวลาตอบรับตามแผนสนับสนุนที่ตกลง [ต้องยืนยัน / to confirm ค่าใน `docs/SUPPORT.md` เป็นร่างในวงเล็บ] (OP-17) |
| กล้อง ไม้กั้น รีเลย์ เครือข่าย ไฟฟ้า | ผู้ติดตั้งหรือผู้ขายอุปกรณ์ของลูกค้า (LENSIQ ไม่ขายอุปกรณ์) |
| คำขอสิทธิ์ข้อมูลส่วนบุคคลของเจ้าของรถ | นิติบุคคล/เจ้าของลานจอดเป็นผู้ควบคุมข้อมูล |

แจ้งปัญหา: ไซต์ ช่องทาง ชื่อหน้า เวลา ขั้นตอน รุ่นเบราว์เซอร์ **ห้ามส่งภาพรถ ป้ายทะเบียน หรือภาพบุคคล**

---

# English

> **DRAFT 2026-11-11.** For customers after purchase or at the start of a trial, for `village.html` (village / condo) and `parking.html` (car park). Based on `docs/GATE.md` (§1–§5),
> `docs/pilot/PILOT-GATE.md`, `docs/DEPLOYMENT-CHECKLIST.md` and `docs/SUPPORT.md`. Open points (OP-xx) are in `docs/sales/README.md`. Fields in [brackets] are for the owner.
> LENSIQ sells no camera, barrier or relay. The system suggests a plate; the guard taps to confirm every vehicle.

> Accuracy at a real site has not been measured. Figures in this guide come from public datasets or synthetic data (sources in `docs/ACCURACY-CLAIMS.md`).

## 1. Before installing

- **Device per lane:** an Android phone, iPhone or laptop with a 1080p camera, a firm stand or mount, power or a power bank, a sun hood (for 24-hour use a fixed IP camera is recommended).
- **Browser:** current Chrome or Edge (110+) or Safari 16.4+, a dedicated profile, no private window.
- **Page address:** a valid `https://` or `http://localhost` only; otherwise the camera will not open. The real address: [to confirm].
- **IP camera:** a browser cannot open RTSP. Run go2rtc on a mini PC in the local network. Wiring it in as a camera source in the page is a later item; today use a USB or phone camera, or the go2rtc
  page side by side with typed entry. Keep cameras on an isolated VLAN; never expose RTSP to the internet.
- **Network:** internet is needed when the page is first opened, to load the models; afterwards it works offline. Reloading without a network may fail. It does not need to be online all day.
- **Camera position:** plate at least 120 px wide in the frame (160 px for motorcycles); angle up to 30 degrees both ways; 1–1.5 m high; 3–6 m before the barrier; aimed where vehicles stop; avoid direct
  sun or headlights.
- **Shutter and light:** motion blur is the main error source. Shutter 1/500 s or faster (1/1000 s if vehicles do not stop), fixed focus on the stop line, WDR / BLC for backlight, make vehicles
  stop or slow (barrier, speed bump).
- **Night:** Thai plates are retro-reflective; use an 850 nm IR light near the lens; lower the power or exposure if the plate saturates; check the night result separately in the accuracy check.
- **Barrier / relay:** not sold and not part of the service. If the customer or an installer wires a relay, the guard must press open after confirming; never wire it to open without a person, and never
  in the motor circuit (`docs/GATE.md` §4).
- **PDPA sign:** post `gate-notice.html` (Thai / English) before the camera; publish the privacy notice (legal basis awaits counsel); set retention; the operator acknowledges the notice before the
  camera starts.
- **Documents:** permission from the village / condo juristic person or car-park owner; a DPIA (`docs/pdpa/DPIA-template.md`).

## 2. First day, step by step

1. Post the sign before the camera; check it is visible from a vehicle entering the area.
2. Install the device at the camera position and test the image: plate at least 120 px wide, not blurred when the vehicle stops.
3. Open `village.html` or `parking.html`, start the camera; the operator reads and accepts the notice before the camera starts.
4. Settings: operator name (kept in the correction history); the provinces most common at the site (listed first); retention (default 90 days for logs; plate crops are off; if on, 7–30 days;
   receipts 5 years).
   - Village: import resident plates as `house,plate,province` (a limit per house), the deny list (a reason is required), time-limited visitor passes (V-XXXXXX / QR / LINE share). Auto-open stays **off by default**.
   - Car park: fee rules (free minutes, unit and rate, daily cap, overnight, lost ticket), shop stamps, PromptPay (the customer's own number), receipts.
5. Guard training, 30 minutes: confirm or correct every value; tap the box when the page says "does not look like a plate"; typing is always possible; the "open (guard, no plate)" button is
   always available and always logged. PromptPay: open the bank app and check the money before pressing "money received"; the page does not verify payment.
6. One-hour trial with at least 10 real vehicles: check the box is right, doubtful characters are underlined, the province is chosen.
7. Use the "accuracy check" from day one: the guard presses tick or cross on every read (an edited read counts as a cross); the page splits day and night and shows a 95% interval.
8. First week: review the numbers daily; if night is low, fix the IR light and shutter first. The free 30-day trial (1 lane, 100 plates a day, 7-day log) is counted by you; there is no timer in the system (OP-20).
9. Pilot (if ordered): at least 5 days per site, at least 200 real reads, at least 40 at night, at least 30 motorcycles; judged on the lower bound of a 95% Wilson interval (targets in
   `docs/pilot/PILOT-GATE.md` §5).

## 3. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| No camera prompt, or camera will not open | `http://` that is not localhost, or permission blocked | Use `https://`; allow the camera for the site; reload |
| The plate is not found; the guard taps the box often | Small plate in the frame, angle over 30 degrees, blur, backlight | Move closer, adjust angle and shutter, make vehicles stop. Finding plates in real photos is still weak (public photos: the box had to be tapped 78%); this is normal; the guard taps or types |
| Look-alike characters misread (ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ) | The reader is general Thai text, not trained on plates | Read the underlined characters; the guard corrects. Entry–exit matching treats look-alikes as half a difference |
| "Does not look like a plate" on a real plate | The plate check is strict for some plate styles | Tap the box or type; note how often in the notes column so the team can tune |
| Three-line motorcycle plates, auction plates, special colours misread | Known limits | Type it in |
| Cannot read at night | Too little light, or the plate saturates under IR | Raise or lower the IR light, set the shutter; check night separately in the accuracy check |
| Relay does not respond from the web page | The page blocks direct calls to local devices, and the browser may block them (HTTPS cannot call HTTP) | The page says so and the guard opens at the control box; the event is still logged; the installer uses a same-origin bridge (`docs/GATE.md` §4) |
| PromptPay QR amount does not match | PromptPay number set wrongly | Check the number in settings (use the customer's own); test with a small amount |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; export CSV backups regularly (they hold plates; store encrypted) |
| The same vehicle counted many times | The vehicle stayed a long time | Count at most 3 times per vehicle in the pilot set; check the summary |

## 4. Who to contact

Questions and set-up: e-mail [support e-mail], LINE OA [LINE OA], phone [phone] (OP-16, not announced yet). Down at the guard post during opening hours, or a suspected data leak: the same channels,
marked S1; response times follow the agreed support plan **[to confirm]** (`docs/SUPPORT.md` values are bracketed drafts, OP-17). Cameras, barriers, relays, network and power: the customer's installer
or equipment seller (LENSIQ sells no hardware). Data-subject requests from vehicle owners: the juristic person / car-park owner is the controller.
When reporting give the site, lane, page, time, steps and browser version. **Never send images of vehicles, plates or people.**

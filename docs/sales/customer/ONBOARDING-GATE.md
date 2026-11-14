# LENSIQ Gate: คู่มือเริ่มต้นใช้งานสำหรับลูกค้า (ผู้ช่วย รปภ. อ่านป้ายทะเบียน) / Customer onboarding guide (guard assistant, plate reading) / 客户入门指南（保安车牌识别助手）

ฉบับ 2026-11-14 / Version 2026-11-14 / 版本 2026-11-14

## ภาษาไทย

คู่มือนี้ใช้กับหน้า `village.html` (หมู่บ้านและคอนโด) และ `parking.html` (ลานจอดรถ) บนเว็บไซต์ https://anirut77.github.io/lensiq/ ระบบ **เสนอเลขป้ายทะเบียน** แล้ว **รปภ. แตะยืนยันทุกคัน** ระบบไม่ตัดสินใจแทนคน
LENSIQ ไม่ขายกล้อง ไม้กั้น หรือรีเลย์ ภาพประมวลผลบนเครื่องของท่าน

ความแม่นยำหน้างานจริงยังไม่ได้วัด (ยังไม่มีผลวัดภาคสนาม) ตัวเลขในคู่มือนี้มาจากชุดข้อมูลสาธารณะหรือข้อมูลจำลองเท่านั้น และระบุที่มากำกับไว้ทุกตัว

### 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ต่อช่องทาง | มือถือ Android หรือ iPhone หรือโน้ตบุ๊กที่มีกล้อง 1080p ขาตั้งหรือตัวยึดที่แน่น สายไฟหรือพาวเวอร์แบงก์ ที่บังแดด (สำหรับใช้ 24 ชั่วโมงแนะนำกล้อง IP แบบติดตั้งถาวร) |
| เบราว์เซอร์ | Chrome หรือ Edge รุ่นปัจจุบัน (110 ขึ้นไป) หรือ Safari 16.4 ขึ้นไป ใช้โปรไฟล์เฉพาะ ไม่ใช้หน้าต่างส่วนตัว |
| ที่อยู่หน้าเว็บ | ใช้ `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น มิฉะนั้นเปิดกล้องไม่ได้ ที่อยู่หลักคือ https://anirut77.github.io/lensiq/ หรือที่อยู่ที่ทีมงานแจ้งให้ใช้ |
| กล้อง IP | เบราว์เซอร์เปิด RTSP โดยตรงไม่ได้ ต้องผ่านตัวกลาง go2rtc บนมินิพีซีในเครือข่ายภายใน (การต่อเป็นแหล่งกล้องในหน้ายังเป็นงานรุ่นถัดไป ตอนนี้ใช้กล้อง USB หรือกล้องมือถือ หรือเปิดหน้า go2rtc ไว้ข้างกันแล้วพิมพ์เลขป้ายเอง) แยกกล้องไว้ใน VLAN ปิด ห้ามเปิด RTSP ออกอินเทอร์เน็ต |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรกเพื่อโหลดโมเดล หลังจากนั้นใช้ออฟไลน์ได้ การโหลดหน้าใหม่โดยไม่มีเครือข่ายอาจล้มเหลว ไม่ต้องออนไลน์ตลอดวัน |
| ตำแหน่งกล้อง | ป้ายกว้างอย่างน้อย 120 px ในภาพ (มอเตอร์ไซค์ 160 px) มุมแนวนอนและแนวตั้งไม่เกิน 30° ติดสูง 1–1.5 ม. ห่างก่อนถึงไม้กั้น 3–6 ม. ชี้ไปที่จุดที่รถหยุด หลีกเลี่ยงแสงแดดหรือไฟหน้ารถส่องตรงเข้ากล้อง |
| ชัตเตอร์และแสง | ภาพเบลอจากการเคลื่อนไหวคือสาเหตุผิดพลาดหลัก ตั้งชัตเตอร์ 1/500 วินาทีหรือเร็วกว่า (ถ้ารถไม่หยุดใช้ 1/1000 วินาที) โฟกัสคงที่ที่เส้นหยุด เปิด WDR หรือ BLC เมื่อย้อนแสง และทำให้รถหยุดหรือชะลอ (ไม้กั้น ลูกระนาด) |
| กลางคืน | ป้ายไทยสะท้อนแสง ใช้ไฟ IR 850 nm ติดใกล้เลนส์ ลดกำลังไฟหรือชัตเตอร์ถ้าป้ายสว่างจ้า ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
| ไม้กั้นและรีเลย์ | ไม่จำหน่ายและไม่รวมในบริการ ถ้าลูกค้าหรือผู้ติดตั้งต่อรีเลย์เอง รปภ. ต้องกดเปิดหลังยืนยันเสมอ ห้ามต่อให้เปิดโดยไม่มีคนยืนยัน และห้ามต่อในวงจรมอเตอร์ ทีมงานจะส่งคู่มือการต่อฉบับเต็มให้ผู้ติดตั้ง |
| ป้ายแจ้ง PDPA | ติดป้ายจาก `gate-notice.html` ก่อนถึงกล้อง (ป้ายพิมพ์ได้มีเฉพาะภาษาไทยและอังกฤษ) เผยแพร่ประกาศความเป็นส่วนตัวของไซต์ท่าน กำหนดระยะเก็บบันทึก และให้ผู้ปฏิบัติงานที่ใช้ระบบยอมรับประกาศก่อนเปิดกล้อง |
| เอกสาร | หนังสืออนุญาตจากนิติบุคคลหมู่บ้านหรืออาคารชุด หรือเจ้าของลานจอด และการประเมินผลกระทบด้านข้อมูลส่วนบุคคล (DPIA) ทีมงานจะส่งแบบฟอร์มให้ |

### 2. วันแรกทีละขั้น

1. **ติดป้ายแจ้ง** ก่อนถึงกล้อง ตรวจว่ามองเห็นชัดจากรถที่เข้าเขต
2. **ติดตั้งอุปกรณ์** ตามตำแหน่งกล้อง ทดสอบภาพ: ป้ายกว้างอย่างน้อย 120 px และไม่เบลอเมื่อรถหยุด
3. **เปิดหน้า** `village.html` หรือ `parking.html` บนอุปกรณ์ เลือกเปิดกล้อง ให้ผู้ปฏิบัติงานอ่านและยอมรับประกาศก่อนกล้องเริ่มทำงาน
4. **ตั้งค่า** ชื่อผู้ปฏิบัติงาน (บันทึกในประวัติการแก้ไข) จังหวัดที่พบบ่อยที่จุดนั้น (จะขึ้นต้นรายการ) และระยะเก็บบันทึก: ค่าเริ่มต้นของแผนที่ชำระเงินคือเก็บบันทึก 90 วัน ภาพตัดป้ายปิดไว้ (ถ้าเปิดเก็บภาพ 7–30 วัน) ใบเสร็จเก็บ 5 ปี
   ส่วนข้อจำกัดเก็บบันทึก 7 วันใช้เฉพาะช่วงทดลองใช้ฟรี 30 วันเท่านั้น
   - หมู่บ้าน: นำเข้ารายชื่อรถลูกบ้านเป็น `บ้านเลขที่,ป้าย,จังหวัด` (จำกัดจำนวนต่อบ้าน) รายการห้ามเข้า (ต้องใส่เหตุผล) บัตรผ่านผู้มาเยือนจำกัดเวลา (V-XXXXXX / QR / แชร์ทาง LINE) การเปิดไม้กั้นอัตโนมัติ **ปิดไว้เป็นค่าเริ่มต้น**
   - ลานจอด: กฎค่าจอด (จอดฟรีกี่นาที หน่วยเวลา อัตรา เพดานรายวัน ค้างคืน บัตรหาย) ตราประทับร้านค้า พร้อมเพย์ (ใช้หมายเลขของลูกค้าเอง) และใบเสร็จ
5. **อบรม รปภ. 30 นาที**: ยืนยันหรือแก้ทุกค่า แตะกรอบป้ายเมื่อระบบขึ้น "ไม่เหมือนป้ายทะเบียน" พิมพ์เลขเองได้เสมอ ปุ่ม "เปิด (รปภ. ไม่มีป้าย)" ใช้ได้ตลอดและบันทึกทุกครั้ง
   พร้อมเพย์: ต้องเปิดแอปธนาคารตรวจว่าเงินเข้าแล้วก่อนกด "รับเงินแล้ว" เพราะหน้านี้ไม่ตรวจการชำระเงิน
6. **ทดลอง 1 ชั่วโมง** ผ่านรถจริงอย่างน้อย 10 คัน ตรวจว่ากรอบป้ายถูกต้อง ตัวอักษรที่เสี่ยงอ่านผิดถูกขีดเส้นใต้ และเลือกจังหวัดถูก
7. **เปิดเมนู "ตรวจความแม่นยำ"** ตั้งแต่วันแรก: รปภ. กด ✓ หรือ ✗ ทุกการอ่าน (ถ้ามีการแก้ค่านับเป็น ✗) ระบบแยกกลางวันและกลางคืนและแสดงช่วงความเชื่อมั่น 95%
8. **สัปดาห์แรก**: ตรวจตัวเลขวันละครั้ง ถ้ากลางคืนต่ำให้ปรับไฟ IR และชัตเตอร์ก่อน ผู้ทดลองใช้ฟรี 30 วัน (1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน) ให้นับวันเอง เพราะระบบยังไม่มีตัวจับเวลา
9. **นำร่อง** (ถ้าสั่ง): อย่างน้อย 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง ในจำนวนนี้กลางคืนอย่างน้อย 40 และมอเตอร์ไซค์อย่างน้อย 30 ตัดสินด้วย **ขอบล่างของช่วงความเชื่อมั่น Wilson 95%** เป้าหมาย: กลางวันถูกต้องทั้งป้ายอย่างน้อย 95% กลางคืนอย่างน้อย 85%

### 3. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| ไม่ขออนุญาตกล้อง หรือเปิดกล้องไม่ได้ | ใช้ `http://` ที่ไม่ใช่ localhost หรือสิทธิ์กล้องถูกปิด | ใช้ `https://` เปิดสิทธิ์กล้องของเว็บนี้ แล้วโหลดหน้าใหม่ |
| ระบบหาป้ายไม่เจอ ต้องแตะกรอบเองบ่อย | ป้ายเล็กในภาพ มุมเกิน 30° ภาพเบลอ แสงย้อน | เข้าใกล้ ปรับมุมและชัตเตอร์ ให้รถหยุด การหาป้ายในภาพจริงยังอ่อน (ภาพจริงจากชุดข้อมูลสาธารณะ ต้องแตะกรอบเอง 78%) เป็นเรื่องปกติ รปภ. แตะกรอบหรือพิมพ์เอง |
| อ่านผิดตัวอักษรที่หน้าตาคล้ายกัน (เช่น ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ) | ตัวอ่านเป็นแบบทั่วไป ไม่ได้ฝึกกับป้ายไทย | ดูตัวอักษรที่ขีดเส้นใต้ รปภ. แก้ค่า การจับคู่ขาเข้า-ขาออกถือว่าตัวที่คล้ายกันต่างกันครึ่งค่า |
| ขึ้น "ไม่เหมือนป้ายทะเบียน" กับป้ายจริง | ตัวตรวจว่าเป็นป้ายเข้มงวดเกินไปสำหรับป้ายบางแบบ | แตะกรอบป้ายเองหรือพิมพ์เอง และจดจำนวนครั้งในช่องหมายเหตุเพื่อให้ทีมงานปรับปรุง |
| ป้ายมอเตอร์ไซค์ 3 บรรทัด ป้ายประมูล ป้ายสีพิเศษ อ่านยาก | ข้อจำกัดที่ทราบ | พิมพ์เอง |
| กลางคืนอ่านไม่ได้ | แสงไม่พอ หรือป้ายสว่างจ้าจากไฟ IR | เพิ่มหรือลดไฟ IR ตั้งชัตเตอร์ ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
| รีเลย์ไม่ทำงานจากหน้าเว็บ | หน้าไม่เรียกอุปกรณ์ในเครือข่ายภายในโดยตรง และเบราว์เซอร์อาจบล็อก (HTTPS เรียก HTTP ไม่ได้) | หน้าแจ้งผล รปภ. เปิดที่กล่องควบคุม เหตุการณ์ยังบันทึก ผู้ติดตั้งใช้ตัวกลางในเครื่องเดียวกัน (ทีมงานจะส่งคู่มือฉบับเต็มให้) |
| QR พร้อมเพย์สแกนแล้วยอดไม่ตรง | ตั้งหมายเลขพร้อมเพย์ไม่ถูก | ตรวจหมายเลขในหน้าตั้งค่า ใช้หมายเลขของลูกค้าเอง ทดสอบด้วยยอดเล็กน้อย |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัวหรือล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ ส่งออก CSV สำรองสม่ำเสมอ (มีเลขทะเบียน ให้เก็บแบบเข้ารหัส) |
| รถคันเดิมถูกนับหลายครั้ง | รถหยุดนาน | ในชุดนำร่องนับไม่เกิน 3 ครั้งต่อคัน ตรวจที่ผลสรุป |

### 4. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| คำถามการใช้งาน การตั้งค่า | LINE: @632yliiw · อีเมล: [เจ้าของจะแจ้ง] · โทร: [เจ้าของจะแจ้ง] |
| ระบบใช้ไม่ได้ที่ป้อมในเวลาเปิดทำการ หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 (เหตุร้ายแรง: ใช้งานไม่ได้หรือสงสัยข้อมูลรั่ว) เวลาตอบรับเป็นไปตามแผนสนับสนุนในใบเสนอราคา |
| กล้อง ไม้กั้น รีเลย์ เครือข่าย ไฟฟ้า | ผู้ติดตั้งหรือผู้ขายอุปกรณ์ของลูกค้า (LENSIQ ไม่ขายอุปกรณ์) |
| คำขอสิทธิ์ข้อมูลส่วนบุคคลของเจ้าของรถ | นิติบุคคลหรือเจ้าของลานจอดเป็นผู้ควบคุมข้อมูล |

เมื่อแจ้งปัญหา บอก: ไซต์ ช่องทาง ชื่อหน้า เวลา ขั้นตอนที่ทำ และรุ่นเบราว์เซอร์ **ห้ามส่งภาพรถ ป้ายทะเบียน หรือภาพบุคคล**

## English

This guide covers `village.html` (villages and condos) and `parking.html` (car parks) on https://anirut77.github.io/lensiq/. The system **suggests a plate number** and the **guard taps to approve every vehicle**. The system does not decide in place of a person.
LENSIQ sells no camera, barrier or relay. Images are processed on your own device.

Accuracy at a real site has not been measured (there is no field measurement yet). Figures in this guide come only from public datasets or synthetic data, and each is labelled with its source.

### 1. Before installing

- **Device per lane:** an Android phone, iPhone or laptop with a 1080p camera, a firm stand or mount, power or a power bank, and a sun hood (for 24-hour use a fixed IP camera is recommended).
- **Browser:** current Chrome or Edge (110 or newer) or Safari 16.4 or newer, a dedicated profile, no private window.
- **Page address:** a valid `https://` or `http://localhost` only; otherwise the camera will not open. The main address is https://anirut77.github.io/lensiq/ or the address the team gives you.
- **IP camera:** a browser cannot open RTSP directly. Run go2rtc on a mini PC in the local network. Wiring it in as a camera source in the page is a later item; today use a USB or phone camera, or keep the go2rtc
  page open beside it and type the plate yourself. Keep cameras on an isolated VLAN; never expose RTSP to the internet.
- **Network:** internet is needed when the page is first opened, to load the models; afterwards it works offline. Reloading the page without a network may fail. It does not need to be online all day.
- **Camera position:** plate at least 120 px wide in the frame (160 px for motorcycles); angle up to 30 degrees both horizontally and vertically; mounted 1–1.5 m high; 3–6 m before the barrier; aimed where vehicles stop; avoid direct
  sun or headlights shining into the lens.
- **Shutter and light:** motion blur is the main source of errors. Use a shutter of 1/500 s or faster (1/1000 s if vehicles do not stop), fixed focus on the stop line, WDR or BLC for backlight, and make vehicles
  stop or slow down (barrier, speed bump).
- **Night:** Thai plates are retro-reflective; use an 850 nm IR light near the lens; lower the power or exposure if the plate saturates; check the night result separately in the accuracy check.
- **Barrier and relay:** not sold and not part of the service. If you or an installer wire a relay, the guard must always press open after confirming; never wire it to open without a person, and never
  in the motor circuit. The team will send the installer the full wiring guide.
- **PDPA sign:** post the sign from `gate-notice.html` before the camera (the printable sign exists in Thai and English only); publish a privacy notice for your site; set the log retention; and have the operator using the system accept the notice before the
  camera starts.
- **Documents:** permission from the village or condo juristic person, or the car-park owner, and a data protection impact assessment (DPIA). The team will send you the forms.

### 2. First day, step by step

1. **Post the sign** before the camera and check that it is clearly visible from a vehicle entering the area.
2. **Install the device** at the camera position and test the image: plate at least 120 px wide, not blurred when the vehicle stops.
3. **Open** `village.html` or `parking.html` on the device and start the camera; the operator reads and accepts the notice before the camera starts.
4. **Settings:** operator name (kept in the correction history); the provinces most common at the site (listed first); and log retention. The default on a paid plan is to keep logs for 90 days, with plate crops off (if turned on, 7–30 days);
   receipts are kept 5 years. The 7-day log limit applies only during the free 30-day trial.
   - Village: import resident plates as `house,plate,province` (a limit per house), the deny list (a reason is required), and time-limited visitor passes (V-XXXXXX / QR / LINE share). Auto-open stays **off by default**.
   - Car park: fee rules (free minutes, time unit and rate, daily cap, overnight, lost ticket), shop stamps, PromptPay (use the customer's own number) and receipts.
5. **Guard training, 30 minutes:** confirm or correct every value; tap the box when the page says it does not look like a plate; typing is always possible; the "open (guard, no plate)" button is
   always available and always logged. PromptPay: open the bank app and check that the money has arrived before pressing "money received", because the page does not verify payment.
6. **One-hour trial** with at least 10 real vehicles: check that the plate box is right, doubtful characters are underlined, and the province is chosen correctly.
7. **Use the "accuracy check" from day one:** the guard presses tick or cross on every read (an edited read counts as a cross). The page splits day and night and shows a 95% interval.
8. **First week:** review the numbers daily; if night is low, fix the IR light and shutter first. For the free 30-day trial (1 lane, 100 plates a day, 7-day log) you count the days yourself, because the system has no timer yet.
9. **Pilot** (if ordered): at least 5 days per site and at least 200 real reads, of which at least 40 at night and at least 30 motorcycles, judged on the **lower bound of the 95% Wilson interval**. Targets: fully correct plates at least 95% by day and at least 85% at night.

### 3. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| No camera prompt, or the camera will not open | `http://` that is not localhost, or permission blocked | Use `https://`; allow the camera for the site; reload |
| The plate is not found; the guard taps the box often | Small plate in the frame, angle over 30 degrees, blur, backlight | Move closer, adjust angle and shutter, make vehicles stop. Finding plates in real photos is still weak (real photos from a public dataset: the box had to be tapped 78% of the time); this is normal; the guard taps the box or types |
| Look-alike Thai characters misread | The reader is general Thai text recognition, not trained on plates | Read the underlined characters; the guard corrects them. Entry-exit matching treats look-alike characters as half a difference |
| "Does not look like a plate" on a real plate | The plate check is strict for some plate styles | Tap the box or type it in; note how often in the notes column so the team can tune it |
| Three-line motorcycle plates, auction plates and special colours are hard to read | Known limits | Type it in |
| Cannot read at night | Too little light, or the plate saturates under IR | Raise or lower the IR light, set the shutter; check night separately in the accuracy check |
| Relay does not respond from the web page | The page does not call local-network devices directly, and the browser may block it (HTTPS cannot call HTTP) | The page says so and the guard opens at the control box; the event is still logged; the installer uses a bridge on the same machine (the team will send the full guide) |
| PromptPay QR amount does not match | PromptPay number set wrongly | Check the number in settings (use the customer's own); test with a small amount |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; export CSV backups regularly (they hold plates, so store them encrypted) |
| The same vehicle is counted many times | The vehicle stayed a long time | In the pilot set, count at most 3 times per vehicle; check the summary |

### 4. Who to contact

| Topic | Channel |
|---|---|
| Usage and set-up questions | LINE: @632yliiw · E-mail: [to be provided by the owner] · Phone: [to be provided by the owner] |
| System down at the guard post during opening hours, or a suspected data leak | The same channels, marked S1 (serious: the system cannot be used, or data may have leaked). Response times are as agreed in your quotation |
| Cameras, barriers, relays, network and power | Your installer or equipment seller (LENSIQ sells no hardware) |
| Data-subject requests from vehicle owners | The juristic person or car-park owner is the data controller |

When reporting, give the site, lane, page name, time, steps taken and browser version. **Never send images of vehicles, plates or people.**

## 中文

本指南适用于 https://anirut77.github.io/lensiq/ 上的 `village.html`（小区和公寓）与 `parking.html`（停车场）。系统会**给出车牌号建议**，**保安对每一辆车点击确认**。系统不代替人做决定。
LENSIQ 不销售摄像头、道闸或继电器。图像在您自己的设备上处理。

真实现场的准确率尚未测量（目前没有现场测量结果）。本指南中的数字仅来自公开数据集或合成数据，并逐一标明来源。

### 1. 安装前的准备

- **每条车道的设备：** 一部 Android 手机、iPhone 或带 1080p 摄像头的笔记本电脑，牢固的支架或固定件，电源线或移动电源，遮阳罩（24 小时使用建议采用固定安装的 IP 摄像头）。
- **浏览器：** 当前版本的 Chrome 或 Edge（110 及以上）或 Safari 16.4 及以上，使用专用配置文件，不使用隐私窗口。
- **页面地址：** 只能使用证书有效的 `https://` 或 `http://localhost`，否则摄像头无法打开。主要地址为 https://anirut77.github.io/lensiq/，或团队提供给您的地址。
- **IP 摄像头：** 浏览器无法直接打开 RTSP，需要在内部网络的迷你电脑上运行 go2rtc 作为中转。把它作为页面中的摄像头来源接入属于后续版本的工作；目前请使用 USB 摄像头或手机摄像头，
  或并排打开 go2rtc 页面后自己输入车牌号。请把摄像头放在隔离的 VLAN 中，切勿把 RTSP 暴露到互联网。
- **网络：** 第一次打开页面时需要联网以加载模型，之后可离线使用。无网络时重新加载页面可能失败。不需要全天在线。
- **摄像头位置：** 画面中车牌宽度至少 120 px（摩托车 160 px）；水平和垂直角度均不超过 30°；安装高度 1–1.5 米；距道闸前方 3–6 米；对准车辆停下的位置；避免阳光或车灯直射镜头。
- **快门与光线：** 运动模糊是错误的主要原因。快门设为 1/500 秒或更快（车辆不停时用 1/1000 秒），在停车线处固定对焦，逆光时开启 WDR 或 BLC，并让车辆停下或减速（道闸、减速带）。
- **夜间：** 泰国车牌是反光材质；请在镜头附近使用 850 nm 红外灯；如果车牌过曝，降低功率或曝光；在准确度检查中单独查看夜间结果。
- **道闸与继电器：** 不销售，也不属于服务范围。如果客户或安装人员自行接入继电器，必须由保安在确认后按下开启；绝不能接成无人确认就自动开启，也绝不能接入电机回路。团队会把完整的接线指南发给安装人员。
- **PDPA 告示：** 在摄像头之前张贴 `gate-notice.html` 的告示（可打印的告示只有泰语和英语版本）；发布您所在场所的隐私声明；设定日志保存期限；并让使用系统的操作员在摄像头启动前接受该声明。
- **文件：** 来自小区或公寓法人、或停车场业主的许可，以及个人数据影响评估（DPIA）。团队会把表格发给您。

### 2. 第一天逐步操作

1. **张贴告示：** 在摄像头之前张贴，并确认进入该区域的车辆能清楚看到。
2. **安装设备：** 按摄像头位置安装并测试画面：车牌宽度至少 120 px，车辆停下时不模糊。
3. **打开页面：** 在设备上打开 `village.html` 或 `parking.html` 并启动摄像头；操作员在摄像头启动前阅读并接受告知。
4. **设置：** 操作员姓名（记录在更正历史中）；该场所常见的省份（排在列表前面）；以及日志保存期限。付费方案的默认设置是保存日志 90 天，车牌裁剪图默认关闭（如开启则保存 7–30 天）；
   收据保存 5 年。日志仅保存 7 天的限制只适用于 30 天免费试用期间。
   - 小区：以 `门牌号,车牌,省份` 的格式导入住户车辆（每户有数量上限）、禁入名单（必须填写原因）、限时访客通行证（V-XXXXXX / QR / 通过 LINE 分享）。自动开闸**默认关闭**。
   - 停车场：收费规则（免费分钟数、计时单位和费率、每日上限、过夜、丢票）、商家印章、PromptPay（使用客户自己的号码）和收据。
5. **保安培训 30 分钟：** 确认或更正每一个值；当页面提示“不像车牌”时点击车牌框；任何时候都可以手动输入；“开闸（保安，无车牌）”按钮
   始终可用，并且每次都会记录。PromptPay：必须先打开银行应用确认款项已到账，再点击“已收款”，因为页面不会核实付款。
6. **试运行 1 小时：** 至少让 10 辆真实车辆通过，检查车牌框是否正确、存疑字符是否带下划线、省份是否选对。
7. **从第一天起使用“准确度检查”：** 保安对每次识别点击对勾或叉号（被修改过的识别记为叉号）。页面分开显示白天和夜间，并给出 95% 区间。
8. **第一周：** 每天查看数字；如果夜间偏低，先调整红外灯和快门。30 天免费试用（1 条车道，每天 100 个车牌，日志保存 7 天）请自行计算天数，因为系统目前没有计时器。
9. **试点**（如订购）：每个场所至少 5 天，至少 200 次真实识别，其中夜间至少 40 次、摩托车至少 30 次，以 **威尔逊（Wilson）95% 区间的下限**来判定。目标：整牌完全正确率白天至少 95%，夜间至少 85%。

### 3. 常见问题与解决办法

| 现象 | 可能原因 | 解决办法 |
|---|---|---|
| 不请求摄像头权限，或摄像头无法打开 | 使用了非 localhost 的 `http://`，或权限被禁止 | 使用 `https://`；允许本网站使用摄像头；重新加载 |
| 找不到车牌，保安需要经常自己点击车牌框 | 画面中车牌小、角度超过 30°、模糊、逆光 | 靠近一些，调整角度和快门，让车辆停下。在真实照片中查找车牌的能力仍然较弱（公开数据集的真实照片：78% 需要手动点击车牌框）；这是正常的；保安点击车牌框或手动输入 |
| 外形相近的泰文字符识别错误 | 识别器是通用的泰文识别，没有针对车牌训练 | 查看带下划线的字符；由保安更正。进出匹配时，外形相近的字符只算半个差异 |
| 真实车牌却提示“不像车牌” | 车牌检查对某些车牌样式过于严格 | 点击车牌框或手动输入；在备注栏记下出现的次数，供团队调整 |
| 三行的摩托车牌、拍卖车牌、特殊颜色车牌难以识别 | 已知限制 | 手动输入 |
| 夜间无法识别 | 光线不足，或车牌在红外灯下过曝 | 调高或调低红外灯，设置快门；在准确度检查中单独查看夜间结果 |
| 网页上的继电器没有反应 | 页面不会直接调用内部网络设备，浏览器也可能阻止（HTTPS 页面无法调用 HTTP） | 页面会提示，保安在控制箱处开闸；事件仍会被记录；安装人员使用同一台机器上的中转程序（团队会提供完整指南） |
| PromptPay 二维码扫描后金额不符 | PromptPay 号码设置错误 | 检查设置中的号码（使用客户自己的号码）；用小额测试 |
| 关闭浏览器后数据丢失 | 使用了隐私窗口或清除了网站数据 | 使用专用配置文件；定期导出 CSV 备份（含车牌号，请加密保存） |
| 同一辆车被重复计数多次 | 车辆停留时间长 | 试点数据集中每辆车最多计 3 次；请查看汇总结果 |

### 4. 联系方式

| 事项 | 渠道 |
|---|---|
| 使用与设置咨询 | LINE：@632yliiw · 电子邮件：[由业主提供] · 电话：[由业主提供] |
| 营业时间内岗亭系统无法使用，或怀疑数据泄露 | 同一渠道，并注明 S1（严重：系统无法使用或怀疑数据泄露）。响应时间以报价单中的支持方案为准 |
| 摄像头、道闸、继电器、网络和电力 | 客户的安装人员或设备供应商（LENSIQ 不销售硬件） |
| 车主的个人数据权利请求 | 小区法人或停车场业主是数据控制者 |

报告问题时，请说明：场所、车道、页面名称、时间、已执行的步骤和浏览器版本。**请勿发送车辆、车牌或人员的图像。**

# LENSIQ Attendance: คู่มือเริ่มต้นใช้งานสำหรับลูกค้า (ลงเวลาพนักงาน PIN / QR) / Customer onboarding guide (staff clock-in, PIN / QR) / 客户入门指南（员工考勤，PIN / QR）

ฉบับ 2026-11-14 / Version 2026-11-14 / 版本 2026-11-14

## ภาษาไทย

คู่มือนี้ใช้กับหน้า `attendance.html?mode=employee` บนเว็บไซต์ https://anirut77.github.io/lensiq/ วิธีลงเวลาหลักคือ **PIN หรือ QR** การสแกนใบหน้าเป็นทางเลือกเสริม
ใช้ได้เฉพาะเมื่อพนักงานแต่ละคนยินยอมอย่างชัดเจน พนักงานที่ไม่ยินยอมใช้ PIN หรือ QR ได้ตามปกติ โดยไม่มีผลต่อการจ้างงานหรือสิทธิ์ใด ๆ ระบบไม่อ่านอารมณ์ของพนักงาน
คู่มือนี้เริ่มจาก PIN / QR เสมอ

ระดับใช้งานฟรี: Attendance ถึง 5 คน (PIN / QR 1 เครื่อง) เกินนั้นต้องมีใบอนุญาต ปัจจุบันยังไม่มีตัวนับหรือตัวจับเวลาในระบบ ข้อจำกัดจะเริ่มตามวันที่ประกาศ โดยประกาศล่วงหน้าอย่างน้อย 30 วันและเริ่มใช้หลังประกาศ 30 วัน
ลูกค้าส่งออกข้อมูลของตนได้เสมอ

### 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ | โทรศัพท์ แท็บเล็ต หรือคอมพิวเตอร์ 1 เครื่องต่อจุดลงเวลา วางประจำที่ ต่อชาร์จตลอด ลูกค้าจัดหาเอง LENSIQ ไม่ขายอุปกรณ์ |
| เบราว์เซอร์ | Chrome หรือ Edge รุ่นปัจจุบัน (110 ขึ้นไป) หรือ Safari 16.4 ขึ้นไป ใช้โปรไฟล์เฉพาะ ไม่ใช้หน้าต่างส่วนตัว เปิดอัปเดตอัตโนมัติ |
| ที่อยู่หน้าเว็บ | ใช้ `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น ที่อยู่หลักคือ https://anirut77.github.io/lensiq/ หรือที่อยู่ที่ทีมงานแจ้งให้ใช้ |
| สแกน QR ด้วยกล้อง | ทำงานได้ในเบราว์เซอร์ที่มี `BarcodeDetector` (Chrome บน Android, macOS, ChromeOS) ที่อื่นให้ใช้เครื่องอ่านบาร์โค้ดแบบ USB หรือบลูทูธ (ทำงานเหมือนคีย์บอร์ด) หรือใช้ PIN |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรก หลังจากนั้นทำงานต่อได้ แต่การโหลดหน้าใหม่โดยไม่มีเครือข่ายอาจล้มเหลว (ระบบเก็บเฉพาะโมเดล ไม่เก็บหน้าเว็บ) ไม่ต้องมีเครือข่ายภายในที่ซับซ้อน |
| ที่เก็บข้อมูล | บันทึกอยู่ในเบราว์เซอร์ของเครื่องนั้น ประมาณ 20 คน × 2 ปีต่อเครื่อง หน้าแสดงมิเตอร์การใช้พื้นที่และเตือนเมื่อใช้เกิน 3.5 MB จาก 5 MB |
| ความปลอดภัย | ผู้ใช้เครื่องไม่ใช่ผู้ดูแลระบบ ล็อกหน้าจอ เข้ารหัสดิสก์ ปิดโหมดหลับ ตั้ง PIN ผู้จัดการ |
| เอกสาร | แจ้งพนักงานก่อนใช้งาน อ่านประกาศ PDPA ในหน้า ถ้าจะเปิดใบหน้าต้องมีป้ายและแบบยินยอม (`camera-notice.html`) ข้อความตามกฎหมายแรงงาน เช่น ระเบียบเรื่องเวลาทำงานและ OT ให้ทนายแรงงานของท่านตรวจ |
| ข้อมูลที่ต้องเตรียม | รายชื่อพนักงานและรหัส (ลูกค้าสร้างเอง) ตารางกะ วันหยุดบริษัท ตัวอย่างไฟล์ของระบบเงินเดือน (ที่ไม่มีข้อมูลบุคคล) |

### 2. วันแรกทีละขั้น

1. **เปิดหน้า** `attendance.html?mode=employee` บนเครื่องลงเวลา ตรวจว่าวันและเวลาของเครื่องถูกต้อง (ระบบอิงนาฬิกาเครื่อง และเตือนเมื่อถูกตั้งย้อนหลัง)
2. **แท็บ "ตั้งค่าและข้อมูล"**: ตั้งชื่ออุปกรณ์หรือจุดลงเวลา ตั้ง **PIN ผู้จัดการ** (ใช้ยืนยันการแก้ไขและการออกจากโหมดคิออสก์) ตั้งระยะเก็บบันทึกเวลา (ขั้นต่ำ 2 ปี ตามมาตรา 114
   ขอให้ตรวจกับทนายแรงงานของท่าน) แยกจากระยะเก็บข้อมูลใบหน้า
3. **แท็บ "กะการทำงาน"**: สร้างกะ เวลาเริ่ม-เลิก เวลาพัก เวลาผ่อนผันมาสายหรือออกก่อน และกติกา OT (เริ่มนับหลังกี่นาที ขั้นต่ำเท่าไร ปัดลง ต้องอนุมัติหรือไม่) ข้อควรระวัง: เมื่อเกินเวลาผ่อนผันแล้ว ระบบนับทุกนาทีตั้งแต่เริ่มกะ
   และ OT ถูกปัดลงตามที่ตั้ง บริษัทควรเขียนกติกานี้ไว้ในข้อบังคับการทำงานและให้ทนายของท่านตรวจ
4. **แท็บ "วันหยุดและการลา"**: ตรวจรายการวันหยุดนักขัตฤกษ์ หน้าจะเตือนถ้ามีไม่ถึง 13 วันหรือไม่มีวันที่ 1 พฤษภาคม วันหยุดตามจันทรคติมีเฉพาะปี 2026 ปีอื่นต้องเพิ่มเองตามประกาศ
5. **แท็บ "พนักงาน"**: เพิ่มพนักงานทีละคน (รหัส ชื่อ แผนก กะ PIN) พนักงานที่ไม่ประสงค์ใช้ใบหน้าให้ตั้งเป็น "ไม่ใช้ใบหน้า" ระบบจะไม่ลงทะเบียนใบหน้าให้ แล้วพิมพ์บัตร QR (เมื่อออกบัตรใหม่ บัตรเก่าจะใช้ไม่ได้)
6. **แจ้งพนักงาน** ให้อ่านประกาศ PDPA ในหน้า อธิบายว่าลงเวลาด้วย PIN หรือ QR ไม่ใช้ใบหน้า ใบหน้าเปิดเมื่อสมัครใจเท่านั้นและไม่มีผลเสียถ้าไม่ใช้
7. **ทดลองลงเวลา** ให้ทุกคนลองลงเวลาเข้าและออกที่แท็บ "PIN / QR" ใส่ PIN ผิด 5 ครั้งรหัสนั้นจะถูกล็อก (ผู้จัดการปลดล็อก) แล้วตรวจที่ "ลงเวลาวันนี้"
8. **เปิดโหมดคิออสก์** ถ้าวางเครื่องประจำที่ (ออกด้วย PIN ผู้จัดการ) และตั้งให้เครื่องไม่เข้าโหมดหลับ
9. **สัปดาห์แรก**: ผู้จัดการตรวจ "สรุปเดือนและเงินเดือน" ทุกวันศุกร์ แก้เวลาที่ลืมลงที่แท็บ "แก้ไขเวลาและประวัติ" (ใส่ชื่อและเหตุผลทุกครั้ง ข้อมูลดิบไม่ถูกแก้)
10. **ปลายเดือนแรก**: ส่งออก CSV เงินเดือน เทียบชั่วโมงและ OT กับบันทึกเดิมของร้านหนึ่งรอบ (เกณฑ์ของชุดนำร่อง: ตรงกัน) ถ้าคอลัมน์ไม่ตรงกับระบบเงินเดือน ส่งไฟล์ตัวอย่างที่ไม่มีข้อมูลบุคคลมาให้ช่วยจับคู่
    (บริการช่วยตั้งค่า 2,900 บาท ถ้าสั่ง)

หลายจุดลงเวลา: แต่ละเครื่องส่งออกไฟล์ JSON (ไม่มีภาพ ค่าใบหน้า PIN หรือรหัสบัตร) แล้วนำเข้าที่เครื่องหลัก ไม่มีการซิงก์สด การซิงก์หลายสาขาและการสำรองบนคลาวด์ยังไม่จำหน่าย

### 3. ถ้าจะเปิดใบหน้า (ทางเลือก ต้องผ่านเงื่อนไขก่อน)

- เปิดเฉพาะเมื่อ (1) พนักงานแต่ละคนยินยอมเป็นลายลักษณ์อักษร (2) มี PIN / QR ให้เลือกเสมอ (3) ลูกค้าเข้าใจตัวเลข: ใบหน้าเอเชียจำได้ต่อการสแกน 66–76%
  (n = 500 คน × 5 ภาพ ชุดข้อมูลสาธารณะ) ที่ทำงานจริงยังไม่ได้วัด (4) ทีมงานแจ้งสถานะใบอนุญาตของโมเดลใบหน้าแล้วว่าใช้ได้กับกรณีของท่าน
- ลงทะเบียนอย่างน้อย 5 คนก่อนพึ่งการเช็คอินอัตโนมัติ ใช้แท็บ "ตรวจความแม่นยำ" วัดกับพนักงานของลูกค้าเอง (เกณฑ์ของชุดนำร่อง: รับคนผิดไม่เกิน 1% ปฏิเสธคนถูกไม่เกิน 10%)
- ลบข้อมูลใบหน้าเมื่อพนักงานลาออกหรือถอนความยินยอม (การลบข้อมูลใบหน้าไม่ลบบันทึกเวลา)

### 4. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| ปุ่มสแกน QR ด้วยกล้องไม่ทำงาน | เบราว์เซอร์ไม่มี `BarcodeDetector` | ใช้ Chrome บน Android หรือ macOS หรือต่อเครื่องอ่านบาร์โค้ด USB หรือบลูทูธ หรือใช้ PIN |
| PIN ถูกล็อก | ใส่ผิด 5 ครั้ง (ล็อกรหัสนั้น) หรือ 15 ครั้งทั้งเครื่อง | ผู้จัดการปลดล็อก และรอตามที่หน้าแจ้ง |
| ออกจากโหมดคิออสก์ไม่ได้ | ตั้ง PIN ผู้จัดการไว้ | ใส่ PIN ผู้จัดการ ถ้าลืมให้ติดต่อฝ่ายสนับสนุน (ห้ามส่ง PIN ทางอีเมล) |
| เตือน "นาฬิกาเครื่องถูกตั้งย้อนหลัง" | ตั้งเวลาเครื่องผิด หรือมีการแก้เวลา | ตั้งเวลาเครื่องให้ถูก (เปิดเวลาอัตโนมัติ) ผู้จัดการตรวจรายการและแก้ด้วยรายการแก้ไข |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัว หรือเบราว์เซอร์ล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ ส่งออกไฟล์สำรองทุกสัปดาห์ (ไฟล์สำรองมีชื่อพนักงาน ให้เก็บแบบเข้ารหัส) |
| มิเตอร์พื้นที่เกิน 3.5 MB | ข้อมูลสะสมมาก | ส่งออก ล้างตามระยะเก็บ แยกเครื่องตามกลุ่มพนักงาน (ราว 20 คน × 2 ปีต่อเครื่อง) |
| นำเข้าไฟล์จากเครื่องอื่นไม่ได้ | ไม่ใช่ไฟล์ของ LENSIQ หรือมีคีย์ที่ไม่รู้จัก | ส่งออกใหม่จากเครื่องต้นทาง อย่าแก้ไฟล์ |
| ชั่วโมงไม่ตรงกับบันทึกเดิม | กติกาผ่อนผันหรือการปัด OT ต่างจากเดิม หรือเวลาพักไม่ได้ลงเวลา | ปรับกติกากะ ตรวจคอลัมน์ในสรุปเดือน ตรวจรายวันก่อน |
| กะกลางคืนข้ามเที่ยงคืน | การลงเวลานับตามวันที่เริ่มกะ | ตรวจว่าตั้งกะเป็นกะกลางคืน |
| ต้องการกะหมุนเวียน ลาออนไลน์ หรือซิงก์ | ยังไม่มีในระบบ | แจ้งความต้องการให้เรา ยังไม่จำหน่ายในขณะนี้ (รอระบบบัญชีองค์กร) |
| การสแกนใบหน้าซ้ำไม่ถูกบันทึก (เฉพาะเมื่อเปิดตัวเลือกใบหน้า) | การสแกนใบหน้าซ้ำภายใน 60 วินาทีถูกละเว้นตามที่ออกแบบ | รอให้เกิน 60 วินาที |

### 5. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| คำถามการใช้งาน | LINE: @632yliiw · อีเมล: [เจ้าของจะแจ้ง] · โทร: [เจ้าของจะแจ้ง] |
| ระบบใช้ไม่ได้ทั้งหมด หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 เวลาตอบรับเป็นไปตามแผนสนับสนุนในใบเสนอราคา |
| คำขอสิทธิ์ของพนักงาน | องค์กรของท่านเป็นผู้ควบคุมข้อมูล ใช้ปุ่ม "ส่งออกข้อมูลของพนักงานคนนี้" ในหน้า |

เมื่อแจ้งปัญหา บอก: จุดลงเวลา ชื่อหน้า เวลา ขั้นตอนที่ทำ และรุ่นเบราว์เซอร์ **ห้ามส่งภาพ ใบหน้า PIN หรือรายชื่อพนักงาน**

## English

This guide covers `attendance.html?mode=employee` on https://anirut77.github.io/lensiq/. The main way to clock in is **PIN or QR**. A face scan is an optional extra, used only when each employee gives explicit consent.
Employees who do not consent clock in with PIN or QR as normal, with no effect on their employment or rights. The system does not read employees' emotions. This guide always starts with PIN / QR.

Free tier: Attendance up to 5 people (PIN / QR, 1 device); beyond that a licence is needed. There is no counter or timer in the system yet. The limits start on a date that is announced at least 30 days ahead and take effect 30 days after the announcement.
Customers can always export their own data.

### 1. Before installing

- **Devices:** one phone, tablet or computer per clock-in point, fixed in place and always charging. The customer supplies them; LENSIQ sells no hardware.
- **Browser:** current Chrome or Edge (110 or newer) or Safari 16.4 or newer, a dedicated profile, no private window, auto-update on.
- **Page address:** a valid `https://` or `http://localhost` only. The main address is https://anirut77.github.io/lensiq/ or the address the team gives you.
- **QR scanning by camera:** works where the browser has `BarcodeDetector` (Chrome on Android, macOS, ChromeOS). Elsewhere use a USB or Bluetooth barcode reader (it acts like a keyboard) or the PIN.
- **Network:** needed when the page is first opened; afterwards it keeps working, but reloading the page without a network may fail (only the models are kept, not the page). No complex local network is needed.
- **Storage:** records live in that device's browser: about 20 people x 2 years per device. The page shows a storage meter and warns above 3.5 MB of 5 MB.
- **Security:** a non-admin user, screen lock, disk encryption, sleep off, a manager PIN.
- **Documents:** tell staff before use and have them read the PDPA notice in the page. If faces are used you also need the sign and consent form (`camera-notice.html`). Labour-law wording, such as working-time and overtime rules, should be checked by your own labour lawyer.
- **Information to gather:** staff list and codes (you create them), shift tables, company holidays, a sample file from your payroll system (with no personal data).

### 2. First day, step by step

1. **Open** `attendance.html?mode=employee` on the clock device. Check the device date and time (the system follows the device clock and warns if it is set back).
2. **Tab "Settings and data":** name the device or clock point; set the **manager PIN** (it confirms corrections and exiting kiosk mode); set the time-record retention (minimum 2 years under section 114;
   please check with your labour lawyer), separate from face-data retention.
3. **Tab "Shifts":** create shifts with start and end, break, grace minutes for late or early, and OT rules (start after N minutes, minimum, round down, approval needed or not). Note: beyond the grace period every minute from the
   shift start counts, and OT rounds down as set. The company should write this rule into its work regulations and have its lawyer check it.
4. **Tab "Holidays and leave":** check the public-holiday list. The page warns if there are fewer than 13 days or no 1 May. Lunar holidays are filled in for 2026 only; add other years from the official announcement.
5. **Tab "Employees":** add staff one at a time (code, name, department, shift, PIN). For anyone who prefers no face, mark "no face"; the system will not enrol a face for them. Then print the QR badges
   (re-issuing a badge revokes the old one).
6. **Tell staff:** read the PDPA notice in the page; explain that clock-in is by PIN or QR without a face; a face is switched on only voluntarily and carries no penalty if declined.
7. **Test:** everyone clocks in and out on the "PIN / QR" tab. Five wrong PINs lock that code (the manager unlocks it). Check "today's punches".
8. **Switch on kiosk mode** if the device is fixed in place (exit with the manager PIN) and keep the device awake.
9. **First week:** the manager reviews "Month and payroll" every Friday and fixes missed punches in "Corrections and history" (name and reason every time; raw data is never edited).
10. **End of the first month:** export the payroll CSV and compare hours and OT with the shop's existing record for one cycle (pilot criterion: they match). If the columns do not match your payroll
    system, send a sample file with no personal data so we can help map it (the 2,900 THB set-up help, if ordered).

Several clock-in points: each device exports a JSON file (no images, face values, PINs or badge codes) and the main device imports it. There is no live sync. Multi-branch sync and cloud backup are not sold.

### 3. If faces are switched on (optional, with conditions)

- Only when (1) each employee consents in writing; (2) PIN / QR is always available; (3) the customer understands the figures: Asian faces recognised per scan
  66–76% (n = 500 people x 5 photos, public dataset), real workplace not measured; (4) the team has confirmed that the licence status of the face model fits your use.
- Enrol at least 5 people before relying on automatic check-in. Use the "accuracy check" tab on your own staff (pilot criteria: false accept at most 1%, false reject at most 10%).
- Delete face data when someone leaves or withdraws consent (deleting face data never deletes time records).

### 4. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Camera QR scan does not work | The browser has no `BarcodeDetector` | Use Chrome on Android or macOS, a USB or Bluetooth reader, or the PIN |
| PIN locked | 5 wrong tries (that code is locked) or 15 (the whole device) | The manager unlocks it; wait as the page says |
| Cannot leave kiosk mode | A manager PIN is set | Enter it; if forgotten, contact support (never send a PIN by e-mail) |
| "Device clock set back" warning | Wrong time or a changed clock | Set the device time correctly (automatic time); the manager reviews and corrects with a correction entry |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; export a backup weekly (it holds names, so store it encrypted) |
| Storage meter above 3.5 MB | Data has built up | Export, clear by retention, split staff across devices (about 20 people x 2 years each) |
| Cannot import a file from another device | Not a LENSIQ file, or an unknown key | Export again from the source; do not edit the file |
| Hours differ from the old record | Different grace or OT rounding; breaks not punched | Adjust the shift rules; check the month columns; check day by day first |
| Night shift across midnight | Punches belong to the date the shift starts | Check that the shift is set as a night shift |
| Need rotating rosters, online leave or sync | Not built yet | Tell us what you need; not sold at present (waits for organisation accounts) |
| A repeated face scan is not recorded (only when the face option is on) | Repeat face scans within 60 seconds are ignored by design | Wait more than 60 seconds |

### 5. Who to contact

| Topic | Channel |
|---|---|
| Usage questions | LINE: @632yliiw · E-mail: [เจ้าของจะแจ้ง] · Phone: [เจ้าของจะแจ้ง] |
| System completely down, or a suspected data leak | The same channels, marked S1. Response times are as agreed in your quotation |
| Staff data requests | Your organisation is the data controller; use "export this employee's records" in the page |

When reporting, give the clock point, page name, time, steps taken and browser version. **Never send images, faces, PINs or staff lists.**

## 中文

本指南适用于 https://anirut77.github.io/lensiq/ 上的 `attendance.html?mode=employee`。主要打卡方式是 **PIN 或二维码（QR）**。人脸扫描只是可选的附加方式，
只有在每位员工明确同意后才可使用。不同意的员工照常使用 PIN 或 QR 打卡，不会影响其雇佣关系或任何权利。系统不读取员工的情绪。本指南始终从 PIN / QR 开始。

免费层：Attendance 最多 5 人（PIN / QR，1 台设备），超出需要许可。目前系统内没有计数器或计时器。限制将从公布的日期开始，至少提前 30 天公布，并在公布 30 天后生效。
客户随时可以导出自己的数据。

### 1. 安装前的准备

- **设备：** 每个打卡点一台手机、平板或电脑，固定放置并持续充电。由客户自行准备；LENSIQ 不销售硬件。
- **浏览器：** 当前版本的 Chrome 或 Edge（110 及以上）或 Safari 16.4 及以上，使用专用配置文件，不使用隐私窗口，开启自动更新。
- **页面地址：** 只能使用证书有效的 `https://` 或 `http://localhost`。主要地址为 https://anirut77.github.io/lensiq/，或团队提供给您的地址。
- **用摄像头扫描 QR：** 在支持 `BarcodeDetector` 的浏览器中可用（Android、macOS、ChromeOS 上的 Chrome）。其他环境请使用 USB 或蓝牙条码阅读器（相当于键盘输入），或使用 PIN。
- **网络：** 第一次打开页面时需要联网；之后可继续运行，但无网络时重新加载页面可能失败（系统只缓存模型，不缓存页面）。不需要复杂的内部网络。
- **存储：** 记录保存在该设备的浏览器中：每台设备约可保存 20 人 × 2 年。页面显示存储用量表，超过 5 MB 中的 3.5 MB 时会发出警告。
- **安全：** 使用非管理员账户，设置屏幕锁，磁盘加密，关闭睡眠，设置经理 PIN。
- **文件：** 使用前先告知员工，并请他们阅读页面中的 PDPA 告知。如果启用人脸，还需要张贴告示并取得同意书（`camera-notice.html`）。涉及劳动法的表述，例如工时和加班规则，请由您自己的劳动法律师审核。
- **需要准备的资料：** 员工名单和工号（由客户自行建立）、排班表、公司假日、工资系统的样例文件（不含个人数据）。

### 2. 第一天逐步操作

1. **打开** 打卡设备上的 `attendance.html?mode=employee`。检查设备的日期和时间是否正确（系统以设备时钟为准，时间被往回调时会发出警告）。
2. **“设置与数据”标签页：** 为设备或打卡点命名；设置**经理 PIN**（用于确认更正和退出自助终端模式）；设置考勤记录保存期限（依第 114 条至少 2 年，
   请与您的劳动法律师核实），与人脸数据的保存期限分开设置。
3. **“班次”标签页：** 建立班次，设定上下班时间、休息时间、迟到或早退的宽限分钟数，以及加班规则（超过多少分钟开始计算、最低时数、向下取整、是否需要批准）。注意：超出宽限时间后，系统从班次开始起按每一分钟计算，
   加班按设定向下取整。公司应将该规则写入工作规章，并请律师审核。
4. **“假日与请假”标签页：** 检查法定假日列表。若少于 13 天或没有 5 月 1 日，页面会发出提醒。农历假日只收录了 2026 年，其他年份需按官方公告自行添加。
5. **“员工”标签页：** 逐个添加员工（工号、姓名、部门、班次、PIN）。不愿使用人脸的员工请标记为“不使用人脸”，系统不会为其登记人脸。然后打印 QR 工牌
   （重新发放工牌后，旧工牌失效）。
6. **告知员工：** 阅读页面中的 PDPA 告知；说明打卡使用 PIN 或 QR，不涉及人脸；人脸只在自愿的前提下开启，不使用也没有任何不利后果。
7. **测试：** 请每个人在“PIN / QR”标签页试打上班和下班卡。PIN 连续输错 5 次，该代码会被锁定（由经理解锁）。在“今日打卡”中核对。
8. **开启自助终端模式**（如果设备固定放置；用经理 PIN 退出），并设置设备不进入睡眠。
9. **第一周：** 经理每周五查看“月度与工资”，并在“更正与历史”中修正漏打的卡（每次都要填写姓名和原因；原始数据不会被修改）。
10. **第一个月末：** 导出工资 CSV，把工时和加班与商店原有记录对比一个周期（试点标准：一致）。如果列与您的工资系统不匹配，请发送不含个人数据的样例文件，我们协助对应
    （如订购，设置协助服务费用为 2,900 泰铢）。

多个打卡点：每台设备导出一个 JSON 文件（不含图像、人脸数值、PIN 或工牌代码），再导入主设备。没有实时同步。多分店同步和云备份目前不销售。

### 3. 如果要启用人脸（可选，需先满足条件）

- 仅在以下条件下启用：(1) 每位员工书面同意；(2) 始终提供 PIN / QR 选项；(3) 客户了解相关数据：亚洲人脸每次扫描识别率 66–76%
  （n = 500 人 × 5 张照片，公开数据集），真实工作场所尚未测量；(4) 团队已确认人脸模型的许可状态适用于您的使用情形。
- 在依赖自动打卡之前，至少登记 5 人。使用“准确度检查”标签页，用您自己的员工进行测量（试点标准：误接受不超过 1%，误拒绝不超过 10%）。
- 员工离职或撤回同意时，删除其人脸数据（删除人脸数据不会删除考勤记录）。

### 4. 常见问题与解决办法

| 现象 | 可能原因 | 解决办法 |
|---|---|---|
| 摄像头扫描 QR 不工作 | 浏览器不支持 `BarcodeDetector` | 使用 Android 或 macOS 上的 Chrome，或连接 USB 或蓝牙条码阅读器，或使用 PIN |
| PIN 被锁定 | 输错 5 次（该代码被锁定）或整台设备累计输错 15 次 | 由经理解锁，并按页面提示等待 |
| 无法退出自助终端模式 | 已设置经理 PIN | 输入经理 PIN；如果忘记，请联系技术支持（切勿通过电子邮件发送 PIN） |
| 出现“设备时钟被往回调”警告 | 设备时间错误或时钟被改动 | 把设备时间设置正确（开启自动时间）；经理检查记录并用更正条目修正 |
| 关闭浏览器后数据丢失 | 使用了隐私窗口，或浏览器清除了网站数据 | 使用专用配置文件；每周导出备份（备份含有姓名，请加密保存） |
| 存储用量超过 3.5 MB | 数据累积较多 | 导出，按保存期限清理，把员工分到不同设备（每台设备约 20 人 × 2 年） |
| 无法导入其他设备的文件 | 不是 LENSIQ 文件，或含有未知字段 | 从源设备重新导出；不要修改文件 |
| 工时与旧记录不一致 | 宽限或加班取整规则不同；休息时间未打卡 | 调整班次规则；检查月度汇总的各列；先逐日核对 |
| 跨午夜的夜班 | 打卡记录归属班次开始的那一天 | 检查该班次是否设为夜班 |
| 需要轮班排表、在线请假或同步 | 尚未开发 | 请告诉我们您的需求；目前不销售（等待组织账户功能） |
| 重复的人脸扫描没有被记录（仅在启用人脸选项时） | 60 秒内的重复人脸扫描按设计被忽略 | 等待超过 60 秒 |

### 5. 联系方式

| 事项 | 渠道 |
|---|---|
| 使用咨询 | LINE：@632yliiw · 电子邮件：[เจ้าของจะแจ้ง] · 电话：[เจ้าของจะแจ้ง] |
| 系统完全无法使用，或怀疑数据泄露 | 同一渠道，并注明 S1。响应时间以报价单中的支持方案为准 |
| 员工的数据权利请求 | 贵组织是数据控制者；请使用页面中的“导出该员工的数据” |

报告问题时，请说明：打卡点、页面名称、时间、已执行的步骤和浏览器版本。**请勿发送图像、人脸、PIN 或员工名单。**

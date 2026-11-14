# LENSIQ Crowd: คู่มือเริ่มต้นใช้งานสำหรับลูกค้า (ประมาณความหนาแน่นของคนในงาน รุ่นทดลอง) / Customer onboarding guide (crowd density estimate, experimental) / 客户入门指南（人群密度估计，试验版）

ฉบับ 2026-11-14 / Version 2026-11-14 / 版本 2026-11-14

## ภาษาไทย

คู่มือนี้ใช้กับหน้า `crowd.html` บนเว็บไซต์ https://anirut77.github.io/lensiq/ Crowd เป็น **รุ่นทดลอง** ใช้ประมาณความหนาแน่นของคนในงานอีเวนต์

**ขอบเขต:** ใช้ได้กับฝูงชนเบาบางถึงปานกลางเท่านั้น (ประมาณต่ำกว่า 50 คนในภาพเดียว) **ยังไม่เหมาะกับฝูงชนหนาแน่น** ห้ามใช้ตัดสินความปลอดภัยของฝูงชนหรือจำกัดจำนวนคนเข้างาน
ระบบให้ "ค่าประมาณความหนาแน่น" ไม่ใช่จำนวนที่แน่นอน ระบบนับแบบไม่ระบุตัวตน ไม่ระบุอายุ เพศ หรืออารมณ์ ภาพประมวลผลบนเครื่องของท่าน

ตัวเลขที่ระบุในคู่มือนี้เป็นผลเบื้องต้นเทียบกับค่าอ้างอิงที่ใช้ AI นับ ไม่ใช่การวัดภาคสนามกับงานจริง

ระดับใช้งานฟรี: Crowd 2 ชั่วโมงต่อเครื่องต่อวัน เกินนั้นต้องมีใบอนุญาต ปัจจุบันยังไม่มีตัวนับหรือตัวจับเวลาในระบบ ข้อจำกัดจะเริ่มตามวันที่ประกาศ โดยประกาศล่วงหน้าอย่างน้อย 30 วันและเริ่มใช้หลังประกาศ 30 วัน
ลูกค้าส่งออกข้อมูลของตนได้เสมอ

### 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ | มือถือหรือโน้ตบุ๊กที่มีกล้อง 1 เครื่องต่อมุมกล้อง ลูกค้าจัดหาเอง ควรเป็นเครื่องระดับกลางขึ้นไป ยังไม่ได้วัดความเร็วบนมือถือจริง (ตัวเลขที่มีเป็นการจำลองบนคอมพิวเตอร์: 355 ms ต่อภาพ ราว 2.8 ครั้งต่อวินาที) |
| ขาตั้งและไฟ | ขาตั้งสูงอย่างน้อย 2.5–3 ม. มองลงประมาณ 30–45° กล้องอยู่นิ่ง ต่อไฟตลอดงาน ตั้งเครื่องไม่ให้หลับและเปิดจอตลอด ระวังเครื่องร้อนแล้วช้าลง |
| เบราว์เซอร์ | Chrome หรือ Edge รุ่นปัจจุบัน (110 ขึ้นไป) หรือ Safari 16.4 ขึ้นไป ใช้โปรไฟล์เฉพาะ ไม่ใช้หน้าต่างส่วนตัว |
| ที่อยู่หน้าเว็บ | ใช้ `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น ที่อยู่หลักคือ https://anirut77.github.io/lensiq/ หรือที่อยู่ที่ทีมงานแจ้งให้ใช้ |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรกเพื่อโหลดโมเดล หลังจากนั้นไม่ต้องใช้อินเทอร์เน็ตระหว่างนับ การโหลดหน้าใหม่ตอนเครือข่ายหลุดอาจล้มเหลว ให้เปิดหน้าและเริ่มนับก่อนเปิดงาน |
| มุมกล้อง | คนในโซนสูงอย่างน้อย **10% ของความสูงภาพ** (ต่ำกว่านี้ระบบเตือน "คนดูเล็ก" และนับต่ำกว่าจริง 37–59%) ไม่ย้อนแสง ไม่มีของใหญ่บังตรงหน้ากล้อง (คนตัวใหญ่ใกล้กล้องบังคนอื่น) |
| จำนวนคนที่คาดว่าจะมี | ประเมินจำนวนคนสูงสุดต่อภาพช่วงพีค ถ้า **ประมาณ 50 คนขึ้นไป** ในภาพเดียว ยังจำหน่ายและใช้ไม่ได้ ให้แจ้งผู้ขายก่อนวันงาน |
| ป้ายแจ้ง | ป้าย A (`camera-notice.html` ไทย อังกฤษ จีน) ที่ทางเข้าพื้นที่ พิมพ์และติดก่อนเริ่มงาน |
| เอกสาร | หนังสืออนุญาตจากผู้จัดงานหรือเจ้าของพื้นที่ (จุดตั้งกล้อง วัน เวลา และไม่บันทึกวิดีโอ) และ DPIA เพิ่มเติม ทีมงานจะส่งแบบฟอร์มให้ |

### 2. วันงานทีละขั้น

1. **ก่อนงานอย่างน้อย 1 วัน** ลองติดตั้งที่สถานที่จริง ดูภาพว่าคนในโซนสูงอย่างน้อย 10% ของภาพ ปรับตำแหน่ง และติดป้าย A
2. **เช้าวันงาน** ต่อไฟ เปิด `crowd.html` กด "เปิดกล้อง" อนุญาตกล้อง และรอจนสถานะแสดงว่าโหลดโมเดลแล้ว
3. **วาดโซน** ("วาดโซน") ให้ครอบเฉพาะพื้นที่ที่ต้องการ (ถ้าคนที่อยู่ไกลดูเล็ก ให้วาดเฉพาะส่วนใกล้) ระบบนับคนในโซนจากตำแหน่งเท้า แล้ว **วาดเส้นนับเข้า/ออก** และตั้งด้านที่เป็น "เข้า"
   กล้องต้องไม่ขยับระหว่างวัน มิฉะนั้นเส้นนับและเวลาอยู่ในโซนใช้ไม่ได้ (กล้องที่แพนได้จะให้เฉพาะจำนวนคนต่อภาพ)
4. **ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค"** ตามที่ผู้จัดงานประเมิน สำคัญ: ในฝูงชนหนาแน่น ตัวนับจะ "ล้ม" เหลือ 0–2 คนโดยไม่มีสัญญาณเตือนในตัวเอง ค่านี้ทำให้ระบบเตือนเมื่อเห็นน้อยกว่าครึ่งของที่คาดไว้
5. **ทดลอง 1 ชั่วโมง** ก่อนเปิดงาน: เดินผ่านเส้นเข้า/ออกเพื่อทดสอบ ดูว่าเห็นกรอบคนและตัวเลขสมเหตุสมผล และดูข้อความ "คนดูเล็ก"
6. **ระหว่างงาน**: วางเครื่องไว้ ไม่ปิดจอ ผู้ควบคุมดูตัวเลข "คนในภาพตอนนี้" (ค่ามัธยฐานของ 5 ภาพ) และ "คนในโซน" เครื่องหมาย ≈ หมายถึงค่าประมาณ (ขึ้นเมื่อมีคนตั้งแต่ 15 คน หรือโซนแน่นตั้งแต่ 2 คนต่อตารางเมตร)
7. **ถ้าสั่งนำร่อง**: ทุก 5 นาที ผู้ควบคุมจดค่าที่เห็นบนหน้าจอ ผู้นับ 2 คนนับแยกกัน (ไม่ดูของกัน) และนับคนเข้า/ออกด้วยเครื่องกดนับมือเป็นช่วงละ 15 นาที
8. **เย็นวันงาน**: กด "ส่งออก CSV รายงานการตลาด" (หัวไฟล์ระบุว่าเป็นค่าประมาณ) และส่งออกสรุป JSON เก็บแบบเข้ารหัส ไม่มีภาพอยู่ในไฟล์
9. **หลังงาน**: ปิดกล้อง ล้างข้อมูลสถิติตามระยะเก็บที่ตกลง ถอดป้ายตามที่ผู้จัดงานกำหนด ระบบไม่บันทึกวิดีโอเป็นค่าเริ่มต้น

### 3. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| ขึ้น "คนดูเล็ก" | คนสูงไม่ถึง 10% ของภาพ | ย้ายกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้ กรณีนี้ผลนับต่ำกว่าจริง 37–59% (คนเล็กหรืออยู่ไกล n = 29 ภาพ ผลเบื้องต้น เทียบกับ AI) |
| ตัวเลขน้อยมากทั้งที่มีคนเยอะ | ฝูงชนหนาแน่น ตัวตรวจจับล้ม (ที่ชิบูย่า ราว 300 คนถูกนับเหลือ 0–2) | หยุดใช้ค่านั้น ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค" ให้ระบบเตือน แบ่งมุมกล้องให้มีคนต่อภาพน้อยลง ถ้าเกินประมาณ 50 คนต่อภาพ ถือว่านอกขอบเขตบริการ |
| ตัวเลขต่ำกว่าที่นับด้วยตา 26–59% | ข้อจำกัดที่ทราบ: คน 15–22 คนเต็มภาพ นับต่ำกว่าจริง 26% (n = 12 ภาพ) คน 30–50 คน นับต่ำกว่าจริง 58% (n = 20 ภาพ) คนเล็กหรืออยู่ไกล นับต่ำกว่าจริง 37–59% (n = 29 ภาพ) ผลเบื้องต้นเทียบกับ AI | ใช้เป็นค่าประมาณและแนวโน้ม ไม่ใช้เป็นจำนวนจริง และบอกผู้จัดงานตั้งแต่ต้น ยังไม่เหมาะกับฝูงชนหนาแน่น |
| ตัวนับข้ามเส้นไม่ตรง | กล้องขยับ หรือเส้นพาดผ่านจุดที่คนยืนหยุด | ตรึงกล้อง ย้ายเส้นไปจุดที่คนเดินผ่านต่อเนื่อง และทดลองเดินนับก่อน |
| ตัวเลขในโซนกระพริบที่ขอบ | คนยืนอยู่ที่ขอบโซน | ขยับขอบโซนให้ไม่ตัดผ่านจุดที่คนยืน |
| ภาพค้าง ช้า ตัวเลขกระตุก | เครื่องร้อนจนลดความเร็ว หรือเป็นรุ่นต่ำ ต่ำกว่า 2 ครั้งต่อวินาที | พักเครื่อง ระบายความร้อน ต่อไฟ ใช้เครื่องรุ่นสูงขึ้น (ขั้นต่ำที่เสนอในชุดนำร่อง: 2 ครั้งต่อวินาที) |
| เบราว์เซอร์ไม่ขออนุญาตกล้อง | ใช้ `http://` ที่ไม่ใช่ localhost หรือสิทธิ์ถูกปิด | ใช้ `https://` เปิดสิทธิ์กล้อง แล้วโหลดหน้าใหม่ |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัว หรือล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ ส่งออก CSV ก่อนปิดทุกครั้ง |
| ผู้จัดงานขอให้ระบุอายุ เพศ หรืออารมณ์ | ไม่มีในระบบ และปิดในเวอร์ชันลูกค้า | ไม่ทำ ระบบนับแบบไม่ระบุตัวตนเท่านั้น |
| ผู้จัดงานขอใช้ตัดสินความปลอดภัยของฝูงชน (จำกัดคนเข้า) | อยู่นอกขอบเขต | ปฏิเสธ และแนะนำให้ใช้วิธีของผู้จัดงานเอง |

### 4. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| คำถามการใช้งาน การตั้งค่าโซน | LINE: @632yliiw · อีเมล: [เจ้าของจะแจ้ง] · โทร: [เจ้าของจะแจ้ง] ควรติดต่อล่วงหน้าตามแผนสนับสนุนในใบเสนอราคา |
| ระบบใช้ไม่ได้ระหว่างงาน หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 เวลาตอบรับเป็นไปตามแผนสนับสนุนในใบเสนอราคา การดูแลช่วงสุดสัปดาห์หรือกลางคืนระหว่างงานต้องตกลงล่วงหน้า |
| กล้อง ขาตั้ง ไฟ เครือข่าย | ลูกค้าหรือผู้รับเหมาอุปกรณ์ของลูกค้า (LENSIQ ไม่ขายอุปกรณ์) |
| ป้ายแจ้งและคำขอสิทธิ์ข้อมูล | ผู้จัดงานหรือเจ้าของพื้นที่เป็นผู้ควบคุมข้อมูล |

เมื่อแจ้งปัญหา บอก: งานหรือไซต์ มุมกล้อง ชื่อหน้า เวลา ขั้นตอนที่ทำ และรุ่นเบราว์เซอร์ **ห้ามส่งภาพหรือวิดีโอของผู้เข้าร่วมงาน**

## English

This guide covers `crowd.html` on https://anirut77.github.io/lensiq/. Crowd is an **experimental** product for estimating crowd density at events.

**Scope:** sparse to medium crowds only (roughly under 50 people in one view). It is **not yet suitable for dense crowds**. Never use it for crowd-safety decisions or to limit entry to an event.
It gives a density estimate, not an exact count. It counts anonymously and does not identify age, gender or emotion. Images are processed on your own device.

The figures in this guide are preliminary results against a reference counted by AI; they are not field measurements at a real event.

Free tier: Crowd 2 hours per device per day; beyond that a licence is needed. There is no counter or timer in the system yet. The limits start on a date that is announced at least 30 days ahead and take effect 30 days after the announcement.
Customers can always export their own data.

### 1. Before installing

- **Device:** a phone or laptop with a camera, one per camera view, supplied by the customer; mid-range or better. Speed on a real phone has not been measured (the only figure is emulated on a computer:
  355 ms per frame, about 2.8 per second).
- **Stand and power:** a stand at least 2.5–3 m high looking down about 30–45 degrees; a fixed camera; mains power for the whole event; set the device never to sleep and the screen always on; watch for heat slowing the device.
- **Browser:** current Chrome or Edge (110 or newer) or Safari 16.4 or newer, a dedicated profile, no private window.
- **Page address:** a valid `https://` or `http://localhost` only. The main address is https://anirut77.github.io/lensiq/ or the address the team gives you.
- **Network:** internet is needed when the page is first opened, to load the models; none is needed while counting. Reloading when the network is down may fail, so open the page and start counting before the event opens.
- **Camera view:** people in the zone at least **10% of the frame height** (below that the page warns "people look small" and undercounts by 37–59%); no backlight; no large object in front of the lens (a large person close to the camera hides others).
- **Expected crowd:** estimate the peak number of people in one view. If it is **about 50 or more** in one view, it cannot be sold or used yet; tell the seller before the day.
- **Sign:** sign A (`camera-notice.html`, Thai, English and Chinese) at the entrance to the area, printed and posted before the event starts.
- **Documents:** permission from the organiser or site owner (camera spots, dates, times, no video recording) and an extra DPIA. The team will send you the forms.

### 2. Event day, step by step

1. **At least one day before,** try the set-up at the real place: check that people in the zone are at least 10% of the frame height; adjust the position; post sign A.
2. **On the morning,** connect power, open `crowd.html`, press "Start camera", allow the camera, and wait until the status shows that the models are loaded.
3. **Draw the zone** over only the area you need (if far people look small, draw only the near part); people are placed in the zone by their feet. Then **draw the entry / exit line** and set which side is "in".
   The camera must not move during the day, or the line and dwell time are unusable (a panning camera gives per-frame counts only).
4. **Set "expected crowd at peak"** to the organiser's estimate. Important: in a dense crowd the count collapses to 0–2 with no warning of its own; this setting makes the page warn when it sees fewer than half of what is expected.
5. **One-hour trial** before the doors open: walk across the line to test it; check that the boxes and numbers are sensible; watch for the "people look small" message.
6. **During the event:** leave the device running with the screen on. The operator watches "people in view now" (median of 5 frames) and "people in zone". A ≈ mark means an estimate (shown from 15 people, or when the zone is at 2
   people per square metre or more).
7. **If a pilot is ordered:** every 5 minutes the operator notes the on-screen values while two counters count separately (not looking at each other), and entries and exits are counted with hand tally counters in
   15-minute blocks.
8. **Evening:** press "Export marketing-report CSV" (its header says it is an estimate); export the summary JSON and store it encrypted. No image is in the files.
9. **After the event:** stop the camera; clear the statistics according to the agreed retention; take down the signs as the organiser requires. The system does not record video by default.

### 3. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "People look small" | People are under 10% of the frame height | Move the camera closer, or draw the zone on the near part only. The undercount in this case is 37–59% (small or far people, n = 29 frames, preliminary, against an AI reference) |
| Very low count with many people | Dense crowd; the detector collapses (at Shibuya about 300 people were counted as 0–2) | Stop using that number; set the expected crowd so the page warns; split camera views so fewer people are in each; above about 50 per view is outside the service |
| Count lower than a count by eye by 26–59% | Known limit: 15–22 people filling the frame were undercounted by 26% (n = 12 frames); 30–50 people by 58% (n = 20 frames); small or far people by 37–59% (n = 29 frames); preliminary, against an AI reference | Use it as an estimate and a trend, not a true count; tell the organiser from the start. It is not yet suitable for dense crowds |
| Line crossings look wrong | The camera moved, or the line is across where people stand | Fix the camera; move the line to where people walk through continuously; test by walking across |
| Zone count flickers at the edge | People standing on the edge | Move the edge so it does not cut through where people stand |
| Frozen picture, slow, jerky numbers | Device hot and slowed, or a low-end model; below 2 frames a second | Rest and cool the device, use mains power, use a stronger device (the pilot kit proposes a minimum of 2 a second) |
| No camera prompt | `http://` that is not localhost, or permission blocked | Use `https://`; allow the camera; reload |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; export the CSV before closing |
| The organiser asks for age, gender or emotion | Not in the product, and off in customer builds | Decline; the system counts anonymously only |
| The organiser wants to use it for crowd-safety decisions (limiting entry) | Outside scope | Decline; advise the organiser to use their own methods |

### 4. Who to contact

| Topic | Channel |
|---|---|
| Usage questions and zone set-up | LINE: @632yliiw · E-mail: [เจ้าของจะแจ้ง] · Phone: [เจ้าของจะแจ้ง]. Contact us ahead of the event as set out in the support plan in your quotation |
| System down during the event, or a suspected data leak | The same channels, marked S1. Response times are as agreed in your quotation. Weekend and night cover during an event must be agreed in advance |
| Cameras, stands, power and network | The customer or its equipment contractor (LENSIQ sells no hardware) |
| Signage and data-subject requests | The organiser or site owner is the data controller |

When reporting, give the event or site, camera view, page name, time, steps taken and browser version. **Never send images or video of attendees.**

## 中文

本指南适用于 https://anirut77.github.io/lensiq/ 上的 `crowd.html`。Crowd 是**试验版**产品，用于估计活动现场的人群密度。

**适用范围：** 仅适用于稀疏到中等密度的人群（单个画面中大约少于 50 人）。**尚不适用于密集人群**。切勿用它来做人群安全判断或限制入场人数。
系统给出的是“密度估计值”，不是精确人数。系统以匿名方式计数，不识别年龄、性别或情绪。图像在您自己的设备上处理。

本指南中的数字是对照 AI 计数参考值得出的初步结果，不是在真实活动现场的实地测量。

免费层：Crowd 每台设备每天 2 小时，超出需要许可。目前系统内没有计数器或计时器。限制将从公布的日期开始，至少提前 30 天公布，并在公布 30 天后生效。
客户随时可以导出自己的数据。

### 1. 安装前的准备

- **设备：** 每个摄像画面一部带摄像头的手机或笔记本电脑，由客户自行准备；建议中端或更高配置。尚未在真实手机上测量速度（目前仅有在电脑上模拟的数据：
  每帧 355 毫秒，约每秒 2.8 次）。
- **支架与电源：** 支架高度至少 2.5–3 米，向下俯视约 30–45°；摄像头固定不动；整场活动接通电源；设置设备不休眠、屏幕常亮；注意设备过热会变慢。
- **浏览器：** 当前版本的 Chrome 或 Edge（110 及以上）或 Safari 16.4 及以上，使用专用配置文件，不使用隐私窗口。
- **页面地址：** 只能使用证书有效的 `https://` 或 `http://localhost`。主要地址为 https://anirut77.github.io/lensiq/，或团队提供给您的地址。
- **网络：** 第一次打开页面时需要联网以加载模型；计数过程中不需要联网。网络中断时重新加载页面可能失败，因此请在活动开始前打开页面并开始计数。
- **摄像画面：** 区域内人物的高度至少占画面高度的 **10%**（低于此值页面会提示“人物看起来很小”，并且计数会偏低 37–59%）；不要逆光；镜头前不要有大型物体遮挡（靠近镜头的高大人物会遮住其他人）。
- **预计人数：** 估计高峰时单个画面中的最大人数。如果单个画面中**大约有 50 人或更多**，目前尚不能销售和使用；请在活动日之前告知销售方。
- **告示：** 在区域入口张贴告示 A（`camera-notice.html`，泰语、英语、中文），活动开始前打印并张贴。
- **文件：** 来自主办方或场地业主的许可（摄像点位、日期、时间，不录制视频），以及额外的 DPIA。团队会把表格发给您。

### 2. 活动日逐步操作

1. **活动前至少 1 天，** 在真实场地试装：检查区域内人物高度是否至少占画面高度的 10%；调整位置；张贴告示 A。
2. **活动当天早晨，** 接通电源，打开 `crowd.html`，点击“开启摄像头”，允许摄像头，等待状态显示模型已加载。
3. **绘制区域：** 只框住您需要的区域（如果远处的人看起来很小，只画靠近的部分）；系统按脚的位置判断人是否在区域内。然后**绘制进出计数线**，并设定哪一侧为“进”。
   一天之中摄像头不得移动，否则计数线和停留时间无法使用（可摇动的摄像头只能提供每帧人数）。
4. **设置“高峰预计人数”** 为主办方的估计值。重要：在密集人群中，计数会“崩溃”到 0–2 人，且系统自身不会发出警告；设置该值后，当系统看到的人数少于预期的一半时，页面会发出警告。
5. **试运行 1 小时**（开门前）：穿过计数线进行测试；检查人物框和数字是否合理；留意“人物看起来很小”的提示。
6. **活动期间：** 让设备持续运行并保持屏幕常亮。操作员查看“当前画面人数”（5 帧的中位数）和“区域内人数”。带 ≈ 标记表示估计值（从 15 人起，或区域密度达到每平方米 2 人及以上时显示）。
7. **如订购试点：** 每 5 分钟，操作员记录屏幕上的数值，同时由 2 名计数员分别独立计数（互不查看），并用手动计数器以 15 分钟为一个时段统计进出人数。
8. **当天傍晚：** 点击“导出营销报告 CSV”（文件头注明这是估计值）；导出汇总 JSON 并加密保存。文件中不含任何图像。
9. **活动结束后：** 关闭摄像头；按约定的保存期限清除统计数据；按主办方要求撤下告示。系统默认不录制视频。

### 3. 常见问题与解决办法

| 现象 | 可能原因 | 解决办法 |
|---|---|---|
| 提示“人物看起来很小” | 人物高度不足画面高度的 10% | 把摄像头移近，或只在靠近的部分绘制区域。这种情况下计数偏低 37–59%（小或远的人物，n = 29 帧，初步结果，对照 AI 参考值） |
| 人很多但数字很低 | 人群密集，检测器失效（在涩谷，约 300 人被计为 0–2 人） | 停止使用该数字；设置“高峰预计人数”让页面发出警告；分割摄像画面，使每个画面中的人更少；单个画面超过约 50 人即超出服务范围 |
| 计数比肉眼计数低 26–59% | 已知限制：15–22 人充满画面时少计 26%（n = 12 帧）；30–50 人时少计 58%（n = 20 帧）；小或远的人物少计 37–59%（n = 29 帧）；初步结果，对照 AI 参考值 | 仅作为估计值和趋势，不作为真实人数；从一开始就告知主办方。尚不适用于密集人群 |
| 过线计数不准 | 摄像头移动了，或计数线横跨在人们停留的位置 | 固定摄像头；把计数线移到人们持续走过的位置；先走一遍测试 |
| 区域边缘的数字闪烁 | 有人站在区域边缘 | 移动区域边缘，避免切过人们站立的位置 |
| 画面卡住、变慢、数字跳动 | 设备过热降速，或配置较低；低于每秒 2 帧 | 让设备休息降温，接通电源，换用性能更强的设备（试点套件建议最低每秒 2 次） |
| 不请求摄像头权限 | 使用了非 localhost 的 `http://`，或权限被禁止 | 使用 `https://`；允许使用摄像头；重新加载 |
| 关闭浏览器后数据丢失 | 使用了隐私窗口或清除了网站数据 | 使用专用配置文件；关闭前务必先导出 CSV |
| 主办方要求识别年龄、性别或情绪 | 产品中没有该功能，客户版本中已关闭 | 拒绝；系统只做匿名计数 |
| 主办方想用它做人群安全判断（限制入场） | 超出适用范围 | 拒绝；建议主办方使用自己的方法 |

### 4. 联系方式

| 事项 | 渠道 |
|---|---|
| 使用咨询与区域设置 | LINE：@632yliiw · 电子邮件：[เจ้าของจะแจ้ง] · 电话：[เจ้าของจะแจ้ง]。请按报价单中支持方案的约定在活动前提前联系 |
| 活动期间系统无法使用，或怀疑数据泄露 | 同一渠道，并注明 S1。响应时间以报价单中的支持方案为准。活动期间的周末和夜间支持必须提前约定 |
| 摄像头、支架、电源和网络 | 客户或其设备承包商（LENSIQ 不销售硬件） |
| 告示和数据权利请求 | 主办方或场地业主是数据控制者 |

报告问题时，请说明：活动或场所、摄像画面、页面名称、时间、已执行的步骤和浏览器版本。**请勿发送参与者的图像或视频。**

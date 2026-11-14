# คู่มือเริ่มต้นใช้งาน: LENSIQ Crowd (ประมาณความหนาแน่นของคนในงาน รุ่นทดลอง ไม่เหมาะกับฝูงชนหนาแน่น)

> **ร่าง (DRAFT) 2026-11-11** สำหรับลูกค้าหลังตกลงซื้อ ใช้กับ `crowd.html` ฐานข้อมูล: `docs/CROWD-ACCURACY.md`, `docs/pilot/PILOT-CROWD.md`,
> `docs/DEPLOYMENT-CHECKLIST.md`, `docs/SUPPORT.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md` ช่อง [วงเล็บ] เจ้าของกรอก ห้ามแต่งข้อมูลติดต่อ
>
> **ขอบเขต:** ฝูงชนเบาบางถึงปานกลางเท่านั้น (ประมาณต่ำกว่า 50 คนในภาพเดียว) **ยังไม่เหมาะกับฝูงชนหนาแน่น** ห้ามใช้ตัดสินความปลอดภัยของฝูงชน
> ระบบให้ "ค่าประมาณความหนาแน่น" ไม่ใช่จำนวนที่แน่นอน

> ระดับฟรี: Crowd 2 ชั่วโมงต่อเครื่องต่อวัน เกินนั้นต้องมีใบอนุญาต ยังไม่บังคับในระบบ (ไม่มีตัวนับหรือตัวจับเวลาในโค้ด) ข้อจำกัดเริ่มตามวันที่จะประกาศ ประกาศล่วงหน้าอย่างน้อย 30 วันและเริ่มใช้หลังประกาศ 30 วัน เจ้าของบังคับผ่านสัญญา ลูกค้าส่งออกข้อมูลของตนได้เสมอ (OP-20, OP-26)

## 1. ก่อนติดตั้ง: สิ่งที่ลูกค้าต้องมี

| หัวข้อ | รายละเอียด |
|---|---|
| อุปกรณ์ | มือถือหรือโน้ตบุ๊กที่มีกล้อง 1 เครื่องต่อมุมกล้อง ลูกค้าจัดหาเอง ควรเป็นเครื่องระดับกลางขึ้นไป ยังไม่ได้วัดความเร็วบนมือถือจริง (ตัวเลขที่มีเป็นการจำลองบนคอมพิวเตอร์: 355 ms ต่อภาพ ราว 2.8 ครั้งต่อวินาที) |
| ขาตั้งและไฟ | ขาตั้งสูง ≥ 2.5–3 ม. มองลงประมาณ 30–45° กล้องอยู่นิ่ง ต่อไฟตลอดงาน ตั้งเครื่องไม่ให้หลับและจอเปิดตลอด ระวังเครื่องร้อนแล้วช้าลง |
| เบราว์เซอร์ | Chrome/Edge รุ่นปัจจุบัน (110 ขึ้นไป) หรือ Safari 16.4 ขึ้นไป โปรไฟล์เฉพาะ ไม่ใช้หน้าต่างส่วนตัว |
| ที่อยู่หน้าเว็บ | `https://` ที่ใบรับรองถูกต้อง หรือ `http://localhost` เท่านั้น ที่อยู่ที่ใช้จริง [ที่อยู่เว็บ — ต้องยืนยัน / to confirm] |
| เครือข่าย | ต้องมีอินเทอร์เน็ตตอนเปิดหน้าครั้งแรกเพื่อโหลดโมเดล หลังนั้นไม่ต้องใช้อินเทอร์เน็ตระหว่างนับ โหลดหน้าใหม่ตอนเครือข่ายหลุดอาจล้มเหลว ให้เปิดหน้าและเริ่มนับก่อนเปิดงาน |
| มุมกล้อง | คนในโซนสูงอย่างน้อย **10% ของความสูงภาพ** (ต่ำกว่านี้ระบบเตือน "คนดูเล็ก" และนับต่ำกว่าจริง 37–59%) ไม่ย้อนแสง ไม่มีของใหญ่บังตรงหน้ากล้อง (คนตัวใหญ่ใกล้กล้องบังคนอื่น) |
| คนที่คาดว่าจะมี | ประเมินจำนวนคนสูงสุดต่อภาพช่วงพีค ถ้า **ประมาณ 50 คนขึ้นไป** ในภาพเดียว ยังขายและใช้ไม่ได้ บอกผู้ขายก่อนวันงาน |
| ป้ายแจ้ง | ป้าย A (`camera-notice.html` ไทย/อังกฤษ/จีน) ที่ทางเข้าพื้นที่ พิมพ์และติดก่อนเริ่ม |
| เอกสาร | หนังสืออนุญาตจากผู้จัดงาน/เจ้าของพื้นที่ (จุดกล้อง วัน เวลา ไม่บันทึกวิดีโอ) DPIA เพิ่มเติม (`docs/pdpa/DPIA-template.md`) |

## 2. วันงานทีละขั้น

1. **ก่อนงานอย่างน้อย 1 วัน** ลองติดตั้งที่สถานที่จริง ดูภาพว่าคนในโซนสูง ≥ 10% ของภาพ ปรับตำแหน่ง ติดป้าย A
2. **เช้าวันงาน** ต่อไฟ เปิด `crowd.html` กด "เปิดกล้อง" อนุญาตกล้อง รอจนสถานะแสดงว่าโหลดโมเดลแล้ว
3. **วาดโซน** ("วาดโซน") ครอบเฉพาะพื้นที่ที่ต้องการ (ถ้าคนไกลเล็ก ให้วาดเฉพาะส่วนใกล้) คนในโซนนับจากเท้า **วาดเส้นนับเข้า/ออก** ตั้งด้านที่เป็น "เข้า"
   กล้องต้องไม่ขยับระหว่างวัน มิฉะนั้นเส้นนับและเวลาอยู่ในโซนใช้ไม่ได้ (กล้องแพนได้เฉพาะจำนวนต่อภาพ)
4. **ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค"** ตามที่ผู้จัดประเมิน (สำคัญ: ในฝูงชนหนาแน่น ตัวนับ "ล้ม" ลงเหลือ 0–2 คน โดยไม่มีสัญญาณเตือนเอง ค่านี้ทำให้ระบบเตือนเมื่อเห็นน้อยกว่าครึ่งของที่คาด)
5. **ทดลอง 1 ชั่วโมง** ก่อนเปิดงาน: เดินผ่านเส้นเข้า/ออกทดสอบ ดูว่าเห็นกรอบคนและตัวเลขสมเหตุสมผล ดูข้อความ "คนดูเล็ก"
6. **ระหว่างงาน**: วางเครื่องไว้ ไม่ปิดจอ ผู้ควบคุมดูตัวเลข "คนในภาพตอนนี้" (ค่ามัธยฐาน 5 ภาพ) และ "คนในโซน" เครื่องหมาย ≈ หมายถึงค่าประมาณ (ขึ้นเมื่อคนตั้งแต่ 15 คน หรือโซนแน่น
   ≥ 2 คนต่อตารางเมตร)
7. **ถ้าสั่งนำร่อง**: ทุก 5 นาที ผู้ควบคุมจดค่าบนหน้าจอ ผู้นับ 2 คนนับแยกกัน (ไม่ดูของกัน) และนับเข้า/ออกด้วยเครื่องกดนับมือช่วงละ 15 นาที (`docs/pilot/PILOT-CROWD.md` §3, §5)
8. **เย็นวันงาน**: กด "ส่งออก CSV รายงานการตลาด" (หัวไฟล์ระบุว่าเป็นค่าประมาณ) ส่งออกสรุป JSON เก็บแบบเข้ารหัส ไม่มีภาพในไฟล์
9. **หลังงาน**: ปิดกล้อง ล้างข้อมูลสถิติตามระยะเก็บที่ตกลง ถอดป้ายตามที่ผู้จัดกำหนด ไม่บันทึกวิดีโอเป็นค่าเริ่มต้น

## 3. ปัญหาที่พบบ่อยและวิธีแก้

| อาการ | สาเหตุที่น่าจะเป็น | วิธีแก้ |
|---|---|---|
| ขึ้น "คนดูเล็ก" | คนสูงไม่ถึง 10% ของภาพ | ย้ายกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้ ผลที่นับต่ำกว่าจริง 37–59% ในกรณีนี้ |
| ตัวเลขน้อยมากทั้งที่มีคนเยอะ | ฝูงชนหนาแน่น ตัวตรวจจับล้ม (ที่ชิบูย่า ราว 300 คนถูกนับ 0–2) | หยุดใช้ค่านั้น ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค" ให้ระบบเตือน แบ่งมุมกล้องให้คนต่อภาพน้อยลง ถ้าเกินประมาณ 50 คนต่อภาพ นอกขอบเขตบริการ |
| ตัวเลขต่ำกว่าที่นับด้วยตา 26–59% | ข้อจำกัดที่ทราบ: คน 15–22 คนเต็มภาพ นับต่ำ 26% (n = 12 ภาพ) คน 30–50 คน นับต่ำ 58% (n = 20 ภาพ) คนไกลหรือตัวเล็ก นับต่ำ 37–59% (n = 29 ภาพ) ผลเบื้องต้นเทียบ AI | ใช้เป็นค่าประมาณและแนวโน้ม ไม่ใช้เป็นจำนวนจริง บอกผู้จัดงานตั้งแต่ต้น |
| ตัวนับข้ามเส้นไม่ตรง | กล้องขยับ เส้นพาดผ่านจุดที่คนยืนหยุด | ตรึงกล้อง ย้ายเส้นไปจุดที่คนเดินผ่านต่อเนื่อง ทดลองเดินนับก่อน |
| ตัวเลขในโซนกระพริบที่ขอบ | คนยืนที่ขอบโซน | ขยับขอบโซนให้ไม่ตัดผ่านจุดที่คนยืน |
| ภาพค้าง ช้า ตัวเลขกระตุก | เครื่องร้อนลดความเร็ว หรือรุ่นต่ำ ต่ำกว่า 2 ครั้งต่อวินาที | พักเครื่อง ระบายความร้อน ต่อไฟ ใช้เครื่องรุ่นสูงขึ้น (ขั้นต่ำที่เสนอในชุดนำร่อง: 2 ครั้งต่อวินาที) |
| เบราว์เซอร์ไม่ขออนุญาตกล้อง | `http://` ที่ไม่ใช่ localhost หรือสิทธิ์ถูกปิด | ใช้ `https://` เปิดสิทธิ์กล้อง โหลดใหม่ |
| ข้อมูลหายหลังปิดเบราว์เซอร์ | ใช้หน้าต่างส่วนตัว หรือล้างข้อมูลเว็บ | ใช้โปรไฟล์เฉพาะ ส่งออก CSV ก่อนปิดทุกครั้ง |
| ผู้จัดขอให้ระบุอายุ เพศ หรืออารมณ์ | ไม่มีในระบบ ปิดในเวอร์ชันลูกค้า | ไม่ทำ ระบบนับแบบไม่ระบุตัวตนเท่านั้น |
| ผู้จัดขอใช้ตัดสินความปลอดภัยของฝูงชน (จำกัดคนเข้า) | นอกขอบเขต | ปฏิเสธ แนะนำใช้วิธีของผู้จัดงานเอง |

## 4. ติดต่อใคร

| เรื่อง | ช่องทาง |
|---|---|
| คำถามการใช้งาน การตั้งค่าโซน | อีเมล [อีเมลสนับสนุน] · LINE OA [LINE OA] · โทร [เบอร์โทร] (OP-16 ยังไม่ประกาศ) ก่อนวันงานอย่างน้อย 3 วันทำการ [ต้องยืนยัน / to confirm] |
| ระบบใช้ไม่ได้ระหว่างงาน หรือสงสัยข้อมูลรั่ว | ช่องทางเดียวกัน ระบุว่าเป็น S1 เวลาตอบรับตามแผนสนับสนุนที่ตกลง [ต้องยืนยัน / to confirm ค่าใน `docs/SUPPORT.md` เป็นร่างในวงเล็บ] (OP-17) ช่วงสุดสัปดาห์/กลางคืนของงานต้องตกลงล่วงหน้า |
| กล้อง ขาตั้ง ไฟ เครือข่าย | ลูกค้าหรือผู้รับเหมาอุปกรณ์ของลูกค้า (LENSIQ ไม่ขายอุปกรณ์) |
| ป้ายแจ้งและคำขอสิทธิ์ข้อมูล | ผู้จัดงาน/เจ้าของพื้นที่เป็นผู้ควบคุมข้อมูล |

แจ้งปัญหา: งาน/ไซต์ มุมกล้อง ชื่อหน้า เวลา ขั้นตอน รุ่นเบราว์เซอร์ **ห้ามส่งภาพหรือวิดีโอของผู้เข้าร่วมงาน**

---

# English

> **DRAFT 2026-11-11.** For customers after purchase, for `crowd.html`. Based on `docs/CROWD-ACCURACY.md`, `docs/pilot/PILOT-CROWD.md`, `docs/DEPLOYMENT-CHECKLIST.md` and `docs/SUPPORT.md`.
> Open points (OP-xx) are in `docs/sales/README.md`. Fields in [brackets] are for the owner. **Scope:** sparse to medium crowds only (roughly under 50 people in one view). **Not yet suitable for
> dense crowds.** Never use it for crowd-safety decisions. It gives a density estimate, not an exact count.

> Free tier: Crowd 2 hours per device per day; beyond it a licence is needed. Not enforced in the product yet (no counter or timer in the code). The limits start on a date to be announced at least 30 days ahead and begin 30 days after the announcement; the owner enforces them by contract. Customers can always export their own data (OP-20, OP-26).

## 1. Before installing

- **Device:** a phone or laptop with a camera, one per camera view, supplied by the customer; mid-range or better. Speed on a real phone has not been measured (the only figure is emulated on a computer:
  355 ms per frame, about 2.8 per second).
- **Stand and power:** a stand at least 2.5–3 m high looking down about 30–45 degrees; a fixed camera; mains power all event; set the device never to sleep with the screen on; watch for heat slowing the device.
- **Browser:** current Chrome or Edge (110+) or Safari 16.4+, a dedicated profile, no private window.
- **Page address:** a valid `https://` or `http://localhost` only. The real address: [to confirm].
- **Network:** internet is needed when the page is first opened, to load the models; none is needed while counting. Reloading when the network is down may fail, so open the page and start counting before the event opens.
- **Camera view:** people in the zone at least **10% of the frame height** (below that the page warns "people look small" and undercounts by 37–59%); no backlight; no large object in front of the lens.
- **Expected crowd:** estimate the peak number of people in one view. If **about 50 or more** in one view, it cannot be sold or used yet; tell the seller before the day.
- **Sign:** sign A (`camera-notice.html`, Thai / English / Chinese) at the entrance to the area, printed and posted before start.
- **Documents:** permission from the organiser or site owner (camera spots, dates, times, no video recording); an extra DPIA (`docs/pdpa/DPIA-template.md`).

## 2. Event day, step by step

1. At least one day before, try the set-up at the real place: check that people in the zone are at least 10% of the frame height; adjust; post sign A.
2. On the morning: connect power, open `crowd.html`, press "Start camera", allow the camera, and wait until the status shows that the models are loaded.
3. **Draw the zone** over the area you need only (if far people are small, draw only the near part); people are placed in the zone by their feet. **Draw the entry / exit line** and set the "in" side.
   The camera must not move during the day, or the line and dwell time are unusable (a panning camera gives per-frame counts only).
4. **Set "expected crowd at peak"** to the organiser's estimate. Important: in a dense crowd the count collapses to 0–2 with no warning of its own; this setting makes the page warn when it sees fewer than half of what is expected.
5. **One-hour trial** before the doors open: walk across the line to test; check the boxes and numbers are sensible; watch for "people look small".
6. **During the event:** leave the device running with the screen on. The operator watches "people in view now" (median of 5 frames) and "people in zone". A ≈ mark means an estimate (shown from 15 people, or a zone at 2
   people per m² or more).
7. **If a pilot is ordered:** every 5 minutes the operator notes the on-screen values while two counters count separately (not looking at each other), and count entries / exits with hand tally counters for 15-minute
   blocks (`docs/pilot/PILOT-CROWD.md` §3, §5).
8. **Evening:** press "Export marketing-report CSV" (its header says "estimate"); export the summary JSON and store it encrypted. No image is in the files.
9. **After the event:** stop the camera; clear the statistics on the agreed retention; take down signs as the organiser requires. No video is recorded by default.

## 3. Common problems and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| "People look small" | People under 10% of the frame height | Move the camera closer, or draw the zone on the near part only. The undercount in this case is 37–59% |
| Very low count with many people | Dense crowd; the detector collapses (at Shibuya about 300 people counted as 0–2) | Stop using that number; set the expected crowd so the page warns; split camera views so fewer people are in each; above about 50 per view is outside the service |
| Count lower than a count by eye by 26–59% | Known limit: 15–22 people filling the frame undercounted by 26% (n = 12 frames); 30–50 people undercounted by 58% (n = 20 frames); small / far people 37–59% (n = 29 frames); preliminary, against an AI reference | Use it as an estimate and a trend, not a true count; tell the organiser from the start |
| Line crossings look wrong | Camera moved, or the line is across where people stand | Fix the camera; move the line to where people walk through; test by walking across |
| Zone count flickers at the edge | People standing on the edge | Move the edge so it does not cut through where people stand |
| Frozen picture, slow, jerky numbers | Device hot and slowed, or a low-end model; below 2 calls a second | Rest and cool the device, use mains power, use a stronger device (the pilot kit proposes at least 2 a second) |
| No camera prompt | `http://` that is not localhost, or permission blocked | Use `https://`; allow the camera; reload |
| Data gone after closing the browser | Private window or site data cleared | Use a dedicated profile; export the CSV before closing |
| The organiser asks for age, gender or emotion | Not in the product; off in customer builds | Decline; the system counts anonymously only |
| The organiser wants to use it for crowd-safety decisions (limiting entry) | Outside scope | Decline; advise the organiser's own methods |

## 4. Who to contact

Questions and zone set-up: e-mail [support e-mail], LINE OA [LINE OA], phone [phone] (OP-16, not announced yet); contact us at least 3 working days before the event **[to confirm]**. Down during the event or a
suspected data leak: the same channels, marked S1; response times follow the agreed support plan **[to confirm]** (`docs/SUPPORT.md` values are bracketed drafts, OP-17); weekend and night cover during an event must be agreed
in advance. Cameras, stands, power and network: the customer or its equipment contractor (LENSIQ sells no hardware). Signage and data-subject requests: the organiser or site owner is the controller.
When reporting give the event or site, camera view, page, time, steps and browser version. **Never send images or video of attendees.**

# Gate: อ่านป้ายทะเบียน (ประตู ลานจอด หมู่บ้าน) — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: gate.html, parking.html, village.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน เจ้าหน้าที่ยืนยันทุกคันก่อนเปิดไม้กั้นหรือคิดเงิน
- ภาพจากกล้องจริงส่วนใหญ่ยังต้องให้เจ้าหน้าที่แตะเลือกป้ายหรือแก้เลข ป้ายเอียง มืด สกปรก หรือป้ายมอเตอร์ไซค์อาจอ่านผิด

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ตัวเลขใน docs/accuracy-figures.json

- `gateTopPct`: ค่า **44** (ค่าดิบ 43.75) — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate is the top box, % — หลักฐานใน `ACCURACY.md`: `| plate is the top box | 10 / 18 | 4 / 14 | 44% (14 / 32), n = 32 photos with a plate |`
- `gateTopX`: ค่า **14** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate is the top box, photos — หลักฐานใน `ACCURACY.md`: `44% (14 / 32), n = 32 photos with a plate`
- `gateTopN`: ค่า **32** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: photos with a plate — หลักฐานใน `ACCURACY.md`: `44% (14 / 32), n = 32 photos with a plate`
- `gateExactPct`: ค่า **32** (ค่าดิบ 31.818) — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: exact automatic read, % — หลักฐานใน `ACCURACY.md`: `| whole plate read right automatically | 4 / 12 | 3 / 10 | 32% (7 / 22), n = 22 photos with a sure, standard label |`
- `gateExactX`: ค่า **7** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: exact automatic reads — หลักฐานใน `ACCURACY.md`: `32% (7 / 22), n = 22 photos with a sure, standard label`
- `gateExactN`: ค่า **22** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: photos scored for exact read — หลักฐานใน `ACCURACY.md`: `32% (7 / 22), n = 22 photos with a sure, standard label`
- `gateExactDev`: ค่า **12** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: exact-read photos in the dev (tuning) half — หลักฐานใน `ACCURACY.md`: `12 of the 22 exact-read photos are in the dev half`
- `gateExactUnsurePct`: ค่า **27** (ค่าดิบ 26.923) — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: exact read counting unsure-letter photos as misses — หลักฐานใน `ACCURACY.md`: `counting the 4 photos with unsure letters as misses: 27% (7 / 26)`
- `gateExactUnsureN`: ค่า **26** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: n with the unsure-letter photos — หลักฐานใน `ACCURACY.md`: `counting the 4 photos with unsure letters as misses: 27% (7 / 26)`
- `gateUnsure`: ค่า **4** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: photos with unsure letters — หลักฐานใน `ACCURACY.md`: `counting the 4 photos with unsure letters as misses: 27% (7 / 26)`
- `gateNoneN`: ค่า **19** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: photos without a plate — หลักฐานใน `ACCURACY.md`: `| 0 / 19 (3 / 19), 95% interval 0–17%; held-out 0–32% |`
- `gateNoneBefore`: ค่า **3** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate-less photos auto-read before the plate check — หลักฐานใน `ACCURACY.md`: `| 0 / 19 (3 / 19), 95% interval 0–17%; held-out 0–32% |`
- `gateNoneHi`: ค่า **17** (ค่าดิบ 16.818) — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: upper 95% bound for 0 / 19, % — หลักฐานใน `ACCURACY.md`: `| 0 / 19 (3 / 19), 95% interval 0–17%; held-out 0–32% |`
- `gateNoneDev`: ค่า **11** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate-less photos in the dev half — หลักฐานใน `ACCURACY.md`: `11 of the 19 plate-less photos`
- `gateNoneHoN`: ค่า **8** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate-less held-out photos — หลักฐานใน `ACCURACY.md`: `| 0 / 11 (2 / 11) | 0 / 8 (1 / 8) |`
- `gateNoneHoBefore`: ค่า **1** — Gate, public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12: plate-less held-out photos auto-read before the check — หลักฐานใน `ACCURACY.md`: `| 0 / 11 (2 / 11) | 0 / 8 (1 / 8) |`

### ข้อความตัวเลขเดิมบนหน้าเว็บ (สร้างจาก docs/accuracy-figures.json)

- `gate.cl.l4` (gate.html)
  - ภาพถ่ายจริง กรอบแรกอยู่บนป้าย: 44% (14 / 32) · n = 32 ภาพที่มีป้าย · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12)
- `gate.cl.l5` (gate.html)
  - ภาพถ่ายจริง อ่านอัตโนมัติถูกทั้งป้าย: 32% (7 / 22) · n = 22 ภาพที่อ่านป้ายได้แน่นอน · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) (12 ภาพในนี้ใช้ปรับการตรวจว่าเป็นป้าย จึงมองในแง่ดี; ถ้านับภาพที่ผู้ติดป้ายไม่แน่ใจตัวอักษรอีก 4 ภาพเป็นอ่านไม่ถูก: 27% (7 / 26))
- `gate.cl.l6` (gate.html)
  - ภาพถ่ายจริงที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ: 0 / 19 (ก่อนมีการตรวจว่าเป็นป้าย 3 / 19) · n = 19 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) (11 ภาพในนี้ใช้ปรับการตรวจว่าเป็นป้าย เฉพาะภาพที่ไม่ได้ใช้ปรับ: 0 / 8 ก่อนมีการตรวจ 1 / 8; ช่วงความเชื่อมั่น 95% ของ 0 / 19 คือ 0–17%; ป้ายเล็กที่อ่านไม่ได้ในภาพเหล่านี้ถูกกำหนดเป็นพื้นที่ที่ไม่นับคะแนน)

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.gateSyn` · ที่มา: synthetic (ข้อมูลจำลอง) · อ้างอิง: docs/ACCURACY-CLAIMS.md §5 (docs/GATE.md §3b, round 15, held-out seed 7)
  - TH: หาป้ายเจอ (กรอบแรก) 97.1% (136/140) · n = 140 ฉากชุดทดสอบแยก 7 แบบป้าย (ชุดเดโม seed 7) อ่านถูกทั้งป้ายจากภาพเดียว 58% (81/140) ก่อนโหวตหลายเฟรมและก่อนเจ้าหน้าที่ยืนยัน
  - EN: Plate found (top box) in 97.1% (136/140) · n = 140 held-out scenes, 7 plate types (demo set, seed 7); whole plate read right from one frame in 58% (81/140), before multi-frame voting and the guard's check
  - 中文: 找到车牌（首个候选框）97.1%（136/140）· n = 140 个留出场景，7 类车牌（演示集 seed 7）；单帧整牌读对 58%（81/140），尚未计入多帧投票与保安确认
- `cat.c.gatePub` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: docs/ACCURACY-CLAIMS.md §5 round 16 (docs/GATE.md §3c, 51 real photos, plate check, labels v3 2026-11-12)
  - TH: ภาพถ่ายจริงสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12): กรอบแรกเป็นป้าย 44% (14/32) · n = 32 ภาพที่มีป้าย อ่านถูกทั้งป้ายอัตโนมัติ 32% (7/22) · n = 22 ภาพ (บางส่วนใช้ปรับค่า ดีเกินจริง) ภาพไม่มีป้ายถูกอ่านอัตโนมัติ 0/19 · n = 19 ภาพ ด่านหรือลานจอดจริงยังไม่ได้วัด
  - EN: Real public photos (Wikimedia Commons, labels v3 confirmed by the owner 2026-11-12): top box on the plate in 44% (14/32) · n = 32 photos with a plate; whole plate read right automatically in 32% (7/22) · n = 22 photos (partly the tuning set, optimistic); photos without a plate read automatically 0/19 · n = 19. A real gate or car park: not measured yet
  - 中文: 真实公开照片（Wikimedia Commons，标注 v3 已由业主于 2026-11-12 确认）：首个候选框为车牌 44%（14/32）· n = 32 张有车牌的照片；自动整牌读对 32%（7/22）· n = 22 张（部分为调参集，偏乐观）；无车牌照片被自动读取 0/19 · n = 19。实际道闸或停车场：尚未测量
- `cat.r.gate`
  - TH: ขั้นตอนลานจอดและหมู่บ้านครบ เจ้าหน้าที่ยืนยันทุกการอ่าน มีเครื่องมือตรวจหน้างานและแผนนำร่อง แต่การหาป้ายในภาพจริงยังอ่อน
  - EN: Complete car-park and village flow, a guard confirms every read, on-site check and pilot plan exist; finding plates in real photos is still weak
  - 中文: 停车场与小区流程完整，每次识别由保安确认，有现场检查与试点计划；在真实照片中找车牌仍较弱
- `cat.r.notice`
  - TH: แม่แบบป้ายแจ้งและประกาศความเป็นส่วนตัวสำหรับการนำร่อง ทนายต้องตรวจก่อนขาย
  - EN: Sign and privacy-notice template for a pilot; a lawyer reviews it before sale
  - 中文: 用于试点的告示与隐私声明模板；销售前需律师审阅

## ข้อจำกัดที่รู้

- เจ้าหน้าที่ยืนยันรถทุกคันก่อนเปิดไม้กั้นหรือเก็บเงิน
- ป้ายเอียง มืด สกปรก หรือป้ายรถจักรยานยนต์อาจอ่านผิด
- ยังไม่มีผลวัดที่ด่านหรือลานจอดจริง การเปิดไม้กั้นอัตโนมัติในหมู่บ้านต้องผ่านการทดสอบหน้างานก่อน

## สัญญาอนุญาต

- PP-OCRv5 Thai (Apache-2.0), ตัวหาป้าย LPD-YuNet (OpenCV Zoo) — ดูสิทธิ์ข้อมูลฝึกใน LICENSES/THIRD_PARTY.md
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### cat-security.html

~~~~text
[cat.c.gateSyn] หาป้ายเจอ (กรอบแรก) 97.1% (136/140) · n = 140 ฉากชุดทดสอบแยก 7 แบบป้าย (ชุดเดโม seed 7) อ่านถูกทั้งป้ายจากภาพเดียว 58% (81/140) ก่อนโหวตหลายเฟรมและก่อนเจ้าหน้าที่ยืนยัน
[cat.c.gatePub] ภาพถ่ายจริงสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12): กรอบแรกเป็นป้าย 44% (14/32) · n = 32 ภาพที่มีป้าย อ่านถูกทั้งป้ายอัตโนมัติ 32% (7/22) · n = 22 ภาพ (บางส่วนใช้ปรับค่า ดีเกินจริง) ภาพไม่มีป้ายถูกอ่านอัตโนมัติ 0/19 · n = 19 ภาพ ด่านหรือลานจอดจริงยังไม่ได้วัด
[cat.r.notice] แม่แบบป้ายแจ้งและประกาศความเป็นส่วนตัวสำหรับการนำร่อง ทนายต้องตรวจก่อนขาย
~~~~

#### gate.html

~~~~text
[gate.assist] อ่านป้ายแบบช่วย รปภ.: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ผลกับภาพถ่ายจริง 51 ภาพ (ชุดข้อมูลสาธารณะ Wikimedia Commons): อ่านถูกทั้งป้ายโดยไม่ต้องแตะ 32% (7 / 22 · n = 22 · บางภาพอยู่ในชุดที่ใช้ปรับค่า จึงดีเกินจริง) และต้องแตะเลือกกรอบป้าย 78% (25 / 32 · n = 32)
[gate.acc.h] ความแม่นยำ: บอกตามจริง
[gate.acc.l1] ยังไม่มีผลวัดความแม่นยำที่หน้างานจริง ตัวเลขที่ใช้ได้ต้องมาจากการตรวจความแม่นยำหน้างานของคุณเอง (เมนู ตรวจความแม่นยำ ในแต่ละหน้า)
[gate.acc.l3] ตัวหาป้าย: วิธีคลาสสิกในเครื่อง (หาพื้นป้ายและแถวตัวอักษร) ร่วมกับโมเดล LPD-YuNet ของ OpenCV Zoo (Apache-2.0, ฝึกกับป้ายจีน, 4.1 MB) ชุดภาพป้ายจำลอง 140 ภาพหาเจอ 136–137 ภาพ (ทุกสี มอเตอร์ไซค์ และกลางคืน อย่างน้อย 90%) แต่ภาพถ่ายจริง 51 ภาพ (Wikimedia Commons) กรอบแรกอยู่บนป้ายเพียง 14 จาก 32 ภาพที่มีป้าย (ป้ายกำกับ v3) ยังไม่ได้ใส่โมเดลที่ฝึกกับป้ายไทย เพราะชุดข้อมูลที่มีอยู่ยังไม่ชัดเรื่องสิทธิ์ข้อมูลฝึก เจ้าหน้าที่แตะกรอบรอบป้ายได้เสมอ
[gate.acc.l6] เป้าของการตรวจหน้างาน (นำร่อง): ถูกทั้งป้ายกลางวันอย่างน้อย 95% และกลางคืนอย่างน้อย 85% (ขอบล่างช่วงความเชื่อมั่น 95%) จากการอ่านจริงอย่างน้อย 200 ครั้ง ในนั้นกลางคืนอย่างน้อย 40 ครั้ง และมอเตอร์ไซค์อย่างน้อย 30 ครั้ง
[gate.cl.h] ตัวเลขที่วัดได้และที่มา
[gate.cl.l1] หาป้ายเจอ (กรอบแรก): 97.1% (136 / 140) · n = 140 ฉาก · ที่มา: ข้อมูลจำลอง (ชุดเดโม seed 7 ที่ไม่ได้ใช้ปรับแต่ง)
[gate.cl.l2] อ่านถูกทั้งป้ายจากภาพเดียว: 58% (81 / 140) · n = 140 ฉาก · ที่มา: ข้อมูลจำลอง (ชุดเดโม seed 7)
[gate.cl.l3] ฉากที่ไม่มีป้ายถูกอ่านอัตโนมัติ: 0 / 20 · n = 20 ฉาก · ที่มา: ข้อมูลจำลอง (ชุดเดโม seed 7)
[gate.cl.l4] ภาพถ่ายจริง กรอบแรกอยู่บนป้าย: 44% (14 / 32) · n = 32 ภาพที่มีป้าย · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12)
[gate.cl.l5] ภาพถ่ายจริง อ่านอัตโนมัติถูกทั้งป้าย: 32% (7 / 22) · n = 22 ภาพที่อ่านป้ายได้แน่นอน · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) (12 ภาพในนี้ใช้ปรับการตรวจว่าเป็นป้าย จึงมองในแง่ดี; ถ้านับภาพที่ผู้ติดป้ายไม่แน่ใจตัวอักษรอีก 4 ภาพเป็นอ่านไม่ถูก: 27% (7 / 26))
[gate.cl.l6] ภาพถ่ายจริงที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ: 0 / 19 (ก่อนมีการตรวจว่าเป็นป้าย 3 / 19) · n = 19 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (ภาพ Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) (11 ภาพในนี้ใช้ปรับการตรวจว่าเป็นป้าย เฉพาะภาพที่ไม่ได้ใช้ปรับ: 0 / 8 ก่อนมีการตรวจ 1 / 8; ช่วงความเชื่อมั่น 95% ของ 0 / 19 คือ 0–17%; ป้ายเล็กที่อ่านไม่ได้ในภาพเหล่านี้ถูกกำหนดเป็นพื้นที่ที่ไม่นับคะแนน)
[gate.cl.l7] ลานจอดหรือหมู่บ้านจริง: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง; รอภาพถ่ายป้ายจากเจ้าของ)
[gate.p3.d] หลายป้อม รายงานรายบ้าน ตรวจความแม่นยำหน้างาน
[gate.p5.d] ปรับมุมกล้อง แสง และตรวจความแม่นยำหน้างานร่วมกัน
[gate.acc.l2] ตัวอ่านอักษร: PP-OCRv5 ภาษาไทยรุ่นมือถือ (PaddleOCR, Apache-2.0, 7.5 MB) ฝึกกับข้อความไทยทั่วไป ไม่ได้ฝึกกับป้ายทะเบียน อ่านภาพป้ายตรงและชัดได้ดีกว่าภาพเอียง มืด หรือสกปรก
[gate.acc.l4] จังหวัดเลือกจากรายการ 77 จังหวัด โดยจังหวัดที่พบบ่อยที่จุดนั้นขึ้นก่อน ระบบเดาจังหวัดจากบรรทัดล่างเป็นเพียงคำแนะนำ
[gate.acc.l5] ป้ายมอเตอร์ไซค์ 3 บรรทัด ป้ายประมูลลายกราฟิก และป้ายสีพิเศษ อ่านได้ยากกว่า ให้เจ้าหน้าที่ตรวจทุกครั้ง
[gate.acc.l7] ตรวจว่าเป็นป้ายก่อนอ่านอัตโนมัติ: ระบบอ่านอัตโนมัติเฉพาะกรอบที่ดูเหมือนป้ายทะเบียนไทย (สัดส่วนกรอบ จำนวนบรรทัด และรูปแบบตัวอักษรไทยกับตัวเลข) ในการทดสอบ ป้ายจราจร ป้ายร้าน และหลักกิโลไม่ถูกอ่านอัตโนมัติเลย (0 จาก 19 ภาพ ในจำนวนนี้ 11 ภาพใช้ปรับการตรวจ ภาพที่ไม่ได้ใช้ปรับ 0 จาก 8 ภาพ) แต่ยังรับประกันไม่ได้ทุกกรณี เจ้าหน้าที่แตะกรอบรอบป้ายเองได้เสมอ
~~~~

#### help.html

~~~~text
Train guards to confirm or correct every plate, and use the "accuracy check" from day one.
培训保安确认或更正每个车牌，并从第一天起使用"准确率检查"。
~~~~

#### parking.html

~~~~text
[pk.assist] อ่านป้ายแบบช่วย รปภ.: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ผลกับภาพถ่ายจริง 51 ภาพ (ชุดข้อมูลสาธารณะ Wikimedia Commons): อ่านถูกทั้งป้ายโดยไม่ต้องแตะ 32% (7 / 22 · n = 22 · บางภาพอยู่ในชุดที่ใช้ปรับค่า จึงดีเกินจริง) และต้องแตะเลือกกรอบป้าย 78% (25 / 32 · n = 32)
[gk.acc.b] ความแม่นยำยังไม่ได้วัดที่หน้างาน
[gk.acc.t] โมเดลอ่านอักษรไทย (PP-OCRv5 ภาษาไทย, Apache-2.0) ฝึกกับข้อความทั่วไป ไม่ได้ฝึกกับป้ายทะเบียน และยังไม่มีโมเดลตรวจหาป้ายที่สิทธิ์การใช้ชัดเจน จึงใช้วิธีหาป้ายแบบคลาสสิกหรือให้เจ้าหน้าที่แตะที่ป้าย จังหวัดเลือกจากรายการ ทุกผลต้องให้เจ้าหน้าที่ยืนยัน รันการตรวจความแม่นยำหน้างานก่อนใช้จริง
[gk.tab.check] ตรวจความแม่นยำ
~~~~

#### village.html

~~~~text
[vg.assist] อ่านป้ายแบบช่วย รปภ.: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ผลกับภาพถ่ายจริง 51 ภาพ (ชุดข้อมูลสาธารณะ Wikimedia Commons): อ่านถูกทั้งป้ายโดยไม่ต้องแตะ 32% (7 / 22 · n = 22 · บางภาพอยู่ในชุดที่ใช้ปรับค่า จึงดีเกินจริง) และต้องแตะเลือกกรอบป้าย 78% (25 / 32 · n = 32)
[gk.acc.b] ความแม่นยำยังไม่ได้วัดที่หน้างาน
[gk.acc.t] โมเดลอ่านอักษรไทย (PP-OCRv5 ภาษาไทย, Apache-2.0) ฝึกกับข้อความทั่วไป ไม่ได้ฝึกกับป้ายทะเบียน และยังไม่มีโมเดลตรวจหาป้ายที่สิทธิ์การใช้ชัดเจน จึงใช้วิธีหาป้ายแบบคลาสสิกหรือให้เจ้าหน้าที่แตะที่ป้าย จังหวัดเลือกจากรายการ ทุกผลต้องให้เจ้าหน้าที่ยืนยัน รันการตรวจความแม่นยำหน้างานก่อนใช้จริง
[gk.tab.check] ตรวจความแม่นยำ
[vg.auto.note] ผู้มาเยือน รถที่ทะเบียนใกล้เคียง รถไม่รู้จัก และรถในรายการห้ามเข้า ต้องให้เจ้าหน้าที่ตัดสินเสมอ รันการตรวจความแม่นยำหน้างานให้ผ่านก่อนเปิดใช้
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### gate-kit.js

~~~~text
<h2 data-i18n="gk.chk.h">ตรวจความแม่นยำหน้างาน</h2> <p class="hint" data-i18n="gk.chk.intro">ระหว่างตรวจ ทุกครั้งที่ระบบเสนอเลขทะเบียน เจ้าหน้าที่กด ✓ อ่านถูก หรือ ✗ อ่านผิด (หรือแก้เลขแล้วยืนยัน ซึ่งนับเป็น ✗) ระบบคำนวณความแม่นยำทั้งป้าย รายตัวอักษร และแยกกลางวัน/กลางคืน พร้อมช่วงความเชื่อมั่น 95%</p> <ol class="gk-list"><li data-i18n="gk.chk.s1">เปิด "อ่านอัตโนมัติ" แล้วกด "เริ่มตรวจ"</li><li data-i18n="gk.chk.s2">เก็บอย่างน้อย 100 คัน และกลางคืนอย่างน้อย 30 คัน</li><li data-i18n="gk.chk.s3">กด "จบและคำนวณ" แล้วส่งออกผลเก็บไว้</li></ol> <div class="gk-row"><button class="btn primary" type="button" id="gkChkStart" data-i18n="gk.chk.start">เริ่มตรวจ</button><button class="btn ghost" type="button" id="gkChkStop" disabled data-i18n="gk.chk.stop">จบและคำนวณ</button> <button class="btn ghost" type="button" id="gkChkExp" hidden data-i18n="gk.chk.exp">ส่งออกผลตรวจ (.json)</button></div> <p class="gk-status" id="gkChkLive" role="status" aria-live="polite"></p> <div id="gkChkRep"></div> <details class="gk-hist"><summary data-i18n="gk.chk.hist">ผลตรวจที่ผ่านมา</summary><ul id="gkChkHist"></ul></details> <p class="hint" data-i18n="gk.chk.priv">คำนวณในเครื่องนี้ ไม่บันทึกภาพ ไฟล์ส่งออกมีเพียงเลขที่ระบบอ่าน เลขที่เจ้าหน้าที่ยืนยัน และตัวเลขที่คำนวณได้</p>
<div class="table-wrap"><table class="gk-table"><thead><tr><th data-i18n="gk.col.metric">ตัวชี้วัด</th><th data-i18n="gk.col.value">ผล</th><th data-i18n="gk.col.ci">ช่วงความเชื่อมั่น 95%</th><th data-i18n="gk.col.target">เป้า</th><th>n</th></tr></thead><tbody>
~~~~

#### village.js

~~~~text
เปิดไม้กั้นอัตโนมัติสำหรับรถลูกบ้านที่ทะเบียนตรงทุกตัว? ควรผ่านการตรวจความแม่นยำหน้างานก่อน และมีเจ้าหน้าที่ประจำป้อมเสมอ
~~~~

#### docs/ONE-PAGER-GATE.md

~~~~text
> **อ่านป้ายแบบช่วย รปภ.**: ระบบเสนอเลขป้าย และ รปภ. แตะยืนยันทุกคัน ยังไม่ใช่การอ่านอัตโนมัติเต็มรูปแบบจนกว่าจะมีตัวหาป้ายที่ฝึกด้วยภาพป้ายไทย ผลกับภาพถ่ายจริง 51 ภาพ (ชุดข้อมูลสาธารณะ Wikimedia Commons ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12): อ่านถูกทั้งป้ายโดยไม่ต้องแตะ 32% (7 / 22 · n = 22 · บางภาพอยู่ในชุดที่ใช้ปรับค่า จึงดีเกินจริง) และต้องแตะเลือกกรอบป้าย 78% (25 / 32 · n = 32) (`docs/GATE.md` §3c)
| ตรวจความแม่นยำหน้างาน | เมนูในหน้า Gate นับอ่านถูก/ผิด/ต้องแตะ แยกกลางวันกลางคืน พร้อมช่วงความเชื่อมั่น 95% |
รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)
| หาป้ายเจอ (กรอบแรก) ชุดเดโมที่ไม่ได้ใช้ปรับแต่ง | 97.1% (136 / 140) | n = 140 ฉาก (20 ต่อประเภท) | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3b |
| อ่านถูกทั้งป้ายจากภาพเดียว | 58% (81 / 140) | n = 140 ฉาก | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3b |
| ฉากที่ไม่มีป้ายถูกอ่านอัตโนมัติ | 0 / 20 | n = 20 ฉาก | ข้อมูลจำลอง (ชุดเดโม seed 7) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง กรอบแรกอยู่บนป้าย | 44% (14 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง อ่านอัตโนมัติถูกทั้งป้าย | 32% (7 / 22); นับภาพที่ไม่แน่ใจตัวอักษร 4 ภาพเป็นอ่านไม่ถูก: 27% (7 / 26) | n = 22 ภาพที่อ่านป้ายได้แน่นอน (12 ภาพใช้ปรับการตรวจว่าเป็นป้าย จึงมองในแง่ดี) | ชุดข้อมูลสาธารณะ (Wikimedia Commons) | `docs/GATE.md` §3c |
| ภาพถ่ายจริง ต้องแตะกรอบเอง | 78% (25 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) | `docs/GATE.md` §3c |
| ภาพถ่ายจริงที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ | 0 / 19 (ก่อนมีการตรวจว่าเป็นป้าย 3 / 19; ช่วง 95%: 0–17%; ภาพที่ไม่ได้ใช้ปรับ 0 / 8: 0–32%) | n = 19 ภาพ | ชุดข้อมูลสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) | `docs/GATE.md` §3c |
| ภาพมือถือของเจ้าของ (~100 ภาพ) | ยังไม่ได้วัด | — | หน้างานจริง (ภาพของเจ้าของ): ยังไม่ได้วัด | `docs/field-pilot/plates-photo-labels.md` |
| ลานจอดหรือหมู่บ้านจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `docs/pilot/PILOT-GATE.md` |
เกณฑ์ที่เสนอ: อ่านถูก ≥ 95% กลางวัน ≥ 85% กลางคืน ไม่มีค่าผิดที่บันทึกโดยไม่มีใครเห็น ตัดสินด้วยขอบล่าง Wilson 95% (เจ้าของตัดสินใจแล้ว 2026-11-09) และรายงานค่าเฉลี่ยธรรมดา (อ่านถูก k / n) คู่กันเสมอ — ที่จำนวนตัวอย่างตามแผน ต้องอ่านถูกจริงราว 98.8% กลางวัน และ 97.5% กลางคืน แผนและเช็กลิสต์: `docs/pilot/PILOT-GATE.md` §5
| ติดตั้งหน้างาน (มุมกล้อง แสง ตรวจความแม่นยำร่วมกัน) | 2,500 บาท/ครั้ง ไม่รวม VAT 7% | 3,000–5,000 บาท/ครั้ง ไม่รวม VAT 7% |
> **Assisted reading**: the system suggests the plate and the guard taps to confirm every vehicle. It is not fully automatic until a plate finder trained on Thai plates exists. On 51 real photos (public dataset, Wikimedia Commons, labels v3 confirmed by the owner 2026-11-12): exact read with no tap 32% (7 / 22 · n = 22 · some photos are in the tuning set, so this is optimistic); a tap to pick the plate was needed in 78% (25 / 32 · n = 32) (`docs/GATE.md` §3c)
- **On-site accuracy check:** right / wrong / tap counts, day and night, with 95% intervals.
| Plate found (top box), demo set not used for tuning | 97.1% (136 / 140) | n = 140 scenes | synthetic (demo set, seed 7) | `docs/GATE.md` §3b |
| Exact read from one frame | 58% (81 / 140) | n = 140 scenes | synthetic | `docs/GATE.md` §3b |
| Plate-less scenes auto-read | 0 / 20 | n = 20 scenes | synthetic | `docs/GATE.md` §3c |
| Real photos, top box on the plate | 44% (14 / 32) | n = 32 photos with a plate | public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 | `docs/GATE.md` §3c |
| Real photos, exact automatic read | 32% (7 / 22); 27% (7 / 26) counting the 4 "unsure letters" photos as misses | n = 22 (12 of them used for tuning, so optimistic) | public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 | `docs/GATE.md` §3c |
| Real photos, taps needed | 78% (25 / 32) | n = 32 | public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 | `docs/GATE.md` §3c |
| Real photos without a plate read automatically | 0 / 19 (3 / 19 before the check; 95% interval 0–17%; held-out half 0 / 8, 0–32%) | n = 19 | public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 | `docs/GATE.md` §3c |
| Owner's ~100 phone photos | not measured | — | field (owner photos): not measured | `docs/field-pilot/plates-photo-labels.md` |
| Real car park or village | not measured | — | field: not measured (no pilot yet) | `docs/pilot/PILOT-GATE.md` |
- Proposed targets: ≥ 95% exact reads by day and ≥ 85% at night, and 0 silent wrong saves. Judged on the Wilson 95%
planned sample sizes this needs about 98.8% observed by day and 97.5% at night (`docs/pilot/PILOT-GATE.md` §5).
~~~~

#### docs/sales/DECK-GATE.md

~~~~text
> **ร่าง (DRAFT) 2026-11-11** สร้างจาก `docs/ONE-PAGER-GATE.md` ใช้เฉพาะตัวเลขที่วัดแล้ว แต่ละตัวมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) และไฟล์อ้างอิง
> จาก `docs/ACCURACY-CLAIMS.md` §5 และ `docs/GATE.md` §3b–3c ถ้าไม่ได้วัด เขียนว่า "ยังไม่ได้วัด"
- สถานะ: พร้อมนำร่อง · การหาป้ายในภาพจริงยังอ่อน
| ตรวจความแม่นยำหน้างาน | รปภ. กด ✓ ✗ ทุกการอ่าน แยกกลางวัน/กลางคืน พร้อมช่วงความเชื่อมั่น 95% |
*Measured accuracy*
| หาป้ายเจอ (กรอบแรก) · plate found (top box) | 97.1% (136 / 140) | n = 140 ฉาก | **ข้อมูลจำลอง** (ชุดเดโม seed 7) / synthetic | `docs/GATE.md` §3b |
| อ่านถูกทั้งป้ายจากภาพเดียว · whole plate right from one frame | 58% (81 / 140) | n = 140 ฉาก | ข้อมูลจำลอง / synthetic | `docs/GATE.md` §3b |
| ฉากที่ไม่มีป้ายถูกอ่านอัตโนมัติ · plate-less scene read automatically | 0 / 20 | n = 20 ฉาก | ข้อมูลจำลอง / synthetic | `docs/GATE.md` §3c |
| ภาพถ่ายจริง กรอบแรกอยู่บนป้าย · real photos, top box on the plate | 44% (14 / 32) | n = 32 ภาพที่มีป้าย | **ชุดข้อมูลสาธารณะ** (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12) / public dataset, labels v3 confirmed by the owner 2026-11-12 | `docs/GATE.md` §3c |
| ภาพถ่ายจริง อ่านอัตโนมัติถูกทั้งป้าย · real photos, whole plate read right automatically | 32% (7 / 22) | n = 22 ภาพ (12 ภาพใช้ปรับการตรวจว่าเป็นป้าย จึงมองในแง่ดี / 12 tuning photos, optimistic) | ชุดข้อมูลสาธารณะ / public dataset | `docs/GATE.md` §3c |
| ภาพถ่ายจริง ต้องแตะกรอบเอง · real photos, guard had to tap the box | 78% (25 / 32) | n = 32 ภาพที่มีป้าย | ชุดข้อมูลสาธารณะ / public dataset | `docs/GATE.md` §3c |
| ภาพจริงที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ · real photos without a plate read automatically | 0 / 19 (ช่วง 95%: 0–17%) | n = 19 ภาพ | ชุดข้อมูลสาธารณะ / public dataset | `docs/GATE.md` §3c |
| ลานจอดหรือหมู่บ้านจริง · a real car park or village | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง: ยังไม่มีโครงการนำร่อง / field | `docs/pilot/PILOT-GATE.md` |
| ภาพมือถือของเจ้าของ (~100 ภาพ) · owner phone photos | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง (ภาพของเจ้าของ) / field | `docs/field-pilot/plates-photo-labels.md` |
- เกณฑ์ที่เสนอ: อ่านถูกทั้งป้าย ≥ 95% กลางวัน ≥ 85% กลางคืน ไม่มีค่าผิดที่บันทึกโดยไม่มีใครเห็น ตัดสินด้วยขอบล่าง Wilson 95% และรายงานค่าเฉลี่ยธรรมดาคู่กัน
| ติดตั้งหน้างาน (มุมกล้อง แสง ตรวจความแม่นยำร่วมกัน) | 2,500 บาท/ครั้ง | 3,000–5,000 บาท/ครั้ง |
4. ตรวจความแม่นยำด้วยเมนูในหน้า · ตัดสินใจนำร่อง/ใช้งานต่อ
no emotion or lie detection, and no age / gender / expression models in customer builds. Measured: synthetic data (n = 140 scenes) plate found 97.1% and whole plate right from one frame 58% (`docs/GATE.md` §3b);
public dataset, real photos from Wikimedia Commons (labels v3 confirmed by the owner 2026-11-12): whole plate read right automatically 32% (7 / 22, 12 of them tuning photos, optimistic), the guard had to tap the box in 78% (25 / 32), plate-less photos
read automatically 0 / 19 (§3c). A real car park or village: not measured. Auto-open of a barrier is off by default. Approved prices excl. 7% VAT, pilot price: free 30-day trial (1 lane, 100 plates per day; beyond the free tier a licence is needed, enforced by contract from a date announced at least 30 days ahead and starting 30 days after the announcement, not by the product yet); village 490 THB per lane per month;
~~~~

#### docs/sales/DEMO-SCRIPT-GATE.md

~~~~text
> สถานะ (`docs/PAGE-STATUS.md`): `gate.html`, `parking.html`, `village.html` = พร้อมนำร่อง รปภ. ยืนยันทุกการอ่าน การหาป้ายในภาพจริงยังอ่อน
- สำรอง: ภาพหน้าจอตารางตัวเลขใน `gate.html` ส่วน "ตัวเลขที่วัดได้และที่มา"
| 6:30–8:00 | `gate.html` ส่วน "ตัวเลขที่วัดได้และที่มา" + เมนู "ตรวจความแม่นยำ" ในหน้า | อ่านตรง ๆ: "ข้อมูลจำลอง หาป้ายเจอ 97.1% (136 / 140) อ่านถูกทั้งป้ายจากภาพเดียว 58% (81 / 140) n = 140 ฉาก ภาพถ่ายจริงจากชุดข้อมูลสาธารณะ อ่านอัตโนมัติถูกทั้งป้าย 32% (7 / 22) ต้องแตะกรอบเอง 78% (25 / 32) ภาพที่ไม่มีป้ายแต่ถูกอ่านอัตโนมัติ 0 / 19 หน้างานจริง ยังไม่ได้วัด บนภาพจริงวันนี้ รปภ. ยังต้องแตะเองเกือบ 4 ใน 5 คัน จึงขายเป็นผู้ช่วย รปภ." | แถวตัวเลข + เมนูตรวจความแม่นยำ: กด ✓ ✗ ตัวอย่าง ดูค่ากลางวัน/กลางคืนและช่วงความเชื่อมั่น 95% | "ท่านรับได้หรือไม่ถ้ารปภ.ต้องแตะเองบ่อย" |
| 9:00–10:00 | `gate.html` ส่วนราคา | "ทดลองใช้ฟรี 30 วัน 1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน ราคานำร่อง หมู่บ้าน 490 บาทต่อเดือนต่อช่องทาง ลานจอด 790 บาท ติดตั้งหน้างาน 2,500 บาทต่อครั้ง ไม่รวม VAT 7% ไม่รวมอุปกรณ์ นำร่อง 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง ตัดสินด้วยขอบล่างช่วงความเชื่อมั่น 95%" | ตารางราคา (ราคาที่อนุมัติ) เกณฑ์ใน `docs/pilot/PILOT-GATE.md` §5 | "เริ่มทดลอง 30 วันได้เมื่อไร ใครติดป้าย PDPA" |
| อ่านป้ายตัวอย่าง ("ใช้ภาพตัวอย่าง" / "รถคันถัดไป") และเมนูตรวจความแม่นยำ | มีอยู่แล้ว (ป้ายวาดบนผืนผ้าใบ ไม่มีรถจริง) |
- ห้ามบอกความแม่นยำหน้างานจริงหรือกลางคืน (ยังไม่ได้วัด) ห้ามอ้าง "99%" ของผู้ขายกล้อง LPR รายอื่น ตัวเลขของเรามาจากข้อมูลจำลองและชุดข้อมูลสาธารณะเท่านั้น
> Status (`docs/PAGE-STATUS.md`): `gate.html`, `parking.html`, `village.html` = pilot-ready. A guard confirms every read; finding plates in real photos is still weak.
| 6:30–8:00 | `gate.html` figures + the on-page accuracy check | Read plainly. Synthetic data: plate found 97.1% (136 / 140), whole plate right from one frame 58% (81 / 140), n = 140 scenes. Real photos (public dataset): whole plate read right automatically 32% (7 / 22), the guard had to tap the box 78% (25 / 32), plate-less photos read automatically 0 / 19. Real gate or car park: not measured. On real photos today the guard still taps nearly 4 times in 5, so we sell an assistant. | The figure rows; press tick / cross on the accuracy check; day / night split and the 95% interval | Is a guard who taps often acceptable to you? |
| 9:00–10:00 | `gate.html` price | Free 30-day trial: 1 lane, 100 plates a day, 7-day log. Pilot price: village 490 THB per lane per month, car park 790 THB, on-site set-up 2,500 THB per visit, excl. 7% VAT, hardware not included. The pilot runs at least 5 days per site and at least 200 real reads, judged on the lower bound of a 95% interval. | Price table (approved list); thresholds in `docs/pilot/PILOT-GATE.md` §5 | When can the 30-day trial start? Who posts the PDPA sign? |
**Do NOT claim:** automatic reading, automatic barrier opening, or "LPR / ANPR that replaces the guard" (say: a guard's assistant, taps to confirm every vehicle); any field or night accuracy (not measured);
a competitor's "99%" (our numbers come only from synthetic data and public datasets); a model trained on Thai plates (none exists); reading plates at speed; face recognition or photographing the driver (not done);
~~~~

#### docs/sales/ONBOARDING-GATE.md

~~~~text
> ความแม่นยำหน้างานจริงยังไม่ได้วัด ตัวเลขในคู่มือนี้มาจากชุดข้อมูลสาธารณะหรือข้อมูลจำลอง (ที่มาใน `docs/ACCURACY-CLAIMS.md`)
| กลางคืน | ป้ายไทยสะท้อนแสง ใช้ไฟ IR 850 nm ใกล้เลนส์ ลดกำลังไฟหรือชัตเตอร์ถ้าป้ายสว่างจ้า ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
7. **เปิดเมนู "ตรวจความแม่นยำ"** ตั้งแต่วันแรก: รปภ. กด ✓ หรือ ✗ ทุกการอ่าน (การแก้ค่านับเป็น ✗) ระบบแยกกลางวัน/กลางคืนและแสดงช่วงความเชื่อมั่น 95%
9. **นำร่อง** (ถ้าสั่ง): อย่างน้อย 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง กลางคืน ≥ 40 มอเตอร์ไซค์ ≥ 30 ตัดสินด้วยขอบล่าง Wilson 95% (เป้าตาม `docs/pilot/PILOT-GATE.md` §5)
| ระบบหาป้ายไม่เจอ ต้องแตะกรอบเองบ่อย | ป้ายเล็กในภาพ มุมเกิน 30° เบลอ แสงย้อน | เข้าใกล้ ปรับมุม/ชัตเตอร์ ให้รถหยุด การหาป้ายในภาพจริงยังอ่อน (ภาพจริงสาธารณะ ต้องแตะเอง 78%) เป็นเรื่องปกติ รปภ. แตะกรอบหรือพิมพ์เอง |
| กลางคืนอ่านไม่ได้ | แสงไม่พอ ป้ายสว่างจ้างจากไฟ IR | เพิ่ม/ลดไฟ IR ตั้งชัตเตอร์ ตรวจแยกกลางคืนในเมนูตรวจความแม่นยำ |
> Accuracy at a real site has not been measured. Figures in this guide come from public datasets or synthetic data (sources in `docs/ACCURACY-CLAIMS.md`).
- **Night:** Thai plates are retro-reflective; use an 850 nm IR light near the lens; lower the power or exposure if the plate saturates; check the night result separately in the accuracy check.
7. Use the "accuracy check" from day one: the guard presses tick or cross on every read (an edited read counts as a cross); the page splits day and night and shows a 95% interval.
9. Pilot (if ordered): at least 5 days per site, at least 200 real reads, at least 40 at night, at least 30 motorcycles; judged on the lower bound of a 95% Wilson interval (targets in
| The plate is not found; the guard taps the box often | Small plate in the frame, angle over 30 degrees, blur, backlight | Move closer, adjust angle and shutter, make vehicles stop. Finding plates in real photos is still weak (public photos: the box had to be tapped 78%); this is normal; the guard taps or types |
| Cannot read at night | Too little light, or the plate saturates under IR | Raise or lower the IR light, set the shutter; check night separately in the accuracy check |
~~~~

#### docs/sales/customer/ONBOARDING-GATE.md

~~~~text
ความแม่นยำหน้างานจริงยังไม่ได้วัด (ยังไม่มีผลวัดภาคสนาม) ตัวเลขในคู่มือนี้มาจากชุดข้อมูลสาธารณะหรือข้อมูลจำลองเท่านั้น และระบุที่มากำกับไว้ทุกตัว
| กลางคืน | ป้ายไทยสะท้อนแสง ใช้ไฟ IR 850 nm ติดใกล้เลนส์ ลดกำลังไฟหรือชัตเตอร์ถ้าป้ายสว่างจ้า ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
7. **เปิดเมนู "ตรวจความแม่นยำ"** ตั้งแต่วันแรก: รปภ. กด ✓ หรือ ✗ ทุกการอ่าน (ถ้ามีการแก้ค่านับเป็น ✗) ระบบแยกกลางวันและกลางคืนและแสดงช่วงความเชื่อมั่น 95%
9. **นำร่อง** (ถ้าสั่ง): อย่างน้อย 5 วันต่อไซต์ อย่างน้อย 200 การอ่านจริง ในจำนวนนี้กลางคืนอย่างน้อย 40 และมอเตอร์ไซค์อย่างน้อย 30 ตัดสินด้วย **ขอบล่างของช่วงความเชื่อมั่น Wilson 95%** เป้าหมาย: กลางวันถูกต้องทั้งป้ายอย่างน้อย 95% กลางคืนอย่างน้อย 85%
| ระบบหาป้ายไม่เจอ ต้องแตะกรอบเองบ่อย | ป้ายเล็กในภาพ มุมเกิน 30° ภาพเบลอ แสงย้อน | เข้าใกล้ ปรับมุมและชัตเตอร์ ให้รถหยุด การหาป้ายในภาพจริงยังอ่อน (ภาพจริงจากชุดข้อมูลสาธารณะ ต้องแตะกรอบเอง 78%) เป็นเรื่องปกติ รปภ. แตะกรอบหรือพิมพ์เอง |
| กลางคืนอ่านไม่ได้ | แสงไม่พอ หรือป้ายสว่างจ้าจากไฟ IR | เพิ่มหรือลดไฟ IR ตั้งชัตเตอร์ ตรวจผลกลางคืนแยกในเมนูตรวจความแม่นยำ |
Accuracy at a real site has not been measured (there is no field measurement yet). Figures in this guide come only from public datasets or synthetic data, and each is labelled with its source.
- **Night:** Thai plates are retro-reflective; use an 850 nm IR light near the lens; lower the power or exposure if the plate saturates; check the night result separately in the accuracy check.
7. **Use the "accuracy check" from day one:** the guard presses tick or cross on every read (an edited read counts as a cross). The page splits day and night and shows a 95% interval.
9. **Pilot** (if ordered): at least 5 days per site and at least 200 real reads, of which at least 40 at night and at least 30 motorcycles, judged on the **lower bound of the 95% Wilson interval**. Targets: fully correct plates at least 95% by day and at least 85% at night.
| The plate is not found; the guard taps the box often | Small plate in the frame, angle over 30 degrees, blur, backlight | Move closer, adjust angle and shutter, make vehicles stop. Finding plates in real photos is still weak (real photos from a public dataset: the box had to be tapped 78% of the time); this is normal; the guard taps the box or types |
| Cannot read at night | Too little light, or the plate saturates under IR | Raise or lower the IR light, set the shutter; check night separately in the accuracy check |
真实现场的准确率尚未测量（目前没有现场测量结果）。本指南中的数字仅来自公开数据集或合成数据，并逐一标明来源。
- **夜间：** 泰国车牌是反光材质；请在镜头附近使用 850 nm 红外灯；如果车牌过曝，降低功率或曝光；在准确度检查中单独查看夜间结果。
7. **从第一天起使用“准确度检查”：** 保安对每次识别点击对勾或叉号（被修改过的识别记为叉号）。页面分开显示白天和夜间，并给出 95% 区间。
9. **试点**（如订购）：每个场所至少 5 天，至少 200 次真实识别，其中夜间至少 40 次、摩托车至少 30 次，以 **威尔逊（Wilson）95% 区间的下限**来判定。目标：整牌完全正确率白天至少 95%，夜间至少 85%。
| 找不到车牌，保安需要经常自己点击车牌框 | 画面中车牌小、角度超过 30°、模糊、逆光 | 靠近一些，调整角度和快门，让车辆停下。在真实照片中查找车牌的能力仍然较弱（公开数据集的真实照片：78% 需要手动点击车牌框）；这是正常的；保安点击车牌框或手动输入 |
| 夜间无法识别 | 光线不足，或车牌在红外灯下过曝 | 调高或调低红外灯，设置快门；在准确度检查中单独查看夜间结果 |
~~~~

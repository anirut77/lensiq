# Attendance: ลงเวลาทำงาน (PIN/QR, สแกนใบหน้าเป็นทางเลือก) — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: attendance.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- ลงเวลาทำงานด้วย PIN หรือ QR บนเครื่องของร้าน ไม่ต้องใช้กล้อง สแกนใบหน้าเป็นทางเลือกเฉพาะพนักงานที่ยินยอม
- แบบสแกนใบหน้าบางครั้งต้องสแกนซ้ำหรือให้หัวหน้ายืนยัน และกันภาพปลอมได้ไม่ครบ จึงควรมีคนดูแลจุดลงเวลา

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ตัวเลขใน docs/accuracy-figures.json

- `lfwRec100`: ค่า **85** (ค่าดิบ 85) — faces, LFW, 100 enrolled, round 5: member recognised — หลักฐานใน `ACCURACY.md`: `| 100 | 84.9% → 85.0% |`
- `casiaRecLo`: ค่า **66** (ค่าดิบ 66.4) — faces, CASIA (Asian), 200 enrolled: member recognised — หลักฐานใน `ACCURACY.md`: `| 200 | 52.0% → **66.4%**`
- `casiaRecHi`: ค่า **76** (ค่าดิบ 75.6) — faces, CASIA (Asian), 5 enrolled: member recognised — หลักฐานใน `ACCURACY.md`: `| 5 | 57.4% → **75.6%**`
- `lfwStr100`: ค่า **0.4** (ค่าดิบ 0.42) — faces, LFW, 100 enrolled: stranger offered a name — หลักฐานใน `ACCURACY.md`: `0.89% → **0.42%**`
- `casiaStr100`: ค่า **0.2** (ค่าดิบ 0.18) — faces, CASIA, 100 enrolled: stranger offered a name — หลักฐานใน `ACCURACY.md`: `3.13% → **0.18%**`
- `strangerCiHi`: ค่า **1.15** (ค่าดิบ 1.15) — faces, CASIA: upper end of the 95% interval at 5 and 200 enrolled — หลักฐานใน `ACCURACY.md`: `(1.15% for both)`
- `lfwAuto100`: ค่า **0.05** (ค่าดิบ 0.05) — faces, LFW (tuning set), 100 enrolled: strangers checked in with no person confirming — หลักฐานใน `ACCURACY.md`: `| 100 | 84.9% → 85.0% | 57.3% | 0.89% → **0.42%** [0.27–0.60%] | 1,809 (36) | 0.05% [0.01–0.12%] |`
- `casiaAutoMax`: ค่า **0.03** (ค่าดิบ 0.03) — faces, CASIA (held out), 5–200 enrolled: highest rate of strangers checked in with no person confirming — หลักฐานใน `ACCURACY.md`: `| 0.03% [0.00–0.07%] | [0.7–1.1%] |`
- `confirmShare`: ค่า **25–35** — faces: share of recognised members asked to confirm — หลักฐานใน `ACCURACY.md`: `About 25–35% of recognised members on LFW`
- `minEnrol`: ค่า **5** (ค่าดิบ 5) — faces: minimum group for automatic check-in — หลักฐานใน `ACCURACY.md`: `Enrol at least 5 people before relying on automatic check-in.`

### ข้อความตัวเลขเดิมบนหน้าเว็บ (สร้างจาก docs/accuracy-figures.json)

- `attendance.s5` (attendance.html)
  - ทดสอบกับภาพใบหน้าสาธารณะ (ภาพข่าว LFW และใบหน้าเอเชีย CASIA-FaceV5 ไม่ใช่กล้องหน้างาน) ด้วยกฎปัจจุบัน ผู้ลงทะเบียน 100 คน: จำผู้ลงทะเบียนได้ราว 85% ต่อการสแกน แต่ใบหน้าเอเชียเพียงราว 66–76% · คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อราว 0.4% (ใบหน้าเอเชีย 0.2% ขอบบนของช่วงความเชื่อมั่นถึง 1.15%) และถูกเช็คชื่ออัตโนมัติราว 0.05% (LFW) ระบบต้องเห็นตรงกัน 2 ครั้งก่อนบันทึก และราว 25–35% ของคนที่จำได้จะถูกขอให้กดยืนยัน ลงทะเบียนอย่างน้อย 5 คนก่อนใช้เช็คชื่ออัตโนมัติ และควรให้เจ้าหน้าที่ตรวจรายชื่อ
- `cameras.s195` (cameras.html)
  - กฎรอบ 5 (เกณฑ์ปรับตามกลุ่ม ลงทะเบียน 3 ท่า ยืนยัน 2 เฟรม ขอให้กดยืนยันเมื่อไม่แน่ใจ) 100 คน: LFW จำได้ 85% คนนอกถูกเสนอชื่อ 0.4% · ใบหน้าเอเชีย (CASIA ทดสอบแยก) 5–200 คน จำได้ 66–76% คนนอกถูกเสนอชื่อ 0.2% ที่ 100 คน (ขอบบนช่วงความเชื่อมั่นถึง 1.15%) เช็คชื่ออัตโนมัติไม่เกิน 0.03% (LFW ราว 0.05%) — การจำใบหน้าเอเชียยังต่ำ
- `cameras.s198` (cameras.html)
  - ใช้กฎเดียวกับเช็คชื่อ: LFW 100 คน จำได้ 85% คนนอกถูกเสนอชื่อ 0.4% (เลือกให้อัตโนมัติราว 0.05%) · ใบหน้าเอเชีย จำได้ 66–76%
- `cameras.s217` (cameras.html)
  - กฎรอบ 5: เกณฑ์ปรับตามระยะห่างของใบหน้าในกลุ่มที่ลงทะเบียน (ใบหน้าเอเชียได้เกณฑ์เข้มขึ้นเอง) ตรวจคุณภาพภาพ ยืนยัน 2 เฟรม ลงทะเบียน 3 ท่า และขอให้กดยืนยันเมื่อไม่แน่ใจ คนนอกถูกเสนอชื่อราว 1% หรือน้อยกว่าทุกขนาดกลุ่ม 5–200 คน แต่ใบหน้าเอเชียจำได้เพียง 66–76% · คำแนะนำเดิมเรื่องจำนวนผู้ลงทะเบียนสูงสุดถูกยกเลิกแล้ว เพราะกลุ่มเล็กต่างหากที่เสี่ยงกว่า: ลงทะเบียนอย่างน้อย 5 คนก่อนใช้เช็คชื่ออัตโนมัติ คงการกดยืนยันไว้ และลงทะเบียนคนเดิมใหม่ด้วย 3 ท่า
- `attendance.lic` (attendance.html)
  - ใบหน้าวิเคราะห์ด้วยโมเดล face-api.js (โค้ด MIT) ที่ฝึกจากชุดข้อมูลซึ่งอนุญาตเฉพาะงานวิจัย สิทธิ์ใช้เชิงพาณิชย์ยังไม่ได้รับการยืนยันจากนักกฎหมาย — ตรวจสิทธิ์ก่อนใช้งานเชิงพาณิชย์
- `attendance.licb` (attendance.html)
  - โมเดลใบอนุญาตวิจัย

### ทะเบียนคำอ้าง (docs/ACCURACY-CLAIMS.md ข้อ 4)

- **A1** `attendance.cl1` (attendance.html) · ตัวเลข: 85%; 13,233 · n: n = 610 · ป้าย: public; tuning; optimistic · หลักฐาน: ACCURACY.md
  - จำผู้ลงทะเบียนได้ต่อการสแกน (ลงทะเบียน 100 คน) วัดบนชุดที่ใช้ปรับค่า ตัวเลขจึงดีเกินจริง: 85% · n = 610 ภาพทดสอบของสมาชิก (คนละ 1 ภาพ สมาชิก 100 คนต่อกลุ่ม สุ่ม 200 กลุ่ม ทั้งชุดข้อมูลมี 13,233 ภาพ) · ที่มา: ชุดข้อมูลสาธารณะ (LFW ภาพข่าว ชุดที่ใช้ปรับค่า)
- **A2** `attendance.cl2` (attendance.html) · ตัวเลข: 66–76% · n: n = 500 · ป้าย: public · หลักฐาน: ACCURACY.md
  - ตัวเลขหลัก: ใบหน้าเอเชีย จำได้ต่อการสแกน (ลงทะเบียน 5 / 20 / 200 คน): 66–76% · n = 500 คน × 5 ภาพ (ชุดทดสอบแยก ไม่ได้ใช้ตอนตั้งค่า) · ที่มา: ชุดข้อมูลสาธารณะ (CASIA-FaceV5)
- **A3** `attendance.cl3` (attendance.html) · ตัวเลข: 0.4%; 0.2%; 0.04–0.45%; 1.15% · n: n = 12,000 · ป้าย: public; tuning · หลักฐาน: ACCURACY.md
  - คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อ: ใบหน้าเอเชีย (ชุดทดสอบแยก ลงทะเบียน 100 คน) 0.2% ช่วงความเชื่อมั่น 95% 0.04–0.45% (ขอบบนสูงสุด 1.15% ที่ลงทะเบียน 5 หรือ 200 คน) · LFW (ชุดที่ใช้ปรับค่า) 0.4% · n = 12,000 (โดยประมาณ) ครั้งต่อแถว จากคนราว 1,800 / 500 คน · ที่มา: ชุดข้อมูลสาธารณะ (LFW, CASIA-FaceV5)
- **A4** `attendance.cl4` (attendance.html) · ตัวเลข: 0.03%; 0.01–0.07% · n: n = 12,000; 1,800 / 500 · ป้าย: public; tuning · หลักฐาน: ACCURACY.md
  - คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน: ใบหน้าเอเชีย (ชุดทดสอบแยก) ≤ 0.03% · LFW (ชุดที่ใช้ปรับค่า) 0.01–0.07% · n = 12,000 (โดยประมาณ) ครั้งต่อแถว จากคนราว 1,800 / 500 คน · ที่มา: ชุดข้อมูลสาธารณะ (LFW, CASIA-FaceV5)
- **A5** `attendance.cl5` (attendance.html) · ตัวเลข: — · n: — · ป้าย: notmeasured; field · หลักฐาน: ACCURACY.md
  - ที่ทำงานจริงในไทย: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง) — ใช้แท็บ “ตรวจความแม่นยำ” วัดกับพนักงานของคุณเอง
- **A6** `attendance.cl6` (attendance.html) · ตัวเลข: — · n: — · ป้าย: notmeasured · หลักฐาน: ACCURACY.md
  - ตัวเลือกตรวจว่าเป็นคนจริง (หันหน้า): ยังไม่ได้วัด

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.face` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: docs/ACCURACY-CLAIMS.md A2, A1, A3 (ACCURACY.md §2)
  - TH: จดจำสมาชิกได้ 66–76% บนใบหน้าเอเชีย (CASIA ลงทะเบียน 5–200 คน · n = 500 คน ชุดทดสอบแยก) และ 85% บน LFW (ลงทะเบียน 100 คน · n = 610 ภาพทดสอบ ชุดที่ใช้ปรับค่า ดีเกินจริง) คนแปลกหน้าถูกเสนอชื่อ 0.2% (CASIA 100 คน · n = ประมาณ 12,000 ครั้ง) คนยืนยันเมื่อไม่แน่ใจ
  - EN: Members recognised in 66–76% on Asian faces (CASIA, 5–200 enrolled · n = 500 people, held out) and 85% on LFW (100 enrolled · n = 610 probe photos, tuning set, optimistic); a stranger is offered a name in 0.2% (CASIA, 100 enrolled · n = about 12,000 visits). A person confirms when unsure
  - 中文: 亚洲人脸会员识别率 66–76%（CASIA，登记 5–200 人 · n = 500 人，留出集），LFW 为 85%（登记 100 人 · n = 610 张测试照片，调参集，偏乐观）；陌生人被提示姓名 0.2%（CASIA，100 人 · n = 约 12,000 次）。不确定时由人确认
- `cat.c.attPin` · ที่มา: na (ไม่เกี่ยวข้อง) · อ้างอิง: docs/ATTENDANCE-READINESS.md
  - TH: PIN และ QR (ค่าเริ่มต้น) ไม่ใช้กล้องตัดสิน จึงไม่มีตัวเลขความแม่นยำ
  - EN: PIN and QR (the default) do not use the camera to decide, so no accuracy figure applies
  - 中文: PIN 与二维码（默认）不靠摄像头判定，因此不适用准确率
- `cat.r.attendance`
  - TH: PIN/QR เป็นค่าเริ่มต้น ใบหน้าเป็นทางเลือกเมื่อยินยอม มีตัวเลขจากชุดข้อมูลสาธารณะและเครื่องมือตรวจหน้างาน สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป
  - EN: PIN/QR by default, face optional with consent; public-dataset numbers and an on-site check exist; the face-model licence is still open
  - 中文: 默认 PIN/二维码，人脸需同意后可选；有公开数据集数据与现场检查；人脸模型许可仍待确定

## ข้อจำกัดที่รู้

- PIN/QR ไม่ใช้กล้อง สแกนใบหน้าเฉพาะพนักงานที่ยินยอม
- สแกนใบหน้าไม่ได้กันภาพปลอมทุกแบบ ควรมีคนดูจุดลงเวลา
- ยังไม่มีผลวัดในที่ทำงานจริง ตัวเลขด้านบนมาจากภาพใบหน้าสาธารณะ

## สัญญาอนุญาต

- face-api.js (โค้ด MIT) โมเดลจดจำใบหน้าจาก dlib (CC0) ฝึกจากชุดข้อมูลเชิงวิชาการ: F5/F6 ใน LICENSES/THIRD_PARTY.md
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### attendance.html

~~~~text
[attendance.s4] ความแม่นยำที่วัดได้
[attendance.s5] ทดสอบกับภาพใบหน้าสาธารณะ (ภาพข่าว LFW และใบหน้าเอเชีย CASIA-FaceV5 ไม่ใช่กล้องหน้างาน) ด้วยกฎปัจจุบัน ผู้ลงทะเบียน 100 คน: จำผู้ลงทะเบียนได้ราว 85% ต่อการสแกน แต่ใบหน้าเอเชียเพียงราว 66–76% · คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อราว 0.4% (ใบหน้าเอเชีย 0.2% ขอบบนของช่วงความเชื่อมั่นถึง 1.15%) และถูกเช็คชื่ออัตโนมัติราว 0.05% (LFW) ระบบต้องเห็นตรงกัน 2 ครั้งก่อนบันทึก และราว 25–35% ของคนที่จำได้จะถูกขอให้กดยืนยัน ลงทะเบียนอย่างน้อย 5 คนก่อนใช้เช็คชื่ออัตโนมัติ และควรให้เจ้าหน้าที่ตรวจรายชื่อ
[attendance.s6] วิธีวัดและข้อจำกัด
[attendance.cl.h] ตัวเลขและที่มา
[attendance.cl2] ตัวเลขหลัก: ใบหน้าเอเชีย จำได้ต่อการสแกน (ลงทะเบียน 5 / 20 / 200 คน): 66–76% · n = 500 คน × 5 ภาพ (ชุดทดสอบแยก ไม่ได้ใช้ตอนตั้งค่า) · ที่มา: ชุดข้อมูลสาธารณะ (CASIA-FaceV5)
[attendance.cl1] จำผู้ลงทะเบียนได้ต่อการสแกน (ลงทะเบียน 100 คน) วัดบนชุดที่ใช้ปรับค่า ตัวเลขจึงดีเกินจริง: 85% · n = 610 ภาพทดสอบของสมาชิก (คนละ 1 ภาพ สมาชิก 100 คนต่อกลุ่ม สุ่ม 200 กลุ่ม ทั้งชุดข้อมูลมี 13,233 ภาพ) · ที่มา: ชุดข้อมูลสาธารณะ (LFW ภาพข่าว ชุดที่ใช้ปรับค่า)
[attendance.cl3] คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อ: ใบหน้าเอเชีย (ชุดทดสอบแยก ลงทะเบียน 100 คน) 0.2% ช่วงความเชื่อมั่น 95% 0.04–0.45% (ขอบบนสูงสุด 1.15% ที่ลงทะเบียน 5 หรือ 200 คน) · LFW (ชุดที่ใช้ปรับค่า) 0.4% · n = 12,000 (โดยประมาณ) ครั้งต่อแถว จากคนราว 1,800 / 500 คน · ที่มา: ชุดข้อมูลสาธารณะ (LFW, CASIA-FaceV5)
[attendance.cl4] คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน: ใบหน้าเอเชีย (ชุดทดสอบแยก) ≤ 0.03% · LFW (ชุดที่ใช้ปรับค่า) 0.01–0.07% · n = 12,000 (โดยประมาณ) ครั้งต่อแถว จากคนราว 1,800 / 500 คน · ที่มา: ชุดข้อมูลสาธารณะ (LFW, CASIA-FaceV5)
[attendance.cl5] ที่ทำงานจริงในไทย: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง) — ใช้แท็บ “ตรวจความแม่นยำ” วัดกับพนักงานของคุณเอง
[attendance.cl6] ตัวเลือกตรวจว่าเป็นคนจริง (หันหน้า): ยังไม่ได้วัด
[attendance.sc1] ตรวจความแม่นยำ
[attendance.live2] กันการยกภาพถ่ายนิ่งมาสแกนได้ระดับหนึ่ง แต่ไม่กันวิดีโอ ภาพบนจอ หรือหน้ากาก และยังไม่ได้วัดความแม่นยำ ควรมีเจ้าหน้าที่ดูแลจุดเช็คชื่อเสมอ
[attendance.s40] เว็บตัวอย่าง: ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น ค่าลักษณะใบหน้าเข้ารหัสด้วยกุญแจที่อยู่ในเบราว์เซอร์นี้ มีตัวเลือกให้หันหน้าเพื่อตรวจว่าเป็นคนจริง (ปิดไว้เป็นค่าเริ่มต้น ยังไม่ได้วัดผล) แต่ยังไม่มีระบบกันภาพปลอมที่ผ่านการทดสอบ หากใช้งานจริงควรมีฐานข้อมูลฝั่งเซิร์ฟเวอร์ และนโยบายตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)
~~~~

#### cameras.html

~~~~text
[cameras.s193] LFW เต็มชุด (ปรับค่า) + CASIA-FaceV5 ใบหน้าเอเชีย 500 คน (ทดสอบแยก) · ผู้ลงทะเบียน 20–200 คน
[cameras.s195] กฎรอบ 5 (เกณฑ์ปรับตามกลุ่ม ลงทะเบียน 3 ท่า ยืนยัน 2 เฟรม ขอให้กดยืนยันเมื่อไม่แน่ใจ) 100 คน: LFW จำได้ 85% คนนอกถูกเสนอชื่อ 0.4% · ใบหน้าเอเชีย (CASIA ทดสอบแยก) 5–200 คน จำได้ 66–76% คนนอกถูกเสนอชื่อ 0.2% ที่ 100 คน (ขอบบนช่วงความเชื่อมั่นถึง 1.15%) เช็คชื่ออัตโนมัติไม่เกิน 0.03% (LFW ราว 0.05%) — การจำใบหน้าเอเชียยังต่ำ
[cameras.s198] ใช้กฎเดียวกับเช็คชื่อ: LFW 100 คน จำได้ 85% คนนอกถูกเสนอชื่อ 0.4% (เลือกให้อัตโนมัติราว 0.05%) · ใบหน้าเอเชีย จำได้ 66–76%
[cameras.s217] กฎรอบ 5: เกณฑ์ปรับตามระยะห่างของใบหน้าในกลุ่มที่ลงทะเบียน (ใบหน้าเอเชียได้เกณฑ์เข้มขึ้นเอง) ตรวจคุณภาพภาพ ยืนยัน 2 เฟรม ลงทะเบียน 3 ท่า และขอให้กดยืนยันเมื่อไม่แน่ใจ คนนอกถูกเสนอชื่อราว 1% หรือน้อยกว่าทุกขนาดกลุ่ม 5–200 คน แต่ใบหน้าเอเชียจำได้เพียง 66–76% · คำแนะนำเดิมเรื่องจำนวนผู้ลงทะเบียนสูงสุดถูกยกเลิกแล้ว เพราะกลุ่มเล็กต่างหากที่เสี่ยงกว่า: ลงทะเบียนอย่างน้อย 5 คนก่อนใช้เช็คชื่ออัตโนมัติ คงการกดยืนยันไว้ และลงทะเบียนคนเดิมใหม่ด้วย 3 ท่า
[cameras.s219] วิธีวัด ตารางเต็ม และสัญญาอนุญาตของชุดข้อมูล อยู่ในไฟล์ ACCURACY.md ของโปรเจกต์ (สคริปต์วัดซ้ำได้ใน tests/bench) ชุดข้อมูลใช้เพื่อการประเมินเท่านั้น ไม่ได้รวมไว้ในโปรแกรม: MOTChallenge (CC BY-NC-SA 3.0), LFW และ CASIA-FaceV5 (เพื่อการวิจัย), UTKFace (วิจัยที่ไม่ใช่เชิงพาณิชย์), HaGRID (CC BY-SA 4.0), Open/Closed Eyes (ODC-BY), CEW และ FER-2013 (เพื่อการวิจัย) — ขวดและบาร์โค้ดเป็นภาพจำลองที่สร้างเอง
[cameras.s192] เช็คชื่อด้วยใบหน้า
~~~~

#### cat-hr.html

~~~~text
[cat.c.face] จดจำสมาชิกได้ 66–76% บนใบหน้าเอเชีย (CASIA ลงทะเบียน 5–200 คน · n = 500 คน ชุดทดสอบแยก) และ 85% บน LFW (ลงทะเบียน 100 คน · n = 610 ภาพทดสอบ ชุดที่ใช้ปรับค่า ดีเกินจริง) คนแปลกหน้าถูกเสนอชื่อ 0.2% (CASIA 100 คน · n = ประมาณ 12,000 ครั้ง) คนยืนยันเมื่อไม่แน่ใจ
[cat.r.attendance] PIN/QR เป็นค่าเริ่มต้น ใบหน้าเป็นทางเลือกเมื่อยินยอม มีตัวเลขจากชุดข้อมูลสาธารณะและเครื่องมือตรวจหน้างาน สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป
~~~~

#### cat-marketing.html

~~~~text
[cat.c.face] จดจำสมาชิกได้ 66–76% บนใบหน้าเอเชีย (CASIA ลงทะเบียน 5–200 คน · n = 500 คน ชุดทดสอบแยก) และ 85% บน LFW (ลงทะเบียน 100 คน · n = 610 ภาพทดสอบ ชุดที่ใช้ปรับค่า ดีเกินจริง) คนแปลกหน้าถูกเสนอชื่อ 0.2% (CASIA 100 คน · n = ประมาณ 12,000 ครั้ง) คนยืนยันเมื่อไม่แน่ใจ
~~~~

#### hr.html

~~~~text
[pd.h.cl3] เช็คชื่อด้วยใบหน้า: ใบหน้าเอเชีย จำได้ 66–76% ต่อการสแกน · n = 500 คน × 5 ภาพ (CASIA-FaceV5 ชุดทดสอบแยก) · LFW 85% (ชุดที่ใช้ปรับค่า ตัวเลขจึงดีเกินจริง) · n = 610 ภาพทดสอบของสมาชิก (ทั้งชุดข้อมูล 13,233 ภาพ) · ที่มา: ชุดข้อมูลสาธารณะ
~~~~

#### solutions.html

~~~~text
[sl.c.edu2.p] ลงทะเบียนใบหน้าครั้งเดียวแล้วสแกนเพื่อบันทึกการเข้าเรียน มีตัวเลือกให้หันหน้าเพื่อตรวจว่าเป็นคนจริง (ปิดไว้เป็นค่าเริ่มต้นและยังไม่ได้วัด) ส่งออกรายชื่อ CSV และตั้งระยะเวลาลบข้อมูลใบหน้า
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### attendance.js

~~~~text
(เสนอชื่อถูก {a}%, ช่วงความเชื่อมั่น {b}–{c}%)
ตรวจความแม่นยำหน้างาน
~~~~

#### docs/ONE-PAGER-ATTENDANCE.md

~~~~text
รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)
| ตัวเลขหลัก: ใบหน้าเอเชีย จำได้ต่อการสแกน (ลงทะเบียน 5 / 20 / 200 คน) | 66–76% | n = 500 คน × 5 ภาพ (ชุดทดสอบแยก แต่ไม่ได้ปิดตาสมบูรณ์ ตามที่ `ACCURACY.md` เปิดเผย) | ชุดข้อมูลสาธารณะ (CASIA-FaceV5) | `ACCURACY.md` ข้อ 2 |
| จำผู้ลงทะเบียนได้ต่อการสแกน (ลงทะเบียน 100 คน) วัดบนชุดที่ใช้ปรับค่า ตัวเลขจึงดีเกินจริง | 85% (ชุดที่ใช้ปรับค่า ดีเกินจริง) | n = 610 ภาพทดสอบของสมาชิก (1 ภาพต่อคน; กลุ่มละ 100 คน สุ่ม 200 กลุ่ม) | ชุดข้อมูลสาธารณะ (LFW) | `ACCURACY.md` ข้อ 2 |
| คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อ | ใบหน้าเอเชีย (ชุดทดสอบแยก ลงทะเบียน 100 คน) 0.2% [0.04–0.45%] ขอบบน 95% สูงสุด 1.15% ที่ลงทะเบียน 5 หรือ 200 คน · LFW (ชุดที่ใช้ปรับค่า) 0.4% | n = ประมาณ 12,000 ครั้งต่อแถว (คนต่างกันราว 1,800 / 500 คน) | ชุดข้อมูลสาธารณะ | `ACCURACY.md` ข้อ 2 |
| คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน | ใบหน้าเอเชีย (ชุดทดสอบแยก) ≤ 0.03% · LFW (ชุดที่ใช้ปรับค่า) 0.01–0.07% | n = ประมาณ 12,000 ครั้งต่อแถว (คนต่างกันราว 1,800 / 500 คน) | ชุดข้อมูลสาธารณะ | `ACCURACY.md` ข้อ 2 |
| ตัวเลือกตรวจว่าเป็นคนจริง (หันหน้า) | ยังไม่ได้วัด | — | ยังไม่ได้วัด | `ACCURACY.md` |
| ที่ทำงานจริงในไทย | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `ACCURACY.md` |
2 สัปดาห์ที่ร้านหรือบริษัท 5–20 คน ตาม `docs/PILOT-PLAN.md` ข้อ 3.2 (ใบหน้าเฉพาะอาสาสมัครที่ยินยอม: รับคนผิด ≤ 1%, ปฏิเสธคนถูก ≤ 10%)
และเทียบ CSV เงินเดือนกับบันทึกเดิมของร้าน 1 รอบเดือน (ชั่วโมงและ OT ตรงกัน) ใช้แท็บ "ตรวจความแม่นยำ" ในหน้าเพื่อวัดกับพนักงานของคุณเอง
| Headline: Asian faces recognised per scan (5 / 20 / 200 enrolled) | 66–76% | n = 500 people × 5 photos (held out, not perfectly blind: `ACCURACY.md` disclosure) | public dataset (CASIA-FaceV5) | `ACCURACY.md` §2 |
| Enrolled person recognised per scan, 100 enrolled, measured on the tuning set | 85% (tuning set, optimistic) | n = 610 member probe photos (one per member; 100 per group, 200 random groups) | public dataset (LFW) | `ACCURACY.md` §2 |
| Stranger offered a name | Asian (held out, 100 enrolled) 0.2% [0.04–0.45%], upper 95% bound up to 1.15% at 5 or 200 enrolled; LFW (tuning set) 0.4% | n = about 12,000 stranger visits per row (about 1,800 / 500 different people) | public dataset | `ACCURACY.md` §2 |
| Stranger checked in with no confirmation | Asian (held out) ≤ 0.03%; LFW (tuning set) 0.01–0.07% | n = about 12,000 per row | public dataset | `ACCURACY.md` §2 |
| Liveness (head-turn) option | not measured | — | not measured | `ACCURACY.md` |
| A real Thai workplace | not measured | — | field: not measured (no pilot yet) | `ACCURACY.md` |
- Face check-in only with consenting volunteers: false accept ≤ 1%, false reject ≤ 10%.
| ลงเวลาด้วย PIN / QR | ไม่มีตัวเลขความแม่นยำ (ไม่มีการจดจำ) | — | ไม่เกี่ยวข้อง | `docs/ATTENDANCE-READINESS.md` |
| PIN / QR check-in | no accuracy figure (no recognition) | — | not applicable | `docs/ATTENDANCE-READINESS.md` |
~~~~

#### docs/sales/DECK-ATTENDANCE.md

~~~~text
> **ร่าง (DRAFT) 2026-11-11** สร้างจาก `docs/ONE-PAGER-ATTENDANCE.md` ใช้เฉพาะตัวเลขที่วัดแล้ว แต่ละตัวมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) และไฟล์อ้างอิง
> จาก `docs/ACCURACY-CLAIMS.md` (ทะเบียน A1–A6) และ `ACCURACY.md` §2 ถ้าไม่ได้วัด เขียนว่า "ยังไม่ได้วัด"
- สถานะ: พร้อมนำร่อง (ใบหน้ารอข้อสรุปใบอนุญาตโมเดล)
- ใบหน้าเป็นข้อมูลชีวภาพ (PDPA ม.26) ต้องมีความยินยอมโดยชัดแจ้ง ข้อความกฎหมายแรงงานและ PDPA รอทนายตรวจก่อนขาย (OP-24)
*Measured accuracy (only if the face option is on)*
| ตัวเลขหลัก: ใบหน้าเอเชีย จำได้ต่อการสแกน (ลงทะเบียน 5 / 20 / 200 คน) · Asian faces recognised per scan | **66–76%** | n = 500 คน × 5 ภาพ (ชุดทดสอบแยก แต่ไม่ปิดตาสมบูรณ์ / held out, not perfectly blind) | ชุดข้อมูลสาธารณะ (CASIA-FaceV5) / public dataset | `ACCURACY.md` §2 (A2) |
| คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน · stranger checked in with no confirmation | ใบหน้าเอเชีย (ชุดทดสอบแยก) ≤ 0.03% | n ≈ 12,000 ครั้งต่อแถว (คนต่างกันราว 1,800 / 500 คน) | ชุดข้อมูลสาธารณะ / public dataset | `ACCURACY.md` §2 (A4) |
| คนที่ไม่ได้ลงทะเบียนถูกเสนอชื่อ · stranger offered a name | 0.2% [0.04–0.45%] ขอบบน 95% สูงสุด 1.15% | n ≈ 12,000 ครั้ง | ชุดข้อมูลสาธารณะ / public dataset | `ACCURACY.md` §2 (A3) |
| ที่ทำงานจริงในไทย · a real Thai workplace | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง: ยังไม่มีโครงการนำร่อง / field | `ACCURACY.md` (A5) |
| ตัวเลือกตรวจว่าเป็นคนจริง (หันหน้า) · liveness option | **ยังไม่ได้วัด / not measured** | — | ยังไม่ได้วัด | `ACCURACY.md` (A6) |
- อย่าใช้ตัวเลข 85% (ลงทะเบียน 100 คน, LFW) เป็นตัวเลขหลัก: วัดบนชุดที่ใช้ปรับค่า (n = 610 ภาพทดสอบ) ดีเกินจริง (A1)
- ถ้าเปิดใบหน้า (เฉพาะอาสาสมัครที่ยินยอม): เกณฑ์รับคนผิด ≤ 1% ปฏิเสธคนถูก ≤ 10% วัดด้วยแท็บ "ตรวจความแม่นยำ" กับพนักงานของคุณเอง ผลเป็นตัวเลข "หน้างานจริง"
are included; no wage, tax or social-security calculation, no cloud sync, no rotating rosters. Measured (face option only; PIN / QR has no recognition error): Asian faces recognised per scan 66–76%
(n = 500 people x 5 photos, public dataset CASIA-FaceV5, held out but not perfectly blind, `ACCURACY.md` §2); strangers checked in with no confirmation at most 0.03% (n about 12,000 visits per row, public dataset).
Not measured: a real workplace, the liveness option. Approved prices excl. 7% VAT, pilot price: free up to 5 people (beyond that a licence is needed, enforced by contract from a date announced at least 30 days ahead and starting 30 days after the announcement, not by the product yet); 19 THB per active person per month (minimum 190 THB per month); set-up help 2,900 THB one-off.
# สไลด์ขาย: LENSIQ Attendance (9 สไลด์) / Sales deck: LENSIQ Attendance
~~~~

#### docs/sales/DEMO-SCRIPT-ATTENDANCE.md

~~~~text
> สถานะ (`docs/PAGE-STATUS.md`): `attendance.html` = พร้อมนำร่อง (PIN/QR เป็นค่าเริ่มต้น ใบหน้ารอสรุปใบอนุญาตโมเดล OP-14)
| 9:00–9:45 | `attendance.html` ส่วน "ตัวเลขและที่มา" | ถ้าลูกค้าถามใบหน้า: "ใบหน้าเป็นตัวเลือก ใช้เมื่อพนักงานยินยอม ใบหน้าเอเชีย จำได้ต่อการสแกน 66–76% (n = 500 คน × 5 ภาพ ชุดข้อมูลสาธารณะ CASIA ชุดทดสอบแยกแต่ไม่ปิดตาสมบูรณ์) คนที่ไม่ได้ลงทะเบียนถูกเช็คชื่ออัตโนมัติโดยไม่มีคนยืนยัน ≤ 0.03% ที่ทำงานจริงในไทย ยังไม่ได้วัด การหันหน้ายืนยันคนจริง ยังไม่ได้วัด PIN/QR ไม่มีความคลาดเคลื่อนจากการจดจำ" | แถว A2 A4 A5 A6 ป้าย "โมเดลใบอนุญาตวิจัย" (รอความเห็นทางกฎหมายก่อนขายเชิงพาณิชย์ OP-14) | "พนักงานจะยินยอมใช้ใบหน้าหรือไม่ หรือ PIN/QR เพียงพอ" |
- ห้ามบอกความแม่นยำของใบหน้า "ที่ทำงานจริง" (ยังไม่ได้วัด) ห้ามบอก 85% (เป็นตัวเลขชุดที่ใช้ปรับค่า ดีเกินจริง) เป็นตัวเลขหลัก ตัวเลขหลักคือ 66–76% ใบหน้าเอเชีย
- ห้ามบอกว่ากัน "ลงเวลาแทนกัน" ได้ (PIN และบัตรแชร์ได้ ไม่มีภาพตอนลงเวลาโดยตั้งใจ ตัวเลือกหันหน้ายังไม่ได้วัด)
- ห้ามบอกว่าถูกต้องตามกฎหมายแรงงานหรือ PDPA ครบ (รอทนายแรงงานและทนายข้อมูลส่วนบุคคล) ห้ามบอกว่าใช้ใบหน้าเชิงพาณิชย์ได้แล้ว (รอข้อสรุปใบอนุญาตโมเดล)
> Status (`docs/PAGE-STATUS.md`): `attendance.html` = pilot-ready (PIN / QR default; the face option waits for the model-licence decision, OP-14).
| 9:00–9:45 | `attendance.html`, "Figures and sources" | Only if asked about faces: the face is optional and used only with consent. Asian faces recognised per scan 66–76% (n = 500 people x 5 photos, public dataset CASIA; held-out but not perfectly blind). Strangers auto-checked-in with no confirmation: at most 0.03%. A real Thai workplace: not measured. The head-turn liveness option: not measured. PIN / QR has no recognition error. | Rows A2, A4, A5, A6; the "research-licence model" label (waiting for legal opinion before commercial sale, OP-14) | Would your staff consent to a face, or is PIN / QR enough? |
**Do NOT claim:** workplace face accuracy (not measured); 85% as the headline (it is a tuning-set figure, optimistic; the headline is 66–76% on Asian faces); that it stops buddy punching (a PIN or badge can be shared; no
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน A1–A6) และ `docs/ONE-PAGER-ATTENDANCE.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register A1–A6) and `docs/ONE-PAGER-ATTENDANCE.md`. Open points (OP-xx) are in `docs/sales/README.md`.
~~~~

#### docs/sales/ONBOARDING-ATTENDANCE.md

~~~~text
- เปิดเฉพาะเมื่อ (1) OP-14 ใบอนุญาตโมเดลได้ข้อสรุป (2) พนักงานแต่ละคนยินยอมเป็นลายลักษณ์อักษร (3) มี PIN/QR ให้เลือกเสมอ (4) ลูกค้าเข้าใจตัวเลข: ใบหน้าเอเชีย จำได้ต่อการสแกน 66–76%
(n = 500 คน × 5 ภาพ ชุดข้อมูลสาธารณะ) ที่ทำงานจริงยังไม่ได้วัด
- ลงทะเบียนอย่างน้อย 5 คนก่อนพึ่งการเช็คอินอัตโนมัติ ใช้แท็บ "ตรวจความแม่นยำ" วัดกับพนักงานของลูกค้าเอง (เกณฑ์นำร่อง: รับคนผิด ≤ 1% ปฏิเสธคนถูก ≤ 10%)
66–76% (n = 500 people x 5 photos, public dataset), real workplace not measured. Enrol at least 5 people before relying on automatic check-in. Use the "accuracy check" tab on your own staff
(pilot criteria: false accept at most 1%, false reject at most 10%). Delete face data when someone leaves or withdraws consent (deleting face data never deletes time records).
~~~~

#### docs/sales/customer/ONBOARDING-ATTENDANCE.md

~~~~text
- เปิดเฉพาะเมื่อ (1) พนักงานแต่ละคนยินยอมเป็นลายลักษณ์อักษร (2) มี PIN / QR ให้เลือกเสมอ (3) ลูกค้าเข้าใจตัวเลข: ใบหน้าเอเชียจำได้ต่อการสแกน 66–76%
(n = 500 คน × 5 ภาพ ชุดข้อมูลสาธารณะ) ที่ทำงานจริงยังไม่ได้วัด (4) ทีมงานแจ้งสถานะใบอนุญาตของโมเดลใบหน้าแล้วว่าใช้ได้กับกรณีของท่าน
- ลงทะเบียนอย่างน้อย 5 คนก่อนพึ่งการเช็คอินอัตโนมัติ ใช้แท็บ "ตรวจความแม่นยำ" วัดกับพนักงานของลูกค้าเอง (เกณฑ์ของชุดนำร่อง: รับคนผิดไม่เกิน 1% ปฏิเสธคนถูกไม่เกิน 10%)
66–76% (n = 500 people x 5 photos, public dataset), real workplace not measured; (4) the team has confirmed that the licence status of the face model fits your use.
- Enrol at least 5 people before relying on automatic check-in. Use the "accuracy check" tab on your own staff (pilot criteria: false accept at most 1%, false reject at most 10%).
- 仅在以下条件下启用：(1) 每位员工书面同意；(2) 始终提供 PIN / QR 选项；(3) 客户了解相关数据：亚洲人脸每次扫描识别率 66–76%
（n = 500 人 × 5 张照片，公开数据集），真实工作场所尚未测量；(4) 团队已确认人脸模型的许可状态适用于您的使用情形。
- 在依赖自动打卡之前，至少登记 5 人。使用“准确度检查”标签页，用您自己的员工进行测量（试点标准：误接受不超过 1%，误拒绝不超过 10%）。
~~~~

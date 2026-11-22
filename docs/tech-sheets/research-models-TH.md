# โมเดลใบอนุญาตวิจัย (อายุ/เพศ สีหน้า มือ และโมเดลใบหน้า face-api.js) — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: customers.html, signage.html, neuro.html, cameras.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- โมเดลที่ข้อมูลฝึกอนุญาตเฉพาะงานวิจัย ใช้ในหน้าสมาชิกร้าน ป้ายดิจิทัล และ neuro
- อายุ/เพศ และสีหน้า ปิดในรุ่นสำหรับลูกค้าและมีป้ายใบอนุญาต ไม่ใช้ตัดสินบุคคล

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ตัวเลขใน docs/accuracy-figures.json

- `lfwRec100`: ค่า **85** (ค่าดิบ 85) — faces, LFW, 100 enrolled, round 5: member recognised — หลักฐานใน `ACCURACY.md`: `| 100 | 84.9% → 85.0% |`
- `casiaRecLo`: ค่า **66** (ค่าดิบ 66.4) — faces, CASIA (Asian), 200 enrolled: member recognised — หลักฐานใน `ACCURACY.md`: `| 200 | 52.0% → **66.4%**`
- `casiaRecHi`: ค่า **76** (ค่าดิบ 75.6) — faces, CASIA (Asian), 5 enrolled: member recognised — หลักฐานใน `ACCURACY.md`: `| 5 | 57.4% → **75.6%**`
- `lfwStr100`: ค่า **0.4** (ค่าดิบ 0.42) — faces, LFW, 100 enrolled: stranger offered a name — หลักฐานใน `ACCURACY.md`: `0.89% → **0.42%**`
- `strangerCiHi`: ค่า **1.15** (ค่าดิบ 1.15) — faces, CASIA: upper end of the 95% interval at 5 and 200 enrolled — หลักฐานใน `ACCURACY.md`: `(1.15% for both)`
- `lfwAuto100`: ค่า **0.05** (ค่าดิบ 0.05) — faces, LFW (tuning set), 100 enrolled: strangers checked in with no person confirming — หลักฐานใน `ACCURACY.md`: `| 100 | 84.9% → 85.0% | 57.3% | 0.89% → **0.42%** [0.27–0.60%] | 1,809 (36) | 0.05% [0.01–0.12%] |`
- `agMae`: ค่า **5** (ค่าดิบ 5) — signage age MAE (years) — หลักฐานใน `ACCURACY.md`: `| all | 2000 | 78.9% | 5.0 y | 78.6% | 96.0%`
- `agBand`: ค่า **79** (ค่าดิบ 78.6) — signage age band correct — หลักฐานใน `ACCURACY.md`: `| all | 2000 | 78.9% | 5.0 y | 78.6% | 96.0%`
- `agGender`: ค่า **96** (ค่าดิบ 96) — signage gender correct (when decided) — หลักฐานใน `ACCURACY.md`: `| all | 2000 | 78.9% | 5.0 y | 78.6% | 96.0%`
- `agAsian`: ค่า **92** (ค่าดิบ 92.2) — signage gender correct, Asian faces — หลักฐานใน `ACCURACY.md`: `| Asian | 319 | 72.4% | 4.9 y | 81.4% | 92.2% |`
- `handRec`: ค่า **88** (ค่าดิบ 88.2) — kiosk raised-hand recall, IoU 0.3 — หลักฐานใน `ACCURACY.md`: `| 88.2% / 98.6% |`
- `handPrec`: ค่า **99** (ค่าดิบ 98.6) — kiosk raised-hand precision, IoU 0.3 — หลักฐานใน `ACCURACY.md`: `| 88.2% / 98.6% |`
- `handPalm`: ค่า **95** (ค่าดิบ 95) — kiosk open-palm recall — หลักฐานใน `ACCURACY.md`: `95% for open palm`
- `drFrameCatch`: ค่า **84** (ค่าดิบ 84.4) — driver, CEW held out: closed-eye frames caught (own-photo calibration) — หลักฐานใน `ACCURACY.md`: `25.7% → **84.4%**`
- `drFaPerHour`: ค่า **1.4** (ค่าดิบ 1.4) — driver, round 6 adaptive: false alarms per hour when the drive does not match calibration — หลักฐานใน `ACCURACY.md`: `(7.4 → about 1.4 per hour)`
- `dr2s`: ค่า **25** (ค่าดิบ 25) — driver, simulated drowsy drive: 2-s closures alerted — หลักฐานใน `ACCURACY.md`: `2-s closures alerted fell from 32% to 25%`
- `qcLight`: ค่า **20** (ค่าดิบ 20) — qc: brightness change after calibration with 0% false rejects — หลักฐานใน `ACCURACY.md`: `±10%, ±20%, +25% / −30% brightness and ±10% contrast give 0% false rejects`
- `qcAngleA`: ค่า **5** (ค่าดิบ 5) — qc: label skew rejected (smaller) — หลักฐานใน `ACCURACY.md`: `5° and 10° are rejected in every condition, 2° passes`
- `qcAngleB`: ค่า **10** (ค่าดิบ 10) — qc: label skew rejected (larger) — หลักฐานใน `ACCURACY.md`: `5° and 10° are rejected in every condition, 2° passes`
- `bcWrong`: ค่า **0.06** (ค่าดิบ 0.06) — checkout: wrong code put through with 2 agreeing reads — หลักฐานใน `ACCURACY.md`: `1.69% with 1 read and 0.06% with 2`
- `neuroLo`: ค่า **52** (ค่าดิบ 52) — neuro: FER-2013 accuracy, page pipeline — หลักฐานใน `ACCURACY.md`: `| page pipeline (face found 49%) | 346 | 52.0%`
- `neuroHi`: ค่า **59** (ค่าดิบ 59.1) — neuro: FER-2013 accuracy, classifier alone — หลักฐานใน `ACCURACY.md`: `| classifier alone on the face crop | 700 | 59.1%`

### ข้อความตัวเลขเดิมบนหน้าเว็บ (สร้างจาก docs/accuracy-figures.json)

- `customers.s5` (customers.html)
  - ทดสอบกับภาพใบหน้าสาธารณะ (ภาพข่าว LFW และใบหน้าเอเชีย CASIA-FaceV5 ไม่ใช่กล้องหน้าร้าน) ด้วยกฎปัจจุบัน (ลงทะเบียน 3 ท่า เกณฑ์ปรับตามกลุ่มสมาชิก ยืนยัน 2 เฟรม) มีสมาชิก 100 คน: จำสมาชิกได้ราว 85% ต่อการมา แต่ใบหน้าเอเชียเพียงราว 66–76% · เสนอชื่อสมาชิกให้คนที่ไม่ใช่สมาชิกราว 0.4% (ขอบบนของช่วงความเชื่อมั่นถึงราว 1.15%) และเลือกให้อัตโนมัติราว 0.05% (LFW) ควรให้พนักงานยืนยันชื่อก่อนเปิดประวัติการสั่ง และตรวจความแม่นยำที่ร้านของคุณเองด้านล่าง
- `signage.s5` (signage.html)
  - ทดสอบอายุ/เพศกับภาพ UTKFace: อายุคลาดเคลื่อนเฉลี่ย 5 ปี จัดช่วงอายุถูก 79% เพศถูก 96% (ใบหน้าเอเชีย 92%) และหาใบหน้าไม่เจอราว 1 ใน 5 ภาพ — เป็นค่าที่ดีเกินจริง เพราะโมเดลเคยเรียนจากชุดนี้บางส่วน · คีออสก์: เจอมือที่ยกขึ้น 88% ของภาพชุด HaGRID (ท่าแบมือ 95%) ใช้ดูภาพรวมกลุ่มผู้ชม ไม่ใช่ข้อมูลรายบุคคล
- `cameras.s202` (cameras.html)
  - ±5 ปี · ช่วงอายุถูก 79% · เพศถูก 96% (เอเชีย 92%) — ค่าที่ดีเกินจริง เพราะโมเดลเคยเรียนจากชุดนี้บางส่วน
- `cameras.s206` (cameras.html)
  - 88% / 99% · ท่าแบมือ 95%
- `cameras.s208` (cameras.html)
  - บาร์โค้ดจำลอง: อ่านถูก ~100% เมื่อโค้ดกว้าง ≥1/5 ภาพ ชัด ไม่ถูกบัง รหัสผิด 0.06% · ขวดจำลอง: ความสว่างเปลี่ยนถึง ±20% ไม่ปัดตกขวดดี ตรวจฉลากเอียง 5° และ 10° ได้ทุกครั้ง ไม่ตรวจรอยขีดข่วน ยังไม่เคยวัดกับไลน์จริง · ตาปิด (ภาพจริง CEW): จับได้ 84% ต่อเฟรม แต่ขับจำลองเตือนการหลับตา 2 วินาทีได้ 25% และเตือนผิดราว 1.4 ครั้ง/ชั่วโมง · สีหน้า FER-2013: ถูก 52–59% (สุ่ม 14%) · บูธยังไม่ได้วัด
- `customers.lic` (customers.html)
  - ใบหน้าวิเคราะห์ด้วยโมเดล face-api.js (โค้ด MIT) ที่ฝึกจากชุดข้อมูลซึ่งอนุญาตเฉพาะงานวิจัย สิทธิ์ใช้เชิงพาณิชย์ยังไม่ได้รับการยืนยันจากนักกฎหมาย — ตรวจสิทธิ์ก่อนใช้งานเชิงพาณิชย์
- `signage.lic` (signage.html)
  - ใบหน้าวิเคราะห์ด้วยโมเดล face-api.js (โค้ด MIT) ที่ฝึกจากชุดข้อมูลซึ่งอนุญาตเฉพาะงานวิจัย สิทธิ์ใช้เชิงพาณิชย์ยังไม่ได้รับการยืนยันจากนักกฎหมาย — ตรวจสิทธิ์ก่อนใช้งานเชิงพาณิชย์
- `customers.licb` (customers.html)
  - โมเดลใบอนุญาตวิจัย
- `signage.licb` (signage.html)
  - โมเดลใบอนุญาตวิจัย

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.ageGender` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: ACCURACY.md §3 (agMae, agGender; UTKFace 2,000, optimistic)
  - TH: อายุคลาดเฉลี่ย 5.0 ปี เพศถูก 96% เมื่อระบบตัดสิน (ใบหน้าเอเชีย 92%) · n = 2,000 ใบหน้า เอเชีย 319 (UTKFace) ดีเกินจริง: โมเดลเคยฝึกด้วยชุดนี้บางส่วน และหาใบหน้าไม่เจอราว 1 ใน 5 โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า
  - EN: Age off by 5.0 years on average, gender right in 96% when decided (Asian faces 92%) · n = 2,000 faces, Asian 319 (UTKFace). Optimistic: the model was partly trained on this set, and about 1 in 5 faces is not found. Research-licence model, off in customer builds
  - 中文: 年龄平均误差 5.0 岁，判定时性别正确率 96%（亚洲人脸 92%）· n = 2,000 张人脸，亚洲 319 张（UTKFace）。偏乐观：模型部分用此数据集训练，且约 1/5 的人脸未被检出。研究许可模型，客户版关闭
- `cat.c.hand` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: ACCURACY.md §4 (HaGRID, 720 images)
  - TH: คีออสก์ไร้สัมผัส: พบมือที่ยก 88% ถูกต้อง 99% · n = 720 ภาพ (HaGRID)
  - EN: Touch-free kiosk: raised hands found in 88%, precision 99% · n = 720 images (HaGRID)
  - 中文: 免触控信息亭：举手检出率 88%，精确率 99% · n = 720 张图（HaGRID）
- `cat.c.neuro` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: ACCURACY.md §6 (neuroLo, FER-2013 PrivateTest)
  - TH: จำแนกสีหน้าถูก 52% (7 กลุ่ม) · n = 346 ใบหน้าที่พบจาก 700 (FER-2013) ใช้สาธิตเท่านั้น โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า
  - EN: Expression classes right in 52% (7 classes) · n = 346 faces found of 700 (FER-2013). Demo only: research-licence model, off in customer builds
  - 中文: 表情类别正确率 52%（7 类）· n = 346 张检出人脸（共 700 张，FER-2013）。仅供演示：研究许可模型，客户版关闭
- `cat.c.teamface` · ที่มา: na (ไม่เกี่ยวข้อง) · อ้างอิง: teamface.html
  - TH: กิจกรรมเพื่อความบันเทิง ไม่มีตัวเลขความแม่นยำ ไม่ใช้ประเมินพนักงาน
  - EN: An entertainment activity; no accuracy claim, never used to assess staff
  - 中文: 娱乐活动；无准确率声明，绝不用于评估员工
- `cat.c.info` · ที่มา: na (ไม่เกี่ยวข้อง) · อ้างอิง: —
  - TH: หน้าข้อมูลหรือเอกสาร ไม่มีตัวเลขความแม่นยำของตัวเอง
  - EN: An information or document page; no accuracy figure of its own
  - 中文: 信息或文件页面；本身无准确率数据
- `cat.r.teamface`
  - TH: กิจกรรมเพื่อความบันเทิงที่ใช้ใบหน้า ไม่ใช้ประเมินพนักงาน
  - EN: An entertainment activity using faces; never used to assess staff
  - 中文: 使用人脸的娱乐活动；绝不用于评估员工
- `cat.r.customers`
  - TH: จดจำใบหน้าเฉพาะผู้ยินยอม ตัวเลขจากชุดข้อมูลสาธารณะ สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป
  - EN: Consent-only face recognition with public-dataset numbers; the face-model licence is still open
  - 中文: 仅限同意者的人脸识别，数据来自公开数据集；人脸模型许可仍待确定
- `cat.r.research`
  - TH: ใช้โมเดลสัญญาอนุญาตเพื่อการวิจัย (อายุ/เพศ หรือสีหน้า) ซึ่งปิดในเวอร์ชันลูกค้า
  - EN: Uses research-licence models (age/gender or expression), which are off in customer builds
  - 中文: 使用研究许可模型（年龄/性别或表情），客户版中关闭
- `cat.r.content`
  - TH: หน้าข้อมูล ไม่มีตัวเลขหรือการตัดสินใจของตัวเอง
  - EN: An information page with no figure or decision of its own
  - 中文: 信息页面，本身无数据也不做决定

## ข้อจำกัดที่รู้

- ผลบนชุดข้อมูลสาธารณะเป็นขอบบน ไม่ใช่ผลหน้างาน
- ไม่ใช้ตัดสินบุคคล ไม่อ่านอารมณ์ในงานสอบ HR หรือการศึกษา
- สิทธิ์ใช้เชิงพาณิชย์ของข้อมูลฝึกเป็นคำถามสำหรับทนาย (F5/F6)

## สัญญาอนุญาต

- face-api.js (โค้ด MIT, ข้อมูลฝึกเชิงวิจัย F5/F6), MediaPipe Hand Landmarker (Apache-2.0)
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### about.html

~~~~text
[about.s3.d] ผลวัดบนชุดข้อมูลสาธารณะเผยแพร่พร้อมข้อจำกัด หน้าที่ยังไม่ได้วัดจะแสดงป้าย Beta
~~~~

#### cameras.html

~~~~text
[cameras.s176] วัดกับชุดข้อมูลสาธารณะที่มีคำตอบจริง ด้วยโค้ดเดียวกับที่หน้าเว็บใช้ (เบราว์เซอร์ ไม่ใช้ WebGL)
[cameras.s200] UTKFace 2,000 ภาพ
[cameras.s202] ±5 ปี · ช่วงอายุถูก 79% · เพศถูก 96% (เอเชีย 92%) — ค่าที่ดีเกินจริง เพราะโมเดลเคยเรียนจากชุดนี้บางส่วน
[cameras.s204] HaGRID 720 ภาพ 18 ท่า
[cameras.s206] 88% / 99% · ท่าแบมือ 95%
[cameras.s208] บาร์โค้ดจำลอง: อ่านถูก ~100% เมื่อโค้ดกว้าง ≥1/5 ภาพ ชัด ไม่ถูกบัง รหัสผิด 0.06% · ขวดจำลอง: ความสว่างเปลี่ยนถึง ±20% ไม่ปัดตกขวดดี ตรวจฉลากเอียง 5° และ 10° ได้ทุกครั้ง ไม่ตรวจรอยขีดข่วน ยังไม่เคยวัดกับไลน์จริง · ตาปิด (ภาพจริง CEW): จับได้ 84% ต่อเฟรม แต่ขับจำลองเตือนการหลับตา 2 วินาทีได้ 25% และเตือนผิดราว 1.4 ครั้ง/ชั่วโมง · สีหน้า FER-2013: ถูก 52–59% (สุ่ม 14%) · บูธยังไม่ได้วัด
[cameras.s213] ทำให้นับข้ามเส้นเกิน ตัวติดตามใหม่จับคู่สองขั้น (กล่องมั่นใจก่อน แล้วจึงกล่องคะแนนต่ำ) มีแถบกันสั่นรอบเส้น และต้องอยู่ฝั่งใหม่ 2 เฟรมจึงนับ นับแล้วถูกจริงเพิ่มจาก 72% เป็น 81–91% แต่ในฝูงชนนับขาดมากขึ้น
[cameras.prof.p1] ทุกเว็บ รวมเว็บสาธิตบน GitHub Pages เปิดในโหมดลูกค้าเป็นค่าเริ่มต้น (LENSIQ_PROFILE = "commercial") ซึ่งไม่โหลดและไม่แสดงโมเดลอายุ/เพศ (UTKFace) และโมเดลสีหน้า ส่วนโมเดลแยกส่วนใบหน้า BiSeNet ปิดอยู่ (LENSIQ_FACEPARSE = false และไม่มีไฟล์โมเดลในชุดไฟล์ของเว็บ) สวิตช์ "เดโมงานวิจัย" ด้านล่างเปิดโมเดลอายุ/เพศและสีหน้ากลับมาเฉพาะในเครื่องนี้เพื่อสาธิตหรือวิจัย (ปิดไว้เป็นค่าเริ่มต้น ปิดกลับได้ตลอด) ถ้าเปิดไว้บนเว็บที่ไม่ใช่เว็บสาธิต หน้ากล้องจะมีแถบเตือนสีแดง
[cameras.ip.n2] LENSIQ ไม่ได้รวมหรือติดตั้งโปรแกรมเหล่านี้ให้ และยังไม่ได้ทดสอบกล้อง IP ทุกยี่ห้อ ให้ทดลองกับกล้องของคุณ แล้วใช้ “ตรวจความแม่นยำหน้างาน” ในหน้าระบบก่อนใช้ตัวเลขจริง
Synthetic · Open/Closed Eyes · CEW · FER-2013
[cameras.s199] อายุ/เพศ (ป้ายโฆษณา)
[cameras.s201] อายุคลาดเคลื่อน · ช่วงอายุ · เพศ
[cameras.s203] ตรวจจับมือ (คีออสก์)
[cameras.s205] พบมือที่ยก / ถูกต้อง
[cameras.s207] สแกนบาร์โค้ด · ตรวจคุณภาพ · ความง่วง · สีหน้า
[cameras.s211] เปลี่ยนตัวตรวจจับหลักเป็น YOLOX-Nano (สัญญาอนุญาต Apache-2.0 ทำงานบน WASM ไม่ต้องใช้ WebGL) เร็วเท่าเดิมแต่เห็นคนตัวเล็กมากขึ้นชัดเจน COCO-SSD ยังเป็นตัวสำรอง คนที่สูงไม่ถึง 1/10 ของภาพยังหลุด ตัวเลือก “คนตัวเล็ก/อยู่ไกล” แบ่งภาพตรวจได้ แต่ช้าลง
[cameras.s218] อายุ/เพศ/อารมณ์เป็นการคาดคะเน ใช้ดูภาพรวมกลุ่มผู้ชม ไม่ใช้ตัดสินเรื่องของคนใดคนหนึ่ง
~~~~

#### cat-education.html

~~~~text
[cat.education.count] 5 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 2 · สาธิต 0
~~~~

#### cat-health.html

~~~~text
[cat.health.count] 4 เครื่องมือ · พร้อมนำร่อง 0 · ทดลอง 4 · สาธิต 0
~~~~

#### cat-hr.html

~~~~text
[cat.hr.count] 5 เครื่องมือ · พร้อมนำร่อง 4 · ทดลอง 0 · สาธิต 1
~~~~

#### cat-marketing.html

~~~~text
[cat.marketing.count] 14 เครื่องมือ · พร้อมนำร่อง 2 · ทดลอง 10 · สาธิต 2
[cat.r.customers] จดจำใบหน้าเฉพาะผู้ยินยอม ตัวเลขจากชุดข้อมูลสาธารณะ สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป
[cat.c.ageGender] อายุคลาดเฉลี่ย 5.0 ปี เพศถูก 96% เมื่อระบบตัดสิน (ใบหน้าเอเชีย 92%) · n = 2,000 ใบหน้า เอเชีย 319 (UTKFace) ดีเกินจริง: โมเดลเคยฝึกด้วยชุดนี้บางส่วน และหาใบหน้าไม่เจอราว 1 ใน 5 โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า
[cat.c.hand] คีออสก์ไร้สัมผัส: พบมือที่ยก 88% ถูกต้อง 99% · n = 720 ภาพ (HaGRID)
[cat.c.neuro] จำแนกสีหน้าถูก 52% (7 กลุ่ม) · n = 346 ใบหน้าที่พบจาก 700 (FER-2013) ใช้สาธิตเท่านั้น โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า
~~~~

#### cat-security.html

~~~~text
[cat.security.count] 6 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 1 · สาธิต 0 · หน้าประกอบ 2
~~~~

#### cat-studio.html

~~~~text
[cat.studio.count] 4 เครื่องมือ · พร้อมนำร่อง 1 · ทดลอง 3 · สาธิต 0
~~~~

#### customers.html

~~~~text
[customers.s4] ความแม่นยำที่วัดได้
[customers.s5] ทดสอบกับภาพใบหน้าสาธารณะ (ภาพข่าว LFW และใบหน้าเอเชีย CASIA-FaceV5 ไม่ใช่กล้องหน้าร้าน) ด้วยกฎปัจจุบัน (ลงทะเบียน 3 ท่า เกณฑ์ปรับตามกลุ่มสมาชิก ยืนยัน 2 เฟรม) มีสมาชิก 100 คน: จำสมาชิกได้ราว 85% ต่อการมา แต่ใบหน้าเอเชียเพียงราว 66–76% · เสนอชื่อสมาชิกให้คนที่ไม่ใช่สมาชิกราว 0.4% (ขอบบนของช่วงความเชื่อมั่นถึงราว 1.15%) และเลือกให้อัตโนมัติราว 0.05% (LFW) ควรให้พนักงานยืนยันชื่อก่อนเปิดประวัติการสั่ง และตรวจความแม่นยำที่ร้านของคุณเองด้านล่าง
[customers.s6] วิธีวัดและข้อจำกัด
~~~~

#### help.html

~~~~text
ขึ้นกับมุมกล้อง ความสูง และแสง เราเผยแพร่ผลวัดบนชุดข้อมูลสาธารณะพร้อมข้อจำกัด และฟีเจอร์ที่ยังไม่ได้วัดบนข้อมูลจริงจะมีป้าย Beta ก่อนใช้ตัวเลขตัดสินใจทางธุรกิจ แนะนำให้ทดลองหน้างาน 2 สัปดาห์ เทียบกับการนับด้วยคน ค่าประมาณอายุ เพศ และสีหน้าเป็นค่าโดยประมาณสำหรับภาพรวมเท่านั้น
It depends on camera angle, height and lighting. We publish public-dataset results with their limitations, and features not yet measured on real data carry a Beta label. Before relying on the numbers for business decisions, run a 2-week on-site pilot against a human count. Age, gender and expression estimates are approximate and only meant for overall trends.
~~~~

#### index.html

~~~~text
[cat.all.sub] เจ็ดหมวดงาน ทุกหน้ายังอยู่ครบ แต่ละหมวดบอกสถานะและความแม่นยำที่วัดได้พร้อมที่มา
[cat.security.count] 6 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 1 · สาธิต 0 · หน้าประกอบ 2
[cat.education.count] 5 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 2 · สาธิต 0
[cat.hr.count] 5 เครื่องมือ · พร้อมนำร่อง 4 · ทดลอง 0 · สาธิต 1
[cat.marketing.count] 14 เครื่องมือ · พร้อมนำร่อง 2 · ทดลอง 10 · สาธิต 2
[cat.health.count] 4 เครื่องมือ · พร้อมนำร่อง 0 · ทดลอง 4 · สาธิต 0
[cat.studio.count] 4 เครื่องมือ · พร้อมนำร่อง 1 · ทดลอง 3 · สาธิต 0
~~~~

#### neuro.html

~~~~text
[neuro.s4] สีหน้าไม่ได้บอกความรู้สึกจริงเสมอไป วัดบน FER-2013: ทาย 7 สีหน้าถูก 52–59% (สุ่มเดา 14%) ดีกับยิ้มและประหลาดใจ อ่อนกับเศร้า โกรธ และกลัว ค่าที่ได้เหมาะสำหรับเปรียบเทียบสื่อในเงื่อนไขเดียวกันแบบภาพรวมกลุ่มเท่านั้น
[neuro.s5] วิธีวัดและข้อจำกัด
[neuro.s10] ) พบว่าสีหน้ากับอารมณ์จริงสัมพันธ์กันไม่สม่ำเสมอ และต่างกันไปตามบุคคล วัฒนธรรม และบริบท ผลจึงใช้ได้เพื่อการสาธิตหรือเป็นสัญญาณเบื้องต้นในงานวิจัยเท่านั้น ห้ามใช้ตัดสินบุคคล คัดเลือกพนักงาน หรือประเมินทางการแพทย์
[neuro.s56] ใช้เพื่อการสาธิตหรือเป็นสัญญาณเบื้องต้นในงานวิจัยเท่านั้น ไม่ใช้ตัดสินบุคคล คัดเลือกพนักงาน หรือประเมินทางการแพทย์/จิตวิทยา
~~~~

#### palm.html

~~~~text
[palm.linesNote] เส้นที่แสดงเป็นการประมาณจากภาพโดยอัตโนมัติ และยังไม่ได้วัดความแม่นยำกับมือจริง โปรดเทียบกับมือของคุณ และลากจุดกลมเพื่อปรับเส้นให้ตรงกับรอยจริงได้
~~~~

#### signage.html

~~~~text
[signage.s5] ทดสอบอายุ/เพศกับภาพ UTKFace: อายุคลาดเคลื่อนเฉลี่ย 5 ปี จัดช่วงอายุถูก 79% เพศถูก 96% (ใบหน้าเอเชีย 92%) และหาใบหน้าไม่เจอราว 1 ใน 5 ภาพ — เป็นค่าที่ดีเกินจริง เพราะโมเดลเคยเรียนจากชุดนี้บางส่วน · คีออสก์: เจอมือที่ยกขึ้น 88% ของภาพชุด HaGRID (ท่าแบมือ 95%) ใช้ดูภาพรวมกลุ่มผู้ชม ไม่ใช่ข้อมูลรายบุคคล
[signage.s6] วิธีวัดและข้อจำกัด
~~~~

#### solutions.html

~~~~text
[sl.cats.sub] เจ็ดหมวดงาน ทุกหน้ายังอยู่ครบ แต่ละหมวดบอกสถานะและความแม่นยำที่วัดได้พร้อมที่มา
[sl.pr.4] เผยแพร่ผลวัดและข้อจำกัด และมีเครื่องมือวัดความแม่นยำหน้างานก่อนใช้ตัวเลขจริง
[sl.next.p] ลองหน้าที่ใช้ได้แล้วในโหมดตัวอย่าง → ทดลองหน้างาน 2 สัปดาห์พร้อมตรวจความแม่นยำ → สรุปผลร่วมกัน
[sl.c.edu3.y] ขั้นตอนขอความยินยอมจากผู้ปกครอง ทางเลือก QR สำหรับเด็กที่ไม่ใช้ใบหน้า และช่องทางส่งข้อความถึงผู้ปกครอง
[sl.c.edu9.y] ขั้นตอนหาขอบกระดาษและสร้าง PDF ในเบราว์เซอร์ ยังไม่ได้สร้าง
[sl.c.edu10.y] ตัวอ่านบาร์โค้ดสำรองสำหรับ iPhone (zxing-js, Apache-2.0) และหน้าบันทึกการยืม-คืน
[sl.c.edu11.y] ตัวตรวจจับเฉพาะ (YOLOX, Apache-2.0) ที่ฝึกด้วยภาพที่ใช้เชิงพาณิชย์ได้ และความยินยอมของผู้ปกครอง
[sl.c.r11.y] หน้าเทียบผลที่ใช้ตัวเลขรายวันจากหน้านับคน (lensiq-stats) ยังไม่ได้สร้าง
[sl.c.r12.y] ตัวอ่านบาร์โค้ดสำรองสำหรับ iPhone (zxing-js, Apache-2.0) และหน้านับสต็อก
[sl.c.m3.y] โมเดลตรวจจับเฉพาะ (YOLOX, Apache-2.0) ที่ฝึกจากภาพที่มีสิทธิ์ใช้เชิงพาณิชย์ ตอนนี้ยังไม่มีโมเดลสำเร็จรูปที่ใบอนุญาตชัดเจน
[sl.c.h8.y] โมเดลตรวจจับมือ (MediaPipe, Apache-2.0) ในหน้าใหม่ และภาพขั้นตอนที่มีสิทธิ์ใช้
[sl.c.e10.y] ตัวตรวจจับวัตถุในหน้าฮวงจุ้ย (COCO-SSD)
[sl.c.e11.y] หน้ารวมที่ดึงข้อมูลจากหน้าวางแผนฤกษ์และหน้าฮวงจุ้ย ยังไม่ได้สร้าง
[sl.c.e12.y] เชื่อมตัวอ่านป้ายทะเบียน (lensiq-plate.js) เข้ากับหน้าเลขมงคล
[sl.c.e13.y] ตัวจำแนกไพ่ที่ต้องฝึกเอง หรือการเทียบกับภาพไพ่ที่มีสิทธิ์ใช้
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### help.html

~~~~text
[#h-accuracy] ตัวเลขจากกล้องแม่นแค่ไหน ขึ้นกับมุมกล้อง ความสูง และแสง เราเผยแพร่ผลวัดบนชุดข้อมูลสาธารณะพร้อมข้อจำกัด และฟีเจอร์ที่ยังไม่ได้วัดบนข้อมูลจริงจะมีป้าย Beta ก่อนใช้ตัวเลขตัดสินใจทางธุรกิจ แนะนำให้ทดลองหน้างาน 2 สัปดาห์ เทียบกับการนับด้วยคน ค่าประมาณอายุ เพศ และสีหน้าเป็นค่าโดยประมาณสำหรับภาพรวมเท่านั้น
[#en-h-accuracy] How accurate are the camera numbers? It depends on camera angle, height and lighting. We publish public-dataset results with their limitations, and features not yet measured on real data carry a Beta label. Before relying on the numbers for business decisions, run a 2-week on-site pilot against a human count. Age, gender and expression estimates are approximate and only meant for overall trends.
[#en-h-start-gate] LENSIQ Gate guard-assisted plate reading Prepare: one device with a camera per lane, a firm stand, power, and the camera sign (printed from the sign kit page). Post the sign before the camera. Mount the device so the plate is at least 120 px wide in the picture. Open the village or car-park page; the operator reads and accepts the notice before the camera starts. Set the operator name, the most common provinces and the log retention. Train guards to confirm or correct every plate, and use the "accuracy check" from day one. Common problems: blurred plates on moving cars: use a faster shutter and have cars stop at the line · poor reads at night: fix the infrared light first. Gate page · Sign kit · See the demo
[#en-h-start-crowd] LENSIQ Crowd people counting and density (experimental) Prepare: a phone or laptop with a camera, a stand 2.5–3 m high looking down, mains power for the whole event and a camera sign at the entrance. For sparse to medium crowds; not yet suitable for dense crowds. Try the set-up at the real place before the event: people in the zone at least 10% of the frame height. Open the Crowd page, start the camera, then draw the zone and the in / out line. Set the expected crowd at peak so the page warns when the count is unusually low. After the event, export the CSV and stop the camera. No video is recorded. Common problems: "people look small": move the camera closer or draw the zone on the near part only · a dense crowd counted as very few: stop using that number and split the camera views. Crowd page · See the demo
[#zh-h-accuracy] 摄像头的数字有多准确？ 这取决于摄像头角度、高度和光线。我们公开在公共数据集上的测量结果及其局限，尚未在真实数据上测量的功能标有 Beta。在依据这些数字做商业决策前，建议进行 2 周现场试点，与人工计数对比。年龄、性别和表情估计仅为近似值，只用于观察整体趋势。
~~~~

#### customers.js

~~~~text
กำลังตรวจความแม่นยำ — กด "จบและคำนวณ" ก่อนสแกนลูกค้า
ตรวจความแม่นยำหน้างาน
~~~~

#### lensiq-claims-rules.js

~~~~text
rule work 2026-11-12 (spent fresh2 + earlier sets): H02 caught 5 of 31 on fresh2; herbal efficacy claims in these forms were missed. Guards: UK traditional-use (THR) indications, composition percentages ('สกัด 100%', '100% 250 mg')
~~~~

#### lensiq-config.js

~~~~text
เครื่องนี้เปิด "เดโมงานวิจัย" อยู่: โมเดลอายุ/เพศ (UTKFace) และสีหน้าที่ใช้ข้อมูลใบอนุญาตวิจัยยังทำงานได้ ห้ามใช้เชิงพาณิชย์ — ปิดได้ที่
"Research demo" is on for this device: the research-licence age/gender (UTKFace) and expression models can still run. Not for commercial use — switch it off in
本设备已开启“研究演示”：基于研究许可数据的年龄/性别（UTKFace）与表情模型仍可运行，不得用于商业用途 — 可在此关闭：
~~~~

#### lensiq-golive.js

~~~~text
เปิดตัวเลือกอายุ/เพศ (โมเดล UTKFace ใบอนุญาตวิจัย)
Age / gender option on (UTKFace, research licence)
已开启年龄／性别选项（UTKFace，研究许可）
ปิดอายุ/เพศ (UTKFace) และล็อกไว้
已关闭年龄／性别（UTKFace）并已锁定
ปิดอายุ/เพศ (UTKFace) เป็นค่าเริ่มต้น แต่ยังเปิดได้จากสวิตช์เดโมงานวิจัยในแต่ละเครื่อง
Age / gender off (UTKFace) by default, but the research demo switch can still turn it on per device
默认关闭年龄／性别（UTKFace），但仍可通过各设备的研究演示开关开启
~~~~

#### lensiq-research.js

~~~~text
ป้ายใบอนุญาต: โมเดลอายุ/เพศของ face-api.js ฝึกจาก UTKFace (อนุญาตเฉพาะงานวิจัย ไม่ใช่เชิงพาณิชย์) และโมเดลสีหน้าฝึกจากชุดข้อมูลที่สิทธิ์ไม่ชัดเจน ใช้เพื่อสาธิตและวิจัยในเครื่องนี้เท่านั้น ดู
โหมดลูกค้า: ปิดโมเดลอายุ/เพศ (UTKFace) และโมเดลสีหน้า เพราะข้อมูลฝึกยังไม่ได้รับการยืนยันสิทธิ์ใช้เชิงพาณิชย์ (F5) ป้ายยังนับผู้ชม การมองจอ และเวลามองได้ แต่ไม่เลือกโฆษณาตามอายุ/เพศหรือรอยยิ้ม และไม่เก็บสถิติยิ้ม/Valence
Face detection, face landmarks and face recognition are not affected. They are a separate legal question (F5/F6), so the "research-licence model" label on camera pages stays
Customer mode: the age/gender (UTKFace) and face-expression models are off because their training data is not cleared for commercial use (F5). The sign still counts viewers, gaze and viewing time, but does not pick ads by age/gender or smiles and records no smile or valence statistics
许可标签：face-api.js 年龄/性别模型基于 UTKFace 训练（仅限非商业研究），表情模型的训练数据许可不明确。仅可在本设备上用于演示和研究。参见
客户模式：年龄/性别（UTKFace）与表情模型已关闭，因其训练数据尚未确认可商用（F5）。屏幕仍会统计观众、注视和观看时长，但不会按年龄/性别或微笑选择广告，也不记录微笑或效价统计
~~~~

#### nav.js

~~~~text
เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา
~~~~

#### palm-v2.js

~~~~text
จุดบนมืออัตโนมัติ (โมเดลทดลอง ใบอนุญาตรอทนายยืนยัน ปิดในเวอร์ชันลูกค้า)
~~~~

#### signage.js

~~~~text
เลือกเมนูไหนก็ได้ 4 แก้ว พร้อมขนมปังอบใหม่ คุ้มกว่าเดิม 20%
ลด 10% เมื่อซื้อครบ 2 แก้ว
ลด 15% สำหรับนักเรียน/นักศึกษา
linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.65)),url("
ตรวจความแม่นยำอายุ/เพศหน้างาน
ทดสอบการประมาณช่วงอายุและเพศที่จอของคุณเอง: ระหว่างที่ระบบวัดผู้ชม เจ้าหน้าที่ดูคนที่เดินผ่านจอ แล้วเลือกช่วงอายุและเพศจริงของแต่ละคนที่ระบบบันทึก ระบบคำนวณความถูกต้องพร้อมช่วงความเชื่อมั่นและตารางเทียบ
เปิด "ใช้อายุ/เพศ" ก่อน จึงจะตรวจความแม่นยำอายุ/เพศได้
~~~~

#### i18n/en-rt-customers.js

~~~~text
กำลังตรวจความแม่นยำ — กด "จบและคำนวณ" ก่อนสแกนลูกค้า
Accuracy check in progress — press "Finish and calculate" before scanning customers
~~~~

#### i18n/en-rt-signage.js

~~~~text
ตรวจความแม่นยำอายุ/เพศหน้างาน
ทดสอบการประมาณช่วงอายุและเพศที่จอของคุณเอง: ระหว่างที่ระบบวัดผู้ชม เจ้าหน้าที่ดูคนที่เดินผ่านจอ แล้วเลือกช่วงอายุและเพศจริงของแต่ละคนที่ระบบบันทึก ระบบคำนวณความถูกต้องพร้อมช่วงความเชื่อมั่นและตารางเทียบ
Test the age-band and gender estimates at your own screen: while the system measures the audience, a staff member watches the people passing the screen and picks each recorded person's real age band and gender. The system computes the accuracy with confidence intervals and confusion tables
เปิด "ใช้อายุ/เพศ" ก่อน จึงจะตรวจความแม่นยำอายุ/เพศได้
~~~~

#### i18n/en-rt-sitecheck.js

~~~~text
Dark image — real low-light video is often blurred and noisy; run the on-site accuracy check in this light before trusting the numbers, or add light
Test in/out counting at your own shop door: while the system counts, one person watches the door and presses a button each time someone really crosses the line. The page calculates the accuracy on this site with confidence intervals and recommends settings.
เครื่องนี้เปิด "เดโมงานวิจัย" อยู่: โมเดลอายุ/เพศ (UTKFace) และสีหน้าที่ใช้ข้อมูลใบอนุญาตวิจัยยังทำงานได้ ห้ามใช้เชิงพาณิชย์ — ปิดได้ที่
"Research demo" is on for this device: the research-licence age/gender (UTKFace) and expression models can still run. Not for commercial use — switch it off in
~~~~

#### i18n/zh-rt-customers.js

~~~~text
กำลังตรวจความแม่นยำ — กด "จบและคำนวณ" ก่อนสแกนลูกค้า
正在进行准确度检查——请先点击“结束并计算”再扫描顾客
~~~~

#### i18n/zh-rt-signage.js

~~~~text
ตรวจความแม่นยำอายุ/เพศหน้างาน
现场年龄/性别准确度检查
ทดสอบการประมาณช่วงอายุและเพศที่จอของคุณเอง: ระหว่างที่ระบบวัดผู้ชม เจ้าหน้าที่ดูคนที่เดินผ่านจอ แล้วเลือกช่วงอายุและเพศจริงของแต่ละคนที่ระบบบันทึก ระบบคำนวณความถูกต้องพร้อมช่วงความเชื่อมั่นและตารางเทียบ
在您自己的屏幕前测试年龄段和性别估算：系统测量观众时，工作人员观察经过屏幕的人，并为系统记录的每个人选择真实的年龄段和性别。系统会计算准确率、置信区间和对照表
เปิด "ใช้อายุ/เพศ" ก่อน จึงจะตรวจความแม่นยำอายุ/เพศได้
~~~~

#### i18n/zh-rt-sitecheck.js

~~~~text
เครื่องนี้เปิด "เดโมงานวิจัย" อยู่: โมเดลอายุ/เพศ (UTKFace) และสีหน้าที่ใช้ข้อมูลใบอนุญาตวิจัยยังทำงานได้ ห้ามใช้เชิงพาณิชย์ — ปิดได้ที่
本设备已开启“研究演示”：基于研究许可数据的年龄/性别（UTKFace）与表情模型仍可运行，不得用于商业用途 — 可在此关闭：
~~~~

#### docs/ONE-PAGER-GATE.md

~~~~text
lower bound (owner decision, 2026-11-09), with the plain average (exact reads, k / n) always shown next to it. At the
~~~~

#### docs/ONE-PAGER-ZH.md

~~~~text
| 营销 | 智能广告屏、展位分析、表情测试广告（仅限同意的测试参与者；欧盟《人工智能法》第 5(1)(f) 条禁止在工作场所和教育机构使用情绪识别，第 50(3) 条要求告知被分析者；模型训练数据授权待核实，见 `LICENSES/THIRD_PARTY.md` F5）、会员识别（自愿加入） | 广告观看时长、独立访客数、关注度 |
~~~~

#### docs/sales/DEMO-SCRIPT-CROWD.md

~~~~text
- ห้ามบอกความเร็วบนมือถือจริง ตัวเลข 355 ms ต่อภาพ (ราว 2.8 ครั้งต่อวินาที) มาจากการจำลองด้วยการลดความเร็ว CPU ×4 บนคอมพิวเตอร์ ไม่ใช่มือถือจริง
~~~~

#### docs/sales/DEMO-SCRIPT-EXAM.md

~~~~text
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน E1–E5) และ `docs/ONE-PAGER-EXAM.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register E1–E5) and `docs/ONE-PAGER-EXAM.md`. Open points (OP-xx) are in `docs/sales/README.md`.
~~~~

#### docs/sales/DEMO-SCRIPT-GATE.md

~~~~text
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` §5 และ `docs/GATE.md` §3b–3c และ `docs/ONE-PAGER-GATE.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` §5, `docs/GATE.md` §3b–3c and `docs/ONE-PAGER-GATE.md`. Open points (OP-xx) are in `docs/sales/README.md`.
~~~~

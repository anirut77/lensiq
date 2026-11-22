# Exam: ห้องสอบ (lab, ห้องสอบแบบกล้องรอบห้อง, แดชบอร์ดผู้คุมสอบ) — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: exam.html, exam-lab.html, exam-hall.html, exam-dashboard.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- บอกผู้คุมสอบว่าควรไปดูที่นั่งไหน ระบบแจ้งเท่านั้น คนตัดสินทุกกรณี ไม่อ่านอารมณ์ และไม่จดจำว่าใครเป็นใคร (exam)
- ตรวจพบโทรศัพท์ที่อยู่ใกล้กล้องได้ดี โทรศัพท์ที่วางบนโต๊ะมักตรวจไม่พบ ผู้คุมสอบควรเดินตรวจร่วมด้วย (exam)
- ระบบช่วยผู้คุมสอบเท่านั้น ไม่ตัดสินว่ามีการทุจริต (examlab)
- กล้องหนึ่งตัวดูหลายที่นั่งในห้องสอบ แจ้งที่นั่งว่าง คนเพิ่ม และคนเอนตัว ให้ผู้คุมสอบไปดู (examhall)
- ใบหน้าที่อยู่ไกลกล้องยังหาไม่เจอ และเห็นโทรศัพท์ได้เฉพาะแถวหน้าใกล้กล้อง ผู้คุมสอบควรเดินตรวจร่วมด้วย (examhall)

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ทะเบียนคำอ้าง (docs/ACCURACY-CLAIMS.md ข้อ 4)

- **E1** `exam.l.cl1` (exam.html) · ตัวเลข: — · n: — · ป้าย: notmeasured; field · หลักฐาน: docs/EXAM.md
  - การแจ้งที่นั่งถูกหรือผิดในห้องสอบจริง: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง) — แดชบอร์ดมีเครื่องมือนับว่าแจ้งถูกหรือผิดให้ใช้ระหว่างทดลอง
- **E2** `exam.l.cl2` (exam.html) · ตัวเลข: 15%; 24–48 px · n: n = 26; n = 12 · ป้าย: public; notmeasured · หลักฐาน: docs/exam/FACE-ENGINE-RESULTS.md
  - ไม่พบใบหน้าในภาพ (คนเดียว ระยะนั่งหน้าโต๊ะ): 15% · n = 26 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า) · ใบหน้ากว้างเพียง 24–48 px: ไม่พบเลย · n = 12 ภาพ · แยกตามสีผิว: ยังไม่ได้วัด
- **E4** `exam.l.cl4` (exam.html) · ตัวเลข: 0%; 63%; 24–48 px · n: n = 195 · ป้าย: public · หลักฐาน: docs/exam/FACE-ENGINE-RESULTS.md
  - ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px): พบ 0% · n = 195 ใบหน้า · ที่มา: ชุดข้อมูลสาธารณะ (ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · ตัวเลือกที่ดีที่สุดที่วัดได้พบ 63% แต่มีกรอบผิด 0.40 กรอบต่อภาพ และทำได้ประมาณ 2 ภาพต่อวินาทีบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้ · เครื่องกล้องในห้องสอบจึงเป็นรุ่นทดลอง
- **E5** `exam.l.cl5` (exam.html) · ตัวเลข: 28.8%; 15 / 52 · n: n = 52; n = 17 · ป้าย: public · หลักฐาน: docs/exam/FACE-ENGINE-RESULTS.md
  - มีคนที่สองในภาพ (หน้าผู้เข้าสอบ) แล้วระบบอ่านว่า “มากกว่าหนึ่งคน”: 28.8% (15 / 52) · n = 52 ภาพ · แจ้งผิดเมื่อมีคนเดียว: ไม่มี · n = 17 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (ภาพถ่ายสาธารณะจาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · สัญญาณนี้เป็นตัวช่วยผู้คุมสอบ ไม่ใช่การตรวจจับที่ครบถ้วน: คนที่สองส่วนใหญ่ในภาพทดสอบไม่ถูกแจ้ง
- **E3** `exam.l.cl3` (exam.html) · ตัวเลข: — · n: — · ป้าย: notmeasured · หลักฐาน: docs/EXAM.md
  - การพบโทรศัพท์หรือหนังสือในภาพจากห้องสอบ: ยังไม่ได้วัด · ตัวตรวจจับวัตถุ (COCO-SSD) ยังไม่ได้ทดสอบกับภาพห้องสอบ

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.examNone` · ที่มา: none (ยังไม่ได้วัด) · อ้างอิง: docs/EXAM.md (Accuracy — not measured yet)
  - TH: สัญญาณถูกหรือผิดในห้องสอบจริง: ยังไม่ได้วัด การนำร่องจะเทียบแต่ละสัญญาณกับบันทึกของผู้คุมสอบ ระบบไม่ตัดสินการทุจริต
  - EN: Signals right or wrong in a real exam room: not measured. The pilot compares each signal with the invigilator's tally. The system never decides cheating
  - 中文: 真实考场中信号的对错：尚未测量。试点将把每种信号与监考员的记录比对。系统从不判定作弊
- `cat.c.examHall` · ที่มา: public (ชุดข้อมูลสาธารณะ) · อ้างอิง: docs/exam/FACE-ENGINE-RESULTS.md §7.1 (Open Images V7 group photos, held-out half; not exam-room footage)
  - TH: ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px): พบ 0% (0/195) · n = 195 ใบหน้า ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง ตัวเลือกที่ดีที่สุดที่วัดได้พบ 62.6% (122/195) แต่มีกรอบผิดมากและช้าเกินไปบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้
  - EN: Small faces in a wide exam-room view (24–48 px wide): 0% found (0/195) · n = 195 faces, Open Images V7 group photos, held-out half, not exam-room footage; the best option measured found 62.6% (122/195) but drew too many false boxes and was too slow on an emulated mid-range laptop, so it is not switched on
  - 中文: 考场广角画面中的小脸（宽 24–48 px）：找到 0%（0/195）· n = 195 张脸，Open Images V7 合影，未用于选择参数的一半，非真实考场画面；已测得的最佳方案找到 62.6%（122/195），但错误框过多，且在模拟的中端笔记本上过慢，因此未启用
- `cat.r.exam`
  - TH: หน้าผู้เข้าสอบ เครื่องในห้อง และแดชบอร์ดครบ คนตัดสินทุกสัญญาณ ความแม่นยำยังไม่ได้วัดและการนำร่องคือการวัด หน้าผู้เข้าสอบและเครื่องในห้องใช้ MediaPipe Face Landmarker และ COCO-SSD (ทั้งคู่ Apache-2.0) ส่วน YOLOX-Nano (Apache-2.0) ในเครื่องห้องสอบเป็นตัวเลือกที่ปิดไว้เป็นค่าเริ่มต้น โหลด face-api.js เฉพาะเมื่อเปิดเดโมงานวิจัย หน้าแนะนำ Exam และแดชบอร์ดไม่โหลดโมเดลใด ๆ
  - EN: Candidate page, room camera and dashboard are complete and a person decides every flag; accuracy is unmeasured and the pilot is the measurement; the candidate page and room camera run MediaPipe Face Landmarker and COCO-SSD (both Apache-2.0); the room camera's YOLOX-Nano option (Apache-2.0) is off by default; face-api.js is loaded only in the research demo; the Exam overview page and the dashboard load no model
  - 中文: 考生页、考场摄像头与看板齐全，每个信号由人判断；准确率尚未测量，试点即为测量；考生页与考场摄像头使用 MediaPipe Face Landmarker 和 COCO-SSD（均为 Apache-2.0）；考场摄像头的 YOLOX-Nano 选项（Apache-2.0）默认关闭；仅在研究演示中加载 face-api.js；Exam 介绍页与看板不加载任何模型
- `cat.r.examHall`
  - TH: เครื่องกล้องในห้องสอบใช้งานได้ครบ แต่ใบหน้าเล็กในภาพมุมกว้างของห้องสอบยังตรวจได้ไม่ดี จึงเป็นรุ่นทดลองจนกว่าจะแก้ ยังไม่เปิดขาย หน้าผู้เข้าสอบ (ห้องคอมพิวเตอร์) พร้อมนำร่อง
  - EN: The room camera works end to end, but small faces in the wide exam-room view are still poorly detected, so it stays experimental until that is fixed and is not for sale yet; the candidate page (computer lab) is pilot-ready
  - 中文: 考场摄像头流程可用，但考场广角画面中的小脸仍检测不佳，因此在解决前保持实验性，暂不销售；考生页（机房）可试点

## ข้อจำกัดที่รู้

- ระบบแจ้งให้ตรวจเท่านั้น ไม่ตัดสินการทุจริต ผู้คุมสอบต้องเดินตรวจห้องตามปกติ
- โทรศัพท์ที่วางบนโต๊ะมักตรวจไม่พบ ใบหน้าที่อยู่ไกลกล้องในห้องสอบแบบกล้องรอบห้องยังหาไม่เจอ
- ยังไม่มีผลวัดในห้องสอบจริง ตัวเลขด้านบนมาจากภาพสาธารณะ ไม่ใช่เว็บแคมหรือห้องสอบจริง
- ไม่อ่านอารมณ์และไม่จดจำตัวบุคคล

## สัญญาอนุญาต

- MediaPipe Face Landmarker และ BlazeFace (Apache-2.0), TensorFlow.js (Apache-2.0); ห้องสอบแบบกล้องรอบห้อง: YOLOX-nano / COCO-SSD (Apache-2.0)
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### cameras.html

~~~~text
[cameras.new.p] การสอบ ลานจอดและการเข้าออก คิว โต๊ะ และพื้นที่หวงห้าม ยังไม่ได้วัดความแม่นยำในสถานที่จริง คนตัดสินใจทุกครั้ง
~~~~

#### cat-education.html

~~~~text
[cat.c.examNone] สัญญาณถูกหรือผิดในห้องสอบจริง: ยังไม่ได้วัด การนำร่องจะเทียบแต่ละสัญญาณกับบันทึกของผู้คุมสอบ ระบบไม่ตัดสินการทุจริต
[cat.r.exam] หน้าผู้เข้าสอบ เครื่องในห้อง และแดชบอร์ดครบ คนตัดสินทุกสัญญาณ ความแม่นยำยังไม่ได้วัดและการนำร่องคือการวัด หน้าผู้เข้าสอบและเครื่องในห้องใช้ MediaPipe Face Landmarker และ COCO-SSD (ทั้งคู่ Apache-2.0) ส่วน YOLOX-Nano (Apache-2.0) ในเครื่องห้องสอบเป็นตัวเลือกที่ปิดไว้เป็นค่าเริ่มต้น โหลด face-api.js เฉพาะเมื่อเปิดเดโมงานวิจัย หน้าแนะนำ Exam และแดชบอร์ดไม่โหลดโมเดลใด ๆ
[cat.c.examHall] ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px): พบ 0% (0/195) · n = 195 ใบหน้า ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง ตัวเลือกที่ดีที่สุดที่วัดได้พบ 62.6% (122/195) แต่มีกรอบผิดมากและช้าเกินไปบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้
[cat.r.examHall] เครื่องกล้องในห้องสอบใช้งานได้ครบ แต่ใบหน้าเล็กในภาพมุมกว้างของห้องสอบยังตรวจได้ไม่ดี จึงเป็นรุ่นทดลองจนกว่าจะแก้ ยังไม่เปิดขาย หน้าผู้เข้าสอบ (ห้องคอมพิวเตอร์) พร้อมนำร่อง
~~~~

#### exam-dashboard.html

~~~~text
[exam.db.nMulti] สัญญาณ “มากกว่าหนึ่งคน” เป็นตัวช่วยผู้คุมสอบ ไม่ใช่การตรวจจับที่ครบถ้วน: เมื่อมีคนที่สองในภาพ ระบบแจ้งได้ 28.8% (15 / 52) · n = 52 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (ภาพถ่ายสาธารณะจาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · ในห้องสอบจริง: ยังไม่ได้วัด · ผู้คุมสอบต้องเดินตรวจตามปกติ
[exam.db.precH] ตรวจความแม่นยำหน้างาน (ผู้คุมสอบนับว่าแจ้งถูกหรือผิด)
[exam.db.precP] กด “แจ้งถูก” เมื่อไปดูแล้วเห็นตามที่ระบบบอก (เช่น มีโทรศัพท์จริง) ไม่ได้แปลว่ามีการทุจริต กด “แจ้งผิด” เมื่อไม่เป็นอย่างที่บอก ช่วงความเชื่อมั่น 95% แบบ Wilson
[exam.db.tPrec] ความแม่นยำ (95%)
~~~~

#### exam-hall.html

~~~~text
[exam.hall.exp] ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px) ยังหาไม่เจอ: พบ 0% · n = 195 ใบหน้า · ที่มา: ชุดข้อมูลสาธารณะ (ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) ตัวเลือกที่ดีที่สุดที่วัดได้พบ 63% แต่มีกรอบผิดเฉลี่ย 0.40 กรอบต่อภาพ และทำได้ประมาณ 2 ภาพต่อวินาทีบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้ การดูที่นั่ง (คนและโทรศัพท์) ทำงานตามเดิม
~~~~

#### exam-lab.html

~~~~text
[exam.lab.gazeNote] การดูทิศสายตายังไม่เปิดใช้: ยังไม่ได้วัดว่าจุดม่านตาของโมเดลใบหน้าบอกทิศสายตาได้น่าเชื่อถือแค่ไหน (แผนรุ่นถัดไป น้ำหนักต่ำ ไม่แจ้งเพียงลำพัง)
~~~~

#### exam.html

~~~~text
[exam.l.betaB] พร้อมนำร่อง · ยังไม่ได้วัดความแม่นยำในห้องสอบจริง
[exam.l.cl.h] ความแม่นยำ: บอกตามจริง (ที่มาของทุกตัวเลข)
[exam.l.cl1] การแจ้งที่นั่งถูกหรือผิดในห้องสอบจริง: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง) — แดชบอร์ดมีเครื่องมือนับว่าแจ้งถูกหรือผิดให้ใช้ระหว่างทดลอง
[exam.l.cl2] ไม่พบใบหน้าในภาพ (คนเดียว ระยะนั่งหน้าโต๊ะ): 15% · n = 26 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า) · ใบหน้ากว้างเพียง 24–48 px: ไม่พบเลย · n = 12 ภาพ · แยกตามสีผิว: ยังไม่ได้วัด
[exam.l.cl4] ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px): พบ 0% · n = 195 ใบหน้า · ที่มา: ชุดข้อมูลสาธารณะ (ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · ตัวเลือกที่ดีที่สุดที่วัดได้พบ 63% แต่มีกรอบผิด 0.40 กรอบต่อภาพ และทำได้ประมาณ 2 ภาพต่อวินาทีบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้ · เครื่องกล้องในห้องสอบจึงเป็นรุ่นทดลอง
[exam.l.cl5] มีคนที่สองในภาพ (หน้าผู้เข้าสอบ) แล้วระบบอ่านว่า “มากกว่าหนึ่งคน”: 28.8% (15 / 52) · n = 52 ภาพ · แจ้งผิดเมื่อมีคนเดียว: ไม่มี · n = 17 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ (ภาพถ่ายสาธารณะจาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · สัญญาณนี้เป็นตัวช่วยผู้คุมสอบ ไม่ใช่การตรวจจับที่ครบถ้วน: คนที่สองส่วนใหญ่ในภาพทดสอบไม่ถูกแจ้ง
[exam.l.cl3] การพบโทรศัพท์หรือหนังสือในภาพจากห้องสอบ: ยังไม่ได้วัด · ตัวตรวจจับวัตถุ (COCO-SSD) ยังไม่ได้ทดสอบกับภาพห้องสอบ
[exam.l.mAx] ใบหน้าเล็กในภาพมุมกว้างของห้องสอบยังตรวจได้ไม่ดี จึงใช้ทดลองหรือสาธิตเท่านั้นจนกว่าจะแก้ ตัวเลขและที่มาอยู่ในหน้าเครื่องกล้อง หน้าผู้เข้าสอบ (ห้องคอมพิวเตอร์) พร้อมสำหรับโครงการนำร่อง
[exam.l.mA1] สังเกต: ที่นั่งว่าง (เวลาออก–กลับ) คนเพิ่มที่ที่นั่ง คนยืนในทางเดิน เอนตัวเข้าที่นั่งข้างเคียง โทรศัพท์ (เฉพาะแถวหน้าใกล้กล้อง: ในระยะห้องสอบโทรศัพท์มักเล็กเกินกว่าจะเห็น ยังไม่ได้วัด)
[exam.l.s7r] ว่าง 20 วินาที = ข้อมูล · คนเพิ่ม 5 วินาที = เฝ้าดู, 15 วินาที = ไปตรวจ · เอนเข้าเขตข้างเคียงเกิน 25% นาน 4 วินาที = เฝ้าดู
[exam.l.fair3] อัตราการตรวจไม่พบใบหน้าวัดแล้วกับภาพสาธารณะ (แสงปกติ แสงน้อย หน้ากาก แว่นตา ใบหน้าเล็ก ดูรายงานความแม่นยำ) แต่ยังไม่ได้วัดแยกตามสีผิว จะวัดก่อนเปิดขาย
[exam.l.beta] เกณฑ์ทุกค่าเป็นค่าเริ่มต้นจากงานวิจัยและต้องตรวจในสถานที่จริงก่อนใช้ (มีเครื่องมือนับว่าแจ้งถูกหรือผิดในแดชบอร์ด) ใบหน้าวิเคราะห์ในเครื่องด้วย MediaPipe Face Landmarker ของ Google (Apache-2.0) เพื่อนับใบหน้าและดูการหันศีรษะเท่านั้น ไม่จดจำใบหน้าและไม่วิเคราะห์สีหน้า
~~~~

#### solutions.html

~~~~text
[sl.c.edu1.p] บอกกรรมการว่าควรไปดูที่นั่งไหน (ไม่มีใบหน้า มากกว่าหนึ่งคน โทรศัพท์ ออกจากหน้าจอ) ในห้องสอบคอมพิวเตอร์ (พร้อมนำร่อง) และห้องสอบที่มีกล้องรอบห้อง (รุ่นทดลอง ยังไม่เปิดขาย) ไม่ตัดสินว่าทุจริต กรรมการเป็นผู้ตรวจและบันทึกผล
[sl.st.pilot.d] พร้อมทดสอบนำร่องที่หน้างานหนึ่งแห่งภายใต้การดูแล ขั้นตอนครบ คนตัดสินใจทุกครั้ง ยังไม่ผ่านการทดสอบภาคสนาม
[sl.st.soon.d] ยังไม่เปิดใช้ ระบุสิ่งที่ยังขาดไว้ตรง ๆ (โมเดล การทดสอบ หรือขั้นตอนขอความยินยอม)
[sl.c.edu8.y] ตัวอ่านมาร์กเกอร์บนการ์ด (js-aruco, MIT) และการทดสอบในห้องเรียนจริง
[sl.c.h1.y] โมเดลท่าทาง (MediaPipe Pose, Apache-2.0) ภาพแบบเงาเพื่อความเป็นส่วนตัว และการทดสอบกับผู้ดูแลจริง ไม่ใช่อุปกรณ์การแพทย์
[sl.c.h10.y] โมเดลหาตำแหน่งข้อความ (PP-OCR det, Apache-2.0) และการทดสอบกับฉลากยาไทยจริง
[sl.c.f1.y] โมเดลท่าทางและการทดสอบกับท่าจริงหลายมุมกล้อง
~~~~

#### exam-hall.js

~~~~text
[exam.hall.pcRate[coco][24–72]] ที่ขนาดนี้ (24–72 px) ตัวตรวจหาคนเจอ 3.5% (n = 143, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco][72–144]] ที่ขนาดนี้ (72–144 px) ตัวตรวจหาคนเจอ 19.5% (n = 195, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco][144–288]] ที่ขนาดนี้ (144–288 px) ตัวตรวจหาคนเจอ 46.2% (n = 247, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco][288+]] ที่ขนาดนี้ (288+ px) ตัวตรวจหาคนเจอ 75.3% (n = 275, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco-t2][24–72]] ที่ขนาดนี้ (24–72 px) ตัวตรวจหาคนเจอ 8.4% (n = 143, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco-t2][72–144]] ที่ขนาดนี้ (72–144 px) ตัวตรวจหาคนเจอ 38.5% (n = 195, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco-t2][144–288]] ที่ขนาดนี้ (144–288 px) ตัวตรวจหาคนเจอ 56.3% (n = 247, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[coco-t2][288+]] ที่ขนาดนี้ (288+ px) ตัวตรวจหาคนเจอ 70.2% (n = 275, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox][24–72]] ที่ขนาดนี้ (24–72 px) ตัวตรวจหาคนเจอ 25.2% (n = 143, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox][72–144]] ที่ขนาดนี้ (72–144 px) ตัวตรวจหาคนเจอ 48.7% (n = 195, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox][144–288]] ที่ขนาดนี้ (144–288 px) ตัวตรวจหาคนเจอ 65.2% (n = 247, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox][288+]] ที่ขนาดนี้ (288+ px) ตัวตรวจหาคนเจอ 66.9% (n = 275, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox-t2][24–72]] ที่ขนาดนี้ (24–72 px) ตัวตรวจหาคนเจอ 21.7% (n = 143, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox-t2][72–144]] ที่ขนาดนี้ (72–144 px) ตัวตรวจหาคนเจอ 43.1% (n = 195, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox-t2][144–288]] ที่ขนาดนี้ (144–288 px) ตัวตรวจหาคนเจอ 66.4% (n = 247, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
[exam.hall.pcRate[yolox-t2][288+]] ที่ขนาดนี้ (288+ px) ตัวตรวจหาคนเจอ 76.0% (n = 275, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### exam-hall.js

~~~~text
ที่ขนาดนี้ ({range} px) ตัวตรวจหาคนเจอ {r}% (n = {n}, ชุดข้อมูลสาธารณะ ภาพนิ่ง ไม่ใช่ห้องสอบจริง)
~~~~

#### insights-ui.js

~~~~text
อันดับหนึ่ง “{b}” ต่างจากอันดับสุดท้าย {d} จุด (ช่วงร่วม 95%: {lo} ถึง {hi}) · {c} · ทดสอบรวมทุกชิ้นก่อน ({m}) แล้วเทียบครบ {k} คู่ปรับด้วย Holm · จุดทึบ = ค่าดิบ เส้น = ช่วง 95% (Wilson) ขีดตั้ง = ค่าหลังปรับตามขนาดข้อมูล
วิธีคำนวณ: เทียบจำนวนรายวันด้วย negative binomial + ความคลาดเคลื่อนต่อเนื่อง AR(1) · อัตราด้วย Wilson / quasi-binomial · A/B ทดสอบรวมก่อนแล้วเทียบทุกคู่ (Holm) · ปรับการดูหลายข้อด้วย Benjamini–Hochberg · ความสัมพันธ์ไม่ใช่หลักฐานของเหตุและผล
~~~~

#### lensiq-demo-data.js

~~~~text
<p data-i18n="demo.exdb.p">ห้องสอบสมมติ DEMO 12 ที่นั่ง มีการแจ้งตัวอย่าง 18 รายการ ผู้คุมสอบตัวอย่างตรวจไปแล้ว 15 รายการและกด "แจ้งถูก" หรือ "แจ้งผิด" ไว้ ตารางความแม่นยำต่อสัญญาณจึงมีตัวเลขแล้ว (รวม 8 ถูก จาก 15) ยังเหลือ 3 รายการในคิวให้ลองกดเอง ตัวเลขนี้เป็นข้อมูลจำลองเพื่อสาธิตวิธีนับ ไม่ใช่ความแม่นยำที่วัดได้ของ LENSIQ ในห้องสอบจริงยังไม่ได้วัด ผู้คุมสอบเป็นผู้ตัดสินเสมอ</p> <div class="lq-demo-btns">
~~~~

#### lensiq-exam.js

~~~~text
public dataset (Open Images V7 validation still images, CC BY 2.0; not exam-room footage) — docs/exam/HALL-DETECTOR-RESULTS.md
[HALL_PLACE] HALL_PLACE (base ecb783b6): size bands 24 / 72 / 144 / 288 px; n per band 143 / 195 / 247 / 275 people; coco recall 3.5% / 19.5% / 46.2% / 75.3%; coco-t2 recall 8.4% / 38.5% / 56.3% / 70.2%; yolox recall 25.2% / 48.7% / 65.2% / 66.9%; yolox-t2 recall 21.7% / 43.1% / 66.4% / 76.0%; source: public dataset (Open Images V7 validation still images, CC BY 2.0; not exam-room footage) — docs/exam/HALL-DETECTOR-RESULTS.md
~~~~

#### lensiq-sitecheck.js

~~~~text
ทดสอบกับ {a} คน: ช่วงความเชื่อมั่นรวมการสุ่มซ้ำทีละคน (cluster bootstrap)
~~~~

#### lensiq-tester.js

~~~~text
ความเป็นส่วนตัวของการทดสอบนี้ (ฉบับร่าง รอทนายตรวจ)
~~~~

#### i18n/en-rt-sitecheck.js

~~~~text
ทดสอบกับ {a} คน: ช่วงความเชื่อมั่นรวมการสุ่มซ้ำทีละคน (cluster bootstrap)
~~~~

#### i18n/zh-rt-sitecheck.js

~~~~text
ทดสอบกับ {a} คน: ช่วงความเชื่อมั่นรวมการสุ่มซ้ำทีละคน (cluster bootstrap)
临时结果（只比较测得值与目标，不考虑置信区间）：
~~~~

#### docs/ONE-PAGER-EXAM.md

~~~~text
| ห้องสอบที่มีกล้อง (`exam-hall.html`) **— รุ่นทดลอง ยังไม่เปิดขาย** | มือถือ/โน้ตบุ๊กเป็นเครื่องกล้อง จำนวนกล้องขึ้นกับขนาดห้อง (ดูคู่มือวางกล้อง: `docs/EXAM.md` "Hall camera placement guide") กำหนดที่นั่งบนภาพ แจ้ง "ข้อสังเกต" เช่น ที่นั่งว่าง เอนไปที่นั่งข้าง ๆ มีโทรศัพท์ในภาพ (เฉพาะแถวหน้าใกล้กล้อง: ในระยะห้องสอบโทรศัพท์มักเล็กเกินกว่าจะเห็น ยังไม่ได้วัด) |
| แดชบอร์ดผู้คุมสอบ (`exam-dashboard.html`) | แผนผังที่นั่ง คิวข้อสังเกตตามลำดับ ทุกการกระทำต้องใส่ชื่อผู้คุมสอบ ตรวจความแม่นยำหน้างาน ("แจ้งถูก/แจ้งผิด") CSV เรียงตามเวลา รายงานพิมพ์ |
รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)
| ข้อสังเกตถูก/ผิดในห้องสอบจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `docs/EXAM.md` |
| หาใบหน้าไม่เจอ (คนเดียว ระยะนั่งหน้าโต๊ะ ตัวตรวจ MediaPipe) | 15% (ใบหน้ากว้าง 24–48 px: ไม่พบเลย) | n = 26 ภาพ (n = 12) | ชุดข้อมูลสาธารณะ (Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า) · แยกตามสีผิว: ยังไม่ได้วัด · ในห้องสอบจริง: ยังไม่ได้วัด (ชุดนำร่อง ขั้น 0) | `docs/exam/FACE-ENGINE-RESULTS.md`, `docs/pilot/PILOT-EXAM.md` |
| สัญญาณ “มากกว่าหนึ่งคน” (ห้องคอมพิวเตอร์): มีคนที่สองในภาพแล้วระบบแจ้ง. **เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน** | 28.8% (15 / 52) · แจ้งผิดเมื่อมีคนเดียว 0 / 17 | n = 52 ภาพ (n = 17) | ชุดข้อมูลสาธารณะ (ภาพถ่ายสาธารณะจาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง) · ในห้องสอบจริง: ยังไม่ได้วัด | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2 |
| ตรวจพบโทรศัพท์/หนังสือในภาพการสอบ | ยังไม่ได้วัด | — | ยังไม่ได้วัด (แผนวัดในการสอบจำลองตามบท ขั้น 1) | `docs/EXAM.md` |
"แจ้งถูก/แจ้งผิด" แผนและเช็กลิสต์: `docs/pilot/PILOT-EXAM.md` ผลเป็นตัวเลขของสถาบันเองพร้อมช่วงความเชื่อมั่น 95%
(Annex III 3(d)) และห้ามรู้จำอารมณ์ในสถานศึกษา (มาตรา 5(1)(f)) — ระบบไม่มี ข้อความกฎหมายรอทนายตรวจ
- **Camera exam hall** (`exam-hall.html`), **experimental, not on sale yet**: seat polygons and objective observations (empty seat, leaning, phone in view: front rows near the camera only, as at exam-room distance a phone is usually too small to see; not measured). The number of cameras depends on room size (see the guide: `docs/EXAM.md` "Hall camera placement guide").
| Observations right / wrong in a real exam room | not measured | — | field: not measured (no pilot yet) | `docs/EXAM.md` |
| Face not found (one person at desk distance, MediaPipe engine) | 15% (faces 24–48 px wide: none found) | n = 26 frames (n = 12) | public dataset (Open Images V7, held-out half) · by skin tone: not measured · real exam rooms: not measured (pilot phase 0) | `docs/exam/FACE-ENGINE-RESULTS.md`, `docs/pilot/PILOT-EXAM.md` |
| "More than one person" signal (computer room): a second person in view is flagged. **An aid, not complete detection** | 28.8% (15 / 52) · false alarms with one person 0 / 17 | n = 52 frames (n = 17) | public dataset (public photos from Open Images V7, held-out half; not exam-room footage) · real exam rooms: not measured | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2 |
| Phone / book detection on exam footage | not measured | — | not measured (planned in the staged exam, phase 1) | `docs/EXAM.md` |
| ระบบคุมสอบด้วย AI อย่างเดียวจับผู้ที่ถูกสั่งให้โกงได้ (การทดลองของ University of Twente กับ Proctorio) | 0 จาก 6 คน | — | งานวิจัยที่ตีพิมพ์ (ไม่ใช่ผลวัดของ LENSIQ) | `docs/EXAM.md` "Why it does not decide" |
**ห้องสอบที่มีกล้องเป็นรุ่นทดลอง (เจ้าของตัดสินใจ 2026-11-10):** ยังไม่เปิดขายจนกว่าจะแก้ปัญหาใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (`docs/exam/FACE-ENGINE-RESULTS.md` §7) ราคาในแถวนั้นใช้เมื่อเปิดขายแล้วเท่านั้น ห้องคอมพิวเตอร์ (`exam-lab.html`) พร้อมโครงการนำร่อง
| AI-only proctoring caught instructed cheaters (University of Twente trial with Proctorio) | 0 of 6 | — | published research (not a LENSIQ measurement) | `docs/EXAM.md` |
| Camera hall (per room; number of cameras depends on room size, see the guide), **experimental, not on sale yet** | 290 THB per room per exam day excl. 7% VAT, or 990 THB / month per room excl. 7% VAT | 300–600 THB per room per exam day excl. 7% VAT, or 1,990 THB / month per room excl. 7% VAT |
~~~~

#### docs/sales/DECK-EXAM.md

~~~~text
> **ร่าง (DRAFT) 2026-11-11** สร้างจาก `docs/ONE-PAGER-EXAM.md` ใช้เฉพาะตัวเลขที่วัดแล้ว แต่ละตัวมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) และไฟล์อ้างอิง
> จาก `docs/ACCURACY-CLAIMS.md` (ทะเบียน E1–E5) และ `docs/accuracy-figures.json` ถ้าไม่ได้วัด เขียนว่า "ยังไม่ได้วัด"
- สถานะ: ห้องคอมพิวเตอร์ (`exam-lab.html`) พร้อมนำร่อง · ห้องสอบที่มีกล้อง (`exam-hall.html`) **รุ่นทดลอง ไม่ขาย**
- **ตรวจความแม่นยำหน้างาน:** ผู้คุมสอบกด "แจ้งถูก" / "แจ้งผิด" ระบบสรุปความแม่นยำต่อสัญญาณพร้อมช่วงความเชื่อมั่น 95%
# 6. ความแม่นยำที่วัดแล้ว (และที่ยังไม่ได้วัด)
*Measured accuracy, and what is not measured*
| ข้อสังเกตถูก/ผิดในห้องสอบจริง · right/wrong in real exam rooms | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง: ยังไม่มีโครงการนำร่อง / field: no pilot yet | `docs/EXAM.md` (E1) |
| หาใบหน้าไม่เจอ (คนเดียว ระยะนั่งหน้าโต๊ะ) · face not found, one person at desk distance | 15% (ใบหน้ากว้าง 24–48 px: ไม่พบเลย / faces 24–48 px: none found) | n = 26 ภาพ (n = 12) | ชุดข้อมูลสาธารณะ (Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า) ไม่ใช่ห้องสอบจริง / public dataset | `docs/exam/FACE-ENGINE-RESULTS.md` (E2) |
| สัญญาณ "มากกว่าหนึ่งคน" · "more than one person" signal | แจ้งได้ 28.8% (15 / 52) · แจ้งผิดเมื่อมีคนเดียว 0 / 17 **เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน / an aid, not complete detection** | n = 52 ภาพ (n = 17) | ชุดข้อมูลสาธารณะ / public dataset | `docs/exam/FACE-ENGINE-RESULTS.md` §7.2 (E5) |
| ตรวจพบโทรศัพท์/หนังสือในภาพห้องสอบ · phone / book detection | **ยังไม่ได้วัด / not measured** | — | ยังไม่ได้วัด | `docs/EXAM.md` (E3) |
| แยกตามสีผิว / แสงน้อยในห้องจริง · by skin tone, low light in real rooms | **ยังไม่ได้วัด / not measured** | — | ยังไม่ได้วัด | `docs/exam/FACE-ENGINE-RESULTS.md` |
- ระบบอัตโนมัติพลาดได้: ในห้องสอบจริง ยังไม่ได้วัด (ดูสไลด์ 6) และการวัดตามสีผิวหรือแสงน้อยยังไม่ได้ทำ จึงไม่ให้ระบบตัดสิน
- ผล: ตัวเลขของสถาบันเองพร้อมช่วงความเชื่อมั่น 95% ที่มา "หน้างานจริง" · ฟรี แลกกับการจดผลของผู้คุมสอบ
- PDPA: ประกาศผู้สอบพิมพ์ได้ 3 ภาษา (`exam.html#notice`) · ข้อความกฎหมายรอทนายตรวจก่อนขาย (OP-24)
Computer-room mode is pilot-ready; the camera hall is experimental and not for sale. It has no emotion, expression, lie or deception scoring, no suspicion score and no face recognition,
and age / gender / expression models are not part of customer builds. Measured so far (all public dataset, none from real exam rooms): face not found 15% (n = 26 frames, `docs/exam/FACE-ENGINE-RESULTS.md`);
the "more than one person" signal fires on 28.8% (15 / 52) of frames with a second person with 0 / 17 false alarms, an aid and not complete detection (§7.2). Not measured: accuracy in real exam rooms,
# สไลด์ขาย: LENSIQ Exam (10 สไลด์) / Sales deck: LENSIQ Exam
- การทดลองแบบสุ่มของ University of Twente กับ Proctorio พบว่าระบบคุมสอบด้วย AI อย่างเดียวจับผู้ที่ถูกสั่งให้โกงได้ **0 จาก 6 คน**
~~~~

#### docs/sales/DEMO-SCRIPT-EXAM.md

~~~~text
> สถานะหน้า (`docs/PAGE-STATUS.md`): `exam.html`, `exam-lab.html`, `exam-dashboard.html` = พร้อมนำร่อง · `exam-hall.html` = **ทดลอง ไม่ขาย**
| 6:30–7:30 | `exam-dashboard.html` (ส่วนตรวจความแม่นยำ) | "ผู้คุมสอบกด 'แจ้งถูก' หรือ 'แจ้งผิด' เมื่อไปดูแล้ว ระบบคำนวณความแม่นยำต่อสัญญาณพร้อมช่วงความเชื่อมั่น 95% นี่คือวิธีที่เราวัดที่ห้องของท่านเอง ตัวเลขในตารางนี้เป็นข้อมูลจำลองเพื่อสาธิตวิธีนับ ไม่ใช่ความแม่นยำที่วัดได้" | ตาราง tally ที่เติมไว้แล้ว (รวม 8 ถูกจาก 15 ข้อมูลจำลอง: โทรศัพท์ 3/1, ไม่เห็นใบหน้า 2/3, มากกว่าหนึ่งคน 1/2, ออกเต็มจอ 2/0, เอนตัว 0/1) ให้กดแจ้งถูก/แจ้งผิดกับ 3 รายการที่ยังค้างในคิวเพื่อดูตารางขยับ ปุ่ม "ไปที่ตารางความแม่นยำ" ในแผงเดโม ส่วนการปรับการสอบต่อที่นั่ง (พักบ่อย อ่านออกเสียง) ไม่บันทึกการวินิจฉัย | "มีผู้สอบที่ต้องปรับการสอบกี่คนต่อรอบ" |
| 7:30–8:30 | `exam.html` ส่วน "ความแม่นยำและที่มา" | อ่านตัวเลขตามจริง: "ในห้องสอบจริง ยังไม่ได้วัด หาใบหน้าไม่เจอ 15% (n = 26 ภาพ ชุดข้อมูลสาธารณะ ไม่ใช่ห้องสอบจริง) สัญญาณ 'มากกว่าหนึ่งคน' แจ้งได้ 28.8% (15 / 52) ไม่แจ้งผิด 0 / 17 เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน ผู้คุมสอบต้องเดินตรวจตามปกติ" | แถว E1 E2 E5 และงานวิจัย Twente (0 จาก 6 งานวิจัยที่ตีพิมพ์ ไม่ใช่ผลวัดของเรา) | "ท่านต้องการความแม่นยำเท่าไรจึงจะใช้ได้ และใช้เกณฑ์อะไรตัดสิน" |
- ห้ามบอกว่าตรวจโทรศัพท์หรือหนังสือได้แม่น (ยังไม่ได้วัดบนภาพห้องสอบ) ห้ามบอกว่าตรวจคนที่สองได้ครบ (28.8% บนชุดข้อมูลสาธารณะ)
- ห้ามบอกความแม่นยำตามสีผิวหรือแสงน้อย (ยังไม่ได้วัด) ห้ามบอกตัวเลขหน้างานจริง (ยังไม่มี)
- ห้ามบอกว่าถูกกฎหมาย PDPA ครบ หรือผ่านทนายแล้ว (รอทนายตรวจ) ห้ามบอกว่าแทนผู้คุมสอบหรือ Safe Exam Browser ได้
> Page status (`docs/PAGE-STATUS.md`): `exam.html`, `exam-lab.html`, `exam-dashboard.html` = pilot-ready; `exam-hall.html` = **experimental, not for sale**.
| 6:30–7:30 | dashboard, tally | After checking, the invigilator presses "flag was right" or "wrong". The page computes precision per signal with a 95% interval. This is how we measure in your room. The numbers in this table are simulated, to show how the tally works; they are not a measured accuracy. | Pre-filled tally (8 right out of 15, simulated: phone 3/1, face not visible 2/3, more than one person 1/2, fullscreen exit 2/0, leaning 0/1); press right / wrong on the 3 flags still in the queue to see the table move; the "Go to the precision table" button in the demo panel; per-seat accommodations (breaks, reading aloud) with no diagnosis stored | How many candidates need accommodations per exam? |
| 7:30–8:30 | `exam.html`, accuracy table | Read the numbers as they are: real exam rooms not measured. Face not found 15% (n = 26 frames, public dataset, not exam rooms). The "more than one person" signal fires on 28.8% (15 / 52) of frames with a second person, with 0 / 17 false alarms. It is an aid, not complete detection. | Rows E1, E2, E5; the Twente study (0 of 6, published research, not our measurement) | What accuracy would you need, and how would you judge it? |
**Do NOT claim:** that it catches cheating or decides; that phone or book detection is accurate (not measured on exam footage); that it finds every second person (28.8% on public
photos); accuracy by skin tone or in low light (not measured); any field figure (none exists); anything about emotion, expression, suspicion score or lie detection (none exists);
~~~~

#### docs/sales/ONBOARDING-EXAM.md

~~~~text
5. **ปรับเทียบท่านั่ง** (ประมาณ 2 นาที) ถ้าเฟรมที่มีใบหน้าเดียวต่ำกว่า 60% การปรับเทียบจะไม่ผ่านและปิดสัญญาณหันศีรษะ การสอบยังเริ่มได้
และสัญญาณ "มากกว่าหนึ่งคน" เป็นตัวช่วย ไม่ครบถ้วน (28.8% บนชุดข้อมูลสาธารณะ)
| แจ้ง "ไม่เห็นใบหน้า" บ่อยกับผู้สอบบางคน | ใบหน้าเล็กในภาพ มุมกล้อง ผิวคล้ำในแสงน้อย (ยังไม่ได้วัดตามสีผิว) | ปรับมุมและแสงก่อน ผู้คุมสอบไปดูก่อนตัดสิน ห้ามใช้สัญญาณนี้ตัดสินผู้สอบ บันทึกเป็น "แจ้งผิด" ถ้าไม่พบเหตุ |
5. Calibrate the sitting position (about 2 minutes). If fewer than 60% of frames have a single face, calibration fails and head-turn is switched off; the exam can still start.
and the "more than one person" signal is an aid, not complete (28.8% on public photos).
| Frequent "no face" for some candidates | Small face in the frame, camera angle, dark skin in dim light (not yet measured by skin tone) | Fix angle and light first; the invigilator looks before judging; never judge a candidate on this signal; log as "wrong" if nothing was found |
~~~~

#### docs/sales/customer/ONBOARDING-EXAM.md

~~~~text
5. **ปรับเทียบท่านั่ง** (ประมาณ 2 นาที) ถ้าเฟรมที่มีใบหน้าเดียวต่ำกว่า 60% การปรับเทียบจะไม่ผ่านและระบบปิดสัญญาณหันศีรษะ แต่การสอบยังเริ่มได้
และสัญญาณ "มากกว่าหนึ่งคน" เป็นตัวช่วยที่ไม่ครบถ้วน (28.8% บนชุดข้อมูลสาธารณะ)
| แจ้ง "ไม่เห็นใบหน้า" บ่อยกับผู้สอบบางคน | ใบหน้าเล็กในภาพ มุมกล้อง ผิวคล้ำในแสงน้อย (ยังไม่ได้วัดตามสีผิว) | ปรับมุมและแสงก่อน ผู้คุมสอบไปดูก่อนตัดสิน ห้ามใช้สัญญาณนี้ตัดสินผู้สอบ ถ้าไม่พบเหตุให้บันทึกเป็น "แจ้งผิด" |
5. **Calibrate the sitting position** (about 2 minutes). If fewer than 60% of frames have a single face, calibration fails and head-turn is switched off; the exam can still start.
and the "more than one person" signal is an aid and not complete (28.8% on a public dataset).
| Frequent "no face" for some candidates | Small face in the frame, camera angle, dark skin in dim light (not yet measured by skin tone) | Fix angle and light first; the invigilator looks before judging; never judge a candidate on this signal; log it as "flag was wrong" if nothing was found |
5. **校准坐姿**（约 2 分钟）。如果只有一张人脸的画面帧低于 60%，校准不通过，转头信号将被关闭；考试仍可开始。
“多于一人”信号只是辅助手段，并不完整（在公开数据集上为 28.8%）。
~~~~

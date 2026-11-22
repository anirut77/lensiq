# Crowd: นับคนและความหนาแน่นในอีเวนต์ — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: crowd.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- นับคนและดูความหนาแน่นในโซนที่คุณวาด สำหรับอีเวนต์และพื้นที่จัดงาน ประมวลผลบนเครื่อง ไม่ระบุตัวตน
- เหมาะกับงานที่มีคนน้อยถึงปานกลาง ยังไม่เหมาะกับฝูงชนหนาแน่น

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ทะเบียนคำอ้าง (docs/ACCURACY-CLAIMS.md ข้อ 4)

- **C1** `cr.cl.dense` (crowd.html) · ตัวเลข: 300; 0–2 · n: n = 2 + 7 · ป้าย: dense; public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - ยังไม่เหมาะกับฝูงชนหนาแน่น: ฝูงชนราว 300 คน (Shibuya) หน้านี้นับได้เพียงราว 1 คนต่อภาพ และนับได้ 0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน · n = 2 + 7 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ (วิดีโอ Wikimedia Commons) ผลเบื้องต้น เทียบกับการนับอ้างอิงโดย AI · ใช้กับคนน้อยถึงปานกลางที่ตัวใหญ่พอในภาพเท่านั้น
- **C2** `cr.acc2.r2` (crowd.html) · ตัวเลข: 26% · n: n = 12 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - คน 15–22 คนเต็มภาพ ขนาดปานกลาง: นับต่ำกว่าจริงเฉลี่ย 26% (ประมาณ 5 คน) · n = 12 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C3** `cr.acc2.r6` (crowd.html) · ตัวเลข: 58% · n: n = 20 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - คน 30–50 คนในภาพ หลายคนอยู่ไกล: นับต่ำกว่าจริงเฉลี่ย 58% (ค่าอ้างอิงเองก็เป็นค่าประมาณ ±20%) · n = 20 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C4** `cr.acc2.r3` (crowd.html) · ตัวเลข: 37–59% · n: n = 29 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - คนไกลหรือตัวเล็ก (สูงไม่ถึง 1 ใน 10 ของภาพ): นับต่ำกว่าจริง 37–59% · n = 29 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C5** `cr.acc2.r1` (crowd.html) · ตัวเลข: 1.2; 31% · n: n = 20 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - คนที่ตัวใหญ่พอในโซนช่วงใกล้กล้อง (0–13 คนในโซน วัดจากคลิปเดียว): คลาดเฉลี่ย 1.2 คนต่อภาพ (ประมาณ 31%) แทบไม่เอียงไปทางขาดหรือเกิน · n = 20 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C6** `cr.acc2.r4` (crowd.html) · ตัวเลข: 300; 0–2 · n: n = 2 + 7 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - ฝูงชนแน่นมาก (ประมาณ 300 คน): นับได้เพียงราว 1 คนต่อภาพ (และ 0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน) ใช้นับจำนวนไม่ได้ ตัวเลขลดลงจนเกือบเป็นศูนย์แทนที่จะสูงขึ้น หน้านี้จึงแยกไม่ออกจากภาพที่ไม่มีคนและจะไม่ขึ้นป้ายเตือนเอง เว้นแต่ตั้งค่า "จำนวนคนที่คาดว่าจะมีช่วงพีค" ไว้ · n = 2 + 7 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C7** `cr.acc2.r5` (crowd.html) · ตัวเลข: 1 / 1 · n: n = 1 · ป้าย: public; prelim · หลักฐาน: docs/CROWD-ACCURACY.md
  - เส้นนับเข้า–ออก: นับถูก 1 / 1 ครั้งในคลิปคนน้อย และไม่นับเกินในคลิปที่ไม่มีคนข้ามเส้น ข้อมูลยังน้อยเกินกว่าจะสรุปเป็นเปอร์เซ็นต์ · n = 1 ครั้งที่ข้ามเส้น (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
- **C8** `cr.cl.field` (crowd.html) · ตัวเลข: — · n: — · ป้าย: notmeasured; field · หลักฐาน: docs/CROWD-ACCURACY.md
  - ความแม่นยำสุดท้าย: ยังไม่ได้วัด · ที่มา: หน้างานจริง (รอผลการนับโดยคน 2 คน และยังไม่มีโครงการนำร่อง) ตัวเลขทุกตัวในหัวข้อด้านล่างเป็นผลเบื้องต้น

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.crowd` · ที่มา: prelim (เบื้องต้น) · อ้างอิง: docs/ACCURACY-CLAIMS.md C2, C3, C4, C5 (docs/CROWD-ACCURACY.md, round 15, AI reference)
  - TH: ทั้งภาพ นับขาด: 26% เมื่อมี 15–22 คน (n = 12 เฟรม) 58% เมื่อมี 30–50 คนซึ่งหลายคนอยู่ไกล (n = 20) 37–59% สำหรับคนตัวเล็กหรืออยู่ไกล (n = 29, 2 คลิป) โซนใกล้ของหนึ่งคลิปคลาด 1.2 คน (31%, n = 20) ค่าอ้างอิงนับโดย AI ยังไม่ใช่คนนับ
  - EN: Whole frame, undercount: 26% with 15–22 people (n = 12 frames), 58% with 30–50 people, many far (n = 20), 37–59% for small or far people (n = 29, 2 clips); near zone of one clip off by 1.2 people (31%, n = 20). The reference was counted by an AI, not yet by people
  - 中文: 整帧计数偏少：15–22 人时 26%（n = 12 帧），30–50 人且多人在远处时 58%（n = 20），小或远的人 37–59%（n = 29，2 段片段）；其中一段近区误差 1.2 人（31%，n = 20）。参考值由 AI 计数，尚未由人工计数
- `cat.c.crowdDense` · ที่มา: prelim (เบื้องต้น) · อ้างอิง: docs/ACCURACY-CLAIMS.md C1 (docs/CROWD-ACCURACY.md dense_shibuya)
  - TH: ยังไม่เหมาะกับฝูงชนหนาแน่น: ฝูงชนราว 300 คน นับได้ 1–2 คน (0–2 ในคลิปไทม์แลปส์) · n = 2 + 7 เฟรม (2 คลิป)
  - EN: Not yet suitable for dense crowds: a crowd of about 300 counts as 1–2 people (0–2 on the time-lapse) · n = 2 + 7 frames (2 clips)
  - 中文: 尚不适用于密集人群：约 300 人的人群只计到 1–2 人（延时片段 0–2 人）· n = 2 + 7 帧（2 段片段）
- `cat.r.crowd`
  - TH: รุ่นทดลอง สำหรับอีเวนต์ที่มีคนน้อยถึงปานกลางในโซนที่วาด ตัวเลขยังเป็นเบื้องต้น (ค่าอ้างอิงนับโดย AI ยังรอคนนับ) ยังไม่เหมาะกับฝูงชนหนาแน่น
  - EN: Experimental: for events with sparse-to-medium crowds in a drawn zone; the figures are preliminary (AI reference, human count pending); not yet suitable for dense crowds
  - 中文: 实验性：用于稀疏至中等人群、在划定区域内的活动；数据仍属初步（AI 参考计数，待人工计数）；尚不适用于密集人群

## ข้อจำกัดที่รู้

- ยังไม่เหมาะกับฝูงชนหนาแน่น: คนที่ยืนเบียดกันหรืออยู่ไกลกล้องจะถูกนับขาดมาก
- ยังไม่มีผลวัดจากงานของลูกค้าจริง ตัวเลขด้านบนมาจากวิดีโอสาธารณะ
- ไม่ระบุตัวตนและไม่เก็บภาพ ใช้ดูแนวโน้ม ไม่ใช่ระบบความปลอดภัยของฝูงชน

## สัญญาอนุญาต

- ตัวตรวจจับคน YOLOX-nano (Apache-2.0) บน onnxruntime-web (MIT) และ COCO-SSD สำรอง (Apache-2.0)
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### cat-marketing.html

~~~~text
[cat.c.crowd] ทั้งภาพ นับขาด: 26% เมื่อมี 15–22 คน (n = 12 เฟรม) 58% เมื่อมี 30–50 คนซึ่งหลายคนอยู่ไกล (n = 20) 37–59% สำหรับคนตัวเล็กหรืออยู่ไกล (n = 29, 2 คลิป) โซนใกล้ของหนึ่งคลิปคลาด 1.2 คน (31%, n = 20) ค่าอ้างอิงนับโดย AI ยังไม่ใช่คนนับ
[cat.c.crowdDense] ยังไม่เหมาะกับฝูงชนหนาแน่น: ฝูงชนราว 300 คน นับได้ 1–2 คน (0–2 ในคลิปไทม์แลปส์) · n = 2 + 7 เฟรม (2 คลิป)
[cat.r.crowd] รุ่นทดลอง สำหรับอีเวนต์ที่มีคนน้อยถึงปานกลางในโซนที่วาด ตัวเลขยังเป็นเบื้องต้น (ค่าอ้างอิงนับโดย AI ยังรอคนนับ) ยังไม่เหมาะกับฝูงชนหนาแน่น
~~~~

#### crowd.html

~~~~text
[cr.st] สำหรับอีเวนต์ที่มีคนน้อยถึงปานกลาง · ยังไม่เหมาะกับฝูงชนหนาแน่น · ตัวเลขทุกตัวเป็นผลเบื้องต้น
[cr.accLink] ดูความแม่นยำที่วัดได้ →
[cr.cl.h] ตัวเลขและที่มา (เบื้องต้น)
[cr.cl.dense] ยังไม่เหมาะกับฝูงชนหนาแน่น: ฝูงชนราว 300 คน (Shibuya) หน้านี้นับได้เพียงราว 1 คนต่อภาพ และนับได้ 0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน · n = 2 + 7 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ (วิดีโอ Wikimedia Commons) ผลเบื้องต้น เทียบกับการนับอ้างอิงโดย AI · ใช้กับคนน้อยถึงปานกลางที่ตัวใหญ่พอในภาพเท่านั้น
[cr.cl.field] ความแม่นยำสุดท้าย: ยังไม่ได้วัด · ที่มา: หน้างานจริง (รอผลการนับโดยคน 2 คน และยังไม่มีโครงการนำร่อง) ตัวเลขทุกตัวในหัวข้อด้านล่างเป็นผลเบื้องต้น
[cr.acc2.h] ความแม่นยำของการนับคน (ผลเบื้องต้น)
[cr.acc2.how] วัดกับวิดีโอสาธารณะ 5 คลิป (ทางม้าลายในเมือง คนน้อยถึงแน่นมาก) โดยรันตัวตรวจจับและตัวนับชุดเดียวกับหน้านี้ทีละเฟรม แล้วเทียบกับจำนวนคนที่นับจากภาพนิ่งทุก 1–5 วินาที ผู้นับอ้างอิงรอบนี้เป็น AI ที่ดูภาพนิ่ง ไม่ใช่คนนับ 2 คน ตัวเลขด้านล่างจึงเป็นผลเบื้องต้น: AI เทียบกับ AI และยังไม่ใช่ค่าความจริง
[cr.acc2.r2] คน 15–22 คนเต็มภาพ ขนาดปานกลาง: นับต่ำกว่าจริงเฉลี่ย 26% (ประมาณ 5 คน) · n = 12 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.r6] คน 30–50 คนในภาพ หลายคนอยู่ไกล: นับต่ำกว่าจริงเฉลี่ย 58% (ค่าอ้างอิงเองก็เป็นค่าประมาณ ±20%) · n = 20 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.r3] คนไกลหรือตัวเล็ก (สูงไม่ถึง 1 ใน 10 ของภาพ): นับต่ำกว่าจริง 37–59% · n = 29 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.r1] คนที่ตัวใหญ่พอในโซนช่วงใกล้กล้อง (0–13 คนในโซน วัดจากคลิปเดียว): คลาดเฉลี่ย 1.2 คนต่อภาพ (ประมาณ 31%) แทบไม่เอียงไปทางขาดหรือเกิน · n = 20 ภาพ (1 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.r4] ฝูงชนแน่นมาก (ประมาณ 300 คน): นับได้เพียงราว 1 คนต่อภาพ (และ 0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน) ใช้นับจำนวนไม่ได้ ตัวเลขลดลงจนเกือบเป็นศูนย์แทนที่จะสูงขึ้น หน้านี้จึงแยกไม่ออกจากภาพที่ไม่มีคนและจะไม่ขึ้นป้ายเตือนเอง เว้นแต่ตั้งค่า "จำนวนคนที่คาดว่าจะมีช่วงพีค" ไว้ · n = 2 + 7 ภาพ (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.r5] เส้นนับเข้า–ออก: นับถูก 1 / 1 ครั้งในคลิปคนน้อย และไม่นับเกินในคลิปที่ไม่มีคนข้ามเส้น ข้อมูลยังน้อยเกินกว่าจะสรุปเป็นเปอร์เซ็นต์ · n = 1 ครั้งที่ข้ามเส้น (2 คลิป) · ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น
[cr.acc2.kit] มีชุดนับให้คน 2 คนนับคลิปคนน้อยและคลิปคนปานกลางแยกกัน แล้วคำนวณผลด้วยเครื่องมือเดียวกัน (docs/CROWD-ACCURACY.md)
[cr.acc] ใช้ตัวตรวจจับคนตัวเดียวกับหน้าวิเคราะห์หน้าร้าน ในที่คนแน่นมาก คนที่ยืนบังกันอาจถูกนับขาด และคนเดิมที่ออกจากภาพแล้วกลับมาจะถูกนับเป็นผู้เข้าชมใหม่ ตัวเลขจึงเป็นค่าประมาณสำหรับวางแผน ไม่ใช่ยอดนับอย่างเป็นทางการ ตั้งกล้องสูงมองเฉียงลง แล้วเทียบกับการนับด้วยมือสักช่วงก่อนใช้จริง
[cr.acc2.final] ความแม่นยำสุดท้าย: รอผลการนับโดยคน
~~~~

#### solutions.html

~~~~text
[sl.f.pilotNote] ตัวกรอง "เปิดรับโครงการนำร่อง" รวมระบบที่พร้อมนำร่อง และ LENSIQ Crowd รุ่นทดลองสำหรับอีเวนต์ (สั่งโครงการนำร่องได้ ป้ายสถานะของ Crowd ยังเป็น "ทดลอง")
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### crowd.js

~~~~text
คนในภาพดูตัวเล็ก (ไกลกล้อง) ตัวตรวจจับมักนับขาด — วัดได้ว่านับต่ำกว่าจริงราว 37–59% ย้ายกล้องให้ใกล้ขึ้นหรือวาดโซนเฉพาะช่วงใกล้กล้อง
{p} ของเวลาที่มีคนอยู่ รวมอยู่ใน 10% ของพื้นที่ภาพที่คนเยอะสุด
หมายเหตุ: ตัวเลขทั้งหมดเป็นค่าประมาณจากกล้อง ความแม่นยำสุดท้ายรอการนับเทียบโดยคน (ผลเบื้องต้น: นับต่ำกว่าจริงเมื่อคนตัวเล็ก/ไกล หรือแน่นมาก)
สัดส่วนเวลาใน 10% ของพื้นที่ที่คนเยอะสุด (%)
สัดส่วนใน 10% ของพื้นที่ที่คนเยอะสุด (%)
~~~~

#### docs/ONE-PAGER-CROWD.md

~~~~text
> **สถานะ: รุ่นทดลอง สำหรับอีเวนต์ ยังไม่เหมาะกับฝูงชนหนาแน่น** ตัวเลขทุกตัวเป็นผลเบื้องต้น (ค่าอ้างอิงนับโดย AI รอคนนับ) ฝูงชนราว 300 คนถูกนับได้ราว 1 คนต่อภาพ ห้ามใช้ตัดสินความปลอดภัยของฝูงชน
| คำเตือน | "คนดูเล็ก" เมื่อคนสูงไม่ถึง 10% ของภาพ พร้อมวิธีแก้ · ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค" เพื่อให้เตือนเมื่อตัวตรวจจับล้า |
รูปแบบ: ตัวเลข · ขนาดชุดทดสอบ (n) · ที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) — ไม่มีผลวัดเขียนว่า “ยังไม่ได้วัด” (`docs/ACCURACY-CLAIMS.md`)
ตัวเลขทั้งหมดเป็น **ผลเบื้องต้น**: ค่าจริงนับโดย AI ดูภาพนิ่ง ไม่ใช่คน 2 คน (ผลสุดท้ายรอการนับโดยคน)
| ฝูงชนหนาแน่น (ราว 300 คน) | ยังไม่เหมาะกับฝูงชนหนาแน่น: นับได้ราว 1 คนต่อภาพ (0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน) | n = 2 + 7 ภาพ (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| คน 15–22 คนเต็มภาพ | นับต่ำกว่าจริง 26% | n = 12 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| คน 30–50 คน หลายคนอยู่ไกล | นับต่ำกว่าจริง 58% (ค่าจริงเองเป็นค่าประมาณ ±20%) | n = 20 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| คนตัวเล็ก / อยู่ไกล | นับต่ำกว่าจริง 37–59% | n = 29 ภาพ (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| โซนใกล้กล้อง 0–13 คน | คลาด 1.2 คนต่อภาพ (31%) bias −0.2 | n = 20 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| เส้นนับเข้า/ออก | 1 / 1 ครั้ง ไม่มีการนับเกิน | n = 1 ครั้งที่ข้ามเส้น (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` |
| เวลาต่อภาพบนมือถือระดับกลาง | 355 ms (≈ 2.8 ครั้งต่อวินาที) จำลองด้วยการลดความเร็ว CPU ×4 ไม่ใช่มือถือจริง | n = 27 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ (เครื่องจำลอง) | `docs/CROWD-ACCURACY.md` |
| ความแม่นยำสุดท้าย (คนนับ) | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (รอการนับโดยคน) | `docs/CROWD-ACCURACY.md` |
| ที่ไซต์ลูกค้าจริง | ยังไม่ได้วัด | — | หน้างานจริง: ยังไม่ได้วัด (ยังไม่มีโครงการนำร่อง) | `docs/pilot/PILOT-CROWD.md` |
(`docs/PRICING-RESEARCH.md` §1D) ราคานำร่องอยู่ล่างสุดของช่วง เพราะระบบนับต่ำกว่าจริง 26–59% (n = 12–20 ภาพต่อคลิป 4 คลิป) และยังไม่มีผลหน้างานจริง
It runs on a phone or laptop camera and processes on the device. It does no face recognition and keeps no images. **Status: experimental, for events, not yet suitable for dense crowds**; every figure is preliminary (AI
All figures are **preliminary**: the reference was an AI reviewer looking at still frames, not two human counters (the
| Dense crowd (about 300 people) | not yet suitable for dense crowds: about 1 counted per frame (0–2 on the 100+ person time-lapse) | n = 2 + 7 frames (2 clips) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| 15–22 people, whole view | undercount 26% | n = 12 frames (1 clip) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| 30–50 people, many far | undercount 58% (reference itself an estimate ±20%) | n = 20 frames (1 clip) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| Small / far people | undercount 37–59% | n = 29 frames (2 clips) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| Near zone, 0–13 people | 1.2 people per frame (31%), bias −0.2 | n = 20 frames (1 clip) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| Entry / exit line | 1 / 1 crossings, 0 false | n = 1 crossing (2 clips) | public dataset, preliminary | `docs/CROWD-ACCURACY.md` |
| Time per frame, mid-range phone | 355 ms (≈ 2.8 calls/s), emulated CPU ×4, not a real phone | n = 27 frames (1 clip) | public dataset (emulated device) | `docs/CROWD-ACCURACY.md` |
| Final accuracy (human count) | not measured | — | field: not measured (human count pending) | `docs/CROWD-ACCURACY.md` |
| A real customer site | not measured | — | field: not measured (no pilot yet) | `docs/pilot/PILOT-CROWD.md` |
reference, human count pending). It is for **sparse to medium crowds**. **Approved price list (not on sale yet)**: prices approved by the owner 2026-11-09
(`docs/PRICING-RESEARCH.md` §3.3); nothing is charged yet. **Not yet suitable for dense crowds:** about 300 people were counted as about 1 per frame. Never use it for
~~~~

#### docs/sales/DECK-CROWD.md

~~~~text
> **ร่าง (DRAFT) 2026-11-11** สร้างจาก `docs/ONE-PAGER-CROWD.md` ใช้เฉพาะตัวเลขที่วัดแล้ว แต่ละตัวมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) และไฟล์อ้างอิง
> จาก `docs/ACCURACY-CLAIMS.md` (ทะเบียน C1–C8) และ `docs/CROWD-ACCURACY.md` ถ้าไม่ได้วัด เขียนว่า "ยังไม่ได้วัด"
> **Crowd เป็นรุ่นทดลอง (OP-21) ตัวเลขเป็นผลเบื้องต้น (ค่าอ้างอิงนับโดย AI) ยังไม่เหมาะกับฝูงชนหนาแน่น ห้ามใช้ตัดสินความปลอดภัยของฝูงชน**
| คำเตือน | "คนดูเล็ก" เมื่อคนสูงไม่ถึง 10% ของภาพ พร้อมวิธีแก้ · ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค" เพื่อให้เตือนเมื่อตัวตรวจจับล้า |
- ไฟล์: `docs/ONE-PAGER-CROWD.md`, `docs/CROWD-ACCURACY.md` "What the page does with this"
# 4. ความแม่นยำที่วัดแล้ว (ผลเบื้องต้น)
*Measured accuracy (preliminary)*
| คน 15–22 คนเต็มภาพ · 15–22 people filling the view | นับต่ำกว่าจริง 26% / undercount | n = 12 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น / public dataset, preliminary | `docs/CROWD-ACCURACY.md` (C2) |
| คน 30–50 คน หลายคนอยู่ไกล · 30–50 people, many far | นับต่ำกว่าจริง 58% (ค่าจริงเองเป็นค่าประมาณ ±20%) | n = 20 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` (C3) |
| คนตัวเล็ก / อยู่ไกล · small or far people | นับต่ำกว่าจริง 37–59% | n = 29 ภาพ (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` (C4) |
| โซนใกล้กล้อง 0–13 คน · near zone, 0–13 people | คลาด 1.2 คนต่อภาพ (31%) bias −0.2 | n = 20 ภาพ (1 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` (C5) |
| เส้นนับเข้า/ออก · entry / exit line | 1 / 1 ครั้ง ไม่มีการนับเกิน (ตัวอย่างน้อยมาก / very small sample) | n = 1 ครั้งที่ข้ามเส้น (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` (C7) |
| ความแม่นยำสุดท้าย (คนนับ) · final accuracy | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง: รอการนับโดยคน / field: human count pending | `docs/CROWD-ACCURACY.md` (C8) |
| ที่ไซต์ลูกค้าจริง · at a real customer site | **ยังไม่ได้วัด / not measured** | — | หน้างานจริง: ยังไม่มีโครงการนำร่อง / field | `docs/pilot/PILOT-CROWD.md` |
- ตัวเลขทุกแถวเป็น "ผลเบื้องต้น" เทียบ AI ไม่ใช่ความแม่นยำที่รับรอง
| ฝูงชนหนาแน่น (ราว 300 คน) · a dense crowd (about 300 people) | นับได้ราว 1 คนต่อภาพ (0–2 คนในคลิปไทม์แลปส์ที่มีคนมากกว่า 100 คน) | n = 2 + 7 ภาพ (2 คลิป) | ชุดข้อมูลสาธารณะ ผลเบื้องต้น | `docs/CROWD-ACCURACY.md` (C1) |
- ไฟล์: `docs/CROWD-ACCURACY.md` "Where it breaks", `docs/CROWD-DENSITY-MODELS.md`
- **เหมาะ:** บูธ ล็อบบี้ ทางเข้างาน โซนคิว ที่มีคนในภาพ 5–40 คนช่วงพีค กล้องนิ่ง ติดสูง ≥ 2.5–3 ม. มองลง 30–45° คนในโซนสูงอย่างน้อย 10% ของภาพ
- ความเร็ว: 355 ms ต่อภาพ (ราว 2.8 ครั้งต่อวินาที) เป็นการจำลองด้วยการลดความเร็ว CPU ×4 บนคอมพิวเตอร์ **ไม่ใช่มือถือจริง** (ที่มา: ชุดข้อมูลสาธารณะ เครื่องจำลอง n = 27 ภาพ)
ไฟล์: `docs/CROWD-ACCURACY.md`; วัดบนมือถือจริงอยู่ในชุดนำร่องขั้น 0b
- ผู้จัดงาน/เจ้าของพื้นที่เป็นผู้ควบคุมข้อมูล · ข้อความกฎหมายรอทนายตรวจก่อนขาย (OP-24)
- ราคานำร่องอยู่ล่างสุดของช่วงตลาด เพราะระบบนับต่ำกว่าจริง 26–59% และยังไม่มีผลหน้างานจริง
- เกณฑ์ที่เสนอ: คนในโซน MAPE ≤ 20% · คนในภาพ MAPE ≤ 25% และ bias ไม่ต่ำกว่า −15% · ภาพที่อยู่ในช่วงยอมรับ ≥ 70% · การข้ามเส้นผลต่าง ≤ 10% ต่อ 15 นาที · ≥ 2 ครั้งต่อวินาทีบนมือถือจริง
**not yet suitable for dense crowds**; it gives an estimate, not an exact count, and must never be used for crowd-safety decisions. All figures are preliminary against an AI reference counter (final human count pending):
15–22 people filling the view undercount 26% (n = 12 frames); 30–50 people, many far, undercount 58% (n = 20 frames); small or far people 37–59% (n = 29 frames); near zone of 0–13 people off by 1.2 people per frame, 31%
(n = 20 frames); entry / exit line 1 / 1 (n = 1); about 300 people counted as about 1 per frame (n = 2 + 7 frames). All from public datasets (`docs/CROWD-ACCURACY.md`). At a real customer site: not measured. Speed on a
real phone: not measured (the 355 ms figure is emulated). No age, gender or expression estimate in customer builds. Free 2 hours per device per day (beyond that a licence is needed, enforced by contract from a date announced at least 30 days ahead and starting 30 days after the announcement, not by the product yet). Approved prices excl. 7% VAT, pilot price: 590 THB per device per day, 2,490 THB per device per
# สไลด์ขาย: LENSIQ Crowd (9 สไลด์) / Sales deck: LENSIQ Crowd
~~~~

#### docs/sales/DEMO-SCRIPT-CROWD.md

~~~~text
> ตัวเลขทุกตัวมีที่มาใน `docs/ACCURACY-CLAIMS.md` (ทะเบียน C1–C8) `docs/CROWD-ACCURACY.md` และ `docs/ONE-PAGER-CROWD.md` จุดเปิด OP-xx อยู่ใน `docs/sales/README.md`
> สถานะ (`docs/PAGE-STATUS.md`, OP-21): `crowd.html` = พร้อมนำร่องเฉพาะฝูงชนเบาบางถึงปานกลางในโซนที่วาด ตัวเลขเบื้องต้น **ยังไม่เหมาะกับฝูงชนหนาแน่น**
- เตรียมภาพหน้าจอสำรองของตาราง "ตัวเลขและที่มา" ใน `crowd.html`
| 4:00–5:30 | `crowd.html` คำเตือนบนหน้า | "ระบบเตือนเอง: คนดูเล็กเมื่อสูงไม่ถึง 10% ของภาพ พร้อมวิธีแก้ (ขยับกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้) และขึ้นเครื่องหมาย ≈ 'ค่าประมาณ' เมื่อเห็นตั้งแต่ 15 คน หรือโซนแน่น ≥ 2 คนต่อตารางเมตร" | ป้าย ≈ ข้อความ "คนดูเล็ก" **มีแล้ว** `crowd.html?demo=1` ให้เริ่มด้วยฉากตัวอย่างที่มีคนเล็กและฉากที่มีคน 15+ เพื่อโชว์ทั้งสองคำเตือนทันที ตอนนี้อาจต้องรอฉากตัวอย่างหมุนมาถึง (ฉากที่มีอยู่ไม่มีคนเล็กหรือ 15+) | "ตั้งกล้องสูงได้ถึง 2.5–3 เมตรหรือไม่" |
| 5:30–7:00 | `crowd.html` ส่วน "ตัวเลขและที่มา" | อ่านตรง ๆ: "ผลเบื้องต้น ค่าอ้างอิงนับโดย AI จากภาพนิ่ง ยังไม่ใช่คนนับ 2 คน (รอผลสุดท้าย) คน 15–22 คนเต็มภาพ นับต่ำกว่าจริง 26% (n = 12 ภาพ) คน 30–50 คน หลายคนอยู่ไกล นับต่ำกว่าจริง 58% (n = 20 ภาพ) คนตัวเล็ก/ไกล 37–59% (n = 29 ภาพ) โซนใกล้กล้อง 0–13 คน คลาด 1.2 คนต่อภาพ (31%, n = 20 ภาพ) เส้นนับเข้า/ออก 1 / 1 ครั้ง (n = 1 ซึ่งน้อยมาก) ที่มา ชุดข้อมูลสาธารณะ ที่ไซต์ลูกค้าจริง ยังไม่ได้วัด" | แถว C2–C5, C7, C8 | "ค่าคลาดระดับนี้ยอมรับได้สำหรับวัตถุประสงค์ของท่านหรือไม่" |
| 7:00–8:00 | `crowd.html` ส่วนข้อจำกัด | "ฝูงชนหนาแน่น ยังไม่เหมาะ: ที่ชิบูย่า ราว 300 คนถูกนับได้ราว 1 คนต่อภาพ (0–2 ในคลิปไทม์แลปส์ n = 2 + 7 ภาพ) ตัวนับไม่ได้สูงขึ้นแต่ล้มลง จึงไม่มีสัญญาณเตือนเองเสมอไป ต้องตั้งจำนวนคนที่คาดว่าจะมีช่วงพีค ห้ามใช้ตัดสินความปลอดภัยของฝูงชน เช่น จำกัดคนเข้า ถ้างานคาดว่าราว 50 คนขึ้นไปในภาพเดียว เรายังขายไม่ได้" | แถว C1 และส่วน 'Where it breaks' ใน `docs/CROWD-ACCURACY.md` (ใช้พูด) | "ช่วงพีคที่คาดไว้อยู่ที่เท่าไร" |
- ห้ามบอกว่านับจำนวนคนได้แน่นอน ต้องพูดว่า "ค่าประมาณความหนาแน่น" ห้ามบอกความแม่นยำที่ไซต์ลูกค้า (ยังไม่ได้วัด) ห้ามบอกตัวเลขสุดท้าย (ผลสุดท้ายรอคนนับ ตอนนี้เป็นผลเบื้องต้นเทียบ AI)
- ห้ามบอกว่าเส้นนับเข้า/ออกแม่น (มีเพียง 1 ครั้งที่ข้ามเส้นในชุดทดสอบ n = 1)
> Every number is sourced in `docs/ACCURACY-CLAIMS.md` (register C1–C8), `docs/CROWD-ACCURACY.md` and `docs/ONE-PAGER-CROWD.md`. Open points (OP-xx) are in `docs/sales/README.md`.
> Status (`docs/PAGE-STATUS.md`): `crowd.html` = pilot-ready only for sparse-to-medium crowds in a drawn zone; figures are preliminary; **not yet suitable for dense crowds**.
| 4:00–5:30 | `crowd.html` warnings | The page warns by itself: "people look small" when people are under 10% of the frame height, with the fix (move closer or draw the zone on the near part), and shows "≈ estimate" from 15 people or a zone at 2 people per m² or more. | The ≈ mark and the "people look small" hint. Demo mode: `crowd.html?demo=1` starts on a far-crowd scene that shows both warnings; small-people and 15+ scenes are one tap away. | Can the camera be 2.5–3 m high? |
| 5:30–7:00 | `crowd.html` "figures and sources" | Read plainly. Preliminary: the reference was counted by an AI from still frames, not two human counters (final result pending). 15–22 people filling the frame: undercount 26% (n = 12 frames). 30–50 people, many far: undercount 58% (n = 20 frames). Small or far people: 37–59% (n = 29 frames). Near zone, 0–13 people: off by 1.2 people per frame (31%, n = 20 frames). Entry / exit line: 1 / 1 (n = 1, very small). Source: public dataset. At a real customer site: not measured. | Rows C2–C5, C7, C8 | Is an error of this size acceptable for your purpose? |
| 7:00–8:00 | `crowd.html` limits | Dense crowds are not suitable: at Shibuya about 300 people were counted as about 1 per frame (0–2 on the time-lapse; n = 2 + 7 frames). The count collapses, it does not rise, so there is not always an automatic warning; the operator sets the expected peak. Never use it for crowd-safety decisions such as limiting entry. If you expect about 50 or more people in one view, we cannot sell it yet. | Row C1; the "where it breaks" list in `docs/CROWD-ACCURACY.md` (use it to talk) | What peak do you expect? |
**Do NOT claim:** an exact count (say "density estimate"); accuracy at the customer's site (not measured) or a final figure (pending a human count; today's are preliminary against an AI reference);
emulated by slowing a computer's CPU by four, not a real phone); that the entry / exit line is accurate (only 1 crossing in the test set, n = 1); face recognition, age / gender / expression estimates, emotion
**Prepare:** open https://anirut77.github.io/lensiq/crowd.html in current Chrome or Edge (demo mode, simulated, no camera) and `camera-notice.html` (sign A). Keep a screenshot of the "figures and sources"
use in dense crowds, concerts, crossings or about 50+ people in one view (not suitable, not sold); use for crowd-safety decisions; speed on a real phone (355 ms per frame, about 2.8 per second, is
~~~~

#### docs/sales/ONBOARDING-CROWD.md

~~~~text
> **ร่าง (DRAFT) 2026-11-11** สำหรับลูกค้าหลังตกลงซื้อ ใช้กับ `crowd.html` ฐานข้อมูล: `docs/CROWD-ACCURACY.md`, `docs/pilot/PILOT-CROWD.md`,
| อุปกรณ์ | มือถือหรือโน้ตบุ๊กที่มีกล้อง 1 เครื่องต่อมุมกล้อง ลูกค้าจัดหาเอง ควรเป็นเครื่องระดับกลางขึ้นไป ยังไม่ได้วัดความเร็วบนมือถือจริง (ตัวเลขที่มีเป็นการจำลองบนคอมพิวเตอร์: 355 ms ต่อภาพ ราว 2.8 ครั้งต่อวินาที) |
| มุมกล้อง | คนในโซนสูงอย่างน้อย **10% ของความสูงภาพ** (ต่ำกว่านี้ระบบเตือน "คนดูเล็ก" และนับต่ำกว่าจริง 37–59%) ไม่ย้อนแสง ไม่มีของใหญ่บังตรงหน้ากล้อง (คนตัวใหญ่ใกล้กล้องบังคนอื่น) |
1. **ก่อนงานอย่างน้อย 1 วัน** ลองติดตั้งที่สถานที่จริง ดูภาพว่าคนในโซนสูง ≥ 10% ของภาพ ปรับตำแหน่ง ติดป้าย A
| ขึ้น "คนดูเล็ก" | คนสูงไม่ถึง 10% ของภาพ | ย้ายกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้ ผลที่นับต่ำกว่าจริง 37–59% ในกรณีนี้ |
| ตัวเลขต่ำกว่าที่นับด้วยตา 26–59% | ข้อจำกัดที่ทราบ: คน 15–22 คนเต็มภาพ นับต่ำ 26% (n = 12 ภาพ) คน 30–50 คน นับต่ำ 58% (n = 20 ภาพ) คนไกลหรือตัวเล็ก นับต่ำ 37–59% (n = 29 ภาพ) ผลเบื้องต้นเทียบ AI | ใช้เป็นค่าประมาณและแนวโน้ม ไม่ใช้เป็นจำนวนจริง บอกผู้จัดงานตั้งแต่ต้น |
> **DRAFT 2026-11-11.** For customers after purchase, for `crowd.html`. Based on `docs/CROWD-ACCURACY.md`, `docs/pilot/PILOT-CROWD.md`, `docs/DEPLOYMENT-CHECKLIST.md` and `docs/SUPPORT.md`.
- **Device:** a phone or laptop with a camera, one per camera view, supplied by the customer; mid-range or better. Speed on a real phone has not been measured (the only figure is emulated on a computer:
- **Camera view:** people in the zone at least **10% of the frame height** (below that the page warns "people look small" and undercounts by 37–59%); no backlight; no large object in front of the lens.
1. At least one day before, try the set-up at the real place: check that people in the zone are at least 10% of the frame height; adjust; post sign A.
| "People look small" | People under 10% of the frame height | Move the camera closer, or draw the zone on the near part only. The undercount in this case is 37–59% |
| Count lower than a count by eye by 26–59% | Known limit: 15–22 people filling the frame undercounted by 26% (n = 12 frames); 30–50 people undercounted by 58% (n = 20 frames); small / far people 37–59% (n = 29 frames); preliminary, against an AI reference | Use it as an estimate and a trend, not a true count; tell the organiser from the start |
~~~~

#### docs/sales/customer/ONBOARDING-CROWD.md

~~~~text
ตัวเลขที่ระบุในคู่มือนี้เป็นผลเบื้องต้นเทียบกับค่าอ้างอิงที่ใช้ AI นับ ไม่ใช่การวัดภาคสนามกับงานจริง
| อุปกรณ์ | มือถือหรือโน้ตบุ๊กที่มีกล้อง 1 เครื่องต่อมุมกล้อง ลูกค้าจัดหาเอง ควรเป็นเครื่องระดับกลางขึ้นไป ยังไม่ได้วัดความเร็วบนมือถือจริง (ตัวเลขที่มีเป็นการจำลองบนคอมพิวเตอร์: 355 ms ต่อภาพ ราว 2.8 ครั้งต่อวินาที) |
| มุมกล้อง | คนในโซนสูงอย่างน้อย **10% ของความสูงภาพ** (ต่ำกว่านี้ระบบเตือน "คนดูเล็ก" และนับต่ำกว่าจริง 37–59%) ไม่ย้อนแสง ไม่มีของใหญ่บังตรงหน้ากล้อง (คนตัวใหญ่ใกล้กล้องบังคนอื่น) |
1. **ก่อนงานอย่างน้อย 1 วัน** ลองติดตั้งที่สถานที่จริง ดูภาพว่าคนในโซนสูงอย่างน้อย 10% ของภาพ ปรับตำแหน่ง และติดป้าย A
| ขึ้น "คนดูเล็ก" | คนสูงไม่ถึง 10% ของภาพ | ย้ายกล้องเข้าใกล้ หรือวาดโซนเฉพาะส่วนใกล้ กรณีนี้ผลนับต่ำกว่าจริง 37–59% (คนเล็กหรืออยู่ไกล n = 29 ภาพ ผลเบื้องต้น เทียบกับ AI) |
| ตัวเลขต่ำกว่าที่นับด้วยตา 26–59% | ข้อจำกัดที่ทราบ: คน 15–22 คนเต็มภาพ นับต่ำกว่าจริง 26% (n = 12 ภาพ) คน 30–50 คน นับต่ำกว่าจริง 58% (n = 20 ภาพ) คนเล็กหรืออยู่ไกล นับต่ำกว่าจริง 37–59% (n = 29 ภาพ) ผลเบื้องต้นเทียบกับ AI | ใช้เป็นค่าประมาณและแนวโน้ม ไม่ใช้เป็นจำนวนจริง และบอกผู้จัดงานตั้งแต่ต้น ยังไม่เหมาะกับฝูงชนหนาแน่น |
The figures in this guide are preliminary results against a reference counted by AI; they are not field measurements at a real event.
- **Device:** a phone or laptop with a camera, one per camera view, supplied by the customer; mid-range or better. Speed on a real phone has not been measured (the only figure is emulated on a computer:
- **Camera view:** people in the zone at least **10% of the frame height** (below that the page warns "people look small" and undercounts by 37–59%); no backlight; no large object in front of the lens (a large person close to the camera hides others).
1. **At least one day before,** try the set-up at the real place: check that people in the zone are at least 10% of the frame height; adjust the position; post sign A.
| "People look small" | People are under 10% of the frame height | Move the camera closer, or draw the zone on the near part only. The undercount in this case is 37–59% (small or far people, n = 29 frames, preliminary, against an AI reference) |
| Count lower than a count by eye by 26–59% | Known limit: 15–22 people filling the frame were undercounted by 26% (n = 12 frames); 30–50 people by 58% (n = 20 frames); small or far people by 37–59% (n = 29 frames); preliminary, against an AI reference | Use it as an estimate and a trend, not a true count; tell the organiser from the start. It is not yet suitable for dense crowds |
本指南中的数字是对照 AI 计数参考值得出的初步结果，不是在真实活动现场的实地测量。
- **摄像画面：** 区域内人物的高度至少占画面高度的 **10%**（低于此值页面会提示“人物看起来很小”，并且计数会偏低 37–59%）；不要逆光；镜头前不要有大型物体遮挡（靠近镜头的高大人物会遮住其他人）。
1. **活动前至少 1 天，** 在真实场地试装：检查区域内人物高度是否至少占画面高度的 10%；调整位置；张贴告示 A。
| 提示“人物看起来很小” | 人物高度不足画面高度的 10% | 把摄像头移近，或只在靠近的部分绘制区域。这种情况下计数偏低 37–59%（小或远的人物，n = 29 帧，初步结果，对照 AI 参考值） |
| 计数比肉眼计数低 26–59% | 已知限制：15–22 人充满画面时少计 26%（n = 12 帧）；30–50 人时少计 58%（n = 20 帧）；小或远的人物少计 37–59%（n = 29 帧）；初步结果，对照 AI 参考值 | 仅作为估计值和趋势，不作为真实人数；从一开始就告知主办方。尚不适用于密集人群 |
~~~~

#### help.html

~~~~text
[#h-start-crowd] LENSIQ Crowd นับคนและความหนาแน่น (ทดลอง) เตรียม: โทรศัพท์หรือโน้ตบุ๊กที่มีกล้อง ขาตั้งสูง 2.5–3 เมตรมองเฉียงลง ไฟเลี้ยงตลอดงาน และป้ายแจ้งกล้องที่ทางเข้า ใช้กับคนน้อยถึงปานกลาง ยังไม่เหมาะกับฝูงชนหนาแน่น ลองตั้งกล้องที่สถานที่จริงก่อนวันงาน ให้คนในโซนสูงอย่างน้อย 10% ของความสูงภาพ เปิดหน้า Crowd กดเปิดกล้อง แล้ววาดโซนและเส้นนับเข้า–ออก ตั้งจำนวนคนที่คาดไว้ช่วงพีค เพื่อให้หน้าเตือนเมื่อนับได้น้อยผิดปกติ หลังงาน ส่งออกไฟล์ CSV แล้วปิดกล้อง ระบบไม่บันทึกวิดีโอ ปัญหาที่พบบ่อย: ขึ้นว่า "คนในภาพดูเล็ก" ให้ย้ายกล้องเข้าใกล้หรือวาดโซนเฉพาะส่วนใกล้ · คนแน่นมากแต่นับได้น้อย ให้หยุดใช้ตัวเลขนั้นและแบ่งมุมกล้อง หน้า Crowd · ดูเดโม
[#zh-h-start-crowd] LENSIQ Crowd 人数与密度统计（实验性） 准备： 一台带摄像头的手机或笔记本电脑、高 2.5–3 米向下斜拍的支架、全程电源，以及入口处的摄像头告示。适用于少量到中等人群，尚不适合密集人群。 活动前在实际场地试装：区域内的人至少占画面高度的 10%。 打开 Crowd 页面，开启摄像头，然后绘制区域和进出计数线。 设置高峰时的预计人数，以便计数异常偏低时页面发出提醒。 活动结束后导出 CSV 并关闭摄像头。系统不录制视频。 常见问题： 提示"画面中的人看起来很小"：把摄像头移近或只在近处绘制区域 · 人很多却计数很少：停止使用该数字并拆分摄像头视角。 Crowd 页面 · 查看演示
~~~~

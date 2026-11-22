# Product Check: ตรวจฉลากยา สินค้า และคำโฆษณา — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: medicine.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- อ่านฉลากยาและสินค้า บาร์โค้ด และตรวจถ้อยคำโฆษณาบนเครื่องนี้ ภาพไม่ถูกส่งออก
- อาจอ่านชื่อยาหรือตัวเลขผิด และอาจพลาดคำโฆษณาที่เขียนต่างออกไป ไม่ใช่การยืนยันขั้นสุดท้าย ยืนยันกับเภสัชกรทุกครั้ง

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### ตัวเลขใน docs/accuracy-figures.json

- `adOver`: ค่า **545** (ค่าดิบ 545) — adverts, fresh-3 set: over-claim texts — หลักฐานใน `ACCURACY.md`: `545 over-claim texts and 382 compliant texts`
- `adComp`: ค่า **382** (ค่าดิบ 382) — adverts, fresh-3 set: compliant texts — หลักฐานใน `ACCURACY.md`: `545 over-claim texts and 382 compliant texts`
- `adRecallType`: ค่า **60** (ค่าดิบ 60) — adverts, fresh-3 set, type chosen: over-claim texts with a signal — หลักฐานใน `ACCURACY.md`: `finds **60.0 %** of over-claim texts with the product type chosen`
- `adFFType`: ค่า **2.1** (ค่าดิบ 2.1) — adverts, fresh-3 set, type chosen: false flags per 100 compliant texts — หลักฐานใน `ACCURACY.md`: `**2.1** false flags per 100 compliant texts`
- `adNum`: ค่า **3** — adverts: 'about N in M' (must stay within 5 points of adRecallType) — หลักฐานใน `ACCURACY.md`: `finds about 3 in 5 over-claims in testing`
- `adDen`: ค่า **5** — adverts: 'about N in M' denominator — หลักฐานใน `ACCURACY.md`: `finds about 3 in 5 over-claims in testing`
- `innRecall`: ค่า **0.811** (ค่าดิบ 0.811321) — travel mode, independent synthetic hold-out: INN recall — หลักฐานใน `ACCURACY.md`: `INN recall **0.811** (129 / 159 ingredients`
- `innPrec`: ค่า **0.971** (ค่าดิบ 0.971223) — travel mode, independent synthetic hold-out: INN precision — หลักฐานใน `ACCURACY.md`: `precision **0.971** (135 / 139`
- `innN`: ค่า **173** (ค่าดิบ 173) — travel mode: hold-out size — หลักฐานใน `ACCURACY.md`: `173 invented label texts, 14 languages`

### ข้อความตัวเลขเดิมบนหน้าเว็บ (สร้างจาก docs/accuracy-figures.json)

- `md.pc.ad.acc` (medicine.html)
  - ผลทดสอบอิสระกับข้อความโฆษณาสาธารณะ (โฆษณาเกินจริง 545 ข้อความ ข้อความที่ไม่เกินจริง 382 ข้อความ ติดป้ายโดย AI รอผู้เชี่ยวชาญตรวจ): เมื่อเลือกประเภทสินค้า พบคำโฆษณาเกินจริง 60% แจ้งเตือนผิด 2.1 ครั้งต่อข้อความที่ไม่เกินจริง 100 ข้อความ · n = 545 / 382 · ที่มา: ชุดข้อมูลสาธารณะ
- `md.pc.ad.none` (medicine.html)
  - ไม่พบถ้อยคำที่อยู่ในรายการ ไม่ได้แปลว่าโฆษณานี้ถูกต้องหรือได้รับอนุญาต ในการทดสอบ ระบบพบคำโฆษณาเกินจริงได้ราว 3 ใน 5
- `md.pc.tv.acc` (medicine.html)
  - ผลวัดชื่อสามัญทางยาสากล (INN): recall 0.811 (n = 173 ฉลากสังเคราะห์ วัดโดยผู้ตรวจอิสระ) precision 0.971 · รายการนี้อาจไม่ครบ (เช่น ยาสูตรผสม หรือตัวอักษรที่อ่านผิด) เทียบกับรายการส่วนประกอบบนกล่องเสมอ · ที่มา: ชุดสังเคราะห์

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.med` · ที่มา: none (ยังไม่ได้วัด) · อ้างอิง: docs/MEDICINE.md, docs/FIELD-PILOT.md §2.2
  - TH: มีแผนนำร่องกับกล่องยาจริง 100 กล่อง เภสัชกรยืนยันทุกครั้ง
  - EN: A pilot plan for 100 real boxes exists. A pharmacist confirms every result
  - 中文: 已有 100 个真实药盒的试点计划。每次结果均由药剂师确认
- `cat.r.medicine`
  - TH: ยังไม่ได้วัด ข้อมูลยาไทยครอบคลุมน้อย และการค้น อย. ต้องใช้ระบบหลังบ้านที่ยังไม่ได้เปิด
  - EN: Not measured; Thai product coverage is low and the Thai FDA lookup needs the backend, which is not deployed
  - 中文: 尚未测量；泰国药品覆盖较少，泰国 FDA 查询需要尚未部署的后端

## ข้อจำกัดที่รู้

- อาจอ่านชื่อยาหรือตัวเลขผิด และอาจพลาดคำโฆษณาที่เขียนต่างออกไป
- ไม่ใช่การตรวจขั้นสุดท้าย ยืนยันกับเภสัชกรเสมอ
- ภาพไม่ออกจากเครื่อง

## สัญญาอนุญาต

- PP-OCRv5 (Apache-2.0), BlazeFace (Apache-2.0), zxing-wasm / barcode-detector (MIT)
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### cat-health.html

~~~~text
[cat.r.medicine] ยังไม่ได้วัด ข้อมูลยาไทยครอบคลุมน้อย และการค้น อย. ต้องใช้ระบบหลังบ้านที่ยังไม่ได้เปิด
~~~~

#### medicine.html

~~~~text
[md.pc.ad.acc] ผลทดสอบอิสระกับข้อความโฆษณาสาธารณะ (โฆษณาเกินจริง 545 ข้อความ ข้อความที่ไม่เกินจริง 382 ข้อความ ติดป้ายโดย AI รอผู้เชี่ยวชาญตรวจ): เมื่อเลือกประเภทสินค้า พบคำโฆษณาเกินจริง 60% แจ้งเตือนผิด 2.1 ครั้งต่อข้อความที่ไม่เกินจริง 100 ข้อความ · n = 545 / 382 · ที่มา: ชุดข้อมูลสาธารณะ
[md.pc.models] อ่านตัวอักษรด้วย PP-OCRv5 (Apache-2.0) บนเครื่องนี้ บาร์โค้ดอ่านด้วยตัวอ่านที่มากับเบราว์เซอร์ถ้ามี ถ้าไม่มีใช้ zxing-cpp (Apache-2.0) ยังไม่ได้วัดความแม่นยำกับภาพถ่ายสินค้าจริงในสนาม ตรวจและแก้ข้อความทุกครั้ง
[md.pc.tv.acc] ผลวัดชื่อสามัญทางยาสากล (INN): recall 0.811 (n = 173 ฉลากสังเคราะห์ วัดโดยผู้ตรวจอิสระ) precision 0.971 · รายการนี้อาจไม่ครบ (เช่น ยาสูตรผสม หรือตัวอักษรที่อ่านผิด) เทียบกับรายการส่วนประกอบบนกล่องเสมอ · ที่มา: ชุดสังเคราะห์
[md.pc.ad.none] ไม่พบถ้อยคำที่อยู่ในรายการ ไม่ได้แปลว่าโฆษณานี้ถูกต้องหรือได้รับอนุญาต ในการทดสอบ ระบบพบคำโฆษณาเกินจริงได้ราว 3 ใน 5
~~~~

### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)

#### lensiq-pc-advert.js

~~~~text
ทดลองใช้: ตัวเลขความแม่นยำที่วัดได้อยู่ในแผงด้านบน อาจพลาดถ้อยคำที่เขียนต่างออกไป
~~~~

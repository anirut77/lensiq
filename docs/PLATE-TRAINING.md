# ฝึกตัวหาป้ายทะเบียนไทยด้วยภาพของเจ้าของ / Training the Thai plate detector on the owner's photos (LENSIQ Gate)

> Stream H, 2026-11-13. **No model has been trained on owner photos yet**: the owner has not taken the photos. Every number
> below is a requirement, a rule or a smoke-run fact, never an accuracy result. Public-dataset training (Roboflow sets) stays
> in `docs/PLATE-DATASETS.md` and `tools/train-plate-detector.ipynb`.

## ภาษาไทย

### 1. ทำไมต้องฝึก

ตัวหาป้ายที่ใช้อยู่ (ตัวหาแบบคลาสสิก + LPD-YuNet ที่ฝึกกับป้ายจีน) วางกรอบแรกตรงป้ายได้ **14 จาก 32 ภาพ (44 %)** บนภาพจริงสาธารณะ
(ที่มา: ชุดข้อมูลสาธารณะ Wikimedia Commons 51 ภาพ ป้ายกำกับรุ่น v3, `docs/GATE.md` §3c) ต้องแตะกรอบเอง 25 จาก 32 ภาพ
ตัวหาที่ฝึกด้วยป้ายไทยจากกล้องหน้างานจริงคือทางแก้ เส้นทางนี้ทำให้ฝึกได้**บนเครื่องของเจ้าของ** ภาพไม่ออกจากเครื่อง

### 2. สิ่งที่เจ้าของต้องเตรียม

**จำนวนภาพ (ชุดหลัก, ปรับตามคำตอบเจ้าของ 13 พ.ย. 2569):** ภาพที่มีป้ายราว **635 ภาพ** + ภาพไม่มีป้าย **100 ภาพ** (รวมราว 735)
- กฎแบ่งชุดเก็บ 15 % ไว้ทดสอบ → ราว 95 ภาพมีป้าย / 15 ภาพไม่มีป้ายในชุดทดสอบ กฎเปรียบเทียบ (ข้อ 7) ต้องมีอย่างน้อย
  **60 ภาพมีป้าย และ 15 ภาพไม่มีป้าย** ในชุดทดสอบ ถ้าน้อยกว่านี้ เครื่องมือตอบว่า "ภาพไม่พอ ยังตัดสินไม่ได้" [คำนวณ]
- **รายประเภท:** ประเภทที่มีภาพในชุดทดสอบ**น้อยกว่า 20 ภาพ = "ยังไม่ได้วัด" (UNMEASURED)** ไม่มีการอ้างผลสำหรับประเภทนั้น
  (เครื่องมือเขียนกำกับให้เองในตารางรายประเภท) การจะได้ 20 ภาพในชุดทดสอบ ต้องถ่ายประเภทนั้นราว 135 ภาพ [คำนวณ: 20 ÷ 0.15]

| ประเภท (`category`) | ภาพที่ขอ | คาดว่าอยู่ในชุดทดสอบ (15 %) | วัดผลรายประเภทได้หรือไม่ | หมายเหตุ |
|---|---|---|---|---|
| `white` ป้ายขาวตัวดำ | 180 | ~27 | วัดได้ | รถเก๋ง กระบะ |
| `moto` ป้ายมอเตอร์ไซค์ 3 บรรทัด | 140 | ~21 | วัดได้ (เฉียดเกณฑ์) | |
| `night` กลางคืน (ทุกสี) | 140 | ~21 | วัดได้ (เฉียดเกณฑ์) | ใต้ไฟถนน ไฟหน้ารถ ไฟอินฟราเรดของกล้อง |
| `yellow` ป้ายเหลือง (แท็กซี่ สาธารณะ) | 60 | ~9 | **ยังไม่ได้วัด** | ช่วยฝึก แต่ไม่อ้างผลรายประเภท |
| `green` ป้ายเขียว / ตัวเขียว | 40 | ~6 | **ยังไม่ได้วัด** | |
| `other` ตัวเลขล้วน / ชั่วคราว / ต่างประเทศ | 30 | ~4 | **ยังไม่ได้วัด** | |
| `graphic` ป้ายประมูลลายกราฟิก | 20 | ~3 | **ยังไม่ได้วัด** | หายาก เก็บเท่าที่เจอ |
| `red` ตัวแดง / ป้ายแดง | 15 | ~2 | **ยังไม่ได้วัด** | หายาก เก็บเท่าที่เจอ |
| `blue` ตัวน้ำเงิน | 10 | ~1–2 | **ยังไม่ได้วัด** | หายากมาก เก็บเท่าที่เจอ |
| `none` ไม่มีป้าย | 100 | ~15 | (ใช้วัดอ่านผิดที่) | ป้ายจราจร ป้ายร้าน ป้ายบ้านเลขที่ หลักกิโล |

**มุมและระยะ:** ถ่ายจากจุดที่กล้องไม้กั้นจะติดจริง สูง 1–1.5 ม. ระยะ 2–6 ม. มุมไม่เกิน 30° (ตามคู่มือฮาร์ดแวร์ `docs/GATE.md` §4)
อย่างน้อย **3 สถานที่** (หรือกล้อง) ต่างกัน และบางส่วนถ่ายจากกล้องหน้างานจริง (ภาพนิ่งจากกล้อง IP / มือถือที่ยึดไว้)
iPhone: ตั้ง การตั้งค่า > กล้อง > รูปแบบ > "เข้ากันได้มากที่สุด" (JPEG) ก่อนถ่าย

### 2.1 ฐานในการถ่ายภาพ (ความยินยอมของใคร)

"บันทึกความยินยอม" (`CONSENT.md`) **ไม่ได้หมายถึงความยินยอมของคนขับทุกคน** การขอความยินยอมจากเจ้าของรถ 600 คันทำไม่ได้จริง จึงมีสองแบบ
ให้เลือกต่อชุดภาพ (ติ๊กแบบเดียวใน `CONSENT.md`):

| แบบ | คืออะไร | ข้อดี | ข้อจำกัด |
|---|---|---|---|
| **ก. (A) อนุญาตจากเจ้าของสถานที่ + ป้าย PDPA + ไม่ถ่ายคน** | เจ้าของ / นิติบุคคลของสถานที่ (ลานจอด หมู่บ้าน คอนโด โรงงาน) อนุญาตเป็นหนังสือ, ติดป้ายแจ้งกล้อง PDPA (`gate-notice.html`) ที่ทางเข้าตลอดช่วงถ่าย, ไม่ถ่ายคน (ถ้าติดมาต้องเบลอ) | ทำได้ในปริมาณ 600+ คัน ใช้ฐาน "ประโยชน์อันชอบธรรม" (มาตรา 24(5)) เหมือนกล้องไม้กั้นทั่วไป | ทนายต้องยืนยันก่อนว่าการใช้ภาพป้ายฝึกโมเดลที่ขายได้ใช้ฐานนี้ได้ และต้องทำการประเมินประโยชน์อันชอบธรรม (LIA) |
| **ข. (B) เฉพาะรถของเจ้าของรถที่ตกลง** | ถ่ายเฉพาะรถที่เจ้าของรถ (หรือผู้ขับประจำ) ตกลงก่อนถ่าย เช่น รถพนักงานในโรงงานของเจ้าของ ใบตกลงเก็บเป็นกระดาษในสำนักงาน ในโฟลเดอร์จดแค่จำนวน | ฐานชัดที่สุด (ความยินยอม) ไม่ต้องรอทนายสำหรับชุดเล็ก | ได้ภาพน้อย (หลักสิบคัน) ป้ายสีพิเศษแทบไม่มี ต้องให้ถอนความยินยอมได้ (ลบภาพของรถคันนั้น) พนักงานต้องตกลงได้โดยอิสระ |

**ข้อเสนอ:** ชุดแรกที่โรงงาน (ข้อ 2.2) ใช้ **แบบ ข.** ทันที ชุดหลัก 600+ ภาพใช้ **แบบ ก.** หลังทนายตอบ (คำถามใน
`docs/PDPA-NOTES-FOR-COUNSEL.md` หัวข้อ H(c)) ถ้าทนายไม่รับแบบ ก. ชุดหลักต้องใช้แบบ ข. ที่หลายสถานที่ ซึ่งใช้เวลานานกว่ามาก

- ทั้งสองแบบ: หลีกเลี่ยงคนในภาพ ถ้ามีใบหน้า คนขับ หรือคนเดินผ่าน **ต้องเบลอทุกคนก่อนฝึก** (ข้อ 4) ไม่ใช้ภาพจากอินเทอร์เน็ต / โซเชียล
- กรอก `CONSENT.md` (แม่แบบสร้างให้โดย `init`): แบบที่ใช้ หนังสืออนุญาตของเจ้าของสถานที่ (แบบ ก.) ป้าย PDPA ติดที่ไหน ตั้งแต่-ถึง
  จำนวนเจ้าของรถที่ตกลง (แบบ ข. จำนวนเท่านั้น ไม่มีชื่อ) วันที่ ผู้ถ่าย (ตำแหน่ง ไม่ใช่ชื่อ) วันลบภาพต้นฉบับ ใครเข้าถึงได้
  เครื่องมือจะไม่ยอมแบ่งชุดถ้าไม่มีไฟล์นี้

### 2.2 ชุดแรก (ทดลอง) ที่โรงงานของเจ้าของ

ใช้**แบบ ข.**: รถของพนักงาน / คนที่ตกลงเท่านั้น เก็บในโฟลเดอร์แยก `~/LENSIQ-field/plates-train-batch1/`

| | จำนวน | หมายเหตุ |
|---|---|---|
| รถยนต์ (ป้ายขาว ส่วนใหญ่) | ~30 คัน × 3 ภาพ = ~90 ภาพ | ระยะ 2 ม. / 4 ม. / 6 ม. หรือมุมตรง / เฉียง 20–30° จากจุดที่จะติดกล้อง |
| มอเตอร์ไซค์ | ~15 คัน × 2 ภาพ = ~30 ภาพ | |
| กลางคืน | ~20 ภาพ (จากรถชุดเดียวกัน) | ใต้ไฟโรงงาน / ไฟหน้ารถคันอื่น |
| ไม่มีป้าย | ~30 ภาพ | ป้ายในโรงงาน ป้ายห้อง ป้ายหลักเลข |
| **รวม** | **~170 ภาพ** | ป้ายสีอื่น (เหลือง เขียว แดง น้ำเงิน) ถ้าไม่มีก็ไม่ต้องหา |

**เข้ากับการแบ่งชุดอย่างไร:** แบ่งด้วยกฎเดียวกัน (รถหนึ่งคัน = หนึ่งกลุ่ม) แต่ใช้ `split --dev-batch` ซึ่งล็อกในชื่อ
`plate-split-v1-devbatch` จึง**ไม่ใช้สิทธิ์ล็อกชุดทดสอบหลัก** ~45 คัน → ชุดทดสอบราว 7 คัน ≈ 20 ภาพมีป้าย [คำนวณ] ต่ำกว่าเกณฑ์ 60
`plate-det-compare` จะตอบว่า "dev batch: ไม่มีการตัดสินรับโมเดล" เสมอ เมื่อทำชุดหลัก ให้ใส่ภาพชุดแรกรวมได้ แต่ใช้
`split --train-only ~/LENSIQ-field/plates-train-batch1/dataset/MANIFEST.json` เพื่อ**ไม่ให้ภาพชุดแรกอยู่ในชุดทดสอบของชุดหลัก**
(เพราะเคยดูผลแล้ว)

**ชุดแรกพิสูจน์ได้:** เส้นทางทั้งหมดใช้ได้กับภาพจริง (ติดป้ายกำกับ เบลอ แบ่งชุด ส่งออก ฝึกข้ามคืน ส่งออก ONNX โหลดในเบราว์เซอร์)
เวลาที่ใช้ติดป้ายต่อภาพ ปัญหาภาพ (HEIC เบลอ แสง) และตัวเลขชุดซ้อม (dev) ที่ติดป้าย "dev, factory batch, not a claim"
**ชุดแรกพิสูจน์ไม่ได้:** ความแม่นยำใด ๆ การตัดสินรับโมเดล ผลรายประเภท (ทุกประเภทต่ำกว่า 20 ภาพทดสอบ = ยังไม่ได้วัด)
ผลที่สถานที่อื่น / กล้องอื่น ห้ามใช้ตัวเลขชุดแรกในเอกสารขายหรือหน้าเว็บ
- ระยะเก็บ (ข้อเสนอ): ภาพต้นฉบับใน `photos/` ลบภายใน 30 วันหลังส่งออกชุดฝึก ภาพที่เบลอแล้วเก็บจนทำการ์ดโมเดลเสร็จ แล้วลบ
- คำถามถึงทนาย: `docs/LEGAL-PACKET.md` / `docs/PDPA-NOTES-FOR-COUNSEL.md` (ใช้ภาพป้ายทะเบียนฝึกโมเดลเพื่อขาย ฐานกฎหมาย ระยะเก็บ)

**โครงโฟลเดอร์ (นอก repo เท่านั้น):**

```
~/LENSIQ-field/plates-train/
  CONSENT.md                       บันทึกการถ่าย (กรอกเอง)
  photos/                          ภาพต้นฉบับ JPEG / PNG โฟลเดอร์เดียว ชื่อไฟล์ไม่ซ้ำ (ลบภายใน 30 วันหลังส่งออก)
  labels/plates-photo-labels.csv   กรอบป้าย + เลขทะเบียน (ทำด้วยเครื่องมือติดป้ายกำกับ)
  labels/privacy.json              กรอบเบลอ + "ตรวจแล้ว" รายภาพ
  blurred/                         ภาพที่เบลอใบหน้าแล้ว (ใช้ฝึกเฉพาะโฟลเดอร์นี้)
  splits/split-plate-split-v1.json การแบ่งชุดที่ล็อกแล้ว
  dataset/                         ชุดฝึกแบบ YOLOX (กรอบเท่านั้น ไม่มีเลขทะเบียน) + ชุดทดสอบพร้อมป้ายกำกับ
  runs/<ชื่อรอบ>/                  ผลการฝึก ไฟล์ ONNX และ MODEL_CARD.md
```

### 3. ขั้นตอน

```sh
node tools/plate-train-prep.mjs init             # สร้างโฟลเดอร์ + แม่แบบ CONSENT.md
# วางภาพใน ~/LENSIQ-field/plates-train/photos/ และกรอก CONSENT.md
node tools/plate-labeller.mjs                    # เปิดเครื่องมือติดป้ายกำกับ (เฉพาะเครื่องนี้) แล้วเปิดลิงก์ใน Chrome
node tools/plate-train-prep.mjs status           # นับว่าติดป้ายแล้ว / ตรวจแล้ว / เบลอแล้วกี่ภาพ
node tools/plate-train-prep.mjs split            # แบ่งชุดตามกฎที่ล็อกไว้ แล้วล็อก sha256 → commit evals-locks/plate-train-split.sha256 ก่อนฝึก
node tools/plate-train-prep.mjs export           # สร้าง dataset/ จากภาพที่เบลอแล้วและ "ตรวจแล้ว" เท่านั้น
python3 tools/plate_train.py setup               # ครั้งแรก: venv + YOLOX 0.3.0 + น้ำหนักเริ่มต้น (ดาวน์โหลดราว 1 GB)
python3 tools/plate_train.py train --name run1   # ฝึก 150 รอบ บนเครื่องนี้ (หลายชั่วโมง เสียบไฟ เปิดข้ามคืน)
python3 tools/plate_train.py onnx --name run1    # ส่งออก ONNX + MODEL_CARD.md
node tools/plate-det-compare.mjs --model ~/LENSIQ-field/plates-train/runs/run1/plate_yolox_nano_416.onnx
```

### 4. การติดป้ายกำกับและความเป็นส่วนตัว (เครื่องมือ `tools/plate-labeller.mjs`)

- **ความปลอดภัยของเครื่องมือ (แก้ตามผู้ตรวจอิสระ 13 พ.ย. 2569):** เปิดลิงก์ที่เครื่องมือพิมพ์ (มีกุญแจสุ่มของรอบนั้น `?t=…`) เท่านั้น
  เครื่องมือเสิร์ฟไฟล์ใน repo เฉพาะรายการที่กำหนดไว้ (หน้าเครื่องมือ โค้ดเบลอ และโมเดลหาใบหน้าที่อยู่ใน git) ไม่ยอมรับ path ที่มี `..` `\` หรือ `%2f`
  ไม่ยอมรับคำขอที่ Host ไม่ใช่ `127.0.0.1:พอร์ต` / `localhost:พอร์ต` (กันเว็บอื่นเข้ามาทาง DNS rebinding) การบันทึกต้องมาจากหน้าเครื่องมือเอง
- **เบลอแล้วแก้กรอบทีหลัง:** ตอนส่งออกภาพที่เบลอ เครื่องมือจดค่าแฮชของกรอบเบลอไว้ (`labels/blurred-index.json`) ถ้าแก้กรอบเบลอหลังจากนั้น
  `export` จะไม่เอาภาพนั้นเข้าชุดฝึกจนกว่าจะส่งออกภาพที่เบลอใหม่ ภาพที่มี EXIF ถูกปฏิเสธทั้งตอนบันทึกและตอนส่งออก
- **ล็อกชุดครอบคลุมป้ายกำกับด้วย:** ค่า sha256 ของการแบ่งชุดรวมเลขทะเบียน กรอบ ประเภท "ไม่แน่ใจ" และกรอบไม่นับของทุกภาพ แก้ป้ายกำกับหลังล็อก = `export` ไม่ยอม

- เปิดเฉพาะบน 127.0.0.1 (เครื่องนี้) อ่านภาพจาก `photos/` เขียนได้แค่ `labels/` และ `blurred/` ไม่ส่งอะไรออกนอกเครื่อง
- **กรอบป้าย:** ลากรอบตัวป้าย (ไม่รวมกรอบป้ายร้านรถ) กรอกเลขทะเบียนบรรทัดแรก (มอเตอร์ไซค์: บรรทัด 1 + 3) ประเภท จังหวัด (ไม่บังคับ)
  ติ๊ก "ไม่แน่ใจตัวอักษร" ถ้าอ่านไม่ชัด ป้ายเล็กมากที่อ่านไม่ได้ ใช้ "ไม่นับ" ภาพไม่มีป้าย ติ๊ก "ภาพนี้ไม่มีป้าย"
- **กรอบเบลอ:** ระบบเสนอกรอบใบหน้าอัตโนมัติด้วย BlazeFace (Apache-2.0 ตัวเดียวกับ Product Check) **ค่าตั้งเดียวกับที่วัดแล้วทุกค่า**
  (`LQPC.FACE_BLUR` รอบ 2: ตัดภาพ 3 × 3 ซ้อน 20 % เกณฑ์ 0.5 ขยายกรอบ 15 % ทั้งภาพ + ช่องตัด + ภาพขนาดอัปโหลด 1,024 px) แต่ตัวนี้**พลาดใบหน้าจริง**:
  **ใบหน้าที่ถูกเบลอไม่ถึงครึ่ง 42 / 152 = 27.6 % และถูกเบลอไม่ถึง 90 % ของใบหน้า 58 / 152 = 38.2 % [30.8–46.1]** (ชุด held-out รอบ 2)
  ใบหน้าเล็กพลาดมากกว่ามาก: กว้าง 20–40 px เบลอไม่ถึงครึ่ง 63.6 % (28 / 44), 40–80 px 26.1 % (6 / 23)
  ที่มา: ชุดข้อมูลสาธารณะ Open Images V7 (ภาพทั่วไป ไม่ใช่ภาพหน้าไม้กั้น), `docs/product-check/FACE-BLUR-RESULTS.md` §5
  ใบหน้าหลังกระจกรถ**ยังไม่ได้วัดเลย** และมักเล็ก จึงคาดว่าพลาดมากกว่านี้
  ดังนั้น**คนต้องตรวจทุกภาพ** และวาดกรอบเบลอเพิ่มทับทุกใบหน้า ทุกคน เบอร์โทร ชื่อ หรือข้อความส่วนตัวบนรถ แล้วติ๊ก "ตรวจแล้ว"
- "ส่งออกภาพที่เบลอแล้ว" เขียน `blurred/<ภาพ>` โดยเบลอและทำเป็นช่อง (pixelate) ทุกกรอบแบบย้อนกลับไม่ได้ และตัดข้อมูล EXIF (รวม GPS) ทิ้ง
  ภาพที่ยังไม่ติ๊ก "ตรวจแล้ว" จะไม่ถูกส่งออกและไม่ถูกใช้ฝึก
- **เก็บป้ายเท่าที่จำเป็น:** ไฟล์ฝึก (`dataset/annotations/*.json`) มีแค่กรอบ ไม่มีเลขทะเบียนหรือจังหวัด เลขทะเบียนใช้เฉพาะในไฟล์ป้ายกำกับของชุดทดสอบ
  (`dataset/test2017/plates-photo-labels.csv`) เพื่อวัดว่าอ่านถูกหรือไม่ ทุกไฟล์อยู่นอก repo

### 5. กฎแบ่งชุด (ล็อกก่อนฝึก: `plate-split-v1`)

- ภาพที่มีป้ายเดียวกัน (รถคันเดียวกันถ่ายต่างวัน หรือภาพที่มีสองป้ายเชื่อมกัน) อยู่**กลุ่มเดียวกัน** จึงไม่มีรถคันเดียวกันทั้งในชุดฝึกและชุดทดสอบ
- ภาพไม่มีป้ายเป็นกลุ่มของตัวเอง
- กลุ่ม → sha256("lensiq-plate-split:v1:" + กลุ่ม) → 8 ตัวแรก mod 100: ต่ำกว่า 70 = ฝึก, 70–84 = ตรวจระหว่างฝึก (val), 85 ขึ้นไป = ทดสอบ
- `split` บันทึก sha256 ลง `~/LENSIQ-field/evals/plate-train/locked.sha256` และ `evals-locks/plate-train-split.sha256` ต้อง commit ไฟล์หลัง
  **ก่อน**ฝึกหรือวัดผล (กฎเจ้าของ 13 พ.ย. 2569) ถ้าเพิ่มภาพหรือแก้เลขทะเบียนหลังล็อก เครื่องมือจะไม่ยอม: ชุดใหม่ = รุ่นกฎใหม่ = ชุดทดสอบใหม่
- ทดสอบ: `tests/unit/plate-train-prep.test.js`

### 6. การฝึก

- **ฝึกบน Mac ของเจ้าของเท่านั้น (คำตอบเจ้าของ 13 พ.ย. 2569: แบบ ก.)** (`tools/plate_train.py`) ภาพไม่ออกจากเครื่อง Mac ไม่มี CUDA
  จึงฝึกด้วย CPU (หรือ `--device mps`) ผ่านตัวเรียก `tools/plate_train_launch.py` ที่เปลี่ยนเฉพาะส่วนที่ YOLOX 0.3.0 ผูกกับ CUDA
- **ฝึกข้ามคืน และเฉพาะเมื่อไม่มีทีมอื่นรันงานหนัก:** ตัวเรียก**ไม่ยอมเริ่มฝึก** (ไม่รอ ไม่ลองซ้ำ บอกเหตุผลแล้วจบ, รหัสออก 3) ถ้า
  (1) load เฉลี่ย 1 นาที > ครึ่งหนึ่งของจำนวนคอร์ (ขั้นต่ำ 2; Mac 8 คอร์ = 4.0) (2) มี Chrome ของชุดทดสอบ e2e (`lq-e2e`) หรือกำลังรัน
  `tests/e2e/run.mjs` / `node --test` (3) มีการฝึกอีกตัวรันอยู่ (4) มีโปรเซส node / python / Chrome ตัวใดใช้ CPU ≥ 50 %
  ให้ปิดงานเหล่านั้นหรือรอจนเสร็จ แล้วสั่งใหม่ (ทดสอบ: `tests/python/test_plate_train_busy.py`)
- สูตร: YOLOX-nano, 1 คลาส `plate`, ภาพเข้า 416, 150 รอบ, mosaic 0.5, สุ่มสี HSV, หมุน ±5°, ไม่กลับซ้ายขวา (เหมือนโน้ตบุ๊ก Colab)
- **ไม่ใช้ Colab กับภาพของเจ้าของ** (เจ้าของเลือกแบบ ก. 13 พ.ย. 2569) โน้ตบุ๊ก Colab ยังใช้กับชุดข้อมูลสาธารณะได้ตาม `docs/PLATE-DATASETS.md`
- การทดลองรอบสั้น (smoke): `python3 tools/plate_train.py smoke --root <โฟลเดอร์ชั่วคราว>` ฝึก 1 รอบกับภาพสังเคราะห์ 8 ภาพ ใช้ตรวจว่าเครื่องพร้อม
  ไม่ใช่โมเดลที่ใช้งาน

### 7. วัดผลเทียบกับตัวหาปัจจุบัน (กฎล็อกไว้: `plate-compare-v1`)

`tools/plate-det-compare.mjs` รัน `tools/plate-field-eval.mjs` สองครั้งบนชุดทดสอบที่ล็อกไว้ (ตัวหาปัจจุบัน / ตัวหาปัจจุบัน + โมเดลใหม่เป็นแหล่งกรอบเพิ่ม)
ที่มาของทุกตัวเลข: **"field (owner photos, locked test split)"** รับโมเดลใหม่**เมื่อผ่านทุกข้อ**:
1. วางกรอบแรกตรงป้ายได้มากกว่าเดิม (ดีขึ้นจริง ไม่ใช่เท่าเดิม)
2. อ่านอัตโนมัติถูกทั้งป้ายไม่น้อยกว่าเดิม
3. อ่านอัตโนมัติผิดที่ในภาพไม่มีป้ายไม่มากกว่าเดิม 4. และในภาพมีป้าย ไม่มากกว่าเดิม
5. อ่านผิดตัวอักษรไม่มากกว่าเดิม 6. ต้องแตะกรอบเองไม่มากกว่าเดิม
7. เวลาต่อภาพ (มัธยฐาน) ช้าลงไม่เกิน 600 ms
ชุดทดสอบต้องมีอย่างน้อย 60 ภาพมีป้าย และ 15 ภาพไม่มีป้าย มิฉะนั้น "ยังตัดสินไม่ได้" ชุดแรก (dev batch) ไม่มีการตัดสินเสมอ
ผลพิมพ์ตารางรายประเภทด้วย: ประเภทที่มีภาพทดสอบน้อยกว่า 20 ภาพเขียนว่า **UNMEASURED: ไม่อ้างผลสำหรับประเภทนี้**
(`plate-field-eval` ก็พิมพ์บรรทัด "UNMEASURED types" แบบเดียวกัน)
ชุดสาธารณะ Wikimedia 51 ภาพ (ครึ่ง held-out) รายงานเพิ่มได้ แต่ไม่ใช้ตัดสิน ผ่านแล้ว**เจ้าของยืนยัน**ก่อนใส่ในหน้าเว็บ (คนยังยืนยันทุกการอ่านป้าย)

### 8. นำเข้าใช้งาน (หลังผ่านและเจ้าของยืนยัน)

ตาม `docs/PLATE-DATASETS.md` §4: คัดลอก ONNX ไป `vendor/models/plate-det-th/` พร้อม LICENSE (Apache-2.0), README (ที่มา sha256),
MODEL_CARD.md แล้ว `LQPlate.registerDetector(fn, {proposals: true})` ตัวหาเดิมยังทำงานคู่กัน ไม่ลบอะไร
แล้วรันชุดทดสอบ e2e ของ Gate และวัดภาคสนาม (`docs/FIELD-PILOT.md`: สัดส่วน "ต้องแตะ")

## English

**Why.** The shipped finder (classical + LPD-YuNet, trained on Chinese plates) puts its top box on the plate in 14 of 32
real photos (44 %; public dataset, Wikimedia Commons, labels v3, `docs/GATE.md` §3c). A detector trained on Thai plates
from real gate cameras is the fix. This path trains **on the owner's machine**; the photos never leave it.

**What the owner provides (main set, adjusted 2026-11-13).** ~635 photos with a plate + 100 without: white 180,
motorcycle 140, night 140, yellow 60, green 40, other 30, graphic 20, red 15, blue 10 (red, blue and graphic are rare:
collect what you find), none 100; from the real gate camera position (1–1.5 m high, 2–6 m, ≤ 30°), at ≥ 3 sites /
cameras, JPEG. The fixed split keeps 15 % for test; the comparison rule needs ≥ 60 plate and ≥ 15 plate-less test photos
[calc]. **Per type, fewer than 20 test photos = UNMEASURED, no claim for that type** (about 135 photos of a type are needed
for 20 in test [calc]); with these quotas only white, motorcycle and night can be measured per type, the other types help
training but carry no per-type claim. The compare tool and `plate-field-eval` print the UNMEASURED types.

**Whose consent (`CONSENT.md`).** Not every driver's: per-driver consent for 600 cars is not workable. One basis per batch:
**A** — the site owner's written permission + the PDPA camera notice sign (`gate-notice.html`) posted at the entrance for
the whole shoot + no people photographed (blurred if caught); scales to 600+ cars, relies on legitimate interest
(s. 24(5)), needs counsel's OK and a legitimate-interest assessment before the photos train a model that is sold.
**B** — only vehicles whose owner (or regular driver) agreed before the photo, e.g. staff at the owner's factory; clearest
basis (consent), no need to wait for counsel, but small (tens of cars), few special plates, withdrawal must be honoured
(delete that car's photos), and staff must be free to say no. Agreement sheets stay on paper in the office; the folder
holds the count only, no names. **Recommendation:** B for the first factory batch now; A for the main set once counsel
answers (`docs/PDPA-NOTES-FOR-COUNSEL.md` H(c)). Retention proposal: originals deleted within 30 days of the export.

**First batch at the owner's factory (basis B, folder `~/LENSIQ-field/plates-train-batch1/`).** ~30 cars × 3 photos (2 / 4 /
6 m, or straight / 20–30° from the planned camera spot) ≈ 90, ~15 motorcycles × 2 ≈ 30, ~20 night photos of the same
vehicles, ~30 plate-less photos: **~170 photos**. Same split rule, but `split --dev-batch` locks it as
`plate-split-v1-devbatch` (it does not use the main held-out lock); ~45 vehicles leave about 7 in test, ≈ 20 plate photos
[calc], below the 60 rule, and `plate-det-compare` always answers "dev batch: no adoption decision". For the main set,
`split --train-only …/plates-train-batch1/dataset/MANIFEST.json` keeps the first batch out of the main test split (it has
been looked at). **It can prove:** the whole path works on real photos (label, blur, split, export, overnight training,
ONNX in the browser), labelling time per photo, photo problems, and dev numbers labelled "dev, factory batch, not a claim".
**It cannot prove:** any accuracy, an adoption decision, any per-type result (every type is under 20 test photos), or
anything about other sites or cameras; its numbers never go into sales material or pages.

**Folder layout** (outside the repo): `~/LENSIQ-field/plates-train/{CONSENT.md, photos/, labels/, blurred/, splits/,
dataset/, runs/}` (Thai section §2).

**Steps.** `plate-train-prep init` → photos + CONSENT.md → `plate-labeller` (127.0.0.1 only) → `plate-train-prep split`
(locks the split; commit `evals-locks/plate-train-split.sha256` before training or measuring) → `plate-train-prep export`
→ `plate_train.py setup / train / onnx` → `plate-det-compare --model …`.

**Labelling and privacy.** Plate boxes + text + category; ignore boxes for tiny unreadable plates; blur boxes. BlazeFace
proposes face boxes with exactly the measured Product Check setting (`LQPC.FACE_BLUR`, round 2: 3 × 3 tiles, 20 % overlap,
threshold 0.5, pad 0.15, whole frame + tiles + 1,024-px upload image) and still misses faces: **42 / 152 = 27.6 % of real
faces under 50 % covered and 58 / 152 = 38.2 % [30.8–46.1] under 90 % covered (round-2 held-out)**; small faces far worse
(20–40 px: 28 / 44 = 63.6 % under 50 % covered; 40–80 px: 6 / 23 = 26.1 %). Source: public dataset, Open Images V7
(general photos, not gate scenes), `docs/product-check/FACE-BLUR-RESULTS.md` §5. Faces behind windscreens are unmeasured
and usually small, so expect more misses. A person therefore checks every photo, adds blur boxes over every face, person, phone
number or name on a vehicle, and ticks "checked". Export blurs + pixelates irreversibly and drops EXIF (incl. GPS). Only
checked + blurred photos are exported. Training files carry boxes only: no plate text, no province; the plate text exists
only in the held-out labels for the evaluation. Everything stays outside the repo.

**Labeller security and integrity (independent review 2026-11-13).** Open only the printed link (it holds this run's
random key, `?t=…`, required on `/api/*` and `/photos/*`). Repo files are served from an exact allow-list (the page, the
blur code, the git-tracked face detector); raw paths with `..`, `\` or encoded slashes / dots are refused; every request
must carry Host `127.0.0.1:PORT` or `localhost:PORT` (DNS rebinding) and every POST the matching Origin. The blur boxes'
hash is recorded at blurred export (`labels/blurred-index.json`); `export` leaves out a photo whose boxes changed since, and
any blurred photo with EXIF. The locked split hash covers every photo's labels (text, box, category, unsure, ignore).

**Split rule `plate-split-v1` (locked).** Union of photos that share a plate key (same car on different days never in
train and test); plate-less photo = own group; sha256("lensiq-plate-split:v1:" + group) → first 8 hex mod 100: < 70 train,
< 85 val, else test. Changing photos or labels after the lock is refused (new rule version = new held-out set).

**Training.** Mac only (owner answer 2026-11-13, option ก), overnight, and only when no other team runs heavy jobs: the
launcher refuses to start (exit 3, clear message) when the 1-minute load is above half the cores (at least 2), an e2e
Chrome (`lq-e2e`) or test runner is running, another training is running, or any node / python / Chrome process uses
≥ 50 % CPU. Local (`tools/plate_train.py`, YOLOX 0.3.0 Apache-2.0 cloned at a pinned tag, YOLOX-nano COCO
start weights Apache-2.0; same recipe as the notebook; CPU or MPS via `tools/plate_train_launch.py`, which replaces only the
CUDA-bound pieces of YOLOX 0.3.0 in memory). No Colab for owner photos. Never Ultralytics; never YOLOv9 / open-image-models.

**Comparison rule `plate-compare-v1` (locked).** Adopt the trained model as an extra proposal source only if, on the locked
field test split (source "field (owner photos, locked test split)"): detection strictly better; exact automatic reads not
lower; false auto-reads (plate-less and plate photos) not higher; wrong-text reads not higher; taps needed not higher;
median time per photo at most +600 ms; and the split holds ≥ 60 plate / ≥ 15 plate-less photos (else "no decision"). The
owner confirms before it ships; a person still confirms every read.

**Plug-in.** `docs/PLATE-DATASETS.md` §4 (vendor folder with LICENSE, README with sha256, MODEL_CARD; `registerDetector`
with `proposals: true`; nothing removed), then the Gate e2e suite and the field pilot's "taps needed".

**Tests.** `tests/unit/plate-train-prep.test.js` (split, privacy gate, COCO without text, compare rule, `--det-model`),
`tests/python/test_plate_train.py` (licence guard, outside-the-repo rule, boxes only, recipe). Lock hashes:
`evals-locks/gate-hall-h.sha256`.

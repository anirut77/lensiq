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

**จำนวนภาพ (ขั้นต่ำเพื่อให้ตัดสินผลได้):** ภาพที่มีป้าย **600 ภาพ** + ภาพที่ไม่มีป้าย **100 ภาพ** (รวมราว 700)
- เหตุผล: กฎแบ่งชุดเก็บ 15 % ไว้ทดสอบ → ราว 90 ภาพมีป้าย / 15 ภาพไม่มีป้ายในชุดทดสอบ กฎเปรียบเทียบ (ข้อ 7) ต้องมีอย่างน้อย
  **60 ภาพมีป้าย และ 15 ภาพไม่มีป้าย** ในชุดทดสอบ ถ้าน้อยกว่านี้ เครื่องมือจะตอบว่า "ภาพไม่พอ ยังตัดสินไม่ได้" [คำนวณ]
- ถ้าได้ 300 ภาพ ฝึกได้ แต่ชุดทดสอบจะมีราว 45 ภาพ ตัดสินไม่ได้ ต้องเก็บเพิ่ม

**แยกตามสภาพ (เป้าขั้นต่ำต่อประเภท):**

| ประเภท (`category`) | ภาพ | หมายเหตุ |
|---|---|---|
| `white` ป้ายขาวตัวดำ | 150 | รถเก๋ง กระบะ |
| `yellow` ป้ายเหลือง (แท็กซี่ สาธารณะ) | 60 | |
| `green` ป้ายเขียว / ตัวเขียว | 40 | |
| `red` ตัวแดง / ป้ายแดง | 40 | |
| `blue` ตัวน้ำเงิน | 30 | |
| `moto` ป้ายมอเตอร์ไซค์ 3 บรรทัด | 120 | |
| `night` กลางคืน (ทุกสี) | 100 | ใต้ไฟถนน ไฟหน้ารถ ไฟอินฟราเรดของกล้อง |
| `graphic` ป้ายประมูลลายกราฟิก | 30 | |
| `other` ตัวเลขล้วน / ชั่วคราว / ต่างประเทศ | 30 | |
| `none` ไม่มีป้าย | 100 | ป้ายจราจร ป้ายร้าน ป้ายบ้านเลขที่ หลักกิโล |

**มุมและระยะ:** ถ่ายจากจุดที่กล้องไม้กั้นจะติดจริง สูง 1–1.5 ม. ระยะ 2–6 ม. มุมไม่เกิน 30° (ตามคู่มือฮาร์ดแวร์ `docs/GATE.md` §4)
อย่างน้อย **3 สถานที่** (หรือกล้อง) ต่างกัน และบางส่วนถ่ายจากกล้องหน้างานจริง (ภาพนิ่งจากกล้อง IP / มือถือที่ยึดไว้)
iPhone: ตั้ง การตั้งค่า > กล้อง > รูปแบบ > "เข้ากันได้มากที่สุด" (JPEG) ก่อนถ่าย

**ความยินยอม / ประกาศ (ทำก่อนถ่าย):**
- ถ่ายในที่ที่เจ้าของสถานที่อนุญาตเป็นลายลักษณ์อักษร (ลานจอดของตัวเอง หมู่บ้าน / คอนโดที่เป็นลูกค้านำร่อง) และ**ติดป้ายแจ้งกล้อง PDPA**
  (`gate-notice.html`) ระหว่างเก็บภาพ ภาพรถพนักงาน / คนรู้จัก: ขอความยินยอม
- หลีกเลี่ยงคนในภาพ ถ้ามีใบหน้า คนขับ หรือคนเดินผ่าน **ต้องเบลอทุกคนก่อนฝึก** (ข้อ 4) ไม่ใช้ภาพจากอินเทอร์เน็ต / โซเชียล
- กรอก `CONSENT.md` ในโฟลเดอร์ฝึก (สถานที่ วันที่ ใครถ่าย ประกาศ / ความยินยอม วันลบภาพต้นฉบับ ใครเข้าถึงได้)
  เครื่องมือจะไม่ยอมแบ่งชุดถ้าไม่มีไฟล์นี้
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

- เปิดเฉพาะบน 127.0.0.1 (เครื่องนี้) อ่านภาพจาก `photos/` เขียนได้แค่ `labels/` และ `blurred/` ไม่ส่งอะไรออกนอกเครื่อง
- **กรอบป้าย:** ลากรอบตัวป้าย (ไม่รวมกรอบป้ายร้านรถ) กรอกเลขทะเบียนบรรทัดแรก (มอเตอร์ไซค์: บรรทัด 1 + 3) ประเภท จังหวัด (ไม่บังคับ)
  ติ๊ก "ไม่แน่ใจตัวอักษร" ถ้าอ่านไม่ชัด ป้ายเล็กมากที่อ่านไม่ได้ ใช้ "ไม่นับ" ภาพไม่มีป้าย ติ๊ก "ภาพนี้ไม่มีป้าย"
- **กรอบเบลอ:** ระบบเสนอกรอบใบหน้าอัตโนมัติด้วย BlazeFace (Apache-2.0 ตัวเดียวกับ Product Check) แต่ตัวนี้**พลาดใบหน้าจริงประมาณ 4 ใน 10**
  (41.4 % ของใบหน้าในชุด held-out ไม่ถูกเบลอ ที่มา: ชุดข้อมูลสาธารณะ Open Images, `docs/product-check/FACE-BLUR-RESULTS.md`)
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

- **ค่าเริ่มต้น: ฝึกบนเครื่องของเจ้าของ** (`tools/plate_train.py`) ภาพไม่ออกจากเครื่อง Mac ไม่มี CUDA จึงฝึกด้วย CPU (หรือ `--device mps`)
  ผ่านตัวเรียก `tools/plate_train_launch.py` ที่เปลี่ยนเฉพาะส่วนที่ YOLOX 0.3.0 ผูกกับ CUDA (โค้ด YOLOX บนดิสก์ไม่ถูกแก้)
- สูตร: YOLOX-nano, 1 คลาส `plate`, ภาพเข้า 416, 150 รอบ, mosaic 0.5, สุ่มสี HSV, หมุน ±5°, ไม่กลับซ้ายขวา (เหมือนโน้ตบุ๊ก Colab)
- **Colab (GPU ฟรี) ใช้กับภาพของเจ้าของได้เมื่อเจ้าของและทนายเห็นชอบเท่านั้น** เพราะต้องอัปโหลดภาพไป Google (ข้ามพรมแดน)
  แม้ภาพจะเบลอแล้ว ป้ายทะเบียนยังเป็นข้อมูลส่วนบุคคล ไม่มีค่าใช้จ่าย แต่เป็นเรื่องกฎหมาย จึงอยู่ใน "รอคุณตัดสิน"
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
ชุดทดสอบต้องมีอย่างน้อย 60 ภาพมีป้าย และ 15 ภาพไม่มีป้าย มิฉะนั้น "ยังตัดสินไม่ได้"
ชุดสาธารณะ Wikimedia 51 ภาพ (ครึ่ง held-out) รายงานเพิ่มได้ แต่ไม่ใช้ตัดสิน ผ่านแล้ว**เจ้าของยืนยัน**ก่อนใส่ในหน้าเว็บ (คนยังยืนยันทุกการอ่านป้าย)

### 8. นำเข้าใช้งาน (หลังผ่านและเจ้าของยืนยัน)

ตาม `docs/PLATE-DATASETS.md` §4: คัดลอก ONNX ไป `vendor/models/plate-det-th/` พร้อม LICENSE (Apache-2.0), README (ที่มา sha256),
MODEL_CARD.md แล้ว `LQPlate.registerDetector(fn, {proposals: true})` ตัวหาเดิมยังทำงานคู่กัน ไม่ลบอะไร
แล้วรันชุดทดสอบ e2e ของ Gate และวัดภาคสนาม (`docs/FIELD-PILOT.md`: สัดส่วน "ต้องแตะ")

## English

**Why.** The shipped finder (classical + LPD-YuNet, trained on Chinese plates) puts its top box on the plate in 14 of 32
real photos (44 %; public dataset, Wikimedia Commons, labels v3, `docs/GATE.md` §3c). A detector trained on Thai plates
from real gate cameras is the fix. This path trains **on the owner's machine**; the photos never leave it.

**What the owner provides.** ~600 photos with a plate + ~100 without (white 150, yellow 60, green 40, red 40, blue 30,
motorcycle 120, night 100, graphic 30, other 30, none 100), from the real gate camera position (1–1.5 m high, 2–6 m,
≤ 30°), at ≥ 3 sites / cameras, JPEG. Why 600: the fixed split keeps 15 % for test, and the comparison rule needs ≥ 60
plate photos and ≥ 15 plate-less photos in the test split [calc]. Before shooting: written permission of the site owner,
the PDPA camera sign (`gate-notice.html`) posted, consent for staff / known vehicles, avoid people; fill `CONSENT.md`
(the split step refuses without it). Retention proposal: originals deleted within 30 days of the export.

**Folder layout** (outside the repo): `~/LENSIQ-field/plates-train/{CONSENT.md, photos/, labels/, blurred/, splits/,
dataset/, runs/}` (Thai section §2).

**Steps.** `plate-train-prep init` → photos + CONSENT.md → `plate-labeller` (127.0.0.1 only) → `plate-train-prep split`
(locks the split; commit `evals-locks/plate-train-split.sha256` before training or measuring) → `plate-train-prep export`
→ `plate_train.py setup / train / onnx` → `plate-det-compare --model …`.

**Labelling and privacy.** Plate boxes + text + category; ignore boxes for tiny unreadable plates; blur boxes. BlazeFace
proposes face boxes but misses about 4 in 10 faces (41.4 % of held-out faces left unblurred; public dataset, Open Images,
`docs/product-check/FACE-BLUR-RESULTS.md`), so a person checks every photo, adds blur boxes over every face, person, phone
number or name on a vehicle, and ticks "checked". Export blurs + pixelates irreversibly and drops EXIF (incl. GPS). Only
checked + blurred photos are exported. Training files carry boxes only: no plate text, no province; the plate text exists
only in the held-out labels for the evaluation. Everything stays outside the repo.

**Split rule `plate-split-v1` (locked).** Union of photos that share a plate key (same car on different days never in
train and test); plate-less photo = own group; sha256("lensiq-plate-split:v1:" + group) → first 8 hex mod 100: < 70 train,
< 85 val, else test. Changing photos or labels after the lock is refused (new rule version = new held-out set).

**Training.** Default: local (`tools/plate_train.py`, YOLOX 0.3.0 Apache-2.0 cloned at a pinned tag, YOLOX-nano COCO
start weights Apache-2.0; same recipe as the notebook; CPU or MPS via `tools/plate_train_launch.py`, which replaces only the
CUDA-bound pieces of YOLOX 0.3.0 in memory). Colab (free GPU) for owner photos only after the owner and counsel agree
(upload to Google = cross-border transfer of personal data). Never Ultralytics; never YOLOv9 / open-image-models.

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

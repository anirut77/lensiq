# ชุดภาพป้ายทะเบียนของเจ้าของ (ภาพจริงจากมือถือ) / Owner plate-photo set (real phone photos)

ใช้กับ `tools/plate-field-eval.mjs` และแผ่นติดป้ายกำกับ `docs/field-pilot/plates-photo-labels.csv`
Used with `tools/plate-field-eval.mjs` and the labelling sheet `docs/field-pilot/plates-photo-labels.csv`.

ผลที่ได้มีป้ายที่มา **"field (owner photos)" / หน้างานจริง (ภาพของเจ้าของ)** และแยกจากตัวเลขข้อมูลจำลองเสมอ
The results carry the source label **"field (owner photos)"** and are always kept apart from the synthetic numbers.

## ภาษาไทย

### 1. ถ่ายภาพ (ประมาณ 100 ภาพ)

- ถ่ายด้วยมือถือตามปกติ จากท้ายหรือหน้ารถที่จอดอยู่ ระยะ 2–6 เมตร (เหมือนกล้องที่ไม้กั้น) และภาพใกล้ 0.5–1 เมตรบางส่วน
- พยายามให้มีครบทุกประเภท อย่างน้อยประเภทละ 10 ภาพ:
  `white` ป้ายขาวตัวดำ · `yellow` ป้ายเหลือง (แท็กซี่ / รถสาธารณะ) · `green` ป้ายเขียวหรือตัวเขียว · `red` ตัวแดงหรือพื้นแดง ·
  `blue` ตัวน้ำเงิน · `moto` ป้ายมอเตอร์ไซค์ 3 บรรทัด · `night` กลางคืน (ทุกสี) · `graphic` ป้ายประมูลลายกราฟิก ·
  `other` ป้ายตัวเลขล้วน (รถบรรทุก / รถตู้ เช่น 71-0638) ป้ายต่างประเทศ ป้ายแดงป้ายชั่วคราว
- ถ่ายภาพ **ที่ไม่มีป้ายทะเบียน** ด้วย อย่างน้อย 15 ภาพ (`none`): ป้ายจราจร ป้ายร้าน ป้ายบ้านเลขที่ หลักกิโล เครื่องหมายบนถนน
  ภาพเหล่านี้ใช้วัดว่าระบบ "อ่านอัตโนมัติผิดที่" หรือไม่
- **iPhone: ตั้งให้บันทึกเป็น JPEG ก่อนถ่าย** ไปที่ การตั้งค่า > กล้อง > รูปแบบ > "เข้ากันได้มากที่สุด" (Most Compatible)
  ค่าเริ่มต้นของ iPhone คือ HEIC ซึ่ง Chrome เปิดไม่ได้ ถ้าถ่ายไปแล้ว ให้ส่งออกเป็น JPEG (แอปรูปภาพ > แชร์ > ตัวเลือก หรือ
  AirDrop/อีเมลแบบ "ขนาดจริง" ที่แปลงเป็น JPEG) หรือบน Mac: `sips -s format jpeg IMG_0001.HEIC --out IMG_0001.jpg`
  ไฟล์ HEIC / RAW / ไฟล์เสียจะ **ไม่ทำให้เครื่องมือหยุด** แต่จะถูกแสดงในรายการ "could not decode" พร้อมเหตุผล และไม่ถูกนับ
  มือถือ Android ส่วนใหญ่บันทึกเป็น JPEG อยู่แล้ว
- หลีกเลี่ยงใบหน้าคนในภาพ ถ้าติดมา ไม่เป็นไร เพราะภาพไม่ออกจากเครื่องและไม่เข้า repo แต่ห้ามแชร์ภาพเหล่านี้ต่อ

### 2. วางภาพในโฟลเดอร์นอก repo

- ค่าเริ่มต้น: `~/LENSIQ-field/plates/` (โฟลเดอร์ใหม่ในโฮม **ไม่ใช่** ในโฟลเดอร์โปรเจกต์)
- ถ้าจำเป็นต้องอยู่ในโฟลเดอร์โปรเจกต์ ให้ใช้ `field-data/` เท่านั้น (อยู่ใน .gitignore แล้ว) เครื่องมือจะไม่ยอมอ่านโฟลเดอร์อื่นใน repo
- ภาพป้ายทะเบียนเป็นข้อมูลส่วนบุคคลตาม PDPA: ห้าม commit ห้ามอัปโหลด ลบเมื่อเลิกใช้

### 3. กรอกแผ่นป้ายกำกับ

1. คัดลอก `docs/field-pilot/plates-photo-labels.csv` ไปไว้ในโฟลเดอร์ภาพ ชื่อเดิม (`plates-photo-labels.csv`)
   **อย่ากรอกในไฟล์ต้นแบบใน `docs/`** เลขทะเบียนเป็นข้อมูลส่วนบุคคล เครื่องมือจะไม่ยอมอ่านแผ่นที่กรอกแล้วซึ่งอยู่ใน repo
   (ยกเว้นใต้ `field-data/`)
2. ลบแถวตัวอย่าง (แถวที่ขึ้นต้นด้วย `EXAMPLE`) หรือปล่อยไว้ก็ได้ เครื่องมือข้ามให้เอง
3. หนึ่งแถวต่อหนึ่งป้าย (ภาพที่มี 2 ป้าย = 2 แถว ชื่อไฟล์เดียวกัน) ภาพไม่มีป้าย = 1 แถว category `none` ช่อง plate ว่าง
4. คอลัมน์:
   - `file` ชื่อไฟล์ตรงตามในโฟลเดอร์ เช่น `IMG_0412.jpg`
   - `category` หนึ่งในคำข้างบน (ภาษาอังกฤษตัวเล็ก)
   - `plate` เลขทะเบียนบรรทัดแรกตามที่เห็น เช่น `1กข 2345` (มอเตอร์ไซค์: บรรทัด 1 + บรรทัด 3 เช่น `1กข 123`) อ่านไม่ออกใส่ `?`
   - `province` ไม่บังคับ (ชื่อภาษาอังกฤษตัวเล็กแบบในระบบ เช่น `bangkok`)
   - `x0,y0,x1,y1` ไม่บังคับ: กรอบป้ายเป็นพิกเซล (มุมซ้ายบน / ขวาล่าง ตามที่โปรแกรมดูภาพแสดง) ถ้าว่าง เครื่องมือตัดสินว่า
     "หาป้ายเจอ" จากผลอ่าน (ห่างจากที่กรอกไม่เกิน 1 ตัวอักษร) และนับผลอ่านที่ผิดไกลเป็น "อ่านอัตโนมัติผิดที่" (แบบระวังไว้ก่อน)
   - `split` ไม่บังคับ (`dev` / `heldout` ถ้าจะแบ่งครึ่งไว้ทดสอบภายหลัง)
   - `sure` ใส่ `n` ถ้าไม่แน่ใจตัวอักษร (ไม่นับในอัตราอ่านถูก)
   - `notes` อะไรก็ได้ (ระยะ แสง ฝน สกปรก กรอบป้ายร้านรถ)

### 4. รันเครื่องมือ

```
node tools/plate-field-eval.mjs                         # ~/LENSIQ-field/plates/ + plates-photo-labels.csv
node tools/plate-field-eval.mjs --dir /path/to/photos   # โฟลเดอร์อื่น
node tools/plate-field-eval.mjs --out ~/LENSIQ-field/result.json   # เก็บผลเป็น JSON (นอก repo)
```

รายงานแยกตามประเภท: หาป้ายเจอ (กรอบแรก) · อ่านอัตโนมัติถูกทั้งป้าย · อ่านอัตโนมัติผิดที่ (ไม่ใช่ป้าย) · อ่านผิดตัวอักษร ·
ต้องแตะกรอบเอง · ผลอ่านเมื่อแตะกรอบ และคอลัมน์ข้อมูลจำลอง (synthetic) แยกต่างหาก ส่งตารางนี้กลับมาให้ทีม (ตัวเลขเท่านั้น ไม่ต้องส่งภาพ)

## English

### 1. Take the photos (about 100)

- Normal phone photos of parked vehicles, front or rear, 2–6 m away (like a barrier camera), plus some close-ups at 0.5–1 m.
- Aim for at least 10 photos per category: `white` · `yellow` (taxi / public) · `green` (green plate or green text) ·
  `red` (red text or red plate) · `blue` (blue text) · `moto` (3-line motorcycle plate) · `night` (any colour) · `graphic`
  (auction plate with a picture) · `other` (numbers-only truck / van plates such as 71-0638, foreign or temporary plates).
- Also at least 15 photos **without a plate** (`none`): road signs, shop signs, house-number boards, kilometre posts, road
  markings. They measure whether the system auto-reads something that is not a plate.
- **iPhone: switch to JPEG before you start.** Settings > Camera > Formats > **Most Compatible**. The iPhone default is HEIC,
  which Chrome cannot open. For photos already taken, export them as JPEG (Photos > Share > Options, or AirDrop / mail at
  "Actual Size", which converts to JPEG), or on a Mac: `sips -s format jpeg IMG_0001.HEIC --out IMG_0001.jpg`. A HEIC,
  RAW or broken file **does not stop the tool**: it is listed under "could not decode" with the reason and left out of
  every number. Most Android phones already save JPEG.
- Avoid faces. If one is in the picture it stays on your computer and out of the repo, but do not share these photos.

### 2. Put the photos in a folder outside the repo

- Default: `~/LENSIQ-field/plates/` (a new folder in your home folder, **not** in the project folder).
- If it must be inside the project folder, use `field-data/` only (git-ignored). The tool refuses any other folder inside
  the repo.
- Plate photos are personal data under the PDPA: never commit or upload them; delete them when no longer needed.

### 3. Fill in the labelling sheet

1. Copy `docs/field-pilot/plates-photo-labels.csv` into the photo folder, keeping its name. **Do not fill in the template
   in `docs/`**: plate numbers are personal data, and the tool refuses a filled-in sheet inside the repo (except under
   `field-data/`).
2. The `EXAMPLE` rows may stay; the tool skips them.
3. One row per plate (a photo with two plates = two rows with the same file name). A photo without a plate = one row with
   category `none` and an empty plate.
4. Columns: `file` (exact file name) · `category` (one of the words above) · `plate` (line 1 as written, e.g. `1กข 2345`;
   motorcycle: line 1 + line 3, e.g. `1กข 123`; `?` when unreadable) · `province` (optional, e.g. `bangkok`) ·
   `x0,y0,x1,y1` (optional plate box in pixels, top-left / bottom-right as a photo viewer shows the picture; without a box
   the tool judges "found" by the read — within one character of the label — and counts a read that is far off as a
   false auto-read, the cautious choice) · `split` (optional `dev` / `heldout`) · `sure` (`n` = not sure of the letters;
   left out of the exact-read rate) · `notes`.

### 4. Run the tool

```
node tools/plate-field-eval.mjs                         # ~/LENSIQ-field/plates/ + plates-photo-labels.csv
node tools/plate-field-eval.mjs --dir /path/to/photos   # another folder
node tools/plate-field-eval.mjs --out ~/LENSIQ-field/result.json   # also save the JSON (outside the repo)
```

The report gives, per category: detection (first box), exact automatic read, false auto-reads (not a plate), wrong
auto-reads, taps needed, the read after a tap on the labelled box, and the synthetic demo-set column separately. Send the
table back (numbers only, no photos).

# Product Check photo set: protocol for the owner (P1, design §9.1)

> Fixed **before** any detector is built or run. The photos and the filled labelling sheet stay **outside the repo** in
> `~/LENSIQ-field/products/`. Only this protocol, the empty template (`photo-labels-template.csv`, two FAKE example rows)
> and the validator (`tools/pc-photo-labels.mjs`) are committed. Every number later measured on these photos is labelled
> **field**. Counsel advises on how to obtain illegal or warned products lawfully (design §15, counsel question 7).

## ภาษาไทย

### ต้องถ่ายอะไร (อย่างน้อย 305 ภาพ ไม่นับกลุ่มคำโฆษณาเกินจริงที่ซ้อนกันได้)

| กลุ่ม (stratum) | ขั้นต่ำ | ตัวอย่าง |
|---|---|---|
| `th-drug` ยาไทย | 40 | ยาสามัญประจำบ้าน ยาแผนปัจจุบันที่ซื้อได้ในร้านยา ยาแผนโบราณ |
| `th-supplement` ผลิตภัณฑ์เสริมอาหารไทย | 40 | วิตามิน คอลลาเจน ไฟเบอร์ |
| `th-cosmetic` เครื่องสำอางไทย | 30 | ครีม กันแดด แชมพู ลิปบาล์ม |
| `th-food` อาหารไทย | 30 | นม เครื่องดื่ม ขนม ซอส บะหมี่ |
| `foreign-cn` / `foreign-jp` / `foreign-kr` / `foreign-my-sg` / `foreign-us` / `foreign-eu` | 15 ต่อประเทศ (= 90) | ยาและอาหารเสริมที่ซื้อจากต่างประเทศหรือร้านนำเข้า |
| `illegal-warned` สินค้าที่ อย. หรือหน่วยงานรัฐเคยประกาศเตือน | **≥ 75** (ต้องได้อย่างน้อย 73 ภาพจึงวัดเกณฑ์ 5 % ได้) | สินค้าที่ตรงกับรายการเตือนของ อย. หรือภาพแพ็กเกจจริงที่ตรงกับประกาศ **ห้ามซื้อสินค้าเพื่อทดสอบถ้าการซื้อนั้นผิดกฎหมาย ให้ถามทนายก่อน** |
| คำโฆษณาเกินจริงบนฉลาก (ซ้อนกับกลุ่มอื่นได้) | ≥ 40 | ใส่ `overclaim_on_pack = yes` |

### กติกาความเป็นส่วนตัว (บังคับ)

- **ห้ามมีคนในภาพ** ทั้งหน้า มือที่เห็นชัด เงาสะท้อน หรือคนด้านหลัง ถ่ายบนโต๊ะพื้นเรียบ ถ้าพลาดให้ถ่ายใหม่ ระบบตรวจใบหน้า (P2) จะตรวจทุกภาพซ้ำ
- **ห้ามถ่ายฉลากยาจากร้านยาหรือโรงพยาบาลที่มีชื่อผู้ป่วย** HN หรือวันที่จ่ายยา ถ้าซองยามีฉลากนั้น ให้ลอกออกหรือปิดก่อนถ่าย หรือไม่ใช้ภาพนั้น
- ห้ามมีใบเสร็จ ที่อยู่ เบอร์โทร หรือบัตรใด ๆ ในภาพ
- ลบตำแหน่ง GPS ออกจากภาพ (ปิด Location ของกล้องก่อนถ่าย)

### วิธีถ่าย

- ถ่ายด้วยโทรศัพท์ที่ใช้ตามปกติ ความละเอียดเต็ม ไม่ใช้ฟิลเตอร์
- ต่อสินค้า 1 ชิ้น ถ่าย **ด้านหน้า (`front`)** และ **ด้านที่มีเลขทะเบียน/ส่วนประกอบ (`label`)** อย่างน้อย; ถ้ามี ถ่าย `barcode`, `leaflet` (เอกสารกำกับยา) หรือ `blister` เพิ่ม
- ถ่ายให้มีสภาพยากปนอยู่ด้วย และบันทึกเป็นแท็กในช่อง `conditions`: `angle` (เอียง), `glare` (แสงสะท้อน), `curved` (ขวดโค้ง), `small_print` (ตัวหนังสือเล็ก), `low_light`, `night`, `indoor`, `outdoor`, `blur`, `partial`, `reflective`, `handheld` แยกด้วย `;`
- ประมาณ 1 ใน 3 ของภาพควรเป็นสภาพยาก (ไม่ใช่ภาพสวยทั้งหมด)

### ที่เก็บและชื่อไฟล์

```
~/LENSIQ-field/products/
  photos/th-drug-0001-front.jpg
  photos/th-drug-0001-label.jpg
  photos/illegal-warned-0201-front.jpg
  labels.csv            (ก๊อปจาก docs/product-check/photo-labels-template.csv แล้วลบ 2 แถวตัวอย่าง)
```

- ชื่อไฟล์: `<stratum>-<เลข 4 หลัก>-<ด้าน>.jpg` เลข 4 หลักคือเลขสินค้า (ทุกภาพของสินค้าชิ้นเดียวกันใช้เลขเดียวกัน)
- ด้าน: `front`, `back`, `side`, `label`, `leaflet`, `blister`, `barcode`, `detail` (เติมเลขได้ เช่น `detail2`)
- **ห้ามใส่โฟลเดอร์นี้ใน repo** และห้ามอัปโหลดไปที่อื่น

### การลงข้อมูล (ground truth) **ก่อน** รันระบบใด ๆ

- กรอก 1 แถวต่อ 1 ภาพใน `labels.csv` ตามคอลัมน์ในตารางภาษาอังกฤษด้านล่าง
- เลขทะเบียน ส่วนประกอบ ความแรง รูปแบบยา ผู้ผลิต lot วันหมดอายุ ให้พิมพ์ตามที่เห็นบนกล่อง
- สถานะทะเบียน: ค้นที่ oryor.com / แอป ORYOR Smart / เว็บ อย. ในวันที่ถ่าย แล้วบันทึกวันที่ค้นและลิงก์
- อยู่ในประกาศเตือนหรือไม่: ใส่ลิงก์ประกาศและวันที่ประกาศ
- **คน 2 คนลงข้อมูลแยกกัน** (`labeller_1`, `labeller_2` ใช้ชื่อย่อหรือบทบาท ไม่ใช่ชื่อเต็ม) แล้วเภสัชกรตัดสินจุดที่ไม่ตรงกัน (`adjudicated_by`)
- ตรวจไฟล์ด้วย `node tools/pc-photo-labels.mjs ~/LENSIQ-field/products/labels.csv` ต้องได้ 0 errors และจำนวนครบทุกกลุ่ม

## English

### Strata (minimums from design §9.1; total ≥ 305, the over-claim stratum may overlap)

| Stratum | Minimum | Notes |
|---|---|---|
| `th-drug`, `th-supplement`, `th-cosmetic`, `th-food` | 40 / 40 / 30 / 30 (= 140) | products sold in Thailand |
| `foreign-cn`, `foreign-jp`, `foreign-kr`, `foreign-my-sg`, `foreign-us`, `foreign-eu` | 15 each (= 90) | |
| `illegal-warned` | **≥ 75** | products matching an official warning list, or exact-pack photos of listed products. The key safety metric needs n ≥ 73 for a Wilson 95 % upper bound ≤ 5 % at 0 observed misses. **Do not buy a product to test it where buying it is unlawful; ask counsel first.** |
| over-claim on pack | ≥ 40 (overlaps) | `overclaim_on_pack = yes` |

### Privacy rules (mandatory)

- **No people**: no faces, no clearly visible hands, no reflections, no bystanders. The P2 face gate re-checks every photo;
  a photo with a face is removed from the set, not blurred.
- **No pharmacy or hospital dispensing labels** with a patient name, HN or dispensing date. Remove or cover them before
  the photo, or drop the photo. The validator requires `patient_label_in_frame = no`.
- No receipts, addresses, phone numbers or cards in frame. Turn camera location (GPS) off.

### Shots and conditions

- Normal phone, full resolution, no filters. Per product at least `front` and `label` (the side with the registration
  number / ingredients); add `barcode`, `leaflet`, `blister`, `back`, `side`, `detail` when useful.
- About one third of the photos should be hard: tag each photo in `conditions` with any of `angle`, `glare`, `curved`,
  `small_print`, `low_light`, `night`, `indoor`, `outdoor`, `blur`, `partial`, `reflective`, `handheld` (`;`-separated).

### Storage and file names

- Photos: `~/LENSIQ-field/products/photos/`; sheet: `~/LENSIQ-field/products/labels.csv` (copy the template, delete the
  two FAKE rows). Never inside the repo, never uploaded elsewhere.
- File name: `<stratum>-<4-digit product number>-<shot>.jpg`, e.g. `th-drug-0001-front.jpg`,
  `illegal-warned-0201-label.jpg`. All shots of one product share its number.

### Labelling sheet (ground truth written before any run)

One row per photo. Template: `docs/product-check/photo-labels-template.csv`. Required = must be filled on every row.

| Column | Required | Format / values |
|---|---|---|
| `photo_id` | yes | `P0001` |
| `file_name` | yes | as above; must start with its stratum |
| `taken_date` | yes | `YYYY-MM-DD` |
| `taken_by` | yes | role or initials (`owner`, `team-A`), not a full name |
| `stratum` | yes | one of the strata above |
| `country_of_sale` | yes | ISO 3166 two letters (`TH`, `CN`, …) |
| `country_of_origin` | | ISO two letters |
| `product_type` | yes | `drug` / `supplement` / `cosmetic` / `food` / `herbal` / `device` / `other` |
| `brand`, `product_name` | | as printed |
| `active_ingredients_inn` | | INN names, `;`-separated |
| `strength`, `dosage_form` | | as printed (e.g. `500 mg`, `tablet`) |
| `registration_number` | | as printed |
| `registration_country` | if a number is given | ISO two letters (`EU` for the EU register) |
| `registration_kind` | | `drug` / `food` / `cosmetic` / `herbal` / `device` / `advert` / `other` |
| `manufacturer`, `lot` | | as printed |
| `expiry` | | `YYYY-MM` or `YYYY-MM-DD` as printed |
| `claims_on_pack` | | the claim wording, `;`-separated |
| `registration_status` | yes | `active` / `cancelled` / `expired` / `not_found` / `not_checked` / `no_number`, on the lookup day |
| `status_checked_date`, `status_source_url` | if looked up | `YYYY-MM-DD`, URL |
| `on_warning_list` | yes | `yes` / `no` / `unknown`; `yes` needs `warning_source_url` and `warning_date` |
| `overclaim_on_pack` | yes | `yes` / `no` / `unknown` |
| `expected_rule_ids` | | rule ids from `RULES.md`, space-separated (e.g. `F06 F13`) |
| `conditions` | | tags above |
| `face_in_frame`, `patient_label_in_frame` | yes | must be `no` |
| `labeller_1`, `labeller_2`, `adjudicated_by` | `labeller_1` yes | initials or roles; labeller 2 must differ; the pharmacist adjudicates disagreements |
| `notes` | | free text, no personal data |

Registration-number checks in the validator: Thailand food `XX-X-XXXXX-X-XXXX` (13 digits), cosmetic notification
`XX-X-XXXXXXXXXX` (13 digits), drug `1A 123/45 (NG)` / `G 12/56` (same shape as `LQMed.parseThaiReg`), advert permit
`ฆท./ฆอ. N/YYYY` are **errors** when they do not match; Thai herbal numbers (format unverified), Malaysia `MAL…` / `NOT…K`,
Singapore `SIN…P`, US NDC, China `国药准字…`, EU `EU/1/…`, Canada DIN / NPN and Australia `AUST L/R` are **warnings**;
Japan and Korea are free text.

### Checks before the first run

```
node tools/pc-photo-labels.mjs ~/LENSIQ-field/products/labels.csv
```

must print `0 errors` and no stratum below its minimum. The tool refuses to read any sheet inside the repo except the
template. Then the photo set is frozen: record the SHA-256 of `labels.csv` and of the sorted list of photo checksums in
`docs/product-check/TEST-SETS.md` (counts only, no images, no product data).

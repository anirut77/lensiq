# Look preview + Personal Colour: volunteer capture protocol and consent form (draft for legal review)

> **ร่างเพื่อให้ทนายตรวจ (draft for legal review).** Not used until the owner approves recruiting and counsel has reviewed
> the consent wording (PDPA s.26: face images may be biometric data; skin colour may be read as a proxy for origin —
> `docs/PDPA-NOTES-FOR-COUNSEL.md`, STYLE-DESIGN L-S1 to L-S3). Owner decision 2026-11-13: synthetic numbers first; this
> protocol is prepared for the later field numbers.

## 1. Who and how many

- **≥ 20 adults (18+)** for the look preview; **≥ 30** for Personal Colour repeatability (may overlap). Recruit so the
  measured skin lightness spans three equal tertiles; **no ethnicity, age or gender is collected**.
- Mix: with / without glasses, with / without make-up, short / long hair, facial hair if any.
- Raters for the preview (design note "วิธีวัด" (3)): **3 people who did not build the feature**.

## 2. Capture (one session ≈ 20 minutes)

1. Consent form signed (section 4); the volunteer gets a copy. Session code only (e.g. `V07`), no name in any data file.
2. Two phones (1 iPhone, 1 mid-range Android), front camera, 640 × 480 or more, beauty filters off.
3. Lights: window daylight; warm bulb 2700–3000 K; cool office light 5000–6500 K; mixed / shade.
4. For each phone × light: 10 s still face, 10 s slow head turn left–right (±30°), 5 s talking (mouth moving), then the same
   with glasses on (if the volunteer wears them). Personal Colour: white or 18 % grey card held next to the cheek, 5 s.
5. Annotators draw lip, upper-lid and brow outlines on 3 frames per clip (tool to be provided), blind to the preview output.
6. Speed: the preview's own frame counter on the two phones (the phone number the design note asks for: ≥ 20 fps).

## 3. Storage and deletion

- Clips stay on an encrypted disk **outside the repo** (`~/LENSIQ-field/look-field/`), never uploaded, never committed,
  never used to train a model. Only derived numbers go into reports.
- Kept ≤ 12 months, then deleted; a volunteer can withdraw at any time and their clips are deleted within 7 days.

## 4. หนังสือยินยอม (ภาษาไทย)

**โครงการทดสอบภาพตัวอย่างการแต่งลุคและพาเลตสีส่วนตัว (LENSIQ)**

ข้าพเจ้า (รหัสผู้เข้าร่วม ............) ยินยอมเข้าร่วมการทดสอบนี้โดยสมัครใจ และรับทราบว่า

1. ข้าพเจ้าอายุ 18 ปีขึ้นไป
2. ผู้ทดสอบจะบันทึกวิดีโอใบหน้าของข้าพเจ้าประมาณ 15 นาที ใต้แสงหลายแบบ ด้วยโทรศัพท์ 2 เครื่อง เพื่อวัดว่าภาพตัวอย่าง
   (สีปาก อายไลเนอร์ คิ้ว และพาเลตสี) วาดตรงตำแหน่งและนิ่งเพียงใด
3. ไม่มีการเก็บชื่อของข้าพเจ้าในไฟล์ข้อมูล ใช้รหัสผู้เข้าร่วมแทน ไม่เก็บเชื้อชาติ อายุ หรือเพศ
4. วิดีโอเก็บในดิสก์ที่เข้ารหัส ไม่อัปโหลดขึ้นอินเทอร์เน็ต ไม่เผยแพร่ ไม่ใช้ฝึกโมเดล AI ใช้เพื่อวัดผลเท่านั้น
   และจะลบภายใน 12 เดือน
5. ผู้ตรวจผลที่ไม่ได้สร้างระบบ (3 คน) อาจดูภาพเพื่อให้คะแนนความเหมือนจริงของภาพตัวอย่าง ไม่ใช่ให้คะแนนหน้าตาของข้าพเจ้า
6. การทดสอบนี้ไม่มีการทำหัตถการหรือทาเครื่องสำอางใด ๆ บนใบหน้าจริง และไม่มีการให้คะแนนความสวย
7. ข้าพเจ้าถอนความยินยอมได้ทุกเมื่อโดยแจ้ง ............ และข้อมูลของข้าพเจ้าจะถูกลบภายใน 7 วัน
   การถอนตัวไม่มีผลเสียใด ๆ ต่อข้าพเจ้า
8. ค่าตอบแทน (ถ้ามี): ............ (เจ้าของโครงการกำหนด)

ลงชื่อผู้เข้าร่วม ............................ วันที่ ............  ลงชื่อผู้ทดสอบ ............................

*English and Chinese versions are made after counsel reviews the Thai text.*

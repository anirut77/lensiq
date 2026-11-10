# Nutrition Lens: design (round 17, item 4)

> **Status: DESIGN ONLY. No code, no migration and no deploy are part of this document.** It waits for the owner's
> approval. It is built **first, after Product Check**, because it reuses the Product Check pipeline: on-device label
> OCR, face blur and the AI Gateway. LENSIQ is not charging yet. Everything in it can be built fully for testing, and
> the legal rows in section 12 go on the running list (`docs/CTO-BRIEF.md` §8) before charging starts.
> This document is not legal, medical or dietary advice. Every legal point is a **risk signal** for counsel to confirm,
> not a finding.
> Written 2026-11-10 from the current code (`lensiq-pc.js`, `lensiq-pc-run.js`, `lensiq-pc-ui.js`, `lensiq-ai.js`,
> `backend/src/ai/*`, `backend/src/auth.js`, `backend/src/store.js`, `backend/migrations/0001–0010`, `admin.html`,
> `admin.js`) and the docs `PRODUCT-CHECK-DESIGN.md`, `AI-GATEWAY.md`, `product-check/P2-RESULTS.md`,
> `product-check/FACE-BLUR-RESULTS.md` and `ORG-ACCOUNTS-DESIGN.md`. Web sources were accessed on 2026-11-10.
> Labels used: **[PRIMARY]** = the official licence or legal page was read; **[SECONDARY]** = a law firm, trade press or
> other third-party summary; **[UNVERIFIED]** = not confirmed and must be checked in N1.

> **Owner approval (2026-11-10):** design approved. Build approach: MVP first, then deepen. Nutrition MVP = label mode +
> back-office basics, USDA FoodData Central data first. INMU permission letter: `docs/LICENCE-REQUESTS.md`.
>
> **Shared back-office (cross-doc note, 2026-11-10).** All four new designs (Nutrition, Try-On, Merit, Style) use ONE
> admin area, `backoffice.html`, built once in Nutrition **N3** (first in build order): roles owner / admin / editor,
> per-person audit log, image upload with size limits + automatic face blur (Product Check `faceBlur`) + person check,
> TH / EN / ZH, phone layout. Try-On T2, Merit M1 and Style S5 then only add their own sections, so their effort drops
> (T2 L→M, M1 M→S, S5 L→M). **BO-1 decided (owner, 2026-11-10):** do not wait for org accounts. Phase 1 back-office uses the existing
> platform admin login (owner with mandatory TOTP, plus admin and editor roles); merchant self-service login moves to
> org accounts later.

## สรุปสำหรับเจ้าของ (Thai summary)

- **Nutrition Lens คืออะไร:** เป็นหน้าใหม่ `nutrition.html` ในหมวด 5 (สุขภาพ ความปลอดภัย และคุณภาพ) มี 2 โหมด
  1. **อ่านฉลาก (แม่นยำ):** ส่องกล้องที่กรอบ "ข้อมูลโภชนาการ" ฉลาก GDA หรือฉลากต่างประเทศ
     - ระบบอ่านค่าบนเครื่อง: พลังงาน โปรตีน ไขมัน ไขมันอิ่มตัว น้ำตาล โซเดียม คาร์โบไฮเดรต ใยอาหาร หนึ่งหน่วยบริโภค และข้อมูลสำหรับผู้แพ้อาหาร
     - **แสดงค่าตรงตามที่พิมพ์บนฉลาก** และบอกว่าแต่ละค่ามาจากบรรทัดใด
     - ผู้ใช้ใส่ปริมาณที่กินจริงได้ (เช่น ครึ่งซอง) ระบบคำนวณใหม่ โดยแยกคอลัมน์ "คำนวณโดย LENSIQ" ออกจากค่าที่พิมพ์บนฉลาก
  2. **ประมาณจากภาพอาหาร:** AI ผ่าน AI Gateway บอกเพียงว่าเป็นอาหารอะไรและปริมาณประมาณเท่าใด
     - **ตัวเลขสารอาหารมาจากฐานข้อมูลของเราเท่านั้น ไม่ให้ AI แต่งตัวเลขเอง**
     - แสดงเป็น**ช่วงเสมอ** (เช่น 450–600 kcal) พร้อมหมายเหตุความมั่นใจ ไม่แสดงตัวเลขเดียว
- **ทำในเครื่องก่อน:**
  - อ่านฉลากทำในเครื่องทั้งหมด ไม่ต้องใช้เน็ต
  - ส่งข้อมูลให้ AI เฉพาะเมื่อผู้ใช้ยินยอม ใช้หน้ายินยอมและการเบลอใบหน้าชุดเดียวกับ Product Check
  - ไม่เก็บอะไรบนเซิร์ฟเวอร์ บันทึกการกินเปิดได้ตามต้องการ และเก็บในเครื่องเท่านั้น
- **หลังบ้าน:**
  - ส่วนผู้ดูแลกลางมี 3 บทบาท: เจ้าของ ผู้ดูแล และผู้แก้ไข
  - มีบันทึกการตรวจสอบ (audit log) และประวัติการแก้ไขทุกค่า
  - ค่าทุกค่าต้องระบุแหล่งที่มา
  - อัปโหลดภาพได้ โดยจำกัดขนาดและเบลอใบหน้าอัตโนมัติ
  - ใช้ได้ 3 ภาษาและบนมือถือ
  - Nutrition Lens เป็นงานแรกที่สร้างส่วนผู้ดูแลกลางนี้ ฟีเจอร์ต่อไปจึงใช้ซ้ำได้
- **แหล่งข้อมูล (อ่านหน้าใบอนุญาตจริง 10 พ.ย. 2569):**
  - **USDA FoodData Central:** CC0 ใช้ได้เลย
  - **Open Food Facts:** ODbL + DbCL ส่วนภาพเป็น CC BY-SA
    - ใช้ได้ แต่เก็บแยกตาราง ไม่รวมกับฐานข้อมูลของเรา ตามการตัดสินใจ PC-D10 เพราะมีเงื่อนไขแบ่งปันแบบเดียวกัน
  - **ฐานข้อมูลองค์ประกอบอาหารไทยของสถาบันโภชนาการ ม.มหิดล (INMU):** ใช้ฟรีเฉพาะที่ไม่ใช่เชิงพาณิชย์ การใช้เชิงพาณิชย์ "อาจมีค่าธรรมเนียม" **ต้องขออนุญาต**
  - **ตารางของกรมอนามัย:** ไม่ระบุใบอนุญาต **ต้องขออนุญาต**
  - **ฐานข้อมูลอาเซียน (INMU):** สงวนสิทธิ์ทุกประการ **ต้องขออนุญาต**
  - จะร่างหนังสือขออนุญาตใน N0
- **กฎฉลากไทยที่ใช้อ้างอิงในการอ่าน:**
  - ประกาศ สธ. ฉบับ 445 (2566) ใช้แทนฉบับ 182 มีผล 2 ก.ค. 2567 และผ่อนผันถึง 1 ก.ค. 2570
    - ช่วงนี้จึงยังพบฉลากทั้งแบบเก่าและแบบใหม่
    - แบบใหม่บังคับ 9 รายการ และใยอาหารไม่ใช่รายการบังคับแล้ว
  - ฉลาก GDA ตามฉบับ 394 (2561) แก้ไขโดยฉบับ 446 (2566)
  - การแสดงสารก่อภูมิแพ้ตามฉบับ 450 (2567) ซึ่งใช้แทนฉบับ 367
- **การวัดผล (กำหนดชุดทดสอบก่อนสร้าง):**
  - ฉลากจริงอย่างน้อย 200 ภาพ วัด "ตรงทุกตัว" แยกรายช่อง
  - อาหารไทย 30 เมนู ใน 6 ประเภท แต่ละเมนูมี 2–3 ขนาด รวมอย่างน้อย 180 ภาพ **เจ้าของชั่งน้ำหนักจานจริง**
  - ตัวชี้วัดหลักของโหมดภาพ: สัดส่วนจานที่ค่าจริงอยู่ในช่วงที่แสดง
  - ทุกตัวเลขมีช่วง Wilson แยกชุด dev และ held-out ไว้ก่อนจูน
- **กฎความเป็นอยู่ที่ดี:**
  - ไม่ติดป้ายอาหาร "ดี/ไม่ดี" ไม่ใช้สีเขียว/แดงตัดสินค่า
  - ซ่อนแคลอรีได้
  - ไม่มีเป้าลดน้ำหนัก ไม่มีสถิติวันติดต่อกัน ไม่มีชาเลนจ์ลดแคลอรี และไม่ถามน้ำหนักหรือ BMI
  - ข้อมูลภูมิแพ้ขึ้นข้อความว่า "โปรดตรวจฉลากจริงด้วยตัวเอง" ทุกครั้ง
  - ไม่ใช่คำแนะนำทางการแพทย์ ผู้มีโรคประจำตัวควรปรึกษาแพทย์หรือนักกำหนดอาหาร
- **ระยะเวลา:** 9 ช่วง (N0–N8) ประมาณ 6–9 สัปดาห์ (ข้อ 9)
- **สิ่งที่เจ้าของต้องเตรียม (ข้อ 11):**
  - ภาพฉลากจริง 200 ภาพ
  - ซื้อและชั่งอาหารไทย 30 เมนู พร้อมตาชั่งครัว
  - ส่งหนังสือขออนุญาตถึง INMU และกรมอนามัย
  - งบ AI สำหรับเดือนแรก
  - นักกำหนดอาหาร (dietitian) ที่ปรึกษา 1–2 วัน
  - ตัดสินใจข้อ N-D1 ถึง N-D10

## 0. Fixed coverage list (written before the design)

The design is complete only when every row has an answer here. Rows come from the owner's brief (round 17, item 4).

| # | Requirement | Section |
|---|---|---|
| N-B1 | Label mode: Thai "ข้อมูลโภชนาการ" / GDA and foreign formats; energy, protein, fat, saturated fat, sugar, sodium, carbs, fibre, serving size, allergens; amount eaten → recalculation; values as printed | 2.2, 4.4 |
| N-B2 | Photo mode: identify dish and portion with the AI Gateway, nutrients from food composition databases, always a range with a confidence note | 2.3, 4.2 |
| N-B3 | Admin back-office: add / correct dishes, portion references, nutrient values, with source and edit history | 3 |
| N-B4 | Shared admin requirement: one admin area, roles owner / admin / editor, audit log, image upload with size limits and automatic face blur, TH / EN / ZH, phone screens | 3.1, 3.4, 3.5 |
| N-B5 | Data sources researched: Thai FCD (INMU), USDA FDC, Open Food Facts, ASEAN FCD; licence quotes, verdict per source, credits, legal list | 4.3, 12 |
| N-B6 | Thai label format rules (Thai FDA nutrition labelling, GDA) as parsing references | 4.4 |
| N-B7 | Measurement plan: fixed label set (exact match per field) and food photo set (error vs reference per dish type); Wilson; dev / held-out; how reference values are obtained | 5 |
| N-B8 | Privacy: on-device first, opt-in AI with the same consent and face blur, nothing stored by default, optional on-device food log; PDPA s.26 analysis | 6 |
| N-B9 | Wellbeing rules | 7 |
| N-D | Effort per phase, risks, owner inputs, legal rows and credit lines | 9, 10, 11, 12 |

## 1. What exists today (built on, nothing removed)

| Piece | Today | Reused for |
|---|---|---|
| `lensiq-pc.js` (LQPC) | Quality checks, PP-OCRv5 DB box post-processing, CTC decode, crop from text boxes, GS1 / GTIN parsing, `faceBlurPlan`, `wilson`, `levenshtein` | Label mode imports LQPC as it is. The label parser is a new pure module (`lensiq-nut.js`, LQNut) beside it |
| `lensiq-pc-run.js` (LQPCRun) | On-device OCR (det + per-script rec: th / cjk / ko / latin), barcodes (native, then zxing-wasm), `faceRuns` / `faceBlur`, `uploadCanvas` | Called unchanged by both modes |
| `lensiq-pc-ui.js` | Camera / photo, auto crop the user can redraw, `prepareUpload()` (blurred preview, "N face regions blurred", text only when the detector cannot run) | The camera, crop and upload-preview pieces are factored into a shared helper so `nutrition.html` can use them. The Product Check tab keeps working, and its e2e tests are not edited |
| `lensiq-ai.js` (LQAI) | Consent dialog (provider, model, country, retention), remember-my-choice and withdraw, text / image mode, fallback messages | Same dialog. Consent is per feature (`nut_label`, `nut_dish`), so Product Check consent does not carry over |
| `backend/src/ai/*` | Gateway, budget, chain, schema validation, logs without content, 8 adapters | Two new features: `nut_label` and `nut_dish` (4.2) |
| `admin.html` / `admin.js` / `backend/src/auth.js` | **One owner account** (`admin_users.id = 1`), TOTP, 5-minute re-auth window, `audit_log` (actor `owner` / `system` / `anonymous`), tabs including "AI Gateway" | Extended into the shared admin core with roles (3.1). The owner login and its security rules stay as they are |
| Measured numbers | P2: Thai OCR 97.1 % characters on **synthetic** labels; real 400 px public pack photos are much weaker (brand token 33 %). Face blur picked setting (3 × 3 tiles, 0.5, pad 0.15): label still readable 94.1 %, real faces left unblurred 27.6 % on held-out (34.7 % on the reviewer's fresh set). All **public dataset / synthetic** | Starting assumptions only. Nutrition panels have not been measured (5.1) |

## 2. User flow

### 2.1 Page and entry

- **New page `nutrition.html`** (category 5, Health, Safety & Quality; owner decision N-D1). It has two tabs:
  - "อ่านฉลากโภชนาการ / Read a nutrition label";
  - "ประมาณจากภาพอาหาร / Estimate from a food photo".
- Product Check gets a "Nutrition" link when it finds a nutrition panel.
- **Settings sheet** (stored on the device):
  - "ซ่อนแคลอรี / Hide calories", off by default;
  - "บันทึกการกิน (ในเครื่องนี้เท่านั้น) / Food log (this device only)", off by default;
  - the text script used for OCR;
  - AI consent status with "withdraw".
- **Fixed footer on every result** (TH / EN / ZH): "ข้อมูลเพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการแพทย์ หากคุณดูแลภาวะสุขภาพ เช่น เบาหวาน
  โรคไต หรือแพ้อาหาร โปรดปรึกษาแพทย์หรือนักกำหนดอาหาร" (information only, not medical advice; see a doctor or dietitian if you
  manage a health condition).

### 2.2 Label mode (accurate; on device by default)

```
camera / photo ─► quality hints (blur, glare, small text)                        on device (LQPC.assess)
              ─► text boxes ─► auto crop on the panel, user can redraw            on device (PP-OCRv5 det)
              ─► OCR in the chosen script (th default; cjk / ko / latin)          on device
              ─► LQNut.parseLabel(lines) ─► fields + basis + source line          on device (4.4)
              ─► [optional] barcode ─► Open Food Facts cross-check (separate table, online opt-in)
              ─► [optional, opt-in] AI `nut_label`: text only, or crop + face blur  cloud (4.2)
              ─► card: printed values │ amount eaten │ calculated values │ allergens text
```

1. **Read.** The parser finds every field it can (4.4):
   - energy (kcal and kJ), protein, total fat, saturated fat, sugar, sodium (or salt), carbohydrate, fibre;
   - serving size, servings per pack and the basis of each column (per serving / per 100 g / per 100 ml / per pack);
   - % Thai RDI where it is printed.

   For each field it keeps the exact text, the line it came from and a status:
   - **read**;
   - **please check**: low OCR confidence, a number that fails the unit or plausibility check, or a mismatch between
     energy and the macros;
   - **not found on the label**: never shown as zero.
2. **Show as printed.** The first column repeats the label: its own units, basis and rounding ("< 1 g" stays "< 1 g").
   - A converted value (kJ → kcal, salt → sodium) is in a second line marked "แปลงโดย LENSIQ / converted by LENSIQ".
   - The user can tap a value to correct it. A corrected value is marked "แก้โดยคุณ / edited by you".
3. **Amount eaten.** The user chooses how much they ate:
   - presets: whole pack, half pack, 1 serving, a number of servings;
   - or an amount in g or ml.

   The **calculated** column = printed per-basis value × amount ÷ basis amount. It is labelled "คำนวณจากค่าบนฉลาก /
   calculated from the printed values", rounded to whole kcal and to 0.1 g or 1 mg, and prefixed "≈". When the basis
   needed is missing (e.g. only per serving is printed, the user types grams and the serving weight is not printed), the
   app says so and offers servings instead. It never guesses a weight.
4. **Allergens.** The allergen statement is shown **verbatim** (e.g. "ข้อมูลสำหรับผู้แพ้อาหาร: มีนม ถั่วเหลือง", "Contains:",
   "含有", "may contain"), with the matched allergen words highlighted from the list in 4.4.
   - Every allergen box carries the fixed line "โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง / Always check the actual label
     yourself".
   - If no statement was found, the box says "ไม่พบข้อความเรื่องสารก่อภูมิแพ้ในภาพนี้ ซึ่งไม่ได้แปลว่าไม่มี / no allergen text
     found in this picture; that does not mean there is none". It never says "allergen-free".
5. **Optional AI step (`nut_label`).** The button appears when fields are missing or marked "please check".
   - **Text mode** sends only the OCR text, a derived fact.
   - **Image mode** sends the panel crop after `prepareUpload()` (face blur preview) with the same consent as Product
     Check (PC-D9 rules, per feature).
   - **Grounding rule:** every number the AI returns must appear in the on-device OCR text (after normalising digits,
     Thai digits and decimal commas), else it is shown as "อ่านโดย AI, ไม่พบในข้อความที่อ่านบนเครื่อง ตรวจกับฉลาก / read by
     AI, not found in the on-device text — check it". The AI never fills a field the label does not have.
6. **Packaged food with a barcode** (optional, needs the "online lookups" switch):
   - The GTIN is looked up in the **Open Food Facts cache** (separate table, 4.3) through the Worker.
   - Its per-100 g values are shown beside the label reading as "ข้อมูลจากชุมชน Open Food Facts (อาจไม่ตรงกับฉลากของคุณ) /
     community data, may differ from your label". They are never merged into the printed column.

### 2.3 Photo mode (estimate; needs the AI step or a manual pick)

```
photo ─► face blur preview (prepareUpload) ─► consent (nut_dish, image) ─► AI: dishes + portion units only
      ─► map each dish to our dish table (published by admins, 3.2)
      ─► range = portion range × composition range  (database values only)
      ─► card: dish chips (editable) · portion picker · ranges · confidence note
```

- **The AI never gives nutrient numbers.** `nut_dish` returns, per dish visible:
  - candidate names (TH / EN) with an ordinal confidence (`high` / `medium` / `low`);
  - the matching `dish_id` from a list we send (the published dish names only);
  - a portion estimate in **reference units** that the admin table defines ("1 จานข้าว / plate", "1 ชาม / bowl", "1 ทัพพี / ladle",
    "1 ไม้ / skewer"), as a low–high count;
  - visible add-ons (fried egg, extra rice, sauce).

  Nutrients come only from the published dish table. This keeps invented numbers out of the result: the
  schema has no nutrient field, and the validator rejects any extra key (`ai/schema.js` already does).
- **Range, never a single number:**
  - The low and high values come from the portion range (grams low–high of the reference unit × the count range) and
    the composition range (low–high per 100 g across the dish's sources and variants).
  - The range is then **widened to at least the measured error band for that dish type**: the P80 absolute error on the
    dev set (5.2). Before N7 measures it, a fixed placeholder of ±25 % applies, labelled "not yet measured".
  - Energy is rounded outward to 10 kcal and macros to 1 g, e.g. "450–600 kcal".
- **Confidence note** (TH / EN / ZH), always shown:
  - "ประมาณจากภาพ ค่าจริงขึ้นกับสูตร น้ำมัน และปริมาณ";
  - plus the measured coverage for that dish type once known: "ในการทดสอบของเรา ค่าจริงอยู่ในช่วงนี้ 8 ใน 10 จาน (แหล่ง:
    ภาคสนาม, n = …)";
  - plus "AI ไม่แน่ใจว่าเป็นเมนูนี้" when the dish confidence is `low`.
- **The user corrects:** dish chips can be changed (search our table) and the portion picker (small / regular / large or
  grams) recalculates on the device. A corrected dish removes the AI's confidence line.
- **Not in our table:**
  - The card says "ยังไม่มีข้อมูลเมนูนี้ในฐานข้อมูลของเรา" and offers the nearest dishes by name. **No numbers are invented.**
  - "Suggest this dish" sends only the dish name text, after the user taps it, to an admin queue (no image, no user id).
- **Without AI** (no consent, AI off, budget used up, face detector failed):
  - **Manual mode** runs entirely on the device: the user picks the dish and portion from the published table and gets
    the same range card.
  - Photo mode is therefore usable with nothing leaving the device.

### 2.4 Food log (optional, on device only)

- Off by default. When on, a row is saved **only when the user taps "Add to log"**:
  - date and time (local), the dish or product name;
  - the amount, and the printed or estimated values with their type (label / estimate range / manual).
- **No photo and no OCR text are stored.**
- Storage: IndexedDB in the browser, wrapped in try/catch (falls back to "not saved" in private mode).
- Views:
  - a list per day and neutral day sums (ranges add as ranges);
  - **no target, no comparison with a target, no streak, no reminder** (7);
  - "Hide calories" hides energy in the log too.
- "Export (CSV / JSON)" and "Delete all" are on the same screen. Turning the log off asks whether to delete existing
  rows.
- Not synced. Org accounts sync (`ORG-ACCOUNTS-DESIGN.md`) does **not** cover this log, and any future sync needs a new
  design and counsel (6).

### 2.5 Languages and accessibility

- All strings in `nutrition.html` (TH), `i18n/en-nut.js` and `i18n/zh-nut.js`.
- Units and Thai / Arabic digits are handled by the parser, not by i18n.
- Tables reflow to stacked rows below 480 px.
- Values have text labels, not colour only.
- The range is read by screen readers as "from 450 to 600 kilocalories".

## 3. Admin back-office

### 3.1 Shared admin core (built here first; every later back-office reuses it)

The admin today has one owner account (`admin_users.id = 1`, `CHECK (id = 1)`). The owner's brief asks for owner, admin
and editor roles across all back-offices.

- **Owner account unchanged:** the owner keeps `admin_users` (id 1) and every current security rule:
  - TOTP;
  - progressive delay;
  - the 5-minute re-auth window;
  - inline re-auth for money.
- **New table `bo_users`** (back-office users), added in a new migration. Its columns:
  - `id`, `username`, `display_name`, `role` (`admin` | `editor`), `password_hash` (same PBKDF2 as the owner);
  - `totp_secret_enc`, `totp_enabled`, `status` (`active` | `disabled`), `created_by`;
  - `created_at`, `last_login_at`.

  Sessions reuse `admin_sessions` with a new `subject` column (`owner` or `bo:<id>`) and `role`.
- **TOTP mandatory for `admin`** (N-D7). It is optional for `editor` in staging and mandatory before charging.
- **The audit log gains actors:** `owner` / `bo:<id>`. Every entry stores its role at the time.
- **One permission check**, `can(sess, action)`, sits in the router. The UI hides what the role cannot do, and the server
  enforces it.

| Action | Owner | Admin | Editor |
|---|---|---|---|
| Existing tabs: analytics, AI settings, AI Gateway, billing, members, security, retention | ✓ | – (N-D7: none by default) | – |
| Invite / disable admins and editors, reset their TOTP | ✓ | editors only | – |
| Nutrition: create / edit drafts (dishes, portions, values, sources) | ✓ | ✓ | ✓ |
| Upload images (portion references) | ✓ | ✓ | ✓ |
| Approve and **publish** a draft (second person rule: the editor of a change cannot publish it) | ✓ | ✓ | – |
| Roll back a published version | ✓ | ✓ | – |
| Add or change a **source** and its licence verdict | ✓ | – (proposes; owner approves) | – |
| Bulk import (CSV) | ✓ | ✓ | – |
| View audit log | ✓ all | ✓ nutrition + own | own actions |
| Answer the "suggest a dish" queue | ✓ | ✓ | ✓ |

- **Re-auth (password + TOTP or the 5-minute window)** is needed for: publish, rollback, bulk import, role or user
  changes, and source verdict changes. Each is audited, and a failed re-auth is audited as `reauth.failed` (existing).
- **Single-owner mode stays valid.** With no `bo_users`, the owner can still publish alone. The second-person rule is
  then shown as "self-approved", audited and labelled in history.

### 3.2 Nutrition data model (D1, standard SQL through one adapter, `backend/src/nut/db.js`)

| Table | Columns (main) | Notes |
|---|---|---|
| `nut_sources` | id, name, publisher, url, version, retrieved_on, licence, **verdict** (`use_now` / `separate` / `permission_pending` / `permission_granted` / `measurement_only` / `rejected`), attribution_th/en/zh, note | Seeded with section 4.3. Only the owner changes a verdict |
| `nut_dishes` | id, slug, name_th, name_en, name_zh, aliases (JSON, all three languages), dish_type (6 types, 5.2), status (`draft` / `published` / `retired`), note | Never deleted: retired instead |
| `nut_values` | id, dish_id, nutrient (`energy_kcal`, `protein_g`, `fat_g`, `satfat_g`, `sugar_g`, `sodium_mg`, `carb_g`, `fibre_g`), per100_low, per100_typ, per100_high, method (`analysed` / `calculated_recipe` / `borrowed_similar` / `owner_weighed`), source_id **NOT NULL**, source_ref (table row id, e.g. INMU food ID "TH-T…" or FDC id), note | Every value has a source. Low / high may equal typ only when the source gives one value; the range then comes from the portion and the error band |
| `nut_portions` | id, dish_id, unit_th/en/zh ("1 จาน"), grams_low, grams_typ, grams_high, source_id NOT NULL, asset_id (photo, optional) | Portion references for the AI's unit and the picker |
| `nut_revisions` | id, entity, entity_id, before (JSON), after (JSON), reason (required text), actor, role, ts, state (`draft` / `approved` / `published` / `rolled_back`), approved_by, published_version | **Append-only** edit history. A correction is a new revision, never an UPDATE in place of history |
| `nut_versions` | version, published_at, published_by, dishes, values, sha256, notes | Every publish writes one immutable JSON file (`nut-db-v<N>.json`) |
| `nut_assets` | id, sha256, mime, bytes, width, height, faces_blurred, person_check_by, uploaded_by, ts, r2_key | Image metadata. The image itself is in R2 (3.4) |
| `nut_suggestions` | id, name_text (≤ 80 chars), lang, ts, status | No user id, IP or image |
| `off_cache` | gtin, json, fetched_at | **Open Food Facts only, separate, never joined into `nut_*`** (PC-D10). Purged after 30 days |

**Licence gate (enforced in code and tested).** `publish()` refuses a version if any value or portion is served from a
source whose verdict is not `use_now` or `permission_granted`. A `measurement_only` source, such as INMU values used
only to compute test-set references, can be stored but never published. The browser receives only the published JSON,
with an attribution list built from the sources it actually uses.

**Client copy.** `nutrition.html` downloads the current published JSON once (cached; it is expected to be small, about
100–300 KB for a few hundred dishes) and does all lookups and range maths on the device. The AI is sent only the dish
**names and ids**, never user data.

### 3.3 Admin UI ("โภชนาการ / Nutrition" tab in `admin.html`)

- **Lists:** dishes (search in three languages, filter by status, dish type and source), sources, the suggestions
  queue, versions.
- **Dish editor:**
  - names and aliases (TH / EN / ZH all required to publish);
  - a nutrient table with low / typ / high, method and source per row;
  - portions, each with an optional reference photo.

  Each save makes a draft revision with a required reason.
- **History:**
  - the per-field diff of every revision, showing who, when, why and which source;
  - "roll back to this" (admin / owner, re-auth) creates a new revision, so history is never rewritten.
- **Publish screen:**
  - lists the changes since the last version and the licence gate result;
  - lists plausibility warnings:
    - energy vs 4 / 4 / 9 × protein / carb / fat off by > 20 %;
    - sodium > 5,000 mg per 100 g;
    - a range low > typ;
  - "publish" needs re-auth.
- **CSV import / export:** one row per value with a required source id. Rows go in as drafts.
- **Phone screens:** cards instead of wide tables below 640 px; the nutrient grid scrolls inside its card only.
- **Text:** Thai default; English / Chinese through the existing admin language selector (`i18n/en-admin.js`,
  `i18n/zh-admin.js`).

### 3.4 Image upload (shared)

- **Accepted types:** JPEG, PNG and WebP only. The server checks magic bytes.
- **In the browser, before upload:**
  - resize to ≤ 1,600 px on the long side and re-encode to JPEG at quality 0.85, which strips EXIF;
  - client limit 1.5 MB; server limit **2 MB**, else 413;
  - at most 20 uploads per user per hour.
- **Face blur:** the same `faceRuns` → `faceBlurPlan` → `faceBlur` as Product Check (3 × 3 tiles, threshold 0.5,
  pad 0.15).
  - The preview shows "N face regions blurred".
  - Because about a third of real faces are missed (FACE-BLUR-RESULTS §6), the uploader must also tick "ไม่มีบุคคลในภาพ /
    no person visible".
  - If the detector cannot run, the upload is refused (fail-safe; there is no text-only alternative for an image upload).
- **Storage:** a new **R2 bucket** (`lensiq-nut-assets`, staging; owner decision N-D8), private, served through the
  Worker with `Content-Type` fixed from the stored mime and `Content-Disposition: inline`.
  - Images are named by SHA-256, so duplicates are free.
  - Images are portion references (a plate of food), never people, and are not shown to end users until published.
- **Audit:** every upload and delete is audited (`nut.asset.upload` with bytes, faces_blurred, and the person-check
  tick, never the image).

### 3.5 Audit

- Each nutrition action writes one `audit_log` row (`nut.dish.save`, `nut.publish`, `nut.rollback`, `nut.source.verdict`,
  `nut.import`, `bo.user.invite`, `bo.user.role`, …) with ids and changed keys only.
- The values themselves live in `nut_revisions`.
- An "Audit" view (filter by actor, action, date) is added to the shared admin core for every role (scope per 3.1).
- Retention: audit rows are kept as today (`docs/pdpa/retention-table.md`). `bo_users` personal data (username,
  display name) is listed in the ROPA.

## 4. Models and data, with licences

### 4.1 On-device components (no new model)

| Component | Choice | Licence | Verdict |
|---|---|---|---|
| OCR | PP-OCRv5 mobile det + rec th / cjk / ko / latin (vendored for Product Check) | Apache-2.0 | OK (credited already) |
| Barcode | native `BarcodeDetector`, then `zxing-wasm` self-hosted | MIT + Apache-2.0 + BSD-3 | OK (credited already) |
| Face blur | MediaPipe BlazeFace short range | Apache-2.0 | OK (credited already) |
| Label parser, unit conversion, range maths | own pure JS `lensiq-nut.js` | ours | OK |
| On-device dish recogniser | **not in this design.** Public food-photo sets are commonly research-only or have unclear licences [UNVERIFIED per set], and none covers Thai street dishes at portion level. Revisit only with a dataset whose licence allows commercial training (CLAUDE.md) | — | not used |

### 4.2 AI Gateway features (new; registry `backend/src/ai/features.js`)

| Feature | Input | Output schema (gateway-validated; extra keys refused) | Default |
|---|---|---|---|
| `nut_label` | OCR text (text mode) or panel crop after face blur (image mode, `imageModeAllowed`) | `{basis:[{kind, amount, unit}], fields:[{name, value_text, unit, basis_index, printed_line}], serving:{text, grams?, ml?}, servings_per_pack_text?, allergen_text?}`. Values are **text as printed**, never computed | off, budget 0 |
| `nut_dish` | photo crop after face blur + the list of published dish ids and names | `{items:[{dish_id \| null, name_th, name_en, confidence:"high"\|"medium"\|"low", unit_id, count_low, count_high, addons:[dish_id]}], people_visible:boolean}`. **No nutrient fields** | off, budget 0 |

- **Validators:**
  - `nut_label`: every number must occur in the OCR text, else it is flagged (2.2 step 5).
  - `nut_dish`: `dish_id` and `unit_id` must exist in the published version; counts must lie between 0.25 and 6.
  - `people_visible: true` adds a line to the card ("ภาพนี้อาจมีบุคคล") and never triggers any comment about the person.
- **Prompts:** the system prompt carries the wellbeing rules (section 7) and forbids comments on bodies, health or
  "healthiness".
- **Budget and limits:** same defaults as `pc_fields` (10 per user per day, 3 per minute).
- **Default chain:** chosen from the N7 eval with the written rule:
  1. coverage of the reference value in the range (photo) or exact field match (label);
  2. then cost;
  3. then latency.

  Gemini stays out of the default chains while the 18+ rule is open (AI-GATEWAY row 43).
- Text mode is unavailable for `nut_dish` (a dish needs the image). The fallback is manual mode on the device (2.3).

### 4.3 Food composition and product data sources

Verdicts:
- **USE NOW**: the licence allows commercial reuse.
- **SEPARATE TABLE**: share-alike data. It is used, but kept apart and never merged into our own data (PC-D10).
- **ASK PERMISSION**: no licence, or the terms reserve commercial use.

| Source | What it gives | Licence text (quoted, accessed 2026-11-10) | Verdict |
|---|---|---|---|
| **Thai FCD, INMU, Mahidol University**, Version 3 (August 2025), <https://inmu.mahidol.ac.th/thaifcd/> | Thai foods incl. Group T "Mixed foods" (Thai cooked dishes, Thai fast foods); values **per 100 g edible portion**; 2015 edition about 1,700 items, energy + 27 nutrients, INFOODS tagnames, fixed food IDs | [PRIMARY] "INMU encourages the use and dissemination of the online Thai Food Composition Database"; "Non-commercial users are authorised to access and use the data free of charge" provided "proper acknowledgement is given to the Institute of Nutrition, Mahidol University (INMU)"; "Reproduction for resale or other commercial purposes, including use in educational products or services, may incur fees." Footer: "© Thai FCD ALL RIGHTS RESERVED." Contact: kunchit.jud@mahidol.ac.th, piyanut.sri@mahidol.ac.th | **ASK PERMISSION** before any value is published (N-D3). Until then: `measurement_only` (references for our own test set; counsel to confirm this is non-commercial, L-N1) |
| **Thai Food Composition Table, Bureau of Nutrition, Department of Health (MoPH)**, revised 2018, online search 2021, <https://nutrition2.anamai.moph.go.th/en/thaifcd/222012> | 14 food groups, 24 nutrients | [PRIMARY] Footer "Copyright 2020 Department of Health : Ministry of Public Health". No licence stated | **ASK PERMISSION** (letter with the INMU one). Not used meanwhile |
| **ASEAN Food Composition Database**, INMU / ASEANFOODS, v1 (updated 2014-02-23), <https://inmu.mahidol.ac.th/aseanfoods/composition_data.html> | "Typical" values compiled from 6 ASEAN national tables, for group diets | [PRIMARY] "Copyright © 2012 Institute of Nutrition, Mahidol University. All rights reserved." No terms of use | **ASK PERMISSION** (same INMU letter). Low priority: old, and meant for group diets, not individuals |
| **USDA FoodData Central** (Foundation Foods, SR Legacy, FNDDS incl. household portion weights), <https://fdc.nal.usda.gov/api-guide/> | Generic foods and many mixed dishes per 100 g; FNDDS gram weights for household measures | [PRIMARY] "USDA FoodData Central data are in the public domain and they are not copyrighted." "They are published under CC0 1.0 Universal (CC0 1.0)." "we request that users list FoodData Central as the source of the data." API: data.gov key, 1,000 requests per hour per IP | **USE NOW.** Bulk download into `nut_values` as `borrowed_similar` where a Thai dish has a close equivalent; credited. Few Thai dishes, so it is a fallback, not the main Thai source. The key (if the API is used) is a Worker secret |
| **Open Food Facts**, <https://world.openfoodfacts.org/terms-of-use> | Barcode → packaged product nutrition per 100 g / per serving as entered by contributors | [PRIMARY] "The Open Food Facts database is available under the Open Database License." "Individual contents of the database are available under the Database Contents License." "Products images are available under the Creative Commons Attribution ShareAlike licence" and "may contain graphical elements subject to copyright". Re-users must "mention the licence and to attribute the authorship to Open Food Facts with a link to https://openfoodfacts.org"; data is "provided only for indicative information" and not for medical purposes. API [PRIMARY, API docs]: 15 product reads per minute per IP, 10 searches per minute; custom User-Agent `AppName/Version (ContactEmail)` | **SEPARATE TABLE** (PC-D10): `off_cache` only, through the Worker, shown as "community data", never merged into `nut_*`, **no OFF images stored or shown**; ODbL attribution on the card. Their images may be used **for measurement only**, outside the repo (as in P2) |
| **Owner-weighed reference portions** (5.2) | Grams per reference unit, per vendor | LENSIQ's own measurements | **USE NOW** (source "LENSIQ field weighing, <date>") |
| Thai FDA nutrition labelling and GDA notifications (4.4) | Format rules for the parser | Government notifications; Thai Copyright Act s.7 excludes laws, regulations and official notifications from copyright [SECONDARY reading; counsel to confirm] | **USE NOW** as parsing references (our own code; no text copied beyond field names) |

### 4.4 Label formats used as parsing references

| Format | Reference | What the parser expects |
|---|---|---|
| Thai full panel, **new** | MoPH Notification No. 445 (B.E. 2566) on nutrition labelling, replacing No. 182; effective 2 Jul 2024; grace period to 1 Jul 2027; 9 mandatory items (energy, total fat, saturated fat, cholesterol, protein, carbohydrate, total sugars, sodium, potassium); 7 permitted formats; simplified format no longer supported; Thai RDIs aligned with Codex NRVs. Amended by No. 467 (B.E. 2568) on the panel's background colour, from 12 Dec 2025 [SECONDARY: ChemLinked, Thai press] | Header "ข้อมูลโภชนาการ"; "หนึ่งหน่วยบริโภค", "จำนวนหน่วยบริโภคต่อ…"; kcal; "%RDI*"/"ร้อยละของปริมาณที่แนะนำต่อวัน"; **fibre is optional** (shown only if printed) |
| Thai panel, **old** (still on shelves until 2027) | MoPH Notification No. 182 (B.E. 2541): full format (15 items incl. dietary fibre) and simplified format [SECONDARY] | Same headers. Fields such as "พลังงานจากไขมัน" are read and shown but are not part of the core set |
| Thai GDA (front of pack) | MoPH Notification No. 394 (B.E. 2561) on foods required to show nutrition and GDA labels; No. 446 (B.E. 2566) says GDA labels follow the latest nutrition-label notification [SECONDARY] | "ค่าพลังงาน, น้ำตาล, ไขมัน, โซเดียม" per pack with "% ของปริมาณสูงสุดที่บริโภคได้ต่อวัน" and "ควรแบ่งกิน … ครั้ง"; the basis is **per pack** |
| Thai allergen statement | MoPH Notification No. 450 (B.E. 2567) on prepackaged food labelling, replacing No. 367 (B.E. 2557); in force 19 Jul 2024; old labels allowed until 19 Jul 2026; adds shellfish and squid; a January 2026 WTO-notified draft would add sesame, celery, mustard, lupin [SECONDARY] | "ข้อมูลสำหรับผู้แพ้อาหาร", "มี …", "อาจมี …"; keyword list kept in `lensiq-nut.js` with a dated source note; the exact Thai list is read from the Royal Gazette in N1 |
| United States | 21 CFR 101.9 Nutrition Facts [SECONDARY, verify in N1] | "Serving size", "Calories", "Total Fat", "Saturated Fat", "Sodium", "Total Carbohydrate", "Dietary Fiber", "Total Sugars", "Incl. Added Sugars", "Protein"; per serving (and dual columns) |
| EU / UK | Regulation (EU) 1169/2011 Annex XIII / XV [SECONDARY, verify in N1] | "Energy kJ/kcal", per 100 g / 100 ml, **salt** (not sodium): converted sodium = salt ÷ 2.5, marked "converted" |
| China | GB 28050 (2011; a 2025 revision is reported with a later effective date [UNVERIFIED]) | "营养成分表", 能量 in **kJ** (kcal = kJ ÷ 4.184, marked "converted"), NRV% |
| Japan | Food Labelling Standard [SECONDARY] | 栄養成分表示: エネルギー kcal, たんぱく質, 脂質, 炭水化物, **食塩相当量** (salt equivalent → sodium ÷ 2.5 rule as for EU, marked) |
| Korea, Malaysia / Singapore | national formats [UNVERIFIED] | Read by the generic parser (label words per language); reported separately in 5.1 |

Parser design: `LQNut.parseLabel(lines)` is a pure, unit-tested function with tables of field words per language
(Thai, English, Chinese, Japanese, Korean, Malay). It handles units (g, mg, µg, kcal, kJ, ml), Thai digits, decimal
commas, "<", "trace" / "ไม่มี" and multi-column tables (per serving / per 100 g / per pack) using box geometry from the OCR
boxes. A unit / basis mismatch or an energy-macro mismatch over 20 % sets "please check"; it never auto-corrects.

## 5. Measurement plan (fixed before building)

### 5.1 Label set

- **Size and source:** at least **200 photos of real nutrition panels**, taken by the owner or the team of products they
  hold. Field data:
  - stored in `~/LENSIQ-field/nutrition/labels/`, outside the repo;
  - no people (the face blur runs on every photo too).
  - Before that set exists, a **public-dataset baseline** may use Open Food Facts nutrition-panel images (CC BY-SA,
    measurement only, outside the repo), labelled "public dataset, community-entered ground truth, unverified".

| Stratum | Minimum |
|---|---|
| Thai full panel, new format (No. 445) | 60 |
| Thai panel, old format (No. 182, full or simplified) | 40 |
| Thai GDA front of pack (No. 394) | 30 |
| Foreign: USA, EU / UK, China, Japan, Korea, Malaysia / Singapore | 10 each = 60 |
| Panels with an allergen statement (overlaps the above) | ≥ 60 |
| Conditions tagged per photo: curved pack, glare, small print, crumpled, dim light | tags |

- **Ground truth written before any run:** every field as printed (value text, unit, basis column), serving size,
  servings per pack and the allergen statement verbatim. Two people transcribe and the dietitian adviser adjudicates
  disagreements.
- **Metrics:**

| Metric | Definition | Target (proposed; the owner sets it before the first run) |
|---|---|---|
| Field exact match | value + unit + basis equal after normalisation (digits, spacing, decimal comma), **per field** (energy, protein, fat, sat fat, sugar, sodium / salt, carbs, fibre, serving size, servings per pack) and **per format**, for each mode: on-device only, + text AI, + image AI | Thai new format, held-out, on-device + AI: energy, sugar, sodium, fat ≥ 90 %; reported with n and Wilson 95 % |
| **Silent wrong value (key safety metric)** | fields shown as **read** (not "please check") whose value differs from the ground truth, divided by all fields shown as read | Wilson 95 % upper bound ≤ 3 % per format (needs ≥ 120 read fields with ≤ 1 error) |
| Missed field | printed fields reported "not found" | reported |
| Allergen statement found | panels with a statement where the card shows it (verbatim match ≥ 90 % characters) | ≥ 95 %; **missed statements** reported with the Wilson upper bound; the "check the label" line is tested on every card |
| Recalculation | pure function, unit tests on synthetic labels (half pack, n servings, grams with and without serving weight) | 100 % of tests pass |
| Latency | per photo on a real low-end Android phone and on the M1 | reported |

### 5.2 Food photo set

- **Dishes:** 30 common Thai dishes in 6 dish types, 5 each:
  1. one-plate rice (e.g. ข้าวผัด, ข้าวกะเพราไก่, ข้าวมันไก่);
  2. noodles (ผัดไทย, ก๋วยเตี๋ยวน้ำ);
  3. curries and soups (แกงเขียวหวาน, ต้มยำ);
  4. salads (ส้มตำ, ลาบ);
  5. fried / grilled (ไก่ทอด, หมูปิ้ง);
  6. sweets and drinks (ข้าวเหนียวมะม่วง, ชาไทย).

  The final list is fixed in N1 with the dietitian.
- **Portions:** each dish from **2 vendors** at **3 portions** (small / regular / large or extra), photographed from 2
  angles (top, 45°). That gives at least 30 × 3 × 2 = **180 photos** (360 if both vendors are fully covered). Plates stay
  grouped: all photos of one plate share a key.
- **Reference values:**
  1. **The owner weighs every plate** (main proposal):
     - a kitchen scale with 1 g resolution;
     - tare the empty plate or bowl, weigh the full plate, and weigh separable parts (rice, topping, egg, broth vs
       solids) where possible;
     - record the vendor, date and price.
  2. **Composition per 100 g:**
     - INMU Thai FCD Group T values for the same dish (`measurement_only` until permission; counsel L-N1);
     - else a recipe calculation by the dietitian from ingredient weights and USDA FDC (CC0).
  3. **Reference nutrient = weighed grams × composition.** The label in every report is "reference = weighed portion ×
     table composition (field + INMU / USDA)". This captures **portion** error fully and **recipe** error only through
     the table's variation. That limit is stated in the report.
  4. **Optional lab analysis** (owner decision N-D6): about 10 plates sent for proximate analysis (e.g. an accredited food
     lab) to measure how far table values sit from the real plate. Cost is to be quoted.
  5. **Published INMU portion tables:** no public INMU table of Thai dish serving weights was found on 2026-11-10 (INMU
     staff list "edible portion, portion size" databases for dietary software, not public). If INMU grants access, its
     portion data seeds `nut_portions`. Our own weighing still forms the test references.
- **Metrics (per dish type and overall; every rate with n and Wilson 95 %):**

| Metric | Definition | Target (proposed) |
|---|---|---|
| Dish identification | top-1 and top-3 `dish_id` match | top-1 ≥ 80 % held-out (AI); reported per type |
| Portion error | grams estimate (count × unit grams, typ) vs weighed grams: median and P90 absolute % error | reported; no target before the first baseline |
| **Range coverage (key metric)** | share of photos where the reference energy lies inside the displayed range | ≥ 80 % held-out, Wilson lower bound reported |
| Range width | median (high − low) ÷ midpoint | ≤ 50 % (a range wider than that is not useful); reported per type |
| Midpoint error | MAPE of the midpoint vs reference for energy, protein, fat, carbs, sodium | reported per type |
| Manual mode | same coverage when the user picks the right dish and portion size | reported (this is the no-AI floor) |

- **Split, fixed before tuning:** key = plate id. `dev` when the first hex digit of SHA-256("lensiq-nut:" + key) is 0–7,
  otherwise `held-out`. The error bands (2.3), portion grams and prompt wording are tuned on dev only, and held-out is
  reported once per setting. An **independent reviewer agent** re-runs the eval and adds a fresh set of at least 30 new
  plates before any claim.
- **Source labels:** "field" (owner photos and weighing), "public dataset" (OFF baseline), "synthetic" (parser tests).
  Results go to `docs/nutrition/NUTRITION-ACCURACY.md` and the accuracy figures file.
- **Unit tests (CI):** parser, conversions, recalculation, range maths, licence gate (publish refused for a
  `measurement_only` value), schema validators, wording lint (section 7), i18n completeness. They follow the same pass
  rule locally and on CI.

## 6. Privacy (PDPA)

- **On device by default:**
  - label reading, recalculation, manual photo mode and the food log run with nothing sent;
  - the published dish table is downloaded and does not identify the user.
- **Cloud steps are opt-in:**
  - `nut_label` (text, or image after face blur) and `nut_dish` (image after face blur);
  - same rules as Product Check: admin switch, per-user consent naming the provider and the processing country,
    remember-my-choice and withdraw;
  - consent is per feature, so a user who consented for Product Check is asked again for food photos;
  - EXIF is stripped by re-encoding; the image is downscaled to ≤ 1,024 px;
  - nothing is stored by LENSIQ, and gateway logs carry no content.
- **Who appears in a meal photo:** food photos are taken at tables, so hands, other diners and children are more likely
  than on product packs.
  - The blur runs on every upload, and the user sees the blurred preview and confirms.
  - The measured miss rate (about a third of real faces, mostly small) is shown in the help text and is on the legal list
    (L39, L-N4).
  - Guidance on the camera screen: "ถ่ายเฉพาะอาหาร / photograph the food only".
- **Is a food log "health data" under s.26?**
  - s.26 lists health data, and also religious belief. Food entries can reveal both indirectly: diabetic-style patterns,
    allergies the user records, halal or vegetarian ("เจ") eating. Draft view for counsel:
    - **Single entries** of what someone ate are ordinary personal data.
    - A **log kept to manage a condition**, or **allergy notes**, may be health data.
    - Inferred religion should never be derived.
  - **Mitigation in this design:**
    - the log stays on the user's device;
    - LENSIQ never receives it, so LENSIQ is not its controller (the user's own personal use, s.4(1), to be confirmed);
    - no field asks for conditions, weight, BMI, religion or diet type;
    - no inference is made from the log.
  - **Any future sync or upload of the log is treated as sensitive data:** explicit consent under s.26, a DPIA row and
    counsel first (N-D9).
- **Minors:** no age gate today. Wellbeing rules apply to everyone. Gemini stays out of default chains (18+ open).
  Counsel question L-N5.
- **Admin data:**
  - `bo_users` (username, display name, password hash, TOTP secret);
  - audit rows with ip_hash as today;
  - the uploaded reference photos, which show food with no people (person check plus blur).

  These are added to `docs/pdpa/ROPA.md`, `data-map.md` and `retention-table.md` in N0 / N3.
- **Open Food Facts lookups:** only the GTIN is sent, through the Worker (no user id). The cache holds product data only.
- **Counsel notes:** a new section F5 "Nutrition Lens" in `docs/PDPA-NOTES-FOR-COUNSEL.md` (N0).

## 7. Wellbeing rules (product rules, enforced by tests)

1. **Neutral presentation:**
   - values are shown as numbers with units, in one neutral colour;
   - no "good / bad / healthy / unhealthy / junk / clean / cheat / guilt / burn off" words, in any language;
   - no traffic lights, scores, grades, rankings, "healthier alternative" suggestions or emoji judgements.
   - % Thai RDI and GDA percentages are shown **only when printed**, as printed.
2. **Hide calories:** one setting hides energy everywhere (label, photo, log). Other nutrients stay. Energy can be
   revealed per card with a tap; the setting is not changed by that tap.
3. **No goals or pressure:**
   - no weight-loss targets, calorie budgets, "remaining today", streaks, badges, challenges, reminders or
     notifications;
   - no weight, BMI or body-photo input;
   - photo mode never comments on a person.
4. **Allergens:**
   - always "โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง / Always check the actual label yourself";
   - never "allergen-free" or "safe for …";
   - photo mode shows **no allergen information**, because a photo cannot show ingredients.
5. **Not medical advice:**
   - the fixed footer (2.1);
   - for people managing a condition (diabetes, kidney disease, pregnancy, food allergy), a suggestion to see a doctor
     or dietitian;
   - no diet plans, no "you should eat", no medical or cosmetic claims (CLAUDE.md fortune bans carry the same spirit).
6. **Support line** (owner decision N-D5): in Help, "หากเรื่องอาหารหรือการกินทำให้คุณกังวลหรือทุกข์ใจ ปรึกษาสายด่วนสุขภาพจิต
   1323". It is neutral and always available, never triggered by a user's data.
7. **Enforcement:**
   - a wording lint test (`tests/unit/nut-wording.test.js`) scans every TH / EN / ZH string, the AI system prompts and
     the published dish names against a banned list;
   - an e2e test checks that "hide calories" removes every energy value from the DOM;
   - a unit test checks that no log view computes a difference against any target.

## 8. Owner decisions needed (N-D1–N-D10)

| # | Decision | Proposed default |
|---|---|---|
| N-D1 | New page `nutrition.html` in category 5, or a tab in `medicine.html` | new page (category 5); a link from Product Check. Adds a page to the CLAUDE.md category table |
| N-D2 | Shared admin core with roles (3.1) built in this feature | yes, first consumer; owner login unchanged |
| N-D3 | Use INMU Thai FCD values in the public product before INMU answers? | **no**: measurement only until written permission; USDA FDC and owner-weighed portions are published meanwhile. (Differs from the Thai FDA testing decision because INMU's page reserves commercial use explicitly) |
| N-D4 | Photo mode without AI (manual pick) shown even when AI is off | yes |
| N-D5 | Support line 1323 in Help | yes, in Help only |
| N-D6 | Lab analysis of about 10 plates | optional; decide after a quote |
| N-D7 | Admin role access to existing tabs; TOTP mandatory for admins | admins see only Nutrition (and later back-offices) + audit; TOTP mandatory for admin |
| N-D8 | R2 bucket for admin images (new Cloudflare service, staging) | yes, staging only |
| N-D9 | Food log sync | not in scope; on device only |
| N-D10 | Targets in 5.1 / 5.2 | as proposed; set before the first run |

## 9. Phases and effort

Effort sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 6–10 days. Every phase follows the working rules:
- fixed test set first;
- real numbers per condition;
- an independent reviewer who re-measures;
- TH / EN / ZH;
- CI green before the next phase.

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| N0 | Owner decisions N-D1–D10; permission letters to INMU (Thai FCD + ASEAN FCD) and the Department of Health, drafted in `docs/legal/` for the owner to send; counsel notes F5; legal rows L-N1… into `CTO-BRIEF.md` §8; ROPA / data-map rows | S (docs) | owner |
| N1 | **Test sets first:** label photo protocol + labelling sheet, dish list with the dietitian, weighing protocol and sheet, banned-wording list; read Notifications 445 / 467 / 394 / 446 / 450 from the Royal Gazette and fix the parser tables; OFF public baseline set | M | owner photos, dietitian |
| N2 | `lensiq-nut.js` parser + conversions + recalculation (unit tests); `nutrition.html` label tab reusing the PC camera / crop / OCR; allergen box; hide calories; numbers on the label set (on-device baseline) | L | N1 |
| N3 | **Shared admin core:** `bo_users`, roles and `can()`, invite / disable, TOTP rules, audit view, image upload with limits + face blur + person check, R2, admin i18n, phone layout; tests per role | L | N2 not required (parallel) |
| N4 | Nutrition data model + admin tab: dishes, values, portions, sources, revisions, draft → approve → publish, rollback, CSV import, licence gate, publish JSON; USDA FDC import; `off_cache` + Worker route | L | N3 |
| N5 | Gateway features `nut_label`, `nut_dish`: schemas, validators (grounding, ids), prompts with wellbeing rules, consent per feature, mocked-provider tests | M | N4, P5–P7 |
| N6 | Photo tab: face blur preview, dish chips, portion picker, range maths with error bands, manual mode, "suggest this dish"; e2e | M | N4, N5 |
| N7 | Eval tool (`tools/nut-eval.mjs`, all configured providers, outside CI) + first full run on the owner's keys; choose default chains; error bands from dev; `docs/nutrition/NUTRITION-ACCURACY.md`; reviewer with a fresh set | M | N2, N6, owner photos + weighing + keys |
| N8 | Food log on the device (opt-in, IndexedDB, export, delete all, no targets), wording lint across everything, help text | S | N2, N6 |

**Total:** about **6–9 weeks of rounds**, excluding waits (INMU / DoH replies, counsel, the owner's weighing sessions).

- **Order:** N0 → N1 → N2 + N3 (parallel) → N4 → N5 → N6 → N7 → N8.
- **Label mode is useful on its own after N2.** Photo mode needs N4–N6 and real numbers from N7 before any accuracy claim
  is made.

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| NR1 | A wrong number read from a label is trusted (sodium for a kidney patient, sugar for a diabetic) | values shown with their source line; "please check" status; key metric silent wrong value ≤ 3 % upper bound; not-medical-advice footer; recalculated values kept apart from printed ones |
| NR2 | A missed allergen statement is read as "no allergens" | never "allergen-free"; fixed "check the actual label" line; missed-statement rate measured; photo mode shows no allergen info |
| NR3 | Photo estimates read as exact | always a range widened to the measured error band; confidence note with measured coverage; the AI cannot output nutrient numbers |
| NR4 | INMU or Department of Health data used commercially without permission | licence gate in `publish()`; INMU values measurement only (N-D3); letters in N0; USDA (CC0) as the published fallback |
| NR5 | ODbL share-alike from Open Food Facts reaches our table | separate `off_cache`, never joined, no OFF images stored (PC-D10); a test that `publish()` has no OFF source |
| NR6 | Eating-disorder harm (calorie fixation) | wellbeing rules 7; hide calories; no targets / streaks; wording lint; support line in Help (N-D5) |
| NR7 | People in meal photos reach a provider (face blur misses about a third of real faces) | blurred preview + confirm; "photograph the food only"; manual mode needs no upload; L39 / L-N4 for counsel |
| NR8 | Thai dish variety (vendor recipes, oil) makes ranges too wide to be useful | report width per dish type; dishes whose measured width > 50 % are marked "wide range" in the admin and on the card; more weighed portions per vendor |
| NR9 | Label rules change during the 2024–2027 transition (old and new Thai formats co-exist; allergen list amendment pending) | parser tables dated with their source; both formats in the test set; review every 6 months |
| NR10 | Admin roles weaken the back office (a new class of accounts) | owner path unchanged; TOTP mandatory for admin; re-auth on publish / roles; second-person publish; full audit; per-role tests |
| NR11 | Food log becomes sensitive data if ever synced | on device only; no condition / weight / religion fields; any sync needs a new design, s.26 consent and counsel (N-D9) |
| NR12 | OCR on curved or glossy small-print panels on low-end phones | quality hints; user redraws the crop; text editing; latency measured on a real low-end phone in N2 |

## 11. What the owner must provide

1. **At least 200 nutrition-panel photos** in the strata of 5.1:
   - products the team holds, with no people;
   - placed in `~/LENSIQ-field/nutrition/labels/` (outside the repo).
2. **Food photo session:** buy the 30 dishes from 2 vendors in 3 portions and photograph each plate twice before weighing.
   - A **kitchen scale** (1 g resolution, up to at least 3 kg) is needed, plus the weighing sheet from N1.
   - Estimated time is 3–4 half-days; food cost is to be estimated in N1.
3. **A dietitian adviser** (นักกำหนดอาหาร), about 1–2 days, to:
   - fix the dish list;
   - adjudicate ground truth;
   - do the recipe calculations where INMU values cannot be used;
   - review the wellbeing wording.
4. **Letters:** sign and send the N0 drafts to INMU (Thai FCD and ASEAN FCD) and to the Department of Health. INMU also
   offers commercial terms, so a budget line for a possible fee is needed.
5. **AI keys and budget:** the existing gateway keys, plus a monthly budget for `nut_label` / `nut_dish`. USD 10 for the
   first eval month is proposed.
6. **Decisions N-D1–N-D10** (section 8), and an R2 bucket on the staging account (N-D8).
7. **Counsel:** the rows in section 12, before charging starts.

## 12. Proposed legal-list rows and credit lines

### 12.1 Rows for `docs/CTO-BRIEF.md` §8 (numbered L-N*; renumbered at merge)

| # | Item | Why | Where in code / docs | Status | Added |
|---|---|---|---|---|---|
| L-N1 | INMU Thai Food Composition Database (v3, Aug 2025) | "All rights reserved"; free only for non-commercial use; commercial use "may incur fees". Is using INMU values only to compute our internal test references non-commercial? Written permission and fee terms needed before publishing any value | `nut_sources` verdict; licence gate; design §4.3, §5.2; letter drafted in N0 | open | 2026-11-10 |
| L-N2 | Department of Health Thai Food Composition Table (2018; online 2021) | Copyright notice, no licence stated; permission needed | design §4.3; letter in N0 | open | 2026-11-10 |
| L-N3 | ASEAN Food Composition Database (INMU, 2014) | "All rights reserved", no terms of use | design §4.3; INMU letter | open | 2026-11-10 |
| L-N4 | Meal photos to AI providers | Meal photos are more likely than packs to contain other diners or children; face blur misses about a third of real faces; preview + confirm; cross-border (as L9, L39) | `nut_dish`; design §2.3, §6 | open | 2026-11-10 |
| L-N5 | Food log and s.26 | Can an on-device log be health or religious data? Confirm LENSIQ is not its controller while it never leaves the device; conditions for any future sync; minors using nutrition features | design §2.4, §6 | open | 2026-11-10 |
| L-N6 | Nutrition and allergen display liability | Showing printed values and allergen text read by OCR: is the "check the actual label" line and the not-medical-advice footer enough? Any Thai FDA rule on apps restating label information? | design §2.2, §7 | open | 2026-11-10 |
| L-N7 | Open Food Facts in nutrition (extends L15) | ODbL / DbCL with attribution; separate cache; images CC BY-SA used for measurement only; "indicative, not for medical purposes" | `off_cache`; design §4.3 | open | 2026-11-10 |
| L-N8 | Thai FDA notifications as parser references | Thai Copyright Act s.7 is read as excluding official notifications; confirm, and confirm field words may be used as-is | `lensiq-nut.js`; design §4.4 | open | 2026-11-10 |
| L-N9 | Back-office users and roles | New personal data (admin / editor accounts), audit retention, image uploads by staff; ROPA rows | `bo_users`, `nut_assets`; design §3 | open | 2026-11-10 |
| L-N10 | Medical-device or health-claim positioning | Does a nutrition reader with ranges and a food log fall under medical-device software rules (as L21)? Wording must avoid health claims | design §7 | open | 2026-11-10 |

### 12.2 Credit lines (added to `docs/CREDITS-MEDIA.md` §4 and `LICENSES/THIRD_PARTY.md` when the source is first used; shown on the card when a value from it is shown)

- **USDA FoodData Central:** "Source: U.S. Department of Agriculture, Agricultural Research Service. FoodData Central,
  <year>. fdc.nal.usda.gov. Public domain (CC0 1.0). USDA does not endorse LENSIQ."
- **Open Food Facts:** "Product data from Open Food Facts (https://openfoodfacts.org), available under the Open Database
  License (ODbL); individual contents under the Database Contents License. Community data; may differ from your label."
- **INMU** (only after permission, wording per INMU's reply): "Thai Food Composition Database, Institute of Nutrition,
  Mahidol University (INMU), Version 3 (2025). Used with permission."
- **Department of Health** (only after permission): "Thai Food Composition Table, Bureau of Nutrition, Department of
  Health, Ministry of Public Health. Used with permission."
- **LENSIQ field weighing:** "Portion weights measured by LENSIQ, <date>, <n> plates."
- **Models already credited** for Product Check: PP-OCRv5 (Apache-2.0, PaddlePaddle), MediaPipe BlazeFace (Apache-2.0,
  Google), zxing-wasm (MIT / Apache-2.0 / BSD-3).

### 12.3 Counsel notes

Section F5 "Nutrition Lens" in `docs/PDPA-NOTES-FOR-COUNSEL.md` (written in N0) carries:
- L-N1–L-N10 with these draft views;
- the s.26 analysis in section 6.

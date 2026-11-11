# Product Check P7: AI integration, results (2026-11-10)

> Phase P7 of `docs/PRODUCT-CHECK-DESIGN.md` §12. **No real API key was used and nothing is deployed.** Every provider in
> the tests is a mock. The AI features are **off with budget 0** on a new install. This phase has **no AI accuracy
> number**: the per-model numbers come from the P8 run on the owner's keys (harness built here, §6).
> The one measured number is the patient-name guard, on a **synthetic** fixed set (§3).

## สรุปสำหรับเจ้าของ (Thai summary)

- **เจ้าของตัดสินแล้ว (2026-11-10)**
  - (b) ส่งให้ AI ได้**เฉพาะข้อความที่อ่านจากฉลากจริง** (OCR บนเครื่อง) ผู้ใช้ลบหรือแก้คำที่อ่านผิดได้ แต่คำที่พิมพ์เพิ่ม
    (เช่น ชื่อคน เบอร์โทร) จะถูกขีดฆ่า "ไม่ส่ง: ไม่มีบนฉลาก" และไม่ถูกส่งเลย
  - ฉลากจ่ายยา / ใบสั่งยา: ปิด AI
  - เบอร์และอีเมลของผู้ผลิต: เก็บไว้ (ไม่ลบ ไม่บล็อกภาพ)
- **ตัวกรอง "หลักฐานว่าเป็นฉลากสินค้า": วัดโดยผู้ตรวจอิสระแล้ว เจ้าของตัดสิน 2026-11-10 เลือกทางเลือก ก** (รายละเอียด §3.7)
  - ทางเลือก ก = คงตัวกรองไว้ตามเดิม เพิ่มคำแนะนำบนจอเมื่อถูกปฏิเสธ (ถ่ายด้านที่มีเลขทะเบียนหรือส่วนประกอบ หรือสแกนบาร์โค้ด)
    แก้ 8 กรณีที่จัดประเภทผิด แล้ว commit P7 โดยค่าเริ่มต้น AI ปิดและงบ 0
  - **ตัวเลขทางการ (ผู้ตรวจอิสระ วัดครั้งเดียว ชุดล็อก sha256 470d3e7b… แหล่งที่มา: สังเคราะห์)**
    - ข้อมูลส่วนบุคคลที่ไปถึง AI: **0/260** ทั้งโหมดข้อความและโหมดภาพ (เป้า 0: ผ่าน)
    - ฉลากสินค้าจริงถูกปฏิเสธ: **69/360 = 19.2 %** (เป้าต่ำกว่า 5 %: **ไม่ผ่าน**)
    - แยกตามเงื่อนไข: ฉบับสะอาด 12.5 %, OCR คุณภาพต่ำ 22.5 %, ไทย 25.0 %, ต่างประเทศ 16.7 %, มีบาร์โค้ด/เลขทะเบียนที่เครื่องอ่านได้ 5.0 %,
      ไม่มี 28.2 %, ด้านหน้ากล่อง 38.9 %, ภาพที่อ่านได้สั้น 28.9 %, ฉลากยาว 7.8 %, ด้านหลัง 1.1 %
    - 61 จาก 69 รายการถูกปฏิเสธเพราะไม่มีหลักฐาน (ด้านหน้ากล่อง หรืออ่านได้ 2–4 บรรทัด) อีก 8 รายการจัดประเภทผิด
  - **หลังแก้ วัดซ้ำบนชุดเดิมที่ใช้ไปแล้ว (ไม่ใช่ตัวเลขอิสระ เพราะแก้โดยเห็นชุดนี้)**: ข้อมูลส่วนบุคคลถึง AI 0/260,
    ฉลากสินค้าถูกปฏิเสธ 61/360 = 16.9 % (เหลือเฉพาะกรณีไม่มีหลักฐาน), ฉลากที่มีชื่อบุคคลของผู้ผลิต 0/20 ถูกปฏิเสธ
  - สิ่งที่ผู้ใช้เห็นเมื่อถูกปฏิเสธเพราะไม่มีหลักฐาน: ข้อความบอกขั้นต่อไป และปุ่ม "สแกนบาร์โค้ดในภาพนี้" กับ "ถ่ายอีกด้านของฉลาก"
    เอกสารส่วนบุคคลและฉลากจ่ายยาได้ข้อความบอกเหตุผลเท่านั้น ไม่มีคำแนะนำให้ลองใหม่
  - ทางเลือก ข ยังไม่ได้สร้าง ถ้าเจ้าของสั่ง จะทำเป็น commit แยก และวัดครั้งเดียวบนชุดล็อกชุดใหม่ (§3.7)
- **ตัวกรอง "หลักฐานว่าเป็นฉลากสินค้า" (เจ้าของตัดสิน 2026-11-10 ทางเลือก 1): กติกาและตัวเลขชุด dev** (รายละเอียด §3.4)
  - ใช้การตัดสินเดียวกันทั้งโหมดข้อความและโหมดภาพ: ส่งให้ AI ได้เมื่อ (1) มีหลักฐานว่าเป็นฉลากสินค้า (2) ไม่มีสัญญาณของเอกสารส่วนบุคคล
    (ผู้รับ ผู้ส่ง ที่อยู่จัดส่ง ใบสั่งซื้อ ใบเสร็จ ใบรับรองแพทย์ ใบนัด จดหมาย) และ (3) ไม่ใช่ฉลากจ่ายยา
  - ไม่ผ่าน: ไม่มีหน้าขอความยินยอม ไม่มีการส่ง มีข้อความบอกเหตุผล (ไทย อังกฤษ จีน) ผลตรวจในเครื่องยังใช้ได้
  - กติกาหลักฐาน: หลักฐานแข็ง 1 อย่าง (รูปแบบเลขทะเบียน หรือบาร์โค้ดที่อ่านได้และเลขตรวจสอบถูก) **หรือ** หลักฐานบนฉลากต่างชนิดกัน 2 ชนิด
    (ส่วนประกอบ ตารางโภชนาการ ปริมาณสุทธิ ล็อต/วันหมดอายุ ผู้ผลิต วิธีเก็บ คำเตือน ประเภทผลิตภัณฑ์ คำว่าเลขทะเบียน)
    วิธีใช้ ขนาดยา และปริมาณ นับรวมกันเป็น 1 ชนิดเท่านั้น
  - **ตัวเลขชุด dev (ผมเขียนและปรับกับชุดนี้เอง ไม่ใช่ผลวัด; แหล่งที่มา: สังเคราะห์)**: เอกสารที่ไม่ใช่ฉลากสินค้าถูกปฏิเสธ 174/174,
    ฉลากจ่ายยา (รวมคลินิกไต้หวันและผู้ป่วยนอกเซี่ยงไฮ้) 42/42, ฉลากสินค้าจริงถูกปฏิเสธผิด 14/335 = 4.2 %
    (ฉบับสะอาด 0/67, OCR คุณภาพต่ำ 14/268 = 5.2 %, ฉลากต่างประเทศ 4/125 = 3.2 %)
  - เป้า (0 รายการจากเอกสารที่ไม่ใช่สินค้า และปฏิเสธฉลากจริงต่ำกว่า 5 %): วัดแล้วโดยผู้ตรวจอิสระ ผลอยู่ในข้อด้านบนและ §3.7
  - เพิ่มฉลากจ่ายยาต่างประเทศ 2 แบบที่พลาด (คลินิกไต้หวัน ผู้ป่วยนอกเซี่ยงไฮ้) ในชุด dev ของตัวตรวจฉลากจ่ายยาแล้ว และจับเลขบัตรไต้หวันได้แล้ว
  - เซิร์ฟเวอร์ตรวจซ้ำด้วยฟังก์ชันเดียวกันกับข้อความที่ได้รับ สิ่งที่ตรวจได้เฉพาะฝั่งเครื่อง: โหมดภาพที่ไม่มีข้อความ, ที่มาของข้อความ (OCR), และว่าสแกนบาร์โค้ดจริงหรือไม่
- **ตัวเลขทางการของตัวกันชื่อ (ผู้ตรวจอิสระ ชุดใหม่ทุกครั้ง)**: รุ่น 1 = 60.6 %, รุ่น 2 = 78.8 %, รุ่น 3 = 76.0 %, รุ่น 4 = 73.2 %,
  **รุ่น 5 = 62.0 %** [52.2–70.9] (ชุดใหม่ sha256 733e812c… ลบ 100 / เก็บ 136 ยากกว่าเดิมในรูปแบบที่ไม่ใช่ของไทย) ไม่ถึงเป้า 99 %
  - รุ่น 5: ลบผิด 2.9 %, จับฉลากจ่ายยาได้ 20/22 (พลาดฉลากคลินิกไต้หวันและใบผู้ป่วยนอกเซี่ยงไฮ้), บล็อกภาพสินค้าทั่วไป 1/32,
    ข้อความที่มีข้อมูลส่วนตัวแต่ยังอนุญาตภาพ 8/22
  - ช่องโหว่ที่ยังมี: เบอร์และเลขบัตรของต่างประเทศ (มือถือไต้หวัน/จีนแบบเว้นวรรค เบอร์อังกฤษ/อเมริกา บัตรไต้หวัน NHS
    และ MRZ หนังสือเดินทาง), ชื่อจีน/ญี่ปุ่น/เกาหลีที่ไม่มีคำว่า 姓名, การตรวจฉลากจ่ายยาฝั่งเซิร์ฟเวอร์อ่อนลงหลังลบข้อมูล
    (6/22 ผ่านเซิร์ฟเวอร์ได้) จึงต้องพึ่งการตรวจในเครื่องที่ดูข้อความดิบ และการตรวจที่มาจากฉลากกับการเบลอใบหน้าบังคับได้เฉพาะฝั่งเครื่อง
  หลังข้อ (b) ความเสี่ยงของเส้นทางข้อความเหลือหลัก ๆ เฉพาะข้อความบนฉลากที่ OCR อ่านได้ (เช่น ชื่อผู้ป่วยที่พิมพ์บนฉลาก)
  ไม่ใช่ข้อความที่ผู้ใช้พิมพ์เอง

- เพิ่มฟีเจอร์ AI 3 ตัวใน gateway: `pc_fields` (อ่านข้อมูลบนฉลาก), `pc_claims` (หาคำโฆษณาเกินจริง), `pc_translate` (แปลฉลาก)
  - ทุกตัว **ปิด งบ 0** ในการติดตั้งใหม่ ไม่มีอะไรทำงานจนกว่าเจ้าของเปิด
  - ผลลัพธ์ไม่มีช่องคำตัดสิน มีแต่สัญญาณเสี่ยง
  - `pc_claims` ต้องคัดลอกข้อความหลักฐานตรงตัวจากฉลาก ถ้า AI แต่งข้อความขึ้นเอง gateway ปฏิเสธคำตอบทั้งชุด
- ในแท็บ "ตรวจสินค้า" มีปุ่ม "ขอความเห็นจาก AI" (ไม่บังคับ)
  - หน้าขอความยินยอม**หน้าเดียว** บอกผู้ให้บริการ โมเดล และประเทศที่ประมวลผลของแต่ละงาน
  - ให้เลือกอย่างเดียวว่าจะส่ง "ข้อความเท่านั้น" (ค่าเริ่มต้น) หรือ "ภาพถ่ายสินค้า (เบลอใบหน้าก่อนส่ง)"
  - มีช่อง "จำการเลือก" และปุ่มถอนความยินยอมที่เห็นได้ตลอด
  - เมื่อจำแล้วจะไม่ถามซ้ำ แต่**ภาพที่เบลอแล้วต้องให้ดูและกดยืนยันทุกครั้ง**
- ตัวกันชื่อผู้ป่วยทำงานในเครื่องก่อนส่งทุกครั้ง
  - โหมดข้อความ: ลบชื่อ, HN, เบอร์โทร, เลขบัตรประชาชน, อีเมล และวันเกิดออก แล้วแสดงให้ผู้ใช้เห็นว่าลบอะไร
  - โหมดภาพ: ถ้าพบข้อมูลเหล่านี้จะไม่ส่งภาพ และเสนอให้ส่งเฉพาะข้อความที่ลบแล้วแทน
  - เซิร์ฟเวอร์ตรวจซ้ำด้วยโมดูลเดียวกัน
- **ตัวเลขทางการของตัวกันชื่อผู้ป่วย: 76.0 %** (รุ่น 3 วัดโดยผู้ตรวจอิสระครั้งเดียวบนชุดใหม่ที่แช่แข็งไว้ sha 1023ef71…)
  ผลก่อนหน้า: รุ่น 1 60.6 %, รุ่น 2 78.8 % ตัวกันแบบกฎตายตัว**ทำ 99 % กับชื่อคนที่เขียนอิสระไม่ได้** จึงใช้**การป้องกันหลายชั้น**
  1. **ตัวกัน (รุ่น 3)** ลบชื่อที่มีคำนำหน้าได้ทุกฉลาก (ยกเว้นยี่ห้อที่มีคำว่าครีม ชา โลชั่น ฯลฯ หรือรูป 's) และลบบรรทัดที่เป็นชื่อล้วนบนฉลากจ่ายยา
     จับเลขบัตรประชาชน 13 หลักที่อยู่ลำพังหรือหลัง ปชช. ได้ด้วย
  2. **ต้องดูข้อความก่อนส่งทุกครั้ง** หน้าจอแสดงข้อความที่จะส่งตรงตัว ไฮไลต์ส่วนที่ลบ แก้หรือลบเพิ่มได้ ต้องกด "ส่งข้อความนี้" ก่อน
     "จำการเลือก" ไม่ข้ามขั้นนี้ ถ้ามีการลบหรือเป็นฉลากจ่ายยา ข้อความสินค้าทั่วไปพับไว้ แต่กดเปิดได้ทันที
  3. **ฉลากจ่ายยา/ใบสั่งยา: ปิด AI ทั้งข้อความและภาพเป็นค่าเริ่มต้น** (รอเจ้าของตัดสิน ตั้งเป็น "ส่งข้อความหลังตรวจ" ได้) ผลในเครื่องยังใช้ได้
     ผู้ตรวจอิสระวัดตัวตรวจฉลากจ่ายยา: จับได้ 24/24 แจ้งผิด 0/32 จึงไม่มีฉลากจ่ายยาหลุดออกไป
  4. **รุ่น 4 (หลังผลวัด 76 %)** เบอร์ผู้ผลิต/ร้าน/คอลเซ็นเตอร์ในบล็อกที่อยู่หรือข้อมูลติดต่อไม่ถูกลบและไม่บล็อกภาพ ชื่อหยุดที่คำถามหรือชื่อยา
     และไม่เกิน 4 คำ เพิ่มเบอร์มือถือจีน เลขบัตรจีน 18 หลัก บัตรฮ่องกง hn ตัวเล็ก หนังสือเดินทาง ที่อยู่ของผู้ป่วย และขีดเส้นใต้
     "อาจเป็นชื่อคน" ในหน้าตรวจข้อความ (ไม่ลบเอง ผู้ใช้ตัดสิน) รุ่น 4 ยังไม่ได้วัดโดยผู้ตรวจอิสระ
- ชุดทดสอบของผมเองใช้เป็นชุด dev เท่านั้น ชุด hold-out เดิมกลายเป็น dev บางส่วนแล้ว การวัดผลจริงให้ผู้ตรวจอิสระเขียนชุดใหม่และวัด
- ผล AI แสดงต่อท้ายผลในเครื่อง พร้อมคำว่า "ค่าประมาณจาก AI" ชื่อผู้ให้บริการ และประเทศ ไม่ทับข้อมูลในเครื่องหรือข้อมูลทางการ
  - สัญญาณจาก AI แสดงแยกจากกฎในเครื่อง พร้อมบอกว่าตรงกันกี่กฎ
- งานต่อเนื่องหลัง P7 (เจ้าของอนุมัติ 2026-11-10)
  - เทสต์ความลับตรวจเฉพาะไฟล์ที่ git ติดตาม และยืนยันว่า `backend/.dev.vars` ถูก git-ignore ถ้าลบกฎ ignore เทสต์จะไม่ผ่าน
  - โหมดประเมินผลในเครื่อง (`AI_EVAL_LOCAL=1` และ URL ของ Worker เป็น localhost และ Origin เป็น localhost) ข้ามเฉพาะตัวกรอง "ต้องเป็นฉลากสินค้า"
    ตัวกันชื่อผู้ป่วยและการปฏิเสธฉลากจ่ายยายังทำงานเสมอ มีเทสต์ 5 ชุดพิสูจน์ว่าเปิดบน Worker จริงไม่ได้ (§3.5)
  - ผลกระทบต่อข้อความโฆษณา (แหล่งข้อมูล: ชุดสาธารณะ ติดป้ายโดย AI): ข้อความในชุด P3 ผ่านตัวกรองเพียง 6.1 % (held-out)
    และข้อความที่มีคำโฆษณาเกินจริงผ่านเพียง 2.1 % (3 จาก 141) ที่เหลือใช้ได้แค่กฎในเครื่อง (recall 65.9 % เป้า 80 %) (§3.6)
  - ยังวัด recall ของ AI บนฉลากเต็มไม่ได้ ต้องมีชุดฉลากเต็มชุดใหม่และงบเรียกโมเดล (§3.6)
  - ข้อเสนอประเภทการถ่าย "โฆษณา" (ออกแบบอย่างเดียว ยังไม่สร้าง): `docs/product-check/ADVERT-CAPTURE-PROPOSAL.md`
- เตรียม P8 ไว้แล้ว
  - `npm run ai:test-enable` เปิด 3 ฟีเจอร์เฉพาะ D1 ในเครื่อง (`wrangler dev`) งบรวม 50 USD
  - `npm run ai:eval:pc` วัดทุกโมเดล หยุดเองเมื่อถึงเพดาน 10 USD ต่อโมเดลหรืองบรวม ข้ามผู้ให้บริการที่ไม่มีคีย์
  - ห้ามรันใน CI และห้ามรันกับเซิร์ฟเวอร์จริง

## 1. What was built

| File | What |
|---|---|
| `backend/src/ai/pc-features.js` (new) | `pc_fields`, `pc_claims`, `pc_translate`. Each has a strict JSON schema (`additionalProperties: false`, every key required, **no verdict field**), a short system prompt (no verdicts, no dosing or medical advice, no invented text, never guess `[removed]`) and a `verify(json)`. `PC_CLAIM_RULES` = the 36 text-detectable rules of RULES.md, checked against `lensiq-claims-rules.js` by a test |
| `backend/src/ai/features.js` | The three features are now `live` with a `build`. Defaults are unchanged: **off, budget 0, image mode off** (`settings.js`) |
| `backend/src/ai/gateway.js` | **Feature validator hook**: after the schema check, `output.verify` may reject the answer (counted as `schema_mismatch`: one retry, then the next provider) or clean it. **Local eval echo**: with `AI_EVAL_LOCAL=1` and a localhost Origin, the answer carries the settled cost and the latency of each attempt. This only happens on a local `wrangler dev`; a public Origin never gets it (tested) |
| `lensiq-pc-guard.js` (new) | Patient-name / personal-identifier guard (`LQPCGuard.scan` / `redact`). It runs on the device before any send, and the backend runs the same module (`pc-features.js` imports it, as `fortune.js` imports `fortune-ai.js`) |
| `lensiq-ai.js` | `ensureConsentGroup` puts several features on **one** consent screen and names the provider, model and country used for each one. `send` is the POST on its own, so a page step (the blurred preview) can sit between consent and send. `consentState` reports the remembered or session choice. Image-mode wording is now "Photo of the product (faces blurred first)". **Bug fixed from P5**: `LQAI.withdraw(feature)` was overwritten by the pure `withdraw(storage, feature)` and did nothing; the browser API now wins |
| `lensiq-pc-ai.js` (new) | The "ask AI" step, painted into `#pcAiSlot` inside the risk-signal card (§2) |
| `lensiq-pc-lookup.js` | Adds `#pcAiSlot` under the on-device and official rows and fires `lq-pc-card` after each render. No other change |
| `medicine.html`, `i18n/en-med.js`, `i18n/zh-med.js` | Loads `lensiq-ai.js`, the guard and the AI step. 48 new `md.pc.ai.*` strings in TH, EN and ZH |
| `tools/pc-guard-testset.mjs`, `docs/product-check/p7-guard-testset.json` | The guard's fixed set: generator + frozen JSON (`--check`, `--eval`) |
| `docs/product-check/p7-ai-testset.json` | Fixed synthetic sets for the P8 run: 16 `pc_fields` labels, 10 `pc_translate` labels |
| `tests/unit/backend-site.test.js` | **Secrets test (owner decision 2026-11-10)**: scans git-tracked files under `backend/` only (`git ls-files`; index content when a tracked file is missing locally), fails on any tracked `.dev.vars*` except the example, and asserts with `git check-ignore --no-index` that `backend/.dev.vars` and `.dev.vars.*` are ignored by a tracked `.gitignore`. Passes with or without a local `backend/.dev.vars`. Three more key shapes added (OpenRouter, OpenAI-style, Google) |
| `tools/lib/ai-trial.mjs`, `tools/ai-test-enable.mjs`, `tools/pc-ai-eval.mjs` | P8 preparation (§6). npm: `ai:test-enable`, `ai:eval:pc` |
| Tests | `tests/unit/backend-pc-features.test.js` (8), `tests/unit/pc-guard.test.js` (4), `tests/unit/pc-ai.test.js` (6), `tests/unit/pc-ai-tools.test.js` (4), `tests/e2e/product-check-ai.e2e.mjs` (4). One existing assertion was updated (§5) |

## 2. The flow on the page

1. The step appears only when the page has an API base and the label text is not empty. Without a server nothing changes,
   so the existing offline e2e cases are untouched.
2. **Dispensing labels first.** If the text looks like a dispensing / prescription label and the setting
   `LQPCGuard.DEFAULTS.dispensingAI` is `"off"` (owner decision 2026-11-10: AI stays off for dispensing labels), the step stops with a notice:
   no consent screen, no request, the on-device results stay. With `"text-preview"`, the photo is blocked and text goes
   only through the open preview. The Worker runs the same check and refuses such text while the setting is `"off"`.
   **Product-label evidence (owner decision 2026-11-10, option 1; §3.4).** The same step also stops, for text mode and
   image mode alike, when the capture shows signs of a personal document (recipient / sender, delivery, order, receipt,
   certificate, appointment, letter) or no product-label evidence. One function decides: `LQPCGuard.aiGate(text, facts)`.
   The notice says why (TH / EN / ZH); there is no consent screen and no request; the on-device results stay. The text
   edited in the preview is decided again before it is sent.
3. **"Ask AI"** first runs the guard on the label text, then opens the consent screen:
   - it is a single screen for every feature that is switched on;
   - for each feature it names the provider, model and processing country, plus the retention of every provider that may
     receive data;
   - it offers one choice: text only (default) or a photo of the product with faces blurred first;
   - it has "remember my choice" and says how to withdraw.
   A remembered choice skips the screen. "Send text only this time" is always offered while image mode is remembered.
   "Withdraw consent / forget my choice" clears the choice at once.
4. **Mandatory text preview** (coordinator decision, mirrors the photo preview):
   - Before ANY send, the card shows the EXACT text that will go out, with removed parts highlighted, and an editable
     box. Nothing is sent until "Send this text".
   - The edited text is checked again. Anything new is removed and shown again; it is never sent unseen. What is sent
     equals what was shown (e2e).
   - "Remember my choice" never skips this step. It is open for a text with any redaction, a dispensing-label look or no
     remembered consent. It is collapsed, one tap away, for a clean product text.
5. **OCR provenance (owner decision 2026-11-10, option b).** Only text that came from the on-device OCR of the actual label
   is ever sent.
   - The original OCR output is kept (`window.__LQ_PC.st.ocr.text`; for a photo, its on-device OCR).
   - In the preview the user may delete or correct. Every token of the box is checked against the OCR output with
     `LQPCGuard.provenance` (NFKC, Thai digits folded, zero-width removed, lower case). A token is allowed when it is:
     - a substring of the OCR text (deleting or joining is allowed);
     - within 1 character of an OCR token (tokens of 4–7 characters) or 2 characters (8 or more): an OCR correction;
     - the placeholder, or a token with no letter or digit.
   - Anything else (a name, a phone, any added word) is **struck through, "not sent: not on the label"** (TH/EN/ZH), and
     dropped. It is never in a request (e2e).
   - Words typed into the page's own OCR text box above are filtered the same way.
   - **The Worker cannot verify provenance, and this is stated plainly.** The server never sees the label: in text mode
     it receives neither the photo nor the OCR output. To check the text against the OCR, the client would have to send
     the OCR text, or hashes of its tokens. That would move label text the user deleted (for example a bare name the
     guard missed) off the device, and short-token hashes can be reversed with a dictionary. A modified client could also
     fake either. The server therefore enforces what it can verify: the guard on the text and the dispensing-label
     refusal. Provenance is enforced at the page's single send path (`sendAll` receives only the filtered text) and
     covered by e2e.
6. **Text mode** then sends that text, and the card lists what was removed. **Image mode** (`pc_fields` only)
   depends on the guard:
   - If the guard found anything, **or** the text looks like a dispensing / prescription label (`imageCheck`), the photo
     is **blocked**. The card says why, lists what it found, and offers "Send text only (N removed)" or "Don't send".
   - If the guard found nothing, `prepareUpload()` runs. It is the only image path: faces are blurred, the preview is
     shown and the user confirms. The confirmed JPEG (≤ 1,024 px) is then sent.
   - If `prepareUpload()` returns `textOnly` or `cancelled`, the text is sent instead, and the card says why.
   `pc_claims` and `pc_translate` always send text only.
7. **Results** appear under the on-device and official rows. Each block is labelled "AI estimate, may be wrong" with the
   provider and country.
   - Fields: each registration number shows one of three states: "matches the number read on this device", "in the text
     read on this device", or "read by AI but not in the text read on this device; compare with the box".
   - Over-claims: AI signals are listed separately from the `LQClaims` list. An agreement line gives the count of rules
     found by both, by AI only, and on this device only.
   - Translation: runs only when the label is not in the page language (`translateTarget`).
   - Nothing on the device is changed or hidden.

## 3. Patient-name guard: measurement and the layered safeguard (source: synthetic)

### 3.1 What the independent checks found

| Guard | Measured by | Recall | False redaction | Clean packs blocked (photo) | Texts with personal data that still allowed a photo |
|---|---|---|---|---|---|
| v1 | reviewer's fresh set (frozen, unseen) | 40/66 = 60.6 % [48.5–71.5] | 9/107 | 9/35 | — |
| v2 | independent final check (frozen, unseen) | **52/66 = 78.8 % [67.5–86.9]** | 1/107 | 1/35 | **12/48** |
| v2 | my own hold-out, scored once | 65/67 = 97.0 %: **did not reproduce** on the independent set | 0/88 | 1/21 | 0/40 |
| **v3** | **independent agent, new frozen set (sha `1023ef71…`), scored once** | **76/100 = 76.0 % [66.8–83.3]** | 12/201 | **9/32 = 28 %** (all maker / hotline phones; `companyPhones = "keep"` was not working) | — ; `isDispensingLabel` 24/24 with 0/32 false positives, so 0 dispensing-label leaks under `dispensingAI = "off"` |
| v4 | independent agent, fresh frozen set, scored once | **73.2 %** | (see the independent report) | (see the independent report) | — |
| **v5** | **independent agent, fresh frozen set (sha256 `733e812c…`; 100 to remove, 136 to keep; harder on non-Thai formats), scored once: LATEST OFFICIAL FIGURE** | **62.0 % [52.2–70.9]** | **2.9 %** | **1/32** | **8/22**; dispensing-label detection **20/22** (missed: a Taiwan clinic label, a Shanghai outpatient slip) |
| v5 | dev set only (184 texts, tuned on; NOT a measurement) | 176/176 | 0/210 | 0/64 | 0/120 |

- **Conclusion: a rule-based guard cannot reach 99 % recall on free-form names.** Names without a cue, OCR noise and new
  layouts will always slip through some rules.
- The target is therefore met by **layers**, not by the guard alone:
  1. the guard (v3);
  2. a mandatory, editable preview of the exact text before any send;
  3. no AI at all for dispensing / prescription labels by default.
- **My own hold-out** (`p7-guard-holdout.json`, SHA-256 `0cda2167…b8d6`, scored once) is now **partly dev**: three of
  its misses were fixed after it was scored. It is kept only for its checksum; no test asserts a score on it.
- New measurement is for independent agents only: they write and score a new frozen set. I wrote no new hold-out.

### 3.2c Known gaps after the v5 independent check (stated plainly)

- **Non-Thai phone and ID formats are weak:** Taiwan / China mobiles written in groups, UK / US phone numbers, the Taiwan
  national ID, the NHS number and passport MRZ lines are not (fully) recognised.
- **CJK names without 姓名** (no field word, no title) are not found.
- **The Worker's dispensing-label check weakens after redaction.** The cues it relies on can be the very parts the guard
  removed, so 6 of 22 dispensing labels pass the Worker once redacted. The dispensing block therefore relies on the
  CLIENT checking the raw text before anything is sent (`dispensingAI: "off"`, the default).
- **Client-enforced only:** OCR provenance (option b) and the photo path (face blur, preview, guard / dispensing photo
  block) run on the device. The Worker cannot verify them (§2).
- **Digits in provenance are exact:** a token holding a digit must equal an OCR token after folding, with no edit
  tolerance (a phone one digit off the label's maker phone is dropped; e2e). Letter-only tokens keep the small
  OCR-correction tolerance.

- **After the v5 check (dev only, not yet re-measured):** the two missed foreign dispensing labels (a Taiwan clinic label,
  a Shanghai outpatient slip) are now cases in the dev set (DEV-6, 13 texts) and `isDispensingLabel` catches them:
  Taiwan national ID (letter + 9 digits, check digit; also redacted as an ID), 門診 / 门诊, 就诊卡 / 就诊日期, 病歷 / 病历,
  处方笺 / 处方医师 / 處方箋, 科别, 费别, 領藥 / 发药, "name + 男/女 + age", clinic headers (診所, 藥局, 卫生服务中心,
  調剤薬局, 약국). Pack wording is not a cue: 处方药, 凭医师处方销售, 请及时就诊, 请咨询医师或药师.

### 3.2b Owner decisions and guard v5 (2026-11-10)

- **Exposure after option (b).** The user can no longer add text, so what can leave in text mode is OCR'd label text only.
  - The main remaining risk is personal data printed on the label that the guard misses. With dispensing labels off,
    that is mostly a name or number on an ordinary pack; the guard's recall (73.2 % independent) applies to it.
  - The preview is the last check: the user can delete it, and possible names are underlined.
- **Dispensing labels:** AI stays off (`dispensingAI: "off"`); `isDispensingLabel` scored 24/24 with 0/32 false positives
  (independent, v3). Taiwan medicine bags (姓名 + 病歷號碼 + ROC dates 民國 113 年 / 113/11/10, 藥袋, 調劑, 領藥號) are
  now dispensing labels too.
- **Maker phones and e-mails kept** (`companyPhones: "keep"`, which also covers maker e-mails). A generic mailbox (info@,
  service@, cs@ …) or an e-mail in a maker / contact block is kept. 1-800 / 1-8xx call-centre numbers are not treated as
  phones to remove; Thai 4-digit hotlines never were.
- **Barcodes never a Thai ID:** a 13-digit number with a valid EAN-13 check digit is never an ID when it starts with the
  Thai GS1 prefix 885 or stands next to a barcode cue (บาร์โค้ด, barcode, EAN, GTIN, GS1, UPC, (01), 条码).
- **Honorific brands kept:** the title is cut off before the product-word test ("ดร.สมุนไพร"), and the product words gained
  laboratories, pharma(ceutical), research, institute, foods, group, เภสัช, โอสถ, ฟาร์มา, แล็บ, ตำรับ ("Dr. X
  Laboratories", "คุณยาย… เภสัช").
- **HN forms:** digits written one by one with spaces, `H.N.`, `Hosp. No`, any-case `hn`, `MRN/病歷號碼`, 病歷號 and
  住院號.

### 3.2a Guard v4 changes (from the independent v3 measurement)

- **Company phones now kept (the 9/32 cause).** v3 looked only at the phone's own line and the line above it for a
  company cue, so a "โทร / Tel" line under an address block, a website line or a brand line lost its phone.
  - v4 looks at the phone's line and up to 4 lines above it.
  - That block counts as a maker / distributor / shop / contact block when it has: company cues, an address (บ้านเลขที่ /
    หมู่ / ซอย / ถนน / ต. / อ. / จ. / postcode, Road / District / Floor, 省市区路), a website, "Call center", "Hotline",
    สอบถามข้อมูล / ติดต่อสอบถาม, จัดจำหน่ายโดย, ร้าน / Shop.
  - A phone on a person line, near a found name, or on a dispensing label is still removed.
- **Name span capped.** A name after a cue stops at:
  - a question word (ถาม…, สอบถาม, what / how / asks …);
  - a product word;
  - a Latin drug-like token (INN suffixes such as -artan, -pril, -statin), or any Latin / all-caps token after a Thai name;
  - 4 tokens, where a short Thai syllable counts as half, so a syllable-spaced name still fits.

  "ชื่อผู้ป่วย สมชาย ใจทดลอง ถามเรื่องยา Losartan" now removes only the name. TMT ingredient names are not loaded into the
  guard; the suffix rule stands in for them.
- **Numbers:**
  - Chinese mobiles written without grouping (next to a phone cue or in Chinese text).
  - 18-digit Chinese resident ID with a valid check digit.
  - Hong Kong ID `A123456(3)` with a valid check digit.
  - `hn` in lower case, and HN with OCR `O` for zero.
  - A 13-digit Thai number after an ID cue even with an invalid check digit.
  - Passport cue + number.
- **Addresses** (new kind `address`): an address line is removed when it follows a person cue or name within 3 lines, or
  when it is on a dispensing label. A maker address on an ordinary pack is kept.
- **Possible names in the preview** (`LQPCGuard.possibleNames`) are underlined with a dashed line and the hint "check:
  possible name", in TH / EN / ZH. They are not removed; the user decides. Patterns:
  - 2–3 Capitalised Latin words that are not label / product / drug words;
  - a Thai word pair that starts like a common first name;
  - 2–3 CJK characters with 先生 / 女士, or alone on a line.

### 3.2 Guard v3 changes (from the final check)

- **v2 regression fixed.** v2 found honorific names only on dispensing labels, so "Mrs X\nMetformin…" or "ด.ช. X\nยาน้ำแก้ไอเด็ก"
  got no protection. Now **honorific + name + surname is found on every label**.
  - Brands are kept only by the product-word / possessive exclusion: "Mrs. X's Herbal Tea", "Dr. X Skincare", นายห้าง… are
    kept.
  - Child, Miss, rank, monk and professional titles and Khun count with a single name anywhere.
  - Plain นาย / นาง / คุณ / พระ and Mr / Mrs / Ms / Dr need a surname, unless the text is a dispensing label.
- **Bare-name dispensing labels.** `isDispensingLabel` also triggers on usage / dosing text plus a standalone line of 2–4
  Thai or Latin name-like tokens. On such a label that line is removed and the photo is blocked.
  - Label words (ยา…, แก้…, ลด…, Cold Relief …) never count as a name.
  - A Chinese bare name is still not found (the label is still blocked by other cues where present).
- **Cue coverage:** `For:` on any label with usage text; Chinese 先生 / 女士 / 小姐 anywhere, except group words such as
  哺乳期女士; a 13-digit Thai ID with a valid check digit (Thai or ASCII digits, first digit 1–8) after ปชช. /
  บัตรประชาชน or alone on its line.
- **Settings** (`LQPCGuard.DEFAULTS`, owner decisions pending):
  - `companyPhones: "keep"`: a maker phone stays in text and does not block the photo; `"remove"` treats it like any
    other phone.
  - `dispensingAI: "off"`: no AI at all for dispensing labels; `"text-preview"` allows text only after the open preview.
  - The page override `window.LENSIQ_PC_DISPENSING_AI` exists for tests; the Worker uses the module default.

### 3.3 Remaining limits (stated honestly)

- A bare name with no cue, no title and not on its own line, for example in running text, is not found. The mandatory
  preview is the safeguard: the user sees the exact text and can delete it.
- Every set is synthetic. Real hospital printer labels, handwriting and OCR errors are not covered.
- The final measurement belongs to an independent agent's new frozen set.

### 3.4 Product-label evidence filter (owner decision 2026-11-10, option 1): DEV numbers only

**Status: measured once by an independent agent (§3.7); the figures in this section are DEV figures only.** The owner's
targets (0 items from non-product documents reaching the AI; under 5 % of real product labels refused) were measured
on a fresh locked set kept in `~/LENSIQ-field/evals/p7/` (sha256 `470d3e7b…`): 0/260 personal items reached the AI
(met); 19.2 % of real product labels were refused (not met). Owner decision ก and the fixes that followed: §3.7.

**Why.** The independent v5 run found 32 of 100 personal-data items still reaching the AI in text mode and 8 of 22
personal-data photos allowed. 30 of the 32 came from captures that are not product labels (shipping labels, gift and
order notes, a doctor's certificate); 2 came from foreign dispensing labels that were not recognised.

**The rule** (`LQPCGuard.productEvidence(text, facts)` and `LQPCGuard.aiGate(text, facts, opts)`; one decision for text
mode and image mode, taken before the consent screen and again on the text edited in the preview):

AI is allowed for a capture only when ALL three hold:

1. **Not a dispensing / prescription label** (`isDispensingLabel`, setting `dispensingAI: "off"`, unchanged default).
2. **No personal-document sign.** Any one of these vetoes, even when the product is listed with its registration number
   (a parcel label that names the product): recipient / sender / ผู้รับ / ผู้ส่ง / 收件人 / 寄件人 / お届け先 / 받는 분, delivery,
   shipping, tracking, courier names, cash on delivery; order number, packing slip, gift message; receipt, invoice,
   totals; medical certificate, diagnosis, lab report, referral; appointment slip; letter wording ("Dear …", "Yours
   sincerely", เรียน คุณ…, ถึงคุณ…, 亲爱的, 様); identity, insurance and membership cards; or a street address with no
   maker / company cue around it.
3. **Product-label evidence**, from the text and from the facts the page already holds for the capture:
   - ONE strong cue: a registration-number shape (the formats `lensiq-pc.js` parses: Thai drug / food / cosmetic /
     device, 国药准字, 国食健, 国妆特字, 卫食健字, 衛署…字第…號, MAL, NOT…K, SIN…P, DIN, NPN, NDC, EU/…, AUST L/R, PL,
     POM, HK), a registration number parsed by the page that stands in the text, or a barcode with a valid GTIN check
     digit (decoded by the page, or printed next to a barcode word); **or**
   - TWO different label cue types out of: ingredients, nutrition panel, net quantity, lot / manufacturing / expiry
     dates, maker / distributor / importer, storage, warning, product category statement (ผลิตภัณฑ์เสริมอาหาร,
     ยาสามัญประจำบ้าน, Dietary Supplement, 保健食品, 第2類医薬品, 건강기능식품 …), registration word.
   - Directions for use, "strength + dose form" and a bare quantity are WEAK: they also stand on notes and dispensing
     labels, so together they count as one type.
   - Languages: Thai, English, Chinese (simplified and traditional), Japanese, Korean, plus a few Malay / Indonesian /
     Vietnamese label words.
   - Low-quality OCR: Thai is matched without vowel / tone marks and without spaces, with an approximate match for a
     lost character; look-alike digits inside Latin words are read back (Tab1ets, 5tore); long Latin label words allow
     one wrong character.

Otherwise: no consent screen, no request, a notice in TH / EN / ZH ("this text looks like a personal document …" or
"this text does not look like a product label …; AI is off for this capture; the on-device results above still work").

**Server.** The Worker runs the same function on the text it receives (`ai/pc-features.js` → `Guard.aiGate`) for all
three features, in text mode and in image mode when text is present, and answers `bad_input` before any provider call.
The page hands in `gtins` (decoded barcodes) and `regs` (parsed registration numbers) as evidence; neither is passed to
a provider. The text preview tells the user when barcode numbers ride along.

**What stays client-only (stated plainly):**

- Image mode with no text: the Worker never reads the photo, so only the page's decision applies.
- A barcode fact: the Worker can check the check digit, not that the barcode was really scanned.
- That the text is the device's OCR of the capture (provenance, option b) and the photo path (face blur, preview).
- A modified client can therefore still send a hand-made text that looks like a product label. The check protects
  ordinary users from sending the wrong capture; it is not an access control.

**Dev set** (`docs/product-check/p7-evidence-testset.json`, built by `tools/pc-evidence-testset.mjs`, written before the
filter; synthetic; sha256 `aff337d6e6ef…`; 551 texts):

- 67 product labels (drug, supplement, cosmetic, food, herbal, device; TH 25, EN 17, ZH 14, JA 4, KO 4, other 3), each
  also in four low-quality OCR versions built with a fixed seed: `drop` (about 8 % of characters and 30 % of Thai marks
  lost), `merge` (all lines joined), `half` (every other line missing), `swap` (look-alike characters and stray spaces);
- 58 personal documents (shipping labels, order / packing slips, gift notes, receipts, medical certificates, lab reports,
  appointment slips, letters, cards; many list a product, several quote its registration number), each also as `drop`
  and `merge`;
- 14 dispensing labels (8 Taiwan / Shanghai, plus Japanese, Korean, English and Thai), each also as `merge` and `drop`.

**Dev numbers (source: synthetic; tuned on this set, so NOT a measurement).** Log: `~/LENSIQ-field/evals/p7/p7-evidence-dev-eval.log`.

| Group | Refused | Note |
|---|---|---|
| Personal documents | **174/174** | 135 by a personal-document sign, 35 as a dispensing label, 4 for no product evidence |
| Dispensing labels (incl. Taiwan clinic, Shanghai outpatient) | **42/42** | |
| Product labels, all | **14/335 = 4.2 %** | 12 for no evidence, 2 for an address with no maker cue |
| Product labels, clean | 0/67 | |
| Product labels, low-quality OCR | 14/268 = 5.2 % | drop 2/67, merge 0/67, half 7/67, swap 5/67 |
| Product labels, foreign (ZH / JA / KO / other) | 4/125 = 3.2 % | ZH 4/70, JA 0/20, KO 0/20, other 0/15; TH 4/125, EN 6/85 |

- The 14 refused product texts are almost all captures of two or three short lines (for example "SAMPLE LIP BALM / 4.5 g"
  after the barcode line was lost, or "Zinc + Vitamin D3 / Recommended dose … / 120 tablets"): nothing in them says
  "label". With the barcode decoded by the page they pass.
- The low-quality OCR group is at 5.2 % on dev, above the 5 % line; the whole product group is at 4.2 %. The independent
  set decides.
- Cross-check on the two older guard sets (dev and partly-dev hold-out): 0 of 158 texts with personal data pass the gate.
  34 of 64 and 5 of 23 clean texts are refused there, because those sets hold two-line fragments, not whole labels.
- Guard dev set after DEV-6 (197 texts): recall 181/181, false redaction 0/224, clean packs blocked 0/66, photos allowed
  with personal data or a dispensing label 0/131 (dev only).

**Known limits of the filter.**

- An informal note that uses label words and has no document wording ("คำเตือน อย่าลืมกินยา 2 เม็ด — <name>") passes
  the gate; the name guard and the preview are then the only layers.
- A product label whose maker address has no company / maker word within three lines is read as a personal address and
  refused (dev: a community-enterprise label passes only because "กลุ่ม" is a maker word).
- A lot code shaped like a valid Taiwan ID (one letter + 1 or 2 + 8 digits, valid check digit; about 1 in 10 of such
  codes) is redacted as an ID and makes the text a dispensing label.
- The edited preview text is decided again: a user who deletes every label cue gets "AI is off" instead of a send.
- `tools/pc-ai-eval.mjs` (P8) sends its `pc_claims` advert snippets and some short `pc_translate` fragments through the
  Worker; those are not whole labels and a deployed Worker refuses them with `bad_input` (translate set: t08, t09).
  **Owner decision 2026-11-10: eval bypass approved for local evaluation only.** In local evaluation mode
  (`AI_EVAL_LOCAL=1` AND a localhost request URL AND a localhost Origin, the cost-echo condition) the Worker skips the product-label filter; the
  name guard and the dispensing refusal still apply (§3.5, `docs/AI-GATEWAY.md` §10a).
- **Adverts get no AI claims check** (known consequence; measured in §3.6, proposal in `ADVERT-CAPTURE-PROPOSAL.md`).

### 3.5 Local evaluation mode: the eval bypass and its proof (owner decision 2026-11-10)

`evalLocalMode(env, request)` in `backend/src/ai/gateway.js` is the one condition for the cost echo and for the bypass:
`AI_EVAL_LOCAL=1`, **and** the request URL's hostname is localhost / 127.0.0.1 / [::1] (the Worker is served by local
`wrangler dev`; added after review because the Origin header is caller-chosen), **and** a localhost Origin.
The gateway passes `evalLocal` to the feature builder; `cleanText` then skips a refusal only when the reason is
`no-product` or `personal-doc`. `dispensing` and "personal data left" are never skipped.

| Proof test (`tests/unit/backend-pc-features.test.js`, mocked providers) | Result |
|---|---|
| P7-9a fixtures: the page's decision refuses the advert (`no-product`), the advert with delivery wording (`personal-doc`) and the redacted dispensing label (`dispensing`) | pass |
| P7-8 cost echo: variable + localhost Origin under a public request host gives no `eval`; under a localhost URL it does | pass |
| P7-9b local mode (variable + localhost URL + localhost Origin): both adverts reach the model (1 call each, cost echoed); a dispensing label and a text with a name are `bad_input` with **0 provider calls**, for all three features | pass |
| P7-9c deployed shape: no variable + localhost Origin, `AI_EVAL_LOCAL` = `true` / `0`, variable set + public Origin: refused, no `eval`, 0 calls. **Variable set + localhost Origin + public request host (`api.example`, `*.workers.dev`, `localhost.evil.example`): refused, no `eval`, 0 calls.** Variable set + production `ALLOWED_ORIGINS` + forged localhost Origin: router 403. Eight look-alike origins and seven public or look-alike request hosts are not local; `127.0.0.1`, `localhost`, `[::1]` are | pass |
| P7-9d request: every switch at once in body, `input`, query string, headers, cookie, for three features and two origins: refused, 0 calls; the builders ignore `input.evalLocal` and anything but the boolean `true` | pass |
| P7-9e admin and config: an admin `PUT` and `settings` rows carrying the switch change nothing; the variable is read once (`gateway.js`), never assigned; `admin.js`, `admin.html` and the site scripts do not name it; `backend/wrangler.toml`, npm scripts and `.github/workflows` never define it; production `ALLOWED_ORIGINS` has no localhost | pass |

`tools/pc-ai-eval.mjs` relies on the mode: it sends no switch, counts a Worker `bad_input` (dispensing label, personal
data) as a 0-cost fallback instead of stopping, and reports `label_filter_skipped` per feature (items a deployed Worker
would refuse).

The Origin header is caller-chosen, so the mode also requires the localhost request URL: a deployed Worker cannot be in
the mode even if the variable were set by hand in the Cloudflare dashboard.

### 3.6 Advert impact of the filter: measured, nothing built (owner question 2026-11-10)

Source for every number here: **public dataset, labelled by two AI agents, pharmacist adjudication pending** (the P3
claim texts, 534 texts outside the repo: 270 dev, 264 held-out). No paid call. Intervals are Wilson 95 %.
Tool and logs: `~/LENSIQ-field/evals/p7/p7-advert-impact.mjs`, `p7-advert-impact-2026-11-10T10-32-41-031Z.{log,json}`;
`lensiq-pc-guard.js` sha256 `c25369c4…fca`, `set.jsonl` sha256 `8d93deea…ea4de`. The held-out run is logged in
`p3-heldout-runs.jsonl` (measurement only, nothing tuned).

**(a) Share of the P3 claim texts that pass `LQPCGuard.aiGate` as they are (defaults, no facts).**
"Violating" = agent A lists at least one rule.

| | Dev | Held-out |
|---|---|---|
| All texts | 19/270 = **7.0 %** [4.6, 10.7] | 16/264 = **6.1 %** [3.8, 9.6] |
| Violating | 4/147 = **2.7 %** [1.1, 6.8] | 3/141 = **2.1 %** [0.7, 6.1] |
| Compliant | 15/123 = 12.2 % [7.5, 19.1] | 13/123 = 10.6 % [6.3, 17.2] |
| Stratum "overclaim" | 2/100 = 2.0 % [0.6, 7.0] | 0/96 = 0.0 % [0.0, 3.8] |
| Drug | 1/40 = 2.5 % [0.4, 12.9] | 2/38 = 5.3 % [1.5, 17.3] |
| Supplement | 15/107 = 14.0 % [8.7, 21.8] | 10/106 = 9.4 % [5.2, 16.5] |
| Food | 1/52 = 1.9 % [0.3, 10.1] | 3/51 = 5.9 % [2.0, 15.9] |
| Herbal | 2/27 = 7.4 % [2.1, 23.4] | 1/26 = 3.8 % [0.7, 18.9] |
| Cosmetic | 0/44 = 0.0 % [0.0, 8.0] | 0/43 = 0.0 % [0.0, 8.2] |
| Thai / English / Chinese | 11.8 % / 2.5 % / 0 % (136 / 122 / 12) | 11.5 % / 1.6 % / 0 % (122 / 129 / 13) |
| Refusal reason: no label evidence | 250 | 246 |
| Refusal reason: personal-document sign | 1 | 0 |
| Refusal reason: dispensing | 0 | 2 |
| Expected (text, rule) pairs inside passing texts | 5/251 = 2.0 % | 3/226 = 1.3 % |

Violating texts pass only in the supplement category (dev 4/89, held-out 3/88); in the other four categories 0 of 58
(dev) and 0 of 53 (held-out) violating texts pass. Redacting first changes nothing (same counts). Two held-out advert
texts contain a personal-data hit and read as dispensing labels after redaction, so the eval bypass does not send them.

Reading: with the filter on, the AI claims check sees about **2 %** of the over-claim texts of this set. This set is
advert-heavy by construction (news reports of FDA cases, adverts, shop wording), so it is not the share for full labels.

**(b) Claims recall on each side of the filter (on-device rules only; no AI call).** Unit = (text, rule) pair.

| On-device `LQClaims` recall | Dev (tuned on; not a measurement) | Held-out |
|---|---|---|
| All texts, vs agent A | 237/251 = 94.4 % [90.9, 96.6] | 148/226 = **65.5 %** [59.1, 71.4] (same as P3) |
| Texts that pass the filter, vs agent A | 4/5 [37.6, 96.4] | 1/3 [6.1, 79.2] |
| Texts the filter refuses, vs agent A | 233/246 = 94.7 % [91.2, 96.9] | 147/223 = **65.9 %** [59.5, 71.8] |
| All / pass / refused, vs agent B | 88.1 % / 4 of 6 / 88.7 % | 59.8 % / 1 of 3 / 60.1 % |

- On this set the texts that pass carry 3 held-out pairs. **No recall figure for "full labels" can be read from it**
  (interval 6 % to 79 %). The over-claims sit in the refused texts, where only the on-device rules run (65.9 %).
- **Real-pipeline AI recall on full labels: not measured.** It needs, in this order: (1) a new fixed set of **full
  label texts** that pass the filter (registration number, ingredients, maker, lot / expiry) with claim sentences
  embedded, about 300 texts for an interval of about ±5 points, built by one agent and labelled by two others, source
  stated (synthetic labels with claim sentences taken from public adverts, or photographed real labels as a field set);
  (2) a fresh dev / held-out split, because the P3 held-out texts have now been sent to providers in P8; (3) a paid run
  through the real route with the filter ON: about 300 texts x the models kept after P8, well inside the 10 USD per
  model cap; (4) pharmacist adjudication of the labels before the number is used in sales material.

### 3.7 Independent measurement of the filter, owner decision ก, and the fixes (2026-11-10)

**Owner decision (2026-11-10), verbatim:** "Filter: option ก. Add the on-screen guidance when refused (photograph the
side with the registration number or ingredients, or scan the barcode) and fix the 8 misclassified cases. Then commit
P7 with AI off and budget 0 as defaults. State the measured refusal rates in the docs."

**Official figures (independent agent, scored once; source: synthetic).** Locked set
`~/LENSIQ-field/evals/p7/p7-filter-locked-set.json`, sha256
`470d3e7b6cdc7787d309c1bc454989f1b747f266ad498f307ea2ffe77ebfdbef`, written before the agent read the guard: 360 product
label captures (120 labels x clean / two low-quality OCR versions; Thai, English, Chinese, Taiwanese, Japanese,
Korean; front / back / short / long panels), 20 product labels with person-like wording, 60 non-product documents, 30
dispensing labels; 260 personal-data items. Defaults: `dispensingAI: "off"`, `companyPhones: "keep"`. Log:
`p7-filter-score-run.log`; per-item detail: `p7-filter-score-detail.json`. That set is now **spent**.

| Measure | Target | Result (95 % Wilson interval) |
|---|---|---|
| Personal-data items reaching the AI, text mode | 0 | **0/260 = 0.0 %** [0.0–1.5] |
| Personal-data items on a photo that is allowed, image mode | 0 | **0/260 = 0.0 %** [0.0–1.5]; captures 0/94 |
| Non-product documents allowed | 0 | 0/60; dispensing labels allowed 0/30 |
| **Real product labels refused** | < 5 % | **69/360 = 19.2 %** [15.4–23.5] — **not met** |

Refusal rate of real product labels, per condition:

| Condition | Refused |
|---|---|
| Clean text | 15/120 = 12.5 % |
| Low-quality OCR (both levels) | 54/240 = 22.5 % (level 1: 14.2 %; level 2: 30.8 %) |
| Thai | 27/108 = 25.0 % |
| Foreign | 42/252 = 16.7 % (en 16.7 %, cn 8.3 %, tw 22.2 %, ja 22.9 %, ko 13.9 %) |
| With barcode / registration facts held by the page | 7/140 = 5.0 % |
| Without such facts | 62/220 = 28.2 % |
| Front panel | 35/90 = 38.9 % |
| Short capture (2–4 lines) | 26/90 = 28.9 % |
| Long label | 7/90 = 7.8 % |
| Back panel | 1/90 = 1.1 % |

- **61 of the 69** were refused for lack of product evidence: front panels (a name and a slogan) and captures of 2–4
  lines. This is the rule working as designed; it is the cost of option 1.
- **8 of the 69 were misclassified** (all Thai): a digital thermometer, three versions (cue `letter`); two maker
  addresses read as a person's address after OCR corruption (cue `address`); jasmine rice, two versions, and a herbal
  capsule read as dispensing labels. On the 20 person-like labels, 2 were refused as dispensing: a Thai pack with the
  line "เภสัชกรผู้มีหน้าที่ปฏิบัติการ ภก. …" and a Taiwanese pack with "監製藥師 …".
- **Why Thai labels were refused more than foreign ones (25.0 % vs 16.7 %).** All 8 misclassified product captures
  are Thai; no foreign capture was misclassified. For lack of evidence alone the rates are the same: Thai 19/108 =
  17.6 %, foreign 42/252 = 16.7 %. The 8 came from Thai-specific parts of the guard: (1) Thai cues are matched with
  the vowel and tone marks removed, so "ลายเซ็น" (signature) matched inside "ปลายเซนเซอร์" (sensor tip); (2) the "a
  line that is only a name" rule reads Thai and Latin words only, and a Thai slogan line looks like a first name and a
  surname; (3) the maker cue "ผลิตโดย บริษัท" did not survive lost characters and stray spaces, so the address after it
  counted as a person's. The Thai long panels show it: 7/27 refused against 0/63 for foreign long panels.

**What option ก changed** (`lensiq-pc-guard.js`, `lensiq-pc-ai.js`; no rule was loosened for dispensing labels or
personal documents):

1. **Guidance when refused for lack of product evidence.** Under the reason, the page shows the next step ("photograph
   the side of the label with the registration number or the ingredients list, or scan the product's barcode, then
   ask AI again") and two one-tap buttons to the page's own controls: "scan the barcode in this picture" and
   "photograph another side of the label". No consent screen, no request. When the capture then shows evidence (for
   example a barcode was decoded) the refusal is replaced by "product label details found, you can ask AI now";
   nothing is sent until the user asks. A personal document and a dispensing label get their own message and **no**
   retry hint and no buttons. The AI panel also says up front which side AI needs. TH / EN / ZH; e2e check 4e.
2. **`letter` cue.** The short signature / greeting words (ลงชื่อ, ลายเซ็น, รักแม่, รักพ่อ) count anywhere when written
   with their marks; with the marks lost they count only at the start of a word. "ปลายเซนเซอร์", "ลงช่องหู",
   "สกปรกแม้" are no longer signs; "ลงชื่อ …", "ลายเซ็นผู้ปกครอง", "กรุณาลงลายเซ็น" still are.
3. **Maker address under OCR noise.** The maker block next to an address is now also recognised on the Thai letters
   with spaces removed: one exact maker word (บริษัท, ผลิตโดย, จำหน่ายโดย, นำเข้าโดย, ห้างหุ้นส่วน) or two different maker
   words each within a small edit distance; in Latin text one token within one edit of "manufactured", "manufacturer"
   or "distributed". A person's address with no maker word near it is still a personal-document sign.
4. **Dispensing detector.** (a) A line that carries label or instruction wording anywhere is not a "name line" (OCR
   splits one sentence into name-like pieces). (b) A bare name-like line, the weakest dispensing sign, does not count
   on a text with the structure of a pack: three or more cue types that only a pack prints (barcode, registration,
   ingredients, nutrition panel, net quantity, maker block, product category). (c) A maker-printed responsible-person
   line (เภสัชกรผู้มีหน้าที่ปฏิบัติการ, ผู้รับอนุญาต, ผู้ควบคุมการผลิต, 監製藥師, 管理藥師, "Pharmacist in charge") is not a
   dispensing sign **only** when a company / manufacturer block stands within three lines and the line holds no
   patient word. The person's name is still removed from the text and still blocks the photo (text only).
   Unchanged: hospital / pharmacy headers, patient cues, HN, titles with names, and a bare name with dosing text on
   a text without pack structure.
5. Dev cases for each fix: `tests/unit/pc-guard.test.js` (four new tests, synthetic texts that are not in the locked
   set), each with "not weakened" counter-cases. Every earlier test is unchanged and passes. On the dev sets and the
   old hold-out no decision changed (1,279 texts compared before and after: only the 10 items below differ).

**Spent set, after the fixes — NOT an independent figure.** The guard was changed with these items in view, so this
re-score only shows that the fixes did what was intended and broke nothing on this set. Log:
`~/LENSIQ-field/evals/p7/p7-filter-rescore-after-fixes.log` (detail: `p7-filter-rescore-after-fixes-detail.json`).
Guard at the independent run: sha256 `c25369c4…`; guard at the re-score: sha256 `61aa058b…`.

| Measure | Independent (official) | Spent set after fixes (not independent) |
|---|---|---|
| Personal-data items reaching the AI (text; photo) | 0/260; 0/260 | 0/260; 0/260 |
| Non-product documents / dispensing labels allowed | 0/60; 0/30 | 0/60; 0/30 |
| Real product labels refused | 69/360 = 19.2 % | 61/360 = 16.9 % [13.4–21.2] |
| — clean / low-quality OCR | 12.5 % / 22.5 % | 13/120 = 10.8 % / 48/240 = 20.0 % |
| — Thai / foreign | 25.0 % / 16.7 % | 19/108 = 17.6 % / 42/252 = 16.7 % |
| — with facts / without | 5.0 % / 28.2 % | 0/140 = 0.0 % / 61/220 = 27.7 % |
| — front / short / long / back | 38.9 % / 28.9 % / 7.8 % / 1.1 % | 38.9 % / 28.9 % / 0/90 / 0/90 |
| Refusal reasons | 61 no evidence, 5 personal document, 3 dispensing | 61 no evidence |
| Person-like product labels refused | 2/20 | 0/20 (photo blocked on 5/20: text only) |
| Product texts altered by redaction, among allowed | 0/291 | 0/299 |

- The 10 borderline documents that were refused only for lack of evidence (dispensing labels D004, D008, D023, D025
  and six notes) are **still refused**, for the same reason.
- The 61 remaining refusals are the front panels and short captures. The guidance is the answer to them under
  option ก; the rule itself is unchanged, so the refusal rate for those captures stays where it was measured.

**Limits added by the fixes (stated plainly; not measured).**

- A pharmacy sticker with a bare name (no header, no HN, no title, no "ชื่อ") captured **together** with the full
  text of the maker's pack (three pack-only cue types) is no longer read as a dispensing label, and the name line is
  not removed. The mandatory preview of the exact text is the remaining layer there.
- The approximate maker match makes an address slightly more likely to be read as a maker's when two maker-like word
  pieces stand within three lines of it.
- Both need a new independent set to be measured; the spent set cannot show them.

**Option ข (not built).** If the owner asks for it, it is built as its own commit after this one and measured once,
by an independent agent, on a **new** locked set (the set above is spent): same two targets (0 personal-data items
reaching the AI; refusal rate of real product labels with its per-condition table), sha256 recorded here before
scoring, per-item log in `~/LENSIQ-field/evals/p7/`. The figures of option ก above stay the baseline it is compared
with.

**Defaults at commit:** every AI feature off, budget 0, `dispensingAI: "off"`, `companyPhones: "keep"`.

### 3.8 Tester "relaxed capture": measured before building, not built (2026-11-11)

Request (owner, 2026-11-11): for testers with a valid access code, let AI run on a capture without product-label evidence (for
example a front panel) when it shows no personal-document sign and is not a dispensing label; stop before deploying if any item
from a personal document or dispensing label gets through. Measured first with the current guard on main (sha256 `61aa058b…`, unchanged by this),
on the two spent synthetic sets; dev figures, not independent. Scripts and log:
`~/LENSIQ-field/evals/relaxed/` (`precheck-run.log`).

| Measure | Rule today | Relaxed as asked | Variant: also no name-like line and no phone number |
|---|---|---|---|
| p7 set: real product labels refused | 61/360 | 0/360 | 10/360 |
| p7 set: dispensing labels allowed | 0/30 | **4/30** (D004, D008, D023, D025) | 0/30 |
| p7 set: non-product documents allowed | 0/60 | **6/60** (N017, N018, N049–N052) | 0/60 |
| p7 set: of those, personal data still in the text sent | – | names or phones in 8 of 10; photo allowed on 4 | – |
| p7b set: personal documents allowed | 0 | **54** (72 personal items in the text) | **7** (8 personal items) |

The name guard does not find the names on these documents (a Hong Kong clinic label, Japanese gift cards, Thai and English
medicine-reminder notes), so they were held back only by the evidence rule. The variant was tuned with the p7 items in view and
still leaks on p7b. **Owner decision 2026-11-11: option 1, do not build.** Instead the page guides users to start on the right
side of the pack (a line before capture and an example picture when a capture is refused for lack of evidence; copy and UI
only, nothing measured). The public capture rule is on the launch list (CTO-BRIEF L52).

## 4. Backend features: checks (mocked providers)

| Check | Result |
|---|---|
| New install: global AI off; three features off, budget 0, image mode off; a call answers `disabled` | pass |
| Schemas: supported subset, strict, **no field name** matching illegal / legal / fake / genuine / authentic / safe / verdict / score / approved / compliant / confidence | pass |
| `pc_claims` rule ids = the 36 text rules of `lensiq-claims-rules.js`, same English titles; only the category's rule family is offered | pass |
| `pc_claims` evidence spans are verbatim; a **hallucinated span** is rejected (retried once, then the next provider); if every provider hallucinates the reason is `invalid_output` and the page keeps its on-device result; an unknown rule id is rejected; image mode is refused | pass |
| `pc_fields`: a registration number not in the OCR text is marked `model`; an unparseable expiry becomes `null` and is listed in `unreadable`; list caps apply; an image reaches the adapter only in image mode; text mode with no text is refused before any call | pass |
| `pc_translate`: an invented source line rejects the answer | pass |
| **Server-side guard**: a name, HN, phone or ID left in the text means `bad_input` and **no provider call** for all three features; the redacted text is accepted | pass |
| Local eval echo only with `AI_EVAL_LOCAL=1` **and** a localhost Origin | pass |
| Local evaluation mode skips only the product-label filter, and cannot be active in a deployed Worker (P7-9a to P7-9e, §3.5) | pass |

**`pc_claims` recall uplift: not measured.** It needs real keys and runs in P8 with `tools/pc-ai-eval.mjs` on the P3
held-out split (source: public dataset, AI-labelled, pending pharmacist adjudication). The baseline is the P3 on-device
recall of 65.5 % against a target of 80 %.

## 5. Consent and privacy checks (e2e, fake Worker, fetch spy + CDP request log)

`tests/e2e/product-check-ai.e2e.mjs`: 8 checks, all pass (2026-11-10, after the option ก changes).

| Owner requirement | How it is proved |
|---|---|
| First use asks | The consent dialog opens on "Ask AI". It names Anthropic, `claude-haiku-5-5` and `claude-sonnet-5-5`, USA, the fallback provider and its retention, the image choice, "remember" and how to withdraw. Text only is pre-selected |
| No request before confirm | Before "Ask AI": no `/v1/ai/` request and no label text in any request. Before "agree": only the consent-screen metadata GETs (`/v1/ai/providers?feature=…`), with no label data. Before "Use this picture": no POST at all. CDP shows no real request leaving the page |
| Remember skips the prompt | After a reload with image mode remembered, no dialog opens, but the blurred preview still comes first |
| Withdraw asks again | The withdraw button clears `lq-ai-consent.pc` at once. The next "Ask AI" opens the dialog. "Don't send" sends nothing |
| Text-only never sends an image | Every text-mode POST has `mode: "text"` and no `images`. This also holds for "Send text only this time" and for the fallback after "Back" |
| Image mode always shows the blurred preview first | The `pc_fields` POST carries exactly one JPEG of the 300 × 200 crop, only after `#pcPrevUse`. `pc_claims` stays text |
| Patient-name guard | Text mode: the name and phone are not in any body, `[removed]` is, and the card lists them. Image mode with a name on the label: no photo preview and no POST until the user picks "Send text only (2 removed)" and confirms the text preview |
| **Mandatory text preview** | No request before "Send this text". What is sent **equals** what the box showed, including after the user deletes more. A phone typed into the box is removed and shown again, and nothing is sent until the second "Send". A remembered choice still shows the preview: open for a redacted text, collapsed for a clean one, never skipped. "Don't send" sends nothing |
| **Dispensing labels** | Default `"off"`: "Ask AI" shows the notice; no consent screen and no `/v1/ai/` request at all; the on-device claims stay. `"text-preview"`: photo blocked, open preview, sent text = shown, no name |
| **Guidance when refused** (owner decision ก; check 4e) | Front-panel text: the next step is shown (the side with the registration number or the ingredients list, or the barcode) with two one-tap buttons to the page's own barcode scan and camera; no consent screen, no `/v1/ai/` request; the scan button sends nothing. After a barcode is decoded for the same capture the refusal is replaced by "you can ask AI now" and the usual consent → preview → send flow carries the barcode as evidence. A parcel label and a dispensing label show their reason and **no** retry hint or button. TH / EN / ZH, 0 % Thai left |
| Results labelled, never override | "AI estimate" + Anthropic + country on each block; the AI list comes after the on-device `#pcClaims`, which is unchanged; agreement line present; no verdict words (TH / EN / ZH ban list) |
| TH / EN / ZH | With the AI results open, 0 % Thai remains in EN and ZH outside `translate="no"`; the consent dialog has no Thai in EN and ZH |

**One existing test changed:** `backend-ai-gateway.test.js` used `/v1/ai/pc_fields` as its example of a feature with no
route, which P7 makes untrue.

- The test now asserts that `pc_fields` exists and that, off by default, it answers 503 `disabled` with no call.
- The "unknown feature → 404 + fallback" check moved to `/v1/ai/no_such_feature`.

Nothing was loosened.

## 6. P8 preparation (local only)

- **`npm run ai:test-enable`** (`tools/ai-test-enable.mjs`) writes the gateway settings row of the **local** D1 only
  (`wrangler d1 execute lensiq --local`):
  - global AI on; `pc_fields`, `pc_claims` and `pc_translate` on;
  - total budget **50 USD**, split 20 / 20 / 10;
  - local rate limits 10,000 per day, 60 per minute;
  - image mode allowed for `pc_fields`.

  The settings go through the gateway's own `putGateway` validation first. `--off` restores the new-install defaults.
  `--budget`, `--per-model` and `--chain` are configurable. It refuses `--remote` and CI. It never reads key values: it
  lists only the key **names** set in `backend/.dev.vars`.
- **`npm run ai:eval:pc`** (`tools/pc-ai-eval.mjs`) takes every priced model (or `--models`). For each model it:
  1. writes that model as the only chain entry in the local D1;
  2. skips the model if `GET /v1/ai/providers` shows an empty chain (no key or setting);
  3. sends the fixed sets through the real local route, guard first.

  It reports per model and feature:
  - `pc_fields`: field accuracy, plus registration numbers that are not in the text;
  - `pc_translate`: line coverage, numbers kept, term hits;
  - `pc_claims`: recall and precision of on-device vs on-device + AI on the P3 held-out set, the uplift, and false flags
    per 100;
  - for all three: cost from the gateway's settled cost, and p50 / p95 latency.

  Run limits:
  - It stops a model at its cap (default **10 USD**) and stops everything at the total budget (default **50 USD**).
  - The gateway's own feature budgets are the hard stop.
  - It refuses CI, a non-localhost base, and a Worker that sends no cost (`AI_EVAL_LOCAL=1` missing).
  - It relies on local evaluation mode for the advert snippets (§3.5): a dispensing label or a text with personal
    data is still refused by the Worker and counted as a 0-cost `bad_input`; `label_filter_skipped` is reported.
  - The output goes to `field-data/eval/` (git-ignored), with no texts in it.
- **Owner steps (P8):**

  ```
  cd backend
  cp .dev.vars.example .dev.vars   # set your keys, ALLOWED_ORIGINS=http://localhost:8000,
                                   # TURNSTILE_DISABLED_FOR_LOCAL_DEV=true, AI_EVAL_LOCAL=1
  npm run db:migrate:local
  npx wrangler dev                 # local, keep it running
  cd .. && npm run ai:test-enable
  npm run ai:eval:pc -- --limit 3  # smoke run
  npm run ai:eval:pc
  npm run ai:test-enable -- --off  # back to the defaults
  ```

## 7. Numbers vs targets

| Item | Target | Measured | Source |
|---|---|---|---|
| Guard recall, v1, reviewer's fresh set | ≥ 99 % | 40/66 = 60.6 % (not met) | synthetic (independent) |
| Guard recall, v2, independent final check | ≥ 99 % | 52/66 = 78.8 % (not met); 12/48 texts with personal data still allowed a photo | synthetic (independent) |
| Guard v3 (independent) | ≥ 99 % | **76/100 = 76.0 % [66.8–83.3]** (not met); false redaction 12/201; clean photos blocked 9/32; dispensing-label detection 24/24, 0/32 false | synthetic (independent, new frozen set, sha `1023ef71…`) |
| Guard v4 (independent) | ≥ 99 % | 73.2 % (not met) | synthetic (independent, fresh frozen set) |
| **Guard v5: LATEST OFFICIAL** | ≥ 99 % | **62.0 % [52.2–70.9]** (not met); false redaction 2.9 %; dispensing detection 20/22; clean photos blocked 1/32; photos still allowed for personal texts 8/22 | synthetic (independent, fresh frozen set, sha256 `733e812c…`, 100 remove / 136 keep, harder on non-Thai formats) |
| Product-label evidence filter: personal-data items reaching the AI | 0 | **0/260 [0.0–1.5]** in text mode and in image mode (met); non-product documents allowed 0/60, dispensing labels 0/30 | synthetic (independent, locked set sha256 `470d3e7b…`, scored once) |
| Product-label evidence filter: real product labels refused | < 5 % | **69/360 = 19.2 % [15.4–23.5] (not met)**: clean 12.5 %, low-quality OCR 22.5 %, Thai 25.0 %, foreign 16.7 %, with barcode / registration facts 5.0 %, without 28.2 %, front 38.9 %, short 28.9 %, long 7.8 %, back 1.1 % | synthetic (independent, same set) |
| Same filter after the option ก fixes, **spent set (not an independent figure)** | — | personal items 0/260; product labels refused 61/360 = 16.9 % (all for lack of evidence); person-like labels refused 0/20 | synthetic (spent set, re-scored by the builder) |
| Same filter, dev sets | — | 0/174 documents and 0/42 dispensing labels allowed; product labels refused 14/335 = 4.2 % | synthetic (dev, tuned on) |
| Safeguard as a whole | no unseen personal data sent | guard + mandatory preview (sent = shown, e2e) + no AI for dispensing labels by default | e2e |
| `pc_claims` recall uplift (held-out) | union ≥ 80 % recall | **not measured** (P8, needs keys) | public dataset, AI-labelled |
| `pc_fields` / `pc_translate` accuracy | none until the first baseline | **not measured** (P8) | synthetic sets ready |
| Consent / privacy e2e | all pass | 8/8 (incl. the evidence filter: shipping label, no evidence, barcode evidence; the guidance when refused; TH / EN / ZH) | e2e, fake Worker |
| Typecheck ratchet | ≤ 627 | 627 | — |

## 8. Risks and open points

0. **Product-label evidence filter (§3.4, §3.7): the refusal target is not met.** Independent figure: 19.2 % of real
   product labels refused (target under 5 %), mostly front panels and short captures; 0/260 personal-data items
   reached the AI. Owner decision ก accepts this with on-screen guidance. The figures after the fixes come from the
   spent set and are not independent; the two limits the fixes add (§3.7) are not measured. The Worker repeats only
   the text check; image mode without text, barcode facts and provenance are client-only. The P8 eval tool's claim
   snippets pass the Worker only in local evaluation mode (§3.5).
0a. **Adverts are outside the AI claims check (§3.6).** About 2 % of the over-claim texts of the P3 set pass the filter
   (held-out 3/141, source: public dataset, AI-labelled); for the rest only the on-device rules run (held-out recall
   65.9 %, target 80 %). An "advert" capture type is proposed, design only: `ADVERT-CAPTURE-PROPOSAL.md`. Owner decision.
0b. **Local evaluation mode** needs three things at once: the variable (never in `wrangler.toml`, npm scripts or
   workflows: asserted), a localhost request URL and a localhost Origin. A variable set by hand in the Cloudflare
   dashboard is outside what a test can see, but a deployed Worker is never served under a localhost host, so it would
   have no effect.

1. **Guard coverage.**
   - A rule-based guard does not reach 99 % (independent check: 78.8 % for v2); v3 is unmeasured.
   - The last line of defence is the user reading the mandatory preview, and a hurried user can still press "Send".
   - The server re-check uses the same module, so it does not catch what the device missed.
2. **Company phones** (owner decision pending).
   - Default: kept in text and not blocking the photo when next to a maker or company cue.
   - `LENSIQ_PC_COMPANY_PHONES = "remove"` switches this off.
   - A maker phone without a recognised cue still blocks the photo (hold-out h056 before the fix).
3. **Translation of dosing lines.** `pc_translate` translates what is printed, including dosing instructions. The page says
   the original label and the pharmacist come first. Counsel or the owner should confirm this is not "dosing advice" under
   the medicine-page rule. Travel mode (P9) needs the same answer.
4. **P3 held-out reuse.** P8 sends the held-out texts to providers (public adverts, passed through the guard first), and
   each run is logged in `p7-ai-heldout-runs.jsonl`. It measures and must not tune. After P8 a fresh split is needed.
5. **Per-model cap is soft.** The first call to a model is allowed before its cost is known, so a model can pass its cap by
   at most one call. The feature budgets in the gateway are hard.
6. **Settings default for image mode.** `imageModeAllowed` stays `false` on a new install (P5 setting). Design §10.2 says
   "on" (PC-D9). The trial tool turns it on locally. The owner should confirm the production default.
7. **Name rendering.** `parts` labels come from the page (`LQPCAI.LABELS`), not the server. A new feature needs a label
   there, or the screen shows its id.
8. **No real provider has seen these prompts or schemas.** Strict-mode quirks per provider (for example OpenAI's dropped
   `maxLength`) are only exercised in P8.

### Option ข (owner decision 2026-11-10, not built)

After a barcode or a registration number has been scanned for a product, later captures in the same session (for
example the front panel) may use that evidence. The personal-document and dispensing checks still apply to every
capture. It is built as its own commit and measured once on a new locked set before it is enabled; the 10 borderline
documents of the 2026-11-10 locked set (refused only for lack of product evidence) are required cases, and the set
must include captures where a scanned barcode is followed by a personal document.

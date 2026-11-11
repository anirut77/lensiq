# ชุดเอกสารกฎหมายสำหรับลูกค้าองค์กร (ร่าง) / Customer Legal Pack for Organisations (drafts)

> **ร่างสำหรับทนายตรวจ — ยังไม่ใช่ฉบับใช้จริง / Draft for legal review — not final**
>
> จัดทำ 2026-11-11 สำหรับ “Sellable pack” (คำสั่งเจ้าของ 2026-11-11) ไม่ใช่คำแนะนำทางกฎหมาย
> *Prepared 2026-11-11 for the "Sellable pack" (owner standing order 2026-11-11). Not legal advice.*

## ขอบเขต / Scope

**TH.** ผลิตภัณฑ์ที่ขายโดยใบเสนอราคาและโอนเงิน: **Exam** (โหมดห้องปฏิบัติการ), **Attendance** (PIN/QR เป็นค่าเริ่มต้น ใบหน้าเป็นตัวเลือก),
**Gate** (ช่วยอ่านป้าย เจ้าหน้าที่ยืนยันทุกครั้ง), **Crowd** (อีเวนต์ ทดลอง) ประมวลผลบนอุปกรณ์เป็นค่าเริ่มต้น ไม่ส่งสิ่งใดออกโดยไม่เลือกเปิดใช้
ส่งเฉพาะข้อเท็จจริงที่สกัดแล้ว ไม่เก็บภาพบุคคล ไม่มีการวิเคราะห์อารมณ์หรือตรวจจับการโกหกในทุกเอกสาร

**EN.** Products sold by quotation and bank transfer: **Exam** (lab mode), **Attendance** (PIN / QR default, face optional), **Gate** (assisted plate reading, a person confirms every read),
**Crowd** (events, experimental). On-device processing by default; nothing leaves the device without opt-in; only derived facts are sent; no images of people are stored.
No document describes emotion inference or lie / deception detection as a feature.

เอกสารชุดนี้ **ไม่ได้แก้** `terms.html`, `privacy.html` หรือไฟล์อื่นของเว็บไซต์ และยังไม่ได้เชื่อมกับเว็บไซต์ (เว็บไซต์ใช้ `terms.html` / `privacy.html` สำหรับผู้บริโภค/ผู้เยี่ยมชม)
*This pack changes no website file (`terms.html`, `privacy.html` and the rest are untouched) and is not linked from the site, which keeps its consumer-facing terms and privacy pages.*

## รายการร่าง / The drafts

| ไฟล์ / File | ใช้ทำอะไร / What it is | ฐานของเอกสาร / Based on |
|---|---|---|
| [`TERMS-OF-SERVICE-B2B.md`](TERMS-OF-SERVICE-B2B.md) | ข้อกำหนดการให้บริการสำหรับองค์กร: ขอบเขต สัญญาอนุญาต หน้าที่ลูกค้า (ป้าย ความยินยอม ฐานทางกฎหมายในฐานะผู้ควบคุม) หน้าที่ผู้ให้บริการ (ผู้ประมวลผล) ค่าบริการตามใบเสนอราคา โอนเงิน การสนับสนุน การจำกัดความรับผิด การสิ้นสุดและคืน/ลบข้อมูล กฎหมายไทย · Terms for organisations | `terms.html`, `docs/LEGAL-REVIEW-PACK.md`, `docs/SUPPORT.md`, `docs/pilot/AGREEMENT-TH.md` |
| [`PRIVACY-NOTICE-TEMPLATE.md`](PRIVACY-NOTICE-TEMPLATE.md) | ส่วน ก: ประกาศที่ลูกค้าแสดงต่อเจ้าของข้อมูล แยกแบบประกอบ Exam / Attendance / Gate / Crowd · ส่วน ข: ประกาศของ LENSIQ ในฐานะผู้ประมวลผล · Part A customer notice with a variant per product; Part B our notice as processor | `privacy.html`, `camera-notice.html`, `gate-notice.html`, `docs/PDPA-NOTES-FOR-COUNSEL.md`, `docs/pdpa/` |
| [`DPA-TEMPLATE.md`](DPA-TEMPLATE.md) | ข้อตกลงการประมวลผลข้อมูล (มาตรา 40): คำสั่ง ผู้ประมวลผลช่วง (Cloudflare; ผู้ให้บริการ AI เฉพาะที่ลูกค้าเปิด) การแจ้งเหตุละเมิด [24] ชม. สิทธิเจ้าของข้อมูล ข้ามประเทศ คืน/ลบ ตรวจสอบ · ภาคผนวก: รายละเอียดการประมวลผล, ผู้ประมวลผลช่วง, ระยะเวลาเก็บต่อผลิตภัณฑ์, มาตรการความปลอดภัยที่มีจริง · s.40 processor agreement | `docs/SUPPORT.md` §5, `docs/ORG-ACCOUNTS-DESIGN.md`, `docs/AI-GATEWAY.md`, `backend/src/retention.js`, `docs/pdpa/retention-table.md`, `SECURITY.md` |
| [`PILOT-AGREEMENT.md`](PILOT-AGREEMENT.md) | สัญญาโครงการทดลอง ทั่วไป 4 ผลิตภัณฑ์ ฟรี/มีค่าใช้จ่าย ระยะเวลา เกณฑ์ความสำเร็จ (ตัวเลขที่วัดได้เท่านั้น พร้อมที่มา) การจัดการข้อมูล ไม่กล่าวอ้างเกินที่วัด · generic pilot agreement | `docs/pilot/AGREEMENT-TH.md`, `docs/pilot/PILOT-*.md`, `docs/PILOT-PLAN.md` |
| [`CONSENT-FORMS.md`](CONSENT-FORMS.md) | ป้ายและแบบความยินยอม: Exam (ป้ายห้องสอบ + ความยินยอมทดลองในห้องปฏิบัติการ), Attendance (ยินยอมชีวมิติ + ทางเลือก PIN/QR), Gate (ป้าย), Crowd (ป้ายอีเวนต์ ไม่ระบุตัวตน) · signs and consent forms | `docs/pilot/CONSENT-HALL-SEATWATCH-TH.md`, `docs/pdpa/consent-texts.md`, `camera-notice.html` |

ทุกไฟล์: ไทยก่อน อังกฤษตามหลัง (ไฟล์เดียวสองส่วน) · ข้อความ [วงเล็บ] เป็นช่องที่ต้องกรอก ไม่มีการสมมติรายละเอียดบริษัท · [คำถามสำหรับทนาย: ...] คือจุดที่ยังไม่ยืนยัน
*Every file: Thai first, English after (one file, two parts). [Brackets] are fields to fill; no company detail has been invented. [Question for counsel: ...] marks unconfirmed points.*

## รายการที่ต้องกรอกก่อนใช้จริง / What must be filled in before use

- รายละเอียดผู้ให้บริการ: ชื่อนิติบุคคล เลขทะเบียน/เลขผู้เสียภาษี ที่อยู่ บัญชีธนาคาร ผู้ติดต่อด้านข้อมูลส่วนบุคคล ผู้มีอำนาจลงนาม (ใช้ชุดเดียวกับ `LENSIQ_SELLER` ใน `lensiq-config.js` และ `tools/check-legal.mjs`)
  *Seller details: legal name, registration / tax ID, address, bank account, privacy contact, signatory (the same set as `LENSIQ_SELLER` in `lensiq-config.js` and `tools/check-legal.mjs`).*
- ตัวเลขในวงเล็บ (ระยะเวลา อัตรา เพดาน) เป็นค่าเสนอที่ดึงจากเอกสารในโปรเจกต์ ไม่ใช่ค่าที่ตกลงแล้ว
  *Numbers in brackets (periods, rates, caps) are proposals taken from project documents, not agreed values.*
- ตัวเลขความแม่นยำอ้างจาก `ACCURACY.md` และ `docs/pilot/PILOT-*.md` พร้อมที่มา ณ วันที่ 2026-11-11 ต้องตรวจให้ตรงกับฉบับล่าสุดก่อนส่งลูกค้า
  *Accuracy figures are quoted from `ACCURACY.md` and `docs/pilot/PILOT-*.md` with their source as of 2026-11-11; re-check against the latest versions before sending to a customer.*

## คำถามที่เปิดอยู่สำหรับทนาย / Open questions for counsel

รหัสในวงเล็บคือที่มา: **L** = รายการใน `docs/CTO-BRIEF.md` ข้อ 8 · **P / C / D / E / R / K / L(abour) / G / M** = คำถามใน `docs/LEGAL-REVIEW-PACK.md` ข้อ 3–4 ·
**B / C / E / F** (ตามด้วยตัวเลข) = หัวข้อใน `docs/PDPA-NOTES-FOR-COUNSEL.md`
*Codes show the source: **L** = row in `docs/CTO-BRIEF.md` section 8 · **P / C / D / E / R / K / G / M** = question in `docs/LEGAL-REVIEW-PACK.md` sections 3-4 · **B / C / E / F + number** = section of `docs/PDPA-NOTES-FOR-COUNSEL.md`.*
(ในรหัสของ LEGAL-REVIEW-PACK “L1–L5” หมายถึงกฎหมายแรงงาน ไม่ใช่ L-items ของ CTO-BRIEF · *In LEGAL-REVIEW-PACK, "L1-L5" means labour law, not the CTO-BRIEF L-items.*)

### ก. บทบาทและการเป็นผู้ประมวลผล / Roles and processor status

| # | คำถาม / Question | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q1 | ยืนยันบทบาท: ลูกค้าเป็นผู้ควบคุม LENSIQ ไม่ใช่ผู้ประมวลผลเมื่อไม่ได้รับข้อมูลเลย แต่เป็นผู้ประมวลผลเมื่อมีการช่วยเหลือทางไกล โฮสต์ฮับ วิดีโอทดลอง ซิงก์ หรือ AI · Confirm roles | TOS 4–5, DPA 2, Privacy B | LEGAL-REVIEW-PACK G1 §2; L22 |
| Q2 | แม่แบบ DPA นี้เพียงพอหรือไม่ ตรวจเลขอนุมาตราของมาตรา 40 และเนื้อหาบันทึกการประมวลผล · Is this DPA adequate; check s.40 sub-paragraphs and the processing record | DPA 4.5 | G1; L22 ข้อ 2 |
| Q3 | ต้องมี DPO ของ LENSIQ (มาตรา 41) หรือไม่ และลูกค้าแต่ละประเภทต้องมีหรือไม่ · Does LENSIQ, and each customer type, need a DPO | Privacy A-1 | P8; L22 ข้อ 3 |
| Q4 | ระยะแจ้งเหตุละเมิดของผู้ประมวลผล [24] ชม. เหมาะสมหรือไม่ · Is a [24] h processor breach notice right | TOS 5.2, DPA 7, Pilot 6.2 | P9; L22 ข้อ 14 |
| Q5 | เพดานความรับผิดด้านข้อมูลส่วนบุคคลแยกจากเพดานทั่วไปหรือไม่ และการแบ่งความรับผิดตามมาตรา 77–78 · Separate liability cap for data breaches; liability sharing under ss.77-78 | TOS 10.6, DPA 11 | G1 |
| Q6 | ลูกค้าจะอ้างผู้ประมวลผลช่วงที่ใช้ข้อตกลงมาตรฐานของตนเอง (Cloudflare ฯลฯ) ผู้ให้บริการรับผิดต่อลูกค้าในขอบเขตใด · Liability for sub-processors on their own standard terms | DPA 5.3 | L50; L22 ข้อ 2 |

### ข. ฐานทางกฎหมายต่อผลิตภัณฑ์ / Lawful basis per product

| # | คำถาม / Question | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q7 | **Exam:** ฐานสำหรับสถาบันรัฐ (ม.24(4)) กับเอกชน (ม.24(5)/ความยินยอม); ถ้าใช้ความยินยอมต้องมีทางเลือกจริง; ต้องใช้แบบความยินยอมกับผู้เข้าสอบจริงทุกคนหรือไม่; ข้อมูลผู้ที่นั่งใกล้เคียงในภาพ · Exam basis (public vs private), consent needs a real alternative, neighbours in frame | Privacy A-2, Consent 1ข | PDPA-NOTES B1, C2; L22 ข้อ 4 |
| Q8 | **ผู้เยาว์ในการสอบ/กิจกรรม:** ความยินยอมผู้ปกครองตามมาตรา 20 อายุต่ำกว่า 10 ปี และสัญญากับผู้ปกครอง · Minors and guardian consent (s.20) | Privacy A-2, Consent common 5 | P7; L22 ข้อ 8 |
| Q9 | **Attendance (ใบหน้า):** ความยินยอมในการจ้างงาน/อบรมถือว่าสมัครใจหรือไม่แม้มี PIN/QR; ต้องใช้ฐานอื่นหรือไม่ตัดตัวเลือกนี้ในกลุ่มพนักงาน · Is employment consent free with a PIN / QR alternative | Privacy A-3, Consent 2 | P2; PDPA-NOTES B2; L22 ข้อ 11 |
| Q10 | **Attendance (บันทึกเวลา):** ยืนยัน ม.24(6)/พ.ร.บ.คุ้มครองแรงงาน ม.114 เก็บอย่างน้อย 2 ปี และปฏิเสธคำขอลบในช่วงนั้นได้ · Confirm LPA s.114 two-year retention and refusal of erasure | Privacy A-3 | PDPA-NOTES B2; L22 ข้อ 10 |
| Q11 | **Gate:** ม.24(5) กับ ม.24(3) สำหรับลานจอด หมู่บ้าน และผู้มาติดต่อ; ข้อความที่ผู้มาติดต่อต้องได้รับ; รายการห้ามเข้าเป็นข้อมูลที่ต้องมีมาตรการเพิ่มหรือไม่; ร่างแนวปฏิบัติ CCTV ของ สคส. · Gate basis, visitor notice, deny list | Privacy A-4, Consent 3 | L24; PDPA-NOTES B3; L22 ข้อ 5–7 |
| Q12 | **Crowd:** ป้ายพร้อมฐานประโยชน์โดยชอบด้วยกฎหมายเพียงพอสำหรับการนับแบบไม่ระบุตัวตนหรือไม่ ต้องใส่ในเงื่อนไขบัตรหรือไม่; ต้องมี LIA ต่อลูกค้า · Is a sign plus legitimate interest enough for anonymous counting; ticket terms; per-customer LIA | Privacy A-5, Consent 4 | P5; PDPA-NOTES C1 |
| Q13 | **วิดีโอในโครงการทดลอง:** ฐาน (ประโยชน์โดยชอบด้วยกฎหมายหรือความยินยอมเมื่อเข้าพื้นที่) ป้าย E และถ้อยคำรักษาความลับของผู้ตรวจนับ · Pilot video basis, sign E, counters' confidentiality | Pilot 5–6, Annex C | P11; K1; K2 |

### ค. ข้ามประเทศและ AI / Cross-border and AI

| # | คำถาม / Question | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q14 | กลไกตามมาตรา 28–29 สำหรับ Cloudflare (D1 ไม่มีตัวเลือกประเทศไทย) และสำหรับหน่วยงานรัฐที่อาจต้องใช้ที่เก็บในไทย · s.28-29 mechanism for Cloudflare; public bodies needing Thai hosting | DPA 6, Privacy A-1 / B | P6; L22 ข้อ 1, 4; L9 |
| Q15 | เงื่อนไขผู้ให้บริการ AI แต่ละราย (Anthropic, Gemini แบบเสียเงิน, OpenAI, Qwen, DeepSeek, z.ai, Kimi, OpenRouter) และห่วงโซ่ผู้ประมวลผลช่วง (OpenRouter → Google Vertex / Azure) · Each AI provider's terms and the sub-processor chain | DPA Annex 2 | L1–L8; L50 |
| Q16 | **เสนอ: ไม่เปิด DeepSeek ให้ลูกค้า** (เก็บในจีนและอาจฝึกโมเดล) ทนายเห็นด้วยหรือไม่ · Proposal: do not offer DeepSeek to customers | DPA Annex 2 | L5 |
| Q17 | ฐานทางกฎหมายสำหรับลูกค้าจริงเมื่อส่งข้อความ/ภาพไปต่างประเทศ: ความยินยอมต่อครั้งเพียงพอหรือไม่ ข้อความยินยอมต้องมีอะไร ผู้เยาว์ · Basis for real customers sending text / images abroad; consent wording; minors | DPA 5.4 | L48; L11; L10 |
| Q18 | ประกาศความเป็นส่วนตัว/ข้อกำหนดต้องระบุผู้ให้บริการ AI ประเทศ และระยะเก็บหรือไม่เมื่อใช้งานจริง · Must notices list AI providers, countries and retention | Privacy B | L12; L49 |
| Q19 | ข้อยกเว้น “ส่งเฉพาะข้อเท็จจริงที่สกัดแล้ว” กรณีภาพ (ลูกค้าอนุมัติแยกเป็นหนังสือ) ยอมรับได้หรือไม่ · The image exception to "only derived facts are sent" | DPA 5.4 | L10; L45 |

### ง. ข้อกำหนดการให้บริการและการค้า / Terms and commercial

| # | คำถาม / Question | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q20 | การจำกัดความรับผิด (12 เดือนของค่าบริการ ข้อยกเว้น) สมเหตุสมผลตาม ป.พ.พ. ม.373 และ พ.ร.บ.ข้อสัญญาที่ไม่เป็นธรรม สำหรับสัญญา B2B แบบมาตรฐานหรือไม่ · Liability cap fair under CCC s.373 and UCTA for standard B2B terms | TOS 10, Pilot 10 | C3; G1 |
| Q21 | ข้อชดใช้ของลูกค้า (TOS 10.5) ขอบเขตและเพดานที่เป็นธรรม · Fair scope and cap for the customer indemnity | TOS 10.5 | G1 |
| Q22 | ดอกเบี้ยผิดนัดและสิทธิระงับบริการเมื่อชำระล่าช้า · Default interest and right to pause | TOS 8.4 | R-items (accountant) |
| Q23 | ราคา B2B ไม่รวม VAT, ถ้อยคำ “ทดลอง 30 วัน”, การหักค่าทดลอง, ใบกำกับภาษีค่าทดลอง, ภาษีหัก ณ ที่จ่าย 3%, ใบลดหนี้เมื่อคืนเงินโอน · B2B VAT display, "30-day trial", pilot credit, withholding, credit notes | TOS 7–8, Pilot 2 | L25; R1–R4; D3 |
| Q24 | การตอบรับด้วยอีเมล/ลงนามอิเล็กทรอนิกส์ และหลักฐานที่ควรเก็บ · E-mail acceptance and e-signature evidence | TOS 13.7 | E1; E2 |
| Q25 | กฎหมายที่ใช้บังคับ ศาล หรือควรใช้อนุญาโตตุลาการ · Governing law, court vs arbitration | TOS 14, Pilot 12 | G4 |
| Q26 | เครื่องหมายการค้า “LENSIQ” · Trademark clearance | TOS 11.2 | G3 |
| Q27 | การอ้างความแม่นยำใน B2B: “ไม่เก็บภาพ”, “ประมวลผลบนเครื่อง”, การบอกว่า Crowd ยังไม่เหมาะกับฝูงชนหนาแน่น เป็นถ้อยคำที่ยอมรับได้หรือไม่ · Are the accuracy and privacy claim wordings acceptable | TOS 6, Pilot 9, Privacy | C1; C6 |

### จ. สัญญาอนุญาตโมเดลและทรัพย์สินทางปัญญา / Model licences and IP

| # | คำถาม / Question | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q28 | สัญญาอนุญาตของข้อมูลฝึกโมเดลใบหน้า (detector, landmarks, recognition ที่ Attendance ใช้; age/gender; expression) ข้อกำหนดนี้จึงปิดโมเดลที่จำกัดสิทธิในรุ่นลูกค้าและไม่เปิดให้ในสัญญา ควรตัดทิ้งทั้งหมดหรือไม่ · Face-model training-data licences; keep the licence-limited models off and out of the contract? | TOS 2.5, 3.3 | L23; M1–M3 |

### ฉ. ความปลอดภัยที่ต้องแก้ก่อนขาย / Security gap to fix before sale

| # | รายการ / Item | ไฟล์ / File | ที่มา / Source |
|---|---|---|---|
| Q29 | รหัสกู้คืนผู้ดูแล 10 ชุดยังเก็บเป็น SHA-256 ธรรมดา **ต้องแก้ก่อนมีลูกค้าจริงใช้หลังบ้าน** DPA ภาคผนวก 4 ข้อ 10 บอกข้อจำกัดนี้ตามจริง ต้องอัปเดตภาคผนวกเมื่อแก้แล้ว (เรื่องวิศวกรรม ไม่ใช่คำถามทนาย) · Admin recovery codes are plain SHA-256; fix before real customers use the back end. Annex 4 item 10 states it; update the Annex when fixed (engineering, not a question for counsel) | DPA Annex 4 | L51 |

### ช. จุดที่เอกสารสมมติหรือยังไม่ได้ยืนยัน (ไม่ใช่คำถามกฎหมายล้วน) / Assumptions to confirm (not purely legal)

- **บัญชีองค์กร/ซิงก์ข้ามอุปกรณ์ยังไม่ได้สร้าง** (`docs/ORG-ACCOUNTS-DESIGN.md` เป็นการออกแบบ; ระยะเวลาเก็บฝั่งเซิร์ฟเวอร์ใน DPA ภาคผนวก 3 ข เป็นค่าออกแบบ) DPA ต้องปรับให้ตรงกับของที่สร้างจริงก่อนเปิดบริการ ·
  *Organisation accounts / sync are not built; the server-side retention values in DPA Annex 3 B are design values and must be matched to what is built.* (L22)
- **ตัวเลขทดลองและเกณฑ์ผ่านใน `PILOT-AGREEMENT.md` ภาคผนวก ก** เป็นข้อเสนอของผู้ให้บริการ ไม่ใช่มาตรฐาน; Exam, Attendance (หน้างานจริง), Gate (หน้างานจริง) ยังไม่มีตัวเลขหน้างาน ·
  *The thresholds in Pilot Annex A are the Provider's proposal. Exam, Attendance and Gate have no field figures yet.*
- **ไม่อ้างใบรับรองความปลอดภัย** (ISO 27001, SOC 2) ในภาคผนวก 4 เพราะไม่มีหลักฐานในโปรเจกต์ · *No security certification is claimed in Annex 4 because the project has no evidence of one.*
- **Exam คลิปหลักฐาน:** ถ้าจะขายโหมดนี้ แบบ 1ก ต้องเลือกข้อความที่ตรงกับการตั้งค่า (ปิด/เปิด) ·
  *Exam evidence clips: pick the sign wording that matches the setting (off / on).*
- **ไม่ได้ทำ (นอกขอบเขตรอบนี้):** ข้อตกลงพันธมิตร/ตัวแทน (L28), ถ้อยคำ TOR จัดซื้อภาครัฐ (L26–L27), ข้อกำหนดผู้บริโภคของเว็บไซต์ (อยู่ใน `terms.html`),
  Fortune / Merit (L42–L44) · *Out of scope this round: partner / reseller agreement (L28), public-procurement TOR wording (L26-L27), consumer website terms (in `terms.html`), Fortune / Merit (L42-L44).*

## วิธีส่งให้ทนาย / How to send to counsel

1. ส่ง README นี้ + 5 ไฟล์ร่าง + `docs/LEGAL-REVIEW-PACK.md` + `docs/PDPA-NOTES-FOR-COUNSEL.md` + `docs/ORG-ACCOUNTS-DESIGN.md` §9–10
2. ขอ: บันทึกสั้นตอบ Q1–Q28 · ฉบับแก้ไขของร่างทั้ง 5 · แม่แบบ DPA ฉบับสุดท้าย (G1) · หนึ่งรอบแก้
3. หลังทนายอนุมัติ: กรอกรายละเอียดผู้ให้บริการ ตั้งเวอร์ชัน 1.0 ลบแถบ “ร่าง” บันทึกผู้ตรวจ วันที่ และเลขบันทึกใน `CHANGELOG.md` (ตามขั้นตอนใน LEGAL-REVIEW-PACK §6)

*Send this README + the five drafts + `docs/LEGAL-REVIEW-PACK.md` + `docs/PDPA-NOTES-FOR-COUNSEL.md` + `docs/ORG-ACCOUNTS-DESIGN.md` sections 9-10. Ask for a short memo on Q1-Q28, marked-up drafts, the final DPA template (G1) and one revision round.
After approval: fill the seller details, set version 1.0, remove the draft banner, and record reviewer, date and memo reference in `CHANGELOG.md` (as in LEGAL-REVIEW-PACK section 6).*

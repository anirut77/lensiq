# ชุดเอกสารขาย (Sales kit) — Exam · Attendance · Gate · Crowd

> **ร่าง (DRAFT) 2026-11-11** ตามคำสั่งประจำของเจ้าของ (CLAUDE.md) "Sellable pack" ขายด้วยใบเสนอราคาและโอนผ่านธนาคาร ไม่มีชำระออนไลน์
> ไทยก่อน อังกฤษตามหลัง (ท้ายแต่ละไฟล์) ราคาทุกบรรทัดมาจากรายการราคาที่เจ้าของอนุมัติ 2026-11-09 (`docs/PRICING-RESEARCH.md` §3) ไม่รวม VAT 7%
> แพ็กเกจรวมมาจาก `docs/SALES-PACKAGES.md` ซึ่งเป็นร่าง ยังไม่อนุมัติ จึงติดป้าย "ร่าง"
> ห้ามส่งให้ลูกค้าจนกว่าเจ้าของกรอกข้อมูลผู้ขาย (OP-01) ยืนยันสถานะ VAT (OP-02) และให้นักบัญชีกับทนายตรวจ (OP-24)
> ไม่มีไฟล์เดิมถูกแก้ ทุกไฟล์ใหม่อยู่ใน `docs/sales/`

## ผลิตภัณฑ์ในชุดนี้

| ผลิตภัณฑ์ | สถานะ (`docs/PAGE-STATUS.md`) | ข้อจำกัดที่ต้องพูดทุกครั้ง |
|---|---|---|
| Exam (ห้องคอมพิวเตอร์ / lab mode) | พร้อมนำร่อง · ห้องสอบที่มีกล้อง = ทดลอง ไม่ขาย | ผู้คุมสอบตัดสินเสมอ ในห้องสอบจริงยังไม่ได้วัด สัญญาณ "มากกว่าหนึ่งคน" เป็นตัวช่วย (28.8% ชุดข้อมูลสาธารณะ) |
| Attendance | พร้อมนำร่อง · PIN/QR เป็นค่าเริ่มต้น ใบหน้าเป็นตัวเลือก | ที่ทำงานจริงยังไม่ได้วัด ไม่มีซิงก์คลาวด์ ใบหน้ารอข้อสรุปใบอนุญาตโมเดล |
| Gate (ช่วย รปภ.) | พร้อมนำร่อง | รปภ. ยืนยันทุกคัน ภาพจริงต้องแตะกรอบเอง 78% (ชุดข้อมูลสาธารณะ) ไม่ใช่ไม้กั้นอัตโนมัติ |
| Crowd (งานอีเวนต์) | ทดลอง ผลเบื้องต้น | ค่าประมาณ ไม่ใช่จำนวนแน่นอน ยังไม่เหมาะกับฝูงชนหนาแน่น ไม่ใช้ตัดสินความปลอดภัย |

กฎร่วมทุกไฟล์: ไม่มีการวิเคราะห์อารมณ์ ไม่ตรวจจับการโกหก ไม่ให้คะแนนความน่าสงสัย ไม่ใช้โมเดลอายุ/เพศ/สีหน้าในเวอร์ชันลูกค้า ประมวลผลบนอุปกรณ์ ไม่เก็บภาพบุคคล
ตัวเลขความแม่นยำทุกตัวมีที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตาม `docs/ACCURACY-CLAIMS.md`

## ดัชนีไฟล์

| กลุ่ม | ไฟล์ | ใช้เมื่อ |
|---|---|---|
| เอกสารการเงิน | [`QUOTATION-TEMPLATE.md`](QUOTATION-TEMPLATE.md) ใบเสนอราคา | เสนอราคา (มีตารางราคาที่ใช้ได้และตัวอย่างต่อผลิตภัณฑ์) |
| | [`INVOICE-TEMPLATE.md`](INVOICE-TEMPLATE.md) ใบแจ้งหนี้ | ลูกค้ายอมรับใบเสนอราคาแล้ว |
| | [`RECEIPT-TEMPLATE.md`](RECEIPT-TEMPLATE.md) ใบเสร็จรับเงิน | เงินโอนเข้าบัญชีแล้ว |
| | [`ORDER-FORM.md`](ORDER-FORM.md) ใบสั่งซื้อ | ลูกค้าเซ็นยืนยัน พร้อมข้อ 6 การประมวลผลข้อมูล (DPA) |
| เดโม 10 นาที | [`DEMO-SCRIPT-EXAM.md`](DEMO-SCRIPT-EXAM.md) · [`DEMO-SCRIPT-ATTENDANCE.md`](DEMO-SCRIPT-ATTENDANCE.md) · [`DEMO-SCRIPT-GATE.md`](DEMO-SCRIPT-GATE.md) · [`DEMO-SCRIPT-CROWD.md`](DEMO-SCRIPT-CROWD.md) | พบลูกค้า (ข้อมูลตัวอย่างเท่านั้น มีรายการ "ห้ามพูด") |
| เริ่มต้นใช้งาน | [`ONBOARDING-EXAM.md`](ONBOARDING-EXAM.md) · [`ONBOARDING-ATTENDANCE.md`](ONBOARDING-ATTENDANCE.md) · [`ONBOARDING-GATE.md`](ONBOARDING-GATE.md) · [`ONBOARDING-CROWD.md`](ONBOARDING-CROWD.md) | หลังตกลงซื้อ: ติดตั้ง วันแรก ปัญหาที่พบบ่อย ติดต่อใคร |
| สไลด์ขาย | [`DECK-EXAM.md`](DECK-EXAM.md) · [`DECK-ATTENDANCE.md`](DECK-ATTENDANCE.md) · [`DECK-GATE.md`](DECK-GATE.md) · [`DECK-CROWD.md`](DECK-CROWD.md) | นำเสนอ 8–10 สไลด์ (คั่นด้วย `---`) เฉพาะตัวเลขที่วัดแล้ว |

ลำดับใช้งานแนะนำ: สไลด์/เดโม → ใบเสนอราคา → ใบสั่งซื้อ → ใบแจ้งหนี้ → ใบเสร็จ → คู่มือเริ่มต้นใช้งาน

เอกสารต้นทาง: `docs/PRICING-RESEARCH.md`, `docs/SALES-PACKAGES.md` (ร่าง), `docs/BILLING-PLAN.md` §4.1 §5, `docs/LEGAL-REVIEW-PACK.md` §3.5, `docs/ONE-PAGER-*.md`,
`docs/ACCURACY-CLAIMS.md`, `docs/accuracy-figures.json`, `docs/EXAM.md`, `docs/GATE.md`, `docs/ATTENDANCE-READINESS.md`, `docs/CROWD-ACCURACY.md`, `docs/pilot/PILOT-*.md`,
`docs/SUPPORT.md`, `docs/DEPLOYMENT-CHECKLIST.md`, `docs/PAGE-STATUS.md`

## จุดเปิดทั้งหมดที่ทำเครื่องหมายไว้ (OP-xx)

ทุกจุดอยู่ในไฟล์ด้วยป้าย **[ต้องยืนยัน / to confirm]** หรือรหัส OP-xx ผู้ตัดสิน: เจ้าของ (O) นักบัญชี (A) ทนาย (L) ทีมผลิตภัณฑ์ (P)

| รหัส | ผู้ตัดสิน | จุดเปิด | อยู่ในไฟล์ | ที่รู้แล้ว / แหล่ง |
|---|---|---|---|---|
| OP-01 | O | ข้อมูลผู้ขาย: ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ สาขา บัญชีธนาคาร ผู้ติดต่อ เป็นช่อง [วงเล็บ] ไม่มีการแต่ง | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบสั่งซื้อ สไลด์ | `lensiq-config.js` `LENSIQ_SELLER` ยังไม่กรอก (`tools/check-legal.mjs` รายงานช่องว่าง) |
| OP-02 | O, A | ผู้ขายจดทะเบียน VAT หรือไม่ (แบบ V มี VAT / แบบ N ไม่มี VAT) ใบกำกับภาษีออกได้เฉพาะผู้ขายที่จดทะเบียน | ทุกเอกสารการเงิน สไลด์ | `BILLING-PLAN.md` §5 ต้องจดเมื่อรายได้ > 1.8 ล้านบาท/ปี สมัครใจได้ถ้าน้อยกว่า · `LEGAL-REVIEW-PACK.md` R1 |
| OP-03 | A | รูปแบบใบกำกับภาษี: ออกจากระบบบัญชี หรือ e-Tax Invoice by Email | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `LEGAL-REVIEW-PACK.md` R2 · `BILLING-PLAN.md` §5 (e-Tax ยังไม่สร้าง ต้องให้นักบัญชียืนยันรูปแบบก่อนออกจริง) |
| OP-04 | A | รูปแบบเลขที่เอกสารไม่ขาดตอน (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ) | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | ระบบใบเสร็จใช้ `LQ-YYYYMM-000001` ยังไม่ยืนยันว่าใช้กับเอกสารที่ทำเอง |
| OP-05 | A | ภาษีหัก ณ ที่จ่ายของลูกค้านิติบุคคล: อัตรา ฐาน เวลาส่งหนังสือรับรอง (50 ทวิ) | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `BILLING-PLAN.md` §5 ระบุว่ามักหัก 3% · `LEGAL-REVIEW-PACK.md` R4 |
| OP-06 | O | อายุใบเสนอราคา (ร่าง 30 วัน เอกสารแพ็กเกจระบุ 30–60 วัน ยังไม่ยืนยัน) กำหนดชำระ มัดจำ งวดชำระของแพ็กเกจรายปี | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `SALES-PACKAGES.md` A.5 |
| OP-07 | A | ใบเสร็จและใบกำกับภาษีของผู้ขายที่จด VAT: ออกเป็นฉบับเดียวหรือแยก ออกเมื่อใด | ใบแจ้งหนี้ ใบเสร็จ | `BILLING-PLAN.md` §5 (ระบุฟิลด์ที่ต้องมี ไม่ระบุเวลา) |
| OP-08 | O | นิยาม "คนที่ใช้งาน" (Attendance ขั้นต่ำ 190 บาท/เดือน) | ใบเสนอราคา สไลด์ Attendance | `PRICING-RESEARCH.md` §3.4 ไม่นิยามไว้ |
| OP-09 | O | หน้าเว็บและเอกสารต้นทางยังเขียนว่า "ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย" เจ้าของยืนยันว่าเสนอราคาได้แล้ว และอัปเดตป้ายเมื่อพร้อม | ใบเสนอราคา เดโม สไลด์ | `PRICING-RESEARCH.md` หัวเรื่อง · คำสั่งประจำ 2026-11-11 ขายด้วยใบเสนอราคา |
| OP-10 | O, L | ราคาช่วงนำร่อง vs หลังนำร่อง: ข้อความในสัญญาว่าเมื่อใดไซต์ "ผ่านเกณฑ์" และใครตัดสิน | ใบเสนอราคา ใบแจ้งหนี้ ใบสั่งซื้อ สไลด์ | `PRICING-RESEARCH.md` §3 · `docs/pilot/PILOT-*.md` (เกณฑ์ยังเป็น "ข้อเสนอ") |
| OP-11 | O | แพ็กเกจรวมเป็นร่างยังไม่อนุมัติ: ส่วนลดบันเดิล (คำถาม B-1) ขนาดของใบอนุญาต Exam ในช่วง 30,000–120,000 (B-2) | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `SALES-PACKAGES.md` ท้ายเอกสาร |
| OP-12 | L | ไม่มีฉบับร่างข้อตกลงประมวลผลข้อมูล (DPA) เป็นไฟล์ ใบสั่งซื้อชี้ไปที่สรุปใน `SUPPORT.md` §5 และ `PDPA-NOTES-FOR-COUNSEL.md` E3 ต้องให้ทนายร่างก่อนขายครั้งแรก | ใบเสนอราคา ใบสั่งซื้อ | LENSIQ จะเป็นผู้ประมวลผล (ม.40) เมื่อเข้าถึงอุปกรณ์ระยะไกลหรือซิงก์ |
| OP-13 | O, L | ไม่มีข้อกำหนดการใช้บริการ การยกเลิก การคืนเงิน ความรับผิด สำหรับการขายด้วยใบเสนอราคา (มีเฉพาะสัญญานำร่อง `docs/pilot/AGREEMENT-TH.md`) | ใบเสนอราคา ใบเสร็จ ใบสั่งซื้อ | `SUPPORT.md` §10.4 เป็นแม่แบบคืนเงินของผู้ใช้ทั่วไป |
| OP-14 | L, O | โมเดลใบหน้า (Attendance ตัวเลือกใบหน้า) ฝึกจากชุดข้อมูลวิจัย รอความเห็นทางกฎหมายก่อนใช้เชิงพาณิชย์ จนกว่าจะได้ข้อสรุปไม่เสนอใบหน้าเป็นจุดขาย | ใบสั่งซื้อ เดโม Attendance คู่มือ สไลด์ | `ONE-PAGER-ATTENDANCE.md` PDPA · `DEPLOYMENT-CHECKLIST.md` ข้อ 1 · F5/F6 ใน `PAGE-STATUS.md` |
| OP-15 | P | โหมดเดโม `?demo=1` ยังไม่มี: `exam-lab.html?demo=1` `attendance.html?mode=employee&demo=1` `village.html?demo=1` `parking.html?demo=1` `crowd.html?demo=1` (ที่มีแล้ว: ปุ่มสาธิตในแดชบอร์ด Exam ภาพป้ายตัวอย่างของ Gate ปุ่ม "ดูตัวอย่าง" ของ Crowd) | เดโม 4 ไฟล์ | ทุกขั้นตอนที่เกี่ยวข้องเขียนว่า "ต้องมีโหมดเดโม (กำลังทำ)" |
| OP-16 | O | ช่องทางติดต่อและสนับสนุน (อีเมล LINE OA โทรศัพท์ หน้าสถานะ) ยังไม่ประกาศ | เอกสารทุกฉบับ คู่มือ สไลด์ | `SUPPORT.md` · `lensiq-config.js` `LENSIQ_SELLER` |
| OP-17 | O | แผนสนับสนุนที่ขายและเวลาตอบรับ: ค่าใน `SUPPORT.md` §2–3 อยู่ในวงเล็บ ต่อรองได้ ยังไม่อนุมัติ และไม่มีราคาแผนสนับสนุนในรายการราคาอนุมัติ จึงไม่ใส่ในใบเสนอราคา | คู่มือเริ่มต้น 4 ไฟล์ | `SUPPORT.md` §2–3 |
| OP-18 | O | นิยามหน่วยขาย: "รอบสอบ" "ห้องปฏิบัติการ" (Exam) "วัน" (Crowd) "ช่องทาง" (Gate) | ใบเสนอราคา ใบสั่งซื้อ | `PRICING-RESEARCH.md` §3 ไม่นิยามไว้ |
| OP-19 | O | ค่าเดินทางและติดตั้งนอกพื้นที่ไม่อยู่ในราคาอนุมัติ ไม่มีการเพิ่มบรรทัดเอง (ราคาติดตั้งหน้างาน Gate 2,500 บาทต่อครั้ง) | ใบเสนอราคา ใบสั่งซื้อ สไลด์ Gate | `PRICING-RESEARCH.md` §3.2 |
| OP-20 | P | ทดลองใช้ Gate ฟรี 30 วัน เป็นข้อความ ไม่มีตัวจับเวลาในโค้ด ต้องนับวันเอง | เดโม Gate คู่มือ Gate สไลด์ Gate | `PRICING-RESEARCH.md` §3.2 |
| OP-21 | O | สถานะ Crowd: คำสั่งงานเรียกว่าทดลอง ขณะ `PAGE-STATUS.md` ให้ "พร้อมนำร่อง" เฉพาะคนเบาบางถึงปานกลาง ชุดนี้ใช้ทั้งสองคำ ตัวเลขเป็นผลเบื้องต้นเทียบ AI รอผลคนนับ (C8) | เดโม Crowd สไลด์ Crowd | `CROWD-ACCURACY.md` |
| OP-22 | L | Exam กับผู้สอบที่ยังไม่บรรลุนิติภาวะ: ขั้นตอนความยินยอมของผู้ปกครอง | ใบสั่งซื้อ | `SALES-PACKAGES.md` C.7 |
| OP-23 | L | การลบข้อมูลเมื่อสิ้นสุดสัญญาและเวลาแจ้งเหตุละเมิด (ค่า [30 วัน] [24 ชม.] อยู่ในวงเล็บ ต่อรองได้) | ใบสั่งซื้อ | `SUPPORT.md` §5 |
| OP-24 | L, A | เอกสารทั้งชุดต้องให้ทนายและนักบัญชีตรวจก่อนขาย (PDPA กฎหมายแรงงาน การโฆษณาความแม่นยำ ภาษี) | ทุกไฟล์ | `CLAUDE.md` "A lawyer reviews before sale" · `docs/PDPA-NOTES-FOR-COUNSEL.md` |
| OP-25 | O | Exam ห้องคอมพิวเตอร์ยังดูสดข้ามเครื่องไม่ได้ (ไม่มีปลายทาง relay) ต้องส่งออกไฟล์หลังสอบ เจ้าของยอมรับสำหรับนำร่องแล้ว ต้องยืนยันว่าจะบอกลูกค้าที่ซื้อจริงอย่างไร | เดโม Exam คู่มือ Exam | `docs/pilot/PILOT-EXAM.md` §2 · `docs/EXAM.md` "Transport and privacy" |

## ข้อมูลที่ไม่พบในที่เก็บ (ไม่ได้แต่งเอง)

ชื่อบริษัทผู้ขาย เลขผู้เสียภาษี ที่อยู่ บัญชีธนาคาร ผู้ติดต่อ · ฉบับร่าง DPA · ข้อกำหนดการขาย · ราคาแผนสนับสนุน · ราคาค่าเดินทาง · นิยามหน่วยขาย · ลูกค้าอ้างอิง (ไม่มี ไม่ได้ใส่) · ผลหน้างานจริงของทุกผลิตภัณฑ์

---

# English

> **DRAFT 2026-11-11.** The "Sellable pack" under the owner's standing order (CLAUDE.md). The owner sells by quotation and bank transfer; there is no online payment. Thai first, English
> after it in each file. Every price line comes from the approved list of 2026-11-09 (`docs/PRICING-RESEARCH.md` §3), excluding 7% VAT. Combined packages come from `docs/SALES-PACKAGES.md`,
> a draft, so they carry a "draft" label. Do not send anything to a customer until the owner fills the seller details (OP-01), confirms VAT status (OP-02), and an accountant and a lawyer have
> reviewed it (OP-24). No existing file was edited; every file is new and under `docs/sales/`.

## Index

| Group | Files | Use when |
|---|---|---|
| Financial documents | `QUOTATION-TEMPLATE.md`, `INVOICE-TEMPLATE.md`, `RECEIPT-TEMPLATE.md`, `ORDER-FORM.md` | Quote (with the allowed price table and a worked example per product), invoice after acceptance, receipt after the transfer arrives, order form with the data-processing acknowledgement in section 6 |
| 10-minute demos | `DEMO-SCRIPT-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | Customer meetings: sample data only; each has a "do NOT claim" list |
| Onboarding | `ONBOARDING-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | After purchase: install, first day, common problems, who to contact |
| Sales decks | `DECK-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | 8–10 slides separated by `---`; measured claims only, each with source and file |

Suggested order: deck or demo, quotation, order form, invoice, receipt, onboarding guide.

## Open points (all marked in the files by **[to confirm]** or an OP code)

Deciders: owner (O), accountant (A), lawyer (L), product team (P). The table above (Thai) carries the full wording, location and source for each. In short:

- **OP-01 (O)** Seller details (company name, tax ID, address, branch, bank account, contacts) are [bracket] fields; none invented.
- **OP-02 (O, A)** Is the seller VAT-registered? Form V (VAT line) or Form N (none). A tax invoice needs registration. `BILLING-PLAN.md` §5; `LEGAL-REVIEW-PACK.md` R1.
- **OP-03 (A)** Tax-invoice format: from an accounting system or e-Tax Invoice by Email (R2).
- **OP-04 (A)** Gap-free document numbering for quotation, invoice and receipt (the Worker uses `LQ-YYYYMM-000001` for receipts).
- **OP-05 (A)** Withholding tax by juristic customers: rate, base, timing of the certificate (R4; BILLING-PLAN notes 3%).
- **OP-06 (O)** Quotation validity (draft 30 days; SALES-PACKAGES says 30–60, unverified), payment due date, deposit, instalments of yearly packages.
- **OP-07 (A)** For a VAT-registered seller: one combined receipt / tax invoice or two documents, and when.
- **OP-08 (O)** Definition of "active person" (Attendance minimum 190 THB per month).
- **OP-09 (O)** Product pages and source docs still say "approved price list, not on sale yet"; the owner confirms quoting may start and updates the labels.
- **OP-10 (O, L)** Pilot-stage versus after-pilot price: contract wording on when a site "passed" and who decides.
- **OP-11 (O)** Combined packages are draft: bundle discount (B-1) and Exam licence size bands inside 30,000–120,000 (B-2).
- **OP-12 (L)** No DPA draft exists as a file; the order form points to `SUPPORT.md` §5 and `PDPA-NOTES-FOR-COUNSEL.md` E3. Counsel must draft it before the first sale.
- **OP-13 (O, L)** No sales terms (service, cancellation, refund, liability); only the pilot agreement exists.
- **OP-14 (L, O)** Face model licence (Attendance face option) awaits legal opinion; the face option is not offered as a selling point until then.
- **OP-15 (P)** Demo mode `?demo=1` does not exist for `exam-lab.html`, `attendance.html?mode=employee`, `village.html`, `parking.html`, `crowd.html`. Existing today: the Exam dashboard demo button,
  Gate sample plates, the Crowd "try the demo" button. Marked "needs demo mode (in progress)" in the four demo scripts.
- **OP-16 (O)** Contact and support channels (e-mail, LINE OA, phone, status page) not announced.
- **OP-17 (O)** Support plan sold and response times: `SUPPORT.md` §2–3 values are bracketed drafts, and no support price is in the approved list, so none is quoted.
- **OP-18 (O)** Definition of units: "exam session" and "lab" (Exam), "day" (Crowd), "lane" (Gate).
- **OP-19 (O)** Travel and out-of-area installation are not in the approved prices; no line was added.
- **OP-20 (P)** The Gate free 30-day trial is text only; there is no timer in the code.
- **OP-21 (O)** Crowd status: the task calls it experimental while `PAGE-STATUS.md` rates it pilot-ready for sparse-to-medium crowds; the kit uses both words. Figures are preliminary against an AI reference.
- **OP-22 (L)** Exam with minors: parental-consent step.
- **OP-23 (L)** Data deletion at the end of a contract and breach notice times (bracketed [30 days], [24 h]).
- **OP-24 (L, A)** The whole kit needs a lawyer and an accountant before sale.
- **OP-25 (O)** Exam computer-room mode has no live cross-device feed (no relay endpoint); the owner accepted it for the pilot; confirm what to tell paying customers.

**Not found in the repository (not invented):** seller company details, bank account, DPA draft, sales terms, support price, travel price, unit definitions, reference customers, field results for any product.

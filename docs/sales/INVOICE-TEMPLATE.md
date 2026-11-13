# ใบแจ้งหนี้ (Invoice) — แม่แบบ / Template

> **ร่าง (DRAFT) 2026-11-11 — ยังไม่ผ่านการตรวจโดยนักบัญชี** ข้อมูลผู้ขายเป็นช่อง [วงเล็บ] ที่เจ้าของต้องกรอก ห้ามแต่งข้อมูล
> ราคาทุกบรรทัดต้องมาจากรายการราคาที่อนุมัติ (`docs/PRICING-RESEARCH.md` §3, ตารางสรุปใน `QUOTATION-TEMPLATE.md` §2) ไม่รวม VAT 7%
> ชำระโดยโอนผ่านธนาคารเท่านั้น จุดเปิดมีรหัส OP-xx อยู่ใน `docs/sales/README.md`

## 0. ใบแจ้งหนี้กับใบกำกับภาษี

- **ใบแจ้งหนี้** (ขอให้ชำระเงิน) ผู้ขายที่ไม่ได้จดทะเบียน VAT ออกได้ ไม่มีบรรทัด VAT (แบบ N)
- **ใบกำกับภาษี (ใบกำกับภาษีเต็มรูป)** ต้องมีการจดทะเบียน VAT เท่านั้น (แบบ V) ข้อมูลที่ต้องมีตาม `docs/BILLING-PLAN.md` §5 (มาตรา 86/4):
  ชื่อ เลขผู้เสียภาษี ที่อยู่ สาขาของผู้ขายและผู้ซื้อ เลขที่เอกสาร วันที่ รายการ ยอดก่อน VAT VAT ยอดรวม
- สิ่งที่ยังไม่ชัด **[ต้องยืนยัน / to confirm]**: (1) ผู้ขายจดทะเบียน VAT หรือไม่ (OP-02) (2) ออกใบกำกับจากระบบบัญชี หรือ e-Tax Invoice by
  Email (OP-03) (3) รูปแบบเลขที่เอกสารไม่ขาดตอน (ตอนนี้เจ้าของออกเลขเองจากแม่แบบ ระบบไม่ออกเลขให้ 2026-11-13 คำถามถึงนักบัญชีอยู่ที่ `ACCOUNTANT-QUESTIONS-TH.md` หลังยืนยันแผนคือใช้เลขระบบ `LQ-YYYYMM-000001`) (OP-04)
  (4) ใบแจ้งหนี้ใบเดียวกันใช้เป็นใบกำกับภาษีได้เมื่อใด และต้องออกเมื่อใด (OP-07) (5) ภาษีหัก ณ ที่จ่าย (OP-05) ทั้งหมดต้องให้นักบัญชียืนยัน
  (`docs/LEGAL-REVIEW-PACK.md` §3.5 R1–R5)
- ระบบ Worker ของ LENSIQ สร้างใบเสร็จ/ใบกำกับฉบับร่างได้ แต่ขึ้น "ฉบับร่าง" จนกว่าจะตั้งค่า `SELLER_NAME`, `SELLER_TAX_ID`, `SELLER_ADDRESS`
  และนักบัญชียังไม่ยืนยันรูปแบบ (`BILLING-PLAN.md` §5) ใบแจ้งหนี้สำหรับการขายด้วยใบเสนอราคานี้ทำเองจากแม่แบบนี้

## 1. แม่แบบ

| ช่อง | ค่า |
|---|---|
| ผู้ขาย (ชื่อบริษัท/ผู้ขาย) | [ชื่อบริษัท / ชื่อผู้ขาย] (OP-01) |
| เลขประจำตัวผู้เสียภาษี / ที่อยู่ / สาขา | [เลข 13 หลัก] · [ที่อยู่] · [สำนักงานใหญ่/สาขา] |
| ติดต่อ | [อีเมล] · [โทรศัพท์] · [LINE OA] (OP-16) |
| สถานะ VAT | [แบบ V จดทะเบียน / แบบ N ไม่จดทะเบียน] (OP-02) |
| เลขที่ใบแจ้งหนี้ | [เลขที่เอกสาร] (OP-04) |
| วันที่ออก / ครบกำหนดชำระ | [วัน/เดือน/ปี] / [วัน/เดือน/ปี] (OP-06) |
| อ้างอิงใบเสนอราคาเลขที่ / ใบสั่งซื้อเลขที่ | [เลขที่ใบเสนอราคา] / [เลขที่ใบสั่งซื้อของลูกค้า ถ้ามี] |
| ลูกค้า | [ชื่อองค์กร] · [เลขผู้เสียภาษี] · [ที่อยู่ออกเอกสาร] · [สำนักงานใหญ่/สาขา] |
| ผู้ติดต่อ / ไซต์ | [ชื่อ อีเมล] / [ไซต์] |

| # | รายการ | ช่วงบริการ | จำนวน | ราคาต่อหน่วย (ไม่รวม VAT 7%) | จำนวนเงิน |
|---|---|---|---|---|---|
| 1 | [รายการจากตารางราคาอนุมัติ ช่วงนำร่อง/หลังนำร่อง] | [เช่น 1 พ.ค. – 31 พ.ค.] | [จำนวน] | [ราคา] | [จำนวน × ราคา] |

| ยอด | แบบ V | แบบ N |
|---|---|---|
| รวมเป็นเงิน (ก่อน VAT) | [ยอดก่อน VAT] | [ยอดรวม] |
| ภาษีมูลค่าเพิ่ม 7% | [ยอดก่อน VAT × 0.07 ปัดสตางค์] | (ไม่มีบรรทัดนี้) |
| **รวมทั้งสิ้น** | **[ยอดรวม + VAT]** | **[ยอดรวม]** |

**วิธีชำระ:** โอนผ่านธนาคาร [ชื่อธนาคาร] ชื่อบัญชี [ชื่อบัญชี] เลขที่บัญชี [เลขที่บัญชี] สาขา [สาขา] (OP-01)
ใส่เลขที่ใบแจ้งหนี้ในบันทึกการโอนและส่งหลักฐานทางอีเมลหรือ LINE ไม่มีการชำระออนไลน์
**หัก ณ ที่จ่าย (ถ้ามี):** [อัตรา/ฐาน — ต้องยืนยัน / to confirm กับนักบัญชี] (OP-05) ส่งหนังสือรับรองการหักภาษี (50 ทวิ) ให้ผู้ขาย
**หมายเหตุ:** ราคาที่ใช้คือช่วง [นำร่อง/หลังนำร่อง] ตามสัญญา (OP-10) ไม่มีค่าอุปกรณ์ในใบแจ้งหนี้นี้

## 2. ตัวอย่างที่คำนวณแล้วต่อผลิตภัณฑ์ (ราคานำร่องที่อนุมัติ แสดงวิธีคิด ไม่ใช่เอกสารจริง ข้อมูลลูกค้าและผู้ขายเป็นช่องว่าง)

### Exam — ใบแจ้งหนี้ [INV-ตัวอย่าง-1]

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Exam ห้องคอมพิวเตอร์ ต่อผู้สอบ ช่วงนำร่อง (การสอบ [วิชา] วันที่ [วันที่]) | 40 | 10.00 | 400.00 |

ก่อน VAT 400.00 · แบบ V: VAT 28.00, **รวม 428.00** · แบบ N: **รวม 400.00**

### Attendance — ใบแจ้งหนี้ [INV-ตัวอย่าง-2]

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Attendance มาตรฐาน ช่วงนำร่อง เดือน [เดือน] (คนที่ใช้งาน 12 คน) | 12 | 19.00 | 228.00 |
| 2 | Attendance ช่วยตั้งค่า (ครั้งเดียว) | 1 | 2,900.00 | 2,900.00 |

ก่อน VAT 3,128.00 · แบบ V: VAT 218.96, **รวม 3,346.96** · แบบ N: **รวม 3,128.00**
(ถ้าคนที่ใช้งานน้อย ใช้ขั้นต่ำ 190 บาทต่อเดือนแทน ถ้ามากกว่า)

### Gate — ใบแจ้งหนี้ [INV-ตัวอย่าง-3]

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Gate หมู่บ้าน/คอนโด ช่วงนำร่อง เดือน [เดือน] (2 ช่องทาง) | 2 | 490.00 | 980.00 |
| 2 | Gate ติดตั้งหน้างาน ช่วงนำร่อง (1 ครั้ง) | 1 | 2,500.00 | 2,500.00 |

ก่อน VAT 3,480.00 · แบบ V: VAT 243.60, **รวม 3,723.60** · แบบ N: **รวม 3,480.00**

### Crowd — ใบแจ้งหนี้ [INV-ตัวอย่าง-4]

| # | รายการ | จำนวน | ราคาต่อหน่วย | จำนวนเงิน |
|---|---|---|---|---|
| 1 | Crowd วันงาน ช่วงนำร่อง (2 เครื่อง × 2 วัน: [งาน] วันที่ [วันที่]) | 4 | 590.00 | 2,360.00 |

ก่อน VAT 2,360.00 · แบบ V: VAT 165.20, **รวม 2,525.20** · แบบ N: **รวม 2,360.00**

### แพ็กเกจรวม (**ร่าง ยังไม่อนุมัติ** `SALES-PACKAGES.md` §A.2 ตัวอย่าง S) — ใบแจ้งหนี้ [INV-ตัวอย่าง-5]

Exam ใบอนุญาตทั้งสถาบัน 19,900.00 + Attendance 30 × 19 × 10 = 5,700.00 + Crowd สัปดาห์งาน 2 × 2,490 = 4,980.00 + Crowd วันงาน 4 × 590 = 2,360.00
ก่อน VAT **32,940.00** · แบบ V: VAT 2,305.80, **รวม 35,245.80** · แบบ N: **รวม 32,940.00** (OP-11 ยังไม่อนุมัติ งวดชำระของแพ็กเกจรายปีเจ้าของกำหนด OP-06)

---

# English

> **DRAFT 2026-11-11. Not yet checked by an accountant.** Seller details are [bracket] fields for the owner to fill. Never invent them.
> Every price line must come from the approved list (`docs/PRICING-RESEARCH.md` §3, summarised in `QUOTATION-TEMPLATE.md` §2), excluding 7% VAT.
> Payment is by bank transfer only. Open points (OP-xx) are listed in `docs/sales/README.md`.

## 0. Invoice versus tax invoice

- An **invoice** asks for payment. A seller that is not VAT-registered can issue it, with no VAT line (Form N).
- A **tax invoice** (ใบกำกับภาษี) needs VAT registration (Form V). Required fields per `docs/BILLING-PLAN.md` §5 (Revenue Code s.86/4):
  seller and buyer name, tax ID, address and branch, document number, date, items, subtotal, VAT, total.
- Still open **[to confirm]**: (1) is the seller VAT-registered (OP-02); (2) tax invoices from an accounting system or by e-Tax Invoice by Email (OP-03);
  (3) the gap-free number format (for now the owner numbers documents by hand from the templates and the system does not number them, 2026-11-13; the questions for the accountant are in `ACCOUNTANT-QUESTIONS-TH.md`; once confirmed, the plan is system numbering `LQ-YYYYMM-000001`) (OP-04); (4) when one invoice may
  serve as the tax invoice and when it must be issued (OP-07); (5) withholding tax (OP-05). The accountant must confirm all of these
  (`docs/LEGAL-REVIEW-PACK.md` §3.5 R1–R5).
- The LENSIQ Worker can render a draft receipt / tax invoice, but it prints "DRAFT" until `SELLER_NAME`, `SELLER_TAX_ID` and `SELLER_ADDRESS` are set
  and the accountant has confirmed the layout (`BILLING-PLAN.md` §5). Invoices for quotation-based sales are made from this template.

## 1. Template

Header fields: seller name, tax ID, address, branch, contact, VAT status (Form V or N), invoice number (OP-04), issue date, due date (OP-06), quotation and
purchase-order references, customer name, tax ID, billing address, branch, contact, site.
Items: `# | item | service period | quantity | unit price (excl. 7% VAT) | amount`.
Totals: subtotal; VAT 7% (Form V only, rounded to the satang); **grand total**.
Payment: bank transfer to [bank], account name [name], account no. [number], branch [branch] (OP-01). Write the invoice number in the transfer note and send
the slip. No online payment. Withholding tax (if any): [rate and base: to confirm with the accountant] (OP-05); the customer sends the certificate (50 ทวิ).
Note: the price stage used is [pilot / after pilot] as in the contract (OP-10). No hardware appears on this invoice.

## 2. Worked examples per product (approved pilot-stage prices; they show the method; seller and customer fields stay blank)

| Product | Lines | Subtotal | Form V: VAT / total | Form N: total |
|---|---|---|---|---|
| Exam | 40 candidates x 10.00 | 400.00 | 28.00 / **428.00** | 400.00 |
| Attendance | 12 active people x 19.00 = 228.00 (above the 190 minimum) + set-up 2,900.00 | 3,128.00 | 218.96 / **3,346.96** | 3,128.00 |
| Gate | 2 lanes x 490.00 = 980.00 + on-site set-up 2,500.00 | 3,480.00 | 243.60 / **3,723.60** | 3,480.00 |
| Crowd | 2 devices x 2 days = 4 units x 590.00 | 2,360.00 | 165.20 / **2,525.20** | 2,360.00 |
| Draft package (not approved; `SALES-PACKAGES.md` §A.2 example S) | 19,900 + 5,700 + 4,980 + 2,360 | 32,940.00 | 2,305.80 / **35,245.80** | 32,940.00 |

If few people are active, Attendance uses the 190 THB monthly minimum instead. The instalments of a yearly package are the owner's decision (OP-06, OP-11).

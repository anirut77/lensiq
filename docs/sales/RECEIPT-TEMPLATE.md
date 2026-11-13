# ใบเสร็จรับเงิน (Receipt) — แม่แบบ / Template

> **ร่าง (DRAFT) 2026-11-11 — ยังไม่ผ่านการตรวจโดยนักบัญชี** ออกหลังได้รับเงินโอนแล้วเท่านั้น (ตรวจยอดในบัญชีธนาคารก่อน)
> ข้อมูลผู้ขายเป็นช่อง [วงเล็บ] ที่เจ้าของต้องกรอก ห้ามแต่งข้อมูล ราคามาจากรายการที่อนุมัติ (`docs/PRICING-RESEARCH.md` §3) ไม่รวม VAT 7%
> จุดเปิดมีรหัส OP-xx อยู่ใน `docs/sales/README.md`

## 0. ใบเสร็จกับใบกำกับภาษี

- **ใบเสร็จรับเงิน** ยืนยันว่าได้รับเงินแล้ว ผู้ขายที่ไม่ได้จดทะเบียน VAT ออกได้ ไม่มีบรรทัด VAT (แบบ N)
- ผู้ขายที่จดทะเบียน VAT (แบบ V) ต้องมีใบกำกับภาษีที่ถูกต้อง จะออกเป็นเอกสารเดียว "ใบเสร็จรับเงิน/ใบกำกับภาษี" หรือแยกฉบับ
  และต้องออกเมื่อใด เป็นเรื่องที่ **[ต้องยืนยัน / to confirm] กับนักบัญชี** (OP-07, OP-03) `docs/BILLING-PLAN.md` §5 ระบุข้อมูลที่ต้องมี (มาตรา 86/4)
  และใบลดหนี้ (มาตรา 86/10) เมื่อคืนเงิน ไม่มีการจดทะเบียน VAT ก็ไม่มีใบกำกับและไม่มีใบลดหนี้ ใบเสร็จจะประทับ "คืนเงินแล้ว"
- เก็บสำเนาเอกสารอย่างน้อย 5 ปี (`LEGAL-REVIEW-PACK.md` §3.5 R5 ยังต้องยืนยัน)
- เลขที่ใบเสร็จต้องไม่ขาดตอน **ตอนนี้เจ้าของออกใบเสร็จเองจากแม่แบบนี้ ระบบไม่ออกเลขที่ให้** (เจ้าของตัดสินใจ 2026-11-13) ระบบหลังบ้านมีตัวออกเลข `LQ-YYYYMM-000001` แต่ยังไม่ใช้กับการขายแบบโอนเงิน จะเลือกชุดเดียวร่วมกับระบบหรือแยกชุด และใบกำกับภาษีต้องมีอะไร ถามนักบัญชีที่ `docs/sales/ACCOUNTANT-QUESTIONS-TH.md` หลังนักบัญชียืนยัน แผนคือเปลี่ยนไปใช้เลขจากระบบ `LQ-YYYYMM-000001` (OP-04)

## 1. แม่แบบ

| ช่อง | ค่า |
|---|---|
| ผู้ขาย | [ชื่อบริษัท / ชื่อผู้ขาย] · [เลขประจำตัวผู้เสียภาษี] · [ที่อยู่] · [สำนักงานใหญ่/สาขา] (OP-01) |
| สถานะ VAT | [แบบ V / แบบ N] (OP-02) |
| เลขที่ใบเสร็จ | [เลขที่เอกสาร] (OP-04) |
| วันที่ออกใบเสร็จ | [วัน/เดือน/ปี] |
| ได้รับเงินจาก | [ชื่อองค์กร] · [เลขผู้เสียภาษี] · [ที่อยู่] · [สำนักงานใหญ่/สาขา] |
| อ้างอิงใบแจ้งหนี้เลขที่ / ใบเสนอราคาเลขที่ | [เลขที่] / [เลขที่] |
| วิธีรับชำระ | โอนผ่านธนาคาร เข้าบัญชี [ธนาคาร] [เลขที่บัญชี] (OP-01) |
| วันที่และเวลาเงินเข้า / หมายเลขอ้างอิงการโอน | [วันที่เวลาตามรายการบัญชี] / [เลขอ้างอิง] |

| # | รายการ | จำนวน | จำนวนเงิน |
|---|---|---|---|
| 1 | [รายการตามใบแจ้งหนี้] | [จำนวน] | [จำนวนเงิน] |

| ยอด | แบบ V | แบบ N |
|---|---|---|
| รวมเป็นเงิน (ก่อน VAT) | [ยอดก่อน VAT] | [ยอดรวม] |
| ภาษีมูลค่าเพิ่ม 7% | [VAT] | (ไม่มีบรรทัดนี้) |
| **รวมทั้งสิ้น** | **[ยอดรวม + VAT]** | **[ยอดรวม]** |
| หัก ณ ที่จ่าย (ถ้าลูกค้าหัก) | [จำนวนที่หัก — ต้องยืนยัน / to confirm อัตราและฐาน] (OP-05) | เหมือนกัน |
| **ยอดเงินที่ได้รับจริง** | [รวมทั้งสิ้น − ภาษีที่หัก] | เหมือนกัน |

ถ้าลูกค้าหักภาษี ณ ที่จ่าย ให้แนบหรือบันทึกหนังสือรับรอง (50 ทวิ) ที่ได้รับ ถ้ายังไม่ได้รับ ให้ระบุ "รอหนังสือรับรอง" ในหมายเหตุ
ผู้รับเงิน: ____________________ ([ชื่อ ตำแหน่ง]) วันที่ ____________

## 2. ตัวอย่างที่คำนวณแล้วต่อผลิตภัณฑ์ (ราคานำร่องที่อนุมัติ สมมติว่าลูกค้าไม่หักภาษี ณ ที่จ่าย แสดงวิธีคิด ไม่ใช่เอกสารจริง)

| ผลิตภัณฑ์ | รายการที่รับเงิน | ก่อน VAT | แบบ V: VAT / รับเงิน | แบบ N: รับเงิน |
|---|---|---|---|---|
| Exam | ห้องคอมพิวเตอร์ ต่อผู้สอบ 40 × 10.00 | 400.00 | 28.00 / **428.00** | 400.00 |
| Attendance | มาตรฐาน 12 คน × 19.00 = 228.00 + ช่วยตั้งค่า 2,900.00 | 3,128.00 | 218.96 / **3,346.96** | 3,128.00 |
| Gate | หมู่บ้าน 2 ช่องทาง × 490.00 = 980.00 + ติดตั้งหน้างาน 2,500.00 | 3,480.00 | 243.60 / **3,723.60** | 3,480.00 |
| Crowd | วันงาน 2 เครื่อง × 2 วัน × 590.00 | 2,360.00 | 165.20 / **2,525.20** | 2,360.00 |
| แพ็กเกจรวม **ร่าง ยังไม่อนุมัติ** (`SALES-PACKAGES.md` §A.2 ตัวอย่าง S) | 19,900 + 5,700 + 4,980 + 2,360 | 32,940.00 | 2,305.80 / **35,245.80** | 32,940.00 |

ถ้าลูกค้าชำระบางส่วนหรือเป็นงวด ใบเสร็จแต่ละใบระบุงวดและยอดคงเหลือ (เจ้าของกำหนดงวด OP-06)
ถ้าต้องคืนเงิน ใช้ขั้นตอนใน `docs/SUPPORT.md` §10.4 (โอนคืนภายใน 14 วันหลังได้รับข้อมูลบัญชีครบ และออกใบลดหนี้เมื่อมีใบกำกับภาษี)
นโยบายคืนเงินสำหรับการขายแบบใบเสนอราคายังไม่มี **[ต้องยืนยัน / to confirm]** (OP-13)

---

# English

> **DRAFT 2026-11-11. Not yet checked by an accountant.** Issue only after the bank transfer has arrived (check the bank statement first).
> Seller details are [bracket] fields for the owner. Never invent them. Prices come from the approved list (`docs/PRICING-RESEARCH.md` §3), excluding 7% VAT.
> Open points (OP-xx) are listed in `docs/sales/README.md`.

## 0. Receipt versus tax invoice

- A **receipt** confirms that money has been received. A seller that is not VAT-registered can issue it, with no VAT line (Form N).
- A VAT-registered seller (Form V) needs a valid tax invoice. Whether to issue one combined "receipt / tax invoice" or two documents, and when,
  is **[to confirm] with the accountant** (OP-07, OP-03). `docs/BILLING-PLAN.md` §5 lists the required fields (s.86/4) and the credit note (s.86/10) on
  a refund. Without VAT registration there is no tax invoice and no credit note; the receipt is stamped "refunded".
- Keep copies for at least 5 years (`LEGAL-REVIEW-PACK.md` §3.5 R5, still to confirm).
- Receipt numbers must have no gaps. **For now the owner issues receipts from this template and the system does not number them** (owner decision 2026-11-13). The back office has a `LQ-YYYYMM-000001` counter, but it is not used for bank-transfer sales yet. One shared series or a separate one, and what a tax invoice must contain, are questions for the accountant in `docs/sales/ACCOUNTANT-QUESTIONS-TH.md` (Thai). After the accountant confirms, the plan is to switch to system numbering `LQ-YYYYMM-000001` (OP-04).

## 1. Template

Fields: seller (name, tax ID, address, branch) (OP-01), VAT status (Form V or N), receipt number, issue date, received from (customer name, tax ID, address,
branch), invoice and quotation references, method (bank transfer to [bank] [account no.]), date and time the money arrived, transfer reference.
Items as in the invoice. Totals: subtotal; VAT 7% (Form V); **grand total**; withholding tax if the customer withheld (amount: rate and base to confirm
with the accountant, OP-05); **amount actually received** = grand total minus tax withheld. If tax was withheld, record the certificate (50 ทวิ) or write
"certificate pending" in the note. Signature of the person who received the money, with name, position and date.

## 2. Worked examples per product (approved pilot prices; the customer withholds nothing; they show the method, they are not real documents)

| Product | Items paid | Subtotal | Form V: VAT / received | Form N: received |
|---|---|---|---|---|
| Exam | computer room, 40 candidates x 10.00 | 400.00 | 28.00 / **428.00** | 400.00 |
| Attendance | Standard 12 people x 19.00 = 228.00 + set-up 2,900.00 | 3,128.00 | 218.96 / **3,346.96** | 3,128.00 |
| Gate | village 2 lanes x 490.00 = 980.00 + on-site set-up 2,500.00 | 3,480.00 | 243.60 / **3,723.60** | 3,480.00 |
| Crowd | event day, 2 devices x 2 days x 590.00 | 2,360.00 | 165.20 / **2,525.20** | 2,360.00 |
| Draft package (not approved; `SALES-PACKAGES.md` §A.2 example S) | 19,900 + 5,700 + 4,980 + 2,360 | 32,940.00 | 2,305.80 / **35,245.80** | 32,940.00 |

For part payments or instalments, each receipt names the instalment and the balance (the owner sets the instalments, OP-06).
For a refund, follow `docs/SUPPORT.md` §10.4 (transfer back within 14 days of complete bank details; a credit note when a tax invoice exists).
A refund policy for quotation-based sales does not exist yet **[to confirm]** (OP-13).

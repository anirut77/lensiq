# ชุดเอกสารขาย (Sales kit) — Exam · Attendance · Gate · Crowd

> **ร่าง (DRAFT) 2026-11-11** ตามคำสั่งประจำของเจ้าของ (CLAUDE.md) "Sellable pack" ขายด้วยใบเสนอราคาและโอนผ่านธนาคารเท่านั้น (ตอนนี้ไม่มี PromptPay QR บัตร Opn หรือชำระออนไลน์ ตามที่เจ้าของตัดสิน 2026-11-13)
> ไทยก่อน อังกฤษตามหลัง (ท้ายแต่ละไฟล์) ราคาทุกบรรทัดมาจากรายการราคาที่เจ้าของอนุมัติ 2026-11-09 (`docs/PRICING-RESEARCH.md` §3) ไม่รวม VAT 7%
> แพ็กเกจรวมมาจาก `docs/SALES-PACKAGES.md` ซึ่งเป็นร่าง ยังไม่อนุมัติ จึงติดป้าย "ร่าง"
> ห้ามส่งให้ลูกค้าจนกว่าเจ้าของกรอกข้อมูลผู้ขาย (OP-01) ยืนยันสถานะ VAT (OP-02) และให้นักบัญชีกับทนายตรวจ (OP-24)
> ไม่มีไฟล์เดิมถูกแก้ ทุกไฟล์ใหม่อยู่ใน `docs/sales/`

## การตัดสินใจของเจ้าของ 2026-11-13 ที่ใช้กับทุกไฟล์ในชุดนี้

- **ชำระเงิน:** โอนผ่านธนาคารเท่านั้น ไม่มี PromptPay QR บัตร หรือ Opn ราคาไม่รวม VAT 7%
- **ใบเสร็จ:** เจ้าของออกเองจากแม่แบบ ระบบไม่ออกเลขที่ให้ คำถามถึงนักบัญชี (ชุดเลขและใบกำกับภาษี): [`ACCOUNTANT-QUESTIONS-TH.md`](ACCOUNTANT-QUESTIONS-TH.md) หลังนักบัญชียืนยัน แผนคือเปลี่ยนไปใช้เลขจากระบบ `LQ-YYYYMM-000001`
- **ระดับฟรี (ทางเลือก ข):** ดูดวงและเครื่องมือทั่วไปยังฟรี (ผู้ไม่ได้ลงชื่อเข้าใช้ยังได้คำทำนายเต็ม) ผลิตภัณฑ์ธุรกิจทั้งสี่มีระดับฟรีแบบจำกัด เกินกว่านั้นต้องมีใบอนุญาต:
  Gate ทดลอง 30 วัน (1 ช่องทาง 100 ป้ายต่อวัน) · Attendance ฟรีถึง 5 คน · Exam ฟรีถึง 5 ผู้สอบต่อรอบสอบ · Crowd ฟรี 2 ชั่วโมงต่อเครื่องต่อวัน
- **ป้ายราคา (ตัดสิน 2026-11-13 ทางเลือก ข):** ทุกเอกสารแสดงสองระดับ ไม่รวม VAT 7% คือ "ราคานำร่อง" (รายการที่อนุมัติ ใช้ตอนนี้) และ "ราคาปกติหลังผ่านเกณฑ์นำร่อง" (คอลัมน์หลังนำร่องใน `PRICING-RESEARCH.md` §3 ใช้เมื่อไซต์ผ่านเกณฑ์ของตัวเอง) ใบเสนอราคาใช้ราคานำร่องและแสดงราคาปกติไว้ข้างกัน ไม่มีตัวเลขเปลี่ยน
- **ราคาที่อนุมัติ (ไม่รวม VAT 7%):** Gate 490–790 บาทต่อช่องทางต่อเดือน · Attendance 19 บาทต่อคนต่อเดือน (ขั้นต่ำ 190) · Exam 10 บาทต่อผู้สอบ (ขั้นต่ำ 300 ต่อรอบสอบ) หรือ 990 บาทต่อห้องต่อเดือน · Crowd 590 บาทต่อเครื่องต่อวัน
- **ข้อจำกัดยังไม่ถูกบังคับในระบบ:** ระบบสมาชิกและการเรียกเก็บเงินจะสร้างภายหลัง ข้อจำกัดเริ่มใช้ตั้งแต่วันที่จะประกาศ โดยประกาศล่วงหน้าอย่างน้อย 30 วัน
  และเริ่มใช้หลังประกาศ 30 วัน เจ้าของบังคับใช้ผ่านสัญญา **ข้อจำกัดที่ทำงานบนเครื่องของผู้ใช้อาจถูกข้ามได้โดยผู้ที่แก้โค้ด สัญญาเป็นสิ่งที่ผูกพัน** ลูกค้าส่งออกข้อมูลของตนได้เสมอ
- **ใบอนุญาตใช้ออฟไลน์ได้ 14 วัน** (วางแผน ยังไม่สร้าง)
- **บัญชีองค์กรแบบเบา (วางแผน ยังไม่สร้าง):** ชื่อองค์กร ข้อมูลออกบิล ผู้ดูแลและพนักงาน การเชิญ ไม่ซิงก์ข้อมูลบุคคลของลูกค้า
- **แผนในฐานข้อมูล:** เฉพาะ Gate, Attendance, Exam (ห้องคอมพิวเตอร์) และรายงาน Crowd มีแผนสำหรับสั่งซื้อหลังบ้าน ไม่มีซื้อออนไลน์
- **ผู้ติดต่อเรื่องข้อมูลส่วนบุคคล:** จะมีอีเมลแยก (DPO) เจ้าของจะแจ้งที่อยู่ ระหว่างนี้ใช้ LINE @632yliiw และ `[อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล — เจ้าของจะแจ้ง]` (รายการกฎหมาย L61)

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
| | [`ACCOUNTANT-ONE-PAGE-TH.md`](ACCOUNTANT-ONE-PAGE-TH.md) คำถามถึงนักบัญชีฉบับหน้าเดียว (ส่ง LINE/อีเมลได้ทันที) | ส่งก่อนฉบับเต็ม |
| | [`ACCOUNTANT-QUESTIONS-TH.md`](ACCOUNTANT-QUESTIONS-TH.md) คำถามถึงนักบัญชี | ก่อนออกใบเสร็จหรือใบกำกับภาษีจริงครั้งแรก (ชุดเลขที่เอกสาร ใบกำกับภาษี) |
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
| OP-04 | A | รูปแบบเลขที่เอกสารไม่ขาดตอน (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ) ตอนนี้เจ้าของออกเลขเองจากแม่แบบ ระบบไม่ออกเลขให้ (2026-11-13) ชุดเดียว `LQ-YYYYMM-000001` ร่วมกับระบบ หรือแยกชุดสำหรับการโอนเงิน | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | คำถามถึงนักบัญชีอยู่ใน `ACCOUNTANT-QUESTIONS-TH.md` หลังนักบัญชียืนยันจะเปลี่ยนไปใช้เลขจากระบบ `LQ-YYYYMM-000001` |
| OP-05 | A | ภาษีหัก ณ ที่จ่ายของลูกค้านิติบุคคล: อัตรา ฐาน เวลาส่งหนังสือรับรอง (50 ทวิ) | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `BILLING-PLAN.md` §5 ระบุว่ามักหัก 3% · `LEGAL-REVIEW-PACK.md` R4 |
| OP-06 | O | อายุใบเสนอราคา (ร่าง 30 วัน เอกสารแพ็กเกจระบุ 30–60 วัน ยังไม่ยืนยัน) กำหนดชำระ มัดจำ งวดชำระของแพ็กเกจรายปี | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `SALES-PACKAGES.md` A.5 |
| OP-07 | A | ใบเสร็จและใบกำกับภาษีของผู้ขายที่จด VAT: ออกเป็นฉบับเดียวหรือแยก ออกเมื่อใด | ใบแจ้งหนี้ ใบเสร็จ | `BILLING-PLAN.md` §5 (ระบุฟิลด์ที่ต้องมี ไม่ระบุเวลา) |
| OP-08 | O | นิยาม "คนที่ใช้งาน" (Attendance ขั้นต่ำ 190 บาท/เดือน) | ใบเสนอราคา สไลด์ Attendance | `PRICING-RESEARCH.md` §3.4 ไม่นิยามไว้ |
| OP-09 | O | หน้าเว็บและเอกสารต้นทางยังเขียนว่า "ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย" เจ้าของยืนยันว่าเสนอราคาได้แล้ว และอัปเดตป้ายเมื่อพร้อม | ใบเสนอราคา เดโม สไลด์ | `PRICING-RESEARCH.md` หัวเรื่อง · คำสั่งประจำ 2026-11-11 ขายด้วยใบเสนอราคา |
| OP-10 | O, L | **ตัดสินแล้วเรื่องป้ายราคา** (ทางเลือก ข 2026-11-13): แสดง "ราคานำร่อง" และ "ราคาปกติหลังผ่านเกณฑ์นำร่อง" คู่กันทุกเอกสาร ใบเสนอราคาใช้ราคานำร่อง **ยังเปิดอยู่เฉพาะ** ข้อความในสัญญาว่าเมื่อใดไซต์ "ผ่านเกณฑ์" และใครตัดสิน | ใบเสนอราคา ใบแจ้งหนี้ ใบสั่งซื้อ สไลด์ | `PRICING-RESEARCH.md` §3 · `docs/pilot/PILOT-*.md` (เกณฑ์ยังเป็น "ข้อเสนอ") |
| OP-11 | O | แพ็กเกจรวมเป็นร่างยังไม่อนุมัติ: ส่วนลดบันเดิล (คำถาม B-1) ขนาดของใบอนุญาต Exam ในช่วง 30,000–120,000 (B-2) | ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ | `SALES-PACKAGES.md` ท้ายเอกสาร |
| OP-12 | L | ร่าง DPA อยู่ที่ `docs/legal/customer/DPA-TEMPLATE.md` (ร่างสำหรับทนายตรวจ) ต้องให้ทนายตรวจก่อนขายครั้งแรก | ใบเสนอราคา ใบสั่งซื้อ | LENSIQ จะเป็นผู้ประมวลผล (ม.40) เมื่อเข้าถึงอุปกรณ์ระยะไกลหรือซิงก์ |
| OP-13 | O, L | ข้อกำหนดการใช้บริการ การยกเลิก การคืนเงิน ความรับผิด สำหรับการขายด้วยใบเสนอราคา มีเป็นร่างสำหรับทนายตรวจที่ `docs/legal/customer/TERMS-OF-SERVICE-B2B.md` (ยังไม่ใช่ฉบับใช้จริง) และสัญญานำร่อง `docs/pilot/AGREEMENT-TH.md` | ใบเสนอราคา ใบเสร็จ ใบสั่งซื้อ | `SUPPORT.md` §10.4 เป็นแม่แบบคืนเงินของผู้ใช้ทั่วไป |
| OP-14 | L, O | โมเดลใบหน้า (Attendance ตัวเลือกใบหน้า) ฝึกจากชุดข้อมูลวิจัย รอความเห็นทางกฎหมายก่อนใช้เชิงพาณิชย์ จนกว่าจะได้ข้อสรุปไม่เสนอใบหน้าเป็นจุดขาย | ใบสั่งซื้อ เดโม Attendance คู่มือ สไลด์ | `ONE-PAGER-ATTENDANCE.md` PDPA · `DEPLOYMENT-CHECKLIST.md` ข้อ 1 · F5/F6 ใน `PAGE-STATUS.md` |
| OP-15 | P | โหมดเดโม `?demo=1` มีแล้วบน 6 หน้า (exam-lab, exam-dashboard, attendance โหมดพนักงาน, village, parking, crowd) รวมแดชบอร์ด Exam `exam-dashboard.html?demo=1` (ห้อง DEMO 12 ที่นั่ง 18 การแจ้ง tally ตัวอย่าง 8 ถูกจาก 15 เป็นข้อมูลจำลอง ไม่ใช่ความแม่นยำ) ปิดจุดนี้แล้ว 2026-11-13 ทดสอบ `tests/e2e/exam-dashboard-demo.e2e.mjs` | DEMO-SCRIPT-EXAM | — (เสร็จ) |
| OP-16 | O | ช่องทางติดต่อและสนับสนุน (อีเมล LINE OA โทรศัพท์ หน้าสถานะ) ยังไม่ประกาศ | เอกสารทุกฉบับ คู่มือ สไลด์ | `SUPPORT.md` · `lensiq-config.js` `LENSIQ_SELLER` |
| OP-17 | O | แผนสนับสนุนที่ขายและเวลาตอบรับ: ค่าใน `SUPPORT.md` §2–3 อยู่ในวงเล็บ ต่อรองได้ ยังไม่อนุมัติ และไม่มีราคาแผนสนับสนุนในรายการราคาอนุมัติ จึงไม่ใส่ในใบเสนอราคา | คู่มือเริ่มต้น 4 ไฟล์ | `SUPPORT.md` §2–3 |
| OP-18 | O | นิยามหน่วยขาย: "รอบสอบ" "ห้องปฏิบัติการ" (Exam) "วัน" (Crowd) "ช่องทาง" (Gate) | ใบเสนอราคา ใบสั่งซื้อ | `PRICING-RESEARCH.md` §3 ไม่นิยามไว้ |
| OP-19 | O | ค่าเดินทางและติดตั้งนอกพื้นที่ไม่อยู่ในราคาอนุมัติ ไม่มีการเพิ่มบรรทัดเอง (ราคาติดตั้งหน้างาน Gate 2,500 บาทต่อครั้ง) | ใบเสนอราคา ใบสั่งซื้อ สไลด์ Gate | `PRICING-RESEARCH.md` §3.2 |
| OP-20 | P | ระดับฟรีของ Gate (ทดลอง 30 วัน 1 ช่องทาง 100 ป้ายต่อวัน) Attendance (ถึง 5 คน) Exam (ถึง 5 ผู้สอบต่อรอบสอบ) Crowd (2 ชั่วโมงต่อเครื่องต่อวัน) เป็นข้อความ ไม่มีตัวจับเวลาหรือตัวนับในโค้ด ต้องนับเอง เริ่มบังคับตามสัญญาจากวันที่จะประกาศ (ล่วงหน้า 30 วันขึ้นไป) | เดโม Gate คู่มือ Gate สไลด์ Gate | `PRICING-RESEARCH.md` §3.2 |
| OP-21 | O | สถานะ Crowd: คำสั่งงานเรียกว่าทดลอง ขณะ `PAGE-STATUS.md` ให้ "พร้อมนำร่อง" เฉพาะคนเบาบางถึงปานกลาง ชุดนี้ใช้ทั้งสองคำ ตัวเลขเป็นผลเบื้องต้นเทียบ AI รอผลคนนับ (C8) | เดโม Crowd สไลด์ Crowd | `CROWD-ACCURACY.md` |
| OP-22 | L | Exam กับผู้สอบที่ยังไม่บรรลุนิติภาวะ: ขั้นตอนความยินยอมของผู้ปกครอง | ใบสั่งซื้อ | `SALES-PACKAGES.md` C.7 |
| OP-23 | L | การลบข้อมูลเมื่อสิ้นสุดสัญญาและเวลาแจ้งเหตุละเมิด (ค่า [30 วัน] [24 ชม.] อยู่ในวงเล็บ ต่อรองได้) | ใบสั่งซื้อ | `SUPPORT.md` §5 |
| OP-24 | L, A | เอกสารทั้งชุดต้องให้ทนายและนักบัญชีตรวจก่อนขาย (PDPA กฎหมายแรงงาน การโฆษณาความแม่นยำ ภาษี) | ทุกไฟล์ | `CLAUDE.md` "A lawyer reviews before sale" · `docs/PDPA-NOTES-FOR-COUNSEL.md` |
| OP-25 | O | Exam ห้องคอมพิวเตอร์ยังดูสดข้ามเครื่องไม่ได้ (ไม่มีปลายทาง relay) ต้องส่งออกไฟล์หลังสอบ เจ้าของยอมรับสำหรับนำร่องแล้ว ต้องยืนยันว่าจะบอกลูกค้าที่ซื้อจริงอย่างไร | เดโม Exam คู่มือ Exam | `docs/pilot/PILOT-EXAM.md` §2 · `docs/EXAM.md` "Transport and privacy" |
| OP-26 | O, L | ข้อความในสัญญาเรื่องข้อจำกัดระดับฟรี: วันเริ่ม การประกาศล่วงหน้า 30 วัน เริ่มใช้หลังประกาศ 30 วัน สิทธิ์ส่งออกข้อมูลเสมอ และการที่ข้อจำกัดบนเครื่องผู้ใช้ถูกข้ามได้ (สัญญาเป็นตัวผูกพัน) | ใบเสนอราคา ใบสั่งซื้อ สไลด์ ใบปลิว | รายการกฎหมาย L62 · เจ้าของตัดสิน 2026-11-13 |
| OP-27 | O | อีเมลผู้ติดต่อเรื่องข้อมูลส่วนบุคคล (DPO) แยกต่างหาก เจ้าของจะแจ้งที่อยู่ ระหว่างนี้ใช้ LINE @632yliiw | ใบสั่งซื้อ ข้อกำหนด ประกาศความเป็นส่วนตัว DPA | รายการกฎหมาย L61 |

## ข้อมูลที่ไม่พบในที่เก็บ (ไม่ได้แต่งเอง)

ชื่อบริษัทผู้ขาย เลขผู้เสียภาษี ที่อยู่ บัญชีธนาคาร ผู้ติดต่อ · ข้อกำหนดการขาย (ร่างข้อกำหนดการให้บริการอยู่ที่ `docs/legal/customer/`) · ราคาแผนสนับสนุน · ราคาค่าเดินทาง · นิยามหน่วยขาย · ลูกค้าอ้างอิง (ไม่มี ไม่ได้ใส่) · ผลหน้างานจริงของทุกผลิตภัณฑ์

---

# English

> **DRAFT 2026-11-11.** The "Sellable pack" under the owner's standing order (CLAUDE.md). The owner sells by quotation and bank transfer only (no PromptPay QR, no card, no Opn, no online payment; owner decision 2026-11-13). Thai first, English
> after it in each file. Every price line comes from the approved list of 2026-11-09 (`docs/PRICING-RESEARCH.md` §3), excluding 7% VAT. Combined packages come from `docs/SALES-PACKAGES.md`,
> a draft, so they carry a "draft" label. Do not send anything to a customer until the owner fills the seller details (OP-01), confirms VAT status (OP-02), and an accountant and a lawyer have
> reviewed it (OP-24). No existing file was edited; every file is new and under `docs/sales/`.

## Owner decisions of 2026-11-13 that apply to every file in this kit

- **Payment:** bank transfer only. No PromptPay QR, card or Opn. Prices exclude 7% VAT.
- **Receipts:** the owner issues them from the template; the system does not number them. Questions for the accountant (numbering series and tax invoice): `ACCOUNTANT-QUESTIONS-TH.md` (Thai). After the accountant confirms, the plan is to switch to system numbering `LQ-YYYYMM-000001`.
- **Free tiers (option B):** Fortune and the general tools stay free (signed-out users keep the full fortune reading). The four business products have a limited free tier; beyond it a licence is needed:
  Gate 30-day trial (1 lane, 100 plates per day) · Attendance free up to 5 people · Exam free up to 5 candidates per session · Crowd free 2 hours per device per day.
- **Price labels (decided 2026-11-13, option B):** every document shows both levels, excl. 7% VAT: the "pilot price" (approved list, used now) and the "regular price after the pilot thresholds are met" (the after-pilot column of `PRICING-RESEARCH.md` §3, used once a site passes its own thresholds). Quotations use the pilot price and show the regular price beside it. No number changed.
- **Approved prices (excl. 7% VAT):** Gate 490-790 THB per lane per month · Attendance 19 THB per person per month (minimum 190) · Exam 10 THB per candidate (minimum 300 per session) or 990 THB per room per month · Crowd 590 THB per device per day.
- **The limits are not enforced in the product yet:** membership and billing come later. The limits apply from a date to be announced, with at least 30 days' notice, and start 30 days after the announcement. The owner enforces them by contract.
  **A limit that runs on the user's device can be bypassed by someone who edits the code; the contract is what binds.** Customers can always export their own data.
- **A licence works offline for 14 days** (planned, not built).
- **Organisation accounts (lite), planned, not built:** organisation name, billing details, admins and staff, invitations. No syncing of the customer's people data.
- **Plans in the database:** only Gate, Attendance, Exam (lab room) and Crowd report get back-office order plans. No online purchase.
- **Privacy contact:** a separate privacy-contact (DPO) e-mail will be added; the owner will send the address. Until then documents show LINE @632yliiw and `[privacy contact e-mail: the owner will provide]` (legal item L61).

## Index

| Group | Files | Use when |
|---|---|---|
| Financial documents | `QUOTATION-TEMPLATE.md`, `INVOICE-TEMPLATE.md`, `RECEIPT-TEMPLATE.md`, `ORDER-FORM.md`, `ACCOUNTANT-QUESTIONS-TH.md` (questions for the accountant, Thai) | Quote (with the allowed price table and a worked example per product), invoice after acceptance, receipt after the transfer arrives, order form with the data-processing acknowledgement in section 6 |
| 10-minute demos | `DEMO-SCRIPT-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | Customer meetings: sample data only; each has a "do NOT claim" list |
| Onboarding | `ONBOARDING-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | After purchase: install, first day, common problems, who to contact |
| Sales decks | `DECK-EXAM.md`, `-ATTENDANCE.md`, `-GATE.md`, `-CROWD.md` | 8–10 slides separated by `---`; measured claims only, each with source and file |

Suggested order: deck or demo, quotation, order form, invoice, receipt, onboarding guide.

## Open points (all marked in the files by **[to confirm]** or an OP code)

Deciders: owner (O), accountant (A), lawyer (L), product team (P). The table above (Thai) carries the full wording, location and source for each. In short:

- **OP-01 (O)** Seller details (company name, tax ID, address, branch, bank account, contacts) are [bracket] fields; none invented.
- **OP-02 (O, A)** Is the seller VAT-registered? Form V (VAT line) or Form N (none). A tax invoice needs registration. `BILLING-PLAN.md` §5; `LEGAL-REVIEW-PACK.md` R1.
- **OP-03 (A)** Tax-invoice format: from an accounting system or e-Tax Invoice by Email (R2).
- **OP-04 (A)** Gap-free document numbering for quotation, invoice and receipt. Today the owner numbers documents by hand from the templates and the system does not number them (2026-11-13). One series `LQ-YYYYMM-000001` shared with the system, or a separate series for transfers: questions in `ACCOUNTANT-QUESTIONS-TH.md`; after the accountant confirms, the plan is to switch to system numbering `LQ-YYYYMM-000001`.
- **OP-05 (A)** Withholding tax by juristic customers: rate, base, timing of the certificate (R4; BILLING-PLAN notes 3%).
- **OP-06 (O)** Quotation validity (draft 30 days; SALES-PACKAGES says 30–60, unverified), payment due date, deposit, instalments of yearly packages.
- **OP-07 (A)** For a VAT-registered seller: one combined receipt / tax invoice or two documents, and when.
- **OP-08 (O)** Definition of "active person" (Attendance minimum 190 THB per month).
- **OP-09 (O)** Product pages and source docs still say "approved price list, not on sale yet"; the owner confirms quoting may start and updates the labels.
- **OP-10 (O, L)** **Decided 2026-11-13 (option B):** both price levels are shown everywhere, clearly labelled, excl. 7% VAT: the "pilot price" (the approved list) and the "regular price after the pilot thresholds are met" (the after-pilot column of `docs/PRICING-RESEARCH.md` §3). Quotations use the pilot price and show the regular price beside it. No number changed. Still open: the contract wording on when a site has "passed" the pilot thresholds and who decides.
- **OP-11 (O)** Combined packages are draft: bundle discount (B-1) and Exam licence size bands inside 30,000–120,000 (B-2).
- **OP-12 (L)** A DPA draft exists at `docs/legal/customer/DPA-TEMPLATE.md` ("draft for legal review", not final); the order form also points to `SUPPORT.md` §5 and `PDPA-NOTES-FOR-COUNSEL.md` E3. Counsel must review it before the first sale.
- **OP-13 (O, L)** Sales terms (service, cancellation, refund, liability) exist as a draft for legal review, `docs/legal/customer/TERMS-OF-SERVICE-B2B.md` (not final), besides the pilot agreement.
- **OP-14 (L, O)** Face model licence (Attendance face option) awaits legal opinion; the face option is not offered as a selling point until then.
- **OP-15 (P)** Demo mode `?demo=1` is available on `exam-lab.html`, `exam-dashboard.html`, `attendance.html?mode=employee`, `village.html`, `parking.html`, `crowd.html`.
  Closed 2026-11-13: `exam-dashboard.html?demo=1` opens a pre-filled sample board (room DEMO, 12 seats, 18 flags, simulated tally 8 right out of 15, which is not a measured accuracy); test `tests/e2e/exam-dashboard-demo.e2e.mjs`.
- **OP-16 (O)** Contact and support channels (e-mail, LINE OA, phone, status page) not announced.
- **OP-17 (O)** Support plan sold and response times: `SUPPORT.md` §2–3 values are bracketed drafts, and no support price is in the approved list, so none is quoted.
- **OP-18 (O)** Definition of units: "exam session" and "lab" (Exam), "day" (Crowd), "lane" (Gate).
- **OP-19 (O)** Travel and out-of-area installation are not in the approved prices; no line was added.
- **OP-20 (P)** The free tiers (Gate 30-day trial, 1 lane, 100 plates per day; Attendance up to 5 people; Exam up to 5 candidates per session; Crowd 2 hours per device per day) are text only; there is no timer or counter in the code. They are enforced by contract from a date to be announced, at least 30 days ahead.
- **OP-21 (O)** Crowd status: the task calls it experimental while `PAGE-STATUS.md` rates it pilot-ready for sparse-to-medium crowds; the kit uses both words. Figures are preliminary against an AI reference.
- **OP-22 (L)** Exam with minors: parental-consent step.
- **OP-23 (L)** Data deletion at the end of a contract and breach notice times (bracketed [30 days], [24 h]).
- **OP-24 (L, A)** The whole kit needs a lawyer and an accountant before sale.
- **OP-25 (O)** Exam computer-room mode has no live cross-device feed (no relay endpoint); the owner accepted it for the pilot; confirm what to tell paying customers.
- **OP-26 (O, L)** Contract wording for the free-tier limits: start date, 30 days' notice, start 30 days after the announcement, the right to export data at any time, and the fact that a limit on the user's device can be bypassed (the contract binds). Legal item L62.
- **OP-27 (O)** A separate privacy-contact (DPO) e-mail; the owner will send it. Until then LINE @632yliiw. Legal item L61.

**Not found in the repository (not invented):** seller company details, bank account, a lawyer-approved DPA and sales terms (only drafts exist), support price, travel price, unit definitions, reference customers, field results for any product.

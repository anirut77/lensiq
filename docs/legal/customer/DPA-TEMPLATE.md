# ข้อตกลงการประมวลผลข้อมูลส่วนบุคคล (DPA) / Data Processing Agreement

> **ร่างสำหรับทนายตรวจ — ยังไม่ใช่ฉบับใช้จริง / Draft for legal review — not final**
>
> เวอร์ชัน 0.1 (ร่าง) · จัดทำ 2026-11-11 · ไม่ใช่คำแนะนำทางกฎหมาย
> แม่แบบแนว พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 40 ข้อความใน [วงเล็บ] ให้คู่สัญญากรอก
> ส่วน [คำถามสำหรับทนาย: ...] คือจุดที่ยังไม่แน่ใจ ตอบคำถาม G1 ใน `docs/LEGAL-REVIEW-PACK.md` (ขอแม่แบบ DPA)
>
> *Version 0.1 (draft) · prepared 2026-11-11 · not legal advice. A s.40-style template under the Thai PDPA B.E. 2562.
> Fill the [brackets]. [Question for counsel: ...] marks open legal points. This answers the request in G1 of `docs/LEGAL-REVIEW-PACK.md`.*
>
> ฐานของเอกสาร / Based on: `docs/SUPPORT.md` section 5, `docs/pilot/AGREEMENT-TH.md` section 6, `docs/ORG-ACCOUNTS-DESIGN.md` sections 8-10,
> `docs/AI-GATEWAY.md`, `docs/pdpa/retention-table.md`, `docs/pdpa/INCIDENT-RESPONSE.md`, `SECURITY.md`, `backend/src/retention.js`, CTO-BRIEF L1-L9, L22, L48, L50, L51

---

# ส่วนที่ 1: ภาษาไทย

## ข้อ 1 คู่สัญญา

**ผู้ควบคุมข้อมูลส่วนบุคคล (“ลูกค้า”):** [ชื่อนิติบุคคล] เลขทะเบียน [เลข 13 หลัก] ที่อยู่ [ที่อยู่] ผู้ติดต่อ [ชื่อ / อีเมล]
**ผู้ประมวลผลข้อมูลส่วนบุคคล (“ผู้ให้บริการ”):** [ชื่อนิติบุคคล] เลขทะเบียน [เลข 13 หลัก] ที่อยู่ [ที่อยู่] ผู้ติดต่อด้านข้อมูลส่วนบุคคล [ชื่อ / อีเมล]
**สัญญาหลัก:** ข้อกำหนดการให้บริการสำหรับองค์กร / ใบเสนอราคาเลขที่ [..] ลงวันที่ [..] (“สัญญาหลัก”)

## ข้อ 2 ใช้เมื่อใด และขอบเขต

2.1 โดยค่าเริ่มต้น ผลิตภัณฑ์ **ประมวลผลภาพบนอุปกรณ์ของลูกค้า** และผู้ให้บริการ **ไม่ได้รับ** ข้อมูลส่วนบุคคล ข้อตกลงนี้จึงใช้เฉพาะเมื่อผู้ให้บริการ
เข้าถึงหรือประมวลผลข้อมูลส่วนบุคคลของลูกค้า ได้แก่ (ติ๊กที่ใช้)
☐ การช่วยเหลือทางไกล/สนับสนุนหน้างานที่ทำให้เห็นข้อมูล
☐ ศูนย์รวมข้อมูลตัวเลข (`server.py`) ที่ผู้ให้บริการโฮสต์
☐ โครงการทดลองที่มีการบันทึกวิดีโอ (เฉพาะนับคน; ดู `PILOT-AGREEMENT.md`)
☐ บัญชีองค์กรและการซิงก์ข้ามอุปกรณ์บน Cloudflare (**ยังไม่เปิดให้บริการ** รายการนี้ใช้ได้เมื่อเปิดแล้วเท่านั้น)
☐ บริการ AI ภายนอก (ตัวเลือก ปิดเป็นค่าเริ่มต้น; **ปัจจุบัน Exam, Attendance, Gate และ Crowd ไม่เรียกบริการ AI**)

2.2 รายละเอียดข้อมูล เจ้าของข้อมูล และวัตถุประสงค์อยู่ในภาคผนวก 1 ถ้ามีรายการใดนอกภาคผนวก ต้องแก้ภาคผนวกเป็นหนังสือก่อนเริ่มประมวลผล

## ข้อ 3 คำสั่งของผู้ควบคุมข้อมูล

3.1 ผู้ให้บริการประมวลผลข้อมูลส่วนบุคคลเฉพาะตามคำสั่งเป็นหนังสือของลูกค้า (สัญญาหลัก ข้อตกลงนี้ และคำสั่งเพิ่มเติมทางอีเมลที่ลูกค้าส่งจากผู้ติดต่อที่ระบุ)
เว้นแต่กฎหมายกำหนดเป็นอย่างอื่น ซึ่งต้องแจ้งลูกค้าก่อนถ้ากฎหมายไม่ห้าม

3.2 ผู้ให้บริการจะแจ้งลูกค้าถ้าเห็นว่าคำสั่งใดอาจขัดกฎหมาย

3.3 ลูกค้ารับรองว่ามีฐานทางกฎหมาย ได้แจ้งเจ้าของข้อมูล และได้ขอความยินยอมที่จำเป็นแล้ว (ดู `PRIVACY-NOTICE-TEMPLATE.md`, `CONSENT-FORMS.md`)
**ผู้ให้บริการไม่ประมวลผลเพื่อ** วิเคราะห์อารมณ์ ตรวจจับการโกหก หรือตัดสินใจเกี่ยวกับบุคคลโดยอัตโนมัติ และไม่ใช้ข้อมูลเพื่อวัตถุประสงค์ของตนเอง ฝึกโมเดล หรือการตลาด

## ข้อ 4 หน้าที่ของผู้ให้บริการ (ตามมาตรา 40)

4.1 **ประมวลผลตามคำสั่ง** ตามข้อ 3
4.2 **รักษาความลับ** บุคลากรที่เข้าถึงข้อมูลต้องผูกพันการรักษาความลับเป็นหนังสือ และเข้าถึงเท่าที่จำเป็น
4.3 **มาตรการรักษาความปลอดภัย** ตามภาคผนวก 4 และตรวจทบทวนอย่างน้อยปีละครั้ง
4.4 **แจ้งเหตุละเมิด** ตามข้อ 7
4.5 **บันทึกรายการประมวลผล** ผู้ให้บริการจัดทำและเก็บบันทึกรายการประมวลผลที่ทำในนามลูกค้า (หมวดข้อมูล ผู้รับ การส่งไปต่างประเทศ มาตรการ) และให้ลูกค้าดูเมื่อขอ
[คำถามสำหรับทนาย: ตรวจเลขอนุมาตราของมาตรา 40 และรายการที่ต้องมีในบันทึก]
4.6 **ช่วยเหลือลูกค้า** ตอบคำขอของเจ้าของข้อมูล (ข้อ 8) ช่วยทำ DPIA และปรึกษากับ สคส. เมื่อลูกค้าร้องขอ
4.7 **ไม่ขอข้อมูลใบหน้า** ผู้ให้บริการไม่ขอให้ลูกค้าส่งออกข้อมูลใบหน้า (ค่าลักษณะใบหน้า) เพื่อสนับสนุน ไฟล์วินิจฉัยต้องไม่มีข้อมูลชีวมิติ
ภาพหน้าจอจะถ่ายเฉพาะเมื่อลูกค้ายินยอม และลบเมื่อแก้ปัญหาเสร็จ [ภายใน [..] วัน]

## ข้อ 5 ผู้ประมวลผลช่วง

5.1 ลูกค้าอนุญาตให้ผู้ให้บริการใช้ผู้ประมวลผลช่วงตามรายชื่อในภาคผนวก 2 เท่านั้น
5.2 ผู้ให้บริการแจ้งลูกค้าล่วงหน้าอย่างน้อย [30] วันก่อนเพิ่มหรือเปลี่ยนผู้ประมวลผลช่วง ลูกค้าคัดค้านด้วยเหตุผลสมควรได้ภายใน [14] วัน
ถ้าตกลงกันไม่ได้ ลูกค้าบอกเลิกบริการส่วนที่เกี่ยวข้องและรับคืนค่าบริการตามสัดส่วนที่ยังไม่ได้ใช้
5.3 ผู้ให้บริการทำสัญญากับผู้ประมวลผลช่วงที่มีภาระด้านการคุ้มครองข้อมูลไม่น้อยกว่าข้อตกลงนี้ และรับผิดต่อลูกค้าในการปฏิบัติของผู้ประมวลผลช่วงเหล่านั้น
[คำถามสำหรับทนาย: L50 ผู้ให้บริการยังไม่ได้ตรวจเงื่อนไขการประมวลผลของแต่ละรายครบ ผู้ให้บริการจะรับผิดต่อลูกค้าในขอบเขตใดเมื่อผู้ประมวลผลช่วงเป็นบริษัทต่างประเทศที่ใช้ข้อตกลงมาตรฐานของตนเอง]
5.4 **บริการ AI ภายนอก** ผู้ให้บริการส่งข้อมูลไปยังผู้ให้บริการ AI ก็ต่อเมื่อ (ก) ลูกค้าติ๊กเปิดในภาคผนวก 2 เป็นหนังสือ (ข) ผู้ใช้ปลายทางยินยอมในหน้าจอที่ระบุชื่อผู้ให้บริการ ประเทศที่ประมวลผล และการเก็บข้อมูลของผู้ให้บริการนั้น
และ (ค) ส่งเฉพาะ **ข้อเท็จจริงที่สกัดแล้ว** ไม่ส่งภาพบุคคล (ยกเว้นข้อยกเว้นเรื่องภาพที่ลูกค้าอนุมัติแยกต่างหากเป็นหนังสือ)

## ข้อ 6 การส่งข้อมูลไปต่างประเทศ (มาตรา 28–29)

6.1 ผู้ให้บริการไม่ส่งข้อมูลส่วนบุคคลของลูกค้าออกนอกประเทศไทย ยกเว้นผ่านผู้ประมวลผลช่วงในภาคผนวก 2 ที่ลูกค้าอนุญาต
6.2 กลไกที่ใช้: [ระบุ เช่น ข้อสัญญามาตรฐาน / ความยินยอมที่ลูกค้าขอจากเจ้าของข้อมูล / มาตรการคุ้มครองที่เหมาะสมตามประกาศ คปช.]
[คำถามสำหรับทนาย: P6, L9, L22, L48 กลไกที่ยอมรับได้สำหรับ (ก) Cloudflare (บริษัทสหรัฐฯ D1 มีเพียงตัวเลือกพื้นที่ `apac` ไม่มีตัวเลือกประเทศไทย) (ข) ผู้ให้บริการ AI แต่ละราย และ (ค) หน่วยงานรัฐที่อาจต้องใช้ที่เก็บข้อมูลในไทย]

## ข้อ 7 การแจ้งเหตุละเมิดข้อมูลส่วนบุคคล

7.1 ผู้ให้บริการแจ้งลูกค้า **โดยไม่ชักช้า และไม่เกิน [24] ชั่วโมง** นับแต่ทราบหรือมีเหตุอันควรเชื่อว่าเกิดเหตุละเมิดที่เกี่ยวกับข้อมูลของลูกค้า
เพื่อให้ลูกค้าแจ้ง สคส. ภายใน 72 ชั่วโมงได้ (มาตรา 37(4)) [คำถามสำหรับทนาย: P9 ยืนยันระยะเวลา 24 ชั่วโมงของผู้ประมวลผล]

7.2 การแจ้งประกอบด้วย ข้อเท็จจริงที่ทราบ ลักษณะของเหตุ หมวดและจำนวนโดยประมาณของข้อมูลและเจ้าของข้อมูลที่เกี่ยวข้อง ผลที่อาจเกิดขึ้น มาตรการที่ทำแล้วและจะทำ
และผู้ติดต่อ ถ้ายังไม่ครบ ให้แจ้งเท่าที่มีก่อนแล้วเพิ่มภายหลัง

7.3 ผู้ให้บริการเก็บหลักฐาน จำกัดความเสียหาย และร่วมตรวจสอบกับลูกค้า ตามขั้นตอนใน `docs/pdpa/INCIDENT-RESPONSE.md`
ผู้ให้บริการไม่แจ้ง สคส. หรือเจ้าของข้อมูลแทนลูกค้า เว้นแต่ลูกค้าสั่งหรือกฎหมายบังคับ

## ข้อ 8 สิทธิของเจ้าของข้อมูล

8.1 ถ้าเจ้าของข้อมูลติดต่อผู้ให้บริการโดยตรง ผู้ให้บริการส่งคำขอต่อให้ลูกค้าภายใน [3] วันทำการ และไม่ตอบแทนลูกค้า เว้นแต่ลูกค้าสั่ง
8.2 ผู้ให้บริการช่วยให้ลูกค้าตอบคำขอ (เข้าถึง แก้ไข ลบ คัดค้าน โอนย้าย) ภายใน [10] วันทำการนับจากที่ลูกค้าร้องขอ ด้วยเครื่องมือส่งออก/ลบในผลิตภัณฑ์
เมื่อข้อมูลอยู่บนอุปกรณ์ของลูกค้า ลูกค้าดำเนินการเองและผู้ให้บริการไม่มีสำเนา

## ข้อ 9 การเก็บรักษา การคืน และการลบข้อมูล

9.1 ระยะเวลาเก็บเป็นไปตามภาคผนวก 3
9.2 เมื่อสัญญาหลักสิ้นสุดหรือเมื่อลูกค้าร้องขอ ผู้ให้บริการ (ก) ให้ลูกค้าส่งออกข้อมูลที่ผู้ให้บริการถือ (CSV/JSON) ภายใน [30] วัน (ข) ลบข้อมูลทั้งหมดรวมสำเนาสำรอง
ภายใน [30] วันหลังนั้น (ค) ยืนยันการลบเป็นหนังสือ ยกเว้นข้อมูลที่กฎหมายกำหนดให้เก็บ ซึ่งผู้ให้บริการแจ้งลูกค้าว่าเก็บรายการใด เก็บนานเท่าใด และเพราะเหตุใด
9.3 วิดีโอจากโครงการทดลองลบตามกำหนดในสัญญาทดลอง ต่อหน้าผู้แทนลูกค้า และบันทึกการลบ
9.4 อุปกรณ์ของลูกค้าที่ผู้ให้บริการเข้าถึงชั่วคราว ผู้ให้บริการไม่ทิ้งสำเนาข้อมูลไว้บนอุปกรณ์ของตน

## ข้อ 10 การตรวจสอบ

10.1 ผู้ให้บริการให้ข้อมูลที่จำเป็นเพื่อแสดงว่าปฏิบัติตามข้อตกลงนี้ (บันทึกรายการ บันทึกตรวจสอบ ผลทดสอบความปลอดภัยที่มี)
10.2 ลูกค้าตรวจสอบได้ปีละไม่เกิน 1 ครั้ง แจ้งล่วงหน้า [30] วัน เริ่มจากการตรวจเอกสาร และตรวจหน้างานเมื่อจำเป็น โดยลูกค้าออกค่าใช้จ่ายของตน
และผู้ตรวจรักษาความลับ ตรวจเพิ่มได้เมื่อเกิดเหตุละเมิดหรือเมื่อ สคส. ร้องขอ

## ข้อ 11 ความรับผิด

11.1 ความรับผิดของแต่ละฝ่ายต่อกันภายใต้ข้อตกลงนี้เป็นไปตามข้อ 10 ของสัญญาหลัก [หรือ: เพดานแยกสำหรับการละเมิดข้อมูล [..]]
[คำถามสำหรับทนาย: G1 เพดานที่เหมาะสมสำหรับความรับผิดด้านข้อมูลส่วนบุคคล และการแบ่งความรับผิดระหว่างผู้ควบคุมกับผู้ประมวลผลตามมาตรา 77–78]
11.2 ผู้ให้บริการไม่รับผิดต่อความเสียหายที่เกิดจากการที่ลูกค้าไม่มีฐานทางกฎหมาย ไม่ติดป้าย หรือไม่ขอความยินยอมตามที่กฎหมายกำหนด หรือจากคำสั่งที่ผิดกฎหมายของลูกค้า

## ข้อ 12 ระยะเวลา และกฎหมาย

12.1 ข้อตกลงมีผลตั้งแต่วันที่ลงนามจนกว่าผู้ให้บริการจะลบหรือส่งคืนข้อมูลครบตามข้อ 9
12.2 ขัดกันกับสัญญาหลัก ให้ข้อตกลงนี้ใช้ในเรื่องการคุ้มครองข้อมูลส่วนบุคคล
12.3 กฎหมายไทย ศาลที่มีเขตอำนาจใน [กรุงเทพมหานคร] ตามสัญญาหลัก

## ลงนาม

| ลูกค้า (ผู้ควบคุมข้อมูล) | ผู้ให้บริการ (ผู้ประมวลผลข้อมูล) |
|---|---|
| ลงชื่อ ______________________ | ลงชื่อ ______________________ |
| ( [ชื่อ] ) ตำแหน่ง [ตำแหน่ง] | ( [ชื่อ] ) ตำแหน่ง [ตำแหน่ง] |
| วันที่ __________ | วันที่ __________ |

---

## ภาคผนวก 1: รายละเอียดการประมวลผล (ไทย)

| หัวข้อ | Exam (ห้องปฏิบัติการ) | Attendance | Gate | Crowd |
|---|---|---|---|---|
| เจ้าของข้อมูล | ผู้เข้าสอบ ผู้คุมสอบ | พนักงาน ผู้เข้าอบรม ผู้จัดการ | คนขับ ผู้พักอาศัย ผู้มาติดต่อ เจ้าหน้าที่ รปภ. | ผู้เข้าร่วมงาน (ไม่ระบุตัวตน) |
| ข้อมูลบนอุปกรณ์ลูกค้า (ผู้ให้บริการไม่ได้รับโดยค่าเริ่มต้น) | บันทึกเหตุการณ์ (เวลา ที่นั่ง สัญญาณ ผล ชื่อผู้คุมสอบ); คลิปหลักฐานเข้ารหัส (ถ้าเปิด) | ชื่อ รหัส เวลาเข้า-ออก; ค่า PIN แบบแฮช; ค่าลักษณะใบหน้า (ถ้ายินยอม) | เลขทะเบียน จังหวัด เวลา จุด ชื่อผู้ยืนยัน ค่าบริการ บ้านเลขที่ ชื่อผู้มาติดต่อ (ถ้ามี) รายการห้ามเข้า | ตัวเลขนับ ไม่มีภาพ ไม่มีรหัสติดตามบุคคล |
| ข้อมูลที่ผู้ให้บริการอาจเข้าถึงเมื่อใช้บริการตามข้อ 2.1 | เห็นหน้าจอชั่วคราวขณะช่วยเหลือ; วิดีโอทดลอง (ถ้ามี) | เห็นหน้าจอชั่วคราว; ข้อมูลที่ซิงก์ (เมื่อเปิดบริการ) | เห็นหน้าจอชั่วคราว; ข้อมูลที่ซิงก์ (เมื่อเปิดบริการ) | ตัวเลขสถิติบนศูนย์รวม; วิดีโอทดลอง (เฉพาะนับคน ถ้ามี) |
| ข้อมูลอ่อนไหว/ชีวมิติ | ไม่มี (ไม่สร้างค่าลักษณะใบหน้า) | ค่าลักษณะใบหน้า (มาตรา 26) **อยู่บนอุปกรณ์เท่านั้นโดยค่าเริ่มต้น** | ไม่มี | ไม่มี |
| วัตถุประสงค์ | ช่วยผู้คุมสอบ | ลงเวลา/เช็คชื่อ | คิดค่าจอด ควบคุมการเข้าออก | ประมาณจำนวนและความหนาแน่น |
| ลักษณะการประมวลผล | ตามข้อ 2.1 เท่านั้น: เข้าถึงชั่วคราว จัดเก็บ ส่งออก ลบ | เหมือนกัน | เหมือนกัน | เหมือนกัน |

**ที่ไม่ประมวลผลเลย:** อารมณ์/สีหน้า การตรวจจับการโกหก การระบุตัวตนบุคคลในพื้นที่สาธารณะ การตัดสินใจอัตโนมัติ

## ภาคผนวก 2: ผู้ประมวลผลช่วง (ไทย)

| # | ผู้ประมวลผลช่วง | ทำอะไร | ประเทศ/พื้นที่ | ใช้เมื่อ | สถานะการตรวจเงื่อนไข |
|---|---|---|---|---|---|
| 1 | Cloudflare, Inc. (Workers, D1, Turnstile) | โฮสต์ระบบหลังบ้านและฐานข้อมูล | สหรัฐอเมริกา/ทั่วโลก; D1 มีตัวเลือกพื้นที่ `apac` | เมื่อใช้บัญชีองค์กรหรือฟังก์ชันออนไลน์ [☐ ใช้] | [รอตรวจข้อตกลงประมวลผลของ Cloudflare — L22, L50] |
| 2 | [ผู้ให้บริการอีเมล] | ส่งอีเมลธุรกรรม (ไม่มีเนื้อหาข้อมูลของโมดูล) | [..] | เมื่อเปิดอีเมล [☐ ใช้] | [รอข้อมูล] |

**ผู้ให้บริการ AI** (ใช้ได้เฉพาะรายที่ลูกค้าติ๊ก และเฉพาะฟีเจอร์ที่ลูกค้าเปิด ปัจจุบันไม่มีฟีเจอร์ของ Exam, Attendance, Gate, Crowd ที่เรียกบริการเหล่านี้):

| ☐ | ผู้ให้บริการ | ประเทศประมวลผล (ตามที่ระบบแจ้งผู้ใช้ในหน้าขอความยินยอม) | การเก็บข้อมูลที่ผู้ให้บริการแจ้ง | รายการตรวจ |
|---|---|---|---|---|
| ☐ | Anthropic (Claude) | สหรัฐอเมริกา/เส้นทางทั่วโลก | เก็บถึง 30 วันตามข้อกำหนดผู้ให้บริการ | L1 |
| ☐ | Google (Gemini API, แบบเสียเงินเท่านั้น) | ไม่ระบุที่ตั้งข้อมูล | ตามข้อกำหนดแบบเสียเงิน | L2 |
| ☐ | OpenAI | จัดเก็บและประมวลผลอาจอยู่คนละประเทศ | บันทึกตรวจการละเมิดสูงสุด 30 วัน | L3 |
| ☐ | Alibaba Model Studio (Qwen) | สิงคโปร์ (ระบุ workspace) | ไม่ระบุระยะเวลา | L4 |
| ☐ | DeepSeek | **จีน** และอาจใช้ฝึกโมเดลตามนโยบายความเป็นส่วนตัวของผู้ให้บริการ | เก็บในประเทศจีน | L5 **(ข้อเสนอ: ไม่เปิดให้ลูกค้า — [คำถามสำหรับทนาย])** |
| ☐ | Zhipu (z.ai) | สิงคโปร์ | DPA ผู้ให้บริการระบุว่าไม่เก็บเนื้อหา | L6 |
| ☐ | Moonshot (Kimi) | ยังไม่ยืนยัน | ไม่เก็บเฉพาะแบบองค์กร | L7 |
| ☐ | OpenRouter (ตัวกลางเส้นทาง) | เพิ่ม **ผู้ประมวลผลรายที่สอง**; ระบบบังคับ “ไม่เก็บ/ไม่ใช้ฝึก” ทุกครั้ง | เส้นทางที่ใช้จริงอาจเป็น Google Cloud Vertex AI หรือ Microsoft Azure | L8, L50 |

หมายเหตุ: รายชื่อข้างต้นคือผู้ให้บริการที่ระบบเชื่อมได้ ผู้ให้บริการเปิดให้ลูกค้าเฉพาะรายที่ติ๊ก เงื่อนไขของแต่ละรายยังอยู่ระหว่างตรวจโดยทนาย (L1–L9, L48, L50)
ผู้ให้บริการไม่ส่งข้อมูลส่วนบุคคลของลูกค้าไปยังรายที่ยังไม่ผ่านการตรวจ จนกว่าทนายยืนยัน

## ภาคผนวก 3: ระยะเวลาเก็บ (ไทย)

**ก) ข้อมูลบนอุปกรณ์ของลูกค้า (ลูกค้าเป็นผู้ตั้งค่าและควบคุม ค่าเริ่มต้นของผลิตภัณฑ์)**

| ผลิตภัณฑ์ | ข้อมูล | ค่าเริ่มต้น | ตั้งได้ | แหล่งที่มา |
|---|---|---|---|---|
| Exam | บันทึกเหตุการณ์ | เป็นไปตามระเบียบสถาบัน (แม่แบบประกาศ: ไม่เกิน 90 วัน) | ลบเองได้ | `docs/EXAM.md`, notes B1 |
| Exam | คลิปหลักฐาน (ปิดเป็นค่าเริ่มต้น) | 14 วัน | 1 / 7 / 14 / 30 / 90 วัน | `docs/EXAM.md` |
| Attendance | บันทึกเวลา/ลา/แก้ไข | 2 ปี | 2 / 3 / 5 / 10 ปี (ต่ำกว่า 2 ปีไม่ได้) | `docs/ATTENDANCE-READINESS.md` |
| Attendance | ค่าลักษณะใบหน้า | 365 วันนับจากใช้ครั้งล่าสุด | 30–730 วัน (แนะนำ: ระยะหลักสูตร + 30 วัน) | `docs/pdpa/retention-table.md` |
| Gate | บันทึกเข้า-ออก | 90 วัน | 7–730 วัน | `gate-kit.js`, `docs/GATE.md` §5 |
| Gate | ภาพครอปป้าย (ปิดเป็นค่าเริ่มต้น) | 7 วันเมื่อเปิด | 1–30 วัน | `gate-kit.js` |
| Gate | ใบเสร็จ/กะ | 5 ปี | 1–10 ปี | `gate-kit.js` |
| Crowd | ตัวเลขรายวัน | เก็บล่าสุด 60 วัน (ตัวป้องกันพื้นที่เก็บข้อมูล) | ลบเองได้ทุกเมื่อ | `docs/PDPA-NOTES-FOR-COUNSEL.md` C1 |

**ข) ข้อมูลที่ผู้ให้บริการถือในฐานะผู้ประมวลผล**

| รายการ | ระยะเวลา | หมายเหตุ |
|---|---|---|
| การช่วยเหลือทางไกล | ไม่เก็บสำเนา; ภาพหน้าจอ (ถ้าลูกค้ายินยอม) ลบเมื่อแก้ปัญหาเสร็จ [ภายใน [..] วัน] | `docs/SUPPORT.md` §5 |
| ศูนย์รวมข้อมูลตัวเลข (`server.py`) | 62 วัน ลบเก่าสุดทุกครั้งที่มีการส่งข้อมูล | `SECURITY.md` §3.4 |
| วิดีโอโครงการทดลอง | ไม่เกิน [12] ชั่วโมงบันทึก ลบภายในวันที่กำหนดในสัญญาทดลอง ต่อหน้าผู้แทนลูกค้า | `PILOT-AGREEMENT.md` |
| บัญชีองค์กรบน Cloudflare (**ค่าที่ออกแบบไว้ ยังไม่สร้าง**) | Gate เหตุการณ์ 90 วัน (7–400); ใบเสร็จ/กะ 5 ปี; Attendance 2 ปี (ต่ำสุด 2 ปี); Exam 90 วัน (30–400); โปรไฟล์ที่นั่งพิเศษ สิ้นสุดภายใน 24 ชม.หลังสอบ; บันทึกตรวจสอบองค์กร 400 วัน; ปิดบัญชีองค์กร: ส่งออกได้ 30 วันแล้วลบ | `docs/ORG-ACCOUNTS-DESIGN.md` §8; ต้องแก้ตามที่สร้างจริง |
| บันทึกตรวจสอบของระบบหลังบ้าน | 400 วัน (ไม่มีอีเมลหรือโทเค็น มีแฮช IP ที่ใช้เกลือรายวัน) | `backend/src/retention.js` |
| คำขอติดต่อ (leads) ของผู้ติดต่อฝั่งลูกค้า | 180 วัน | `backend/src/retention.js` (ผู้ให้บริการเป็นผู้ควบคุมข้อมูลเอง) |
| เอกสารบัญชีและภาษี | อย่างน้อย 5 ปี | ผู้ให้บริการเป็นผู้ควบคุมข้อมูลเอง |

## ภาคผนวก 4: มาตรการรักษาความปลอดภัยที่มีอยู่จริงในผลิตภัณฑ์ (ไทย)

รายการนี้เขียนจากโค้ดและเอกสารปัจจุบัน (`SECURITY.md`, `docs/EXAM.md`, `docs/ATTENDANCE-READINESS.md`, `docs/GATE.md`) ไม่รวมสิ่งที่ยังไม่ได้ทำ
ผู้ให้บริการยังไม่อ้างใบรับรองความปลอดภัยใด ๆ (เช่น ISO 27001, SOC 2) [ยืนยันก่อนใช้จริง]

1. **ประมวลผลบนอุปกรณ์:** ภาพอยู่ในหน่วยความจำ ไม่บันทึก ไม่ส่งออกโดยค่าเริ่มต้น หน้า Crowd ไม่มีการเรียกเครือข่าย (มีการทดสอบอัตโนมัติ)
2. **ข้อมูลใบหน้า:** เข้ารหัส AES-GCM 256 บิต คีย์แบบไม่สามารถอ่านออก (non-extractable) เก็บใน IndexedDB ต้องใช้ในบริบทที่ปลอดภัย (HTTPS) ไม่มีโหมดข้อความเปล่า
มีวันหมดอายุ และ “ลบข้อมูลใบหน้าทั้งหมด” ลบคีย์ด้วย จึงอ่านสำเนาที่เหลือไม่ได้
3. **คลิปหลักฐาน Exam:** เข้ารหัส AES-GCM 256 ไม่เข้ารหัสไม่บันทึก ลบอัตโนมัติ สูงสุด 60 คลิปต่ออุปกรณ์ รายการคลิปอยู่หลัง PIN ผู้คุมสอบ (PBKDF2-SHA-256 แบบใส่เกลือ)
**หมายเหตุ:** PIN เป็นประตูของหน้าจอ ไม่ใช่การเข้ารหัส ผู้ที่มีเครื่องมือนักพัฒนาหรือล้างข้อมูลไซต์ยังลบข้อมูลในเครื่องได้
4. **Attendance:** PIN เก็บเป็นแฮชแบบใส่เกลือ การแก้ไขโดยผู้จัดการเป็นแบบเพิ่มต่อท้ายพร้อมสายแฮช SHA-256 ตรวจพบการแก้/ลบ/สลับลำดับ ("ตรวจพบได้ ไม่ใช่ป้องกันได้")
5. **Gate:** ผู้ปฏิบัติงานรับทราบประกาศก่อนเปิดกล้อง การแก้ไขผลอ่านบันทึกเป็นแบบแก้ย้อนหลังไม่ได้ มีงานลบข้อมูลหมดอายุเมื่อเปิดและทุกชั่วโมง
6. **ตัวนำเสนอหน้าเว็บ:** นโยบายความปลอดภัยเนื้อหา (CSP) ไม่ใช้สคริปต์ของบุคคลที่สาม ไม่มี inline script
7. **ศูนย์รวมข้อมูล `server.py` (เมื่อโฮสต์):** ตรวจ Host/Origin ป้องกัน CSRF และ DNS rebinding; รหัสจับคู่ 12 ตัวอักษร; โทเค็นอุปกรณ์ 256 บิตเก็บเฉพาะแฮช SHA-256;
จำกัดอัตราและล็อกหลังรหัสผิด; ยอมรับเฉพาะตัวเลขตามแบบที่กำหนด (ไม่รับสตริง ภาพ หรือค่าลักษณะใบหน้า); ไฟล์ข้อมูลสิทธิ์ 0600; เพิกถอนรายอุปกรณ์ได้; log ไม่มีเนื้อหา
8. **ระบบหลังบ้าน Cloudflare Worker + D1 (เมื่อใช้):** โทเค็นเซสชันเก็บเป็นแฮช; บันทึกตรวจสอบโดยไม่มีอีเมล/โทเค็น และ IP เป็นแฮชรายวัน; การตั้งค่าสำคัญของผู้ดูแลต้องยืนยันตัวตนซ้ำด้วยรหัสผ่านและรหัส 6 หลัก;
คีย์ AI เก็บแบบเข้ารหัสซองจดหมาย (เขียนอย่างเดียว); ความลับอยู่ใน Worker secrets; ตัวกันบอท Turnstile; จำกัดอัตรา; log ไม่มีภาพ ข้อความ พรอมต์ IP หรืออีเมล
9. **AI Gateway:** AI ปิดทั้งระบบเมื่อติดตั้งใหม่ งบเริ่มต้น 0 เรียกผ่าน Worker เท่านั้น เบราว์เซอร์ไม่ติดต่อผู้ให้บริการโดยตรง ผู้ใช้เห็นชื่อผู้ให้บริการและประเทศก่อนยินยอม ถอนได้ทุกเมื่อ
10. **ข้อจำกัดที่ทราบและยังไม่แก้:** (รหัสกู้คืนผู้ดูแลเก็บด้วยแฮชแบบช้าและมี salt แล้ว ตั้งแต่ 11 พ.ย. 2569, L51) Chrome/เบราว์เซอร์ของลูกค้าที่ถูกควบคุมโดยผู้ไม่หวังดีอยู่นอกขอบเขต;
อุปกรณ์ที่ไม่มีบริบทปลอดภัย (HTTP) จะไม่บันทึกข้อมูลใบหน้า
11. **การสำรองข้อมูล:** ข้อมูลบนอุปกรณ์สำรองโดยลูกค้า (ไฟล์ส่งออกไม่รวมข้อมูลใบหน้า); การสำรองระบบหลังบ้านเมื่อใช้: [ระบุ]

---

# Part 2: English

> **Draft for legal review — not final / ร่างสำหรับทนายตรวจ — ยังไม่ใช่ฉบับใช้จริง**
> The Thai text is the reference version.

## 1. Parties

**Controller ("Customer"):** [legal name], registration [13 digits], address [address], contact [name / e-mail]
**Processor ("Provider"):** [legal name], registration [13 digits], address [address], privacy contact [name / e-mail]
**Main agreement:** Terms of Service for Organisations / Quotation no. [..] dated [..] (the "Main Agreement")

## 2. When this applies, and scope

2.1 By default the Product **processes images on the Customer's devices** and the Provider **receives no personal data.** This agreement therefore applies only
when the Provider accesses or processes the Customer's personal data, namely (tick all that apply):
☐ Remote help or on-site support that exposes data
☐ An aggregate-numbers hub (`server.py`) hosted by the Provider
☐ A pilot with video recording (people counting only; see `PILOT-AGREEMENT.md`)
☐ Organisation accounts and multi-device sync on Cloudflare (**not yet offered**; applies once it is)
☐ External AI services (optional, off by default; **today Exam, Attendance, Gate and Crowd do not call any AI service**)

2.2 Data, Data Subjects and purposes are in Annex 1. Anything outside Annex 1 needs a written change to the Annex before processing starts.

## 3. Controller's instructions

3.1 The Provider processes personal data only on the Customer's written instructions (the Main Agreement, this agreement, and extra instructions e-mailed
by the Customer's named contact), unless the law requires otherwise, in which case it tells the Customer first unless the law forbids that.

3.2 The Provider tells the Customer if it thinks an instruction may break the law.

3.3 The Customer confirms that it has a lawful basis, has informed Data Subjects and has obtained the consents needed (see `PRIVACY-NOTICE-TEMPLATE.md`, `CONSENT-FORMS.md`).
**The Provider does not process data to** infer emotion, detect lies, or make automated decisions about people, and does not use the data for its own purposes, model training or marketing.

## 4. Provider duties (s.40)

4.1 **Process on instructions** under clause 3.
4.2 **Confidentiality.** Staff with access are bound in writing and get access only as needed.
4.3 **Security measures** as in Annex 4, reviewed at least yearly.
4.4 **Breach notice** under clause 7.
4.5 **Record of processing.** The Provider keeps a record of processing done for the Customer (data categories, recipients, transfers abroad, measures) and shows it on request.
[Question for counsel: check the sub-paragraphs of s.40 and what the record must contain.]
4.6 **Assistance.** Answer Data-Subject requests (clause 8), help with the DPIA and consult the PDPC when the Customer asks.
4.7 **No face data requests.** The Provider never asks the Customer to export face data (face templates) for support. Diagnostic files contain no biometric data.
Screenshots are taken only with the Customer's consent and deleted when the issue is fixed [within [..] days].

## 5. Sub-processors

5.1 The Customer authorises only the sub-processors in Annex 2.
5.2 The Provider gives at least [30] days' notice before adding or changing one. The Customer may object on reasonable grounds within [14] days.
If no agreement is reached, the Customer may end the affected service and receive a pro-rata refund of unused fees.
5.3 The Provider binds each sub-processor to data-protection duties no less strict than this agreement, and is liable to the Customer for their performance.
[Question for counsel: L50. The Provider has not yet reviewed each sub-processor's own terms in full. To what extent should it be liable when the sub-processor is a foreign company on its own standard terms?]
5.4 **External AI services.** The Provider sends data to an AI provider only if (a) the Customer ticks it in Annex 2 in writing; (b) the end user consents on a screen that names the provider,
the processing country and the provider's retention; and (c) only **extracted facts** are sent, not images of people (unless the Customer approves an image exception separately in writing).

## 6. Transfers abroad (ss.28-29)

6.1 The Provider does not transfer the Customer's personal data outside Thailand except through the sub-processors in Annex 2 that the Customer authorises.
6.2 Mechanism: [specify, e.g. standard clauses / consent the Customer collects from Data Subjects / appropriate safeguards under PDPC notifications].
[Question for counsel: P6, L9, L22, L48. Which mechanism is acceptable for (a) Cloudflare (a US company; D1 offers only an `apac` location hint, no Thai option), (b) each AI provider, and (c) public bodies that may need Thai-hosted storage?]

## 7. Personal-data breach notice

7.1 The Provider notifies the Customer **without undue delay and within [24] hours** of becoming aware, or having reason to believe, that a breach affects the Customer's data,
so the Customer can notify the PDPC within 72 hours (s.37(4)). [Question for counsel: P9 confirm the 24-hour processor period.]

7.2 The notice includes: the facts known; the nature of the breach; categories and approximate numbers of data and Data Subjects; likely consequences; measures taken and planned;
and a contact. If incomplete, send what is known first and add later.

7.3 The Provider preserves evidence, limits harm and investigates with the Customer, following `docs/pdpa/INCIDENT-RESPONSE.md`.
The Provider does not notify the PDPC or Data Subjects in the Customer's place unless the Customer instructs or the law requires.

## 8. Data-subject rights

8.1 If a Data Subject contacts the Provider directly, the Provider forwards the request to the Customer within [3] business days and does not answer in the Customer's place unless instructed.
8.2 The Provider helps the Customer answer requests (access, correction, erasure, objection, portability) within [10] business days of the Customer's request, using the export / delete tools in the Product.
Where data is on the Customer's devices, the Customer acts itself; the Provider holds no copy.

## 9. Retention, return and deletion

9.1 Retention follows Annex 3.
9.2 When the Main Agreement ends, or on the Customer's request, the Provider (a) lets the Customer export the data it holds (CSV / JSON) within [30] days; (b) deletes all of it, including backups,
within [30] days after that; and (c) confirms deletion in writing, except for data the law requires it to keep, where it tells the Customer what it keeps, for how long and why.
9.3 Pilot video is deleted by the date in the pilot agreement, in front of the Customer's representative, and the deletion is recorded.
9.4 On Customer devices the Provider reaches temporarily, it leaves no copy of data on its own devices.

## 10. Audit

10.1 The Provider supplies the information needed to show compliance (records, audit logs, security test results it has).
10.2 The Customer may audit once a year on [30] days' notice, starting with documents and moving on-site only if needed, at the Customer's cost, with the auditor bound by confidentiality.
More audits are allowed after a breach or if the PDPC asks.

## 11. Liability

11.1 Each party's liability to the other under this agreement follows clause 10 of the Main Agreement [or: a separate cap for data breaches [..]].
[Question for counsel: G1 a suitable cap for personal-data liability, and how liability is shared between controller and processor under ss.77-78.]
11.2 The Provider is not liable for loss caused by the Customer lacking a lawful basis, not posting signs or not collecting consents the law requires, or by the Customer's unlawful instructions.

## 12. Term and law

12.1 This agreement runs from signature until the Provider has deleted or returned all data under clause 9.
12.2 If it conflicts with the Main Agreement, this agreement prevails on personal-data protection.
12.3 Thai law; the competent courts of [Bangkok], as in the Main Agreement.

## Signatures

| Customer (controller) | Provider (processor) |
|---|---|
| Signature ______________________ | Signature ______________________ |
| ( [name] ) [title] | ( [name] ) [title] |
| Date __________ | Date __________ |

---

## Annex 1: Description of processing (English)

| Item | Exam (lab mode) | Attendance | Gate | Crowd |
|---|---|---|---|---|
| Data Subjects | Candidates, invigilators | Staff, trainees, managers | Drivers, residents, visitors, guards | Event attendees (not identified) |
| Data on the Customer's devices (not received by the Provider by default) | Event log (time, seat, signal, result, invigilator name); encrypted evidence clip (if on) | Name, code, in / out times; hashed PIN; face template (if consented) | Plate, province, times, lane, confirmer, fee, house number, visitor name (if any), deny list | Count numbers; no images; no per-person tracking codes |
| What the Provider may reach under clause 2.1 | Brief view of the screen during support; pilot video (if any) | Brief view of the screen; synced data (once offered) | Brief view of the screen; synced data (once offered) | Aggregate numbers on the hub; pilot video (people counting only, if any) |
| Sensitive / biometric | None (no face template is made) | Face template (s.26), **on the device only by default** | None | None |
| Purpose | Help invigilators | Time clock / check-in | Parking fees, access control | Estimate numbers and density |
| Nature of processing | Only as in clause 2.1: temporary access, storage, export, deletion | Same | Same | Same |

**Never processed:** emotion or facial expression; lie detection; identifying people in public; automated decisions.

## Annex 2: Sub-processors (English)

| # | Sub-processor | Does what | Country / region | Used when | Review status |
|---|---|---|---|---|---|
| 1 | Cloudflare, Inc. (Workers, D1, Turnstile) | Hosts the back end and database | USA / global; D1 offers an `apac` location hint | When organisation accounts or online functions are used [☐ used] | [Cloudflare's processing terms pending review: L22, L50] |
| 2 | [e-mail provider] | Sends transactional e-mail (no module data) | [..] | If e-mail is on [☐ used] | [pending] |

**AI providers** (only those the Customer ticks, and only for features the Customer switches on. No Exam, Attendance, Gate or Crowd feature calls these today):

| Tick | Provider | Processing country (as shown to the user in the consent screen) | Retention the provider states | Review item |
|---|---|---|---|---|
| ☐ | Anthropic (Claude) | USA / global routing | Up to 30 days per its terms | L1 |
| ☐ | Google (Gemini API, paid tier only) | No data residency stated | Per paid-tier terms | L2 |
| ☐ | OpenAI | Storage and processing may be in different countries | Abuse logs up to 30 days | L3 |
| ☐ | Alibaba Model Studio (Qwen) | Singapore (named workspace) | Not stated | L4 |
| ☐ | DeepSeek | **China**; may use data for training per its privacy policy | Stored in China | L5 **(proposal: not offered to customers. [Question for counsel])** |
| ☐ | Zhipu (z.ai) | Singapore | Provider's DPA says content is not stored | L6 |
| ☐ | Moonshot (Kimi) | Not confirmed | Zero retention only on an enterprise option | L7 |
| ☐ | OpenRouter (routing intermediary) | Adds a **second processor**; the system forces "no retention / no training" every time | The route used may be Google Cloud Vertex AI or Microsoft Azure | L8, L50 |

Note: this list is the set of providers the system can connect to. The Provider offers a Customer only those ticked. Each provider's terms are still under counsel review (L1-L9, L48, L50).
The Provider sends no Customer personal data to a provider that has not been cleared, until counsel confirms.

## Annex 3: Retention (English)

**A) Data on the Customer's devices (the Customer sets and controls this; product defaults)**

| Product | Data | Default | Settable | Source |
|---|---|---|---|---|
| Exam | Event log | As the institution's rules say (notice template: no more than 90 days) | Customer can delete | `docs/EXAM.md`, notes B1 |
| Exam | Evidence clip (off by default) | 14 days | 1 / 7 / 14 / 30 / 90 days | `docs/EXAM.md` |
| Attendance | Time / leave / corrections | 2 years | 2 / 3 / 5 / 10 years (never below 2) | `docs/ATTENDANCE-READINESS.md` |
| Attendance | Face templates | 365 days since last use | 30-730 days (recommended: course length + 30 days) | `docs/pdpa/retention-table.md` |
| Gate | Entry / exit log | 90 days | 7-730 days | `gate-kit.js`, `docs/GATE.md` s.5 |
| Gate | Plate crops (off by default) | 7 days when on | 1-30 days | `gate-kit.js` |
| Gate | Receipts / shifts | 5 years | 1-10 years | `gate-kit.js` |
| Crowd | Daily numbers | Newest 60 days (a storage safeguard) | Customer can delete any time | `docs/PDPA-NOTES-FOR-COUNSEL.md` C1 |

**B) Data the Provider holds as processor**

| Item | Period | Note |
|---|---|---|
| Remote support | No copy kept; screenshots (if the Customer consents) deleted when the issue is fixed [within [..] days] | `docs/SUPPORT.md` s.5 |
| Aggregate hub (`server.py`) | 62 days; oldest deleted on every push | `SECURITY.md` s.3.4 |
| Pilot video | At most [12] hours recorded; deleted by the date in the pilot agreement, in front of the Customer's representative | `PILOT-AGREEMENT.md` |
| Organisation accounts on Cloudflare (**design values, not yet built**) | Gate events 90 days (7-400); receipts / shifts 5 years; Attendance 2 years (minimum 2); Exam 90 days (30-400); accommodation profiles end within 24 h after the exam; organisation audit log 400 days; closing an organisation: 30-day export window, then deletion | `docs/ORG-ACCOUNTS-DESIGN.md` s.8; to be corrected to match what is built |
| Back-end audit log | 400 days (no e-mail or token; IP kept only as a day-salted hash) | `backend/src/retention.js` |
| Contact requests (leads) from the Customer's contacts | 180 days | `backend/src/retention.js` (the Provider is its own controller) |
| Accounting and tax documents | At least 5 years | The Provider is its own controller |

## Annex 4: Security measures that exist in the product today (English)

This list is written from the current code and documents (`SECURITY.md`, `docs/EXAM.md`, `docs/ATTENDANCE-READINESS.md`, `docs/GATE.md`). It leaves out anything not yet built.
The Provider claims no formal security certification (for example ISO 27001, SOC 2) [confirm before use].

1. **On-device processing.** Images stay in memory, are not recorded and are not sent out by default. The Crowd page makes no network request (an automated test checks this).
2. **Face data.** AES-GCM 256-bit encryption; a non-extractable key held in IndexedDB; a secure context (HTTPS) is required and there is no plaintext mode;
   retention expiry; "delete all face data" also deletes the key so any leftover copy cannot be read.
3. **Exam evidence clips.** AES-GCM 256; if the browser cannot encrypt, recording does not start; automatic deletion; at most 60 clips per device; the clip list sits behind an invigilator PIN (PBKDF2-SHA-256, salted).
   **Note:** the PIN is a screen gate, not encryption. Someone with developer tools or who clears site data can still delete local data.
4. **Attendance.** PIN stored as a salted hash. Manager corrections are append-only with a SHA-256 hash chain; edits, deletions and reordering are detected ("tamper-evident, not tamper-proof").
5. **Gate.** The operator acknowledges the notice before the camera starts. Corrections are logged and cannot be edited afterwards. An expiry job runs at start and hourly.
6. **Web pages.** Content-Security-Policy; no third-party scripts; no inline scripts.
7. **Aggregate hub `server.py` (when hosted).** Host / Origin checks against CSRF and DNS rebinding; a 12-character pairing code; 256-bit device tokens stored only as SHA-256 hashes;
   rate limits and lockout after wrong codes; only numbers in a fixed schema are accepted (no strings, images or face templates); data files mode 0600; per-device revocation; logs hold no content.
8. **Cloudflare Worker + D1 back end (when used).** Session tokens stored as hashes; audit log without e-mail or token and with IPs only as day-salted hashes; sensitive admin changes need re-authentication with a password and a 6-digit code;
   AI keys stored envelope-encrypted (write-only); secrets held in Worker secrets; Turnstile bot check; rate limits; logs hold no images, text, prompts, IPs or e-mails.
9. **AI Gateway.** AI is off system-wide on a new install with a budget of 0. Calls go only through the Worker; the browser never contacts a provider directly. The user sees the provider name and country before consenting and can withdraw at any time.
10. **Known limits not yet fixed.** (Fixed 2026-11-11, L51: the admin recovery codes are stored with a slow, salted hash keyed with the master key.)
    A compromised customer browser or operating system is out of scope. A device without a secure context (HTTP) will not store face data.
11. **Backups.** Data on devices is backed up by the Customer (export files never contain face data). Back-end backups when used: [specify].

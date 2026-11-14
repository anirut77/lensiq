# Product Check live scan: results (2026-11-12)

> Owner order 2026-11-12, after phone testing: "not real-time, the box has to be aimed carefully, too many taps. Redesign
> the capture as a live scan. Keep all privacy filters." Built on `main` at `7b7f1db`. **Nothing is deployed.** Every
> number below states its source. **No real phone was measured: a real-phone measurement is still needed.**

## รอบที่ 3: ปิดช่องโหว่ชื่อไทยในโน้ต (2026-11-12, อ่านส่วนนี้ก่อน)

แหล่งที่มาของตัวเลขทั้งหมดในส่วนนี้: **สังเคราะห์** (ชุดล็อก P7 / P7b และกรณีทดสอบหนักที่สร้างจากชุดเหล่านั้น) ยังไม่มีข้อมูลภาคสนาม

- **แก้แล้ว:** การส่งแบบแตะครั้งเดียวจะหยุดและเปิดหน้าตัวอย่างตามเดิม เมื่อข้อความดูเหมือนโน้ตถึงคน
  - ไทย: "ไว้ให้" หรือ ให้ / ของ / ถึง / แด่ / สำหรับ ตามด้วยคำเรียกญาติหรือคำนำหน้า (ยาย ตา ปู่ ย่า พ่อ แม่ ลูก หลาน น้อง พี่ ป้า ลุง น้า อา คุณ นาย นาง น.ส. ด.ช. ด.ญ.)
    ยกเว้นคำบนฉลาก เช่น คุณค่า คุณภาพ อาการ อาหาร ตาม ลูกค้า; "สำหรับ" ตัวเดียว (เช่น "สำหรับเด็ก") ไม่หยุด
  - อังกฤษ: "for / to (my) grandma, mum, Mr …" · จีน: 给 / 給 + คำเรียกญาติ หรือ แซ่ + 先生 / 女士 / 小姐 / 老师
  - กฎนี้หยุดเฉพาะการแตะครั้งเดียว ไม่ลบข้อความใด ไม่เปลี่ยนการตัดสินอื่น (เทียบกฎเก่า/ใหม่ 1,773 ข้อความ: เปลี่ยน 0)
  - ใช้ทั้งบนเครื่องและที่เซิร์ฟเวอร์ (LQPCGuard.autoBlock) commit แยก `ad844fa`
- **ตัวเลข (สังเคราะห์)**
  - กรณีทดสอบหนักแบบกว้าง (25 ฉลาก × 308 เอกสารส่วนตัว × 2 ลำดับ = 15,400): **ส่ง 0 ครั้ง 0 รายการ** (ก่อนแก้ 22 ครั้ง 22 รายการ จากโน้ตไทยชิ้นเดียว)
  - กรณีทดสอบของผู้ตรวจ (ฉลาก P001 + 308 เอกสาร): **0/308**
  - ชุดล็อก P7 / P7b: ข้อมูลส่วนตัวถึง AI **0/260 และ 0/614** ทั้งโหมดข้อความและภาพ (ภาษาที่วัด ชุดสังเคราะห์: ไทย 78 อังกฤษ 79 จีน 63 ญี่ปุ่น 28 เกาหลี 12 รายการ, p7b: ไทย 319 อังกฤษ 161 จีน 51 ญี่ปุ่น 56 เกาหลี 27; ไม่ใช่ข้อยืนยันสำหรับชื่อภาษาญี่ปุ่น / เกาหลีที่ไม่มีคำบอก ซึ่งยังหลุดถึง AI ในชุดทดสอบ JA / KO ดู `docs/product-check/PC-JK-RESULTS.md`)
  - ฉลากสินค้าที่ส่งแบบแตะครั้งเดียวได้: **217/360 เท่าเดิม** (ผ่านตัวกรองแบบกดเอง 299/360 เท่าเดิม)
- เทสต์: unit ที่เกี่ยวข้อง 89/89 (รวมไฟล์ใหม่ tests/unit/pc-guard-onetap-notes.test.js), e2e product-check-live + product-check-ai 18/18
- log: ~/LENSIQ-field/evals/live-scan/stress-sameframe-2026-11-12-notes.log, live-leak-run-2026-11-12T16-03-09-672Z.log
- ภาพหน้าจอ: ไม่ได้ถ่ายใหม่ (หน้าจอไม่เปลี่ยน เปลี่ยนเฉพาะว่าเมื่อใดการแตะครั้งเดียวกลับไปแสดงตัวอย่าง)

## รอบที่ 2: ทำตามคำตัดสินของเจ้าของ 2026-11-12 (ส่วนล่างเป็นรอบแรก)

- **ไม่มีการส่งอัตโนมัติแล้ว** ส่งให้ AI เฉพาะเมื่อมีคนกดเท่านั้น (มีเทสต์ยืนยัน: สแกนหลายสินค้าโดยเปิดการแตะครั้งเดียวไว้ ไม่มีคำขอใดถูกส่ง)
- **ผู้ทดสอบ: แตะครั้งเดียว** หลังยินยอมหนึ่งครั้งพร้อมเลือก "จำการเลือกนี้" กด "ขอความเห็นจาก AI" ครั้งเดียวส่งทันที ไม่มีหน้าตัวอย่าง
  - ส่งทันทีเฉพาะเมื่อผ่านตัวกรองครบ (หลักฐานฉลากสินค้า ไม่ใช่ฉลากจ่ายยา/เอกสารส่วนตัว ตัวกันชื่อ autoBlock ไม่พบใบหน้า ข้อความไม่ถูกแก้)
  - ไม่ผ่าน: แสดงเหตุผล แล้วเปิดหน้าตัวอย่างตามเดิม (ไม่มีอะไรส่งจนกว่าจะกด "ส่งข้อความนี้")
  - แสดงข้อความที่ส่งไป ปุ่ม "หยุดส่งแบบแตะครั้งเดียวและถอนความยินยอม" และปุ่มถอนความยินยอมเดิม ล้างทั้งสองอย่างทันที
  - ส่งเฉพาะข้อความ ภาพส่งได้หลังกด "ใช้ภาพนี้" เท่านั้น (เหมือนเดิม)
  - เซิร์ฟเวอร์ยังบังคับ: คำขอแบบไม่มีตัวอย่าง (`auto: true`) รับเฉพาะผู้ทดสอบที่รหัสถูกต้อง
  - คนทั่วไป: ดูตัวอย่างและยืนยันทุกครั้งเหมือนเดิม
- **ข้อความปฏิเสธเฉพาะเรื่อง**: เมื่อเซิร์ฟเวอร์ปฏิเสธด้วยรหัส ai_off_dispensing / personal_doc / no_product / personal_data หน้าจอแสดงเหตุผลนั้น (ไทย อังกฤษ จีน) แทน "AI ใช้ไม่ได้"
- **ตรวจแหล่งทางการอัตโนมัติ** สินค้าละครั้ง เฉพาะผู้ที่เปิด "อนุญาตค้นข้อมูลออนไลน์" (เจ้าของยืนยันแล้ว)
- **Gemini 3.5 Flash-Lite: ไม่เปลี่ยนเป็นค่าเริ่มต้น ยังใช้ Haiku** เพราะเงื่อนไขขัดกัน (§10)
  - เส้นทางของเรา (OpenRouter → Google Vertex) ใช้เงื่อนไข Google Cloud ข้อ 20(d): ห้ามใช้ Generative AI ในเว็บที่ "น่าจะมีผู้อายุต่ำกว่า 18 ปีเข้าใช้" เว็บเราไม่มีการยืนยันอายุ
  - ข้อ 20(e): ห้ามใช้ "แทนคำแนะนำทางการแพทย์" (หน้ายาต้องบอกชัดว่าเป็นข้อมูลเท่านั้น ซึ่งมีอยู่แล้ว)
  - **ข้อสังเกตสำคัญ: Haiku ที่ใช้อยู่ก็ถูกส่งผ่าน Google Vertex เช่นกัน** ข้อ 20(d) อาจใช้กับ Haiku ด้วย ต้องให้ทนายหรือเจ้าของตัดสิน
  - เส้นทาง ZDR ของ Google บน Vertex เป็นแบบ "Safety Retention" (เก็บข้อความที่ถูกระบบความปลอดภัยตั้งธงได้ถึง 90 วัน) ไม่ใช่ ZDR เข้มงวด ข้อความใดที่บอกผู้ใช้ว่า "ไม่เก็บเลย" ต้องตรวจใหม่
- **แก้ช่องโหว่ชื่อ/เลขภาษาเกาหลีและ "Patient" ที่ OCR อ่านผิด** (commit แยก ไม่ลดความเข้มของกฎเดิม)
  - กรณีทดสอบหนักเดิม (ฉลาก P001 + เอกสารส่วนตัว 308 ชิ้นในภาพเดียว): 2/308 ภาพ 5 รายการ → **0/308 ภาพ 0 รายการ**
  - กรณีทดสอบที่กว้างกว่า (25 ฉลาก × 308 × 2 ลำดับ = 15,400): ส่งได้ 22 ครั้ง 22 รายการ **ทั้งหมดมาจากโน้ตเตือนกินยาภาษาไทยชิ้นเดียว** ("…ไว้ให้ยาย <ชื่อ>" ไม่มีคำนำหน้าชื่อ) ภาษาเกาหลี/ญี่ปุ่น 0 — **ปิดแล้วในรอบที่ 3: 0/15,400**
  - ชุดล็อก P7 / P7b: ข้อมูลส่วนตัวถึง AI ยังเป็น 0/260 และ 0/614 การปฏิเสธของตัวกรองไม่เปลี่ยน (ฉลากสินค้าผ่านแบบกดเอง 299/360 เท่าเดิม)
  - เทียบกฎเก่า/ใหม่ทุกข้อความที่มี (1,773 ข้อความ): ไม่มีการตรวจพบใดหายไป ไม่มีการตัดสินใดหลวมลง มีแต่เพิ่มการลบและเพิ่มการบล็อกภาพ 10 ข้อความ (ไม่ใช่ฉลากสินค้า)
- **รอคุณตัดสิน**
  1. Haiku ก็วิ่งผ่าน Google Vertex: ยอมรับความเสี่ยงข้อ 20(d) ระหว่างทดสอบปิด (ผู้ทดสอบเป็นผู้ใหญ่) หรือให้ทนายดูก่อนเปิดสาธารณะ
  2. ถ้าต้องการ Gemini (เร็วกว่า): ต้องมีการยืนยันอายุ 18+ ก่อนใช้ AI และทนายยืนยัน
  3. ข้อความกฎหมาย §7 (ปรับเป็นแบบแตะครั้งเดียวแล้ว) ใส่ L57
  4. ~~ช่องโหว่ชื่อไทยในโน้ต~~ แก้แล้วในรอบที่ 3 (0/15,400) ไม่ต้องตัดสิน

## สรุปสำหรับเจ้าของ (Thai summary, รอบแรก)

- **สร้างแล้ว: สแกนสด เป็นค่าเริ่มต้นของปุ่ม "เปิดกล้อง" ในแท็บตรวจสินค้า**
  - กล้องเปิดค้าง มีกรอบนำสายตา ไม่ต้องกดถ่าย ไม่ต้องวาดกรอบ
  - คำแนะนำสั้น ๆ ทันที: หันไปที่ฉลาก / มืดเกินไป / ขยับเข้าใกล้ / มีแสงสะท้อน / ถือนิ่ง ๆ
  - ภาพนิ่ง 3 เฟรมติดกัน ระบบอ่านเอง (บาร์โค้ดก่อน แล้วตัวอักษร) รวมผลจากหลายภาพ (โหวตทีละบรรทัด) อ่านด้านเดียวกันไม่เกิน 3 ครั้งแล้วหยุดเพื่อประหยัดแบต
  - แสดงรายการที่พบทันที: บาร์โค้ด ✓ เลขทะเบียน ✓ ส่วนประกอบ ✓
  - วิเคราะห์ภาพไม่เกิน 4 ภาพต่อวินาที (ภาพย่อ 320 px ในหน่วยความจำ) หยุดเมื่อสลับแอปหรือซ่อนหน้า กล้องถูกปล่อย
  - ปุ่ม "ถ่ายภาพนี้" ยังอยู่เป็นทางสำรอง และมีช่องให้ปิดสแกนสด (ถ่ายทีละภาพ)
  - ผลแสดงทีละขั้นโดยไม่ต้องกดเพิ่ม: ผลในเครื่องก่อน → ตรวจแหล่งทางการ (อัตโนมัติ **เฉพาะเมื่อผู้ใช้เปิด "อนุญาตค้นข้อมูลออนไลน์" ไว้แล้ว** สินค้าละ 1 ครั้ง) → ผล AI
- **ส่งให้ AI อัตโนมัติ: เฉพาะผู้ทดสอบ** (รหัสผู้ทดสอบถูกต้อง และเปิดประตูผู้ทดสอบ) ยินยอมครั้งเดียวพร้อมเลือก "จำการเลือกนี้"
  - ส่งเองเฉพาะเมื่อผ่านครบ: เป็นฉลากสินค้า (ตัวกรองเดิม) ไม่ใช่ฉลากจ่ายยา ไม่ใช่เอกสารส่วนบุคคล ตัวกันชื่อไม่พบอะไรเลย (รวม "อาจเป็นชื่อคน") ตัวหาใบหน้าทำงานและไม่พบใบหน้า
  - สินค้าละ 1 ครั้ง ไม่ส่งซ้ำทุกเฟรม รอบละไม่เกิน 10 สินค้า ไม่ส่งขณะซ่อนหน้า
  - แสดงข้อความที่ส่งไปจริง และมีปุ่ม "หยุดส่งอัตโนมัติและถอนความยินยอม" ที่มีผลทันที
  - **ส่งเฉพาะข้อความ ไม่ส่งภาพอัตโนมัติ** (เหตุผลด้านล่าง: ต้องให้เจ้าของตัดสิน)
  - เซิร์ฟเวอร์บังคับซ้ำ: คำขอที่ติดป้าย auto ต้องมาจากผู้ทดสอบที่รหัสถูกต้องและเปิดประตูอยู่ ไม่งั้นปฏิเสธ 403 ก่อนเรียก AI และตรวจเพิ่ม (ไม่มี [removed] ไม่มีชื่อที่อาจเป็นคน ไม่ใช้หลักฐานจากรอบก่อน) และจำกัด 6 ครั้งต่อนาที 150 ครั้งต่อวันต่อผู้ใช้
  - **คนทั่วไปเหมือนเดิมทุกอย่าง**: กด "ขอความเห็นจาก AI" ดูข้อความก่อนส่งทุกครั้ง (มีเทสต์ยืนยัน)
- **การรั่วของข้อมูลส่วนบุคคล (วัดซ้ำบนชุดล็อก P7 และ P7b แหล่งที่มา: สังเคราะห์): 0 ทั้งโหมดข้อความและภาพ** ทั้งอ่านครั้งเดียวและรวมหลายภาพ
  - p7: 0/260 รายการ · p7b: 0/614 รายการ (ผ่านเป้า 0)
  - ราคาที่จ่าย: ฉลากสินค้าจริงที่ส่งอัตโนมัติได้ 217/360 = 60.3 % (แบบกดเองผ่านตัวกรอง 83.1 %) ที่เหลือใช้ปุ่มกดเองได้ตามเดิม
- **ผู้ตรวจอิสระพบช่องโหว่ 1 จุด (ร้ายแรง) และแก้แล้วบางส่วน — ยังไม่ถึงเป้า 0 ในกรณีทดสอบหนัก ต้องให้เจ้าของตัดสิน**
  - กรณี: ฉลากสินค้าอยู่ในภาพเดียวกับเอกสารส่วนตัวภาษาญี่ปุ่น/เกาหลี (เช่น กล่องยาวางบนการ์ดอวยพรหรือผลแล็บ) ฉลากให้ "หลักฐานสินค้า" ตัวกันชื่อหาชื่อต่างประเทศไม่เจอ ข้อความจึงถูกส่งอัตโนมัติ
  - ก่อนแก้ (ผู้ตรวจวัด): รวมหลายภาพ 430 ใน 7,700 กรณี 988 รายการ, ภาพเดียวกัน 13 ใน 308 ภาพ 30 รายการ
  - แก้แล้ว: (1) ถ้าข้อความภาพใหม่ไม่ตรงกับที่รวมไว้อย่างน้อยครึ่งหนึ่ง ถือเป็นวัตถุใหม่ เริ่มอ่านใหม่และทิ้งบาร์โค้ดเดิม (2) ส่งอัตโนมัติไม่ได้ถ้ามีเลขคล้ายเบอร์โทร 9–11 หลัก คำเรียกคน (様 さん 님 Mr Dear …) หรือถ้อยคำจดหมาย/โน้ต ทั้งบนเครื่องและเซิร์ฟเวอร์ (3) เซิร์ฟเวอร์ปฏิเสธภาพในคำขออัตโนมัติ (4) ปุ่มถอนความยินยอมเดิมปิดการส่งอัตโนมัติด้วย
  - หลังแก้ (ผมวัดด้วยสคริปต์ของผู้ตรวจ): รวมหลายภาพ **0** รายการ, **ภาพเดียวกัน 2 ใน 308 ภาพ 5 รายการ** (ผลแล็บเกาหลี และฉลากจ่ายยาฮ่องกง ที่อ่าน OCR เพี้ยน) ชุดล็อกยังเป็น 0
  - **ข้อเสนอ: ยังไม่ให้ผู้ทดสอบเปิดการส่งอัตโนมัติจนกว่าเจ้าของตัดสิน** (ค่าเริ่มต้นปิดอยู่แล้ว ต้องเปิดเองทีละคน)
- **ความเร็ว (เครื่อง Mac นี้ ไม่ใช่โทรศัพท์จริง แหล่งที่มา: ฉลากสังเคราะห์บนกล้องจำลอง ตัวเลข p50 / p90)**
  - ผลแรกบนจอ (บาร์โค้ด): 0.02 / 0.03 s บนคอมพิวเตอร์, 0.05 / 0.13 s เมื่อจำลองโทรศัพท์ระดับกลาง (CPU ช้าลง 4 เท่า): **ผ่านเป้า ≤ 1 s**
  - ตัวอักษร/เลขทะเบียนแรก: 0.58 / 0.67 s บนคอมพิวเตอร์ (ผ่าน) แต่ 2.4 / 3.1 s เมื่อจำลองโทรศัพท์ (**ไม่ผ่าน**) ฉลากที่ไม่มีบาร์โค้ดจะเห็นผลแรกช้าเท่านี้
  - ผล AI (ประมาณ ไม่ได้วัดตรง): คอมพิวเตอร์ + Gemini ~2.2 s (ผ่านเป้า ≤ 3 s), + Haiku ~3.9 s (ไม่ผ่าน); จำลองโทรศัพท์ + Gemini ~4.2 s (**ไม่ผ่าน**)
  - **ยังต้องวัดบนโทรศัพท์จริง**
- **เทียบโมเดล (ชุดสังเคราะห์ 16 ฉลาก × 3 รอบ ผ่านเส้นทาง ZDR ค่าใช้จ่ายรวม 0.071 USD)**
  - Gemini 3.5 Flash-Lite: เร็วกว่า 2 เท่า (p50 1.54 s, p90 1.94 s) อ่านฟิลด์ถูก 87.9 % แต่แพงกว่า 2 เท่า (0.78 USD / 1,000)
  - Haiku 5.5: p50 3.28 s, p90 5.13 s อ่านถูก 90.6 % ราคา 0.37 USD / 1,000
  - ช่วงความเชื่อมั่นซ้อนกัน ความแม่นยำไม่ต่างกันอย่างมีนัยสำคัญ
  - **ข้อเสนอ: ใช้ Gemini 3.5 Flash-Lite เป็นตัวแรกของ pc_fields ในการสแกนสดของผู้ทดสอบ** (เพราะเป้า AI ≤ 3 s ทำได้กับ Gemini เท่านั้น) และ Haiku เป็นตัวสำรอง **แต่ต้องให้เจ้าของตัดสินคำถาม 18+ ของ Gemini ที่ค้างอยู่ก่อน** จนกว่าจะตัดสิน ค่าเริ่มต้นไม่เปลี่ยน (Haiku ก่อน)
- **ต้องให้เจ้าของตัดสิน**
  0. **(ความเป็นส่วนตัว พลาดเป้า)** ยอมรับความเสี่ยงที่เหลือ (ภาพเดียวกัน 2/308 ในการทดสอบหนัก) เพื่อเปิดให้ผู้ทดสอบใช้ หรือรอการแก้รอบถัดไป (เช่น ไม่ส่งอัตโนมัติเมื่อข้อความมีอักษรเกาหลี/ญี่ปุ่น/จีนตัวเต็มที่ไม่ใช่ส่วนของฉลาก)
  1. ส่งภาพอัตโนมัติสำหรับผู้ทดสอบหรือไม่ (ต้องแก้เทสต์เดิมที่ล็อกไว้ว่า "เข้ารหัสภาพได้ที่เดียว หลังผู้ใช้กดยืนยัน" ผมไม่ได้แก้เทสต์นั้น)
  2. ใช้ Gemini 3.5 Flash-Lite เป็นตัวแรกของ pc_fields หรือไม่ (คำถาม 18+)
  3. ข้อความทางกฎหมายด้านล่าง (§7) ใส่ในรายการให้ทนายตรวจ
  4. ตรวจแหล่งทางการอัตโนมัติเมื่อเปิด "อนุญาตค้นข้อมูลออนไลน์" ไว้ (เปลี่ยนจากต้องกดปุ่ม) ยืนยันหรือไม่

## 1. What was built

| File | What |
|---|---|
| `lensiq-pc-live.js` (new, pure, unit-tested) | Per-frame checks on a <= 320 px frame (sharpness = variance of the Laplacian over text-like cells; strong-edge "label present" cells; glare blob; exposure; motion of a 64 x 48 thumbnail), hints, the auto-capture stabilizer, the merged reading (vote per line), checklist, product key, the tester auto-send decision |
| `lensiq-pc-live-ui.js` (new) | The camera loop: <= 4 frames analysed per second, nothing while the page is hidden, auto-capture after 3 steady good frames (a steady view that is only blurred or white enough to read as glare after 8 frames), up to 3 readings per steady view merged, a scene cut starts a new reading, framing guide, live hint, checklist |
| `lensiq-pc-ui.js` | Live scan is the default of the camera button (`#pcLiveOn`, ticked); `liveRead` (frame into the still canvas without stopping the camera; barcodes first, then one OCR pass), `liveApply` (the merged reading becomes `st.ocr`, so OCR provenance still holds), `prepareUploadAuto` (face check only; no picture comes back) |
| `lensiq-pc-run.js` | `?fakeocr` test seam (localhost only), like the existing `?fakeface` |
| `lensiq-pc-lookup.js` | A live reading runs the official lookup by itself only with the page's online-lookup opt-in, once per set of derived facts; answers kept across readings |
| `lensiq-pc-ai.js` | Tester-only auto-send (§4); the public flow is unchanged |
| `lensiq-ai.js` | `ensureConsentGroup(..., {force, auto})`: the consent screen again, with the auto-send paragraph; `saved` tells whether "remember" was ticked; `send(..., {auto})` marks the request |
| `backend/src/ai/gateway.js`, `features.js`, `pc-features.js`, `index.js` | Worker enforcement (§4) |
| `medicine.html`, `medicine.css`, `i18n/en-med.js`, `i18n/zh-med.js` | Live panel, auto panel; 42 page strings in TH / EN / ZH (plus 2 consent-screen strings in `lensiq-ai.js`) |

## 2. Tests (fixed before building; sha256 in `~/LENSIQ-field/evals/live-scan/locked.sha256`)

| Test | Checks | Result |
|---|---|---|
| `tests/unit/pc-live.test.js` | frame hints, <= 5 fps, auto-capture, merge, checklist, product key, every auto-send refusal reason, real guard on real texts | 8/8 |
| `tests/unit/backend-pc-auto.test.js` | A1 gate + valid code needed; A2 public path unchanged; A3 auto filter; A4 boolean; A5 Product Check features only; A6 auto rate limit; A7 photo refused on auto, nothing auto / no facts / no code reaches the provider | 7/7 |
| `tests/e2e/product-check-live.e2e.mjs` | 10 checks: live default, merge, hidden page, public unchanged + lookup opt-in, tester auto-send once per product, filters, withdraw / cap / hidden, "photo" remembered stays text only, REAL models on the fake camera, EN / ZH + 360 px | 10/10 |
| `live-leak-score.mjs` (outside the repo) | P7 leak measurement with the new flow | §5 |

Changes after the lock (listed in `locked.sha256`, none loosens a check): one invalid fixture value, line wrapping, and the
e2e image-mode check now asserts text-only auto-send (the product was changed instead of an older privacy test, §4).

## 3. Latency (source: synthetic label on a fake camera; this Mac, headless Chrome without WebGL)

Tool: `~/LENSIQ-field/evals/live-scan/live-measure.mjs`; result `live-measure-2026-11-12T02-23-43-884Z.json`, log
`live-measure-run.log`. Real models (PP-OCRv5 det + Thai rec, the browser's barcode reader, BlazeFace), a fake camera
showing a synthetic Thai label with an EAN-13, a fake Worker answering at once. 8 warm trials per condition (models already
loaded) plus one cold trial (first model download from a local server). WebGL through SwiftShader (software), because
BlazeFace does not run here without WebGL (§9).

| Condition (this Mac, headless Chrome) | First on-device result (barcode) p50 / p90 | First OCR text (reg. number shape) p50 / p90 | AI request leaves the page p50 / p90 | Reg. number read |
|---|---|---|---|---|
| Desktop CPU | **19 / 28 ms** | **577 / 671 ms** | 647 / 753 ms | 8/8 |
| Chrome CPU throttling 4x ("mid-range phone" proxy) | **45 / 130 ms** | **2,372 / 3,114 ms** | 2,627 / 3,620 ms | 8/8 |
| Cold (first use, model download), desktop / 4x | 284 / 243 ms | 1,444 / 4,187 ms | 1,935 / 9,424 ms | |

Against the targets:

- **First on-device result <= 1 s: met in both conditions** when the label has a barcode (the barcode is read first). The
  first OCR text meets it on desktop (0.58 s) and **misses it at 4x (2.4 s)**; a label without a barcode shows its first
  result only with the OCR.
- **AI fields <= 3 s: an estimate, not measured end to end.** AI fields on screen ~ "AI request leaves" + the model
  (§6, p50 through the local Worker) + the phone's network:
  - desktop: 0.65 s + Gemini 1.54 s = **~2.2 s** (p90 0.75 + 1.94 = ~2.7 s) — within 3 s; with Haiku 0.65 + 3.28 = ~3.9 s
    (p90 ~5.9 s) — over;
  - 4x: 2.6 s + Gemini 1.5 s = **~4.2 s** (p90 ~5.6 s) — **over 3 s**; with Haiku ~5.9 s.
- So the 3 s AI target is reachable only with Gemini on a fast device. On a mid-range phone the on-device OCR (about
  2.3 s at 4x) is the larger part; the next lever is a smaller OCR input for the live reading (fewer lines / a lower
  detection size), measured on a real phone first.

- From the moment the live scan reports a steady frame. "AI sent" = the tester auto-send request leaves the page after the
  guard, the evidence gate and the face check. AI fields on screen = "AI sent" + the model's latency (§6) + the network.
- **Still needed: a real phone** (mid-range Android, Thai label, store light). CPU throttling 4x is only a proxy; it does
  not model the camera pipeline, thermal limits or WebAssembly speed on ARM.

## 4. Tester-only auto-send: the rules (round 1; SUPERSEDED by §12: no automatic sending, one tap)

- Shown only while the live scan runs, the closed-test gate is on and the tester code is accepted. Off by default.
- One consent: "Turn on" opens the consent screen again with the auto-send paragraph. Auto-send is on only if "remember my
  choice" was ticked and stored (`lq-pc-auto` holds the provider chain; a changed chain = off).
- A round goes out by itself only when ALL hold (`LQPCLive.autoDecision`): tester; auto-send on; page visible;
  `LQPCGuard.aiGate` allows (product evidence, not dispensing, no personal-document sign; session evidence never used);
  the guard finds nothing and no possible name; the face detector ran and found no face; this product (GTIN, else
  registration number, else a hash of the text) not sent yet; one round per steady view; at most 10 products per page
  session. Visibility and withdrawal are checked again right before each request.
- **Text only.** Building the automatic photo broke the older fixed test "exactly one image encoding in Product Check, after
  the face blur and after the user pressed Use this picture" (`tests/unit/pc-ondevice.test.js`). That test was not changed;
  auto-send was made text only. A tester with "photo" remembered gets the text sent automatically and is told that a
  photo still goes through "Ask AI" with the preview. Sending photos automatically needs the owner's decision.
- What was sent is shown (`#pcAiAutoText`). "Stop sending automatically and withdraw consent" clears the remembered consent
  and the auto-send choice at once; queued requests are dropped.
- Anything refused behaves as today; the reason is shown and "Ask AI" (preview, confirm) still works.
- **Worker** (`gateway.js`): `auto` must be a boolean; `auto: true` is refused (403 `auto_not_allowed`, no provider call)
  unless `TESTER_GATE=required` and this request's tester code is valid, and only for features with an `autoCheck`
  (pc_fields, pc_claims, pc_translate). After `build()` (every existing check keeps its own code), `autoCheck` refuses
  (`ai_off_auto_filter`) the placeholder, a possible name, the `autoBlock` list (§5a), session evidence, a photo or no text. An auto-only limit per caller:
  6 a minute, 150 a day (given back when refused before a provider call). The flag, the tester code and the facts never
  reach a provider (A7).
- **Client-only, stated plainly:** the face check, "one round per product / per steady view", the session cap and that the
  text is the device's merged OCR. A modified client could still send without the `auto` flag through the public path,
  which the Worker already accepted before (it cannot see whether a preview was shown).

## 5. Leak measurement with the new flow (source: synthetic, the two locked sets; scored by the scorer fixed before building)

Final log (after the review fixes, §5a): `~/LENSIQ-field/evals/live-scan/live-leak-run-2026-11-12T02-45-12-929Z.log`
(detail JSON next to it). Guard sha256 `819247eb…` (adds `autoBlock`; no existing rule changed), `lensiq-pc-live.js` sha256
`083946e8…`. Earlier runs (01:50, 02:21, and the reviewer's 02:33) on the earlier code are kept; their personal-item
counts are the same (0), the product auto-send rate was 230/360 before the stricter block list. Image mode counts every personal item on a capture whose photo
would be sent (worst case; auto-send sends no photo at all now).

| Set | Flow | Text mode: personal items reaching the AI (languages measured, synthetic: Thai 78, English 79, Chinese 63, Japanese 28, Korean 12 items; not a claim for Japanese / Korean names without a cue word, which still reach the AI on the JA / KO hold-outs, `docs/product-check/PC-JK-RESULTS.md`) (p7b languages: Thai 319, English 161, Chinese 51, Japanese 56, Korean 27 items) | Image mode: captures with personal data whose photo is sent |
|---|---|---|---|
| p7 (`470d3e7b…`, 260 items on 94 captures) | auto, single reading | **0/260** [0.0–1.5] | **0/94** |
| p7 | auto, merged from 3 damaged readings | **0/260** | **0/94** |
| p7b (`371748a2…`, 614 items on 214 captures, session evidence off) | auto, single | **0/614** [0.0–0.6] | **0/214** |
| p7b | auto, merged | **0/614** | **0/214** |
| both | manual (unchanged) | 0/260; 0/614 | (as published in P7-RESULTS) |

- Target (0 in both modes): **met**.
- Cost of the stricter auto rule: real product labels auto-sent 217/360 = 60.3 % [55.1–65.2] on p7, against 83.1 % that
  pass the manual gate (the rest are possible names such as Latin brand pairs, maker persons, maker phones). They keep the
  manual path.
- A first run at 01:40 UTC on the same code as the 01:50 run gave identical results; its log was removed by mistake when
  re-running (stated so the log list is complete). The 01:50 and 02:21 logs are kept.
- These sets hold one object per capture. Two objects in one reading are measured in §5a.

### 5a. Independent review (2026-11-12) and the fixes

An independent reviewer agent re-ran the scorer (same numbers) and its own check (client path AND Worker path per item:
p7 241 / p7b 55 captures sent, 0 personal items, 0 client / Worker disagreements), all unit tests of the change (44/44) and
the live e2e (10/10). It found one **blocker**: two objects in one reading.

| Stress case (reviewer's script; synthetic; worst-case counting of items literally in the sent text) | Before the fixes | After |
|---|---|---|
| A product reading merged with a personal capture (25 products x 308 personal captures, both orders) | 430 / 7,700 sent, 988 items | **0** items (the personal text is never merged; a cut drops the earlier barcodes) |
| Product label and personal capture in the SAME frame (P001-clean + each of 308) | 13 / 308 sent, 30 items (ja 10, ko 1, hk 1, en 1) | **2 / 308 sent, 5 items** (a Korean lab report, a Hong Kong dispensing label read with OCR noise) |

Fixes (all also in the Worker where it can check them):

1. **Content-based scene cut** (`LQPCLive.sameObject`): a new reading that shares fewer than half of its lines with the merged
   reading is another object: the reading starts over and the earlier barcodes are dropped.
2. **Stricter auto block list** (`LQPCGuard.autoBlock`, client `autoTextCheck` and Worker `autoCheck`): a phone-like group of
   9–11 digits (a 13-digit Thai food / cosmetic number or a GTIN is not one), a non-Thai form of address (様, さん, 님, 씨,
   先生, Mr, Dear …) or letter / note wording stops the auto-send. Cost: 4 more product labels of 360 fall back to the
   manual path (217/360).
3. **No photo on an auto request at the Worker** (A7 now asserts the refusal; it was asserting acceptance — tightened).
4. **The ordinary "withdraw / forget my choice" button** now also switches auto-send off at once (it only cleared the consent).

**Still missing the 0 target in the same-frame stress case (2/308 captures, 5 items). By the standing rules this goes to
the owner (Thai summary, decision 0).** Notes from the review that stay as stated limits: a label without a barcode or a
registration number can be sent again after a scene cut (its key is a text hash; the cap of 10 still applies); one round is
up to three requests (fields, claims, translate); the face check looks at the last frame read; the official lookup without
a tap (owner decision 4) is already built.

## 6. Model comparison for the live flow (source: synthetic `docs/product-check/p7-ai-testset.json`)

Local `wrangler dev` (AI_EVAL_LOCAL=1, local D1), OpenRouter with `zdr: true`, one call in flight, 3 rounds in alternating
order. 16 `pc_fields` labels x 3 = 48 calls, 10 `pc_translate` texts x 3 = 30 calls per model. Latency = client wall time
to the local Worker (includes OpenRouter routing). Accuracy: the P7 scorer (5 fields per label). File:
`~/LENSIQ-field/evals/live-scan/model-compare-2026-11-12T01-48-19-042Z.json`.

| Model (ZDR route) | Feature | Answered | p50 / p90 ms | Field accuracy [95 % CI] | type / brand / reg / lot / exp | USD per 1,000 |
|---|---|---|---|---|---|---|
| claude-haiku-5.5 | pc_fields | 47/48 (one 503) | 3282 / 5127 | 90.6 % [86.2–93.7] | 47 / 38 / 37 / 47 / 44 of 47 | 0.37 |
| gemini-3.5-flash-lite | pc_fields | 48/48 | **1539 / 1937** | 87.9 % [83.2–91.5] | 48 / 25 / 45 / 48 / 45 of 48 | 0.78 |
| claude-haiku-5.5 | pc_translate | 30/30 | 1667 / 2145 | lines 69/69, numbers 66/66, terms 69/69 | | 0.13 |
| gemini-3.5-flash-lite | pc_translate | 30/30 | 1365 / 1555 | lines 69/69, numbers 66/66, terms 66/69 | | 0.41 |

- Spend: OpenRouter key usage 2.655071 → 2.726036 = **0.071 USD** (gateway settled 0.071). Budget 0.5 USD: kept.
- Neither model invented a registration number. Accuracy intervals overlap: no significant difference. Haiku reads brands
  better; Gemini reads registration numbers better (45/48 vs 37/47), which the live checklist and the lookup use.
- **Proposal:** Gemini 3.5 Flash-Lite as primary for `pc_fields` in the live flow, Haiku 5.5 as fallback; translation stays
  Haiku first (cheaper, equal coverage, the latency gap is small). Reason: only Gemini's p90 (1.9 s) leaves room for the
  on-device part inside the 3 s AI target. **Not switched**: Gemini is held out of the default chains by the owner's open 18+
  question (P8). The chain is an admin setting; nothing in the code changes.

## 7. Legal list text (L57; for the owner to add; draft for counsel) — one-tap version (round 2)

**TH:** สำหรับกลุ่มผู้ทดสอบแบบปิดเท่านั้น (รหัสผู้ทดสอบถูกต้อง และเปิดประตูผู้ทดสอบ): หลังผู้ทดสอบยินยอมหนึ่งครั้งและเลือก "จำการเลือกนี้"
การกด "ขอความเห็นจาก AI" หนึ่งครั้งจะส่งข้อความที่อ่านได้บนเครื่องให้ผู้ให้บริการ AI ที่ระบุในหน้าขอความยินยอมทันที **แทนการแสดงตัวอย่างและให้กดยืนยันอีกครั้ง**
เฉพาะข้อความที่ผ่านตัวกรองทั้งหมดบนเครื่อง (เป็นฉลากสินค้า ไม่ใช่ฉลากจ่ายยาหรือเอกสารส่วนบุคคล ไม่พบชื่อ ข้อมูลส่วนตัว คำที่อาจเป็นชื่อคน
เลขคล้ายเบอร์โทร หรือถ้อยคำจดหมาย ไม่พบใบหน้าในภาพ และข้อความไม่ถูกแก้) ไม่มีการส่งโดยที่ผู้ทดสอบไม่ได้กด ไม่ส่งภาพด้วยวิธีนี้
ข้อความที่ส่งแสดงบนจอหลังส่ง ผู้ทดสอบหยุดและถอนความยินยอมได้ทันที เซิร์ฟเวอร์ปฏิเสธคำขอแบบไม่มีตัวอย่างที่ไม่ได้มาจากผู้ทดสอบ
ผู้ใช้ทั่วไปยังต้องดูข้อความและกดยืนยันก่อนส่งทุกครั้ง ข้อจำกัด: ตัวกันชื่อแบบกฎอาจพลาดชื่อที่ไม่มีคำนำหน้า การตรวจใบหน้าบังคับได้เฉพาะบนเครื่อง
ผู้ให้บริการปลายทาง (Google Vertex ผ่าน OpenRouter) อาจเก็บข้อความที่ระบบความปลอดภัยตั้งธงไว้ได้ถึง 90 วัน (§10)

**EN:** Closed tester group only (valid tester code, tester gate on): after one consent with "Remember my choice", one tap on
"Ask AI" sends the text read on the device to the AI provider named on the consent screen at once, **replacing the
preview and second confirmation**, only for text that passes every on-device filter (a product label; not a dispensing
label or a personal document; no name, personal data, possible name, phone-like number or letter wording found; no face
in the picture; text not edited). Nothing is sent without the tester's tap, and no photo is sent this way. The text sent
is shown afterwards; the tester can stop and withdraw at once. The server refuses no-preview requests that do not come
from a tester. Everyone else still sees and confirms the text before every send. Limits: the rule-based name guard can
miss names without a cue; the face check is enforced on the device only; the downstream provider (Google Vertex via
OpenRouter) may keep prompts flagged by its safety classifiers for up to 90 days (§10).

## 8. Checks run

| Check | Result |
|---|---|
| `npm run lint` (incl. `check-ai-providers`) | OK |
| `npm run format:check` | OK |
| `npm run typecheck` (the two new files are gated) / ratchet `typecheck:report` | OK / 627 (max 627) |
| `npm run test:unit` | 1547 / 1547 |
| `npm run test:backend` | 325 / 325 (incl. the 7 new) |
| `npm run test:integration` | 7 / 7 |
| `npm run accuracy:check` | OK |
| `npm run zh:coverage`, `en:coverage` (medicine.html 0.0 % Thai; shared 70/70) | OK |
| `npm run csp:check`, `node tools/csp-meta.mjs --check` | 71 pages OK, 0 need update |
| `node tools/mobile-audit.mjs medicine` (390 TH; 360 ZH) | 0 findings |
| e2e `product-check*` + `medicine` | 83 / 83 (`product-check*`, `medicine`, `camera-mobile`; the new live file 10 / 10) |

## 9. Risks and next step

1. No real phone measured; thresholds (sharpness, "label present", glare) are heuristics chosen on synthetic frames.
   A white pack area can read as "glare" (the scan still captures after about 2 s).
2. Auto-send relies on the rule-based name guard plus the new "possible name" stop; the guard's independent recall is 62 %.
   The leak sets show 0, but they are synthetic.
3. Face check, once-per-product and the session cap are client-side. **Finding:** BlazeFace does not run in headless Chrome
   WITHOUT WebGL ("activeTexture" error), contrary to a comment in `lensiq-pc-run.js`; there the face check fails closed and
   auto-send never goes out (the manual path is unchanged). The latency run therefore used SwiftShader WebGL (software).
   Phones have WebGL; a browser without it gets no auto-send.
4. The official lookup now runs without a tap when the user already allowed online lookups (owner to confirm).
5. Next: a real-phone session (Exam / Gate / Crowd pilots unaffected), the owner's decisions in the Thai summary, then an
   independent reviewer re-measures the leak sets and the e2e.

## 10. Gemini 3.5 Flash-Lite as primary: terms check (round 2, owner decision 3)

Fetched 2026-11-12 from official pages by a research agent (raw copies kept in the session scratch; quotes verbatim).
How our route maps: OpenRouter's public provider list gives slug `google-vertex` with `"terms_of_service_url":
"https://cloud.google.com/terms/"`; `openrouter.ai/api/v1/endpoints/zdr` lists 5 ZDR endpoints for
google/gemini-3.5-flash-lite, all google-vertex, all `"safety_retention": true` (no AI Studio endpoint, so the Gemini API
terms do not apply with `zdr: true`).

| Term | Applies to our route? | Quote | URL (page date) |
|---|---|---|---|
| Gemini API Additional Terms, age | No (we do not use the Gemini API; the terms exclude Google Cloud services) | "You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service (collectively, "API Clients") that is directed towards or is likely to be accessed by individuals under the age of 18." / "For clarity, these Terms do not govern your direct use of any Google Cloud Platform service" | https://ai.google.dev/gemini-api/terms (→ aistudio.google.com/docs/terms; effective March 23, 2026) |
| Google Cloud Service Specific Terms §20(d) Age Restrictions | **Yes** (binds OpenRouter as Google's customer; passed on to us by OpenRouter §5) | "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18." | https://cloud.google.com/terms/service-terms (last modified November 11, 2026) |
| §20(f) | Yes | "Google may immediately suspend or terminate Customer's use of a Generative AI Service based on any suspected violation of Section 17(b) or subsection (d) above." | same |
| §20(e) Healthcare Restrictions | **Yes** | "Customer will not, and will not allow End Users to, use the Generative AI Services for clinical purposes … as a substitute for professional medical advice, or in any manner that is overseen by or requires clearance or approval from any applicable regulatory authority." | same |
| Training | Yes | §18: "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction." | same |
| OpenRouter pass-through | **Yes** | §5.1: "By accessing or using any Model through the Service, you agree, and will ensure that your Authorized Users and customers agree, to comply with the applicable terms for each Model ("Model Terms")…"; §2: "You must be at least 18 years of age to use the Service." (about us, the customer) | https://openrouter.ai/terms (last updated August 31, 2026) |
| OpenRouter ZDR on Vertex | Yes | "Starting October 18, 2026, Google requires Safety Retention for Google models served through Vertex. … it may retain prompts that its safety classifiers flag, for up to 90 days, for abuse monitoring. … These endpoints don't meet a strict Zero Data Retention requirement." | https://openrouter.ai/docs/guides/features/zdr (modified 2026-11-11) |

Gemini API (AI Studio) data use, commercial use and retention, for comparison (these terms do NOT govern our Vertex route;
https://ai.google.dev/gemini-api/terms → aistudio.google.com/docs/terms, effective March 23, 2026):

| Topic | Quote |
|---|---|
| Unpaid tier: used to improve Google products | "When you use Unpaid Services, including, for example, Google AI Studio and the unpaid quota on Gemini API, Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies…" and "human reviewers may read, annotate, and process your API input and output. … Do not submit sensitive, confidential, or personal information to the Unpaid Services." |
| Paid tier: not used to improve products | "Your access to Gemini API is a "Paid Service" only when accessing the API through a Cloud Project associated with an active billing account." / "When you use Paid Services … Google doesn't use your prompts … or responses to improve our products, and will process your prompts and responses in accordance with the Data Processing Addendum…" |
| Paid tier: retention | "For Paid Services, Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations of the Prohibited Use Policy … This data may be stored transiently or cached in any country in which Google or its agents maintain facilities." (no number of days given) |
| Commercial / consumer use | "Use of Google AI Studio and Gemini API is for developers building with Google AI models for professional or business purposes, not for consumer use." (no "you may use … for commercial purposes" wording; "consumer use" is not defined) |
| Medical | "You may not use the Services in clinical practice, to provide medical advice…" |
| Vertex (our route), training | "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction. This applies to all managed models on Gemini Enterprise Agent Platform, including GA and pre-GA models." (docs.cloud.google.com …/zero-data-retention, updated 2026-11-10); implicit cache "deleted no later than 24 hours after it's written" and "never used to train or fine-tune models" |

Summary: on our route (Vertex via OpenRouter, ZDR) there is **no training on our data**; retention is **Safety Retention** (flagged
prompts up to 90 days) plus a cache of at most 24 h; commercial use of Vertex is ordinary Google Cloud use, but the
**under-18 rule (§20(d)) and the medical rule (§20(e)) apply**. The Gemini API itself would be worse for us (unpaid tier
trains and allows human review; "not for consumer use"; the same 18+ rule). **No provider was switched.**

**Finding: conflict.** A medicine / product-label checker open to the public without an age gate is plausibly "likely to be
accessed by individuals under the age of 18" (§20(d)), with immediate suspension as the remedy (§20(f)). **Gemini is not
made the default; Haiku 5.5 stays primary** (no chain or `ai-deploy-defaults` change). Two further points for the owner:

1. **Haiku 5.5 on our route is also served by Google Vertex** (P8: `anthropic/claude-haiku-5.5` → google-vertex/global).
   Whether §20(d) / §20(e) also cover a partner model served on Vertex was not settled from these pages; counsel (or a
   non-Vertex route for Claude) should confirm before a public launch. During the closed adult tester group the age
   clause is less of a concern.
2. Safety Retention: flagged prompts may be kept up to 90 days by Google; user-facing text must not say "never stored by
   anyone". The consent screen shows each provider's retention text from the configured chain; it should be checked.

## 11. Server refusal codes (round 2, owner decision 13)

`LQAI.send` now keeps the Worker's documented refusal `code`; the AI card shows the existing translated notices for
`ai_off_dispensing`, `ai_off_personal_doc`, `ai_off_no_product`, and two new TH / EN / ZH notices for
`ai_off_personal_data` and `ai_off_auto_filter`, instead of the generic "AI unavailable" (e2e check 8, all four main codes).

## 12. No automatic sending; tester one-tap (round 2, owner decisions 1 and 2)

- The automatic path is **removed** (not just switched off): the live scan never triggers an AI request; one-tap runs only
  inside the "Ask AI" click handler. e2e check 5 scans three products with one-tap on and asserts zero AI requests.
- One-tap rules (`lensiq-pc-ai.js` `oneTap`): tester; one-tap on ("lq-pc-auto" set on a consent screen that explains
  one-tap, with "remember my choice"; same providers); page visible; `LQPCGuard.aiGate`; guard finds nothing; no possible
  name; `autoBlock` finds nothing; the text is this capture's on-device OCR exactly (no edit); the face detector ran on the
  capture and found no face. Any miss: the reason (`#pcAiAutoSkip`) and the usual preview. A first tap that opens the
  consent screen sends at once once "remember" is ticked.
- Text only; a photo still needs "Use this picture". Any withdraw clears the consent and the one-tap choice at once.
- Worker: unchanged from round 1 (`auto: true` = the no-preview path: tester + valid code only, `autoCheck`, 6 / min).

## 13. Japanese / Korean guard gaps (round 2, separate commit)

Added to `lensiq-pc-guard.js` (no rule removed or loosened): Korean name fields 성명 (with or without a colon), 환자명 /
환자 성명 / 환자 이름, 수진자, 이름: (not after 제품 / 상품 / 약품); an OCR-damaged "Patient:" (Patiet:, Patint:); Korean
registration / chart / patient numbers with split syllables (등록번호 …); the Korean resident registration number;
생년월일 / 생일 / 生年月日 birth dates; Korean and Japanese field words that end a name; Korean and kana letters count as a
name value. Dev cases: `tests/unit/pc-guard-ko-ja.test.js` (with no-false-redaction counter-cases).

| Check | Result |
|---|---|
| Old vs new guard on every fixed text (p7, p7b locked sets; guard dev + hold-out; evidence dev set: 1,773 texts) (`~/LENSIQ-field/evals/live-scan/guard-diff.mjs`) | 15 texts changed, **0 detections lost, 0 gate decisions changed**; photo blocked on 10 more texts (all non-product documents / dispensing labels); no product label changed |
| Chinese patient regression set on main (`pc-guard-zh-patient-regression.test.js`) and every guard test | pass |
| P7 / P7b locked figures (`live-leak-score.mjs`, log `live-leak-run-2026-11-12T04-13-03-938Z.log`) | personal items to AI 0/260, 0/614 (text and image); product labels passing the manual gate 299/360 (unchanged); one-tap eligible 217/360 |
| Reviewer's stress case: P001-clean + each of 308 personal captures in one reading | 2/308 captures, 5 items → **0/308, 0 items** |
| Wider stress (25 one-tap-eligible labels x 308 personal captures x 2 orders = 15,400 readings) | 22 sent, 22 items, **all from one Thai medicine-reminder note** (REQV-N050-2: a bare Thai name after the kinship word ยาย, no cue); Korean / Japanese 0. Before this commit: 23 sent, 25 items (the Korean insurance card too). The Thai bare-name gap was closed in round 3 (§15): **0 sent, 0 items** |
| Merged readings (25 x 308 x 2 orders) | 0 personal items in any sent text |

## 14. Round 2 checks and screenshots

- Rebased on `main` (5c5779d). Checks on the final state: lint, format-check, typecheck (ratchet 627 ≤ 627) OK; unit
  1567/1568: the one failure is the timing test "fallback walker: per-attempt deadline" in `backend-ai-gateway.test.js`
  under a machine load average of ~70 (other sessions); the file passes 32/32 twice when run alone. e2e `product-check*`,
  `medicine`, `camera-mobile`: 83/83 (live file 10/10 with the rewritten one-tap checks).
- Screenshots after all round-2 changes (360 px, Thai, fake camera, synthetic label, no person):
  `~/LENSIQ-field/evals/live-scan/screens/01-…09-*.png` (01 tab with live scan on by default, 02 "point at the label",
  03 "hold still", 04 reading without a shutter, 05 checklist and first results, 06 tester one-tap off by default,
  07 consent screen with the one-tap note, 08 one tap: the text sent and "stop and withdraw", 09 AI fields in the card).
- Latency (§3) is from round 1; the live scan itself did not change in round 2. "AI request leaves the page" is now
  measured from the tester's tap, not from a steady frame, and was not re-measured.

## 15. Round 3: one-tap stops on a note to a person (source: synthetic)

`LQPCGuard.autoBlock` (the page's one-tap check and the Worker's `autoCheck`) also stops one-tap, falling back to the usual
preview, on a note to a person: Thai "ไว้ให้", or ให้ / ของ / ถึง / แด่ / สำหรับ + a kinship word or title (ยาย ตา ปู่ ย่า พ่อ
แม่ ลูก หลาน น้อง พี่ ป้า ลุง น้า อา คุณ นาย นาง นางสาว น.ส. ด.ช. ด.ญ.; label words such as คุณค่า, คุณภาพ, อาการ, อาหาร,
ตาม, ลูกค้า are excluded; bare สำหรับ is not a stop); English "for / to (my) grandma, mum, Mr …"; Chinese 给 / 給 + a kinship
word or a surname + 先生 / 女士 / 小姐 / 老师. It removes nothing. Commit `ad844fa`.

| Measure (synthetic) | Before | After |
|---|---|---|
| Wider stress: 25 one-tap-eligible labels x 308 personal captures x 2 orders = 15,400 readings | 22 sent, 22 items | **0 sent, 0 items** |
| Reviewer's stress case: P001-clean + each of 308 personal captures | 0/308 | **0/308** |
| Locked P7 / P7b: personal items reaching AI, text and image mode (languages measured, synthetic: Thai 78, English 79, Chinese 63, Japanese 28, Korean 12 items; not a claim for Japanese / Korean names without a cue word, which still reach the AI on the JA / KO hold-outs, `docs/product-check/PC-JK-RESULTS.md`) (p7b languages: Thai 319, English 161, Chinese 51, Japanese 56, Korean 27 items) | 0/260; 0/614 | **0/260; 0/614** |
| One-tap-eligible product labels (p7) | 217/360 | **217/360** |
| Old vs new guard on 1,773 fixed texts (redaction, gate, photo, dispensing) | — | 0 changed |

Tests: affected unit files 89/89 (new `tests/unit/pc-guard-onetap-notes.test.js`); e2e `product-check-live` +
`product-check-ai` 18/18. Logs: `~/LENSIQ-field/evals/live-scan/stress-sameframe-2026-11-12-notes.log`,
`live-leak-run-2026-11-12T16-03-09-672Z.log`. Screenshots not re-taken (no visible change).

# ดีไซน์: ช่องทางติดต่อ / ขอใบเสนอราคา (ข้อมูลส่วนบุคคลน้อยที่สุด) / Design: contact and request-a-quote (minimum personal data)

> **สถานะ 12 พ.ย. 2569 (บ่าย): เจ้าของสั่งเปิดแบบฟอร์มขอใบเสนอราคา** เมื่อกล่องรับ (มีตัวนับยังไม่อ่าน) ข้อความความเป็นส่วนตัว (แสดงจริง 3 ภาษา)
> ช่องทางติดต่อ LINE OA @632yliiw ช่องข้อมูลขั้นต่ำ และ Turnstile + จำกัดอัตรา + เพดานรายวัน พร้อม และเกตผ่าน ดูข้อ 8 ท้ายเอกสาร
> ข้อความในข้อ 8.2 เป็นข้อความเดียวกับใน `privacy.html` ทนายยังต้องตรวจก่อนขายจริง (`docs/PDPA-NOTES-FOR-COUNSEL.md` F7)
> **Status 2026-11-12 (afternoon): the owner switched the quote form ON** (inbox with unread badge, public privacy text, LINE OA
> @632yliiw as the only public contact, minimum fields, Turnstile + rate limit + daily cap). See section 8. English: second half.
> (11 พ.ย. 2569: ดีไซน์เท่านั้น / 2026-11-11: design only. ข้อ 1 ถึง 7 ด้านล่างคือดีไซน์เดิม เก็บไว้ตามเดิม / sections 1 to 7 below are the original design, kept as written.)

---

# ภาษาไทย

## 1. สรุปสั้น

- **ของที่มีอยู่แล้ว:** แบบฟอร์ม "ขอเดโม" ที่ `index.html#contact`, ตัวส่ง `lensiq-leads.js`, เส้นทาง `POST /v1/leads` ใน `backend/src/leads.js`, API กล่องรับของแอดมิน (ยังไม่มีหน้าจอ) และการลบอัตโนมัติ 180 วัน
  ทั้งหมด**สร้างและมีเทสต์แล้ว แต่ยังไม่เปิดใช้จริง** (ดู §2)
- **คำแนะนำ:** ใช้ **ตัวเลือก C** (เส้นทาง `/v1/leads` ที่มีอยู่ ปรับเป็นชุดข้อมูลขั้นต่ำ) เมื่อเจ้าของอนุมัติ เพราะเป็นตัวเลือกเดียวที่ **ลบอัตโนมัติ ลบรายคำขอได้ ป้องกันบอทได้ ไม่เก็บ IP
  อยู่ในบัญชีที่เราควบคุม (`lensiq-*`) ต้นทุน 0** ระหว่างนี้ไม่เปิดอะไร หน้าเว็บคงพฤติกรรมเดิม (เก็บในเบราว์เซอร์ของผู้เยี่ยมชม และแสดงอีเมล/LINE เฉพาะเมื่อเจ้าของกรอก `LENSIQ_SELLER`)
- **เจ้าของต้องตัดสินใจ:** §6 (รวมถึงข้อมูลติดต่อของเจ้าของ ซึ่งเป็นข้อมูลธุรกิจ ไม่ใช่รหัสลับ)

## 2. ของที่มีอยู่แล้ว (อ่านจากโค้ดและเทสต์ ไม่ได้รันอะไร)

| ส่วน | ไฟล์ | ทำอะไร | เทสต์ |
|---|---|---|---|
| แบบฟอร์มหน้าแรก | `index.html` (`#contact`, `#leadForm`) + `home.js` | ช่อง: ชื่อ (บังคับ) · บริษัท · อีเมล (บังคับในหน้า) · เบอร์โทร · สนใจด้านใด (บังคับ) · แพ็กเกจ · รายละเอียด (≤ 1,000 ตัวอักษร) · ติ๊กยินยอม "ยินยอมให้ติดต่อกลับตามข้อมูลที่ให้ไว้" (บังคับ) ลิงก์ `?interest=…` ตั้งค่าช่อง "สนใจ" ล่วงหน้า | `tests/unit/commercial-r11.test.js` (ตัวส่ง ข้อความ 3 ภาษา ลิงก์ interest) · `tests/e2e/commercial.e2e.mjs` (โหมด fallback / none) |
| ตัวส่ง | `lensiq-leads.js` | ลำดับ: (1) ถ้าตั้ง `LENSIQ_API_BASE` ส่ง `POST /v1/leads` พร้อม token Turnstile (2) ถ้าไม่ได้ สร้างลิงก์ `mailto:` (หัวเรื่อง+เนื้อหากรอกให้) และ/หรือลิงก์ LINE OA จาก `LENSIQ_SELLER.email` / `.line` ผู้เยี่ยมชมเป็นคนกดส่งเอง (3) ถ้าไม่มีทั้งคู่ บอกตรง ๆ ว่ายังไม่ได้ส่ง และ**เก็บคำขอในเบราว์เซอร์ของผู้เยี่ยมชมเท่านั้น** (`localStorage` `lq-leads` สูงสุด 10 รายการ) พร้อมปุ่มคัดลอก/ลบ | `tests/unit/commercial-r11.test.js` "lensiq-leads: clean, mailto, LINE and fallback choice" |
| ฝั่งเซิร์ฟเวอร์ | `backend/src/leads.js`, ตาราง `leads` (`backend/migrations/0008_round11_backend.sql`), `backend/src/retention.js` | รับ `{name, org?, email?, phone?, interest, plan?, message?, source?, lang?, consent: true}` ต้องมีอีเมลหรือเบอร์อย่างน้อยหนึ่งอย่าง; Turnstile action `lead` **ปิดประตูเมื่อล้มเหลว (fail closed)**; จำกัด 5 ครั้ง/ผู้เรียก/ชั่วโมง และ `LEADS_GLOBAL_DAY` (200) ต่อวันของไทย; **ไม่เก็บ IP หรือ user agent** (แฮชผู้เรียกที่เปลี่ยนทุกวันใช้จำกัดอัตราเท่านั้น ไม่เก็บคู่กับคำขอ); ลบอัตโนมัติ `LEADS_DAYS` = 180 วันหลังรับ; เจ้าของได้บันทึก `alert.lead_new` และ (ถ้าตั้ง `ALERT_WEBHOOK_URL`) การแจ้งเตือน**ที่ไม่มีรายละเอียดของผู้ส่ง** | `tests/unit/backend-fulfilment-refunds.test.js` "leads: Turnstile fail-closed, validation, stored with retention, admin inbox list / ack / delete, push without PII" · `tests/unit/backend-deploy-gate.test.js` (เส้นทางปิดในชุดทดสอบ) |
| กล่องรับของเจ้าของ | `GET /admin/api/leads`, `POST /admin/api/leads/:id/ack`, `DELETE /admin/api/leads/:id` | ดูคำขอใหม่ ทำเครื่องหมายจัดการแล้ว ลบทีละรายการ (กรณีผู้ส่งขอให้ลืม) **เป็น API ที่ต้องล็อกอินแอดมินเท่านั้น: ค้นหาคำว่า "lead" ใน `admin.html` และ `admin.js` ไม่พบ จึงยังไม่มีหน้าจอดูกล่องรับ** | ชุดเดียวกับข้างบน |
| กล่อง "แจ้งเตือนเมื่อเปิดขาย" | `pricing.html`, `account.html` | ใช้ตัวส่ง `lensiq-leads.js` ตัวเดียวกัน | `commercial-r11.test.js` |
| ฟอร์มดูใบหน้า (ดูดวง) | `faceread.html` | ชื่อเล่น+ช่องทางติดต่อ เก็บในเครื่องเท่านั้น ปิดเป็นค่าเริ่มต้น ต้องติ๊ก (`docs/PDPA-NOTES-FOR-COUNSEL.md`) | `tests/unit/fortune-lead-echo.test.js` |

### สถานะวันนี้

- ชุดทดสอบ `lensiq-api-test` **ปิดเส้นทาง `/v1/leads`** (`PUBLIC_ROUTES` ใน `backend/wrangler.toml` ไม่มี `/v1/leads` ทั้งตัวนับทดสอบ แอนะลิติกส์ การเรียกเก็บเงิน ก็ปิด)
  จึงไม่มีคำขอใดถูกส่งไปเซิร์ฟเวอร์วันนี้
- `LENSIQ_SELLER.email`, `.line`, `.dpo_email` ใน `lensiq-config.js` **ว่าง** หน้าเว็บจึงแสดงข้อความว่า "ช่องทางติดต่อจะประกาศก่อนเปิดขาย" และเก็บคำขอไว้ในเบราว์เซอร์ผู้เยี่ยมชมเท่านั้น (ตรงกับ `docs/pdpa/retention-table.md`)
- **ข้อสังเกตที่พบ (ยังไม่แก้):**
  1. ลิงก์ติดต่อใน one-pager ใช้ `interest=education` (Exam) และ `interest=security` (Gate) แต่ช่อง "สนใจด้านใด" ไม่มีตัวเลือกนี้ (มี marketing, store, photobooth, addons, hr, creative, fortune, unsure)
     `home.js` จึงไม่เลือกให้ล่วงหน้า (ลิงก์ของ Crowd ใช้ `marketing` และของ Attendance ใช้ `hr` ซึ่งมีอยู่) และไม่มีตัวเลือกแยกสำหรับ Exam / Gate / Crowd / Attendance เจ้าของเลือกได้ว่าจะเพิ่ม (ต้องแก้ `index.html` และ i18n 3 ภาษา)
  2. หน้า `privacy.html` ที่ค้นด้วยคำว่า "180 วัน" และ "คำขอเดโม" ไม่พบข้อความอธิบายการเก็บคำขอที่ฝั่งเซิร์ฟเวอร์ (มีแต่แถว `lq-leads` ในเบราว์เซอร์) ต้องเพิ่มก่อนเปิดตัวเลือก C
  3. `LEAD_CONSENT_VERSION = "l1"` ผูกกับข้อความ "ยินยอมให้ติดต่อกลับตามข้อมูลที่ให้ไว้" ถ้าเปลี่ยนข้อความแจ้ง ต้องเปลี่ยนเวอร์ชันทั้งสองที่ (`leads.js` และ `lensiq-leads.js`/`index.html`)
  4. ระยะเก็บ 180 วันนับจากวันรับ ไม่ว่าจะจัดการแล้วหรือยัง (`retention.js`) ไม่มีการลบเร็วขึ้นเมื่อ "จัดการแล้ว"
  5. หน้าแอดมินยังไม่มีมุมมองกล่องรับคำขอ (มีเฉพาะ API) ก่อนเปิดตัวเลือก C ต้องเพิ่มหน้าจอเล็ก ๆ (รายการ ทำเครื่องหมาย ลบ) หรือเจ้าของยอมเรียก API เอง

## 3. หลักการ: ข้อมูลน้อยที่สุด

1. เก็บเฉพาะที่ใช้ตอบกลับ: **ชื่อหรือชื่อเล่น + ช่องทางติดต่อหนึ่งช่องทาง + ด้านที่สนใจ** ช่องอื่น (บริษัท แพ็กเกจ ข้อความ) ไม่บังคับ
2. ไม่เก็บ IP, user agent, ตำแหน่ง, หรือตัวระบุอุปกรณ์ไว้กับคำขอ (ตัวเลือก C ทำอยู่แล้ว)
3. ไม่ส่งไปแอนะลิติกส์ ไม่ใช้เพื่อการตลาดอื่น คำยินยอมครอบคลุมเฉพาะการตอบคำขอนี้ (ถ้าต้องการส่งข่าวสาร ต้องมีช่องติ๊กแยก ซึ่งยังไม่มี)
4. มีระยะเก็บที่ชัดเจนและลบได้ง่าย ผู้ส่งขอให้ลบได้
5. ไม่ขอข้อมูลอ่อนไหว: ข้อความในช่อง "รายละเอียด" ควรมีคำเตือน "ไม่ต้องใส่เลขบัตรประชาชน ข้อมูลสุขภาพ หรือข้อมูลของบุคคลอื่น"
6. ทุกข้อความที่ผู้ใช้เห็นต้องครบ 3 ภาษา (ไทย อังกฤษ จีน)
7. ไม่มีสิ่งใดทำงานโดยผู้ใช้ไม่ได้กดเอง: ไม่ส่งอัตโนมัติ ไม่ส่งข้อมูลเมื่อโหลดหน้า

## 4. ตัวเลือกที่เปรียบเทียบ

| | A. ลิงก์ `mailto:` หัวเรื่องกรอกให้ | B. ลิงก์ LINE Official Account | C. `/v1/leads` ที่มีอยู่ (ชุดข้อมูลขั้นต่ำ) | D. ฟอร์มบริการภายนอก (เช่น ฟอร์มออนไลน์ของผู้ให้บริการรายอื่น) |
|---|---|---|---|---|
| **ข้อมูลที่เก็บ** | ผู้เยี่ยมชมพิมพ์ในแอปอีเมลเอง สิ่งที่เขาใส่ในอีเมล (เราตั้งหัวเรื่องและโครงเนื้อหาให้ได้) LENSIQ ไม่เก็บอะไรเลย | ข้อความแชตและโปรไฟล์ LINE ของผู้เยี่ยมชม (ชื่อที่แสดง รูป) ตามที่ LINE ให้บัญชีของเรา LENSIQ ไม่เก็บ | ชื่อ · (บริษัท) · อีเมลหรือเบอร์ · ด้านที่สนใจ · (แพ็กเกจ) · (ข้อความ ≤ 1,000 ตัวอักษร) · ภาษา · หน้าที่มา · เวอร์ชันคำยินยอม · เวลารับ · สถานะ **ไม่มี IP / user agent** | ตามช่องที่ตั้งในบริการนั้น อาจรวม IP และข้อมูลอุปกรณ์ตามเงื่อนไขของผู้ให้บริการ (ไม่ได้ตรวจในเอกสารนี้) |
| **เก็บที่ไหน** | กล่องจดหมายของผู้เยี่ยมชม (ผู้ให้บริการอีเมลของเขา) และกล่องจดหมายของเจ้าของ | LINE (ผู้ให้บริการอยู่นอกประเทศไทย ต้องระบุเป็นการส่งข้อมูลไปต่างประเทศในประกาศ) และแอป LINE OA ของเจ้าของ | ฐานข้อมูล D1 ของ Worker `lensiq-api-test` ในบัญชี Cloudflare ของเจ้าของ (Cloudflare อาจประมวลผลนอกไทย `docs/pdpa/DPIA.md` ส่วนการโอนข้อมูล) | บัญชีของเจ้าของที่ผู้ให้บริการภายนอก (นอกไทยหรือไม่ ขึ้นกับรายนั้น) |
| **ระยะเก็บ** | ไม่มีการลบอัตโนมัติ เจ้าของต้องมีกติกาลบเอง (เสนอ: ลบเมื่อพ้น 180 วันให้ตรงกับ C) | ตามประวัติแชตของ LINE OA ไม่มีการลบอัตโนมัติจากฝั่งเรา เจ้าของต้องลบเอง | **ลบอัตโนมัติ 180 วันหลังรับ** (`LEADS_DAYS`, ตั้งได้ 7–3,650) ลบทีละรายการได้จากหน้าแอดมิน | ตามบัญชีนั้น ต้องลบเอง |
| **ข้อความแจ้ง PDPA ที่ต้องมี** | ข้างลิงก์: ใครได้รับ เก็บนานเท่าไร ช่องทางขอลบ และแจ้งว่าอีเมลที่ส่งผ่านผู้ให้บริการอีเมลของผู้ส่งเอง | ข้างลิงก์: ใช้ LINE ผู้ให้บริการ LINE เห็นข้อความ ระยะเก็บของเรา และช่องทางขอลบ | ข้างฟอร์ม (ร่างในภาคผนวก) + แถวใหม่ใน `privacy.html` และ `docs/pdpa/retention-table.md` / `ROPA.md` | ต้องระบุผู้ให้บริการเป็นผู้ประมวลผล การโอนข้อมูลข้ามประเทศ และอาจต้องมีข้อตกลงประมวลผลข้อมูล |
| **ป้องกันสแปม** | ไม่มี ใช้ตัวกรองของผู้ให้บริการอีเมลของเจ้าของ | ใช้การบล็อกของ LINE OA | **Turnstile** (action `lead`, fail closed) + จำกัด 5 ครั้ง/ผู้เรียก/ชั่วโมง + เพดานต่อวัน 200 (ตั้งต่ำลงได้) | ตัวป้องกันของบริการนั้น (ใส่ Turnstile ของเราเองไม่ได้) |
| **ต้นทุน** | 0 (ถ้ามีอีเมลอยู่แล้ว; อีเมลโดเมนของตัวเองอาจมีค่าใช้จ่าย **ต้องถามเจ้าของก่อน**) | **ไม่ทราบ** ต้องตรวจเงื่อนไขแพ็กเกจ LINE OA ปัจจุบัน (ไม่ได้ตรวจในเอกสารนี้) ถ้ามีค่าใช้จ่าย **ต้องถามเจ้าของก่อน** | 0 บน Cloudflare แผน Free (Worker + D1) แต่ใช้โควตาร่วมของบัญชี (`DAILY_REQUEST_CAP` 20,000; `D1_WRITE_BUDGET` 5,000 ต่อวัน) 1 คำขอเขียนราว 3–4 แถว (ประมาณจากการอ่าน `leads.js` ไม่ได้วัด) ปริมาณ B2B หลักสิบต่อเดือนน้อยมาก | **ไม่ทราบ** แผนฟรีมักมีข้อจำกัด ต้องตรวจ **ต้องถามเจ้าของก่อน** |
| **แรงของเจ้าของ** | ต่ำ: ต้องมีอีเมลธุรกิจ ตอบเอง ลบเอง | ปานกลาง: สร้างและดูแลบัญชี LINE OA ตอบแชต (ผู้ใช้ไทยคุ้นเคย) ลบเอง | ปานกลาง: ตัดสินใจ §6 กรอกข้อมูลติดต่อ เปิดเส้นทาง (agent ทำตามคำสั่ง) ดูกล่องรับ (วันนี้มีแต่ API ต้องเพิ่มหน้าจอก่อน) ตั้งแจ้งเตือนเป็นทางเลือก (ต้องใส่ความลับเอง) ตอบกลับ | ปานกลาง: สร้างฟอร์มและบัญชี ตรวจเงื่อนไขผู้ให้บริการ |
| **ข้อเสีย** | ผู้ใช้เว็บเมลบนคอมพิวเตอร์มักไม่มีแอปอีเมลที่ผูก `mailto:` ลิงก์จึงไม่ทำอะไร; ไม่มีป้องกันสแปม; ไม่มีการลบอัตโนมัติ | ผู้ติดต่อต้องมี LINE และเพิ่มเพื่อน; ข้อมูลไปต่างประเทศ | ต้องเปิดเส้นทางบนเซิร์ฟเวอร์ (การตัดสินใจเรื่องความเป็นส่วนตัวที่ผู้ใช้เห็น) และต้องเขียนประกาศ | เพิ่มผู้ประมวลผลรายใหม่ที่ไม่อยู่ใน DPIA; ต้องแก้นโยบายความปลอดภัยของหน้า (CSP) ถ้าฝังฟอร์ม; ขัดกับหลัก "ข้อมูลอยู่ในบัญชีที่เราควบคุม" |

หมายเหตุ: ค่าใช้จ่ายของ LINE OA และบริการภายนอกเปลี่ยนได้ ผู้ร่างไม่ได้ตรวจราคาหรือเงื่อนไขปัจจุบัน จึงเขียนว่า "ไม่ทราบ" (กติกา: ต้นทุนต้องเป็น 0 หรือถามเจ้าของ)

## 5. คำแนะนำ

**แนะนำตัวเลือก C: เส้นทาง `/v1/leads` ที่มีอยู่ เปิดใช้เมื่อเจ้าของอนุมัติ ในรูปแบบข้อมูลขั้นต่ำ**

เหตุผล:

1. เป็นตัวเลือกเดียวที่ **ลบอัตโนมัติ** (180 วัน หรือสั้นกว่านั้นเมื่อเจ้าของกำหนด) และ **ลบทีละรายการได้** ผ่าน API ของแอดมิน (ยังไม่มีหน้าจอ ดูข้อสังเกต 5 ใน §2) สอดคล้องกับ PDPA เรื่องการเก็บเท่าที่จำเป็นและสิทธิขอลบ
2. **ป้องกันบอทได้** (Turnstile fail closed + จำกัดอัตรา) โดยไม่เก็บ IP
3. ข้อมูลอยู่ในบัญชี Cloudflare ของเจ้าของ ในทรัพยากรที่เป็น `lensiq-*` เท่านั้น ไม่เพิ่มผู้ประมวลผลรายใหม่ (Cloudflare อยู่ใน DPIA อยู่แล้ว)
4. **สร้างและมีเทสต์แล้ว** งานที่เหลือคือการตัดสินใจ ข้อความแจ้ง และการตั้งค่า ไม่ใช่การเขียนระบบใหม่
5. ต้นทุน 0 และโควตาที่ใช้น้อยมากเมื่อเทียบกับเพดานของบัญชี

ข้อมูลขั้นต่ำที่เสนอ (**ยังไม่สร้าง** ต้องให้เจ้าของอนุมัติก่อนแก้โค้ด):

| รายการ | วันนี้ | ข้อเสนอ |
|---|---|---|
| ชื่อ | บังคับ ≥ 2 ตัวอักษร | คงไว้ แต่หน้าเขียนว่า "ชื่อหรือชื่อเล่น" |
| ช่องทางติดต่อ | อีเมลหรือเบอร์อย่างน้อยหนึ่งอย่าง (หน้าเว็บบังคับอีเมล) | บังคับ**หนึ่งช่องทาง**ที่ผู้ส่งเลือกเอง (อีเมลหรือเบอร์) ไม่บังคับทั้งสอง |
| บริษัท / หน่วยงาน | ไม่บังคับ | คงไว้ไม่บังคับ |
| ด้านที่สนใจ | บังคับ | คงไว้ เพิ่มตัวเลือก Exam / Gate / Crowd / Attendance (ข้อสังเกต 1 ใน §2) |
| แพ็กเกจ | ไม่บังคับ | คงไว้ไม่บังคับ |
| ข้อความ | ไม่บังคับ ≤ 1,000 | ลดเหลือ ≤ 500 และมีคำเตือนไม่ใส่ข้อมูลอ่อนไหวหรือของบุคคลอื่น |
| IP / user agent / ตำแหน่ง | ไม่เก็บ | ไม่เก็บ |
| ระยะเก็บ | 180 วันนับจากวันรับ | 180 วัน หรือสั้นกว่าตามเจ้าของ และข้อเสนอเพิ่ม: ลบ 30 วันหลังกด "จัดการแล้ว" (ต้องแก้ `retention.js` ต้องให้เจ้าของอนุมัติ) |
| คำยินยอม | ติ๊ก "ยินยอมให้ติดต่อกลับตามข้อมูลที่ให้ไว้" เวอร์ชัน `l1` | เปลี่ยนเป็นข้อความในภาคผนวก เวอร์ชัน `l2` ครอบคลุมเฉพาะการตอบคำขอนี้ |

ช่วงที่ยังไม่อนุมัติ: **ไม่มีอะไรเปลี่ยน** หน้าเว็บคงพฤติกรรมเดิมและบอกผู้ใช้ตรง ๆ ว่ายังไม่ได้ส่ง ตัวเลือก A และ B มีโค้ดรองรับอยู่แล้ว
(ปรากฏเมื่อเจ้าของกรอก `LENSIQ_SELLER.email` / `.line`) ใช้เป็นช่องทางสำรองของ C ได้โดยไม่ต้องเขียนอะไรเพิ่ม

## 6. เจ้าของต้องตัดสินใจ

| # | เรื่อง | ตัวเลือก / ข้อเสนอ |
|---|---|---|
| 1 | จะเปิดตัวเลือก C หรือไม่ และเมื่อไร | เปิดเมื่อพร้อมรับคำขอจริง การเปิดต้องเพิ่ม `/v1/leads` ใน `PUBLIC_ROUTES` ของ `[env.test.vars]` แล้ว deploy `lensiq-api-test` (agent ทำเมื่อได้รับคำสั่ง) |
| 2 | ข้อมูลติดต่อของเจ้าของที่จะแสดง | ชื่อผู้ให้บริการ อีเมลช่วยเหลือ (`email`) อีเมลผู้ติดต่อ PDPA (`dpo_email`) LINE OA (`line`) กรอกใน `LENSIQ_SELLER` เป็นข้อมูลธุรกิจ ไม่ใช่ความลับ แต่ต้องมาจากเจ้าของ |
| 3 | จะเปิด LINE OA หรือไม่ | ต้องตรวจเงื่อนไขและค่าใช้จ่ายปัจจุบันก่อน ถ้ามีค่าใช้จ่าย ต้องขออนุมัติ |
| 4 | ระยะเก็บ | 180 วัน (วันนี้) หรือสั้นลง (เช่น 90) และจะลบเร็วขึ้นหลัง "จัดการแล้ว" หรือไม่ |
| 5 | ชุดข้อมูลขั้นต่ำ | ตามตารางใน §5 รวมถึงให้ใช้ชื่อเล่นได้ บังคับช่องทางเดียว และลดข้อความเหลือ 500 ตัวอักษร |
| 6 | ข้อความแจ้ง PDPA | อนุมัติร่างในภาคผนวก (3 ภาษา) ส่งทนายตรวจ และเพิ่มในหน้า `privacy.html` ก่อนเปิด |
| 7 | ผู้ตอบและความถี่ | ใครอ่านกล่องรับ ตอบภายในกี่วัน ใครเป็นผู้ติดต่อ PDPA ที่รับคำขอให้ลบ |
| 8 | การแจ้งเจ้าของเมื่อมีคำขอใหม่ และหน้าจอดูกล่องรับ | ต้องเพิ่มหน้าจอดูกล่องรับในหน้าแอดมินก่อน (วันนี้มีแต่ API) แล้วเปิดดูเอง หรือตั้ง `ALERT_WEBHOOK_URL` (เป็นความลับของ Worker **เจ้าของต้องใส่เอง** agent ไม่เห็นค่า) การแจ้งเตือนไม่มีรายละเอียดของผู้ส่ง |
| 9 | เพดานต่อวัน | `LEADS_GLOBAL_DAY` 200 (วันนี้) ปริมาณจริงต่ำกว่านี้มาก เสนอลดเหลือ 50 เพื่อจำกัดความเสียหายจากสแปม |
| 10 | ตัวเลือก "สนใจด้านใด" | เพิ่ม Exam / Gate / Crowd / Attendance และแก้ลิงก์ใน one-pager ให้ตรง |
| 11 | การตลาดต่อเนื่อง | วันนี้ครอบคลุมเฉพาะการตอบคำขอ ถ้าต้องการส่งข่าวสาร ต้องมีช่องติ๊กแยก |
| 12 | กลุ่มผู้ส่ง | แบบฟอร์มสำหรับธุรกิจและผู้ใหญ่ ไม่รับข้อมูลของผู้เยาว์ (ข้อความในภาคผนวกระบุไว้) |
| 13 | ตัวเลือก D (บริการภายนอก) | แนะนำไม่ใช้ ถ้าจะใช้ ต้องอนุมัติผู้ประมวลผล ค่าใช้จ่าย และปรับ DPIA |

เงื่อนไขหยุดและถามเจ้าของตาม `CLAUDE.md` ที่เกี่ยวข้อง: ข้อ 3 (อาจมีค่าใช้จ่าย) ข้อ 6 (เปลี่ยนสิ่งที่ผู้ใช้เห็นเรื่องความเป็นส่วนตัว) ข้อ 8 (ต้องใส่ความลับ) ข้อ 1 (เปลี่ยนสิ่งที่ผู้ใช้เห็น)

## 7. สิ่งที่จะทำหลังได้รับอนุมัติ (ยังไม่ทำ)

1. เจ้าของส่งข้อมูลติดต่อ (ข้อ 2) และคำตอบข้อ 4–9 → agent กรอก `LENSIQ_SELLER` ปรับ `LEADS_DAYS` / `LEADS_GLOBAL_DAY` → ทดสอบ
2. แก้ข้อความแจ้งและเวอร์ชันคำยินยอมเป็น `l2` (3 ภาษา) เพิ่มแถวใน `privacy.html`, `docs/pdpa/retention-table.md`, `ROPA.md` และ `docs/PDPA-NOTES-FOR-COUNSEL.md`
3. (ถ้าเห็นชอบ) ปรับชุดข้อมูลขั้นต่ำและตัวเลือก "สนใจด้านใด" เพิ่มหน้าจอดูกล่องรับในหน้าแอดมิน (รายการ จัดการแล้ว ลบ) พร้อมเทสต์ที่อัปเดตให้ตรง (ไม่ลดเทสต์)
4. เพิ่ม `/v1/leads` ใน `PUBLIC_ROUTES` → `npm run backend:dry-run` → ขออนุมัติ → `npm run backend:deploy:test` → `npm run backend:smoke`
5. ลองส่งคำขอทดสอบ 1 รายการ ตรวจกล่องรับ ลบ และตรวจว่าไม่มี IP ในตาราง
6. ทนายตรวจข้อความก่อนเปิดให้สาธารณะ

**ยังไม่มีแบบฟอร์มใดถูกเปิดใช้ จนกว่าเจ้าของจะอนุมัติ**

## ภาคผนวก: ร่างข้อความแจ้ง (ตัวเลือก C; รอทนายตรวจ; ครบ 3 ภาษา)

**ไทย**
> **ขอให้ทีมงานติดต่อกลับ** เราเก็บชื่อหรือชื่อเล่น ช่องทางติดต่อที่คุณใส่ (อีเมลหรือเบอร์) ด้านที่สนใจ และข้อความที่คุณพิมพ์ เพื่อติดต่อกลับเรื่องที่คุณขอเท่านั้น ไม่ใช้ส่งข่าวสารอื่นและไม่ส่งต่อให้ผู้อื่น
> ข้อมูลเก็บในระบบของ LENSIQ บน Cloudflare (อาจประมวลผลนอกประเทศไทย) ผู้ที่เห็นคือ [ชื่อเจ้าของ] เท่านั้น ระบบไม่เก็บ IP ของคุณไว้กับคำขอ ใช้ Cloudflare Turnstile ตรวจว่าไม่ใช่บอท
> เราลบอัตโนมัติภายใน [180] วัน ขอให้ลบก่อนได้ที่ [อีเมล PDPA] อย่าใส่เลขบัตรประชาชน ข้อมูลสุขภาพ หรือข้อมูลของบุคคลอื่น ฟอร์มนี้สำหรับผู้ใหญ่และธุรกิจ
> ☐ ยินยอมให้ติดต่อกลับตามข้อมูลที่ให้ไว้ (ถอนได้ทุกเมื่อ)

**English**
> **Ask the team to contact you.** We keep your name or nickname, the contact detail you enter (e-mail or phone), the area you are interested in and the message you type, only to reply to this request. We do not use it for other news and do not pass it on.
> The data is stored in LENSIQ's system on Cloudflare (it may be processed outside Thailand). Only [owner name] can see it. We do not keep your IP address with the request. Cloudflare Turnstile checks that you are not a bot.
> It is deleted automatically within [180] days; ask for earlier deletion at [PDPA e-mail]. Do not enter ID numbers, health data or other people's data. This form is for adults and businesses.
> ☐ I agree to be contacted using the details I gave (I can withdraw at any time).

**中文**
> **请团队联系我。** 我们只为答复您的这一申请，保存您填写的姓名或昵称、联系方式（邮箱或电话）、感兴趣的方向和您输入的留言；不会用于其他资讯，也不会转给他人。
> 数据保存在 LENSIQ 位于 Cloudflare 的系统中（可能在泰国境外处理），只有[负责人姓名]能看到。我们不会把您的 IP 地址与申请一起保存。使用 Cloudflare Turnstile 验证您不是机器人。
> 数据会在 [180] 天内自动删除；如需提前删除，请联系 [PDPA 邮箱]。请勿填写身份证号、健康信息或他人的信息。本表单面向成年人和企业。
> ☐ 我同意按所提供的信息联系我（可随时撤回）。

---
---

# English

## 1. Summary

- **What exists:** the "request a demo" form at `index.html#contact`, the sender `lensiq-leads.js`, the `POST /v1/leads` route in `backend/src/leads.js`, an admin inbox API (no screen yet) and automatic deletion after 180 days.
  All of it is **built and tested but not switched on** (see §2).
- **Recommendation:** **Option C**, the existing `/v1/leads` route reduced to a minimum data set, once the owner approves. It is the only option with **automatic deletion, per-record deletion, bot protection, no IP stored,
  data in an account we control (`lensiq-*`), and cost 0**. Meanwhile nothing is switched on: the page keeps today's behaviour (the request stays in the visitor's own browser; e-mail / LINE links appear only when the owner fills `LENSIQ_SELLER`).
- **The owner decides:** §6 (including the owner's contact details, which are business information, not secrets).

## 2. What exists (read from code and tests; nothing was run)

| Part | File | What it does | Tests |
|---|---|---|---|
| Home-page form | `index.html` (`#contact`, `#leadForm`) + `home.js` | Fields: name (required), organisation, e-mail (required on the page), phone, interest (required), plan, details (up to 1,000 characters), consent box "agree to be contacted using the details given" (required). `?interest=…` links preselect the interest | `tests/unit/commercial-r11.test.js` (sender, 3-language texts, interest links) · `tests/e2e/commercial.e2e.mjs` (fallback / none modes) |
| Sender | `lensiq-leads.js` | Order: (1) with `LENSIQ_API_BASE` set, `POST /v1/leads` with a Turnstile token; (2) otherwise a `mailto:` link (subject and body prefilled) and/or a LINE OA link from `LENSIQ_SELLER.email` / `.line`, which the visitor sends themself; (3) if neither exists, it says plainly that nothing was sent and **keeps the request in the visitor's browser only** (`localStorage` `lq-leads`, at most 10) with copy / delete buttons | `commercial-r11.test.js` "lensiq-leads: clean, mailto, LINE and fallback choice" |
| Server side | `backend/src/leads.js`, table `leads` (`backend/migrations/0008_round11_backend.sql`), `backend/src/retention.js` | Accepts `{name, org?, email?, phone?, interest, plan?, message?, source?, lang?, consent: true}`; an e-mail or a phone is required; Turnstile action `lead`, **fail closed**; 5 per caller per hour and `LEADS_GLOBAL_DAY` (200) per Bangkok day; **no IP or user agent stored** (the day-salted caller hash is used for rate limiting only and never stored with the lead); automatic deletion `LEADS_DAYS` = 180 days after receipt; the owner gets an `alert.lead_new` log line and, with `ALERT_WEBHOOK_URL` set, a push **without the sender's details** | `tests/unit/backend-fulfilment-refunds.test.js` "leads: Turnstile fail-closed, validation, stored with retention, admin inbox list / ack / delete, push without PII" · `tests/unit/backend-deploy-gate.test.js` (route closed in the test deployment) |
| Owner inbox | `GET /admin/api/leads`, `POST /admin/api/leads/:id/ack`, `DELETE /admin/api/leads/:id` | See new requests, mark handled, delete one (when the sender asks to be forgotten). **An API behind the admin sign-in only: a search for "lead" in `admin.html` and `admin.js` found nothing, so there is no inbox screen yet** | same as above |
| "Notify me at launch" boxes | `pricing.html`, `account.html` | Same sender `lensiq-leads.js` | `commercial-r11.test.js` |
| Face-reading lead form (fortune) | `faceread.html` | Nickname + contact, kept on the device only, off by default, needs a tick (`docs/PDPA-NOTES-FOR-COUNSEL.md`) | `tests/unit/fortune-lead-echo.test.js` |

### State today

- The test deployment `lensiq-api-test` **has `/v1/leads` closed**: `PUBLIC_ROUTES` in `backend/wrangler.toml` does not list it (analytics and billing are closed too). So no request reaches a server today.
- `LENSIQ_SELLER.email`, `.line` and `.dpo_email` in `lensiq-config.js` are **empty**, so the page says "contact details will be announced before sales open" and keeps the request in the visitor's own browser (matches `docs/pdpa/retention-table.md`).
- **Findings (not fixed):**
  1. The one-pagers link to `interest=education` (Exam) and `interest=security` (Gate), but the interest list has no such options (it has marketing, store, photobooth, addons, hr, creative, fortune, unsure),
     so `home.js` does not preselect them (Crowd's `marketing` and Attendance's `hr` exist). There is also no separate option for Exam / Gate / Crowd / Attendance. The owner can choose to add them (edit `index.html` and the three-language dictionaries).
  2. A search of `privacy.html` for "180 วัน" and "คำขอเดโม" found no text describing the server-side lead store (only the browser-side `lq-leads` row). Add it before turning on option C.
  3. `LEAD_CONSENT_VERSION = "l1"` is tied to the text "agree to be contacted using the details given". If the notice changes, bump the version in both places (`leads.js` and `lensiq-leads.js` / `index.html`).
  4. The 180-day retention counts from receipt whether or not the lead was handled (`retention.js`); handled leads are not deleted sooner.
  5. The admin page has no inbox view (only the API). Before option C is opened, a small screen (list, mark handled, delete) must be added, or the owner must be willing to call the API.

## 3. Principles: minimum data

1. Keep only what is needed to reply: **a name or nickname + one contact channel + the area of interest**. Everything else (organisation, plan, message) is optional.
2. No IP, user agent, location or device identifier stored with the request (option C already does this).
3. Nothing goes to analytics or other marketing. Consent covers replying to this request only (news needs a separate tick, which does not exist).
4. A clear retention period and easy deletion; the sender can ask for deletion.
5. Ask for no sensitive data: the details box carries a warning "do not enter ID numbers, health data or other people's data".
6. All user-facing text complete in Thai, English and Chinese.
7. Nothing runs unless the user presses it: no automatic sending, nothing sent on page load.

## 4. Options compared

| | A. `mailto:` link, prefilled subject | B. LINE Official Account link | C. existing `/v1/leads` (minimum fields) | D. third-party form service |
|---|---|---|---|---|
| **Data stored** | What the visitor types in their own mail app (we can prefill the subject and a body outline). LENSIQ stores nothing | Chat messages and LINE profile of the visitor (display name, picture) as LINE gives our account. LENSIQ stores nothing | Name · (organisation) · e-mail or phone · interest · (plan) · (message up to 1,000 characters) · language · source page · consent version · received time · status. **No IP / user agent** | Whatever fields are set up there; may include IP and device data under that provider's terms (not checked here) |
| **Where** | The visitor's mailbox (their e-mail provider) and the owner's mailbox | LINE (provider outside Thailand; must be named as a cross-border transfer in the notice) and the owner's LINE OA app | D1 database of the Worker `lensiq-api-test` in the owner's Cloudflare account (Cloudflare may process outside Thailand; `docs/pdpa/DPIA.md`, transfers section) | The owner's account at the third party (location depends on the provider) |
| **Retention** | No automatic deletion; the owner needs a manual rule (proposal: delete after 180 days to match C) | Follows the LINE OA chat history; no automatic deletion on our side; the owner deletes | **Automatic deletion 180 days after receipt** (`LEADS_DAYS`, settable 7–3,650); one-by-one deletion in the admin page | Per that account; manual |
| **PDPA notice needed** | Next to the link: who receives it, how long kept, how to ask for deletion, and that the mail goes through the sender's own e-mail provider | Next to the link: LINE is used, LINE's provider can see messages, our retention, how to ask for deletion | Next to the form (draft in the appendix) + a new row in `privacy.html` and in `docs/pdpa/retention-table.md` / `ROPA.md` | Must name the provider as a processor and the cross-border transfer; may need a data-processing agreement |
| **Spam protection** | None; relies on the owner's mail provider's filter | LINE OA blocking | **Turnstile** (action `lead`, fail closed) + 5 per caller per hour + 200 per day cap (can be lowered) | The service's own protection (our Turnstile cannot be added) |
| **Cost** | 0 (if an address exists; an e-mail on our own domain may cost: **ask the owner first**) | **Unknown**: the current LINE OA plan terms were not checked here. If anything costs money: **ask the owner first** | 0 on Cloudflare Free (Worker + D1), but it uses the account's shared quota (`DAILY_REQUEST_CAP` 20,000; `D1_WRITE_BUDGET` 5,000 per day). One request writes about 3–4 rows (an estimate from reading `leads.js`, not measured); B2B volume of tens a month is tiny | **Unknown**: free plans usually have limits; not checked. **Ask the owner first** |
| **Owner effort** | Low: a business e-mail, reply, delete | Medium: create and run a LINE OA, answer chats (familiar to Thai users), delete | Medium: decide §6, supply contact details, open the route (the agent does it on instruction), read the inbox (today only an API; a screen must be added first), optionally a push alert (needs a secret the owner enters), reply | Medium: build the form and account, check the provider's terms |
| **Weak points** | Webmail users on desktop often have no mail app tied to `mailto:`, so the link does nothing; no spam protection; no automatic deletion | The contact needs LINE and must add the account; data goes abroad | The route must be opened on the server (a privacy decision users see) and a notice must be written | Adds a new processor not in the DPIA; the page's security policy (CSP) needs changing if embedded; against the principle "data in an account we control" |

Costs of LINE OA and external services can change; the author did not check current prices or terms, so they are written as "unknown" (rule: cost must be 0 or ask the owner).

## 5. Recommendation

**Option C: the existing `/v1/leads` route, opened only on the owner's approval, with the minimum data set.**

Why:

1. It is the only option with **automatic deletion** (180 days, or shorter if the owner chooses) and **one-by-one deletion** through the admin API (no screen yet; see finding 5 in §2), in line with PDPA data minimisation and the right to erasure.
2. It **blocks bots** (Turnstile fail closed + rate limits) without storing an IP.
3. The data sits in the owner's Cloudflare account, in `lensiq-*` resources only, and adds no new processor (Cloudflare is already in the DPIA).
4. It is **built and tested**: what remains is decisions, a notice and configuration, not a new system.
5. Cost 0, with very low use of the account's quota.

Proposed minimum data (**not built**; the owner approves before any code changes):

| Item | Today | Proposal |
|---|---|---|
| Name | required, at least 2 characters | keep; the page says "name or nickname" |
| Contact channel | e-mail or phone at least one (the page requires e-mail) | require **one channel of the sender's choice** (e-mail or phone), not both |
| Organisation | optional | keep optional |
| Interest | required | keep; add Exam / Gate / Crowd / Attendance options (finding 1 in §2) |
| Plan | optional | keep optional |
| Message | optional, up to 1,000 | up to 500, with a warning not to enter sensitive or other people's data |
| IP / user agent / location | not stored | not stored |
| Retention | 180 days from receipt | 180 days or shorter at the owner's choice; extra proposal: delete 30 days after "handled" (needs a change in `retention.js`; owner approval) |
| Consent | tick "agree to be contacted…", version `l1` | the appendix text, version `l2`, covering this request only |

While not approved: **nothing changes**. The page keeps its behaviour and says plainly that nothing has been sent. Options A and B already have code (they appear when the owner fills `LENSIQ_SELLER.email` / `.line`) and can serve as fallbacks to C
with nothing more to write.

## 6. What the owner must decide

| # | Decision | Options / proposal |
|---|---|---|
| 1 | Switch on option C, and when | When ready for real requests. Turning on means adding `/v1/leads` to `PUBLIC_ROUTES` in `[env.test.vars]` and deploying `lensiq-api-test` (the agent does it on instruction) |
| 2 | The owner's contact details to show | Provider name, support e-mail (`email`), PDPA contact e-mail (`dpo_email`), LINE OA (`line`) in `LENSIQ_SELLER`. Business information, not secrets, but they must come from the owner |
| 3 | Whether to open a LINE OA | Check the current terms and cost first; if it costs money, ask for approval |
| 4 | Retention | 180 days (today) or shorter (e.g. 90), and whether to delete sooner after "handled" |
| 5 | Minimum data set | As in the §5 table, including nickname allowed, one channel required, message cut to 500 characters |
| 6 | PDPA notice | Approve the appendix draft (3 languages), send it to counsel, and add it to `privacy.html` before opening |
| 7 | Who answers and how fast | Who reads the inbox, reply within how many days, who is the PDPA contact receiving deletion requests |
| 8 | How the owner is told about a new request, and the inbox screen | An inbox screen must first be added to the admin page (today only the API exists); then read it yourself, or set `ALERT_WEBHOOK_URL` (a Worker secret **the owner enters**; the agent never sees it). The push carries no sender details |
| 9 | Daily cap | `LEADS_GLOBAL_DAY` is 200 today; real volume is far lower; proposal 50 to limit spam damage |
| 10 | The interest list | Add Exam / Gate / Crowd / Attendance and fix the one-pager links |
| 11 | Follow-up marketing | Today consent covers replying only; news would need a separate tick |
| 12 | Who may submit | The form is for businesses and adults; no data about minors (the appendix says so) |
| 13 | Option D (external service) | Recommended against; if wanted, approve the processor, the cost and a DPIA update |

Stop-and-ask triggers of `CLAUDE.md` that apply: item 3 (possible cost), item 6 and item 1 (change what users see about privacy), item 8 (a secret is needed).

## 7. What would be done after approval (not done)

1. The owner sends the contact details (item 2) and answers items 4–9 → the agent fills `LENSIQ_SELLER` and sets `LEADS_DAYS` / `LEADS_GLOBAL_DAY` → tests.
2. Update the notice and bump the consent version to `l2` (3 languages); add rows to `privacy.html`, `docs/pdpa/retention-table.md`, `ROPA.md` and `docs/PDPA-NOTES-FOR-COUNSEL.md`.
3. (If agreed) apply the minimum data set and the interest list, add the inbox screen to the admin page (list, mark handled, delete), with the tests updated to match (never weakened).
4. Add `/v1/leads` to `PUBLIC_ROUTES` → `npm run backend:dry-run` → ask for approval → `npm run backend:deploy:test` → `npm run backend:smoke`.
5. Send one test request, check the inbox, delete it, and check that the table holds no IP.
6. Counsel reviews the text before the form goes public.

**No form is switched on until the owner approves.**

## Appendix: draft notice (option C; counsel reviews; all three languages)

The Thai, English and Chinese texts are in the Thai half's appendix above. Placeholders in [brackets] are for the owner: the person who can see the data, the retention days, and the PDPA e-mail.

---

# 8. สร้างแล้วและเปิดใช้ 12 พ.ย. 2569 / Built and switched on 2026-11-12

## 8.1 สิ่งที่สร้าง / What was built

| ส่วน / Part | ไฟล์ / File | สรุป / Summary |
|---|---|---|
| กล่องรับในหลังบ้าน / admin inbox | `admin.html` (แท็บ "คำขอใบเสนอราคา" / "Leads" / "询价请求"), `admin.js`, `admin.css`, `i18n/en-admin.js`, `i18n/zh-admin.js` | ตัวนับ "ยังไม่อ่าน" บนแท็บ (เปิดดูหรือเปลี่ยนสถานะแล้วหาย) รายการใหม่สุดก่อน สถานะ ใหม่ / ติดต่อแล้ว / ปิดแล้ว กรองตามสถานะ เปิดดูทีละรายการ (อีเมล เบอร์ ข้อความ วันลบอัตโนมัติ) เปลี่ยนสถานะ ลบทีละรายการ (ยืนยัน + รหัสผ่านอีกครั้ง) ส่งออก CSV (รหัสผ่านอีกครั้ง) ใช้บนมือถือได้ 3 ภาษา · unread badge on the tab (cleared by opening or a status change), newest first, status new / contacted / closed, filter, view one, mark status, delete one (confirm + re-auth), CSV export (re-auth), phone widths, TH / EN / ZH |
| API | `backend/src/leads.js`, `backend/src/index.js` | `GET /admin/api/leads` แสดงเฉพาะสรุป (ไม่มีอีเมล เบอร์ ข้อความ) · `GET /admin/api/leads/:id` · `POST /admin/api/leads/:id/status` · `DELETE /admin/api/leads/:id` (ต้องยืนยันตัวตนอีกครั้ง) · `POST /admin/api/leads/export` (ต้องยืนยันตัวตนอีกครั้ง) · ทุกการกระทำลง audit log เฉพาะเลขที่คำขอ / จำนวน ไม่มีข้อมูลส่วนบุคคล · list = summary only; view, status, delete (re-auth), export (re-auth); audit holds ids / counts only |
| แจ้งเจ้าของทาง LINE / owner LINE alert | `backend/src/leads.js` `notifyLine()`, `lineTest()`, `tools/notify-test.mjs` | ปิดจนกว่าเจ้าของตั้ง Worker secret 2 ตัวเองด้วย `npm run secrets:setup -- --only LINE_CHANNEL_ACCESS_TOKEN` และ `-- --only LEAD_NOTIFY_LINE_TO` (LINE user ID ของเจ้าของ U + 32 ตัว) ข้อความมีเพียง "LENSIQ: คำขอใบเสนอราคาใหม่ #<id> <เวลา>" ไม่มีข้อมูลผู้ขอ ไม่เกิน 50 ต่อวัน LINE ล้มเหลวคำขอไม่หาย ทดสอบด้วย `npm run backend:notify-test` (HEALTH_TOKEN, 3 ครั้งต่อชั่วโมง) ใช้เฉพาะ push ไม่มี webhook จึงไม่ต้องใช้ channel secret · off until the owner sets both; id + time only; daily cap; failure never loses the request |
| สวิตช์แบบฟอร์ม / form switch | `lensiq-config.js` `window.LENSIQ_LEADS_FORM` (ค่าเริ่มต้น **เปิด** ตั้งแต่ 12 พ.ย. 2569), `lensiq-leads.js` `serverOn()`, `home.js` | ส่งได้เฉพาะหน้าที่ตั้ง API ไว้ (index.html) ปิด (`false`): ไม่ส่งอะไรออกจากเครื่อง · default ON; off: nothing leaves the device |
| ช่องทาง LINE สำหรับคำขอ / quote LINE contact | `lensiq-config.js` `LENSIQ_SELLER.quote_line` = `"@632yliiw"` (LINE Official Account "LENSIQ" ของแบรนด์ เจ้าของให้มา 12 พ.ย. 2569; ลิงก์เพิ่มเพื่อน https://line.me/R/ti/p/@632yliiw) | แสดงเมื่อแบบฟอร์มเปิด (ตอนนี้เปิด): ข้อความยืนยันหลังส่ง (3 ภาษา) และข้อ "คำขอใบเสนอราคา" ใน `privacy.html` · `LENSIQ_SELLER.line` ยังว่าง เพราะถ้ากรอก ID จะขึ้นบนหน้าเว็บทันที (ปุ่ม LINE ของแบบฟอร์มทั่วไปและหน้า ช่วยเหลือ / ข้อกำหนด / ความเป็นส่วนตัว) · shown only while the form is on; `LENSIQ_SELLER.line` stays empty because filling it would show the ID on pages today |
| ข้อความความเป็นส่วนตัว / privacy text | `privacy.html` `#p-quote`, `#en-p-quote`, `#zh-p-quote` (`data-leads-notice`), `legal.js` | แสดงจริง ซ่อนเฉพาะเมื่อปิดสวิตช์ ข้อความเดียวกันอยู่ในข้อ 8.2 · shown; hidden only when switched off; identical text in 8.2 |
| เทสต์ / tests | `tests/unit/backend-leads-inbox.test.js`, `tests/unit/leads-form-off.test.js`, `tests/e2e/admin-leads.e2e.mjs`, `tests/e2e/leads-off.e2e.mjs` | ชุดเทสต์คงที่เขียนก่อนสร้าง sha256 ใน `~/LENSIQ-field/evals/leads/locked.sha256` · fixed set written before the build |

สถานะ "acked" ของแถวเดิมแสดงและกรองเป็น "ติดต่อแล้ว" (contacted) ไม่ต้องเพิ่ม migration · legacy "acked" rows show as "contacted"; no migration.

## 8.2 ข้อความความเป็นส่วนตัวของแบบฟอร์มขอใบเสนอราคา (ตรงกับ `privacy.html`; ให้ทนายตรวจ) / Quote-form privacy text (identical to `privacy.html`; for counsel)

ช่อง "ประกาศก่อนเปิดใช้ / ประกาศก่อนเปิดขาย" เติมจาก `LENSIQ_SELLER.quote_line` และ `.dpo_email` เมื่อแสดง · the "announced before …" placeholders are filled from `LENSIQ_SELLER.quote_line` and `.dpo_email` when shown.

**ไทย / Thai**

#### คำขอใบเสนอราคาและการติดต่อกลับ

ข้อนี้ใช้กับแบบฟอร์มขอใบเสนอราคาที่หน้าแรก

- ข้อมูลที่เก็บ: ชื่อหรือชื่อเล่น ช่องทางติดต่ออย่างน้อยหนึ่งช่อง (อีเมลหรือเบอร์โทร) ผลิตภัณฑ์หรือด้านที่สนใจ และถ้าคุณกรอก: ชื่อองค์กร และข้อความ (ไม่เกิน 1,000 ตัวอักษร) พร้อมภาษาของหน้า หน้าที่ส่งคำขอ เวลาที่ได้รับ และเวอร์ชันของข้อความยินยอม
- สิ่งที่ไม่เก็บ: ระบบไม่เก็บ IP ข้อมูลเบราว์เซอร์ (user agent) หรือตำแหน่งของคุณไว้กับคำขอ และใช้ Cloudflare Turnstile ตรวจว่าผู้ส่งไม่ใช่บอท
- วัตถุประสงค์และฐานทางกฎหมาย: เพื่อติดต่อกลับและเสนอราคาตามที่คุณขอเท่านั้น (ดำเนินการตามคำขอของคุณก่อนเข้าทำสัญญา และความยินยอมที่คุณติ๊กไว้) ไม่ใช้ส่งข่าวสารการตลาด และไม่ส่งต่อให้ผู้อื่น
- ที่เก็บและผู้ที่เห็นข้อมูล: เก็บในฐานข้อมูลของ LENSIQ บน Cloudflare (อาจประมวลผลนอกประเทศไทย ดูข้อ 6) ผู้ที่เห็นได้คือผู้ดูแลระบบของ LENSIQ ที่เข้าสู่ระบบหลังบ้านเท่านั้น การเปิดดู เปลี่ยนสถานะ ลบ และส่งออกทุกครั้งถูกบันทึกไว้ โดยบันทึกเฉพาะเลขที่คำขอ ไม่บันทึกข้อมูลส่วนตัวของคุณ การแจ้งเตือนเจ้าของเมื่อมีคำขอใหม่มีเพียงเลขที่คำขอและเวลา
- ระยะเวลาเก็บ: ลบอัตโนมัติเมื่อครบ 180 วันหลังจากได้รับคำขอ หรือเร็วกว่านั้นเมื่อคุณขอให้ลบ
- ขอดูหรือขอให้ลบข้อมูล: แจ้งทาง LINE Official Account ของ LENSIQ หรืออีเมลด้านข้อมูลส่วนบุคคล ประกาศก่อนเปิดขาย เราจะลบคำขอนั้นเมื่อยืนยันได้ว่าเป็นของคุณ และคุณถอนความยินยอมได้ทุกเมื่อ
- เมื่อคุณติดต่อเราทาง LINE: ข้อความและโปรไฟล์ LINE ของคุณผ่านผู้ให้บริการ LINE และเป็นไปตามข้อกำหนดของ LINE
- อย่าใส่เลขบัตรประชาชน ข้อมูลสุขภาพ หรือข้อมูลของบุคคลอื่น แบบฟอร์มนี้สำหรับผู้ใหญ่และธุรกิจ

**English**

#### Quote requests and replies

This part covers the request-a-quote form on the home page.

- What we keep: your name or nickname, at least one contact detail (e-mail or phone), the product or area you are interested in and, if you fill them in, your organisation and your message (up to 1,000 characters), together with the page language, the page the request came from, the time it was received and the version of the consent text.
- What we do not keep: we do not store your IP address, browser details (user agent) or location with the request. Cloudflare Turnstile checks that the sender is not a bot.
- Purpose and legal basis: only to reply to you and send the quote you asked for (steps taken at your request before a contract, and the consent you ticked). We do not use it for marketing and do not pass it on.
- Where it is kept and who sees it: in LENSIQ's database on Cloudflare (it may be processed outside Thailand, see section 6). Only LENSIQ administrators signed in to the back office can see it. Every view, status change, deletion and export is logged with the request number only, never your personal data. The owner's alert about a new request carries only the request number and the time.
- How long: deleted automatically 180 days after it was received, or sooner if you ask.
- To see or delete your request: contact us on LINE LENSIQ's Official Account or at the privacy e-mail announced before sales open. We delete the request once we can confirm it is yours. You can withdraw your consent at any time.
- If you contact us on LINE: your messages and LINE profile pass through the LINE service and its terms apply.
- Do not enter ID card numbers, health data or other people's data. This form is for adults and businesses.

**中文 / Chinese**

#### 询价请求与答复

本节适用于首页的询价表单。

- 我们保存的信息：您的姓名或昵称、至少一种联系方式（邮箱或电话）、您感兴趣的产品或方向；如您填写，还包括机构名称和留言（不超过 1,000 字），以及页面语言、提交请求的页面、收到时间和同意文本的版本。
- 我们不保存的信息：不会把您的 IP 地址、浏览器信息（user agent）或位置与请求一起保存。使用 Cloudflare Turnstile 验证提交者不是机器人。
- 目的与法律依据：仅用于答复您并提供您所要求的报价（应您的请求在订立合同前采取的步骤，以及您勾选的同意）。不用于营销，也不会转给他人。
- 保存位置与可查看者：保存在 LENSIQ 位于 Cloudflare 的数据库中（可能在泰国境外处理，见第 6 节）。只有登录后台的 LENSIQ 管理员可以查看。每次查看、更改状态、删除和导出都会记录，但只记录请求编号，不记录您的个人信息。新请求的负责人通知只包含请求编号和时间。
- 保存期限：收到请求 180 天后自动删除；如您要求，可提前删除。
- 查看或删除您的请求：请通过 LINE LENSIQ 官方账号 或个人数据联系邮箱 开售前公布 联系我们。确认是您的请求后我们会将其删除。您可随时撤回同意。
- 如果您通过 LINE 联系我们：您的消息和 LINE 个人资料经由 LINE 服务传送，并适用 LINE 的条款。
- 请勿填写身份证号、健康信息或他人的信息。本表单面向成年人和企业。

## 8.3 การเปิดใช้ (คำสั่งเจ้าของ 12 พ.ย. 2569) / Switch-on (owner decision 2026-11-12)

| เรื่อง / Item | ค่า / Value |
|---|---|
| สวิตช์หน้าเว็บ / page switch | `lensiq-config.js` `window.LENSIQ_LEADS_FORM` ค่าเริ่มต้น **เปิด** (ปิดได้ด้วย `false` ก่อนโหลดไฟล์) · default ON |
| หน้าที่ส่งได้ / page that can send | `deploy/public-site.json` `pages`: `medicine.html`, `index.html` (API + Turnstile site key + CSP เฉพาะหน้านี้) |
| เซิร์ฟเวอร์ / Worker | `PUBLIC_ROUTES` ของ `[env.test.vars]` เพิ่ม `/v1/leads` และ `/health/notify-test`; `LEADS_GLOBAL_DAY = "50"`, `LEAD_NOTIFY_LINE_DAY = "50"`, `LEADS_DAYS = "180"` |
| ฐานข้อมูล / database | migration `0014_leads_viewed.sql` (คอลัมน์ `viewed_at` สำหรับตัวนับยังไม่อ่าน) ต้อง apply ก่อน deploy Worker |
| ช่องข้อมูล / fields | ชื่อ องค์กร อีเมลหรือเบอร์โทร (อย่างน้อยหนึ่งช่อง) ผลิตภัณฑ์ที่สนใจ (เพิ่ม Exam / Gate / Crowd / Attendance) ข้อความ ≤ 1,000 · ตัดช่อง "แพ็กเกจ" ออก (เซิร์ฟเวอร์ปฏิเสธช่องอื่น) |
| กันสแปม / spam | Turnstile action `lead` (fail closed) · 5 ครั้งต่อผู้ส่งต่อชั่วโมง · 50 ต่อวัน · ไม่เก็บ IP |
| ติดต่อสาธารณะ / public contact | LINE OA "LENSIQ" `@632yliiw` เท่านั้น (`LENSIQ_SELLER.quote_line`) ลิงก์ https://line.me/R/ti/p/@632yliiw |
| แจ้งเจ้าของ / owner alert | ไม่จำเป็นต่อการเปิด: ปิดจนกว่าเจ้าของตั้ง `LINE_CHANNEL_ACCESS_TOKEN` และ `LEAD_NOTIFY_LINE_TO` (`docs/DEPLOY.md`); ทดสอบด้วย `npm run backend:notify-test` |

ยังค้าง / still open: ทนายตรวจข้อความข้อ 8.2 · อีเมล PDPA (`LENSIQ_SELLER.dpo_email`) ยังว่าง ช่องทางขอลบตอนนี้คือ LINE OA ·
counsel review of 8.2; the PDPA e-mail is still empty, so deletion requests go through the LINE OA for now.

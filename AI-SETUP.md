# ดูดวง AI — คู่มือตั้งค่าสำหรับเจ้าของระบบ

ระบบแปลผลดวงของ LENSIQ (`fortune-ai.js`) ทำงานได้ 2 ชั้น

| ชั้น | ทำงานเมื่อ | ค่าใช้จ่าย | ข้อมูลออกนอกเครื่อง |
|---|---|---|---|
| ตัวเรียบเรียงในเครื่อง (local composer) | ทุกครั้ง (ค่าเริ่มต้น) และใช้แทนเมื่อ AI ขัดข้อง | ฟรี | ไม่มี |
| Claude AI (`claude-opus-5-5`) ผ่าน `server.py` | ตั้ง API key บนเซิร์ฟเวอร์ **และ** ผู้ใช้ติ๊กยินยอม | ต่อครั้ง (ดูด้านล่าง) | เฉพาะ "ผลวิเคราะห์" (facts) |

ถ้ายังไม่ตั้งค่าอะไรเลย ทุกหน้ายังใช้งานได้ตามปกติด้วยตัวเรียบเรียงในเครื่อง และช่องติ๊ก AI จะไม่แสดง

---

## 1) เปิดใช้ AI บนเครื่องนี้ (localhost)

```bash
cd "RSP Demo"
.venv/bin/pip install -r requirements.txt      # ติดตั้งแพ็กเกจ anthropic (ครั้งเดียว)
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx         # สร้าง key ที่ https://platform.claude.com
./start.sh
```

ตรวจสอบ: เปิด http://localhost:8000/api/fortune/status ต้องได้ `{"enabled": true, "model": "claude-opus-5-5"}`

> อย่าใส่ API key ในไฟล์ใด ๆ ที่ commit ขึ้น GitHub ให้ใช้ตัวแปรแวดล้อม (environment variable) เท่านั้น

### ตัวแปรแวดล้อมที่ปรับได้

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `ANTHROPIC_API_KEY` | (ไม่มี) | กุญแจ Claude API — ไม่มี = ปิด AI |
| `LENSIQ_FORTUNE_MODEL` | `claude-opus-5-5` | รุ่นโมเดล |
| `LENSIQ_FORTUNE_RPM` | `10` | จำกัดจำนวนครั้งต่อ IP ต่อนาที |
| `LENSIQ_FORTUNE_DAILY_MAX` | `500` | เพดานจำนวนครั้งทั้งเซิร์ฟเวอร์ต่อวัน (คุมงบ) |
| `LENSIQ_ALLOW_ORIGIN` | (ว่าง) | โดเมนหน้าเว็บที่อนุญาตให้เรียก API ข้ามโดเมน (CORS) คั่นด้วยจุลภาค |
| `LENSIQ_TRUST_PROXY` | (ว่าง) | ตั้ง `1` เมื่ออยู่หลัง proxy (Render/Railway) เพื่อใช้ IP จริงจาก `X-Forwarded-For` |
| `LENSIQ_PROXY_HOPS` | `1` | จำนวน proxy ที่เติม `X-Forwarded-For` (ใช้ค่าตัวที่ N นับจากขวา ค่าทางซ้ายปลอมได้) |
| `LENSIQ_API_ALLOW_ANY` | (ว่าง) | ตั้ง `1` เพื่อรับคำขอจาก IP สาธารณะ — ค่าเริ่มต้นรับเฉพาะเครื่องนี้/วง LAN ส่วนตัว (จำเป็นเมื่อโฮสต์บนอินเทอร์เน็ต) |
| `LENSIQ_HOSTS` | (ว่าง) | ชื่อโดเมนของ API ที่ยอมรับใน `Host` เช่น `lensiq-api.onrender.com` (กัน DNS rebinding; IP/localhost/*.local ผ่านเสมอ) |
| `LENSIQ_API_ALLOW_ORIGIN` | (ว่าง) | Origin เพิ่มเติมที่เรียก `/api/convert` และ `/api/tryon` ได้ (ค่าเริ่ม = เฉพาะต้นทางเดียวกัน) |
| `LENSIQ_API_RPM` / `LENSIQ_CONVERT_RPM` / `LENSIQ_TRYON_RPM` | `60` / `6` / `4` | จำกัดคำขอ `/api/*` ต่อ IP ต่อนาที (รวม / แปลง PDF / Try-On) |
| `LENSIQ_CONVERT_MAX_MB` / `LENSIQ_TRYON_MAX_MB` | `50` / `20` | ขนาดคำขอสูงสุด |
| `LENSIQ_CSP_CONNECT` | (ว่าง) | ต้นทางที่หน้าเว็บ (เสิร์ฟจาก `server.py`) เรียก `fetch` ได้เพิ่มเติม เช่น backend ที่โฮสต์แยก; `LENSIQ_CSP=off` ปิด CSP |

ด่านตรวจของ `server.py` (ทุก `/api/*`): Host ต้องเป็น IP / localhost / *.local / `LENSIQ_HOSTS`, Origin ต้องเป็นต้นทางเดียวกันหรืออยู่ใน allowlist, ผู้เรียกต้องอยู่ใน loopback/LAN (เว้นแต่ `LENSIQ_API_ALLOW_ANY=1`), จำกัดอัตรา ขนาด และ Content-Type และทุกคำตอบมี Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`

---

## 2) ให้เว็บบน GitHub Pages ใช้ AI ได้ (โฮสต์ backend แยก)

GitHub Pages เสิร์ฟได้แค่ไฟล์นิ่ง จึงต้องนำ `server.py` ไปรันที่บริการอื่น แล้วบอกหน้าเว็บให้เรียกไปที่นั่น

### ตัวอย่าง Render (Railway ทำคล้ายกัน)
1. New → **Web Service** → เลือก repo นี้
2. Build command: `pip install -r requirements.txt gunicorn`
3. Start command: `gunicorn -b 0.0.0.0:$PORT server:app`
4. Environment:
   - `ANTHROPIC_API_KEY` = กุญแจของคุณ
   - `LENSIQ_ALLOW_ORIGIN` = `https://<ชื่อผู้ใช้>.github.io` (ไม่ต้องมี `/` ท้าย, ใส่หลายโดเมนคั่นด้วย `,`)
   - `LENSIQ_TRUST_PROXY` = `1`
   - `LENSIQ_API_ALLOW_ANY` = `1` (ค่าเริ่มต้นรับเฉพาะ LAN — บนอินเทอร์เน็ตต้องเปิดเอง)
   - `LENSIQ_HOSTS` = `lensiq-api.onrender.com` (ชื่อโดเมนของ backend นี้)
   - `LENSIQ_FORTUNE_DAILY_MAX` = เช่น `200` เพื่อคุมงบ
5. ได้ URL เช่น `https://lensiq-api.onrender.com` → ทดสอบ `.../api/fortune/status`

### บอกหน้าเว็บให้ใช้ backend นี้
แก้ไฟล์ `lensiq-config.js` (ทุกหน้าโหลดไฟล์นี้):

```js
window.LENSIQ_API_BASE = "https://lensiq-api.onrender.com";
```

ค่าว่าง `""` = ใช้เซิร์ฟเวอร์เดียวกับหน้าเว็บ (เหมาะกับ localhost) — ถ้า backend ล่มหรือหลับ (แผนฟรีของ Render หลับเมื่อไม่มีคนใช้) หน้าเว็บจะใช้ตัวเรียบเรียงในเครื่องโดยอัตโนมัติ

หมายเหตุ: `server.py` บน Render จะติดตั้ง `pdf2docx`/`pymupdf` ไปด้วย (ใช้กับหน้าแปลง PDF) ไม่เป็นปัญหา แต่ build จะนานขึ้นเล็กน้อย

---

## 3) ค่าใช้จ่ายโดยประมาณ

Claude Opus 5.5: ขาเข้า **$4 / 1 ล้านโทเคน**, ขาออก **$20 / 1 ล้านโทเคน**

ต่อการดูดวง 1 ครั้ง (ประมาณการ — ภาษาไทยใช้โทเคนมากกว่าภาษาอังกฤษ):
- ขาเข้า: คำสั่งระบบ ~2,000 + ผลวิเคราะห์ ~3,000–7,000 โทเคน (เบราว์เซอร์ย่อ facts ให้ไม่เกิน ~19KB) → ≈ $0.02–0.04
- ขาออก: คำทำนาย 600–900 คำไทย + การคิด (effort "medium") ≈ 5,000–9,000 โทเคน → ≈ $0.10–0.18
- **รวม ≈ $0.12–0.22 ต่อครั้ง (ราว 4–8 บาท)** → 100 ครั้ง ≈ $12–22

วิธีคุมงบ: ตั้ง `LENSIQ_FORTUNE_DAILY_MAX`, ตั้งวงเงิน (spend limit) ในหน้า Console ของ Anthropic, และดูยอดจริงในหน้า Usage
คำสั่งระบบถูกตั้ง prompt caching ไว้แล้ว (ช่วยลดค่าขาเข้าเมื่อมีคนใช้ต่อเนื่อง ถ้าความยาวถึงขั้นต่ำที่ระบบแคชรับ)

---

## 4) ความเป็นส่วนตัว (PDPA)

สิ่งที่ส่งให้ AI มีเพียง **ผลวิเคราะห์ที่คำนวณแล้ว** ตามสัญญาข้อมูลใน `fortune-ai.js`: ศาสตร์, หัวข้อ, ชื่อเล่น (ถ้าผู้ใช้กรอก), ชื่อลักษณะที่พบ, ค่าที่วัดได้, ความหมายตามตำรา, สี/ทิศมงคล

**ไม่ส่ง**: รูปภาพ วิดีโอ จุด landmark ของใบหน้า ชื่อจริง วันเดือนปีเกิด หรือข้อมูลติดต่อ

มาตรการในระบบ:
- ต้องติ๊กยินยอมก่อนทุกครั้ง (จำค่าใน `localStorage` คีย์ `fa-consent` ของเบราว์เซอร์นั้น เอาออกได้ทุกเมื่อ) — เซิร์ฟเวอร์ปฏิเสธคำขอที่ไม่มี `consent: true`
- เซิร์ฟเวอร์ตัดคีย์ที่ไม่อยู่ในสัญญาทิ้ง จำกัดขนาด 20KB / 80 รายการ / ข้อความละ 600 ตัวอักษร
- เซิร์ฟเวอร์ **ไม่บันทึก (log) เนื้อหา** ผลวิเคราะห์ บันทึกเฉพาะชนิดข้อผิดพลาด
- คำตอบของ AI ถูกกรองคำต้องห้ามซ้ำอีกชั้นในเบราว์เซอร์ (ความตาย โรค อุบัติเหตุ หย่าร้าง ล้มละลาย ภัยพิบัติ คำสาป การพนัน ฯลฯ)
- ข้อมูลที่ส่งไป Anthropic เป็นไปตามนโยบายของ Anthropic API (โดยปกติไม่นำไปฝึกโมเดล) — ควรระบุชื่อผู้ประมวลผลนี้ในประกาศความเป็นส่วนตัวของเว็บ

ข้อความยินยอมที่แนะนำ (แสดงอัตโนมัติด้วย `FortuneAI.consentControl` เมื่อ AI เปิดใช้งาน):

> ☐ ให้ AI ช่วยเรียบเรียงคำทำนาย — ระบบจะส่งผลวิเคราะห์และชื่อเล่น (ถ้ากรอก) ไปประมวลผลที่บริการ Claude ของ Anthropic ซึ่งตั้งอยู่ต่างประเทศ (สหรัฐอเมริกา) ไม่ส่งรูป ชื่อจริง วันเกิด หรือข้อมูลติดต่อ และไม่เก็บไว้บนเซิร์ฟเวอร์ของเรา ยกเลิกได้ทุกเมื่อ

ข้อความประกอบใต้ช่องติ๊ก (ถ้าต้องการ):

> เมื่อเลือก ระบบจะส่งผลวิเคราะห์ (เช่น "คิ้วโค้งยาว 1.18 เท่าของตา") และชื่อเล่น (ถ้ากรอก) ไปยังบริการ Claude ของ Anthropic ที่ประมวลผลในต่างประเทศ (สหรัฐอเมริกา) เพื่อเรียบเรียงเป็นคำทำนาย ไม่ส่งรูปภาพ ชื่อจริง วันเกิด หรือข้อมูลติดต่อ ไม่มีการเก็บข้อมูลไว้บนเซิร์ฟเวอร์ของเรา ยกเลิกได้ทุกเมื่อโดยเอาเครื่องหมายออก — เพื่อความบันเทิงเท่านั้น

---

## 5) สำหรับนักพัฒนา (สรุป API)

```html
<script src="lensiq-config.js"></script>
<script src="fortune-ai.js"></script>
```

```js
FortuneAI.consentControl(document.getElementById("aiConsent"), { onChange: on => {/* อ่านใหม่ถ้าต้องการ */} });
const result = await FortuneAI.interpret(facts, { useAI: FortuneAI.hasConsent() });   // ไม่ใส่ useAI = ใช้ค่ายินยอมที่จำไว้
FortuneAI.renderSections(document.getElementById("reading"), result, { aiBadge: true });
// ปุ่ม "อ่านอีกสำนวน"
const again = await FortuneAI.regenerate(facts);
```

ทดสอบ: `GET /api/fortune/status`, `POST /api/fortune` `{facts, consent:true, tone:"warm"|"playful"|"formal"}`
ข้อผิดพลาดตอบเป็น JSON `{error, fallback:true}` (400 ข้อมูลผิด/ไม่ยินยอม, 413 ใหญ่เกิน, 429 ถี่เกิน, 502/504 AI ขัดข้อง, 503 ยังไม่ตั้ง key) และหน้าเว็บจะใช้ตัวเรียบเรียงในเครื่องแทนอัตโนมัติ

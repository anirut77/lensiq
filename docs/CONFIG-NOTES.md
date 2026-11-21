# lensiq-config.js: full notes per setting

The long comments of `lensiq-config.js` moved here word for word on 2026-11-19 (branch help-budget) so that every page
that loads the config file (help.html first, at 400 KB against its 400 KB speed budget, and admin.html) carries about
14 KB less. No code changed: the JavaScript tokens of the file are identical before and after (checked with acorn). Each
setting in `lensiq-config.js` keeps a one-line summary; the full original text is below, in file order. Edit a setting's
note here, not in the config file. See docs/SPEED.md "Comments moved out of lensiq-config.js".

```text
/* lensiq-config.js — LENSIQ site settings (change here, not in page code).
 * LENSIQ_API_BASE: API server for AI readings, usage statistics and payments. "" (default) = no separate backend: AI readings use
 *   the page's own server (server.py) if any, else the on-device composer; no statistics, nothing sent, every page works offline.
 *   Cloudflare Worker (backend/, docs/BACKEND.md): set it to "https://api.example.com" (keeping a value set earlier),
 *   then run node tools/csp-meta.mjs (adds the origin to connect-src) and set ALLOWED_ORIGINS on the Worker
 *   (old server.py: LENSIQ_ALLOW_ORIGIN=https://<user>.github.io on the server, AI-SETUP.md) */

/* LENSIQ_TURNSTILE_SITEKEY: Cloudflare Turnstile site key for the AI writing assistant on the Worker (pairs with the secret
 *   TURNSTILE_SECRET). "" (default) = off; **set it before going live** (keeps bots off the AI quota), then run node tools/csp-meta.mjs
 *   (adds https://challenges.cloudflare.com to the CSP only when set) */

/* LENSIQ_GOOGLE_CLIENT_ID: OAuth 2.0 Web client ID from Google Cloud Console for member "Sign in with Google"; public, not a
 *   secret; must match GOOGLE_CLIENT_ID in backend/wrangler.toml. "" (default) = no membership: no sign-in button, no reading limit.
 *   After setting it run node tools/csp-meta.mjs (adds https://accounts.google.com/gsi/ only then). Google's script loads only when
 *   the visitor taps sign-in (docs/BACKEND.md "Member sign-in"). */

/* LENSIQ_ANALYTICS: เมื่อตั้ง LENSIQ_API_BASE แล้ว จะโหลด lensiq-api.js + lensiq-analytics.js (ถามความยินยอมก่อนเสมอ,
 *   เคารพ Do-Not-Track) และ lensiq-fortune-hook.js บนหน้าดูดวง — ตั้งเป็น false เพื่อปิดสถิติทั้งหมด */

/* LENSIQ_MERIT_INTEREST_FORM (Merit MVP, 2026-11-12): แบบฟอร์ม "แจ้งความสนใจบริการทำบุญแทน" ใต้คำแนะนำตามความเชื่อบนหน้าดูดวง
 *   false (ค่าเริ่มต้น) = ไม่แสดงส่วนบริการแบบเสียเงินเลย — คำแนะนำฟรียังแสดงตามปกติ
 *   ห้ามเปิดจนกว่าทนายตอบ CTO-BRIEF L42 / L43 และเจ้าของตัดสินใจ — ต้องเปิดคู่กับ MERIT_INTEREST_FORM = "on" บน Worker
 *   (ตั้ง true อย่างเดียวไม่มีผล ถ้าเซิร์ฟเวอร์ไม่ตอบว่าเปิด) และไม่แสดงเลยระหว่างสถานะวิกฤตของหน้าดูดวง (เฉพาะเซสชันเบราว์เซอร์, L59) */

/* LENSIQ_ORG_ACCOUNTS (org-p1, 2026-11-14): short organisation accounts (name, billing details, admins / staff, invite links,
 *   data export) on the account page (account-org.js) and the "organisation" tab of the back office. false (default) = nothing
 *   shown, no organisation request sent; do not turn on before the owner approves. Needs ORG_ACCOUNTS = "on" on the Worker too
 *   (true alone does nothing if the server does not say it is on); only a real true counts. */

/* LENSIQ_FACEPARSE: the outfit studio uses BiSeNet (vendor/models/faceparse-bisenet-r18-q8.onnx) instead of the default model.
 *   false (default) = MediaPipe Selfie Multiclass (Apache-2.0, commercial use allowed). true = BiSeNet, trained on CelebAMask-HQ
 *   (research / non-commercial only; file not in git): only with the model file and a licence (vendor/models/FACEPARSE-LICENSE.txt)
 *   or for testing with ?faceparse=1 */

/* LENSIQ_AGE_GENDER: ตัวเลือก "ใช้อายุ/เพศ" ของป้ายโฆษณา (signage.html) — โมเดล face-api.js ageGenderNet ฝึกจาก UTKFace
 *   (ข้อมูลอนุญาตเฉพาะงานวิจัย ไม่ใช่เชิงพาณิชย์ — LICENSES/THIRD_PARTY.md F5) โหลดเฉพาะเมื่อเปิดตัวเลือกนี้เท่านั้น
 *   ใช้ได้เฉพาะในโหมดเดโมงานวิจัย (ดู LENSIQ_PROFILE ด้านล่าง) · false = ซ่อนตัวเลือกและไม่โหลดโมเดลเลยแม้ในโหมดเดโม */

/* LENSIQ_FORTUNE_STRAIGHT (owner decision 2026-11-12: APPROVED; switched OFF again 2026-11-12 23:5x by the owner's standing
 *   order "if the fresh crisis review fails, turn it off immediately": docs/INCIDENT-2026-11-12-STRAIGHT-OFF.md): ตัวเลือก
 *   "ดูตรง ๆ / Read it straight / 直说" บนหน้าดูดวง · ต้องยืนยันอายุ 18+ ก่อน (จำไว้ในเครื่อง) · ผู้ที่ยังไม่ยืนยันหรือปิดตัวเลือก
 *   ได้ถ้อยคำนุ่มนวล · ระหว่างที่ตาข่ายวิกฤต ขั้นถามความรู้สึก หรือการ์ดช่วยเหลือทำงาน ไม่มีโหมดตรงและไม่มีเคล็ด/ของมงคล
 *   false = ซ่อนตัวเลือกทั้งหมด (tests/unit/fortune-honest.test.js ตรวจค่าที่ส่งมอบ) */

/* LENSIQ_LOOK_SALON (owner decision 2026-11-14, ข้อแนะนำการแต่งลุค ตัวเลือก ก): "โหมดร้าน" ของข้อแนะนำการแต่งลุค (แสดงชื่อแบบจาก
 *   แคตตาล็อกที่ร้านพิมพ์เอง) ปิดตายจนกว่าจะมีขั้นตอนให้คน (เจ้าของหรือ admin) อนุมัติข้อความที่ร้านพิมพ์ก่อนแสดง
 *   (docs/BEAUTY-IMAGE-DESIGN.md §4) ขั้นตอนนี้ยังไม่ได้สร้าง · ตั้ง true อย่างเดียวไม่มีผล: lensiq-look.js ต้องมีขั้นตอนอนุมัติด้วย
 *   ข้อแนะนำแบบคงที่ 31 ข้อและภาพตัวอย่างสดไม่ขึ้นกับสวิตช์นี้ (เทสต์ look ที่ล็อกไว้ 2026-11-14 ตรวจค่าที่ส่งมอบ: evals-locks/beauty-look.sha256) */

/* LENSIQ_EXPRESSION (round 16): โมเดลสีหน้า face-api.js faceExpressionNet (ข้อมูลฝึกไม่ชัดเรื่องสิทธิ์ — F5) ที่หน้า neuro,
 *   signage (ยิ้ม/Valence/อารมณ์), booth (สีหน้าหลัก/Valence) และ photobooth (ตรวจสีหน้ารูปติดบัตร) ใช้
 *   ใช้ได้เฉพาะในโหมดเดโมงานวิจัย · false = ไม่โหลดแม้ในโหมดเดโม */

/* LENSIQ_RESEARCH_DEMO (round 16): สวิตช์ "เดโมงานวิจัย" ของแต่ละเครื่อง (cameras.html#profile และหน้าที่ใช้โมเดลวิจัย)
 *   true (ค่าเริ่มต้น) = ผู้ใช้เปิดเดโมงานวิจัยในเครื่องตัวเองได้ (ปิดไว้เป็นค่าเริ่มต้น จำไว้ในเครื่อง ปิดกลับได้ตลอด)
 *   false = **การติดตั้งให้ลูกค้า: ล็อกปิด** สวิตช์ใช้ไม่ได้ และไม่มีทางเปิดโมเดลอายุ/เพศหรือสีหน้าได้เลย
 *   (แก้บรรทัดนี้เป็น window.LENSIQ_RESEARCH_DEMO = false; ในชุดไฟล์ที่ส่งให้ลูกค้า) */

/* LENSIQ_PC_THAI_EQUIV (round 17 P9): การ์ด "โหมดเดินทาง" ในหน้าตรวจสินค้า (medicine.html, lensiq-pc-travel.js) แสดงรายชื่อสินค้าในไทย
 *   ที่มีตัวยาเดียวกับสินค้าต่างประเทศ (จาก TMT ฉบับ 17 ก.พ. 2563, CC BY — เป็นรายชื่อ ไม่ใช่คำแนะนำ ไม่ใช่ทะเบียน อย.)
 *   false (ค่าเริ่มต้น) = ปิด: การ์ดบอกว่ารอหนังสืออนุญาตใช้ข้อมูลทะเบียนจาก อย. (CTO-BRIEF L13) และให้ชื่อสามัญไปถามเภสัชกร
 *   true = เปิด (เจ้าของตัดสินใจเท่านั้น) · ต้องเป็น true จริงเท่านั้น ค่าอื่นถือว่าปิด */

/* LENSIQ_PROFILE: ชุดค่าการติดตั้ง — "commercial" (ค่าเริ่มต้นตั้งแต่ round 16: โหมดลูกค้า ทุกเว็บรวม GitHub Pages) | "demo"
 *   โหมดลูกค้า: LENSIQ_AGE_GENDER = LENSIQ_EXPRESSION = LENSIQ_FACEPARSE = false — ไม่โหลดและไม่แสดงโมเดลอายุ/เพศ (UTKFace)
 *   และโมเดลสีหน้า · BiSeNet (ไม่ใช่เชิงพาณิชย์) ปิดค่าเริ่มต้น ลิงก์ทดสอบ ?faceparse=1 ใช้ได้เฉพาะเมื่อ LENSIQ_PROFILE === "demo" และเปิดเดโมงานวิจัย
 *   (PBHQ.faceparseAllowed ใน photobooth-hq.js ใช้ทั้ง studio.js และ photobooth-hq.js;
 *   ไฟล์โมเดลไม่อยู่ใน git จึงโหลดไม่ได้บนเว็บสาธิต) · โมเดลตรวจจับ/จุดใบหน้า/จดจำใบหน้าของ face-api.js ยังทำงานเหมือนเดิม
 *   (ยังรอความเห็นทนายความ LICENSES/THIRD_PARTY.md F5/F6 ป้าย "โมเดลใบอนุญาตวิจัย" บนหน้ากล้องจึงยังแสดงอยู่)
 *   "demo" = เดโมงานวิจัย: เปิดจากสวิตช์ในเครื่อง (localStorage "lq-research-demo" = "on") หรือผู้ติดตั้งตั้ง
 *   window.LENSIQ_PROFILE = "demo" ก่อนโหลดไฟล์นี้ (เครื่องสาธิต) — สวิตช์ในเครื่องยังปิดกลับได้
 *   ล็อกโหมดลูกค้า (สวิตช์เปิดไม่ได้): LENSIQ_RESEARCH_DEMO = false หรือผู้ติดตั้งตั้ง LENSIQ_PROFILE = "commercial" ไว้ก่อน
 *   ค่าเดิมของ round 12: localStorage "lq-profile" = "commercial" ยังหมายถึงปิดเดโมงานวิจัยในเครื่องนี้
 *   ผลรวมอยู่ใน window.LENSIQ_RESEARCH = { on, locked: null | "operator" | "profile", key } (lensiq-research.js ใช้แสดงสวิตช์) */

/* LENSIQ_SELLER: ข้อมูลผู้ให้บริการ/ผู้ขาย — แหล่งเดียวที่หน้า ช่วยเหลือ ข้อกำหนด ความเป็นส่วนตัว (legal.js) แบบฟอร์มติดต่อ
 *   (lensiq-leads.js) และหน้าราคาอ่านไปแสดง กรอกที่นี่ที่เดียวแล้วทุกหน้าเปลี่ยนตาม ช่องที่ว่างจะแสดงข้อความกลาง
 *   "รายละเอียดผู้ให้บริการจะประกาศก่อนเปิดขาย / ติดต่อผ่านแบบฟอร์ม" แทนวงเล็บ [..]
 *   sales_open: true เฉพาะเมื่อเปิดขายจริงแล้ว — node tools/check-legal.mjs จะล้มเหลวถ้า sales_open (หรือ BILLING_ENABLED/
 *   FREE_MODE=false ใน backend/wrangler.toml) แต่ช่องที่จำเป็นยังว่าง (ต้องตรงกับ SELLER_* ใน wrangler.toml)
 *   ค่าที่เป็นตัวเลขร่าง (retention_*) ใช้แสดงในนโยบายความเป็นส่วนตัวพร้อมป้าย "ร่าง" จนกว่าทนายความยืนยัน */

/* LENSIQ_LEADS_FORM: แบบฟอร์มขอใบเสนอราคาส่งถึงเซิร์ฟเวอร์ (POST /v1/leads แล้วเข้ากล่องรับในหลังบ้าน) ค่าเริ่มต้น: เปิด
 *   (คำสั่งเจ้าของ 12 พ.ย. 2569: เปิดแบบฟอร์มเมื่อกล่องรับ ข้อความความเป็นส่วนตัว และเกตพร้อม)
 *   เปิด: ส่งได้เฉพาะหน้าที่ตั้ง API ไว้ (deploy/public-site.json: index.html) พร้อม Turnstile; ข้อ "คำขอใบเสนอราคา" ใน
 *   privacy.html แสดง · ปิด (ตั้ง false ก่อนโหลดไฟล์นี้): ไม่ส่งอะไรออกจากเครื่อง เก็บคำขอไว้ในเบราว์เซอร์เท่านั้น และซ่อนข้อนั้น
 *   (docs/LEADS-DESIGN.md) */

/* LENSIQ_LEADS_NOTICE: ข้อความสั้นข้างแบบฟอร์มขอใบเสนอราคา "หากส่งไม่ได้ ติดต่อทาง LINE" พร้อม ID จาก LENSIQ_SELLER.quote_line (คำสั่งเจ้าของ 13 พ.ย. 2569:
 *   แสดงไว้จนกว่าแก้ปัญหาส่งบน iPhone และเจ้าของตรวจบน iPhone แล้ว) ปิดได้โดยตั้ง false */
/*   ปิดแล้ว 16 พ.ย. 2569 (คำสั่งเจ้าของ): เจ้าของยืนยันว่าส่งจาก iPhone ได้และแจ้งเตือน LINE ถึง (คำขอ b0011eb6, 15 พ.ย. 22:35)
 *   เปิดคืนได้โดยตั้ง true */

/* round 12 (round 16 wording): ป้องกันการติดตั้งให้ลูกค้าที่ยังเปิดเดโมงานวิจัยค้างไว้ — บนหน้ากล้อง เมื่อเครื่องนี้เปิด
 *   "เดโมงานวิจัย" อยู่และหน้าเว็บไม่ได้เปิดจากเว็บสาธิต (github.io) หรือเครื่องนักพัฒนา (localhost) จะแสดงแถบเตือนด้านบน
 *   ว่าโมเดลใบอนุญาตวิจัยเปิดอยู่ พร้อมลิงก์ไปปิด (?profilebanner=1 บังคับแสดงเพื่อทดสอบ) ; สวิตช์อยู่ใน lensiq-research.js */

/* ตัวโหลด: เฉพาะเมื่อมี LENSIQ_API_BASE — ไฟล์มาจากต้นทางเดียวกับหน้าเว็บ (CSP script-src 'self') */

/* LENSIQ_DEVICE_EXPORT (D-4, 19 พ.ย. 2569): ส่วน "ข้อมูลของฉันในเครื่องนี้: บันทึกเป็นไฟล์ / โหลดจากไฟล์" ท้าย privacy.html
 *   (lensiq-device-data.js) ปิดเว้นแต่ตั้งเป็น true พอดี และปิดเสมอในชุดติดตั้งของลูกค้า (LENSIQ_RESEARCH_DEMO = false)
 *   เปิด: เพิ่มบรรทัด window.LENSIQ_DEVICE_EXPORT = true; ใน lensiq-config.js (และเพิ่ม ?v= ของ lensiq-config.js ทุกหน้า)
 *   ไม่มีการส่งข้อมูลออกจากเครื่อง ดู docs/PDPA-NOTES-FOR-COUNSEL.md หัวข้อ D-4 */
```

## Comments moved from lensiq-config.js (2026-11-21, A5)

Moved here word for word so the gate pages stay inside their page-weight budgets (tests/e2e/speed-budget.e2e.mjs) after
they started loading lensiq-config.js (A5 item 4). The code and the JSDoc type comments are unchanged; "line" is where the
comment stood in lensiq-config.js (v29, origin/main 502ec313) before the move.

```text
[line 1] /* lensiq-config.js — LENSIQ site settings (change here, not in page code). Full notes per setting: docs/CONFIG-NOTES.md.
 * LENSIQ_API_BASE: API server (AI readings, statistics, payments); "" = no backend, every page works offline. */
[line 5] /* LENSIQ_TURNSTILE_SITEKEY: Turnstile site key for the AI writing assistant; "" = off; set before going live */
[line 8] /* LENSIQ_GOOGLE_CLIENT_ID: public OAuth client ID for member sign-in; "" = no membership */
[line 11] /* LENSIQ_ANALYTICS: with LENSIQ_API_BASE, consent-gated statistics; false = all statistics off */
[line 14] /* LENSIQ_MERIT_INTEREST_FORM (Merit MVP): paid merit-service interest form; off until L42/L43 and the owner; needs the Worker switch */
[line 17] /* LENSIQ_ORG_ACCOUNTS (org-p1): organisation accounts; off until the owner approves; needs ORG_ACCOUNTS = "on" on the Worker */
[line 20] /* LENSIQ_FACEPARSE: true = BiSeNet (non-commercial, file not in git); false = MediaPipe Selfie Multiclass (Apache-2.0) */
[line 23] /* LENSIQ_AGE_GENDER: signage age/gender option (UTKFace, research only, F5); research demo only; false = never loaded */
[line 26] /* LENSIQ_FORTUNE_STRAIGHT: "read it straight" option, 18+ confirm; OFF since 2026-11-12 (docs/INCIDENT-2026-11-12-STRAIGHT-OFF.md) */
[line 29] /* fortune-paid switches: off */
[line 33] /* LENSIQ_FORTUNE_CAUTIONS (item 177): the closed "สิ่งที่ควรระวัง" section (fortune-caution.js); off until the owner says "177 ขึ้นเว็บ".
 * _CN_WEST (D-6): Chinese and Western rules, off until expert review; _DRAFTS: rules not yet expert-reviewed (preview only) */
[line 38] /* LENSIQ_COMPAT_V2 (owner night order A6, 2026-11-20): compat.html v2 view (compat-v2.js, loaded on demand by compat-ui.js);
 * off on the live site and in customer builds until the owner approves the go-live */
[line 41] /* LENSIQ_PET_ZODIAC (owner spec 2026-11-19): the petread share card becomes a card the system draws (12 zodiac animals + a
 * secret card, independent of the reading, free) with a collection kept on this device. Off on the live site until the owner
 * approves the samples. LENSIQ_PET_CARD_CLASSIC (spec name PET_CARD_CLASSIC, decision 138 ข): true = the 4 classic colour
 * themes even with zodiac on; default false. LENSIQ_PET_ZODIAC_ODDS: odds preset of lensiq-pet-draw.js, "b" (decision 137 ข:
 * day's animal x2, secret 1 in 50, 1 in 10 on full-moon days) or "a" (all equal, 1 in 50). */
[line 49] /* LENSIQ_CARD_BRAND (owner decision 184 ก, 2026-11-20): the brand printed on the pet share card ("จาก <brand>" / "From <brand>" /
 * "来自 <brand>" and the card header), one setting for every card template and the save-image / text fallback; a shared card
 * cannot be corrected later. LENSIQ_CARD_SHOW_ADDRESS (owner change 2026-11-20): false = the card prints the brand only, with no
 * site address and no QR code (the QR encodes the address), until the site is live on its own domain; then set true in the same
 * commit that points LQPet.LINK (lensiq-pet.js, the one address setting) at the new domain (docs/PRODUCTION-MOVE-PLAN.md 2.6). */
[line 57] /* LENSIQ_LOOK_SALON (decision 2026-11-14 ก): shop-catalogue mode of the look suggestions; off until a human approval step exists */
[line 60] /* LENSIQ_EXPRESSION (round 16): faceExpressionNet (F5) on neuro, signage, booth, photobooth; research demo only */
[line 63] /* LENSIQ_RESEARCH_DEMO (round 16): per-device research demo switch; false = customer installation, locked off */
[line 64] // customer installation: = false
[line 66] /* LENSIQ_EXAM_PHONE_ZOOM (decision 221 default ข): Exam lab phone zoom pass (decision 217, 9 crops when the full frame shows no
 * phone; docs/exam/EXAMLAB-PHONE-SET.md); off unless exactly true, customer builds ship it off; off = full-frame check as before */
[line 70] /* LENSIQ_PC_THAI_EQUIV (round 17 P9): Thai same-ingredient list on the travel card; off until the owner decides (L13) */
[line 73] /* palm v2 (2026-11-19, docs/acceptance/palm.md): off unless exactly true · LANDMARKS = MediaPipe hands (tier 2-U), demo profile only */
[line 77] /* LENSIQ_PROFILE: "commercial" (default, customer mode: research models off) | "demo"; result in window.LENSIQ_RESEARCH */
[line 82] /* storage blocked: customer mode */
[line 90] /* LENSIQ_SELLER: seller details read by help, terms, privacy, the contact form and pricing; empty = neutral text.
 *   sales_open: true only when selling; tools/check-legal.mjs checks the required fields */
[line 93] // เปิดขายบริการแบบชำระเงินแล้วหรือยัง
[line 94] // ชื่อนิติบุคคล/บุคคลผู้ให้บริการ (= SELLER_NAME)
[line 95] // เลขประจำตัวผู้เสียภาษี 13 หลัก (= SELLER_TAX_ID)
[line 96] // ที่อยู่ (= SELLER_ADDRESS)
[line 97] // อีเมลฝ่ายช่วยเหลือ
[line 98] // LINE Official Account เช่น "@lensiq" (ช่องทางสำรองของแบบฟอร์มทั่วไป: กรอกแล้วแสดงบนหน้าเว็บทันที)
[line 99] // LINE Official Account "LENSIQ" ของแบรนด์ สำหรับขอใบเสนอราคา (12 พ.ย. 2569) แสดงเฉพาะเมื่อ LENSIQ_LEADS_FORM เปิด
[line 100] // ชื่อ / ตำแหน่ง DPO หรือผู้ติดต่อด้านข้อมูลส่วนบุคคล
[line 101] // อีเมล DPO
[line 102] // หน้าสถานะระบบ (https://…)
[line 103] // วันที่มีผลของข้อกำหนด/นโยบาย เช่น "1 ธันวาคม 2569"
[line 104] // ผู้ให้บริการอีเมลฝ่ายช่วยเหลือ (นโยบายความเป็นส่วนตัว ข้อผู้รับข้อมูล)
[line 106] // คุกกี้เซสชันสมาชิก (ปัจจุบันไม่มี: ใช้ Bearer token ใน sessionStorage)
[line 109] // ทนายความยืนยันเกณฑ์อายุ ฐานการส่งข้อมูลต่างประเทศ และระยะเวลาเก็บแล้ว
[line 112] /* LENSIQ_LEADS_FORM: quote requests to POST /v1/leads (on by owner order 2026-11-12); false = kept in the browser only */
[line 114] /* LENSIQ_LEADS_NOTICE: "if sending fails, use LINE" note; off since 2026-11-16 (owner order); true turns it back on */
[line 117] /* round 12: warning bar on camera pages when the research demo is on outside the demo site (?profilebanner=1 forces it) */
[line 147] /* loader: only with LENSIQ_API_BASE; same-origin files (CSP script-src 'self') */
[line 157] // v6: fortune-pet merge (analytics page list)
[line 158] // keep order: api before analytics
[line 162] // not on admin, pricing or counselling (77 ก)
[line 164] // member sign-in (account chip in the header, light reading for guests) — inert unless the Worker reports
[line 165] // membership and LENSIQ_GOOGLE_CLIENT_ID is set; never on the back office
[line 166] // LENSIQ_MEMBER = false (set by a deploy config for a page that needs the API but no sign-in) skips it
[line 168] // fortune pages: analytics hook (no-op without consent) + Turnstile token for the AI writing assistant (when configured)
[line 172] /* LENSIQ_TRYON: AI try-on (photobooth.js), matches backend TRYON; off = no /api/tryon/status call */
[line 174] /* LENSIQ_CONVERT_SERVER: PDF -> DOCX via server.py only; off = convert in the browser */
[line 176] /* LENSIQ_HELP_TOP_STICKY (75 ก): 1323 icon in the sticky bar; false = in the page */
[line 179] /* LENSIQ_FORTUNE_THEME (decision 92): "a" = fortune theme; "classic" = previous look (docs/FORTUNE-THEME.md "Switch back") */
```

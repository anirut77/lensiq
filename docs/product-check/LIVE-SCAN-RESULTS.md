# Product Check live scan: results (2026-11-12)

> Owner order 2026-11-12, after phone testing: "not real-time, the box has to be aimed carefully, too many taps. Redesign
> the capture as a live scan. Keep all privacy filters." Built on `main` at `7b7f1db`. **Nothing is deployed.** Every
> number below states its source. **No real phone was measured: a real-phone measurement is still needed.**

## สรุปสำหรับเจ้าของ (Thai summary)

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
  - ราคาที่จ่าย: ฉลากสินค้าจริงที่ส่งอัตโนมัติได้ 230/360 = 63.9 % (แบบกดเองผ่านตัวกรอง 83.1 %) ที่เหลือใช้ปุ่มกดเองได้ตามเดิม
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
| `tests/unit/backend-pc-auto.test.js` | A1 gate + valid code needed; A2 public path unchanged; A3 auto filter; A4 boolean; A5 Product Check features only; A6 auto rate limit; A7 nothing auto / no facts / no code reaches the provider | 7/7 |
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

## 4. Tester-only auto-send: the rules

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
  (`ai_off_auto_filter`) the placeholder, a possible name, session evidence or no text. An auto-only limit per caller:
  6 a minute, 150 a day (given back when refused before a provider call). The flag, the tester code and the facts never
  reach a provider (A7).
- **Client-only, stated plainly:** the face check, "one round per product / per steady view", the session cap and that the
  text is the device's merged OCR. A modified client could still send without the `auto` flag through the public path,
  which the Worker already accepted before (it cannot see whether a preview was shown).

## 5. Leak measurement with the new flow (source: synthetic, the two locked sets; scored by the scorer fixed before building)

Log: `~/LENSIQ-field/evals/live-scan/live-leak-run-2026-11-12T02-21-20-891Z.log` (detail JSON next to it; an earlier run at
01:50 on the previous version of `lensiq-pc-live.js` gave identical numbers and is kept too). Guard sha256 `40673a2c…`,
`lensiq-pc-live.js` sha256 `56ba9e78…`. Image mode counts every personal item on a capture whose photo
would be sent (worst case; auto-send sends no photo at all now).

| Set | Flow | Text mode: personal items reaching the AI | Image mode: captures with personal data whose photo is sent |
|---|---|---|---|
| p7 (`470d3e7b…`, 260 items on 94 captures) | auto, single reading | **0/260** [0.0–1.5] | **0/94** |
| p7 | auto, merged from 3 damaged readings | **0/260** | **0/94** |
| p7b (`371748a2…`, 614 items on 214 captures, session evidence off) | auto, single | **0/614** [0.0–0.6] | **0/214** |
| p7b | auto, merged | **0/614** | **0/214** |
| both | manual (unchanged) | 0/260; 0/614 | (as published in P7-RESULTS) |

- Target (0 in both modes): **met**.
- Cost of the stricter auto rule: real product labels auto-sent 230/360 = 63.9 % [58.8–68.7] on p7, against 83.1 % that
  pass the manual gate (the rest are possible names such as Latin brand pairs, and maker persons). They keep the manual path.
- A first run at 01:40 UTC on the same code as the 01:50 run gave identical results; its log was removed by mistake when
  re-running (stated so the log list is complete). The 01:50 and 02:21 logs are kept.
- Not covered by these sets: a merged reading across two objects. The live scan resets the reading on a scene cut (large
  motion, or the label leaving the frame for two frames; e2e check 2). A slow, steady move from a pack to a personal note
  without a cut is a residual risk; the guard and the gate still run on the merged text.

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

## 7. Legal list text (for the owner to add; draft for counsel)

**TH:** สำหรับกลุ่มผู้ทดสอบแบบปิดเท่านั้น (รหัสผู้ทดสอบถูกต้อง และเปิดประตูผู้ทดสอบ): หลังผู้ทดสอบยินยอมหนึ่งครั้งและเลือก "จำการเลือกนี้"
ระบบส่งข้อความที่อ่านได้บนเครื่องจากการสแกนสดให้ผู้ให้บริการ AI ที่ระบุในหน้าขอความยินยอมโดยอัตโนมัติ **แทนการแสดงตัวอย่างและให้กดยืนยันทุกครั้ง**
เฉพาะภาพที่ผ่านตัวกรองทั้งหมดบนเครื่อง (เป็นฉลากสินค้า ไม่ใช่ฉลากจ่ายยาหรือเอกสารส่วนบุคคล ไม่พบชื่อ ข้อมูลส่วนตัว หรือคำที่อาจเป็นชื่อคน และไม่พบใบหน้า)
สินค้าละหนึ่งครั้ง ไม่เกิน 10 สินค้าต่อรอบ ไม่ส่งขณะหน้าถูกซ่อน ไม่ส่งภาพโดยอัตโนมัติ ข้อความที่ส่งแสดงบนจอหลังส่ง ผู้ทดสอบหยุดและถอนความยินยอมได้ทันที
เซิร์ฟเวอร์ปฏิเสธคำขอแบบอัตโนมัติที่ไม่ได้มาจากผู้ทดสอบ ผู้ใช้ทั่วไปยังต้องดูข้อความและกดยืนยันก่อนส่งทุกครั้ง
ข้อจำกัด: ตัวกันชื่อแบบกฎ (recall อิสระล่าสุด 62 %) อาจพลาดชื่อที่ไม่มีคำนำหน้า การตรวจใบหน้าและการจำกัดหนึ่งครั้งต่อสินค้าบังคับได้เฉพาะบนเครื่อง

**EN:** Closed tester group only (valid tester code, tester gate on): after one consent with "Remember my choice", the text
read on the device by the live scan is sent automatically to the AI provider named on the consent screen, **replacing
the per-capture preview and confirmation**, only for captures that pass every on-device filter (a product label; not a
dispensing label or a personal document; no name, personal data or possible name found; no face found); once per
product, at most 10 products per session, never while the page is hidden, never a photo. The text sent is shown after
sending; the tester can stop and withdraw at once. The server refuses automatic requests that do not come from a tester.
Everyone else still sees and confirms the text before every send. Limits: the rule-based name guard (latest independent
recall 62 %) can miss names without a cue; the face check and "once per product" are enforced on the device only.

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

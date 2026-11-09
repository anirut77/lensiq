# Product Check + AI Gateway: design (round 17, step 2)

> **Status: APPROVED 2026-11-09 — building (P0–P9).** The owner approved this design on 2026-11-09; the decisions are
> recorded in section 15. LENSIQ is not charging yet: everything is built fully for testing, and the legal review
> (running list in `docs/CTO-BRIEF.md` §8) happens before charging starts. P0 (docs, letters, counsel notes) is done;
> nothing is deployed. Org accounts P1–P3 follow after Product Check is complete.
> This document is not legal advice. Every legal point is a **risk signal** for counsel to confirm, not a finding.
> Written 2026-11-09 from the current code (`medicine.html`, `medicine.js`, `lensiq-med.js`, `backend/src/med.js`,
> `backend/src/fortune.js`, `settings.js`, `quota.js`, `util.js`, `checkout.js`, `lensiq-plate.js`) and three research
> passes (official sources, AI providers, on-device models). All web sources were accessed on 2026-11-09.
> Labels used: **[LIVE]** = endpoint called on that date; **[PRIMARY]** = official legal or vendor text read;
> **[SECONDARY]** = press, blog or third party; **[UNVERIFIED]** = not confirmed.

## สรุปสำหรับเจ้าของ (Thai summary)

- **Product Check:** ส่องกล้องที่ยา อาหารเสริม เครื่องสำอาง หรืออาหารจากประเทศใดก็ได้ ระบบจะบอก 4 อย่าง
  1. สินค้านี้คืออะไร
  2. เลขทะเบียนดูเหมือนจดทะเบียนถูกต้องหรือไม่
  3. ฉลากมีคำโฆษณาเกินจริงหรือไม่ โดยชี้ข้อความที่พบและกฎที่ขัด
  4. สัญญาณเสี่ยงว่าเป็นของปลอมหรือไม่มีทะเบียน พร้อมวิธีตรวจสอบต่อ
  
  ระบบ**ไม่บอกว่า "ของแท้" หรือ "ของปลอม"** ทุกหน้าจอเขียนว่า "ไม่ใช่การยืนยันขั้นสุดท้าย ปรึกษาเภสัชกร" และไม่มีคำแนะนำขนาดยา
- **ทำในเครื่องก่อนเสมอ:**
  - อ่านบาร์โค้ดและ QR
  - อ่านตัวอักษรหลายภาษา (PP-OCRv5 ใบอนุญาต Apache-2.0)
  - ตรวจรูปแบบเลขทะเบียน
  - ตรวจคำโฆษณาเกินจริงด้วยชุดกฎ
- **สถานะ:** เจ้าของอนุมัติแล้ว 9 พ.ย. 2569 กำลังสร้าง P0–P9 ยังไม่เก็บเงิน จึงสร้างครบทุกอย่างเพื่อทดสอบก่อน
  และให้ทนายตรวจก่อนเริ่มเก็บเงิน (รายการที่ต้องส่งทนายอยู่ใน `docs/CTO-BRIEF.md` ข้อ 8) P0 เสร็จแล้ว
  ลำดับงาน: Product Check + AI Gateway ก่อน แล้วจึงทำบัญชีองค์กร P1–P3
- **ขั้นคลาวด์:**
  - ใช้โมเดลภาษาและภาพผ่าน AI Gateway เป็นทางเลือกที่ผู้ใช้ต้องกดยินยอม
  - โหมดข้อความ (ส่งเฉพาะข้อความที่อ่านได้) ยังเป็นตัวเลือกและเป็นทางสำรองเสมอ
  - โหมดภาพ: ส่งภาพครอปสินค้าได้หลังผู้ใช้ยินยอมหนึ่งครั้ง มีตัวเลือก "จำการเลือกของฉัน"
    ซึ่งผู้ใช้ถอนได้ทุกเมื่อ ส่งเฉพาะภาพครอปสินค้า และระบบบล็อกการส่งถ้าตรวจพบใบหน้า
  - หน้ายินยอมระบุชื่อผู้ให้บริการที่ใช้จริงและประเทศที่ประมวลผลข้อมูล (เพราะเว็บไซต์เปิดสาธารณะ)
  - ไม่เก็บอะไรเป็นค่าเริ่มต้น
- **แหล่งข้อมูลไทย:**
  - เว็บเซอร์วิสของ อย. มีบริการค้นยา อาหาร เครื่องสำอาง สมุนไพร และเครื่องมือแพทย์ ผู้วิจัยเรียกใช้จริงเมื่อ 9 พ.ย. 2569 ได้ผลกับเลขอาหาร เครื่องสำอาง สมุนไพร เครื่องมือแพทย์ และใบอนุญาตโฆษณา บริการอื่นยังไม่ได้ทดสอบ
  - ไม่มีการระบุใบอนุญาตใช้ข้อมูล เจ้าของตัดสินใจให้**ใช้เว็บเซอร์วิสเพื่อทดสอบได้เลย**
    และ**ส่งหนังสือขออนุญาตถึง อย. ก่อนเริ่มเก็บเงิน** (ร่างไว้ที่ `docs/legal/FDA-PERMISSION-REQUEST-TH.md`)
  - ไม่มีรายการสินค้าผิดกฎหมายของไทยที่ดาวน์โหลดได้
- **AI Gateway:**
  - ระบบกลางสำหรับทุกฟีเจอร์ AI เปิดปิดได้ทั้งระบบและรายฟีเจอร์
  - เลือกผู้ให้บริการและโมเดลต่อฟีเจอร์ พร้อมลำดับสำรองเมื่อผู้ให้บริการล่ม
  - ผู้ให้บริการ**ทุกราย**เปิดในรายการอนุญาตทุกบิลด์ รวมผู้ให้บริการจีนและ OpenRouter ผู้ดูแลระบบปิดรายใดก็ได้
    (ความเสี่ยงของ DeepSeek เรื่องเก็บข้อมูลในจีนและอาจนำไปฝึกโมเดล ยังอยู่ในรายการให้ทนายตรวจ)
  - ตั้งงบรายเดือนและจำกัดจำนวนครั้งต่อผู้ใช้ได้
  - คีย์ API อยู่เป็นความลับบนเซิร์ฟเวอร์เท่านั้น
  - ค่าเริ่มต้นของการติดตั้งใหม่คือ AI ปิดทั้งระบบ จนกว่าผู้ดูแลจะเปิด
- **ค่าใช้จ่ายต่อการตรวจหนึ่งครั้ง** (ราคาประกาศ ยังไม่รวมโทเค็นการคิด):
  - โหมดภาพ: ราว 0.02–0.07 บาท สำหรับโมเดลราคาถูก (Claude Haiku 5.5, GPT-6-luna, Qwen, DeepSeek-flash, Gemini 3.5 Flash-Lite)
  - โหมดข้อความถูกกว่าโหมดภาพราว 15–25%
  - ถึงราว 0.7 บาท สำหรับ Claude Opus 5.5
  - โมเดลเริ่มต้นต้องเลือกจาก**ผลวัดจริง**บนชุดทดสอบ 300 ภาพ ไม่ใช่จากราคา
- **สิ่งที่เจ้าของต้องเตรียม** (ข้อ 13):
  - คีย์ API ใส่เองผ่าน `wrangler secret put`
  - งบประมาณรายเดือน
  - ภาพสินค้าจริงอย่างน้อย 300 ภาพ ห้ามมีคน
  - ลงชื่อและส่งหนังสือขออนุญาตถึง อย. และอีเมลถึง WHO (ร่างเสร็จแล้วใน `docs/legal/`) ก่อนเริ่มเก็บเงิน
  - เภสัชกรที่ปรึกษา
- **ระยะเวลาโดยประมาณ:** 7–10 สัปดาห์ แบ่งเป็น 10 ช่วง (ข้อ 12) ทุกช่วงมีชุดทดสอบคงที่ก่อนสร้าง
  ผู้ตรวจอิสระวัดซ้ำ และตัวเลขจริงต่อช่วง
- **กฎอาหาร:** ปรับให้ตรงกับประกาศโฆษณาอาหารฉบับ 2569 ใน P1

## 0. Fixed coverage list (written before the design)

The design is complete only when every row has an answer here. Rows come from the owner's brief (round 17, parts B and C).

| # | Requirement | Section |
|---|---|---|
| B1 | Recognition pipeline: barcode / QR, multilingual on-device OCR, opt-in VLM step with structured fields, official lookups per country | 2, 3, 4 |
| B1a | Data sources per country with licence status: usable now / needs permission / not available | 4 |
| B2 | Over-claim check: Thai FDA rule set + LLM classifier; every flag shows exact text and rule; labelled test set first | 5 |
| B3 | Unlicensed / counterfeit risk signals incl. reference-image library design; output "risk signals + how to verify" | 6 |
| B4 | Travel mode: translate, INN, nearest Thai equivalent, "no official source covers this country" | 7 |
| B5 | Safety and privacy: not definitive, no dosing, cloud opt-in, crop only, face gate, store nothing | 8 |
| B6 | Measurement plan: ≥ 300 real photos, per field and per country, false "looks fine" on illegal products as the key metric | 9 |
| C1 | Admin panel: global and per-feature on/off, provider + model per feature, ordered fallback, monthly budget, per-user rate limit, on-device fallback when the cap is hit | 10.2 |
| C2 | Adapters with one interface; Western, Chinese, OpenRouter; per model: vision, language quality, price per check, latency, retention, region, terms (verified vision only) | 10.3, 11 (latency and language quality are filled by the P8 eval) |
| C3 | Security: keys only as server secrets, all calls through the relay, per-call log without images or personal data | 10.5 |
| C4 | Privacy: consent names the provider and processing location; new install = AI off | 10.6 |
| C5 | Evaluation tool: same fixed set against every configured model; default model chosen from the numbers | 10.7 |
| C6 | No provider-specific logic outside adapters | 10.3 |
| D | Cost per check per model, effort per phase, risks, what the owner provides | 11, 12, 14, 13 |
| P0 | Owner decisions PC-D1–D10 recorded (approved 2026-11-09); Thai FDA and WHO request letters drafted; counsel notes and the legal-review running list updated | 15, 12, 13; `docs/legal/`; `docs/PDPA-NOTES-FOR-COUNSEL.md` F1; `docs/CTO-BRIEF.md` §8 |

**Changed by the owner's approval (2026-11-09):** B5 / C4 now read "image mode after one consent per user, with
remember-my-choice and withdraw; text only stays a choice and the fallback" (PC-D9), and the provider allowlist starts
with every provider on, the admin can switch any one off (PC-D2). The consent screen still names the provider actually
used and where data is processed (owner rule: the site is public).

## 1. What exists today (built on, nothing removed)

| Piece | Today | Reused for |
|---|---|---|
| `medicine.html` / `medicine.js` / `lensiq-med.js` | Drug label reader: typed text, OCR inside a user-placed crop box (Thai PP-OCRv5 rec only, no text detector), `BarcodeDetector` (no iOS fallback), Thai number parser, Pillbox candidates for loose pills, openFDA / RxNav lookups, 1669 / 1367 emergency lines, no dosing | Product Check is an **extension of this page** (a new "Product Check" tab). The existing modes stay as they are (never delete) |
| `backend/src/med.js` | Text-only Worker proxy: Thai FDA SOAP `GET_DATA_DRUG`, openFDA, RxNav; 20 / min per caller; 24 h edge cache; `MED_ENABLED` switch; not deployed | Extended to the other Thai FDA operations and the foreign sources (4) |
| `backend/src/fortune.js` + `settings.js` + `quota.js` | The only external AI call: Anthropic only, structured JSON, grounding check, Turnstile, consent flag, rate limits and quotas, refund on provider failure, `fallback:true` client contract | Becomes the first **feature** of the AI Gateway (10). Its grounding check stays as the fortune output validator |
| `checkout.js` | MobileNetV2 embedding + cosine KNN for products | Reused for pack similarity (6.3) |
| `lensiq-detect.js faceSharpness()` | Laplacian-variance blur score | Generalised into the image quality check (3.1) |
| `vendor/mediapipe/vision_bundle.mjs` | Already contains `FaceDetector`, `ObjectDetector`, `ImageEmbedder` (model files not vendored) | Face gate (8.2) |

## 2. Pipeline overview

```
camera frame ──► quality check (blur, glare, exposure, text size)          on device
            ──► product crop (text-box union + contrast quad + user box)   on device
            ──► barcode / QR / GS1 DataMatrix (native, then zxing-wasm)    on device
            ──► OCR: PP-OCRv5 det + per-script rec (TH / CJK / KO / Latin) on device
            ──► parsers: registration numbers per country, GTIN, lot, expiry  on device
            ──► over-claim rules (section 5)                               on device
            ──► [opt-in] AI Gateway: structured fields + claim classifier   cloud (10)
            ──► official lookups via Worker proxy (registration, recalls, alerts)  cloud, text only
            ──► result card: what it is · registration signals · over-claims · risk signals · how to verify
```

The flow runs on the device by default and the cloud steps are optional. If the network or AI is off, the user still
gets OCR text, parsed numbers, rule-based over-claim flags and "how to verify" links. This uses the same `fallback:true`
contract as fortune today.

## 3. Recognition on device

### 3.1 Components (all licence-clean; verdicts from the on-device research)

| Component | Choice | Size | Licence | Verdict |
|---|---|---|---|---|
| Runtime | onnxruntime-web 1.20.1 WASM (vendored) | present | MIT | OK |
| Text detection | `PP-OCRv5_mobile_det` (official ONNX, PaddlePaddle on Hugging Face) | 4.83 MB | Apache-2.0 | OK-ATTR |
| Recognition: Thai + English | `th_PP-OCRv5_mobile_rec` (already vendored) | 7.5 MiB | Apache-2.0 | OK-ATTR |
| Recognition: Chinese (simplified + traditional) + Japanese + English | `PP-OCRv5_mobile_rec` | 16.5 MB | Apache-2.0 | OK-ATTR |
| Recognition: Korean + English | `korean_PP-OCRv5_mobile_rec` | 13.4 MB | Apache-2.0 | OK-ATTR |
| Recognition: Vietnamese, Indonesian, Malay, European languages | `latin_PP-OCRv5_mobile_rec` (about 50 Latin-script languages) | 8.04 MB | Apache-2.0 | OK-ATTR |
| Barcode fallback (iOS has no `BarcodeDetector`) | `barcode-detector` ponyfill on `zxing-wasm`, **self-hosted wasm** (the default fetches from jsDelivr, which the CSP forbids) | about 1.04 MiB | MIT + Apache-2.0 + BSD-3 | OK-ATTR |
| GS1 DataMatrix parse | own pure JS in `LQMed`: AI 01 GTIN (mod-10), 17 expiry (DD = 00 → last day of the month), 10 lot, 21 serial; also the `(01)…(17)…` text form | < 2 KB | ours | OK |
| Quality checks | Laplacian variance + Tenengrad (blur), HSV bright-blob (glare), histogram clipping (exposure), det box height (text size) | 0 | ours | OK |
| Product crop | union of OCR det boxes + margin; classical contrast-quad finder (reuse `lensiq-plate.js` proposals); user-adjustable box has the last word. EfficientDet-Lite0 optional only (COCO has "bottle", no "box") | 0 (+4.6 MB optional) | Apache-2.0 | OK-ATTR |
| Rejected | Surya (revenue-gated weights), EasyOCR (weights licence unclear), MMOCR (research weights), TrOCR (no licence tag, English only), Florence-2 (MIT but no Thai / CJK, hundreds of MB) | | | NOT OK / not fit |

The PP-OCRv5 Cyrillic, Arabic, Devanagari, Tamil and Telugu models are out of phase 1.

Models load lazily, one script at a time. Detection + Thai is about 12 MB and detection + CJK is about 21 MB. The script
is picked by the user in phase 1. Automatic script detection (run Thai and CJK on the first line and keep the higher
confidence) is phase 2 and is not designed further here.

The only accuracy figures for these models are **PaddleOCR's own benchmark**: Thai 82.68 %, Korean 88.0 %, Latin 84.7 %
(vendor source, not product packs). **Nothing has been measured on product packs.** Section 9 measures it.

### 3.2 Parsers (pure functions in `LQMed`, unit-tested)

| Number | Pattern | Checked how |
|---|---|---|
| Thai drug | `[12][A-C] n/yy` (+ suffix), herbal `G n/yy` | format only, then lookup; the meaning of each letter is **not asserted** (secondary sources only) |
| Thai food / supplement | 13 digits `PP-T-SSSSS-T-NNNN` | format only; no checksum exists [LIVE: a well-formed fake is caught only by lookup] |
| Thai cosmetic notification | 10 digits `PP-T-NNNNNNN` | format, then lookup |
| Thai device | `yy-T-T-T-NNNNNNN` | format, then lookup (structure unverified) |
| Thai advert permits | food `ฆอ. n/yyyy`, herbal `HB n/yy A`, drug `ฆท. n/yy` [SECONDARY] | lookup via `GET_DATA_ADVERTISE` |
| Malaysia | `MAL` + 8 digits + category letter; cosmetics `NOTyymmxxxxxK` | format only (no machine lookup, 4.4) |
| Singapore | `SIN…P` licence numbers | lookup in the HSA open dataset |
| Canada | DIN (8 digits), NPN (8 digits) | lookup (Health Canada APIs) |
| USA | NDC | lookup (openFDA) |
| EU | none on the pack for national products | name / INN lookup in EMA data (central products only) |
| GTIN / EAN / UPC, GS1 AIs | as 3.1 | check digit; no open GTIN registry exists for Thailand (4.5) |

## 4. Official sources per country

Status labels:
- **USABLE NOW**: a public API or bulk file whose licence allows commercial reuse.
- **NEEDS PERMISSION**: the source works technically, but there is no licence, or the terms require a key, an
  agreement or payment, or forbid scraping.
- **NOT AVAILABLE**: no public machine lookup exists.

All lookups go through the Worker (text only, never an image). They are cached, and personal data in responses is
dropped: some Thai licensees are natural persons, and their names and addresses are removed before the reply.

### 4.1 Thailand

| Source | Covers | Access | Licence | Status |
|---|---|---|---|---|
| Thai FDA SOAP `porta.fda.moph.go.th/FDA_SEARCH_ALL/WS_LICENSE_SEARCH.asmx`: `GET_DATA_DRUG`, `GET_DATA_FOOD`, `GET_DATA_CMT`, `GET_DATA_HERB`, `GET_DATA_MDC`, `GET_DATA_ADVERTISE`, `GET_DATA_ALL`, licensee lookups (21 operations) | drug, food / supplement, cosmetic, herbal, device, adverts: number → name (TH / EN), licensee, status (active / cancelled / expired), deep link | SOAP 1.1, no CORS (Worker needed); about 1,000 rows per name query observed; limits not documented | data.go.th listings: "License not specified" | **NEEDS PERMISSION.** It works [LIVE]: the publicly reported fake cosmetic number `10-2-6600188171` returns 0 rows, and a real one returns 1 row. Written reuse terms from Thai FDA / DGA are needed before sale |
| pertento / cosmetica / meshlog detail pages | product detail | web; pertento JSON is token-gated | not stated | **NEEDS PERMISSION** (link only, never scrape; same as today) |
| catalog.fda.moph.go.th (CKAN, 53 datasets) | licensee lists, GMP sites, statistics, law PDFs; **no product register, no illegal-product list** | CKAN API, CSV / XLSX | licensee lists "Open Data Common" (text not retrievable), others not specified | **NEEDS PERMISSION** |
| oryor.com / ORYOR Smart / LINE @FDAthai | number check, warnings | app / web, no API | none found | **NOT AVAILABLE** (link out in "how to verify") |
| Thai illegal / unsafe product lists | cosmetics, supplements | press releases and PDFs only | n/a | **NOT AVAILABLE** (manual curation, 6.2) |

Drug registrations are valid for 7 years (Drug Act s.86/2) [PRIMARY], so "expired" is a real signal.

### 4.2 United States

| Source | Covers | Licence | Status |
|---|---|---|---|
| openFDA: `drug/label`, `drug/ndc`, `drug/enforcement`, `drugsfda`, `food/enforcement`, `cosmetic/event` [LIVE counts: label 262,909; NDC 138,262; drug recalls 18,076; food recalls 29,586] | labels, NDC, recalls | CC0; do not imply FDA endorsement | **USABLE NOW** (key raises the limit to 120,000 a day) |
| DailyMed v2 | SPL labels incl. many supplements | US Gov / NLM; labeller text | **USABLE NOW** (proxy) |
| RxNorm / RxNav | name → ingredient (INN mapping) | attribution required | **USABLE NOW** |
| FDA Health Fraud Product Database | tainted supplements / cosmetics (hidden sildenafil, sibutramine, mercury) | HTML only, US Gov work [UNVERIFIED for this page] | **NEEDS PERMISSION / verify** (offline parse of a public-domain page, confirm first) |
| FDA Data Dashboard API (import refusals, compliance actions) | firms, products | free key, terms not stated | **NEEDS PERMISSION** |
| FDA Import Alerts | red lists | web only | **NOT AVAILABLE** (machine) |

### 4.3 EU and UK

| Source | Covers | Licence | Status |
|---|---|---|---|
| EMA medicine data (XLSX, nightly) | centrally authorised medicines only | commercial reuse with "EMA as the source" | **USABLE NOW** (no national-only products) |
| EU Safety Gate (ex-RAPEX) weekly XML / XLS | dangerous non-food incl. cosmetics, sometimes with barcode | CC0 1.0 [SECONDARY: confirm on data.europa.eu] | **USABLE NOW (verify licence)** |
| RASFF Window open data | food / feed alerts | CC BY 4.0 (public fields) | **USABLE NOW** (API registration may be needed [UNVERIFIED]) |
| MHRA products | UK-licensed drugs | not stated, web only | **NEEDS PERMISSION** |
| MHRA drug / device alerts via GOV.UK search API | alerts | OGL v3 [UNVERIFIED per item] | **USABLE NOW** (likely) |

### 4.4 Asia-Pacific and Canada

| Source | Covers | Licence | Status |
|---|---|---|---|
| Singapore HSA registered therapeutic products (data.gov.sg CSV + datastore API) [LIVE] | licence no., name, holder, ingredients, strength, manufacturer | Singapore Open Data Licence v1.0 (commercial use with attribution) | **USABLE NOW** |
| HSA notified cosmetics / devices listings | listings | same | **USABLE NOW** [fields UNVERIFIED] |
| HSA health product alerts | adulterated products | web / PDF | **NEEDS PERMISSION** |
| Malaysia NPRA QUEST3+ | MAL / NOT numbers | web only | **NOT AVAILABLE** (format check only) |
| Japan PMDA package inserts | drugs | crawling prohibited; registered service only | **NEEDS PERMISSION** |
| China NMPA data query | drug, cosmetic, device | CAPTCHA, terms not found | **NOT AVAILABLE** |
| Australia TGA ARTG | medicines, complementary, devices | licence not found | **NEEDS PERMISSION** |
| Korea MFDS | drugs, cosmetics, foods | **not evaluated** in this round | **unknown** (research in P4) |
| Health Canada Drug Product Database (REST + bulk) [LIVE] | DIN | Open Government Licence – Canada | **USABLE NOW** |
| Health Canada LNHPD (natural health products) [LIVE] | NPN | OGL-Canada | **USABLE NOW** |
| Health Canada recalls API | recalls | OGL-Canada (feed freshness suspect) | **USABLE NOW** (verify freshness) |

### 4.5 Global

| Source | Use | Licence | Status |
|---|---|---|---|
| WHO Medical Product Alerts (falsified / substandard) | alert list | CC BY-NC-SA 3.0 IGO; commercial use needs permission | **NEEDS PERMISSION** (link out meanwhile) |
| WHO INN lists | INN names | WHO terms | **NEEDS PERMISSION** (use RxNorm for INN mapping instead) |
| ChEMBL | synonyms → INN | CC BY-SA 3.0 (share-alike on derived data) | **USABLE NOW** (keep separate) |
| WHO ATC/DDD | classes | no commercial copying | **NEEDS PERMISSION** |
| Verified by GS1 / GS1 UK | GTIN → brand owner | commercial use excluded without agreement | **NEEDS PERMISSION** |
| GS1 Thailand (885) | GTIN | consumer app only | **NOT AVAILABLE** |
| Open Food Facts / Open Beauty Facts | barcode → name, ingredients | ODbL database, CC BY-SA images | **USABLE NOW**, with conditions: keep in a separate cache table, never merge into our own register (share-alike), never store their images |

### 4.6 Credits

Each source's attribution line is shown on the result card and recorded in `docs/CREDITS-MEDIA.md` / `LICENSES/THIRD_PARTY.md`. Examples:
- the Singapore Open Data Licence needs a visible source notice with a link to the licence;
- openFDA and Health Canada must not be shown as endorsing LENSIQ.

### 4.7 Coverage message

When no **USABLE NOW** source covers the country printed on the pack, the card says so in plain words, e.g. "No official
database we can check covers Malaysia. The registration number has the right shape, but we could not confirm it. Check
it at <official site link>." A missing lookup is **never** shown as "looks fine" (9.2).

## 5. Over-claim check

### 5.1 Rule set (on device, deterministic)

- **Positioning.** Each flag says "this wording is a risk signal under <rule>". It never says "illegal".
  - Drug Act s.88 covers advertising, and s.88 para 2 excludes labels for parts (5) and (6).
  - Whether the food, cosmetic and supplement rules cover packs and online listings is for counsel to confirm.
- **Output of every flag:**
  - the **exact text found**, with its position on the OCR line;
  - the **rule id**;
  - the legal basis, a link and a one-line explanation (TH / EN / ZH).
- **Format.** Rules are data (`lensiq-claims.js`: id, category, patterns, basis, url, severity). They are not code, so
  counsel and the pharmacist can review the list itself.
- **Source of the patterns.** The Thai legal texts were read [PRIMARY]:
  - Drug Act B.E. 2510 (Krisdika v2020);
  - Food Act B.E. 2522;
  - FDA food-advert notice B.E. 2564 with Annex 1;
  - Cosmetic Act B.E. 2558;
  - MoPH Notification 293 on dietary supplements.

| ID | Category | Pattern (examples) | Basis |
|---|---|---|---|
| D01 | drug | ศักดิ์สิทธิ์, หายขาด, รักษาได้ทุกโรค / miracle, cure completely | DA s.88(1) |
| D02 | drug | ดีที่สุด, ได้ผล 100%, เห็นผลทันที | DA s.88(2) |
| D03 | drug | claims an ingredient the register / label lacks (OCR claim vs registered name) | DA s.88(3) |
| D04 | drug | ขับระดู(อย่างแรง), ทำให้แท้ง | DA s.88(4) |
| D05 | drug (ads) | บำรุงกาม, เพิ่มสมรรถภาพทางเพศ, คุมกำเนิด | DA s.88(5) |
| D06 | drug (ads) | efficacy claim on a product registered as ยาอันตราย / ยาควบคุมพิเศษ | DA s.88(6) |
| D07 | drug | แพทย์แนะนำ, ดารายืนยัน, รีวิวจากผู้ใช้จริง | DA s.88(7) |
| D08 | drug | diseases under s.77 (e.g. มะเร็ง, เบาหวาน, วัณโรค); **list not verified** | DA s.77, s.88(8) |
| D09 | drug | advert without a ฆท. permit number | DA s.88 bis |
| D10 | drug | แถม, ชิงรางวัล, ลุ้นโชค | DA s.90 |
| D11 | drug | registration number not found, or the register name differs from the pack | DA s.73 (fake drug definition) |
| D12 | drug | register status cancelled / expired | DA s.86/2 |
| F01–F06 | food / supp | ศักดิ์สิทธิ์ / มหัศจรรย์; ที่สุด / ดีที่สุด / สุดยอด; หายขาด / หายห่วง; ไม่มีผลข้างเคียง; อย. รับรอง / ปลอดภัย (misuse of the อย. mark); เห็นผลเร็ว | F64 Annex 1 §1; FA s.40 |
| F07–F09 | food / supp | ลดโคเลสเตอรอล / ความดัน / น้ำตาลในเลือด; ป้องกันโรคหัวใจ / มะเร็ง / เบาหวาน, ต้านไวรัส; รักษาอัลไซเมอร์ / ซึมเศร้า / เกาต์ … | F64 cl.4(2), Annex 1 §2.1 |
| F10 | food / supp | บำรุงตับ / ไต / สมอง, เพิ่มภูมิคุ้มกัน, Detox, ล้างสารพิษ, เพิ่มน้ำนม | F64 cl.4(3), Annex 1 §2.2 |
| F11 | food / supp | เพิ่มสมรรถภาพทางเพศ, อึด ถึก ทน, อัพไซส์, คืนความสาว | F64 cl.4(4), Annex 1 §2.3 |
| F12 | food / supp | ผิวขาว, ออร่า, ลดริ้วรอย, ชะลอความแก่ | F64 cl.4(5), Annex 1 §2.4 |
| F13 | food / supp | ลดน้ำหนัก, ดักจับไขมัน, สลายไขมัน, Burn / Block, ไม่โยโย่, พุงหาย, before / after | F64 cl.4(6)–(7), Annex 1 §2.5 |
| F14 | food / supp | หมอแนะนำ, เภสัชกรรับรอง | F64 cl.3(6) |
| F15 | supp (label) | **missing** mandatory warnings: "ไม่มีผลในการป้องกัน หรือรักษาโรค", "เด็กและสตรีมีครรภ์ ไม่ควรรับประทาน", the 5-food-groups line, the คำเตือน box | N293 annex item 1 |
| F16 | food / supp | 13-digit number not found, wrong format, or registered to another product | FA s.27(4) |
| F17 | food / supp | ฆอ. permit quoted but not found in `GET_DATA_ADVERTISE` | FA s.41 |
| F18 | kratom / cannabis food | ทำงานทนขึ้น, คลายเครียด, ช่วยให้หลับ, เคลิบเคลิ้ม | 2569 food-advert notice [SECONDARY] |
| C01 | cosmetic | รักษา…, บำบัด, ฆ่าเชื้อโรค, แก้อักเสบ | CA Art.41(3) |
| C02 | cosmetic | เพิ่มสมรรถภาพทางเพศ, กระตุ้นอารมณ์ทางเพศ | CA Art.41(4) |
| C03 | cosmetic | ขาวถาวร, เห็นผล 100%, ได้ผลทุกคน | CA Art.41(1) |
| C04 | cosmetic | ผลวิจัยยืนยัน, ทดสอบทางคลินิก, statistics with no source | CA Art.41(2), Art.45 |
| C05 | cosmetic | notification number not found / revoked / different maker | CA Art.27(5), Art.29 |
| C06 | cosmetic (label) | no Thai label, maker / importer, batch, MFG / EXP or ingredient list | CA Art.22 |

**Before tuning, these must be done** (phase P1):

- **The 2564 food-advert notice was repealed and replaced by a 2569 notice** (effective 28 Jul 2569) [SECONDARY]. The
  2569 text has not been read, so F01–F17 must be re-checked against it.
- The s.77 disease list, the drug advert-permit format and the Herbal Products Act B.E. 2562 rules are not verified.
- Some items cannot be detected from text and stay manual: images of patients, tape measures or scales, and indecent
  content.

### 5.2 LLM classifier (cloud, opt-in, through the gateway)

- **Input:** the OCR text only, plus the product category. In image mode the model reads the text itself.
- **Output:** a JSON list of `{text_span, rule_id, confidence, reason}`, where `rule_id` must be one of the rule ids in
  5.1. The gateway discards any span that is not literally present in the OCR or model-read text. This is the same
  grounding idea as fortune's "every sentence must restate curated facts".
- **Where the two checks agree,** the flag is shown as "found by rule + model".
- **Model-only flags** are shown as "possible, check" and are never escalated alone.
- **Rule-only flags** are always shown, because the rules are deterministic.

### 5.3 Labelled text set first (fixed before any tuning)

- **Size:** at least **400 label / listing texts**.
  - **≥ 150 known over-claims**, taken from:
    - Thai FDA and oryor.com warning press releases;
    - court and fine news;
    - the FDA US Health Fraud list (English);
    - HSA alerts.
  - **≥ 250 compliant texts**, from registered products' own labels.
- **Collection:** text is typed or OCR-corrected by hand. No images of people are used.
- **Labelling:** each text is labelled with the rule ids it breaks, by two people independently. A pharmacist
  adjudicates disagreements. Inter-rater agreement (Cohen's κ) is reported.
- **Split before tuning:** the set is split 50 / 50 into dev and held-out. Only dev is used to tune patterns.
- **Metrics:** reported on held-out, per rule family and for each detector alone and combined (rules, LLM, both):
  - precision;
  - recall;
  - false flags per 100 compliant labels.
- **Storage:** the set lives in `field-data/`, which is git-ignored. Only the scripts and the counts are committed.

## 6. Unlicensed / counterfeit risk signals

### 6.1 Signals (each with "how to verify")

| Signal | Source | Shown as |
|---|---|---|
| No registration number found on the pack | OCR + parser | "We could not find a registration number. Thai law requires one for <category>. Look for it on the side panel, or ask the seller." |
| Number has the wrong format for the stated category | parser | "This does not look like a Thai <category> number" (for example, a 13-digit food number on a product sold as medicine; this check exists today) |
| Number not found in the register | lookup | "Not found in the Thai FDA register on <date>. Check on oryor.com / the ORYOR Smart app (link)" |
| Number found but cancelled / expired | lookup | "Registered, but the register shows <status> since <date>" |
| Number found but the registered name, maker or category differs from the pack | lookup + OCR (fuzzy match, normalised) | "The register lists <name / maker>; the pack shows <…>". The user compares the two side by side |
| On an official warning / recall list | openFDA enforcement, Safety Gate, RASFF, MHRA alerts, Health Canada recalls, curated Thai list (6.2) | "Listed in <source> on <date>: <reason>", with a link |
| Printed expiry has passed, or the GS1 expiry differs from the printed one | GS1 parse + OCR | "Printed expiry <date> has passed" / "The barcode expiry and the printed expiry differ" |
| Over-claims (section 5) | rules + LLM | count + list |
| Packaging differs from the reference images | 6.3 | "Looks different from the reference photos we have (<n> references, <date>)". This is a weak signal only |
| No source covers the country | 4.6 | "We could not check this country" |

There is **no score or verdict**. The card lists:
- the signals found;
- the signals checked and **not** found;
- the checks that **could not be run** (offline, no source, AI off).

The bottom line is always "Not a definitive identification. Confirm with a pharmacist", plus the 1669 / 1367 lines that
are already on the page.

### 6.2 Curated Thai warning list

- **Why curated:** no downloadable Thai list exists.
- **What is stored:** a small, dated, **fact-only** table (`vendor/pc-alerts/th.json`) with:
  - product name;
  - registration number if given;
  - the issue (e.g. "found to contain sibutramine");
  - the source URL and date.
- **Who maintains it:** entered by hand from Thai FDA press releases. Each entry is reviewed by the pharmacist adviser.
- **Copyright and wording:** facts only, with no copying of press-release text or images (no copyright in facts;
  counsel to confirm).
- **Freshness:** the card shows the list's last update date. A list older than 30 days is flagged on the admin page.

### 6.3 Reference-image library (design only; built after counsel)

- **What is stored:**
  - per product key (GTIN and / or registration number), a set of **embeddings only**: the MobileNetV2 vector already
    used in `checkout.js`;
  - per entry: source, licence, date and checksum, as `vendor/pillbox/` does.
- **What is never stored or shown:** the photos themselves.
- **Lawful sources:** in order of preference:
  1. Manufacturer- or distributor-supplied images under a written licence that allows commercial matching (and
     display, if wanted).
  2. LENSIQ's own photos of retail packs. Pack artwork is the maker's copyright, so only embeddings are kept. Counsel
     to confirm (Thai Copyright Act s.32–33).
  3. Official agency images: US NLM images can be public domain, but labeller images may not be. Thai FDA images have
     no reuse terms, so they are link only.
  4. User contributions: opt-in, face-gated, kept on the device; only embeddings would sync, and only after the
     org-accounts PDPA work.
- **Matching rule:**
  - Identity comes from text (GTIN / registration number). Image similarity only flags "looks different from the
    <n> references".
  - The flag needs **at least 3 references** for that key.
  - It is never shown alone as a counterfeit signal.
- **Upgrade path:** MediaPipe MobileNetV3, or DINOv2-S (Apache-2.0; never the non-commercial Cell / XRay variants), only
  if the fixed set shows MobileNetV2 is too weak.

## 7. Travel mode

- **Translation:**
  - The label is translated into the user's language (TH / EN / ZH) through the gateway (text only).
  - The original text stays beside the translation, marked `translate="no"`.
  - The translation is labelled "machine translation".
  - Warning and dosage sections are **shown untranslated with a note**, because a wrong translation there could mislead
    about dosing (no dosing advice rule).
- **INN:**
  - Active ingredients are mapped to INN through RxNorm (USABLE NOW) and ChEMBL synonyms (share-alike, kept separate).
  - The model's ingredient list is accepted only when the INN resolves.
- **Nearest Thai equivalent:**
  - Shown as "products registered in Thailand with the same active ingredient(s) and strength", from the Thai FDA
    register (NEEDS PERMISSION, 4.1).
  - It is a list, never a recommendation, with "ask a pharmacist before switching".
  - Without permission, the card shows only the INN and a link.
- **Country coverage:** the card says plainly when no official source covers the country (4.7).
- **Not done:** no dose conversion and no "you can take this instead".

## 8. Safety and privacy

### 8.1 Rules (carried over from medicine.html, unchanged)

- Not a diagnostic tool and no dosing advice.
- No buy links and no product ranking.
- It never says "genuine" or "fake".
- Every screen says "Not a definitive identification. Confirm with a pharmacist" and shows 1669 / 1367.
- Wording runs through the same checks that today keep dosing words out of medicine.html.

### 8.2 Cloud step

- **Off until switched on.** A new install has AI off (10.2). The cloud step needs the admin switch **and** the user's
  consent (10.6). Nothing is sent before the consent screen has been accepted.
- **Two modes, chosen by the user on the consent screen (owner decision PC-D9, 2026-11-09):**
  - **Text only:** the on-device OCR text is sent, a derived fact, which fits the CLAUDE.md rule "only derived facts are
    sent". It stays available as a choice at every check, and it is the **fallback** whenever image mode cannot run
    (face detected, face detector not loaded, image mode switched off by the admin, consent withdrawn, provider without
    vision).
  - **Image mode:** allowed after **one consent per user**. The screen offers "remember my choice"; when ticked, later
    checks use image mode without asking again. Without it, the user is asked again at the next session.
  - **Per user** means per signed-in member account when the user is signed in, otherwise per browser profile on that
    device (stored locally; nothing about the choice is sent to the server except a consent flag on each call, as fortune
    does today).
  - **Withdraw at any time:** a "Stop sending images" control sits on every result card and in the page settings. It
    clears the remembered choice at once; the next check falls back to text only (or on-device only) and asks again.
  - **The remembered consent is tied to the providers shown.** If the admin changes the chain so that a provider or
    processing country not shown at consent time would be used, the remembered choice no longer applies and the consent
    screen is shown again (10.6).
  - Image mode sends **a crop of the product only**: the crop box is shown to the user first, and EXIF is stripped by
    re-encoding. The image is downscaled to at most 1,024 px on the long side.
- **Owner decision PC-D1 (approved 2026-11-09):** image mode sends an image, which is more than a derived fact. The owner
  approved this as an explicit exception to the "derived facts only" rule, **limited to Product Check image mode**. It is
  on the legal-review list (`docs/CTO-BRIEF.md` §8) and in `docs/PDPA-NOTES-FOR-COUNSEL.md` F1: a hand in frame, a
  prescription label with a patient name, cross-border transfer, the remembered consent.
- **Face gate (fails closed):**
  - The detector is MediaPipe BlazeFace (Apache-2.0, 0.23 MB) through the vendored `FaceDetector`.
  - It runs on the full frame and on the crop: short-range model, plus full-range or tiles for faces in the background.
  - Any face above a low threshold (about 0.3) blocks the upload and asks the user to re-crop.
  - If the detector does not load, the upload is blocked.
  - Its miss rate is measured on a fixed set before any claim is made (9.3).
- **Patient-name guard (image and text mode):**
  - If the OCR finds a pharmacy dispensing label pattern (patient name line, "ชื่อผู้ป่วย", HN, date of dispensing),
    that region is blacked out before upload and its text is dropped.
  - The user sees what was removed.
- **Stored by default: nothing.**
  - No image, no OCR text and no result is stored on the server.
  - The device keeps a local history only if the user turns it on, as the medicine page does today.
  - Gateway logs carry no content (10.5).

## 9. Measurement plan (fixed before building)

### 9.1 Test set

- **Size and source:** at least **300 real product photos**, taken by the owner or the team of products they hold.
  - No people: the face gate runs on every test photo too.
  - The photos are stored in `field-data/` (git-ignored), never in the repo.
- **Strata:**

| Stratum | Minimum |
|---|---|
| Thai products, by category: drug / supplement / cosmetic / food | 40 / 40 / 30 / 30 (= 140) |
| Foreign products: China, Japan, Korea, Malaysia / Singapore, USA, EU | 15 each (= 90) |
| Known illegal or warned products, **≥ 75** (bought products matching official warning lists, or exact-pack photos of listed products with the owner's own copy; products are not bought just to test if that is unlawful; counsel to confirm) | ≥ 75 |
| Known over-claim labels (registered products whose label or listing uses flagged wording) | ≥ 40 (may overlap) |
| Conditions per photo: angle, glare, curved bottle, small print, night / indoor light | recorded as tags |

- Strata minimums sum to **≥ 305** (140 + 90 + 75), not counting the over-claim stratum, which may overlap.
- **Ground truth per photo (written before any run):**
  - product type, brand, active ingredients (INN), strength, dosage form;
  - registration number and issuing country, manufacturer, lot, expiry;
  - claims printed on the pack;
  - registration status on the day it was looked up;
  - whether it is on an official warning list.
- **Labelling:** two people label each photo and a pharmacist adjudicates disagreements.

### 9.2 Metrics

| Metric | How | Target (proposed; owner sets before the first run) |
|---|---|---|
| **False "looks fine" on illegal products (key safety metric)** | illegal photos where the card shows **no** risk signal and **no** "could not check", divided by all illegal photos | 0 observed **and** Wilson 95 % upper bound ≤ 5 % (needs n ≥ 73 illegal photos; at n = 60 the best possible bound is 6.0 %). The plain rate is shown beside it (same rule as the Gate pilot) |
| Field accuracy | exact match per field (registration no., brand, INN, strength, form, lot, expiry), by country and by mode (on-device only / text-to-AI / image-to-AI) | reported with n and Wilson interval; no target until the first baseline |
| Registration-number read | exact after normalisation | ≥ 90 % on Thai packs (on-device + user correction counted separately) |
| Over-claim detection | precision and recall on photos (9.1) and on the text set (5.3) | recall ≥ 80 %, precision ≥ 80 % (held-out) |
| False flags on compliant products | flags per 100 compliant packs | ≤ 5 |
| Face gate | misses on a fixed set of 100 product photos with a face somewhere in frame | 0 observed, Wilson upper bound reported |
| Cost and latency | per check, per model (from real `usage`) | reported; budget check (11) |

- **Source label:** every number is labelled with its source: field (owner photos), public dataset, or synthetic.
- **Reviewer:** an independent reviewer agent re-runs the evaluation.

## 10. AI Gateway

### 10.1 Shape

```
browser feature ──► POST /v1/ai/<feature>  (Worker)
                      1. feature on? (global + per feature)            settings (D1)
                      2. Turnstile, Origin, consent, membership          existing
                      3. per-user + global rate limit, quota             hitAll / consumeUse (existing)
                      4. monthly budget: reserve estimated cost          usage_counters (micro-USD)
                      5. walk the ordered chain [{provider, model}]      adapters
                      6. validate JSON schema + feature validator        gateway (never trusted from adapter)
                      7. settle budget to actual cost; refund if not billed
                      8. one log line (no content)                       util.log
                 ◄── {ok, json, provider, model, region} or {fallback:true, reason}
```

- **Fortune today:** fortune becomes feature `fortune_reword` on the gateway. Its route, grounding check and client
  contract stay. Only the provider call moves behind the adapter interface.
- **Product Check:** adds `pc_fields` (structured fields), `pc_claims` (claim classifier) and `pc_translate`.

### 10.2 Admin control panel (`admin.html`, new "AI" section; TH / EN / ZH)

| Setting | Scope | Default (new install) |
|---|---|---|
| AI enabled | global | **off** |
| Feature enabled | per feature | off |
| Chain: ordered list of `{provider, model, effort}` | per feature | empty; filled from the eval results (10.7) |
| Per-attempt timeout | per feature | 20 s (vision), 30 s (text) |
| Monthly budget (USD) | per feature | 0, so nothing runs until the owner sets it |
| Per-user limit | per feature | e.g. 10 checks / day / user, 3 / minute |
| Global rate limit | per feature | e.g. 60 / minute |
| Max output tokens | per feature | 1,500 |
| Image mode allowed | `pc_fields` only | **on** (PC-D9): each user still gives their own consent (8.2); the admin can switch it off, and then every check runs text only |
| Provider allowlist | global | **every provider on, in every build** (PC-D2): Anthropic, Google (paid tier only), OpenAI, Alibaba (Qwen), DeepSeek, z.ai, Kimi, OpenRouter. The admin can switch any provider off; an off provider is skipped in every chain and never shown on the consent screen |

- **Allowlist and counsel (PC-D2):** all providers are on because LENSIQ is not charging yet and the build is for
  testing. The provider terms, including **DeepSeek's PRC storage and possible training on inputs**, stay on the
  legal-review list (`docs/CTO-BRIEF.md` §8) and must be cleared before charging starts. The Google adapter refuses a
  key that is not on the paid tier (the free tier may train on inputs).

- **When the budget or a limit is hit:** the gateway returns `{fallback:true, reason:"budget"}`. The page says, in all
  three languages, "AI checks are paused for this month; you are seeing the on-device result only".
- **Budget accounting:**
  - The cost is reserved before the call, from the price table and the request size, so concurrent calls cannot
    overshoot.
  - After the call it is settled to the real cost.
  - Each admin page change needs re-auth and writes to the audit log, as today.

### 10.3 Adapter interface (the only place with provider-specific code)

```js
/** Provider-neutral request built by the feature module */
// { feature, system, text, images?: [{mime, base64, width, height}], output: {name, schema},
//   maxOutputTokens, effort?: "low"|"medium"|"high", deadlineMs, requestId }
/** Success */
// { ok: true, json, provider, model /* served */, region, usage: {inputTokens, outputTokens, reasoningTokens?,
//   cachedInputTokens?, imageTokens?}, costUsdMicros, latencyMs, providerRequestId? }
/** Failure */
// { ok: false, kind, retryable, fallbackable, billed, retryAfterMs?, httpStatus?, providerRequestId? }
// kind ∈ timeout | rate_limited | overloaded | server_error | connection | refusal | truncated | invalid_json |
//        schema_mismatch | bad_request | auth | content_policy_input | unsupported
/** Adapter */
// { id, capabilities(model) -> {vision, jsonSchema: "native"|"json_mode"|"prompt_only"},
//   call(req, model, key, fetchImpl) -> Promise<Success|Failure>, price(model, usage) -> micro-USD }
```

- **Adapters:**
  - `anthropic`: the official SDK, as fortune uses today, including its server-side `fallbacks`;
  - `gemini`, `openai`, `dashscope` (Qwen, Singapore endpoint), `deepseek`, `zai`, `kimi`, `openrouter`: plain `fetch`
    with `AbortSignal.timeout`.
- **Provider-specific behaviour stays inside each adapter:**
  - JSON-constraint flags (`output_config.format` / `responseSchema` / `json_schema`);
  - image part shapes;
  - resolution control (resize to 28 px patches / `media_resolution` / `detail` / `max_pixels`);
  - refusal and truncation signals;
  - usage fields;
  - retention flags (OpenRouter `zdr:true`, `data_collection:"deny"` forced on every call).
- **No provider-specific logic elsewhere:** a lint rule fails the build if a provider name or endpoint appears outside
  `backend/src/ai/adapters/`.

**Fallback policy:**

| kind | retry same | next provider | billed |
|---|---|---|---|
| timeout, connection | no | yes | assume yes for the budget |
| rate_limited, overloaded | once if `retryAfterMs` fits | yes | no |
| server_error | once | yes | no |
| refusal | no | yes | yes |
| truncated | no | yes (or one retry with more tokens) | yes |
| invalid_json, schema_mismatch | once | yes | yes |
| bad_request, auth, unsupported | no | yes, and alert the admin (config error) | no |
| content_policy_input | no | **no** (the same image is not shopped around) | no |

### 10.4 Product Check output schema (`pc_fields`)

`{product_type: drug|supplement|cosmetic|food|device|other, brand, product_name, active_ingredients:[{name_on_pack,
inn?, strength?, unit?}], dosage_form?, registration:[{number, country?, kind?}], manufacturer?, lot?, expiry?,
claims_on_pack:[string], languages_on_pack:[string], unreadable:[field]}`.

- `additionalProperties: false`, every key required; unknown values are `null`.
- **Gateway validator:**
  - every registration number must also appear in the OCR text, or be marked "model-read, not in OCR";
  - every INN must resolve in RxNorm or ChEMBL, otherwise `inn` is dropped;
  - dates must parse;
  - a field the model invents with no support is shown as "model guess" in a different style.

### 10.5 Security and logging

- **Keys:** keys exist only as **Worker secrets**: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
  `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY`, `ZAI_API_KEY`, `KIMI_API_KEY`, `OPENROUTER_API_KEY`.
  - The owner sets them with `wrangler secret put`. Agents never see a key.
  - The admin page shows only "set / not set".
- **Existing D1 encrypted key path** (`settings.js setApiKey`, AES-GCM under `SECRETS_KEK`):
  - Kept, under the "never delete" rule, but marked legacy.
  - The gateway reads the Worker secret first.
  - Owner decision PC-D4 (approved 2026-11-09): the legacy path is off by default.
- **Calls:** every call goes through the Worker. The browser never talks to a provider, and the CSP `connect-src` stays
  `'self'` + the API origin.
- **Log line per attempt:**
  - feature, provider, model, served model, region, attempt number, error kind;
  - input / output / reasoning / image tokens, cost (micro-USD), latency;
  - our request id, the provider's request id.
  - **Never** images, text, prompts, IPs, user ids or emails: the `util.log` redaction already drops `body`, `facts`,
    `key`, `ip`, `email`.
  - A monthly aggregate per feature (calls, cost, p50 / p95 latency, error kinds) is kept in D1 for the admin page.

### 10.6 Consent screen

- **Shown when:** before the first AI step in a session, unless the user ticked "remember my choice" (8.2) for the same
  providers and processing countries. It is shown again whenever the chain would use a provider or country that was not
  on the screen the user accepted, and after the user withdraws.
- **Choices on the screen:** "text only" or "text + product photo (crop)", plus "remember my choice" (unticked by
  default) with a line saying how to withdraw it.
- **Owner rule (kept on approval, 2026-11-09):** because the site is public, the screen always names the provider that
  will actually be used and the country where the data is processed. No build may hide either.
- **Contents:**
  - the **provider and model that will actually be used** (the first in the chain, with "may fall back to <next>");
  - **where data is processed**, from the provider table (11), e.g. "Anthropic, USA (global routing)" or "Alibaba
    Cloud, Singapore";
  - what is sent (text only / product crop);
  - that nothing is stored by LENSIQ;
  - the provider's retention, in one line.
- **If a fallback provider is used,** the result card says so ("checked by <provider>, <location>").
- **Consent covers the chain shown.** A provider that is not on the screen is never used.
- **Languages:** TH / EN / ZH. All new Product Check strings go in `medicine.html` (TH) + `i18n/en-med.js` + `i18n/zh-med.js`; the admin AI strings go in the admin i18n files.

### 10.7 Evaluation tool

- **Command:** `tools/ai-eval.mjs` runs the fixed Product Check set (9.1) and the text set (5.3) against every configured
  `{provider, model}`. **It covers all providers** in 11, Chinese providers and OpenRouter included (PC-D2).
  - It uses the **same gateway code**, either through a local Worker or the Worker test harness.
  - Keys come from the environment. The tool refuses to run in CI and never commits keys or images.
- **Report** (per model):
  - per-field accuracy by country and mode;
  - over-claim precision / recall;
  - false "looks fine" on illegal products, with the Wilson bound;
  - JSON validity rate, refusal rate;
  - real tokens, real cost per check, p50 / p95 latency.
- **Output files:** written to `field-data/eval/` with a summary table for `docs/PRODUCT-CHECK-ACCURACY.md`.
- **Default model selection:** the default chain is chosen from these numbers by a written rule:
  1. Lowest false "looks fine" (safety first).
  2. Then field accuracy.
  3. Then cost.
  4. Ties broken by latency.
- **Re-runs:** after any model or price change; the admin page shows the date of the last eval for the active chain.

## 11. Providers and cost per check

- **Inclusion rule:** a model is listed only when the provider's own docs confirm image input.
- **Cost formula:** cost per check = (image tokens + 800 prompt tokens) × input price + 600 × output price, at list price.
  - Image tokens are for a 1000 × 1000 crop.
  - No caching or batch discount is applied.
- **Reasoning tokens are extra:**
  - All current Claude models think by default (Haiku 5.5 and Opus 5.5 at effort medium; thinking cannot be switched off on Opus 5.5; Sonnet 5.5 is adaptive). Gemini 3.x and the other reasoning models are similar.
  - The real cost per model comes from the eval (10.7), not this table.
- **Text-only mode (a user choice and the fallback, 8.2):** cost = (800 prompt + about 600 OCR-text tokens) × input + 600 × output. This is only about **15–25 % less** than image mode, because output tokens dominate (table below the main table).
- **THB conversion:** at 33 THB / USD (the PRICING-RESEARCH assumption).

| Provider | Model | Image in (verified) | JSON | In / out per 1M (USD) | Image tokens | Cost per check (USD) | ≈ THB | Retention / training (API) | Processing region | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Anthropic | claude-haiku-5-5 | yes | native json_schema | 0.10 / 0.50 | 1,296 | 0.00051 | 0.02 | deleted within 30 days; not used for training | global (default) or US (×1.1); no Asia option | Thailand supported |
| Anthropic | claude-sonnet-5-5 | yes | native | 2 / 10 | 1,296 | 0.0102 | 0.34 | same | same | |
| Anthropic | claude-opus-5-5 | yes | native | 4 / 20 | 1,296 | 0.0204 | 0.67 | same | same | already used by fortune |
| Google | gemini-3.5-flash-lite | yes | native | 0.30 / 2.50 | 1,120 | 0.0021 | 0.07 | paid tier: not used for training; logged "for a limited period" | Gemini API: any country (no residency) | **paid tier only** (free tier trains); users 18+ |
| Google | gemini-3.8-flash | yes | native | 0.75 / 3.75 → **1.50 / 7.50 from 2027-01-01** | 1,120 | 0.0037 → 0.0074 | 0.12 → 0.24 | same | same | price change dated |
| Google | gemini-4-argon | yes | not stated | 2 / 10 → **4 / 20 from 2026-12-01** | 1,120 | 0.0098 → 0.0197 | 0.32 → 0.65 | same | same | |
| OpenAI | gpt-6-luna | yes | native | 0.10 / 0.50 | ~1,229 (assumed) | ~0.00050 | 0.02 | up to 30 days abuse logs; not used for training | storage-only residency (JP / IN / SG / KR); processing +10 % | |
| OpenAI | gpt-6.1-terra | yes | native | 1 / 5 | ~1,229 | ~0.0050 | 0.17 | same | same | |
| OpenAI | gpt-6.1-sol | yes | native | 2 / 10 | ~1,229 | ~0.0101 | 0.33 | same | same | |
| Alibaba Model Studio | qwen3-vl-plus | yes | supported (Singapore) | 0.20 / 1.60 | 963 | 0.0013 | 0.04 | "never used for training"; retention period not stated | Singapore (International scope not defined) | counsel |
| Alibaba Model Studio | qwen3.7-plus | yes | supported in Singapore, not in US | 0.40 / 1.60 | 963 | 0.0017 | 0.06 | same | same | |
| DeepSeek | deepseek-flash | yes (`deepseek-v4-pro` has no vision) | JSON mode; with images not documented | 0.30 / 1.20 peak; 0.15 / 0.60 off-peak | ≤ 1,024 | 0.0013 / 0.0006 | 0.04 / 0.02 | privacy policy: stored in the PRC, may train; API terms silent; PRC law | China | **highest PDPA risk; on for testing (PC-D2); counsel before charging** |
| Zhipu z.ai | glm-4.6v | yes | prompt only (gateway validates) | 0.30 / 0.90 | not documented (~1,300 assumed) | ~0.0012 | 0.04 | DPA: does not store content | Singapore | price per check unverified |
| Moonshot | kimi-k3 | yes | json_schema strict | **not verified** (third party: 3 / 15) | not published | ~0.015 | 0.50 | enterprise ZDR option | not verified | |
| OpenRouter | many | per routed model | pass-through (`require_parameters`) | provider price, no markup; 5.5 % fee on credits | — | provider + 5.5 % | | `zdr:true` and `data_collection:"deny"` forced | depends on routed provider | adds a second processor |


**Text-only mode cost per check**, same prices, 1,400 input + 600 output tokens:

| Model | USD | ≈ THB |
|---|---|---|
| claude-haiku-5-5 / gpt-6-luna | 0.00044 | 0.015 |
| claude-sonnet-5-5 / gpt-6.1-sol | 0.0088 | 0.29 |
| claude-opus-5-5 | 0.0176 | 0.58 |
| gemini-3.5-flash-lite | 0.0019 | 0.06 |
| gemini-3.8-flash (now → 2027) | 0.0033 → 0.0066 | 0.11 → 0.22 |
| gemini-4-argon (now → Dec 2026) | 0.0088 → 0.0176 | 0.29 → 0.58 |
| gpt-6.1-terra | 0.0044 | 0.15 |
| qwen3-vl-plus / qwen3.7-plus | 0.0012 / 0.0015 | 0.04 / 0.05 |
| deepseek-flash (peak / off-peak) | 0.0011 / 0.0006 | 0.04 / 0.02 |
| glm-4.6v (token count unverified) | ~0.0010 | 0.03 |
| kimi-k3 (price unverified) | ~0.013 | 0.44 |

**Fields still to fill from the eval (C2):**

| Field | Status for every model above |
|---|---|
| Latency p50 / p95 | not published by any provider; **measured in P8** |
| Thai and other-language quality on product labels | **not measured; measured in P8** (per language stratum of 9.1) |
| Commercial terms / Thailand allowed | Anthropic, Google (Gemini API, paid tier, users 18+), OpenAI: Thailand on the supported list, commercial use allowed under their API terms. Alibaba, z.ai, Kimi: Thailand sign-up **not verified**. DeepSeek: PRC-law terms, counsel. OpenRouter: allowed, adds a processor |

**Excluded** (vision not verified from the provider's own docs):

- ByteDance BytePlus ModelArk (Seed): the docs did not render, and the model ids and prices were not verified.
- Baidu ERNIE: international access was not verified.

**Cloudflare's own "AI Gateway" product** (logging, caching, fallback) was not evaluated. It is an option to compare in
P5, but our own adapter layer is still needed for portability (Part A of the owner's brief).

**Monthly cost examples** (list price, before reasoning tokens):

| Checks per month | Haiku 5.5 / GPT-6-luna | Qwen3-VL-plus | Gemini 3.8 Flash (2027 price) | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|---|---|
| 1,000 | $0.5 | $1.3 | $7.4 | $10 | $20 |
| 10,000 | $5 | $13 | $74 | $102 | $204 |
| 100,000 | $51 | $130 | $740 | $1,020 | $2,040 |

**Thai quality:**

- ThaiOCRBench (arXiv 2511.04479, 2,808 samples) shows proprietary models ahead of open ones on Thai text, but none of
  the models above were in it.
- **On our task: not measured. The eval (10.7) measures it.**

## 12. Phases and effort

Effort sizes:
- S ≈ 1–2 days;
- M ≈ 3–5 days;
- L ≈ 6–10 days.

Every phase follows the working rules:
- a fixed test set first;
- real numbers per condition;
- an independent reviewer who re-measures;
- TH / EN / ZH;
- CI green before the next phase.

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| P0 | **Done 2026-11-09.** Owner decisions PC-D1–D10 recorded (15); request letters drafted: Thai FDA (`docs/legal/FDA-PERMISSION-REQUEST-TH.md`, reuse of the SOAP data) and WHO (`docs/legal/WHO-PERMISSION-REQUEST.md`, alerts), for the owner to send before charging; counsel notes (`docs/PDPA-NOTES-FOR-COUNSEL.md` F1); legal-review running list (`docs/CTO-BRIEF.md` §8) | S (docs) | owner |
| P1 | **Test sets first:** labelled text set (5.3, ≥ 400) and the photo set protocol + labelling sheet (9.1); read the 2569 food-advert notice and **update F01–F18 to it** (owner decision 2026-11-09); pharmacist reviews the rule list | M | owner photos, pharmacist |
| P2 | On-device: PP-OCRv5 det + CJK / KO / Latin rec, quality checks, auto crop, zxing-wasm fallback, GS1 parse, country number parsers; unit + e2e; numbers on the photo set (on-device only baseline) | L | P1 |
| P3 | Over-claim rules `lensiq-claims.js` + card UI (exact text + rule + basis); numbers on the held-out text set | M | P1 |
| P4 | Lookups: `med.js` extended to Thai FDA FOOD / CMT / HERB / MDC / ADVERTISE (the web service is used for testing now, owner decision 2026-11-09; a permission flag stays so it can be switched to link-out if the FDA says no), openFDA enforcement, Safety Gate, RASFF, HSA, Health Canada; curated Thai alert list; risk-signal card | L | FDA written permission before charging (letter drafted in P0) |
| P5 | AI Gateway core: adapter interface, Anthropic adapter (moved from fortune, same behaviour, fortune tests unchanged), settings, budget reservation, logs, admin panel, consent screen | L | — |
| P6 | Adapters: Gemini, OpenAI, Qwen, DeepSeek, z.ai, Kimi, OpenRouter, **all on in the allowlist** (PC-D2; admin can switch any off), with a mocked-provider test per adapter (no real keys in CI) | M | P5 |
| P7 | Product Check AI features: `pc_fields`, `pc_claims`, `pc_translate`, face gate, patient-name guard, image mode with one consent per user + remember-my-choice + withdraw, text-only fallback (PC-D9); validators | M | P2–P6 |
| P8 | Eval tool covering **all providers** + first full run on the owner's keys (owner runs it or sets the keys); choose the default chain from the numbers; `docs/PRODUCT-CHECK-ACCURACY.md` | M | P7, owner keys and budget |
| P9 | Travel mode (translation, INN, Thai equivalents behind permission) + reference-image library tooling (embeddings only, no images) | M | P4, P7, counsel for 6.3 |

**Total:** about **7–10 weeks of rounds**, excluding external waits (Thai FDA / WHO replies, counsel). Possible build orders:

- **Suggested:** P0 → P1 → P2 + P3 (parallel) → P5 → P4 + P6 → P7 → P8 → P9.
- **Alternative if the owner wants AI value early:** P5 + P6 can start right after P1.

**Owner decision 2026-11-09:** build all phases P0–P9 to completion, each with a fixed test set, an independent reviewer
and real numbers. Product Check + AI Gateway come first; org accounts P1–P3 follow after Product Check is complete.
Nothing waits for counsel to be **built**; counsel and the FDA / WHO replies are needed before **charging** starts
(running list in `docs/CTO-BRIEF.md` §8). The reference-image library (6.3) is the exception kept from PC-D7: tooling is
built in P9, but no third-party pack images are collected until counsel answers.

**Portability** (Part A, applies here too):

- All database access goes through one adapter with standard SQL.
- The Cloudflare-specific parts are:
  - D1;
  - Worker secrets;
  - Turnstile;
  - `caches.default`;
  - `CF-Connecting-IP`;
  - cron;
  - Workers Logs.
- They stay out of the business logic.

## 13. What the owner provides

1. **API keys** for the providers to evaluate. All providers are enabled (PC-D2) and the eval covers all of them, so a
   key per provider is needed for a full run: Anthropic, Google (**paid tier**), OpenAI, Alibaba Model Studio
   (Singapore), DeepSeek, z.ai, Kimi, OpenRouter. A provider without a key is skipped and reported as "not run". Keys are
   set with `wrangler secret put` in staging and never shared with agents.
2. **A monthly AI budget per feature**: USD 20 for the first eval month (PC-D8), then from the eval numbers.
3. **At least 300 product photos** (9.1):
   - taken by the owner or the team, with no people and no prescription labels;
   - placed in `~/LENSIQ-field/products/` (outside the repo).
   
   This includes at least 75 known illegal or warned products (n ≥ 73 is needed to reach the 5 % bound). Counsel advises how to obtain them lawfully. Photos of
   products already owned, or listed products shown in official warnings, may be enough.
4. **A pharmacist adviser** to review the rule list, the "how to verify" wording and the labelled sets (about 1–2 days).
5. **Letters** to Thai FDA asking for written commercial reuse terms for the SOAP web service, and to WHO for the
   alerts. **Drafted in P0 (done):** `docs/legal/FDA-PERMISSION-REQUEST-TH.md` (Thai official letter + English summary)
   and `docs/legal/WHO-PERMISSION-REQUEST.md` (English email). The owner fills the bracketed contact details, signs and
   sends them **before charging starts**; testing uses the web service now (owner decision 2026-11-09). If DGA turns out
   to be the data owner for the data.go.th listings, the same letter is copied to DGA.
6. **Counsel** for the questions in 15 and the running list in `docs/CTO-BRIEF.md` §8, before charging starts.

## 14. Risks

| # | Risk | Mitigation |
|---|---|---|
| PR1 | A user reads "no signals found" as "genuine" | no verdict; the card always lists the checks that could not run; key metric false "looks fine" ≤ 5 % upper bound; fixed bottom line |
| PR2 | Thai FDA data used commercially without permission | no paid (charging) build uses the lookups until a written reply; testing uses the web service now (owner decision 2026-11-09); link-out fallback |
| PR3 | A wrong over-claim flag harms a legitimate brand | wording "risk signal", exact text shown, rule cited, model-only flags marked "possible"; precision target ≥ 80 % held-out |
| PR4 | Images of people or patient names reach a provider | text-only always available; image mode only after per-user consent; face gate fails closed; patient-name blackout; crop shown before upload |
| PR5 | Cross-border transfer and provider retention | consent names provider and region; all providers on for testing (PC-D2), each listed for counsel before charging (CTO-BRIEF §8); Anthropic / OpenAI / Google paid tiers do not train on API data |
| PR6 | Cost overrun | reserved budget per feature; on-device fallback; reasoning-token cost measured in the eval |
| PR7 | Rule text out of date (2569 notice) | P1 re-check; rule list dated; review every 6 months |
| PR8 | Translation errors in warnings | warnings and directions shown untranslated with a note |
| PR9 | Reference images infringe pack copyright | embeddings only; counsel; manufacturer licences preferred |
| PR10 | Providers change prices or models | versioned price table with effective dates; eval re-run on change; admin shows the date of the last eval |
| PR11 | ODbL share-alike contaminates our database | Open Food Facts data in a separate cache, never merged |
| PR12 | On-device models too large or slow for low-end phones | lazy per-script loading; measure memory and latency on a real low-end phone in P2 |

## 15. Owner decisions and counsel questions

### Owner decisions

The owner approved the design on 2026-11-09: "we are not charging yet, so build everything fully now for testing; legal
review happens before we start charging". Every decision below is on the legal-review running list where it has a legal
side (`docs/CTO-BRIEF.md` §8).

| # | Decision | Default proposed in this design | Decided 2026-11-09 |
|---|---|---|---|
| PC-D1 | Allow image mode (a product crop leaves the device) as an explicit exception to "only derived facts are sent" | yes, opt-in per check, face gate, crop only, off by default | **Approved:** the exception applies to Product Check image mode only (8.2) |
| PC-D2 | Which providers may be used before counsel reviews them | Anthropic, Google (paid), OpenAI; Chinese providers and OpenRouter off | **All providers enabled now, in every build**, Chinese providers and OpenRouter included; the admin can switch any provider off; the consent screen names the provider actually used and where data is processed; the eval tool covers all providers (10.2, 10.6, 10.7). DeepSeek's PRC storage / training risk stays on the counsel list |
| PC-D3 | Key safety target: false "looks fine" on illegal products | 0 observed, Wilson upper bound ≤ 5 % (needs n ≥ 73; plan ≥ 75) | **Accepted as recommended** |
| PC-D4 | Legacy D1-encrypted key path in `settings.js` | kept, off by default, Worker secrets first | **Accepted as recommended** |
| PC-D5 | Product Check lives in `medicine.html` (new tab) or a new page `product-check.html` | new tab in medicine.html (category 5 Health, Safety & Quality) | **Accepted as recommended:** new tab in medicine.html |
| PC-D6 | Store results? | no by default; local history opt-in only | **Accepted as recommended** |
| PC-D7 | Reference-image library | design now, build only after counsel (6.3) | **Accepted as recommended:** tooling built in P9 (embeddings only); no third-party pack images collected before counsel |
| PC-D8 | Monthly budget and per-user limits for the first eval month | USD 20, 10 checks / user / day | **Accepted as recommended** |
| PC-D9 | Default cloud mode: text only (this design, stricter) or product crop (the brief) | text only; crop is a second opt-in per check | **Image mode allowed after one consent per user**, with "remember my choice" that the user can withdraw at any time; text only stays available as a choice and as the fallback; product crop only; upload blocked if a face is detected (8.2, 10.6) |
| PC-D10 | Share-alike data (ChEMBL CC BY-SA, Open Food Facts ODbL): acceptable under the no-copyleft spirit of CLAUDE.md? | yes, kept in a separate table, never shipped in `vendor/`, never merged into our own register | **Accepted as recommended** (share-alike terms stay on the counsel list) |

**Other owner decisions on 2026-11-09:**

- **Food rules:** update to the 2569 food-advert notification in P1 (5.1).
- **Thai FDA data:** use the web service for testing now; the Thai permission request letter is drafted
  (`docs/legal/FDA-PERMISSION-REQUEST-TH.md`) for the owner to send before charging.
- **Build scope:** all phases P0–P9 to completion, each with a fixed test set, an independent reviewer and real numbers.
- **Order:** Product Check + AI Gateway first; org accounts P1–P3 after Product Check is complete.
- **Running list:** everything that must go to legal review before charging is kept in `docs/CTO-BRIEF.md` §8
  (providers, cross-border processing, FDA data, consent texts).

### Counsel questions (added to `docs/PDPA-NOTES-FOR-COUNSEL.md` F1 in P0, done)

1. Do the food, cosmetic and supplement advertising rules apply to packs and online listings, so that we may label
   wording as a "risk signal under <rule>"? What wording keeps LENSIQ out of defamation risk for brands?
2. Commercial reuse of the Thai FDA SOAP data (no licence stated), and dropping natural-person licensee names.
3. A curated, fact-only list built from Thai FDA press releases: allowed?
4. Product crop images sent to a provider abroad (US, Singapore): mechanism under PDPA s.28–29; hand in frame;
   prescription labels.
5. DeepSeek / Chinese providers: acceptable at all, and on what terms?
6. Embeddings from LENSIQ's own photos of packs (copyright s.32–33).
7. Obtaining photos of illegal products for the test set lawfully.
8. Does Product Check make LENSIQ a medical-device software provider under Thai law or the EU MDR? Today
   medicine.html is positioned as a reference / label reader (`docs/MEDICINE.md` "Regulatory positioning").

Added on approval (2026-11-09), because every provider is enabled and image consent can be remembered:

9. Every enabled provider's terms (Anthropic, Google paid tier, OpenAI, Alibaba, DeepSeek, z.ai, Kimi, OpenRouter as a
   second processor): acceptable for a commercial Thai service, and which need a DPA or extra clauses?
10. Cross-border processing of product crops and OCR text in the US, Singapore and China: which s.28–29 mechanism
    applies to each, and is consent naming the provider and country enough?
11. One consent per user with "remember my choice" and withdraw at any time: valid under PDPA s.19 (freely given,
    specific, as easy to withdraw as to give)? Review the TH / EN / ZH consent texts.

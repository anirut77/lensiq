# Virtual Try-On for clothing shops: design (build order: second, after Product Check and Nutrition Lens)

> **Status: DESIGN ONLY, waiting for owner approval.** This document adds no code, no migration and no deploy, and
> nothing in it has been committed. It builds on the existing try-on relay (`tryon.py`, `/api/tryon`, the
> `photobooth.js` AI panel) and the on-device studio (`studio.html`, `studio-core.js`, `photobooth-outfits.js`), and
> removes none of them.
> This document is not legal advice. Every legal point is a **risk signal** for counsel to confirm.
> Written 2026-11-10. Sources: the current code, `docs/TRYON-LICENSING.md`, `docs/PRODUCT-CHECK-DESIGN.md`,
> `docs/AI-GATEWAY.md`, `docs/ORG-ACCOUNTS-DESIGN.md`, `docs/product-check/FACE-BLUR-RESULTS.md`, `ACCURACY.md` §11,
> `docs/PRICING-RESEARCH.md`, `docs/BILLING-PLAN.md`, and web research done on 2026-11-10.
> Source labels: **[PRIMARY]** = official vendor, model card or licence text read; **[SECONDARY]** = aggregator, reseller,
> blog or third-party list; **[UNVERIFIED]** = not confirmed. THB figures use 33 THB / USD (the PRICING-RESEARCH
> assumption).

> **Owner approval (2026-11-10):** design approved. **TO-D3 approved:** cloud mode may send the person's photo, only after
> consent, and only to providers whose terms say they do not keep or train on the image; each provider's retention terms
> are recorded before it is enabled. **TO-D7 approved:** store only cut-out garment images, never model or customer
> photos. Try-On MVP = back-office catalogue upload (tops, trousers, hats, accessories) + one commercial cloud provider
> (e.g. FASHN) + on-device overlay preview + merchant credit model (cost per image vs price per try-on).
>
> **Shared back-office (cross-doc note, 2026-11-10).** All four new designs (Nutrition, Try-On, Merit, Style) use ONE
> admin area, `backoffice.html`, built once in Nutrition **N3** (first in build order): roles owner / admin / editor,
> per-person audit log, image upload with size limits + automatic face blur (Product Check `faceBlur`) + person check,
> TH / EN / ZH, phone layout. Try-On T2, Merit M1 and Style S5 then only add their own sections, so their effort drops
> (T2 L→M, M1 M→S, S5 L→M). **BO-1 decided (owner, 2026-11-10):** do not wait for org accounts. Phase 1 back-office uses the existing
> platform admin login (owner with mandatory TOTP, plus admin and editor roles); merchant self-service login moves to
> org accounts later.

## สรุปสำหรับเจ้าของ (Thai summary)

- **สิ่งที่จะสร้าง:**
  - ร้านเสื้อผ้าอัปโหลดสินค้าเข้าแคตตาล็อก แล้วลูกค้าเปิดกล้อง "ลองใส่" สินค้านั้นบนตัวเองได้
  - ลองได้ 2 แบบ
    1. **ซ้อนภาพสดบนเครื่อง:** ฟรี ไม่ส่งภาพออกนอกเครื่อง และเร็ว แต่ได้เป็นแค่ภาพพรีวิว
    2. **ภาพ AI บนคลาวด์:** สมจริงกว่า แต่ต้องกดยินยอม เสียเครดิต และรอราว 5–20 วินาที
  - ลูกค้าเปรียบเทียบทั้งสองแบบได้ในหน้าเดียว
- **หลังบ้านร้านค้า:**
  - หน้าแอดมินเดียวสำหรับทุกระบบหลังบ้าน แบ่งสิทธิ์เป็น owner / admin / editor
  - มีบันทึกการแก้ไข (audit log) จำกัดขนาดภาพที่อัปโหลด และเบลอใบหน้าอัตโนมัติ
  - ใช้ได้ 3 ภาษาและบนมือถือ
  - ตัดพื้นหลังสินค้าอัตโนมัติ และมีเครื่องมือแก้ด้วยมือ
  - กรอกชื่อ ราคา ไซซ์ สี และลิงก์สินค้าได้ ตั้งเผยแพร่หรือซ่อนได้ และอัปโหลดทีละมากด้วย CSV + รูป
- **แชร์:** ลิงก์ ฝังในเว็บร้าน (iframe) และส่งใน LINE หรือโซเชียลได้ สิ่งที่แชร์คือ "สินค้า" ไม่ใช่รูปลูกค้า
- **โมเดลโอเพนซอร์สยอดนิยมใช้ขายไม่ได้:**
  - IDM-VTON, OOTDiffusion, CatVTON, StableVITON, FitDiT ใช้สัญญา CC BY-NC-SA ซึ่งห้ามใช้เชิงพาณิชย์
  - Leffa โค้ดเป็น MIT แต่ฝึกด้วยข้อมูล VITON-HD (CC BY-NC) และ DressCode (ไม่ให้บริษัทเอกชน) จึงตัดออก
  - FASHN VTON v1.5 (Apache-2.0) ต้องใช้ตัวแยกส่วนร่างกายที่ติดสัญญาของ NVIDIA SegFormer (ห้ามใช้เชิงพาณิชย์)
    และไม่เปิดเผยข้อมูลฝึก จึงยังใช้ไม่ได้
- **ที่แนะนำ (ใช้เชิงพาณิชย์ได้):**
  - บนเครื่อง: MediaPipe Face / Pose / Hand Landmarker, Selfie Multiclass และ Interactive Segmenter (Apache-2.0 ทั้งหมด)
  - คลาวด์ผ่าน AI Gateway เดิม:
    - FASHN API (~2.5 บาทต่อภาพ)
    - Google Vertex Virtual Try-On (~2 บาท แหล่งรอง)
    - Gemini image (1.1 บาท แต่เป็นโมเดลแก้ภาพทั่วไป ต้องวัดคุณภาพก่อน)
    - Kling (~2.3 บาท แหล่งรอง)
    - Perfect Corp (~3.2–3.6 บาท)
  - เลือกค่าเริ่มต้นจาก**ผลวัดจริง**เท่านั้น
- **ความปลอดภัย:**
  - ใช้ได้เฉพาะกล้องสด ไม่มีปุ่มอัปโหลดรูป ไม่มีหมวดชุดชั้นในหรือชุดว่ายน้ำ
  - ไม่เก็บรูปลูกค้า มีหน้าขอความยินยอม โหมดคลาวด์สำหรับอายุ 18+ เท่านั้น และติดป้าย "ภาพจำลอง" ทุกภาพ
  - **ข้อจำกัด:** กล้องเสมือน (เช่น OBS) หรือการถือรูปคนอื่นไว้หน้ากล้องยังหลอกได้ ระบบลดความเสี่ยงได้ แต่พิสูจน์ไม่ได้
- **ราคา (ร่าง ไม่รวม VAT 7%):**
  - ทดลองฟรี 30 วัน
  - Starter 490 / Shop 1,490 / Pro 3,900 บาทต่อเดือน รวมเครดิตคลาวด์ 60 / 300 / 800 ภาพ
  - เติมเครดิต 100 ภาพ 390 บาท
  - ซ้อนภาพบนเครื่องไม่จำกัด
- **ระยะเวลา:** 10 ช่วง (T0–T9) ประมาณ 8–11 สัปดาห์ ไม่รวมเวลารอทนาย
  - หลังบ้านต้องรอบัญชีองค์กร (org accounts P1–P2) หรือให้เจ้าของเลือกทางชั่วคราว (TO-D2)
- **ที่เจ้าของต้องเตรียม:**
  - ร้านพาร์ตเนอร์ที่ให้ใช้รูปสินค้าอย่างน้อย 220 ชิ้น
  - อาสาสมัครผู้ใหญ่อย่างน้อย 24 คน พร้อมหนังสือยินยอม
  - ผู้ให้คะแนนแบบปิดตาอย่างน้อย 3 คน
  - บัญชีและคีย์ของผู้ให้บริการ
  - งบทดสอบประมาณ 120 USD
  - เปิด R2 ใน Cloudflare
  - คำตอบเรื่องการตัดสินใจ TO-D1–D12

## 0. Fixed coverage list (written before the design)

| # | Requirement (owner brief) | Section |
|---|---|---|
| T-A | Merchant back-office: upload / manage by category, auto background removal + manual fix, name / price / sizes / colours / link, publish / hide, CSV + images bulk upload, per-category notes | 2 |
| T-B | Customer: pick an item and see it on yourself; on-device vs cloud compare (quality, latency, cost per image); outfit mixing | 1.1, 3.4, 3.5 |
| T-C | Share link / embed for shops, LINE, social | 1.3 |
| T-D | Models and APIs: commercial only in the recommendation; rejected ones with the reason | 3 |
| T-E | Safeguards: live camera only, no underwear / swimwear, no stored customer photos, consent screen | 5 |
| T-F | Pricing: monthly + credits, B2B excl. 7 % VAT | 6 |
| T-G | Shared back-office: one admin area, roles owner / admin / editor, audit log, upload size limits, auto face blur, TH / EN / ZH, phone screens | 2.1 |
| T-H | Measurement plan with fixed test sets: blinded fit realism, latency, cost per image, per-category feasibility | 4 |
| T-I | Effort per phase, risks, owner inputs, legal rows + credits | 7, 8, 9, 10 |

## 0.1 What exists today (built on, nothing removed)

| Piece | Today | Reused for |
|---|---|---|
| `tryon.py` + `server.py` `/api/tryon`, `/api/tryon/status` | Replicate relay for the LAN Flask server. Off by default. To enable it, the operator sets a token and a model **and** attests the licence (`commercial` or `noncommercial-demo`). Known non-commercial families are refused as `commercial`. Server-side consent (`consent=yes`), 4 / min per IP, 20 MB cap, magic-byte check, https-only result URL | Kept as is for LAN / on-prem installs. Its NC name filter (`NONCOMMERCIAL_PATTERNS`) gains the families rejected in 3.3. The hosted site uses the Worker AI Gateway instead (3.4) |
| `photobooth.js` AI panel | Calls `/api/tryon` with a consent checkbox, shows reason codes, labels the output a synthetic preview | Pattern for the consent and labelling UI |
| `studio.html` / `studio-core.js` | On-device outfit change on a still portrait: MODNet matte (Apache-2.0, VERIFY F7), MediaPipe Selfie Multiclass parser (Apache-2.0), garment warp (`garmentShoulders`, `garmentClip`, `harmonizeGarment`, `contactShadow`), occlusion by hair and accessories | Still-frame "HQ preview" for tops and outerwear in the on-device mode (3.1) |
| `ACCURACY.md` §11 | On-device outfit renders: **72.9 % had a visible defect** (102 / 140 renders, 35 people). Source: public-domain portraits; one non-independent AI rater; no human raters | Honest baseline: the on-device overlay is a **preview**, and the page says so |
| `vendor/models/` | `hand_landmarker.task`, `selfie-multiclass-256-f16.onnx`, `selfie_segmenter.tflite`, `face-gate/blaze_face_short_range.tflite`, `modnet.onnx`; MediaPipe Tasks Vision bundle | Hand anchor, occlusion, face blur, matte |
| AI Gateway (`backend/src/ai/*`) | Feature registry, chain + fallback, budget reservation, consent screen data, adapters for Anthropic, Gemini, OpenAI, DashScope, DeepSeek, z.ai, Kimi, OpenRouter (JSON output only) | A new feature `tryon_image` with **image output** and new try-on adapters (3.4) |
| Face blur (`lensiq-pc*.js` `prepareUpload`) | BlazeFace 3 × 3 tiles, threshold 0.5, pad 0.15. Held-out set: **27.6 %** of real faces left unblurred; fresh set: **34.7 %**. Source: public datasets | Blurring faces on catalogue photos before upload (2.4) |
| `admin.html` / `admin.js` | Single LENSIQ-owner admin: password + optional TOTP, 5-min re-auth window, `audit_log` | Unchanged. The merchant back-office is a separate, org-scoped area (2.1, TO-D1) |
| `docs/ORG-ACCOUNTS-DESIGN.md` | Org / admin / staff roles, `org_audit` hash chain, Google re-auth (design, P1–P3 after Product Check) | Merchant accounts and roles. Adds an `editor` role (2.1, TO-D2) |

## 1. User flows

### 1.1 Customer

```
open link / embed / LINE ──► shop page (tryon.html?shop=<slug>[&item=<id>])  catalogue: published items only
  ──► pick item ──► consent screen #1 (camera, on-device, nothing leaves)  ──► live camera (getUserMedia only)
  ──► ON-DEVICE OVERLAY (real time, free)          label: "ภาพจำลอง / virtual preview"
        ├─ add more items (outfit mixing, 3.5)
        ├─ "HQ still" (studio-core on one frame, on device)
        └─ "AI try-on" (cloud) ──► age 18+ self-declaration ──► consent screen #2 (provider, model, country,
              retention, what is sent, credits used, face-protect option)
              ──► liveness prompt (e.g. "raise your right hand", checked by Pose Landmarker) ──► capture 1 frame
              ──► [face-protect: blur face on device] ──► gateway ──► provider ──► result image (memory only)
              ──► side-by-side compare: overlay | AI, with latency and "1 credit" shown
  ──► save to my device (download) / Web Share (user's own action) / "buy" link to the shop's product page
```

- Nothing is stored on the server: no frame, no result, no thumbnail. The result exists only in page memory until the
  user downloads it or closes the page.
- The overlay needs no account. The AI step is paid from the **shop's** credits. The customer has no account and pays
  nothing. Per-device and per-shop limits apply (5.5).

### 1.2 Merchant

```
sign in (Google, org member) ──► back-office (backoffice.html, TO-D1) ──► Try-On catalogue
  ──► add item: photo(s) (flat-lay, or on a hanger / mannequin / model) ──► size + type check ──► face blur (on device)
  ──► auto cut-out (on device) ──► manual fix (brush / click) ──► category + fields ──► per-category feasibility note
  ──► preview on a built-in mannequin and on "me" (live camera) ──► publish / hide
  ──► bulk: CSV + images (zip or folder) ──► validation report ──► fix list ──► publish selected
  ──► share: copy link · embed code · LINE message · QR poster
  ──► usage: overlay sessions (count only), AI images used / credits left, top-up
```

### 1.3 Share link, embed, LINE and social

| Channel | Mechanism | Notes |
|---|---|---|
| Link | `https://<site>/tryon.html?shop=<slug>&item=<id>` with OG title, image and price from the published item (the garment cut-out, never a person) | No customer data in the URL |
| Embed | `<iframe src="…/tryon.html?shop=<slug>&embed=1" allow="camera" …>`. CSP `frame-ancestors` is built from the shop's allowlist (≤ 10 origins by plan) | A cross-origin camera needs `allow="camera"`; this is tested on Chrome, Safari and Samsung Internet |
| LINE | Plain link in LINE chat / OA rich menu (works today). Optional LIFF app later (needs a LINE channel from the owner) | The LINE in-app browser on iOS / Android: camera support must be **measured** (4.4). Fallback: "Open in browser" button |
| Facebook / Instagram / TikTok | Link + OG card | In-app browsers often block the camera. Detected by user agent, with an "open in browser" prompt |
| QR poster | Printable A4 / A5 with the item and QR (reuses `qrcode-generator`) | For in-store mirrors and booths |

The customer's photo is **never** part of a share. Sharing a try-on result is the customer's own Web Share or download
action, from their device.

## 2. Merchant / admin back-office

### 2.1 Shared back-office shell (applies to every merchant back-office, not only Try-On)

- **One area:** `backoffice.html` (proposed, TO-D1). It is org-scoped, signed in with Google (member sessions,
  `docs/ORG-ACCOUNTS-DESIGN.md`), and has one tab per module: Try-On catalogue now, and Nutrition Lens / others later.
  If the Nutrition Lens design defines this shell first, Try-On reuses it unchanged.
- `admin.html` stays the LENSIQ-owner platform admin: password, TOTP, AI Gateway, billing. Merchants never see it.

| Role | Maps to org accounts | Catalogue | Publish / hide | Share / embed allowlist | Members, roles | Credits, billing, export, delete shop |
|---|---|---|---|---|---|---|
| owner | org admin with `is_owner = 1` | ✓ | ✓ | ✓ | ✓ (transfer ownership: owner only) | ✓ (fresh re-auth) |
| admin | org admin | ✓ | ✓ | ✓ | ✓ (not the owner) | view; export with fresh re-auth |
| editor | **new role** `editor` (org accounts has `admin` and `staff`) | ✓ (create / edit / cut-out) | ✗ (submit for review) | ✗ | ✗ | ✗ |

- **Audit:** every create, edit, publish, hide, delete, bulk import, role change, allowlist change and credit top-up
  writes one `org_audit` row: actor, action, item id, field names changed, no images. The hash chain follows the org
  accounts design. The back-office shows an Audit tab to owner and admin.
- **Re-auth:** a fresh Google re-auth (`member_sessions.reauth_at`) is needed for role changes, the embed allowlist,
  export, deleting the shop and buying credits.
- **Image upload limits** (enforced on the client and again on the Worker):
  - ≤ 10 MB per file before resize;
  - JPEG / PNG / WebP only, magic bytes checked;
  - resized on device to ≤ 2,048 px on the long side and re-encoded, which strips EXIF and GPS;
  - ≤ 8 images per item;
  - per-shop storage quota by plan (6).
- **Face blur:** see 2.4. It is applied before any image leaves the device.
- **Languages:** all strings in TH (default) + `i18n/en-backoffice.js` + `i18n/zh-backoffice.js`.
- **Phone screens:** layout from 360 px width: one-column item list, sticky action bar, camera capture of product
  photos directly from the phone, and a touch brush for the manual fix.

### 2.2 Catalogue item

| Field | Rule |
|---|---|
| `category` | Enum (2.3). **No underwear, lingerie, swimwear, bodysuits or sleepwear**: these values do not exist, and the Worker refuses unknown values |
| `name` (TH, optional EN / ZH) | 1–120 chars |
| `price` (THB) + optional sale price | Shown as the shop enters it; the shop states whether VAT is included |
| `sizes[]`, `colours[]` (name + hex + one cut-out per colour, optional) | Colour variants reuse one cut-out with on-device recolour if no own photo |
| `product_url` | https only; the shop's domain is checked against its allowlist (warning, not a block) |
| `notes` | Free text for the shop |
| `status` | `draft` → (`in_review` for editor) → `published` / `hidden` |
| assets | Garment cut-out PNG (RGBA), optional flat-lay original (no person), anchor points (2.5) |

- **Bulk upload:** CSV columns `sku, category, name_th, name_en, name_zh, price, sale_price, sizes, colours,
  product_url, image_files, status`, with UTF-8 and a Thai-safe template.
- Images come as a zip or a folder pick, matched by file name.
- Each row goes through the same checks (category enum, upload limits, face blur, auto cut-out). A validation report
  lists every row with errors; nothing is published until the merchant confirms.
- Limit: 500 rows per import.

**Storage.** Item data goes in D1 (new tables `tryon_items`, `tryon_assets`, `tryon_shops` linked to `orgs`). Images go
in **Cloudflare R2** (not bound today: an owner dependency). Only garment cut-outs and person-free flat-lays are stored.

- **Standing rule "no images of people are stored":** photos of a model wearing the item are used only to make the
  cut-out, and are then discarded on the device.
- Storing on-model display photos would need an owner decision (TO-D7).

### 2.3 Categories and per-category notes (shown to the merchant when choosing a category)

Expected feasibility before measuring (it is replaced by measured green / amber / red in T8):

| Category | On-device overlay | Cloud AI | Note shown to the merchant |
|---|---|---|---|
| Tops (shirts, T-shirts, blouses) | amber: 2D warp on shoulders / hips; colour, print and length read well; drape and fit do not | green (all try-on APIs support tops) | Flat-lay or hanger photo, front, plain background, sleeves spread |
| Outerwear (jackets, coats) | amber | green | Photo it open and closed if both styles matter |
| Dresses / one-pieces | amber (long hems swing) | green (FASHN `one-pieces`) | Full length in frame |
| Trousers | red–amber: needs full body 2–3 m from the camera | amber–green (`bottoms`) | Front flat-lay, legs straight |
| Skirts | amber | amber–green | As trousers |
| Hats | green (Face Landmarker head pose) | not needed | Side + front photo improves the overlay |
| Glasses / sunglasses | green (478 face points) | not needed | Front photo of the frames only, arms folded out |
| Earrings | amber (ear position estimated from face points) | not needed | One earring, front |
| Necklaces | amber (neck from pose + face) | amber | Laid flat in a U shape |
| Rings, bracelets, watches | amber (Hand Landmarker) | red (APIs do not target hands) | Shot from above |
| Bags | amber (hand or shoulder anchor; size is approximate) | amber (Vertex / Perfect Corp, to be measured) | Front, strap extended |
| Shoes | red: foot pose is weak in Pose Landmarker | amber (Vertex lists footwear [SECONDARY], to be measured) | Side view, pair |
| Scarves, belts, other accessories | amber–red | amber | "Preview only" label |
| **Not allowed** | underwear, lingerie, swimwear, bodysuits, sleepwear, costumes that expose the body | — | The category does not exist |

### 2.4 Face blur on catalogue photos

- **When:** every uploaded photo goes through the Product Check face-blur step on the device, before the cut-out and
  before upload. The setting is 3 × 3 tiles, threshold 0.5, pad 0.15.
- **Measured limits:** this setting leaves **27.6 – 34.7 %** of real faces unblurred, mostly small ones. Source: public
  datasets, `FACE-BLUR-RESULTS.md` §5–6.
- **Editor check:** the editor sees the blurred preview and must tick "no visible face remains" before saving.
- **What is stored:** the stored asset is the garment cut-out. Person pixels are dropped by the cut-out mask, so a missed
  face only matters if the merchant stores an on-model original (off by default, TO-D7).

### 2.5 Garment cut-out with manual fix (on device by default)

| Step | Method | Licence |
|---|---|---|
| 1. Flat-lay / plain background | Colour-distance seed from the border + graph-cut refinement (own JS; or OpenCV.js `grabCut` if the size is acceptable) | own code / OpenCV ≥ 4.5 Apache-2.0 |
| 2. Item on a person or mannequin | MediaPipe Selfie Multiclass "clothes" class (vendored), then step 1 refinement | Apache-2.0 |
| 3. Manual fix | MediaPipe **Interactive Segmenter (MagicTouch)**: tap or brush on the item, then add / erase brush, feather slider, undo | Apache-2.0 (model card, 2023-03-13) [PRIMARY] |
| 4. Anchors | Auto shoulder / neckline / hem / temple / ear-hook points from the mask shape; the editor can drag them | own code |
| 5. Optional cloud cut-out | Photoroom Remove Background API (~USD 0.02 per image) [SECONDARY], via the gateway as feature `tryon_cutout`; off by default | commercial API terms (L-T16) |

The step-1/2 cut-out is measured against hand-drawn masks (4.2), and the editor's fix time is recorded.

## 3. Models and APIs with licences

### 3.1 On-device (recommended; all commercially usable)

| Component | Use | Licence | Status |
|---|---|---|---|
| MediaPipe Tasks Vision (runtime, vendored) | runs the models below | Apache-2.0 | OK-ATTR (THIRD_PARTY) |
| Face Landmarker (Face Mesh V2, 478 points + blendshapes; **blendshapes not used**, no emotion) | glasses, hats, earrings, necklace anchor, head pose | Apache-2.0 (Face Mesh V2 model card) [SECONDARY via card listing] | OK-ATTR, to vendor |
| Pose Landmarker lite / full (BlazePose GHUM 3D) | shoulders, hips, knees, ankles for garments; liveness prompt | Card states "LICENSED UNDER Apache License, Version 2.0"; out of scope: surveillance, identity recognition, multiple people [PRIMARY, card read 2026-11-10] | OK-ATTR, to vendor (lite ~5.5 MB, full ~9 MB) |
| Hand Landmarker (vendored) | rings, bracelets, watches, bag handle | Apache-2.0 | OK-ATTR |
| Selfie Multiclass 256 (vendored) | occlusion: hair, arms and face in front of the garment; clothes class for the cut-out | Apache-2.0 | OK |
| Interactive Segmenter MagicTouch | manual fix in the back-office | Apache-2.0; card: "human segmentation that is not consented to … is out of scope" [PRIMARY] | OK-ATTR, back-office only |
| BlazeFace short range (vendored) | face blur | Apache-2.0 | OK-ATTR |
| MODNet (vendored) | matte for the HQ still | Apache-2.0 (current release); VERIFY F7 | as today |
| studio-core warp (own) | garment warp, shadow, harmonise | ours | reuse |

The overlay renders on WebGL (2D canvas fallback), with a target of ≥ 15 fps on a low-end phone (4.4). Garments are 2D
cut-outs warped by a piecewise-affine / thin-plate mesh between anchors. Earrings and glasses get simple depth ordering
from face points.

### 3.2 Cloud try-on providers (commercially usable; to be measured; consent names provider and country)

Every provider goes behind the AI Gateway as a new adapter. Keys are Worker secrets, and the browser never calls a
provider.

| Provider / model | Categories (stated) | Price per image | ≈ THB | Latency (stated) | Retention / training | Processing region | Source |
|---|---|---|---|---|---|---|---|
| **FASHN API** `tryon-v1.6` | tops, bottoms, one-pieces, auto | 1 credit per output; on-demand USD 0.075 / credit (min. 100) | 2.5 | 5 s / 8 s / 12–17 s (performance / balanced / quality) | Inputs not stored; CDN outputs deleted after 72 h; `return_base64` → outputs not stored; no training on customer data; DPA for business customers | **not stated** | [PRIMARY] fashn.ai pricing + API docs, 2026-11-10 |
| FASHN garment moderation | — | — | — | — | `moderation_level: "conservative"` blocks underwear, swimwear and revealing outfits → **we force `conservative`** | — | [PRIMARY] |
| **Google Vertex AI** `virtual-try-on-001` | "clothing product"; footwear and bottoms per third parties | ~USD 0.06 | ~2.0 | not stated | Google Cloud terms; no training on customer data (Cloud) [UNVERIFIED for this model] | Vertex region / global (not listed on the page) | [PRIMARY] docs (inputs ≤ 10 MB, 1–4 outputs); price [SECONDARY] |
| **Gemini image** `gemini-3.1-flash-lite-image` (general image edit, not a try-on model) | any, by prompt | USD 0.0336 per 1K image (batch 0.0168) | 1.1 | to measure | Paid tier: not used to improve products; users 18+ (L2) | US / global | [PRIMARY] AI Studio pricing, 2026-11-10 |
| Gemini image `gemini-3.1-flash-image` / `gemini-3-pro-image` | any | USD 0.067 (1K) / 0.134 (1K–2K) | 2.2 / 4.4 | to measure | as above | as above | [PRIMARY] |
| **Kling Kolors virtual try-on** v1.5 | tops (example only) | ~USD 0.07 (fal.ai); packages on kling.ai/dev | ~2.3 | not stated | not found | `api-singapore.klingai.com` [UNVERIFIED] | [SECONDARY] |
| **Perfect Corp YouCam API** AI Clothes | clothes; other units exist for accessories / makeup | 2 units per result; USD 0.048 / unit monthly, 0.055 PAYG → USD 0.096–0.11 | 3.2–3.6 | not stated | not stated | not stated | [SECONDARY] vendor blog 2026-08-07 |
| **Alibaba Model Studio** `aitryon` / `aitryon-plus` | tops, bottoms (docs) | CNY 0.20 / 0.50 per image (+ parsing CNY 0.004, refiner 0.30) | ~0.9 / ~2.3 | Plus is slower | not stated | Docs point to **China (Beijing)**; international availability [UNVERIFIED] | [SECONDARY] |
| OpenAI image models | any, by prompt | not researched in this round | — | — | API terms as L3 | US | add in T5 only if the owner wants it |

**No default is chosen here.** As in Product Check §10.7, the default chain is picked by a written rule from the T8
numbers:

1. Lowest artefact rate.
2. Then blinded fit realism.
3. Then cost per image.
4. Then p95 latency.

Until the eval has run, cloud try-on stays **off**.

### 3.3 Rejected or conditional (with reason)

| Option | Code | Weights | Training data | Verdict |
|---|---|---|---|---|
| IDM-VTON | CC BY-NC-SA 4.0 | CC BY-NC-SA 4.0 ("codes and checkpoints") | VITON-HD / DressCode | **Rejected:** non-commercial [PRIMARY] |
| OOTDiffusion | CC BY-NC-SA 4.0 (LICENSE file) | not separately stated | VITON-HD, Dress Code | **Rejected** [PRIMARY] |
| CatVTON | CC BY-NC-SA 4.0 ("code, checkpoints, and demo") | same | VITON-HD / DressCode | **Rejected** [PRIMARY] |
| StableVITON | CC BY-NC-SA 4.0 | not stated | VITON-HD | **Rejected** [PRIMARY] |
| FitDiT | CC BY-NC-SA 4.0; "can only be used for non-commercial use" (commercial via Tencent Cloud) | same | CVDD (no licence stated) | **Rejected** [PRIMARY] |
| Leffa | MIT | MIT (HF tag) | **VITON-HD (CC BY-NC 4.0, "research purposes only")**, DressCode (not released to private companies), DeepFashion | **Rejected:** same rule as YuNet in FACE-BLUR §4 (permissive weights trained on non-commercial data) [PRIMARY] |
| LaDI-VTON, HR-VITON, GP-VTON, DCI-VTON, MV-VTON, MagicTryOn, Voost, CatV2TON, PF-AFN | NC or no licence file | — | VITON-HD / DressCode | **Rejected** [SECONDARY list, cross-checked with `tryon.py`] |
| catvton-flux, OmniTry | MIT / Apache-2.0 | catvton-flux CC BY-NC 2.0 | need **FLUX.1-Fill-dev** (FLUX non-commercial licence) | **Rejected** [SECONDARY] |
| FLUX.1 Kontext [dev], FLUX.2 [dev], FLUX.2 [klein] 9B | — | FLUX non-commercial | — | **Rejected** [SECONDARY] |
| FASHN VTON v1.5 (self-hosted) | Apache-2.0 | Apache-2.0 | 18 M pairs, **source not disclosed**; its required **FASHN Human Parser inherits the NVIDIA SegFormer licence** (non-commercial) | **Rejected as shipped.** Reconsider only if the parser is replaced and the data provenance is documented [PRIMARY] |
| Qwen-Image-Edit-2509 (self-hosted, 20B) | Apache-2.0 | Apache-2.0 | not disclosed | **Conditional, later:** licence OK but needs GPU hosting (not in scope) and is a general editor; T8 can test it via a hosted API instead [PRIMARY] |
| FLUX.2 [klein] 4B | — | Apache-2.0 | not disclosed | **Conditional, later** (as above) [SECONDARY] |
| Kolors-Virtual-Try-On open weights | — | not released | — | Not available; API only (3.2) |
| Oxygen-TryOn | Apache-2.0 | **not released** | not stated | Not available [PRIMARY] |
| BRIA RMBG-1.4 / 2.0 (cut-out) | — | CC BY-NC 4.0 unless a BRIA commercial agreement | — | **Rejected** (or buy a BRIA licence) [PRIMARY] |
| BiRefNet, IS-Net (DIS), U²-Net (cut-out) | MIT / Apache-2.0 | **weights licence not stated** | DIS5K (own terms PDF), DUTS, P3M etc.: terms not stated | **Rejected for now:** unclear weights and data [PRIMARY] |
| SAM / SAM 2 (cut-out) | Apache-2.0 | Apache-2.0 | **SA-1B: research-only licence** | **Conditional, VERIFY** (same class as F5); MagicTouch covers the need [PRIMARY / SECONDARY] |
| Ultralytics (any YOLO for person / garment detection) | AGPL-3.0 | — | — | **Rejected** (house rule) |
| VITON-HD, DressCode, DeepFashion datasets for our test sets | — | — | NC / research-only | **Not used** (4.1 uses owner and volunteer data) |

## 4. Measurement plan (fixed before building; sets written in T1, never tuned on held-out)

### 4.1 Fixed test sets

| Set | Content | Source label | Storage |
|---|---|---|---|
| **TS-G garments** | ≥ 20 items per supported category from a partner shop that grants written rights (≥ 220 items). Each item has a flat-lay or hanger photo, and on-model where available. 60 items get hand-drawn ground-truth masks | field (owner-supplied) | `~/LENSIQ-field/tryon/garments/` (outside the repo) |
| **TS-P people** | ≥ 24 consenting adult volunteers (18–60, a spread of body sizes, skin tones and genders). Captured live in the eval mode of `tryon.html` at 3 poses (front, ¾, arms slightly out). Each signs a release covering evaluation, rater viewing and the **named providers and countries**; deleted after the eval unless they opt in to keep | field | `~/LENSIQ-field/tryon/people/` (outside the repo, **never committed**) |
| **TS-PAIR** | Fixed pair list: each person × 10 items across categories (≥ 240 pairs per method), from a seeded shuffle | — | `pairs.csv` (ids only) |
| Split | `dev` if the first hex digit of SHA-256("lensiq-tryon:" + person id) is 0–7, else `held-out`. Settings are tuned on dev only; held-out is reported once | — | — |
| **TS-MOD** | 60 modest catalogue items + 20 known-revealing items (no underwear photos; product images of short dresses, crop tops, etc.) to measure the false-block rate and the moderation behaviour | field | outside the repo |

### 4.2 Metrics

| # | Metric | How | Proposed target (owner may change) |
|---|---|---|---|
| M1 | **Fit realism** (1–5) | ≥ 3 blinded raters who did not build it. Each output is shown with the person's original frame and the garment photo; the method is hidden; order is randomised per rater | default cloud chain ≥ 3.5 mean on held-out; on-device reported, no target |
| M2 | Garment fidelity (1–5): colour, print, logo, length | same raters | ≥ 3.5 |
| M3 | Identity preserved (yes / no): face, body shape and skin tone unchanged | same raters | ≥ 95 % yes for cloud |
| M4 | **Artefact rate**: any visible defect (join, missing limb, wrong garment, leftover old garment) | same raters; majority of 3 | cloud ≤ 20 %; on-device per category, shown on the page as in `ACCURACY.md` §11 |
| M5 | "Helps me decide to buy" (1–5) | same raters | reported |
| M6 | Inter-rater agreement | Krippendorff's alpha (ordinal) | ≥ 0.6, otherwise re-brief the raters |
| M7 | **Latency** | On-device: time to first overlay (models cached / cold), fps p50 / p10. Cloud: end-to-end p50 / p95 from capture to result | on-device ≥ 15 fps p50 on the low-end phone; cloud p95 ≤ 20 s |
| M8 | **Cost per image** | Real billed cost from the gateway `costMicros` log, including retries and failures, ÷ successful images | reported per provider; feeds pricing (6) |
| M9 | Cut-out quality | Mask IoU and boundary F-score vs the 60 GT masks; editor fix time per item (median) | IoU ≥ 0.90 flat-lay after the auto step; fix time ≤ 60 s median |
| M10 | Moderation | TS-MOD: share of modest items blocked (false blocks); share of revealing items blocked | false blocks ≤ 5 % |
| M11 | Per-category feasibility | Per category × method: M1, M4, M7 → green (M4 ≤ 20 % and M1 ≥ 3.5) / amber / red | The merchant note (2.3) and the product page show the measured colour |
| M12 | Live-only enforcement | e2e: no file input exists on the customer page; the API refuses requests without a capture token; one-person check | 100 % (pass / fail tests) |
| M13 | In-app browser camera | LINE, Facebook, Instagram, TikTok in-app browsers on iOS + Android: does the camera open? | reported; the fallback prompt is tested |

Every rate carries n and a Wilson 95 % interval, and every mean carries a bootstrap 95 % CI. Each number states its
source (field volunteers / owner catalogue). Nothing is claimed from public research benchmarks.

### 4.3 Eval tool

- `tools/tryon-eval.mjs` runs TS-PAIR through every configured provider, using the **same gateway code**. It refuses to
  run in CI, takes keys from the environment, and never writes images into the repo.
- `tools/tryon-rate.html` is the local blinded rating sheet. It writes `ratings.csv` outside the repo.
- Outputs go to `field-data/tryon-eval/` (git-ignored) plus a summary in `docs/TRYON-ACCURACY.md`.

### 4.4 Devices

- One low-end Android (≈ 3 GB RAM), one mid Android, one older iPhone (iOS 16/17) and one current iPhone; the owner
  provides them.
- Each device runs in the default browser, LINE and Facebook in-app.

## 5. Privacy (PDPA) and safeguards

### 5.1 Data and roles

| Data | Where | Kept |
|---|---|---|
| Live camera frames (overlay) | device memory | never stored, never sent |
| One captured frame (cloud mode) | device → Worker (memory) → provider | not stored by LENSIQ; provider retention per 3.2 (we pick `return_base64` / no-store options where offered) |
| Try-on result | provider → Worker → device memory | not stored by LENSIQ; the customer may download it |
| Catalogue cut-outs and data | D1 + R2 | until the merchant deletes them; 30 days after the shop closes |
| Usage log | D1 | counts, provider, cost, latency, error kind; **no image, no IP, no customer id** (gateway log rules) |

- **Controller / processor:**
  - On a merchant's link or embed, the **merchant** is the controller for its customers' try-ons and LENSIQ is a
    processor (s.40). This needs the org-accounts DPA (L22, L-T8).
  - On LENSIQ's own demo pages, LENSIQ is the controller.
- **Body images:**
  - A body image is personal data (s.6).
  - Try-on does not identify anyone and computes no face template. The working view is therefore that it is **not**
    biometric data under s.26, but counsel must confirm (L-T7).
  - Dress-size or body-shape inferences are not computed or stored.
- **Cross-border transfer:**
  - Cloud mode sends a body image to the US, Singapore or China depending on the provider, under PDPA s.28–29.
  - The consent screen names the provider, the model and the country (owner rule, as Product Check 10.6).
  - China-region processing of body images is proposed **off** (TO-D4).
- **Exception to "only derived facts are sent":** cloud mode sends a photo of a person. It needs explicit owner approval
  (TO-D3), like PC-D1.

### 5.2 Consent screens (TH / EN / ZH)

- **Screen 1 (camera, on-device):** "The camera runs on this device; nothing is sent or stored." It is shown before the
  first `getUserMedia`.
- **Screen 2 (cloud):**
  - provider and model actually used, and the next fallback;
  - processing country;
  - what is sent ("one photo of you, face blurred / not blurred");
  - provider retention in one line;
  - that LENSIQ stores nothing;
  - that the shop pays one credit;
  - that the result is a **synthetic preview**, not a real fit;
  - an 18+ self-declaration checkbox.
- "Remember my choice" is **unticked by default** and can be withdrawn on the page. It does not cover a provider or
  country that was not on the screen (as AI-GATEWAY §7).

### 5.3 Minors

- **Cloud mode:** only after an 18+ self-declaration. Gemini API users must be 18+ (L2), and the other providers' terms
  are checked in T0.
- **Under 18:** on-device overlay only.
- **Kids' clothing shops:** for categories marked "kids", cloud mode is disabled for the item.
- **More than one person:** if Pose Landmarker or BlazeFace sees more than one person, capture is blocked ("one person
  only"). This reduces the risk of capturing a child next to an adult.
- **Counsel:** PDPA s.20 guardian consent for minors, and whether a self-declaration is enough (L-T9).

### 5.4 Live-only capture, deepfake and misuse safeguards

| Safeguard | How | Limit (stated plainly) |
|---|---|---|
| No upload path for people | The customer page has **no file input, no drag-drop, no paste**; frames come only from `getUserMedia`. `/v1/ai/tryon_image` accepts only a capture token issued at camera start (single use, 60 s) | A modified client or a script can still call the API with any image if it gets a token. The token proves a session, not a live person |
| Liveness prompt before the cloud capture | Random prompt (raise left / right hand, turn head), verified on device with Pose / Face Landmarker; capture at a random moment after it passes | A pre-recorded video of someone following prompts, or a person holding up a printed photo while moving, can pass |
| Virtual-camera hint | Device labels containing "OBS", "Virtual", "ManyCam", "Snap Camera" etc. → cloud mode off for that device | Labels can be renamed; not proof |
| One person in frame | 5.3 | — |
| Merchant-only garments | Customers cannot add garments; only published catalogue items, in allowed categories, can be applied. Prompts are fixed by LENSIQ (no free text) | Blocks "nudify"-style use through our UI; a merchant could upload a bad item, so publish review + report button |
| Provider moderation | FASHN `moderation_level: "conservative"` forced; Gemini / Vertex safety settings at default or stricter; `content_policy_input` is never shopped to another provider (gateway fallback rule) | Provider filters have their own error rates (measured M10) |
| Output labelling | Visible "ภาพจำลอง · Virtual try-on preview" mark burned into every overlay snapshot and cloud result, plus a metadata note. Google outputs may carry SynthID [UNVERIFIED for VTO] | A mark can be cropped |
| No storage | 5.1 | The customer can screenshot; the provider may keep data per its terms |
| Rate limits | per device, per shop and global per minute / day; Turnstile on the cloud step | — |
| Report | "Report this item" on every item → shop admin + LENSIQ owner (audit) | — |

**Plain statement for the product pages:** LENSIQ makes it harder to try clothes on someone else's photo, but cannot
prove that the person in front of the camera is the person who consented.

### 5.5 Face-protect mode (option for garments, measured in T8)

1. Before upload, blur the face region on the device (BlazeFace + face landmarks, padded).
2. Send the frame and receive the result.
3. Paste the original face region back **on the device** with a feathered mask.

- **Gains:** the provider never receives a clear face.
- **Risks:** a mismatch at the neckline, hair and lighting. It works only if the provider keeps the geometry (FASHN and
  Vertex return the input aspect ratio).
- **Scope:** for glasses, hats and earrings the cloud is not used at all.
- **Default:** TO-D5 (on if the T8 artefact rate is within +5 points of normal mode).

### 5.6 Documents to update (in T0, not now)

- `docs/pdpa/DPIA.md`: M7 is extended (try-on via the gateway, multiple providers), plus new risks R-T1–R-T6.
- `docs/pdpa/consent-texts.md`: the TH / EN / ZH texts of 5.2.
- `docs/PDPA-NOTES-FOR-COUNSEL.md`: a new section "Try-On".
- `privacy.html` / `terms.html`: providers and countries, and the merchant acceptable-use terms.

## 6. Pricing model draft (B2B, excl. 7 % VAT; NOT on sale; needs an owner decision and a migration)

Principles carried over from `BILLING-PLAN.md` §1:

- on-device stays free and unlimited;
- charge only where there is a variable cost (cloud images, storage) or business value (catalogue, embed, support);
- no surprise charges (PromptPay push, credits prepaid);
- yearly = 10 × monthly.

Prices are excl. 7 % VAT, as in PRICING-RESEARCH §3 (the customer pays + 7 %).

| Plan id (proposed) | Monthly (excl. 7 % VAT) | Catalogue items | Cloud AI images included / month | Seats | Share / embed | Storage |
|---|---|---|---|---|---|---|
| `tryon_trial` | 0 THB for 30 days | 20 | 20 (one-off) | owner + 1 editor | link + LINE | 200 MB |
| `tryon_starter` | **490 THB** | 100 | 60 | owner + 1 editor | link + LINE + QR | 1 GB |
| `tryon_shop` | **1,490 THB** | 1,000 | 300 | owner, 2 admins, 5 editors | + embed (3 origins), CSV bulk | 5 GB |
| `tryon_pro` | **3,900 THB** | 5,000 | 800 | unlimited | + embed (10 origins), multi-branch, priority support | 20 GB |
| `tryon_credits_100` | 390 THB one-off (3.9 THB / image) | — | +100 | — | — | — |
| `tryon_credits_1000` | 2,900 THB one-off (2.9 THB / image) | — | +1,000 | — | — | — |

**Credit rules (draft):**

- 1 credit = 1 successful cloud image from a standard-cost provider (≤ USD 0.08). A premium provider (> USD 0.08, e.g.
  Perfect Corp, `gemini-3-pro-image`) costs 2 credits. The merchant sees this in the back-office settings; the customer
  never sees credit prices.
- Failed or refused images are **not charged**, matching FASHN's "failed requests are never charged" and the gateway
  refund rule.
- Included credits reset monthly. Top-up credits are valid 12 months. Credits are used oldest first.
- When credits run out, the page falls back to on-device only, with a message in all three languages. The shop owner
  gets an e-mail at 80 % and 100 % of its credits.

**Unit economics** (list prices from 3.2; real numbers from T8 replace these):

| Default provider (if chosen in T8) | Cost / image | Starter: cost at 100 % use | Shop | Pro |
|---|---|---|---|---|
| Gemini 3.1 flash-lite image | ≈ 1.1 THB | 66 THB (13 %) | 330 THB (22 %) | 880 THB (23 %) |
| Google Vertex VTO | ≈ 2.0 THB | 120 THB (24 %) | 600 THB (40 %) | 1,600 THB (41 %) |
| FASHN v1.6 | ≈ 2.5 THB | 150 THB (31 %) | 750 THB (50 %) | 2,000 THB (51 %) |

- Top-ups are priced at ≥ 2.9 THB per credit, which covers the worst standard provider (FASHN, 2.5 THB) plus the Opn fee
  (≈ 1.77 %).
- Storage on R2 is negligible at these sizes [UNVERIFIED at our volume].
- **Market reference** [PRIMARY / SECONDARY]: FASHN app USD 19 / 49 / 99 per month (≈ 630 / 1,620 / 3,270 THB);
  Perfect Corp API USD 24 per 500 units.
- Thai try-on SaaS prices were **not researched** this round. That research is done in T0 (TO-D8).

## 7. Phases and effort (S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 6–10 days)

Every phase follows the working rules:

- a fixed test set first;
- real numbers per condition;
- an independent reviewer who re-measures;
- TH / EN / ZH;
- CI green before the next phase.

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| T0 | Owner decisions TO-D1–D12 recorded; provider terms snapshots (PDF, dated); counsel rows L-T1–L-T19 into CTO-BRIEF §8; DPIA / consent / counsel-notes deltas; Thai market price check; volunteer release form (TH) | S (docs) | owner |
| T1 | **Test sets first:** TS-G protocol + partner-shop rights letter, TS-P capture protocol + eval mode, TS-PAIR, TS-MOD, GT masks for 60 items, rater sheet `tools/tryon-rate.html` | M | owner (shop, volunteers, raters) |
| T2 | Back-office shell `backoffice.html`: roles owner / admin / editor, `org_audit`, upload limits, face blur, TH / EN / ZH, phone layout; Try-On catalogue CRUD, publish / hide / review, CSV + images bulk import with report; D1 tables + R2 | L | org accounts P1–P2 (or TO-D2 interim); R2 bucket |
| T3 | Garment cut-out: auto (flat-lay + Selfie Multiclass), MagicTouch fix tool, anchors; numbers M9 | M | T1, T2 |
| T4 | Customer `tryon.html`: live-only camera, consent #1, on-device overlay. Face-anchored (glasses, hats, earrings, necklace), pose-anchored (tops, outerwear, dresses, skirts, trousers, bags), hand-anchored (rings, bracelets, watches); shoes experimental; occlusion; HQ still via studio-core; preview mark; numbers M4 (on-device), M7, M12 | L | T3 |
| T5 | Cloud try-on: gateway feature `tryon_image` with **image output** (schema = image validator: type, size, aspect); adapters FASHN, Vertex (service-account JWT signed with WebCrypto), Gemini image (extends the existing adapter), Kling, Perfect Corp, Alibaba (behind TO-D4); credits ledger + refund on failure; consent #2, 18+, liveness prompt, capture token, face-protect; `tryon.py` NC filter extended (relay kept) | L | T4, AI Gateway (built) |
| T6 | Outfit mixing: on-device layering (bottom → top → outerwear → accessories, z-order rules); cloud = sequential calls (one credit each), offered only for pairs measured green | M | T4, T5 |
| T7 | Share link, embed (`frame-ancestors` per shop), LINE link + optional LIFF, OG cards, QR poster, in-app browser detection + fallback; numbers M13 | M | T4 |
| T8 | Eval: all providers × TS-PAIR, blinded rating, M1–M11 per category; default chain picked by the rule in 3.2; `docs/TRYON-ACCURACY.md`; feasibility colours in the merchant notes | M | T5, T6, owner keys + budget, raters |
| T9 | Pricing: plan registry draft (no migration without owner approval), one-pager `ONE-PAGER-TRYON.md` (TH / EN / ZH, measured accuracy + source), pricing.html "approved, not on sale" if approved; CTO-BRIEF + FIELD-PILOT updates | S | T8, owner pricing decision |

**Total:** about 8–11 weeks of rounds, excluding counsel and external waits.

- **Suggested order:** T0 → T1 → T2 → T3 → T4 → T5 → T6 + T7 (parallel) → T8 → T9.
- **If merchant accounts are not ready** (org accounts P1–P2), T3–T5 can start with a LENSIQ-owner-managed demo shop
  while T2 waits (TO-D2).

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| TR1 | A non-commercial model slips in through a provider or a dependency | Provider contracts only; the adapter allowlist is in the lint guard; `tryon.py` NC filter; licence snapshot per provider in T0 |
| TR2 | Someone tries clothes on another person's image (deepfake / harassment) | 5.4. Limits stated; no customer garment upload; no free-text prompts; report path; ToS; counsel L-T10 |
| TR3 | Revealing or sexualised outputs | No underwear / swimwear categories; FASHN conservative moderation; publish review; M10 |
| TR4 | Minors in cloud mode | 18+ self-declaration; kids items on-device only; one-person check; counsel L-T9 |
| TR5 | Customers read a preview as a real fit (returns, complaints) | "Virtual preview" mark; per-category measured quality shown; no size recommendation in v1 |
| TR6 | Cross-border body images; provider retention unknown (FASHN region, Kling, Perfect Corp) | Consent names provider and country; China-region off (TO-D4); `return_base64` / no-store options; counsel L-T1–L-T7 |
| TR7 | On-device overlay quality is low (studio baseline 72.9 % defects on stills) | Label as preview; measured per category; cloud for garments; accessories first |
| TR8 | In-app browsers block the camera (LINE / Facebook) | Measured (M13); "open in browser" fallback |
| TR9 | Cloud cost overrun | Prepaid credits; gateway budget reservation; per-shop and per-device limits; on-device fallback |
| TR10 | Provider prices or models change | Versioned price table; eval re-run on change; credit = cost class, not a fixed provider |
| TR11 | Merchant uploads photos it has no rights to (brand photos, model photos) | Merchant warranty in the terms; report path; no on-model storage by default (L-T11) |
| TR12 | Face blur misses faces on catalogue photos (27.6–34.7 %) | Only cut-outs stored; editor confirmation; on-model storage off (TO-D7) |
| TR13 | Dependency on org accounts delays the back-office | TO-D2 interim demo shop; T3–T5 can proceed |
| TR14 | Virtual cameras defeat live-only | Stated limit; heuristics; capture token; not claimed as proof |
| TR15 | Vertex auth from a Worker (service-account JWT) adds a long-lived secret | Scoped service account (Vertex user only), key in Worker secrets, rotation note |

## 9. What the owner must provide

1. **Decisions TO-D1–D12** (below).
2. **A partner shop** that grants written rights to ≥ 220 catalogue items across the categories (TS-G), ideally also the
   first pilot merchant.
3. **≥ 24 adult volunteers** with signed releases (form drafted in T0), captured in a session the owner organises.
4. **≥ 3 blinded raters** who did not build the feature (≈ 1 day each).
5. **Provider accounts and keys**, set by the owner with `wrangler secret put` (never shared with agents):
   - FASHN;
   - a Google Cloud project with Vertex AI and a service account;
   - Gemini on the paid tier (existing);
   - Kling;
   - Perfect Corp;
   - Alibaba (optional).
6. **Eval budget:** about **USD 120**: 240 pairs × up to 6 providers × ~USD 0.07, plus retries.
7. **A Cloudflare R2 bucket** enabled on the owner's account (agents do not change account settings).
8. **Test phones** as in 4.4.
9. Optional: a **LINE Official Account / LIFF channel** if the owner wants the LIFF version.
10. **Counsel** for rows L-T1–L-T19 before charging.

**Owner decisions (defaults proposed):**

| # | Decision | Proposed default |
|---|---|---|
| TO-D1 | Where the merchant back-office lives | A new `backoffice.html`, shared by all merchant back-offices; `admin.html` stays LENSIQ-owner only |
| TO-D2 | Merchant accounts | Reuse org accounts (P1–P2) + a new `editor` role; meanwhile one demo shop managed by the LENSIQ owner |
| TO-D3 | Exception to "only derived facts are sent": a photo of the customer goes to a try-on provider after consent | Yes, cloud mode only, per-customer consent, nothing stored |
| TO-D4 | China-region processing of body images (Alibaba aitryon) | Off (the adapter is built, but off in the allowlist) |
| TO-D5 | Face-protect mode default | On, if T8 shows ≤ +5 points artefact rate |
| TO-D6 | Cloud mode age rule | 18+ self-declaration; under 18 on-device only |
| TO-D7 | Store on-model display photos (images of people) | No: cut-outs and flat-lays only |
| TO-D8 | Pricing levels in 6 | Draft for owner review after the T0 Thai market check |
| TO-D9 | Page placement | `tryon.html` listed in category 4 (Marketing, Retail & Events) and 7 (Studio & Media) |
| TO-D10 | Pilot scope | Cloud: tops, outerwear, dresses. On-device: glasses, hats, earrings. Others "experimental" until measured green |
| TO-D11 | Provider allowlist for testing | Every provider on except TO-D4 (as PC-D2); the consent screen names provider and country |
| TO-D12 | Eval targets in 4.2 | As proposed |

## 10. Proposed legal rows (for `docs/CTO-BRIEF.md` §8; ids to be renumbered) and credits

| # | Item | Why | Where | Status | Added |
|---|---|---|---|---|---|
| L-T1 | FASHN API terms and DPA | Body images to a processor whose **processing region is not stated**; outputs kept 72 h unless base64; commercial use licence on the API tier | design §3.2; adapter (T5) | open | 2026-11-10 |
| L-T2 | Google Vertex AI Virtual Try-On terms | Generative AI prohibited-use policy for images of real people; region; retention; whether SynthID applies; price on the official page | §3.2 | open | 2026-11-10 |
| L-T3 | Gemini image models used to edit photos of real people | Paid tier only, users 18+ (L2); prohibited-use policy on editing people | §3.2, §5.3 | open | 2026-11-10 |
| L-T4 | Kling (Kuaishou) API terms | Singapore endpoint unverified; retention not found; PRC parent | §3.2 | open | 2026-11-10 |
| L-T5 | Perfect Corp YouCam API terms | Retention, region and unit pricing not confirmed on the official page | §3.2 | open | 2026-11-10 |
| L-T6 | Alibaba Model Studio aitryon | Docs point to China (Beijing); body images to China; proposed off (TO-D4) | §3.2 | open | 2026-11-10 |
| L-T7 | Body images: personal vs sensitive (s.26) data; cross-border s.28–29 per provider country; consent texts TH / EN / ZH with "remember my choice" | Cloud mode sends a photo of a person | §5.1, §5.2 | open | 2026-11-10 |
| L-T8 | Merchant as controller, LENSIQ as processor for embeds and links | DPA with merchants (extends L22); merchant privacy notice for its customers | §5.1 | open | 2026-11-10 |
| L-T9 | Minors | PDPA s.20 guardian consent; is an 18+ self-declaration enough; kids' categories on-device only | §5.3 | open | 2026-11-10 |
| L-T10 | Misuse and deepfake liability | Altered images of a person (Computer Crime Act s.16 risk signal); acceptable-use terms; the live-only limits stated in §5.4 | §5.4 | open | 2026-11-10 |
| L-T11 | Merchant catalogue rights | Merchant warrants rights to product and model photos (model releases); brand logos and trademarks in cut-outs | §2.2, §8 TR11 | open | 2026-11-10 |
| L-T12 | Consumer protection wording | "Virtual preview, not actual fit"; no size advice; price display (VAT incl. / excl.) is the shop's | §5.4, §2.2 | open | 2026-11-10 |
| L-T13 | Face blur on catalogue photos | Misses 27.6–34.7 % of real faces; only cut-outs stored; is editor confirmation adequate (links L39) | §2.4 | open | 2026-11-10 |
| L-T14 | Credits terms | Expiry (monthly / 12 months), no refunds of used credits, failed images not charged, VAT on prepaid credits (links L25) | §6 | open | 2026-11-10 |
| L-T15 | SAM 2 if ever used | Apache-2.0 weights trained on SA-1B (research-only licence) | §3.3 | open (not used) | 2026-11-10 |
| L-T16 | Photoroom API (optional cloud cut-out) | Terms, retention, region; garment photos only | §2.5 | open (optional) | 2026-11-10 |
| L-T17 | Embeds on third-party sites and LINE | LINE platform / LIFF terms; camera permission in cross-origin iframes; cookies (none planned) | §1.3 | open | 2026-11-10 |
| L-T18 | Volunteer test set | Release form (evaluation, raters, named providers and countries), retention and deletion; no images committed | §4.1 | open | 2026-11-10 |
| L-T19 | Self-hosted try-on models if ever used (FASHN VTON v1.5, Qwen-Image-Edit, FLUX.2 klein 4B) | Training data not disclosed; FASHN parser under the NVIDIA SegFormer licence | §3.3 | closed: not used (2026-11-10) | 2026-11-10 |

**Credits to record** (added to `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt` and `about.html` when
each item is vendored or switched on):

- **Google MediaPipe models** (Apache-2.0; keep the model cards and NOTICE):
  - Face Landmarker (Face Mesh V2);
  - Pose Landmarker (BlazePose GHUM 3D);
  - Interactive Segmenter (MagicTouch);
  - Hand Landmarker, Selfie Multiclass and BlazeFace (already credited).
- **Already credited:** MODNet (Apache-2.0, ZHKKKe; F7 VERIFY) and onnxruntime-web (MIT).
- **OpenCV.js** (Apache-2.0), if used for `grabCut`.
- **Cloud providers** (no attribution required unless their terms say so; checked in T0): FASHN, Google Cloud Vertex
  AI, Google Gemini API, Kling (Kuaishou), Perfect Corp, Alibaba Cloud Model Studio, Photoroom (optional).
  The consent screen names the provider used, as for Product Check.
- **Test data:** partner-shop catalogue (written rights letter, kept with `~/LENSIQ-field/tryon/CREDITS.tsv`) and
  volunteer releases (kept offline, never in the repo).

**Sources** (accessed 2026-11-10):

- **Try-on models:**
  - github.com/yisol/IDM-VTON;
  - github.com/levihsu/OOTDiffusion (LICENSE);
  - github.com/Zheng-Chong/CatVTON;
  - github.com/rlawjdghek/StableVITON;
  - github.com/BoyuanJiang/FitDiT;
  - github.com/franciszzj/Leffa and huggingface.co/franciszzj/Leffa;
  - github.com/shadow2496/VITON-HD;
  - github.com/aimagelab/dress-code;
  - huggingface.co/fashn-ai/fashn-vton-1.5, github.com/fashn-AI/fashn-vton-1.5 and fashn.ai/blog/fashn-vton-1-5-open-source-release;
  - huggingface.co/fashn-ai/fashn-human-parser;
  - github.com/XQ0820/open-virtual-try-on-models [SECONDARY];
  - github.com/oxygenVision/Oxygen-TryOn;
  - huggingface.co/Qwen/Qwen-Image-Edit-2509.
- **Cloud APIs:**
  - fashn.ai/pricing and docs.fashn.ai (try-on v1.6, data retention);
  - docs.cloud.google.com Vertex AI virtual try-on pages;
  - aistudio.google.com/docs/pricing;
  - fal.ai Kling Kolors try-on;
  - perfectcorp.com virtual-try-on-api-pricing blog;
  - help.aliyun.com billing-for-outfitanyone [SECONDARY].
- **Cut-out and on-device models:**
  - huggingface.co/briaai/RMBG-2.0;
  - github.com/ZhengPeng7/BiRefNet;
  - github.com/xuebinqin/DIS;
  - github.com/xuebinqin/U-2-Net;
  - github.com/facebookresearch/sam2;
  - the MediaPipe BlazePose GHUM 3D and MagicTouch model cards (storage.googleapis.com/mediapipe-assets).

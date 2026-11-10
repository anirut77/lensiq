# Personal Colour & Style: design (owner brief item 1)

> **Status: DRAFT for owner approval. Nothing is built.** Build order: **last**, after Product Check (in progress),
> Nutrition, Try-On and Merit. This is a design document only: no code and no commits.
> Not legal advice. Every legal point is a **risk signal** for counsel (running list `docs/CTO-BRIEF.md` §8, new rows
> `L-S1…` in section 10), not a finding.
> Written 2026-11-10 from the current code (`luckycolor.html`, `luckycolor.js`, `lensiq-luckycolor.js`, `studio.js`,
> `studio-core.js`, `photobooth-hq.js`, `admin.html`, `admin.js`, `backend/src/auth.js`, `lensiq-config.js`), the model
> inventory (`vendor/models/`, `LICENSES/THIRD_PARTY.md`, CTO-BRIEF §2) and one web research pass (accessed 2026-11-10).
> Labels: **[PRIMARY]** = official vendor, licence or paper text read; **[SECONDARY]** = mirror, press, blog or
> abstract only; **[UNVERIFIED]** = not confirmed.

> **Owner approval (2026-11-10):** design approved. Style MVP = personal colour palette with the white-balance step.
>
> **Shared back-office (cross-doc note, 2026-11-10).** All four new designs (Nutrition, Try-On, Merit, Style) use ONE
> admin area, `backoffice.html`, built once in Nutrition **N3** (first in build order): roles owner / admin / editor,
> per-person audit log, image upload with size limits + automatic face blur (Product Check `faceBlur`) + person check,
> TH / EN / ZH, phone layout. Try-On T2, Merit M1 and Style S5 then only add their own sections, so their effort drops
> (T2 L→M, M1 M→S, S5 L→M). **BO-1 decided (owner, 2026-11-10):** do not wait for org accounts. Phase 1 back-office uses the existing
> platform admin login (owner with mandatory TOTP, plus admin and editor roles); merchant self-service login moves to
> org accounts later.

## สรุปสำหรับเจ้าของ (Thai summary)

- **ทำอะไร:** หน้าใหม่ "สีและสไตล์ส่วนตัว" ต่อยอดจากหน้าสีมงคล (`luckycolor`) และสตูดิโอ
  1. วัด **อันเดอร์โทนผิว** (อุ่น / กลาง / เย็น) และ **ซีซันสีส่วนตัว** จากกล้อง โดยให้ผู้ใช้ **ถือการ์ดสีขาวหรือเทา**
     ข้างแก้มเพื่อแก้แสงก่อนวัด
  2. **คะแนนความกลมกลืนของสี** ของชุดและผมประจำวัน พร้อมคำแนะนำ เชื่อมกับ **สีมงคลประจำวัน** ที่มีอยู่แล้ว
  3. **การ์ดสรุปพาเลตสี** ของผู้ใช้ (เฉพาะแถบสี ไม่มีรูปหน้า)
- **ข้อเท็จจริงที่ต้องพูดตรงๆ:** ระบบ "ซีซันสี" เป็นเรื่อง **อัตวิสัย** ไม่มีคำตอบที่ถูกต้องแท้จริง
  งานวิจัยของจุฬาฯ พบว่าผู้ประเมินกับผู้ทดลองตรงกันเพียง **40%** สำหรับระบบ 4 ซีซัน เราจึง **ไม่อ้างความแม่นยำ**
  แต่วัด 3 อย่างแทน: (1) ผลเดิมไหมเมื่อคนเดิมอยู่ใต้แสงต่างกัน (2) ตรงกับนักวิเคราะห์สีมืออาชีพแค่ไหน เทียบกับที่นักวิเคราะห์ 2 คนตรงกันเอง
  (3) ความคลาดเคลื่อนสีบนแผ่น ColorChecker
- **ห้ามทำ:** ไม่ให้คะแนนความสวย หน้าตา หรือรูปร่าง ไม่เดาเชื้อชาติ ไม่ใช้คำว่า "ผิวขาว / คล้ำ / ใส่แล้วผิวดูสว่าง / 显白"
  คะแนนชุดคือ **ความกลมกลืนของสีเท่านั้น**
- **โมเดล:** ใช้เฉพาะ Google MediaPipe (Apache-2.0) ที่มีอยู่แล้ว (แยกผม ผิว เสื้อ) และเพิ่ม Face Landmarker
  ไม่ใช้โมเดลอายุ / เพศ / สีหน้า และไม่ใช้ BiSeNet
- **ข้อมูลทดสอบ:** ไม่มีชุดข้อมูลสาธารณะที่ใช้เชิงพาณิชย์ได้และมีป้ายอันเดอร์โทนหรือซีซัน จึงต้องเก็บเองจาก **อาสาสมัครที่ยินยอม**
  อย่างน้อย 40 คน พร้อมนักวิเคราะห์สี 1–2 คน
- **ความเป็นส่วนตัว:** ภาพหน้าใช้ **ในเครื่องเท่านั้น** ไม่เก็บอะไรเป็นค่าเริ่มต้น เก็บพาเลตไว้ในเครื่องได้เมื่อผู้ใช้กดเอง
  คำถามให้ทนาย: ถือเป็นข้อมูลชีวภาพ (ม.26) หรือไม่ และสีผิวอาจถูกมองว่าบ่งบอกเชื้อชาติหรือไม่
- **ระบบหลังบ้าน:** ใช้พื้นที่ admin เดียวกับระบบอื่น (owner / admin / editor, audit log, อัปโหลดรูปพร้อมเบลอหน้าอัตโนมัติ,
  3 ภาษา, ใช้บนมือถือได้) เพิ่มส่วนแก้ไขพาเลต ซีซัน เนื้อหาสไตล์ และตารางสีประจำวัน
- **ระยะเวลา:** 7 ช่วง (S0–S6) ราว **9–12 สัปดาห์** (+2 สัปดาห์ถ้าระบบสิทธิ์ admin ร่วมยังไม่ถูกสร้างโดยงานก่อนหน้า)
- **เจ้าของต้องเตรียม:** การ์ดสีขาว/เทา, แผ่น ColorChecker, มือถือทดสอบ 2 เครื่อง, หลอดไฟ 3–4 แบบ,
  อาสาสมัครที่ยินยอม ≥ 40 คน, นักวิเคราะห์สี 1–2 คน, และตัดสินใจ 8 ข้อ (ข้อ 9.2)

## 0. Fixed coverage list (written before the design)

| # | Requirement (owner brief) | Section |
|---|---|---|
| A1 | Skin undertone and colour season from the camera, with a white-balance step (hold a card) | 1.2, 3.3 |
| A2 | Daily outfit and hairstyle match score with suggestions, linked to the Thai day colours already in the product | 1.4, 3.4 |
| A3 | Colour palette summary for the user | 1.3 |
| A4 | Rules: colours and styles only, never looks or body; no ethnicity inference; licence-clean models; nothing stored by default | 1.5, 5, 6 |
| B1 | Admin: one area, roles owner / admin / editor, audit log, image upload with size limits and auto face blur, TH / EN / ZH, phone screens | 2 |
| B2 | Admin: palette, season and style content editing; day-colour mapping | 2.3 |
| C1 | Research: ITA°, CIELAB hue angle, white-card calibration, known biases | 3.1, 3.3, 8 |
| C2 | Research: season systems and their subjectivity | 3.2 |
| C3 | Research: licence-clean models with licence and training data | 3.5 |
| C4 | Research: outfit colour extraction | 3.4 |
| C5 | Research: public commercial-OK datasets; else an owner-collected consented set | 3.6, 4 |
| D | Measurement (repeatability, analyst agreement, calibration error; no ground-truth accuracy claim); privacy; wording TH / EN / ZH; phases; risks; owner inputs; legal rows and credits | 4–10 |

## 1. User flow

New page `style.html` (logic `lensiq-style.js`, page code `style.js`, dictionaries `i18n/en-style.js`,
`i18n/zh-style.js`). Category placement is an owner decision (S-D5): proposed **7 Studio & Media**, also listed under
**4 Marketing, Retail & Events** (shop kiosk) and cross-linked from `luckycolor.html` (Fortune). Nothing existing is
removed: `luckycolor.html` keeps working as it is and gains a link "วัดพาเลตสีของคุณ".

### 1.1 Start screen

- One-screen notice (TH / EN / ZH): "วิเคราะห์ **สี** ไม่ใช่หน้าตา · ประมวลผลในเครื่อง · ไม่เก็บภาพ · ผลเป็นคำแนะนำด้านสี
  ไม่ใช่ข้อเท็จจริงเกี่ยวกับตัวคุณ".
- Three entry points: **A. วัดพาเลตสี** (camera, 1.2) · **B. ชุดวันนี้** (1.4, works without a palette) ·
  **C. ดูพาเลตที่บันทึกไว้** (only if the user saved one on this device).

### 1.2 Palette measurement (camera, about 60 s)

1. **Light check.** Face the light; no strong backlight; turn off beauty filters. Toggle "bare skin / light makeup"
   (foundation shifts the reading; with makeup the app samples the jaw and neck edge and lowers confidence).
2. **White-balance card.** Hold a white or grey card next to the cheek, in the same light, **in the same frame** as the
   face. The app finds the card (bright, low-chroma quad), checks it is not clipped (no channel ≥ 250) and evenly lit
   (gradient across the card < threshold), then shows "การ์ดพร้อม". The card stays in view during measurement, so the
   correction is per frame (iOS Safari cannot lock white balance; where Chrome on Android supports
   `whiteBalanceMode` / `exposureMode` constraints, the app also locks them after the card step).
3. **Measure** (3–5 s, about 30 frames): skin patches (both cheeks, forehead, chin) from face landmarks, minus
   highlights, shadows, brows and lips; hair from the hair mask; eye colour is experimental and off by default.
   Robust median over frames; the spread across frames becomes the confidence.
4. **Virtual drapes (recommended, S-D2).** The live view is framed by colour pairs, as an analyst would drape fabric:
   gold vs silver (warm / cool), light vs deep, clear vs soft. The **user** taps the side they prefer for each pair. The
   app never says which one "looks better on you".
5. **Result** (1.3). If the card failed, the lighting was mixed or the spread is high, the result says
   "ยังสรุปไม่ได้ ลองอีกครั้งใต้แสงธรรมชาติ" instead of guessing.

### 1.3 Palette summary card

- **Undertone:** warm / neutral-warm / neutral / neutral-cool / cool / **not sure**, shown as a position on a bar,
  never as a skin colour.
- **Season:** the **two closest** seasons (for example "ใกล้ Soft Autumn ที่สุด รองลงมา True Autumn"), with a 2-D chart of
  the measured position (warm–cool × light–deep) and one line per dimension saying why.
- **Palette:** 12–16 swatches from admin content (2.3): base neutrals, accents, metals, plus "สีที่ใช้ห่างจากใบหน้าได้ดี"
  (positive framing, like the lucky-colour page: no "avoid" list).
- **Confidence** in words (high / medium / low) from repeatability across frames plus agreement between the
  measurement and the drape choices.
- **Save / share:** the card is rendered from swatches and text only (**no face pixels**). Download as PNG. "จำพาเลตไว้ในเครื่องนี้"
  is an explicit opt-in (localStorage: season ids, swatch hex, undertone band, date; no image, no Lab values of skin).

### 1.4 Daily outfit and hair match

- Input: the mirror camera (as `luckycolor.html`), **or** a flat-lay photo of the clothes (no person in frame; the
  privacy-preferred mode).
- Outfit colours are extracted (3.4) and shown as chips with a share each.
- **Colour harmony score 0–100**, always labelled "คะแนนความกลมกลืนของสี", made of three visible parts:
  1. **Palette fit**: how close each outfit colour is to the nearest palette colour (CIEDE2000). Skipped when there is no
     saved palette.
  2. **Combination harmony**: harmony of the outfit colours with each other (two-colour model, 3.4).
  3. **Today's day colour**: reuses `LQLucky.evaluate(list, dayPlanet, goal)` unchanged: level 3–0, positive wording,
     goal chosen by the user (work / money / love / support).
- **Suggestions** (rule-based, from admin content): swap one item for a palette colour; add an accent in today's day
  colour (scarf, bag, hair clip); a hair accessory colour; hairstyle cards matched by **occasion and colour** (hair
  colour vs palette, accessory colour vs day colour). No face-shape analysis in phase 1 (S-D3).
- Works with no palette: day colour + combination harmony only.

### 1.5 What we must not do (hard rules, tested)

1. **No beauty, attractiveness or body scoring.** No score, rank, comparison or adjective about the face, skin, body,
   shape, weight, age or youthfulness. The only number is colour harmony between colours.
2. **No ethnicity inference and no skin-colour judgement wording.** The app never outputs a skin-tone category
   (ITA bands such as "light / tan / dark", Fitzpatrick, Monk), never names an ethnicity or nationality, and never
   implies lighter is better ("ผิวดูขาว / สว่างขึ้น", "显白", "brightening").
3. **The match score is about colour harmony only**: it scores colours against colours (palette, each other, day colour),
   never the person.
4. **No emotion or expression inference.** MediaPipe blendshapes are not requested (`outputFaceBlendshapes: false`); the
   face-api expression and age / gender models are not loaded on this page in any build, including demo mode.
5. **No gender inference.** Style content filters (if any) are chosen by the user (S-D4).
6. **No health or skin-condition comment.** Redness, acne, pigmentation or tan are never named; they only lower
   confidence.
7. **No product or cosmetic recommendations** (brands, foundation shades, whitening) in phase 1.
8. **No images stored, uploaded or used for training.** Analytics events carry no season, undertone or colour result.

## 2. Admin back-office

### 2.1 Shared admin requirements (all four back-offices)

Today `admin.html` / `admin.js` is a **single admin** (`admin_users.id = 1`) with password + TOTP, re-auth, an audit
view, analytics, AI gateway, billing and members tabs. The four new back-offices (Nutrition, Try-On, Merit, Style) share
one extension, built by whichever ships first; Style only adds its section (S5). If it does not exist when Style starts,
S5 grows by about 2 weeks.

| Requirement | Design |
|---|---|
| One admin area | New tab group "Content" in `admin.html`; Style is one section. Same login, TOTP, re-auth |
| Roles | **owner** (the existing admin user; manages users and roles, season thresholds, day-colour tradition, wording lint list, publish), **admin** (all content, publish, uploads; no roles, thresholds or tradition), **editor** (drafts and uploads only; cannot publish or delete). Server-side checks on every endpoint |
| Audit log | Append-only, hash-chained (same pattern as `org_audit` in ORG-ACCOUNTS-DESIGN §2), before / after JSON per change, user, role, time; visible to owner and admin; kept 400 days |
| Image upload | JPEG / PNG / WebP only (no SVG); ≤ 5 MB in, re-encoded on the device to ≤ 2048 px long side and ≤ 1 MB WebP; EXIF stripped; **automatic face blur on the device** with the Product Check pipeline (BlazeFace short range, tiled), then a preview the uploader must confirm, plus a tick "I have the rights and the consent of anyone shown". Prefer flat lays and illustrations |
| Three languages | Every content item has TH / EN / ZH fields; **publish is blocked** until all three are filled and pass the wording lint (6.4) |
| Phone screens | Single column at 360 px, card lists, hex input + native colour picker, large tap targets, no horizontal scroll |

### 2.2 Data and publishing

- D1 table `content_items(id, product='style', type, key, version, status draft|published, data_json, updated_by,
  updated_at)`; images in R2 under `content/style/`. Staging only; nothing is deployed (CLAUDE.md).
- The public site reads the published JSON through a cached Worker GET and **falls back to a bundled
  `vendor/style/content.json`**, so the page works on GitHub Pages without the backend.
- Every publish bumps a content version; the page shows "ข้อมูลสี ณ วันที่ …".

### 2.3 Style content types

| Type | Fields | Who edits / publishes |
|---|---|---|
| **Palette** (one per season, 12 + 4 parents) | 12–24 swatches: hex (Lab computed), name TH / EN / ZH (our own names, no Pantone names or numbers), role base / accent / metal / away-from-face | editor drafts, admin publishes |
| **Season definition** | name TH / EN / ZH, short description, position on the dimensions (hue, value, chroma, contrast), neighbours | text: admin; **numeric thresholds: owner only**. Saving new thresholds marks the measured numbers (4) "stale" until the fixed sets are re-run; the screen shows the last measured repeatability for that threshold version |
| **Style card** (outfit idea, hairstyle) | title, text, occasion tags, colour tags (palette or day colour), optional image (blurred upload) | editor drafts, admin publishes |
| **Suggestion rules** | "if palette fit < x and day colour level 0, suggest accent in today's colour" etc., as data | admin |
| **Day-colour mapping** | Today hard-coded in `lensiq-luckycolor.js` (`PLANETS`, `FAMILIES`). Moved to a data file `vendor/style/day-colours.json` (planet → hex shades, family names TH / EN / ZH). `LQLucky` keeps its built-in table as the default and fallback (nothing removed). Admin can edit **shades and names**; the **tradition** (Taksa order, bhumi → goal) is owner-only and must keep the existing `LQLucky` tests and the Fortune bans (no "กาลกิณี / avoid" wording) | shades: admin; tradition: owner |
| **Wording lint list** | banned and preferred phrases per language (6) | owner only |

## 3. Method and models

### 3.1 Colour science for undertone (research)

- **Pipeline:** camera sRGB → linearise → white-balance gains from the card (diagonal von Kries in linear RGB, so the
  card becomes neutral) → XYZ (D65) → CIELAB. Reuse `rgbToLab` from `studio-core.js` (moved to a shared
  `lensiq-colour.js`, studio keeps working), add CIEDE2000.
- **Undertone = CIELAB hue angle** `h_ab = atan2(b*, a*)` of skin: higher = more yellow (warm), lower = more red /
  pink (cool). The hue angle is the dimension dermatology and cosmetics research use for the red–yellow axis of skin
  colour, separate from lightness [SECONDARY: Thong, Joniak, Xiang, "Beyond Skin Tone: a multidimensional measure of
  apparent skin color", arXiv 2309.05148 (ICCV 2023); Ly et al., "Research Techniques Made Simple: Cutaneous
  Colorimetry", J Invest Dermatol 140(1), 2020, abstract only].
- **ITA°** `= atan((L* − 50) / b*) · 180/π` (Chardon 1991) measures **lightness / pigmentation**, not undertone, and its
  standard bands ("very light … dark") are exactly the skin-colour categories we must not show. **Use:** internal only,
  to stratify the test sets so we can check results are equally stable across the lightness range (4.3). Never shown,
  never stored. Note ITA and `h_ab` share b*, so they are correlated; season "value" uses L* directly instead.
- **Season dimensions** (computed, then mapped by owner-set thresholds): hue (skin `h_ab`, hair hue), value (skin L*,
  hair L*), chroma (skin C*ab), contrast (ΔL* between hair and skin, eyes if enabled). No published colorimetric
  definition of "undertone" or "season" exists; these are our operational definitions and the UI says so.
- **Known biases** (research): lighting and capture geometry shift a* / b* and L* on real skin; a reference target can
  itself be lit unevenly and then mis-correct the whole image [SECONDARY: PMC10247498, abstract via search]; smartphone
  vs DSLR mean CIEDE2000 of about 7–8 on skin, larger across body sites than across devices [SECONDARY: arXiv
  2512.21988, preprint]; ColorChecker-calibrated phones reached CIEDE2000 3.0–4.4 with a white-standard normalisation
  [SECONDARY: Sensors 2020, PMC7662536, canine skin]. Specific to us: (a) **dynamic range**: a white card can clip while a
  darker face is under-exposed, so darker skin gets noisier hue: we prefer a **grey (18%) card** or a white-grey-black
  card and expose for the face; (b) **optical brighteners** in copy paper fluoresce under daylight and add a blue cast:
  plain paper is accepted but measured as its own test condition; (c) **front-camera beauty filters, HDR and face-priority
  auto exposure**; (d) makeup, tan and redness move `h_ab`.

### 3.2 Colour season systems and how subjective they are

- **4 seasons** (Spring, Summer, Autumn, Winter) from the 1980s consumer books; **12 seasons** split each by its dominant
  dimension (Light / True / Bright Spring; Light / True / Soft Summer; Soft / True / Deep Autumn; Deep / True / Bright
  Winter); 16-season variants; the **Korean "personal colour"** style (Spring warm light / bright, Summer cool light /
  mute, Autumn warm mute / deep, Winter cool bright / deep) is the one most Thai users know.
- **Subjectivity:** no peer-reviewed reliability study of the 12-season system was found. A Chulalongkorn study
  (35 subjects) found **40% agreement** between observers and experimenters for four-season classification and that
  matching Pantone skin-tone samples could not group skin tone; a related thesis found universal colour-harmony models
  agreed with visual judgements only **53%** of the time [SECONDARY: cuir.car.chula.ac.th 123456789/78676 and /81665,
  abstracts]. Skin-tone rating by people in survey research has inter-rater reliability < 0.3 [SECONDARY: Springer
  s12552-020-09282-4]. **Conclusion:** there is no ground truth; season is presented as "closest two", with the
  measured position and the user's own drape choices, and the measurement plan (4) never claims accuracy.
- **Default (S-D1):** 12 seasons grouped under 4 parents, with a Korean-style display name as an alternative label.
  Generic season names only (trade marks: see L-S6).

### 3.3 White-balance step

- Card detection: largest bright, low-chroma, near-uniform quad in the frame (reuse the contrast-quad proposals from
  `lensiq-plate.js`), user can tap the card to confirm.
- Gains: per channel from the median linear RGB of the card's inner 60%; rejected if any channel is clipped, if the
  card covers < 1% of the frame, or if the left–right gradient > 8%.
- Correction is applied per frame to skin, hair and outfit samples only (the preview is not altered).
- The same step is reused for the outfit mode (card in the flat-lay photo, optional but raises confidence).

### 3.4 Outfit and hair colour extraction, harmony

- **Masks:** clothes and hair from MediaPipe Selfie Multiclass (already vendored, `PBHQ.multiclassParse`;
  `LQLucky.clothesMaskFromProb` keeps clothes below the face box). Flat-lay mode: whole frame minus background
  (border-colour model), no person model needed.
- **Dominant colours:** k-means in CIELAB (k = 2–5 by silhouette score), merge clusters with CIEDE2000 < 8, drop shares
  < 5%, ignore skin and hair labels; many small clusters → "ลายพิมพ์ / patterned". Extends `LQLucky.dominantColors`
  (which keeps its family classifier for the lucky-colour page).
- **Hair colour:** median Lab of the hair mask, highlights reported as a second colour.
- **Combination harmony:** a two-colour harmony model in CIELAB re-implemented from the paper (Ou & Luo, "A colour
  harmony model for two-colour combinations", Color Res. Appl. 31(3), 2006; three colours as the sum of pairs)
  [SECONDARY: abstract], with hue-template checks (analogous, complementary, neutrals-plus-one-accent) as readable
  reasons. Harmony is also subjective: it is measured against people's ratings (4, set E), not claimed.
- **Palette fit:** for each outfit colour, CIEDE2000 to the nearest palette swatch, weighted by area, mapped to 0–100
  by owner-set breakpoints.

### 3.5 Models (all on device)

| Component | Use | Size | Licence | Training data | Verdict |
|---|---|---|---|---|---|
| MediaPipe Selfie Multiclass 256 (`selfie-multiclass-256-f16.onnx`, **already vendored**) | hair, face-skin, body-skin, clothes masks | 7.8 MB | Apache-2.0 (model card May 2023) [PRIMARY: `vendor/models/SELFIE-MULTICLASS-LICENSE.txt`] | not disclosed in detail | **OK-ATTR**, out of scope per card: surveillance, identity recognition |
| MediaPipe **Face Landmarker** (`face_landmarker.task`: face detector + Face Mesh V2 + blendshapes) | cheek / forehead / chin patches, iris for experimental eye colour; **blendshapes off** | about 3.6 MB [UNVERIFIED, check on download] | Apache-2.0 (Face Mesh V2 card, 2022) [SECONDARY: mirror of the Google card; confirm on `storage.googleapis.com/mediapipe-assets`] | not disclosed; fairness evaluated on 18,199 samples with Monk skin-tone labels and 17 regions; skin tones 1–2 are about 36% of the eval data [SECONDARY] | **OK-ATTR** (new file, new row in THIRD_PARTY.md) |
| MediaPipe Tasks Vision runtime (`vendor/mediapipe/vision_bundle.mjs`, **already vendored**) | runs the landmarker (CPU delegate works without WebGL) | present | Apache-2.0 | n/a | OK-ATTR |
| BlazeFace short range (`face-gate/`, **already vendored**) | admin upload face blur; "face found" check | 0.22 MiB | Apache-2.0 | n/a | OK-ATTR |
| MediaPipe Hair Segmenter (`hair_segmentation.tflite`, 512×512, 2 classes) | **optional**, only if the multiclass hair mask fails the S2 measurement | to check | Apache-2.0 (model card; cite Tkachenka et al., CVPR-W 2019) [SECONDARY: mirror] | not disclosed; eval on 17 sub-regions | OK-ATTR if added |
| ONNX Runtime Web (vendored) | multiclass | present | MIT | n/a | OK |
| **Not used** | face-api age / gender (UTKFace, non-commercial) and expression (data unclear): not loaded on this page in any mode; face-api 68 landmarks (F5 VERIFY): replaced here by MediaPipe; BiSeNet faceparse (CelebAMask-HQ, non-commercial); any model trained on FFHQ, CelebA, UTKFace, Fitzpatrick17k; any "beauty" or attractiveness model or dataset (e.g. SCUT-FBP5500) | | | | rejected |

### 3.6 Public datasets (checked for commercial-OK undertone or season labels)

| Dataset | What it has | Licence / terms | Verdict |
|---|---|---|---|
| Google **MST-E** (Monk Skin Tone Examples) | 1,515 images + 31 videos, 19 subjects, many lighting conditions, MST labels | images © TONL, released "for research or human-annotator-training purposes only", not for training ML models [SECONDARY: Google Research blog 2023] | **Not used** (commercial product evaluation not covered). Ask Google / TONL only if needed (L-S5) |
| Sony **FHIBE** | consented, globally diverse people images with annotations | custom terms: may be used to "research or evaluate bias in AI systems" for commercial and non-commercial purposes; training only for bias detection / mitigation; deletion on withdrawal [SECONDARY: fairnessbenchmark.ai.sony terms excerpt] | **Optional**, only to check that landmark / mask coverage of skin patches is equal across groups (no undertone labels). Counsel confirms (L-S5) |
| Chicago Face DB, FFHQ, CelebA / CelebAMask-HQ, UTKFace, Fitzpatrick17k, SCUT-FBP | faces, some with skin labels | non-commercial or attractiveness labels | **Not used** |
| X-Rite / Calibrite ColorChecker Classic reference values | 24 patches, published L*a*b* (D50) | published by the maker for the physical target | Used as **test reference** for set C (L-S6 confirms reuse of the table in test code) |

**Finding:** no public dataset with commercial-OK terms carries undertone or season labels. We design an
owner-collected, consented set (4.1).

## 4. Measurement plan (fixed test sets, written before building)

Source label for every number: **field (owner-collected, consented)** or **synthetic**. No number is ever called
"accuracy" against undertone or season truth, because that truth does not exist.

### 4.1 Fixed test sets (frozen in S0; dev / held-out split by person, held-out never used for tuning)

| Set | Content | Size | Use |
|---|---|---|---|
| **A. Repeatability** | consented adults; 2 phones (1 iPhone, 1 mid-range Android) × 4 lights (window daylight; warm 2700–3000 K bulb; cool 5000–6500 K office light; mixed / shade) × 3 captures, card in frame | ≥ 30 people (≥ 720 captures); recruited to span the measured L* range in three equal tertiles (no ethnicity collected) | same-person stability after the card step |
| **B. Analyst agreement** | consented adults draped in person by **two** professional colour analysts working independently and blind to the app; record undertone (5 bands), 4-season, 12-season, top-2 | ≥ 40 people (may overlap A) | app–analyst vs analyst–analyst agreement |
| **C. Calibration** | ColorChecker Classic, no people; 2 phones × 4 lights × 5 shots, white card, grey card and copy paper each | 120 images | colour error after correction |
| **D. Outfit colours** | 200 photos: 120 flat lay, 80 worn (face cropped out before labelling); reference colour per garment by two people with a sampling tool on card-corrected images | 200 photos, ≈ 450 garments | dominant-colour extraction |
| **E. Harmony ratings** | 100 colour combinations (rendered swatches, no people), each rated 1–5 by ≥ 7 raters | 100 × 7 | harmony score vs people |
| **S. Synthetic (CI)** | ColorChecker Lab values rendered under simulated illuminants (A, D50, D65, F2, F11) with noise and clipping; CIEDE2000 test pairs (Sharma, Wu, Dalal 2005); scripted masks as in `luckycolor.js ?fakeseg` | generated | unit and e2e tests, **no images of people in the repo** |

Photos stay outside the repo (`~/LENSIQ-field/style/`, encrypted disk), deleted per the consent form; never used for
training.

### 4.2 Metrics and proposed targets (owner to approve, S-D8)

| Metric | Set | Proposed target | Note |
|---|---|---|---|
| Median CIEDE2000 over 24 patches, after card correction (and before, as baseline) | C | ≤ 4.0 median, ≤ 6.0 at the 90th percentile, per light and phone | copy paper reported separately |
| Within-person SD of skin `h_ab` across 4 lights × 2 phones | A | ≤ 2.0° (and L* SD ≤ 2.0) | before vs after card |
| Same undertone band in all captures of a person | A | ≥ 80% of people | "not sure" counts as a miss |
| Season top-1 the same across lights / top-2 contains it | A | ≥ 70% / ≥ 90% | |
| **Gap between L* tertiles** on each A metric | A | ≤ 10 percentage points | if larger: widen "not sure" for all, never ship a better result for one group only |
| App–analyst agreement vs analyst–analyst agreement (Cohen's κ for undertone, % for 4-season, top-2 hit for 12-season) | B | app within 10 points of the analysts' own agreement | reported as agreement, never as accuracy |
| Dominant-colour CIEDE2000 to the reference; colour-family agreement | D | median ≤ 6; family ≥ 85% | flat lay and worn separately |
| Spearman ρ between harmony score and mean rating | E | ≥ 0.5 | |
| Time to result on a mid-range Android | A | ≤ 3 s after capture | |

Every round: numbers per condition (phone × light × tertile), Wilson 95% intervals, an **independent reviewer agent
re-measures** the held-out split.

### 4.3 What the page may claim

Only the S3 claim format (`docs/ACCURACY-CLAIMS.md`): for example "ผลซ้ำเดิมใต้แสง 4 แบบ: 84% · n = 30 คน · ที่มา:
หน้างานจริง (อาสาสมัครที่ยินยอม)" and "ตรงกับนักวิเคราะห์สี: κ = … (นักวิเคราะห์ 2 คนตรงกันเอง κ = …)". Never
"แม่นยำ 95%".

## 5. Privacy (PDPA)

- **On device only.** Frames live in memory while the camera runs; nothing is uploaded, stored, logged or used for
  training. No network call is needed (content JSON is cached or bundled).
- **Stored by default: nothing.** Opt-in "remember my palette" stores derived colours only (season ids, swatch hex,
  undertone band, date) in this browser; a "ลบ" button clears it. The lucky-colour prefs (`lqlc-prefs`) stay as they are.
- **Analytics:** `style_start` / `style_complete` events only (if the user accepted analytics); no season, undertone or
  colour values.
- **Is biometric data (s.26) in scope?** Our view for counsel (L-S1): landmarks are computed transiently to place
  sampling patches, are not a template, are not used to identify or verify anyone and are discarded, so no biometric
  data under s.26 is created (same reasoning as the lucky-colour note in `docs/PDPA-NOTES-FOR-COUNSEL.md`). The live face
  image is personal data (s.6) but never leaves the user's device; whether LENSIQ is a controller at all for purely local
  processing is a counsel question.
- **Second risk:** skin colour or undertone could be argued to reveal **racial or ethnic origin** (s.26 sensitive data).
  Mitigations: no ethnicity output, no skin-tone category, no server storage, palette saving is the user's own choice on
  their own device, analytics carry no result (L-S2).
- **Consented test sets (4.1):** explicit written consent TH / EN / ZH (purpose, face photos, analysts see them, retention
  ≤ 12 months after the eval, withdrawal at any time, no training, no publication), adults only, analyst contract with
  confidentiality; adds a row to `docs/pdpa/ROPA.md` and a DPIA delta (L-S3).
- **Admin uploads:** auto blur misses faces (Product Check measured 27.6% of real faces left unblurred held-out, 34.7% on a
  fresh set, mostly small faces, `docs/product-check/FACE-BLUR-RESULTS.md`), so the preview + rights / consent tick is
  mandatory and flat lays are preferred (L-S8, links L39).
- **Shop kiosk mode** (S-D7): the page clears all state after each person and after 60 s idle; camera notice
  (`camera-notice.html`) applies (L-S10).
- Notes to add to `docs/PDPA-NOTES-FOR-COUNSEL.md` in S0 (not done in this design).

## 6. Wording rules (TH / EN / ZH)

### 6.1 Principles

Talk about **colours** and how colours go together. The person is never the subject of a judgement. Results are
"closest", "suggested", "your choice"; never facts about the person. Positive framing only (no "avoid" lists; same rule
as the lucky-colour page).

### 6.2 Banned (lint list, blocks admin publish and fails a unit test on page dictionaries)

| Topic | TH | EN | ZH |
|---|---|---|---|
| Looks | สวย / ไม่สวย, หน้าตาดี, ดูดี (about the person), เสริมความงาม, คะแนนความงาม | beautiful, pretty, ugly, attractive, flattering on you, beauty score | 美 / 丑 (about the person), 颜值, 好看度, 变美 |
| Skin lightness | ผิวขาว, ผิวคล้ำ, ผิวดำ, ผิวเหลือง, ผิวดูสว่าง, หน้าใส, ทำให้ดูขาวขึ้น, หน้าหมอง | fair skin, dark skin, light-skinned, whitening, brightening, makes you look lighter, dull skin | 白皙, 皮肤黑, 黄皮, 显白, 美白, 提亮肤色, 显黑, 暗沉 |
| Body | ผอม, อ้วน, หุ่นดี, ดูเพรียว, พรางหุ่น | slim, slimming, fat, figure-flattering, hide your figure | 显瘦, 胖, 身材好, 遮肉 |
| Age | ดูแก่, ดูเด็ก, อ่อนกว่าวัย | look older, look younger, youthful | 显老, 显年轻, 减龄 |
| Ethnicity | เชื้อชาติ, ผิวแบบคนเอเชีย / ฝรั่ง / แขก, ผิวสี | ethnicity, race, Asian skin, Caucasian, skin of colour | 种族, 亚洲人肤色, 白人, 有色人种 |
| Fortune bans (shared) | กาลกิณี, สีอัปมงคล, ห้ามใส่ | unlucky colour, never wear | 不吉利的颜色, 忌穿 |

### 6.3 Preferred phrases

| Meaning | TH | EN | ZH |
|---|---|---|---|
| Undertone | อันเดอร์โทนอุ่น / กลาง / เย็น | warm / neutral / cool undertone | 暖调 / 中性调 / 冷调 |
| Season result | ใกล้เคียงที่สุด: … | closest season: … | 最接近的季型：… |
| Palette | สีที่กลมกลืนกับโทนสีของคุณ | colours that harmonise with your colouring | 与您的色彩特征协调的颜色 |
| Away from face | สีที่ใช้ห่างจากใบหน้าได้ดี (กางเกง กระโปรง รองเท้า) | colours that work best away from the face | 适合用在远离脸部位置的颜色 |
| Score | คะแนนความกลมกลืนของสี | colour harmony score | 色彩协调度 |
| Uncertain | ยังสรุปไม่ได้ ลองใหม่ใต้แสงธรรมชาติ | not sure yet: try again in daylight | 暂无法判断，请在自然光下重试 |
| Disclaimer (every result) | ระบบซีซันสีเป็นความชอบเชิงอัตวิสัย ผลนี้เป็นคำแนะนำด้านสี ไม่ใช่การประเมินตัวคุณ | Colour seasons are a matter of taste. This is a colour suggestion, not an assessment of you. | 色彩季型属于主观偏好。本结果仅为配色建议，并非对您本人的评价。 |

### 6.4 Lint

`tests/unit/style-wording.test.js` scans `i18n/*-style.js`, the TH strings in `style.js` and bundled
`vendor/style/content.json`; the admin publish endpoint runs the same list server-side. ZH strings are reviewed by a
native speaker before release (owner input).

## 7. Effort per phase

Each phase: fixed test set before building, real numbers per condition, independent reviewer, report in the house
format, then wait for approval. CI green before the next phase.

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| **S0** | Freeze test sets and protocols (4.1); consent form TH / EN / ZH; counsel notes and `L-S` rows; wording lint list; synthetic CI fixtures; owner decisions S-D1–D8 | S (≈ 1 wk) | owner approval |
| **S1** | `lensiq-colour.js`: linear sRGB, XYZ, Lab, CIEDE2000, card detection and gains, quality checks; ColorChecker eval tool; **measure set C** | M (≈ 1.5 wk) | S0, ColorChecker |
| **S2** | Vendor Face Landmarker (blendshapes off); skin / hair patches, robust stats, undertone and dimensions; **set A dev** repeatability; hair segmenter only if needed | M (≈ 2 wk) | S1, volunteers |
| **S3** | Season mapping, virtual drapes, palette card, `style.html` TH / EN / ZH, save opt-in; **set A held-out and set B** | M (≈ 2 wk) | S2, analysts |
| **S4** | Daily outfit / hair match: Lab k-means, flat-lay mode, harmony model, `LQLucky` link, suggestions; **sets D, E** | M (≈ 1.5–2 wk) | S1 |
| **S5** | Admin Style section (2.3), day-colour data file with `LQLucky` fallback, lint on publish, D1 migration and Worker endpoints (staging, not deployed) | M (≈ 1.5–2 wk); **L (+2 wk)** if the shared RBAC / audit / upload shell is not yet built | shared admin |
| **S6** | Independent re-measure of all held-out sets; claims register rows; CTO-BRIEF, FIELD-PILOT, PAGE-STATUS ("experimental"); credits and notices | S (≈ 1 wk) | S1–S5 |
| **Total** | | **≈ 9–12 weeks** (+2 without the shared admin) | |

## 8. Risks

| # | Risk | L × S | Mitigation |
|---|---|---|---|
| R1 | No ground truth; analysts disagree (40% four-season agreement in the Thai study); users read a season as a fact | H × M | top-2 and "not sure"; drapes keep the user in charge; agreement reported against the analysts' own agreement; disclaimer on every result |
| R2 | Phone auto white balance, auto exposure, HDR, beauty filters undo the card correction | H × M | card in the same frame per frame; lock AWB where supported; quality gates; per-phone numbers |
| R3 | **Unequal stability across skin lightness** (dynamic range, under-exposure, sensor noise on darker skin; clipped white card) | M × H | grey card, expose for the face, tertile gap target ≤ 10 pts, widen "not sure" for everyone rather than ship unequal quality; optional FHIBE check of patch coverage |
| R4 | **Colourism / whitening norms** in Thai and Chinese beauty wording leak into content ("ผิวดูสว่าง", "显白"); reputational and possibly consumer-advertising risk | M × H | banned list enforced in tests and on admin publish; owner-only lint list; native ZH review |
| R5 | Skin colour treated as a proxy for ethnic origin (s.26) | L × H | nothing stored or sent by default; no skin-tone categories; counsel L-S2 |
| R6 | Makeup, tan, redness, skin conditions skew hue; risk of implied health comment | M × M | makeup toggle, patch selection, confidence drop; never name a condition |
| R7 | Admin face blur misses faces (≈ 28–35% in Product Check tests) | M × M | preview + rights / consent tick; flat lays preferred; editor cannot publish |
| R8 | Trade marks and content copyright (season system brand names, Pantone names, hairstyle photos) | M × M | generic names, own colour names, own or licensed images only (L-S6, L-S8) |
| R9 | Performance on low-end phones (7.8 MB multiclass + ≈ 3.6 MB landmarker) | M × L | lazy load, cache via service worker, flat-lay mode needs no person model |
| R10 | Scope creep into face-shape scoring, makeup or product recommendations | M × M | phase 1 excludes them (S-D3, S-D4); any change needs owner approval |
| R11 | Recruiting ≥ 40 volunteers across the lightness range and two analysts takes longer than the build | M × M | start recruitment in S0; S1 and S4 need no people |
| R12 | Colour-vision deficiency: users cannot judge swatches | L × L | every swatch has a name and hex; harmony reasons in text |

## 9. What the owner must provide

### 9.1 Items and people

1. **Cards:** a neutral white-balance card set (white / 18% grey / black), about ฿300–800 [UNVERIFIED price].
2. **ColorChecker Classic** (24 patch, X-Rite / Calibrite), about US$100–130 [UNVERIFIED price].
3. **Two test phones:** one recent iPhone, one mid-range Android (Chrome).
4. **Lights:** warm 2700–3000 K bulb, cool 6500 K bulb or office tube, plus window daylight and a mixed / shade spot.
5. **Volunteers:** ≥ 40 consenting adults (≥ 30 for set A), spread across the full range of skin lightness; about
   30–45 minutes each; small thank-you payment if the owner chooses.
6. **Two professional colour analysts**, paid per session, blind to the app, working independently (set B); one also
   reviews the season palettes in admin.
7. **Raters for set E:** ≥ 7 people, 20 minutes each, no photos taken.
8. **Native Chinese reviewer** for the ZH strings and banned list.
9. **Counsel** for rows L-S1–L-S10 before charging.

### 9.2 Decisions (S-D1 to S-D8)

| # | Decision | Recommendation |
|---|---|---|
| S-D1 | Season system | 12 seasons under 4 parents, Korean-style label as an alternative name |
| S-D2 | Virtual drape step | on by default, skippable |
| S-D3 | Face-shape analysis for hairstyles | **no** (colour and occasion only) |
| S-D4 | Makeup accent colours and gendered style filters | off in phase 1; if added: colours only, filter chosen by the user |
| S-D5 | Category placement | 7 Studio & Media, also 4 Marketing / Retail; link from lucky colour |
| S-D6 | "Remember my palette" | opt-in, device only; account sync later only with org / member consent |
| S-D7 | Shop kiosk mode | yes, auto-clear per person |
| S-D8 | Measurement targets in 4.2 | approve or change before S0 freezes them |

## 10. Proposed legal rows and credits

### 10.1 Rows for `docs/CTO-BRIEF.md` §8 (to add in S0; not added by this design)

| # | Item | Why | Where in code / docs | Status | Added |
|---|---|---|---|---|---|
| L-S1 | On-device face processing for colour measurement | Are transient landmarks and skin patches "biometric data" (s.26)? Is LENSIQ a controller when nothing leaves the user's device? | `style.js`, `lensiq-style.js`; STYLE-DESIGN §5 | open | 2026-11-10 |
| L-S2 | Skin colour / undertone as a proxy for racial or ethnic origin | s.26 sensitive data risk for the measurement, the saved palette and any analytics; is "device only, opt-in save, no result in analytics" enough? | STYLE-DESIGN §1.3, §5 | open | 2026-11-10 |
| L-S3 | Consented test sets (face photos of volunteers, analysts) | Explicit consent wording TH / EN / ZH, retention ≤ 12 months, withdrawal, analyst confidentiality contract, ROPA and DPIA delta | STYLE-DESIGN §4.1, §5; consent form (S0) | open | 2026-11-10 |
| L-S4 | MediaPipe Face Landmarker (+ optional Hair Segmenter) | Apache-2.0 per model cards; training data not disclosed (same as other MediaPipe rows); cards seen via a mirror, confirm on Google storage; follow the out-of-scope notes | `vendor/models/` (S2); THIRD_PARTY.md new rows | open | 2026-11-10 |
| L-S5 | Public face datasets | MST-E (TONL, research / annotator training only): not used; FHIBE (bias evaluation allowed commercially): confirm use limited to patch-coverage checks; FFHQ, CelebA, UTKFace, Chicago, Fitzpatrick17k, SCUT-FBP: not used | STYLE-DESIGN §3.6 | open | 2026-11-10 |
| L-S6 | Trade marks and reference data | Season-system brand names, Pantone names and numbers, "ColorChecker" mark and reuse of its published reference values in tests | STYLE-DESIGN §3.2, §3.6; admin palette names | open | 2026-11-10 |
| L-S7 | Claims and wording | Consumer-protection advertising of "personal colour"; claims limited to repeatability and agreement; banned colourism wording | STYLE-DESIGN §4.3, §6 | open | 2026-11-10 |
| L-S8 | Admin image uploads of people | Rights and model consent; auto blur misses faces (links L39); hairstyle photo copyright | STYLE-DESIGN §2.1, §5 | open | 2026-11-10 |
| L-S9 | Minors on the public camera page | No age inference is possible or wanted; is a notice "for users 20+ or with a parent" needed for a page that stores nothing? | `style.html`; STYLE-DESIGN §5 | open | 2026-11-10 |
| L-S10 | Shop kiosk deployment | Camera in a customer-facing shop: signage, no retention, staff device rules | STYLE-DESIGN §5; `camera-notice.html` | open | 2026-11-10 |

### 10.2 Credits (for `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt`, `about.html`)

- Google MediaPipe Tasks Vision runtime, Selfie Multiclass 256, BlazeFace short range (existing rows), **Face Landmarker /
  Face Mesh V2** (new), Hair Segmenter (only if added; cite Tkachenka et al., "Real-time Hair Segmentation and
  Recoloring on Mobile GPUs", CVPR Workshops 2019). Apache-2.0; keep licence and NOTICE.
- Methods re-implemented from papers (no code copied): CIEDE2000 (Sharma, Wu, Dalal, Color Res. Appl. 30(1), 2005, and
  its published test data); two-colour harmony model (Ou & Luo, Color Res. Appl. 31(3), 2006); ITA° (Chardon et al.,
  Int J Cosmet Sci, 1991); von Kries chromatic adaptation; gray world (already credited in `studio-core.js`).
- ColorChecker Classic reference values (X-Rite / Calibrite), used in test code only, subject to L-S6.
- Research cited in this design: Thong, Joniak, Xiang 2023 (arXiv 2309.05148); Ly et al. 2020 (J Invest Dermatol
  140(1)); Chulalongkorn University repository items 123456789/78676 and /81665; Google MST-E blog (2023); Sony FHIBE
  terms (2025); smartphone colorimetry studies PMC7662536, PMC10247498, arXiv 2512.21988.

# LENSIQ — CTO brief

As of 2026-11-09 (round 16 complete). Round 15 shipped in two commits: Gate `70508bc` (CI green on Linux, live) and crowd/docs `41dc0b7`. Round 16 shipped as: customer switch `d039058`; Gate plate check + field tools `d049dfd`; claims, crowd test, org design, pilot kits `34e14b3`; Wilson rule `77b555a`; multi-line CSP `7c47eba`; then the category packaging and the pricing draft after the owner approved them on 2026-11-09. Accuracy sources are labelled synthetic, public dataset or field.
**Round 17 = Product Check + AI Gateway, in progress: P0–P7 done; face blur built; P8 waiting on the owner's OpenRouter credit** (design approved 2026-11-09; §5 "Round 17", legal list §8).
Org accounts P1–P3 follow after Product Check is complete.
Round 17 P5 "AI Gateway core" (`13814a8`, independent review fixes applied): every cloud AI call goes through `backend/src/ai/` (`POST /v1/ai/:feature`; fortune moved onto it as `fortune_reword` with its existing tests unchanged), with a provider allowlist, a monthly budget reserved per call, the §10.3 fallback policy, JSON-schema checks, content-free logs, an admin "AI Gateway" tab and the consent helper `lensiq-ai.js`. Only the Anthropic adapter exists; the others are P6. See `docs/AI-GATEWAY.md`.
Sources: the repo, `ACCURACY.md`, `LICENSES/THIRD_PARTY.md`, `docs/*.md` and the GitHub Actions history. Anything that cannot be found there is marked "unknown" or "not measured".

## 1. System map

**Status legend:**
- **demo:** works end to end on the public site with demo or synthetic data, but has never run at a customer site.
- **experimental:** works, but has a known accuracy gap or is labelled preliminary.
- **scaffold:** code and tests exist, but it is not deployed.

No module is production-ready. None has completed a field pilot, and the backend has never been deployed.

| Module | What it does | Status | Main files |
|---|---|---|---|
| Exam (lab, dashboard; hall = experimental) | Flags objective proctoring signals: face count, head turn, objects, frozen feed, browser events. Evidence clips are opt-in, encrypted and auto-deleted. No emotion inference. | demo | `exam*.html`, `exam-lab.js`, `exam-hall.js`, `exam-dashboard.js`, `lensiq-exam.js`, `lensiq-exam-clip.js`, `docs/EXAM.md` |
| Gate: parking / village | Thai plate reader (finder + PP-OCRv5 Thai). A guard confirms every read. Parking fees, PromptPay QR, visitor passes. | experimental (synthetic accuracy only) | `gate*.html`, `parking.*`, `village.*`, `gate-kit.js`, `gate-rules.js`, `lensiq-plate.js`, `lensiq-promptpay.js`, `docs/GATE.md` |
| Crowd | Counts people in view and in a drawn zone. Density heatmap, peak hours, entry/exit line, marketing CSV. | experimental (accuracy preliminary; human count pending) | `crowd.*`, `lensiq-crowd.js`, `lensiq-zonecam.js`, `docs/CROWD-ACCURACY.md` |
| Medicine checker | OCR of label and registration-number candidates, Pillbox imprint candidates (US, 2020), opt-in openFDA/RxNav text lookups, verbatim sourced text only. Not a definitive pill ID. | experimental | `medicine.*`, `lensiq-med.js`, `vendor/pillbox/`, `backend/src/med.js`, `docs/MEDICINE.md` |
| Case review | Structured notes and timeline for HR/incident cases. No truthfulness or lie judgement. | demo | `case-review.*`, `lensiq-case.js` |
| Answer-sheet grader (OMR) | Printable MCQ sheets, camera scan, bubble detection, item analysis, CSV. | demo | `omr.*`, `lensiq-omr.js` |
| HR attendance | Face, PIN or QR time clock. Shifts, OT, leave, monthly summary. Readiness matrix in docs. | demo | `attendance*.js`, `lensiq-timeclock.js`, `lensiq-facevault.js`, `docs/ATTENDANCE-READINESS.md` |
| HR interview kit, team icebreaker | Candidate-first interview metrics; face-based team game. | demo | `interview*`, `hr.html`, `teamface.*` |
| Fortune suite (≈15 pages) | Face/palm reading, horoscope, tarot, I Ching, BaZi, Taksa, Lek7, numbers, feng shui, dream, zodiac, life graph. Local composer with an optional AI rewording. Hard-ban safety filter and crisis net. | demo (entertainment) | `fortune-ai.js`, `fortune-kit.js`, `*-kb.js`, page files |
| Auspicious-date planner | Good-day suggestions with an ICS export. | demo | `planner.*`, `lensiq-planner.js` |
| Lucky-colour mirror | Camera reads the dominant clothing colour and compares it with the Thai day colours. | demo | `luckycolor.*`, `lensiq-luckycolor.js` |
| Studio | Portrait outfit change (MediaPipe multiclass parser + MODNet). | demo | `studio*.js`, `studio-qa.js` |
| Photo booth / booth | ID photo with outfit; event booth with visitor count (count-only by default). | demo | `photobooth*.js`, `booth.*` |
| Store / insights / customers | People detection (YOLOX-Nano), tracking, line counts, dashboard statistics, opt-in returning-customer recognition. | demo | `store.js`, `lensiq-detect.js`, `lensiq-track.js`, `insights-*.js`, `customers.*` |
| Signage, neuro, creative | Audience estimates (age/gender opt-in), expression demo, predicted-attention map. | demo (licence flags F5) | `signage.*`, `neuro.*`, `creative*` |
| Cameras: QC, driver, checkout | Bottle inspection, eye-closure alert, barcode checkout. | demo (synthetic or public benchmarks) | `qc.js`, `driver.js`, `checkout.js` |
| Zone quick wins | Queue, tables, after-hours, bays. | demo | `queue.js`, `tables.js`, `afterhours.js`, `bays.js`, `lensiq-zones.js` |
| Converter | PDF → DOCX (browser pdf.js/docx, or server MIT engine). | demo | `converter.*`, `pdfconvert.py` |
| Solutions catalogue, one-pagers | Sector catalogue and sales sheets. | content | `solutions.*`, `docs/ONE-PAGER-*.md` |
| Members, pricing, checkout, admin | Google sign-in, freemium tiers, Opn payments, receipts and refunds, admin. All off by default. | scaffold | `account.*`, `pricing.*`, `admin.*`, `lensiq-member.js`, `backend/src/*` |
| Backend API | Cloudflare Worker + D1: fortune AI relay, analytics allowlist, billing, members, leads, retention crons, `/api/med/*`. | scaffold, never deployed | `backend/src/worker.js`, `backend/migrations/0001–0009` |
| LAN server | Optional Flask server: numbers-only hub, PDF convert, opt-in AI and try-on relays. | demo | `server.py`, `tryon.py` |

### Architecture

| Layer | What it uses |
|---|---|
| Frontend | Static multi-page site. Vanilla HTML/CSS and classic-script JS, no build step or framework. TH by default, plus EN/ZH dictionaries (`i18n/`). CSP meta on every page; service worker caches `vendor/`. |
| Hosting | GitHub Pages, deployed by Actions only after CI is green. `tools/build-site.mjs` publishes an allowlist of tracked files (no `tests/`, no `docs/`). |
| Backend | Cloudflare Worker (`lensiq-api`) with a D1 database and two crons. Written but not deployed. The optional Flask `server.py` serves LAN use. |
| Database | D1 (SQLite) for members, billing, leads and analytics aggregates. On the device: localStorage, sessionStorage and IndexedDB. |
| Auth | Google sign-in for members (off by default) and Cloudflare Turnstile on AI and checkout. No staff or organisation accounts. |
| Payments | Opn (Omise) checkout scaffold, with Opn KYC pending. Gate uses a static PromptPay QR, with no automatic payment confirmation. |
| Model runtimes | All vision runs in the browser. onnxruntime-web 1.20.1 (WASM) runs YOLOX, MODNet, multiclass, PP-OCR and LPD-YuNet. TF.js 4.7 (inside face-api.js) runs the face and hand models. MediaPipe Tasks handles the selfie segmenter and hand landmarker. No GPU server. |

## 2. AI/CV models in use

| Model | Task | Size | Licence | Source | Runs | Measured accuracy |
|---|---|---|---|---|---|---|
| YOLOX-Nano 416 | person detection | 3.7 MB | Apache-2.0 | github.com/Megvii-BaseDetection/YOLOX | browser, ORT WASM | AP@0.5: 88.6% PETS09 (795 frames), 85.9% TUD, 24.4/39.0/65.0% MOT17-02/04/09 (held out) |
| COCO-SSD lite | person fallback | 18 MB | Apache-2.0 | tfjs-models coco-ssd | browser, TF.js | AP@0.5 69.1% PETS / 81.4% TUD |
| face-api tiny detector + 68 landmarks | face find and landmarks | 0.19 + 0.35 MB | MIT weights (training data academic) | vladmandic/face-api | browser, TF.js | not measured separately |
| face-api recognition (dlib ResNet) | 1:1 and 1:N face match | 6.1 MB | MIT port / CC0 weights (training data research) | as above | browser | TAR 86.5% at FAR 0.09% (thr 0.55). 1:N with 100 enrolled: 85.1% recognised, 0.79% strangers accepted (ACCURACY §2) |
| face-api age/gender | signage estimate (opt-in, **research demo only** since R16) | 0.42 MB | MIT weights; **UTKFace non-commercial** | as above | browser | ACCURACY §3 |
| face-api expression | neuro/booth/signage/photobooth (**research demo only** since R16) | 0.32 MB | MIT weights; data licence unclear | as above | browser | ACCURACY §6 |
| MediaPipe Hands (TF.js) + hand_landmarker | palm, kiosk | 3.9 + 7.5 MB | Apache-2.0 | google-ai-edge/mediapipe | browser | ACCURACY §4 |
| Selfie segmenter | booth background | 0.24 MB | Apache-2.0 | MediaPipe | browser | not measured |
| Selfie Multiclass 256 | studio parsing | 7.8 MB | Apache-2.0 | MediaPipe | browser, ORT | ACCURACY §11 |
| MODNet | matting | 25 MB | Apache-2.0 (earlier releases CC BY-NC-SA; shipped file is byte-identical to Xenova/modnet `onnx/model.onnx`, published Feb 2024, after the Jan 2022 switch to Apache-2.0; training-data question in `docs/LICENCE-REQUESTS.md` letter L) | ZHKKKe/MODNet via Xenova | browser, ORT | ACCURACY §11 |
| MobileNetV2 | checkout embedding, re-ID | 13 MB | Apache-2.0 (ImageNet) | tfjs-models | browser | not measured (§9) |
| PP-OCRv5 Thai rec (mobile) | plate and label text | 7.5 MB | Apache-2.0 | PaddleOCR | browser, ORT | Plates (synthetic, held out): exact read in 1 frame 81/140 (58%), unchanged by the R16 plate check. **Public photos (R16, 51 Wikimedia Commons photos):** exact automatic read 7/22 (32%; 7/23 = 30% counting held-out photo w07, whose label was set to "unsure" before any held-out run); motorcycle plates 0/6; 4/15 exact even when the guard taps the plate. **Field:** not measured |
| LPD-YuNet (R15) | plate proposal assist | 4.1 MB | Apache-2.0 | OpenCV Zoo | browser, ORT | **Synthetic:** finder + LPD-YuNet found 136/140 plates on the held-out seed, 18–20 of 20 in each colour, motorcycle and night category. **Public photos (R16, 51 photos):** the top box is the plate on 13/32 (41%). The top box scored high enough to start an auto-read on 18 of 19 plate-less photos; the R16 plate check (`LQPlate.plateGuard`) is what stops them: photos without a plate read automatically 3/19 → 0/19 (held-out 1/9 → 0/9; 95% interval 0–17% for 0/19, 0–30% for 0/9). **Field:** not measured. |
| Driver eye classifier (ours) | eye closed/open | < 2 KB | MIT; trained on ODC-BY data | `driver.js` | browser | ACCURACY §5 |
| Creative attention (ours) | saliency | < 1 KB | MIT | `creative-core.js` | browser | NSS 1.59 held out, MIT1003 (ACCURACY §10) |
| Claude API (optional) | rewording fortune facts | — | Anthropic commercial terms | — | server relay, consent required | not applicable |

### Licence flags that block or cloud commercial sale

- **Blocked:**
  - `faceparse-bisenet-r18-q8.onnx` (CelebAMask-HQ, non-commercial). It is git-ignored, refused by the build and off by default.
  - Open virtual try-on weights (CC BY-NC-SA). Try-on is off unless the operator attests to a commercial licence.
  - YOLOv9 weights from open-image-models (GPL-derived). Benchmark use only; never shipped. In R16 the `yolo-v9-t-384-license-plates-end2end.onnx` model (github.com/ankandrew/open-image-models; code MIT, weights licence not stated, YOLOv9 reference code GPL-3.0) was run offline, outside the repo, **only to draw candidate boxes for labelling** the real-photo set (`docs/GATE.md` §3c). Nothing from it is in the repo (`git ls-files` checked). **Owner decision 2026-11-10: not used anywhere, not even for local demos (L41); the 51-photo boxes are re-checked without it before the Thai YOLOX-nano model is measured.**
- **Unresolved, needs a legal opinion:**
  - The face-api models (F5/F6), whose training data is academic. Age/gender is trained on UTKFace, which is non-commercial.
  - These models are core to attendance, customers, booth and exam.
  - **R16:** customer mode is now the default on every host (public site included): age/gender and expression are never
    loaded unless a device switches on the labelled "Research demo" toggle; `LENSIQ_RESEARCH_DEMO = false` locks it off
    for a customer install. Detector, landmarks and recognition still run and still need the opinion.
    Open: `?faceparse=1` (BiSeNet test link in `studio.js` / `photobooth-hq.js`) is not under the lock yet; the model file
    is not in git, so the public site cannot load it.
- **Opt-in copyleft:** PyMuPDF (AGPL) and pdf2docx (GPL). Neither is installed by default.

## 3. Quality status

### Tests

| Type | Count |
|---|---|
| Unit (node:test) | 1,121 tests, all passing (R16 working tree; backend subset 135/135). R17 P5 working tree on top of P3 (`7a39bc3`): 1,223 tests, all passing (backend subset 187/187; 58 new P5 tests incl. 11 for the independent-review fixes). |
| e2e (headless Chrome) | 437 tests, all passing (macOS, on the Gate-only commit). CI on Linux passed for `70508bc`. |
| Integration | 1 file |
| Python unittest | 4 files |
| Gates | lint, typecheck, CSP, ZH/EN coverage, site check, and a mobile audit at 320/360/390 px |

### CI

| Commit | CI result | Notes |
|---|---|---|
| `70508bc` | green | Last green commit. Round 15 Gate is live on Pages. Earlier green: `aaad9bf`. |
| `7fcbbd2` | red | Medicine OCR misread on Linux, which has no Arial. |
| `8b9d6aa` | red, 1/431 | Same cause as `f478547`. |
| `f478547` | red, 2/432 | On Linux the auto-detected box for "1กข 2345" cut off the leading "1". **Fixed in `70508bc`:** the box grows to the plate edge, and a "1" read as ไ/ใ, a skipped character, or ink left of the first character makes the reader ask the guard. CI passed on Linux. |

### Known bugs and limitations, ranked by risk to a paying customer

1. **No field accuracy for anything sold as a measurement:**
   - Plates are tested on synthetic scenes plus 51 public real photos (R16). Owner phone photos and a real gate: not measured.
   - Crowd counts run low on public street clips. Error is 26–59% across the whole frame. R16 test: a 640 input or 4×3 tiles cut the whole-frame error to about 7–33% on the four sparse/medium clips, but cost fps and add a few over-counts; not shipped (`docs/CROWD-ACCURACY.md` "Round 16"). In the near zone of one clip it is 1.2 people (31%). A crowd of about 300 counts 1–2 people. These figures are **preliminary**: the reference counts were made by an AI, and the human count is pending. A new "expected crowd" setting shows a warning when the count collapses.
   - Face accuracy comes from public photos. It is lower for Asian faces (about 66–76%, per the attendance readiness doc).
2. **Plate reading on real photos is weak** (R16, 51 public photos: top box on the plate 13/32, exact automatic read 7/22 = 32%, or 7/23 = 30% with w07 counted; motorcycle plates 0/6). The R16 plate check stops non-plate boxes from being auto-read (0/19 photos without a plate, held-out 0/9, 95% interval up to 30% on the held-out half alone). The OCR, not the finder, is now the main limit. The guard confirms every read, and a tap is the fallback.
3. **The face-model licence is unresolved** (F5/F6). This could force a model swap in attendance, customers and exam.
4. **The backend has never been deployed**, so billing, members, the Thai FDA lookup and the exam relay are untested against real Cloudflare and Opn. Opn KYC is pending.
5. **All data lives in one browser per device.** There is no multi-site sync, no organisation accounts and no backup. Clearing the browser loses records.
6. **Medicine checker:**
   - No text detector.
   - No barcode reading on iOS Safari.
   - Pillbox covers US products only and is frozen in 2020.
   - Thai FDA data needs the Worker.
7. **e-Tax invoice is not built**, and gate payments are not confirmed automatically.

### CI-only or loosened tests

- The CI-only relaxation of the medicine test (`aaad9bf`) was reverted to strict in `8b9d6aa`.
- The only CI branch left is Chrome sandbox flags (`tests/e2e/cdp.mjs`).
- CI runs e2e with `--retry=1`: one retry per failing file.
- The colour-plate e2e tests still use a tapped box. Auto-detect is now measured separately with `tools/plate-det-eval.mjs` and tested in `tests/e2e/gate-detect.e2e.mjs`, which allows the measured baseline minus 2 scenes, under the same rule on CI and locally.

## 4. Data and privacy

| Module | Personal data | Stored | Leaves the device |
|---|---|---|---|
| Attendance, customers, booth (recognition mode), teamface | Face descriptors (128-D), names or codes, punch times | IndexedDB, AES-GCM-256 encrypted with a non-extractable key (`LQVault`), with retention expiry. No face images stored. | No |
| Exam | Signal flags. Video clips only when opted in. | Clips encrypted in IndexedDB and auto-deleted. Flags kept locally. | No (relay designed, needs the Worker) |
| Gate | Plate text, times, fees, visitor names | localStorage/IndexedDB with retention and an audit log. No vehicle photos stored. | No (R16 org-accounts design would sync plates centrally — design only, `docs/ORG-ACCOUNTS-DESIGN.md`) |
| Crowd, store, queue and other zone pages, signage | Counts only. Frames stay in memory. | Local, or numbers-only through the LAN hub | Aggregate numbers only, when the hub is configured |
| Medicine | Label text typed or OCR'd | Not stored | Text only, to openFDA/RxNav/Thai FDA, after opt-in |
| Fortune | Birth data, question text | Local | Derived facts only, to Claude, when there is a server key and the user consents |
| Studio / try-on | Portrait | Not stored | Photo goes to Replicate only if try-on is enabled (off by default) |
| Members / billing | Google ID, email, plan, payment reference | D1 (not deployed) | To Google and Opn |

- **Notices and consent screens that exist:**
  - `privacy.html` and `terms.html` (TH/EN/ZH), `camera-notice.html`, `gate-notice.html`;
  - exam clip consent and attendance enrolment consent;
  - the model-download notice;
  - DPIA material in `docs/pdpa/`, and counsel notes in `docs/PDPA-NOTES-FOR-COUNSEL.md`, which cover every product.
- **Legal review:** a lawyer review is planned before sale and has not happened.

## 5. Backlog (deferred, with reasons)

**Gate**
- Real-site plate accuracy (≥100 vehicles): needs a field pilot.
- Trained Thai YOLOX-nano detector: no torch here, and the Roboflow downloads are blocked. Colab notebook and dataset list are R15 deliverables.
- Automatic PromptPay confirmation: needs a bank or Opn integration.
- Enforcing the free 30-day trial in code (today the 30 days are text only): deferred by the owner (2026-11-09) to the org-accounts and billing work, where a `gate_trial` plan with a start date can be checked on the server.
- Positioning until a Thai-trained plate detector exists: "assisted reading, the guard taps to confirm" on gate / parking / village and the one-pager, with the real-photo numbers (public dataset) beside it (owner decision 2026-11-09).

**Crowd**
- Human ground-truth count: needs two people for 1–2 hours.
- Tiled "far/dense" mode and a density-map model: need shared-code changes and a model with a clean licence. R16 measured resolution / tiling (not shipped; needs owner approval and a real-phone fps check) and listed density models with code / weights / data licences (`docs/CROWD-DENSITY-MODELS.md`); none added.

**Medicine**
- PP-OCRv5 text detector: not vendored yet.
- zxing barcode fallback for iOS: not vendored yet.
- Pharmacist-curated Thai monographs: needs a pharmacist.
- Thai FDA official API or bulk data, and a TMT licence: need permission.

**Exam**
- Blurring other seats in hall clips: costs too much fps on phones.
- Cloud upload of clips: deliberately not built.

**Attendance**
- Employee register and payroll: out of scope (HRIS).
- Field face accuracy: needs a pilot.

**Billing**
- e-Tax invoice: not built.
- Deploy and KYC: owner action.

**Face models**
- Commercial licence or legal opinion: owner and counsel.

**Booth and checkout**
- Accuracy not benchmarked: no ground-truth video, and no per-shop SKU data.

**Device adapters (heart-rate, serial, webhook)**
- Design only (`docs/DEVICE-ADAPTERS.md`).

**Round 16, owner decisions and what is still open**
- Page-status table (`docs/PAGE-STATUS.md`): approved as proposed on 2026-11-09; the category packaging is published.
- Draft price levels (`docs/PRICING-RESEARCH.md`, open questions 1–6): still open; the document is committed as a
  draft. Decided 2026-11-09: B2B prices are quoted excluding VAT ("excl. 7% VAT" on every price, now also on the live
  gate.html and exam.html in TH / EN / ZH and in BILLING-PLAN §4.1); the Gate free tier is a free 30-day trial (live
  text updated; no trial timer is enforced in code); Gate pilot targets are judged on the Wilson 95 % lower bound with
  the plain average beside it. Still open: the self-serve checkout plans on pricing.html (Plus, Creator, Business, and
  the Fortune / Retail one-pagers) stay VAT-inclusive because that is the amount actually charged; changing them
  changes what customers pay and needs a separate owner decision and a plans migration.
- `?faceparse=1` lock patch: not applied (owner decision 2026-11-09), because it would change behaviour.
- CSP `<meta>` line width on new pages: decided 2026-11-09, `tools/csp-meta.mjs` writes the policy across several
  lines on every page; no format-check exemption.
- Org accounts (item 4): approve the design and the PDPA impact before any code; counsel reviews §9–10.
- `?faceparse=1` lock (patch prepared).

**Owner and outside actions**
- Lawyer review, Cloudflare deploy, Opn KYC, field pilots, native-speaker review.

**Round 17: Product Check + AI Gateway (`docs/PRODUCT-CHECK-DESIGN.md`)**
- Design approved by the owner on 2026-11-09: "we are not charging yet, so build everything fully now for testing; legal
  review happens before we start charging". All phases P0–P9 are built to completion, each with a fixed test set, an
  independent reviewer and real numbers. Org accounts P1–P3 follow after Product Check is complete.
- Owner decisions (design §15): PC-D1 image-mode exception to "derived facts only" approved for Product Check only;
  PC-D2 all AI providers enabled in every build (Chinese providers and OpenRouter included), admin can switch any off,
  consent names the provider and processing country, eval covers all providers; PC-D9 image mode after one consent per
  user with "remember my choice" and withdraw at any time, text only stays a choice and the fallback, crop only, face
  blocks the upload; PC-D3 to PC-D8 and PC-D10 as recommended. Food rules move to the 2569 notice in P1. Thai FDA web
  service used for testing now; permission letter drafted.
- P0 done (docs only): decisions recorded, `docs/legal/FDA-PERMISSION-REQUEST-TH.md` and
  `docs/legal/WHO-PERMISSION-REQUEST.md` drafted, counsel notes in `docs/PDPA-NOTES-FOR-COUNSEL.md` F1, legal-review
  running list in §8 below.
- P1 done (`51788d7`): rule list updated to the 2569 notice (`docs/product-check/RULES.md`, 49 rules); 534 label texts
  (two AI labellers, kappa 0.915, 59 disagreements pending pharmacist); public photo set 281 images (Open Food Facts,
  local only; 66 images with any part of a person removed by hand). Source: public dataset.
- P3 done: `lensiq-claims.js` rule engine, tuned on dev only; held-out (264 texts, public dataset, AI labels):
  precision 91.9 %, recall **65.5 % (target 80 %, not met)**, 3.3 false flags per 100 compliant texts (target ≤ 5, met).
  Independent reviewer reproduced every number. Recall options for the owner: the opt-in LLM classifier (§5.2, P7)
  and/or a larger labelled set with a new unseen split; pharmacist adjudication still pending.
- P5 done (`13814a8`): AI Gateway core, see `docs/AI-GATEWAY.md`. Reviewer re-measured unit 1,212 / backend 176 and
  found 9 issues (budget overshoot on settle, fortune retries, consent text for every provider, lint guard on SDK
  imports, …); all fixed with tests (unit 1,223, backend 187). Only the Anthropic adapter so far (others in P6).
- P2 done: "Product check" tab in `medicine.html` (on-device OCR PP-OCRv5, barcode, registration-number formats,
  quality hints, face check), `docs/product-check/P2-RESULTS.md`. Synthetic labels 94.9 % character accuracy (rotated
  set tuned on itself, optimistic; held-out rotated 97.7 %, easier labels); public photo set (281, Open Food Facts):
  brand/name token found 47.0 %. Face check at 0.3 + tiles flags 60.4 % of clean packs; owner decision 2026-11-10:
  **blur detected faces before any upload instead of blocking**, setting chosen from measured readability and missed
  real faces (built next). Vietnamese tone marks: known limit, AI step handles them for now. Not measured on a phone yet.
- P7 done: `pc_fields`, `pc_claims`, `pc_translate` through the gateway (off, budget 0 on a new install); one consent
  screen naming provider, model and country per feature; text only by default, photo mode after one consent with
  "remember", faces blurred and previewed every time; mandatory preview of the exact text before any send; AI receives
  only text that came from OCR of the label (owner decision (b), client-enforced); dispensing labels never go to AI
  (default "off"); maker phones and e-mails kept. Patient-name guard, independent fresh sets (synthetic): v1 60.6 %,
  v2 78.8 %, v3 76.0 %, v4 73.2 %, **v5 62.0 % [52.2–70.9]** (latest, harder non-Thai formats); target 99 % not met,
  so the safeguard is layered (`docs/product-check/P7-RESULTS.md` §3.2c lists the gaps). P8 tools ready; OpenRouter
  403 "key limit" now raises an owner alert instead of reading as a content refusal.
- P7 product-label evidence filter, **measured independently; owner decision ก (2026-11-10)**: keep the filter, add
  on-screen guidance when a capture is refused for lack of evidence (photograph the side with the registration number
  or the ingredients list, or scan the barcode), fix the misclassified cases, commit with AI off and budget 0.
  Official figures (independent agent, locked synthetic set sha256 `470d3e7b…`, scored once): personal-data items
  reaching the AI **0/260** in text and in image mode (target 0: met); real product labels refused **69/360 = 19.2 %**
  (target < 5 %: **not met**): clean 12.5 %, low-quality OCR 22.5 %, Thai 25.0 %, foreign 16.7 %, with barcode /
  registration facts 5.0 %, without 28.2 %, front panel 38.9 %, short capture 28.9 %, long 7.8 %, back 1.1 %. 61 of
  the 69 had no evidence (front panels, 2–4 lines); 8 were misclassified and are fixed. After the fixes, on the same
  **spent** set (not an independent figure): 0/260 and 61/360 = 16.9 %. Product Check AI therefore needs the side of
  the pack with the registration number, the ingredients or the barcode; it is not sold as "works on any photo".
  Option ข is not built (own commit, new locked set). Details: `docs/product-check/P7-RESULTS.md` §3.7.
- P7 product-label evidence filter (owner decision 2026-11-10, option 1), the rule and its dev figures:
  One decision for text and image mode (`LQPCGuard.aiGate`): AI only when the capture shows product-label evidence (a
  registration-number shape, a decoded barcode, or two label cue types), no personal-document sign and is not a
  dispensing label; otherwise no consent screen, no request, a TH / EN / ZH message, on-device results stay. The Worker
  repeats the text check. Dev numbers only (synthetic, tuned on): non-product documents refused 174/174, dispensing
  labels 42/42 (Taiwan clinic and Shanghai outpatient added), product labels refused 14/335 = 4.2 % (low-quality OCR
  5.2 %). Rule: `docs/product-check/P7-RESULTS.md` §3.4; the independent measurement is in the item above.
- P7 follow-ups (owner decisions 2026-11-10; not committed): (1) the secrets test scans git-tracked files only and
  asserts that `backend/.dev.vars` is git-ignored; (2) eval bypass for local evaluation only: with `AI_EVAL_LOCAL=1`,
  a localhost request URL (local `wrangler dev`) and a localhost Origin the Worker skips the product-label filter (never the name guard or the dispensing refusal),
  with tests proving it cannot be on in a deployed Worker (`docs/AI-GATEWAY.md` §10a); (3) advert impact measured, not
  built (source: public dataset, AI-labelled): 6.1 % of the P3 held-out claim texts pass the filter (16/264) and 2.1 %
  of the violating ones (3/141), so adverts get the on-device rules only (held-out recall 65.9 % on the refused texts,
  target 80 %). AI recall on full labels is not measured (needs a full-label set and a paid run). Proposal for an
  "advert" capture type, design only: `docs/product-check/ADVERT-CAPTURE-PROPOSAL.md`.
- Exam face engine switched to MediaPipe Face Landmarker (Apache-2.0, facial-movement model removed from the bundle),
  owner decision 2026-11-10; face-api.js stays in the repo behind the research-demo switch and is never loaded by a
  customer Exam build (e2e-checked). Held-out (public dataset Open Images V7 + synthetic; `docs/exam/FACE-ENGINE-RESULTS.md`):
  one face 22/26 both, low light 61.5 → 76.9 %, mask 53.8 → 65.4 %, no false face 0/37 both, count 67.1 → 70.3 %,
  about 4.5x faster. Head turn: synthetic renders only (favour the new engine) — not a claim until measured on real
  video in the pilot. Face signals switch off only when the detector really cannot run (some browsers without GL);
  the pilot checks it on each lab computer. Independent review (2 parts) passed; face images deleted after the eval.
  L23: Exam resolved; Attendance, customers and booth still open (`docs/ATTENDANCE-READINESS.md` Part B).
- Exam follow-ups (owner decision 2026-11-10; `docs/exam/FACE-ENGINE-RESULTS.md` §6 – §7; public dataset Open Images V7,
  not exam footage). **Hall mode is marked "experimental, not on sale yet"** on the page, landing page, category page,
  catalogue, one-pagers and sales packages (TH / EN / ZH); lab mode stays pilot-ready. Small faces (24 – 48 px) in a
  1,280 × 720 view, held-out n = 195: current engine 0 %; full-range detector whole frame 14.4 %; full-range on 3 × 3
  tiles 62.6 % but 0.40 false boxes per frame and 2.2 fps on an emulated mid-range laptop (M1 throttled 4×; 4.8 fps
  unthrottled). Against the fixed rule (≤ 0.05 false positives per frame and ≥ 5 fps): the Face Landmarker variants
  pass both limits **but find 0 % of these faces**; every option that finds small faces fails the false-positive limit
  and the tiled ones also the fps limit. The rule's pick (numFaces 8 @0.5) came from an fps tie-break inside the timing
  noise and is the current engine, so the issue is not fixed, nothing new is switched on, and no page loads the
  full-range model. Lab "more than one person": a person count
  from the COCO-SSD inference the page already runs, used only while a face is seen: held-out recall 9.6 % → 28.8 %
  (n = 52), false alarms 0 / 17; the invigilator-facing pages (landing claim list, dashboard), the one-pagers and the pilot kit state 28.8 % (15 / 52)
  and that the signal is an aid, not complete detection; the candidate notice says what is checked and carries no rate;
  ≥ 90 % stays as the bar for ever claiming "detects a second person" (the pilot reports the measured rate); hall text
  says "the number of cameras depends on room size (see guide)" instead of "1 – 3 devices" (owner decisions 2026-11-10). Owner decisions 2026-11-10: the 15.5 MiB of measurement-only vendor files (second
  MediaPipe bundle 1.2.2 + full-range model, both Apache-2.0) are **out of the repo**, in
  `~/LENSIQ-field/evals/exam-followups/vendor/` (sha256 and licences in §7.3; the eval tool takes `--vendor` /
  `LQ_EXAM_EVAL_VENDOR`); the pilot kit leads with Mode B and accepts that Mode B has no live view on another machine;
  the hall "count faces (experimental)" option stays with its label. Hall camera placement guide (face ≥ 48 px wide;
  **a calculation, not a measurement**) is in `docs/EXAM.md`; the owner tests it with a 4K webcam in a real room. The
  hall setup check is built (separate commit): `exam-hall.html` asks the camera for 3,840 × 2,160 → 1,920 × 1,080 →
  1,280 × 720, shows the size received, and before monitoring shows each measured face's width in px, the smallest one,
  a warning under 48 px and "N people seen, M faces measured" (never OK with no face, more people than faces, or before the people count exists; the check measures at most 16
  faces at a time and says so; a 47.9 px face reads 47 px and warns; a chosen camera is tried at all three sizes before
  another camera; no clip is recorded where no ≤ 1,280 px copy can be made; a warning when saved seats were drawn on
  another frame shape; raising the face limit from 8 to 16 cost no time and found no more faces in a synthetic 4K test); loop
  speed on the development machine, headless: 4.95 → 4.95 loops per second at 4K, tiles 3.71 → 3.70, tiles + clip
  inconclusive (machine under other load); table in `docs/EXAM.md`; field: not measured. Process limits of this round (held-out tables printed on every
  run, order not provable from git) are stated in §7.
- P4 done: official lookups through the Worker (Thai FDA web service, testing only; openFDA, DailyMed, RxNav, HSA;
  Safety Gate and RASFF testing only, off in customer builds), on-device TMT 2563 (CC BY) + NLEM 2567 + curated Thai
  alert list + Health Canada recalls, all as small sharded static files (free Workers plan); risk-signal card with the P3
  over-claim signals; one batch request per tap, sent only after the tap with a notice naming every source and country.
  Numbers (`docs/product-check/P4-RESULTS.md`): TMT held-out OCR 92.7 % hit / 1.3 % wrong (public + synthetic), not-found
  0/45, live sources 25/25, source down 8/8 "could not check"; non-drug texts matched to a brand 6.5 % (target ≤ 5 %,
  **not met**). Heap on an emulated mid-range phone 34 MB → 1.2 MB. Independent review split by source (5 parts): first
  pass found 1 blocker (HTTP 200 error page read as "not in register"), fixed; second pass all 5 parts pass, 17
  should-fixes applied. Open: NLEM Gazette cross-check (L32), ≥ 75 warned-product photos for the key safety metric.
- P6 done (`5021a1d`): adapters for Gemini, OpenAI, Qwen, DeepSeek, z.ai, Kimi, OpenRouter (plain REST, mocked tests);
  reviewer re-measured, 8 findings fixed. Gemini held out of every Product Check default chain pending the 18+ question.
- Face check "block" → "blur" (owner decision 2026-11-10): every detected face is blurred (irreversible pixelation) before
  any upload; the user sees the blurred preview and confirms; a detector that cannot run means text only. Setting picked
  by a fixed rule (label readable ≥ 90 % on dev, then fewest missed faces): BlazeFace 3×3 tiles, 0.5, pad 0.15. Public
  datasets (Open Images V7 faces CC BY 2.0; Open Food Facts packs): fresh unseen set label readable 90.1 % [82.7–94.5],
  real faces left unblurred 34.7 % [29.3–40.5] (faces < 40 px mostly missed; close-ups 7 / 25 missed). Reviewer found
  the earlier held-out numbers optimistic; fresh numbers are the ones to quote. YuNet rejected (WIDER FACE training data
  is CC BY-NC-ND). Fresh face images deleted 2026-11-10 06:09 after the eval (manifest kept). `docs/product-check/FACE-BLUR-RESULTS.md`.
- Hosting decision (owner, 2026-11-10): no Cloudflare Workers Paid plan yet. Large lookup data (Health Canada drug
  file, TMT index) is pre-processed offline into small sharded files loaded on demand, so the free plan works. Workers
  Paid (~USD 5/month) is turned on at launch, for org accounts and backups.
- `docs/LICENCE-REQUESTS.md` (2026-11-10): 18 licence-limited items, 15 draft letters (A–P, K withdrawn) for the owner
  to send; top 3: face-api.js author (Exam, Attendance), dlib recognition data (Attendance), THIS/TMT. Nothing sent.
- New feature designs approved 2026-11-10 (`docs/NUTRITION-DESIGN.md`, `TRYON-DESIGN.md`, `MERIT-DESIGN.md`,
  `STYLE-DESIGN.md`): MVP first, built after Product Check and LICENCE-REQUESTS, in the order Nutrition, Try-On, Merit,
  Style, then org accounts P1–P3. Back-office phase 1 uses the platform admin login (BO-1). Thai plate model (YOLOX-nano)
  is integrated as soon as the owner delivers the ONNX file; YOLOv9 not used (L41).
- Drug data (owner request 2026-11-10): `docs/product-check/DRUG-DATA-SOURCES.md` (24 sources). TMT 2563 snapshot on
  data.go.th is CC BY and is used; the current TMT release (this.or.th, catalogue label "Open Data Common", login) has
  no stated licence, so it stays out until THIS gives written permission (L29). Letter to the UBU Faculty of
  Pharmaceutical Sciences drafted: `docs/legal/UBU-PHARMACY-COLLAB-TH.md` (not sent).

## 6. Delivery facts

| Round | Commit | Main outcome |
|---|---|---|
| 0 | `67d0fbe`–`4c842a4` | Initial CV platform, face reading, fortune suite |
| 1–2 | `7239e4e`–`afd677c` | Fortune AI layer, multi-camera, studio editor, PDPA fixes |
| 3 | `f862def` | Commercial studio parser, camera benchmarks, TH/ZH i18n, CSP, CI |
| 4 | `5e9526f` | YOLOX-Nano detector, measured accuracy, self-hosted fonts |
| 5 | `b68d97b` | Calibrated face matching, QC robustness, driver eye classifier |
| 6 | `6360fe2` | Grounded AI fortune, studio fixes |
| 7 | `4031ce4` | Nav and English, Creative Lab, HR interview kit, Cloudflare backend scaffold |
| 8 | `0448e6f` | Backend hardening, interview metrics |
| 9 | `e770bc2` | Google member sign-in, freemium, on-site accuracy checks |
| 10 | `b8956a6` | Billing, Thai pricing, receipts and refunds, 4-product split |
| 11 | `6fe450a` | Atomic fulfilment, re-auth, crisis card |
| 12 | `8d2ebdc` | Fortune harsh-content filter, subscription race fixes |
| 13 | `551a989` | Exam, HR attendance, Gate (plates + PromptPay), sector catalogue |
| 14 | `7fcbbd2` | Crowd, exam clip, case review, medicine, OMR, planner, lucky colour |
| 14 fixes | `aaad9bf`, `8b9d6aa`, `f478547` | Strict OCR tests, leading-digit safety net, field-pilot kit |
| 15 | `70508bc`, `41dc0b7` | Gate: plate finder for every colour, motorcycles and night, plus the leading-digit fix. Crowd: dense-crowd warning, preliminary error on 6 public clips, and a human counting sheet. Credits file, Colab training notebook, dataset list. |
| 16 | `d039058` … `7c47eba` + packaging + pricing | Customer mode by default + research-demo toggle; Gate plate check (0/19 plate-less photos auto-read on 51 public photos) and owner photo tool; claims with n and source everywhere; crowd resolution/tiling test; org-accounts design; pilot kits; Wilson rule; multi-line CSP; 7 category pages + page-status table; pricing draft and four one-pagers (excl. VAT). |
| 17 (in progress) | `6634a7d` (design) + P0 docs | Product Check + AI Gateway design approved 2026-11-09 (PC-D1–D10 recorded); Thai FDA and WHO permission requests drafted; legal-review running list (§8). P1–P9 to follow. |

**Size**
- 64 HTML pages and 36 commits.
- About 105,800 lines of first-party JS/MJS, excluding `vendor/` and tests; this includes the i18n dictionaries.
- About 42,400 lines of tests.
- Shipped models total about 120 MB.

**Largest files (lines)**
- `fortune-ai.js` 4,331
- `faceread-kb.js` 2,933
- `palm-kb.js` 2,381
- `studio-core.js` 2,237
- `palm.js` 1,993
- `i18n/en-rt-fortune.js` 1,991
- `store.js` 1,847
- `faceread.js` 1,704
- `qc.js` 1,676

### Admin first-run setup and custom-domain readiness (2026-11-11)

- Built: first-time setup on the admin page (setup code, user name, password, then 2-step verification with a QR
  code drawn on the device, then ten one-time recovery codes); sign-in with a 6-digit code or a recovery code; plain
  Thai / English / Chinese messages for every refusal; session mode chosen automatically (developer override behind
  a flag); recovery codes in the backend (migration 0011, hashes only). Docs: `docs/DEPLOY.md` (last section).
- Tests (source: synthetic, local): 12 backend tests for setup refusals and recovery codes (backend 282 / 282); 7 fixed checks of the
  owner screens and the custom-domain configuration; a browser test of the whole flow against the real Worker code
  on an in-memory database (7 checks, phone widths 320 / 360 / 390, English and Chinese).
- Independent security review before deploy: no way round the second step found; three should-fix items fixed with
  tests (2-step never left on without codes when the table is missing and `/health/deep` reports it; one code signs
  in once also over the sign-in write ceiling; no dead end when the QR step fails). Open note: recovery codes are
  stored as plain SHA-256 of 50 random bits (see `docs/DEPLOY.md`).
- Custom domain: prepared as a configuration change, not done. Steps for a subdomain of an existing domain and for
  a new domain are in `docs/CUSTOM-DOMAIN.md`. DNS, domains and GitHub Pages settings are the owner's steps.
- Deferred: the tabs inside the back office (AI settings, AI Gateway provider table, billing, members) still show
  installer wording in five places (for example the command that sets a provider key) and are Thai only apart from
  the AI Gateway tab. They are replaced by the admin-panel key management that is next in the queue.

### Admin key management (2026-11-11)

- Built: AI provider keys set, replaced, tested and removed from the admin panel; write-only (last 4 only);
  envelope-encrypted under `SECRETS_KEK`; panel key before the Worker secret; password + fresh 6-digit code per change;
  audit with provider and last 4; spend per provider; TH / EN / ZH; phone widths. Installer wording removed from the
  back-office tabs. Details: `docs/AI-GATEWAY.md` §3c.
- Tests (synthetic, local): fixed set K1–K10 (11 tests), 3 wording / text checks, 4 browser checks.

## 7. Top 5 recommendations for sellability

1. **Run one paid-shaped field pilot per lead product, with human ground truth** (Gate at one car park, Attendance at one office, Crowd at one event). Use the existing `docs/FIELD-PILOT.md` kit. Every accuracy claim is currently synthetic or comes from public datasets; real numbers are the main thing a buyer will ask for. **Effort: M.**
2. **Resolve the face-model licence (F5/F6).** Get a legal opinion now, and in parallel price a commercially licensed face SDK as a drop-in behind the existing `LQVault` and matcher interface. It is a single dependency that four products rely on. **Effort: M** (opinion S, swap M–L).
3. **Deploy the backend to a staging Cloudflare account and finish Opn KYC.** Without that, nothing can be sold online, and medicine (Thai FDA) and exam relay stay partial. **Effort: S–M.**
4. **Add organisation accounts with sync and backup** (R16: design and PDPA impact written, `docs/ORG-ACCOUNTS-DESIGN.md`; waiting for approval) for business products (attendance, gate, exam), replacing the one-browser-per-device data model. B2B buyers expect multi-device access, admin roles and data export. **Effort: L.**
5. **Organise by category.** Owner decision 2026-11-08, replacing "lead products plus add-ons": seven work categories, listed in `CLAUDE.md`. Every page stays and every category keeps being developed. Each category gets a landing page showing status and measured accuracy with its source. Exam, Gate and Crowd come first for pilots and sales materials. Age/gender and expression are off by default in customer builds. **Effort: S–M** (R16: customer mode done; category pages and status table prepared, waiting for approval).

## 8. Legal review before charging (running list)

Owner rule (2026-11-09): LENSIQ is not charging yet, so features are built fully for testing; **every item below must be
reviewed by counsel (or answered by the data owner) before charging starts.** Items are added each round and never
removed; a closed item keeps its row with the answer and date. Not legal advice. Detail for counsel:
`docs/PDPA-NOTES-FOR-COUNSEL.md` (F1 for Product Check), `docs/LEGAL-REVIEW-PACK.md`.

| # | Item | Why | Where in code / docs | Status | Added |
|---|---|---|---|---|---|
| L1 | Anthropic API terms | Commercial use, 30-day retention, processing in the US / global routing (no Asia option); DPA needed? Already used by fortune | `backend/src/fortune.js`; AI Gateway adapter (P5); design §11 | open | 2026-11-09 |
| L2 | Google Gemini API terms | **Paid tier only**: the free tier may train on inputs and is not allowed; users 18+; no data residency | `backend/src/ai/adapters/gemini.js` (P6; free-tier key refused, admin note); `docs/AI-GATEWAY.md` §3, §3b; design §10.2, §11 | open | 2026-11-09 |
| L3 | OpenAI API terms | Up to 30 days of abuse logs; storage-only residency, processing elsewhere | `backend/src/ai/adapters/openai.js` (P6); `docs/AI-GATEWAY.md` §3b; design §11 | open | 2026-11-09 |
| L4 | Alibaba Model Studio (Qwen) terms | "International" deployment scope not defined; retention period not stated; Thailand sign-up not verified | `backend/src/ai/adapters/dashscope.js` (P6; Singapore workspace endpoint); `docs/AI-GATEWAY.md` §3a, §3b; design §11 | open | 2026-11-09 |
| L5 | DeepSeek terms | Privacy policy: data **stored in the PRC and may be used for training**; API terms silent; PRC law. Enabled now by owner decision PC-D2; highest PDPA risk | `backend/src/ai/adapters/deepseek.js` (P6; consent text in `adapters/index.js`); `docs/AI-GATEWAY.md` §3b; design §10.2, §11; counsel notes F1 | open | 2026-11-09 |
| L6 | z.ai (Zhipu) terms | DPA says content is not stored; Singapore; Thailand sign-up and token pricing not verified | `backend/src/ai/adapters/zai.js` (P6); `docs/AI-GATEWAY.md` §3b; design §11 | open | 2026-11-09 |
| L7 | Kimi (Moonshot) terms | Processing region and prices not verified; zero-retention only on an enterprise option | `backend/src/ai/adapters/kimi.js` (P6; price unverified, conservative budget); `docs/AI-GATEWAY.md` §3b; design §11 | open | 2026-11-09 |
| L8 | OpenRouter terms | Adds a **second processor** between LENSIQ and the model provider; `zdr:true` and `data_collection:"deny"` forced, routed provider varies | `backend/src/ai/adapters/openrouter.js` (P6; forced zdr / deny / max_price); `docs/AI-GATEWAY.md` §3, §3b; design §10.3, §11 | open | 2026-11-09 |
| L9 | Cross-border processing (US, Singapore, China) | Product crops and OCR text leave Thailand; PDPA s.28–29 mechanism per country; is consent naming provider and country enough? | design §8.2, §10.6, §11; counsel notes F1 | open | 2026-11-09 |
| L10 | Image-mode exception to "only derived facts are sent" (PC-D1) | A product crop is more than a derived fact: hand in frame, prescription label with a patient name | design §8.2; face gate and patient-name guard (P7) | open | 2026-11-09 |
| L11 | AI consent texts TH / EN / ZH incl. "remember my choice" and withdraw (PC-D9) | Consent must be specific and as easy to withdraw as to give (s.19); remembered consent must not cover a provider or country not shown | design §8.2, §10.6; `medicine.html`, `i18n/en-med.js`, `i18n/zh-med.js`; `docs/pdpa/consent-texts.md` (P7) | open | 2026-11-09 |
| L12 | Privacy notice and terms: AI providers as recipients | `privacy.html` / `terms.html` must list the AI providers, countries and retention once Product Check is public | `privacy.html`, `terms.html` (TH / EN / ZH) | open | 2026-11-09 |
| L13 | Thai FDA web-service reuse (`WS_LICENSE_SEARCH`) | No licence stated ("License not specified"); used for testing now by owner decision; written permission needed before charging; natural-person licensee names / addresses dropped | `backend/src/med.js` (P4); design §4.1; **letter drafted** `docs/legal/FDA-PERMISSION-REQUEST-TH.md` (not sent) | open (letter drafted) | 2026-11-09 |
| L14 | WHO Medical Product Alerts (and WHO INN / ATC) | CC BY-NC-SA 3.0 IGO: commercial use needs permission; INN and ATC have their own terms | design §4.5; **email drafted** `docs/legal/WHO-PERMISSION-REQUEST.md` (not sent) | open (email drafted) | 2026-11-09 |
| L15 | Share-alike data: ChEMBL (CC BY-SA 3.0), Open Food Facts / Open Beauty Facts (ODbL, CC BY-SA images) (PC-D10) | Share-alike on derived data; kept in a separate cache, never merged or shipped in `vendor/`; confirm this is enough | design §4.5, §7 | open | 2026-11-09 |
| L16 | EU Safety Gate licence | CC0 1.0 reported by a secondary source only; confirm on data.europa.eu. Also RASFF registration, MHRA OGL per item, HSA / Singapore Open Data Licence attribution, openFDA / Health Canada no-endorsement wording | design §4.2–4.4, §4.6 | open | 2026-11-09 |
| L17 | Over-claim flag wording and defamation risk for brands | Do the food / cosmetic / supplement advert rules apply to packs and online listings? Wording "risk signal under <rule>" must not defame a legitimate brand | `lensiq-claims.js` (P3); design §5, §14 PR3 | open | 2026-11-09 |
| L18 | Curated Thai alert list from FDA press releases | Fact-only table built by hand from press releases; no copying of text or images; copyright in facts | `vendor/pc-alerts/th.json` (P4); design §6.2 | open | 2026-11-09 |
| L19 | Reference-image library copyright | Embeddings from LENSIQ's own photos of retail packs (Thai Copyright Act s.32–33); manufacturer licences preferred; no third-party images collected before the answer (PC-D7) | design §6.3; tooling in P9 | open | 2026-11-09 |
| L20 | Sourcing photos of illegal / warned products for the test set | Buying or photographing listed products lawfully (≥ 75 needed for the 5 % bound) | design §9.1, §13 | open | 2026-11-09 |
| L21 | Medical-device software classification of Product Check | Does reading labels and checking registrations make LENSIQ medical-device software under Thai law or the EU MDR? | design §15 Q8; `docs/MEDICINE.md` "Regulatory positioning" | open | 2026-11-09 |
| L22 | Organisation accounts: 16 counsel questions | LENSIQ becomes a processor (s.40) and transfers data abroad once sync is on; DPA template; DPIA R38–R47 | `docs/ORG-ACCOUNTS-DESIGN.md` §9–10; counsel notes E3 | open | 2026-11-09 (raised R16) |
| L23 | Face model licences F5 / F6 | face-api age/gender trained on UTKFace (non-commercial), expression data licence unclear; detector, landmarks and recognition also need an opinion | §2 above; `LICENSES/THIRD_PARTY.md`; `docs/LEGAL-REVIEW-PACK.md` §4 | open | 2026-11-09 (raised earlier) |
| L24 | Gate signage and privacy notice | Sign wording, legal basis (s.24(5) / s.24(3)) and retention for plates; owner photos of public streets for testing | `gate-notice.html`; `docs/GATE.md` §5; counsel notes B3, E2 | open | 2026-11-09 (raised R13–R16) |
| L25 | Pricing terms and VAT | B2B prices excl. 7 % VAT vs VAT-inclusive self-serve plans; Gate 30-day trial wording (not enforced in code); refund and contract terms | `docs/PRICING-RESEARCH.md`, `docs/BILLING-PLAN.md` §4.1, `pricing.html`, `terms.html`; `docs/LEGAL-REVIEW-PACK.md` §3.2–3.5 | open | 2026-11-09 (raised R16) |
| L26 | Public procurement fit | Specific-method threshold, VAT inside the threshold, multi-year contracts, no splitting, e-GP / SME registration | `docs/SALES-PACKAGES.md` A.5, C1–C3 | open | 2026-11-09 |
| L27 | TOR wording vendor-neutral | The Thai / English TOR text must not lock in a brand | `docs/SALES-PACKAGES.md` A.6, C4 | open | 2026-11-09 |
| L28 | Partner agreement | Reseller vs agent, VAT on the revenue share, withholding tax, liability, DPA with partners | `docs/SALES-PACKAGES.md` B, C5–C6 | open | 2026-11-09 |
| L29 | TMT / TTMT current release files (THIS / สมสท.) | No licence on the pages; "สงวนลิขสิทธิ์" footer; login; HSRI catalogue label "Open Data Common" undefined. Written permission for commercial use and redistribution of derived tables needed before charging; is TMT a s.7(5) state compilation? Checked 2026-11-10 on data.go.th: the newest release (2568) is catalogued as "Open Data Common", not CC BY, so the 2563 CC BY snapshot stays in use until permission; | `docs/product-check/DRUG-DATA-SOURCES.md` S1, S3 | open | 2026-11-10 |
| L30 | TMT 2020-02-17 snapshot under CC BY | CC BY version not stated on data.go.th; does CC BY on the old release cover our derived table, and may it be mixed with later (unlicensed) releases? Six-year-old data shown to users needs a "data as of" label | S2 | open | 2026-11-10 |
| L31 | data.go.th "Open Data Common" and "License not specified" datasets (Thai FDA licensee lists, DTAM herbal codes and herbal NLEM structure) | The label has no definition in any Thai CKAN licence list; ask DGA / the data owner what it permits | S14, S16 | open | 2026-11-10 |
| L32 | NLEM via the Royal Gazette and the MIT thai-nlem-api CSV | Confirm s.7(3) / s.7(5) covers our own table of the announcement; the CSV's origin is not stated, so verify against the Gazette | S4, S5 | open | 2026-11-10 |
| L33 | RxNav: no RxClass without UMLS; DailyMed label text | RxClass carries SNOMED CT; DailyMed text belongs to labellers, so store derived facts and link out only | S8–S11 | open | 2026-11-10 |
| L34 | Thai traditional medicine knowledge (national formulas, Positive List) | DTAM CSVs are CC BY-NC; national formulas are protected under the TTM Knowledge Protection Act B.E. 2542; may we show formula names or herbal Positive List facts rebuilt from MoPH announcements? | S17, S18 | open | 2026-11-10 |
| L35 | Thai Herbal Pharmacopoeia (DMSc) | Copyright notice; no reuse licence; ask DMSc before using monograph content | S19 | open | 2026-11-10 |
| L36 | University herbal databases and the UBU collaboration | No open licence; a collaboration agreement (data rights, credit, publication, no personal data) is needed before using any faculty data or pharmacist labels commercially | S20; `docs/legal/UBU-PHARMACY-COLLAB-TH.md` (not sent) | open (letter drafted) | 2026-11-10 |
| L37 | icdevelop/thai-pharma-kb | HAI-DEF terms applied to a dataset (pass-on restrictions, Notice file); TMT rights not cleared; `ingredient_kb.jsonl` is AI-generated. Not used: record the decision | S12, S13 | closed: not used (2026-11-10) | 2026-11-10 |
| L38 | DrugBank and WHO ATC/DDD | Non-commercial / no commercial copying; not used. If ever needed: DrugBank commercial licence, WHO CC permission | S21, S22 | open (not used) | 2026-11-10 |
| L39 | Face-blur image mode safeguard | The on-device detector leaves about a third of real faces unblurred (mostly small ones, some close-ups); a picture with a missed face can be sent after the user sees the blurred preview and presses "Use this picture". Is preview + confirmation adequate (s.6 personal data), or should image mode default to a smaller crop / text only? | `lensiq-pc*.js` `prepareUpload`; `docs/product-check/FACE-BLUR-RESULTS.md` | open | 2026-11-10 |
| L40 | Public face images used for measurement only | Open Images V7 (images CC BY 2.0 per image, boxes CC BY 4.0), stored outside the repo, never shipped or used for training; fresh set deleted after the eval, builder set kept pending the owner. Confirm local evaluation use and attribution are sufficient | `~/LENSIQ-field/face-blur/` (manifest + CREDITS.tsv); FACE-BLUR-RESULTS §6.1 | open | 2026-11-10 |
| L41 | open-image-models YOLOv9 plate detector | **Decided 2026-11-10: not used, not even for local sales demos.** Weights carry no licence (maintainer defers to WongKinYiu/yolov9, GPL-3.0); that training code descends from Ultralytics YOLOv5 (AGPL-3.0 since 2023-04-14); ~11–15k training images scraped from the web without licence or consent. Delivered detector: Thai-trained YOLOX-nano (Apache-2.0) | `docs/GATE.md` §3b/§3c; `tools/train-plate-detector.ipynb` | closed: not used (2026-11-10) | 2026-11-10 |
| L42 | Merit service: Direct Sales and Direct Marketing Act | **Must answer before charging.** Is "merit on your behalf" sold online direct marketing (registration with สคบ., capital, deposit, 7-day cancellation)? | `docs/MERIT-DESIGN.md` §6, §13 | open (must answer before charging) | 2026-11-10 |
| L43 | Merit service: Fundraising Control Act B.E. 2487 (and Sangha orders) | **Must answer before charging.** Donations go straight to the temple's e-Donation QR (owner decision); confirm LENSIQ's booking of offerings is not fundraising | `docs/MERIT-DESIGN.md` §6, §13 | open (must answer before charging) | 2026-11-10 |
| L44 | Remedies and merit wording (consumer protection) | Every service, advert and recommendation text reviewed against Thai consumer-protection and advertising law before launch; never sell an outcome (CLAUDE.md rule 2026-11-10) | `docs/MERIT-DESIGN.md`; fortune pages | open | 2026-11-10 |
| L45 | Try-On cloud mode sends a customer photo (TO-D3) | Exception to "only derived facts are sent", approved 2026-11-10: after consent, only to providers whose terms say they neither keep nor train on the image; retention terms recorded per provider; only garment cut-outs stored (TO-D7) | `docs/TRYON-DESIGN.md` | open | 2026-11-10 |
| L46 | Product Check patient-name guard limits | Rule guard recall 62–76 % on independent synthetic sets; text that is on the label (OCR) and not caught can be sent after the mandatory preview; non-Thai IDs/phones and CJK names without 姓名 weakest; provenance, photo gate and dispensing check enforced in the browser (the Worker cannot see the label) | `lensiq-pc-guard.js`, `lensiq-pc-ai.js`; `docs/product-check/P7-RESULTS.md` §3 | open | 2026-11-10 |
| L47 | Translating printed dosing lines (`pc_translate`) | Is translating the label's own dosing text "dosing advice" under the medicine-page rule? Shown as "translated from the label, not advice, ask a pharmacist" | `backend/src/ai/pc-features.js`; P9 travel mode | open | 2026-11-10 |
| L48 | Lawful basis for real customers: cross-border AI (Product Check) | **Must answer before any real customer uses it.** For the closed tester group the owner accepted consent as the basis (decision D3, 2026-11-10). Open for customers: is per-send consent enough for sending label text / a product photo outside Thailand (PDPA s.28), or is another basis, an adequacy finding or contract clauses needed; what the consent text must say; minors. | `lensiq-ai.js` consent; `docs/DEPLOY.md`; `docs/PDPA-NOTES-FOR-COUNSEL.md` F1 (g) | open (counsel) | 2026-11-10 |
| L49 | Tester-group privacy wording | Draft shown to testers in the tester card of `medicine.html` and in `privacy.html` section 5 (TH / EN / ZH; `lensiq-tester.js` `priv`, `brief`), owner decision D4: "only after your consent, label text (and the blurred product photo in photo mode) is sent through Cloudflare and OpenRouter to Google Cloud Vertex AI or Microsoft Azure, outside Thailand; they keep no content; LENSIQ stores no label text or image". Counsel to confirm or correct the wording, including "keep no content" (zero-retention routes) and that no statement is made about the model makers. | `lensiq-tester.js`; `privacy.html` section 5 | open (counsel) | 2026-11-10 |
| L50 | Processors accepted for the test phase | Accepted by the owner for the closed test only (decision D1, 2026-11-10): Cloudflare (API host, database, Turnstile), OpenRouter (router, second processor), Google Cloud Vertex AI (serves the Claude models), Microsoft Azure (serves the GPT models). Routes are pinned and zero-retention is forced; the country is not fixed (global, US or Europe). Before customers: processor agreements / terms of each, the sub-processor chain, and whether the model makers receive anything on these routes (not stated by the router). The testing-only lookup sources (L13, L16) are limited to tester-code holders (decision D2). | `backend/src/ai/adapters/openrouter.js` ROUTES; `backend/wrangler.toml [env.test]`; `docs/DEPLOY.md` | open (counsel + owner) | 2026-11-10 |
| L51 | Admin recovery codes: slow, salted hash (**must fix before launch**, owner 2026-11-11) | Today the ten one-time recovery codes of the owner sign-in are stored as plain SHA-256 of 50 random bits (`backend/src/auth.js`, migration 0011). Before any real customer or organisation account uses the back office: store them with a slow, salted hash (per-code salt, PBKDF2 or a hash keyed with `SECRETS_KEK`) and re-issue existing codes. Online guessing is already limited (5 failures per 15 minutes) and the password is needed as well; this closes the case of a leaked database. | `backend/src/auth.js`, migration `0013_recovery_slow_hash.sql`, `tests/unit/backend-recovery-slow.test.js` | **done 2026-11-11**: deployed (Worker `cbd74330`, migration 0013); the owner issued a new set at 16:44 UTC, and a read-only check of D1 `lensiq-test` shows 10 unused codes, all salted (2,000 rounds), 0 old-format codes: per code a random row id, a random 16-byte salt and PBKDF2-SHA256 (2,000 rounds) of HMAC(key derived from SECRETS_KEK, code). A database copy alone is useless; with the database and the KEK each guess still costs 2,000 rounds per stored code. CPU: ~5.5 ms for a claim (10 rows) and for issuing 10 codes, next to ~12 ms for the password (Free plan limit 10 ms nominal). Old-format codes work until the new set is issued; the tab asks for it. Rotating SECRETS_KEK makes every new-format code invalid: issue a new set after a rotation. Independent review 2026-11-11: no blocker; its two should-fix points (deploy order, PBKDF2 bypass by a keyed lookup) were fixed | 2026-11-11 |
| L52 | Product Check: decide the public capture rule (**must decide before launch**, owner 2026-11-11) | Every user, testers included, needs product-label evidence (registration number, barcode or two label cue types) before AI runs. A tester-only "relaxed capture" (AI on captures without evidence) was measured before building (synthetic, spent sets, dev figures): p7 set 10/10 borderline documents allowed (4 dispensing labels, 6 personal notes; names or phones in the text of 8); p7b set 54 personal documents allowed, 72 personal items in the text. **Owner decision 2026-11-11: option 1, not built.** Instead: capture guidance (start on the side with ingredients, registration number or barcode). The public rule stays strict until a measured rule meets 0 leaks on a fresh independent set and counsel agrees. | `docs/product-check/P7-RESULTS.md` §3.8; `~/LENSIQ-field/evals/relaxed/` | decided for the test phase; open for launch | 2026-11-11 |
| L53 | Fresh advert / claim texts used for measurement only | 402 texts quoted from public pages (US FDA warning letters, UK ASA rulings, Thai Anti-Fake News Center, Thai and Chinese press, NIH DSLD, openFDA, makers' product pages) to measure the on-device advert rules. **Owner decision 2026-11-11:** internal measurement only; kept outside the repo (`~/LENSIQ-field/product-check/texts-fresh/`), never redistributed, never used for training; source and licence recorded per row. Counsel to confirm that quoting for internal evaluation is fair use / permitted under Thai copyright law (s.32/s.33). | `~/LENSIQ-field/product-check/texts-fresh/README.md`; `docs/product-check/TEST-SETS.md` §4 | open (counsel) | 2026-11-11 |
| L54 | Crisis handling passes an independent review on a fresh set (**must fix before launch**, owner 2026-11-12) | Incident 2026-11-12 (`docs/INCIDENT-2026-11-12-CRISIS-NET.md`): the fortune crisis net missed common phrasings since 2026-11-08. Fixed in three rounds; each round must pass an independent review on inputs never seen before, with straight mode on; a Thai mental-health professional reviews patterns, card and soft step | `fortune-crisis.js`, `fortune-ai.js`, crisis tests | open | 2026-11-12 |
| L55 | Help-line numbers re-verified every 6 months (**must fix before launch**, owner 2026-11-12) | Numbers and hours on the support card and the always-visible help line are verified from official sources (`docs/CRISIS-RESOURCES.md`, with URL and date); re-verify at least every 6 months and after any change notice | `docs/CRISIS-RESOURCES.md` | open | 2026-11-12 |
| L56 | Straight mode: adult confirmation method (legal list, owner 2026-11-12) | "Read it straight" plain negative readings are offered only after a self-declared "I am 18 or older" checkbox stored on the device; counsel to confirm whether this is adequate (consumer protection, minors) | `fortune-straight.js`, fortune pages | open | 2026-11-12 |
| L57 | Product Check: testers send to AI with one tap, no preview (legal list, owner 2026-11-12) | Testers (valid tester code) who consented once with "remember my choice" send a capture's TEXT to AI with one tap on "ask AI", without the per-send preview; the text that was sent and a stop/withdraw control are shown; the Worker enforces tester-only; every privacy filter stays (product-label evidence, not dispensing / personal document, name guard, no face). No automatic sending; images only after an explicit tap. The public keeps preview-and-confirm. Counsel: is consent once + visible record adequate for cross-border processing (L48)? | `lensiq-pc-*.js`, `backend/src/ai/*`, `docs/product-check/LIVE-SCAN-RESULTS.md` | open | 2026-11-12 |
| L58 | Health Canada Drug Product Database (P9 travel mode) | Source added for Canadian DIN lookups (only the DIN is sent, via the Worker); licence Open Government Licence – Canada, attribution shown on the card and recorded in credits. Confirmed by the owner 2026-11-12 | `backend/src/pc.js`, `docs/product-check/P9-RESULTS.md`, `docs/CREDITS-MEDIA.md` | confirmed | 2026-11-12 |
| L59 | Crisis state remembered for 24 hours? (legal list, owner 2026-11-12) | Today the fortune pages remember that the support card was shown only for the browser session (sessionStorage flag, no timestamp, no text), so remedies, paid entries and readings stay hidden across pages in the same visit. Keeping it for 24 hours would store a sensitive-health-related signal on the device: counsel to advise (PDPA s.26) before any longer persistence | `fortune-crisis.js`, `docs/PDPA-NOTES-FOR-COUNSEL.md` | open | 2026-11-12 |

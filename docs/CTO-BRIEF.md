# LENSIQ — CTO brief

As of 2026-11-09 (round 16 complete). Round 15 shipped in two commits: Gate `70508bc` (CI green on Linux, live) and crowd/docs `41dc0b7`. Round 16 shipped as: customer switch `d039058`; Gate plate check + field tools `d049dfd`; claims, crowd test, org design, pilot kits `34e14b3`; Wilson rule `77b555a`; multi-line CSP `7c47eba`; then the category packaging and the pricing draft after the owner approved them on 2026-11-09. Accuracy sources are labelled synthetic, public dataset or field.
**Round 17 = Product Check + AI Gateway, in progress: P0, P1, P3 done** (design approved 2026-11-09; §5 "Round 17", legal list §8).
Org accounts P1–P3 follow after Product Check is complete.
Sources: the repo, `ACCURACY.md`, `LICENSES/THIRD_PARTY.md`, `docs/*.md` and the GitHub Actions history. Anything that cannot be found there is marked "unknown" or "not measured".

## 1. System map

**Status legend:**
- **demo:** works end to end on the public site with demo or synthetic data, but has never run at a customer site.
- **experimental:** works, but has a known accuracy gap or is labelled preliminary.
- **scaffold:** code and tests exist, but it is not deployed.

No module is production-ready. None has completed a field pilot, and the backend has never been deployed.

| Module | What it does | Status | Main files |
|---|---|---|---|
| Exam (lab, hall, dashboard) | Flags objective proctoring signals: face count, head turn, objects, frozen feed, browser events. Evidence clips are opt-in, encrypted and auto-deleted. No emotion inference. | demo | `exam*.html`, `exam-lab.js`, `exam-hall.js`, `exam-dashboard.js`, `lensiq-exam.js`, `lensiq-exam-clip.js`, `docs/EXAM.md` |
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
| MODNet | matting | 25 MB | Apache-2.0 (earlier releases CC BY-NC-SA; provenance commit unrecorded) | ZHKKKe/MODNet via Xenova | browser, ORT | ACCURACY §11 |
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
  - YOLOv9 weights from open-image-models (GPL-derived). Benchmark use only; never shipped. In R16 the `yolo-v9-t-384-license-plates-end2end.onnx` model (github.com/ankandrew/open-image-models; code MIT, weights licence not stated, YOLOv9 reference code GPL-3.0) was run offline, outside the repo, **only to draw candidate boxes for labelling** the real-photo set (`docs/GATE.md` §3c). Nothing from it is in the repo (`git ls-files` checked).
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
| Unit (node:test) | 1,121 tests, all passing (R16 working tree; backend subset 135/135). |
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
| L2 | Google Gemini API terms | **Paid tier only**: the free tier may train on inputs and is not allowed; users 18+; no data residency | Gemini adapter (P6); design §10.2, §11 | open | 2026-11-09 |
| L3 | OpenAI API terms | Up to 30 days of abuse logs; storage-only residency, processing elsewhere | OpenAI adapter (P6); design §11 | open | 2026-11-09 |
| L4 | Alibaba Model Studio (Qwen) terms | "International" deployment scope not defined; retention period not stated; Thailand sign-up not verified | dashscope adapter (P6); design §11 | open | 2026-11-09 |
| L5 | DeepSeek terms | Privacy policy: data **stored in the PRC and may be used for training**; API terms silent; PRC law. Enabled now by owner decision PC-D2; highest PDPA risk | deepseek adapter (P6); design §10.2, §11; counsel notes F1 | open | 2026-11-09 |
| L6 | z.ai (Zhipu) terms | DPA says content is not stored; Singapore; Thailand sign-up and token pricing not verified | zai adapter (P6); design §11 | open | 2026-11-09 |
| L7 | Kimi (Moonshot) terms | Processing region and prices not verified; zero-retention only on an enterprise option | kimi adapter (P6); design §11 | open | 2026-11-09 |
| L8 | OpenRouter terms | Adds a **second processor** between LENSIQ and the model provider; `zdr:true` and `data_collection:"deny"` forced, routed provider varies | openrouter adapter (P6); design §10.3, §11 | open | 2026-11-09 |
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

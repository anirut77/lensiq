# Medicine checker (`medicine.html`)

A **drug-information reference / label reader** (round 14, story S1-D). It is not a diagnostic tool, gives no dosing
advice, never computes a dose, never ranks or promotes a product, has no buy links and never identifies a pill from an
image. Every screen tells the user to confirm with a pharmacist and shows 1669 (emergency) and 1367 (Poison Center).

| File | Role |
|---|---|
| `medicine.html`, `medicine.css`, `medicine.js` | the page (TH default; `i18n/en-med.js`, `i18n/zh-med.js`) |
| `lensiq-med.js` (`LQMed`) | pure logic: code parsers, Pillbox candidate search, openFDA / RxNav URL builders, label section layout, emergency wording, history (unit-tested: `tests/unit/med.test.js`) |
| `vendor/pillbox/` | slim NLM Pillbox index (public domain) + `LICENSE.txt` + `README.md`; rebuilt by `tools/build-pillbox.mjs` |
| `backend/src/med.js` | Worker text proxy `/api/med/*` (Thai FDA SOAP; openFDA / RxNav fallback). Not deployed. Tests: `tests/unit/backend-med.test.js` |
| `tests/e2e/medicine.e2e.mjs` | browser test (offline default, opt-in lookups via `?fakenet`, candidates, history, OCR, i18n, phones) |
| `lensiq-pc.js`, `lensiq-pc-run.js`, `lensiq-pc-ui.js` | Product check tab (round 17 P2, section 3 below) |
| `docs/pdpa-notes/S1-D-medicine.md` | PDPA note for counsel |

## Modes

### 1. Box / label / drug name

Input: typed text, OCR of a user-placed crop box (PP-OCRv5 Thai rec model already vendored for LENSIQ Gate:
`vendor/models/plate-ocr-th/`, Apache-2.0; its dictionary covers Latin letters, digits and `/`), or a barcode
(`BarcodeDetector`). OCR output goes into the text box for the user to correct; nothing is looked up automatically.

`LQMed.classify()` recognises:

| Kind | Example | What the page does |
|---|---|---|
| Thai drug registration number | `1A 15/50`, `2A 3/60 (NG)`, `1C 12/55 (NC)`, `G 123/45` | Shows the normalised number and the B.E. year only (the meaning of the digit / letter is **not** asserted — unverified). With opt-in + server: Thai FDA lookup (status active / cancelled / expired / pending, legal class, TH/EN trade names, licensee, link to the pertento product page). |
| Thai food / supplement number (13 digits `XX-X-XXXXX-X-XXXX`) | `10-1-12345-1-0001` | "This is not a drug registration number" + Thai FDA site link. Helps spot supplements sold as medicine. |
| Barcode | EAN-13 `885…` (GS1 Thailand), UPC-A `3…` (US NDC inside), GS1 `(01)` element strings | Check digit; Thai packs: no open GTIN→drug mapping exists, so the user is pointed to the registration number (opt-in history can remember barcode → registration number on this device). US: NDC candidates (4-4-2, 5-3-2, 5-4-1) → openFDA. |
| NDC | `0603-5892-21` | openFDA label by package / product NDC. |
| Drug name | `ibuprofen`, `พาราเซตามอล` | English: RxNav approximate match (RxNorm names to pick from) + openFDA label by name. Thai: explains that open label data is English-only; with a server, the Thai FDA register can be searched by Thai name. |

Label card: generic / brand / manufacturer / label date / DailyMed source link, then sections in a **fixed order**
(boxed warning, purpose, indications, directions *as written on the label*, contraindications, do not use, warnings,
ask a doctor, stop use, pregnancy, keep out of reach of children, overdosage, storage, ingredients). Text is the
original US English, marked `lang="en" translate="no"`, never machine-translated, cut (and flagged) at 4,000 characters
(12,000 in pharmacist mode). The card says a US label may differ from the Thai product, and shows openFDA's own
`meta.disclaimer` verbatim.

### 2. Loose pill

Imprint (required) + colour + shape + size (mm) + score → `LQMed.candidates()` over the slim Pillbox index:
exact / either-side-order / one-side / look-alike (0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G cost 0.5) / partial imprint match.
A strict pass uses every chosen feature; when it yields fewer than 3, imprint-only matches fill up to 3 and are labelled
"partial match". **Fewer than 3 in total → nothing is shown** ("show at least 3 or none"), so the list can never read as
"your pill is X". The NLM warning is shown verbatim next to the search and the results:

> "These files will not be updated and should not be used for pill identification."

Pillbox is US-only and frozen at 2020; most Thai products are not in it — the page says so.

### 3. Product check (round 17, phase P2: on-device recognition)

A fourth tab, "ตรวจสินค้า (ทุกประเทศ)", for medicines, supplements, cosmetics and food from any country (design:
`docs/PRODUCT-CHECK-DESIGN.md` §2, §3, §8; numbers: `docs/product-check/P2-RESULTS.md`). The other modes are unchanged.

| File | Role |
|---|---|
| `lensiq-pc.js` (`LQPC`) | pure logic, unit-tested (`tests/unit/pc-ondevice.test.js`): quality hints (Laplacian variance + Tenengrad blur, HSV glare blob, exposure clipping, text height), DB box post-processing (axis-aligned + rotated boxes for tilted lines), reading order, product crop, CTC decode, GTIN check digits + GS1 issuer prefix, GS1 element strings (AI 01 / 17 with DD = 00 -> last day / 10 / 21, FNC1, `(01)…` text), registration-number SHAPES per country, "how to verify" links, the face-gate decision, measurement helpers |
| `lensiq-pc-run.js` (`LQPCRun`) | browser runtime: PP-OCRv5 mobile det + per-script rec on ONNX Runtime Web (WASM, 1 thread), barcodes (native `BarcodeDetector`, then the self-hosted zxing-wasm ponyfill), BlazeFace face gate (MediaPipe `FaceDetector`) |
| `lensiq-pc-ui.js` | the tab: camera snapshot or photo -> automatic crop around the text (the user can redraw it) -> quality hints -> OCR (editable text) + barcodes -> number shapes with country, GS1 fields, how-to-verify links, "could not check" list |
| `vendor/models/pc-ocr/`, `vendor/models/face-gate/`, `vendor/zxing/` | models / wasm, each with `README.txt` (source, sha256, size) and licence files; Thai recogniser shared with Gate (`vendor/models/plate-ocr-th/`) |
| `tests/e2e/product-check.e2e.mjs` | real models on a synthetic Thai + Latin + Chinese label, EAN-13 + GS1 DataMatrix through zxing-wasm, face gate fail-closed, TH / EN / ZH, phones |
| `tools/pc-ondevice-eval.mjs` | measurement on the public photo set + synthetic labels (data stays in `~/LENSIQ-field/`) |

Rules kept: no verdict ("genuine" / "fake" is never said; a number with the right shape is "format matches, not checked
against the register"); the meaning of letters inside a number is never asserted; expiry from a GS1 barcode is shown as a
printed fact (a passed date is a signal); no dosing words; fixed bottom line "ไม่ใช่การยืนยันขั้นสุดท้าย ยืนยันกับเภสัชกร"
+ 1669 / 1367; the picture stays in memory (nothing uploaded, nothing stored); history rows (numbers and barcodes only,
never the OCR text) only with the existing opt-in history. Models load on first use, one script at a time: Thai 12.1 MiB
(det + rec), Chinese / Japanese 20.4, Korean 17.4, Latin 12.3. The user picks the script (Thai default).

Face gate (for P7, nothing is uploaded in P2): BlazeFace short range on the frame, 2 x 2 tiles and the crop; any score
>= 0.3 blocks; a missing model, an error or a browser without WebGL (MediaPipe needs it) blocks. P2 measured a high
false-block rate on clean product photos (P2-RESULTS.md): P7 must offer text-only mode as the normal fallback.

Extension point for P3 (over-claim rules): after every read or edit the tab fires `window` event `lq-pc-text`
`{detail: {text, script}}` and leaves `#pcClaimsSlot` empty for the claims card.

Not in P2: register lookups (P4), over-claim rules (P3), automatic script detection, reading printed (non-GS1) expiry dates,
Cyrillic / Arabic / Indic scripts, Vietnamese tone marks (not in the Latin model's dictionary; owner decision
2026-11-10: a known limit, the opt-in AI step handles Vietnamese for now).

### Pharmacist mode

Same data, denser layout, every label section open, reference codes (RxCUI, set id, merged SPL count), more
candidates (40) and label rows. Lookup history is a separate opt-in (local only, 200 entries, CSV export, delete).

## Data sources and licences

| Source | Licence | Used how |
|---|---|---|
| NLM Pillbox (retired 2021-01-29) | Public domain (US Government work) | Bundled slim index, lazy-loaded (3.3 MB raw, ~1.1 MB gzip), cached by `sw.js` (cache-first for `vendor/`). |
| openFDA `drug/label` | CC0 / public domain (open.fda.gov/license); must not imply FDA endorsement | Online, opt-in, text only. Limits without key: 240/min, 1,000/day per IP; the Worker can hold `OPENFDA_API_KEY` (120,000/day). |
| RxNav / RxNorm | No licence needed (NLM ToS); attribution required; NLM name/logo not used | Online, opt-in, approximateTerm only (20 req/s per IP). |
| Thai FDA `WS_LICENSE_SEARCH.asmx` (`GET_DATA_DRUG`) | data.go.th: "License not specified", public data | Through the Worker only (SOAP, no CORS). **Confirm reuse terms with Thai FDA / DGA before commercial launch.** |
| pertento.fda.moph.go.th product page | Not stated | **Linked only, never scraped** (its JSON backend is token-gated). |
| DailyMed | US Government | Source links only. |

Required attribution (on the page): "This product uses publicly available data from the U.S. National Library of
Medicine (NLM)." plus "LENSIQ is not endorsed by NLM / FDA". **Not used** (licence): WHO ATC/DDD (non-commercial),
Thai Medicines Terminology (no public licence), ePillID and other pill-image models (research-only / unclear), DTAM
formula lists (CC BY-NC).

## Online lookups and the CSP

The static site's CSP is `connect-src 'self' data: blob:` (+ the API origin when configured). The page reads its own
CSP meta: if `https://api.fda.gov` / `https://rxnav.nlm.nih.gov` are allowed it calls them directly (each user's own
IP budget); otherwise it uses the Worker routes. With neither, the page says the lookup is not available yet. Thai FDA
always needs the Worker ("needs server" message + a link to the Thai FDA search site when absent).

To let browsers call openFDA / RxNav directly, the integrator adds a per-page connect-src (see the integrator list in
the round notes); this is optional — the Worker fallback works without it.

### Worker routes (`backend/src/med.js`)

```
GET /api/med/status                       {enabled, thfda, openfda, rxnav, openfda_key}
GET /api/med/thfda?q=<reg no | name>      {source, fetched, q, total, rows:[{lcnno, name_th, name_en, licensee, status_text, status, type, use, kind, newcode, url}]}
GET /api/med/openfda?by=name|ndc|setid&q= {meta:{disclaimer,…}, results:[…max 3]}
GET /api/med/rxnav?term=<name>            {approximateGroup:{candidate:[{rxcui, score, name, source}]}}
```

Origin allowlist required (`ALLOWED_ORIGINS`), GET only, query cleaned to letters / digits / `- . , ( ) / +` (60 / 80
chars), 20 lookups per caller per minute (`MED_RATE_MIN`), 10 s upstream timeout, 24 h edge cache, no client headers
forwarded, no IP or query in logs, addresses dropped from the Thai FDA answer, only `https://pertento.fda.moph.go.th`
links passed on. Vars: `MED_ENABLED` (default true), `MED_RATE_MIN`; secret: `OPENFDA_API_KEY` (optional).

Wiring (integrator, `backend/src/index.js` `publicRoute`, before the final 404):

```js
import { medRoute } from "./med.js";
// …
if (p.startsWith("/api/med/")) return await medRoute(request, env, url, deps, cors);
```

## Regulatory positioning (not legal advice — confirm with Thai counsel / Thai FDA)

- **Drug Act B.E. 2510 s.88 (advertising):** only verbatim, sourced label / registration text; no rankings, no "best for",
  no brand promotion, no buy / affiliate links, no sponsorship next to results; dangerous / specially controlled drug
  status is shown as a legal class ("must be dispensed by a pharmacist"), never as an offer.
- **Medical Device Act (SaMD):** a user-driven lookup and display tool with no diagnosis and no patient-specific dose
  calculation; pill feature = "candidates matching the features you entered", never a definitive identification; no
  image classifier. (Comparable: US FD&C Act 520(o); EU MDCG 2019-11 "simple search" — dose calculation would be MDSW.)
- **Safety UX:** pharmacist banner, 1669 / 1367 always visible, emergency card on overdose / poisoning wording
  (TH / EN / ZH; 1323 added on self-harm wording), dosing only "as written on the label".

## Accuracy (honest statement)

- OCR: PP-OCRv5 Thai mobile rec, trained on general text, not on drug boxes; no text-detection model, so the user
  places the crop box. The e2e test reads a cleanly rendered `1A 15/50`; real packaging (foil, curved bottles, small
  print) has **not been measured**. The user always confirms the text.
- Pillbox matching: deterministic text matching over US 2020 data; coverage of Thai products is low. No accuracy figure
  is claimed.

## Deferred / later

- ~~PP-OCRv5 mobile det model~~ and ~~a barcode fallback for browsers without `BarcodeDetector`~~: done in round 17 P2 for
  the Product check tab (PP-OCRv5 det, zxing-wasm). The "Box / label" tab still uses the user-placed crop box and the native
  `BarcodeDetector` (unchanged on purpose).
- Curated TH/EN/ZH monographs for ~100 Thai household remedies (needs an in-house pharmacist + source review).
- Thai FDA permission for an official API / bulk data; TMT licence; DailyMed SPL pipeline to refresh imprints.
- Crisis net reuse from `fortune-ai.js`: the medicine page has its own small detector (`LQMed.emergency`) to avoid loading
  the 3,700-line fortune engine; the two could be merged into a shared module later.

# PDPA note — medicine checker (`medicine.html`, round 14 / S1-D)

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

## What the page does

A drug-information reference / label reader. The user types, scans (barcode) or OCRs (crop box, on device) a Thai drug
registration number, a Thai food / supplement number, a barcode, a US NDC code or a drug name, and sees verbatim label
text with its source; or enters what a loose pill looks like (imprint, colour, shape, size, score) and sees **candidate**
US products from the public-domain NLM Pillbox data (at least 3 or none; never one answer). No diagnosis, no dose
calculation, no recommendation, no image-based pill identification.

## Why this is sensitive

What medicine a person looks up, and a photo of a pill bottle or prescription label, can reveal **health data**
(PDPA s.26 sensitive data) — of the user or of a family member / patient. The design therefore keeps images on the
device and makes every outward step an explicit opt-in.

## Data flow

| Step | Detail |
|---|---|
| Camera / photo | `getUserMedia` (rear camera) or a file the user picks. Frames and the photo are drawn to an in-memory canvas only; the crop is passed to the on-device OCR model (PP-OCRv5 Thai, ONNX Runtime Web WASM) or to the browser's `BarcodeDetector`. Never encoded, stored or uploaded (unit test asserts no `toDataURL` / `toBlob` / `FormData` / `readAsDataURL` in the page). "Close camera / clear photo" stops the stream and wipes the canvas; leaving the tab or page does the same. The on-screen hint asks users not to capture faces or patient names. |
| OCR result | Placed in the text box for the user to read and correct; nothing is looked up automatically. |
| Offline (default) | Code parsing (registration / food / barcode / NDC) and the loose-pill candidate search run on the device. The Pillbox file is fetched from this site (`vendor/pillbox/`) — a static file, no query is sent. |
| Online lookups (opt-in, default OFF, toggle at the top of the page) | **Text only.** openFDA `drug/label` and RxNav `approximateTerm` (US government services) receive the drug name / NDC / set id; Thai FDA receives the registration number or name **through the LENSIQ Worker** (`backend/src/med.js`, `/api/med/*`). Requests are GET, `credentials: "omit"`, `referrerPolicy: "no-referrer"`. When the page CSP does not list the US hosts (current default), openFDA / RxNav also go through the Worker. |
| Worker (`/api/med/*`, not deployed by default) | Forwards only the cleaned query text; sends no client headers, cookies or address upstream. Keeps no IP: the shared rate limit uses the existing day-salted HMAC caller pseudonym (`store.js`, deleted by the daily cron). Upstream answers are cached at the edge for 24 h keyed by a SHA-256 hash of route + normalised query (no user identifier; the query text is not in the cache key, though the cached upstream answer naturally describes the drug). Logs carry route, row count, cache hit and timing only — never the query or IP (unit-tested). Can be switched off with `MED_ENABLED=false`. |
| Stored on the device | `lq-med-cfg` (pharmacist-mode and history toggles). The online-lookup consent is kept in `sessionStorage` only (`lq-med-online`), so it resets when the tab/browser session ends and must be given again. **Only if the user switches on "Keep a lookup history"**: `lq-med-history` (up to 200 entries: time, kind, query text, names found) and `lq-med-codes` (barcode → registration number the user chose to remember). Delete button + CSV export in the History tab; switching history off offers to delete it. |
| Third parties | api.fda.gov (U.S. FDA), rxnav.nlm.nih.gov (U.S. NLM), porta.fda.moph.go.th (Thai FDA). The US services are outside Thailand: a cross-border transfer of the query text (PDPA s.28). It carries no identifier of the user, but a query can still be health-related. |

## Product check tab (round 17, phase P2, added 2026-11-10)

A fourth tab reads packs of medicines, supplements, cosmetics and food from any country. It is **on-device only** in P2.

| Step | Detail |
|---|---|
| Camera / photo | The same `getUserMedia` rear camera or a picked file. A snapshot is drawn to an in-memory canvas (at most 1,600 px). The camera stops after the snapshot, when the user leaves the tab and when the page closes. "Close camera / clear picture" wipes the canvas. **No image leaves the device in P2**: no upload and no storage. Since the face-blur step (2026-11-10) there is exactly one image encoding, `prepareUpload()`: the **blurred** crop is encoded to JPEG in memory (EXIF dropped) only after the user has seen the preview and pressed "Use this picture", and it is handed to the caller (P7, not wired yet). A unit test asserts that this is the only encoding in `lensiq-pc*.js`, that it comes after the blur and the confirmation, and that there is no `FormData`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` or POST; the e2e test asserts that no non-GET request and no third-party request is made. |
| On-device models | Text detection and recognition (PP-OCRv5, ONNX Runtime Web), barcodes (the browser's `BarcodeDetector`, otherwise the self-hosted zxing-wasm), all loaded from this site. No CDN and no query string is sent. |
| Face check | BlazeFace (MediaPipe, on the device) can run on the snapshot and the crop. In P2 it only computes an allow / block decision for the later upload step (P7) and **nothing is uploaded**. Its result is not stored or shown as information about a person. The owner has decided that P7 will **blur** detected face regions before any upload instead of blocking; that design comes after P2. |
| Face blur before upload (built 2026-11-10, not wired to the AI yet) | Owner decision: before any image upload, every detected face region is blurred automatically; no upload is blocked because of a face. BlazeFace runs on the device on the whole snapshot, on 3 x 3 overlapping tiles and on the picture at upload resolution (long side at most 1,024 px). Each region is blurred and then pixelated (each block replaced by its mean colour), which cannot be reversed. The user sees the blurred picture with "N face regions blurred" and can go back; nothing is sent before "Use this picture" (and in this phase nothing is sent at all). If the detector does not load or run, or its output is malformed, **no picture is sent**: that check goes as text only, and the user is told why. Faces in the picture are not identified, stored, counted per person or used for anything else. Measured miss rate and readability: `docs/product-check/FACE-BLUR-RESULTS.md` (public datasets; small faces are missed more often, so the preview text tells the user to look and go back). |
| Emergency wording | Overdose / poisoning / self-harm wording in the read text opens the same emergency card as the other tab and is never stored. |
| Stored on the device | Nothing by default. **Only with the existing opt-in "Keep a lookup history"** does a row of kind `pc` get added to `lq-med-history`. It holds only the registration-number formats found (normalised numbers), barcode GTINs and the country codes. It **never** holds the OCR text (which could contain a patient name on a dispensing label) or an image (e2e-tested). |
| Third parties | None in P2. The "how to verify" links (oryor.com, Thai FDA, NPRA, HSA, Health Canada, FDA, NMPA, EMA, TGA, PMDA, MFDS, GS1, WHO) open only when the user taps them. |

Open question for counsel (P7, before image mode): the photo may show a hand, a face (blurred per the owner's decision) or a
prescription label with a patient name. P7 adds the patient-name guard (design §8.2).

Open question for counsel (face blur, 2026-11-10): the detector misses some real faces, mostly small ones (numbers in
`docs/product-check/FACE-BLUR-RESULTS.md`). With blur instead of block, a picture in which a face was missed can be sent
after the user has looked at the preview and pressed "Use this picture". Is the preview plus the user's confirmation an
adequate safeguard for an image that may still show an identifiable person (s.26 is not engaged by a face alone, but a
face is personal data under s.6), or should image mode add a stricter step (for example a smaller crop by default, or a
higher-recall detector setting at the cost of label readability)?

## Why we think the risk is manageable (for counsel to confirm)

- Default is fully on-device; nothing leaves without a visible, unticked-by-default opt-in that states "text only, never images".
- No account, no identifier is attached to a lookup; the Worker keeps no IP and logs no query text.
- Emergency / self-harm wording is never written to the history, even with history on.
- History is opt-in, local only, deletable, and the setting text warns that a medicine history is health data and not to enable it on a shared device.
- Images of people are never needed; the page asks users not to capture faces or patient names.

## Open questions for counsel

1. Is the opt-in toggle (with its text) sufficient explicit consent under s.26 for sending a drug name to the Worker and to US services, given no identifier travels with it? The toggle now resets every session (sessionStorage) pending this answer.
2. Cross-border transfer (s.28) of the query text to openFDA / RxNav: is the "no identifier" design enough, or should the UI state the destination country more prominently?
3. Pharmacy / clinic use (pharmacist mode with history on): the pharmacy becomes a controller of patient-related lookups — does it need its own notice / ROPA entry template?
4. Edge cache of upstream answers (24 h, key now SHA-256 of the query): acceptable for 24 h, or should it be shorter? To be mentioned in privacy.html (integrator).
5. Regulatory (not PDPA, flagged for the same review): Drug Act B.E. 2510 s.88 (advertising) and the Medical Device Act (SaMD) positioning as a "drug-information reference / label reader" — see `docs/MEDICINE.md` §Regulatory.

## Deferred

- Text-detection model and the zxing fallback: done in the Product check tab (round 17 P2). The "Box / label" tab still uses a manual crop box and the native `BarcodeDetector`. See `docs/MEDICINE.md`.
- Default retention for the opt-in history (currently 200 entries, kept until deleted).

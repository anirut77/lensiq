# PDPA notes for counsel — all LENSIQ products

For the owner's lawyer (pre-sale review). Compiled from the source code and the per-feature notes, 2026-11-08 (round 14; section E added 2026-11-09, round 16; section F added 2026-11-09, round 17).
**Not legal advice.** Each section says what the feature does, which personal data it touches, where the data lives,
whether anything leaves the device, and the questions we need counsel to answer. The detailed records stay where they
were: [`docs/pdpa/DPIA.md`](pdpa/DPIA.md) (risk assessment), [`docs/pdpa/ROPA.md`](pdpa/ROPA.md) (s.39 record),
[`docs/pdpa/data-map.md`](pdpa/data-map.md) (flows per module), [`docs/pdpa/retention-table.md`](pdpa/retention-table.md),
[`docs/pdpa/consent-texts.md`](pdpa/consent-texts.md) and the public drafts `privacy.html` / `terms.html` (TH / EN / ZH,
same anchors in each language).

**Common ground for every product.** Pages run in the visitor's or the business customer's browser. Camera frames are
analysed in memory and dropped; no page uploads images except `/api/tryon` after per-person consent (off by default).
Storage is the browser of the device running the page (localStorage / IndexedDB, per origin); LENSIQ receives none of it
unless the optional backend is deployed (members, billing, analytics, medicine text proxy). No emotion inference, no lie or
deception detection and no automated decision about a person is built into any new feature; a person decides every flag.
In most deployments the **business customer is the controller** for camera data and LENSIQ provides software; LENSIQ is a
controller only for its own website, member accounts, billing and the optional backend.

## Contents

- **A. Products before round 13** — A1 retail analytics · A2 booth, photo booth and studio · A3 workplace (training
  check-in, interviews, team activity, driver, QC) · A4 fortune pages and the writing assistant · A5 members, billing,
  analytics and the backend · A6 utilities (PDF converter, demo form, combined dashboard)
- **B. Round 13** — B1 LENSIQ Exam · B2 employee time attendance · B3 LENSIQ Gate (parking, village) · B4 zone quick wins
  (queue, tables, after hours, bays) and the solutions catalogue
- **C. Round 14** — C1 crowd counting & density · C2 exam evidence clip · C3 case review · C4 medicine checker ·
  C5 answer-sheet grader (OMR) · C6 auspicious-date planner · C7 lucky-colour mirror · C8 device adapters (design only)
- **E. Round 16** — E1 customer mode and the research-demo toggle · E2 Gate plate check and the owner photo set ·
  E3 organisation accounts (design only — the main PDPA change)
- **F. Round 17** — F1 Product Check + AI Gateway (design approved; cloud AI providers, image mode, cross-border
  processing, Thai FDA data) · F2 AI Gateway core as built in P5 (consent screen, remembered consent, image mode, logs)
- **D. Questions that cut across products**

---

## A. Products before round 13

### A1. Retail analytics — `store.html`, `insights.html`, `customers.html`, `checkout.html`, `signage.html`, `neuro.html`, `creative.html`

- **Store analytics / signage**: anonymous person boxes, line crossings, zones, dwell, heat map; only numbers stored
  (`st-*`, `sg-stats`). Signage age/gender estimates only when the setting is on (sign B on `camera-notice.html`).
  Optional store re-ID keeps a MobileNet appearance vector in memory only, short window, off by default.
- **Customer recognition** (`customers.html`): face matching of **enrolled, consenting members** only — biometric data,
  s.26 explicit consent (form F). Descriptor encrypted on the device (`lqv-cx-faces`); name, phone, consent time in
  `cx-members`.
- **Neuromarketing** (`neuro.html`): expression time series of a participant who consented to an ad test; stored as
  numbers under a label. Counsel: confirm that expression measurement of a consenting test participant is acceptable and
  that it must stay out of workplace / education use (it is not offered there).
- **Checkout / creative**: products and artwork, not people.
- **Combined dashboard** (`insights.html`): its backup export JSON contains every module key, including member names,
  phones and attendance names (not encrypted face data). Treat the file as personal data.
- Questions: lawful basis for anonymous counting (legitimate interest s.24(5) with a posted sign) · whether a balancing
  test document is needed per store · sign A wording.

### A2. Booth, photo booth and studio — `booth.html`, `photobooth.html`, `studio.html`

- **Booth analytics**: face detection plus a same-day 128-D descriptor to avoid double counting repeat visitors (session
  only; an encrypted same-day copy only if "remember" is on; purged at the day change). Counsel: is a same-day
  descriptor without identity "biometric data" under s.26 (DPIA §5)?
- **Photo booth / studio**: segmentation in memory; guest photos are never stored (download or print only); operator
  templates in IndexedDB. **AI try-on** (off by default) sends the person photo and garment image to Replicate (USA) only
  after per-person consent and a model-licence attestation (`docs/TRYON-LICENSING.md`).

### A3. Workplace — `attendance.html` (training check-in), `interview.html`, `teamface.html`, `driver.html`, `qc.html`

- **Training check-in**: face matching of enrolled people, explicit consent (form G), encrypted descriptors, selectable
  retention, QR alternative.
- **Structured interviews**: interviewer-typed scores and evidence, memory only. Optional candidate-facing presentation
  observations (off by default, candidate consents, never used for scoring, hidden in EU mode). Counsel: consent in a
  hiring context may not be free (DPIA §12, L12).
- **Team activity** (`teamface.html`): entertainment only, never for hiring or evaluation; nothing stored.
- **Driver drowsiness / QC**: event logs with no images (driver); product images and reject thumbnails (QC) that may
  catch a worker by accident — staff acknowledgement form H.

### A4. Fortune pages and the writing assistant — `fortune.html` and the 15 reading pages

- Rule-based readings on the device; face / palm landmarks in memory only. The optional writing assistant sends
  **derived facts** (element, card names, zodiac …) and an optional nickname to Anthropic (USA) after consent
  (`fa-consent`); no photo, birth date or contact. Crisis net and harsh-wording filter; "for entertainment and culture".
- The faceread lead form (off by default, needs a tick) stores a nickname + contact locally.

### A5. Members, billing, analytics and the backend — `account.html`, `pricing.html`, `backend/`

- Sign in with Google (no avatar, no access token), sessions, saved readings, quota ledger; PromptPay payments through
  Opn; optional transactional e-mail; opt-in page analytics (`lq-analytics`, page ids only). Erasure and export on the
  account page (with a fresh Google confirmation). Retention per table in `retention-table.md`; cross-border transfers in
  DPIA §11 / §14 (Cloudflare, Google, Opn, e-mail provider).

### A6. Utilities — `converter.html`, demo request form, `server.py` hub

- PDF converter: the uploaded PDF is processed in a temp directory and deleted after the response.
- Demo form (`index.html`): kept in `lq-leads` on the visitor's device in demo mode; not sent anywhere until a lead
  backend is configured.
- LAN hub (`server.py`): numeric daily packs from store nodes, 62 days.

---

## B. Round 13

### B1. LENSIQ Exam — `exam.html`, `exam-lab.html`, `exam-hall.html`, `exam-dashboard.html` (detail: `docs/EXAM.md`)

- **What it does**: tells invigilators which seat to look at (face not visible, several faces, phone or object, seat
  empty / extra person, leaving the exam screen). **Signals only**: no emotion analysis, no suspicion ranking, nothing
  decided automatically; the invigilator records the check result by name.
- **Data**: an event log (time, seat, signal type, outcome, invigilator name) on the institution's devices; the candidate
  page keeps the candidate's own log with no score. No images by default (see C2 for the optional evidence clip).
  Pages exchange only allowlisted JSON fields (`exam-link.js`).
- **Notice and consent**: printable notice + consent template on `exam.html#notice`; declining never opens the camera
  and must not cost the right to sit the exam; access and complaint route through the institution's DPO.
- **Questions**: lawful basis for public institutions (public task s.24(4)) vs. private ones (consent / contract);
  candidates who are minors; retention (template says "no more than 90 days or as the institution's rules say"); EU AI
  Act Annex III 3(d) high-risk obligations if sold into the EU (human oversight, logging, accuracy evaluation).

### B2. Employee time attendance — `attendance.html?mode=employee` (detail: `docs/ATTENDANCE-READINESS.md`)

- Shifts, lateness, OT, breaks, leave, monthly summary and payroll CSV; PIN (salted hash) and QR badge punches as
  alternatives to the face with no employment detriment; append-only manager corrections with a hash chain.
- Time records are kept at least 2 years (Labour Protection Act s.114) **separately** from face retention; face data can be
  withdrawn and erased while time records stay.
- **Questions**: wording of the employee notice; that biometric consent in employment is free when the PIN/QR alternative
  exists; works-rules wording for grace minutes and OT rounding; the face-model licence (research-only training data).

### B3. LENSIQ Gate — `gate.html`, `parking.html`, `village.html`, `gate-notice.html` (detail: `docs/GATE.md` §5)

- Thai plates read on the device (PaddleOCR, Apache-2.0); a guard confirms every read; auto-open is off by default.
- **Plates linked to a person are personal data.** The operator acknowledges the notice before the camera starts; sign +
  privacy-notice template on `gate-notice.html`; plate crops off by default (7–30 days when on), logs 90 days by default,
  receipts 5 years; deny-list entries need a recorded reason. No face recognition, no behaviour inference.
- **Questions**: legitimate interest s.24(5) vs. contract s.24(3) for car parks and juristic persons; visitor passes
  (visitor names / phone numbers typed by guards); the 2026 PDPC draft guideline on CCTV and housing estates once final.

### B4. Zone quick wins — `queue.html`, `tables.html`, `afterhours.html`, `bays.html`; catalogue `solutions.html`

- Anonymous boxes only, numbers stored (`lqq-*`, `lqt-*`, `lqa-*`, `lqb-*`, `lqz-cam-*`); every alert is "for a person to
  check" with a real/false tally. After-hours alerts may concern staff → staff notice (form H). Bays reads no plates.
- The catalogue lists what is available, in pilot or coming soon, with a privacy note per card and a "we will not build"
  list (emotion/attention scoring, public biometric ID, drowning, forklift).

---

## C. Round 14

The per-feature notes below were written by the builders from the code and are reproduced as written (headings shifted
one level). The integration facts that apply to all of them: each page is listed in the menu, in the analytics page list
(page views only, opt-in), in `privacy.html` §4 / §6 / §7 / §9 (`#p4-r14`, `#p6-med`, `#p7-r14`, `#p9-r14`) and, where
relevant, in `terms.html` (`#t3-r14`, `#t5-r14`, `#t11-med`) and `camera-notice.html` (`#n-new`).

### C1. Crowd counting & density (`crowd.html`, round 14 / S1-A)

*Source: [`docs/pdpa-notes/S1-A-crowd.md`](pdpa-notes/S1-A-crowd.md).*

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

#### What the page does

Counts people in the camera view and in zones the operator draws, for events, booths and shopfronts:
people in view, density heatmap and time series, peak hours, entry/exit line counter, time spent per zone,
visitors per hour (approximate), conversion against numbers the operator types in (purchases / sign-ups), and an
optional shopfront funnel (walked past → stopped → entered). It also exports a CSV, a printable daily summary, and an
optional numbers-only JSON pack in the existing `lensiq-agg` format for `store.html`'s multi-device hub (a file download, not a network call).

#### Data flow

| Step | Detail |
|---|---|
| Source | One camera (`getUserMedia`), or the demo mode with synthetic boxes and no camera. |
| Processing (on device) | YOLOX-Nano / COCO-SSD person boxes (`lensiq-detect.js`), anonymous per-session track ids (`lensiq-track.js`), zone maths (`lensiq-zones.js`), line crossing / grid / aggregates (`lensiq-crowd.js`). Frames are analysed in memory and dropped. No face detection, recognition, descriptor, re-identification, age, gender or emotion inference. |
| Stored on device (`localStorage`, prefix `lqcr-`) | Zone shapes and roles, max-people and area per zone, counting line, settings (incl. an optional spot/event name), notice acknowledgement time, the alert list (time, zone, text, staff check), and per-day numbers: peak, in/out, 24-hour series (average, peak, in, out, approximate visitors), per-minute average/max, a 24×14 grid of person-seconds, per-zone visits/dwell/peak, operator-entered outcome numbers, funnel counts. **No images, no boxes, no track ids are persisted.** |
| Leaves the device? | **No.** No network request is made by the page code (unit test asserts no fetch / XHR / beacon / WebSocket / image encoding). CSV, printed summary and JSON pack are created only when the operator presses the button, and contain numbers and zone/spot names only. |
| Retention | Storage cap (functional, not a policy choice): on page load and at day rollover, past day records lose their per-minute series (only today's chart uses it) and only the newest 60 day records are kept (`LQCrowd.DAY_KEEP`); older ones are deleted. Otherwise until the operator presses "Delete all statistics" (per-day records + alert list) or clears the browser. Zone shapes and settings stay until removed. Counsel may want a shorter default (change `DAY_KEEP`). If browser storage is full the page says so instead of silently failing. |
| Demo mode | Simulated numbers are kept in memory only: they never enter the real day record, the alert list (a separate `lqcr-demo-log`, deleted when the demo stops) or the counting line, the CSV is marked "simulated data", and the JSON pack is not exported while the demo runs. |

#### Why we think the risk is low (for counsel to confirm)

- The page processes images of people (personal data under PDPA s.6 as far as a person could be identified in the live
  frame) but only in volatile memory, to produce aggregate counts that do not identify anyone.
- No biometric data (PDPA s.26) is created: no face template, no re-identification vector.
- Track ids are random per session and reset on reload; "visitors per hour" is explicitly labelled approximate.
- A notice gate requires the operator to confirm a camera notice is posted before the camera can start (`camera-notice.html`, sign A),
  and the page shows a printable notice text. Alerts ("zone at its maximum") are worded as a prompt for staff to look; a person decides.

#### Open questions for counsel

1. Is the posted notice + legitimate interest (crowd safety / staffing) a sufficient lawful basis for anonymous counting at events and shopfronts, or should events also mention it in ticket terms?
2. Should the conversion feature carry wording that the typed-in sales figures must be totals only (never per-customer)? The UI already says it does not know who bought.
3. Default retention for the per-day numeric records (currently the newest 60 days, past days without the per-minute series).
4. Whether the optional spot/event name in exports needs any guidance (it is free text typed by the operator).

#### Deferred

- A user-facing retention setting for `lqcr-day-*` (the 60-day cap is a storage safeguard; the policy default needs a product / counsel decision).
- Multi-camera on one device (use one device per spot and the `lensiq-agg` pack instead).

### C2. S1-B LENSIQ Exam evidence clip (for counsel, not legal advice)

*Source: [`docs/pdpa-notes/S1-B-exam-clip.md`](pdpa-notes/S1-B-exam-clip.md).*

Feature: optional 10-second video clip around an exam flag, kept on the camera device (candidate's lab computer in
Mode B, the room camera laptop/phone in Mode A). Design reference: docs/EXAM.md "Evidence clip".

#### What is processed

| Item | Detail |
|---|---|
| Data | Video frames (no audio) of the candidate (Mode B) or of a row of seats (Mode A, may show several candidates and invigilators). Clip metadata: time, room code, seat number, signal type (e.g. "phone may be in view"), how it was kept, expiry date. No name, no student ID beyond the seat number typed for the exam, no face descriptor, no identification. |
| When | Only when the institution switches clips on for that exam (default OFF). While on, the last ~10 s are held in browser memory only and overwritten continuously. A clip is written to storage only when (a) an invigilator taps "Keep clip" on a flag (named, logged), or (b) the institution enabled auto-keep. Un-kept clips are dropped from memory after 10 minutes. |
| Where | The browser of the camera device only (IndexedDB), encrypted with AES-GCM 256 (LQVault, non-extractable key in the same browser). Never uploaded; the dashboard receives only a JSON status ("pending", "kept", "deleted"). A person may explicitly "save as file" to hand a clip to the exam committee — that copy is then outside LENSIQ's control. |
| Retention | Auto-delete after 1 / 7 / 14 (default) / 30 / 90 days, chosen per exam; manual delete per clip or all; delete also destroys the key. |
| Not done | No audio, no continuous recording, no emotion / expression / lie analysis, no face recognition, no automated decision; the clip is evidence for a human review, not a verdict. |

#### Points for counsel

1. **Lawful basis.** Exam video of identifiable students is personal data (s.6). It is not biometric data under s.26 as
   long as no face template / identification is derived (none is). Likely basis: legitimate interest / public task of
   the institution for exam integrity (s.24(5)/(4)) with the in-page notice; the lab page also asks for consent and the
   consent text names the clip. Please confirm whether consent should be the basis (then a real alternative for those
   who decline is needed — the lab page already offers "decline / ask for an alternative" without opening the camera)
   or a notice suffices. Minors: institutions with under-20 candidates may need guardian consent (s.20).
2. **Notice text** (TH / EN / ZH in i18n/*-exam.js, keys `exam.lab.n2c`, `exam.lab.n5c`, `exam.lab.n5a`,
   `exam.lab.consentClip`, `exam.hall.clipWarn`): please review wording, the retention statement and the access /
   complaint route (existing line n4 points to the DPO). The printable room notice on exam.html does not mention clips
   yet (integrator item) — Mode A rooms need it.
3. **Third parties in hall clips.** A Mode A clip can show neighbouring candidates and staff. Blurring other seats is
   deferred. Data minimisation argument today: 10 s only, kept only on a named human action, short retention.
4. **Shared lab computers.** In Mode B the clip sits encrypted on the lab computer the candidate used. The kept-clip
   list (play / save as file / delete) is behind an invigilator PIN set on the device before clips can record;
   candidates (including the next candidate on that computer) see only the number of clips. The PIN is a UI gate, not
   encryption: someone with devtools or who clears the browser's site data could still remove local data. Counsel may
   still want a policy line (kiosk profile, collect-and-delete procedure, who holds the PIN).
4a. **Retention enforcement.** Expired clips are deleted when any exam page is opened on the device, every minute
   while a camera page is open, and can never be played after their date. If the device is never used again for an
   exam, the encrypted record and its key stay until the browser data is cleared — a device-handover / decommission
   step ("delete all clips") belongs in the institution's procedure.
5. **Data subject rights.** Access: the candidate's own event log marks "clip stored on this device"; a copy can be
   produced with "save as file". Erasure: delete on the device (key destroyed). Record of processing / DPIA:
   docs/pdpa/ROPA.md and DPIA.md need an "exam evidence clip" row (integrator / owner).
6. **Security (s.37(1)).** AES-GCM with a non-extractable WebCrypto key; no plaintext fallback (recording is not even
   started when the browser cannot encrypt); per-clip key deleted on delete; max 60 clips per device.
7. **EU AI Act (if sold in the EU).** Exam proctoring is high-risk (Annex III 3(d)); the clip supports human
   oversight and logging. No emotion inference (Art 5(1)(f)) — enforced by tests/unit/exam-clip.test.js.

### C3. S1-C Case review tool (`case-review.html`)

*Source: [`docs/pdpa-notes/S1-C-case-review.md`](pdpa-notes/S1-C-case-review.md).*

For the owner's counsel (pre-sale review). Draft by the builder; not legal advice.

#### What the feature does
A reviewer opens video clips from local files, adds timestamp tags and notes, changes the case status
(open / in review / closed) and exports an audit log (CSV / JSON) or a printable case summary. Every action is
written to an append-only audit log with the reviewer's name, the time (UTC) and a SHA-256 hash chained to the
previous entry, so editing or removing an entry on the device can be detected ("check integrity").

**Not lie / deception detection.** The page does no automated analysis of the video at all: no face detection or
recognition, no emotion inference, no voice / stress / credibility analysis, no AI model is loaded. A banner says
"this tool does not judge whether anyone is telling the truth or lying"; the tag types are limited to observable
facts (event seen, speech / key statement, document / object shown, person enters / leaves frame, picture / sound
unclear, needs a second reviewer, other). Unit tests assert that no camera, AI or network API is used and that no
emotion / deception vocabulary appears in tag types, actions or statuses.

#### Personal data involved
| Data | Where | Default | Retention |
|---|---|---|---|
| Video clips (may show identifiable people, possibly employees / customers) | read from a local file into memory (object URL) | **not stored**; gone when the page closes | n/a |
| Stored copy of a clip | IndexedDB `lensiq-case`, AES-GCM 256, non-extractable key in the same browser | **off**; only when the reviewer taps "store encrypted on this device" per clip (logged); only a file whose fingerprint matches the original can be stored | auto-deleted after 7 / 30 (default) / 90 / 180 / 365 days, **checked when case-review.html is opened** (so the copy is removed on the first visit after expiry, not at the exact moment); logged as `clip.purge` in the case log, or in the device ledger when the case log cannot take the entry; "delete stored copy" any time |
| Clip metadata: file name, size, duration, SHA-256 fingerprint | localStorage `lqcase-cases` | yes | until the case is deleted |
| Case title, reference no., tags, notes, status, reviewer names, audit log | localStorage `lqcase-cases` (plain text, not encrypted) | yes | until the case is deleted or "delete all" |
| Device ledger: case deletions (case id, who, when, entry count, last hash; no title / notes), retention-setting changes (who, from, to), purges that could not be written to a case log (case id, clip id) | localStorage `lqcase-ledger` | on those events | until "delete all" |
| Reviewer name (self-declared, no authentication) | localStorage `lqcase-reviewer` | yes | until "delete all" |

Nothing leaves the device: no upload, no server call, no analytics events are sent by this page's own scripts
(the shared nav / analytics opt-in of the site applies as on every page). Exports are files the reviewer saves
deliberately; they contain no video.

#### Points for counsel
1. **Purpose / lawful basis** — typically HR investigations, incident review, security. The controller is the
   customer organisation; LENSIQ provides software running on the customer's device (processor-like role, but no
   data reaches LENSIQ). Basis is likely legitimate interest (s.24(5)) or legal obligation; employees / visitors
   should be informed by the organisation's CCTV / investigation notice (page shows a reminder).
2. **Sensitive data (s.26)** — notes are free text and could contain health, criminal or other sensitive data. The
   UI warns "do not enter more sensitive data than needed". Consider whether the contract / guide should require it.
3. **Notes are not encrypted at rest** (only stored clips are). Mitigation today: device-local, screen-lock advice,
   delete case / delete all. Deferred option: encrypt case logs with the same IndexedDB key (see below).
4. **Reviewer identity is self-declared** — the audit log proves the record was not altered after the fact on that
   device, not who the person really was. Should be stated in customer docs; the page says so.
5. **Hash chain limits** — the chain is an unkeyed SHA-256 chain. It detects edits made *outside* the page (a
   hand-edited localStorage value, a doctored JSON export) but it is **tamper-evident, not tamper-proof**:
   - anyone with access to the device / browser dev tools can rewrite an entry and recompute every hash after it
     (the hashing code is public and in the page); the rebuilt chain then checks as consistent;
   - truncating the newest entries is not detectable from the log alone;
   - someone with device access can delete the whole case (the deletion ledger records it, but the ledger is on the
     same device and has the same limits).
   The real anchor is the **last hash on a printed summary or an export kept elsewhere** (with someone other than the
   reviewer). The UI therefore says "hash chain consistent / no edits made outside this page were found — compare the
   last hash with a printed or exported copy", not "cannot be edited". Customer docs for HR / disciplinary use must
   say the same. A device-bound HMAC key was considered and not used: it would not stop someone using the page itself,
   and it would stop exports from verifying on another reviewer's device.
6. **Data-subject rights** — access: export JSON / CSV / printed summary; erasure: delete case (clips + log) with a
   minimal ledger entry kept (justify as accountability record, or allow "delete all"); objection: organisational.
7. **Retention** — stored clips auto-delete (default 30 days), on the next visit to the page after expiry (a static
   site has no background job). Changing the period needs a reviewer name and is written to the device ledger; a
   shorter period that would delete stored clips immediately must be chosen twice. Case logs have no automatic
   retention; consider a default retention period for closed cases in a later round.
9. **File identity** — a clip's SHA-256 fingerprint is computed in memory (limit 1 GB on desktop, 256 MB on phones /
   low-memory devices). Re-opening a file records `match: true` (same file), `false` (different file) or `null` (could
   not be verified, e.g. too large). Tags and notes made while a non-matching or unverified file is open record that
   file's fingerprint (`loaded`) and show a warning in the page, CSV detail and printed summary.
10. **Separate clip vault (deviation from the round spec, needs sign-off)** — the spec says "IndexedDB + LQVault". The
   case clips use the same scheme (AES-GCM 256, non-extractable WebCrypto key in IndexedDB) but their own key store
   (`lensiq-case`), so that "delete all face data" on face pages does not lock case clips and vice versa. Consequence
   for privacy text: **deleting face data does not delete case clips**; they are deleted with "delete stored copy",
   "delete this case", "delete all case-review data" or retention. privacy.html must say this.
8. **Exports** leave the tool's control once saved; customer policy should cover where exported files are kept.

#### Deferred (and why)
- Encrypting case logs / notes at rest: needs a migration path and a fallback for non-secure contexts; kept out of
  this round to avoid blocking use on http:// installs. The clip vault already uses a separate key store from
  LQVault so "delete all face data" elsewhere does not lock case clips (and vice versa).
- Multi-device / shared review: handled by JSON export -> import (chain re-verified on import); no server sync.
- Automatic retention for closed cases (see point 7).

### C4. Medicine checker (`medicine.html`, round 14 / S1-D)

*Source: [`docs/pdpa-notes/S1-D-medicine.md`](pdpa-notes/S1-D-medicine.md).*

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

#### What the page does

A drug-information reference / label reader. The user types, scans (barcode) or OCRs (crop box, on device) a Thai drug
registration number, a Thai food / supplement number, a barcode, a US NDC code or a drug name, and sees verbatim label
text with its source; or enters what a loose pill looks like (imprint, colour, shape, size, score) and sees **candidate**
US products from the public-domain NLM Pillbox data (at least 3 or none; never one answer). No diagnosis, no dose
calculation, no recommendation, no image-based pill identification.

#### Why this is sensitive

What medicine a person looks up, and a photo of a pill bottle or prescription label, can reveal **health data**
(PDPA s.26 sensitive data) — of the user or of a family member / patient. The design therefore keeps images on the
device and makes every outward step an explicit opt-in.

#### Data flow

| Step | Detail |
|---|---|
| Camera / photo | `getUserMedia` (rear camera) or a file the user picks. Frames and the photo are drawn to an in-memory canvas only; the crop is passed to the on-device OCR model (PP-OCRv5 Thai, ONNX Runtime Web WASM) or to the browser's `BarcodeDetector`. Never encoded, stored or uploaded (unit test asserts no `toDataURL` / `toBlob` / `FormData` / `readAsDataURL` in the page). "Close camera / clear photo" stops the stream and wipes the canvas; leaving the tab or page does the same. The on-screen hint asks users not to capture faces or patient names. |
| OCR result | Placed in the text box for the user to read and correct; nothing is looked up automatically. |
| Offline (default) | Code parsing (registration / food / barcode / NDC) and the loose-pill candidate search run on the device. The Pillbox file is fetched from this site (`vendor/pillbox/`) — a static file, no query is sent. |
| Online lookups (opt-in, default OFF, toggle at the top of the page) | **Text only.** openFDA `drug/label` and RxNav `approximateTerm` (US government services) receive the drug name / NDC / set id; Thai FDA receives the registration number or name **through the LENSIQ Worker** (`backend/src/med.js`, `/api/med/*`). Requests are GET, `credentials: "omit"`, `referrerPolicy: "no-referrer"`. When the page CSP does not list the US hosts (current default), openFDA / RxNav also go through the Worker. |
| Worker (`/api/med/*`, not deployed by default) | Forwards only the cleaned query text; sends no client headers, cookies or address upstream. Keeps no IP: the shared rate limit uses the existing day-salted HMAC caller pseudonym (`store.js`, deleted by the daily cron). Upstream answers are cached at the edge for 24 h keyed by a SHA-256 hash of route + normalised query (no user identifier; the query text is not in the cache key, though the cached upstream answer naturally describes the drug). Logs carry route, row count, cache hit and timing only — never the query or IP (unit-tested). Can be switched off with `MED_ENABLED=false`. |
| Stored on the device | `lq-med-cfg` (pharmacist-mode and history toggles). The online-lookup consent is kept in `sessionStorage` only (`lq-med-online`), so it resets when the tab/browser session ends and must be given again. **Only if the user switches on "Keep a lookup history"**: `lq-med-history` (up to 200 entries: time, kind, query text, names found) and `lq-med-codes` (barcode → registration number the user chose to remember). Delete button + CSV export in the History tab; switching history off offers to delete it. |
| Third parties | api.fda.gov (U.S. FDA), rxnav.nlm.nih.gov (U.S. NLM), porta.fda.moph.go.th (Thai FDA). The US services are outside Thailand: a cross-border transfer of the query text (PDPA s.28). It carries no identifier of the user, but a query can still be health-related. |

#### Why we think the risk is manageable (for counsel to confirm)

- Default is fully on-device; nothing leaves without a visible, unticked-by-default opt-in that states "text only, never images".
- No account, no identifier is attached to a lookup; the Worker keeps no IP and logs no query text.
- Emergency / self-harm wording is never written to the history, even with history on.
- History is opt-in, local only, deletable, and the setting text warns that a medicine history is health data and not to enable it on a shared device.
- Images of people are never needed; the page asks users not to capture faces or patient names.

#### Open questions for counsel

1. Is the opt-in toggle (with its text) sufficient explicit consent under s.26 for sending a drug name to the Worker and to US services, given no identifier travels with it? The toggle now resets every session (sessionStorage) pending this answer.
2. Cross-border transfer (s.28) of the query text to openFDA / RxNav: is the "no identifier" design enough, or should the UI state the destination country more prominently?
3. Pharmacy / clinic use (pharmacist mode with history on): the pharmacy becomes a controller of patient-related lookups — does it need its own notice / ROPA entry template?
4. Edge cache of upstream answers (24 h, key now SHA-256 of the query): acceptable for 24 h, or should it be shorter? To be mentioned in privacy.html (integrator).
5. Regulatory (not PDPA, flagged for the same review): Drug Act B.E. 2510 s.88 (advertising) and the Medical Device Act (SaMD) positioning as a "drug-information reference / label reader" — see `docs/MEDICINE.md` §Regulatory.

#### Deferred

- Text-detection model (crop box is manual), zxing fallback for browsers without `BarcodeDetector` (iOS Safari): see `docs/MEDICINE.md`.
- Default retention for the opt-in history (currently 200 entries, kept until deleted).

### C5. S2-E1 MCQ answer-sheet grader (`omr.html`)

*Source: [`docs/pdpa-notes/S2-E1-omr.md`](pdpa-notes/S2-E1-omr.md).*

For the owner's counsel (pre-sale review). Draft by the builder; not legal advice.

#### What the feature does
A teacher creates an exam (20 / 40 / 60 / 100 questions, 4 or 5 choices, optional student-number bubbles), prints
an A4 answer sheet, enters the answer key, and scans filled sheets with a phone camera (or chooses photos from the
device). The page finds the four black corner squares, straightens the picture (perspective correction) and measures
how dark each bubble is. It shows a score, flags questions with several or faint marks, lets the teacher correct any
bubble, and gives item analysis (difficulty, discrimination, KR-20) and CSV exports.

**No AI and no faces.** Reading is plain arithmetic on pixel brightness in `lensiq-omr.js`; no model is loaded, no
face detection or recognition, no emotion / behaviour / attention analysis. A unit test asserts that the page code
uses no AI / face / network APIs and that no image is written to storage. The camera is pointed at paper; if a person
appears in the frame nothing about them is processed or kept.

#### Personal data involved
| Data | Where | Default | Retention |
|---|---|---|---|
| Camera frames / chosen photos of answer sheets | memory only, read and dropped | never stored, never uploaded | n/a |
| Straightened gray picture of each scanned sheet (for the review screen) | memory only (JS Map) | not stored | gone when the page is closed / reloaded |
| Exam title, answer key | localStorage `lqomr-v1` | yes | until "delete exam" / "delete all" |
| Per sheet: answers read, flags, student number (as bubbled; teacher can edit), optional name typed by the teacher, scan time, which answers were corrected by hand, score | localStorage `lqomr-v1` (plain text) | yes | until the teacher deletes the sheet, the exam, or all data |
| CSV exports (scores, item analysis) | files the teacher saves deliberately | on tap | outside LENSIQ's control |

Nothing leaves the device: no upload, no server call, no analytics events from this page's own scripts (the site's
shared nav / analytics opt-in applies as on every page).

#### Points for counsel
1. **Controller / purpose** — the school (or teacher) is the controller; purpose is assessment. LENSIQ provides
   software running on the teacher's device and receives no data. Basis is likely the school's public task /
   contract (s.24(3)/(4)) or legitimate interest (s.24(5)); counsel to confirm for private tutoring schools.
2. **Minors (s.20)** — most data subjects are minors. Design minimises data: student number by default, the name
   field is optional and typed by the teacher, no images kept, no faces processed. The page tells teachers to delete
   data once scores are entered into the school system. Consider whether consent of parents is ever needed (likely
   not for routine assessment by the school, but counsel to confirm).
3. **Accuracy / human decision** — scores are computed automatically from marks; the teacher reviews flagged sheets
   (several marks, faint marks, unreadable or duplicate student number, unknown sheet format) and confirms. Item
   analysis hints ("check the key") are suggestions only; the key is never changed automatically. Is a disclaimer in
   the terms needed that final grades are the teacher's responsibility?
4. **Storage not encrypted** — scores and student numbers in localStorage are plain text on the teacher's device.
   Mitigation today: device-local, delete buttons, screen-lock advice. Deferred option: encrypt with the LQVault key
   used elsewhere.
5. **Shared devices** — a school tablet shared between teachers would expose other teachers' exams. Deferred option:
   per-teacher PIN / profiles.
6. **Exports** — CSV files contain student numbers, names (if typed) and scores; once saved they are the school's
   responsibility (formula-injection safe, UTF-8 BOM).

#### Deferred (not built in this round)
- Encrypted-at-rest storage of scores; per-teacher profiles.
- Multiple exam versions (form A / B) on one key; negative marking.
- Reading a handwritten name (OCR) — deliberately not done (more personal data, needs a model).

### C6. Auspicious-date planner (`planner.html`, round 14 / S2-E2)

*Source: [`docs/pdpa-notes/S2-E2-planner.md`](pdpa-notes/S2-E2-planner.md).*

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

#### What the page does

Lists good candidate days for moving into a new home, opening a shop or starting new work over 1–3 months. Each day
shows its basis: weekday and day colour, approximate Thai lunar day/month (waxing moon, even lunar month for moving
house), the owners' birth weekday (Thai taksa position of that weekday) and, optionally, their zodiac year against the
day's Chinese-calendar animal. The user can tick days and save them as an `.ics` calendar file, or print the list.
Good days only: no day is labelled bad and no warning is shown; no lucky numbers; no paid remedies; no camera.

#### Data flow

| Step | Detail |
|---|---|
| Input | Event type, month range; per owner (max 2, optional): birth weekday, zodiac year; optional birth date used only to work out the weekday; optional planned time for the calendar file. |
| Processing (on device) | `lensiq-planner.js` on top of `horoscope.js` (astronomical new/full moon, Thai lunar month, taksa, Chinese day pillar). Pure JavaScript in the page. |
| Stored on device | **Nothing.** No `localStorage` / `sessionStorage` / IndexedDB / cookies (unit test scans the code; e2e checks storage after a run). Inputs vanish when the page is closed. |
| Leaves the device? | **No.** No network request is made by the page code (unit test; e2e asserts only same-origin page files are fetched). The `.ics` file is generated in the browser and handed to the user as a download; it contains the chosen dates, the reasons text (which mentions the owner's birth *weekday* and zodiac animal, not the birth date) and a disclaimer. |
| Analytics | The page has no analytics call of its own. If the integrator adds it to `ANALYTICS_PAGES`, only the existing page-view counter applies (no form values). |

#### Assessment (for counsel to confirm)

- A birth date is personal data (PDPA s.6) but is not sensitive data (s.26). Here it is processed transiently in the
  user's own browser for the user's own purpose and never collected by LENSIQ, so LENSIQ is arguably not a data
  controller for it. A second owner's birth weekday may be entered by the user on that person's behalf; the same
  transient, on-device handling applies.
- Consumer protection / fortune wording: the page states "for cultural planning, not a guarantee; traditions differ —
  ask a monk or astrologer you trust", and that lunar days are approximate (±1 day vs the official Thai calendar).
  Fortune hard bans (no death / illness / accident / disaster / infidelity, no lottery numbers, no paid remedies) are
  enforced by a unit test that runs every reason string (TH/EN/ZH) through `FortuneAI.safety.isSafe`.
- Retention: none. Exported `.ics` files are under the user's control.

### C7. Lucky-colour outfit mirror (`luckycolor.html`, round 14 / S2-E3)

*Source: [`docs/pdpa-notes/S2-E3-luckycolor.md`](pdpa-notes/S2-E3-luckycolor.md).*

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

#### What the page does

A "mirror" for the Thai custom of wearing the lucky colour of the day (สีมงคลประจำวัน, Taksa of the day). The visitor
picks a goal (work, money, love, support from mentors) and a day (today by default). With the camera on, the page
separates the clothing below the face, finds the outfit's main colours (for example "red 82 %, white 18 %") and says, in
positive terms only, how that colour relates to the day's colours for the chosen goal. It also shows the day's colours and
a week table without the camera. It is for entertainment, based on traditional belief, and says so.

#### Data flow

| Step | Detail |
|---|---|
| Source | The device's own camera (`getUserMedia`, front camera), started only when the visitor presses "Turn on camera". |
| Processing (on device) | Each ~0.5 s a frame is drawn to an in-memory 320 px canvas. MediaPipe Selfie Multiclass (Apache-2.0, already vendored: `vendor/models/selfie-multiclass-256-f16.onnx`, run by onnxruntime-web) labels hair / skin / face skin / clothes; the clothes pixels **below the face-skin box** are kept and their colours counted into 13 colour names (`lensiq-luckycolor.js`). Fallbacks: the vendored MediaPipe selfie segmenter (person mask minus the head band) or a fixed box on screen. The face box is a bounding rectangle used only to cut the head off the clothing mask: no face detection model, landmarks, recognition, descriptor, age, gender, emotion, body-shape or attractiveness inference. |
| Stored on device (`localStorage`) | `lqlc-prefs` = `{v, goal, day}` (for example `{"v":1,"goal":"money","day":"auto"}`). Nothing else: no image, no colour history, no result log. A "Clear remembered settings" button removes it. |
| Leaves the device? | **No.** The page code makes no network request (unit test asserts no fetch / XHR / beacon / WebSocket / image encoding / MediaRecorder / IndexedDB; the e2e test asserts no `/api/` call). Model and runtime files are static files of the site itself. |
| Retention | Frames: only in memory while the camera runs, overwritten every analysis, dropped when the camera stops or the page closes. Preferences: until cleared. |

#### Why we think the risk is low (for counsel to confirm)

- The live frame shows the visitor (personal data under PDPA s.6), but it is the visitor's own device, started by the
  visitor, processed in volatile memory only, with no recording and no transfer.
- No biometric data (PDPA s.26) is created or kept: the face-skin box is a rectangle in a mask, not a template, and is not stored.
- Results are colour names and percentages; wording is positive only (no "avoid", no misfortune, the กาลกิณี bhumi is never named),
  consistent with the fortune pages' principles (no fear selling, nothing sold to "fix" luck).

#### Kiosk / event use (if a business runs it on a shared screen)

The same page could run on a booth tablet. Then the business is the controller for the live view: a camera notice
(`camera-notice.html`) should be posted near the screen. The page itself still records and sends nothing. A notice gate
like the zone pages' was not added because the default use is a person's own phone; counsel may want one for kiosk mode.

#### Open questions for counsel

1. Is a notice gate needed when the page is run as a kiosk at an event (see above), or is a posted sign enough?
2. Any consumer-protection wording needed for a belief-based entertainment feature beyond the disclaimer shown at the top?

#### Deferred

- Analysing a photo from the gallery (file input) instead of the live camera — not built, to keep the "no image" story simple.
- A shareable result card (would create an image of the person; deliberately not built).


### C8. Device adapters — design only (`docs/DEVICE-ADAPTERS.md`, round 14 / S2-D)

No code ships. The design describes one interface for future external devices (heart-rate strap over Web Bluetooth,
serial / USB sensors, webhooks) with per-device consent, on-device processing and storage, and a **hard prohibition**:
physiological signals (heart rate, RR intervals, skin conductance, breathing, temperature) will never be used for lie,
deception, truthfulness, stress-as-guilt, emotion or mood inference in any product, mode or export (exam, case review,
HR, interviews, fortune). Counsel: heart-rate and similar readings are **health data** (sensitive, s.26) the moment they
are linked to a person; review the consent design before any adapter is built.

---

## E. Round 16

### E1. Customer mode by default and the "Research demo" toggle (`lensiq-config.js`, `lensiq-research.js`)

- Every host, including the public GitHub Pages site, now runs in **customer mode**: the age/gender (UTKFace-trained) and
  face-expression models are never loaded, so signage records no age/gender, smile or valence; booth and photobooth run
  without expression; neuro opens and explains but does not open the camera. Less processing than before: no new data.
- A per-device toggle, **off by default**, brings the two research-licence models back on that device only. It stores the
  word on/off in `localStorage` (`lq-research-demo`; listed in `privacy.html` §9, TH/EN/ZH). An installer locks it off
  with `LENSIQ_RESEARCH_DEMO = false`; the go-live checklist reports the profile as done only with that lock.
- Face detection, landmarks and recognition are unchanged and still depend on the F5/F6 licence opinion.
- **For counsel:** confirm that a demo device with the toggle on (staff demonstrations only) needs no extra notice beyond
  the existing camera notice, and that the licence label wording ("research-licence models, not for commercial use") is
  adequate. Not legal advice.

### E2. Gate plate check and the owner photo set (`docs/GATE.md` §3c)

- The plate check only reduces automatic reads of non-plate text (signs, boards); it adds no data. A guard still confirms
  every read.
- The owner's ~100 phone photos for testing stay **outside the repository** (default `~/LENSIQ-field/plates/`;
  `field-data/` is git-ignored); the tool refuses a filled-in label sheet inside the repo. Photos of public streets may
  show people and other vehicles' plates: **for counsel**, confirm the owner may photograph plates in public for internal
  testing, and how long the photos and sheet may be kept (we propose: delete after the pilot report).
- Public benchmark photos (Wikimedia Commons, CC BY / BY-SA / PD) are used for measurement only, never shipped
  (`docs/CREDITS-MEDIA.md` §2b).

### E3. Organisation accounts — design only (`docs/ORG-ACCOUNTS-DESIGN.md` §9–10)

- **The main change if built:** once Exam, Gate or Attendance data syncs to the Cloudflare backend, LENSIQ stops being a
  software supplier with no access and becomes a **processor (s.40)** for each customer: a data processing agreement is
  needed before sync is switched on. Every synced record is a **cross-border transfer** (s.28–29): D1 offers only an
  `apac` location hint, no Thai jurisdiction.
- Default design: face descriptors, exam clips, plate crops, frames, PIN hashes, QR tokens, the barrier relay token and
  visitor names stay on the device; only the org owner can switch sync on. DPIA delta R38–R47 (10 risks, all medium
  before measures, low after — depending on counsel's answers). The 16 questions for counsel are in §10 of the design.
- Nothing is built; the owner approves the design and counsel reviews §9–10 first.

## F. Round 17

### F1. Product Check + AI Gateway (`medicine.html` new tab; design: `docs/PRODUCT-CHECK-DESIGN.md`)

**Status.** The owner approved the design on 2026-11-09 and it is being built (P0–P9) **for testing; LENSIQ is not
charging yet.** Counsel reviews this section, and the running list in `docs/CTO-BRIEF.md` §8, **before charging starts.**
Not legal advice.

#### What the feature does

- The user points the camera at a medicine, supplement, cosmetic or food pack (any country). On the device: image quality
  check, product crop, barcode / QR / GS1 reading, OCR, registration-number parsing and a rule-based over-claim check.
- The card lists **risk signals and how to verify them**: never "genuine" or "fake", never dosing advice, always
  "Not a definitive identification. Confirm with a pharmacist" with the 1669 / 1367 lines.
- Optional official lookups go through the LENSIQ Worker as **text only** (registration number or name): Thai FDA web
  service, openFDA, Health Canada, Singapore HSA, EU Safety Gate, RASFF and others (design §4).
- Optional cloud AI (structured fields, claim classifier, translation) goes through the **AI Gateway** (design §10).

#### What changed on approval (owner decisions, design §15)

- **PC-D1:** image mode (a product crop) is approved as an explicit exception to the "only derived facts are sent" rule,
  for Product Check only.
- **PC-D2:** **every AI provider is enabled in every build**: Anthropic (US / global routing), Google Gemini (paid tier
  only; no residency), OpenAI (processing outside Thailand), Alibaba Model Studio (Singapore), **DeepSeek (China; its
  privacy policy says data is stored in the PRC and may be used for training)**, z.ai (Singapore), Kimi (region not
  verified) and OpenRouter (a second processor that routes to another provider). The admin can switch any provider off.
- **PC-D9:** image mode is allowed after **one consent per user**, with an unticked "remember my choice" option that the
  user can withdraw at any time; text only stays a choice and is the fallback; product crop only; the upload is blocked
  if a face is detected (the detector fails closed); a pharmacy dispensing label (patient name, HN) is blacked out
  before upload.
- **Owner rule kept:** the consent screen always names the provider actually used and the country where the data is
  processed, because the site is public. A remembered consent does not cover a provider or country not shown; the
  screen appears again.
- **Thai FDA data:** the web service is used for testing now; a permission letter to the Thai FDA is drafted
  (`docs/legal/FDA-PERMISSION-REQUEST-TH.md`, not sent). WHO alerts: email drafted (`docs/legal/WHO-PERMISSION-REQUEST.md`).

#### Personal data involved

- **Product crop (image mode):** may show a hand, or a prescription label with a patient's name; the face gate and the
  patient-name blackout reduce this, and their miss rate is measured before any claim (design §9).
- **OCR text (text mode):** label text; a medicine query can reveal health information about the user (as for C4).
- **Remembered consent:** a local flag in the browser (or on a member account when signed in); a consent flag travels
  with each call.
- **Gateway logs:** no images, text, prompts, IPs, user ids or emails (design §10.5). Nothing is stored on the server by
  default; local history is opt-in.
- **Thai FDA responses:** some licensees are natural persons; their names and addresses are dropped before the reply.

#### Questions for counsel

From the design (§15):

1. Do the food, cosmetic and supplement advertising rules apply to packs and online listings, so that LENSIQ may label
   wording as a "risk signal under <rule>"? What wording keeps LENSIQ out of defamation risk for brands?
2. Commercial reuse of the Thai FDA SOAP data (no licence stated), and dropping natural-person licensee names. Please
   review the draft letter `docs/legal/FDA-PERMISSION-REQUEST-TH.md` before it is sent.
3. A curated, fact-only list built from Thai FDA press releases: allowed?
4. Product crop images sent to a provider abroad: mechanism under PDPA s.28–29; a hand in frame; prescription labels.
5. DeepSeek and the other Chinese providers: acceptable at all, and on what terms? (They are enabled now for testing.)
6. Embeddings from LENSIQ's own photos of packs (Thai Copyright Act s.32–33).
7. Obtaining photos of illegal products for the test set lawfully.
8. Does Product Check make LENSIQ a medical-device software provider under Thai law or the EU MDR?

Added on approval (all providers enabled, remembered consent):

9. **Providers:** for each enabled provider (Anthropic, Google paid tier, OpenAI, Alibaba, DeepSeek, z.ai, Kimi,
   OpenRouter), are its API terms acceptable for a commercial Thai service, which need a DPA or extra clauses, and is the
   Google free tier correctly excluded? Is OpenRouter, as a second processor, acceptable, and must the routed provider
   also be named?
10. **Cross-border processing:** product crops and OCR text may be processed in the **US, Singapore or China**
    depending on the provider. Which s.28–29 mechanism applies to each destination? Is explicit consent naming the
    provider and the country enough for a public consumer site, and does health-related label text need s.26 explicit
    consent?
11. **Remember-my-choice consent:** is one consent per user with "remember my choice" (unticked by default) valid under
    s.19 (freely given, specific, informed, as easy to withdraw as to give)? Is the withdraw control on every result
    card and in settings enough? Must consent be asked again after a set period?
12. **Consent texts:** please review the TH / EN / ZH texts of the AI consent screen (provider, country, what is sent,
    retention line, remember / withdraw) once drafted in P7 (`docs/pdpa/consent-texts.md`).
13. **Privacy notice:** the AI providers become recipients; confirm the wording to add to `privacy.html` / `terms.html`.

### F2. AI Gateway core as built (phase P5; `docs/AI-GATEWAY.md`)

- **What changed:** every cloud AI call (today only the fortune writing assistant) now goes through one gateway on the
  Worker. Nothing new is sent: fortune still sends the same derived facts. The browser never talks to a provider.
- **Defaults:** a new install has AI switched off globally and a budget of 0 for every new feature, so nothing runs
  until the owner sets it. Every provider is on in the allowlist by default (owner decision PC-D2, 2026-11-09), including
  the Chinese providers and OpenRouter, but only Anthropic has an adapter in this phase; the others are never called
  until P6 and can be switched off by the admin.
- **Consent screen** (`lensiq-ai.js`, not used by any page yet): before anything is sent it names the provider and model
  actually used, the processing country (e.g. "USA / Anthropic's global routing", "Singapore", "People's Republic of
  China"), the providers it may fall back to, what is sent, that LENSIQ stores nothing, and the provider's retention in
  one line. The gateway never uses a provider the user was not shown.
- **Remembered consent:** the user may tick "remember my choice"; the choice (provider ids, mode, time) is stored on the
  device only (`localStorage` "lq-ai-consent") and can be withdrawn with a visible button. A changed provider list asks
  again. **For counsel:** is a remembered consent valid consent for cross-border transfer under s.28–29 for later
  requests, or must it be asked every session / every request? Is the one-line retention text enough?
- **Every provider in the chain** (review fix): the consent screen shows the retention / training note of every provider
  that may receive the data, not only the first — e.g. DeepSeek "stored in China and may be used for training" — and,
  next to "remember my choice", how to withdraw (the "withdraw consent" button under the result or in settings), in
  TH / EN / ZH. **For counsel:** is listing each fallback provider's country and retention on one screen enough
  information for a valid consent to all of them, or must a fallback to a provider in another country (e.g. China) ask
  again at the moment it would be used?
- **Image mode** (PC-D1 / PC-D9): text only is the default and the fallback; an image may be sent only when the admin
  allows it for that feature and the user chooses it on the consent screen. **For counsel:** the questions in
  `docs/PRODUCT-CHECK-DESIGN.md` §15 (hand in frame, prescription labels, transfer mechanism) apply before P7 ships.
- **Logs:** one line per attempt with counts, model, cost and timing only — never text, images, prompts, IPs, user ids or
  e-mails. Monthly aggregates are counts only.
- **Keys:** Worker secrets only. The older AES-GCM key stored in D1 from the admin page is kept but switched off by
  default (PC-D4). Not legal advice.

### F3. Provider adapters as built (phase P6, 2026-11-10; `docs/AI-GATEWAY.md` §3, §3b)

- **What changed:** Gemini, OpenAI, Alibaba (Qwen, Singapore), DeepSeek, z.ai, Kimi and OpenRouter can now be called
  (all on in the allowlist, PC-D2). Nothing runs on a new install: AI is off and every feature budget is 0. Default
  chains for the Product Check features use only Anthropic, OpenAI, Google (paid tier) and Alibaba, whose API terms say
  API data is not used for training; DeepSeek, Kimi, z.ai and OpenRouter run only if the owner adds them. Pending the
  18+ question below, Google is held out of all three Product Check default chains (label reading, over-claim check,
  translation); the admin can still add it.
- **Terms re-read 2026-11-10** (links in `docs/AI-GATEWAY.md` §3b) — points for counsel:
  - **Google Gemini:** paid tier only (the unpaid tier uses content to improve products, with human review); the
    terms also require users to be **18+** and forbid apps "likely to be accessed by" people under 18. A public site
    cannot check age: is Gemini usable on the public medicine page at all?
  - **DeepSeek:** privacy policy says data is stored in the PRC and used to train models; it also says developers are
    the controller for end-user data of their apps. Consent text: "Data is stored in the People's Republic of China and
    may be used for training".
  - **Kimi:** servers in Singapore; its policy allows using user content to optimise models and does not exclude API
    use. Consent text now says so.
  - **z.ai:** API DPA says content is not stored, processed in Singapore; training on API content is not stated.
  - **Alibaba:** "never use your data for model training"; retention period and the "International" scope still not
    stated. The Singapore endpoint now needs a workspace id (`DASHSCOPE_WORKSPACE_ID`).
  - **OpenRouter:** a second processor; zero retention and "deny data collection" are forced on every call; OpenRouter
    keeps request metadata (not content) by default; the result card names the provider it routed to. **For counsel:**
    is naming "OpenRouter, then the routed provider's country" enough when the routed provider (and its country) is only
    known after the call?
  - **OpenAI:** the docs do not state a default processing country; no residency option is used.

---

## D. Questions that cut across products

1. **Who is the controller?** For camera features run by a business customer on its own devices, we assume the customer
   is the controller and LENSIQ supplies software (no access to the data). Confirm, and whether a DPA (s.40) is still
   needed when LENSIQ never receives the data.
2. **Anonymous counting** (store, crowd, zone pages, bays, booth counts): is a posted sign + legitimate-interest
   assessment enough, and does the PDPC's 2026 draft CCTV guideline (when final) change the sign wording or retention?
3. **Face detection without identity** (exam, lucky-colour mirror, booth counting): confirm it is not "biometric data"
   under s.26 as long as no template is kept or matched (booth's same-day descriptor is the borderline case).
4. **Minors** (exam, OMR, school use of crowd counting, check-in): when parental consent is required, and whether the
   school's public task covers routine assessment.
5. **Health context** (medicine checker, clinic uses in the catalogue, future device adapters): medicine queries can reveal
   health information; the text proxy logs no query or IP and caches by hash for 24 h — is that acceptable, and is the
   session-only opt-in enough for the US transfer (s.28/29)?
6. **Evidence and logs** (exam clips, case review, time-attendance corrections): the hash chains are tamper-evident, not
   tamper-proof; how should the terms describe their evidential value?
7. **Retention defaults still open**: crowd day records (60-day storage cap is not a policy), case-review logs, OMR data,
   medicine history — counsel to recommend defaults.
8. **Shared devices**: kept exam clips are behind an invigilator PIN, but someone with browser devtools or "clear site
   data" can still delete local data; confirm the notice wording.

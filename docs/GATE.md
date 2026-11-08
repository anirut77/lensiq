# LENSIQ Gate — Thai licence-plate reading (car parks, villages / condos)

Pages: `gate.html` (landing, variant chooser, accuracy note, pricing draft), `parking.html` (variant A), `village.html`
(variant B), `gate-notice.html` (printable PDPA sign + privacy-notice template).
Code: `lensiq-plate.js` (plate text, OCR / detector hooks, voting, fuzzy match, audit, retention, accuracy report),
`gate-rules.js` (fees, e-stamps, reconciliation, village decisions, passes, relay requests), `lensiq-promptpay.js`
(EMVCo PromptPay payload + CRC, QR drawing), `gate-kit.js` (shared screen parts), `parking.js`, `village.js`,
`gate-notice.js`, `gate.css`. Dictionaries: `i18n/{en,zh}-gate.js`, `-gate-parking.js`, `-gate-village.js`.
Tests: `tests/unit/gate-plate.test.js`, `gate-rules.test.js`, `promptpay.test.js`; `tests/e2e/gate*.e2e.mjs`
(`node tests/e2e/run.mjs gate`).

Everything runs in the browser of the guard / cashier device. No frame, crop or log leaves the device. Data lives in
IndexedDB (`lq-gate-parking`, `lq-gate-village`) and a small settings object in localStorage (numbers and names only).

## 1. How a read works (and what is honest about it)

1. Frame source: phone / USB camera (`LQCam`), an IP camera bridged into the browser (go2rtc, section 4), or the
   synthetic demo plate (drawn on a canvas — no real vehicle, no person).
2. Plate box: the guard taps / drags a box, or the detector suggests one. **No plate-detection model is shipped.**
   open-image-models `yolo-v9-t-*-license-plate-end2end` (MIT repository) was reviewed: it is a YOLOv9 network (the
   reference implementation is GPL-3.0) trained on a dataset whose licence is not documented, so its commercial status is
   unclear. The default is a classical finder (`LQPlate.findCandidates`: dense vertical edges inside a bright 1.3:1–6.5:1
   box). A reviewed model plugs in with `LQPlate.registerDetector(async canvas => [{x, y, w, h, score}])` (normalised
   boxes) — e.g. a YOLOX-nano retrained on owner-licensed Thai plates (Apache-2.0 code, see `vendor/models/yolox`).
3. OCR: `vendor/models/plate-ocr-th/` = PaddleOCR **th_PP-OCRv5_mobile_rec** (official ONNX export, Apache-2.0, 7.5 MB,
   524-symbol dictionary). It is a general Thai text-line recogniser, **not trained on plates**. The crop is trimmed to the
   plate (`trimBorder`), split into text bands (`splitLines`), each band recognised (greedy CTC, `ctcDecode`), and the
   band that parses as line 1 is kept (`fromOcr`). The model is loaded only when the operator presses "read" or turns on
   auto-read.
4. Voting: 5 frames (configurable 1–10) ~120 ms apart, per-character weighted vote (`LQPlate.vote`); weak characters are
   underlined on the confirm screen; `agree` = share of frames whose whole plate equals the result.
5. Validation: `parse()` keeps only `[digit 1-9]? + 2 Thai consonants + 1–4 digits` (car), `[digit]? + 2–3 consonants +
   1–4 digits` (motorcycle, lines 1 + 3), legacy one-letter plates flagged. Latin OCR look-alikes in the number are repaired
   (O→0, B→8, I→1 …).
6. Province: a 77-province pick-list (+ Betong special plates) with the site's common provinces first; the guess from the
   lower line (`guessProvince`, edit distance) only pre-selects the list.
7. The guard confirms or corrects. A correction of a system read is written to the append-only, hash-chained audit
   (`auditAppend` / `auditVerify`, FNV-1a chain: tamper-evident on this device, not a cryptographic signature).

Matching (`match`, `plateDist`): weighted edit distance, look-alike substitutions ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ 0/O 8/B 1/I cost
0.5, other edits 1, default threshold 1. A province that conflicts excludes the match; a missing province leaves it to the
guard.

**Accuracy is not measured on a real site yet.** The e2e test only proves that the model reads the synthetic demo plate.
Each page has an on-site accuracy check (guard ✓ / ✗ per read, an edited read counts as ✗): plate-level and char-level
accuracy, day / night split (frame luma < 60 or 18:00–06:00), province agreement, Wilson 95 % intervals and the CI-aware
verdict of `lensiq-sitecheck.js` (`judge`, `needMoreProp`). Target: plate-level lower bound ≥ 95 % from ≥ 100 vehicles
incl. ≥ 30 at night. Export = plate text + numbers only.

## 2. Variant A — car park

- Entry / exit pairing by plate (`GateRules.pair`: exact first, then look-alike; duplicate open entries warned).
- Fee rules (`GateRules.fee`): free minutes (default: over the free period → charged from minute 0; "deduct" option),
  unit length + rate, optional first-unit rate, grace before rounding up, daily cap per 24 h block from entry, overnight
  fee per passing of a clock time, lost ticket / no entry flat fee, monthly pass exempt, shop stamps (extra free minutes
  and / or baht discount).
- Shop validation codes: `SHOP-SSSS-CC` (serial in base 32 + 2-char keyed check, no 0/O/1/I), single use, generated in
  sheets of 20 per shop. Not a security control — for high-value validation use a server.
- PromptPay: `LQPromptPay.payload(id, amount)` builds the EMVCo merchant-presented payload (tag 01 = 12 dynamic with
  tag 54 = amount, tag 29 = GUID A000000677010111 + phone `0066…` / 13-digit ID / 15-digit e-wallet, 58 = TH, 53 = 764,
  CRC-16/CCITT-FALSE in tag 63), drawn with the vendored MIT `qrcode-generator`. **The page does not verify payment**: the
  cashier checks the bank app before pressing "money received".
- Receipts (numbered, printable), end-of-shift reconciliation (`GateRules.reconcile`: cash vs counted drawer with float,
  PromptPay total, waived / free / monthly, stamps, lost tickets, unpaid exits, cars still inside), occupancy, CSV.

## 3. Variant B — village / condo

- Allow-list by house (max N plates per house, bulk import `house,plate,province`), deny list (reason required).
- Time-limited visitor passes: code `V-XXXXXX`, QR of `village.html#pass=CODE`, LINE share link
  (`https://line.me/R/share?text=…`, sent from the resident's own LINE app). Codes exist on the guard device only.
- Decision (`GateRules.decide`): deny first (look-alikes included) → resident → visitor pass (valid / expired / used up) →
  unknown (alert on the guard screen). Overstay alert when a visitor entered on a pass and is still inside after it ends
  (+ grace).
- Opening: the guard's "open" button sends the relay request; **"open barrier (guard, no plate)" is always available and
  logged**; if no relay is configured the guard opens at the control box and the event is still logged.
- **Auto-open is OFF by default.** When the owner switches it on, the barrier opens without a guard press ONLY for a
  system read (not typed / edited) of an exact allow-listed resident plate, province not conflicting, confidence ≥ the
  threshold (floor 0.90, default 0.95) and frame agreement ≥ 0.8, direction "in". Visitors, look-alikes, unknown and denied
  vehicles always wait for the guard.

### Round 15 pre-work: leading digit, colour plates, tight text crops (2026-11-08)
- **Leading digit is never dropped or added silently.** `LQPlate.leadAlternatives()` offers both readings (e.g. `1กข 2345` and
  `กข 2345`) when frames disagree about the prefix, when the voted prefix is low-confidence, or when the crop touches the
  left edge of the frame. Saving stays disabled until the guard picks a reading or types the plate (`gate.e2e.mjs`).
- **Light text on dark plates** (white on green / blue) is inverted before recognition; tests read white, yellow,
  green and red-text plates exactly with the real model.
- **Known limit — finding the plate:** the classical (no-model) finder looks for a bright box. It usually misses dark
  plates and can pick the province line of red-text plates. The guard taps the plate instead. A trained plate detector
  (permissive licence) is needed; the field pilot (`docs/FIELD-PILOT.md`) measures how often guards have to tap.
- **Tight text crops** (`LQPlate.tightText`) — PP-OCR rec expects the text to fill the line height. On the medicine page a
  loose crop read the same registration number correctly in only 2 of 16 layouts; with tight crops 48/48.
- **Tests use repo fonts, not system fonts:** demo plates use the self-hosted Prompt (OFL) with the Thai and Latin subsets
  loaded before drawing; the medicine OCR test uses Liberation Sans (OFL, Arial-metric) from `tests/fixtures/fonts/`.
  CI and dev machines apply the same exact-match pass rule.

## 4. Hardware guide

**Camera placement.** Plate ≥ 120 px wide in the frame (≥ 160 px for motorcycles), ≤ 30° horizontal / vertical angle,
1–1.5 m high, 3–6 m before the barrier, aimed where vehicles stop. Avoid the sun or headlights in frame; a hood helps.
A phone on a fixed mount works for a pilot; for 24/7 use a fixed IP camera.

**Shutter / exposure.** Motion blur is the main error source. Set ≤ 1/500 s (1/1000 s if vehicles do not stop), fixed
focus on the stop line, WDR / BLC on for backlit gates, lowest stable gain. Make vehicles stop or slow down (barrier,
speed bump).

**Night / IR.** Thai plates are retro-reflective: an 850 nm IR illuminator near the lens gives a high-contrast plate;
reduce IR power or exposure if the plate saturates. Coloured plates (green / yellow / red-trade / graphic auction) lose
colour under IR but the text stays readable. Check the night split in the accuracy check.

**IP camera → browser (go2rtc).** Browsers cannot open RTSP. Run [go2rtc](https://github.com/AlexxIT/go2rtc) (MIT) on a
LAN mini-PC: `streams: { gate: rtsp://user:pass@192.168.1.64/stream1 }`, then open its WebRTC / MSE player as a camera
source, or serve LENSIQ from the same host so the stream is same-origin. Keep the camera and go2rtc on an isolated VLAN;
never expose RTSP to the internet. (Wiring go2rtc in as an `LQCam` source is a v2 item — today use a USB capture / phone,
or the go2rtc page side by side with manual entry.)

**Relay wiring.** Shelly Plus 1 / Pro 1 (Gen2) dry contact in parallel with the barrier controller's "open" push-button
input (NO/COM), never in the motor circuit; keep the controller's own safety loop / photo-eye active. Configure the
Shelly with a fixed IP, auth on, `toggle_after` pulse ~1 s. Requests built by `relayRequest`:
`GET http://IP/rpc/Switch.Set?id=0&on=true&toggle_after=1` or `POST http://IP/rpc` with
`{"id":1,"method":"Switch.Set","params":{"id":0,"on":true,"toggle_after":1}}`, or a JSON webhook
`{"event":"gate.open","gate","reason","at"}` with an optional bearer token (ESP32 / Home Assistant / your bridge).

**Content-Security-Policy and Local Network Access.** The pages ship `connect-src 'self' data: blob:`, so a direct call
to `http://192.168.x.x` is refused by the page itself (the page says so and the guard opens by hand). Two supported
set-ups: (a) recommended — a same-origin bridge on the kiosk (serve LENSIQ and a `/relay/open` endpoint from the same
LAN host; the endpoint forwards to the Shelly); (b) add the device origin to `connect-src` for `village.html` only (CSP
meta via `tools/csp-meta.mjs`). In addition, Chrome's Local Network Access / Private Network Access rules may block or
prompt for requests from a public HTTPS page to private IPs, and an HTTPS page cannot call plain `http://` (mixed
content). Option (a) avoids all three. Shelly Gen2 without CORS headers: the page falls back to a `no-cors` GET and tells
the guard the result cannot be confirmed.

## 5. PDPA

Plates linked to a person are personal data. Before go-live: post the sign (`gate-notice.html`, TH/EN) before the
camera; publish the privacy notice (template; the legal basis — legitimate interest s. 24(5) / contract s. 24(3) — is
marked "to be confirmed by counsel"); set retention (crops off by default, 7–30 days when on; logs 90 days default;
receipts 5 years); name the operator (correction audit). The operator acknowledges the notice before the camera starts.
No face recognition, no emotion or behaviour inference. Deny-list entries need a recorded reason.

## 6. Status (MVP / v2 / later)

- MVP (this change): everything above, demo mode, unit + e2e tests.
- v2: plate-detector model with a clean licence (retrain YOLOX on owner-licensed Thai plates) + Thai plate fine-tune of
  the recogniser (needs pilot data); go2rtc source inside `LQCam`; multi-lane sync via `lensiq-agg` / backend; server-side
  stamp validation and payment confirmation (bank / Opn webhook); LINE OA notifications to residents.
- Later: colour-plate classification, vehicle make/colour as a secondary cue, ANPR at speed (needs a dedicated camera).

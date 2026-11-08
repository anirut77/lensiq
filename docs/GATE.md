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
2. Plate box: the guard taps / drags a box, or the detector suggests one. **Round 15:** the built-in plate finder
   (`LQPlate.findPlates`, classical, no training data) plus OpenCV Zoo **LPD-YuNet** (Apache-2.0, trained on Chinese
   plates, `vendor/models/plate-det/`) as a second proposal source; measured numbers in "Plate detector (round 15)"
   below. No model trained on Thai plates is shipped (training path: `tools/train-plate-detector.ipynb`,
   `docs/PLATE-DATASETS.md`). Until round 14: no plate-detection model was shipped, and the review below still applies.
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
- **Known limit — finding the plate (round-15 pre-work; superseded by "Plate detector (round 15)" below):** the classical (no-model) finder looks for a bright box. It usually misses dark
  plates and can pick the province line of red-text plates. The guard taps the plate instead. A trained plate detector
  (permissive licence) is needed; the field pilot (`docs/FIELD-PILOT.md`) measures how often guards have to tap.
- **Tight text crops** (`LQPlate.tightText`) — PP-OCR rec expects the text to fill the line height. On the medicine page a
  loose crop read the same registration number correctly in only 2 of 16 layouts; with tight crops 48/48.
- **Tests use repo fonts, not system fonts:** demo plates use the self-hosted Prompt (OFL) with the Thai and Latin subsets
  loaded before drawing; the medicine OCR test uses Liberation Sans (OFL, Arial-metric) from `tests/fixtures/fonts/`.
  CI and dev machines apply the same exact-match pass rule.

## 3b. Plate detector (round 15)

### What runs
`LQPlate.detect(canvas)` (a registered detector first, when there is one) → `findPlates`:
1. **Proposals:** `findCandidates` (edge density) on luma, on contrast-stretched luma when the frame is dark (night), on
   the colour-contrast channel (max − min of R, G, B: coloured plates whose luma is close to the car body) and a loose
   pass for small / 3-line plates; `flatRegions` (a flat background with character holes, for plates with few text
   edges); `o.extra` = model boxes. LPD-YuNet runs on the whole frame + 2 × 2 tiles (`modelBoxes`) on the first frame
   when the guard presses "read" and, in the auto-read loop, only when the classical top box scores < 0.6 (it costs
   ~0.5 s per frame on WASM).
2. **Plate-level boxes:** stacked text lines are merged (main line + province line; motorcycle lines).
3. **`growToPlate`:** every proposal is grown to the plate's own background (dominant colour, adaptive tolerance, on a
   3 × 3-blurred frame). Walks along rows / columns bridge character strokes but stop at a straight frame line; a side
   whose background runs past the cap (for example a white car body) is not grown. It never shrinks a box.
4. **`plateScore`:** aspect (car ~2.2:1, motorcycle ~1.45:1), a flat background that is ONE connected surface around
   the characters, ink share, 1–3 text bands, background that ends at the box edge, minimum size. Nesting rules: a
   closed plate inside a larger box penalises the larger one (vehicle body); an open box inside a plate is only a text line.
5. NMS; the top box is read. `readPlate` grows the box again (so a guard's tight tap or a model's top-line quad is also
   extended) and sets `leftCut` when ink touches the left edge of the plate crop (the leading-digit check then asks the
   guard to pick).

### CI failure fixed in the product (not in the test)
On the Linux CI runner the auto-detected box for the white demo plate "1กข 2345" missed the leading "1" by more than the
18 % left margin, and the read came back "กข 2345" at 100 % with no lead-digit warning. macOS rasterises the font
differently, so it never reproduced there. Emulated locally by feeding the same kinds of boxes (text line only, 25 % and
35 % cut, digits only), also with the plate text redrawn at weight 700, ±4–6 px and 48 px. Without growth: "กข2345"
once with no warning, "กข2345" 4 times flagged by the new `leftCut`, "1กข234" once, empty reads for 35 % cuts and
digits-only boxes. With `growToPlate`: **"1กข2345" in 16 of 16 cases**. `gate.e2e.mjs` now checks these boxes and prints
the detected / used / grown boxes in every read-failure message.

**Second cause, found in review (box growth alone does not fix it).** Redrawing the demo plate's text in Prompt 400
(46 px) or Prompt 600 at 42 px shifted 8 px left reproduced a silent drop **on a full-plate box**: the recogniser read
the thin "1" as the Thai vowel ไ ("ไกข 2345"), `plateChars` discarded the vowel and the read was "กข2345" at 0.999 with
no warning; with Prompt 400 + 2 px / 1 px offset the "1" vanished from the OCR output altogether, even on a tapped box.
This is the probable CI root cause (font rasterisation changes the stroke weight of the "1"). Fixes, all in
`lensiq-plate.js`:
- `1/ไ` and `1/ใ` are lookalike pairs; a 1-lookalike (ไ ใ ! ⅼ [ ]) before the first plate character and directly before
  a consonant becomes a "1" at half its probability. Plates never carry vowels; `เชียงใหม่` keeps its ใ (not first).
  The low-confidence "1" makes `leadAlternatives` ask the guard (reason `lowconf`, both readings offered).
- `fromOcr` sets `leadSuspect` when a plate character is skipped before the letters (`a > 0`), with a "1" guess when the
  skipped character is a 1-lookalike.
- `inkBefore()`: CTC time steps give the x position of the key's first character; a tall ink run left of it on the same
  band that is not the plate frame (full-height) sets `leadSuspect = "ink"`, and a narrow run (< 0.6 of the character
  pitch) adds "1"+key as a choice. `readPlate` folds `leadSuspect` into `leftCut`, so the guard is always asked.
Emulation (weights 300–600, 40–46 px, offsets −8…+6 px) × (auto-detected box, tapped full-plate box): before, 5 silent
drops ("กข2345", no warning) in the reviewer's 12 reads; after, **0 silent drops in 20 reads** — 19 read "1กข2345" (15 of
them with the lead check, because the "1" is weak) and the one where the "1" vanished from the OCR reads "กข2345" with
the lead check and "1กข2345" offered. `gate.e2e.mjs` runs
this matrix with one rule on every machine: exact, or the guard is asked with "1กข2345" among the choices. Not yet
confirmed on Linux CI (no CI run from here); the e2e message prints the box, OCR lines, `leadSuspect` and `inkBefore`.

### Detection demo set: DEFINITION (fixed before measuring; never change it to move a number)
`LQPlate.DEMO_SET` + `LQPlate.demoSpec()`, drawn by `GateKit.drawScene()` (self-hosted Prompt font; no people, no real
vehicles). Seed **20261108**, **20 scenes per category**, 640 × 360 frame:
- categories: `white` (#fbfbf7 / #111), `yellow` (#f5c400 / #111), `green` (#1f7a3a, white text), `red` (red text
  #c8102e on white), `blue` (blue text #1b3fa0 on white) car plates in daylight; `moto` (3-line motorcycle plate, white,
  daylight); `night` (the five car colours in turn); `none` (no plate: false-trigger check);
- plate text: optional leading digit (car 50 %, motorcycle 30 %), 2 random consonants (motorcycle: 3 with 30 %), 1–4
  digits, a random province. Car plate width 120–280 px (aspect 240:112), motorcycle 90–170 px (aspect 1.42); centre
  x 25–75 %, y 45–80 % of the frame (kept inside); rotation −6…+6°; partial occlusion with probability 0.25 (left, right
  or bottom, 8–18 % of the plate; 26 of 160 scenes with this seed); body colour from 6 (white, silver, black, red, blue,
  grey), ground from 4; sensor noise σ≈4 (day) / σ≈10 (night); night: scene brightness 18–35 %, plate 55–85 %
  (retro-reflective), headlight glare in 50 % of night scenes.
- **Held-out set:** the same definition with seed **7**, never looked at while the finder was developed.
- Metrics: **det** = the TOP box has IoU ≥ 0.5 with the true plate box (what auto-read uses); det3 = any of the top 3;
  read = exact plate key from ONE frame with the real OCR; false trigger = a plate-less scene whose top box scores
  ≥ `AUTO_MIN` (0.25). Target: det ≥ 90 % per category.

### Measured (2026-11-08, macOS, Chrome headless, WASM, `node tools/plate-det-eval.mjs`)

| Category (20 each) | Round-14 finder (baseline) | Round 15, dev seed 20261108 | Round 15, held-out seed 7 | 90 % target (dev / held-out) | Exact read, 1 frame (dev / held-out) |
|---|---|---|---|---|---|
| white | 3 (15 %) | 20 (100 %) | 20 (100 %) | met / met | 14 / 15 |
| yellow | 4 (20 %) | 19 (95 %) | 18 (90 %) | met / met | 16 / 9 |
| green (white text) | 0 (0 %) | 20 (100 %) | 20 (100 %) | met / met | 14 / 12 |
| red text | 2 (10 %) | 20 (100 %) | 20 (100 %) | met / met | 13 / 12 |
| blue text | 5 (25 %) | 20 (100 %) | 20 (100 %) | met / met | 15 / 12 |
| motorcycle (3-line) | 6 (30 %) | 19 (95 %) | 18 (90 %) | met / met | 11 / 12 |
| night | 2 (10 %) | 19 (95 %) | 20 (100 %) | met / met | 13 / 9 |
| **all plates** | 22 / 140 (16 %) | **137 / 140 (97.9 %)** | **136 / 140 (97.1 %)** | | 96 / 140 (69 %) · 81 / 140 (58 %) |
| none: false triggers | 0 / 20 | 1 / 20 | 0 / 20 | | |

Held-out baseline (round-14 finder, seed 7): 13 / 140. The 95 % Wilson interval for 19–20 of 20 is about 75–100 %: 20
scenes per category cannot prove 90 %; they only show that no category is far below it. Classical proposals only (no
LPD-YuNet) on the dev seed: also 137 / 140, so on synthetic scenes the model rarely changes the top box. With LPD-YuNet
on every frame: dev 137 / 140, held-out 138 / 140. Time per frame: ~20–25 ms classical, +~0.5 s when LPD-YuNet runs.

**How to read these numbers:** the finder was developed while looking at the dev-seed scenes, so the dev numbers are
optimistic; the held-out seed is the fairer synthetic number. Synthetic scenes are not photos: clean fonts, flat colours,
no motion blur, dirt, bolts, dealer frames or perspective. The one-frame exact-read rate is limited mostly by the OCR
(rare consonants such as ฬ ฆ ฑ ฏ read as ห/พ ม ท ฎ; rotation). The lane votes over 5 frames and the guard confirms every
read. Tight per-band text crops (`tightText`) were tried for plates and made reads worse (89 vs 95 / 140, before the
lead-digit lookalike fix moved dev to 96), so plates
keep the band crops.

### Real photos (Wikimedia Commons, CC BY / CC BY-SA / PD; benchmark only, never committed)
5 photos, 6 plates, boxes labelled by hand: a police pick-up at 1280 px (plate 53 px wide), a close white plate, a close
graphic plate, a dirty close-up motorcycle plate, and a street scene with a motorcycle plate (59 px) and a partly hidden
yellow songthaew plate (73 px).

| Pipeline | Top box is the plate | A plate among the top 3 |
|---|---|---|
| Round-14 finder | 0 / 6 | 0 / 6 |
| Round 15, auto (as in the auto-read loop) | 2 / 6 | 2 / 6 |
| Round 15, LPD-YuNet on every frame (as on a "read" press) | 2 / 6 | 4 / 6 |
| Reference only, NOT shippable: open-image-models YOLOv9-t (GPL-derived) | 6 / 6 (research run) | |

**False triggers on real scenes are worse than the synthetic 1 / 20:** in auto mode the top box on two photos was a
non-plate scored 0.835 (img1, IoU 0) and 0.862 (img5, IoU 0), far above `AUTO_MIN` 0.25, so auto-read would start on
non-plates in a real scene (the guard still confirms every read). The synthetic false-trigger rate does not carry over.
The three plates under 75 px wide are below the documented camera set-up (plate ≥ 120 px). The two close white /
graphic plates are found; the dirty close-up motorcycle plate only appears in the top 3. **The 90 % target is met on the
synthetic demo set, not on real photos.** A detector trained on Thai plates (`tools/train-plate-detector.ipynb`) and the
field pilot's "taps needed" metric (`docs/FIELD-PILOT.md`) are the real check. To plug a trained model in:
`docs/PLATE-DATASETS.md` section 4.

### Tests
`tests/unit/gate-detect.test.js` (growth, finder on synthetic RGBA, YuNet priors / decoding, demo-set definition,
detEval); `tests/e2e/gate-detect.e2e.mjs` (whole demo set in the browser; asserts the measured baseline per category with
a tolerance of 2 scenes for platform rasterisation, ≤ 3 false triggers, ≥ 20 / 35 exact reads; the same rule on CI and
dev); `gate.e2e.mjs` (proposal boxes that miss the leading digit; colour plates read without a tap);
`gate-parking.e2e.mjs` (the site check tallies taps).

## 3c. Plate-likeness guard and real photos (round 16, item 7)

### What changed
Round 15 measured that on real photos the finder's top box was often NOT a plate and scored far above `AUTO_MIN`, so the
auto-read loop would read signs and shop fronts. Round 16 adds a **plate-likeness guard** (`LQPlate.plateGuard`, pure):
a box the SYSTEM chose (finder / LPD-YuNet) is auto-read only when its read looks like a Thai plate. A box the guard
tapped is read as it is (a person chose it); the guard can always tap or type. The check runs on **every** box the
system chose, so it also applies when the guard presses "Read" **without** tapping (the system still picks the box);
only a tapped box skips it. This is stricter than round 15 and intended: a manual Read press on a sign gives the
"does not look like a plate" status, not a suggestion.

Checks, on the `readPlate()` result (`geom = {ar, bands, unread, wPx}`, OCR text per band):
1. **Aspect** of the grown plate box in pixels: 1.0–3.8 (car ≈ 2.2, motorcycle ≈ 1.45).
2. **Text-line layout:** 1–2 text lines (car) or up to 3 (motorcycle lane, 3-letter key, or a box narrower than 1.5:1).
   A text line = a read band with ≥ 2 Thai characters / digits (a bolt, dirt or the frame edge is not one); bands below
   the 3 that are read count when they are ≥ 35 % of the tallest band, and ONE such band is tolerated (dealer strip).
3. **Thai plate pattern:** the key parses with `RE_CAR` / `RE_MOTO`; a car key comes from ONE band (a key pieced together
   from two bands, e.g. "หยุด" + "9", is refused); the key band holds ≤ 2 extra characters, ≤ 1 Thai vowel / tone mark
   (OCR noise such as "ศึก 234" on a real plate), no Latin letter other than the digit look-alikes, and the plate letters
   are not the tail of a longer Thai word ("ห้อง 1234" → "อง1234", "ชลบุรี 64" → "บร64"). A band that only parses as a
   plausible partial ("กข", "กข 12", "2345") gives `text: "partial"` — never an auto-read.

Thresholds: `LQPlate.GUARD` (frozen). `gate-kit.js` `readCandidates()` reads the system's boxes best first (at most
`GUARD.tries` = 3) and auto-reads the **first one that passes**; when none passes the lane says "the box does not look
like a licence plate — tap the plate or type it" (`gk.st.notplate`, TH / EN / ZH). The same function runs in
`GateKit.autoReadFrame()`, which the evaluation tools use, so the numbers below are the shipped path.

### Real-photo benchmark (public dataset: Wikimedia Commons; benchmark only, never shipped or committed)
**Fixed before the guard was built** (2026-11-08): 51 photos — 32 with a plate (33 plates: white 7, yellow 2, green 5,
red 1, blue 1, motorcycle 6, night 2, graphic 2, numbers-only / legacy / other 6) and 19 without a plate (road signs,
kilometre posts, a plate-shaped town-name sign "ชลบุรี 64", a car tax label, a post-office sign, street scenes).
Licences: CC BY-SA 4.0 (30), public domain (9), CC0 (4), CC BY-SA 3.0 (3), CC BY 4.0 (2), CC BY-SA 2.0 (2), CC BY 2.5 (1);
credits in `docs/CREDITS-MEDIA.md`. Plate boxes were drafted with a research-only detector and checked by eye: **open-image-models**
`yolo-v9-t-384-license-plates-end2end.onnx` (https://github.com/ankandrew/open-image-models; code licence MIT, no
separate licence stated for the weights; the architecture is YOLOv9, whose reference code is GPL-3.0). It ran only
offline in the scratch folder to propose box coordinates for the labeller; **nothing from it — model, code or weights —
is in the repo or the product** (checked: `git ls-files` has no YOLOv9 / open-image-models file; the shipped plate
detector is LPD-YuNet, MIT). Because of the GPL lineage it must not be shipped; plate text typed by hand; 6 plates are marked "unsure" (4 with unclear letters such as ณ / ฌ, 2 unreadable) and
left out of exact reads, as are numbers-only and legacy plates (the reader does not support them).
Split stratified by category into **dev (28 photos)**, used to tune the guard, and **held-out (23)**, run after the guard
was frozen. Manifest, labels and photos stay in the scratch folder.

Two honest notes: (1) after the first dev run two labels were changed to "unsure", boxes unchanged: w08 (dev) and
**w07, which is a held-out photo** (both: first letter ณ or ฌ). This was before any held-out run, so no held-out result
was used, but it changes the held-out figure: **counted as sure, w07 makes held-out exact 1 → 1 → 3 of 11 (not 10) and
all photos 7 of 23 (30 %, not 7 of 22), and adds one wrong read before the guard** (the top box read "ญข4052"; the guard
refused it, layout, so the shipped wrong reads stay 2; its tap read "กข4052" is also not exact — re-measured
2026-11-09); (2) one rule ("Thai word") was added after the first held-out run, motivated by a synthetic distractor
written for the e2e test ("ห้อง 1234"), not by a held-out result; both halves were re-run and the held-out numbers did
not change.

Measured 2026-11-09, macOS, Chrome headless, WASM (`node tools/plate-field-eval.mjs --dir <photos> --split dev|heldout`).
Arrows: round 15 (top box, no guard) → guard on the top box only → guard + first plate-like box (shipped).

| Set | Plate is the top box | Exact automatic read | False auto-reads, photos WITHOUT a plate | False auto-reads, photos with a plate | Wrong text on a plate | Taps needed (shipped) |
|---|---|---|---|---|---|---|
| dev (18 plate / 10 none) | 9 / 18 | 2 → 2 → 4 of 12 | **2 → 0 → 0** of 10 | 0 → 0 → 0 | 1 → 1 → 1 | 14 / 18 |
| held-out (14 / 9) | 4 / 14 | 1 → 1 → 3 of 10 | **1 → 0 → 0** of 9 | 0 → 0 → 0 | 1 → 1 → 2 | 11 / 14 |
| all 51 | 13 / 32 (41 %) | 3 → 3 → 7 of 22 (32 %) | **3 → 0 → 0** of 19 | 0 → 0 → 0 | 2 → 2 → 3 | 25 / 32 (78 %) |

Per category (all 51, shipped path): white exact 2 / 5, yellow 1 / 2, green 1 / 3, red 1 / 1, blue 1 / 1, night 1 / 2,
motorcycle 0 / 6, graphic 0 / 2. The auto-read loop's trigger (top box ≥ `AUTO_MIN`) fired on 18 of the 19 plate-less
photos — the guard, not the trigger, is what keeps them from being read. False auto-reads blocked: the town sign
("บร64": extra text, vowels, word), a post-office sign ("รอ7": Latin), a STOP sign ("ยด9", second candidate: split key)
and an airport sign. **Tap read** (the reader on the hand-labelled box, as when the guard taps): 4 of 15 exact — on real
photos the OCR, not the finder or the guard, is now the main limit (rare letters, motorcycle plates 0 / 6, blur, dirt;
the recogniser is not trained on plates).

Small n: 95 % intervals are wide (0 / 19 false auto-reads → 0–17 %). **10 of those 19 are the dev half the guard was
tuned on**; on the held-out half alone it is **0 / 9 (before the guard 1 / 9), 95 % interval 0–30 %**. These are public photos, not a gate camera.

### Synthetic demo set with the guard (same scenes and metrics as section 3b)

| Seed | Exact one-frame reads without → with the guard | Wrong reads proposed without → with | Plate-less scenes auto-read without → with |
|---|---|---|---|
| dev 20261108 | 96 → 96 / 140 | 28 → 21 | 0 → 0 / 20 |
| held-out 7 | 81 → 81 / 140 | 29 → 21 | 0 → 0 / 20 |

The guard refused no correct synthetic read, and refused about a quarter of the wrong ones (those go to the guard's tap).

### Cost
Per photo (trigger detect + detect with LPD-YuNet + up to 3 reads): median 1.5 s, p90 2.2 s on this Mac (Chrome headless,
WASM, one thread; not a phone). Extra reads happen only when the top box's read fails the guard (~0.1–0.2 s each).

### Known limits
- A plate-shaped sign whose text is exactly a plate pattern on one line (e.g. a board reading "กม. 794" on one line,
  "กม794") passes the pattern check; the drawn two-line kilometre post in the e2e test is refused (split key), a
  one-line one would not be. The guard confirms every read anyway.
- Real-photo detection stays low (41 % top box). A detector trained on Thai plates with a clean licence remains the fix
  (`docs/PLATE-DATASETS.md`); the guard only makes misses safe (no false auto-read) and uses the next candidates.

### Owner field set (`tools/plate-field-eval.mjs`)
For the owner's ~100 phone photos: folder outside the repo (default `~/LENSIQ-field/plates/`; inside the repo only
`field-data/`, git-ignored — the tool refuses any other repo folder), labelling sheet
`docs/field-pilot/plates-photo-labels.csv` (template), steps in TH / EN in `docs/field-pilot/plates-photo-labels.md`.
The report gives per category (white / yellow / green / red / blue / moto / night / graphic / other / none): detection,
exact read, false auto-reads and wrong reads (round 15 → guard top-1 → shipped), taps needed and the read after a tap,
labelled **"field (owner photos)"**, with the synthetic demo-set numbers in a separate column. Boxes are optional; without
them a read more than one character from the label counts as a false auto-read (cautious).
A photo the browser cannot decode never stops the run: iPhone HEIC / HEIF (also when renamed to .jpg — the tool reads the
file header), RAW, TIFF or a broken file is listed under "could not decode" with the reason ("convert to JPEG first":
iPhone Settings > Camera > Formats > Most Compatible) and left out of every number. A filled-in labelling sheet (plate
numbers = personal data) is refused inside the repo unless it is under `field-data/`; only the unchanged template may be
read from `docs/`.

### Tests
`tests/unit/gate-guard.test.js` (guard rules, thresholds, detEval guard columns), `tests/unit/gate-field-eval.test.js`
(arguments, outside-the-repo rule for photos and for the labelling sheet, labelling sheet, scoring, report, whole run on
a generated temp folder, HEIC / broken photos listed without stopping the run),
`tests/e2e/gate-guard.e2e.mjs` (real OCR: drawn town sign / room board / kilometre post / shop sign / Latin plate never
auto-read, demo plates still read; lane status, and a tap on the refused board IS read and marked tapped; the tool
end-to-end on a generated folder incl. a HEIC and an undecodable PNG),
`tests/e2e/gate-detect.e2e.mjs` (+ the guard keeps the correct synthetic reads, 0 plate-less scenes auto-read).

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
- v2: plate-detector model with a clean licence (retrain YOLOX on owner-licensed Thai plates; notebook ready:
  `tools/train-plate-detector.ipynb`, datasets: `docs/PLATE-DATASETS.md`) + Thai plate fine-tune of
  the recogniser (needs pilot data); go2rtc source inside `LQCam`; multi-lane sync via `lensiq-agg` / backend; server-side
  stamp validation and payment confirmation (bank / Opn webhook); LINE OA notifications to residents.
- Later: colour-plate classification, vehicle make/colour as a secondary cue, ANPR at speed (needs a dedicated camera).

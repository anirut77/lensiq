# Acceptance sheet: palm reading upgrade v1 (palm.html, switch `window.LENSIQ_PALM_V2`)

Locked 2026-11-19 in `evals-locks/palm-layers.sha256` (field copy `~/LENSIQ-field/evals/palm-layers/`) BEFORE any product code,
with the tests it names. Source design: `~/Desktop/LENSIQ-review/palm/PALM-UPGRADE-DESIGN-TH.md` (B2, B3.2, B5, B-Draw, B6.1).
Owner order 2026-11-19: build tonight, nothing goes live (switch defaults to `false`), only tier-1 code and data.

## What is measured, and where the number comes from

Palm reading itself is a belief and is not measured. What can be measured is **finding lines in a photo**. Every number below says
its source: **synthetic** (drawn hand, `tests/fixtures/palm-v2/synth-hand.js`), **field** (our own consented photos; none exist yet,
owner decision D-P3 pending) or **public dataset** (none usable: every public palm-line set is tier 2 or 3, design B3).

## Gate rows (must all pass before the switch may be turned on anywhere)

| ID | Criterion | Test (locked) | Source |
|---|---|---|---|
| S | `window.LENSIQ_PALM_V2` defaults to `false`; only an explicit `true` turns it on; `#plV2` ships `hidden`; the current page is unchanged when off | `palm-v2-reading.test.js` "switch", `palm-v2.e2e.mjs` S | code |
| D-a1 | A guide (status `notFound`) is never drawn solid on screen: every stroke on it is dashed and alpha <= 0.5, labelled "ไม่พบในภาพ" / "Not found in this photo" / "照片中未找到"; every status mix x 3 schools x left / right x 3 languages | `palm-v2-layers.test.js`, e2e TH / EN / ZH | code |
| D-a2 | Same on the print layer | `palm-v2-layers.test.js` print, e2e | code |
| D-a3 | The share card draws no guide and no dashed stroke; found and added lines only | `palm-v2-layers.test.js` share, e2e | code |
| D-b1 | The reading never cites a `notFound` line (>= 2,000 mixes x 3 schools x 3 languages x normal / straight); found, added and "not on my hand" lines are all read; corrections are followed | `palm-v2-reading.test.js`, e2e | code |
| D-b2 | The optional AI facts carry no `notFound` line, no coordinates, no geometry | `palm-v2-reading.test.js` | code |
| D-c1 | A traced line never leaves the device: no request of any kind carries a unique traced coordinate or line geometry | `palm-v2.e2e.mjs` | code |
| D-c2 | Storage holds only line geometry: sessionStorage `{v, side, school, lines:[{id,status,cp}]}` < 8 KB, never the photo; nothing in localStorage, IndexedDB or Cache Storage | `palm-v2-reading.test.js`, e2e | code |
| NC | Below the confidence threshold a line is "not found" with "ไม่ชัดในภาพนี้" / "Not clear in this photo" / "此照片中不清楚" in the list; never read | `palm-v2-reading.test.js` | code |
| H | Hard limits: no lifespan, death, illness or health from any line (life and Mercury included); no number of children; no divorce or ending a relationship; no investment; no "bad outcome unless you pay"; all 3 schools x TH / EN / ZH, every text the v2 code can show; "absent" readings positive | `palm-v2-reading.test.js` | code |
| V | Crisis v3 unchanged (owner decision 2026-11-17): with a crisis phrase the reading continues gently and no card replaces it; no share / print card and no paid content; one warm line with the 1323 button at the end of the reading only; the crisis text is not echoed; the single top disclaimer and the 1323 icon are unchanged; existing crisis tests pass unchanged (re-lock 1: the first wording said "hides the reading", which contradicted crisis v3 rule a) | `palm-v2.e2e.mjs` CR + existing `crisis-v3-*` | code |
| C-still | The capture is a full-resolution still: `ImageCapture.takePhoto()` when available, else the track frame at the track's full size, never the preview; a failing takePhoto falls back | `palm-v2-capture.test.js`, e2e CAM | code |
| C-consent | Rear camera; photographing another person's hand needs the consent line ticked first (TH / EN / ZH); the tick is cleared after each capture | `palm-v2-capture.test.js`, e2e CAM | code |
| C-hints | Live hints in a fixed order (frame, light, pose, sharpness, still), every hint in TH / EN / ZH with "ask them to ..." wording for another person; blur / dark / bright / glare / uneven flagged on the synthetic hand; thresholds marked PROVISIONAL | `palm-v2-capture.test.js` | synthetic |
| C-auto | Automatic capture after a steady green countdown, once per hand, re-armed after 1.5 s off green; manual button any time with a "taken before green" note | `palm-v2-capture.test.js` | code |
| G | Guides are computed from the palm frame only, so any landmark source (7 taps today, a tier-1 landmarker later) gives the same guides | `palm-v2-layers.test.js` | code |
| L-synth | Classical finder on the drawn hand: majors + fate found within 0.04 PW mean distance and >= 60 % of their length, left and right; every control point on a dark valley; 0 found lines on a palm without lines; lines not drawn are not found; heavy blur finds fewer and never a template | `palm-v2-detect.test.js` | **synthetic only** |
| HL | Legacy engine honest mode (used when the switch is on): no heart / head / life / fate line without a crease; "not found" is not "absent" | `palm-v2-detect.test.js` | code |
| R2-M1 | Crease-free textures (noise σ4 / σ10, paper grain, skin pores + hatching, stronger hatching, skin + short random creases), palm without lines, left / right, 3 schools: 0 lines found (majors and minors) and every confidence >= 0.15 below its threshold | `palm-v2-textures.test.js` M1 (relock3, independent review round 1) | **synthetic only** |
| R2-T | True creases still found: heart / head / life in every image on plain skin, skin texture and noise10; fate >= 75 %; faint creases (depth 0.5) >= 75 % of majors; mean distance <= 0.04 PW, worst point <= 0.06 PW | `palm-v2-textures.test.js` T | **synthetic only** |
| R2-M2 | Partial crease among distractors: a found line stays within 0.04 PW of the crease, is at most 0.06 PW longer, and is never drawn over plain skin | `palm-v2-textures.test.js` M2 | **synthetic only** |
| R2-a | Uploading another person's hand is gated by the same consent line, cleared after a photo is used | `palm-v2-r2.e2e.mjs` a | code |
| R2-c | Switch off: no palm v2 code or style is downloaded | `palm-v2-r2.e2e.mjs` c | code |
| R2-d | Line finding never stalls the main thread > 500 ms; detection time reported | `palm-v2-r2.e2e.mjs` d | measured (Chrome, desktop) |
| LIC | Only tier-1 code and data ship: our own code; landmarks from the 7-tap mode (the MediaPipe hand model M6 / M7 is tier 2-U and is not used by v2) | review | `LICENSES/TIERS.md` |

## Field rows (targets from design B6.1; NOT MEASURED; need consented photos, owner decision D-P3)

| ID | Criterion | Target | Status |
|---|---|---|---|
| M1 | Major lines found rate | >= 85 % overall, >= 75 % worst phone / light / skin-tone level | not measured |
| M2 | Major lines false-line + wrong-id | <= 3 % each, every level | not measured |
| M3 | Major lines position error | median <= 0.025 PW, p90 <= 0.05 PW | not measured |
| M4 | Major lines not-clear rate | <= 15 % overall | not measured |
| M5 | Fate line | found >= 65 %, false-line <= 5 % | not measured |
| M6 | Minor lines shipped as auto (sun, Mercury, bracelets) | false-line <= 5 % is the ship gate; until measured they stay guide-only (`PalmV2.AUTO`) | not measured: guide-only |
| M7 | Marriage, girdle of Venus | guide-only in v1 | guide-only |
| M8 | Simian | false-line <= 1 % on non-simian hands | not measured: guide-only |
| M9 | Fairness | found-rate gap <= 10 points between skin-tone groups, phones, lights | not measured |
| C1 | Capture checks on real photos | bad accepted <= 5 %, good rejected <= 10 % per phone | not measured: thresholds PROVISIONAL |
| C2 | Real phones | median time to green <= 6 s; <= 1 retake per person | not measured |

## Go-live rows for the v2 / v3 line finder (owner decisions 204 ก and 186, 2026-11-20; must pass before any v2 / v3 go-live)

Re-lock `palm-v3-lines/relock7`: stricter, adds must-pass rows (owner 204 ก, 186). Speed is measured on real devices, from the
shutter press to the lines on screen, with 20 real pilot photos per device (consented pilot photos, never the owner's test photos).

| ID | Criterion | Target | Status |
|---|---|---|---|
| SPD-A | Line finding speed, mid-range Android (about 7,000-10,000 THB) | median <= 3 s, slowest <= 6 s | not measured |
| SPD-I | Line finding speed, iPhone 12 or newer | median <= 2 s, slowest <= 4 s | not measured |
| SPD-UI | While lines are found a progress message is shown and the screen never freezes | must pass on both devices | not measured on phones (desktop Chrome: Web Worker, longest main-thread stall <= 500 ms, `palm-v2-r2.e2e.mjs` d, `palm-v3.e2e.mjs` b) |
| TORCH | The torch is OFF by default on the v2 / v3 camera path (owner decision 186) | must pass | **fails today**: `palm-v2-ui.js` line 86 asks for `torch: true` |

The owner's two test photos (`~/LENSIQ-field/evals/palm/owner-photos/`) are a smoke look only and are never used for any number.

## Contract (palm-v2.js, browser global `PalmV2`, Node `require("./palm-v2.js")`)

`LINES` (10 ids: life, head, heart, fate, sun, mercury, marriage, girdle, bracelet, simian) · `SCHOOLS` (thai, chinese,
western) · `STATUS` (found, notFound, added, absentConfirmed) · `COLORS` · `AUTO` (per line: may the finder report it found) ·
`T(key, lang)` · `lineName(id, school, lang)` · `guides(school)` -> `{id: {cp, band}}` in the palm frame · `newState({side,
school})` · `setLine(state, id, {status, cp})` -> `{ok}` · `applyDetection(state, det)` · `threshold(id)` · `readingFor(state,
{lang, straight})` -> `{items:[{id, status, text}], text}` · `aiFacts(state, {lang})` -> `{lines:[{id, status, ...}]}` ·
`listRows(state, lang)` -> `[{id, num, name, status, label, about, unclear, note}]` · `drawLineLayer(ctx, state, target, {toPx,
lang, scale})` (target screen / print / share) · `serialize` / `deserialize` / `STORE_KEY` · `allTexts()` ·
`handFromTaps(taps)` · `frameFromHand(hand)` -> `{toImg, toUV, asp}` · `palmRoi(F, w, h)` · `captureMetrics(rgba, w, h, roi)` ·
`CAPTURE_T` (`PROVISIONAL: true`) · `captureHint({metrics, hand})` · `hintText(id, lang, other)` · `handFromSkin(rgba, w, h)` ·
`createAutoShutter({countMs})` · `stillPlan(...)` · `grabStill({track, video, ImageCapture, createCanvas, decode})` ·
`cameraGate({mode, consent})` · `consentAfterCapture(...)` · `detect(rgba, w, h, hand, {school})` -> `{lines:{id:{cp, conf}}, ms}`.
Page hook (palm.html, switch on): `window.__palmV2` = `{ready, busy, state(), useImage(url), imgToClient(p), uvToClient(uv),
layout(target), redraw(), setLine(id, o), lastStill}`; canvases carry `data-pv2-target` = screen / print / share.

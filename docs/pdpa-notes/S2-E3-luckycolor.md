# PDPA note — lucky-colour outfit mirror (`luckycolor.html`, round 14 / S2-E3)

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

## What the page does

A "mirror" for the Thai custom of wearing the lucky colour of the day (สีมงคลประจำวัน, Taksa of the day). The visitor
picks a goal (work, money, love, support from mentors) and a day (today by default). With the camera on, the page
separates the clothing below the face, finds the outfit's main colours (for example "red 82 %, white 18 %") and says, in
positive terms only, how that colour relates to the day's colours for the chosen goal. It also shows the day's colours and
a week table without the camera. It is for entertainment, based on traditional belief, and says so.

## Data flow

| Step | Detail |
|---|---|
| Source | The device's own camera (`getUserMedia`, front camera), started only when the visitor presses "Turn on camera". |
| Processing (on device) | Each ~0.5 s a frame is drawn to an in-memory 320 px canvas. MediaPipe Selfie Multiclass (Apache-2.0, already vendored: `vendor/models/selfie-multiclass-256-f16.onnx`, run by onnxruntime-web) labels hair / skin / face skin / clothes; the clothes pixels **below the face-skin box** are kept and their colours counted into 13 colour names (`lensiq-luckycolor.js`). Fallbacks: the vendored MediaPipe selfie segmenter (person mask minus the head band) or a fixed box on screen. The face box is a bounding rectangle used only to cut the head off the clothing mask: no face detection model, landmarks, recognition, descriptor, age, gender, emotion, body-shape or attractiveness inference. |
| Stored on device (`localStorage`) | `lqlc-prefs` = `{v, goal, day}` (for example `{"v":1,"goal":"money","day":"auto"}`). Nothing else: no image, no colour history, no result log. A "Clear remembered settings" button removes it. |
| Leaves the device? | **No.** The page code makes no network request (unit test asserts no fetch / XHR / beacon / WebSocket / image encoding / MediaRecorder / IndexedDB; the e2e test asserts no `/api/` call). Model and runtime files are static files of the site itself. |
| Retention | Frames: only in memory while the camera runs, overwritten every analysis, dropped when the camera stops or the page closes. Preferences: until cleared. |

## Why we think the risk is low (for counsel to confirm)

- The live frame shows the visitor (personal data under PDPA s.6), but it is the visitor's own device, started by the
  visitor, processed in volatile memory only, with no recording and no transfer.
- No biometric data (PDPA s.26) is created or kept: the face-skin box is a rectangle in a mask, not a template, and is not stored.
- Results are colour names and percentages; wording is positive only (no "avoid", no misfortune, the กาลกิณี bhumi is never named),
  consistent with the fortune pages' principles (no fear selling, nothing sold to "fix" luck).

## Kiosk / event use (if a business runs it on a shared screen)

The same page could run on a booth tablet. Then the business is the controller for the live view: a camera notice
(`camera-notice.html`) should be posted near the screen. The page itself still records and sends nothing. A notice gate
like the zone pages' was not added because the default use is a person's own phone; counsel may want one for kiosk mode.

## Open questions for counsel

1. Is a notice gate needed when the page is run as a kiosk at an event (see above), or is a posted sign enough?
2. Any consumer-protection wording needed for a belief-based entertainment feature beyond the disclaimer shown at the top?

## Deferred

- Analysing a photo from the gallery (file input) instead of the live camera — not built, to keep the "no image" story simple.
- A shareable result card (would create an image of the person; deliberately not built).

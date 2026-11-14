# Look preview: fixed measurement protocol (synthetic)

> Written and hash-locked (`evals-locks/beauty-look.sha256`) **before** `lensiq-look-preview.js` was written and before any
> measurement. Design: `docs/BEAUTY-IMAGE-DESIGN.md` §2 ("วิธีวัด"). Owner decision 2026-11-13: no volunteers yet, so these
> numbers are **SYNTHETIC** and every page or document that shows them says so. Field numbers need ≥ 20 consenting adult
> volunteers (capture protocol and consent form: `docs/LOOK-VOLUNTEER-PROTOCOL.md`).

## 1. Test set (fixed)

- **Faces:** drawn by `tools/look-synth-face.js` from numbers only (no photo of any person; licence: our own code). Seeds
  **1000–1119** = 120 faces. Split: **dev 1000–1059** (may be used to tune smoothing and drawing), **held-out 1060–1119**
  (never used for tuning; the pass decision uses held-out only). Each face varies skin base colour (7 levels, light to deep),
  face width, eye size and tilt, brow gap / arch / thickness / length, mouth width and lip heights, in-plane roll (±12°),
  position, light direction, warm/cool tint, brightness and background colour. Frame 640 × 480.
- **Ground truth:** the drawn outlines: lip outer contour, upper-lid curve, brow polygon, eye corners, mouth corners.
- **Jitter sequences:** for each held-out face, 30 frames of the same face with ±0.5 px random shifts and Gaussian pixel
  noise σ = 4/255 (a still person on a slightly noisy camera).
- **Limits of this set (stated with every number):** 2-D drawings, frontal only (no head turns, no pitch), closed mouth,
  no glasses, no hands, no real skin texture, no real camera optics. A pass here means "the drawing follows the landmarks on
  clean frontal faces", not "it looks real on people".

## 2. Pipeline under test

MediaPipe Face Landmarker (`vendor/models/face-landmarker/face_landmarker_lm.task`, Apache-2.0, the facial-movement model
removed) through the vendored Tasks Vision bundle, CPU delegate, `numFaces: 1`, no blendshapes; then
`lensiq-look-preview.js` geometry (lip polygon, liner base curve, brow polygon, glasses anchors) exactly as the page uses it.
Headless Chrome with SwiftShader WebGL (`tools/look-preview-eval.mjs`).

## 3. Metrics and targets (fixed before measuring)

Distances are in IPD units (distance between eye centres) and also reported in pixels. "Contour distance" = mean of the
symmetric nearest-point distance between the two outlines, sampled every 1 px. Per face, then median and p90 over faces.

| Preview | Metric (held-out) | Target to ship live |
|---|---|---|
| Lip colour | lip outer contour distance: median / p90 | ≤ 0.05 / ≤ 0.08 IPD |
| Lip colour | lip mask IoU (outer polygon): median | ≥ 0.80 |
| Eyeliner | liner base curve vs drawn upper lid, contour distance: median / p90 | ≤ 0.04 / ≤ 0.06 IPD |
| Brow thicken / darken | brow mask IoU: median; coverage of drawn brow by overlay: median | ≥ 0.60; ≥ 0.85 |
| Brow arch change (erase + redraw) | after the erase step, mean ΔE76 (CIELAB) between the erased brow area and skin just below it: median | ≤ 8 |
| All three | jitter: frame-to-frame RMS movement of contour points on the still sequences, after the page's smoothing: median | ≤ 0.008 IPD |
| Glasses (measured, not in MVP) | anchor error (4 eye corners + mid-point between them) vs drawn: median / p90 | ≤ 0.05 / ≤ 0.08 IPD |
| Hair colour (measured if the hair model runs in the eval page) | hair mask IoU vs drawn hair: median | ≥ 0.85 |
| Speed | frames per second, detect + draw, VIDEO mode, 640 × 480 | report only: **headless desktop, not a phone number**; the phone target (≥ 20 fps on a mid-range phone) needs a field test |
| Detection | faces with a detection | report; a face without detection counts as failing every metric above |

**Pass rule:** a preview kind ships live only if every target in its rows (and jitter) is met on held-out. A kind that fails
stays an illustration card and the result is reported as it is. Targets are not changed after measuring; a change needs the
owner and a new locked version of this file.

## 4. Output

`tools/look-preview-eval.mjs` writes per-face numbers to `~/LENSIQ-field/evals/beauty-look/` (outside the repo) and the
summary to `tools/look-preview-results.json` (in the repo, read by tests: a kind is live only with `pass: true` and
`source: "synthetic"` there). An independent reviewer re-runs the tool and compares.

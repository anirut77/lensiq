# Try-On: pose-anchored garments, results

Owner decision 2026-11-18: "Try-On, on-device overlay: build it now and put it in the menu under category 4 when it
passes. Photo or camera on the device, garment placed and scaled on the body from pose landmarks, front view first. State
plainly on the page that it is a preview of placement and colour, not a realistic fitting. Nothing leaves the device."

Branch `tryon-pose` (base `b2a6e76`). Not in any menu yet: the category 4 listing (`nav.js`, `tools/cat-data.cjs`,
`cat-marketing.html`, `docs/PAGE-STATUS.md`, about.html credit row in the i18n hub) is a separate small change.

## What was built

| Piece | Where |
|---|---|
| MediaPipe Pose Landmarker lite, vendored unchanged, with licence text and README | `vendor/models/pose-landmarker/` |
| Body outline points from the 33 pose joints (neck base, shoulder tips, waist, hip outline, crotch, knee and ankle outline); refusals: shoulders / hips / knees / ankles not in the picture, side view, more than one person | `lensiq-tryon-core.js` `bodyAnchors`, `missingFor`, `poseFor` |
| Garment anchor points mapped to the body per category: tops / outerwear (hem on the hip line), dresses (hem on the knee line), skirts (waist to knee line), trousers (waist, crotch, ankles); a boxy or A-line garment keeps its width | `garmentTargets` |
| Anchors from a cut-out's alpha (tops etc.: studio `templateAnchors`; skirts; trousers with a sub-pixel crotch) | `garmentAnchorsFromAlpha` |
| Warp: studio-core thin-plate spline (`templateWarpTo`) + `warpRGBA`, reused unchanged | `tryon.js` `updatePose` |
| Camera OR one photo from the device, both after the consent tick; photo read with `createImageBitmap`, never uploaded or stored; no drop / paste | `tryon.html`, `tryon.js` |
| Lazy model: fetched only when a clothes item is picked while a picture is on screen | `tryon.js` `loadPose` |
| Demo garments drawn as polygons (no photo of anyone): T-shirt, jacket, dress, skirt, trousers | `lensiq-tryon-core.js` `GARMENTS` |
| Disclaimer next to the picture, TH / EN / ZH: "a preview of placement and colour, not a realistic fitting" | `#toPoseNote`, `to.pose.note` |
| Fallback: when the pose engine cannot run (no WebGL), tops use the earlier selfie-mask fit; skirts and trousers say they cannot be placed | `tryon.js` |

Kept: consent first, burned-in preview mark on every snapshot, one person only, nothing stored. The page has no
adults-only rule (the existing overlay page had none; the 18+ rule in the design applies to cloud mode only).

## Numbers (source: synthetic)

Fixed set `tests/unit/fixtures/tryon-pose-set.js`: 120 front-view bodies made of numbers in 10 conditions + 48 refusal
cases. Error = distance between the placed anchor and the body's true outline point, as a fraction of B (the true
shoulder-tip width; B is about 45 cm on an adult, so 0.05 B is about 2 cm). Run: `node tools/tryon-pose-eval.mjs`,
2026-11-18, results kept in `~/LENSIQ-field/evals/tryon-pose/results-2026-11-18.json`.

| Anchor | n | Mean | p90 | Limit mean / p90 | Worst condition (mean) |
|---|---|---|---|---|---|
| Neck base | 120 | 0.024 | 0.043 | 0.05 / 0.09 | P7 noise 0.033 |
| Shoulder tips | 240 | 0.034 | 0.049 | 0.06 / 0.10 | P7 noise 0.039 |
| Waist | 216 | 0.047 | 0.074 | 0.08 / 0.13 | P10 mirrored 0.058 |
| Hip outline | 240 | 0.035 | 0.062 | 0.08 / 0.13 | P3 broad 0.045 |
| Crotch | 108 | 0.043 | 0.071 | 0.10 / 0.16 | P7 noise 0.048 |
| Knee outline | 432 | 0.013 | 0.021 | 0.09 / 0.15 | P7 noise 0.021 |
| Ankle outline | 432 | 0.010 | 0.019 | 0.09 / 0.15 | P7 noise 0.023 |

Decisions (place or refuse with the right reason): 840 / 840. Every limit met.

Conditions: P1 typical portrait photo, P2 slim, P3 broad / wide hips, P4 tilted 3.5-8 degrees, P5 far and off-centre,
P6 close landscape camera (knees out of frame: tops placed, dresses / skirts / trousers refused), P7 landmark noise 2.5 %,
P8 one shoulder and one hip lower, P9 legs apart, P10 mirrored selfie. Refusals: R1 side view, R2 shoulders hidden,
R3 hips hidden, R4 ankles hidden (trousers refused, the rest placed).

Rendered check (Q4): the five drawn garments warped onto 18 bodies land on their targets (inside samples covered,
outside samples clear), 300+ samples.

**What these numbers do not show.** The body outline is drawn from proportion ranges chosen by us, and the placement uses
the middle of the same ranges, so the set measures robustness to build, tilt, framing, noise, asymmetry, stance and
mirroring, not whether real bodies have these proportions. The knee and ankle numbers are small because the generator
puts the joints exactly where the landmarks say plus noise; on real pictures the pose model's own error adds to them (the
model card reports 87.0 % PCK@0.2 for the lite model on Google's set; not measured by us). Nothing has been measured on
real camera pictures or photos. Length shown is the category's usual line, not the item's real length; no size advice.

## Licence findings

- **MediaPipe Pose Landmarker lite** (`pose_landmarker_lite.task`, 5,777,746 bytes, sha256 `59929e1d…690d574a`), from
  `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/`. Model card "Model Card
  BlazePose GHUM 3D" (2021-04-16), read 2026-11-18: **"LICENSED UNDER Apache License, Version 2.0"**. Commercial use
  allowed with attribution (OK-ATTR). Training data: Google's own smartphone captures (30K consented AR images, 85K fitness
  poses), not an academic dataset. Out of scope per the card: multiple people, people beyond 4 m, head not visible,
  metric depth, surveillance or identity recognition. The page places nothing with more than one person, uses no depth and
  gives no size. Recorded in `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt` and the README in the model
  folder. Not AGPL / GPL / non-commercial; no Ultralytics.
- Runtime: the MediaPipe Tasks Vision bundle already vendored (Apache-2.0). Warp: our own studio-core code.
- Demo garments: drawn polygons, our own work. No photo of anyone is in the repo or the tests.
- Open: the about.html credit table has no Pose Landmarker row yet (its strings live in the shared i18n hub); the
  notices file covers attribution until the menu change adds it.

## Size and speed

| Item | Measured | Budget |
|---|---|---|
| Pose model | 5.5 MiB, fetched only after a clothes item is picked (E1) | 6,000,000 bytes (Q8) |
| tryon.html before any action | 622 KB, 20 requests, 0 KB of models (unthrottled, 1 run, loaded machine) | 630 KB, 21 requests (speed-budget) |
| Pose update | about 3 times a second on the camera, once per photo | — |

The 5.5 MiB model downloads over about 30 s on "Fast 3G"; the status line says it is loading.

## Fixed test set (locked before building)

| File | What it checks | Lock |
|---|---|---|
| `tests/unit/fixtures/tryon-pose-set.js` | Synthetic fit set, per-anchor limits | `evals-locks/tryon-pose.sha256` |
| `tests/unit/tryon-pose.test.js` | Q1 fit limits, Q2 refusals, Q3 garment target rules, Q4 rendered garment, Q5 anchors from a cut-out, Q6 licence, Q7 page and disclaimer, Q8 model size | same |
| `tests/e2e/tryon-pose.e2e.mjs` | E1 lazy model, E2 camera placement, E3 photo after consent, E4 nothing leaves the device (request hooks as in print P5), E5 disclaimer TH / EN / ZH, E6 no overflow 360-430 px | same |
| `tools/tryon-pose-eval.mjs` | Scorer (eval-guard, refuses to overwrite results) | same |

Local results 2026-11-18: unit tryon-pose 8/8, tryon-core 6/6, tryon-review 10/10; e2e tryon-pose 6/6, tryon 3/3
(first run, no retry).

## Re-lock ledger

| When | File | Before | Now | Why | Not weaker because |
|---|---|---|---|---|---|
| 2026-11-18, before the photo input was built | `tests/unit/tryon-core.test.js` C5 | No file input anywhere in `tryon.html` / `tryon.js` | At most one file input, in the markup only; `accept="image/*"`; no `capture`, no `multiple`; disabled in the markup and enabled by the consent tick | Owner decision 2026-11-18: "Photo or camera on the device" | No drop / paste, no POST, no stored frames, consent first: unchanged. The new E3 / E4 tests check the photo path end to end (nothing leaves the device, nothing stored) |
| same | `tests/e2e/tryon.e2e.mjs` check 1 | No file input on the page | No enabled file input before the consent tick | same | same |
| 2026-11-18, during the build (re-lock b) | `tests/unit/tryon-review.test.js` V3 | `DRAWABLE` equals the 7 categories drawable before | The same list plus skirts and trousers; new check that every listed category has a drawing path | Skirts and trousers became drawable (pose anchors) | The rule "only categories the page can draw" is kept and now checked for every entry; the new categories are proven by the locked Q3-Q5 |

The consent wording that said "this page has no way to upload a photo" is replaced, because it would no longer be true.
The C5 change replaces an earlier privacy assertion ("no file input") on the owner's explicit order of 2026-11-18. To
revert the photo path: remove the `#toPhoto` input and label from `tryon.html` and its handler in `tryon.js`, and append a
re-lock restoring the old C5 line; the pose engine does not depend on it.

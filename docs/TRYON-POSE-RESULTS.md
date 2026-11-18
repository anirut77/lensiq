# Try-On: pose-anchored garments, results

Owner decision 2026-11-18: "Try-On, on-device overlay: build it now and put it in the menu under category 4 when it
passes. Photo or camera on the device, garment placed and scaled on the body from pose landmarks, front view first. State
plainly on the page that it is a preview of placement and colour, not a realistic fitting. Nothing leaves the device."

Branch `tryon-pose` (base `b2a6e76`). Status: tests locked; build in progress. Not in any menu yet (separate small change).

## Fixed test set (locked before building)

| File | What it checks | Lock |
|---|---|---|
| `tests/unit/fixtures/tryon-pose-set.js` | Synthetic fit set: 120 front-view bodies in 10 conditions + 48 refusal cases; per-anchor error limits | `evals-locks/tryon-pose.sha256` |
| `tests/unit/tryon-pose.test.js` | Q1 fit limits, Q2 refusals, Q3 garment target rules, Q4 rendered garment, Q5 anchors from a cut-out, Q6 licence, Q7 page and disclaimer, Q8 model size | same |
| `tests/e2e/tryon-pose.e2e.mjs` | E1 lazy model, E2 camera placement, E3 photo after consent, E4 nothing leaves the device, E5 disclaimer TH / EN / ZH, E6 no overflow 360-430 px | same |
| `tools/tryon-pose-eval.mjs` | Scorer (eval-guard, refuses to overwrite results) | same |

## Re-lock ledger

| When | File | Before | Now | Why | Not weaker because |
|---|---|---|---|---|---|
| 2026-11-18, before the photo input was built | `tests/unit/tryon-core.test.js` C5 | No file input anywhere in `tryon.html` / `tryon.js` | At most one file input, in the markup only; `accept="image/*"`; no `capture`, no `multiple`; disabled in the markup and enabled by the consent tick | Owner decision 2026-11-18: "Photo or camera on the device" | No drop / paste, no POST, no stored frames, consent first: unchanged. The new E3 / E4 tests check the photo path end to end (nothing leaves the device, nothing stored) |
| same | `tests/e2e/tryon.e2e.mjs` check 1 | No file input on the page | No enabled file input before the consent tick | same | same |

The consent wording that said "this page has no way to upload a photo" is replaced, because it would no longer be true.

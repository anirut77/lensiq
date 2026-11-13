# Look preview: measured results (SYNTHETIC)

> Source: **synthetic** — 60 held-out faces drawn by `tools/look-synth-face.js` (no real people), protocol
> `docs/LOOK-PREVIEW-EVAL.md` (locked before the code and before measuring), tool `tools/look-preview-eval.mjs` (locked
> after a 6-face dev smoke run, before the held-out run). Run 2026-11-13 on this Mac, headless Chrome + SwiftShader.
> Raw per-face numbers: `~/LENSIQ-field/evals/beauty-look/preview-2026-11-13.json`; summary `tools/look-preview-results.json`.
> **Not a claim about real faces.** The set is frontal, closed-mouth, no glasses, flat drawn skin. Field numbers need ≥ 20
> consenting adult volunteers (`docs/LOOK-VOLUNTEER-PROTOCOL.md`). An independent reviewer re-runs the tool.

| Preview | Metric (held-out, n = 60, 60/60 detected) | Measured | Target | Pass |
|---|---|---|---|---|
| Lip colour | lip contour distance median / p90 (IPD) | 0.012 / 0.024 | ≤ 0.05 / ≤ 0.08 | yes |
| Lip colour | lip mask IoU median | 0.879 | ≥ 0.80 | yes |
| Eyeliner | lid curve distance median / p90 (IPD) | 0.010 / 0.013 | ≤ 0.04 / ≤ 0.06 | yes |
| Brow thicken / darken | brow IoU median; coverage median | 0.606; 0.858 | ≥ 0.60; ≥ 0.85 | yes (**narrow margin**) |
| Brow arch change | ΔE76 erased area vs skin below, median | 0.79 | ≤ 8 | yes on flat drawn skin (see below) |
| All | jitter after smoothing, median (IPD) | 0.001 (raw 0.003) | ≤ 0.008 | yes |
| Glasses (measured, not built) | anchor error median / p90 (IPD) | 0.036 / 0.043 | ≤ 0.05 / ≤ 0.08 | yes |
| Hair colour | hair mask IoU | not measured | ≥ 0.85 | — (hair model not wired into the eval page this round) |
| Speed | detect + draw, 640 × 480 | 45.3 fps | report only | **headless desktop, not a phone number** |

At an IPD of 60 px, 0.012 IPD ≈ 0.7 px.

## Decisions (recorded, agent, 2026-11-13)

- **Live now:** lip colour, eyeliner, brow thicken / darken / fill / extend / lift (`LQLookPreview.LIVE`).
- **Brow arch change: kept off** although it passed. The drawn faces have flat skin, so "erase the real brow" is easy
  there; on real skin texture and dark brows the design note expects "fair to weak". It needs the field set first. The
  arch suggestion keeps its illustration card; the try button opens the brow preview with "fill".
- **Glasses: kept off** (anchors pass, but the set has no head turns, which is the known failure of glasses overlays;
  the overlay itself is not built in this round).
- **Hair colour: not measured**, stays an illustration card.
- Brow IoU passes by 0.006: the brow polygon from 10 landmarks is thinner than a drawn brow; expect the real-face number
  to be lower. First item for the field set.

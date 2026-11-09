# Crowd counting accuracy (`crowd.html`)

> **Status: PRELIMINARY.** Every figure below compares the page's count with a reference count made by an **AI reviewer
> looking at still frames**, not by two human counters. AI compared with AI is not ground truth.
> **FINAL accuracy: pending human count.** It is computed by `tools/crowd-eval.mjs score` once two people have filled
> [`docs/crowd-count/count-sheet.csv`](crowd-count/count-sheet.csv) (kit and steps below, in Thai and English).

Measured 2026-11-08 (round 15). Device: Apple M1 (macOS), headless Chrome 156, no WebGL (the same ORT Web WASM path
phones without a GPU use). Pipeline: exactly what `crowd.html` runs, read by the tool from the shared runtime so the two
cannot drift (`pagePipeline()`): YOLOX-Nano 416 on ORT Web WASM, `minScore 0.4`, `detW 416`, `max 40` boxes,
`split: "auto"` (two overlapping halves for 16:9 frames), the anonymous tracker (`PRESET.object`, 2 hits to confirm),
5 frames per second, the 5-frame median the page shows as "people in view now", and the page's line counter
(hysteresis band + 2-frame confirmation). Raw per-frame numbers: [`docs/crowd-count/app-counts.json`](crowd-count/app-counts.json)
(counts only, no frames).

## Test clips

All from Wikimedia Commons, trimmed and re-encoded for evaluation. **The clips and every extracted frame stay outside the
repo** (no images of people are committed). Geometry (zone polygon, counting line, "in" side) is in
[`docs/crowd-count/clips.json`](crowd-count/clips.json), shared by the tool and the human counters.

| id | Crowd | Camera | Title, author | Licence | Source |
|---|---|---|---|---|---|
| `sparse_roncesvalles` | 3–5 people, mostly small | fixed | "Roncesvalles Ave crossing at Galley Ave, PXO Type A lights flashing, July 2026", Qviri | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Roncesvalles_Ave_crossing_at_Galley_Ave,_PXO_Type_A_lights_flashing,_July_2026.webm |
| `sparse_tyumen` | 6–17 people, 1 near, the rest far | mostly fixed | "Kruciĝo de stratoj Respubliko kaj Orĝonikidze (Tjumeno)", RG72 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Kruci%C4%9Do_de_stratoj_Respubliko_kaj_Or%C4%9Donikidze_(Tjumeno).webm |
| `medium_tyumen` | 15–22 people, medium size | slow pan (per-frame counts only) | "Piedira pasejo en strato Respubliko (Tjumeno)", RG72 | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Piedira_pasejo_en_strato_Respubliko_(Tjumeno).webm |
| `medium_yonge_dundas` | 30–50 in view (0–11 near), large near occluders | fixed | "DiagonalCrosswalkYongeDundas", Raysonho @ Open Grid Scheduler / Grid Engine | CC0 | https://commons.wikimedia.org/wiki/File:DiagonalCrosswalkYongeDundas.webm |
| `dense_shibuya` | ~300 | near-fixed, dusk, 640×480 | "Shibuya Crossing", Emran Kassim from Nagoya, Aichi, Japan | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Shibuya_Crossing.ogv |
| `dense_shibuya_timelapse` | 100+ | fixed, time-lapse (app counts only) | "Shibuya crossing time-lapse 2019-01-05", Asanagi | CC0 | https://commons.wikimedia.org/wiki/File:Shibuya_crossing_time-lapse_2019-01-05.webm |

## How the reference count was made (and how it differs from the protocol)

Protocol: RESEARCH-R15 §B. Frames were sampled at the clip's `step` (1 s for the two short clips so they reach at least 10
samples, 2 s for the others, 5 s for the dense clip) with `node tools/crowd-eval.mjs frames`, into a scratch folder
outside the repo. **The reference counter was an AI reviewer (Claude) viewing the frames**, as strips of the frame and
zoomed crops. Honest limits:

- **Sparse clips: counted twice.** Pass 1 on the frame strip, pass 2 on 2–5× zoomed crops. They differed by 2.3 people per
  frame on `sparse_roncesvalles` (pass 1 missed two people standing together on the far kerb) and by 0–3 on three
  `sparse_tyumen` frames; where they differed a third, zoomed look settled the value (the `(adjudicated)` rows).
- **Medium clips: two passes on the zone, one on the far kerb.** Pass 1 counted every frame. Pass 2 (added after review)
  recounted `medium_tyumen` (whole frame = zone) and the `medium_yonge_dundas` zone. **Pass 2 was not blind**: the pass 1
  numbers had already been seen. Mean gap between the passes: 1.8 people per frame on `medium_tyumen` (33 % of frames
  > 10 %) and 0.75 people on the Yonge–Dundas zone (45 % of frames > 10 %, mostly 0–1 vs 1 at small counts). Gaps of
  3+ people were settled by a third, zoomed look (`medium_tyumen` 8–11 s, Yonge–Dundas zone 24 s and 28 s); smaller gaps
  use the mean of the two passes. The second pass raised the `medium_tyumen` reference by about 1.6 people per frame
  (tiny people far left and right), so its undercount went from 19 % to 26 %. The `medium_yonge_dundas` whole-frame
  figure stays a single-pass **estimate (±20 %)**: 20–45 small people stand on the far kerb, many partly hidden.
- **When the Yonge–Dundas zone was set.** The zone was moved from 60 % to 66 % of the frame height during the work,
  because 60 % cut through the far kerb where feet stand. The working notes do not record whether this happened before or
  after the first app results were seen, so assume **after**: the zone figure may be optimistic, and it rests on one clip.
- **Dense clip: order of magnitude only** (≈ 300, range 250–400, 2 frames). Individual heads cannot be separated in the
  compressed 640×480 dusk video.
- **Zone membership by the feet, not the head.** The research protocol says "head point inside the polygon"; the page
  counts by the foot point, so the reference does the same (a person close to the camera has their head far above their
  feet). The human kit uses the same rule.
- **Line crossings were counted only where they can be followed on still frames** (the two sparse clips). The medium clip's
  crossings are left to the human kit.

All AI rows are in [`docs/crowd-count/ai-reference.csv`](crowd-count/ai-reference.csv) (same columns as the human sheet,
counter names start with "AI").

## Results (PRELIMINARY — app vs AI reviewer)

MAE = mean absolute error (people per sampled frame). MAPE = mean absolute percentage error (frames with a reference > 0).
Bias = mean (app − reference): negative = undercount. "Within band" = share of frames within the protocol's acceptance
band (±1 person sparse, ±15 % medium, ±25 % dense).

### Whole frame ("people in view now")

| Clip | Frames | Reference mean | App mean | MAE | MAPE | Bias | Within band |
|---|---|---|---|---|---|---|---|
| sparse_roncesvalles | 13 | 4.2 | 1.7 | 2.5 | 59 % | −2.5 | 0 % |
| sparse_tyumen | 16 | 11.6 | 7.1 | 4.5 | 37 % | −4.5 | 19 % |
| medium_tyumen (pan) | 12 | 19.5 | 14.5 | 5.2 | 26 % | −5.0 | 25 % |
| medium_yonge_dundas | 20 | 39.3 (estimate) | 16.6 | 22.8 | 58 % | −22.8 | 0 % |
| dense_shibuya | 2 | ≈ 310 | 1 | ≈ 309 | ≈ 100 % | ≈ −309 | 0 % |
| dense_shibuya_timelapse | 7 | 100+ (not counted) | 0.4 | — | — | — | — |

### In the drawn zone

| Clip | Reference mean | App mean | MAE | MAPE | Bias | Within band |
|---|---|---|---|---|---|---|
| sparse_roncesvalles | 3.9 | 1.7 | 2.2 | 57 % | −2.2 | 0 % |
| sparse_tyumen (zone = most of the frame) | 11.6 | 7.1 | 4.5 | 37 % | −4.5 | 19 % |
| medium_tyumen (zone = most of the frame) | 19.5 | 14.5 | 5.2 | 26 % | −5.0 | 25 % |
| **medium_yonge_dundas (near half, 0–13 people)** | 5.9 | 5.7 | **1.2** | 31 % | **−0.2** | 75 % |

### Entry/exit line

| Clip | Reference in / out | App in / out | Error per 10 s window |
|---|---|---|---|
| sparse_roncesvalles (line across the far crossing) | 0 / 1 | 0 / 1 | 0 |
| sparse_tyumen (nobody crosses) | 0 / 0 | 0 / 0 | 0 (no false counts) |
| medium_yonge_dundas | pending human count | 7 / 13 | — |

One crossing is far too little to give a percentage; the human kit counts the medium clip's crossings per 10 s window.

### Fallback detector and a tiling experiment (same reference)

| Clip (whole frame) | Page as shipped (YOLOX-Nano) | COCO-SSD fallback | EXPERIMENT: YOLOX + 3×2 tiles |
|---|---|---|---|
| sparse_roncesvalles | MAPE 59 %, bias −2.5 | 86 %, −3.5 | 47 %, −1.9 |
| sparse_tyumen | 37 %, −4.5 | 77 %, −9.0 | 22 %, −1.1 |
| medium_tyumen | 26 %, −5.0 | 51 %, −10.0 | 12 %, −2.2 |
| medium_yonge_dundas | 58 %, −22.8 | 75 %, −29.4 | 39 %, −15.6 |
| medium_yonge_dundas (zone) | 31 %, −0.2 | 47 %, −2.7 | 38 %, −0.1 |
| dense_shibuya | ≈ 100 % (1 counted) | ≈ 100 % (0–1) | ≈ 99 % (3–8) |
| Time per frame (M1, WASM; two runs) | 87–128 ms | 51–82 ms | 326–482 ms |

The COCO-SSD fallback (used only when ORT Web cannot load) undercounts about twice as much. Tiling recovers far people
but costs about 4× the time per frame (≈ 2–3 frames per second on an M1, much less on a phone) and still fails the dense
crowd. It is **not** shipped; it is listed as a possible opt-in "far / dense mode" (deferred, needs a change in the shared
`lensiq-zonecam.js`).

## Round 16: higher input resolution and tiling (sparse and medium clips)

> **Source label: public dataset, preliminary AI reference.** The clips are the four sparse and medium Wikimedia
> Commons clips above. The reference is the round 15 AI-reviewer count in
> [`ai-reference.csv`](crowd-count/ai-reference.csv), unchanged (no re-count). **EXPERIMENT ONLY: `crowd.js` and
> `lensiq-zonecam.js` are unchanged and the page still runs the "shipped" row.** Dense clips are not part of this test.

### Fixed test set (written down before the runs, 2026-11-08)

- **Clips:** `sparse_roncesvalles`, `sparse_tyumen`, `medium_tyumen`, `medium_yonge_dundas` (1280×720, the round 15
  files). Pipeline: the page's own (`pagePipeline()`: minScore 0.4, 5 Hz, tracker `PRESET.object` with 2 hits, 5-frame
  median). Same YOLOX-Nano weights (Apache-2.0).
- **Higher input resolution:** the same ONNX with only the input dimensions changed (640×640 and 832×832; YOLOX's graph
  uses `Reshape -1` and scale-based `Resize`, so nothing else changes). The re-dimensioned files stay in the scratch
  folder and are **never** put in the repo. Box cap 300 for every experiment (the page uses 40), so the cap cannot hide
  a difference. Any sample at the cap is reported: none were.
- **Variants:** `shipped` (416, two overlapping halves = 2 model runs), `full` (416, one letterboxed frame = 1 run),
  `tiles2x1` / `tiles3x2` / `tiles4x3` (416, full frame + C×R tiles, overlap 0.2, IoU 0.5 = 3 / 7 / 13 runs),
  `tiles3x2-o0.3` (overlap 0.3), `tiles3x2-iou0.4` / `-iou0.6` (NMS and tile-merge IoU), `r640-full` (640, one frame),
  `r640` / `r832` (640 / 832, two halves), `r640-tiles2x1` (640, full + 2×1 = 3 runs).
- **Timing:** `medium_yonge_dundas`, 30 frames from 0 s at 5 Hz, first 3 discarded as warm-up, detector call only
  (`detectPeople`), median and p90. CPU throttling via Chrome CDP `Emulation.setCPUThrottlingRate`: ×1 (this Mac,
  Apple M1), ×4 (mid-range phone), ×6 (low-end check). ORT Web WASM on 1 thread: the page is not cross-origin isolated,
  and neither is GitHub Pages.

### Accuracy per clip (whole frame; MAE people / MAPE / bias)

| Variant | sparse_roncesvalles | sparse_tyumen | medium_tyumen (pan) | medium_yonge_dundas (estimate ref.) | Zone: sparse_roncesvalles | Zone: medium_yonge_dundas (near half) |
|---|---|---|---|---|---|---|
| **shipped** (416, 2 halves) | 2.5 / 59 % / −2.5 | 4.5 / 37 % / −4.5 | 5.2 / 26 % / −5.0 | 22.8 / 58 % / −22.7 | 2.2 / 57 % / −2.2 | 1.2 / 31 % / −0.2 |
| full (416, 1 frame) | 4.1 / 98 % / −4.1 | 9.8 / 83 % / −9.7 | 8.5 / 43 % / −8.5 | 32.6 / 83 % / −32.5 | 3.8 / 98 % / −3.8 | 1.9 / 43 % / −1.8 |
| tiles2x1 | 2.5 / 59 % / −2.5 | 4.4 / 36 % / −4.4 | 4.8 / 24 % / −4.6 | 22.6 / 57 % / −22.5 | 2.2 / 57 % / −2.2 | 1.3 / 32 % / −0.4 |
| tiles3x2 | 1.9 / 47 % / −1.9 | 2.4 / 22 % / −1.1 | 2.4 / 12 % / −2.2 | 15.6 / 39 % / −15.6 | 1.7 / 44 % / −1.7 | 1.4 / 38 % / −0.1 |
| **tiles4x3** | 1.0 / 25 % / −0.8 | 2.8 / 25 % / −0.9 | 1.3 / 7 % / −0.2 | 10.8 / 26 % / −10.4 | 0.8 / 21 % / −0.6 | 1.5 / 34 % / −0.8 |
| tiles3x2, overlap 0.3 | 2.0 / 49 % / −2.0 | 2.8 / 25 % / −1.7 | 3.3 / 16 % / −3.0 | 15.3 / 38 % / −15.3 | 1.8 / 46 % / −1.8 | 1.2 / 34 % / +0.1 |
| tiles3x2, IoU 0.4 | 1.9 / 47 % / −1.9 | 2.5 / 23 % / −1.4 | 2.5 / 13 % / −2.2 | 15.9 / 40 % / −15.8 | 1.7 / 44 % / −1.7 | 1.4 / 37 % / −0.1 |
| tiles3x2, IoU 0.6 | 1.9 / 47 % / −1.9 | 2.4 / 22 % / −1.1 | 2.4 / 12 % / −2.2 | 15.5 / 39 % / −15.4 | 1.7 / 44 % / −1.7 | 1.4 / 38 % / −0.1 |
| r640-full (640, 1 frame) | 2.9 / 72 % / −2.9 | 5.9 / 50 % / −5.9 | 5.3 / 27 % / −5.3 | 23.3 / 59 % / −23.2 | 2.7 / 70 % / −2.7 | 1.2 / 35 % / +0.2 |
| **r640** (640, 2 halves) | 1.2 / 29 % / −1.2 | 2.6 / 21 % / −1.9 | 2.8 / 14 % / −2.1 | 13.4 / 33 % / −13.4 | 1.0 / 27 % / −1.0 | 1.2 / 33 % / 0.0 |
| **r832** (832, 2 halves) | 1.2 / 30 % / −0.8 | 2.6 / 24 % / −1.5 | 1.8 / 9 % / −0.6 | 10.6 / 26 % / −10.0 | 1.1 / 29 % / −0.8 | 1.3 / 34 % / +0.3 |
| r640-tiles2x1 | 1.2 / 29 % / −1.2 | 2.8 / 24 % / −1.6 | 2.4 / 12 % / −1.6 | 13.5 / 34 % / −13.5 | 1.0 / 27 % / −1.0 | 1.3 / 34 % / +0.1 |

For `sparse_tyumen` and `medium_tyumen` the zone is the whole frame, so their zone figures equal the frame figures
above (that is why the table has zone columns only for `sparse_roncesvalles` and Yonge–Dundas).

Share of frames within the acceptance band (±1 sparse, ±15 % medium), whole frame: shipped 0 / 19 / 25 / 0 %;
tiles4x3 77 / 38 / 83 / 25 %; r640 62 / 25 / 50 / 15 %; r832 62 / 31 / 83 / 25 % (same clip order). The `shipped` row
reproduces round 15 exactly, so the run is deterministic.

**What changes:**

1. **More pixels per person is what helps.** `r640` (two halves at 640) halves the sparse error (`sparse_roncesvalles`
   59 % → 29 %) and cuts the Yonge–Dundas whole-frame undercount from −22.7 to −13.4 people. `tiles4x3` and `r832` get
   the most (Yonge–Dundas −10.4 / −10.0, `medium_tyumen` 7–9 %), but even they still miss about a quarter of the people
   on Yonge–Dundas, mostly the far kerb.
2. **A bigger input on its own is worse.** `r640-full` letterboxes the 16:9 frame into 640×640, so a person gets about
   the same number of pixels as the shipped two halves at 416. The model was trained at 416, so it does worse
   (59 % → 72 % on `sparse_roncesvalles`). One letterboxed frame at 416 (`full`) is the worst variant: the shipped
   two-halves split is already worth 17–46 points.
3. **Overlap and NMS hardly matter.** IoU 0.4 / 0.5 / 0.6 differ by at most 0.4 people per frame. Overlap 0.3 is
   slightly *worse* than 0.2 on three clips. `tiles2x1` adds a full-frame pass to the shipped halves and gains almost
   nothing (≤ 2 points).
4. **The near zone does not improve.** The Yonge–Dundas near-half zone (0–13 people, large people) is already close
   (bias −0.2) and stays at MAE 1.2–1.5 with every variant; the change in MAPE (+2 to +6 points) is within the noise of
   small counts. The gain is entirely in far / small people.
5. **New over-counts (unverified).** On `sparse_tyumen`, 2–3 of 16 frames come out above the reference by more than one
   person (by up to 2–5 people) with `tiles3x2`, `tiles4x3`, `r640`, `r832` and `r640-tiles2x1`, while `shipped` never
   over-counts. These are either false detections from the tiles or far people the AI reference missed. The human
   count decides which. No variant produced a false line crossing on the sparse clips (`sparse_roncesvalles` out 1,
   `sparse_tyumen` 0 / 0, same as shipped).
6. **The 40-box cap would bind.** `tiles4x3` and `r832` reach 45 raw boxes on Yonge–Dundas (shipped: 27). The
   recommended `r640` already peaks at 38 and `r640-tiles2x1` at exactly 40, the page's cap. Shipping any of them also
   means raising `max` in `lensiq-zonecam.js`, and checking the cap again on denser scenes. (The runs above used a cap of
   300, so the measured numbers are not affected.)

### Time per frame and fps cost

Detector call only (`detectPeople`, the part that changes), `medium_yonge_dundas`, 27 timed frames per cell, median
(p90). "Calls/s" = 1000 / median. The page asks for 5 per second. When a call takes longer than 200 ms, the page runs at
the lower rate shown, and the tracker and line counter (tuned for 5 Hz) get fewer frames.

| Variant | Model runs / frame | This Mac (Apple M1, ×1) | **Emulated mid-range phone (×4)**, not a real phone | Emulated low-end phone (×6), not a real phone | Cost vs shipped (×1) | Calls/s lost at ×4 vs shipped |
|---|---|---|---|---|---|---|
| **shipped** | 2 × 416 | 100 ms (119) · 10/s | 355 ms (366) · **2.8/s** | 533 ms (542) · 1.9/s | ×1.0 | — |
| full | 1 × 416 | 46 ms (49) · 22/s | 180 ms (183) · 5.6/s | 270 ms (275) · 3.7/s | ×0.5 | +100 % (but far worse accuracy) |
| tiles2x1 | 3 × 416 | 130 ms (139) · 7.7/s | 528 ms (533) · 1.9/s | 794 ms (808) · 1.3/s | ×1.3 | −32 % |
| tiles3x2 | 7 × 416 | 303 ms (309) · 3.3/s | 1215 ms (1222) · 0.8/s | 1828 ms (1840) · 0.5/s | ×3.0 | −71 % |
| **tiles4x3** | 13 × 416 | 551 ms (562) · 1.8/s | 2250 ms (2260) · **0.4/s** | 3393 ms (3429) · 0.3/s | ×5.5 | −86 % |
| r640-full | 1 × 640 | 97 ms (100) · 10/s | 401 ms (411) · 2.5/s | 602 ms (609) · 1.7/s | ×1.0 | −11 % |
| **r640** | 2 × 640 | 196 ms (199) · 5.1/s | 807 ms (816) · **1.2/s** | 1209 ms (1223) · 0.8/s | ×2.0 | −57 % |
| **r832** | 2 × 832 | 330 ms (336) · 3.0/s | 1350 ms (1358) · **0.7/s** | 2037 ms (2077) · 0.5/s | ×3.3 | −75 % |
| r640-tiles2x1 | 3 × 640 | 291 ms (299) · 3.4/s | 1196 ms (1207) · 0.8/s | 1801 ms (1808) · 0.6/s | ×2.9 | −71 % |

**Why ×4 for "mid-range phone":** ×4 is the CPU slowdown that Chrome DevTools' "Mid-tier mobile" preset and the
Lighthouse mobile profile use to approximate a mid-range Android phone from a fast desktop CPU. The Apple M1 counts as
fast here (single-thread speed matters, because ORT Web runs on one thread on this site). ×6 is DevTools' "Low-tier
mobile" setting, given as a check. **Emulated, not a real phone.** CDP throttling slows the page's CPU time evenly. It
does not model a phone's memory bandwidth, WASM SIMD speed, heat throttling or camera/video decoding, so a real phone
can be slower. A real-phone check belongs in the Crowd pilot kit.

**How the numbers were taken:** the machine was shared with other jobs, so the bench was run three times (system load
6–63 in pass 1, 3–9 in pass 2, 2–6 in pass 3; `bench-r16*.json` in the scratch folder, outside the repo). The table
shows the fastest pass per cell. Every cell came from pass 3, where the p90 is within 1–7 % of the median except
`shipped` ×1 (load 6.4, p90 +19 %). An unloaded single run of `shipped` at ×1 gave 90 ms, and round 15 measured
87–128 ms. The ×4 / ×1 ratio is 3.5–4.1 for every variant, so the cost ratios hold at every rate.

**Trade-off, in short (preliminary, AI reference, 4 clips):**

| Option | Sparse + medium error (MAPE, whole frame, 4 clips) | Emulated mid-range phone |
|---|---|---|
| shipped | 59 / 37 / 26 / 58 % | 2.8 calls/s |
| r640 (same 2 halves, 640 input) | 29 / 21 / 14 / 33 % | 1.2 calls/s (−57 %) |
| r832 | 30 / 24 / 9 / 26 % | 0.7 calls/s (−75 %) |
| tiles4x3 | 25 / 25 / 7 / 26 % | 0.4 calls/s (−86 %) |

`r640` gives most of the gain for the lowest cost: about half the error for 2× the compute. Below about 1 call per
second the 5 Hz tracker and the entry/exit line would need re-tuning (people move further between frames), which was
**not** tested. A slower variant would suit a "count every few seconds" mode for far or sparse scenes, not live line
counting. None of these variants addresses dense crowds (Shibuya ≈ 300 people). For dense crowds see
[`CROWD-DENSITY-MODELS.md`](CROWD-DENSITY-MODELS.md).

## Where it breaks

1. **Small or distant people.** When the median person box is less than about a tenth of the frame height (box heights
   0.06–0.09 in `sparse_*` and on the Yonge–Dundas far kerb), the detector misses 37–59 % of people. People standing still
   in a group are missed most.
2. **Dense crowds: the count collapses, it does not saturate.** About 300 people at Shibuya were counted as 1–2 (0–2 on the
   time-lapse). Heads 10–15 px tall at 416 px input are below what YOLOX-Nano finds. The 40-box cap (`max: 40`) was never
   reached on any clip; the failure starts long before it. Counting a crowd like this needs a density-map model, not a
   person detector (deferred).
3. **Large people close to the camera hide others.** On Yonge–Dundas at 34 s, 11 people were in the near zone and the
   page counted 4.
4. **Zone edges.** People standing on the edge line flicker in and out (the Yonge–Dundas zone was moved from 60 % to 66 %
   of the height so it does not cut through the far kerb, where feet are at about 60 %).
5. **Moving camera.** The pan clip gives per-frame counts only; line and dwell figures need a fixed camera.

## What the page does with this

- **"Density estimate, not an exact count" label** (`LQCrowd.countQuality`): shown on the "people in view" tile (≈ before
  the number) and as a status line when the count is **≥ 15** (from 15–22 people the measured undercount is already
  26 %, and at ~40 it was 58 %) or a zone reaches **≥ 2 people/m²** (the "crowded" band).
- **It does NOT appear on its own for a very dense crowd.** Measured: at Shibuya (~300 people) the count *falls* to 0–2;
  it does not rise. 0–2 people looks the same as a quiet scene, so no frame-only rule can tell them apart. Fed the
  stored dense samples, `countQuality` returns no label (unit test `tests/unit/crowd-report.test.js`). The only trigger
  is the operator's setting **"Expected crowd at peak (events)"** (0 = off): when it is ≥ 15 and the page sees fewer
  than half of it, the tile shows ≈ and the status line says the detector has collapsed. Without that setting, a
  dense crowd shows a small number with **no warning**.
- **"People look small" hint** when at least 2 people are in view and the median box height over the last ~5 s is below
  **10 % of the frame height** (the measured 37–59 % undercount zone), with the fix: move the camera closer or draw the
  zone over the near part only.
- **Accuracy note** (TH/EN/ZH) under the page lead: the preliminary figures, that the reference was an AI reviewer, and
  "Final accuracy: pending a human count". The marketing CSV carries the same caveat in its header.

## Human counting kit (for the FINAL figure)

Clips: `sparse_roncesvalles` (13 s, 13 frames) and `medium_yonge_dundas` (40 s, 20 frames), each with a fixed camera and a
counting line. Sheet: [`docs/crowd-count/count-sheet.csv`](crowd-count/count-sheet.csv) — one row per sampled frame and per
10-second window, for counter **A** and counter **B**.

Columns: `video`, `frame_time_s`, `people_in_frame`, `people_in_zone`, `window_start_s`, `window_end_s`, `crossings_in`,
`crossings_out`, `counter_name`, `notes`.

### ขั้นตอนการนับ (ภาษาไทย)

1. ขอคลิปทดสอบจากทีม LENSIQ หรือดาวน์โหลดจากลิงก์ในตารางด้านบน แล้วตัดตามช่วง `trim` ใน `clips.json` เก็บไว้ **นอก** โฟลเดอร์โปรเจกต์ (ห้าม commit ภาพหรือวิดีโอคน)
2. สร้างภาพนิ่งสำหรับนับ: `node tools/crowd-eval.mjs frames --clips <โฟลเดอร์คลิป> --out <โฟลเดอร์นอกโปรเจกต์> --clip sparse_roncesvalles,medium_yonge_dundas`
   จะได้ไฟล์ `t<วินาที>.jpg` และ `t<วินาที>_zone.jpg` (มีกรอบโซนสีฟ้าและเส้นนับสีเหลือง)
3. ผู้นับ 2 คน (A และ B) นับ **แยกกัน ห้ามดูผลของอีกคน** ในแต่ละภาพ:
   - `people_in_frame` = จำนวนคนทั้งภาพ นับคนที่เห็นศีรษะอย่างน้อยครึ่งหนึ่ง (คนบนจักรยานนับด้วย คนในรถไม่นับ)
   - `people_in_zone` = จำนวนคนที่ **เท้า** อยู่ในกรอบสีฟ้า (ถ้าเท้าถูกบัง ให้กะตำแหน่งเท้า)
   - ภาพที่คนเยอะ ให้แบ่งภาพเป็นตาราง 4×4 นับทีละช่องแล้วรวม
4. นับคนข้ามเส้น: เปิดคลิปที่ความเร็ว 0.5× นับทีละช่วง 10 วินาทีตามแถวในชีต `crossings_in` = เท้าข้ามเส้นไปฝั่ง "เข้า" ตามที่เขียนใน `clips.json` (`inSide`), `crossings_out` = ทิศตรงข้าม คนที่เดินย้อนกลับนับทุกครั้งที่ข้าม
5. ใส่ชื่อหรือชื่อย่อในคอลัมน์ `counter_name` (A/B ก็ได้) และหมายเหตุภาพที่ไม่แน่ใจใน `notes`
6. ถ้าสองคนนับต่างกันเกิน 10% ในภาพใด ให้คนที่สามดูภาพนั้นแล้วเพิ่มแถวที่ `counter_name` มีคำว่า `(adjudicated)` เช่น `C (adjudicated)` ค่านั้นจะใช้แทนค่าเฉลี่ย
7. คำนวณผล: `node tools/crowd-eval.mjs score` เครื่องมือจะเฉลี่ยผู้นับ แสดงช่องว่างระหว่างผู้นับ (noise floor) และ MAE / MAPE / bias / ความคลาดเคลื่อนของเส้นนับ — ผลส่วน "HUMAN (final)" คือค่าสุดท้าย นำไปแทนคำว่า "รอผลการนับโดยคน" ในหน้าเว็บและเอกสารนี้

### Steps (English)

1. Get the evaluation clips from the LENSIQ team, or download them from the table above and trim them to `trim` in
   `clips.json`. Keep them **outside** the repo (never commit images or video of people).
2. Extract the frames: `node tools/crowd-eval.mjs frames --clips <clip folder> --out <folder outside the repo> --clip sparse_roncesvalles,medium_yonge_dundas`.
   You get `t<seconds>.jpg` and `t<seconds>_zone.jpg` (zone outlined in cyan, counting line in yellow).
3. Two counters (A and B) count **independently, without seeing each other's numbers**, on every frame:
   - `people_in_frame` = everyone in the frame whose head is at least half visible (people on bicycles count, people in cars do not);
   - `people_in_zone` = people whose **feet** are inside the cyan outline (estimate the feet when they are hidden);
   - for busy frames, split the frame into a 4×4 grid, count cell by cell and add up.
4. Line crossings: play the clip at 0.5× and count per 10-second window, as listed in the sheet. `crossings_in` = feet cross
   towards the "in" side named in `clips.json` (`inSide`); `crossings_out` = the opposite direction. Someone who crosses back
   is counted at every crossing.
5. Put your name or initials in `counter_name` (A/B is fine) and anything you were unsure of in `notes`.
6. Where the two counts of a frame differ by more than 10 %, a third person looks at that frame and adds a row whose
   `counter_name` contains `(adjudicated)` (e.g. `C (adjudicated)`); that value replaces the mean.
7. Compute: `node tools/crowd-eval.mjs score`. It averages the counters, reports the inter-counter gap (the noise floor) and
   the app's MAE / MAPE / bias and line error. The "HUMAN (final)" section is the final figure: replace "pending human
   count" on `crowd.html` (TH/EN/ZH) and in this document with it.

## Re-running the measurement

```
node tools/crowd-eval.mjs run --clips <clip folder>                 # the page as shipped -> docs/crowd-count/app-counts.json
node tools/crowd-eval.mjs run --clips <clip folder> --model coco    # the COCO-SSD fallback  (stored as <id>@coco)
node tools/crowd-eval.mjs run --clips <clip folder> --tiles 3x2     # tiling experiment       (stored as <id>@tiles3x2)
node tools/crowd-eval.mjs score [--variant coco|tiles3x2] [--json]  # AI reference (PRELIMINARY) + human sheet (FINAL)
node tools/crowd-eval.mjs template                                  # rewrite the empty human sheet
```

Round 16 experiments (results written OUTSIDE the repo with `--out`; the re-dimensioned ONNX files too):

```
node tools/crowd-eval.mjs run --clips <dir> --out <scratch>/app-r16.json --split none          # one letterboxed frame
node tools/crowd-eval.mjs run --clips <dir> --out <scratch>/app-r16.json --tiles 4x3 [--overlap 0.3] [--iou 0.6]
node tools/crowd-eval.mjs run --clips <dir> --out <scratch>/app-r16.json --model-file <scratch>/yolox_nano_640.onnx --size 640
node tools/crowd-eval.mjs bench --clips <dir> --clip medium_yonge_dundas --frames 30 --throttle 1,4,6 [same variant options]
node tools/crowd-eval.mjs compare --app <scratch>/app-r16.json --variants shipped,tiles4x3,r640,r832
```

The 640 / 832 ONNX is the vendored `yolox_nano_416.onnx` with only the graph input set to `[1,3,640,640]` (or 832) and
the output to `[1,8400,85]` (or `[1,14196,85]`); a 416 copy made the same way gives identical outputs (max difference 0).
`--model-file` refuses a path inside the repo.

Re-run after any change to the detector, its options, the tracker or the line counter; the tool reads those settings from
`lensiq-zonecam.js` / `crowd.js` and records the page's script versions with the results.

## Deferred

- The human count itself (two people, about 1–2 hours for both clips).
- Line-crossing reference for `medium_yonge_dundas` (part of the human kit).
- An opt-in "far / dense mode" (tiles) and a density-map model for crowds of hundreds: both need changes outside this page
  (`lensiq-zonecam.js`, a new model with a clean licence). Round 16 measured the options (section above) and researched
  the density models and their licences ([`CROWD-DENSITY-MODELS.md`](CROWD-DENSITY-MODELS.md)): no public checkpoint is
  clean for commercial use. Nothing ships without the owner's approval.
- Re-measuring on the customer's own camera position: these are street clips, not shops or event halls.

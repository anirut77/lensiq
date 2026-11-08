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

Re-run after any change to the detector, its options, the tracker or the line counter; the tool reads those settings from
`lensiq-zonecam.js` / `crowd.js` and records the page's script versions with the results.

## Deferred

- The human count itself (two people, about 1–2 hours for both clips).
- Line-crossing reference for `medium_yonge_dundas` (part of the human kit).
- An opt-in "far / dense mode" (tiles) and a density-map model for crowds of hundreds: both need changes outside this page
  (`lensiq-zonecam.js`, a new model with a clean licence).
- Re-measuring on the customer's own camera position: these are street clips, not shops or event halls.

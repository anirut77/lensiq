# LENSIQ Exam hall mode: person detector switch (COCO-SSD → YOLOX-Nano), fixed test set and measured numbers

Queue item "Hall-mode detector switch" (owner-approved plan: switch the person detector of hall mode to YOLOX-Nano as
its own commit, with before / after numbers). Background: `docs/exam/HALL-NO-FACE-ASSESSMENT.md` §0 – §3.

Every number in this document carries its source: **public dataset** (Open Images V7 still images, not exam-room
footage), **calc**, or **repo** (a file named). There is **no field number**: no real exam hall footage exists
(`~/LENSIQ-field/` has no hall / seat-watch evaluation set; `docs/pilot/*HALL-SEATWATCH*` are the pilot kit, not data).
Hall mode stays **experimental**.

## 1. Fixed test set and protocol (written before the set was built and before any detector was run)

### 1.1 What is compared

The hall page's own detector call, unchanged, on the same frames:

| Key | What runs | Role |
|---|---|---|
| `coco` | `LQDetect.detectCoco(cocossd, frame, {classes: [0, 76], minScore: 0.35, max: 40})`; persons kept at score ≥ 0.4, phones at ≥ 0.5 (`hallPhoneConf`) | **BEFORE** (shipped default) |
| `coco-t2` | the same with `tiles: {cols: 2, rows: 2, overlap: 0.2}` (the page's "large room: 2 × 2" option) | BEFORE, tiles option |
| `yolox` | `LQDetect.detectPeople(yolox_nano_416, frame, {classes: [0, 67], minScore: 0.35, max: 40, detW: 416, split: "auto"})` (67 = cell phone in YOLOX's 80-class order, `LQZones.cocoIndex`); same score cuts | **AFTER** candidate (the zone pages' call) |
| `yolox-t2` | the same with `tiles: {cols: 2, rows: 2, overlap: 0.2}` (whole frame + 4 tiles) | AFTER, tiles option |

No threshold is tuned: both detectors use the page's existing cuts (0.35 detector, 0.4 person, 0.5 phone). Nothing
is picked on this set, so there is no dev / held-out split.

### 1.2 Set (S seated / indoor people, P phones, E empty seats)

- Source: **Open Images V7, validation split** (Google LLC; annotations CC BY 4.0), the metadata files already in
  `~/LENSIQ-field/exam-faces/meta/`. Each image's own `License` field must be the CC BY 2.0 URL; no rotation flag.
  Images already used in `~/LENSIQ-field/exam-faces/manifest.jsonl` or `~/LENSIQ-field/exam-faces-hall/manifest.jsonl`
  are excluded. Author, Flickr page and licence per image in `CREDITS.tsv`. CrowdHuman, SCB, MOT and PETS are **not**
  used (non-commercial terms, `HALL-NO-FACE-ASSESSMENT.md` §3).
- Images downloaded from the Open Images S3 mirror into `~/LENSIQ-field/evals/hall-detector/images/` (outside the
  repo), resized to ≤ 1,280 px on the long side, **deleted after the run**; `manifest.jsonl`, `CREDITS.tsv`, the raw
  results JSON and the run log stay in `~/LENSIQ-field/evals/hall-detector/`. No image of a person enters the repo.
- Within each group, eligible images are sorted by SHA-256 of the ImageID; the first that download are taken up to the
  target. Person classes = Person, Man, Woman, Boy, Girl; seat classes = Chair, Desk, Table, Bench.

| Group | Target | Rule |
|---|---|---|
| S people with seats (proxy for a hall view) | 200 | ≥ 3 person boxes that are neither group nor depiction, and ≥ 1 seat-class box. Open Images has no "seated" or "exam hall" label, so this is a proxy (indoor scenes with chairs / desks / tables and several people), stated as a limitation |
| P phones | 100 | ≥ 1 `Mobile phone` box that is neither group nor depiction (person boxes in these images are also scored) |
| E empty seats | 100 | `Person` verified absent (image-level label confidence 0), no box of any person / human-part class, doll, sculpture or poster, and ≥ 1 seat-class box |

### 1.3 Frame and ground truth

- Frame = the image scaled to fit a **1,280 × 720** canvas, centred, grey #808080 padding (the size the hall loop
  works on, `PROC_W = 1280`; COCO-SSD reads a 416-px-wide copy of any camera size anyway).
- Person ground truth: the person-class boxes; boxes of different person classes with IoU ≥ 0.7 are one person (Open
  Images may box the same person as both `Person` and `Man`). A group or depiction box is an **ignore** region; a
  person < 24 px tall in the frame is also ignore. Ignore regions absorb detections (IoU ≥ 0.3 or centre inside).
  *Note added after the run:* the tool merges any two person boxes with IoU ≥ 0.7, whatever their class (the stored
  boxes carry no class); the reviewer's scorer did the same.
- Phone ground truth: `Mobile phone` boxes (group / depiction = ignore; < 8 px long side = ignore).
- Matching: greedy by IoU, hit at **IoU ≥ 0.5** for persons and **IoU ≥ 0.3** for phones (small boxes).

### 1.4 Metrics

- **Person recall** by box height in the 1,280 × 720 frame: 24 – 72, **72 – 144, 144 – 288** (together "hall band"),
  ≥ 288 px. Hall band [calc]: a seated person shows about 0.8 – 1.2 m above the desk line; with a 78° lens a 1,280-px
  frame has 116 px per metre at 6.8 m (row 5) and 180 px at 4.4 m (row 3), so a seated person at 3 – 9 m is about
  70 – 220 px tall. Wilson 95 % interval on every proportion.
- **False person boxes per frame** on S (detections matching neither a person nor an ignore region) and **precision**
  on S. Open Images boxes are close to exhaustive for verified classes but not perfect, so some "false" boxes may be
  unlabelled people.
- **Empty-seat false alarm** = E frames with ≥ 1 person box (score ≥ 0.4), Wilson; also false person boxes per E frame.
- **Phone recall** on P by long side (< 16, 16 – 32, 32 – 64, ≥ 64 px) and **phone false alarm** = E frames with ≥ 1
  phone box (score ≥ 0.5).
- **Latency**: wall time of the page call on a 1,280 × 720 canvas, median and p90, on the first 40 S frames after a
  warm-up, headless Chrome on this machine, **CPU / WASM only** (`?cpu`: TF.js WASM backend for COCO-SSD; ONNX Runtime
  Web WASM, 1 thread, for YOLOX — the page is not cross-origin isolated), unthrottled and with CDP CPU throttling 4×
  ("emulated mid-range laptop", not a real laptop).

### 1.5 Decision rule (fixed before the run)

YOLOX-Nano becomes the hall default (`yolox` replaces `coco`) only if, on the whole locked set, **every** one of these
holds (point estimates, no tolerance):

1. person recall in the hall band (72 – 288 px): `yolox` ≥ `coco`;
2. person recall over all counted sizes: `yolox` ≥ `coco`;
3. empty-seat false alarm (E frames with a person): `yolox` ≤ `coco`;
4. false person boxes per frame on S: `yolox` ≤ `coco`;
5. phone recall: `yolox` ≥ `coco`, and phone false alarm on E: `yolox` ≤ `coco`;
6. speed: `yolox` median on the emulated mid-range laptop ≤ 500 ms (the hall loop needs ≥ 2 frames per second).

Otherwise COCO-SSD stays the default and YOLOX-Nano is added as an option that is off by default. The tiles option is
decided the same way (`yolox-t2` against `coco-t2`, rules 1 – 5, and ≤ 1,000 ms emulated); if it fails, the tiles
option keeps COCO-SSD. COCO-SSD stays in the page as the fallback when ONNX Runtime cannot run (nothing is removed).

### 1.6 Locked set (built 2026-11-11 by `node tools/exam-hall-detector-eval.mjs --select`, recorded before any detector ran)

Fewer images were eligible than the targets, so every eligible image was taken: **S 137, P 92, E 94 = 323 images**
(all downloaded; none failed). The hashes are also in `~/LENSIQ-field/evals/hall-detector/locked.sha256`.

| File | sha256 |
|---|---|
| `manifest.jsonl` (image id, group, original size, person and phone boxes, flags) | `a5c857ab0822e7d50666ad7a7d2db3da93290d059d9b464d69f6c37a334633ab` |
| `CREDITS.tsv` (author, Flickr page, CC BY 2.0 per image) | `5f94c128392ceeced01ec48b7d18c949abe0ef8debaab5da639c718498d6aca0` |
| the 323 resized images, sorted by name and concatenated (deleted after the run) | `9cf389cb664e2af45a9faa60ba11f124f37ac550524168d513af7f69ff0492c6` |

## สรุปสำหรับเจ้าของ (Thai summary)

- **ผล: ยังไม่สลับ** ตัวตรวจหาคนของโหมดห้องสอบยังเป็น COCO-SSD ตามเดิม YOLOX-Nano ถูกเพิ่มเป็นตัวเลือก "ทดลอง" ที่ปิดไว้เป็นค่าเริ่มต้น
  (ช่อง "ตัวตรวจหาคนและโทรศัพท์" ในหน้าตั้งค่าเครื่องกล้อง หรือ `?yolox`) ไม่มีอะไรถูกลบ
- **เหตุผล (ตามกฎที่ล็อกไว้ก่อนวัด §1.5):** YOLOX-Nano หาคนนั่งเจอมากกว่าชัดเจน (ช่วงขนาดแบบห้องสอบ 57.9% เทียบ 34.4%) แต่
  แย่กว่าในข้อที่เกี่ยวกับความปลอดภัย 3 ข้อ: แจ้งว่ามีคนในภาพเก้าอี้ว่าง 3 / 94 ภาพ (เดิม 0 / 94) · กรอบคนผิดต่อภาพ 0.401 (เดิม 0.394) ·
  หาโทรศัพท์เจอ 25.0% (เดิม 70.0%) และช้ากว่า (แล็ปท็อประดับกลางจำลอง 612 ms ต่อภาพ = 1.6 ภาพ/วินาที ต่ำกว่าขั้นต่ำ 2)
- **ที่มาทุกตัวเลข: ชุดข้อมูลสาธารณะ** (ภาพนิ่ง Open Images V7, CC BY 2.0, 323 ภาพ) ไม่ใช่ภาพห้องสอบจริง ไม่มีตัวเลขภาคสนาม
  โหมดห้องสอบยังเป็น "รุ่นทดลอง"
- **ข้อที่เจ้าของควรรู้:** ตัวตรวจเดิม (COCO-SSD) หาคนนั่งในช่วงขนาดแบบห้องสอบไม่เจอ 65.6% ของคน (ภาพสาธารณะ ไม่ใช่ห้องจริง)
  ความเสี่ยงหลักคือแจ้ง "ที่นั่งว่าง" ผิด การเปลี่ยนตัวตรวจไม่ได้แก้ปัญหานี้แบบไม่มีข้อเสีย ต้องวัดในห้องจริงก่อนตัดสินใจ

## 2. Measured numbers (run 2026-11-11, `node tools/exam-hall-detector-eval.mjs --run`)

**Source of every number in this section: public dataset** (Open Images V7 validation still images, CC BY 2.0; indoor
scenes with several people and chairs / desks / tables as a proxy for a hall view; **not exam-room footage, no field
number**). Raw results: `~/LENSIQ-field/evals/hall-detector/results/halldet-2026-11-11.json` (manifest sha256 inside
the file matches §1.6); tables: `results/tables.md`; the images were deleted after the run. Machine: Apple M1, 8 GB,
headless Chrome 157, TF.js WASM backend (COCO-SSD), ONNX Runtime Web WASM 1 thread (YOLOX), page not cross-origin
isolated. One run; nothing was re-run or tuned.

### 2.1 Before / after (the page's default call, no tiles)

| Measure | n | BEFORE `coco` | AFTER `yolox` | Better | Source |
|---|---|---|---|---|---|
| Person recall, hall band 72 – 288 px tall | 442 persons | 152 = **34.4 %** [30.1 – 38.9] | 256 = **57.9 %** [53.3 – 62.4] | YOLOX | public dataset |
| Person recall, 72 – 144 px (about rows 4 – 7 at a 78° lens, calc) | 195 | 19.5 % [14.5 – 25.6] | 48.7 % [41.8 – 55.7] | YOLOX | public dataset |
| Person recall, 144 – 288 px (about rows 1 – 3, calc) | 247 | 46.2 % [40.0 – 52.4] | 65.2 % [59.0 – 70.8] | YOLOX | public dataset |
| Person recall, all counted sizes (≥ 24 px) | 860 | 42.3 % [39.1 – 45.7] | 55.3 % [52.0 – 58.6] | YOLOX | public dataset |
| Person recall, ≥ 288 px (very close) | 275 | 75.3 % [69.8 – 80.0] | 66.9 % [61.1 – 72.2] | COCO | public dataset |
| **Empty-seat false alarm** (empty-room frames with ≥ 1 person box) | 94 frames | **0 / 94 = 0.0 %** [0.0 – 3.9] | **3 / 94 = 3.2 %** [1.1 – 9.0] | COCO | public dataset |
| False person boxes per frame (people scenes) | 137 frames | 0.394 (54) | 0.401 (55) | COCO (by 1 box) | public dataset |
| Precision on people scenes | | 86.7 % [83.0 – 89.7] | 89.5 % [86.6 – 91.8] | YOLOX | public dataset |
| Phone recall (score ≥ 0.5, IoU ≥ 0.3) | 120 phones in 92 frames | **70.0 %** [61.3 – 77.5] | **25.0 %** [18.1 – 33.4] | COCO | public dataset |
| Phone false alarm on empty-room frames | 94 | 0 / 94 | 0 / 94 | equal | public dataset |
| Time per 1,280 × 720 frame, median / p90, M1 unthrottled | 40 frames | 80 / 96 ms (12.5 fps) | 130 / 152 ms (7.7 fps) | COCO | measured on this machine |
| Same, CPU throttled 4× ("emulated mid-range laptop", not a real laptop) | 40 frames | **315** / 383 ms (3.2 fps) | **612** / 684 ms (1.6 fps) | COCO | measured on this machine |

Almost all phones in this set are large (119 of 120 have a long side ≥ 64 px): the phone numbers say nothing about a
phone at hall distance, which neither detector is expected to see (`HALL-NO-FACE-ASSESSMENT.md` §1).

### 2.2 Tiles option (2 × 2 + whole frame)

| Measure | `coco-t2` | `yolox-t2` | Source |
|---|---|---|---|
| Person recall, hall band | 48.4 % [43.8 – 53.1] (214 / 442) | 56.1 % [51.4 – 60.7] (248 / 442) | public dataset |
| Person recall, all counted | 48.7 % (419 / 860) | 56.7 % (488 / 860) | public dataset |
| Empty-seat false alarm | 2 / 94 = 2.1 % | 6 / 94 = 6.4 % | public dataset |
| False person boxes per people frame | 0.460 | 0.511 | public dataset |
| Phone recall | 72.5 % (87 / 120) | 58.3 % (70 / 120) | public dataset |
| Emulated mid-range median | 1,319 ms (0.8 fps) | 1,692 ms (0.6 fps) | this machine |

### 2.3 Decision (rule §1.5, applied as written)

| Rule | `yolox` vs `coco` | `yolox-t2` vs `coco-t2` |
|---|---|---|
| 1 person recall, hall band | pass | pass |
| 2 person recall, all counted sizes | pass | pass |
| 3 empty-seat false alarm | **fail** (3 vs 0) | **fail** (6 vs 2) |
| 4 false person boxes per people frame | **fail** (0.401 vs 0.394) | **fail** (0.511 vs 0.460) |
| 5a phone recall | **fail** (25.0 % vs 70.0 %) | **fail** (58.3 % vs 72.5 %) |
| 5b phone false alarm | pass | pass |
| 6 speed | **fail** (612 ms > 500 ms) | **fail** (1,692 ms > 1,000 ms) |

**COCO-SSD stays the hall default, for the whole frame and for the tiles option.** YOLOX-Nano is added as an
**experimental option, off by default**. Rule 4 fails by one box in 137 frames, which is noise; rules 3, 5a and 6 are
real differences (rule 3: 3 vs 0 is not statistically separable at n = 94, but the rule has no tolerance, by design).

### 2.4 What this means

- The trade-off is real and goes both ways: YOLOX-Nano misses far fewer seated people at hall size (the main safety
  risk of seat watch is a false "empty", `HALL-NO-FACE-ASSESSMENT.md` §4), but it puts a person on some empty chairs,
  finds far fewer phones at the page's phone cut (0.5; YOLOX scores = objectness × class, which runs lower for phones;
  no threshold was tuned, by protocol), and is half as fast on CPU.
- **Both detectors miss many seated people at hall size** on these images (COCO-SSD 65.6 %, YOLOX-Nano 42.1 % of the
  hall band). Hall mode cannot claim seat occupancy from these numbers; it stays experimental.
- A tuned YOLOX setting (a lower phone cut, a higher person cut, or YOLOX for persons only with COCO-SSD for phones)
  might pass, but choosing it needs a **new fixed protocol with a dev / held-out split** (this set has no split because
  nothing was to be tuned). Not done here: it would change the approved scope (owner decision).

### 2.5 Independent re-measurement (reviewer agent, 2026-11-11)

A separate reviewer agent wrote its own scorer (Python, not this tool's code) from §1.3 – §1.5 and re-scored the raw
results JSON. **Every number in §2.1 and §2.2 reproduced exactly; no mismatch.** It confirmed the locked hashes (§1.6)
and that the decision follows from the rule. The decision does **not** depend on rule 4's one-box margin: rules 3, 5a
and 6 each fail alone (the robust failures are 5a phone recall and 6 speed; rule 3, 3 / 94 vs 0 / 94, overlaps within
its Wilson intervals). Its notes, taken over here: (1) §1 was not committed separately before the run, so its timing
cannot be proven from the repo history; the set was hashed (22:20) before the run (results 22:30). Future rounds:
commit the protocol first. (2) The images were deleted after the review (`--cleanup`); the run log was copied to
`~/LENSIQ-field/evals/hall-detector/run.log`. (3) The tiles option is slow with either detector: `coco-t2` is also over
1,000 ms on the emulated laptop (1,319 ms); the rule only checked that limit for `yolox-t2`.

## 3. What was built

- `exam-hall.html` / `exam-hall.js`: a "Detector for people and phones" choice in the camera setup form (TH / EN / ZH):
  **COCO-SSD (default)** or **YOLOX-Nano (experimental)**; also `?yolox`. Remembered with the node settings. ONNX
  Runtime is loaded **only** when YOLOX-Nano is chosen; if it cannot run, COCO-SSD takes over (decided by the actual
  failure) and the status line names the detector that runs ("COCO-SSD · WASM" / "YOLOX-Nano · WASM"). Same score cuts
  as before (0.35 / person 0.4 / phone 0.5); YOLOX uses `split: "auto"` like the zone pages. Seat logic unchanged.
- `tools/exam-hall-detector-eval.mjs`: the selection, run and scoring tool of this document.
- `tests/e2e/exam-hall.e2e.mjs`: COCO-SSD is the default, YOLOX-Nano is offered, ONNX Runtime is not loaded by default,
  and the choice is saved with the node settings.
- No new model, no new dependency: both detectors were already vendored (Apache-2.0, `LICENSES/THIRD_PARTY.md`).

## 4. Open points for the owner

1. Seat-watch false "empty" is the larger risk on these numbers (COCO-SSD misses 65.6 % of hall-size seated people on
   public images). Field numbers from a real room (`docs/pilot/PILOT-HALL-SEATWATCH.md`) are needed before any claim.
2. Whether to run a second, separate protocol (dev / held-out split) for a tuned YOLOX setting or a mixed setup (YOLOX
   persons + COCO-SSD phones, about 0.9 s per frame on the emulated laptop [calc from §2.1: 612 + 315 ms]). Not started:
   scope decision.
3. The speed numbers are an emulated slowdown on an M1, not a real mid-range laptop.

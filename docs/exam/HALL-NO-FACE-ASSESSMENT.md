# LENSIQ Exam: hall mode without faces (assessment only, 2026-11-10)

> **Assessment only. Nothing was built, changed, downloaded or measured for this document.**
> Every number carries its source: **[calc]** geometry or arithmetic in this document · **[repo]** a measurement already
> in the repo (file named) · **[public]** a licence or fact read from the dataset's own page today · **[unverified]**
> not checked, or taken from memory. No number here is an accuracy claim for an exam room.

## สรุปภาษาไทย

- **คำแนะนำ: ควรทำ "โหมดเฝ้าที่นั่ง" (ไม่ใช้ใบหน้า) เป็นสินค้าห้องสอบตัวแรก ก่อนโหมดที่ใช้ใบหน้า** เพราะสัญญาณที่นั่งว่าง /
  กลับมา / ออกก่อนเวลา / มีคนเกินในที่นั่ง / มีคนในทางเดิน / โทรศัพท์ **มีอยู่ในหน้า `exam-hall` แล้วและไม่ใช้ใบหน้าเลย**
  สิ่งที่ขาดคือ (1) ตัวเลขที่วัดจริง (2) สัญญาณ "ยืน" (3) โซนผู้คุมสอบ (4) การเตือนเมื่อกล้องถูกขยับ (5) เปลี่ยนตัวตรวจจาก
  COCO-SSD เป็น YOLOX-Nano ซึ่งมีในระบบอยู่แล้ว
- **จำนวนกล้อง (เป็นการคำนวณทั้งหมด ยังไม่ได้วัด เลนส์มุมรับภาพแนวนอน 78°):** ห้อง 6 × 8 ม. ใช้ **2–4 ตัว** · ห้อง 8 × 10 ม. ใช้ **3–6 ตัว** ·
  ห้อง 10 × 15 ม. ใช้ **6–12 ตัว** (เลนส์กว้างกว่านี้ตัวเลขบนสูงขึ้น ดูตารางข้อ 2) เทียบกับโหมดใบหน้า 4–10 / 6–12 / 16–33 ตัว (1080p) ข้อดีจริงคือ **ใช้กล้อง 1080p ธรรมดาได้ (ไม่ต้อง 4K)**
  ติดที่มุมห้องหรือผนังหลังได้ และยังทำงานตอนผู้สอบก้มหน้าเขียน **แต่ไม่ได้ลดเหลือ 1 กล้องต่อห้อง** ตัวจำกัดคือแถวหน้าบังแถวหลัง
  และความกว้างของแถวแรก ไม่ใช่ความละเอียดกล้อง
- **โทรศัพท์: ไม่ควรอ้างในระยะห้องสอบ** โทรศัพท์ยาว 16 ซม. ที่ระยะ 6.8 ม. เหลือ 11–21 px ในภาพที่ตัวตรวจเห็น (คำนวณ)
  ต่ำกว่าขนาดที่ตัวตรวจหาได้ ใช้ได้อย่างมากแถวแรก และโทรศัพท์ใต้โต๊ะมองไม่เห็นอยู่แล้ว
- **ภาพสาธารณะวัดได้แค่บางส่วน:** วัด "หาคนนั่งเจอไหมตามขนาด" และ "หาโทรศัพท์เจอไหมตามขนาด" จากภาพนิ่ง Open Images V7
  (ภาพ CC BY 2.0) ได้ แต่ **อัตราแจ้งผิดต่อที่นั่งต่อชั่วโมง วัดจากภาพสาธารณะไม่ได้** ต้องสอบจำลองในห้องจริง (30 ที่นั่ง × 3 ชม.)
  ชุดข้อมูลพฤติกรรมในห้องเรียน (SCB, CrowdHuman, MOT) ห้ามใช้เชิงพาณิชย์ จึงไม่ใช้
- **ความเสี่ยงหลัก:** แจ้งผิดเมื่อแถวหน้าบัง · ผู้สอบที่ต้องลุก/เข้าห้องน้ำ/ใช้รถเข็น · ผู้คุมสอบเดิน · กล้องถูกขยับแล้วกรอบที่นั่งเลื่อน ·
  PDPA (วิดีโอผู้สอบ เด็กนักเรียน) ทุกสัญญาณเป็น "เหตุการณ์ให้คนไปดู" ไม่ใช่คำตัดสิน
- **สิ่งที่ขอเจ้าของ:** ห้องจริง 1 ห้อง เว็บแคม + ขาตั้งสูง ≥ 2.6 ม. แล็ปท็อประดับกลางเครื่องจริง อาสาสมัครผู้ใหญ่ 6–10 คนพร้อมใบยินยอม
  และการตัดสินใจ 4 ข้อท้ายเอกสาร

## 0. Key finding first: most of the no-face mode already exists

`exam-hall.js` + `LQExam.createHallMonitor` (`lensiq-exam.js`) already produce seat events from **person boxes and seat
polygons only**: `empty` / `back` (with time away), `early`, `extra` (≥ 2 people in a seat zone), `aisle`, `lean`,
`phone`, plus room-event suppression, walk mode and a 60 s room mute. `docs/EXAM.md` says "Seat signals below do not use
faces". The face pass is an optional counter that sends nothing. Mode A is labelled experimental **because of small
faces** (owner decision 2026-11-10), not because the seat signals were measured and failed: they have **never been
measured** (`docs/ACCURACY-CLAIMS.md`: Exam flags, phone detection: "not measured") [repo].

So the question is not "can we build it" but "what does it honestly detect, at what distance, with how many cameras".

Facts about what runs today [repo]:

| Item | Today | Source |
|---|---|---|
| Hall detector | COCO-SSD lite (Apache-2.0), classes person + cell phone, every input squeezed to 300 × 300, optional 2 × 2 tiles | `exam-hall.js`, `lensiq-detect.js` |
| Zone pages (queue, tables, afterhours, bays) | YOLOX-Nano 416 (Apache-2.0) through `LQDetect.detectPeople`, `split: "auto"`, anonymous track ids (`LQTrack`), polygon editor, hysteresis, cooldown, on-site "real / false alarm" tally with Wilson interval | `lensiq-zonecam.js`, `lensiq-zones.js` |
| Camera request | 1,280 × 720 | `exam-hall.js` |
| Person recall by size, YOLOX-Nano vs COCO-SSD (standing pedestrians, score 0.4) | person 20–35 % of frame height: **78–96 %** vs 35–79 % · 10–20 %: 20–59 % on MOT17 (90 % on PETS) vs 7–34 % · < 10 %: 3–5 % | `ACCURACY.md` §1 (MOT17 / PETS; those sets are non-commercial, evaluation only) |
| Speed, YOLOX-Nano per 416 pass, WASM 1 thread | 46 ms on Apple M1 · 180 ms emulated 4× slower device | `docs/CROWD-ACCURACY.md` |
| Speed, COCO-SSD hall call | 388 ms (M1, software WebGL) · 442 ms throttled 4× | `docs/exam/FACE-ENGINE-RESULTS.md` §7.1 |

## 1. Signals: how each is computed, pixel size needed, failure modes

**Unit used below: "model px"** = pixels after the page scales a frame (or a tile) to the detector's 416-px input.
Camera resolution above the tile size adds nothing; this is the most important difference from the face guide.

**Pixel basis [calc from repo].** A 1080p frame letterboxed to 416 wide is 234 px tall, so the repo's size bands become:
< 23 model px tall: almost never found · 23–47 px: 20–59 % · **≥ 47 px: 87–96 %** (YOLOX-Nano, MOT17) · PETS at 31–62 px:
90 %. Planning target used here: **seated person ≥ 48 model px tall** (cautious) and **≥ 32** (optimistic). Caveat: these
are standing pedestrians outdoors; a seated person behind a desk is a different shape and **has not been measured**.

| Signal | Status | How (person boxes + seat zones, no identity) | Minimum size (model px) | Main failure modes |
|---|---|---|---|---|
| Seat occupied / empty | built (`empty`, `back`) | box centre inside the seat polygon; seen occupied, then empty 3 of 4 frames for 20 s; return logs time away | person ≥ 48 tall (plan), ≥ 32 (optimistic) | present person missed (far row, hidden by the row in front, head on desk, dark clothes in dim light) = false "empty" · jacket on a chair read as a person = false "occupied" [unverified] · person behind falls into the polygon in front (perspective) |
| Leaving the seat | built (`empty` ≥ 20 s, `early` ≥ 3 min before minimum time) | same; accommodation `breaks` lengthens the time 3× | same | toilet breaks are normal events; value is the time log, not an alert |
| Standing | **not built** | per-seat baseline of the box top (median of the first minutes); event when the top rises ≥ X % for ≥ T s. Needs the seat anchor moved from box centre to a lower point (`LQZones.anchor`) or `LQTrack` ids: today a standing person's centre can jump into the seat behind and read as "empty + extra" there | a 0.4 m rise = 42 px at 4.4 m, 27 px at 6.8 m (HFOV 78°, 2 passes) [calc]; needs ≥ ~16 px rise [unverified: box jitter not measured] | stretching, tall or short candidates, wheelchair users (no rise), a person standing in front hides the row behind |
| Walking in aisles | built as `aisle` (person outside every seat ≥ 8 s, room-level, off in walk mode) | a motion version needs `LQTrack` displacement (exists in the product) | a standing person 1.7 m = 64 px at 6.8 m, 55 px at 8 m in **one** pass [calc]: the easiest signal | invigilators walk too (see exclusion zone) · person half hidden by desks · frame edge cuts the box |
| Two people in one seat zone | built (`extra`: 5 s Watch, 15 s Check) | count of box centres in the polygon | both ≥ 48 | two close people merged into one box (NMS IoU 0.5) = miss · invigilator bending over a desk = false alarm · row-behind overlap |
| Phone visible | built (`phone`, score ≥ 0.5, 3 of 5 frames, level Check) | phone box centre in a seat polygon | **≥ 32 px long side** [unverified: no phone-by-size measurement in the repo] | see calculation below: too small beyond the first row; under-desk or in-lap phones are never visible; calculators, pencil cases, wallets [unverified] |
| Invigilator exclusion zone | **not built** (today: walk-mode toggle, auto-off after 5 min; room mute 60 s) | a drawn polygon where person boxes are ignored (reuse the polygon editor) | – | an invigilator in an aisle cannot be told from a candidate without identity, and identity is not allowed: "person in aisle" stays an Info event |

Also built: `lean` (> 25 % of a box inside a same-row neighbour's polygon ≥ 4 s, level Watch). It is the one seat signal
that reads posture; see fairness in §4.

**Phone size at hall distance [calc].** Phone long side 0.16 m, short side 0.075 m. Source px = 0.16 × R ÷ (2 × d ×
tan(HFOV / 2)); model px = source px × 416 ÷ tile width in source px.

| Distance (HFOV 78°) | 1080p source px | 4K source px | Model px, 2 passes | 7 passes | 13 passes |
|---|---|---|---|---|---|
| 2.0 m (row 1) | 95 | 190 | 37 | 53 | 70 |
| 3.2 m (row 2) | 59 | 119 | 23 | 33 | 44 |
| 4.4 m (row 3) | 43 | 86 | 17 | 24 | 32 |
| 6.8 m (row 5) | 28 | 56 | 11 | 16 | 21 |
| 8.0 m (row 6) | 24 | 47 | 9 | 13 | 17 |

- The detector's finest grid cell is 8 px, so an object 11–21 px long covers 1–3 cells: not expected to be found
  [unverified, detector design; no measurement]. A phone lying flat on a desk is also foreshortened: seen from 2.6 m
  high at 4.4 m the viewing angle is 23°, so its depth shrinks to about 0.39× [calc].
- 4K source pixels only help if the page crops **one seat at native resolution** (the "cycled seat crops" idea in
  `docs/EXAM.md` v2): 4K, 78°, 6.8 m gives a 56-px phone in a 1.19 m crop [calc]. Cost: one pass per seat, 30 seats =
  1.4 s per sweep on M1, 5.4 s on the emulated slower device [calc from repo timings]. 1080p gives 28 px: not enough.
- **Conclusion: no phone claim at hall distance.** Rows 1–2 at best, unmeasured.

## 2. Cameras per room (every number here is a calculation)

**Formulas.** Rectilinear lens, depth d along the optical axis, f = share of the frame width one tile covers.

    model px = h × 416 / (2 × d × tan(HFOV / 2) × f)           (capped by the source: tile must be ≥ 416 px wide)
    d_max    = h × 416 / (N × 2 × tan(HFOV / 2) × f)
    visible height behind a row: h = 1.30 − max(0.75, H − (H − 1.30) × d / (d − p))    (desk top 0.75 m, head top 1.30 m)

h = 0.55 m (seated person above the desk), N = 48 or 32 model px, H = camera height, p = row pitch 1.2 m.
Tile plans already in `LQDetect` and their measured cost [repo, `docs/CROWD-ACCURACY.md`]:

| Plan | f | Passes | M1 | Emulated 4× slower |
|---|---|---|---|---|
| whole frame | 1.00 | 1 | 22 / s | 5.6 / s |
| `split: "auto"` (2 halves) | 0.563 | 2 | 10 / s | 2.8 / s |
| whole + 3 × 2 tiles | 0.385 | 7 | 3.3 / s | 0.8 / s |
| whole + 4 × 3 tiles | 0.294 | 13 | 1.8 / s | 0.4 / s |

**Depth one camera reaches, no occlusion (d_max, N = 48 / 32):**

| Plan | HFOV 78° | HFOV 90° | HFOV 110° |
|---|---|---|---|
| 1 pass | 2.9 / 4.4 m | 2.4 / 3.6 m | 1.7 / 2.5 m |
| 2 passes | 5.2 / 7.8 m | 4.2 / 6.4 m | 3.0 / 4.5 m |
| 7 passes | 7.7 / 11.5 m | 6.2 / 9.3 m | 4.3 / 6.5 m |
| 13 passes | 10.0 / 15.0 m | 8.1 / 12.2 m | 5.7 / 8.5 m |

**Occlusion is the real limit.** With a camera at 2.6 m and a candidate sitting directly behind another, the visible
part of the far candidate shrinks: 0.55 m at 3.2 m, 0.49 m at 4.4 m, 0.35 m at 5.6 m, **0.28 m at 6.8 m**, 0.23 m at
8.0 m, 0.12 m at 14 m. At 3.0 m height: 0.46 m at 5.6 m, 0.36 m at 6.8 m, 0.30 m at 8.0 m. A box that small is a head,
not a person.

**Layout A: front wall, same assumptions as the face guide** (first row 2.0 m away, rows 1.2 m apart, desk block =
room width − 1 m; cameras = banks in depth × cameras side by side; side by side = ceil(block ÷ view width at 2 m:
3.24 m at 78°, 4.00 m at 90°, 5.71 m at 110°)). Range = from "no occlusion, N = 32" to "in-line occlusion at 2.6 m,
N = 48", for the 2-pass and 7-pass plans.

| Room | Face guide, 1080p | Face guide, 4K | **Person-level, HFOV 78°** | **HFOV 90°** | **HFOV 110°** |
|---|---|---|---|---|---|
| 6 × 8 m (5 rows, block 5 m, ~20 seats) | 4–10 | 2–4 | **2–4** | **2–6** | **2–5** |
| 8 × 10 m (6 rows, block 7 m, ~35 seats) | 6–12 | 3–6 | **3–6** | **2–6** | **4–12** |
| 10 × 15 m (11 rows, block 9 m, ~75 seats) | 16–33 | 8–9 | **6–12** | **6–18** | **6–22** |

- **720p, 1080p and 4K give the same count** for these plans: the tile, not the sensor, sets the size. 4K only matters
  for phone crops. No USB 3 or active-cable problem.
- One camera per room appears only in one corner of the calculation (6 × 8 m, 110° lens, 13 passes, 32 px, no
  occlusion). It is not a planning figure.
- Banks behind the first can hang on the **back wall** looking at candidates' backs (impossible for faces), so no
  mid-room ceiling mounts up to two banks.

**Layout B: two cameras in opposite high corners, lens ≥ 90°** (not possible for faces). Each camera takes the nearer
half of the room; the farthest axial depth it must reach is (width + length) ÷ (2 × √2): **4.9 m** (6 × 8), **6.4 m**
(8 × 10), **8.8 m** (10 × 15). Against the 90° column above: 6 × 8 m fits with 7 passes at 48 px or 2 passes at 32 px;
8 × 10 m fits with 7 passes at 32 px only (6.2 m < 6.4 m at 48 px); 10 × 15 m fits only at 32 px with 7 passes, so
plan 4–6 cameras there. **Occlusion in a diagonal view is not calculated**; it is the first thing the room test must
show.

**Summary for the owner [calc], 78° lens: 2–4 cameras for an ordinary classroom, 3–6 for 8 × 10 m, 6–12 for a
10 × 15 m hall** (two corner cameras may do for the first two rooms if the room test shows occlusion allows it; wider
lenses raise the upper end). Fewer than the face mode at 1080p (4–10, 6–12, 16–33) and about the same as the face mode at 4K (2–4, 3–6, 8–9), but
with ordinary 1080p cameras, 2–7 passes per frame instead of about 48 tiles, and working while heads are down.

## 3. What public footage can and cannot measure

**Licences read today (no data downloaded).**

| Source | Licence, as stated | Usable? | For what |
|---|---|---|---|
| Open Images V7 · https://storage.googleapis.com/openimages/web/factsfigures_v7.html | "The annotations are licensed by Google LLC under CC BY 4.0 license. The images are listed as having a CC BY 2.0 license." [public]. Boxable classes include Person, Mobile phone, Chair, Desk, Table, Laptop, Book, Backpack, Handbag [public, class list]. An image-level "Classroom" label: [unverified] | **Yes**, with the per-image licence check and credits file already used in `FACE-ENGINE-RESULTS.md` §6.1 | still frames: seated-person recall by size, phone recall by size, false boxes in empty rooms |
| COCO val2017 · https://cocodataset.org/#termsofuse | annotations "Creative Commons Attribution 4.0"; "The COCO Consortium does not own the copyright of the images. Use of the images must abide by the Flickr Terms of Use" [unverified: read from a mirror, official page not readable]. Per-image licence field | **Partly**: only images whose own licence is CC BY / CC BY-SA / no known restrictions. Same family as the detector's training data, so results read optimistic | cell-phone recall by size (second opinion) |
| Wikimedia Commons video · https://commons.wikimedia.org/wiki/Category:Videos_of_education (76 files, 17 sub-categories), `Category:Videos_of_lectures`, `Category:Videos_of_schools` [public] | per file: CC0, CC BY, CC BY-SA or public domain (the route `docs/CROWD-ACCURACY.md` already uses) | **Per file, after a person screens it.** No file has been confirmed to show a fixed view of seated students [unverified]; most lecture videos film the speaker. `Category:Videos_of_classrooms` does not exist | event tests, if enough clips exist |
| Pexels stock video · https://www.pexels.com/license/ | "All photos and videos on Pexels can be downloaded and used for free"; "Identifiable people may not appear in a bad light or in a way that is offensive"; no redistribution on other platforms [public]. Not a CC licence; terms of service not read | **Unverified.** Short staged clips with moving cameras: weak proxy | at most a smoke test |
| SCB-Dataset (student classroom behaviour) · https://github.com/Whiffe/SCB-dataset | "intended for academic research, personal learning, and non-commercial use only"; commercial use "strictly prohibited without the explicit written permission of the copyright holder" [public] | **No** | – |
| CrowdHuman · https://www.crowdhuman.org/download.html | "You will use the data only for non-commercial research and educational purposes." [public] | **No** | – |
| MOT17 / MOT20, PETS 2009 | CC BY-NC-SA 3.0 / research use [repo, `ACCURACY.md`] | **No** for this work. Note: the size bands in §1 come from the repo's earlier evaluation-only use of these sets | – |
| HCCB, STSCB (classroom behaviour papers), AVA, Kinetics, Charades, NTU RGB+D | no licence found / not checked [unverified] | **No** until a commercial-use licence is shown | – |

**Proposed fixed sets (protocol and sha256 committed before any run; files in `~/LENSIQ-field/evals/exam-hall-noface/`;
held-out printed only with an explicit flag after the pick; images deleted after the run, manifest and credits kept).**

| Set | Content | Split | Source label |
|---|---|---|---|
| S1 seated people | ≤ 400 Open Images V7 images, per-image CC BY 2.0, indoor rows of seated people (classroom, lecture, meeting, audience), excluding images used in the two earlier exam sets | SHA-256("lensiq-hallnoface:" + ImageID): first hex 0–7 dev, 8–f held-out | public dataset |
| S2 phones | ≤ 300 images with a `Mobile phone` box plus ≤ 100 indoor images with none | same rule | public dataset |
| S3 rule logic | scripted box sequences through the existing `?fakedet` seam and `tests/unit/exam.test.js` (leave, return, stand, walk, two in a zone, occluded frames, camera shift) | fixed list | synthetic |
| S4 public video | only if screening finds ≥ 8 clips, each ≥ 2 min, fixed camera, ≥ 4 seated people; seat polygons frozen in a JSON; events labelled by **two people** (not an AI reviewer: the lesson of `CROWD-ACCURACY.md`) | by clip, hash of the file title | public dataset |

**Metrics.**

- S1 / S2 (per frame): recall by size band in model px (persons: < 24, 24–48, 48–96, ≥ 96 tall; phones: < 16, 16–32,
  32–64, ≥ 64 long), for COCO-SSD as shipped and YOLOX-Nano with 1, 2, 7 and 13 passes; false boxes per frame on
  no-person and no-phone images; milliseconds per frame at 1× and 4× throttle. Wilson 95 % on every proportion.
- S3 / S4 and the room (per event): **event recall** = events found ÷ events that happened (same seat, start within
  ± 10 s after the signal's own hold time), Wilson 95 %; **precision** with Wilson; **false alarms per seat-hour** with
  an exact Poisson 95 % interval; error of "time away" in seconds. Reported per row distance, occlusion, light.
- Sample sizes [calc]: about **60 events per signal** are needed for "90 % observed, lower bound 80 %". Zero false
  alarms in T seat-hours only proves fewer than 3 ÷ T per seat-hour: 10 public clips × 3 min × 8 seats = **4
  seat-hours** proves "fewer than 0.75 per seat-hour", which for a 30-seat, 3-hour exam still allows 67 false alarms.
  One mock exam (90 seat-hours) proves "fewer than 3 per exam" if none occur. **Public footage cannot give the
  false-alarm figure.**

**Only measurable in a real room (owner's webcam; 1080p is enough for seat signals, 4K only for the phone-crop test):**
occlusion by rows at each camera height and for layout B; seated-person box size per row (upright and writing);
event recall for scripted leave / return / stand / walk / two-at-a-seat with adult volunteers; phone on desk and in
hand per row; jackets and bags on chairs; backlight and dim light; frames per second on the real mid-range laptop with
1 and 2 cameras; what happens when the tripod is nudged. Numbers only; no video kept (`docs/FIELD-PILOT.md`).

## 4. Rules and risks

**Rules that stay (all already in `docs/EXAM.md` and the tests).** No emotion, expression or "suspicion" scoring. A
signal is a factual event for a person to look at ("seat 14 empty for 3 min"), never a cheating verdict. Every action
needs a named invigilator. Exports stay in time order, never ranked. Poor view = "fix setup", not an alert.

| Risk | Why it matters | Mitigation (proposal, not built) |
|---|---|---|
| False "empty" from occlusion or a missed person | the most likely error; errors repeat frame after frame, so the 3-of-4 gate does not remove them | measure per row; a setup check that shows each seat's box size and refuses rows below the target; mark far rows "not watched" instead of guessing |
| Fairness | toilet and medical breaks, candidates who must stand or stretch, wheelchair users (box shape, no "standing" rise), small children (smaller boxes, more misses), left-handed or large candidates (`lean`), invigilator helping a candidate (`extra`) | accommodations already exist (`breaks`, `ticX`); keep `empty` at Info; owner to decide whether `lean` drops to "never alone" in this mode; report numbers per group in the pilot |
| Invigilators walking | `aisle` and `extra` fire on staff | exclusion zone + walk mode; `aisle` as Info |
| Seat-zone drift (camera bumped) | every seat silently maps to the wrong desk; today's room-event suppression would hide the first 20 s | "many seats changed and stayed changed for 60 s = check the camera" setup event; fixed mount; tape marks |
| Phone signal over-trusted | level Check from a detector that cannot see a phone beyond row 1–2 [calc] | label "front rows only, experimental" or off by default in this mode (owner decision; nothing removed) |
| PDPA | live video of candidates is personal data even when nothing is stored, and "seat 14" links to a named person through the seating plan. No face geometry is processed, so no biometric data. Schools mean minors: consent or another legal basis, and who signs, is for counsel [unverified] | on-device only, nothing stored by default (evidence clip stays opt-in), door notice + candidate notice, a no-camera seat for objectors; add a note to `docs/PDPA-NOTES-FOR-COUNSEL.md`; lawyer review before sale |
| EU AI Act | exam monitoring is high-risk with or without faces (`docs/EXAM.md`) | human oversight, event log, on-site tally: already designed |
| Performance | 2 passes = 2.8 / s, 7 passes = 0.8 / s on the emulated slower device [repo]; two cameras on one laptop halve that [calc]; a hidden browser tab is throttled; one page runs one camera today | choose the plan per device at setup and show the refresh time; `empty` (20 s) tolerates 1 / s, the frame-count gates need re-tuning below 2 / s |
| Model licences | only already-vendored models: YOLOX-Nano and COCO-SSD, both Apache-2.0 [repo] | no new model, no Ultralytics, no AGPL / GPL / non-commercial data |
| Limited value | an invigilator in the room already sees an empty seat | sell the time log, the multi-room dashboard and the committee report, not "detection" |

## 5. Effort, owner inputs, recommendation

| Phase | Work | Effort | Owner provides |
|---|---|---|---|
| 0 | Protocol, pick rule, targets, locked set definitions committed before any run | S | approval of targets |
| 1 | Measure S1–S3 (COCO-SSD vs YOLOX-Nano, tile plans, phone by size); independent reviewer re-measures | M | – |
| 2 | Screen public video; if ≥ 8 usable clips, two-person labels and S4 | S–M | a second human labeller |
| 3 | Room test: layouts A and B, two heights, scripted events | S (1 day on site) | room, webcam, mount ≥ 2.6 m, real mid-range laptop, 6–10 adult volunteers with consent forms |
| 4 | Build after approval: hall on YOLOX-Nano with a tile plan, standing signal, invigilator zone, camera-moved check, 1080p request, per-seat setup check, TH / EN / ZH, tests | M | decisions below |
| 5 | Mock exam, 30 seats × 3 h, invigilator tally; lawyer review of the notice | M–L | school or training room, invigilators, counsel |
| later | Several cameras on one device; live relay to a dashboard on another device (endpoint does not exist) | L | – |

**Decisions needed from the owner.** (1) May Mode A's status be judged on measured seat signals, separately from the
face count (today the "experimental" label is tied to small faces)? (2) Phone signal in hall mode: relabel "front rows
only" or off by default? (3) Targets for phase 0, for example event recall lower bound ≥ 80 % and ≤ 3 false alarms per
30-seat exam. (4) First customers: adults (university, training, licensing) before schools with minors?

**Recommendation.** Yes: a no-face "seat watch" is the better first hall product than the face-based one. It is mostly
built, uses only vendored Apache-2.0 detectors, works with ordinary 1080p cameras, keeps working while candidates look
down, and processes no face data. It does **not** bring the camera count to one per room, it should not claim phone
detection, and it has no measured number yet. Proceed with phases 0–3 (measure first), keep the face count as the
experimental add-on it is, and keep the 10 × 15 m hall out of the first offer.

**The honest claim today:** "Seat watch for exam rooms (experimental): shows the invigilator which seat became empty,
for how long, and when someone is in the aisle or a second person is at a seat. It does not look at faces, identify
anyone or judge behaviour; a person checks every event. Accuracy in exam rooms: not measured yet. Plan 2–4 cameras per
classroom (calculation, not yet tested in a room). Phones are not reliably seen at room distance."

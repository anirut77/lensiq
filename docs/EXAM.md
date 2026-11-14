# LENSIQ Exam — design, signals, thresholds, legal guardrails

LENSIQ Exam **assists invigilators**: it tells a person which seat to go and look at. It never decides misconduct. Every
flag is an observation ("a phone may be in view"), never a verdict ("cheating detected").

| Page | Role |
|---|---|
| `exam.html` (+ `exam-landing.js`) | Product landing: mode chooser, honest positioning, the "never" list, what a web page cannot see, signal table, fairness, PDPA / EU AI Act notes, draft pricing, printable notice + consent template (`#notice`) |
| `exam-lab.html` (+ `exam-lab.js`) | **Mode B** candidate page (computer lab / webcam): notice + consent → camera & light check → calibration → fullscreen exam; own event log |
| `exam-hall.html` (+ `exam-hall.js`) | **Mode A** camera node (laptop / phone, 2–5 fps): seat polygon editor per camera view, grid generator, walk mode, room mute |
| `exam-dashboard.html` (+ `exam-dashboard.js`) | Room dashboard for both modes: seat map, alert queue, actions, accommodations, summary, on-site tally, CSV, printable report |
| `lensiq-exam.js` (`LQExam`) | Pure logic, Node-testable, no DOM / network / images (`tests/unit/exam.test.js`) |
| `lensiq-exam-face.js` (`LQExamFace`) | Face engine of the lab page (2026-11-10): MediaPipe Face Landmarker (Apache-2.0) by default; face-api.js only in the research demo with `?faceengine=faceapi`. Face presence, count and head pose only (`tests/unit/exam-face.test.js`, results `docs/exam/FACE-ENGINE-RESULTS.md`) |
| `exam-link.js` (`LQExamLink`) | Transport: BroadcastChannel, optional relay, file export / import — every message through `LQExam.cleanMsg()` |
| `exam-ui.js` (`LQExamUI`) | Shared page helpers (translation, labels, plain-language reasons, downloads, storage) |
| `lensiq-exam-clip.js` (`LQExamClip`) | Evidence clip (opt-in): config, 10 s ring buffer (MediaRecorder, video only), pending slots, encrypted store (LQVault + IndexedDB). Node-testable parts in `tests/unit/exam-clip.test.js` |
| `exam-clip-ui.js` (`LQExamClipUI`) | Evidence-clip controller for the two camera pages: arm / disarm, flag → pending / auto-keep, "keep" from the dashboard, kept-clip list (play, save file, delete, delete all) |
| `exam.css` | Styles for the four pages (level colours always paired with a text label) |
| `i18n/en-exam.js`, `i18n/zh-exam.js` | English / Chinese for all four pages and the run-time text (Thai is in the markup and scripts) |

## Why it does not decide

Proctorio caught 0 of 6 instructed cheaters in a University of Twente randomised trial; ProctorU dropped AI-only
decisions; most complaints are false flags (dark skin in low light, disability, tics, reading aloud); a US court held a
mandatory home room scan unconstitutional (*Ogletree v. Cleveland State*, 2022). So:

- **Never**: automatic fail or termination, flag limits, a "cheating score" shown to candidates, ranking by suspicion in
  exports (CSV / report are always in time order), emotion or expression analysis, face recognition / matching, hidden
  recording, mandatory room scans, audio keyword spotting.
- Every action on the dashboard requires the **invigilator's name**; Note / Escalate require a note. The committee report
  states that a flag is not evidence of misconduct.
- Candidates see a **gentle prompt first** (no face 5 s, fullscreen exit, phone, second screen …), a permanent
  "monitoring active" indicator, and their **own event log** with the same entries the invigilator sees (no level, no score).
- Poor detection is **"fix setup"**, not an alert: with a bad lighting verdict the no-face / head-turn / mouth signals are not
  evaluated at all, and a `setup` event (not counted in risk) asks for better light or camera position.

## Signals (defaults in `LQExam.DEFAULTS`)

Each signal is debounced (`createGate`: k of the last n samples), must persist for a set time, and has a cooldown per
seat + signal (default 90 s; held re-fires are counted, not shown). Contributions add to a **decaying risk** per seat
(`createRisk`, half-life 3 min): info 0.3, watch 1, check 2.5 points × signal weight; level = info ≥ 0.15, watch ≥ 1,
check ≥ 2.5. Low-weight signals marked `alone: false` (gaze, head toward neighbour) only count while the seat has another
contribution in the last 2 minutes — they can never raise a flag by themselves.

### Mode B (candidate page)

| Signal | Default rule | Level |
|---|---|---|
| no face | 2 of 3 frames without a face; prompt at 5 s, Watch 10 s, Check 30 s | prompt → watch → check |
| more than one person (`multiface`) | ≥ 2 faces, **or** ≥ 1 face and ≥ 2 person boxes from COCO-SSD (score ≥ 0.5, read on every 3rd frame from the inference already run for phones and books, used for at most 2 s), in 3 of 5 frames for ≥ 3 s. The person count is never used without a face, so it cannot replace "no face" (`docs/exam/FACE-ENGINE-RESULTS.md` §7.2: held-out 28.8 % = 15 / 52 of frames with a second person, 0 / 17 false alarms, public dataset). **An aid, not complete detection**: the pages, one-pagers and pilot kit say so with this number (owner decision 2026-11-10) | check |
| head turn | \|yaw − yaw₀\| > 35° or pitch-down > 25° vs the calibrated baseline, 3 of 5 frames for ≥ 8 s = Info; ≥ 3 episodes in 5 min = Watch | info / watch |
| phone | COCO-SSD "cell phone" score ≥ 0.6 in 3 of 5 detector frames | check |
| book / laptop / other screen | score ≥ 0.5 in 3 of 5 detector frames, unless allowed for this exam | watch |
| mouth movement | MAR standard deviation > 0.06 over 3 s, for 5 s (no audio) | info |
| gaze | **not measured** (the mesh has iris points, but their gaze accuracy is unmeasured); hook only, low weight, never alone, off by default | info |
| frozen feed | 32×18 luma thumbnails identical (mean abs diff < 0.6) for 4 s | watch |
| virtual camera | label matches OBS / ManyCam / Snap / XSplit / DroidCam / "virtual" … | watch |
| away | blur → focus: Info with duration · `visibilitychange` hidden ≥ 5 s = Watch | info / watch |
| fullscreen exit | Watch + "return to fullscreen" button, 30 s cooldown | watch |
| copy / cut / right-click / print / PrintScreen | logged, 10 s cooldown | info |
| paste | > 50 characters = Watch, otherwise Info | info / watch |
| second screen | `screen.isExtended` (+ `change` event) | watch |
| device change / offline / online / reload | logged (reload = session marker + navigation type "reload") | info |
| setup | lighting verdict not ok for 3 of 5 checks over 5 s (dark / bright / backlight / flat / blur) | setup (not an alert) |

Face engine (since 2026-11-10, owner decision; `lensiq-exam-face.js`): **MediaPipe Face Landmarker** (Apache-2.0,
`vendor/models/face-landmarker/face_landmarker_lm.task`, the facial-movement score model removed from the bundle), CPU
delegate, every frame detected afresh, up to 4 faces, detection confidence 0.5. Exam needs no face recognition and none
is loaded. Head pose: the MediaPipe mesh points that stand in for the 68-point indices (jaw 234 / 454, nose tip 1, outer
eye corners 33 / 263, chin 152, inner lips) go through the same `poseFrom68`: yaw = asin(nose offset between the jaw
contour points ÷ 0.9) in approximate degrees; pitch is a proxy (nose position between the eye line and the chin)
converted with 120°/unit and always compared with the candidate's **own 2-minute calibration** (`calibrate`: median of
single-face frames; < 60% single-face frames = calibration fails and head turn is switched off — honest, the exam can
still start). This "mesh68" pose was picked over the transformation-matrix pose by the fixed rule of
`docs/exam/FACE-ENGINE-RESULTS.md` §1.7. If the detector fails to load or run (decided by the actual failure, never by a WebGL probe; seen on a Mac Chrome with
WebGL disabled and with WebAssembly removed), the page switches the face signals off, tells the candidate, and sends one
`setup` event (`code: "faceoff"`); it never reads as "no face".
The earlier face-api.js engine (TinyFaceDetector + 68 landmarks, MIT code, training data undocumented — LICENSES F5) is
kept in the repo behind the research-demo switch (`LENSIQ_RESEARCH.on` **and** `?faceengine=faceapi`); a customer
build never loads `vendor/face-api.js` on any Exam page (the lab and hall pages load TF.js on its own for COCO-SSD).

### Mode A (camera node)

Persons and phones from COCO-SSD (Apache-2.0, `vendor/models/cocossd`) on the full frame (optional 2×2 tiles for big
rooms) at 2–5 fps. A person belongs to the seat polygon that contains the box centre (overlap → nearest centroid).

Detector switch (2026-11-11, `docs/exam/HALL-DETECTOR-RESULTS.md`): YOLOX-Nano (Apache-2.0, already vendored) was
measured against COCO-SSD on a locked public still-image set (Open Images V7, 323 images; not exam-room footage). It found
more seated people at hall size (57.9 % vs 34.4 %) but failed the fixed switch rule: 3 / 94 empty-room frames with a false
person (COCO-SSD 0 / 94), phone recall 25.0 % vs 70.0 %, 612 vs 315 ms per frame on an emulated mid-range laptop.
**COCO-SSD stays the default**; YOLOX-Nano is an experimental choice in the setup form (`?yolox`), off by default, with
COCO-SSD as the fallback when ONNX Runtime cannot run.

| Signal | Default rule | Level |
|---|---|---|
| empty / back | seat seen occupied, then empty 3 of 4 frames for 20 s = Info; return logs the time away | info |
| early leave | empty ≥ 3 min before the minimum time (default 30 min after start) | watch |
| extra person | ≥ 2 people in a seat zone: 5 s = Watch, 15 s = Check (off in walk mode) | watch / check |
| aisle | a person outside every seat ≥ 8 s (off in walk mode; walk mode auto-off after 5 min) | watch |
| lean | > 25% of a seated person's box inside a **same-row** neighbour's polygon for ≥ 4 s (rows in front / behind overlap through perspective and are ignored) | watch |
| phone | phone box centre in a seat, score ≥ 0.5, 3 of 5 frames | check |
| head toward neighbour | v2 (front cameras only, low weight, never alone) | info |
| room event | ≥ max(3, 40% of seats) change occupancy / lean within 3 s → per-seat alerts suppressed 20 s (phones are never suppressed); manual "room event" mute 60 s on node or dashboard | info |

**Mode A is experimental (owner decision 2026-11-10)** until small faces in the wide view are detected: the page, the
landing page, the category page, the catalogue, the one-pager and the sales packages say so in TH / EN / ZH. Measured on
group photographs (public dataset, not hall footage; `docs/exam/FACE-ENGINE-RESULTS.md` §7.1): faces 24 – 48 px wide found
0 / 195 by the current engine; the best option measured (BlazeFace full-range on 3 × 3 tiles) found 62.6 % but with 0.40
false boxes per frame at 2.2 fps on an emulated mid-range laptop, so it is not switched on and no page loads that model.
The optional "count faces (experimental)" setting (off by default, per device) runs the option the fixed rule picked —
the lab engine on the whole frame, 8 faces, boxes only — and only draws and counts on that device: no event, nothing
sent. Seat signals below do not use faces and are unchanged.

### Hall camera placement guide (2026-11-10): how to get every candidate's face ≥ 48 px wide

> **Every number in this section is a calculation, not a measurement.** It is geometry and published interface limits,
> written so the owner can test it with a 4K USB webcam in a real room. Nothing here has been run on hall footage, and
> nothing here changes the "experimental" status of Mode A. The hall setup check (a page tool that measures the face
> width in px in the live view) **is built** as a separate commit: see "Hall setup check" after this guide. The guide
> itself stays a document.

**สรุปภาษาไทย (ทุกตัวเลขเป็นการคำนวณ ยังไม่ได้วัด).**

- สูตร: ความกว้างใบหน้าในภาพ (px) ≈ 0.15 ม. × ความละเอียดแนวนอน ÷ (2 × ระยะ × tan(มุมรับภาพแนวนอน ÷ 2))
  จะได้ 48 px ต้องมี 320 px ต่อเมตร ดังนั้นที่แถวไกลสุด ภาพต้องกว้างไม่เกิน **4 ม. (1,280 px) · 6 ม. (1080p) · 12 ม. (4K)**
- ระยะไกลสุดที่ใบหน้ายังกว้าง 48 px: กล้อง 1080p ได้ 3.0–4.7 ม. กล้อง 4K ได้ 6.0–9.4 ม. (มุมรับภาพแนวนอน 90°–65°)
  หน้าเครื่องกล้องขอภาพขนาดสูงสุดที่กล้องมี (3,840 × 2,160 แล้ว 1,920 × 1,080 แล้ว 1,280 × 720) และแสดงขนาดที่ได้จริงในแผง
  “ตรวจการติดตั้งกล้อง” ถ้าได้เพียง 1,280 × 720 จะได้ระยะ 2.0–3.1 ม.
- มุมที่ผู้ผลิตเว็บแคมบอกมักเป็น **มุมทแยง** ต้องแปลงเป็นมุมแนวนอนก่อน (ทแยง 78° ≈ แนวนอน 70° · ทแยง 90° ≈ แนวนอน 82°)
- จำนวนกล้องโดยประมาณ (แถวห่างกัน 1.2 ม. แถวแรกห่างกล้อง 2 ม.): ห้อง 6 × 8 ม. ใช้ 1080p 4–10 ตัว หรือ 4K 2–4 ตัว ·
  ห้อง 8 × 10 ม. ใช้ 1080p 6–12 ตัว หรือ 4K 3–6 ตัว · ห้อง 10 × 15 ม. ใช้ 1080p 16–33 ตัว หรือ 4K 8–9 ตัว
  วันนี้หนึ่งเครื่อง (แล็ปท็อป) ดูได้หนึ่งมุมกล้อง จำนวนกล้องจึงเท่ากับจำนวนเครื่อง
- ความสูง: ให้เห็นใบหน้าข้ามศีรษะแถวหน้า กล้องต้องสูงประมาณ 1.05 ม. + 0.25 × ระยะแถวไกลสุด ÷ ระยะห่างแถว เช่น แถวไกลสุด 7.4 ม.
  ต้องสูงราว 2.6 ม. แต่ยิ่งสูง แถวหน้ายิ่งเห็นเป็นมุมก้ม และผู้สอบที่ก้มหน้าเขียนจะยิ่งไม่เห็นใบหน้า
- **48 px เป็นเงื่อนไขจำเป็น แต่ยังไม่พอ:** ในการวัดภาพมุมกว้าง ตัวตรวจปัจจุบันหาใบหน้าที่กว้างเกิน 64 px ได้เพียง 10.5 %
  เมื่อดูทั้งภาพ จึงต้องตัดภาพเป็นส่วนย่อย (ภาพ 4K ราว 48 ส่วน) ซึ่งคำนวณแล้วใช้เวลาราว 1–3 วินาทีต่อรอบ ไม่ใช่ 2–5 ภาพต่อวินาที
- สาย USB: USB 2.0 ยาวได้ 5 ม. USB 3 ราว 3 ม. เกินกว่านั้นต้องใช้สายแบบมีวงจรขยายสัญญาณ แล็ปท็อปหลายรุ่นและกล้องในตัวให้ภาพได้ไม่เกิน 1080p
- เจ้าของจะทดสอบด้วยเว็บแคม 4K ในห้องจริง รายการที่ควรจดอยู่ท้ายข้อนี้

**1. The calculation.** For a rectilinear lens, a face of real width *w* at distance *d* (measured along the camera's
optical axis) is

    face width (px) ≈ w × R / (2 × d × tan(HFOV / 2))        w ≈ 0.15 m, R = horizontal resolution in px

because the view is 2 × d × tan(HFOV / 2) metres wide at that distance and R pixels cover it. 48 px for 0.15 m is
**320 px per metre**, so the rule can be read two ways:

- the view may be at most **R / 320 metres wide at the farthest row**: 4.0 m at 1,280 px, **6.0 m at 1,920 px (1080p)**,
  **12.0 m at 3,840 px (4K)**;
- the farthest face may be at most **d_max = 0.15 × R / (96 × tan(HFOV / 2))** from the camera.

| Maximum distance for a 48 px face (calculated) | HFOV 65° | HFOV 78° | HFOV 90° |
|---|---|---|---|
| 1,280 × 720 (the lowest size `exam-hall.js` asks for; what a 720p camera gives) | 3.14 m | 2.47 m | 2.00 m |
| 1,920 × 1,080 (1080p) | 4.71 m | 3.70 m | 3.00 m |
| 3,840 × 2,160 (4K) | 9.42 m | 7.41 m | 6.00 m |
| for comparison, 64 px: 1080p / 4K | 3.53 m / 7.06 m | 2.78 m / 5.56 m | 2.25 m / 4.50 m |

Assumptions and what they hide (all unmeasured):

- 0.15 m is a typical adult face width (cheek to cheek). A smaller face or a head turned 30° is about 13 % narrower
  (cos 30°); allow a margin, for example plan for 56 px instead of 48 px (distances × 0.86).
- **HFOV is not the number on the box.** Webcam makers usually quote the *diagonal* field of view. For a 16 : 9
  sensor, tan(HFOV / 2) = 0.872 × tan(DFOV / 2): diagonal 65° → horizontal 58°, diagonal 78° → 70°, diagonal 90° → 82°,
  diagonal 120° → 113°. Use the horizontal value in the formula, or measure it: at 2 m from a wall, the visible width
  is 2 × 2 × tan(HFOV / 2).
- Wide lenses are not rectilinear at the edges (barrel distortion) and are softer there; digital zoom, "auto framing"
  and HDR modes crop or rescale the sensor and change the effective HFOV. Switch them off.
- The distance is along the optical axis (depth), not the slant range. A face at the side of the view at the same
  depth has the same pixel width but is seen at an angle.
- 48 px is the pixel width in the frame **the page actually receives**. If the browser delivers 1,280 × 720 from a 4K
  camera (see 4 below), the first row of the table applies.

**2. Cameras per room: rows-of-desks reasoning.** Assumptions for the table: the camera is at the front, facing the
candidates; the first row is 2.0 m from it; rows are 1.2 m apart; the last row is at most 1 m from the back wall; the
desk block is the room width minus 1 m. Then:

- rows one camera position can serve in depth = floor((d_max − 2.0) / 1.2) + 1;
- "banks" of cameras in depth = ceil(rows / rows per bank). A second bank cannot stand at the front: it has to hang
  from the ceiling above an earlier row (or stand in an aisle), 2 m in front of its own first row, facing the back;
- cameras side by side in each bank = ceil(desk-block width / (2 × 2.0 × tan(HFOV / 2))), because the first row, 2 m
  away, is the narrowest part of the view (2.55 m at 65°, 3.24 m at 78°, 4.00 m at 90°).

| Rows per bank (calculated) | HFOV 65° | HFOV 78° | HFOV 90° |
|---|---|---|---|
| 1,280 × 720 | 1 | 1 | 1 |
| 1080p | 3 | 2 | 1 |
| 4K | 7 | 5 | 4 |

| Cameras (banks × side by side), calculated | 6 × 8 m (5 rows, block 5 m) | 8 × 10 m (6 rows, block 7 m) | 10 × 15 m (11 rows, block 9 m) |
|---|---|---|---|
| 1080p, HFOV 65° | 2 × 2 = **4** | 2 × 3 = **6** | 4 × 4 = **16** |
| 1080p, HFOV 78° | 3 × 2 = **6** | 3 × 3 = **9** | 6 × 3 = **18** |
| 1080p, HFOV 90° | 5 × 2 = **10** | 6 × 2 = **12** | 11 × 3 = **33** |
| 4K, HFOV 65° | 1 × 2 = **2** | 1 × 3 = **3** | 2 × 4 = **8** |
| 4K, HFOV 78° | 1 × 2 = **2** | 2 × 3 = **6** | 3 × 3 = **9** |
| 4K, HFOV 90° | 2 × 2 = **4** | 2 × 2 = **4** | 3 × 3 = **9** |
| 1,280 × 720 (today's request), HFOV 65° – 78° | 5 × 2 = 10 | 6 × 3 = 18 | 11 × 3 – 4 = 33 – 44 |

Reading the table:

- The table counts no overlap between neighbouring views; a face cut by the edge of a view is not found, so add
  overlap (or one camera) where a seat sits on a boundary.
- A narrower lens sees further but needs more cameras side by side for the first row; a wider lens the reverse. Moving
  the first row back from 2 m to 3 m widens the near view by half and can save a camera across at the cost of depth.
- **One device runs one camera view today** (`exam-hall.html`), so "cameras" here also means laptops, and each has its
  own dashboard tab (`docs/pilot/PILOT-EXAM.md`). Six to nine cameras in a medium room is a different product from the
  "1 – 3 devices per room" the page and the price list described until 2026-11-10. Owner decision 2026-11-10: pages,
  one-pagers, price lists and the pilot kit now say "the number of cameras depends on room size (see guide)"; hall
  pricing stays "experimental, not on sale" until the owner has tested in a real room.
- A 10 × 15 m hall is not practical with USB webcams at 48 px: the banks in the middle of the room need ceiling
  mounts and long active cables (see 4).

**3. Mounting height and tilt.** Two effects pull in opposite directions.

- *Occlusion by the row in front.* To see the chin of a candidate at distance d over the head of the candidate one
  row (pitch p) in front, the camera height H has to satisfy **H ≥ c + (t − c) × d / p**, with t ≈ 1.30 m (top of a
  seated head) and c ≈ 1.05 m (chin of a seated person leaning slightly forward). With p = 1.2 m: d = 3.7 m → 1.82 m,
  4.7 m → 2.03 m, 6.0 m → 2.30 m, 7.4 m → 2.59 m, 9.4 m → 3.01 m. With p = 1.0 m: 1.98 m, 2.23 m, 2.55 m, 2.90 m,
  3.40 m. So a 4K camera used to its full depth has to sit close to the ceiling of an ordinary room (2.6 – 3.0 m), and
  at 9.4 m it may not be possible. Staggered seats, or a camera placed on the line of an aisle so that it looks between
  heads, lower this height; neither is calculated here.
- *Looking down on the near rows.* A face 1.2 m above the floor at distance d is seen from H at a downward angle of
  atan((H − 1.2) / d): for H = 2.6 m that is 35° at 2 m, 25° at 3 m, 17° at 4.7 m, 11° at 7.4 m. A candidate writing
  has the head pitched down by roughly 30 – 45° already, and the two angles add: the first rows are seen from about
  60 – 80° off the face's front, where a frontal face detector is not expected to find a face at all (the lab page
  itself treats pitch-down beyond 25° as "head turned"). **In writing posture most faces will not be visible to a high
  front camera; faces are seen when candidates look up.** How often that is, is unmeasured and is the first thing the
  room test should record.
- Tilt: aim the optical axis at the faces of the middle row of the bank, tilt = atan((H − 1.2) / d_middle) below the
  horizontal (for H = 2.6 m and rows from 2.0 m to 6.8 m: about 18°). Check that the vertical field of view holds the
  first and the last row: the first row is at 35° and the last at 12° below the horizontal, a spread of 23°, inside the
  vertical FOV of a 16 : 9 camera (39° at HFOV 65°, 49° at 78°, 59° at 90°). Keep the camera level (no roll).
- Light: windows behind the candidates (backlight) cost more than a few pixels; the page's light check applies.

**4. USB, cables and what the browser will actually deliver.**

- *Bandwidth.* Uncompressed 1080p at 30 fps (YUY2, 16 bits per pixel) is about 995 Mbit/s and 4K at 30 fps (NV12,
  12 bits per pixel) about 2,986 Mbit/s; USB 2.0 carries 480 Mbit/s in total. So over USB 2.0 a webcam sends 1080p and
  4K as MJPEG (or H.264), and 4K without compression needs a USB 3.x port, cable and hub end to end (5 Gbit/s). A 4K
  webcam on a USB 2.0 port or through a USB 2.0 extension typically falls back to 1080p or to a low frame rate.
  Several webcams on one USB controller share its bandwidth and often fail to start together; one camera per laptop
  (today's design) avoids this.
- *Cable length.* Passive USB 2.0: 5 m. Passive USB 3.x: about 3 m in practice. Beyond that: active (repeater)
  extension cables or powered hubs, each a possible point of failure and voltage drop, or active optical USB cables.
  A ceiling camera 7 – 10 m of cable away from the laptop is in this range. Test the exact cable with the exact camera.
- *Browser.* The page asks with `getUserMedia({ video: { width: { ideal: W }, height: { ideal: H }, frameRate: { ideal: F } } })`.
  "ideal" is a wish: the browser picks the closest mode the camera and the operating system offer and does not fail
  when it is lower. The only proof of what arrived is `track.getSettings()` (and `video.videoWidth`);
  `track.getCapabilities()` lists the maximum where the browser supports it. Using `{ exact: 3840 }` fails with
  `OverconstrainedError` instead of silently giving less, which is what a setup check wants.
  `exam-hall.js` asks for **3,840 × 2,160, then 1,920 × 1,080, then 1,280 × 720** (a ladder of `ideal` sizes in
  `LQCam.fallbackChain`; a lower size is tried only when the camera cannot start at the higher one) and the setup
  check shows the size that arrived. Until the setup-check commit it asked for 1,280 × 720.
- *Devices that cap the resolution.* Built-in laptop cameras are 720p or 1080p. A 4K webcam may offer 4K only as
  MJPEG at 30 fps, only on USB 3, or only through the maker's driver; some operating-system camera stacks and some
  browsers expose at most 1080p for a given device. Phones give what their browser exposes for the rear camera, which
  varies by model. None of this can be read from a specification sheet; open the page and read `getSettings()`.
- *Frame rate.* The hall loop needs 2 – 5 frames per second. Asking for a low `frameRate` saves decoding work, but
  many webcams offer 4K at one fixed rate; the browser then decodes every MJPEG frame (CPU) and the page drops most of
  them.

**5. The fps cost of processing 4K.** A 4K frame has 8.3 megapixels: 4 × 1080p and 9 × the 1,280 × 720 frame the page
uses now. The detectors do not get slower with a bigger frame, they get blinder: each one resizes its input to a small
fixed size, so a 48 px face in a 3,840 px frame is 1.25 % of the width and disappears. **48 px is necessary, not
sufficient.** Measured on wide 1,280 × 720 frames (`docs/exam/FACE-ENGINE-RESULTS.md` §7.1, public dataset, held-out):
the current engine on the whole frame found 0 / 37 faces 48 – 64 px wide and 4 / 38 = 10.5 % above 64 px. On the lab
set, where the frame is 640 × 480, a face at desk distance was found on 22 / 26 frames and faces 24 – 48 px wide on
0 / 12 (§2.3; that is where the 48 px figure comes from). So the frame has to
be cut into tiles in which a 48 px face is as large a share as in the lab frame (48 / 640 = 7.5 % of the width):

| Tiles of 640 × 480 px at native resolution, 20 % overlap (calculated) | Tiles | One sweep at 25 ms per tile | at 50 ms per tile |
|---|---|---|---|
| 1,280 × 720 | 3 × 2 = 6 | 0.15 s | 0.3 s |
| 1,920 × 1,080 | 4 × 3 = 12 | 0.3 s | 0.6 s |
| 3,840 × 2,160 | 8 × 6 = 48 | 1.2 s (0.8 sweeps per second) | 2.4 s (0.4 sweeps per second) |

- 25 – 50 ms per Face Landmarker pass is the range measured in §7.1 on an Apple M1 (16 – 31 ms unthrottled, 25 – 58 ms
  throttled 4× as an emulated mid-range laptop); the sweep times are that range multiplied by the tile count, not a
  measurement. Drawing each crop from a 4K video frame and decoding 4K MJPEG add time that is not in the table.
- COCO-SSD for persons and phones (388 – 442 ms per 1,280 × 720 frame in the same run) still has to run; on 4K it would
  need tiles as well for phones.
- Cheaper alternatives, uncalculated beyond their tile count: one crop per drawn seat (30 seats = 30 passes, about
  0.75 – 1.5 s per sweep), or a rotating schedule (a few tiles per frame) with the refresh time stated on the page. A
  face count that refreshes every 1 – 3 s may be enough for "is there a face at this seat"; it is not 2 – 5 fps.
- Whether tiling makes the current engine find 48 px faces in hall views is **not measured** (§7.1 measured tiles only
  with the face *detectors*, where false boxes rose with the number of tiles: 0.28 – 2.78 per frame on dev).

**6. What to write down in the room test (owner, 4K webcam).** Camera model, the DFOV on the box and the HFOV
measured at 2 m; USB port type and cable; what `track.getSettings()` reports (width, height, frame rate) in Chrome on
the laptop used (the setup check shows the frame size received); camera height and tilt; for each row: distance,
face width in px read from the setup check (upright and in writing posture; from a screenshot ruler where the page
finds no face), whether the row in front hides the face, and frames per second of the page. No image of a person
is kept: write the numbers down and delete the screenshots (`docs/FIELD-PILOT.md`).

### Hall setup check (2026-11-10): face width in px in the live view

A panel under the camera view of `exam-hall.html` ("ตรวจการติดตั้งกล้อง: ขนาดใบหน้า"), used **before monitoring** to
place a camera with the guide above. It is a measuring aid, not a pass certificate.

| Part | What it does |
|---|---|
| Camera size | The page asks for 3,840 × 2,160, then 1,920 × 1,080, then 1,280 × 720 and shows the size the browser delivered (`video.videoWidth` × `videoHeight`), also before the check is started. When the delivered width is under 3,840 a separate line says "received less than asked". A camera chosen by the invigilator is tried at all three sizes before any other camera may be opened (`LQCam.fallbackChain`); pages that ask for one size get the same four steps as before. |
| Measurement | About every 0.7 s (`LQExamFace.HALL_SETUP.everyMs`, about 1.4 per second) the check's own face engine (`createHallFaces({setup: true})`, boxes only, at most 16 faces = `HALL_SETUP.numFaces`) reads the **native** frame. `LQExamFace.hallSetupCheck` turns each box into a width in px: normalised box width × native frame width. The **raw** width is compared with 48 and the number shown is rounded **down**, so a 47.9 px face reads "47 px" and warns. |
| People count | The count comes from the seat monitor's object detector. It exists only after one finished detection turn on this camera, not older than 5 s (`HALL_SETUP.peopleMaxAgeMs`); a failing detector means "not counted yet", never 0 people. |
| Shown | A box per measured face with its width in px (green ≥ 48 px, red below), the number of faces measured, the **smallest** width, the list of widths, and the people seen by COCO-SSD (the count the seat monitor already makes). |
| States | `noface`: nothing measured (warning; with people seen: "N people seen, 0 faces measured"). `small`: any face under 48 px (clear warning with how many and the smallest). `nopeople`: the measured faces are ≥ 48 px but the people count does not exist yet (warning: "not a pass yet"). `cap`: the engine returned its maximum (16) and more people are seen: "measures at most 16 faces at a time — check the farthest rows with up to 16 people in view" (the limit is named; distance is not blamed). `people`: every measured face ≥ 48 px but more people than faces: "N people seen, M faces measured — the others may be too small or too far". `ok`: at least one face, all ≥ 48 px, a people count exists and people ≤ faces. `error`: the face engine cannot run on this device (said; seat monitoring goes on). |
| Never OK | With no face, with any face under 48 px, or with more people seen than faces measured. Also never before the people count exists. |

Limits, stated in the panel:

- **48 px is a minimum, not a guarantee** (section 5 of the guide). The current engine found 0 / 195 faces 24 – 48 px
  wide on wide frames (public dataset, `docs/exam/FACE-ENGINE-RESULTS.md` §7.1), so a small or distant face is usually
  **not found and has no number**. That is why the panel compares people with faces. The comparison is a count, not a
  match: one extra person and one missed face cancel out, and COCO-SSD also misses small or far people. Walk to the
  far row and check that the person sitting there has a box.
- **Face limit.** The setup check's engine returns at most 16 faces per measurement (`HALL_SETUP.numFaces`; the exam
  loop's experimental face pass keeps 8, `HALL_FACE.numFaces`). The panel lead text says so, and at the limit with more
  people seen the panel shows the `cap` message. Check a big room one group at a time. Timing on the development
  machine (Apple M1, headless Chrome, one synthetic 3,840 × 2,160 frame made of 2 – 32 tiled face crops from public
  CC-BY photos kept outside the repo, 25 calls per row, 2026-11-10): the time per call did **not** depend on the limit.
  With GPU WebGL (Metal) the median was 37 – 47 ms when 2 – 3 faces were found and 19 – 46 ms when none was, the same
  at 8, 16 and 32; with software WebGL 88 – 103 ms and 71 – 97 ms. The engine found **at most 3 faces in any of these
  frames** (2 of 2, 2 of 6, 3 of 8, 0 of 12 – 32), so the cost with 16 faces found is **not measured** and the higher
  limit showed **no benefit in this test**: on a wide view the engine stops finding faces long before 8. Script and
  logs: `~/LENSIQ-field/evals/exam-followups/facecap/` (sha256 `cap-metal.log` 92440e98…, `cap-sw.log` 6b0fa454…).
- **Seats and frame shape (residual risk).** Seat areas are stored normalised to the frame. A camera can deliver another
  shape at another size (for example 4:3 at 1,280 × 960 and 16:9 at 3,840 × 2,160), and the same numbers then land on
  another part of the room. From this version the page stores the frame's width / height with the saved seats (one
  number per room + camera, on this device) and shows a warning when the current frame differs by more than 2 %.
  Seats saved **before** this version have no stored shape, so no warning is possible for them: after this update,
  look at every saved seat layout once and redraw it if it does not match.
- What the check measures on hall footage, and how often the engine finds a 48 – 64 px face, is **not measured**.

Cost and privacy: the check runs only while monitoring is off (starting monitoring stops it and disables the button).
Boxes and numbers on this device only: no event, nothing stored, nothing sent, no identity, no expression output. The
exam loop keeps its old work size on a larger camera frame: COCO-SSD reads a ≤ 416 px copy, the 2 × 2 tiles option and
the experimental face pass a copy at most 1,280 px wide (made without smoothing; its effect on detection is not
measured), and the evidence clip records a copy at most 1,280 px wide (a clone of the camera track scaled by the
browser; where that is not possible, a canvas copy at about 15 fps), so a kept clip is not more detailed than before.
Where neither copy can be made (no track scaling and no `canvas.captureStream`), **no clip is recorded**: the page
says so in Thai / English / Chinese, the heartbeat reports clips as off, and the camera's full-size stream is never
given to the recorder. The canvas copy is painted on each camera frame with `requestVideoFrameCallback` where the
browser has it, otherwise on a 66 ms page timer. Browsers slow page timers down in a tab that is not in front, so
on the timer path a clip can have fewer frames if the tab is covered; `LQCam` pauses the camera while the tab is
hidden, so nothing is recorded then on either path. Keep the camera tab in front during the exam. **Not measured:**
the clip frame rate on a real device on either path.

Loop speed, measured on the development machine (headless Chrome, WASM backend, Chrome's fake camera, the fps setting
at 5, 20 s per run; before = 1,280 × 720 delivered, after = 3,840 × 2,160 delivered):

| Mode | Before (loops per second · detector ms, median) | After | Runs |
|---|---|---|---|
| whole frame | 4.95 · 67 – 69 | 4.95 – 4.97 · 69 – 71 | 2 + 4 |
| whole frame + evidence clip | 4.98 – 4.99 · 55 – 62 | 4.97 – 4.98 · 56 – 60 | 3 + 3 |
| 2 × 2 tiles | 3.71 · 237 | 3.70 · 231 | 1 + 2 |
| 2 × 2 tiles + evidence clip | 2.43 – 3.65 | 2.38 – 3.53 | 5 + 5, while other processes loaded the machine: **no conclusion** |

The setup check itself costs time while it is on (it is off during monitoring): with software WebGL in headless
Chrome the loop went from 2.0 to 1.6 loops per second while it ran (one run each, not representative of a real
device). **Not measured:** a real 4K webcam, a phone, a low-end laptop, and the setup check's cost on a real device.

Tests: `tests/unit/exam-face.test.js` (px from normalised boxes × native width, the 48 px threshold at 47.4 – 48.1 px, no
face, more people than faces, no people count, the face limit, never OK in those cases), `tests/unit/lensiq-camera.test.js`
(request order of the ladder, the chosen camera at every size first, one-size pages unchanged),
`tests/e2e/exam-hall-setup.e2e.mjs` (fake cameras of 4K / 1080p / 720p / 640 × 480 and one that cannot start at the
higher sizes, a chosen camera that cannot start at 4K, every state in Thai / English / Chinese, nothing stored or sent,
off while monitoring, clip source 1,280 px or no clip, the seat shape warning).

### Hall camera placement check (stream H, 2026-11-13): seats seen and person size against the detector's measured minimum

A second panel under the camera view ("ตรวจตำแหน่งกล้อง: ที่นั่งและขนาดคน" / "Camera placement check" / "摄像头位置检查"), used
**before monitoring**, after the seats are drawn and with someone in every seat. `LQExam.hallPlacement` (pure, numbers only)
reads the loop's own person boxes and the seat polygons:

- **seats seen**: seats whose polygon holds a person-box centre (`seatOf`, as the monitor does);
- **person size**: the tallest box of each seat, in px of the **1,280 x 720 frame** the hall detector was measured on
  (`h x frameH x min(1280 / W, 720 / H)`), so a 4K or 4:3 camera reads the same;
- **detector minimum** (`LQExam.HALL_PLACE.minPx`), a FIXED rule: the lower edge of the smallest size band in which the
  active detector found at least half of the people in `docs/exam/HALL-DETECTOR-RESULTS.md` §2 (source: **public dataset**,
  Open Images V7 still images, not exam rooms): COCO-SSD **288 px** (it found 46.2 % at 144–288 px, n = 247; 75.3 % at
  ≥ 288 px, n = 275), COCO-SSD with 2 x 2 tiles **144 px** (56.3 %), YOLOX-Nano **144 px** (65.2 %), YOLOX-Nano tiles 144 px;
- **hidden**: more than half of a seat's polygon covered by the people of seats in the rows in front (camera too low or
  too flat: raise it to ≥ 2.6 m and tilt down); **edge**: a seat polygon within 2 % of the frame edge (coverage).

Verdict: `noseats` → `nocount` (no fresh people count, never "good") → `fix` (a seat under the minimum, hidden or at the
edge; with COCO-SSD and no tiles it also says when the tiles option's 144 px minimum would cover those seats) → `partial`
(seats with nobody seen) → `good`. The panel always prints the measured recall at the smallest person's size with n and
"public dataset, not a real exam room", and "a pass is not a guarantee". It cannot measure camera height or angle
directly: "hidden" and "person size" are the proxies. Nothing is stored or sent; off during monitoring. Tests:
`tests/unit/exam-hall-placement.test.js`, `tests/e2e/exam-hall-placement.e2e.mjs` (locked before the code,
`evals-locks/gate-hall-h.sha256`). Not measured in a real room: the seat-watch pilot records the panel's result per block
(`docs/pilot/SEATWATCH-SCORING-TH.md`). "Export seat layout" (JSON, seat ids + polygons) is next to the seat list.

v2: pose landmarker (head down to lap, hand at ear, arm crossing seats), phone detection on cycled seat crops,
blurring the other seats in a kept hall clip (the evidence clip itself shipped in round 14 — see below).

## Evidence clip (round 14, opt-in per exam, default OFF)

| Step | What happens |
|---|---|
| Switch on | Institution only: `?clip=1` (`&clipauto=1` auto-keep, `&clipdays=1/7/14/30/90`, default 14) in the exam link, or the invigilator settings on the camera page (lab: the "settings for this subject" panel before consent; hall: the setup form while not monitoring). `LQExamClip.cleanCfg` — anything but a real `true` is OFF; auto-keep needs clips on. |
| Notice + consent | Lab: with clips on, notice line n2 ("no image recording") is replaced by n2c ("no continuous video, no audio"), a clip paragraph (n5c, or n5a for auto-keep, with the retention days) is added, and the consent checkbox text names the clip. The setting is **locked** once consent is given. Hall: a warning tells the invigilator the room notice must mention clips and that a clip may show other candidates. TH / EN / ZH. |
| While monitoring | The camera device keeps only the last ~10 s **in memory**: a new MediaRecorder segment every 2 s on a **video-only** copy of the camera stream (audio is never recorded), older segments dropped by time (not by count, so several quick flags still give a full clip). A kept clip is ~9.5–11.5 s (`pickSegs` never overshoots to 15 s).  With clips on, the lab and hall lead texts say "no continuous video" (`exam.lab.leadC`, `exam.hall.leadC`) instead of "no video".  Clips need an **invigilator PIN** on the device first (see Use): without it `arm()` records nothing and the lab consent step does not go ahead. Lab candidates see "· last 10 s kept in memory" on the permanent monitoring badge; the heartbeat carries `clip: true` so the dashboard shows "evidence clip on" for that device. Nothing at all is recorded when the browser cannot encrypt (no secure context / WebCrypto / IndexedDB) or has no MediaRecorder. |
| Flag | Only Watch / Check events of objective signals (`CLIP_SIGS`: face count, objects, head turn, frozen feed, browser / screen events, seat empty / extra / aisle / lean / early). The ring is copied into a **pending** slot (memory only, max 6, dropped after 10 min). Pending slots survive End exam, Stop monitoring and a camera reconnect (only the ring restarts), so an invigilator can still keep them within the 10 minutes; a page reload drops them (memory only, by design). The device sends `{type:"clip", id, st:"pending"}` — JSON, never video. |
| Keep | The invigilator taps **Keep clip** on that flag on the dashboard (needs the invigilator's name like every action; logged as `keepclip`, not counted as a response). The dashboard sends `{type:"keep", node, id}`; the camera device encrypts the clip and stores it. Hall nodes also have a Keep button next to the event. With auto-keep the clip is stored at once (`st:"auto"`). |
| At rest | IndexedDB `lq-exam-clips` / `clips`: metadata (time, seat, signal, how, kept, expiry) + one LQVault envelope (AES-GCM 256, non-extractable key per clip in IndexedDB `lensiq-vault`, the clip name as AAD). No plaintext fallback. Max 60 clips per device. |
| Delete | Automatic after N days: purged on load of every exam page that loads `lensiq-exam-clip.js` (`purgeDevice`, which never creates the database), every minute while a camera page is open, on every list refresh, and `load()` refuses (and deletes) an expired clip so it can never be played or saved, per clip or "delete all" on the device. Deleting removes the record **and its key** (a copied envelope can no longer be opened); the dashboard is told (`st:"del"`). LQVault `wipeAll` (admin "delete all biometric data") also makes clips unreadable. |
| Use | The kept-clip list is on the camera device only (lab: "Evidence clips on this device" below the event log; hall: under monitoring) and is **behind an invigilator PIN** (4–8 digits, `LQExamClip.createPin`: PBKDF2-SHA-256 salted hash in localStorage `lq-exam-clip-pin`, never the PIN; 5 wrong tries = 60 s wait; changing it needs the old PIN). Without the PIN anyone at the device (a candidate on a shared lab computer) sees only the number of clips — no list, play, save or delete. The list re-locks at consent, at exam start / end, when hall monitoring starts / stops, and after 5 minutes. The PIN is a UI gate, not the encryption (the clips are encrypted with LQVault either way); a forgotten PIN means clips stay locked until they auto-delete (or site data is cleared). Unlocked: play (decrypted locally into a `blob:` URL), save as file (a person's explicit action, e.g. for the committee), delete. The dashboard flag row and log row show the time and the clip status ("clip on the camera device · deleted automatically in N days"); CSV gets an extra "Evidence clip" column only when the room used clips. |
| Never | Uploaded, sent to the dashboard or relay, recorded with audio, recorded while clips are off, analysed by any model, used to score anyone. |

Also: changing the clip setting after the consent box was ticked clears the tick ("the notice has changed — read it
again"); `store.save` refuses unless LQVault really returned an encrypted envelope (even if some script set
`allowPlaintext`).

Deferred: blurring other seats in hall clips (needs a canvas re-encode per frame; would cut fps on phones), an in-app
"change PIN" button (the API supports it with the old PIN), and clips coming back to the dashboard over the relay
(deliberately not built: clips stay on the device). Note: someone with full control of the browser (devtools, clearing
site data) can still delete local data; the dashboard keeps its own "clip kept" log row either way.

## Accommodations (`cleanProfile` / `applyAccommodation`)

Set by the institution per seat on the dashboard; no diagnosis is ever stored or sent (unknown keys are dropped):
`gazeOff`, `noFaceX` 1–3 (no-face times ×), `readAloud` (mouth off), `breaks` (empty ×3, no-face never Check, early
leave = Info), `ticX` 1–2 (head-turn time ×, repeat count ×, angles +10° per step, mouth / lean time ×). Profiles are
broadcast to the nodes (`prof` message) and also filtered on the board.

## Dashboard

Seat map coloured by the decaying level (with the word), queue in triage order (Check, then Watch, oldest first; same
seat + signal is merged with a count), sparkline of the last 10 minutes, actions Going to check / No issue / Note /
Escalate, on-site tally ("flag was right / wrong" — means *what the system said was there*, not misconduct) → precision
per signal with a 95% Wilson interval, per-room summary (alerts by type, acknowledged, dismissed, escalated, median
response time, early leavers, setup problems, muted), CSV (UTF-8 BOM, formula cells quoted, time order) and a printable
report (browser "Save as PDF"). State is kept in `localStorage` (`lq-exam-board-<room>`, numbers and short text only).

## Transport and privacy

Messages (`cleanMsg`): `ev` {room, node, src, seat, sig, lvl, t, dur?, n?, what?, code?}, `hb` heartbeat {name, seats,
fps, q, pos, walk}, `prof` {profiles}, `mute` {ms}. Any unknown key rejects the whole message, so a frame or a name can
never ride along. Node ids are random per device. Same browser: BroadcastChannel `lq-exam:<room>`. Several devices
without a server: each node exports a JSON file, the dashboard imports it. **Relay** (optional, off): set
`window.LENSIQ_EXAM_RELAY` (https or localhost) and a pairing code; `exam-link.js` then POSTs to `/api/exam/push` and
polls `/api/exam/pull?room=&since=` — **the endpoint does not exist yet** (server.py or backend/ must add it with the
same allowlist, pairing-code auth, LAN-only / rate limits as `/api/agg`), and the page CSP `connect-src` must list the origin.

## What a web page cannot see (stated on the pages)

Other applications, chat windows, background processes, a second device or phone outside the frame, earpieces, smart
glasses, people outside the camera, virtual cameras that use a real camera's name. For high stakes use Safe Exam
Browser or Chrome kiosk mode together with invigilators.

## Legal guardrails (not legal advice — lawyer review needed)

- **PDPA**: notice before the exam (what is observed, purpose, retention, who sees it), consent checkbox, an alternative
  for candidates who decline (declining never opens the camera and does not cost the right to sit the exam), access
  and complaint route. Detection / head pose without identity is not biometric identification; adding face matching
  would need explicit consent under s.26 (not built).
- **EU AI Act**: exam behaviour monitoring is high-risk (Annex III 3(d)): human oversight (every decision by a named
  person), logging (incident log), accuracy evaluation (on-site tally). Emotion inference in education is prohibited
  (Art 5(1)(f)): there is none; `tests/unit/exam*.test.js` fail on emotion / verdict wording in signal labels and translations.

## Accuracy — not measured yet in exam rooms

All thresholds are research-based defaults. Before sale: pilot rooms with invigilator tallies per signal, a skin-tone
breakdown, and a lawyer's review of the notice. Models: MediaPipe Face Landmarker and COCO-SSD (both Apache-2.0).

**Face engine, measured 2026-11-10 on a fixed public + synthetic set** (`docs/exam/FACE-ENGINE-RESULTS.md`, source:
public dataset Open Images V7 and synthetic frames / renders; held-out half): one face at desk distance found 22 / 26
(both engines), no false face on 37 no-person frames, faces only 24 – 48 px wide never found (0 / 12, both engines),
low light (synthetic) 76.9 % new vs 61.5 % old, mask (synthetic) 65.4 % vs 53.8 %; about 4.5× faster per frame
(12.8–18.7 ms vs 57.5–85.9 ms on WASM, two runs). Head turn on renders 81.1 % new vs 84.4 % old (synthetic render; favours the new engine; not a claim until measured on real video (pilot)).
Not measured: skin tone, mouth movement, real exam rooms.

## Tests

`tests/unit/exam-face.test.js` (mesh → 68-point mapping, pose from mesh and matrix, the fake seam, engine choice: face-api.js
only with the research demo + `?faceengine=faceapi`, no face signal without a face engine, the vendored `.task` has no
facial-movement score model, sha256 of the vendored files, the Exam pages never load `vendor/face-api.js`),
`tests/unit/exam.test.js` (gates, risk, room suppression, accommodations, pose, calibration, lighting, frozen, lab and hall
monitors, geometry, message allowlist, board, CSV), `tests/unit/exam-clip.test.js` (clip config default OFF, objective
signals only, ring segments video-only, pending drop, encrypted store / crypto-shred / auto-delete / insecure = nothing
stored, clip + keep allowlist, named keep on the board, CSV column; **no emotion / expression / age-gender API in any exam
file** and every signal in an objective-event allowlist), `tests/e2e/exam-clip.e2e.mjs` (default OFF = no MediaRecorder,
consent text, pending → named keep → encrypted record → play / delete, hall auto-keep), `tests/e2e/exam-hall-setup.e2e.mjs` (hall setup check, see "Hall setup check"), `tests/unit/exam-i18n.test.js` (every run-time key in en + zh, no
Thai, no verdict wording), `tests/e2e/exam*.e2e.mjs` (one per page, fake camera + `?fakedet`, phone widths, 0% Thai in
中文 / English, privacy scan; `exam-lab.e2e.mjs` also runs the real default path without `?fakedet`: MediaPipe is
requested, no face-api.js script or model is, even with `?faceengine=faceapi`, and the detector either runs (detector calls
counted) or its failure is said; with WebAssembly removed the face signals are off with one "fix setup" event and no
no-face alert; plus the research-demo path loads only the face-api.js detector + 68
landmarks). Test seams: `window.__LQ_FAKE_DET("exam-lab" | "exam-hall")`, `window.__LQ_FAKE_Q`
(lighting override), `?calsec=N`, `window.__LQ_EXAM_LAB / __LQ_EXAM_HALL / __LQ_EXAM_DB`.

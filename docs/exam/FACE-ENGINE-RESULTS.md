# LENSIQ Exam — face engine switch (face-api.js → MediaPipe): fixed test set and measured numbers

Owner decision (2026-11-10), verbatim: "Exam: switch face detection, face count and head-turn signals from face-api.js to
MediaPipe (Apache-2.0) as a separate commit. Exam does not need face recognition. Fix the test set first, measure old vs
new on the same set, and report per signal. Keep face-api.js code in the repo behind the research-demo switch; it is not
deleted."

Section 1 (test set, metrics, the settings swept and the pick rule) was written **before** any MediaPipe setting was run
or tuned. Sections 2 onward hold the measured numbers.

## 1. Fixed test set and protocol (written before tuning, 2026-11-10)

### 1.1 What is compared

- **OLD** = Exam lab exactly as on `main` before this change: face-api.js TinyFaceDetector, input 320 then 224 when 320
  finds nothing (`LQDetect.detectFacesCascade`, score 0.5, no descriptors), 68 landmarks, `LQExam.poseFrom68`. Not tuned.
- **NEW** = MediaPipe Face Landmarker (`vendor/models/face-landmarker/face_landmarker.task`, Apache-2.0) through the
  vendored MediaPipe Tasks Vision bundle, CPU delegate, IMAGE mode (every frame is detected afresh, as in the page),
  `numFaces` 4, `minFacePresenceConfidence` 0.5, **`outputFaceBlendshapes: false`** (no expression output at all),
  `outputFacialTransformationMatrixes: true` (head pose only). Face box = the bounding box of the 478 landmarks.
- Both feed the unchanged `LQExam` monitor: face count → no-face / multi-face; `yaw` and `pitchN` → head turn
  (`|yaw − yaw₀| > 35°` or pitch-down `> 25°` vs the calibrated baseline, `LQExam.DEFAULTS`); `mar` → mouth movement.
- Frame = the image scaled to fit a **640 × 480** canvas (the Exam lab camera size), centred, padded with grey #808080.
  Ground-truth boxes are mapped into the frame.

### 1.2 Sets

All real images: **Open Images V7, validation split** (Google LLC; annotations CC BY 4.0; each selected image's own
`License` field must be the CC BY 2.0 URL; author, Flickr page and licence per image recorded in
`~/LENSIQ-field/exam-faces/CREDITS.tsv`). Boxes `validation-annotations-bbox.csv`, verified image-level labels
`validation-annotations-human-imagelabels-boxable.csv`, image list `validation-images-with-rotation.csv`. Images from the
Open Images S3 mirror. Kept in `~/LENSIQ-field/exam-faces/` (outside the repo), **deleted after the eval**; only the
manifest, the credits and the numeric results are kept. No image of a person is committed.

Common filter for the face groups: no rotation flag; no `Human face` box with `IsGroupOf = 1` or `IsDepiction = 1`.
A face box narrower than **24 px in the 640 × 480 frame** is an *ignore* box (not counted as ground truth; a detection
on it is neither a hit nor a false positive). Within each group the images are sorted by SHA-256 of the ImageID and the
first ones that download are taken.

| Group | Target | Rule | Source |
|---|---|---|---|
| R0 no person | 60 | `Person` verified **absent** (image-level label, Confidence 0); no box of any person / human-part class (Person, Man, Woman, Boy, Girl, Human face / head / body / eye / ear / nose / mouth / hair / hand / arm / leg / foot / beard) or of Doll, Sculpture, Bronze sculpture, Poster; at least one box of Desk, Table, Coffee table, Kitchen & dining room table, Laptop, Computer monitor, Television, Tablet computer, Mobile phone, Book, Bookcase, Chair or Office supplies | public dataset |
| R1 one face | 60 | exactly one `Human face` box; its width in the frame 12 – 60 % of the frame width (desk-webcam distance); no `Glasses` / `Sunglasses` box centred inside it | public dataset |
| R2 two or more faces | 40 | ≥ 2 counted faces (≥ 24 px wide in the frame), the largest ≥ 48 px | public dataset |
| R3 glasses | 30 | exactly one `Human face` box, ≥ 48 px wide in the frame, with a `Glasses` box whose centre lies inside it | public dataset |
| R4 small face at a distance | 30 | exactly one `Human face` box, 24 – 48 px wide in the frame | public dataset |
| D1 low light | = R1 | each R1 frame × 0.3 brightness + Gaussian noise σ = 3 (seeded by the ImageID) | synthetic (derived from public images) |
| D2 mask | = R1 | each R1 frame with a drawn surgical-mask shape over the lower 45 % of the face box (light blue, pleats, ear loops) | synthetic (derived) |
| F fake camera | 20 | the e2e fake-camera frames (`tests/e2e/fake-cams.js`: 4 device colours × 5 positions of the white box), 0 faces | synthetic |
| H head-turn renders | ≤ 60 bases × 13 poses | see 1.3 | synthetic render of public faces |

There is no mask class in Open Images, so masks are drawn (D2). Open Images has no head-pose labels and every head-pose
dataset checked (BIWI, AFLW2000, 300W-LP, FaceSynthetics) is research-only, so yaw / pitch ground truth comes from a
controlled render (H).

### 1.3 Head-turn render set (H)

- Base faces: the R1 images on which Face Landmarker finds exactly one face on the source image (long side ≤ 1,600 px)
  with transformation-matrix |yaw| ≤ 15° and |pitch| ≤ 15° (near-frontal, so the far side of the face has texture).
  **Bias, stated up front:** the base faces are chosen with the NEW engine and the 3-D geometry is the NEW engine's own
  mesh, which favours NEW. The OLD engine's 68-landmark yaw formula is checked on the same renders anyway.
- Render: the 478 landmarks as 3-D points (x, y in source pixels, z × source width), Delaunay triangles of the frontal
  2-D points, the source image as texture, rotated about the mesh centroid, orthographic projection, back faces culled,
  painter's order, on a #808080 640 × 480 frame, the mesh scaled to 200 px wide and centred at (320, 230).
- Poses: yaw 0, ±15, ±30, ±45, ±60° (pitch 0) and pitch-down 10, 20, 30, 45° (yaw 0) = 13 renders per base.
  Sign: negative yaw = nose toward the image's left (the convention of `poseFrom68`).
- Ground truth: "turned" when |yaw| ≥ 45° or pitch-down ≥ 45°; "not turned" when |yaw| ≤ 15° and pitch-down ≤ 10°;
  ±30° yaw and 20 / 30° pitch are within 10° of the thresholds and are used for the angle error only.
- Calibration: the engine's output on the base's 0° render is its `yaw₀` / `pitchN₀` (as `LQExam.calibrate` would get
  from a frontal candidate). If an engine finds no single face on the 0° render, every render of that base counts as a
  failure for that engine.

### 1.4 Dev / held-out split (fixed before tuning)

Key = ImageID. `dev` when the first hex digit of SHA-256("lensiq-examface:" + ImageID) is 0 – 7, otherwise `held-out`.
D1, D2 and H inherit the split of their source image; F frames with an even index are dev, odd are held-out. Settings
are picked on dev only; held-out is reported once for the pick (the full table is shown for transparency).

### 1.5 Metrics (fixed before tuning)

Matching: greedy by IoU, a detection matches a ground-truth box when IoU ≥ 0.3 (detectors draw different box shapes).

- **Detection recall** = matched counted faces / counted faces, per group.
- **False positives** = detections matching neither a counted nor an ignore box. Reported as the share of frames with
  ≥ 1 false positive and the total count, per group; on R0 and F (no face at all) this is the false "face present" rate.
- **Face count accuracy** = share of frames whose detected count (minus detections on ignore boxes) is in the same
  class as the ground truth: 0 / 1 / 2+. Per signal: *no-face false alarm* = frames with ≥ 1 counted face read as 0;
  *multi-face false alarm* = frames with ≤ 1 counted face read as ≥ 2; *multi-face recall* = R2 frames read as ≥ 2;
  *face present on a no-face frame* = R0 + F frames read as ≥ 1.
- **Head turn** (H): classification accuracy against 1.3 with the `LQExam` rule and defaults (a render without exactly
  one face counts as wrong); coverage (renders with exactly one face); yaw error |(yaw − yaw₀) − yaw_true| (median,
  p90, mean) on the yaw renders; pitch error |pitchDeg(pitchN, pitchN₀) − pitch_true| on the pitch renders.
- **Latency**: wall time of one engine call on a 640 × 480 canvas after a warm-up call, median and p90, on the eval
  machine (stated). OLD is measured on its page chain with WebGL (SwiftShader) and on WASM (no WebGL); NEW on the CPU
  delegate (MediaPipe needs WebGL to upload frames even then — corrected in §3: it needs a GL context, which some
  browsers provide without reporting WebGL).
- Every rate carries n and a Wilson 95 % interval.

### 1.6 NEW settings swept (dev only)

- `minFaceDetectionConfidence` 0.3 / 0.4 / 0.5.
- Pose: `mesh68` (MediaPipe points mapped onto the 68-point indices `poseFrom68` reads: jaw 234 / 454, nose tip 1, outer
  eye corners 33 / 263, chin 152, inner lips 78 / 82 / 13 / 312 / 308 / 317 / 14 / 87) or `matrix` (yaw and pitch from
  the facial transformation matrix; `pitchN` = 0.45 + pitch / 120 so the unchanged monitor reads degrees; `mar` from the
  same inner-lip points).

### 1.7 Pick rule (fixed before tuning; the owner may change it)

1. Detection confidence: on dev, the highest face-count accuracy over all dev frames of R0 – R4, D1, D2 and F, among the
   values whose "face present on a no-face frame" rate on dev is not higher than OLD's; ties → the higher threshold.
2. Pose: on dev renders, the higher head-turn classification accuracy; ties → the lower median yaw error.

If NEW is worse than OLD on a signal, that is reported as measured; the switch itself is the owner's decision.

## สรุปสำหรับเจ้าของ (Thai summary)

- เปลี่ยนตัวตรวจใบหน้าของหน้าผู้เข้าสอบเป็น **MediaPipe Face Landmarker (Apache-2.0)** แล้ว ใช้นับใบหน้าและดูการหันศีรษะเท่านั้น
  ไม่จดจำใบหน้า ไม่วิเคราะห์สีหน้า (ลบโมเดลคะแนนการขยับใบหน้าออกจากไฟล์โมเดลด้วย) face-api.js ยังอยู่ในโค้ด
  เปิดได้เฉพาะเมื่อเปิด "เดโมงานวิจัย" และใส่ `?faceengine=faceapi` เท่านั้น ชุดที่ส่งลูกค้าไม่โหลด face-api.js เลย
  (หน้า Exam ใช้ TF.js แยกต่างหากสำหรับตรวจโทรศัพท์ / หนังสือ)
- ชุดทดสอบ (ข้อมูลสาธารณะ Open Images V7 + ภาพจำลอง) กำหนดไว้ก่อนวัด ผลบนครึ่งที่ไม่ได้ใช้ปรับค่า (held-out):
  - พบใบหน้าคนเดียวระยะโต๊ะ: เดิม 84.6 % ใหม่ 84.6 % (n = 26) · แสงน้อย (จำลอง): เดิม 61.5 % ใหม่ **76.9 %** ·
    หน้ากาก (จำลอง): เดิม 53.8 % ใหม่ **65.4 %** · แว่นตา: เดิม 100 % ใหม่ 81.8 % (n = 11 ช่วงกว้างมาก รวมทุกส่วน 80 % เท่ากัน) ·
    ใบหน้าเล็ก 24 – 48 px: **ทั้งสองแบบหาไม่เจอเลย** (0 / 12)
  - ภาพที่ไม่มีคน: ทั้งสองแบบไม่เห็นใบหน้าปลอม (0 / 37) · นับจำนวนใบหน้าถูก (0 / 1 / 2+): เดิม 67.1 % ใหม่ 70.3 % (n = 155)
  - หลายใบหน้า (ภาพกลุ่ม): ทั้งสองแบบต่ำ เดิม 17.6 % ใหม่ 23.5 % (n = 17)
  - การหันศีรษะ (ภาพเรนเดอร์จำลอง เข้าข้างตัวตรวจใหม่ ยังไม่ใช่ข้อกล่าวอ้างจนกว่าจะวัดกับวิดีโอจริง (โครงการนำร่อง)): เดิม 84.4 % ใหม่ 81.1 % (n = 90) ใหม่แย่กว่าเล็กน้อย โดยเฉพาะหันมาก ±60°
    (dev + held-out, 25 ภาพต่อมุม: ใหม่แจ้ง 36 – 40 % เดิม 64 – 80 %)
  - ความเร็ว: ใหม่เร็วกว่าประมาณ 4.5 เท่า (สองรอบวัดบน Mac M1 เดียวกัน: ใหม่ 12.8 – 18.7 ms ต่อภาพ เดิม 57.5 – 85.9 ms บน WASM
    ค่าต่างกันระหว่างรอบถึง 45 % จึงไม่ใช้ตัวเลขเดียว)
- ข้อจำกัด: ถ้าตัวตรวจใบหน้าโหลดหรือทำงานไม่ได้จริง (ตัดสินจากการทำงานจริง ไม่ใช่จากการตรวจว่ามี WebGL) หน้านี้จะปิดการดูใบหน้าและบอกผู้สอบกับผู้คุมสอบว่า "ปรับการติดตั้ง"
  บน Mac ที่ปิด WebGL ทั้งหมด MediaPipe ทำงานไม่ได้ แต่ Chrome บน Linux ของ CI ทำงานได้ทั้งที่รายงานว่าไม่มี WebGL
  (ไม่แจ้งว่า "ไม่เห็นใบหน้า") ภาพเรนเดอร์ใช้โครงหน้าจาก MediaPipe เอง จึงอาจเข้าข้างแบบใหม่ ต้องวัดซ้ำในโครงการนำร่อง

## 2. Measured numbers (run 2026-11-10, `node tools/exam-face-eval.mjs --run`)

Raw per-frame output (boxes and pose numbers only, no pixels): `~/LENSIQ-field/exam-faces/eval/examface-2026-11-10.json`;
tables `~/LENSIQ-field/exam-faces/eval/examface-2026-11-10.md`; log `~/LENSIQ-field/exam-faces/eval-run.log`.
**Hardware: Apple M1, 8 GB, macOS 26, headless Chrome 156, WebGL through SwiftShader (software). Not a phone, not a GPU.**
Engine errors / not loaded: 0. The images were deleted after the run (§1.2); `--select` rebuilds the same set.

### 2.1 Sets as built

| Group | Frames | dev / held-out | Counted faces | Source |
|---|---|---|---|---|
| R0 no person | 60 | 33 / 27 | 0 | public dataset (Open Images V7) |
| R1 one face (desk distance) | 60 | 34 / 26 | 60 | public dataset |
| R2 two or more faces | 40 | 23 / 17 | 90 (+ ignore boxes < 24 px) | public dataset |
| R3 glasses | 30 | 19 / 11 | 30 | public dataset |
| R4 small face (24 – 48 px) | 30 | 18 / 12 | 30 | public dataset |
| D1 low light | 60 | 34 / 26 | 60 | synthetic (derived from R1) |
| D2 mask | 60 | 34 / 26 | 60 | synthetic (derived from R1) |
| F fake camera | 20 | 10 / 10 | 0 | synthetic |
| H head-turn renders | 25 bases × 13 = 325 | 15 / 10 bases | 1 per render | synthetic render of public faces |

Eligible before the size rule: R0 259, R1 / R4 1,585, R2 862, R3 110. Render bases: 60 R1 images tried, 25 usable
(11 no face found by NEW on the source, 3 two faces, 21 not near-frontal).

### 2.2 Sweep on dev (§1.6) and the pick (§1.7)

| Engine | face count 0/1/2+ correct | face present on a no-face frame | detection recall | frames with a false positive |
|---|---|---|---|---|
| OLD | 135 / 205 = 65.9 % [59.1 % – 72.0 %] | 1 / 43 = 2.3 % [0.4 % – 12.1 %] | 111 / 192 = 57.8 % [50.7 % – 64.6 %] | 9 / 205 = 4.4 % [2.3 % – 8.1 %] |
| NEW det 0.3 | 135 / 205 = 65.9 % [59.1 % – 72.0 %] | 0 / 43 = 0.0 % [0.0 % – 8.2 %] | 118 / 192 = 61.5 % [54.4 % – 68.1 %] | 7 / 205 = 3.4 % [1.7 % – 6.9 %] |
| NEW det 0.4 | 135 / 205 = 65.9 % [59.1 % – 72.0 %] | 0 / 43 = 0.0 % [0.0 % – 8.2 %] | 118 / 192 = 61.5 % [54.4 % – 68.1 %] | 7 / 205 = 3.4 % [1.7 % – 6.9 %] |
| **NEW det 0.5 (picked)** | 136 / 205 = 66.3 % [59.6 % – 72.5 %] | 0 / 43 = 0.0 % [0.0 % – 8.2 %] | 116 / 192 = 60.4 % [53.4 % – 67.1 %] | 5 / 205 = 2.4 % [1.0 % – 5.6 %] |

| Pose (det 0.5), dev renders | head-turn class correct | coverage | yaw error median / p90 / mean | pitch error median / mean |
|---|---|---|---|---|
| OLD | 110 / 135 = 81.5 % [74.1 % – 87.1 %] | 166 / 195 = 85.1 % | 7.0 / 34.6 / 13.5° | 7.9 / 9.2° |
| **NEW mesh68 (picked)** | 103 / 135 = 76.3 % [68.5 % – 82.7 %] | 177 / 195 = 90.8 % | 17.0 / 44.3 / 20.4° | 7.9 / 16.3° |
| NEW matrix | 96 / 135 = 71.1 % [63.0 % – 78.1 %] | 177 / 195 = 90.8 % | 8.6 / 16.5 / 10.0° | 4.0 / 4.9° |

Pick: detection confidence **0.5** (the MediaPipe default; highest count accuracy, no false face on the no-face frames),
pose **mesh68**. The matrix pose has the smaller angle errors but reads large turns as smaller than they are (on these
renders about 0.55 × the rendered yaw), so fewer 45° / 60° turns cross the unchanged 35° threshold. Changing the
threshold for it would be tuning on these renders; it is left for the owner (§4).

### 2.3 Per signal, held-out (the headline; never used to pick)

| Signal | Metric | OLD (face-api.js) | NEW (MediaPipe) | Source |
|---|---|---|---|---|
| face present | recall, one face at desk distance (R1) | 22 / 26 = 84.6 % [66.5 % – 93.8 %] | 22 / 26 = 84.6 % [66.5 % – 93.8 %] | public dataset |
| face present | false face on a no-face frame (R0 + F) | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | public + synthetic |
| face present | frames with any false positive (all groups) | 2 / 155 = 1.3 % [0.4 % – 4.6 %] | 1 / 155 = 0.6 % [0.1 % – 3.6 %] | public + synthetic |
| no-face | false alarm: frames with ≥ 1 face read as 0 (all groups) | 43 / 118 = 36.4 % [28.3 % – 45.4 %] | 39 / 118 = 33.1 % [25.2 % – 42.0 %] | public + synthetic |
| face count | 0 / 1 / 2+ class correct (all groups) | 104 / 155 = 67.1 % [59.4 % – 74.0 %] | 109 / 155 = 70.3 % [62.7 % – 77.0 %] | public + synthetic |
| multi-face | recall: R2 frames read as ≥ 2 | 3 / 17 = 17.6 % [6.2 % – 41.0 %] | 4 / 17 = 23.5 % [9.6 % – 47.3 %] | public dataset |
| multi-face | false alarm: ≤ 1 face read as ≥ 2 | 0 / 138 = 0.0 % [0.0 % – 2.7 %] | 0 / 138 = 0.0 % [0.0 % – 2.7 %] | public + synthetic |
| head turn | class correct (renders) | 76 / 90 = 84.4 % [75.6 % – 90.5 %] | 73 / 90 = 81.1 % [71.8 % – 87.9 %] | synthetic render; favours the new engine; not a claim until measured on real video (pilot) |
| head turn | yaw error median / p90 / mean (n) | 9.2 / 31.7 / 12.9° (69) | 17.2 / 43.4 / 20.9° (73) | synthetic render; favours the new engine; not a claim until measured on real video (pilot) |
| head turn | renders with exactly one face (coverage) | 114 / 130 = 87.7 % [80.9 % – 92.3 %] | 121 / 130 = 93.1 % [87.4 % – 96.3 %] | synthetic render; favours the new engine; not a claim until measured on real video (pilot) |

Pitch error is measured (tables in the raw output and §2.2) but is **not reported as a result**: the renders use
MediaPipe's own mesh, so a lower pitch error for NEW says little about real heads.
| mouth movement | — | not measured (no ground truth in this set) | not measured | — |

Claim used on exam.html (`exam.l.cl2`): face not found for one person at desk distance, held-out half of the public
set: **4 / 26 = 15.4 %** (both engines); faces only 24 – 48 px wide: **0 / 12 found** (both engines); by skin tone: not measured.

### 2.4 Per condition (recall of counted faces; held-out, then dev + held-out for a larger n)

| Group | OLD held-out | NEW held-out | OLD all | NEW all |
|---|---|---|---|---|
| R1 one face | 22 / 26 = 84.6 % | 22 / 26 = 84.6 % | 49 / 60 = 81.7 % [70.1 % – 89.4 %] | 50 / 60 = 83.3 % [72.0 % – 90.7 %] |
| R2 two or more (per face) | 13 / 37 = 35.1 % | 14 / 37 = 37.8 % | 45 / 90 = 50.0 % [39.9 % – 60.1 %] | 39 / 90 = 43.3 % [33.6 % – 53.6 %] |
| R3 glasses | 11 / 11 = 100.0 % | 9 / 11 = 81.8 % | 24 / 30 = 80.0 % [62.7 % – 90.5 %] | 24 / 30 = 80.0 % [62.7 % – 90.5 %] |
| R4 small (24 – 48 px) | 0 / 12 = 0.0 % | 0 / 12 = 0.0 % | 0 / 30 = 0.0 % [0.0 % – 11.4 %] | 0 / 30 = 0.0 % [0.0 % – 11.4 %] |
| D1 low light (synthetic) | 16 / 26 = 61.5 % | 20 / 26 = 76.9 % | 36 / 60 = 60.0 % [47.4 % – 71.4 %] | 46 / 60 = 76.7 % [64.6 % – 85.6 %] |
| D2 mask (synthetic) | 14 / 26 = 53.8 % | 17 / 26 = 65.4 % | 33 / 60 = 55.0 % [42.5 % – 66.9 %] | 39 / 60 = 65.0 % [52.4 % – 75.8 %] |
| R0 no person: frames with a false face | 0 / 27 | 0 / 27 | 1 / 60 = 1.7 % | 0 / 60 = 0.0 % [0.0 % – 6.0 %] |
| F fake camera: frames with a false face | 0 / 10 | 0 / 10 | 0 / 20 | 0 / 20 = 0.0 % [0.0 % – 16.1 %] |

The R2 count is low for both engines: Open Images group photos have many faces between 24 and 60 px, which both
detectors miss (same reason as R4). A second person close to the candidate's webcam is larger than that; a person in
the background across a lab is not.

### 2.5 Head turn per rendered pose (held-out, 10 bases; renders flagged "turned" by the unchanged rule)

Source: synthetic render; favours the new engine; not a claim until measured on real video (pilot).

| Pose | OLD | NEW mesh68 (picked) | NEW matrix (not picked) |
|---|---|---|---|
| yaw 0° / ±15° (should not flag) | 0 / 30 | 0 / 30 | 0 / 30 |
| yaw −30° · +30° (within 10° of the threshold) | 7 / 10 · 5 / 10 | 9 / 10 · 10 / 10 | 0 / 10 · 0 / 10 |
| yaw −45° · +45° | 9 / 10 · 9 / 10 | 7 / 10 · 10 / 10 | 5 / 10 · 3 / 10 |
| yaw −60° · +60° | 8 / 10 · 5 / 10 | 4 / 10 · 4 / 10 | 8 / 10 · 5 / 10 |
| pitch down 10° / 20° (should not flag) | 0 / 20 | 0 / 20 | 0 / 20 |
| pitch down 30° (within 10°) | 1 / 10 | 3 / 10 | 8 / 10 |
| pitch down 45° | 5 / 10 | 8 / 10 | 8 / 10 |

NEW mesh68 over-reads moderate turns (30° already crosses 35°) and under-reads ±60° (the jaw points on the hidden side
of the mesh move inward). `LQExam` needs 3 of 5 frames for ≥ 8 s, so a real turn is seen over many frames; these are
single-frame numbers.

### 2.6 Latency per 640 × 480 frame (ms, after a warm-up call; Apple M1, SwiftShader WebGL)

| Engine | n | median, this run | p90, this run | median, independent reviewer's run (same M1) |
|---|---|---|---|---|
| OLD face-api.js, WebGL backend (SwiftShader = software GL) | 340 | 129.6 | 165.5 | — |
| OLD face-api.js, WASM backend (no WebGL) | 30 | 57.5 | 73.0 | 85.9 |
| NEW MediaPipe, CPU delegate | 340 | 12.8 | 19.9 | 18.7 |

**State latency as a range or a ratio, never as one number:** the two runs differ by up to 45 %. Across both runs NEW
takes 12.8 – 18.7 ms and OLD (WASM) 57.5 – 85.9 ms per frame, i.e. NEW is **about 4.5× faster** (4.5× and 4.6×).

With a real GPU the OLD WebGL figure would be lower; NEW does not use the GPU for inference (CPU delegate).

## 3. What was built (the page uses the picked settings)

- `lensiq-exam-face.js` (new): MediaPipe Face Landmarker, CPU delegate, IMAGE mode, `numFaces` 4, detection 0.5, pose
  mesh68; the face-api.js engine for the research demo only. Fake faces in the e2e seam go through the same pose code.
- **Deviation from §1.1, stricter:** the facial-movement score option is not passed at all (its default is off), and
  the score model itself is removed from the vendored `.task` (`vendor/models/face-landmarker/README.txt`); landmarks and
  matrix were identical to the original bundle on the check frame. The guard test forbids the option's name in every
  Exam file.
- Detector fails to load or run → the lab page switches the face signals off, tells the candidate, and sends one
  `setup` event with code `faceoff` to the dashboard. It never becomes a "no face" alert. There is no WebGL probe: the face signals are switched off only when the detector actually fails to load or run (no WebGL probe). On a Mac headless Chrome with every WebGL context disabled, MediaPipe's frame upload throws ("activeTexture") for Face Landmarker and BlazeFace alike, with canvas, ImageData and ImageBitmap inputs; CI's Linux Chrome runs the same bundle while its page probe reports no WebGL. So whether a no-WebGL machine keeps the face signals depends on the browser, not on a probe.
  The old engine ran on WASM without WebGL, so a browser like the Mac one above is a regression (§4). The no-WebGL
  time per frame could not be measured here because the detector does not run in that browser.
- Exam lab and hall load TF.js 4.7.0 on its own (`vendor/tfjs/`, ES2017 builds, no string evaluation under the CSP)
  for COCO-SSD; `vendor/face-api.js` is injected only by the research-demo engine.

## 4. Open points for the owner

- Head turn: NEW is 3 points lower on the renders (81.1 % vs 84.4 %, intervals overlap) and weaker at ±60°. Options:
  keep mesh68, or use the matrix pose with its own threshold (needs a new held-out set, since this one has been seen).
- Small faces (24 – 48 px) and group photos: neither engine works; a second person far behind the candidate is not counted.
- Renders favour NEW (its own mesh); the head-turn numbers are not a claim until measured on real video in the pilot.

## 5. Process note for future rounds

Commit the test-set definition (§1) on its own, before any result is produced, so the review can check from the git
history that the set, metrics and pick rule came first. In this round §1 was written first but committed together with
the results.
- Browsers where MediaPipe cannot get a GL context (seen: Mac headless Chrome with WebGL disabled) lose the face
  signals (said so on screen and on the dashboard); CI's Linux Chrome without reported WebGL keeps them.
- Skin tone: not measured (Open Images has no skin-tone labels).

---

# Follow-ups after the switch (2026-11-10, afternoon)

Owner decision (verbatim): "Exam: MediaPipe switch approved as the new default. Follow-ups before the hall mode is sold:
Small faces (24–48 px, 0/12): test MediaPipe's full-range face detector and image tiling on the hall camera view; report
detection and fps on a mid-range laptop. Multiple people (4/17): investigate the misses and improve this signal for lab
mode. Fix the test set first. Lab mode is ready for a field pilot; mark the hall mode 'experimental' until the small-face
issue is fixed."

Section 6 (sets, options, metrics, pick rules) was written **before** any option below was run or tuned (15:50 ICT,
before the selection tool existed; only a load check of the full-range model was run, §6.3). Section 7 holds the
measured numbers.

## 6. Fixed test sets and protocol for the follow-ups (written before tuning)

### 6.1 Source, licence, storage, split

- **Open Images V7, validation split** (Google LLC; annotations CC BY 4.0), the same metadata files as §1.2. Each
  selected image's own `License` field must be the CC BY 2.0 URL; no rotation flag. Author, Flickr page and licence per
  image in `~/LENSIQ-field/exam-faces-hall/CREDITS.tsv`. Images from the Open Images S3 mirror, resized on download to at
  most 1,280 px on the long side (the size rules below use the original size), kept in
  `~/LENSIQ-field/exam-faces-hall/images/` (outside the repo) and **deleted after the eval**; only `manifest.jsonl`,
  `CREDITS.tsv` and the numeric results stay. No image of a person is committed.
- Images already used in the §1 set (`~/LENSIQ-field/exam-faces/manifest.jsonl`) are excluded.
- Within each group, eligible images are sorted by SHA-256 of the ImageID and the first that download and pass the size
  rule are taken, up to the target. **At most 280 images in total.**
- Split: `dev` when the first hex digit of SHA-256("lensiq-examhall:" + ImageID) is 0 – 7, otherwise `held-out`.
  Settings are picked on dev only; held-out is reported once for each pick (the full table is shown for transparency).
- "Face" = an Open Images `Human face` box. A face box with `IsGroupOf = 1` or `IsDepiction = 1` is an *ignore* region
  (a detection on it is neither a hit nor a false positive). Matching as §1.5: greedy by IoU, hit at IoU ≥ 0.3.

### 6.2 Hall set (small faces in the hall camera view)

Frame = the image scaled to fit a **1,280 × 720** canvas (the hall page asks the camera for 1,280 × 720), centred,
padded with grey #808080. Face width is measured in that frame.

| Group | Target | Rule |
|---|---|---|
| HB hall-like, many people | 100 | ≥ 4 `Human face` boxes that are neither group nor depiction; in the frame, ≥ 3 of them 16 – 64 px wide and ≥ 1 of them 24 – 48 px wide. Open Images has no "seated" or "exam hall" label, so this is a proxy: wide views with many small faces (stated as a limitation) |
| H0 no person, wide indoor view | 30 | as R0 in §1.2 (`Person` verified absent, no box of any person / human-part class, doll, sculpture or poster) and at least one box of Chair, Desk, Table or Bench |

Counted faces: width ≥ 16 px in the frame. Faces < 16 px wide are *ignore* boxes. Recall is reported per size bucket:
**16 – 24, 24 – 48 (the target bucket), 48 – 64, > 64 px**.

### 6.3 Hall options (all on the same 1,280 × 720 frames)

| Option | What runs |
|---|---|
| (a) | the current lab engine unchanged: Face Landmarker (vendored bundle, `face_landmarker_lm.task`), CPU, IMAGE mode, `numFaces` 4, on the whole frame; also `numFaces` 8 (the most `cleanOptions` allows) so the cap is not the reason for misses |
| (b) | BlazeFace **full-range** (`blaze_face_full_range.tflite`, Apache-2.0 per "MediaPipe BlazeFace Model Card (Full Range)", 2021-01-19) through MediaPipe Tasks Vision **1.2.2** (npm `@mediapipe/tasks-vision`, Apache-2.0), FaceDetector, CPU, IMAGE mode, on the whole frame. Load check (15:45): the vendored 0.10.x bundle still rejects this model ("2304 vs. 896" anchors); 1.2.2 loads it and runs |
| (c) | tiling with the detector of (a): BlazeFace short-range (`vendor/models/face-gate/blaze_face_short_range.tflite`, the same file as the detector inside the `.task`), vendored bundle, FaceDetector; **2 × 2** and **3 × 3** tiles with 20 % overlap between neighbours, plus one whole-frame pass |
| (d) | tiling as (c) with the full-range detector of (b) |

Tiles = `LQDetect.tileRects(n, n, 0.2)` (the hall page's COCO-SSD tiling), each crop drawn at its own resolution (no
upscaling; MediaPipe resizes it to the model input). A tile detection touching an inner tile edge (within 2 px) is
dropped (the face is cut; the neighbouring tile or the whole-frame pass sees it whole). Tile merge: detections mapped
back to the frame; two boxes are the same face when IoU ≥ 0.3 or ≥ 60 % of the smaller box lies inside the larger; the
higher score is kept. The same code runs in the eval and in the page (`LQExamFace.createFaceBoxes`). Detection confidence swept on dev: **0.5 and 0.3** for every
option ((a): `minFaceDetectionConfidence`; (b) – (d): `minDetectionConfidence`).

### 6.4 Hall metrics

- Recall of counted faces per size bucket, Wilson 95 % interval.
- **False positives per frame** = detections matching neither a counted face nor an ignore box, divided by the number
  of frames (H0 + HB); also the share of frames with ≥ 1 false positive (Wilson). Open Images faces are not labelled
  exhaustively, so some "false positives" in HB may be real, unlabelled faces; H0 is reported separately.
- **Speed** = wall time of one face pass on a 1,280 × 720 canvas after a warm-up call, median and p90, on a fixed
  latency subset (the first 40 HB frames in manifest order), on this machine (Apple M1, 8 GB, headless Chrome,
  SwiftShader WebGL) **unthrottled** and with **CDP CPU throttling 4×** (`Emulation.setCPUThrottlingRate`), labelled
  "emulated mid-range laptop (M1 throttled 4×)". fps = 1,000 / median ms of the face pass alone. COCO-SSD (which the hall
  page already runs for persons and phones) is timed the same way so the combined loop can be stated, but the rule
  below uses the face pass alone.

### 6.5 Hall pick rule (fixed before the run)

On dev: the option × threshold with the **highest 24 – 48 px recall**, subject to **fps ≥ 5 on the emulated mid-range
laptop** and **false positives ≤ 0.05 per frame** (dev, H0 + HB). Ties → the higher emulated fps. If no option meets
both limits, nothing is picked, the hall face pass is not switched on, and hall mode stays "experimental". The pick is
implemented for hall mode only, behind a setting that is off by default.

### 6.6 Lab multi-person set (a second person behind or beside the candidate)

Frame = 640 × 480 as §1.1. Candidate face = a `Human face` box 12 – 60 % of the frame width. No person or face box in
the image may be group or depiction. Person classes = Person, Man, Woman, Boy, Girl.

| Group | Target | Rule |
|---|---|---|
| M2 second face | 60 | exactly one candidate face; ≥ 1 other `Human face` box, every other face narrower than the candidate, at least one ≥ 16 px wide in the frame |
| M3 second person, face not boxed | 40 | exactly one candidate face, no other `Human face` box, and ≥ 1 person box that does not contain the candidate face's centre (a person partly visible, turned away or cut by the frame) |
| M1 one person only | 50 | exactly one candidate face, no other face box, ≥ 1 person box and every person box contains the candidate face's centre |

Ground truth: M2 and M3 frames are "≥ 2 people"; M1 frames are "1 person". The second person's distance is reported by
the width of the largest other face in the frame (M2): **16 – 32, 32 – 64, ≥ 64 px**, and by whether it is marked
occluded / truncated; M3 separately.

### 6.7 Lab multi-person options

| Option | Rule for "≥ 2 people in this frame" |
|---|---|
| OLD | the lab engine as on `main` (Face Landmarker, `numFaces` 4, detection 0.5): ≥ 2 faces |
| N1 | the same engine with detection 0.3 |
| N2@c | OLD + a secondary full-range BlazeFace pass (Tasks Vision 1.2.2) on the whole frame at confidence c ∈ {0.5, 0.3}: secondary boxes that are not the same face as a primary face (merge rule of §6.3) are added, **only when the primary engine found ≥ 1 face** (so the no-face signal is unchanged) |
| N3@c | OLD + a secondary short-range BlazeFace pass on 2 × 2 tiles (20 % overlap) at c ∈ {0.5, 0.3}, same rule |
| N4@s | OLD + a person cue from COCO-SSD (already loaded by the lab page, Apache-2.0): ≥ 2 person boxes with score ≥ s ∈ {0.5, 0.6} after NMS (IoU 0.5), only when the primary engine found ≥ 1 face |
| N5 | N2@0.5 or N4@0.6 |

No option reads expression or facial-movement scores (none is requested, as §3).

### 6.8 Lab multi-person metrics and pick rule (fixed before the run)

- **Multi-person recall** = M2 + M3 frames read as ≥ 2 people (Wilson), also per group and per distance bucket.
- **False alarm** = M1 frames read as ≥ 2 people (Wilson).
- **Added time** per 640 × 480 frame over OLD (median, unthrottled M1). The lab runs COCO-SSD on every 3rd frame anyway,
  so N4 / N5 would read the latest COCO-SSD result in the page (no added time there); the eval states COCO-SSD's own time.
- Pick: on dev, the highest multi-person recall subject to a false-alarm rate on dev M1 ≤ 5 % **and** no more than one
  more false-alarm frame than OLD on dev M1, and an added time ≤ 50 ms per frame (the lab loop runs every 250 ms).
  Ties → fewer false alarms, then faster. If nothing beats OLD, OLD stays.
- Miss analysis for OLD (dev + held-out): per M2 miss, the second face's width bucket, occluded / truncated flags, and
  whether N1 (lower confidence) would have found it.

### 6.9 Locked set: where it is kept and its hashes (added after the run; no definition above was changed)

The locked set, the run logs and the raw results are kept in a persistent folder outside the repo and outside every
worktree: `~/LENSIQ-field/evals/exam-followups/` (owner rule, 2026-11-10). The set was built by
`node tools/exam-hall-face-eval.mjs --select` at 16:00 ICT and has not been changed since.

| File | What | sha256 |
|---|---|---|
| `manifest.jsonl` | 280 images: HB 100 (dev 53 / held-out 47), H0 30 (14 / 16), M2 60 (35 / 25), M3 40 (13 / 27), M1 50 (33 / 17); image id, group, split, original size, face and person boxes | `164e02190e2121e8469f24d1070f07871082a136dbe2a14fd10a3bcdefdb25a8` |
| `CREDITS.tsv` | author, Flickr page and licence (CC BY 2.0) per image | `d08198cb88f17173afc73798be11109423809d1bc8c8d8b43f4808334f4434e1` |

The images themselves are not kept (§7.4). `--select` is deterministic for the same metadata files, so the same 280
images can be downloaded again and checked against the manifest.

## 7. Measured numbers for the follow-ups (run 2026-11-10 16:38 – 16:47 ICT, `node tools/exam-hall-face-eval.mjs --run`)

**Source of every number in this section: public dataset** (Open Images V7 validation images, CC BY 2.0, annotations
CC BY 4.0), letterboxed to the frame sizes of §6. These are photographs of groups and of people at a desk distance, **not
exam-hall or exam-lab footage**: a proxy until the field pilot. Intervals are Wilson 95 %. Machine: Apple M1, 8 GB,
headless Chrome 156, SwiftShader WebGL (software rendering; a laptop with a working GPU is faster for COCO-SSD).

Runs: run 1 (16:01) put all 18 MediaPipe instances and TF.js on one page; Chrome dropped the oldest WebGL contexts and
the Face Landmarker returned no face on any frame. It was **discarded** (kept as `run1-discarded.log`). Run 2 (16:15,
one phase per fresh page, with a sanity check and a context-loss check) was cut off by a session restart before it wrote
results. **Run 3** is the same code as run 2 plus timing for every option × threshold (run 2 timed 12 of 16, so the fps
limit of §6.5 could not have been applied to the other 4); it passed the sanity check (candidate found on 45 / 50
one-person frames) and is the only run reported. Nothing in §6 was changed between the runs.

**Process note (added after the independent review, 2026-11-10; no number changed).** Three limits of this round's
process, stated so the numbers are not read as stronger than they are:

- **Held-out was seen more than once.** The tool prints the dev, held-out and "all" tables on every run, so held-out
  tables were printed for the discarded run 1 (`results-tables-run1-discarded.md`; its Face Landmarker rows were all
  zero because of the lost WebGL contexts, so its mechanical pick, numFaces 8 @0.3, was meaningless; its full-range
  detector rows already showed the held-out figures reported here, for example 122 / 195) and again for run 3. §6.1
  says "held-out is reported once for each pick"; that was not kept in the strict sense.
- **The picks are mechanical and use dev only.** `summarise()` in `tools/exam-hall-face-eval.mjs` applies §6.5 and §6.8
  to the dev tables and prints the pick; as stated above, nothing in §6 was changed between the runs (run 2 → run 3
  only added timing for the 4 options that had none). The independent review reproduced the numbers. So no choice was
  made by a person after held-out had been seen, but the reader has to take the unchanged rule on trust, because:
- **The order "§6 written before tuning" cannot be proven from git this round.** §6, the tool, the page change and §7
  are all uncommitted work on one base commit (`f0fd2e7`); there is no commit or signed timestamp of §6 that predates
  the first run. The times given in this document (15:50 protocol, 16:00 `--select`, 16:01 run 1) come from the
  session and from file times in `~/LENSIQ-field/evals/exam-followups/`, not from version control.
- From the next round on: commit the protocol section (and record the sha256 of the locked set) **before** the eval
  tool runs, and print held-out tables only with an explicit flag after the pick is fixed (§5 process note applies).

Timing caveat: other headless Chrome jobs were running on the same machine during run 3, so single timings are noisy
(example: option (a) numFaces 4 @0.5 reads 26.3 ms unthrottled and 25.6 ms throttled 4×). The fps conclusions below do
not depend on that noise: every tiled full-range option is 2.2 – 3.9 fps emulated, far from the limit of 5.

### สรุปสำหรับเจ้าของ (งานต่อเนื่อง 10 พ.ย. 2569)

- **ห้องสอบที่มีกล้อง (hall): ยังแก้ปัญหาใบหน้าเล็กไม่ได้ จึงคงป้าย "รุ่นทดลอง ยังไม่เปิดขาย" ไว้ทุกจุด (ไทย / อังกฤษ / จีน)**
  ใบหน้ากว้าง 24–48 px ในภาพ 1,280 × 720 (ชุดทดสอบแยก n = 195 ใบหน้า ที่มา: ชุดข้อมูลสาธารณะ ภาพหมู่ ไม่ใช่ภาพห้องสอบจริง):
  ตัวตรวจปัจจุบัน 0 % · ตัวตรวจ full-range ทั้งภาพ 14.4 % · full-range แบ่งภาพ 3 × 3 ได้ 62.6 % แต่มีกรอบผิด 0.40 กรอบต่อภาพ
  และเร็วเพียง 2.2 ภาพต่อวินาทีบนแล็ปท็อประดับกลางจำลอง (M1 ลดความเร็ว 4 เท่า; ไม่ลดความเร็ว 4.8 ภาพต่อวินาที)
  เทียบกับเกณฑ์ที่ตั้งไว้ก่อนวัด (กรอบผิด ≤ 0.05 ต่อภาพ และ ≥ 5 ภาพต่อวินาที): ตัวตรวจ Face Landmarker ทั้ง 4 แบบ **ผ่านทั้งสองเกณฑ์
  แต่หาใบหน้ากว้าง 24–48 px ได้ 0 %** (ชุดเลือกค่า 0 / 207 ชุดทดสอบแยก 0 / 195) ส่วนทุกตัวเลือกที่หาใบหน้าเล็กเจอ **ไม่ผ่านเกณฑ์กรอบผิด**
  (0.10–2.78 กรอบต่อภาพ) และแบบแบ่งภาพที่หาได้มากที่สุดยัง **ไม่ผ่านเกณฑ์ความเร็ว** ด้วย (2.2–3.9 ภาพต่อวินาที) กฎจึงเลือกจากกลุ่มที่ผ่านเกณฑ์
  ซึ่งได้ 0 % เท่ากันหมด และตัดสินด้วยความเร็ว: ได้ Face Landmarker 8 ใบหน้า ความมั่นใจ 0.5 (39.8 เทียบกับ 39.1 ภาพต่อวินาที
  ต่างกันน้อยกว่าความคลาดเคลื่อนของการจับเวลา จึงไม่ได้แปลว่าดีกว่าแบบ 4 ใบหน้า) ผลคือได้ตัวตรวจเดิม ปัญหาใบหน้าเล็กยังไม่ถูกแก้
  และไม่มีโมเดลใหม่ถูกเปิดใช้
- **ห้องคอมพิวเตอร์ (lab): สัญญาณ "มากกว่าหนึ่งคน" ดีขึ้น** โดยนับคนจากตัวตรวจวัตถุที่หน้านี้ใช้อยู่แล้ว (ไม่เพิ่มโมเดล ไม่เพิ่มการประมวลผล)
  และใช้เฉพาะเมื่อเห็นใบหน้าผู้สอบ: ชุดทดสอบแยก เดิม 9.6 % ใหม่ 28.8 % (n = 52 ภาพ) แจ้งผิดเมื่อมีคนเดียว 0 / 17
  ยังต่ำอยู่: 37 จาก 100 ภาพ ตัวตรวจใบหน้าหาผู้สอบเองไม่เจอ และคนที่อยู่ไกลหรือถูกบังยังหลุด ต้องวัดในห้องจริง
  (รวมกรณีผู้สอบโต๊ะข้างเคียงติดในภาพ) ในโครงการนำร่อง
- **เจ้าของตัดสินใจแล้ว (10 พ.ย. 2569):** (1) ไฟล์ที่ใช้วัดผลเท่านั้น 15.5 MiB (MediaPipe ชุดที่สอง 1.2.2 + โมเดล full-range ทั้งคู่
  Apache-2.0) **ย้ายออกจาก repo** ไปเก็บที่ `~/LENSIQ-field/evals/exam-followups/vendor/` (ข้อ 7.3 มีที่เก็บ sha256 และสัญญาอนุญาต)
  (2) ชุดนำร่องนำด้วยโหมด B และยอมรับว่าโหมด B ยังส่งสดไปแดชบอร์ดบนเครื่องอื่นไม่ได้ (3) ตัวเลือก "นับใบหน้า (ทดลอง)" ในหน้าเครื่องกล้อง
  คงไว้พร้อมป้าย (4) สัญญาณ "มากกว่าหนึ่งคน" ของโหมด B ต้องบอกตัวเลขที่วัดได้ 28.8 % (15 / 52) และบอกว่าเป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน
  (5) คู่มือวางกล้องห้องสอบให้ใบหน้ากว้าง ≥ 48 px อยู่ใน `docs/EXAM.md` (เป็นการคำนวณ ยังไม่ได้วัด)
- **ยังรอเจ้าของ:** ทางไปต่อของใบหน้าเล็ก (ข้อ 7.1 ท้ายข้อ) และการทดสอบกล้อง 4K ในห้องจริง
- **หมายเหตุกระบวนการ (ตรงไปตรงมา):** ตารางชุดทดสอบแยกถูกพิมพ์ทุกครั้งที่รัน รวมรอบที่ 1 ที่ทิ้งไป การเลือกค่าทำโดยกฎตายตัวบนชุดเลือกค่า
  เท่านั้น แต่รอบนี้ **พิสูจน์จาก git ไม่ได้** ว่าข้อ 6 ถูกเขียนก่อนการปรับค่า (รายละเอียดในหมายเหตุกระบวนการของข้อ 7)
- รูปภาพทดสอบ 280 ภาพถูกลบแล้ว (ข้อ 7.4) เหลือเฉพาะรายการ เครดิต และตัวเลข

### 7.1 Hall: small faces in the 1,280 × 720 view

#### Hall options (dev)

| Option | 16 – 24 px | 24 – 48 px | 48 – 64 px | > 64 px | FP / frame (frames with FP) | H0 FP | ms median x1 / x4 | fps x4 (emulated) |
|---|---|---|---|---|---|---|---|---|
| (a) Face Landmarker numFaces 4 @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 3 / 43 = 7.0 % [2.4 % – 18.6 %] | 0.000 (0 / 67 = 0.0 % [0.0 % – 5.4 %]) | 0 / 14 | 26.3 / 25.6 | 39.1 |
| (a) Face Landmarker numFaces 4 @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 1 / 43 = 2.3 % [0.4 % – 12.1 %] | 0.015 (1 / 67 = 1.5 % [0.3 % – 8.0 %]) | 0 / 14 | 25.6 / 58.3 | 17.2 |
| (a) Face Landmarker numFaces 8 @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 3 / 43 = 7.0 % [2.4 % – 18.6 %] | 0.000 (0 / 67 = 0.0 % [0.0 % – 5.4 %]) | 0 / 14 | 15.9 / 25.1 | 39.8 |
| (a) Face Landmarker numFaces 8 @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 1 / 43 = 2.3 % [0.4 % – 12.1 %] | 0.015 (1 / 67 = 1.5 % [0.3 % – 8.0 %]) | 0 / 14 | 31.3 / 52.6 | 19.0 |
| (a-det) short-range detector, whole frame @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 5 / 43 = 11.6 % [5.1 % – 24.5 %] | 0.104 (6 / 67 = 9.0 % [4.2 % – 18.2 %]) | 0 / 14 | 19.6 / 41.4 | 24.2 |
| (c) short-range, 2×2 tiles + whole @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 8 / 95 = 8.4 % [4.3 % – 15.7 %] | 24 / 43 = 55.8 % [41.1 % – 69.6 %] | 0.343 (18 / 67 = 26.9 % [17.7 % – 38.5 %]) | 4 / 14 | 102.8 / 142.2 | 7.0 |
| (c) short-range, 3×3 tiles + whole @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 20 / 207 = 9.7 % [6.3 % – 14.5 %] | 55 / 95 = 57.9 % [47.8 % – 67.3 %] | 34 / 43 = 79.1 % [64.8 % – 88.6 %] | 0.657 (32 / 67 = 47.8 % [36.3 % – 59.5 %]) | 6 / 14 | 134.9 / 238.0 | 4.2 |
| (a-det) short-range detector, whole frame @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 0 / 95 = 0.0 % [0.0 % – 3.9 %] | 6 / 43 = 14.0 % [6.6 % – 27.3 %] | 0.493 (26 / 67 = 38.8 % [28.0 % – 50.8 %]) | 4 / 14 | 16.9 / 23.8 | 42.0 |
| (c) short-range, 2×2 tiles + whole @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 0 / 207 = 0.0 % [0.0 % – 1.8 %] | 15 / 95 = 15.8 % [9.8 % – 24.4 %] | 32 / 43 = 74.4 % [59.8 % – 85.1 %] | 1.567 (52 / 67 = 77.6 % [66.3 % – 85.9 %]) | 20 / 14 | 70.1 / 151.0 | 6.6 |
| (c) short-range, 3×3 tiles + whole @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 41 / 207 = 19.8 % [14.9 % – 25.8 %] | 71 / 95 = 74.7 % [65.2 % – 82.4 %] | 37 / 43 = 86.0 % [72.7 % – 93.4 %] | 2.642 (60 / 67 = 89.6 % [80.0 % – 94.8 %]) | 30 / 14 | 95.8 / 310.7 | 3.2 |
| (b) full-range, whole frame @0.5 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 19 / 207 = 9.2 % [6.0 % – 13.9 %] | 51 / 95 = 53.7 % [43.7 % – 63.4 %] | 32 / 43 = 74.4 % [59.8 % – 85.1 %] | 0.104 (7 / 67 = 10.4 % [5.2 % – 20.0 %]) | 2 / 14 | 24.8 / 63.6 | 15.7 |
| (d) full-range, 2×2 tiles + whole @0.5 | 4 / 53 = 7.5 % [3.0 % – 17.9 %] | 91 / 207 = 44.0 % [37.4 % – 50.8 %] | 75 / 95 = 78.9 % [69.7 % – 85.9 %] | 37 / 43 = 86.0 % [72.7 % – 93.4 %] | 0.284 (14 / 67 = 20.9 % [12.9 % – 32.1 %]) | 8 / 14 | 90.3 / 300.8 | 3.3 |
| (d) full-range, 3×3 tiles + whole @0.5 | 16 / 53 = 30.2 % [19.5 % – 43.5 %] | 136 / 207 = 65.7 % [59.0 % – 71.8 %] | 82 / 95 = 86.3 % [78.0 % – 91.8 %] | 38 / 43 = 88.4 % [75.5 % – 94.9 %] | 0.403 (21 / 67 = 31.3 % [21.5 % – 43.2 %]) | 7 / 14 | 208.8 / 450.4 | 2.2 |
| (b) full-range, whole frame @0.3 | 0 / 53 = 0.0 % [0.0 % – 6.8 %] | 42 / 207 = 20.3 % [15.4 % – 26.3 %] | 66 / 95 = 69.5 % [59.6 % – 77.8 %] | 36 / 43 = 83.7 % [70.0 % – 91.9 %] | 0.910 (34 / 67 = 50.7 % [39.1 % – 62.3 %]) | 17 / 14 | 27.4 / 46.9 | 21.3 |
| (d) full-range, 2×2 tiles + whole @0.3 | 9 / 53 = 17.0 % [9.2 % – 29.2 %] | 133 / 207 = 64.3 % [57.5 % – 70.5 %] | 83 / 95 = 87.4 % [79.2 % – 92.6 %] | 38 / 43 = 88.4 % [75.5 % – 94.9 %] | 2.194 (52 / 67 = 77.6 % [66.3 % – 85.9 %]) | 50 / 14 | 132.2 / 254.2 | 3.9 |
| (d) full-range, 3×3 tiles + whole @0.3 | 23 / 53 = 43.4 % [31.0 % – 56.7 %] | 162 / 207 = 78.3 % [72.2 % – 83.3 %] | 87 / 95 = 91.6 % [84.3 % – 95.7 %] | 40 / 43 = 93.0 % [81.4 % – 97.6 %] | 2.776 (59 / 67 = 88.1 % [78.2 % – 93.8 %]) | 55 / 14 | 197.2 / 456.3 | 2.2 |

Pick (rule §6.5): **(a) Face Landmarker numFaces 8 @0.5**

#### Hall options (held-out)

| Option | 16 – 24 px | 24 – 48 px | 48 – 64 px | > 64 px | FP / frame (frames with FP) | H0 FP |
|---|---|---|---|---|---|---|
| (a) Face Landmarker numFaces 4 @0.5 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 4 / 38 = 10.5 % [4.2 % – 24.1 %] | 0.016 (1 / 63 = 1.6 % [0.3 % – 8.5 %]) | 0 / 16 |
| (a) Face Landmarker numFaces 4 @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 4 / 38 = 10.5 % [4.2 % – 24.1 %] | 0.016 (1 / 63 = 1.6 % [0.3 % – 8.5 %]) | 0 / 16 |
| (a) Face Landmarker numFaces 8 @0.5 **(picked)** | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 4 / 38 = 10.5 % [4.2 % – 24.1 %] | 0.016 (1 / 63 = 1.6 % [0.3 % – 8.5 %]) | 0 / 16 |
| (a) Face Landmarker numFaces 8 @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 4 / 38 = 10.5 % [4.2 % – 24.1 %] | 0.016 (1 / 63 = 1.6 % [0.3 % – 8.5 %]) | 0 / 16 |
| (a-det) short-range detector, whole frame @0.5 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 4 / 38 = 10.5 % [4.2 % – 24.1 %] | 0.143 (8 / 63 = 12.7 % [6.6 % – 23.1 %]) | 1 / 16 |
| (c) short-range, 2×2 tiles + whole @0.5 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 2 / 195 = 1.0 % [0.3 % – 3.7 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 25 / 38 = 65.8 % [49.9 % – 78.8 %] | 0.429 (20 / 63 = 31.7 % [21.6 % – 44.0 %]) | 3 / 16 |
| (c) short-range, 3×3 tiles + whole @0.5 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 23 / 195 = 11.8 % [8.0 % – 17.1 %] | 14 / 37 = 37.8 % [24.1 % – 53.9 %] | 29 / 38 = 76.3 % [60.8 % – 87.0 %] | 0.603 (29 / 63 = 46.0 % [34.3 % – 58.2 %]) | 6 / 16 |
| (a-det) short-range detector, whole frame @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 0 / 195 = 0.0 % [0.0 % – 1.9 %] | 0 / 37 = 0.0 % [0.0 % – 9.4 %] | 6 / 38 = 15.8 % [7.4 % – 30.4 %] | 0.476 (23 / 63 = 36.5 % [25.7 % – 48.9 %]) | 2 / 16 |
| (c) short-range, 2×2 tiles + whole @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 4 / 195 = 2.1 % [0.8 % – 5.2 %] | 2 / 37 = 5.4 % [1.5 % – 17.7 %] | 29 / 38 = 76.3 % [60.8 % – 87.0 %] | 1.810 (48 / 63 = 76.2 % [64.4 % – 85.0 %]) | 11 / 16 |
| (c) short-range, 3×3 tiles + whole @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 37 / 195 = 19.0 % [14.1 % – 25.1 %] | 19 / 37 = 51.4 % [35.9 % – 66.6 %] | 33 / 38 = 86.8 % [72.7 % – 94.2 %] | 2.429 (56 / 63 = 88.9 % [78.8 % – 94.5 %]) | 34 / 16 |
| (b) full-range, whole frame @0.5 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 28 / 195 = 14.4 % [10.1 % – 20.0 %] | 6 / 37 = 16.2 % [7.7 % – 31.1 %] | 27 / 38 = 71.1 % [55.2 % – 83.0 %] | 0.111 (6 / 63 = 9.5 % [4.4 % – 19.3 %]) | 2 / 16 |
| (d) full-range, 2×2 tiles + whole @0.5 | 2 / 32 = 6.3 % [1.7 % – 20.1 %] | 88 / 195 = 45.1 % [38.3 % – 52.1 %] | 22 / 37 = 59.5 % [43.5 % – 73.7 %] | 36 / 38 = 94.7 % [82.7 % – 98.5 %] | 0.270 (14 / 63 = 22.2 % [13.7 % – 33.9 %]) | 5 / 16 |
| (d) full-range, 3×3 tiles + whole @0.5 | 6 / 32 = 18.8 % [8.9 % – 35.3 %] | 122 / 195 = 62.6 % [55.6 % – 69.1 %] | 29 / 37 = 78.4 % [62.8 % – 88.6 %] | 35 / 38 = 92.1 % [79.2 % – 97.3 %] | 0.397 (16 / 63 = 25.4 % [16.3 % – 37.3 %]) | 9 / 16 |
| (b) full-range, whole frame @0.3 | 0 / 32 = 0.0 % [0.0 % – 10.7 %] | 46 / 195 = 23.6 % [18.2 % – 30.0 %] | 14 / 37 = 37.8 % [24.1 % – 53.9 %] | 36 / 38 = 94.7 % [82.7 % – 98.5 %] | 0.667 (28 / 63 = 44.4 % [32.8 % – 56.7 %]) | 9 / 16 |
| (d) full-range, 2×2 tiles + whole @0.3 | 7 / 32 = 21.9 % [11.0 % – 38.8 %] | 112 / 195 = 57.4 % [50.4 % – 64.2 %] | 32 / 37 = 86.5 % [72.0 % – 94.1 %] | 37 / 38 = 97.4 % [86.5 % – 99.5 %] | 1.698 (48 / 63 = 76.2 % [64.4 % – 85.0 %]) | 27 / 16 |
| (d) full-range, 3×3 tiles + whole @0.3 | 11 / 32 = 34.4 % [20.4 % – 51.7 %] | 140 / 195 = 71.8 % [65.1 % – 77.6 %] | 33 / 37 = 89.2 % [75.3 % – 95.7 %] | 37 / 38 = 97.4 % [86.5 % – 99.5 %] | 2.429 (50 / 63 = 79.4 % [67.8 % – 87.5 %]) | 41 / 16 |

#### Hall options (all)

| Option | 16 – 24 px | 24 – 48 px | 48 – 64 px | > 64 px | FP / frame (frames with FP) | H0 FP |
|---|---|---|---|---|---|---|
| (a) Face Landmarker numFaces 4 @0.5 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 7 / 81 = 8.6 % [4.2 % – 16.8 %] | 0.008 (1 / 130 = 0.8 % [0.1 % – 4.2 %]) | 0 / 30 |
| (a) Face Landmarker numFaces 4 @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 5 / 81 = 6.2 % [2.7 % – 13.6 %] | 0.015 (2 / 130 = 1.5 % [0.4 % – 5.4 %]) | 0 / 30 |
| (a) Face Landmarker numFaces 8 @0.5 **(picked)** | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 7 / 81 = 8.6 % [4.2 % – 16.8 %] | 0.008 (1 / 130 = 0.8 % [0.1 % – 4.2 %]) | 0 / 30 |
| (a) Face Landmarker numFaces 8 @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 5 / 81 = 6.2 % [2.7 % – 13.6 %] | 0.015 (2 / 130 = 1.5 % [0.4 % – 5.4 %]) | 0 / 30 |
| (a-det) short-range detector, whole frame @0.5 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 9 / 81 = 11.1 % [6.0 % – 19.8 %] | 0.123 (14 / 130 = 10.8 % [6.5 % – 17.3 %]) | 1 / 30 |
| (c) short-range, 2×2 tiles + whole @0.5 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 2 / 402 = 0.5 % [0.1 % – 1.8 %] | 8 / 132 = 6.1 % [3.1 % – 11.5 %] | 49 / 81 = 60.5 % [49.6 % – 70.4 %] | 0.385 (38 / 130 = 29.2 % [22.1 % – 37.6 %]) | 7 / 30 |
| (c) short-range, 3×3 tiles + whole @0.5 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 43 / 402 = 10.7 % [8.0 % – 14.1 %] | 69 / 132 = 52.3 % [43.8 % – 60.6 %] | 63 / 81 = 77.8 % [67.6 % – 85.5 %] | 0.631 (61 / 130 = 46.9 % [38.6 % – 55.5 %]) | 12 / 30 |
| (a-det) short-range detector, whole frame @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 0 / 402 = 0.0 % [0.0 % – 0.9 %] | 0 / 132 = 0.0 % [0.0 % – 2.8 %] | 12 / 81 = 14.8 % [8.7 % – 24.1 %] | 0.485 (49 / 130 = 37.7 % [29.8 % – 46.3 %]) | 6 / 30 |
| (c) short-range, 2×2 tiles + whole @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 4 / 402 = 1.0 % [0.4 % – 2.5 %] | 17 / 132 = 12.9 % [8.2 % – 19.7 %] | 61 / 81 = 75.3 % [64.9 % – 83.4 %] | 1.685 (100 / 130 = 76.9 % [69.0 % – 83.3 %]) | 31 / 30 |
| (c) short-range, 3×3 tiles + whole @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 78 / 402 = 19.4 % [15.8 % – 23.6 %] | 90 / 132 = 68.2 % [59.8 % – 75.5 %] | 70 / 81 = 86.4 % [77.3 % – 92.2 %] | 2.538 (116 / 130 = 89.2 % [82.7 % – 93.5 %]) | 64 / 30 |
| (b) full-range, whole frame @0.5 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 47 / 402 = 11.7 % [8.9 % – 15.2 %] | 57 / 132 = 43.2 % [35.0 % – 51.7 %] | 59 / 81 = 72.8 % [62.3 % – 81.3 %] | 0.108 (13 / 130 = 10.0 % [5.9 % – 16.4 %]) | 4 / 30 |
| (d) full-range, 2×2 tiles + whole @0.5 | 6 / 85 = 7.1 % [3.3 % – 14.6 %] | 179 / 402 = 44.5 % [39.7 % – 49.4 %] | 97 / 132 = 73.5 % [65.4 % – 80.3 %] | 73 / 81 = 90.1 % [81.7 % – 94.9 %] | 0.277 (28 / 130 = 21.5 % [15.3 % – 29.4 %]) | 13 / 30 |
| (d) full-range, 3×3 tiles + whole @0.5 | 22 / 85 = 25.9 % [17.8 % – 36.1 %] | 258 / 402 = 64.2 % [59.4 % – 68.7 %] | 111 / 132 = 84.1 % [76.9 % – 89.4 %] | 73 / 81 = 90.1 % [81.7 % – 94.9 %] | 0.400 (37 / 130 = 28.5 % [21.4 % – 36.7 %]) | 16 / 30 |
| (b) full-range, whole frame @0.3 | 0 / 85 = 0.0 % [0.0 % – 4.3 %] | 88 / 402 = 21.9 % [18.1 % – 26.2 %] | 80 / 132 = 60.6 % [52.1 % – 68.5 %] | 72 / 81 = 88.9 % [80.2 % – 94.0 %] | 0.792 (62 / 130 = 47.7 % [39.3 % – 56.2 %]) | 26 / 30 |
| (d) full-range, 2×2 tiles + whole @0.3 | 16 / 85 = 18.8 % [11.9 % – 28.4 %] | 245 / 402 = 60.9 % [56.1 % – 65.6 %] | 115 / 132 = 87.1 % [80.3 % – 91.8 %] | 75 / 81 = 92.6 % [84.8 % – 96.6 %] | 1.954 (100 / 130 = 76.9 % [69.0 % – 83.3 %]) | 77 / 30 |
| (d) full-range, 3×3 tiles + whole @0.3 | 34 / 85 = 40.0 % [30.2 % – 50.6 %] | 302 / 402 = 75.1 % [70.7 % – 79.1 %] | 120 / 132 = 90.9 % [84.8 % – 94.7 %] | 77 / 81 = 95.1 % [88.0 % – 98.1 %] | 2.608 (109 / 130 = 83.8 % [76.6 % – 89.2 %]) | 96 / 30 |

#### Hall speed (ms per 1280 × 720 frame, face pass alone; latency subset n = 40 HB frames)

| Option | x1 median / p90 | fps x1 | x4 (emulated mid-range) median / p90 | fps x4 |
|---|---|---|---|---|
| (a) Face Landmarker numFaces 4 @0.5 | 26.3 / 47.8 | 38.0 | 25.6 / 65.8 | 39.1 |
| (a) Face Landmarker numFaces 4 @0.3 | 25.6 / 50.5 | 39.1 | 58.3 / 130.9 | 17.2 |
| (a) Face Landmarker numFaces 8 @0.5 | 15.9 / 28.0 | 62.9 | 25.1 / 77.4 | 39.8 |
| (a) Face Landmarker numFaces 8 @0.3 | 31.3 / 43.5 | 31.9 | 52.6 / 107.4 | 19.0 |
| (a-det) short-range detector, whole frame @0.5 | 19.6 / 27.4 | 51.0 | 41.4 / 60.6 | 24.2 |
| (c) short-range, 2×2 tiles + whole @0.5 | 102.8 / 118.8 | 9.7 | 142.2 / 224.9 | 7.0 |
| (c) short-range, 3×3 tiles + whole @0.5 | 134.9 / 215.2 | 7.4 | 238.0 / 368.9 | 4.2 |
| (a-det) short-range detector, whole frame @0.3 | 16.9 / 19.9 | 59.2 | 23.8 / 43.1 | 42.0 |
| (c) short-range, 2×2 tiles + whole @0.3 | 70.1 / 79.5 | 14.3 | 151.0 / 208.8 | 6.6 |
| (c) short-range, 3×3 tiles + whole @0.3 | 95.8 / 109.1 | 10.4 | 310.7 / 489.0 | 3.2 |
| (b) full-range, whole frame @0.5 | 24.8 / 29.3 | 40.3 | 63.6 / 72.9 | 15.7 |
| (d) full-range, 2×2 tiles + whole @0.5 | 90.3 / 132.2 | 11.1 | 300.8 / 367.5 | 3.3 |
| (d) full-range, 3×3 tiles + whole @0.5 | 208.8 / 222.1 | 4.8 | 450.4 / 543.9 | 2.2 |
| (b) full-range, whole frame @0.3 | 27.4 / 36.0 | 36.5 | 46.9 / 52.3 | 21.3 |
| (d) full-range, 2×2 tiles + whole @0.3 | 132.2 / 146.7 | 7.6 | 254.2 / 296.9 | 3.9 |
| (d) full-range, 3×3 tiles + whole @0.3 | 197.2 / 229.2 | 5.1 | 456.3 / 499.3 | 2.2 |
| COCO-SSD persons + phones (hall page call) | 388.4 / 474.5 | 2.6 | 442.4 / 624.5 | 2.3 |

**Result against the fixed rule (§6.5).**

- Only the four Face Landmarker variants (a) stay within both limits (≤ 0.05 false positives per frame and ≥ 5 fps on the
  emulated mid-range laptop). All four find **0 / 207** faces 24 – 48 px wide on dev, so the rule's tie-break (higher
  emulated fps) decides: **(a) Face Landmarker, numFaces 8, detection 0.5** (39.8 fps emulated, against 39.1 fps for
  numFaces 4 @0.5: a difference inside the timing noise stated above, so the tie-break does not show that 8 is better
  than 4; both are the current engine with the same recall). Held-out for that pick:
  **0 / 195 = 0.0 % [0.0 % – 1.9 %]** of faces 24 – 48 px wide, 0 / 37 at 48 – 64 px, 4 / 38 = 10.5 % above 64 px,
  0.016 false positives per frame.
- **So the rule returns the current engine and the small-face issue is not fixed.** Raising `numFaces` from 4 to 8 does
  not help: the cap was never the reason; the short-range detector does not see faces this small in a wide frame.
- Every option that does find small faces breaks at least one limit:

| Option | 24 – 48 px recall, dev | held-out | False positives per frame, dev / held-out (limit 0.05) | fps emulated mid-range laptop (limit 5) | fps unthrottled M1 |
|---|---|---|---|---|---|
| (b) full-range, whole frame @0.5 | 9.2 % | 14.4 % | 0.104 / 0.111 | 15.7 | 40.3 |
| (c) short-range, 3 × 3 tiles @0.5 | 9.7 % | 11.8 % | 0.657 / 0.603 | 4.2 | 7.4 |
| (d) full-range, 2 × 2 tiles @0.5 | 44.0 % | 45.1 % | 0.284 / 0.270 | 3.3 | 11.1 |
| (d) full-range, 3 × 3 tiles @0.5 (**best measured at 0.5**) | 65.7 % | **122 / 195 = 62.6 % [55.6 % – 69.1 %]** | 0.403 / 0.397 | 2.2 | 4.8 |
| (d) full-range, 3 × 3 tiles @0.3 (highest recall) | 78.3 % | 71.8 % | 2.776 / 2.429 | 2.2 | 5.1 |

- False positives are partly a labelling effect: Open Images does not box every face, so a correct detection of an
  unlabelled face counts as false. But the no-person frames (H0) have no faces at all, and (d) 3 × 3 @0.5 still drew 16
  false boxes on 30 of them (dev 7 / 14 frames, held-out 9 / 16), so 0.4 per frame is not only a labelling effect.
- The hall page also runs COCO-SSD for persons and phones: 388 ms per frame here unthrottled (2.6 fps), 442 ms throttled
  4×. Adding (d) 3 × 3 on top (209 ms / 450 ms) would bring the whole loop to about 1.7 fps unthrottled and about 1.1 fps
  on the emulated laptop; the page's lowest setting is 2 frames per second.

**What was built for the hall.** The setting "count faces (experimental)" on `exam-hall.html` (off by default, remembered
per device) runs the rule's pick, `LQExamFace.createHallFaces()` = Face Landmarker, numFaces 8, detection 0.5, boxes only
(no pose, no landmarks leave the engine; boxes are drawn and counted on that device, no event, nothing sent). Its label
says that small or distant faces are not found. No page loads the full-range model. **Hall mode stays "experimental"**
(owner decision); the page, the Exam landing page, the category page, the solutions catalogue, the one-pager and the
sales packages say so in Thai, English and Chinese.

**Ways forward for the small-face issue (not built; for the owner to choose).** (1) Accept a lower frame rate for the
face pass only: run (d) on a rotating tile schedule (one or two tiles per frame) and state the refresh time; needs a new
rule and a new held-out set. (2) Measure on real hall footage in the pilot: seated candidates facing the camera at known
distances may be easier or harder than these group photographs, and the false-positive count would be measured against
complete labels. (3) Camera placement: with 1,280 px across and a 60 – 70° lens, a face 16 cm wide is
48 px wide at about 3 – 3.7 m and 64 px wide at about 2.3 – 2.8 m (geometry, not measured). Placement alone does not fix
it: even above 64 px the current engine found only 7 / 81 faces in these wide frames, so it would have to be combined
with the full-range detector on the whole frame ((b) @0.5: 59 / 81 = 72.8 % above 64 px at 15.7 fps emulated, but 0.108
false positives per frame, still over the limit). (4) A different Apache-2.0 / MIT detector made for small faces (for example YuNet, MIT, or
SCRFD under its own licence check) on the ONNX runtime already vendored: needs a licence check of weights and training
data first.

### 7.2 Lab: a second person behind or beside the candidate

#### Lab multi-person (dev)

| Option | multi-person recall (M2 + M3) | false alarm (M1) | added ms median |
|---|---|---|---|
| OLD | 4 / 48 = 8.3 % [3.3 % – 19.6 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 0.0 |
| N1 | 5 / 48 = 10.4 % [4.5 % – 22.2 %] | 1 / 33 = 3.0 % [0.5 % – 15.3 %] | 0.0 |
| N2@0.5 | 10 / 48 = 20.8 % [11.7 % – 34.3 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 21.3 |
| N2@0.3 | 11 / 48 = 22.9 % [13.3 % – 36.5 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 12.2 |
| N3@0.5 | 12 / 48 = 25.0 % [14.9 % – 38.8 %] | 6 / 33 = 18.2 % [8.6 % – 34.4 %] | 47.0 |
| N3@0.3 | 20 / 48 = 41.7 % [28.8 % – 55.7 %] | 16 / 33 = 48.5 % [32.5 % – 64.8 %] | 33.4 |
| N4@0.5 | 15 / 48 = 31.3 % [19.9 % – 45.3 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 0.0 |
| N4@0.6 | 14 / 48 = 29.2 % [18.2 % – 43.2 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 0.0 |
| N5 | 15 / 48 = 31.3 % [19.9 % – 45.3 %] | 0 / 33 = 0.0 % [0.0 % – 10.4 %] | 21.3 |

Pick (rule §6.8): **N4@0.5**

#### Lab multi-person (held-out)

| Option | multi-person recall | M2 second face | M3 second person, no face box | false alarm (M1) |
|---|---|---|---|---|
| OLD | 5 / 52 = 9.6 % [4.2 % – 20.6 %] | 5 / 25 = 20.0 % [8.9 % – 39.1 %] | 0 / 27 = 0.0 % [0.0 % – 12.5 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| N1 | 7 / 52 = 13.5 % [6.7 % – 25.3 %] | 5 / 25 = 20.0 % [8.9 % – 39.1 %] | 2 / 27 = 7.4 % [2.1 % – 23.4 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| N2@0.5 | 10 / 52 = 19.2 % [10.8 % – 31.9 %] | 9 / 25 = 36.0 % [20.2 % – 55.5 %] | 1 / 27 = 3.7 % [0.7 % – 18.3 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| N2@0.3 | 13 / 52 = 25.0 % [15.2 % – 38.2 %] | 11 / 25 = 44.0 % [26.7 % – 62.9 %] | 2 / 27 = 7.4 % [2.1 % – 23.4 %] | 1 / 17 = 5.9 % [1.0 % – 27.0 %] |
| N3@0.5 | 15 / 52 = 28.8 % [18.3 % – 42.3 %] | 12 / 25 = 48.0 % [30.0 % – 66.5 %] | 3 / 27 = 11.1 % [3.9 % – 28.1 %] | 2 / 17 = 11.8 % [3.3 % – 34.3 %] |
| N3@0.3 | 26 / 52 = 50.0 % [36.9 % – 63.1 %] | 16 / 25 = 64.0 % [44.5 % – 79.8 %] | 10 / 27 = 37.0 % [21.5 % – 55.8 %] | 7 / 17 = 41.2 % [21.6 % – 64.0 %] |
| N4@0.5 **(picked)** | 15 / 52 = 28.8 % [18.3 % – 42.3 %] | 11 / 25 = 44.0 % [26.7 % – 62.9 %] | 4 / 27 = 14.8 % [5.9 % – 32.5 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| N4@0.6 | 12 / 52 = 23.1 % [13.7 % – 36.1 %] | 10 / 25 = 40.0 % [23.4 % – 59.3 %] | 2 / 27 = 7.4 % [2.1 % – 23.4 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| N5 | 14 / 52 = 26.9 % [16.8 % – 40.3 %] | 11 / 25 = 44.0 % [26.7 % – 62.9 %] | 3 / 27 = 11.1 % [3.9 % – 28.1 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |

#### Lab multi-person (all)

| Option | multi-person recall | M2 second face | M3 second person, no face box | false alarm (M1) |
|---|---|---|---|---|
| OLD | 9 / 100 = 9.0 % [4.8 % – 16.2 %] | 9 / 60 = 15.0 % [8.1 % – 26.1 %] | 0 / 40 = 0.0 % [0.0 % – 8.8 %] | 0 / 50 = 0.0 % [0.0 % – 7.1 %] |
| N1 | 12 / 100 = 12.0 % [7.0 % – 19.8 %] | 10 / 60 = 16.7 % [9.3 % – 28.0 %] | 2 / 40 = 5.0 % [1.4 % – 16.5 %] | 1 / 50 = 2.0 % [0.4 % – 10.5 %] |
| N2@0.5 | 20 / 100 = 20.0 % [13.3 % – 28.9 %] | 19 / 60 = 31.7 % [21.3 % – 44.2 %] | 1 / 40 = 2.5 % [0.4 % – 12.9 %] | 0 / 50 = 0.0 % [0.0 % – 7.1 %] |
| N2@0.3 | 24 / 100 = 24.0 % [16.7 % – 33.2 %] | 21 / 60 = 35.0 % [24.2 % – 47.6 %] | 3 / 40 = 7.5 % [2.6 % – 19.9 %] | 1 / 50 = 2.0 % [0.4 % – 10.5 %] |
| N3@0.5 | 27 / 100 = 27.0 % [19.3 % – 36.4 %] | 24 / 60 = 40.0 % [28.6 % – 52.6 %] | 3 / 40 = 7.5 % [2.6 % – 19.9 %] | 8 / 50 = 16.0 % [8.3 % – 28.5 %] |
| N3@0.3 | 46 / 100 = 46.0 % [36.6 % – 55.7 %] | 30 / 60 = 50.0 % [37.7 % – 62.3 %] | 16 / 40 = 40.0 % [26.3 % – 55.4 %] | 23 / 50 = 46.0 % [33.0 % – 59.6 %] |
| N4@0.5 **(picked)** | 30 / 100 = 30.0 % [21.9 % – 39.6 %] | 23 / 60 = 38.3 % [27.1 % – 51.0 %] | 7 / 40 = 17.5 % [8.7 % – 31.9 %] | 0 / 50 = 0.0 % [0.0 % – 7.1 %] |
| N4@0.6 | 26 / 100 = 26.0 % [18.4 % – 35.4 %] | 22 / 60 = 36.7 % [25.6 % – 49.3 %] | 4 / 40 = 10.0 % [4.0 % – 23.1 %] | 0 / 50 = 0.0 % [0.0 % – 7.1 %] |
| N5 | 29 / 100 = 29.0 % [21.0 % – 38.5 %] | 24 / 60 = 40.0 % [28.6 % – 52.6 %] | 5 / 40 = 12.5 % [5.5 % – 26.1 %] | 0 / 50 = 0.0 % [0.0 % – 7.1 %] |

#### Lab miss analysis (OLD, dev + held-out, M2 by the largest second face's width in the 640 × 480 frame)

| Second face | frames | OLD read ≥ 2 | N1 (det 0.3) | N2@0.5 | N3@0.5 | N4@0.6 | second face occluded / truncated |
|---|---|---|---|---|---|---|---|
| 16 – 32 px | 2 | 0 | 0 | 0 | 0 | 1 | 0 / 0 of 2 other faces |
| 32 – 64 px | 28 | 0 | 0 | 4 | 8 | 5 | 20 / 5 of 37 other faces |
| > 64 px | 30 | 9 | 10 | 15 | 16 | 16 | 16 / 1 of 40 other faces |
| M3 (no second face box) | 40 | 0 | 2 | 1 | 3 | 4 | – |

Frames with a second person where OLD found no face at all (the candidate missed too): 37 / 100
Lab timing per 640 × 480 frame, median ms (x1): OLD Face Landmarker 34.1 · full-range pass 24.0 · 2 × 2 short-range tiles 54.1 · COCO-SSD 339.3

Machine: {"ua":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36","webgl2":true,"cpu":"Apple M1","cores":8,"ramGB":8,"os":"darwin 25.5.0","tf":"webgl"}

**Result against the fixed rule (§6.8).** On dev, **N4@0.5** has the highest multi-person recall among the options within
the limits (false alarms ≤ 5 % and at most one more than OLD on dev M1; added time ≤ 50 ms): 15 / 48 = 31.3 % against
4 / 48 = 8.3 % for OLD, with 0 / 33 false alarms. N5 ties at 15 / 48 with the same false alarms but adds a face pass
(21.3 ms), so the tie-break (faster) keeps N4@0.5. N3 (short-range tiles) finds more but fails the false-alarm limit
(18.2 % and 48.5 % of one-person frames).

| Lab, held-out (never used to pick) | OLD (on `main`) | NEW = N4@0.5 (picked) |
|---|---|---|
| multi-person recall (M2 + M3) | 5 / 52 = 9.6 % [4.2 % – 20.6 %] | **15 / 52 = 28.8 % [18.3 % – 42.3 %]** |
| second face boxed (M2) | 5 / 25 = 20.0 % [8.9 % – 39.1 %] | 11 / 25 = 44.0 % [26.7 % – 62.9 %] |
| second person, face not boxed (M3) | 0 / 27 = 0.0 % [0.0 % – 12.5 %] | 4 / 27 = 14.8 % [5.9 % – 32.5 %] |
| false alarm on one-person frames (M1) | 0 / 17 = 0.0 % [0.0 % – 18.4 %] | 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| dev + held-out: recall / false alarm | 9 / 100 = 9.0 % / 0 / 50 | 30 / 100 = 30.0 % [21.9 % – 39.6 %] / 0 / 50 = 0.0 % [0.0 % – 7.1 %] |

The held-out intervals of OLD and NEW overlap (n = 52); on dev + held-out (n = 100) they do not. The false-alarm
interval is wide: 0 / 50 still allows up to 7.1 %.

**Why OLD misses (miss analysis, 100 frames with a second person).**

- On **37 / 100** frames the Face Landmarker found no face at all, not even the candidate's. These frames read as "no
  face", and N4 cannot help there by design (the person cue is used only while a face is seen, so that it never masks or
  replaces the no-face signal). They cap N4's recall at 63 %.
- Second face 32 – 64 px wide: OLD 0 / 28. These are the small faces of §7.1 again; 20 of the 37 other faces in this
  bucket are marked occluded. A lower detection confidence (N1) recovers none of them.
- Second face above 64 px: OLD 9 / 30; N4@0.6 16 / 30, N3@0.5 16 / 30, N2@0.5 15 / 30. 16 of the 40 other faces are
  marked occluded.
- A second person whose face is not boxed (turned away, cut by the frame; M3): OLD 0 / 40, N1 2 / 40; the person cue is
  the only option that reads bodies (N4@0.5 7 / 40).
- So the misses are mostly (a) the candidate not found, (b) small or occluded second faces, (c) people without a visible
  face; lowering the confidence threshold (N1) fixes almost none and costs one false alarm.

**What was built for the lab.** `exam-lab.js` decodes person boxes from the COCO-SSD inference it already runs on every
third frame (`LQDetect.detectCocoMulti`: one inference, two decodes, so phones and books are read exactly as before and
no model call is added); `LQExamFace.peopleBoxes` counts boxes with score ≥ 0.5, one per person at IoU ≥ 0.5 (the eval
uses the same function); `LQExam.createLabMonitor` raises "more than one person" on ≥ 2 faces **or** ≥ 1 face and ≥ 2
people, through the unchanged 3-of-5-frames, 3-second gate. The person count is used for at most 2 s after it was read.
Boxes are counted and dropped; nothing about them is stored or sent beyond the count already in the event (`n`). No
expression or facial-movement output is requested or read anywhere. The signal name on screen changed from "more than
one face" to "more than one person" in Thai, English and Chinese, and the candidate notice says "several faces or
another person in view".

Time: COCO-SSD alone took 339 ms per 640 × 480 frame here (SwiftShader); the page already paid that on every third frame
before this change, and the second decode adds no inference.

**Limits.** 30 % recall is still low: about two of three frames with a second person are not read as such from a single
frame (the page watches continuously, which this set cannot measure). Not measured: real lab rooms, where the person
behind may be another candidate at the next desk who is allowed to be there; the pilot must count how often "more than
one person" fires for neighbours (`docs/pilot/PILOT-EXAM.md`), and the invigilator decides. Skin tone: not measured.

### 7.3 Second MediaPipe bundle and the full-range model: needed for the measurement only, kept outside the repo

- Checked again (2026-11-10 16:50): the vendored 0.10.x bundle fails on the full-range model at the first `detect`
  ("raw_box_tensor->shape().dims[1] == num_boxes_ (2304 vs. 896)"); Tasks Vision 1.2.2 loads and runs it. So a second
  bundle (or an upgrade of the first) **is** needed to run this model through MediaPipe.
- Because no full-range option met the rule, **no page loads either file set** and no page script names a file in them
  (a unit test holds this).
- **Owner decision (2026-11-10): measurement-only files stay out of the repo.** The two folders (16,204,612 bytes,
  15.5 MiB with licence copies and READMEs) were moved, unchanged, from the working tree to
  **`~/LENSIQ-field/evals/exam-followups/vendor/`** (next to the locked set of §6.9), each with its `LICENSE` (Apache-2.0
  text) and `README.txt` (source URL, sha256, model-card scope). They were never committed. They are not shipped, so
  they have no row in `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt` or on `about.html`; this section is
  their record.

| File under `~/LENSIQ-field/evals/exam-followups/vendor/` | Bytes | sha256 | Source, licence |
|---|---|---|---|
| `mediapipe-1.2.2/vision_bundle.mjs` | 156,062 | `b65acb59b370cd6561afd9d04c29ed7a87e7ed6386922ac1b263af1f1ad06b7d` | npm `@mediapipe/tasks-vision@1.2.2` (published 2026-11-03, `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.2.tgz`), unchanged. **Apache-2.0** (package.json "license"), Copyright The MediaPipe Authors / Google LLC |
| `mediapipe-1.2.2/wasm/vision_wasm_internal.js` | 334,128 | `f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b` | as above |
| `mediapipe-1.2.2/wasm/vision_wasm_internal.wasm` | 14,603,354 | `f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab` | as above |
| `models/face-detector-full/blaze_face_full_range.tflite` | 1,083,786 | `3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b` | Google MediaPipe model zoo, `mediapipe-models/face_detector/blaze_face_full_range/float16/1`, unchanged. **Apache-2.0** per "MediaPipe BlazeFace Model Card (Full Range)" (2021-01-19), Copyright Google LLC / The MediaPipe Authors. Card scope (not a licence term): out of scope are counting people in a crowd, faces further than 5 m and "any form of surveillance or identity recognition"; the owner and the lawyer decide whether an exam hall fits before any product use |
| `mediapipe-1.2.2/LICENSE`, `models/face-detector-full/LICENSE` | 11,381 each | `34a208554e76284185a2abeb173eae508154a77c8af4c0f1389fcbb191173334` | Apache License 2.0 text |

- **How the tool finds them.** `tools/exam-hall-face-eval.mjs --run` (and `--load-check`, which only loads the
  full-range detector once in headless Chrome and needs no images) reads the folder given by `--vendor <dir>` or the
  environment variable `LQ_EXAM_EVAL_VENDOR`; the default is the path above. The tool serves that folder on the same
  origin as the page under `/__eval-vendor/`, checks the four sha256 above first, and stops with an error naming the
  missing or changed file and this section; it refuses a folder inside the repo. Checked after the move (2026-11-10):
  `--load-check` loads the full-range detector from the new place; with a wrong `--vendor` the tool exits with
  "missing file". The full run was **not** repeated after the move (the 280 images are deleted, §7.4); the numbers of
  this section are those of run 3.
- If the full-range detector is wanted in the product later, the choices are unchanged: upgrade the single vendored
  bundle to 1.2.2 instead of shipping two (about +5 MiB net, or less if the no-SIMD variant is dropped), which needs a
  regression run of every MediaPipe task in LENSIQ (hands, segmenters, Product Check face gate, Exam lab); or run the
  model on the ONNX runtime already vendored (needs a conversion and our own anchor decoding). Either brings the files
  back into the repo with licence rows at that time.

### 7.4 Image deletion record

- **Deleted: 2026-11-10 17:06:51 ICT (+07)**, `node tools/exam-hall-face-eval.mjs --cleanup`: "deleted 280 images in
  ~/LENSIQ-field/exam-faces-hall/images". Checked afterwards: no `.jpg` / `.jpeg` / `.png` under
  `~/LENSIQ-field/exam-faces-hall/` or `~/LENSIQ-field/evals/exam-followups/`, and no image file among the repo changes.
- Kept (numbers and text only), in `~/LENSIQ-field/evals/exam-followups/`: `manifest.jsonl`, `CREDITS.tsv` (hashes in
  §6.9), `results/examhall-2026-11-10.json` (run 3, per-frame boxes and timings; sha256 `260ccc19406b3f5bab219cba615a4b5272a1e2125b09c5d898331e43ca2f0ad6`),
  `results-tables.md` (the tables above, with every option), `run3.log`, and the discarded / interrupted runs
  (`run1-discarded.log`, `results-tables-run1-discarded.md`, `results/examhall-2026-11-10-run1-discarded.json`,
  `run2-interrupted.log`). The per-frame file holds box coordinates and scores, no pixels.
- To repeat the measurement: `--select` (downloads the same 280 images again), `--run`, `--cleanup`.


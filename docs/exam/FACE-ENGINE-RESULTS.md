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

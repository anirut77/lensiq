# Product Check — face blur before upload: fixed test set and measured numbers

Owner decision (2026-11-10), verbatim: "Face check: change from 'block' to 'blur'. Before any image upload, blur every
detected face region automatically, then send. No upload is blocked because of a face. Show the user the blurred preview
before sending. Product packaging often has printed faces, so blocking is the wrong behaviour. Measure on the public set:
share of uploads that keep the label text readable after blurring, and real-person faces left unblurred. Pick the
detector setting from those numbers."

Section 1 (the fixed test set, metrics, sweep and pick rule) was written **before** any blur setting was run or tuned.
Sections 2 onward hold the measured numbers.

## 1. Fixed test set and protocol (written before tuning, 2026-11-10)

### 1.1 Pack set (source: public dataset)

- The 281 public product photos of P2 (`~/LENSIQ-field/product-check/public-photos/manifest.jsonl`, Open Food Facts /
  Open Beauty Facts, 400 px, community-entered, unverified ground truth). The 11 pack-art images with printed / drawn
  people (`pack_art_person: true`) are part of these 281; they are also reported on their own.
- Upload simulation = the P2 pipeline: PP-OCRv5 det on the whole picture -> auto crop (`LQPC.cropFromBoxes`) -> the crop
  at upload resolution (long side <= 1,024 px; these photos are smaller, so the crop keeps its size).
- Images stay outside the repo.

### 1.2 Real-face set (source: public dataset)

- **Open Images V7, validation split** (Google LLC). Licence page checked 2026-11-10
  (<https://storage.googleapis.com/openimages/web/factsfigures_v7.html#licenses>): "The annotations are licensed by Google
  LLC under CC BY 4.0 license. The images are listed as having a CC BY 2.0 license." Google adds that it makes no
  warranty on each image's licence, so every selected image's own `License` field must be the CC BY 2.0 URL; the author,
  the Flickr page and the licence of each image are recorded in `~/LENSIQ-field/face-blur/CREDITS.tsv`.
  Boxes: `validation-annotations-bbox.csv` (the V7 download page links the v5 file); image list:
  `validation-images-with-rotation.csv`. Images from the Open Images S3 mirror.
- Not used: WIDER FACE, CelebA, FDDB or any set that is non-commercial or has an unclear licence.
- Kept in `~/LENSIQ-field/face-blur/` (outside the repo). **No image of a person is committed.**
- Selection (deterministic, before tuning):
  - eligible: at least one `Human face` box (`/m/0dzct`); no face box with `IsGroupOf = 1` (a group box cannot be
    scored per face); no face box with `IsDepiction = 1` (drawn / printed faces are not "real-person faces"); the image's
    `License` is CC BY 2.0; no rotation flag;
  - **with product (target 40):** the image also has a box of `Bottle`, `Tin can`, `Box`, `Cosmetics` or `Drink`
    (a person with a product-type object in the frame; "holding" is not labelled, so this is the nearest available set);
  - **general (target 120):** 30 per bucket of the largest face's width relative to the image width: < 0.05,
    0.05 - 0.15, 0.15 - 0.35, >= 0.35;
  - within each group: images sorted by SHA-256 of the ImageID, the first ones that download are taken.
- Every face box of `Human face` in a selected image is a ground-truth face (the validation boxes are exhaustive for
  positive image labels).
- Frame = the image scaled to a long side of 1,600 px (the size of the tab's still canvas). Upload simulation = the
  **whole frame** at upload resolution (long side 1,024 px): the strictest case, since the user can draw the crop over
  the whole picture.

### 1.3 Dev / held-out split (fixed before tuning)

- Key = ImageID (faces) or file name (packs). `dev` when the first hex digit of SHA-256("lensiq-faceblur:" + key) is
  0 - 7, otherwise `held-out`. Settings are picked on dev only; held-out numbers are reported once for the picked
  setting (and in the full table for transparency, never used to pick).

### 1.4 Metrics (fixed before tuning)

- **(a) Label readable after blur:** among pack images whose OCR text (P2 metric `LQPC.tokenHit`: a brand / product-name
  token found) is a hit **before** blurring, the share that is still a hit after the face regions of the upload image
  are blurred. OCR = the same det + rec on the upload image, script per country as in P2.
- **(b) Real faces left unblurred:** share of ground-truth face boxes with **less than 50 %** of their area covered by
  the blur regions (in upload-image pixels). Reported overall and per face-size bucket by the face box width at upload
  resolution: < 20 px, 20 - 40, 40 - 80, 80 - 160, >= 160 px. Also: share of face images with at least one missed face.
- **(c) Packs with any region blurred** (formerly "false blocks"): share of the 270 packs without a person that get at
  least one blur region, and the mean share of the upload image area blurred.
- Every rate carries n and a Wilson 95 % interval.

### 1.5 Detector settings swept

- BlazeFace short range (vendored, Apache-2.0) as in P2, runs: the whole frame (always), 2 x 2 overlapping tiles of the
  frame (60 % per side; on / off) and the upload image (always, owner request: "run the detector on the crop at upload
  resolution as well as on the frame").
- Score threshold 0.3 / 0.4 / 0.5 / 0.6 / 0.7 x tiles on / off x box padding 0 / 0.15 / 0.30 (fraction of the box width
  and height added on each side) = 30 settings. Overlapping regions are merged (`LQPC.faceBlurPlan`).

### 1.6 Pick rule (fixed before tuning; the owner may change it)

On **dev**: among the settings whose (a) "label readable after blur" is **>= 90 %** (point estimate), pick the one with
the **lowest (b) "real faces left unblurred"** (all sizes); ties -> higher (a), then the lower threshold. If no setting
reaches 90 %, pick the highest (a) and report it. The owner may change X = 90 % or the rule (e.g. weight small faces
less); the full table below lets any other rule be applied without re-running.

### 1.7 Fail-safe (not a tuned setting)

If the face detector does not load, cannot run (for example no WebAssembly; WebGL is not required), a required run is missing, a detection score is
not a finite number or a detected face has no usable box, that upload goes **text only**: blurring cannot fix a
detector that did not run, so no image is sent. The user is told why.

## สรุปสำหรับเจ้าของ (Thai summary)

- เปลี่ยนจาก "บล็อก" เป็น "เบลอ" แล้ว: ก่อนส่งภาพ ระบบหาใบหน้าบนเครื่องและเบลอ (แบบย้อนกลับไม่ได้) ทุกจุดที่พบ ผู้ใช้เห็นภาพที่เบลอแล้ว
  พร้อมจำนวนจุด และกดกลับได้ ไม่มีการบล็อกเพราะมีใบหน้าอีก ถ้าตัวหาใบหน้าโหลดหรือทำงานไม่ได้ ครั้งนั้นจะส่งเฉพาะข้อความ ไม่ส่งภาพ
- **ค่าปัจจุบัน (รอบ 2, §5):** ตัดภาพ 3 x 3 ซ้อนกัน 20 % + เกณฑ์ 0.5 + ขยายกรอบ 15 % เลือกด้วยกฎเดิมที่ตั้งไว้ก่อนจูน
  (บนชุด dev: อ่านฉลากได้ ≥ 90 % แล้วเลือกที่พลาดใบหน้าน้อยที่สุด)
- ชุดทดสอบที่ไม่ได้ใช้จูน (held-out, ข้อมูลสาธารณะ): ฉลากยังอ่านชื่อแบรนด์ / สินค้าได้หลังเบลอ **94.1 %** (64 / 68)
  ใบหน้าคนจริงที่ไม่ถูกเบลอ **27.6 %** (42 / 152) (รอบ 1: 41.4 %) ใบหน้ากว้าง ≥ 80 px พลาด 2.6 – 4.9 % ใบหน้า 40 – 80 px พลาด 26 %
  ใบหน้า 20 – 40 px พลาด 64 % และใบหน้าเล็กกว่า 20 px ยังพลาดเกือบทั้งหมด **หน้าตัวอย่างจึงยังบอกให้ผู้ใช้ดูภาพก่อนส่ง**
- **ชุดใหม่ที่ไม่เคยเห็น (ผู้ตรวจอิสระ, §6):** อ่านฉลากได้ 90.1 % (ขอบล่าง 82.7 %) ใบหน้าคนจริงไม่ถูกเบลอ 34.7 % ใบหน้าใหญ่ ≥ 160 px
  พลาด 16.7 % และใบหน้าเต็มภาพ (กว้างเกิน 35 % ของภาพ) พลาด 7 จาก 25 **เกณฑ์ 90 % ผ่านเฉพาะค่ากลาง ชุด dev ผ่านด้วยฉลากเดียว**
- ลองเพิ่มรอบหาใบหน้าระยะใกล้ (ย่อทั้งภาพใส่กรอบ) ตามกฎเดิม: ช่วยใบหน้าเต็มภาพเล็กน้อย แต่ทำให้อ่านฉลากได้ต่ำกว่า 90 % จึงไม่ใช้ (§6.3)
- เวลาบน Mac M1: มัธยฐาน 178 ms (p90 214 ms) ต่อภาพ 1,600 px ประมาณบนมือถือ (เป็นการคาดการณ์ ยังไม่ได้วัด) 3 – 6 เท่า = 0.5 – 1.3 วินาที
- ภาพสินค้าที่ไม่มีคนแต่ถูกเบลอบางจุด: 37.8 % (เดิมคือ "ถูกบล็อก" 60.4 %) เบลอเฉลี่ย 7.2 % ของพื้นที่ภาพ
- ตัวหาใบหน้าตัวที่สอง YuNet ใช้ไม่ได้: โมเดลเป็น MIT แต่ฝึกด้วยข้อมูลที่ห้ามใช้เชิงพาณิชย์ (WIDER FACE CC BY-NC-ND) จึงหยุดไว้ (§4)
- ตัวเลขรอบ 1 (2 x 2, เกณฑ์ 0.4) อยู่ใน §2 เก็บไว้เพื่อเทียบ เจ้าของเปลี่ยนกฎได้ ตารางมีครบทุกค่า

## 2. Measured numbers (run 2026-11-10, `node tools/pc-faceblur-eval.mjs`)

Raw per-image output (no images): `~/LENSIQ-field/face-blur/eval/faceblur-2026-11-09.json` (file name carries the UTC date);
log `~/LENSIQ-field/face-blur/eval-run.log`. **Hardware: Apple M1, 8 GB, macOS, headless Chrome 156, WebGL through
SwiftShader. Not a phone.** Detector errors / not loaded: 0 of 441 images.

### 2.1 Sets as built (source: public datasets)

| Set | Images | dev / held-out | Scored units |
|---|---|---|---|
| Packs (Open Food Facts / Open Beauty Facts, P2 set) | 281 (270 without a person, 11 pack art) | 148 / 133 | 132 packs with a token found before blurring (dev 64, held-out 68); same 132 as P2 |
| Real faces (Open Images V7 validation) | 160 = 40 "with product" + 4 x 30 general | 78 / 82 | 313 face boxes (dev 161, held-out 152) |

Eligible Open Images validation images after the §1.2 filter: 2,568, of which exactly 40 also carry a Bottle / Tin can /
Box / Cosmetics / Drink box (all 40 taken).

### 2.2 Sweep (30 settings; (a) and (b) per split; (c) and area on all 270 packs without a person)

Bold = picked on dev. Held-out columns are shown for transparency and were not used to pick.

| Setting | (a) readable after blur, dev | (b) real faces unblurred, dev | (a) held-out | (b) held-out | (c) clean packs with a region (all) | blurred area of clean packs (mean) |
|---|---|---|---|---|---|---|
| thr 0.3 · tiles on · pad 0.00 | 51 / 64 = 79.7 % [68.3 % – 87.7 %] | 43 / 161 = 26.7 % [20.5 % – 34.0 %] | 58 / 68 = 85.3 % [75.0 % – 91.8 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 155 / 270 = 57.4 % [51.4 % – 63.2 %] | 12.8 % |
| thr 0.3 · tiles on · pad 0.15 | 50 / 64 = 78.1 % [66.6 % – 86.5 %] | 37 / 161 = 23.0 % [17.2 % – 30.1 %] | 52 / 68 = 76.5 % [65.1 % – 85.0 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 156 / 270 = 57.8 % [51.8 % – 63.5 %] | 18.6 % |
| thr 0.3 · tiles on · pad 0.30 | 47 / 64 = 73.4 % [61.5 % – 82.7 %] | 37 / 161 = 23.0 % [17.2 % – 30.1 %] | 51 / 68 = 75.0 % [63.6 % – 83.8 %] | 47 / 152 = 30.9 % [24.1 % – 38.7 %] | 157 / 270 = 58.1 % [52.2 % – 63.9 %] | 23.7 % |
| thr 0.3 · tiles off · pad 0.00 | 55 / 64 = 85.9 % [75.4 % – 92.4 %] | 76 / 161 = 47.2 % [39.6 % – 54.9 %] | 59 / 68 = 86.8 % [76.7 % – 92.9 %] | 78 / 152 = 51.3 % [43.4 % – 59.1 %] | 90 / 270 = 33.3 % [28.0 % – 39.2 %] | 8.1 % |
| thr 0.3 · tiles off · pad 0.15 | 52 / 64 = 81.3 % [70.0 % – 88.9 %] | 66 / 161 = 41.0 % [33.7 % – 48.7 %] | 55 / 68 = 80.9 % [70.0 % – 88.5 %] | 76 / 152 = 50.0 % [42.1 % – 57.9 %] | 90 / 270 = 33.3 % [28.0 % – 39.2 %] | 11.8 % |
| thr 0.3 · tiles off · pad 0.30 | 49 / 64 = 76.6 % [64.9 % – 85.3 %] | 65 / 161 = 40.4 % [33.1 % – 48.1 %] | 54 / 68 = 79.4 % [68.4 % – 87.3 %] | 72 / 152 = 47.4 % [39.6 % – 55.3 %] | 91 / 270 = 33.7 % [28.3 % – 39.5 %] | 14.9 % |
| **thr 0.4 · tiles on · pad 0.00** | 59 / 64 = 92.2 % [83.0 % – 96.6 %] | 58 / 161 = 36.0 % [29.0 % – 43.7 %] | 62 / 68 = 91.2 % [82.1 % – 95.9 %] | 63 / 152 = 41.4 % [33.9 % – 49.4 %] | 103 / 270 = 38.1 % [32.6 % – 44.1 %] | 7.5 % |
| thr 0.4 · tiles on · pad 0.15 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 57 / 161 = 35.4 % [28.4 % – 43.1 %] | 56 / 68 = 82.4 % [71.6 % – 89.6 %] | 61 / 152 = 40.1 % [32.7 % – 48.1 %] | 105 / 270 = 38.9 % [33.3 % – 44.8 %] | 11.1 % |
| thr 0.4 · tiles on · pad 0.30 | 52 / 64 = 81.3 % [70.0 % – 88.9 %] | 55 / 161 = 34.2 % [27.3 % – 41.8 %] | 56 / 68 = 82.4 % [71.6 % – 89.6 %] | 60 / 152 = 39.5 % [32.1 % – 47.4 %] | 107 / 270 = 39.6 % [34.0 % – 45.6 %] | 14.5 % |
| thr 0.4 · tiles off · pad 0.00 | 61 / 64 = 95.3 % [87.1 % – 98.4 %] | 81 / 161 = 50.3 % [42.7 % – 57.9 %] | 62 / 68 = 91.2 % [82.1 % – 95.9 %] | 87 / 152 = 57.2 % [49.3 % – 64.8 %] | 59 / 270 = 21.9 % [17.3 % – 27.2 %] | 4.9 % |
| thr 0.4 · tiles off · pad 0.15 | 59 / 64 = 92.2 % [83.0 % – 96.6 %] | 75 / 161 = 46.6 % [39.0 % – 54.3 %] | 57 / 68 = 83.8 % [73.3 % – 90.7 %] | 85 / 152 = 55.9 % [48.0 % – 63.6 %] | 60 / 270 = 22.2 % [17.7 % – 27.6 %] | 7.4 % |
| thr 0.4 · tiles off · pad 0.30 | 57 / 64 = 89.1 % [79.1 % – 94.6 %] | 74 / 161 = 46.0 % [38.4 % – 53.7 %] | 57 / 68 = 83.8 % [73.3 % – 90.7 %] | 84 / 152 = 55.3 % [47.3 % – 62.9 %] | 61 / 270 = 22.6 % [18.0 % – 27.9 %] | 9.5 % |
| thr 0.5 · tiles on · pad 0.00 | 61 / 64 = 95.3 % [87.1 % – 98.4 %] | 66 / 161 = 41.0 % [33.7 % – 48.7 %] | 66 / 68 = 97.1 % [89.9 % – 99.2 %] | 70 / 152 = 46.1 % [38.3 % – 54.0 %] | 53 / 270 = 19.6 % [15.3 % – 24.8 %] | 2.9 % |
| thr 0.5 · tiles on · pad 0.15 | 60 / 64 = 93.8 % [85.0 % – 97.5 %] | 65 / 161 = 40.4 % [33.1 % – 48.1 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 68 / 152 = 44.7 % [37.1 % – 52.7 %] | 54 / 270 = 20.0 % [15.7 % – 25.2 %] | 4.7 % |
| thr 0.5 · tiles on · pad 0.30 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 63 / 161 = 39.1 % [31.9 % – 46.8 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 68 / 152 = 44.7 % [37.1 % – 52.7 %] | 56 / 270 = 20.7 % [16.3 % – 26.0 %] | 6.3 % |
| thr 0.5 · tiles off · pad 0.00 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 86 / 161 = 53.4 % [45.7 % – 61.0 %] | 66 / 68 = 97.1 % [89.9 % – 99.2 %] | 92 / 152 = 60.5 % [52.6 % – 67.9 %] | 26 / 270 = 9.6 % [6.7 % – 13.7 %] | 1.6 % |
| thr 0.5 · tiles off · pad 0.15 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 82 / 161 = 50.9 % [43.3 % – 58.5 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 90 / 152 = 59.2 % [51.3 % – 66.7 %] | 27 / 270 = 10.0 % [7.0 % – 14.2 %] | 2.5 % |
| thr 0.5 · tiles off · pad 0.30 | 60 / 64 = 93.8 % [85.0 % – 97.5 %] | 82 / 161 = 50.9 % [43.3 % – 58.5 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 90 / 152 = 59.2 % [51.3 % – 66.7 %] | 28 / 270 = 10.4 % [7.3 % – 14.6 %] | 3.4 % |
| thr 0.6 · tiles on · pad 0.00 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 73 / 161 = 45.3 % [37.8 % – 53.1 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 77 / 152 = 50.7 % [42.8 % – 58.5 %] | 24 / 270 = 8.9 % [6.0 % – 12.9 %] | 1.0 % |
| thr 0.6 · tiles on · pad 0.15 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 72 / 161 = 44.7 % [37.3 % – 52.4 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 76 / 152 = 50.0 % [42.1 % – 57.9 %] | 24 / 270 = 8.9 % [6.0 % – 12.9 %] | 1.6 % |
| thr 0.6 · tiles on · pad 0.30 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 71 / 161 = 44.1 % [36.7 % – 51.8 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 75 / 152 = 49.3 % [41.5 % – 57.2 %] | 26 / 270 = 9.6 % [6.7 % – 13.7 %] | 2.2 % |
| thr 0.6 · tiles off · pad 0.00 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 91 / 161 = 56.5 % [48.8 % – 63.9 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 98 / 152 = 64.5 % [56.6 % – 71.6 %] | 12 / 270 = 4.4 % [2.6 % – 7.6 %] | 0.7 % |
| thr 0.6 · tiles off · pad 0.15 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 87 / 161 = 54.0 % [46.3 % – 61.6 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 98 / 152 = 64.5 % [56.6 % – 71.6 %] | 12 / 270 = 4.4 % [2.6 % – 7.6 %] | 1.2 % |
| thr 0.6 · tiles off · pad 0.30 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 86 / 161 = 53.4 % [45.7 % – 61.0 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 98 / 152 = 64.5 % [56.6 % – 71.6 %] | 14 / 270 = 5.2 % [3.1 % – 8.5 %] | 1.6 % |
| thr 0.7 · tiles on · pad 0.00 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 79 / 161 = 49.1 % [41.5 % – 56.7 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 86 / 152 = 56.6 % [48.6 % – 64.2 %] | 5 / 270 = 1.9 % [0.8 % – 4.3 %] | 0.1 % |
| thr 0.7 · tiles on · pad 0.15 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 76 / 161 = 47.2 % [39.6 % – 54.9 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 85 / 152 = 55.9 % [48.0 % – 63.6 %] | 5 / 270 = 1.9 % [0.8 % – 4.3 %] | 0.2 % |
| thr 0.7 · tiles on · pad 0.30 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 76 / 161 = 47.2 % [39.6 % – 54.9 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 85 / 152 = 55.9 % [48.0 % – 63.6 %] | 5 / 270 = 1.9 % [0.8 % – 4.3 %] | 0.3 % |
| thr 0.7 · tiles off · pad 0.00 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 98 / 161 = 60.9 % [53.2 % – 68.1 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 104 / 152 = 68.4 % [60.7 % – 75.3 %] | 3 / 270 = 1.1 % [0.4 % – 3.2 %] | 0.1 % |
| thr 0.7 · tiles off · pad 0.15 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 95 / 161 = 59.0 % [51.3 % – 66.3 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 104 / 152 = 68.4 % [60.7 % – 75.3 %] | 3 / 270 = 1.1 % [0.4 % – 3.2 %] | 0.1 % |
| thr 0.7 · tiles off · pad 0.30 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 94 / 161 = 58.4 % [50.7 % – 65.7 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 104 / 152 = 68.4 % [60.7 % – 75.3 %] | 3 / 270 = 1.1 % [0.4 % – 3.2 %] | 0.2 % |

Pick rule §1.6 applied: 20 of 30 settings reach (a) >= 90 % on dev; the lowest dev (b) among them is
**threshold 0.4 · tiles on · pad 0** (36.0 %). This was the round-1 default; **superseded by round 2 (§5): 3 x 3 tiles,
threshold 0.5, pad 0.15.**
~~Padding did not help~~ **Corrected (review, 2026-11-10):** under metric (b) (< 50 % of the face covered) padding
changes little (at 0.4 + tiles, pad 0.15 / 0.30 lower (b) by 0.6 / 1.8 points and drop (a) below 90 %). Under the
stricter metric "less than 90 % of the face covered" padding matters a lot, because BlazeFace boxes are tight and leave
the chin, forehead or hair outside the blur:

| Setting | dev: < 50 % covered | dev: < 90 % covered | held-out: < 50 % covered | held-out: < 90 % covered |
|---|---|---|---|---|
| 2 x 2, 0.4, pad 0 (round-1 pick) | 58 / 161 = 36.0 % | **106 / 161 = 65.8 %** [58.2 – 72.7] | 63 / 152 = 41.4 % | **110 / 152 = 72.4 %** [64.8 – 78.9] |
| 2 x 2, 0.4, pad 0.15 | 57 / 161 = 35.4 % | 67 / 161 = 41.6 % | 61 / 152 = 40.1 % | 68 / 152 = 44.7 % |
| 2 x 2, 0.4, pad 0.30 | 55 / 161 = 34.2 % | 56 / 161 = 34.8 % | 60 / 152 = 39.5 % | 61 / 152 = 40.1 % |
| 3 x 3, 0.5, pad 0 | 53 / 161 = 32.9 % | 106 / 161 = 65.8 % | 45 / 152 = 29.6 % | 103 / 152 = 67.8 % |
| **3 x 3, 0.5, pad 0.15 (round-2 pick)** | 50 / 161 = 31.1 % | **62 / 161 = 38.5 %** [31.3 – 46.2] | 42 / 152 = 27.6 % | **58 / 152 = 38.2 %** [30.8 – 46.1] |
| 3 x 3, 0.4, pad 0.15 | 39 / 161 = 24.2 % | 48 / 161 = 29.8 % | 29 / 152 = 19.1 % | 44 / 152 = 28.9 % |

So the round-1 default left most faces partly visible; the round-2 default (pad 0.15) does much better on this stricter
metric, which the pick rule did not look at. Source: public dataset (builder set).

### 2.3 Picked setting: threshold 0.4, tiles on, pad 0 (source: public datasets)

| Metric | dev | **held-out** | all |
|---|---|---|---|
| (a) label readable after blur | 59 / 64 = 92.2 % [83.0 – 96.6] | **62 / 68 = 91.2 % [82.1 – 95.9]** | 121 / 132 = 91.7 % [85.7 – 95.3] |
| (b) real faces left unblurred (all sizes) | 58 / 161 = 36.0 % [29.0 – 43.7] | **63 / 152 = 41.4 % [33.9 – 49.4]** | 121 / 313 = 38.7 % [33.4 – 44.2] |
| face images with >= 1 face left unblurred | 19 / 78 = 24.4 % [16.2 – 34.9] | 21 / 82 = 25.6 % [17.4 – 36.0] | 40 / 160 = 25.0 % [18.9 – 32.2] |
| (b) "with product" images only | 8 / 46 = 17.4 % [9.1 – 30.7] | 10 / 31 = 32.3 % [18.6 – 49.9] | |
| (c) packs without a person with >= 1 region | 54 / 144 = 37.5 % [30.0 – 45.6] | 49 / 126 = 38.9 % [30.8 – 47.6] | 103 / 270 = 38.1 % [32.6 – 44.1] (mean area blurred 7.5 %) |
| pack art (printed people) with >= 1 region | 1 / 4 | 2 / 7 | 3 / 11 = 27.3 % [9.7 – 56.6] |
| uploads that fell back to text only | 0 | 0 | 0 |

(b) by face width at upload resolution (long side 1,024 px):

| Split | < 20 px | 20 - 40 px | 40 - 80 px | 80 - 160 px | >= 160 px |
|---|---|---|---|---|---|
| dev | 26 / 28 = 92.9 % [77.4 – 98.0] | 18 / 21 = 85.7 % [65.4 – 95.0] | 10 / 18 = 55.6 % [33.7 – 75.4] | 1 / 40 = 2.5 % [0.4 – 12.9] | 3 / 54 = 5.6 % [1.9 – 15.1] |
| **held-out** | 4 / 5 = 80.0 % [37.6 – 96.4] | 39 / 44 = 88.6 % [76.0 – 95.0] | 15 / 23 = 65.2 % [44.9 – 81.2] | 4 / 41 = 9.8 % [3.9 – 22.5] | 1 / 39 = 2.6 % [0.5 – 13.2] |
| all | 30 / 33 = 90.9 % [76.4 – 96.9] | 57 / 65 = 87.7 % [77.5 – 93.6] | 25 / 41 = 61.0 % [45.7 – 74.3] | 5 / 81 = 6.2 % [2.7 – 13.6] | 4 / 93 = 4.3 % [1.7 – 10.5] |

Reading the numbers:
- **Small faces are the gap.** BlazeFace short range (the only BlazeFace that runs in the vendored MediaPipe bundle, P2
  §3) finds faces that are at least about 80 px wide at upload resolution; below 40 px it misses most. Even the most
  sensitive setting (0.3 + tiles) leaves 20 / 28 dev faces under 20 px unblurred. A better small-face detector is the only
  real fix (see risks); no setting of this one closes it.
- Faces under 40 px in a 1,024 px picture are small (a person in the background), but they can still be recognisable.
  The preview tells the user that very small faces can be missed and to go back if they see one.
- The 11 lost labels at the picked setting had 8 - 57 % of the upload image blurred (false detections on pack art,
  logos or round shapes covering the brand name).
- Printed faces on pack art are blurred in 3 / 11 packs at the picked setting (10 / 11 at 0.3 + tiles). That is
  acceptable for the owner's goal (packaging faces are not a reason to block) but means a printed model photo usually
  goes out unblurred.
- Latency on this Mac (not a phone): `faceRuns` (frame + 4 tiles + upload image) median 190 ms, p90 268 ms on 1,600 px
  photos; 36 ms on the 400 px packs; `faceBlur` of a 200 x 200 region 9 ms.

### 2.4 Code and tests

- `lensiq-pc.js`: `FACE_BLUR` (picked setting), `faceBlurPlan` (pad, clamp, merge, map to the upload image, fail-safe
  text only), `mergeBoxes`, `coverage`. `faceGate` kept unchanged as an API, no longer on the upload path.
- `lensiq-pc-run.js`: `uploadCanvas` (crop at <= 1,024 px), `faceRuns` (frame + tiles + upload image),
  `faceBlur` (canvas blur, then block-mean pixelation: irreversible). `faceCheck` kept.
- `lensiq-pc-ui.js`: `prepareUpload()` -> `{blob, blurredCount}` | `{textOnly: true, reason}` | `{cancelled: true}`;
  preview card with "N face regions blurred", Back / Use; text-only card explains why. TH / EN / ZH. Not wired to the AI
  (P7). The one image encoding (JPEG of the blurred crop) happens only after "Use this picture".
- `tests/unit/pc-faceblur.test.js` (10 tests): merge, clamp, mapping, tiles, thresholds, fail-safe (missing / error /
  not run / malformed score / face without a box / bad frame -> text only), `tileRects` grids (round 2). `tests/unit/pc-ondevice.test.js`: the
  "no image encoding in P2" assertion now allows exactly one encoding, inside `prepareUpload`, after the blur and the
  user's confirmation, and adds `XMLHttpRequest`, `sendBeacon`, `WebSocket` to the no-upload check (owner decision
  2026-11-10 requires `{blob}`; this is a scope change, flagged for the reviewer).
- `tests/e2e/product-check.e2e.mjs` (+3 checks): preview shows, regions pixelated, outside pixels untouched, 6 faces
  still not blocked, Back / Use results, no non-GET / third-party request, nothing stored; an encode spy shows zero encodes
  while the preview is open and after Back, and exactly one `toBlob` of the blurred preview canvas only after the "Use this
  picture" click; fail-safe (no model, NaN score, no picture, WebAssembly removed) -> text only with the reason shown; the
  real detector either ran on every view or the upload is text only; EN / ZH with no Thai left.

### 2.5 Not measured yet

Phone latency; the owner's field photos (P1 protocol) with a hand or a person holding the product; a person's name on a
dispensing label (patient-name guard, P7). Independent reviewer re-measurement of these numbers: pending.

## 3. Credits

- Open Images Dataset V7 (Google LLC): annotations CC BY 4.0; the 160 images are each listed as CC BY 2.0 by their Flickr
  authors. Per-image title, author, profile, Flickr page and licence: `~/LENSIQ-field/face-blur/CREDITS.tsv` (outside the
  repo; no image is redistributed). Kuznetsova et al., "The Open Images Dataset V4", IJCV 2020.
- Open Food Facts / Open Beauty Facts (P2 set): database ODbL-1.0, images CC BY-SA 3.0; local evaluation only.
- BlazeFace short range (Google MediaPipe), Apache-2.0, vendored in P2.

## 4. Second detector considered: OpenCV YuNet (stopped at the licence check, 2026-11-10)

Request: evaluate YuNet (opencv_zoo `face_detection_yunet`) next to BlazeFace (union) and alone, licence first; stop if
the model or its training data is non-commercial or unclear. **Result: stopped. Not vendored, not run, no sweep rows.**

| Item | Finding | Source (checked 2026-11-10) |
|---|---|---|
| Model files | MIT (Copyright 2020 Shiqi Yu); "All files in this directory are licensed under MIT License" | opencv/opencv_zoo @ `eb9f4f2d4b79b58e5513b5d25d5f0243a8357bf4` (last commit touching `models/face_detection_yunet`, 2026-08-12): `models/face_detection_yunet/LICENSE` sha256 `c83b8120…aba958`, `README.md` sha256 `a140c9e9…5b9ac`; repo LICENSE Apache-2.0 |
| Model file (hashed only, deleted afterwards) | `face_detection_yunet_2023mar.onnx`, 232,589 bytes, sha256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | same revision (Git LFS) |
| Model source | `ShiqiYu/libfacedetection.train` @ `a61a428929148171b488f024b5d6774f93cdbc13` (README of the model) | training repo LICENSE at that revision: MIT (code) |
| **Training data** | **WIDER FACE** (training README: "Download the WIDER Face dataset"); WIDER FACE page: "License Creative Common License (cc by-nc-nd)" | training README sha256 `70c41741…f0c3`; shuoyang1213.me/WIDERFACE |
| **Training labels** | "We relabled the WIDER Face train set using RetinaFace" (insightface). insightface README: "The training data containing the annotation (and the models trained with these data) are available for non-commercial research purposes only." | training README; deepinsight/insightface README |

Why this is a stop: the weights carry an MIT notice, but they were trained on a CC BY-NC-ND dataset with labels produced by
an insightface model that is itself non-commercial. Whether a non-commercial training-data licence binds the weights is
legally unclear, and the CLAUDE.md rule excludes non-commercial data from the product. This is the same reason WIDER FACE
was excluded as a test set. Copies of the licence files and pages are kept in `~/LENSIQ-field/face-blur/yunet-licence/`.

What could still close the small-face gap (each needs the same licence check first, owner decision):
- a face detector whose weights AND training data are commercially usable (for example a model trained only on Open
  Images or another CC BY / CC0 face set). None was identified in this round;
- running the BlazeFace short-range model on a finer grid (3 x 3 or 4 x 4 tiles of the frame); same licence, more CPU;
- a stricter default in image mode (a smaller crop), or text only when the crop is large; product decisions.

## 5. Round 2: finer BlazeFace tile grids (same licence), 2026-11-10 — NEW DEFAULT

Request (coordinator, after YuNet stopped on its licence): the same detector on finer, overlapping tile grids, optionally
upscaled. **Unchanged: the fixed sets (§1.1, §1.2), the dev / held-out split (§1.3), the metrics (§1.4) and the pick
rule (§1.6).** The detector settings swept are extended (an addition to §1.5, made after round 1 had been seen):

- tile grids 3 x 3 and 4 x 4 with 20 % overlap between neighbouring tiles (`LQPC.tileRects`; the P2 2 x 2 grid is
  `tileRects(W, H, 2, 1/3)`, 60 % of each side), with and without a 2x upscale of each tile before detection;
- thresholds 0.4 / 0.5 / 0.6 x padding 0 / 0.15, tiles on; frame and upload-image runs as before.

Run: `node tools/pc-faceblur-eval.mjs` (all 54 settings in one run; the 30 round-1 rows reproduced exactly). Raw output:
`~/LENSIQ-field/face-blur/eval/faceblur-round2-2026-11-10.json`, log `~/LENSIQ-field/face-blur/eval-run2.log`. Same
machine (Apple M1, 8 GB, headless Chrome 156). The first attempt stopped when its Chrome died at pack 140 (other browser
jobs on the machine); the tool now has a time limit per call, checkpoints and resume, and the full run was repeated from
the start. Detector errors: 0. Source: public datasets.

### 5.1 New sweep rows (bold = picked on dev; round-1 rows in §2.2)

| Setting | (a) readable after blur, dev | (b) real faces unblurred, dev | (a) held-out | (b) held-out | (c) clean packs with a region (all) | blurred area of clean packs (mean) |
|---|---|---|---|---|---|---|
| 3x3 tiles · thr 0.4 · pad 0.00 | 54 / 64 = 84.4 % [73.6 % – 91.3 %] | 41 / 161 = 25.5 % [19.4 % – 32.7 %] | 57 / 68 = 83.8 % [73.3 % – 90.7 %] | 31 / 152 = 20.4 % [14.8 % – 27.5 %] | 167 / 270 = 61.9 % [55.9 % – 67.4 %] | 11.0 % |
| 3x3 tiles · thr 0.4 · pad 0.15 | 52 / 64 = 81.3 % [70.0 % – 88.9 %] | 39 / 161 = 24.2 % [18.3 % – 31.4 %] | 51 / 68 = 75.0 % [63.6 % – 83.8 %] | 29 / 152 = 19.1 % [13.6 % – 26.1 %] | 170 / 270 = 63.0 % [57.1 % – 68.5 %] | 16.4 % |
| 3x3 tiles · thr 0.5 · pad 0.00 | 59 / 64 = 92.2 % [83.0 % – 96.6 %] | 53 / 161 = 32.9 % [26.1 % – 40.5 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 45 / 152 = 29.6 % [22.9 % – 37.3 %] | 99 / 270 = 36.7 % [31.1 % – 42.6 %] | 4.7 % |
| **3x3 tiles · thr 0.5 · pad 0.15** | 58 / 64 = 90.6 % [81.0 % – 95.6 %] | 50 / 161 = 31.1 % [24.4 % – 38.6 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 42 / 152 = 27.6 % [21.1 % – 35.2 %] | 102 / 270 = 37.8 % [32.2 % – 43.7 %] | 7.2 % |
| 3x3 tiles · thr 0.6 · pad 0.00 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 62 / 161 = 38.5 % [31.3 % – 46.2 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 53 / 152 = 34.9 % [27.7 % – 42.7 %] | 48 / 270 = 17.8 % [13.7 % – 22.8 %] | 1.8 % |
| 3x3 tiles · thr 0.6 · pad 0.15 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 59 / 161 = 36.6 % [29.6 % – 44.3 %] | 67 / 68 = 98.5 % [92.1 % – 99.7 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 48 / 270 = 17.8 % [13.7 % – 22.8 %] | 2.9 % |
| 4x4 tiles · thr 0.4 · pad 0.00 | 50 / 64 = 78.1 % [66.6 % – 86.5 %] | 43 / 161 = 26.7 % [20.5 % – 34.0 %] | 52 / 68 = 76.5 % [65.1 % – 85.0 %] | 26 / 152 = 17.1 % [11.9 % – 23.9 %] | 217 / 270 = 80.4 % [75.2 % – 84.7 %] | 14.7 % |
| 4x4 tiles · thr 0.4 · pad 0.15 | 47 / 64 = 73.4 % [61.5 % – 82.7 %] | 41 / 161 = 25.5 % [19.4 % – 32.7 %] | 49 / 68 = 72.1 % [60.4 % – 81.3 %] | 24 / 152 = 15.8 % [10.8 % – 22.4 %] | 219 / 270 = 81.1 % [76.0 % – 85.3 %] | 21.5 % |
| 4x4 tiles · thr 0.5 · pad 0.00 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 52 / 161 = 32.3 % [25.6 % – 39.9 %] | 63 / 68 = 92.6 % [83.9 % – 96.8 %] | 36 / 152 = 23.7 % [17.6 % – 31.0 %] | 155 / 270 = 57.4 % [51.4 % – 63.2 %] | 6.7 % |
| 4x4 tiles · thr 0.5 · pad 0.15 | 55 / 64 = 85.9 % [75.4 % – 92.4 %] | 51 / 161 = 31.7 % [25.0 % – 39.2 %] | 61 / 68 = 89.7 % [80.2 % – 94.9 %] | 33 / 152 = 21.7 % [15.9 % – 28.9 %] | 157 / 270 = 58.1 % [52.2 % – 63.9 %] | 10.1 % |
| 4x4 tiles · thr 0.6 · pad 0.00 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 57 / 161 = 35.4 % [28.4 % – 43.1 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 42 / 152 = 27.6 % [21.1 % – 35.2 %] | 85 / 270 = 31.5 % [26.2 % – 37.2 %] | 2.5 % |
| 4x4 tiles · thr 0.6 · pad 0.15 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 55 / 161 = 34.2 % [27.3 % – 41.8 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 39 / 152 = 25.7 % [19.4 % – 33.1 %] | 85 / 270 = 31.5 % [26.2 % – 37.2 %] | 4.0 % |
| 3x3 up2 tiles · thr 0.4 · pad 0.00 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 43 / 161 = 26.7 % [20.5 % – 34.0 %] | 57 / 68 = 83.8 % [73.3 % – 90.7 %] | 34 / 152 = 22.4 % [16.5 % – 29.6 %] | 175 / 270 = 64.8 % [58.9 % – 70.3 %] | 11.7 % |
| 3x3 up2 tiles · thr 0.4 · pad 0.15 | 52 / 64 = 81.3 % [70.0 % – 88.9 %] | 40 / 161 = 24.8 % [18.8 % – 32.1 %] | 52 / 68 = 76.5 % [65.1 % – 85.0 %] | 30 / 152 = 19.7 % [14.2 % – 26.8 %] | 179 / 270 = 66.3 % [60.5 % – 71.7 %] | 17.7 % |
| 3x3 up2 tiles · thr 0.5 · pad 0.00 | 59 / 64 = 92.2 % [83.0 % – 96.6 %] | 54 / 161 = 33.5 % [26.7 % – 41.1 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 42 / 152 = 27.6 % [21.1 % – 35.2 %] | 107 / 270 = 39.6 % [34.0 % – 45.6 %] | 5.3 % |
| 3x3 up2 tiles · thr 0.5 · pad 0.15 | 58 / 64 = 90.6 % [81.0 % – 95.6 %] | 51 / 161 = 31.7 % [25.0 % – 39.2 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 40 / 152 = 26.3 % [20.0 % – 33.8 %] | 111 / 270 = 41.1 % [35.4 % – 47.1 %] | 8.0 % |
| 3x3 up2 tiles · thr 0.6 · pad 0.00 | 64 / 64 = 100.0 % [94.3 % – 100.0 %] | 62 / 161 = 38.5 % [31.3 % – 46.2 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 53 / 152 = 34.9 % [27.7 % – 42.7 %] | 49 / 270 = 18.1 % [14.0 % – 23.2 %] | 1.8 % |
| 3x3 up2 tiles · thr 0.6 · pad 0.15 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 59 / 161 = 36.6 % [29.6 % – 44.3 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 50 / 270 = 18.5 % [14.3 % – 23.6 %] | 2.8 % |
| 4x4 up2 tiles · thr 0.4 · pad 0.00 | 49 / 64 = 76.6 % [64.9 % – 85.3 %] | 43 / 161 = 26.7 % [20.5 % – 34.0 %] | 50 / 68 = 73.5 % [62.0 % – 82.6 %] | 26 / 152 = 17.1 % [11.9 % – 23.9 %] | 219 / 270 = 81.1 % [76.0 % – 85.3 %] | 16.4 % |
| 4x4 up2 tiles · thr 0.4 · pad 0.15 | 46 / 64 = 71.9 % [59.9 % – 81.4 %] | 42 / 161 = 26.1 % [19.9 % – 33.4 %] | 46 / 68 = 67.6 % [55.8 % – 77.6 %] | 23 / 152 = 15.1 % [10.3 % – 21.7 %] | 219 / 270 = 81.1 % [76.0 % – 85.3 %] | 24.2 % |
| 4x4 up2 tiles · thr 0.5 · pad 0.00 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 50 / 161 = 31.1 % [24.4 % – 38.6 %] | 63 / 68 = 92.6 % [83.9 % – 96.8 %] | 32 / 152 = 21.1 % [15.3 % – 28.2 %] | 158 / 270 = 58.5 % [52.6 % – 64.2 %] | 7.4 % |
| 4x4 up2 tiles · thr 0.5 · pad 0.15 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 49 / 161 = 30.4 % [23.9 % – 37.9 %] | 60 / 68 = 88.2 % [78.5 % – 93.9 %] | 30 / 152 = 19.7 % [14.2 % – 26.8 %] | 162 / 270 = 60.0 % [54.1 % – 65.7 %] | 11.3 % |
| 4x4 up2 tiles · thr 0.6 · pad 0.00 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 57 / 161 = 35.4 % [28.4 % – 43.1 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 44 / 152 = 28.9 % [22.3 % – 36.6 %] | 81 / 270 = 30.0 % [24.8 % – 35.7 %] | 2.8 % |
| 4x4 up2 tiles · thr 0.6 · pad 0.15 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 55 / 161 = 34.2 % [27.3 % – 41.8 %] | 66 / 68 = 97.1 % [89.9 % – 99.2 %] | 41 / 152 = 27.0 % [20.5 % – 34.5 %] | 81 / 270 = 30.0 % [24.8 % – 35.7 %] | 4.4 % |

Pick rule over all 54 settings: 32 reach (a) >= 90 % on dev; the lowest dev (b) among them is **3 x 3 tiles, 20 %
overlap, no upscale, threshold 0.5, pad 0.15** (dev (b) 31.1 % vs 36.0 % for round 1's 2 x 2 / 0.4 / 0). It is the new
default: `LQPC.FACE_BLUR = { threshold: 0.5, tiles: true, grid: 3, overlap: 0.2, upscale: 1, pad: 0.15 }`.
The 2x upscale gives no gain (BlazeFace resizes every input to 128 x 128 itself) and costs time; 4 x 4 finds more small
faces but blurs more packs and loses (a) at 0.4 / 0.5.

### 5.2 Picked setting vs round 1 (source: public datasets)

| Metric | round 1 held-out (2 x 2, 0.4, pad 0) | **round 2 dev** | **round 2 held-out** |
|---|---|---|---|
| (a) label readable after blur | 62 / 68 = 91.2 % [82.1 – 95.9] | 58 / 64 = 90.6 % [81.0 – 95.6] | **64 / 68 = 94.1 % [85.8 – 97.7]** |
| (b) real faces left unblurred | 63 / 152 = 41.4 % [33.9 – 49.4] | 50 / 161 = 31.1 % [24.4 – 38.6] | **42 / 152 = 27.6 % [21.1 – 35.2]** |
| face images with >= 1 face left unblurred | 21 / 82 = 25.6 % | 18 / 78 = 23.1 % [15.1 – 33.6] | 18 / 82 = 22.0 % [14.4 – 32.1] |
| (c) packs without a person with >= 1 region | 49 / 126 = 38.9 % | 54 / 144 = 37.5 % [30.0 – 45.6] | 48 / 126 = 38.1 % [30.1 – 46.8] (all 270: 37.8 %, mean area 7.2 %) |
| pack art (printed people) with >= 1 region | 2 / 7 | 1 / 4 | 6 / 7 (all 11: 7 / 11) |
| uploads that fell back to text only | 0 | 0 | 0 |

(b) by face width at upload resolution, **held-out**:

| Setting | < 20 px | 20 - 40 px | 40 - 80 px | 80 - 160 px | >= 160 px |
|---|---|---|---|---|---|
| round 1 (2 x 2, 0.4, pad 0) | 4 / 5 = 80.0 % [37.6 – 96.4] | 39 / 44 = 88.6 % [76.0 – 95.0] | 15 / 23 = 65.2 % [44.9 – 81.2] | 4 / 41 = 9.8 % [3.9 – 22.5] | 1 / 39 = 2.6 % [0.5 – 13.2] |
| **round 2 (3 x 3, 0.5, pad 0.15)** | 5 / 5 = 100 % [56.6 – 100] | **28 / 44 = 63.6 % [48.9 – 76.2]** | **6 / 23 = 26.1 % [12.5 – 46.5]** | 2 / 41 = 4.9 % [1.3 – 16.1] | 1 / 39 = 2.6 % [0.5 – 13.2] |

Dev, same buckets (round 2): 28 / 28 = 100 % · 13 / 21 = 61.9 % · 3 / 18 = 16.7 % · 1 / 40 = 2.5 % · 5 / 54 = 9.3 %.

Reading: the gain is in faces 20 - 80 px wide (a person a few metres away). Faces under 20 px are still not found (they
were mostly missed before too). On dev, large faces (>= 160 px) are missed slightly more often (5 / 54 vs 3 / 54) because
the threshold rose from 0.4 to 0.5; held-out shows no difference there. **The 90 % bar holds only at the point estimate: dev (a) is 58 / 64 = 90.6 % with a lower bound of 81.0 %, and it passes by ONE pack (57 / 64 = 89.1 % would fail). On the fresh set (§6.3) (a) is 90.1 % with a lower bound of 82.7 %.**

### 5.3 Time per upload (source: this machine; phone = ESTIMATE)

`faceRuns` = the frame + every tile + the upload image, models loaded:

| Configuration | faces set, 1,600 px: median | p90 | packs, 400 px: median | p90 |
|---|---|---|---|---|
| 2 x 2 (round 1) | 174 ms | 219 ms | 28 ms | 33 ms |
| **3 x 3 (picked)** | **178 ms** | **214 ms** | 43 ms | 50 ms |
| 4 x 4 | 222 ms | 265 ms | 65 ms | 74 ms |
| 3 x 3 + 2x upscale | 333 ms | 399 ms | 52 ms | 61 ms |
| 4 x 4 + 2x upscale | 388 ms | 463 ms | 75 ms | 88 ms |

`faceBlur` of a 200 x 200 region: 8.6 ms. Every setting is far below the 1.5 s limit on the M1. **Phone estimate (NOT
measured):** a mid-range phone running the same WASM / MediaPipe CPU path is typically 3 - 6 times slower than an M1, so
about 0.5 - 1.3 s for the picked setting on a 1,600 px photo. The first use also downloads the 0.23 MB model plus the
MediaPipe runtime. To be measured on the owner's phones before P7 ships.

### 5.4 WebGL correction (2026-11-10)

P2 stated that MediaPipe's face detector needs WebGL. That is wrong: CI's Chrome reports no WebGL at all (neither webgl2
nor webgl) and BlazeFace still ran there on frame, tiles and crop. The fail-safe does not look at WebGL; it fails closed
(text only) only when the detector cannot actually run (no model, no WebAssembly, a load or run error, a missing run or
malformed output). The e2e tests now remove WebAssembly to force that case, as the face-gate check on main (745eb21) does.
The eval tools keep WebGL (SwiftShader) on only so their numbers stay comparable with the earlier runs.

## 6. Independent review, fresh set and round 3 (close-up pass), 2026-11-10

### 6.1 Provenance of the test sets (all kept outside the repo; no image of a person is committed)

| Set | Source and licence | Where | Status |
|---|---|---|---|
| Builder face set (160 images, 313 faces; dev 78 / held-out 82) | Open Images V7 **validation** split; images listed as CC BY 2.0 (each image's own `License` checked), annotations CC BY 4.0 (Google LLC) | `~/LENSIQ-field/face-blur/images` + `manifest.jsonl`, `CREDITS.tsv` | **images still kept, pending the owner's decision** |
| Builder pack set (281) | Open Food Facts / Open Beauty Facts (P2): database ODbL-1.0, images CC BY-SA 3.0, community-entered | `~/LENSIQ-field/product-check/public-photos` | kept |
| Fresh face set (independent reviewer; 110 images, 271 faces) | Open Images V7 **test** split; images CC BY 2.0 (each image checked), annotations CC BY 4.0 | `~/LENSIQ-field/face-blur/fresh/manifest.jsonl`, `CREDITS.tsv` | **images deleted 2026-11-10 06:09 +07 at the owner's request; manifest kept** |
| Fresh pack set (independent reviewer; 196, no P2 barcode) | Open Food Facts / Open Beauty Facts: ODbL-1.0 / CC BY-SA 3.0 | `~/LENSIQ-field/face-blur/fresh/packs` | kept |

### 6.2 Fresh set, picked setting (3 x 3, 0.5, pad 0.15; source: public dataset, independent reviewer's run, re-checked)

Never used for any choice before this review. The reviewer re-measured all 54 sweep rows of §2 / §5 identically.

| Metric | builder held-out | **fresh set** |
|---|---|---|
| (a) label readable after blur | 64 / 68 = 94.1 % [85.8 – 97.7] | **91 / 101 = 90.1 % [82.7 – 94.5]** |
| (b) real faces left unblurred (< 50 % covered) | 42 / 152 = 27.6 % [21.1 – 35.2] | **94 / 271 = 34.7 % [29.3 – 40.5]** |
| stricter: faces less than 90 % covered | 58 / 152 = 38.2 % [30.8 – 46.1] | 109 / 271 = 40.2 % [34.6 – 46.2] |
| close-ups (face wider than 35 % of the image) left unblurred | 1 / 16 = 6.3 % [1.1 – 28.3] | **7 / 25 = 28.0 % [14.3 – 47.6]** |
| (c) packs without a person with >= 1 region | 48 / 126 = 38.1 % | 74 / 196 = 37.8 % [31.3 – 44.7] |

Fresh (b) by face width: < 20 px 21 / 24 · 20 - 40 px 41 / 56 · 40 - 80 px 18 / 72 · 80 - 160 px 4 / 59 · **>= 160 px 10 / 60 =
16.7 %**. Large and frame-filling faces are missed more often on the fresh set than on the builder set (2.6 % held-out
for >= 160 px): the builder held-out figures were optimistic. **The 90 % bar for (a) holds only at the point estimate on
both sets (lower bounds 81.0 % dev, 82.7 % fresh); dev passes by one pack.**

### 6.3 Round 3: close-up pass (tuned on DEV only; builder held-out reported once; fresh packs now seen)

Pass added (`LQPCRun.faceRuns({close})`, `faceClose`): the whole frame letterboxed on a grey 640 px square so that it
fills `close` of the side (0.5 / 0.65 / 0.8), so a face larger than the frame's short side, or cut by the frame edge, is
inside the model's view with a margin. Boxes map back to frame pixels. Swept with 3 x 3 tiles x threshold 0.4 / 0.5 / 0.6
x pad 0 / 0.15 (24 settings, including the 6 without the pass); same sets, split, metrics and pick rule (§1.3, §1.4,
§1.6). Run: `node tools/pc-faceblur-eval.mjs --round3` (raw `~/LENSIQ-field/face-blur/eval/faceblur-round3-2026-11-10.json`,
log `eval-run3.log`); the 6 rows without the pass reproduce §5 exactly.

| Setting | (a) readable after blur, dev | (b) real faces unblurred, dev | (a) held-out | (b) held-out | (c) clean packs with a region (all) | blurred area of clean packs (mean) | (b<90 %) dev | close-ups missed, dev |
|---|---|---|---|---|---|---|---|---|
| 3x3 tiles · thr 0.4 · pad 0.00 · close off | 54 / 64 = 84.4 % [73.6 % – 91.3 %] | 41 / 161 = 25.5 % [19.4 % – 32.7 %] | 57 / 68 = 83.8 % [73.3 % – 90.7 %] | 31 / 152 = 20.4 % [14.8 % – 27.5 %] | 167 / 270 = 61.9 % [55.9 % – 67.4 %] | 11.0 % | 96 / 161 = 59.6 % [51.9 % – 66.9 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.4 · pad 0.00 · close 0.50 | 48 / 64 = 75.0 % [63.2 % – 84.0 %] | 39 / 161 = 24.2 % [18.3 % – 31.4 %] | 50 / 68 = 73.5 % [62.0 % – 82.6 %] | 29 / 152 = 19.1 % [13.6 % – 26.1 %] | 178 / 270 = 65.9 % [60.1 % – 71.3 %] | 19.1 % | 82 / 161 = 50.9 % [43.3 % – 58.5 %] | 2 / 19 = 10.5 % [2.9 % – 31.4 %] |
| 3x3 tiles · thr 0.4 · pad 0.00 · close 0.65 | 47 / 64 = 73.4 % [61.5 % – 82.7 %] | 36 / 161 = 22.4 % [16.6 % – 29.4 %] | 47 / 68 = 69.1 % [57.4 % – 78.8 %] | 28 / 152 = 18.4 % [13.1 % – 25.3 %] | 183 / 270 = 67.8 % [62.0 % – 73.1 %] | 17.9 % | 86 / 161 = 53.4 % [45.7 % – 61.0 %] | 1 / 19 = 5.3 % [0.9 % – 24.6 %] |
| 3x3 tiles · thr 0.4 · pad 0.00 · close 0.80 | 51 / 64 = 79.7 % [68.3 % – 87.7 %] | 37 / 161 = 23.0 % [17.2 % – 30.1 %] | 51 / 68 = 75.0 % [63.6 % – 83.8 %] | 29 / 152 = 19.1 % [13.6 % – 26.1 %] | 178 / 270 = 65.9 % [60.1 % – 71.3 %] | 15.1 % | 87 / 161 = 54.0 % [46.3 % – 61.6 %] | 2 / 19 = 10.5 % [2.9 % – 31.4 %] |
| 3x3 tiles · thr 0.4 · pad 0.15 · close off | 52 / 64 = 81.3 % [70.0 % – 88.9 %] | 39 / 161 = 24.2 % [18.3 % – 31.4 %] | 51 / 68 = 75.0 % [63.6 % – 83.8 %] | 29 / 152 = 19.1 % [13.6 % – 26.1 %] | 170 / 270 = 63.0 % [57.1 % – 68.5 %] | 16.4 % | 48 / 161 = 29.8 % [23.3 % – 37.3 %] | 2 / 19 = 10.5 % [2.9 % – 31.4 %] |
| 3x3 tiles · thr 0.4 · pad 0.15 · close 0.50 | 44 / 64 = 68.8 % [56.6 % – 78.8 %] | 34 / 161 = 21.1 % [15.5 % – 28.1 %] | 42 / 68 = 61.8 % [49.9 % – 72.4 %] | 27 / 152 = 17.8 % [12.5 % – 24.6 %] | 181 / 270 = 67.0 % [61.2 % – 72.4 %] | 26.2 % | 42 / 161 = 26.1 % [19.9 % – 33.4 %] | 1 / 19 = 5.3 % [0.9 % – 24.6 %] |
| 3x3 tiles · thr 0.4 · pad 0.15 · close 0.65 | 46 / 64 = 71.9 % [59.9 % – 81.4 %] | 33 / 161 = 20.5 % [15.0 % – 27.4 %] | 44 / 68 = 64.7 % [52.8 % – 75.0 %] | 25 / 152 = 16.4 % [11.4 % – 23.2 %] | 184 / 270 = 68.1 % [62.4 % – 73.4 %] | 24.8 % | 41 / 161 = 25.5 % [19.4 % – 32.7 %] | 0 / 19 = 0.0 % [0.0 % – 16.8 %] |
| 3x3 tiles · thr 0.4 · pad 0.15 · close 0.80 | 48 / 64 = 75.0 % [63.2 % – 84.0 %] | 32 / 161 = 19.9 % [14.4 % – 26.7 %] | 43 / 68 = 63.2 % [51.4 % – 73.7 %] | 26 / 152 = 17.1 % [11.9 % – 23.9 %] | 181 / 270 = 67.0 % [61.2 % – 72.4 %] | 21.6 % | 42 / 161 = 26.1 % [19.9 % – 33.4 %] | 0 / 19 = 0.0 % [0.0 % – 16.8 %] |
| 3x3 tiles · thr 0.5 · pad 0.00 · close off | 59 / 64 = 92.2 % [83.0 % – 96.6 %] | 53 / 161 = 32.9 % [26.1 % – 40.5 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 45 / 152 = 29.6 % [22.9 % – 37.3 %] | 99 / 270 = 36.7 % [31.1 % – 42.6 %] | 4.7 % | 106 / 161 = 65.8 % [58.2 % – 72.7 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.5 · pad 0.00 · close 0.50 | 58 / 64 = 90.6 % [81.0 % – 95.6 %] | 51 / 161 = 31.7 % [25.0 % – 39.2 %] | 59 / 68 = 86.8 % [76.7 % – 92.9 %] | 43 / 152 = 28.3 % [21.7 % – 35.9 %] | 113 / 270 = 41.9 % [36.1 % – 47.8 %] | 9.3 % | 95 / 161 = 59.0 % [51.3 % – 66.3 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.5 · pad 0.00 · close 0.65 | 56 / 64 = 87.5 % [77.2 % – 93.5 %] | 51 / 161 = 31.7 % [25.0 % – 39.2 %] | 59 / 68 = 86.8 % [76.7 % – 92.9 %] | 43 / 152 = 28.3 % [21.7 % – 35.9 %] | 112 / 270 = 41.5 % [35.8 % – 47.4 %] | 9.2 % | 100 / 161 = 62.1 % [54.4 % – 69.2 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.5 · pad 0.00 · close 0.80 | 55 / 64 = 85.9 % [75.4 % – 92.4 %] | 48 / 161 = 29.8 % [23.3 % – 37.3 %] | 62 / 68 = 91.2 % [82.1 % – 95.9 %] | 44 / 152 = 28.9 % [22.3 % – 36.6 %] | 111 / 270 = 41.1 % [35.4 % – 47.1 %] | 7.6 % | 98 / 161 = 60.9 % [53.2 % – 68.1 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| **3x3 tiles · thr 0.5 · pad 0.15 · close off** | 58 / 64 = 90.6 % [81.0 % – 95.6 %] | 50 / 161 = 31.1 % [24.4 % – 38.6 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 42 / 152 = 27.6 % [21.1 % – 35.2 %] | 102 / 270 = 37.8 % [32.2 % – 43.7 %] | 7.2 % | 62 / 161 = 38.5 % [31.3 % – 46.2 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.5 · pad 0.15 · close 0.50 | 57 / 64 = 89.1 % [79.1 % – 94.6 %] | 45 / 161 = 28.0 % [21.6 % – 35.3 %] | 59 / 68 = 86.8 % [76.7 % – 92.9 %] | 40 / 152 = 26.3 % [20.0 % – 33.8 %] | 116 / 270 = 43.0 % [37.2 % – 48.9 %] | 12.7 % | 56 / 161 = 34.8 % [27.9 % – 42.4 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.5 · pad 0.15 · close 0.65 | 54 / 64 = 84.4 % [73.6 % – 91.3 %] | 47 / 161 = 29.2 % [22.7 % – 36.6 %] | 60 / 68 = 88.2 % [78.5 % – 93.9 %] | 41 / 152 = 27.0 % [20.5 % – 34.5 %] | 113 / 270 = 41.9 % [36.1 % – 47.8 %] | 12.7 % | 57 / 161 = 35.4 % [28.4 % – 43.1 %] | 2 / 19 = 10.5 % [2.9 % – 31.4 %] |
| 3x3 tiles · thr 0.5 · pad 0.15 · close 0.80 | 54 / 64 = 84.4 % [73.6 % – 91.3 %] | 44 / 161 = 27.3 % [21.0 % – 34.7 %] | 61 / 68 = 89.7 % [80.2 % – 94.9 %] | 40 / 152 = 26.3 % [20.0 % – 33.8 %] | 114 / 270 = 42.2 % [36.5 % – 48.2 %] | 10.9 % | 53 / 161 = 32.9 % [26.1 % – 40.5 %] | 2 / 19 = 10.5 % [2.9 % – 31.4 %] |
| 3x3 tiles · thr 0.6 · pad 0.00 · close off | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 62 / 161 = 38.5 % [31.3 % – 46.2 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 53 / 152 = 34.9 % [27.7 % – 42.7 %] | 48 / 270 = 17.8 % [13.7 % – 22.8 %] | 1.8 % | 116 / 161 = 72.0 % [64.7 % – 78.4 %] | 5 / 19 = 26.3 % [11.8 % – 48.8 %] |
| 3x3 tiles · thr 0.6 · pad 0.00 · close 0.50 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 59 / 161 = 36.6 % [29.6 % – 44.3 %] | 66 / 68 = 97.1 % [89.9 % – 99.2 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 58 / 270 = 21.5 % [17.0 % – 26.8 %] | 4.7 % | 107 / 161 = 66.5 % [58.9 % – 73.3 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.6 · pad 0.00 · close 0.65 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 60 / 161 = 37.3 % [30.2 % – 45.0 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 49 / 152 = 32.2 % [25.3 % – 40.0 %] | 57 / 270 = 21.1 % [16.7 % – 26.4 %] | 3.9 % | 108 / 161 = 67.1 % [59.5 % – 73.9 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.6 · pad 0.00 · close 0.80 | 63 / 64 = 98.4 % [91.7 % – 99.7 %] | 58 / 161 = 36.0 % [29.0 % – 43.7 %] | 68 / 68 = 100.0 % [94.7 % – 100.0 %] | 50 / 152 = 32.9 % [25.9 % – 40.7 %] | 52 / 270 = 19.3 % [15.0 % – 24.4 %] | 2.9 % | 107 / 161 = 66.5 % [58.9 % – 73.3 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.6 · pad 0.15 · close off | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 59 / 161 = 36.6 % [29.6 % – 44.3 %] | 67 / 68 = 98.5 % [92.1 % – 99.7 %] | 52 / 152 = 34.2 % [27.1 % – 42.1 %] | 48 / 270 = 17.8 % [13.7 % – 22.8 %] | 2.9 % | 72 / 161 = 44.7 % [37.3 % – 52.4 %] | 4 / 19 = 21.1 % [8.5 % – 43.3 %] |
| 3x3 tiles · thr 0.6 · pad 0.15 · close 0.50 | 61 / 64 = 95.3 % [87.1 % – 98.4 %] | 57 / 161 = 35.4 % [28.4 % – 43.1 %] | 65 / 68 = 95.6 % [87.8 % – 98.5 %] | 50 / 152 = 32.9 % [25.9 % – 40.7 %] | 58 / 270 = 21.5 % [17.0 % – 26.8 %] | 6.0 % | 69 / 161 = 42.9 % [35.5 % – 50.6 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.6 · pad 0.15 · close 0.65 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 58 / 161 = 36.0 % [29.0 % – 43.7 %] | 64 / 68 = 94.1 % [85.8 % – 97.7 %] | 48 / 152 = 31.6 % [24.7 % – 39.3 %] | 57 / 270 = 21.1 % [16.7 % – 26.4 %] | 5.3 % | 68 / 161 = 42.2 % [34.9 % – 50.0 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |
| 3x3 tiles · thr 0.6 · pad 0.15 · close 0.80 | 62 / 64 = 96.9 % [89.3 % – 99.1 %] | 56 / 161 = 34.8 % [27.9 % – 42.4 %] | 67 / 68 = 98.5 % [92.1 % – 99.7 %] | 49 / 152 = 32.2 % [25.3 % – 40.0 %] | 52 / 270 = 19.3 % [15.0 % – 24.4 %] | 4.2 % | 67 / 161 = 41.6 % [34.3 % – 49.3 %] | 3 / 19 = 15.8 % [5.5 % – 37.6 %] |

**Pick rule result: the close-up pass is NOT adopted.** 11 of 24 settings reach (a) >= 90 % on dev; the lowest dev (b)
among them is still **3 x 3 · 0.5 · pad 0.15 · close off** (the current default, now explicit as `close: 0`). Every
close-up variant at 0.5 / pad 0.15 drops dev (a) to 84.4 - 89.1 %: the letterboxed whole-pack view finds extra "faces"
in pack art and logos (blurred area of clean packs 7.2 % -> 10.9 - 12.7 %).

What the pass would buy, at 0.5 / pad 0.15 (for the owner; not a pick):

| close | close-ups missed, dev | close-ups missed, builder held-out | faces < 90 % covered, held-out | (a) dev | (a) fresh packs (now seen) |
|---|---|---|---|---|---|
| off (default) | 3 / 19 | 1 / 16 | 58 / 152 | 90.6 % | 91 / 101 = 90.1 % [82.7 – 94.5] |
| 0.5 | 3 / 19 | 0 / 16 | 51 / 152 | 89.1 % | 78 / 101 = 77.2 % [68.1 – 84.3] |
| 0.65 | 2 / 19 | 0 / 16 | 52 / 152 | 84.4 % | 82 / 101 = 81.2 % [72.5 – 87.6] |
| 0.8 | 2 / 19 | 0 / 16 | 55 / 152 | 84.4 % | 85 / 101 = 84.2 % [75.8 – 90.0] |

Fresh packs (196, "now seen" — the reviewer has already reported on them; not used to pick) confirm the cost: every
close-up variant at 0.5 / pad 0.15 lowers (a) by 6 - 13 points and raises (c) from 37.8 % to 42.3 - 45.4 %.
**The close-up pass could not be measured on the fresh FACE set**: its images were deleted at the owner's request, and I
did not download them again. Re-measuring needs the owner's approval to fetch those 110 test-split images again (or a new
set).

Time cost (this M1; phone = estimate 3 - 6x): the close-up pass adds a median of 13 - 17 ms (p90 15 - 19 ms) per 1,600 px
photo and 10 - 12 ms per 400 px pack, on top of 217 ms (p90 268 ms) for 3 x 3 + frame + upload in this run.

Options for the close-up gap (owner decision; each needs a dev-only sweep):
- run the close-up pass with its own, higher threshold (only very confident close-up faces are blurred);
- run it only when the frame-level run found nothing, or only for the whole-frame upload case;
- accept it: the preview shows the picture and a frame-filling face is the easiest kind for the user to see.

### 6.4 Code fixes from the review (2026-11-10)

- **Same picture:** `faceRuns` copies the picture before its first await and builds every pass and the upload image
  from that copy; `prepareUpload` keeps a generation counter (bumped by every new / cleared picture) and checks it after
  the await (result `{cancelled, reason: "changed"}`), and is guarded by the tab's busy flag (`{cancelled, reason:
  "busy"}`). New e2e check: picture repainted mid-search -> the preview is the original picture; picture cleared
  mid-search -> cancelled, no preview, no encode; second call while busy -> refused.
- **faceBlurPlan defaults fail closed for direct callers:** `need` defaults to every supplied run plus frame and upload;
  `loaded` must be exactly `true`; an invalid `scale` is text only; any malformed run (e.g. a duplicate scope whose
  faces is not an array) is text only; a plain array of faces is one frame run (text only unless `need` says otherwise).
  New unit test.
- **EN plural:** "1 face region blurred" / "N face regions blurred" (new key `md.pc.up.n1`; Thai and Chinese have no
  plural form; both use the same pattern). e2e checks 1 and 2.

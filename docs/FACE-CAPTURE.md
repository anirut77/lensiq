# Face capture (faceread): bank-style guide

Owner order 2026-11-16, item A (testers had to stretch the arm fully before the page accepted the face).
Code: `lensiq-facecap.js` (LQFaceCap, loaded when the camera starts), `faceread.js` (camera loop, mode and consent, capture).
Tests: `tests/unit/face-capture.test.js`, `tests/e2e/face-capture.e2e.mjs` (Chrome, Android profile),
`tests/e2e/face-capture-webkit.e2e.mjs` (WebKit, iPhone), fixed set `tests/fixtures/face-capture/set.json`, locked in
`~/LENSIQ-field/evals/face-capture/` (`evals-locks/face-capture.sha256`).
All accuracy figures here are **synthetic** (a computed face through a camera model). None is from a real phone yet; the
owner's testers check it on real phones before go-live.

## 1. Cause: what the old page asked for

The old page had two size rules.

1. The Read button (`FR.quality`): face box width at least 110 px and at least 0.16 of the picture's short side. That
   allows a face up to about 1.1-1.3 m away. It was not the problem.
2. The live hint and the green oval (`LQHint` with `far: 0.5, near: 1.05`): `r = sqrt(face box area / oval box area)`,
   with the oval box 0.48 x 0.624 of the short side. "Too close, move back" when `r > 1.05` (leaving it needs `r <= 1.0`),
   "too far" when `r < 0.5`. Users wait for the green oval and follow the line, so this rule decided where they held the
   phone.

The face box comes from TinyFaceDetector. Its size relative to the eye distance (k = sqrt(box w x h) / eye distance) is
about 2.4-2.8 (estimate: 2.78 for the test face `FR.synthFace`; real detector boxes are a little tighter). Converted to
distance with the camera model below (eye distance 63 mm):

| Camera | "move back" below | must go back to | "move closer" beyond |
|---|---|---|---|
| iPhone front, 23 mm, 16:9 | 31-36 cm | 33-38 cm | 65-76 cm |
| Android front, 25 mm, 16:9 | 34-39 cm | 35-41 cm | 71-83 cm |
| iPhone front, 23 mm, 4:3 | 23-27 cm | 24-29 cm | 49-57 cm |

So on the usual 16:9 video the green zone started at about 33-41 cm and was centred near 50 cm: a normal bent arm
(30-40 cm) sat on or inside the "move back" edge. On top of that, the drawn oval was only 48 % of the width, smaller than a
face at 30-40 cm (about 50 % of the width), so people backed off to fit their face inside it. Result: arm fully stretched.

## 2. Camera model and the new range

A lens of focal length f (35 mm-equivalent; the 35 mm frame is 36 x 24 mm, diagonal 43.27 mm) on a 4:3 sensor covers
34.62 x 25.96 equivalent-mm (0.8 and 0.6 of the diagonal). A 16:9 video mode keeps the long side and crops the short side
to 34.62 x 9/16 = 19.47 mm. Held upright, the short side is the picture width. A face at distance d with eye distance IPD:

    eye distance / picture width = IPD x f / (d x Weq)      Weq = 19.47 mm (16:9) or 25.96 mm (4:3)

Inputs: iPhone 12-16 front camera about 23 mm-equivalent; Android mid-range front cameras about 24-26 mm; rear main
camera about 26 mm (coordinator brief, from public spec sheets and reviews; to be confirmed on the testers' phones).
Mean adult eye distance 63 mm, adult range about 58-68 mm (Dodgson 2004, "Variation and extrema of human interpupillary
distance", Proc. SPIE 5291).

Eye distance as a share of the picture width (IPD 63 mm):

| Camera | 25 cm | 30 cm | 35 cm | 40 cm | 50 cm | 60 cm |
|---|---|---|---|---|---|---|
| iPhone front 23 mm, 16:9 | 0.298 | 0.248 | 0.213 | 0.186 | 0.149 | 0.124 |
| iPhone front 23 mm, 4:3 | 0.223 | 0.186 | 0.159 | 0.140 | 0.112 | 0.093 |
| Android front 24 mm, 16:9 | 0.311 | 0.259 | 0.222 | 0.194 | 0.155 | 0.129 |
| Android front 25 mm, 16:9 | 0.324 | 0.270 | 0.231 | 0.202 | 0.162 | 0.135 |
| Android front 26 mm, 16:9 | 0.337 | 0.280 | 0.240 | 0.210 | 0.168 | 0.140 |
| Android front 25 mm, 4:3 | 0.243 | 0.202 | 0.173 | 0.152 | 0.121 | 0.101 |

**New rule**: eye distance (centre of points 36-41 to centre of 42-47) divided by the picture's short side, accepted from
**0.12 to 0.32**; hysteresis 0.003 (leaving "far" needs 0.123, leaving "near" 0.317; 0.01 trapped a 58 mm face at 40 cm on a
4:3 iPhone picture in "too far" when it came from further away, review 2026-11-17). No pixel size anywhere: the same face
in a bigger or smaller picture gets the same answer. 30-40 cm passes on every camera above for eye distances 58-68 mm
(smallest: 0.129 for a 58 mm eye distance at 40 cm on a 4:3 iPhone picture; largest: 0.302 for 68 mm at 30 cm on a 26 mm
Android). As distances (63 mm), from the formula; the synthetic face model gives about 2 cm less at both ends because its
landmark eye centres sit at 93-98 % of the IPD (iPhone 16:9 about 21-60 cm, 4:3 15-45, Android 24/25/26 mm 22-63 / 23-66 /
24-68, Android 4:3 17-49, rear 24-68):

| Camera | "move back a little" below | "move closer" beyond |
|---|---|---|
| iPhone front 16:9 | 23 cm | 62 cm |
| iPhone front 4:3 | 17 cm | 47 cm |
| Android 24 / 25 / 26 mm, 16:9 | 24 / 25 / 26 cm | 65 / 67 / 70 cm |
| Android 25 mm, 4:3 | 19 cm | 51 cm |

The oval is drawn for a face at about 35-40 cm: centre (0.5 W, 0.42 H), radii 0.27 x 0.36 of the short side. The face
centre (eye midpoint + 0.2 x eye-to-chin) must be within 0.4 of the oval radii (leaving "off the oval" needs 0.33).

Known effect: at 30 cm the nose is about 9 % nearer than the eyes' plane distance, so it looks about 5 % larger than at
60 cm (perspective). The reading uses ratios of landmark distances; a field check of whether 30 cm and 50 cm give the
same reading on the same person is on the testers' list.

## 3. Guidance: one instruction at a time

Priority order (the first that applies is shown; `classify()` in `lensiq-facecap.js`):

| # | State | Self (front camera) TH | Rear camera (person holding the phone) TH | Rule |
|---|---|---|---|---|
| 1 | multi | ให้มีคนเดียวในกรอบ | ให้มีคนเดียวในภาพ | more than one face |
| 2 | near | ใกล้ไป ถอยออกหน่อย | ถอยโทรศัพท์ออกเล็กน้อย | eye distance > 0.32 |
| 3 | cut | ใบหน้าเกินขอบภาพ ขยับให้ทั้งหน้าอยู่ในวงรี | ใบหน้าของเขาเกินขอบภาพ ... | jaw, chin or forehead at/past an edge |
| 4 | out | ให้อยู่ในกรอบ | เล็งให้ใบหน้าของเขาอยู่ในวงรี | no face, or centre off the oval |
| 5 | far | ไกลไป ขยับเข้ามาใกล้อีกนิด | ขยับโทรศัพท์เข้าไปใกล้อีกนิด | eye distance < 0.12 |
| 6 | dark | มืดไป เพิ่มแสงอีกหน่อย | มืดไป ย้ายไปที่สว่างขึ้น | face luma < 65 |
| 7 | backlight | แสงอยู่ด้านหลัง หันหน้าเข้าหาแสง | แสงอยู่ด้านหลังเขา ... | background >= 170 and >= face + 70 |
| 8 | turn | หันหน้าตรงเข้ากล้อง | ขอให้เขาหันหน้าตรงเข้ากล้อง | yaw ratio > 0.14 (the reading's own rule) |
| 9 | tilt | มองตรง ตั้งศีรษะให้ตรง | ขอให้เขาตั้งศีรษะตรง ... | roll > 9 degrees (the reading's own rule) |
| 10 | chinUp | เงยคางขึ้นเล็กน้อย | ขอให้เขาเงยคางขึ้นเล็กน้อย | nose/chin height ratio > 0.46 (chin down about 20 degrees) |
| 11 | chinDown | ก้มคางลงเล็กน้อย | ขอให้เขาก้มคางลงเล็กน้อย | ratio < 0.16 (chin up about 14 degrees) |
| 12 | glare | แว่นสะท้อนแสง ขยับมุมแว่นหรือเลี่ยงแสงที่ส่องตรง | แว่นของเขาสะท้อนแสง ... | >= 8 % saturated white in a lens area |
| 13 | blur | ภาพไม่ชัด เช็ดเลนส์กล้องแล้วถือให้นิ่ง | ภาพไม่ชัด ... ถือโทรศัพท์ให้นิ่ง | edge-width ratio >= 2 |
| 14 | still | อยู่นิ่ง ๆ สักครู่ | ถือโทรศัพท์นิ่ง ๆ สักครู่ | all pass but the face moved in the last 0.7 s |
| 15 | ok | ดีแล้ว อยู่นิ่ง ๆ | ดีแล้ว ถือโทรศัพท์นิ่ง ๆ | all pass |

English and Chinese for every line are in the same file (`DICT`). The oval is green for ok and still, grey otherwise.
A new state shows after 300 ms (no flicker), but green never lingers: when a check fails the line changes at once.

Why this order: framing first (who, how big, where), then light (other checks are unreliable in the dark), then head
pose, then glasses and sharpness, then "hold still".

Image checks run on a few hundred samples of the frame the page already reads; nothing is kept.

- Blur: on the strongest 5 % of edges in the brow/eye band, the step over 16 sample widths divided by the largest of its
  four 4-sample sub-steps (sample width = max(1 px, eye distance / 120)). 1.0 = crisp, up to 4.0 = an edge wider than
  16 samples. Blur at >= 2 (an edge wider than about 0.07 eye distances, about 4 mm on the face). Synthetic set: sharp
  1.01-1.27, slight softness 1.50, blurred 2.30-2.53.
- Glare: share of samples with all three channels >= 240 in each lens area (0.84 x 0.6 eye distances around each eye);
  >= 8 % and face not overexposed. Synthetic set: 0 without glare, 0.22 with glare.
- Backlight: background samples beside and above the head vs the cheeks/nose/mouth area. Synthetic set: face 84,
  background 250 with a bright window; 157-171 vs 158 otherwise.

## 4. Automatic and manual capture

- 3-2-1 (0.8 s each) runs only while the oval is green and the face stays within 0.12 eye distances (and 6 % of its
  size) of where the count started; any move restarts at 3. Then the page takes ~10 frames of the same face, as before.
- Selfie: one automatic capture per person: after a capture (automatic or manual) the next automatic one waits until the
  oval has been off green for 1.5 s.
- Rear camera: one consent tick = one person. After each capture the tick is cleared and the camera stops; the next person
  needs a new tick and a new start (review D2).
- The manual button (อ่านโหงวเฮ้ง) works whenever exactly one face is found, whatever the guidance says. It is off with no
  face (nothing to read) and with two or more faces (never read a bystander; existing locked rule). A manual capture taken
  while the oval is not green shows the reading with the line "ถ่ายก่อนวงรีเป็นสีเขียว ผลอาจคลาดเคลื่อน" (EN "results may be
  off", ZH "结果可能有偏差"), like the photo upload (review D4).

## 5. Rear camera: photographing someone else

Buttons above the camera: "ถ่ายตัวเอง (กล้องหน้า)" / "ถ่ายให้คนอื่น (กล้องหลัง)". The rear option shows the consent line
"ถ่ายภาพคนอื่นได้เฉพาะเมื่อเจ้าตัวรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้" and a tick box; the camera
button stays off until it is ticked. A back camera reached any other way (the flip control or the camera list) without the
tick is closed at once and the consent box is shown. Unticking while the back camera is on stops it at once and cancels a
running count; nothing is read (review D1). Guidance in rear mode is worded for the person holding the phone, and the
English button reads "Read their face".

Known gap: a back camera that reports neither a facing mode nor a recognisable name ("back", "rear", ...) is treated as a
front camera by LQCam, so a back camera reached through the camera list on such a device would not be caught by the
consent check. Low risk on iOS and Android (both report the facing); listed for the testers.

## 6. Side views (item 5): not added

The reading uses only the 68 front-face points (`FR.measure` in `faceread.js`). Ears are not analysed at all ("ภาพหน้าตรง
มองไม่เห็นรูปทรงหู ระบบจึงไม่อ่านส่วนนี้", `faceread-kb.js`); the nose bridge is the front-view length 27-30 (the profile
height is listed as not measurable); the jaw is the front-view jaw line (points 2-14). No feature reads a side view, so no
left/right steps were added. Adding them would need new ear/profile analysis (a scope change for the owner).

## 7. Other face-photo pages

Only faceread takes a face photo for a reading. palm uses a hand; the look preview (`lensiq-look-preview.js`) is a live
mirror for styling, not a capture; luckycolor reads clothing colours. None of them shares this component.

## 8. Privacy and speed

On-device only: numbers from the detector and pixel samples of the frame already on the page; no picture stored or sent;
no liveness, identity, emotion or beauty judgement. `lensiq-facecap.js` (about 32 KB, 11 KB gzipped) is fetched when the
camera starts, together with the models, so the page weight at load is unchanged.

Memory (review D3): the checks read only the region around the face (and a 32 x 32 copy when no face is found), reuse their
typed buffers and select the top 5 % instead of sorting. faceread JS heap peak, tests/e2e/phone-memory.e2e.mjs, 60 s, local
headless Chrome, 2 runs each: fd52345 9.8 / 10.8 MB (budget 10 MB), round 2 7.1 / 5.9 MB; main about 6.3-6.5 MB (reviewer's
local runs). pixelChecks about 2.8 ms per call in Node on a 16:9 picture (was 14-25 ms).

## 9. Testers' checklist (real phones; everything above is synthetic)

**Real-device result (field, owner-run, 2026-11-17):** all 10 steps below passed on an iPhone 16 Pro (iOS 27.0.1, Safari)
and on a Samsung Galaxy S23 Ultra (Chrome), on the live page (main `94115ae`, live 12:01). Pass / fail only: the owner did
not record green distance, time to green, blur / glare false alarms, far-edge flicker or the 30 vs 50 cm difference, so
those stay open for a later tester. Source: owner test 2026-11-17; log in `docs/PHONE-QUALITY.md` section 5.

1. At a normal bent arm (30-40 cm) the oval turns green without stretching the arm. Note the phone model and the distance
   where it turns green.
2. How often green is never reached. Head turn is strict: the "face forward" limit (yaw ratio 0.14, the reading's own rule)
   is about 5 degrees on the synthetic face, and landmark jitter makes it worse. Reviewer simulation (Gaussian landmark
   noise, 12 s at 4 fps, needs 10 green frames in a row), share of tries that never reach green:

   | Noise (sigma, x eye distance) | Turned 0 deg | Turned 3 deg | Turned 5 deg |
   |---|---|---|---|
   | 0.02 | 0 % | 0 % | 100 % |
   | 0.04 | 0 % | 11.5 % | 100 % |
   | 0.06 | 0 % | 46.5 % | 100 % |

   A real head probably turns less per degree than the synthetic one (its nose is relatively deep). The manual button
   always works.
3. False "ภาพไม่ชัด" (blur) on phones whose front camera smooths skin (beauty mode, many Android phones), and false
   "แว่นสะท้อนแสง" (glare) under a ring light or bright overhead light with over-exposed skin under the eyes. These
   thresholds are synthetic only.
4. Backlight by a window: the "แสงอยู่ด้านหลัง" line appears, and goes when the person turns to the light.
5. The same person at 30 cm and at 50 cm: the readings should be close (perspective makes the nose about 5 % larger at 30 cm).
6. Rear camera: consent tick before start; unticking stops the camera; after one capture the tick is cleared. Try the camera
   list on a phone with several back cameras (see the known gap above). Unticking during the reading itself: no reading is
   shown and the line asks for consent again (re-review N2).
7. Watch for flicker between "ไกลไป" and green at the far edge (re-review N1): with hysteresis 0.003 the margin is small
   (the synthetic 4:3 iPhone, 58 mm, 40 cm case clears it by 0.0003). Possible later fix, only if testers see it: lower the
   far limit to about 0.115. The locked set is not changed for this.

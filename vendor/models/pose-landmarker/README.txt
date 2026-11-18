Pose Landmarker (lite) for the LENSIQ Try-On page (tryon.html / tryon.js): body point positions only, to place and scale
a garment picture (tops, outerwear, dresses, skirts, trousers) on the person in the camera picture or in a photo the
person picks, front view. Loaded only when the visitor picks one of those items. Runs on the device; no picture leaves it.
vendor/models/pose-landmarker/

It is never used to identify, recognise, match, describe or score a person, and never for surveillance. One person only:
the page places nothing when it finds more than one body.

File                       Bytes      sha256
pose_landmarker_lite.task  5,777,746  59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a
  (unchanged; a ZIP, stored, of two members)
    pose_detector.tflite             2,959,078 bytes  sha256 46837eb883e6ec75b52c5f5ff6a9b78bd35e66c13f95e8c3566c582d146cb1d9
    pose_landmarks_detector.tflite   2,818,390 bytes  sha256 ad6cfd3c903eb31a4ee788b809e45ecf9fa69923b69b9f3f2d9ae616ff433e58

Source (downloaded 2026-11-18):
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
  Google Cloud Storage generation 1682624736756847, Last-Modified Thu, 27 Apr 2023 19:45:36 GMT, 5,777,746 bytes,
  md5 04a75ddf7c811ac7a1a4523266dd7d88 (x-goog-hash).
  Listed on https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker .
  Not modified by the LENSIQ project.

Licence: Apache License, Version 2.0. The model card says "LICENSED UNDER Apache License, Version 2.0":
  "Model Card BlazePose GHUM 3D" (MediaPipe BlazePose GHUM 3D; date April 16, 2021; authors Valentin Bazarevsky,
  Ivan Grishchenko, Eduard Gabriel Bazavan, Google),
  https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf (read 2026-11-18).
  Copyright Google LLC / The MediaPipe Authors. LICENSE here is the Apache-2.0 text.
  Training data (per the card): images captured by Google with smartphone cameras through an AR application, including
  consented images (30K) and fitness poses (85K); not an academic dataset with separate terms.
  Runtime: the vendored MediaPipe Tasks Vision bundle (vendor/mediapipe/, Apache-2.0, already listed).

Model-card scope:
  Intended uses: 3D full body pose estimation for single-person videos on mobile, desktop and in browser; augmented
  reality; the primary intended application is entertainment; "not intended for human life-critical decisions".
  Out of scope (quoted): "Multiple people in an image"; "People too far away from the camera (e.g. further than 14
  feet/4 meters)"; "Head is not visible"; "Applications requiring metric accurate depth";
  "Any form of surveillance or identity recognition is explicitly out of scope and not enabled by this technology".
  LENSIQ use: AR preview of where a garment sits (augmented reality = intended use). One person only; nothing is measured
  in centimetres and no size is recommended; the depth value is not used.
  Card fairness numbers (lite model, PDJ / PCK@0.2, Google's own evaluation set): 87.0 % average over 14 regions (range
  83.2-89.7), skin tone range 80.5-87.8 %, perceived gender 86.0 % / 89.1 %. These are the card's numbers, not LENSIQ's.

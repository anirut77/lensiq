Face gate for LENSIQ Product Check (lensiq-pc-run.js faceCheck(), decision LQPC.faceGate() in lensiq-pc.js)
vendor/models/face-gate/

Purpose: block any image upload (Product Check image mode, phase P7) when a face may be in the frame or the crop.
It FAILS CLOSED: no model, no WebGL, or any error -> blocked. It is never used to identify, count or describe people.

File                              Source                                                                                                   Bytes      sha256
blaze_face_short_range.tflite     https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite   229,746  b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f
Downloaded 2026-11-09, unchanged. Listed on https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector .

Licence: Apache License 2.0 — the model card says "LICENSED UNDER Apache License, Version 2.0":
  "MediaPipe BlazeFace Model Card (Short Range)" (June 9, 2021),
  https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
  Copyright Google LLC / The MediaPipe Authors. LICENSE here is the Apache-2.0 text.
Model-card scope: "Any form of surveillance or identity recognition is explicitly out of scope" — LENSIQ uses it only to
stop an upload. The card's out-of-scope cases (faces far away, turned away, strongly tilted) are exactly the misses a
gate must expect, so the gate runs the model on the whole frame, on 2 x 2 overlapping tiles (60 % of each side, so small
or background faces are enlarged), and on the crop, uses a low threshold (0.3) and treats every failure as "blocked".

Not vendored: blaze_face_full_range.tflite (Apache-2.0 too, 1,083,786 bytes,
sha256 3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b). The vendored MediaPipe
Tasks bundle rejects it at run time ("raw_box_tensor->shape().dims[1] == num_boxes_ (2304 vs. 896)": its FaceDetector graph
is built for the short-range anchors), so the tiles above replace it.

Runtime: the already vendored MediaPipe Tasks Vision bundle (vendor/mediapipe/vision_bundle.mjs, FaceDetector, CPU
delegate). MediaPipe Tasks uploads images through WebGL even on the CPU delegate, so a browser without WebGL cannot run
the detector and the gate stays closed there (text-only fallback in P7).

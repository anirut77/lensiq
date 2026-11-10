Face Landmarker for LENSIQ Exam (lensiq-exam-face.js, exam-lab.html): face presence, face count and head pose only.
vendor/models/face-landmarker/

It is never used to identify, match, describe or score a person, and never for expression: the facial-movement score
model that Google ships inside the original bundle has been REMOVED from this file (see "Changes").

File                     Bytes      sha256
face_landmarker_lm.task  2,803,152  56224ce15fcbff363ed5ce9a9a17761b9b9fd8f3a03bbe0bf94ea900e1f2cd57

Source (downloaded 2026-11-10):
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  Google Cloud Storage generation 1683136941916318, Last-Modified Wed, 03 May 2023 18:02:21 GMT, 3,758,596 bytes,
  sha256 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
  Listed on https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker .

Changes (Apache-2.0 section 4(b): this file was modified by the LENSIQ project, 2026-11-10):
  The original .task is a ZIP (stored, no compression) of four members. This file keeps three of them byte for byte and
  drops the fourth (the 52-coefficient facial-movement model, 955,312 bytes), so the Exam build cannot compute it even
  by mistake. Nothing else is changed.
    face_detector.tflite                            229,746 bytes  sha256 b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f
                                                    (identical to vendor/models/face-gate/blaze_face_short_range.tflite)
    face_landmarks_detector.tflite                2,553,590 bytes  sha256 c7d54204ce0448474c7f3fa9af494787c0965cbdd6f20fc72867e43046bd43d5
    geometry_pipeline_metadata_landmarks.binarypb    19,376 bytes  sha256 bdbcda96dfcb7da883da124aaa2c55dee49770d934f0fcc71747f8c21bdc75b4
  Rebuild: python3 -c "import zipfile as z; a=z.ZipFile('face_landmarker.task'); b=z.ZipFile('face_landmarker_lm.task','w');
    [b.writestr(i, a.read(i.filename)) for i in a.infolist() if i.filename != 'face_blendshapes.tflite']; b.close()"
  The vendored MediaPipe Tasks Vision bundle loads it unchanged (checked 2026-11-10: same landmarks and matrix as the
  original on the same frame). tests/unit/exam-face.test.js fails if a fourth member comes back.

Licence: Apache License 2.0 — the model card says "LICENSED UNDER Apache License, Version 2.0":
  "Model Card MediaPipe Face Mesh V2" (model date September 15, 2022, authors Geng Yan and Ivan Grishchenko, Google),
  https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
  The detector inside is BlazeFace short range, "MediaPipe BlazeFace Model Card (Short Range)" (2021-06-09), Apache-2.0.
  Copyright Google LLC / The MediaPipe Authors. LICENSE here is the Apache-2.0 text.
  Training data (per the card): images captured by Google with smartphone cameras in real-world conditions through an AR
  application; evaluated across 17 geographic subregions, perceived gender and Fitzpatrick skin tone.

Model-card scope: intended use "AR entertainment"; out of scope: "human life-critical decisions"; "Predicted face
landmarks do not provide facial recognition or identification and do not store any unique face representation."
LENSIQ Exam uses the landmarks only to count faces and estimate head pose; every flag goes to an invigilator, who
decides (docs/EXAM.md). The card notes that quality drops for faces far from the camera, in extreme light and with
heavy occlusion; Exam's measured numbers per condition are in docs/exam/FACE-ENGINE-RESULTS.md.

Runtime: the vendored MediaPipe Tasks Vision bundle (vendor/mediapipe/vision_bundle.mjs, FaceLandmarker, CPU delegate,
IMAGE mode). MediaPipe uploads frames through a GL context even on the CPU delegate: on a Mac headless Chrome with every
WebGL context disabled detect() throws ("activeTexture"); CI's Linux Chrome runs it while reporting no WebGL. The
Exam lab page decides by the actual failure (no WebGL probe) and then switches the face signals off and says so; it
never falls back to another face model.

LPD-YuNet licence-plate detector (OpenCV Zoo) — vendor/models/plate-det/license_plate_detection_lpd_yunet_2023mar.onnx

Source:   https://github.com/opencv/opencv_zoo/tree/main/models/license_plate_detection_yunet
          file license_plate_detection_lpd_yunet_2023mar.onnx (fp32), unchanged; sha256 below
Licence:  Apache License 2.0 (see LICENSE in this folder). The OpenCV Zoo model README says: "All files in this directory
          are licensed under Apache 2.0 License". Contributed by Dong Xu (watrix.ai). Training code reference:
          https://github.com/ShiqiYu/libfacedetection.train
Training data: Chinese licence plates (the dataset is not named in the model README; most likely CCPD, MIT). Not trained
          on Thai plates: it finds close, single-line plates and often covers only the top line of 2- / 3-line plates.
Input "input" [1,3,240,320] BGR 0..255 (no normalisation), fixed shape. Outputs loc [4385,14], conf [4385,2], iou [4385,1].
Decoded by lensiq-plate.js yunetPriors() / yunetDecode() (priors on strides 8/16/32/64, 4 corner points, score =
sqrt(cls * iou), NMS) and run by modelBoxes() on the whole frame + 2 x 2 overlapping tiles, ONNX Runtime Web WASM, no WebGL.
Used by parking.html / village.html (LENSIQ Gate) as ONE proposal source of the plate finder (LQPlate.findPlates); it is
loaded with the OCR model and is optional — the classical finder works without it.

Why fp32 and not the 1.1 MB int8 file: measured on onnxruntime-web WASM (1 thread, Chrome headless, macOS, 2026-11-08):
int8 ~430 ms per 320x240 inference vs fp32 ~70 ms, and the int8 scores were lower on the same photos (0.86-0.99 vs
0.92-1.00). Detection numbers: docs/GATE.md "Plate detector (round 15)" and tools/plate-det-eval.mjs.

6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7  vendor/models/plate-det/license_plate_detection_lpd_yunet_2023mar.onnx

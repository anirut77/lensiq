YOLOX-Nano (416x416) person/COCO detector — vendor/models/yolox/yolox_nano_416.onnx

Source:   https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx
          (official ONNX export by Megvii, unchanged; sha256 below)
Licence:  Apache License 2.0 (see LICENSE in this folder), Copyright (c) 2021-2022 Megvii Inc.
Paper:    Ge, Liu, Wang, Li, Sun. "YOLOX: Exceeding YOLO Series in 2021". arXiv:2107.08430
Weights trained on MS COCO 2017 (annotations CC BY 4.0; images under their Flickr licences).
Input "images" [1,3,416,416] BGR 0..255 letterboxed top-left on grey 114; output [1,3549,85]
(raw box offsets per grid cell, strides 8/16/32, sigmoid objectness + 80 class scores). Decoded by
lensiq-detect.js decodeYolox(); runs on ONNX Runtime Web WASM (vendor/ort), no WebGL.
Used by store.html (people counting); COCO-SSD (vendor/models/cocossd) stays as the fallback.
Accuracy and latency: ACCURACY.md section 1.
c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d  vendor/models/yolox/yolox_nano_416.onnx

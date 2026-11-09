Multilingual text detection + recognition for LENSIQ Product Check (lensiq-pc-run.js, medicine.html "Product check" tab)
vendor/models/pc-ocr/   (the Thai recogniser is shared with LENSIQ Gate: vendor/models/plate-ocr-th/)

All files are the official PaddlePaddle ONNX exports on Hugging Face, unchanged; dict.txt files are the
PostProcess.character_dict lists of each model's inference.yml, one symbol per line (same extraction as
plate-ocr-th/dict.txt, which reproduces that file byte for byte). Downloaded 2026-11-09.
Licence: Apache License 2.0 for every model (model card "license: apache-2.0"; PaddleOCR repository Apache-2.0) — see
LICENSE here. Copyright (c) PaddlePaddle Authors.

File                                   Source (huggingface.co/PaddlePaddle/<repo> @ revision)           Bytes        sha256
ppocrv5_mobile_det.onnx                PP-OCRv5_mobile_det_onnx @ e6f4fa85f00e168c862bc462aebca69eef9b3d3d   4,826,518  a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d
ppocrv5_mobile_rec.onnx                PP-OCRv5_mobile_rec_onnx @ ed152b8b495f84de93cda5709d768548a9127622  16,534,782  da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092
ppocrv5_mobile_rec.dict.txt            (inference.yml of the same repo) 18,383 symbols                     74,012  d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b
korean_ppocrv5_mobile_rec.onnx         korean_PP-OCRv5_mobile_rec_onnx @ 5c6f574b8e2230adf4287b33e736d71b9fabd28e  13,418,787  92f0b7785e64fc9090106a241cf4c1eb97472824558272751b88a2a4476d3a08
korean_ppocrv5_mobile_rec.dict.txt     (inference.yml) 11,945 symbols                                      47,451  a88071c68c01707489baa79ebe0405b7beb5cca229f4fc94cc3ef992328802d7
latin_ppocrv5_mobile_rec.onnx          latin_PP-OCRv5_mobile_rec_onnx @ 89d3a50e2c27e2e7cceeab0e944c25c807d5db4f   8,042,023  7888113072263cb471b93f66dd5e2ad70548dc526fa1ace760d0d973dd121498
latin_ppocrv5_mobile_rec.dict.txt      (inference.yml) 836 symbols                                          2,616  ccbcc45730b3fbbd9050c5bc74db6a99067141ef1035e3d14889a84a6b9b1aff

Detection (DB): input "x" [1, 3, H, W] float32, BGR, ImageNet mean / std applied in that channel order, long side
<= 960, both sides a multiple of 32 (inference.yml DetResizeForTest / NormalizeImage). Output [1, 1, H, W]
probability map; post-processing (thresh 0.3, box_thresh 0.6, unclip 1.5) is LQPC.dbBoxes() in lensiq-pc.js: an
axis-aligned box per text component, plus a rotated rectangle (orientation from the component's second moments, like
PaddleOCR's minimum-area box) for lines tilted by 3 degrees or more; the reader crops along the rotated rectangle.
Recognition: input [1, 3, 48, W] BGR, (v/255 - 0.5)/0.5; output [1, T, n+2] (blank 0, dict 1..n, space last), greedy CTC
in LQPC.ctcDecode(). Scripts: PP-OCRv5_mobile_rec = simplified + traditional Chinese, Japanese, English;
korean_ = Korean + English; latin_ = about 50 Latin-script languages (Vietnamese, Malay, Indonesian, French, German …).

Accuracy: PaddleOCR's own benchmark only (vendor numbers, not product packs). Measured numbers for LENSIQ — public
photo set and synthetic labels, with sources — are in docs/product-check/P2-RESULTS.md.
Not used: Surya, EasyOCR, MMOCR, TrOCR, Florence-2 (licence or language reasons, design §3.1).

Thai text-line recogniser for LENSIQ Gate (lensiq-plate.js OCR hook) — vendor/models/plate-ocr-th/

Model:    th_PP-OCRv5_mobile_rec (PaddleOCR PP-OCRv5, Thai mobile text-line recogniser, CTC head)
Source:   https://huggingface.co/PaddlePaddle/th_PP-OCRv5_mobile_rec_onnx  (official PaddlePaddle ONNX export, unchanged)
          files: inference.onnx -> th_ppocrv5_mobile_rec.onnx ; inference.yml PostProcess.character_dict -> dict.txt
Licence:  Apache License 2.0 (model card "license: apache-2.0"; PaddleOCR repository Apache-2.0) — see LICENSE here.
Size:     7,891,015 bytes (7.5 MiB) · dict.txt 524 symbols (Latin, digits, punctuation, Thai letters / vowels / tone
          marks / Thai digits). Output classes = 1 (CTC blank, index 0) + 524 + 1 (space, use_space_char).
Input:    "x" [N, 3, 48, W] float32, BGR, (pixel/255 - 0.5) / 0.5, height 48, width = 48 * aspect (dynamic, <= 3200);
Output:   [N, W/8, 526] per-step class probabilities (softmax) — greedy CTC decode in lensiq-plate.js ctcDecode().
Training data: general Thai text lines (PaddleOCR synthetic + collected text); NOT trained on Thai licence plates.
          It reads plate line 1 (letters + digits) reasonably on clean, front-on crops but is not a plate-specific
          model: accuracy at a real gate is unknown until the on-site accuracy check (gate pages) has been run.
          Province (line 2) is chosen from a pick-list, not read freely.
Runtime:  ONNX Runtime Web WASM (vendor/ort), no WebGL; loaded only when the operator turns on "auto-read".

sha256
27618be66018f8598ac0a526a593f9f1cebf794e7eded93428e8fb016e537f5f  th_ppocrv5_mobile_rec.onnx
57f5406f94bb6688fb7077f7be65f08bbd71cecf48c01ea26c522cb5c4836b7a  dict.txt

Plate DETECTOR: not vendored. open-image-models "yolo-v9-t-*-license-plate-end2end" (MIT repository) was considered;
it is a YOLOv9 network (reference implementation GPL-3.0) trained on a dataset whose licence is not documented, so its
commercial status is unclear ("licence check pending"). lensiq-plate.js exposes LQPlate.registerDetector() for a
reviewed model and ships a classical edge-density plate finder + "tap the plate" manual crop instead.

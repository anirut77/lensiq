# Third-party components and licences

Inventory of everything LENSIQ vendors, loads or depends on. It was compiled from `vendor/`, the file headers, `requirements.txt` and the installed `.venv` metadata, and is accurate as of 2026-11-06.

**This is not legal advice.** Licence status of ML *weights* and their *training data* is unsettled. Have counsel review every item marked other than "OK" before any paid or commercial use.

The repository's own code (`*.html`, `*.js`, `*.css`, `*.py` outside `vendor/`) is **MIT**, Copyright (c) 2026 anirut77 (see [`/LICENSE`](../LICENSE)). The MIT licence does **not** extend to the components below.

Status legend: **OK** (permissive, keep the notice) · **OK-ATTR** (permissive, attribution or NOTICE required) · **COPYLEFT** (usable, with source-disclosure obligations) · **RESTRICTED** (commercial use needs a paid licence or carries significant conditions) · **NON-COMMERCIAL** (cannot be used commercially as-is) · **VERIFY** (the licence is permissive but provenance or training-data terms are uncertain)

---

## Flags (action required before commercial use)

| # | Component | Status | Why | Recommended action |
|---|---|---|---|---|
| F1 | `vendor/models/faceparse-bisenet-r18-q8.onnx` (studio face parsing) | **NON-COMMERCIAL** | The code is MIT (yakhyo/face-parsing), but the weights were trained on **CelebAMask-HQ**, whose terms allow only non-commercial research and educational use. The file is git-ignored and **off by default** (`LENSIQ_FACEPARSE=false`). | Keep it disabled. Do not ship the file. The default studio parser is now Google MediaPipe Selfie Multiclass (Apache-2.0, `vendor/models/selfie-multiclass-256-f16.onnx`, see `vendor/models/SELFIE-MULTICLASS-LICENSE.txt`); colour clustering (`StudioCore.heuristicParse`) is only a last resort. |
| F2 | IDM-VTON try-on model (`cuuupid/idm-vton` on Replicate, called by `tryon.py`) | **NON-COMMERCIAL** | IDM-VTON (yisol/IDM-VTON) weights are released under **CC BY-NC-SA 4.0**. Running them through Replicate does not change the model licence. | Leave try-on disabled (no `REPLICATE_API_TOKEN`) for paid use, or switch `REPLICATE_TRYON_MODEL` to a model with commercial terms. |
| F3 | PyMuPDF 1.24.14 (`fitz`, server PDF repair) | **RESTRICTED** (AGPL-3.0 or Artifex commercial licence) | AGPL obligations apply when the converter is offered over a network: you must provide the complete corresponding source of the server to users. | Buy an Artifex commercial licence, **or** keep `/api/convert` internal and not offered to customers, **or** publish full server source under AGPL, **or** replace it with a permissive pipeline (e.g. pdfminer.six (MIT) / pypdf (BSD) plus python-docx (MIT)). |
| F4 | pdf2docx 0.5.8 (server PDF to DOCX) | **COPYLEFT** (GPL-3.0) | The package metadata says "GPL v3". It is used only server-side. GPL is triggered on distribution, so distributing `server.py` bundled with it (e.g. on a shipped appliance) requires GPL compliance. It also depends on PyMuPDF (F3). | Same remedy as F3. Treat the converter as an optional, separately licensed add-on. |
| F5 | face-api.js models: **age/gender**, **expression**, **tiny face detector**, **68-landmark** | **VERIFY** (weights MIT, training data restricted) | The weights are MIT (justadudewhohacks/face-api.js, repackaged by vladmandic/face-api). Per the upstream docs, age/gender was trained on **UTKFace** (non-commercial research only) and related academic sets (IMDB-WIKI, research use). The expression model was trained on FER-style public datasets with unclear licensing. The detector and landmarks were trained on academic face sets (e.g. WIDER FACE, 300-W/iBUG-type data) that are non-commercial. Whether weights inherit dataset terms is legally unsettled. | Get a legal opinion. For strict compliance, disable age/gender in signage (it is opt-in already) and consider commercially licensed models. At minimum, disclose that the estimates are probabilistic. |
| F6 | face-api.js **face recognition** model (ResNet-34, 128-D) | **VERIFY** | A port of dlib's `dlib_face_recognition_resnet_model_v1`. Davis King released the dlib model weights into the public domain (CC0), but they were trained on face datasets (e.g. VGG Face, FaceScrub) that have their own research terms. | Same as F5. This model processes biometric data, so also see the DPIA. |
| F7 | MODNet portrait matting (`vendor/models/modnet.onnx`) | **VERIFY** (currently Apache-2.0) | ZHKKKe/MODNet now states that "code, models, and demos ... are released under the Apache License 2.0". **Earlier releases were CC BY-NC-SA 4.0.** The ONNX file comes from the Xenova/modnet conversion. Confirm that the weights you ship come from a post-relicence release and keep a copy of that licence text. | Record the source commit and licence snapshot. Fallback: MediaPipe selfie segmenter (Apache-2.0, already vendored), which gives lower edge quality. |
| F8 | Rider–Waite–Smith tarot scans (`vendor/tarot/`) | **VERIFY** (public domain in US/TH) | The 1909 artwork by Pamela Colman Smith (d. 1951) is public domain in the US and in life+50/70 jurisdictions including Thailand (life+50). The scans come from Wikimedia Commons, where faithful scans of 2-D PD works are treated as PD. "Rider-Waite" is a **trademark** of U.S. Games Systems. | Do not use "Rider-Waite" as a product name or brand. Keep `vendor/tarot/CREDITS.txt`. |
| F9 | Google Fonts – *Prompt* | **OK-ATTR** (SIL OFL 1.1) – privacy note | The font licence is fine. Loading it from `fonts.googleapis.com` discloses visitor IPs to Google (see the PDPA data map). | Self-host the font files for strict deployments. Keep the OFL text with them. |

Everything else below is permissive (MIT / Apache-2.0 / BSD) and needs only the notice or attribution to be kept.

---

## Browser libraries (`vendor/`)

| Component | Version | Source | Licence | Status | Obligations |
|---|---|---|---|---|---|
| `face-api.js` (vladmandic/face-api) | 1.7.12 | https://github.com/vladmandic/face-api | MIT | OK | Keep the copyright and MIT notice |
| TensorFlow.js (bundled inside `face-api.js`: core, converter, cpu, webgl, wasm backends) | 4.7.0 | https://github.com/tensorflow/tfjs | Apache-2.0 | OK-ATTR | Keep the licence and NOTICE. State changes. |
| `tfjs-backend-wasm.wasm`, `-simd.wasm`, `-threaded-simd.wasm` | 4.7.0 | as above | Apache-2.0 | OK-ATTR | as above |
| MediaPipe Tasks Vision (`vendor/mediapipe/vision_bundle.mjs`, `wasm/vision_wasm_*`) | 0.10.x (version not embedded in the bundle) | https://github.com/google-ai-edge/mediapipe · npm `@mediapipe/tasks-vision` | Apache-2.0 | OK-ATTR | Keep the licence and NOTICE |
| onnxruntime-web (`vendor/ort/ort.wasm.min.js`, `ort-wasm-simd-threaded.{mjs,wasm}`) | 1.20.1 | https://github.com/microsoft/onnxruntime | MIT | OK | Keep the notice. ORT also ships ThirdPartyNotices; include them. |
| pdf.js (`pdf.min.js`, `pdf.worker.min.js`) | 3.11.174 | https://github.com/mozilla/pdf.js | Apache-2.0 | OK-ATTR | Keep the licence header (present in the files) |
| `docx` (dolanmiu/docx, UMD build `vendor/docx.js`) | version not embedded (bundles JSZip 3.10.1) | https://github.com/dolanmiu/docx | MIT | OK | Keep the notice. JSZip is dual MIT/GPL-3.0; use it under MIT. |

## Models (`vendor/models/`)

| File(s) | Size | Used by | Source | Licence (weights) | Status |
|---|---|---|---|---|---|
| `tiny_face_detector_model.*` | 0.19 MB | all face pages | face-api.js (justadudewhohacks / vladmandic) | MIT | VERIFY (F5) |
| `face_landmark_68_model.*` | 0.35 MB | all face pages | face-api.js | MIT | VERIFY (F5) |
| `face_expression_model.*` | 0.32 MB | neuro, booth, signage, photobooth | face-api.js | MIT | VERIFY (F5) |
| `age_gender_model.*` | 0.42 MB | signage (opt-in setting) | face-api.js | MIT | VERIFY (F5, UTKFace) |
| `face_recognition_model.*` | 6.1 MB | customers, attendance, booth | face-api.js port of dlib ResNet | MIT (port) / dlib weights CC0 | VERIFY (F6) |
| `cocossd/` (graph model, 5 shards) | 18 MB | store (person detection) | TensorFlow.js models `coco-ssd` (SSD MobileNet), trained on COCO | Apache-2.0 | OK-ATTR. COCO annotations are CC BY 4.0, and images keep their Flickr licences; this is generally accepted for trained weights. |
| `mobilenet/` (MobileNetV2 graph model, 4 shards) | 13 MB | checkout (product embedding), store (optional re-ID) | TF Hub / tfjs-models `mobilenet` | Apache-2.0 | OK-ATTR. Trained on ImageNet (research terms); widely used commercially. Note this. |
| `hand/detector`, `hand/landmark` (TF.js graph models) | 3.9 MB | palm, signage fallback (`lensiq-hand.js`) | MediaPipe Hands (lite) TF.js port, tfjs-models `handpose`/`hand-pose-detection` | Apache-2.0 | OK-ATTR |
| `hand_landmarker.task` (hand_detector.tflite + hand_landmarks_detector.tflite) | 7.5 MB | signage (MediaPipe) | Google MediaPipe model zoo (model card) | Apache-2.0 | OK-ATTR. Follow the model card's fairness and intended-use notes. |
| `selfie_segmenter.tflite` (selfiesegmentation_mlkit 256×256) | 0.24 MB | photobooth | Google MediaPipe model zoo | Apache-2.0 | OK-ATTR |
| `modnet.onnx` | 25 MB | photobooth HQ, studio | ZHKKKe/MODNet via Xenova/modnet | Apache-2.0 (current) | VERIFY (F7) |
| `selfie-multiclass-256-f16.onnx` | 7.8 MB | studio (default parser) | Google MediaPipe Selfie Multiclass 256×256, converted TFLite→ONNX fp16 | Apache-2.0 (model card, May 2023) | OK for commercial use; out-of-scope per card: surveillance, identity recognition |
| `faceparse-bisenet-r18-q8.onnx` (**git-ignored**, local only, off by default) | 13 MB | studio (optional) | yakhyo/face-parsing (MIT code); trained on CelebAMask-HQ | MIT code / CelebAMask-HQ non-commercial | **NON-COMMERCIAL** (F1). See `vendor/models/FACEPARSE-LICENSE.txt`. |

## Assets

| Asset | Source | Licence | Status |
|---|---|---|---|
| `vendor/tarot/*.jpg` (78 cards) | Wikimedia Commons, RWS 1909 "Roses & Lilies" scans, resized to 260 px. Per-file sources in `vendor/tarot/CREDITS.txt`. | Public domain | VERIFY (F8, trademark only) |
| Google Fonts *Prompt* (weights 300–700), loaded from `fonts.googleapis.com` / `fonts.gstatic.com` | https://fonts.google.com/specimen/Prompt (Cadson Demak) | SIL OFL 1.1 | OK-ATTR (F9 privacy) |
| Knowledge-base text (`*-kb.js`) | Original text by the project. Cited URLs (Wikipedia, Thai media, etc.) are references, not copied content, and are not fetched at runtime. | MIT (project) | OK. Spot-check that no passages were copied verbatim from the cited sites. |

No page loads scripts from a CDN. A scan of `*.html` for `https://` (excluding `vendor/`) found only Google Fonts and plain reference links in body text.

## Python dependencies (`requirements.txt`, used only by `server.py` / `tryon.py`)

| Package | Version (in `.venv`) | Licence | Status | Notes |
|---|---|---|---|---|
| Flask (+ Werkzeug, Jinja2, click, itsdangerous, blinker, MarkupSafe) | 3.1.3 | BSD-3-Clause | OK | |
| pdf2docx | 0.5.8 | GPL-3.0 | **COPYLEFT** (F4) | Pulls in python-docx (MIT), fonttools (MIT), numpy (BSD), opencv-python-headless (Apache-2.0), fire (Apache-2.0) |
| PyMuPDF (`fitz`) | 1.24.14 (pinned) | AGPL-3.0 / Artifex commercial | **RESTRICTED** (F3) | |
| anthropic (Claude SDK) | 0.125.0 | MIT | OK | Pulls in httpx (BSD), pydantic (MIT), anyio (MIT), distro (Apache-2.0), jiter (MIT). Use of the Claude API is governed by Anthropic's Commercial Terms. |

The `.venv` also contains `onnxruntime` 1.19.2 (MIT) and `sympy` / `coloredlogs` (BSD/MIT), which are not in `requirements.txt` and appear to be leftovers from offline model-conversion work. They are not imported by `server.py`.

## Cloud services (only when the operator configures keys)

| Service | Used for | Terms | Notes |
|---|---|---|---|
| Anthropic Claude API (USA) | `/api/fortune` rewording of derived facts | Anthropic Commercial Terms / Usage Policy | Cross-border transfer (see `docs/pdpa/`) |
| Replicate (USA) | `/api/tryon` | Replicate Terms + **the hosted model's own licence** (IDM-VTON: CC BY-NC-SA 4.0, F2) | Sends photos. Cross-border transfer. |

## Keeping this file current

When adding anything under `vendor/` or to `requirements.txt`, add a row with its version, source, licence and status. Also put its licence text next to the file (as `FACEPARSE-LICENSE.txt` and `tarot/CREDITS.txt` do) when the licence requires the text to be distributed.

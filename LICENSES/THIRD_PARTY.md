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
| F2 | Virtual try-on models (`tryon.py`, via Replicate) | **RESOLVED in default config** — try-on is **off** unless the operator attests a licence | IDM-VTON (yisol/IDM-VTON), OOTDiffusion, StableVITON, CatVTON, LaDI-VTON and similar open try-on weights are **CC BY-NC-SA 4.0** (non-commercial). Running them through Replicate does not change the model licence. Since v0.10 there is **no default model**: `/api/tryon` is enabled only when `REPLICATE_API_TOKEN` + `REPLICATE_TRYON_MODEL` + `LENSIQ_TRYON_LICENSE=commercial` are all set. Model names matching the known NC families are refused as `commercial` (`reason: model-is-noncommercial`); they run only with `LENSIQ_TRYON_LICENSE=noncommercial-demo`, which `/api/tryon/status` reports as `noncommercial: true` and the server logs at start-up. | For paid use pick a model or provider with written commercial terms and keep that evidence (contract/licence page snapshot + date) with the deployment record. Options and the adapter contract: [`docs/TRYON-LICENSING.md`](../docs/TRYON-LICENSING.md). Tests: `tests/python/test_licensing.py`. |
| F3 | PyMuPDF 1.24.14 (`fitz`) | **RESOLVED in default config** — opt-in only (AGPL-3.0 or Artifex commercial licence) | AGPL obligations apply when the converter is offered over a network. Since v0.10 PyMuPDF is **not** in `requirements.txt` and is never imported unless `LENSIQ_CONVERT_ENGINE=pdf2docx` (a test asserts the default path never imports `fitz`/`pdf2docx`). It lives in `requirements-agpl.txt`. | Default engine needs nothing. If you opt in: buy an Artifex licence, **or** keep `/api/convert` internal, **or** publish the full service source under AGPL-3.0. |
| F4 | pdf2docx 0.5.8 | **RESOLVED in default config** — opt-in only (GPL-3.0) | As F3: moved to `requirements-agpl.txt`, used only with `LENSIQ_CONVERT_ENGINE=pdf2docx`. The default `/api/convert` engine is `pdfconvert.py` "permissive": **pdfplumber** (MIT) → **pdfminer.six** (MIT) + **pypdfium2** (BSD-3/Apache-2.0, bundles PDFium BSD-3) + **Pillow** (MIT-CMU), writing with **python-docx** (MIT). It keeps headings (font-size), bold/italic, tables and page breaks, but not pixel layout or images; the browser fallback (pdf.js + docx, Apache-2.0/MIT) is unchanged. | None for the default. Same as F3 if you opt in. |
| F5 | face-api.js models: **age/gender**, **expression**, **tiny face detector**, **68-landmark** | **VERIFY** (weights MIT, training data restricted) | The weights are MIT (justadudewhohacks/face-api.js, repackaged by vladmandic/face-api). Per the upstream docs, age/gender was trained on **UTKFace** (non-commercial research only) and related academic sets (IMDB-WIKI, research use). The expression model was trained on FER-style public datasets with unclear licensing. The detector and landmarks were trained on academic face sets (e.g. WIDER FACE, 300-W/iBUG-type data) that are non-commercial. Whether weights inherit dataset terms is legally unsettled. | Get a legal opinion. For strict compliance, disable age/gender in signage (it is opt-in already) and consider commercially licensed models. At minimum, disclose that the estimates are probabilistic. |
| F6 | face-api.js **face recognition** model (ResNet-34, 128-D) | **VERIFY** | A port of dlib's `dlib_face_recognition_resnet_model_v1`. Davis King released the dlib model weights into the public domain (CC0), but they were trained on face datasets (e.g. VGG Face, FaceScrub) that have their own research terms. | Same as F5. This model processes biometric data, so also see the DPIA. |
| F7 | MODNet portrait matting (`vendor/models/modnet.onnx`) | **OK-ATTR** (Apache-2.0 re-checked 2026-11-07, audit A3) | ZHKKKe/MODNet now states that "code, models, and demos ... are released under the Apache License 2.0". **Earlier releases were CC BY-NC-SA 4.0.** The ONNX file comes from the Xenova/modnet conversion. Confirm that the weights you ship come from a post-relicence release and keep a copy of that licence text. | Record the source commit and licence snapshot. Fallback: MediaPipe selfie segmenter (Apache-2.0, already vendored), which gives lower edge quality. |
| F8 | Rider–Waite–Smith tarot scans (`vendor/tarot/`) | **VERIFY** (public domain in US/TH) | The 1909 artwork by Pamela Colman Smith (d. 1951) is public domain in the US and in life+50/70 jurisdictions including Thailand (life+50). The scans come from Wikimedia Commons, where faithful scans of 2-D PD works are treated as PD. "Rider-Waite" is a **trademark** of U.S. Games Systems. | Do not use "Rider-Waite" as a product name or brand. Keep `vendor/tarot/CREDITS.txt`. |
| F9 | *Prompt* font | **RESOLVED** — self-hosted (SIL OFL 1.1) | The pages no longer contact `fonts.googleapis.com` / `fonts.gstatic.com`: woff2 subsets (thai, latin, latin-ext × 300–700, ~140 KB total) are in `vendor/fonts/prompt/` with `OFL.txt`, declared in `styles.css`. The CSP no longer allows any Google origin. `tools/check-external.mjs` proves in headless Chrome that no page makes a third-party request. Chinese text uses the visitor's OS CJK font (no CJK web font is vendored). | Keep `OFL.txt` with the files. Do not rename the font to "Prompt" if you modify it (OFL Reserved Font Name rules). |

Everything else below is permissive (MIT / Apache-2.0 / BSD) and needs only the notice or attribution to be kept.

## Audit 2026-11-07 (shipped files vs. this inventory)

Method: every file published by `tools/build-site.mjs --list` under `vendor/` was matched to a row here; file headers
were read for embedded notices; upstream licence pages were re-checked where marked. Not legal advice.

| # | Finding | Severity | Action taken / needed |
|---|---|---|---|
| A1 | Every shipped model and library has a row above; nothing unlisted is published. `faceparse-bisenet-r18-q8.onnx` (F1, non-commercial) exists only in local working copies: it is git-ignored and refused by both `build-site.mjs` (FORBIDDEN) and the no-git walk. | OK | None. Keep the build guard and its unit test. |
| A2 | **Notice texts were missing from the published site.** `vendor/face-api.js`, `vendor/docx.js` (with JSZip) and `vendor/mediapipe/` carry no licence header, and the Apache-2.0 models (coco-ssd, mobilenet, hand, MediaPipe tasks, MODNet) shipped without the licence text that Apache-2.0 §4(a) and MIT require with redistributed copies. Only YOLOX, Selfie Multiclass, pdf.js and ORT carried their own text. | Fixed | Added `LICENSES/THIRD-PARTY-NOTICES.txt` (published with the site: copyright holders, Apache-2.0 and MIT full text, OFL pointer, ODC-BY and COCO attributions), linked from about.html. `about.html` also lacked a YOLOX-Nano row (the default store detector since v0.10): added. |
| A3 | F7 MODNet: the ZHKKKe/MODNet README ("code, models, and demos … released under the Apache License 2.0") and the Hugging Face page `Xenova/modnet` (licence tag apache-2.0) both state Apache-2.0, checked 2026-11-07. | Reduced to OK-ATTR | Save dated snapshots of both pages with the release record. The exact upstream commit of the converted weights is still unrecorded. |
| A4 | F5 age/gender (UTKFace-trained, non-commercial research terms on the data) remains the main open question. `signage.js` loaded `age_gender_model` at start-up (fixed in round 10, see Status) even though it is only *used* when the operator ticks the demographic option (`settings.useDemo`, off by default). | Code change done (round 10); legal opinion still open | `signage.js` now loads `ageGenderNet` lazily, only when the age/gender option is on (also when it is switched on later), and `lensiq-config.js` has `window.LENSIQ_AGE_GENDER` (default `true` for the demo; `false` hides the option and never loads the model) for commercial deployments until counsel clears it. The option and the expression features (smile / valence / mood) are labelled "research-licence model — check licence before commercial use". The legal question is in `docs/LEGAL-REVIEW-PACK.md` §3. |
| A5 | F6/F5 face detector, landmarks, expression, recognition: weights MIT/CC0, training data academic. Same open question as A4 but these models are core to most face pages. | Open — legal opinion | Covered by the review pack; fallback plan there (commercially licensed face SDK) if counsel advises against. |
| A6 | Cloud services (Anthropic, Cloudflare, Opn, Google sign-in) are used under their commercial terms; none is a redistributed asset. | OK | Keep the signed/accepted terms and DPAs with the release record. |

**A4 update (round 16, customer mode by default).** `lensiq-config.js` now defaults `LENSIQ_PROFILE` to `"commercial"` on every host,
including the public GitHub Pages site. In that mode `LENSIQ_AGE_GENDER`, `LENSIQ_EXPRESSION` and `LENSIQ_FACEPARSE` are all `false`:
the age/gender and expression weights are never requested (network-checked by `tests/e2e/research-switch.e2e.mjs`). A per-device
"Research demo" toggle (`lensiq-research.js`, off by default, shown at `cameras.html#profile` and on signage, neuro, booth and
photobooth) brings the two models back on that device only, with the licence label in TH/EN/ZH and a link to F5 above. A customer
installation sets `LENSIQ_RESEARCH_DEMO = false`, which locks the toggle off; the go-live checklist (`lensiq-golive.js`,
`tools/check-legal.mjs`) reports `config.profile` / `config.age_gender` as done only when that lock is set. Open: `?faceparse=1` in
`studio.js` / `photobooth-hq.js` is not yet under this lock (the BiSeNet file is not in git, so the public site cannot load it).
The legal question for F5/F6 itself is unchanged.


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
| `qrcode-generator` (kazuhikoarase, `vendor/qrcode-generator/qrcode.js`) | 2.0.4 | https://github.com/kazuhikoarase/qrcode-generator | MIT | OK | Keep the notice (`vendor/qrcode-generator/LICENSE`). Used by parking / village (PromptPay and visitor-pass QR, round 13). |

## Models (`vendor/models/`)

| File(s) | Size | Used by | Source | Licence (weights) | Status |
|---|---|---|---|---|---|
| `tiny_face_detector_model.*` | 0.19 MB | all face pages | face-api.js (justadudewhohacks / vladmandic) | MIT | VERIFY (F5) |
| `face_landmark_68_model.*` | 0.35 MB | all face pages | face-api.js | MIT | VERIFY (F5) |
| `face_expression_model.*` | 0.32 MB | neuro, booth, signage, photobooth — **research demo only** (round 16: never loaded in customer mode, the default) | face-api.js | MIT | VERIFY (F5) |
| `age_gender_model.*` | 0.42 MB | signage (opt-in setting) — **research demo only** (round 16: never loaded in customer mode, the default) | face-api.js | MIT | VERIFY (F5, UTKFace) |
| `face_recognition_model.*` | 6.1 MB | customers, attendance, booth | face-api.js port of dlib ResNet | MIT (port) / dlib weights CC0 | VERIFY (F6) |
| `yolox/yolox_nano_416.onnx` | 3.7 MB | store (person detection, default since v0.10; runs on onnxruntime-web WASM) | Megvii YOLOX-Nano, official ONNX release 0.1.1rc0, unchanged, trained on COCO 2017 | Apache-2.0 (`vendor/models/yolox/LICENSE`, provenance + sha256 in `README.txt`) | OK-ATTR. Not Ultralytics/AGPL. COCO annotations CC BY 4.0, images keep their Flickr licences (same position as COCO-SSD). |
| `cocossd/` (graph model, 5 shards) | 18 MB | store (person detection — fallback when ONNX Runtime is unavailable, `?coco`) | TensorFlow.js models `coco-ssd` (SSD MobileNet), trained on COCO | Apache-2.0 | OK-ATTR. COCO annotations are CC BY 4.0, and images keep their Flickr licences; this is generally accepted for trained weights. |
| `mobilenet/` (MobileNetV2 graph model, 4 shards) | 13 MB | checkout (product embedding), store (optional re-ID) | TF Hub / tfjs-models `mobilenet` | Apache-2.0 | OK-ATTR. Trained on ImageNet (research terms); widely used commercially. Note this. |
| `hand/detector`, `hand/landmark` (TF.js graph models) | 3.9 MB | palm, signage fallback (`lensiq-hand.js`) | MediaPipe Hands (lite) TF.js port, tfjs-models `handpose`/`hand-pose-detection` | Apache-2.0 | OK-ATTR |
| `hand_landmarker.task` (hand_detector.tflite + hand_landmarks_detector.tflite) | 7.5 MB | signage (MediaPipe) | Google MediaPipe model zoo (model card) | Apache-2.0 | OK-ATTR. Follow the model card's fairness and intended-use notes. |
| `selfie_segmenter.tflite` (selfiesegmentation_mlkit 256×256) | 0.24 MB | photobooth | Google MediaPipe model zoo | Apache-2.0 | OK-ATTR |
| `modnet.onnx` | 25 MB | photobooth HQ, studio | ZHKKKe/MODNet via Xenova/modnet | Apache-2.0 (current) | VERIFY (F7) |
| `selfie-multiclass-256-f16.onnx` | 7.8 MB | studio (default parser) | Google MediaPipe Selfie Multiclass 256×256, converted TFLite→ONNX fp16 | Apache-2.0 (model card, May 2023) | OK for commercial use; out-of-scope per card: surveillance, identity recognition |
| `faceparse-bisenet-r18-q8.onnx` (**git-ignored**, local only, off by default) | 13 MB | studio (optional) | yakhyo/face-parsing (MIT code); trained on CelebAMask-HQ | MIT code / CelebAMask-HQ non-commercial | **NON-COMMERCIAL** (F1). See `vendor/models/FACEPARSE-LICENSE.txt`. |
| `driver.js` `EYE_MODEL` (130 numbers embedded in the source, not a file) | < 2 KB | driver (closed-eye classifier on 32×16 eye crops, round 5) | Trained by us (`tests/bench/driver-eye-train.cjs`) **only** on the *Open/Closed Eyes* dataset, HF `MichalMlodawski/closed-open-eyes` (AI-generated faces) | Weights: MIT (ours). Training data: **ODC-BY 1.0** — attribution: "Open/Closed Eyes dataset by MichalMlodawski (huggingface.co/datasets/MichalMlodawski/closed-open-eyes), licensed under ODC-BY 1.0". CEW (research only) was used for evaluation only, never for training or threshold choice. | OK-ATTR. Keep this attribution. |
| `plate-ocr-th/` (PP-OCRv5 Thai mobile recogniser `.onnx`, `dict.txt`) | 7.5 MB | parking, village (`lensiq-plate.js`, LENSIQ Gate, round 13) | PaddleOCR th_PP-OCRv5 mobile, official ONNX, unchanged; trained on general Thai text, not on licence plates | Apache-2.0 (`vendor/models/plate-ocr-th/LICENSE`, provenance + checksum in `README.txt`) | OK-ATTR. Accuracy on Thai plates not measured yet (ACCURACY.md). No plate detector was shipped in round 13; round 15 adds LPD-YuNet (next row). |
| `plate-det/license_plate_detection_lpd_yunet_2023mar.onnx` (LPD-YuNet fp32) | 4.1 MB | parking, village (`lensiq-plate.js` plate finder, one optional proposal source, round 15) | OpenCV Zoo `models/license_plate_detection_yunet`, unchanged (contributed by Dong Xu, watrix.ai); trained on Chinese plates (dataset not named, most likely CCPD, MIT), not on Thai plates | Apache-2.0 (`vendor/models/plate-det/LICENSE`, provenance + sha256 in `README.txt`) | OK-ATTR. Detection numbers in docs/GATE.md "Plate detector (round 15)". No GPL / Ultralytics weights are vendored; YOLOv9 appears only as a benchmark reference. The YOLOX training notebook (`tools/train-plate-detector.ipynb`) ships no weights. |

| `creative-core.js` attention map (`PARAMS`: 7 combination weights embedded in the source, no model file) | < 1 KB | creative (Creative Lab, predicted attention) | Our own implementation of two training-free classic models — spectral residual (Hou & Zhang, CVPR 2007) and a simplified Itti–Koch–Niebur centre–surround model (PAMI 1998) — plus face/text/centre priors. Published algorithms, no third-party code or weights. The 7 weights were chosen by a coordinate search on 300 **MIT1003** images (`tests/bench/creative.bench.mjs --fit`); faces come from the face-api tiny detector above (F5). | Code + weights: MIT (ours). **No deep saliency model is shipped on purpose:** the common pretrained ones (SALICON-, MIT1003- or CAT2000-trained DeepGaze, SalGAN, TranSalNet, UNISAL …) inherit dataset terms that are research-only or unstated. MIT1003 (Judd et al. 2009) states no licence: used only to evaluate and to pick 7 numbers, never copied into the repo or shipped; data kept outside the repo (`fetch_datasets.py mit1003`). | OK. If legal prefers zero dataset influence, set `PARAMS` to the unfitted defaults `{sr:0.5, ik:0.5, face:0.5, text:0.25, cb:0.75, cbSigma:0.25, sigma:0.035}` (held-out NSS 1.41 instead of 1.59, ACCURACY.md §10). |

## Assets

| Asset | Source | Licence | Status |
|---|---|---|---|
| `vendor/tarot/*.jpg` (78 cards) | Wikimedia Commons, RWS 1909 "Roses & Lilies" scans, resized to 260 px. Per-file sources in `vendor/tarot/CREDITS.txt`. | Public domain | VERIFY (F8, trademark only) |
| *Prompt* font (weights 300–700, woff2 subsets thai / latin / latin-ext), self-hosted in `vendor/fonts/prompt/` | https://github.com/google/fonts/tree/main/ofl/prompt (Cadson Demak), fetched with `node tools/self-host-fonts.mjs --fetch` | SIL OFL 1.1 (`vendor/fonts/prompt/OFL.txt`) | OK-ATTR |
| *Inter* font (variable weight 100–900, woff2 latin subset), self-hosted in `vendor/fonts/inter/` — Latin companion for the header and English pages | https://github.com/rsms/inter (The Inter Project Authors), file `inter-latin-wght-normal.woff2` from the `@fontsource-variable/inter@5.1.0` npm package (downloaded once by a maintainer; pages never contact a font CDN) | SIL OFL 1.1 (`vendor/fonts/inter/OFL.txt`) | OK-ATTR |
| Pillbox pill data, slimmed (`vendor/pillbox/pillbox-2020-v1.json`, built by `tools/build-pillbox.mjs`; round 14, medicine.html) | U.S. National Library of Medicine, Pillbox (retired 2020-10): https://www.nlm.nih.gov/pubs/techbull/ja20/ja20_pillbox_discontinue.html · labeler data via FDA SPL / DailyMed. `vendor/pillbox/LICENSE.txt` + `README.md` next to the file. | Public domain (U.S. Government work, 17 U.S.C. 105) | OK-ATTR — show "This product uses publicly available data from the U.S. National Library of Medicine (NLM)" and the NLM warning; no NLM name/logo endorsement; trade names are their owners' trademarks (label facts only). US products only, frozen 2020. |
| Medicine label text fetched at run time (openFDA drug/label, RxNav; only after the user opts in) | https://open.fda.gov (openFDA terms: CC0 / public domain data, disclaimer shown) · https://lhncbc.nlm.nih.gov/RxNav/ (NLM terms of service) | Public domain / NLM terms | OK-ATTR — not shipped in the repo; shown verbatim with source and date |
| Knowledge-base text (`*-kb.js`) | Original text by the project. Cited URLs (Wikipedia, Thai media, etc.) are references, not copied content, and are not fetched at runtime. | MIT (project) | OK. Spot-check that no passages were copied verbatim from the cited sites. |

No page loads scripts, styles or fonts from any third-party origin (`node tools/check-external.mjs --as-is`, run in CI). `https://` in `*.html` appears only in plain reference links in body text.

## Python dependencies (`requirements.txt`, used only by `server.py` / `tryon.py`)

| Package | Version (in `.venv`) | Licence | Status | Notes |
|---|---|---|---|---|
| Flask (+ Werkzeug, Jinja2, click, itsdangerous, blinker, MarkupSafe) | 3.1.3 | BSD-3-Clause | OK | |
| pdfplumber | 0.11.8 | MIT | OK | Default `/api/convert` engine (`pdfconvert.py`) |
| pdfminer.six | 20251107 | MIT | OK | via pdfplumber; pulls in charset-normalizer (MIT), cryptography (Apache-2.0 OR BSD-3), cffi (MIT), pycparser (BSD-3) |
| pypdfium2 | 5.15.0 | BSD-3-Clause / Apache-2.0 (bundled PDFium: BSD-3 + third-party notices in the wheel) | OK-ATTR | via pdfplumber; keep the wheel's licence files when redistributing |
| Pillow | 11.3.0 | MIT-CMU (HPND) | OK | via pdfplumber |
| python-docx (+ lxml BSD-3, typing_extensions PSF) | 1.2.0 | MIT | OK | DOCX writer |
| *optional, `requirements-agpl.txt` only:* pdf2docx | 0.5.8 | GPL-3.0 | COPYLEFT, opt-in (F4) | `LENSIQ_CONVERT_ENGINE=pdf2docx`; pulls in fonttools (MIT), numpy (BSD), opencv-python-headless (Apache-2.0), fire (Apache-2.0) |
| *optional, `requirements-agpl.txt` only:* PyMuPDF (`fitz`) | 1.24.14 | AGPL-3.0 / Artifex commercial | RESTRICTED, opt-in (F3) | |
| anthropic (Claude SDK) | 0.125.0 | MIT | OK | Pulls in httpx (BSD), pydantic (MIT), anyio (MIT), distro (Apache-2.0), jiter (MIT). Use of the Claude API is governed by Anthropic's Commercial Terms. |

The `.venv` also contains `onnxruntime` 1.19.2 (MIT) and `sympy` / `coloredlogs` (BSD/MIT), which are not in `requirements.txt` and appear to be leftovers from offline model-conversion work. They are not imported by `server.py`.

## Cloud services (only when the operator configures keys)

| Service | Used for | Terms | Notes |
|---|---|---|---|
| Anthropic Claude API (USA) | `/api/fortune` rewording of derived facts | Anthropic Commercial Terms / Usage Policy | Cross-border transfer (see `docs/pdpa/`) |
| Replicate (USA) | `/api/tryon` (off by default) | Replicate Terms + **the hosted model's own licence** (F2: `LENSIQ_TRYON_LICENSE` attestation required) | Sends photos. Cross-border transfer. |

## Test-only fixtures (not published)

| Item | Where | Licence | Notes |
|---|---|---|---|
| Liberation Sans 2.1.5 (Regular, Bold) | `tests/fixtures/fonts/liberation/` | SIL OFL 1.1 (LICENSE alongside) | Arial-metric font used only by e2e OCR tests so CI and dev machines render identical text. `tests/` is excluded by build-site. |

## Keeping this file current

When adding anything under `vendor/` or to `requirements.txt`, add a row with its version, source, licence and status. Also put its licence text next to the file (as `FACEPARSE-LICENSE.txt` and `tarot/CREDITS.txt` do) when the licence requires the text to be distributed.

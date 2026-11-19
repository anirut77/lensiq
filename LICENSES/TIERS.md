# Licence tiers: every model and dataset, by how clean it is

Owner order 2026-11-18 (night). Compiled 2026-11-18 from `vendor/models/*` (file headers and READMEs), `LICENSES/THIRD_PARTY.md`,
`LICENSES/THIRD-PARTY-NOTICES.txt`, `docs/LICENCE-REQUESTS.md`, `docs/CROWD-DENSITY-MODELS.md`,
`docs/ATTENDANCE-READINESS.md` (B3), `docs/product-check/FACE-BLUR-RESULTS.md` (§4), `docs/exam/FACE-ENGINE-RESULTS.md` (§7.1),
`docs/PLATE-DATASETS.md`, `docs/TRYON-LICENSING.md`, `docs/STYLE-DESIGN.md`. **Not legal advice.** Nothing here changes a licence
file or any code. It is the working view the owner uses to decide what ships; the one open legal question is in
`docs/LEGAL-PACKET.md` section 9.0 (TH + EN).

## The three tiers

| Tier | Meaning | Rule |
|---|---|---|
| **1** | **Clean model and clean data.** The model licence allows commercial use (MIT, Apache-2.0, BSD, CC0 and similar), **and** the training data is documented and is own data, consented data, or carries a licence that allows commercial use (for example CC BY, ODC-BY, the owner's own photos). | **Customer builds use tier 1 only** (owner order 2026-11-18). |
| **2** | **Permissive model, research-only or unknown training data.** The weights are released under a permissive licence, but they were trained on a dataset that is non-commercial / research-only, has no licence, or whose origin is not recorded. Whether the dataset terms follow the weights is the open legal question (`docs/LEGAL-PACKET.md` section 9.0). **Where provenance is unknown the item is treated as tier 2.** | Not shipped in customer builds on the tier-1-only rule. Stays in the code and in demo mode. Two sub-labels: **2-NC** = the data is explicitly non-commercial / research-only; **2-U** = unknown, unrecorded or partly unrecorded. |
| **3** | **Non-commercial (or no-grant) model licence.** The licence of the model or its published weights itself forbids commercial use, is academic-only, or grants nothing (no licence file). Also copyleft (GPL / AGPL) code, which CLAUDE.md bans. | Never used. A lawyer's "yes" on the tier-2 question does **not** touch tier 3. |

Tier is decided by the **model licence first, then the data**. Example: `age_gender_model` has MIT weights but UTKFace (non-commercial
research only) data, so it is **tier 2-NC**, not tier 3. A model whose own licence says "academic research only" (P2PNet) is tier 3.

Customer-build facts used below: the customer bundle (`node tools/build-site.mjs --customer`) locks `LENSIQ_AGE_GENDER`,
`LENSIQ_EXPRESSION` and `LENSIQ_FACEPARSE` to false; those weights are never requested. **The weight files themselves still sit in the
bundle** (open question in `docs/LEGAL-PACKET.md` 9.1; not cut yet). `faceparse-bisenet-r18-q8.onnx` is git-ignored and refused by the
build, so it never ships.

---

## A. Models in the repo or loaded by the code (shipped or embedded)

"Ships" = in the customer bundle. "loaded" = a page actually requests it in customer mode. "file only" = the file is in the bundle but
never requested.

| ID | Model (file) | Model licence | Training data and its licence (source) | Tier | Used where | Ships in customer builds | If not tier 1: what replaces it |
|---|---|---|---|---|---|---|---|
| M1 | **YOLOX-Nano 416** (`yolox/yolox_nano_416.onnx`) | Apache-2.0 (Megvii) | MS COCO 2017: annotations CC BY 4.0, but the **images carry per-image Flickr licences, including BY-NC, BY-NC-SA and BY-NC-ND** ([cocodataset.org/#termsofuse](https://cocodataset.org/#termsofuse)); Nano is trained from scratch on COCO, no ImageNet backbone [recalled, check arXiv:2107.08430 before quoting] | **2-NC** (corrected 2026-11-18: the COCO posture recorded in `docs/CROWD-DENSITY-MODELS.md` (line 64, which refers to `vendor/models/yolox/README.txt`) is a policy exception, not tier 1 under the tier definition) | store (people count, default); crowd; Crowd events | Yes, loaded | Own head / person detector trained from scratch on Open Images (C32, tier 1 subject to counsel; not built). Until then detector-only counting stays on a tier-2 model |
| M2 | **MediaPipe Face Landmarker** bundle (`face-landmarker/face_landmarker_lm.task`: BlazeFace short range + Face Mesh V2 + geometry; blendshape model removed) | Apache-2.0 (cards: Face Mesh V2, 2022-09-15; BlazeFace short range, 2021-06-09) | Images captured by Google with smartphone cameras through an AR app, consented (`vendor/models/face-landmarker/README.txt`; BlazeFace card re-read 2026-11-18: "consented images of people using a mobile AR application captured with smartphone cameras") | **1** | Exam lab / hall (face count, head pose); faceread look preview; Try-On landmarks | Yes, loaded | (tier 1) |
| M3 | **MediaPipe BlazeFace short range** (`face-gate/blaze_face_short_range.tflite`) | Apache-2.0 (card 2021-06-09) | As M2: consented Google AR-app smartphone images (card, read 2026-11-18, link: [card PDF](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf)) | **1** | Product Check face gate and face blur; Try-On product-photo blur; owner-side plate labeller | Yes, loaded | (tier 1) |
| M4 | **MediaPipe Pose Landmarker lite** (`pose-landmarker/pose_landmarker_lite.task`) | Apache-2.0 (card 2021-04-16) | Google AR-app smartphone images: 30K consented images + 85K fitness poses (card, `vendor/models/pose-landmarker/README.txt`) | **1** | Try-On (garment placement) | Yes, loaded when a pose item is picked | (tier 1) |
| M5 | **Driver closed-eye classifier** (`driver.js` `EYE_MODEL`, 130 numbers in the source) | MIT (ours) | Open/Closed Eyes dataset, HF `MichalMlodawski/closed-open-eyes` (AI-generated faces), **ODC-BY 1.0**; CEW (research only) used for evaluation only, never training ([dataset](https://huggingface.co/datasets/MichalMlodawski/closed-open-eyes)) | **1** (attribution required, kept in THIRD-PARTY-NOTICES) | driver | Yes (embedded) | (tier 1) |
| M6 | **MediaPipe Hand Landmarker** (`hand_landmarker.task`) | Apache-2.0 | Hand card ("Hand Tracking (Lite/Full) with Fairness Oct 2021", read 2026-11-18): "trained and evaluated on images, including consented images captured using a mobile AR application"; "majority" of images from that app; "limited datasets". The remaining images are **not named** | **2-U** (partly unrecorded) | signage (MediaPipe path) | Yes, loaded | Hand pose is optional: palm and signage work without it (manual / no gesture). Or copy the rest of the card data statement and request Google's confirmation, then move to tier 1 |
| M7 | **Hand detector + landmark, TF.js port** (`hand/detector`, `hand/landmark`) | Apache-2.0 (tfjs-models handpose) | Same family as M6; port provenance and data not recorded in the repo | **2-U** | palm, signage fallback (`lensiq-hand.js`) | Yes, loaded | As M6 |
| M8 | **MediaPipe Selfie Segmenter** (`selfie_segmenter.tflite`, mlkit 256x256) | Apache-2.0 | Model card does not name the training data (not recorded in the repo) | **2-U** | photobooth, luckycolor, Try-On person outline | Yes, loaded | Colour clustering (`StudioCore.heuristicParse`) as a last resort; or a segmentation model trained on our own consented photos (future) |
| M9 | **MediaPipe Selfie Multiclass 256** (`selfie-multiclass-256-f16.onnx`, converted TFLite to ONNX fp16) | Apache-2.0 (card May 2023) | Model card ("Model Card Multiclass Segmentation", read 2026-11-18) gives fairness evaluation sets (918 images, Monk scale) but **does not name the training data** | **2-U** | studio (default parser) | Yes, loaded | Colour clustering fallback; none of equal quality |
| M10 | **MODNet portrait matting** (`modnet.onnx`, Xenova/modnet conversion) | Apache-2.0 since 2022-01-28 (earlier releases CC BY-NC-SA 4.0; exact commit of these weights unrecorded) | Not recorded in the repo; the MODNet paper trains on matting sets built from public and self-made data, including datasets with research-only terms [recalled, not re-checked 2026-11-18] | **2-U** | photobooth HQ, studio | Yes, loaded | M8 / M9 (lower edge quality) for people; BRIA API for products (paid, see section C) |
| M11 | **COCO-SSD** (`cocossd/`, TF.js graph model) | Apache-2.0 | COCO 2017 (as M1: per-image Flickr licences including non-commercial ones), and the SSD MobileNet backbone in the TF detection zoo is initialised from ImageNet classification weights (ImageNet terms: non-commercial research and educational use) [backbone recalled, not verified for this tfjs build] | **2-NC** (COCO images and probably ImageNet; was 2-U) | **exam-lab and exam-hall person count**; store fallback (`?coco`) | Yes, loaded | Swapping to M1 YOLOX-Nano removes the ImageNet backbone question but **does not reach tier 1** (both are COCO-trained). Tier-1 route: C32 |
| M12 | **MobileNetV2** (`mobilenet/`) | Apache-2.0 (tfjs-models) | ImageNet ILSVRC (terms: "non-commercial research and educational purposes", [image-net.org/download](https://www.image-net.org/download.php)) | **2-NC** | checkout (product embedding), store (optional re-ID), Product Check reference image | Yes, loaded | Embedding from a tier-1 backbone (none vendored); or a small CNN trained on owner product photos. Counsel called it "low risk" in `LICENCE-REQUESTS.md` section 6 |
| M13 | **PP-OCRv5 Thai recogniser** (`plate-ocr-th/th_ppocrv5_mobile_rec.onnx`) | Apache-2.0 (PaddlePaddle) | "general Thai text lines (PaddleOCR synthetic + collected text)"; collected sources and their licences are not published (`plate-ocr-th/README.txt`) | **2-U** | **Gate** (parking, village: plate reading, a guard confirms every read); Product Check Thai text | Yes, loaded | OCR trained on our own plate crops (owner photos, `docs/PLATE-TRAINING.md`, own data = tier 1) once measured; until then the guard types the plate |
| M14 | **PP-OCRv5 mobile detector + CJK / Korean / Latin recognisers** (`pc-ocr/*`) | Apache-2.0 | As M13: not published | **2-U** | Product Check (medicine.html) | Yes, loaded on the Product Check tab | Product Check is off in customer builds unless chosen; fallback is manual entry of the label text |
| M15 | **LPD-YuNet licence-plate detector** (`plate-det/license_plate_detection_lpd_yunet_2023mar.onnx`) | Apache-2.0 (OpenCV Zoo; model by Dong Xu, watrix.ai). Training code family `libfacedetection.train` is MIT | Chinese plates; "the dataset is not named in the model README; most likely CCPD (MIT)" (`plate-det/README.txt`). CCPD: [github.com/detectRecog/CCPD](https://github.com/detectRecog/CCPD), MIT on the repo; image rights not stated | **2-U** | Gate plate finder (one optional proposal source) | Yes, loaded | A YOLOX-nano trained on Thai plates from the owner's own photos plus CC BY Roboflow sets (`docs/PLATE-DATASETS.md`, `docs/PLATE-TRAINING.md`). **Tier 1 only if it is trained from scratch or from a tier-1 start: the current notebook (`tools/train-plate-detector.ipynb`) and `tools/plate_train.py` start from the official YOLOX-nano COCO checkpoint, which would make the result tier 2-NC.** In progress; not shipped |
| M16 | **face-api.js tiny face detector** (`tiny_face_detector_model.*`) | MIT (weights, face-api.js / vladmandic) | Academic face sets (upstream does not document; WIDER FACE-class, CC BY-NC-ND) [`THIRD_PARTY.md` F5; per upstream docs, unverified] | **2-U** (likely 2-NC) | ~25 pages: attendance, customers, booth, faceread, store, queue, tables, interview, teamface, creative, driver, neuro, signage, studio, photobooth and others | Yes, loaded | M2 / M3 (tier 1) for detection. Exam already moved. Attendance, customers, booth and others still need the swap (new round, measured) |
| M17 | **face-api.js 68-point landmarks** (`face_landmark_68_model.*`) | MIT | Academic landmark sets (300-W / iBUG-type; non-commercial) [`THIRD_PARTY.md` F5, unverified] | **2-U** (likely 2-NC) | same pages as M16 (alignment, pose, eye ratio) | Yes, loaded | M2 (478 landmarks, tier 1) |
| M18 | **face-api.js face recognition** (`face_recognition_model.*`, dlib ResNet-34 port, 128-D) | MIT (port); dlib weights released CC0 by Davis E. King | About 3 M faces from VGG Face, FaceScrub and web scrape; research terms [`ATTENDANCE-READINESS.md` B3, unverified for each set] | **2-U** (likely 2-NC) | **Attendance face mode** (optional; PIN / QR is the default), customers, booth (one-day visitor count) | Yes, loaded when face mode is on | **PIN / QR (already default).** Commercial face SDK or the insightface commercial licence (`ATTENDANCE-READINESS.md` B5; price not published) |
| M19 | **face-api.js expression** (`face_expression_model.*`) | MIT | FER-style public sets and "images scraped from the web" (upstream); licences unclear | **2-U** | neuro, booth, signage, photobooth: **research demo only** | Yes, **file only** (locked off, never requested) | MediaPipe Face Landmarker geometry (smile / mouth signals, not emotion labels). No emotion scoring in Exam / HR / Education (CLAUDE.md) |
| M20 | **face-api.js age / gender** (`age_gender_model.*`) | MIT | **UTKFace** ("non-commercial research purposes only", [susanqq.github.io/UTKFace](https://susanqq.github.io/UTKFace/)), plus IMDB-WIKI and related academic sets (research use) | **2-NC** | signage opt-in, **research demo only** | Yes, **file only** (locked off, never requested) | None on-device known; keep off |
| M21 | **BiSeNet face parsing** (`faceparse-bisenet-r18-q8.onnx`, yakhyo/face-parsing, q8) | MIT (code and weights file) | **CelebAMask-HQ** ("non-commercial research and educational purposes", [github.com/switchablenorms/CelebAMask-HQ](https://github.com/switchablenorms/CelebAMask-HQ)); upstream CelebA image owners | **2-NC** (`THIRD_PARTY.md` F1 already calls it NON-COMMERCIAL; by the tier rule it is 2-NC because the file itself is MIT. Treated as never-ship either way) | studio, optional `?faceparse=1`, off by default | **No** (git-ignored; the build refuses it) | M9 Selfie Multiclass (already the default) |
| M22 | **Attention-map weights** (`creative-core.js` `PARAMS`: 7 numbers, no model file) | MIT (ours); algorithms are published classics (Hou and Zhang 2007; Itti, Koch, Niebur 1998) | The 7 numbers were fitted on 300 **MIT1003** images (Judd et al. 2009; **no licence stated**, [people.csail.mit.edu/tjudd/WherePeopleLook](http://people.csail.mit.edu/tjudd/WherePeopleLook/)); images are never copied or shipped | **2-U** (7 numbers only; negligible) | creative | Yes (embedded) | Unfitted defaults `{sr:0.5, ik:0.5, face:0.5, text:0.25, cb:0.75, cbSigma:0.25, sigma:0.035}` (held-out NSS 1.41 instead of 1.59, `ACCURACY.md` section 10). One line of code, but a code change |

**Counts, section A (22 rows): tier 1 = 4 (M2, M3, M4, M5); tier 2 = 18 (2-U = 13: M6, M7, M8, M9, M10, M13, M14, M15, M16, M17, M18, M19, M22; 2-NC = 5: M1, M11, M12, M20, M21); tier 3 = 0.** M16 to M19 are "2-U (likely 2-NC)": upstream data is undocumented and the sets believed to be used are research-only.

Not models, but in the same notices: the Tasks Vision runtime, TF.js, onnxruntime-web and zxing wasm are code (MIT / Apache-2.0), not tiered.

---

## B. Models and datasets reviewed in the docs but **not** in the repo (candidates and rejected)

Checked 2026-11-08 to 2026-11-10 (primary sources named in the cited docs). None is vendored. Tier 3 here means the model or code licence
itself blocks commercial use or grants nothing.

### B1. Face detection and recognition

| ID | Model | Model licence | Training data and licence | Tier | Would be used for | Status / replacement |
|---|---|---|---|---|---|---|
| C1 | **YuNet face detector** (`face_detection_yunet_2023mar.onnx`, opencv_zoo) | MIT (Shiqi Yu, 2020); repo Apache-2.0 | **WIDER FACE, cc by-nc-nd**, relabelled with RetinaFace (insightface: "annotation and models trained with these data ... non-commercial research purposes only") (`FACE-BLUR-RESULTS.md` section 4) | **2-NC** | Small-face detection: Exam hall, Product Check face blur | Stopped at the licence check 2026-11-10; not vendored. Replacement today: BlazeFace tiles (M3) |
| C2 | **SFace** (opencv_zoo `face_recognition_sface_2021dec`) | Apache-2.0 | Not named in opencv_zoo; the paper trains on CASIA-WebFace, VGGFace2, MS-Celeb-1M (research terms) | **2-U** | Attendance face mode (swap for M18) | Not vendored. Raises accuracy but does not clear the question (`ATTENDANCE-READINESS.md` B3) |
| C3 | **MobileFaceNet variants, EdgeFace, AdaFace, FaceNet, GhostFaceNets, Human FaceRes** | MIT / Apache / BSD (code); weights unstated for several | MS1M (withdrawn 2019), CASIA-WebFace, VGGFace2 (licence conflicting between mirrors), WebFace; research terms | **2-U** | Attendance face mode | Not vendored |
| C4 | **insightface open weights** (buffalo_l, antelopev2, ArcFace, SCRFD; InspireFace) | Code MIT; **weights "available for non-commercial research purposes only"** | MS1MV2/3, Glint360K, WebFace (research) | **3** | Face recognition / detection | Not vendored. A **commercial licence is sold** (recognition-oss-pack@insightface.ai; price not published) |
| C5 | **Commercial face SDKs** (VeriLook EUR 339 / 859 published, Paravision, Innovatrics, FacePlugin, KBY-AI, Regula, Luxand, iApp, AWS Rekognition) | Proprietary, commercial licence, warranty by contract | Vendor-held | **1 (by contract, if bought)** | Attendance face mode | Not bought. `ATTENDANCE-READINESS.md` B4 / B5 |
| C6 | **NVIDIA PeopleNet** | NVIDIA Open Model License (forum thread adds EULA caveats) | NVIDIA data, unstated | **2-U** | Person / face detector | Not used (large, still collapses in dense crowds) |
| C33 | **MediaPipe BlazeFace full range** (`blaze_face_full_range.tflite`, 1,083,786 bytes; `vendor/models/face-gate/README.txt` "Not vendored") | Apache-2.0 (card "MediaPipe BlazeFace Model Card (Full Range)", 2021-01-19; `LICENSES/THIRD_PARTY.md` line 100, `docs/exam/FACE-ENGINE-RESULTS.md` line 331) | Consented data (as the other BlazeFace cards, M2 / M3) | **1** | Measurement only (Exam hall option (b) / (d), `FACE-ENGINE-RESULTS.md` section 6.3). Kept outside the repo, under `~/LENSIQ-field/evals/exam-followups/vendor/` (section 7.3) | Not vendored and not shipped: the vendored Tasks bundle rejects it at run time ("2304 vs. 896"); no page loads it (section 7.3). Replacement today: BlazeFace short range tiles (M3) |

### B2. Crowd counting (published checkpoints, `docs/CROWD-DENSITY-MODELS.md`)

The code licence is permissive for most; the problem is the data. "Backbone" = ImageNet-pretrained VGG / ResNet / HRNet (ImageNet terms as M12).

| ID | Model | Code licence | Published weights trained on | Tier |
|---|---|---|---|---|
| C7 | DM-Count (NeurIPS 2020) | MIT | UCF-QNRF, **NWPU-Crowd (no commercial use of data or any derivative)**, ShanghaiTech, ImageNet VGG-19 | **2-NC** |
| C8 | CLTR (ECCV 2022) | MIT | **NWPU-Crowd**, ImageNet ResNet-50 | **2-NC** |
| C9 | PET (ICCV 2023) | MIT | ShanghaiTech A (BSD-2-Clause repo, image rights unclear), ImageNet VGG-16-BN | **2-U** |
| C10 | APGCC (ECCV 2024) | MIT | ShanghaiTech A, ImageNet | **2-U** |
| C11 | FIDTM (2021) | MIT | ShanghaiTech, QNRF, **JHU-Crowd++ (academic and non-commercial)**, NWPU | **2-NC** |
| C12 | STEERER (ICCV 2023) | MIT | ShanghaiTech B, **JHU-Crowd++**, ... | **2-NC** |
| C13 | SASNet (AAAI 2021) | Apache-2.0 | ShanghaiTech A / B, ImageNet | **2-U** |
| C14 | LSC-CNN (TPAMI 2020) | MIT | ShanghaiTech, QNRF, ImageNet | **2-U** |
| C15 | MCNN (CVPR 2016) | MIT | ShanghaiTech A / B (no ImageNet backbone; small enough for a phone, much less accurate) | **2-U** |
| C16 | LWCC wrapper (CSRNet, SFANet, Bayesian, DM-Count checkpoints) | MIT (wrapper) | SHA / SHB / QNRF | **2-U** (SFANet upstream is GPL) |
| C17 | CSRNet official; Bayesian Loss | **No licence file** (all rights reserved) | ShanghaiTech, UCF-QNRF, ImageNet | **3** (no grant) |
| C18 | **P2PNet** (ICCV 2021, Tencent) | Tencent licence: "only for the purpose of **academic research**" | ShanghaiTech A, ImageNet | **3** |
| C19 | CAN; SFANet variants | **GPL-3.0** | none published | **3** (GPL banned) |

For tier 2 the useful "published crowd weights" are C7 to C16. **NWPU- and JHU-trained weights (C7, C8, C11, C12) carry an explicit "no commercial use / no derivative" clause**, which is a stronger fact than silence, and the lawyer should be told so (see the question's facts).

### B3. Try-On, segmentation, cut-out (`docs/TRYON-LICENSING.md`, `docs/LICENCE-REQUESTS.md`)

| ID | Model | Model licence | Training data | Tier | Status |
|---|---|---|---|---|---|
| C20 | IDM-VTON, OOTDiffusion, CatVTON, StableVITON, LaDI-VTON | **CC BY-NC-SA 4.0** | VITON-HD (CC BY-NC), DressCode (not released to companies) | **3** | Off. `/api/tryon` refuses these as `commercial`; only `LENSIQ_TRYON_LICENSE=noncommercial-demo` runs them |
| C21 | Leffa (Meta) | MIT (code and weights) | VITON-HD, DressCode (above) | **2-NC** | Not used |
| C22 | FitDiT, FLUX [dev] family, catvton-flux | Non-commercial (commercial via a cloud contract) | undisclosed | **3** | Not used |
| C23 | FASHN Human Parser (NVIDIA SegFormer) | NVIDIA SegFormer non-commercial | undisclosed | **3** | Not used |
| C24 | **FASHN API**, Google Vertex Virtual Try-On, Kling / Kolors API, Perfect Corp | Commercial terms by contract | vendor-held | **1 (by contract, if bought)** | Candidate, nothing bought. Photos leave the device (opt-in only) |
| C25 | BRIA RMBG-1.4 / 2.0 | Weights **CC BY-NC 4.0**-type, commercial by BRIA agreement; API USD 0.018 / image | BRIA licensed data (stated by BRIA) | **3** self-hosted; **1** via the paid API | Not used; letter J drafted |
| C26 | SAM / SAM 2 | Apache-2.0 | **SA-1B (research-only data licence)** ([ai.meta.com/datasets/segment-anything](https://ai.meta.com/datasets/segment-anything/)) | **2-NC** | Not used |
| C27 | BiRefNet, IS-Net, U2-Net | Weights licence not stated or MIT / Apache | DIS5K, DUTS and similar (research) | **2-U** | Not used |

### B4. Other candidates mentioned in the docs

| ID | Item | Why not used | Tier |
|---|---|---|---|
| C28 | YOLOv9 plate detector (open-image-models), Ultralytics YOLO (v5, v8, v11), Roboflow-hosted YOLO plate models (keremberke, morsetechlab, LiteALPR) | GPL / AGPL code; undocumented scraped data. Decided "not used, even for demo" 2026-11-10 (L41) | **3** |
| C29 | PyMuPDF (AGPL-3.0), pdf2docx (GPL-3.0) | Copyleft; opt-in only (`requirements-agpl.txt`), default converter is permissive | **3** (copyleft; not a model) |
| C30 | Surya, EasyOCR, MMOCR, TrOCR, Florence-2 | Licence or language reasons (`pc-ocr/README.txt`) | not assessed further |
| C31 | Deep saliency models (DeepGaze, SalGAN, TranSalNet, UNISAL) | SALICON / MIT1003 / CAT2000 data research-only or unstated | **2-U** (not used; M22 uses published algorithms instead) |
| C32 | **Own head / person detector (not built):** YOLOX code (Apache-2.0) trained **from scratch** (no COCO or ImageNet start weights) on Open Images V7 | Ours (Apache-2.0 code, own weights) | Open Images V7: images listed as CC BY 2.0, labels / boxes CC BY 4.0 ([storage.googleapis.com/openimages](https://storage.googleapis.com/openimages/web/factsfigures_v7.html)); classes "Person" and "Human head". **Conditions, all subject to counsel:** (1) verify each image's licence from the metadata (Google does not guarantee the Flickr licences); (2) drop boxes with `IsDepiction = 1` (drawings, paintings, pictures of people); (3) CC covers copyright only: **the rights of the people pictured (PDPA, personality and image rights, faces as biometric data) are not covered by CC**; (4) keep attribution and do not ship any image; (5) from scratch, because any COCO or ImageNet start weights bring tier 2-NC back | **1 (subject to counsel)** | People / head counting for Crowd, store and Exam hall, replacing M1 and M11 | Not built. Needs a locked eval set first (`tools/eval-guard.mjs`), a GPU run and a measured comparison; an owner decision (scope) |

**Counts, section B (33 rows): tier 1 = 4 (C5, C24 by contract, not bought; C32 own detector, subject to counsel, not built; C33 BlazeFace full range, measurement only, not shipped); tier 2 = 18 (2-NC = 7: C1, C7, C8, C11, C12, C21, C26; 2-U = 11: C2, C3, C6, C9, C10, C13, C14, C15, C16, C27, C31); tier 3 = 10 (C4, C17, C18, C19, C20, C22, C23, C25, C28, C29); not assessed = 1 (C30).** C25 (BRIA) is tier 3 when self-hosted and tier 1 only through the paid API.

---

## C. Datasets (training, evaluation and fitting)

"Commercial use of the data" is the licence as stated on the dataset's own page, as recorded in the docs. Datasets used only to **evaluate** are listed because
the owner asked for every dataset; evaluation use does not put weights in the product.

| ID | Dataset | Licence / terms (source) | Commercial use of the data | Used for | Status |
|---|---|---|---|---|---|
| D1 | MS COCO 2017 | Annotations CC BY 4.0, **but the images carry per-image Flickr licences, including BY-NC, BY-NC-SA and BY-NC-ND** ([terms](https://cocodataset.org/#termsofuse)) | **No / mixed** (corrected 2026-11-18; not tier 1) | trained M1, M11 (upstream) | Tier 2-NC driver; the COCO posture recorded in `docs/CROWD-DENSITY-MODELS.md` (line 64) is a policy exception |
| D2 | ImageNet (ILSVRC) | "non-commercial research and educational purposes" ([terms](https://www.image-net.org/download.php)) | **No** (grey area in industry) | backbone pretraining of M12, M11 (probable), most crowd models | Tier 2 driver |
| D3 | UTKFace | Non-commercial research only ([page](https://susanqq.github.io/UTKFace/)) | **No** | trained M20 | Tier 2-NC |
| D4 | IMDB-WIKI and related age sets | Research use (upstream docs) | **No** [unverified] | trained M20 | Tier 2-NC |
| D5 | WIDER FACE | cc by-nc-nd ([page](http://shuoyang1213.me/WIDERFACE/)) | **No** | trained YuNet (C1); probably M16 [unverified]; **excluded as a test set** | Tier 2-NC |
| D6 | 300-W / iBUG landmark sets | Research use [recalled, not re-checked 2026-11-18] | **No** | probably M17 | Tier 2-U |
| D7 | VGG Face, FaceScrub, web scrape | Research terms [unverified per set] | **No / unclear** | trained M18 (dlib) | Tier 2-U |
| D8 | FER-style sets and web-scraped faces | Unclear (upstream: "publicly available datasets as well as images scraped from the web") | **Unclear** | trained M19 | Tier 2-U |
| D9 | CelebAMask-HQ (over CelebA) | Non-commercial research and educational use ([page](https://github.com/switchablenorms/CelebAMask-HQ)) | **No** | trained M21 | Tier 2-NC |
| D10 | CASIA-WebFace, VGGFace2, MS-Celeb-1M (withdrawn 2019), WebFace260M, Glint360K | Research terms; VGGFace2 conflicting (CC BY-SA 4.0 vs CC BY-NC 4.0); MS1M withdrawn | **No / unclear** | trained SFace, AdaFace, MobileFaceNet, insightface (C2 to C4) | Tier 2 |
| D11 | CCPD (Chinese plates) | MIT on the repo; image rights not stated ([repo](https://github.com/detectRecog/CCPD)) | **Unclear** | probably trained M15 | Tier 2-U |
| D12 | Thai plate sets from Roboflow Universe (items 1 to 5, 7 in `PLATE-DATASETS.md`) | CC BY 4.0 / public domain **as asserted by the uploader**; image ownership unverified | **Yes if verified per set** (attribution) | planned training of the Thai YOLOX plate detector (not shipped) | Owner downloads and checks by hand |
| D13 | Owner's own plate and pilot photos (`~/LENSIQ-field`) | Own data; PDPA sign, consent where needed, retention limit; never in the repo | **Yes (own)** | planned training; evaluation | Tier 1 source |
| D14 | Open/Closed Eyes (MichalMlodawski, AI-generated faces) | ODC-BY 1.0 | **Yes** (attribution) | trained M5 | Tier 1 |
| D15 | Google AR-app smartphone images (consented) | Held by Google; stated on the model cards | n/a (the model is Apache-2.0 under the card) | trained M2, M3, M4; part of M6 | Tier 1 on the cards |
| D16 | PaddleOCR synthetic + collected Thai text | Not published | **Unknown** | trained M13, M14 | Tier 2-U |
| D17 | MIT1003 (Judd et al.) | No licence stated | **Unclear** | fitted 7 numbers in M22 | Tier 2-U (negligible) |
| D18 | ShanghaiTech A / B | Repo BSD-2-Clause; images from the internet and Shanghai streets, rights unclear | **Unclear** | trained C9, C10, C13 to C17 | Tier 2-U |
| D19 | UCF-QNRF | No licence on the page; web images | **No grant** | trained C7, C14 | Tier 2-U |
| D20 | NWPU-Crowd | "You may not use the dataset or any derivative work for commercial purposes" ([page](https://www.crowdbenchmark.com/nwpucrowd.html)) | **No (explicit)** | trained C7, C8, C11 | Tier 2-NC, explicit derivative ban |
| D21 | JHU-Crowd++ | "academic and non-commercial uses" ([page](http://www.crowd-counting.com/)) | **No (explicit)** | trained C11, C12 | Tier 2-NC |
| D22 | GCC (synthetic, from GTA V) | No licence stated; rendered from a commercial game | **Unclear** | crowd pretraining (not used) | Tier 2-U |
| D23 | SA-1B | Research-only | **No** | trained SAM (C26) | Tier 2-NC |
| D24 | VITON-HD (CC BY-NC 4.0), DressCode (not released to private companies) | Non-commercial | **No** | try-on models C20, C21 | Tier 3 models |
| D25 | CASIA-FaceV5 | Research use | **No** | **evaluation only** (Attendance; internal benchmark, not the only basis of a sales claim) | Eval only |
| D26 | Open Images V7 (faces; group photos; Person / Human head boxes) | Images listed as CC BY 2.0, annotations CC BY 4.0 ([facts and figures](https://storage.googleapis.com/openimages/web/factsfigures_v7.html)). Per-image licences are not guaranteed by Google; the people pictured are not covered by CC | **Yes** (attribution), subject to the C32 conditions (per-image licence check, drop `IsDepiction` boxes, people's rights) | **evaluation** (Exam face engine, Product Check face blur); candidate training source for C32 | Eval only today |
| D27 | LFW, MOT17, Wikimedia Commons, Open Food Facts packs, public plate photos | Public research data / CC / Open Database terms (see `ACCURACY-CLAIMS.md` for the `public` label) | per source | evaluation | Eval only |
| D28 | Monk Skin Tone Examples (MST-E), Sony FHIBE | MST-E "research or human-annotator-training only, not for training ML models"; FHIBE "research or evaluate bias in AI systems", commercial evaluation allowed | MST-E **No**; FHIBE evaluation only | Style design (not built) | Not used |

Reference-data sets (not training data; see `THIRD_PARTY.md` Assets for each licence): Pillbox (public domain), openFDA (CC0), TMT 2020-02-17 (CC BY), Health Canada DPD and recalls (OGL-Canada), NLEM 2567 (Royal Gazette / MIT), tarot scans (public domain), fonts (OFL 1.1). They are not tiered because no model is trained on them.

---

## D. Summary (each row counted once)

**Models**

| | Tier 1 | Tier 2-U | Tier 2-NC | Tier 2 total | Tier 3 | Not assessed | Rows |
|---|---|---|---|---|---|---|---|
| A. In the repo | 4 | 13 | 5 | 18 | 0 | 0 | 22 |
| B. Reviewed, not in the repo | 4 (2 by contract, not bought; 1 own detector, not built, subject to counsel; 1 BlazeFace full range, measurement only, not shipped) | 11 | 7 | 18 | 10 | 1 | 33 |
| **All** | **8** | **24** | **12** | **36** | **10** | **1** | **55** |

**Datasets (28 rows)**

| Commercial use of the data | Rows | Count |
|---|---|---|
| Yes (own, consented, CC BY / ODC-BY) | D13, D14, D15, D26 (D26 subject to the C32 conditions: per-image licence check, no depictions, people's rights not covered by CC) | 4 |
| Yes if verified per set or per source | D12, D27 | 2 |
| Unclear or unknown | D6, D7, D8, D11, D16, D17, D18, D19, D22 | 9 |
| No (non-commercial, research-only, mixed non-commercial images, or no grant) | D1, D2, D3, D4, D5, D9, D10, D20, D21, D23, D24, D25, D28 | 13 |

Read it as: **of the 22 model files and weights the code uses, 4 are tier 1 today** (the MediaPipe Face Landmarker, BlazeFace, Pose Landmarker and our driver eye classifier). The 18 tier-2 items are what the lawyer's question decides. **Every person / people-count detector in the repo (YOLOX-Nano, COCO-SSD) is tier 2-NC because COCO's images include non-commercial Flickr licences.** Nothing in the repo is tier 3 (the one NON-COMMERCIAL file, M21, is not shipped).

## E. What "tier 1 only" means for a customer build today (no code changed by this document)

| Product | Tier-2 items it loads in customer mode | Tier-1-only route |
|---|---|---|
| **Exam** (lab, hall) | M11 COCO-SSD (person count, 2-NC). Face engine M2 is tier 1 | Swapping COCO-SSD for M1 YOLOX-Nano **does not reach tier 1** (both COCO-trained, 2-NC). Tier-1 route: C32 (own detector from scratch on Open Images, subject to counsel), or run Exam on the face engine alone with no person count |
| **Gate** | M13 Thai OCR, M15 LPD-YuNet (both 2-U) | Own-photo trained Thai plate YOLOX **trained from scratch** (the current notebook starts from the COCO checkpoint, which would make it 2-NC) and own OCR; until then the guard types the plate (assisted mode already requires a person to confirm every read) |
| **Attendance** | M16, M17, M18 only if face mode is on | **PIN / QR is the default and is clean.** Face mode needs M2 / M3 plus a licensed recogniser (commercial SDK or insightface licence), or stays off |
| **Crowd** | **M1 YOLOX-Nano (2-NC)** (the detector is not tier 1) | No tier-1 counter exists today. Tier-1 route: C32 (own head / person detector from scratch on Open Images, subject to counsel; not built, needs a locked eval set and a measured round). Dense scenes also need density models (tier 2) or our own model |
| Others (store, checkout, studio, photobooth, palm, signage, faceread, customers, booth, creative) | M10, M12, M16 to M19, M6 to M9 | Not part of the four sellable products; off or demo-only until swapped |

## F. Open items to close tier-2 unknowns (documentation tasks, no legal question)

1. Record the Selfie Segmenter (M8) and Selfie Multiclass (M9) training-data statements from Google, or ask for them; **if Google states consented AR-app data, M8 and M9 move to tier 1**.
2. Record the rest of the Hand card's data statement (M6, M7), same effect.
3. Record the exact Xenova/modnet commit and MODNet's training sets (M10).
4. Verify COCO-SSD's backbone initialisation for the vendored build (M11). Check the COCO posture wording in `docs/CROWD-DENSITY-MODELS.md` (line 64, which refers to `vendor/models/yolox/README.txt`) so it no longer reads as tier 1.
5. Ask PaddlePaddle which sources the collected Thai text came from (M13, M14).
6. Name the dataset LPD-YuNet was trained on (M15), via an OpenCV Zoo issue.
7. Scope C32 (own head / person detector from scratch on Open Images) with a locked eval set; owner decision.

Update `LICENSES/THIRD_PARTY.md` only after the owner agrees a row's tier changes; this file is the tier view, `THIRD_PARTY.md` stays the per-component inventory.

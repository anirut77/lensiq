# Attendance face mode: commercially licensable recogniser options (measured 2026-11-14)

Owner order 2026-11-14, item E. **Nothing is switched.** PIN/QR stays the Attendance default, face stays optional,
and the product still uses face-api.js. This page lists candidate replacements, their licences, and one locked
measurement, so the owner can decide on a swap. Earlier desk research is in `docs/ATTENDANCE-READINESS.md` Part B, and
the licence letters are in `docs/LICENCE-REQUESTS.md` item 2 (F5 / F6 / L23).

**Source of every accuracy number on this page:** *public dataset*, the Face Research Lab London Set (CC BY 4.0;
see section 3). These are studio photos, not field data. Vendor and paper figures are labelled as such.

## สรุปสำหรับเจ้าของ (TH)

- **ยังไม่มีโมเดลเปิดตัวไหนที่ทั้งไฟล์โมเดลและข้อมูลฝึกอนุญาตใช้เชิงพาณิชย์ชัดเจน** ทุกตัวในตารางจึงติดสถานะ
  "ไม่ชัด ถามเจ้าของ" หรือ "ไม่ได้" เราไม่ได้เลือกตัวไหนมาใช้
- ตัวที่ใกล้ที่สุดคือ **AuraFace (fal.ai)**: ไฟล์โมเดลเป็น Apache-2.0 และผู้ทำบอกว่าฝึกบน "ชุดข้อมูลเชิงพาณิชย์"
  แต่ไม่บอกว่าชุดไหน ต้องขอเอกสารที่มาของข้อมูลก่อน และไฟล์ใหญ่ 261 MB ซึ่งใหญ่เกินไปสำหรับเบราว์เซอร์ถ้าไม่ย่อขนาด
- วัดบนชุดภาพสาธารณะ 102 คน (ถ่ายในสตูดิโอ จึงง่ายกว่าหน้างานจริง): **ทุกโมเดลจำเจ้าของหน้าได้ครบ** แต่ต่างกันที่
  **การรับคนแปลกหน้าผิด** ในโหมด 1:N (68 คนลงทะเบียน) face-api.js ตัวปัจจุบันรับคนแปลกหน้า 12–16%
  SFace / MobileFaceNet / AuraFace (3 รูป) รับ 0–1% (ไม่ได้ใช้กฎกันพลาดชุดเต็มของหน้า Attendance ดูข้อ 4)
- **ข้อเสนอ:** ยังไม่เปลี่ยน ขออนุมัติส่งอีเมลถาม fal.ai เรื่องที่มาของข้อมูลฝึก AuraFace (ไม่มีค่าใช้จ่าย)
  ถ้าได้คำตอบที่ชัด จึงทำโมเดลย่อขนาดแล้ววัดซ้ำ ระหว่างนี้คงใช้ PIN/QR เป็นค่าเริ่มต้น

## 1. Candidates

Status rule: a candidate is usable only when the weights, the code and the training data all clearly allow commercial
use. When the weights or the data are unclear, it is marked **"unclear, ask the owner"** and not picked.

| Candidate | Weights licence | Code licence | Training data (licence) | Status | In-browser feasibility | Size | Published accuracy (not ours) |
|---|---|---|---|---|---|---|---|
| **face-api.js `faceRecognitionNet`** (current; port of dlib ResNet) | CC0 (dlib) [dlib-models](https://github.com/davisking/dlib-models); port MIT | MIT [face-api.js](https://github.com/justadudewhohacks/face-api.js) | ~3 M faces from FaceScrub, VGG and web scrapes; research terms (F6 / L23) | **Unclear, ask the owner** (already flagged) | In use (TF.js) | 6.1 MB | LFW 99.38% (dlib author) |
| **AuraFace-v1** `glintr100.onnx` (fal.ai, iResNet100, ArcFace loss) | Apache-2.0 [HF card + LICENSE.md](https://huggingface.co/fal/AuraFace-v1); "can be used in commercial projects without limitations" [fal blog](https://huggingface.co/blog/isidentical/auraface) | uses insightface code (MIT) | "a commercial dataset comprising face images from various sources" (card); **datasets not named, consent not stated** | **Unclear, ask the owner** (data provenance undisclosed) | ONNX, runs in our ORT 1.20.1 WASM; fp32 too large to ship as is | 260.7 MB fp32 | LFW 99.65, CFP-FP 95.19, AgeDB 96.10 (fal, public datasets) |
| **SFace** 2021dec int8 (OpenCV Zoo, MobileFaceNet + SFace loss) | Apache-2.0: "All files in this directory are licensed under Apache 2.0" [opencv_zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface), [HF mirror](https://huggingface.co/opencv/face_recognition_sface) | Apache-2.0 | not named by OpenCV; the SFace paper trains on CASIA-WebFace, VGGFace2, MS-Celeb-1M [zhongyy/SFace](https://github.com/zhongyy/SFace) (research datasets) | **Unclear, ask the owner** (likely research data) | ONNX, ORT WASM; OpenCV.js also possible | 9.9 MB int8 (38.7 MB fp32) | 99.32% int8 / 99.40% fp32 with opencv_zoo `tools/eval` (OpenCV; dataset LFW per their eval script) |
| **MobileFaceNet** (Qualcomm AI Hub export of foamliu/MobileFaceNet) | Apache-2.0 [HF card](https://huggingface.co/qualcomm/MobileFaceNet); upstream Apache-2.0 [foamliu](https://github.com/foamliu/MobileFaceNet) | Apache-2.0 | "Refined MS-Celeb-1M" (README): Microsoft withdrew MS-Celeb-1M in 2019; research-only | **No** (data). Measured as a small-model reference only | ONNX, ORT WASM | 3.7 MB | LFW 99.48% (card) |

**Not measured, and why:**

| Candidate | Why excluded |
|---|---|
| insightface open models (buffalo_l / buffalo_s, antelopev2, ArcFace R100) | Weights "available for non-commercial research purposes only" [insightface](https://github.com/deepinsight/insightface); a commercial licence is sold by email, price not published. Not run, because running non-commercial weights for a commercial decision is outside their licence. Can be measured under a trial licence. |
| EdgeFace (Idiap) | Official weights on Hugging Face are **CC BY-NC-SA 4.0** (`Idiap/EdgeFace-*`) — non-commercial. |
| AuraFace's other files (`scrfd_10g_bnkps`, `2d106det`, `1k3d68`, `genderage`) | These are insightface models bundled in the same repo, under insightface terms. Not used. |
| AdaFace, GhostFaceNets, TFace, FaceNet, Human FaceRes, synthetic-data models (DigiFace-1M) | Weights have no licence, or the data is research-only or non-commercial (see `docs/ATTENDANCE-READINESS.md` B3). |
| `py-feat/mobilefacenet` | The card itself says no redistribution licence has been established for the checkpoint. |
| `LibreYOLO/librefacerec-l` | A byte-identical mirror of AuraFace `glintr100.onnx` (same sha256 `a7933ea5…5c60`); same status as AuraFace. |

## 2. On-device notes

- All three ONNX candidates loaded in the vendored `vendor/ort/ort.wasm.min.js` (ORT 1.20.1, WASM only; this build has
  no WebGPU). The live pages run ORT on 1 thread because GitHub Pages is not cross-origin isolated.
- Candidates need 5-point alignment. The harness used the vendored MediaPipe Face Landmarker (Apache-2.0) for this.
  It also replaces face-api's tiny detector, which has its own data question (F5). A swap therefore clears F5 as well.
  The landmarker README currently says it is "never used to identify, match"; a swap would have to change that note.
- MediaPipe's image input needs WebGL. Kiosk browsers have it; the measurement used SwiftShader WebGL.

## 3. Evaluation set and protocol (locked before measuring)

- **Dataset:** Face Research Lab London Set, DeBruine & Jones (2017), figshare, doi
  [10.6084/m9.figshare.5047666.v5](https://doi.org/10.6084/m9.figshare.5047666.v5), **CC BY 4.0** (allows commercial
  use with attribution). 102 adults photographed in London in April 2012. All gave signed consent for use "in lab-based
  and web-based studies in their original or altered forms and to illustrate research". Self-reported ethnicity:
  69 white, 13 black, 10 West Asian, 9 East Asian, 1 East Asian/white. Ages are in `london_faces_info.csv`.
  - Our use is internal measurement only. The images are not redistributed, not used for training and not shown in
    sales material. Images stay in `~/LENSIQ-field/evals/attendance-face/images/`, never in the repo. Counsel
    question: does internal benchmarking fit the consent wording? (same type of question as L40).
  - Views used: neutral and smiling, front and 3/4 left / right (612 images). Profile views were not used.
- **Frame:** each 1350 px photo was drawn at 480 × 480 inside a 640 × 480 grey frame, like a kiosk webcam frame.
- **Split (fixed by a hash of the id):** 34 dev people (threshold only) and 68 test people.
- **Enrolment:** E1 = 1 photo (neutral front). E3 = 3 photos (neutral front, left 3/4, right 3/4), averaged, like the
  3-pose enrolment in Attendance. **Probes:** smiling front, smiling left 3/4, smiling right 3/4.
- **Metrics:** accept = score > T. T_dev = the threshold that gives FAR ≤ 1e-3 on dev people. FAR / FRR at T_dev on
  test people (204 genuine, 13,668 impostor comparisons). TAR at FAR = 1e-3 on test. FAR / FRR at each model's
  published default threshold. 1:N: 68 test people enrolled, test probes as members, the 102 dev probes as strangers.
  The 95% CIs are a person-cluster bootstrap (2,000 resamples). A probe with no face counts as a reject.
- **Lock:** `evals-locks/attendance-face.sha256`. The first lock is commit `694863c`. The harness was re-locked in
  commit `69e8693` after run 1 crashed on its first warm-up image (MediaPipe needs WebGL) and produced no output. The
  only change was the Chrome launch flags. The set, protocol and models were unchanged. Harness:
  `tools/attendance-face/{run.mjs,page.js,page.html,score.mjs}`. Raw outputs and scores:
  `~/LENSIQ-field/evals/attendance-face/results/`.
- **Independent review:** a separate agent checked the lock, re-derived the split and re-scored the raw outputs with
  its own scorer, written from the protocol text without reading `score.mjs`. Every point estimate matched for all
  8 model × enrol cells. It noted that the threshold rule is the (k+1)-th highest dev impostor score (k = 3 of 3,366).
  That rule is valid: at most 3 dev impostors pass, so FAR ≤ 0.089%. It also confirmed there is no dev / test leakage.

## 4. Results

Source: *public dataset* (Face Research Lab London Set, CC BY 4.0), run 2026-11-14, lock commit `69e8693`. No face was
missed by either detector on any of the 612 images.

| Model | Enrol | T_dev | FAR at T_dev (test) [95% CI] | FRR at T_dev (test) | TAR at FAR = 1e-3 (test) [95% CI] | 1:N members recognised / strangers accepted |
|---|---|---|---|---|---|---|
| face-api.js (current) | E1 | dist < 0.578 | **0.45%** [0.25–0.66] | 0% | 99.0% [94.6–100] | 100% / **15.7%** |
| face-api.js (current) | E3 | dist < 0.521 | **0.34%** [0.16–0.53] | 0% | 100% [99.0–100] | 100% / **11.8%** |
| SFace int8 | E1 | cos > 0.452 | 0.02% [0.00–0.05] | 0% | 100% | 100% / 1.0% |
| SFace int8 | E3 | cos > 0.471 | 0.04% [0.00–0.10] | 0% | 100% | 100% / 0.0% |
| MobileFaceNet | E1 | cos > 0.398 | 0.05% [0.01–0.11] | 0% | 100% | 100% / 1.0% |
| MobileFaceNet | E3 | cos > 0.424 | 0.03% [0.00–0.08] | 0% | 100% | 100% / 1.0% |
| AuraFace | E1 | cos > 0.320 | 0.10% [0.04–0.18] | 0% | 100% | 100% / 7.8% |
| AuraFace | E3 | cos > 0.392 | 0.07% [0.01–0.14] | 0% | 100% | 100% / 1.0% |

At published default thresholds (test): face-api.js at 0.6 has FAR 0.73% (E1) and 1.88% (E3), with FRR 0%. The LENSIQ
base limit of 0.50 has FAR 0.10% / FRR 0.98% (E1) and FAR 0.21% / FRR 0% (E3). SFace at the OpenCV default (cosine
0.363) has FAR 0.45% (E1) and 0.99% (E3), with FRR 0%. AuraFace and MobileFaceNet publish no default.

**How to read this:**

- **The set is too easy to separate the candidates on recognition.** It is one studio session in uniform light, with
  enrolment and probes taken the same day. FRR is 0% for every model. With 0 misses out of 68 people, the
  person-level upper bound is about 5.3% (Wilson 95%). These numbers say nothing about kiosk lighting, masks,
  glasses or ageing. Our earlier held-out Asian set (CASIA-FaceV5, research-use) gave face-api.js only 66–76%.
- **The difference shows in false accepts.** At the same tuned FAR target, face-api.js's dev threshold did not carry
  over to the test people (0.34–0.45% FAR, 3–4× the target). In 1:N it accepted 12–16% of strangers. The three
  candidates stayed at about 0–0.1% FAR, and at 0–1% strangers with 3-photo enrolment.
- **These are bare-model numbers.** The Attendance page adds group-scaled limits, a margin to the second best, a
  per-person floor, 2-frame confirmation and "please confirm" prompts. Those rules were not applied here, so 12–16% is
  **not** the page's stranger rate. The comparison between models is fair; the absolute product rate is not shown.
- **Small groups.** 10 East Asian people: all were accepted at T_dev for every model. That is too few for any
  subgroup claim. A Thai field set is still needed (`docs/ATTENDANCE-READINESS.md` B6).
- **The low-FAR tail is thin.** T_dev rests on the 4th-highest of 3,366 dev impostor scores. Do not quote any FAR
  below about 0.1% from this set.

**Speed** (ms per face, headless Chrome 157, Apple M1, 8 cores, 8 GB; TF.js and ORT on WASM, 1 thread; the first
3 images were discarded as warm-up). **Measured under heavy load** from other agents: load average was 38.7 at the
start and 319.6 at the end (1-minute values; the run took 29 min). Absolute times are inflated; only the order between
models is meaningful. Re-measure on an idle machine before quoting any speed.

| Pipeline | Median | p90 |
|---|---|---|
| face-api.js: detect + 68 landmarks + descriptor (cascade 320/224/160) | 267 ms | 448 ms |
| MediaPipe landmarker (detect + 478 points), shared by all candidates | 45 ms | 82 ms |
| MobileFaceNet embed / full pipeline | 132 / 206 ms | 231 / 350 ms |
| SFace int8 embed / full pipeline | 399 / 473 ms | 656 / 766 ms |
| AuraFace fp32 embed / full pipeline | 1,488 / 1,558 ms | 2,667 / 2,780 ms |

## 5. Recommendation

1. **Do not switch now.** No candidate has clean weights and clean training data together. PIN/QR stays the
   default, and face mode keeps its current "licence under review" status in customer builds (L23).
2. **Ask fal.ai about AuraFace's training data** (free; owner approval needed to send). Ask which datasets were used,
   whether the subjects consented or the images were licensed for face-recognition training, and whether fal will
   state this in writing. AuraFace is the only open candidate whose authors claim commercial data at all. Its 3-photo
   result matched the small models (1.0% strangers, 0.07% FAR).
3. **If fal answers clearly:** make an int8 or fp16 AuraFace (about 65–130 MB, not measured), re-lock and re-measure
   on this set and on a consented Thai field set. Then decide.
4. **If fal does not answer or the data is not clean:** the remaining routes are those in `docs/ATTENDANCE-READINESS.md`
   B5: buy the insightface commercial licence (price unknown), a native on-prem SDK, or keep PIN/QR only. SFace is the
   best technical fit for the browser (9.9 MB, lowest FAR here), but only if OpenCV can show its training data is
   commercially usable. The SFace paper names research datasets, so this is unlikely.

## 6. Migration effort (if a candidate is cleared later)

| Work | Effort |
|---|---|
| Replace face-api detect + landmarks + descriptor with MediaPipe Face Landmarker + 5-point alignment + ORT embedder behind `LQTrack` / `attendance.js` (also `customers.js`, `booth.js`, `teamface` if they switch) | M (3–5 days) |
| New template format (128-D or 512-D cosine instead of 128-D Euclidean): bump the `LQVault` record version, require re-enrolment of every person, keep old templates readable until deleted | S–M |
| Re-calibrate `FACE_RULES` (limit, margin, floor, group scale) for cosine scores; re-run `tests/bench/face1n.bench.mjs` and this harness | M |
| Model delivery: SFace / MobileFaceNet 4–10 MB is like today; AuraFace needs quantisation and a 65–260 MB cached download (first-run time on kiosks) | S (small) / L (AuraFace) |
| Licence label, `LICENSES/THIRD_PARTY.md`, credits, landmarker README note, TH/EN/ZH consent and help text | S |
| Unit and e2e tests (fake detector path stays), CI | S–M |

Total: about 2 weeks for a small model and 3 weeks for AuraFace, in line with the `docs/LEGAL-REVIEW-PACK.md` §4
estimate.

## 7. Credits

- Face Research Lab London Set: DeBruine, L. & Jones, B. (2017). figshare. doi:10.6084/m9.figshare.5047666.v5. CC BY 4.0.
- AuraFace-v1, fal.ai (Apache-2.0). SFace, Yaoyao Zhong; ONNX conversion by Chengrui Wang; OpenCV Zoo (Apache-2.0).
  MobileFaceNet, foamliu (Apache-2.0); export by Qualcomm AI Hub (Apache-2.0). MediaPipe Face Landmarker, Google
  (Apache-2.0).
- The model downloads were deleted after the run (hashes are kept in the lock and in `models.json`).

## รอคุณตัดสิน

1. **ส่งอีเมลถาม fal.ai เรื่องข้อมูลฝึก AuraFace หรือไม่**
   - **คำถาม:** อนุญาตให้ส่งอีเมลถาม fal.ai ไหม ว่า AuraFace ฝึกด้วยชุดข้อมูลอะไร คนในภาพยินยอมหรือมีสิทธิ์ใช้ภาพเพื่อฝึกการจดจำใบหน้าไหม
     และจะยืนยันเป็นลายลักษณ์อักษรได้ไหม (ไม่มีค่าใช้จ่าย ยังไม่ส่ง)
   - **ตัวเลือก:** (ก) ส่ง (ข) ไม่ส่ง และไปทางซื้อไลเซนส์ insightface หรือ SDK เชิงพาณิชย์แทน
     (ค) ไม่ส่ง และใช้ PIN/QR อย่างเดียว
   - **ตัวเลขประกอบ:** ชุดภาพสาธารณะ 102 คน (สตูดิโอ, CC BY 4.0) ลงทะเบียน 3 รูป: AuraFace รับคนแปลกหน้า 1.0% FAR 0.07%
     face-api.js ตัวปัจจุบัน 11.8% FAR 0.34% ทุกตัวจำเจ้าของหน้าได้ 100% (ชุดนี้ง่ายกว่าหน้างาน)
     AuraFace ไฟล์ 261 MB ต้องย่อก่อนใช้ในเบราว์เซอร์
   - **ข้อเสนอ:** (ก) ส่ง เพราะเป็นทางเดียวที่อาจได้โมเดลเปิดที่สะอาดโดยไม่เสียเงิน
   - **ถ้าไม่ตอบ:** ไม่ส่งอะไร ไม่เปลี่ยนอะไร ใช้ PIN/QR เป็นค่าเริ่มต้นและ face-api.js ในโหมดใบหน้าที่เลือกใช้เหมือนเดิม
2. **ส่งอีเมลถาม OpenCV เรื่องข้อมูลฝึก SFace หรือไม่**
   - **คำถาม:** อนุญาตให้ถาม OpenCV ไหม ว่าไฟล์ SFace 2021dec ฝึกด้วยชุดข้อมูลไหน (ไม่มีค่าใช้จ่าย)
   - **ตัวเลือก:** (ก) ถามพร้อมข้อ 1 (ข) ไม่ถาม
   - **ตัวเลขประกอบ:** SFace int8 ขนาด 9.9 MB, FAR 0.02–0.04%, รับคนแปลกหน้า 0–1% บนชุดเดียวกัน
     แต่บทความต้นฉบับระบุชุดข้อมูลเพื่อการวิจัย (CASIA-WebFace, VGGFace2, MS-Celeb-1M) จึงมีโอกาสผ่านต่ำ
   - **ข้อเสนอ:** (ก) ถาม เพราะไม่มีค่าใช้จ่ายและเป็นตัวที่เหมาะกับเบราว์เซอร์ที่สุดถ้าผ่าน
   - **ถ้าไม่ตอบ:** ไม่ถาม และไม่เปลี่ยนอะไร

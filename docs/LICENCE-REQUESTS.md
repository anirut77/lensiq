# Licence and permission requests (drafts for the owner)

> **Drafts for the owner (Tum), not sent.** Prepared 2026-11-10. Nothing in this file has been sent to anyone.
> The owner sends every letter himself, after counsel has read it (`docs/LEGAL-REVIEW-PACK.md`, `docs/CTO-BRIEF.md` §8).
>
> **Scope.** Every model, dataset or data service that LENSIQ keeps off, limits to the research demo, or holds back
> because of its licence. Findings already in the repo are reused, not redone:
> `LICENSES/THIRD_PARTY.md` (F1–F9, A1–A6), `docs/CTO-BRIEF.md` §2 and §8 (L1–L40), `docs/TRYON-DESIGN.md` §3.3,
> `docs/NUTRITION-DESIGN.md` §4.3 and §12, `docs/product-check/DRUG-DATA-SOURCES.md`, `docs/CROWD-DENSITY-MODELS.md`,
> `docs/product-check/FACE-BLUR-RESULTS.md` §4, `docs/legal/*.md`.
>
> **Labels.** **[PRIMARY]** = read on the holder's own page on 2026-11-10 (or in the cited repo doc, which read it
> earlier). **[SECONDARY]** = third-party page or search result. **[UNVERIFIED]** = could not be confirmed; check before
> sending. Contacts are public business or academic channels only (institution offices, company sales pages, addresses
> a page publishes for permission or dataset questions, public GitHub issues). No private addresses were collected.
> Not legal advice.
>
> **One letter per holder.** Where several items have the same holder, they share one letter (for example the four
> face-api.js models, or IDM-VTON and VITON-HD at KAIST).

## Contents

1. Summary table
2. สรุปภาษาไทย (Thai summary)
3. Items, priority 1: Exam, Gate, Crowd, Attendance
4. Items, priority 2: Product Check, Nutrition, Try-On
5. Items, priority 3: demo-only and Studio
6. Other licence-limited items found (no letter proposed)
7. Draft letters (A–P)
8. Sending checklist for the owner
9. Sending log (fill in; no personal data)

---

## 1. Summary table

Priority: **P1** = Exam, Gate, Crowd, Attendance (revenue first) · **P2** = Product Check, Nutrition, Try-On · **P3** =
research demo only, Studio, or already solved by a shipped alternative. THB at about 33.3 THB per USD (as in
`docs/TRYON-DESIGN.md`).

| # | Item | Holder (who must say yes) | Commercial licence offered? | Price published | Letter | Best commercial-safe alternative | Priority |
|---|---|---|---|---|---|---|---|
| 1 | face-api.js tiny face detector + 68 landmarks (training data) | Vincent Mühler (face-api.js author); data owners unknown | No offer; weights MIT, data provenance undocumented | — | A (EN, GitHub issue) | MediaPipe BlazeFace (already vendored) + Face Landmarker, Apache-2.0 | **P1** (Exam, Attendance) |
| 2 | face-api.js face recognition (dlib ResNet port; training data) | Davis E. King (dlib weights, CC0); VGG Face / FaceScrub data owners | No offer; weights CC0, data research-only [UNVERIFIED for each set] | — | B (EN) + A | PIN / QR (already default in Attendance); commercial face SDK | **P1** (Attendance) |
| 3 | face-api.js age/gender (UTKFace + other sets) | face-api.js author (weights); UTK AICIP lab / UTRF (UTKFace); ETH Zurich and others (other sets) | **No** (UTKFace: "non-commercial research purposes only") | — | A + C (EN) | None on-device known; keep off; commercial vendor with data warranty | P3 (signage demo) |
| 4 | face-api.js expression (training data) | face-api.js author; data "publicly available datasets as well as images scraped from the web" | No offer | — | A (EN) | MediaPipe Face Landmarker blendshapes (Apache-2.0): smile / mouth signals, not emotion labels | P3 (neuro, booth, signage, photobooth demo) |
| 5 | faceparse BiSeNet trained on CelebAMask-HQ | CUHK MMLab (CelebAMask-HQ); CUHK ORKTS; upstream CelebA image owners | **No** ("non-commercial research purposes only") | — | D (EN) | MediaPipe Selfie Multiclass (already the default) | P3 (Studio, off) |
| 6 | YOLOv9 plate detector, open-image-models | ankandrew (repo, weights) | No offer; weights carry no licence | — | **None: decided not used (2026-11-10)** | Thai-trained YOLOX-nano (Apache-2.0, in progress); LPD-YuNet meanwhile | Closed (Gate) |
| 7 | TMT / TTMT current release (L29) | สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย (สมสท. / THIS) | Unknown; THIS lists an "academic service fees (TMT)" line | Not published | **M (TH, new)** | TMT 2020-02-17 snapshot, CC BY (6 years old) | **P2** (Product Check) |
| 8 | Thai FDA web service `WS_LICENSE_SEARCH` (L13) | สำนักงานคณะกรรมการอาหารและยา (อย.) | Unknown ("License not specified") | — | Existing letter `docs/legal/FDA-PERMISSION-REQUEST-TH.md` + **N (TH follow-up)** | Link out to the FDA / Oryor search page | **P2** (Product Check) |
| 9 | INMU Thai FCD v3 (+ ASEAN FCD) | สถาบันโภชนาการ มหาวิทยาลัยมหิดล (INMU) | **Yes, on request:** commercial use "may incur fees" | Not published | O (TH) | USDA FoodData Central (CC0) + owner-weighed portions | **P2** (Nutrition) |
| 10 | Department of Health Thai Food Composition Table (added) | สำนักโภชนาการ กรมอนามัย | Unknown (copyright notice, no licence) | — | P (TH) | USDA FDC (CC0) | P2 (Nutrition) |
| 11 | IDM-VTON | KAIST (Jinwoo Shin's group) + OMNIOUS.AI | No offer (CC BY-NC-SA 4.0) | — | E (EN) | FASHN API (commercial licence included) | P2 (Try-On, low) |
| 12 | OOTDiffusion | Xiao-i Research (Xiao-i Corporation) | No offer (CC BY-NC-SA 4.0) | — | F (EN) | FASHN API | P2 (Try-On, low) |
| 13 | CatVTON | Sun Yat-sen University / Pixocial Technology (+ Pengcheng Lab, SIAT) | No offer (CC BY-NC-SA 4.0) | — | G (EN) | FASHN API | P2 (Try-On, low) |
| 14 | Leffa | Meta AI (code and weights MIT); blocker is the data (items 15, 16) | Weights already MIT; data not cleared | — | H (EN, optional) | FASHN API | P2 (Try-On, low) |
| 15 | VITON-HD dataset | KAIST (Jaegul Choo's group) | **No** (CC BY-NC 4.0, "research purposes only") | — | E (EN, with item 11) | Owner / partner-shop / volunteer data (TRYON §4.1) | P2 (Try-On, low) |
| 16 | DressCode dataset | UNIMORE AImageLab; images from YOOX NET-A-PORTER catalogues | **No** ("will not be released to private companies") | — | I (EN) | As item 15 | P2 (Try-On, low) |
| 17 | BRIA RMBG-1.4 / 2.0 (cut-out) | BRIA AI | **Yes** (commercial agreement; also via BRIA API) | API: **USD 0.018 / image (≈ 0.6 THB)**; self-hosted licence: not published (custom) | J (EN, quote request) | BRIA API itself; on-device MODNet / MediaPipe for people only | P2 (Try-On / Studio cut-out) |
| 18 | MODNet weights and data provenance | Zhanghan Ke et al. (ZHKKKe/MODNet) | Already Apache-2.0 (since 2022-01-28) | Free | L (EN, confirmation only) | MediaPipe selfie segmenter (lower edge quality) | P3 (Studio, photobooth; shipped) |

**Not letters, but listed for completeness** (section 6): dense-crowd density models and datasets (Crowd), YuNet /
WIDER FACE, SAM / SA-1B, BiRefNet / IS-Net / U²-Net, FASHN human parser (NVIDIA SegFormer), FLUX / FitDiT, PyMuPDF,
DTAM and DMSc data, and the items that already have letters (WHO, UBU).

---

## 2. สรุปภาษาไทย

- **มีทั้งหมด 18 รายการ** ที่ปิดอยู่หรือจำกัดเพราะสัญญาอนุญาต และจดหมายร่าง 15 ฉบับ (A–P ยกเว้น K) จดหมายภาษาอังกฤษถึงผู้ถือสิทธิ์ต่างประเทศ
  ภาษาไทยถึงหน่วยงานไทย (สมสท., อย. ฉบับติดตาม, INMU, กรมอนามัย) **ยังไม่ได้ส่งอะไรเลย** คุณตั้มเป็นผู้ส่งเอง
- **มีราคาเชิงพาณิชย์ประกาศไว้ชัดเจนแค่รายเดียว:** BRIA (RMBG) ผ่าน API ราคา 0.018 ดอลลาร์ต่อภาพ (ประมาณ 0.6 บาท)
  ส่วนสิทธิ์ใช้งานแบบติดตั้งเองต้องขอใบเสนอราคา INMU บอกว่าการใช้เชิงพาณิชย์ "อาจมีค่าธรรมเนียม" แต่ไม่ประกาศราคา
  สมสท. มีเบอร์ "ค่าบริการทางวิชาการ (TMT)" แต่ไม่ประกาศราคา FASHN (ทางเลือกลองชุด) 0.075 ดอลลาร์ต่อเครดิต (ประมาณ 2.5 บาท)
- **รายการที่แทบไม่มีทางได้สิทธิ์:** UTKFace (อายุ/เพศ), CelebAMask-HQ, VITON-HD, DressCode รูปในชุดข้อมูลเหล่านี้เป็นของ
  เจ้าของภาพเดิมหรือของบริษัทอื่น มหาวิทยาลัยจึงอนุญาตแทนไม่ได้ ส่งได้แต่ไม่ควรรอคำตอบ ให้ใช้ทางเลือกแทน
- **สำคัญต่อรายได้ที่สุด (P1):** โมเดลหาใบหน้าและจุดใบหน้าของ face-api.js ที่ Exam และ Attendance ใช้อยู่ และโมเดลจดจำใบหน้า
  (dlib) ของ Attendance ข้อมูลที่ใช้ฝึกไม่มีเอกสารบอกที่มา ทางเลือกที่สะอาดคือ MediaPipe BlazeFace ซึ่งมีในโปรเจกต์แล้ว
  (แต่ยังไม่ได้วัดผลกับงานสอบ) และ PIN/QR สำหรับลงเวลา ซึ่งเป็นค่าเริ่มต้นอยู่แล้ว Gate และ Crowd ไม่ติดปัญหาสัญญาในตัวที่ใช้อยู่
- **MODNet แก้ได้แล้วบางส่วน:** ไฟล์ `vendor/models/modnet.onnx` ตรงกับ Xenova/modnet `onnx/model.onnx` ทุกไบต์ (sha256 ตรงกัน)
  และ repo นั้นสร้างเมื่อ 5 ก.พ. 2567 หลังจาก MODNet เปลี่ยนเป็น Apache-2.0 (28 ม.ค. 2565) เหลือแค่ถามยืนยันชุดข้อมูลที่ใช้ฝึก
- **ส่ง 3 ฉบับแรก:** (1) จดหมาย A ถึงผู้เขียน face-api.js (Exam, Attendance) (2) จดหมาย B ถึง Davis King (dlib, Attendance)
  (3) จดหมาย M ถึง สมสท. เรื่อง TMT พร้อมส่งหนังสือ อย. ที่ร่างไว้แล้ว (Product Check, หน่วยงานไทย มีโอกาสได้คำตอบสูง)
- **YOLOv9 (open-image-models): ตัดสินใจแล้วว่าไม่ใช้เลย (10 พ.ย. 2569)** แม้แต่เดโมในเครื่อง ไม่ต้องส่งจดหมาย
  ทางเลือกคือ YOLOX-nano ที่ฝึกด้วยป้ายทะเบียนไทย (Apache-2.0) ซึ่งกำลังทำอยู่
- **INMU:** มีหนังสือขออนุญาตภาษาไทยฉบับเต็ม (จดหมาย O) สำหรับ Nutrition Lens
- **อย่าเปิดสวิตช์ใดๆ** จนกว่าจะได้หนังสืออนุญาตเป็นลายลักษณ์อักษรและทนายอ่านแล้ว

---

## 3. Items, priority 1: Exam, Gate, Crowd, Attendance

Gate and Crowd have no licence-blocked component in what they ship today: Gate uses PP-OCRv5 and LPD-YuNet
(Apache-2.0), Crowd uses YOLOX-Nano (Apache-2.0). Their limited items are YOLOv9 (decided: not used, item 6) and the dense-crowd models (section 6).
The P1 risk is the face-api.js models used by **Exam** and **Attendance**.

### Item 1. face-api.js tiny face detector and 68-point landmarks

- **What and how used today: ON** in production pages. Exam lab counts faces and head turn
  (`exam-lab.js` header: "face-api TinyFaceDetector + 68 landmarks"); also attendance, booth, customers, driver,
  interview, teamface, signage, neuro, studio, photobooth, faceread (`git grep tinyFaceDetector`). Files
  `vendor/models/tiny_face_detector_model.*`, `face_landmark_68_model.*`. Flag F5 / L23 / M1.
- **Blocker:** weights are MIT, but the training data is undocumented. face-api.js README [PRIMARY,
  github.com/justadudewhohacks/face-api.js]: the detector was trained on "a custom dataset of ~14K images labeled with
  bounding boxes"; the landmarks on "a dataset of ~35k face images labeled with 68 face landmark points". No source,
  no licence for those images. For comparison, dlib's own 68-point model carries the note "The license for this dataset
  excludes commercial use … the trained model therefore can't be used in a commercial product" (iBUG 300-W)
  [PRIMARY, github.com/davisking/dlib-models]; face-api.js trained its own landmark model, so that note does not apply
  directly, but it shows the risk class.
- **Rights holder:** weights: Vincent Mühler (GitHub `justadudewhohacks`), MIT. Maintained fork: `vladmandic/face-api`
  (MIT). Data: unknown.
- **Contact:** public GitHub issue on github.com/justadudewhohacks/face-api.js (or a Discussion on
  github.com/vladmandic/face-api, whose maintainer may know the provenance). No email published for licensing.
  Whether the original author still answers: [UNVERIFIED].
- **Commercial licence offered:** not applicable (MIT weights); the open question is the data, which nobody offers.
- **Letter:** A.
- **Best alternative:** MediaPipe BlazeFace short range (Apache-2.0, already vendored as
  `vendor/models/face-gate/blaze_face_short_range.tflite`) for face count, plus MediaPipe Face Landmarker
  (Apache-2.0, 478 points, not vendored yet) for head pose. **Trade-off:** BlazeFace short range is built for faces
  within about 2 m; in Product Check it missed about a third of real faces, mostly small ones
  (`docs/product-check/FACE-BLUR-RESULTS.md`). Fine for a webcam exam (one close face), weak for an exam-hall wide shot.
  Not measured on Exam yet. Swapping is a scope change: ask the owner before starting.

### Item 2. face-api.js face recognition (dlib ResNet port)

- **What and how used today: ON** where face mode is chosen: attendance (face optional; PIN / QR default), customers,
  booth, teamface (`attendance.js`, `customers.js`, `booth.js`; `vendor/models/face_recognition_model.*`, 6.1 MB).
  Measured TAR 86.5 % at FAR 0.09 % on public photos (CTO-BRIEF §2). Flag F6 / L23.
- **Blocker:** weights are CC0 ("anyone can do whatever they want with these model files as I've released them into
  the public domain" [PRIMARY, github.com/davisking/dlib-models]), but "The network was trained from scratch on a
  dataset of about 3 million faces" [PRIMARY], which dlib's author has described as built from the FaceScrub and VGG
  datasets plus images scraped from the internet [SECONDARY, dlib blog; also `LICENSES/THIRD_PARTY.md` F6]. VGG Face
  and FaceScrub are research datasets [UNVERIFIED terms per set].
- **Rights holder:** weights: Davis E. King (dlib), CC0; face-api.js port: Vincent Mühler (MIT). Data: Oxford VGG
  (VGG Face) and the FaceScrub authors [UNVERIFIED], plus unknown web images.
- **Contact:** public GitHub issue on github.com/davisking/dlib-models, or the contact route on dlib.net [UNVERIFIED].
- **Commercial licence offered:** not applicable for the weights (CC0); no one offers a data licence.
- **Letter:** B (and A for the port).
- **Best alternative:** PIN / QR time clock (already the Attendance default; no biometrics). For face mode, a
  commercial face SDK with a warranty on its training data (price not researched;
  `docs/LEGAL-REVIEW-PACK.md` §4 estimates 2–3 weeks to swap behind `lensiq-facevault.js`). No Apache-2.0 browser face
  recogniser with documented commercial training data is known.

---

## 4. Items, priority 2: Product Check, Nutrition, Try-On

### Item 7. TMT / TTMT current release files (THIS, L29), letter not yet drafted elsewhere

- **What and how used today: OFF.** Product Check does not use the current release; only the 2020-02-17 CC BY snapshot
  on data.go.th is approved as a seed (`docs/product-check/DRUG-DATA-SOURCES.md` S1–S3; test files outside the repo).
- **Blocker:** "No licence or terms of use on the download, login, register or FAQ pages. Footer: '© สงวนลิขสิทธิ์ 2565 :
  สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย'" (https://this.or.th/service/tmt/download/); HSRI catalogue label
  "Open Data Common" is undefined (https://opendata.hsri.or.th/dataset/tmlt-thai-standard) [PRIMARY, S1]. The 2568
  release on data.go.th is also "Open Data Common", not CC BY (L29, checked 2026-11-10).
- **Rights holder:** สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย (สมสท. / THIS), under HSRI (สวรส.). TTMT is made with
  กรมการแพทย์แผนไทยและการแพทย์ทางเลือก (DTAM).
- **Contact** [PRIMARY, this.or.th/contact]: ชั้น 3 อาคารสุขภาพแห่งชาติ 88/39 ถนนติวานนท์ 14 ต.ตลาดขวัญ อ.เมือง
  จ.นนทบุรี 11000 · โทร 02-027-9711 ต่อ 9071 (TMT and Drug Catalogue), ต่อ 9090 (ค่าบริการทางวิชาการ TMT) ·
  email tmt@this.or.th (from the 2020 release note, S-notes; current validity [UNVERIFIED], the contact page hides
  addresses).
- **Commercial licence offered:** unknown. The "academic service fees (TMT)" line suggests a paid service exists; no
  price published.
- **Letter:** M (Thai).
- **Best alternative:** TMT 2020-02-17 snapshot (CC BY; 30,683 TPU rows) with a "data as of 2020" label (L30); RxNorm
  for international names. Trade-off: drugs registered after Feb 2020 are missing.

### Item 8. Thai FDA web service `WS_LICENSE_SEARCH` (L13)

- **What and how used today: ON for testing** by owner decision, proxied in `backend/src/med.js`; written permission
  needed before charging (CTO-BRIEF L13).
- **Blocker:** data.go.th entries: "License not specified" [PRIMARY, DRUG-DATA-SOURCES S15].
- **Rights holder:** สำนักงานคณะกรรมการอาหารและยา.
- **Contact and letter:** the full letter already exists: `docs/legal/FDA-PERMISSION-REQUEST-TH.md` (not sent). It is
  **not repeated here**. Only a **follow-up** is added (letter N), to send if there is no reply about 30 days after the
  first letter, or to answer a reply that asks for more detail.
- **Commercial licence offered:** unknown.
- **Best alternative:** a link-out button to the FDA / Oryor search page with the number pre-filled for the user to
  check, with no data reused. Trade-off: no in-app status.

### Item 9. INMU Thai Food Composition Database v3 (and ASEAN FCD)

- **What and how used today: OFF in the product;** values may be used only as `measurement_only` references for the
  test set (N-D3; `docs/NUTRITION-DESIGN.md` §4.3, L-N1, L-N3). Nutrition is not built yet.
- **Blocker** [PRIMARY, https://inmu.mahidol.ac.th/thaifcd/]: "Non-commercial users are authorised to access and use
  the data free of charge"; "Reproduction for resale or other commercial purposes, including use in educational
  products or services, may incur fees." Footer "© Thai FCD ALL RIGHTS RESERVED." ASEAN FCD: "Copyright © 2012
  Institute of Nutrition, Mahidol University. All rights reserved."
- **Rights holder:** สถาบันโภชนาการ มหาวิทยาลัยมหิดล (INMU), Office of ASEANFOODS Regional Centre.
- **Contact** (published on the Thai FCD page for permission requests) [PRIMARY]: the two staff e-mail addresses listed on the Thai FCD
  permission page https://inmu.mahidol.ac.th/thaifcd/content/term-and-condition (not copied into this public repo) · +66-2-800-2380 ext. 324 or 423 · Institute of Nutrition, Mahidol University,
  Phutthamonthon 4 Road, Salaya, Nakhon Pathom 73170.
- **Commercial licence offered:** **yes, on request** ("may incur fees"). Price not published.
- **Letter:** O (Thai, full letter for the Nutrition Lens). Also ask about the portion-size databases INMU staff mention (NUTRITION §5, point 5).
- **Best alternative:** USDA FoodData Central (CC0) + owner-weighed portions. Trade-off: few Thai dishes.

### Item 10. Department of Health Thai Food Composition Table (added; letter not drafted elsewhere)

- **What and how used today: OFF** ("ASK PERMISSION … Not used meanwhile", NUTRITION §4.3, L-N2).
- **Blocker:** footer "Copyright 2020 Department of Health : Ministry of Public Health"; no licence stated
  [PRIMARY, https://nutrition2.anamai.moph.go.th/en/thaifcd/222012].
- **Rights holder:** สำนักโภชนาการ กรมอนามัย กระทรวงสาธารณสุข.
- **Contact:** the contact page of nutrition2.anamai.moph.go.th or the Department of Health saraban (สารบรรณ)
  [UNVERIFIED: no address read in this round].
- **Commercial licence offered:** unknown.
- **Letter:** P (Thai).
- **Best alternative:** USDA FDC (CC0); INMU if item 9 is granted.

### Items 11–16. Open virtual try-on models and their datasets

Common facts. **How used today: OFF.** No open try-on weights are shipped. `tryon.py` refuses known non-commercial
families unless `LENSIQ_TRYON_LICENSE=noncommercial-demo` (`LICENSES/THIRD_PARTY.md` F2; `docs/TRYON-DESIGN.md` §3.3).
The hosted design uses cloud providers behind the AI Gateway and stays off until the T8 evaluation. **Best alternative
for all six:** FASHN API `tryon-v1.6`: USD 0.075 per credit (about 2.5 THB), minimum 100 credits, "Commercial use
license" listed on the On-Demand plan [PRIMARY, fashn.ai/pricing, 2026-11-10]; Google Vertex `virtual-try-on-001`
about USD 0.06 [SECONDARY price]. Quality is not measured yet (TRYON §4, T8).

**Realistic outlook:** the model licences (11–13) could in principle be relicensed by their holders, but every one of
them was trained on VITON-HD and / or DressCode (15, 16), whose images the universities do not own outright. A "yes"
from a model holder would not clear the data. These letters are low priority; send them only if the owner wants
self-hosted try-on.

#### Item 11. IDM-VTON

- **Blocker:** "The codes and checkpoints in this repository are under the CC BY-NC-SA 4.0 license."
  [PRIMARY, github.com/yisol/IDM-VTON]. Trained on VITON-HD / DressCode.
- **Rights holder:** KAIST (Yisol Choi, Sangkyung Kwak, Kyungmin Lee, Jinwoo Shin) and OMNIOUS.AI (Hyungwon Choi)
  [SECONDARY: arXiv 2403.05139 title block via search].
- **Contact:** KAIST Office of University-Industry Cooperation (technology licensing), itvc.kaist.ac.kr, 193 Munji-ro,
  Yuseong-gu, Daejeon 34051, Korea [SECONDARY]; OMNIOUS.AI company contact page [UNVERIFIED].
- **Commercial licence offered:** none published. **Letter:** E (combined with item 15).

#### Item 12. OOTDiffusion

- **Blocker:** LICENSE file "Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International"
  [PRIMARY, github.com/levihsu/OOTDiffusion/blob/main/LICENSE]. Trained on VITON-HD, Dress Code.
- **Rights holder:** Xiao-i Research (Yuhao Xu, Tao Gu, Weifeng Chen, Chengcai Chen) [PRIMARY, README]; the company is
  Xiao-i Corporation, Shanghai [UNVERIFIED corporate link].
- **Contact:** Xiao-i Corporation business contact on its website [UNVERIFIED]; otherwise a public GitHub issue.
- **Commercial licence offered:** none published. **Letter:** F.

#### Item 13. CatVTON

- **Blocker:** "All the materials, including code, checkpoints, and demo, are made available under the Creative
  Commons BY-NC-SA 4.0 license." [PRIMARY, github.com/Zheng-Chong/CatVTON].
- **Rights holder:** affiliations on the paper: Sun Yat-sen University, Pixocial Technology, Pengcheng Laboratory, SIAT;
  corresponding author Xiaodan Liang [PRIMARY, arXiv 2407.15886 title block]. Which institution owns the weights:
  [UNVERIFIED].
- **Contact:** Sun Yat-sen University technology transfer office or Pixocial Technology business contact [UNVERIFIED];
  public GitHub issue as a fallback.
- **Commercial licence offered:** none published. **Letter:** G.

#### Item 14. Leffa

- **Blocker:** code and weights are MIT [PRIMARY, github.com/franciszzj/Leffa; HF tag], but the released try-on models
  are "trained on VITON-HD" and "trained on DressCode" [PRIMARY]. LENSIQ rejects permissive weights trained on
  non-commercial data (same rule as YuNet, FACE-BLUR §4).
- **Rights holder:** Meta AI (13 of 14 authors), with King's College London and Tongji University
  [PRIMARY, arXiv 2412.08486 title block]. The real blocker is the data holders (items 15, 16).
- **Contact:** public GitHub issue on franciszzj/Leffa. No licensing contact published.
- **Commercial licence offered:** not applicable. **Letter:** H (optional, short).

#### Item 15. VITON-HD dataset

- **Blocker:** "We collected a 1024×768 virtual try-on dataset for research purposes only." "All material is made
  available under Creative Commons BY-NC 4.0." [PRIMARY, github.com/shadow2496/VITON-HD].
- **Rights holder:** KAIST (Seunghwan Choi, Sunghyun Park, Minsoo Lee, Jaegul Choo) [PRIMARY]. The images were
  collected from the web [SECONDARY], so their photographers and the people shown also hold rights.
- **Contact:** KAIST Office of University-Industry Cooperation (as item 11). No dataset contact published.
- **Commercial licence offered:** **no**. **Letter:** E (combined with item 11).

#### Item 16. DressCode dataset

- **Blocker:** "The dataset will not be released to private companies." A signed release agreement and an institutional
  email are required [PRIMARY, github.com/aimagelab/dress-code]. Images come from "different catalogs of YOOX
  NET-A-PORTER" [PRIMARY].
- **Rights holder:** AImageLab, University of Modena and Reggio Emilia (UNIMORE) for the dataset; YOOX NET-A-PORTER for
  the images.
- **Contact:** the dataset-request contacts listed in the README (unimore.it addresses), or UNIMORE's technology
  transfer office [UNVERIFIED].
- **Commercial licence offered:** **no** (excluded by its terms). **Letter:** I. Expect a "no"; the letter only asks
  whether a commercial route exists through YOOX NET-A-PORTER.

### Item 17. BRIA RMBG-1.4 / 2.0 (background cut-out)

- **What and how used today: OFF**, rejected in TRYON §3.3 "(or buy a BRIA licence)". Not vendored (`git grep RMBG`
  finds nothing outside docs).
- **Blocker:** "Bria AI Model weights are open source for non commercial use only, per the provided license" (CC BY-NC
  4.0); "Commercial use is subject to a commercial agreement with BRIA." [PRIMARY, huggingface.co/briaai/RMBG-2.0].
  Training data: "over 15,000 … fully licensed images" [PRIMARY]: the data is clean, only the weights licence blocks.
- **Rights holder:** BRIA AI (company).
- **Contact:** "Talk to sales" at bria.ai/contact-us; self-hosted commercial licence form linked from the model card
  (share-eu1.hsforms.com/2sj9FVZTGSFmFRibDLhr_ZAf4e04) [PRIMARY].
- **Commercial licence offered: yes.** **Price:** API Background Removal **USD 0.018 per image** (USD 0.025 with a
  prompt), 100 free generations, Enterprise custom with "Commercial use rights for open-source models" and on-prem
  [PRIMARY, bria.ai/pricing, 2026-11-10]. Self-hosted RMBG licence: **no price published**
  (platform.bria.ai/licensing/pricing?model=rmbg-2.0 did not render a price).
- **Letter:** J (quote request, for browser on-device use of RMBG-1.4 / 2.0 weights).
- **Best alternative:** BRIA's own API (commercial licence included, but the image leaves the device: needs consent,
  PDPA cross-border note). On-device and already shipped: MODNet (portrait matting) and MediaPipe selfie segmenter;
  people only, no product / garment cut-out.

---

## 5. Items, priority 3: demo-only and Studio

### Item 3. face-api.js age/gender (UTKFace)

- **What and how used today: research demo only.** Off in customer mode, the default on every host since round 16:
  `lensiq-config.js` sets `LENSIQ_AGE_GENDER = false` unless the per-device "Research demo" toggle is on;
  `signage.js` loads `ageGenderNet` lazily (`netsFor`, line 27; line 607). Locked off by `LENSIQ_RESEARCH_DEMO = false`
  in a customer install. Flag F5 / A4 / L23.
- **Blocker:** UTKFace: "The UTKFace dataset is avaiable for non-commercial research purposes only." "The copyright
  belongs to the original owners." [PRIMARY, susanqq.github.io/UTKFace]. face-api.js README: trained on "UTK, FGNET,
  Chalearn, Wiki, IMDB*, CACD*, MegaAge, MegaAge-Asian" [PRIMARY]. IMDB-WIKI is for academic research only
  [UNVERIFIED quote].
- **Rights holder:** weights: Vincent Mühler (MIT). UTKFace: AICIP lab, University of Tennessee, Knoxville (Yang Song,
  Zhifei Zhang; page says "Please contact Yang Song or Zhifei Zhang for questions", no email). Image copyright: the
  original photo owners. Other sets: ETH Zurich (IMDB-WIKI) and others.
- **Contact:** UT Research Foundation (UTRF), Knoxville office, 400 W. Summit Hill Drive, UT Tower 961A, Knoxville,
  TN 37902, +1 865-974-1882, utrf.tennessee.edu contact page [SECONDARY]; the authors via the links on the UTKFace page.
- **Commercial licence offered:** **no.** UTK cannot license images it does not own, and seven other datasets are
  involved. **Letter:** C (to UTRF / AICIP) and A. Expect a "no".
- **Best alternative:** no commercial-safe on-device age/gender model is known. Keep it off in customer builds (done).
  If a customer needs it: a commercial vendor that warrants its training data (not researched).

### Item 4. face-api.js expression model

- **What and how used today: research demo only** (`LENSIQ_EXPRESSION`, `neuro.js` line 73, `booth.js` line 560,
  signage, photobooth). Never used in Exam, HR or Education (house rule).
- **Blocker:** "trained on a variety of images from publicly available datasets as well as images scraped from the
  web" [PRIMARY, face-api.js README]. No dataset list, no licence.
- **Rights holder:** Vincent Mühler (weights, MIT); data owners unknown.
- **Contact:** GitHub issue (as item 1). **Commercial licence offered:** none. **Letter:** A.
- **Best alternative:** MediaPipe Face Landmarker blendshapes (Apache-2.0): smile, mouth-open, eye-blink scores, which
  are muscle-movement signals, not emotion labels. Trade-off: no "mood" class; booth / neuro features need re-wording
  and re-calibration (scope change: ask first).

### Item 5. faceparse BiSeNet (CelebAMask-HQ)

- **What and how used today: OFF.** `vendor/models/faceparse-bisenet-r18-q8.onnx` is git-ignored, refused by
  `build-site.mjs`, and `LENSIQ_FACEPARSE=false`. Open: the test link `?faceparse=1` in `studio.js` (line 412) and
  `photobooth-hq.js` (line 180) is not yet under the customer-mode lock (THIRD_PARTY A4 update); the file is not on the
  public site. Flag F1.
- **Blocker:** "The CelebAMask-HQ dataset is available for non-commercial research purposes only." "You agree not to
  reproduce, duplicate, copy, sell, trade, resell or exploit for any commercial purposes, any portion of the images and
  any portion of derived data." "The use of this software is RESTRICTED to non-commercial research and educational
  purposes." [PRIMARY, github.com/switchablenorms/CelebAMask-HQ]. Code: MIT (yakhyo/face-parsing), which says the
  model "was trained on: CelebAMask-HQ" [PRIMARY].
- **Rights holder:** CUHK Multimedia Laboratory (CelebA team; the page names Ziwei Liu and Ping Luo for questions, no
  email). CelebAMask-HQ is built on CelebA-HQ (NVIDIA) and CelebA web images of celebrities, whose rights CUHK does not
  hold.
- **Contact:** CUHK Office of Research and Knowledge Transfer Services (ORKTS), IP and Technology Licensing team,
  enquiry page at orkts.cuhk.edu.hk [SECONDARY; address not confirmed].
- **Commercial licence offered:** **no.** **Letter:** D. Expect a "no".
- **Best alternative:** MediaPipe Selfie Multiclass 256 (Apache-2.0), already the default studio parser. Trade-off:
  six classes (hair, face skin, body skin, clothes, background, other), so no separate lips / eyebrows / eyes.

### Item 6. YOLOv9 "open-image-models" plate detector: **decided: not used (2026-11-10)**

- **Owner decision (2026-11-10):** not used at all, **not even for local demos or labelling aids**. No letter.
  Reasons given by the owner: the weights carry no licence, the training code descends from Ultralytics, and the
  training images were scraped without consent.
- **History:** never shipped. In round 16, `yolo-v9-t-384-license-plates-end2end.onnx` ran once, offline and outside the
  repo, only to draw candidate boxes for hand-labelling the real-photo set (`docs/GATE.md` §3c, lines 256–259). Under
  this decision that use stops too. The training notebook already forbids the weights and a test enforces it
  (`tools/train-plate-detector.ipynb`; `tests/unit/gate-train-notebook.test.js` line 49: "never fetches the GPL-derived
  YOLOv9 weights / code").
- **What the public pages show** [PRIMARY, github.com/ankandrew/open-image-models, 2026-11-10]: the repository is MIT;
  no licence and no training dataset are stated for the six `yolo-v9-*-license-plate-end2end` weights. The repo docs
  also record the YOLOv9 reference code as GPL-3.0 (`vendor/models/plate-ocr-th/README.txt` lines 21–22).
- **Rights holder:** ankandrew (GitHub). Not contacted, by decision.
- **Alternative:** the **Thai-trained YOLOX-nano** plate detector (Megvii YOLOX, Apache-2.0, trained on owner-licensed
  Thai plates with `tools/train-plate-detector.ipynb`), **in progress**. Meanwhile LPD-YuNet (Apache-2.0, shipped):
  its top box is the plate on 13/32 (41 %) of 51 public photos (CTO-BRIEF §2). Labels for new real-photo sets are drawn
  by hand or with LPD-YuNet proposals only.
- **Follow-up for the records** (not done here, docs scope): `docs/GATE.md` §3c and CTO-BRIEF §2 still describe the
  round-16 labelling use; add the decision there in the next round.

### Item 18. MODNet weights and training-data provenance

- **What and how used today: ON** (`vendor/models/modnet.onnx`, 25 MB; photobooth HQ, studio). Flag F7, audit A3:
  "The exact upstream commit of the converted weights is still unrecorded."
- **New finding (this round, resolves the provenance gap):**
  - `vendor/models/modnet.onnx` sha256 `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9`, 25,888,640
    bytes, **identical** to `onnx/model.onnx` in huggingface.co/Xenova/modnet (same LFS sha256 and size, checked
    2026-11-10 via the HF API).
  - Xenova/modnet was created 2024-02-05 and is tagged apache-2.0 [PRIMARY].
  - ZHKKKe/MODNet relicensed on 2022-01-28 (LICENSE created in commit `5f673d5`; README commits `954596a` / `194714c`).
    Before that the README said: "All resources in this repository (code, models, demos, etc.) are released under the
    Creative Commons Attribution NonCommercial ShareAlike 4.0 license. The license will be changed to allow commercial
    use after our paper is accepted." (README at `b258b36`, 2021-08-30). Now: "The code, models, and demos in this
    repository (excluding GIF files under the folder `doc/gif`) are released under the Apache License 2.0" [PRIMARY].
  - So the shipped file was published under Apache-2.0, two years after the relicence.
- **Remaining question:** the README does not name the training data ("trained on the datasets mentioned in our
  paper") and notes the online demo uses a different, unpublished model [PRIMARY]. Training data: [UNVERIFIED].
- **Rights holder:** Zhanghan Ke, Jiayu Sun, Kaican Li, Qiong Yan, Rynson W.H. Lau (City University of Hong Kong and
  SenseTime per the paper [SECONDARY]).
- **Contact:** the "For questions, please contact" address in the MODNet README [PRIMARY]; or a public GitHub issue.
- **Commercial licence offered:** already Apache-2.0, free.
- **Letter:** L (confirmation only).
- **Best alternative:** MediaPipe selfie segmenter (Apache-2.0, shipped); lower edge quality on hair.

---

## 6. Other licence-limited items found (no letter proposed)

| Item | Where | Why limited | Why no letter now | Alternative |
|---|---|---|---|---|
| Dense-crowd density models (CSRNet, DM-Count, P2PNet, CLTR, STEERER …) and datasets (NWPU-Crowd, JHU-Crowd++, ShanghaiTech, UCF-QNRF) | `docs/CROWD-DENSITY-MODELS.md` (Crowd, P1 product) | NWPU: "You may not use the dataset or any derivative work for commercial purposes"; JHU: "academic and non-commercial uses"; P2PNet licence academic-only | Explicit bans on derivatives; many holders. The owner decision there (options 1–4) comes first | Keep detector-only counting with the dense-crowd warning; or train our own (option 2) |
| OpenCV YuNet face detector | `docs/product-check/FACE-BLUR-RESULTS.md` §4 | Trained on WIDER FACE ("cc by-nc-nd") relabelled with insightface (non-commercial) | Not used; BlazeFace kept | BlazeFace (shipped) |
| SAM / SAM 2 | TRYON §3.3 | SA-1B research-only data | Not used | MagicTouch, MediaPipe |
| BiRefNet, IS-Net, U²-Net | TRYON §3.3 | Weights licence and data not stated | Not used; BRIA (item 17) is the cleaner paid route | MODNet, BRIA API |
| FASHN VTON v1.5 self-hosted / FASHN Human Parser | TRYON §3.3, L-T19 | Parser inherits NVIDIA SegFormer non-commercial licence; data undisclosed | Closed: not used | FASHN API |
| FitDiT, FLUX [dev] family, catvton-flux | TRYON §3.3 | Non-commercial; FitDiT says commercial via Tencent Cloud | Cloud API route already planned | FASHN, Vertex |
| PyMuPDF / pdf2docx | F3, F4 | AGPL / GPL; Artifex sells commercial licences (price not published) | Opt-in only; default converter is permissive | `pdfconvert.py` (MIT / BSD stack) |
| DTAM herbal datasets, national formulas, Thai Herbal Pharmacopoeia | DRUG-DATA-SOURCES S16–S19, L31, L34, L35 | "Open Data Common" undefined; CC BY-NC; copyright | Optional per DRUG-DATA-SOURCES §3 step 3; counsel first (L34) | Rebuild from Royal Gazette text (s.7(3)) |
| WHO Medical Product Alerts / INN / ATC | L14, S21 | CC BY-NC-SA 3.0 IGO; ATC no commercial copying | **Letter exists:** `docs/legal/WHO-PERMISSION-REQUEST.md` | Link out; RxNorm |
| UBU pharmacy collaboration (herbal data, labels) | L36 | No open licence | **Letter exists:** `docs/legal/UBU-PHARMACY-COLLAB-TH.md` | — |
| DrugBank | S22, L38 | Non-commercial unless a paid licence | Not used | RxNorm |
| MobileNetV2, COCO-SSD (ImageNet / COCO) | M2 | ImageNet terms research-only (backbone) | Counsel calls it low risk; no single holder to ask | — |

---

## 7. Draft letters

Fill-ins for every letter (fill in the **sent copy only**, never in this file):
`[email]`, `[phone]`, `[address]`, `[date]`, `[ชื่อ-นามสกุล]`, `[ที่อยู่]`, `[โทร]`, `[อีเมล]`, `[เลขที่หนังสือ]`.
Site: https://anirut77.github.io/lensiq/ .

### Letter A: face-api.js models (items 1, 2, 3, 4), English, as a public GitHub issue

**To:** github.com/justadudewhohacks/face-api.js (issue); copy as a Discussion on github.com/vladmandic/face-api
**Title:** Question: training data and licence of the pretrained face-api.js models (commercial use)

Hello Vincent, and thank you for face-api.js.

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand. Our web app uses your pretrained
models in the browser, on the user's device: the tiny face detector and 68-point landmarks (exam proctoring signals,
time clock), the recognition model (optional face time clock), and, in a research demo only, the expression and
age/gender models. Nothing is uploaded by default. We are not charging yet, but we plan to.

The weights are MIT, thank you. Our question is about the training data, which matters for commercial use:

1. Which datasets were used for the tiny face detector (~14K images) and the 68-point landmark model (~35K images)?
   Were any of them non-commercial or research-only?
2. Which "publicly available datasets" were used for the expression model?
3. For age/gender, the README lists UTK, FGNET, Chalearn, Wiki, IMDB, CACD, MegaAge and MegaAge-Asian. Is that the
   full list?
4. Do you hold, or could you grant, any permission for commercial use beyond the MIT licence on the weights?

Any answer, even "I don't know", helps us decide honestly. Thank you.

Anirut (Tum), LENSIQ, Thailand · [email]

### Letter B: dlib face recognition model (item 2), English

**To:** Davis E. King, via a public issue on github.com/davisking/dlib-models (or the dlib.net contact route)
**Subject:** dlib_face_recognition_resnet_model_v1: training data and commercial use

Dear Mr King,

Thank you for dlib and for releasing the face recognition model into the public domain.

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand. We use the face-api.js port of
`dlib_face_recognition_resnet_model_v1` in the browser, on the user's device, for an optional face time clock
(employees can use a PIN or QR badge instead). Face templates stay encrypted on the device; no images are stored or
uploaded by default. We are not charging yet.

Before we sell, our counsel asks about the training data of about 3 million faces:

1. Which datasets made it up (FaceScrub, VGG Face, web images, others)?
2. Do you know of any licence terms on those datasets that would restrict commercial use of the trained weights?
3. Is the CC0 release your full statement on the weights, or is there anything else we should know?

Thank you for your time.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [email] · [phone]

### Letter C: UTKFace (item 3), English

**To:** UT Research Foundation (UTRF), Knoxville office (utrf.tennessee.edu contact page; +1 865-974-1882), please
forward to the AICIP lab (UTKFace authors)
**Subject:** UTKFace: is a commercial licence available for a model trained on it?

Dear UTRF team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand. An open-source age and gender
estimation model we use (face-api.js, MIT) was trained partly on UTKFace, which is offered "for non-commercial research
purposes only". The model runs in the browser on the user's device for audience estimates on digital signage; no
images are uploaded or stored. We keep it switched off in customer builds and use it only in a labelled research demo.
We are not charging yet.

Could you tell us:

1. whether the University offers a commercial licence for UTKFace or for models trained on it, and on what terms or
   price; or
2. if not, whether you can give written permission for this specific use, or confirm that none is possible?

We understand the images belong to their original owners and that the answer may be no. Thank you.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [address] · [email] · [phone]

### Letter D: CelebAMask-HQ (item 5), English

**To:** CUHK Office of Research and Knowledge Transfer Services, IP and Technology Licensing (orkts.cuhk.edu.hk
enquiry page), please forward to the CelebA team, Multimedia Laboratory
**Subject:** CelebAMask-HQ: commercial use of a face-parsing model trained on it

Dear ORKTS team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand. A face-parsing model (BiSeNet,
MIT code) trained on CelebAMask-HQ would let our photo studio feature colour lips, brows and hair more precisely. It
would run in the browser on the user's device; nothing is uploaded by default. Today we keep it switched off because
CelebAMask-HQ is "available for non-commercial research purposes only". We are not charging yet.

Could you tell us whether CUHK offers (a) a commercial licence for models trained on CelebAMask-HQ, with terms or price,
or (b) written permission for this use? If the answer is no because the underlying images are not CUHK's to license,
a short confirmation would also help us.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [address] · [email]

### Letter E: IDM-VTON and VITON-HD (items 11, 15), English

**To:** KAIST Office of University-Industry Cooperation (technology licensing), itvc.kaist.ac.kr; please forward to the
IDM-VTON (Prof. Jinwoo Shin) and VITON-HD (Prof. Jaegul Choo) research groups. Copy: OMNIOUS.AI [contact UNVERIFIED].
**Subject:** Commercial licence enquiry: IDM-VTON model and VITON-HD dataset

Dear KAIST licensing team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand that is building a virtual try-on
feature for small clothing shops. The user's photo would be processed only with their consent, and no images would
be kept. We are not charging yet.

Two KAIST works would help us, but both are licensed for non-commercial use only:

- IDM-VTON code and checkpoints (CC BY-NC-SA 4.0);
- the VITON-HD dataset (CC BY-NC 4.0, "for research purposes only"), which IDM-VTON and most open try-on models are
  trained on.

Could you tell us (a) whether KAIST offers a commercial licence for either, with its terms or price, or (b) whether
written permission is possible for our use? If the dataset images cannot be licensed by KAIST, please say so; it helps
us choose another route.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [address] · [email] · [phone]

### Letter F: OOTDiffusion (item 12), English

**To:** Xiao-i Corporation, business / partnership contact [UNVERIFIED]; fallback: public issue on
github.com/levihsu/OOTDiffusion
**Subject:** OOTDiffusion: commercial licence enquiry

Dear Xiao-i Research team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand building a virtual try-on feature for
small clothing shops, with user consent and no image storage. We are not charging yet.

OOTDiffusion is released under CC BY-NC-SA 4.0. Could you tell us (a) whether Xiao-i offers a commercial licence for
the OOTDiffusion code and weights, with terms or price, or (b) whether written permission is possible? We also note the
model was trained on VITON-HD and Dress Code: does a commercial licence from you cover that, or would we need the
dataset holders' permission as well?

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [email]

### Letter G: CatVTON (item 13), English

**To:** Sun Yat-sen University technology transfer office, or Pixocial Technology business contact [both UNVERIFIED];
fallback: public issue on github.com/Zheng-Chong/CatVTON
**Subject:** CatVTON: commercial licence enquiry

Dear CatVTON team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand building a virtual try-on feature for
small clothing shops, with user consent and no image storage. We are not charging yet.

CatVTON's code, checkpoints and demo are released under CC BY-NC-SA 4.0. Could you tell us which organisation holds
the rights, and (a) whether a commercial licence is offered, with terms or price, or (b) whether written permission is
possible? Please also tell us whether the training data (VITON-HD / DressCode) would need separate permission.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [email]

### Letter H: Leffa (item 14), English, optional

**To:** public issue on github.com/franciszzj/Leffa
**Title:** Commercial use of the released Leffa try-on weights given VITON-HD / DressCode terms

Hello, and thank you for releasing Leffa under MIT. We are a small Thai business (LENSIQ,
https://anirut77.github.io/lensiq/) considering on-device or self-hosted try-on, not charging yet. The released try-on
weights are trained on VITON-HD (CC BY-NC 4.0) and DressCode (not released to companies). Does Meta consider the MIT
licence on these weights sufficient for commercial use, or do the dataset terms apply? Is a version trained on
commercially licensed data planned? Thank you. Anirut (Tum), LENSIQ, Thailand.

### Letter I: DressCode (item 16), English

**To:** AImageLab, University of Modena and Reggio Emilia, using the dataset contacts in the dress-code README
(or UNIMORE's technology transfer office [UNVERIFIED])
**Subject:** Dress Code dataset: is any commercial route available?

Dear AImageLab team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand building a virtual try-on feature for
small clothing shops, with user consent and no image storage. We are not charging yet.

We understand the Dress Code dataset "will not be released to private companies", and we have not requested or
downloaded it. Several open try-on models we would like to use were trained on it. Could you tell us whether any
commercial route exists for models trained on Dress Code (for example a licence through the University or YOOX
NET-A-PORTER), or confirm that none does?

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [email]

### Letter J: BRIA RMBG (item 17), English

**To:** BRIA sales, bria.ai/contact-us ("Talk to sales"), or the self-hosted licence form linked from the RMBG-2.0
model card
**Subject:** Quote request: RMBG-1.4 / 2.0 commercial licence for in-browser, on-device use (small business, Thailand)

Dear BRIA team,

I run LENSIQ (https://anirut77.github.io/lensiq/), a small business in Thailand. We would like to run RMBG-1.4 or 2.0
in the user's browser (ONNX Runtime Web, on-device), for product and garment cut-outs in a photo studio and a
virtual try-on feature for small shops. No images are uploaded by default. We are not charging yet; we expect low
volumes at first (about [N] images per month).

Could you send us:

1. the terms and price of a commercial licence for self-hosted, in-browser use (the weights file is delivered to the
   user's browser; is that allowed, and under what protection?);
2. whether a start-up or small-business tier exists;
3. for comparison, confirmation that the API price (USD 0.018 per image) includes commercial use of the output, and
   where API images are processed and for how long they are kept.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [address] · [email] · [phone]

### Letter K: not needed

Removed: the owner decided on 2026-11-10 not to use the open-image-models YOLOv9 weights at all (item 6).

### Letter L: MODNet (item 18), English

**To:** the "For questions" address in the ZHKKKe/MODNet README (or a public GitHub issue)
**Subject:** MODNet: confirming Apache-2.0 for the released portrait-matting weights, and their training data

Dear Dr Ke,

Thank you for MODNet and for relicensing it under Apache-2.0. I run LENSIQ (https://anirut77.github.io/lensiq/), a
small business in Thailand. Our photo booth and studio run MODNet in the browser, on the user's device, via the ONNX
conversion on Hugging Face (Xenova/modnet, `onnx/model.onnx`); nothing is uploaded. We are not charging yet.

To keep our licence record complete, could you please confirm:

1. that the released `modnet_photographic_portrait_matting` weights are covered by the Apache-2.0 licence stated in the
   README since January 2022; and
2. which datasets they were trained on, and whether any of them restrict commercial use?

We credit MODNet and keep the Apache-2.0 notice with the file. Thank you.

Kind regards,
Anirut (Tum), LENSIQ, Thailand · [email]

### Letter M: สมสท. เรื่อง TMT / TTMT (item 7), Thai, ฉบับใหม่

<div align="right">

[ชื่อ-นามสกุล] (ตั้ม)<br>
LENSIQ<br>
[ที่อยู่]<br>
โทร [โทร] · อีเมล [อีเมล]

</div>

ที่ [เลขที่หนังสือ] · [วันที่] พฤศจิกายน 2569

**เรื่อง** ขออนุญาตใช้ข้อมูลรหัสยามาตรฐานไทย (TMT) และ TTMT ในแอปพลิเคชันเพื่อการคุ้มครองผู้บริโภค

**เรียน** ผู้อำนวยการสำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย (สมสท.)

ด้วยข้าพเจ้าเป็นผู้พัฒนาแอปพลิเคชัน LENSIQ (https://anirut77.github.io/lensiq/) ธุรกิจขนาดเล็กในประเทศไทย กำลังพัฒนาฟีเจอร์
"Product Check" ช่วยผู้บริโภคอ่านฉลากยาด้วยกล้องโทรศัพท์ แล้วแสดงชื่อตัวยาสำคัญ ความแรง และรูปแบบยา เพื่อให้ผู้ใช้สอบถามเภสัชกรต่อ
การประมวลผลภาพทำบนเครื่องของผู้ใช้ ไม่ส่งรูปภาพออกโดยค่าเริ่มต้น ระบบไม่วินิจฉัยและไม่ระบุว่ายาเป็นของแท้หรือปลอม
ขณะนี้ยังไม่มีการเรียกเก็บค่าบริการ แต่มีแผนให้บริการเชิงพาณิชย์ในอนาคต

ปัจจุบันข้าพเจ้าใช้เฉพาะ TMT ฉบับ 17 กุมภาพันธ์ 2563 ที่ สมสท. เผยแพร่บน data.go.th ภายใต้สัญญาอนุญาต Creative Commons
Attribution โดยอ้างอิงแหล่งที่มาทุกครั้ง แต่ข้อมูลฉบับนี้ไม่มียาที่ขึ้นทะเบียนหลังปี 2563 ส่วนไฟล์ฉบับปัจจุบันบนเว็บไซต์ this.or.th
ไม่ได้ระบุเงื่อนไขการอนุญาตใช้งาน ข้าพเจ้าจึงขอเรียนสอบถามและขออนุญาตดังนี้

1. ขออนุญาตใช้ไฟล์ TMT ฉบับปัจจุบัน (และ TTMT ถ้าเป็นไปได้) เพื่อสร้างตารางค้นหาภายในแอป "ชื่อการค้า → ตัวยาสำคัญ ความแรง
   รูปแบบยา" โดยแสดงผลทีละรายการตามที่ผู้ใช้ค้นหา ไม่เปิดให้ดาวน์โหลดทั้งชุด ไม่ขายหรือส่งต่อข้อมูลให้บุคคลอื่น
2. หาก สมสท. มีบริการหรือสัญญาอนุญาตเชิงพาณิชย์ ขอทราบเงื่อนไขและอัตราค่าบริการ
3. ขอทราบข้อความอ้างอิงแหล่งที่มาที่ สมสท. ต้องการให้แสดง และรอบการปรับปรุงข้อมูลที่ควรใช้

ข้าพเจ้ายินดีส่งภาพตัวอย่างหน้าจอ (ไม่มีภาพบุคคล) และรายละเอียดเพิ่มเติมตามที่ สมสท. ต้องการ

จึงเรียนมาเพื่อโปรดพิจารณา

ขอแสดงความนับถือ

[ชื่อ-นามสกุล] (ตั้ม)<br>
ผู้พัฒนา LENSIQ

### Letter N: อย. หนังสือติดตาม (item 8), Thai, ใช้หลังส่งฉบับแรกแล้วเท่านั้น

> ส่งเมื่อผ่านไปประมาณ 30 วันหลังส่ง `docs/legal/FDA-PERMISSION-REQUEST-TH.md` แล้วยังไม่ได้รับคำตอบ ถ้า อย. ตอบมาแล้ว
> ให้ใส่เลขที่หนังสือของ อย. ใน "อ้างถึง" และปรับย่อหน้าที่สองให้ตอบตามที่ อย. ถาม

ที่ [เลขที่หนังสือ] · [วันที่]

**เรื่อง** ติดตามการขออนุญาตใช้ข้อมูลจากบริการเว็บเซอร์วิสสืบค้นข้อมูลผลิตภัณฑ์ (WS_LICENSE_SEARCH)

**เรียน** เลขาธิการคณะกรรมการอาหารและยา

**อ้างถึง** หนังสือของข้าพเจ้า ที่ [เลขที่หนังสือฉบับแรก] ลงวันที่ [วันที่ฉบับแรก] (และหนังสือของสำนักงานฯ ที่ [ถ้ามี])

ตามหนังสือที่อ้างถึง ข้าพเจ้าได้ขออนุญาตใช้ข้อมูลจากบริการเว็บเซอร์วิส WS_LICENSE_SEARCH ในแอปพลิเคชัน LENSIQ
เพื่อช่วยผู้บริโภคตรวจสอบเลขทะเบียนผลิตภัณฑ์เบื้องต้น โดยเรียกข้อมูลทีละรายการเมื่อผู้ใช้สั่งตรวจสอบ แสดงที่มาของข้อมูลทุกครั้ง
และแนะนำให้ผู้ใช้ตรวจสอบต่อกับสำนักงานฯ หรือเภสัชกร นั้น

ข้าพเจ้าขอเรียนสอบถามความคืบหน้าในการพิจารณา และหากสำนักงานฯ ต้องการข้อมูลเพิ่มเติม เช่น ปริมาณการเรียกใช้งาน
วิธีเก็บแคช หรือภาพหน้าจอ ข้าพเจ้ายินดีจัดส่งหรือเข้าชี้แจงตามที่สำนักงานฯ เห็นสมควร หากเรื่องนี้อยู่ในความรับผิดชอบของหน่วยงานอื่น
ภายในสำนักงานฯ ขอความกรุณาแจ้งชื่อหน่วยงานหรือช่องทางที่ถูกต้อง ระหว่างรอผลการพิจารณา ข้าพเจ้าจะยังไม่ใช้ข้อมูลดังกล่าวในบริการที่เรียกเก็บค่าบริการ

จึงเรียนมาเพื่อโปรดพิจารณา

ขอแสดงความนับถือ

[ชื่อ-นามสกุล] (ตั้ม)<br>
ผู้พัฒนา LENSIQ · โทร [โทร] · อีเมล [อีเมล]

### Letter O: INMU (item 9), Thai, หนังสือฉบับเต็ม

**ส่งถึง:** สถาบันโภชนาการ มหาวิทยาลัยมหิดล สำนักงาน ASEANFOODS Regional Centre ทางอีเมลที่หน้า Thai FCD ระบุไว้สำหรับการขออนุญาต
(ที่อยู่อีเมลตามที่ประกาศในหน้า https://inmu.mahidol.ac.th/thaifcd/content/term-and-condition) หรือทางไปรษณีย์ถึงสถาบันโภชนาการ มหาวิทยาลัยมหิดล
ถนนพุทธมณฑลสาย 4 ตำบลศาลายา อำเภอพุทธมณฑล จังหวัดนครปฐม 73170 · โทร 02-800-2380 ต่อ 324 หรือ 423

<div align="right">

[ชื่อ-นามสกุล] (ตั้ม)<br>
LENSIQ<br>
[ที่อยู่]<br>
โทร [โทร] · อีเมล [อีเมล]

</div>

ที่ [เลขที่หนังสือ]

<div align="right">

[วันที่] พฤศจิกายน 2569

</div>

**เรื่อง** ขออนุญาตใช้ข้อมูลจากฐานข้อมูลองค์ประกอบอาหารไทย (Thai Food Composition Database) เพื่อการใช้เชิงพาณิชย์
และขอทราบเงื่อนไขและอัตราค่าธรรมเนียม

**เรียน** ผู้อำนวยการสถาบันโภชนาการ มหาวิทยาลัยมหิดล

**สิ่งที่ส่งมาด้วย** ภาพตัวอย่างหน้าจอการแสดงผลพร้อมข้อความอ้างอิงแหล่งข้อมูล (ไม่มีภาพบุคคล) จำนวน 1 ชุด

ด้วยข้าพเจ้า [ชื่อ-นามสกุล] เป็นผู้พัฒนาแอปพลิเคชัน LENSIQ (https://anirut77.github.io/lensiq/) ซึ่งเป็นธุรกิจขนาดเล็กในประเทศไทย
กำลังพัฒนาฟีเจอร์ "Nutrition Lens" ช่วยให้ผู้ใช้ประมาณพลังงานและสารอาหารหลักของอาหารไทยหนึ่งจาน เช่น พลังงาน โปรตีน ไขมัน
น้ำตาล และโซเดียม โดยผู้ใช้เลือกชื่ออาหารและขนาดที่รับประทาน ระบบจะแสดงผลเป็นช่วงค่า พร้อมระบุแหล่งที่มาของข้อมูลทุกครั้ง
ฟีเจอร์นี้มีหลักการดังนี้

1. **ประมวลผลบนเครื่องของผู้ใช้เท่าที่ทำได้** ไม่ส่งรูปภาพหรือข้อมูลส่วนบุคคลออกจากเครื่องโดยค่าเริ่มต้น
2. **ไม่ให้คำแนะนำทางการแพทย์** ไม่ให้คะแนนหรือตัดสินว่าอาหารดีหรือไม่ดี และแนะนำให้ผู้ที่มีภาวะสุขภาพปรึกษาแพทย์หรือนักกำหนดอาหาร
3. **ยังไม่มีการเรียกเก็บค่าบริการ** แต่มีแผนให้บริการเชิงพาณิชย์ในอนาคต

ข้าพเจ้าทราบจากหน้าเว็บ Thai FCD ว่าผู้ใช้ที่ไม่ใช่เชิงพาณิชย์ใช้ข้อมูลได้โดยไม่เสียค่าใช้จ่าย และการทำซ้ำเพื่อจำหน่ายหรือ
เพื่อวัตถุประสงค์เชิงพาณิชย์ "อาจมีค่าธรรมเนียม" ข้าพเจ้าจึงยังไม่ได้นำค่าใดจากฐานข้อมูลไปแสดงในแอปพลิเคชัน และขออนุญาต
เป็นลายลักษณ์อักษร ภายใต้เงื่อนไขที่ข้าพเจ้าจะปฏิบัติ ดังนี้

1. **ข้อมูลที่ขอใช้** ค่าองค์ประกอบสารอาหารต่อ 100 กรัมส่วนที่กินได้ จาก Thai FCD Version 3 (สิงหาคม 2568) โดยเฉพาะ
   กลุ่ม T อาหารผสม (อาหารไทยปรุงสำเร็จ) รวมถึงรหัสอาหารเพื่ออ้างอิง และหากเป็นไปได้ ข้อมูลจาก ASEAN Food Composition
   Database
2. **วิธีแสดงผล** แสดงทีละจานตามที่ผู้ใช้เลือก พร้อมข้อความอ้างอิง เช่น "ข้อมูลองค์ประกอบอาหาร: ฐานข้อมูลองค์ประกอบอาหารไทย
   สถาบันโภชนาการ มหาวิทยาลัยมหิดล (INMU) Version 3 (2568) ใช้โดยได้รับอนุญาต" หรือข้อความที่สถาบันฯ กำหนด
3. **ไม่เผยแพร่ทั้งฐานข้อมูล** ไม่เปิดให้ดาวน์โหลดทั้งชุด ไม่ขาย ไม่ให้เช่า และไม่ส่งต่อข้อมูลให้บุคคลภายนอก ค่าที่ใช้จะเก็บใน
   ตารางของแอปพร้อมระบุฉบับและวันที่ของข้อมูล และปรับปรุงตามฉบับใหม่ของสถาบันฯ
4. **ไม่แก้ไขค่าโดยไม่ระบุ** หากมีการคำนวณใหม่ตามขนาดที่รับประทาน จะแสดงให้ผู้ใช้เห็นว่าเป็นค่าที่คำนวณจากข้อมูลของสถาบันฯ
5. **ไม่ใช้ชื่อหรือตราสัญลักษณ์ของสถาบันฯ หรือมหาวิทยาลัย** ในลักษณะที่ทำให้เข้าใจว่าสถาบันฯ รับรองแอปพลิเคชัน

ข้าพเจ้าจึงขอเรียนสอบถามดังนี้

1. สถาบันฯ อนุญาตให้ใช้ข้อมูลตามข้างต้นได้หรือไม่ และมีเงื่อนไข สัญญา หรือแบบฟอร์มที่ต้องยื่นอย่างไร
2. อัตราค่าธรรมเนียมสำหรับการใช้เชิงพาณิชย์ (เช่น รายปี หรือตามจำนวนรายการอาหาร) และมีอัตราสำหรับธุรกิจขนาดเล็กหรือช่วงทดลองหรือไม่
3. การใช้ค่าจากฐานข้อมูลเพื่อเป็นค่าอ้างอิงในการทดสอบความแม่นยำภายในเท่านั้น โดยไม่แสดงต่อผู้ใช้ ถือเป็นการใช้ที่ไม่ใช่
   เชิงพาณิชย์หรือไม่
4. หากสถาบันฯ มีข้อมูลน้ำหนักต่อหนึ่งหน่วยบริโภคของอาหารไทย (portion size) ที่เปิดให้ใช้ได้ ขอทราบเงื่อนไขด้วย
5. ข้อความอ้างอิงแหล่งที่มาที่สถาบันฯ ต้องการให้แสดง

ข้าพเจ้ายินดีส่งรายละเอียดเพิ่มเติม หรือเข้าพบเพื่อชี้แจงตามที่สถาบันฯ สะดวก และขอขอบพระคุณที่สถาบันฯ เผยแพร่ฐานข้อมูลอันเป็นประโยชน์นี้

จึงเรียนมาเพื่อโปรดพิจารณา

ขอแสดงความนับถือ

<br>

[ชื่อ-นามสกุล] (ตั้ม)<br>
ผู้พัฒนา LENSIQ, ประเทศไทย

### Letter P: กรมอนามัย ตารางคุณค่าทางโภชนาการของอาหารไทย (item 10), Thai

ที่ [เลขที่หนังสือ] · [วันที่]

**เรื่อง** ขออนุญาตใช้ข้อมูลตารางแสดงคุณค่าทางโภชนาการของอาหารไทย (ฉบับปรับปรุง 2561) ในแอปพลิเคชัน

**เรียน** อธิบดีกรมอนามัย (ผ่าน ผู้อำนวยการสำนักโภชนาการ)

ด้วยข้าพเจ้าเป็นผู้พัฒนาแอปพลิเคชัน LENSIQ (https://anirut77.github.io/lensiq/) ธุรกิจขนาดเล็กในประเทศไทย กำลังออกแบบฟีเจอร์
ช่วยผู้ใช้ประมาณพลังงานและสารอาหารของอาหารไทย แสดงเป็นช่วงค่าพร้อมแหล่งที่มา ไม่ให้คำแนะนำทางการแพทย์ การประมวลผลภาพทำบนเครื่อง
ของผู้ใช้ ไม่ส่งรูปภาพออกโดยค่าเริ่มต้น ขณะนี้ยังไม่มีการเรียกเก็บค่าบริการ แต่มีแผนให้บริการเชิงพาณิชย์ในอนาคต

ข้าพเจ้าพบว่าตารางแสดงคุณค่าทางโภชนาการของอาหารไทยบนเว็บไซต์ของสำนักโภชนาการมีข้อความสงวนลิขสิทธิ์ แต่ไม่ได้ระบุเงื่อนไข
การนำไปใช้ จึงขออนุญาตใช้ค่าสารอาหารจากตารางดังกล่าว แสดงทีละรายการพร้อมอ้างอิงกรมอนามัย ไม่เปิดให้ดาวน์โหลดทั้งตาราง และไม่ขาย
หรือส่งต่อข้อมูล หากมีเงื่อนไขหรือค่าธรรมเนียม ขอความกรุณาแจ้งให้ทราบ พร้อมข้อความอ้างอิงที่กรมอนามัยต้องการ

จึงเรียนมาเพื่อโปรดพิจารณา

ขอแสดงความนับถือ

[ชื่อ-นามสกุล] (ตั้ม)<br>
ผู้พัฒนา LENSIQ · [ที่อยู่] · โทร [โทร] · อีเมล [อีเมล]

---

## 8. Sending checklist for the owner

1. **Counsel first.** Ask counsel to read the letters before sending, at least the Thai official letters (M, N, P) and
   any letter that describes biometric use (A, B, C).
2. **Fill in the sent copy only.** Never write your name, address, phone or email into this file or anything in git.
3. **Confirm each contact on the day.** Every [UNVERIFIED] contact must be checked on the holder's own site. Use
   official forms or published addresses only.
4. **Use the right channel.** GitHub letters (A, H, L if no email) go as public issues: re-read them for anything
   you would not want public. Thai government letters (M, N, P) go on letterhead by registered mail with return
   receipt, or through the agency's e-saraban; call the saraban first to confirm the unit.
5. **Send in this order:**
   1. **A** face-api.js (Exam, Attendance)
   2. **B** dlib (Attendance)
   3. **M** THIS / TMT, together with the existing FDA letter `docs/legal/FDA-PERMISSION-REQUEST-TH.md` (Product Check)
   4. **O** INMU and **P** Department of Health (Nutrition)
   5. **J** BRIA quote (Try-On / Studio cut-out)
   6. **L** MODNet confirmation
   7. **E, F, G, H, I** try-on models and datasets, only if the owner wants self-hosted try-on
   8. **C, D**: expected "no"; send when convenient
   9. **N** FDA follow-up, about 30 days after the first FDA letter
6. **Do not switch anything on** because of a friendly reply. Only a written licence or permission, read by counsel,
   changes a flag. Customer builds stay as they are.
7. **Keep the evidence.** Save each reply (PDF or email export) with the release record and the credits
   (`docs/CREDITS-MEDIA.md`), outside the repo if it contains personal data.
8. **Update the records** when an answer arrives: section 9 below, `LICENSES/THIRD_PARTY.md` (flag status),
   `docs/CTO-BRIEF.md` §8 (L13, L23, L29, L-N1–L-N3, L-T rows), and `nut_sources` verdicts for INMU / DoH.
9. **Follow up once** after about 30 days without a reply; then record "no reply" and use the alternative.

## 9. Sending log (fill in; no personal data)

| Letter | Item(s) | Sent on | Channel | Reply on | Outcome | Evidence kept at |
|---|---|---|---|---|---|---|
| A | 1, 2, 3, 4 | | GitHub issue | | | |
| B | 2 | | | | | |
| C | 3 | | | | | |
| D | 5 | | | | | |
| E | 11, 15 | | | | | |
| F | 12 | | | | | |
| G | 13 | | | | | |
| H | 14 | | GitHub issue | | | |
| I | 16 | | | | | |
| J | 17 | | | | | |
| K | 6 | not sent: decided not used (2026-11-10) | — | — | — | — |
| L | 18 | | | | | |
| M | 7 | | | | | |
| FDA (existing) | 8 | | | | | |
| N | 8 | | | | | |
| O | 9 | | | | | |
| P | 10 | | | | | |

# Pet face reading: detector and data sources (licence check)

Checked 2026-11-16 with `gh api` (repo + licence endpoints), the dataset home pages and the Wikimedia Commons API / file
pages. Nothing was downloaded except five Commons thumbnails, opened once in a scratch folder (outside the repo) to check
that no person is visible. Rules applied: no AGPL / GPL / non-commercial models, code or data in the product; no
Ultralytics.

**Decision:** reuse the shipped YOLOX-Nano (COCO classes person=0, cat=15, dog=16). No new model file and no new
licence. Pet traits come from the owner plus a fur-colour estimate from the crop. Every dedicated cat/dog face or
landmark model we found is non-commercial, unlicensed or GPL, so none can ship.

## 1. Detector options

| Name | URL | Code licence | Weights licence | Training data (licence) | Size | Web runtime | Verdict |
|---|---|---|---|---|---|---|---|
| YOLOX-Nano 416 (already shipped) | github.com/Megvii-BaseDetection/YOLOX | Apache-2.0 | Apache-2.0 (official ONNX release 0.1.1rc0) | COCO 2017 (see §2) | 3.7 MB | onnxruntime-web WASM (already vendored) | **OK-ATTR**. Already listed in LICENSES/THIRD_PARTY.md. Cat/dog/person classes, body box only, no face box. |
| TF.js COCO-SSD (already shipped) | github.com/tensorflow/tfjs-models (coco-ssd) | Apache-2.0 | Apache-2.0 | COCO | 18 MB | TF.js (already vendored) | **OK-ATTR**. Fallback when ONNX Runtime is unavailable; same classes. |
| MediaPipe Object Detector EfficientDet-Lite0 (320 px) / Lite2 (448 px) | developers.google.com/edge/mediapipe/solutions/vision/object_detector | Apache-2.0 (google-ai-edge/mediapipe) | The Google page states no licence for the weights and links no model card. Apache-2.0 appears only in third-party wrappers. | COCO, 80 classes (Google page) | about 4–7 MB int8 (not stated on the page) | `@mediapipe/tasks-vision` | **Not needed / UNCLEAR if adopted.** Adds nothing over YOLOX for cat/dog. Find a first-party licence statement before any use. |
| CatFLW / DogFLW landmark datasets | github.com/martvelge/CatFLW, /DogFLW | n/a (gh: NOASSERTION) | n/a | 2079 cat / 4335 dog faces, **CC BY-NC 4.0** (README) | – | – | **NO**: non-commercial. |
| hugocornellier cat/dog-face-landmarks (Flutter `cat_detection` / `dog_detection`) | github.com/hugocornellier/cat-face-landmarks-training, /dog-face-landmarks-training | Apache-2.0 (training code) | **CC BY-NC 4.0** (HF / Kaggle, per README) | CatFLW / DogFLW (CC BY-NC 4.0) | TFLite | TFLite | **NO**: weights and data are non-commercial. |
| zylamarek/frederic (cat face box + 9 landmarks) | github.com/zylamarek/frederic | MIT | MIT repo; weights downloaded from releases | zylamarek/cat-dataset (MIT scripts) built on the Zhang, Sun & Tang 2008 "Cat Head" dataset (Microsoft Research; no licence stated) | Keras | none (Keras; needs conversion) | **NO**: base dataset has no licence, research origin. |
| harthur/kittydar (cat head, JS) | github.com/harthur/kittydar | MIT | MIT JSON net in the repo | same Microsoft "Cat Head" 2008 data (no licence) | small | plain JS (HOG + NN) | **NO**: same data issue; also weak (frontal, upright only, 2012). |
| marando/pycatfd (dlib cat face + landmarks) | github.com/marando/pycatfd | **none** | none | training_data.tar.gz in repo, source unstated | – | Python / dlib | **NO**: no licence = all rights reserved. |
| kairess/dog_face_detector, from tureckova/Doggie-smile (dlib dog head + 6 points) | github.com/kairess/dog_face_detector | **none** (both repos) | none | Columbia dogs-with-parts (research) | – | Python / dlib | **NO**: no licence. |
| kwjinwoo/Dog_face_landmark_detection | github.com/kwjinwoo/Dog_face_landmark_detection | MIT | no weights published | Columbia Dogs (CU) dataset, research only | – | Keras | **NO**: research-only data. |
| GuillaumeMougeot/DogFaceNet (dog re-identification) | github.com/GuillaumeMougeot/DogFaceNet | MIT | MIT | dog photos scraped from the web, dataset on Zenodo; rights of the photos unclear | – | TF 1.12 | **NO**: identifies individual dogs (out of scope); web-scraped data. |
| Amrithesh-Kakkoth/yolov5-petface | github.com/Amrithesh-Kakkoth/yolov5-petface | **GPL-3.0** | – | – | – | – | **NO**: GPL, YOLOv5 / Ultralytics. |
| Any Ultralytics YOLOv5/v8/11 pet detector (e.g. SuzalShrestha/cam-watch, mupf-dev/vision-guard) | – | **AGPL-3.0** | AGPL-3.0 | – | – | – | **NO**: Ultralytics / AGPL. |
| Stanford Dogs, Tsinghua Dogs, Kaggle "Cat dataset" | – | – | – | research / non-commercial or unstated terms | – | – | **NO** for training. Not needed. |

## 2. COCO (the training data of YOLOX-Nano and COCO-SSD)

Terms of Use: https://cocodataset.org/#termsofuse (source: `cocodataset/cocodataset.github.io/dataset/termsofuse.htm`):

- Annotations and website: "belong to the COCO Consortium and are licensed under a Creative Commons Attribution 4.0
  License."
- Images: "The COCO Consortium does not own the copyright of the images. Use of the images must abide by the Flickr
  Terms of Use. The users of the images accept full responsibility for the use of the dataset …"
- We ship trained weights only, never COCO images. This is the position already recorded for YOLOX and COCO-SSD in
  LICENSES/THIRD_PARTY.md. The CC BY 4.0 attribution is already in LICENSES/THIRD-PARTY-NOTICES.txt.

## 3. Oxford-IIIT Pet dataset (evaluation only)

Home page: https://www.robots.ox.ac.uk/~vgg/data/pets/

- Licence wording on the page: "The dataset is available to download for commercial/research purposes under a
  Creative Commons Attribution-ShareAlike 4.0 International License. The copyright remains with the original owners of
  the images."
- Evaluation-only use is fine: download to `~/LENSIQ-field/evals/<phase>/`, never commit it, never publish images, and
  record the sha256 lock (`evals-locks/`). CC BY-SA 4.0 even allows commercial use. ShareAlike applies only to adapted
  material that we distribute, and we distribute none. Image copyright stays with the Flickr owners, which is another
  reason never to publish the images.
- Credit and citation (put them in any results document): O. M. Parkhi, A. Vedaldi, A. Zisserman, C. V. Jawahar,
  "Cats and Dogs", IEEE Conference on Computer Vision and Pattern Recognition (CVPR), 2012. Dataset licensed
  CC BY-SA 4.0.
- Downloads (from the page; the page recommends the Academic Torrents mirror):
  - https://thor.robots.ox.ac.uk/~vgg/data/pets/images.tar.gz
  - https://thor.robots.ox.ac.uk/~vgg/data/pets/annotations.tar.gz
- Annotations per the page: species and breed, a "tight bounding box (ROI) around the head of the animal", and a
  pixel trimap. The head box is in `annotations/xmls/*.xml` (Pascal VOC `<bndbox>`, object name cat/dog) for the
  **trainval split only**. TFDS reports 3,680 train with head boxes and 3,669 test without. Check the exact xml count
  after download and lock it. The test split has no head boxes.

## 4. Sample images for local review screenshots (never committed, never published)

Every file page states the CC0 1.0 Universal Public Domain Dedication (checked on the file page). Thumbnails were
opened and show no person.

| Use | File page | Direct 1280 px thumbnail | Author / source | Notes |
|---|---|---|---|---|
| Cat, tabby (Bengal-type), face clear | https://commons.wikimedia.org/wiki/File:Wide-eyed_tiger_cat_(Unsplash).jpg | https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Wide-eyed_tiger_cat_%28Unsplash%29.jpg/1280px-Wide-eyed_tiger_cat_%28Unsplash%29.jpg | Caleb Woods (Unsplash, 30 Apr 2017) | CC0. Commons flags it "Images from Unsplash (review needed)". Unsplash used CC0 until June 2017. |
| Cat, black, face clear | https://commons.wikimedia.org/wiki/File:Black_cat_over_the_fence_2025-06-22.jpg | https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Black_cat_over_the_fence_2025-06-22.jpg/1280px-Black_cat_over_the_fence_2025-06-22.jpg | Andy Li (Onthewings), own work, 22 Jun 2025 | CC0. Portrait; cat is small in frame, behind railings. |
| Dog, face fills frame | https://commons.wikimedia.org/wiki/File:Australian_Shepherd_in_snow.jpg | https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Australian_Shepherd_in_snow.jpg/1280px-Australian_Shepherd_in_snow.jpg | "PxHere" (photographer not named), pxhere.com/es/photo/1085379 | CC0. No licence review recorded on Commons. |
| Dog, full body, looking at camera | https://commons.wikimedia.org/wiki/File:Karjalankarhukoira,_Karelian_Bear_Dog_looking_at_camera.jpg | https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Karjalankarhukoira%2C_Karelian_Bear_Dog_looking_at_camera.jpg/1280px-Karjalankarhukoira%2C_Karelian_Bear_Dog_looking_at_camera.jpg | Uusijani, own work | CC0. A leash enters the frame but no person is visible. |

Rejected: "Black cat on bamboo mat.jpg" (a human hand is in frame), "Black Cat in Koskinou, Greece.jpg" (cat too small),
"Black cat - 20260928 105428.jpg" (face turned away), "Black tabby domestic short-haired cat.jpg" (person's legs).
Thumbnail widths other than the standard steps (e.g. 800 or 1024) returned HTTP 400 on these files; use 1280.

## 5. Provenance of the GitHub projects checked

| Repo | Licence (gh api) | Last push | Training data | Verdict |
|---|---|---|---|---|
| Megvii-BaseDetection/YOLOX | Apache-2.0 | 2025-06-08 | COCO 2017 | OK-ATTR (shipped) |
| tensorflow/tfjs-models | Apache-2.0 | 2026-06-23 | COCO | OK-ATTR (shipped) |
| google-ai-edge/mediapipe | Apache-2.0 | 2026-11-14 | COCO (EfficientDet-Lite) | code OK; weights licence not stated by Google (not used) |
| martvelge/CatFLW | NOASSERTION (README: CC BY-NC 4.0) | 2025-06-27 | own annotations | NO |
| martvelge/DogFLW | NOASSERTION (README: CC BY-NC 4.0) | 2025-07-09 | own annotations | NO |
| hugocornellier/cat-face-landmarks-training | Apache-2.0 (code); weights CC BY-NC 4.0 | 2026-09-25 | CatFLW | NO |
| hugocornellier/dog-face-landmarks-training | Apache-2.0 (code); weights CC BY-NC 4.0 | 2026-09-25 | DogFLW | NO |
| zylamarek/frederic | MIT | 2023-10-03 | cat-dataset ← MSR Cat Head 2008 (no licence) | NO |
| zylamarek/cat-dataset | MIT (scripts only) | 2023-10-03 | MSR Cat Head 2008 | NO |
| harthur/kittydar | MIT | 2019-11-02 | MSR Cat Head 2008 | NO |
| marando/pycatfd | none | 2020-11-25 | unstated | NO |
| kairess/dog_face_detector | none | 2019-01-15 | via tureckova/Doggie-smile | NO |
| tureckova/Doggie-smile | none | 2020-10-02 | Columbia dogs (research) | NO |
| kwjinwoo/Dog_face_landmark_detection | MIT | 2022-06-06 | Columbia Dogs (CU) | NO |
| GuillaumeMougeot/DogFaceNet | MIT | 2026-04-29 | web-scraped dog faces (Zenodo) | NO (re-ID, data rights) |
| Amrithesh-Kakkoth/yolov5-petface | GPL-3.0 | 2026-01-11 | – | NO (GPL / Ultralytics) |
| SuzalShrestha/cam-watch, mupf-dev/vision-guard | AGPL-3.0 | 2026-10 | – | NO (AGPL / Ultralytics) |

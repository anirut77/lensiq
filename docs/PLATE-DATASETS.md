# Thai plate datasets and the detector training path (LENSIQ Gate)

> **สรุปภาษาไทย:** โมเดลหาป้ายที่ใช้อยู่ (LPD-YuNet) ฝึกกับป้ายจีน หาป้ายไทยในภาพจริงได้ไม่ดีพอ ทางแก้คือฝึก YOLOX-nano
> (Apache-2.0) กับชุดข้อมูลป้ายไทยที่ **เจ้าของดาวน์โหลดเองและตรวจสิทธิ์เองทีละชุด** ด้วยโน้ตบุ๊ก
> `tools/train-plate-detector.ipynb` บน Google Colab (GPU) แล้วนำไฟล์ ONNX มาเสียบด้วย `LQPlate.registerDetector` และวัดผลซ้ำด้วย
> `node tools/plate-det-eval.mjs` ห้ามใช้ Ultralytics (AGPL) และห้ามใช้โมเดล YOLOv9 ของ open-image-models (มาจากโค้ด GPL)
> ทั้งเป็นจุดเริ่มฝึกและเป็นตัวช่วยติดป้ายกำกับ ภาพในชุดข้อมูลห้าม commit ลง repo

We cannot train here (no GPU / torch, and Roboflow blocks automated downloads). The owner downloads the data by hand,
checks every licence, and runs the notebook. Research notes: round-15 research (kept outside the repo).

## 1. Datasets found (as listed; VERIFY EACH ONE BY HAND)

Roboflow Universe pages could not be loaded by our tools (Cloudflare), so the licences and counts below come from
search-engine snapshots. **Roboflow licences are asserted by the uploader**, and many sets are phone photos or images
scraped from the web whose real owner is unknown.

| # | Dataset (workspace) | Link | Licence as listed | Images as listed | Notes |
|---|---|---|---|---|---|
| 1 | Thai License Plate Detector (TH Support Cytron), plus "-2" | https://universe.roboflow.com/th-support-cytron-yvkeg/thai-license-plate-detector | CC BY 4.0 | 275 (one version 153) | scene images, class `License-Plate` |
| 2 | Thailand-License-Plate-Recognition (Dataset Format Conversion) | https://universe.roboflow.com/dataset-format-conversion-iidaz/thailand-license-plate-recognition | CC BY 4.0 | 343 | v1, 2022-03 |
| 3 | License Plate (yas-kk2tk) | https://universe.roboflow.com/yas-kk2tk/license-plate-eql7j-yjtkb | CC BY 4.0 | not shown | Thai parking-gate images (closest to the Gate use case) |
| 4 | Thailand License Plates (ThailLand Plates) | https://universe.roboflow.com/thailland-plates/thailand-license-plates | CC BY 4.0 | ~200 (uncertain) | 1 class |
| 5 | Thailand License Plate (akshay-3cztq) | https://universe.roboflow.com/akshay-3cztq/thailand-license-plate-czpfj | CC BY 4.0 | 445 | |
| 6 | Thai license plate detection V3.2 (card-detector) | search "card-detector thai license plate detection" on Roboflow Universe | CC BY 4.0 | ~1.8k | **character-level** (49 classes) on plate crops: for OCR work, not for scene detection |
| 7 | LicensePlateThai (pop-zxebp) | search on Roboflow Universe | Public Domain (as listed) | ? | 48 character classes (OCR, not detection) |
| 8 | thai_license_plate-TEST (3.69k) / "license plate Car & Motorcycle" (500) (yololab) | search on Roboflow Universe | **not verified** | 3,690 / 500 | biggest Thai set seen; check the licence before anything else |
| 9 | LicensePlatesMotorbikeThai (new-workspace-uvheu); Motorcycle License Plate Detection (motorcycle-9gyny) | search on Roboflow Universe | ? / PD (as listed) | ? | motorcycle coverage; country of the second unknown |
| 10 | CCPD (detectRecog) | https://github.com/detectRecog/CCPD | MIT | ~290k | Chinese single-line plates: optional PRE-training for plate shape / scale, not Thai |
| ✗ | TrainingDataPro/license_plates (Hugging Face) | | CC BY-NC-ND 4.0 | | **excluded** (non-commercial, no derivatives) |
| ✗ | Any Roboflow-hosted *model* (often YOLOv8/11), keremberke / morsetechlab / LiteALPR YOLO plate models | | AGPL-3.0 / Ultralytics | | **excluded** |
| ✗ | open-image-models `yolo-v9-*-license-plates` | | GPL-derived training code, undocumented scraped data | | **excluded** — benchmark only, never ship, never auto-label |

None of these clearly covers night, coloured plates (yellow, green, red trade, graphic auction) or motorcycles in
quantity. That has to come from **our own field-pilot photos** (with the PDPA sign, consent where needed, a retention
limit; `docs/FIELD-PILOT.md`).

## 2. What to check by hand, per dataset (write it into `SOURCE.json`)

1. **Licence on the dataset page** (Roboflow shows it under the title) **and** in the export's `README.roboflow.txt` /
   `README.dataset.txt`. Both must say the same permissive licence (CC BY 4.0, CC0 / public domain, MIT). If either says
   NC, ND, "private", "all rights reserved" or nothing at all: do not use it.
2. **Who owns the photos.** Look at a sample of 20 images: phone photos taken by the uploader are fine to the extent the
   licence covers them; screenshots of news / marketplace / social-media photos are not the uploader's to licence — drop
   the dataset or remove those images.
3. **Attribution text** required by CC BY: dataset title, author / workspace name, URL, licence + link, and the changes
   ("merged into one class, near-duplicates removed, used to train a model"). Copy Roboflow's suggested citation if there
   is one.
4. **Forks / duplicates:** Roboflow forks often re-upload the same photos; the notebook removes near-duplicates
   (perceptual hash) across all sources, but note which dataset is the original.
5. **Faces / readable plates of identifiable people:** images are used only for training and never shipped; keep the
   downloads in a private, access-controlled folder and delete them when the model card is done.

`SOURCE.json` (one per dataset folder; a folder without it is skipped by the notebook):

```json
{"name": "Thai License Plate Detector", "author": "TH Support Cytron (Roboflow workspace th-support-cytron-yvkeg)",
 "url": "https://universe.roboflow.com/th-support-cytron-yvkeg/thai-license-plate-detector",
 "licence": "CC BY 4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/",
 "checked_by": "owner name", "checked_on": "2026-11-20", "notes": "licence seen on the page and in README.roboflow.txt"}
```

## 3. Running the notebook (`tools/train-plate-detector.ipynb`)

1. Export each dataset from Roboflow as **COCO JSON** (preferred), **YOLO** (txt) or **Pascal VOC**; Kaggle VOC xml also
   works. Unzip each into its own folder under `MyDrive/lensiq-plate-data/<dataset>/` and add its `SOURCE.json`.
2. Open the notebook in Colab, Runtime → Change runtime type → **GPU**. Run the cells top to bottom:
   setup (pinned Megvii YOLOX 0.3.0, Apache-2.0; COCO YOLOX-nano start weights, Apache-2.0) → data in (skips folders
   without `SOURCE.json` and NC / ND / GPL licences) → merge + de-duplicate + one class `plate` → split 80/10/10 inside
   every source (optionally hold a whole source out as test: `HOLDOUT_SOURCES`) → conditions CSV → exp (YOLOX-nano, 416
   input; `INPUT = 320` for a faster model; simulated-night copies + HSV colour jitter, no horizontal flip) → train →
   export ONNX (opset 13, raw head, the same layout as the vendored person model) → evaluate (COCO mAP + per-condition
   recall) → `MODEL_CARD.md` → download.
3. **Conditions CSV:** the notebook writes `conditions.csv` (one row per test image). Fill `colour` (white / yellow /
   green / red / blue / graphic / other), `motorcycle` (1/0), `night` (1/0) by looking at the photos, upload it back and
   re-run the evaluation cell: recall is then reported per colour, motorcycle and night.
4. int8 is optional (`QUANTIZE = True`): measure it in the browser first. LPD-YuNet int8 was ~6× slower than fp32 on
   onnxruntime-web WASM.

## 4. Plugging the trained model into LENSIQ Gate

1. Copy `plate_yolox_nano_416.onnx` to `vendor/models/plate-det-th/` with `LICENSE` (Apache-2.0 for the YOLOX code /
   weights), `README.txt` (provenance, sha256, input / output) and the `MODEL_CARD.md` (dataset attributions). Add the
   rows to `LICENSES/THIRD_PARTY.md` and `THIRD-PARTY-NOTICES.txt` (CC BY attribution of every dataset).
2. Register it (e.g. in `gate-kit.js` after `LQPlate` loads). `proposals: true` keeps the built-in finder: the model's
   boxes are grown to the plate, scored and merged with the classical proposals and LPD-YuNet.

```js
(async () => {
  const LP = window.LQPlate, ort = window.ort, S = 416;
  const session = await ort.InferenceSession.create(new URL("vendor/models/plate-det-th/plate_yolox_nano_416.onnx", location.href).href, { executionProviders: ["wasm"] });
  LP.registerDetector(async canvas => {
    const k = Math.min(S / canvas.width, S / canvas.height), c = document.createElement("canvas"); c.width = S; c.height = S;
    const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "rgb(114,114,114)"; x.fillRect(0, 0, S, S);
    x.drawImage(canvas, 0, 0, canvas.width * k, canvas.height * k);
    const d = x.getImageData(0, 0, S, S).data, P = S * S, buf = new Float32Array(3 * P);
    for (let i = 0; i < P; i++) { buf[i] = d[4 * i + 2]; buf[P + i] = d[4 * i + 1]; buf[2 * P + i] = d[4 * i]; } // BGR 0..255
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", buf, [1, 3, S, S]) });
    const t = out[session.outputNames[0]];
    // LQDetect.decodeYolox (lensiq-detect.js) decodes the raw YOLOX head; class 0 = plate; boxes in source pixels
    return window.LQDetect.decodeYolox(t.data, t.dims[1], t.dims[2], S, { classes: [0], minScore: 0.3, scale: k })
      .map(b => ({ x: b.x / canvas.width, y: b.y / canvas.height, w: b.w / canvas.width, h: b.h / canvas.height, score: b.score, src: "model" }));
  }, { proposals: true });
})();
```

`decodeYolox` returns `{x, y, w, h, score, cls}` in source pixels after NMS. parking.html / village.html already load
`vendor/ort`; add `lensiq-detect.js` to them if it is not loaded yet.

3. Re-measure, then compare with the round-15 numbers in `docs/GATE.md` (demo set dev + held-out seed, real photos):

```sh
node tools/plate-det-eval.mjs                       # dev seed, as shipped
node tools/plate-det-eval.mjs --seed 7              # held-out seed
node tools/plate-det-eval.mjs --ocr all             # + exact reads with the real OCR
node tools/plate-det-eval.mjs --images DIR --gt gt.json   # your own labelled photos (kept OUT of the repo)
```

`gt.json` = `{"photo.jpg": [[x0, y0, x1, y1], ...]}` in pixels. Only numbers go into docs; photos never go into the repo.
4. The field pilot decides: the "taps needed" share (`tools/field-pilot-metrics.mjs`, column `tapped`) must fall, and
   the plate exact-match rate must not drop.

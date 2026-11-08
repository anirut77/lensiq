// tests/unit/gate-train-notebook.test.js — tools/train-plate-detector.ipynb (the owner runs it on Colab; we cannot train
// here): valid notebook JSON, the key steps exist in order, licence rules hold (Megvii YOLOX pinned, no Ultralytics, no
// GPL YOLOv9 weights, NC / ND data refused), the ONNX export matches what the browser decodes.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const nb = JSON.parse(readFileSync(join(__dirname, "..", "..", "tools", "train-plate-detector.ipynb"), "utf8"));
const src = c => (Array.isArray(c.source) ? c.source.join("") : String(c.source));
const code = nb.cells.filter(c => c.cell_type === "code");
const byTag = t => code.find(c => (c.metadata.tags || []).includes(t));

test("notebook: nbformat 4, GPU runtime, every cell well-formed with an id", () => {
  assert.equal(nb.nbformat, 4);
  assert.equal(nb.metadata.accelerator, "GPU");
  assert.equal(nb.metadata.kernelspec.language, "python");
  for (const c of nb.cells) {
    assert.ok(["code", "markdown"].includes(c.cell_type));
    assert.ok(typeof c.id === "string" && c.id.length > 0);
    if (c.cell_type === "code") { assert.deepEqual(c.outputs, []); assert.equal(c.execution_count, null); }
  }
});

test("notebook: setup -> data -> merge/dedupe -> split -> conditions -> exp -> train -> export -> evaluate -> card -> download", () => {
  const order = ["setup", "data-in", "merge-dedupe", "split", "conditions", "exp", "train", "export-onnx", "evaluate", "model-card", "download"];
  assert.deepEqual(code.map(c => (c.metadata.tags || [])[0]), order);
  assert.match(src(byTag("merge-dedupe")), /dhash/, "perceptual de-duplication");
  assert.match(src(byTag("merge-dedupe")), /"plate"|'plate'/, "one class 'plate'");
  assert.match(src(byTag("split")), /HOLDOUT_SOURCES/, "split by source with optional held-out sources");
  assert.match(src(byTag("conditions")), /colour.*motorcycle.*night/s, "per-condition tags CSV");
  assert.match(src(byTag("exp")), /num_classes = 1/);
  assert.match(src(byTag("exp")), /depth = 0\.33; self\.width = 0\.25/, "YOLOX-nano");
  assert.match(src(byTag("exp")), /INPUT = 416/);
  assert.match(src(byTag("exp")), /night_copy/, "night / colour augmentation");
  assert.match(src(byTag("evaluate")), /tools\/eval\.py/, "COCO mAP");
  assert.match(src(byTag("evaluate")), /RECALL/, "per-condition recall");
  assert.match(src(byTag("model-card")), /MODEL_CARD\.md/);
  assert.match(src(byTag("model-card")), /licence/i);
});

test("notebook: licence rules — pinned Megvii YOLOX (Apache-2.0), no Ultralytics, no GPL YOLOv9 weights, NC/ND data refused", () => {
  const all = code.map(src).join("\n");
  assert.match(all, /github\.com\/Megvii-BaseDetection\/YOLOX\.git/);
  assert.match(all, /YOLOX_TAG = "0\.3\.0"/, "pinned release");
  assert.match(all, /rev-parse/, "exact commit recorded");
  assert.match(all, /releases\/download\/0\.1\.1rc0\/yolox_nano\.pth/, "Apache-2.0 COCO start weights");
  assert.doesNotMatch(all, /pip[^\n]*ultralytics|import ultralytics|from ultralytics/i);
  assert.doesNotMatch(all, /(wget|curl|download|hf_hub|torch\.hub|git", "clone)[^\n]*(yolo-?v9|open-image-models|WongKinYiu)/i, "never fetches the GPL-derived YOLOv9 weights / code");
  assert.match(all, /"NC", "ND", "AGPL", "GPL"/, "non-commercial / no-derivatives / copyleft licences skipped");
  assert.match(all, /SOURCE\.json/, "every source needs a hand-checked SOURCE.json");
});

test("notebook: ONNX export = raw YOLOX head, opset 13 (onnxruntime-web WASM, decoded by LQDetect.decodeYolox)", () => {
  const e = src(byTag("export-onnx"));
  assert.match(e, /tools\/export_onnx\.py/);
  assert.match(e, /"--opset", "13"/);
  assert.doesNotMatch(e, /decode_in_inference/);
  assert.match(e, /QUANTIZE = False/, "int8 optional, off by default (measured slower on WASM)");
});

test("notebook: Colab install pitfalls handled (YOLOX setup.py needs torch, onnx-simplifier pin, torch.load weights_only)", () => {
  const s = src(byTag("setup")), e = src(byTag("exp"));
  assert.match(s, /--no-build-isolation/, "YOLOX setup.py imports torch: no build isolation");
  assert.match(s, /onnx-simplifier/, "the old onnx-simplifier pin is skipped");
  assert.match(s, /TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD/, "PyTorch >= 2.6 weights_only default");
  assert.match(src(byTag("export-onnx")), /--no-onnxsim/);
  assert.doesNotMatch(e, /def get_dataset|def get_eval_dataset/, "0.3.0 builds the datasets itself; no post-0.3.0 hooks");
});

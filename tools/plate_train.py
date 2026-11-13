#!/usr/bin/env python3
"""tools/plate_train.py — train the Thai plate DETECTOR on the owner's own (blurred) photos, ON THIS MACHINE.

The photos never leave the computer (the Colab notebook tools/train-plate-detector.ipynb uploads data to Google: use it for
the owner's photos only after the owner and counsel agree, docs/PLATE-TRAINING.md). Input: the dataset written by
`node tools/plate-train-prep.mjs export` (YOLOX / COCO layout, boxes only, no plate text). Output: an ONNX file in the
format the site already decodes (raw YOLOX head, opset 13, LQDetect.decodeYolox) and a MODEL_CARD.md.

Licences (do not change): Megvii YOLOX 0.3.0 (Apache-2.0), cloned at a pinned tag, NOT vendored; start weights YOLOX-nano
COCO release 0.1.1rc0 (Apache-2.0). Never Ultralytics (AGPL-3.0), never the open-image-models / WongKinYiu YOLOv9 weights.

    python3 tools/plate_train.py setup  [--root ~/LENSIQ-field/plates-train]   venv + YOLOX + start weights (downloads ~1 GB)
    python3 tools/plate_train.py train  [--root …] [--epochs 150] [--input 416] [--name run1] [--device cpu|mps]
    python3 tools/plate_train.py onnx   [--root …] --name run1
    python3 tools/plate_train.py smoke  [--root /tmp/x]   1-epoch run on a few synthetic images (checks the path, not a model)

A full run (150 epochs, a few hundred photos) takes many hours on a laptop CPU: run it overnight, plugged in.
"""
import argparse
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
YOLOX_TAG = "0.3.0"
YOLOX_GIT = "https://github.com/Megvii-BaseDetection/YOLOX.git"
START_WEIGHTS = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.pth"
BANNED = ("ultralytics", "yolov9", "open-image-models", "wongkinyiu")
DEFAULT_ROOT = os.path.join(os.path.expanduser("~"), "LENSIQ-field", "plates-train")


def check_root(root, repo=REPO):
    """the training folder (photos of plates and people) must be outside the repo"""
    r = os.path.realpath(root)
    rp = os.path.realpath(repo)
    if r == rp or r.startswith(rp + os.sep):
        raise SystemExit(f"plate_train: the training folder must be outside the repo: {root}")
    return True


def check_sources(*urls):
    """refuse any banned code / weights source (licence rule)"""
    for u in urls:
        if any(b in u.lower() for b in BANNED):
            raise SystemExit(f"plate_train: banned source (licence): {u}")
    return True


def check_dataset(ds):
    """the training files carry boxes only: no plate text, no province (privacy)"""
    for part in ("train", "val", "test"):
        p = os.path.join(ds, "annotations", part + ".json")
        if not os.path.exists(p):
            raise SystemExit(f"plate_train: {p} missing (run `node tools/plate-train-prep.mjs export`)")
        j = json.load(open(p, encoding="utf-8"))
        if j.get("categories") != [{"id": 1, "name": "plate"}]:
            raise SystemExit(f"plate_train: {p}: expected one category 'plate' (id 1)")
        for a in j.get("annotations", []):
            extra = set(a) - {"id", "image_id", "category_id", "bbox", "area", "iscrowd"}
            if extra:
                raise SystemExit(f"plate_train: {p}: annotation has extra fields {sorted(extra)} (no plate text in training files)")
    return True


def exp_text(ds, epochs=150, inp=416, name="plate_nano"):
    """the YOLOX experiment file: YOLOX-nano, 1 class, same recipe as tools/train-plate-detector.ipynb"""
    return f'''
import os
from yolox.exp import Exp as MyExp
class Exp(MyExp):
    def __init__(self):
        super().__init__()
        self.num_classes = 1
        self.depth = 0.33; self.width = 0.25
        self.input_size = ({inp}, {inp}); self.test_size = ({inp}, {inp})
        self.random_size = (10, 20); self.mosaic_scale = (0.5, 1.5)
        self.mosaic_prob = 0.5; self.enable_mixup = False; self.mixup_prob = 0.0
        self.hsv_prob = 1.0; self.flip_prob = 0.0
        self.degrees = 5.0; self.translate = 0.1; self.shear = 2.0
        self.max_epoch = {epochs}; self.no_aug_epochs = {min(15, max(0, epochs // 10))}; self.warmup_epochs = {min(5, max(1, epochs // 30))}
        self.basic_lr_per_img = 0.01 / 64.0; self.eval_interval = {max(1, min(5, epochs))}
        self.data_num_workers = 2
        self.data_dir = {json.dumps(ds)}
        self.train_ann = "train.json"; self.val_ann = "val.json"; self.test_ann = "test.json"
        self.exp_name = {json.dumps(name)}
    def get_model(self, sublinear=False):
        import torch.nn as nn
        from yolox.models import YOLOX, YOLOPAFPN, YOLOXHead
        def init_yolo(M):
            for m in M.modules():
                if isinstance(m, nn.BatchNorm2d): m.eps = 1e-3; m.momentum = 0.03
        if getattr(self, "model", None) is None:
            in_channels = [256, 512, 1024]
            backbone = YOLOPAFPN(self.depth, self.width, in_channels=in_channels, depthwise=True)
            head = YOLOXHead(self.num_classes, self.width, in_channels=in_channels, depthwise=True)
            self.model = YOLOX(backbone, head)
        self.model.apply(init_yolo); self.model.head.initialize_biases(1e-2)
        return self.model
'''


def run(cmd, **kw):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True, **kw)


def paths(root):
    w = os.path.join(root, "work")
    return {"work": w, "venv": os.path.join(w, "venv"), "yolox": os.path.join(w, "YOLOX"), "weights": os.path.join(w, "yolox_nano.pth"),
            "dataset": os.path.join(root, "dataset"), "runs": os.path.join(root, "runs")}


def py(p):
    return os.path.join(p["venv"], "bin", "python")


def yolox_env(p):
    env = dict(os.environ, TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD="1")
    env["PYTHONPATH"] = p["yolox"] + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    return env


def setup(root):
    p = paths(root)
    check_sources(YOLOX_GIT, START_WEIGHTS)
    os.makedirs(p["work"], exist_ok=True)
    if not os.path.isdir(p["venv"]):
        run([sys.executable, "-m", "venv", p["venv"]])
    run([py(p), "-m", "pip", "install", "-q", "--upgrade", "pip"])
    run([py(p), "-m", "pip", "install", "-q", "torch", "torchvision", "onnx", "onnxruntime", "pycocotools", "pillow", "numpy",
         "loguru", "tqdm", "tabulate", "thop", "ninja", "psutil", "opencv-python-headless", "tensorboard"])
    if not os.path.isdir(p["yolox"]):
        run(["git", "clone", "--depth", "1", "--branch", YOLOX_TAG, YOLOX_GIT, p["yolox"]])
    lic = open(os.path.join(p["yolox"], "LICENSE"), encoding="utf-8").read()
    if "Apache License" not in lic:
        raise SystemExit("plate_train: YOLOX LICENSE is not Apache-2.0: stop")
    # YOLOX is NOT pip-installed (its 0.3.0 setup.py cannot be installed editable by current pip): the YOLOX folder is put
    # on PYTHONPATH of every training / export process instead (yolox_env)
    if not os.path.exists(p["weights"]):
        run(["curl", "-fsSL", "-o", p["weights"], START_WEIGHTS])
    commit = subprocess.run(["git", "-C", p["yolox"], "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    json.dump({"yolox_tag": YOLOX_TAG, "yolox_commit": commit, "start_weights": START_WEIGHTS}, open(os.path.join(p["work"], "setup.json"), "w"))
    print("ready:", commit)


def train(root, epochs, inp, name, device, batch=16):
    p = paths(root)
    check_dataset(p["dataset"])
    run_dir = os.path.join(p["runs"], name)
    os.makedirs(run_dir, exist_ok=True)
    exp = os.path.join(run_dir, "exp.py")
    open(exp, "w").write(exp_text(p["dataset"], epochs, inp, name))
    env = yolox_env(p)
    # YOLOX 0.3.0 tools/train.py: -d 0 = CPU is not supported upstream; one device ("-d 1") uses CUDA when present. On a Mac
    # without CUDA the patched launcher below keeps the run on CPU (or MPS with --device mps).
    try:
        run([py(p), os.path.join(REPO, "tools", "plate_train_launch.py"), "--yolox", p["yolox"], "-f", exp, "-c", p["weights"],
             "-b", str(batch), "--device", device, "--out", run_dir], env=env)
    except subprocess.CalledProcessError as e:
        if e.returncode == 3:  # the launcher refused: machine busy (message printed above)
            raise SystemExit(3)
        raise
    json.dump({"epochs": epochs, "input": inp, "device": device, "batch": batch}, open(os.path.join(run_dir, "train.json"), "w"))


def onnx(root, name, inp=416):
    p = paths(root)
    run_dir = os.path.join(p["runs"], name)
    best = os.path.join(run_dir, name, "best_ckpt.pth")
    if not os.path.exists(best):
        best = os.path.join(run_dir, name, "latest_ckpt.pth")
    out = os.path.join(run_dir, f"plate_yolox_nano_{inp}.onnx")
    env = yolox_env(p)
    if os.path.exists(out):
        os.remove(out)
    run([py(p), os.path.join(REPO, "tools", "plate_train_launch.py"), "--yolox", p["yolox"], "-f", os.path.join(run_dir, "exp.py"),
         "-c", best, "--out", run_dir, "--export", out], env=env)
    if not os.path.exists(out):
        raise SystemExit("plate_train: the ONNX export failed (no file written)")
    setup_info = json.load(open(os.path.join(p["work"], "setup.json")))
    card = [f"# Thai licence-plate detector — YOLOX-nano {inp} (LENSIQ Gate, owner photos)", "",
            f"- File: `{os.path.basename(out)}`, one class `plate`, raw YOLOX head output, opset 13 (LQDetect.decodeYolox)",
            f"- Trainer: Megvii YOLOX {setup_info['yolox_tag']} (commit `{setup_info['yolox_commit']}`), Apache-2.0. Start weights: YOLOX-nano COCO 0.1.1rc0, Apache-2.0",
            "- Data: the owner's own photos (CONSENT.md in the training folder), faces and other personal data blurred and checked by a person,",
            "  split by plate group (plate-split-v1, locked). Images are NOT distributed; only these weights.",
            "- Not used: Ultralytics (AGPL-3.0), YOLOv9 / open-image-models weights (GPL-derived, unclear data).", "",
            "## Results", "", "Run `node tools/plate-det-compare.mjs --model " + out + "` (locked field test split) and paste the table here.",
            "Source of those numbers: field (owner photos, locked test split)."]
    open(os.path.join(run_dir, "MODEL_CARD.md"), "w", encoding="utf-8").write("\n".join(card) + "\n")
    print(out)


def smoke(root):
    """a 1-epoch run on 8 synthetic images (drawn plates, no people): proves setup -> train -> onnx works on this machine"""
    from PIL import Image, ImageDraw
    p = paths(root)
    ds = p["dataset"]
    for part, n in (("train", 6), ("val", 2), ("test", 2)):
        os.makedirs(os.path.join(ds, part + "2017"), exist_ok=True)
        images, anns = [], []
        for i in range(n):
            im = Image.new("RGB", (416, 416), (90 + 10 * i, 110, 120))
            d = ImageDraw.Draw(im)
            x, y = 60 + 20 * i, 200 + 5 * i
            d.rectangle([x, y, x + 160, y + 70], fill=(250, 250, 245), outline=(0, 0, 0), width=2)
            d.text((x + 20, y + 25), "SYN 1234", fill=(0, 0, 0))
            fn = f"{part}_{i:06d}.jpg"
            im.save(os.path.join(ds, part + "2017", fn), quality=90)
            images.append({"id": i, "file_name": fn, "width": 416, "height": 416})
            anns.append({"id": i, "image_id": i, "category_id": 1, "bbox": [x, y, 160, 70], "area": 160 * 70, "iscrowd": 0})
        os.makedirs(os.path.join(ds, "annotations"), exist_ok=True)
        json.dump({"images": images, "annotations": anns, "categories": [{"id": 1, "name": "plate"}]}, open(os.path.join(ds, "annotations", part + ".json"), "w"))
    train(root, 1, 416, "smoke", "cpu", batch=2)
    onnx(root, "smoke")


def main(argv=None):
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("cmd", choices=["setup", "train", "onnx", "smoke"])
    a.add_argument("--root", default=DEFAULT_ROOT)
    a.add_argument("--epochs", type=int, default=150)
    a.add_argument("--input", type=int, default=416)
    a.add_argument("--name", default="run1")
    a.add_argument("--device", choices=["cpu", "mps"], default="cpu")
    o = a.parse_args(argv)
    root = os.path.abspath(os.path.expanduser(o.root))
    check_root(root)
    if o.cmd == "setup":
        setup(root)
    elif o.cmd == "train":
        train(root, o.epochs, o.input, o.name, o.device)
    elif o.cmd == "onnx":
        onnx(root, o.name, o.input)
    else:
        setup(root)
        smoke(root)
    return 0


if __name__ == "__main__":
    sys.exit(main())

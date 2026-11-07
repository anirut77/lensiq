#!/usr/bin/env python3
"""tests/bench/fetch_datasets.py — download the public benchmark data into a directory OUTSIDE the repo.

    python3 -I tests/bench/fetch_datasets.py /path/to/bench-data [mot] [lfw] [lfwfull] [casia5] [utk] [hagrid] [oceyes] [cew] [fer] [mit1003]

Nothing here is committed or redistributed. You are responsible for accepting each dataset's terms:
  mot  MOTChallenge MOT17 train (02, 04, 09; every 3rd frame = 10 fps) + 2DMOT2015 train (PETS09-S2L1, TUD-Stadtmitte)
       https://motchallenge.net — CC BY-NC-SA 3.0. Only the needed members are fetched with HTTP Range requests
       (the full zips are 5.9 GB / 1.3 GB).
  lfw  Labeled Faces in the Wild, View-1 pairs (2,200 pairs), via the Hugging Face mirror logasja/lfw (the UMass site
       was unreachable when this was written). LFW: research use; no licence beyond that. Needs `pip install pyarrow`.
  hagrid  HaGRID (Kapitanov et al.) 384p sample, mirror cj-mills/hagrid-sample-30k-384p — CC BY-SA 4.0.
       40 random images per gesture (seed 42) + their hand boxes are fetched with HTTP Range requests.
  utk  UTKFace aligned & cropped (Zhang et al., CVPR 2017), mirror py97/UTKFace-Cropped — non-commercial research only.
       A seeded random subset of 2,000 faces is extracted.
  oceyes  "Open and Closed Eyes Dataset" (MichalMlodawski/closed-open-eyes, AI-generated 512 px faces) — ODC-BY 1.0.
       A seeded sample of 20 of its 1,000 parquet shards (~2,000 faces); needs pyarrow. (driver drowsiness, eye state)
  cew  Closed Eyes In The Wild (Song et al., Pattern Recognition 2014), NUAA — "for research purposes to a researcher
       only and not for any commercial use"; do not redistribute. Warped 100x100 faces (1,192 closed / 1,231 open),
       fetched from the authors' Google Drive link; needs `bsdtar` (libarchive) to unpack the RAR.
  fer  FER-2013 (Goodfellow et al., ICML 2013 challenge) PrivateTest sample, 100 images per class from the HF mirror
       3una/Fer2013 — research use only (no licence granted); used for evaluation only, never for training/shipping.
  mit1003  MIT1003 eye-tracking data (Judd, Ehinger, Durand & Torralba, ICCV 2009), 1,003 images, 15 viewers each, from
       the authors' page people.csail.mit.edu/tjudd/WherePeopleLook — no licence is stated: research evaluation only, never
       bundled or used for shipping. ALLSTIMULI.zip (235 MB) + ALLFIXATIONMAPS.zip (10 MB). (creative.html attention map)
Layout produced (what the *.bench.mjs scripts read via LQ_BENCH_DATA):
  mot/MOT17/train/MOT17-0X-FRCNN/{img1,gt,seqinfo.ini}  mot/2DMOT2015/train/<SEQ>/{img1,gt}
  lfw/pairs.json + lfw/img/*.jpg                         utk/index.json + utk/img/*.jpg
  hagrid/index.json + hagrid/hagrid-sample-30k-384p/...
  oceyes/index.json + oceyes/img/*.jpg                   cew/index.json + cew/w/dataset_B_FacialImages/...
  fer/index.json + fer/test/<class>/*.jpg
  mit1003/ALLSTIMULI/*.jpeg + mit1003/ALLFIXATIONMAPS/*_fixPts.jpg, *_fixMap.jpg
"""
import io, json, os, pickle, random, re, struct, sys, tarfile, urllib.request, zipfile, zlib
from concurrent.futures import ThreadPoolExecutor

def http(url, a=None, b=None, timeout=120):
    h = {"Range": "bytes=%d-%d" % (a, b)} if a is not None else {}
    err = None
    for _ in range(6):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout).read()
        except Exception as e: err = e
    raise err

class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos = url, 0
        self.size = int(urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60).headers["Content-Length"])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, wh=0):
        self.pos = off if wh == 0 else self.pos + off if wh == 1 else self.size + off
        return self.pos
    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0: return 0
        d = http(self.url, self.pos, self.pos + n - 1)[:n]
        buf[:len(d)] = d; self.pos += len(d); return len(d)

def remote_zip(url, out, pattern, step=1):
    os.makedirs(out, exist_ok=True)
    cache = os.path.join(out, ".cd-" + re.sub(r"\W", "_", url) + ".pkl")
    if os.path.exists(cache): infos = pickle.load(open(cache, "rb"))
    else:
        z = zipfile.ZipFile(io.BufferedReader(RangeFile(url), buffer_size=1 << 20))
        infos = [(i.filename, i.header_offset, i.compress_size, i.compress_type) for i in z.infolist()]
        pickle.dump(infos, open(cache, "wb"))
    pat = re.compile(pattern)
    def keep(n):
        m = re.search(r"img1/(\d+)\.jpg$", n)
        return (not m) or (int(m.group(1)) - 1) % step == 0
    sel = [x for x in infos if pat.search(x[0]) and not x[0].endswith("/") and keep(x[0])]
    def one(x):
        name, off, cs, ct = x
        p = os.path.join(out, name)
        if os.path.exists(p): return
        d = http(url, off, off + 30 + 1024 + cs)
        nl, el = struct.unpack("<HH", d[26:30]); data = d[30 + nl + el:30 + nl + el + cs]
        if ct == 8: data = zlib.decompress(data, -15)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p + ".part", "wb").write(data); os.rename(p + ".part", p)
    with ThreadPoolExecutor(12) as ex:
        for i, _ in enumerate(ex.map(one, sel)):
            if i % 200 == 0: print("  %s: %d/%d" % (os.path.basename(url), i, len(sel)), flush=True)

def mot(root):
    out = os.path.join(root, "mot")
    remote_zip("https://motchallenge.net/data/2DMOT2015.zip", out, r"2DMOT2015/train/(PETS09-S2L1|TUD-Stadtmitte)/(img1/.*|gt/gt.txt)$")
    remote_zip("https://motchallenge.net/data/MOT17.zip", out, r"MOT17/train/MOT17-(02|04|09)-FRCNN/(img1/.*|gt/gt.txt|seqinfo.ini)$", step=3)

def lfw(root):
    import pyarrow.parquet as pq  # pip install pyarrow
    out = os.path.join(root, "lfw"); os.makedirs(os.path.join(out, "img"), exist_ok=True)
    raw = http("https://huggingface.co/datasets/logasja/lfw/resolve/main/pairs/test-00000-of-00001.parquet", timeout=600)
    rows = pq.read_table(io.BytesIO(raw)).to_pylist(); pairs = []
    for i, r in enumerate(rows):
        a, b = "img/%04d_a.jpg" % i, "img/%04d_b.jpg" % i
        open(os.path.join(out, a), "wb").write(r["img_0"]["bytes"]); open(os.path.join(out, b), "wb").write(r["img_1"]["bytes"])
        pairs.append({"a": a, "b": b, "same": r["pair"], "pa": r["img_0"]["path"], "pb": r["img_1"]["path"]})
    json.dump(pairs, open(os.path.join(out, "pairs.json"), "w"))

def lfwfull(root):
    """full LFW (13,233 images, 5,749 people) for the 1:N benchmark — same tarball scikit-learn downloads (research use)"""
    out = os.path.join(root, "lfwfull"); os.makedirs(out, exist_ok=True)
    t = tarfile.open(fileobj=io.BytesIO(http("https://ndownloader.figshare.com/files/5976018", timeout=1800)), mode="r:gz")
    for m in t.getmembers():  # plain files under lfw/ only (no links, no absolute or .. paths)
        if m.isfile() and re.match(r"^lfw/[\w.-]+/[\w.-]+\.jpg$", m.name):
            p = os.path.join(out, m.name); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "wb").write(t.extractfile(m).read())

def casia5(root):
    """CASIA-FaceV5 (500 Asian people x 5 photos, 112 px aligned) — original photos only, no augmentations; research use,
    evaluation only (the HF mirror's Apache-2.0 label is not relied on)"""
    out = os.path.join(root, "casia5", "img"); os.makedirs(out, exist_ok=True)
    z = zipfile.ZipFile(io.BytesIO(http("https://huggingface.co/datasets/JustinLeee/Cleaned_Augmented_CASIA_FaceV5/resolve/main/Cleaned_CASIA_FaceV5.zip", timeout=1800)))
    for n in z.namelist():
        if re.search(r"/\d{3}_\d\.jpg$", n): open(os.path.join(out, os.path.basename(n)), "wb").write(z.read(n))


def utk(root, n=2000):
    out = os.path.join(root, "utk"); os.makedirs(os.path.join(out, "img"), exist_ok=True)
    raw = http("https://huggingface.co/datasets/py97/UTKFace-Cropped/resolve/main/UTKFace.tar.gz", timeout=1200)
    tf = tarfile.open(fileobj=io.BytesIO(raw))
    ms = [m for m in tf.getmembers() if m.isfile() and re.match(r"UTKFace/\d+_[01]_[0-4]_\d+\.jpg\.chip\.jpg$", m.name)]
    random.seed(42); random.shuffle(ms); idx = []
    for i, m in enumerate(ms[:n]):
        age, g, race = m.name.split("/")[1].split("_")[:3]; p = "img/%04d.jpg" % i
        open(os.path.join(out, p), "wb").write(tf.extractfile(m).read())
        idx.append({"f": p, "age": int(age), "gender": "male" if g == "0" else "female", "race": int(race)})
    json.dump(idx, open(os.path.join(out, "index.json"), "w"))

def hagrid(root, per=40):
    url = "https://huggingface.co/datasets/cj-mills/hagrid-sample-30k-384p/resolve/main/hagrid-sample-30k-384p.zip"
    out = os.path.join(root, "hagrid")
    remote_zip(url, out, r"ann_train_val/.*\.json$")
    infos = pickle.load(open(os.path.join(out, ".cd-" + re.sub(r"\W", "_", url) + ".pkl"), "rb"))
    by = {}
    for n in (i[0] for i in infos if i[0].endswith(".jpg")): by.setdefault(n.split("/")[2].replace("train_val_", ""), []).append(n)
    random.seed(42); pick = []
    for g in sorted(by):
        ann = json.load(open(os.path.join(out, "hagrid-sample-30k-384p/ann_train_val/%s.json" % g)))
        c = [n for n in by[g] if os.path.basename(n)[:-4] in ann]; random.shuffle(c)
        for n in c[:per]:
            a = ann[os.path.basename(n)[:-4]]; pick.append({"f": n, "gesture": g, "boxes": a["bboxes"], "labels": a["labels"]})
    json.dump(pick, open(os.path.join(out, "index.json"), "w"))
    remote_zip(url, out, "^(" + "|".join(re.escape(p["f"]) for p in pick) + ")$")

def oceyes(root, shards=20, per=100):
    import pyarrow.parquet as pq  # pip install pyarrow
    out = os.path.join(root, "oceyes"); os.makedirs(os.path.join(out, "img"), exist_ok=True)
    random.seed(42); pick = sorted(random.sample(range(1, 1001), shards)); idx = []
    for s in pick:
        t = pq.read_table(io.BytesIO(http("https://huggingface.co/datasets/MichalMlodawski/closed-open-eyes/resolve/main/data/dataset_%03d.parquet" % s, timeout=600)))
        for r in t.slice(0, per).to_pylist():
            p = "img/%d.jpg" % r["Image_id"]; open(os.path.join(out, p), "wb").write(r["Image_data"]["file"])
            idx.append({"f": p, "closed": r["Label"] == "closed_eyes", "le": r["Left_eye_react"], "re": r["Right_eye_react"]})
        print("  shard %d: %d faces" % (s, len(idx)), flush=True)
    json.dump(idx, open(os.path.join(out, "index.json"), "w"))

def cew(root):
    import subprocess
    out = os.path.join(root, "cew"); os.makedirs(out, exist_ok=True)
    rar = os.path.join(out, "warped.rar")
    if not os.path.exists(rar):
        open(rar, "wb").write(http("https://drive.usercontent.google.com/download?id=1FcRw251WxGKwT6Dt9ncP-1TbW6h445W5&export=download&confirm=t", timeout=600))
    os.makedirs(os.path.join(out, "w"), exist_ok=True)
    subprocess.run(["bsdtar", "-xf", rar, "-C", os.path.join(out, "w")], check=True)
    base = "w/dataset_B_FacialImages"; idx = []
    for sub, closed in (("ClosedFace", True), ("OpenFace", False)):
        for n in sorted(os.listdir(os.path.join(out, base, sub))):
            if n.lower().endswith(".jpg"): idx.append({"f": "%s/%s/%s" % (base, sub, n), "closed": closed})
    json.dump(idx, open(os.path.join(out, "index.json"), "w"))

def fer(root):
    out = os.path.join(root, "fer"); idx = []
    meta = json.loads(http("https://huggingface.co/api/datasets/3una/Fer2013"))
    files = [s["rfilename"] for s in meta["siblings"] if s["rfilename"].startswith("test/") and s["rfilename"].endswith(".jpg")]
    def one(f):
        p = os.path.join(out, f)
        if not os.path.exists(p):
            os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "wb").write(http("https://huggingface.co/datasets/3una/Fer2013/resolve/main/" + f))
    with ThreadPoolExecutor(12) as ex: list(ex.map(one, files))
    json.dump([{"f": f, "label": f.split("/")[1]} for f in sorted(files)], open(os.path.join(out, "index.json"), "w"))

def mit1003(root):
    out = os.path.join(root, "mit1003"); os.makedirs(out, exist_ok=True)
    for z in ("ALLSTIMULI", "ALLFIXATIONMAPS"):
        if os.path.isdir(os.path.join(out, z)): continue
        data = http("https://people.csail.mit.edu/tjudd/WherePeopleLook/%s.zip" % z, timeout=1800)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for m in zf.namelist():
                if m.startswith(z + "/") and not m.endswith("/") and re.match(r"^[\w./-]+$", m) and ".." not in m: zf.extract(m, out)

if __name__ == "__main__":
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    root = os.path.abspath(sys.argv[1]); want = sys.argv[2:] or ["mot", "lfw", "utk", "hagrid"]
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if root == repo or root.startswith(repo + os.sep): sys.exit("refusing to download datasets inside the repository")
    for w in want: print("==", w); {"mot": mot, "lfw": lfw, "lfwfull": lfwfull, "casia5": casia5, "utk": utk, "hagrid": hagrid, "oceyes": oceyes, "cew": cew, "fer": fer, "mit1003": mit1003}[w](root)

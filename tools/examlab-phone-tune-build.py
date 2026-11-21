#!/usr/bin/env python3
# tools/examlab-phone-tune-build.py — LENSIQ Exam lab A2 TUNING set (owner decision 217 ก, 2026-11-21).
# Builds ~/LENSIQ-field/evals/examlab-phone-tune/ from Open Images V7, the same source and method as the locked A2 set
# (docs/exam/EXAMLAB-PHONE-SET.md), with three differences the owner set: (1) the set is for TUNING only and is disjoint
# from the locked set (by image id, Flickr photo, and image sha256); (2) labels come ONLY from the dataset's own boxes:
# nobody opens or views any image (no hand-check, no contact sheet); (3) the download stays near 50 MB (Flickr "_b"
# size, longest side <= 1024 px, no originals).
#
#   python3 -I tools/examlab-phone-tune-build.py --plan       candidates only, no download
#   python3 -I tools/examlab-phone-tune-build.py --download   download, write manifest.jsonl, labels.csv, ATTRIBUTION.csv
#
# Inputs (public metadata, already on this Mac): ~/LENSIQ-field/openimages-meta-test/ (test boxes, image labels, image
# metadata) and ~/LENSIQ-field/openimages-meta-train/ (train phone + hand boxes; image metadata rows for those images
# streamed from storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv, only matching rows
# kept). Only images whose own License field is CC BY 2.0 and Rotation 0 are taken.
import csv, hashlib, json, os, re, sys, time, urllib.request
from collections import defaultdict

H = os.path.expanduser("~/LENSIQ-field")
OUT = os.path.join(H, "evals", "examlab-phone-tune")
IMG = os.path.join(OUT, "images")
TEST = os.path.join(H, "openimages-meta-test")
TRAIN = os.path.join(H, "openimages-meta-train")
LIC = "https://creativecommons.org/licenses/by/2.0/"
SALT = "lensiq-examlab-phone-tune:"
N_POS, N_NEG = 180, 200
BUDGET = {"pos": 25 * 1024 * 1024, "neg": 27 * 1024 * 1024}  # ~52 MB in all: each group stops at its share
DESK_MAX = 0.4

PHONE, HAND = "/m/050k8", "/m/0k65p"
HUMAN = {"/m/01g317", "/m/04yx4", "/m/03bt1vf", "/m/01bl7v", "/m/05r655"}  # Person, Man, Woman, Boy, Girl
PHONEISH = {PHONE, "/m/07cx4", "/m/0h8lkj8", "/m/0bh9flk"}  # Mobile phone, Telephone, Corded phone, Tablet computer
TABLES = {"/m/01y9k5", "/m/04bcr3", "/m/078n6m", "/m/0h8n5zk"}  # Desk, Table, Coffee table, Kitchen & dining room table

# every Open Images id already used anywhere in the field evals (locked A2 set incl. its dropped candidates, exam-faces,
# exam-faces-hall, hall-detector, ...): none may enter the tuning set
EXCL_FILES = [os.path.join(H, "evals", "examlab-phone", f) for f in ("candidates.json", "manifest.jsonl", "labels.csv", "ATTRIBUTION.csv", "handcheck-dropped.csv")]
EXCL_FILES += [os.path.join(H, "exam-faces", "manifest.jsonl"), os.path.join(H, "exam-faces-hall", "manifest.jsonl"), os.path.join(H, "evals", "hall-detector", "manifest.jsonl")]


def excluded():
    ids, flickr = set(), set()
    for f in EXCL_FILES:
        t = open(f, encoding="utf8").read()
        ids |= set(re.findall(r"\b[0-9a-f]{16}\b", t))
        flickr |= set(re.findall(r"flickr\.com/photos/[^/\s\"',]+/(\d+)", t))
    for root, _, fs in os.walk(os.path.join(H, "evals")):
        if root.startswith(OUT):
            continue
        for f in fs:
            if f == "manifest.jsonl":
                ids |= set(re.findall(r'"id":\s*"([0-9a-f]{16})"', open(os.path.join(root, f), encoding="utf8").read()))
    return ids, flickr


def order(i):
    return hashlib.sha256((SALT + i).encode()).hexdigest()


def inter(a, b):  # boxes as (xmin, xmax, ymin, ymax)
    return max(0.0, min(a[1], b[1]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[2], b[2]))


def meta(path):
    return {r["ImageID"]: r for r in csv.DictReader(open(path, encoding="utf8"))}


def positives():
    # the locked set's P1 rule on the TRAIN split: a Mobile phone box (not group, not depiction) overlapping a Person / Man /
    # Woman / Boy / Girl / Human hand box (not depiction); images with any Tablet computer / Telephone / Corded phone box are
    # left out (the locked hand-check removed tablets). Human and tablet boxes of the train phone images come from
    # train-bbox-phoneimgs-human.csv (rows streamed from train-annotations-bbox.csv, only those images and classes kept).
    ph, hd, other = defaultdict(list), defaultdict(list), set()
    rows = list(csv.DictReader(open(os.path.join(TRAIN, "train-bbox-phone-hand.csv"), encoding="utf8")))
    rows += list(csv.DictReader(open(os.path.join(TRAIN, "train-bbox-phoneimgs-human.csv"), encoding="utf8")))
    for r in rows:
        b = tuple(float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
        if r["LabelName"] == PHONE:
            if r["IsGroupOf"] == "0" and r["IsDepiction"] == "0":
                ph[r["ImageID"]].append(b)
        elif r["LabelName"] in PHONEISH:
            other.add(r["ImageID"])
        elif (r["LabelName"] == HAND or r["LabelName"] in HUMAN) and r["IsDepiction"] == "0":
            hd[r["ImageID"]].append(b)
    out = {}
    for i, ps in ph.items():
        if i in other:
            continue
        if any(inter(p, h) > 0 for p in ps for h in hd.get(i, [])):
            pl = max(max(p[1] - p[0], p[3] - p[2]) for p in ps)
            out[i] = {"phones": ps, "phoneLong": pl}
    return out


def negatives():
    rows = defaultdict(list)
    for r in csv.DictReader(open(os.path.join(TEST, "test-annotations-bbox.csv"), encoding="utf8")):
        rows[r["ImageID"]].append(r)
    poslab = defaultdict(set)
    for r in csv.DictReader(open(os.path.join(TEST, "test-annotations-human-imagelabels-boxable.csv"), encoding="utf8")):
        if r["Confidence"] == "1":
            poslab[r["ImageID"]].add(r["LabelName"])
    out = []
    for i, rs in rows.items():
        labs = {r["LabelName"] for r in rs}
        if labs & PHONEISH or poslab[i] & PHONEISH or not labs & TABLES:
            continue
        hum = [r for r in rs if r["LabelName"] in HUMAN]
        if any(r["IsDepiction"] == "1" for r in hum):
            continue
        hum = [r for r in hum if r["IsGroupOf"] == "0"]
        if not 1 <= len(hum) <= 4:
            continue
        if any(r["IsGroupOf"] == "1" and r["LabelName"] in HUMAN for r in rs):
            continue
        if not any((float(r["XMax"]) - float(r["XMin"])) * (float(r["YMax"]) - float(r["YMin"])) >= 0.05 for r in hum):
            continue
        out.append(i)
    return out


def ok_meta(m):
    return m and m["License"] == LIC and (m.get("Rotation") or "0").split(".")[0] in ("0", "") and m.get("Thumbnail300KURL")


def jpeg_size(b):
    if b[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            return None
        mk, ln = b[i + 1], int.from_bytes(b[i + 2:i + 4], "big")
        if mk in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(b[i + 7:i + 9], "big"), int.from_bytes(b[i + 5:i + 7], "big")
        i += 2 + ln
    return None


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "eval-dataset-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        final, ctype, b = r.geturl(), r.headers.get("Content-Type", ""), r.read()
    if "unavailable" in final or "jpeg" not in ctype:
        return None
    return b


def plan():
    ex_ids, ex_flickr = excluded()
    tm, trm = meta(os.path.join(TEST, "test-images-with-rotation.csv")), meta(os.path.join(TRAIN, "train-images-phonehand.csv"))
    P = positives()
    pos = [i for i in sorted(P, key=order) if P[i]["phoneLong"] < DESK_MAX and i not in ex_ids and ok_meta(trm.get(i))]
    neg = [i for i in sorted(negatives(), key=order) if i not in ex_ids and ok_meta(tm.get(i))]
    fid = lambda m: m["OriginalLandingURL"].rstrip("/").split("/")[-1]
    pos = [i for i in pos if fid(trm[i]) not in ex_flickr]
    neg = [i for i in neg if fid(tm[i]) not in ex_flickr]
    return ex_ids, ex_flickr, P, pos, neg, tm, trm


def main():
    ex_ids, ex_flickr, P, pos, neg, tm, trm = plan()
    print(f"excluded ids {len(ex_ids)}, excluded Flickr photos {len(ex_flickr)}; train phone-in-hand {len(P)}; "
          f"eligible desk-size positives {len(pos)}; eligible negatives {len(neg)}")
    if "--download" not in sys.argv:
        return
    os.makedirs(IMG, exist_ok=True)
    locked_sha = {json.loads(l)["sha256"] for l in open(os.path.join(H, "evals", "examlab-phone", "manifest.jsonl"))}
    man, att, lab, total, skipped = [], [], [], 0, defaultdict(int)
    for group, ids, want, md in (("pos", pos, N_POS, trm), ("neg", neg, N_NEG, tm)):
        got, gbytes = 0, 0
        for i in ids:
            if got >= want or gbytes >= BUDGET[group]:
                break
            m = md[i]
            url = m["Thumbnail300KURL"].replace("_z.jpg", "_b.jpg")
            cached = os.path.join(IMG, i + ".jpg")
            try:
                b = open(cached, "rb").read() if os.path.exists(cached) else fetch(url)
            except Exception as e:  # noqa: BLE001
                b, _ = None, e
            if not b:
                skipped["unavailable"] += 1
                continue
            wh = jpeg_size(b)
            if not wh:
                skipped["not a baseline/progressive JPEG"] += 1
                continue
            sha = hashlib.sha256(b).hexdigest()
            if sha in locked_sha:
                skipped["sha256 equals a locked image"] += 1
                continue
            open(os.path.join(IMG, i + ".jpg"), "wb").write(b)
            total += len(b)
            gbytes += len(b)
            got += 1
            r = {"id": i, "file": i + ".jpg", "sha256": sha, "w": wh[0], "h": wh[1], "label": group,
                 "split": "train" if group == "pos" else "test", "pool": "TT" if group == "pos" else "TN"}
            if group == "pos":
                r["phones"] = [[round(v, 5) for v in p] for p in P[i]["phones"]]
                r["phoneLong"] = round(P[i]["phoneLong"], 4)
            else:
                r["phones"], r["phoneLong"] = [], 0
            man.append(r)
            lab.append((i, group, "dataset boxes: phone box overlaps a hand or person box" if group == "pos" else "dataset boxes: no phone / telephone / tablet box or label; person and table boxes"))
            att.append((i, m["OriginalURL"], m["OriginalLandingURL"], m["Author"], m["AuthorProfileURL"], m["License"], m["Title"]))
            time.sleep(0.15)
        print(f"{group}: {got} downloaded, {gbytes} bytes")
    with open(os.path.join(OUT, "manifest.jsonl"), "w", encoding="utf8") as f:
        for r in man:
            f.write(json.dumps(r, separators=(",", ":"), ensure_ascii=False) + "\n")
    with open(os.path.join(OUT, "labels.csv"), "w", encoding="utf8", newline="") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(["id", "label", "note"]); w.writerows(lab)
    with open(os.path.join(OUT, "ATTRIBUTION.csv"), "w", encoding="utf8", newline="") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(["image_id", "original_url", "landing_url", "author", "author_url", "licence", "title"]); w.writerows(att)
    print(f"images {len(man)}, bytes {total} ({total / 1048576:.1f} MB); skipped {dict(skipped)}")


if __name__ == "__main__":
    main()

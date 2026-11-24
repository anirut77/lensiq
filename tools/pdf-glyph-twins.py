#!/usr/bin/env python3
"""tools/pdf-glyph-twins.py -- glyph twins of the CI CJK font, for comparing text read back from a PDF (test use only).

Coordinator decision 3 (2026-11-17, print-report): Chrome's PDF writes, for a glyph that several code points share, the
lowest of them (measured: en dash U+2013 -> U+2012, 户 U+6237 -> U+6236, 页 U+9875 -> U+2EDA). The paper shows the right
character; only text read back from the PDF differs. Tests compare read-back text after mapping every code point of a
shared-glyph group to one representative (the highest code point of the group). This never changes what the product prints.

Input: the exact fonts-noto-cjk .deb that CI installs (its sha256 must equal the line in tools/ci-fonts.lock), unpacked.
Every face of every .ttc in it (Sans and Serif, Regular and Bold) is read; groups are joined across faces.
Output: tests/e2e/pdf-glyph-twins.json = {"source": {...deb file name and sha256...}, "map": {"2012": "2013", ...}}.
The e2e kit refuses to run when the sha256 in the JSON differs from tools/ci-fonts.lock (a new font = regenerate).

  python3 tools/pdf-glyph-twins.py <path to fonts-noto-cjk .deb> <folder where its data.tar was unpacked>
Needs fontTools (pip install fonttools). Docs: docs/FORTUNE-PRINT-REPORT.md.
"""
import glob
import hashlib
import json
import os
import sys

from fontTools.ttLib import TTCollection

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(deb, unpacked):
    name = os.path.basename(deb)
    sha = hashlib.sha256(open(deb, "rb").read()).hexdigest()
    lock = {}
    for line in open(os.path.join(ROOT, "tools", "ci-fonts.lock"), encoding="utf-8"):
        p = line.split()
        if len(p) >= 2 and len(p[0]) == 64 and not line.startswith("#"):
            lock[p[1]] = p[0]
    if lock.get(name) != sha:
        sys.exit("pdf-glyph-twins: %s sha256 %s is not the one in tools/ci-fonts.lock (%s)" % (name, sha, lock.get(name)))
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    files = sorted(glob.glob(os.path.join(unpacked, "usr", "share", "fonts", "**", "*.tt[cf]"), recursive=True))
    if not files:
        sys.exit("pdf-glyph-twins: no .ttc / .ttf under " + unpacked)
    faces = 0
    for f in files:
        for font in TTCollection(f).fonts:
            faces += 1
            by_glyph = {}
            for cp, g in font.getBestCmap().items():
                by_glyph.setdefault(g, []).append(cp)
            for cps in by_glyph.values():
                for c in cps[1:]:
                    a, b = find(cps[0]), find(c)
                    if a != b:
                        parent[a] = b
    groups = {}
    for c in list(parent):
        groups.setdefault(find(c), []).append(c)
    out = {}
    for cps in groups.values():
        if len(cps) < 2:
            continue
        rep = max(cps)
        for c in cps:
            if c != rep:
                out["%04X" % c] = "%04X" % rep
    data = {"source": {"package": name, "sha256": sha, "files": [os.path.relpath(f, unpacked) for f in files], "faces": faces,
                       "rule": "every code point of a shared-glyph group -> the highest code point of the group"},
            "map": dict(sorted(out.items(), key=lambda kv: int(kv[0], 16)))}
    dest = os.path.join(ROOT, "tests", "e2e", "pdf-glyph-twins.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=True, separators=(",", ":"))
        fh.write("\n")
    print("pdf-glyph-twins: %d code points in %d groups from %d faces -> %s" % (len(out), sum(1 for g in groups.values() if len(g) > 1), faces, dest))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

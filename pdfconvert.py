"""PDF -> DOCX สำหรับ /api/convert — ค่าเริ่มต้นใช้เฉพาะไลบรารีสัญญาอนุญาตแบบ permissive (ใช้เชิงพาณิชย์ได้)

เอนจิน (เลือกด้วย LENSIQ_CONVERT_ENGINE):
  "permissive" (ค่าเริ่ม)  pdfplumber (MIT) + pdfminer.six (MIT) + pypdfium2 (BSD-3/Apache-2.0) อ่าน PDF,
                           python-docx (MIT) เขียน DOCX — ข้อความ, หัวข้อ (จากขนาดฟอนต์), ตัวหนา/เอียง, ตาราง, ตัวแบ่งหน้า
                           ไม่คงตำแหน่งแบบพิกเซลและไม่ดึงรูปภาพ (ข้อจำกัดที่ยอมรับเพื่อสัญญาอนุญาตที่ใช้ขายได้)
  "pdf2docx"  (opt-in)     pdf2docx (GPL-3.0) + PyMuPDF (AGPL-3.0 / ไลเซนส์เชิงพาณิชย์จาก Artifex) — คงเลย์เอาต์ดีกว่า
                           แต่ถ้าเปิดให้บุคคลอื่นใช้ผ่านเครือข่าย AGPL บังคับให้เปิดซอร์สทั้งบริการ
                           ต้องติดตั้งแยก: pip install -r requirements-agpl.txt และตั้ง LENSIQ_CONVERT_ENGINE=pdf2docx
                           (เซิร์ฟเวอร์จะเขียนคำเตือนลง log ตอนเริ่ม) — ดู LICENSES/THIRD_PARTY.md
English: the default engine is permissive-licensed only; the AGPL/GPL layout-preserving engine is opt-in.
"""
import logging
import os
import statistics

log = logging.getLogger("lensiq.convert")

ENGINES = ("permissive", "pdf2docx")
LICENSES = {
    "permissive": "MIT / BSD-3-Clause / Apache-2.0 (pdfplumber, pdfminer.six, pypdfium2, python-docx)",
    "pdf2docx": "GPL-3.0 (pdf2docx) + AGPL-3.0 (PyMuPDF) — not for closed-source network services without an Artifex licence",
}


class ConvertError(Exception):
    """ข้อความที่แสดงผู้ใช้ได้"""


def engine():
    e = os.environ.get("LENSIQ_CONVERT_ENGINE", "permissive").strip().lower() or "permissive"
    return e if e in ENGINES else "permissive"


def status():
    e = engine()
    return {"engine": e, "license": LICENSES[e], "copyleft": e == "pdf2docx", "available": available(e)}


def available(e=None):
    e = e or engine()
    try:
        if e == "pdf2docx":
            import pdf2docx  # noqa: F401
            import fitz  # noqa: F401
        else:
            import pdfplumber  # noqa: F401
            import docx  # noqa: F401
        return True
    except ImportError:
        return False


def convert(src, dst, tmp):
    """แปลง src (PDF) -> dst (DOCX) ด้วยเอนจินที่ตั้งไว้ ; tmp = โฟลเดอร์ชั่วคราวของคำขอ"""
    if engine() == "pdf2docx":
        return _convert_pdf2docx(src, dst, tmp)
    return convert_permissive(src, dst)


# ---------------------------------------------------------------------------
# permissive engine
# ---------------------------------------------------------------------------
MAX_PAGES = 300


def _inside(word, boxes):
    cx = (word["x0"] + word["x1"]) / 2
    cy = (word["top"] + word["bottom"]) / 2
    return any(b[0] - 1 <= cx <= b[2] + 1 and b[1] - 1 <= cy <= b[3] + 1 for b in boxes)


def _lines(words, tol=3.0):
    """จัดคำเป็นบรรทัดตามแนวตั้ง (top ใกล้กัน) แล้วเรียงซ้าย -> ขวา"""
    rows = []
    for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"])):
        if rows and abs(rows[-1]["top"] - w["top"]) <= tol:
            rows[-1]["words"].append(w)
            rows[-1]["bottom"] = max(rows[-1]["bottom"], w["bottom"])
        else:
            rows.append({"top": w["top"], "bottom": w["bottom"], "words": [w]})
    for r in rows:
        r["words"].sort(key=lambda w: w["x0"])
        r["size"] = max(w.get("size") or 0 for w in r["words"])
        names = [str(w.get("fontname") or "") for w in r["words"]]
        r["bold"] = bool(names) and all(("Bold" in n or "Black" in n or "Heavy" in n) for n in names)
        r["italic"] = bool(names) and all(("Italic" in n or "Oblique" in n) for n in names)
        parts, prev = [], None
        for w in r["words"]:
            if prev is not None and w["x0"] - prev > 1.0:
                parts.append(" ")
            parts.append(w["text"])
            prev = w["x1"]
        r["text"] = "".join(parts)
    return rows


def _paragraphs(rows):
    """รวมบรรทัดที่อยู่ชิดกันและขนาดฟอนต์เท่ากันเป็นย่อหน้า"""
    paras = []
    for r in rows:
        height = max(r["bottom"] - r["top"], 1.0)
        if paras:
            p = paras[-1]
            gap = r["top"] - p["bottom"]
            if gap < 0.8 * height and abs(p["size"] - r["size"]) < 0.6 and p["bold"] == r["bold"]:
                # ภาษาไทยไม่เว้นวรรคระหว่างคำ: ต่อบรรทัดโดยไม่ใส่ช่องว่างเมื่อทั้งสองฝั่งเป็นอักษรไทย
                joiner = "" if _thai(p["text"][-1:]) and _thai(r["text"][:1]) else " "
                p["text"] += joiner + r["text"]
                p["bottom"] = r["bottom"]
                continue
        paras.append(dict(r))
    return paras


def _thai(ch):
    return bool(ch) and "฀" <= ch <= "๿"


def _table_rows(table):
    rows = table.extract() or []
    return [[(c or "").strip() for c in row] for row in rows if row and any((c or "").strip() for c in row)]


def convert_permissive(src, dst):
    try:
        import pdfplumber
        from docx import Document
        from docx.shared import Pt
    except ImportError as e:  # pragma: no cover - deployment error
        raise ConvertError("เซิร์ฟเวอร์ยังไม่ได้ติดตั้งตัวแปลง PDF") from e
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Tahoma"
    style.font.size = Pt(11)
    with pdfplumber.open(src) as pdf:
        if len(pdf.pages) > MAX_PAGES:
            raise ConvertError(f"ไฟล์ยาวเกิน {MAX_PAGES} หน้า")
        sizes = []
        for page in pdf.pages[:20]:
            sizes += [c.get("size") or 0 for c in page.chars[:4000]]
        body = statistics.median(sizes) if sizes else 11.0
        any_text = False
        for i, page in enumerate(pdf.pages):
            if i:
                doc.add_page_break()
            tables = page.find_tables()
            boxes = [t.bbox for t in tables]
            words = page.extract_words(extra_attrs=["size", "fontname"], keep_blank_chars=False, use_text_flow=False)
            words = [w for w in words if not _inside(w, boxes)]
            blocks = [("p", p["top"], p) for p in _paragraphs(_lines(words))]
            blocks += [("t", t.bbox[1], t) for t in tables]
            for kind, _, obj in sorted(blocks, key=lambda b: b[1]):
                if kind == "t":
                    rows = _table_rows(obj)
                    if not rows:
                        continue
                    ncol = max(len(r) for r in rows)
                    tbl = doc.add_table(rows=len(rows), cols=ncol)
                    tbl.style = "Table Grid"
                    for ri, row in enumerate(rows):
                        for ci, val in enumerate(row):
                            tbl.cell(ri, ci).text = val
                    any_text = True
                    continue
                text = obj["text"].strip()
                if not text:
                    continue
                any_text = True
                ratio = (obj["size"] or body) / (body or 1)
                if ratio >= 1.6 and len(text) <= 200:
                    doc.add_heading(text, level=1)
                elif ratio >= 1.25 and len(text) <= 200:
                    doc.add_heading(text, level=2)
                else:
                    para = doc.add_paragraph()
                    run = para.add_run(text)
                    run.bold = obj["bold"] or None
                    run.italic = obj["italic"] or None
        if not any_text:
            doc.add_paragraph("(ไม่พบข้อความใน PDF นี้ — อาจเป็นไฟล์สแกน ต้องใช้ OCR / no text layer: scanned PDF)")
    doc.save(dst)


# ---------------------------------------------------------------------------
# opt-in copyleft engine (AGPL / GPL) — imported lazily, never on the default path
# ---------------------------------------------------------------------------
_patched = False


def _convert_pdf2docx(src, dst, tmp):
    global _patched
    try:
        import fitz
        from pdf2docx import Converter
        from pdf2docx.font.Fonts import Fonts
    except ImportError as e:
        raise ConvertError("ยังไม่ได้ติดตั้งเอนจิน pdf2docx (pip install -r requirements-agpl.txt)") from e
    if not _patched:
        # PDF บางไฟล์อ้างอิงฟอนต์ที่ไม่มีอยู่จริง (เช่น "0 0 R") ทำให้ pdf2docx ล้มทั้งไฟล์ -> ข้ามฟอนต์ที่อ่านไม่ได้
        orig = Fonts.extract.__func__

        class _SafeDoc:
            def __init__(self, doc): self.doc = doc
            def __iter__(self): return iter(self.doc)

            def extract_font(self, xref):
                try:
                    return self.doc.extract_font(xref)
                except Exception:
                    return ("", "n/a", "", b"")
        Fonts.extract = classmethod(lambda cls, doc: orig(cls, _SafeDoc(doc)))
        _patched = True

    def run(path):
        cv = Converter(path)
        try:
            cv.convert(dst)
        finally:
            cv.close()
    try:
        run(src)
    except Exception as e:  # ไม่ log เนื้อหาไฟล์/เส้นทาง — เฉพาะชนิดข้อผิดพลาด
        log.info("convert: first pass failed (%s), repairing", type(e).__name__)
        fixed = os.path.join(tmp, "fixed.pdf")
        doc = fitz.open(src)
        if doc.needs_pass:
            raise
        doc.save(fixed, garbage=4, clean=True, deflate=True)
        doc.close()
        run(fixed)


def startup_warning():
    """เรียกครั้งเดียวตอนเริ่มเซิร์ฟเวอร์ — เตือนเมื่อเปิดเอนจิน copyleft"""
    if engine() == "pdf2docx":
        log.warning("LENSIQ_CONVERT_ENGINE=pdf2docx: /api/convert uses PyMuPDF (AGPL-3.0) + pdf2docx (GPL-3.0). "
                    "Offering it to third parties over a network requires releasing the complete service source "
                    "under AGPL-3.0 or buying an Artifex commercial licence. See LICENSES/THIRD_PARTY.md.")

"""Commercial-licence safety of the server path.

- /api/convert default engine is permissive (pdfplumber + python-docx, MIT) and really converts a PDF (heading, bold,
  table, page break); the AGPL/GPL engine (PyMuPDF + pdf2docx) is opt-in only and never imported by default.
- requirements.txt contains no copyleft package; requirements-agpl.txt holds them.
- /api/tryon is off unless a model AND a licence attestation are configured; known CC BY-NC-SA models (IDM-VTON …)
  cannot be enabled as "commercial".

Run:  .venv/bin/python -m unittest discover -s tests/python -v
"""
import io
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import pdfconvert  # noqa: E402
import server  # noqa: E402
import tryon  # noqa: E402

LAN = {"REMOTE_ADDR": "192.168.1.23"}
ENV = ("LENSIQ_CONVERT_ENGINE", "REPLICATE_API_TOKEN", "REPLICATE_TRYON_MODEL", "REPLICATE_TRYON_VERSION",
       "LENSIQ_TRYON_LICENSE", "LENSIQ_TRYON_INPUT", "LENSIQ_TRYON_EXTRA")


def make_pdf():
    """Minimal 2-page PDF: big title, bold line, body text, a 2x2 ruled table on page 1; text on page 2."""
    def text(x, y, font, size, s):
        return f"BT /{font} {size} Tf {x} {y} Td ({s}) Tj ET\n"
    p1 = text(72, 740, "F2", 28, "Quarterly Report")
    p1 += text(72, 700, "F2", 11, "Summary in bold")
    p1 += text(72, 680, "F1", 11, "Visitors increased compared with last month.")
    p1 += text(72, 666, "F1", 11, "The second line belongs to the same paragraph.")
    # table: outer box + grid (x 72..372, y 500..560), cells 150 x 30
    p1 += "0.5 w 72 500 300 60 re S 222 500 m 222 560 l S 72 530 m 372 530 l S\n"
    p1 += text(80, 540, "F1", 11, "Store") + text(230, 540, "F1", 11, "Visits")
    p1 += text(80, 510, "F1", 11, "Siam") + text(230, 510, "F1", 11, "1234")
    p2 = text(72, 740, "F1", 11, "Page two text.")
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 5 0 R /Contents 6 0 R >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 5 0 R /Contents 7 0 R >>",
        "<< /Font << /F1 8 0 R /F2 9 0 R >> >>",
        f"<< /Length {len(p1)} >>\nstream\n{p1}endstream",
        f"<< /Length {len(p2)} >>\nstream\n{p2}endstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offs).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


class EnvBase(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.get(k) for k in ENV}
        for k in ENV:
            os.environ.pop(k, None)
        server._api_rl.clear()
        self.c = server.app.test_client()

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


class ConvertEngineTest(EnvBase):
    def test_default_engine_is_permissive(self):
        self.assertEqual(pdfconvert.engine(), "permissive")
        st = self.c.get("/api/convert/status", environ_base=LAN).get_json()
        self.assertEqual(st["engine"], "permissive")
        self.assertFalse(st["copyleft"])
        self.assertTrue(st["available"])
        os.environ["LENSIQ_CONVERT_ENGINE"] = "nonsense"
        self.assertEqual(pdfconvert.engine(), "permissive", "unknown value falls back to permissive")

    def test_default_path_never_imports_copyleft_modules(self):
        code = ("import sys; sys.path.insert(0, %r); import server, io;"
                "c = server.app.test_client();"
                "r = c.post('/api/convert', data={'file': (io.BytesIO(%r), 'a.pdf')}, content_type='multipart/form-data',"
                " environ_base={'REMOTE_ADDR': '127.0.0.1'});"
                "assert r.status_code == 200, r.data;"
                "bad = [m for m in ('fitz', 'pymupdf', 'pdf2docx') if m in sys.modules]; assert not bad, bad;"
                "print('ok')") % (ROOT, make_pdf())
        env = {k: v for k, v in os.environ.items() if k != "LENSIQ_CONVERT_ENGINE"}
        out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr[-2000:])
        self.assertIn("ok", out.stdout)

    def test_permissive_conversion_keeps_structure(self):
        from docx import Document
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = os.path.join(tmp, "a.pdf"), os.path.join(tmp, "a.docx")
            with open(src, "wb") as fh:
                fh.write(make_pdf())
            pdfconvert.convert(src, dst, tmp)
            self.assertTrue(zipfile.is_zipfile(dst))
            d = Document(dst)
        paras = [(p.style.name, p.text) for p in d.paragraphs if p.text.strip()]
        self.assertEqual(paras[0], ("Heading 1", "Quarterly Report"), paras)
        bold = [p for p in d.paragraphs if p.text == "Summary in bold"]
        self.assertTrue(bold and bold[0].runs[0].bold, "bold run kept")
        self.assertIn("Visitors increased compared with last month. The second line belongs to the same paragraph.",
                      [p.text for p in d.paragraphs], "consecutive lines joined into one paragraph")
        self.assertEqual(len(d.tables), 1)
        cells = [[c.text for c in r.cells] for r in d.tables[0].rows]
        self.assertEqual(cells, [["Store", "Visits"], ["Siam", "1234"]])
        texts = [p.text for p in d.paragraphs]
        self.assertNotIn("Store", " ".join(texts), "table text not duplicated as paragraphs")
        self.assertIn("Page two text.", texts)
        body = d.element.body.xml
        self.assertIn('w:type="page"', body, "page break between pages")

    def test_thai_lines_join_without_space(self):
        rows = [{"top": 0, "bottom": 10, "size": 11, "bold": False, "italic": False, "text": "สวัสดี"},
                {"top": 12, "bottom": 22, "size": 11, "bold": False, "italic": False, "text": "ครับ"}]
        self.assertEqual(pdfconvert._paragraphs(rows)[0]["text"], "สวัสดีครับ")

    def test_api_end_to_end_and_garbage(self):
        r = self.c.post("/api/convert", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                        content_type="multipart/form-data", environ_base=LAN)
        self.assertEqual(r.status_code, 200, r.data[:200])
        self.assertEqual(r.data[:2], b"PK")
        r = self.c.post("/api/convert", data={"file": (io.BytesIO(b"%PDF-1.4 garbage"), "a.pdf")},
                        content_type="multipart/form-data", environ_base=LAN)
        self.assertEqual(r.status_code, 422)
        self.assertNotIn(b"Traceback", r.data)

    def test_agpl_engine_is_opt_in_and_reports_copyleft(self):
        os.environ["LENSIQ_CONVERT_ENGINE"] = "pdf2docx"
        st = pdfconvert.status()
        self.assertEqual(st["engine"], "pdf2docx")
        self.assertTrue(st["copyleft"])
        self.assertIn("AGPL", st["license"])
        with self.assertLogs("lensiq.convert", "WARNING") as cm:
            pdfconvert.startup_warning()
        self.assertIn("AGPL", "".join(cm.output))
        with mock.patch.dict(sys.modules, {"fitz": None}):
            with self.assertRaises(pdfconvert.ConvertError):
                pdfconvert.convert("x.pdf", "y.docx", ".")


class RequirementsLicenceTest(unittest.TestCase):
    COPYLEFT = {"pymupdf", "pdf2docx", "fitz", "pymupdfb"}

    def names(self, f):
        with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
            return {ln.split("#")[0].split("==")[0].strip().lower() for ln in fh if ln.split("#")[0].strip()}

    def test_default_requirements_have_no_copyleft(self):
        names = self.names("requirements.txt")
        self.assertFalse(names & self.COPYLEFT, names & self.COPYLEFT)
        for direct in ("pdfplumber", "python-docx", "pdfminer.six", "pypdfium2"):
            self.assertIn(direct, names)

    def test_agpl_requirements_are_separate(self):
        self.assertTrue({"pymupdf", "pdf2docx"} <= self.names("requirements-agpl.txt"))

    def test_third_party_doc_mentions_engine_switch(self):
        with open(os.path.join(ROOT, "LICENSES", "THIRD_PARTY.md"), encoding="utf-8") as fh:
            doc = fh.read()
        self.assertIn("LENSIQ_CONVERT_ENGINE", doc)
        self.assertIn("LENSIQ_TRYON_LICENSE", doc)


class TryOnLicenceTest(EnvBase):
    def st(self):
        return self.c.get("/api/tryon/status", environ_base=LAN).get_json()

    def test_off_by_default_even_with_token(self):
        self.assertEqual(self.st()["reason"], "no-token")
        os.environ["REPLICATE_API_TOKEN"] = "r8_x"
        st = self.st()
        self.assertFalse(st["enabled"])
        self.assertEqual(st["reason"], "no-model", "no default model any more (was IDM-VTON, CC BY-NC-SA)")
        self.assertIsNone(st["model"])
        os.environ["REPLICATE_TRYON_MODEL"] = "acme/vton-pro"
        self.assertEqual(self.st()["reason"], "license-not-attested")
        os.environ["LENSIQ_TRYON_LICENSE"] = "yes"
        self.assertEqual(self.st()["reason"], "license-not-attested", "only exact values count")

    def test_commercial_model_enabled_only_with_attestation(self):
        os.environ.update(REPLICATE_API_TOKEN="r8_x", REPLICATE_TRYON_MODEL="acme/vton-pro", LENSIQ_TRYON_LICENSE="commercial")
        st = self.st()
        self.assertTrue(st["enabled"])
        self.assertFalse(st["noncommercial"])
        self.assertNotIn("r8_x", str(st), "token never in status")

    def test_known_noncommercial_models_refused_as_commercial(self):
        os.environ.update(REPLICATE_API_TOKEN="r8_x", LENSIQ_TRYON_LICENSE="commercial")
        for m in ("cuuupid/idm-vton", "viktorfa/oot_diffusion", "someone/CatVTON", "x/stableviton-v2", "y/leffa"):
            os.environ["REPLICATE_TRYON_MODEL"] = m
            st = self.st()
            self.assertFalse(st["enabled"], m)
            self.assertEqual(st["reason"], "model-is-noncommercial", m)
        r = self.c.post("/api/tryon", data={"human": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "h.png"),
                                            "garment": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "g.png"), "consent": "yes"},
                        content_type="multipart/form-data", environ_base=LAN)
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.get_json()["reason"], "model-is-noncommercial")
        with self.assertRaises(tryon.TryOnError) as cm:
            tryon.run(b"h", b"g")
        self.assertEqual(cm.exception.status, 503)

    def test_noncommercial_demo_mode_is_explicit_and_flagged(self):
        os.environ.update(REPLICATE_API_TOKEN="r8_x", REPLICATE_TRYON_MODEL="cuuupid/idm-vton",
                          LENSIQ_TRYON_LICENSE="noncommercial-demo")
        st = self.st()
        self.assertTrue(st["enabled"])
        self.assertTrue(st["noncommercial"])
        with self.assertLogs("lensiq.tryon", "WARNING") as cm:
            tryon.startup_warning()
        self.assertIn("NON-COMMERCIAL", "".join(cm.output))

    def test_input_field_mapping(self):
        os.environ["LENSIQ_TRYON_INPUT"] = '{"human":"model_image","garment":"garment_image","desc":"prompt","evil":"x"}'
        os.environ["LENSIQ_TRYON_EXTRA"] = '{"mode":"quality","nested":{"no":1}}'
        inp = tryon.build_input(b"h", b"g", "shirt")
        self.assertEqual(set(inp), {"model_image", "garment_image", "prompt", "mode"})
        self.assertTrue(inp["model_image"].startswith("data:image/png;base64,"))
        os.environ["LENSIQ_TRYON_INPUT"] = "not json"
        os.environ.pop("LENSIQ_TRYON_EXTRA")
        self.assertIn("human_img", tryon.build_input(b"h", b"g", ""))


if __name__ == "__main__":
    unittest.main()

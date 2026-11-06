"""server.py / tryon.py hardening: static deny list, JSON errors without internals, provider detail never leaked,
token only sent to api.replicate.com, https-only result URLs, bad env values never cause 500, pinned requirements.

Run:  .venv/bin/python -m unittest discover -s tests/python -v
"""
import os
import re
import sys
import unittest
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import server  # noqa: E402
import tryon  # noqa: E402

LAN = {"REMOTE_ADDR": "192.168.1.23"}
ENV_KEYS = ("LENSIQ_FORTUNE_RPM", "LENSIQ_FORTUNE_DAILY_MAX", "LENSIQ_AGG_RPM", "ANTHROPIC_API_KEY",
            "ANTHROPIC_AUTH_TOKEN", "REPLICATE_API_TOKEN", "REPLICATE_TRYON_VERSION", "REPLICATE_TRYON_MODEL",
            "LENSIQ_TRYON_LICENSE")


class Base(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.get(k) for k in ENV_KEYS}
        for k in ENV_KEYS:
            os.environ.pop(k, None)
        server._api_rl.clear()
        server._rl_hits.clear()
        server._agg_rl.clear()
        server._agg_fail.clear()
        self.c = server.app.test_client()

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


class StaticDenyTest(Base):
    def test_sensitive_paths_not_served(self):
        for p in ("/server.py", "/tryon.py", "/pdfconvert.py", "/requirements.txt", "/requirements-agpl.txt", "/start.sh", "/tools/csp-meta.mjs",
                  "/package.json", "/eslint.config.mjs", "/node_modules/x.js", "/tests/README.md",
                  "/.github/workflows/ci.yml", "/.git/config", "/.venv/pyvenv.cfg", "/certs/key.pem",
                  "/logs/server.log", "/data/agg.json", "/Data/agg.json", "/vendor/../server.py",
                  "/x.pem", "/foo.log", "/a/.env"):
            r = self.c.get(p)
            self.assertEqual(r.status_code, 404, p)
            self.assertNotIn(b"import ", r.data, p)
            r.close()

    def test_pages_and_assets_still_served(self):
        for p in ("/", "/index.html", "/styles.css", "/nav.js", "/lensiq-facevault.js"):
            r = self.c.get(p)
            self.assertEqual(r.status_code, 200, p)
            r.close()

    def test_headers_on_static_and_errors(self):
        for p in ("/index.html", "/nope.html", "/server.py"):
            r = self.c.get(p)
            self.assertEqual(r.headers.get("Cross-Origin-Resource-Policy"), "same-origin", p)
            self.assertEqual(r.headers.get("X-Content-Type-Options"), "nosniff", p)
            self.assertIn("frame-ancestors 'self'", r.headers.get("Content-Security-Policy", ""), p)
            r.close()


class ErrorLeakTest(Base):
    def test_api_404_405_json_without_internals(self):
        r = self.c.get("/api/nope", environ_base=LAN)
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.get_json(), {"error": "ไม่พบ"})
        r = self.c.put("/api/agg/join", environ_base=LAN)
        self.assertEqual(r.status_code, 405)
        self.assertIn("error", r.get_json())

    def test_unhandled_exception_is_generic(self):
        server.app.config["PROPAGATE_EXCEPTIONS"] = False
        with mock.patch.object(server, "fortune_enabled", side_effect=RuntimeError("SECRET-sk-ant-123 /Users/x")):
            r = self.c.get("/api/fortune/status", environ_base=LAN)
        self.assertEqual(r.status_code, 500)
        self.assertNotIn(b"SECRET", r.data)
        self.assertNotIn(b"Traceback", r.data)
        self.assertEqual(r.get_json().get("fallback"), True)

    def test_convert_failure_does_not_echo_exception(self):
        import io
        with mock.patch.object(server, "convert_with_repair", side_effect=ValueError("/private/tmp/secret-path boom")):
            r = self.c.post("/api/convert", data={"file": (io.BytesIO(b"%PDF-1.4 x"), "a.pdf")},
                            content_type="multipart/form-data", environ_base=LAN)
        self.assertEqual(r.status_code, 422)
        self.assertNotIn(b"secret-path", r.data)

    def test_tryon_provider_detail_not_returned(self):
        import io
        os.environ.update(REPLICATE_API_TOKEN="r8_test", REPLICATE_TRYON_MODEL="acme/vton-pro", LENSIQ_TRYON_LICENSE="commercial")
        png = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
        err = tryon.TryOnError("บริการ AI ขัดข้องชั่วคราว", 502, detail="HTTP 500: internal stack r8_leak")
        with mock.patch.object(tryon, "run", side_effect=err):
            r = self.c.post("/api/tryon", data={"human": (io.BytesIO(png), "h.png"), "garment": (io.BytesIO(png), "g.png"),
                                                "consent": "yes"}, content_type="multipart/form-data", environ_base=LAN)
        self.assertEqual(r.status_code, 502)
        self.assertNotIn(b"r8_leak", r.data)
        self.assertNotIn(b"HTTP 500", r.data)

    def test_bad_env_values_fall_back_to_defaults(self):
        os.environ["LENSIQ_FORTUNE_RPM"] = "ten"
        os.environ["LENSIQ_FORTUNE_DAILY_MAX"] = ""
        self.assertIsNone(server._rate_limited("1.2.3.4"))
        os.environ["LENSIQ_AGG_RPM"] = "x"
        with server.app.test_request_context("/api/agg/status", environ_base=LAN):
            self.assertIsNone(server._agg_rate_limited("192.168.1.23"))


class TryOnUrlTest(unittest.TestCase):
    KEYS = ("REPLICATE_API_TOKEN", "REPLICATE_TRYON_VERSION", "REPLICATE_TRYON_MODEL", "LENSIQ_TRYON_LICENSE")

    def setUp(self):
        self.saved = {k: os.environ.get(k) for k in self.KEYS}
        os.environ.update(REPLICATE_API_TOKEN="r8_secret", REPLICATE_TRYON_VERSION="v1",
                          REPLICATE_TRYON_MODEL="acme/vton-pro", LENSIQ_TRYON_LICENSE="commercial")

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def test_token_never_sent_to_foreign_poll_url(self):
        calls = []

        def fake_req(method, url, token, body=None, extra_headers=None):
            calls.append(url)
            return {"status": "starting", "urls": {"get": "https://evil.example/steal"}}
        with mock.patch.object(tryon, "_req", side_effect=fake_req):
            with self.assertRaises(tryon.TryOnError):
                tryon.run(b"h", b"g")
        self.assertTrue(all(u.startswith("https://api.replicate.com/") for u in calls), calls)

    def test_output_url_must_be_https(self):
        def fake_req(method, url, token, body=None, extra_headers=None):
            return {"status": "succeeded", "output": "file:///etc/passwd"}
        with mock.patch.object(tryon, "_req", side_effect=fake_req), \
                mock.patch("urllib.request.urlopen") as uo:
            with self.assertRaises(tryon.TryOnError) as cm:
                tryon.run(b"h", b"g")
        uo.assert_not_called()
        self.assertNotIn("passwd", str(cm.exception))

    def test_failed_prediction_detail_kept_out_of_message(self):
        def fake_req(method, url, token, body=None, extra_headers=None):
            return {"status": "failed", "error": "CUDA OOM at node gpu-17"}
        with mock.patch.object(tryon, "_req", side_effect=fake_req):
            with self.assertRaises(tryon.TryOnError) as cm:
                tryon.run(b"h", b"g")
        self.assertNotIn("CUDA", str(cm.exception))
        self.assertIn("CUDA", cm.exception.detail)


class PinningTest(unittest.TestCase):
    def test_requirements_are_exact_pins(self):
        with open(os.path.join(ROOT, "requirements.txt"), encoding="utf-8") as fh:
            lines = [ln.split("#")[0].strip() for ln in fh]
        reqs = [ln for ln in lines if ln]
        self.assertGreater(len(reqs), 10)
        for ln in reqs:
            self.assertRegex(ln, r"^[A-Za-z0-9_.\-]+==[0-9][0-9A-Za-z.\-]*( ; python_version [<>=]+ \"[0-9.]+\")?$", ln)
        names = {re.split("==", ln)[0].lower() for ln in reqs}
        for direct in ("flask", "pdfplumber", "python-docx", "anthropic", "werkzeug"):
            self.assertIn(direct, names)


if __name__ == "__main__":
    unittest.main()

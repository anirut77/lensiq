"""server.py shared API guard (/api/convert, /api/tryon, /api/fortune) + security headers.

Run:  .venv/bin/python -m unittest discover -s tests/python -v
No network: tryon.run / the Anthropic client / pdf conversion are stubbed.
"""
import io
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import server  # noqa: E402

LAN = {"REMOTE_ADDR": "192.168.1.23"}
WAN = {"REMOTE_ADDR": "8.8.8.8"}
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
ENV_KEYS = ("LENSIQ_API_ALLOW_ANY", "LENSIQ_API_ALLOW_ORIGIN", "LENSIQ_ALLOW_ORIGIN", "LENSIQ_HOSTS", "LENSIQ_AGG_HOSTS",
            "LENSIQ_TRUST_PROXY", "LENSIQ_PROXY_HOPS", "LENSIQ_API_RPM", "LENSIQ_CONVERT_RPM", "LENSIQ_TRYON_RPM",
            "LENSIQ_CONVERT_MAX_MB", "LENSIQ_TRYON_MAX_MB", "LENSIQ_CSP", "LENSIQ_CSP_CONNECT", "LENSIQ_FORTUNE_RPM",
            "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "REPLICATE_API_TOKEN")


def facts():
    return {"domain": "numbers", "topic": "overall",
            "items": [{"id": "a", "label": "คู่ความว่าง", "strength": 0.8, "meanings": {"work": ["ก้าวหน้า"]}}]}


class GuardBase(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.get(k) for k in ENV_KEYS}
        for k in ENV_KEYS:
            os.environ.pop(k, None)
        server._api_rl.clear()
        server._rl_hits.clear()
        self.c = server.app.test_client()

    def tearDown(self):
        for k, v in self.saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def convert(self, env=LAN, headers=None, data=None, **kw):
        data = data if data is not None else {"file": (io.BytesIO(b"%PDF-1.4 fake"), "a.pdf")}
        return self.c.post("/api/convert", data=data, content_type="multipart/form-data",
                           environ_base=env, headers=headers or {}, **kw)

    def tryon(self, env=LAN, headers=None, human=PNG, garment=PNG):
        os.environ["REPLICATE_API_TOKEN"] = "r8_test"
        data = {"human": (io.BytesIO(human), "h.png"), "garment": (io.BytesIO(garment), "g.png"),
                "consent": "yes", "desc": "เสื้อ<script>\x00"}
        return self.c.post("/api/tryon", data=data, content_type="multipart/form-data",
                           environ_base=env, headers=headers or {})

    def fortune(self, env=LAN, headers=None, **kw):
        os.environ["ANTHROPIC_API_KEY"] = "sk-test"
        return self.c.post("/api/fortune", json={"facts": facts(), "consent": False},
                           environ_base=env, headers=headers or {}, **kw)


class ConvertStub:
    """แทน pdf2docx: เขียนไฟล์ผลลัพธ์ปลอม"""
    def __call__(self, src, dst, tmp):
        with open(dst, "wb") as fh:
            fh.write(b"PK docx")


@mock.patch.object(server, "convert_with_repair", ConvertStub())
class RemoteAddressTest(GuardBase):
    def test_lan_and_loopback_allowed(self):
        self.assertEqual(self.convert().status_code, 200)
        self.assertEqual(self.convert(env={"REMOTE_ADDR": "127.0.0.1"}).status_code, 200)
        self.assertEqual(self.convert(env={"REMOTE_ADDR": "::1"}).status_code, 200)
        self.assertEqual(self.convert(env={"REMOTE_ADDR": "10.0.0.5"}).status_code, 200)

    def test_public_address_rejected_unless_opt_in(self):
        for path_call in (self.convert, self.tryon, self.fortune):
            r = path_call(env=WAN)
            self.assertEqual(r.status_code, 403, path_call.__name__)
        self.assertTrue(self.fortune(env=WAN).get_json()["fallback"], "fortune errors keep fallback flag")
        self.assertEqual(self.c.get("/api/fortune/status", environ_base=WAN).status_code, 403)
        self.assertEqual(self.c.get("/api/tryon/status", environ_base=WAN).status_code, 403)
        os.environ["LENSIQ_API_ALLOW_ANY"] = "1"
        self.assertEqual(self.convert(env=WAN).status_code, 200)
        self.assertEqual(self.c.get("/api/fortune/status", environ_base=WAN).status_code, 200)

    def test_trust_proxy_uses_forwarded_ip(self):
        os.environ["LENSIQ_TRUST_PROXY"] = "1"
        proxy = {"REMOTE_ADDR": "10.1.1.1"}
        r = self.convert(env=proxy, headers={"X-Forwarded-For": "8.8.8.8"})
        self.assertEqual(r.status_code, 403, "public client behind proxy is not LAN")
        # ปลอม XFF ด้านซ้ายไม่ได้: ใช้ค่าขวาสุดที่ proxy ใส่เอง
        r = self.convert(env=proxy, headers={"X-Forwarded-For": "192.168.0.9, 8.8.8.8"})
        self.assertEqual(r.status_code, 403)
        os.environ["LENSIQ_PROXY_HOPS"] = "2"
        r = self.convert(env=proxy, headers={"X-Forwarded-For": "192.168.0.9, 8.8.8.8"})
        self.assertEqual(r.status_code, 200)


@mock.patch.object(server, "convert_with_repair", ConvertStub())
class HostOriginTest(GuardBase):
    def test_host_dns_rebinding(self):
        self.assertEqual(self.convert(headers={"Host": "evil.example"}).status_code, 403)
        self.assertEqual(self.fortune(headers={"Host": "evil.example"}).status_code, 403)
        self.assertEqual(self.convert(headers={"Host": "192.168.1.20:8443"}).status_code, 200)
        self.assertEqual(self.convert(headers={"Host": "shop.local"}).status_code, 200)
        self.assertEqual(self.convert(headers={"Host": "[::1]:8000"}).status_code, 200)
        os.environ["LENSIQ_HOSTS"] = "api.example.com"
        self.assertEqual(self.convert(headers={"Host": "api.example.com"}).status_code, 200)
        os.environ.pop("LENSIQ_HOSTS")
        os.environ["LENSIQ_AGG_HOSTS"] = "api.example.com"  # ตัวแปรเดิมยังใช้ได้
        self.assertEqual(self.convert(headers={"Host": "api.example.com"}).status_code, 200)

    def test_origin_csrf(self):
        self.assertEqual(self.convert(headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertEqual(self.convert(headers={"Origin": "null"}).status_code, 403)
        self.assertEqual(self.convert(headers={"Origin": "http://localhost"}).status_code, 200, "same origin")
        self.assertEqual(self.convert(headers={"Sec-Fetch-Site": "cross-site"}).status_code, 403)
        self.assertEqual(self.convert(headers={"Sec-Fetch-Site": "same-origin"}).status_code, 200)
        os.environ["LENSIQ_API_ALLOW_ORIGIN"] = "https://kiosk.example"
        self.assertEqual(self.convert(headers={"Origin": "https://kiosk.example"}).status_code, 200)
        self.assertEqual(self.tryon(headers={"Origin": "https://evil.example"}).status_code, 403)

    def test_fortune_allow_origin_still_works(self):
        os.environ["LENSIQ_ALLOW_ORIGIN"] = "https://me.github.io"
        self.assertEqual(self.fortune(headers={"Origin": "https://evil.example"}).status_code, 403)
        r = self.c.options("/api/fortune", headers={"Origin": "https://me.github.io"}, environ_base=LAN)
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.headers["Access-Control-Allow-Origin"], "https://me.github.io")
        r = self.fortune(headers={"Origin": "https://me.github.io"})
        self.assertEqual(r.status_code, 400, "passes guard, then consent check")
        self.assertEqual(r.headers["Access-Control-Allow-Origin"], "https://me.github.io")
        # convert ไม่ได้รับสิทธิ์จาก LENSIQ_ALLOW_ORIGIN
        self.assertEqual(self.convert(headers={"Origin": "https://me.github.io"}).status_code, 403)
        os.environ["LENSIQ_ALLOW_ORIGIN"] = "*"
        self.assertEqual(self.fortune(headers={"Origin": "https://any.example"}).status_code, 400)

    def test_render_style_deployment(self):
        """GitHub Pages + backend บน Render: ตั้งค่าตาม AI-SETUP.md แล้วต้องใช้ได้"""
        os.environ.update(LENSIQ_API_ALLOW_ANY="1", LENSIQ_HOSTS="lensiq-api.onrender.com",
                          LENSIQ_ALLOW_ORIGIN="https://me.github.io", LENSIQ_TRUST_PROXY="1")
        h = {"Host": "lensiq-api.onrender.com", "Origin": "https://me.github.io", "X-Forwarded-For": "8.8.8.8"}
        r = self.c.get("/api/fortune/status", headers=h, environ_base={"REMOTE_ADDR": "10.0.0.2"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["Access-Control-Allow-Origin"], "https://me.github.io")


@mock.patch.object(server, "convert_with_repair", ConvertStub())
class LimitsTest(GuardBase):
    def test_convert_rate_limit_per_ip(self):
        os.environ["LENSIQ_CONVERT_RPM"] = "2"
        self.assertEqual(self.convert().status_code, 200)
        self.assertEqual(self.convert().status_code, 200)
        self.assertEqual(self.convert().status_code, 429)
        self.assertEqual(self.convert(env={"REMOTE_ADDR": "192.168.1.24"}).status_code, 200, "other IP unaffected")

    def test_global_api_rate_limit(self):
        os.environ["LENSIQ_API_RPM"] = "3"
        codes = [self.c.get("/api/tryon/status", environ_base=LAN).status_code for _ in range(4)]
        self.assertEqual(codes, [200, 200, 200, 429])

    def test_tryon_rate_limit(self):
        os.environ["LENSIQ_TRYON_RPM"] = "1"
        with mock.patch.object(server.tryon, "run", return_value=PNG):
            self.assertEqual(self.tryon().status_code, 200)
            self.assertEqual(self.tryon().status_code, 429)

    def test_size_limits(self):
        os.environ["LENSIQ_CONVERT_MAX_MB"] = "1"
        big = {"file": (io.BytesIO(b"%PDF-" + b"0" * (1024 * 1024 + 10)), "a.pdf")}
        self.assertEqual(self.convert(data=big).status_code, 413)
        r = self.c.post("/api/fortune", data="{" + " " * (81 * 1024) + "}", content_type="application/json",
                        environ_base=LAN)
        self.assertEqual(r.status_code, 413)

    def test_content_type(self):
        r = self.c.post("/api/convert", data=b"%PDF-1.4", content_type="application/pdf", environ_base=LAN)
        self.assertEqual(r.status_code, 415)
        os.environ["REPLICATE_API_TOKEN"] = "x"
        r = self.c.post("/api/tryon", json={"consent": "yes"}, environ_base=LAN)
        self.assertEqual(r.status_code, 415)
        os.environ["ANTHROPIC_API_KEY"] = "x"
        r = self.c.post("/api/fortune", data="consent=true", content_type="application/x-www-form-urlencoded",
                        environ_base=LAN)
        self.assertEqual(r.status_code, 415)
        self.assertTrue(r.get_json()["fallback"])

    def test_tryon_validates_images_and_desc(self):
        with mock.patch.object(server.tryon, "run", return_value=PNG) as run:
            self.assertEqual(self.tryon(human=b"<html>").status_code, 415)
            run.assert_not_called()
            self.assertEqual(self.tryon(garment=b"\xff\xd8\xff\xe0jpeg").status_code, 200)
            desc = run.call_args[0][2]
            self.assertNotIn("<", desc)
            self.assertNotIn("\x00", desc)

    def test_convert_still_checks_pdf_magic(self):
        r = self.convert(data={"file": (io.BytesIO(b"not a pdf"), "a.pdf")})
        self.assertEqual(r.status_code, 400)


class HeadersTest(GuardBase):
    def test_security_headers_on_pages_and_api(self):
        for path in ("/", "/numbers.html", "/api/fortune/status"):
            r = self.c.get(path, environ_base=LAN)
            self.assertEqual(r.status_code, 200, path)
            self.assertEqual(r.headers["X-Content-Type-Options"], "nosniff")
            self.assertEqual(r.headers["Referrer-Policy"], "same-origin")
            self.assertIn("camera=(self)", r.headers["Permissions-Policy"])
            self.assertIn("microphone=()", r.headers["Permissions-Policy"])
            csp = r.headers["Content-Security-Policy"]
            self.assertIn("script-src 'self' 'wasm-unsafe-eval'", csp)
            self.assertNotIn("'unsafe-eval'", csp.replace("'wasm-unsafe-eval'", ""))
            self.assertIn("https://fonts.gstatic.com", csp)
            self.assertIn("img-src 'self' data: blob:", csp)
            self.assertIn("frame-ancestors 'self'", csp)
            self.assertIn("object-src 'none'", csp)

    def test_csp_connect_extra_and_off(self):
        os.environ["LENSIQ_CSP_CONNECT"] = "https://lensiq-api.onrender.com, javascript:alert(1)"
        csp = self.c.get("/").headers["Content-Security-Policy"]
        self.assertIn("connect-src 'self' data: blob: https://lensiq-api.onrender.com", csp)
        self.assertNotIn("javascript", csp)
        os.environ["LENSIQ_CSP"] = "off"
        self.assertNotIn("Content-Security-Policy", self.c.get("/").headers)

    def test_no_inline_scripts_in_pages(self):
        """CSP script-src 'self' ไม่อนุญาต inline — ทุกหน้าต้องไม่มี <script> ที่มีเนื้อหา และไม่มี on*="" """
        import glob
        import re
        for f in glob.glob(os.path.join(ROOT, "*.html")):
            with open(f, encoding="utf-8") as fh:
                html = fh.read()
            self.assertIsNone(re.search(r"<script(?![^>]*\bsrc=)[^>]*>\s*\S", html), f)
            self.assertIsNone(re.search(r"\son[a-z]+\s*=\s*[\"']", html), f)
            self.assertNotIn("javascript:", html, f)

    def test_static_sources_still_hidden(self):
        for p in ("/server.py", "/tryon.py", "/.git/config", "/data/agg.json", "/tests/python/test_agg.py"):
            self.assertEqual(self.c.get(p).status_code, 404, p)


if __name__ == "__main__":
    unittest.main()

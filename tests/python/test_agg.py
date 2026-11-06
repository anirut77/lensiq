"""server.py /api/agg — multi-device aggregate-only endpoints.

Run:  .venv/bin/python -m unittest discover -s tests/python -v
Uses Flask's test client; data goes to a throw-away LENSIQ_DATA_DIR (never the repo's data/).
"""
import datetime
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
import server  # noqa: E402

LAN = {"REMOTE_ADDR": "192.168.1.23"}
WAN = {"REMOTE_ADDR": "8.8.8.8"}
TODAY = datetime.date.today().isoformat()


def pack(**kw):
    p = {"v": 1, "format": "lensiq-agg", "name": "ประตูหน้า", "date": TODAY, "in": 5, "out": 3, "occ": 2, "peak": 4,
         "peakAt": 1762400000000, "maxQueue": 1, "t": 1762400000000,
         "hourlyIn": [0] * 10 + [5] + [0] * 13, "hourlyOut": [0] * 11 + [3] + [0] * 12,
         "zones": {"c1:z1": {"name": "ชั้นวาง", "visits": 2, "dwellSum": 9000, "dwellN": 2, "peak": 1}},
         "byCam": {"c1": {"name": "กล้อง 1", "in": 5, "out": 3}}}
    p.update(kw)
    return p


class AggTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="lq-agg-test-")
        self.env = {k: os.environ.get(k) for k in ("LENSIQ_DATA_DIR", "LENSIQ_AGG_ALLOW_ANY", "LENSIQ_AGG_RPM", "LENSIQ_TRUST_PROXY", "LENSIQ_AGG_ALLOW_ORIGIN")}
        os.environ["LENSIQ_DATA_DIR"] = self.dir
        for k in ("LENSIQ_AGG_ALLOW_ANY", "LENSIQ_TRUST_PROXY", "LENSIQ_AGG_ALLOW_ORIGIN"):
            os.environ.pop(k, None)
        os.environ["LENSIQ_AGG_RPM"] = "1000"
        server._agg_rl.clear()
        server._agg_fail.clear()
        self.c = server.app.test_client()

    def tearDown(self):
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(self.dir, ignore_errors=True)

    # helpers
    def code(self):
        r = self.c.get("/api/agg/pair")
        self.assertEqual(r.status_code, 200)
        return r.get_json()["code"]

    def join(self, name="ประตูหน้า", code=None, env=LAN, **extra):
        return self.c.post("/api/agg/join", json={"name": name, **extra}, environ_base=env,
                           headers={"Authorization": "Bearer " + (code or self.code())})

    def push(self, tok, body, env=LAN):
        return self.c.post("/api/agg", json=body, environ_base=env, headers={"Authorization": "Bearer " + tok})

    # ---------- pairing ----------
    def test_pair_code_only_on_loopback(self):
        self.assertEqual(self.c.get("/api/agg/pair", environ_base=LAN).status_code, 403)
        c = self.code()
        self.assertRegex(c, r"^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.assertEqual(self.code(), c, "code is stable across calls")
        self.assertTrue(self.c.get("/api/agg/status").get_json()["local"])
        self.assertFalse(self.c.get("/api/agg/status", environ_base=LAN).get_json()["local"])
        os.environ["LENSIQ_TRUST_PROXY"] = "1"
        self.assertEqual(self.c.get("/api/agg/pair").status_code, 403, "behind a proxy loopback is not trusted")

    def test_join_and_push_and_get(self):
        r = self.join(code=self.code().lower().replace("-", " "))  # code input is normalised
        self.assertEqual(r.status_code, 200, r.get_json())
        j = r.get_json()
        self.assertRegex(j["node"], r"^n[a-z0-9]{8,24}$")
        r = self.push(j["token"], pack(node="nspoofed00000"))
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertEqual(r.get_json()["node"], j["node"], "node id comes from the token, not the body")
        g = self.c.get(f"/api/agg?date={TODAY}", environ_base=LAN, headers={"Authorization": "Bearer " + self.code()})
        self.assertEqual(g.status_code, 200)
        rows = g.get_json()["dates"][TODAY]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["node"], j["node"])
        self.assertEqual(rows[0]["in"], 5)
        self.assertNotIn("format", rows[0])
        self.assertEqual(g.get_json()["devices"][0]["name"], "ประตูหน้า")
        # stored file has the token hash only
        with open(os.path.join(self.dir, "agg.json"), encoding="utf-8") as fh:
            raw = fh.read()
        self.assertNotIn(j["token"], raw)
        self.assertEqual(oct(os.stat(os.path.join(self.dir, "agg.json")).st_mode & 0o777), "0o600")

    def test_proposed_node_id_kept_unless_taken(self):
        a = self.join(node="nabcdefgh1234").get_json()
        self.assertEqual(a["node"], "nabcdefgh1234")
        b = self.join(node="nabcdefgh1234").get_json()
        self.assertNotEqual(b["node"], "nabcdefgh1234", "cannot hijack an existing node id")

    def test_wrong_code_and_lockout(self):
        self.code()
        r = self.join(code="AAAA-AAAA-AAAA")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(self.c.get("/api/agg", environ_base=LAN).status_code, 401)
        for _ in range(25):
            self.join(code="AAAA-AAAA-AAAA", env={"REMOTE_ADDR": "10.0.0.9"})
        r = self.join(env={"REMOTE_ADDR": "10.0.0.9"})  # even the right code is locked out now
        self.assertEqual(r.status_code, 429)
        self.assertEqual(self.join(env={"REMOTE_ADDR": "10.0.0.10"}).status_code, 200, "other IPs unaffected")

    def test_push_requires_valid_token(self):
        self.assertEqual(self.push("nope", pack()).status_code, 401)
        self.assertEqual(self.c.post("/api/agg", json=pack(), environ_base=LAN).status_code, 401)

    def test_rotate_keeps_nodes_and_revoke(self):
        j = self.join().get_json()
        old = self.code()
        self.assertEqual(self.c.post("/api/agg/pair/rotate", environ_base=LAN).status_code, 403)
        new = self.c.post("/api/agg/pair/rotate").get_json()["code"]
        self.assertNotEqual(old, new)
        self.assertEqual(self.join(code=old).status_code, 401, "old code no longer pairs")
        self.assertEqual(self.push(j["token"], pack()).status_code, 200, "paired node keeps working")
        d = self.c.delete(f"/api/agg/node/{j['node']}", environ_base=LAN, headers={"Authorization": "Bearer " + new})
        self.assertEqual(d.status_code, 200)
        self.assertTrue(d.get_json()["removed"])
        self.assertEqual(self.push(j["token"], pack()).status_code, 401, "revoked")
        g = self.c.get("/api/agg", environ_base=LAN, headers={"Authorization": "Bearer " + new}).get_json()
        self.assertEqual(g["dates"], {})

    # ---------- network policy ----------
    def test_public_ip_rejected_unless_env(self):
        self.assertEqual(self.c.get("/api/agg/status", environ_base=WAN).status_code, 403)
        self.assertEqual(self.join(env=WAN).status_code, 403)
        self.assertEqual(self.c.get("/api/agg/status", environ_base={"REMOTE_ADDR": "fd00::5"}).status_code, 200)
        self.assertEqual(self.c.get("/api/agg/status", environ_base={"REMOTE_ADDR": "::ffff:192.168.0.4"}).status_code, 200)
        os.environ["LENSIQ_AGG_ALLOW_ANY"] = "1"
        self.assertEqual(self.c.get("/api/agg/status", environ_base=WAN).status_code, 200)

    def test_host_and_origin_checks(self):
        self.assertEqual(self.c.get("/api/agg/status", headers={"Host": "evil.example"}).status_code, 403, "DNS rebinding")
        self.assertEqual(self.c.get("/api/agg/status", headers={"Host": "192.168.1.20:8443"}).status_code, 200)
        self.assertEqual(self.c.get("/api/agg/status", headers={"Host": "shop.local:8443"}).status_code, 200)
        r = self.c.get("/api/agg/status", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status_code, 403)
        r = self.c.get("/api/agg/status", headers={"Origin": "http://localhost"})
        self.assertEqual(r.status_code, 200, "same origin")
        self.assertNotIn("Access-Control-Allow-Origin", r.headers)
        os.environ["LENSIQ_AGG_ALLOW_ORIGIN"] = "*"
        r = self.c.get("/api/agg/status", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status_code, 403, "wildcard is ignored")
        os.environ["LENSIQ_AGG_ALLOW_ORIGIN"] = "https://hub.example"
        r = self.c.options("/api/agg", headers={"Origin": "https://hub.example"})
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.headers["Access-Control-Allow-Origin"], "https://hub.example")

    def test_rate_limit(self):
        os.environ["LENSIQ_AGG_RPM"] = "5"
        codes = [self.c.get("/api/agg/status", environ_base={"REMOTE_ADDR": "10.1.1.1"}).status_code for _ in range(7)]
        self.assertEqual(codes[:5], [200] * 5)
        self.assertEqual(codes[5:], [429, 429])

    def test_data_dir_not_served(self):
        self.join()
        for p in ("/data/agg.json", "/Data/agg.json", "/DATA/agg.json", "/server.py", "/Server.py", "/.venv/pyvenv.cfg",
                  "/tests/python/test_agg.py", "/vendor/.x"):
            self.assertEqual(self.c.get(p).status_code, 404, p)
        r = self.c.get("/store.html")
        self.assertEqual(r.status_code, 200)
        r.close()

    # ---------- schema ----------
    def test_schema_rejects(self):
        tok = self.join().get_json()["token"]
        bad = [
            pack(extra=1),                                   # unknown top key
            pack(image="data:image/png;base64,AAAA"),        # images never accepted
            pack(descriptor=[0.1] * 128),
            pack(tracks=[{"x": 0.1}]),
            pack(**{"in": "5"}),                             # strings for numbers
            pack(**{"in": -1}), pack(**{"in": 1e9}), pack(**{"in": True}),
            pack(name="x" * 41), pack(name=""), pack(name=5),
            pack(v=2), pack(format="other"),
            pack(date="2020-01-01"), pack(date="nope"),
            pack(hourlyIn=[0] * 23), pack(hourlyIn=["1"] * 24),
            pack(zones={"bad key": {"name": "a"}}),
            pack(zones={"c1:z1": {"name": "a", "box": [0, 0, 1, 1]}}),
            pack(zones={f"c1:z{i}": {"name": "a"} for i in range(65)}),
            pack(byCam={"c9": {"name": "a", "in": 1, "out": 0}}),
            pack(byCam={"c1": {"name": "a", "in": 1, "out": 0, "deviceId": "abc"}}),
        ]
        for b in bad:
            r = self.push(tok, b)
            self.assertEqual(r.status_code, 400, json.dumps(b, ensure_ascii=False)[:120])
        self.assertEqual(self.c.post("/api/agg", data="x" * 20000, content_type="application/json", environ_base=LAN,
                                     headers={"Authorization": "Bearer " + tok}).status_code, 413)
        self.assertEqual(self.c.post("/api/agg", data="{}", content_type="text/plain", environ_base=LAN,
                                     headers={"Authorization": "Bearer " + tok}).status_code, 415)

    def test_clean_agg_sanitizes_names_and_defaults(self):
        p = server.clean_agg({"v": 1, "name": "  <b>ประตู\n หน้า</b> ", "date": TODAY, "in": 1.4, "out": 0})
        self.assertEqual(p["name"], "b ประตู หน้า /b")
        self.assertEqual(p["in"], 1)
        self.assertEqual(p["hourlyIn"], [0] * 24)
        self.assertEqual(p["zones"], {})
        with self.assertRaises(server.AggError):
            server.clean_agg({"v": 1, "name": "a", "date": TODAY, "in": float("nan"), "out": 0})

    def test_node_cap_and_days_pruned(self):
        code = self.code()
        for i in range(server.AGG_LIM["nodes"]):
            self.assertEqual(self.join(name=f"n{i}", code=code).status_code, 200)
        self.assertEqual(self.join(name="extra", code=code).status_code, 409)
        st = server._agg_load()
        st["days"] = {f"2025-01-{i:02d}": {} for i in range(1, 29)}
        st["days"].update({f"2025-02-{i:02d}": {} for i in range(1, 29)})
        st["days"].update({f"2025-03-{i:02d}": {} for i in range(1, 29)})
        server._agg_save(st)
        self.c.delete("/api/agg/node/" + next(iter(st["nodes"])), environ_base=LAN, headers={"Authorization": "Bearer " + code})
        j = self.join(code=code).get_json()
        self.assertEqual(self.push(j["token"], pack()).status_code, 200)
        self.assertLessEqual(len(server._agg_load()["days"]), server.AGG_LIM["days_kept"])


if __name__ == "__main__":
    unittest.main()

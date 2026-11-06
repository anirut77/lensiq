"""เปลี่ยนชุดให้สมจริงด้วย AI (Virtual Try-On) ผ่าน Replicate — ปิดไว้เป็นค่าเริ่มต้น และปลอดภัยเชิงสัญญาอนุญาต

ทำไมปิด: โมเดล try-on โอเพนซอร์สที่นิยม (IDM-VTON, OOTDiffusion, StableVITON, CatVTON, LaDI-VTON …) ใช้สัญญาอนุญาต
CC BY-NC-SA 4.0 = ห้ามใช้เชิงพาณิชย์ — ร้านค้า/บูธที่เก็บเงินหรือใช้ทำการตลาดถือเป็นการใช้เชิงพาณิชย์
จึงไม่มีโมเดลค่าเริ่มต้นอีกต่อไป และ /api/tryon จะเปิดก็ต่อเมื่อ "ผู้ติดตั้งยืนยันสัญญาอนุญาตเอง" ครบทั้ง 3 ค่า

เปิดใช้งาน (เชิงพาณิชย์ — โมเดลที่คุณมีสิทธิ์ใช้ขายได้ เช่น โมเดลที่ซื้อไลเซนส์ หรือโมเดลของผู้ให้บริการที่สัญญาอนุญาต
ให้ใช้เชิงพาณิชย์; ดู docs/TRYON-LICENSING.md):
    export REPLICATE_API_TOKEN="r8_..."
    export REPLICATE_TRYON_MODEL="owner/model"      # บังคับ — ไม่มีค่าเริ่มต้น
    export LENSIQ_TRYON_LICENSE="commercial"       # คุณยืนยันว่ามีสิทธิ์ใช้โมเดลนี้เชิงพาณิชย์
    export REPLICATE_TRYON_VERSION="..."           # (ไม่บังคับ) ล็อกเวอร์ชัน — แนะนำสำหรับใช้งานจริง
    export LENSIQ_TRYON_INPUT='{"human":"human_img","garment":"garm_img","desc":"garment_des"}'  # (ไม่บังคับ) ชื่อฟิลด์อินพุต
    export LENSIQ_TRYON_EXTRA='{"category":"upper_body"}'                                          # (ไม่บังคับ) ค่าคงที่เพิ่ม

เดโม/วิจัยที่ไม่ใช่เชิงพาณิชย์เท่านั้น (เช่น IDM-VTON):
    export REPLICATE_TRYON_MODEL="cuuupid/idm-vton" LENSIQ_TRYON_LICENSE="noncommercial-demo"
    -> สถานะจะแจ้ง noncommercial=true และ log คำเตือนตอนเริ่มเซิร์ฟเวอร์
โมเดลที่รู้ว่าเป็น NC จะ "ไม่" เปิดด้วย LENSIQ_TRYON_LICENSE=commercial (กันยืนยันผิด)

ความเป็นส่วนตัว: รูปจะถูกส่งไปที่ Replicate ก็ต่อเมื่อเปิดใช้งานแล้วและผู้ใช้กดยินยอมในหน้าเว็บเท่านั้น
ไม่มีการเก็บรูปไว้ที่เซิร์ฟเวอร์นี้ (ประมวลผลในหน่วยความจำ)
English: try-on is off by default; it is enabled only when an operator configures a model AND attests its licence.
Known non-commercial (CC BY-NC-SA) models are refused unless LENSIQ_TRYON_LICENSE=noncommercial-demo.
"""
import base64, json, logging, os, re, time, urllib.request, urllib.error

API = "https://api.replicate.com/v1"
TIMEOUT_S = 150
log = logging.getLogger("lensiq.tryon")

# โมเดลที่ทราบว่าเป็น non-commercial (CC BY-NC / BY-NC-SA / research-only) — จับจากชื่อโมเดลบน Replicate
NONCOMMERCIAL_PATTERNS = (
    r"idm[-_]?vton", r"ootd(iffusion)?", r"stable[-_]?viton", r"cat[-_]?vton", r"ladi[-_]?vton", r"gp[-_]?vton",
    r"dci[-_]?vton", r"hr[-_]?viton", r"viton[-_]?hd", r"oot[-_]?diffusion", r"leffa", r"tpd[-_]?vton",
)
LICENSE_VALUES = ("commercial", "noncommercial-demo")
DEFAULT_INPUT = {"human": "human_img", "garment": "garm_img", "desc": "garment_des"}
DEFAULT_EXTRA = {"category": "upper_body", "crop": False, "steps": 30, "seed": 42}


def is_noncommercial(model):
    m = (model or "").lower()
    return any(re.search(p, m) for p in NONCOMMERCIAL_PATTERNS)


def config():
    return {
        "token": os.environ.get("REPLICATE_API_TOKEN", "").strip(),
        "model": os.environ.get("REPLICATE_TRYON_MODEL", "").strip(),
        "version": os.environ.get("REPLICATE_TRYON_VERSION", "").strip(),
        "license": os.environ.get("LENSIQ_TRYON_LICENSE", "").strip().lower(),
    }


def status():
    """{"enabled", "reason", "model", "provider", "license", "noncommercial"} — reason อธิบายว่าทำไมปิด (ไม่มีความลับ)"""
    cfg = config()
    nc = is_noncommercial(cfg["model"])
    if not cfg["token"]:
        reason = "no-token"
    elif not cfg["model"]:
        reason = "no-model"
    elif cfg["license"] not in LICENSE_VALUES:
        reason = "license-not-attested"
    elif nc and cfg["license"] != "noncommercial-demo":
        reason = "model-is-noncommercial"
    else:
        reason = "ok"
    return {"enabled": reason == "ok", "reason": reason, "model": cfg["model"] or None, "provider": "Replicate",
            "license": cfg["license"] or None, "noncommercial": bool(cfg["model"]) and (nc or cfg["license"] == "noncommercial-demo")}


def enabled():
    return status()["enabled"]


_REASON_MSG = {
    "no-token": "ระบบ AI ยังไม่เปิดใช้งาน (ยังไม่ได้ตั้งค่า API key)",
    "no-model": "ระบบ AI ยังไม่เปิดใช้งาน (ยังไม่ได้เลือกโมเดลที่มีสิทธิ์ใช้เชิงพาณิชย์)",
    "license-not-attested": "ระบบ AI ยังไม่เปิดใช้งาน (ผู้ดูแลยังไม่ยืนยันสัญญาอนุญาตของโมเดล)",
    "model-is-noncommercial": "ระบบ AI ปิดอยู่: โมเดลที่ตั้งไว้ห้ามใช้เชิงพาณิชย์",
}


def disabled_message():
    return _REASON_MSG.get(status()["reason"], "ระบบ AI ยังไม่เปิดใช้งาน")


def startup_warning():
    st = status()
    if st["enabled"] and st["noncommercial"]:
        log.warning("try-on model %s is NON-COMMERCIAL (CC BY-NC-SA or similar): demo/research use only.", st["model"])
    elif not st["enabled"] and st["reason"] != "no-token":
        log.warning("try-on disabled: %s (see tryon.py / docs/TRYON-LICENSING.md)", st["reason"])


def _json_env(name, default):
    raw = os.environ.get(name, "").strip()
    if not raw:
        return dict(default)
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else dict(default)
    except ValueError:
        return dict(default)


def _req(method, url, token, body=None, extra_headers=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    headers.update(extra_headers or {})
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=70) as r:
        return json.loads(r.read().decode())


def _data_uri(png_bytes):
    return "data:image/png;base64," + base64.b64encode(png_bytes).decode()


def build_input(human_png, garment_png, description):
    """อินพุตของโมเดล: ชื่อฟิลด์จาก LENSIQ_TRYON_INPUT (ค่าเริ่ม = รูปแบบ IDM-VTON) + ค่าคงที่จาก LENSIQ_TRYON_EXTRA"""
    names = {**DEFAULT_INPUT, **{k: v for k, v in _json_env("LENSIQ_TRYON_INPUT", {}).items()
                                 if k in DEFAULT_INPUT and isinstance(v, str) and v}}
    extra = _json_env("LENSIQ_TRYON_EXTRA", DEFAULT_EXTRA)
    out = {k: v for k, v in extra.items() if isinstance(k, str) and isinstance(v, (str, int, float, bool))}
    out[names["human"]] = _data_uri(human_png)
    out[names["garment"]] = _data_uri(garment_png)
    out[names["desc"]] = description or "formal uniform shirt"
    return out


class TryOnError(Exception):
    """msg = ข้อความที่แสดงผู้ใช้ได้ ; detail = รายละเอียดจากผู้ให้บริการ (log เท่านั้น ห้ามส่งให้ผู้ใช้)"""
    def __init__(self, msg, status=502, detail=""):
        super().__init__(msg)
        self.status = status
        self.detail = detail


def _replicate_url(url):
    """ส่ง token ไปเฉพาะ https://api.replicate.com เท่านั้น (กัน URL ปลอมในคำตอบพา token ออกไป)"""
    if not isinstance(url, str) or not url.startswith(API + "/"):
        raise TryOnError("AI ตอบกลับในรูปแบบที่ไม่รองรับ", 502, detail="unexpected poll url")
    return url


def _https_url(url):
    """รูปผลลัพธ์ต้องเป็น https:// (กัน file:// / http ภายในเครือข่าย = SSRF)"""
    if not isinstance(url, str) or not url.lower().startswith("https://"):
        raise TryOnError("AI ไม่ได้ส่งรูปกลับมา", 502, detail="non-https output url")
    return url


def run(human_png, garment_png, description=""):
    """ส่งงานไป Replicate แล้วคืน bytes ของรูปผลลัพธ์"""
    cfg = config()
    if not enabled():
        raise TryOnError(disabled_message(), 503)
    try:
        version = cfg["version"]
        if not version:  # หาเวอร์ชันล่าสุดของโมเดล
            info = _req("GET", f"{API}/models/{cfg['model']}", cfg["token"])
            version = (info.get("latest_version") or {}).get("id")
            if not version:
                raise TryOnError("ไม่พบเวอร์ชันของโมเดลบน Replicate")
        pred = _req("POST", f"{API}/predictions", cfg["token"],
                    {"version": version, "input": build_input(human_png, garment_png, description)},
                    {"Prefer": "wait=60"})
        t0 = time.time()
        while pred.get("status") not in ("succeeded", "failed", "canceled"):
            if time.time() - t0 > TIMEOUT_S:
                raise TryOnError("AI ใช้เวลานานเกินไป ลองใหม่อีกครั้ง", 504)
            time.sleep(2)
            pred = _req("GET", _replicate_url((pred.get("urls") or {}).get("get")), cfg["token"])
        if pred["status"] != "succeeded":
            raise TryOnError("AI ประมวลผลไม่สำเร็จ ลองใหม่อีกครั้ง", 502, detail=str(pred.get("error") or pred["status"])[:300])
        out = pred.get("output")
        url = out[0] if isinstance(out, list) else out
        if not url:
            raise TryOnError("AI ไม่ได้ส่งรูปกลับมา")
        with urllib.request.urlopen(_https_url(url), timeout=60) as r:
            return r.read(25 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:300]
        status = 401 if e.code in (401, 403) else 502
        msg = "ตั้งค่า API key ของบริการ AI ไม่ถูกต้อง" if status == 401 else "บริการ AI ขัดข้องชั่วคราว"
        raise TryOnError(msg, status, detail=f"HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        raise TryOnError("เชื่อมต่อบริการ AI ไม่ได้", 502, detail=str(e.reason)[:200])

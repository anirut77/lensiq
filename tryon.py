"""เปลี่ยนชุดให้สมจริงด้วย AI (Virtual Try-On) ผ่าน Replicate — ปิดไว้เป็นค่าเริ่มต้น

เปิดใช้งาน: ตั้ง environment variable ก่อนรันเซิร์ฟเวอร์
    export REPLICATE_API_TOKEN="r8_..."           # จาก https://replicate.com/account/api-tokens
    export REPLICATE_TRYON_MODEL="cuuupid/idm-vton"  # (ไม่บังคับ) ค่าเริ่มต้นคือ IDM-VTON
    export REPLICATE_TRYON_VERSION="..."           # (ไม่บังคับ) ถ้าไม่ใส่ จะใช้เวอร์ชันล่าสุดของโมเดล

ความเป็นส่วนตัว: รูปจะถูกส่งไปที่ Replicate ก็ต่อเมื่อมี token และผู้ใช้กดยินยอมในหน้าเว็บเท่านั้น
ไม่มีการเก็บรูปไว้ที่เซิร์ฟเวอร์นี้ (ประมวลผลในหน่วยความจำ)
"""
import base64, json, os, time, urllib.request, urllib.error

API = "https://api.replicate.com/v1"
TIMEOUT_S = 150


def config():
    return {
        "token": os.environ.get("REPLICATE_API_TOKEN", "").strip(),
        "model": os.environ.get("REPLICATE_TRYON_MODEL", "cuuupid/idm-vton").strip(),
        "version": os.environ.get("REPLICATE_TRYON_VERSION", "").strip(),
    }


def enabled():
    return bool(config()["token"])


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
    """อินพุตตามรูปแบบของ IDM-VTON บน Replicate (ถ้าเปลี่ยนโมเดล อาจต้องแก้ชื่อฟิลด์ตรงนี้)"""
    return {
        "human_img": _data_uri(human_png),
        "garm_img": _data_uri(garment_png),
        "garment_des": description or "formal uniform shirt",
        "category": "upper_body",
        "crop": False,
        "steps": 30,
        "seed": 42,
    }


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
    if not cfg["token"]:
        raise TryOnError("ยังไม่ได้ตั้งค่า REPLICATE_API_TOKEN", 503)
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

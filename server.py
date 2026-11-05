"""เซิร์ฟเวอร์เว็บ + API แปลง PDF -> DOCX (คงเลย์เอาต์ด้วย pdf2docx)

รัน:  .venv/bin/python server.py   แล้วเปิด http://localhost:8000
"""
import os, tempfile
from flask import Flask, request, send_file, jsonify, send_from_directory
from pdf2docx import Converter

import fitz
from pdf2docx.font.Fonts import Fonts

# PDF บางไฟล์อ้างอิงฟอนต์ที่ไม่มีอยู่จริง (เช่น "0 0 R") ทำให้ pdf2docx ล้มทั้งไฟล์
# -> ให้ข้ามฟอนต์ที่อ่านไม่ได้ แล้วแปลงต่อ
_orig_extract = Fonts.extract.__func__


class _SafeDoc:
    def __init__(self, doc): self.doc = doc
    def __iter__(self): return iter(self.doc)

    def extract_font(self, xref):
        try:
            return self.doc.extract_font(xref)
        except Exception:
            return ("", "n/a", "", b"")


Fonts.extract = classmethod(lambda cls, doc: _orig_extract(cls, _SafeDoc(doc)))


def run_convert(src, dst):
    cv = Converter(src)
    try:
        cv.convert(dst)
    finally:
        cv.close()


def convert_with_repair(src, dst, tmp):
    """แปลงตรง ๆ ก่อน ถ้าล้มให้ซ่อมโครงสร้าง PDF แล้วลองอีกครั้ง"""
    try:
        run_convert(src, dst)
    except Exception:
        import traceback; traceback.print_exc()
        fixed = os.path.join(tmp, "fixed.pdf")
        doc = fitz.open(src)
        if doc.needs_pass:
            raise
        doc.save(fixed, garbage=4, clean=True, deflate=True)
        doc.close()
        run_convert(fixed, dst)


ROOT = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:path>")
def static_files(path):
    # เสิร์ฟเฉพาะไฟล์หน้าเว็บ ไม่เปิดเผยโฟลเดอร์ระบบ/ซอร์สเซิร์ฟเวอร์
    if path.startswith((".", "server.py", "tryon.py", "logs", "certs", "requirements", "start.sh")) or ".venv" in path or ".git" in path:
        return ("Not found", 404)
    return send_from_directory(ROOT, path)


@app.post("/api/convert")
def convert():
    f = request.files.get("file")
    if not f:
        return jsonify(error="ไม่พบไฟล์"), 400
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "in.pdf"), os.path.join(tmp, "out.docx")
        f.save(src)
        with open(src, "rb") as fh:
            if fh.read(5) != b"%PDF-":
                return jsonify(error="ไม่ใช่ไฟล์ PDF"), 400
        try:
            convert_with_repair(src, dst, tmp)
        except Exception as e:  # ไฟล์เสีย/มีรหัสผ่าน ฯลฯ
            import traceback; traceback.print_exc()
            msg = "ไฟล์มีรหัสผ่าน ไม่รองรับ" if "password" in str(e).lower() else "แปลงไม่สำเร็จ ไฟล์อาจเสียหายหรือมีโครงสร้างที่ไม่รองรับ"
            return jsonify(error=msg), 422
        # อ่านเข้าหน่วยความจำก่อน เพราะโฟลเดอร์ชั่วคราวจะถูกลบเมื่อออกจาก with
        with open(dst, "rb") as fh:
            data = fh.read()
    from io import BytesIO
    return send_file(BytesIO(data), as_attachment=True, download_name="converted.docx",
                     mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


import tryon


@app.get("/api/tryon/status")
def tryon_status():
    cfg = tryon.config()
    return jsonify(enabled=bool(cfg["token"]), model=cfg["model"], provider="Replicate")


@app.post("/api/tryon")
def tryon_run():
    if not tryon.enabled():
        return jsonify(error="ระบบ AI ยังไม่เปิดใช้งาน (ยังไม่ได้ตั้งค่า API key)"), 503
    if request.form.get("consent") != "yes":
        return jsonify(error="ต้องได้รับความยินยอมก่อนส่งรูปไปประมวลผล"), 400
    human, garment = request.files.get("human"), request.files.get("garment")
    if not human or not garment:
        return jsonify(error="ต้องมีรูปผู้ถ่ายและรูปชุด"), 400
    try:
        png = tryon.run(human.read(), garment.read(), request.form.get("desc", ""))
    except tryon.TryOnError as e:
        app.logger.warning("tryon: %s", e)
        return jsonify(error=str(e)), e.status
    from io import BytesIO
    return send_file(BytesIO(png), mimetype="image/png")


if __name__ == "__main__":
    if os.environ.get("LENSIQ_MOBILE") == "1":
        # โหมดมือถือ: เปิดให้เครื่องอื่นในวง LAN เข้าได้ผ่าน HTTPS (กล้องบนมือถือต้องใช้ https)
        certs = os.path.join(ROOT, "certs")
        app.run(host="0.0.0.0", port=8443, threaded=True,
                ssl_context=(os.path.join(certs, "cert.pem"), os.path.join(certs, "key.pem")))
    else:
        app.run(host="127.0.0.1", port=8000, threaded=True)

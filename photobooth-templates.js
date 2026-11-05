/* เทมเพลตจากรูปจริง: ชุด (outfit), กรอบรูป (frame), ฉากหลัง (bg) — เก็บใน IndexedDB ของเบราว์เซอร์
 *
 * ชุดจากรูปถ่ายจริง: ตัดพื้นหลังด้วย MODNet (PBHQ.cutout) -> หาคาง/ความกว้างหน้าของนายแบบด้วย face-api
 * -> ลบศีรษะและคอเหนือ "แนวคอเสื้อ" (โค้งรูปตัว U ลึกตรงกลาง ขอบนุ่ม) -> เก็บจุดยึด {cx, chinY, fw, faceLum}
 * ตอนใช้งาน: ย่อ/ขยายให้ fw ของนายแบบ = ความกว้างหน้าของผู้ถ่าย และวางคางตรงกัน จึงได้สัดส่วนตัวที่สมจริง
 */
(function (root) {
  "use strict";
  const MAX_SIDE = 1600;

  // ---------- ฟังก์ชันล้วน (ทดสอบใน Node ได้) ----------
  /** ลบส่วนเหนือแนวคอเสื้อออกจาก alpha (Uint8ClampedArray RGBA) — คืนจำนวนพิกเซลที่ถูกลบ */
  function applyNeckline(rgba, w, h, a, neck) {
    const faceH = a.faceH, base = a.chinY + neck * faceH, dip = .28 * faceH, half = .95 * a.fw, feather = Math.max(2, faceH * .04);
    let removed = 0;
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x - a.cx) / half, cut = base + (t < 1 ? dip * (1 - t * t) : 0);
      for (let y = 0; y < Math.min(h, Math.ceil(cut + feather)); y++) {
        const i = (y * w + x) * 4 + 3, k = Math.min(1, Math.max(0, (y - cut + feather) / (2 * feather)));
        const nv = Math.round(rgba[i] * k); if (nv < rgba[i]) removed++; rgba[i] = nv;
      }
    }
    return removed;
  }

  /** กรอบสี่เหลี่ยมของส่วนที่ไม่โปร่งใส */
  function opaqueBBox(rgba, w, h, th = 16) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** PNG ชุดที่ไม่มีศีรษะ: ประมาณจุดยึดจากรูปทรง (คอเสื้อ = แถวบนสุด, ไหล่ ≈ 2.6 เท่าของความกว้างหน้า) */
  function headlessAnchor(rgba, w, h) {
    const bb = opaqueBBox(rgba, w, h); if (!bb) return null;
    const span = y => { let a = -1, b = -1; for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 16) { if (a < 0) a = x; b = x; } return a < 0 ? null : { a, b }; };
    const top = span(bb.y), sh = span(Math.min(h - 1, Math.round(bb.y + bb.h * .35))) || { a: bb.x, b: bb.x + bb.w - 1 };
    const fw = (sh.b - sh.a) / 2.6, cx = top ? (top.a + top.b) / 2 : bb.x + bb.w / 2;
    return { cx, chinY: bb.y - fw * .3, fw, faceH: fw * 1.25, faceLum: null };
  }

  /** ค่าความสว่างเฉลี่ยของบริเวณ (ใช้จับคู่แสงระหว่างนายแบบกับผู้ถ่าย) */
  function meanLum(rgba, w, box) {
    let s = 0, n = 0;
    for (let y = Math.max(0, box.y | 0); y < box.y + box.h; y++) for (let x = Math.max(0, box.x | 0); x < box.x + box.w; x++) {
      const i = (y * w + x) * 4; if (rgba[i + 3] < 128) continue; s += .299 * rgba[i] + .587 * rgba[i + 1] + .114 * rgba[i + 2]; n++;
    }
    return n ? s / n : null;
  }

  // ---------- เบราว์เซอร์: โหลดภาพ / IndexedDB ----------
  async function fileToCanvas(file, maxSide = MAX_SIDE) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    return c;
  }
  const hasTransparency = (rgba) => { let t = 0; for (let i = 3; i < rgba.length; i += 16) if (rgba[i] < 250) t++; return t / (rgba.length / 16) > .03; };

  /**
   * เตรียมเทมเพลตชุดจากไฟล์ -> { canvas, anchor, source: "photo"|"png", base }
   * base = ผลก่อนตัดคอ (เก็บไว้ให้ปรับแถบ "ระดับคอเสื้อ" ซ้ำได้โดยไม่ต้องประมวลผลใหม่)
   */
  async function prepareOutfit(file) {
    const src = await fileToCanvas(file), w = src.width, h = src.height;
    const px = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let cut = src, source = "png";
    if (!hasTransparency(px)) { // รูปถ่ายปกติ -> ตัดพื้นหลังด้วย MODNet
      const r = await PBHQ.cutout(src, null);
      if (!r) throw new Error("ตัดพื้นหลังไม่ได้ (โมเดล MODNet ยังไม่พร้อม) — ใช้ไฟล์ PNG พื้นใสแทน หรือรอโหลดโมเดลแล้วลองใหม่");
      cut = r.canvas; source = "photo";
    }
    let anchor = null;
    if (typeof faceapi !== "undefined") {
      try {
        const d = await faceapi.detectSingleFace(src, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: .4 })).withFaceLandmarks();
        if (d) {
          const P = d.landmarks.positions, jaw = d.landmarks.getJawOutline();
          const eye = { x: (P[36].x + P[45].x) / 2, y: (P[36].y + P[45].y) / 2 };
          const fw = Math.hypot(jaw[16].x - jaw[0].x, jaw[16].y - jaw[0].y), faceH = Math.hypot(P[8].x - eye.x, P[8].y - eye.y);
          const b = d.detection.box;
          anchor = { cx: P[8].x, chinY: P[8].y, fw, faceH, faceLum: meanLum(px, w, { x: b.x + b.width * .25, y: b.y + b.height * .35, w: b.width * .5, h: b.height * .4 }) };
        }
      } catch (e) { console.warn(e); }
    }
    const cpx = cut.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h);
    if (!anchor) anchor = headlessAnchor(cpx.data, w, h);
    if (!anchor) throw new Error("ไม่พบชุดในภาพ");
    return { base: cpx, anchor, source, w, h };
  }

  /** ตัดคอเสื้อตามระดับ แล้วครอปให้เหลือเฉพาะส่วนชุด -> { canvas, anchor } */
  function finalizeOutfit(prep, neck) {
    const { w, h } = prep, data = new Uint8ClampedArray(prep.base.data);
    const a = { ...prep.anchor };
    if (prep.source === "photo" || a.faceLum != null) applyNeckline(data, w, h, a, neck);
    const bb = opaqueBBox(data, w, h) || { x: 0, y: 0, w, h };
    const full = Object.assign(document.createElement("canvas"), { width: w, height: h });
    full.getContext("2d").putImageData(new ImageData(data, w, h), 0, 0);
    const c = Object.assign(document.createElement("canvas"), { width: bb.w, height: bb.h });
    c.getContext("2d").drawImage(full, -bb.x, -bb.y);
    a.cx -= bb.x; a.chinY -= bb.y;
    return { canvas: c, anchor: a };
  }

  const DB = "pb-templates", ST = "items";
  const open = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "id" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode), s = t.objectStore(ST), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  const all = () => tx("readonly", s => s.getAll());
  const put = item => tx("readwrite", s => s.put(item));
  const del = id => tx("readwrite", s => s.delete(id));
  const toBlob = c => new Promise(r => c.toBlob(r, "image/png"));
  async function blobToCanvas(blob) { const b = await createImageBitmap(blob); const c = Object.assign(document.createElement("canvas"), { width: b.width, height: b.height }); c.getContext("2d").drawImage(b, 0, 0); return c; }

  const api = { applyNeckline, opaqueBBox, headlessAnchor, meanLum, fileToCanvas, prepareOutfit, finalizeOutfit, all, put, del, toBlob, blobToCanvas };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PBTpl = api;
})(typeof window !== "undefined" ? window : globalThis);

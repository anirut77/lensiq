/* คณิตศาสตร์จัดวาง (ไม่มี DOM) ใช้ได้ทั้งเบราว์เซอร์และ Node สำหรับทดสอบ */
(function (root) {
  const DPI = 300;
  const cmToPx = (cm, dpi = DPI) => Math.round(cm / 2.54 * dpi);

  const ID_SIZES = {
    "1": { label: "1 นิ้ว (2.5×3.0 ซม.)", w: 2.5, h: 3.0 },
    "1.5": { label: "1.5 นิ้ว (3.0×4.0 ซม.)", w: 3.0, h: 4.0 },
    "2": { label: "2 นิ้ว (3.5×4.5 ซม.)", w: 3.5, h: 4.5 }
  };
  const PAPERS = {
    "4x6": { label: "4×6 นิ้ว (โฟโต้)", w: 10.16, h: 15.24 },
    "a4": { label: "A4", w: 21.0, h: 29.7 }
  };

  /* วางรูปเรียงบนกระดาษ: คืนจำนวนคอลัมน์/แถว และตำแหน่งแต่ละรูป (px) */
  function tileSheet(paper, photo, { margin = 0.5, gap = 0.3, max = Infinity, dpi = DPI } = {}) {
    const W = cmToPx(paper.w, dpi), H = cmToPx(paper.h, dpi);
    const pw = cmToPx(photo.w, dpi), ph = cmToPx(photo.h, dpi);
    const m = cmToPx(margin, dpi), g = cmToPx(gap, dpi);
    const cols = Math.max(0, Math.floor((W - 2 * m + g) / (pw + g)));
    const rows = Math.max(0, Math.floor((H - 2 * m + g) / (ph + g)));
    const count = Math.min(cols * rows, max);
    // จัดให้อยู่กลางกระดาษ
    const usedW = cols * pw + Math.max(0, cols - 1) * g, usedH = rows * ph + Math.max(0, rows - 1) * g;
    const ox = Math.round((W - usedW) / 2), oy = Math.round((H - usedH) / 2);
    const pos = [];
    for (let i = 0; i < count; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      pos.push({ x: ox + c * (pw + g), y: oy + r * (ph + g), w: pw, h: ph });
    }
    return { W, H, pw, ph, cols, rows, capacity: cols * rows, count, pos };
  }

  /* เลย์เอาต์ตู้สติ๊กเกอร์: ช่องภาพอัตราส่วน 4:3 */
  function boothLayout(n, layout) {
    const P = 36, G = 18, FOOT = 150, HEAD = 70;
    let cols = 1, rows = n, cw = 560;
    if (n === 4 && layout === "grid") { cols = 2; rows = 2; cw = 520; }
    if (n === 1) cw = 900;
    if (n === 2 && layout === "grid") { cols = 2; rows = 1; cw = 520; }
    const ch = Math.round(cw * 3 / 4);
    const W = P * 2 + cols * cw + (cols - 1) * G;
    const H = HEAD + P + rows * ch + (rows - 1) * G + FOOT;
    const cells = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      cells.push({ x: P + c * (cw + G), y: HEAD + P / 2 + r * (ch + G), w: cw, h: ch });
    }
    return { W, H, cells, head: { x: 0, y: 0, w: W, h: HEAD }, foot: { x: 0, y: H - FOOT, w: W, h: FOOT } };
  }

  /* คำนวณการครอปรูปติดบัตรจากตำแหน่งใบหน้า: ศีรษะ (กลางกระหม่อมถึงคาง) ≈ 58% ของความสูงภาพ */
  function idCrop(face, out, { headRatio = 0.58, topRatio = 0.1 } = {}) {
    const eyeToChin = face.chinY - face.eyeY;
    const headH = eyeToChin * 2.05;             // ประมาณระยะกระหม่อมถึงคาง
    const topY = face.chinY - headH;
    const scale = (out.h * headRatio) / headH;  // px ของภาพต้นฉบับ -> px ของภาพผลลัพธ์
    const sx = face.cx - (out.w / 2) / scale;
    const sy = topY - (out.h * topRatio) / scale;
    return { scale, sx, sy, sw: out.w / scale, sh: out.h / scale };
  }

  /* ป้าย "ภาพจำลองชุด" มุมขวาล่างของภาพที่มีชุดจำลอง (ctx = CanvasRenderingContext2D) — ใช้ร่วมกับ studio.js */
  function previewMark(x, W, H, text) {
    const fs = Math.max(9, Math.round(Math.min(W, H) * .034)), pad = Math.round(fs * .45);
    x.save(); x.font = `600 ${fs}px Prompt, "Noto Sans Thai", sans-serif`; x.textBaseline = "middle";
    const tw = x.measureText(text).width, bw = Math.min(W - 2 * pad, tw + 2 * pad), bh = fs + pad, bx = W - bw - pad, by = H - bh - pad;
    x.fillStyle = "rgba(14,20,48,.62)"; x.beginPath(); if (x.roundRect) x.roundRect(bx, by, bw, bh, bh / 2); else x.rect(bx, by, bw, bh); x.fill();
    x.fillStyle = "#fff"; x.fillText(text, bx + pad, by + bh / 2, bw - 2 * pad); x.restore();
    return { x: bx, y: by, w: bw, h: bh };
  }

  const api = { DPI, cmToPx, ID_SIZES, PAPERS, tileSheet, boothLayout, idCrop, previewMark };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PBLayout = api;
})(typeof window !== "undefined" ? window : globalThis);

/* ตรวจคุณภาพสินค้าบนสายการผลิต (ตัวอย่าง: ขวดเครื่องดื่ม) — machine vision แบบประมวลผลภาพดั้งเดิม (ไม่ใช้โมเดล ML ไม่ใช้ WebGL)
   ส่วนบน: ฟังก์ชันคำนวณล้วน (ทดสอบด้วย Node ได้) ทำงานกับวัตถุแบบ ImageData {data, width, height}
   ส่วนล่าง: หน้าจอ */

const QC = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lumAt = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  // ROI เก็บเป็นสัดส่วน 0..1 ของภาพ -> แปลงเป็นพิกเซล
  function roiPx(roi, W, H) {
    if (!roi) return null;
    const x = clamp(Math.round(roi.x * W), 0, W - 1), y = clamp(Math.round(roi.y * H), 0, H - 1);
    const w = clamp(Math.round(roi.w * W), 1, W - x), h = clamp(Math.round(roi.h * H), 1, H - y);
    return { x, y, w, h };
  }

  // ---------- โปรไฟล์ความสว่าง / ขอบ ----------
  function rowProfile(img, r) {
    const { data, width } = img, out = new Float32Array(r.h);
    for (let y = 0; y < r.h; y++) {
      let s = 0, i = ((r.y + y) * width + r.x) * 4;
      for (let x = 0; x < r.w; x++, i += 4) s += lumAt(data, i);
      out[y] = s / r.w;
    }
    return out;
  }

  function smooth(a, rad = 2) {
    const n = a.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -rad; k <= rad; k++) { const j = i + k; if (j >= 0 && j < n) { s += a[j]; c++; } }
      out[i] = s / c;
    }
    return out;
  }

  function gradient(a, k = 2) {
    const n = a.length, g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = a[Math.min(n - 1, i + k)] - a[Math.max(0, i - k)];
    return g;
  }

  /* หาขอบแนวนอนที่แรงที่สุดในโปรไฟล์ (เช่น ผิวน้ำ/meniscus)
     mode "dark"   = ด้านล่างมืดกว่า (น้ำมืดกว่าอากาศ) -> ความสว่างลดลงเมื่อลงล่าง
     mode "bright" = ด้านล่างสว่างกว่า (ไฟส่องหลัง/น้ำสว่างกว่า)
     mode "abs"    = ขอบทิศใดก็ได้
     คืน y (ทศนิยม = กึ่งกลางช่วงที่ไล่ระดับสูงสุด) หรือ null ถ้าคอนทราสต์ต่ำกว่า minContrast */
  function findEdge(profile, mode = "dark", minContrast = 12, k = 2) {
    const n = profile.length;
    if (n < 2 * k + 2) return { y: null, strength: 0 };
    const g = gradient(smooth(profile, 1), k);
    const val = i => mode === "bright" ? g[i] : mode === "abs" ? Math.abs(g[i]) : -g[i];
    let best = -Infinity, bi = -1;
    for (let i = k; i < n - k; i++) { const v = val(i); if (v > best) { best = v; bi = i; } }
    if (bi < 0 || best < minContrast) return { y: null, strength: Math.max(0, best) };
    let a = bi, b = bi;
    while (a - 1 >= k && val(a - 1) >= best * 0.98) a--;
    while (b + 1 < n - k && val(b + 1) >= best * 0.98) b++;
    return { y: (a + b) / 2, strength: best };
  }

  // y ในภาพ: ค่าน้อย = สูงกว่า -> ระดับน้ำสูงเกิน
  function classifyFill(y, target, tolPx) {
    if (y == null) return "nolevel";
    if (y < target - tolPx) return "over";
    if (y > target + tolPx) return "under";
    return "ok";
  }

  // ---------- สี ----------
  function rgbToLab(r, g, b) {
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); // CIE76

  // หน้ากากพิกเซลที่ต่างจากภาพพื้นหลังว่าง (ระยะ RGB > thr)
  function fgMask(img, bg, r, thr = 40) {
    const m = new Uint8Array(r.w * r.h), d = img.data, e = bg.data, W = img.width, t2 = thr * thr;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * W + r.x + x) * 4;
      const dr = d[i] - e[i], dg = d[i + 1] - e[i + 1], db = d[i + 2] - e[i + 2];
      m[y * r.w + x] = dr * dr + dg * dg + db * db > t2 ? 1 : 0;
    }
    return m;
  }

  /* วิเคราะห์ฝา: coverage = สัดส่วนพื้นที่ที่มีวัตถุ (ต่างจากพื้นหลัง), สีเฉลี่ย Lab ของส่วนที่เป็นฝา,
     ขอบบนของฝาแยกครึ่งซ้าย/ขวา -> มุมเอียง และความสูงขอบบน (ฝาปิดไม่สนิทจะลอยสูงขึ้น)
     มีภาพพื้นหลังว่าง: เทียบรายพิกเซล / ไม่มี: ใช้สีเฉลี่ยของ 2 แถวบนสุดของ ROI เป็นพื้นหลัง (ต้องเว้นขอบเหนือฝา) */
  function capAnalyze(img, r, bg) {
    const d = img.data, W = img.width;
    let mask;
    if (bg) mask = fgMask(img, bg, r);
    else {
      let br = 0, bgc = 0, bb = 0, c = 0;
      for (let y = 0; y < Math.min(2, r.h); y++) for (let x = 0; x < r.w; x++) { const i = ((r.y + y) * W + r.x + x) * 4; br += d[i]; bgc += d[i + 1]; bb += d[i + 2]; c++; }
      const ref = rgbToLab(br / c, bgc / c, bb / c);
      mask = new Uint8Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const i = ((r.y + y) * W + r.x + x) * 4;
        mask[y * r.w + x] = deltaE(rgbToLab(d[i], d[i + 1], d[i + 2]), ref) > 20 ? 1 : 0;
      }
    }
    let n = 0, sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!mask[y * r.w + x]) continue;
      const i = ((r.y + y) * W + r.x + x) * 4;
      n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
    }
    const coverage = n / (r.w * r.h);
    const lab = n ? rgbToLab(sr / n, sg / n, sb / n) : [0, 0, 0];
    /* ขอบบนของฝา: หาขอบในแต่ละคอลัมน์ (พื้นหลัง->ฝา) แล้วใช้มัธยฐานของครึ่งซ้ายและครึ่งขวา
       มุมเอียง = atan(ผลต่างความสูงซ้าย-ขวา / ระยะห่างแนวนอน) */
    const half = Math.max(1, r.w >> 1), tops = [[], []], col = new Float32Array(r.h);
    for (let x = 0; x < r.w; x++) {
      for (let y = 0; y < r.h; y++) col[y] = mask[y * r.w + x];
      const e = findEdge(col, "bright", 0.5, 1);
      if (e.y != null) tops[x < half ? 0 : 1].push([x, e.y]);
    }
    const med = a => { const s = a.slice().sort((p, q) => p - q); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null; };
    let angle = null, topY = null, topL = null, topR = null, xL = null, xR = null;
    if (tops[0].length >= 2 && tops[1].length >= 2) {
      topL = med(tops[0].map(t => t[1])); topR = med(tops[1].map(t => t[1]));
      xL = med(tops[0].map(t => t[0])); xR = med(tops[1].map(t => t[0]));
      angle = Math.atan2(topR - topL, Math.max(1, xR - xL)) * 180 / Math.PI; // + = ด้านขวาต่ำกว่า
      topY = r.y + (topL + topR) / 2;
    }
    return { coverage, lab, angle, topY, topL, topR, xL, xR };
  }

  function capJudge(m, g, tol) {
    const out = { reasons: [], de: null, dAngle: null, dTop: null };
    if (m.coverage < g.coverage * tol.capCov / 100) { out.reasons.push("capMissing"); return out; }
    out.de = deltaE(m.lab, g.lab);
    if (out.de > tol.capDE) out.reasons.push("capColor");
    if (m.angle != null && g.angle != null) {
      out.dAngle = m.angle - g.angle;
      if (Math.abs(out.dAngle) > tol.capTilt) out.reasons.push("capTilt");
    }
    if (m.topY != null && g.topY != null) {
      out.dTop = g.topY - m.topY; // + = ฝาลอยสูงกว่าตัวอย่าง
      if (out.dTop > tol.capHigh) out.reasons.push("capHigh");
    }
    return out;
  }

  // ---------- ฉลาก ----------
  // ความหนาแน่นขอบ: |dL/dx|+|dL/dy| > thr  และโปรไฟล์ขอบรายแถว (ใช้หาการเลื่อนแนวตั้ง)
  function edgeMap(img, r, thr = 40) {
    const d = img.data, W = img.width, rows = new Float32Array(r.h);
    let cnt = 0;
    const L = (x, y) => lumAt(d, (y * W + x) * 4);
    for (let y = 0; y < r.h; y++) {
      const yy = r.y + y, y0 = Math.max(r.y, yy - 1), y1 = Math.min(r.y + r.h - 1, yy + 1);
      let c = 0;
      for (let x = 0; x < r.w; x++) {
        const xx = r.x + x, x0 = Math.max(r.x, xx - 1), x1 = Math.min(r.x + r.w - 1, xx + 1);
        if (Math.abs(L(x1, yy) - L(x0, yy)) + Math.abs(L(xx, y1) - L(xx, y0)) > thr) c++;
      }
      rows[y] = c / r.w; cnt += c;
    }
    return { density: cnt / (r.w * r.h), rows };
  }

  // ฮิสโตแกรมสี RGB แบบ bins^3 (ค่าเริ่มต้น 4x4x4 = 64 ช่อง) ทำให้ผลรวม = 1
  function colorHist(img, r, bins = 4) {
    const d = img.data, W = img.width, h = new Float32Array(bins * bins * bins), q = 256 / bins;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const i = ((r.y + y) * W + r.x + x) * 4;
      h[((d[i] / q | 0) * bins + (d[i + 1] / q | 0)) * bins + (d[i + 2] / q | 0)]++;
    }
    const n = r.w * r.h;
    for (let i = 0; i < h.length; i++) h[i] /= n;
    return h;
  }

  // สหสัมพันธ์เพียร์สัน (แบบ OpenCV HISTCMP_CORREL) -1..1
  function histCorrelation(a, b) {
    const n = Math.min(a.length, b.length);
    if (!n) return 0;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    if (saa === 0 && sbb === 0) return 1;
    if (saa === 0 || sbb === 0) return 0;
    return sab / Math.sqrt(saa * sbb);
  }

  // หาระยะเลื่อน s ที่ทำให้ a[i] ≈ b[i - s] มากที่สุด (+ = a เลื่อนลงจาก b)
  function bestShift(a, b, maxShift) {
    const n = Math.min(a.length, b.length);
    let best = { shift: 0, score: -Infinity };
    for (let s = -maxShift; s <= maxShift; s++) {
      const lo = Math.max(0, s), hi = Math.min(n, n + s);
      if (hi - lo < n / 2) continue;
      const sc = histCorrelation(a.slice(lo, hi), b.slice(lo - s, hi - s));
      if (sc > best.score + 1e-9 || (Math.abs(sc - best.score) <= 1e-9 && Math.abs(s) < Math.abs(best.shift))) best = { shift: s, score: sc };
    }
    return best;
  }

  function labelAnalyze(img, r) {
    const e = edgeMap(img, r);
    return { edge: e.density, rows: Array.from(e.rows, v => +v.toFixed(4)), hist: Array.from(colorHist(img, r), v => +v.toFixed(5)) };
  }

  function labelJudge(m, g, tol) {
    const sim = histCorrelation(m.hist, g.hist) * 100;
    const edgeRatio = g.edge > 0 ? m.edge / g.edge : 1;
    const sh = bestShift(m.rows, g.rows, Math.max(1, Math.round(g.rows.length / 3)));
    const out = { sim, edgeRatio, shift: sh.shift, reasons: [] };
    if (edgeRatio < 0.4 || sim < 30) out.reasons.push("labelMissing");
    else if (sim < tol.labelSim || Math.abs(sh.shift) > tol.labelShift) out.reasons.push("labelShift");
    return out;
  }

  // ---------- ทริกเกอร์ ----------
  // สัดส่วนพิกเซลใน ROI ที่ความสว่างต่างจากภาพอ้างอิง > thr และจุดศูนย์กลาง (0..1) ของพิกเซลเหล่านั้น
  function diffStats(img, ref, r, thr = 30, step = 2) {
    const a = img.data, b = ref.data, W = img.width;
    let n = 0, hit = 0, sx = 0, sy = 0;
    for (let y = 0; y < r.h; y += step) for (let x = 0; x < r.w; x += step) {
      const i = ((r.y + y) * W + r.x + x) * 4;
      n++;
      if (Math.abs(lumAt(a, i) - lumAt(b, i)) > thr) { hit++; sx += x; sy += y; }
    }
    return { frac: n ? hit / n : 0, cx: hit ? sx / hit / Math.max(1, r.w - 1) : 0.5, cy: hit ? sy / hit / Math.max(1, r.h - 1) : 0.5 };
  }

  /* สถานะการมีขวดในพื้นที่ทริกเกอร์: empty -> present -> (ตรวจ 1 ครั้ง) done -> empty
     obs = {frac, cx, motion}  cfg = {on, off, centerTol, motionMax, requireStill, stableFrames, leaveFrames}
     event: "enter" | "inspect" | "left" | "missed" | null */
  function presenceInit() { return { phase: "empty", stable: 0, below: 0, since: 0 }; }
  function presenceStep(st, obs, now, cfg) {
    const s = { ...st };
    let event = null;
    if (s.phase === "empty") {
      if (obs.frac >= cfg.on) { s.phase = "present"; s.stable = 0; s.below = 0; s.since = now; event = "enter"; }
      return { st: s, event };
    }
    if (obs.frac < cfg.off) {
      s.below++;
      if (s.below >= cfg.leaveFrames) {
        event = s.phase === "present" ? "missed" : "left";
        return { st: { phase: "empty", stable: 0, below: 0, since: now }, event };
      }
      return { st: s, event };
    }
    s.below = 0;
    if (s.phase === "present") {
      const centred = Math.abs(obs.cx - 0.5) <= cfg.centerTol && obs.frac >= cfg.on;
      const still = !cfg.requireStill || obs.motion <= cfg.motionMax;
      s.stable = centred && still ? s.stable + 1 : 0;
      if (s.stable >= cfg.stableFrames) { s.phase = "done"; event = "inspect"; }
    }
    return { st: s, event };
  }

  // ---------- การตรวจทั้งขวด ----------
  const REASONS = {
    under: "ระดับน้ำต่ำกว่าเกณฑ์", over: "ระดับน้ำเกินเกณฑ์", nolevel: "ไม่พบระดับน้ำ",
    capMissing: "ไม่มีฝา", capColor: "สีฝาไม่ถูกต้อง", capTilt: "ฝาเอียง", capHigh: "ฝาปิดไม่สนิท (ยกสูง)",
    labelMissing: "ไม่มีฉลาก", labelShift: "ฉลากเบี้ยว/ผิดตำแหน่ง"
  };
  const SHORT = { under: "น้ำต่ำ", over: "น้ำเกิน", nolevel: "ไม่พบระดับ", capMissing: "ไม่มีฝา", capColor: "สีฝา", capTilt: "ฝาเอียง", capHigh: "ฝายก", labelMissing: "ไม่มีฉลาก", labelShift: "ฉลากเบี้ยว" };

  const fillTolPx = (rec, fr) => rec.tol.fillUnit === "%" ? rec.tol.fill / 100 * fr.h : rec.tol.fill;

  function calibrate(img, rec, bg) {
    const W = img.width, H = img.height, g = { ts: Date.now() };
    const fr = roiPx(rec.rois.fill, W, H), cr = roiPx(rec.rois.cap, W, H), lr = roiPx(rec.rois.label, W, H);
    if (!fr && !cr && !lr) throw new Error("ยังไม่ได้กำหนดพื้นที่ตรวจ (ระดับน้ำ / ฝา / ฉลาก)");
    if (fr) {
      const e = findEdge(rowProfile(img, fr), rec.mode, rec.tol.minContrast);
      if (e.y == null) throw new Error("ไม่พบระดับน้ำในพื้นที่ตรวจระดับน้ำ ลองเปลี่ยนโหมดน้ำมืด/สว่าง หรือขยายพื้นที่");
      g.fillYN = (fr.y + e.y) / H; g.fillStrength = e.strength;
    }
    if (cr) {
      const m = capAnalyze(img, cr, bg);
      if (m.coverage < 0.05) throw new Error("ไม่พบฝาในพื้นที่ตรวจฝา (ภาพเหมือนพื้นหลังว่าง)");
      g.cap = { coverage: m.coverage, lab: m.lab.map(v => +v.toFixed(2)), angle: m.angle, topYN: m.topY == null ? null : m.topY / H, withBg: !!bg };
    }
    if (lr) {
      g.label = labelAnalyze(img, lr);
      if (g.label.edge < 0.005) throw new Error("พื้นที่ฉลากแทบไม่มีลวดลาย ตรวจฉลากไม่ได้");
    }
    return g;
  }

  function inspect(img, rec, bg) {
    const W = img.width, H = img.height, g = rec.golden, tol = rec.tol;
    const res = { t: Date.now(), reasons: [], fill: null, cap: null, label: null };
    const fr = roiPx(rec.rois.fill, W, H);
    if (fr && g.fillYN != null) {
      const e = findEdge(rowProfile(img, fr), rec.mode, tol.minContrast);
      const target = g.fillYN * H, tolPx = fillTolPx(rec, fr), y = e.y == null ? null : fr.y + e.y;
      const status = classifyFill(y, target, tolPx);
      res.fill = { y, target, tolPx, status, strength: e.strength, dy: y == null ? null : y - target };
      if (status !== "ok") res.reasons.push(status);
    }
    const cr = roiPx(rec.rois.cap, W, H);
    if (cr && g.cap) {
      const useBg = g.cap.withBg && bg ? bg : null;
      const m = capAnalyze(img, cr, useBg);
      const gg = { ...g.cap, topY: g.cap.topYN == null ? null : g.cap.topYN * H };
      const j = capJudge(m, gg, tol);
      res.cap = { ...m, ...j };
      res.reasons.push(...j.reasons);
    }
    const lr = roiPx(rec.rois.label, W, H);
    if (lr && g.label) {
      const m = labelAnalyze(img, lr), j = labelJudge(m, g.label, tol);
      res.label = { edge: m.edge, ...j };
      res.reasons.push(...j.reasons);
    }
    res.pass = res.reasons.length === 0;
    return res;
  }

  // ---------- ภาพจำลองสายการผลิต (วาดลงอาร์เรย์พิกเซลโดยตรง ใช้ได้ทั้งเบราว์เซอร์และ Node) ----------
  const SIM_TYPES = {
    "600": { bodyW: 96, bodyH: 190, shoulder: 40, neckW: 36, neckH: 74, capW: 44, capH: 24, labelOff: 40, labelH: 78 },
    "1500": { bodyW: 124, bodyH: 240, shoulder: 46, neckW: 38, neckH: 56, capW: 46, capH: 24, labelOff: 56, labelH: 96 }
  };
  const SIM_DEFECTS = ["under", "over", "capMissing", "capColor", "capTilt", "capHigh", "labelMissing", "labelShift"];

  function simGeom(type, W = 640, H = 480) {
    const t = SIM_TYPES[type] || SIM_TYPES["600"], belt = Math.round(H * 0.86);
    const bodyTop = belt - t.bodyH, neckBottom = bodyTop - t.shoulder, neckTop = neckBottom - t.neckH;
    const capBottom = neckTop + 6, capTop = capBottom - t.capH;
    const fillY = Math.round(neckTop + t.neckH * 0.55), labelTop = bodyTop + t.labelOff;
    const cx = W / 2, n = (x, y, w, h) => ({ x: x / W, y: y / H, w: w / W, h: h / H });
    return {
      ...t, W, H, belt, bodyTop, neckBottom, neckTop, capTop, capBottom, fillY, labelTop,
      rois: {
        trigger: n(cx - 100, neckTop - 20, 200, belt - (neckTop - 20) - 2),
        fill: n(cx - 8, neckTop + 10, 16, neckBottom + 16 - (neckTop + 10)),
        cap: n(cx - 32, capTop - 14, 64, t.capH + 14 - 2),
        label: n(cx - t.bodyW / 2 + 8, labelTop - 12, t.bodyW - 16, t.labelH + 24)
      }
    };
  }

  function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function simBackground(img, G, beltShift = 0) {
    const d = img.data, W = img.width, H = img.height;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (y >= G.belt) { const v = ((x + beltShift) % 48 + 48) % 48 < 6 ? 88 : 62; d[i] = v; d[i + 1] = v; d[i + 2] = v + 4; }
      else { const v = 236 - Math.abs(x - W / 2) * 0.02; d[i] = v - 4; d[i + 1] = v; d[i + 2] = v + 2; }
      d[i + 3] = 255;
    }
  }

  function put(d, W, H, x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }

  function simBottle(img, G, cx, defect = null) {
    const d = img.data, W = img.width, H = img.height;
    cx = Math.round(cx);
    const fillY = G.fillY + Math.round(defect === "under" ? G.neckH * 0.35 : defect === "over" ? -G.neckH * 0.27 : 0);
    const half = y => y >= G.bodyTop ? G.bodyW / 2 : y >= G.neckBottom ? G.neckW / 2 + (G.bodyW - G.neckW) / 2 * (y - G.neckBottom) / G.shoulder : G.neckW / 2;
    for (let y = G.neckTop; y < G.belt; y++) {
      const hw = Math.round(half(y));
      for (let x = cx - hw; x <= cx + hw; x++) {
        const edge = x - (cx - hw) < 3 || (cx + hw) - x < 3;
        put(d, W, H, x, y, edge ? [112, 122, 132] : y >= fillY ? [92, 132, 168] : [204, 214, 222]);
      }
    }
    if (defect !== "labelMissing") {
      const top = G.labelTop + (defect === "labelShift" ? 22 : 0), lw = G.bodyW / 2 - 2;
      for (let y = 0; y < G.labelH; y++) for (let x = -lw; x <= lw; x++) {
        let c = [238, 236, 228];
        if (y < 8 || y >= G.labelH - 8) c = [24, 72, 160];
        else if (y >= 20 && y < 34 && ((x > -lw + 8 && x < -6) || (x > 2 && x < lw - 16))) c = [180, 36, 40];
        else if (y >= 42 && y < 50 && x > -lw + 14 && x < lw - 30) c = [24, 72, 160];
        else if (y >= 56 && y < 60 && x > -lw + 8 && x < 10) c = [90, 90, 90];
        put(d, W, H, cx + x, top + y, c);
      }
    }
    if (defect !== "capMissing") {
      const col = defect === "capColor" ? [200, 44, 40] : [30, 92, 200], lift = defect === "capHigh" ? 9 : 0;
      const hw = G.capW / 2, slope = defect === "capTilt" ? 16 / G.capW : 0;
      for (let x = -hw; x <= hw; x++) {
        const top = Math.round(G.capTop - lift + slope * x), bot = G.capBottom - lift + Math.round(slope * x);
        for (let y = top; y < bot; y++) put(d, W, H, cx + x, y, (y - top) % 6 === 5 ? [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8] : col);
      }
    }
  }

  function simNoise(img, seed, amp = 6) {
    const d = img.data, r = rnd(seed);
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  }

  // เฟรม ณ เวลา t (ms) สายพานแบบเดินหยุด: เข้า -> หยุดกลางภาพ -> ออก
  function simFrame(img, type, t, period = 2400, defectRate = 0.3) {
    const G = simGeom(type, img.width, img.height), W = img.width;
    const k = Math.floor(t / period), p = (t % period) / period;
    simBackground(img, G, Math.round(t * 0.12));
    let x;
    if (p < 0.38) { const q = p / 0.38; x = -80 + (W / 2 + 80) * (1 - (1 - q) * (1 - q)); }
    else if (p < 0.66) x = W / 2;
    else { const q = (p - 0.66) / 0.34; x = W / 2 + (W / 2 + 80) * q * q; }
    const r = rnd(k * 7919 + 13); r();
    const defect = r() < defectRate ? SIM_DEFECTS[Math.floor(r() * SIM_DEFECTS.length)] : null;
    simBottle(img, G, x, defect);
    simNoise(img, (t | 0) + 1);
    return { index: k, defect, x };
  }

  return {
    clamp, roiPx, rowProfile, smooth, gradient, findEdge, classifyFill, rgbToLab, deltaE, fgMask,
    capAnalyze, capJudge, edgeMap, colorHist, histCorrelation, bestShift, labelAnalyze, labelJudge,
    diffStats, presenceInit, presenceStep, calibrate, inspect, fillTolPx, REASONS, SHORT,
    simGeom, simBackground, simBottle, simNoise, simFrame, SIM_DEFECTS
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = QC;

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined") (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const K = { recipes: "qc-recipes", active: "qc-active", shift: "qc-shift", settings: "qc-settings" };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { engine("พื้นที่จัดเก็บในเบราว์เซอร์เต็ม กรุณาส่งออก CSV แล้วรีเซ็ตกะ", "err"); return false; } };
  const ROI_NAMES = { trigger: "ขวด/ทริกเกอร์", fill: "ระดับน้ำ", cap: "ฝา", label: "ฉลาก" };
  const ROI_COL = { trigger: "#2a78d6", fill: "#0e9fb8", cap: "#c9a45c", label: "#6250d6" };
  const FILL_TH = { ok: "ผ่าน", under: "ต่ำกว่าเกณฑ์", over: "เกินเกณฑ์", nolevel: "ไม่พบระดับน้ำ" };

  const defTol = () => ({ fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 });
  const defTrig = () => ({ on: 15, off: 5, requireStill: true, stableFrames: 3 });
  function simRecipe(type, name) {
    return { id: "sim-" + type, name, sim: type, rois: QC.simGeom(type).rois, mode: "dark", tol: defTol(), trig: defTrig(), golden: null, bg: null };
  }
  let recipes = load(K.recipes, null);
  if (!Array.isArray(recipes) || !recipes.length) recipes = [simRecipe("600", "ขวดใส 600 มล. (ภาพจำลอง)"), simRecipe("1500", "ขวดใส 1.5 ลิตร (ภาพจำลอง)")];
  let rec = recipes.find(r => r.id === load(K.active, "")) || recipes[0];
  const settings = { beep: true, webhookOn: false, webhook: "", ...load(K.settings, {}) };
  const newShift = () => ({ start: Date.now(), total: 0, pass: 0, reject: 0, missed: 0, reasons: {}, log: [], rejects: [] });
  let shift = { ...newShift(), ...load(K.shift, {}) };

  const frame = $("#frame"), fctx = frame.getContext("2d", { willReadFrequently: true });
  const overlay = $("#overlay"), octx = overlay.getContext("2d");
  const video = $("#video");
  let W = 640, H = 480, cur = null, prev = null, bg = null, source = "sim", running = false, stream = null;
  let simBuf = [], simT0 = performance.now(), simInfo = null, stillImg = null;
  let pst = QC.presenceInit(), last = null, lastAt = 0, trigObs = null, activeRoi = "fill", drag = null, fpsT = [];

  const bgOk = () => bg && bg.width === W && bg.height === H ? bg : null;
  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }
  function retryBtn(fn) { const b = document.createElement("button"); b.className = "btn ghost retry"; b.type = "button"; b.textContent = "ลองอีกครั้ง"; b.onclick = fn; $("#engine").append(" ", b); }
  const persistRecipes = () => { save(K.recipes, recipes); save(K.active, rec.id); };
  let shiftTimer = 0;
  const persistShift = () => { clearTimeout(shiftTimer); shiftTimer = setTimeout(() => save(K.shift, shift), 500); };

  function setSize(w, h) {
    W = 640; H = Math.max(120, Math.round(640 * h / w)) & ~1;
    if (frame.width !== W || frame.height !== H) { frame.width = overlay.width = W; frame.height = overlay.height = H; simBuf = []; prev = null; }
  }

  // ---------- แหล่งภาพ ----------
  function stopStream() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } video.pause(); video.removeAttribute("src"); video.srcObject = null; }
  function showSourceUi() {
    document.querySelectorAll("[data-src]").forEach(el => { el.hidden = !el.dataset.src.split(" ").includes(source); });
  }
  async function listCameras() {
    const sel = $("#camSel"), keep = sel.value;
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      sel.innerHTML = devs.length ? devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || "กล้อง " + (i + 1))}</option>`).join("") : `<option value="">ไม่พบกล้อง</option>`;
      if (devs.some(d => d.deviceId === keep)) sel.value = keep;
    } catch { sel.innerHTML = `<option value="">อ่านรายชื่อกล้องไม่ได้</option>`; }
  }
  let facing = "environment", mirrorCam = false, resumeCam = false; // กล้องหลังเป็นค่าเริ่มต้น กลับด้านภาพเฉพาะกล้องหน้า
  /* useDevice=false: ใช้ facingMode (ปุ่มสลับกล้องหน้า/หลัง) แทนกล้องที่เลือกในรายการ */
  async function startCamera(useDevice = true) {
    stopStream();
    engine("กำลังเปิดกล้อง...");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      const id = useDevice === true ? $("#camSel").value : "";
      const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
      stream = await navigator.mediaDevices.getUserMedia({ video: id ? { ...base, deviceId: { exact: id } } : { ...base, facingMode: { ideal: facing } }, audio: false });
      video.srcObject = stream; video.loop = false; await video.play();
      if (!video.videoWidth) await new Promise(r => video.addEventListener("loadedmetadata", r, { once: true }));
      await listCameras();
      const tr = stream.getVideoTracks()[0], ts = tr?.getSettings() || {};
      if (ts.deviceId && $("#camSel").value !== ts.deviceId) $("#camSel").value = ts.deviceId;
      if (ts.facingMode) facing = ts.facingMode === "user" ? "user" : "environment";
      mirrorCam = ts.facingMode === "user";
      setSize(video.videoWidth || 640, video.videoHeight || 480);
      engine(`กล้องพร้อม (${video.videoWidth}×${video.videoHeight}) — ประมวลผลภาพที่ความกว้าง ${W} พิกเซล`, "ok");
    } catch (e) {
      const m = {
        Insecure: "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด", NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในแถบที่อยู่ของเบราว์เซอร์",
        NotFoundError: "ไม่พบกล้อง ตรวจสอบสาย USB ของกล้อง", OverconstrainedError: "กล้องที่เลือกไม่พร้อมใช้งาน ลองเลือกกล้องตัวอื่น",
        NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่ ปิดโปรแกรมนั้นก่อน", AbortError: "เปิดกล้องไม่สำเร็จ (ถูกยกเลิก)"
      }[e.name];
      engine(`เปิดกล้องไม่ได้: ${m || "ข้อผิดพลาดไม่ทราบสาเหตุ"} (${e.name})`, "err");
      retryBtn(() => startCamera());
      if (e.name === "Insecure") { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "btn ghost retry"; a.textContent = "วิธีเปิดผ่าน https"; $("#engine").append(" ", a); }
    }
  }
  async function setSource(s) {
    source = s; mirrorCam = false; resumeCam = false; showSourceUi(); stopStream(); stillImg = null; prev = null; cur = null; running = false; $("#toggle").textContent = "เริ่มตรวจต่อเนื่อง"; renderRecipe(); pst = QC.presenceInit();
    if (s === "camera") { await listCameras(); startCamera(); }
    else if (s === "sim") { setSize(640, 480); simT0 = performance.now(); engine("ภาพจำลองสายการผลิต: สายพานเดิน-หยุด สุ่มขวดบกพร่องประมาณ 30% ใช้สูตร “ภาพจำลอง” แล้วกด “สอบเทียบภาพจำลองอัตโนมัติ”", "ok"); }
    else if (s === "video") engine("เลือกไฟล์วิดีโอของสายการผลิต (เล่นวนซ้ำ)");
    else if (s === "image") engine("เลือกรูปภาพขวด — ใช้รูปสายพานว่างสำหรับ “บันทึกพื้นหลังว่าง” และรูปขวดดีสำหรับ “บันทึกขวดตัวอย่างที่ผ่าน”");
  }
  $("#srcSel").onchange = e => setSource(e.target.value);
  $("#camSel").onchange = () => source === "camera" && startCamera();
  $("#flipCam").onclick = () => { if (source !== "camera") return; facing = facing === "user" ? "environment" : "user"; startCamera(false); };
  // หมุนจอมือถือ -> ขนาดภาพจากกล้องเปลี่ยน ปรับขนาดภาพประมวลผลตาม
  video.addEventListener("resize", () => { if (source === "camera" && video.videoWidth) setSize(video.videoWidth, video.videoHeight); });
  // ปิดกล้องเมื่อสลับแอป/ล็อกจอ แล้วเปิดใหม่เมื่อกลับมา
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (source === "camera" && stream) { resumeCam = true; stopStream(); } }
    else if (resumeCam) { resumeCam = false; if (source === "camera") startCamera(); }
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", listCameras);
  $("#videoFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    stopStream(); video.src = URL.createObjectURL(f); video.loop = true; video.muted = true;
    video.onloadedmetadata = () => { setSize(video.videoWidth, video.videoHeight); video.play().catch(() => {}); engine(`เล่นวิดีโอ ${f.name} (${video.videoWidth}×${video.videoHeight}) วนซ้ำ`, "ok"); };
    video.onerror = () => engine("เปิดไฟล์วิดีโอไม่ได้ (รูปแบบไม่รองรับ ลองใช้ MP4 H.264 หรือ WebM)", "err");
  };
  $("#imageFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      setSize(img.naturalWidth, img.naturalHeight); stillImg = img; URL.revokeObjectURL(img.src);
      engine(`โหลดรูป ${f.name} แล้ว`, "ok");
      grab(performance.now());
      if (rec.golden) runInspect("image");
    };
    img.onerror = () => engine("เปิดไฟล์รูปไม่ได้", "err");
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  };
  $("#simSpeed").onchange = () => { simT0 = performance.now(); };

  function grab(now) {
    if (source === "sim") {
      if (simBuf.length !== 2) simBuf = [new ImageData(W, H), new ImageData(W, H)];
      const img = simBuf[0] === cur ? simBuf[1] : simBuf[0];
      simInfo = QC.simFrame(img, rec.sim || "600", now - simT0, +$("#simSpeed").value);
      fctx.putImageData(img, 0, 0); prev = cur; cur = img; return true;
    }
    const src = source === "image" ? stillImg : video;
    if (!src || (src === video && video.readyState < 2)) return false;
    if (source === "camera" && mirrorCam) { fctx.save(); fctx.translate(W, 0); fctx.scale(-1, 1); fctx.drawImage(src, 0, 0, W, H); fctx.restore(); }
    else fctx.drawImage(src, 0, 0, W, H);
    prev = cur; cur = fctx.getImageData(0, 0, W, H); return true;
  }

  // ---------- พื้นหลังว่าง ----------
  function setBg(img, store = true) {
    bg = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    if (store) {
      try { rec.bg = frame.toDataURL("image/jpeg", 0.85); } catch { rec.bg = null; }
      if (!save(K.recipes, recipes)) rec.bg = null;
    }
    pst = QC.presenceInit();
    renderRecipe();
  }
  function loadBg() {
    bg = null; renderRecipe();
    if (!rec.bg) return;
    const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.drawImage(im, 0, 0, W, H); bg = x.getImageData(0, 0, W, H); renderRecipe(); };
    im.src = rec.bg;
  }
  $("#captureBg").onclick = () => {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    if (source === "sim") { const im = new ImageData(W, H), G = QC.simGeom(rec.sim || "600", W, H); QC.simBackground(im, G); QC.simNoise(im, 99); fctx.putImageData(im, 0, 0); setBg(im); return engine("บันทึกพื้นหลังว่างของภาพจำลองแล้ว", "ok"); }
    setBg(cur); engine("บันทึกพื้นหลังว่างแล้ว — ต้องไม่มีขวดอยู่ในภาพขณะบันทึก", "ok");
  };

  // ---------- สอบเทียบขวดตัวอย่าง ----------
  function calibrateFrom(img) {
    try {
      rec.golden = QC.calibrate(img, rec, bgOk());
      persistRecipes(); renderRecipe();
      const warn = rec.rois.cap && !bgOk() ? " (ยังไม่มีพื้นหลังว่าง: การแยก “ไม่มีฝา” กับ “สีฝาผิด” จะแม่นน้อยลง)" : "";
      engine("บันทึกขวดตัวอย่างที่ผ่านแล้ว" + warn, warn ? "warn" : "ok");
      last = QC.inspect(img, rec, bgOk()); lastAt = performance.now(); showResult(last);
    } catch (e) { engine("บันทึกขวดตัวอย่างไม่สำเร็จ: " + e.message, "err"); }
  }
  $("#captureGolden").onclick = () => {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    calibrateFrom(cur);
  };
  $("#simCalib").onclick = () => {
    const G = QC.simGeom(rec.sim || "600", W, H);
    rec.rois = JSON.parse(JSON.stringify(G.rois));
    const e = new ImageData(W, H); QC.simBackground(e, G); QC.simNoise(e, 99); setBg(e, false);
    try { const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(e, 0, 0); rec.bg = c.toDataURL("image/jpeg", 0.85); } catch {}
    const g = new ImageData(W, H); QC.simBackground(g, G); QC.simBottle(g, G, W / 2, null); QC.simNoise(g, 7);
    fctx.putImageData(g, 0, 0);
    calibrateFrom(g);
  };

  // ---------- การตรวจ ----------
  let actx = null;
  function beep() {
    if (!settings.beep) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = "square"; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
    } catch {}
  }
  function thumb() {
    const rs = Object.values(rec.rois).filter(Boolean).map(r => QC.roiPx(r, W, H));
    if (!rs.length) rs.push({ x: 0, y: 0, w: W, h: H });
    const x0 = Math.max(0, Math.min(...rs.map(r => r.x)) - 8), y0 = Math.max(0, Math.min(...rs.map(r => r.y)) - 8);
    const x1 = Math.min(W, Math.max(...rs.map(r => r.x + r.w)) + 8), y1 = Math.min(H, Math.max(...rs.map(r => r.y + r.h)) + 8);
    const c = document.createElement("canvas"), s = 110 / (y1 - y0);
    c.height = 110; c.width = Math.max(30, Math.round((x1 - x0) * s));
    const x = c.getContext("2d");
    x.drawImage(frame, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    x.drawImage(overlay, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    try { return c.toDataURL("image/jpeg", 0.7); } catch { return ""; }
  }
  function sendWebhook(r) {
    if (!settings.webhookOn || !settings.webhook) return;
    const body = { event: "reject", time: new Date(r.t).toISOString(), recipe: rec.name, reasons: r.reasons, reasonsTh: r.reasons.map(k => QC.REASONS[k]),
      fill: r.fill && { y: r.fill.y, target: r.fill.target, status: r.fill.status }, capDeltaE: r.cap?.de ?? null, capAngle: r.cap?.angle ?? null, labelSimilarity: r.label?.sim ?? null };
    fetch(settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); })
      .catch(e => engine(`ส่งสัญญาณคัดทิ้งไปยังเว็บฮุกไม่สำเร็จ: ${e.message} (ตรวจ URL และการตั้งค่า CORS ของปลายทาง)`, "warn"));
  }
  function runInspect(how) {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    if (!rec.golden) return engine("ยังไม่มีขวดตัวอย่าง: วางขวดที่ผ่านแล้วกด “บันทึกขวดตัวอย่างที่ผ่าน” ก่อน", "warn");
    const r = QC.inspect(cur, rec, bgOk());
    r.how = how; r.sim = source === "sim" ? simInfo?.defect || "ok" : "";
    last = r; lastAt = performance.now();
    drawOverlay();
    shift.total++;
    if (r.pass) shift.pass++;
    else {
      shift.reject++;
      r.reasons.forEach(k => { shift.reasons[k] = (shift.reasons[k] || 0) + 1; });
      shift.rejects.unshift({ t: r.t, reasons: r.reasons, img: thumb() });
      shift.rejects.length = Math.min(shift.rejects.length, 20);
      beep(); sendWebhook(r);
    }
    shift.log.push({
      t: r.t, recipe: rec.name, how, pass: r.pass, reasons: r.reasons,
      fy: r.fill?.y == null ? null : +r.fill.y.toFixed(1), ft: r.fill ? +r.fill.target.toFixed(1) : null, fs: r.fill?.status || "",
      cc: r.cap ? +(r.cap.coverage * 100).toFixed(1) : null, cde: r.cap?.de == null ? null : +r.cap.de.toFixed(1), ca: r.cap?.angle == null ? null : +r.cap.angle.toFixed(1),
      ls: r.label ? +r.label.sim.toFixed(1) : null, lsh: r.label ? r.label.shift : null, sim: r.sim
    });
    if (shift.log.length > 5000) { shift.log.splice(0, shift.log.length - 5000); }
    persistShift();
    showResult(r); renderStats();
  }
  $("#inspectNow").onclick = () => runInspect("manual");
  $("#toggle").onclick = () => {
    if (!running) {
      if (source === "image") return engine("โหมดตรวจต่อเนื่องใช้กับกล้อง วิดีโอ หรือภาพจำลอง — สำหรับรูปภาพให้กด “ตรวจเดี๋ยวนี้”", "warn");
      if (!rec.rois.trigger) return engine("ยังไม่ได้ลากพื้นที่ “ขวด/ทริกเกอร์” บนภาพ", "warn");
      if (!bg) return engine("โหมดต่อเนื่องต้องมีพื้นหลังว่าง: นำขวดออกจากภาพแล้วกด “บันทึกพื้นหลังว่าง”", "warn");
      if (!rec.golden) return engine("ยังไม่มีขวดตัวอย่าง: กด “บันทึกขวดตัวอย่างที่ผ่าน” ก่อน", "warn");
    }
    // เริ่มในสถานะ "ตรวจแล้ว": ถ้ามีขวดค้างอยู่ครึ่ง ๆ กลาง ๆ จะไม่ถูกนับว่าผ่านไปโดยไม่ได้ตรวจ รอขวดถัดไป
    running = !running; pst = { ...QC.presenceInit(), phase: "done" };
    $("#toggle").textContent = running ? "หยุดตรวจต่อเนื่อง" : "เริ่มตรวจต่อเนื่อง";
    $("#toggle").classList.toggle("on", running);
    engine(running ? "กำลังตรวจต่อเนื่อง: ตรวจขวดละ 1 ครั้งเมื่อขวดอยู่กลางพื้นที่ทริกเกอร์" : "หยุดตรวจต่อเนื่องแล้ว", "ok");
  };

  function showResult(r) {
    const b = $("#banner");
    b.className = "banner " + (r.pass ? "pass" : "reject");
    b.querySelector("b").textContent = r.pass ? "ผ่าน (PASS)" : "คัดทิ้ง (REJECT)";
    b.querySelector("span").textContent = r.pass ? "ขวดนี้ผ่านทุกจุดตรวจ" : r.reasons.map(k => QC.REASONS[k]).join(" · ");
    const f1 = v => v == null ? "—" : (+v).toFixed(1);
    const rows = [];
    if (r.fill) rows.push(["ระดับน้ำ", FILL_TH[r.fill.status], r.fill.y == null ? "ไม่พบขอบผิวน้ำ" : `ต่างจากเป้า ${r.fill.dy > 0 ? "+" : ""}${f1(r.fill.dy)} px (เกณฑ์ ±${f1(r.fill.tolPx)}, ค่า + = ต่ำกว่า)`, r.fill.status === "ok"]);
    if (r.cap) {
      const c = r.cap, miss = c.reasons.includes("capMissing");
      rows.push(["ฝา: มี/ไม่มี", miss ? "ไม่มีฝา" : "มีฝา", `พื้นที่ ${f1(c.coverage * 100)}% ของ ROI`, !miss]);
      if (!miss) {
        rows.push(["ฝา: สี", c.reasons.includes("capColor") ? "ผิดสี" : "ถูกต้อง", `ΔE ${f1(c.de)} (เกณฑ์ ≤ ${rec.tol.capDE})`, !c.reasons.includes("capColor")]);
        rows.push(["ฝา: เอียง/ยก", c.reasons.includes("capTilt") ? "เอียง" : c.reasons.includes("capHigh") ? "ยกสูง" : "ปกติ", `มุม ${f1(c.dAngle)}° · สูงกว่าตัวอย่าง ${f1(c.dTop)} px`, !c.reasons.includes("capTilt") && !c.reasons.includes("capHigh")]);
      }
    }
    if (r.label) rows.push(["ฉลาก", r.label.reasons.length ? QC.REASONS[r.label.reasons[0]] : "ถูกต้อง", `ความคล้าย ${f1(r.label.sim)}% · ขอบ ${f1(r.label.edgeRatio * 100)}% · เลื่อน ${r.label.shift} px`, !r.label.reasons.length]);
    $("#measure").innerHTML = rows.map(([k, v, d, ok]) => `<tr class="${ok ? "" : "bad"}"><th>${k}</th><td>${esc(v)}</td><td>${esc(d)}</td></tr>`).join("") ||
      `<tr><td colspan="3">ไม่มีพื้นที่ตรวจที่สอบเทียบแล้ว</td></tr>`;
    if (r.sim !== undefined && r.sim !== "") $("#simTruth").textContent = `ภาพจำลองสร้างข้อบกพร่อง: ${r.sim === "ok" ? "ไม่มี (ขวดดี)" : QC.REASONS[r.sim]}`;
    else $("#simTruth").textContent = "";
  }

  // ---------- วาดซ้อนบนภาพ ----------
  function drawOverlay() {
    octx.clearRect(0, 0, W, H);
    octx.lineWidth = 2; octx.font = "13px Prompt, sans-serif";
    for (const k of Object.keys(ROI_NAMES)) {
      const r = QC.roiPx(rec.rois[k], W, H); if (!r) continue;
      octx.strokeStyle = ROI_COL[k]; octx.setLineDash(k === activeRoi ? [] : [6, 4]); octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      octx.setLineDash([]);
      const tw = octx.measureText(ROI_NAMES[k]).width + 8;
      const ty = k === "trigger" ? r.y + r.h - 18 : r.y - 18 < 0 ? r.y + r.h : r.y - 18;
      const tx = k === "label" ? r.x + r.w - tw : k === "fill" ? r.x + r.w + 4 : r.x;
      octx.fillStyle = ROI_COL[k]; octx.fillRect(tx, ty, tw, 18); octx.fillStyle = "#fff"; octx.fillText(ROI_NAMES[k], tx + 4, ty + 14);
    }
    const fr = QC.roiPx(rec.rois.fill, W, H);
    if (fr && rec.golden?.fillYN != null) {
      const t = rec.golden.fillYN * H, tp = QC.fillTolPx(rec, fr);
      octx.fillStyle = "rgba(26,127,75,.22)"; octx.fillRect(fr.x - 24, t - tp, fr.w + 48, tp * 2);
      octx.strokeStyle = "rgba(26,127,75,.8)"; octx.setLineDash([3, 3]); octx.beginPath(); octx.moveTo(fr.x - 24, t); octx.lineTo(fr.x + fr.w + 24, t); octx.stroke(); octx.setLineDash([]);
    }
    if (drag) {
      octx.strokeStyle = ROI_COL[activeRoi]; octx.lineWidth = 2;
      octx.strokeRect(Math.min(drag.x0, drag.x1) * W, Math.min(drag.y0, drag.y1) * H, Math.abs(drag.x1 - drag.x0) * W, Math.abs(drag.y1 - drag.y0) * H);
    }
    const fresh = last && (!running || performance.now() - lastAt < 2500);
    if (fresh) {
      const r = last;
      if (r.fill && fr && r.fill.y != null) {
        octx.strokeStyle = r.fill.status === "ok" ? "#1a7f4b" : "#c0392b"; octx.lineWidth = 3;
        octx.beginPath(); octx.moveTo(fr.x - 30, r.fill.y); octx.lineTo(fr.x + fr.w + 30, r.fill.y); octx.stroke();
      }
      const cr = QC.roiPx(rec.rois.cap, W, H);
      if (r.cap && cr && r.cap.topL != null && r.cap.topR != null) {
        octx.strokeStyle = r.cap.reasons.length ? "#c0392b" : "#1a7f4b"; octx.lineWidth = 2;
        octx.beginPath(); octx.moveTo(cr.x + r.cap.xL, cr.y + r.cap.topL); octx.lineTo(cr.x + r.cap.xR, cr.y + r.cap.topR); octx.stroke();
      }
      octx.font = "600 22px Prompt, sans-serif";
      const txt = r.pass ? "ผ่าน" : "คัดทิ้ง", tw = octx.measureText(txt).width + 20;
      octx.fillStyle = r.pass ? "rgba(26,127,75,.9)" : "rgba(192,57,43,.92)"; octx.fillRect(10, 10, tw, 34);
      octx.fillStyle = "#fff"; octx.fillText(txt, 20, 35);
    }
    if (running && trigObs) {
      const tr = QC.roiPx(rec.rois.trigger, W, H);
      const ph = { empty: "รอขวด", present: "พบขวด รอให้อยู่กลาง/นิ่ง", done: "ตรวจแล้ว รอขวดออก" }[pst.phase];
      octx.font = "13px Prompt, sans-serif"; octx.fillStyle = "rgba(11,42,60,.8)";
      const s = `${ph} · ${(trigObs.frac * 100).toFixed(0)}%`, tw = octx.measureText(s).width + 12;
      octx.fillRect(W - tw - 10, 10, tw, 22); octx.fillStyle = "#fff"; octx.fillText(s, W - tw - 4, 26);
      if (tr && trigObs.frac > 0.02) { octx.fillStyle = "#2a78d6"; octx.beginPath(); octx.arc(tr.x + trigObs.cx * tr.w, tr.y + tr.h / 2, 5, 0, 7); octx.fill(); }
    }
  }

  // ---------- ลาก ROI ----------
  const pt = e => { const b = overlay.getBoundingClientRect(); return { x: QC.clamp((e.clientX - b.left) / b.width, 0, 1), y: QC.clamp((e.clientY - b.top) / b.height, 0, 1) }; };
  overlay.addEventListener("pointerdown", e => { const p = pt(e); drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; overlay.setPointerCapture(e.pointerId); });
  overlay.addEventListener("pointermove", e => { if (!drag) return; const p = pt(e); drag.x1 = p.x; drag.y1 = p.y; if (source === "image") drawOverlay(); });
  overlay.addEventListener("pointerup", () => {
    if (!drag) return;
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    drag = null;
    if (r.w * W < 6 || r.h * H < 6) { drawOverlay(); return engine("พื้นที่เล็กเกินไป ลากให้กว้างกว่านี้", "warn"); }
    rec.rois[activeRoi] = r;
    if (activeRoi !== "trigger" && rec.golden) { rec.golden = null; engine(`เปลี่ยนพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว ต้องบันทึกขวดตัวอย่างที่ผ่านใหม่`, "warn"); }
    else engine(`กำหนดพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว`, "ok");
    persistRecipes(); renderRecipe(); drawOverlay();
  });
  overlay.addEventListener("pointercancel", () => { drag = null; });
  $("#roiChips").onclick = e => {
    const b = e.target.closest("button[data-roi]"); if (!b) return;
    activeRoi = b.dataset.roi; renderRecipe(); drawOverlay();
  };
  $("#clearRoi").onclick = () => { rec.rois[activeRoi] = null; if (activeRoi !== "trigger") rec.golden = null; persistRecipes(); renderRecipe(); drawOverlay(); engine(`ลบพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว (ไม่ตรวจจุดนี้)`, "ok"); };

  // ---------- สูตรการตรวจ ----------
  function renderRecipe() {
    $("#recipeSel").innerHTML = recipes.map(r => `<option value="${esc(r.id)}"${r === rec ? " selected" : ""}>${esc(r.name)}</option>`).join("");
    $("#recipeName").value = rec.name;
    $("#roiChips").innerHTML = Object.keys(ROI_NAMES).map(k => `<button type="button" class="chip${k === activeRoi ? " active" : ""}" data-roi="${k}" style="--c:${ROI_COL[k]}">${rec.rois[k] ? "●" : "○"} ${ROI_NAMES[k]}</button>`).join("");
    renderInfo();
    const f = $("#tolForm"), t = rec.tol;
    for (const k of Object.keys(t)) if (f.elements[k]) f.elements[k].value = t[k];
    f.elements.mode.value = rec.mode;
    for (const k of ["on", "off", "stableFrames"]) f.elements["trig_" + k].value = rec.trig[k];
    f.elements.trig_requireStill.checked = rec.trig.requireStill;
    $("#simCalib").hidden = source !== "sim";
    $("#simCalib").disabled = !rec.sim;
    $("#simCalib").title = rec.sim ? "" : "ใช้ได้กับสูตรภาพจำลองเท่านั้น";
  }
  function renderInfo() {
    const g = rec.golden;
    $("#goldenInfo").innerHTML = [
      `พื้นหลังว่าง: <b>${bgOk() ? "มีแล้ว" : bg ? "ขนาดไม่ตรงกับภาพปัจจุบัน" : "ยังไม่มี"}</b>`,
      `ขวดตัวอย่าง: <b>${g ? new Date(g.ts).toLocaleString("th-TH") : "ยังไม่บันทึก"}</b>`,
      g && g.fillYN != null ? `ระดับน้ำอ้างอิง y = ${(g.fillYN * H).toFixed(1)} px` : "",
      g && g.cap ? `สีฝา L*a*b* = ${g.cap.lab.map(v => v.toFixed(0)).join(", ")} · พื้นที่ฝา ${(g.cap.coverage * 100).toFixed(0)}%` : "",
      g && g.label ? `ความหนาแน่นขอบฉลาก ${(g.label.edge * 100).toFixed(1)}%` : ""
    ].filter(Boolean).map(s => `<li>${s}</li>`).join("");
  }
  $("#tolForm").addEventListener("input", e => {
    const el = e.target;
    if (el.name === "mode") rec.mode = el.value;
    else if (el.name.startsWith("trig_")) { const k = el.name.slice(5); rec.trig[k] = el.type === "checkbox" ? el.checked : +el.value; }
    else if (el.name === "fillUnit") rec.tol.fillUnit = el.value;
    else if (el.name in rec.tol && el.value !== "" && isFinite(+el.value)) rec.tol[el.name] = +el.value;
    if (el.name === "mode" || el.name === "minContrast") { if (rec.golden) { rec.golden = null; engine("เปลี่ยนโหมดการหาระดับน้ำแล้ว ต้องบันทึกขวดตัวอย่างใหม่", "warn"); } }
    persistRecipes(); renderInfo();
  });
  $("#tolForm").addEventListener("submit", e => e.preventDefault());
  $("#recipeSel").onchange = e => { rec = recipes.find(r => r.id === e.target.value) || recipes[0]; persistRecipes(); last = null; pst = QC.presenceInit(); loadBg(); if (source === "sim") simT0 = performance.now(); engine(`ใช้สูตร “${rec.name}”`, "ok"); };
  $("#recipeName").onchange = e => { const n = e.target.value.trim(); if (n) { rec.name = n.slice(0, 50); persistRecipes(); renderRecipe(); } };
  $("#recipeNew").onclick = () => {
    const n = prompt("ชื่อสูตรใหม่ (เช่น ขวดใส 600 มล. ไลน์ 2)", rec.name + " (สำเนา)"); if (!n) return;
    const c = JSON.parse(JSON.stringify(rec)); c.id = "r" + Date.now().toString(36); c.name = n.trim().slice(0, 50); delete c.sim;
    if (source === "sim") c.sim = rec.sim;
    recipes.push(c); rec = c; persistRecipes(); renderRecipe(); engine(`สร้างสูตร “${c.name}” แล้ว (คัดลอกพื้นที่ตรวจและเกณฑ์จากสูตรเดิม)`, "ok");
  };
  $("#recipeDel").onclick = () => {
    if (recipes.length < 2) return engine("ต้องมีอย่างน้อย 1 สูตร", "warn");
    if (!confirm(`ลบสูตร “${rec.name}”?`)) return;
    recipes = recipes.filter(r => r !== rec); rec = recipes[0]; persistRecipes(); loadBg(); engine("ลบสูตรแล้ว", "ok");
  };

  // ---------- สถิติ ----------
  function throughput(now = Date.now()) {
    const lastMin = shift.log.filter(l => now - l.t <= 60000).length;
    const first = shift.log[0]?.t, mins = first ? Math.max(1 / 60, (now - first) / 60000) : 0;
    return { lastMin, avg: mins ? shift.total / mins : 0 };
  }
  function renderStats() {
    const y = shift.total ? shift.pass / shift.total * 100 : 0, tp = throughput();
    const tile = (k, v, s = "") => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#tiles").innerHTML = tile("ตรวจแล้ว", shift.total.toLocaleString("th-TH"), "ขวด") + tile("ผ่าน", shift.pass.toLocaleString("th-TH"), "ขวด") +
      tile("คัดทิ้ง", shift.reject.toLocaleString("th-TH"), "ขวด") + tile("Yield", shift.total ? y.toFixed(1) + "%" : "—", "ผ่าน / ตรวจทั้งหมด") +
      tile("อัตราการผลิต", tp.lastMin, `ขวด/นาที (เฉลี่ยทั้งกะ ${tp.avg.toFixed(1)})`) + tile("ผ่านไปไม่ได้ตรวจ", shift.missed, "ขวด");
    const keys = Object.keys(QC.REASONS);
    $("#byReason").innerHTML = keys.map(k => `<li><span>${QC.REASONS[k]}</span><b>${shift.reasons[k] || 0}</b></li>`).join("");
    $("#rejects").innerHTML = shift.rejects.length ? shift.rejects.map(r => `<figure>${r.img ? `<img src="${r.img}" alt="">` : ""}<figcaption>${new Date(r.t).toLocaleTimeString("th-TH")}<br>${esc(r.reasons.map(k => QC.SHORT[k]).join(", "))}</figcaption></figure>`).join("") : `<p class="hint">ยังไม่มีขวดที่ถูกคัดทิ้ง</p>`;
    $("#shiftStart").textContent = new Date(shift.start).toLocaleString("th-TH");
    drawPareto();
  }
  function drawPareto() {
    const c = $("#pareto"), dpr = window.devicePixelRatio || 1, cw = c.clientWidth || 500, ch = 260;
    c.width = cw * dpr; c.height = ch * dpr; c.style.height = ch + "px";
    const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
    const data = Object.entries(shift.reasons).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    x.font = "12px Prompt, sans-serif"; x.fillStyle = "#5b7585";
    if (!data.length) { x.textAlign = "center"; x.fillText("ยังไม่มีข้อบกพร่อง", cw / 2, ch / 2); return; }
    const L = 34, R = 40, T = 14, B = 46, pw = cw - L - R, ph = ch - T - B, tot = data.reduce((s, d) => s + d[1], 0), max = data[0][1];
    const stepY = Math.max(1, Math.ceil(max * 1.1 / 4)), top = stepY * 4;
    x.strokeStyle = "#e6edf1"; x.lineWidth = 1; x.textAlign = "right";
    for (let i = 0; i <= 4; i++) { const yy = T + ph - ph * i / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(L + pw, yy); x.stroke(); x.fillText(Math.round(top * i / 4), L - 6, yy + 4); }
    x.textAlign = "left"; for (let i = 0; i <= 4; i++) x.fillText(i * 25 + "%", L + pw + 6, T + ph - ph * i / 4 + 4);
    const bw = pw / data.length;
    let cum = 0; const pts = [];
    data.forEach(([k, v], i) => {
      const h = ph * v / top, bx = L + i * bw + bw * 0.15;
      x.fillStyle = "#eb6834"; x.fillRect(bx, T + ph - h, bw * 0.7, h);
      x.fillStyle = "#16303f"; x.textAlign = "center"; x.fillText(v, bx + bw * 0.35, T + ph - h - 4);
      x.fillStyle = "#52514e"; x.fillText(QC.SHORT[k], bx + bw * 0.35, T + ph + 16);
      cum += v; pts.push([bx + bw * 0.35, T + ph - ph * cum / tot]);
    });
    x.strokeStyle = "#0b2a3c"; x.lineWidth = 2; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.stroke();
    x.fillStyle = "#0b2a3c"; pts.forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 3, 0, 7); x.fill(); });
    x.fillStyle = "#5b7585"; x.textAlign = "left"; x.fillText("แท่ง = จำนวนครั้ง · เส้น = สะสม %", L, ch - 6);
  }
  window.addEventListener("resize", drawPareto);
  const cell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  $("#exportCsv").onclick = () => {
    const head = ["time", "recipe", "trigger", "result", "reasons", "fill_y_px", "fill_target_px", "fill_status", "cap_coverage_pct", "cap_deltaE", "cap_angle_deg", "label_similarity_pct", "label_shift_px", "sim_truth"];
    const rows = shift.log.map(l => [new Date(l.t).toISOString(), l.recipe, l.how, l.pass ? "PASS" : "REJECT", l.reasons.map(k => QC.REASONS[k]).join("; "), l.fy, l.ft, l.fs, l.cc, l.cde, l.ca, l.ls, l.lsh, l.sim]);
    const tp = throughput();
    const sum = [[], ["สรุปกะ"], ["เริ่มกะ", new Date(shift.start).toISOString()], ["ตรวจทั้งหมด", shift.total], ["ผ่าน", shift.pass], ["คัดทิ้ง", shift.reject],
      ["Yield %", shift.total ? (shift.pass / shift.total * 100).toFixed(2) : ""], ["ผ่านไปไม่ได้ตรวจ", shift.missed], ["อัตราเฉลี่ย ขวด/นาที", tp.avg.toFixed(2)],
      ...Object.keys(QC.REASONS).map(k => [QC.REASONS[k], shift.reasons[k] || 0])];
    const d = new Date(shift.start), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    download(`qc-shift-${stamp}.csv`, "﻿" + [head, ...rows, ...sum].map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };
  $("#resetShift").onclick = () => {
    if (shift.total && !confirm("รีเซ็ตตัวนับและบันทึกของกะนี้? (แนะนำให้ส่งออก CSV ก่อน)")) return;
    shift = newShift(); save(K.shift, shift); last = null; renderStats(); engine("เริ่มกะใหม่แล้ว", "ok");
  };

  // ---------- การตั้งค่า ----------
  $("#beep").checked = settings.beep; $("#webhookOn").checked = settings.webhookOn; $("#webhook").value = settings.webhook;
  const saveSettings = () => { settings.beep = $("#beep").checked; settings.webhookOn = $("#webhookOn").checked; settings.webhook = $("#webhook").value.trim(); save(K.settings, settings); };
  ["beep", "webhookOn", "webhook"].forEach(id => $("#" + id).addEventListener("change", saveSettings));
  $("#testBeep").onclick = () => { const b = settings.beep; settings.beep = true; beep(); settings.beep = b; };

  // ---------- ลูปหลัก ----------
  function tick(now) {
    requestAnimationFrame(tick);
    if (source === "image") { drawOverlay(); return; }
    if (!grab(now)) return;
    fpsT.push(now); while (fpsT.length && now - fpsT[0] > 1000) fpsT.shift();
    if (running && bg && bg.width === W && bg.height === H) {
      const tr = QC.roiPx(rec.rois.trigger, W, H);
      if (tr) {
        const d = QC.diffStats(cur, bg, tr, 30);
        const motion = prev && prev.width === W ? QC.diffStats(cur, prev, tr, 20).frac : 1;
        trigObs = { ...d, motion };
        const cfg = { on: rec.trig.on / 100, off: rec.trig.off / 100, centerTol: 0.12, motionMax: 0.01, requireStill: rec.trig.requireStill, stableFrames: Math.max(1, rec.trig.stableFrames), leaveFrames: 3 };
        const r = QC.presenceStep(pst, trigObs, now, cfg);
        pst = r.st;
        if (r.event === "inspect") runInspect("auto");
        else if (r.event === "missed") { shift.missed++; persistShift(); renderStats(); }
      }
    } else if (running && bg) { engine("ขนาดภาพเปลี่ยนไปจากพื้นหลังว่างที่บันทึกไว้ กรุณาบันทึกพื้นหลังว่างใหม่", "warn"); running = false; $("#toggle").textContent = "เริ่มตรวจต่อเนื่อง"; }
    drawOverlay();
    $("#fps").textContent = `${fpsT.length} fps · ${W}×${H}`;
  }

  setInterval(() => { if (shift.total) renderStats(); }, 5000);
  window.addEventListener("beforeunload", () => save(K.shift, shift));
  renderStats(); loadBg(); setSource("sim");
  requestAnimationFrame(tick);
})();

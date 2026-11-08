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
  function capAnalyze(img, r, bg, model = null) {
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
    // model = แบบจำลองแสง: สีเฉลี่ยของฝาถูกแปลงกลับเป็นแสงตอนสอบเทียบก่อนเทียบ ΔE
    const inv = (v, c) => model ? clamp((v - model.ch[c].b) / model.ch[c].a, 0, 255) : v;
    const lab = n ? rgbToLab(inv(sr / n, 0), inv(sg / n, 1), inv(sb / n, 2)) : [0, 0, 0];
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

  /* โปรไฟล์ความสว่างรายแถวของแถบแนวตั้ง k แถบ ช่วงกลาง frac ของความกว้าง ROI (ใช้วัดมุมเอียงของฉลาก)
     คืน {xs: กึ่งกลางแถบ (px ภายใน ROI), p: [โปรไฟล์]} */
  function stripProfiles(img, r, k = 5, frac = 0.6) {
    const d = img.data, W = img.width, span = r.w * frac, x0 = r.x + (r.w - span) / 2, sw = span / k, xs = [], p = [];
    for (let s = 0; s < k; s++) {
      const a = Math.round(x0 + s * sw), b = Math.max(a + 1, Math.round(x0 + (s + 1) * sw)), prof = new Array(r.h);
      for (let y = 0; y < r.h; y++) {
        let t = 0;
        for (let x = a, i = ((r.y + y) * W + a) * 4; x < b; x++, i += 4) t += lumAt(d, i);
        prof[y] = +(t / (b - a)).toFixed(1);
      }
      xs.push((a + b) / 2 - r.x); p.push(prof);
    }
    return { xs, p };
  }
  /* มุมเอียงของฉลากเทียบตัวอย่าง (องศา, + = ด้านขวาต่ำกว่า): หาระยะเลื่อนแนวตั้งของแต่ละแถบเทียบแถบเดียวกันของตัวอย่าง
     (สหสัมพันธ์ ไม่ขึ้นกับความสว่าง/คอนทราสต์ + ประมาณค่าทศนิยมแบบพาราโบลา) แล้วฟิตเส้นตรง ระยะเลื่อน = ความชัน × x */
  function labelAngle(m, g) {
    if (!m || !g || !g.p || g.p.length !== m.p.length || g.p.length < 3) return null;
    const pts = [];
    for (let s = 0; s < g.p.length; s++) {
      const a = m.p[s], b = g.p[s], n = Math.min(a.length, b.length), maxS = Math.max(1, Math.round(n / 3)), sc = new Map();
      let best = -Infinity, bs = 0;
      for (let k = -maxS; k <= maxS; k++) {
        const lo = Math.max(0, k), hi = Math.min(n, n + k);
        if (hi - lo < n / 2) continue;
        const c = histCorrelation(a.slice(lo, hi), b.slice(lo - k, hi - k)); sc.set(k, c);
        if (c > best) { best = c; bs = k; }
      }
      if (best < 0.5) continue;
      let sub = bs;
      if (sc.has(bs - 1) && sc.has(bs + 1)) { const l = sc.get(bs - 1), r = sc.get(bs + 1), den = l - 2 * best + r; if (den < 0) sub = bs + clamp(0.5 * (l - r) / den, -0.5, 0.5); }
      pts.push([m.xs[s], sub]);
    }
    if (pts.length < 3) return null;
    const mx = pts.reduce((t, q) => t + q[0], 0) / pts.length, my = pts.reduce((t, q) => t + q[1], 0) / pts.length;
    let sxy = 0, sxx = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
    return sxx > 0 ? Math.atan(sxy / sxx) * 180 / Math.PI : null;
  }

  function labelAnalyze(img, r) {
    const e = edgeMap(img, r);
    return { edge: e.density, rows: Array.from(e.rows, v => +v.toFixed(4)), hist: Array.from(colorHist(img, r), v => +v.toFixed(5)), strips: stripProfiles(img, r) };
  }

  const DEF_LABEL_ANGLE = 3.5; // องศา — สูตรเก่าที่ไม่มี tol.labelAngle ใช้ค่านี้ (ฉลากเอียง ≥ 5° ถูกคัดออก)
  function labelJudge(m, g, tol) {
    const sim = histCorrelation(m.hist, g.hist) * 100;
    const edgeRatio = g.edge > 0 ? m.edge / g.edge : 1;
    const sh = bestShift(m.rows, g.rows, Math.max(1, Math.round(g.rows.length / 3)));
    const angle = labelAngle(m.strips, g.strips), maxAngle = tol.labelAngle ?? DEF_LABEL_ANGLE;
    const out = { sim, edgeRatio, shift: sh.shift, angle, skew: false, reasons: [] };
    if (edgeRatio < 0.4 || sim < 30) out.reasons.push("labelMissing");
    else {
      out.skew = angle != null && maxAngle > 0 && Math.abs(angle) > maxAngle;
      if (sim < tol.labelSim || Math.abs(sh.shift) > tol.labelShift || out.skew) out.reasons.push("labelShift");
    }
    return out;
  }

  // ---------- ปรับแสง (photometric normalisation) ----------
  /* ตอนสอบเทียบ เก็บพิกเซลตัวอย่าง (สุ่มทุก step) ในกรอบที่ครอบพื้นที่ตรวจทั้งหมด
     ตอนตรวจ ฟิตความสัมพันธ์เชิงเส้นต่อช่องสี  ภาพปัจจุบัน ≈ a × ตัวอย่าง + b  แบบทนค่าผิดปกติ (Theil–Sen บนค่ามัธยฐานรายช่วง
     + Tukey IRLS) แล้วแปลงภาพกลับเป็นแสงตอนสอบเทียบ (และแปลงภาพพื้นหลังไปเป็นแสงปัจจุบันสำหรับหน้ากากฝา ซึ่งรักษาพิกเซลที่สว่างจนอิ่มตัว)
     ข้อบกพร่องเปลี่ยนพิกเซลเพียงส่วนน้อย ส่วนแสง/คอนทราสต์/auto-exposure เปลี่ยนทุกพิกเซลพร้อมกัน */
  const b64enc = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function photoBox(rois, W, H) {
    const rs = ["fill", "cap", "label"].map(k => roiPx(rois[k], W, H)).filter(Boolean);
    if (!rs.length) return null;
    const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y));
    return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y };
  }
  function photoSample(img, r, step) {
    const d = img.data, W = img.width, nx = Math.ceil(r.w / step), ny = Math.ceil(r.h / step), out = new Uint8Array(nx * ny * 3);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k += 3) {
      const p = ((r.y + j * step) * W + r.x + i * step) * 4;
      out[k] = d[p]; out[k + 1] = d[p + 1]; out[k + 2] = d[p + 2];
    }
    return out;
  }
  function photoRef(img, rois) {
    const r = photoBox(rois, img.width, img.height);
    if (!r) return null;
    const step = Math.max(2, Math.ceil(Math.sqrt(r.w * r.h / 3000)));
    return { box: { x: r.x / img.width, y: r.y / img.height, w: r.w / img.width, h: r.h / img.height }, step, px: b64enc(photoSample(img, r, step)) };
  }
  const wmedian = (vals, ws) => {
    const o = vals.map((v, i) => [v, ws[i]]).sort((p, q) => p[0] - q[0]), tot = ws.reduce((a, b) => a + b, 0);
    let acc = 0; for (const [v, w] of o) { acc += w; if (acc >= tot / 2) return v; }
    return o.length ? o[o.length - 1][0] : 0;
  };
  /* ฟิต c ≈ a·g + b หนึ่งช่องสี จากคู่ (g = ตัวอย่าง, c = ปัจจุบัน) ; คืน {a, b, inl, inl0} */
  function fitChannel(gv, cv) {
    const BW = 16, bins = Array.from({ length: 16 }, () => []), pairs = [];
    for (let i = 0; i < gv.length; i++) {
      const g = gv[i], c = cv[i];
      if (g <= 5 || g >= 250 || c <= 2 || c >= 253) continue; // อิ่มตัว: ไม่รู้ค่าจริง
      bins[g / BW | 0].push(i); pairs.push(i);
    }
    const id = { a: 1, b: 0, inl: 0, inl0: 0 };
    if (pairs.length < 30) return id;
    const minN = Math.max(6, pairs.length * 0.01), B = [];
    const med = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
    for (const ix of bins) if (ix.length >= minN) B.push({ g: med(ix.map(i => gv[i])), c: med(ix.map(i => cv[i])), n: ix.length });
    let a = 1, b = 0;
    const sl = [], sw = [];
    for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) if (Math.abs(B[j].g - B[i].g) >= 24) { sl.push((B[j].c - B[i].c) / (B[j].g - B[i].g)); sw.push(Math.min(B[i].n, B[j].n)); }
    if (sl.length) { a = wmedian(sl, sw); b = wmedian(B.map(q => q.c - a * q.g), B.map(q => q.n)); }
    else if (B.length) { a = wmedian(B.map(q => q.c / Math.max(1, q.g)), B.map(q => q.n)); b = 0; }
    // Tukey biweight IRLS บนคู่พิกเซลจริง
    for (let it = 0; it < 4; it++) {
      let sw0 = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const i of pairs) {
        const e = (cv[i] - a * gv[i] - b) / 24; if (Math.abs(e) >= 1) continue;
        const w = (1 - e * e) ** 2; sw0 += w; sx += w * gv[i]; sy += w * cv[i]; sxx += w * gv[i] * gv[i]; sxy += w * gv[i] * cv[i];
      }
      const den = sw0 * sxx - sx * sx;
      if (sw0 < 20 || den <= 1e-6) break;
      a = (sw0 * sxy - sx * sy) / den; b = (sy - a * sx) / sw0;
    }
    a = clamp(a, 0.5, 1.8); b = clamp(b, -80, 80);
    let inl = 0, inl0 = 0;
    for (const i of pairs) { if (Math.abs(cv[i] - a * gv[i] - b) < 12) inl++; if (Math.abs(cv[i] - gv[i]) < 12) inl0++; }
    return { a, b, inl: inl / pairs.length, inl0: inl0 / pairs.length };
  }
  /* แบบจำลองแสง {ch:[{a,b}×3], on} ของภาพปัจจุบันเทียบภาพตัวอย่าง ; on = false เมื่อใกล้เคียงเดิม (ไม่ต้องแปลง) */
  function photoModel(img, ref) {
    if (!ref || !ref.px) return null;
    const r = roiPx(ref.box, img.width, img.height), gs = b64dec(ref.px), cs = photoSample(img, r, ref.step);
    if (gs.length !== cs.length) return null;
    const n = gs.length / 3, ch = [];
    for (let c = 0; c < 3; c++) {
      const gv = new Uint8Array(n), cv = new Uint8Array(n);
      for (let i = 0; i < n; i++) { gv[i] = gs[i * 3 + c]; cv[i] = cs[i * 3 + c]; }
      const f = fitChannel(gv, cv);
      // ใช้แบบจำลองเฉพาะเมื่ออธิบายภาพได้ดีกว่าการไม่แปลง (กันข้อบกพร่องใหญ่ทำให้ฟิตเพี้ยน)
      ch.push(f.inl > f.inl0 + 0.02 ? { a: f.a, b: f.b } : { a: 1, b: 0 });
    }
    const on = ch.some(q => Math.abs(q.a - 1) > 0.03 || Math.abs(q.b) > 3);
    return { ch, on };
  }
  // แปลงภาพปัจจุบันกลับเป็นแสงตอนสอบเทียบ (dir -1) หรือแปลงภาพแสงตอนสอบเทียบไปเป็นแสงปัจจุบัน (dir +1)
  function photoApply(img, model, dir = -1) {
    const lut = model.ch.map(({ a, b }) => Uint8ClampedArray.from({ length: 256 }, (_, v) => dir < 0 ? (v - b) / a : a * v + b));
    const s = img.data, d = new Uint8ClampedArray(s.length);
    for (let i = 0; i < s.length; i += 4) { d[i] = lut[0][s[i]]; d[i + 1] = lut[1][s[i + 1]]; d[i + 2] = lut[2][s[i + 2]]; d[i + 3] = s[i + 3]; }
    return { data: d, width: img.width, height: img.height };
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

  /* ก้อนวัตถุในพื้นที่ทริกเกอร์ (connected components 4 ทิศ บนตารางที่สุ่มทุก step พิกเซล) เทียบภาพอ้างอิง
     คืน [{area, frac, x0, x1, y0, y1, cx}] (พิกัด 0..1 ภายใน ROI) เรียงจากใหญ่ไปเล็ก ตัดก้อนเล็กกว่า minFrac ของ ROI */
  function blobs(img, ref, r, thr = 30, step = 2, minFrac = 0.015) {
    const a = img.data, b = ref.data, W = img.width;
    const gw = Math.max(1, Math.ceil(r.w / step)), gh = Math.max(1, Math.ceil(r.h / step)), n = gw * gh;
    const m = new Uint8Array(n), lab = new Int32Array(n), stack = new Int32Array(n);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(r.w - 1, gx * step), y = Math.min(r.h - 1, gy * step), i = ((r.y + y) * W + r.x + x) * 4;
      m[gy * gw + gx] = Math.abs(lumAt(a, i) - lumAt(b, i)) > thr ? 1 : 0;
    }
    const out = [];
    let id = 0;
    for (let s0 = 0; s0 < n; s0++) {
      if (!m[s0] || lab[s0]) continue;
      id++; let sp = 0, area = 0, x0 = gw, x1 = -1, y0 = gh, y1 = -1, sx = 0;
      stack[sp++] = s0; lab[s0] = id;
      while (sp) {
        const k = stack[--sp], x = k % gw, y = (k / gw) | 0;
        area++; sx += x; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = id; stack[sp++] = k - 1; }
        if (x < gw - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = id; stack[sp++] = k + 1; }
        if (y > 0 && m[k - gw] && !lab[k - gw]) { lab[k - gw] = id; stack[sp++] = k - gw; }
        if (y < gh - 1 && m[k + gw] && !lab[k + gw]) { lab[k + gw] = id; stack[sp++] = k + gw; }
      }
      const frac = area / n;
      if (frac >= minFrac) out.push({ area, frac, x0: x0 / gw, x1: (x1 + 1) / gw, y0: y0 / gh, y1: (y1 + 1) / gh, cx: (sx / area + 0.5) / gw });
    }
    return out.sort((p, q) => q.area - p.area);
  }
  /* รวมก้อนที่ซ้อนกันในแนวนอน (ฝา/คอ/ตัวขวดใบเดียวกันอาจแยกเป็นหลายก้อนในแนวตั้ง) -> ช่วง x ของแต่ละ "ขวด" */
  function blobGroups(bl, gap = 0.02) {
    const g = bl.map(b => ({ x0: b.x0, x1: b.x1, frac: b.frac })).sort((p, q) => p.x0 - q.x0), out = [];
    for (const b of g) {
      const last = out[out.length - 1];
      if (last && b.x0 <= last.x1 + gap) { last.x1 = Math.max(last.x1, b.x1); last.frac += b.frac; }
      else out.push({ ...b });
    }
    return out;
  }
  /* เตือน "ขวดสองใบในพื้นที่ทริกเกอร์": สองกลุ่มขึ้นไป (two) หรือกลุ่มเดียวแต่กว้างกว่าขวดตัวอย่าง wideK เท่า (ขวดชิดกัน: wide)
     expW = ความกว้างขวดตัวอย่าง (สัดส่วนของ ROI) จากการสอบเทียบ หรือ null */
  function multiCheck(bl, expW = null, { wideK = 1.6, minGroupFrac = 0.03 } = {}) {
    const groups = blobGroups(bl).filter(g => g.frac >= minGroupFrac);
    if (groups.length >= 2) return { multi: true, n: groups.length, kind: "two", groups };
    if (groups.length === 1 && expW > 0 && groups[0].x1 - groups[0].x0 > wideK * expW && groups[0].x0 > 0.001 && groups[0].x1 < 0.999) return { multi: true, n: 2, kind: "wide", groups };
    return { multi: false, n: groups.length, kind: null, groups };
  }

  /* p-chart (สัดส่วนของเสีย) ต่อไลน์ คำนวณในเครื่อง: แบ่งบันทึกการตรวจเป็นกลุ่มย่อยละ size ขวดตามลำดับเวลา
     p̄ = ของเสียรวม / ตรวจรวม · UCL/LCL = p̄ ± 3·sqrt(p̄(1−p̄)/nᵢ) (ตัดที่ 0..1) · กลุ่มสุดท้ายที่ไม่ครบใช้ nᵢ ของตัวเอง
     log: [{t, pass, lane?}] (ไม่มี lane = "L1") ; lane null = ทุกไลน์ */
  function pChart(log, { lane = null, size = 20 } = {}) {
    size = Math.max(2, Math.round(size) || 20);
    const L = (log || []).filter(l => l && (lane == null || (l.lane || "L1") === lane));
    /** @type {{i: number, n: number, d: number, p: number, t0: number, t1: number, ucl?: number, lcl?: number, out?: boolean}[]} */
    const groups = [];
    for (let i = 0; i < L.length; i += size) {
      const g = L.slice(i, i + size), d = g.filter(l => !l.pass).length;
      groups.push({ i: groups.length, n: g.length, d, p: d / g.length, t0: g[0].t, t1: g[g.length - 1].t });
    }
    const N = groups.reduce((s, g) => s + g.n, 0), D = groups.reduce((s, g) => s + g.d, 0), pbar = N ? D / N : 0;
    for (const g of groups) {
      const sd = Math.sqrt(pbar * (1 - pbar) / g.n);
      g.ucl = Math.min(1, pbar + 3 * sd); g.lcl = Math.max(0, pbar - 3 * sd);
      g.out = g.p > g.ucl + 1e-12 || (g.lcl > 0 && g.p < g.lcl - 1e-12);
    }
    return { pbar, n: N, d: D, size, groups, outCount: groups.filter(g => g.out).length };
  }

  /* ย้ายภาพ (data URL) ออกจาก localStorage ไป IndexedDB — เรียกซ้ำได้ ผลเหมือนเดิม
     items = รายการ object · field = ชื่อฟิลด์ภาพ · keyOf(item) -> คีย์ · put(key, value) -> Promise
     ลบภาพออกจาก item (ตั้ง "" หรือ null) เฉพาะเมื่อ put สำเร็จ และเติม item.ik = key ; คืนรายชื่อคีย์ที่ย้าย */
  async function migrateImages(items, field, keyOf, put, empty = null) {
    const moved = [];
    for (const it of items || []) {
      const v = it && it[field];
      if (typeof v !== "string" || !v.startsWith("data:")) continue;
      const key = keyOf(it);
      try { await put(key, v); } catch { continue; }
      it[field] = empty; it.ik = key; moved.push(key);
    }
    return moved;
  }
  const bgKey = (lane, recipeId) => `${lane}|${recipeId}`;
  const thumbKey = r => `${r.lane || "L1"}|${r.t}`;
  /* สูตรเดิมเก็บพื้นหลังว่างเป็น rec.bg (JPEG data URL) -> IndexedDB คีย์ "L1|<recipeId>" */
  const migrateBgs = (recipes, put) => migrateImages(recipes, "bg", r => bgKey("L1", r.id), put, null);
  const migrateThumbs = (rejects, put) => migrateImages(rejects, "img", thumbKey, put, "");

  /* สถิติต่อไลน์จาก shift (shift.lanes มีเมื่อใช้รุ่นนี้ ; รุ่นเก่า = ทุกอย่างเป็น L1) */
  function laneStats(shift, lane) {
    const z = { total: 0, pass: 0, reject: 0, missed: 0, multi: 0, reasons: {} };
    if (!shift) return z;
    if (lane == null) return { total: shift.total || 0, pass: shift.pass || 0, reject: shift.reject || 0, missed: shift.missed || 0, multi: Object.values(shift.lanes || {}).reduce((s, l) => s + (l.multi || 0), 0), reasons: shift.reasons || {} };
    const l = shift.lanes && shift.lanes[lane];
    if (l) return { ...z, ...l, reasons: { ...(l.reasons || {}) } };
    if (lane === "L1" && !shift.lanes) return { ...z, total: shift.total || 0, pass: shift.pass || 0, reject: shift.reject || 0, missed: shift.missed || 0, reasons: { ...(shift.reasons || {}) } };
    return z;
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
    g.photo = photoRef(img, rec.rois);
    const tr = roiPx(rec.rois.trigger, W, H);
    if (tr && bg && bg.width === W && bg.height === H) {
      const gr = blobGroups(blobs(img, bg, tr)).sort((p, q) => q.frac - p.frac)[0];
      if (gr) g.trigW = +(gr.x1 - gr.x0).toFixed(4); // ความกว้างขวดตัวอย่างในพื้นที่ทริกเกอร์ (ใช้เตือนขวดชิดกัน)
    }
    return g;
  }

  function inspect(img, rec, bg) {
    const W = img.width, H = img.height, g = rec.golden, tol = rec.tol;
    const res = { t: Date.now(), reasons: [], fill: null, cap: null, label: null, photo: null };
    /* ปรับแสง: rec.photoNorm === false ปิดได้ ; สูตรที่สอบเทียบก่อนรุ่นนี้ (ไม่มี g.photo) ทำงานแบบเดิม */
    const model = rec.photoNorm === false ? null : photoModel(img, g.photo);
    const on = !!(model && model.on), raw = img;
    if (on) img = photoApply(img, model, -1);
    if (model) res.photo = { on, gain: model.ch.map(q => +q.a.toFixed(3)), offset: model.ch.map(q => +q.b.toFixed(1)) };
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
      // หน้ากากฝาเทียบภาพดิบกับพื้นหลังที่แปลงไปเป็นแสงปัจจุบัน (พิกเซลอิ่มตัวยังตรงกัน) ; สีฝาแปลงกลับในตัว capAnalyze
      const m = on ? capAnalyze(raw, cr, useBg ? photoApply(useBg, model, 1) : null, model) : capAnalyze(img, cr, useBg);
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
  /* opts.pairRate = โอกาสที่มีขวดใบที่สองชิดมาด้วย (ค่าเริ่มต้น 0 = ภาพจำลองเดิม) */
  function simFrame(img, type, t, period = 2400, defectRate = 0.3, opts = {}) {
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
    let pair = false;
    if (opts.pairRate > 0) { const r2 = rnd(k * 104729 + 7); r2(); if (r2() < opts.pairRate) { pair = true; simBottle(img, G, x + G.bodyW + 10, null); } }
    simNoise(img, (t | 0) + 1);
    return { index: k, defect, x, pair };
  }

  return {
    clamp, roiPx, rowProfile, smooth, gradient, findEdge, classifyFill, rgbToLab, deltaE, fgMask,
    capAnalyze, capJudge, edgeMap, colorHist, histCorrelation, bestShift, labelAnalyze, labelJudge, stripProfiles, labelAngle,
    photoRef, photoModel, photoApply, fitChannel,
    diffStats, presenceInit, presenceStep, calibrate, inspect, fillTolPx, REASONS, SHORT,
    blobs, blobGroups, multiCheck, pChart, migrateImages, migrateBgs, migrateThumbs, bgKey, thumbKey, laneStats,
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
  const LANE_IDS = ["L1", "L2", "L3", "L4"];

  const defTol = () => ({ fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 });
  const defTrig = () => ({ on: 15, off: 5, requireStill: true, stableFrames: 3 });
  function simRecipe(type, name) {
    return { id: "sim-" + type, name, sim: type, rois: QC.simGeom(type).rois, mode: "dark", tol: defTol(), trig: defTrig(), golden: null, bg: null };
  }
  let recipes = load(K.recipes, null);
  if (!Array.isArray(recipes) || !recipes.length) recipes = [simRecipe("600", "ขวดใส 600 มล. (ภาพจำลอง)"), simRecipe("1500", "ขวดใส 1.5 ลิตร (ภาพจำลอง)")];
  // lanes = จำนวนไลน์ (1 = เหมือนเดิม) · laneRecipes = สูตรของไลน์ 2–4 (ไลน์ 1 ใช้ qc-active) · pSize = ขนาดกลุ่มย่อย p-chart
  const settings = { beep: true, webhookOn: false, webhook: "", lanes: 1, laneRecipes: {}, pSize: 20, ...load(K.settings, {}) };
  if (!settings.laneRecipes || typeof settings.laneRecipes !== "object") settings.laneRecipes = {};
  settings.lanes = Math.max(1, Math.min(4, Math.round(+settings.lanes) || 1));
  const newShift = () => ({ start: Date.now(), total: 0, pass: 0, reject: 0, missed: 0, reasons: {}, log: [], rejects: [], lanes: {} });
  const shiftRaw = load(K.shift, {}) || {};
  let shift = { ...newShift(), ...shiftRaw };
  if (!shiftRaw.lanes || typeof shiftRaw.lanes !== "object") {
    // กะที่บันทึกด้วยรุ่นก่อน (ไลน์เดียว) = ยอดทั้งหมดเป็นของไลน์ 1
    shift.lanes = shift.total ? { L1: { total: shift.total, pass: shift.pass, reject: shift.reject, missed: shift.missed, multi: 0, reasons: { ...shift.reasons } } } : {};
  }
  const laneShift = id => shift.lanes[id] || (shift.lanes[id] = { total: 0, pass: 0, reject: 0, missed: 0, multi: 0, reasons: {} });

  // ---------- IndexedDB: พื้นหลังว่าง (bg) และรูปย่อขวดที่คัดทิ้ง (thumbs) — ไม่ใช้ localStorage ----------
  const IDB = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("no indexedDB"));
        let r; try { r = indexedDB.open("lensiq-qc", 1); } catch (e) { return rej(e); }
        r.onupgradeneeded = () => { const db = r.result; for (const n of ["bg", "thumbs"]) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error("idb open")); r.onblocked = () => rej(new Error("idb blocked"));
      });
      dbp.catch(() => {});
      return dbp;
    }
    const tx = (store, mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode), q = fn(t.objectStore(store));
      t.oncomplete = () => res(q ? q.result : undefined); t.onerror = t.onabort = () => rej(t.error || new Error("idb tx"));
    }));
    return {
      ok: () => open().then(() => true, () => false),
      get: (st, k) => tx(st, "readonly", s => s.get(k)), put: (st, k, v) => tx(st, "readwrite", s => s.put(v, k)),
      del: (st, k) => tx(st, "readwrite", s => s.delete(k)), keys: st => tx(st, "readonly", s => s.getAllKeys()), clear: st => tx(st, "readwrite", s => s.clear())
    };
  })();
  let idbOk = null; // null = ยังไม่รู้ ; false = ใช้ localStorage แบบเดิม (สำรอง)

  const disp = $("#frame"), dctx = disp.getContext("2d");
  const overlay = $("#overlay"), octx = overlay.getContext("2d");
  const domVideo = $("#video");
  const hubBox = $("#qcHubGrid");

  /* ไลน์ = สถานี: สูตร (ROI/เกณฑ์/ขวดตัวอย่าง) พื้นหลังว่าง สถานะทริกเกอร์ และแหล่งภาพของตัวเอง
     ตัวแปรของไลน์ที่เลือกถูก "สลับ" เข้าตัวแปรด้านล่างระหว่างประมวลผล (use(L)) — ไลน์เดียว = เหมือนรุ่นก่อนทุกอย่าง */
  function makeLane(i) {
    const frame = document.createElement("canvas"); frame.width = 640; frame.height = 480;
    return { id: LANE_IDS[i], idx: i, rec: null, W: 640, H: 480, cur: null, prev: null, bg: null, pst: QC.presenceInit(), trigObs: null, last: null, lastAt: 0,
      simBuf: [], simInfo: null, stillImg: null, frame, fctx: frame.getContext("2d", { willReadFrequently: true }), video: i === 0 ? domVideo : null, mirrorCam: false, fpsT: [], hubCam: null, multiAt: 0, lastMulti: null };
  }
  const lanes = LANE_IDS.map((_, i) => makeLane(i));
  const nLanes = () => settings.lanes;
  const activeLanes = () => lanes.slice(0, nLanes());
  let selIdx = 0;
  const selLane = () => lanes[selIdx];

  // ตัวแปรของไลน์ปัจจุบัน
  let W = 640, H = 480, cur = null, prev = null, bg = null, pst = QC.presenceInit(), last = null, lastAt = 0, trigObs = null;
  let simBuf = [], simInfo = null, stillImg = null, rec = null, frame = lanes[0].frame, fctx = lanes[0].fctx, video = domVideo, mirrorCam = false, fpsT = [];
  let curLane = lanes[0];
  const VARS = ["W", "H", "cur", "prev", "bg", "pst", "last", "lastAt", "trigObs", "simBuf", "simInfo", "stillImg", "rec", "frame", "fctx", "video", "mirrorCam", "fpsT"];
  function stash() {
    const L = curLane;
    Object.assign(L, { W, H, cur, prev, bg, pst, last, lastAt, trigObs, simBuf, simInfo, stillImg, rec, frame, fctx, video, mirrorCam, fpsT });
  }
  function use(L) {
    if (L === curLane) return;
    stash(); curLane = L;
    ({ W, H, cur, prev, bg, pst, last, lastAt, trigObs, simBuf, simInfo, stillImg, rec, frame, fctx, video, mirrorCam, fpsT } = L);
  }
  const withLane = (L, fn) => { const keep = curLane; use(L); try { return fn(); } finally { use(keep); } };
  const laneVar = (L, k) => (L === curLane ? { W, H, bg, rec }[k] : L[k]);
  function setLaneBg(L, v) { if (L === curLane) bg = v; else L.bg = v; }
  void VARS;

  let source = "sim", running = false;
  // นาฬิกาภาพจำลอง: เดินตามรอบการวาด แต่ไม่เกิน SIM_MAX_DT ต่อรอบ — เครื่องช้า/หลายไลน์ = สายพานจำลองช้าลงแทนการข้ามเฟรม (ไม่ "พลาด" ขวดเพราะเครื่องช้า)
  const SIM_MAX_DT = 70;
  let simClock = 0, simLastNow = 0, activeRoi = "fill", drag = null;

  // สูตรของแต่ละไลน์
  const recById = id => recipes.find(r => r.id === id);
  function cloneRecipe(base, L) {
    const c = JSON.parse(JSON.stringify(base));
    c.id = `${base.id}-${L.id.toLowerCase()}-${Date.now().toString(36)}`; c.name = `${base.name.replace(/ · ไลน์ \d$/, "")} · ไลน์ ${L.idx + 1}`.slice(0, 60); c.bg = null;
    recipes.push(c); return c;
  }
  /* ไลน์ 2–4: สูตรที่จำไว้ หรือคัดลอกจากสูตรของไลน์ 1 (ครั้งแรกที่เพิ่มไลน์) คืน true ถ้าสร้างสูตรใหม่ */
  function assignRecipes() {
    let made = false;
    stash();
    for (const L of lanes.slice(1)) {
      let r = recById(settings.laneRecipes[L.id]);
      if (!r && L.idx < nLanes()) { r = cloneRecipe(lanes[0].rec, L); settings.laneRecipes[L.id] = r.id; made = true; }
      if (L === curLane) rec = r || recipes[0]; else L.rec = r || null;
    }
    return made;
  }
  if (lanes[0].rec == null) lanes[0].rec = recById(load(K.active, "")) || recipes[0];
  rec = lanes[0].rec;

  const bgOk = () => bg && bg.width === W && bg.height === H ? bg : null;
  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }
  function retryBtn(fn) { const b = document.createElement("button"); b.className = "btn ghost retry"; b.type = "button"; b.textContent = "ลองอีกครั้ง"; b.onclick = fn; $("#engine").append(" ", b); }
  const laneTag = L => (nLanes() > 1 ? `ไลน์ ${L.idx + 1}: ` : "");
  const persistRecipes = () => {
    stash();
    save(K.recipes, recipes); save(K.active, lanes[0].rec.id);
    for (const L of lanes.slice(1)) if (L.rec) settings.laneRecipes[L.id] = L.rec.id;
    save(K.settings, settings);
  };
  let shiftTimer = 0;
  const persistShift = () => { clearTimeout(shiftTimer); shiftTimer = setTimeout(() => save(K.shift, shift), 500); };

  function setSize(w, h) {
    W = 640; H = Math.max(120, Math.round(640 * h / w)) & ~1;
    if (frame.width !== W || frame.height !== H) { frame.width = W; frame.height = H; simBuf = []; prev = null; }
    if (curLane === selLane()) syncDisplay();
  }
  function syncDisplay() {
    const L = selLane(), w = laneVar(L, "W"), h = laneVar(L, "H");
    if (disp.width !== w || disp.height !== h) { disp.width = overlay.width = w; disp.height = overlay.height = h; }
  }
  /* แสดงภาพของไลน์ที่เลือกบนหน้าจอ (ภาพประมวลผลอยู่ใน canvas ของแต่ละไลน์) */
  function show() { syncDisplay(); const L = selLane(); dctx.drawImage(L === curLane ? frame : L.frame, 0, 0); }

  // ---------- แหล่งภาพ ----------
  /* ไลน์เดียว: กล้องผ่าน LQCam.create (เหมือนเดิม จำกล้องใน 'qc-cam' ถอยไปกล้องอื่นเมื่อกล้องที่จำไว้ไม่พร้อม หยุด/เปิดเองเมื่อสลับแอป)
     หลายไลน์: LQCam.createHub (ns "qc", กล้องละไลน์ c1..c4 ตามลำดับ) — ตรวจขีดจำกัดจำนวนกล้องของอุปกรณ์ให้ */
  const cam = LQCam.create(domVideo, {
    facing: "environment", ideal: { width: 1280, height: 720 }, persistKey: "qc-cam", autoPause: true,
    onChange(c, ev) {
      if (nLanes() > 1) return;
      if (ev.type === "devices") fillCamSel();
      else if (ev.type === "resumed" && source === "camera") withLane(lanes[0], camReady);
      else if (ev.type === "ended" && source === "camera") { engine("สัญญาณกล้องหลุด (ถอดสายหรือกล้องถูกปิด)", "err"); retryBtn(() => startCamera()); }
      else if (ev.type === "reconnected" && source === "camera") { withLane(lanes[0], camReady); engine("กล้องกลับมาเชื่อมต่อแล้ว", "ok"); }
    },
    onError(c, e) { if (nLanes() === 1 && source === "camera" && e.name !== "AbortError") camFail(e); }
  });
  if (LQCam.offlineBadge && $("#camHealthMsg")) LQCam.offlineBadge(cam, $("#camHealthMsg").parentElement);
  let hub = null;
  function makeHub() {
    return LQCam.createHub({
      ns: "qc", grid: hubBox, facing: "environment",
      onChange(h, ev) {
        if (ev.type === "started" || ev.type === "resumed") { const c = h.cam(ev.slot); const L = c && laneOfCam(c); if (L) withLane(L, () => setSize(c.video.videoWidth || 640, c.video.videoHeight || 480)); }
        if (ev.type === "ended" && source === "camera") { const c = h.cam(ev.slot), L = c && laneOfCam(c); if (L) engine(`ไลน์ ${L.idx + 1}: สัญญาณกล้องหลุด`, "err"); }
        renderLaneTabs();
      }
    });
  }
  const laneOfCam = c => activeLanes().find(L => L.hubCam === c) || null;
  function stopStream() {
    cam.stop(); domVideo.pause(); domVideo.removeAttribute("src"); domVideo.srcObject = null;
    if (hub) { hub.destroy(); hub = null; }
    for (const L of lanes) { L.hubCam = null; if (L.idx > 0 && L.video) { L.video.pause(); L.video.removeAttribute("src"); L.video.load(); } }
    for (const L of lanes.slice(1)) L.video = null;
    video = curLane.idx === 0 ? domVideo : null; lanes[0].video = domVideo;
  }
  function showSourceUi() {
    document.querySelectorAll("[data-src]").forEach(/** @param {HTMLElement} el */ el => { el.hidden = !el.dataset.src.split(" ").includes(source); });
    const multi = nLanes() > 1;
    document.querySelectorAll("[data-single]").forEach(/** @param {HTMLElement} el */ el => { if (multi) el.hidden = true; });
  }
  function fillCamSel() {
    const sel = $("#camSel"), keep = cam.deviceId || sel.value, devs = cam.devices.filter(d => d.deviceId);
    sel.innerHTML = `<option value="">อัตโนมัติ (กล้องที่ใช้ล่าสุด)</option>` + devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || "กล้อง " + (i + 1))}</option>`).join("");
    sel.value = devs.some(d => d.deviceId === keep) ? keep : "";
  }
  async function listCameras() {
    try { await cam.refreshDevices(); fillCamSel(); }
    catch { $("#camSel").innerHTML = `<option value="">อ่านรายชื่อกล้องไม่ได้</option>`; }
  }
  function camReady() {
    mirrorCam = cam.mirrored;
    fillCamSel();
    setSize(domVideo.videoWidth || 640, domVideo.videoHeight || 480);
    engine(`กล้องพร้อม (${domVideo.videoWidth}×${domVideo.videoHeight}) — ประมวลผลภาพที่ความกว้าง ${W} พิกเซล`, "ok");
  }
  function camFail(e) {
    const m = {
      Insecure: "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด", NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในแถบที่อยู่ของเบราว์เซอร์",
      NotFoundError: "ไม่พบกล้อง ตรวจสอบสาย USB ของกล้อง", OverconstrainedError: "กล้องที่เลือกไม่พร้อมใช้งาน ลองเลือกกล้องตัวอื่น",
      NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่ ปิดโปรแกรมนั้นก่อน", AbortError: "เปิดกล้องไม่สำเร็จ (ถูกยกเลิก)"
    }[e.name];
    engine(`เปิดกล้องไม่ได้: ${m || "ข้อผิดพลาดไม่ทราบสาเหตุ"} (${e.name})`, "err");
    retryBtn(() => startCamera());
    if (e.name === "Insecure") { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "btn ghost retry"; a.textContent = "วิธีเปิดผ่าน https"; $("#engine").append(" ", a); }
  }
  /* useDevice=false: สลับกล้องหน้า/หลัง (cam.flip) แทนกล้องที่เลือกในรายการ
     ค่าว่างในรายการ = กล้องที่จำไว้ใน qc-cam ถ้ากล้องนั้นหายไป LQCam จะถอยไปใช้กล้องหลัง/กล้องใดก็ได้ */
  async function startCamera(useDevice = true) {
    if (nLanes() > 1) return startHubCams();
    domVideo.removeAttribute("src");
    engine("กำลังเปิดกล้อง...");
    try {
      if (useDevice === true) await cam.start($("#camSel").value || undefined);
      else await cam.flip();
      if (source !== "camera") { cam.stop(); return; }
      withLane(lanes[0], camReady);
    } catch (e) {
      if (e.name === "AbortError" && /superseded/.test(e.message)) return; // มีการเปิดกล้องครั้งใหม่ซ้อน
      camFail(e);
    }
  }
  /* หลายไลน์: เปิดกล้องตามที่จำไว้ (qc-cams) แล้วเพิ่มจนครบจำนวนไลน์ ถ้าอุปกรณ์เปิดพร้อมกันไม่ได้ ไลน์ที่เหลือแสดง "ไม่มีกล้อง" */
  async function startHubCams() {
    cam.stop();
    if (!hub) hub = makeHub();
    engine(`กำลังเปิดกล้อง ${nLanes()} ไลน์...`);
    let err = null;
    const h = hub; // ผู้ใช้อาจเปลี่ยนแหล่งภาพระหว่างรอ — ใช้ hub ของรอบนี้เท่านั้น
    try { await h.restore(); } catch (e) { err = e; }
    while (!err && hub === h && h.cams.length < nLanes()) {
      try { await h.add({ name: `ไลน์ ${h.cams.length + 1}` }); } catch (e) { err = e; }
    }
    if (source !== "camera" || !hub || hub !== h) return;
    const cams = hub.cams.slice().sort((a, b) => a.slot.localeCompare(b.slot));
    activeLanes().forEach((L, i) => {
      const c = cams[i] || null; L.hubCam = c;
      const v = c ? c.video : null;
      if (L === curLane) video = v; else L.video = v;
      if (c && c.video.videoWidth) withLane(L, () => setSize(c.video.videoWidth, c.video.videoHeight));
    });
    const live = activeLanes().filter(L => L.hubCam && L.hubCam.active).length;
    if (err && err.name !== "DuplicateCamera") engine(`เปิดกล้องได้ ${live} จาก ${nLanes()} ไลน์ — ${LQCam.errorText(err) || err.message}`, live ? "warn" : "err");
    else engine(`กล้องพร้อม ${live} ไลน์ — ประมวลผลภาพที่ความกว้าง 640 พิกเซลต่อไลน์`, live ? "ok" : "err");
    if (!live) retryBtn(() => startCamera());
    renderLaneTabs();
  }
  async function setSource(s) {
    source = s; stopStream(); showSourceUi();
    for (const L of activeLanes()) withLane(L, () => { mirrorCam = false; stillImg = null; prev = null; cur = null; pst = QC.presenceInit(); });
    running = false; $("#toggle").textContent = "เริ่มตรวจต่อเนื่อง"; $("#toggle").classList.remove("on"); renderRecipe();
    if (s === "camera") { if (nLanes() === 1) await listCameras(); startCamera(); }
    else if (s === "sim") { for (const L of activeLanes()) withLane(L, () => setSize(640, 480)); simClock = 0; engine("ภาพจำลองสายการผลิต: สายพานเดิน-หยุด สุ่มขวดบกพร่องประมาณ 30% ใช้สูตร “ภาพจำลอง” แล้วกด “สอบเทียบภาพจำลองอัตโนมัติ”", "ok"); }
    else if (s === "video") engine(`เลือกไฟล์วิดีโอของสายการผลิต (เล่นวนซ้ำ)${nLanes() > 1 ? " — ใช้กับไลน์ที่เลือก" : ""}`);
    else if (s === "image") engine(`เลือกรูปภาพขวด — ใช้รูปสายพานว่างสำหรับ “บันทึกพื้นหลังว่าง” และรูปขวดดีสำหรับ “บันทึกขวดตัวอย่างที่ผ่าน”${nLanes() > 1 ? " (ใช้กับไลน์ที่เลือก)" : ""}`);
  }
  $("#srcSel").onchange = e => setSource(e.target.value);
  $("#camSel").onchange = () => source === "camera" && startCamera();
  $("#flipCam").onclick = () => { if (source !== "camera" || nLanes() > 1) return; startCamera(false); };
  // หมุนจอมือถือ -> ขนาดภาพจากกล้องเปลี่ยน ปรับขนาดภาพประมวลผลตาม
  domVideo.addEventListener("resize", () => { if (source === "camera" && nLanes() === 1 && domVideo.videoWidth) withLane(lanes[0], () => setSize(domVideo.videoWidth, domVideo.videoHeight)); });
  // ปิด/เปิดกล้องเมื่อสลับแอป ล็อกจอ และรายการกล้องเมื่อเสียบ/ถอด USB: LQCam จัดการให้ (autoPause, devicechange)
  $("#videoFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const L = selLane();
    stopStream();
    const v = L.idx === 0 ? domVideo : Object.assign(document.createElement("video"), { muted: true, playsInline: true });
    if (L === curLane) video = v; else L.video = v;
    v.src = URL.createObjectURL(f); v.loop = true; v.muted = true;
    v.onloadedmetadata = () => { withLane(L, () => setSize(v.videoWidth, v.videoHeight)); v.play().catch(() => {}); engine(`${laneTag(L)}เล่นวิดีโอ ${f.name} (${v.videoWidth}×${v.videoHeight}) วนซ้ำ`, "ok"); };
    v.onerror = () => engine("เปิดไฟล์วิดีโอไม่ได้ (รูปแบบไม่รองรับ ลองใช้ MP4 H.264 หรือ WebM)", "err");
  };
  $("#imageFile").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const L = selLane(), img = new Image();
    img.onload = () => {
      withLane(L, () => {
        setSize(img.naturalWidth, img.naturalHeight); stillImg = img; URL.revokeObjectURL(img.src);
        engine(`${laneTag(L)}โหลดรูป ${f.name} แล้ว`, "ok");
        grab(performance.now());
        if (rec.golden) runInspect("image");
      });
      show();
    };
    img.onerror = () => engine("เปิดไฟล์รูปไม่ได้", "err");
    img.src = URL.createObjectURL(f);
    e.target.value = "";
  };
  $("#simSpeed").onchange = () => { simClock = 0; };

  window.__QC = { simPairRate: 0 }; // เฉพาะการทดสอบ: โอกาสมีขวดสองใบชิดกันในภาพจำลอง (ค่าเริ่มต้น 0 = ภาพจำลองเดิม)
  function grab(now) {
    if (source === "sim") {
      if (simBuf.length !== 2 || simBuf[0].width !== W || simBuf[0].height !== H) simBuf = [new ImageData(W, H), new ImageData(W, H)];
      const img = simBuf[0] === cur ? simBuf[1] : simBuf[0], period = +$("#simSpeed").value;
      simInfo = QC.simFrame(img, rec.sim || "600", simClock + curLane.idx * period * 0.37, period, 0.3, { pairRate: +window.__QC.simPairRate || 0 });
      fctx.putImageData(img, 0, 0); prev = cur; cur = img; return true;
    }
    const src = source === "image" ? stillImg : video;
    if (!src || (src === video && video.readyState < 2)) return false;
    if (source === "camera" && mirrorCam) { fctx.save(); fctx.translate(W, 0); fctx.scale(-1, 1); fctx.drawImage(src, 0, 0, W, H); fctx.restore(); }
    else fctx.drawImage(src, 0, 0, W, H);
    prev = cur; cur = fctx.getImageData(0, 0, W, H); return true;
  }

  // ---------- พื้นหลังว่าง (IndexedDB ต่อไลน์+สูตร ; ไม่มี IndexedDB = localStorage แบบเดิมเฉพาะไลน์ 1) ----------
  const bgKeyOf = L => QC.bgKey(L.id, (L === curLane ? rec : L.rec).id);
  function storeBg(L, dataUrl) {
    const r = L === curLane ? rec : L.rec;
    if (idbOk) {
      IDB.put("bg", bgKeyOf(L), { url: dataUrl, w: laneVar(L, "W"), h: laneVar(L, "H"), t: Date.now() })
        .then(() => { if (r.bg) { r.bg = null; persistRecipes(); } })
        .catch(e => { console.warn("bg idb", e); fallbackBg(L, r, dataUrl); });
    } else fallbackBg(L, r, dataUrl);
  }
  function fallbackBg(L, r, dataUrl) {
    if (L.idx !== 0) return; // สำรองแบบเดิม: เฉพาะไลน์ 1 ใน localStorage
    r.bg = dataUrl; if (!save(K.recipes, recipes)) r.bg = null;
  }
  function setBg(img, store = true) {
    bg = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    if (store) {
      let url = null;
      try { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").putImageData(img, 0, 0); url = c.toDataURL("image/jpeg", 0.85); } catch { url = null; }
      if (url) storeBg(curLane, url);
    }
    pst = QC.presenceInit();
    renderRecipe();
  }
  function loadBg(L = curLane) {
    const r = L === curLane ? rec : L.rec;
    setLaneBg(L, null); renderRecipe();
    if (!r) return;
    const apply = url => {
      if (!url) return;
      const im = new Image();
      im.onload = () => {
        if ((L === curLane ? rec : L.rec) !== r) return; // เปลี่ยนสูตรไปแล้ว
        const w = laneVar(L, "W"), h = laneVar(L, "H"), c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.drawImage(im, 0, 0, w, h); setLaneBg(L, x.getImageData(0, 0, w, h)); renderRecipe();
      };
      im.src = url;
    };
    const legacy = L.idx === 0 && typeof r.bg === "string" ? r.bg : null;
    if (idbOk === false) return apply(legacy);
    IDB.get("bg", QC.bgKey(L.id, r.id)).then(v => apply((v && v.url) || legacy), () => apply(legacy));
  }
  $("#captureBg").onclick = () => {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    if (source === "sim") { const im = new ImageData(W, H), G = QC.simGeom(rec.sim || "600", W, H); QC.simBackground(im, G); QC.simNoise(im, 99); fctx.putImageData(im, 0, 0); setBg(im); show(); return engine(laneTag(curLane) + "บันทึกพื้นหลังว่างของภาพจำลองแล้ว", "ok"); }
    setBg(cur); engine(laneTag(curLane) + "บันทึกพื้นหลังว่างแล้ว — ต้องไม่มีขวดอยู่ในภาพขณะบันทึก", "ok");
  };

  // ---------- สอบเทียบขวดตัวอย่าง ----------
  function calibrateFrom(img) {
    try {
      rec.golden = QC.calibrate(img, rec, bgOk());
      persistRecipes(); renderRecipe();
      const warn = rec.rois.cap && !bgOk() ? " (ยังไม่มีพื้นหลังว่าง: การแยก “ไม่มีฝา” กับ “สีฝาผิด” จะแม่นน้อยลง)" : "";
      engine(laneTag(curLane) + "บันทึกขวดตัวอย่างที่ผ่านแล้ว" + warn, warn ? "warn" : "ok");
      last = QC.inspect(img, rec, bgOk()); lastAt = performance.now(); if (curLane === selLane()) showResult(last);
      return true;
    } catch (e) { engine(laneTag(curLane) + "บันทึกขวดตัวอย่างไม่สำเร็จ: " + e.message, "err"); return false; }
  }
  $("#captureGolden").onclick = () => {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    calibrateFrom(cur);
  };
  function simCalibLane() {
    const G = QC.simGeom(rec.sim || "600", W, H);
    rec.rois = JSON.parse(JSON.stringify(G.rois));
    const e = new ImageData(W, H); QC.simBackground(e, G); QC.simNoise(e, 99); setBg(e, true);
    const g = new ImageData(W, H); QC.simBackground(g, G); QC.simBottle(g, G, W / 2, null); QC.simNoise(g, 7);
    fctx.putImageData(g, 0, 0);
    return calibrateFrom(g);
  }
  $("#simCalib").onclick = () => {
    // หลายไลน์: สอบเทียบทุกไลน์ที่ใช้สูตรภาพจำลอง
    const todo = nLanes() > 1 ? activeLanes().filter(L => (L === curLane ? rec : L.rec)?.sim) : [selLane()];
    let ok = 0;
    for (const L of todo) if (withLane(L, simCalibLane)) ok++;
    show();
    if (todo.length > 1) engine(`สอบเทียบภาพจำลองแล้ว ${ok} จาก ${todo.length} ไลน์`, ok === todo.length ? "ok" : "warn");
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
  /* รูปย่อขวดที่คัดทิ้ง: ตัดเฉพาะกรอบที่ครอบพื้นที่ตรวจ (ไม่เก็บภาพเต็มเฟรม) */
  function thumb() {
    const rs = Object.values(rec.rois).filter(Boolean).map(r => QC.roiPx(r, W, H));
    if (!rs.length) rs.push({ x: 0, y: 0, w: W, h: H });
    const x0 = Math.max(0, Math.min(...rs.map(r => r.x)) - 8), y0 = Math.max(0, Math.min(...rs.map(r => r.y)) - 8);
    const x1 = Math.min(W, Math.max(...rs.map(r => r.x + r.w)) + 8), y1 = Math.min(H, Math.max(...rs.map(r => r.y + r.h)) + 8);
    const c = document.createElement("canvas"), s = 110 / (y1 - y0);
    c.height = 110; c.width = Math.max(30, Math.round((x1 - x0) * s));
    const x = c.getContext("2d");
    x.drawImage(frame, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    const ov = document.createElement("canvas"); ov.width = W; ov.height = H; drawOverlay(ov.getContext("2d"));
    x.drawImage(ov, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    try { return c.toDataURL("image/jpeg", 0.7); } catch { return ""; }
  }
  const thumbUrls = new Map(); // ik -> data URL (หน่วยความจำ สำหรับแสดงผล)
  function keepThumb(entry, url) {
    if (!url) return;
    const key = QC.thumbKey(entry);
    thumbUrls.set(key, url);
    if (idbOk) { entry.ik = key; IDB.put("thumbs", key, url).catch(() => { entry.ik = ""; entry.img = url; persistShift(); }); }
    else entry.img = url; // ไม่มี IndexedDB: แบบเดิม
  }
  function dropThumbs(list) {
    for (const r of list) { if (!r || !r.ik) continue; thumbUrls.delete(r.ik); if (idbOk) IDB.del("thumbs", r.ik).catch(() => {}); }
  }
  function sendWebhook(r) {
    if (!settings.webhookOn || !settings.webhook) return;
    const L = curLane;
    const body = { event: "reject", time: new Date(r.t).toISOString(), lane: L.id, laneNo: L.idx + 1, recipe: rec.name, reasons: r.reasons, reasonsTh: r.reasons.map(k => QC.REASONS[k]),
      fill: r.fill && { y: r.fill.y, target: r.fill.target, status: r.fill.status }, capDeltaE: r.cap?.de ?? null, capAngle: r.cap?.angle ?? null, labelSimilarity: r.label?.sim ?? null,
      warnings: r.warn || [] };
    fetch(settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); })
      .catch(e => engine(`ส่งสัญญาณคัดทิ้งไปยังเว็บฮุกไม่สำเร็จ: ${e.message} (ตรวจ URL และการตั้งค่า CORS ของปลายทาง)`, "warn"));
  }
  /* ขวดสองใบในพื้นที่ทริกเกอร์ (ภาพปัจจุบันเทียบพื้นหลังว่าง) */
  function multiNow() {
    const b = bgOk(), tr = QC.roiPx(rec.rois.trigger, W, H);
    if (!b || !tr || !cur) return null;
    return QC.multiCheck(QC.blobs(cur, b, tr, 30, 2), rec.golden?.trigW ?? null);
  }
  function noteMulti(m) {
    const L = curLane;
    laneShift(L.id).multi++;
    L.multiAt = performance.now(); L.lastMulti = m;
    engine(`${laneTag(L)}พบขวด ${m.kind === "wide" ? "ชิดกัน" : m.n + " ใบ"}ในพื้นที่ทริกเกอร์ — ตรวจระยะห่างขวดบนสายพาน (ผลตรวจขวดนี้อาจไม่ถูกต้อง)`, "warn");
    persistShift();
  }
  function runInspect(how) {
    if (!cur) return engine("ยังไม่มีภาพจากแหล่งภาพ", "warn");
    if (!rec.golden) return engine(laneTag(curLane) + "ยังไม่มีขวดตัวอย่าง: วางขวดที่ผ่านแล้วกด “บันทึกขวดตัวอย่างที่ผ่าน” ก่อน", "warn");
    const L = curLane, r = QC.inspect(cur, rec, bgOk());
    r.how = how; r.sim = source === "sim" ? simInfo?.defect || "ok" : "";
    const m = how === "auto" ? (pst.multi ? curLane.lastMulti : null) : multiNow();
    if (m && m.multi) { r.warn = ["multi"]; if (how !== "auto") noteMulti(m); }
    last = r; lastAt = performance.now();
    scqObserve(r, L, how);
    const ls = laneShift(L.id);
    shift.total++; ls.total++;
    if (r.pass) { shift.pass++; ls.pass++; }
    else {
      shift.reject++; ls.reject++;
      r.reasons.forEach(k => { shift.reasons[k] = (shift.reasons[k] || 0) + 1; ls.reasons[k] = (ls.reasons[k] || 0) + 1; });
      const entry = { t: r.t, lane: L.id, reasons: r.reasons, img: "" };
      keepThumb(entry, thumb());
      shift.rejects.unshift(entry);
      if (shift.rejects.length > 20) dropThumbs(shift.rejects.splice(20));
      beep(); sendWebhook(r);
    }
    shift.log.push({
      t: r.t, lane: L.id, recipe: rec.name, how, pass: r.pass, reasons: r.reasons,
      fy: r.fill?.y == null ? null : +r.fill.y.toFixed(1), ft: r.fill ? +r.fill.target.toFixed(1) : null, fs: r.fill?.status || "",
      cc: r.cap ? +(r.cap.coverage * 100).toFixed(1) : null, cde: r.cap?.de == null ? null : +r.cap.de.toFixed(1), ca: r.cap?.angle == null ? null : +r.cap.angle.toFixed(1),
      ls: r.label ? +r.label.sim.toFixed(1) : null, lsh: r.label ? r.label.shift : null, sim: r.sim, w: r.warn ? r.warn.join(";") : ""
    });
    if (shift.log.length > 5000) { shift.log.splice(0, shift.log.length - 5000); }
    persistShift();
    if (L === selLane()) { drawOverlay(); showResult(r); }
    renderStats();
  }
  $("#inspectNow").onclick = () => runInspect("manual");
  // round 12: แท็บถูกซ่อน/จอดับ = กล้องหยุด — Wake Lock ระหว่างตรวจต่อเนื่อง แจ้งเมื่อกลับมา และเก็บช่วงที่ไม่ได้ตรวจไว้กับกะ (ตัวเลขเท่านั้น)
  const UA = LQCam.unattended ? LQCam.unattended({ container: $("#uaBox") || $("#engine").parentNode, isRunning: () => running && source !== "sim", tag: "หยุดตรวจ",
    gapText: "แท็บถูกซ่อนหรือจอดับ {a}–{b} ({m}) — ระหว่างนั้นไม่ได้ตรวจขวด ขวดที่ผ่านไลน์ในช่วงนี้ไม่ได้ถูกตรวจ · เปิดแท็บนี้ไว้ด้านหน้าและตั้งจอไม่ให้ดับเอง",
    onGap: g => { (shift.gaps || (shift.gaps = [])).push({ from: g.from, to: g.to }); while (shift.gaps.length > 50) shift.gaps.shift(); save(K.shift, shift); } }) : null;
  $("#toggle").addEventListener("click", () => setTimeout(() => { if (!UA) return; if (running) UA.start(); else UA.stop(); }, 0)); // หลัง onclick ด้านล่างสลับ running แล้ว
  $("#toggle").onclick = () => {
    if (!running) {
      if (source === "image") return engine("โหมดตรวจต่อเนื่องใช้กับกล้อง วิดีโอ หรือภาพจำลอง — สำหรับรูปภาพให้กด “ตรวจเดี๋ยวนี้”", "warn");
      const issues = [];
      for (const L of activeLanes()) withLane(L, () => {
        const tag = nLanes() > 1 ? `ไลน์ ${L.idx + 1}: ` : "";
        if (!rec.rois.trigger) issues.push(tag + "ยังไม่ได้ลากพื้นที่ “ขวด/ทริกเกอร์” บนภาพ");
        else if (!bg) issues.push(tag + "โหมดต่อเนื่องต้องมีพื้นหลังว่าง: นำขวดออกจากภาพแล้วกด “บันทึกพื้นหลังว่าง”");
        else if (!rec.golden) issues.push(tag + "ยังไม่มีขวดตัวอย่าง: กด “บันทึกขวดตัวอย่างที่ผ่าน” ก่อน");
      });
      if (issues.length) return engine(issues.join(" · "), "warn");
    }
    // เริ่มในสถานะ "ตรวจแล้ว": ถ้ามีขวดค้างอยู่ครึ่ง ๆ กลาง ๆ จะไม่ถูกนับว่าผ่านไปโดยไม่ได้ตรวจ รอขวดถัดไป
    running = !running;
    for (const L of activeLanes()) withLane(L, () => { pst = { ...QC.presenceInit(), phase: "done" }; });
    $("#toggle").textContent = running ? "หยุดตรวจต่อเนื่อง" : "เริ่มตรวจต่อเนื่อง";
    $("#toggle").classList.toggle("on", running);
    engine(running ? `กำลังตรวจต่อเนื่อง${nLanes() > 1 ? ` ${nLanes()} ไลน์` : ""}: ตรวจขวดละ 1 ครั้งเมื่อขวดอยู่กลางพื้นที่ทริกเกอร์` : "หยุดตรวจต่อเนื่องแล้ว", "ok");
  };

  function showResult(r) {
    const b = $("#banner");
    if (!r) { b.className = "banner idle"; b.querySelector("b").textContent = "รอตรวจ"; b.querySelector("span").textContent = "ยังไม่มีผลการตรวจ"; $("#measure").innerHTML = `<tr><td>ผลการวัดแต่ละจุดจะแสดงที่นี่</td></tr>`; $("#simTruth").textContent = ""; return; }
    b.className = "banner " + (r.pass ? "pass" : "reject");
    b.querySelector("b").textContent = (nLanes() > 1 ? `ไลน์ ${selIdx + 1} · ` : "") + (r.pass ? "ผ่าน (PASS)" : "คัดทิ้ง (REJECT)");
    b.querySelector("span").textContent = (r.pass ? "ขวดนี้ผ่านทุกจุดตรวจ" : r.reasons.map(k => QC.REASONS[k]).join(" · ")) + (r.warn && r.warn.includes("multi") ? " · ⚠ พบขวดมากกว่า 1 ใบในพื้นที่ทริกเกอร์" : "");
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
    if (r.label) rows.push(["ฉลาก", r.label.reasons.length ? QC.REASONS[r.label.reasons[0]] : "ถูกต้อง", `ความคล้าย ${f1(r.label.sim)}% · ขอบ ${f1(r.label.edgeRatio * 100)}% · เลื่อน ${r.label.shift} px${r.label.angle != null ? ` · เอียง ${f1(r.label.angle)}°` : ""}`, !r.label.reasons.length]);
    $("#measure").innerHTML = rows.map(([k, v, d, ok]) => `<tr class="${ok ? "" : "bad"}"><th>${k}</th><td>${esc(v)}</td><td>${esc(d)}</td></tr>`).join("") ||
      `<tr><td colspan="3">ไม่มีพื้นที่ตรวจที่สอบเทียบแล้ว</td></tr>`;
    if (r.sim !== undefined && r.sim !== "") $("#simTruth").textContent = `ภาพจำลองสร้างข้อบกพร่อง: ${r.sim === "ok" ? "ไม่มี (ขวดดี)" : QC.REASONS[r.sim]}`;
    else $("#simTruth").textContent = "";
  }

  // ---------- วาดซ้อนบนภาพ ----------
  /* ctx = บริบทที่จะวาด (ค่าเริ่มต้น overlay บนหน้าจอ) · plain = ไม่วาดผลตรวจ/สถานะ (สำหรับรูปย่อ) */
  function drawOverlay(ctx = octx, plain = false) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2; ctx.font = "13px Prompt, sans-serif";
    for (const k of Object.keys(ROI_NAMES)) {
      const r = QC.roiPx(rec.rois[k], W, H); if (!r) continue;
      ctx.strokeStyle = ROI_COL[k]; ctx.setLineDash(k === activeRoi ? [] : [6, 4]); ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
      ctx.setLineDash([]);
      const tw = ctx.measureText(ROI_NAMES[k]).width + 8;
      const ty = k === "trigger" ? r.y + r.h - 18 : r.y - 18 < 0 ? r.y + r.h : r.y - 18;
      const tx = k === "label" ? r.x + r.w - tw : k === "fill" ? r.x + r.w + 4 : r.x;
      ctx.fillStyle = ROI_COL[k]; ctx.fillRect(tx, ty, tw, 18); ctx.fillStyle = "#fff"; ctx.fillText(ROI_NAMES[k], tx + 4, ty + 14);
    }
    const fr = QC.roiPx(rec.rois.fill, W, H);
    if (fr && rec.golden?.fillYN != null) {
      const t = rec.golden.fillYN * H, tp = QC.fillTolPx(rec, fr);
      ctx.fillStyle = "rgba(26,127,75,.22)"; ctx.fillRect(fr.x - 24, t - tp, fr.w + 48, tp * 2);
      ctx.strokeStyle = "rgba(26,127,75,.8)"; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(fr.x - 24, t); ctx.lineTo(fr.x + fr.w + 24, t); ctx.stroke(); ctx.setLineDash([]);
    }
    if (plain) return;
    if (drag) {
      ctx.strokeStyle = ROI_COL[activeRoi]; ctx.lineWidth = 2;
      ctx.strokeRect(Math.min(drag.x0, drag.x1) * W, Math.min(drag.y0, drag.y1) * H, Math.abs(drag.x1 - drag.x0) * W, Math.abs(drag.y1 - drag.y0) * H);
    }
    const fresh = last && (!running || performance.now() - lastAt < 2500);
    if (fresh) {
      const r = last;
      if (r.fill && fr && r.fill.y != null) {
        ctx.strokeStyle = r.fill.status === "ok" ? "#1a7f4b" : "#c0392b"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(fr.x - 30, r.fill.y); ctx.lineTo(fr.x + fr.w + 30, r.fill.y); ctx.stroke();
      }
      const cr = QC.roiPx(rec.rois.cap, W, H);
      if (r.cap && cr && r.cap.topL != null && r.cap.topR != null) {
        ctx.strokeStyle = r.cap.reasons.length ? "#c0392b" : "#1a7f4b"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cr.x + r.cap.xL, cr.y + r.cap.topL); ctx.lineTo(cr.x + r.cap.xR, cr.y + r.cap.topR); ctx.stroke();
      }
      ctx.font = "600 22px Prompt, sans-serif";
      const txt = r.pass ? "ผ่าน" : "คัดทิ้ง", tw = ctx.measureText(txt).width + 20;
      ctx.fillStyle = r.pass ? "rgba(26,127,75,.9)" : "rgba(192,57,43,.92)"; ctx.fillRect(10, 10, tw, 34);
      ctx.fillStyle = "#fff"; ctx.fillText(txt, 20, 35);
    }
    const tr = QC.roiPx(rec.rois.trigger, W, H);
    if (tr && curLane.lastMulti && performance.now() - curLane.multiAt < 3000) {
      ctx.strokeStyle = "#d79b00"; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
      for (const g of curLane.lastMulti.groups || []) ctx.strokeRect(tr.x + g.x0 * tr.w, tr.y + 2, (g.x1 - g.x0) * tr.w, tr.h - 4);
      ctx.setLineDash([]);
      ctx.font = "13px Prompt, sans-serif"; const s = "ขวดมากกว่า 1 ใบ", tw = ctx.measureText(s).width + 12;
      ctx.fillStyle = "rgba(160,110,0,.92)"; ctx.fillRect(tr.x, tr.y - 22, tw, 22); ctx.fillStyle = "#fff"; ctx.fillText(s, tr.x + 6, tr.y - 6);
    }
    if (running && trigObs) {
      const ph = { empty: "รอขวด", present: "พบขวด รอให้อยู่กลาง/นิ่ง", done: "ตรวจแล้ว รอขวดออก" }[pst.phase];
      ctx.font = "13px Prompt, sans-serif"; ctx.fillStyle = "rgba(11,42,60,.8)";
      const s = `${ph} · ${(trigObs.frac * 100).toFixed(0)}%`, tw = ctx.measureText(s).width + 12;
      ctx.fillRect(W - tw - 10, 10, tw, 22); ctx.fillStyle = "#fff"; ctx.fillText(s, W - tw - 4, 26);
      if (tr && trigObs.frac > 0.02) { ctx.fillStyle = "#2a78d6"; ctx.beginPath(); ctx.arc(tr.x + trigObs.cx * tr.w, tr.y + tr.h / 2, 5, 0, 7); ctx.fill(); }
    }
  }

  // ---------- ลาก ROI (ไลน์ที่เลือก) ----------
  const pt = e => { const b = overlay.getBoundingClientRect(); return { x: QC.clamp((e.clientX - b.left) / b.width, 0, 1), y: QC.clamp((e.clientY - b.top) / b.height, 0, 1) }; };
  overlay.addEventListener("pointerdown", e => { const p = pt(e); drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; overlay.setPointerCapture(e.pointerId); });
  overlay.addEventListener("pointermove", e => { if (!drag) return; const p = pt(e); drag.x1 = p.x; drag.y1 = p.y; if (source === "image") drawOverlay(); });
  overlay.addEventListener("pointerup", () => {
    if (!drag) return;
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    drag = null;
    if (r.w * W < 6 || r.h * H < 6) { drawOverlay(); return engine("พื้นที่เล็กเกินไป ลากให้กว้างกว่านี้", "warn"); }
    rec.rois[activeRoi] = r;
    if (activeRoi !== "trigger" && rec.golden) { rec.golden = null; engine(`${laneTag(curLane)}เปลี่ยนพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว ต้องบันทึกขวดตัวอย่างที่ผ่านใหม่`, "warn"); }
    else engine(`${laneTag(curLane)}กำหนดพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว`, "ok");
    persistRecipes(); renderRecipe(); drawOverlay();
  });
  overlay.addEventListener("pointercancel", () => { drag = null; });
  $("#roiChips").onclick = e => {
    const b = e.target.closest("button[data-roi]"); if (!b) return;
    activeRoi = b.dataset.roi; renderRecipe(); drawOverlay();
  };
  $("#clearRoi").onclick = () => { rec.rois[activeRoi] = null; if (activeRoi !== "trigger") rec.golden = null; persistRecipes(); renderRecipe(); drawOverlay(); engine(`${laneTag(curLane)}ลบพื้นที่ “${ROI_NAMES[activeRoi]}” แล้ว (ไม่ตรวจจุดนี้)`, "ok"); };

  // ---------- ไลน์ ----------
  function renderLaneTabs() {
    const box = $("#laneTabs"), n = nLanes();
    box.hidden = n < 2;
    $("#laneCount").value = String(n);
    if (n < 2) { box.innerHTML = ""; return; }
    stash();
    box.innerHTML = activeLanes().map(L => {
      const s = laneShift(L.id), y = s.total ? (s.pass / s.total * 100).toFixed(0) + "%" : "—";
      const camTxt = source === "camera" ? (L.hubCam ? (L.hubCam.active ? "" : " · กล้องหยุด") : " · ไม่มีกล้อง") : "";
      const lr = L.last ? (L.last.pass ? "pass" : "reject") : "idle";
      return `<button type="button" class="lane-tab" role="tab" data-lane="${L.idx}" aria-selected="${L.idx === selIdx}"><i class="dot ${lr}"></i>ไลน์ ${L.idx + 1}<small>${esc((L.rec && L.rec.name) || "")}</small><small>ตรวจ ${s.total} · ผ่าน ${y}${s.multi ? ` · ⚠ ${s.multi}` : ""}${camTxt}</small></button>`;
    }).join("");
  }
  $("#laneTabs").onclick = e => { const b = e.target.closest("[data-lane]"); if (b) selectLane(+b.dataset.lane); };
  function selectLane(i) {
    if (i === selIdx || i >= nLanes()) return;
    selIdx = i; use(lanes[i]);
    syncDisplay(); renderRecipe(); renderLaneTabs(); drawOverlay(); showResult(last); show();
    $("#statLane").value = nLanes() > 1 ? lanes[i].id : "";
    renderStats();
  }
  $("#laneCount").onchange = e => setLanes(+e.target.value);
  function setLanes(n) {
    n = Math.max(1, Math.min(4, Math.round(n) || 1));
    if (n === nLanes()) return;
    if (running) $("#toggle").click();
    use(lanes[0]); selIdx = 0;
    settings.lanes = n; assignRecipes(); persistRecipes();
    for (const L of activeLanes()) if (L.idx > 0) { withLane(L, () => { setSize(640, 480); }); loadBg(L); }
    renderLaneTabs(); renderRecipe(); renderStats(); showSourceUi();
    if (source === "camera") setSource("camera");
    engine(n > 1 ? `ใช้ ${n} ไลน์ — แต่ละไลน์มีสูตร (พื้นที่ตรวจ เกณฑ์ ขวดตัวอย่าง) และพื้นหลังว่างของตัวเอง เลือกไลน์จากแถบด้านบนภาพเพื่อตั้งค่า` : "กลับเป็นไลน์เดียว", "ok");
  }

  // ---------- สูตรการตรวจ (ของไลน์ที่เลือก) ----------
  function renderRecipe() {
    $("#recipeSel").innerHTML = recipes.map(r => `<option value="${esc(r.id)}"${r === rec ? " selected" : ""}>${esc(r.name)}</option>`).join("");
    $("#recipeName").value = rec.name;
    $("#recipeLane").textContent = nLanes() > 1 ? `ไลน์ ${curLane.idx + 1}` : "";
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
    $("#simCalib").textContent = nLanes() > 1 ? "สอบเทียบภาพจำลองอัตโนมัติ (ทุกไลน์)" : "สอบเทียบภาพจำลองอัตโนมัติ";
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
  $("#recipeSel").onchange = e => { rec = recipes.find(r => r.id === e.target.value) || recipes[0]; persistRecipes(); last = null; pst = QC.presenceInit(); loadBg(); if (source === "sim") simClock = 0; engine(`${laneTag(curLane)}ใช้สูตร “${rec.name}”`, "ok"); renderLaneTabs(); };
  $("#recipeName").onchange = e => { const n = e.target.value.trim(); if (n) { rec.name = n.slice(0, 50); persistRecipes(); renderRecipe(); renderLaneTabs(); } };
  $("#recipeNew").onclick = () => {
    const n = prompt("ชื่อสูตรใหม่ (เช่น ขวดใส 600 มล. ไลน์ 2)", rec.name + " (สำเนา)"); if (!n) return;
    const c = JSON.parse(JSON.stringify(rec)); c.id = "r" + Date.now().toString(36); c.name = n.trim().slice(0, 50); delete c.sim; c.bg = null;
    if (source === "sim") c.sim = rec.sim;
    recipes.push(c); rec = c; persistRecipes(); renderRecipe(); engine(`สร้างสูตร “${c.name}” แล้ว (คัดลอกพื้นที่ตรวจและเกณฑ์จากสูตรเดิม)`, "ok");
    if (bg) { try { const cv = document.createElement("canvas"); cv.width = bg.width; cv.height = bg.height; cv.getContext("2d").putImageData(bg, 0, 0); storeBg(curLane, cv.toDataURL("image/jpeg", 0.85)); } catch { /* ignore */ } }
  };
  $("#recipeDel").onclick = () => {
    if (recipes.length < 2) return engine("ต้องมีอย่างน้อย 1 สูตร", "warn");
    if (!confirm(`ลบสูตร “${rec.name}”?`)) return;
    const gone = rec;
    recipes = recipes.filter(r => r !== gone);
    stash();
    for (const L of lanes) if (L.rec === gone) { if (L === curLane) rec = recipes[0]; L.rec = recipes[0]; }
    if (idbOk) for (const id of LANE_IDS) IDB.del("bg", QC.bgKey(id, gone.id)).catch(() => {});
    persistRecipes(); loadBg(); engine("ลบสูตรแล้ว", "ok");
  };

  // ---------- สถิติ ----------
  function throughput(now = Date.now(), lane = null) {
    const log = lane ? shift.log.filter(l => (l.lane || "L1") === lane) : shift.log, total = lane ? laneShift(lane).total : shift.total;
    const lastMin = log.filter(l => now - l.t <= 60000).length;
    const first = log[0]?.t, mins = first ? Math.max(1 / 60, (now - first) / 60000) : 0;
    return { lastMin, avg: mins ? total / mins : 0 };
  }
  const statLane = () => (nLanes() > 1 ? $("#statLane").value || null : null);
  function renderStats() {
    const lane = statLane(), st = QC.laneStats(shift, lane), y = st.total ? st.pass / st.total * 100 : 0, tp = throughput(Date.now(), lane);
    const multi = nLanes() > 1;
    $("#statLane").hidden = !multi;
    $("#statLane").innerHTML = `<option value="">รวมทุกไลน์</option>` + activeLanes().map(L => `<option value="${L.id}"${lane === L.id ? " selected" : ""}>ไลน์ ${L.idx + 1}</option>`).join("");
    const tile = (k, v, s = "") => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#tiles").innerHTML = tile("ตรวจแล้ว", st.total.toLocaleString("th-TH"), "ขวด") + tile("ผ่าน", st.pass.toLocaleString("th-TH"), "ขวด") +
      tile("คัดทิ้ง", st.reject.toLocaleString("th-TH"), "ขวด") + tile("Yield", st.total ? y.toFixed(1) + "%" : "—", "ผ่าน / ตรวจทั้งหมด") +
      tile("อัตราการผลิต", tp.lastMin, `ขวด/นาที (เฉลี่ยทั้งกะ ${tp.avg.toFixed(1)})`) + tile("ผ่านไปไม่ได้ตรวจ", st.missed, "ขวด") +
      (st.multi ? tile("เตือนขวดซ้อน", st.multi, "ครั้ง (ขวดมากกว่า 1 ใบในพื้นที่ทริกเกอร์)") : "");
    const keys = Object.keys(QC.REASONS);
    $("#byReason").innerHTML = keys.map(k => `<li><span>${QC.REASONS[k]}</span><b>${st.reasons[k] || 0}</b></li>`).join("");
    const rj = lane ? shift.rejects.filter(r => (r.lane || "L1") === lane) : shift.rejects;
    $("#rejects").innerHTML = rj.length ? rj.map(r => { const src = r.img || (r.ik && thumbUrls.get(r.ik)) || ""; return `<figure>${src ? `<img src="${src}" alt="">` : r.ik ? `<img data-ik="${esc(r.ik)}" alt="">` : ""}<figcaption>${multi ? `ไลน์ ${LANE_IDS.indexOf(r.lane || "L1") + 1} · ` : ""}${new Date(r.t).toLocaleTimeString("th-TH")}<br>${esc(r.reasons.map(k => QC.SHORT[k]).join(", "))}</figcaption></figure>`; }).join("") : `<p class="hint">ยังไม่มีขวดที่ถูกคัดทิ้ง</p>`;
    fillThumbs();
    $("#shiftStart").textContent = new Date(shift.start).toLocaleString("th-TH");
    renderLaneTable();
    drawPareto(st.reasons); drawPChart(lane);
    renderLaneTabs();
  }
  function fillThumbs() {
    if (!idbOk) return;
    document.querySelectorAll("#rejects img[data-ik]").forEach(/** @param {HTMLImageElement} im */ im => {
      const k = im.dataset.ik; im.removeAttribute("data-ik");
      IDB.get("thumbs", k).then(u => { if (u) { thumbUrls.set(k, u); im.src = u; } }).catch(() => {});
    });
  }
  function renderLaneTable() {
    const wrap = $("#laneWrap"); wrap.hidden = nLanes() < 2;
    if (nLanes() < 2) return;
    const rows = activeLanes().map(L => {
      const s = laneShift(L.id), pc = QC.pChart(shift.log, { lane: L.id, size: settings.pSize });
      return `<tr><td>ไลน์ ${L.idx + 1}</td><td class="n">${s.total}</td><td class="n">${s.pass}</td><td class="n">${s.reject}</td><td class="n">${s.total ? (s.pass / s.total * 100).toFixed(1) + "%" : "—"}</td><td class="n">${s.missed}</td><td class="n">${s.multi}</td><td>${pc.groups.length < 2 ? "ข้อมูลยังน้อย" : pc.outCount ? `<b class="ooc">หลุดเกณฑ์ ${pc.outCount} กลุ่ม</b>` : "อยู่ในเกณฑ์"}</td></tr>`;
    });
    $("#laneTable").innerHTML = `<thead><tr><th>ไลน์</th><th class="n">ตรวจ</th><th class="n">ผ่าน</th><th class="n">คัดทิ้ง</th><th class="n">Yield</th><th class="n">ไม่ได้ตรวจ</th><th class="n">ขวดซ้อน</th><th>p-chart</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  }
  function drawPareto(reasons = shift.reasons) {
    const c = $("#pareto"), dpr = window.devicePixelRatio || 1, cw = c.clientWidth || 500, ch = 260;
    c.width = cw * dpr; c.height = ch * dpr; c.style.height = ch + "px";
    const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
    const data = Object.entries(reasons).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
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
  /* p-chart: สัดส่วนของเสียต่อกลุ่มย่อย (size ขวด) พร้อมเส้น p̄ และขีดควบคุม UCL/LCL (ต่อไลน์ หรือรวม) */
  function drawPChart(lane) {
    const pc = QC.pChart(shift.log, { lane: nLanes() > 1 ? lane : null, size: settings.pSize });
    const c = $("#pchart"), dpr = window.devicePixelRatio || 1, cw = c.clientWidth || 500, ch = 220;
    c.width = cw * dpr; c.height = ch * dpr; c.style.height = ch + "px";
    const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
    x.font = "12px Prompt, sans-serif"; x.fillStyle = "#5b7585";
    const pct = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
    $("#pInfo").textContent = pc.groups.length
      ? `p̄ = ${pct(pc.pbar)} จาก ${pc.n} ขวด (${pc.groups.length} กลุ่ม ละ ${pc.size} ขวด) · ${pc.outCount ? `หลุดขีดควบคุม ${pc.outCount} กลุ่ม — ตรวจหาสาเหตุพิเศษ (เปลี่ยนล็อต/เครื่องจักร/แสง)` : "ทุกกลุ่มอยู่ในขีดควบคุม"}`
      : "ยังไม่มีข้อมูลการตรวจ";
    c.setAttribute("aria-label", "p-chart สัดส่วนของเสีย: " + $("#pInfo").textContent);
    if (!pc.groups.length) { x.textAlign = "center"; x.fillText("ยังไม่มีข้อมูลการตรวจ", cw / 2, ch / 2); return; }
    const L = 42, R = 12, T = 12, B = 28, pw = cw - L - R, ph = ch - T - B;
    const top = Math.min(1, Math.max(0.05, ...pc.groups.map(g => Math.max(g.p, g.ucl))) * 1.15);
    const Y = v => T + ph - v / top * ph, n = pc.groups.length, X = i => L + (n === 1 ? pw / 2 : i * pw / (n - 1));
    x.strokeStyle = "#e6edf1"; x.lineWidth = 1; x.textAlign = "right";
    for (let i = 0; i <= 4; i++) { const v = top * i / 4, yy = Y(v); x.beginPath(); x.moveTo(L, yy); x.lineTo(L + pw, yy); x.stroke(); x.fillText(pct(v), L - 6, yy + 4); }
    const step = (k, col, dash) => {
      x.strokeStyle = col; x.setLineDash(dash); x.lineWidth = 1.5; x.beginPath();
      pc.groups.forEach((g, i) => { const xa = n === 1 ? L : X(i) - (i ? pw / (n - 1) / 2 : 0), xb = n === 1 ? L + pw : X(i) + (i < n - 1 ? pw / (n - 1) / 2 : 0); x[i ? "lineTo" : "moveTo"](xa, Y(g[k])); x.lineTo(xb, Y(g[k])); });
      x.stroke(); x.setLineDash([]);
    };
    step("ucl", "#c0392b", [5, 4]); if (pc.groups.some(g => g.lcl > 0)) step("lcl", "#c0392b", [5, 4]);
    x.strokeStyle = "#1a7f4b"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(L, Y(pc.pbar)); x.lineTo(L + pw, Y(pc.pbar)); x.stroke();
    x.strokeStyle = "#0b2a3c"; x.lineWidth = 2; x.beginPath(); pc.groups.forEach((g, i) => x[i ? "lineTo" : "moveTo"](X(i), Y(g.p))); x.stroke();
    pc.groups.forEach((g, i) => { x.fillStyle = g.out ? "#c0392b" : "#0b2a3c"; x.beginPath(); x.arc(X(i), Y(g.p), g.out ? 5 : 3, 0, 7); x.fill(); });
    x.fillStyle = "#5b7585"; x.textAlign = "left"; x.fillText("จุด = สัดส่วนของเสียต่อกลุ่ม · เส้นเขียว = p̄ · เส้นแดงประ = UCL/LCL (±3σ)", L, ch - 8);
  }
  $("#statLane").onchange = () => renderStats();
  $("#pSize").value = settings.pSize;
  $("#pSize").onchange = e => { const v = Math.round(+e.target.value); if (v >= 5 && v <= 500) { settings.pSize = v; save(K.settings, settings); renderStats(); } else e.target.value = settings.pSize; };
  window.addEventListener("resize", () => renderStats());
  const cell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
  $("#exportCsv").onclick = () => {
    const head = ["time", "recipe", "trigger", "result", "reasons", "fill_y_px", "fill_target_px", "fill_status", "cap_coverage_pct", "cap_deltaE", "cap_angle_deg", "label_similarity_pct", "label_shift_px", "sim_truth", "lane", "warning"];
    const rows = shift.log.map(l => [new Date(l.t).toISOString(), l.recipe, l.how, l.pass ? "PASS" : "REJECT", l.reasons.map(k => QC.REASONS[k]).join("; "), l.fy, l.ft, l.fs, l.cc, l.cde, l.ca, l.ls, l.lsh, l.sim, l.lane || "L1", l.w || ""]);
    const tp = throughput();
    const sum = [[], ["สรุปกะ"], ["เริ่มกะ", new Date(shift.start).toISOString()], ["ตรวจทั้งหมด", shift.total], ["ผ่าน", shift.pass], ["คัดทิ้ง", shift.reject],
      ["Yield %", shift.total ? (shift.pass / shift.total * 100).toFixed(2) : ""], ["ผ่านไปไม่ได้ตรวจ", shift.missed], ["อัตราเฉลี่ย ขวด/นาที", tp.avg.toFixed(2)],
      ...Object.keys(QC.REASONS).map(k => [QC.REASONS[k], shift.reasons[k] || 0])];
    if (nLanes() > 1 || Object.keys(shift.lanes).length > 1) {
      sum.push([], ["รายไลน์"], ["ไลน์", "ตรวจ", "ผ่าน", "คัดทิ้ง", "Yield %", "ไม่ได้ตรวจ", "เตือนขวดซ้อน", "p̄ %", "กลุ่มหลุดขีดควบคุม"]);
      for (const id of Object.keys(shift.lanes).sort()) {
        const s = shift.lanes[id], pc = QC.pChart(shift.log, { lane: id, size: settings.pSize });
        sum.push([id, s.total, s.pass, s.reject, s.total ? (s.pass / s.total * 100).toFixed(2) : "", s.missed, s.multi || 0, (pc.pbar * 100).toFixed(2), pc.outCount]);
      }
    }
    const d = new Date(shift.start), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    download(`qc-shift-${stamp}.csv`, "﻿" + [head, ...rows, ...sum].map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };
  $("#resetShift").onclick = () => {
    if (shift.total && !confirm("รีเซ็ตตัวนับและบันทึกของกะนี้? (แนะนำให้ส่งออก CSV ก่อน)")) return;
    dropThumbs(shift.rejects); if (idbOk) IDB.clear("thumbs").catch(() => {});
    shift = newShift(); save(K.shift, shift);
    for (const L of activeLanes()) withLane(L, () => { last = null; });
    renderStats(); showResult(null); engine("เริ่มกะใหม่แล้ว", "ok");
  };

  // ---------- การตั้งค่า ----------
  $("#beep").checked = settings.beep; $("#webhookOn").checked = settings.webhookOn; $("#webhook").value = settings.webhook;
  const saveSettings = () => { settings.beep = $("#beep").checked; settings.webhookOn = $("#webhookOn").checked; settings.webhook = $("#webhook").value.trim(); save(K.settings, settings); };
  ["beep", "webhookOn", "webhook"].forEach(id => $("#" + id).addEventListener("change", saveSettings));
  $("#testBeep").onclick = () => { const b = settings.beep; settings.beep = true; beep(); settings.beep = b; };

  // ---------- ลูปหลัก (ทุกไลน์ในหนึ่งรอบ) ----------
  function stepLane(now) {
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
        // ขวดสองใบในพื้นที่ทริกเกอร์: ตรวจครั้งละหนึ่งการมาถึง (เตือนครั้งเดียวต่อการมาถึง)
        if (pst.phase !== "empty" && !pst.multi && trigObs.frac >= cfg.on) { const m = multiNow(); if (m && m.multi) { pst = { ...pst, multi: true }; noteMulti(m); } }
        if (r.event === "inspect") runInspect("auto");
        else if (r.event === "missed") { shift.missed++; laneShift(curLane.id).missed++; persistShift(); renderStats(); }
      }
    } else if (running && bg) { engine(laneTag(curLane) + "ขนาดภาพเปลี่ยนไปจากพื้นหลังว่างที่บันทึกไว้ กรุณาบันทึกพื้นหลังว่างใหม่", "warn"); running = false; $("#toggle").textContent = "เริ่มตรวจต่อเนื่อง"; $("#toggle").classList.remove("on"); }
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (source === "image") { use(selLane()); drawOverlay(); show(); return; }
    if (source === "sim") { simClock += simLastNow ? Math.max(0, Math.min(now - simLastNow, SIM_MAX_DT)) : 0; simLastNow = now; }
    for (const L of activeLanes()) { use(L); stepLane(now); }
    use(selLane());
    drawOverlay(); show(); healthStep(now);
    $("#fps").textContent = `${fpsT.length} fps · ${W}×${H}${nLanes() > 1 ? ` · ${nLanes()} ไลน์` : ""}`;
  }

  // ---------- สุขภาพภาพ + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----------
  const SITE = /** @type {any} */ (window).LQSite || null;
  const HL = SITE ? { mon: SITE.createHealth({ kind: "qc" }), at: 0, cv: document.createElement("canvas"), state: null } : null;
  function healthStep(now) {
    if (!HL || now - HL.at < 1000 || source === "image") return;
    HL.at = now;
    let st = null; try { st = SITE.sampleElement(disp, HL.cv); } catch { /* ignore */ }
    HL.state = HL.mon.push(st, { stalled: source === "camera" && nLanes() === 1 ? SITE.stallStep(domVideo, st, now) : false });
    if (SCQ) HL.state.codes.forEach(k => SCQ.health.add(k));
    const pill = $("#camHealth"), msg = $("#camHealthMsg");
    if (!pill) return;
    SITE.renderHealth(pill, HL.state); pill.hidden = false;
    SITE.renderHealthLine(msg, HL.state);
  }
  // ตรวจความแม่นยำ: ระหว่างตรวจ ทุกขวดที่ตรวจจะขึ้นในรายการให้ผู้ควบคุมกด "ขวดดี" หรือ "ขวดเสีย" ตามที่รู้จริง
  // (ภาพจำลอง: ใช้ข้อบกพร่องที่จำลองเป็นคำตอบ) แล้วคำนวณอัตราคัดทิ้งผิดและหลุดผ่าน พร้อมเสนอเกณฑ์ที่ปรับได้
  let SCQ = null, SCQ_LAST = null;
  const scqHist = SITE ? SITE.history("qc-sitecheck") : null;
  const scqPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
    title: "ตรวจความแม่นยำหน้างาน",
    intro: "ทดสอบกับขวดจริงบนสายการผลิตของคุณ: เตรียมขวดดีและขวดเสียที่รู้ข้อบกพร่อง ปล่อยผ่านกล้องตามปกติ แล้วติดป้ายว่าแต่ละขวดดีหรือเสีย ระบบคำนวณอัตราคัดทิ้งผิดและหลุดผ่านที่หน้างานนี้ และเสนอเกณฑ์ที่ควรปรับ",
    steps: [
      "สอบเทียบสูตรและบันทึกพื้นหลังว่างตามปกติก่อน",
      "เตรียมขวดดีอย่างน้อย 30 ขวด และขวดเสียที่รู้ข้อบกพร่องอย่างน้อย 10 ขวด (น้ำขาด/เกิน ไม่มีฝา ฝาผิดสี ฝาเอียง ฉลากเลื่อน/เอียง) ติดหมายเลขไว้ที่ก้นขวด",
      "กด \"เริ่มตรวจ\" แล้วปล่อยขวดผ่านทีละใบ (ตรวจต่อเนื่องหรือกด \"ตรวจเดี๋ยวนี้\") ตั้ง \"ป้ายของขวดถัดไป\" ไว้ล่วงหน้าได้ หรือกดแก้ในรายการทีหลัง",
      "กด \"จบและคำนวณ\" ถ้าระบบเสนอเกณฑ์ใหม่ ตรวจดูแล้วกด \"ใช้เกณฑ์ที่แนะนำ\" และตรวจซ้ำด้วยขวดชุดเดิม",
      "ทำซ้ำเมื่อเปลี่ยนไฟ ย้ายกล้อง หรือเปลี่ยนรุ่นขวด เก็บไฟล์ผลตรวจไว้เป็นหลักฐาน"
    ],
    body: `<div class="sc-q" hidden><div class="sc-row"><label><span>ป้ายของขวดถัดไป</span><select class="sc-next"><option value="">ไม่ระบุ (กดในรายการ)</option><option value="good">ขวดดี</option><option value="bad">ขวดเสีย</option></select></label></div><ul class="sc-list"></ul></div><div class="row-actions"><button class="btn ghost small sc-apply" type="button" hidden>ใช้เกณฑ์ที่แนะนำ</button></div>`
  }) : null;
  function scqObserve(r, L, how) {
    if (!SCQ) return;
    const sim = source === "sim" && r.sim ? (r.sim === "ok" ? "good" : "bad") : "";
    SCQ.rows.push({ t: r.t, lane: L.id, recipe: L.rec ? L.rec.id : "", how, pass: r.pass, reasons: r.reasons.slice(), v: SITE.qcValues(r), truth: sim || scqPanel.q(".sc-next").value || null, sim: !!sim, gain: r.photo ? r.photo.gain : null });
    scqRender();
  }
  function scqRender() {
    if (!SCQ) return;
    const R = SCQ.rows, ul = scqPanel.q(".sc-list");
    ul.innerHTML = R.slice().reverse().slice(0, 60).map((x, j) => {
      const i = R.length - 1 - j;
      return SITE.fmt("<li data-truth=\"{a}\"><span>ขวด {b}: <b>{c}</b>{d}</span>", { a: x.truth || "", b: i + 1, c: x.pass ? "ระบบให้ผ่าน" : "ระบบคัดทิ้ง", d: x.reasons.length ? ` <small>(${esc(x.reasons.map(k => QC.REASONS[k]).join(", "))})</small>` : "" })
        + SITE.fmt("<span><button type=\"button\" class=\"btn ghost\" data-i=\"{a}\" data-t=\"good\" aria-pressed=\"{b}\">ขวดดี</button><button type=\"button\" class=\"btn ghost\" data-i=\"{c}\" data-t=\"bad\" aria-pressed=\"{d}\">ขวดเสีย</button>{e}</span></li>", { a: i, b: x.truth === "good", c: i, d: x.truth === "bad", e: x.sim ? " <small>(จากภาพจำลอง)</small>" : "" });
    }).join("");
    const n = t => R.filter(x => x.truth === t).length;
    scqPanel.live.textContent = SITE.fmt("ตรวจแล้ว {a} ขวด · ติดป้ายขวดดี {b} · ขวดเสีย {c} · ยังไม่ระบุ {d}", { a: R.length, b: n("good"), c: n("bad"), d: R.length - n("good") - n("bad") });
  }
  function scqStart() {
    if (!SITE || SCQ) return;
    if (!rec.golden) return engine("ยังไม่มีขวดตัวอย่าง: สอบเทียบก่อนเริ่มตรวจความแม่นยำ", "warn");
    SCQ = { rows: [], startedAt: Date.now(), health: new Set(), source };
    scqPanel.q(".sc-q").hidden = false; scqPanel.start.disabled = true; scqPanel.stop.disabled = false; scqPanel.exp.hidden = true; scqPanel.q(".sc-apply").hidden = true;
    scqPanel.state.textContent = "กำลังตรวจ"; scqPanel.state.dataset.s = "live"; SITE.renderReport(scqPanel.report, null);
    scqRender();
  }
  function scqFinish() {
    if (!SCQ) return;
    const run = SCQ; SCQ = null;
    const counts = {}; run.rows.forEach(x => { counts[x.recipe] = (counts[x.recipe] || 0) + 1; });
    const rid = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0], R0 = recipes.find(x => x.id === rid);
    const rep = SITE.qcReport(run.rows, R0 ? R0.tol : {});
    if (Object.keys(counts).length > 1) rep.recs.push("ผลนี้รวมหลายสูตร เกณฑ์ที่แนะนำคิดจากสูตรที่ตรวจมากที่สุด — ตรวจแยกทีละสูตรจะแม่นกว่า");
    if (run.source === "sim") rep.recs.push("นี่คือผลกับภาพจำลอง ไม่ใช่ขวดจริง — ใช้ฝึกขั้นตอน แล้วตรวจซ้ำกับกล้องจริง");
    rep.recs.push(...[...run.health].map(c => "สภาพภาพระหว่างตรวจ: " + SITE.HEALTH_TH[c]).filter(Boolean));
    SITE.renderReport(scqPanel.report, rep);
    scqPanel.q(".sc-q").hidden = true; scqPanel.start.disabled = false; scqPanel.stop.disabled = true;
    scqPanel.state.textContent = SITE.verdictText(rep); scqPanel.state.dataset.s = rep.verdict;
    const sug = rep.tolSuggest.filter(x => x.separable);
    const ap = scqPanel.q(".sc-apply"); ap.hidden = !(sug.length && R0);
    ap.onclick = () => {
      if (!R0 || !confirm(SITE.fmt("ปรับเกณฑ์ของสูตร \"{a}\": {b} ?", { a: R0.name, b: sug.map(x => `${x.label} ${x.current} → ${x.suggest}`).join(", ") }))) return;
      sug.forEach(x => { R0.tol[x.tol] = x.suggest; });
      persistRecipes(); renderRecipe(); ap.hidden = true; engine("ปรับเกณฑ์ตามผลตรวจแล้ว — ตรวจซ้ำด้วยขวดชุดเดิมเพื่อยืนยัน", "ok");
    };
    const doc = SITE.exportDoc("qc", {
      startedAt: new Date(run.startedAt).toISOString(), source: run.source, recipe: R0 ? { name: R0.name, tol: { ...R0.tol }, photoNorm: R0.photoNorm !== false } : null,
      conditions: { health: [...run.health] }, rows: run.rows.map(x => ({ tSec: +((x.t - run.startedAt) / 1000).toFixed(1), lane: x.lane, trigger: x.how, pass: x.pass, reasons: x.reasons, truth: x.truth, values: x.v, lightGain: x.gain })),
      distinctItems: null, distinctItemsNote: "the same labelled bottle may pass the camera more than once",
      report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, falseReject: rep.falseReject, miss: rep.miss, tolSuggest: rep.tolSuggest, recs: rep.recs }
    });
    scqPanel.exp.hidden = false; scqPanel.exp.onclick = () => SITE.download(`lensiq-qc-check-${new Date(run.startedAt).toISOString().slice(0, 10)}.json`, doc);
    scqHist.add({ at: run.startedAt, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam: run.source === "sim" ? "ภาพจำลอง" : (nLanes() > 1 ? "หลายไลน์" : cam.label || "กล้อง QC"), summary: SITE.fmt("ขวดดี {a} (คัดทิ้งผิด {b}) · ขวดเสีย {c} (หลุด {d})", { a: rep.n.good, b: rep.n.falseReject, c: rep.n.bad, d: rep.n.missed }) });
    scqHist.render(scqPanel.hist);
    SCQ_LAST = { rep, doc };
  }
  if (scqPanel) {
    scqPanel.start.addEventListener("click", scqStart);
    scqPanel.stop.addEventListener("click", scqFinish);
    scqPanel.q(".sc-list").addEventListener("click", e => {
      const b = e.target.closest("[data-t]"); if (!b || !SCQ) return;
      const x = SCQ.rows[+b.dataset.i]; if (!x) return;
      x.truth = x.truth === b.dataset.t ? null : b.dataset.t; x.sim = false; scqRender();
    });
    scqHist.render(scqPanel.hist);
  }

  setInterval(() => { if (shift.total) renderStats(); }, 5000);
  window.addEventListener("beforeunload", () => save(K.shift, shift));
  // สำหรับการทดสอบอัตโนมัติ (อ่านอย่างเดียว ไม่มีภาพ)
  Object.defineProperties(window.__QC, Object.getOwnPropertyDescriptors({
    get shift() { return shift; }, get lanes() { stash(); return activeLanes().map(L => ({ id: L.id, rec: L.rec && L.rec.id, bg: !!L.bg, golden: !!(L.rec && L.rec.golden), cam: L.hubCam ? L.hubCam.slot : null, live: !!(L.hubCam && L.hubCam.active), pst: L.pst.phase })); },
    get running() { return running; }, get hub() { return hub; }, get sitecheck() { return SCQ; }, get sitecheckLast() { return SCQ_LAST; }, scFinish: () => scqFinish(), get idb() { return idbOk; }, setLanes, selectLane, pChart: QC.pChart
  }));

  // เริ่มต้น: ตรวจ IndexedDB -> ย้ายภาพเก่าออกจาก localStorage (เรียกซ้ำได้) -> โหลดพื้นหลังของทุกไลน์
  (async () => {
    idbOk = await IDB.ok();
    if (idbOk) {
      const moved = await QC.migrateBgs(recipes, (k, v) => IDB.put("bg", k, { url: v, w: 0, h: 0, t: Date.now() }));
      if (moved.length) save(K.recipes, recipes);
      const mt = await QC.migrateThumbs(shift.rejects, (k, v) => IDB.put("thumbs", k, v));
      if (mt.length) save(K.shift, shift);
    }
    for (const L of activeLanes()) loadBg(L);
    renderStats();
  })();
  if (assignRecipes()) persistRecipes();
  renderLaneTabs(); renderStats(); renderRecipe(); setSource("sim");
  requestAnimationFrame(tick);
})();

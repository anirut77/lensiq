/* lensiq-pc.js — LQPC: pure logic of LENSIQ Product Check, on-device step (design docs/PRODUCT-CHECK-DESIGN.md §3, P2).
 * Browser: window.LQPC · Node: module.exports (no DOM; unit-tested in tests/unit/pc-ondevice.test.js). It reuses LQMed
 * (lensiq-med.js) for the Thai drug-registration and food-number shapes so both tabs of medicine.html agree.
 *
 * WHAT IT IS: helpers that turn pixels / model outputs / text into FACTS the user can check: image-quality hints, text-box
 * post-processing, CTC decoding, a product crop, GS1 element strings and registration-number SHAPES per country.
 * WHAT IT IS NOT: no verdict. A number with the right shape is "has the right shape", never "registered" or "genuine";
 * the meaning of letters / digits inside a number is never asserted (unverified); expiry is shown as a printed fact.
 *
 * MODELS (paths + sizes, all Apache-2.0; see vendor/models/pc-ocr/README.txt)
 *   DET, SCRIPTS {th, cjk, ko, latin}, DEFAULT_SCRIPT = "th", scriptFor(langTag), downloadBytes(script)
 * QUALITY (ImageData-like {data RGBA, width, height}; heuristic thresholds Q, not measured on product photos)
 *   luma(img) · shrinkGray(g, w, h, maxSide) · laplacianVar(g, w, h) · tenengrad(g, w, h) · glare(img) · exposure(g)
 *   textSize(boxes) · assess(img, boxes?) -> {blur, glare, exposure, text, hints:[code]}
 * TEXT DETECTION (PP-OCRv5 DB head output: probability map)
 *   dbBoxes(prob, W, H, opt) -> [{x0, y0, x1, y1, score}] · scaleBoxes(boxes, sx, sy, W, H) · sortLines(boxes) -> [[box]]
 *   cropFromBoxes(boxes, W, H, {margin}) -> {x, y, w, h}|null    product crop = union of text boxes + margin
 * RECOGNITION
 *   parseDict(text) -> [symbol] · ctcDecode(data, T, C, dict) -> {text, conf, chars}   greedy CTC (blank 0, space last)
 * CODES
 *   gtinValid(d) · gs1Prefix(gtin) -> {code, issuer}|null · parseGS1(raw, {now}) -> {ok, symbology, fields, gtin, ...}
 *   localDate(date) -> the device's local YYYY-MM-DD · expiryStatus(iso, today) -> "past" | "today" | "future" | ""
 *   lastDay(y, m) · barcodeInfo(raw, format, {now}) -> {kind: "gs1"|"gtin"|"other", ...}
 *   findRegNumbers(text) -> [{country, kind, norm, check, ok, note}]  registration-number SHAPES (format check only)
 *   VERIFY[country] -> [{id, url}] official "how to verify" links (checked 2026-11-09)
 * FACE GATE (decision only; the detector runs in lensiq-pc-run.js)
 *   faceGate({loaded, runs:[{scope, faces:[{score}]}]}, {threshold}) -> {allow, reason, maxScore}   FAILS CLOSED
 * MEASUREMENT (tools/pc-ondevice-eval.mjs)
 *   levenshtein(a, b) · charAccuracy(ref, hyp) · nameTokens(s) · tokenHit(ocrText, {brands, product_name}) · wilson(k, n)
 */
(function (root, factory) {
  const med = typeof module !== "undefined" && module.exports ? require("./lensiq-med.js") : /** @type {any} */ (root).LQMed;
  const m = factory(med);
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQPC = m;
})(typeof self !== "undefined" ? self : this, function (LQMed) {
  "use strict";

  /* ---------------- models ---------------- */
  const DET = { model: "vendor/models/pc-ocr/ppocrv5_mobile_det.onnx", bytes: 4826518 };
  const SCRIPTS = {
    th: { model: "vendor/models/plate-ocr-th/th_ppocrv5_mobile_rec.onnx", dict: "vendor/models/plate-ocr-th/dict.txt", bytes: 7891015, langs: ["th", "en"] },
    cjk: { model: "vendor/models/pc-ocr/ppocrv5_mobile_rec.onnx", dict: "vendor/models/pc-ocr/ppocrv5_mobile_rec.dict.txt", bytes: 16534782, langs: ["zh-Hans", "zh-Hant", "ja", "en"] },
    ko: { model: "vendor/models/pc-ocr/korean_ppocrv5_mobile_rec.onnx", dict: "vendor/models/pc-ocr/korean_ppocrv5_mobile_rec.dict.txt", bytes: 13418787, langs: ["ko", "en"] },
    latin: { model: "vendor/models/pc-ocr/latin_ppocrv5_mobile_rec.onnx", dict: "vendor/models/pc-ocr/latin_ppocrv5_mobile_rec.dict.txt", bytes: 8042023, langs: ["en", "vi", "id", "ms",
      "fr", "de", "es", "it", "pt", "nl"] }
  };
  const DEFAULT_SCRIPT = "th";
  /** the user picks the script; this only suggests one from a language tag (never automatic in phase 1) */
  function scriptFor(tag) {
    const t = String(tag || "").toLowerCase();
    if (/^(zh|ja)/.test(t)) return "cjk";
    if (/^ko/.test(t)) return "ko";
    if (/^th/.test(t) || !t) return "th";
    return "latin";
  }
  const downloadBytes = s => DET.bytes + (SCRIPTS[s] ? SCRIPTS[s].bytes : 0);

  /* ---------------- image quality (heuristics) ---------------- */
  // Thresholds are starting points chosen on synthetic images (tests/unit/pc-ondevice.test.js), NOT measured on product
  // photos: the page shows them as hints ("may be blurry"), never as a pass / fail of the product.
  const Q = { side: 640, lap: 60, ten: 120, glareV: 250, glareS: 0.12, glareBlob: 0.006, dark: 45, darkClip: 0.35, brightClip: 0.25, textPx: 14 };
  function luma(img) {
    const d = img.data, n = img.width * img.height, g = new Uint8Array(n);
    for (let i = 0; i < n; i++) g[i] = (d[4 * i] * 77 + d[4 * i + 1] * 150 + d[4 * i + 2] * 29) >> 8;
    return g;
  }
  /** box-average downscale so the blur metrics do not depend on the photo resolution */
  function shrinkGray(g, w, h, maxSide = Q.side) {
    const k = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
    if (k === 1) return { g, w, h };
    const W = Math.floor(w / k), H = Math.floor(h / k), o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += g[(y * k + j) * w + x * k + i];
      o[y * W + x] = Math.round(s / (k * k));
    }
    return { g: o, w: W, h: H };
  }
  function laplacianVar(g, w, h) {
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, v = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s += v; s2 += v * v; n++;
    }
    if (!n) return 0;
    const m = s / n;
    return s2 / n - m * m;
  }
  /** mean squared Sobel gradient magnitude (Tenengrad) */
  function tenengrad(g, w, h) {
    let s = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1];
      const gy = g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1];
      s += (gx * gx + gy * gy) / 16; n++;
    }
    return n ? s / n : 0;
  }
  /** HSV near-white, low-saturation pixels; largest 4-connected blob as a share of the image (specular glare) */
  function glare(img, o = {}) {
    const vMin = o.vMin || Q.glareV, sMax = o.sMax == null ? Q.glareS : o.sMax;
    const w = img.width, h = img.height, d = img.data, n = w * h, mask = new Uint8Array(n);
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      const r = d[4 * i], gg = d[4 * i + 1], b = d[4 * i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx >= vMin && (mx ? (mx - mn) / mx : 0) <= sMax) { mask[i] = 1; cnt++; }
    }
    let best = 0, bestBox = null;
    const stack = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (mask[i] !== 1) continue;
      let sp = 0, size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i; mask[i] = 2;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        size++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] === 1) { mask[p - w] = 2; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] === 1) { mask[p + w] = 2; stack[sp++] = p + w; }
      }
      // a white label background is large AND fills its box; a glare spot is a compact blob — both count, the page only hints
      if (size > best) { best = size; bestBox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
    }
    return { frac: n ? cnt / n : 0, blob: n ? best / n : 0, box: bestBox };
  }
  function exposure(g) {
    let s = 0, dark = 0, bright = 0;
    for (let i = 0; i < g.length; i++) { const v = g[i]; s += v; if (v <= 5) dark++; else if (v >= 250) bright++; }
    const n = g.length || 1;
    return { mean: s / n, darkClip: dark / n, brightClip: bright / n };
  }
  /** median text-box height (px, in the photo's own pixels) */
  function textSize(boxes) {
    const hs = (boxes || []).map(b => b.y1 - b.y0).filter(v => v > 0).sort((a, b) => a - b);
    return { n: hs.length, median: hs.length ? hs[hs.length >> 1] : 0 };
  }
  /**
   * assess(img, boxes?) -> {blur:{lap, ten, flag}, glare:{frac, blob, flag}, exposure:{mean, darkClip, brightClip, flag},
   *   text:{n, median, flag}, hints:["blur"|"glare"|"dark"|"bright"|"small"|"notext"]}. Hints only; never blocks.
   */
  function assess(img, boxes) {
    const full = luma(img), s = shrinkGray(full, img.width, img.height);
    const lap = laplacianVar(s.g, s.w, s.h), ten = tenengrad(s.g, s.w, s.h);
    const gl = glare(img), ex = exposure(s.g), ts = textSize(boxes);
    const blurFlag = lap < Q.lap && ten < Q.ten;
    // glare: a compact bright blob (fills little of its box area relative to a label background) above the size floor
    const blobBoxFrac = gl.box ? (gl.box.w * gl.box.h) / (img.width * img.height) : 0;
    const glareFlag = gl.blob >= Q.glareBlob && blobBoxFrac < 0.5;
    const exFlag = ex.mean < Q.dark || ex.darkClip > Q.darkClip ? "dark" : ex.brightClip > Q.brightClip ? "bright" : "";
    const txtFlag = boxes ? (ts.n === 0 ? "notext" : ts.median < Q.textPx ? "small" : "") : "";
    const hints = [];
    if (blurFlag) hints.push("blur");
    if (glareFlag) hints.push("glare");
    if (exFlag) hints.push(exFlag);
    if (txtFlag) hints.push(txtFlag);
    return { blur: { lap, ten, flag: blurFlag }, glare: { ...gl, flag: glareFlag }, exposure: { ...ex, flag: exFlag }, text: { ...ts, flag: txtFlag }, hints };
  }

  /* ---------------- DB text-detection post-processing ---------------- */
  /**
   * dbBoxes(prob, W, H, {thresh=.3, boxThresh=.6, unclip=1.5, minSize=3, max=1000, minAngle=3}) — PaddleOCR DBPostProcess:
   * binarise the probability map, 8-connected components, score = mean probability over the component, drop small /
   * low-score ones, expand by the DB "unclip" distance d = area * ratio / perimeter. Coordinates are in map pixels.
   * A line-shaped component tilted by >= minAngle degrees (orientation from its second moments) also gets a rotated
   * rectangle {cx, cy, rw, rh, angle (radians)} — the reader crops along it, as PaddleOCR does with its min-area box;
   * x0..y1 are always the axis-aligned bounds.
   */
  function dbBoxes(prob, W, H, o = {}) {
    const thr = o.thresh == null ? 0.3 : o.thresh, bthr = o.boxThresh == null ? 0.6 : o.boxThresh;
    const ratio = o.unclip == null ? 1.5 : o.unclip, minSize = o.minSize == null ? 3 : o.minSize, max = o.max || 1000;
    const minAngle = ((o.minAngle == null ? 3 : o.minAngle) * Math.PI) / 180;
    const n = W * H, seen = new Uint8Array(n), stack = new Int32Array(n), comp = new Int32Array(n), out = [];
    for (let i = 0; i < n; i++) {
      if (seen[i] || !(prob[i] > thr)) continue;
      let sp = 0, cnt = 0, sum = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const p = stack[--sp], x = p % W, y = (p - x) / W;
        comp[cnt++] = p; sum += prob[p]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if ((dx || dy) && xx >= 0 && yy >= 0 && xx < W && yy < H) { const q = yy * W + xx; if (!seen[q] && prob[q] > thr) { seen[q] = 1; stack[sp++] = q; } }
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (Math.min(w, h) < minSize) continue;
      const score = sum / cnt;
      if (score < bthr) continue;
      const d = (w * h * ratio) / (2 * (w + h));
      const b = { x0: Math.max(0, x0 - d), y0: Math.max(0, y0 - d), x1: Math.min(W, x1 + 1 + d), y1: Math.min(H, y1 + 1 + d), score: Math.round(score * 1000) / 1000 };
      if (Math.min(b.x1 - b.x0, b.y1 - b.y0) < minSize + 2) continue;
      // orientation of the component (major axis); only for clearly tilted, line-shaped components
      const mx = sx / cnt, my = sy / cnt, cxx = sxx / cnt - mx * mx, cyy = syy / cnt - my * my, cxy = sxy / cnt - mx * my;
      const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      if (Math.abs(ang) >= minAngle && Math.abs(ang) <= Math.PI / 4) {
        const c = Math.cos(ang), s2 = Math.sin(ang);
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
        for (let k = 0; k < cnt; k++) {
          const p = comp[k], x = p % W - mx, y = (p - (p % W)) / W - my, u = x * c + y * s2, v = -x * s2 + y * c;
          if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
        }
        const rw = u1 - u0 + 1, rh = v1 - v0 + 1;
        if (rw >= 1.5 * rh) {
          const dd = (rw * rh * ratio) / (2 * (rw + rh)), uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
          Object.assign(b, { cx: mx + uc * c - vc * s2 + 0.5, cy: my + uc * s2 + vc * c + 0.5, rw: rw + 2 * dd, rh: rh + 2 * dd, angle: ang });
        }
      }
      out.push(b);
      if (out.length >= max) break;
    }
    return out;
  }
  /** map boxes from the model input size back to the photo (sx = photoW / mapW …), clamped and rounded */
  function scaleBoxes(boxes, sx, sy, W, H) {
    return boxes.map(b => {
      const r = { ...b, x0: Math.max(0, Math.floor(b.x0 * sx)), y0: Math.max(0, Math.floor(b.y0 * sy)), x1: Math.min(W, Math.ceil(b.x1 * sx)), y1: Math.min(H, Math.ceil(b.y1 * sy)) };
      if (b.angle != null) {
        const c = Math.cos(b.angle), s = Math.sin(b.angle);
        Object.assign(r, { cx: b.cx * sx, cy: b.cy * sy, rw: b.rw * Math.hypot(sx * c, sy * s), rh: b.rh * Math.hypot(sx * s, sy * c), angle: Math.atan2(sy * s, sx * c) });
      }
      return r;
    });
  }
  /** vertical extent used for reading order: the rotated box's own height when it has one */
  const span = b => (b.angle != null ? [b.cy - b.rh / 2, b.cy + b.rh / 2] : [b.y0, b.y1]);
  /** reading order: rows by vertical overlap (>= half the smaller height), each row left to right; rows top to bottom */
  function sortLines(boxes) {
    const bs = boxes.slice().sort((a, b) => { const A = span(a), B = span(b); return (A[0] + A[1]) - (B[0] + B[1]); }), lines = [];
    for (const b of bs) {
      const [t, u] = span(b), h = u - t;
      let line = null;
      for (const L of lines) {
        const ov = Math.min(L.y1, u) - Math.max(L.y0, t);
        if (ov >= 0.5 * Math.min(h, L.y1 - L.y0)) { line = L; break; }
      }
      if (line) { line.items.push(b); line.y0 = Math.min(line.y0, t); line.y1 = Math.max(line.y1, u); }
      else lines.push({ y0: t, y1: u, items: [b] });
    }
    lines.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    return lines.map(L => L.items.sort((a, b) => a.x0 - b.x0));
  }
  /** product crop: union of the text boxes + margin (share of the union's long side, at least 8 px), clamped; the user can move it */
  function cropFromBoxes(boxes, W, H, o = {}) {
    const bs = (boxes || []).filter(b => b.x1 > b.x0 && b.y1 > b.y0);
    if (!bs.length) return null;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const b of bs) { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    const m = Math.max(8, (o.margin == null ? 0.06 : o.margin) * Math.max(x1 - x0, y1 - y0));
    const X0 = Math.max(0, Math.floor(x0 - m)), Y0 = Math.max(0, Math.floor(y0 - m)), X1 = Math.min(W, Math.ceil(x1 + m)), Y1 = Math.min(H, Math.ceil(y1 + m));
    return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
  }

  /* ---------------- CTC ---------------- */
  /** dict.txt -> symbols (one per line; a trailing empty line is not a symbol; a line holding one space is) */
  function parseDict(text) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }
  /** greedy CTC over T x C scores (probabilities or logits): class 0 = blank, 1..n = dict, n+1 = space; repeats collapse */
  function ctcDecode(data, T, C, dict) {
    let prev = -1, text = "", sum = 0, n = 0;
    const chars = [];
    for (let t = 0; t < T; t++) {
      let bi = 0, bv = -Infinity;
      for (let c = 0; c < C; c++) { const v = data[t * C + c]; if (v > bv) { bv = v; bi = c; } }
      let p = bv;
      if (!(bv >= 0 && bv <= 1)) { let se = 0; for (let c = 0; c < C; c++) se += Math.exp(data[t * C + c] - bv); p = 1 / se; }
      if (bi !== 0 && bi !== prev) {
        const ch = bi <= dict.length ? dict[bi - 1] : " ";
        text += ch; chars.push({ c: ch, p: Math.round(p * 1000) / 1000, t }); sum += p; n++;
      }
      prev = bi;
    }
    return { text, conf: n ? Math.round((sum / n) * 1000) / 1000 : 0, chars };
  }

  /* ---------------- GTIN / GS1 ---------------- */
  function gtinValid(d) {
    const s = String(d || "");
    if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < s.length - 1; i++) sum += Number(s[s.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(s[s.length - 1]);
  }
  // GS1 company-prefix ranges -> the GS1 member organisation that ISSUED the number. It is NOT the country of origin.
  const GS1_RANGES = [[0, 19, "US/CA"], [30, 37, "FR"], [40, 44, "DE"], [45, 45, "JP"], [49, 49, "JP"], [50, 50, "GB"], [380, 380, "BG"], [400, 440, "DE"],
    [450, 459, "JP"], [460, 469, "RU"], [471, 471, "TW"], [480, 480, "PH"], [489, 489, "HK"], [490, 499, "JP"], [500, 509, "GB"], [690, 699, "CN"],
    [754, 755, "CA"], [760, 769, "CH"], [800, 839, "IT"], [840, 849, "ES"], [870, 879, "NL"], [880, 881, "KR"], [884, 884, "KH"], [885, 885, "TH"],
    [888, 888, "SG"], [893, 893, "VN"], [899, 899, "ID"], [930, 939, "AU"], [940, 949, "NZ"], [955, 955, "MY"], [958, 958, "MO"]];
  function gs1Prefix(gtin) {
    let d = String(gtin || "");
    if (d.length === 14) d = d.slice(1);
    if (d.length === 12) d = "0" + d;
    if (d.length !== 13) return null;
    const p3 = Number(d.slice(0, 3));
    for (const r of GS1_RANGES) {
      const a = Number(r[0]), b = Number(r[1]), c = String(r[2]);
      const lo = a < 100 ? a * 10 : a, hi = b < 100 ? b * 10 + 9 : b;
      if (p3 >= lo && p3 <= hi) return { code: d.slice(0, 3), issuer: c };
    }
    return { code: d.slice(0, 3), issuer: "" };
  }
  // AI -> [fixed length | -max length, label]. Variable fields end at FNC1 (GS, \x1d) or at the end of the string.
  const AI = {
    "00": [18, "sscc"], "01": [14, "gtin"], "02": [14, "content"], "10": [-20, "lot"], "11": [6, "prodDate"], "12": [6, "dueDate"], "13": [6, "packDate"],
    "15": [6, "bestBefore"], "16": [6, "sellBy"], "17": [6, "expiry"], "20": [2, "variant"], "21": [-20, "serial"], "22": [-20, "cpv"], "30": [-8, "count"],
    "37": [-8, "count"], "240": [-30, "addId"], "241": [-30, "custPart"], "400": [-30, "order"], "410": [13, "shipTo"], "414": [13, "gln"], "422": [3, "origin"],
    "7003": [10, "expiryTime"], "710": [-20, "nhrn"], "711": [-20, "nhrn"], "712": [-20, "nhrn"], "713": [-20, "nhrn"], "714": [-20, "nhrn"], "715": [-20, "nhrn"]
  };
  for (let i = 90; i <= 99; i++) AI[String(i)] = [-90, "internal"];
  for (let a = 310; a <= 369; a++) for (let k = 0; k <= 9; k++) AI[String(a) + k] = [6, "measure"];
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  /** GS1 General Specifications 7.12: the century is chosen so the date is within -49 / +50 years of `now` */
  function gs1Date(v, now) {
    if (!/^\d{6}$/.test(v)) return null;
    const yy = +v.slice(0, 2), mm = +v.slice(2, 4), dd = +v.slice(4, 6);
    if (mm < 1 || mm > 12) return null;
    const cy = (now || new Date()).getUTCFullYear(), c = Math.floor(cy / 100), diff = yy - (cy % 100);
    const year = (diff >= 51 ? c - 1 : diff <= -50 ? c + 1 : c) * 100 + yy;
    const day = dd === 0 ? lastDay(year, mm) : dd;
    if (day > lastDay(year, mm)) return null;
    return { raw: v, year, month: mm, day, dayAssumed: dd === 0, iso: `${year}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
  }
  const GS = "\u001d";
  /**
   * parseGS1(raw, {now}) — GS1 element string from a DataMatrix / GS1-128 / QR scan, or its printed "(01)…(17)…" form.
   * Accepts a symbology identifier (]d2 ]C1 ]Q3 ]e0), FNC1 as GS (\x1d) or the text "<GS>". Returns
   * {ok, symbology, fields:[{ai, key, value}], gtin, gtinValid, expiry, lot, serial, errors:[code]}; unknown AIs stop the parse.
   */
  function parseGS1(raw, o = {}) {
    let s = String(raw == null ? "" : raw).replace(/<GS>|\{GS\}|\\x1d/gi, GS).trim();
    const res = { ok: false, symbology: "", fields: [], gtin: "", gtinValid: false, expiry: null, lot: "", serial: "", errors: [] };
    const sym = /^\][A-Za-z]\d/.exec(s);
    if (sym) { res.symbology = sym[0]; s = s.slice(3); }
    if (s.startsWith(GS)) s = s.slice(1);
    const add = (ai, value) => {
      const key = (AI[ai] || [0, "unknown"])[1];
      res.fields.push({ ai, key, value });
      if (ai === "01") { res.gtin = value; res.gtinValid = gtinValid(value); if (!res.gtinValid) res.errors.push("gtin-check"); }
      else if (ai === "17") { res.expiry = gs1Date(value, o.now); if (!res.expiry) res.errors.push("bad-date"); }
      else if (ai === "10") res.lot = value;
      else if (ai === "21") res.serial = value;
    };
    if (s.startsWith("(")) { // printed / human-readable form
      const re = /\((\d{2,4})\)([^(]*)/g;
      let m, n = 0;
      while ((m = re.exec(s))) { n++; if (!AI[m[1]]) { res.errors.push("unknown-ai"); break; } add(m[1], m[2].trim()); }
      res.ok = n > 0 && !res.errors.includes("unknown-ai");
      return res;
    }
    let i = 0;
    while (i < s.length) {
      if (s[i] === GS) { i++; continue; }
      let ai = "";
      for (const L of [2, 3, 4]) { const c = s.slice(i, i + L); if (AI[c] && /^\d+$/.test(c)) { ai = c; break; } }
      if (!ai) { res.errors.push("unknown-ai"); break; }
      const [len] = AI[ai];
      i += ai.length;
      let v;
      if (len > 0) { v = s.slice(i, i + len); if (v.length !== len || !/^\d+$/.test(v)) { res.errors.push("short-field"); break; } i += len; }
      else { let j = s.indexOf(GS, i); if (j < 0) j = s.length; v = s.slice(i, Math.min(j, i - len)); i += v.length; }
      add(ai, v);
    }
    res.ok = res.fields.length > 0 && !res.errors.some(e => e === "unknown-ai" || e === "short-field");
    return res;
  }
  /** barcodeInfo(raw, format) -> GS1 element string, or a plain EAN / UPC / GTIN with its check digit, or "other" (QR text…) */
  function barcodeInfo(raw, format, o = {}) {
    const s = String(raw == null ? "" : raw), f = String(format || "").toLowerCase();
    const looksGs1 = /^\][dCQe]\d/.test(s) || s.includes(GS) || /^\(01\)\d{14}/.test(s) || ((f === "data_matrix" || f === "datamatrix") && /^01\d{14}/.test(s));
    if (looksGs1) { const g = parseGS1(s, o); if (g.ok) return { kind: "gs1", raw: s, format: f, ...g, prefix: gs1Prefix(g.gtin) }; }
    const d = s.replace(/\s/g, "");
    if (/^(\d{8}|\d{12,14})$/.test(d)) return { kind: "gtin", raw: s, format: f, gtin: d, gtinValid: gtinValid(d), prefix: gs1Prefix(d) };
    return { kind: "other", raw: s.slice(0, 300), format: f };
  }

  /** the device's LOCAL calendar date as YYYY-MM-DD (a Thai user at 03:00 is already on the next day; UTC is not) */
  function localDate(d) {
    const t = d || new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  /** printed expiry (YYYY-MM-DD) vs today's local date: "past" (the day after the date or later) | "today" | "future" | "" */
  function expiryStatus(iso, today) {
    const D = /^\d{4}-\d{2}-\d{2}$/;
    if (!D.test(String(iso || "")) || !D.test(String(today || ""))) return "";
    return iso < today ? "past" : iso === today ? "today" : "future";
  }

  /* ---------------- registration-number shapes ---------------- */
  // Format checks only. "ok" = the text has the documented shape; nothing here says a number is registered, valid or
  // genuine. Sources: design §3.2, docs/product-check/PHOTO-SET-PROTOCOL.md validator, LQMed (Thai drug / food).
  const norm = s => String(s == null ? "" : s).normalize("NFKC").replace(/[๐-๙]/g, c => String("๐๑๒๓๔๕๖๗๘๙".indexOf(c))).replace(/[‐-―−]/g, "-");
  const PATTERNS = [
    // Thailand: cosmetic notification 13 digits XX-X-XXXXXXXXXX (current) / 10 digits XX-X-XXXXXXX (older shape, unverified)
    { country: "TH", kind: "cosmetic", re: /(?<![\d-])(\d{2})-(\d)-(\d{10})(?![\d-])/g, fmt: m => `${m[1]}-${m[2]}-${m[3]}` },
    { country: "TH", kind: "cosmetic", re: /(?<![\d-])(\d{2})-(\d)-(\d{7})(?![\d-])/g, fmt: m => `${m[1]}-${m[2]}-${m[3]}`, note: "older" },
    // Thailand: medical device (structure unverified, design §3.2)
    { country: "TH", kind: "device", re: /(?<![\d-])(\d{2})-(\d)-(\d)-(\d)-(\d{7})(?![\d-])/g, fmt: m => m.slice(1, 6).join("-"), note: "unverified" },
    // Thailand: advert permits ฆท. (drug) ฆอ. (food) ฆพ. ฆสมพ. (herbal) — seen on product pages [SECONDARY]
    { country: "TH", kind: "advert", re: /(ฆท|ฆอ|ฆพ|ฆสมพ)\s*\.?\s*([A-Z]{0,2})\s*(\d{1,5})\s*\/\s*(\d{2,4})([A-Z]?)(?![\d])/g, fmt: m => `${m[1]}. ${m[2]}${m[3]}/${m[4]}${m[5]}` },
    // Malaysia: MAL + 8 digits + category letters; notified cosmetics NOT + digits + K (format only, no machine lookup)
    { country: "MY", kind: "mal", re: /\bMAL\s?(\d{8})\s?([A-Z]{0,3})\b/g, fmt: m => `MAL${m[1]}${m[2]}` },
    { country: "MY", kind: "not", re: /\bNOT\s?(\d{6,9})\s?K\b/g, fmt: m => `NOT${m[1]}K` },
    // Singapore: therapeutic product licence SIN + 5 digits + P
    { country: "SG", kind: "sin", re: /\bSIN\s?(\d{5})\s?P\b/g, fmt: m => `SIN${m[1]}P` },
    // Canada: DIN / NPN are 8 digits, only read when the label word is printed next to them
    { country: "CA", kind: "din", re: /\bDIN(?:-HM)?\s*[:#]?\s*(\d{8})(?!\d)/g, fmt: m => m[1] },
    { country: "CA", kind: "npn", re: /\bNPN\s*[:#]?\s*(\d{8})(?!\d)/g, fmt: m => m[1] },
    // USA: NDC 4-4-2 / 5-3-2 / 5-4-1 (with or without the word), or "NDC" + 10 / 11 digits
    { country: "US", kind: "ndc", re: /\bNDC\s*[:#]?\s*(\d{10,11})(?!\d)/g, fmt: m => m[1] },
    { country: "US", kind: "ndc", re: /(?<![\d-])(\d{4}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{5}-\d{4}-\d)(?![\d-])/g, fmt: m => m[1] },
    // China (NMPA approval numbers), EU centralised marketing authorisation, Australia ARTG
    { country: "CN", kind: "cn-drug", re: /国药准字\s*([HZSJBTF])\s*(\d{8})/g, fmt: m => `国药准字${m[1]}${m[2]}` },
    { country: "CN", kind: "cn-health", re: /国食健(注|字)?\s*([GJ])\s*(\d{8})/g, fmt: m => `国食健${m[1] || ""}${m[2]}${m[3]}` },
    { country: "CN", kind: "cn-cosmetic", re: /国妆特字\s*(G?)\s*(\d{8})/g, fmt: m => `国妆特字${m[1]}${m[2]}` },
    { country: "EU", kind: "eu", re: /\bEU\/(\d)\/(\d{2})\/(\d{3,4})\/(\d{3})\b/g, fmt: m => `EU/${m[1]}/${m[2]}/${m[3]}/${m[4]}` },
    { country: "AU", kind: "aust", re: /\bAUST\s?([LR])\s?(\d{4,6})\b/g, fmt: m => `AUST ${m[1]} ${m[2]}` }
  ];
  /**
   * findRegNumbers(text) -> [{country, kind, raw, norm, check:"format"|"checksum", ok, note}] in the order found. Thai drug /
   * herbal (LQMed.findThaiReg) and food (LQMed.parseFoodNo: dashed XX-X-XXXXX-X-XXXX) first; plain 13 digits are left to
   * the barcode reader (they collide with EAN-13). "note" is a key the page turns into words ("older", "unverified",
   * "uncertain" = no leading digit, may be a lot / date code).
   */
  function findRegNumbers(text) {
    const t = norm(text), up = t.toUpperCase(), out = [], seen = new Set();
    const push = r => { const k = r.country + r.kind + r.norm; if (!seen.has(k)) { seen.add(k); out.push(r); } };
    if (LQMed) {
      for (const r of LQMed.findThaiReg(t)) push({ country: "TH", kind: /^[GK]$/.test(r.letter) ? "herbal-or-drug" : "drug", raw: r.norm, norm: r.norm, check: "format", ok: true,
        note: r.uncertain ? "uncertain" : "", yearBE: r.yearBE });
      const f = LQMed.parseFoodNo(t);
      if (f.ok && f.dashed) push({ country: "TH", kind: "food", raw: f.norm, norm: f.norm, check: "format", ok: true, note: "" });
    }
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      const src = p.country === "TH" || p.country === "CN" ? t : up;
      while ((m = p.re.exec(src))) push({ country: p.country, kind: p.kind, raw: m[0].trim(), norm: p.fmt(m), check: "format", ok: true, note: p.note || "" });
    }
    return out;
  }
  // official places where the USER can check (links only; nothing is fetched). Checked 2026-11-09 (HTTP 200, except
  // NMPA / GS1 which answer bots with 412 / 403 and TGA which timed out from the test machine; all three are the agencies' own sites).
  const VERIFY = {
    TH: [{ id: "oryor", url: "https://oryor.com/" }, { id: "thfda", url: "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/MAIN/SEARCH_CENTER_MAIN.aspx" }],
    MY: [{ id: "npra", url: "https://quest3plus.bpfk.gov.my/pmo2/index.php" }],
    SG: [{ id: "hsa", url: "https://www.hsa.gov.sg/" }],
    CA: [{ id: "dpd", url: "https://health-products.canada.ca/dpd-bdpp/" }, { id: "lnhpd", url: "https://health-products.canada.ca/lnhpd-bdpsnh/" }],
    US: [{ id: "ndc", url: "https://www.accessdata.fda.gov/scripts/cder/ndc/" }, { id: "dailymed", url: "https://dailymed.nlm.nih.gov/dailymed/" }],
    CN: [{ id: "nmpa", url: "https://www.nmpa.gov.cn/" }],
    EU: [{ id: "ema", url: "https://www.ema.europa.eu/en/medicines" }],
    AU: [{ id: "tga", url: "https://www.tga.gov.au/" }],
    JP: [{ id: "pmda", url: "https://www.pmda.go.jp/" }],
    KR: [{ id: "mfds", url: "https://nedrug.mfds.go.kr/" }],
    GS1: [{ id: "gs1", url: "https://www.gs1.org/services/verified-by-gs1" }],
    WHO: [{ id: "who", url: "https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts" }]
  };

  /* ---------------- face gate (decision) ---------------- */
  /**
   * faceGate(state, {threshold=0.3, need=["frame","crop"]}) — the upload gate used before any image leaves the device (P7).
   * FAILS CLOSED: allow is true only when the detector loaded, every required scope ran, and no face scored >= threshold.
   * A detection whose score is not a finite number (missing, null, NaN, a string) counts as a face with score 1.
   * reason: "model-missing" | "not-run" | "face" | "error" | "" (allowed).
   * Each face may carry box {x, y, w, h} in the frame's pixels (lensiq-pc-run.js), so a later faceBlur(canvas, faces) can
   * use the same runs without changing this shape.
   */
  const faceScore = f => (f && typeof f.score === "number" && Number.isFinite(f.score) ? f.score : 1);
  function faceGate(st, o = {}) {
    const thr = o.threshold == null ? 0.3 : o.threshold, need = o.need || ["frame", "crop"];
    if (!st || !st.loaded) return { allow: false, reason: "model-missing", maxScore: 0 };
    if (st.error) return { allow: false, reason: "error", maxScore: 0 };
    const runs = Array.isArray(st.runs) ? st.runs : [];
    let max = 0;
    for (const r of runs) for (const f of (r && r.faces) || []) max = Math.max(max, faceScore(f));
    if (max >= thr) return { allow: false, reason: "face", maxScore: max };
    if (!need.every(s => runs.some(r => r && r.scope === s && Array.isArray(r.faces)))) return { allow: false, reason: "not-run", maxScore: max };
    return { allow: true, reason: "", maxScore: max };
  }

  /* ---------------- measurement helpers ---------------- */
  function levenshtein(a, b) {
    const A = [...a], B = [...b], m = A.length, n = B.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  // NFKC (full-width / compatibility forms), then re-compose Thai SARA AM (NFKC splits it into NIKHAHIT + SARA AA)
  const nfkc = s => String(s == null ? "" : s).normalize("NFKC").replace(/\u0e4d\u0e32/g, "\u0e33");
  const squash = s => nfkc(s).toLowerCase().replace(/\s+/g, "");
  /** character accuracy = max(0, 1 - edit distance / reference length), whitespace ignored, NFKC + lower case */
  function charAccuracy(ref, hyp) {
    const r = squash(ref), h = squash(hyp);
    if (![...r].length) return h ? 0 : 1;
    return Math.max(0, 1 - levenshtein(r, h) / [...r].length);
  }
  /** tokens of a brand / product name: Latin or digit runs of >= 3, Thai / Hangul / kana / Han runs of >= 2 (NFKC, lower case) */
  function nameTokens(s) {
    const t = nfkc(s).toLowerCase();
    const out = new Set();
    for (const m of t.matchAll(/[a-z0-9À-ɏ]{3,}|[฀-๿]{2,}|[가-힯]{2,}|[぀-ヿ㐀-鿿]{2,}/g)) out.add(m[0]);
    return [...out];
  }
  /**
   * tokenHit(ocrText, {brands, product_name}) -> {hit, tokens, found}: hit = at least one token of the brand(s) or the product
   * name appears (substring, whitespace removed, NFKC lower case) in the OCR text. tokens = 0 -> hit null (not scorable).
   */
  function tokenHit(ocr, gt) {
    const hay = squash(ocr);
    const tokens = [...new Set([...String((gt && gt.brands) || "").split(",").flatMap(nameTokens), ...nameTokens(gt && gt.product_name)])];
    if (!tokens.length) return { hit: null, tokens, found: [] };
    const found = tokens.filter(k => hay.includes(k));
    return { hit: found.length > 0, tokens, found };
  }
  /** Wilson score interval (95 % by default) for k successes in n */
  function wilson(k, n, z = 1.96) {
    if (!n) return { p: 0, lo: 0, hi: 0 };
    const p = k / n, z2 = z * z, den = 1 + z2 / n, c = (p + z2 / (2 * n)) / den, h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
    return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }

  return {
    DET, SCRIPTS, DEFAULT_SCRIPT, scriptFor, downloadBytes, Q,
    luma, shrinkGray, laplacianVar, tenengrad, glare, exposure, textSize, assess,
    dbBoxes, scaleBoxes, sortLines, cropFromBoxes, parseDict, ctcDecode,
    gtinValid, gs1Prefix, parseGS1, lastDay, gs1Date, localDate, expiryStatus, barcodeInfo, findRegNumbers, VERIFY,
    faceGate, levenshtein, charAccuracy, nameTokens, tokenHit, wilson
  };
});

"use strict";
// tests/unit/palm-v2-kit.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19). Shared helpers of the
// palm-v2 unit tests: a recording 2D context (every stroke with its dash, alpha, colour and transformed path points; every
// text drawn), a seeded random, geometry helpers and the test-owned hard-limit word lists (TH / EN / ZH).
// Contract under test (palm-v2.js, browser global PalmV2): see docs/acceptance/palm.md "Contract".

/** xorshift32 */
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** a CanvasRenderingContext2D stand-in that records what is drawn (affine transforms applied to every point) */
function recordingCtx(w = 1000, h = 1200) {
  const strokes = [], texts = [], fills = [];
  let path = [], sub = null, dash = [];
  let M = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const tp = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const ctx = {
    canvas: { width: w, height: h, dataset: {} },
    strokeStyle: "#000", fillStyle: "#000", lineWidth: 1, globalAlpha: 1, font: "10px sans-serif", textAlign: "left", textBaseline: "alphabetic",
    lineCap: "butt", lineJoin: "miter", shadowColor: "transparent", shadowBlur: 0, lineDashOffset: 0, globalCompositeOperation: "source-over",
    save() { stack.push({ M: M.slice(), dash: dash.slice(), s: [this.strokeStyle, this.fillStyle, this.lineWidth, this.globalAlpha, this.font, this.textAlign, this.textBaseline,
      this.lineCap, this.lineJoin, this.shadowColor, this.shadowBlur] }); },
    restore() { const t = stack.pop(); if (!t) return; M = t.M; dash = t.dash; [this.strokeStyle, this.fillStyle, this.lineWidth, this.globalAlpha, this.font, this.textAlign,
      this.textBaseline, this.lineCap, this.lineJoin, this.shadowColor, this.shadowBlur] = t.s; },
    setTransform(a, b, c, d, e, f) { if (typeof a === "object" && a) M = [a.a, a.b, a.c, a.d, a.e, a.f]; else M = [a, b, c, d, e, f]; },
    resetTransform() { M = [1, 0, 0, 1, 0, 0]; },
    getTransform() { return { a: M[0], b: M[1], c: M[2], d: M[3], e: M[4], f: M[5] }; },
    translate(x, y) { M = [M[0], M[1], M[2], M[3], M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; },
    scale(x, y) { M = [M[0] * x, M[1] * x, M[2] * y, M[3] * y, M[4], M[5]]; },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); M = [M[0] * c + M[2] * s, M[1] * c + M[3] * s, -M[0] * s + M[2] * c, -M[1] * s + M[3] * c, M[4], M[5]]; },
    beginPath() { path = []; sub = null; },
    moveTo(x, y) { sub = [tp(x, y)]; path.push(sub); },
    lineTo(x, y) { if (!sub) { sub = []; path.push(sub); } sub.push(tp(x, y)); },
    quadraticCurveTo(cx, cy, x, y) { const a = sub && sub.length ? sub[sub.length - 1] : tp(cx, cy), c = tp(cx, cy), b = tp(x, y); if (!sub) { sub = [a]; path.push(sub); }
      for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; sub.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { const a = sub && sub.length ? sub[sub.length - 1] : tp(c1x, c1y), c1 = tp(c1x, c1y), c2 = tp(c2x, c2y), b = tp(x, y); if (!sub) { sub = [a];
      path.push(sub); }
      for (let i = 1; i <= 10; i++) { const t = i / 10, u = 1 - t; sub.push([0, 1].map(k => u * u * u * a[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * b[k])); } },
    arc(x, y, r, a0, a1) { const pts = []; for (let i = 0; i <= 12; i++) { const a = a0 + (a1 - a0) * i / 12; pts.push(tp(x + r * Math.cos(a), y + r * Math.sin(a))); } sub = pts;
      path.push(sub); sub.arc = true; },
    ellipse(x, y, rx, ry) { this.arc(x, y, Math.max(rx, ry), 0, 2 * Math.PI); },
    rect(x, y, w2, h2) { sub = [tp(x, y), tp(x + w2, y), tp(x + w2, y + h2), tp(x, y + h2), tp(x, y)]; path.push(sub); sub.rect = true; },
    roundRect(x, y, w2, h2) { this.rect(x, y, w2, h2); },
    closePath() { if (sub && sub.length) sub.push(sub[0]); },
    setLineDash(d) { dash = Array.isArray(d) ? d.slice() : []; },
    getLineDash() { return dash.slice(); },
    stroke() { strokes.push({ dash: dash.filter(v => v > 0), alpha: this.globalAlpha, style: String(this.strokeStyle), width: this.lineWidth, subs: path.map(s => s.slice()),
      arcs: path.some(s => s.arc), rect: path.some(s => s.rect), canvas: this.canvas.dataset.pv2Target || "" }); },
    fill() { fills.push({ alpha: this.globalAlpha, style: String(this.fillStyle), subs: path.map(s => s.slice()) }); },
    fillText(t, x, y) { texts.push({ text: String(t), at: tp(x, y), alpha: this.globalAlpha, style: String(this.fillStyle) }); },
    strokeText(t, x, y) { texts.push({ text: String(t), at: tp(x, y), alpha: this.globalAlpha, stroke: true }); },
    measureText(t) { const n = String(t).length * 7; return { width: n, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; },
    fillRect(x, y, w2, h2) { fills.push({ rect: [x, y, w2, h2], style: String(this.fillStyle), alpha: this.globalAlpha }); },
    strokeRect() {}, clearRect() {}, drawImage() {}, clip() {}, putImageData() {}, getImageData(x, y, w2, h2) { return { data: new Uint8ClampedArray(w2 * h2 * 4), width: w2, height: h2 }; },
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, createPattern() { return null; },
  };
  return { ctx, strokes, texts, fills };
}

/** distance from p to polyline P */
function polyDist(p, P) {
  let best = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  if (P.length === 1) best = Math.hypot(p[0] - P[0][0], p[1] - P[0][1]);
  return best;
}
const polyLen = P => P.reduce((s, p, i) => i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0, 0);
/** Catmull-Rom through control points (dense), the usual way a 5-7 point line is drawn */
function catmull(cp, n = 60) {
  if (cp.length < 3) { const out = []; for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push([cp[0][0] + (cp[cp.length - 1][0] - cp[0][0]) * t,
    cp[0][1] + (cp[cp.length - 1][1] - cp[0][1]) * t]); } return out; }
  const out = [], m = cp.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * (m - 1), k = Math.min(m - 2, Math.floor(t)), f = t - k;
    const p0 = cp[Math.max(0, k - 1)], p1 = cp[k], p2 = cp[k + 1], p3 = cp[Math.min(m - 1, k + 2)];
    out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * f + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * f * f + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * f * f * f)));
  }
  return out;
}
/** the strokes that trace polyline P (>= 80 % of their points within tol px of P, and covering >= 40 % of its length) */
function strokesOn(strokes, P, tol) {
  const L = polyLen(P);
  return strokes.filter(s => {
    const pts = s.subs.flat();
    if (pts.length < 2) return false;
    const near = pts.filter(p => polyDist(p, P) <= tol).length / pts.length;
    if (near < 0.8) return false;
    const lens = s.subs.reduce((a, sp) => a + polyLen(sp), 0);
    return lens >= 0.4 * L || polyLen(pts) >= 0.4 * L;
  });
}

/* hard limits (CLAUDE.md fortune hard limits + palm owner spec 2026-11-19): words that must never appear in any palm v2 text */
const HARD = {
  th: new RegExp(
    "อายุขัย|อายุสั้น|อายุยืน|ความตาย|เสียชีวิต|ตายเร็ว|จะตาย|ถึงตาย|ป่วย|โรค|สุขภาพ|อุบัติเหตุ|มะเร็ง|ผ่าตัด" + "|" +
    "ศัลยกรรม|จำนวนลูก|มีลูก|ลูก\\s*\\d|บุตร|ตั้งครรภ์|หย่า|เลิกกัน|แยกทาง|เลิกรา|ลงทุน|หุ้น|คริปโต|เก็งกำไร" + "|" +
    "หวย|เลขเด็ด|ถ้าไม่(?:จ่าย|ซื้อ|ทำพิธี|บูชา|แก้)|มิฉะนั้น|ต้องจ่าย|จ่ายเงินเพื่อ|ซึมเศร้า|ทำร้ายตัวเอง" + "|" +
    "ฆ่าตัวตาย|ดาวน์ซินโดรม|อาภัพ|ดวงแข็ง"),
  en: new RegExp("\\b(?:" + [
    "die|dies|died|dying|death|dead|lifespan|life span|how long you(?: will)? live|longevity|illness|ill|sick|sickness|disease",
    "health|healthy|cancer|accident|surgery|children|child|kids|baby|babies|pregnan\\w*|divorce\\w*|break[- ]?up|separation|invest\\w*",
    "stocks?|crypto|lottery|lucky numbers?|unless you|or else|must pay|depress\\w*|self-harm|suicid\\w*|down syndrome",
  ].join("|") + ")\\b", "i"),
  zh: /死|寿命|短命|长寿|疾病|生病|病|健康|意外|事故|手术|子女|孩子|儿女|生育|怀孕|离婚|分手|离异|投资|股票|炒股|彩票|号码|否则|除非你|破财|抑郁|自杀|自残|克夫|命硬/,
};
/* an "absent" reading is positive and practical: no wording that the absence is bad */
const NEGATIVE = {
  th: /ไม่ดี|โชคร้าย|ดวงตก|เคราะห์|อัปมงคล|น่าเป็นห่วง|น่ากลัว|ขาดโชค|ไร้โชค/,
  en: /\b(?:bad|unlucky|misfortune|doomed|cursed|worrying|lacking luck|no luck)\b/i,
  zh: /不好|倒霉|不吉|凶|厄运|没有运气|命苦/,
};
const SCRIPT = { th: /[฀-๿]/, zh: /[一-鿿]/, en: /^[\x20-\x7E‘’“”–—·…]+$/ };

module.exports = { rng, recordingCtx, polyDist, polyLen, catmull, strokesOn, HARD, NEGATIVE, SCRIPT };

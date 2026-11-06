/* lensiq-stats.js — สถิติล้วน (ไม่ใช้ DOM ไม่ส่งข้อมูลออกนอกเครื่อง) สำหรับแดชบอร์ดรวม LENSIQ
   UMD: เบราว์เซอร์ = window.LQStats · Node = require("./lensiq-stats.js")
   ทุกฟังก์ชันรับอาร์เรย์ตัวเลข ค่า null/NaN ถูกข้าม และคืน null เมื่อข้อมูลไม่พอ (ไม่สร้างความมั่นใจปลอม)

   วิธีที่ใช้
   - ช่วงความเชื่อมั่นของสัดส่วน: Wilson score ; ผลต่างสองสัดส่วน: Newcombe hybrid score (วิธีที่ 10) + z-test แบบ pooled
   - เทียบจำนวนนับสองช่วง: exact conditional (binomial) test ของอัตรา Poisson ; CI ของอัตราส่วนจาก log-normal
   - ผลต่างค่าเฉลี่ย: Welch t (การแจกแจง t ผ่าน regularized incomplete beta)
   - ค่าผิดปกติ: modified z-score (Iglewicz–Hoaglin, 0.6745·(x−median)/MAD, เกณฑ์ 3.5) บนเศษเหลือของ STL แบบย่อ
     (แนวโน้ม = median เคลื่อนที่ 7 วัน ตามด้วยค่าเฉลี่ยเคลื่อนที่ 3 จุด ; ฤดูกาล = median ของแต่ละวันในสัปดาห์)
   - พยากรณ์: Holt-Winters แบบบวก (ฤดูกาลรายสัปดาห์) เลือก α β γ ด้วย grid search ให้ SSE ของการพยากรณ์ล่วงหน้า 1 ก้าวต่ำสุด
     ช่วงพยากรณ์ตาม Hyndman et al. (2008) ; ข้อมูลไม่ถึง 3 สัปดาห์ใช้ seasonal naive ; ไม่ถึง 1 สัปดาห์ใช้ค่าเฉลี่ย
   - สหสัมพันธ์: Pearson + CI/p-value จาก Fisher z ; Spearman (อันดับ) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LQStats = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const fin = x => typeof x === "number" && Number.isFinite(x);
  const clean = a => (Array.isArray(a) ? a : []).filter(fin);
  const sum = a => clean(a).reduce((s, x) => s + x, 0);
  const mean = a => { const c = clean(a); return c.length ? sum(c) / c.length : null; };
  const sorted = a => clean(a).slice().sort((x, y) => x - y);
  /** quantile แบบ linear interpolation (type 7 เหมือน R / Excel) */
  function quantile(a, q) {
    const s = sorted(a); if (!s.length) return null;
    const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (s[hi] - s[lo]) * (h - lo);
  }
  const median = a => quantile(a, 0.5);
  /** ส่วนเบี่ยงเบนมาตรฐานตัวอย่าง (หาร n−1) */
  function sd(a) {
    const c = clean(a); if (c.length < 2) return null;
    const m = mean(c); return Math.sqrt(c.reduce((s, x) => s + (x - m) * (x - m), 0) / (c.length - 1));
  }
  /** median absolute deviation (ไม่คูณ 1.4826) */
  function mad(a) { const m = median(a); if (m == null) return null; return median(clean(a).map(x => Math.abs(x - m))); }
  function describe(a) {
    const c = clean(a), n = c.length;
    if (!n) return { n: 0, sum: 0, mean: null, median: null, sd: null, min: null, max: null, p25: null, p75: null, cv: null };
    const m = mean(c), s = sd(c);
    return { n, sum: sum(c), mean: m, median: median(c), sd: s, min: Math.min(...c), max: Math.max(...c), p25: quantile(c, 0.25), p75: quantile(c, 0.75), cv: s != null && m ? s / Math.abs(m) : null };
  }
  /** ค่าเฉลี่ยเคลื่อนที่ย้อนหลัง k จุด (จุดแรก ๆ ใช้เท่าที่มี) ; null คงเป็น null */
  function movingAvg(a, k = 7) {
    return (a || []).map((x, i) => { const w = clean(a.slice(Math.max(0, i - k + 1), i + 1)); return fin(x) && w.length ? sum(w) / w.length : null; });
  }

  /* ---------- การแจกแจง ---------- */
  function erf(x) { // Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7)
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function normInv(p) { // Acklam
    if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425, hi = 1 - lo;
    if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > hi) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function lgamma(x) { // Lanczos
    const g = 7, C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = C[0]; const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += C[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /** regularized incomplete beta I_x(a,b) */
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  /** CDF ของการแจกแจง t */
  function tCdf(t, df) { const x = df / (df + t * t), p = 0.5 * ibeta(x, df / 2, 0.5); return t >= 0 ? 1 - p : p; }
  /** ค่าวิกฤต t สองด้าน (conf = 0.95 → t_{0.975,df}) ด้วยการแบ่งครึ่งช่วง */
  function tCrit(df, conf = 0.95) {
    if (!(df > 0)) return null;
    const target = 1 - (1 - conf) / 2; let lo = 0, hi = 1000;
    for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < target) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const zCrit = (conf = 0.95) => normInv(1 - (1 - conf) / 2);

  /* ---------- สัดส่วนและอัตรา ---------- */
  /** Wilson score interval ของ x/n */
  function wilson(x, n, conf = 0.95) {
    if (!(n > 0) || !(x >= 0) || x > n) return null;
    const z = zCrit(conf), p = x / n, z2 = z * z, den = 1 + z2 / n;
    const c = (p + z2 / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den;
    return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), n, x };
  }
  /** ผลต่างสองสัดส่วน p1 − p2 : CI แบบ Newcombe (hybrid score) + p-value z-test แบบ pooled */
  function twoProp(x1, n1, x2, n2, conf = 0.95) {
    const a = wilson(x1, n1, conf), b = wilson(x2, n2, conf);
    if (!a || !b) return null;
    const d = a.p - b.p;
    const lo = d - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2), hi = d + Math.sqrt((a.hi - a.p) ** 2 + (b.p - b.lo) ** 2);
    const pp = (x1 + x2) / (n1 + n2), se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    const z = se > 0 ? d / se : 0, p = se > 0 ? 2 * (1 - normCdf(Math.abs(z))) : 1;
    return { p1: a.p, p2: b.p, diff: d, lo, hi, z, p, rel: b.p > 0 ? d / b.p : null };
  }
  function logBinom(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }
  /** binomial test สองด้าน (รวมความน่าจะเป็นของผลที่สุดโต่งเท่าหรือมากกว่าค่าที่เห็น) */
  function binomTest(k, n, p0) {
    if (!(n > 0)) return 1;
    if (p0 <= 0) return k === 0 ? 1 : 0; if (p0 >= 1) return k === n ? 1 : 0;
    const lp = i => logBinom(n, i) + i * Math.log(p0) + (n - i) * Math.log(1 - p0);
    if (n > 5000) { const m = n * p0, s = Math.sqrt(n * p0 * (1 - p0)); return Math.min(1, 2 * (1 - normCdf((Math.abs(k - m) - 0.5) / s))); }
    const obs = lp(k); let tot = 0;
    for (let i = 0; i <= n; i++) { const l = lp(i); if (l <= obs + 1e-7) tot += Math.exp(l); }
    return Math.min(1, tot);
  }
  /** เทียบอัตรานับ c1/t1 กับ c2/t2 (เช่น คนเข้าร้านต่อวัน) — exact conditional test ของ Poisson
     คืน { rate1, rate2, ratio, change, lo, hi (ช่วงของ change), p } */
  function poissonTest(c1, t1, c2, t2, conf = 0.95) {
    if (!(t1 > 0) || !(t2 > 0) || !(c1 >= 0) || !(c2 >= 0)) return null;
    c1 = Math.round(c1); c2 = Math.round(c2);
    const r1 = c1 / t1, r2 = c2 / t2, n = c1 + c2;
    const p = n ? binomTest(c1, n, t1 / (t1 + t2)) : 1;
    let lo = null, hi = null, ratio = r2 > 0 ? r1 / r2 : null;
    if (c1 > 0 && c2 > 0) { const z = zCrit(conf), se = Math.sqrt(1 / c1 + 1 / c2), lr = Math.log(ratio); lo = Math.exp(lr - z * se) - 1; hi = Math.exp(lr + z * se) - 1; }
    return { rate1: r1, rate2: r2, ratio, change: ratio == null ? null : ratio - 1, lo, hi, p, n };
  }
  /** ค่าเฉลี่ยพร้อม CI (t) */
  function meanCI(a, conf = 0.95) {
    const c = clean(a), n = c.length; if (!n) return null;
    const m = mean(c); if (n < 2) return { mean: m, lo: null, hi: null, n, se: null };
    const se = sd(c) / Math.sqrt(n), t = tCrit(n - 1, conf);
    return { mean: m, lo: m - t * se, hi: m + t * se, n, se };
  }
  /** Welch t: ผลต่าง mean(a) − mean(b) */
  function welch(a, b, conf = 0.95) {
    const A = clean(a), B = clean(b);
    if (A.length < 2 || B.length < 2) return null;
    const ma = mean(A), mb = mean(B), va = sd(A) ** 2 / A.length, vb = sd(B) ** 2 / B.length, se = Math.sqrt(va + vb), d = ma - mb;
    if (!(se > 0)) return { diff: d, lo: d, hi: d, p: d === 0 ? 1 : 0, df: A.length + B.length - 2, t: null };
    const df = (va + vb) ** 2 / (va * va / (A.length - 1) + vb * vb / (B.length - 1)), t = d / se, tc = tCrit(df, conf);
    return { diff: d, lo: d - tc * se, hi: d + tc * se, t, df, p: 2 * (1 - tCdf(Math.abs(t), df)), meanA: ma, meanB: mb };
  }

  /* ---------- ฤดูกาลและค่าผิดปกติ ---------- */
  /** modified z-score: 0.6745·(x − median)/MAD ; MAD = 0 → ใช้ mean absolute deviation × 1.2533 (Iglewicz–Hoaglin) */
  function robustZ(a) {
    const c = clean(a), m = median(c); if (m == null) return (a || []).map(() => null);
    let s = mad(c), k = 0.6745;
    if (!(s > 0)) { s = mean(c.map(x => Math.abs(x - m))); k = 0.7979; } // 1/1.2533
    return (a || []).map(x => fin(x) && s > 0 ? k * (x - m) / s : (fin(x) ? 0 : null));
  }
  /** STL แบบย่อ: { trend, seasonal, resid } ความยาวเท่า y (null คงเป็น null) ; ต้องมีอย่างน้อย 2 รอบฤดูกาล */
  function stlLite(y, period = 7) {
    const n = y.length; if (clean(y).length < period * 2) return null;
    const half = Math.floor(period / 2);
    const rm = y.map((_, i) => median(y.slice(Math.max(0, i - half), Math.min(n, i + half + 1))));
    const trend = rm.map((_, i) => mean(rm.slice(Math.max(0, i - 1), Math.min(n, i + 2))));
    const ph = Array.from({ length: period }, (_, p) => median(y.map((v, i) => i % period === p && fin(v) && fin(trend[i]) ? v - trend[i] : null)));
    const off = mean(ph) || 0, season = ph.map(v => fin(v) ? v - off : 0);
    const seasonal = y.map((_, i) => season[i % period]);
    const resid = y.map((v, i) => fin(v) && fin(trend[i]) ? v - trend[i] - seasonal[i] : null);
    return { trend, seasonal, resid, season };
  }
  /** หาค่าผิดปกติ: [{ i, value, expected, z, dir: "up"|"down" }] ; minN = จำนวนจุดขั้นต่ำ
     ต้องผ่านทั้งเกณฑ์สถิติ (|modified z| ≥ threshold) และเกณฑ์ปฏิบัติ (ต่างจากค่าที่คาด ≥ minRel) */
  function anomalies(y, { period = 7, threshold = 3.5, minN = 10, minRel = 0.25 } = {}) {
    const c = clean(y); if (c.length < minN) return [];
    const D = stlLite(y, period);
    const base = D ? D.resid : y, z = robustZ(base), med = median(c);
    const out = [];
    z.forEach((zi, i) => {
      if (zi == null || Math.abs(zi) < threshold) return;
      const exp = D ? D.trend[i] + D.seasonal[i] : med;
      if (Math.abs(y[i] - exp) < 1e-9) return;
      if (minRel > 0 && Math.abs(exp) > 0 && Math.abs(y[i] - exp) / Math.abs(exp) < minRel) return; // ต่างไม่ถึง minRel ของค่าที่คาด = ไม่นับว่าผิดปกติในทางปฏิบัติ
      out.push({ i, value: y[i], expected: exp, z: zi, dir: zi > 0 ? "up" : "down" });
    });
    return out;
  }
  /** โปรไฟล์ฤดูกาล วัน×ชั่วโมง: cells = [{ wd 0..6 (อา.=0), h 0..23, v }] → { mean[7][24], n[7][24], max } */
  function seasonGrid(cells) {
    const S = Array.from({ length: 7 }, () => Array(24).fill(0)), N = Array.from({ length: 7 }, () => Array(24).fill(0));
    (cells || []).forEach(c => { if (c && fin(c.v) && c.wd >= 0 && c.wd < 7 && c.h >= 0 && c.h < 24) { S[c.wd][c.h] += c.v; N[c.wd][c.h]++; } });
    let max = 0;
    const M = S.map((row, w) => row.map((s, h) => { const v = N[w][h] ? s / N[w][h] : null; if (v > max) max = v; return v; }));
    return { mean: M, n: N, max };
  }

  /* ---------- พยากรณ์ ---------- */
  function hwRun(y, m, a, b, g) {
    const s1 = y.slice(0, m), s2 = y.slice(m, 2 * m), m1 = mean(s1), m2 = mean(s2);
    let T = (m2 - m1) / m, L = m1 + T * (m - 1) / 2;
    const S = s1.map((v, i) => v - (m1 + T * (i - (m - 1) / 2)));
    let sse = 0, cnt = 0; const fitted = Array(y.length).fill(null);
    for (let t = m; t < y.length; t++) {
      const f = L + T + S[t - m]; fitted[t] = f;
      const e = y[t] - f; sse += e * e; cnt++;
      const Ln = a * (y[t] - S[t - m]) + (1 - a) * (L + T);
      T = b * (Ln - L) + (1 - b) * T;
      S[t] = g * (y[t] - Ln) + (1 - g) * S[t - m];
      L = Ln;
    }
    return { L, T, S, sse, cnt, fitted };
  }
  /** Holt-Winters แบบบวก — y ต้องไม่มี null และยาว ≥ 2m */
  function holtWinters(y, m = 7, h = 7, { conf = 0.8, nonneg = true } = {}) {
    if (!Array.isArray(y) || y.length < 2 * m || y.some(v => !fin(v))) return null;
    let best = null;
    for (const a of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) for (const b of [0, 0.02, 0.05, 0.1, 0.2]) for (const g of [0.05, 0.1, 0.2, 0.4, 0.6]) {
      const r = hwRun(y, m, a, b, g);
      if (!best || r.sse < best.sse - 1e-9) best = { ...r, a, b, g };
    }
    const n = y.length, k = Math.max(1, best.cnt - 3), sigma = Math.sqrt(best.sse / k), z = zCrit(conf);
    const mean_ = [], lo = [], hi = [];
    for (let j = 1; j <= h; j++) {
      let f = best.L + j * best.T + best.S[n - m + ((j - 1) % m)];
      let v = 1; for (let i = 1; i < j; i++) { const c = best.a * (1 + i * best.b) + (i % m === 0 ? best.g : 0); v += c * c; }
      const w = z * sigma * Math.sqrt(v);
      if (nonneg) f = Math.max(0, f);
      mean_.push(f); lo.push(nonneg ? Math.max(0, f - w) : f - w); hi.push(f + w);
    }
    return { method: "holt-winters", mean: mean_, lo, hi, sigma, params: { alpha: best.a, beta: best.b, gamma: best.g }, fitted: best.fitted, conf };
  }
  /** พยากรณ์ h ช่วงข้างหน้า เลือกวิธีตามความยาวข้อมูล ; ไม่มีข้อมูล = null */
  function forecast(y, h = 7, { period = 7, conf = 0.8, nonneg = true } = {}) {
    const c = clean(y); if (!c.length) return null;
    const yy = y.map(v => fin(v) ? v : (median(c) || 0));
    if (yy.length >= 3 * period) { const r = holtWinters(yy, period, h, { conf, nonneg }); if (r) return { ...r, enough: true, n: yy.length }; }
    const z = zCrit(conf), clip = v => nonneg ? Math.max(0, v) : v;
    if (yy.length >= period + 2) { // seasonal naive
      const e = yy.slice(period).map((v, i) => v - yy[i]), s = Math.sqrt(mean(e.map(x => x * x)) || 0);
      const mean_ = [], lo = [], hi = [];
      for (let j = 1; j <= h; j++) { const f = yy[yy.length - period + ((j - 1) % period)], w = z * s * Math.sqrt(Math.ceil(j / period)); mean_.push(clip(f)); lo.push(clip(f - w)); hi.push(f + w); }
      return { method: "seasonal-naive", mean: mean_, lo, hi, sigma: s, enough: false, n: yy.length, conf };
    }
    const m = mean(yy), s = sd(yy) || 0;
    return { method: "mean", mean: Array(h).fill(clip(m)), lo: Array(h).fill(clip(m - z * s)), hi: Array(h).fill(m + z * s), sigma: s, enough: false, n: yy.length, conf };
  }

  /* ---------- ความสัมพันธ์ ---------- */
  function pairs(x, y) { const X = [], Y = []; for (let i = 0; i < Math.min(x.length, y.length); i++) if (fin(x[i]) && fin(y[i])) { X.push(x[i]); Y.push(y[i]); } return [X, Y]; }
  function pearsonRaw(X, Y) {
    const n = X.length, mx = mean(X), my = mean(Y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const a = X[i] - mx, b = Y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = Array(a.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  }
  /** สหสัมพันธ์ Pearson พร้อม CI (Fisher z) และ Spearman ; n < minN → { enough: false } */
  function correlation(x, y, { conf = 0.95, minN = 8 } = {}) {
    const [X, Y] = pairs(x || [], y || []), n = X.length;
    if (n < 3) return { n, r: null, enough: false };
    const r = pearsonRaw(X, Y), rho = pearsonRaw(ranks(X), ranks(Y));
    if (r == null) return { n, r: null, enough: false };
    let lo = null, hi = null, p = null;
    if (n > 3) {
      const rr = Math.max(-0.999999, Math.min(0.999999, r)), zf = Math.atanh(rr), se = 1 / Math.sqrt(n - 3), zc = zCrit(conf);
      lo = Math.tanh(zf - zc * se); hi = Math.tanh(zf + zc * se); p = 2 * (1 - normCdf(Math.abs(zf) / se));
    }
    return { n, r, rho, lo, hi, p, enough: n >= minN };
  }

  /* ---------- funnel / cohort / A-B ---------- */
  /** steps = [{ label, value }] → อัตราต่อขั้น (Wilson เมื่อ value ≤ ขั้นก่อน) และอัตรารวม */
  function funnel(steps) {
    const out = (steps || []).map(s => ({ ...s, value: fin(s.value) ? s.value : null }));
    out.forEach((s, i) => {
      const p = i ? out[i - 1].value : null;
      s.rate = i && fin(p) && p > 0 && fin(s.value) ? s.value / p : null;
      s.ci = s.rate != null && s.value <= p ? wilson(Math.round(s.value), Math.round(p)) : null;
      s.overcount = s.rate != null && s.rate > 1;
    });
    const first = out.find(s => fin(s.value) && s.value > 0), last = out.slice().reverse().find(s => fin(s.value));
    return { steps: out, overall: first && last && first !== last ? last.value / first.value : null };
  }
  /** events = [{ id, period (จำนวนเต็ม เช่น สัปดาห์ที่) }] → cohort ตามช่วงแรกที่พบ + อัตรากลับมาซ้ำ */
  function cohorts(events, maxAge = 8) {
    const first = new Map(), seen = new Map();
    (events || []).forEach(e => { if (!e || e.id == null || !fin(e.period)) return; if (!first.has(e.id) || e.period < first.get(e.id)) first.set(e.id, e.period); (seen.get(e.id) || seen.set(e.id, new Set()).get(e.id)).add(e.period); });
    const maxP = Math.max(-Infinity, ...[...seen.values()].flatMap(s => [...s]));
    const byC = new Map();
    first.forEach((p, id) => { (byC.get(p) || byC.set(p, []).get(p)).push(id); });
    const rows = [...byC.keys()].sort((a, b) => a - b).map(p => {
      const ids = byC.get(p), ret = [];
      for (let k = 0; k <= Math.min(maxAge, maxP - p); k++) ret.push(ids.filter(id => seen.get(id).has(p + k)).length / ids.length);
      return { period: p, size: ids.length, retention: ret };
    });
    const ids = [...first.keys()], repeat = ids.filter(id => seen.get(id).size > 1).length;
    return { rows, customers: ids.length, repeat, repeatRate: ids.length ? repeat / ids.length : null, repeatCI: wilson(repeat, ids.length) };
  }
  /** A/B ของอัตรา: groups = [{ id, name, x, n }] → ทุกกลุ่มมี Wilson ; best เทียบ runner-up ด้วย twoProp */
  function abRates(groups, { minN = 30 } = {}) {
    const G = (groups || []).filter(g => g && g.n > 0 && g.x >= 0 && g.x <= g.n).map(g => ({ ...g, ci: wilson(g.x, g.n), enough: g.n >= minN }));
    const ok = G.filter(g => g.enough).sort((a, b) => b.ci.p - a.ci.p);
    const res = { groups: G.sort((a, b) => b.ci.p - a.ci.p), best: ok[0] || null, runner: ok[1] || null, worst: ok.length > 1 ? ok[ok.length - 1] : null, test: null, enough: ok.length >= 2 };
    if (res.best && res.runner) res.test = twoProp(res.best.x, res.best.n, res.runner.x, res.runner.n);
    if (res.best && res.worst) res.spread = twoProp(res.best.x, res.best.n, res.worst.x, res.worst.n);
    return res;
  }
  /** A/B ของค่าเฉลี่ย: groups = [{ id, name, values }] */
  function abMeans(groups, { minN = 3 } = {}) {
    const G = (groups || []).map(g => ({ ...g, ci: meanCI(g.values), n: clean(g.values).length })).filter(g => g.ci);
    G.forEach(g => { g.enough = g.n >= minN; });
    G.sort((a, b) => b.ci.mean - a.ci.mean);
    const ok = G.filter(g => g.enough), res = { groups: G, best: ok[0] || null, runner: ok[1] || null, worst: ok.length > 1 ? ok[ok.length - 1] : null, test: null, enough: ok.length >= 2 };
    if (res.best && res.runner) res.test = welch(res.best.values, res.runner.values);
    if (res.best && res.worst) res.spread = welch(res.best.values, res.worst.values);
    return res;
  }

  /* ---------- ภาษาคน ---------- */
  /** ระดับความมั่นใจจาก p-value: insufficient | none | weak | moderate | strong */
  function confLevel(p, enough = true) {
    if (!enough || !fin(p)) return "insufficient";
    return p < 0.01 ? "strong" : p < 0.05 ? "moderate" : p < 0.2 ? "weak" : "none";
  }
  const TH_CONF = {
    insufficient: "ข้อมูลยังน้อย ยังสรุปไม่ได้",
    none: "ยังไม่ต่างจากเดิมอย่างมีนัย อาจเป็นความผันผวนตามปกติ",
    weak: "ยังไม่แน่ชัด อาจเป็นความบังเอิญได้",
    moderate: "ค่อนข้างมั่นใจ โอกาสเป็นความบังเอิญไม่ถึง 1 ใน 20",
    strong: "มั่นใจสูง โอกาสเป็นความบังเอิญไม่ถึง 1 ใน 100"
  };
  const TH_CONF_SHORT = { insufficient: "ข้อมูลยังน้อย", none: "ไม่ต่างชัด", weak: "ยังไม่แน่ชัด", moderate: "ค่อนข้างมั่นใจ", strong: "มั่นใจสูง" };
  /** ความแรงของสหสัมพันธ์ */
  function corrWord(r) {
    if (!fin(r)) return "ไม่ทราบ";
    const a = Math.abs(r), dir = r > 0 ? "ไปทางเดียวกัน" : "สวนทางกัน";
    return a < 0.1 ? "แทบไม่สัมพันธ์กัน" : a < 0.3 ? `สัมพันธ์กันเล็กน้อย (${dir})` : a < 0.5 ? `สัมพันธ์กันปานกลาง (${dir})` : a < 0.7 ? `สัมพันธ์กันค่อนข้างชัด (${dir})` : `สัมพันธ์กันชัดมาก (${dir})`;
  }

  return {
    fin, clean, sum, mean, median, quantile, sd, mad, describe, movingAvg,
    erf, normCdf, normInv, lgamma, ibeta, tCdf, tCrit, zCrit,
    wilson, twoProp, binomTest, poissonTest, meanCI, welch,
    robustZ, stlLite, anomalies, seasonGrid, holtWinters, forecast,
    correlation, funnel, cohorts, abRates, abMeans,
    confLevel, corrWord, TH_CONF, TH_CONF_SHORT
  };
});

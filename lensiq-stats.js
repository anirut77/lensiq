/* lensiq-stats.js — สถิติล้วน (ไม่ใช้ DOM ไม่ส่งข้อมูลออกนอกเครื่อง) สำหรับแดชบอร์ดรวม LENSIQ
   UMD: เบราว์เซอร์ = window.LQStats · Node = require("./lensiq-stats.js")
   ทุกฟังก์ชันรับอาร์เรย์ตัวเลข ค่า null/NaN ถูกข้าม และคืน null เมื่อข้อมูลไม่พอ (ไม่สร้างความมั่นใจปลอม)

   วิธีที่ใช้
   - ช่วงความเชื่อมั่นของสัดส่วน: Wilson score (นับต่อคน) ; อัตรารวมจากข้อมูลรายวัน: quasi-binomial (quasiBinomCI, √φ จากความต่างรายวัน) ; ผลต่างสองสัดส่วน: Newcombe hybrid score (วิธีที่ 10) + z-test แบบ pooled
   - เทียบจำนวนนับรายวันสองช่วง (countCompare): negative binomial log-linear model ปรับวันในสัปดาห์ ความผันผวน (κ) ประมาณจาก
     เศษเหลือรายวันของประวัติ (ก้อนละ 14 วัน) → t-test ของ log อัตราส่วน (ยอดรายวันผันผวนเกิน Poisson เสมอ การใช้ exact Poisson
     ตรง ๆ ทำให้ “เจอความต่าง” ปลอมราว 40–50% ของครั้งเมื่อยอดแกว่ง ±20–30%) ; poissonTest (exact) เก็บไว้สำหรับจำนวนนับที่เป็นอิสระจริงเท่านั้น
     ช่วงสั้นที่ยอดแกว่งมาก (NB k ≤ 1): ปรับความแปรปรวนด้วย trigamma ของ “ขนาดตัวอย่างที่มีผล” และลด df ตาม kurtosis (ดู countCompare)
   - เทียบอัตราส่วนรายวันสองช่วง (twoPropDaily): quasi-binomial (φ จากความต่างรายวัน)
   - ทดสอบหลายข้อพร้อมกัน: Benjamini–Hochberg (adjustP) ; ระดับความมั่นใจคิดจากค่าที่ปรับแล้ว (q)
   - ผลต่างค่าเฉลี่ย: Welch t (การแจกแจง t ผ่าน regularized incomplete beta)
   - ค่าผิดปกติ: modified z-score (Iglewicz–Hoaglin, 0.6745·(x−median)/MAD, เกณฑ์ 3.5) บนเศษเหลือของ STL แบบย่อ
     (แนวโน้ม = median เคลื่อนที่ 7 วัน ตามด้วยค่าเฉลี่ยเคลื่อนที่ 3 จุด ; ฤดูกาล = median ของแต่ละวันในสัปดาห์)
   - พยากรณ์: Holt-Winters แบบบวก (ฤดูกาลรายสัปดาห์) เลือก α β γ ด้วย grid search ให้ SSE ของการพยากรณ์ล่วงหน้า 1 ก้าวต่ำสุด
     ช่วงพยากรณ์ตาม Hyndman et al. (2008) ; ข้อมูลไม่ถึง 3 สัปดาห์ใช้ seasonal naive ; ไม่ถึง 1 สัปดาห์ใช้ค่าเฉลี่ย
   - สหสัมพันธ์: Pearson + CI/p-value จาก Fisher z ; Spearman (อันดับ)
     อนุกรมเวลา (tsCorrelation): ตัดผลวันในสัปดาห์ + แนวโน้มก่อน แล้วใช้ n_eff แบบ Bartlett/AR(1) ใน CI และ p
   - A/B: empirical Bayes (beta-binomial / normal–normal) ดึงค่าของกลุ่มที่ข้อมูลน้อยเข้าหาค่ากลาง ใช้จัดอันดับแทนค่าดิบ */
(/** @param {any} root */ function (root, factory) {
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
  /** erf แบบเดิม Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7 แบบสัมบูรณ์ ; p สองด้านที่หางคลาดสัมพัทธ์ 0.05% ที่ z=3, 0.4% ที่ z=6, 7% ที่ z=8) เก็บไว้เทียบเท่านั้น */
  function erfAS(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  /** erfc — W. J. Cody (1969) rational Chebyshev approximations (CALERF) ; ความคลาดเคลื่อนสัมพัทธ์ ~1e-15 ทั้งช่วง รวมหางไกล
     (erfc(10) ≈ 2.09e-45) จึงใช้คิด p-value ที่เล็กมากได้ถูก ; x < 0 → 2 − erfc(|x|) */
  const CODY = {
    A: [3.1611237438705655, 113.86415415105016, 377.485237685302, 3209.3775891384694, 0.18577770618460315],
    B: [23.601290952344122, 244.02463793444417, 1282.6165260773723, 2844.236833439171],
    C: [0.5641884969886701, 8.883149794388377, 66.11919063714163, 298.6351381974001, 881.952221241769, 1712.0476126340707, 2051.0783778260716, 1230.3393547979972, 2.1531153547440383e-8],
    D: [15.744926110709835, 117.6939508913125, 537.1811018620099, 1621.3895745666903, 3290.7992357334597, 4362.619090143247, 3439.3676741437216, 1230.3393548037495],
    P: [0.30532663496123236, 0.36034489994980445, 0.12578172611122926, 0.016083785148742275, 0.0006587491615298378, 0.016315387137302097],
    Q: [2.568520192289822, 1.8729528499234673, 0.5279051029514285, 0.06051834131244132, 0.0023352049762686918]
  };
  /** @param {number} x */
  function erfc(x) {
    if (Number.isNaN(x)) return NaN;
    const { A, B, C, D, P, Q } = CODY, y = Math.abs(x); let r;
    if (y <= 0.46875) {
      const ysq = y > 1.11e-16 ? y * y : 0; let xn = A[4] * ysq, xd = ysq;
      for (let i = 0; i < 3; i++) { xn = (xn + A[i]) * ysq; xd = (xd + B[i]) * ysq; }
      return 1 - x * (xn + A[3]) / (xd + B[3]);
    }
    if (y <= 4) {
      let xn = C[8] * y, xd = y;
      for (let i = 0; i < 7; i++) { xn = (xn + C[i]) * y; xd = (xd + D[i]) * y; }
      r = (xn + C[7]) / (xd + D[7]);
    } else if (y >= 26.543) r = 0;
    else {
      const ysq = 1 / (y * y); let xn = P[5] * ysq, xd = ysq;
      for (let i = 0; i < 4; i++) { xn = (xn + P[i]) * ysq; xd = (xd + Q[i]) * ysq; }
      r = (0.5641895835477563 - ysq * (xn + P[4]) / (xd + Q[4])) / y;
    }
    if (r) { const ys = Math.trunc(y * 16) / 16, del = (y - ys) * (y + ys); r = Math.exp(-ys * ys) * Math.exp(-del) * r; }
    return x < 0 ? 2 - r : r;
  }
  /** @param {number} x */
  const erf = x => (Math.abs(x) <= 0.46875 ? 1 - erfc(x) : x < 0 ? erfc(-x) - 1 : 1 - erfc(x));
  const normCdf = z => 0.5 * erfc(-z / Math.SQRT2);
  /** หางขวา P(Z > z) = 1 − Φ(z) โดยไม่ลบเลขใกล้ 1 (แม่นถึงหางไกล) */
  const normSf = z => 0.5 * erfc(z / Math.SQRT2);
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
  /** ช่วงความเชื่อมั่นของอัตรารวม Σx/Σn จากข้อมูลรายวัน — quasi-binomial (round 10)
     คนในวันเดียวกันไม่เป็นอิสระต่อกัน (วันคิวยาวทุกคนซื้อน้อยลงพร้อมกัน) → Wilson ต่อคนแคบเกิน
     φ = max(1, Pearson χ² รายวันรอบอัตรารวม ÷ (วัน − 1)) ; n_eff = n/φ ; Wilson บน n_eff ที่ใช้ t_{วัน−1} แทน z (ขยาย √φ)
     daily = [{ x, n }] ; คืน { p, lo, hi, phi, df, nEff, days, x, n, method } ; ไม่ถึง 2 วัน = Wilson ธรรมดา (method "wilson") */
  function quasiBinomCI(daily, conf = 0.95) {
    const D = (daily || []).filter(d => d && fin(d.x) && fin(d.n) && d.n > 0 && d.x >= 0);
    const x = sum(D.map(d => d.x)), n = sum(D.map(d => d.n));
    if (!(n > 0) || x > n) return null;
    const p = x / n, days = D.length;
    let chi2 = 0; if (p > 0 && p < 1) D.forEach(d => { chi2 += (d.x - d.n * p) ** 2 / (d.n * p * (1 - p)); });
    const df = days - 1;
    if (df < 1) { const w = wilson(x, n, conf); return w && { ...w, phi: 1, df: 0, nEff: n, days, method: "wilson" }; }
    const phi = Math.max(1, chi2 / df), nEff = n / phi, c = tCrit(df, conf), c2 = c * c, den = 1 + c2 / nEff;
    const mid = (p + c2 / (2 * nEff)) / den, hw = c * Math.sqrt(p * (1 - p) / nEff + c2 / (4 * nEff * nEff)) / den;
    return { p, lo: Math.max(0, mid - hw), hi: Math.min(1, mid + hw), phi, df, nEff, days, x, n, method: "quasi-binomial" };
  }
  /** ผลต่างสองสัดส่วน p1 − p2 : CI แบบ Newcombe (hybrid score) + p-value z-test แบบ pooled */
  function twoProp(x1, n1, x2, n2, conf = 0.95) {
    const a = wilson(x1, n1, conf), b = wilson(x2, n2, conf);
    if (!a || !b) return null;
    const d = a.p - b.p;
    const lo = d - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2), hi = d + Math.sqrt((a.hi - a.p) ** 2 + (b.p - b.lo) ** 2);
    const pp = (x1 + x2) / (n1 + n2), se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    const z = se > 0 ? d / se : 0, p = se > 0 ? 2 * normSf(Math.abs(z)) : 1;
    return { p1: a.p, p2: b.p, diff: d, lo, hi, z, p, rel: b.p > 0 ? d / b.p : null };
  }
  function logBinom(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }
  /** binomial test สองด้าน (รวมความน่าจะเป็นของผลที่สุดโต่งเท่าหรือมากกว่าค่าที่เห็น) */
  function binomTest(k, n, p0) {
    if (!(n > 0)) return 1;
    if (p0 <= 0) return k === 0 ? 1 : 0; if (p0 >= 1) return k === n ? 1 : 0;
    const lp = i => logBinom(n, i) + i * Math.log(p0) + (n - i) * Math.log(1 - p0);
    if (n > 5000) { const m = n * p0, s = Math.sqrt(n * p0 * (1 - p0)); return Math.min(1, 2 * normSf((Math.abs(k - m) - 0.5) / s)); }
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
  /** ค่าคาดของแต่ละวันแบบไม่ใช้ค่าของวันนั้นเอง (leave-one-out) — ฤดูกาลรายสัปดาห์แบบคูณ × ค่ากลางของวันใกล้เคียง ±h วัน (ตัดผลวันในสัปดาห์แล้ว)
     ไม่ใช้วันนั้นเอง จึงไม่ “ดูด” ค่าผิดปกติเข้าไปในค่าคาด และส่วนเหลือมีความแปรปรวนเต็ม (STL ธรรมดาหดส่วนเหลือราวครึ่งหนึ่ง → ประเมินความผันผวนต่ำไป) */
  function looExpected(y, period = 7, h = 7) {
    const n = y.length;
    const t0 = y.map((_, i) => median(y.slice(Math.max(0, i - 3), Math.min(n, i + 4))));
    const sf = Array.from({ length: period }, (_, p) => median(y.map((v, i) => i % period === p && fin(v) && t0[i] > 0 ? v / t0[i] : null)));
    const ok = clean(y).length >= 2 * period && sf.every(v => fin(v) && v > 0);
    const m = ok ? mean(sf) : 1, s = ok ? sf.map(v => v / m) : Array(period).fill(1);
    const d = y.map((v, i) => (fin(v) ? v / s[i % period] : null));
    return y.map((_, i) => { const w = []; for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) if (j !== i && fin(d[j])) w.push(d[j]); return w.length >= 3 ? s[i % period] * median(w) : null; });
  }
  /** P(Y ≤ y) ของ negative binomial (ค่าเฉลี่ย mu, Var = mu + κ·mu²) ; κ = 0 → Poisson */
  /** trigamma ψ′(x) (x > 0): recurrence ขึ้นไปถึง x ≥ 6 แล้วใช้ asymptotic series */
  function trigamma(x) {
    let r = 0; while (x < 6) { r += 1 / (x * x); x += 1; }
    const x2 = 1 / (x * x);
    return r + 1 / x + x2 / 2 + (1 / x) * x2 * (1 / 6 - x2 * (1 / 30 - x2 * (1 / 42 - x2 / 30)));
  }
  function nbCdf(y, mu, kappa) {
    if (y < 0) return 0;
    if (!(kappa > 1e-8)) return 1 - gammaP(y + 1, mu);
    const r = 1 / kappa; return ibeta(r / (r + mu), r, y + 1);
  }
  function nbLogPmf(y, mu, kappa) {
    if (!(kappa > 1e-8)) return y * Math.log(mu) - mu - lgamma(y + 1);
    const r = 1 / kappa; return lgamma(y + r) - lgamma(r) - lgamma(y + 1) + r * Math.log(r / (r + mu)) + y * Math.log(mu / (r + mu));
  }
  /** ค่า z (ปกติมาตรฐาน) ที่ให้ p สองด้านเท่ากัน ; p เล็กมากใช้ค่าประมาณเชิงเส้นกำกับ เพดาน 40 */
  function zOfP(p) { if (!(p > 0)) return 40; if (p > 1e-12) return normInv(1 - p / 2); const L = -2 * Math.log(p / 2); return Math.min(40, Math.sqrt(L - Math.log(L) - Math.log(2 * Math.PI))); }
  /** p สองด้านของจำนวนนับ y เมื่อคาดไว้ mu (NB) */
  function nbTwoSided(y, mu, kappa) { return Math.min(1, 2 * Math.min(nbCdf(y, mu, kappa), 1 - nbCdf(y - 1, mu, kappa))); }
  /** ค่าตั้งของตัวหาค่าผิดปกติ — ปรับด้วยการจำลอง (tests/unit/stats.test.js, docs ในรายงาน):
     ข้อมูลปกติ 60 วันแบบ Poisson / negative binomial / ระดับลอยแบบ AR(1) ต้องเตือนผิดเฉลี่ย ≤ 0.2 วันต่อ 60 วัน */
  const ANOM = { alpha: 0.0005, kappaInflate: 1.3, trim: 0.01, robustZ: 5, h: 7, alphaGlobal: 0.01, kappaLL: 0.5 };
  /** หาค่าผิดปกติ: [{ i, value, expected, z, p, dir: "up"|"down", method }]
     ต้องผ่านทั้งเกณฑ์สถิติและเกณฑ์ปฏิบัติ (ต่างจากค่าที่คาด ≥ minRel)
     - จำนวนนับ (จำนวนเต็มไม่ติดลบ เช่น คนเข้าร้าน บิล): ค่าคาดแบบ leave-one-out แล้วทดสอบด้วย negative binomial
       κ (ความผันผวนเกิน Poisson) ประมาณด้วย maximum likelihood โดยตัดจุดที่สุดโต่งออก (วนซ้ำ 3 รอบ) แล้วเผื่อ ×1.3 เพราะ κ จากข้อมูล 60 วันคลาดเคลื่อนได้มาก
       เตือนเมื่อ p สองด้าน < 0.0005 — ทั้งชุดราว 60 วัน จึงคาดว่าเตือนผิด ≈ 0.03–0.15 วัน แม้ข้อมูลแกว่งเกิน Poisson หรือระดับลอยต่อเนื่อง
     - ค่าต่อเนื่อง (เช่น ยอดเงิน): modified z ของส่วนเหลือ (MAD) ≥ 5 ; z ที่คืนเป็นค่าเทียบเท่าปกติของ p ทั้งสองแบบ */
  function anomalies(y, { period = 7, minN = 10, minRel = 0.25, alpha = ANOM.alpha } = {}) {
    const c = clean(y); if (c.length < minN) return [];
    const exp = looExpected(y, period, ANOM.h);
    const idx = y.map((v, i) => (fin(v) && fin(exp[i]) ? i : -1)).filter(i => i >= 0);
    if (idx.length < minN) return [];
    const isCount = c.every(v => v >= 0 && Math.abs(v - Math.round(v)) < 1e-9);
    const out = [], push = (i, p, z, extra) => { const d = y[i] - exp[i]; out.push({ i, value: y[i], expected: exp[i], z, p, dir: d > 0 ? "up" : "down", ...extra }); };
    const relOk = i => { const d = y[i] - exp[i]; return Math.abs(d) > 1e-9 && !(minRel > 0 && Math.abs(exp[i]) > 0 && Math.abs(d) / Math.abs(exp[i]) < minRel); };
    if (isCount) {
      // ค่าคาดสองแบบ: ใกล้เคียง (±h วัน) และทั้งชุด (ฤดูกาล × ค่ากลางทั้งหมด) — ต้องผิดปกติทั้งสองแบบ
      // (กันกรณีระดับแถบใกล้เคียงต่ำหรือสูงชั่วคราวจนวันธรรมดาดูโดดเด่น และกันระดับที่ลอยช้า ๆ ทั้งชุด)
      const eL = exp.map(v => (fin(v) ? Math.max(0.5, v) : null)), eG = looExpected(y, period, y.length).map(v => (fin(v) ? Math.max(0.5, v) : null));
      const fitKappa = e => {
        let use = idx, kappa = 0;
        for (let rep = 0; rep < 3; rep++) {
          const ll = k => use.reduce((s, i) => s + nbLogPmf(y[i], e[i], k), 0);
          let a = 0, b = 3; const g = 0.6180339887;
          for (let it = 0; it < 40; it++) { const c1 = b - g * (b - a), c2 = a + g * (b - a); if (ll(c1) < ll(c2)) a = c1; else b = c2; }
          kappa = (a + b) / 2; if (ll(0) >= ll(kappa)) kappa = 0;
          const k0 = kappa, next = idx.filter(i => nbTwoSided(y[i], e[i], k0) >= ANOM.trim);
          if (next.length < minN) break; use = next;
        }
        // ขอบบนของ κ จาก profile likelihood (ลดลง ANOM.kappaLL) — เผื่อความคลาดเคลื่อนของ κ ที่ประมาณจากข้อมูลไม่กี่สิบวัน
        const ll = k => use.reduce((s, i) => s + nbLogPmf(y[i], e[i], k), 0), top = ll(kappa);
        let lo = kappa, hi = kappa + 0.05; while (hi < 5 && ll(hi) > top - ANOM.kappaLL) { lo = hi; hi *= 2; }
        for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (ll(m) > top - ANOM.kappaLL) lo = m; else hi = m; }
        return Math.max(kappa * ANOM.kappaInflate, lo);
      };
      const kL = fitKappa(eL), kG = fitKappa(eG);
      idx.forEach(i => {
        if (!relOk(i)) return;
        const p = nbTwoSided(y[i], eL[i], kL); if (!(p < alpha)) return;
        const pG = nbTwoSided(y[i], eG[i], kG); if (!(pG < ANOM.alphaGlobal) || Math.sign(y[i] - eG[i]) !== Math.sign(y[i] - eL[i])) return;
        push(i, p, Math.sign(y[i] - eL[i]) * zOfP(p), { kappa: kL, pGlobal: pG, method: "negbin-loo" });
      });
    } else {
      const res = idx.map(i => y[i] - exp[i]), m = median(res), s = 1.4826 * median(res.map(r => Math.abs(r - m)));
      if (!(s > 0)) return [];
      idx.forEach((i, k) => { const z = (res[k] - m) / s; if (Math.abs(z) < ANOM.robustZ || !relOk(i)) return; push(i, 2 * normSf(Math.abs(z)), z, { method: "robust-z-loo" }); });
    }
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
  /** @param {number[]} y @param {number} m @param {number} a @param {number} b @param {number} g @param {boolean[] | null} [obs] วันที่สังเกตจริง (null = ทุกวัน) */
  function hwRun(y, m, a, b, g, obs = null) {
    const s1 = y.slice(0, m), s2 = y.slice(m, 2 * m), m1 = mean(s1), m2 = mean(s2);
    let T = (m2 - m1) / m, L = m1 + T * (m - 1) / 2;
    const S = s1.map((v, i) => v - (m1 + T * (i - (m - 1) / 2)));
    let sse = 0, cnt = 0; const fitted = Array(y.length).fill(null);
    for (let t = m; t < y.length; t++) {
      const f = L + T + S[t - m]; fitted[t] = f;
      const e = y[t] - f; if (!obs || obs[t]) { sse += e * e; cnt++; } // วันที่เติมค่าแทน (ไม่ได้วัด) ไม่นับใน SSE / σ
      const Ln = a * (y[t] - S[t - m]) + (1 - a) * (L + T);
      T = b * (Ln - L) + (1 - b) * T;
      S[t] = g * (y[t] - Ln) + (1 - g) * S[t - m];
      L = Ln;
    }
    return { L, T, S, sse, cnt, fitted };
  }
  /** Holt-Winters แบบบวก — y ต้องไม่มี null และยาว ≥ 2m */
  /** @param {number[]} y @param {number} [m] @param {number} [h] @param {{ conf?: number, nonneg?: boolean, obs?: boolean[] | null }} [o] */
  function holtWinters(y, m = 7, h = 7, { conf = 0.8, nonneg = true, obs = null } = {}) {
    if (!Array.isArray(y) || y.length < 2 * m || y.some(v => !fin(v))) return null;
    let best = null;
    for (const a of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) for (const b of [0, 0.02, 0.05, 0.1, 0.2]) for (const g of [0.05, 0.1, 0.2, 0.4, 0.6]) {
      const r = hwRun(y, m, a, b, g, obs);
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
  /** พยากรณ์ h ช่วงข้างหน้า เลือกวิธีตามความยาวข้อมูล ; ไม่มีข้อมูล = null
     ข้อมูลสั้น (< 3 สัปดาห์) ช่วงพยากรณ์เดิมแคบเกิน: ช่วง 80% ครอบค่าจริงเพียง ~72% ที่ 10 วัน ~77% ที่ 14 วัน และแย่ลงเมื่อมีวันขาด
     (วันที่ขาดถูกเติมด้วย median → ส่วนต่างรายสัปดาห์เล็กลงหลอก ๆ → σ ต่ำไป) ; รุ่น 3.3 (round 10):
       - seasonal naive: σ จากคู่ (วันนี้, 7 วันก่อน) ที่วัดจริงทั้งคู่เท่านั้น (k คู่) และใช้ t_{k−1} แทน z (k < 3 → ใช้วิธีค่าเฉลี่ย) ;
         ค่าที่ใช้คาดเป็นของวันในสัปดาห์เดียวกันล่าสุดที่วัดจริง (ย้อนไปกี่สัปดาห์ ความกว้าง × √จำนวนสัปดาห์นั้น)
       - ค่าเฉลี่ย (< 9 วัน): t_{n−1} · sd · √(1 + 1/n) จากวันที่วัดจริง
       - Holt-Winters: SSE / σ นับเฉพาะวันที่วัดจริง
     ช่วงของข้อมูลสั้นยังเป็น “ค่าคร่าว ๆ” (rough: true → กราฟวาดเส้นประ) ; ตรวจ coverage ด้วยการจำลองใน tests/unit/stats.test.js
     ผลเดิม (ช่วงแบบ z) เก็บไว้ใน loNaive / hiNaive */
  function forecast(y, h = 7, { period = 7, conf = 0.8, nonneg = true } = {}) {
    const c = clean(y); if (!c.length) return null;
    const obs = y.map(fin), med = median(c) || 0, yy = y.map(v => fin(v) ? v : med);
    if (yy.length >= 3 * period) { const r = holtWinters(yy, period, h, { conf, nonneg, obs: obs.every(Boolean) ? null : obs }); if (r) return { ...r, enough: true, rough: false, n: yy.length, observed: c.length }; }
    const z = zCrit(conf), clip = v => nonneg ? Math.max(0, v) : v, n = yy.length;
    if (n >= period + 2) { // seasonal naive
      const e = []; for (let i = period; i < n; i++) if (obs[i] && obs[i - period]) e.push(yy[i] - yy[i - period]);
      const k = e.length, s0 = Math.sqrt(mean(yy.slice(period).map((v, i) => (v - yy[i]) ** 2)) || 0);
      if (k >= 3) {
        // t_{k−1}: one df is lost because consecutive weekly differences share a day (corr −½). The extra ×√(k/(k−1)) was tried
        // too and over-covers (89% at 10 days for an 80% band) — see the coverage table in docs/STATS.md
        const s = Math.sqrt(mean(e.map(x => x * x)) || 0), sAdj = s, t = tCrit(k - 1, conf);
        const mean_ = [], lo = [], hi = [], loN = [], hiN = [];
        for (let j = 1; j <= h; j++) {
          let src = n - period + ((j - 1) % period), back = Math.ceil(j / period);
          while (src >= 0 && !obs[src]) { src -= period; back++; }
          const f = src >= 0 ? yy[src] : med, w = (src >= 0 ? t * sAdj * Math.sqrt(back) : t * (sd(c) || sAdj) * Math.sqrt(1 + 1 / c.length));
          const fN = yy[n - period + ((j - 1) % period)], wN = z * s0 * Math.sqrt(Math.ceil(j / period));
          mean_.push(clip(f)); lo.push(clip(f - w)); hi.push(f + w); loN.push(clip(fN - wN)); hiN.push(fN + wN);
        }
        return { method: "seasonal-naive", mean: mean_, lo, hi, loNaive: loN, hiNaive: hiN, sigma: sAdj, sigmaNaive: s0, df: k - 1, enough: false, rough: true, n, observed: c.length, conf };
      }
    }
    const m = mean(c), s = sd(c) || 0, w = c.length >= 2 ? tCrit(c.length - 1, conf) * s * Math.sqrt(1 + 1 / c.length) : 0, w0 = z * (sd(yy) || 0);
    return { method: "mean", mean: Array(h).fill(clip(m)), lo: Array(h).fill(clip(m - w)), hi: Array(h).fill(m + w), loNaive: Array(h).fill(clip(mean(yy) - w0)), hiNaive: Array(h).fill(mean(yy) + w0), sigma: s, df: c.length - 1, enough: false, rough: true, n, observed: c.length, conf };
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
      lo = Math.tanh(zf - zc * se); hi = Math.tanh(zf + zc * se); p = 2 * normSf(Math.abs(zf) / se);
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
  /* ---------- A/B หลายตัวเลือก: omnibus ก่อน แล้วค่อยเทียบรายคู่ (ทุกคู่) ปรับด้วย Holm ----------
     ทำไม: เลือก “ดีสุด vs แย่สุด” หลังเรียงลำดับแล้วทดสอบตรง ๆ = เลือกคู่ที่ห่างที่สุดเอง ; โฆษณา 6 ชิ้นที่ได้ผลเท่ากันจริง
     จะได้ p < 0.05 ราว 38% ของครั้ง ; แบบนี้คุมโอกาสสรุปผิดอย่างน้อยหนึ่งคู่ (family-wise) ไม่เกิน 5% (tests/unit/stats.test.js) */
  /** regularized lower incomplete gamma P(a, x) */
  function gammaP(a, x) {
    if (!(x > 0)) return 0;
    const gln = lgamma(a);
    if (x < a + 1) { let ap = a, s = 1 / a, d = s; for (let i = 0; i < 500; i++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-15) break; } return Math.min(1, s * Math.exp(-x + a * Math.log(x) - gln)); }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
    return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - gln) * h);
  }
  const chi2Sf = (x, df) => (x > 0 ? 1 - gammaP(df / 2, x / 2) : 1);
  const fSf = (F, d1, d2) => (F > 0 ? 1 - ibeta(d1 * F / (d1 * F + d2), d1 / 2, d2 / 2) : 1);
  /** chi-square test of homogeneity (k กลุ่ม × สำเร็จ/ไม่สำเร็จ) ; ค่าคาดหวังบางช่อง < 5 → Monte Carlo permutation (seed จากข้อมูล ผลซ้ำได้) */
  function chiSqHomog(G, { reps = 4000 } = {}) {
    const N = sum(G.map(g => g.n)), X = sum(G.map(g => g.x)), pb = X / N, k = G.length;
    if (k < 2 || !(pb > 0 && pb < 1)) return { stat: 0, df: k - 1, p: 1, method: "chi-square" };
    const stat = xs => sum(G.map((g, i) => (xs[i] - g.n * pb) ** 2 / (g.n * pb * (1 - pb))));
    const s0 = stat(G.map(g => g.x));
    const small = G.some(g => g.n * pb < 5 || g.n * (1 - pb) < 5);
    if (!small || N > 20000) return { stat: s0, df: k - 1, p: chi2Sf(s0, k - 1), method: "chi-square" };
    let seed = 2166136261; G.forEach(g => { seed = Math.imul(seed ^ g.x, 16777619); seed = Math.imul(seed ^ g.n, 16777619); });
    const R = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let ge = 0;
    for (let r = 0; r < reps; r++) {
      let left = X, rest = N; const xs = G.map(g => { let x = 0; for (let j = 0; j < g.n; j++) { if (R() < left / rest) { x++; left--; } rest--; } return x; });
      if (stat(xs) >= s0 - 1e-9) ge++;
    }
    return { stat: s0, df: k - 1, p: (ge + 1) / (reps + 1), method: "permutation" };
  }
  /** Welch one-way ANOVA (ไม่ถือว่าความแปรปรวนเท่ากัน) ; k = 2 เท่ากับ Welch t */
  function welchAnova(G) {
    const k = G.length; if (k < 2) return null;
    const st = G.map(g => { const v = clean(g.values), n = v.length, m = mean(v), s2 = sd(v) ** 2; return { n, m, s2 }; });
    if (st.some(x => x.n < 2)) return null;
    if (st.every(x => !(x.s2 > 0))) { const same = st.every(x => x.m === st[0].m); return { stat: same ? 0 : Infinity, df1: k - 1, df2: Infinity, p: same ? 1 : 0, method: "welch-anova" }; }
    const pooled = sum(st.map(x => (x.n - 1) * x.s2)) / sum(st.map(x => x.n - 1));
    const w = st.map(x => x.n / Math.max(x.s2, pooled * 1e-6)), W = sum(w), mw = sum(st.map((x, i) => w[i] * x.m)) / W;
    const A = sum(st.map((x, i) => w[i] * (x.m - mw) ** 2)) / (k - 1);
    const lam = sum(st.map((x, i) => (1 - w[i] / W) ** 2 / (x.n - 1)));
    const B = 1 + 2 * (k - 2) / (k * k - 1) * lam, F = A / B, df2 = (k * k - 1) / (3 * lam);
    return { stat: F, df1: k - 1, df2, p: Math.min(1, fSf(F, k - 1, df2)), method: "welch-anova" };
  }
  /** รวม omnibus + ทุกคู่ (Holm) ; pair(a, b, conf) คืน { diff, lo, hi, p } ; ช่วงความเชื่อมั่นรายคู่ปรับแบบ Bonferroni (ช่วงร่วม 95%)
     ค่า p ที่ใช้ตัดสิน (pAdj) = max(p หลัง Holm, p ของ omnibus) → สรุปว่าต่างได้เมื่อผ่านทั้งสองขั้น (protected Holm) */
  function abPairs(ok, omni, pair) {
    const P = [], m = ok.length * (ok.length - 1) / 2, confB = 1 - 0.05 / Math.max(1, m);
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) { const t = pair(ok[i], ok[j], confB); if (t) P.push({ a: ok[i].id, b: ok[j].id, ...t }); }
    const holm = adjustP(P.map(t => t.p), "holm");
    P.forEach((t, i) => { t.pRaw = t.p; t.pHolm = holm[i]; t.pAdj = Math.min(1, Math.max(holm[i], omni ? omni.p : 1)); t.p = t.pAdj; t.ciConf = confB; t.adjust = "omnibus+holm"; t.pairs = m; });
    return P;
  }
  const findPair = (P, a, b) => { if (!a || !b) return null; const t = P.find(x => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id)); if (!t) return null; return t.a === a.id ? t : { ...t, a: t.b, b: t.a, diff: -t.diff, lo: -t.hi, hi: -t.lo }; };
  /** A/B ของอัตรา: groups = [{ id, name, x, n }] → ทุกกลุ่มมี Wilson (ดิบ) และ eb (ค่าหลัง shrinkage + ช่วง 95%)
     จัดอันดับด้วยค่าหลัง shrinkage ; กลุ่มที่ n < minN แสดงแต่ไม่จัดอันดับ/ไม่ทดสอบ
     omnibus = chi-square (หรือ permutation เมื่อค่าคาดหวังน้อย) ; test = best vs runner-up, spread = best vs worst (ค่า p = pAdj) */
  function abRates(groups, { minN = 30 } = {}) {
    const G0 = (groups || []).filter(g => g && g.n > 0 && g.x >= 0 && g.x <= g.n).map((g, i) => ({ ...g, id: g.id != null ? g.id : g.name != null ? g.name : i })), E = ebBinom(G0);
    const G = G0.map((g, i) => ({ ...g, ci: wilson(g.x, g.n), eb: { p: E.groups[i].shrunk, lo: E.groups[i].lo, hi: E.groups[i].hi, weight: E.groups[i].weight }, enough: g.n >= minN }));
    const order = (a, b) => b.eb.p - a.eb.p || b.ci.p - a.ci.p;
    const ok = G.filter(g => g.enough).sort(order);
    const omnibus = ok.length >= 2 ? chiSqHomog(ok) : null;
    const pairs = ok.length >= 2 ? abPairs(ok, omnibus, (a, b, c) => twoProp(a.x, a.n, b.x, b.n, c)) : [];
    const res = { groups: G.sort(order), prior: { mean: E.mean, M: E.M }, best: ok[0] || null, runner: ok[1] || null, worst: ok.length > 1 ? ok[ok.length - 1] : null, test: null, spread: null, omnibus, pairs, minN, enough: ok.length >= 2, few: G.filter(g => !g.enough).length };
    res.test = findPair(pairs, res.best, res.runner); res.spread = findPair(pairs, res.best, res.worst);
    return res;
  }
  /** A/B ของค่าเฉลี่ย: groups = [{ id, name, values }] ; ต้องมีอย่างน้อย minN ค่าต่อกลุ่ม (ค่าเริ่มต้น 10) จึงจัดอันดับ/ให้ระดับความมั่นใจ
     omnibus = Welch ANOVA ; รายคู่ = Welch t + Holm */
  function abMeans(groups, { minN = 10 } = {}) {
    const G = (groups || []).map((g, i) => ({ ...g, id: g.id != null ? g.id : g.name != null ? g.name : i, ci: meanCI(g.values), n: clean(g.values).length })).filter(g => g.ci);
    G.forEach(g => { g.enough = g.n >= minN; });
    // se ของแต่ละกลุ่ม: กลุ่มที่มี 1 ค่า หรือ sd = 0 ใช้ sd รวมภายในกลุ่ม (pooled)
    const within = G.filter(g => g.n >= 2), dfw = sum(within.map(g => g.n - 1));
    const sp = dfw > 0 ? Math.sqrt(sum(within.map(g => (g.n - 1) * (sd(g.values) || 0) ** 2)) / dfw) : null;
    const E = ebNormal(G.map(g => { const s = sd(g.values); return { mean: g.ci.mean, se: (g.n >= 2 && s > 0 ? s : sp || 0) / Math.sqrt(g.n) }; }));
    G.forEach((g, i) => { g.eb = { mean: E.groups[i].shrunk, weight: E.groups[i].weight }; });
    G.sort((a, b) => b.eb.mean - a.eb.mean || b.ci.mean - a.ci.mean);
    const ok = G.filter(g => g.enough), omnibus = ok.length >= 2 ? welchAnova(ok) : null;
    const pairs = ok.length >= 2 ? abPairs(ok, omnibus, (a, b, c) => welch(a.values, b.values, c)) : [];
    const res = { groups: G, prior: { mean: E.mu, tau2: E.tau2 }, best: ok[0] || null, runner: ok[1] || null, worst: ok.length > 1 ? ok[ok.length - 1] : null, test: null, spread: null, omnibus, pairs, minN, enough: ok.length >= 2, few: G.filter(g => !g.enough).length };
    res.test = findPair(pairs, res.best, res.runner); res.spread = findPair(pairs, res.best, res.worst);
    return res;
  }

  /* ---------- เทียบจำนวนนับรายวันแบบเผื่อความผันผวนเกิน Poisson (overdispersion) ---------- */
  /** แก้ระบบสมการ A x = b (A สมมาตรบวกแน่นอน ขนาดเล็ก) ด้วย Gaussian elimination + partial pivoting ; เอกฐาน = null */
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.slice().concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (!(Math.abs(M[p][c]) > 1e-12)) return null;
      if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
    return x;
  }
  /** log-linear GLM (IRLS) ของจำนวนนับ: log μ = off + Xβ ; ความแปรปรวน V(μ) = μ(1 + κμ) (κ = 0 → Poisson, κ > 0 → negative binomial)
     คืน { beta, mu, info (X'WX ที่ W = μ/(1+κμ)), chi2 (Pearson ภายใต้ V), df } ; เอกฐาน = null */
  function poissonGLM(y, off, X, kappa = 0, start = null) {
    const n = y.length, p = X[0].length, rate = sum(y) / sum(off.map(Math.exp)) || 1;
    let mu = start ? start.slice() : y.map((v, i) => (v + rate * Math.exp(off[i])) / 2 + 0.1), beta = null;
    const infoAt = m => {
      const I = Array.from({ length: p }, () => Array(p).fill(0));
      for (let i = 0; i < n; i++) { const xi = X[i], w = m[i] / (1 + kappa * m[i]); for (let a = 0; a < p; a++) if (xi[a]) for (let b = 0; b < p; b++) if (xi[b]) I[a][b] += xi[a] * w * xi[b]; }
      return I;
    };
    for (let it = 0; it < 60; it++) {
      const XtWX = infoAt(mu), XtWz = Array(p).fill(0);
      for (let i = 0; i < n; i++) {
        const w = mu[i] / (1 + kappa * mu[i]), z = Math.log(mu[i]) - off[i] + (y[i] - mu[i]) / mu[i], xi = X[i];
        for (let a = 0; a < p; a++) if (xi[a]) XtWz[a] += xi[a] * w * z;
      }
      const nb = solve(XtWX, XtWz); if (!nb) return null;
      const d = beta ? Math.max(...nb.map((v, k) => Math.abs(v - beta[k]))) : Infinity;
      beta = nb;
      mu = X.map((xi, i) => Math.max(1e-10, Math.exp(Math.min(700, off[i] + xi.reduce((s, v, k) => s + v * beta[k], 0)))));
      if (d < 1e-9) break;
    }
    let chi2 = 0; for (let i = 0; i < n; i++) chi2 += (y[i] - mu[i]) ** 2 / (mu[i] * (1 + kappa * mu[i]));
    return { beta, mu, info: infoAt(mu), chi2, df: n - p, kappa };
  }
  /** negative binomial (NB2) GLM: สลับประมาณ β และ κ ; κ จาก Pearson moment equation Σ (y−μ)²/(μ(1+κμ)) = n − p */
  function nbGLM(y, off, X) {
    let fit = poissonGLM(y, off, X, 0); if (!fit || fit.df < 1) return fit;
    let kappa = 0;
    for (let it = 0; it < 8; it++) {
      const f = k => { let s = 0; for (let i = 0; i < y.length; i++) s += (y[i] - fit.mu[i]) ** 2 / (fit.mu[i] * (1 + k * fit.mu[i])); return s - fit.df; };
      let kn = 0;
      if (f(0) > 0) { let lo = 0, hi = 1; while (f(hi) > 0 && hi < 1e4) hi *= 4; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } kn = (lo + hi) / 2; }
      const nf = poissonGLM(y, off, X, kn, fit.mu); if (!nf) break;
      const done = Math.abs(kn - kappa) <= 1e-6 + 1e-4 * kappa; fit = nf; kappa = kn; if (done) break;
    }
    return fit;
  }
  /* ---------- ความคลาดเคลื่อนที่ต่อเนื่องกันหลายวัน (ระดับที่ค่อย ๆ ลอยขึ้นลง) ---------- */
  /** แปลงข้อมูลด้วย Kalman filter ของแบบจำลอง e_t = x_t + ε_t ; x_t = φ x_{t−1} + η_t (AR(1) + noise = ARMA(1,1))
     Var(ε_t) = σ²·h_t , Var(η) = σ²·q ; t = เลขวัน (วันที่ขาดหายไปถูกข้ามอย่างถูกต้อง, วันเดียวกันซ้ำได้)
     คืน innovations มาตรฐานของ z และทุกคอลัมน์ของ X (= GLS เมื่อนำไปทำ OLS) + Σ log F */
  function arWhiten(z, X, t, h, phi, q) {
    const p = X[0].length, ord = t.map((_, i) => i).sort((a, b) => t[a] - t[b] || a - b);
    const a = Array(p + 1).fill(0); let P = q > 0 ? q / (1 - phi * phi) : 0, last = null, logF = 0;
    const Xt = [], zt = [];
    for (const i of ord) {
      if (last != null) for (let s = last; s < t[i]; s++) { for (let k = 0; k <= p; k++) a[k] *= phi; P = phi * phi * P + q; }
      last = t[i];
      const F = P + h[i], K = P / F, sf = Math.sqrt(F), row = Array(p);
      for (let k = 0; k < p; k++) { const v = X[i][k] - a[k]; row[k] = v / sf; a[k] += K * v; }
      const v = z[i] - a[p]; zt.push(v / sf); a[p] += K * v; Xt.push(row);
      P *= 1 - K; logF += Math.log(F);
    }
    return { Xt, zt, logF };
  }
  /** OLS พร้อม X'X, RSS และ log|X'X| (ใช้กับข้อมูลที่ผ่าน arWhiten แล้ว) */
  function olsFit(X, y) {
    const p = X[0].length, M = Array.from({ length: p }, () => Array(p).fill(0)), b = Array(p).fill(0);
    X.forEach((x, i) => { for (let a = 0; a < p; a++) { if (!x[a]) continue; b[a] += x[a] * y[i]; for (let c = 0; c < p; c++) M[a][c] += x[a] * x[c]; } });
    const beta = solve(M, b); if (!beta) return null;
    let rss = 0; X.forEach((x, i) => { let f = 0; for (let k = 0; k < p; k++) f += x[k] * beta[k]; rss += (y[i] - f) ** 2; });
    const L = M.map(r => r.slice()); let logdet = 0;
    for (let c = 0; c < p; c++) {
      let pv = c; for (let r = c + 1; r < p; r++) if (Math.abs(L[r][c]) > Math.abs(L[pv][c])) pv = r;
      if (!(Math.abs(L[pv][c]) > 1e-12)) return null;
      if (pv !== c) { const tmp = L[pv]; L[pv] = L[c]; L[c] = tmp; }
      logdet += Math.log(Math.abs(L[c][c]));
      for (let r = c + 1; r < p; r++) { const f = L[r][c] / L[c][c]; if (f) for (let k = c; k < p; k++) L[r][k] -= f * L[c][k]; }
    }
    return { beta, rss, M, logdet };
  }
  const KURT_SHARE = 1 / 3;
  /* ค่าตั้งของ AR model averaging — ปรับเทียบรอบ 10 (docs/STATS.md ตาราง type I / power): P0 = น้ำหนัก prior ของแบบไม่มีส่วนลอย,
     AR_DF = กฎ df ("step" = df0(1−φ)/(1+φ) เมื่อส่วนลอย ≥ 10% ; "satt" Satterthwaite ; "rho" φ·share) — ทางเลือกที่ให้ power สูงกว่า
     ทุกแบบทำให้ผลบวกลวงเมื่อระดับลอยจริงสูงขึ้น (6–10%) จึงคงค่าเดิมเป็นค่าเริ่มต้น ; ส่งผ่าน options ของ countCompare ได้ */
  const AR_P0 = 0.2, AR_DF = "step";
  const AR_PHI = [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.98], AR_Q = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3];
  /** contrast c'β ของ regression ที่ความคลาดเคลื่อนเป็น AR(1) + noise — REML บน grid ของ (φ, q) แล้วเฉลี่ยแบบถ่วงด้วย likelihood
     (model averaging เผื่อความไม่แน่นอนของ φ ซึ่งประมาณได้ไม่แม่นจากข้อมูลไม่กี่สิบวัน)
     แต่ละแบบใช้ df = (n − p)(1 − φ)/(1 + φ) เมื่อส่วนที่ลอยต่อเนื่องมีน้ำหนัก ≥ 10% (ข้อมูลอิสระมีน้อยกว่าจำนวนวัน)
     q = 0 คือไม่มีส่วนต่อเนื่อง → เท่ากับ weighted least squares ธรรมดา ; floorVar = ความแปรปรวนต่ำสุดที่ยอม (เช่น Poisson)
     คืน { est, se, df, p, phi (ถ่วงน้ำหนัก), share (สัดส่วนความแปรปรวนจากส่วนต่อเนื่อง), weights } */
  function arContrast(z, X, t, h, cvec, { floorVar = 0, phis = AR_PHI, qs = AR_Q, conf = 0.95, vMult = 1, dfMult = 1, p0 = AR_P0, dfRule = AR_DF } = {}) {
    const n = z.length, p = X[0].length, df0 = n - p; if (df0 < 2) return null;
    /** @type {Array<{ ll: number, q: number, ph: number, share: number, est: number, v: number, df: number, w?: number }>} */
    const fits = [];
    // c'(X'H⁻¹X)⁻¹c ของแบบไม่มีส่วนต่อเนื่อง (noise ล้วน) — ใช้แยกความแปรปรวนของ contrast เป็นส่วน noise กับส่วนที่ลอย (dfRule "satt")
    let cu0 = null;
    if (dfRule === "satt") { const W0 = arWhiten(z, X, t, h, 0, 0), o0 = olsFit(W0.Xt, W0.zt), u0 = o0 && solve(o0.M, cvec); if (u0) cu0 = cvec.reduce((s, c, k) => s + c * u0[k], 0); }
    for (const q of qs) for (const ph of (q === 0 ? [0] : phis)) {
      const W = arWhiten(z, X, t, h, ph, q), o = olsFit(W.Xt, W.zt); if (!o || !(o.rss > 0)) continue;
      const u = solve(o.M, cvec); if (!u) continue;
      const s2 = o.rss / df0, cu = cvec.reduce((s, c, k) => s + c * u[k], 0), v = Math.max(floorVar, s2 * cu) * vMult;
      const share = q > 0 ? (q / (1 - ph * ph)) / (q / (1 - ph * ph) + 1) : 0;
      const dfAr = Math.max(4, df0 * (1 - ph) / (1 + ph));
      let dfm;
      if (dfRule === "satt" && cu0 != null && q > 0) {
        // Satterthwaite: ส่วน noise (df0) + ส่วนที่ลอย (df น้อยตามความต่อเนื่อง) ; ส่วนที่ลอยน้อย → df ≈ df0 , ส่วนที่ลอยครอบงำ → df ≈ แบบเดิม
        const vt = s2 * cu, vn = Math.min(vt, s2 * cu0), va = vt - vn;
        dfm = vt > 0 ? (vt * vt) / (va * va / dfAr + vn * vn / df0) : df0;
      } else { const r1 = dfRule === "rho" ? ph * share : (share >= 0.1 ? ph : 0); dfm = Math.max(4, df0 * (1 - r1) / (1 + r1)); }
      fits.push({ ll: -0.5 * (df0 * Math.log(o.rss) + W.logF + o.logdet), q, ph, share, est: cvec.reduce((s, c, k) => s + c * o.beta[k], 0), v, df: Math.max(3, Math.max(4, dfm) * dfMult) });
    }
    if (!fits.length) return null;
    const top = Math.max(...fits.map(f => f.ll)); let ws = 0;
    // prior: ครึ่งหนึ่งให้แบบไม่มีส่วนต่อเนื่อง (q = 0) อีกครึ่งกระจายเท่ากันในแบบที่มี (φ, q) — ไม่ให้จำนวนช่องใน grid ตัดสินแทนข้อมูล
    const nAr = fits.filter(f => f.q > 0).length || 1, P0 = p0;
    fits.forEach(f => { f.w = Math.exp(f.ll - top) * (f.q > 0 ? (1 - P0) / nAr : P0); ws += f.w; });
    fits.forEach(f => { f.w /= ws; });
    // p = ค่าเฉลี่ยถ่วงน้ำหนักของ p ของแต่ละแบบ ; ช่วงความเชื่อมั่น = ค่า δ ที่ p เฉลี่ยของ H0: c'β = δ เท่ากับ 1 − conf (สอดคล้องกับ p เสมอ)
    const pAt = d0 => sum(fits.map(f => f.w * 2 * (1 - tCdf(Math.abs(f.est - d0) / Math.sqrt(f.v), f.df))));
    const best = fits.reduce((a, b) => (b.w > a.w ? b : a)), est = best.est, alpha = 1 - conf;
    const spread = 50 * Math.max(...fits.map(f => Math.sqrt(f.v))) + Math.max(...fits.map(f => Math.abs(f.est - est)));
    const edge = dir => { let lo = 0, hi = spread; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pAt(est + dir * m) > alpha) lo = m; else hi = m; } return est + dir * (lo + hi) / 2; };
    const df = sum(fits.map(f => f.w * f.df));
    return { est, lo: edge(-1), hi: edge(1), se: Math.sqrt(sum(fits.map(f => f.w * (f.v + (f.est - est) ** 2)))), df, p: Math.min(1, Math.max(0, pAt(0))), phi: sum(fits.map(f => f.w * f.ph)), share: sum(fits.map(f => f.w * f.share)), weights: fits.length };
  }

  /** เทียบอัตราเฉลี่ยต่อวันของสองช่วงจากจำนวนนับรายวัน — negative binomial (NB2) log-linear model + ความคลาดเคลื่อนต่อเนื่องหลายวัน
     days = [{ y: จำนวนนับ, e: สัดส่วนของวัน (1 = ทั้งวัน, วันนี้ < 1), wd: 0..6, g: "A" (ช่วงนี้) | "B" (ช่วงเทียบ) | อื่น ๆ (ประวัติ), t: เลขวัน (ไม่บังคับ ; ไม่มี = ลำดับในอาร์เรย์) }]
     แบบจำลอง: log μ_d = log e_d + ระดับของกลุ่ม (A / B / ประวัติ) + ผลของวันในสัปดาห์ ; Var(y) = μ(1 + κμ)
       1) NB GLM (IRLS, κ จาก Pearson moment equation) → working variate z = log μ̂ + (y − μ̂)/μ̂ น้ำหนัก μ/(1+κμ)
       2) ความคลาดเคลื่อนของ z = ระดับที่ลอยแบบ AR(1) + noise รายวัน (ยอดรายวันมักสูงหรือต่ำต่อเนื่องหลายวันตามฤดู อากาศ เศรษฐกิจ)
          ประมาณ (φ, q) ด้วย REML ผ่าน Kalman filter แล้วเฉลี่ยผลแบบถ่วงด้วย likelihood (arContrast) ; ไม่มีส่วนต่อเนื่อง → เท่ากับ NB GLM เดิม
       - ทำไมต้องเผื่อ: ถ้าระดับลอยแบบ AR(0.85) การทดสอบที่ถือว่าแต่ละวันเป็นอิสระบอก “ต่างชัด” ผิด 15–30% ของครั้ง ; แบบนี้อยู่ราว 2–7% (tests/unit/stats.test.js)
       - ความแปรปรวนต่ำสุด = ของ Poisson (ไม่ให้มั่นใจเกินการนับแบบสุ่มล้วน) ; t-test ที่ df ปรับตามข้อมูลอิสระ
     คืน { rate1, rate2 (ดิบ ต่อวัน), ratio, change (ดิบ), adjRatio, adjChange (ปรับวันในสัปดาห์), lo, hi (ช่วง 95% ของ adjChange),
           p, phi (quasi scale), kappa, df, ar: { phi, share }, wdAdj, n (= c1 + c2), c1, c2, e1, e2, method, enough } */
  function countCompare(days, { conf = 0.95, minDf = 4, arP0 = AR_P0, iid = false, dfRule = AR_DF, arPhis = null } = {}) {
    const D = (days || []).map((d, i) => d && { ...d, t: fin(d.t) ? d.t : i }).filter(d => d && fin(d.y) && d.y >= 0 && fin(d.e) && d.e > 0);
    const A = D.filter(d => d.g === "A"), B = D.filter(d => d.g === "B");
    if (!A.length || !B.length) return null;
    const c1 = sum(A.map(d => d.y)), c2 = sum(B.map(d => d.y)), e1 = sum(A.map(d => d.e)), e2 = sum(B.map(d => d.e));
    const rate1 = c1 / e1, rate2 = c2 / e2, ratio = rate2 > 0 ? rate1 / rate2 : null;
    const base = { rate1, rate2, ratio, change: ratio == null ? null : ratio - 1, c1, c2, e1, e2, n: c1 + c2, method: "negbin-ar1-gls" };
    if (c1 + c2 === 0) return { ...base, adjRatio: null, adjChange: null, lo: null, hi: null, p: 1, phi: 1, df: 0, wdAdj: false, enough: false };
    let all = A.concat(B, D.filter(d => d.g !== "A" && d.g !== "B").map(d => ({ ...d, g: "h" })));
    // กลุ่ม/วันในสัปดาห์ที่ยอดรวมเป็น 0 (เช่น ร้านปิดวันอาทิตย์) ค่า MLE ของ μ = 0 → ตัดวันเหล่านั้นออก (ไม่มีผลต่อการประมาณส่วนอื่น)
    const tot = (k, v) => sum(all.filter(d => d[k] === v).map(d => d.y));
    all = all.filter(d => tot("g", d.g) > 0 && tot("wd", d.wd) > 0);
    const groups = ["A", "B", "h"].filter(g => all.some(d => d.g === g));
    const wds = [...new Set(all.map(d => d.wd))].sort();
    const wdAdj = wds.length > 1 && wds.every(w => all.filter(d => d.wd === w).length >= 2) && all.length >= 14;
    const zeroSide = c1 === 0 || c2 === 0;
    const cols = groups.length + (wdAdj ? wds.length - 1 : 0);
    const X = all.map(d => { const r = Array(cols).fill(0); r[groups.indexOf(d.g)] = 1; if (wdAdj) { const k = wds.indexOf(d.wd); if (k > 0) r[groups.length + k - 1] = 1; } return r; });
    const y = all.map(d => d.y), off = all.map(d => Math.log(d.e));
    const fit = all.length > cols ? nbGLM(y, off, X) : null;
    const df = fit ? fit.df : 0, phiRaw = fit && df > 0 ? fit.chi2 / df : null, phi = Math.max(1, phiRaw || 1);
    if (zeroSide || !fit || !groups.includes("A") || !groups.includes("B")) {
      // ด้านหนึ่งเป็นศูนย์: exact conditional test บนจำนวนที่หารด้วย φ (quasi-likelihood scaling)
      const p = binomTest(Math.round(c1 / phi), Math.round((c1 + c2) / phi), e1 / (e1 + e2));
      return { ...base, adjRatio: ratio, adjChange: base.change, lo: null, hi: null, p, phi, df, wdAdj: false, enough: df >= minDf };
    }
    const ia = groups.indexOf("A"), ib = groups.indexOf("B"), cvec = Array(cols).fill(0); cvec[ia] = 1; cvec[ib] = -1;
    // ความแปรปรวนต่ำสุด: Poisson ล้วน (W = μ)
    const P0 = Array.from({ length: cols }, () => Array(cols).fill(0));
    X.forEach((x, i) => { for (let a = 0; a < cols; a++) if (x[a]) for (let b = 0; b < cols; b++) if (x[b]) P0[a][b] += x[a] * fit.mu[i] * x[b]; });
    const u0 = solve(P0, cvec), vPois = u0 ? cvec.reduce((s, c, k) => s + c * u0[k], 0) : 0;
    const kap = fit.kappa || 0, z = y.map((v, i) => Math.log(fit.mu[i]) - off[i] + (v - fit.mu[i]) / fit.mu[i]);
    const h0 = fit.mu.map(m => (1 + kap * m) / m), hm = mean(h0), h = h0.map(v => v / hm);
    // ปรับสำหรับตัวอย่างเล็กเมื่อยอดรายวันผันผวนมาก (κ สูง — เช่น NB k = 1/κ ≤ 1) สองข้อ:
    //  (ก) log ของยอดรวมแต่ละช่วงเบ้: Var[log ΣY] ≈ ψ′(a) (trigamma) ไม่ใช่ 1/a ที่ delta method ใช้ ; a = (Σμ)² / Σ μ(1+κμ) = “ขนาดตัวอย่างที่มีผล”
    //      ของช่วงนั้น → คูณความแปรปรวนด้วย a·ψ′(a) ถ่วงตามส่วนของแต่ละช่วง (a ใหญ่ → 1)
    //  (ข) ความแปรปรวนรายวันประมาณจากข้อมูลที่หางยาว (excess kurtosis ของ NB = 6κ + 1/(μ(1+κμ))) จึงแกว่งกว่า χ² มาก
    //      → df ที่มีผล = df·2/(2 + γ̄₂) (Box 1953: Var s² ≈ σ⁴(2/df + γ₂/n)) ; γ̄₂ เฉลี่ยถ่วงด้วยน้ำหนักของแต่ละวัน
    //      ใช้ส่วนหางเพียง KURT_SHARE = 1/3 ของ 6κ — สูตรเต็มทำให้ระมัดระวังเกิน (ผลบวกลวง 2–3%) ; ค่า 1/3 เลือกจากการจำลองหลาย seed
    //  ผลจากการจำลอง (tests/unit/stats.test.js): ช่วงละ 7 วัน NB k = 0.5–0.8 ผลบวกลวงจาก 6–11% → ราว 4–6% ; k ≥ 2 แทบไม่เปลี่ยน
    const aOf = g => { let m = 0, v = 0; all.forEach((d, i) => { if (d.g === g) { m += fit.mu[i]; v += fit.mu[i] * (1 + kap * fit.mu[i]); } }); return v > 0 ? m * m / v : Infinity; };
    const aA = aOf("A"), aB = aOf("B"), cf = a => (fin(a) ? a * trigamma(a) : 1);
    const vMult = (cf(aA) / aA + cf(aB) / aB) / (1 / aA + 1 / aB);
    let gw = 0, gs = 0; fit.mu.forEach(m => { const w = m / (1 + kap * m); gw += w; gs += w * (KURT_SHARE * 6 * kap + 1 / (m * (1 + kap * m))); });
    const g2 = gw > 0 ? gs / gw : 0, dfMult = 2 / (2 + g2);
    const R = arContrast(z, X, all.map(d => d.t), h, cvec, { floorVar: vPois, conf, vMult, dfMult, p0: arP0, dfRule, ...(arPhis ? { phis: arPhis } : {}), ...(iid ? { qs: [0] } : {}) });
    if (!R) return null;
    const d = R.est;
    return { ...base, adjRatio: Math.exp(d), adjChange: Math.exp(d) - 1, lo: Math.exp(R.lo) - 1, hi: Math.exp(R.hi) - 1, se: R.se, p: R.p, phi, phiRaw, kappa: fit.kappa, df: R.df, dfModel: df, ar: { phi: R.phi, share: R.share }, small: { vMult, dfMult, aA, aB }, days: all.length, wdAdj, enough: df >= minDf };
  }

  /** เทียบอัตราส่วน (เช่น บิล ÷ คนเข้าร้าน) ของสองช่วงจากข้อมูลรายวัน — quasi-binomial
     A, B = [{ x, n }] รายวัน ; ค่ารวมเทียบด้วย twoProp แล้วขยาย se ด้วย √φ ; φ = max(1, Pearson χ²/(วัน − 2)) จากความต่างรายวันรอบอัตราของแต่ละช่วง
     (คนในวันเดียวกันไม่ได้เป็นอิสระต่อกัน — วันคิวยาวทุกคนซื้อน้อยลงพร้อมกัน) ; p จาก t ที่ df = วัน − 2 */
  function twoPropDaily(A, B, conf = 0.95) {
    const ok = d => d && fin(d.x) && fin(d.n) && d.n > 0 && d.x >= 0 && d.x <= d.n;
    const a = (A || []).filter(ok), b = (B || []).filter(ok);
    const x1 = sum(a.map(d => d.x)), n1 = sum(a.map(d => d.n)), x2 = sum(b.map(d => d.x)), n2 = sum(b.map(d => d.n));
    const t = twoProp(x1, n1, x2, n2, conf); if (!t) return null;
    let chi2 = 0, cnt = 0;
    [[a, x1 / n1], [b, x2 / n2]].forEach(([D, p]) => { if (p > 0 && p < 1) D.forEach(d => { chi2 += (d.x - d.n * p) ** 2 / (d.n * p * (1 - p)); cnt++; }); });
    const df = cnt - 2, phi = df > 0 ? Math.max(1, chi2 / df) : 1, k = Math.sqrt(phi);
    const z = t.z / k, p = df >= 1 ? 2 * (1 - tCdf(Math.abs(z), df)) : t.p;
    const sc = df >= 1 ? tCrit(df, conf) / zCrit(conf) : 1;
    return { ...t, z, p, lo: t.diff - (t.diff - t.lo) * k * sc, hi: t.diff + (t.hi - t.diff) * k * sc, phi, df, days: a.length + b.length, method: "quasi-binomial" };
  }

  /* ---------- ข้อมูลพอไหม: ผลต่างที่ตรวจจับได้ (MDE) และจำนวนวันที่ต้องเก็บเพิ่ม ---------- */
  /** จากช่วงความเชื่อมั่นของการเทียบสองช่วง (lo, hi) ที่ได้จากข้อมูลช่วงละ days วัน
     scale = "log" (lo/hi เป็นการเปลี่ยนแบบสัดส่วน เช่น −0.1 = ลด 10% ; ใช้กับจำนวนนับ) | "lin" (ผลต่างตรง ๆ เช่น จุดเปอร์เซ็นต์)
     se ≈ ความกว้างของช่วง ÷ (2·z) ; MDE = (z_{1−α/2} + z_power)·se = ผลต่างเล็กที่สุดที่จะเห็นชัด (p < α) ได้ราว power ของครั้ง
     ถ้าเก็บข้อมูลต่อจนแต่ละช่วงยาว L วัน se จะหดราว √(days / L) → L = days·((z_α + z_β)·se / |target|)² ; moreDays = L − days
     (สมมติว่าวันใหม่ผันผวนแบบเดิม — ถ้าระดับลอยต่อเนื่องหลายวัน จริง ๆ อาจต้องนานกว่านี้ ; ตรวจด้วยการจำลองใน tests/unit/stats.test.js) */
  /** @param {{ lo?: number, hi?: number, days?: number, target?: number | null, conf?: number, power?: number, scale?: string, maxDays?: number }} [o] */
  function planMore({ lo, hi, days, target = null, conf = 0.95, power = 0.8, scale = "log", maxDays = 365 } = {}) {
    if (!fin(lo) || !fin(hi) || !(days > 0) || hi <= lo) return null;
    const tf = v => (scale === "log" ? Math.log(1 + v) : v), inv = v => (scale === "log" ? Math.exp(v) - 1 : v);
    if (scale === "log" && (lo <= -1)) return null;
    const z = zCrit(conf), se = (tf(hi) - tf(lo)) / (2 * z), k = z + normInv(power);
    const mde = { up: inv(k * se), down: inv(-k * se) };
    let need = null, moreDays = null;
    if (fin(target) && target !== 0) {
      const eff = Math.abs(tf(target)) || Math.abs(target);
      need = Math.ceil(days * (k * se / eff) ** 2);
      moreDays = Math.max(0, need - days);
      if (need > maxDays) moreDays = null; // เกินกว่าที่ควรรอ → บอกว่า "นานเกินไป" แทนตัวเลข
    }
    return { se, mde, mdeAbs: Math.max(Math.abs(mde.up), Math.abs(mde.down)), daysPerPeriod: need, moreDays, tooLong: fin(target) && moreDays == null, days };
  }

  /* ---------- หลายการทดสอบพร้อมกัน ---------- */
  /** ปรับ p-value สำหรับการทดสอบหลายข้อ: "BH" (Benjamini–Hochberg, คุม false discovery rate) | "holm" (คุม family-wise error)
     ค่า null/NaN ไม่นับเป็นสมาชิกและคืน null */
  function adjustP(ps, method = "BH") {
    const idx = (ps || []).map((p, i) => [p, i]).filter(([p]) => fin(p)), m = idx.length, out = (ps || []).map(() => null);
    if (!m) return out;
    if (method === "holm") {
      idx.sort((a, b) => a[0] - b[0]); let run = 0;
      idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); out[i] = run; });
    } else {
      idx.sort((a, b) => b[0] - a[0]); let run = 1;
      idx.forEach(([p, i], k) => { const rank = m - k; run = Math.min(run, Math.min(1, p * m / rank)); out[i] = run; });
    }
    return out;
  }

  /* ---------- สหสัมพันธ์ของอนุกรมเวลา ---------- */
  /** เศษเหลือจาก OLS ของ v บนเมทริกซ์ X (คืน null ถ้าเอกฐาน) */
  function olsResid(v, X) {
    const p = X[0].length, XtX = Array.from({ length: p }, () => Array(p).fill(0)), Xty = Array(p).fill(0);
    X.forEach((xi, i) => { for (let a = 0; a < p; a++) { Xty[a] += xi[a] * v[i]; for (let b = 0; b < p; b++) XtX[a][b] += xi[a] * xi[b]; } });
    const b = solve(XtX, Xty); if (!b) return null;
    return v.map((y, i) => y - X[i].reduce((s, x, k) => s + x * b[k], 0));
  }
  /** สหสัมพันธ์ lag-1 จากคู่ตำแหน่งที่ติดกันในอนุกรมเดิม (pos = ตำแหน่งเดิม) */
  function lag1(e, pos) {
    const m = mean(e); let num = 0, den = 0;
    e.forEach((v, i) => { den += (v - m) ** 2; if (i && pos[i] === pos[i - 1] + 1) num += (v - m) * (e[i - 1] - m); });
    return den > 0 ? num / den : 0;
  }
  /** สหสัมพันธ์ของอนุกรมเวลารายวัน (หรือรายชั่วโมง) ที่เผื่อสหสัมพันธ์ต่อเนื่อง (autocorrelation)
     1) ถ้ามี wd (วันในสัปดาห์ของแต่ละจุด) และข้อมูล ≥ 14 คู่: ตัดผลของวันในสัปดาห์และแนวโน้มเส้นตรงออกจากทั้งสองอนุกรม (OLS)
        แล้วหาสหสัมพันธ์ของเศษเหลือ — ไม่ให้ “วันเสาร์คนเยอะทั้งคู่” หรือ “ทั้งคู่โตขึ้นตามเวลา” กลายเป็นความสัมพันธ์
     2) ขนาดตัวอย่างที่มีผลจริง (Bartlett, AR(1)): n_eff = (n − k)·(1 − ρx ρy)/(1 + ρx ρy) ; k = จำนวนพารามิเตอร์ที่ตัดออก
        ρ = สหสัมพันธ์ lag-1 ของเศษเหลือ ; CI และ p ใช้ Fisher z ด้วย se = 1/√(n_eff − 3)
     คืน { n, nEff, r (หลังปรับ), rRaw, rho (Spearman ดิบ), lo, hi, p, adjusted: "weekday+trend" | "none", ac: [ρx, ρy], enough } */
  function tsCorrelation(x, y, { wd = null, conf = 0.95, minN = 8, minEff = 6 } = {}) {
    const X = [], Y = [], P = [], W = [];
    for (let i = 0; i < Math.min((x || []).length, (y || []).length); i++) if (fin(x[i]) && fin(y[i])) { X.push(x[i]); Y.push(y[i]); P.push(i); W.push(wd ? wd[i] : null); }
    const n = X.length;
    if (n < 3) return { n, nEff: n, r: null, rRaw: null, enough: false, adjusted: "none" };
    const rRaw = pearsonRaw(X, Y), rho = pearsonRaw(ranks(X), ranks(Y));
    let ex = X, ey = Y, k = 1, adjusted = "none";
    if (wd && n >= 14) {
      const levels = [...new Set(W)].sort(), tm = mean(P);
      const M = P.map((t, i) => levels.map(l => /** @type {number} */ (W[i] === l ? 1 : 0)).concat([(t - tm) / Math.max(1, n)]));
      const rx = olsResid(X, M), ry = olsResid(Y, M);
      if (rx && ry) { ex = rx; ey = ry; k = levels.length + 1; adjusted = "weekday+trend"; }
    }
    const r = pearsonRaw(ex, ey);
    if (r == null) return { n, nEff: n, r: null, rRaw, rho, enough: false, adjusted };
    const ax = Math.max(-0.95, Math.min(0.95, lag1(ex, P))), ay = Math.max(-0.95, Math.min(0.95, lag1(ey, P)));
    const nEff = Math.max(2, Math.min(n - k + 1, (n - k + 1) * (1 - ax * ay) / (1 + ax * ay)));
    let lo = null, hi = null, p = null;
    if (nEff > 3) {
      const rr = Math.max(-0.999999, Math.min(0.999999, r)), zf = Math.atanh(rr), se = 1 / Math.sqrt(nEff - 3), zc = zCrit(conf);
      lo = Math.tanh(zf - zc * se); hi = Math.tanh(zf + zc * se); p = 2 * normSf(Math.abs(zf) / se);
    }
    return { n, nEff, r, rRaw, rho, lo, hi, p, adjusted, ac: [ax, ay], enough: n >= minN && nEff >= minEff };
  }

  /* ---------- A/B: empirical Bayes shrinkage (ลด winner's curse) ---------- */
  /** beta-binomial empirical Bayes: groups = [{ x, n }] → prior Beta(α, β) จาก method of moments
     (ความแปรปรวนระหว่างกลุ่มหักส่วนที่มาจากการสุ่มแบบ binomial) ; ทุกกลุ่มได้ shrunk = (x + α)/(n + α + β)
     และช่วง 95% จาก posterior Beta(x + α, n − x + β) ; ความต่างระหว่างกลุ่มไม่เกินที่คาดจากการสุ่ม → ดึงเข้าหาค่ากลางทั้งหมด */
  function betaQuantile(q, a, b) { let lo = 0, hi = 1; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < q) lo = m; else hi = m; } return (lo + hi) / 2; }
  function ebBinom(groups, conf = 0.95) {
    const G = (groups || []).filter(g => g && g.n > 0), k = G.length;
    if (!k) return { alpha: null, beta: null, M: null, mean: null, groups: [] };
    const N = sum(G.map(g => g.n)), pbar = sum(G.map(g => g.x)) / N;
    const S = sum(G.map(g => g.n * (g.x / g.n - pbar) ** 2)), den = N - sum(G.map(g => g.n * g.n)) / N;
    const tau2 = k > 1 && den > 0 ? (S - pbar * (1 - pbar) * (k - 1)) / den : 0;
    // tau2 ≤ 0 → รวมเป็นกลุ่มเดียว (prior แคบมาก) ; จำกัด M ไม่ให้เกิน 1e6
    const M = tau2 > 0 && pbar > 0 && pbar < 1 ? Math.min(1e6, Math.max(1e-6, pbar * (1 - pbar) / tau2 - 1)) : 1e6;
    const a = Math.max(1e-6, pbar * M), b = Math.max(1e-6, (1 - pbar) * M), lq = (1 - conf) / 2;
    return {
      alpha: a, beta: b, M, mean: pbar, tau2: Math.max(0, tau2),
      groups: G.map(g => ({ ...g, shrunk: (g.x + a) / (g.n + a + b), weight: g.n / (g.n + a + b), lo: betaQuantile(lq, g.x + a, g.n - g.x + b), hi: betaQuantile(1 - lq, g.x + a, g.n - g.x + b) }))
    };
  }
  /** normal–normal empirical Bayes ของค่าเฉลี่ยกลุ่ม: groups = [{ mean, se }] → τ² แบบ DerSimonian–Laird
     shrunk = μ̂ + τ²/(τ² + se²)·(mean − μ̂) */
  function ebNormal(groups) {
    const all = groups || [], ok = g => g && fin(g.mean) && fin(g.se) && g.se > 0, G = all.filter(ok), k = G.length;
    if (!k) return { mu: null, tau2: null, groups: all.map(g => ({ ...g, shrunk: g ? g.mean : null, weight: 1 })) };
    const w = G.map(g => 1 / g.se ** 2), sw = sum(w), muF = sum(G.map((g, i) => w[i] * g.mean)) / sw;
    const Q = sum(G.map((g, i) => w[i] * (g.mean - muF) ** 2)), c = sw - sum(w.map(x => x * x)) / sw;
    const tau2 = k > 1 && c > 0 ? Math.max(0, (Q - (k - 1)) / c) : 0;
    const ws = G.map(g => 1 / (g.se ** 2 + tau2)), mu = sum(G.map((g, i) => ws[i] * g.mean)) / sum(ws);
    // กลุ่มที่ไม่มี se (คืนค่าเดิม น้ำหนัก 1)
    return { mu, tau2, groups: all.map(g => { if (!ok(g)) return { ...g, shrunk: g ? g.mean : null, weight: 1 }; const B = tau2 / (tau2 + g.se ** 2); return { ...g, shrunk: mu + B * (g.mean - mu), weight: B }; }) };
  }

  /* ---------- ภาษาคน ---------- */
  /** ระดับความมั่นใจจาก p-value: insufficient | none | weak | moderate | strong */
  function confLevel(p, enough = true) {
    if (!enough || !fin(p)) return "insufficient";
    return p < 0.01 ? "strong" : p < 0.05 ? "moderate" : p < 0.2 ? "weak" : "none";
  }
  /* ป้ายความมั่นใจเป็นภาษาธรรมดา ไม่อ้างว่า “โอกาสที่ผลนี้เป็นความจริง/ความบังเอิญ” เท่ากับเท่าไร (p-value ไม่ได้บอกสิ่งนั้น)
     ตัวเลข p อธิบายแยกด้วย pTextTH() ในส่วนรายละเอียด */
  const TH_CONF = {
    insufficient: "ข้อมูลยังน้อย ยังสรุปไม่ได้",
    none: "ยังไม่ต่างจากเดิมอย่างชัดเจน อาจเป็นความผันผวนตามปกติ",
    weak: "ยังไม่แน่ชัด ความต่างขนาดนี้เกิดจากความผันผวนตามปกติได้",
    moderate: "ค่อนข้างมั่นใจ หลักฐานค่อนข้างชัด",
    strong: "มั่นใจสูง หลักฐานชัดเจน"
  };
  /** เปอร์เซ็นต์ของ p แบบอ่านง่าย */
  function pctP(p) { return !fin(p) ? "–" : p < 0.001 ? "ต่ำกว่า 0.1%" : p < 0.01 ? (p * 100).toFixed(1) + "%" : p < 0.995 ? Math.round(p * 100) + "%" : "เกือบ 100%"; }
  /** อธิบาย p-value อย่างถูกต้อง: “ถ้าไม่มีความเปลี่ยนแปลงจริง โอกาสเห็นความต่างขนาดนี้หรือมากกว่า ≈ x%”
     kind: "change" | "corr" | "diff" ; q/m = ค่าหลังปรับการทดสอบหลายข้อ (BH) และจำนวนข้อที่ทดสอบพร้อมกัน */
  function pTextTH(p, { kind = "change", q = null, m = null } = {}) {
    if (!fin(p)) return "";
    const head = kind === "corr" ? "ถ้าสองค่านี้ไม่สัมพันธ์กันจริง โอกาสเห็นความสัมพันธ์ขนาดนี้หรือมากกว่า" : kind === "diff" ? "ถ้าทุกตัวเลือกได้ผลเท่ากันจริง โอกาสเห็นความต่างขนาดนี้หรือมากกว่า" : "ถ้าไม่มีความเปลี่ยนแปลงจริง โอกาสเห็นความต่างขนาดนี้หรือมากกว่า";
    const ap = v => (v < 0.001 ? "" : "≈ ") + pctP(v);
    const adj = fin(q) && m > 1 ? ` · เมื่อปรับเพราะดู ${m} ข้อพร้อมกัน (Benjamini–Hochberg) ค่าที่ใช้ตัดสินความมั่นใจ ${ap(q)}` : "";
    return `${head} ${ap(p)}${adj}`;
  }
  const TH_CONF_SHORT = { insufficient: "ข้อมูลยังน้อย", none: "ไม่ต่างชัด", weak: "ยังไม่แน่ชัด", moderate: "ค่อนข้างมั่นใจ", strong: "มั่นใจสูง" };
  /* ป้ายความมั่นใจภาษาง่าย แยกตามชนิดคำถาม: change = เทียบกับช่วงก่อน · corr = ความสัมพันธ์ · diff = เทียบตัวเลือก A/B */
  const TH_PLAIN = {
    change: { strong: "น่าจะเปลี่ยนจริง หลักฐานชัด", moderate: "น่าจะเปลี่ยนจริง", weak: "ยังไม่แน่ อาจเป็นแค่ความผันผวนรายวัน", none: "อาจเป็นแค่ความผันผวนรายวัน ยังไม่ใช่การเปลี่ยนจริง", insufficient: "ข้อมูลยังน้อย ยังสรุปไม่ได้" },
    corr: { strong: "สองค่านี้น่าจะขึ้นลงไปด้วยกันจริง", moderate: "สองค่านี้ค่อนข้างแน่ว่าขึ้นลงไปด้วยกัน", weak: "ยังไม่แน่ อาจตรงกันโดยบังเอิญ", none: "ยังไม่เห็นว่าสองค่านี้เกี่ยวกัน", insufficient: "ข้อมูลยังน้อย ยังสรุปไม่ได้" },
    diff: { strong: "ต่างกันจริง หลักฐานชัด", moderate: "น่าจะต่างกันจริง", weak: "ยังไม่แน่ อาจต่างกันโดยบังเอิญ", none: "ยังไม่เห็นความต่างที่ชัด", insufficient: "ข้อมูลยังน้อย ยังสรุปไม่ได้" }
  };
  const plainConf = (level, kind = "change") => (TH_PLAIN[kind] || TH_PLAIN.change)[level] || TH_PLAIN.change.insufficient;
  const VERSION = "3.3.0";
  /** ความแรงของสหสัมพันธ์ */
  function corrWord(r) {
    if (!fin(r)) return "ไม่ทราบ";
    const a = Math.abs(r), dir = r > 0 ? "ไปทางเดียวกัน" : "สวนทางกัน";
    return a < 0.1 ? "แทบไม่สัมพันธ์กัน" : a < 0.3 ? `สัมพันธ์กันเล็กน้อย (${dir})` : a < 0.5 ? `สัมพันธ์กันปานกลาง (${dir})` : a < 0.7 ? `สัมพันธ์กันค่อนข้างชัด (${dir})` : `สัมพันธ์กันชัดมาก (${dir})`;
  }

  return {
    fin, clean, sum, mean, median, quantile, sd, mad, describe, movingAvg,
    erf, erfc, erfAS, normCdf, normSf, normInv, lgamma, ibeta, tCdf, tCrit, zCrit,
    wilson, quasiBinomCI, twoProp, binomTest, poissonTest, countCompare, arContrast, arWhiten, twoPropDaily, planMore, poissonGLM, nbGLM, solve, adjustP, meanCI, welch,
    robustZ, stlLite, looExpected, nbCdf, nbTwoSided, zOfP, ANOM, anomalies, seasonGrid, holtWinters, forecast,
    correlation, tsCorrelation, funnel, cohorts, abRates, abMeans, chiSqHomog, welchAnova, gammaP, chi2Sf, fSf, ebBinom, ebNormal, betaQuantile,
    confLevel, corrWord, pctP, pTextTH, TH_CONF, TH_CONF_SHORT, TH_PLAIN, plainConf, VERSION
  };
});

/* palm-v2-detect.js — the classical palm-line finder of the palm reading upgrade v1 (switch window.LENSIQ_PALM_V2, default off).
   Our own code (tier 1), no model, no outside data. Installs PV.detect / PV.classify / PV.DET into palm-v2.js (PalmV2).
   Browser: window.PalmV2Detect (load before palm-v2.js) · Node: required by palm-v2.js.
   Every constant is PROVISIONAL: set on the drawn synthetic hand (tests/fixtures/palm-v2/synth-hand.js) only, to calibrate on
   consented real photos (acceptance sheet docs/acceptance/palm.md, rows M1-M9). */
(function (root) {
  "use strict";
  function install(PV) {
    var U = PV._util, clamp = U.clamp, r4 = U.r4, sigmoid = U.sigmoid, resample = U.resample;
    var guides = PV.guides, catmull = PV.catmull, frameFromHand = PV.frameFromHand;
    /* ================= the classical line finder (our own code, tier 1) =================
       1 palm frame from the hand -> canonical image, s px per palm width (PROVISIONAL 240, never above the photo's own scale)
       2 grey (green-weighted) -> high-pass (sigma 0.1 PW, removes shadows) -> local contrast
       3 valley filters: Frangi-type Hessian (3 scales), Gabor bank (8 directions, half resolution), morphological black-hat
       4 combined map -> hysteresis inside the palm mask -> Zhang-Suen skeleton -> segments (pruned, gaps joined)
       5 each line id takes the segments that lie in its zone along its direction (heart, head, life, fate first; minors on what
         is left); confidence from coverage, strength and fit; control points are skeleton points (they come from the photo) */
    var DET = { s: 240, u0: -0.3, u1: 1.25, v0: -0.06, v1: 1.16, PROVISIONAL: true };
    function gaussBlur(src, w, h, sigma) {
      var r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1), s = 0, i, x, y;
      for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
      for (i = 0; i < k.length; i++) k[i] /= s;
      var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
      for (y = 0; y < h; y++) { var row = y * w; for (x = 0; x < w; x++) { var a = 0; for (i = -r; i <= r; i++) { var xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
        a += src[row + xx] * k[i + r]; } tmp[row + x] = a; } }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var b = 0; for (i = -r; i <= r; i++) { var yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; b += tmp[yy * w + x] * k[i + r];
        } out[y * w + x] = b; }
      return out;
    }
    function boxMean(src, w, h, r) {
      var I = new Float64Array((w + 1) * (h + 1)), x, y;
      for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
      var out = new Float32Array(w * h);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      }
      return out;
    }
    function pct(arr, mask, q) {
      var s = [];
      for (var i = 0; i < arr.length; i += 2) if (!mask || mask[i]) s.push(arr[i]);
      if (!s.length) return 0;
      s.sort(function (a, b) { return a - b; });
      return s[Math.min(s.length - 1, Math.floor(s.length * q))];
    }
    /** canonical grey image + skin / palm mask */
    function canonical(rgba, W, H, F, s) {
      var w = Math.round((DET.u1 - DET.u0) * s), h = Math.round((DET.v1 - DET.v0) * s * F.asp), n = w * h;
      var g = new Float32Array(n), skin = new Uint8Array(n);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var u = DET.u0 + (x + 0.5) / s, v = DET.v0 + (y + 0.5) / (s * F.asp), p = F.toImg([u, v]);
        var px = p[0] - 0.5, py = p[1] - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0, i = y * w + x;
        if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) { g[i] = 0; continue; }
        var a = (y0 * W + x0) * 4, b = a + 4, c = a + W * 4, d = c + 4, ch = [0, 0, 0];
        for (var k = 0; k < 3; k++) ch[k] = (rgba[a + k] * (1 - fx) + rgba[b + k] * fx) * (1 - fy) + (rgba[c + k] * (1 - fx) + rgba[d + k] * fx) * fy;
        g[i] = 0.25 * ch[0] + 0.6 * ch[1] + 0.15 * ch[2];
        var cb = 128 - 0.1687 * ch[0] - 0.3313 * ch[1] + 0.5 * ch[2], cr = 128 + 0.5 * ch[0] - 0.4187 * ch[1] - 0.0813 * ch[2];
        // creases are darker skin: keep the chroma test loose and the brightness test low
        skin[i] = cr > 128 && cr < 190 && cb > 65 && cb < 140 && ch[0] > ch[2] && g[i] > 25 ? 1 : 0;
      }
      // close small holes along creases (dilate then erode 2 px), then erode 3 px from the edge of the hand
      var m = morph(morph(skin, w, h, 2, true), w, h, 2, false);
      m = morph(m, w, h, Math.max(2, Math.round(s * 0.012)), false);
      return { g: g, mask: m, w: w, h: h, s: s };
    }
    function morph(m, w, h, r, dil) {
      var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), x, y, k;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var v = dil ? 0 : 1; for (k = -r; k <= r && (dil ? !v : v); k++) { var xx = x + k; var q = xx < 0 || xx >= w ? 0 : m[y * w + xx];
        v = dil ? v || q : v && q; } tmp[y * w + x] = v ? 1 : 0; }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var u = dil ? 0 : 1; for (k = -r; k <= r && (dil ? !u : u); k++) { var yy = y + k; var q2 = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
        u = dil ? u || q2 : u && q2; } out[y * w + x] = u ? 1 : 0; }
      return out;
    }
    function minmax(src, w, h, r, isMax) {
      var tmp = new Float32Array(w * h), out = new Float32Array(w * h), x, y, k;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var v = isMax ? -1e9 : 1e9; for (k = -r; k <= r; k++) { var xx = clamp(x + k, 0, w - 1), q = src[y * w + xx];
        v = isMax ? (q > v ? q : v) : (q < v ? q : v); } tmp[y * w + x] = v; }
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var u = isMax ? -1e9 : 1e9; for (k = -r; k <= r; k++) { var yy = clamp(y + k, 0, h - 1), q2 = tmp[yy * w + x];
        u = isMax ? (q2 > u ? q2 : u) : (q2 < u ? q2 : u); } out[y * w + x] = u; }
      return out;
    }
    /** Frangi-type valley measure (dark line on lighter skin) over scales; also the line direction */
    function frangi(g, w, h, sigmas) {
      var resp = new Float32Array(w * h), dir = new Float32Array(w * h);
      sigmas.forEach(function (sg) {
        var L = gaussBlur(g, w, h, sg), s2 = sg * sg, vals = new Float32Array(w * h), Ss = [];
        var l1a = new Float32Array(w * h), l2a = new Float32Array(w * h), da = new Float32Array(w * h);
        for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
          var i = y * w + x;
          var a = (L[i - 1] - 2 * L[i] + L[i + 1]) * s2, c = (L[i - w] - 2 * L[i] + L[i + w]) * s2, b = (L[i - w - 1] + L[i + w + 1] - L[i - w + 1] - L[i + w - 1]) / 4 * s2;
          var t = Math.sqrt((a - c) * (a - c) + 4 * b * b), l1 = (a + c + t) / 2, l2 = (a + c - t) / 2; // l1 >= l2
          l1a[i] = l1; l2a[i] = l2;
          var nx, ny; if (Math.abs(b) > 1e-9) { nx = b; ny = l1 - a; } else if (a >= c) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
          da[i] = Math.atan2(ny, nx) + Math.PI / 2;
          if (l1 > 0 && (i & 3) === 0) Ss.push(Math.hypot(l1, l2));
        }
        Ss.sort(function (p, q) { return p - q; });
        var cc = (Ss[Math.floor(Ss.length * 0.98)] || 1) * 0.5, beta = 0.5;
        for (var j = 0; j < w * h; j++) {
          var L1 = l1a[j], L2 = l2a[j];
          if (L1 <= 0) continue;
          var Rb = Math.abs(L2) / L1, S = Math.hypot(L1, L2), v = Math.exp(-Rb * Rb / (2 * beta * beta)) * (1 - Math.exp(-S * S / (2 * cc * cc)));
          vals[j] = v;
          if (v > resp[j]) { resp[j] = v; dir[j] = da[j]; }
        }
      });
      return { resp: resp, dir: dir };
    }
    /** even Gabor bank (valley-tuned), 8 directions, on a half-resolution image; upsampled back */
    function gabor(g, w, h, lambda) {
      var w2 = Math.floor(w / 2), h2 = Math.floor(h / 2), small = new Float32Array(w2 * h2), x, y;
      for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) small[y * w2 + x] = (g[2 * y * w + 2 * x] + g[2 * y * w + 2 * x + 1] + g[(2 * y + 1) * w + 2 * x] + g[(2 * y + 1) * w + 2 * x + 1]) / 4;
      var lam = lambda / 2, sig = 0.56 * lam, gam = 0.5, R = Math.ceil(2.5 * sig / gam), best = new Float32Array(w2 * h2);
      for (var o = 0; o < 8; o++) {
        var th = o * Math.PI / 8, ct = Math.cos(th), st = Math.sin(th), K = [], sum = 0, cnt = 0;
        for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
          var xp = dx * ct + dy * st, yp = -dx * st + dy * ct;
          var v = Math.exp(-(xp * xp + gam * gam * yp * yp) / (2 * sig * sig)) * Math.cos(2 * Math.PI * xp / lam);
          if (Math.abs(v) > 0.01) { K.push(dx, dy, v); sum += v; cnt++; }
        }
        var mean = sum / cnt;
        for (var k = 2; k < K.length; k += 3) K[k] -= mean;
        for (y = 0; y < h2; y++) for (x = 0; x < w2; x++) {
          var acc = 0;
          for (var q = 0; q < K.length; q += 3) { var xx = x + K[q], yy = y + K[q + 1]; if (xx < 0 || yy < 0 || xx >= w2 || yy >= h2) continue; acc += small[yy * w2 + xx] * K[q + 2]; }
          var r = -acc; // a dark valley gives a negative even response
          if (r > best[y * w2 + x]) best[y * w2 + x] = r;
        }
      }
      var out = new Float32Array(w * h);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var sx = Math.min(w2 - 1, x >> 1), sy = Math.min(h2 - 1, y >> 1); out[y * w + x] = best[sy * w2 + sx]; }
      return out;
    }
    /** Zhang-Suen thinning */
    function thin(m, w, h) {
      var a = new Uint8Array(m), changed = true, del = [];
      var P = function (i) { return a[i]; };
      while (changed) {
        changed = false;
        for (var pass = 0; pass < 2; pass++) {
          del.length = 0;
          for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
            var i = y * w + x; if (!a[i]) continue;
            var p2 = P(i - w), p3 = P(i - w + 1), p4 = P(i + 1), p5 = P(i + w + 1), p6 = P(i + w), p7 = P(i + w - 1), p8 = P(i - 1), p9 = P(i - w - 1);
            var B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
            var A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
            if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
            del.push(i);
          }
          if (del.length) { changed = true; for (var k = 0; k < del.length; k++) a[del[k]] = 0; }
        }
      }
      return a;
    }
    var NB = function (w) { return [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]; };
    /** skeleton -> polyline segments between end points / junctions */
    function segments(sk, w, h) {
      var nb = NB(w), deg = new Uint8Array(w * h), i, k;
      for (i = w + 1; i < w * h - w - 1; i++) if (sk[i]) { var d = 0; for (k = 0; k < 8; k++) if (sk[i + nb[k]]) d++; deg[i] = d; }
      var used = new Uint8Array(w * h), segs = [];
      var node = function (j) { return sk[j] && deg[j] !== 2; };
      var walk = function (start, next) {
        var pts = [start, next], prev = start, cur = next;
        used[start] = 1;
        while (!node(cur)) {
          used[cur] = 1;
          var nx = -1;
          for (var q = 0; q < 8; q++) { var c = cur + nb[q]; if (sk[c] && c !== prev && !(used[c] && !node(c)) && pts.indexOf(c) < 0) { nx = c; break; } }
          if (nx < 0) break;
          prev = cur; cur = nx; pts.push(cur);
        }
        used[cur] = 1;
        return pts;
      };
      for (i = w + 1; i < w * h - w - 1; i++) {
        if (!node(i)) continue;
        for (k = 0; k < 8; k++) { var c0 = i + nb[k]; if (sk[c0] && !used[c0]) segs.push(walk(i, c0)); else if (sk[c0] && node(c0) && i < c0) segs.push([i, c0]); }
      }
      for (i = w + 1; i < w * h - w - 1; i++) if (sk[i] && !used[i]) { // loops without nodes
        for (k = 0; k < 8; k++) { var c1 = i + nb[k]; if (sk[c1]) { segs.push(walk(i, c1)); break; } }
      }
      return segs.map(function (s) { return s.map(function (j) { return [j % w, Math.floor(j / w)]; }); });
    }
    function dirOf(P, i, k) { var a = P[Math.max(0, i - k)], b = P[Math.min(P.length - 1, i + k)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
    /** join segment ends closer than gap px that continue in the same direction (< 30 degrees) */
    function joinSegments(segs, gap) {
      var S = segs.slice(), merged = true;
      var ends = function (P) { return { a: P[0], b: P[P.length - 1], da: dirOf(P, 0, 4), db: dirOf(P, P.length - 1, 4) }; };
      while (merged) {
        merged = false;
        outer: for (var i = 0; i < S.length; i++) for (var j = i + 1; j < S.length; j++) {
          var A = ends(S[i]), B = ends(S[j]), cands = [[A.b, A.db, B.a, B.da, 0], [A.b, A.db, B.b, [-B.db[0], -B.db[1]], 1], [A.a, [-A.da[0], -A.da[1]], B.a, B.da, 2], [A.a, [-A.da[0],
            -A.da[1]], B.b, [-B.db[0], -B.db[1]], 3]];
          for (var c = 0; c < 4; c++) {
            var p = cands[c][0], dp = cands[c][1], q = cands[c][2], dq = cands[c][3], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (d > gap || d < 1e-9) continue;
            var gx = (q[0] - p[0]) / d, gy = (q[1] - p[1]) / d;
            if (dp[0] * dq[0] + dp[1] * dq[1] < 0.866 || dp[0] * gx + dp[1] * gy < 0.7) continue;
            var Pi = S[i], Pj = S[j], k = cands[c][4];
            var nw = k === 0 ? Pi.concat(Pj) : k === 1 ? Pi.concat(Pj.slice().reverse()) : k === 2 ? Pi.slice().reverse().concat(Pj) : Pj.concat(Pi);
            S.splice(j, 1); S[i] = nw; merged = true; break outer;
          }
        }
      }
      return S;
    }
    /** nearest point on polyline G (dense) -> {d (signed), t (0..1 along), tan} */
    function project(p, G, cum) {
      var best = { d: Infinity }, tot = cum[cum.length - 1] || 1;
      for (var i = 0; i < G.length - 1; i++) {
        var a = G[i], b = G[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
        var t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1), qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(p[0] - qx, p[1] - qy);
        if (d < Math.abs(best.d)) { var l = Math.sqrt(l2); best = { d: ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / l >= 0 ? d : -d, t: (cum[i] + t * l) / tot, tan: [dx / l, dy / l] }; }
      }
      return best;
    }
    function gAt(D, x, y) { var xi = clamp(Math.round(x), 0, D.w - 1), yi = clamp(Math.round(y), 0, D.h - 1); return D.g[yi * D.w + xi]; }
    var ORDER = ["heart", "head", "life", "fate", "simian", "sun", "mercury", "bracelet", "girdle", "marriage"];
    /** segments (canonical px) + ridge map -> per line {cp, conf} for a school */
    function classify(D, school) {
      var s = D.s, asp = D.asp, G = guides(school), used = D.segs.map(function () { return false; }), out = {};
      var toPx = function (q) { return [(q[0] - DET.u0) * s, (q[1] - DET.v0) * s * asp]; };
      var toUV = function (p) { return [DET.u0 + p[0] / s, DET.v0 + p[1] / (s * asp)]; };
      var minLen = 0.05 * s;
      ORDER.forEach(function (id) {
        var gp = catmull(G[id].cp, 60).map(toPx), cum = [0];
        for (var i = 1; i < gp.length; i++) cum.push(cum[i - 1] + Math.hypot(gp[i][0] - gp[i - 1][0], gp[i][1] - gp[i - 1][1]));
        var band = G[id].band * s, cands = [];
        D.segs.forEach(function (P, si) {
          if (used[si] || P.length < 3) return;
          var len = 0; for (var k = 1; k < P.length; k++) len += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
          if (len < minLen) return;
          var inb = 0, agree = 0, ts = [], ds = [], str = 0;
          for (k = 0; k < P.length; k++) {
            var pr = project(P[k], gp, cum), dv = dirOf(P, k, 3);
            if (Math.abs(pr.d) <= band) { inb++; ts.push(pr.t); ds.push(pr.d); }
            agree += Math.abs(dv[0] * pr.tan[0] + dv[1] * pr.tan[1]);
            str += D.R[P[k][1] * D.w + P[k][0]];
          }
          var fin = inb / P.length, ag = agree / P.length;
          if (fin < 0.7 || ag < 0.82) return;
          ts.sort(function (a, b) { return a - b; });
          var off = ds.reduce(function (a, b) { return a + b; }, 0) / ds.length;
          cands.push({ si: si, P: P, len: len, t0: ts[0], t1: ts[ts.length - 1], fin: fin, ag: ag, str: str / P.length, off: off, score: len * fin * ag });
        });
        cands.sort(function (a, b) { return b.score - a.score; });
        var chain = [];
        cands.forEach(function (c) {
          if (!chain.length) { chain.push(c); return; }
          var overlap = chain.some(function (o) { return Math.min(o.t1, c.t1) - Math.max(o.t0, c.t0) > 0.15 * Math.min(o.t1 - o.t0, c.t1 - c.t0) + 0.02; });
          var near = chain.some(function (o) { var gapT = Math.max(c.t0 - o.t1, o.t0 - c.t1); return gapT < 0.22; });
          if (!overlap && near && Math.abs(c.off - chain[0].off) < 0.045 * s) chain.push(c);
        });
        if (!chain.length) { out[id] = { cp: null, conf: 0 }; return; }
        chain.sort(function (a, b) { return a.t0 - b.t0; });
        var cover = chain.reduce(function (a, c) { return a + (c.t1 - c.t0); }, 0);
        var strength = chain.reduce(function (a, c) { return a + c.str * c.len; }, 0) / chain.reduce(function (a, c) { return a + c.len; }, 0);
        var fit = chain.reduce(function (a, c) { return a + c.fin * c.ag * c.len; }, 0) / chain.reduce(function (a, c) { return a + c.len; }, 0);
        // PROVISIONAL logistic: set on the synthetic set only
        var conf = sigmoid(9 * (cover - 0.42) + 4 * (strength - 0.35) + 4 * (fit - 0.8));
        // control points: skeleton points of the chain, ordered along the guide
        var pts = [];
        chain.forEach(function (c) {
          var P = c.P, a = project(P[0], gp, cum).t, b = project(P[P.length - 1], gp, cum).t;
          pts = pts.concat(a <= b ? P : P.slice().reverse());
        });
        // trim weak ends (a fading tail is not drawn past what the photo shows)
        var rs = pts.map(function (p) { return D.R[p[1] * D.w + p[0]]; }), srt = rs.slice().sort(function (a, b) { return a - b; }), medR = srt[Math.floor(srt.length / 2)] || 0;
        var lo = 0, hi = pts.length - 1;
        while (lo < hi - 4 && rs[lo] < 0.6 * medR) lo++;
        while (hi > lo + 4 && rs[hi] < 0.6 * medR) hi--;
        pts = pts.slice(lo, hi + 1);
        // valley depth in the photo: grey at the line vs beside it (relative); a blurred or faint photo gives a shallow valley
        var deps = [], off = Math.max(3, Math.round(0.03 * s));
        for (var pi = 0; pi < pts.length; pi += 2) {
          var dv = dirOf(pts, pi, 3), nx = -dv[1], ny = dv[0], c0 = 1e9;
          for (var o = -1; o <= 1; o++) c0 = Math.min(c0, gAt(D, pts[pi][0] + nx * o, pts[pi][1] + ny * o));
          var side = (gAt(D, pts[pi][0] + nx * off, pts[pi][1] + ny * off) + gAt(D, pts[pi][0] - nx * off, pts[pi][1] - ny * off)) / 2;
          deps.push(side > 1 ? (side - c0) / side : 0);
        }
        deps.sort(function (a, b) { return a - b; });
        var depth = deps[Math.floor(deps.length / 2)] || 0;
        conf = conf * sigmoid(40 * (depth - 0.07));
        var pick = resample(pts, 7).map(function (q) { // snap each resampled point back to the nearest skeleton point
          var bi = 0, bd = Infinity;
          for (var k = 0; k < pts.length; k++) { var d = Math.hypot(pts[k][0] - q[0], pts[k][1] - q[1]); if (d < bd) { bd = d; bi = k; } }
          return pts[bi];
        });
        out[id] = { cp: pick.map(function (p) { var q = toUV([p[0] + 0.5, p[1] + 0.5]); return [r4(q[0]), r4(q[1])]; }), conf: Math.round(conf * 1000) / 1000, cover: Math.round(cover * 100) / 100,
          strength: Math.round(strength * 100) / 100, depth: Math.round(depth * 1000) / 1000 };
        if (conf >= 0.3) chain.forEach(function (c) { used[c.si] = true; });
      });
      return out;
    }
    /** find lines in a photo. rgba: Uint8ClampedArray W x H; hand: from taps or any landmark source. opts {school, s} */
    function detect(rgba, W, H, hand, opts) {
      opts = opts || {};
      var t0 = Date.now(), F = frameFromHand(hand);
      var s = Math.round(Math.min(opts.s || DET.s, Math.max(120, F.pw)));
      var C = canonical(rgba, W, H, F, s), w = C.w, h = C.h, n = w * h, i;
      var k = s / 240;
      var hp = gaussBlur(C.g, w, h, 0.1 * s), g = new Float32Array(n);
      for (i = 0; i < n; i++) g[i] = C.g[i] - hp[i];
      var m1 = boxMean(g, w, h, Math.round(0.05 * s)), sq = new Float32Array(n);
      for (i = 0; i < n; i++) { var dd = g[i] - m1[i]; sq[i] = dd * dd; }
      var sd = boxMean(sq, w, h, Math.round(0.05 * s));
      for (i = 0; i < n; i++) g[i] = clamp((g[i] - m1[i]) / (Math.sqrt(sd[i]) + 3), -3, 3);
      var Fr = frangi(g, w, h, [1.3 * k, 1.9 * k, 2.7 * k]);
      var Gb = gabor(g, w, h, 7 * k);
      var r = Math.max(1, Math.round(2.4 * k)), bh = minmax(minmax(g, w, h, r, true), w, h, r, false);
      for (i = 0; i < n; i++) bh[i] -= g[i];
      var nrm = function (a) { var p = pct(a, C.mask, 0.99) || 1; for (var j = 0; j < n; j++) a[j] = C.mask[j] ? clamp(a[j] / p, 0, 1) : 0; return a; };
      nrm(Fr.resp); nrm(Gb); nrm(bh);
      var R = new Float32Array(n);
      for (i = 0; i < n; i++) R[i] = C.mask[i] ? 0.45 * Fr.resp[i] + 0.3 * Gb[i] + 0.25 * bh[i] : 0;
      // hysteresis
      var hi = Math.max(0.42, pct(R, C.mask, 0.93)), lo = hi * 0.55, on = new Uint8Array(n), stack = [];
      for (i = 0; i < n; i++) if (R[i] >= hi && !on[i]) { on[i] = 1; stack.push(i); while (stack.length) { var p = stack.pop(), x = p % w, y = (p - x) / w;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; var q = yy * w + xx;
          if (!on[q] && R[q] >= lo) { on[q] = 1; stack.push(q); } } } }
      var sk = thin(on, w, h);
      var segs = segments(sk, w, h).filter(function (P) { return P.length >= Math.max(4, Math.round(0.02 * s)); });
      segs = joinSegments(segs, 0.045 * s);
      var D = { segs: segs, R: R, g: C.g, w: w, h: h, s: s, asp: F.asp };
      var lines = classify(D, opts.school || "thai");
      return { lines: lines, asp: Math.round(F.asp * 1000) / 1000, s: s, ms: Date.now() - t0, lowRes: F.pw < 350, _D: D };
    }
    PV.DET = DET; PV.detect = detect; PV.classify = classify;
    return PV;
  }
  var api = { install: install };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PalmV2Detect = api;
})(typeof window !== "undefined" ? window : globalThis);

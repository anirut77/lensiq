/* attendance-qr.js — small QR Code encoder (ISO/IEC 18004: byte mode, error correction level M, versions 1–10) for the
   employee badges of attendance.html (PIN / QR check-in = the non-biometric alternative). No dependencies, no network.
   Decoding is done by the browser's BarcodeDetector where available, or by a USB / Bluetooth badge scanner that types
   the code into the QR field (keyboard wedge).
     LQQR.matrix(text) -> {size, get(x, y) -> bool, version, mask}
     LQQR.svg(text, {scale?, margin?, label?}) -> "<svg …>" (dark modules as one <path>, quiet zone 4 modules)
   Browser: window.LQQR · Node: require("./attendance-qr.js") */
(/** @param {any} root @param {() => any} factory */ function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQQR = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // level M: [ec codewords per block, [blocks, data codewords]…] for versions 1..10
  /** @type {any[]} */
  const EC_M = [null, [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]], [16, [4, 27]], [18, [4, 31]],
    [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  /** @type {any[]} */
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // GF(256) with the QR polynomial 0x11d
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsEncode(data, n) {
    const g = rsGen(n), r = new Array(n).fill(0);
    for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f); }
    return r;
  }
  const utf8 = s => (typeof TextEncoder !== "undefined" ? Array.from(new TextEncoder().encode(s)) : Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0)));
  const dataCap = v => EC_M[v].slice(1).reduce((s, [b, d]) => s + b * d, 0);

  function encodeData(bytes) {
    let v = 1;
    for (; v <= 10; v++) { const cnt = v < 10 ? 8 : 16; if (4 + cnt + bytes.length * 8 <= dataCap(v) * 8) break; }
    if (v > 10) throw new Error("QR: text too long");
    const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
    const cap = dataCap(v) * 8;
    put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let p = 0; cw.length < dataCap(v); p ^= 1) cw.push(p ? 0x11 : 0xec);
    // split into blocks, interleave data then EC
    const [ec, ...groups] = EC_M[v], blocks = [];
    let o = 0; for (const [n, d] of groups) for (let i = 0; i < n; i++) { const dat = cw.slice(o, o + d); o += d; blocks.push({ dat, ecc: rsEncode(dat, ec) }); }
    const out = [], maxD = Math.max(...blocks.map(b => b.dat.length));
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.dat.length) out.push(b.dat[i]);
    for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ecc[i]);
    return { v, cw: out };
  }

  function bch(val, poly, bitsPoly) { let r = val << (bitsPoly - 1); const top = bitsPoly - 1; for (let i = 31 - Math.clz32(r); i >= top; i = 31 - Math.clz32(r)) r ^= poly << (i - top); return r; }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];

  function build(v, cw, mask) {
    const N = 17 + 4 * v, M = new Uint8Array(N * N), F = new Uint8Array(N * N); // module, function-pattern flag
    const set = (x, y, d) => { if (x < 0 || y < 0 || x >= N || y >= N) return; M[y * N + x] = d ? 1 : 0; F[y * N + x] = 1; };
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const m = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, m !== 2 && m !== 4); } };
    finder(3, 3); finder(N - 4, 3); finder(3, N - 4);
    for (let i = 8; i < N - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
    const al = ALIGN[v];
    for (const ay of al) for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === N - 7) || (ax === N - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // format info (level M = 00) + dark module
    const fmt = ((0 << 3 | mask) << 10 | bch(0 << 3 | mask, 0x537, 11)) ^ 0x5412;
    const fb = i => (fmt >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, fb(i));
    set(8, 7, fb(6)); set(8, 8, fb(7)); set(7, 8, fb(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
    for (let i = 0; i < 8; i++) set(N - 1 - i, 8, fb(i));
    for (let i = 8; i < 15; i++) set(8, N - 15 + i, fb(i));
    set(8, N - 8, 1);
    if (v >= 7) {
      const vi = v << 12 | bch(v, 0x1f25, 13);
      for (let i = 0; i < 18; i++) { const b = (vi >>> i) & 1, a = Math.floor(i / 3), c = i % 3 + N - 11; set(a, c, b); set(c, a, b); }
    }
    // data in the zig-zag order, mask applied to data modules
    const bits = []; for (const c of cw) for (let i = 7; i >= 0; i--) bits.push((c >>> i) & 1);
    let k = 0;
    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? N - 1 - vert : vert;
        if (F[y * N + x]) continue;
        let d = k < bits.length ? bits[k] : 0; k++;
        if (MASKS[mask](x, y)) d ^= 1;
        M[y * N + x] = d;
      }
    }
    return { N, M };
  }
  function penalty(N, M) {
    let p = 0; const g = (x, y) => M[y * N + x];
    for (let y = 0; y < N; y++) for (let dir = 0; dir < 2; dir++) {
      let run = 1;
      for (let x = 1; x < N; x++) { const a = dir ? g(y, x) : g(x, y), b = dir ? g(y, x - 1) : g(x - 1, y); if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
    }
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const c = g(x, y); if (c === g(x + 1, y) && c === g(x, y + 1) && c === g(x + 1, y + 1)) p += 3; }
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = pat.slice().reverse();
    for (let y = 0; y < N; y++) for (let x = 0; x <= N - 11; x++) for (const P of [pat, rev]) {
      if (P.every((b, i) => g(x + i, y) === b)) p += 40;
      if (P.every((b, i) => g(y, x + i) === b)) p += 40;
    }
    let dark = 0; for (let i = 0; i < N * N; i++) dark += M[i];
    p += Math.floor(Math.abs(dark * 100 / (N * N) - 50) / 5) * 10;
    return p;
  }
  /** @param {string} text */
  function matrix(text) {
    const { v, cw } = encodeData(utf8(String(text)));
    /** @type {any} */
    let best = null;
    for (let mask = 0; mask < 8; mask++) { const b = build(v, cw, mask), p = penalty(b.N, b.M); if (!best || p < best.p) best = { ...b, p, mask }; }
    const { N, M } = best;
    return { size: N, version: v, mask: best.mask, get: (x, y) => M[y * N + x] === 1 };
  }
  /** @param {string} text @param {{scale?: number, margin?: number, label?: string}} [o] */
  function svg(text, o = {}) {
    const q = matrix(text), m = o.margin ?? 4, s = q.size + 2 * m, sc = o.scale || 4;
    let d = "";
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += `M${x + m} ${y + m}h1v1h-1z`;
    const lab = String(o.label || "QR").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s * sc}" height="${s * sc}" role="img" aria-label="${lab}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { matrix, svg };
});

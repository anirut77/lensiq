/* lensiq-omr.js — LQOMR: multiple-choice answer-sheet grader maths (printable sheet layout, marker search, perspective
 * correction, bubble fill reading, scoring, item analysis, CSV). Plain JS, no AI, no model, no faces, no network.
 * Browser: window.LQOMR · Node: module.exports (everything here is pure and works on plain gray arrays).
 * Ideas from OMRChecker (MIT, Udayraj123): per-sheet "largest gap" threshold over bubble darkness and flagging values that
 * sit close to the threshold. No code is copied from it (it is Python); everything below is written from scratch.
 *
 * SHEET (A4, all coordinates in mm, origin top-left, portrait 210 x 297)
 *   layout({n=20..100 (1..100), choices=4|5, idDigits=0..10, labels='en'|'th'|'num'}) -> L
 *     L.markers   4 solid squares (centres TL, TR, BR, BL), L.bar = solid orientation bar at the top centre (tells up from
 *     down, and portrait from a sheet photographed sideways), L.code = 9 small squares at the bottom: bits 0-6 = n-1,
 *     bit 7 = 5 choices, bit 8 = even parity (so a sheet printed for another format is refused), L.q[i][c] = {x,y,r}
 *     bubble centres, L.id[d][v] = student-number bubbles (digit d, value v = 0..9).
 *   sheetSvg(L, text) -> SVG markup (text is escaped; caller supplies the Thai / English / Chinese strings)
 *
 * READING (gray = Uint8Array|Uint8ClampedArray, length w*h, 0 = black)
 *   toGray(rgba, w, h) -> Uint8Array
 *   findMarkers(gray, w, h) -> {ok, pts:[[x,y] x4 clockwise from the top-left of the image], cands} | {ok:false, why}
 *   homography(src4, dst4) -> 3x3 (row-major array of 9) mapping src -> dst · apply(H, x, y) -> [x, y]
 *   read(gray, w, h, L, {pts?, minGap=0.12}) -> {ok, why?, H, rot, code:{n, choices, ok}, dark[q][c], marks[q] = [c...],
 *        flags[q] = 'blank'|'multi'|'unsure'|'', id: '01234' ('?' for an unreadable digit), idFlags[d], thr, quality}
 *     rot = which marker is the sheet's top-left (0..3, chosen by the orientation bar); the darkness of each bubble is
 *     normalised between the local paper white (4 diagonal samples around it) and the black of the corner markers.
 *   warp(gray, w, h, H, pxPerMm) -> {data, w, h} straightened gray picture of the sheet (for the review screen only)
 *
 * GRADING
 *   parseKey("ABCD.." | "กขคง" | "1234", choices) -> [[c] | [] ...]   ('-', '?', '_' or space = no key for that item;
 *     "A/C" or "(AC)" = either answer accepted)
 *   keyText(key, labels) -> string · grade(marks, key) -> {score, max, res[q] = 'c'|'w'|'b'|'m'|'x'}  (b blank, m more
 *     than one mark, x item excluded — counted as wrong only when it is graded)
 *   analyse(sheets:[{marks}], key, choices) -> {n, mean, sd, median, min, max, kr20, items:[{q, p, d, rpb, counts[],
 *     blank, multi, hint}]}   p = share correct, d = upper 27 % - lower 27 %, rpb = point-biserial (rest score), hint =
 *     'easy'|'hard'|'low-d'|'neg-d'|'' (guidance for the teacher, never an automatic change)
 *   csvRows -> csvText(rows) : CSV with UTF-8 BOM, formula-injection safe (=, +, -, @, tab, CR prefixed with ').
 */
(function (root) {
  "use strict";
  const A4W = 210, A4H = 297;
  const MARK = 9, MC = [[14, 14], [196, 14], [196, 283], [14, 283]];
  const BAR = { x: 80, y: 11, w: 50, h: 5 };
  const CODE = { x: 136, y: 271, s: 4, step: 5.5, bits: 9 };
  const LABELS = { en: "ABCDE", th: "กขคงจ", num: "12345" };

  // ---------------------------------------------------------------- layout
  function clampInt(v, lo, hi, d) { v = Math.round(Number(v)); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
  function layout(o) {
    o = o || {};
    const n = clampInt(o.n, 1, 100, 20), choices = clampInt(o.choices, 4, 5, 4) === 5 ? 5 : 4;
    const idDigits = clampInt(o.idDigits == null ? 5 : o.idDigits, 0, 10, 5);
    const labels = LABELS[o.labels] ? o.labels : "en";
    const rows = n <= 20 ? 10 : n <= 60 ? 20 : 25, cols = Math.ceil(n / rows);
    const pitchX = 6.4, pitchY = 6.3, r = 2.4, numW = 8;
    const colW = numW + r + (choices - 1) * pitchX + r, span = 166, slot = span / cols;
    const q = [], qcol = [];
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i / rows), rr = i % rows;
      const x0 = 22 + c * slot + (slot - colW) / 2;
      const y = 104 + rr * pitchY + Math.floor(rr / 5) * 2;
      const row = [];
      for (let k = 0; k < choices; k++) row.push({ x: +(x0 + numW + r + k * pitchX).toFixed(2), y: +y.toFixed(2), r });
      q.push(row); qcol.push({ col: c, x0: +x0.toFixed(2) });
    }
    const id = [], idR = 2.1, idPX = 6.2, idPY = 5.4;
    const idX0 = 188 - idR - (idDigits - 1) * idPX;
    for (let d = 0; d < idDigits; d++) {
      const col = [];
      for (let v = 0; v < 10; v++) col.push({ x: +(idX0 + d * idPX).toFixed(2), y: +(37 + v * idPY).toFixed(2), r: idR });
      id.push(col);
    }
    const bits = codeBits(n, choices);
    const code = bits.map((b, i) => ({ x: CODE.x + i * CODE.step, y: CODE.y, s: CODE.s, on: b }));
    return { w: A4W, h: A4H, n, choices, idDigits, labels, rows, cols, letters: LABELS[labels].slice(0, choices),
      markers: MC.map(([x, y]) => ({ x, y, s: MARK })), bar: Object.assign({}, BAR), code, q, qcol, id };
  }
  function codeBits(n, choices) {
    const b = [];
    for (let i = 0; i < 7; i++) b.push(((n - 1) >> i) & 1);
    b.push(choices === 5 ? 1 : 0);
    b.push(b.reduce((a, v) => a ^ v, 0));
    return b;
  }
  function decodeBits(b) {
    if (!b || b.length !== 9) return { ok: false };
    const par = b.slice(0, 8).reduce((a, v) => a ^ v, 0);
    let n = 0;
    for (let i = 0; i < 7; i++) n |= (b[i] ? 1 : 0) << i;
    return { ok: par === b[8] && n + 1 <= 100, n: n + 1, choices: b[7] ? 5 : 4 };
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
  /** text: {title, name, cls, no, date, id, idHint, fill, footer} — every value is escaped */
  function sheetSvg(L, text) {
    const t = text || {}, o = [];
    const f = (n, d) => (+n).toFixed(d == null ? 2 : d);
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${A4W} ${A4H}" width="${A4W}mm" height="${A4H}mm" class="om-svg" font-family="Prompt, 'Noto Sans Thai', sans-serif">`);
    o.push(`<rect x="0" y="0" width="${A4W}" height="${A4H}" fill="#fff"/>`);
    for (const m of L.markers) o.push(`<rect x="${f(m.x - m.s / 2)}" y="${f(m.y - m.s / 2)}" width="${m.s}" height="${m.s}" fill="#000"/>`);
    o.push(`<rect x="${L.bar.x}" y="${L.bar.y}" width="${L.bar.w}" height="${L.bar.h}" fill="#000"/>`);
    for (const c of L.code) {
      if (c.on) o.push(`<rect x="${f(c.x - c.s / 2)}" y="${f(c.y - c.s / 2)}" width="${c.s}" height="${c.s}" fill="#000"/>`);
      else o.push(`<rect x="${f(c.x - 0.4)}" y="${f(c.y - 0.4)}" width="0.8" height="0.8" fill="#bbb"/>`);
    }
    o.push(`<text x="22" y="28" font-size="5" font-weight="600" fill="#000">${esc(t.title)}</text>`);
    const line = (y, label) => o.push(`<text x="22" y="${y}" font-size="3.4" fill="#000">${esc(label)}</text>` +
      `<line x1="${22 + Math.max(14, String(label || "").length * 1.9)}" y1="${y + 0.8}" x2="${L.idDigits ? 132 : 188}" y2="${y + 0.8}" stroke="#555" stroke-width="0.25"/>`);
    line(38, t.name); line(46, t.cls); line(54, t.date);
    o.push(`<text x="22" y="64" font-size="3" fill="#000">${esc(t.fill)}</text>`);
    o.push(`<circle cx="24.4" cy="70" r="2.4" fill="#000"/><text x="29" y="71.1" font-size="3" fill="#000">✓</text>`);
    o.push(`<circle cx="38.4" cy="70" r="2.4" fill="none" stroke="#333" stroke-width="0.3"/><path d="M36.6 68.2l3.6 3.6M40.2 68.2l-3.6 3.6" stroke="#000" stroke-width="0.4"/><text x="43" y="71.1" font-size="3" fill="#000">✗</text>`);
    if (L.idDigits) {
      const x0 = L.id[0][0].x - 3.1;
      o.push(`<text x="${f(x0)}" y="24.6" font-size="3" fill="#000">${esc(t.id)}</text>`);
      for (const col of L.id) o.push(`<rect x="${f(col[0].x - 2.8)}" y="26.2" width="5.6" height="6.4" fill="none" stroke="#555" stroke-width="0.25"/>`);
      for (const col of L.id) for (let v = 0; v < 10; v++) {
        const b = col[v];
        o.push(`<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="none" stroke="#333" stroke-width="0.25"/><text x="${b.x}" y="${f(b.y + 0.9)}" font-size="2.4" text-anchor="middle" fill="#9a9a9a">${v}</text>`);
      }
      o.push(`<text x="188" y="94" font-size="2.6" text-anchor="end" fill="#555">${esc(t.idHint)}</text>`);
    }
    const done = new Set(), th = L.labels === "th" ? " lang=\"th\"" : ""; // Thai choice letters are sheet content
    L.q.forEach((row, i) => {
      const col = L.qcol[i];
      if (!done.has(col.col)) {
        done.add(col.col);
        row.forEach((b, k) => o.push(`<text x="${b.x}" y="${f(b.y - 5.4)}" font-size="2.8" font-weight="600" text-anchor="middle" fill="#000"${th}>${esc(L.letters[k])}</text>`));
      }
      o.push(`<text x="${f(row[0].x - row[0].r - 1.4)}" y="${f(row[0].y + 1.1)}" font-size="3" text-anchor="end" fill="#000">${i + 1}</text>`);
      for (let k = 0; k < row.length; k++) {
        const b = row[k];
        o.push(`<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="none" stroke="#333" stroke-width="0.25"/><text x="${b.x}" y="${f(b.y + 0.9)}" font-size="2.5" text-anchor="middle" fill="#9a9a9a"${th}>${esc(L.letters[k])}</text>`);
      }
    });
    o.push(`<text x="22" y="275" font-size="2.6" fill="#555">${esc(t.footer)}</text>`);
    o.push("</svg>");
    return o.join("");
  }

  // ---------------------------------------------------------------- image helpers
  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    return g;
  }
  function integral(gray, w, h) {
    const I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += gray[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
    }
    return I;
  }
  function boxMean(I, w, h, x, y, rad) {
    const x0 = Math.max(0, x - rad), y0 = Math.max(0, y - rad), x1 = Math.min(w, x + rad + 1), y1 = Math.min(h, y + rad + 1), W = w + 1;
    return (I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
  }
  function sample(gray, w, h, x, y) {
    if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return 255;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = gray[y0 * w + x0], b = gray[y0 * w + x1], c = gray[y1 * w + x0], d = gray[y1 * w + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  // ---------------------------------------------------------------- marker search
  /** dark blobs that are solid and compact (squares under any rotation / mild perspective) */
  function blobs(gray, w, h) {
    const I = integral(gray, w, h), rad = Math.max(8, Math.round(Math.max(w, h) / 14));
    const dark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, m = boxMean(I, w, h, x, y, rad);
      if (gray[i] < m * 0.72 && gray[i] < 170) dark[i] = 1;
    }
    const lab = new Int32Array(w * h), stack = new Int32Array(w * h), out = [];
    let next = 1;
    const minA = Math.max(12, (w * h) / 40000), maxA = (w * h) / 30;
    for (let s = 0; s < w * h; s++) {
      if (!dark[s] || lab[s]) continue;
      let sp = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, edge = false;
      stack[sp++] = s; lab[s] = next;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i - x) / w;
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        if (x > 0 && dark[i - 1] && !lab[i - 1]) { lab[i - 1] = next; stack[sp++] = i - 1; }
        if (x < w - 1 && dark[i + 1] && !lab[i + 1]) { lab[i + 1] = next; stack[sp++] = i + 1; }
        if (y > 0 && dark[i - w] && !lab[i - w]) { lab[i - w] = next; stack[sp++] = i - w; }
        if (y < h - 1 && dark[i + w] && !lab[i + w]) { lab[i + w] = next; stack[sp++] = i + w; }
      }
      next++;
      if (edge || n < minA || n > maxA) continue;
      const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      const det = cxx * cyy - cxy * cxy;
      if (det <= 0) continue;
      const tr = cxx + cyy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      const solid = n / (12 * Math.sqrt(det)), elong = l2 > 0 ? Math.sqrt(l1 / l2) : 99;
      if (elong > 1.6 || solid < 0.8 || solid > 1.2) continue;
      out.push({ x: mx, y: my, a: n, bw: x1 - x0 + 1, bh: y1 - y0 + 1, solid, elong });
    }
    return out;
  }
  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  /** order 4 points clockwise (image y down) starting with the one nearest the image top-left */
  function orderPts(p) {
    const cx = p.reduce((s, q) => s + q[0], 0) / 4, cy = p.reduce((s, q) => s + q[1], 0) / 4;
    const s = p.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    let k = 0;
    for (let i = 1; i < 4; i++) if (s[i][0] + s[i][1] < s[k][0] + s[k][1]) k = i;
    return s.slice(k).concat(s.slice(0, k));
  }
  function quadArea(p) { let a = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a) / 2; }
  function convex(p) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const c = cross(p[i], p[(i + 1) % 4], p[(i + 2) % 4]);
      if (Math.abs(c) < 1e-9) return false;
      const s = Math.sign(c);
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }
  function findMarkers(gray, w, h) {
    const all = blobs(gray, w, h).sort((a, b) => b.a - a.a);
    const c = all.slice(0, 14);
    if (c.length < 4) return { ok: false, why: "markers", cands: all.length };
    let best = null;
    for (let a = 0; a < c.length; a++) for (let b = a + 1; b < c.length; b++) for (let d = b + 1; d < c.length; d++) for (let e = d + 1; e < c.length; e++) {
      const set = [c[a], c[b], c[d], c[e]], areas = set.map(s => s.a);
      const sim = Math.min(...areas) / Math.max(...areas);
      if (sim < 0.3) continue;
      const pts = orderPts(set.map(s => [s.x, s.y]));
      if (!convex(pts)) continue;
      const qa = quadArea(pts), side = i => Math.hypot(pts[i][0] - pts[(i + 1) % 4][0], pts[i][1] - pts[(i + 1) % 4][1]);
      const s0 = (side(0) + side(2)) / 2, s1 = (side(1) + side(3)) / 2, asp = Math.max(s0, s1) / Math.min(s0, s1);
      if (asp < 1.0 || asp > 2.4) continue;
      const mean = areas.reduce((x, y) => x + y, 0) / 4;
      // a marker is 9 x 9 mm inside a 182 x 269 mm marker quad: expected area share ~ 81 / 48958
      const share = mean / qa, shareOk = share > 0.0004 && share < 0.006;
      if (!shareOk) continue;
      const score = qa * sim * (1 / (1 + Math.abs(Math.log(asp / 1.478)) * 2));
      if (!best || score > best.score) best = { score, pts, set };
    }
    if (!best) return { ok: false, why: "markers", cands: all.length };
    return { ok: true, pts: best.pts, size: Math.sqrt(best.set.reduce((s, b) => s + b.a, 0) / 4), cands: all.length };
  }

  // ---------------------------------------------------------------- homography
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const s = solve(A, b);
    return s ? s.concat([1]) : null;
  }
  function apply(H, x, y) {
    const d = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
  }

  // ---------------------------------------------------------------- reading
  const DISC = (() => { const p = [[0, 0]]; for (const [rr, k] of [[0.3, 6], [0.58, 12]]) for (let i = 0; i < k; i++) p.push([rr * Math.cos(i * 2 * Math.PI / k), rr * Math.sin(i * 2 * Math.PI / k)]); return p; })();
  function meanAt(gray, w, h, H, cx, cy, r, pts) {
    let s = 0;
    for (const [dx, dy] of pts) { const [u, v] = apply(H, cx + dx * r, cy + dy * r); s += sample(gray, w, h, u, v); }
    return s / pts.length;
  }
  function rectMean(gray, w, h, H, x, y, rw, rh) {
    let s = 0, n = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const [u, v] = apply(H, x + rw * (0.1 + 0.8 * i / 4), y + rh * (0.2 + 0.6 * j / 2)); s += sample(gray, w, h, u, v); n++;
    }
    return s / n;
  }
  /** largest gap in sorted values -> threshold between them (null when no clear gap) */
  function gapThreshold(vals, minGap) {
    const s = vals.slice().sort((a, b) => a - b);
    let best = 0, thr = null;
    for (let i = 1; i < s.length; i++) {
      const g = s[i] - s[i - 1], mid = (s[i] + s[i - 1]) / 2;
      if (mid < 0.22 || mid > 0.78) continue;
      if (g > best) { best = g; thr = mid; }
    }
    return best >= minGap ? { thr, gap: best } : null;
  }
  function read(gray, w, h, L, opts) {
    const o = opts || {}, minGap = o.minGap == null ? 0.12 : o.minGap;
    const fm = o.pts ? { ok: true, pts: o.pts } : findMarkers(gray, w, h);
    if (!fm.ok) return { ok: false, why: fm.why || "markers" };
    const sheetPts = L.markers.map(m => [m.x, m.y]);
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const img = [0, 1, 2, 3].map(i => fm.pts[(i + rot) % 4]);
      const H = homography(sheetPts, img);
      if (!H) continue;
      const black = L.markers.reduce((s, m) => s + meanAt(gray, w, h, H, m.x, m.y, m.s * 0.3, DISC), 0) / 4;
      const white = (rectMean(gray, w, h, H, 40, 3.5, 30, 3.5) + rectMean(gray, w, h, H, 140, 3.5, 30, 3.5)) / 2;
      const bar = rectMean(gray, w, h, H, L.bar.x, L.bar.y, L.bar.w, L.bar.h);
      const score = (white - bar) / Math.max(1, white - black);
      if (!best || score > best.score) best = { rot, H, score, black, white };
    }
    if (!best || best.score < 0.45) return { ok: false, why: "orientation", pts: fm.pts };
    const { H, black } = best;
    const localWhite = (b) => {
      let m = 0;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const k = (b.r + 0.9) / Math.SQRT2, [u, v] = apply(H, b.x + dx * k, b.y + dy * k);
        m = Math.max(m, sample(gray, w, h, u, v));
      }
      return m;
    };
    const darkness = b => {
      const wv = localWhite(b), v = meanAt(gray, w, h, H, b.x, b.y, b.r, DISC);
      return Math.max(0, Math.min(1, (wv - v) / Math.max(8, wv - black)));
    };
    const codeD = L.code.map(c => darkness({ x: c.x, y: c.y, r: c.s / 2 * 0.9 }));
    const bits = codeD.map(d => d > 0.5 ? 1 : 0);
    const dc = decodeBits(bits);
    const code = { ok: dc.ok, n: dc.n, choices: dc.choices, match: dc.ok && dc.n === L.n && dc.choices === L.choices };
    const dark = L.q.map(row => row.map(darkness));
    const idDark = L.id.map(col => col.map(darkness));
    const flat = [].concat(...dark, ...idDark);
    const g = gapThreshold(flat, minGap);
    const thr = g ? g.thr : 0.45;
    // "unsure" band: clearly darker than an empty bubble but clearly lighter than a filled one (faint mark, erasure)
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const lo = med(flat.filter(d => d < thr)), hiV = flat.filter(d => d >= thr), hi = hiV.length ? med(hiV) : 1;
    const span = Math.max(0.2, hi - lo), bandLo = Math.min(thr - 0.05, lo + 0.25 * span), bandHi = Math.max(thr + 0.05, hi - 0.2 * span);
    const isNear = d => d >= bandLo && d <= bandHi;
    const marks = [], flags = [];
    let unsure = 0;
    dark.forEach(row => {
      const m = [];
      row.forEach((d, k) => { if (d >= thr) m.push(k); });
      const near = row.some(isNear);
      marks.push(m);
      const f = m.length > 1 ? "multi" : near ? "unsure" : m.length === 0 ? "blank" : "";
      if (f === "unsure") unsure++;
      flags.push(f);
    });
    let id = "";
    const idFlags = idDark.map(col => {
      const on = []; col.forEach((d, v) => { if (d >= thr) on.push(v); });
      if (on.length === 1) { id += String(on[0]); return col.some(isNear) ? "unsure" : ""; }
      id += "?"; return on.length ? "multi" : "blank";
    });
    const quality = { contrast: +(best.white - black).toFixed(1), gap: g ? +g.gap.toFixed(3) : 0, orient: +best.score.toFixed(3), unsure };
    return { ok: true, H, rot: best.rot, pts: fm.pts, code, dark: dark.map(r => r.map(d => +d.toFixed(3))), marks, flags, id, idFlags, thr: +thr.toFixed(3), quality };
  }
  function warp(gray, w, h, H, ppm) {
    const k = ppm || 2, W = Math.round(A4W * k), Hh = Math.round(A4H * k), out = new Uint8ClampedArray(W * Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const [u, v] = apply(H, (x + 0.5) / k, (y + 0.5) / k);
      out[y * W + x] = sample(gray, w, h, u, v);
    }
    return { data: out, w: W, h: Hh, ppm: k };
  }

  // ---------------------------------------------------------------- grading
  function charIndex(ch, choices) {
    const u = ch.toUpperCase();
    for (const set of Object.values(LABELS)) { const i = set.indexOf(u); if (i >= 0 && i < choices) return i; }
    return -1;
  }
  function parseKey(text, choices, n) {
    const s = String(text || "").replace(/[,;|\s]+/g, " ").trim();
    const out = [];
    const toks = s.includes(" ") ? s.split(" ") : Array.from(s.replace(/\(([^)]*)\)/g, (m, g) => "[" + g + "]")).reduce((a, ch) => {
      if (a.open) { if (ch === "]") a.open = false; else a.list[a.list.length - 1] += ch; } else if (ch === "[") { a.open = true; a.list.push(""); } else a.list.push(ch);
      return a;
    }, { open: false, list: [] }).list;
    for (const t of toks) {
      if (!t || /^[-?_.]+$/.test(t)) { out.push([]); continue; }
      const parts = Array.from(t.replace(/[/()[\]]/g, "")), idx = [];
      for (const ch of parts) { const i = charIndex(ch, choices); if (i >= 0 && !idx.includes(i)) idx.push(i); }
      out.push(idx.sort((a, b) => a - b));
    }
    if (n) { while (out.length < n) out.push([]); out.length = n; }
    return out;
  }
  function keyText(key, letters) {
    const L = letters || LABELS.en;
    return key.map(k => !k || !k.length ? "-" : k.length === 1 ? L[k[0]] : "(" + k.map(i => L[i]).join("") + ")").join("");
  }
  function grade(marks, key) {
    const res = [];
    let score = 0, max = 0;
    for (let i = 0; i < key.length; i++) {
      const k = key[i] || [], m = (marks && marks[i]) || [];
      if (!k.length) { res.push("x"); continue; }
      max++;
      if (!m.length) res.push("b");
      else if (m.length > 1) res.push("m");
      else if (k.includes(m[0])) { res.push("c"); score++; }
      else res.push("w");
    }
    return { score, max, res };
  }
  function stats(xs) {
    const n = xs.length;
    if (!n) return { n: 0, mean: 0, sd: 0, median: 0, min: 0, max: 0 };
    const mean = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const s = xs.slice().sort((a, b) => a - b), median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { n, mean, sd, median, min: s[0], max: s[n - 1] };
  }
  function analyse(sheets, key, choices) {
    const gs = sheets.map(s => grade(s.marks, key));
    const scores = gs.map(g => g.score), st = stats(scores), n = sheets.length;
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
    const g27 = Math.max(1, Math.round(n * 0.27)), upper = new Set(order.slice(0, g27)), lower = new Set(order.slice(-g27));
    let pq = 0, graded = 0;
    const items = key.map((k, q) => {
      const counts = Array(choices).fill(0);
      let blank = 0, multi = 0, right = 0, up = 0, lo = 0;
      sheets.forEach((s, i) => {
        const m = (s.marks && s.marks[q]) || [];
        if (!m.length) blank++; else if (m.length > 1) multi++; else if (m[0] < choices) counts[m[0]]++;
        if (gs[i].res[q] === "c") { right++; if (upper.has(i)) up++; if (lower.has(i)) lo++; }
      });
      if (!k || !k.length || !n) return { q, p: null, d: null, rpb: null, counts, blank, multi, hint: "" };
      const p = right / n, d = n >= 2 ? (up - lo) / g27 : null;
      graded++; pq += p * (1 - p);
      // point-biserial against the rest score (total without this item)
      const xs = gs.map((g, i) => g.score - (g.res[q] === "c" ? 1 : 0)), ys = gs.map(g => g.res[q] === "c" ? 1 : 0);
      const mx = xs.reduce((a, b) => a + b, 0) / n, my = p;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
      const rpb = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
      const hint = d != null && d < 0 ? "neg-d" : p >= 0.9 ? "easy" : p < 0.2 ? "hard" : d != null && d < 0.2 ? "low-d" : "";
      return { q, p, d, rpb, counts, blank, multi, hint };
    });
    const varT = st.sd * st.sd, kr20 = graded > 1 && n > 1 && varT > 0 ? (graded / (graded - 1)) * (1 - pq / varT) : null;
    return Object.assign(st, { kr20, items, max: st.max, graded });
  }

  // ---------------------------------------------------------------- CSV
  function cell(v) {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
  }
  function csvText(rows) { return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n"; }
  function marksText(m, letters) { return !m || !m.length ? "" : m.map(i => letters[i] || "?").join("|"); }

  const api = { layout, codeBits, decodeBits, sheetSvg, toGray, blobs, findMarkers, orderPts, homography, apply, read, warp,
    gapThreshold, parseKey, keyText, grade, stats, analyse, csvText, cell, marksText, LABELS, A4W, A4H };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LQOMR = api;
})(typeof window !== "undefined" ? window : globalThis);

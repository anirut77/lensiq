"use strict";
// tests/unit/omr.test.js — lensiq-omr.js (LQOMR): sheet layout (20/40/60/100 questions, 4/5 choices, fits A4 inside the
// markers, no overlaps), format code + parity, SVG escaping, homography round trip, and the full reading pipeline on
// synthetic photos (sheet rendered in Node, warped with a perspective, rotated 90 / 180 degrees, uneven light, a dark
// table around the paper, noise): marker search, orientation, bubble fill, blank / multi / faint marks flagged, student
// number; grading, key parsing, item analysis (p, upper-lower d, KR-20 vs hand computation), CSV injection safety; plus
// static checks of omr.html / omr.js: no AI / face / network / emotion APIs, no images stored, dictionaries complete.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const O = require("../../lensiq-omr.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---------- synthetic sheet renderer (gray, k px per mm) ----------
function renderSheet(L, fills, k, opts) {
  const o = opts || {}, W = Math.round(O.A4W * k), H = Math.round(O.A4H * k), g = new Uint8Array(W * H).fill(250);
  const rect = (x, y, w, h, v) => { for (let yy = Math.round(y * k); yy < Math.round((y + h) * k); yy++) for (let xx = Math.round(x * k); xx < Math.round((x + w) * k); xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) g[yy * W + xx] = v; };
  const disc = (cx, cy, r, v, ring) => {
    for (let yy = Math.floor((cy - r - 1) * k); yy <= Math.ceil((cy + r + 1) * k); yy++) for (let xx = Math.floor((cx - r - 1) * k); xx <= Math.ceil((cx + r + 1) * k); xx++) {
      const d = Math.hypot(xx / k - cx, yy / k - cy);
      if (ring ? Math.abs(d - r) <= ring / 2 : d <= r) g[yy * W + xx] = v;
    }
  };
  for (const m of L.markers) rect(m.x - m.s / 2, m.y - m.s / 2, m.s, m.s, 10);
  rect(L.bar.x, L.bar.y, L.bar.w, L.bar.h, 10);
  for (const c of L.code) if (c.on) rect(c.x - c.s / 2, c.y - c.s / 2, c.s, c.s, 10);
  rect(22, 24, 60, 4, 40); rect(22, 36, 100, 0.4, 90); rect(22, 44, 100, 0.4, 90); // title + writing lines
  const bub = (b, val) => { disc(b.x, b.y, b.r, 60, 0.3); rect(b.x - 0.6, b.y - 0.8, 1.2, 1.6, 160); if (val != null) disc(b.x, b.y, b.r * 0.92, val); };
  L.q.forEach((row, i) => row.forEach((b, c) => bub(b, fills.q[i] && fills.q[i][c] != null ? fills.q[i][c] : null)));
  L.id.forEach((col, d) => col.forEach((b, v) => bub(b, fills.id && fills.id[d] === v ? 35 : null)));
  if (o.scribble) rect(30, 80, 6, 6, 20); // a solid ink blob in the header (must not be taken for a marker)
  return { g, W, H };
}
/** photograph: paper (sheet) placed by homography sheet-mm -> image px, dark table, light falloff, noise */
function photo(sheet, k, w, h, corners, opts) {
  const o = opts || {};
  const Hs = O.homography([[0, 0], [O.A4W, 0], [O.A4W, O.A4H], [0, O.A4H]], corners);
  const inv = O.homography(corners, [[0, 0], [O.A4W, 0], [O.A4W, O.A4H], [0, O.A4H]]);
  const g = new Uint8Array(w * h);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [u, v] = O.apply(inv, x, y);
    let val = 70;
    if (u >= 0 && v >= 0 && u < O.A4W && v < O.A4H) val = sheet.g[Math.min(sheet.H - 1, Math.floor(v * k)) * sheet.W + Math.min(sheet.W - 1, Math.floor(u * k))];
    const light = o.light ? 1 - 0.35 * (x / w) * (y / h) : 1;
    g[y * w + x] = Math.max(0, Math.min(255, Math.round(val * light + (rnd() - 0.5) * (o.noise || 10))));
  }
  return { g, Hs };
}
function fillsFor(L, answers, extra) {
  const q = L.q.map((row, i) => { const a = []; const v = answers[i]; if (v != null) for (const c of [].concat(v)) a[c] = 35; return a; });
  if (extra) for (const [i, c, val] of extra) q[i][c] = val;
  return q;
}

test("layout: every format fits inside the markers, bubbles never overlap, numbers / letters / format code correct", () => {
  for (const n of [20, 40, 60, 100, 1, 37]) for (const choices of [4, 5]) {
    const L = O.layout({ n, choices, idDigits: 5 });
    assert.equal(L.q.length, n); assert.equal(L.q[0].length, choices);
    const all = [].concat(...L.q, ...L.id);
    for (const b of all) {
      assert.ok(b.x - b.r > 19 && b.x + b.r < 191, `x inside ${n}/${choices}: ${b.x}`);
      assert.ok(b.y - b.r > 20 && b.y + b.r < 270, `y inside ${n}/${choices}: ${b.y}`);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      assert.ok(d >= all[i].r + all[j].r + 0.9, `gap ${n}/${choices} ${i}/${j}: ${d}`);
    }
    const dec = O.decodeBits(L.code.map(c => c.on));
    assert.deepEqual(dec, { ok: true, n, choices });
  }
  assert.equal(O.layout({ n: 20 }).cols, 2); assert.equal(O.layout({ n: 40 }).cols, 2);
  assert.equal(O.layout({ n: 60 }).cols, 3); assert.equal(O.layout({ n: 100 }).cols, 4);
  assert.equal(O.layout({ n: 20, choices: 5, labels: "th" }).letters, "กขคงจ");
  const bad = O.layout({ n: 999, choices: 9, idDigits: -3 });
  assert.equal(bad.n, 100); assert.equal(bad.choices, 5); assert.equal(bad.idDigits, 0);
  const bits = O.codeBits(40, 5); bits[2] ^= 1;
  assert.equal(O.decodeBits(bits).ok, false, "a flipped bit fails the parity check");
});

test("sheetSvg: A4 size, every bubble drawn, user text escaped", () => {
  const L = O.layout({ n: 40, choices: 5, idDigits: 4 });
  const svg = O.sheetSvg(L, { title: "<script>alert(1)</script> & \"x\"", name: "ชื่อ", footer: "LENSIQ" });
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.ok(!svg.includes("<script>")); assert.ok(svg.includes("&lt;script&gt;"));
  assert.equal((svg.match(/<circle /g) || []).length, 40 * 5 + 4 * 10 + 2);
});

test("homography maps the 4 points exactly and round-trips", () => {
  const src = [[14, 14], [196, 14], [196, 283], [14, 283]], dst = [[120, 80], [900, 130], [960, 1250], [60, 1180]];
  const H = O.homography(src, dst), Hi = O.homography(dst, src);
  src.forEach((p, i) => { const q = O.apply(H, p[0], p[1]); assert.ok(Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1]) < 1e-6); });
  const q = O.apply(H, 100, 150), back = O.apply(Hi, q[0], q[1]);
  assert.ok(Math.hypot(back[0] - 100, back[1] - 150) < 1e-6);
});

const K = 4; // render resolution px / mm
const sheets = {};
function sheetFor(n, choices, answers, extra, opts) {
  const L = O.layout({ n, choices, idDigits: 5 });
  const id = sheets.id || [0, 4, 2, 1, 7];
  return { L, s: renderSheet(L, { q: fillsFor(L, answers, extra), id }, K, opts) };
}
const ANS = Array.from({ length: 100 }, (_, i) => (i * 7 + 3) % 5);

test("read: straight-on photo of a 40 x 5 sheet — every mark, student number, format code", () => {
  const answers = ANS.slice(0, 40).map(a => a); answers[5] = null; // blank
  const { L, s } = sheetFor(40, 5, answers, [[9, 0, 35], [9, 1, 35]]); // q10 two marks
  const ph = photo(s, K, 900, 1250, [[60, 50], [840, 50], [840, 1200], [60, 1200]]);
  const r = O.read(ph.g, 900, 1250, L);
  assert.ok(r.ok, r.why); assert.equal(r.rot, 0);
  assert.equal(r.id, "04217"); assert.ok(r.code.match);
  for (let i = 0; i < 40; i++) {
    if (i === 5) { assert.deepEqual(r.marks[i], []); assert.equal(r.flags[i], "blank"); continue; }
    if (i === 9) { assert.equal(r.flags[i], "multi"); assert.ok(r.marks[i].length >= 2); continue; }
    assert.deepEqual(r.marks[i], [answers[i]], "q" + (i + 1));
  }
});

test("read: perspective + uneven light + dark table + ink blob, 100 x 5", () => {
  const { L, s } = sheetFor(100, 5, ANS, null, { scribble: true });
  const ph = photo(s, K, 1000, 1300, [[150, 60], [880, 120], [960, 1240], [40, 1180]], { light: true, noise: 16 });
  const r = O.read(ph.g, 1000, 1300, L);
  assert.ok(r.ok, r.why);
  assert.equal(r.id, "04217");
  const wrong = r.marks.map((m, i) => m.length === 1 && m[0] === ANS[i] ? null : i + 1).filter(Boolean);
  assert.deepEqual(wrong, []);
});

test("read: sheet photographed upside down and sideways (orientation bar), 20 x 4", () => {
  const answers = ANS.slice(0, 20).map(a => a % 4);
  const { L, s } = sheetFor(20, 4, answers);
  // 180 degrees: the sheet's top-left lands at the image bottom-right
  const up = photo(s, K, 900, 1250, [[840, 1200], [60, 1200], [60, 50], [840, 50]]);
  const r1 = O.read(up.g, 900, 1250, L);
  assert.ok(r1.ok, r1.why); assert.equal(r1.rot, 2);
  assert.deepEqual(r1.marks.map(m => m[0]), answers); assert.equal(r1.id, "04217");
  // 90 degrees (landscape photo): sheet top-left at image top-right
  const side = photo(s, K, 1250, 900, [[1200, 60], [1200, 840], [50, 840], [50, 60]]);
  const r2 = O.read(side.g, 1250, 900, L);
  assert.ok(r2.ok, r2.why);
  assert.deepEqual(r2.marks.map(m => m[0]), answers); assert.equal(r2.id, "04217");
});

test("read: faint mark is flagged 'unsure', wrong sheet format is reported, no markers -> ok:false", () => {
  const answers = ANS.slice(0, 20).map(a => a % 4);
  const { L, s } = sheetFor(20, 4, answers, [[3, (answers[3] + 1) % 4, 165]]);
  const ph = photo(s, K, 900, 1250, [[60, 50], [840, 50], [840, 1200], [60, 1200]]);
  const r = O.read(ph.g, 900, 1250, L);
  assert.ok(r.ok);
  assert.ok(["unsure", "multi"].includes(r.flags[3]), "faint second mark flagged: " + r.flags[3] + " " + r.dark[3]);
  const L60 = O.layout({ n: 60, choices: 4, idDigits: 5 });
  const r60 = O.read(ph.g, 900, 1250, L60);
  assert.ok(r60.ok); assert.equal(r60.code.match, false); assert.equal(r60.code.n, 20); assert.equal(r60.code.choices, 4);
  const blank = new Uint8Array(400 * 500).fill(240);
  assert.equal(O.read(blank, 400, 500, L).ok, false);
});

test("warp: straightened picture has the markers black at their mm positions", () => {
  const { L, s } = sheetFor(20, 4, ANS.slice(0, 20).map(a => a % 4));
  const ph = photo(s, K, 900, 1250, [[100, 60], [820, 80], [850, 1190], [70, 1170]]);
  const r = O.read(ph.g, 900, 1250, L);
  const wp = O.warp(ph.g, 900, 1250, r.H, 2);
  assert.equal(wp.w, 420); assert.equal(wp.h, 594);
  for (const m of L.markers) assert.ok(wp.data[Math.round(m.y * 2) * wp.w + Math.round(m.x * 2)] < 80);
  assert.ok(wp.data[Math.round(150 * 2) * wp.w + Math.round(14 * 2)] > 180, "margin stays white");
});

test("parseKey / keyText: letters, Thai letters, digits, gaps, multiple accepted answers", () => {
  assert.deepEqual(O.parseKey("ABCD", 4), [[0], [1], [2], [3]]);
  assert.deepEqual(O.parseKey("กขคงจ", 5), [[0], [1], [2], [3], [4]]);
  assert.deepEqual(O.parseKey("1 2 3 4", 4), [[0], [1], [2], [3]]);
  assert.deepEqual(O.parseKey("a-(bc)D", 4), [[0], [], [1, 2], [3]]);
  assert.deepEqual(O.parseKey("A, B/C, ?", 4), [[0], [1, 2], []]);
  assert.deepEqual(O.parseKey("AE", 4), [[0], []], "E is outside 4 choices");
  assert.deepEqual(O.parseKey("AB", 4, 4), [[0], [1], [], []]);
  assert.equal(O.keyText([[0], [], [1, 2], [3]], "ABCD"), "A-(BC)D");
  assert.deepEqual(O.parseKey(O.keyText([[0], [], [1, 2], [3]], "ABCD"), 4), [[0], [], [1, 2], [3]]);
});

test("grade: correct / wrong / blank / multi / excluded", () => {
  const g = O.grade([[0], [2], [], [0, 1], [3], [1]], [[0], [1], [2], [0], [], [1, 2]]);
  assert.deepEqual(g.res, ["c", "w", "b", "m", "x", "c"]);
  assert.equal(g.score, 2); assert.equal(g.max, 5);
});

test("analyse: difficulty, discrimination, distractors, KR-20 (hand-computed)", () => {
  const key = [[0], [1], [2], []];
  const rows = [[[0], [1], [2], [0]], [[0], [1], [3], [1]], [[0], [0], [2], []], [[1], [0], [3], [2]], [[0], [1], [], [0]]];
  const a = O.analyse(rows.map(marks => ({ marks })), key, 4);
  assert.equal(a.n, 5); assert.equal(a.graded, 3);
  // scores: 3, 2, 2, 0, 2
  assert.equal(a.mean, 9 / 5); assert.equal(a.median, 2); assert.equal(a.min, 0); assert.equal(a.max, 3);
  assert.equal(a.items[0].p, 0.8); assert.deepEqual(a.items[0].counts, [4, 1, 0, 0]);
  assert.equal(a.items[2].blank, 1); assert.equal(a.items[3].p, null);
  const ps = [0.8, 0.6, 0.4], pq = ps.reduce((s, p) => s + p * (1 - p), 0);
  const sc = [3, 2, 2, 0, 2], m = 9 / 5, v = sc.reduce((s, x) => s + (x - m) ** 2, 0) / 5;
  assert.ok(Math.abs(a.kr20 - 1.5 * (1 - pq / v)) < 1e-12);
  // upper 27 % of 5 = 1 sheet (score 3, row 0) vs lower 1 sheet (score 0, row 3): item 1 -> d = 1
  assert.equal(a.items[0].d, 1);
  assert.equal(O.analyse([], key, 4).n, 0);
});

test("csvText: BOM, quoting, formula injection neutralised", () => {
  const t = O.csvText([["=1+1", "+A", "-2", "@x", "ok, \"q\""], ["ก", 3]]);
  assert.ok(t.startsWith("﻿"));
  assert.ok(t.includes("'=1+1,'+A,'-2,'@x,\"ok, \"\"q\"\"\""));
  assert.equal(O.marksText([0, 2], "ABCD"), "A|C"); assert.equal(O.marksText([], "ABCD"), "");
});

test("omr page: no AI / face / emotion / network APIs, no image persistence, dictionaries complete", () => {
  const js = read("omr.js") + read("lensiq-omr.js"), html = read("omr.html");
  for (const bad of [/face-api|faceapi|FaceDetector|detectFaces|lensiq-detect|\bort\.|onnx|tensorflow|tfjs/i, /emotion|deception|lie detect|attention score/i,
    /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.share/]) assert.ok(!bad.test(js), "forbidden " + bad);
  assert.ok(!/toDataURL|localStorage\.setItem\([^)]*(img|image|photo|frame)/i.test(js), "no image is persisted");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "no inline script (CSP)");
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  const keys = new Set();
  for (const m of (html + read("omr.js")).matchAll(/data-i18n(?:-attr)?="([^"]+)"|\bT\("([\w.]+)"/g)) {
    if (m[1]) for (const part of m[1].split(";")) keys.add(part.includes(":") ? part.split(":")[1] : part); else keys.add(m[2]);
  }
  for (const lang of ["en", "zh"]) {
    const src = read(`i18n/${lang}-omr.js`), have = new Set([...src.matchAll(/^\s*"([\w.]+)":/gm)].map(m => m[1]));
    const missing = [...keys].filter(k => k.startsWith("om.") && !have.has(k));
    assert.deepEqual(missing, [], lang + " missing");
    assert.ok(!/[ก-๛]/.test(src.replace(/"om\.lab\.th":\s*"[^"]*"/, "")), lang + " has no Thai (except the Thai letter-set name)");
  }
});

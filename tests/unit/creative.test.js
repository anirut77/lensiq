"use strict";
// node --test tests/unit — creative-core.js (Creative Lab metrics) on synthetic images + creative-guide.js / 中文 key coverage.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../../creative-core.js");
const G = require("../../creative-guide.js");

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ""} expected ${b} ± ${eps}, got ${a}`);
function img(w, h, f) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y); d[4 * (y * w + x)] = c[0]; d[4 * (y * w + x) + 1] = c[1]; d[4 * (y * w + x) + 2] = c[2]; d[4 * (y * w + x) + 3] = 255; }
  return { data: d, width: w, height: h };
}
const fill = (im, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) im.data.set([c[0], c[1], c[2], 255], 4 * (y * im.width + x)); };
/* a line of glyph-like shapes ("n", "o", "l" strokes) — what printed text looks like to an edge detector */
function textLine(im, x0, y0, n, size, c) {
  const sw = Math.max(1, Math.round(size / 7)), gw = Math.round(size * 0.6), gap = Math.round(size * 0.25);
  for (let k = 0, x = x0; k < n; k++) {
    const kind = k % 3;
    fill(im, x, y0, sw, size, c);                                   // left stem
    if (kind !== 2) { fill(im, x + gw - sw, y0 + (kind ? 0 : size >> 2), sw, kind ? size : size - (size >> 2), c); fill(im, x, y0, gw, sw, c); }
    if (kind === 1) fill(im, x, y0 + size - sw, gw, sw, c);        // "o": bottom bar
    x += (kind === 2 ? sw : gw) + gap;                              // narrow advance after "l", like a real font
  }
}
const mapOf = (w, h, f) => { const d = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y); return { data: d, w, h }; };

test("WCAG relative luminance, contrast ratio and levels", () => {
  near(C.contrastRatio([0, 0, 0], [255, 255, 255]), 21, 1e-9, "black/white");
  near(C.contrastRatio([119, 119, 119], [255, 255, 255]), 4.48, 0.01, "#777 on white");
  near(C.contrastRatio([255, 255, 255], [119, 119, 119]), C.contrastRatio([119, 119, 119], [255, 255, 255]), 1e-12, "symmetric");
  near(C.relLuminance([255, 0, 0]), 0.2126, 1e-4, "red luminance");
  assert.equal(C.wcagLevel(7.1, false), "AAA"); assert.equal(C.wcagLevel(4.5, false), "AA"); assert.equal(C.wcagLevel(3.2, false), "AA-large");
  assert.equal(C.wcagLevel(2.9, false), "fail"); assert.equal(C.wcagLevel(3.0, true), "AA"); assert.equal(C.wcagLevel(4.6, true), "AAA"); assert.equal(C.wcagLevel(2.5, true), "fail");
});

test("CIELAB conversion round-trips and colour families", () => {
  const w = C.rgbToLab([255, 255, 255]); near(w[0], 100, 0.01, "L white"); near(w[1], 0, 0.01); near(w[2], 0, 0.01);
  const r = C.rgbToLab([255, 0, 0]); near(r[0], 53.24, 0.05, "L red"); near(r[1], 80.09, 0.1, "a red"); near(r[2], 67.20, 0.1, "b red");
  for (const c of [[12, 200, 77], [250, 128, 3], [40, 40, 160], [200, 200, 200]]) assert.deepEqual(C.labToRgb(C.rgbToLab(c)), c);
  const fam = { red: [255, 0, 0], orange: [255, 165, 0], yellow: [255, 215, 0], green: [0, 128, 0], cyan: [0, 255, 255], blue: [0, 0, 255],
    purple: [128, 0, 128], pink: [255, 192, 203], brown: [139, 69, 19], black: [10, 10, 10], white: [250, 250, 250], grey: [128, 128, 128] };
  for (const k in fam) assert.equal(C.colourFamily(fam[k]), k, k);
  for (const k in fam) assert.ok(G.COLOURS[k], "colour note for " + k);
  near(C.deltaE([50, 0, 0], [50, 3, 4]), 5, 1e-12);
  assert.equal(C.hex([255, 16, 0]), "#ff1000");
});

test("FFT matches a naive DFT and inverts; 2-D round trip", () => {
  const n = 16, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(i * 0.7) + (i % 3);
  const r0 = Float64Array.from(re);
  C.fft1(re, im, false);
  for (let k = 0; k < n; k++) {
    let sr = 0, si = 0; for (let t = 0; t < n; t++) { sr += r0[t] * Math.cos(-2 * Math.PI * k * t / n); si += r0[t] * Math.sin(-2 * Math.PI * k * t / n); }
    near(re[k], sr, 1e-9, "re " + k); near(im[k], si, 1e-9, "im " + k);
  }
  C.fft1(re, im, true); for (let i = 0; i < n; i++) near(re[i], r0[i], 1e-9);
  const N = 8, a = Float64Array.from({ length: N * N }, (_, i) => (i * 7) % 5), b = new Float64Array(N * N), a0 = Float64Array.from(a);
  C.fft2(a, b, N, false); near(a[0], a0.reduce((s, v) => s + v, 0), 1e-9, "DC = sum"); C.fft2(a, b, N, true);
  for (let i = 0; i < N * N; i++) near(a[i], a0[i], 1e-9);
});

test("resample keeps the mean; blur keeps a constant; normalize", () => {
  const src = Float32Array.from({ length: 64 * 48 }, (_, i) => (i * 13) % 17);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  near(mean(C.resample(src, 64, 48, 16, 12)), mean(src), 1e-3, "area average mean");
  const up = C.resample(Float32Array.from([0, 1]), 2, 1, 4, 1); assert.deepEqual(Array.from(up), [0, 0.25, 0.75, 1]);
  const flat = C.blur(new Float32Array(100).fill(3), 10, 10, 2); assert.ok(flat.every(v => Math.abs(v - 3) < 1e-5));
  const n = C.normalize(Float32Array.from([2, 4, 6])); assert.deepEqual(Array.from(n), [0, 0.5, 1]);
  assert.ok(C.normalize(new Float32Array(5).fill(7)).every(v => v === 0), "constant -> zeros");
  assert.deepEqual(C.fitSize(1000, 500, 128), { w: 128, h: 64 }); assert.deepEqual(C.fitSize(50, 40, 128), { w: 50, h: 40 });
});

test("saliency components pick the pop-out target (colour singleton among grey distractors)", () => {
  const im = img(256, 192, () => [128, 128, 128]);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 6; gx++) fill(im, 20 + gx * 40, 20 + gy * 44, 16, 16, [90, 90, 90]);
  fill(im, 180, 130, 16, 16, [235, 30, 30]); // the one red square (grid cell gx=4, gy=~2.5)
  const comp = C.components(im);
  assert.deepEqual([comp.w, comp.h], [128, 96]);
  const at = (m, x, y) => m[Math.round(y / 2) * 128 + Math.round(x / 2)];
  const rest = m => { let s = 0, c = 0; for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 6; gx++) { s += at(m, 28 + gx * 40, 28 + gy * 44); c++; } return s / c; };
  assert.ok(at(comp.ik, 188, 138) > 2 * rest(comp.ik), `Itti: target ${at(comp.ik, 188, 138)} vs distractors ${rest(comp.ik)}`);
  assert.ok(at(comp.sr, 188, 138) > rest(comp.sr), `SR: target ${at(comp.sr, 188, 138)} vs distractors ${rest(comp.sr)}`);
  const map = C.combine(comp, {});
  near(map.data.reduce((s, v) => s + v, 0), 1, 1e-4, "map sums to 1");
  const first = C.fixationOrder(map, { n: 3 })[0];
  near(first.x, 188 / 256, 0.08, "first look x"); near(first.y, 138 / 192, 0.1, "first look y");
});

test("priors: centre bias peak, box prior peak at the face, combine adds face attention", () => {
  const cb = C.centerBias(9, 9); assert.equal(cb.indexOf(Math.max(...cb)), 40);
  const bp = C.boxPrior(20, 10, [{ x: 0.725, y: 0.25, w: 0.2, h: 0.4 }]); const i = bp.indexOf(Math.max(...bp)); assert.equal(i % 20, 16); assert.equal((i / 20) | 0, 4);
  const comp = { sr: new Float32Array(32 * 24), ik: new Float32Array(32 * 24), w: 32, h: 24 };
  const face = { x: 0.05, y: 0.1, w: 0.2, h: 0.3 };
  const a = C.regionShare(C.combine(comp, {}), face).share, b = C.regionShare(C.combine(comp, { faces: [face] }), face).share;
  assert.ok(b > 3 * a, `face prior raises its share ${a} -> ${b}`);
});

test("fixationOrder: strongest blob first, inhibition of return, stops at weak peaks", () => {
  const blob = (cx, cy, s, a) => (x, y) => a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  const m = mapOf(100, 100, (x, y) => blob(20, 20, 4, 1)(x, y) + blob(80, 70, 4, 0.6)(x, y) + blob(50, 90, 4, 0.05)(x, y));
  const o = C.fixationOrder(m, { n: 5, radius: 0.12 });
  assert.equal(o.length, 2, "third blob is below minRel: " + JSON.stringify(o));
  near(o[0].x, 0.205, 0.011); near(o[0].y, 0.205, 0.011); near(o[1].x, 0.805, 0.011); near(o[1].y, 0.705, 0.011);
  assert.ok(o[0].share > o[1].share && o[0].share > 0.4);
});

test("regionShare: uniform map gives share = area, lift = 1; regionReport ranks", () => {
  const u = mapOf(40, 20, () => 1), s = C.regionShare(u, { x: 0.25, y: 0, w: 0.5, h: 0.5 });
  near(s.share, 0.25, 1e-9); near(s.area, 0.25, 1e-9); near(s.lift, 1, 1e-9);
  const rr = C.regionReport(u, [{ type: "cta", x: 0.5, y: 0.5, w: 0.2, h: 0.2 }], [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.6 }]);
  assert.equal(rr[0].rank, 2); assert.equal(rr[0].type, "cta");
});

test("benchmark metrics: NSS, CC, AUC-Judd, AUC-Borji on hand-checkable cases", () => {
  const w = 10, h = 10, fix = [11, 55, 88];
  const perfect = mapOf(w, h, (x, y) => fix.includes(y * w + x) ? 1 : 0);
  near(C.aucJudd(perfect, fix), 1, 1e-6, "perfect AUC-Judd");
  assert.ok(C.aucBorji(perfect, fix) > 0.95, "perfect AUC-Borji");
  const uniform = mapOf(w, h, () => 1);
  assert.equal(C.nss(uniform, fix), 0);
  // NSS: z-scored map values at fixations; map = 1 at one pixel, 0 elsewhere -> mean 0.01, sd = sqrt(0.99*0.01*100/99)
  const one = mapOf(w, h, (x, y) => y * w + x === 11 ? 1 : 0), sd = Math.sqrt((0.99 * 0.99 + 99 * 0.0001) / 99);
  near(C.nss(one, [11]), 0.99 / sd, 1e-6, "NSS single pixel");
  near(C.cc(perfect.data, perfect.data), 1, 1e-12); near(C.cc(perfect.data, perfect.data.map(v => 1 - v)), -1, 1e-12);
  // inverted map: fixations get the lowest values -> the ROC jumps to (1, 1/3) first: trapezoid area 1/6 (Judd's definition)
  near(C.aucJudd(mapOf(w, h, (x, y) => fix.includes(y * w + x) ? 0 : 1), fix), 1 / 6, 1e-6, "inverted AUC-Judd");
  // random map ~ 0.5 over many fixations
  const R = C.rng(3), rnd = mapOf(64, 64, () => R()), many = Array.from({ length: 400 }, () => Math.floor(R() * 4096));
  near(C.aucJudd(rnd, many), 0.5, 0.06, "random AUC-Judd"); near(C.aucBorji(rnd, many, { nSplits: 20 }), 0.5, 0.06, "random AUC-Borji");
  // ramp map, fixations on the right half -> AUC-Judd = 0.75ish (half the negatives above every positive)
  const ramp = mapOf(w, h, x => x), right = []; for (let y = 0; y < h; y++) for (let x = 5; x < w; x++) right.push(y * w + x);
  near(C.aucJudd(ramp, right), 1, 0.11, "ramp vs right half");
});

test("clarity: edge density, colourfulness bands, colour count, complexity", () => {
  const flat = img(64, 64, () => [200, 200, 200]), checker = img(64, 64, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [0, 0, 0] : [255, 255, 255]);
  assert.equal(C.edgeDensity(flat), 0); assert.ok(C.edgeDensity(checker) > 0.9);
  near(C.colorfulness(flat), 0, 1e-9, "grey is not colourful");
  const rg = img(64, 64, x => x < 32 ? [255, 0, 0] : [0, 255, 0]);
  assert.ok(C.colorfulness(rg) > 109); assert.equal(C.colorfulBand(C.colorfulness(rg)), "extreme"); assert.equal(C.colorfulBand(20), "slight");
  assert.equal(C.colourCount(flat), 1); assert.equal(C.colourCount(rg), 2);
  const noise = img(64, 64, (x, y) => [(x * 37 + y * 11) % 256, (x * 7 + y * 53) % 256, (x * y) % 256]);
  assert.ok(C.colourCount(noise) > 400);
  const lo = C.complexityScore(C.edgeDensity(flat), C.colourCount(flat)), hi = C.complexityScore(C.edgeDensity(noise), C.colourCount(noise));
  assert.equal(lo, 0); assert.ok(hi >= 55 && hi <= 100, "noise is high complexity " + hi);
  assert.equal(C.complexityBand(lo), "low"); assert.equal(C.complexityBand(hi), "high");
});

test("detectText finds glyph lines, rejects solid blocks, outlines and flat images; textContrast grades them", () => {
  const im = img(400, 300, () => [255, 255, 255]);
  textLine(im, 30, 30, 12, 24, [20, 20, 20]);        // headline, black
  textLine(im, 30, 120, 24, 8, [200, 200, 200]);     // small light-grey text (< 4% of the height = normal size)
  fill(im, 250, 180, 120, 80, [30, 90, 200]);        // a solid block (product shot)
  for (let x = 20; x < 200; x++) { fill(im, x, 200, 1, 2, [0, 0, 0]); fill(im, x, 280, 1, 2, [0, 0, 0]); } // rectangle outline
  for (let y = 200; y < 282; y++) { fill(im, 20, y, 2, 1, [0, 0, 0]); fill(im, 199, y, 2, 1, [0, 0, 0]); }
  const T = C.detectText(im);
  const head = T.find(t => Math.abs(t.y - 30 / 300) < 0.02), small = T.find(t => Math.abs(t.y - 120 / 300) < 0.02);
  assert.ok(head && head.w > 0.4, "headline found: " + JSON.stringify(T));
  assert.ok(small && small.w > 0.3, "light text found: " + JSON.stringify(T));
  assert.ok(!T.some(t => t.y > 0.55), "no text in the block/outline area: " + JSON.stringify(T));
  assert.equal(C.detectText(img(200, 100, () => [128, 128, 128])).length, 0);
  const hc = C.textContrast(im, head), lc = C.textContrast(im, small);
  assert.ok(hc.ratio > 15 && hc.level === "AAA", "black on white " + JSON.stringify(hc));
  assert.ok(lc.ratio < 2 && lc.level === "fail", "light grey fails " + JSON.stringify(lc));
  assert.ok(hc.fg[0] < 60 && hc.bg[0] > 240, "text = minority cluster (dark), background = white");
  assert.equal(hc.large, true); assert.equal(lc.large, false);
  near(C.rectsArea([{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.25, y: 0, w: 0.5, h: 0.5 }]), 0.375, 1e-9, "union area");
});

test("palette: dominant colours with shares and families; distinctiveness of a patch", () => {
  const im = img(100, 100, (x, y) => y < 60 ? [30, 80, 200] : x < 70 ? [250, 250, 250] : [247, 103, 7]);
  const p = C.palette(im);
  assert.equal(p.length, 3, JSON.stringify(p));
  assert.deepEqual(p.map(c => c.family), ["blue", "white", "orange"]);
  near(p[0].share, 0.6, 0.02); near(p[1].share, 0.28, 0.02); near(p[2].share, 0.12, 0.02);
  assert.deepEqual(C.palette(im), p, "deterministic");
  assert.ok(C.distinctiveness(im, { x: 0.7, y: 0.6, w: 0.3, h: 0.4 }) > 40, "orange patch stands out");
  assert.ok(C.distinctiveness(img(50, 50, () => [9, 9, 9]), { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }) < 1e-9);
});

test("gaze: head direction from landmarks and gaze targets", () => {
  const eye = cx => Array.from({ length: 6 }, (_, k) => ({ x: cx + k - 2.5, y: 50 }));
  assert.equal(C.gaze({ le: eye(40), re: eye(60), nose: { x: 50, y: 60 } }).dir, 0);
  assert.equal(C.gaze({ le: eye(40), re: eye(60), nose: { x: 57, y: 60 } }).dir, 1);
  assert.equal(C.gaze({ le: eye(40), re: eye(60), nose: { x: 43, y: 60 } }).dir, -1);
  const face = { x: 0.1, y: 0.4, w: 0.15, h: 0.2 }, regs = [{ type: "product", x: 0.6, y: 0.4, w: 0.2, h: 0.2 }, { type: "brand", x: 0.0, y: 0.0, w: 0.1, h: 0.1 }];
  assert.deepEqual(C.gazeTargets(face, 1, regs).map(r => r.type), ["product"]);
  assert.deepEqual(C.gazeTargets(face, -1, regs), []);
  assert.deepEqual(C.gazeTargets(face, 0, regs), []);
  assert.equal(C.zone({ x: 0.9, y: 0.9 }), "br"); assert.equal(C.zone({ x: 0.5, y: 0.5 }), "c"); assert.equal(C.zone({ x: 0.1, y: 0.2 }), "tl");
});

test("findings + compare: rules, statuses, keys that exist in the guide", () => {
  const base = { order: [], textArea: 0.1, texts: [{ level: "AA" }, { level: "fail" }], complexity: 70, faces: [{ dir: 1, targets: ["product"] }] };
  const good = C.findings({ ...base, regions: [{ type: "cta", x: 0.7, y: 0.8, w: 0.2, h: 0.1, share: 0.2, lift: 3, rank: 1, distinct: 40 }, { type: "brand", x: 0, y: 0, w: 0.2, h: 0.1, share: 0.1, lift: 2, rank: 2 }] });
  const st = id => good.find(f => f.id === id);
  assert.equal(st("restorff").status, "good"); assert.equal(st("exposure").status, "good"); assert.equal(st("reading").key, "f.read.cta.ok");
  assert.equal(st("gaze").status, "good"); assert.equal(st("legibility").status, "tip"); assert.equal(st("clutter").status, "tip");
  const none = C.findings({ regions: [], order: [], textArea: 0.4, texts: [], complexity: 20, faces: [] });
  assert.equal(none.find(f => f.id === "restorff").key, "f.cta.none"); assert.equal(none.find(f => f.id === "reading").key, "f.read.heavy");
  const blend = C.findings({ ...base, regions: [{ type: "cta", x: 0.1, y: 0.1, w: 0.1, h: 0.1, share: 0.01, lift: 0.5, rank: 0, distinct: 8 }] });
  assert.equal(blend.find(f => f.id === "restorff").key, "f.cta.blend");
  const ids = new Set(G.CARDS.map(c => c.id));
  for (const f of [...good, ...none, ...blend]) {
    assert.ok(ids.has(f.id), "card for " + f.id); assert.ok(["good", "tip", "info"].includes(f.status));
    assert.ok(G.FINDINGS[f.key], "finding text for " + f.key);
    for (const v of (G.FINDINGS[f.key].match(/\{(\w+)\}/g) || [])) assert.ok(v.slice(1, -1) in f.vars, `${f.key} var ${v}`);
  }
  const A = { name: "A", regions: [{ type: "cta", share: 0.3, area: 0.05, rank: 1 }], texts: [{ level: "AA" }], complexity: 30, textArea: 0.1 };
  const B = { name: "B", regions: [{ type: "cta", share: 0.04, area: 0.05, rank: 0 }], texts: [{ level: "fail" }], complexity: 75, textArea: 0.4 };
  const r = C.compare([B, A]);
  assert.equal(r.winner, 1); assert.equal(r.close, false); assert.ok(r.why.includes("focus") && r.why.includes("legible"), JSON.stringify(r.why));
  assert.ok(r.rows.every(x => x.total >= 0 && x.total <= 1));
  const tie = C.compare([A, { ...A, name: "A2" }]); assert.equal(tie.winner, null); assert.equal(tie.close, true);
  for (const k of Object.keys(C.score(A).parts)) assert.ok(G.PARTS[k], "part label " + k);
});

test("中文 dictionary covers every key used by creative.html, creative.js and creative-guide.js", () => {
  const root = path.join(__dirname, "..", "..");
  const win = { LQI18N_Q: [] }; vm.runInNewContext(fs.readFileSync(path.join(root, "i18n/zh-creative.js"), "utf8"), { window: win });
  const zh = Object.assign({}, ...win.LQI18N_Q.map(e => e.zh));
  const html = fs.readFileSync(path.join(root, "creative.html"), "utf8"), js = fs.readFileSync(path.join(root, "creative.js"), "utf8");
  const need = new Set(Object.keys(G.keys()));
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) need.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) need.add(p.split(":")[1]);
  for (const m of js.matchAll(/T\("(cr\.[^"]+)",/g)) need.add(m[1]);
  for (const v of ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"]) need.add("cr.js.pos." + v);
  for (const v of ["low", "medium", "high"]) need.add("cr.js.band." + v);
  for (const v of ["none", "slight", "moderate", "average", "quite", "high", "extreme"]) need.add("cr.js.cf." + v);
  for (const v of ["AAA", "AA", "AA-large", "fail"]) need.add("cr.js.lv." + v);
  for (const v of ["good", "tip", "info"]) need.add("cr.js.st." + v);
  for (const t of ["brand", "product", "cta", "price", "message"]) need.add("cr.s.type." + t);
  const missing = [...need].filter(k => !(k in zh));
  assert.deepEqual(missing, [], "keys without 中文");
  const thaiInZh = Object.entries(zh).filter(([, v]) => /[฀-๿]/.test(v)).map(([k]) => k);
  assert.deepEqual(thaiInZh, [], "Thai text left in the 中文 dictionary");
  // placeholders survive translation
  const th = G.keys();
  for (const k in th) for (const v of (th[k].match(/\{(\w+)\}/g) || [])) assert.ok(zh[k].includes(v), `${k} keeps ${v}`);
  // no "AI" in user-facing labels
  assert.ok(!/\bAI\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")) && !Object.values(th).some(v => /\bAI\b/.test(v)) && !Object.values(zh).some(v => /\bAI\b/.test(v)));
});

"use strict";
// tests/unit/studio-r10.test.js — round 10 studio / photo booth additions: ID-photo spec checker, photo booth outfit check,
// jaw/ear crop features, calibrated confidence, high-collar cover layer, PNG/JPEG "outfit preview" metadata
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const zlib = require("node:zlib");
const Q = require(path.join(__dirname, "..", "..", "studio-qa.js"));
const SC = require(path.join(__dirname, "..", "..", "studio-core.js"));
const PL = require(path.join(__dirname, "..", "..", "photobooth-layout.js"));

const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };

/** synthetic 1-inch ID photo (295×354 @ 300 DPI): plain background, head ellipse, shoulders */
function idPhoto({ bg = [240, 240, 240], noisyBg = false, skin = [200, 160, 130], headTop = 40, chinY = 245 } = {}) {
  const W = PL.cmToPx(2.5), H = PL.cmToPx(3.0), px = new Uint8ClampedArray(W * H * 4), cx = W / 2, cy = (headTop + chinY) / 2, ry = (chinY - headTop) / 2, rx = ry * .78;
  const alpha = fill(W, H, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 || (y > chinY + 10 && Math.abs(x - cx) < 120) ? 1 : 0);
  for (let i = 0; i < W * H; i++) { const v = alpha[i] ? skin : noisyBg ? bg.map(c => c + ((i * 7919) % 61) - 30) : bg; px.set([...v, 255], i * 4); }
  return { px, alpha, W, H, face: { cx, eyeY: cy - ry * .1, chinY, fw: rx * 2 } };
}

test("idSpecCheck: a well framed 1-inch photo on a plain background passes every item", () => {
  const p = idPhoto(), r = Q.idSpecCheck({ ...p, size: PL.ID_SIZES["1"] });
  assert.ok(r.pass, JSON.stringify(r.items));
  assert.deepEqual(r.items.map(i => i.k), ["size", "head", "top", "center", "bg", "exposure", "outfit"]);
  assert.equal(r.icao, false);
  assert.ok(Q.idSpecCheck({ ...p, size: PL.ID_SIZES["2"] }).icao);
});
test("idSpecCheck: wrong size, small head, busy background, dark face and a synthetic outfit are each reported", () => {
  const k = r => r.items.filter(i => !i.ok).map(i => i.k);
  assert.ok(k(Q.idSpecCheck({ ...idPhoto(), W: 300, size: PL.ID_SIZES["1"] })).includes("size"));
  assert.ok(k(Q.idSpecCheck({ ...idPhoto({ headTop: 120, chinY: 230 }), size: PL.ID_SIZES["1"] })).includes("head"));
  assert.deepEqual(k(Q.idSpecCheck({ ...idPhoto({ noisyBg: true }), size: PL.ID_SIZES["1"] })), ["bg"]);
  assert.deepEqual(k(Q.idSpecCheck({ ...idPhoto({ skin: [40, 30, 25] }), size: PL.ID_SIZES["1"] })), ["exposure"]);
  assert.deepEqual(k(Q.idSpecCheck({ ...idPhoto(), size: PL.ID_SIZES["1"], outfit: true })), ["outfit"]);
});

test("boothCheck: original clothes beside the drawn outfit, a straight hair cut and a neck gap fail; a covering outfit passes", () => {
  const W = 295, H = 354, face = { cx: 147, eyeY: 120, chinY: 200, fw: 120 }, clipY = 204;
  const head = (x, y) => ((x - 147) / 60) ** 2 + ((y - 150) / 55) ** 2 <= 1;
  const neck = (x, y) => y >= 195 && y < 240 && Math.abs(x - 147) < 35;
  const body = (x, y) => y >= 240 && Math.abs(x - 147) < 140;
  const outfit = (x, y) => y >= 230 && Math.abs(x - 147) < 145;
  const ok = Q.boothCheck({ pa: fill(W, H, (x, y) => head(x, y) || neck(x, y) || body(x, y) ? 1 : 0), oa: fill(W, H, (x, y) => outfit(x, y) ? 1 : 0), W, H, face, clipY });
  assert.ok(ok.pass, JSON.stringify(ok));
  // outfit too narrow: the person's own jacket shows at both sides
  const left = Q.boothCheck({ pa: fill(W, H, (x, y) => head(x, y) || neck(x, y) || body(x, y) ? 1 : 0), oa: fill(W, H, (x, y) => y >= 230 && Math.abs(x - 147) < 90 ? 1 : 0), W, H, face, clipY });
  assert.deepEqual(left.fails, ["leftover"]);
  // long hair down to the shoulders, cut straight where the outfit starts
  const hair = (x, y) => y > 120 && y < 300 && Math.abs(x - 147) > 55 && Math.abs(x - 147) < 95;
  const cut = Q.boothCheck({ pa: fill(W, H, (x, y) => head(x, y) || neck(x, y) || body(x, y) || hair(x, y) ? 1 : 0), oa: fill(W, H, (x, y) => y >= 200 && Math.abs(x - 147) < 145 ? 1 : 0), W, H, face, clipY });
  assert.ok(cut.fails.includes("hair-cut"), JSON.stringify(cut));
  // a notch of background between the neck and the collar
  const gap = Q.boothCheck({ pa: fill(W, H, (x, y) => (head(x, y) || neck(x, y) || body(x, y)) && !(y > 205 && y < 228 && x > 150 && x < 175) ? 1 : 0), oa: fill(W, H, (x, y) => outfit(x, y) ? 1 : 0), W, H, face, clipY });
  assert.ok(gap.fails.includes("neck-gap"), JSON.stringify(gap));
  assert.deepEqual(Q.boothVerdict(cut.m), cut.fails);
});

test("jawCrop + jawFeatures: standard 64-px face scale; a background gap under the jaw raises gapEdge, hair over the jaw lowers open", () => {
  const W = 400, H = 400, face = { cx: 200, chinX: 200, eyeY: 150, chinY: 240, fw: 128 };
  const head = (x, y) => ((x - 200) / 64) ** 2 + ((y - 170) / 72) ** 2 <= 1, neck = (x, y) => y >= 220 && y < 330 && Math.abs(x - 200) < 50, body = (x, y) => y >= 300;
  const mk = ({ gap = false, hair = false }) => {
    const fg = fill(W, H, (x, y) => (head(x, y) || neck(x, y) || body(x, y)) && !(gap && y > 230 && y < 260 && Math.abs(x - 200) > 25 && Math.abs(x - 200) < 50) ? 1 : 0);
    const keep = fill(W, H, (x, y) => head(x, y) || (hair && Math.abs(x - 200) > 30 && Math.abs(x - 200) < 95 && y > 120 && y < 300) ? 1 : 0);
    const hairA = fill(W, H, (x, y) => hair && Math.abs(x - 200) > 30 && Math.abs(x - 200) < 95 && y > 120 && y < 300 ? 1 : 0);
    const out = new Uint8ClampedArray(W * H * 4).fill(200);
    return Q.jawCrop({ out, fg, keepA: keep, srcA: fill(W, H, (x, y) => head(x, y) || neck(x, y) || body(x, y) ? 1 : 0), hair: hairA, neckA: fill(W, H, (x, y) => neck(x, y) ? 1 : 0), frontA: fill(W, H, (x, y) => body(x, y) ? 1 : 0), src: out, W, H, face });
  };
  const C = mk({});
  assert.equal(C.w, Math.round((Q.JC.x1 - Q.JC.x0) * Q.JC.fw)); assert.equal(C.h, Math.round((Q.JC.y1 - Q.JC.y0) * Q.JC.fw));
  const a = Q.jawFeatures(C), b = Q.jawFeatures(mk({ gap: true })), c = Q.jawFeatures(mk({ hair: true }));
  for (const k of ["seam", "gapEdge", "straight", "jump", "lumStep", "open", "exposed", "earCut", "cutPx"]) assert.ok(Number.isFinite(a[k]), k);
  assert.ok(b.gapEdge > a.gapEdge, JSON.stringify([a.gapEdge, b.gapEdge]));
  assert.ok(c.open < a.open, JSON.stringify([a.open, c.open]));
});

test("confidence: calibrated per variant, below the 0.5 bar, so the page never picks an outfit by itself", () => {
  const pass = {}, fail = { neck: { bgPct: 50 } };
  const c = Q.confidence(pass, {}, { cover: true }), p = Q.confidence(pass, {}, { cover: false });
  assert.ok(c.p < c.t && p.p < p.t && !c.show && !p.show);
  assert.equal(Q.confidence(fail, {}, {}), null);
  assert.equal(Q.defaultOutfitAllowed(), false);
  assert.equal(Q.defaultOutfitAllowed({ kind: "calibrated", t: .5, clean: { cover: .6, plain: .3 } }), true);
});

test("coverLayer: knit high collar from under the jaw to below the collar line, no wider than the neck at the top", () => {
  const W = 300, H = 400, face = { cx: 150, chinX: 150, eyeY: 120, chinY: 200, fw: 120 }, fit = { N: { x: 150, y: 260 }, s: 70, theta: 0, drop: 0 };
  const L = SC.coverLayer(W, H, face, fit, { color: [40, 40, 50], nw: .33, half: 34 });
  const at = (x, y) => L.alpha[y * W + x];
  assert.ok(at(150, 215) > .9 && at(150, 250) > .9, "covers the neck");
  assert.equal(at(150, 120), 0, "never above the jaw line");
  assert.equal(at(150 + 70, 205), 0, "not wider than the neck under the jaw");
  const neck = { rgba: new Uint8ClampedArray(W * H * 4).fill(200), alpha: new Float32Array(W * H).fill(1) };
  SC.mergeCover(neck, L, W * H);
  assert.ok(neck.rgba[(230 * W + 150) * 4] < 80, "fabric over the neck");
});

test("PNG tEXt/iTXt and JPEG COM 'outfit preview' notes are written and read back", () => {
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(SC.crc32(b, 4, 8 + d.length), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(1, 0); ih.writeUInt32BE(1, 4); ih[8] = 8; ih[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 1, 2, 3]))), chunk("IEND", Buffer.alloc(0))]);
  const o = SC.pngWithText(new Uint8Array(png), [["Description", "outfit preview"], ["Comment", "ภาพจำลองชุด"]]);
  assert.deepEqual(SC.pngTexts(o), { Description: "outfit preview", Comment: "ภาพจำลองชุด" });
  assert.equal(SC.crc32(Buffer.from("123456789")), 0xcbf43926);
  const jpg = SC.jpegWithComment(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "outfit preview");
  assert.deepEqual([...jpg.slice(0, 4)], [0xff, 0xd8, 0xff, 0xfe]);
  assert.equal(Buffer.from(jpg.slice(6, 6 + 14)).toString(), "outfit preview");
  assert.equal(SC.pngWithText(new Uint8Array([1, 2, 3]), [["a", "b"]]).length, 3, "non-PNG untouched");
});

test("previewMark: corner label drawn inside the image (bottom-right)", () => {
  const calls = []; const ctx = { save() {}, restore() {}, beginPath() {}, fill() {}, rect() {}, roundRect() {}, set font(v) { calls.push(v); }, set textBaseline(v) {}, set fillStyle(v) {}, measureText: t => ({ width: t.length * 8 }), fillText: (...a) => calls.push(a) };
  const r = PL.previewMark(ctx, 295, 354, "ภาพจำลองชุด / outfit preview");
  assert.ok(r.x >= 0 && r.x + r.w <= 295 && r.y + r.h <= 354 && r.y > 354 / 2, JSON.stringify(r));
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === "ภาพจำลองชุด / outfit preview"));
});

"use strict";
// tests/unit/studio.test.js — studio-core.js (สตูดิโอแต่งชุด): pure image functions on synthetic images.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const S = require(path.join(__dirname, "..", "..", "studio-core.js"));

const rgbaFill = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = v[3] == null ? 255 : v[3]; } return d; };
const rand = S.rng(42);
const noiseImg = (w, h, base, amp) => rgbaFill(w, h, () => base.map(b => b + (rand() - .5) * 2 * amp));

/** Brute-force guided filter (reference): explicit window sums. */
function guidedRef(I, p, w, h, r, eps) {
  const mean = (arr) => { const o = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) { s += arr[j * w + i]; n++; } o[y * w + x] = s / n; } return o; };
  const n = w * h, Ip = new Float64Array(n), II = new Float64Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = mean(I), mp = mean(p), mIp = mean(Ip), mII = mean(II), a = new Float64Array(n), b = new Float64Array(n);
  for (let i = 0; i < n; i++) { a[i] = (mIp[i] - mI[i] * mp[i]) / (mII[i] - mI[i] * mI[i] + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = mean(a), mb = mean(b), q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

test("boxFilter: matches brute-force window mean incl. borders", () => {
  const w = 13, h = 9, a = Float32Array.from({ length: w * h }, () => rand());
  const o = S.boxFilter(a, w, h, 2);
  for (const [x, y] of [[0, 0], [6, 4], [12, 8], [1, 7]]) {
    let s = 0, n = 0; for (let j = Math.max(0, y - 2); j <= Math.min(h - 1, y + 2); j++) for (let i = Math.max(0, x - 2); i <= Math.min(w - 1, x + 2); i++) { s += a[j * w + i]; n++; }
    assert.ok(Math.abs(o[y * w + x] - s / n) < 1e-5);
  }
});

test("guidedFilter: equals brute-force reference; preserves a step edge when guided by it; smooths noise", () => {
  const w = 24, h = 18, I = Float32Array.from({ length: w * h }, () => rand()), p = Float32Array.from({ length: w * h }, () => rand());
  const q = S.guidedFilter(I, p, w, h, 3, 1e-3), ref = guidedRef(I, p, w, h, 3, 1e-3);
  let maxErr = 0; for (let i = 0; i < q.length; i++) maxErr = Math.max(maxErr, Math.abs(q[i] - ref[i]));
  assert.ok(maxErr < 1e-3, "max err " + maxErr);
  // edge-preserving: guide = clean step, input = noisy step -> output step stays sharp, noise reduced
  const W = 40, H = 20, step = Float32Array.from({ length: W * H }, (_, i) => (i % W) < 20 ? .1 : .9);
  const noisy = Float32Array.from(step, v => v + (rand() - .5) * .2);
  const out = S.guidedFilter(step, noisy, W, H, 4, 1e-4);
  const row = 10 * W;
  assert.ok(out[row + 19] < .2 && out[row + 20] > .8, `edge kept: ${out[row + 19]} ${out[row + 20]}`);
  let vin = 0, vout = 0; for (let x = 2; x < 16; x++) { vin += (noisy[row + x] - .1) ** 2; vout += (out[row + x] - .1) ** 2; }
  assert.ok(vout < vin * .2, "noise reduced");
});

test("refineMatte: snaps a blocky (upsampled) mask to the image edge", () => {
  const w = 64, h = 32;
  const img = rgbaFill(w, h, x => x < 30 ? [230, 200, 180] : [20, 40, 60]); // true edge at x=30
  const coarse = Float32Array.from({ length: w * h }, (_, i) => (i % w) < 32 ? 1 : 0); // mask edge off by 2 px
  const a = S.refineMatte(img, coarse, w, h, { r: 4, k: 2 });
  const y = 16 * w;
  assert.ok(a[y + 28] > .9 && a[y + 31] < .5 && a[y + 33] < .05, `alpha follows image edge: ${a[y + 28]} ${a[y + 31]}`);
});

test("estimateForeground: removes background colour bleeding into semi-transparent edge pixels", () => {
  const w = 40, h = 10, F = [200, 160, 140], B = [0, 255, 0];
  const alpha = Float32Array.from({ length: w * h }, (_, i) => S.clamp01(((i % w) - 15) / -10 + 1)); // 1 .. 0 ramp over x 15..25
  const img = rgbaFill(w, h, (x, y) => { const a = alpha[y * w + x]; return F.map((f, c) => a * f + (1 - a) * B[c]); });
  const out = S.estimateForeground(img, alpha, w, h);
  const i = (5 * w + 21) * 4; // alpha ≈ .4: observed colour is very green
  assert.ok(img[i + 1] > 200 && Math.abs(out[i + 1] - F[1]) < 25 && Math.abs(out[i] - F[0]) < 25, `green removed ${img[i + 1]} -> ${out[i + 1]}`);
  const j = (5 * w + 5) * 4; assert.deepEqual([...out.slice(j, j + 3)], [...img.slice(j, j + 3)], "opaque pixels unchanged");
});

test("Lab round trip", () => {
  for (const c of [[0, 0, 0], [255, 255, 255], [200, 30, 90], [12, 140, 250]]) {
    const L = S.rgbToLab(...c), r = S.labToRgb(...L);
    r.forEach((v, k) => assert.ok(Math.abs(v - c[k]) < .6, `${c} -> ${r}`));
  }
});

test("Reinhard transfer moves Lab mean/std of the masked region to the target; outside mask untouched", () => {
  const w = 40, h = 40, img = noiseImg(w, h, [90, 120, 160], 20);
  const mask = Float32Array.from({ length: w * h }, (_, i) => (i % w) < 30 ? 1 : 0);
  const src = S.labStats(img, w, h, mask), dst = { mean: [65, 18, 22], std: [6, 3, 4] };
  const out = S.reinhardTransfer(img, w, h, mask, src, dst);
  const got = S.labStats(out, w, h, mask);
  for (let c = 0; c < 3; c++) {
    assert.ok(Math.abs(got.mean[c] - dst.mean[c]) < 1.2, `mean ${c}: ${got.mean[c]} vs ${dst.mean[c]}`);
    assert.ok(Math.abs(got.std[c] - dst.std[c]) < dst.std[c] * .25 + .5, `std ${c}: ${got.std[c]} vs ${dst.std[c]}`);
  }
  for (let y = 0; y < h; y++) for (let x = 30; x < w; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 4; c++) assert.equal(out[i + c], img[i + c]); }
  // strength 0 = identity
  assert.deepEqual(S.reinhardTransfer(img, w, h, mask, src, dst, { strength: 0 }), img);
});

test("Laplacian blend: continuous seam (no step) between two flat images; far regions keep their source", () => {
  const w = 128, h = 32, A = [new Float32Array(w * h).fill(.2)], B = [new Float32Array(w * h).fill(.8)];
  const M = Float32Array.from({ length: w * h }, (_, i) => (i % w) >= 64 ? 1 : 0);
  const [out] = S.laplacianBlend(A, B, M, w, h, 5);
  const row = 16 * w; let maxJump = 0;
  for (let x = 1; x < w; x++) maxJump = Math.max(maxJump, Math.abs(out[row + x] - out[row + x - 1]));
  assert.ok(maxJump < .6 * .35, "hard cut would jump .6; got " + maxJump.toFixed(3));
  for (let x = 1; x < w; x++) assert.ok(out[row + x] >= out[row + x - 1] - 1e-4, "monotonic");
  assert.ok(Math.abs(out[row + 2] - .2) < .02 && Math.abs(out[row + w - 3] - .8) < .02, `ends ${out[row + 2]} ${out[row + w - 3]}`);
  // a sharp detail inside B survives (high frequencies follow the sharp mask)
  const B2 = [Float32Array.from({ length: w * h }, (_, i) => (i % w) === 100 ? 1 : .8)];
  const [o2] = S.laplacianBlend(A, B2, M, w, h, 5);
  assert.ok(o2[row + 100] - o2[row + 98] > .15, "detail kept " + (o2[row + 100] - o2[row + 98]));
  // M == 0 everywhere -> exactly A (reconstruction is lossless)
  const A3 = [Float32Array.from({ length: w * h }, () => rand())];
  const [o3] = S.laplacianBlend(A3, B, new Float32Array(w * h), w, h, 4);
  let e = 0; for (let i = 0; i < o3.length; i++) e = Math.max(e, Math.abs(o3[i] - A3[0][i]));
  assert.ok(e < 1e-5, "lossless " + e);
});

test("TPS maps anchor points exactly, is identity for identity input, and warpRGBA moves a marker onto its target", () => {
  const from = [{ x: 50, y: 20 }, { x: 10, y: 60 }, { x: 90, y: 62 }, { x: 15, y: 120 }, { x: 85, y: 118 }, { x: 50, y: 125 }];
  const to = [{ x: 52, y: 28 }, { x: 5, y: 70 }, { x: 101, y: 66 }, { x: 12, y: 130 }, { x: 95, y: 126 }, { x: 54, y: 134 }];
  const t = S.tpsFit(from, to);
  from.forEach((p, i) => { const q = t.map(p.x, p.y); assert.ok(Math.hypot(q.x - to[i].x, q.y - to[i].y) < 1e-6, `anchor ${i}: ${JSON.stringify(q)}`); });
  const id = S.tpsFit(from, from), q = id.map(33.3, 77.7);
  assert.ok(Math.abs(q.x - 33.3) < 1e-6 && Math.abs(q.y - 77.7) < 1e-6);
  // warp: source marker at from[1]; warped image (inverse map to->from) has it at to[1]
  const sw = 110, sh = 140, src = new Uint8ClampedArray(sw * sh * 4);
  const k = (from[1].y * sw + from[1].x) * 4; src[k] = 255; src[k + 3] = 255;
  const inv = S.tpsFit(to, from);
  const out = S.warpRGBA(src, sw, sh, sw, sh, inv.map, { step: 1 });
  const o = (to[1].y * sw + to[1].x) * 4;
  assert.equal(out[o], 255); assert.equal(out[o + 3], 255);
  // grid-interpolated warp lands within 1 px
  const out8 = S.warpRGBA(src, sw, sh, sw, sh, inv.map, { step: 8 });
  let best = null; for (let i = 0; i < sw * sh; i++) if (out8[i * 4 + 3] > 0) { const x = i % sw, y = (i / sw) | 0; const d = Math.hypot(x - to[1].x, y - to[1].y); if (!best || d < best) best = d; }
  assert.ok(best != null && best <= 1.5, "step 8 marker distance " + best);
});

test("similarity maps two points exactly", () => {
  const s = S.similarity({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 25 });
  const a = s.map(0, 0), b = s.map(10, 0);
  assert.ok(Math.hypot(a.x - 5, a.y - 5) < 1e-9 && Math.hypot(b.x - 5, b.y - 25) < 1e-9);
  assert.ok(Math.abs(s.scale - 2) < 1e-9);
});

/** synthetic silhouette: head ellipse + neck + trapezoid shoulders */
function silhouette(w, h, { cx = 100, headY = 60, fw = 50, sh = 66 } = {}) {
  const a = new Float32Array(w * h), chin = headY + fw * .62;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const head = ((x - cx) / (fw / 2)) ** 2 + ((y - headY) / (fw * .62)) ** 2 < 1;
    const neck = y >= chin - 4 && y < chin + fw * .3 && Math.abs(x - cx) < fw * .28;
    const yy = y - (chin + fw * .3), body = yy >= 0 && Math.abs(x - cx) < Math.min(sh, fw * .3 + yy * 3);
    if (head || neck || body) a[y * w + x] = 1;
  }
  return { a, chin };
}

test("estimateBody: finds neck and shoulders on a synthetic silhouette; headFromMatte finds the chin", () => {
  const w = 200, h = 240, { a, chin } = silhouette(w, h);
  const b = S.estimateBody(a, w, h, { cx: 100, chinY: chin, fw: 50 });
  assert.ok(b.ok, "ok");
  assert.ok(Math.abs((b.right.x - b.left.x) - 2 * 66 * .85) < 12, "shoulder width " + (b.right.x - b.left.x));
  assert.ok(Math.abs(b.neck.w - 28) < 6, "neck width " + b.neck.w);
  const hd = S.headFromMatte(a, w, h);
  assert.ok(hd && Math.abs(hd.chinY - chin) < 14 && Math.abs(hd.cx - 100) < 3, JSON.stringify(hd));
  // garmentShoulders uses the same rule on a garment alpha (the body part only)
  const g = Float32Array.from(a, (v, i) => ((i / w) | 0) > chin + 15 ? v : 0);
  const gs = S.garmentShoulders(g, w, h, { x: 100, y: chin }, 50);
  assert.ok(gs && Math.abs((gs.right.x - gs.left.x) - (b.right.x - b.left.x)) < 10, JSON.stringify(gs));
});

test("smoothSkin: pixels outside the mask are bit-identical; inside, noise is reduced", () => {
  const w = 60, h = 60, img = noiseImg(w, h, [200, 150, 130], 25);
  const mask = new Float32Array(w * h); for (let y = 15; y < 45; y++) for (let x = 15; x < 45; x++) mask[y * w + x] = 1;
  const out = S.smoothSkin(img, w, h, mask, { strength: 1, radius: 4, keep: 0, blemish: 1 });
  let changedOutside = 0; for (let i = 0; i < w * h; i++) if (mask[i] === 0) for (let c = 0; c < 4; c++) if (out[i * 4 + c] !== img[i * 4 + c]) changedOutside++;
  assert.equal(changedOutside, 0);
  const sd = d => { let s = 0, q = 0, n = 0; for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) { const v = d[(y * w + x) * 4]; s += v; q += v * v; n++; } return Math.sqrt(q / n - (s / n) ** 2); };
  assert.ok(sd(out) < sd(img) * .6, `sd ${sd(img).toFixed(1)} -> ${sd(out).toFixed(1)}`);
});

test("smoothSkin blemish heal removes a small dark spot", () => {
  const w = 60, h = 60, img = rgbaFill(w, h, (x, y) => Math.hypot(x - 30, y - 30) < 2.5 ? [120, 70, 60] : [205, 160, 140]);
  const mask = new Float32Array(w * h).fill(1);
  const plain = S.smoothSkin(img, w, h, mask, { strength: .3, radius: 6, keep: .3 });
  const healed = S.smoothSkin(img, w, h, mask, { strength: .3, radius: 6, keep: .3, blemish: 1 });
  const c = (30 * w + 30) * 4;
  assert.ok(healed[c] > plain[c] + 15 && healed[c] > 170, `spot ${img[c]} plain ${plain[c]} healed ${healed[c]}`);
});

test("faceMasks from 68 landmarks: eyes excluded from skin; adjustRegion only touches its mask", () => {
  const w = 120, h = 140, P = [];
  for (let i = 0; i < 17; i++) { const t = Math.PI * (i / 16); P.push({ x: 60 - 40 * Math.cos(t), y: 60 + 45 * Math.sin(t) }); } // jaw 0-16
  for (let i = 0; i < 5; i++) P.push({ x: 30 + i * 6, y: 45 }); for (let i = 0; i < 5; i++) P.push({ x: 66 + i * 6, y: 45 }); // brows 17-26
  for (let i = 0; i < 4; i++) P.push({ x: 60, y: 55 + i * 6 }); for (let i = 0; i < 5; i++) P.push({ x: 52 + i * 4, y: 78 }); // nose 27-35
  const eye = (cx) => [[-8, 0], [-4, -3], [4, -3], [8, 0], [4, 3], [-4, 3]].map(([dx, dy]) => ({ x: cx + dx, y: 58 + dy }));
  P.push(...eye(42), ...eye(78)); // 36-47
  for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; P.push({ x: 60 + 14 * Math.cos(t), y: 92 + 6 * Math.sin(t) }); } // 48-59
  for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; P.push({ x: 60 + 9 * Math.cos(t), y: 92 + 3 * Math.sin(t) }); } // 60-67
  const img = rgbaFill(w, h, () => [210, 160, 140]);
  const m = S.faceMasks(img, w, h, { P, fw: 80, cx: 60, eyeY: 58, chinY: 105 });
  assert.ok(m.skin[(80 * w) + 35] > .5, "cheek is skin");
  assert.ok(m.skin[(58 * w) + 42] < .2, "eye not skin");
  assert.ok(m.eyes[(58 * w) + 42] > .5, "eye mask");
  const out = S.adjustRegion(img, w, h, m.eyes, { dL: 10 });
  let outside = 0; for (let i = 0; i < w * h; i++) if (m.eyes[i] <= .01) for (let c = 0; c < 3; c++) if (out[i * 4 + c] !== img[i * 4 + c]) outside++;
  assert.equal(outside, 0);
  assert.ok(out[(58 * w + 42) * 4] > img[(58 * w + 42) * 4]);
});

test("noise estimate + addGrain: grain matches a target sigma; addGrain outside mask is identity", () => {
  const w = 120, h = 120, flat = rgbaFill(w, h, () => [128, 128, 128]);
  assert.ok(S.estimateNoise(flat, w, h) < .5);
  const g = S.addGrain(flat, w, h, null, 6);
  const est = S.estimateNoise(g, w, h);
  assert.ok(Math.abs(est - 6) < 1.5, "sigma " + est);
  const mask = new Float32Array(w * h); const g2 = S.addGrain(flat, w, h, mask, 6);
  assert.deepEqual(g2, flat);
});

test("grayWorld gains neutralise a colour cast; applyGains with mask 0 is identity", () => {
  const w = 30, h = 30, img = noiseImg(w, h, [150, 120, 90], 10), gw = S.grayWorld(img, w, h, null, { step: 1, lo: .5, hi: 2 });
  const out = S.applyGains(img, w, h, gw.gains);
  const m = S.grayWorld(out, w, h, null, { step: 1 }).mean;
  assert.ok(Math.max(...m) - Math.min(...m) < 6, "neutral " + m.map(v => v.toFixed(1)));
  assert.deepEqual(S.applyGains(img, w, h, gw.gains, { mask: new Float32Array(w * h) }), img);
});

test("matte edits: restore raises alpha, erase lowers it", () => {
  const w = 20, h = 20, a = new Float32Array(w * h).fill(.5), e = new Float32Array(w * h);
  S.brush(e, w, h, 5, 5, 3, 1); S.brush(e, w, h, 15, 15, 3, -1);
  const o = S.applyMatteEdits(a, e);
  assert.equal(o[5 * w + 5], 1); assert.equal(o[15 * w + 15], 0); assert.equal(o[0], .5);
});

test("borderKeyAlpha: subject on a plain backdrop -> opaque inside, transparent at the border", () => {
  const w = 80, h = 80, img = rgbaFill(w, h, (x, y) => Math.hypot(x - 40, y - 45) < 20 ? [200, 140, 120] : [235, 238, 242]);
  const a = S.borderKeyAlpha(img, w, h);
  assert.ok(a[45 * w + 40] > .95 && a[5 * w + 5] < .05);
});

// ---------------------------------------------------------------- ลำดับชั้น / parsing / การวัดไหล่ / คอ
const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };

test("composeLayers: order is bg -> back collar -> neck -> garment -> head+hair (hair falls over the garment, no straight cut)", () => {
  const w = 60, h = 60, n = w * h;
  const bg = rgbaFill(w, h, () => [0, 0, 255]), person = rgbaFill(w, h, (x, y) => y < 20 ? [200, 150, 120] : [40, 20, 10]); // face / dark hair
  const front = rgbaFill(w, h, (x, y) => y >= 30 ? [30, 60, 30, 255] : [0, 0, 0, 0]);
  const back = rgbaFill(w, h, (x, y) => y >= 24 ? [250, 250, 250, 255] : [0, 0, 0, 0]);
  const neck = { rgba: rgbaFill(w, h, () => [180, 120, 100]), alpha: fill(w, h, (x, y) => Math.abs(x - 30) < 6 && y >= 18 && y < 40 ? 1 : 0) };
  // head 0..20; a lock of hair hangs over the garment at x 5..9 down to y 50 with soft (matted) strands
  const keepA = fill(w, h, (x, y) => y < 20 && Math.abs(x - 30) < 10 ? 1 : (x >= 5 && x < 10 && y < 50 ? (y < 45 ? 1 : .5) : 0));
  const { rgba, fgAlpha } = S.composeLayers({ w, h, bg, person, keepA, neck, back, front, wrap: 0 });
  const px = (x, y) => [...rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
  assert.deepEqual(px(50, 5), [0, 0, 255], "background");
  assert.deepEqual(px(30, 10), [200, 150, 120], "face on top");
  assert.deepEqual(px(30, 26), [180, 120, 100], "neck in front of the back collar");
  assert.deepEqual(px(40, 26), [250, 250, 250], "back collar visible beside the neck");
  assert.deepEqual(px(30, 35), [30, 60, 30], "garment in front of the neck");
  assert.deepEqual(px(7, 40), [40, 20, 10], "hair over the garment");
  assert.deepEqual(px(7, 47), [35, 40, 20], "matted hair tips blend with the garment (not the old clothes)");
  assert.ok(fgAlpha[45 * w + 30] === 1 && fgAlpha[5 * w + 50] === 0);
});

test("parseGroups: softmax per pixel summed into head/hair/neck/cloth/bg; cropToImage maps the crop back", () => {
  const S2 = 4, n = S2 * S2, C = 19, lg = new Float32Array(C * n);
  for (let i = 0; i < n; i++) lg[(i < 8 ? 17 : 14) * n + i] = 10; // top half hair, bottom half neck
  const g = S.parseGroups(lg, n, C);
  for (let i = 0; i < n; i++) { const t = g.head[i] + g.hair[i] + g.neck[i] + g.cloth[i] + g.bg[i]; assert.ok(Math.abs(t - 1) < 1e-5, "sums to 1"); }
  assert.ok(g.hair[0] > .99 && g.neck[15] > .99 && g.head[0] < .01);
  const crop = { x: 10, y: 20, side: 40 }, m = S.cropToImage(g.hair, S2, crop, 80, 80);
  assert.equal(m[5 * 80 + 5], 0, "outside crop");
  assert.ok(m[25 * 80 + 30] > .99 && m[55 * 80 + 30] < .01, "top of crop hair, bottom not");
  const pc = S.parseCrop({ cx: 100, eyeY: 80, fw: 50 }, 3);
  assert.equal(pc.side, 150); assert.equal(pc.x, 25); assert.ok(pc.y + pc.side > 80 + 50 * 1.5, "crop reaches below the shoulders' top");
});

/** Torso silhouette with given shoulder width/tilt; optional long hair hanging over the shoulders. */
function torso(w, h, { cx = 150, chinY = 100, fw = 60, width = 3, tilt = 0, hair = false } = {}) {
  const a = new Float32Array(w * h), hr = new Float32Array(w * h), kp = new Float32Array(w * h), half = width * fw / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, dx = x - cx;
    const head = (dx / (fw * .5)) ** 2 + ((y - (chinY - fw * .6)) / (fw * .65)) ** 2 < 1;
    const top = chinY + fw * .3 + Math.abs(dx) * .25 + dx * Math.tan(tilt); // sloped shoulders + tilt
    const body = y >= top && Math.abs(dx) < half - Math.max(0, (top + fw * .25 - y)) * 1.2;
    const neck = Math.abs(dx) < fw * .28 && y > chinY - 5 && y < top + 5;
    const lock = hair && Math.abs(Math.abs(dx) - fw * .75) < fw * .22 && y > chinY - fw * .8 && y < chinY + fw * 1.0;
    if (head || body || neck || lock) a[i] = 1;
    if (head) kp[i] = 1;
    if (lock) { hr[i] = 1; kp[i] = 1; }
  }
  return { a, hair: hr, keep: kp };
}
test("measureShoulders: width from the silhouette (clamped to 2.5–3.3 face widths), tilt from the shoulder line, robust to hair over the shoulders", () => {
  const w = 300, h = 300, face = { cx: 150, chinX: 150, chinY: 100, eyeY: 60, fw: 60 };
  const t1 = torso(w, h, { width: 3 }), m1 = S.measureShoulders(t1.a, w, h, face, { keep: t1.keep });
  assert.ok(m1.measured && Math.abs(m1.width / 60 - 3) < .15, "width " + m1.width / 60);
  assert.ok(Math.abs(m1.theta) < .02, "level " + m1.theta);
  assert.ok(m1.l.x < 150 && m1.r.x > 150 && Math.abs(m1.l.y - m1.r.y) < 3);
  const t2 = torso(w, h, { width: 3, tilt: .12 }), m2 = S.measureShoulders(t2.a, w, h, face, { keep: t2.keep });
  assert.ok(Math.abs(m2.theta - .12) < .04, "tilt " + m2.theta);
  assert.ok(m2.r.y > m2.l.y, "right shoulder lower");
  // much too wide (crossed arms / bulky jacket) -> clamped by the face-width prior
  const t3 = torso(w, h, { width: 4.4 }), m3 = S.measureShoulders(t3.a, w, h, face, { keep: t3.keep });
  assert.ok(Math.abs(m3.width - 3.3 * 60) < 1, "clamped " + m3.width / 60);
  // long hair over the shoulders: samples under the hair are skipped, level stays the same as without hair
  const t4 = torso(w, h, { width: 3, hair: true }), m4 = S.measureShoulders(t4.a, w, h, face, { keep: t4.keep, hair: t4.hair });
  assert.ok(Math.abs(m4.line.a - m1.line.a) < 4 && Math.abs(m4.width - m1.width) < 8, `hair-robust a ${m4.line.a} vs ${m1.line.a}, w ${m4.width} vs ${m1.width}`);
  // fitFromTargets inverts the anchor mapping
  const f = S.fitFromTargets({ chin: m2.chin, l: m2.l, r: m2.r });
  assert.ok(Math.abs(f.s - m2.s) < 1e-6 && Math.abs(f.theta - m2.theta) < 1e-6 && f.N.x === m2.N.x);
});

test("personLayers: no straight cut — hair below the chin stays in front, original clothes go to the body layer", () => {
  const w = 120, h = 140, face = { cx: 60, chinX: 60, chinY: 60, eyeY: 35, fw: 40 }, n = w * h;
  const rgba = rgbaFill(w, h, () => [128, 128, 128]), alpha = new Float32Array(n).fill(1);
  const P = { head: fill(w, h, (x, y) => y < 60 && Math.abs(x - 60) < 20 ? 1 : 0), hair: fill(w, h, (x, y) => Math.abs(x - 60) >= 20 && Math.abs(x - 60) < 34 && y < 100 ? 1 : 0), neck: fill(w, h, (x, y) => y >= 60 && y < 75 && Math.abs(x - 60) < 10 ? 1 : 0) };
  P.cloth = fill(w, h, (x, y) => 1 - P.head[y * w + x] - P.hair[y * w + x] - P.neck[y * w + x]);
  const L = S.personLayers(rgba, alpha, w, h, face, P, null);
  assert.ok(L.keep[95 * w + 30] > .9, "hair tip at y=95 (far below the chin) kept in front");
  assert.ok(L.keep[105 * w + 30] < .1, "below the hair: not kept");
  assert.ok(L.neck[65 * w + 60] > .9 && L.keep[65 * w + 60] < .1, "neck goes under the garment");
  assert.ok(L.body[120 * w + 60] > .9, "old clothes -> body (hidden)");
  // a column through the hair: keep goes 1 -> 0 only where the hair ends (no horizontal cut at a fixed row across the image)
  const ends = [30, 90].map(x => { let e = -1; for (let y = 0; y < h; y++) if (L.keep[y * w + x] > .5) e = y; return e; });
  assert.ok(ends.every(e => e >= 95), "hair ends " + ends);
});

test("synthNeck: extends a skin-coloured neck from the jaw down below the new collar, even if the old collar covered it", () => {
  const w = 160, h = 200, fw = 60, face = { cx: 80, chinX: 80, chinY: 70, eyeY: 40, fw }, n = w * h;
  const skin = [200, 150, 120], person = rgbaFill(w, h, (x, y) => y < 85 ? skin : [20, 20, 120]); // blue turtleneck from y=85
  const alpha = new Float32Array(n).fill(1);
  const neckS = fill(w, h, (x, y) => y >= 70 && y < 85 && Math.abs(x - 80) < 16 ? 1 : 0), keepS = fill(w, h, (x, y) => y < 70 && Math.abs(x - 80) < 30 ? 1 : 0);
  const fit = { N: { x: 80, y: 110 }, s: 60, theta: 0, drop: 0 };
  const r = S.synthNeck(person, alpha, neckS, keepS, w, h, face, fit, { skinRGB: skin, noise: 0 });
  const at = (x, y) => ({ a: r.alpha[y * w + x], c: [...r.rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 3)] });
  const deep = at(80, 125); // below the old collar, below the new collar line
  assert.ok(deep.a > .95, "neck continues down: " + deep.a);
  assert.ok(deep.c[0] > 150 && deep.c[2] < 140, "skin-coloured, not the old blue collar: " + deep.c);
  assert.ok(at(80 + fw * .3, 100).a > .5, "neck at least ~0.6 face widths wide");
  assert.equal(at(5, 120).a, 0, "nothing far outside the neck");
});

test("heuristicParse (fallback without a model): separates hair from the old clothes by colour", () => {
  const w = 160, h = 220, fw = 60, face = { cx: 80, chinX: 80, chinY: 90, eyeY: 55, fw };
  const rgba = rgbaFill(w, h, (x, y) => {
    const dx = Math.abs(x - 80);
    if (y < 90 && dx < 28) return y < 30 ? [40, 30, 25] : [210, 160, 130];   // hair cap / face
    if (dx >= 28 && dx < 45 && y < 140) return [40, 30, 25];                    // long dark hair to the shoulders
    return [30, 60, 160];                                                       // blue shirt
  }), alpha = new Float32Array(w * h).fill(1);
  const P = S.heuristicParse(rgba, alpha, w, h, face);
  assert.ok(P.hair[120 * w + 80 - 36] > .6, "hair below chin: " + P.hair[120 * w + 44]);
  assert.ok(P.hair[170 * w + 80] < .2 && P.cloth[170 * w + 80] > .6, "shirt is cloth");
});

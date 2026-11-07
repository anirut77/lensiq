"use strict";
// tests/unit/studio-garment-check.test.js — "photograph your own garment" checks (studio-qa.js garmentPhotoCheck) on
// SYNTHETIC flat-lay photos: a shirt polygon on a plain background, then one capture problem at a time. The full path the
// page uses is exercised: SC.borderKeyAlpha + SC.refineMatte (matte) -> SC.templateAnchors -> garmentPhotoCheck.
// Synthetic only: no real garment photographs were available, so these rates say nothing about real photos.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Q = require(path.join(__dirname, "..", "..", "studio-qa.js"));
const SC = require(path.join(__dirname, "..", "..", "studio-core.js"));

const W = 320, H = 400;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
/** shirt outline (neck notch, collar points, sloping shoulders, sleeves, straight hem), centre (cx, cy), scale k, rotation rot */
function shirt(cx, cy, k, rot) {
  const P = [[-30, -150], [0, -120], [30, -150], [80, -135], [150, -60], [120, -20], [80, -60], [80, 150], [-80, 150], [-80, -60], [-120, -20], [-150, -60], [-80, -135]];
  const c = Math.cos(rot), s = Math.sin(rot);
  return P.map(([x, y]) => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)]);
}
const inside = (P, x, y) => { let r = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
/** synthetic flat-lay photo: o = { bg, cloth, k, dx, rot, grad, busy, folds, noise, seed } */
function photo(o = {}) {
  const r = rng(o.seed || 1), bg = o.bg || [236, 234, 228], cl = o.cloth || [52, 70, 120], P = shirt(W / 2 + (o.dx || 0), H / 2 + (o.dy || 0), o.k || 1, o.rot || 0);
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = ((o.noise ?? 4) * (r() - .5)) * 2;
    let v;
    if (inside(P, x + .5, y + .5)) { const f = o.folds ? 1 + o.folds * Math.sin(x / 9 + y / 23) * Math.sin(y / 17) : 1; v = cl.map(c => c * f); }
    else { const g = o.grad ? 1 - o.grad * (x / W) : 1, b = o.busy ? ((((x / 10) | 0) + ((y / 10) | 0)) % 2 ? o.busy : -o.busy) : 0; v = bg.map(c => c * g + b); }
    px[i] = v[0] + n; px[i + 1] = v[1] + n; px[i + 2] = v[2] + n; px[i + 3] = 255;
  }
  return px;
}
function check(o) {
  const px = photo(o), alpha = SC.refineMatte(px, SC.borderKeyAlpha(px, W, H), W, H, { k: 3 }), anchors = SC.templateAnchors(alpha, W, H);
  return Q.garmentPhotoCheck({ px, alpha, W, H, anchors, labOf: SC.rgbToLab });
}
const keys = r => r.issues.map(i => i.k + ":" + i.level);

test("garmentPhotoCheck: a clean flat-lay passes with no warnings", () => {
  const r = check({ seed: 3 });
  assert.ok(r.ok && r.issues.length === 0, JSON.stringify(r));
});

test("garmentPhotoCheck: each capture problem is named (and blocking ones refuse the photo)", () => {
  const cut = check({ dx: -110, seed: 4 });
  assert.ok(!cut.ok && keys(cut).includes("cutOff:fail"), "cut off: " + keys(cut));
  const low = check({ cloth: [212, 210, 204], seed: 5 });
  assert.ok(!low.ok && (keys(low).includes("lowContrast:fail") || keys(low).includes("notFound:fail")), "low contrast: " + keys(low) + JSON.stringify(low.m));
  const tilt = check({ rot: .3, k: .85, seed: 6 });
  assert.ok(keys(tilt).some(k => k.startsWith("tilted:")), "tilted: " + keys(tilt) + JSON.stringify(tilt.m));
  const uneven = check({ grad: .4, seed: 7 });
  assert.ok(keys(uneven).includes("unevenBg:warn"), "uneven: " + keys(uneven) + JSON.stringify(uneven.m));
  const busy = check({ busy: 22, seed: 8 });
  assert.ok(keys(busy).some(k => /busyBg|pieces/.test(k)), "busy: " + keys(busy) + JSON.stringify(busy.m));
  const folds = check({ folds: .45, seed: 9 });
  assert.ok(keys(folds).includes("folds:warn"), "folds: " + keys(folds) + JSON.stringify(folds.m));
  const tiny = check({ k: .3, seed: 10 });
  assert.ok(keys(tiny).includes("tooSmall:warn"), "small: " + keys(tiny));
  const empty = Q.garmentPhotoCheck({ px: photo({ k: .001 }), alpha: new Float32Array(W * H), W, H, anchors: null, labOf: SC.rgbToLab });
  assert.ok(!empty.ok && keys(empty).includes("notFound:fail"));
});

test("garmentPhotoCheck: PNG with transparency (hasBg false) skips background and edge checks", () => {
  const px = photo({ seed: 11 }), alpha = SC.refineMatte(px, SC.borderKeyAlpha(px, W, H), W, H, { k: 3 });
  const r = Q.garmentPhotoCheck({ px, alpha, W, H, anchors: SC.templateAnchors(alpha, W, H), labOf: SC.rgbToLab, hasBg: false });
  assert.ok(r.ok && r.m.contrast == null && r.m.edge == null, JSON.stringify(r));
});

test("garmentPhotoCheck: randomised synthetic sweep — clean photos rarely flagged, each problem usually caught", () => {
  const N = 12, rate = (f, pred) => { let k = 0; for (let s = 0; s < N; s++) if (pred(check(f(rng(100 + s), 100 + s)))) k++; return k / N; };
  const base = (r, seed) => ({ seed, cloth: [30 + r() * 80, 40 + r() * 80, 60 + r() * 120], bg: [220 + r() * 30, 220 + r() * 30, 215 + r() * 30], k: .85 + r() * .2, dx: (r() - .5) * 20 });
  const clean = rate(base, r => r.issues.length > 0);
  const cut = rate((r, s) => ({ ...base(r, s), dx: -(100 + r() * 40) }), r => r.issues.some(i => i.k === "cutOff"));
  const low = rate((r, s) => { const b = base(r, s); return { ...b, cloth: b.bg.map(c => c - 6 - r() * 8) }; }, r => !r.ok);
  const tilt = rate((r, s) => ({ ...base(r, s), k: .8, rot: (r() < .5 ? -1 : 1) * (.25 + r() * .15) }), r => r.issues.some(i => i.k === "tilted"));
  const uneven = rate((r, s) => ({ ...base(r, s), grad: .35 + r() * .2 }), r => r.issues.some(i => i.k === "unevenBg"));
  const folds = rate((r, s) => ({ ...base(r, s), folds: .4 + r() * .2 }), r => r.issues.some(i => i.k === "folds"));
  console.log(`  synthetic sweep (n=${N} each): clean flagged ${clean}, cut-off ${cut}, low-contrast refused ${low}, tilted ${tilt}, uneven ${uneven}, folds ${folds}`);
  assert.ok(clean <= .1, "clean flagged " + clean);
  for (const [k, v] of Object.entries({ cut, low, tilt, uneven, folds })) assert.ok(v >= .9, k + " caught " + v);
});

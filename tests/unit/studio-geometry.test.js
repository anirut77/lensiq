"use strict";
// tests/unit/studio-geometry.test.js — round-4 geometry in studio-core.js: morphology, garment silhouette (smooth hem, no matte
// debris, shoulder ceiling under hair), per-side shoulder line, hands vs V-neck skin, arm/sleeve model (crossed / clasped arms),
// headwear continuation below the chin, geometric neck (necklace beads replaced by skin).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const S = require(path.join(__dirname, "..", "..", "studio-core.js"));

const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
const u8 = (w, h, f) => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y) ? 1 : 0; return a; };
const rgbaFill = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; } return d; };
const sum = a => a.reduce((p, q) => p + q, 0);

test("edt + morphology: distance to the outside, closing fills a slit, opening removes a thin spike", () => {
  const W = 40, H = 30, sq = u8(W, H, (x, y) => x >= 10 && x < 30 && y >= 5 && y < 25);
  const d = S.edt(sq, W, H);
  assert.equal(d[15 * W + 10], 1, "edge pixel at distance 1");
  assert.ok(Math.abs(d[15 * W + 20] - 10) < 1.2, "centre ~10 from the edge: " + d[15 * W + 20]);
  const slit = u8(W, H, (x, y) => sq[y * W + x] && x !== 20);
  assert.equal(S.closeR(slit, W, H, 2)[15 * W + 20], 1, "closing fills a 1-px slit");
  const spike = u8(W, H, (x, y) => sq[y * W + x] || (y === 15 && x >= 30 && x < 38));
  const o = S.openR(spike, W, H, 2);
  assert.equal(o[15 * W + 35], 0, "opening removes a 1-px spike");
  assert.equal(o[15 * W + 20], 1, "and keeps the body");
});

test("fillHoles: fills small enclosed holes, keeps large ones and holes open to the side/top", () => {
  const W = 60, H = 40, on = u8(W, H, (x, y) => x >= 5 && x < 55 && y >= 5 && !((x - 15) ** 2 + (y - 15) ** 2 < 9) && !(x >= 30 && x < 50 && y >= 12 && y < 30));
  const f = S.fillHoles(on, W, H, 100);
  assert.equal(f[15 * W + 15], 1, "small hole (button/necklace gap) filled");
  assert.equal(f[20 * W + 40], 0, "large real gap (arm/torso) kept");
  assert.equal(f[2 * W + 2], 0, "outside stays outside");
});

test("shoulderTop + sideOffsets: per-side shoulder slope is measured, a hidden side mirrors the visible one", () => {
  const N = { x: 100, y: 100 }, s = 50;
  // left shoulder 0.1 unit lower than the canonical shape, right side exactly canonical
  const samples = [];
  for (const u of [.8, 1.0, 1.2, 1.4]) { samples.push({ x: N.x - u * s, y: N.y + (S.shoulderTop(-u) + .1) * s }); samples.push({ x: N.x + u * s, y: N.y + S.shoulderTop(u) * s }); }
  const o = S.sideOffsets(samples, N, s, 0);
  assert.ok(Math.abs(o.l[0] - .1) < .02 && Math.abs(o.l[1]) < .02, "left offset " + o.l);
  assert.ok(Math.abs(o.r[0]) < .02, "right offset " + o.r);
  const only = S.sideOffsets(samples.filter(p => p.x > N.x), N, s, 0);
  assert.deepEqual(only.l, only.r, "side under hair copies the visible side");
  assert.ok(S.shoulderTop(1.0, { l: [.1, 0], r: [0, 0] }) === S.shoulderTop(1.0) && S.shoulderTop(-1.0, { l: [.1, 0], r: [0, 0] }) > S.shoulderTop(-1.0));
});

/** person: head + torso with a wavy, debris-laden lower outline and a flag blob attached at the side */
function scene(W, H) {
  const face = { cx: 100, chinX: 100, chinY: 70, eyeY: 40, fw: 50 }, fit = { N: { x: 100, y: 82 }, s: 50, theta: 0 };
  const alpha = fill(W, H, (x, y) => {
    const dx = Math.abs(x - 100);
    if (y < 72) return dx < 25 && y > 15 ? 1 : 0;
    const half = y < 110 ? 22 + (y - 72) * 1.6 : 82;
    const wav = y > 130 ? Math.sin(y * .9) * 6 : 0; // ragged matte along the sides
    if (dx < half + wav) return 1;
    if (x < 20 && y > 140 && y < 190) return 1; // flag debris glued to the side
    return (x - 60) ** 2 + (y - 200) ** 2 < 60 ? 0 : 0;
  });
  const keep = fill(W, H, (x, y) => (y < 72 && Math.abs(x - 100) < 25 ? 1 : 0)), hair = new Float32Array(W * H);
  const pp = fill(W, H, x => (x < 20 ? 0 : 1));
  return { face, fit, alpha, keep, hair, pp };
}
test("garmentClip: smooth sides (no wavy hem from a ragged matte), no flag debris, reaches the bottom edge", () => {
  const W = 220, H = 240, sc = scene(W, H);
  const { clip } = S.garmentClip(sc.alpha, { keep: sc.keep, hair: sc.hair }, W, H, sc.face, sc.fit, { pp: sc.pp, side: null, nw: .33 });
  assert.ok(clip[160 * W + 10] < .05, "flag debris outside the person (parser says background) removed");
  const edge = y => { let r = -1; for (let x = 0; x < W; x++) if (clip[y * W + x] > .5) r = x; return r; };
  let rough = 0; for (let y = 150; y < 225; y++) rough += Math.abs(edge(y + 1) - edge(y));
  assert.ok(rough / 75 < 1.2, "right edge varies smoothly row to row: " + rough / 75);
  assert.ok(clip[(H - 1) * W + 100] > .9, "garment continues to the bottom of the frame");
  assert.ok(clip[60 * W + 100] < .05, "face is not covered");
});

test("garmentClip: under long hair the shoulder never rises above the measured shoulder line", () => {
  const W = 220, H = 240, face = { cx: 100, chinX: 100, chinY: 70, eyeY: 40, fw: 50 }, fit = { N: { x: 100, y: 82 }, s: 50, theta: 0 };
  // hair curtain down to y=130 on both sides, as wide as the shoulders: the person mask is "solid" up to the chin there
  const alpha = fill(W, H, (x, y) => (Math.abs(x - 100) < (y < 72 ? 25 : 80) && y > 15 ? 1 : 0) || (Math.abs(x - 100) < 75 && y > 20 && y < 130 ? 1 : 0));
  const hair = fill(W, H, (x, y) => (Math.abs(x - 100) > 25 && Math.abs(x - 100) < 75 && y < 130 ? 1 : 0)), keep = fill(W, H, (x, y) => (hair[y * W + x] || (y < 72 && Math.abs(x - 100) < 25) ? 1 : 0));
  const { clip } = S.garmentClip(alpha, { keep, hair }, W, H, face, fit, {});
  const top = x => { for (let y = 0; y < H; y++) if (clip[y * W + x] > .5) return y; return -1; };
  const ceil = fit.N.y + S.shoulderTop(1.1) * fit.s;
  assert.ok(top(100 + 55) >= ceil - fit.s * .12, `shoulder top ${top(155)} not above the shoulder line ${ceil}`);
});

test("handsMask: clasped hands are kept in front; skin of a deep V-neck (touching the chest band) is not a hand", () => {
  const W = 200, H = 260, face = { cx: 100, chinX: 100, chinY: 60, eyeY: 30, fw: 50 }, skin = [200, 140, 110];
  const isV = (x, y) => y >= 100 && y < 140 && Math.abs(x - 100) < (140 - y) * .5, isHand = (x, y) => (x - 100) ** 2 / 400 + (y - 220) ** 2 / 150 < 1;
  const rgba = rgbaFill(W, H, (x, y) => (isV(x, y) || isHand(x, y) ? skin : [30, 30, 40])), alpha = new Float32Array(W * H).fill(1);
  const skinP = fill(W, H, (x, y) => (isV(x, y) || isHand(x, y) ? 1 : 0));
  const m = S.handsMask(rgba, alpha, skinP, W, H, face);
  assert.ok(m && m[220 * W + 100] > .5, "hand kept");
  assert.ok(m[115 * W + 100] < .1, "V-neck skin is not a hand (the new garment covers it)");
});

test("armModel: crossed arms take the hand from the opposite elbow; clasped hands from the same side; no hands = arms down", () => {
  const W = 300, H = 400, fit = { N: { x: 150, y: 100 }, s: 60, theta: 0 }, face = { cx: 150, chinX: 150, chinY: 85, eyeY: 50, fw: 60 };
  const clip = fill(W, H, (x, y) => (y > 90 && Math.abs(x - 150) < 100 ? 1 : 0));
  const down = S.armModel(clip, null, W, H, fit, face);
  assert.equal(down.length, 2); assert.ok(down.every(a => !a.hand && a.Wr.v > a.E.v), "arms hang down");
  // crossed: a hand high on the right side of the chest (above the elbow) belongs to the LEFT arm
  const crossed = fill(W, H, (x, y) => ((x - 215) ** 2 + (y - 205) ** 2 < 200 ? 1 : 0));
  const c = S.armModel(clip, crossed, W, H, fit, face), withHand = c.find(a => a.hand);
  assert.ok(withHand && withHand.side === -1, "crossed-arm hand comes from the opposite elbow: side " + (withHand && withHand.side));
  assert.ok(withHand.Wr.u > .6 && withHand.d.u > 0, "forearm points from the left elbow to the right-hand side");
  // clasped low in front, slightly right of centre: from the right elbow
  const clasp = fill(W, H, (x, y) => ((x - 175) ** 2 + (y - 330) ** 2 < 220 ? 1 : 0));
  const k = S.armModel(clip, clasp, W, H, fit, face).find(a => a.hand);
  assert.ok(k && k.side === 1 && k.d.v > 0, "clasped hand from the same-side elbow, forearm going down/in");
  assert.ok(k.w[2] >= .3 && k.w[2] <= .48, "wrist width within anatomical bounds");
});

test("headwearExtend: a patterned headscarf continues below the chin (no straight cut); the plain jacket stays clothes", () => {
  const W = 200, H = 300, face = { cx: 100, chinX: 100, chinY: 90, eyeY: 60, fw: 60 }, n = W * H;
  const scarf = (x, y) => { const dx = Math.abs(x - 100); return (y < 90 && dx < 45 && dx > 28) || (y < 40 && dx < 45) || (y >= 90 && y < 160 && dx < 45 - (y - 90) * .2); };
  const faceIn = (x, y) => y >= 40 && y < 90 && Math.abs(x - 100) <= 28;
  const rgba = rgbaFill(W, H, (x, y) => (faceIn(x, y) ? [200, 150, 120] : scarf(x, y) ? ((x >> 2) + (y >> 2)) % 2 ? [200, 60, 40] : [30, 40, 90] : [25, 30, 45]));
  const alpha = fill(W, H, (x, y) => (faceIn(x, y) || scarf(x, y) || (y > 110 && Math.abs(x - 100) < 90) ? 1 : 0));
  const hw = fill(W, H, (x, y) => (scarf(x, y) && y < 90 ? 1 : 0)), head = fill(W, H, (x, y) => (faceIn(x, y) || hw[y * W + x] ? 1 : 0));
  const cloth = fill(W, H, (x, y) => (alpha[y * W + x] && !head[y * W + x] ? 1 : 0)), P = { hw, head, cloth, neck: new Float32Array(n), hair: new Float32Array(n) };
  const ext = S.headwearExtend(rgba, alpha, P, W, H, face);
  assert.ok(ext, "headwear detected");
  assert.ok(P.head[130 * W + 100] > .5, "scarf below the chin is kept in front of the garment");
  assert.ok(P.head[250 * W + 150] < .1, "jacket (different colours) is not");
  assert.equal(S.headwearExtend(rgba, alpha, { ...P, hw: new Float32Array(n) }, W, H, face), null, "no headwear -> nothing");
});

test("synthNeck: beads of a necklace on the neck are replaced by skin; the neck stays inside the jaw width (no side box)", () => {
  const w = 160, h = 200, fw = 60, face = { cx: 80, chinX: 80, chinY: 70, eyeY: 40, fw }, n = w * h, skin = [200, 150, 120];
  const bead = (x, y) => y >= 84 && y < 92 && (x % 8) < 5;
  const person = rgbaFill(w, h, (x, y) => (bead(x, y) ? [20, 15, 10] : y < 100 ? skin : [20, 20, 120]));
  const alpha = new Float32Array(n).fill(1), neckS = fill(w, h, (x, y) => (y >= 70 && y < 100 && Math.abs(x - 80) < 45 ? 1 : 0)); // parser box wider than the neck
  const keepS = fill(w, h, (x, y) => (y < 70 && Math.abs(x - 80) < 30 ? 1 : 0));
  const r = S.synthNeck(person, alpha, neckS, keepS, w, h, face, { N: { x: 80, y: 110 }, s: 60, theta: 0, drop: 0 }, { skinRGB: skin, noise: 0, half: 17 });
  const px = (x, y) => [...r.rgba.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
  const c = px(81, 87); assert.ok(c[0] > 120, "bead replaced by skin: " + c);
  assert.equal(r.alpha[85 * w + 10], 0, "no neck far beside the jaw (old parser box)");
  assert.ok(sum(r.alpha) > 0);
});

test("hairCleanup: dark coat collar mislabelled as hair beside the neck goes back to the old clothes; real hair stays", () => {
  const W = 200, H = 300, face = { cx: 100, chinX: 100, chinY: 90, eyeY: 60, fw: 60 }, n = W * H;
  const coat = (x, y) => y > 100, hairTop = (x, y) => y < 60 && Math.abs(x - 100) < 50;
  const rgba = rgbaFill(W, H, (x, y) => (hairTop(x, y) || (y > 90 && y < 200 && x > 150) ? [235, 235, 230] : coat(x, y) ? ((x + y) % 3 ? [35, 32, 30] : [70, 66, 60]) : [200, 160, 140]));
  const alpha = new Float32Array(n).fill(1);
  const hair = fill(W, H, (x, y) => (hairTop(x, y) || (y > 90 && y < 200 && x > 150) || (y > 95 && y < 140 && x > 40 && x < 70) ? 1 : 0));
  const P = { hair, cloth: fill(W, H, (x, y) => (coat(x, y) && !hair[y * W + x] ? 1 : 0)) };
  S.hairCleanup(rgba, alpha, P, W, H, face);
  assert.ok(P.hair[120 * W + 55] < .2, "dark collar 'hair' moved to clothes");
  assert.ok(P.hair[150 * W + 175] > .8, "white hair falling on the shoulder stays hair");
});

test("handsNearGarment: a hand holding something outside the garment is dropped, a hand on the garment kept", () => {
  const W = 120, H = 120, clip = fill(W, H, (x, y) => (Math.abs(x - 60) < 30 ? 1 : 0));
  const hands = fill(W, H, (x, y) => ((x - 60) ** 2 + (y - 80) ** 2 < 50 || (x - 110) ** 2 + (y - 80) ** 2 < 30 ? 1 : 0));
  const h = S.handsNearGarment(hands, clip, W, H, 4);
  assert.ok(h[80 * W + 60] > .5 && h[80 * W + 110] === 0);
  assert.equal(S.handsNearGarment(fill(W, H, (x, y) => ((x - 112) ** 2 + (y - 80) ** 2 < 20 ? 1 : 0)), clip, W, H, 4), null);
});

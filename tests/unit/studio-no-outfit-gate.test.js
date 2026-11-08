"use strict";
// tests/unit/studio-no-outfit-gate.test.js — the check of the NO-OUTFIT output (studio-qa.js noOutfitCheck) that decides whether
// studio.html shows the edited photo (new background + light retouch) or falls back to the untouched original photo.
// Synthetic masks only (no photos of people).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Q = require(path.join(__dirname, "..", "..", "studio-qa.js"));

const fill = (w, h, f) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };
const W = 400, H = 480, face = { cx: 200, chinX: 200, chinY: 230, eyeY: 160, fw: 120 };
// head + neck + sloping shoulders that reach the bottom and both sides of the frame (a clean head-and-shoulders portrait)
const person = (x, y) => Math.hypot((x - 200) / 66, (y - 160) / 86) < 1 || (y > 225 && y < 260 && Math.abs(x - 200) < 40) || (y >= 255 && Math.abs(x - 200) < 50 + (y - 255) * 2.2);

test("noOutfitCheck: a clean portrait passes", () => {
  const r = Q.noOutfitCheck({ keep: fill(W, H, (x, y) => person(x, y) ? 1 : 0), W, H, face });
  assert.equal(r.pass, true, JSON.stringify(r));
  assert.deepEqual(r.fails, []);
});

test("noOutfitCheck: a chair back / flag kept beside the head (attached to the person) fails as 'attached', with a mark", () => {
  // a block from x 300..360 above the shoulders, joined to the head by a strip so it is not an island
  const keep = fill(W, H, (x, y) => person(x, y) || (x >= 300 && x < 360 && y >= 60 && y < 220) || (x >= 250 && x < 300 && y >= 150 && y < 170) ? 1 : 0);
  const r = Q.noOutfitCheck({ keep, W, H, face });
  assert.equal(r.pass, false);
  assert.ok(r.fails.includes("attached"), JSON.stringify(r.fails));
  const m = r.marks.find(k => k.k === "attached");
  assert.ok(m && m.x >= 300 - 1 && m.x + m.w <= 361 && m.y >= 59, JSON.stringify(m));
  assert.ok(r.m.attached > Q.NOOUT_LIMITS.attached);
});

test("noOutfitCheck: hair (hair mask) and skin (a raised hand) beside the head are allowed", () => {
  // long hair falling from beside the head onto the shoulder (joined to the body, so not an island)
  const keep = fill(W, H, (x, y) => person(x, y) || (x >= 300 && x < 360 && y >= 60 && y < 300) ? 1 : 0);
  const hair = fill(W, H, (x, y) => (x >= 300 && x < 360 && y >= 60 && y < 300 ? 1 : 0));
  assert.equal(Q.noOutfitCheck({ keep, W, H, face, hair }).pass, true);
  const src = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { src[i * 4] = 205; src[i * 4 + 1] = 150; src[i * 4 + 2] = 120; src[i * 4 + 3] = 255; } // skin tone
  assert.equal(Q.noOutfitCheck({ keep, W, H, face, src }).pass, true);
});

test("noOutfitCheck: a detached piece, a torso cut above the bottom, and a lost person fail", () => {
  const isl = fill(W, H, (x, y) => person(x, y) || (x >= 330 && x < 380 && y >= 20 && y < 80) ? 1 : 0);
  assert.ok(Q.noOutfitCheck({ keep: isl, W, H, face }).fails.includes("island"));
  const cut = fill(W, H, (x, y) => person(x, y) && y < 400 ? 1 : 0);
  const rc = Q.noOutfitCheck({ keep: cut, W, H, face });
  assert.ok(rc.fails.includes("cut-bottom"), JSON.stringify(rc));
  const empty = fill(W, H, (x, y) => (Math.hypot(x - 200, y - 160) < 20 ? 1 : 0));
  const re = Q.noOutfitCheck({ keep: empty, W, H, face });
  assert.deepEqual(re.fails, ["empty"]);
});

test("noOutfitCheck: a straight vertical edge must be long (≥ 0.6 face widths) to count as a cut; idLeftovers keeps its 0.4 default", () => {
  // torso with a perfectly straight right edge at x = 330 from y 300 down (60 face-% = 72 px; here 180 px)
  const keep = fill(W, H, (x, y) => (person(x, y) && !(y >= 300 && x > 330)) || (y >= 300 && x <= 330 && Math.abs(x - 200) < 50 + (y - 255) * 2.2) ? 1 : 0);
  const r = Q.noOutfitCheck({ keep, W, H, face });
  assert.ok(r.fails.includes("cut-right"), JSON.stringify(r));
  // a short straight run (50 px < 0.6 × 120) does not
  const short = fill(W, H, (x, y) => (person(x, y) && !(y >= 300 && y < 350 && x > 330)) ? 1 : 0);
  assert.ok(!Q.noOutfitCheck({ keep: short, W, H, face }).fails.some(f => f.startsWith("cut-")));
  assert.equal(Q.idLeftovers.length, 1);
});

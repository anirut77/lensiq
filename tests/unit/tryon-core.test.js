"use strict";
// tests/unit/tryon-core.test.js — Try-On MVP customer page + merchant back-office section (docs/TRYON-DESIGN.md T2–T4
// subset). FIXED TEST SET: written and hash-locked (evals-locks/tryon-mvp.sha256) BEFORE lensiq-tryon-core.js, tryon.html,
// tryon.js, admin-tryon.js and their i18n files were written. Source label of every geometry check: SYNTHETIC landmark
// sets built here (no face of anyone).
//
//   C1 face anchors from the 478-point face mesh: eye centre, roll, temple width, ear and forehead points follow the face
//      under rotation, scale and translation (synthetic landmarks)
//   C2 placement: glasses centred on the eyes, as wide as the temples (1.0–1.15 ×), rotated with the head; hat above the
//      forehead and wider than the face; one earring under each ear point, mirrored
//   C3 categories on the page = the Worker's list (one source of truth), none of underwear / swimwear
//   C4 preview mark "ภาพจำลอง · Virtual try-on preview · 虚拟试穿预览" is burned into every snapshot (stamp draws it)
//   C5 tryon.html: live camera only (no file input, no drop / paste handler), consent before the camera, no POST and no
//      storage of frames; the only network call is GET /v1/tryon/catalog (+ asset images); TH / EN / ZH keys complete
//   C6 admin back-office section: admin.html has the try-on tab; admin-tryon.js runs the Product Check face blur
//      (LQPCRun.faceRuns + LQPC.faceBlurPlan + LQPCRun.faceBlur) before upload, needs the "no visible face remains" tick,
//      refuses when the detector cannot run, and its strings exist in TH / EN / ZH
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const TO = require(path.join(ROOT, "lensiq-tryon-core.js"));

/** synthetic 478-point mesh: only the indices the page uses are placed; others sit at the face centre */
function mesh({ cx = 320, cy = 240, s = 1, roll = 0 } = {}, W = 640, H = 480) {
  const base = { 33: [-45, 0], 133: [-15, 0], 362: [15, 0], 263: [45, 0], 168: [0, -2], 10: [0, -95], 152: [0, 110], 234: [-75, 15], 454: [75, 15], 127: [-72, -5], 356: [72, -5], 1: [0, 35] };
  const c = Math.cos(roll), sn = Math.sin(roll), pts = [];
  for (let i = 0; i < 478; i++) {
    const [x, y] = base[i] || [0, 10];
    pts.push({ x: (cx + s * (c * x - sn * y)) / W, y: (cy + s * (sn * x + c * y)) / H, z: 0 });
  }
  return { pts, px: i => { const [x, y] = base[i]; return { x: cx + s * (c * x - sn * y), y: cy + s * (sn * x + c * y) }; } };
}
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const POSES = [{}, { roll: .25 }, { roll: -.3, s: .6, cx: 200 }, { s: 1.7, cy: 300 }, { roll: .12, s: 1.2, cx: 400, cy: 180 }];

test("C1: face anchors follow the face (synthetic landmarks, 5 poses)", () => {
  for (const P of POSES) {
    const M = mesh(P), A = TO.faceAnchors(M.pts, 640, 480);
    const mid = { x: (M.px(33).x + M.px(263).x) / 2, y: (M.px(33).y + M.px(263).y) / 2 };
    assert.ok(d(A.mid, mid) < .5, "eye centre " + JSON.stringify(P));
    assert.ok(Math.abs(A.roll - (P.roll || 0)) < .01, "roll " + A.roll);
    assert.ok(Math.abs(A.templeW - d(M.px(127), M.px(356))) < 1, "temple width");
    assert.ok(Math.abs(A.faceW - d(M.px(234), M.px(454))) < 1, "face width");
    assert.ok(d(A.forehead, M.px(10)) < 1 && d(A.chin, M.px(152)) < 1, "forehead / chin");
  }
  assert.equal(TO.faceAnchors([], 640, 480), null, "no mesh, no anchors");
});

test("C2: glasses on the eyes, temple-wide, rotated; hat above the forehead; earrings under each ear, mirrored", () => {
  for (const P of POSES) {
    const M = mesh(P), A = TO.faceAnchors(M.pts, 640, 480), roll = P.roll || 0, down = { x: -Math.sin(roll), y: Math.cos(roll) };
    const g = TO.place("glasses", A);
    assert.ok(d(g, A.mid) < 1, "glasses centred");
    assert.ok(g.w >= A.templeW * 1.0 && g.w <= A.templeW * 1.15, "glasses width " + g.w / A.templeW);
    assert.ok(Math.abs(g.rot - roll) < .01, "glasses roll");
    const h = TO.place("hats", A), faceH = d(A.forehead, A.chin);
    assert.ok(d({ x: h.x, y: h.y }, A.forehead) < .15 * faceH, "hat bottom near the forehead");
    const up = (h.x - A.mid.x) * down.x + (h.y - A.mid.y) * down.y;
    assert.ok(up < 0, "hat above the eyes");
    assert.ok(h.w >= 1.2 * A.faceW, "hat wider than the face");
    const e = TO.place("earrings", A);
    assert.ok(Array.isArray(e) && e.length === 2, "two earrings");
    for (const [i, side] of [[0, 234], [1, 454]]) {
      const ear = M.px(side), v = { x: e[i].x - ear.x, y: e[i].y - ear.y }, along = v.x * down.x + v.y * down.y, across = Math.abs(v.x * down.y - v.y * down.x);
      assert.ok(along >= .05 * faceH && along <= .25 * faceH, "earring below the ear point " + along / faceH);
      assert.ok(across <= .1 * A.faceW, "earring under the ear " + across / A.faceW);
    }
    assert.ok(Math.abs(e[0].w - e[1].w) < 1e-9, "same size both sides");
  }
});

test("C3: page categories = the Worker's categories; no underwear / swimwear", async () => {
  const W = await import(path.join(ROOT, "backend", "src", "tryon.js"));
  assert.deepEqual(TO.CATEGORIES.map(c => [c.id, c.anchor]), W.CATEGORIES.map(c => [c.id, c.anchor]));
  for (const bad of ["underwear", "lingerie", "swimwear", "bikini", "bodysuit", "sleepwear", "bra"]) assert.ok(!TO.CATEGORIES.some(c => c.id === bad), bad);
});

test("C4: the preview mark is burned into every snapshot in TH / EN / ZH", () => {
  assert.equal(TO.MARK, "ภาพจำลอง · Virtual try-on preview · 虚拟试穿预览");
  const calls = [];
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : typeof k === "string" && /^(fillText|strokeText)$/.test(k) ? (...a) => calls.push(a) : () => ({ width: 100 })), set: (t, k, v) => { t[k] = v; return true; } });
  TO.stamp(ctx, 640, 480);
  assert.ok(calls.some(a => a[0] === TO.MARK), "mark drawn");
  assert.match(read("tryon.js"), /TO\.stamp\(/);
});

test("C5: tryon.html is live-camera only, consent first, no POST / storage; i18n complete", () => {
  const html = read("tryon.html"), js = read("tryon.js");
  assert.ok(!/<input[^>]+type=["']?file/i.test(html) && !/type\s*=\s*["']file/.test(js), "no file input");
  assert.ok(!/addEventListener\(\s*["'](drop|paste|dragover)["']/.test(js) && !/on(drop|paste)\s*=/.test(js + html), "no drop / paste");
  assert.match(js, /getUserMedia|LQCam/);
  assert.match(html, /id="toConsent"/); assert.match(html, /id="toStart"[^>]*disabled/);
  assert.match(js, /toConsent[\s\S]{0,400}toStart|toStart[\s\S]{0,400}toConsent/, "start button follows the consent tick");
  assert.ok(!/method\s*:\s*["']POST/i.test(js), "no POST");
  assert.ok(!/(localStorage|sessionStorage|indexedDB)\.[a-zA-Z]+\([^)]*(toDataURL|frame|snapshot|image)/i.test(js), "no frames stored");
  assert.ok(!/toDataURL[\s\S]{0,80}(fetch|setItem)/.test(js), "no frame sent or stored");
  assert.match(js, /\/v1\/tryon\/catalog/);
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]).concat([...js.matchAll(/T\("([a-z][\w.]+)"/g)].map(m => m[1]));
  assert.ok(keys.length >= 15, "page text is translatable: " + keys.length);
  for (const f of ["i18n/en-tryon.js", "i18n/zh-tryon.js"]) {
    const src = read(f);
    for (const k of new Set(keys)) assert.ok(src.includes(`"${k}":`), `${f} misses ${k}`);
  }
  assert.match(html, /ภาพจำลอง/); assert.match(html, /ไม่ส่ง|ไม่เก็บ/);
});

test("C6: admin try-on section: tab, Product Check face blur before upload, 'no visible face' tick, TH / EN / ZH", () => {
  const html = read("admin.html"), js = read("admin-tryon.js");
  assert.match(html, /data-tab="tryon"/); assert.match(html, /data-panel="tryon"/);
  assert.match(html, /<script src="admin-tryon\.js(\?v=\d+)?"><\/script>/);
  assert.match(html, /<script src="lensiq-pc\.js(\?v=\d+)?"><\/script>/); assert.match(html, /<script src="lensiq-pc-run\.js(\?v=\d+)?"><\/script>/);
  assert.match(js, /LQPCRun\.faceRuns\(/); assert.match(js, /LQPC\.faceBlurPlan\(/); assert.match(js, /LQPCRun\.faceBlur\(/);
  assert.match(js, /textOnly/, "detector failure handled (refuse, never upload unblurred)");
  assert.match(html, /id="atNoFace"/); assert.match(js, /atNoFace[\s\S]{0,300}checked/);
  assert.match(js, /face_check/);
  const keys = [...html.matchAll(/data-i18n="(at\.[^"]+)"/g)].map(m => m[1]).concat([...js.matchAll(/T\("(at\.[\w.]+)"/g)].map(m => m[1]));
  assert.ok(keys.length >= 15, "try-on admin strings: " + keys.length);
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) {
    const src = read(f);
    for (const k of new Set(keys)) assert.ok(src.includes(`"${k}":`), `${f} misses ${k}`);
  }
});

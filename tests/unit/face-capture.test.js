// Face capture redesign (owner order 2026-11-16, item A: faceread, testers had to stretch the arm fully).
// FIXED SET: tests/fixtures/face-capture/set.json (synthetic 68-point faces through phone camera models, written by
// make-set.mjs from face-model.js; no person, no photo), locked in ~/LENSIQ-field/evals/face-capture/ BEFORE the guidance
// code was measured. Pure logic of lensiq-facecap.js (LQFaceCap); the page is covered by tests/e2e/face-capture*.e2e.mjs.
//   1 acceptance: every common front camera at 30, 35 and 40 cm, eye distance 58-68 mm -> ok (measured on the eye distance
//     relative to the picture's short side, not a pixel size); "move closer" when too small, "move back a little" when too big
//   2 guidance: ONE state at a time, in a defined priority order, every line in TH / EN / ZH, self and rear-camera wording
//   3 auto-capture: 3-2-1 only while green and steady, restarts on movement, fires once; manual capture whenever one face
//   4 image quality: blur, dark, backlight, glasses glare and partly-out-of-frame each give their own state
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../../lensiq-facecap.js");
const M = require("../fixtures/face-capture/face-model.js");
const FR = require("../../faceread.js");

const SET = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/face-capture/set.json"), "utf8"));
const byGroup = g => SET.cases.filter(c => c.group === g);
const input = c => ({ pts: c.pts, n: c.n, W: c.W, H: c.H, px: c.px || null, moving: !!c.moving });

test("the fixed set is the locked one (synthetic source, 122 cases)", () => {
  assert.equal(SET.source, "synthetic (face-model.js; no person, no photo)");
  assert.equal(SET.cases.length, 122);
  assert.ok(byGroup("accept").length === 57 && byGroup("pixels").length === 12);
});

test("1 acceptance: a face at 30-40 cm is accepted on every common front camera", () => {
  const rows = [];
  for (const c of byGroup("accept")) {
    const g = C.measure(c.pts, c.W, c.H), st = C.classify(input(c));
    rows.push(`${c.id}: eye distance ${(g.iodFrac * 100).toFixed(1)} % of the width -> ${st}`);
    assert.equal(st, "ok", `${c.id} (${c.why}): got ${st}, eye distance ${g.iodFrac.toFixed(3)} of the width`);
  }
  // the accepted range itself is stated as a share of the picture's short side, never in pixels
  assert.deepEqual({ ...C.RANGE }, { far: 0.12, near: 0.32, hyst: 0.01 });
  // same face, same distance, a bigger or smaller picture: the same answer (no pixel threshold)
  const c = byGroup("accept").find(x => x.id === "accept-iphone-front-16x9-35cm-ipd63");
  for (const k of [0.5, 2]) assert.equal(C.classify({ pts: c.pts.map(p => [p[0] * k, p[1] * k]), n: 1, W: c.W * k, H: c.H * k }), "ok", "scale " + k);
  console.log(rows.filter((_, i) => i % 9 === 4).join("\n"));
});

test("1 size: too small -> far ('move closer'), too large -> near ('move back a little')", () => {
  for (const c of byGroup("size")) assert.equal(C.classify(input(c)), c.expect, c.id + ": " + c.why);
  assert.match(C.text("far", "self"), /ขยับเข้ามาใกล้/);
  assert.match(C.text("near", "self"), /ถอยออก/);
  // hysteresis: a face right at a limit does not flicker
  const k = byGroup("accept").find(x => x.id === "accept-iphone-front-16x9-35cm-ipd63");
  const at = f => { const g = C.measure(k.pts, k.W, k.H), s = f / g.iodFrac, cx = k.W / 2, cy = k.H * 0.42; return k.pts.map(p => [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]); };
  assert.equal(C.classify({ pts: at(0.125), n: 1, W: k.W, H: k.H }, "far"), "far", "leaving far needs >= 0.13");
  assert.equal(C.classify({ pts: at(0.125), n: 1, W: k.W, H: k.H }, "ok"), "ok");
  assert.equal(C.classify({ pts: at(0.315), n: 1, W: k.W, H: k.H }, "near"), "near", "leaving near needs <= 0.31");
  assert.equal(C.classify({ pts: at(0.315), n: 1, W: k.W, H: k.H }, "ok"), "ok");
});

test("2 angles and position: face forward, head level, chin, off the oval, partly out of the picture", () => {
  for (const c of [...byGroup("angle"), ...byGroup("position")]) assert.equal(C.classify(input(c)), c.expect, c.id + ": " + c.why);
});

test("2 priority: one instruction at a time, the first in the defined order wins", () => {
  assert.deepEqual([...C.STATES], ["wait", "multi", "near", "cut", "out", "far", "dark", "backlight", "turn", "tilt", "chinUp", "chinDown", "glare", "blur", "still", "ok"]);
  for (const c of byGroup("priority")) assert.equal(C.classify(input(c)), c.expect, c.id + ": " + c.why);
  assert.equal(C.classify(null), "wait");
  assert.equal(C.classify({ pts: null, n: 0, W: 0, H: 0 }), "wait");
});

test("2 every line exists in TH / EN / ZH, for the selfie and for the person holding the phone", () => {
  const states = C.STATES.filter(s => s !== "wait");
  for (const lang of ["th", "en", "zh"]) for (const mode of ["self", "other"]) {
    const seen = new Set();
    for (const s of states) {
      const t = C.DICT[lang][`fcap.${mode}.${s}`];
      assert.ok(typeof t === "string" && t.trim().length > 3, `${lang} ${mode} ${s}`);
      if (lang === "th") assert.match(t, /[฀-๿]/, "Thai text " + s);
      if (lang === "zh") assert.match(t, /[一-鿿]/, "Chinese text " + s);
      if (lang === "en") assert.doesNotMatch(t, /[฀-๿一-鿿]/, "English text " + s);
      seen.add(t);
    }
    // still and ok may share a word, but no two states show the same line
    assert.equal(seen.size, states.length, `${lang} ${mode}: one distinct line per state`);
  }
  for (const s of states) for (const lang of ["th", "en", "zh"]) assert.notEqual(C.DICT[lang]["fcap.self." + s], C.DICT[lang]["fcap.other." + s], `${lang} ${s}: rear wording differs`);
  // rear camera: worded for the person holding the phone
  for (const s of ["far", "near", "still", "ok"]) assert.match(C.DICT.th["fcap.other." + s], /โทรศัพท์/, "TH phone " + s);
  for (const s of ["turn", "tilt", "chinUp", "chinDown"]) assert.match(C.DICT.th["fcap.other." + s], /ขอให้เขา/, "TH ask them " + s);
  for (const s of ["far", "near", "still", "ok"]) assert.match(C.DICT.en["fcap.other." + s], /phone/, "EN phone " + s);
  for (const s of ["turn", "tilt", "chinUp", "chinDown"]) assert.match(C.DICT.en["fcap.other." + s], /^Ask them/, "EN ask them " + s);
  for (const s of ["turn", "tilt", "chinUp", "chinDown"]) assert.match(C.DICT.zh["fcap.other." + s], /请对方/, "ZH ask them " + s);
  // the owner's wording for the six instructions
  assert.match(C.DICT.en["fcap.self.near"], /move back a little/);
  assert.match(C.DICT.en["fcap.self.far"], /move closer/);
  assert.match(C.DICT.en["fcap.self.turn"], /Face the camera/);
  assert.match(C.DICT.en["fcap.self.chinUp"], /Raise your chin/);
  assert.match(C.DICT.en["fcap.self.chinDown"], /Lower your chin/);
  assert.match(C.DICT.en["fcap.self.dark"], /more light needed/);
  assert.match(C.DICT.en["fcap.self.still"], /Hold still/);
  assert.equal(C.text("wait"), "");
});

test("2 the guide: green for ok / still only, a green line never outlives the raw state, other changes held 300 ms", () => {
  const ok = byGroup("accept")[4], far = byGroup("size")[0], turn = byGroup("angle").find(c => c.expect === "turn");
  const g = C.createGuide();
  let r = g.update(input(far), 0); assert.equal(r.state, "far"); assert.equal(r.green, false);
  r = g.update(input(ok), 100); assert.equal(r.state, "far", "held");
  r = g.update(input(ok), 450); assert.equal(r.state, "ok"); assert.equal(r.green, true);
  r = g.update(input(turn), 460); assert.equal(r.state, "turn", "leaves green at once"); assert.equal(r.green, false);
  r = g.update({ ...input(ok), moving: true }, 900); r = g.update({ ...input(ok), moving: true }, 1300);
  assert.equal(r.state, "still"); assert.equal(r.green, true, "still keeps the guide green");
  assert.equal(C.green("ok") && C.green("still") && !C.green("far") && !C.green("multi"), true);
  assert.equal(C.color("ok"), "#22c55e"); assert.notEqual(C.color("far"), "#22c55e");
});

test("3 auto-capture: 3-2-1 only while green and steady, restarts on movement, fires once", () => {
  const A = C.createAuto({ stepMs: 800, moveTol: 0.12, sizeTol: 0.06, rearmMs: 1500 });
  const f = (x, iod = 150, green = true) => ({ green, eye: [x, 500], iod });
  assert.equal(A.update(f(360, 150, false), 0).phase, "idle", "no count while not green");
  let r = A.update(f(360), 100); assert.deepEqual([r.phase, r.n], ["count", 3]);
  r = A.update(f(362), 950); assert.deepEqual([r.phase, r.n], ["count", 2]);
  r = A.update(f(390), 1200); assert.deepEqual([r.phase, r.n, r.moved], ["count", 3, true], "moved 0.2 eye distance: restart at 3");
  r = A.update(f(391), 2000); assert.deepEqual([r.phase, r.n], ["count", 2]);
  r = A.update(f(391, 160), 2300); assert.deepEqual([r.phase, r.n, r.moved], ["count", 3, true], "size changed 6.7 %: restart");
  r = A.update(f(391, 160, false), 2500); assert.equal(r.phase, "idle", "guide left green: count stops");
  r = A.update(f(391, 160), 2600); assert.deepEqual([r.phase, r.n], ["count", 3], "green again: from 3");
  r = A.update(f(392, 160), 3500); assert.equal(r.n, 2);
  r = A.update(f(392, 160), 4300); assert.equal(r.n, 1);
  r = A.update(f(392, 160), 5000); assert.equal(r.phase, "fire");
  r = A.update(f(392, 160), 5300); assert.equal(r.phase, "done", "fires once");
  r = A.update(f(392, 160), 9000); assert.equal(r.phase, "done", "still the same person: no second capture");
  A.update(f(392, 160, false), 9100); r = A.update(f(392, 160, false), 10700); assert.equal(r.phase, "idle", "re-armed after 1.5 s off green");
  r = A.update(f(392, 160), 10800); assert.deepEqual([r.phase, r.n], ["count", 3]);
});

test("3 manual capture: enabled whatever the guidance says while one face is found", () => {
  for (const s of C.STATES) if (s !== "multi") assert.equal(C.manualEnabled(s, 1), true, s);
  assert.equal(C.manualEnabled("multi", 2), false, "never read a bystander");
  assert.equal(C.manualEnabled("out", 0), false, "nothing to read");
});

test("4 image quality: blur, dark, backlight and glasses glare each detected on rendered pictures", () => {
  const rows = [];
  for (const c of byGroup("pixels")) {
    const img = M.render({ W: c.W, H: c.H, pts: c.pts, ...c.render });
    assert.equal(M.sha256Hex(img.data), c.rgbaSha256, c.id + ": the rendered picture is the locked one");
    const px = C.pixelChecks(img, c.pts);
    rows.push(`${c.id}: face ${px.faceLuma} bg ${px.bgLuma} glare ${px.glareFrac} blurRatio ${px.blurRatio}`);
    for (const [k, v] of Object.entries(c.expectPx)) assert.equal(px[k], v, `${c.id} ${k} (${c.why}): ${JSON.stringify(px)}`);
    const st = C.classify({ pts: c.pts, n: 1, W: c.W, H: c.H, px });
    const want = c.expectPx.dark ? "dark" : c.expectPx.backlight ? "backlight" : c.expectPx.glare ? "glare" : c.expectPx.blur ? "blur" : "ok";
    assert.equal(st, want, c.id + " state");
  }
  // each check has its own plain message (TH / EN / ZH)
  for (const s of ["blur", "dark", "backlight", "glare", "cut"]) for (const l of ["th", "en", "zh"]) assert.ok(C.DICT[l]["fcap.self." + s], s + " " + l);
  console.log(rows.join("\n"));
});

test("the old capture-hint boxes (640x480, fake detector) keep their answers under the new rule", () => {
  const W = 640, H = 480, box = b => FR.synthFace({ x: b.x * W, y: b.y * H, width: b.w * W, height: b.h * H });
  assert.equal(C.classify({ pts: box({ x: 0.35, y: 0.2, w: 0.3, h: 0.45 }), n: 1, W, H }), "ok");
  assert.equal(C.classify({ pts: box({ x: 0.44, y: 0.33, w: 0.12, h: 0.18 }), n: 1, W, H }), "far");
  assert.equal(C.classify({ pts: box({ x: 0.15, y: 0.02, w: 0.7, h: 0.9 }), n: 1, W, H }), "near");
  assert.equal(C.classify({ pts: box({ x: 0.02, y: 0.25, w: 0.25, h: 0.35 }), n: 1, W, H }), "out");
  assert.equal(C.classify({ pts: box({ x: 0.35, y: 0.2, w: 0.3, h: 0.45 }), n: 2, W, H }), "multi");
});

test("green implies the reading accepts the frames (same yaw / roll rule as faceread.js)", () => {
  for (const c of SET.cases.filter(x => x.expect === "ok")) {
    const p = FR.headPose(c.pts);
    assert.ok(Math.abs(p.yaw) <= FR.QUALITY.yaw * 1.3 && Math.abs(p.roll) <= FR.QUALITY.roll * 1.3, c.id + " " + JSON.stringify(p));
  }
  assert.equal(C.LIMITS.yaw, FR.QUALITY.yaw); assert.equal(C.LIMITS.roll, FR.QUALITY.roll);
});

test("speed budget: the guidance module loads on camera start, not with the page", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../faceread.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "../../faceread.js"), "utf8");
  assert.doesNotMatch(html, /lensiq-facecap\.js/, "not a page script");
  assert.match(js, /lensiq-facecap\.js\?v=\d+/, "faceread.js loads it");
});

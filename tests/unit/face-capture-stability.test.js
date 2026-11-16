// Face capture, review round 2 (independent review of fd52345, 2026-11-17). Locked BEFORE the round-2 fix.
//   R2-1 hysteresis edge: every accepted 30-40 cm case of the fixed set is accepted whatever the state on screen was
//        (coming from "far" or from "near"); the reviewer's case: iPhone 4:3, eye distance 58 mm, 40 cm, from further away
//   R2-2 the pixel checks give the same numbers as at fd52345 on the 12 locked pictures (the memory rewrite of D3 must not
//        change what is measured)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../../lensiq-facecap.js");
const M = require("../fixtures/face-capture/face-model.js");

const SET = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/face-capture/set.json"), "utf8"));

test("R2-1 an accepted face stays accepted coming from 'far' or 'near' (no hysteresis trap)", () => {
  for (const c of SET.cases.filter(x => x.group === "accept")) for (const prev of ["far", "near", "out", "ok"]) {
    assert.equal(C.classify({ pts: c.pts, n: 1, W: c.W, H: c.H }, prev), "ok", `${c.id} from ${prev}`);
  }
  const s = M.shot({ profile: "iphone-front-4x3", d: 400, ipd: 58 });
  assert.equal(C.classify({ pts: s.pts, n: 1, W: s.W, H: s.H }, "far"), "ok", "reviewer case: 4:3, 58 mm, 40 cm, from far");
  // hysteresis still exists: just past each limit, the state on screen is kept
  const far = M.shot({ profile: "iphone-front-16x9", d: 590 }), g = C.measure(far.pts, far.W, far.H);
  assert.ok(g.iodFrac < C.RANGE.far + C.RANGE.hyst && g.iodFrac >= C.RANGE.far, "fixture sits in the far hysteresis band: " + g.iodFrac);
  assert.equal(C.classify({ pts: far.pts, n: 1, W: far.W, H: far.H }, "far"), "far");
  assert.equal(C.classify({ pts: far.pts, n: 1, W: far.W, H: far.H }, "ok"), "ok");
});

const AT_FD52345 = { "pix-clean": 1.009, "pix-clean-noise": 1.034, "pix-clean-glasses": 1.011, "pix-soft-1": 1.502, "pix-blur-4": 2.297, "pix-blur-6": 2.487,
  "pix-dark": 1.013, "pix-backlight": 1.01, "pix-glare": 1.274, "pix-glare-noise": 1.268, "pix-clean-169": 1.044, "pix-blur-169": 2.53 };
const GLARE = { "pix-glare": 0.22, "pix-glare-noise": 0.22 };

test("R2-2 pixel checks: same numbers as fd52345 on the locked pictures", () => {
  for (const c of SET.cases.filter(x => x.group === "pixels")) {
    const px = C.pixelChecks(M.render({ W: c.W, H: c.H, pts: c.pts, ...c.render }), c.pts);
    assert.equal(px.blurRatio, AT_FD52345[c.id], c.id + " blurRatio");
    assert.equal(px.glareFrac, GLARE[c.id] || 0, c.id + " glareFrac");
  }
});

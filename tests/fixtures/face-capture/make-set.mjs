#!/usr/bin/env node
// tests/fixtures/face-capture/make-set.mjs — writes the FIXED face-capture test set (owner order 2026-11-16, item A8).
// Synthetic only: 68-point faces from face-model.js (round anthropometric numbers, no person) projected through phone
// camera models, plus flat-shape pictures of those faces for the image-quality checks. The expected answer of every case
// comes from the physical set-up (distance, angle, light, blur), written here BEFORE the guidance code was measured.
//   node tests/fixtures/face-capture/make-set.mjs <out-dir>   -> <out-dir>/set.json and <out-dir>/images/*.png (previews)
// The set is locked in ~/LENSIQ-field/evals/face-capture/ (tools/eval-guard.mjs) and committed in evals-locks/.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const M = require("./face-model.js");
const out = process.argv[2];
if (!out) { console.error("usage: make-set.mjs <out-dir>"); process.exit(2); }
mkdirSync(join(out, "images"), { recursive: true });

const cases = [];
const add = (id, group, o, expect, why, extra = {}) => {
  const s = M.shot(o);
  cases.push({ id, group, profile: o.profile, d: o.d, ipd: o.ipd || 63, yaw: o.yaw || 0, pitch: o.pitch || 0, roll: o.roll || 0,
    tx: o.tx == null ? 0.5 : o.tx, ty: o.ty == null ? 0.42 : o.ty, W: s.W, H: s.H, n: 1, expect, why, pts: s.pts, ...extra });
  return s;
};

// A. acceptance: every common front camera at a normal bent-arm distance (30, 35, 40 cm), adult eye distance 58-68 mm
const FRONT = ["iphone-front-16x9", "iphone-front-4x3", "android-front-24-16x9", "android-front-25-16x9", "android-front-26-16x9", "android-front-25-4x3"];
for (const p of FRONT) for (const d of [300, 350, 400]) for (const ipd of [58, 63, 68])
  add(`accept-${p}-${d / 10}cm-ipd${ipd}`, "accept", { profile: p, d, ipd }, "ok", "bent arm 30-40 cm must be accepted");
for (const d of [300, 350, 400]) add(`accept-rear-26-${d / 10}cm`, "accept", { profile: "rear-26-16x9", d }, "ok", "rear camera held 30-40 cm from the other person");

// B. too small -> "move closer"; too large -> "move back a little"
for (const [p, d] of [["iphone-front-16x9", 800], ["iphone-front-16x9", 1000], ["iphone-front-4x3", 650], ["android-front-26-16x9", 900], ["android-front-25-4x3", 700]])
  add(`far-${p}-${d / 10}cm`, "size", { profile: p, d }, "far", "face too small: further than about 60 cm");
for (const [p, d] of [["iphone-front-16x9", 180], ["iphone-front-16x9", 200], ["android-front-26-16x9", 210], ["android-front-24-16x9", 200]])
  add(`near-${p}-${d / 10}cm`, "size", { profile: p, d }, "near", "face too large: closer than about 22 cm");

// C. head angles at 35 cm (iPhone 16:9): small angles pass, clear angles get one instruction
const P0 = { profile: "iphone-front-16x9", d: 350 };
for (const yaw of [0, 2, -2]) add(`yaw-${yaw}`, "angle", { ...P0, yaw }, "ok", "facing the camera");
for (const yaw of [8, -8, 15, -15, 25, -25]) add(`yaw-${yaw}`, "angle", { ...P0, yaw }, "turn", "head turned sideways");
for (const roll of [4, -4]) add(`roll-${roll}`, "angle", { ...P0, roll }, "ok", "head nearly level");
for (const roll of [13, -13, 20, -20]) add(`roll-${roll}`, "angle", { ...P0, roll }, "tilt", "head tilted sideways");
for (const pitch of [-10, -5, 5, 10]) add(`pitch-${pitch}`, "angle", { ...P0, pitch }, "ok", "chin about level");
for (const pitch of [-22, -28]) add(`pitch-${pitch}`, "angle", { ...P0, pitch }, "chinUp", "chin down: ask to raise the chin");
for (const pitch of [22, 28]) add(`pitch-${pitch}`, "angle", { ...P0, pitch }, "chinDown", "chin up: ask to lower the chin");

// D. position: off the oval (still fully in the picture) and partly outside the picture
for (const [tx, ty] of [[0.3, 0.42], [0.7, 0.42], [0.5, 0.25], [0.5, 0.6]]) add(`off-${tx}-${ty}`, "position", { ...P0, tx, ty }, "out", "face inside the picture but away from the oval");
for (const [tx, ty] of [[0.08, 0.42], [0.92, 0.42], [0.5, 0.08], [0.5, 0.93]]) add(`cut-${tx}-${ty}`, "position", { ...P0, tx, ty }, "cut", "part of the face outside the picture");

// E. priority: one instruction at a time, the first in the defined order wins
{
  const s = M.shot({ ...P0, yaw: 20 }); const s2 = M.shot({ profile: "iphone-front-16x9", d: 500, tx: 0.2, ty: 0.42 });
  cases.push({ id: "prio-multi-over-turn", group: "priority", ...meta(P0, { yaw: 20 }), W: s.W, H: s.H, n: 2, expect: "multi", why: "two faces: multi first", pts: s.pts });
  cases.push({ id: "prio-no-face", group: "priority", profile: P0.profile, d: 0, W: s.W, H: s.H, n: 0, expect: "out", why: "no face: into the oval", pts: null });
  cases.push({ id: "prio-no-face-dark", group: "priority", profile: P0.profile, d: 0, W: s.W, H: s.H, n: 0, px: { dark: true }, expect: "dark",
    why: "no face in a dark picture: more light", pts: null });
  cases.push({ id: "prio-out-over-far", group: "priority", ...meta({ profile: "iphone-front-16x9", d: 900 }, { tx: 0.25 }), W: s2.W, H: s2.H, n: 1,
    expect: "out", why: "far and off the oval: out first",
    pts: M.shot({ profile: "iphone-front-16x9", d: 900, tx: 0.25 }).pts });
}
add("prio-near-over-turn", "priority", { profile: "iphone-front-16x9", d: 180, yaw: 20 }, "near", "too close and turned: near first");
add("prio-far-over-tilt", "priority", { profile: "iphone-front-16x9", d: 900, roll: 20 }, "far", "too far and tilted: far first");
add("prio-turn-over-chin", "priority", { ...P0, yaw: 20, pitch: 28 }, "turn", "turned and chin up: turn first");
add("prio-dark-over-turn", "priority", { ...P0, yaw: 20 }, "dark", "dark and turned: light first", { px: { dark: true } });
add("prio-backlight-over-tilt", "priority", { ...P0, roll: 20 }, "backlight", "backlit and tilted: light first", { px: { backlight: true } });
add("prio-chin-over-glare", "priority", { ...P0, pitch: -28 }, "chinUp", "chin and glare: chin first", { px: { glare: true } });
add("prio-glare-over-blur", "priority", P0, "glare", "glare and blur: glare first", { px: { glare: true, blur: true } });
add("prio-blur-over-still", "priority", P0, "blur", "blurred and moving: blur first", { px: { blur: true }, moving: true });
add("prio-still", "priority", P0, "still", "everything passes but the face moves: hold still", { moving: true });

// F. the old capture-hint boxes (tests/e2e/capture-hints.e2e.mjs, 640x480, fake detector = faceread synthFace)
// are kept as e2e inputs; their answers under the new rule are asserted in the unit test from faceread.js directly.

// G. rendered pictures for the image-quality checks (flat shapes, no person), iPhone 4:3 picture at 35 cm
const R0 = { profile: "iphone-front-4x3", d: 350 };
const pics = [
  ["clean", {}, { dark: false, backlight: false, glare: false, blur: false }, "plain front-lit face"],
  ["clean-noise", { noise: 6 }, { dark: false, backlight: false, glare: false, blur: false }, "sensor-like noise is not blur or glare"],
  ["clean-glasses", { glasses: true }, { dark: false, backlight: false, glare: false, blur: false }, "glasses without glare"],
  ["soft-1", { blur: 1 }, { blur: false }, "slight softness (1 px box x3) is not blur"],
  ["blur-4", { blur: 4 }, { blur: true }, "out of focus / motion (4 px box x3)"],
  ["blur-6", { blur: 6, noise: 4 }, { blur: true }, "strong blur with noise"],
  ["dark", { dark: true }, { dark: true }, "light 20 %"],
  ["backlight", { backlight: true }, { backlight: true, dark: false }, "bright window behind, face in shadow"],
  ["glare", { glare: true }, { glare: true }, "white reflections on both lenses"],
  ["glare-noise", { glare: true, noise: 5 }, { glare: true }, "glare with noise"]
];
for (const [name, ro, exp, why] of pics) {
  const s = M.shot(R0);
  const img = M.render({ W: s.W, H: s.H, pts: s.pts, ...ro, seed: 11 });
  writeFileSync(join(out, "images", name + ".png"), M.png(img));
  cases.push({ id: "pix-" + name, group: "pixels", ...meta(R0, {}), W: s.W, H: s.H, n: 1, render: { ...ro, seed: 11 }, rgbaSha256: M.sha256Hex(img.data),
    expectPx: exp, why, pts: s.pts });
}
// the same clean and blurred face on a 16:9 iPhone picture at 30 cm (bigger face, more pixels per edge)
for (const [name, ro, exp] of [["clean-169", {}, { blur: false, glare: false }], ["blur-169", { blur: 6 }, { blur: true }]]) {
  const s = M.shot({ profile: "iphone-front-16x9", d: 300 });
  const img = M.render({ W: s.W, H: s.H, pts: s.pts, ...ro, seed: 11 });
  writeFileSync(join(out, "images", name + ".png"), M.png(img));
  cases.push({ id: "pix-" + name, group: "pixels", ...meta({ profile: "iphone-front-16x9", d: 300 }, {}), W: s.W, H: s.H, n: 1, render: { ...ro, seed: 11 },
    rgbaSha256: M.sha256Hex(img.data), expectPx: exp, why: "16:9 picture at 30 cm", pts: s.pts });
}

function meta(base, o) { return { profile: base.profile, d: base.d, ipd: 63, yaw: o.yaw || 0, pitch: o.pitch || 0, roll: o.roll || 0, tx: o.tx == null ? 0.5 : o.tx, ty: o.ty == null ? 0.42 : o.ty }; }

const set = {
  name: "face-capture fixed set v1", created: "2026-11-16", source: "synthetic (face-model.js; no person, no photo)",
  cameraModel: "pinhole, 35 mm-equivalent focal length on a 4:3 sensor, 16:9 video crops the short side; picture upright",
  profiles: M.PROFILES, cases
};
writeFileSync(join(out, "set.json"), JSON.stringify(set, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
console.log(`${cases.length} cases -> ${join(out, "set.json")}`);

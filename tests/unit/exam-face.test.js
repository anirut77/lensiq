"use strict";
// tests/unit/exam-face.test.js — LENSIQ Exam face engine (lensiq-exam-face.js, MediaPipe Face Landmarker by default since
// 2026-11-10): mesh -> 68-point mapping, pose from mesh / matrix, the ?fakedet seam, engine choice (face-api.js only in
// the research demo + ?faceengine=faceapi), the lab monitor with no face engine, the vendored model files (no
// facial-movement score model in the .task, sha256 as in the READMEs) and the Exam pages' scripts (no face-api.js).
// Re-lock 2026-11-22 (owner decision 223, approved 223-1): assertions that required a figure, source or old status word on a
// customer page are inverted (the page must not show it) and redirected (docs/tech-sheets/* must hold it verbatim).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const F = require("../../lensiq-exam-face.js");
const E = require("../../lensiq-exam.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const sha = f => crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test("MESH68 maps every 68-point index poseFrom68 reads onto a distinct Face Mesh point", () => {
  const used = [0, 16, 30, 36, 45, 8, 60, 61, 62, 63, 64, 65, 66, 67];
  assert.deepEqual(Object.keys(F.MESH68).map(Number).sort((a, b) => a - b), used.sort((a, b) => a - b));
  const v = Object.values(F.MESH68);
  assert.equal(new Set(v).size, v.length, "distinct mesh points");
  assert.ok(v.every(i => Number.isInteger(i) && i >= 0 && i < 468), "inside the 468-point face mesh (no iris points)");
  assert.equal(F.PITCH_K, 120, "same degrees-per-unit as lensiq-exam.js");
});

test("synthMesh -> poseFromMesh gives back yaw / pitch / mouth (mesh68 = the default, and matrix)", () => {
  assert.equal(F.DEFAULT_POSE, "mesh68");
  const box = { x: 200, y: 100, w: 200, h: 240 };
  for (const [yaw, pitch, mar] of [[0, 0, 0.05], [-30, 0, 0.05], [40, 0, 0.3], [0, 20, 0.05], [-50, 10, 0.2]]) {
    const m = F.synthMesh(box, yaw, pitch, mar, 640, 480);
    assert.equal(m.lms.length, 478);
    const a = F.poseFromMesh(m.lms, 640, 480, { matrix: m.matrix });
    const b = E.poseFrom68(E.synth68(box, yaw, pitch, mar));
    near(a.yaw, b.yaw, 1e-6, "mesh68 = poseFrom68 on the same points (yaw)");
    near(a.pitchN, b.pitchN, 1e-6, "pitchN"); near(a.mar, b.mar, 1e-6, "mar");
    near(a.yaw, yaw, 0.5, "yaw back"); near(E.pitchDeg(a.pitchN), pitch, 0.5, "pitch back"); near(a.mar, mar, 1e-3, "mar back");
    const c = F.poseFromMesh(m.lms, 640, 480, { pose: "matrix", matrix: m.matrix });
    near(c.yaw, yaw, 1e-6, "matrix yaw"); near(E.pitchDeg(c.pitchN), pitch, 1e-6, "matrix pitch"); near(c.mar, mar, 1e-3, "matrix mar");
    const bx = F.boxOf(m.lms, 640, 480);
    near(bx.x, box.x, 1e-6, "box x"); near(bx.y, box.y, 1e-6, "box y"); near(bx.w, box.w, 1e-6, "box w"); near(bx.h, box.h, 1e-6, "box h");
  }
});

test("matrixAngles: yaw < 0 = nose toward the image's left, pitch > 0 = looking down; bad input -> null", () => {
  const M = (fx, fy, fz) => { const d = new Array(16).fill(0); d[0] = d[5] = d[15] = 1; d[8] = fx; d[9] = fy; d[10] = fz; return d; };
  near(F.matrixAngles(M(0, 0, 1)).yaw, 0, 1e-9, "frontal");
  assert.ok(F.matrixAngles(M(-0.5, 0, 0.8)).yaw < 0, "nose to the image's left");
  assert.ok(F.matrixAngles(M(0.5, 0, 0.8)).yaw > 0);
  assert.ok(F.matrixAngles(M(0, -0.4, 0.9)).pitch > 0, "forward axis below the horizon = looking down");
  near(F.matrixAngles(M(Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4))).yaw, 45, 1e-9, "45 degrees");
  assert.equal(F.matrixAngles(null), null); assert.equal(F.matrixAngles([1, 2]), null); assert.equal(F.matrixAngles(M(0, 0, 0)), null);
  assert.equal(F.matrixAngles(M(NaN, 0, 1)), null);
  // matrix pose without a matrix: no pose (head turn not evaluated for that frame), never a made-up 0
  const m = F.synthMesh({ x: 10, y: 10, w: 100, h: 120 });
  assert.equal(F.poseFromMesh(m.lms, 640, 480, { pose: "matrix" }), null);
  assert.equal(F.poseFromMesh([], 640, 480), null);
  assert.equal(F.meshTo68(null, 640, 480), null);
});

test("pickEngine: MediaPipe in every build; face-api.js only with the research demo on AND ?faceengine=faceapi", () => {
  const win = (search, research, profile) => ({ location: { search }, LENSIQ_RESEARCH: research == null ? undefined : { on: research }, LENSIQ_PROFILE: profile });
  assert.equal(F.pickEngine(win("", false, "commercial")), "mediapipe");
  assert.equal(F.pickEngine(win("?faceengine=faceapi", false, "commercial")), "mediapipe", "customer build: the URL cannot switch it");
  assert.equal(F.pickEngine(win("?faceengine=faceapi", null, undefined)), "mediapipe", "no config = customer mode");
  assert.equal(F.pickEngine(win("?faceengine=faceapi", true, "commercial")), "mediapipe", "research flag without the demo profile");
  assert.equal(F.pickEngine(win("", true, "demo")), "mediapipe", "research demo alone keeps MediaPipe");
  assert.equal(F.pickEngine(win("?cpu&faceengine=faceapi", true, "demo")), "faceapi");
  assert.equal(F.pickEngine(win("?faceengine=FACEAPI", true, "demo")), "mediapipe", "exact value only");
  assert.equal(F.create("mediapipe").name, "mediapipe");
  assert.equal(F.create("anything").name, "mediapipe");
  assert.equal(F.create("faceapi").name, "faceapi");
  assert.equal(F.MP_OPTIONS.runningMode, "IMAGE"); assert.equal(F.MP_OPTIONS.numFaces, 4); assert.ok(Object.isFrozen(F.MP_OPTIONS));
  assert.equal(F.MP_MODEL, "vendor/models/face-landmarker/face_landmarker_lm.task");
});

test("lab monitor: no face engine (faceOff) never reads as 'no face'; the same frames with an engine do", () => {
  const run = faceOff => {
    const mon = E.createLabMonitor(); mon.setBaseline({ ok: true, yaw0: 0, pitchN0: 0.45 });
    const ev = [];
    for (let t = 0; t <= 60000; t += 250) ev.push(...mon.frame(t, { faces: [], quality: { ok: true }, faceOff }));
    return ev;
  };
  const off = run(true), on = run(false);
  assert.deepEqual(off.filter(e => /noface|multiface|headturn|mouth/.test(e.sig)), [], "face signals off");
  assert.ok(on.some(e => e.sig === "noface" && e.lvl === "watch") && on.some(e => e.sig === "noface" && e.lvl === "check"), "control: no-face fires with an engine");
  // two faces with faceOff: still nothing; objects keep working
  const mon = E.createLabMonitor(); const ev = [];
  const two = [{ yaw: 0, pitchN: 0.45, mar: 0.05 }, { yaw: 0, pitchN: 0.45, mar: 0.05 }];
  for (let t = 0; t <= 10000; t += 250) ev.push(...mon.frame(t, { faces: two, objects: [{ cls: "phone", score: 0.9 }], quality: { ok: true }, faceOff: true }));
  assert.ok(!ev.some(e => e.sig === "multiface"), "no multi-face with faceOff");
  assert.ok(ev.some(e => e.sig === "phone" && e.lvl === "check"), "the object detector still flags a phone");
  // the "fix setup" message the page sends is allowed by the message allowlist
  const m = E.cleanMsg({ v: 1, type: "ev", room: "LAB1", node: "abcdef12", src: "lab", seat: "3", sig: "setup", lvl: "setup", t: 1, id: "e1-ab12", code: "faceoff" });
  assert.ok(m.ok, JSON.stringify(m));
});

/** names of the members of a ZIP (central directory) */
function zipNames(buf) {
  const names = [];
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue;
    const n = buf.readUInt16LE(i + 28), x = buf.readUInt16LE(i + 30), c = buf.readUInt16LE(i + 32);
    names.push(buf.toString("utf8", i + 46, i + 46 + n)); i += 45 + n + x + c;
  }
  return names;
}
test("vendored Face Landmarker: landmarks only (no facial-movement score model), Apache-2.0 text, sha256 as in the README", () => {
  const f = "vendor/models/face-landmarker/face_landmarker_lm.task";
  const names = zipNames(fs.readFileSync(path.join(ROOT, f))).sort();
  assert.deepEqual(names, ["face_detector.tflite", "face_landmarks_detector.tflite", "geometry_pipeline_metadata_landmarks.binarypb"]);
  const readme = read("vendor/models/face-landmarker/README.txt");
  assert.ok(readme.includes(sha(f)), "README sha256 matches the file");
  assert.match(readme, /Apache License 2\.0/); assert.match(readme, /section 4\(b\)/, "modification notice");
  assert.match(read("vendor/models/face-landmarker/LICENSE"), /Apache License\s+Version 2\.0/);
  // TF.js runtime used by the Exam pages instead of face-api.js
  const tr = read("vendor/tfjs/README.txt");
  for (const g of ["vendor/tfjs/tf.es2017.min.js", "vendor/tfjs/tf-backend-wasm.es2017.min.js", "vendor/tfjs-backend-wasm.wasm",
    "vendor/tfjs-backend-wasm-simd.wasm", "vendor/tfjs-backend-wasm-threaded-simd.wasm"]) {
    assert.ok(tr.includes(sha(g)), "vendor/tfjs/README.txt lists the sha256 of " + g);
  }
  assert.match(read("vendor/tfjs/LICENSE"), /Apache License\s+Version 2\.0/);
  // credits recorded
  for (const doc of ["LICENSES/THIRD_PARTY.md", "LICENSES/THIRD-PARTY-NOTICES.txt", "about.html"]) assert.match(read(doc), /Face Landmarker/, doc);
});

test("Exam pages: the lab and hall pages load TF.js on its own (the lab on demand) and never vendor/face-api.js; the lab loads the face engine after LQExam", () => {
  for (const p of ["exam-lab.html", "exam-hall.html", "exam.html", "exam-dashboard.html"]) {
    const scripts = [...read(p).matchAll(/<script src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, ""));
    assert.ok(!scripts.includes("vendor/face-api.js"), p + " loads face-api.js");
    // exam-lab.html (S2, branch examlab-s2): TF.js is no page script; exam-lab.js loads it on demand, TF.js before its wasm
    // backend, never face-api.js; the same guard plus the preload order is in tests/unit/exam-s2-load.test.js
    if (p === "exam-lab.html") {
      assert.ok(!scripts.some(s => s.startsWith("vendor/tfjs/")), p + " TF.js is loaded on demand, not as a page script");
      const lab = read("exam-lab.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1"); // code only
      const a = lab.indexOf('"vendor/tfjs/tf.es2017.min.js"'), b = lab.indexOf('"vendor/tfjs/tf-backend-wasm.es2017.min.js"');
      assert.ok(a >= 0 && b > a, "exam-lab.js loads TF.js + wasm backend, in that order");
      assert.ok(!/face-api/.test(lab), "exam-lab.js never names face-api.js");
    }
    if (p === "exam-hall.html") {
      const tf = scripts.indexOf("vendor/tfjs/tf.es2017.min.js");
      assert.ok(tf >= 0 && tf < scripts.indexOf("vendor/tfjs/tf-backend-wasm.es2017.min.js"), p + " TF.js + wasm backend");
      assert.ok(scripts.indexOf("vendor/tfjs/tf-backend-wasm.es2017.min.js") < scripts.indexOf("lensiq-detect.js"), p + " TF.js before lensiq-detect.js");
    }
    const at = f => scripts.indexOf(f);
    if (p === "exam-lab.html") assert.ok(at("lensiq-exam.js") < at("lensiq-exam-face.js") && at("lensiq-exam-face.js") < at("exam-lab.js"), "load order");
  }
  // the only route to face-api.js in Exam is the research-demo engine, and it is injected on demand
  const face = read("lensiq-exam-face.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1"); // code only
  assert.equal((face.match(/vendor\/face-api\.js/g) || []).length, 1, "one place in the code names face-api.js");
  assert.match(face, /await script\(abs\("vendor\/face-api\.js"\)\)/, "injected inside createFaceApi().init() only");
  assert.match(face, /research && q === "faceapi" \? "faceapi" : "mediapipe"/);
});

test("MediaPipe options: create({options}) and setOptions() keep only thresholds and face count; output switches are dropped", async () => {
  const bad = {
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false, runningMode: "VIDEO", baseOptions: { delegate: "GPU" },
    numFaces: 2, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 7, minTrackingConfidence: "0.3"
  };
  assert.deepEqual(F.cleanOptions(bad), { numFaces: 2, minFaceDetectionConfidence: 0.4 });
  assert.deepEqual(F.cleanOptions(null), {});
  assert.deepEqual(F.cleanOptions({ numFaces: 0.5 }), {});
  assert.deepEqual(F.cleanOptions({ numFaces: 99 }), {});
  // a fake Tasks module records exactly what the landmarker receives
  const got = { create: null, set: [] };
  const vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceLandmarker: { createFromOptions: async (files, op) => { got.create = op; return { setOptions: async x => { got.set.push(x); }, detect: () => ({}) }; } }
  };
  const e = F.createMediaPipe({ options: bad, base: "http://127.0.0.1/", vision });
  await e.init();
  const c = got.create;
  assert.ok(!("outputFaceBlendshapes" in c), "blendshape output dropped at create");
  assert.equal(c.outputFacialTransformationMatrixes, true, "matrix output stays as fixed by MP_OPTIONS");
  assert.equal(c.runningMode, "IMAGE");
  assert.deepEqual(c.baseOptions, { modelAssetPath: "http://127.0.0.1/" + F.MP_MODEL, delegate: "CPU" }, "caller cannot change the model or delegate");
  assert.equal(c.numFaces, 2); assert.equal(c.minFaceDetectionConfidence, 0.4); assert.equal(c.minFacePresenceConfidence, 0.5);
  assert.deepEqual(Object.keys(c).filter(k => k !== "baseOptions").sort(), Object.keys(F.MP_OPTIONS).sort(), "never a key outside MP_OPTIONS");
  await e.setOptions({ outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false, numFaces: 1 });
  assert.deepEqual(got.set, [{ numFaces: 1 }], "setOptions passes only the cleaned keys");
  assert.ok(!("outputFaceBlendshapes" in e.options) && e.options.outputFacialTransformationMatrixes === true && e.options.numFaces === 1);
});

/* ---------- face boxes only (hall small faces / lab second-person pass; docs/exam/FACE-ENGINE-RESULTS.md §6 – §7) ---------- */
test("tileRects = LQDetect.tileRects (n x n, 20 % overlap) and covers the frame", () => {
  const D = require("../../lensiq-detect.js");
  for (const n of [2, 3]) {
    const a = F.tileRects(n, 0.2), b = D.tileRects(n, n, 0.2);
    assert.equal(a.length, n * n);
    a.forEach((r, i) => { for (const k of ["x", "y", "w", "h"]) near(r[k], b[i][k], 1e-12, `tile ${i}.${k}`); });
    near(Math.max(...a.map(r => r.x + r.w)), 1, 1e-9, "right edge"); near(Math.max(...a.map(r => r.y + r.h)), 1, 1e-9, "bottom edge");
  }
});

test("mergeFaces / sameFace / addSecondary: one box per face, the higher score kept; secondary faces only add new people", () => {
  const A = { box: { x: 100, y: 100, w: 40, h: 40 }, score: 0.9 };
  const A2 = { box: { x: 104, y: 102, w: 40, h: 40 }, score: 0.6 }; // same face, other tile
  const Ain = { box: { x: 110, y: 110, w: 20, h: 20 }, score: 0.95 }; // inside A (>= 60 % of the smaller box)
  const B = { box: { x: 300, y: 100, w: 30, h: 30 }, score: 0.5 };
  const m = F.mergeFaces([A2, A, B, Ain]);
  assert.equal(m.length, 2, JSON.stringify(m));
  assert.equal(m[0], Ain, "highest score first"); assert.ok(m.includes(B));
  assert.ok(F.sameFace(A.box, A2.box) && !F.sameFace(A.box, B.box));
  assert.deepEqual(F.mergeFaces([{ box: { x: 0, y: 0, w: 0, h: 5 }, score: 1 }, null]), [], "empty boxes dropped");
  const prim = [{ box: A.box, yaw: 0 }];
  assert.equal(F.addSecondary(prim, [A2, B]).length, 2, "the candidate is not counted twice; a new face is added");
  assert.equal(F.addSecondary(prim, []).length, 1);
});

test("mapTileBox: tile px -> frame px; a box cut by an INNER tile edge is dropped, frame edges are kept", () => {
  const W = 1280, H = 720, r = { x: 0.5, y: 0, w: 0.5, h: 0.5 }; // top-right tile: inner edges left and bottom
  assert.deepEqual(F.mapTileBox({ x: 10, y: 10, w: 20, h: 20 }, r, W, H), { x: 650, y: 10, w: 20, h: 20 });
  assert.equal(F.mapTileBox({ x: 1, y: 50, w: 20, h: 20 }, r, W, H), null, "touches the inner left edge");
  assert.equal(F.mapTileBox({ x: 50, y: 340, w: 20, h: 20 }, r, W, H), null, "touches the inner bottom edge");
  assert.ok(F.mapTileBox({ x: 50, y: 0, w: 20, h: 20 }, r, W, H), "frame top edge is not an inner edge");
  assert.ok(F.mapTileBox({ x: 618, y: 50, w: 22, h: 20 }, r, W, H), "frame right edge is not an inner edge");
  assert.deepEqual(F.mapTileBox({ x: 0, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 1, h: 1 }, W, H), { x: 0, y: 0, w: 5, h: 5 }, "whole frame");
});

test("createFaceBoxes: FaceDetector options (CPU, IMAGE, confidence), whole + tiles mapped back and merged, boxes and score only", async () => {
  const got = [];
  const vision = {
    FilesetResolver: { forVisionTasks: async p => ({ wasm: p }) },
    FaceDetector: {
      createFromOptions: async (files, op) => {
        got.push({ files, op });
        return {
          // whole frame (1280 x 720): one face at (600, 300); every tile crop: a face at (40, 40) in tile px
          detect: img => ({ detections: img.width === 1280 ? [{ boundingBox: { originX: 600, originY: 300, width: 30, height: 30 }, categories: [{ score: 0.8 }], keypoints: [{ x: 0, y: 0 }] }]
            : [{ boundingBox: { originX: 40, originY: 40, width: 20, height: 20 }, categories: [{ score: 0.6 }] }] }),
          close() {}
        };
      }
    }
  };
  const draws = [];
  const makeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...a) => draws.push(a) }) });
  // the measurement tool serves the outside folder under this same-origin prefix (tools/exam-hall-face-eval.mjs VENDOR_MOUNT)
  const FULL = { bundle: "/__eval-vendor/mediapipe-1.2.2/vision_bundle.mjs", wasm: "/__eval-vendor/mediapipe-1.2.2/wasm",
    model: "/__eval-vendor/models/face-detector-full/blaze_face_full_range.tflite" };
  assert.deepEqual(Object.keys(F.FD_MODELS), ["short"], "the page script names only the short-range detector");
  const e = F.createFaceBoxes({ model: "full", files: FULL, tiles: 2, whole: true, conf: 0.3, base: "http://127.0.0.1/", vision, makeCanvas });
  assert.equal(e.model, "full");
  assert.equal(e.passes, 5);
  const r = await e.detect({ width: 1280, height: 720 });
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].op, { baseOptions: { modelAssetPath: "http://127.0.0.1" + FULL.model, delegate: "CPU" }, runningMode: "IMAGE", minDetectionConfidence: 0.3 });
  assert.equal(got[0].files.wasm, "http://127.0.0.1" + FULL.wasm, "full-range runs on the Tasks Vision 1.2.2 copy (files passed in by the measurement tool)");
  assert.equal(draws.length, 4, "one crop per tile");
  assert.equal(r.length, 5, "whole-frame face + one per tile (distinct places)");
  for (const d of r) assert.deepEqual(Object.keys(d).sort(), ["box", "score"], "boxes and score only");
  assert.deepEqual(r[0], { box: { x: 600, y: 300, w: 30, h: 30 }, score: 0.8 });
  const t = F.tileRects(2, 0.2);
  assert.ok(r.some(d => Math.abs(d.box.x - (t[3].x * 1280 + 40)) < 1e-6 && Math.abs(d.box.y - (t[3].y * 720 + 40)) < 1e-6), "tile box mapped to the frame");
  // the short-range detector runs on the vendored bundle; bad values fall back
  const s = F.createFaceBoxes({ model: "short", tiles: 7, conf: 5, base: "http://127.0.0.1/", vision });
  await s.init();
  assert.equal(got[1].op.minDetectionConfidence, 0.5); assert.equal(s.tiles, 0); assert.equal(s.passes, 1);
  assert.equal(got[1].op.baseOptions.modelAssetPath, "http://127.0.0.1/vendor/models/face-gate/blaze_face_short_range.tflite");
  assert.equal(got[1].files.wasm, "http://127.0.0.1/vendor/mediapipe/wasm");
});

test("measurement-only files (Tasks Vision 1.2.2 + BlazeFace full-range) are NOT in the repo; the tool reads them from outside; §7.3 records where, sha256 and licence", () => {
  // owner decision 2026-11-10: not shipped, so not in the repo, not in the licence notices, not on the About page
  for (const d of ["vendor/mediapipe-1.2.2", "vendor/models/face-detector-full"]) assert.ok(!fs.existsSync(path.join(ROOT, d)), d + " must stay out of the repo");
  for (const doc of ["LICENSES/THIRD_PARTY.md", "LICENSES/THIRD-PARTY-NOTICES.txt", "about.html", "i18n/en-common.js", "i18n/zh-common.js"]) {
    assert.doesNotMatch(read(doc), /mediapipe-1\.2\.2|face-detector-full|BlazeFace full-range|about\.oss\.examhall/i, doc + " lists only what is shipped");
  }
  // the tool: location by flag or env, default outside the repo, sha256 checked, clear error when missing
  const tool = read("tools/exam-hall-face-eval.mjs"), pg = read("tools/exam-hall-face-page.mjs");
  assert.match(tool, /opt\("--vendor", process\.env\.LQ_EXAM_EVAL_VENDOR \|\| join\(homedir\(\), "LENSIQ-field", "evals", "exam-followups", "vendor"\)\)/);
  assert.match(tool, /missing file: \$\{f\}/); assert.match(tool, /the vendor folder must be outside the repo/);
  assert.match(tool, /Pass --vendor <dir> or set LQ_EXAM_EVAL_VENDOR/);
  assert.doesNotMatch(tool + pg, /["'`]vendor\/mediapipe-1\.2\.2|["'`]vendor\/models\/face-detector-full/, "no in-repo path to the measurement-only files");
  assert.match(pg, /vendorBase \+ "\/models\/face-detector-full\/blaze_face_full_range\.tflite"/);
  // the sha256 the tool enforces are the ones recorded in the results document, with the place and the licence
  const s73 = /### 7\.3 [\s\S]*?(?=\n### 7\.4 )/.exec(read("docs/exam/FACE-ENGINE-RESULTS.md"))[0];
  const hashes = [...tool.matchAll(/"((?:mediapipe-1\.2\.2|models\/face-detector-full)\/[^"]+)": "([0-9a-f]{64})"/g)];
  assert.equal(hashes.length, 4);
  for (const [, file, h] of hashes) assert.ok(s73.includes(file) && s73.includes(h), "§7.3 records the sha256 of " + file);
  assert.match(s73, /~\/LENSIQ-field\/evals\/exam-followups\/vendor\//); assert.match(s73, /Apache-2\.0/); assert.match(s73, /Model Card \(Full Range\)/);
  assert.match(s73, /Owner decision \(2026-11-10\)/);
});

/* every root page that links to the hall page labels that link "experimental" in Thai, English and Chinese */
test("every page offering the hall page hides the link with data-lq-off and shows no status label in Thai, English and Chinese (decision 226)", () => {
  const all = lang => Object.assign({}, ...fs.readdirSync(path.join(ROOT, "i18n")).filter(x => x.startsWith(lang + "-") && x.endsWith(".js")).map(x => {
    try { return dictOf("i18n/" + x); } catch { return {}; }
  }));
  const en = all("en"), zh = all("zh");
  // Decision 226 (inverts the 223-2 label check): no status label of any kind where a customer looks, and the hall product is
  // switched off: every link to it on a static page sits inside an element carrying data-lq-off (nav.js hides it), the
  // generated category page does not list it, and the label "รุ่นทดลอง ยังไม่เปิดขาย" lives only in the back office.
  const LABEL_TH = /ทดลอง|ยังไม่เปิดขาย/, LABEL_EN = /trial version|experimental|not on sale/i, LABEL_ZH = /试用版|实验性|尚未开售|不销售/;
  const pages = fs.readdirSync(ROOT).filter(x => x.endsWith(".html") && x !== "exam-hall.html" && /href="exam-hall\.html"/.test(read(x)));
  for (const must of ["cameras.html", "exam.html"]) assert.ok(pages.includes(must), must + " still holds the (hidden) hall link: markup is never deleted");
  assert.ok(!pages.includes("cat-education.html") && !/data-page="exam-hall"/.test(read("cat-education.html")), "cat-education.html does not list the switched-off hall page");
  /** true when index idx of html lies inside an element whose opening tag carries data-lq-off */
  const insideOff = (html, idx) => {
    for (const o of html.slice(0, idx).matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-lq-off\b[^>]*>/g)) {
      const tag = o[1], re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
      re.lastIndex = o.index + o[0].length;
      let depth = 1, mm;
      while (depth && (mm = re.exec(html))) depth += mm[0][1] === "/" ? -1 : 1;
      if (!mm || mm.index > idx) return true;
    }
    return false;
  };
  const perPage = {};
  for (const p of pages) {
    const html = read(p);
    for (const m of html.matchAll(/<a\b[^>]*href="exam-hall\.html"[^>]*>[\s\S]*?<\/a>/g)) {
      perPage[p] = (perPage[p] || 0) + 1;
      assert.ok(insideOff(html, m.index), `${p}: hall link not inside a data-lq-off element: ${m[0].slice(0, 90)}`);
      // the link and (a bare "open" button) the card that holds it carry no status label
      let scope = m[0];
      const start = html.lastIndexOf("<article", m.index), end = html.indexOf("</article>", m.index);
      if (start >= 0 && end > m.index && html.lastIndexOf("</article>", m.index) < start) scope = html.slice(start, end);
      assert.doesNotMatch(scope.replace(/<[^>]+>/g, " "), /\(?รุ่นทดลอง\)?|\(ทดลอง\)/, `${p}: Thai status label on the hall link / card`);
      const keys = [...scope.matchAll(/data-i18n="([^"]+)"/g)].map(k => k[1]);
      assert.ok(keys.length, p + ": hall link text is translatable");
      for (const k of keys) { assert.ok(en[k] != null, `${p}: en ${k}`); assert.ok(zh[k] != null, `${p}: zh ${k}`); }
      for (const k of keys) {
        assert.doesNotMatch(en[k], /trial version|experimental/i, `${p}: en ${k} carries a status label`);
        assert.doesNotMatch(zh[k], /试用版|实验性/, `${p}: zh ${k} carries a status label`);
      }
    }
  }
  assert.deepEqual(perPage, { "cameras.html": 1, "exam.html": 2 }, "hall links checked (all hidden)");
  // every inline Thai copy of the navigation description (the default text under data-i18n) carries no label
  for (const p of fs.readdirSync(ROOT).filter(x => x.endsWith(".html"))) {
    for (const m of read(p).matchAll(/data-i18n="nav\.exam-hall\.desc">([^<]*)</g)) assert.doesNotMatch(m[1], LABEL_TH, p + ": inline Thai nav.exam-hall.desc");
  }
  assert.match(read("nav.js"), /href: "exam-hall\.html", title: "เครื่องกล้องในห้องสอบ", desc: "วาดที่นั่ง แจ้งที่นั่งว่างและคนเกิน" \}/);
  assert.doesNotMatch(read("nav.js"), /href: "exam-hall\.html"[^}]*\(รุ่นทดลอง\)/);
  for (const d of [en, zh]) assert.doesNotMatch(d["nav.exam-hall.desc"], d === en ? LABEL_EN : LABEL_ZH);
  // the switch and the label in the back office
  assert.match(read("nav.js"), /var VISIBILITY = \{[\s\S]*?"exam-hall": false,[\s\S]*?\};/);
  assert.match(read("admin-measurements.js"), /"exam-hall", "รุ่นทดลอง ยังไม่เปิดขาย", "Trial version, not on sale yet", "试用版，尚未开售", "off",/);
});

/* ---------- follow-ups 2026-11-10: hall "experimental", the hall pick, the lab second-person cue (§7) ---------- */
function dictOf(file) {
  const w = {}; w.window = w; require("node:vm").runInNewContext(read(file), w);
  const lang = /i18n\/(en|zh)-/.exec(file)[1];
  return Object.assign({}, ...w.LQI18N_Q.map(q => q[lang] || {}));
}
const THAI_RE = /[฀-๿]/;

test("hall mode carries no status label where it is offered or sold (decision 226), its limit stays; the label lives in the back office; lab mode unchanged", () => {
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  const enC = dictOf("i18n/en-common.js"), zhC = dictOf("i18n/zh-common.js"), enS = dictOf("i18n/en-solutions.js"), zhS = dictOf("i18n/zh-solutions.js");
  const enCat = dictOf("i18n/en-cat.js"), zhCat = dictOf("i18n/zh-cat.js");
  // Decision 223-2 (approved 223-1): the label is now "รุ่นทดลอง" / "Trial version" / "试用版"; the measured figures, n and
  // source left the customer page and are held verbatim by the technical sheet (docs/tech-sheets/exam-TH.md / -EN.md).
  const TH = /ทดลอง/, EN = /trial version/i, ZH = /试用版/, OLD_EN = /experimental/i, OLD_ZH = /实验性/;
  const sheetTH = read("docs/tech-sheets/exam-TH.md"), sheetEN = read("docs/tech-sheets/exam-EN.md");
  const sheet = (src, key) => src.split("\n").filter(l => l.startsWith("[" + key + "] ")).map(l => l.slice(key.length + 3));
  // the hall page itself: a banner above the setup form, label + plain limit; figures, n and source in the tech sheet
  const hall = read("exam-hall.html");
  assert.ok(hall.indexOf('id="hallExp"') > 0 && hall.indexOf('id="hallExp"') < hall.indexOf('id="setupForm"'), "banner above the setup form");
  const banner = /id="hallExp"[^>]*>([\s\S]*?)<\/p>/.exec(hall)[1];
  // decision 226: the badge "รุ่นทดลอง ยังไม่เปิดขาย" (exam.hall.expB) left the banner; the plain limit stays
  assert.doesNotMatch(banner, /exam\.hall\.expB|รุ่นทดลอง|ยังไม่เปิดขาย/);
  assert.match(banner, /^<span data-i18n="exam\.hall\.exp">ใบหน้าที่อยู่ไกลกล้องยังหาไม่เจอ/);
  const [shTh] = sheet(sheetTH, "exam.hall.exp"), [shEn, shZh] = sheet(sheetEN, "exam.hall.exp");
  assert.ok(shTh && shEn && shZh, "tech sheet holds exam.hall.exp in TH / EN / ZH");
  for (const tok of ["0%", "n = 195", "63%", "24–48 px", "0.40"]) {
    for (const t of [banner, en["exam.hall.exp"], zh["exam.hall.exp"]]) assert.ok(!t.includes(tok), `hall banner no longer shows "${tok}": ${t.slice(0, 40)}`);
    for (const t of [shTh, shEn, shZh]) assert.ok(t.includes(tok), `tech sheet exam.hall.exp holds "${tok}": ${t.slice(0, 40)}`);
  }
  assert.doesNotMatch(banner, /ชุดข้อมูลสาธารณะ/); assert.doesNotMatch(en["exam.hall.exp"], /public dataset/); assert.doesNotMatch(zh["exam.hall.exp"], /公开数据集/);
  assert.match(shTh, /ชุดข้อมูลสาธารณะ/); assert.match(shEn, /public dataset/); assert.match(shZh, /公开数据集/);
  assert.equal(en["exam.hall.expB"], undefined, "en exam.hall.expB removed"); assert.equal(zh["exam.hall.expB"], undefined, "zh exam.hall.expB removed");
  for (const t of [en["exam.hall.exp"], zh["exam.hall.exp"]]) assert.doesNotMatch(t, /trial version|experimental|试用版|实验性|not on sale|尚未开售/i);
  // Exam landing page: the button, the mode card and the price card
  const landing = read("exam.html");
  // decision 226: the button, the mode card and the price card carry no status label (they are hidden with data-lq-off,
  // checked above); the price card keeps its "not on sale until fixed" sentence, the mode card its plain limit
  assert.match(landing, /data-i18n="exam\.l\.ctaHall">เครื่องกล้องในห้องสอบ</);
  assert.match(landing, /id="hallExp"><span data-i18n="exam\.l\.mAx">ใบหน้าที่อยู่ไกลกล้องยังหาไม่เจอ/);
  assert.doesNotMatch(landing, /exam\.l\.mAxB/);
  assert.match(landing, /data-i18n="exam\.l\.p3x">ยังไม่เปิดขายจนกว่าจะแก้ปัญหาใบหน้าเล็ก/);
  assert.doesNotMatch(landing, /data-i18n="exam\.l\.(ctaHall|p3x)">[^<]*รุ่นทดลอง/);
  for (const k of ["exam.l.ctaHall", "exam.l.p3x"]) {
    assert.doesNotMatch(en[k], EN, "en " + k); assert.doesNotMatch(zh[k], ZH, "zh " + k);
    assert.doesNotMatch(en[k], OLD_EN, "en " + k); assert.doesNotMatch(zh[k], OLD_ZH, "zh " + k);
  }
  assert.equal(en["exam.l.mAxB"], undefined, "en exam.l.mAxB removed"); assert.equal(zh["exam.l.mAxB"], undefined, "zh exam.l.mAxB removed");
  assert.match(en["exam.l.p3x"], /^Not on sale until the small-face issue is fixed; this price applies once it is on sale$/); assert.match(zh["exam.l.p3x"], /^在小脸问题解决前不销售/);
  // navigation, solutions catalogue
  assert.doesNotMatch(read("nav.js"), /href: "exam-hall\.html"[^}]*ทดลอง/);
  assert.doesNotMatch(enC["nav.exam-hall.desc"], EN); assert.doesNotMatch(zhC["nav.exam-hall.desc"], ZH);
  assert.doesNotMatch(enC["nav.exam-hall.desc"], OLD_EN); assert.doesNotMatch(zhC["nav.exam-hall.desc"], OLD_ZH);
  // decision 226: the switched-off hall is not mentioned in the catalogue card any more, and the card carries no label
  const edu1 = /data-i18n="sl\.c\.edu1\.p">([^<]*)</.exec(read("solutions.html"))[1].replace(/\s+/g, " ");
  assert.equal(edu1, "บอกกรรมการว่าควรไปดูที่นั่งไหน (ไม่มีใบหน้า มากกว่าหนึ่งคน โทรศัพท์ ออกจากหน้าจอ) ในห้องสอบคอมพิวเตอร์ ไม่ตัดสินว่าทุจริต กรรมการเป็นผู้ตรวจและบันทึกผล");
  assert.doesNotMatch(read("solutions.html"), /ห้องสอบที่มีกล้องรอบห้อง \(รุ่นทดลอง|\(รุ่นทดลอง ยังไม่เปิดขาย\)/);
  assert.doesNotMatch(enS["sl.c.edu1.p"], /cameras around the room|trial version/); assert.doesNotMatch(zhS["sl.c.edu1.p"], /试用版|尚未开售/);
  assert.match(enS["sl.c.edu1.p"], /in computer labs\. It never decides misconduct; invigilators check and record the outcome\.$/);
  assert.doesNotMatch(enS["sl.c.edu1.p"], OLD_EN); assert.doesNotMatch(zhS["sl.c.edu1.p"], OLD_ZH);
  // category page: generated from tools/cat-data.cjs; the internal status table (PAGES / REASONS) is unchanged; decision 226:
  // no card shows a badge, the switched-off hall has no card, its label (badgeOf: hall) is held by the back office
  const D = require("../../tools/cat-data.cjs");
  assert.equal(D.PAGES["exam-hall"].st, "experimental");
  for (const p of ["exam", "exam-lab", "exam-dashboard"]) assert.equal(D.PAGES[p].st, "pilot-ready", p + " unchanged");
  assert.equal(D.badgeOf("exam-hall"), "hall"); assert.equal(D.badgeOf("exam-lab"), "trial");
  const catEdu = read("cat-education.html");
  assert.doesNotMatch(catEdu, /data-page="exam-hall"|href="exam-hall\.html"|cat\.b\.hall|รุ่นทดลอง/);
  assert.match(catEdu, /<article class="pd-card cat-tool" data-page="exam-lab">/);
  assert.doesNotMatch(catEdu, /data-status=|class="cat-st\b/);
  assert.equal(enCat["cat.b.hall"], undefined); assert.equal(zhCat["cat.b.hall"], undefined);
  assert.match(read("admin-measurements.js"), /"exam-hall", "รุ่นทดลอง ยังไม่เปิดขาย", "Trial version, not on sale yet", "试用版，尚未开售", "off",/);
  assert.match(read("admin-measurements.js"), /"exam-lab", "รุ่นทดลอง", "Trial version", "试用版", "on",/);
  assert.match(D.REASONS.examHall.th, TH); assert.match(D.REASONS.examHall.en, OLD_EN); assert.match(D.REASONS.examHall.zh, OLD_ZH);
  assert.equal(enCat["cat.r.examHall"], undefined, "reason no longer on the customer card"); assert.equal(zhCat["cat.r.examHall"], undefined);
  const [rEn, rZh] = sheet(sheetEN, "cat.r.examHall");
  assert.match(rEn, /not for sale yet/); assert.match(rZh, /暂不销售/); assert.match(sheet(sheetTH, "cat.r.examHall")[0], /ยังไม่เปิดขาย/);
  assert.match(read("docs/PAGE-STATUS.md"), /\| `exam-hall\.html` \| 2 Education & Exams \| \*\*experimental\*\* \|/);
  // sales documents
  const one = read("docs/ONE-PAGER-EXAM.md");
  // decision 226: the one-pager carries no status label; the hall is stated plainly as a service that is not open yet
  assert.equal((one.match(/รุ่นทดลอง/g) || []).length, 0, "one-pager: no Thai status label");
  assert.equal((one.match(/trial version|experimental/gi) || []).length, 0, "one-pager: no English status label");
  assert.match(one, /^\*\*ห้องสอบที่มีกล้อง:\*\* ระบบนี้ยังไม่เปิดให้บริการ ราคาในแถวนั้นใช้เมื่อเปิดให้บริการแล้วเท่านั้น/m);
  assert.match(one, /^\*\*Camera hall:\*\* this service is not available yet; its row applies only once the service opens\./m);
  assert.match(read("docs/SALES-PACKAGES.md"), /camera-hall mode \(`exam-hall\.html`, \*\*experimental, not sold until the small-face issue is fixed\*\*/);
  // ONE-PAGER-TH / -ZH: the accuracy table (which carried the hall label) is gone; the rows are held verbatim by the tech-sheet
  // README (back office, keeps its labels); decision 226: any remaining mention of the hall device carries no label
  const techReadme = read("docs/tech-sheets/README.md");
  assert.match(techReadme, /考场摄像头[^|\n]*实验性/); assert.match(techReadme, /เครื่องกล้องในห้องสอบ[^|\n]*รุ่นทดลอง/);
  for (const line of read("docs/ONE-PAGER-ZH.md").split("\n")) if (/考场摄像头设备/.test(line)) assert.doesNotMatch(line, /试用版|实验性/, "ONE-PAGER-ZH: " + line.slice(0, 60));
  for (const line of read("docs/ONE-PAGER-TH.md").split("\n")) if (/เครื่องกล้องในห้องสอบ/.test(line)) assert.doesNotMatch(line, /รุ่นทดลอง/, "ONE-PAGER-TH: " + line.slice(0, 60));
  assert.doesNotMatch(read("docs/ONE-PAGER-ZH.md"), /实验性，暂不销售/);
  // lab mode keeps its wording: no "experimental" and no "not on sale" on the lab button or nav entry
  for (const d of [en, zh]) assert.doesNotMatch(d["exam.l.ctaLab"], /experimental|实验性|not on sale|尚未开售|不销售/);
  assert.doesNotMatch(landing, /data-i18n="exam\.l\.ctaLab">[^<]*ยังไม่เปิดขาย/);
  assert.doesNotMatch(enC["nav.exam-lab.desc"], OLD_EN); assert.doesNotMatch(enC["nav.exam-lab.desc"], /not on sale/);
  // no Thai in the en / zh strings; exam.l.cl4 / cl5 (figures) left the page and the dictionaries and are in the tech sheet
  for (const d of [en, zh]) for (const k of ["exam.hall.exp", "exam.hall.faceOn", "exam.hall.faceErr", "exam.hall.kvFaces", "exam.hall.kvFaceOff"]) {
    assert.ok(d[k] && !THAI_RE.test(d[k]), k);
  }
  for (const k of ["exam.l.cl4", "exam.l.cl5"]) {
    assert.equal(en[k], undefined, "en " + k + " removed"); assert.equal(zh[k], undefined, "zh " + k + " removed");
    assert.doesNotMatch(landing, new RegExp('data-i18n="' + k.replace(/\./g, "\\.") + '"'), k + " not on exam.html");
    const [e, z] = sheet(sheetEN, k);
    assert.ok(e && z && !THAI_RE.test(e) && !THAI_RE.test(z) && sheet(sheetTH, k)[0], k + " in the tech sheet TH / EN / ZH");
  }
});

test("owner decisions 2026-11-10 (follow-up): no rate in the candidate notice, >= 90 % is the bar for the second-person claim, hall cameras depend on room size", () => {
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  const RATE = /\d\s*[%％]|15 \/ 52|n = 52/;
  // 2. candidate-facing: the lab page and every exam.lab.* string carry no percentage; the notice still says what is checked
  const lab = read("exam-lab.html");
  const labText = lab.replace(/<head>[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(labText, RATE, "exam-lab.html (candidate page): no percentage");
  assert.doesNotMatch(lab, /nMulti/);
  for (const d of [en, zh]) {
    assert.equal(d["exam.lab.nMulti"], undefined);
    for (const k of Object.keys(d).filter(k => k.startsWith("exam.lab."))) assert.doesNotMatch(d[k], RATE, k + ": no rate on the candidate page");
  }
  const n1 = /data-i18n="exam\.lab\.n1">([^<]*)</.exec(lab)[1].replace(/\s+/g, " ");
  assert.match(n1, /สิ่งที่สังเกต: ไม่เห็นใบหน้า หลายใบหน้าหรือมีคนอื่นในภาพ/);
  assert.match(en["exam.lab.n1"], /several faces or another person in view/); assert.match(zh["exam.lab.n1"], /多张脸或画面中有其他人/);
  // the printable notice template (handed to candidates) has no rate either
  const tpl = /<div class="notice-print">([\s\S]*?)<\/div>/.exec(read("exam.html"))[1];
  assert.doesNotMatch(tpl.replace(/90 วัน/g, ""), RATE);
  for (const d of [en, zh]) for (const k of ["exam.l.n1", "exam.l.n3", "exam.l.n4"]) assert.doesNotMatch(d[k], RATE, k);
  // invigilator-facing: decision 223 (approved 223-1) moved the rate off every customer page; the dashboard note keeps the
  // approved plain sentence (the signal is only an aid, often misses a second person, keep walking the room) and the
  // technical sheet holds the rate, its n and its source verbatim (exam.db.nMulti and exam.l.cl5)
  const dash = read("exam-dashboard.html");
  assert.match(dash.replace(/\s+/g, " "),
    /class="note" id="nMulti" data-i18n="exam\.db\.nMulti">สัญญาณ “มากกว่าหนึ่งคน” เป็นตัวช่วยเท่านั้น มักไม่แจ้งเมื่อมีคนที่สองในภาพ ผู้คุมสอบต้องเดินตรวจตามปกติ</);
  assert.equal(en["exam.db.nMulti"], "The “more than one person” signal is only an aid and often does not fire when a second person is in view. Invigilators must still walk the room.");
  assert.equal(zh["exam.db.nMulti"], "“多于一人”信号只是辅助，画面中出现第二个人时常常不会提示。监考员仍须照常巡视。");
  for (const t of [/id="nMulti"[^>]*>([^<]*)</.exec(dash)[1], en["exam.db.nMulti"], zh["exam.db.nMulti"]]) assert.doesNotMatch(t, RATE, "no rate in the dashboard note");
  assert.doesNotMatch(read("exam.html"), /data-i18n="exam\.l\.cl5"|28\.8%/, "exam.html: the claim list is gone");
  const shTH = read("docs/tech-sheets/exam-TH.md"), shEN = read("docs/tech-sheets/exam-EN.md");
  assert.match(shTH, /^\[exam\.db\.nMulti\] [^\n]*28\.8% \(15 \/ 52\) · n = 52 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ/m);
  assert.match(shEN, /^\[exam\.db\.nMulti\] [^\n]*28\.8% \(15 \/ 52\) · n = 52 frames · source: public dataset/m);
  assert.match(shEN, /^\[exam\.db\.nMulti\] [^\n]*28\.8%（15 \/ 52）· n = 52 帧 · 来源：公开数据集/m);
  assert.match(shTH, /^\[exam\.l\.cl5\] [^\n]*28\.8% \(15 \/ 52\)/m); assert.match(shEN, /^\[exam\.l\.cl5\] [^\n]*28\.8% \(15 \/ 52\)/m);
  // 1. the >= 90 % target stays, as the bar for the claim; the pilot reports the measured rate; "aid" until met
  const kit = read("docs/pilot/PILOT-EXAM.md");
  assert.match(kit, /ใบหน้าที่สอง: รายงานค่าที่วัดได้ \(เกณฑ์ ≥ 90% ก่อนอ้างว่า “ตรวจจับคนที่สอง”/);
  assert.match(kit, /second face: report the measured rate \(≥ 90% is the bar for the claim "detects a second person"/);
  assert.match(kit, /เป้า “ใบหน้าที่สอง ≥ 90%” ยังคงอยู่/); assert.match(kit, /เกณฑ์ที่ต้องผ่านก่อนจะอ้างได้ว่า “ตรวจจับคนที่สอง”\s+เป็นความสามารถของระบบ/);
  assert.match(kit, /the "second face ≥ 90%" target stays/); assert.match(kit, /the bar for ever claiming "detects a\s+second person" as a feature/);
  assert.match(kit, /การนำร่องรายงานอัตราที่วัดได้จริง/); assert.match(kit, /The pilot reports the measured rate/);
  assert.doesNotMatch(kit, /รอเจ้าของตัดสินใจ\): เป้า “ใบหน้าที่สอง/); assert.doesNotMatch(kit, /or to change\s+it to "report"/);
  const claims = read("docs/ACCURACY-CLAIMS.md");
  assert.match(claims, /≥ 90% is the bar for ever claiming "detects a second person" as a feature\*\*; the pilot reports the measured rate/);
  assert.match(claims, /the pilot reports the measured rate, and until the bar is met the signal is described as an aid/);
  assert.match(claims, /`exam-dashboard\.html` \(`exam\.db\.nMulti`\)/); assert.doesNotMatch(claims, /exam\.lab\.nMulti/);
  // 3. hall mode: no "1-3 devices per room" left; "depends on room size (see guide)" in TH / EN / ZH; hall rows stay experimental
  const land = read("exam.html");
  const OLD = /1 ?[–-] ?3 (เครื่อง|laptops|devices|台)|\(3 เครื่องกล้อง\)|\(3 camera devices\)|3 台摄像头|≤ 3 เครื่องต่อห้อง|up to 3 (hall )?camera|camera devices per room|2–3 (เครื่อง|devices)/;
  const HALL_DOCS = ["docs/ONE-PAGER-EXAM.md", "docs/ONE-PAGER-TH.md", "docs/ONE-PAGER-ZH.md", "docs/SALES-PACKAGES.md", "docs/PRICING-RESEARCH.md",
    "docs/BILLING-PLAN.md", "docs/pilot/PILOT-EXAM.md"];
  for (const f of ["exam.html", "exam-hall.html"].concat(HALL_DOCS)) {
    for (const line of read(f).split("\n")) if (/exam|hall|ห้องสอบ|考场|โหมด A|Mode A/i.test(line)) assert.doesNotMatch(line, OLD, f + ": " + line.slice(0, 80));
  }
  for (const d of [en, zh]) for (const k of Object.keys(d).filter(k => k.startsWith("exam."))) assert.doesNotMatch(d[k], OLD, k);
  for (const k of ["exam.l.mAp", "exam.l.p3n"]) {
    assert.match(new RegExp('data-i18n="' + k.replace(/\./g, "\\.") + '">([^<]*)<').exec(land)[1], /จำนวนกล้องขึ้นกับขนาดห้อง \(?ขอคู่มือวางกล้องได้จากเรา\)/, k);
    assert.match(en[k], /number of cameras depends on room size[, (]+ask us for the camera placement guide\)/i, k); assert.match(zh[k], /摄像头数量取决于考场大小[，（]请向我们索取摄像头摆放指南）/, k);
    // the guide is not a public page: no text sends the reader to "see" a guide that has no link
    assert.doesNotMatch(new RegExp('data-i18n="' + k.replace(/\./g, "\\.") + '">([^<]*)<').exec(land)[1], /ดูคู่มือวางกล้อง/, k);
    assert.doesNotMatch(en[k], /see the camera placement guide/i, k); assert.doesNotMatch(zh[k], /[，（]见摄像头摆放指南/, k);
    assert.ok(!THAI_RE.test(en[k].replace(/฿/g, "")) && !THAI_RE.test(zh[k].replace(/฿/g, "")), k + ": no Thai in en / zh");
  }
  // prices unchanged; hall still "not on sale" (sentence), decision 226: without the status label
  assert.match(land, /data-i18n="exam\.l\.p3b">฿290 ต่อห้องต่อวันสอบ/);
  assert.match(land, /data-i18n="exam\.l\.p3n">หรือ ฿990 ต่อเดือนต่อห้อง/);
  assert.match(land, /data-i18n="exam\.l\.p3x">ยังไม่เปิดขายจนกว่าจะแก้ปัญหาใบหน้าเล็ก ราคานี้ใช้เมื่อเปิดขายแล้ว</);
  assert.doesNotMatch(land, /data-i18n="exam\.l\.p3x">รุ่นทดลอง/);
  assert.match(en["exam.l.p3n"], /^or ฿990 per month per room /); assert.match(zh["exam.l.p3n"], /^或每考场每月 ฿990/);
  const one = read("docs/ONE-PAGER-EXAM.md");
  // decision 226: the price rows lose the status label (price unchanged)
  assert.match(one, /ห้องสอบที่มีกล้อง \(ต่อห้อง จำนวนกล้องขึ้นกับขนาดห้อง ดูคู่มือวางกล้อง\) \| 290 บาท ต่อห้องต่อวันสอบ/);
  assert.doesNotMatch(one, /— รุ่นทดลอง ยังไม่เปิดขาย/);
  assert.match(one, /Camera hall \(per room; number of cameras depends on room size, see the guide\) \| 290 THB per room per exam day/);
  assert.doesNotMatch(one, /\*\*trial version, not on sale yet\*\*/);
  const GUIDE = '`docs\\/EXAM\\.md` "Hall camera placement guide"\\)';
  assert.match(read("docs/BILLING-PLAN.md"), new RegExp("`exam_hall` \\|[^\\n]*\\*\\*Experimental, not on sale\\*\\*[^\\n]*the number of cameras depends on room size " +
    "\\(see the guide: " + GUIDE + " \\| 290 THB per room per exam day, or 990 THB \\/ month per room \\|"));
  assert.match(read("docs/PRICING-RESEARCH.md"), new RegExp("the number of cameras depends on room size, see the guide: " + GUIDE +
    "\\. \\*\\*Experimental, not on sale\\*\\*[^\\n]*\\*\\*290 THB per room per exam day excl\\. 7% VAT\\*\\*"));
  assert.match(read("docs/SALES-PACKAGES.md"), /exam halls \(the number\s+of cameras depends on room size, see the guide/);
  assert.match(kit, /จำนวนกล้องขึ้นกับขนาดห้อง \(ดูคู่มือวางกล้อง: `docs\/EXAM\.md`/); assert.match(kit, /the number of cameras depends on room size \(see the\s+guide: `docs\/EXAM\.md`/);
  assert.match(read("docs/EXAM.md"), /### Hall camera placement guide/);
});

test("owner decisions 2026-11-10: lab-led pilot with the accepted limit, the 28.8 % rate stated as an aid (TH / EN / ZH), the count-faces label, the placement guide is a calculation", () => {
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  // "more than one person": decision 223 (approved 223-1) took the rate, its n and its source off the customer pages. The
  // dashboard note keeps the approved plain sentence ("only an aid", often misses a second person); exam.html's claim list
  // (exam.l.cl5) is gone; the technical sheet holds both original texts verbatim (rate, n, source, "an aid, not complete
  // detection", held-out, not exam-room footage, real exam rooms not measured) in TH / EN / ZH.
  const thOf = (file, key) => new RegExp('data-i18n="' + key.replace(/\./g, "\\.") + '">([^<]*)<').exec(read(file))[1].replace(/\s+/g, " ");
  const shTH = read("docs/tech-sheets/exam-TH.md"), shEN = read("docs/tech-sheets/exam-EN.md");
  const sheet = (src, key) => src.split("\n").filter(l => l.startsWith("[" + key + "] ")).map(l => l.slice(key.length + 3));
  const dashTh = thOf("exam-dashboard.html", "exam.db.nMulti");
  assert.match(dashTh, /มากกว่าหนึ่งคน/); assert.match(dashTh, /เป็นตัวช่วยเท่านั้น/); assert.match(dashTh, /มักไม่แจ้งเมื่อมีคนที่สองในภาพ/); assert.match(dashTh, /ผู้คุมสอบต้องเดินตรวจตามปกติ/);
  assert.match(en["exam.db.nMulti"], /more than one person/); assert.match(en["exam.db.nMulti"], /only an aid/); assert.match(en["exam.db.nMulti"], /must still walk the room/);
  assert.match(zh["exam.db.nMulti"], /多于一人/); assert.match(zh["exam.db.nMulti"], /只是辅助/); assert.match(zh["exam.db.nMulti"], /照常巡视/);
  for (const t of [dashTh, en["exam.db.nMulti"], zh["exam.db.nMulti"]]) {
    for (const tok of ["28.8%", "n = 52", "15 / 52", "ชุดข้อมูลสาธารณะ", "public dataset", "公开数据集", "ยังไม่ได้วัด", "not measured", "尚未测量"])
       assert.ok(!t.includes(tok), "dashboard note no longer shows " + tok);
  }
  assert.ok(!THAI_RE.test(en["exam.db.nMulti"]) && !THAI_RE.test(zh["exam.db.nMulti"]), "exam.db.nMulti: no Thai in en / zh");
  assert.equal(en["exam.l.cl5"], undefined); assert.equal(zh["exam.l.cl5"], undefined); assert.doesNotMatch(read("exam.html"), /exam\.l\.cl5/);
  for (const key of ["exam.l.cl5", "exam.db.nMulti"]) {
    const [th] = sheet(shTH, key), [e, z] = sheet(shEN, key);
    assert.ok(th && e && z, key + ": tech sheet TH / EN / ZH");
    for (const t of [th, e, z]) {
      assert.ok(t.includes("28.8%") && t.includes("n = 52"), key + ": 28.8% and n = 52 in " + t.slice(0, 50)); assert.match(t, /15 \/ 52/, key);
    }
    assert.match(th, /มากกว่าหนึ่งคน/); assert.match(th, /เป็นตัวช่วยผู้คุมสอบ ไม่ใช่การตรวจจับที่ครบถ้วน/); assert.match(th, /ชุดข้อมูลสาธารณะ/); assert.match(th, /ไม่ใช่ภาพห้องสอบจริง/);
    assert.match(e, /more than one person/); assert.match(e, /an aid for the invigilator, not complete detection/);
    assert.match(e, /public dataset/); assert.match(e, /held-out/);
    assert.match(z, /不止一个人/); assert.match(z, /辅助，并非完整检测/); assert.match(z, /公开数据集/);
    assert.ok(!THAI_RE.test(e) && !THAI_RE.test(z), key + ": no Thai in en / zh");
  }
  for (const k of ["exam.db.nMulti"]) { assert.match(sheet(shTH, k)[0], /ในห้องสอบจริง: ยังไม่ได้วัด/);
  assert.match(sheet(shEN, k)[0], /real exam rooms: not measured/);
  assert.match(sheet(shEN, k)[1], /尚未测量/); }
  // solutions catalogue: the same wording as the product ("more than one person"), not "several faces"
  assert.match(read("solutions.html"), /data-i18n="sl\.c\.edu1\.p">[^<]*มากกว่าหนึ่งคน/); assert.doesNotMatch(read("solutions.html"), /sl\.c\.edu1\.p">[^<]*หลายใบหน้า/);
  assert.match(dictOf("i18n/en-solutions.js")["sl.c.edu1.p"], /more than one person/); assert.doesNotMatch(dictOf("i18n/en-solutions.js")["sl.c.edu1.p"], /several faces/);
  assert.match(dictOf("i18n/zh-solutions.js")["sl.c.edu1.p"], /不止一个人/);
  // one-pagers and the pilot kit
  // decision 223: the one-pagers' accuracy tables left the customer documents; the rows are held verbatim by the tech sheet
  // (ONE-PAGER-EXAM rows: docs/tech-sheets/exam-*.md; ONE-PAGER-TH / -ZH rows: docs/tech-sheets/README.md)
  const one = read("docs/ONE-PAGER-EXAM.md"), techReadme = read("docs/tech-sheets/README.md");
  for (const d of [one, read("docs/ONE-PAGER-TH.md"), read("docs/ONE-PAGER-ZH.md")]) assert.doesNotMatch(d, /28\.8\s?%|15 \/ 52/, "no rate in a one-pager");
  for (const sh of [shTH, shEN]) { assert.match(sh, /เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน\*\* \| 28\.8% \(15 \/ 52\)/);
     assert.match(sh, /An aid, not complete detection\*\* \| 28\.8% \(15 \/ 52\)/); }
  assert.match(techReadme, /มากกว่าหนึ่งคน[^|\n]*ไม่ใช่การตรวจจับที่ครบถ้วน\) \| 28\.8% \(15 \/ 52\)/);
  assert.match(techReadme, /不止一个人[^|\n]*并非完整检测） \| 28\.8%（15 \/ 52）/);
  const kit = read("docs/pilot/PILOT-EXAM.md");
  assert.match(kit, /นำด้วยโหมด B \(ห้องคอมพิวเตอร์\)/); assert.match(kit, /leads with Mode B \(computer room\)/);
  assert.match(kit, /ยังไม่มีการส่งสด \(ทั้งเหตุการณ์และภาพวิดีโอ\) ไปยังแดชบอร์ดบนเครื่องอื่น/); assert.match(kit, /เจ้าของยอมรับข้อนี้สำหรับการนำร่อง/);
  assert.match(kit, /no live feed \(events or video\) to a dashboard on another\s+> machine/); assert.match(kit, /The owner\s+> accepts this for the pilot/);
  assert.ok(kit.indexOf("- **โหมด B ห้องคอมพิวเตอร์") < kit.indexOf("- **โหมด A ห้องสอบที่มีกล้อง"), "Thai: lab mode listed first");
  assert.ok(kit.indexOf("- **Mode B, the lead mode**") < kit.indexOf("- **Mode A** (camera exam hall"), "English: lab mode listed first");
  assert.match(kit, /28\.8 % \(15 \/ 52 ภาพที่มีคนที่สอง\)/); assert.match(kit, /28\.8 % \(15 \/ 52 frames with a\s+second person\)/);
  assert.match(kit, /เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน/); assert.match(kit, /is an aid, not complete detection/);
  // hall "count faces": stays, off by default, and its label says small or distant faces are not found; decision 226: the
  // status word "(ทดลอง: / experimental: / 实验性：)" left the label
  const hall = read("exam-hall.html");
  assert.match(hall.replace(/\s+/g, " "), /id="faceOn"> <span data-i18n="exam\.hall\.faceOn">นับใบหน้าในภาพ \(ยังไม่พบใบหน้าเล็กหรือที่อยู่ไกล/);
  assert.match(en["exam.hall.faceOn"], /^Count faces in the view \(small or distant faces are not found yet/); assert.match(zh["exam.hall.faceOn"], /^统计画面中的人脸（目前找不到小脸或远处的脸/);
  assert.doesNotMatch(hall.replace(/\s+/g, " "), /data-i18n="exam\.hall\.faceOn">[^<]*ทดลอง/);
  assert.doesNotMatch(en["exam.hall.faceOn"], /experimental/i); assert.doesNotMatch(zh["exam.hall.faceOn"], /实验性/);
  // placement guide: document only, every number a calculation; the 48 px rule and its tables are there; no setup check built
  const guide = /### Hall camera placement guide[\s\S]*?(?=\nv2: pose landmarker)/.exec(read("docs/EXAM.md"))[0];
  assert.match(guide, /Every number in this section is a calculation, not a measurement/); assert.match(guide, /ทุกตัวเลขเป็นการคำนวณ ยังไม่ได้วัด/);
  assert.match(guide, /face width \(px\) ≈ w × R \/ \(2 × d × tan\(HFOV \/ 2\)\)/);
  // the table is the formula: d_max = 0.15 x R / (96 x tan(HFOV / 2))
  const dmax = (R, hfov) => (0.15 * R / (96 * Math.tan(hfov * Math.PI / 360))).toFixed(2) + " m";
  for (const [label, R] of [["1,280 × 720", 1280], ["1,920 × 1,080", 1920], ["3,840 × 2,160", 3840]]) {
    const row = guide.split("\n").find(l => l.startsWith("| " + label) && / m \|/.test(l));
    assert.ok(row, "distance row for " + label);
    assert.deepEqual(row.split("|").slice(2, 5).map(x => x.trim()), [dmax(R, 65), dmax(R, 78), dmax(R, 90)], label);
  }
  // the guide stays a document; the setup check it used to call "not built" now exists as its own section and points back to the guide
  assert.match(guide, /\*\*is built\*\* as a separate commit: see "Hall setup check" after this guide\. The guide\s+> itself stays a document/);
  assert.doesNotMatch(guide, /is \*\*not built\*\*/); assert.match(guide, /48 px is necessary, not\s+sufficient/);
  assert.match(guide, /### Hall setup check \(2026-11-10\)/); assert.match(guide, /\*\*48 px is a minimum, not a guarantee\*\* \(section 5 of the guide\)/);
  assert.ok(!fs.existsSync(path.join(ROOT, "exam-hall-setup.js")), "the hall setup check is a separate commit");
});

test("hall face pass = the pick of the fixed rule (Face Landmarker, numFaces 8, detection 0.5): boxes only, off by default, no page loads the full-range model", async () => {
  assert.deepEqual(F.HALL_FACE, { engine: "landmarker", numFaces: 8, conf: 0.5 });
  const got = [];
  const lms = Array.from({ length: 478 }, (_, i) => ({ x: 0.4 + (i % 10) * 0.01, y: 0.3 + (i % 7) * 0.01, z: 0 }));
  const vision = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceLandmarker: { createFromOptions: async (f, op) => { got.push(op); return { detect: () => ({ faceLandmarks: [lms, lms], facialTransformationMatrixes: [] }),
      setOptions: async () => {}, close() {} }; } }
  };
  const e = F.createHallFaces({ base: "http://127.0.0.1/", vision });
  const r = await e.detect({ width: 1280, height: 720 });
  assert.equal(got.length, 1);
  assert.equal(got[0].numFaces, 8); assert.equal(got[0].minFaceDetectionConfidence, 0.5);
  assert.ok(!("outputFaceBlendshapes" in got[0]) || got[0].outputFaceBlendshapes === false, "no facial-movement scores requested");
  assert.equal(r.length, 2);
  for (const d of r) assert.deepEqual(Object.keys(d), ["box"], "boxes only: no pose, no landmarks leave the engine");
  // the page: off by default, the picked engine, nothing about faces in a message; no page references the 1.2.2 copy
  const js = read("exam-hall.js"), html = read("exam-hall.html");
  assert.match(js, /faceEng = XF\.createHallFaces\(\)/); assert.doesNotMatch(js, /createFaceBoxes|FB_DEFAULT/);
  assert.match(js, /faceOn = !!\(saved && saved\.faceOn === true\)/, "on only when this device stored true");
  assert.match(html, /<input type="checkbox" id="faceOn">/, "not pre-checked");
  assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /send\([^)]*face/i);
  for (const f of fs.readdirSync(ROOT).filter(x => /\.(html|js)$/.test(x))) {
    assert.doesNotMatch(read(f), /mediapipe-1\.2\.2\/|face-detector-full\/|blaze_face_full_range/, f + " must not name the measurement-only files");
  }
});

test("lab second-person cue (N4@0.5): person boxes counted at >= 0.5, one per person; used only while a face is seen", () => {
  assert.deepEqual(F.LAB_PEOPLE, { minScore: 0.3, score: 0.5, iou: 0.5, max: 20 });
  const A = { x: 0.1, y: 0.1, w: 0.3, h: 0.8, score: 0.9 }, A2 = { x: 0.11, y: 0.1, w: 0.3, h: 0.8, score: 0.6 }, B = { x: 0.6, y: 0.2, w: 0.3, h: 0.7, score: 0.55 }, low = { x: 0.6, y: 0.2,
    w: 0.1, h: 0.2, score: 0.45 };
  assert.equal(F.peopleBoxes([A, A2, B, low]).length, 2, "same person merged, low score dropped");
  assert.equal(F.peopleBoxes([A, low]).length, 1);
  assert.equal(F.peopleBoxes([{ box: { x: 0, y: 0, w: 10, h: 10 }, score: 0.5 }]).length, 1, "{box} form, score 0.5 counts");
  assert.equal(F.peopleBoxes(null).length, 0);
  const one = [{ yaw: 0, pitchN: 0.45, mar: 0.05 }];
  const run = (faces, people, extra) => {
    const mon = E.createLabMonitor(); mon.setBaseline({ ok: true, yaw0: 0, pitchN0: 0.45 }); const ev = [];
    for (let t = 0; t <= 20000; t += 250) ev.push(...mon.frame(t, Object.assign({ faces, people, quality: { ok: true } }, extra || {})));
    return ev;
  };
  const hit = run(one, 2).filter(e => e.sig === "multiface");
  assert.ok(hit.length && hit[0].lvl === "check" && hit[0].n === 2, "one face + two people -> more than one person: " + JSON.stringify(hit[0]));
  assert.ok(!run(one, 1).some(e => e.sig === "multiface"), "one face, one person: nothing");
  assert.ok(!run(one, undefined).some(e => e.sig === "multiface"), "no person count: as before");
  const noFace = run([], 3);
  assert.ok(!noFace.some(e => e.sig === "multiface"), "no face seen: the person cue is not used");
  assert.ok(noFace.some(e => e.sig === "noface"), "and the no-face signal is unchanged");
  assert.ok(!run(one, 3, { faceOff: true }).some(e => e.sig === "multiface"), "face engine off: no multi-person signal");
  assert.ok(run([one[0], one[0]], 0).some(e => e.sig === "multiface" && e.n === 2), "two faces still fire on their own");
  // the page: one inference, two decodes; the count expires; the wording says "person" in three languages
  const lab = read("exam-lab.js");
  assert.match(lab, /detectCocoMulti\(coco, video, \[\{ classes: \[76, 83, 72, 71\], minScore: 0\.4, max: 10 \},\s*\{ classes: \[0\], minScore: F\.LAB_PEOPLE\.minScore/);
  assert.match(lab, /performance\.now\(\) - peopleAt <= 2000 \? peopleN : 0/);
  assert.equal(E.SIGNALS.multiface.th, "เห็นมากกว่าหนึ่งคน");
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  assert.equal(en["exam.sig.multiface"], "More than one person visible"); assert.equal(zh["exam.sig.multiface"], "看到不止一个人");
  assert.match(read("exam-lab.html"), /data-i18n="exam\.lab\.n1">[^<]*หลายใบหน้าหรือมีคนอื่นในภาพ/, "the candidate notice says so");
  assert.match(en["exam.lab.n1"], /several faces or another person in view/); assert.match(zh["exam.lab.n1"], /多张脸或画面中有其他人/);
});

test("LQDetect.detectCocoMulti: one inference, each option set decoded as detectCoco would decode it", async () => {
  const g = /** @type {any} */ (globalThis);
  const saved = { tf: g.tf, LQDetect: g.LQDetect };
  let runs = 0;
  // 3 anchors x 91 classes: anchor 0 = person 0.9, anchor 1 = phone (76) 0.8 with person 0.45, anchor 2 = person 0.35
  const C = 91, scores = new Float32Array(3 * C), boxes = new Float32Array([0.1, 0.1, 0.9, 0.4, 0.5, 0.5, 0.6, 0.6, 0.1, 0.6, 0.9, 0.9]);
  scores[0] = 0.9; scores[C + 76] = 0.8; scores[C] = 0.45; scores[2 * C] = 0.35;
  const tensor = (shape, data) => ({ shape, data: async () => data, dispose() {} });
  g.tf = { loadGraphModel() {}, tidy: f => f(), browser: { fromPixels: () => ({ expandDims: () => ({ dispose() {} }) }) } };
  const model = { executeAsync: async () => { runs++; return [tensor([1, 3, C], scores), tensor([1, 3, 1, 4], boxes)]; } };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
  try {
    delete require.cache[require.resolve("../../lensiq-detect.js")];
    const mod = require("../../lensiq-detect.js");
    const D = mod && mod.detectCocoMulti ? mod : g.LQDetect;
    const src = { width: 640, height: 480 };
    const [objs, pers] = await D.detectCocoMulti(model, src, [{ classes: [76, 83, 72, 71], minScore: 0.4, max: 10 }, { classes: [0], minScore: 0.3, max: 20 }], { canvas });
    assert.equal(runs, 1, "one inference");
    assert.deepEqual(objs.map(o => o.cls), [76], "phones / books exactly as before: the person class does not compete");
    assert.deepEqual(pers.map(o => [o.cls, Math.round(o.score * 100)]), [[0, 90], [0, 45], [0, 35]]);
    assert.equal(F.peopleBoxes(pers).length, 1, "one person at >= 0.5");
    const single = await D.detectCoco(model, src, { classes: [76, 83, 72, 71], minScore: 0.4, max: 10, canvas });
    assert.deepEqual(single, objs, "same list as detectCoco with the same options");
  } finally { g.tf = saved.tf; if (saved.LQDetect === undefined) delete g.LQDetect; else g.LQDetect = saved.LQDetect; delete require.cache[require.resolve("../../lensiq-detect.js")]; }
});

test("hall setup check: px = normalised box width x NATIVE frame width; 48 px threshold; smallest face; no face / more people than faces are never OK", () => {
  const S = F.HALL_SETUP;
  assert.equal(S.minFacePx, 48); assert.ok(S.everyMs >= 500 && S.everyMs <= 1000, "1 - 2 measurements per second");
  assert.deepEqual(S.ladder.map(r => r.width + "x" + r.height), ["3840x2160", "1920x1080", "1280x720"]);
  assert.ok(Object.isFrozen(S) && Object.isFrozen(S.ladder));
  const box = (w, i = 0) => ({ x: 0.1 + 0.2 * i, y: 0.2, w, h: w * 1.3 });
  // the same normalised face is 96 px on a 4K frame, 48 px on 1080p and 32 px on 1,280 px
  for (const [W, H, px, state] of [[3840, 2160, 96, "ok"], [1920, 1080, 48, "ok"], [1280, 720, 32, "small"]]) {
    const r = F.hallSetupCheck({ faces: [box(0.025)], people: 1, frameW: W, frameH: H });
    assert.equal(r.faces[0].px, px, W + ""); assert.equal(r.minFacePx, px); assert.equal(r.state, state); assert.equal(r.ok, state === "ok");
    assert.equal(r.frameW, W); assert.equal(r.frameH, H); assert.equal(r.minPx, 48);
  }
  // threshold: 47 px warns, 48 px does not; the smallest face and the count under the threshold
  let r = F.hallSetupCheck({ faces: [box(47 / 1920), box(48 / 1920, 1), box(120 / 1920, 2)], people: 3, frameW: 1920, frameH: 1080 });
  assert.deepEqual(r.faces.map(f => f.px), [47, 48, 120]); assert.deepEqual(r.faces.map(f => f.small), [true, false, false]);
  assert.equal(r.state, "small"); assert.equal(r.ok, false); assert.equal(r.small, 1); assert.equal(r.minFacePx, 47); assert.equal(r.n, 3); assert.equal(r.unmeasured, 0);
  r = F.hallSetupCheck({ faces: [box(48 / 1920), box(120 / 1920, 1)], people: 2, frameW: 1920, frameH: 1080 });
  assert.equal(r.state, "ok"); assert.equal(r.ok, true); assert.equal(r.small, 0); assert.equal(r.minFacePx, 48);
  // more people than faces: every measured face is fine, still not OK; fewer people than faces is fine
  r = F.hallSetupCheck({ faces: [box(0.05), box(0.05, 1)], people: 5, frameW: 1920, frameH: 1080 });
  assert.equal(r.state, "people"); assert.equal(r.ok, false); assert.equal(r.unmeasured, 3); assert.equal(r.people, 5); assert.equal(r.n, 2);
  assert.equal(F.hallSetupCheck({ faces: [box(0.05), box(0.05, 1)], people: 1, frameW: 1920, frameH: 1080 }).state, "ok");
  // a small face AND more people than faces: "small" wins, and the people gap is still reported
  r = F.hallSetupCheck({ faces: [box(0.01)], people: 4, frameW: 1920, frameH: 1080 });
  assert.equal(r.state, "small"); assert.equal(r.unmeasured, 3); assert.equal(r.ok, false);
  // no face: never OK, with or without people; no smallest width
  for (const people of [0, 6]) {
    r = F.hallSetupCheck({ faces: [], people, frameW: 3840, frameH: 2160 });
    assert.equal(r.state, "noface"); assert.equal(r.ok, false); assert.equal(r.minFacePx, null); assert.equal(r.n, 0); assert.equal(r.unmeasured, people);
  }
  // no frame size -> "nocam"; bad boxes and bad counts are dropped, never counted as a face
  for (const bad of [undefined, {}, { faces: [box(0.05)], people: 1 }, { faces: [box(0.05)], frameW: 0 }, { faces: [box(0.05)], frameW: NaN }]) {
    r = F.hallSetupCheck(bad); assert.equal(r.state, "nocam"); assert.equal(r.ok, false); assert.equal(r.n, 0);
  }
  r = F.hallSetupCheck({ faces: [null, { x: 0, y: 0, w: 0, h: 0.1 }, { x: 0, y: 0, w: NaN, h: 0.1 }, { x: 0, y: 0, w: -0.1, h: 0.1 }, box(0.05)], people: 0, frameW: 1920, frameH: 1080 });
  assert.equal(r.n, 1); assert.equal(r.people, 0); assert.equal(r.state, "ok");
  // a count that is not a count (negative) is "not measured", never 0 people and never OK
  r = F.hallSetupCheck({ faces: [box(0.05)], people: -3, frameW: 1920, frameH: 1080 });
  assert.equal(r.people, null); assert.equal(r.state, "nopeople"); assert.equal(r.ok, false);
  // a custom minimum is honoured; the result carries numbers only
  assert.equal(F.hallSetupCheck({ faces: [box(0.03)], people: 1, frameW: 1920, minPx: 64 }).state, "small");
  r = F.hallSetupCheck({ faces: [Object.assign(box(0.05), { name: "x", yaw: 3, score: 0.9 })], people: 1, frameW: 1920, frameH: 1080 });
  assert.deepEqual(Object.keys(r.faces[0]).sort(), ["h", "px", "small", "w", "x", "y"]);
  assert.deepEqual(Object.keys(r).sort(), ["atCap", "cap", "faces", "frameH", "frameW", "minFacePx", "minPx", "n", "ok", "people", "small", "state", "unmeasured"]);
});

test("hall setup check (review S1): the RAW width is compared with 48 px and the px shown is rounded down: 47.4 / 47.5 / 47.9 are small and read 47, 48.0 / 48.1 are fine and read 48", () => {
  const one = (px, W = 1920) => F.hallSetupCheck({ faces: [{ x: 0.1, y: 0.2, w: px / W, h: 0.05 }], people: 1, frameW: W, frameH: W * 9 / 16 });
  for (const W of [1280, 1920, 3840]) {
    for (const [px, shown, small] of [[47.4, 47, true], [47.5, 47, true], [47.9, 47, true], [48.0, 48, false], [48.1, 48, false]]) {
      const r = one(px, W), label = px + " px on " + W;
      assert.equal(r.faces[0].px, shown, label + ": px shown"); assert.equal(r.minFacePx, shown, label + ": smallest");
      assert.equal(r.faces[0].small, small, label + ": small"); assert.equal(r.small, small ? 1 : 0, label);
      assert.equal(r.state, small ? "small" : "ok", label + ": state"); assert.equal(r.ok, !small, label + ": ok");
      assert.ok(!(r.faces[0].px >= 48 && r.faces[0].small), label + ": never 48 px shown for a face under 48 px");
    }
  }
  // just under and just over, far from a rounding step; whole px widths survive the normalise / multiply round trip
  assert.equal(one(47.999).state, "small"); assert.equal(one(47.999).faces[0].px, 47); assert.equal(one(48.999).faces[0].px, 48); assert.equal(one(48.999).state, "ok");
  for (let px = 40; px <= 60; px++) for (const W of [640, 1280, 1920, 2560, 3840]) {
    const r = one(px, W); assert.equal(r.faces[0].px, px, px + " on " + W); assert.equal(r.faces[0].small, px < 48, px + " on " + W);
  }
  // the smallest width with several faces is the floor of the smallest raw width; a custom minimum uses the raw width too
  const r = F.hallSetupCheck({ faces: [{ x: 0, y: 0, w: 63.9 / 1920, h: 0.1 }, { x: 0.5, y: 0, w: 100.7 / 1920, h: 0.1 }], people: 2, frameW: 1920, frameH: 1080, minPx: 64 });
  assert.deepEqual(r.faces.map(f => f.px), [63, 100]); assert.equal(r.minFacePx, 63); assert.equal(r.state, "small");
  assert.match(read("lensiq-exam-face.js"), /px: Math\.floor\(raw\), small: raw < minPx/);
});

test("hall setup check (review S4): no people count yet (null / undefined / NaN / negative) is 'not measured', never 0 people and never OK", () => {
  const box = (w, i = 0) => ({ x: 0.1 + 0.2 * i, y: 0.2, w, h: w * 1.3 });
  for (const people of [undefined, null, NaN, -1, "3", Infinity]) {
    const r = F.hallSetupCheck({ faces: [box(0.05), box(0.05, 1)], people: /** @type {any} */ (people), frameW: 1920, frameH: 1080 });
    assert.equal(r.people, null, String(people)); assert.equal(r.state, "nopeople", String(people)); assert.equal(r.ok, false, String(people)); assert.equal(r.unmeasured, 0);
    // a small face still warns, no face is still "noface": the missing count never hides them and never turns them into OK
    assert.equal(F.hallSetupCheck({ faces: [box(0.01)], people: /** @type {any} */ (people), frameW: 1920, frameH: 1080 }).state, "small");
    const none = F.hallSetupCheck({ faces: [], people: /** @type {any} */ (people), frameW: 1920, frameH: 1080 });
    assert.equal(none.state, "noface"); assert.equal(none.ok, false); assert.equal(none.people, null);
  }
  // a real count of 0 is a count: one face, nobody seen by the object detector -> people (0) <= faces (1)
  const zero = F.hallSetupCheck({ faces: [box(0.05)], people: 0, frameW: 1920, frameH: 1080 });
  assert.equal(zero.people, 0); assert.equal(zero.state, "ok");
  assert.equal(F.HALL_SETUP.peopleMaxAgeMs, 5000);
  // the page: the count is known only after a finished detection turn on this camera, not older than peopleMaxAgeMs; a failing turn clears it
  const js = read("exam-hall.js");
  assert.match(js, /const peopleNow = \(\) => \(peopleAt && performance\.now\(\) - peopleAt <= SC\.peopleMaxAgeMs \? lastDets\.persons\.length : null\);/);
  assert.match(js, /lastDets = d; peopleAt = performance\.now\(\);/); assert.match(js, /catch \(e\) \{ console\.warn\(e\); peopleAt = 0; \}/);
  assert.match(js, /if \(ev\.type === "started"\) \{ peopleAt = 0;/);
  assert.match(js, /let peopleAt = 0;/); assert.doesNotMatch(js, /people: lastDets\.persons\.length/);
});

test("hall setup check (review S2): its own engine with a higher face limit; at the limit with more people seen the state is 'cap', not 'too small or too far'", async () => {
  const S = F.HALL_SETUP, cap = S.numFaces;
  assert.equal(cap, 16); assert.equal(F.HALL_FACE.numFaces, 8, "the exam loop's face pass keeps its limit");
  const box = i => ({ x: (i % 8) / 8, y: Math.floor(i / 8) / 8, w: 0.05, h: 0.06 });
  const faces = n => Array.from({ length: n }, (_, i) => box(i));
  // at the limit and more people: "cap"; at the limit and no more people: OK; under the limit and more people: "people"
  let r = F.hallSetupCheck({ faces: faces(cap), people: cap + 9, frameW: 3840, frameH: 2160, cap });
  assert.equal(r.state, "cap"); assert.equal(r.ok, false); assert.equal(r.atCap, true); assert.equal(r.cap, cap); assert.equal(r.unmeasured, 9);
  r = F.hallSetupCheck({ faces: faces(cap), people: cap, frameW: 3840, frameH: 2160, cap });
  assert.equal(r.state, "ok"); assert.equal(r.atCap, false);
  r = F.hallSetupCheck({ faces: faces(cap - 1), people: cap + 9, frameW: 3840, frameH: 2160, cap });
  assert.equal(r.state, "people"); assert.equal(r.atCap, false); assert.equal(r.ok, false);
  // a small face still wins, and the limit is still reported; no limit given -> never "cap"; no people count -> not "cap"
  r = F.hallSetupCheck({ faces: faces(cap - 1).concat([{ x: 0.9, y: 0.9, w: 0.005, h: 0.01 }]), people: cap + 2, frameW: 3840, frameH: 2160, cap });
  assert.equal(r.state, "small"); assert.equal(r.atCap, true);
  r = F.hallSetupCheck({ faces: faces(cap), people: cap + 9, frameW: 3840, frameH: 2160 });
  assert.equal(r.state, "people"); assert.equal(r.cap, 0); assert.equal(r.atCap, false);
  assert.equal(F.hallSetupCheck({ faces: faces(cap), frameW: 3840, frameH: 2160, cap }).state, "nopeople");
  // engines: the setup engine asks for 16 faces; the exam loop's still asks for 8; nothing else may pass the old limit of 8
  const got = [];
  const vision = { FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceLandmarker: { createFromOptions: async (f, o) => { got.push(o); return { detect: () => ({ faceLandmarks: [] }), setOptions: async () => {}, close() {} }; } } };
  const setup = F.createHallFaces({ base: "http://x/", vision, setup: true }), loop = F.createHallFaces({ base: "http://x/", vision });
  await setup.init(); await loop.init();
  assert.equal(setup.numFaces, cap); assert.equal(got[0].numFaces, cap); assert.equal(got[0].outputFaceBlendshapes, undefined);
  assert.equal(loop.numFaces, 8); assert.equal(got[1].numFaces, 8);
  assert.deepEqual(F.cleanOptions({ numFaces: 16 }), {}, "the lab engine cannot be raised above 8");
  assert.deepEqual(F.cleanOptions({ numFaces: 16 }, 16), { numFaces: 16 }); assert.deepEqual(F.cleanOptions({ numFaces: 17 }, 16), {});
  assert.equal(F.createMediaPipe({ base: "http://x/", vision, options: { numFaces: 16 } }).options.numFaces, 4, "createMediaPipe without the setup limit drops 16");
  assert.equal(F.createMediaPipe({ base: "http://x/", vision, maxFaces: 32, options: { numFaces: 16 } }).options.numFaces, 4, "only HALL_SETUP.numFaces is accepted as a higher limit");
  // the page: the setup check has its own engine and passes the limit; the exam loop's pass is not touched
  const js = read("exam-hall.js"), html = read("exam-hall.html").replace(/\s+/g, " ");
  assert.match(js, /if \(!scEng\) scEng = XF\.createHallFaces\(\{ setup: true \}\);/); assert.match(js, /if \(!faceEng\) faceEng = XF\.createHallFaces\(\);/);
  assert.equal((js.match(/XF\.createHallFaces\(/g) || []).length, 2);
  assert.match(js, /minPx: SC\.minFacePx, cap: SC\.numFaces \}\)/);
  // the limit is in the panel lead text and in the cap message, in the three languages, with the number of HALL_SETUP
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  assert.match(html, new RegExp('data-i18n="exam\\.hall\\.scLead">[^<]*วัดได้สูงสุดครั้งละ ' + cap + ' ใบหน้า'));
  assert.match(en["exam.hall.scLead"], new RegExp("measures at most " + cap + " faces at a time")); assert.match(zh["exam.hall.scLead"], new RegExp("一次最多测量 " + cap + " 张脸"));
  assert.match(js, /"exam\.hall\.scCap", "ตัววัดวัดได้สูงสุดครั้งละ \{cap\} ใบหน้า: เห็นคน \{p\} คน วัดได้ \{n\} ใบหน้า — ให้ตรวจแถวไกลสุดโดยให้มีคนในภาพไม่เกิน \{cap\} คน"/);
  assert.match(en["exam.hall.scCap"], /^The check measures at most \{cap\} faces at a time: \{p\} people seen, \{n\} faces measured — check the farthest rows with up to \{cap\} people in view$/);
  assert.match(zh["exam.hall.scCap"], /^一次最多测量 \{cap\} 张脸：看到 \{p\} 人，测到 \{n\} 张脸——请在画面中不超过 \{cap\} 人的情况下检查最远的几排$/);
  for (const t of [en["exam.hall.scCap"], zh["exam.hall.scCap"]]) assert.doesNotMatch(t, /too small|too far|太小|太远/);
  const doc = read("docs/EXAM.md");
  assert.match(doc, new RegExp("returns at most " + cap + " faces per measurement \\(`HALL_SETUP\\.numFaces`")); assert.match(doc, /the cost with 16 faces found is \*\*not measured\*\*/);
});

test("evidence clip source (review): never the camera's own stream above 1280 px; no way to make the copy -> no clip, said in TH / EN / ZH; seat shape warning; guide wording", () => {
  const js = read("exam-hall.js"), html = read("exam-hall.html"), en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  // clipSource(): the only place the camera's own stream is returned is the "not wider than PROC_W" line
  const src = /async function clipSource\(\) \{[\s\S]*?\n {2}\}\n/.exec(js)[0];
  assert.equal((src.match(/return cam0;/g) || []).length, 1); assert.match(src, /if \(!\(Wv > PROC_W\) \|\| !cam0\) return cam0;/);
  assert.match(src, /if \(typeof clipCv\.captureStream !== "function" \|\| \(TEST && W\.__LQ_NO_CANVAS_STREAM\)\) \{ clipW = 0; clipOff = true; renderClipOff\(\); return null; \}/);
  assert.match(src, /typeof video\.requestVideoFrameCallback === "function"/); assert.match(src, /else clipTimer = setInterval\(paint, 66\);/);
  assert.match(js, /clipSource\(\)\.then\(s => \{ if \(s && monitoring && clipCfg\.on\) clips\.arm\(s\);/);
  for (const id of ["clipOff", "scLess", "seatAr"]) assert.match(html, new RegExp('<p class="status warn" id="' + id + '" role="status" hidden></p>'), id);
  const ph = t => (t.match(/\{\w+\}/g) || []).sort().filter((x, i, a) => a.indexOf(x) === i).join();
  for (const k of ["clipNoSrc", "scLess", "scCap", "scNoPeople", "scPeopleNone", "seatAr"]) {
    const key = "exam.hall." + k, th = new RegExp('"' + key.replace(/\./g, "\\.") + '",\\s*"([^"]*)"').exec(js);
    assert.ok(th, key + " is used with a Thai text"); assert.ok(THAI_RE.test(th[1]), key + ": Thai default");
    for (const d of [en, zh]) { assert.ok(d[key], key); assert.ok(!THAI_RE.test(d[key]), key + ": no Thai"); assert.equal(ph(d[key]), ph(th[1]), key + " placeholders"); }
  }
  assert.match(en["exam.hall.clipNoSrc"], /no evidence clip is recorded .* full-size picture is never recorded/); assert.match(zh["exam.hall.clipNoSrc"], /不录制证据片段/);
  assert.match(en["exam.hall.scLess"], /^Received less than asked: \{w\} × \{h\} px instead of \{aw\} × \{ah\} px/); assert.match(zh["exam.hall.scLess"], /^收到的画面低于所请求的/);
  assert.match(js, /"exam\.hall\.scLess", "ได้ภาพน้อยกว่าที่ขอ: /); assert.match(js, /isLess = Wv > 0 && Wv < top\.width/);
  // seat shape: one number per room + camera next to the seats, nothing else
  assert.match(js, /seatsAr: "lq-exam-seats-ar"/); assert.match(js, /Math\.abs\(seatAr - now\) \/ now > 0\.02/);
  // the guide is not published: every page text says where to get it, in the same words
  const flat = html.replace(/\s+/g, " ");
  assert.match(flat, /data-i18n="exam\.hall\.scMin">[^<]*ขอคู่มือวางกล้องได้จากเรา</);
    assert.match(en["exam.hall.scMin"], /ask us for the camera placement guide$/); assert.match(zh["exam.hall.scMin"], /请向我们索取摄像头摆放指南$/);
  for (const f of ["exam.html", "exam-hall.html", "exam-lab.html", "exam-dashboard.html", "exam-hall.js"]) assert.doesNotMatch(read(f), /ดูคู่มือวางกล้อง/, f);
  for (const d of [en, zh]) for (const k of Object.keys(d)) assert.doesNotMatch(d[k], /see the camera placement guide|[（，]见摄像头摆放指南/i, k);
  const doc = read("docs/EXAM.md");
  assert.match(doc, /\*\*no clip is recorded\*\*/); assert.match(doc, /`requestVideoFrameCallback`/); assert.match(doc, /Browsers slow page timers down in a tab that is not in front/);
  assert.match(doc, /\*\*Seats and frame shape \(residual risk\)\.\*\*/); assert.match(doc, /Seats saved \*\*before\*\* this version have no stored shape/);
  const kit = read("docs/pilot/PILOT-EXAM.md");
  assert.match(kit, /\*\*ที่นั่งที่บันทึกไว้ก่อนอัปเดตนี้:\*\*/); assert.match(kit, /\*\*Seats saved before this update:\*\*/);
});

test("hall setup check on the page: the panel, the camera ladder, TH / EN / ZH strings, off while monitoring, nothing sent or stored, no expression output", () => {
  const html = read("exam-hall.html"), js = read("exam-hall.js");
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  for (const id of ["setupCheck", "scBtn", "scKv", "scState", "scList"]) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(html, /id="scState" role="status" aria-live="polite"/);
  assert.ok(html.indexOf('id="setupCheck"') > html.indexOf('id="camWrap"') && html.indexOf('id="setupCheck"') < html.indexOf('id="runH"'), "under the camera view, before the run section");
  const flat = html.replace(/\s+/g, " ");
  assert.match(flat, /data-i18n="exam\.hall\.scH">ตรวจการติดตั้งกล้อง: ขนาดใบหน้า</);
  assert.match(flat, /data-i18n="exam\.hall\.scMin">48 px เป็นขั้นต่ำ ไม่ใช่การรับประกัน[^<]*คู่มือวางกล้อง ขอคู่มือวางกล้องได้จากเรา</);
  assert.match(flat, /data-i18n="exam\.hall\.scLead">[^<]*ไม่บันทึก ไม่ส่งออก ไม่จดจำว่าใครเป็นใคร</);
  assert.match(en["exam.hall.scMin"], /^48 px is a minimum, not a guarantee\..*camera placement guide$/); assert.match(zh["exam.hall.scMin"], /^48 px 只是最低要求，并非保证。.*摄像头摆放指南$/);
  const KEYS = ["scH", "scLead", "scMin", "scStart", "scStop", "scRes", "scPeople", "scFacesN", "scMinPx", "scMinNone", "scList", "scIdle", "scNoCam", "scMon", "scWait",
    "scNoFace", "scNoFaceP", "scSmall", "scPeopleW", "scOk", "scErr", "scLess", "scPeopleNone", "scCap", "scNoPeople"];
  for (const k of KEYS) {
    const key = "exam.hall." + k;
    assert.ok(js.includes('"' + key + '"') || html.includes('data-i18n="' + key + '"'), key + " is used");
    for (const d of [en, zh]) { assert.ok(d[key], key); assert.ok(!THAI_RE.test(d[key]), key + ": no Thai"); }
    // the same {placeholders} in Thai (page / script), English and Chinese
    const th = (new RegExp('"' + key.replace(/\./g, "\\.") + '",\\s*"([^"]*)"').exec(js) || new RegExp('data-i18n="' + key.replace(/\./g, "\\.") + '">([^<]*)<').exec(html))[1];
    const ph = t => (t.match(/\{\w+\}/g) || []).sort().filter((x, i, a) => a.indexOf(x) === i).join();
    assert.equal(ph(en[key]), ph(th), key + " placeholders (en)"); assert.equal(ph(zh[key]), ph(th), key + " placeholders (zh)");
  }
  // the people-vs-faces warning and the OK text say what the owner asked for
  assert.match(en["exam.hall.scPeopleW"], /^\{p\} people seen, \{n\} faces measured — the others may be too small or too far$/);
  assert.match(js, /"exam\.hall\.scPeopleW", "เห็นคน \{p\} คน วัดใบหน้าได้ \{n\} ใบหน้า — คนที่เหลืออาจเล็กหรืออยู่ไกลเกินไป"/);
  assert.match(zh["exam.hall.scPeopleW"], /^看到 \{p\} 人，测到 \{n\} 张脸——其余的人可能太小或太远$/);
  for (const t of [en["exam.hall.scOk"], zh["exam.hall.scOk"]]) assert.match(t, /\{min\} px (is a minimum, not a guarantee|只是最低要求，并非保证)$/);
  assert.match(js, /\{min\} px เป็นขั้นต่ำ ไม่ใช่การรับประกัน"/);
  // camera: the ladder from HALL_SETUP, no fixed 1280 x 720 request left; the green state only from hallSetupCheck().ok
  assert.match(js, /ideal: SC\.ladder\.map\(r => \(\{ width: r\.width, height: r\.height \}\)\)/); assert.doesNotMatch(js, /ideal: \{ width: 1280, height: 720 \}/);
  assert.match(js, /XF\.hallSetupCheck\(\{ faces, people: peopleNow\(\), frameW: video\.videoWidth, frameH: video\.videoHeight, minPx: SC\.minFacePx, cap: SC\.numFaces \}\)/);
  assert.equal((js.match(/kind = "ok"/g) || []).length, 1); assert.match(js, /else if \(r\.ok\) \{\s+kind = "ok";/);
  // only outside monitoring; the result object is never put in a message, the store or the heartbeat
  assert.match(js, /sc\.on = !!on && !monitoring;/); assert.match(js, /if \(monitoring\) \{ scSet\(false\);/); assert.match(js, /btn\.disabled = monitoring;/);
  for (const line of js.split("\n").filter(l => /link\.send\(|U\.store\.set\(|localStorage|function send\(/.test(l))) assert.doesNotMatch(line, /\bsc\.|scFaces|setup/i, line.slice(0, 80));
  assert.doesNotMatch(js, /blendshape|\.expressions?\b|emotion|\bgender\b/i);
  // the exam loop keeps its old work size on a larger frame; the clip is recorded from a copy at most PROC_W wide
  assert.match(js, /PROC_W = 1280/); assert.match(js, /const src = tiles && video\.videoWidth > PROC_W \? procFrame\(\) : video;/);
  assert.match(js, /clipSource\(\)\.then\(s => \{ if \(s && monitoring && clipCfg\.on\) clips\.arm\(s\);/); assert.doesNotMatch(js, /clips\.arm\(video\.srcObject\)/);
  assert.match(js, /ok = a\.width > 0 && a\.width <= PROC_W && !\(m\.width < Wv\);/);
  assert.ok(+(html.match(/lensiq-camera\.js\?v=(\d+)/) || [])[1] >= 8, "lensiq-camera.js at the site version, v8 or later (A5 2026-11-21: one version on every page, walkfix-cp.test.js)");
  assert.ok(+(html.match(/exam-hall\.js\?v=(\d+)/) || [])[1] >= 4, "exam-hall.js cache-busted at v4 or later (v5: owner rule 2026-11-15, no idle status)");
  assert.match(html, /lensiq-exam-face\.js\?v=3/);
  // docs: the section, the pilot kit (use it during room setup; the owner tests with a 4K webcam), one line each in the briefs
  const doc = read("docs/EXAM.md");
  assert.match(doc, /### Hall setup check \(2026-11-10\): face width in px in the live view/); assert.match(doc, /place a camera with the guide above/);
  assert.match(doc, /\| Never OK \| With no face, with any face under 48 px, or with more people seen than faces measured\. Also never before the people count exists\. \|/);
  const kit = read("docs/pilot/PILOT-EXAM.md");
  assert.match(kit, /ตอนติดตั้งห้องให้ใช้ “ตรวจการติดตั้งกล้อง” บนหน้า `exam-hall\.html`/); assert.match(kit, /เจ้าของจะทดสอบด้วยเว็บแคม 4K ในห้องจริง/);
  assert.match(kit, /During room setup, use the "setup check" on `exam-hall\.html`/); assert.match(kit, /will test this with a 4K webcam in a real room/);
  assert.match(read("docs/CTO-BRIEF.md"), /hall setup check is built \(separate commit\)/); assert.match(read("docs/FIELD-PILOT.md"), /Hall setup check \(same day, separate commit\)/);
  assert.match(read("docs/PDPA-NOTES-FOR-COUNSEL.md"), /Hall setup check \(2026-11-10, separate commit\)/);
});

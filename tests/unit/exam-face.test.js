"use strict";
// tests/unit/exam-face.test.js — LENSIQ Exam face engine (lensiq-exam-face.js, MediaPipe Face Landmarker by default since
// 2026-11-10): mesh -> 68-point mapping, pose from mesh / matrix, the ?fakedet seam, engine choice (face-api.js only in
// the research demo + ?faceengine=faceapi), the lab monitor with no face engine, the vendored model files (no
// facial-movement score model in the .task, sha256 as in the READMEs) and the Exam pages' scripts (no face-api.js).
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

test("Exam pages: the lab and hall pages load TF.js on its own and never vendor/face-api.js; the lab loads the face engine after LQExam", () => {
  for (const p of ["exam-lab.html", "exam-hall.html", "exam.html", "exam-dashboard.html"]) {
    const scripts = [...read(p).matchAll(/<script src="([^"]+)"/g)].map(m => m[1].replace(/\?.*$/, ""));
    assert.ok(!scripts.includes("vendor/face-api.js"), p + " loads face-api.js");
    if (p === "exam-lab.html" || p === "exam-hall.html") {
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
test("every page offering the hall page carries the experimental label in Thai, English and Chinese", () => {
  const all = lang => Object.assign({}, ...fs.readdirSync(path.join(ROOT, "i18n")).filter(x => x.startsWith(lang + "-") && x.endsWith(".js")).map(x => {
    try { return dictOf("i18n/" + x); } catch { return {}; }
  }));
  const en = all("en"), zh = all("zh");
  const TH = /ทดลอง/, EN = /experimental/i, ZH = /实验性/;
  const pages = fs.readdirSync(ROOT).filter(x => x.endsWith(".html") && x !== "exam-hall.html" && /href="exam-hall\.html"/.test(read(x)));
  for (const must of ["cameras.html", "cat-education.html", "exam.html"]) assert.ok(pages.includes(must), must + " offers the hall page");
  let links = 0;
  for (const p of pages) {
    const html = read(p);
    for (const m of html.matchAll(/<a\b[^>]*href="exam-hall\.html"[^>]*>[\s\S]*?<\/a>/g)) {
      links++;
      // the label is on the link itself, or (a bare "open" button) on the card that holds it
      let scope = m[0];
      if (!TH.test(scope.replace(/<[^>]+>/g, ""))) {
        const start = html.lastIndexOf("<article", m.index), end = html.indexOf("</article>", m.index);
        assert.ok(start >= 0 && end > m.index && html.lastIndexOf("</article>", m.index) < start, `${p}: hall link without the label and outside a card: ${m[0].slice(0, 90)}`);
        scope = html.slice(start, end);
      }
      assert.match(scope.replace(/<[^>]+>/g, " "), TH, `${p}: Thai text of the hall link / card says ทดลอง`);
      const keys = [...scope.matchAll(/data-i18n="([^"]+)"/g)].map(k => k[1]);
      assert.ok(keys.length, p + ": hall link text is translatable");
      for (const k of keys) { assert.ok(en[k] != null, `${p}: en ${k}`); assert.ok(zh[k] != null, `${p}: zh ${k}`); }
      assert.ok(keys.some(k => EN.test(en[k])), `${p}: English text of the hall link / card says experimental (${keys.join(", ")})`);
      assert.ok(keys.some(k => ZH.test(zh[k])), `${p}: Chinese text of the hall link / card says 实验性 (${keys.join(", ")})`);
    }
  }
  assert.ok(links >= 4, "hall links checked: " + links);
  // every inline Thai copy of the navigation description (the default text under data-i18n) carries the label too
  for (const p of fs.readdirSync(ROOT).filter(x => x.endsWith(".html"))) {
    for (const m of read(p).matchAll(/data-i18n="nav\.exam-hall\.desc">([^<]*)</g)) assert.match(m[1], TH, p + ": inline Thai nav.exam-hall.desc");
  }
  assert.match(read("nav.js"), /href: "exam-hall\.html"[^}]*desc: "[^"]*\(ทดลอง\)"/);
});

/* ---------- follow-ups 2026-11-10: hall "experimental", the hall pick, the lab second-person cue (§7) ---------- */
function dictOf(file) {
  const w = {}; w.window = w; require("node:vm").runInNewContext(read(file), w);
  const lang = /i18n\/(en|zh)-/.exec(file)[1];
  return Object.assign({}, ...w.LQI18N_Q.map(q => q[lang] || {}));
}
const THAI_RE = /[฀-๿]/;

test("hall mode is labelled experimental in Thai, English and Chinese wherever it is offered or sold; lab mode is not", () => {
  const en = dictOf("i18n/en-exam.js"), zh = dictOf("i18n/zh-exam.js");
  const enC = dictOf("i18n/en-common.js"), zhC = dictOf("i18n/zh-common.js"), enS = dictOf("i18n/en-solutions.js"), zhS = dictOf("i18n/zh-solutions.js");
  const enCat = dictOf("i18n/en-cat.js"), zhCat = dictOf("i18n/zh-cat.js");
  const TH = /ทดลอง/, EN = /experimental/i, ZH = /实验性/;
  // the hall page itself: a banner above the setup form, with the measured number, its n and its source
  const hall = read("exam-hall.html");
  assert.ok(hall.indexOf('id="hallExp"') > 0 && hall.indexOf('id="hallExp"') < hall.indexOf('id="setupForm"'), "banner above the setup form");
  const banner = /id="hallExp"[^>]*>([\s\S]*?)<\/p>/.exec(hall)[1];
  assert.match(banner, /data-i18n="exam\.hall\.expB">รุ่นทดลอง ยังไม่เปิดขาย</);
  for (const t of [banner, en["exam.hall.exp"], zh["exam.hall.exp"]]) for (const tok of ["0%", "n = 195", "63%", "24–48 px", "0.40"]) assert.ok(t.includes(tok),
    `hall banner: "${tok}" in ${t.slice(0, 40)}`);
  assert.match(banner, /ชุดข้อมูลสาธารณะ/); assert.match(en["exam.hall.exp"], /public dataset/); assert.match(zh["exam.hall.exp"], /公开数据集/);
  assert.match(en["exam.hall.expB"], /Experimental, not on sale yet/); assert.match(zh["exam.hall.expB"], /实验性，暂不销售/);
  // Exam landing page: the button, the mode card and the price card
  const landing = read("exam.html");
  assert.match(landing, /data-i18n="exam\.l\.ctaHall">[^<]*ทดลอง/);
  assert.match(landing, /id="hallExp"><b data-i18n="exam\.l\.mAxB">รุ่นทดลอง ยังไม่เปิดขาย</);
  assert.match(landing, /data-i18n="exam\.l\.p3x">รุ่นทดลอง[^<]*ยังไม่เปิดขาย/);
  for (const k of ["exam.l.ctaHall", "exam.l.mAxB", "exam.l.p3x"]) { assert.match(en[k], EN, "en " + k); assert.match(zh[k], ZH, "zh " + k); }
  assert.match(en["exam.l.p3x"], /not on sale/); assert.match(zh["exam.l.p3x"], /不销售/);
  // navigation, solutions catalogue
  assert.match(read("nav.js"), /href: "exam-hall\.html"[^}]*ทดลอง/);
  assert.match(enC["nav.exam-hall.desc"], EN); assert.match(zhC["nav.exam-hall.desc"], ZH);
  assert.match(read("solutions.html"), /ห้องสอบที่มีกล้องรอบห้อง \(รุ่นทดลอง ยังไม่เปิดขาย\)/);
  assert.match(enS["sl.c.edu1.p"], /cameras around the room \(experimental, not on sale yet\)/); assert.match(zhS["sl.c.edu1.p"], /实验性，暂不销售/);
  // category page + status table: generated from tools/cat-data.cjs
  const D = require("../../tools/cat-data.cjs");
  assert.equal(D.PAGES["exam-hall"].st, "experimental");
  for (const p of ["exam", "exam-lab", "exam-dashboard"]) assert.equal(D.PAGES[p].st, "pilot-ready", p + " unchanged");
  assert.match(read("cat-education.html"), /data-page="exam-hall" data-status="experimental"/);
  assert.match(read("cat-education.html"), /data-page="exam-lab" data-status="pilot-ready"/);
  assert.match(D.REASONS.examHall.th, TH); assert.match(D.REASONS.examHall.en, EN); assert.match(D.REASONS.examHall.zh, ZH);
  assert.match(enCat["cat.r.examHall"], /not for sale yet/); assert.match(zhCat["cat.r.examHall"], /暂不销售/);
  assert.match(read("docs/PAGE-STATUS.md"), /\| `exam-hall\.html` \| 2 Education & Exams \| \*\*experimental\*\* \|/);
  // sales documents
  const one = read("docs/ONE-PAGER-EXAM.md");
  assert.ok((one.match(/รุ่นทดลอง ยังไม่เปิดขาย/g) || []).length >= 2 && (one.match(/experimental, not on sale yet/g) || []).length >= 2, "one-pager: what you get + price row, TH and EN");
  assert.match(read("docs/SALES-PACKAGES.md"), /camera-hall mode \(`exam-hall\.html`, \*\*experimental, not sold until the small-face issue is fixed\*\*/);
  assert.match(read("docs/ONE-PAGER-ZH.md"), /考场摄像头[^|\n]*实验性/);
  assert.match(read("docs/ONE-PAGER-TH.md"), /เครื่องกล้องในห้องสอบ[^|\n]*รุ่นทดลอง/);
  // lab mode keeps its wording: no "experimental" on the lab button or nav entry
  for (const d of [en, zh]) assert.doesNotMatch(d["exam.l.ctaLab"], /experimental|实验性/);
  assert.doesNotMatch(enC["nav.exam-lab.desc"], EN);
  // no Thai in the new en / zh strings
  for (const d of [en, zh]) for (const k of ["exam.hall.exp", "exam.hall.expB", "exam.hall.faceOn", "exam.hall.faceErr", "exam.hall.kvFaces", "exam.hall.kvFaceOff", "exam.l.cl4", "exam.l.cl5"]) {
    assert.ok(d[k] && !THAI_RE.test(d[k]), k);
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
  // invigilator-facing pages keep it: the dashboard note and the landing claim list
  const dash = read("exam-dashboard.html");
  assert.match(dash.replace(/\s+/g, " "), /class="note" id="nMulti" data-i18n="exam\.db\.nMulti">[^<]*28\.8% \(15 \/ 52\) · n = 52 ภาพ · ที่มา: ชุดข้อมูลสาธารณะ/);
  assert.match(en["exam.db.nMulti"], /28\.8% \(15 \/ 52\) · n = 52 frames · source: public dataset/); assert.match(zh["exam.db.nMulti"], /28\.8%（15 \/ 52）· n = 52 帧 · 来源：公开数据集/);
  assert.match(read("exam.html"), /data-i18n="exam\.l\.cl5">[^<]*28\.8% \(15 \/ 52\)/);
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
    assert.match(new RegExp('data-i18n="' + k.replace(/\./g, "\\.") + '">([^<]*)<').exec(land)[1], /จำนวนกล้องขึ้นกับขนาดห้อง \(?ดูคู่มือวางกล้อง\)/, k);
    assert.match(en[k], /number of cameras depends on room size[, (]+see the camera placement guide\)/i, k); assert.match(zh[k], /摄像头数量取决于考场大小[，（]见摄像头摆放指南）/, k);
    assert.ok(!THAI_RE.test(en[k].replace(/฿/g, "")) && !THAI_RE.test(zh[k].replace(/฿/g, "")), k + ": no Thai in en / zh");
  }
  // prices unchanged, hall still "experimental, not on sale"
  assert.match(land, /data-i18n="exam\.l\.p3b">฿290 ต่อห้องต่อวันสอบ/);
  assert.match(land, /data-i18n="exam\.l\.p3n">หรือ ฿990 ต่อเดือนต่อห้อง/);
  assert.match(land, /data-i18n="exam\.l\.p3x">รุ่นทดลอง: ยังไม่เปิดขาย/);
  assert.match(en["exam.l.p3n"], /^or ฿990 per month per room /); assert.match(zh["exam.l.p3n"], /^或每考场每月 ฿990/);
  const one = read("docs/ONE-PAGER-EXAM.md");
  assert.match(one, /ห้องสอบที่มีกล้อง \(ต่อห้อง จำนวนกล้องขึ้นกับขนาดห้อง ดูคู่มือวางกล้อง\) \*\*— รุ่นทดลอง ยังไม่เปิดขาย\*\* \| 290 บาท ต่อห้องต่อวันสอบ/);
  assert.match(one, /Camera hall \(per room; number of cameras depends on room size, see the guide\), \*\*experimental, not on sale yet\*\* \| 290 THB per room per exam day/);
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
  // "more than one person": the measured rate, its n, its source and "an aid, not complete detection" on both pages
  const thOf = (file, key) => new RegExp('data-i18n="' + key.replace(/\./g, "\\.") + '">([^<]*)<').exec(read(file))[1].replace(/\s+/g, " ");
  // (owner decision 2 of the follow-up: the rate is on the invigilator-facing pages only: the landing claim list and the dashboard)
  for (const [file, key] of [["exam.html", "exam.l.cl5"], ["exam-dashboard.html", "exam.db.nMulti"]]) {
    const th = thOf(file, key);
    for (const t of [th, en[key], zh[key]]) {
      assert.ok(t.includes("28.8%") && t.includes("n = 52"), key + ": 28.8% and n = 52 in " + t.slice(0, 50)); assert.match(t, /15 \/ 52/, key);
    }
    assert.match(th, /มากกว่าหนึ่งคน/); assert.match(th, /เป็นตัวช่วยผู้คุมสอบ ไม่ใช่การตรวจจับที่ครบถ้วน/); assert.match(th, /ชุดข้อมูลสาธารณะ/); assert.match(th, /ไม่ใช่ภาพห้องสอบจริง/);
    assert.match(en[key], /more than one person/); assert.match(en[key], /an aid for the invigilator, not complete detection/);
    assert.match(en[key], /public dataset/); assert.match(en[key], /held-out/);
    assert.match(zh[key], /不止一个人/); assert.match(zh[key], /辅助，并非完整检测/); assert.match(zh[key], /公开数据集/);
    assert.ok(!THAI_RE.test(en[key]) && !THAI_RE.test(zh[key]), key + ": no Thai in en / zh");
  }
  for (const k of ["exam.db.nMulti"]) { assert.match(thOf("exam-dashboard.html", k), /ในห้องสอบจริง: ยังไม่ได้วัด/);
  assert.match(en[k], /real exam rooms: not measured/);
  assert.match(zh[k], /尚未测量/); }
  // solutions catalogue: the same wording as the product ("more than one person"), not "several faces"
  assert.match(read("solutions.html"), /data-i18n="sl\.c\.edu1\.p">[^<]*มากกว่าหนึ่งคน/); assert.doesNotMatch(read("solutions.html"), /sl\.c\.edu1\.p">[^<]*หลายใบหน้า/);
  assert.match(dictOf("i18n/en-solutions.js")["sl.c.edu1.p"], /more than one person/); assert.doesNotMatch(dictOf("i18n/en-solutions.js")["sl.c.edu1.p"], /several faces/);
  assert.match(dictOf("i18n/zh-solutions.js")["sl.c.edu1.p"], /不止一个人/);
  // one-pagers and the pilot kit
  const one = read("docs/ONE-PAGER-EXAM.md");
  assert.match(one, /เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน\*\* \| 28\.8% \(15 \/ 52\)/); assert.match(one, /An aid, not complete detection\*\* \| 28\.8% \(15 \/ 52\)/);
  assert.match(read("docs/ONE-PAGER-TH.md"), /มากกว่าหนึ่งคน[^|\n]*ไม่ใช่การตรวจจับที่ครบถ้วน\) \| 28\.8% \(15 \/ 52\)/);
  assert.match(read("docs/ONE-PAGER-ZH.md"), /不止一个人[^|\n]*并非完整检测） \| 28\.8%（15 \/ 52）/);
  const kit = read("docs/pilot/PILOT-EXAM.md");
  assert.match(kit, /นำด้วยโหมด B \(ห้องคอมพิวเตอร์\)/); assert.match(kit, /leads with Mode B \(computer room\)/);
  assert.match(kit, /ยังไม่มีการส่งสด \(ทั้งเหตุการณ์และภาพวิดีโอ\) ไปยังแดชบอร์ดบนเครื่องอื่น/); assert.match(kit, /เจ้าของยอมรับข้อนี้สำหรับการนำร่อง/);
  assert.match(kit, /no live feed \(events or video\) to a dashboard on another\s+> machine/); assert.match(kit, /The owner\s+> accepts this for the pilot/);
  assert.ok(kit.indexOf("- **โหมด B ห้องคอมพิวเตอร์") < kit.indexOf("- **โหมด A ห้องสอบที่มีกล้อง"), "Thai: lab mode listed first");
  assert.ok(kit.indexOf("- **Mode B, the lead mode**") < kit.indexOf("- **Mode A** (camera exam hall"), "English: lab mode listed first");
  assert.match(kit, /28\.8 % \(15 \/ 52 ภาพที่มีคนที่สอง\)/); assert.match(kit, /28\.8 % \(15 \/ 52 frames with a\s+second person\)/);
  assert.match(kit, /เป็นตัวช่วย ไม่ใช่การตรวจจับที่ครบถ้วน/); assert.match(kit, /is an aid, not complete detection/);
  // hall "count faces (experimental)": stays, off by default, and its label says small or distant faces are not found
  const hall = read("exam-hall.html");
  assert.match(hall.replace(/\s+/g, " "), /id="faceOn"> <span data-i18n="exam\.hall\.faceOn">นับใบหน้าในภาพ \(ทดลอง: ยังไม่พบใบหน้าเล็กหรือที่อยู่ไกล/);
  assert.match(en["exam.hall.faceOn"], /experimental: small or distant faces are not found yet/); assert.match(zh["exam.hall.faceOn"], /实验性：目前找不到小脸或远处的脸/);
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
  assert.match(guide, /is \*\*not built\*\*/); assert.match(guide, /48 px is necessary, not\s+sufficient/);
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

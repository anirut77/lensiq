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

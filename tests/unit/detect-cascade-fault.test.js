"use strict";
// tests/unit/detect-cascade-fault.test.js — FIXED TEST (faceread-ios round 2, independent review 2026-11-15), locked
// (~/LENSIQ-field/evals/faceread-ios/locked.sha256) before the product change.
// LQDetect.detectFacesCascade is used by attendance.js, customers.js and lensiq-exam-face.js. face-api's task object has
// `async then(ok) { return ok(await this.run()) }`: it ignores the reject handler, so `await task` NEVER settles when
// detection throws. The fake below copies that exact `then`. Rules:
//   1. a detector that throws -> detectFacesCascade rejects (with that error) within 1 s, it does not hang
//   2. a detector that never returns -> detectFacesCascade rejects with e.name "DetectTimeout" after opts.timeoutMs
//   3. a working detector still gives the same results: first size with faces wins, the next size only on an empty result
//   4. LQDetect.scanGuard(): 3 "other" errors in a row trip it (ok() resets the count); a timeout, a lost WebGL context or
//      out of memory trips it at once; fail(e) returns the kind when tripped, else null
//   5. LQDetect.scanFailText(kind) is a plain Thai line: "oom" names memory (หน่วยความจำ), every kind says scanning
//      stopped (หยุดสแกน); kinds timeout / lost / other share the "stopped working" line
// Source: synthetic (a scripted fake of the face-api task), Node.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../../lensiq-detect.js");

/** fake face-api: detectAllFaces(src, {inputSize}) -> task with withFaceLandmarks/withFaceDescriptors and face-api's then */
function fakeFa(behave) {
  const calls = [];
  class Task {
    constructor(size) { this.size = size; }
    withFaceLandmarks() { return this; }
    withFaceDescriptors() { return this; }
    run() { calls.push(this.size); return behave(this.size); }
    async then(ok) { return ok(await this.run()); } // face-api: no reject handler
  }
  return { calls, TinyFaceDetectorOptions: function (o) { Object.assign(this, o); }, detectAllFaces: (_src, o) => new Task(o.inputSize) };
}
const within = (p, ms) => Promise.race([p.then(v => ({ v }), e => ({ e })), new Promise(r => setTimeout(() => r({ hung: true }), ms))]);

test("1. a throwing detector makes detectFacesCascade reject, not hang", async () => {
  const fa = fakeFa(async () => { throw new Error("simulated detector failure"); });
  const r = await within(D.detectFacesCascade(fa, {}, { descriptors: false }), 1000);
  assert.ok(!r.hung, "detectFacesCascade did not settle within 1 s after the detector threw");
  assert.ok(r.e && /simulated detector failure/.test(r.e.message), "rejects with the detector error: " + JSON.stringify(r));
  const fb = fakeFa(async () => { throw new RangeError("Out of memory"); });
  const r2 = await within(D.detectFacesCascade(fb, {}, {}), 1000);
  assert.ok(r2.e && r2.e.name === "RangeError", "keeps the RangeError: " + JSON.stringify(r2));
});

test("2. a detector that never returns rejects with DetectTimeout after timeoutMs", async () => {
  const fa = fakeFa(() => new Promise(() => {}));
  const t0 = Date.now();
  const r = await within(D.detectFacesCascade(fa, {}, { timeoutMs: 80 }), 1500);
  assert.ok(!r.hung, "still pending after 1.5 s");
  assert.equal(r.e && r.e.name, "DetectTimeout");
  assert.ok(Date.now() - t0 >= 70, "not before timeoutMs");
});

test("3. a working detector: first size with faces wins, the next size only on an empty result", async () => {
  const fa = fakeFa(async s => (s === 224 ? [{ s }] : []));
  assert.deepEqual(await D.detectFacesCascade(fa, {}, {}), [{ s: 224 }]);
  assert.deepEqual(fa.calls, [320, 224]);
  const fb = fakeFa(async () => []);
  assert.deepEqual(await D.detectFacesCascade(fb, {}, { sizes: [320, 160] }), []);
  assert.deepEqual(fb.calls, [320, 160]);
});

test("4. scanGuard: 3 other errors in a row, or one timeout / lost / oom", () => {
  const g = D.scanGuard();
  const other = new Error("x");
  assert.equal(g.fail(other), null); assert.equal(g.fail(other), null);
  g.ok();
  assert.equal(g.fail(other), null); assert.equal(g.fail(other), null);
  assert.equal(g.fail(other), "other");
  const n = name => Object.assign(new Error(name), { name });
  assert.equal(D.scanGuard().fail(n("DetectTimeout")), "timeout");
  assert.equal(D.scanGuard().fail(n("ContextLost")), "lost");
  assert.equal(D.scanGuard().fail(new RangeError("Out of memory")), "oom");
});

test("5. scanFailText: plain Thai, memory named for oom, scanning stopped in every case", () => {
  for (const k of ["oom", "timeout", "lost", "other"]) {
    const t = D.scanFailText(k);
    assert.ok(typeof t === "string" && /[฀-๿]/.test(t), k + ": Thai text");
    assert.ok(/หยุดสแกน/.test(t), k + ": says scanning stopped: " + t);
    assert.ok(!/Error|Timeout|undefined|\{/.test(t), k + ": no technical text: " + t);
  }
  assert.ok(/หน่วยความจำ/.test(D.scanFailText("oom")));
  assert.equal(D.scanFailText("timeout"), D.scanFailText("other"));
  assert.equal(D.scanFailText("lost"), D.scanFailText("other"));
});

// Round-5 face identification: gallery-size/population calibration (gallerySpread + enrolGallery(FACE_RULES)),
// the confident / please-confirm split (matchFace.confident) and the detector cascade (LQDetect.detectFacesCascade).
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../lensiq-track.js");
const D = require("../../lensiq-detect.js");

// people placed on a circle: every pair of centroids is `spread`-ish apart (distances scale with r)
const ring = (n, r, dim = 8) => Array.from({ length: n }, (_, i) => {
  const d = new Float32Array(dim); d[0] = r * Math.cos(2 * Math.PI * i / n); d[1] = r * Math.sin(2 * Math.PI * i / n); d[2 + (i % (dim - 2))] = r * 0.3;
  return { label: "p" + i, ds: [d] };
});
const near = (d, dx) => { const x = Float32Array.from(d); x[0] += dx; return x; };

test("FACE_RULES: round-5 constants are frozen and exported", () => {
  assert.ok(Object.isFrozen(T.FACE_RULES));
  assert.equal(T.FACE_RULES.maxDist, 0.50); assert.equal(T.FACE_RULES.floor, 0.44); assert.equal(T.FACE_RULES.margin, 0.09);
  assert.equal(T.FACE_RULES.minCal, 5); assert.equal(T.FACE_REF_SPREAD, 0.736);
});

test("gallerySpread: median pairwise centroid distance, scale <= 1, calibrated from 5 people", () => {
  const g = ring(6, 0.4);
  const s = T.gallerySpread(g);
  assert.equal(s.n, 6); assert.equal(s.pairs, 15);
  assert.ok(s.median > 0.3 && s.median < 0.8, String(s.median));
  assert.ok(Math.abs(s.scale - Math.min(1, s.median / T.FACE_REF_SPREAD)) < 1e-12);
  assert.equal(s.calibrated, true);
  assert.equal(T.gallerySpread(ring(4, 0.4)).calibrated, false, "4 people: not enough to calibrate");
  // a widely spread (LFW-like or wider) population never loosens the limits
  assert.equal(T.gallerySpread(ring(6, 3)).scale, 1);
  // centroid of several photos is used
  const two = [{ label: "a", ds: [Float32Array.from([0, 0]), Float32Array.from([0.2, 0])] }, { label: "b", ds: [Float32Array.from([1.1, 0])] }];
  assert.ok(Math.abs(T.gallerySpread(two).median - 1.0) < 1e-6);
  assert.deepEqual({ ...T.gallerySpread([]), median: 0 }, { n: 0, pairs: 0, median: 0, scale: 1, calibrated: false });
});

test("enrolGallery(FACE_RULES): limits and margin shrink with a compressed population; round-4 output unchanged without it", () => {
  const people = ring(8, 0.3);
  const cal = T.gallerySpread(people);
  assert.ok(cal.scale < 1);
  const g = T.enrolGallery(people, T.FACE_RULES);
  assert.equal(g.length, 8);
  assert.deepEqual(g.calibration, cal);
  for (const e of g) {
    assert.ok(e.thr <= T.FACE_RULES.maxDist * cal.scale + 1e-12, "cap scaled");
    assert.ok(e.thr >= T.FACE_RULES.floor * cal.scale - 1e-12, "floor scaled");
    assert.ok(Math.abs(e.mg - T.FACE_RULES.margin * cal.scale) < 1e-12);
    assert.equal(e.calibrated, true); assert.equal(e.conf, T.FACE_RULES.conf);
  }
  const old = T.enrolGallery(people, { maxDist: 0.55, k: 0.85, floor: 0.45 });
  assert.ok(old.every(e => !("mg" in e) && !("calibrated" in e)), "round-4 entries untouched");
  assert.equal(old.calibration, undefined);
});

test("matchFace on a calibrated gallery: a stranger at the old fixed 0.55 limit is now rejected", () => {
  const people = ring(10, 0.28); // compressed population (like CASIA-FaceV5): every distance well below LFW's
  const g = T.enrolGallery(people, T.FACE_RULES), lim = g[0].thr;
  assert.ok(lim < 0.4, "calibrated limit " + lim);
  const probe = near(people[0].ds[0], lim + 0.5 * (0.55 - lim)); // inside 0.55, outside the calibrated limit
  const r4 = T.matchFace(probe, T.enrolGallery(people, { maxDist: 0.55, k: 0.85, floor: 0.45 }), { maxDist: 0.55, margin: 0.05 });
  const r5 = T.matchFace(probe, g, { maxDist: T.FACE_RULES.maxDist, margin: T.FACE_RULES.margin });
  assert.equal(r5.label, "unknown");
  assert.equal(r4.label, "p0", "round 4 accepted this stranger");
});

test("matchFace.confident: close match is automatic, a match near the limit asks a person, <5 enrolled always asks", () => {
  const people = ring(10, 0.5);
  const g = T.enrolGallery(people, T.FACE_RULES), lim = g[0].thr;
  const sure = T.matchFace(near(people[0].ds[0], 0.3 * lim), g, T.FACE_RULES);
  assert.equal(sure.label, "p0"); assert.equal(sure.confident, true);
  const edge = T.matchFace(near(people[0].ds[0], 0.95 * lim), g, T.FACE_RULES);
  if (edge.label === "p0") assert.equal(edge.confident, false, "accepted but within 15% of the limit -> confirm");
  const none = T.matchFace(near(people[0].ds[0], 5), g, T.FACE_RULES);
  assert.equal(none.label, "unknown"); assert.equal(none.confident, false);
  const small = ring(3, 0.5), gs = T.enrolGallery(small, T.FACE_RULES);
  const m = T.matchFace(near(small[0].ds[0], 0.01), gs, T.FACE_RULES);
  assert.equal(m.label, "p0"); assert.equal(m.confident, false, "uncalibrated gallery: every match is a suggestion");
  // round-4 galleries: accepted matches stay automatic (pages that did not opt in behave as before)
  const r4 = T.matchFace(near(people[0].ds[0], 0.01), T.enrolGallery(people), { maxDist: 0.55 });
  assert.equal(r4.confident, true);
});

test("detectFacesCascade: tries the next input size only when nothing was found", async () => {
  const calls = [];
  const fa = {
    TinyFaceDetectorOptions: function (o) { Object.assign(this, o); },
    detectAllFaces(src, opts) {
      calls.push(opts.inputSize);
      const res = opts.inputSize === 224 ? [{ id: "face" }] : [];
      const q = { withFaceLandmarks: () => q, withFaceDescriptors: () => q, then: (a, b) => Promise.resolve(res).then(a, b) };
      return q;
    }
  };
  assert.deepEqual(D.FACE_SIZES, [320, 224, 160]);
  const r = await D.detectFacesCascade(fa, {}, {});
  assert.deepEqual(r, [{ id: "face" }]); assert.deepEqual(calls, [320, 224], "stops at the first size that finds a face");
  calls.length = 0;
  assert.deepEqual(await D.detectFacesCascade(fa, {}, { sizes: [320, 160] }), []);
  assert.deepEqual(calls, [320, 160]);
});

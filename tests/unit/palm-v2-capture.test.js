"use strict";
// tests/unit/palm-v2-capture.test.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19), locked in
// evals-locks/palm-layers.sha256 BEFORE any product code. Capture to the faceread / lensiq-camera standard:
// - the full-resolution still: ImageCapture.takePhoto() when available; otherwise the track frame at the track's full size
//   (video.videoWidth x videoHeight), never the preview (the element's on-screen size); a failing takePhoto falls back to the
//   track frame;
// - rear camera always; photographing another person's hand needs the consent line ticked first (TH / EN / ZH), cleared after
//   each capture;
// - capture metrics (sharpness, light, glare, evenness) flag a blurred, dark, bright, glared or shadowed synthetic hand and pass a
//   good one; the live hint order (frame first, then light, pose, sharpness, still); every hint in TH / EN / ZH, with the
//   "ask them to ..." wording for another person's hand; thresholds marked PROVISIONAL;
// - automatic capture after a steady green countdown, once per hand (re-armed only after leaving green for 1.5 s), plus the
//   manual button at any time with a "taken before green" note.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SYN = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-hand.js"));

const LANGS = ["th", "en", "zh"];
function fakeCanvasFactory(log) {
  return (w, h) => {
    const c = { width: w, height: h, getContext: () => ({ drawImage: (src, ...a) => log.push({ op: "drawImage", src: src && src.__name, args: a, cw: c.width, ch: c.height }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) };
    log.push({ op: "canvas", w, h });
    return c;
  };
}
const video = (vw, vh) => ({ __name: "video", videoWidth: vw, videoHeight: vh, clientWidth: 390, clientHeight: 520, width: 390, height: 520, readyState: 4 });
const track = (sw, sh) => ({ kind: "video", readyState: "live", getSettings: () => ({ width: sw, height: sh, facingMode: "environment" }), getCapabilities: () => ({ width: { max: 4032 },
  height: { max: 3024 } }) });

test("still: ImageCapture.takePhoto() when available; the preview frame is not used", async () => {
  const log = [], calls = [];
  class IC { constructor(t) { this.t = t; calls.push("new"); } takePhoto(o) { calls.push("takePhoto"); return Promise.resolve({ __blob: true, size: 3e6, type: "image/jpeg", w: 4032, h: 3024 }); } }
  const r = await PV.grabStill({ track: track(1920, 1080), video: video(1920, 1080), ImageCapture: IC, createCanvas: fakeCanvasFactory(log), decode: b => Promise.resolve({ __name: "photo",
    width: b.w, height: b.h }) });
  assert.equal(r.source, "takePhoto");
  assert.deepEqual([r.width, r.height], [4032, 3024]);
  assert.ok(calls.includes("takePhoto"));
  assert.ok(!log.some(e => e.op === "drawImage" && e.src === "video"), "video (preview) drawn although takePhoto worked: " + JSON.stringify(log));
});
test("still: without ImageCapture, the track frame at full track size (not the on-screen preview size)", async () => {
  const log = [];
  const r = await PV.grabStill({ track: track(3840, 2160), video: video(3840, 2160), ImageCapture: undefined, createCanvas: fakeCanvasFactory(log) });
  assert.equal(r.source, "trackFrame");
  assert.deepEqual([r.width, r.height], [3840, 2160]);
  const d = log.filter(e => e.op === "drawImage" && e.src === "video");
  assert.equal(d.length >= 1, true);
  for (const e of d) { assert.deepEqual([e.cw, e.ch], [3840, 2160], "drawn into a canvas of the full size"); if (e.args.length >= 4) assert.deepEqual(e.args.slice(2, 4), [3840, 2160]); }
  assert.ok(!log.some(e => e.op === "canvas" && (e.w === 390 || e.w <= 1600) && e.w !== 3840), "a downscaled / preview-size canvas was made: " + JSON.stringify(log));
});
test("still: a failing takePhoto falls back to the full-size track frame", async () => {
  const log = [];
  class IC { takePhoto() { return Promise.reject(new Error("NotSupportedError")); } }
  const r = await PV.grabStill({ track: track(1920, 1080), video: video(1920, 1080), ImageCapture: IC, createCanvas: fakeCanvasFactory(log) });
  assert.equal(r.source, "trackFrame");
  assert.deepEqual([r.width, r.height], [1920, 1080]);
});
test("still plan: never 'preview'", () => {
  for (const ic of [true, false]) for (const [w, h] of [[640, 480], [1920, 1080], [4032, 3024]]) {
    const p = PV.stillPlan({ hasImageCapture: ic, videoWidth: w, videoHeight: h, clientWidth: 390 });
    assert.ok(p.method === "takePhoto" || p.method === "trackFrame", JSON.stringify(p));
    if (p.method === "trackFrame") assert.deepEqual([p.width, p.height], [w, h]);
    assert.equal(p.method === "takePhoto", ic);
  }
});

test("rear camera; another person's hand needs the consent line first (TH / EN / ZH); consent cleared after capture", () => {
  const self = PV.cameraGate({ mode: "self", consent: false });
  assert.equal(self.facing, "environment"); assert.equal(self.open, true); assert.equal(self.consentRequired, false);
  const other = PV.cameraGate({ mode: "other", consent: false });
  assert.equal(other.facing, "environment"); assert.equal(other.open, false); assert.equal(other.consentRequired, true);
  const ok = PV.cameraGate({ mode: "other", consent: true });
  assert.equal(ok.open, true);
  assert.equal(PV.consentAfterCapture({ mode: "other", consent: true }), false);
  const want = { th: "ถ่ายภาพมือของคนอื่นได้เฉพาะเมื่อเจ้าของมือรู้และยินยอมแล้วเท่านั้น ภาพไม่ถูกบันทึกและไม่ถูกส่งออกจากเครื่องนี้",
    en: "Photograph another person's hand only when they know and agree. The photo is not saved and does not leave this device.",
    zh: "仅在对方知情并同意的情况下拍摄其手掌。照片不会被保存，也不会离开本设备。" };
  for (const l of LANGS) assert.equal(PV.T("consent.other", l), want[l]);
});

function metricsOf(opt) {
  const h = SYN.synthHand(Object.assign({ lines: ["heart", "head", "life", "fate"], seed: 3 }, opt));
  const F = PV.frameFromHand(h.hand);
  return PV.captureMetrics(h.rgba, h.w, h.h, PV.palmRoi(F, h.w, h.h));
}
test("capture metrics flag blur, dark, bright, glare and uneven light on a synthetic hand; a good one passes (PROVISIONAL thresholds)", () => {
  assert.equal(PV.CAPTURE_T.PROVISIONAL, true, "thresholds are marked PROVISIONAL until calibrated on real photos");
  const good = PV.captureHint({ metrics: metricsOf({}), hand: { found: true, count: 1, fill: 0.4, offset: 0.05, open: true, tilt: 3, back: false, still: true } });
  assert.equal(good, "ok", "good synthetic hand: " + JSON.stringify(metricsOf({})));
  const H = { found: true, count: 1, fill: 0.4, offset: 0.05, open: true, tilt: 3, back: false, still: true };
  assert.equal(PV.captureHint({ metrics: metricsOf({ blur: 4 }), hand: H }), "blur");
  assert.equal(PV.captureHint({ metrics: metricsOf({ dark: 0.3 }), hand: H }), "dark");
  assert.equal(PV.captureHint({ metrics: metricsOf({ bright: 120 }), hand: H }), "bright");
  assert.equal(PV.captureHint({ metrics: metricsOf({ glare: true }), hand: H }), "glare");
  assert.equal(PV.captureHint({ metrics: metricsOf({ uneven: true }), hand: H }), "uneven");
});
test("live hint order: frame first, then light, pose, sharpness, still", () => {
  const m = metricsOf({});
  const base = { found: true, count: 1, fill: 0.4, offset: 0.05, open: true, tilt: 3, back: false, still: true };
  const hint = h => PV.captureHint({ metrics: m, hand: Object.assign({}, base, h) });
  assert.equal(hint({ found: false }), "noHand");
  assert.equal(hint({ count: 2 }), "many");
  assert.equal(hint({ back: true }), "back");
  assert.equal(hint({ fill: 0.05 }), "far");
  assert.equal(hint({ fill: 0.95 }), "near");
  assert.equal(hint({ offset: 0.4 }), "center");
  assert.equal(hint({ open: false }), "open");
  assert.equal(hint({ tilt: 35 }), "tilt");
  assert.equal(hint({ still: false }), "still");
  assert.equal(PV.captureHint({ metrics: metricsOf({ blur: 4 }), hand: Object.assign({}, base, { fill: 0.05 }) }), "far", "frame before sharpness");
  assert.equal(PV.captureHint({ metrics: metricsOf({ dark: 0.3, blur: 4 }), hand: base }), "dark", "light before sharpness");
  for (const id of ["noHand", "many", "back", "far", "near", "center", "open", "tilt", "turn", "dark", "bright", "uneven", "glare", "blur", "still", "ok"]) for (const l of LANGS) {
    const a = PV.hintText(id, l, false), b = PV.hintText(id, l, true);
    assert.ok(a && b && a.length > 3, `${id} ${l}`);
    if (l === "th" && ["open", "back", "tilt"].includes(id)) assert.ok(/ขอให้|ให้เขา|ให้เจ้าของมือ/.test(b), `${id} other-person wording: ${b}`);
    if (l === "en" && ["open", "back", "tilt"].includes(id)) assert.ok(/\b(ask them|their)\b/i.test(b), `${id} other-person wording: ${b}`);
    if (l === "zh" && ["open", "back", "tilt"].includes(id)) assert.ok(/对方/.test(b), `${id} other-person wording: ${b}`);
  }
  for (const l of LANGS) assert.ok(PV.T("capture.beforeGreen", l).length > 10);
});
test("skin-blob hand check on the synthetic hand (no landmark model): found, open, upright", () => {
  const h = SYN.synthHand({ seed: 5 });
  const r = PV.handFromSkin(h.rgba, h.w, h.h);
  assert.equal(r.found, true); assert.equal(r.count, 1); assert.equal(r.open, true);
  assert.ok(Math.abs(r.tilt) < 15, "tilt " + r.tilt);
  assert.ok(r.fill > 0.15 && r.fill < 0.9, "fill " + r.fill);
  const empty = new Uint8ClampedArray(h.w * h.h * 4).fill(90);
  assert.equal(PV.handFromSkin(empty, h.w, h.h).found, false);
});
test("auto capture: steady green countdown fires once per hand; motion restarts; re-armed after 1.5 s off green; manual any time", () => {
  const sh = PV.createAutoShutter({ countMs: 2400 });
  let t = 0, fired = 0;
  const step = (ok, moved) => { t += 100; if (sh.feed({ ok, moved: !!moved, now: t }).fire) fired++; };
  for (let i = 0; i < 10; i++) step(true);
  step(true, true); // movement restarts the count
  for (let i = 0; i < 20; i++) step(true);
  assert.equal(fired, 0, "fired before a full steady count after movement");
  for (let i = 0; i < 10; i++) step(true);
  assert.equal(fired, 1);
  for (let i = 0; i < 40; i++) step(true);
  assert.equal(fired, 1, "fires once per hand");
  for (let i = 0; i < 10; i++) step(false); // 1.0 s off green: not re-armed yet
  for (let i = 0; i < 30; i++) step(true);
  assert.equal(fired, 1, "re-armed too early");
  for (let i = 0; i < 16; i++) step(false); // 1.6 s off green
  for (let i = 0; i < 30; i++) step(true);
  assert.equal(fired, 2);
  const m = sh.manual({ ok: false });
  assert.equal(m.fire, true); assert.equal(m.beforeGreen, true);
  assert.equal(sh.manual({ ok: true }).beforeGreen, false);
});

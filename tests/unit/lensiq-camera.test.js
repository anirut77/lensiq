"use strict";
// node --test tests/unit — LQCam pure helpers + scheduler (no DOM).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../lensiq-camera.js");

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test("(8) mapSeatToImage", () => {
  assert.equal(C.mapSeatToImage("right", true), "imageLeft");
  assert.equal(C.mapSeatToImage("right"), "imageLeft");
  assert.equal(C.mapSeatToImage("left", true), "imageRight");
  assert.equal(C.mapSeatToImage("right", false), "imageRight");
  assert.equal(C.mapSeatToImage("left", false), "imageLeft");
  assert.equal(C.mapSeatToImage("auto", true), "largest");
});

test("(9) pickNext fairness: equal weights ±1, weight 2 ~2x, disabled skipped", () => {
  const r = rng(3);
  const run = (spec, ticks = 300) => {
    const E = spec.map(([key, weight, enabled = true]) => ({ key, weight, enabled, vt: 0, n: 0 }));
    for (let i = 0; i < ticks; i++) {
      const k = C.pickNext(E); const e = E.find(x => x.key === k);
      const ms = 5 + r() * 200; void ms; // random cost must not skew turns
      e.vt += 1 / e.weight; e.n++;
    }
    return Object.fromEntries(E.map(e => [e.key, e.n]));
  };
  const eq = run([["c1", 1], ["c2", 1], ["c3", 1], ["c4", 1]]);
  const v = Object.values(eq); assert.ok(Math.max(...v) - Math.min(...v) <= 1, JSON.stringify(eq));
  const w = run([["c1", 2], ["c2", 1]]);
  assert.ok(Math.abs(w.c1 - 2 * w.c2) <= 2, JSON.stringify(w));
  const d = run([["c1", 1], ["c2", 1, false], ["c3", 1]]);
  assert.equal(d.c2, 0); assert.ok(Math.abs(d.c1 - d.c3) <= 1);
  assert.equal(C.pickNext([]), null);
  assert.equal(C.pickNext([{ key: "b", vt: 1 }, { key: "a", vt: 1 }]), "a");
});

test("(9b) createScheduler: real loop gives equal turns with random-cost jobs", async () => {
  const r = rng(9), S = C.createScheduler({ targetHz: 400, maxBusy: 0.9 });
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  S.add("a", () => sleep(r() * 6)); S.add("b", () => sleep(r() * 6)); S.add("x", () => sleep(1));
  S.setEnabled("x", false);
  S.start(); await sleep(400); S.stop();
  const st = S.stats();
  assert.ok(st.a.n > 5, JSON.stringify(st));
  assert.ok(Math.abs(st.a.n - st.b.n) <= 1, JSON.stringify(st));
  assert.equal(st.x.n, 0);
});

test("(10) fallbackChain order; no deviceId step without deviceId", () => {
  const ch = C.fallbackChain({ deviceId: "d1", facing: "environment", ideal: { width: 640, height: 480 }, frameRate: 15 });
  const ideal = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } };
  assert.deepEqual(ch, [{ deviceId: { exact: "d1" }, ...ideal }, { facingMode: { ideal: "environment" }, ...ideal }, { ...ideal }, true]);
  const ch2 = C.fallbackChain({ facing: "user", ideal: { width: 1280, height: 720 } });
  assert.equal(ch2.length, 3);
  assert.ok(ch2.every(s => s === true || !("deviceId" in s)));
  assert.deepEqual(ch2[0], { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } });
  assert.deepEqual(C.fallbackChain({}), [true]);
});

test("fallbackChain with an ideal LADDER: highest size first; a chosen device at EVERY rung first, then each rung facing -> plain, then true; one ideal is unchanged", () => {
  const ladder = [{ width: 3840, height: 2160 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }];
  const c = (w, h) => ({ width: { ideal: w }, height: { ideal: h } });
  assert.deepEqual(C.fallbackChain({ facing: "environment", ideal: ladder }), [
    { facingMode: { ideal: "environment" }, ...c(3840, 2160) }, c(3840, 2160),
    { facingMode: { ideal: "environment" }, ...c(1920, 1080) }, c(1920, 1080),
    { facingMode: { ideal: "environment" }, ...c(1280, 720) }, c(1280, 720), true]);
  const withDev = C.fallbackChain({ deviceId: "d1", facing: "environment", ideal: ladder });
  assert.equal(withDev.length, 10);
  // review S3: the chosen camera is walked down the whole ladder before any step that could open ANOTHER camera
  assert.deepEqual(withDev, [
    { deviceId: { exact: "d1" }, ...c(3840, 2160) }, { deviceId: { exact: "d1" }, ...c(1920, 1080) }, { deviceId: { exact: "d1" }, ...c(1280, 720) },
    { facingMode: { ideal: "environment" }, ...c(3840, 2160) }, c(3840, 2160),
    { facingMode: { ideal: "environment" }, ...c(1920, 1080) }, c(1920, 1080),
    { facingMode: { ideal: "environment" }, ...c(1280, 720) }, c(1280, 720), true]);
  const firstOther = withDev.findIndex(s => s === true || !s.deviceId);
  assert.equal(firstOther, 3); assert.ok(withDev.slice(0, firstOther).every(s => s.deviceId.exact === "d1") && withDev.slice(firstOther).every(s => s === true || !s.deviceId));
  assert.deepEqual(withDev.slice(firstOther), C.fallbackChain({ facing: "environment", ideal: ladder }), "after the chosen device: the chain of a page without a chosen device, as before");
  assert.deepEqual(C.fallbackChain({ deviceId: "d1", ideal: ladder, frameRate: 15 }).slice(0, 3).map(s => [s.deviceId.exact, s.width.ideal, s.frameRate.ideal]),
    [["d1", 3840, 15], ["d1", 1920, 15], ["d1", 1280, 15]]);
  assert.deepEqual(C.fallbackChain({ ideal: ladder }), [c(3840, 2160), c(1920, 1080), c(1280, 720), true]);
  // entries without a size are dropped; an empty ladder is "no ideal"
  assert.deepEqual(C.fallbackChain({ ideal: [null, { width: 1920, height: 1080 }, { width: 0, height: 5 }] }), [c(1920, 1080), true]);
  assert.deepEqual(C.fallbackChain({ ideal: [] }), [true]);
  // a one-rung ladder equals the plain ideal (every other page)
  assert.deepEqual(C.fallbackChain({ facing: "user", ideal: [{ width: 1280, height: 720 }] }), C.fallbackChain({ facing: "user", ideal: { width: 1280, height: 720 } }));
  // lowerRungLeft: a camera that cannot START at a size ("busy") moves down only while a lower size is left
  const steps = C.fallbackChain({ facing: "environment", ideal: ladder });
  assert.deepEqual(steps.map((s, i) => C.lowerRungLeft(steps, i)), [true, true, true, true, false, false, false]);
  const one = C.fallbackChain({ facing: "user", ideal: { width: 1280, height: 720 } });
  assert.deepEqual(one.map((s, i) => C.lowerRungLeft(one, i)), [false, false, false], "pages with one ideal behave as before");
});

test("single-resolution callers (every other page) get exactly the chain they had before the ladder: device, facing, plain, true", () => {
  // the literal chains of the pre-ladder implementation, for every combination of deviceId / facing / ideal / frameRate
  const old = ({ deviceId, facing, ideal, frameRate } = {}) => {
    const base = {};
    if (ideal && ideal.width) base.width = { ideal: ideal.width };
    if (ideal && ideal.height) base.height = { ideal: ideal.height };
    if (frameRate) base.frameRate = { ideal: frameRate };
    const steps = [];
    if (deviceId) steps.push({ deviceId: { exact: deviceId }, ...base });
    if (facing) steps.push({ facingMode: { ideal: facing }, ...base });
    if (Object.keys(base).length) steps.push({ ...base });
    steps.push(true);
    return steps;
  };
  let n = 0;
  for (const deviceId of [undefined, "", "cam-A"]) for (const facing of [undefined, "user", "environment"])
    for (const ideal of [undefined, null, { width: 1280, height: 720 }, { width: 640, height: 480 }, { width: 1920 }])
    for (const frameRate of [undefined, 15, 30]) {
      const o = { deviceId, facing, ideal, frameRate };
      assert.deepEqual(C.fallbackChain(o), old(o), JSON.stringify(o)); n++;
    }
  assert.equal(n, 135);
  assert.deepEqual(C.fallbackChain({ deviceId: "cam-A", facing: "user", ideal: { width: 1280, height: 720 } }), [
    { deviceId: { exact: "cam-A" }, width: { ideal: 1280 }, height: { ideal: 720 } }, { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { width: { ideal: 1280 }, height: { ideal: 720 } }, true]);
  // no page other than exam-hall passes a ladder (an array) as `ideal`
  const fs = require("node:fs"), path = require("node:path"), root = path.join(__dirname, "..", "..");
  const users = fs.readdirSync(root).filter(f => /\.js$/.test(f) && /ideal:\s*(\[|SC\.ladder)/.test(fs.readFileSync(path.join(root, f), "utf8")));
  assert.deepEqual(users, ["exam-hall.js"]);
});

test("errorKind / errorText", () => {
  const e = name => Object.assign(new Error(name), { name });
  assert.equal(C.errorKind(e("NotAllowedError")), "denied");
  assert.equal(C.errorKind(e("NotReadableError")), "busy");
  assert.equal(C.errorKind(e("NotFoundError")), "notfound");
  assert.equal(C.errorKind(e("OverconstrainedError")), "overconstrained");
  assert.equal(C.errorKind(e("Insecure")), "insecure");
  assert.equal(C.errorKind(null), "unknown");
  for (const n of ["NotAllowedError", "NotReadableError", "Insecure", "Weird", "CapacityError", "DuplicateCamera"]) assert.match(C.errorText(e(n)), /[฀-๿]/);
});

test("(11) parseCams tolerates garbage; serialize round-trip; nextSlot null at 4", () => {
  for (const g of [null, undefined, "", "{", "[1,2]", "42", '{"cams":"x"}', { cams: [null, 5, { slot: "c9" }] }]) assert.deepEqual(C.parseCams(g), { v: 1, cams: [] });
  const st = C.parseCams(JSON.stringify({ v: 1, cams: [{ slot: "c2", deviceId: "b", label: "B", name: "ประตู", role: "in" }, { slot: "c1", deviceId: "a", label: 7 }, { slot: "c2", deviceId: "dup" }] }));
  assert.deepEqual(st.cams.map(c => c.slot), ["c1", "c2"]);
  assert.equal(st.cams[0].label, "");
  assert.equal(st.cams[1].deviceId, "b");
  assert.deepEqual(C.parseCams(C.serializeCams(st)), st);
  assert.equal(C.nextSlot([]), "c1");
  assert.equal(C.nextSlot([{ slot: "c1" }, { slot: "c3" }]), "c2");
  assert.equal(C.nextSlot(["c1", "c2", "c3", "c4"].map(slot => ({ slot }))), null);
});

test("capacity key is decrease-only", () => {
  const m = new Map(), s = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.equal(C.readCapacity(s), null);
  assert.equal(C.writeCapacity(s, 2, 1), 2);
  assert.equal(C.writeCapacity(s, 3, 2), 2);
  assert.equal(C.writeCapacity(s, 1, 3), 1);
  assert.deepEqual(JSON.parse(m.get("lq-camcap")), { v: 1, maxLive: 1, at: 3 });
});

test("capacity record expires after 7 days (re-probe after a new camera / browser update)", () => {
  const m = new Map(), s = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  const t0 = 1e12;
  C.writeCapacity(s, 1, t0);
  assert.equal(C.readCapacity(s, t0 + 6 * 864e5), 1);
  assert.equal(C.readCapacity(s, t0 + 8 * 864e5), null);
  assert.equal(C.writeCapacity(s, 2, t0 + 8 * 864e5), 2, "an expired limit does not cap a new proof");
});

test("camera picker and camera errors: Thai, English and Chinese for every key; pages with the run-time translator keep the Thai text they had", () => {
  const fs = require("node:fs"), path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "lensiq-camera.js"), "utf8");
  const obj = name => { const m = new RegExp("const " + name + " = (\\{[\\s\\S]*?\\n? *\\});").exec(src); assert.ok(m, name); return Function("return (" + m[1] + ")")(); };
  const TH = /[\u0E00-\u0E7F]/, ph = t => (t.match(/\{\w+\}/g) || []).sort().join();
  for (const [th, en, zh] of [["ERR_TH", "ERR_EN", "ERR_ZH"], ["UI_TH", "UI_EN", "UI_ZH"]]) {
    const T = obj(th), E = obj(en), Z = obj(zh);
    assert.deepEqual(Object.keys(E).sort(), Object.keys(T).sort(), en); assert.deepEqual(Object.keys(Z).sort(), Object.keys(T).sort(), zh);
    for (const k of Object.keys(T)) {
      assert.ok(TH.test(T[k]), th + "." + k); assert.ok(!TH.test(E[k]) && E[k].length > 3, en + "." + k); assert.ok(!TH.test(Z[k]) && /[\u4E00-\u9FFF]/.test(Z[k]), zh + "." + k);
      assert.equal(ph(E[k]), ph(T[k]), en + "." + k + " placeholders"); assert.equal(ph(Z[k]), ph(T[k]), zh + "." + k + " placeholders");
    }
  }
  // no Thai literal is left in the picker markup; the labels are redone on a language switch
  assert.doesNotMatch(src, /textContent = facing === "environment" \? "ใช้กล้องหน้า"/); assert.doesNotMatch(src, /aria-label="เลือกกล้อง"/);
  assert.match(src, /on\(root, "lq-lang", \(\) => \{ if \(uis\.length && !root\.LQI18N_RTX\) labelUis\(\); \}\);/);
  assert.match(src, /!\(rt && \(ns === "cam\.ui\." \|\| String\(I\.lang\) === "en"\)\)/);
  // Node (no window / no LQI18N): Thai, as before
  assert.equal(C.errorText(Object.assign(new Error("x"), { name: "NotFoundError" })), "ไม่พบกล้องในเครื่องนี้");
  assert.equal(C.errorText(Object.assign(new Error("x"), { name: "CapacityError", max: 2 })), "อุปกรณ์นี้เปิดกล้องพร้อมกันได้สูงสุด 2 ตัว — มือถือส่วนใหญ่เปิดได้ทีละกล้อง ใช้ 1 เครื่องต่อ 1 จุด");
});

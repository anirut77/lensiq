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

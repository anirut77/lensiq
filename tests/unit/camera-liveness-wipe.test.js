"use strict";
// node --test tests/unit/camera-liveness-wipe.test.js — round 11 camera-page additions: optional liveness challenge
// (LQTrack.liveCues / createLiveness), device-wide biometric wipe and the auto-expiry list (LQVault.wipeAll /
// expiringSoon), the commercial build profile (lensiq-config.js LENSIQ_PROFILE), the driver page relabel and its
// non-dismissable calibration warning, and the IP-camera guide on cameras.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const T = require("../../lensiq-track.js");
const V = require("../../lensiq-facevault.js");

const root = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

/** 68 landmark points of a frontal face; yaw shifts the nose tip (30) between the outer eye corners; open = eye height */
function face({ yaw = 0, open = 1 } = {}) {
  const pts = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
  const eye = (o, x0) => {
    const w = 30, h = 6 * open;
    pts[o] = { x: x0, y: 100 }; pts[o + 3] = { x: x0 + w, y: 100 };
    pts[o + 1] = { x: x0 + 10, y: 100 - h }; pts[o + 2] = { x: x0 + 20, y: 100 - h };
    pts[o + 4] = { x: x0 + 20, y: 100 + h }; pts[o + 5] = { x: x0 + 10, y: 100 + h };
  };
  eye(36, 40); eye(42, 110); // outer corners 36 (x 40) and 45 (x 140)
  pts[30] = { x: 90 + yaw * 50, y: 140 };
  return pts;
}

test("liveCues: signed yaw and eye aspect ratio from 68 points", () => {
  const c = T.liveCues(face());
  assert.ok(Math.abs(c.yaw) < 1e-9);
  assert.ok(Math.abs(c.ear - 0.4) < 1e-9, "EAR = (12 + 12) / (2 × 30)");
  assert.ok(T.liveCues(face({ yaw: 0.4 })).yaw > 0.35 && T.liveCues(face({ yaw: -0.4 })).yaw < -0.35);
  assert.ok(T.liveCues(face({ open: 0.5 })).ear < c.ear);
  assert.equal(T.liveCues(null), null); assert.equal(T.liveCues([]), null);
});

test("createLiveness: a still photo never passes; a small head turn (or a blink) does, within the window", () => {
  const L = T.createLiveness({ windowMs: 8000, turn: 0.3 });
  for (let t = 0; t < 20000; t += 400) assert.equal(L.step("p1", T.liveCues(face({ yaw: 0.02 * Math.sin(t) })), t), "wait", "photo jitter at " + t);
  assert.equal(L.isLive("p1"), false);
  const yaws = [0, -0.1, -0.2, -0.05, 0.1, 0.15];
  let st; yaws.forEach((y, i) => { st = L.step("p2", T.liveCues(face({ yaw: y })), i * 400); });
  assert.equal(st, "live"); assert.ok(L.isLive("p2"));
  // the turn must happen inside the window
  const W = T.createLiveness({ windowMs: 2000, turn: 0.3 });
  W.step("p", T.liveCues(face({ yaw: -0.2 })), 0); W.step("p", T.liveCues(face({ yaw: -0.2 })), 100);
  assert.equal(W.step("p", T.liveCues(face({ yaw: 0.15 })), 5000), "wait", "old sample dropped");
  // a clear blink also counts; no cues (fake detections without landmarks) never does
  const B = T.createLiveness({ blinkDrop: 0.18 });
  [1, 1, 0.5, 1].forEach((o, i) => B.step("b", T.liveCues(face({ open: o })), i * 300));
  assert.ok(B.isLive("b"));
  const N = T.createLiveness();
  for (let t = 0; t < 5000; t += 400) N.step("n", null, t);
  assert.equal(N.isLive("n"), false);
  // reset / prune
  L.reset("p2"); assert.equal(L.isLive("p2"), false);
  assert.deepEqual(L.prune(100000), ["p1"]);
});

test("attendance wires the liveness option off by default and gates both automatic and confirmed check-ins", () => {
  const js = read("attendance.js"), html = read("attendance.html");
  assert.match(js, /liveness: false/);
  assert.match(js, /&& !live\) \{ waitLive\.add\(p\.id\); return \{ f, kind: "pending"/);
  assert.match(js, /settings\.liveness && !liveGate\.isLive\(id\)/, "the confirm button also needs the head turn");
  assert.match(html, /<input type="checkbox" id="liveness">/);
  assert.ok(!/id="liveness" checked/.test(html));
});

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m }; };
const keyStore = () => { const m = new Map(); return { get: async id => m.get(id) || null, add: async (id, v) => { if (m.has(id)) throw new Error("ConstraintError"); m.set(id, v); }, del: async id => { m.delete(id); }, clear: async () => m.clear(), m }; };
const D = v => Array.from({ length: 128 }, (_, i) => +(Math.sin(i * v) * 0.1).toFixed(5));

test("LQVault.wipeAll: every lqv-* envelope, the attendance enrolments and every key are gone; shop data stays", async () => {
  const ks = keyStore(); V._setKeyStore(ks); V._reset();
  const ls = mem();
  await V.splitSave("att-people", "lqv-att-faces", [{ id: "a", name: "A", descriptor: D(1) }], "descriptor", ls);
  await V.splitSave("cx-members", "lqv-cx-faces", [{ id: "m", name: "M", descriptor: D(2) }], "descriptor", ls);
  await V.write("lqv-other", { v: 1, faces: {} }, ls);
  ls.setItem("att-logs", "[1]"); ls.setItem("cx-orders", "[2]");
  assert.ok(ks.m.size >= 3);
  const gone = await V.wipeAll(ls);
  assert.ok(gone.includes("lqv-att-faces") && gone.includes("lqv-cx-faces") && gone.includes("lqv-other"));
  for (const k of ["lqv-att-faces", "lqv-cx-faces", "lqv-other", "att-people"]) assert.equal(ls.getItem(k), null, k);
  assert.equal(ks.m.size, 0, "all keys deleted");
  assert.equal(ls.getItem("att-logs"), "[1]"); assert.equal(ls.getItem("cx-orders"), "[2]");
  assert.ok(ls.getItem("cx-members"), "members (no face values) stay");
  // a later load finds no faces and writes fresh keys
  const r = await V.splitLoad("cx-members", "lqv-cx-faces", "descriptor", ls);
  assert.ok(r.records.every(x => !x.descriptor));
});

test("LQVault.expiringSoon lists face records that expire within the window, soonest first", () => {
  const DAY = V.DAY, now = 1000 * DAY;
  const recs = [
    { id: "old", descriptor: [1], lastSeen: now - 400 * DAY }, // already expired: not "soon"
    { id: "a", descriptor: [1], lastSeen: now - 350 * DAY },   // 15 days left
    { id: "b", descriptor: [1], created: now - 360 * DAY },    // 5 days left
    { id: "c", descriptor: [1], lastSeen: now - 10 * DAY },    // far
    { id: "x", lastSeen: now - 360 * DAY }                     // no face data
  ];
  assert.deepEqual(V.expiringSoon(recs, 365, 30, now), [{ id: "b", daysLeft: 5 }, { id: "a", daysLeft: 15 }]);
  assert.deepEqual(V.expiringSoon(recs, 0, 30, now), []);
});

test("customers and attendance show the expiry banner and the device-wide wipe", () => {
  for (const p of ["customers", "attendance"]) {
    const html = read(p + ".html"), js = read(p + ".js");
    assert.match(html, /id="expiryBanner" role="status" hidden/, p);
    assert.match(html, new RegExp(`id="wipeAllBio"[^>]*data-i18n="${p}\\.wipeall"`), p);
    assert.match(js, /LQVault\.wipeAll\(\)/, p); assert.match(js, /LQVault\.expiringSoon\(/, p);
    assert.match(js, /\$\("#wipeFaces"\)\.onclick/, p + ": the per-page face wipe is kept");
    for (const l of ["en", "zh"]) assert.match(read(`i18n/${l}-${p}.js`), new RegExp(`"${p}\\.wipeall"`), l);
  }
});

function runConfig(pre) {
  const win = { ...pre };
  vm.runInNewContext(read("lensiq-config.js"), { window: win, document: undefined, location: { pathname: "/x.html" } });
  return win;
}
test("LENSIQ_PROFILE: commercial forces age/gender and BiSeNet off; demo keeps the defaults", () => {
  const demo = runConfig({});
  assert.equal(demo.LENSIQ_PROFILE, "demo"); assert.equal(demo.LENSIQ_AGE_GENDER, true); assert.equal(demo.LENSIQ_FACEPARSE, false);
  const com = runConfig({ LENSIQ_PROFILE: "commercial", LENSIQ_AGE_GENDER: true, LENSIQ_FACEPARSE: true });
  assert.equal(com.LENSIQ_PROFILE, "commercial"); assert.equal(com.LENSIQ_AGE_GENDER, false); assert.equal(com.LENSIQ_FACEPARSE, false);
  assert.equal(runConfig({ LENSIQ_PROFILE: "anything" }).LENSIQ_PROFILE, "demo");
  assert.equal(runConfig({ LENSIQ_AGE_GENDER: false }).LENSIQ_AGE_GENDER, false, "explicit opt-out still works in demo");
});

test("driver page: relabelled as an awareness aid, measured figures before the trip, warning without a close button", () => {
  const html = read("driver.html"), js = read("driver.js");
  assert.match(html, /<h1 data-i18n="driver\.s2">เครื่องช่วยเตือนการหลับตา \(ไม่ใช่อุปกรณ์ความปลอดภัย\)<\/h1>/);
  const form = html.slice(html.indexOf('<form id="tripForm"'), html.indexOf("</form>"));
  assert.ok(form.indexOf('data-i18n="driver.accstart"') > 0 && form.indexOf('data-i18n="driver.accstart"') < form.indexOf('type="submit"'), "figures shown before the start button");
  const warn = html.match(/<div class="cal-warn" id="calWarn" role="alert" hidden>([\s\S]*?)<\/div>/);
  assert.ok(warn, "calibration warning box");
  assert.ok(!/<button/.test(warn[1]), "no dismiss button");
  assert.match(js, /setCalWarn\(!c\.ok \? "fail" : c\.eyeThr == null \? "ear" : ""\)/);
  for (const l of ["en", "zh"]) { const d = read(`i18n/${l}-driver.js`); assert.match(d, /"driver\.calwarn\.t"/); assert.match(d, /"driver\.s2"/); }
  assert.match(read("i18n/en-driver.js"), /"driver\.s2": "Eyes-closed awareness aid \(not a safety device\)"/);
});

test("cameras.html: IP cameras are offered only through a virtual-webcam tool, with a guide", () => {
  const html = read("cameras.html");
  assert.ok(!html.includes("กล้อง IP (ผ่านคอมพิวเตอร์หน้างาน)"));
  assert.match(html, /<section class="group" id="ipcam"/);
  assert.match(html, /OBS/); assert.match(html, /go2rtc/);
  assert.match(html, /ยังไม่รับสัญญาณ RTSP หรือ ONVIF โดยตรง/);
  const en = read("i18n/en-cameras.js");
  assert.ok(!en.includes("IP cameras (via an on-site computer)"));
  for (const k of ["cameras.ip.h", "cameras.ip.p1", "cameras.ip.o2", "cameras.ip.g1", "cameras.ip.n1", "cameras.ip.n2"]) {
    assert.match(html, new RegExp(`data-i18n="${k.replace(/\./g, "\\.")}"`), k);
    for (const l of ["en", "zh"]) assert.match(read(`i18n/${l}-cameras.js`), new RegExp(`"${k.replace(/\./g, "\\.")}"`), l + " " + k);
  }
});

"use strict";
// node --test tests/unit/camera-unattended.test.js — unattended camera operation and install guards (round 12):
// hidden-tab gaps (LQCam.createGapLog / sampleSec, LQSite.noteGap), per-camera quality and clean resume in store.js,
// short-session "collect more minutes" in the on-site check, the per-driver readiness gate, the persisted commercial
// profile, the operator acknowledgement before face recognition / age-gender, and their TH/EN/ZH run-time strings.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const C = require("../../lensiq-camera.js");
const S = require("../../lensiq-sitecheck.js");
const ST = require("../../store.js");
const DR = require("../../driver.js");

const root = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const at = (h, m = 0, s = 0) => new Date(2026, 10, 8, h, m, s).getTime();

test("createGapLog: hide/show gives {from, to, ms}; repeated hide keeps the first time; short gaps are ignored; capped", () => {
  const g = C.createGapLog({ max: 3 });
  assert.equal(g.show(1000), null, "nothing open");
  g.hide(10000); g.hide(15000);
  assert.deepEqual(g.show(70000), { from: 10000, to: 70000, ms: 60000 });
  g.hide(80000); assert.equal(g.show(80500), null, "under minMs");
  for (let i = 0; i < 5; i++) { g.hide(100000 + i * 10000); g.show(105000 + i * 10000); }
  assert.equal(g.gaps.length, 3);
  g.hide(200000); assert.equal(g.totalMs(210000), 3 * 5000 + 10000);
});

test("sampleSec: real elapsed seconds between health samples; first sample / long pause -> 1 s", () => {
  assert.equal(C.sampleSec(0, 5000), 1);
  assert.equal(C.sampleSec(1000, 2000), 1);
  assert.equal(C.sampleSec(1000, 4500), 3.5, "a throttled loop counts its real time");
  assert.equal(C.sampleSec(1000, 60000), 1, "a pause longer than the cap is recorded as a gap instead");
  assert.equal(C.sampleSec(2000, 1000), 1);
});

test("noteGap: a hidden period is split over the hours it spans as offline seconds and flags the hour", () => {
  const q = {};
  assert.equal(S.noteGap(q, at(9, 50), at(10, 20)), 1800);
  assert.equal(q[9].offline, 600); assert.equal(q[9].n, 600);
  assert.equal(q[10].offline, 1200);
  assert.deepEqual(S.flaggedHours(q).map(f => f.h), [9, 10]);
  // only the calendar day of `to` is kept (q is one day's buckets)
  const q2 = {}; S.noteGap(q2, at(0, 0) - 600000, at(0, 5));
  assert.deepEqual(Object.keys(q2), ["0"]); assert.equal(q2[0].offline, 300);
  assert.equal(S.noteGap(q2, 5, 5), 0); assert.equal(S.noteGap(null, 1, 2), 0);
});

test("noteQuality with real seconds: a throttled 1-Hz loop (one sample per 60 s) still reaches the 5-minute flag", () => {
  const q = {}; let prev = 0;
  for (let t = at(14); t < at(14, 6); t += 5000) { S.noteQuality(q, t, ["darkBad"], { sec: C.sampleSec(prev, t) }); prev = t; }
  assert.ok(q[14].dark >= 300, "dark " + q[14].dark);
  assert.equal(S.flaggedHours(q).length, 1);
});

test("sitecheck: a 2-minute check with 60 perfect crossings now says how many more minutes to run", () => {
  const truth = Array.from({ length: 60 }, (_, i) => ({ t: i * 2000, dir: i % 2 ? "out" : "in" }));
  const sys = truth.map(e => ({ t: e.t + 300, dir: e.dir }));
  const rep = S.countReport(sys, truth);
  assert.notEqual(rep.verdict, "pass");
  assert.ok(rep.need.some(x => x.group === "minutes" && x.more >= 1), JSON.stringify(rep.need));
  assert.ok(rep.recs.some(r => /ตรวจต่ออีกอย่างน้อย \d+ นาที/.test(r)), rep.recs.join("\n"));
  assert.ok(rep.short && rep.short.moreMin >= 1);
  assert.ok(S.needList(rep).some(x => /เวลาตรวจ \(อีกราว \d+ นาที\)/.test(x)));
  // very short (< 3 blocks): no interval at all, still a next step
  const t2 = truth.slice(0, 15).map(e => ({ t: e.t / 4, dir: e.dir })), s2 = t2.map(e => ({ ...e }));
  const r2 = S.countReport(s2, t2);
  assert.equal(r2.netCI, null);
  assert.ok(r2.need.some(x => x.group === "minutes"));
  // booth visitors use the same notes
  const rb = S.visitorReport(sys.map(e => ({ t: e.t })), truth.map(e => ({ t: e.t })));
  assert.ok(rb.need.some(x => x.group === "minutes"));
});

test("sitecheck: hidden time during a check is reported (analysis paused)", () => {
  const truth = Array.from({ length: 60 }, (_, i) => ({ t: i * 20000, dir: "in" }));
  const rep = S.countReport(truth, truth, { stats: { hiddenMs: 42000 } });
  assert.equal(rep.hiddenMs, 42000);
  assert.ok(rep.recs.some(r => /แท็บถูกซ่อนหรือจอดับรวม 42 วินาที/.test(r)));
  assert.ok(!S.countReport(truth, truth, { stats: { hiddenMs: 0 } }).recs.some(r => /แท็บถูกซ่อน/.test(r)));
});

test("store: per-camera quality names the camera at fault; the combined day.quality is kept", () => {
  const d = ST.newDay("2026-11-08");
  d.byCam = { c1: { name: "ประตูหน้า", in: 0, out: 0 }, c2: { name: "ประตูหลัง", in: 0, out: 0 } };
  d.quality = {}; d.qualityCam = { c1: {}, c2: {} };
  S.noteGap(d.qualityCam.c2, at(11, 0), at(11, 10)); S.noteGap(d.quality, at(11, 0), at(11, 10));
  S.noteQuality(d.qualityCam.c1, at(11, 30), [], { sec: 1 });
  assert.deepEqual(ST.qualityCams(d, 11), ["ประตูหลัง"]);
  assert.ok(ST.hourQuality(d, 11));
  assert.deepEqual(ST.qualityCams(d, 12), []);
  assert.deepEqual(ST.qualityCams(ST.newDay("2026-11-08"), 11), [], "older days without qualityCam");
});

test("store: resumePipe after a hidden gap drops stale tracks (no phantom crossing) and keeps counts", () => {
  const cam = { slot: "c1", role: "door", line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, zones: [] };
  const box = x => ({ x, y: 0.3, w: 0.1, h: 0.4, score: 0.9 });
  const run = resume => {
    const pipe = ST.newPipe(), day = ST.newDay("2026-11-08");
    let t = 1000;
    for (let i = 0; i < 5; i++) { ST.stepCam(pipe, cam, day, [box(0.38 + i * 0.01)], t); t += 100; }
    if (resume) { ST.resumePipe(pipe, day); assert.equal(pipe.tracker.tracks.length, 0); }
    // 20 minutes hidden, then a different person stands just across the line
    t += 20 * 60000;
    for (let i = 0; i < 3; i++) { ST.stepCam(pipe, cam, day, [box(0.55)], t); t += 100; }
    return day.in + day.out;
  };
  assert.equal(run(false), 1, "without the resume step the stale track bridges the gap and counts a crossing");
  assert.equal(run(true), 0);
});

test("driver readiness: 'ready' only after a prompted check caught ≥ 70% of ≥ 8 prompts within 30 days", () => {
  const now = Date.now();
  assert.equal(DR.driverReadiness(null).state, "unverified");
  assert.equal(DR.driverReadiness({ at: now, hits: 3, prompts: 4 }, now).state, "incomplete");
  assert.equal(DR.driverReadiness({ at: now, hits: 5, prompts: 8 }, now).state, "low");
  assert.equal(DR.driverReadiness({ at: now, hits: 6, prompts: 8 }, now).state, "ok");
  assert.equal(DR.driverReadiness({ at: now - 31 * 86400000, hits: 8, prompts: 8 }, now).state, "stale");
  assert.equal(DR.driverKey("  Somchai   K "), "somchai k");
  const js = read("driver.js"), html = read("driver.html");
  assert.match(html, /id="drReady" role="status" hidden/);
  assert.match(html, /data-i18n="driver\.accstart2"/);
  assert.match(js, /noteReady\(rep\)/, "the prompted check records readiness");
});

function runConfig(pre, store) {
  const win = { ...pre };
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  vm.runInNewContext(read("lensiq-config.js"), { window: win, localStorage: ls, document: undefined, location: { pathname: "/store.html" } });
  return win;
}
test("commercial profile persisted per device: lq-profile=commercial turns research models off; never the reverse", () => {
  const com = runConfig({ LENSIQ_PROFILE: "demo", LENSIQ_AGE_GENDER: true }, { "lq-profile": "commercial" });
  assert.equal(com.LENSIQ_PROFILE, "commercial"); assert.equal(com.LENSIQ_AGE_GENDER, false); assert.equal(com.LENSIQ_FACEPARSE, false);
  // round 16: customer mode is the default; the research demo toggle is the only per-device way back to demo
  assert.equal(runConfig({}, {}).LENSIQ_PROFILE, "commercial");
  assert.equal(runConfig({}, { "lq-research-demo": "on" }).LENSIQ_PROFILE, "demo");
  assert.equal(runConfig({ LENSIQ_PROFILE: "commercial" }, { "lq-profile": "demo" }).LENSIQ_PROFILE, "commercial");
  const html = read("cameras.html");
  assert.match(html, /<section class="group" id="profile"/); assert.match(html, /data-lq-research="cameras"/);
  assert.match(html, /<script src="lensiq-research\.js[^"]*"><\/script>/);
  assert.match(read("lensiq-config.js"), /lqDemoBanner/);
});

test("operator acknowledgement before booth recognition / signage age-gender, logged in the exports", () => {
  const b = read("booth.js"), s = read("signage.js");
  assert.match(b, /prefs\.ackAt = new Date\(\)\.toISOString\(\)/); assert.match(b, /consentAckAt: prefs\.ackAt \|\| null/);
  assert.match(b, /modeSel\.value === "recognise" && countOnly\(\)/, "switching to recognise waits for the acknowledgement");
  assert.match(s, /settings\.ackAt = new Date\(\)\.toISOString\(\)/); assert.match(s, /noticeAckAt: settings\.ackAt \|\| null/);
});

test("every unattended page wires LQCam.unattended, and every new run-time Thai string has en + zh", () => {
  for (const p of ["store", "booth", "signage", "driver", "qc", "attendance"]) {
    assert.match(read(p + ".js"), /LQCam\.unattended\(/, p);
    assert.match(read(p + ".html"), /<div id="uaBox"><\/div>/, p);
  }
  const rt = {};
  for (const l of ["en", "zh"]) {
    const win = {}; vm.runInNewContext(read(`i18n/${l}-rt-sitecheck.js`), { window: win });
    rt[l] = Object.assign({}, ...win.LQI18N_RT);
  }
  const src = ["lensiq-camera.js", "lensiq-sitecheck.js", "booth.js", "signage.js", "driver.js", "qc.js", "attendance.js"].map(read).join("\n");
  const keys = [...src.matchAll(/"((?:แท็บถูกซ่อน|เบราว์เซอร์นี้กันจอดับ|การตรวจสั้นเกินไป|ระหว่างตรวจ แท็บ|ยืนยัน|ก่อนเปิด|ผ่านการทดสอบกับคนขับ|ยังไม่พร้อมช่วยเตือน|ยังไม่ได้ทดสอบกับคนขับ|ผลทดสอบของคนขับ|เริ่มเที่ยวแล้ว — ยังไม่ได้ยืนยัน)(?:[^"\\]|\\.){8,})"/g)].map(m => JSON.parse(`"${m[1]}"`));
  assert.ok(keys.length >= 20, "found " + keys.length);
  for (const k of keys) for (const l of ["en", "zh"]) assert.ok(rt[l][k] && !/[฀-๿]/.test(rt[l][k]), `${l}: ${k}`);
});

"use strict";
// node --test tests/unit — interview-core.js (Structured Interview Kit): rating aggregation, sheet exchange, energy VAD,
// head-orientation metrics, practice tips; plus 中文 key coverage for interview.html / interview.js / content.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const IV = require("../../interview-core.js");
const ROOT = path.join(__dirname, "..", "..");

test("content: every role uses known competencies; every competency has questions and 1/3/5 anchors", () => {
  for (const [id, r] of Object.entries(IV.ROLES)) {
    if (id === "custom") { assert.equal(r.comps.length, 0); continue; }
    assert.ok(r.comps.length >= 4 && r.comps.length <= 6, id);
    for (const c of r.comps) assert.ok(IV.COMPETENCIES[c], `${id}: ${c}`);
  }
  for (const [id, c] of Object.entries(IV.COMPETENCIES)) for (const f of ["name", "def", "beh", "sit", "a1", "a3", "a5"]) assert.ok(c[f] && c[f].length > 3, `${id}.${f}`);
  assert.ok(IV.LAW.length >= 10 && IV.LAW.some(l => l.id === "pregnancy") && IV.LAW.some(l => l.id === "religion") && IV.LAW.some(l => l.id === "age") && IV.LAW.some(l => l.id === "marital"));
  assert.ok(IV.BIASES.some(b => b.id === "halo") && IV.BIASES.some(b => b.id === "similar") && IV.BIASES.some(b => b.id === "first"));
});

test("aggregate: mean / median / range / sd and agreement bands per competency", () => {
  const sheets = [
    { who: "A", scores: { comm: 4, team: 2, plan: 5, detail: 3 }, notes: { comm: "explained a refund policy with an example", plan: "" } },
    { who: "B", scores: { comm: 5, team: 4, plan: 1, detail: null }, notes: { team: "mediated a shift swap" } },
    { who: "C", scores: { comm: 4, team: 3, plan: 4 }, notes: {} }
  ];
  const A = IV.aggregate(sheets, ["comm", "team", "plan", "detail", "drive"]);
  const by = Object.fromEntries(A.comps.map(c => [c.id, c]));
  assert.deepEqual([by.comm.n, by.comm.mean, by.comm.median, by.comm.range, by.comm.agree], [3, 4.33, 4, 1, "high"]);
  assert.equal(by.comm.sd, 0.58);
  assert.deepEqual([by.team.mean, by.team.range, by.team.agree], [3, 2, "some"]);
  assert.deepEqual([by.plan.range, by.plan.agree], [4, "low"]);
  assert.deepEqual([by.detail.n, by.detail.agree], [1, null], "one rater -> no agreement claim");
  assert.deepEqual([by.drive.n, by.drive.mean], [0, null]);
  assert.equal(by.comm.scores.find(r => r.who === "A").note, "explained a refund policy with an example");
  assert.ok(by.team.scores.some(r => r.who === "B" && r.note === "mediated a shift swap"));
  assert.deepEqual(A.strengths, ["comm"]);
  assert.deepEqual(A.develop, []);
  assert.deepEqual(A.discuss, ["plan"], "a 1-vs-5 split goes to discussion, not to strengths/development");
  assert.equal(A.overall.rated, 4);
  assert.equal(A.overall.agreePct, 33, "1 of 3 multi-rater competencies within 1 point");
  assert.equal(A.overall.mean, IV.aggregate(sheets, ["comm", "team", "plan", "detail"]).overall.mean);
});

test("aggregate: invalid scores are ignored; development needs agreement; empty input is safe", () => {
  const A = IV.aggregate([{ who: "A", scores: { comm: 2, team: 7, plan: 2.5 } }, { who: "B", scores: { comm: 2, team: "5", plan: 0 } }], ["comm", "team", "plan"]);
  const by = Object.fromEntries(A.comps.map(c => [c.id, c]));
  assert.deepEqual([by.comm.mean, by.comm.agree], [2, "high"]);
  assert.equal(by.team.n, 0); assert.equal(by.plan.n, 0);
  assert.deepEqual(A.develop, ["comm"]);
  const E = IV.aggregate([], ["comm"]);
  assert.deepEqual([E.overall.n, E.overall.mean, E.overall.agreePct, E.strengths.length], [0, null, null, 0]);
});

test("exportSheet / importSheet round trip, validation and clamping", () => {
  const s = { who: "Khun A", scores: { comm: 4, team: 9, plan: null }, notes: { comm: " gave a STAR example ", team: "" } };
  const txt = IV.exportSheet(s, { role: "sales" });
  const o = JSON.parse(txt);
  assert.deepEqual(o.scores, { comm: 4 }); assert.deepEqual(o.notes, { comm: "gave a STAR example" });
  assert.ok(!/candidate|cand/i.test(Object.keys(o).join()), "no candidate field");
  const back = IV.importSheet(txt, ["comm", "team"]);
  assert.deepEqual(back, { who: "Khun A", scores: { comm: 4 }, notes: { comm: "gave a STAR example" } });
  assert.throws(() => IV.importSheet("{not json"), /bad-json/);
  assert.throws(() => IV.importSheet(JSON.stringify({ kind: "x", v: 1 })), /bad-kind/);
  assert.throws(() => IV.importSheet(JSON.stringify({ kind: "lensiq-interview-sheet", v: 1, who: "  " })), /no-who/);
  const evil = IV.importSheet(JSON.stringify({ kind: "lensiq-interview-sheet", v: 1, who: "<b>x</b>", scores: { comm: 3, zzz: 5 }, notes: { comm: "n" } }), ["comm"]);
  assert.equal(evil.who, "bx/b"); assert.deepEqual(evil.scores, { comm: 3 });
});

/* synthetic energy track: frames every 20 ms; speech = syllable-like bursts at `rate` per second */
function track(parts) {
  const out = []; let t = 0;
  for (const [kind, ms, rate] of parts) {
    const t0 = t;
    for (const end = t + ms; t < end; t += 20) {
      if (kind === "sil") out.push([-68 + ((t / 20) % 3), t]);
      else { const ph = (((t - t0) / 1000) * rate) % 1; out.push([-40 + 14 * Math.sin(Math.PI * ph), t]); }
    }
  }
  return out;
}
test("createVad: speaking share, pauses, long pauses and syllable-like rate on a synthetic track", () => {
  const v = IV.createVad();
  const parts = [["sil", 2000]];
  for (let i = 0; i < 5; i++) parts.push(["sp", 1500, 4], ["sil", 800]);
  parts.push(["sil", 1700], ["sp", 2000, 4], ["sil", 500]);
  for (const [db, t] of track(parts)) v.push(db, t);
  const r = v.result();
  const speech = 5 * 1500 + 2000, total = r.ms;
  assert.ok(Math.abs(r.speechMs - speech) < 600, "speech ms " + r.speechMs);
  assert.ok(Math.abs(r.share - speech / total) < 0.04, "share " + r.share);
  assert.equal(r.segments, 6);
  assert.equal(r.pauses, 5, "five gaps ≥ 0.5 s between segments");
  assert.equal(r.longPauses, 1, "one 2.5 s gap");
  assert.ok(r.peakRate > 3.2 && r.peakRate < 4.6, "≈ 4 bursts per second: " + r.peakRate);
  assert.ok(r.meanPauseMs > 700 && r.meanPauseMs < 1400, "mean pause " + r.meanPauseMs);
});
test("createVad: steady noise is not speech; noise floor adapts to a louder room; reset clears", () => {
  const v = IV.createVad();
  for (let t = 0; t < 10000; t += 20) v.push(-45 + (t % 60 === 0 ? 1 : 0), t); // loud fan, no speech
  const r = v.result();
  assert.ok(r.speechMs < 400, "steady noise counted as speech: " + r.speechMs);
  assert.equal(r.peakRate, null, "no rate without ≥ 3 s of speech");
  v.reset(); assert.equal(v.result().ms, 0);
  for (const [db, t] of track([["sil", 1000], ["sp", 4000, 3], ["sil", 1000]])) v.push(db + 5, t); // same speech in a noisier room
  const q = v.result();
  assert.ok(q.speechMs > 3400 && q.speechMs < 4600 && q.segments === 1, JSON.stringify(q));
});
test("rmsDb: silence floor and full-scale sine", () => {
  assert.equal(IV.rmsDb(new Float32Array(512)), -120);
  const s = new Float32Array(1024).map((_, i) => Math.sin(i / 5));
  assert.ok(Math.abs(IV.rmsDb(s) + 3.01) < 0.1);
});

test("poseOf + gazeMetrics: face visible %, toward camera %, movement band", () => {
  const box = { x: 200, y: 120, w: 200, h: 240 };
  const front = IV.poseOf(IV.synthPts(box, 0)), side = IV.poseOf(IV.synthPts(box, 0.7));
  assert.ok(Math.abs(front.yaw) < 0.02 && side.yaw > 0.3, JSON.stringify([front, side]));
  assert.equal(IV.poseOf([[0, 0]]), null);
  const S = [];
  for (let i = 0; i < 40; i++) {
    const t = i * 250;
    if (i % 10 === 9) { S.push({ t, face: false }); continue; }               // 4 frames without a face
    const p = IV.poseOf(IV.synthPts({ x: 200 + (i % 2), y: 120, w: 200, h: 240 }, i >= 27 ? 0.7 : 0)); // 11 of 36 face frames turned away
    S.push({ t, face: true, ...p });
  }
  const g = IV.gazeMetrics(S);
  assert.equal(g.n, 40); assert.equal(g.facePct, 90);
  assert.equal(g.towardPct, Math.round(25 / 36 * 100));
  assert.equal(g.movementBand, "low", "1 px jitter on a 200 px face: " + g.movement);
  const moving = Array.from({ length: 20 }, (_, i) => ({ t: i * 250, face: true, yaw: 0, pitch: 0.4, cx: 300 + (i % 2) * 60, cy: 200, ipd: 70 }));
  assert.equal(IV.gazeMetrics(moving).movementBand, "high");
  assert.deepEqual(IV.gazeMetrics([]), { n: 0, facePct: 0, towardPct: 0, movement: null, movementBand: null });
});

test("practiceTips: descriptive coaching only, keyed for translation", () => {
  const ids = t => t.map(x => x.id);
  const d = { ms: 60000, share: 0.2, pauses: 6, longPauses: 4, meanRunMs: 3000, peakRate: 7.2 };
  const g = { n: 100, facePct: 95, towardPct: 30, movementBand: "high" };
  assert.deepEqual(ids(IV.practiceTips(d, g)), ["lookCam", "steady", "more", "longPause", "slow"]);
  assert.deepEqual(ids(IV.practiceTips({ ms: 60000, share: 0.7, pauses: 3, longPauses: 0, meanRunMs: 8000, peakRate: 4 }, { n: 50, facePct: 98, towardPct: 80, movementBand: "low" })), ["lookOk", "pauseOk"]);
  assert.deepEqual(ids(IV.practiceTips({ ms: 3000 }, { n: 2 })), ["short"]);
  const html = fs.readFileSync(path.join(ROOT, "interview.js"), "utf8");
  for (const id of ["frame", "lookCam", "lookOk", "steady", "more", "longPause", "pauseOk", "breathe", "slow", "short"]) assert.match(html, new RegExp(`\\b${id}: "`), "Thai tip text for " + id);
});

test("中文: every key used by interview.html / interview.js / content has a Chinese entry; no emotion/deception labels; no 'AI' in labels", () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "i18n/zh-interview.js"), "utf8"), ctx);
  const zh = Object.assign({}, ...ctx.window.LQI18N_Q.map(e => e.zh));
  const html = fs.readFileSync(path.join(ROOT, "interview.html"), "utf8"), js = fs.readFileSync(path.join(ROOT, "interview.js"), "utf8");
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) keys.add(p.split(":")[1]);
  for (const m of js.matchAll(/\bT\("([a-z][\w.]+)"/g)) if (!m[1].endsWith(".")) keys.add(m[1]);
  for (const id of IV.COMP_IDS) for (const f of ["name", "def", "beh", "sit", "a1", "a3", "a5"]) keys.add(`iv.c.${id}.${f}`);
  for (const id of Object.keys(IV.ROLES)) keys.add("iv.r." + id);
  for (const p of IV.STAR_PROBES) keys.add("iv.star." + p.id);
  for (const b of IV.BIASES) { keys.add(`iv.bias.${b.id}.name`); keys.add(`iv.bias.${b.id}.tip`); }
  for (const l of IV.LAW) for (const f of ["topic", "alt", "ref"]) keys.add(`iv.law.${l.id}.${f}`);
  for (const id of ["frame", "lookCam", "lookOk", "steady", "more", "longPause", "pauseOk", "breathe", "slow", "short"]) keys.add("iv.tip." + id);
  const missing = [...keys].filter(k => !(k in zh));
  assert.deepEqual(missing, []);
  for (const [k, v] of Object.entries(zh)) assert.ok(!/[฀-๿]/.test(v), "Thai left in zh " + k);
  // placeholders match between Thai defaults in interview.js and zh
  for (const m of js.matchAll(/\bT\("([a-z][\w.]+)", "([^"]*)"/g)) {
    const ph = s => [...s.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort().join();
    assert.equal(ph(zh[m[1]] || ""), ph(m[2]), "placeholders " + m[1]);
  }
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  assert.ok(!/\bAI\b/.test(visible.replace(/AI Act/g, "")), "the word AI used as a label");
  // the page must never offer emotion / honesty / personality labels as outputs
  const outputs = js + JSON.stringify(IV.practiceTips({ ms: 60000, share: 0.1, pauses: 0, longPauses: 5, meanRunMs: 30000, peakRate: 9 }, { n: 99, facePct: 10, towardPct: 10, movementBand: "high" }));
  for (const w of ["ประหม่า", "โกรธ", "โกหก", "ซื่อสัตย์", "nervous", "honest", "deceptive", "angry"]) assert.ok(!outputs.includes(w), "label " + w);
});

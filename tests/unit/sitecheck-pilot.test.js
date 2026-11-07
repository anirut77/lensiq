"use strict";
// node --test tests/unit/sitecheck-pilot.test.js — round 11 "pilot grade" (ระดับนำร่อง) in lensiq-sitecheck.js: relaxed
// targets on a 90% interval with one-day sample sizes, reported next to (never instead of) the strict CI-aware verdict.
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../lensiq-sitecheck.js");

const qcRows = (good, bad, fr = 0, miss = 0) => {
  const rows = [];
  for (let i = 0; i < good; i++) rows.push({ truth: "good", pass: i >= fr, reasons: i < fr ? ["capColor"] : [], v: {} });
  for (let i = 0; i < bad; i++) rows.push({ truth: "bad", pass: i < miss, reasons: i < miss ? [] : ["capColor"], v: {} });
  return rows;
};

test("pilot targets are relaxed versions of the strict targets, with one-day minimum samples", () => {
  const T = S.TARGETS, P = S.PILOT;
  assert.ok(P.store.netErr > T.store.netErr && P.store.precision < T.store.precision && P.store.minTruth <= 100);
  assert.ok(P.attendance.memberRecognised < T.attendance.memberRecognised && P.attendance.strangerAutoMax > T.attendance.strangerAutoMax);
  assert.ok(P.driver.sensitivity < T.driver.sensitivity && P.driver.falsePerHour > T.driver.falsePerHour);
  assert.ok(P.qc.falseReject > T.qc.falseReject && P.qc.minGood + P.qc.minBad <= 60, "QC pilot fits in one shift");
  assert.ok(P.booth && P.signage && P.customers);
});

test("evaluator case: 50 crossings, 44 matched, 7 false -> strict 'ontrack', pilot grade passes", () => {
  const truth = [], sys = [];
  for (let i = 0; i < 50; i++) { const t = 10000 + i * 20000; truth.push({ t, dir: "in" }); if (i < 44) sys.push({ t: t - 500, dir: "in" }); }
  for (let i = 0; i < 7; i++) sys.push({ t: 24000 + i * 130000, dir: "in" });
  const r = S.countReport(sys, truth);
  assert.equal(r.verdict, "ontrack", "the strict verdict is unchanged");
  assert.equal(r.pilot.verdict, "pass", JSON.stringify(r.pilot));
  assert.equal(r.pilot.level, 0.9);
  // a heavy overcount is a pilot fail too
  const over = sys.concat(Array.from({ length: 40 }, (_, i) => ({ t: 30000 + i * 25000, dir: "in" })));
  assert.equal(S.countReport(over, truth).pilot.verdict, "fail");
});

test("QC: 30 good + 25 bad without errors passes the pilot grade; 30 + 10 says how many more bad bottles", () => {
  const ok = S.qcReport(qcRows(30, 25), {});
  assert.equal(ok.verdict, "ontrack"); assert.equal(ok.pilot.verdict, "pass");
  const short = S.qcReport(qcRows(30, 10), {});
  assert.equal(short.pilot.verdict, "ontrack");
  const more = short.pilot.need.find(x => x.group === "bad").more;
  assert.ok(more >= 13 && more <= 20, "0/n bad needs n ≈ 25 for a 90% upper bound ≤ 10%: more " + more);
  assert.ok(!short.pilot.need.find(x => x.group === "good"), "30 good bottles already clear the pilot bound");
  // 3 of 30 good bottles rejected: a 10% point estimate cannot clear a 10% pilot target
  assert.notEqual(S.qcReport(qcRows(30, 25, 3), {}).pilot.verdict, "pass");
});

test("attendance: 0 of 30 strangers passes the pilot grade; any automatic wrong check-in fails both", () => {
  const mem = Array.from({ length: 25 }, (_, i) => ({ truth: "p" + (i % 5), outcome: i < 22 ? "auto" : i < 24 ? "ask" : "none", label: i < 24 ? "p" + (i % 5) : null }));
  const str = Array.from({ length: 30 }, (_, i) => ({ truth: "stranger", sid: i, outcome: "none", label: null }));
  const r = S.attendanceReport([...mem, ...str]);
  assert.equal(r.verdict, "ontrack"); assert.equal(r.pilot.verdict, "pass", JSON.stringify(r.pilot));
  const bad = S.attendanceReport([...mem, { truth: "stranger", sid: 99, outcome: "auto", label: "p2" }, ...str]);
  assert.equal(bad.verdict, "fail"); assert.equal(bad.pilot.verdict, "fail");
  const few = S.attendanceReport([...mem, ...str.slice(0, 20)]);
  assert.notEqual(few.pilot.verdict, "pass", "20 strangers are below the pilot minimum of 30");
  assert.ok(few.pilot.need.some(x => x.group === "strangers"));
  // customers uses the same rule and its own groups
  const cx = S.attendanceReport([...mem, ...str], { kind: "customers" });
  assert.equal(cx.pilot.verdict, "pass"); assert.ok(cx.pilot.targets.minStrangers === 30);
});

test("pilot helpers: Poisson rate bound and Wilson on the effective sample", () => {
  // 0 false alarms in 1 hour: 90% one-sided upper bound 2.30 / hour ≤ 3 -> sure
  const c = S.pilotRate(0, 1, 3, "openMin");
  assert.ok(Math.abs(c.hi - 2.303) < 0.01, "Poisson 0 at 80% two-sided = 2.303: " + c.hi);
  assert.ok(c.sure(c.lo, c.hi));
  const short = S.pilotRate(0, 0.5, 3, "openMin");
  assert.ok(!short.sure(short.lo, short.hi) && short.need().more > 0, "30 min is not enough");
  const w = S.wilson(24, 25), p1 = S.pilotProp(w, 0.75, ">=", "members"), p4 = S.pilotProp(w, 0.75, ">=", "members", 4);
  assert.ok(p4.lo < p1.lo, "a design effect widens the pilot interval");
});

test("renderReport shows the pilot line under the strict verdict; history keeps the pilot verdict", () => {
  const r = S.qcReport(qcRows(30, 25), {});
  const el = { innerHTML: "" };
  S.renderReport(el, r);
  assert.match(el.innerHTML, /class="sc-verdict" data-v="ontrack"/);
  assert.match(el.innerHTML, /class="sc-pilot" data-v="pass"/);
  assert.ok(el.innerHTML.indexOf("sc-verdict") < el.innerHTML.indexOf("sc-pilot"));
  assert.ok(el.innerHTML.includes(S.PILOT_TH.pass));
  const store = new Map();
  global.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    const h = S.history("qc-sitecheck");
    h.add({ at: 1, verdict: r.verdict, provisional: r.provisional, pilot: r.pilot.verdict, need: r.need, cam: "QC", summary: "x" });
    const ul = { innerHTML: "" }; h.render(ul);
    assert.match(ul.innerHTML, /sc-pilot-b/);
    const latest = S.latestByCamera(global.localStorage);
    assert.equal(latest[0].pilot, "pass");
  } finally { delete global.localStorage; }
});

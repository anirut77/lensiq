"use strict";
// tests/unit/gate-rules.test.js — gate-rules.js (LENSIQ Gate): parking fee rules (free minutes, round-up, grace, first
// unit rate, daily cap per 24 h, overnight crossings, lost ticket, monthly pass, shop stamps), entry/exit pairing with
// look-alike plates, occupancy, offline shop validation codes, end-of-shift reconciliation, village access decisions
// (deny first, auto-open only for exact allow-listed plates above the owner's thresholds), visitor passes, overstay,
// and the relay request builder (Shelly Gen2 RPC / webhook).
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../gate-rules.js");

const MIN = 60000, T0 = new Date(2026, 10, 8, 9, 0, 0).getTime();
const at = m => T0 + m * MIN;

test("fee: first N minutes free, then charged from minute 0, hourly round-up", () => {
  const rules = { freeMin: 15, rate: 20, unitMin: 60, dailyCap: 0 };
  assert.equal(R.fee(T0, at(15), rules).fee, 0);
  assert.equal(R.fee(T0, at(15), rules).rule, "free");
  assert.equal(R.fee(T0, at(16), rules).fee, 20);
  assert.equal(R.fee(T0, at(60), rules).fee, 20);
  assert.equal(R.fee(T0, at(61), rules).fee, 40);
  assert.equal(R.fee(T0, at(61), { ...rules, freeDeduct: true }).fee, 20, "free minutes deducted");
  assert.equal(R.fee(T0, at(70), { ...rules, graceMin: 10 }).fee, 20, "10 min grace into the next hour");
  assert.equal(R.fee(T0, at(71), { ...rules, graceMin: 10 }).fee, 40);
  assert.equal(R.fee(T0, at(150), { ...rules, firstRate: 0, rate: 30 }).fee, 60, "first hour free-rate, then 30/h");
  assert.equal(R.fee(T0, T0 + 30 * 1000, rules).minutes, 1, "seconds round up to a minute");
});

test("fee: daily cap per 24 h block, overnight crossings, discount stamps, never negative", () => {
  const rules = { freeMin: 0, rate: 30, unitMin: 60, dailyCap: 200 };
  const d1 = R.fee(T0, at(10 * 60), rules);
  assert.equal(d1.fee, 200); assert.equal(d1.capped, true);
  assert.equal(R.fee(T0, at(24 * 60 + 60), rules).fee, 230, "day 2: one more hour");
  const night = { ...rules, overnightAt: "02:00", overnightFee: 100 };
  const n = R.fee(T0, new Date(2026, 10, 10, 8, 0).getTime(), night); // Sun 09:00 -> Tue 08:00 passes 02:00 twice
  assert.equal(n.nights, 2);
  assert.equal(n.fee, 200 + 200 + 100 * 2);
  assert.equal(R.crossings(new Date(2026, 0, 1, 1, 0).getTime(), new Date(2026, 0, 1, 2, 0).getTime(), "02:00"), 1, "exactly at 02:00");
  assert.equal(R.crossings(new Date(2026, 0, 1, 2, 0).getTime(), new Date(2026, 0, 1, 3, 0).getTime(), "02:00"), 0);
  assert.equal(R.fee(T0, at(90), rules, { stamps: [{ discount: 25 }] }).fee, 35);
  assert.equal(R.fee(T0, at(90), rules, { stamps: [{ discount: 500 }] }).fee, 0);
});

test("fee: shop stamp minutes, monthly pass, lost ticket / unmatched exit", () => {
  const rules = { freeMin: 15, rate: 20, unitMin: 60, lostFee: 300, dailyCap: 0 };
  assert.equal(R.fee(T0, at(120), rules, { stamps: [{ freeMin: 120 }] }).fee, 0, "2 h stamp covers 2 h");
  assert.equal(R.fee(T0, at(200), rules, { stamps: [{ freeMin: 120 }] }).fee, 40, "80 min left -> 2 h");
  assert.equal(R.fee(T0, at(200), rules, { stamps: [{ freeMin: 60 }, { freeMin: 60 }] }).fee, 40, "stamps add up");
  const p = R.fee(T0, at(600), rules, { pass: true });
  assert.equal(p.fee, 0); assert.equal(p.rule, "pass");
  const l = R.fee(0, at(10), rules);
  assert.equal(l.fee, 300); assert.equal(l.rule, "lost");
  assert.equal(R.fee(T0, at(10), rules, { lost: true }).rule, "lost");
});

test("pair + occupancy: exact plate first, then look-alike; paired entries leave the lot", () => {
  const ev = [{ id: "a", dir: "in", key: "กข1234", province: "bangkok", at: at(0) }, { id: "b", dir: "in", key: "ขค99", at: at(5) },
    { id: "c", dir: "in", key: "กข1234", province: "bangkok", at: at(10) }];
  assert.equal(R.occupancy(ev).length, 3);
  const p = R.pair(ev, "กข1234");
  assert.equal(p.entry.id, "c"); assert.equal(p.dist, 0); assert.equal(p.alternatives.length, 1, "duplicate open entry shown");
  const f = R.pair(ev, "กช1234");
  assert.equal(f.entry.id, "c"); assert.equal(f.dist, 0.5, "look-alike ข/ช");
  assert.equal(R.pair(ev, "พพ1").entry, null);
  ev.push({ id: "d", dir: "out", key: "กข1234", at: at(30), pairedWith: "c" });
  assert.deepEqual(R.occupancy(ev).map(e => e.id), ["b", "a"]);
});

test("stamps: offline validation codes check shop, key and single use", () => {
  const shops = [{ id: "A1", name: "Cafe", freeMin: 60 }, { id: "B2", name: "Old", active: false }];
  const code = R.stampMake("s3cret", "A1", 42);
  assert.match(code, /^A1-[2-9A-Z]{4}-[2-9A-Z]{2}$/);
  assert.equal(R.stampCheck("s3cret", code.toLowerCase(), shops, new Set()).ok, true, "case-insensitive");
  assert.equal(R.stampCheck("other", code, shops).why, "check");
  assert.equal(R.stampCheck("s3cret", code, shops, new Set([code])).why, "used");
  assert.equal(R.stampCheck("s3cret", R.stampMake("s3cret", "B2", 1), shops).why, "shop", "inactive shop");
  assert.equal(R.stampCheck("s3cret", "nonsense", shops).why, "format");
  const many = new Set(Array.from({ length: 500 }, (_, i) => R.stampMake("k", "A1", i)));
  assert.equal(many.size, 500, "serials give distinct codes");
});

test("reconcile: cash vs drawer (with float), PromptPay, exempt, stamps, lost", () => {
  const pays = [{ method: "cash", amount: 40 }, { method: "cash", amount: 20, stamps: 1 }, { method: "promptpay", amount: 60 },
    { method: "exempt", amount: 0, rule: "free" }, { method: "pass", amount: 0, rule: "pass" }, { method: "cash", amount: 200, rule: "lost" }];
  const r = R.reconcile(pays, { float: 500, counted: 750 });
  assert.equal(r.cash, 260); assert.equal(r.promptpay, 60); assert.equal(r.total, 320); assert.equal(r.expectedCash, 760);
  assert.equal(r.diff, -10); assert.equal(r.exempt, 2); assert.equal(r.stamps, 1); assert.equal(r.lost, 1); assert.equal(r.n, 6);
  assert.equal(R.reconcile([], {}).diff, null);
});

test("decide: deny list wins; resident auto-open only when enabled, exact, confident and agreed", () => {
  const residents = [{ house: "12/3", plates: [{ key: "กข1234", province: "bangkok" }] }];
  const deny = [{ key: "ผผ666", why: "banned" }];
  const passes = [{ code: "V-AAA", house: "7", key: "ขข55", from: at(0), to: at(120), uses: 1, used: 0 }];
  const read = (key, conf = 0.97, agree = 1, province = "") => ({ key, conf, agree, province });
  assert.equal(R.decide(read("ผผ666"), { residents, deny }).status, "deny");
  assert.equal(R.decide(read("ฝผ666"), { residents, deny }).status, "deny", "look-alike still denied");
  let d = R.decide(read("กข1234"), { residents, deny });
  assert.equal(d.status, "resident"); assert.equal(d.house, "12/3"); assert.equal(d.auto, false, "auto-open off by default");
  const on = { on: true, minConf: 0.95, minAgree: 0.8 };
  assert.equal(R.decide(read("กข1234"), { residents, autoOpen: on }).auto, true);
  assert.equal(R.decide(read("กข1234", 0.9), { residents, autoOpen: on }).auto, false, "below confidence");
  assert.equal(R.decide(read("กข1234", 0.99, 0.5), { residents, autoOpen: on }).auto, false, "frames disagree");
  assert.equal(R.decide(read("กช1234"), { residents, autoOpen: on }).auto, false, "look-alike never auto-opens");
  assert.equal(R.decide(read("กข1234", 0.99, 1, "chonburi"), { residents, autoOpen: on }).status, "unknown", "other province");
  assert.equal(R.decide(read("กข1234", 0.91), { residents, autoOpen: { on: true, minConf: 0.5 } }).auto, true, "threshold floor is 0.9");
  assert.equal(R.decide(read("กข1234", 0.89), { residents, autoOpen: { on: true, minConf: 0.5 } }).auto, false);
  assert.equal(R.decide(read("ผผ666", 1), { residents: [{ house: "x", plates: [{ key: "ผผ666" }] }], deny, autoOpen: on }).status, "deny");
  d = R.decide(read("ขข55"), { passes, now: at(30) });
  assert.equal(d.status, "visitor"); assert.equal(d.house, "7"); assert.equal(d.auto, false, "visitors wait for the guard");
  assert.equal(R.decide(read("ขข55"), { passes, now: at(200) }).status, "expired");
  assert.equal(R.decide(read("งง1"), { residents, passes }).status, "unknown");
});

test("passes: code format, validity window, use count; overstay alert", () => {
  let i = 0; const rnd = () => ((i++ * 7) % 31) / 31;
  const p = R.passMake({ house: "9", plate: "1กข 99", from: at(0), to: at(60), uses: 2 }, rnd);
  assert.match(p.code, /^V-[2-9A-Z]{6}$/); assert.equal(p.key, "1กข99");
  assert.equal(R.passValid(p, at(30)), true); assert.equal(R.passValid(p, at(61)), false); assert.equal(R.passValid(p, at(-1)), false);
  assert.equal(R.passValid({ ...p, used: 2 }, at(30)), false); assert.equal(R.passValid({ ...p, revoked: true }, at(30)), false);
  assert.equal(R.passValid({ ...p, uses: 0, used: 9 }, at(30)), true, "0 = unlimited uses");
  const ev = [{ pass: p.code, dir: "in", at: at(10) }];
  assert.equal(R.overstays([p], ev, at(70)).length, 0, "within grace");
  const o = R.overstays([p], ev, at(90));
  assert.equal(o.length, 1); assert.equal(o[0].overMin, 30);
  assert.equal(R.overstays([p], ev.concat({ pass: p.code, dir: "out", at: at(80) }), at(200)).length, 0);
});

test("relayRequest: Shelly Gen2 GET / RPC, webhook with token; bad URLs refused", () => {
  const g = R.relayRequest({ kind: "shelly-get", url: "http://192.168.1.50/", channel: 1, pulseSec: 2 });
  assert.deepEqual(g, { url: "http://192.168.1.50/rpc/Switch.Set?id=1&on=true&toggle_after=2", method: "GET", headers: {}, body: null });
  const r = R.relayRequest({ kind: "shelly-rpc", url: "http://10.0.0.9" });
  assert.equal(r.url, "http://10.0.0.9/rpc"); assert.deepEqual(JSON.parse(r.body), { id: 1, method: "Switch.Set", params: { id: 0, on: true, toggle_after: 1 } });
  const w = R.relayRequest({ kind: "webhook", url: "/relay/open", token: "t" }, { gate: "Main", reason: "auto", at: 0 });
  assert.equal(w.method, "POST"); assert.equal(w.headers.Authorization, "Bearer t");
  assert.deepEqual(JSON.parse(w.body), { event: "gate.open", gate: "Main", reason: "auto", at: "1970-01-01T00:00:00.000Z" });
  assert.equal(R.relayRequest({ kind: "webhook", url: "javascript:alert(1)" }), null);
  assert.equal(R.relayRequest({ kind: "shelly-get", url: "" }), null);
});

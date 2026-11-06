"use strict";
// node --test tests/unit — lensiq-agg.js (multi-device aggregate packs): schema allowlist, packFromDay, mergeDay,
// cache upsert/server merge, and insights.js integration (existing totals unchanged without nodes).
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../lensiq-agg.js");
const S = require("../../store.js");
const I = require("../../insights.js");

const DATE = "2026-11-06";
const hours = (h, n) => Array.from({ length: 24 }, (_, i) => (i === h ? n : 0));
function dayWith(inN, outN, h = 10) {
  const d = S.newDay(DATE);
  d.in = inN; d.out = outN; d.occ = Math.max(0, inN - outN); d.peak = d.occ; d.maxQueue = 2;
  d.hourly.in = hours(h, inN); d.hourly.out = hours(h + 1, outN);
  d.byCam = { c1: { name: "กล้อง 1", in: inN, out: outN } };
  d.zones = { "c1:z1": { name: "ชั้นวาง", visits: 3, dwellSum: 12000, dwellN: 3, peak: 2 } };
  return d;
}
const packOf = (inN, outN, node, name, h) => A.packFromDay(dayWith(inN, outN, h), name, node, 1762400000000);

test("packFromDay produces a pack that passes cleanPack and holds numbers + short names only", () => {
  const d = dayWith(5, 2);
  d.zones["bad key"] = { name: "x" }; d.byCam.c9 = { name: "x", in: 1, out: 1 };
  d.zones["c1:z2"] = { name: "ย".repeat(80), visits: 1, dwellSum: 0, dwellN: 0, peak: 0 };
  const p = A.packFromDay(d, "  ประตู\nหน้า <script> ", "nabcdefgh12345");
  const r = A.cleanPack(p);
  assert.ok(r.ok, r.error);
  assert.equal(p.name, "ประตู หน้า script");
  assert.equal(p.node, "nabcdefgh12345");
  assert.deepEqual(Object.keys(p.zones).sort(), ["c1:z1", "c1:z2"]);
  assert.equal(p.zones["c1:z2"].name.length, 40);
  assert.deepEqual(Object.keys(p.byCam), ["c1"]);
  const allowed = new Set(["v", "format", "node", "name", "date", "in", "out", "occ", "peak", "peakAt", "maxQueue", "t", "hourlyIn", "hourlyOut", "zones", "byCam"]);
  for (const k of Object.keys(p)) assert.ok(allowed.has(k), k);
  assert.ok(!/data:image|descriptor|box/i.test(JSON.stringify(p)));
});

test("cleanPack rejects unknown keys, strings for numbers, out-of-range values and oversize data", () => {
  const ok = packOf(1, 0, "nabcdefgh1", "A");
  const bad = [
    { ...ok, image: "data:image/png;base64,AA" }, { ...ok, descriptor: [0.1] }, { ...ok, in: "1" }, { ...ok, in: -1 },
    { ...ok, in: 1e8 }, { ...ok, in: NaN }, { ...ok, in: true }, { ...ok, v: 2 }, { ...ok, format: "x" }, { ...ok, date: "2026-13-45x" },
    { ...ok, name: "" }, { ...ok, name: "x".repeat(41) }, { ...ok, name: 3 }, { ...ok, node: "bad" },
    { ...ok, hourlyIn: [1, 2] }, { ...ok, zones: { "c1:z1": { name: "a", box: 1 } } }, { ...ok, zones: { zz: { name: "a" } } },
    { ...ok, byCam: { c1: { name: "a", in: 0, out: 0, deviceId: "x" } } }, { ...ok, byCam: { c5: { name: "a" } } },
    { ...ok, zones: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`c1:z${i}`, { name: "a" }])) },
    [ok], null, "x"
  ];
  for (const b of bad) assert.equal(A.cleanPack(b).ok, false, JSON.stringify(b).slice(0, 100));
  assert.equal(A.cleanPack({ ...ok, name: "x".repeat(4000) }, { maxBytes: 1000 }).ok, false);
  const min = A.cleanPack({ v: 1, name: "B", date: DATE, in: 2, out: 1 });
  assert.ok(min.ok);
  assert.deepEqual(min.pack.hourlyIn, Array(24).fill(0));
  assert.deepEqual(min.pack.zones, {});
});

test("mergeDay sums devices, occupancy = Σin−Σout (cross-door), peak estimate >= each device", () => {
  const a = A.cleanPack(packOf(6, 0, "nnodeaaaaa1", "ประตูหน้า", 10)).pack;   // only entries
  const b = A.cleanPack(packOf(0, 4, "nnodebbbbb1", "ประตูหลัง", 12)).pack;   // only exits
  const M = A.mergeDay(null, [a, b]);
  assert.equal(M.in, 6); assert.equal(M.out, 4); assert.equal(M.occ, 2);
  assert.equal(M.rows.length, 2);
  assert.equal(M.peak, 6, "hourly cumulative estimate (6 in at 10:00, exits later)");
  assert.equal(M.hourlyIn[10], 6); assert.equal(M.hourlyOut[13], 4);
  // with the hub's own day
  const local = dayWith(3, 1, 9);
  const M2 = A.mergeDay(local, [a, b]);
  assert.equal(M2.in, 9); assert.equal(M2.out, 5); assert.equal(M2.rows[0].local, true);
  // no devices -> local only, same numbers as the day
  const M3 = A.mergeDay(local, []);
  assert.equal(M3.in, local.in); assert.equal(M3.peak, Math.max(local.peak, 3));
});

test("cache: hub data beats an older import, server merge drops revoked hub rows but keeps imports", () => {
  const a = A.cleanPack(packOf(2, 1, "nnodeaaaaa1", "A")).pack, b = A.cleanPack(packOf(1, 0, "nnodebbbbb1", "B")).pack;
  let c = A.cacheUpsert(null, { ...a, t: 200 }, "hub", 1000);
  c = A.cacheUpsert(c, { ...a, in: 99, t: 100 }, "import");
  assert.equal(c.nodes.nnodeaaaaa1.in, 2, "older import ignored");
  c = A.cacheUpsert(c, b, "import");
  assert.deepEqual(A.cachePacks(c, DATE).map(p => [p.node, p.src]), [["nnodeaaaaa1", "hub"], ["nnodebbbbb1", "import"]]);
  // server now returns nothing for A (revoked) -> A dropped, B (import) kept
  const c2 = A.cacheFromServer(c, []);
  assert.deepEqual(Object.keys(c2.nodes), ["nnodebbbbb1"]);
  // tampered cache entries are skipped
  c2.nodes.nnodeccccc1 = { ...b, node: "nnodeccccc1", in: "lots", src: "hub" };
  c2.nodes["../x"] = { ...b };
  assert.deepEqual(A.cachePacks(c2, DATE).map(p => p.node), ["nnodebbbbb1"]);
  assert.equal(A.cacheFromServer(null, [{ ...a, node: "nnodeaaaaa1", receivedAt: 5, evil: 1 }]), null, "invalid server row rejected");
});

test("normCode / newNodeId", () => {
  assert.equal(A.normCode(" abcd-efgh jkmn "), "ABCDEFGHJKMN");
  const id = A.newNodeId();
  assert.match(id, A.NODE_RE);
  assert.notEqual(A.newNodeId(), id);
});

const snapOf = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
const R = (D = {}) => I.iqRange("all", new Date(2026, 10, 6, 12).getTime(), D);

test("insights: no st-agg keys -> identical results; with nodes -> totals and per-device breakdown", () => {
  const local = dayWith(4, 3, 9);
  const base = snapOf({ ["st-day-" + DATE]: local });
  const D0 = I.iqCollect(base), M0 = I.iqMetrics(D0, R());
  assert.equal(M0.store.in, 4);
  assert.deepEqual(M0.store.byCam, { c1: { name: "กล้อง 1", in: 4, out: 3 } });
  assert.ok(I.iqIsModuleKey("st-agg-" + DATE), "st-agg is part of the module snapshot / backup");
  assert.ok(!I.iqIsModuleKey("lq-agg"), "pairing secrets (lq-agg) are never part of the snapshot / backup");

  const a = A.cleanPack(packOf(6, 0, "nnodeaaaaa1", "ประตูหน้า", 10)).pack, b = A.cleanPack(packOf(0, 4, "nnodebbbbb1", "ประตูหลัง", 12)).pack;
  let cache = A.cacheUpsert(null, a, "hub", 1); cache = A.cacheUpsert(cache, b, "import", 2);
  const D = I.iqCollect({ ...base, ["st-agg-" + DATE]: JSON.stringify(cache), ["st-agg-2026-11-05"]: JSON.stringify(A.cacheUpsert(null, { ...a, date: "2026-11-05" }, "hub")) });
  const M = I.iqMetrics(D, R(D));
  assert.equal(M.store.in, 4 + 6 + 6, "local + node A today + node A yesterday");
  assert.equal(D.store.length, 2, "a day that exists only on nodes is added");
  const today = D.store.find(d => d.day === DATE);
  assert.equal(today.in, 10); assert.equal(today.out, 7); assert.equal(today.nodes, 2);
  assert.deepEqual(Object.keys(today.byCam).sort(), ["c1", "n:nnodeaaaaa1", "n:nnodebbbbb1"]);
  assert.equal(today.zones["n:nnodeaaaaa1/c1:z1"].name, "ประตูหน้า · ชั้นวาง");
  assert.equal(Object.values(today.byCam).reduce((s, c) => s + c.in, 0), today.in, "breakdown sums to the total");
  const bars = I.iqModuleBars(D, R(), "store");
  assert.ok(bars.some(x => x.label === "ประตูหน้า") && bars.some(x => x.label === "กล้อง 1"));
  // legacy local day without byCam gets a "เครื่องหลัก" row so the breakdown still sums up
  const legacy = { ...local }; delete legacy.byCam;
  const DL = I.iqCollect({ ["st-day-" + DATE]: JSON.stringify(legacy), ["st-agg-" + DATE]: JSON.stringify(cache) });
  assert.equal(DL.store[0].byCam.local.in, 4);
  // garbage cache is ignored entirely
  const DG = I.iqCollect({ ...base, ["st-agg-" + DATE]: JSON.stringify({ v: 1, nodes: { nbadbadbad1: { in: "x" } } }) });
  assert.equal(I.iqMetrics(DG, R()).store.in, 4);
});

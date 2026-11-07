"use strict";
// tests/unit/studio-tables.test.js — ACCURACY.md §11 / §11b are reproducible from what is committed: the per-render gate logs
// (tests/bench/studio-gate-log-r10.json, photobooth-gate-log-r10.json) plus the label files, via tests/bench/studio-tables.mjs
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const B = f => path.join(__dirname, "..", "bench", f);
const load = () => import(path.join(__dirname, "..", "bench", "studio-tables.mjs"));

test("every §11/§11b count is recomputed from labels + logs and appears in ACCURACY.md", async () => {
  const T = await load(), ms = T.tables();
  assert.deepEqual(T.check(ms), []);
  const get = (sp, k) => ms.find(m => m.split === sp && m.key === k);
  // headline figures (round 10 page on unseen people; photo booth)
  assert.equal(`${get("test", "r10.newShown").k}/${get("test", "r10.newShown").n}`, "34/94");
  assert.equal(`${get("test", "r10.none").k}/${get("test", "r10.none").n}`, "7/35");
  assert.equal(`${get("test", "pb.none").k}/${get("test", "pb.none").n}`, "13/35");
});

test("interval method is pluggable and gets per-person rows (for a cluster bootstrap)", async () => {
  const T = await load(), seen = [];
  const ms = T.tables({ interval: rows => { seen.push(rows); return [0, 1]; } });
  assert.ok(seen.length > 20);
  assert.ok(seen.every(r => r.every(x => typeof x.id === "string" && (x.y === 0 || x.y === 1))));
  const m = ms.find(x => x.split === "test" && x.key === "r10.newShown");
  assert.ok(new Set(m.rows.map(r => r.id)).size < m.rows.length, "several renders per person");
  assert.deepEqual([m.lo, m.hi], [0, 1]);
});

test("gate logs carry no image data and cover every labelled render", () => {
  for (const f of ["studio-gate-log-r10.json", "photobooth-gate-log-r10.json"]) {
    const txt = fs.readFileSync(B(f), "utf8"), j = JSON.parse(txt);
    assert.ok(!/"(b64|crop|data|url|png|jpg)"\s*:/i.test(txt), f + " has an image-like field");
    assert.ok(!/[A-Za-z0-9+/]{200,}/.test(txt), f + " has a long base64-like run");
    assert.ok(Object.keys(j.people).length === 62 && j.renders.length > 100);
  }
  const s = JSON.parse(fs.readFileSync(B("studio-gate-log-r10.json"), "utf8")), L = JSON.parse(fs.readFileSync(B("studio-labels-r10.json"), "utf8")).labels;
  const have = new Set(s.renders.map(r => r.id + "|" + (r.g === "none" ? "none" : r.g + (r.v === "cover" ? "+cover" : ""))));
  for (const [id, l] of Object.entries(L)) for (const k of Object.keys(l)) assert.ok(have.has(id + "|" + k), "no log row for " + id + " " + k);
});

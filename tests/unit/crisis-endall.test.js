"use strict";
// tests/unit/crisis-endall.test.js — FIXED TEST SET "crisis-endall" (owner decision 105 ค, 2026-11-18: use BOTH "end it all"
// patterns together). Locked BEFORE the product change (evals-locks/crisis-endall.sha256). Input: the locked 24 + 24 synthetic set
// of crisis-v3-protect (end-it-all-set.json, sha256 8b62de1a…, repo copy tests/fixtures/crisis-endall/end-it-all-set.json,
// byte-identical; the copy's hash is checked here against the committed lock).
//   E1 every crisis sentence of the set caught by EITHER pattern alone (CUR = the line-48 pattern on main, PROP = the proposal
//      measured in crisis-v3-protect) is caught by the crisis net (fortune-crisis-net.js, the embedded copy in fortune-crisis.js,
//      and the fallback stand-in in fortune-read.js).
//   E2 the net catches at least 22 of the 24 crisis sentences (expected: CUR 20 ∪ PROP 21 = 23).
//   E3 the union adds no new false positive on the set: a benign sentence the line-48 pattern left clear stays clear
//      ("end it all with / between" plain sentences).
//   E4 one pattern source: no other product file gains an "ending it all" pattern (fortune-crisis-net.js and its embedded copy).
// Existing crisis-net unit / e2e expectations are not edited (their lock lines are unchanged).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const SET_FILE = path.join(ROOT, "tests/fixtures/crisis-endall/end-it-all-set.json");
const SET_SHA = "8b62de1a0470cd55edeee9e83a63f9de86736b6d6ca640467a968eef73f7e023";
// the two patterns of decision 105 (reference copies; the product holds the union in fortune-crisis-net.js)
const CUR = /\bend it all\b(?! with| between| off)/i;
const PROP = new RegExp("\\b(?:i|i'm|im|i'll|ill|i've|ive|i'd|me|wanna|gonna|gotta|want(?:s|ed)? to|going to|ready to|decided to|time to|" +
  "planning to|plan to|might|just)\\b[^.!?\\n]{0,25}?\\bend(?:ing)? it all\\b|\\bend(?:ing)? it all\\b[^.!?\\n]{0,20}\\b(?:pills?|rope|bridge|tonight|forever)\\b", "i");

function loadSet() {
  const buf = fs.readFileSync(SET_FILE);
  assert.equal(crypto.createHash("sha256").update(buf).digest("hex"), SET_SHA, "repo copy is byte-identical to the locked set");
  const lock = fs.readFileSync(path.join(ROOT, "evals-locks/crisis-endall.sha256"), "utf8");
  assert.ok(lock.split("\n").some(l => l.startsWith(SET_SHA + " ")), "set hash is in evals-locks/crisis-endall.sha256");
  const set = JSON.parse(buf.toString("utf8"));
  assert.equal(set.crisis.length, 24, "24 crisis sentences");
  assert.equal(set.benign.length, 24, "24 benign sentences");
  return set;
}

function nets() {
  const NET = require("../../fortune-crisis-net.js");
  const CR = require("../../fortune-crisis.js");
  const RD = require("../../fortune-read.js");
  assert.equal(typeof RD.standIn, "function", "LQRead.standIn exported");
  return { net: NET.check, crisis: CR.check, standIn: RD.standIn(() => false).check };
}

test("E1: every crisis sentence caught by either pattern alone is caught by the net, its copy and the fallback", () => {
  const set = loadSet(), N = nets();
  const either = set.crisis.filter(s => CUR.test(s) || PROP.test(s));
  assert.ok(either.length >= 22, "reference: CUR ∪ PROP covers " + either.length + "/24");
  for (const s of either) for (const [name, f] of Object.entries(N)) assert.equal(!!f(s), true, name + " catches " + JSON.stringify(s));
});

test("E2: the net catches at least 22 of the 24 crisis sentences", () => {
  const set = loadSet(), N = nets();
  for (const [name, f] of Object.entries(N)) {
    const hit = set.crisis.filter(s => f(s)).length;
    assert.ok(hit >= 22, name + ": " + hit + "/24 crisis sentences caught");
  }
});

test("E3: no new false positive on the set: benign sentences the line-48 pattern left clear stay clear", () => {
  const set = loadSet(), N = nets();
  const clear = set.benign.filter(s => !CUR.test(s));
  assert.ok(clear.length >= 3, "the set has benign sentences the line-48 pattern leaves clear");
  for (const s of clear) for (const [name, f] of Object.entries(N)) assert.equal(!!f(s), false, name + " leaves clear " + JSON.stringify(s));
});

test("E4: one pattern source: only fortune-crisis-net.js (and its embedded copy) holds the ending-it-all pattern", () => {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith(".js"));
  const holders = files.filter(f => /end\(\?:ing\)\? it all/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))).sort();
  assert.deepEqual(holders, ["fortune-crisis-net.js", "fortune-crisis.js"]);
});

// tests/unit/research-switch.test.js — round 16 S2: customer-build switch. Customer mode (LENSIQ_PROFILE = "commercial")
// is the default everywhere; the per-device "Research demo" toggle (lensiq-research.js) is the only way back to the
// research-licence age/gender + expression models, and an operator config locks it off. Network-level proof (no
// age_gender_model / face_expression_model request) is in tests/e2e/research-switch.e2e.mjs.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;

function storage(init = {}, blocked = false) {
  const m = { ...init };
  const boom = () => { throw new Error("SecurityError"); };
  return blocked ? { getItem: boom, setItem: boom, removeItem: boom } : {
    getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m
  };
}
function runConfig(pre = {}, store = {}, blocked = false) {
  const win = { ...pre };
  vm.runInNewContext(read("lensiq-config.js"), { window: win, localStorage: storage(store, blocked), document: undefined, location: { pathname: "/signage.html" } });
  return win;
}
function loadResearch(win, ls) {
  const ctx = { window: win, localStorage: ls, location: { reload() { ctx.reloaded = (ctx.reloaded || 0) + 1; } }, module: { exports: {} }, globalThis: win };
  vm.runInNewContext(read("lensiq-research.js"), ctx);
  return { api: win.LQResearch, ctx };
}
const flags = w => [w.LENSIQ_PROFILE, w.LENSIQ_AGE_GENDER, w.LENSIQ_EXPRESSION, w.LENSIQ_FACEPARSE];

test("resolver matrix: default customer, per-device toggle, operator demo, operator lock, legacy key, blocked storage", () => {
  const CASES = [
    // [name, pre-set window, storage, expected profile, research on, locked]
    ["default (GitHub Pages / any host, empty storage)", {}, {}, "commercial", false, null],
    ["toggle on", {}, { "lq-research-demo": "on" }, "demo", true, null],
    ["toggle off again", {}, { "lq-research-demo": "off" }, "commercial", false, null],
    ["legacy round-12 lq-profile=commercial", {}, { "lq-profile": "commercial" }, "commercial", false, null],
    ["toggle on wins over legacy key", {}, { "lq-research-demo": "on", "lq-profile": "commercial" }, "demo", true, null],
    ["operator demo unit", { LENSIQ_PROFILE: "demo" }, {}, "demo", true, null],
    ["operator demo unit switched off on this device", { LENSIQ_PROFILE: "demo" }, { "lq-research-demo": "off" }, "commercial", false, null],
    ["operator lock LENSIQ_RESEARCH_DEMO=false + stored on", { LENSIQ_RESEARCH_DEMO: false }, { "lq-research-demo": "on" }, "commercial", false, "operator"],
    ["operator lock beats operator demo", { LENSIQ_RESEARCH_DEMO: false, LENSIQ_PROFILE: "demo" }, { "lq-research-demo": "on" }, "commercial", false, "operator"],
    ["operator LENSIQ_PROFILE=commercial + stored on", { LENSIQ_PROFILE: "commercial" }, { "lq-research-demo": "on" }, "commercial", false, "profile"],
    ["unknown profile value", { LENSIQ_PROFILE: "anything" }, {}, "commercial", false, null]
  ];
  for (const [name, pre, store, profile, on, locked] of CASES) {
    const w = runConfig(pre, store);
    assert.equal(w.LENSIQ_PROFILE, profile, name);
    assert.equal(w.LENSIQ_RESEARCH.on, on, name); assert.equal(w.LENSIQ_RESEARCH.locked, locked, name);
    if (profile === "commercial") assert.deepEqual(flags(w), ["commercial", false, false, false], name + ": research models off");
    else assert.deepEqual(flags(w), ["demo", true, true, false], name + ": research models allowed");
  }
  const blocked = runConfig({}, {}, true);
  assert.deepEqual(flags(blocked), ["commercial", false, false, false], "blocked storage = customer mode");
  // explicit model opt-outs are still honoured inside the research demo
  const w = runConfig({ LENSIQ_AGE_GENDER: false, LENSIQ_EXPRESSION: false }, { "lq-research-demo": "on" });
  assert.equal(w.LENSIQ_PROFILE, "demo"); assert.equal(w.LENSIQ_AGE_GENDER, false); assert.equal(w.LENSIQ_EXPRESSION, false);
  // the shipped config line keeps the toggle available (the operator flips it to false for a customer installation)
  assert.match(read("lensiq-config.js"), /\(window\)\.LENSIQ_RESEARCH_DEMO = \/\*\* @type \{any\} \*\/ \(window\)\.LENSIQ_RESEARCH_DEMO !== false;/);
});

test("LQResearch.set: stores per device, removes the legacy key when switched on, refuses when locked", () => {
  const ls = storage({ "lq-profile": "commercial" });
  const win = runConfig({}, ls._m);
  const { api } = loadResearch(win, ls);
  assert.equal(api.state().on, false); assert.equal(api.expressionOn(), false); assert.equal(api.ageGenderOn(), false);
  assert.equal(api.set(true), true); assert.equal(ls._m["lq-research-demo"], "on"); assert.ok(!("lq-profile" in ls._m));
  const after = runConfig({}, ls._m);
  assert.equal(after.LENSIQ_PROFILE, "demo");
  const r2 = loadResearch(after, ls).api;
  assert.equal(r2.expressionOn(), true); assert.equal(r2.ageGenderOn(), true);
  assert.equal(r2.set(false), true); assert.equal(ls._m["lq-research-demo"], "off");
  assert.equal(runConfig({}, ls._m).LENSIQ_PROFILE, "commercial", "can always be switched off again");

  for (const pre of [{ LENSIQ_RESEARCH_DEMO: false }, { LENSIQ_PROFILE: "commercial" }]) {
    const lsL = storage();
    const locked = loadResearch(runConfig(pre, lsL._m), lsL).api;
    assert.ok(locked.state().locked, JSON.stringify(pre));
    assert.equal(locked.set(true), false, "a customer install can never enable it");
    assert.ok(!("lq-research-demo" in lsL._m), "nothing stored");
    assert.equal(runConfig(pre, { "lq-research-demo": "on" }).LENSIQ_PROFILE, "commercial", "a hand-written storage value is ignored too");
  }
  // without lensiq-config.js the module reports customer mode
  const bare = loadResearch({}, storage()).api;
  assert.equal(bare.state().on, false); assert.equal(bare.expressionOn(), false);
});

test("licence label + texts complete in TH / EN / ZH (no Thai inside en/zh), link to LICENSES/THIRD_PARTY.md F5", () => {
  const { api } = loadResearch({}, storage());
  const keys = Object.keys(api.TXT.th);
  for (const k of ["label", "lic", "licLink", "off", "on", "locked", "face", "why.cameras", "why.neuro", "why.signage", "why.booth", "why.photobooth"]) assert.ok(keys.includes(k), k);
  for (const l of ["en", "zh"]) {
    assert.deepEqual(Object.keys(api.TXT[l]).sort(), keys.slice().sort(), l + " has every key");
    for (const k of keys) { assert.ok(api.TXT[l][k].trim(), l + " " + k); assert.ok(!THAI.test(api.TXT[l][k]), `${l} ${k} has Thai`); }
  }
  assert.equal(api.TXT.en.label, "Research demo — research-licence models (age/gender, expression), not for commercial use");
  assert.match(api.TXT.th.label, /^เดโมงานวิจัย/); assert.match(api.TXT.zh.label, /^研究演示/);
  assert.equal(api.LIC_HREF, "LICENSES/THIRD_PARTY.md");
  assert.match(read("LICENSES/THIRD_PARTY.md"), /\| F5 \| face-api\.js models: \*\*age\/gender\*\*, \*\*expression\*\*/);
});

// Fixed inventory (written before building): every shipped page that loads face_expression_model or age_gender_model.
const PAGES = { signage: "signage.js", neuro: "neuro.js", booth: "booth.js", photobooth: "photobooth.js" };

test("inventory: only signage, neuro, booth and photobooth load the research models (grep over shipped scripts)", () => {
  const MODEL = /faceExpressionNet|ageGenderNet|withFaceExpressions|withAgeAndGender|face_expression_model|age_gender_model/;
  const SETTINGS = ["lensiq-config.js", "lensiq-research.js"]; // the switch itself (names the models in comments / text)
  const shipped = fs.readdirSync(ROOT).filter(f => /\.(js|html)$/.test(f) && !SETTINGS.includes(f) && MODEL.test(read(f)));
  assert.deepEqual(shipped.sort(), ["booth.js", "neuro.js", "photobooth.js", "signage.js"]);
});

test("each affected page: config + research toggle load BEFORE the page script; host element present; model gated", () => {
  for (const [page, js] of Object.entries(PAGES)) {
    const html = read(page + ".html"), src = read(js);
    const iCfg = html.indexOf('<script src="lensiq-config.js'), iRes = html.indexOf('<script src="lensiq-research.js'), iPage = html.indexOf(`<script src="${js}`);
    assert.ok(iCfg > 0 && iRes > iCfg && iPage > iRes, page + ": order config < research < page script");
    assert.equal(html.split('<script src="lensiq-config.js').length, 2, page + ": config loaded once");
    assert.match(html, new RegExp(`data-lq-research="${page}"`), page + ": toggle host");
    assert.match(src, /window\.LENSIQ_PROFILE === "demo" && \/\*\* @type \{any\} \*\/ \(window\)\.LENSIQ_EXPRESSION === true/, page + ": expression gate");
  }
  // signage: the model list in customer mode has no expression or age/gender net
  const S = require("../../signage.js");
  assert.deepEqual(S.netsFor(false, false), ["tinyFaceDetector", "faceLandmark68Net"]);
  assert.deepEqual(S.netsFor(false), ["tinyFaceDetector", "faceLandmark68Net", "faceExpressionNet"], "research demo keeps the old list");
  assert.match(read("signage.js"), /const nets = netsFor\(false, EXPR_OK\(\)\);/);
  assert.match(read("signage.js"), /const AGE_OK = \(\) => window\.LENSIQ_AGE_GENDER === true;/, "missing config = off");
  assert.match(read("booth.js"), /concat\(EXPR_OK\(\) \? \["faceExpressionNet"\] : \[\]\)/);
  assert.match(read("booth.js"), /if \(primary && EXPR_OK\(\)\) q = q\.withFaceExpressions\(\);/);
  assert.match(read("photobooth.js"), /if \(exprAllowed\(\)\) try \{ await faceapi\.nets\.faceExpressionNet/);
  assert.match(read("neuro.js"), /if \(!exprAllowed\(\)\) \{ engine\(/);
});

test("signage: frames without the expression model add no valence sample and no smile (customer mode)", () => {
  const S = require("../../signage.js");
  const T = S.newTracker(), now = 1000;
  const box = { x: 0.4, y: 0.3, width: 0.1, height: 0.15 };
  let r;
  for (let i = 0; i < 4; i++) r = S.updateTracks(T, [{ box, look: true, happy: false, val: undefined }], now + i * 100);
  const t = r.present[0];
  assert.equal(t.valOk, false); assert.equal(t.valN || 0, 0); assert.equal(t.happyFrames, 0);
});

test("i18n for the page-level customer-mode messages (neuro / booth run-time, photobooth key)", () => {
  const neuroMsg = "โหมดลูกค้า: ปิดโมเดลสีหน้า หน้านี้จึงไม่เปิดกล้องและไม่วิเคราะห์ ดูคำอธิบายและสวิตช์เดโมงานวิจัยด้านบน";
  assert.ok(read("neuro.js").includes(neuroMsg));
  for (const l of ["en", "zh"]) {
    assert.ok(read(`i18n/${l}-rt-neuro.js`).includes(JSON.stringify(neuroMsg)), l + " neuro");
    const b = read(`i18n/${l}-rt-booth.js`);
    assert.ok(b.includes('"ปิดโมเดลสีหน้าในโหมดลูกค้า — ไม่วัดสีหน้าหลักและ Valence"') && b.includes('"ปิดในโหมดลูกค้า"'), l + " booth");
    const pb = read(`i18n/${l}-photobooth.js`).match(/"photobooth\.js\.qc\.exprOff": "([^"]+)"/);
    assert.ok(pb && !THAI.test(pb[1]), l + " photobooth exprOff");
  }
});

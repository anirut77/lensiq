"use strict";
// tests/unit/pc-live-release.test.js — Product Check LIVE SCAN: the written release criteria that had NO check in the
// pc-live locked set (baseline tests/unit/pc-live.test.js 7746decb, accepted by owner decision 89, 2026-11-17).
// Source of every criterion: docs/product-check/LIVE-SCAN-RESULTS.md (line numbers in each test name). Criteria map:
// docs/EVAL-LOCKS.md "live-scan baseline (owner decision 89)". Written and locked (evals-locks/live-scan.sha256) before
// it was first run. Only adds checks; nothing in the locked set is changed or loosened.
//   R1  frame analysis at most 4 per second on a <= 320 px frame (lines 61, 102; the locked set allowed 5);
//   R2  auto-capture after 3 steady good frames; a steady view that is only blurred is read after at most 8 frames
//       (lines 59, 102; the locked set allowed 2-6 frames);
//   R3  at most 3 readings of one steady view, then reading stops (lines 59, 102; the locked set allowed 2-6);
//   R4  content-based scene cut (review fix 1, line 77): a reading that shares fewer than half its lines with the merged
//       reading is another object: the merged reading AND the earlier barcodes are dropped before it is merged;
//   R5  live scan is the default and can be switched off ("take one picture at a time") (line 62, 103);
//   R6  the Worker's one-tap allowance: at most 6 a minute and 150 a day per caller, and the day limit really refuses the
//       151st request (lines 69, 177, 369; the locked set allowed 12 / 300 and never reached the day limit);
//   R7  documented server refusal codes, ai_off_auto_filter and ai_off_personal_data included, show their own notice in
//       TH / EN / ZH (lines 36, 355-357; the e2e check covers four codes in Thai only).
// Synthetic frames and texts only; no network (mocked provider, D1 shim); no image of a person.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const L = require("../../lensiq-pc-live.js");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;

/* ---------- synthetic frames (ImageData-like), as in the locked pc-live.test.js ---------- */
function mk(w, h, v) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  return { width: w, height: h, data: d };
}
function rect(im, x, y, w, h, v) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i < 0 || j < 0 || i >= im.width || j >= im.height) continue;
    const k = 4 * (j * im.width + i); im.data[k] = im.data[k + 1] = im.data[k + 2] = v;
  }
}
function text(im, x0, y0, w, h, ink = 20, seed = 1) {
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = y0; y + 9 <= y0 + h; y += 14) {
    let x = x0;
    while (x + 6 <= x0 + w) { const gw = 2 + Math.floor(r() * 4); rect(im, x, y, gw, 9, ink); x += gw + 2 + (r() < 0.15 ? 5 : 0); }
  }
  return im;
}
function blur(im, rad) {
  const w = im.width, h = im.height, o = mk(w, h, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
      const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j));
      s += im.data[4 * (yy * w + xx)]; n++;
    }
    const v = s / n, k = 4 * (y * w + x); o.data[k] = o.data[k + 1] = o.data[k + 2] = v;
  }
  return o;
}
const label = () => text(mk(320, 240, 235), 20, 20, 280, 200);

test("R1 (LIVE-SCAN-RESULTS.md:61, :102): frame analysis at most 4 frames per second, on a frame of at most 320 px", () => {
  assert.ok(L.CFG.fps > 0 && L.CFG.fps <= 4, "fps " + L.CFG.fps);
  assert.ok(L.interval() >= 250, "at least 250 ms between analysed frames: " + L.interval());
  assert.ok(L.CFG.side <= 320, "analysis side " + L.CFG.side);
  // the camera loop schedules every frame through LQPCLive.interval() and scales the frame to CFG.side
  const ui = read("lensiq-pc-live-ui.js");
  assert.match(ui, /schedule\(L\.interval\(\) - /, "the loop waits LQPCLive.interval() between frames");
  assert.match(ui, /C\.side \/ Math\.max\(vw, vh\)/, "the analysed copy is scaled to CFG.side");
});

test("R2 (LIVE-SCAN-RESULTS.md:59, :102): auto-capture after exactly 3 steady good frames; a steady blurred view after at most 8", () => {
  const s = L.makeStabilizer(), a = label(), prev = L.frameStats(a, null);
  const at = [];
  for (let i = 1; i <= 5; i++) if (s.push(L.frameStats(a, prev.thumb)).stable) at.push(i);
  assert.equal(at[0], 3, "first capture at the 3rd steady good frame: " + JSON.stringify(at));
  const s2 = L.makeStabilizer(), b = blur(a, 3), bs = L.frameStats(b, null);
  let first = -1;
  for (let i = 1; i <= 20 && first < 0; i++) if (s2.push(L.frameStats(b, bs.thumb)).stable) first = i;
  assert.ok(first > 3 && first <= 8, "a steady blurred view is read after the sharp-view wait and within 8 frames: " + first);
});

test("R3 (LIVE-SCAN-RESULTS.md:59, :102): at most 3 readings of one steady view, then reading stops", () => {
  assert.ok(Number.isInteger(L.CFG.readsPerScene) && L.CFG.readsPerScene >= 1 && L.CFG.readsPerScene <= 3, "readsPerScene " + L.CFG.readsPerScene);
  const ui = read("lensiq-pc-live-ui.js");
  assert.match(ui, /r\.stable && !reading && !blocked && st\.sceneReads < C\.readsPerScene\)/, "a new reading starts only below CFG.readsPerScene");
  assert.match(ui, /st\.reads\+\+; st\.sceneReads\+\+;/, "every reading counts toward the limit");
});

test("R4 (LIVE-SCAN-RESULTS.md:77 fix 1): another object (fewer than half its lines in common) starts over: merged text and barcodes dropped", () => {
  const A = ["ยาแก้ปวด TESTOL 500 mg", "เลขทะเบียน 1A 844/39", "ส่วนประกอบ: พาราเซตามอล 500 มก.", "EXP 01/2028"];
  const B = ["ยาธาตุ SAMPLEX", "เลขทะเบียน G 123/45", "ส่วนประกอบ: ขิง 100 มก.", "LOT 2611A"];
  assert.equal(L.sameObject(A, ["ยาแก้ปวด TESTO1 500 mg", "เลขทะเบียน 1A 844/39", "EXP 01/2028"]), true, "the same label read again (an OCR variant)");
  assert.equal(L.sameObject(A, B), false, "another label: not the same object");
  assert.equal(L.sameObject(A, [A[0], ...B]), false, "one line in common out of five is not enough");
  assert.equal(L.sameObject(A, [A[0], A[1], B[0], B[1]]), true, "half the lines in common: the same object");
  // the camera loop asks sameObject BEFORE merging, and a new scene empties the merger AND the barcodes
  const ui = read("lensiq-pc-live-ui.js");
  const check = ui.indexOf("!L.sameObject(merger.lines()"), add = ui.indexOf("merger.add(r.ocr.lines");
  assert.ok(check > 0 && add > check, "sameObject is checked before the reading is merged");
  assert.match(ui.slice(check, add), /newScene\(\)/, "a different object starts a new scene");
  const ns = ui.slice(ui.indexOf("function newScene()"), ui.indexOf("function start("));
  assert.match(ns, /st\.codes = \[\]/, "a new scene drops the barcodes of the previous object");
  assert.match(ns, /merger\.reset\(\)/, "a new scene drops the merged reading");
});

test("R5 (LIVE-SCAN-RESULTS.md:62, :103): live scan is ticked by default and can be switched off (one picture at a time)", () => {
  const html = read("medicine.html");
  assert.match(html, /<input type="checkbox" id="pcLiveOn" checked>/, "the live-scan box is ticked by default");
  const ui = read("lensiq-pc-ui.js");
  assert.match(ui, /const liveWanted = \(\) => \{[^}]*#pcLiveOn[^}]*c\.checked; \};/, "liveWanted() reads the box");
  const i = ui.indexOf("W.LQPCLiveUI.start(video)");
  assert.ok(i > 0, "the live scan is started from lensiq-pc-ui.js");
  assert.match(ui.slice(Math.max(0, i - 300), i), /if \(liveWanted\(\) && W\.LQPCLiveUI/, "the live scan starts only while the box is ticked");
  assert.equal(ui.split("LQPCLiveUI.start(").length - 1, 1, "no other start of the live scan");
  for (const f of ["i18n/en-med.js", "i18n/zh-med.js"]) assert.ok(read(f).includes('"md.pc.live.on"'), f + ": the box label is translated");
});

/* ---------- R6: the Worker's one-tap allowance ---------- */
const { createEnv, req } = require("./backend-d1-shim.js");
const B = "../../backend/src/";
const CODE = "Mango-CANARY-7731-zebra-code";
const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
const FIELDS = { product_type: "drug", brand: "TESTOL", product_name: null, active_ingredients: [], dosage_form: null, registration: [], manufacturer: null, lot: null,
  expiry: null, claims_on_pack: [], languages_on_pack: [], unreadable: [] };

test("R6 (LIVE-SCAN-RESULTS.md:69, :177, :369): one-tap allowance at most 6 a minute and 150 a day; the day limit refuses request 151", async () => {
  const { AUTO_PER_MINUTE, AUTO_PER_DAY } = await import(B + "ai/gateway.js");
  assert.ok(Number.isInteger(AUTO_PER_MINUTE) && AUTO_PER_MINUTE >= 1 && AUTO_PER_MINUTE <= 6, "per minute " + AUTO_PER_MINUTE);
  assert.ok(Number.isInteger(AUTO_PER_DAY) && AUTO_PER_DAY >= AUTO_PER_MINUTE && AUTO_PER_DAY <= 150, "per day " + AUTO_PER_DAY);
  const { BKK_OFFSET } = await import(B + "util.js");
  const { putGateway } = await import(B + "ai/settings.js");
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ANTHROPIC_API_KEY: "sk-ant-test-" + "k".repeat(40),
    TESTER_GATE: "required", TESTER_ACCESS_CODE: CODE });
  const f = {};
  for (const id of ["pc_fields", "pc_claims", "pc_translate"]) f[id] = { enabled: true, chain: [{ provider: "anthropic", model: "claude-haiku-5-5" }], monthlyBudgetUsd: 50,
    perUserDaily: 1000, perUserPerMinute: 600, globalPerMinute: 10000 };
  await putGateway(env.DB, { enabled: true, features: f });
  let calls = 0;
  const adapters = { anthropic: { id: "anthropic", capabilities: () => ({ vision: true, jsonSchema: "native" }), region: () => "test-region",
    async call(r) { calls++; return { ok: true, json: r.output && r.output.name === "pc_claims" ? { signals: [] } : FIELDS, model: "served", usage: { inputTokens: 10, outputTokens: 5 } }; } } };
  const siteverify = async () => new Response(JSON.stringify({ success: true, action: "ai", hostname: "site.example" }));
  const realNow = Date.now;
  // one Bangkok day: start one minute after local midnight, one request every 61 s (a fresh minute window each time)
  const day0 = 1700000000 - ((1700000000 + BKK_OFFSET) % 86400) + 86400 + 60;
  const post = async (i, auto) => {
    Date.now = () => (day0 + i * 61) * 1000;
    const r = await handle(req("/v1/ai/" + (i % 2 ? "pc_claims" : "pc_fields"), { method: "POST",
      body: { consent: true, providers: ["anthropic"], mode: "text", input: { text: LABEL }, ...(auto ? { auto: true } : {}) },
      headers: { "X-Turnstile-Token": "good", "X-Tester-Code": CODE }, origin: "https://site.example", ip: "198.51.100.31" }), env,
    { fetch: siteverify, aiAdapters: adapters, sleep: async () => {} });
    return { status: r.status, j: await r.json() };
  };
  try {
    for (let i = 0; i < AUTO_PER_DAY; i++) {
      const r = await post(i, true);
      assert.equal(r.status, 200, "one-tap request " + (i + 1) + " of the day is served: " + JSON.stringify(r.j));
    }
    const before = calls;
    const over = await post(AUTO_PER_DAY, true);
    assert.deepEqual([over.status, over.j.reason], [429, "limit"], "request " + (AUTO_PER_DAY + 1) + " of the day is refused");
    assert.equal(calls, before, "the refused request never reaches the provider");
    const manual = await post(AUTO_PER_DAY + 1, false);
    assert.equal(manual.status, 200, "the public path (preview, no auto flag) does not use the one-tap allowance");
  } finally { Date.now = realNow; }
});

test("R7 (LIVE-SCAN-RESULTS.md:36, :355-357): every documented server refusal code has its own notice, in TH, EN and ZH", () => {
  const ai = read("lensiq-pc-ai.js");
  const block = ai.slice(ai.indexOf("const CODE_NOTE = () => ({"), ai.indexOf("function fbLine("));
  assert.ok(block.length > 100, "CODE_NOTE found");
  const keyOf = { ai_off_dispensing: "md.pc.ai.n.dispOff", ai_off_personal_doc: "md.pc.ai.n.personalDoc", ai_off_no_product: "md.pc.ai.n.noProduct",
    ai_off_personal_data: "md.pc.ai.n.personalData", ai_off_auto_filter: "md.pc.ai.n.tapFilter" };
  for (const code of Object.keys(keyOf)) assert.match(block, new RegExp("\\b" + code + ":"), code + " has its own notice");
  for (const k of ["md.pc.ai.n.personalData", "md.pc.ai.n.tapFilter"]) {
    const m = block.match(new RegExp('T\\("' + k.replace(/\./g, "\\.") + '", "([^"]+)"'));
    assert.ok(m && THAI.test(m[1]), k + ": Thai text in the page");
  }
  for (const k of ["md.pc.ai.n.dispOff", "md.pc.ai.n.personalDoc", "md.pc.ai.n.noProduct"]) assert.ok(ai.includes('T("' + k + '"'), k + ": Thai text in the page");
  // the page uses the Worker's code: fbLine picks CODE_NOTE()[x.code]
  assert.match(ai, /const own = x && x\.code \? CODE_NOTE\(\)\[x\.code\] : ""/, "the notice is chosen by the Worker's code");
  for (const [f, lang] of [["i18n/en-med.js", "en"], ["i18n/zh-med.js", "zh"]]) {
    const ctx = { window: {} };
    vm.runInNewContext(read(f), ctx, { filename: f });
    const dict = Object.assign({}, ...(ctx.window.LQI18N_Q || []).map(x => x[lang] || {}));
    for (const k of Object.values(keyOf)) {
      assert.equal(typeof dict[k], "string", f + ": " + k + " present");
      assert.ok(dict[k].trim().length > 10 && !THAI.test(dict[k]), f + ": " + k + " translated (no Thai left): " + dict[k]);
    }
  }
});

"use strict";
// node --test tests/unit/accuracy-figures.test.js — docs/accuracy-figures.json is the single source of truth for the
// customer-facing accuracy text (cameras.html#accuracy + the acc-note banners of store, customers, attendance, booth,
// driver, qc, signage). Fails when a page or an en/zh dictionary disagrees with it, when a figure's evidence line has
// left ACCURACY.md, when a value is not its raw number rounded, or when a known stale phrase is back.
// Fix: edit docs/accuracy-figures.json, then `node tools/accuracy-sync.mjs`.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.join(__dirname, "..", "..");
const lib = () => import(path.join(root, "tools", "accuracy-sync.mjs"));

test("every accuracy banner and table cell matches docs/accuracy-figures.json (th markup, en + zh dictionaries)", async () => {
  const { check } = await lib();
  const errs = check(root);
  assert.deepEqual(errs, [], "run: node tools/accuracy-sync.mjs\n" + errs.join("\n"));
});

test("the JSON covers every camera page banner and the cameras.html#accuracy table", async () => {
  const { loadFigures, expand } = await lib();
  const keys = new Set(expand(loadFigures(root)).map(r => r.key));
  for (const k of ["store.s5", "customers.s5", "attendance.s5", "booth.s4", "driver.s4", "qc.s5", "signage.s5",
    "cameras.s187", "cameras.s195", "cameras.s198", "cameras.s202", "cameras.s206", "cameras.s208", "cameras.s217",
    "driver.accstart", "driver.calwarn.fail", "driver.calwarn.ear", "cameras.accpilot"]) assert.ok(keys.has(k), k);
  for (const p of ["attendance", "customers", "booth", "driver", "signage"]) assert.ok(keys.has(p + ".lic") && keys.has(p + ".licb"), p + " research-licence badge");
  // every acc-note on these pages is generated: no banner span outside the JSON
  for (const p of ["store", "customers", "attendance", "booth", "driver", "qc", "signage"]) {
    const html = fs.readFileSync(path.join(root, p + ".html"), "utf8");
    const note = html.match(/<p class="acc-note"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(note, p + ": acc-note");
    const spans = [...note[1].matchAll(/<span data-i18n="([^"]+)"/g)].map(m => m[1]);
    assert.ok(spans.length, p);
    spans.forEach(k => assert.ok(keys.has(k), `${p}.html acc-note span ${k} is not generated from docs/accuracy-figures.json`));
  }
});

test("the check really fails when a banner, a dictionary or ACCURACY.md disagrees (fixture copy)", async () => {
  const { check, sync } = await lib();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-accfig-"));
  try {
    const copy = rel => { const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(root, rel), dst); };
    ["docs/accuracy-figures.json", "ACCURACY.md", "driver.html", "i18n/en-driver.js", "i18n/zh-driver.js"].forEach(copy);
    const doc = JSON.parse(fs.readFileSync(path.join(tmp, "docs/accuracy-figures.json"), "utf8"));
    doc.texts = doc.texts.filter(t => (t.keys || [t.key]).every(k => k.startsWith("driver.")));
    doc.banned = doc.banned.map(b => ({ ...b, files: b.files.filter(f => /driver/.test(f)) })).filter(b => b.files.length);
    fs.writeFileSync(path.join(tmp, "docs/accuracy-figures.json"), JSON.stringify(doc));
    assert.deepEqual(check(tmp), [], "fixture starts in sync");
    // 1. someone edits the Thai banner by hand
    const h = path.join(tmp, "driver.html");
    fs.writeFileSync(h, fs.readFileSync(h, "utf8").replace("ราว 1.4 ครั้งต่อชั่วโมง", "ราว 0.1 ครั้งต่อชั่วโมง"));
    assert.ok(check(tmp).some(e => /driver\.html \[driver\.s4\]/.test(e)));
    // 2. a stale figure comes back
    fs.writeFileSync(h, fs.readFileSync(h, "utf8").replace("ราว 0.1 ครั้งต่อชั่วโมง", "ราว 1.4 ครั้งต่อชั่วโมง 18–43%"));
    assert.ok(check(tmp).some(e => /stale text "18–43%"/.test(e)));
    // 3. sync rewrites the generated span from the JSON, which removes both
    sync(tmp);
    assert.deepEqual(check(tmp), []);
    // 4. the English dictionary drifts
    const en = path.join(tmp, "i18n/en-driver.js");
    fs.writeFileSync(en, fs.readFileSync(en, "utf8").replace("about 1.4 false alarms per hour", "about 0.1 false alarms per hour"));
    assert.ok(check(tmp).some(e => /en-driver\.js \[driver\./.test(e)));
    sync(tmp);
    // 5. ACCURACY.md changes the measured number -> the evidence no longer matches
    const md = path.join(tmp, "ACCURACY.md");
    fs.writeFileSync(md, fs.readFileSync(md, "utf8").replace("(7.4 → about 1.4 per hour)", "(7.4 → about 2.1 per hour)"));
    assert.ok(check(tmp).some(e => /figure drFaPerHour: evidence not found/.test(e)));
    // 6. a value that is not its raw number rounded
    doc.figures.dr2s = { ...doc.figures.dr2s, value: "32" };
    fs.writeFileSync(path.join(tmp, "docs/accuracy-figures.json"), JSON.stringify(doc));
    assert.ok(check(tmp).some(e => /figure dr2s: value 32 is not raw 25/.test(e)));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("render: unknown placeholders are an error, values are substituted verbatim", async () => {
  const { render } = await lib();
  assert.equal(render("a {x}% b", { x: { value: "−0.4" } }), "a −0.4% b");
  assert.throws(() => render("{nope}", {}), /unknown figure/);
});

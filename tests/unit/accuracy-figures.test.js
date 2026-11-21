"use strict";
// node --test tests/unit/accuracy-figures.test.js — docs/accuracy-figures.json is the single source of truth for every
// measured accuracy figure. Owner decision 223 (2026-11-21): customer pages no longer show the figures; the former page
// texts of the JSON are rendered into the technical sheets (docs/tech-sheets/) and the back-office data
// (admin-measurements.js, tab "ผลการวัด") by tools/accuracy-sync.mjs -> tools/tech-sheets.mjs. Fails when a customer page or
// an en / zh dictionary carries a figure text again, when a sheet or the admin data misses one or is stale, when a
// figure's evidence line has left ACCURACY.md, when a value is not its raw number rounded, or when a banned phrase is back.
// Fix: edit docs/accuracy-figures.json, then `node tools/accuracy-sync.mjs`.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.join(__dirname, "..", "..");
const lib = () => import(path.join(root, "tools", "accuracy-sync.mjs"));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const squash = s => String(s).replace(/\s+/g, " ").trim();

// the former camera-page banners and cameras.html#accuracy cells (before decision 223: these keys were generated on the pages)
const FORMER = ["store.s5", "customers.s5", "attendance.s5", "booth.s4", "driver.s4", "qc.s5", "signage.s5",
  "cameras.s187", "cameras.s195", "cameras.s198", "cameras.s202", "cameras.s206", "cameras.s208", "cameras.s217",
  "driver.accstart", "driver.calwarn.fail", "driver.calwarn.ear", "cameras.accpilot"];
const LIC_PAGES = ["attendance", "customers", "booth", "driver", "signage"];

// old: "every accuracy banner and table cell matches docs/accuracy-figures.json (th markup, en + zh dictionaries)"
// new: no page or dictionary carries a figure text; every figure text is in the sheets + admin data; evidence and rounding hold
test("no customer page or dictionary carries a figure text; the sheets and admin data carry every one; evidence and rounding hold", async () => {
  const { check } = await lib();
  const errs = check(root);
  assert.deepEqual(errs, [], "run: node tools/accuracy-sync.mjs\n" + errs.join("\n"));
});

// old: "the JSON covers every camera page banner and the cameras.html#accuracy table" (+ every acc-note span is generated)
// new: the JSON still records every former banner and table cell, each rendered into its sheet; on the pages, a key that
//      was kept for a plain line carries no percentage and no n; acc-note spans carry no figure; licence labels stay
test("the JSON still records every former banner and cameras.html#accuracy cell; the pages keep plain words only", async () => {
  const { loadFigures, expand, htmlTexts, dictValue } = await lib();
  const doc = loadFigures(root), rows = expand(doc), keys = new Set(rows.map(r => r.key));
  for (const k of FORMER) assert.ok(keys.has(k), k + " is still recorded in docs/accuracy-figures.json");
  for (const p of LIC_PAGES) assert.ok(keys.has(p + ".lic") && keys.has(p + ".licb"), p + " research-licence label recorded");
  const labels = doc.texts.filter(t => t.label).flatMap(t => t.keys);
  assert.deepEqual(labels.sort(), LIC_PAGES.flatMap(p => [p + ".lic", p + ".licb"]).sort(), "only the licence labels are marked label (223-5)");
  const FIG = /\d\s*%|\bn\s?=\s?\d/;
  for (const r of rows.filter(r => FORMER.includes(r.key))) {
    const html = read(r.page + ".html");
    for (const t of htmlTexts(html, r.key)) assert.ok(!FIG.test(t), `${r.page}.html [${r.key}] shows a figure again: ${t}`);
    for (const lang of ["en", "zh"]) {
      const f = `i18n/${lang}-${r.dict}.js`;
      const v = fs.existsSync(path.join(root, f)) ? dictValue(read(f), r.key) : undefined;
      if (v !== undefined) assert.ok(!FIG.test(v), `${f} [${r.key}] shows a figure again: ${v}`);
    }
  }
  for (const p of ["store", "customers", "attendance", "booth", "driver", "qc", "signage"]) {
    const html = read(p + ".html"), note = html.match(/<p class="acc-note"[^>]*>([\s\S]*?)<\/p>/);
    if (note) assert.ok(!FIG.test(squash(note[1].replace(/<[^>]+>/g, " "))), p + ".html: the acc-note shows a figure again");
  }
  // 223-5: the research-licence badge stays where that option is on
  for (const p of ["attendance", "customers"]) assert.deepEqual(htmlTexts(read(p + ".html"), p + ".licb").map(squash), ["โมเดลใบอนุญาตวิจัย"], p + ".licb");
  // every figure (key + what) is in a technical sheet or the README, and in admin-measurements.js
  const sheets = fs.readdirSync(path.join(root, "docs", "tech-sheets")).filter(f => /-EN\.md$|^README\.md$/.test(f))
    .map(f => squash(read("docs/tech-sheets/" + f))).join("\n");
  const admin = read("admin-measurements.js");
  for (const [k, f] of Object.entries(doc.figures)) {
    assert.ok(sheets.includes("`" + k + "`") && sheets.includes(squash(f.what)), "figure " + k + " in docs/tech-sheets/");
    assert.ok(admin.includes(JSON.stringify(k)) && admin.includes(JSON.stringify(f.what)), "figure " + k + " in admin-measurements.js");
  }
});

// old: fixture where a hand-edited banner, a stale figure, a drifted dictionary, changed evidence and a bad rounding fail
// new: the same classes of failure for the inverse check (figure text back on a page / in a dictionary, banned visible
//      phrase, sheet edited by hand), sync() regenerates the sheets, and the evidence / rounding failures as before
test("the check really fails when a figure comes back, a sheet drifts or ACCURACY.md disagrees (fixture copy)", async () => {
  const { check, sync, loadFigures, expand } = await lib();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-accfig-"));
  try {
    const copy = rel => { const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(root, rel), dst); };
    ["docs/accuracy-figures.json", "ACCURACY.md", "docs/ACCURACY-CLAIMS.md", "docs/tech-sheets/ORIGINAL-FIGURES-223.json",
      "tests/unit/accuracy-removal-223.spec.json", "admin-measurements.js", "docs/tech-sheets/SUPPLEMENT-223.json"].forEach(copy);
    for (const f of fs.readdirSync(path.join(root, "docs", "tech-sheets")).filter(f => f.endsWith(".md"))) copy("docs/tech-sheets/" + f);
    // a synthetic customer page + dictionaries that show the plain line only
    const put = (rel, s) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), s); };
    put("driver.html", '<!doctype html><p data-i18n="driver.s4">เตือนได้เพียงบางส่วน ไม่ใช่อุปกรณ์ความปลอดภัย</p>\n<!-- LFW n = 1 -->\n');
    put("i18n/en-driver.js", '(window.LQI18N_Q = window.LQI18N_Q || []).push({ en: {\n  "driver.s4": "It catches only some cases"\n} });\n');
    put("i18n/zh-driver.js", '(window.LQI18N_Q = window.LQI18N_Q || []).push({ zh: {\n  "driver.s4": "只能发现部分情况"\n} });\n');
    assert.deepEqual(check(tmp), [], "fixture starts clean (a dataset name inside an HTML comment is not visible text)");
    const s4 = expand(loadFigures(tmp)).find(r => r.key === "driver.s4");
    // 1. the Thai figure text is put back on the page
    const h = path.join(tmp, "driver.html"), h0 = fs.readFileSync(h, "utf8");
    fs.writeFileSync(h, h0.replace("เตือนได้เพียงบางส่วน ไม่ใช่อุปกรณ์ความปลอดภัย", s4.th));
    assert.ok(check(tmp).some(e => /^driver\.html: carries the figure text of driver\.s4 \(th\)/.test(e)));
    // 2. a banned phrase comes back in visible text
    fs.writeFileSync(h, h0.replace("ไม่ใช่อุปกรณ์ความปลอดภัย", "ไม่ใช่อุปกรณ์ความปลอดภัย (LFW)"));
    assert.ok(check(tmp).some(e => /driver\.html: stale text "LFW"/.test(e)));
    fs.writeFileSync(h, h0);
    // 3. the English dictionary gets the figure text back
    const en = path.join(tmp, "i18n/en-driver.js"), en0 = fs.readFileSync(en, "utf8");
    fs.writeFileSync(en, en0.replace('"It catches only some cases"', JSON.stringify(s4.en)));
    assert.ok(check(tmp).some(e => /en-driver\.js: carries the figure text of driver\.s4 \(en\)/.test(e)));
    fs.writeFileSync(en, en0);
    assert.deepEqual(check(tmp), []);
    // 4. someone edits the driver sheet by hand and drops the figure text: missing + stale
    const sh = path.join(tmp, "docs/tech-sheets/driver-TH.md");
    fs.writeFileSync(sh, fs.readFileSync(sh, "utf8").split(squash(s4.th)).join("(removed)"));
    const e4 = check(tmp);
    assert.ok(e4.some(e => /TH sheet of driver misses driver\.s4/.test(e)) && e4.some(e => /driver-TH\.md: stale/.test(e)), e4.join("\n"));
    // 5. sync regenerates the sheets from the JSON, which removes both
    assert.deepEqual(sync(tmp), ["docs/tech-sheets/driver-TH.md"]);
    assert.deepEqual(check(tmp), []);
    // 6. ACCURACY.md changes the measured number -> the evidence no longer matches
    const md = path.join(tmp, "ACCURACY.md");
    fs.writeFileSync(md, fs.readFileSync(md, "utf8").replace("(7.4 → about 1.4 per hour)", "(7.4 → about 2.1 per hour)"));
    assert.ok(check(tmp).some(e => /figure drFaPerHour: evidence not found/.test(e)));
    // 7. a value that is not its raw number rounded
    const doc = JSON.parse(fs.readFileSync(path.join(tmp, "docs/accuracy-figures.json"), "utf8"));
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

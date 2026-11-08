"use strict";
// tests/unit/studio-figures.test.js — (1) the numbers studio.html quotes on screen (StudioQA.FIGURES in studio-qa.js) are the ones
// the committed labels + gate logs give (tests/bench/studio-figures.mjs --check), for BOTH splits; (2) copy guard: no studio /
// photo-booth / product text claims the outfit change looks real ("realistic", "เหมือนใส่จริง", "สมจริง", "逼真" ...).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const vm = require("node:vm");
const Q = require(path.join(ROOT, "studio-qa.js"));
/** every key -> text of one i18n/<lang>-<name>.js file (queue format and run-time format), run in a sandbox like i18n-integrity.test.js */
function dict(file) {
  const w = {}; w.window = w; vm.runInNewContext(fs.readFileSync(path.join(ROOT, "i18n", file), "utf8"), w, { filename: file });
  const map = {}, lang = file.slice(0, 2);
  for (const d of w.LQI18N_Q || []) Object.assign(map, d[lang] || {});
  for (const d of w.LQI18N_RT || []) for (const k of Object.keys(d)) if (k !== "@lang") map[k] = d[k];
  return map;
}

test("StudioQA.FIGURES is generated from the labels + gate logs (both splits, person-cluster intervals)", async () => {
  const F = await import(path.join(ROOT, "tests", "bench", "studio-figures.mjs"));
  const src = fs.readFileSync(path.join(ROOT, "studio-qa.js"), "utf8");
  assert.equal(F.apply(src, F.figures()), src, "stale STUDIO_FIGURES block: run node tests/bench/studio-figures.mjs");
  for (const k of ["shownBad", "calibCover", "calibPlain", "pbRaw", "stNone", "pbNone"]) for (const sp of ["dev", "test"]) {
    const v = Q.FIGURES[k][sp]; assert.ok(v.n > 0 && v.lo <= v.p && v.p <= v.hi, `${k}.${sp} ${JSON.stringify(v)}`);
  }
  assert.equal(`${Q.FIGURES.shownBad.test.k}/${Q.FIGURES.shownBad.test.n}`, "34/94");
  assert.equal(`${Q.FIGURES.shownBad.dev.k}/${Q.FIGURES.shownBad.dev.n}`, "39/70");
});

test("studio.js quotes the outfit miss rate as a range over BOTH splits (never one split alone), in TH / EN / ZH", () => {
  const js = fs.readFileSync(path.join(ROOT, "studio.js"), "utf8");
  const th = js.match(/"studio\.js\.qa\.previewFig", "([^"]+)"/);
  assert.ok(th, "previewFig message");
  for (const ph of ["{lo}", "{hi}", "{test}", "{dev}"]) assert.ok(th[1].includes(ph), ph);
  for (const lang of ["en", "zh"]) {
    const d = require(path.join(ROOT, "i18n", `${lang}-studio.js`))[lang];
    for (const k of ["studio.js.qa.previewFig", "studio.js.qa.lowConf3"]) for (const ph of k.endsWith("Fig") ? ["{lo}", "{hi}", "{test}", "{dev}"] : ["{bd}", "{bt}"]) assert.ok(d[k] && d[k].includes(ph), `${lang} ${k} ${ph}`);
    assert.ok(!/test photos/.test(d["studio.js.qa.lowConf"] || ""), "lowConf names the split it was calibrated on");
  }
});

// words that say the synthetic outfit looks real (relabel to "preview / simulation" instead)
const BANNED = /realistic|looks real|like (?:you are )?really wearing|เหมือนใส่จริง|เหมือนจริง|สมจริง|逼真|像真的一样/i;
const STUDIO_KEY = /^(studio\.|photobooth\.|pb\.|pbo\.|pd\.c\.c2\.|pd\.c\.lead$|pd\.i\.creative$|cameras\.s14[2-4]$|home\.link\.studio$|nav\.studio\.|nav\.groupd\.photo$)/;

test("copy guard: no studio / photo-booth text says the outfit change looks real (dictionaries, pages, run-time defaults)", () => {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(en|zh)-.*\.js$/.test(f))) {
    const map = dict(f);
    for (const [k, v] of Object.entries(map)) if (typeof v === "string" && (STUDIO_KEY.test(k) || /studio|photobooth/.test(f)) && BANNED.test(v)) bad.push(`${f}: ${k}`);
  }
  // Thai on the pages and in the run-time defaults (string literals only; code comments may say "ไม่กลับด้าน: ให้เหมือนจริง")
  for (const f of ["studio.html", "photobooth.html", "creative-suite.html"]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of html.matchAll(/>([^<]+)</g)) if (BANNED.test(m[1])) bad.push(`${f}: ${m[1].trim().slice(0, 60)}`);
  }
  for (const f of ["studio.js", "photobooth.js", "photobooth-outfits.js"]) {
    const js = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of js.matchAll(/\b(?:T|tr)\("([\w.-]+)",\s*"((?:[^"\\]|\\.)*)"/g)) if (BANNED.test(m[2])) bad.push(`${f}: ${m[1]}`);
  }
  for (const f of ["index.html", "cameras.html"]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)</g)) if (STUDIO_KEY.test(m[1]) && BANNED.test(m[2])) bad.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(dict("en-products.js")).length > 50 && dict("zh-products.js")["pd.c.c2.p"], "product dictionaries are scanned");
  assert.ok(BANNED.test("Realistic outfit changes") && BANNED.test("เปลี่ยนชุดให้เหมือนใส่จริง") && BANNED.test("逼真换装"), "guard self-test");
});

test("the studio is named Portrait & ID Photo Studio wherever it is linked (no 'Outfit Studio' / 'สตูดิโอแต่งชุด' label)", () => {
  const html = ["index.html", "cameras.html", "creative-suite.html"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  for (const m of html.matchAll(/href="studio\.html"[^>]*>([\s\S]{0,200}?)<\/a>/g)) assert.ok(!/สตูดิโอแต่งชุด/.test(m[1].replace(/<[^>]+>/g, "")), m[1].slice(0, 80));
  const flat = { ...dict("en-common.js"), ...dict("en-cameras.js"), ...dict("en-products.js") };
  for (const k of ["home.link.studio", "cameras.s142", "pd.c.c2.h", "nav.studio.title"]) { assert.ok(flat[k], k); assert.ok(!/outfit studio/i.test(flat[k]), `${k}: ${flat[k]}`); }
});

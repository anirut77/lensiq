"use strict";
// tests/unit/exam-i18n.test.js — LENSIQ Exam text: every key the exam scripts pass to T() (and every signal / level /
// "what" label of lensiq-exam.js + exam-ui.js) has an English and a Chinese entry with the same {placeholders};
// no Thai left in en/zh values; no verdict / emotion wording in any language; pages load the shared dictionary.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const E = require("../../lensiq-exam.js");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
function dict(lang) { const w = {}; w.window = w; vm.runInNewContext(read(`i18n/${lang}-exam.js`), w); return w.LQI18N_Q[0][lang]; }
const D = { en: dict("en"), zh: dict("zh") };
const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(",");

function usedKeys() {
  const out = new Map();
  for (const f of ["exam-lab.js", "exam-hall.js", "exam-dashboard.js", "exam-ui.js"]) {
    const s = read(f);
    for (const m of s.matchAll(/T\(\s*"(exam\.[^"]+)",\s*"((?:[^"\\]|\\.)*)"/g)) out.set(m[1], m[2]);
    for (const m of s.matchAll(/\[\s*"(exam\.[^"]+)",\s*"((?:[^"\\]|\\.)*)"\s*\]/g)) out.set(m[1], m[2]);
  }
  for (const [k, v] of Object.entries(E.SIGNALS)) out.set("exam.sig." + k, v.th);
  for (const [k, v] of Object.entries(E.LEVEL_TH)) out.set("exam.lvl." + k, v);
  const W = /const WHAT_TH = \{([\s\S]*?)\};/.exec(read("exam-ui.js"))[1];
  for (const m of W.matchAll(/(\w+): "([^"]+)"/g)) out.set("exam.what." + m[1], m[2]);
  return out;
}

test("every run-time exam key has en + zh entries with matching placeholders", () => {
  const used = usedKeys(), bad = [];
  assert.ok(used.size > 150, "keys found: " + used.size);
  for (const [k, th] of used) for (const l of ["en", "zh"]) {
    if (!(k in D[l])) bad.push(`${l} missing ${k}`);
    else if (ph(D[l][k]) !== ph(th)) bad.push(`${l} ${k}: placeholders ${ph(D[l][k])} vs ${ph(th)}`);
  }
  assert.deepEqual(bad, []);
});

test("en / zh exam dictionaries: same keys, no Thai letters, no verdict or emotion wording", () => {
  assert.deepEqual(Object.keys(D.en).sort(), Object.keys(D.zh).sort());
  const thai = /[ก-ฺเ-๎]/;
  for (const l of ["en", "zh"]) for (const [k, v] of Object.entries(D[l])) assert.ok(!thai.test(v), `${l} ${k} has Thai`);
  // the system flags observations; it never says someone cheated, and it never infers emotion
  for (const [k, v] of Object.entries(D.en)) {
    if (/^exam\.l\.(never|why|law|n1|cant)|^exam\.lab\.n2|^exam\.db\.(precP|rNote)|^exam\.(hall\.warn|l\.lead|lab\.lead|db\.lead)/.test(k)) continue; // these explain what is NOT done
    assert.ok(!/\b(cheat(ed|ing|er)?|guilty|caught|suspicious|emotion)/i.test(v), `en ${k}: ${v}`);
  }
  for (const id of Object.keys(E.SIGNALS)) {
    assert.ok(!/cheat|guilt|emotion/i.test(D.en["exam.sig." + id]), id);
    assert.ok(!/作弊|情绪/.test(D.zh["exam.sig." + id]), id);
  }
});

test("exam pages load the dictionary, the pure module first, and keep the CSP / no inline handlers", () => {
  for (const p of ["exam.html", "exam-lab.html", "exam-hall.html", "exam-dashboard.html"]) {
    const s = read(p);
    assert.match(s, /<script src="i18n\/zh-exam\.js/, p);
    assert.match(s, /<script src="nav\.js/, p);
    assert.match(s, /http-equiv="Content-Security-Policy"/, p);
    assert.ok(!/\son[a-z]+=/i.test(s), p + " inline handler");
    assert.ok(!/<script>(?!<\/script>)/.test(s), p + " inline script");
    if (p !== "exam.html") assert.ok(s.indexOf("lensiq-exam.js") < s.indexOf(p.replace(".html", ".js")), p + ": core before page script");
  }
});

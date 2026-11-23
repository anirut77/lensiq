"use strict";
// tests/unit/fortune-reword-note.test.js — owner inbox entry 20 (2026-11-23, owner-confirmed): the sentence that explained
// the re-word button ("ทุกครั้งที่กด ระบบจะเรียบเรียงใหม่จากผลวัดชุดเดิม ความหมายหลักไม่เปลี่ยน", its English and Chinese
// versions and any variant) is gone from every customer-visible fortune page, card, share and print output.
// Behaviour does not change: the re-word button stays, a new press re-words the SAME result (same sections, same facts,
// facts untouched), and no wording is added that suggests a new press gives a new fortune.
// Static scan = every file the site serves (root *.html / *.js, i18n/*.js, share/), so share cards (canvas text built in
// the page scripts) and print (the page itself) are covered too. Comment lines are skipped (never rendered).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

/** The explanatory sentence in TH / EN / ZH, and its variants (tap/press/click, reword/rephrase/re-arrange, core/main meaning). */
const VARIANTS = [
  /ทุกครั้งที่กด[^"'<\n]{0,60}เรียบเรียง/,
  /เรียบเรียง(?:ใหม่)?จากผลวัด/,
  /ผลวัดชุดเดิม/,
  /ความหมายหลัก(?:ยัง)?ไม่เปลี่ยน/,
  /\b(?:each|every)\s+(?:tap|press|click)\b[^"'<\n]{0,80}\b(?:re-?word|rephras|re-?arrang|re-?compos)/i,
  /\bfrom the same (?:set of )?measurements\b/i,
  /\b(?:core|main) meaning (?:stays|remains|is) (?:the same|unchanged)\b/i,
  /每次(?:点击|按|点)[^"'<\n]{0,60}重新(?:组织|措辞|表述|编排)/,
  /同一组测量/,
  /(?:核心|主要)含义不变/,
];
/** Wording that would tell the user a new press gives a NEW fortune (must never be added to the button). */
const NEW_FORTUNE = [/ดวงใหม่|ทำนายใหม่|ผลใหม่|สุ่มใหม่|ลองดวง/, /\bnew (?:fortune|reading|result)\b|\btry again\b|\breroll\b/i, /新的(?:运势|结果|占卜)|重新(?:算|占|抽)/];

function servedFiles() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) if (/\.(html|js)$/.test(f)) out.push(f);
  for (const d of ["i18n", "share"]) {
    const dir = path.join(ROOT, d);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.(html|js|json|txt)$/.test(f)) out.push(d + "/" + f);
  }
  return out;
}
const isComment = line => /^\s*(?:\/\/|\/?\*|<!--)/.test(line);

test("entry 20: the re-word explanation (TH/EN/ZH and variants) appears in no served file", () => {
  const files = servedFiles();
  assert.ok(files.length > 100 && files.includes("palm.html") && files.includes("faceread.html") && files.includes("i18n/zh-fortune-palm.js"));
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const re of VARIANTS) if (re.test(line)) hits.push(`${f}:${i + 1} ${re} → ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("entry 20: the regenNote keys are no longer shown (no data-i18n use, no dictionary text)", () => {
  const hits = [];
  for (const f of servedFiles()) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (/(?:palm|faceread)\.regenNote/.test(s)) hits.push(f);
  }
  assert.deepEqual(hits, []);
});

test("entry 20: the re-word button stays on palm and face reading, label unchanged in TH/EN/ZH, no 'new fortune' wording", () => {
  for (const [page, id] of [["palm.html", "plRegen"], ["faceread.html", "frRegen"]]) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    const m = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>([^<]*)</button>'));
    assert.ok(m, page + ": #" + id + " still present");
    assert.match(m[0], /data-i18n="fortune\.common\.regen"/);
    assert.equal(m[1], "อ่านอีกสำนวน");
    // the actions row holds only the button now (no explanatory text next to it)
    const row = html.slice(html.indexOf('<div class="fa-actions">', html.indexOf(id) - 400), html.indexOf("</div>", html.indexOf(id)));
    assert.doesNotMatch(row.replace(/<button[\s\S]*?<\/button>/, ""), /[฀-๿a-zA-Z一-鿿]{3}/, page + ": no text beside the button");
  }
  const labels = [];
  for (const [file, keys] of [["i18n/en-fortune.js", ["fortune.common.regen", "fk.again"]], ["i18n/zh-fortune.js", ["fortune.common.regen", "fk.again"]],
    ["i18n/en-fortune-horoscope.js", ["horoscope.x.again"]], ["i18n/zh-fortune-horoscope.js", ["horoscope.x.again"]],
    ["i18n/en-fortune-tarot.js", ["tarot.regen"]], ["i18n/zh-fortune-tarot.js", ["tarot.regen"]]]) {
    const s = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const k of keys) { const m = s.match(new RegExp('"' + k.replace(/\./g, "\\.") + '":\\s*"([^"]+)"')); assert.ok(m, file + " " + k); labels.push(m[1]); }
  }
  assert.deepEqual(labels, ["Rephrase", "Rephrase", "换一种说法", "换一种说法", "Rephrase", "换一种说法", "Reword it", "换一种说法"]);
  for (const l of labels.concat("อ่านอีกสำนวน")) for (const re of NEW_FORTUNE) assert.doesNotMatch(l, re);
});

/* ---------- behaviour: a new press re-words the same result ---------- */
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js");
const TOPICS = ["overall", "love", "work", "money"];

function factSets() {
  const out = [];
  const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 });
  for (let i = 0; i < 4; i++) {
    const p = base.map(([x, y], k) => [x + (k <= 16 ? (k < 8 ? -i : i) : 0), y + (k >= 48 ? i * 4 : 0)]);
    out.push({ d: "face", facts: FR.buildFacts(FR.analyze(p, null, 25 + i * 9), { topic: TOPICS[i], age: 25 + i * 9 }) });
  }
  const LINES = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: true }]));
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? "left" : "right";
    const hand = PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: 340 + i * 20, h: 470 }, side));
    out.push({ d: "palm", facts: PC.buildFacts(PC.analyze({ hand, lines: LINES, side, isDominant: true }), { topic: TOPICS[i], side, isDominant: true }) });
  }
  return out;
}
const text = r => (r.sections || []).map(s => (s.paragraphs || []).join(" ")).join(" | ");
// what a press must keep (the result, not the wording): the summary card's structure (which kinds of lines, in order),
// the number of plan steps, the opening and closing sections. Middle sections can already appear or merge with the wording (thin sections
// fold into others) and a plan step can be picked from several candidates; both are behaviour on main 40f9e9b7, unchanged
// here, so they are not compared.
const shape = r => JSON.stringify({
  summary: r.summary ? (r.summary.lines || []).map(l => [l.k, l.c]) : null,
  plan: r.plan ? (r.plan.items || []).length : 0,
  first: (r.sections || [])[0] && r.sections[0].id,
  last: (r.sections || []).length ? r.sections[r.sections.length - 1].id : null,
});

test("entry 20: pressing re-word keeps the same result (same summary shape, facts untouched) and still re-words", async () => {
  assert.equal(typeof FA.regenerate, "function");
  let reworded = 0, n = 0;
  for (const { d, facts } of factSets()) {
    for (const lang of ["th", "en", "zh"]) {
      const f = facts, o = () => ({ useAI: false, lang });
      const before = JSON.stringify(f);
      const first = await FA.interpret(f, o());
      const again = [await FA.regenerate(f, o()), await FA.regenerate(f, o()), await FA.regenerate(f, o())];
      assert.equal(JSON.stringify(f), before, d + "/" + lang + ": facts changed by a press");
      for (const r of again) {
        assert.equal(r.source, "local");
        assert.equal(r.lang, first.lang);
        assert.equal(r.topic, first.topic);
        assert.equal(shape(r), shape(first), d + "/" + lang + ": a press changed the result, not only the wording");
        assert.ok(text(r).length > 100, d + "/" + lang + ": empty reading after a press");
      }
      assert.equal(first.lang, lang, d + ": reading not in " + lang);
      n++;
      if (again.some(r => text(r) !== text(first))) reworded++;
    }
  }
  assert.equal(reworded, n, `re-wording still works: ${reworded}/${n} fact sets got new wording`);
});

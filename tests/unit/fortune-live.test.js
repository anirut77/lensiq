"use strict";
// tests/unit/fortune-live.test.js — FIXED TEST SET, fortune go-live (owner order 2026-11-15, items 1–3). Written and locked
// (evals-locks/fortune-live.sha256 and ~/LENSIQ-field/evals/fortune-live/) BEFORE any product code on branch fortune-live.
// The browser half is tests/e2e/fortune-live.e2e.mjs.
//   1  No idle technical status: no page shows "ready — the model loads when …" while nothing is loading. The role=status
//      element stays (loading and error messages still reach screen readers); the faceread failure / timeout messages stay.
//   2  The disclaimer on every fortune page is exactly "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ"
//      (EN / ZH to match). The earlier drafts and "for entertainment" (TH / EN / ZH) are gone from the fortune pages,
//      cat-fortune.html, the fortune KBs and scripts, and the fortune strings in i18n. The AI prompt says no "entertainment".
//   3  Help line in one place per page: a single small "อยากมีคนรับฟัง" tap-to-call button near the top (before <main>);
//      no help number more than once in a fortune page's HTML, 1323 once, 1669 not at all (re-lock: decision 54 ข); no help-line block at the end of the page and no
//      help line under a reading in the normal state. The crisis card is unchanged (full card with every number).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const LANGS = ["th", "en", "zh"];
// CLAUDE.md category 6, plus the category landing page
const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac",
  "astro", "lifegraph", "planner", "luckycolor", "report"];
const ALL = PAGES.concat(["cat-fortune"]);

/* ---------------- item 2: the disclaimer ---------------- */
const NEW = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
// the earlier drafts (owner order 2026-11-14 A1 and the card / share short form)
const DRAFTS = [
  "เนื้อหานี้พัฒนาขึ้นจากองค์ความรู้ด้านโหราศาสตร์",
  "ตามความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ ไม่รับรองความถูกต้องของคำทำนาย",
  "This content draws on traditional astrological knowledge",
  "Personal belief: use your own judgement; we cannot vouch for any prediction",
  "本内容基于传统占星与命理知识",
  "属于个人信仰，请自行判断，不保证预测准确",
];
const OLD = {
  th: /เพื่อความบันเทิง/,
  en: /\bfor (?:the )?entertainment\b|\bentertainment(?: and [a-z ]+)? (?:only|purposes?|content|use|activit)|\bfor fun only\b|\bjust for fun\b|^Entertainment\b/i,
  zh: /仅供娱乐|供娱乐|娱乐参考|娱乐内容|娱乐用途|依信仰娱乐|娱乐性质|娱乐形式|娱乐活动/,
};
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, "");

/** every script and dictionary a fortune page loads (shared site scripts excluded), every EN / ZH sibling, every fortune KB */
function fortuneSources() {
  const own = new Set();
  for (const p of ALL) {
    const h = read(p + ".html");
    for (const m of h.matchAll(/<script[^>]+src="([^"?#]+)/g)) {
      const s = m[1];
      if (/^(?:https?:)?\/\//.test(s) || s.startsWith("vendor/")) continue;
      if (/^(?:nav|lensiq-(?:config|crashguard|camera|track|detect|capture-hint|thai-canon|look|look-preview|look-lint|look-art|merit-lint|busy|analytics|i18n)|photobooth-hq)\.js$/.test(s)) continue;
      if (/^i18n\/(?:zh|en)-(?:products|common|rt-common|cat)\.js$/.test(s)) continue;
      own.add(s);
    }
  }
  for (const s of [...own]) if (s.startsWith("i18n/zh-")) own.add(s.replace("i18n/zh-", "i18n/en-"));
  for (const f of fs.readdirSync(path.join(ROOT, "i18n"))) if (/^(?:en|zh)-(?:kb-|fortune|report|luckycolor|planner)/.test(f)) own.add("i18n/" + f);
  for (const f of fs.readdirSync(ROOT)) if (/-kb\.js$/.test(f)) own.add(f);
  for (const f of ["fortune-ai.js", "fortune-kit.js", "fortune-read.js", "fortune-notice.js", "fortune-straight.js", "fortune-crisis.js", "fortune-sources.js",
    "fortune-restrain.js", "lensiq-report.js", "lensiq-planner.js", "lensiq-luckycolor.js", "report.js"]) own.add(f);
  return [...own].filter(f => fs.existsSync(path.join(ROOT, f))).sort();
}

/** the value of a "key": "value" entry in a dictionary file */
function entry(file, key) {
  const m = read(file).match(new RegExp(JSON.stringify(key).replace(/[.$]/g, "\\$&") + "\\s*:\\s*(\"(?:[^\"\\\\]|\\\\.)*\")"));
  return m ? JSON.parse(m[1]) : null;
}

test("item 2: the line in fortune-read.js and fortune-notice.js is the owner's final wording, exactly, in TH / EN / ZH", () => {
  const RD = require("../../fortune-read.js");
  for (const l of LANGS) assert.equal(RD.LINE[l], NEW[l], "fortune-read.js LINE." + l);
  const NO = read("fortune-notice.js");
  for (const l of LANGS) assert.ok(NO.includes(JSON.stringify(NEW[l])), "fortune-notice.js carries the " + l + " line");
});

test("item 2: every fortune.disc.line entry in the EN / ZH dictionaries is the final wording", () => {
  let n = 0;
  for (const f of fs.readdirSync(path.join(ROOT, "i18n"))) {
    const l = f.slice(0, 2);
    if (l !== "en" && l !== "zh") continue;
    if (!read("i18n/" + f).includes('"fortune.disc.line"')) continue;
    assert.equal(entry("i18n/" + f, "fortune.disc.line"), NEW[l], f);
    n++;
  }
  assert.ok(n >= 8, "found the fortune.disc.line entries: " + n);
});

test("item 2: every fortune page and cat-fortune.html shows the final Thai line, and none has an earlier draft or 'for entertainment' (TH / EN / ZH)", () => {
  for (const p of ALL) {
    const h = stripComments(read(p + ".html"));
    if (p !== "report") assert.ok(h.includes(NEW.th), p + ".html shows the final line");
    for (const d of DRAFTS) assert.ok(!h.includes(d), `${p}.html still has an earlier draft: ${d}`);
    for (const l of LANGS) assert.doesNotMatch(h, OLD[l], `${p}.html has old ${l} wording: ${(h.match(OLD[l]) || [])[0]}`);
  }
  assert.ok(read("report.js").includes(NEW.th), "report.js builds the final line");
});

test("item 2: no earlier draft and no 'for entertainment' in any fortune script, KB or fortune dictionary (TH / EN / ZH)", () => {
  const files = fortuneSources();
  assert.ok(files.length >= 60, "found the fortune sources: " + files.length);
  const bad = [];
  for (const f of files) {
    const s = read(f);
    for (const d of DRAFTS) if (s.includes(d)) bad.push(f + ": draft " + d.slice(0, 30));
    for (const l of LANGS) { const m = s.match(OLD[l]); if (m) bad.push(f + " (" + l + "): " + s.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")); }
  }
  assert.deepEqual(bad, []);
});

test("item 2: the fortune category text (cat-data, i18n/{en,zh}-cat.js, index.html chooser) has no 'for entertainment'", () => {
  const D = require("../../tools/cat-data.cjs");
  const cat = D.CATEGORIES.find(c => c.slug === "fortune");
  for (const l of LANGS) assert.doesNotMatch(cat.intro[l], OLD[l], "fortune intro " + l);
  for (const l of LANGS) assert.ok(cat.intro[l].includes(NEW[l].replace(/\.$/, "")) || cat.intro[l].includes(NEW[l]), "fortune intro carries the final line (" + l + ")");
  for (const l of ["en", "zh"]) {
    for (const k of ["cat.fortune.intro", "cat.c.fortune", "cat.r.fortune"]) {
      const v = entry("i18n/" + l + "-cat.js", k);
      assert.ok(v, l + "-cat.js " + k);
      assert.doesNotMatch(v, OLD[l], l + "-cat.js " + k + ": " + v);
    }
  }
  const idx = read("index.html");
  const intro = idx.match(/data-i18n="cat\.fortune\.intro">([^<]*)</);
  assert.ok(intro, "index.html fortune chooser intro");
  assert.doesNotMatch(intro[1], OLD.th);
});

test("item 2: the AI prompt never asks for 'for entertainment' wording (TH / EN / ZH)", () => {
  const s = read("backend/src/fortune-prompt.js");
  for (const l of LANGS) assert.doesNotMatch(s, OLD[l], "fortune-prompt.js " + l);
  assert.doesNotMatch(s, /entertainment|บันเทิง|娱乐/i);
});

/* ---------------- item 1: no idle technical status ---------------- */
const IDLE = /โมเดลจะโหลด|model (?:will )?loads? when|the model loads|时才加载模型|พร้อม — โมเดล|Ready — the model/i;
test("item 1: no page or page script shows an idle 'ready — the model loads when …' status (dictionaries may keep unused entries)", () => {
  const bad = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (!/\.(?:html|js)$/.test(f)) continue;
    const s = f.endsWith(".html") ? stripComments(read(f)) : read(f).replace(/^\s*\/\/.*$/gm, "");
    const m = s.match(IDLE);
    if (m) bad.push(f + ": " + s.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, " "));
  }
  assert.deepEqual(bad, []);
  for (const k of ["faceread.eng.idle", "palm.eng.idle", "studio.js.ready.idle"]) {
    for (const f of ["faceread.js", "palm.js", "studio.js"]) assert.ok(!read(f).includes('"' + k + '"'), f + " no longer shows " + k);
  }
});

test("item 1: the status elements stay (role=status) so loading and error messages still reach screen readers", () => {
  const want = { "faceread.html": "frEngine", "palm.html": "plEngine", "booth.html": "engine", "studio.html": "stReady" };
  for (const [f, id] of Object.entries(want)) {
    const m = read(f).match(new RegExp("<[a-z]+[^>]*\\bid=\"" + id + "\"[^>]*>([^<]*)<"));
    assert.ok(m, f + " #" + id);
    assert.match(m[0], /role="status"/, f + " #" + id + " role=status");
  }
  // booth: nothing loads at page open, so the static status is empty
  assert.equal(read("booth.html").match(/<div[^>]*id="engine"[^>]*>([^<]*)</)[1].trim(), "", "booth.html idle status is empty");
});

test("item 1: the faceread failure and timeout messages (faceread-ios fix) are still there", () => {
  const s = read("faceread.js");
  const keys = [...s.matchAll(/engineT\("(faceread\.eng\.[A-Za-z]+)"/g)].map(m => m[1]);
  assert.ok(keys.some(k => /timeout|slow|stuck|fail|err/i.test(k)), "faceread keeps a failure / timeout status: " + keys.join(", "));
  for (const k of keys) for (const l of ["en", "zh"]) assert.ok(read(`i18n/${l}-fortune-faceread.js`).includes('"' + k + '"'), `${l} has ${k}`);
});

/* ---------------- item 3: help line in one place ---------------- */
/** the outer HTML of the element with this id (balanced on its own tag name) */
function block(html, id) {
  const m = new RegExp("<(\\w+)[^>]*\\bid=\"" + id + "\"[^>]*>").exec(html);
  if (!m) return null;
  const tag = m[1];
  let depth = 0;
  const re = new RegExp("<" + tag + "\\b|</" + tag + ">", "g"); re.lastIndex = m.index;
  let x;
  while ((x = re.exec(html))) { depth += x[0][1] === "/" ? -1 : 1; if (depth === 0) return { start: m.index, end: re.lastIndex, html: html.slice(m.index, re.lastIndex) }; }
  return null;
}
/** body text without tags, attributes, scripts, styles and comments */
const bodyText = h => stripComments(h).replace(/<head[\s\S]*?<\/head>/i, " ").replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// RE-LOCK 2026-11-15 (owner decision 54 option ข 2026-11-15: rule is at most once per page in normal state, 1669 only in crisis
// card): in the normal state no help number appears more than once per page; "อยากมีคนรับฟัง 1323" is the ONLY help control at
// the top; 1669 (and 191, 1300, Samaritans) do not appear in the normal state; the crisis card carries them all.
const NUMS = { 1323: "1323", 1669: "1669", 191: "191", 1300: "1300", samaritans: "021136789" };
test("item 3: every fortune page (and cat-fortune): each help number at most once in its HTML, 1323 exactly once (the top button), 1669 none", () => {
  for (const p of ALL) {
    const h = stripComments(read(p + ".html"));
    for (const [id, n] of Object.entries(NUMS)) {
      const tels = (h.match(new RegExp('href="tel:' + n + '"', "g")) || []).length;
      const txt = id === "samaritans" ? (bodyText(h).match(/02 113 6789/g) || []).length : (bodyText(h).match(new RegExp("(?<!\\d)" + n + "(?!\\d)", "g")) || []).length;
      assert.ok(tels <= 1 && txt <= 1, `${p}.html: ${id} appears more than once (tel ${tels}, text ${txt})`);
      if (id === "1323") { assert.equal(tels, 1, `${p}.html: tel:1323 links ${tels}`); assert.equal(txt, 1, `${p}.html: 1323 in the text ${txt} times`); }
      else { assert.equal(tels, 0, `${p}.html: tel:${n} in the normal page`); assert.equal(txt, 0, `${p}.html: ${id} in the normal page text`); }
    }
    assert.ok(!h.includes('id="lqHelpEnd"'), p + ".html: no help line at the end of the page");
    const top = block(h, "lqHelpTop");
    assert.ok(top, p + ".html #lqHelpTop");
    const main = h.search(/<main\b/);
    assert.ok(top.start < main, p + ".html: the help button comes before <main>");
    assert.ok(top.start > h.search(/<header\b/), p + ".html: the help button comes after the header");
    assert.deepEqual([...top.html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m => m[1]), ["tel:1323"], p + ": the 1323 button is the only control at the top");
    assert.doesNotMatch(top.html, /<button\b|role="button"/, p + ": no other help control at the top");
    const a = top.html.match(/<a\b[^>]*href="tel:1323"[^>]*>[\s\S]*?<\/a>/)[0];
    assert.match(a, /อยากมีคนรับฟัง/, p + ": the 1323 button says อยากมีคนรับฟัง");
    assert.match(a, /data-i18n="call\.1323\.label"/, p + ": the label is translatable");
    assert.match(a, /aria-label="อยากมีคนรับฟัง โทร 1323"/, p + ": accessible name");
    assert.doesNotMatch(top.html, /lq-more|lq-notice-more|<details/, p + ": nothing folded");
  }
});

test("item 3: the button labels exist in EN / ZH (no Thai letters) and the generator writes only the top button", async () => {
  for (const l of ["en", "zh"]) {
    for (const k of ["call.1323.label", "call.1323.btn", "call.1669.label", "call.1669.btn", "help.line.label"]) {
      const v = entry("i18n/" + l + "-common.js", k);
      assert.ok(v, l + " " + k); assert.doesNotMatch(v, /[\u0E00-\u0E7F]/, l + " " + k);
    }
  }
  const H = await import("../../tools/helpline.mjs");
  const out = H.applyTo("<header class=\"nav\" id=\"siteNav\"></header>\n<main>\n  <p>x</p>\n</main>\n");
  assert.equal((out.match(/tel:1323/g) || []).length, 1, "generator: one 1323");
  assert.equal((out.match(/tel:1669/g) || []).length, 0, "generator: no 1669 in the normal page (crisis card only; decision 54 ข)");
  assert.ok(!out.includes("lqHelpEnd"), "generator: no end block");
});

test("item 3: in the normal state a reading carries no second help line (fortune-ai toHTML and the DOM renderer)", () => {
  const FA = require("../../fortune-ai.js");
  for (const l of LANGS) {
    const reading = { source: "local", lang: l, summary: { title: "S", lines: [{ k: "w", t: "ok" }] },
      sections: [{ id: "overview", title: "O", paragraphs: ["first part", "second part"] }], reminder: "r" };
    const html = FA.toHTML(reading);
    assert.match(html, /fa-section/, l + ": the reading is drawn");
    assert.doesNotMatch(html, /tel:1323|tel:1669/, l + ": toHTML of a normal reading has no help line");
  }
  // the crisis card is unchanged: every number, tap-to-call
  for (const l of LANGS) {
    const card = FA.toHTML(FA.crisis.result({ lang: l }));
    for (const n of ["1323", "1669", "191", "1300"]) assert.match(card, new RegExp('href="tel:' + n + '"'), l + " crisis card has " + n);
  }
  // the source: under a reading only when the page is calm (crisis net), never unconditionally
  const src = read("fortune-ai.js");
  for (const m of src.matchAll(/CR\.help(?:HTML|Line)\(/g)) {
    const line = src.slice(src.lastIndexOf("\n", m.index), src.indexOf("\n", m.index));
    assert.match(line, /calmOn|distress|calm\(/, "help line under a reading only in the calm state: " + line.trim());
  }
});

test("item 3: the printed report keeps the help line, hidden on screen (one place per page on screen)", () => {
  assert.match(read("report.js"), /lq-helpline-print/);
  const css = read("styles.css") + read("report.css");
  assert.match(css, /\.lq-helpline-print\s*\{[^}]*display:\s*none/, "hidden on screen");
  assert.match(css, /@media print\s*\{[^@]*\.lq-helpline-print\s*\{[^}]*display:\s*block/, "shown in print");
});

test("item 3: docs record the placement change (owner decision 2026-11-15) for the mental-health review", () => {
  const cr = read("docs/CRISIS-RESOURCES.md");
  assert.match(cr, /2026-11-15/); assert.match(cr, /อยากมีคนรับฟัง|one place|ที่เดียว/i);
  const lp = read("docs/LEGAL-PACKET.md");
  assert.ok(lp.includes(NEW.th), "LEGAL-PACKET quotes the final line");
});

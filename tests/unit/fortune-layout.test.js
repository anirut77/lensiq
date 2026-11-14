"use strict";
// tests/unit/fortune-layout.test.js — FIXED TEST SET, owner order 2026-11-14 Part A (fortune pages: wording, layout, read more,
// advice icons, short notices). Written and locked (sha256 in evals-locks/fortune-layout.sha256 and
// ~/LENSIQ-field/evals/fortune-layout/locked.sha256) BEFORE any product code for Part A was written.
//
// What it pins down (the browser half is tests/e2e/fortune-layout.e2e.mjs):
//   A1  the old "for entertainment" wording (TH เพื่อความบันเทิง / EN for entertainment / ZH 仅供娱乐 …) is gone from every
//       fortune page (HTML, the page's own scripts and its EN / ZH dictionaries) and the new one-line notice is there in
//       TH / EN / ZH; the lawyer's list has the "is this enough without 'for entertainment'" item
//   A2  readings are regrouped under short headings (ภาพรวม การงาน การเงิน ความรัก … สิ่งที่ควรทำ) in short paragraphs, and
//       the regrouping never changes a word: the parts put back together are exactly the composer's paragraphs
//   A3  main point first: the first part of every group is shown; a paragraph that carries an unfavourable / caution lead
//       (straight or gentle) is always shown, never folded behind "อ่านเพิ่มเติม"; labels in TH / EN / ZH
//   A4  advice icons are own inline SVG or permissively licensed, each recorded in LICENSES/THIRD_PARTY.md and
//       docs/CREDITS-MEDIA.md; colour swatches use the real colour value and a text label; the belief label
//   A5  notices: one short line, the rest behind "อ่านเพิ่มเติม"; the help line and the crisis card are never collapsible
//   and: straight / gentle wording is unchanged (compose output does not depend on the layout module) and the existing
//       fortune-honest tests are the locked ones, untouched.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");

// CLAUDE.md category 6
const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac",
  "astro", "lifegraph", "planner", "luckycolor", "report"];
const OLD = {
  th: /เพื่อความบันเทิง/,
  en: /\bfor (?:the )?entertainment\b|\bentertainment(?: and [a-z ]+)? (?:only|purposes?|content|use)\b|\bfor fun only\b|\bjust for fun\b/i,
  zh: /仅供娱乐|供娱乐|娱乐参考|娱乐内容|娱乐用途|依信仰娱乐|娱乐性质/,
};
const LINE_TH = "เนื้อหานี้พัฒนาขึ้นจากองค์ความรู้ด้านโหราศาสตร์ เป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณและอ่านอย่างมีสติ เราไม่รับรองความถูกต้องของคำทำนาย";
const stripHtmlComments = s => s.replace(/<!--[\s\S]*?-->/g, "");
const LANGS = ["th", "en", "zh"];

/* ---------------- A1 wording ---------------- */
test("A1: the new line in TH / EN / ZH (TH verbatim from the owner; EN / ZH say the same: belief, use judgement, no guarantee)", () => {
  assert.equal(RD.LINE.th, LINE_TH);
  assert.match(RD.LINE.en, /belief/i); assert.match(RD.LINE.en, /judg(?:e)?ment/i); assert.match(RD.LINE.en, /(?:do not|don't) guarantee/i);
  assert.match(RD.LINE.zh, /信仰|信念/); assert.match(RD.LINE.zh, /判断/); assert.match(RD.LINE.zh, /不保证/);
  for (const l of LANGS) for (const o of LANGS) assert.doesNotMatch(RD.LINE[l], OLD[o], l + " line has old wording");
  // the dictionaries carry the same text under one key
  assert.ok(read("i18n/en-fortune.js").includes(JSON.stringify("fortune.disc.line") + ": " + JSON.stringify(RD.LINE.en)), "en-fortune.js fortune.disc.line");
  assert.ok(read("i18n/zh-fortune.js").includes(JSON.stringify("fortune.disc.line") + ": " + JSON.stringify(RD.LINE.zh)), "zh-fortune.js fortune.disc.line");
});

test("A1: every fortune page's HTML has no old wording (TH / EN / ZH, meta and attributes included) and shows the new line", () => {
  for (const p of PAGES) {
    const h = stripHtmlComments(read(p + ".html"));
    for (const l of LANGS) assert.doesNotMatch(h, OLD[l], `${p}.html still has old ${l} wording: ${(h.match(OLD[l]) || [])[0]}`);
    // report.html builds its notice in report.js; every other page has the line in its static markup
    if (p !== "report") {
      assert.ok(h.includes(LINE_TH), p + ".html shows the new line");
      assert.match(h, /data-i18n="fortune\.disc\.line"/, p + ".html line is translatable (fortune.disc.line)");
    }
  }
  assert.ok(read("report.js").includes("fortune.disc.line") && read("report.js").includes(LINE_TH), "report.js uses the new line");
});

// the page-own scripts and dictionaries of the fortune pages (shared site scripts are checked by key below)
function fortuneSources() {
  const own = new Set();
  for (const p of PAGES) {
    const h = read(p + ".html");
    for (const m of h.matchAll(/<script[^>]+src="([^"?#]+)/g)) {
      const s = m[1];
      if (/^(?:https?:)?\/\//.test(s) || s.startsWith("vendor/")) continue;
      if (/^(?:nav|lensiq-(?:config|crashguard|camera|track|detect|capture-hint|thai-canon|look|look-preview|look-lint|look-art|merit-lint)|photobooth-hq)\.js$/.test(s)) continue;
      if (/^i18n\/zh-products\.js$/.test(s)) continue;
      own.add(s);
    }
  }
  // EN siblings are loaded on demand: add the counterpart of every zh dictionary, and every reading dictionary
  for (const s of [...own]) if (s.startsWith("i18n/zh-")) own.add(s.replace("i18n/zh-", "i18n/en-"));
  for (const f of fs.readdirSync(path.join(ROOT, "i18n"))) if (/^(?:en|zh)-(?:kb-|fortune|report|luckycolor|planner)/.test(f)) own.add("i18n/" + f);
  for (const f of ["fortune-ai.js", "fortune-kit.js", "fortune-read.js", "fortune-straight.js", "fortune-crisis.js", "lensiq-report.js", "lensiq-planner.js", "lensiq-luckycolor.js"]) own.add(f);
  return [...own].filter(f => fs.existsSync(path.join(ROOT, f))).sort();
}

test("A1: no old wording in any fortune page script or EN / ZH dictionary (strings and comments)", () => {
  const files = fortuneSources();
  assert.ok(files.length >= 50, "found the fortune scripts: " + files.length);
  const bad = [];
  for (const f of files) {
    const s = read(f);
    for (const l of LANGS) { const m = s.match(OLD[l]); if (m) bad.push(f + " (" + l + "): " + s.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")); }
  }
  assert.deepEqual(bad, []);
});

test("A1: shared navigation / footer text about the fortune category has no old wording (TH / EN / ZH)", () => {
  const nav = read("nav.js");
  const fortuneIntro = nav.match(/intro:\s*"([^"]*ฤกษ์มงคล[^"]*)"/);
  assert.ok(fortuneIntro, "nav.js fortune group intro found");
  assert.doesNotMatch(fortuneIntro[1], OLD.th);
  for (const l of ["en", "zh"]) {
    const c = read("i18n/" + l + "-common.js");
    for (const k of ["nav.groupd.fortune", "foot.fortune"]) {
      const m = c.match(new RegExp(JSON.stringify(k).replace(/\./g, "\\.") + ":\\s*(\"(?:[^\"\\\\]|\\\\.)*\")"));
      assert.ok(m, l + " " + k + " present");
      assert.doesNotMatch(JSON.parse(m[1]), OLD[l], l + " " + k);
    }
  }
});

test("A1: the lawyer's list (docs/LEGAL-PACKET.md) asks whether the new line is enough without 'for entertainment'", () => {
  const lp = read("docs/LEGAL-PACKET.md");
  const at = lp.indexOf(LINE_TH);
  assert.ok(at >= 0, "LEGAL-PACKET quotes the new line");
  const block = lp.slice(Math.max(0, lp.lastIndexOf("\n### ", at)), lp.indexOf("\n### ", at + 1) > 0 ? lp.indexOf("\n### ", at + 1) : lp.length);
  assert.match(block, /เพื่อความบันเทิง/, "the question names the removed wording");
  assert.match(block, /\bL\d{2,3}\b/, "the item has an L-number");
  assert.match(block, /fortune|ดูดวง/i);
});

/* ---------------- A2 / A3 regrouping (pure part) ---------------- */
test("A2/A3: labels and short headings in TH / EN / ZH for every section id", () => {
  assert.deepEqual(RD.MORE, { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" });
  for (const l of LANGS) assert.ok(RD.LESS[l] && RD.LESS[l] !== RD.MORE[l], "LESS " + l);
  const want = { th: { overview: "ภาพรวม", work: "การงาน", money: "การเงิน", love: "ความรัก", health: "สุขภาพ", advice: "สิ่งที่ควรทำ" },
    en: { overview: "Overview", work: "Work", money: "Money", love: "Love", health: "Health", advice: "What to do" },
    zh: { overview: "总览", work: "事业", money: "财运", love: "感情", health: "健康", advice: "建议" } };
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(want[l])) assert.equal(RD.HEADINGS[l][k], v, l + " " + k);
    for (const id of FA.SECTION_IDS.concat(["brief"])) {
      const h = RD.HEADINGS[l][id];
      assert.ok(h && h.length <= (l === "zh" ? 6 : l === "en" ? 24 : 16), `${l} heading for ${id}: ${h}`);
      if (l !== "th") assert.doesNotMatch(h, /[฀-๿]/, l + " heading has Thai");
    }
  }
  assert.deepEqual(RD.SEP, { th: " ", en: " ", zh: "" });
});

const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const leadsOf = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 6);
let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  const DOMAINS = ["bazi", "taksa", "lek7", "zodiac", "horoscope", "numbers", "tarot", "dream", "face", "palm", "fengshui", "astro", "iching"];
  for (const d of DOMAINS) {
    const r = X.lcg(4100 + d.length * 37);
    for (let i = 0; i < 4; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      for (const lang of LANGS) for (const straight of [false, true]) {
        const res = FA.compose(f, { seed: 31 + i, lang, straight });
        if (res && res.sections && res.sections.length) out.push({ d, i, lang, straight, res });
      }
    }
  }
  CORPUS = out;
  return out;
}

test("A2: regrouping never changes a word — the parts put back together are exactly the composer's paragraphs (TH / EN / ZH)", async () => {
  const C = await corpus();
  assert.ok(C.length >= 200, "corpus size " + C.length);
  let paras = 0;
  for (const { d, lang, straight, res } of C) {
    for (const s of res.sections) {
      const parts = RD.plan(s.paragraphs, lang, { leads: leadsOf(lang) });
      s.paragraphs.forEach((p, k) => {
        paras++;
        const mine = parts.filter(x => x.para === k).map(x => x.text);
        assert.ok(mine.length >= 1, `${d} ${lang} ${s.id} paragraph ${k} lost`);
        assert.equal(mine.join(RD.SEP[lang]), p, `${d} ${lang}${straight ? " straight" : ""} ${s.id}: rejoined text differs`);
      });
      assert.equal(parts.length, parts.filter(x => typeof x.para === "number" && x.para < s.paragraphs.length).length, "no extra parts");
    }
  }
  assert.ok(paras >= 1000, "paragraphs checked " + paras);
});

test("A2: short paragraphs — at least 95 % of parts fit the per-language limit; the main point (first part) is shown first", async () => {
  const C = await corpus();
  let n = 0, short = 0;
  for (const { lang, res } of C) for (const s of res.sections) {
    const parts = RD.plan(s.paragraphs, lang, { leads: leadsOf(lang) });
    assert.ok(parts[0].visible, "first part is visible");
    assert.ok(parts[0].text.length >= 8, "first part has content: " + parts[0].text);
    for (const x of parts) { n++; if (x.text.length <= RD.MAXLEN[lang] || x.caution) short++; }
  }
  assert.ok(short / n >= 0.95, `${short}/${n} parts within the limit`);
  assert.ok(RD.MAXLEN.th <= 260 && RD.MAXLEN.en <= 360 && RD.MAXLEN.zh <= 130, "limits are short: " + JSON.stringify(RD.MAXLEN));
});

test("A3: an unfavourable / caution lead (straight or gentle) is never folded: every paragraph that carries one is shown in full", async () => {
  const C = await corpus();
  let withLead = 0, straightLead = 0;
  for (const { d, lang, straight, res } of C) {
    const L = leadsOf(lang);
    for (const s of res.sections) {
      const parts = RD.plan(s.paragraphs, lang, { leads: L });
      s.paragraphs.forEach((p, k) => {
        if (!L.some(l => p.includes(l))) return;
        withLead++; if (straight) straightLead++;
        for (const x of parts.filter(x => x.para === k)) {
          assert.ok(x.visible, `${d} ${lang}${straight ? " straight" : ""} ${s.id}: caution paragraph folded: ${x.text.slice(0, 60)}`);
          assert.ok(x.caution, "marked as caution");
        }
      });
    }
  }
  assert.ok(withLead >= 30 && straightLead >= 15, `caution paragraphs seen: ${withLead} (straight ${straightLead})`);
});

test("straight / gentle wording unchanged: compose output is the same with or without the layout module loaded", async () => {
  const X = await exportTool();
  const f = X.factsFor("bazi", 1, X.lcg(77));
  const a = JSON.stringify([false, true].map(st => LANGS.map(lang => FA.compose(f, { seed: 9, lang, straight: st }))));
  const had = globalThis.LQRead; globalThis.LQRead = RD;
  try {
    const b = JSON.stringify([false, true].map(st => LANGS.map(lang => FA.compose(f, { seed: 9, lang, straight: st }))));
    assert.equal(b, a);
  } finally { if (had === undefined) delete globalThis.LQRead; else globalThis.LQRead = had; }
});

test("the existing fortune-honest tests are untouched (current sha256 = the last locked line in evals-locks/fortune-honest.sha256)", () => {
  const lock = read("evals-locks/fortune-honest.sha256").split("\n").filter(l => /^[0-9a-f]{64}\s/.test(l));
  for (const f of ["tests/unit/fortune-honest.test.js", "tests/e2e/fortune-straight.e2e.mjs"]) {
    const last = lock.filter(l => l.split(/\s+/)[1] === f).pop();
    assert.ok(last, f + " locked");
    const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
    assert.equal(sha, last.split(/\s+/)[0], f + " changed after its last lock");
  }
});

/* ---------------- A4 advice icons and colour swatches ---------------- */
test("A4: colour names map to real colour values (TH / EN / ZH), no false hit on เงิน in การเงิน", () => {
  const hex = /^#[0-9a-f]{6}$/i;
  const th = RD.colours("สีที่เข้ากับผลครั้งนี้คือเขียว ม่วง และดำ ใช้กับเสื้อผ้าหรือของใช้ประจำวันได้", "th");
  assert.deepEqual(th.map(c => c.name), ["เขียว", "ม่วง", "ดำ"]);
  for (const c of th) assert.match(c.hex, hex);
  assert.notEqual(th[0].hex, th[1].hex);
  assert.deepEqual(RD.colours("เลขชีวิตแสดงว่าการเงินดีขึ้นเมื่อทำงานที่สอดคล้องกับคุณค่าของตัวเอง", "th"), []);
  assert.deepEqual(RD.colours("สีมงคลคือสีน้ำเงินและสีเงิน", "th").map(c => c.name), ["น้ำเงิน", "เงิน"]);
  assert.deepEqual(RD.colours("Colours that suit this reading: green, purple and black.", "en").map(c => c.name), ["green", "purple", "black"]);
  assert.deepEqual(RD.colours("Your money grows when you save.", "en"), []);
  assert.deepEqual(RD.colours("适合这次结果的颜色是绿色、紫色和黑色。", "zh").map(c => c.name), ["绿色", "紫色", "黑色"]);
  const many = { th: "สีแดง ชมพู ส้ม เหลือง ฟ้า ขาว เทา น้ำตาล ทอง", en: "colours: red, pink, orange, yellow, blue, white, grey, brown, gold",
    zh: "颜色：红色、粉色、橙色、黄色、蓝色、白色、灰色、棕色、金色" };
  for (const l of LANGS) {
    const got = RD.colours(many[l], l);
    assert.equal(got.length, 9, l + " nine colours: " + got.map(c => c.name).join(","));
    for (const c of got) assert.match(c.hex, hex, l + " " + c.name);
  }
});

test("A4: advice kinds (colour / worship / respect / direction) and the belief label in TH / EN / ZH", () => {
  assert.ok(RD.adviceKinds("สีที่เข้ากับผลครั้งนี้คือเขียว", "th").includes("colour"));
  assert.ok(RD.adviceKinds("ไหว้พระหรือสักการะสิ่งศักดิ์สิทธิ์ที่นับถือ", "th").includes("worship"));
  assert.ok(RD.adviceKinds("ขอบคุณและเคารพผู้ใหญ่ที่มีพระคุณ", "th").includes("respect"));
  assert.ok(RD.adviceKinds("ทิศที่ส่งเสริมคุณช่วงนี้คือทิศตะวันออก", "th").includes("direction"));
  assert.ok(RD.adviceKinds("Wear green or purple", "en").includes("colour") || RD.adviceKinds("Colours: green or purple", "en").includes("colour"));
  assert.ok(RD.adviceKinds("pay respect to your elders and ancestors", "en").includes("respect"));
  assert.ok(RD.adviceKinds("make merit or pray at a temple you trust", "en").includes("worship"));
  assert.ok(RD.adviceKinds("face the east when you work", "en").includes("direction"));
  assert.ok(RD.adviceKinds("可以去寺庙上香祈福", "zh").includes("worship"));
  assert.ok(RD.adviceKinds("多孝敬长辈", "zh").includes("respect"));
  assert.ok(RD.adviceKinds("有利的方位是东方", "zh").includes("direction"));
  assert.deepEqual(RD.adviceKinds("ตั้งใจทำงานทีละขั้น", "th"), []);
  assert.equal(RD.BELIEF.th, "ตามความเชื่อ โปรดใช้วิจารณญาณ");
  assert.match(RD.BELIEF.en, /belief/i); assert.match(RD.BELIEF.en, /judg(?:e)?ment/i);
  assert.match(RD.BELIEF.zh, /信仰|说法/); assert.match(RD.BELIEF.zh, /判断/);
});

test("A4: every icon is inline SVG (no image, link or remote URL), permissively licensed, and recorded in both licence files", () => {
  const ids = Object.keys(RD.ICONS);
  for (const k of ["colour", "worship", "respect", "direction"]) assert.ok(ids.includes(k), "icon " + k);
  const third = read("LICENSES/THIRD_PARTY.md"), credits = read("docs/CREDITS-MEDIA.md");
  for (const id of ids) {
    const ic = RD.ICONS[id];
    assert.match(ic.svg, /^<svg [^>]*viewBox="[^"]+"[^>]*>[\s\S]*<\/svg>$/, id + " is inline svg");
    assert.doesNotMatch(ic.svg, /<image|<use|href=|url\(|<script|<foreignObject/i, id + " has no external reference");
    assert.match(ic.licence, /^(?:MIT|Apache-2\.0|CC0-1\.0|CC-BY-4\.0)\b/, id + " licence " + ic.licence);
    assert.ok(ic.source && ic.source.length > 5, id + " source");
    for (const [name, doc] of [["LICENSES/THIRD_PARTY.md", third], ["docs/CREDITS-MEDIA.md", credits]]) {
      assert.ok(doc.includes("fortune-read.js"), name + " names fortune-read.js");
      assert.ok(doc.includes("`" + id + "`"), name + " lists icon `" + id + "`");
    }
  }
  // no picture of a deity or a real site: the icons are simple shapes drawn for LENSIQ
  for (const id of ids) assert.ok(RD.ICONS[id].svg.length < 2000, id + " is a small hand-drawn shape");
});

/* ---------------- A5 notices ---------------- */
test("A5: a notice is one short line; the rest goes behind read more; the text put back together is unchanged", () => {
  assert.ok(RD.NOTE_MAX.th <= 140 && RD.NOTE_MAX.en <= 210 && RD.NOTE_MAX.zh <= 80, JSON.stringify(RD.NOTE_MAX));
  for (const l of LANGS) assert.ok(RD.LINE[l].length <= RD.NOTE_MAX[l], l + " new line is one short line: " + RD.LINE[l].length);
  const cases = {
    th: "นี่คือการอ่านตามตำราและความเชื่อดั้งเดิมเท่านั้น ไม่มีอะไรแน่นอน โปรดพิจารณาด้วยเหตุผลของตัวเองตามหลักกาลามสูตร และจำไว้ว่าชีวิตเปลี่ยนได้เสมอด้วยการกระทำที่ดีในทุกวัน",
    en: "This is a reading of traditional texts and beliefs only. Nothing is certain. Weigh it with your own reasoning, as the Kalama Sutta " +
      "advises, and remember that life can always change through good actions every day.",
    zh: "这只是依据传统典籍与信仰的解读，没有什么是确定的。请按照《卡拉玛经》的教导，用自己的理性来判断，并记住生活总能通过每天的善行而改变。",
  };
  for (const l of LANGS) {
    const [line, rest] = RD.noticeSplit(cases[l], l);
    assert.ok(line.length > 0 && line.length <= RD.NOTE_MAX[l], l + " line length " + line.length);
    assert.ok(rest.length > 0, l + " rest");
    assert.equal(line + RD.SEP[l] + rest, cases[l], l + " rejoined");
    const [s1, r1] = RD.noticeSplit(RD.LINE[l], l);
    assert.equal(s1, RD.LINE[l]); assert.equal(r1, "");
  }
});

test("A5: the help line and the crisis card are never collapsible (skip list, and their markup has no read-more parts)", () => {
  for (const sel of [".lq-helpline", ".fa-support"]) assert.ok(RD.NEVER_COLLAPSE.includes(sel), "skip list has " + sel);
  const CR = require("../../fortune-crisis.js");
  for (const l of LANGS) {
    const card = FA.toHTML(FA.crisis.result({ lang: l }));
    assert.match(card, /fa-support/);
    assert.doesNotMatch(card, /lq-more|lq-notice-more|<details/, l + " crisis card has nothing folded");
    if (CR.helpHTML) assert.doesNotMatch(CR.helpHTML(l, "x"), /lq-more|lq-notice-more|<details/, l + " help line has nothing folded");
  }
  for (const p of PAGES) {
    const h = read(p + ".html");
    for (const id of ["lqHelpTop", "lqHelpEnd"]) {
      const at = h.indexOf('id="' + id + '"');
      if (at < 0) continue;
      const end = h.indexOf("</aside>", at);
      assert.doesNotMatch(h.slice(at, end), /lq-more|lq-notice-more|<details|lq-notice/, `${p} #${id} has nothing folded`);
    }
  }
});

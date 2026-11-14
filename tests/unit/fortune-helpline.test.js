"use strict";
// tests/unit/fortune-helpline.test.js — FIXED TEST SET, "help line" (owner order 2026-11-12), locked BEFORE the build.
// 1) Every fortune page carries a calm help line IN THE HTML (works without JavaScript): one near the top (before <main>)
//    and one at the end of <main>, with tel: links for 1323 and 1669 and the verified Thai wording.
// 2) English and Chinese wording lives in i18n/{en,zh}-common.js (keys help.line.*) and equals the canonical table
//    LQFortuneCrisis.HELP in fortune-crisis.js; the static Thai equals HELP.th. No Thai letters in EN / ZH.
// 3) Every number published (the line, HELP, the support card) is in the "Verified" table of docs/CRISIS-RESOURCES.md
//    with an official https source and a date; "free" and "24 hours" are only claimed where that table says so.
// 4) Crisis state: once the support card is shown on a page, the page is in the crisis state (page-level flag on the
//    document): (re-lock 2026-11-13, crisis flow v2: later readings are calm readings, not the card) no plan, no remedy text and no hook output (merit / paid / straight mode come as hooks or
//    renderers that must ask FortuneAI.crisis.allow()) is rendered on that page any more. Another document is not
//    affected. A normal reading carries the help line under it.
// 5) Blocks that show lucky items, recommendations, lead forms or share cards on pages where the net can trigger are
//    marked data-lq-remedy, and styles.css hides them while <html data-lq-crisis> is set.
// AMENDED 2026-11-14 (owner order Part B, re-locked before the build on branch helpline-b): the line is now the shared
//    tap-to-call component (lensiq-helpline.js) with the owner's warm 1323 wording ("อยากมีคนรับฟัง โทร 1323" /
//    "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง" / "บริการของกรมสุขภาพจิต"); the expected wording and i18n keys follow it.
//    Every other assertion (placement, no-JS, tel links and their order, EN / ZH without Thai, verified claims) is unchanged.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const PAGES = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
const THAI = /[\u0E00-\u0E7F]/;
// RE-LOCK 2026-11-14 (owner addition after testing on a phone: one compact row, short label + call button): the label and the
//    button text have their own keys (call.<n>.label / .go); the whole wording (call.<n>.btn) is the button's aria-label key.
const KEYS = ["help.line.label", "call.1323.btn", "call.1323.label", "call.1323.go", "call.1323.sub", "call.1323.org", "call.1669.btn", "call.1669.label",
  "call.1669.go", "help.line.note"];

/** the outer HTML of the element with this id (balanced on its own tag name) */
function block(html, id) {
  const m = new RegExp("<(\\w+)[^>]*\\bid=\"" + id + "\"[^>]*>").exec(html);
  if (!m) return null;
  const tag = m[1];
  let depth = 0;
  const re = new RegExp("<" + tag + "\\b|</" + tag + ">", "g"); re.lastIndex = m.index;
  let x;
  while ((x = re.exec(html))) { depth += x[0][1] === "/" ? -1 : 1; if (depth === 0) return { start: m.index, end: re.lastIndex, html: html.slice(m.index, re.lastIndex), open: m[0] }; }
  return null;
}
const text = h => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** dictionary file -> {key: value} for the help.line keys */
function dict(file) {
  const src = read(file), out = {};
  for (const k of KEYS) { const m = new RegExp('"' + k.replace(/\./g, "\\.") + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(src); if (m) out[k] = JSON.parse('"' + m[1] + '"'); }
  return out;
}

/** docs/CRISIS-RESOURCES.md "## Verified" table -> {number: {hours, cost, source, date}} */
function verified() {
  const md = read("docs/CRISIS-RESOURCES.md");
  const sec = md.split(/^## Verified\s*$/m)[1].split(/^## /m)[0];
  const out = {};
  for (const line of sec.split("\n")) {
    const c = line.split("|").map(s => s.trim());
    if (c.length < 8 || !/^\d[\d ]+$/.test(c[1])) continue;
    out[c[1].replace(/\s+/g, "")] = { hours: c[3], cost: c[4], source: c[5], date: c[6] };
  }
  return out;
}

test("verified table: 1323 free + 24 h, 1669, 191, 1300, Samaritans; each with an official https source and a 2026 date", () => {
  const V = verified();
  for (const n of ["1323", "1669", "191", "1300", "021136789"]) {
    assert.ok(V[n], "verified row for " + n);
    assert.match(V[n].source, /https:\/\/[^\s]*(?:\.go\.th|samaritansthai\.com)/, n + " source is official");
    assert.match(V[n].date, /^2026-\d\d-\d\d$/, n + " date");
  }
  assert.match(V["1323"].hours, /24 hours/); assert.match(V["1323"].cost, /^Free/);
});

test("every fortune page has the help line in the HTML: top (before <main>) and end of <main>, tel:1323 + tel:1669, Thai wording", () => {
  for (const p of PAGES) {
    const html = read(p + ".html"), main = html.search(/<main\b/), mainEnd = html.lastIndexOf("</main>");
    assert.ok(main > 0 && mainEnd > main, p + ": has <main>");
    for (const id of ["lqHelpTop", "lqHelpEnd"]) {
      const b = block(html, id);
      assert.ok(b, p + ": #" + id);
      assert.match(b.open, /class="[^"]*\blq-helpline\b/, p + " #" + id + " class");
      assert.match(b.open, /role="note"/, p + " #" + id + " role");
      assert.doesNotMatch(b.open, /\bhidden\b|display:\s*none/, p + " #" + id + " is visible without JS");
      assert.ok(!/<noscript[^>]*>(?:(?!<\/noscript>)[\s\S])*$/.test(html.slice(0, b.start)), p + " #" + id + " not inside <noscript>");
      if (id === "lqHelpTop") assert.ok(b.start < main, p + ": top line comes before <main>");
      else assert.ok(b.start > main && b.end <= mainEnd, p + ": end line is inside <main>");
      const tels = [...b.html.matchAll(/href="tel:([^"]+)"/g)].map(m => m[1]);
      assert.deepEqual(tels, ["1323", "1669"], p + " #" + id + " tel links");
      const t = text(b.html);
      for (const w of ["อยากมีคนรับฟัง โทร 1323", "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง", "บริการของกรมสุขภาพจิต", "เจ็บป่วยฉุกเฉิน โทร 1669",
        "อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น"]) assert.ok(t.includes(w), p + " #" + id + " has '" + w + "': " + t);
      for (const k of KEYS.slice(1)) {
        assert.ok(b.html.includes(/\.btn$/.test(k) ? 'data-i18n-attr="aria-label:' + k + '"' : 'data-i18n="' + k + '"'), p + " #" + id + " key " + k);
      }
    }
  }
});

test("EN / ZH wording: complete, no Thai, verified claims only; the ZH line says there is no verified Chinese line in Thailand", () => {
  const en = dict("i18n/en-common.js"), zh = dict("i18n/zh-common.js");
  for (const k of KEYS) {
    assert.ok(en[k], "en " + k); assert.ok(zh[k], "zh " + k);
    assert.doesNotMatch(en[k], THAI, "en " + k + " has Thai"); assert.doesNotMatch(zh[k], THAI, "zh " + k + " has Thai");
  }
  assert.match(en["call.1323.btn"], /someone to listen[\s\S]*1323/i); assert.match(en["call.1323.sub"], /24 hours/);
  assert.match(en["call.1323.org"], /Department of Mental Health/); assert.match(en["call.1669.btn"], /medical emergency[\s\S]*1669/i);
  assert.match(en["help.line.note"], /local emergency number/);
  assert.match(zh["call.1323.btn"], /倾听[\s\S]*1323/); assert.match(zh["call.1323.sub"], /24 小时/); assert.match(zh["call.1323.org"], /心理健康司/);
  assert.match(zh["call.1669.btn"], /医疗急救[\s\S]*1669/); assert.match(zh["help.line.note"], /没有经核实的泰国中文热线/); assert.match(zh["help.line.note"], /当地紧急电话/);
  // canonical table in fortune-crisis.js
  delete require.cache[require.resolve(join(ROOT, "fortune-crisis.js"))];
  const CR = require(join(ROOT, "fortune-crisis.js"));
  assert.ok(CR.HELP && CR.HELP.th && CR.HELP.en && CR.HELP.zh, "LQFortuneCrisis.HELP");
  // the line's own text (label, note) is HELP; the call buttons' text is the shared component's (lensiq-helpline.js)
  const LQH = require(join(ROOT, "lensiq-helpline.js"));
  const own = { "help.line.label": "label", "help.line.note": "note" };
  const val = (lang, k) => own[k] ? CR.HELP[lang][own[k]] : LQH.LINES[k.split(".")[1]][lang][k.split(".")[2]];
  for (const k of KEYS) { assert.equal(val("en", k), en[k], "HELP.en = en-common " + k); assert.equal(val("zh", k), zh[k], "HELP.zh = zh-common " + k); }
  const topTh = text(block(read("dream.html"), "lqHelpTop").html);
  for (const k of KEYS.slice(1)) assert.ok(topTh.includes(val("th", k)), "static Thai = " + k);
  assert.deepEqual(CR.HELP.tel, ["1323", "1669"]);
});

test("support card: every number is verified; 'free' / '24 hours' only where the verified table says so", () => {
  delete require.cache[require.resolve(join(ROOT, "fortune-ai.js"))];
  const FA = require(join(ROOT, "fortune-ai.js")), V = verified();
  for (const lang of ["th", "en", "zh"]) {
    const s = FA.crisis.result({ lang }).support;
    for (const l of s.lines) {
      const n = String(l.tel || l.n).replace(/\D/g, "");
      assert.ok(V[n], lang + ": " + l.n + " is in the verified table");
      if (/ฟรี|\bfree\b|免费/i.test(l.t)) assert.match(V[n].cost, /^Free/, lang + " " + l.n + " claims free: " + l.t);
      if (/24\s*(?:ชั่วโมง|ชม|hours?|小时)/i.test(l.t)) assert.match(V[n].hours, /24 hours/, lang + " " + l.n + " claims 24 h: " + l.t);
    }
    const nums = s.lines.map(l => String(l.tel || l.n).replace(/\D/g, ""));
    for (const n of ["1323", "1669", "191"]) assert.ok(nums.includes(n), lang + " card keeps " + n);
  }
  // 1300's source lists domestic violence and children / young people, not "abuse" in general
  assert.doesNotMatch(FA.crisis.result({ lang: "en" }).support.lines.find(l => l.n === "1300").t, /\babuse\b/);
});

/* ---------- minimal DOM (enough for renderSections / renderSupport) ---------- */
function fakeDoc() {
  let doc;
  const node = tag => ({
    tag, children: [], attrs: {}, className: "", _text: "", style: {},
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map(c => c.textContent).join(""); },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { if (c && c.tag === "#frag") this.children.push(...c.children); else this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; },
    querySelector() { return null; }, querySelectorAll() { return []; }, remove() {}, focus() {}, addEventListener() {},
    get ownerDocument() { return doc; }
  });
  doc = {
    createElement: node, createDocumentFragment: () => node("#frag"),
    createTextNode: t => ({ tag: "#text", textContent: String(t) }),
    getElementById: () => null, head: node("head"), body: node("body"), documentElement: node("html"), readyState: "complete",
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; }, dispatchEvent() { return true; }
  };
  return doc;
}
const ser = n => n.tag === "#text" ? n.textContent : "<" + n.tag + (n.className ? " class=\"" + n.className + "\"" : "") +
  Object.keys(n.attrs).map(k => " " + k + "=\"" + n.attrs[k] + "\"").join("") + (n.href ? " href=\"" + n.href + "\"" : "") + ">" + n._text + n.children.map(ser).join("") + "</" + n.tag + ">";

const READING = {
  source: "local", lang: "th",
  summary: { title: "สรุปสั้น", lines: [{ k: "งาน", t: "ช่วงนี้งานเดินหน้าได้" }] },
  plan: { title: "แผนสั้น ๆ", items: [{ for: "งาน", t: "วิธีปรับตามตำราคือใส่เสื้อสีขาวในวันจันทร์" }] },
  sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["ภาพรวมช่วงนี้ค่อนข้างมั่นคง ข้อแนะนำทั่วไปคือพักผ่อนให้พอ"] }],
  reminder: "ใช้วิจารณญาณของตัวเอง",
};

test("a normal reading carries the help line (tel:1323, tel:1669) under it; the plan is marked data-lq-remedy", () => {
  delete require.cache[require.resolve(join(ROOT, "fortune-ai.js"))];
  const FA = require(join(ROOT, "fortune-ai.js")), doc = fakeDoc(), box = doc.createElement("div");
  FA.renderSections(box, READING, { aiBadge: false });
  const h = ser(box);
  assert.match(h, /fa-section/); assert.match(h, /fa-plan/);
  assert.match(h, /<section class="fa-plan"[^>]*data-lq-remedy/, "plan marked data-lq-remedy");
  assert.match(h, /class="lq-helpline[^"]*"[\s\S]*tel:1323[\s\S]*tel:1669/, "help line under the reading");
  assert.ok(h.lastIndexOf("lq-helpline") > h.lastIndexOf("fa-section"), "help line comes after the reading");
  const html = FA.toHTML(READING);
  assert.match(html, /class="lq-helpline[^"]*"[\s\S]*href="tel:1323"[\s\S]*href="tel:1669"/, "toHTML carries the help line");
  assert.match(html, /<section class="fa-plan"[^>]*data-lq-remedy/, "toHTML plan marked");
});

// RE-LOCK 2026-11-13 (owner decision 2026-11-13 crisis flow v2: "never block the reading"): after the card, a later reading on the
// page (no new hard-net signal) is a CALM reading (sections, no plan, no remedy text, help line kept), not the card again.
test("crisis state: after the support card, a later reading on the page is calm (no plan, remedy text or hook output); allow() says no; other pages unaffected", () => {
  delete require.cache[require.resolve(join(ROOT, "fortune-ai.js"))];
  const FA = require(join(ROOT, "fortune-ai.js")), doc = fakeDoc();
  assert.equal(typeof FA.crisis.active, "function"); assert.equal(typeof FA.crisis.allow, "function");
  assert.equal(FA.crisis.active(doc), false);
  for (const k of ["remedy", "lucky", "paid", "merit", "straight"]) assert.equal(FA.crisis.allow(k, doc), true, "allow " + k + " before");
  FA.crisis.render(doc.createElement("div"), FA.crisis.result({ lang: "th" }));
  assert.equal(FA.crisis.active(doc), true, "support card sets the page crisis state");
  assert.equal(doc.documentElement.getAttribute("data-lq-crisis"), "1", "<html data-lq-crisis=1>");
  for (const k of ["remedy", "lucky", "paid", "merit", "straight"]) assert.equal(FA.crisis.allow(k, doc), false, "allow " + k + " during crisis");
  let calls = 0;
  const off = FA.registerHooks({ gate: r => { calls++; return r; }, decorate: c => { calls++; c.appendChild(c.ownerDocument.createElement("aside")); } });
  try {
    for (const lang of ["th", "en", "zh"]) {
      const box = doc.createElement("div");
      FA.renderSections(box, Object.assign({}, READING, { lang }), { aiBadge: false });
      const h = ser(box), t = box.textContent;
      assert.doesNotMatch(h, /fa-support/, lang + ": no card again without a new signal (re-lock: crisis flow v2)");
      assert.match(h, /fa-section/, lang + ": the reading is shown (re-lock: crisis flow v2, never block)");
      assert.doesNotMatch(h, /fa-plan/, lang + ": no plan");
      assert.ok(!/วิธีปรับ|ข้อแนะนำทั่วไปคือ|เสื้อสีขาว|A simple adjustment|调整的方法/.test(t), lang + ": no remedy text");
      assert.match(t, /1323/, lang + ": card keeps 1323");
    }
    assert.equal(calls, 0, "no hook (merit / paid / straight) runs in the crisis state");
    const html = FA.toHTML(READING, { doc });
    assert.doesNotMatch(html, /fa-support|fa-plan/); assert.match(html, /fa-section/); // re-lock: crisis flow v2, a calm reading
  } finally { off(); }
  // page-level: another document is not in the crisis state
  const other = fakeDoc(), b2 = other.createElement("div");
  assert.equal(FA.crisis.active(other), false);
  FA.renderSections(b2, READING, { aiBadge: false });
  assert.match(ser(b2), /fa-section/, "another page still reads normally");
});

test("remedy / lucky / lead / recommendation / share blocks are marked data-lq-remedy and hidden by styles.css in the crisis state", () => {
  const marked = { faceread: [".fr-lucky", "#frReco", "#frLead", "#frShare"], palm: [".pl-lucky", "#plShare"], numbers: ["#nmGoals", "#nmWordsBlock", "#nmShare"],
    horoscope: ["#hsShare"], tarot: ["#trShare", "#ssShare"], iching: ["#icShare"], dream: ["#drShare"] };
  for (const [p, sels] of Object.entries(marked)) {
    const html = read(p + ".html");
    for (const s of sels) {
      const re = s[0] === "#" ? new RegExp("<\\w+[^>]*\\bid=\"" + s.slice(1) + "\"[^>]*>") : new RegExp("<\\w+[^>]*class=\"[^\"]*\\b" + s.slice(1) + "\\b[^\"]*\"[^>]*>");
      const m = re.exec(html);
      assert.ok(m, p + " " + s + " exists");
      assert.match(m[0], /\bdata-lq-remedy\b/, p + " " + s + " marked data-lq-remedy");
    }
  }
  // any future block named merit / remedy / straight / paid on a fortune page must be marked too
  for (const p of PAGES) for (const m of read(p + ".html").matchAll(/<\w+[^>]*(?:id|class)="[^"]*(?:merit|remed|straight|paid)[^"]*"[^>]*>/gi)) assert.match(m[0], /data-lq-remedy/, p + ": " + m[0]);
  const css = read("styles.css").replace(/\s+/g, "");
  assert.ok(css.includes("html[data-lq-crisis][data-lq-remedy]{display:none!important}"), "styles.css hides marked blocks in the crisis state");
  assert.ok(css.includes(".lq-helpline"), "styles.css styles the help line");
});

"use strict";
// tests/unit/crisis-v3.test.js — FIXED TEST SET "crisis-v3" (owner decision 2026-11-17), the unit half; locked BEFORE any v3 product
// code (evals-locks/crisis-v3.sha256, ~/LENSIQ-field/evals/crisis-v3/). The browser half is tests/e2e/crisis-v3-{a,b,c,d}.e2e.mjs.
//   U1 a crisis phrase in the nickname or question: FortuneAI.interpret still returns a READING (not the support card), in TH / EN
//      / ZH, with at least 2 sections, never straight, and without the typed text (no echo) — and the crisis state is set.
//   U2 FortuneAI.crisis.render never draws a card any more: nothing with fa-support and none of the card's wording.
//   U3 the closing line (fortune-crisis.js helpHTML): one short warm line naming 1323, one tel:1323 button, the counselling link
//      after it; no other number; TH / EN / ZH.
//   U4 a reading drawn while the page is in the crisis state (toHTML): the sections, then the closing line exactly once at the end.
//   U5 the crisis / calm styles hide share and print controls (ids ending in Share / Print, data-lq-share / data-lq-print) besides
//      remedies, plans and paid blocks.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const LANGS = ["th", "en", "zh"];
const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
const CLOSE = { th: /ทุกข์ใจ[\s\S]*1323|1323[\s\S]*รับฟัง/, en: /(?:talk|someone)[\s\S]*1323|1323[\s\S]*listen/i, zh: /(?:倾听|聊)[\s\S]*1323|1323[\s\S]*(?:倾听|聊)/ };
const CARD_WORDS = /ขอหยุดคำทำนาย|ฟังดูหนักใจ|pause the reading|sounds heavy|暂停这次解读|听起来很沉重/;
const fresh = f => { const p = path.join(ROOT, f); delete require.cache[require.resolve(p)]; return require(p); };
const strip = h => h.replace(/<[^>]+>/g, " ");

function fakeDoc() {
  let doc;
  const node = tag => ({
    tag, children: [], attrs: {}, className: "", _text: "", style: {},
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map(c => c.textContent).join(""); },
    appendChild(c) { if (c && c.tag === "#frag") this.children.push(...c.children); else this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    hasAttribute(k) { return k in this.attrs; }, querySelector() { return null; }, querySelectorAll() { return []; }, remove() {}, focus() {}, addEventListener() {},
    get ownerDocument() { return doc; },
  });
  doc = { createElement: node, createDocumentFragment: () => node("#frag"), createTextNode: t => ({ tag: "#text", textContent: String(t) }), getElementById: () => null,
    head: node("head"), body: node("body"), documentElement: node("html"), readyState: "complete", addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; } };
  return doc;
}
const ser = n => n.tag === "#text" ? n.textContent : "<" + n.tag + (n.className ? ' class="' + n.className + '"' : "") +
  Object.keys(n.attrs).map(k => " " + k + '="' + n.attrs[k] + '"').join("") + (n.href ? ' href="' + n.href + '"' : "") + ">" + n._text + n.children.map(ser).join("") + "</" + n.tag + ">";

const FACTS = { domain: "tarot", topic: "overall", items: [
  { id: "card.past.star", label: "ไพ่ดวงดาว", strength: 0.8, tags: ["overview"], meanings: { overview: ["คุณมีความหวังและกำลังใจที่ดี"], love: ["ความรักค่อย ๆ ดีขึ้น"], work: ["งานเดินหน้าได้"] } },
  { id: "card.present.sun", label: "ไพ่พระอาทิตย์", strength: 0.9, tags: ["overview"], meanings: { overview: ["ช่วงนี้มีพลังและความสดใส"], love: ["ความสัมพันธ์อบอุ่น"], work: ["ผลงานเป็นที่ยอมรับ"] } },
] };

test("U1: a crisis phrase in the nickname or question: the reading continues (TH / EN / ZH), never straight, no echo; the state is set", async () => {
  for (const lang of LANGS) {
    const FA = fresh("fortune-ai.js");
    for (const f of [Object.assign({}, FACTS, { subject: { nickname: PHRASE[lang] } }), Object.assign({}, FACTS, { question: PHRASE[lang] })]) {
      const r = await FA.interpret(f, { useAI: false, lang });
      assert.notEqual(r.source, "support", lang + ": not the support card");
      assert.ok(!r.crisis, lang + ": not a crisis result");
      assert.ok(Array.isArray(r.sections) && r.sections.length >= 2, lang + ": a reading with sections");
      assert.notEqual(r.mode, "straight", lang + ": never straight");
      const text = JSON.stringify(r);
      for (let i = 0; i + 3 <= PHRASE[lang].length; i++) assert.ok(!text.includes(PHRASE[lang].slice(i, i + 3)) || /^\s/.test(PHRASE[lang].slice(i, i + 3)),
        lang + ": the typed text is not echoed (" + PHRASE[lang].slice(i, i + 3) + ")");
    }
  }
});

test("U2: FortuneAI.crisis.render draws no card", () => {
  const FA = fresh("fortune-ai.js");
  for (const lang of LANGS) {
    const doc = fakeDoc(), box = doc.createElement("div");
    FA.crisis.render(box, FA.crisis.result({ lang }));
    const h = ser(box);
    assert.doesNotMatch(h, /fa-support/, lang + ": no card element");
    assert.doesNotMatch(strip(h), CARD_WORDS, lang + ": none of the card's wording");
  }
});

test("U3: the closing line: a warm line naming 1323, one tel:1323 button, the counselling link after it, no other number", () => {
  const CR = fresh("fortune-crisis.js");
  for (const lang of LANGS) {
    const h = CR.helpHTML(lang, "lq-helpline-result");
    assert.match(strip(h), CLOSE[lang], lang + ": warm closing line");
    assert.deepEqual([...h.matchAll(/href="tel:([^"]*)"/g)].map(m => m[1]), ["1323"], lang + ": one button, tel:1323");
    assert.ok(h.indexOf('href="counselling.html"') > h.indexOf('href="tel:1323"'), lang + ": the counselling link under the button");
    assert.doesNotMatch(strip(h), /(?<!\d)(?:1669|191|1300)(?!\d)|02[\s-]?113[\s-]?6789/, lang + ": no other number");
  }
});

test("U4: a reading drawn in the crisis state: the sections, then the closing line once at the end", () => {
  const FA = fresh("fortune-ai.js");
  const READING = { source: "local", lang: "th", sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["ช่วงนี้ค่อย ๆ ดีขึ้น"] }, { id: "love", title: "ความรัก", paragraphs: ["อบอุ่น"] }] };
  const doc = fakeDoc(); doc.documentElement.setAttribute("data-lq-crisis", "1"); doc.documentElement.setAttribute("data-lq-calm", "1");
  FA.crisis.setActive(doc);
  const box = doc.createElement("div");
  FA.renderSections(box, READING, { aiBadge: false });
  const h = ser(box);
  assert.match(h, /fa-section/, "the reading is drawn");
  assert.doesNotMatch(h, /fa-support/, "no card");
  assert.equal((h.match(/class="lq-helpline/g) || []).length, 1, "closing line once");
  assert.ok(h.lastIndexOf("lq-helpline") > h.lastIndexOf("fa-section"), "closing line after the last section");
});

test("U5: the crisis / calm styles hide share and print controls with remedies, plans and paid blocks", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8") + fs.readFileSync(path.join(ROOT, "fortune-crisis.js"), "utf8");
  for (const sel of ['[id$="Share"]', '[id$="Print"]', "[data-lq-share]", "[data-lq-print]"]) {
    assert.ok(new RegExp("html\\[data-lq-(?:crisis|calm)\\][^{]*" + sel.replace(/[[\]$"]/g, "\\$&")).test(css), "hidden in the crisis / calm state: " + sel);
  }
});

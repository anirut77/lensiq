"use strict";
// tests/unit/crisis-v2-live.test.js — FIXED TEST SET, crisis flow v2 go-live (owner decision 1 option ก 2026-11-15: ship the
// version that passed independent review 3, merge-staging-crisis 921ecb6, on top of main 507b56a, "with the single help button
// rule applied"; decision 54 ข; decision 23 default ก). Locked BEFORE the build (evals-locks/crisis-v2-live.sha256,
// ~/LENSIQ-field/evals/crisis-v2-live/). The browser half is tests/e2e/crisis-v2-live.e2e.mjs.
//   L1  one help place: the top 1323 button. A calm page (markCalm) adds ONE "more help numbers" control INSIDE #lqHelpTop with
//       1669, 191, 1300 and Samaritans as tel: links, each once; 1323 stays exactly once on the page; no pinned bar, no dock,
//       no help line under the reading (fortune-ai.js toHTML / renderSections in the calm state draw no tel: link at all).
//   L2  the acknowledgement card: the five verified lines; "continue" collapses it into the reading and leaves every number at
//       most once on the page (1323 exactly once: the top button), no pinned bar.
//   L3  the hope frame and the card's continue note name no help number (the top button is the one place for 1323) and do not
//       point to the bottom of the screen.
//   L4  decision 23 (coordinator default ก) and CLAUDE.md hard limit 3: in the calm or crisis state allow() refuses free belief
//       guidance as well as remedies, lucky items, paid, merit, plans, leads, shares, recommendations and straight mode; the
//       normal state allows them. calmText drops free belief guidance (ไหว้ไท้ส่วย, merit-making, prayer, gems, lucky items).
//   L5  no echo: a name-like distress entry ("Kill…", Thai names with a distress word) is never written back by the reading,
//       the card or the soft step.
const test = require("node:test");
const assert = require("node:assert/strict");

const CR = require("../../fortune-crisis.js");
const FA = require("../../fortune-ai.js");

const LANGS = ["th", "en", "zh"];
const NUMBERS = ["1323", "1669", "191", "1300", "021136789"];
const OTHERS = ["1669", "191", "1300", "021136789"];
const CONT = { th: "ดูคำทำนายต่อ", en: "Continue to the reading", zh: "继续查看解读" };

/* ---------------- a small DOM with events and simple selectors (same shape as fortune-crisis-flow-v2.test.js) ---------------- */
function fakeDoc() {
  let doc;
  const match = (n, sel) => {
    if (!n || !n.tag || n.tag[0] === "#") return false;
    return sel.split(",").some(one => {
      const s = one.trim(); let m;
      if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s))) return m[2] == null ? m[1] in n.attrs : n.attrs[m[1]] === m[2];
      if ((m = /^\.([\w-]+)$/.exec(s))) return (" " + n.className + " ").includes(" " + m[1] + " ");
      if ((m = /^#([\w-]+)$/.exec(s))) return n.attrs.id === m[1];
      if ((m = /^([a-z0-9]+)$/i.exec(s))) return n.tag === m[1].toLowerCase();
      if ((m = /^a\[href\^="tel:"\]$/.exec(s))) return n.tag === "a" && /^tel:/.test(n.attrs.href || n.href || "");
      return false;
    });
  };
  const all = (n, out = []) => { for (const c of n.children || []) { out.push(c); all(c, out); } return out; };
  const node = tag => {
    const n = {
      tag: String(tag).toLowerCase(), children: [], attrs: {}, className: "", _text: "", style: {}, handlers: {}, parentNode: null, hidden: false,
      set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map(c => c.textContent).join(""); },
      get innerText() { return this.textContent; },
      get firstChild() { return this.children[0] || null; }, get parentElement() { return this.parentNode; },
      get id() { return this.attrs.id || ""; }, set id(v) { this.attrs.id = String(v); },
      get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; },
      appendChild(c) {
        if (c && c.tag === "#frag") { for (const x of c.children) { x.parentNode = this; this.children.push(x); } c.children = []; } else if (c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); }
        return c;
      },
      insertBefore(c, ref) { if (c.parentNode) c.parentNode.removeChild(c); const i = this.children.indexOf(ref); c.parentNode = this; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return k === "class" ? this.className || null : k in this.attrs ? this.attrs[k] : k === "href" && this.href ? this.href : null; },
      hasAttribute(k) { return k in this.attrs; },
      get classList() {
        const self = this, has = c => (" " + self.className + " ").includes(" " + c + " ");
        return { contains: has, add: c => { if (!has(c)) self.className = (self.className + " " + c).trim(); },
          remove: c => { self.className = (" " + self.className + " ").replace(" " + c + " ", " ").trim(); }, toggle: (c, on) => { if (on === false || (on == null && has(c))) self.classList.remove(c); else self.classList.add(c); } };
      },
      addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }, removeEventListener() {},
      click() { for (const f of this.handlers.click || []) f({ type: "click", preventDefault() {}, target: this }); },
      dispatchEvent() { return true; }, focus() {}, scrollIntoView() {},
      querySelector(sel) { return all(this).find(c => match(c, sel)) || null; }, querySelectorAll(sel) { return all(this).filter(c => match(c, sel)); },
      closest(sel) { for (let e = this; e; e = e.parentNode) if (match(e, sel)) return e; return null; },
      get isConnected() { return true; }, get ownerDocument() { return doc; }, getBoundingClientRect() { return { top: 0, bottom: 0, height: 0, width: 0 }; },
    };
    return n;
  };
  doc = {
    createElement: node, createDocumentFragment: () => node("#frag"), createTextNode: t => ({ tag: "#text", textContent: String(t), children: [] }),
    head: node("head"), body: node("body"), documentElement: node("html"), readyState: "complete",
    getElementById(id) { return all(this.body).concat(all(this.head)).find(n => n.attrs && n.attrs.id === id) || null; },
    addEventListener() {}, dispatchEvent() { return true; },
    querySelector(sel) { return this.body.querySelector(sel); }, querySelectorAll(sel) { return this.body.querySelectorAll(sel); },
  };
  return doc;
}
const deep = n => (n.children || []).flatMap(c => [c].concat(deep(c)));
const hrefOf = n => String(n.getAttribute("href") || n.href || "").replace(/\s+/g, "");
const telCount = (root, num) => deep(root).filter(n => n.tag === "a" && hrefOf(n) === "tel:" + num).length;

/** a fortune page as tools/helpline.mjs writes it: the static top button (1323 only) right before <main> */
function fortunePage() {
  const doc = fakeDoc();
  const top = doc.createElement("aside"); top.setAttribute("id", "lqHelpTop"); top.setAttribute("class", "lq-helpline lq-helpbar"); top.setAttribute("role", "note");
  const mini = doc.createElement("span"); mini.setAttribute("class", "lq-call-mini"); mini.setAttribute("data-lq-call", "1323");
  const a = doc.createElement("a"); a.setAttribute("class", "lq-call-btn lq-helpline-tel"); a.setAttribute("href", "tel:1323");
  const t = doc.createElement("span"); t.setAttribute("class", "lq-call-mini-t"); t.textContent = "อยากมีคนรับฟัง";
  const b = doc.createElement("b"); b.setAttribute("class", "lq-call-mini-n"); b.textContent = "1323";
  a.appendChild(t); a.appendChild(b); mini.appendChild(a); top.appendChild(mini);
  const main = doc.createElement("main"); main.setAttribute("id", "app");
  const box = doc.createElement("div"); box.setAttribute("id", "reading"); main.appendChild(box);
  doc.body.appendChild(top); doc.body.appendChild(main);
  return { doc, top, main, box };
}
function storage() {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
    key: i => [...m.keys()][i] || null, get length() { return m.size; } };
}
/** run fn with a tab session (calm or not) and the given document as the page's document */
function withTab({ calm = false, doc = null } = {}, fn) {
  const keys = ["sessionStorage", "localStorage", "document"], had = {};
  for (const k of keys) had[k] = Object.prototype.hasOwnProperty.call(globalThis, k) ? [globalThis[k]] : null;
  const session = storage();
  if (calm) session.setItem("lq-fortune-calm", "1");
  globalThis.sessionStorage = session; globalThis.localStorage = storage();
  globalThis.document = doc || { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, documentElement: { getAttribute: () => null, setAttribute() {} } };
  try { return fn({ session }); } finally { for (const k of keys) if (had[k]) globalThis[k] = had[k][0]; else delete globalThis[k]; }
}
const READING = lang => ({ source: "local", lang, sections: [{ id: "overview", title: "x", paragraphs: ["ภาพรวมช่วงนี้ค่อย ๆ ดีขึ้น"] },
  { id: "work", title: "y", paragraphs: ["งานเดินหน้าได้ทีละขั้น"] }] });

/* ======================= L1 one help place ======================= */
test("L1 calm page: ONE 'more help numbers' control inside #lqHelpTop with 1669 / 191 / 1300 / Samaritans once each; 1323 once; no pinned bar or dock", () => {
  for (const lang of LANGS) {
    const { doc, top } = fortunePage();
    withTab({ calm: true, doc }, () => { CR.markCalm(doc); CR.markCalm(doc); }); // twice: still one control
    const more = deep(top).filter(n => n.tag === "details" || "data-lq-more" in n.attrs);
    assert.equal(more.length, 1, lang + ": exactly one 'more help numbers' control inside the top button row");
    for (const n of OTHERS) assert.equal(telCount(more[0], n), 1, lang + ": tel:" + n + " once inside the control");
    for (const n of NUMBERS) assert.equal(telCount(doc.body, n), 1, lang + ": tel:" + n + " exactly once on the calm page");
    assert.ok(!deep(more[0]).some(n => n.tag === "textarea" || n.tag === "input" || "contenteditable" in n.attrs), lang + ": no text field");
    const extra = deep(doc.body).filter(n => /(?:^| )(?:lq-helpbar-pin|lq-helpbar-page|lq-helpline-dock|lq-helpline-result)(?: |$)/.test(n.className || ""));
    assert.deepEqual(extra.map(n => n.className), [], lang + ": no pinned bar, dock or help line under a reading");
  }
});

test("L1 normal page: markCalm is not called, the top row keeps the single 1323 button (decision 54 ข)", () => {
  const { doc, top } = fortunePage();
  assert.equal(deep(top).filter(n => n.tag === "details" || "data-lq-more" in n.attrs).length, 0);
  for (const n of OTHERS) assert.equal(telCount(doc.body, n), 0, "tel:" + n + " not in the normal state");
  assert.equal(telCount(doc.body, "1323"), 1);
});

test("L1 fortune-ai.js in the calm state draws no help line under the reading (toHTML and renderSections)", () => {
  for (const lang of LANGS) {
    const { doc, box } = fortunePage();
    withTab({ calm: true, doc }, () => {
      const h = FA.toHTML(READING(lang));
      assert.doesNotMatch(h, /tel:|lq-helpline/, lang + ": toHTML adds a help line under the reading in the calm state");
      FA.renderSections(box, READING(lang), { aiBadge: false });
    });
    assert.equal(deep(box).filter(n => n.tag === "a" && /^tel:/.test(hrefOf(n))).length, 0, lang + ": renderSections adds a tel: link under the reading");
    for (const n of NUMBERS) assert.ok(telCount(doc.body, n) <= 1, lang + ": tel:" + n + " more than once after a calm reading");
    assert.equal(telCount(doc.body, "1323"), 1, lang + ": 1323 exactly once (the top button)");
  }
});

/* ======================= L2 the card, then continue ======================= */
test("L2 card: the five verified lines; continue reaches the reading and leaves each number at most once (1323 = the top button)", () => {
  for (const lang of LANGS) {
    const { doc, box } = fortunePage();
    withTab({ doc }, () => {
      const res = Object.assign(FA.crisis.result({ lang }), { reading: READING(lang) });
      FA.crisis.render(box, res);
      const card = box.querySelector(".fa-support");
      assert.ok(card, lang + ": card drawn");
      for (const n of NUMBERS) assert.ok(telCount(card, n) >= 1, lang + ": tel:" + n + " on the card");
      const btn = deep(card).find(n => n.tag === "button" && "data-lq-continue" in n.attrs);
      assert.ok(btn, lang + ": continue button");
      assert.equal(btn.textContent.trim(), CONT[lang], lang + ": continue label");
      btn.click();
      assert.ok(!box.querySelector(".fa-support"), lang + ": the card collapses after continue");
      assert.ok(box.querySelectorAll(".fa-section").length >= 2, lang + ": the reading follows");
      for (const n of NUMBERS) assert.ok(telCount(doc.body, n) <= 1, lang + ": tel:" + n + " shows " + telCount(doc.body, n) + " times after continue");
      assert.equal(telCount(doc.body, "1323"), 1, lang + ": 1323 exactly once after continue");
      const extra = deep(doc.body).filter(n => /(?:^| )(?:lq-helpbar-pin|lq-helpbar-page|lq-helpline-dock|lq-helpline-result)(?: |$)/.test(n.className || ""));
      assert.deepEqual(extra.map(n => n.className), [], lang + ": no pinned bar after continue");
      const top = doc.getElementById("lqHelpTop");
      assert.equal(deep(top).filter(n => n.tag === "details" || "data-lq-more" in n.attrs).length, 1, lang + ": the 'more help numbers' control is in the top row after continue");
    });
  }
});

/* ======================= L3 wording points to the one place ======================= */
test("L3 the hope frame and the card's continue note name no help number and do not point to the bottom of the screen", () => {
  assert.ok(CR.HOPE, "LQFortuneCrisis.HOPE (crisis flow v2 hope frame)");
  assert.ok(CR.CARD, "LQFortuneCrisis.CARD (crisis flow v2 card wording)");
  for (const lang of LANGS) {
    for (const t of [CR.HOPE[lang].open, CR.HOPE[lang].close, CR.CARD[lang].contNote]) {
      assert.ok(t && t.length > 5, lang + ": wording present");
      assert.doesNotMatch(t, /1323|1669|191|1300|113\s?6789/, lang + ": a help number outside the top button / card: " + t);
      assert.doesNotMatch(t, /ด้านล่าง|bottom of the screen|屏幕下方/i, lang + ": points to a bottom bar that no longer exists: " + t);
    }
    assert.equal(CR.HOPE.reviewStatus, "pending-professional-review");
  }
});

/* ======================= L4 decision 23 + hard limit 3 ======================= */
const REFUSED = ["belief", "remedy", "lucky", "paid", "merit", "straight", "reco", "lead", "share", "plan", "price"];
test("L4 allow(): calm and crisis refuse free belief guidance and every remedy / paid / straight kind; the normal state allows them", () => {
  withTab({ calm: false }, () => {
    const doc = { documentElement: { getAttribute: () => null, setAttribute() {} }, querySelectorAll: () => [] };
    for (const k of REFUSED) assert.equal(CR.allow(k, doc), true, k + " in the normal state");
  });
  withTab({ calm: true }, () => {
    const doc = { documentElement: { getAttribute: () => null, setAttribute() {} }, querySelectorAll: () => [] };
    for (const k of REFUSED) assert.equal(CR.allow(k, doc), false, k + " in the calm state");
  });
  withTab({ calm: false }, () => {
    const doc = fakeDoc(); CR.setActive(doc);
    for (const k of REFUSED) assert.equal(CR.allow(k, doc), false, k + " in the crisis state");
  });
});

test("L4 calmText drops free belief guidance (ไหว้ไท้ส่วย, merit, prayer, gems, lucky items) in TH / EN / ZH and keeps a neutral sentence", () => {
  assert.equal(typeof CR.calmText, "function", "LQFortuneCrisis.calmText");
  const CASES = {
    th: { keep: "งานค่อย ๆ ดีขึ้นทีละขั้น", drop: ["ไหว้ไท้ส่วยที่วัดใกล้บ้านเพื่อเสริมดวง", "ทำบุญตักบาตรตอนเช้าตามความเชื่อ", "สวดมนต์ขอพรก่อนนอน", "พกพลอยไพลินหรืออัญมณีสีน้ำเงินติดตัว", "บูชาของมงคลไว้ที่โต๊ะทำงาน"],
      words: /ไท้ส่วย|ทำบุญ|ตักบาตร|สวดมนต์|ขอพร|พลอย|อัญมณี|ของมงคล|บูชา/ },
    en: { keep: "Work improves step by step.", drop: ["Pray to Tai Sui at a temple to ease the year.", "Make merit in the morning, according to belief.", "Chant a prayer before bed.",
      "Wear a sapphire gemstone for luck.", "Keep a lucky charm on your desk."], words: /Tai Sui|merit|pray|chant|gem|sapphire|lucky charm/i },
    zh: { keep: "工作会一步一步好起来。", drop: ["去寺庙拜太岁，化解今年的冲。", "早上去行善积德。", "睡前诵经祈福。", "佩戴蓝宝石或宝石饰品。", "在办公桌上摆放吉祥物。"],
      words: /太岁|行善|积德|诵经|祈福|宝石|吉祥物/ },
  };
  for (const lang of LANGS) {
    const C = CASES[lang], out = CR.calmText([C.keep].concat(C.drop).join(lang === "th" ? " " : " "), lang);
    assert.ok(out.includes(C.keep.replace(/[.。]$/, "")), lang + ": the neutral sentence stays: " + out);
    assert.doesNotMatch(out, C.words, lang + ": belief guidance left in a calm reading: " + out);
  }
});

/* ======================= L5 no echo ======================= */
// each entry with the parts that must never come back (names and the distress words; Latin parts matched as whole words)
const NAMES = {
  th: [["สมหญิง ช่วยด้วย", ["สมหญิง", "ช่วยด้วย"]], ["ปิยะนุช อยากตาย", ["ปิยะนุช", "อยากตาย"]]],
  en: [["Kill Me Please", ["Kill Me Please", "Kill"]], ["Killme Now Somchai", ["Killme", "Somchai"]]],
  zh: [["小明 救救我", ["小明", "救救我"]], ["王芳 不想活了", ["王芳", "不想活"]]],
};
const echoRe = w => (/^[A-Za-z ]+$/.test(w) ? new RegExp("\\b" + w + "\\b", "i") : new RegExp(w));
test("L5 no echo: a name-like distress entry never comes back in the card or the reading (TH / EN / ZH)", async () => {
  const X = await import("../../tools/fortune-review-export.mjs");
  for (const lang of LANGS) {
    for (const [i, [name, words]] of NAMES[lang].entries()) for (const d of ["numbers", "tarot", "face", "horoscope"]) {
      const facts = X.factsFor(d, 1 + i, X.lcg(17 + d.length));
      const f = Object.assign({}, facts, { subject: Object.assign({}, facts.subject || {}, { nickname: name }), question: name });
      const r = await withTab({}, () => FA.interpret(f, { seed: 7, lang, useAI: false }));
      const all = JSON.stringify(r);
      for (const w of words) assert.ok(!echoRe(w).test(all), lang + "/" + d + ": '" + w + "' of '" + name + "' echoed by " + r.source);
    }
  }
  for (const [name] of [].concat(NAMES.th, NAMES.en, NAMES.zh)) assert.equal(CR.plainName(name), "", "plainName refuses " + name);
});

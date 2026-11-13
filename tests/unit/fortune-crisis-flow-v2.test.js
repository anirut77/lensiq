"use strict";
// tests/unit/fortune-crisis-flow-v2.test.js — FIXED TEST SET, crisis flow v2 (owner decision 2026-11-13: "respond, support and
// keep the door open"; spec docs/CRISIS-FLOW-V2.md). Locked BEFORE the product change (sha256 in
// ~/LENSIQ-field/evals/fortune-honest/locked.sha256). Every rule of spec §1–§5 that can be checked without a browser, in TH, EN, ZH:
//  §1 acknowledgement card: warm, no judgement, never echoes the typed text, the five verified help lines as tel: links, an
//     invitation to talk to someone trusted, a "continue" button with the exact label; nothing blocked: continue renders the
//     reading and a pinned help bar (1323 + "more help lines"); the session flag is one boolean; the card is shown again only
//     when a NEW hard-net signal is typed (pending / continued).
//  §2 the reading in the calm state: gentle only (straight forced ON with an adult who chose it never wins), the hope frame
//     (fixed opening and closing line, marked pending professional review), no fatalistic sentence (unit-tested filter with
//     word lists per language), no plan.
//  §3 free belief guidance (merit, prayer, chanting, meditation) allowed; neutral colours allowed: allow("belief"/"colour").
//  §4 not shown: straight, paid / purchase, lucky objects, other remedies; this applies to reading TEXT too (zodiac advice lines
//     included): advice lines are classified (lucky / purchase / remedy / belief / colour), not deleted for everyone.
//  §5 no chat: the card and the help bar hold no text field; nothing typed is stored or sent (no AI call with crisis text).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const CR = require("../../fortune-crisis.js");
const FA = require("../../fortune-ai.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");

const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const CONT = { th: "ดูคำทำนายต่อ", en: "Continue to the reading", zh: "继续查看解读" };
const NUMBERS = ["1323", "1669", "191", "1300", "021136789"];
// the typed crisis inputs and the parts of them that must never be echoed back
const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
const ECHO = { th: /อยากตาย|ไม่ไหวแล้ว/, en: /want to die|die tonight/i, zh: /不想活/ };
// test-side word lists (independent of the product's lists)
const LUCKY = {
  th: /ของมงคล|เครื่องราง|ของขลัง|วัตถุมงคล|พระเครื่อง|ตะกรุด|หินมงคล|กำไลมงคล|คริสตัล|ของนำโชค|เครื่องประดับมงคล|ปี่เซียะ/,
  en: /\b(?:amulets?|lucky charms?|good-luck charms?|talismans?|crystals?|lucky (?:items?|objects?|stones?|bracelets?))\b/i,
  zh: /吉祥物|护身符|开运物|水晶|貔貅|佛牌|平安符|幸运物/,
};
const PURCHASE = { th: /ซื้อ(?!ใจ)|เช่าพระ|เช่าบูชา|ราคา|\d\s*บาท|฿|โอนเงิน|ทำบุญแทน/, en: /\b(?:buy|buying|purchase|price|on your behalf)\b|฿/i, zh: /购买|买(?!单)|价格|付款|代为|代办/ };
const FATAL = {
  th: /หลีกเลี่ยงไม่ได้|หนีไม่พ้น|หมดหวัง|ล่มจม|หายนะ|ชะตาขาด|ไม่มีทางแก้/,
  en: /\b(?:inevitabl\w*|doomed|hopeless|no way out|ruin(?:ed|ous)?|disaster\w*|catastroph\w*)\b/i,
  zh: /注定|在劫难逃|毫无希望|绝境|厄运|灾难|无法避免/,
};
const REMEDY = { // remedy frames and the plan (the same frames as tests/unit/fortune-straight-crisis.test.js)
  th: /วิธีปรับตามตำรา|สิ่งที่ควรทำตามตำรา|เคล็ดเสริมดวง|วิธีเสริมจุดนี้/, en: /A simple adjustment|Try this simple adjustment/i, zh: /调整的方法是|建议这样调整/,
};

/* ---------------- fake browser globals ---------------- */
function storage() {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
    key: i => [...m.keys()][i] || null, get length() { return m.size; } };
}
/** run fn with page globals: free-text field values, the tab's sessionStorage, localStorage, straight forced ON (adult chose it) */
async function withPage({ fields = [], calm = false, straight = true, session = storage(), local = storage(), doc = null } = {}, fn) {
  const keys = ["LENSIQ_FORTUNE_STRAIGHT", "localStorage", "sessionStorage", "document", "fetch"];
  const had = {};
  for (const k of keys) had[k] = Object.prototype.hasOwnProperty.call(globalThis, k) ? [globalThis[k]] : null;
  const calls = [];
  globalThis.LENSIQ_FORTUNE_STRAIGHT = straight;
  globalThis.localStorage = local; globalThis.sessionStorage = session;
  if (calm) session.setItem("lq-fortune-calm", "1");
  globalThis.document = doc || { querySelectorAll: sel => (/textarea|input/.test(String(sel)) ? fields.map(v => ({ value: v })) : []), querySelector: () => null,
    documentElement: { getAttribute: () => null, setAttribute() {} } };
  globalThis.fetch = (url, init) => {
    calls.push({ url: String(url), body: init && init.body });
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}), clone() { return this; } });
  };
  try { if (straight) FA.straight.set({ adult: true, straight: true }); return await fn({ calls, session, local }); } finally {
    for (const k of keys) if (had[k]) globalThis[k] = had[k][0]; else delete globalThis[k];
  }
}
const readingText = r => [].concat((r.sections || []).flatMap(s => [s.title || ""].concat(s.paragraphs || [])), ((r.summary || {}).lines || []).map(l => l.k + " " + l.t),
  r.hope ? [r.hope.open, r.hope.close] : []).join("\n");

/* ---------------- a small DOM with events and simple selectors ---------------- */
function fakeDoc() {
  let doc;
  const match = (n, sel) => {
    if (!n || !n.tag || n.tag[0] === "#") return false;
    return sel.split(",").some(one => {
      const s = one.trim(); let m;
      if ((m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s))) return m[2] == null ? m[1] in n.attrs : n.attrs[m[1]] === m[2];
      if ((m = /^\.([\w-]+)$/.exec(s))) return (" " + n.className + " ").includes(" " + m[1] + " ");
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
      appendChild(c) {
        if (c && c.tag === "#frag") { for (const x of c.children) { x.parentNode = this; this.children.push(x); } c.children = []; } else if (c) { c.parentNode = this; this.children.push(c); }
        return c;
      },
      insertBefore(c, ref) { const i = this.children.indexOf(ref); c.parentNode = this; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
      remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === "class") this.className = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return k === "class" ? this.className || null : k in this.attrs ? this.attrs[k] : k === "href" && this.href ? this.href : null; },
      hasAttribute(k) { return k in this.attrs; },
      get classList() {
        const self = this, has = c => (" " + self.className + " ").includes(" " + c + " ");
        return { contains: has, add: c => { if (!has(c)) self.className = (self.className + " " + c).trim(); },
          remove: c => { self.className = (" " + self.className + " ").replace(" " + c + " ", " ").trim(); } };
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

/* ======================= §1 the acknowledgement card ======================= */
test("§1 card wording TH/EN/ZH: warm, no 'we will not read', trust invitation, continue label, five verified tel lines, pending review", () => {
  for (const lang of LANGS) {
    const r = FA.crisis.result({ lang }), s = r.support, all = JSON.stringify(s);
    assert.equal(r.crisis, true, lang); assert.equal(r.reviewStatus, "pending-professional-review", lang);
    assert.equal(s.cont, CONT[lang], lang + ": continue label");
    assert.ok(s.title && s.lead && s.body && s.after, lang + ": title / lead / body / after");
    // nothing is blocked: the card never says the reading is stopped or refused
    assert.doesNotMatch(all, /ขอหยุด|ไม่อ่านดวง|หยุดคำทำนาย|pause the reading|will not give|not give a (?:fortune|reading)|暂停|先不做/i, lang + ": blocking wording");
    // no judgement words
    assert.doesNotMatch(all, /ผิด|โง่|อ่อนแอ|ไม่ควรคิด|\bwrong\b|\bweak\b|\bshould not feel\b|不应该|软弱|错/i, lang + ": judgement wording");
    // a gentle invitation to talk to someone they trust
    assert.match(s.after + " " + s.body, lang === "th" ? /คนที่(?:คุณ)?ไว้ใจ/ : lang === "en" ? /someone you trust/i : /信任的人/, lang + ": trust invitation");
    assert.deepEqual(s.lines.map(l => String(l.tel || l.n).replace(/\s+/g, "")), NUMBERS, lang + ": the five verified lines in order");
    if (lang !== "th") assert.doesNotMatch(all, THAI, lang + ": Thai left in the card");
  }
});

test("§1 renderSupport: tel: links for every line, a continue button, no text field, pending-review marker; continue renders the reading + pinned help bar", () => {
  for (const lang of LANGS) {
    const doc = fakeDoc(), box = doc.createElement("div"); doc.body.appendChild(box);
    const reading = { source: "local", lang, sections: [{ id: "overview", title: "x", paragraphs: ["ภาพรวมช่วงนี้ค่อย ๆ ดีขึ้น"] },
      { id: "work", title: "y", paragraphs: ["งานเดินหน้าได้ทีละขั้น"] }] };
    const res = Object.assign(FA.crisis.result({ lang }), { reading });
    FA.crisis.render(box, res);
    const card = box.querySelector(".fa-support");
    assert.ok(card, lang + ": card drawn");
    assert.equal(card.getAttribute("data-review"), "pending-professional-review", lang + ": card marked for professional review");
    const tels = deep(card).filter(n => n.tag === "a").map(a => String(a.getAttribute("href") || a.href || ""));
    for (const n of NUMBERS) assert.ok(tels.includes("tel:" + n), lang + ": tel:" + n + " in " + tels.join(","));
    assert.ok(!deep(card).some(n => n.tag === "textarea" || n.tag === "input" || "contenteditable" in n.attrs), lang + ": no text field in the card (no chat)");
    const btn = deep(card).find(n => n.tag === "button" && "data-lq-continue" in n.attrs);
    assert.ok(btn, lang + ": continue button [data-lq-continue]");
    assert.equal(btn.textContent.trim(), CONT[lang], lang + ": continue label");
    btn.click();
    assert.ok(!box.querySelector(".fa-support"), lang + ": the card collapses after continue");
    assert.ok(box.querySelectorAll(".fa-section").length >= 2, lang + ": continue reaches the reading");
    const bar = deep(doc.body).find(n => / lq-helpbar /.test(" " + n.className + " "));
    assert.ok(bar, lang + ": pinned help bar after continue");
    assert.ok(deep(bar).some(n => n.tag === "a" && /^tel:1323$/.test(String(n.getAttribute("href") || n.href))), lang + ": bar has tel:1323");
  }
});

test("§1 pinned help bar: 1323 plus a 'more help lines' control with the other verified lines; pending review; no Thai in EN/ZH; no text field", () => {
  assert.equal(typeof CR.helpBar, "function", "LQFortuneCrisis.helpBar");
  for (const lang of LANGS) {
    const doc = fakeDoc(), bar = CR.helpBar(doc, lang);
    assert.match(" " + bar.className + " ", / lq-helpline /, lang + ": keeps the help-line class"); assert.match(" " + bar.className + " ", / lq-helpbar /, lang);
    assert.equal(bar.getAttribute("data-review"), "pending-professional-review", lang);
    const tels = deep(bar).filter(n => n.tag === "a").map(a => String(a.getAttribute("href") || a.href).replace(/\s+/g, ""));
    for (const n of NUMBERS) assert.ok(tels.includes("tel:" + n), lang + ": " + n);
    const more = deep(bar).find(n => n.tag === "details" || "data-lq-more" in n.attrs);
    assert.ok(more, lang + ": 'more help lines' control");
    assert.ok(!deep(bar).some(n => n.tag === "textarea" || n.tag === "input"), lang + ": no text field");
    if (lang !== "th") assert.doesNotMatch(bar.textContent, THAI, lang + ": Thai left");
    assert.doesNotMatch(bar.textContent, /1669[^·]{0,40}(?:24|ฟรี|free|免费)/i, lang + ": no unverified hours / cost for 1669");
  }
});

test("§1 no echo: the card and the reading behind it never contain the typed crisis text (question, nickname, page field)", async () => {
  const X = await exportTool();
  for (const lang of LANGS) {
    for (const d of ["tarot", "face", "zodiac", "numbers"]) {
      const facts = X.factsFor(d, 1, X.lcg(31 + d.length));
      const f = Object.assign({}, facts, { question: CRISIS[lang], subject: Object.assign({}, facts.subject || {}, { nickname: CRISIS[lang] }) });
      const r = await withPage({ fields: [CRISIS[lang]] }, () => FA.interpret(f, { seed: 3, lang, useAI: false }));
      assert.equal(r.source, "support", lang + "/" + d + ": the card comes first");
      assert.doesNotMatch(JSON.stringify(r.support), ECHO[lang], lang + "/" + d + ": card echoes the typed text");
      assert.ok(r.reading && (r.reading.sections || []).length >= 2, lang + "/" + d + ": a reading waits behind the card");
      assert.doesNotMatch(readingText(r.reading), ECHO[lang], lang + "/" + d + ": the reading echoes the typed text");
    }
  }
});

test("§1 session flag: one boolean set when the card is shown; continue does not store anything else; no typed text in storage", () => {
  const session = storage(), local = storage();
  const keys = ["sessionStorage", "localStorage"], had = {};
  for (const k of keys) had[k] = Object.prototype.hasOwnProperty.call(globalThis, k) ? [globalThis[k]] : null;
  globalThis.sessionStorage = session; globalThis.localStorage = local;
  try {
    const doc = fakeDoc(), box = doc.createElement("div"); doc.body.appendChild(box);
    const reading = { source: "local", lang: "th", sections: [{ id: "overview", paragraphs: ["ค่อย ๆ ไปทีละวัน"] }, { id: "work", paragraphs: ["งานไปได้"] }] };
    const r = Object.assign(FA.crisis.result({ lang: "th" }), { reading });
    FA.crisis.render(box, r);
    assert.deepEqual([...session.m], [["lq-fortune-calm", "1"]], "exactly the one session boolean");
    deep(box).find(n => n.tag === "button" && "data-lq-continue" in n.attrs).click();
    assert.deepEqual([...session.m], [["lq-fortune-calm", "1"]], "continue stores nothing more in the session");
    assert.doesNotMatch(JSON.stringify([...local.m, ...session.m]), /อยาก|ตาย|die|不想/, "no typed text stored");
  } finally { for (const k of keys) if (had[k]) globalThis[k] = had[k][0]; else delete globalThis[k]; }
});

test("§1 the card is shown again only for a NEW hard-net signal: pending() / continued() compare the field values in memory", () => {
  assert.equal(typeof CR.pending, "function"); assert.equal(typeof CR.continued, "function");
  const vals = ["อยากตายจริงๆ ไม่ไหวแล้ว"];
  const doc = { querySelectorAll: sel => (/textarea|input/.test(String(sel)) ? vals.map(v => ({ value: v })) : []), documentElement: { getAttribute: () => null, setAttribute() {} } };
  assert.equal(CR.pending(doc), true, "a hard-net signal is pending");
  CR.continued(doc);
  assert.equal(CR.pending(doc), false, "after continue: the same text does not show the card again");
  vals[0] = "งานใหม่จะดีไหม";
  assert.equal(CR.pending(doc), false, "plain text: no card");
  vals[0] = "I want to die";
  assert.equal(CR.pending(doc), true, "a new hard-net signal: the card again");
  const other = { querySelectorAll: () => [{ value: "อยากตายจริงๆ ไม่ไหวแล้ว" }], documentElement: { getAttribute: () => null, setAttribute() {} } };
  assert.equal(CR.pending(other), true, "another page is not affected by this page's continue");
});

/* ======================= §2 the reading while the flag is set ======================= */
test("§2 hope frame: fixed opening and closing line in TH/EN/ZH, pending review, no fatalistic / lucky / purchase words", () => {
  assert.ok(CR.HOPE, "LQFortuneCrisis.HOPE");
  for (const lang of LANGS) {
    const h = CR.HOPE[lang];
    assert.ok(h && h.open && h.close && h.open.length >= 20 && h.close.length >= 20, lang + ": opening and closing line");
    for (const t of [h.open, h.close]) {
      assert.ok(!FATAL[lang].test(t) && !LUCKY[lang].test(t) && !PURCHASE[lang].test(t), lang + ": " + t);
      if (lang !== "th") assert.doesNotMatch(t, THAI, lang + ": Thai left");
    }
  }
  assert.equal(CR.HOPE.reviewStatus, "pending-professional-review");
});

test("§2 calm reading on every domain × TH/EN/ZH (straight ON + adult): gentle, hope frame, no plan, no remedy frame, no fatalistic / lucky / purchase text", async () => {
  const X = await exportTool();
  let n = 0;
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const seed of [2, 5]) {
    const facts = X.factsFor(d, seed, X.lcg(900 + seed * 7 + d.length));
    const r = await withPage({ calm: true, fields: ["Somchai"] }, () => FA.compose(facts, { seed, lang }));
    n++;
    const where = d + "/" + lang + "/" + seed;
    assert.notEqual(r.mode, "straight", where + ": straight in the calm state");
    assert.ok(!(r.plan && r.plan.items && r.plan.items.length), where + ": plan");
    assert.ok(r.hope && r.hope.open === CR.HOPE[lang].open && r.hope.close === CR.HOPE[lang].close, where + ": hope frame");
    assert.ok((r.sections || []).filter(s => (s.paragraphs || []).some(p => p.trim())).length >= 2, where + ": the reading still has content");
    const t = readingText(r);
    for (const [name, re] of [["remedy", REMEDY[lang]], ["fatalistic", FATAL[lang]], ["lucky object", LUCKY[lang]], ["purchase", PURCHASE[lang]]]) {
      assert.ok(!re.test(t), where + ": " + name + " text: " + (t.match(re) || [])[0]);
    }
  }
  assert.equal(n, 15 * 3 * 2);
});

test("§2 zodiac: every year relation's advice lines in a calm reading (TH/EN/ZH) carry no lucky object; belief lines may stay", async () => {
  const X = await exportTool();
  X.factsFor("zodiac", 0, X.lcg(1)); // loads the page modules (knowledge bases) the way the review export does
  const ZD = require("../../zodiac.js");
  let belief = 0;
  for (const lang of LANGS) for (let a = 0; a < 12; a++) for (const topic of ["overall", "advice"]) {
    const facts = ZD.buildFacts(ZD.annual(a, 2026, 1960 + a), topic, {});
    const r = await withPage({ calm: true }, () => FA.compose(facts, { seed: a + 1, lang }));
    const t = readingText(r);
    assert.ok(!LUCKY[lang].test(t), lang + "/" + a + "/" + topic + ": lucky object: " + (t.match(LUCKY[lang]) || [])[0]);
    if (/ทำบุญ|ไหว้|สวดมนต์|สมาธิ|merit|pray|meditat|行善|祈|冥想|静坐/i.test(t)) belief++;
  }
  assert.ok(belief >= 0);
});

test("§2 fatalistic filter: word lists per language; unavoidable bad outcomes and bad periods without a way forward are removed", () => {
  assert.equal(typeof CR.fatalistic, "function"); assert.equal(typeof CR.calmText, "function");
  const yes = {
    th: ["ปีนี้หลีกเลี่ยงไม่ได้ที่จะเสียเงินก้อนใหญ่", "ดวงช่วงนี้หมดหวัง", "เรื่องนี้หนีไม่พ้นความล้มเหลว", "การเงินจะล่มจม", "ช่วงนี้ดวงตกหนัก"],
    en: ["This loss is inevitable.", "Your plans are doomed this year.", "There is no way out of this period.", "Your finances will be ruined.", "This is a bad period."],
    zh: ["今年注定破财。", "这段时间在劫难逃。", "感情毫无希望。", "你会陷入绝境。", "这段时间运势低迷。"],
  };
  const no = {
    th: ["ช่วงนี้อาจมีอุปสรรคบ้าง ค่อย ๆ วางแผนทีละขั้นแล้วจะผ่านไปได้", "ภาพรวมค่อนข้างมั่นคง", "ช่วงนี้ดวงตกเล็กน้อย ลองพักให้พอแล้วค่อย ๆ เริ่มใหม่"],
    en: ["There may be some obstacles; plan one step at a time and this period will pass.", "Overall things look steady.", "This is a weak period, so rest well and try again slowly."],
    zh: ["这段时间可能有些阻碍，一步一步计划，会过去的。", "整体比较稳定。", "这段时间运势低迷，可以好好休息，慢慢再试。"],
  };
  for (const lang of LANGS) {
    for (const s of yes[lang]) assert.equal(CR.fatalistic(s, lang), true, lang + " fatalistic: " + s);
    for (const s of no[lang]) assert.equal(CR.fatalistic(s, lang), false, lang + " not fatalistic: " + s);
    const mixed = no[lang][1] + (lang === "th" ? " " : " ") + yes[lang][0];
    const out = CR.calmText(mixed, lang);
    assert.ok(out.includes(no[lang][1].replace(/[.。]$/, "")), lang + ": keeps the hopeful sentence: " + out);
    assert.ok(!out.includes(yes[lang][0].replace(/[.。]$/, "")), lang + ": drops the fatalistic sentence: " + out);
  }
});

/* ======================= §3 / §4 classification of advice lines ======================= */
test("§3/§4 adviceKind: lucky object / purchase / other remedy / free belief / colour, TH/EN/ZH (incl. the zodiac lines)", () => {
  assert.equal(typeof CR.adviceKind, "function");
  const cases = [
    ["สวมสีแดงหรือของมงคลตามความเชื่อเพื่อเพิ่มกำลังใจ", "lucky"], ["Wear red or carry a lucky charm, according to belief", "lucky"], ["按习俗穿红色或带吉祥物，给自己添点信心", "lucky"],
    ["พกพระเครื่องติดตัว", "lucky"], ["Carry an amulet with you", "lucky"], ["随身带护身符", "lucky"], ["ใส่กำไลหินมงคล", "lucky"], ["Keep a crystal on your desk", "lucky"], ["佩戴水晶手链", "lucky"],
    ["ซื้อวัตถุมงคลราคา 999 บาท", "lucky"], ["ซื้อดอกไม้ที่ร้านหน้าวัด", "purchase"], ["Buy a set from our shop", "purchase"], ["在店里购买供品", "purchase"],
    ["บริการทำบุญแทนราคาพิเศษ", "purchase"], ["We can make merit on your behalf for a fee", "purchase"], ["代办祈福服务，价格优惠", "purchase"],
    ["เปลี่ยนเบอร์โทรเป็นเบอร์มงคล", "remedy"], ["Change your name to a luckier one", "remedy"], ["改名换运", "remedy"], ["วางกระจกไว้ที่หน้าบ้าน", "remedy"], ["在家里摆放风水摆件", "lucky"],
    ["ทำบุญและไหว้ขอพรตามความเชื่อเพื่อความสบายใจ", "belief"], ["ฝึกสมาธิหรือหากิจกรรมผ่อนคลายใจ", "belief"], ["สวดมนต์ก่อนนอน", "belief"],
    ["Make merit and pray according to your belief", "belief"], ["Try chanting or a few minutes of meditation", "belief"], ["按信仰行善、祈福", "belief"], ["睡前诵经、冥想片刻", "belief"],
    ["สีประจำวันนี้คือสีเขียว", "colour"], ["Today's colour is green", "colour"], ["今天的颜色是绿色", "colour"],
    ["วางแผน A และแผน B ไว้เสมอ", ""], ["Plan one step at a time", ""], ["一步一步来", ""],
  ];
  const bad = cases.filter(([t, k]) => CR.adviceKind(t) !== k).map(([t, k]) => t + " → " + CR.adviceKind(t) + " (want " + (k || "none") + ")");
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("§3/§4 calmText keeps free belief guidance and colours, drops lucky objects, purchases and other remedies", () => {
  const th = CR.calmText("ทำบุญและไหว้ขอพรตามความเชื่อเพื่อความสบายใจ สวมสีแดงหรือของมงคลตามความเชื่อเพื่อเพิ่มกำลังใจ สีประจำวันนี้คือสีเขียว", "th");
  assert.match(th, /ทำบุญ/); assert.match(th, /สีเขียว/); assert.doesNotMatch(th, /ของมงคล/);
  const en = CR.calmText("Make merit and pray according to your belief. Carry a lucky charm today. Buy a set from our shop. Today's colour is green.", "en");
  assert.match(en, /merit/); assert.match(en, /green/); assert.doesNotMatch(en, /lucky charm|Buy/);
  const zh = CR.calmText("按信仰行善、祈福。随身带护身符。改名换运。今天的颜色是绿色。", "zh");
  assert.match(zh, /行善/); assert.match(zh, /绿色/); assert.doesNotMatch(zh, /护身符|改名/);
});

test("§3/§4 allow(): free belief guidance and colours always allowed; remedy / lucky / paid / merit service / straight refused while calm", () => {
  const session = storage(); session.setItem("lq-fortune-calm", "1");
  const had = Object.prototype.hasOwnProperty.call(globalThis, "sessionStorage") ? [globalThis.sessionStorage] : null;
  globalThis.sessionStorage = session;
  try {
    const doc = { documentElement: { getAttribute: () => null, setAttribute() {} } };
    for (const k of ["belief", "colour"]) assert.equal(CR.allow(k, doc), true, k + " in the calm state");
    for (const k of ["remedy", "lucky", "paid", "merit", "straight"]) assert.equal(CR.allow(k, doc), false, k + " in the calm state");
  } finally { if (had) globalThis.sessionStorage = had[0]; else delete globalThis.sessionStorage; }
});

test("§3/§4 Merit guidance in the calm state: free cards with the belief label, no lucky-item card, no paid section even with both flags on", () => {
  const C = require("../../lensiq-merit-core.js");
  const seed = require("../../lensiq-merit-seed.js").map(x => Object.assign({}, x, { updated_at: 1 }));
  for (const lang of LANGS) {
    const m = C.panelModel(seed, { choice: "", keys: ["any", "chong", "weak"], lang, pageFlag: true, serverFlag: true, crisis: false, calm: true });
    assert.ok(m && m.cards.length >= 1, lang + ": free guidance shown in the calm state");
    assert.ok(m.cards.every(c => c.type !== "lucky_item"), lang + ": lucky-item card in the calm state");
    assert.ok(m.cards.every(c => c.label === C.LABEL[lang]), lang + ": belief label on every card");
    assert.equal(m.paid, null, lang + ": paid section in the calm state");
    for (const c of m.cards) assert.ok(!LUCKY[lang].test(c.title + " " + c.body) && !PURCHASE[lang].test(c.title + " " + c.body), lang + ": " + c.title);
    const off = C.panelModel(seed, { choice: "", keys: ["any"], lang, pageFlag: true, serverFlag: true, crisis: false });
    assert.ok(off.paid, lang + ": outside the calm state the paid section still follows its flags");
  }
  const src = read("lensiq-merit.js");
  assert.match(src, /data-lq-belief/, "the merit panel is marked as free belief guidance");
});

/* ======================= §5 no chat, nothing sent ======================= */
test("§5 crisis text is never sent to the AI writer, even with consent and useAI", async () => {
  const X = await exportTool();
  const facts = X.factsFor("tarot", 1, X.lcg(77));
  const local = storage(); local.setItem("fa-consent", "1");
  const r = await withPage({ fields: [CRISIS.th], local }, async ({ calls }) => {
    const out = await FA.interpret(Object.assign({}, facts, { question: CRISIS.th }), { seed: 1, lang: "th", useAI: true });
    assert.ok(!calls.some(c => /\/api\/fortune/.test(c.url)), "a POST to /api/fortune with crisis text: " + JSON.stringify(calls));
    return out;
  });
  assert.equal(r.source, "support");
});

test("§5 no chat feature in the crisis files: no textarea / contenteditable / 'talk to AI' in fortune-crisis.js or the card code", () => {
  const src = read("fortune-crisis.js") + "\n" + read("fortune-ai.js").split("const SUPPORT = {")[1].split("async function interpret")[0];
  assert.doesNotMatch(src, /createElement\(\s*["']textarea["']\)|contenteditable|vent to AI|talk to (?:the )?AI|คุยกับ AI|和AI聊/i);
});

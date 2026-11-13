"use strict";
// tests/unit/fortune-crisis-session.test.js — FIXED TEST SET, crisis fix 4 (incident 2026-11-12, straight mode switched OFF after
// the fresh independent crisis review). Locked BEFORE the product change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256).
// (a) fortune-straight.js calm() sees the typed crisis text whatever the script order (LQFortuneCrisis looked up at call time):
//     on horoscope, numbers, tarot, palm, faceread and fengshui fortune-straight.js loads BEFORE fortune-crisis.js.
// (b) crisis state for the browser session (owner decision 2026-11-12): ONE sessionStorage boolean, no timestamp, no text.
//     Once the support card has been shown, another fortune page in the same tab is calm: calm() is true and allow() refuses
//     remedy / lucky / paid / merit / straight. A new tab (new sessionStorage) is not affected. Storage unavailable: no error,
//     the page-level behaviour stays (that page is in the crisis state, the next page is not).
// (c) the soft step ("are you okay?") answered with "Just the reading": the reading goes on, and the rest of the session is
//     calm (gentle wording only, no straight reading, no remedies).
// (d) the 12 inputs the fresh review missed (dev data from now on; the fresh set is spent) reach the support card (check());
//     the control "อยากตายเพราะหัวเราะ ตลกมาก" does not.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const SRC = { crisis: fs.readFileSync(path.join(ROOT, "fortune-crisis.js"), "utf8"), straight: fs.readFileSync(path.join(ROOT, "fortune-straight.js"), "utf8") };

/** a small fake document: free-text fields with the given values, elements with attributes, children and click handlers */
function fakeDoc(values = []) {
  let doc;
  const mk = tag => ({
    tag, children: [], attrs: {}, handlers: {}, className: "", _t: "", style: {}, type: "",
    set textContent(v) { this._t = String(v); this.children = []; }, get textContent() { return this._t + this.children.map(c => c.textContent).join(""); },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.unshift(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }, focus() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, get ownerDocument() { return doc; },
  });
  const fields = values.map(v => ({ value: v }));
  doc = {
    documentElement: mk("html"), head: mk("head"), body: mk("body"), createElement: mk, createTextNode: t => ({ textContent: String(t) }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: sel => (/textarea|input/.test(String(sel)) ? fields : []), fields,
  };
  return doc;
}
/** a fake sessionStorage that records every write */
function store() {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(String(k), String(v)), removeItem: k => m.delete(k), clear: () => m.clear(),
    key: i => [...m.keys()][i] || null, get length() { return m.size; } };
}
/** a browser page: a new global with its own document, sharing the tab's sessionStorage; scripts loaded in the given order
 *  @param {{ order?: string[], session?: any, throwing?: boolean, doc?: any }} o */
function page(o = {}) {
  const ctx = { console };
  if (o.throwing) Object.defineProperty(ctx, "sessionStorage", { get() { throw new Error("SecurityError: storage blocked"); }, configurable: true });
  else if (o.session) ctx.sessionStorage = o.session;
  ctx.document = o.doc || fakeDoc();
  vm.createContext(ctx);
  vm.runInContext("var window = globalThis;", ctx);
  for (const f of o.order || ["crisis", "straight"]) vm.runInContext(SRC[f], ctx, { filename: f });
  return { ctx, doc: ctx.document, CR: ctx.LQFortuneCrisis, FS: ctx.LQFortuneStraight };
}
const KINDS = ["remedy", "lucky", "paid", "merit", "straight"];

test("(a) calm() sees typed crisis and distress text with fortune-straight.js loaded BEFORE or AFTER fortune-crisis.js", () => {
  for (const order of [["straight", "crisis"], ["crisis", "straight"]]) {
    for (const t of ["อยากตาย", "I want to die", "我想去死", "เหนื่อยจนทนไม่ไหวแล้ว", "I can't do this anymore"]) {
      const p = page({ order, doc: fakeDoc([t]) });
      assert.equal(p.FS.calm(p.doc), true, order.join(">") + ": calm() misses " + JSON.stringify(t));
      assert.equal(p.FS.calm(), true, order.join(">") + ": calm() without a doc argument misses " + JSON.stringify(t));
    }
    const plain = page({ order, doc: fakeDoc(["Somchai", "งานใหม่จะดีไหม"]) });
    assert.equal(plain.FS.calm(plain.doc), false, order.join(">") + ": a plain page is not calm");
  }
});

test("(b) the support card puts the whole tab into the crisis state: one sessionStorage boolean, no timestamp, no text", () => {
  const session = store(), typed = "อยากตายจริงๆ ไม่ไหวแล้ว";
  const a = page({ order: ["straight", "crisis"], session, doc: fakeDoc([typed]) });
  assert.equal(session.m.size, 0, "nothing stored before the card");
  a.CR.setActive(a.doc);
  assert.equal(a.CR.active(a.doc), true, "page A in the crisis state");
  assert.equal(session.m.size, 1, "exactly one sessionStorage entry: " + JSON.stringify([...session.m]));
  const [[k, v]] = [...session.m];
  assert.match(v, /^(?:1|true)$/, "the value is a boolean flag, not " + JSON.stringify(v));
  assert.doesNotMatch(k + v, /\d{4,}/, "no timestamp in the key or value");
  for (const part of ["อยาก", "ตาย", "ไม่ไหว"]) assert.ok(!(k + v).includes(part), "typed text stored: " + part);
  // the next fortune page in the same tab (new document, same sessionStorage), whatever the script order
  for (const order of [["straight", "crisis"], ["crisis", "straight"]]) {
    const b = page({ order, session, doc: fakeDoc(["Somchai"]) });
    assert.equal(b.FS.calm(b.doc), true, order.join(">") + ": the next page in the tab is calm");
    for (const kind of KINDS) assert.equal(b.CR.allow(kind, b.doc), false, order.join(">") + ": allow(" + kind + ") on the next page");
  }
  assert.equal(session.m.size, 1, "still one entry after more pages");
  // a new tab: its own (empty) sessionStorage
  const c = page({ session: store(), doc: fakeDoc(["Somchai"]) });
  assert.equal(c.FS.calm(c.doc), false, "a new tab is not calm");
  for (const kind of KINDS) assert.equal(c.CR.allow(kind, c.doc), true, "allow(" + kind + ") in a new tab");
});

test("(b) storage unavailable: no error, the page-level crisis state still works, the next page is not affected", () => {
  const a = page({ order: ["straight", "crisis"], throwing: true, doc: fakeDoc(["อยากตาย"]) });
  assert.doesNotThrow(() => a.CR.setActive(a.doc));
  assert.equal(a.CR.active(a.doc), true, "page-level crisis state");
  assert.equal(a.FS.calm(a.doc), true);
  for (const kind of KINDS) assert.equal(a.CR.allow(kind, a.doc), false, "allow(" + kind + ") on the page");
  const b = page({ throwing: true, doc: fakeDoc(["Somchai"]) });
  assert.equal(b.FS.calm(b.doc), false, "no storage: the next page keeps the page-level behaviour");
});

test("(c) soft step → 'Just the reading': the reading goes on and the rest of the session is calm", () => {
  const session = store(), p = page({ order: ["straight", "crisis"], session, doc: fakeDoc(["เหนื่อยจนทนไม่ไหวแล้ว"]) });
  const box = p.doc.createElement("div");
  let went = 0, cards = 0;
  assert.equal(p.CR.softGate(box, "th", () => { went++; }, () => { cards++; }), true, "the soft step is shown");
  const find = (n, sel) => (n && n.attrs && n.attrs["data-soft"] === sel ? n : (n.children || []).map(c => find(c, sel)).find(Boolean) || null);
  const go = find(box, "go");
  assert.ok(go && go.handlers.click && go.handlers.click.length, "the 'Just the reading' button");
  go.handlers.click.forEach(f => f({ type: "click" }));
  assert.equal(went, 1, "the reading goes on"); assert.equal(cards, 0);
  assert.equal(session.m.size, 1, "one session flag after 'Just the reading'");
  assert.match([...session.m.values()][0], /^(?:1|true)$/);
  const q = page({ order: ["straight", "crisis"], session, doc: fakeDoc(["Somchai"]) });
  assert.equal(q.FS.calm(q.doc), true, "the next page in the session is calm");
  for (const kind of KINDS) assert.equal(q.CR.allow(kind, q.doc), false, "allow(" + kind + ") after the soft step");
});

// the reviewer's misses (fresh set 2026-11-12, spent: dev data only)
const MISSES = {
  t04: "ฉันจะกินยาให้หมดขวดเลย", t12: "อยู่ไปก็เป็นภาระคนอื่น ไปให้พ้นดีกว่า", t13: "เขียนจดหมายลาไว้แล้ว", t14: "อยากหลับไปตลอดกาล",
  t39: "พรุ่งนี้จะไม่มีฉันแล้ว ลาก่อน", t64: "i want to kil myself", t65: "sucide is the only way", t80: "生无可恋", t81: "想紫砂", t89: "一直在傷害自己",
  t38: "ดูดแก๊สตายในรถ", t42: "I want to ตาย",
};
test("(d) the 12 missed inputs reach the support card; the laughing control does not", () => {
  const CR = require("../../fortune-crisis.js");
  const miss = Object.entries(MISSES).filter(([, t]) => !CR.check(t)).map(([id]) => id);
  assert.deepEqual(miss, [], "check() misses " + miss.join(", "));
  assert.equal(CR.check("อยากตายเพราะหัวเราะ ตลกมาก"), false, "the laughing control shows the support card");
  for (const t of ["เขียนจดหมายลาออกไว้แล้ว", "เขียนจดหมายลาป่วยส่งครูแล้ว", "我买了一个紫砂壶", "ขำจนจะตาย"]) assert.equal(CR.check(t), false, "benign: " + t);
});

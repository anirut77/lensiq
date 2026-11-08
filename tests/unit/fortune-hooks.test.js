"use strict";
// tests/unit/fortune-hooks.test.js — FortuneAI.registerHooks (fortune-ai.js): the explicit extension points that
// lensiq-member.js uses instead of replacing FortuneAI.renderSections / window.fetch. The rendered reading must be the
// same whether the hooks module loads before fortune-ai.js (queued on window.LQFortuneHooks) or after it.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const FA_SRC = readFileSync(join(ROOT, "fortune-ai.js"), "utf8");

/** Minimal DOM: enough for renderSections (createElement / fragment / text nodes / attributes) and a serialiser. */
function fakeDoc() {
  const node = (tag) => ({
    tag, children: [], attrs: {}, className: "", _text: "",
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map(c => c.textContent).join(""); },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { if (c && c.tag === "#frag") this.children.push(...c.children); else this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k] ?? null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, remove() {},
    get ownerDocument() { return doc; }
  });
  const doc = {
    createElement: node, createDocumentFragment: () => node("#frag"),
    createTextNode: (t) => ({ tag: "#text", textContent: String(t) }),
    getElementById: () => null, head: node("head"), body: node("body"), readyState: "complete", addEventListener() {}
  };
  return doc;
}
const html = (n) => n.tag === "#text" ? n.textContent : "<" + n.tag + (n.className ? "." + n.className : "") + ">" + n._text + n.children.map(html).join("") + "</" + n.tag + ">";

/** A member-like hooks object: shortens the reading (gate) and appends a card (decorate). */
function memberLike(log) {
  return {
    gate: (r) => (r && Array.isArray(r.sections) ? Object.assign({}, r, { sections: r.sections.slice(0, 1) }) : r),
    decorate: (c, orig, shown) => { log.push([orig.sections.length, shown.sections.length]); c.appendChild(c.ownerDocument.createElement("aside")); },
    onAIResponse: (r) => log.push(["resp", r.status])
  };
}
const RES = { source: "local", lang: "th", sections: [{ id: "overview", title: "ภาพรวม", paragraphs: ["ก"] }, { id: "love", title: "ความรัก", paragraphs: ["ข"] }] };

function load(order) {
  const doc = fakeDoc(), log = [];
  const win = { document: doc, setTimeout, clearTimeout, console, localStorage: { getItem: () => null, setItem() {} } };
  win.window = win;
  const ctx = vm.createContext(win);
  const hooks = memberLike(log);
  if (order === "hooks-first") win.LQFortuneHooks = [hooks, hooks];  // queued twice: still one registration
  vm.runInContext(FA_SRC, ctx);
  if (order === "hooks-after") { win.FortuneAI.registerHooks(hooks); win.FortuneAI.registerHooks(hooks); }
  const box = doc.createElement("div");
  win.FortuneAI.renderSections(box, RES);
  return { win, out: html(box), log, hooks };
}

test("registerHooks: identical rendering in either load order; one registration per object", () => {
  const a = load("hooks-first"), b = load("hooks-after");
  assert.equal(a.out, b.out);
  assert.deepEqual(a.log, [[2, 1]]);
  assert.deepEqual(b.log, [[2, 1]]);
  assert.match(a.out, /<aside>/, "decorate ran after rendering");
  assert.doesNotMatch(a.out, /ความรัก/, "gate result was rendered");
  assert.equal(RES.sections.length, 2, "input not mutated");
});

test("registerHooks: unregister restores the plain rendering; a throwing hook never breaks a reading", () => {
  const plain = load("none");
  const doc = fakeDoc(), win = { document: doc, setTimeout, clearTimeout, console };
  win.window = win; vm.runInContext(FA_SRC, vm.createContext(win));
  const off = win.FortuneAI.registerHooks({ gate() { throw new Error("x"); }, decorate() { throw new Error("y"); } });
  const box = doc.createElement("div");
  win.FortuneAI.renderSections(box, RES);
  assert.equal(html(box), plain.out);
  off();
  const box2 = doc.createElement("div");
  win.FortuneAI.renderSections(box2, RES);
  assert.equal(html(box2), plain.out);
  assert.equal(typeof win.FortuneAI.registerHooks(null), "function", "bad input is ignored");
});

test("onAIResponse: observers get a clone of every POST /api/fortune response", async () => {
  const log = [];
  const doc = fakeDoc();
  const win = {
    document: doc, setTimeout, clearTimeout, console, LENSIQ_API_BASE: "https://api.x.dev",
    localStorage: { getItem: (k) => (k === "fa-consent" ? "1" : null), setItem() {}, removeItem() {} },
    fetch: async (u) => {
      if (String(u).endsWith("/api/fortune/status")) return { ok: true, json: async () => ({ enabled: true }) };
      const r = { ok: false, status: 429, json: async () => ({ code: "quota" }) }; r.clone = () => Object.assign({ cloned: true }, r); return r;
    }
  };
  win.window = win; vm.runInContext(FA_SRC, vm.createContext(win));
  win.FortuneAI.registerHooks({ onAIResponse: (r) => log.push([r.status, r.cloned === true]) });
  const facts = { domain: "numbers", lang: "th", subject: {}, facts: [] };
  await win.FortuneAI.interpret(facts, { useAI: true }).catch(() => null);
  assert.deepEqual(log, [[429, true]]);
});

test("lensiq-member.js uses the explicit hooks (legacy wrappers only as a fallback for an old fortune-ai.js)", () => {
  const src = readFileSync(join(ROOT, "lensiq-member.js"), "utf8");
  assert.match(src, /FA\.registerHooks\(HOOKS\)/);
  assert.match(src, /W\.LQFortuneHooks = Array\.isArray\(W\.LQFortuneHooks\)/, "queued when fortune-ai.js loads later");
  assert.match(src, /function legacy\(\)[\s\S]*wrapFA\(\);\s*watchQuota\(\);/, "wrappers only inside the legacy fallback");
  const init = src.slice(src.lastIndexOf("W.LQMember = api;"));
  assert.doesNotMatch(init, /\bwrapFA\(\);|\bwatchQuota\(\);/, "no unconditional wrapping at start-up");
  assert.match(init, /\battach\(\);/);
});

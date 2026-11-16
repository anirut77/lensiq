"use strict";
// tests/unit/fortune-paid-sources.test.js — FIXED TEST SET, owner decision 2026-11-15 (decision 46, option ก) replaces the
// 2026-11-10 "Remedies and merit" rule: a "recommended sources" section with links to outside sellers is allowed (we sell nothing
// on our own site), behind its own off flag. Locked (evals-locks/fortune-paid.sha256, re-lock (5)) BEFORE the build. DOM half:
// tests/e2e/fortune-paid-sources.e2e.mjs. The hard limits stay: (a) no promised result, never the fix for a warning;
// (b) nothing in the crisis state; (c) behind off switches (LENSIQ_FORTUNE_PAID and LENSIQ_FORTUNE_SOURCES, both default false).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const P = require("../../fortune-paid.js");
const LANGS = ["th", "en", "zh"];
function withSw(paid, src, fn) {
  const a = globalThis.LENSIQ_FORTUNE_PAID, b = globalThis.LENSIQ_FORTUNE_SOURCES;
  globalThis.LENSIQ_FORTUNE_PAID = paid; globalThis.LENSIQ_FORTUNE_SOURCES = src;
  try { return fn(); } finally { globalThis.LENSIQ_FORTUNE_PAID = a; globalThis.LENSIQ_FORTUNE_SOURCES = b; }
}
const T = s => ({ th: s, en: s, zh: s });
const OK = { id: "s1", status: "published", approved: true, url: "https://example.com/shop", name: T("ร้านตัวอย่าง"), note: T("ดอกไม้ ธูป เทียน"), keys: ["any"] };
const LIST = [
  OK,
  Object.assign({}, OK, { id: "s2", url: "http://example.com/x" }),                    // not https
  Object.assign({}, OK, { id: "s3", url: "javascript:alert(1)" }),                     // not a link
  Object.assign({}, OK, { id: "s4", status: "draft" }),                                // not published
  Object.assign({}, OK, { id: "s5", approved: false }),                                // not approved
  Object.assign({}, OK, { id: "s6", keys: ["chong"] }),                                // presented as the fix for a warning
  Object.assign({}, OK, { id: "s7", keys: ["weak"] }),                                 // presented as the fix for a warning
  Object.assign({}, OK, { id: "s8", note: T("ซื้อแล้วดวงดีขึ้นแน่นอน") }),                    // promised result
  Object.assign({}, OK, { id: "s9", note: { th: "จ่ายเพื่อแก้ชง ไม่งั้นเคราะห์ร้ายจะมา", en: "pay or your luck will stay bad", zh: "不付钱就会倒霉" } }), // fear-selling
];

test("switches: the sources section needs LENSIQ_FORTUNE_PAID and LENSIQ_FORTUNE_SOURCES exactly true; lensiq-config.js ships it false", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(src, /window\.LENSIQ_FORTUNE_SOURCES\s*=/);
  for (const [pre, want] of [[undefined, false], ["true", false], [true, true]]) {
    const win = { location: { pathname: "/x.html", hostname: "localhost", search: "" } };
    if (pre !== undefined) win.LENSIQ_FORTUNE_SOURCES = pre;
    win.window = win; vm.runInNewContext(src, win);
    assert.equal(win.LENSIQ_FORTUNE_SOURCES, want);
  }
  assert.equal(withSw(true, false, () => P.sourcesEnabled()), false);
  assert.equal(withSw(false, true, () => P.sourcesEnabled()), false);
  assert.equal(withSw(true, true, () => P.sourcesEnabled()), true);
  for (const l of LANGS) assert.deepEqual(withSw(true, false, () => P.sources(LIST, { lang: l })), [], l + ": flag off, nothing");
});

test("sources: only published, approved https entries, never a weak / chong entry, never a promised result or fear wording (TH/EN/ZH)", () => {
  for (const l of LANGS) {
    const out = withSw(true, true, () => P.sources(LIST, { lang: l }));
    assert.deepEqual(out.map(x => x.id), ["s1"], l);
    for (const x of out) { assert.match(x.url, /^https:\/\//); assert.ok(x.name.trim()); assert.ok(P.safe(x.note, { straight: false }) && P.safe(x.note, { straight: true })); }
    assert.ok(String(P.TEXT[l].srcTitle || "").trim() && String(P.TEXT[l].srcNote || "").trim(), l + ": heading and note");
  }
  // the note says the links go to outside sellers and that we sell nothing ourselves
  assert.match(P.TEXT.th.srcNote, /ร้านภายนอก/); assert.match(P.TEXT.th.srcNote, /ไม่ได้ขาย/);
  assert.match(P.TEXT.en.srcNote, /outside/i); assert.match(P.TEXT.en.srcNote, /(?:do not|don't) sell/i);
  assert.match(P.TEXT.zh.srcNote, /外部/); assert.match(P.TEXT.zh.srcNote, /不.*出售|不销售/);
});

test("sources: nothing in the crisis state, nothing with a malformed list", () => {
  for (const l of LANGS) {
    assert.deepEqual(withSw(true, true, () => P.sources(LIST, { lang: l, crisis: true })), [], l + ": crisis");
    assert.deepEqual(withSw(true, true, () => P.sources(null, { lang: l })), []);
    assert.deepEqual(withSw(true, true, () => P.sources([null, 3, "x", {}], { lang: l })), []);
  }
});

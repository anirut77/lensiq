"use strict";
// tests/unit/fortune-paid-affiliate.test.js — FIXED TEST SET, owner night order 2026-11-15 item 3 (recommended sources:
// affiliate label, per-entry approval, no entries ship). Locked (evals-locks/fortune-paid.sha256, re-lock (8)) BEFORE the build.
// Hard limits a, b, c (CLAUDE.md "Remedies, merit and paid fortune content") unchanged: the earlier sources tests still apply.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const P = require("../../fortune-paid.js");
const LANGS = ["th", "en", "zh"];
const T = s => ({ th: s, en: s, zh: s });
const on = fn => { const a = globalThis.LENSIQ_FORTUNE_PAID, b = globalThis.LENSIQ_FORTUNE_SOURCES; globalThis.LENSIQ_FORTUNE_PAID = true;
  globalThis.LENSIQ_FORTUNE_SOURCES = true; try { return fn(); } finally { globalThis.LENSIQ_FORTUNE_PAID = a; globalThis.LENSIQ_FORTUNE_SOURCES = b; } };
const E = { id: "a1", status: "published", approved: true, url: "https://example.com/a", name: T("ร้าน ก"), note: T("ดอกไม้"), keys: ["any"] };

test("affiliate: an entry marked affiliate carries the affiliate label in every language; others do not", () => {
  for (const l of LANGS) {
    assert.ok(String(P.TEXT[l].srcAffiliate || "").trim(), l + ": affiliate label text");
    const out = on(() => P.sources([Object.assign({}, E, { affiliate: true }), Object.assign({}, E, { id: "a2" })], { lang: l }));
    assert.deepEqual(out.map(x => [x.id, !!x.affiliate]), [["a1", true], ["a2", false]]);
    assert.equal(out[0].label, P.TEXT[l].srcAffiliate);
    assert.ok(!out[1].label, "no label on a plain link");
  }
  assert.match(P.TEXT.th.srcAffiliate, /ค่าตอบแทน|พันธมิตร/); assert.match(P.TEXT.en.srcAffiliate, /affiliate/i); assert.match(P.TEXT.zh.srcAffiliate, /联盟|佣金/);
});

test("per-entry approval: an entry needs approved === true and status published; none ship with the site", () => {
  for (const bad of [{ approved: "true" }, { approved: 1 }, { approved: undefined }, { status: "pending" }]) {
    assert.deepEqual(on(() => P.sources([Object.assign({}, E, bad)], { lang: "th" })), [], JSON.stringify(bad));
  }
  const shipped = fs.readdirSync(ROOT).filter(f => /\.(?:js|html)$/.test(f)).filter(f => /LQ_FORTUNE_SOURCES\s*=\s*\[/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(shipped, [], "no recommended-source entries ship in the site files");
});

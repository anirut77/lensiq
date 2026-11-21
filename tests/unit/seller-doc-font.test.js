"use strict";
// tests/unit/seller-doc-font.test.js — owner decision 161 (2026-11-19): the printed quotation / invoice / receipt carries
// the self-hosted Prompt font inline, so Thai never falls back to a machine font (TLWG on Linux, TH Sarabun New …) whose
// tone-mark glyphs are encoded at U+F700–U+F71A and end up in the PDF ToUnicode.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");

test("backend/src/doc-font.js matches vendor/fonts/prompt (tools/doc-font.mjs --check)", () => {
  execFileSync(process.execPath, [join(ROOT, "tools", "doc-font.mjs"), "--check"], { stdio: "pipe" });
});

test("the seller document names only the inline font for Thai and its CSP lets the inline font load", async () => {
  const seller = await import(join(ROOT, "backend", "src", "seller.js"));
  const { DOC_FONT_CSS, DOC_FONT_FAMILY } = await import(join(ROOT, "backend", "src", "doc-font.js"));
  assert.equal((DOC_FONT_CSS.match(/@font-face\{/g) || []).length, 4, "Prompt 400 + 700, Thai + Latin");
  assert.ok(!/url\((?!data:font\/woff2;base64,)/.test(DOC_FONT_CSS), "every src is an inline woff2");
  const html = seller.renderDoc({ doc_type: "quotation", status: "draft", number: null, created_at: 1763500000, issued_at: null,
    buyer: { name: "ลูกค้าทดสอบ", address: "1 ถนนทดสอบ" }, lines: [], missing_seller_fields: ["legal_name"], seller: { legal_name: "" },
    vat_registered: false, vat_rate_bp: 0, vat_satang: 0, subtotal_satang: 0, total_satang: 0, extra: { valid_days: 30 } });
  assert.ok(html.includes(DOC_FONT_CSS), "inline @font-face rules in the document");
  const body = html.match(/body \{ font: [^;]+;/)[0];
  assert.match(body, new RegExp("font: 13px/1\\.5 " + DOC_FONT_FAMILY + ","), "the inline font comes first");
  assert.ok(!/Sarabun|Noto Sans Thai/.test(body), "no Thai machine font named");
  assert.match(seller.DOC_HEADERS["Content-Security-Policy"], /font-src data:/);
  const { ADMIN_PAGE_HEADERS } = await import(join(ROOT, "backend", "src", "index.js"));
  assert.match(ADMIN_PAGE_HEADERS["Content-Security-Policy"], /font-src 'self' data:;/, "the preview iframe (srcdoc) inherits the admin policy");
});

"use strict";
// tests/unit/fortune-print.test.js — FIXED TEST SET, owner order 2026-11-16 (testers item B, "print layout").
// Written and locked BEFORE any measurement (~/LENSIQ-field/evals/print-report/, sha256 in evals-locks/print-report.sha256).
// The browser half (real PDFs from Chromium, 5 pages x TH/EN/ZH x A4/A5, 80 mm, crisis) is tests/e2e/fortune-print-report-kit.mjs.
// Contract checked here, on the pure renderer LQPrint.render(model, { size, paid }) (fortune-print.js):
//   P1  one renderer, loaded lazily: fortune-print.js / fortune-print.css exist, no fortune page loads them in its HTML,
//       fortune-share.js fetches them; render() is the same function the paid PDF will call (size + paid options)
//   P2  header: LENSIQ mark (svg) + "LENSIQ", the report title, the date; the person's name only when the model has one
//   P3  every section heading of the reading is a heading element of the report; a heading with nothing under it is dropped
//   P4  footer: the disclaimer line in a repeating table footer; page numbers "หน้า X / Y" (TH / EN / ZH) in an @page margin box
//   P5  no buttons, menus, forms, navigation, dialogs or banners in the report
//   P6  page breaks: heading + first block kept together; headings break-after: avoid; list items, table rows break-inside: avoid
//   P7  black and white: every colour swatch and every icon carries a text label
//   P8  sizes: A4 and A5 portrait (@page size), 80 mm receipt as its own style class; short lists in two columns
//   P9  crisis: a crisis model renders nothing; the labels exist in TH / EN / ZH; text is escaped
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const has = f => fs.existsSync(path.join(ROOT, f));
const LP = has("fortune-print.js") ? require("../../fortune-print.js") : null;
const SP = require("../../fortune-share.js");
const CSS = has("fortune-print.css") ? fs.readFileSync(path.join(ROOT, "fortune-print.css"), "utf8") : "";

const LANGS = ["th", "en", "zh"];
const SIZES = ["A4", "A5", "80mm"];
const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream",
  "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const PAGE_WORD = { th: "หน้า", en: "Page", zh: "页" };
const DATE = new Date(2026, 10, 16, 9, 30);
const H = {
  th: ["ภาพรวม", "การงาน", "การเงิน", "สิ่งที่ควรทำ", "ตารางดาว", "หัวข้อที่ว่าง"],
  en: ["Overview", "Work", "Money", "What to do", "Planet table", "Empty heading"],
  zh: ["总览", "事业", "财运", "建议", "星表", "空标题"],
};
const model = (lang, extra) => Object.assign({
  page: "horoscope", lang, title: SP.pageName("horoscope", lang), date: DATE, link: "https://anirut77.github.io/lensiq/horoscope.html",
  sections: [
    { level: 2, heading: H[lang][0], blocks: [{ t: "p", text: "A <b>first</b> paragraph & more." }, { t: "p", text: "Careful here.", caution: true }] },
    { level: 2, heading: H[lang][1], blocks: [{ t: "list", items: ["one", "two", "three", "four", "five"].map(x => ({ text: x })) }] },
    { level: 2, heading: H[lang][2], blocks: [{ t: "list", ordered: true, items: [{ label: "A", text: "long ".repeat(30) }, { label: "B", text: "x" }] }] },
    { level: 2, heading: H[lang][3], blocks: [{ t: "p", text: "Wear red." }, { t: "advice", icons: ["colour", "direction", "worship", "respect"], sw: [{ hex: "#dc2626", name: "red" }, { hex: "#16a34a", name: "" }], note: "belief" }] },
    { level: 3, heading: H[lang][4], blocks: [{ t: "table", caption: "cap", rows: [[{ text: "h1", head: true }, { text: "h2", head: true }], [{ text: "a" }, { text: "", sw: [{ hex: "#1d4ed8", name: "blue" }] }]] }] },
    { level: 2, heading: H[lang][5], blocks: [] },
  ],
}, extra || {});
const tags = (html, sel) => html.match(new RegExp(sel, "g")) || [];

test("P1 one lazily loaded renderer: files exist, no page loads them eagerly, fortune-share.js fetches them", () => {
  assert.ok(LP, "fortune-print.js exists and loads in Node");
  assert.ok(CSS.length > 500, "fortune-print.css exists");
  assert.equal(typeof LP.render, "function", "LQPrint.render(model, opts)");
  for (const p of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, p + ".html"), "utf8");
    assert.ok(!/fortune-print\.(?:js|css)/.test(html), p + ".html loads the print renderer eagerly (speed budget)");
  }
  const share = fs.readFileSync(path.join(ROOT, "fortune-share.js"), "utf8");
  assert.ok(/["']fortune-print\.js/.test(share), "fortune-share.js fetches fortune-print.js");
  assert.ok(/fortune-print\.css/.test(fs.readFileSync(path.join(ROOT, "fortune-print.js"), "utf8")), "fortune-print.js fetches fortune-print.css");
});

for (const lang of LANGS) for (const size of SIZES) {
  test(`P2-P8 [${lang} ${size}] page structure`, () => {
    assert.ok(LP, "fortune-print.js missing");
    const html = LP.render(model(lang), { size });
    // P2 header
    const head = (/<thead>([\s\S]*?)<\/thead>/.exec(html) || [])[1] || "";
    assert.ok(/<svg[^>]*class="[^"]*lqp-mark/.test(head) && head.includes("LENSIQ"), "header has the LENSIQ mark");
    assert.ok(head.includes(SP.pageName("horoscope", lang)), "header has the report title");
    assert.ok(head.includes(SP.dateText(DATE, lang)), "header has the date");
    assert.ok(!/lqp-hd-name/.test(head), "no name in the header when none was given");
    const named = LP.render(model(lang, { name: "สมใจ" }), { size });
    assert.ok(/<thead>[\s\S]*สมใจ[\s\S]*<\/thead>/.test(named), "the name is in the header when given");
    // P3 headings
    for (const h of H[lang].slice(0, 5)) assert.ok(new RegExp("<h[2-4][^>]*data-lqp-h[^>]*>" + h + "</h[2-4]>").test(html), "heading " + h);
    assert.ok(!html.includes(H[lang][5]), "a heading with nothing under it is left out");
    // P4 footer + page numbers
    const foot = (/<tfoot>([\s\S]*?)<\/tfoot>/.exec(html) || [])[1] || "";
    assert.ok(foot.includes(LINE[lang]), "disclaimer line in the repeating footer");
    const page = (/<style data-lqp-page>([\s\S]*?)<\/style>/.exec(html) || [])[1] || "";
    assert.ok(/@page\s*\{/.test(page) && /@bottom-[a-z-]+\s*\{[^}]*counter\(page\)[^}]*counter\(pages\)/.test(page), "page numbers in an @page margin box");
    assert.ok(page.includes(PAGE_WORD[lang]), "page word in " + lang);
    // P5 nothing interactive
    for (const t of ["<button", "<nav", "<form", "<select", "<input", "<textarea", "<dialog", 'role="menu', 'role="banner', "<script"]) assert.ok(!html.includes(t), "report holds " + t);
    // P6 breaks: the first block sits with its heading
    for (const h of H[lang].slice(0, 5)) assert.ok(new RegExp('<div class="lqp-lead"><h[2-4][^>]*>' + h + "</h[2-4]>(?:<p|<ul|<ol|<table|<div|<figure)").test(html), "heading + first block together: " + h);
    // P7 every swatch and icon labelled
    const sw = tags(html, '<span class="lqp-sw"><i class="lqp-chip"[^>]*></i>([^<]*)</span>');
    assert.ok(sw.length >= 3, "swatches rendered: " + sw.length);
    for (const s of sw) assert.ok(/<\/i>[^<\s][^<]*<\/span>$/.test(s), "swatch without a label: " + s);
    const ic = tags(html, '<span class="lqp-ico"><svg[\\s\\S]*?</svg>([^<]*)</span>');
    assert.equal(ic.length, 4, "4 icons");
    for (const s of ic) assert.ok(/<\/svg>[^<\s][^<]*<\/span>$/.test(s), "icon without a label: " + s.slice(-60));
    // P8 size
    if (size === "80mm") { assert.ok(/class="lqp lqp--r80/.test(html), "receipt class"); assert.ok(/size:\s*80mm/.test(page), "80 mm paper"); }
    else { assert.ok(new RegExp("size:\\s*" + size + "\\s+portrait").test(page), size + " portrait"); }
    if (size !== "80mm") assert.ok(/<ul class="lqp-list lqp-cols/.test(html), "a short list in two columns");
    assert.ok(/A &lt;b&gt;first&lt;\/b&gt; paragraph &amp; more\./.test(html), "text is escaped");
  });
}

test("P6 P8 stylesheet: break rules, two columns, A5 and 80 mm styles, B&W chips", () => {
  assert.ok(CSS, "fortune-print.css missing");
  const rule = sel => { const m = new RegExp("(?:^|[}\\s,])" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{][^}]*\\}", "m").exec(CSS); return m ? m[0] : ""; };
  for (const h of [".lqp-h", ".lqp-part", ".lqp-subh"]) assert.ok(/break-after:\s*avoid/.test(rule(h)), h + " break-after: avoid");
  assert.ok(/break-inside:\s*avoid/.test(rule(".lqp-lead")), "heading + first block kept together");
  assert.ok(/break-inside:\s*avoid/.test(rule(".lqp li")), "list items never split");
  assert.ok(/break-inside:\s*avoid/.test(rule(".lqp-tbl tr")), "table rows never split");
  assert.ok(/grid-template-columns:\s*1fr 1fr/.test(rule(".lqp-cols")), "two columns");
  assert.ok(/\.lqp--a5\b/.test(CSS) && /\.lqp--r80\b/.test(CSS), "A5 and 80 mm styles");
  assert.ok(/print-color-adjust:\s*exact/.test(CSS) && /border:[^;]*solid #111/.test(rule(".lqp-chip")), "chips outlined and kept in colour");
  assert.ok(/table-header-group/.test(CSS) && /table-footer-group/.test(CSS), "header / footer repeat on every page");
});

test("P9 crisis model renders nothing; paid uses the same renderer; labels in TH / EN / ZH", () => {
  assert.ok(LP, "fortune-print.js missing");
  for (const lang of LANGS) {
    assert.equal(LP.render(Object.assign(model(lang), { crisis: true }), { size: "A4" }), "", "crisis model renders nothing");
    const paid = LP.render(model(lang), { size: "A4", paid: true });
    assert.ok(/lqp--paid/.test(paid) && paid.includes(LINE[lang]) && /data-lqp-h/.test(paid), "paid report: same structure");
    for (const k of ["report", "paid", "forName", "born", "made", "page"]) assert.ok(String(LP.W[lang][k] || "").trim(), `label ${k} in ${lang}`);
    for (const k of ["colour", "worship", "respect", "direction"]) assert.ok(String(LP.W[lang].icon[k] || "").trim(), `icon label ${k} in ${lang}`);
    assert.ok(String(SP.L[lang].include || "").trim(), `"include my name" label in ${lang}`);
  }
  assert.equal(SP.print({ doc: { documentElement: { getAttribute: k => (k === "data-lq-crisis" ? "1" : null), setAttribute() {} } } }), false, "print refuses in the crisis state");
});

"use strict";
// tests/unit/accuracy-claims.test.js — round 16 "honest claims": every accuracy claim on the product landing pages
// (exam, attendance, store, retail, hr, crowd) states its number, its test-set size (n) and a source label
// (synthetic / public dataset / field, or "not measured") in Thai, English and Chinese, as registered in
// docs/ACCURACY-CLAIMS.md section 4. The quoted evidence must still be in the source document, Crowd must say
// plainly that it is not yet suitable for dense crowds, and every one-pager carries an "accuracy and source" table.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const squash = s => String(s).replace(/\s+/g, " ").trim();
const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const THAI = /[฀-๿]/;

const LABELS = {
  synthetic: { th: "ข้อมูลจำลอง", en: "synthetic", zh: "合成数据" },
  public: { th: "ชุดข้อมูลสาธารณะ", en: "public dataset", zh: "公开数据集" },
  field: { th: "หน้างานจริง", en: "field", zh: "现场" },
  notmeasured: { th: "ยังไม่ได้วัด", en: "not measured", zh: "尚未测量" },
  prelim: { th: "เบื้องต้น", en: "preliminary", zh: "初步" },
  published: { th: "งานวิจัยที่ตีพิมพ์", en: "published research", zh: "已发表研究" },
  dense: { th: "ยังไม่เหมาะกับฝูงชนหนาแน่น", en: "not yet suitable for dense crowds", zh: "尚不适用于密集人群" },
  // qualifiers (not source labels on their own): a figure measured on the tuning data says so, in every language
  tuning: { th: "ชุดที่ใช้ปรับค่า", en: "tuning", zh: "调参", qualifier: true },
  optimistic: { th: "ดีเกินจริง", en: "optimistic", zh: "偏乐观", qualifier: true }
};
const SOURCE_LABELS = Object.keys(LABELS).filter(k => !LABELS[k].qualifier);
const OWNED = ["exam", "attendance", "store", "retail", "hr", "crowd"];

/** split a Markdown table row on unescaped "|" -> trimmed cells ("\|" becomes "|") */
function cells(line) {
  const out = []; let cur = "";
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { out.push(cur.trim()); cur = ""; } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}
const list = c => (c === "—" || c === "" ? [] : c.split(";").map(x => x.trim()).filter(Boolean));

function register() {
  const md = read("docs/ACCURACY-CLAIMS.md");
  const m = md.match(/<!-- claims-register:start -->([\s\S]*?)<!-- claims-register:end -->/);
  assert.ok(m, "register markers in docs/ACCURACY-CLAIMS.md");
  const rows = m[1].split("\n").filter(l => /^\|/.test(l.trim()));
  const head = cells(rows[0]);
  assert.deepEqual(head, ["id", "page", "dict", "key", "figures", "n", "labels", "evidence", "quote"]);
  return rows.slice(2).map(l => {
    const c = cells(l); const r = {};
    head.forEach((h, i) => { r[h] = c[i]; });
    return { ...r, figures: list(r.figures), n: list(r.n), labels: list(r.labels), quote: list(r.quote) };
  });
}

const dicts = new Map();
function dict(lang, base) {
  const k = lang + "-" + base;
  if (!dicts.has(k)) { const w = {}; w.window = w; vm.runInNewContext(read(`i18n/${lang}-${base}.js`), w); dicts.set(k, Object.assign({}, ...w.LQI18N_Q.map(q => q[lang] || {}))); }
  return dicts.get(k);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Thai markup text of the element carrying data-i18n=key (no nested tags allowed in a claim) */
function thText(html, key) {
  const m = html.match(new RegExp(`<([a-z0-9]+)\\b[^>]*\\bdata-i18n="${reEsc(key)}"[^>]*>([^<]*)</\\1>`));
  return m ? squash(unesc(m[2])) : null;
}

test("register: rows are complete, labels and pages known, evidence still in the source documents", () => {
  const rows = register();
  assert.ok(rows.length >= 25, "rows: " + rows.length);
  const ids = new Set();
  for (const r of rows) {
    assert.ok(!ids.has(r.id), "duplicate id " + r.id); ids.add(r.id);
    assert.ok(OWNED.includes(r.page), r.id + " page " + r.page);
    assert.ok(r.labels.some(l => SOURCE_LABELS.includes(l)), r.id + " has a source label");
    r.labels.forEach(l => assert.ok(LABELS[l], `${r.id}: unknown label ${l}`));
    // a claim either has a number with its n, or is explicitly "not measured" (or a dense-crowd statement)
    if (r.figures.length && !r.labels.includes("notmeasured")) assert.ok(r.n.length, r.id + ": a number needs its n");
    if (!r.figures.length) assert.ok(r.labels.includes("notmeasured"), r.id + ": no number -> must say not measured");
    const src = squash(read(r.evidence));
    assert.ok(r.quote.length, r.id + " quotes its evidence");
    r.quote.forEach(q => assert.ok(src.includes(squash(q)), `${r.id}: evidence not found in ${r.evidence}: ${q}`));
    // a figure whose evidence is a tuning set must say "tuning set, optimistic" (ACCURACY-CLAIMS.md section 1)
    if (r.quote.some(q => /tuning/i.test(q)) && r.labels.includes("public")) {
      assert.ok(r.labels.includes("tuning"), r.id + ": evidence is a tuning set -> label 'tuning'");
      if (r.figures.some(f => /85%|\+3\.2%/.test(f))) assert.ok(r.labels.includes("optimistic"), r.id + ": tuning-set headline figure -> 'optimistic'");
    }
  }
});

test("the LFW / PETS tuning figures never appear on a page or dictionary without their tuning-set caveat", () => {
  const bad = [];
  const keysOf = new Map(register().map(r => [r.key, r]));
  for (const r of keysOf.values()) {
    const html = read(r.page + ".html");
    const txt = { th: thText(html, r.key), en: dict("en", r.dict)[r.key], zh: dict("zh", r.dict)[r.key] };
    for (const lang of ["th", "en", "zh"]) {
      const t = txt[lang] || "";
      if (/\b85%|\+3\.2%/.test(t) && !(lang === "en" ? t.toLowerCase() : t).includes(LABELS.tuning[lang])) bad.push(`${r.id} ${lang}: ${r.key}`);
      if (/13,233/.test(t) && /n = 13,233/.test(t)) bad.push(`${r.id} ${lang}: 13,233 is the dataset size, not n`);
    }
  }
  assert.deepEqual(bad, []);
  // the held-out CASIA figure is the attendance headline (listed before the LFW figure)
  const att = read("attendance.html");
  assert.ok(att.indexOf('data-i18n="attendance.cl2"') < att.indexOf('data-i18n="attendance.cl1"'), "CASIA (held out) first");
});

test("every registered claim: Thai markup, en and zh carry the number, the n and the source label", () => {
  const bad = [];
  for (const r of register()) {
    const html = read(r.page + ".html");
    const txt = { th: thText(html, r.key), en: dict("en", r.dict)[r.key], zh: dict("zh", r.dict)[r.key] };
    for (const lang of ["th", "en", "zh"]) {
      const t = txt[lang];
      if (t == null) { bad.push(`${r.id} ${lang}: no text for ${r.key}`); continue; }
      if (lang !== "th" && THAI.test(t)) bad.push(`${r.id} ${lang}: Thai letters in ${r.key}`);
      const hay = lang === "en" ? t.toLowerCase() : t;
      for (const f of r.figures.concat(r.n)) if (!t.includes(f)) bad.push(`${r.id} ${lang}: "${f}" missing in ${r.key}: ${t}`);
      for (const l of r.labels) { const w = LABELS[l][lang]; if (!hay.includes(lang === "en" ? w.toLowerCase() : w)) bad.push(`${r.id} ${lang}: label "${w}" missing in ${r.key}`); }
    }
  }
  assert.deepEqual(bad, []);
});

test("no unregistered claim line on the owned pages (every *.cl* key is in the register)", () => {
  const keys = new Set(register().map(r => r.key));
  for (const p of OWNED) {
    const html = read(p + ".html");
    for (const m of html.matchAll(/data-i18n="([^"]*\.cl(?:\d+|\.\w+))"/g)) {
      if (/\.cl\.h$/.test(m[1])) continue; // the claim-list heading
      assert.ok(keys.has(m[1]), `${p}.html: claim ${m[1]} is not in docs/ACCURACY-CLAIMS.md`);
    }
    assert.match(html, /class="[^"]*\bclaims\b/, p + ".html has a claim list");
  }
});

test("crowd says plainly, above the collapsed panel, that it is not yet suitable for dense crowds", () => {
  const html = read("crowd.html");
  const at = html.indexOf('data-i18n="cr.cl.dense"'), det = html.indexOf('<details class="card cr-acc"');
  assert.ok(at > 0 && det > 0 && at < det, "dense-crowd note is visible before the details panel");
  assert.ok(!/<details[^>]*>(?:(?!<\/details>)[\s\S])*cr\.cl\.dense/.test(html), "not inside a <details>");
  assert.match(thText(html, "cr.cl.dense"), /ยังไม่เหมาะกับฝูงชนหนาแน่น/);
  assert.match(dict("en", "crowd")["cr.cl.dense"], /not yet suitable for dense crowds/i);
  assert.match(dict("zh", "crowd")["cr.cl.dense"], /尚不适用于密集人群/);
  // preliminary stays stated
  assert.match(html, /เบื้องต้น \(PRELIMINARY\)/);
});

test("the unsupported retail figure stays gone", () => {
  for (const f of ["retail.html", "i18n/en-products.js", "i18n/zh-products.js", "docs/ONE-PAGER-RETAIL.md"]) {
    assert.ok(!read(f).includes("10–30%"), f + ": '±10–30% per day' has no source in ACCURACY.md");
  }
});

test("every one-pager has an accuracy-and-source table; each row names a source label", () => {
  const files = fs.readdirSync(path.join(ROOT, "docs")).filter(f => /^ONE-PAGER-.*\.md$/.test(f));
  assert.ok(files.length >= 6, files.join(","));
  const allLabels = SOURCE_LABELS.map(k => LABELS[k]).flatMap(l => [l.th, l.en, l.zh]).concat(["ไม่เกี่ยวข้อง", "不适用", "not applicable"]);
  for (const f of files) {
    const md = read("docs/" + f);
    const m = md.match(/^## (ความแม่นยำและที่มา|准确率与来源)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    assert.ok(m, f + ": section '## ความแม่นยำและที่มา' (or '## 准确率与来源')");
    const rows = m[2].split("\n").filter(l => /^\|/.test(l.trim())).slice(2);
    assert.ok(rows.length >= 1, f + ": table rows");
    for (const l of rows) {
      const c = cells(l);
      assert.ok(c.length >= 5, f + ": 5 columns: " + l);
      assert.ok(allLabels.some(w => c[3].toLowerCase().includes(w.toLowerCase())), `${f}: source cell without a label: ${l}`);
      // the LFW 85% / PETS +3.2% figures carry the tuning-set caveat; n is never the LFW dataset size
      if (/\b85%|\+3\.2%/.test(c[1])) {
        const ok = /ชุดที่ใช้ปรับค่า|调参|tuning/i.test(c[1] + c[2]) && /ดีเกินจริง|偏乐观|optimistic/i.test(c[1] + c[2]);
        assert.ok(ok, `${f}: tuning-set figure without "tuning set, optimistic": ${l}`);
      }
      assert.ok(!/n = 13,233/.test(c[2]), `${f}: 13,233 is the LFW dataset size, not the test set: ${l}`);
      // UTKFace age / gender: the source calls the figures an upper bound and names the Asian gender figure
      if (/UTKFace/.test(c[2])) assert.ok(/ขอบบน|上限|upper bound/i.test(c[3] + c[1]) && /92%/.test(c[1]), `${f}: UTKFace row needs "upper bound" and Asian 92%: ${l}`);
      if (/\d\s*%/.test(c[1]) && !/งานวิจัยที่ตีพิมพ์|已发表研究|published research|ยังไม่ได้วัด|尚未测量|not measured/i.test(c[3])) assert.match(c[2], /n = /, `${f}: a percentage needs its n: ${l}`);
    }
  }
  assert.match(read("docs/ONE-PAGER-TH.md"), /ยังไม่เหมาะกับฝูงชนหนาแน่น/);
  assert.match(read("docs/ONE-PAGER-ZH.md"), /尚不适用于密集人群/);
});

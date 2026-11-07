"use strict";
// node --test tests/unit — commercial-readiness pieces: the public document pages (terms / privacy / help /
// camera-notice: three complete language copies, draft banner, language-parallel anchors, no link to the pricing
// draft), the shared legal footer and report strings in both common dictionaries, lensiq-report.js (report text that
// tools/fortune-review-ingest.mjs can parse back), and the native-speaker review export → score → ingest round trip.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const PAGES = ["terms.html", "privacy.html", "help.html", "camera-notice.html"];

function dict(file, lang) {
  const win = { location: { search: "" }, localStorage: { getItem: () => null, setItem() {} }, URLSearchParams };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(read("lensiq-i18n.js"), ctx);
  for (const f of [].concat(file)) vm.runInContext(read(f), ctx);
  return { I: win.LQI18N, lang };
}

test("document pages: TH/EN/ZH copies, draft banner, CSP, parallel anchors, no pricing/admin link", () => {
  for (const p of PAGES) {
    const html = read(p);
    assert.match(html, /http-equiv="Content-Security-Policy"/, p + " CSP meta");
    for (const [cls, lang] of [["lg-th", "th"], ["lg-en", "en"], ["lg-zh", "zh-Hans"]]) assert.ok(html.includes(`class="lg ${cls}`) && html.includes(`lang="${lang}"`), `${p}: ${cls}`);
    assert.ok(html.includes("รอทนายความตรวจทาน") && html.includes("pending review by a Thai lawyer") && html.includes("待泰国律师审阅"), p + ": draft banner in all three languages");
    assert.ok(!/href="(\.\/)?(pricing|admin)\.html/.test(html), p + " must not link the pricing draft or admin");
    assert.ok(html.includes('src="i18n/zh-legal.js'), p + " loads the title dictionary");
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, p + ": duplicate id " + ids.filter((x, i) => ids.indexOf(x) !== i));
    // every Thai section anchor has its English and Chinese twin (legal.js maps #p3 -> #en-p3 / #zh-p3)
    const th = ids.filter(i => !/^(en|zh)-/.test(i) && i !== "main" && i !== "siteNav");
    for (const i of th) for (const pre of ["en-", "zh-"]) assert.ok(ids.includes(pre + i), `${p}: #${i} has no #${pre}${i}`);
    // in-page links resolve
    for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(m[1]), `${p}: dangling #${m[1]}`);
  }
  // cross-page anchors used by the other pages (and by sign-in / checkout copy) exist
  const pv = read("privacy.html"), tm = read("terms.html"), hp = read("help.html");
  for (const id of ["p3", "p7", "p8", "p9"]) assert.ok(pv.includes(`id="${id}"`), "privacy #" + id);
  for (const id of ["t8", "t9", "t12"]) assert.ok(tm.includes(`id="${id}"`), "terms #" + id);
  assert.ok(hp.includes('id="h-support"') && hp.includes('id="h-status"'));
  // prices are never presented as offers on the documents
  assert.ok(!/\d[\d,]*\s*(THB|บาท)/.test(tm + hp), "no price figures in terms/help");
});

test("title dictionaries: zh-legal and en-legal have the same keys and every page key", () => {
  const zh = dict("i18n/zh-legal.js").I, en = dict("i18n/en-legal.js").I;
  const keys = new Set();
  for (const p of PAGES) { const h = read(p); for (const m of h.matchAll(/data-i18n="(legal\.[^"]+)"/g)) keys.add(m[1]); for (const m of h.matchAll(/data-i18n-attr="content:(legal\.[^"]+)"/g)) keys.add(m[1]); }
  assert.equal(keys.size, 8);
  for (const k of keys) { assert.ok(zh.has(k, "zh"), "zh " + k); assert.ok(en.has(k, "en"), "en " + k); }
  for (const k of keys) { assert.ok(!/[฀-๿]/.test(zh.t(k, null, "zh")), "no Thai in zh " + k); assert.ok(!/[฀-๿一-鿿]/.test(en.t(k, null, "en")), "no Thai/CJK in en " + k); }
});

test("legal footer + report strings: translated in zh-common and en-common", () => {
  const zh = dict("i18n/zh-common.js").I, en = dict("i18n/en-common.js").I;
  const keys = new Set(["foot.terms", "foot.privacy", "foot.help", "foot.legalnav", "foot.about", "about.oss.notices"]);
  for (const m of read("lensiq-report.js").matchAll(/T\("(rp\.[a-z.]*[a-z])"/g)) keys.add(m[1]);
  for (const m of read("lensiq-report.js").matchAll(/\["([a-z]+)", "[^"]+"\]/g)) keys.add("rp.cat." + m[1]);
  for (const m of read("nav.js").matchAll(/data-i18n(?:-attr)?="(?:aria-label:)?(foot\.[a-z]+)"/g)) keys.add(m[1]);
  assert.ok(keys.size >= 25, "keys " + keys.size);
  for (const k of keys) {
    assert.ok(zh.has(k, "zh"), "zh-common missing " + k);
    assert.ok(en.has(k, "en"), "en-common missing " + k);
    assert.ok(!/[฀-๿]/.test(zh.t(k, null, "zh") + en.t(k, null, "en")), "Thai left in " + k);
  }
  assert.match(read("nav.js"), /legalFoot\(\)/);
  assert.match(read("nav.js"), /lensiq-report\.js/);
  assert.ok(read("about.html").includes('href="LICENSES/THIRD-PARTY-NOTICES.txt"'));
  assert.ok(read("index.html").includes('href="terms.html"') && read("index.html").includes('href="privacy.html"'));
});

test("lensiq-report: report text round-trips through the review ingest parser", async () => {
  const R = require("../../lensiq-report.js");
  const res = { source: "local", lang: "zh", sections: [{ id: "overview", title: "总览", paragraphs: ["第一段。", "第二段。"] }], reminder: "请运用自己的判断。", summary: { title: "简要", lines: [{ k: "亮点", t: "稳定" }] } };
  const txt = R.format(res, { cat: "harsh", note: "语气太重", page: "palm.html", lang: "zh", now: new Date("2026-11-07T10:20:00Z") });
  assert.match(txt, /^LENSIQ reading report v1\n/);
  assert.ok(txt.includes("reading_lang: zh") && txt.includes("category: harsh") && txt.includes("date: 2026-11-07T10:00Z"), "hour precision only");
  assert.ok(txt.includes("第二段。") && txt.includes("[reminder]"));
  assert.ok(!R.format(res, { include: false }).includes("第一段"), "reading text is optional");
  const { parseReports } = await import("../../tools/fortune-review-ingest.mjs");
  const back = parseReports("Fwd:\n" + txt + "\n\n" + R.format(res, { cat: "wrong" }));
  assert.equal(back.length, 2);
  assert.deepEqual([back[0].page, back[0].category, back[0].reading_lang, back[0].note, back[1].category], ["palm.html", "harsh", "zh", "语气太重", "wrong"]);
});

test("review export → scored CSV → ingest: stratified, reproducible, gate computed", async () => {
  const X = await import("../../tools/fortune-review-export.mjs");
  const G = await import("../../tools/fortune-review-ingest.mjs");
  const a = X.sample({ per: 1, domains: ["tarot", "bazi"], pool: 24, langs: ["th", "zh"] }), b = X.sample({ per: 1, domains: ["tarot", "bazi"], pool: 24, langs: ["th", "zh"] });
  assert.equal(a.rows.length, 2 * 2 * 3, "2 domains × 2 languages × 3 tones");
  assert.deepEqual(a.rows.map(r => r.text), b.rows.map(r => r.text), "same arguments → same sheet");
  for (const r of a.rows) {
    assert.ok(r.text.length > 200, r.id);
    if (r.lang === "zh") assert.ok(!/[฀-๿]/.test(r.text), "no Thai in a zh reading " + r.id);
  }
  const csv = X.toCSV(a.rows);
  const parsed = G.parseCSV(csv);
  assert.equal(parsed.length, a.rows.length);
  assert.equal(parsed[3].text, a.rows[3].text, "multi-line Thai text survives CSV");
  const scored = parsed.map((r, i) => ({ ...r, naturalness: "5", gentleness: i === 2 ? "2" : "4", cultural: "4", safety: i === 0 ? "ไม่ผ่าน" : "pass", reviewer: "r1" }));
  const S = G.summarise(scored.concat(scored.map(r => ({ ...r, reviewer: "r2", naturalness: "4" }))));
  assert.equal(S.scored, 24);
  assert.equal(S.flagged.length, 4, "low gentleness and the safety fail, for both reviewers");
  assert.equal(S.pass, false, "a safety fail fails the gate");
  assert.equal(S.agreement.within1, 1);
  assert.equal(G.score("6"), NaN); assert.equal(G.score(""), null); assert.equal(G.safety("通过"), "pass");
  assert.match(G.markdown(S, []), /Gate: FAIL/);
});

"use strict";
// tests/unit/accuracy-removal-223.test.js — owner decision 223 (2026-11-21; 223-1 to 223-7 confirmed by the owner at 23:39).
// FIXED TEST SET: written and locked (~/LENSIQ-field/evals/accuracy-removal-223/, sha256 in evals-locks/accuracy-removal-223.sha256)
// BEFORE any product change, on base ecb783b6. Expectations: tests/unit/accuracy-removal-223.spec.json; helpers:
// tests/unit/accuracy-removal-223.lib.js; the original figures recorded at base: docs/tech-sheets/ORIGINAL-FIGURES-223.json
// (tools/accuracy-snapshot-223.mjs). Static, synthetic; no network, no browser.
//   R1  no customer-facing page, dictionary, script string or buyer document shows a removed element (accuracy headings,
//       n =, dataset names, "preliminary", "why this status", intervals, status / source legends, source tags, internal
//       readiness sentences, "Beta", "accuracy check") in TH / EN / ZH, apart from the listed exceptions
//   R2  the removed blocks are gone: keys, section ids, classes and links to the accuracy sections
//   R3  every product shows its approved two lines (223-7) on its page(s), its category card and the exam one-pager
//   R4  the result line "โปรดตรวจสอบอีกครั้ง ผลอาจคลาดเคลื่อนได้" (common.recheck) on every result page and in the Crowd report
//   R5  badges follow audit section 3: none / "รุ่นทดลอง" / "เร็ว ๆ นี้" (+ hall "รุ่นทดลอง ยังไม่เปิดขาย"); no legend; plain counts
//   R6  buyer- and safety-relevant limits are still said in plain words; the examinee page says "near the camera" only;
//       research-licence labels stay (223-5); the legal draft banner stays and terms clause 11 is unchanged on the site (223-6)
//   R7  every original figure, legend and reason is in docs/tech-sheets/ (18 product sheets, TH + EN) and in the admin
//       "ผลการวัด" tab data, verbatim; docs/accuracy-figures.json keeps every figure
//   R7b (re-lock 2) docs/tech-sheets/SUPPLEMENT-223.json: every entry verbatim in the sheets and admin data; required items present;
//       R1 docs also: no bare percentage in a one-pager (price / VAT / refund terms excepted)
//   R9  (226, re-lock 3) one visibility list in nav.js = today's real state; off products are not listed anywhere; their direct
//       URL shows only the approved sentence + a home link (browser: tests/e2e/visibility-223.e2e.mjs); R5: no status label or filter
//       Re-lock 4 (coordinator decision 2026-11-22 on entry 13, reversible by the owner): Product Check is the part
//       "product-check" (tab #t-pc / panel #tab-pc of medicine.html, data-lq-part); medicine.html itself (drug checker) stays on
//       Re-lock 5 (review round 3): R9 also requires every customer script that writes product links to consult
//       window.LQ_VISIBILITY; R5 covers every buyer-facing document folder (docs/sales/**, buyer pilot documents) and the 5
//       outfit-simulation keys (แบบร่าง / Draft / 草稿); new R10: customer-handed documents name and link no switched-off product
//       Re-lock 6 (independent review follow-up): new R11: the help FAQ h-hr (TH / EN / ZH) is shown again with only the
//       team-face line hidden and a summary that names no switched-off product; the exam dashboard intro names no hall
//       camera; insights drops the data of a switched-off page in iqCollect (no text of it can be generated); the PDPA note
//       records the split camera-notice sentence; spec.offNames compiles and bites; R6 draft states the nav.js list today
//       and the back-office screen as a planned step 2 (browser half: visibility-223 V1 text check + V6)
//       Re-lock 7 (independent review of 9ebb0818: the exam dashboard demo button added a hall camera device): new R12:
//       spec.offNames carries the old names of the switched-off products and a negation-robust emotion pattern (bites both
//       ways: the positive product name fails, any negated generic "no emotion analysis" line passes); spec.followup223b
//       .demoSweep lists every demo / sample button of every switched-on page (browser half: visibility-223 V6 presses them
//       all); the exam dashboard demo consults window.LQ_VISIBILITY for exam-hall and its ?demo=1 sample data is lab-side only
//   R8  rules: CLAUDE.md lines 34 / 60 / 251-252 / 255-256 and docs/acceptance/README.md rule 7 inverted as approved (223-1)
const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const L = require("./accuracy-removal-223.lib.js");

const S = JSON.parse(L.read("tests/unit/accuracy-removal-223.spec.json"));
const SNAP = JSON.parse(L.read("docs/tech-sheets/ORIGINAL-FIGURES-223.json"));
const D = L.dicts();
const LANGS = ["en", "zh"];
const cats = readdirSync(L.ROOT).filter(f => /^cat-[a-z]+\.html$/.test(f) && f !== "cat-fortune.html").sort();
const show = (arr, n = 30) => arr.slice(0, n).map(x => typeof x === "string" ? x : JSON.stringify(x)).join("\n") + (arr.length > n ? `\n… ${arr.length - n} more` : "");
const flat = f => L.htmlFlat(L.read(f));
/** text of the <article data-page="p"> card on a category page */
function cardOf(html, page) {
  const i = html.indexOf(`data-page="${page}"`);
  if (i < 0) return null;
  const a = html.lastIndexOf("<article", i), b = html.indexOf("</article>", i);
  return html.slice(a, b + 10);
}
const allCards = () => cats.flatMap(f => { const h = L.read(f); return [...h.matchAll(/<article[^>]*data-page="([a-z-]+)"/g)].map(m => ({ file: f, page: m[1], html: cardOf(h, m[1]) })); });

test("R1 no removed element in customer-facing text (pages, dictionaries, script strings) — TH / EN / ZH", () => {
  const hits = L.scan(S);
  assert.deepEqual(hits, [], `${hits.length} removed elements still shown:\n` + show(hits.map(h => `${h.file} [${h.id}] ${h.text}`), 60));
});

test("R1 buyer documents (one-pagers, decks, demo scripts, onboarding) carry no figures, source tags or legends", () => {
  const pats = S.banned.map(b => ({ id: b.id, re: new RegExp(b.re, b.flags || "") }));
  const hits = [];
  for (const f of L.salesDocs()) L.read(f).split("\n").forEach((line, i) => { for (const p of pats) if (p.re.test(line)) hits.push(`${f}:${i + 1} [${p.id}] ${line.trim().slice(0, 140)}`); });
  assert.deepEqual(hits, [], `${hits.length} lines:\n` + show(hits, 60));
  for (const f of L.salesDocs().filter(f => /ONE-PAGER-/.test(f))) {
    const s = L.read(f);
    assert.ok(!/^## (ความแม่นยำและที่มา|Accuracy and source|准确率与来源)/m.test(s), `${f}: the accuracy-and-source section must be gone`);
    assert.ok(/เอกสารเทคนิคขอได้จากฝ่ายขาย|technical sheet is available from sales|技术资料可向销售索取/.test(s), `${f}: must say the technical sheet is available from sales`);
    if (!/-ZH\.md$/.test(f)) assert.ok(s.includes(S.onePager.heading), `${f}: needs the section "${S.onePager.heading}"`);
  }
  for (const f of L.salesDocs().filter(f => /DEMO-SCRIPT-/.test(f))) assert.ok(L.read(f).includes(S.demoScript), `${f}: needs "${S.demoScript}"`);
  // re-lock 2 (reviewer finding 6): no bare percentage in a one-pager, except price / VAT / refund terms
  const P = S.onePagerBarePct, pct = new RegExp(P.re), ex = new RegExp(P.except, "i"), bare = [];
  for (const f of L.salesDocs().filter(f => /ONE-PAGER-/.test(f))) L.read(f).split("\n").forEach((line, i) => {
    if (pct.test(line) && !ex.test(line)) bare.push(`${f}:${i + 1} ${line.trim().slice(0, 120)}`); });
  assert.deepEqual(bare, [], "bare percentages in one-pagers:\n" + show(bare));
});

test("R2 removed blocks: keys, section ids, classes and links to the accuracy sections are gone", () => {
  const bad = [];
  const pats = S.removedKeyPatterns.map(p => new RegExp(p.re));
  for (const f of L.customerFiles().filter(f => f.endsWith(".html") && f !== "terms.html")) {
    const src = L.read(f), keys = L.keysOf(src);
    for (const k of keys) if (S.removedKeys.includes(k) || pats.some(re => re.test(k))) bad.push(`${f}: key ${k}`);
    for (const c of S.removedClasses) if (new RegExp(`class="([^"]* )?${c}( [^"]*)?"`).test(src)) bad.push(`${f}: class ${c}`);
  }
  for (const l of LANGS) for (const k of Object.keys(D[l])) if (S.removedKeys.includes(k) || pats.some(re => re.test(k))) bad.push(`${l} dictionary: ${k} (${D[l][k].map(x => x.file).join(", ")})`);
  for (const r of S.removedIds) if (new RegExp(`id="${r.id}"`).test(L.read(r.file))) bad.push(`${r.file}: #${r.id}`);
  for (const a of L.accuracyLinks()) bad.push(`${a.file}: link ${a.href}`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R3 two lines per product (223-7) on every product page, in TH / EN / ZH", () => {
  const bad = [];
  for (const p of S.lines) for (const n of ["1", "2"]) {
    if (!p[n]) continue;
    const key = `ln.${p.id}.${n}`;
    for (const l of LANGS) if (L.dval(D, l, key) !== p[n][l]) bad.push(`${l} ${key}: ${JSON.stringify(L.dval(D, l, key))} ≠ ${JSON.stringify(p[n][l])}`);
    for (const page of p.pages) {
      const src = L.read(page);
      const el = L.elementTexts(src).find(e => e.key === key);
      if (!el) bad.push(`${page}: no element data-i18n="${key}"`);
      else if (el.text !== p[n].th) bad.push(`${page} ${key}: ${JSON.stringify(el.text)} ≠ ${JSON.stringify(p[n].th)}`);
    }
    for (const d of p.docs || []) if (!L.squash(L.read(d)).includes(p[n].th)) bad.push(`${d}: line ${n} (TH) missing`);
  }
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R3 category cards show the approved lines; a product switched off is not on any category page (226)", () => {
  const bad = [];
  const cards = allCards(), off = new Set(S.visibility.off);
  for (const p of S.lines) for (const page of p.cards) {
    const mine = cards.filter(c => c.page === page);
    if (off.has(page)) { if (mine.length) bad.push(`card ${page}: switched off, must not be listed (${mine.map(c => c.file).join(", ")})`); continue; }
    if (!mine.length) { bad.push(`card ${page}: not on any category page`); continue; }
    for (const c of mine) for (const n of ["1", "2"]) {
      if (p[n] && !L.elementTexts(c.html).some(e => e.key === `ln.${p.id}.${n}` && e.text === p[n].th)) bad.push(`${c.file} card ${page}: line ${n} missing`);
    }
  }
  for (const c of cards) if (off.has(c.page)) bad.push(`${c.file}: card ${c.page} is switched off and must not be listed`);
  for (const f of cats) if (/data-demo-only/.test(L.read(f))) bad.push(`${f}: data-demo-only (replaced by the visibility list, 226)`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R4 result line after every result (common.recheck) and in the Crowd report", () => {
  const R = S.recheck, bad = [];
  for (const l of LANGS) if (L.dval(D, l, R.key) !== R[l]) bad.push(`${l} ${R.key}: ${JSON.stringify(L.dval(D, l, R.key))}`);
  for (const page of R.pages) {
    const el = L.elementTexts(L.read(page)).filter(e => e.key === R.key);
    if (!el.length) bad.push(`${page}: no element data-i18n="${R.key}"`);
    else if (el.some(e => e.text !== R.th)) bad.push(`${page}: ${R.key} text ≠ ${R.th}`);
  }
  if (!L.jsStrings(L.read("crowd.js")).includes(R.crowdReport.th)) bad.push(`crowd.js: report note (${R.crowdReport.key}) must be "${R.crowdReport.th}"`);
  for (const l of LANGS) if (!String(L.dval(D, l, R.crowdReport.key) || "").includes(R[l])) bad.push(`${l} ${R.crowdReport.key}: must include "${R[l]}"`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R5 (226) no status label or status filter anywhere a customer looks; counts are tool counts only", () => {
  const B = S.badges, bad = [];
  for (const f of cats) {
    const h = L.read(f);
    if (/class="cat-st\b/.test(h)) bad.push(`${f}: status chip (.cat-st)`);
    if (/data-i18n="cat\.(b|st)\./.test(h)) bad.push(`${f}: status key cat.b.* / cat.st.*`);
    if (/<article[^>]*data-status=/.test(h)) bad.push(`${f}: data-status on a card`);
  }
  const sol = L.read("solutions.html");
  if (/class="sl-tag\b/.test(sol)) bad.push("solutions.html: status tag (.sl-tag)");
  if (/class="sl-filter\b|data-f="/.test(sol)) bad.push("solutions.html: status filter");
  for (const p of B.pageBadges) {
    if (L.keysOf(L.read(p.page)).includes(p.key)) bad.push(`${p.page}: status badge ${p.key}`);
    for (const l of LANGS) if (L.dval(D, l, p.key) !== undefined) bad.push(`${l} dictionary: status badge ${p.key}`);
  }
  // the tool counts on the category pages and the home-page chooser: the number of tools only
  for (const f of cats.concat(["index.html"])) for (const e of L.elementTexts(L.read(f)).filter(e => /^cat\.[a-z]+\.count$/.test(e.key))) {
    if (!/^\d+ เครื่องมือ$/.test(e.text)) bad.push(`${f} ${e.key}: "${e.text}"`);
    if (!/^\d+ tools$/.test(L.dval(D, "en", e.key) || "")) bad.push(`${f} ${e.key} en: ${L.dval(D, "en", e.key)}`);
    if (!/^\d+ 个工具$/.test(L.dval(D, "zh", e.key) || "")) bad.push(`${f} ${e.key} zh: ${L.dval(D, "zh", e.key)}`);
  }
  // label words, in every customer text and buyer document
  const pats = S.labelBanned.map(b => new RegExp(b.re, b.flags || ""));
  for (const f of L.customerFiles().filter(f => f !== "terms.html")) for (const t of L.textsOf(f)) for (const re of pats) {
    if (re.test(t) && !S.labelAllow.some(a => a.file === f && t.includes(a.contains))) bad.push(`${f}: label "${t.match(re)[0]}" in ${L.squash(t).slice(0, 100)}`);
  }
  for (const f of L.salesDocs()) L.read(f).split("\n").forEach((line, i) => { for (const re of pats) if (re.test(line)) bad.push(`${f}:${i + 1} label "${line.match(re)[0]}"`); });
  // re-lock 5: every buyer-facing document folder (docs/sales/** and the pilot documents handed to a buyer), with the label
  // words plus "experimental" / "trial version" in any case; exclusions only as listed in the spec, each with its reason
  const B5 = S.buyerDocs, docPats = pats.concat(B5.extraBanned.map(b => new RegExp(b.re, b.flags || "")));
  const docs = globDocs(B5.include).filter(f => !B5.exclude.some(x => globRe(x.path.endsWith("/") ? x.path + "**" : x.path).test(f)));
  if (docs.length < 30) bad.push("buyer documents found: " + docs.length);
  for (const f of docs) L.read(f).split("\n").forEach((line, i) => { for (const re of docPats) if (re.test(line)) bad.push(`${f}:${i + 1} label "${line.match(re)[0]}"`); });
  // re-lock 5: the outfit simulation is named with the approved word only (แบบร่าง / Draft / 草稿) in TH / EN / ZH
  const DK = S.draftKeys, ban = new RegExp(DK.banned);
  for (const k of DK.keys) {
    const src = L.read(k.page), th = k.page.endsWith(".html")
      ? (L.elementTexts(src).find(e => e.key === k.key) || {}).text
      : (new RegExp(`tr\\("${k.key.replace(/\./g, "\\.")}", "((?:[^"\\\\]|\\\\.)*)"`).exec(src) || [])[1];
    const vals = { th, en: L.dval(D, "en", k.key), zh: L.dval(D, "zh", k.key) };
    for (const [l, v] of Object.entries(vals)) {
      if (!v) { bad.push(`${k.key} ${l}: missing`); continue; }
      if (!new RegExp(DK[l]).test(v)) bad.push(`${k.key} ${l}: does not say "${DK[l]}": ${v.slice(0, 80)}`);
      if (ban.test(v)) bad.push(`${k.key} ${l}: status word "${v.match(ban)[0]}"`);
    }
  }
  assert.deepEqual(bad, [], `${bad.length} status labels:\n` + show(bad, 60));
});

/** minimal glob: ** = any path, * = any name part */
function globRe(g) { return new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$"); }
function globDocs(globs) {
  const all = [], walk = d => { for (const e of readdirSync(join(L.ROOT, d), { withFileTypes: true })) { const r = d + "/" + e.name; if (e.isDirectory()) walk(r); else all.push(r); } };
  walk("docs");
  return all.filter(f => globs.some(g => globRe(g).test(f))).sort();
}

test("R10 (226, re-lock 5) customer-handed documents list no switched-off product; the kept safety sentences stay", () => {
  const B5 = S.buyerDocs, bad = [], { list, src } = visibility(), off = Object.keys(list).filter(k => list[k] === false && existsSync(join(L.ROOT, k + ".html")));
  const names = [];
  for (const p of off) {
    const m = src.match(new RegExp(`href: "${p}\\.html", title: "([^"]+)"`));
    if (!m) { bad.push(`nav.js: no menu title for ${p}`); continue; }
    names.push({ p, t: m[1] }, { p, t: L.dval(D, "en", `nav.${p}.title`) }, { p, t: L.dval(D, "zh", `nav.${p}.title`) });
  }
  const docs = globDocs(B5.customerHanded);
  assert.ok(docs.length >= 25, "customer-handed documents: " + docs.length);
  for (const f of docs) L.read(f).split("\n").forEach((line, i) => {
    let rest = line;
    for (const k of B5.safetyKept) if (k.file === f) rest = rest.split(k.contains).join(" ");
    for (const p of off) if (rest.includes(p + ".html")) bad.push(`${f}:${i + 1} links ${p}.html`);
    for (const n of names) if (n.t && rest.includes(n.t)) bad.push(`${f}:${i + 1} names the switched-off ${n.p} ("${n.t}")`);
    if (/ระบบนี้ยังไม่เปิดให้บริการ|This service is not available yet|此服务尚未开放/.test(rest)) bad.push(`${f}:${i + 1} lists a product as not available (remove the row)`);
  });
  for (const k of B5.safetyKept) if (!L.read(k.file).includes(k.contains)) bad.push(`${k.file}: safety sentence "${k.contains}" removed`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R11 (re-lock 6) leftovers of the independent review: help FAQ h-hr, exam dashboard intro, insights data of off pages, PDPA note", () => {
  const F = S.followup223, N = S.offNames, bad = [];
  // spec.offNames: every pattern compiles, names its product, and bites (the plain name fails; the generic negation passes)
  const off = S.visibility.off, re = {};
  assert.deepEqual(Object.keys(N.names).sort(), [...off].sort(), "offNames covers exactly the switched-off products");
  for (const [p, list] of Object.entries(N.names)) re[p] = list.map(x => new RegExp(x.re, x.flags || ""));
  const named = t => Object.entries(re).filter(([, rs]) => rs.some(r => r.test(t))).map(([p]) => p);
  assert.deepEqual(named("ผลจากป้ายโฆษณาดิจิทัลและจดจำลูกค้า"), ["signage", "customers"], "bite: Thai names");
  assert.deepEqual(named("วิเคราะห์อารมณ์: สัดส่วนอารมณ์บวกต่อสื่อ"), ["neuro"], "bite: neuro heading");
  assert.deepEqual(named("ระบบไม่วิเคราะห์อารมณ์ และไม่มีการวิเคราะห์อารมณ์ · 不做情绪分析"), [], "generic negations are not the product name");
  assert.deepEqual(named("Digital Signage: look rate per ad"), ["signage"], "bite: English");
  for (const p of N.textExcludePages) assert.ok(existsSync(join(L.ROOT, p)), "excluded page exists: " + p);
  // help.html: the interview-kit FAQ is shown in TH / EN / ZH, only the team-face line is hidden
  const help = L.read("help.html");
  for (const h of F.help) {
    const i = help.indexOf(`<details id="${h.id}"`), j = help.indexOf("</details>", i);
    if (i < 0 || j < 0) { bad.push(`help.html: #${h.id} missing`); continue; }
    const block = help.slice(i, j), open = block.slice(0, block.indexOf(">") + 1);
    if (/data-lq-off|hidden/.test(open)) bad.push(`help.html #${h.id}: the entry is hidden (${open})`);
    const sum = (block.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1];
    if (sum !== h.summary) bad.push(`help.html #${h.id}: summary "${sum}" (want "${h.summary}")`);
    const lis = [...block.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)].map(m => ({ attr: m[1], t: m[2] }));
    for (const k of h.keep) { const li = lis.find(x => x.t.includes(k)); if (!li) bad.push(`help.html #${h.id}: kept line "${k}" missing`); else if (/data-lq-off|hidden/.test(li.attr)) bad.push(`help.html #${h.id}: kept line "${k}" hidden`); }
    const tf = lis.filter(x => x.t.includes(h.hide));
    if (tf.length !== 1 || !/\bdata-lq-off\b/.test(tf[0].attr)) bad.push(`help.html #${h.id}: the team-face line must be exactly one <li data-lq-off> (${tf.length})`);
    const shown = block.replace(/<li[^>]*data-lq-off[^>]*>[\s\S]*?<\/li>/g, " ");
    for (const p of named(L.htmlFlat(shown))) bad.push(`help.html #${h.id}: shown text names the switched-off ${p}`);
  }
  // exam dashboard intro: no hall camera in TH / EN / ZH
  const db = L.read("exam-dashboard.html"), lead = (db.match(/data-i18n="exam\.db\.lead">([^<]*)</) || [])[1];
  if (lead !== F.examDbLead.th) bad.push(`exam-dashboard.html lead: "${lead}"`);
  for (const l of LANGS) if (L.dval(D, l, "exam.db.lead") !== F.examDbLead[l]) bad.push(`${l} exam.db.lead: "${L.dval(D, l, "exam.db.lead")}"`);
  for (const t of [lead, L.dval(D, "en", "exam.db.lead"), L.dval(D, "zh", "exam.db.lead")]) for (const p of named(String(t))) bad.push(`exam.db.lead names the switched-off ${p}: ${t}`);
  // insights: iqCollect drops the data of a switched-off page when nav.js hides switched-off parts; all kept in Node / preview
  const IQ = require(join(L.ROOT, "insights-data.js")), now = Date.now(), iso = new Date(now).toISOString();
  const snap = {
    "booth-state": JSON.stringify({ visitors: [{ first: now, dwell: 6, frames: 10, att: 6 }] }),
    "nm-sessions": JSON.stringify([{ date: iso, test: "A", samples: [{ face: true, v: 0.5, att: true }] }]),
    "cx-members": JSON.stringify([{ id: "m1", created: now }]), "cx-orders": JSON.stringify([{ time: now, mid: "m1", qty: 1, price: 50 }]),
    "sg-stats": JSON.stringify({ v: 1, since: now, totals: { ots: 10, viewers: 2 }, ads: { a: { title: "A", viewers: 2, ots: 10, plays: 1 } } }),
    "co-sales": JSON.stringify([{ t: now, total: 100, qty: 1 }])
  };
  const ids = ["booth", "co", ...Object.keys(F.insightsDrop)];
  const keys = D0 => ids.filter(k => D0[k] != null).sort();
  assert.deepEqual(keys(IQ.iqCollect(snap)), [...ids].sort(), "Node (no window): every module kept");
  const g = /** @type {any} */ (globalThis), vis = JSON.parse(JSON.stringify(visibility().list));
  const cls = new Set(["lq-part-off"]);
  g.window = { LQ_VISIBILITY: vis }; g.document = { documentElement: { classList: { contains: c => cls.has(c) } } };
  try {
    for (const [id, page] of Object.entries(F.insightsDrop)) if (vis[page] !== false) bad.push(`insightsDrop: ${page} is not switched off in nav.js`);
    const got = keys(IQ.iqCollect(snap));
    if (JSON.stringify(got) !== JSON.stringify(["booth", "co"])) bad.push(`insights iqCollect with the customer visibility keeps ${got.join(", ")} (want booth, co)`);
    cls.clear(); // e2e preview (cdp.mjs removes lq-part-off): the product as if switched on
    if (keys(IQ.iqCollect(snap)).length !== ids.length) bad.push("insights iqCollect in the preview drops a module");
  } finally { delete g.window; delete g.document; }
  // PDPA note: the split camera-notice sentence is recorded in the decision 226 section
  const pd = L.read(F.pdpa.file), at = pd.indexOf(F.pdpa.section), sec = at < 0 ? "" : pd.slice(at, pd.indexOf("\n## ", at + 5));
  for (const m of F.pdpa.must) if (!L.squash(sec).includes(L.squash(m))) bad.push(`${F.pdpa.file} (${F.pdpa.section}): "${m}"`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R5 menu and chooser text: no 'status and measured accuracy' (nav.js, index, solutions)", () => {
  const want = {
    "cat.all.sub": { th: "เจ็ดหมวดงาน เลือกหมวดเพื่อดูเครื่องมือทั้งหมด", en: "Seven work categories. Pick one to see all its tools.", zh: "七个业务类别，选择类别查看全部工具。" },
    "sl.cats.sub": { th: "เจ็ดหมวดงาน เลือกหมวดเพื่อดูเครื่องมือทั้งหมด", en: "Seven work categories. Pick one to see all its tools.", zh: "七个业务类别，选择类别查看全部工具。" },
    "nav.viewcat": { th: "ดูหน้าหมวดนี้" }
  };
  const bad = [];
  for (const [k, v] of Object.entries(want)) for (const l of LANGS) if (v[l] && L.dval(D, l, k) !== v[l]) bad.push(`${k} ${l}: ${JSON.stringify(L.dval(D, l, k))}`);
  if (!L.elementTexts(L.read("index.html")).some(e => e.key === "cat.all.sub" && e.text === want["cat.all.sub"].th)) bad.push("index.html cat.all.sub (TH)");
  if (!L.elementTexts(L.read("solutions.html")).some(e => e.key === "sl.cats.sub" && e.text === want["sl.cats.sub"].th)) bad.push("solutions.html sl.cats.sub (TH)");
  const nav = L.jsStrings(L.read("nav.js"));
  if (!nav.includes("ดูหน้าหมวดนี้")) bad.push("nav.js: nav.viewcat Thai");
  if (nav.filter(s => s === "เครื่องมือทั้งหมดในหมวดนี้").length < 6) bad.push("nav.js: the 6 business category menu lines must read เครื่องมือทั้งหมดในหมวดนี้");
  for (const slug of ["security", "education", "hr", "marketing", "health", "studio"]) {
    const k = `nav.cat-${slug}.desc`;
    if (L.dval(D, "en", k) !== "All tools in this category") bad.push(`${k} en: ${L.dval(D, "en", k)}`);
    if (L.dval(D, "zh", k) !== "本类别的全部工具") bad.push(`${k} zh: ${L.dval(D, "zh", k)}`);
  }
  assert.deepEqual(bad, [], show(bad));
});

test("R6 plain-word limits that matter to a buyer or to safety are still stated", () => {
  const bad = [];
  for (const m of S.mustSay) { const t = flat(m.page); for (const s of m.th) if (!t.includes(s)) bad.push(`${m.page}: "${s}"`); }
  for (const m of S.mustSayKeys) for (const l of LANGS) if (!String(L.dval(D, l, m.key) || "").includes(m[l])) bad.push(`${m.key} ${l}: must include "${m[l]}"`);
  // examinee page: "near the camera" only, never the desk
  const X = S.examineeMustNot, src = L.read(X.page);
  for (const s of X.th) if (flat(X.page).includes(s)) bad.push(`${X.page}: must not say "${s}"`);
  for (const k of L.keysOf(src)) for (const l of LANGS) for (const s of X[l]) if (String(L.dval(D, l, k) || "").includes(s)) bad.push(`${X.page} ${k} ${l}: must not say "${s}"`);
  // 223-5: research-licence labels stay wherever that option is still on
  for (const k of S.licenceKeys) if (!L.keysOf(L.read(k.page)).includes(k.key)) bad.push(`${k.page}: licence label ${k.key} must stay`);
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R6 223-4: the customer's own on-site test keeps its figures, folded under one plain summary, renamed ทดสอบหน้างาน", () => {
  const F = S.fold, bad = [];
  for (const f of F.files) if (!L.read(f).includes(F.th)) bad.push(`${f}: no "${F.th}" summary`);
  const vals = l => Object.values(D[l]).flat().map(x => x.v).join("\n") + L.customerFiles().filter(f => f.startsWith(`i18n/${l}-rt-`)).map(f => L.jsStrings(L.read(f)).join("\n")).join("\n");
  if (!vals("en").includes(F.en)) bad.push(`English "${F.en}" missing`);
  if (!vals("zh").includes(F.zh)) bad.push(`Chinese "${F.zh}" missing`);
  const all = L.customerFiles().map(f => L.textsOf(f).join("\n")).join("\n");
  for (const l of ["th", "en", "zh"]) if (!all.includes(F.rename[l])) bad.push(`rename "${F.rename[l]}" missing`);
  assert.deepEqual(bad, [], show(bad));
});

test("R6 223-6: the legal draft banner stays; terms clause 11 unchanged on the site; the rewrite is a draft in docs for the lawyer", () => {
  const G = S.legal, bad = [];
  for (const p of G.bannerPages) if (!flat(p).includes(G.banner)) bad.push(`${p}: banner "${G.banner}"`);
  for (const s of G.termsKeeps) if (!flat("terms.html").includes(s)) bad.push(`terms.html must still say "${s}" (changes only after the lawyer)`);
  if (!existsSync(join(L.ROOT, G.draftDoc))) bad.push(`${G.draftDoc} missing`);
  else for (const s of G.draftMust) if (!L.read(G.draftDoc).includes(s)) bad.push(`${G.draftDoc}: "${s}"`);
  if (existsSync(join(L.ROOT, G.draftDoc))) for (const s of G.draftMustNot || []) if (L.read(G.draftDoc).includes(s)) bad.push(`${G.draftDoc}: still says "${s}"`);
  assert.deepEqual(bad, [], show(bad));
});

/** every text of the snapshot, by language */
function snapTexts() {
  const th = [], other = [];
  for (const e of SNAP.entries) {
    if (e.th) th.push(e);
    if (e.en) other.push({ ...e, v: e.en, l: "en" });
    if (e.zh) other.push({ ...e, v: e.zh, l: "zh" });
    if (e.text) th.push({ ...e, th: e.text, any: true });
  }
  for (const e of SNAP.catData) { if (e.th) th.push(e); if (e.en) other.push({ ...e, v: e.en, l: "en" }); if (e.zh) other.push({ ...e, v: e.zh, l: "zh" }); }
  return { th, other };
}

test("R7 technical sheets: 18 products × TH / EN, each with its two lines; every original figure, legend and reason verbatim", () => {
  const T = S.techSheets, bad = [];
  const sheet = (p, l) => join(T.dir, `${p}-${l}.md`);
  for (const p of T.products) for (const l of ["TH", "EN"]) if (!existsSync(join(L.ROOT, sheet(p, l)))) bad.push(`${sheet(p, l)} missing`);
  assert.deepEqual(bad, [], show(bad));
  for (const [p, id] of Object.entries(T.linesOf)) {
    const ln = S.lines.find(x => x.id === id), th = L.squash(L.read(sheet(p, "TH"))), en = L.squash(L.read(sheet(p, "EN")));
    for (const n of ["1", "2"]) if (ln[n]) { if (!th.includes(ln[n].th)) bad.push(`${sheet(p, "TH")}: line ${n}`); if (!en.includes(ln[n].en)) bad.push(`${sheet(p, "EN")}: line ${n}`); }
  }
  const md = readdirSync(join(L.ROOT, T.dir)).filter(f => f.endsWith(".md"));
  const TH = md.filter(f => /-TH\.md$|^README\.md$/.test(f)).map(f => L.squash(L.read(join(T.dir, f)))).join("\n");
  const EN = md.filter(f => /-EN\.md$|^README\.md$/.test(f)).map(f => L.squash(L.read(join(T.dir, f)))).join("\n");
  const { th, other } = snapTexts();
  for (const e of th) if (!(e.any ? (TH + EN) : TH).includes(L.squash(e.th))) bad.push(`TH sheets: ${e.file} ${e.key || ""} ${L.squash(e.th).slice(0, 100)}`);
  for (const e of other) if (!EN.includes(L.squash(e.v))) bad.push(`EN sheets (${e.l}): ${e.file || ""} ${e.key} ${L.squash(e.v).slice(0, 100)}`);
  for (const [k, f] of Object.entries(SNAP.accuracyFigures)) if (!EN.includes(`${k}`) || !EN.includes(L.squash(f.what))) bad.push(`EN sheets: figure ${k} (${f.what})`);
  assert.deepEqual(bad, [], `${bad.length} originals not in docs/tech-sheets/:\n` + show(bad, 40));
  // docs/accuracy-figures.json keeps every figure unchanged (value, raw, evidence, description)
  const now = JSON.parse(L.read("docs/accuracy-figures.json")).figures;
  for (const [k, f] of Object.entries(SNAP.accuracyFigures)) assert.deepEqual(now[k], f, `docs/accuracy-figures.json: figure ${k} changed or lost`);
});

test("R7 admin 'ผลการวัด' tab (owner-only back office) holds every original figure, legend and reason verbatim", () => {
  const A = S.techSheets.admin, html = L.read(A.page), bad = [];
  if (!new RegExp(`role="tab" data-tab="${A.tab}"[^>]*>(<[^>]+>)*${A.tabText}`).test(html)) bad.push(`${A.page}: tab button data-tab="${A.tab}" "${A.tabText}"`);
  if (!new RegExp(`data-panel="${A.tab}"`).test(html)) bad.push(`${A.page}: panel ${A.tab}`);
  if (!new RegExp(`<script src="${A.data.replace(".", "\\.")}(\\?v=\\d+)?"`).test(html)) bad.push(`${A.page}: does not load ${A.data}`);
  if (!/id="adApp" hidden/.test(html) || html.indexOf(`data-panel="${A.tab}"`) < html.indexOf('id="adApp"')) bad.push(`${A.page}: the tab must sit inside the signed-in back office (#adApp)`);
  assert.deepEqual(bad, [], show(bad));
  assert.ok(existsSync(join(L.ROOT, A.data)), `${A.data} missing`);
  const strings = new Set(L.jsStrings(L.read(A.data)).map(L.squash));
  const { th, other } = snapTexts();
  const miss = th.map(e => e.th).concat(other.map(e => e.v)).filter(v => !strings.has(L.squash(v)));
  assert.deepEqual(miss, [], `${miss.length} originals missing from ${A.data}:\n` + show(miss, 30));
});

test("R8 rules inverted as approved (223-1): CLAUDE.md and docs/acceptance/README.md rule 7", () => {
  const c = L.squash(L.read("CLAUDE.md")), bad = [];
  for (const s of S.rules.claudeMd) if (!c.includes(s)) bad.push(`CLAUDE.md: "${s.slice(0, 80)}…"`);
  for (const s of S.rules.claudeMdGone) if (c.includes(s)) bad.push(`CLAUDE.md still says "${s}"`);
  if (!L.squash(L.read("docs/acceptance/README.md")).includes(S.rules.readme7)) bad.push(`docs/acceptance/README.md rule 7: "${S.rules.readme7}"`);
  assert.deepEqual(bad, [], show(bad));
});

test("R7 re-lock 2: every supplement original (texts the snapshot missed) is verbatim in the sheets and the admin data", () => {
  const SU = S.supplement, sup = JSON.parse(L.read(SU.file)), E = sup.entries, bad = [];
  assert.equal(sup.base, "ecb783b6", "supplement read from the base commit");
  for (const m of SU.must) {
    const hit = E.filter(e => (m.key ? e.key === m.key : m.keyRe ? new RegExp(m.keyRe).test(e.key || "") : true) &&
      (!m.textRe || new RegExp(m.textRe, "i").test(e.text || "")) && (!m.text || e.text) &&
      (m.langs || []).every(l => e[l]) && (m.textHas || []).every(t => (e.text || "").includes(t)));
    if (hit.length < (m.min || 1)) bad.push(`supplement must hold ${JSON.stringify(m)} (found ${hit.length})`);
  }
  const T = S.techSheets, md = readdirSync(join(L.ROOT, T.dir)).filter(f => f.endsWith(".md"));
  const TH = md.filter(f => /-TH\.md$|^README\.md$/.test(f)).map(f => L.squash(L.read(join(T.dir, f)))).join("\n");
  const EN = md.filter(f => /-EN\.md$|^README\.md$/.test(f)).map(f => L.squash(L.read(join(T.dir, f)))).join("\n");
  const admin = new Set(L.jsStrings(L.read(T.admin.data)).map(L.squash));
  for (const e of E) {
    const id = `${e.file} ${e.key || ""}`;
    if (e.th && !TH.includes(L.squash(e.th))) bad.push(`TH sheets: ${id}`);
    for (const l of ["en", "zh"]) if (e[l] && !EN.includes(L.squash(e[l]))) bad.push(`EN sheets (${l}): ${id}`);
    if (e.text && !(TH + EN).includes(L.squash(e.text))) bad.push(`sheets: ${id} ${L.squash(e.text).slice(0, 80)}`);
    for (const l of ["th", "en", "zh", "text"]) if (e[l] && !admin.has(L.squash(e[l]))) bad.push(`admin data (${l}): ${id}`);
  }
  assert.deepEqual(bad, [], `${bad.length} problems:\n` + show(bad, 40));
});

/** the visibility list in nav.js: { page: true | false } */
function visibility() {
  const src = L.read("nav.js"), m = src.match(/var VISIBILITY = (\{[\s\S]*?\});/);
  assert.ok(m, "nav.js: var VISIBILITY = { … };");
  return { list: JSON.parse(m[1].replace(/([{,]\s*)([a-z][\w-]*)\s*:/g, '$1"$2":').replace(/,\s*\}/, "}")), src };
}

test("R9 (226) one visibility list (page -> on / off) = today's real state; nothing links to an off product; it switches on no option", () => {
  const V = S.visibility, { list, src } = visibility(), bad = [];
  const DD = require(join(L.ROOT, "tools", "cat-data.cjs"));
  const catPages = [...new Set(DD.CATEGORIES.flatMap(c => c.pages))].sort();
  // re-lock 4: plus the parts of a page (Product Check = the tab of medicine.html), each named in the spec with its page
  const parts = V.parts || {};
  assert.deepEqual(Object.keys(list).sort(), [...catPages, ...Object.keys(parts)].sort(), "the list names every category page and every listed part, nothing else");
  for (const [part, P] of Object.entries(parts)) {
    if (!catPages.includes(P.page)) bad.push(`part ${part}: its page ${P.page} is not a category page`);
    if (list[P.page] !== true) bad.push(`part ${part}: its page ${P.page} must stay on (only the part is switched off)`);
    const h = L.read(P.page + ".html");
    for (const id of P.ids) if (!new RegExp(`<[a-z]+\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\bdata-lq-part="${part}")[^>]*>`).test(h)) bad.push(`${P.page}.html #${id}: data-lq-part="${part}" missing`);
    for (const id of P.keep) if (!h.includes(`id="${id}"`) || new RegExp(`<[a-z]+\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\bdata-lq-(part|off)\\b)[^>]*>`).test(h)) bad.push(`${P.page}.html #${id}: must stay shown`);
    if (!(src.includes("PARTS") && src.includes('data-lq-part="') && src.includes(`"${part}": "${P.page}"`))) bad.push(`nav.js: part ${part} -> ${P.page} hidden by data-lq-part`);
  }
  const offPages = V.off.filter(o => !parts[o]);
  for (const [k, v] of Object.entries(list)) if (typeof v !== "boolean") bad.push(`${k}: ${JSON.stringify(v)} is not true / false`);
  assert.deepEqual(Object.keys(list).filter(k => list[k] === false).sort(), [...V.off].sort(), "off = exactly today's not-offered products");
  // the list only decides listing and the off-page notice: the block that reads it touches no LENSIQ_* option, storage or URL
  assert.ok(src.includes("// visibility:end"), "nav.js marks the end of the visibility block");
  const fn = src.slice(src.indexOf("var VISIBILITY ="), src.indexOf("// visibility:end"));
  if (/LENSIQ_|localStorage|sessionStorage|location\.(search|hash)/.test(fn)) bad.push("the visibility block reads a LENSIQ_* option, storage or the URL query");
  // the off-page notice: the exact approved sentence and a link to the home page
  if (!fn.includes(V.sentence)) bad.push("nav.js visibility block: the exact off-page sentence");
  if (!fn.includes(V.home)) bad.push("nav.js visibility block: the off-page link to " + V.home);
  // nothing a customer sees links to an off page, except inside an element hidden by the list (data-lq-off)
  for (const f of L.customerFiles().filter(f => f.endsWith(".html") && list[f.replace(/\.html$/, "")] !== false)) {
    const h = L.read(f).replace(/<!--[\s\S]*?-->/g, "");
    for (const off of offPages) for (const m of h.matchAll(new RegExp(`href="${off}\\.html[^"]*"`, "g"))) {
      const before = h.slice(0, m.index);
      const opens = [...before.matchAll(/<(\w+)\b[^>]*\bdata-lq-off\b[^>]*>/g)];
      const inside = opens.some(o => { const tag = o[1], seg = h.slice(o.index, m.index);
        return (seg.match(new RegExp(`<${tag}\\b`, "g")) || []).length > (seg.match(new RegExp(`</${tag}>`, "g")) || []).length; });
      if (!inside) bad.push(`${f}: link to switched-off ${off}.html outside a data-lq-off element`);
    }
  }
  if (!/\[data-lq-off\][^{]*\{[^}]*display:\s*none/.test(src)) bad.push("nav.js: [data-lq-off] must be hidden");
  // re-lock 5: a customer script that writes a link to a switched-off page consults window.LQ_VISIBILITY (rendered content);
  // data-only files are listed in the spec with the reason; the browser half (every page, rendered links) is visibility-223 V1
  if (!/LQ_VISIBILITY\s*=/.test(fn)) bad.push("nav.js: window.LQ_VISIBILITY is not exported");
  // (the pages switched off today: a script that links one of them must filter through the list)
  const pages = Object.keys(list).filter(k => list[k] === false && existsSync(join(L.ROOT, k + ".html")));
  for (const f of L.customerFiles().filter(f => f.endsWith(".js") && !f.startsWith("i18n/"))) {
    if (S.renderedLinks.allowData.some(a => a.file === f)) continue;
    const js = L.read(f), own = f.replace(/\.js$/, "");
    const hits = pages.filter(p => p !== own && new RegExp(`href:\\s*"${p}\\.html|href="${p}\\.html|"${p}\\.html"\\]`).test(js));
    if (hits.length && !/LQ_VISIBILITY/.test(js)) bad.push(`${f}: writes links to ${hits.slice(0, 4).join(", ")} without window.LQ_VISIBILITY`);
  }
  assert.deepEqual(bad, [], show(bad, 60));
});

test("R12 (re-lock 7) every demo / sample button is in the V6 sweep; offNames bites both ways; the exam dashboard demo follows the visibility list", () => {
  const FB = S.followup223b, N = S.offNames, { list } = visibility(), bad = [];
  // offNames: every pattern compiles; the old names and the negation-robust emotion patterns bite both ways
  const re = {};
  for (const [p, l] of Object.entries(N.names)) re[p] = l.map(x => new RegExp(x.re, x.flags || ""));
  const named = s => Object.entries(re).filter(([, rs]) => rs.some(r => r.test(s))).map(([p]) => p);
  for (const [s, want] of FB.bites.named) if (JSON.stringify(named(s)) !== JSON.stringify(want)) bad.push(`bite: "${s}" -> ${named(s).join(", ") || "nothing"} (want ${want.join(", ")})`);
  for (const s of FB.bites.clean) if (named(s).length) bad.push(`clean: "${s}" is read as the name of ${named(s).join(", ")}`);
  for (const [p, l] of Object.entries({ neuro: ["ทดสอบอารมณ์", "情绪测试", "emotion analysis", "emotion tests?"], customers: ["Member recognition", "会员识别", "จดจำสมาชิก"],
    signage: ["数字标牌"], "exam-hall": ["ห้องสอบที่มีกล้อง", "กล้องหน้าห้อง", "Exam hall with cameras", "装有摄像头的考场", "前方摄像头（演示）"], "product-check": ["产品核对"] }))
    for (const w of l) if (!N.names[p].some(x => x.re.includes(w))) bad.push(`offNames.${p}: old name "${w}" missing`);
  // the sweep covers every demo / sample button of a switched-on page and every page with the ?demo=1 demo panel
  const offPage = f => list[f.replace(/\.html$/, "")] === false;
  const sw = FB.demoSweep, has = (page, q, sel) => sw.some(x => x.page === page && x.query === q && x.press.includes(sel));
  for (const x of sw) if (list[x.page] === false || !existsSync(join(L.ROOT, x.page + ".html"))) bad.push(`demoSweep: ${x.page} is switched off or missing`);
  for (const f of readdirSync(L.ROOT).filter(f => /^[^/]+\.html$/.test(f) && !offPage(f))) {
    const h = L.read(f).replace(/<!--[\s\S]*?-->/g, ""), page = f.replace(/\.html$/, "");
    for (const m of h.matchAll(/<button\b[^>]*\bid="([^"]*(?:demo|sample|seed)[^"]*)"/gi)) {
      if (FB.removeOnly.includes(m[1])) continue;
      if (!has(page, "", "#" + m[1])) bad.push(`${f}: demo / sample button #${m[1]} is not pressed by visibility-223 V6 (spec.followup223b.demoSweep)`);
    }
    if (/<script src="lensiq-demo\.js/.test(h) && !has(page, "demo=1", "[data-lq-demo] button")) bad.push(`${f}: the ?demo=1 demo panel buttons are not pressed by V6`);
  }
  // the exam dashboard demo button consults the visibility list (hall device and events only while exam-hall is on)
  const js = L.read("exam-dashboard.js");
  if (!/LQ_VISIBILITY/.test(js) || !/["']exam-hall["']/.test(js)) bad.push("exam-dashboard.js: the demo does not consult window.LQ_VISIBILITY for exam-hall");
  // the ?demo=1 sample data of the exam dashboard is lab-side only
  const dd = L.read("lensiq-demo-data.js"), a = dd.indexOf('page === "exam-dashboard"'), b = dd.indexOf("if (page ===", a + 10), blk = dd.slice(a, b);
  if (/\[\s*\d+,\s*"[^"]*",\s*"\w+",\s*"\w+",\s*"hall"/.test(blk)) bad.push("lensiq-demo-data.js: exam-dashboard sample data has a hall row");
  for (const sig of FB.hallSignals) if (new RegExp(`"${sig}",\\s*"\\w+",\\s*"lab"`).test(blk)) bad.push(`lensiq-demo-data.js: hall signal ${sig} dressed as a lab row`);
  assert.deepEqual(bad, [], show(bad, 60));
});

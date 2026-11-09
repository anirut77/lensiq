// tests/unit/cat-pages.test.js — round 16 item 1 (S1): the 7 work categories (tools/cat-data.cjs) against CLAUDE.md, the
// nav.js menu and the repo's pages; the generated landing pages, dictionaries, index/solutions regions and the table in
// docs/PAGE-STATUS.md are up to date (same check as `node tools/cat-pages.mjs --check`); every page has a status, a reason
// and accuracy lines with a source label; numbers agree across TH / EN / 中文 and en/zh values carry no Thai.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const D = require(join(ROOT, "tools", "cat-data.cjs"));
const THAI = /[฀-๿]/;
const pages = readdirSync(ROOT).filter(f => f.endsWith(".html")).map(f => f.replace(/\.html$/, ""));
const catPages = D.CATEGORIES.map(c => "cat-" + c.slug);
const nav = readFileSync(join(ROOT, "nav.js"), "utf8");

/** CLAUDE.md "Categories" table -> [{ n, th, en, pages }] */
function claudeCategories() {
  const md = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  return [...md.matchAll(/^\| ([1-7]) \| ([^|]+?) \/ ([^|]+?) \| ([^|]+) \|$/gm)].map(m => ({
    n: +m[1], th: m[2].trim(), en: m[3].trim(),
    pages: m[4].replace(/\(\+ ([a-z-]+)\)/g, ", $1").replace(/\([^)]*\)/g, "").split(",").map(s => s.trim()).filter(Boolean)
  }));
}

test("generated files are up to date (node tools/cat-pages.mjs --check)", async () => {
  const mod = await import(pathToFileURL(join(ROOT, "tools", "cat-pages.mjs")).href);
  const files = mod.build();
  assert.ok(Object.keys(files).length >= 12, Object.keys(files).join(","));
  assert.deepEqual(mod.stale(files), [], "run: node tools/cat-pages.mjs");
});

test("categories equal the CLAUDE.md table (names, pages, booth in 4 and 7)", () => {
  const md = claudeCategories();
  assert.equal(md.length, 7, "CLAUDE.md rows parsed: " + md.length);
  for (const row of md) {
    const c = D.CATEGORIES.find(x => x.n === row.n);
    assert.ok(c, "category " + row.n);
    assert.equal(c.name.th, row.th, `category ${row.n} Thai name`);
    assert.equal(c.name.en, row.en, `category ${row.n} English name`);
    assert.deepEqual([...c.pages].sort(), [...row.pages].sort(), `category ${row.n} pages`);
  }
  assert.ok(D.CATEGORIES.find(c => c.n === 4).pages.includes("booth") && D.CATEGORIES.find(c => c.n === 7).pages.includes("booth"));
});

test("every page in the repo has a proposed status, a reason and accuracy lines with a source label", () => {
  const existing = pages.filter(p => !catPages.includes(p));
  assert.ok(existing.length >= 64, "pages: " + existing.length);
  assert.deepEqual(existing.filter(p => !D.PAGES[p]), [], "pages without a status");
  assert.deepEqual(Object.keys(D.PAGES).filter(p => !pages.includes(p)), [], "statuses for pages that do not exist");
  for (const c of catPages) assert.ok(existsSync(join(ROOT, c + ".html")), c);
  for (const [p, v] of Object.entries(D.PAGES)) {
    assert.ok(D.STATUS[v.st], `${p}: status ${v.st}`);
    assert.ok(D.REASONS[v.why], `${p}: reason ${v.why}`);
    assert.ok(v.claims.length >= 1, `${p}: no accuracy line`);
    for (const id of v.claims) assert.ok(D.CLAIMS[id] && D.SOURCE[D.CLAIMS[id].src], `${p}: claim ${id}`);
  }
  // every category page is classified; platform pages and the deliberate exception too
  for (const c of D.CATEGORIES) for (const p of c.pages) assert.ok(D.PAGES[p], p);
  for (const p of D.PLATFORM.concat(Object.keys(D.UNLINKED))) assert.ok(D.PAGES[p], p);
  // the table names every page once
  const md = readFileSync(join(ROOT, "docs", "PAGE-STATUS.md"), "utf8");
  for (const p of existing) assert.equal((md.match(new RegExp("^\\| `" + p.replace(/-/g, "\\-") + "\\.html` \\|", "gm")) || []).length, 1, p + " in PAGE-STATUS.md");
  assert.match(md, /DRAFT — awaiting owner approval/);
});

test("accuracy lines: TH / EN / 中文 complete, same numbers, no Thai in en/zh; Crowd states the dense-crowd limit", () => {
  const nums = s => (s.match(/\d+(?:\.\d+)?/g) || []).sort().join(" ");
  for (const [id, c] of Object.entries(D.CLAIMS)) {
    for (const l of ["th", "en", "zh"]) assert.ok(c[l] && c[l].length > 5, `${id}.${l}`);
    assert.ok(THAI.test(c.th), id + ".th is Thai");
    assert.ok(!THAI.test(c.en) && !THAI.test(c.zh), id + ": Thai in en/zh");
    assert.ok(/[一-鿿]/.test(c.zh), id + ".zh is Chinese");
    assert.equal(nums(c.en), nums(c.th), `${id}: numbers TH vs EN`);
    assert.equal(nums(c.zh), nums(c.th), `${id}: numbers TH vs 中文`);
    assert.ok(c.ref, id + ": evidence reference");
  }
  for (const group of [D.REASONS, D.STATUS, D.STATUS_DEF, D.SOURCE]) for (const [k, v] of Object.entries(group)) {
    assert.ok(v.th && v.en && v.zh, k);
    assert.ok(!THAI.test(v.en) && !THAI.test(v.zh), k + ": Thai in en/zh");
  }
  assert.ok(D.PAGES.crowd.claims.includes("crowdDense"));
  assert.match(D.CLAIMS.crowdDense.th, /ยังไม่เหมาะกับฝูงชนหนาแน่น/);
  assert.match(D.CLAIMS.crowdDense.en, /not yet suitable for dense crowds/i);
  // no field figure exists yet: nothing may claim one
  assert.deepEqual(Object.entries(D.CLAIMS).filter(([, c]) => c.src === "field").map(([k]) => k), []);
});

test("nav.js menu: one group per category with exactly its pages + landing page; platform group; every link exists", () => {
  const groups = [...nav.matchAll(/\{ label: "([^"]+)", short: "([^"]+)", id: "([a-z]+)"(?:, cat: "([a-z]+)")?,\s+intro: "[^"]+", items: \[([\s\S]*?)\n {4}\] \}/g)]
    .map(m => ({ label: m[1], short: m[2], id: m[3], cat: m[4], hrefs: [...m[5].matchAll(/href: "([a-z0-9-]+)\.html"/g)].map(x => x[1]) }));
  assert.equal(groups.length, 8, "7 categories + About: " + groups.map(g => g.id));
  for (const c of D.CATEGORIES) {
    const g = groups.find(x => x.cat === c.slug);
    assert.ok(g, "menu group for " + c.slug);
    assert.equal(g.id, c.id, c.slug + " group id");
    assert.equal(g.label, c.name.th, c.slug + " label");
    assert.equal(g.short, c.short.th, c.slug + " short label");
    assert.equal(g.hrefs[0], "cat-" + c.slug, c.slug + ": landing page first");
    assert.deepEqual(g.hrefs.slice(1).sort(), [...c.pages].sort(), c.slug + " menu items");
  }
  const about = groups.find(g => g.id === "about");
  assert.deepEqual(about.hrefs.sort(), [...D.PLATFORM].sort(), "About group = platform pages");
  for (const m of nav.matchAll(/href: "([a-z0-9-]+\.html)"/g)) assert.ok(existsSync(join(ROOT, m[1])), m[1]);
  // the drawer breakpoint in nav.js matches styles.css (desktop bar from 1024 px)
  assert.match(nav, /max-width: 1023\.98px/);
  const css = readFileSync(join(ROOT, "styles.css"), "utf8");
  assert.ok(!/max-width:1099\.98px/.test(css) && /max-width:1023\.98px/.test(css), "styles.css drawer breakpoint");
});

test("landing pages: static markup lists each tool with a status tag and source-labelled accuracy, no inline script", () => {
  for (const c of D.CATEGORIES) {
    const html = readFileSync(join(ROOT, `cat-${c.slug}.html`), "utf8");
    const cards = [...html.matchAll(/<article class="pd-card cat-tool" data-page="([a-z0-9-]+)" data-status="([a-z-]+)">([\s\S]*?)<\/article>/g)];
    assert.deepEqual(cards.map(m => m[1]), c.pages, c.slug + " cards");
    for (const m of cards) {
      assert.equal(m[2], D.PAGES[m[1]].st, m[1] + " status");
      assert.match(m[3], new RegExp(`class="cat-st ${m[2]}"`), m[1] + " status tag");
      assert.ok((m[3].match(/<li data-src="(synthetic|public|prelim|field|none|na)">/g) || []).length === D.PAGES[m[1]].claims.length, m[1] + " accuracy lines");
      assert.match(m[3], new RegExp(`href="${m[1]}\\.html"`), m[1] + " link");
    }
    assert.ok(!/<script>(?!<\/script>)|<script(?![^>]*src=)/.test(html), c.slug + ": inline script");
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /<script src="i18n\/zh-cat\.js/);
  }
});

// Reviewer round (2026-11-09): every accuracy line is tied to the register of docs/ACCURACY-CLAIMS.md (`acr`) or to
// quoted fragments of its source document (`ev`), so the category pages cannot drift from the product pages.
const squash = s => String(s).replace(/\s+/g, " ").trim();
/** Markdown table row -> cells ("\|" is a literal "|"), as in tests/unit/accuracy-claims.test.js */
function mdCells(line) {
  const out = []; let cur = "";
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { out.push(cur.trim()); cur = ""; } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}
function claimsRegister() {
  const md = readFileSync(join(ROOT, "docs", "ACCURACY-CLAIMS.md"), "utf8");
  const m = md.match(/<!-- claims-register:start -->([\s\S]*?)<!-- claims-register:end -->/);
  assert.ok(m, "register markers in docs/ACCURACY-CLAIMS.md");
  const rows = m[1].split("\n").filter(l => /^\|/.test(l.trim()));
  const head = mdCells(rows[0]);
  const out = {};
  for (const l of rows.slice(2)) { const c = mdCells(l); const r = {}; head.forEach((h, i) => { r[h] = c[i]; }); out[r.id] = r; }
  return out;
}
const numbersIn = s => (String(s).replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) || []).map(Number);
/** percentages ("66–76%" gives 66 and 76) and n values ("n = 2 + 7", "n = about 12,000") of an English line */
function claimNumbers(en) {
  const s = en.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const pct = [...s.matchAll(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*%/g)].flatMap(m => [m[1], m[2]].filter(Boolean)).map(Number);
  const n = [...s.matchAll(/\bn = (?:about )?(\d+(?:\s*\+\s*\d+)*)/g)].flatMap(m => m[1].split("+")).map(Number);
  return { pct, n };
}
/** v (as shown, e.g. 84) matches a source number s (e.g. 84.4) when s rounds to v at v's precision */
function shownAs(v, pool) {
  const dec = (String(v).split(".")[1] || "").length;
  return pool.some(s => Math.abs(s - v) <= 0.5 * 10 ** -dec + 1e-9);
}
function evidencePool(c, reg) {
  const pool = [];
  for (const id of c.acr || []) { const r = reg[id]; if (r) pool.push(...numbersIn([r.figures, r.n, r.quote].join(" "))); }
  if (c.ev) pool.push(...numbersIn(c.ev.quote.join(" ")));
  return pool;
}

test("accuracy lines are tied to docs/ACCURACY-CLAIMS.md rows or quoted source fragments; n and 'optimistic' shown", () => {
  const reg = claimsRegister();
  const docs = {};
  const MEASURED = ["synthetic", "public", "prelim", "field"];
  let tied = 0;
  for (const [id, c] of Object.entries(D.CLAIMS)) {
    for (const r of c.acr || []) assert.ok(reg[r], `${id}: register row ${r} not in docs/ACCURACY-CLAIMS.md §4`);
    if (c.ev) {
      assert.ok(c.ev.doc && existsSync(join(ROOT, c.ev.doc)), `${id}: evidence doc ${c.ev.doc}`);
      const text = docs[c.ev.doc] = docs[c.ev.doc] || squash(readFileSync(join(ROOT, c.ev.doc), "utf8"));
      for (const q of c.ev.quote) assert.ok(text.includes(squash(q)), `${id}: "${q}" is no longer in ${c.ev.doc}`);
    }
    if (!MEASURED.includes(c.src)) continue;
    tied++;
    assert.ok((c.acr && c.acr.length) || c.ev, `${id}: measured line without acr / ev evidence`);
    for (const l of ["th", "en", "zh"]) assert.match(c[l], /\bn = /, `${id}.${l}: no "n = …" (S3 format)`);
    const pool = evidencePool(c, reg);
    const { pct, n } = claimNumbers(c.en);
    assert.ok(n.length >= 1, `${id}: n value`);
    for (const v of pct) assert.ok(shownAs(v, pool), `${id}: ${v}% is not in its evidence (${(c.acr || []).join(",") || c.ev.doc})`);
    for (const v of n) assert.ok(shownAs(v, pool), `${id}: n = ${v} is not in its evidence`);
    const optimisticRow = (c.acr || []).some(r => /\boptimistic\b/.test(reg[r].labels));
    if (optimisticRow) assert.ok(c.optimistic, `${id}: a register row is labelled optimistic`);
    if (c.optimistic) {
      assert.match(c.th, /ดีเกินจริง/, id + ".th optimistic");
      assert.match(c.en, /optimistic/i, id + ".en optimistic");
      assert.match(c.zh, /偏乐观/, id + ".zh optimistic");
    }
  }
  assert.equal(tied, 17, "measured lines checked (inventory: 17 lines with a number)");
  // the check bites: a drifted figure or n is rejected
  const s3 = D.CLAIMS.store;
  assert.ok(!shownAs(claimNumbers(s3.en.replace("79%", "78%")).pct.find(v => v === 78), evidencePool(s3, reg)), "78% must not match S3");
  assert.ok(!shownAs(claimNumbers(s3.en.replace("n = 273", "n = 270")).n[0], evidencePool(s3, reg)), "n = 270 must not match S3");
  // the store line no longer calls the pooled street / station figure a shop-door count
  assert.ok(!/door count/i.test(s3.en) && /not a shop door/.test(s3.en), "store wording");
});

test("support pages: directory / notice / info / legal / account pages carry no readiness status", () => {
  const support = Object.entries(D.PAGES).filter(([, v]) => v.st === "support").map(([p]) => p).sort();
  assert.deepEqual(support, [...D.PLATFORM, "index", "admin", "cameras", "gate-notice"].sort());
  for (const p of support) assert.ok(D.PAGES[p].claims.every(id => D.CLAIMS[id].src === "na"), p + ": support page with a measured claim");
  const md = readFileSync(join(ROOT, "docs", "PAGE-STATUS.md"), "utf8");
  assert.match(md, new RegExp(`\\*\\*${Object.keys(D.PAGES).length - support.length} product pages\\*\\*`));
  assert.match(md, new RegExp(`\\*\\*${support.length} support pages\\*\\*`));
});

test("generated pages: no line over 200 characters (the CSP <meta> included); favicon split losslessly", async () => {
  const mod = await import(pathToFileURL(join(ROOT, "tools", "cat-pages.mjs")).href);
  for (const c of D.CATEGORIES) {
    const lines = readFileSync(join(ROOT, `cat-${c.slug}.html`), "utf8").split("\n");
    const long = lines.filter(l => [...l].length > 200);
    assert.deepEqual(long.map(l => l.slice(0, 60)), [], c.slug + ": long lines");
  }
  const split = mod.splitFavicon(mod.FAVICON_ONE_LINE);
  assert.ok(split.split("\n").every(l => l.length <= 160), "favicon lines");
  assert.equal(split.replace(/\n/g, ""), mod.FAVICON_ONE_LINE, "favicon: only line feeds added");
  assert.ok(split.split("\n").slice(1).every(l => l.startsWith(" ")), "favicon: every break sits right before an existing space");
});

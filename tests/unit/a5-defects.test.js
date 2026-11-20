"use strict";
// tests/unit/a5-defects.test.js — owner night order A5 (known defects, 2026-11-21). FIXED TEST: locked
// (~/LENSIQ-field/evals/a5-defects/, evals-locks/a5-defects.sha256) BEFORE the product fixes. Item 1 (one lensiq-camera.js
// ?v= on every page) is the stricter re-lock of tests/unit/walkfix-cp.test.js (rule 5), not repeated here.
//   2. docs/NAV.md "Menu as built" lists every nav.js MENU group with its pages in menu order; each CLAUDE.md category row
//      (1-7) is the matching nav group; every page that is not in the menu is named in the doc with how it is reached.
//   3. 197 ค help-line re-check (tools/helpline-recheck.mjs), fixtures only, NO network: a page that cannot be fetched is
//      retried, then reported as "could not fetch" (a warning, exit 0), never as a number change and never silently; a
//      page that was read and lost the number or its sentence is CHANGED (exit 1) with the sentence around the number.
//   4. gate.html / gate-notice.html: nav.js reads window.LENSIQ_HELP_TOP_STICKY (a lensiq-config.js switch), so every page
//      that loads a script reading a lensiq-config.js switch loads lensiq-config.js, at the site's one ?v=.
//   5. palm line cards (relock2): the Thai heading keeps its kanji subtitle exactly as before ("เส้นชีวิต" + "生命線", design
//      since 3808a3cb); English and Chinese show one name only (no "Life lineLife line", no "生命线Life line"); the line
//      names in each language hold no other script.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const PAGES = readdirSync(ROOT).filter(f => f.endsWith(".html"));

/* ---------- 2. docs/NAV.md matches nav.js and CLAUDE.md ---------- */
function navMenu() {
  const src = read("nav.js"), m = src.match(/var MENU = (\[[\s\S]*?\n {2}\]);/);
  assert.ok(m, "MENU in nav.js");
  return Function('"use strict"; return ' + m[1])();
}
function docSection(md, head) {
  const i = md.indexOf("\n## " + head);
  assert.ok(i >= 0, "docs/NAV.md section: ## " + head);
  const j = md.indexOf("\n## ", i + 4);
  return md.slice(i, j < 0 ? md.length : j);
}

test("2: docs/NAV.md 'Menu as built' = nav.js MENU (group id, category, pages in menu order)", () => {
  const md = read("docs/NAV.md"), sec = docSection(md, "Menu as built");
  const rows = [...sec.matchAll(/^\| (\d|-) \| `([a-z]+)` \| ([^|]*?) \| ([^|]+?) \| ([^|]+?) \|\s*$/gm)];
  const groups = navMenu().filter(g => g.items);
  assert.equal(rows.length, groups.length, "one table row per menu group");
  groups.forEach((g, i) => {
    const r = rows[i];
    assert.equal(r[2], g.id, "row " + (i + 1) + " group id");
    assert.equal(r[3].replace(/`/g, "").trim() || undefined, g.cat ? "cat-" + g.cat + ".html" : "—", g.id + " landing page");
    assert.ok(r[4].includes(g.label), g.id + " Thai label " + g.label);
    const pages = r[5].trim().split(/,\s*/).map(s => s.replace(/`/g, ""));
    assert.deepEqual(pages, g.items.map(x => x.href.replace(/\?.*$/, "")), g.id + " pages in menu order");
  });
  const cta = navMenu().find(g => g.cta);
  assert.ok(cta && sec.includes(cta.href), "the bar's call-to-action link is named: " + (cta && cta.href));
});

test("2: each CLAUDE.md category row 1-7 is the matching nav group; the doc names every page that is not in the menu", () => {
  const groups = navMenu().filter(g => g.cat);
  const rows = [...read("CLAUDE.md").matchAll(/^\| ([1-7]) \| [^|]+ \| ([^|]+) \|\s*$/gm)];
  assert.equal(rows.length, 7, "7 category rows in CLAUDE.md");
  for (const r of rows) {
    const g = groups[+r[1] - 1], inMenu = g.items.map(x => x.href.replace(/\?.*$/, "")).filter(h => !/^cat-/.test(h));
    const claude = r[2].replace(/\(\+\s*([^)]*)\)/g, ", $1").replace(/\([^)]*\)/g, " ").split(/[,\s]+/).filter(Boolean).map(p => p + ".html");
    assert.deepEqual([...inMenu].sort(), [...claude].sort(), "category " + r[1] + " (" + g.id + ")");
  }
  const menuPages = new Set(navMenu().flatMap(g => g.items ? g.items.map(x => x.href.replace(/\?.*$/, "")) : [g.href]));
  const outside = PAGES.filter(p => !menuPages.has(p));
  assert.ok(outside.length >= 1, "pages outside the menu");
  const sec = docSection(read("docs/NAV.md"), "Menu as built");
  for (const p of outside) assert.match(sec, new RegExp("`" + p.replace(/\./g, "\\.") + "`"), p + " named in docs/NAV.md (how it is reached)");
  assert.match(read("docs/NAV.md"), /Corrections to the moved header comment/, "the stale statements of the word-for-word header comment are corrected");
});

/* ---------- 3. help-line re-check (197 ค), fixtures only ---------- */
const FIX = join(__dirname, "fixtures", "helpline-recheck");
const fixture = n => readFileSync(join(FIX, n), "utf8");
// importing must not start the network check: the tool runs main() only when it is the script being run
const tool = async () => {
  assert.match(read("tools/helpline-recheck.mjs"), /^if \(process\.argv\[1\] && resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)\) main\(\);$/m,
    "tools/helpline-recheck.mjs runs its check only when run directly (no network on import)");
  return import(pathToFileURL(join(ROOT, "tools", "helpline-recheck.mjs")).href);
};
/** fake fetch: url -> fixture name | status number | "throw"; counts calls; any other url fails the test */
function fakeFetch(map) {
  const calls = {};
  const f = async url => {
    calls[url] = (calls[url] || 0) + 1;
    assert.ok(url in map, "no real network: unexpected url " + url);
    const v = map[url];
    if (v === "throw") throw new TypeError("fetch failed");
    if (typeof v === "number") return { ok: false, status: v, text: async () => "" };
    return { ok: true, status: 200, text: async () => fixture(v) };
  };
  return { f, calls };
}
const NO_NET = async () => { throw new Error("real network used in a unit test"); };

test("3: phrase classification reads the sentence around the number (fixtures)", async () => {
  const T = await tool();
  const P1300 = "สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน", FAQ = "ให้บริการ สายด่วน 1300 ตลอด24 ชั่วโมง 7 วัน";
  const ok = T.classifyPhrase(T.pageText(fixture("1300-ok.html")), { tel: "1300" }, P1300);
  assert.equal(ok.status, "ok");
  const sp = T.classifyPhrase(T.pageText(fixture("1300-spacing.html")), { tel: "1300" }, FAQ);
  assert.equal(sp.status, "ok", "only the spaces differ"); assert.match(sp.note || "", /spacing/);
  const hrs = T.classifyPhrase(T.pageText(fixture("1300-hours-changed.html")), { tel: "1300" }, P1300);
  assert.equal(hrs.status, "changed"); assert.equal(hrs.reason, "wording", "number still there, hours changed");
  assert.ok(hrs.context.length >= 1 && hrs.context.every(c => c.includes("1300")), "the sentence around the number: " + JSON.stringify(hrs.context));
  assert.ok(hrs.context.some(c => c.includes("08:30-16:30")), "the sentence carries the new hours");
  assert.ok(hrs.context.every(c => !c.startsWith("ติดต่อเรา.")), "the sentence starts after the previous full stop");
  const num = T.classifyPhrase(T.pageText(fixture("1669-number-changed.html")), { tel: "1669" }, "เจ็บป่วยฉุกเฉิน โทร. 1669");
  assert.equal(num.status, "changed"); assert.equal(num.reason, "number", "1669 is nowhere on the page");
  const sam = T.classifyPhrase(T.pageText(fixture("samaritans-reformatted.html")), { tel: "021136789" }, "ฟังคุณด้วยใจ โทร. 02-113-6789 เวลา 12:00-22:00 น.");
  assert.equal(sam.status, "changed"); assert.equal(sam.reason, "wording", "02 113 6789 is the same number written with spaces");
  assert.ok(sam.context.some(c => c.includes("02 113 6789") && c.includes("10:00-22:00")), JSON.stringify(sam.context));
  // the number pattern never matches inside a longer number
  assert.equal(T.numberPattern("1300").test("โทร 113001"), false);
  assert.equal(T.numberPattern("021136789").test("02-113-6789"), true);
});

test("3: a page that cannot be fetched is retried, then reported as 'could not fetch' (warning, exit 0), never as a change", async () => {
  const T = await tool(), real = globalThis.fetch;
  globalThis.fetch = NO_NET;
  try {
    const U = { a: "https://a.example/", b: "https://b.example/", c: "https://c.example/" };
    const { f, calls } = fakeFetch({ [U.a]: "throw", [U.b]: 503, [U.c]: "1300-ok.html" });
    const waits = [];
    const sources = [{ tel: "1669", url: U.a, phrases: ["เจ็บป่วยฉุกเฉิน โทร. 1669"] }, { tel: "1300", url: U.b, phrases: ["สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน"] },
      { tel: "1300", url: U.c, phrases: ["สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน"] }];
    const r = await T.recheck(sources, { fetchImpl: f, wait: async ms => { waits.push(ms); } });
    assert.equal(calls[U.a], 3, "retried: 3 attempts"); assert.equal(calls[U.b], 3, "HTTP 503 retried: 3 attempts"); assert.equal(calls[U.c], 1);
    assert.deepEqual(waits, [5000, 10000, 5000, 10000], "back-off between attempts, none after the last");
    assert.equal(r.changed.length, 0, "a fetch failure is not a change");
    assert.deepEqual(r.unfetched.map(x => x.url), [U.a, U.b]);
    assert.match(r.unfetched[1].error, /HTTP 503.*3 attempts/);
    const rep = T.report(r, sources.length), all = rep.out.join("\n");
    assert.equal(rep.exitCode, 0, "could not fetch alone does not fail the run");
    for (const u of [U.a, U.b]) {
      assert.ok(rep.out.some(l => l.startsWith("::warning") && l.includes(u)), "warning annotation for " + u);
      assert.ok(rep.out.some(l => /^could not fetch/.test(l) && l.includes(u)), "'could not fetch' line for " + u);
      assert.ok(!rep.out.some(l => /CHANGED|::error/.test(l) && l.includes(u)), u + " is not reported as a change");
    }
    assert.match(all, /2 could not fetch/); assert.match(all, /0 CHANGED/); assert.doesNotMatch(all, /all 3 official pages still state/);
  } finally { globalThis.fetch = real; }
});

test("3: a page that was read and changed fails the run (exit 1) and shows the sentence; could-not-fetch stays separate", async () => {
  const T = await tool(), real = globalThis.fetch;
  globalThis.fetch = NO_NET;
  try {
    const U = { h: "https://h.example/", n: "https://n.example/", x: "https://x.example/" };
    const { f } = fakeFetch({ [U.h]: "1300-hours-changed.html", [U.n]: "1669-number-changed.html", [U.x]: "throw" });
    const sources = [{ tel: "1300", url: U.h, phrases: ["สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน"] },
      { tel: "1669", url: U.n, phrases: ["เจ็บป่วยฉุกเฉิน โทร. 1669"] }, { tel: "191", url: U.x, phrases: ["สายด่วนฉุกเฉิน 191 ตลอด 24 ชั่วโมง"] }];
    const r = await T.recheck(sources, { fetchImpl: f, wait: async () => {} });
    const rep = T.report(r, sources.length), all = rep.out.join("\n");
    assert.equal(rep.exitCode, 1);
    assert.ok(rep.out.some(l => l.startsWith("::error") && l.includes(U.h) && /still on the page/.test(l)), "hours changed: number still on the page");
    assert.ok(rep.out.some(l => l.startsWith("::error") && l.includes(U.n) && /1669 is no longer on the page/.test(l)), "number changed");
    assert.match(all, /sentence on the page: ".*1300.*08:30-16:30/);
    assert.ok(rep.out.some(l => l.startsWith("::warning") && l.includes(U.x)), "the unfetched page is a warning");
    assert.ok(!rep.out.some(l => /CHANGED|::error/.test(l) && l.includes(U.x)), "the unfetched page is not a change");
    assert.match(all, /2 CHANGED; 1 could not fetch/);
  } finally { globalThis.fetch = real; }
});

test("3: the workflow runs the self-test and the checker, hides nothing; the tool imports without side effects", async () => {
  const y = read(".github/workflows/helpline-recheck.yml");
  assert.match(y, /node tools\/helpline-recheck\.mjs --selftest/); assert.match(y, /run: node tools\/helpline-recheck\.mjs\s*$/m);
  assert.doesNotMatch(y, /continue-on-error|\|\|\s*true|set \+e/, "a change is never swallowed");
  assert.match(y, /197/, "the workflow names owner decision 197 (could not fetch = warning, changed = failure)");
  const T = await tool();
  assert.equal(T.selftest(), null, "self-test (no network)");
  for (const k of ["pageText", "classifyPhrase", "fetchText", "recheck", "report", "numberPattern", "sentencesAround"]) assert.equal(typeof T[k], "function", k);
  assert.match(read("docs/CRISIS-RESOURCES.md"), /could not fetch/i, "docs/CRISIS-RESOURCES.md explains the 'could not fetch' warning");
});

/* ---------- 4. lensiq-config.js on every page whose scripts read a config switch ---------- */
const CONFIG_KEYS = [...new Set([...read("lensiq-config.js").matchAll(/window\.(LENSIQ_[A-Z0-9_]+)\s*=/g)].map(m => m[1]))];
function scriptsOf(html) {
  const s = [...html.matchAll(/<script\b[^>]*\ssrc="([a-z0-9][a-z0-9/._-]*\.js)(?:\?[^"]*)?"/g)].map(m => m[1]);
  if (s.includes("nav.js")) s.push("lensiq-i18n.js", "i18n/zh-common.js");
  return s;
}
const SW = {};
const readsSwitch = f => f !== "lensiq-config.js" && (SW[f] ??= CONFIG_KEYS.some(k => new RegExp("\\b" + k + "\\b").test(read(f))));

test("4: nav.js reads LENSIQ_HELP_TOP_STICKY (a lensiq-config.js switch), so gate.html and gate-notice.html read a switch", () => {
  assert.ok(CONFIG_KEYS.includes("LENSIQ_HELP_TOP_STICKY") && CONFIG_KEYS.length >= 20, "config keys: " + CONFIG_KEYS.length);
  assert.match(read("nav.js"), /LENSIQ_HELP_TOP_STICKY === false/);
  for (const p of ["gate.html", "gate-notice.html"]) assert.ok(scriptsOf(read(p)).some(readsSwitch), p + " loads a switch-reading script");
});

test("4: every page that loads a script reading a lensiq-config.js switch loads lensiq-config.js, at the site's one ?v=", () => {
  const vers = new Set(), missing = [];
  for (const p of PAGES) {
    const html = read(p), readers = scriptsOf(html).filter(readsSwitch);
    const cfg = html.match(/<script src="lensiq-config\.js\?v=(\d+)"><\/script>/);
    if (cfg) vers.add(cfg[1]);
    if (readers.length && !cfg) missing.push(p + " (" + readers.slice(0, 3).join(", ") + ")");
  }
  assert.deepEqual(missing, []);
  assert.equal(vers.size, 1, "one lensiq-config.js version: " + [...vers]);
  for (const p of ["gate.html", "gate-notice.html"]) assert.match(read(p), /<script src="lensiq-config\.js\?v=\d+"><\/script>/, p);
  assert.match(read("docs/NAV.md"), /LENSIQ_HELP_TOP_STICKY[\s\S]{0,400}lensiq-config\.js|lensiq-config\.js[\s\S]{0,400}LENSIQ_HELP_TOP_STICKY/,
    "docs/NAV.md notes why every nav.js page loads the config");
});

/* ---------- 5. palm line cards: one language per heading ---------- */
const THAI = /[฀-๿]/, CJK = /[㐀-鿿]/, LATIN = /[A-Za-z]/;

test("5: line-card heading per language: TH keeps its kanji subtitle (design since 3808a3cb); EN / ZH show one name only", () => {
  // relock2 (coordinator review 2026-11-21): the Thai subtitle stays exactly as before; only the EN duplicate ("Life lineLife
  // line") and the ZH English tail ("生命线Life line") go. Checked by running the heading code of palm.js per language.
  const js = read("palm.js"), m = js.match(/\$\("#plLines"\)\.innerHTML = [\s\S]*?\.join\(""\);/);
  assert.ok(m, "the #plLines render in palm.js");
  const found = m[0].match(/<h4>' \+ ([\s\S]*?) \+ "<\/h4>"/), unclear = m[0].match(/line-card unclear[\s\S]*?<h4>' \+ ([\s\S]*?) \+ '<\/h4>/);
  assert.ok(found && unclear, "found and unclear card headings");
  assert.doesNotMatch(unclear[1], /lineEn|\.cn\b|<span/, "unclear heading: " + unclear[1]);
  const KB = require(join(ROOT, "palm-kb.js"));
  const D = { th: {}, en: require(join(ROOT, "i18n", "en-fortune-palm.js")).en, zh: require(join(ROOT, "i18n", "zh-fortune-palm.js")).zh };
  for (const lang of ["th", "en", "zh"]) {
    const T = (k, th) => (D[lang][k] != null ? D[lang][k] : th), KT = (p, th) => T("palm.kb." + p, th);
    const head = Function("KT", "T", "trL", "esc", "l", "return " + found[1]);
    for (const id of ["life", "head", "heart", "fate"]) {
      const l = { id, th: KB.lines[id].th, cn: KB.lines[id].cn };
      const html = head(KT, T, () => lang !== "th", x => String(x), l), text = html.replace(/<[^>]+>/g, "");
      if (lang === "th") {
        assert.equal(html, KB.lines[id].th + "<span>" + KB.lines[id].cn + "</span>", "TH " + id + " unchanged: " + html);
      } else {
        assert.equal(text, D[lang]["palm.kb.lines." + id + ".th"], lang + " " + id + ": one name only: " + text);
        assert.doesNotMatch(html, /<span/, lang + " " + id);
        assert.ok(lang === "en" ? !CJK.test(text) && !THAI.test(text) : !LATIN.test(text) && !THAI.test(text), lang + " " + id + ": " + text);
      }
    }
  }
});

test("5: line names per language hold no other script (TH default palm-kb, EN and ZH dictionaries)", () => {
  const KB = require(join(ROOT, "palm-kb.js")), en = require(join(ROOT, "i18n", "en-fortune-palm.js")).en, zh = require(join(ROOT, "i18n", "zh-fortune-palm.js")).zh;
  for (const id of ["life", "head", "heart", "fate"]) {
    const th = KB.lines[id].th, e = en["palm.kb.lines." + id + ".th"], z = zh["palm.kb.lines." + id + ".th"];
    assert.ok(THAI.test(th) && !CJK.test(th) && !LATIN.test(th), "TH " + id + ": " + th);
    assert.ok(e && LATIN.test(e) && !CJK.test(e) && !THAI.test(e), "EN " + id + ": " + e);
    assert.ok(z && CJK.test(z) && !LATIN.test(z) && !THAI.test(z), "ZH " + id + ": " + z);
  }
});

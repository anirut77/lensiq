"use strict";
// tests/unit/promo-basics.test.js — owner order 2026-11-18 C "basics for promotion" on the home page and every category 6
// (fortune) page: correct, unique page titles and descriptions (TH in the markup, EN / 中文 through the page's dictionaries),
// a share preview for LINE and Facebook (Open Graph + twitter:card, one 1200x630 PNG per category, absolute URLs), a proper
// not-found page (404.html, TH / EN / 中文, links home), sitemap.xml listing every public page and robots.txt pointing at it.
// Every absolute URL comes from ONE value, deploy/site-url.json "base" (a hosting move is planned), through
// tools/promo-meta.mjs (build / stale). Speed budgets of these pages are never raised.
// This file is locked: evals-locks/promo-basics.sha256 (written BEFORE tools/promo-meta.mjs existed).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;
const CJK = /[一-鿿]/;

/** category 6 pages from the CLAUDE.md "Categories" table (row 6) + the home page */
function promoPages() {
  const md = read("CLAUDE.md");
  const row = /^\| 6 \| [^|]+ \| ([^|]+) \|$/m.exec(md);
  assert.ok(row, "CLAUDE.md category 6 row");
  const fortune = row[1].split(",").map(s => s.trim()).filter(Boolean);
  assert.ok(fortune.length >= 18 && fortune.includes("fortune") && fortune.includes("report"), fortune.join(","));
  return { fortune, all: ["index", ...fortune] };
}
const PAGES = promoPages();

const BASE = JSON.parse(read("deploy/site-url.json")).base;
const pageUrl = p => (p === "index" ? BASE : BASE + p + ".html");
const decode = s => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const headOf = html => html.split(/<\/head>/i)[0];
/** content of <meta property|name="k"> in the head (first match) */
function meta(head, k) {
  for (const m of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = m[1];
    if (new RegExp(`(?:property|name)="${k.replace(/[.:]/g, "\\$&")}"`).test(a)) { const c = /\bcontent="([^"]*)"/.exec(a); return c ? decode(c[1]) : null; }
  }
  return null;
}
const metaTag = (head, k) => [...head.matchAll(/<meta\b([^>]*)>/gi)].map(m => m[1]).find(a => new RegExp(`(?:property|name)="${k}"`).test(a));
const titleOf = head => { const m = /<title\b([^>]*)>([^<]*)<\/title>/i.exec(head); return m ? { attrs: m[1], text: decode(m[2]).trim() } : null; };

/** the page's dictionaries: every i18n/zh-X.js script tag (+ zh-common.js, loaded by nav.js) and its en-X.js sibling */
function dictsFor(html) {
  const names = [...new Set([...html.matchAll(/i18n\/zh-([\w-]+)\.js/g)].map(m => m[1]).concat(["common"]))];
  const out = { en: {}, zh: {} };
  for (const lang of ["en", "zh"]) for (const n of names) {
    const f = `i18n/${lang}-${n}.js`;
    if (!existsSync(join(ROOT, f))) continue;
    for (const m of read(f).matchAll(/"([\w.-]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) out[lang][m[1]] = JSON.parse('"' + m[2] + '"');
  }
  return out;
}

test("one base URL: deploy/site-url.json holds an https base ending in /", () => {
  assert.match(BASE, /^https:\/\/[a-z0-9.-]+(?:\/[\w.-]+)*\/$/, BASE);
});

test("every listed page: a unique title and description in TH, with EN and 中文 through the page's dictionaries", () => {
  const seen = { title: new Map(), desc: new Map(), en: new Map(), zh: new Map(), enD: new Map(), zhD: new Map() };
  const uniq = (map, v, p, what) => { assert.ok(!map.has(v), `${p}: ${what} "${v}" also on ${map.get(v)}`); map.set(v, p); };
  for (const p of PAGES.all) {
    const html = read(p + ".html"), head = headOf(html);
    assert.match(html, /<html\b[^>]*\blang="th"/, p + ": <html lang=th>");
    const t = titleOf(head);
    assert.ok(t && THAI.test(t.text) && /LENSIQ/.test(t.text) && t.text.length <= 90, `${p}: Thai title with LENSIQ, <= 90 chars: ${t && t.text}`);
    const d = meta(head, "description");
    assert.ok(d && THAI.test(d) && d.length >= 50 && d.length <= 200, `${p}: Thai meta description 50-200 chars (${d && d.length})`);
    uniq(seen.title, t.text, p, "title"); uniq(seen.desc, d, p, "description");
    const tk = (/data-i18n="([^"]+)"/.exec(t.attrs) || [])[1];
    const dk = (/data-i18n-attr="content:([^";]+)"/.exec(metaTag(head, "description") || "") || [])[1];
    assert.ok(tk, `${p}: <title data-i18n> key`); assert.ok(dk, `${p}: meta description data-i18n-attr="content:<key>"`);
    const D = dictsFor(html);
    for (const [lang, k, mapKey] of [["en", tk, "en"], ["zh", tk, "zh"], ["en", dk, "enD"], ["zh", dk, "zhD"]]) {
      const v = D[lang][k];
      assert.ok(v && v.trim(), `${p}: ${lang} value for ${k}`);
      assert.ok(!THAI.test(v), `${p}: ${lang} ${k} has Thai: ${v}`);
      if (lang === "zh") assert.ok(CJK.test(v), `${p}: zh ${k} has no Chinese: ${v}`);
      uniq(seen[mapKey], v, p, `${lang} ${k}`);
    }
  }
});

test("share preview on every listed page: Open Graph + twitter:card + canonical, absolute URLs from the one base", () => {
  for (const p of PAGES.all) {
    const head = headOf(read(p + ".html")), t = titleOf(head).text, d = meta(head, "description");
    assert.equal(meta(head, "og:type"), "website", p);
    assert.equal(meta(head, "og:site_name"), "LENSIQ", p);
    assert.equal(meta(head, "og:locale"), "th_TH", p);
    assert.equal(meta(head, "og:title"), t, p + ": og:title = <title>");
    assert.equal(meta(head, "og:description"), d, p + ": og:description = meta description");
    assert.equal(meta(head, "og:url"), pageUrl(p), p + ": og:url");
    const canon = (/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i.exec(head) || /<link\b[^>]*href="([^"]+)"[^>]*rel="canonical"/i.exec(head) || [])[1];
    assert.equal(canon, pageUrl(p), p + ": canonical");
    const img = meta(head, "og:image");
    const want = BASE + "share/og-" + (p === "index" ? "home" : "fortune") + ".png";
    assert.equal(img, want, p + ": og:image (one image per category, absolute)");
    assert.equal(meta(head, "og:image:width"), "1200", p); assert.equal(meta(head, "og:image:height"), "630", p);
    assert.ok((meta(head, "og:image:alt") || "").length >= 5, p + ": og:image:alt");
    assert.equal(meta(head, "twitter:card"), "summary_large_image", p);
    assert.ok(!/<meta\b[^>]*name="robots"[^>]*noindex/i.test(head), p + ": a promoted page is not noindex");
  }
});

test("share images: PNG, exactly 1200x630, under 300 KB, one per category (home, fortune)", () => {
  for (const c of ["home", "fortune"]) {
    const f = join(ROOT, "share", `og-${c}.png`);
    assert.ok(existsSync(f), f);
    const b = readFileSync(f);
    assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", c + ": PNG signature");
    assert.equal(b.subarray(12, 16).toString("ascii"), "IHDR");
    assert.equal(b.readUInt32BE(16), 1200, c + ": width"); assert.equal(b.readUInt32BE(20), 630, c + ": height");
    assert.ok(statSync(f).size < 300 * 1024, c + ": size " + statSync(f).size);
  }
});

// RE-LOCK 2 2026-11-18 (after CI run 44142070390 failed on 404.html, before the fix): the site-wide e2e gates (shared header,
// 100 % 中文 / English mode, button states) apply to every page, 404.html included, so the not-found page is a normal site page:
// shared header (nav.js, which also adds the terms / privacy / help footer), styles, TH in the markup and EN / 中文 through its
// dictionary. Its own files load relative to the address like every page; the links that lead out are absolute (they work
// from a nested missing path too).
test("404.html: a normal site page (shared header), noindex, CSP meta, TH / EN / 中文, absolute links home, fortune and help", () => {
  assert.ok(existsSync(join(ROOT, "404.html")), "404.html");
  const html = read("404.html");
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html\b[^>]*\blang="th"/);
  assert.match(html, /<meta\b[^>]*http-equiv="Content-Security-Policy"/i);
  assert.match(html, /<meta\b[^>]*name="robots"[^>]*content="noindex/i);
  assert.match(html, /<header class="nav" id="siteNav"><\/header>/, "shared header");
  assert.match(html, /<script src="nav\.js\?v=\d+"><\/script>/, "nav.js");
  assert.match(html, /<link rel="stylesheet" href="styles\.css\?v=\d+">/, "styles.css");
  const t = titleOf(headOf(html));
  assert.ok(t && THAI.test(t.text) && /LENSIQ/.test(t.text), "Thai title");
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length >= 4, "translated texts: " + keys.length);
  const D = dictsFor(html);
  for (const k of keys) for (const lang of ["en", "zh"]) {
    const v = D[lang][k];
    assert.ok(v && !THAI.test(v), `404.html ${lang} ${k}: ${v}`);
    if (lang === "zh") assert.ok(CJK.test(v), `404.html zh ${k}: ${v}`);
  }
  assert.ok(Object.values(D.en).some(v => /page not found/i.test(v)), "English: Page not found");
  for (const u of [BASE, BASE + "fortune.html", BASE + "help.html"]) assert.ok(html.includes(`href="${u}"`), "absolute link " + u);
});

test("sitemap.xml lists every public page exactly once (no noindex pages, no 404), robots.txt points at it", () => {
  const html = readdirSync(ROOT).filter(f => /^[^/]+\.html$/.test(f) && f !== "404.html").sort();
  // re-lock 226b (owner decision 226, "off = not shown"): a page switched off in the nav.js visibility list is not public
  const vis = read("nav.js").match(/var VISIBILITY = \{([\s\S]*?)\};/);
  assert.ok(vis, "nav.js: var VISIBILITY");
  const OFF = [...vis[1].matchAll(/"?([a-z][\w-]*)"?: false/g)].map(m => m[1]).filter(p => existsSync(join(ROOT, p + ".html")));
  assert.ok(OFF.length >= 5, "switched-off pages: " + OFF.join(", "));
  const pub = html.filter(f => !/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(read(f))).map(f => f.replace(/\.html$/, "")).filter(p => !OFF.includes(p));
  assert.ok(pub.length >= 60, "public pages: " + pub.length);
  const xml = read("sitemap.xml");
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(new Set(locs).size, locs.length, "duplicate <loc>");
  assert.deepEqual([...locs].sort(), pub.map(pageUrl).sort());
  for (const p of ["account", "admin", "pricing"]) if (existsSync(join(ROOT, p + ".html"))) assert.ok(!locs.includes(pageUrl(p)), p + " is noindex");
  for (const p of OFF) assert.ok(!locs.includes(pageUrl(p)), p + " is switched off and not in the sitemap");
  const robots = read("robots.txt");
  assert.match(robots, /^User-agent: \*$/m);
  assert.ok(robots.split(/\r?\n/).includes("Sitemap: " + BASE + "sitemap.xml"), "Sitemap line");
  assert.ok(!/^Disallow: \/\s*$/m.test(robots), "the whole site is not blocked");
});

test("generated from one value: tools/promo-meta.mjs output is current and follows another base everywhere", async () => {
  const mod = await import(pathToFileURL(join(ROOT, "tools", "promo-meta.mjs")).href);
  const files = mod.build();
  for (const f of ["sitemap.xml", "robots.txt", "404.html", ...PAGES.all.map(p => p + ".html")]) assert.ok(files[f], "build() writes " + f);
  assert.deepEqual(mod.stale(files), [], "run: node tools/promo-meta.mjs");
  const other = "https://example.test/new-home/";
  const moved = mod.build({ base: other });
  for (const [f, text] of Object.entries(moved)) {
    assert.ok(!text.includes(BASE), `${f} still has the old base after a base change`);
    assert.ok(text.includes(other), `${f} does not use the new base`);
  }
});

test("published: build-site's allowlist includes sitemap.xml, robots.txt, 404.html and share/*.png", async () => {
  const { ALLOW, forbiddenReason } = await import(pathToFileURL(join(ROOT, "tools", "build-site.mjs")).href);
  for (const f of ["sitemap.xml", "robots.txt", "404.html", "share/og-home.png", "share/og-fortune.png"]) {
    assert.ok(ALLOW.some(re => re.test(f)), f + " not in ALLOW"); assert.equal(forbiddenReason(f), null, f);
  }
});

test("speed budgets of the touched pages are never raised (frozen at origin/main 5695734, 2026-11-18)", () => {
  const FROZEN = { "astro.html": [1600, 37], "bazi.html": [1420, 36], "dream.html": [1390, 35], "faceread.html": [3650, 47],
    "fengshui.html": [1380, 36], "fortune.html": [440, 24], "help.html": [400, 21], "horoscope.html": [1570, 32], "iching.html": [1340, 35],
    "index.html": [470, 25], "lek7.html": [1420, 36], "lifegraph.html": [1420, 36], "luckycolor.html": [550, 29], "numbers.html": [1310, 33],
    "palm.html": [3390, 41], "planner.html": [780, 28], "report.html": [1470, 32], "taksa.html": [1420, 36], "tarot.html": [1620, 35],
    "zodiac.html": [1430, 36] };
  const src = read("tests/e2e/speed-budget.e2e.mjs");
  for (const [page, [kb, req]] of Object.entries(FROZEN)) {
    const m = new RegExp(`"${page.replace(".", "\\.")}": \\{ kb: (\\d+), req: (\\d+) \\}`).exec(src);
    assert.ok(m, page + " budget present");
    assert.ok(+m[1] <= kb && +m[2] <= req, `${page}: budget ${m[1]} KB / ${m[2]} req raised above ${kb} / ${req}`);
  }
});

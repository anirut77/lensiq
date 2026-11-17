"use strict";
// tests/unit/fortune-theme.test.js — fortune theme "ราตรีคราม" (owner approval 2026-11-17: direction A + gold line-art style).
// FIXED TEST: written and locked (~/LENSIQ-field/evals/fortune-theme/, sha256 in evals-locks/fortune-theme.sha256) BEFORE the
// theme is wired into any page (branch fortune-theme, base origin/main 9f977dd). Static, synthetic; no network.
//   1. theme only in the fortune section: every fortune page (category 6 of tools/cat-data.cjs, compat included) and
//      cat-fortune.html carry <html class="lq-ft"> and link fortune-theme.css; no other page does; fortune-entry.js only on
//      the two menu pages (fortune.html, cat-fortune.html); one ?v= per asset;
//   2. fortune-theme.css: every rule is scoped to html.lq-ft; its own font family only (no Prompt / Inter redefinition);
//      the palette A tokens are present;
//   3. contrast >= 4.5:1 for every text / surface pair of palette A (WCAG 2.1 formula);
//   4. deities: 6-8 items, Hindu / Brahmin / Chinese folk traditions only, no Buddha or Buddhist figure, names and blessing
//      lines in TH / EN / ZH that pass the Merit wording lint (no promise, price, fear, lottery ...), identifying features
//      listed, a review status per item ("pending" | "approved"; approved needs a reviewer and a date);
//   5. selection logic: only approved items are eligible (the local preview flag works on localhost / 127.0.0.1 / file:
//      only, never on the live host), a different deity from last time, blocked in a crisis / calm session;
//   6. art: every SVG < 15 KB, no <image>, bitmap, script, foreignObject, external reference or url(); deities share one
//      style (same root attributes, gold #E8C979, line weight 2); every menu icon < 2 KB, one per fortune page;
//   7. menu: fortune.html has a card for every other fortune page (compat included), cat-fortune.html a card for every
//      fortune page, each with its illustration slot; every card text key exists in EN and ZH;
//   8. no deity name or blessing in any page's markup, no blessing in a dictionary (they reach the page only through
//      fortune-entry.js, when approved);
//   9. speed budgets of the fortune pages unchanged (may only go down).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const D = require(join(ROOT, "tools", "cat-data.cjs"));
const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
const FORTUNE_PAGES = [...new Set(FORT.pages.concat(["compat"]))];
const SECTION = FORTUNE_PAGES.concat(["cat-fortune"]);
const MENU_PAGES = ["fortune", "cat-fortune"];
const HTML = readdirSync(ROOT).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5)).sort();
const ART = join(ROOT, "art", "fortune");
const PALETTE = { bg1: "#120F2E", bg2: "#2A1B55", gold: "#E8C979", text: "#F5F1E8", muted: "#BDB5DA", card: "#1E1844", press: "#2A2160" };

function lum(hex) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const entry = () => require(join(ROOT, "fortune-entry.js"));

test("1. theme only in the fortune section: html.lq-ft + fortune-theme.css on fortune pages and cat-fortune, nowhere else", () => {
  const vers = new Set(), entryVers = new Set();
  for (const p of HTML) {
    const src = read(p + ".html");
    const htmlTag = (src.match(/<html\b[^>]*>/) || [""])[0];
    const themed = /\bclass="[^"]*\blq-ft\b[^"]*"/.test(htmlTag);
    const links = [...src.matchAll(/<link rel="stylesheet" href="fortune-theme\.css\?v=(\d+)">/g)].map(m => m[1]);
    const anyRef = /fortune-theme\.css/.test(src);
    const entryRefs = [...src.matchAll(/<script src="fortune-entry\.js\?v=(\d+)"( defer)?><\/script>/g)].map(m => m[1]);
    if (SECTION.includes(p)) {
      assert.ok(themed, p + ".html: <html> has no lq-ft class");
      assert.equal(links.length, 1, p + ".html: exactly one fortune-theme.css link");
      links.forEach(v => vers.add(v));
    } else {
      assert.ok(!themed, p + ".html is not a fortune page but has lq-ft");
      assert.ok(!anyRef, p + ".html is not a fortune page but references fortune-theme.css");
      assert.ok(!/fortune-entry\.js|art\/fortune\//.test(src), p + ".html is not a fortune page but references the fortune art / entry");
    }
    if (MENU_PAGES.includes(p)) { assert.equal(entryRefs.length, 1, p + ".html: fortune-entry.js once"); entryRefs.forEach(v => entryVers.add(v)); }
    else assert.equal(entryRefs.length, 0, p + ".html must not load fortune-entry.js (entry screen only on the menu pages)");
  }
  assert.equal(vers.size, 1, "one ?v= for fortune-theme.css: " + [...vers]);
  assert.equal(entryVers.size, 1, "one ?v= for fortune-entry.js: " + [...entryVers]);
  // no other site-wide file pulls the theme in
  for (const f of ["styles.css", "nav.js", "products.css", "cat.css", "sw.js"]) assert.ok(!/fortune-theme\.css|fortune-entry\.js/.test(read(f)), f + " pulls the theme");
});

test("2. fortune-theme.css: every rule scoped to html.lq-ft, its own font family, palette A tokens", () => {
  const css = read("fortune-theme.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const fams = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(fams.length >= 2, "theme font faces");
  for (const f of fams) {
    assert.match(f, /font-family:\s*LQft\b/, "theme font family is LQft only (never redefines Prompt / Inter): " + f.slice(0, 80));
    for (const u of f.matchAll(/url\(([^)]+)\)/g)) assert.match(u[1], /^vendor\/fonts\/prompt\/prompt-\d00-(thai|latin)\.woff2$/, "font file " + u[1]);
  }
  const body = css.replace(/@font-face\s*\{[^}]*\}/g, "").replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  // flatten @media / @supports wrappers, keep their inner rules
  const flat = body.replace(/@(media|supports)[^{]*\{/g, "").replace(/\}\s*\}/g, "}");
  const sels = [...flat.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  assert.ok(sels.length > 20, "rules found: " + sels.length);
  for (const s of sels) for (const one of s.split(",").map(x => x.trim()).filter(Boolean)) {
    assert.match(one, /^html\.lq-ft\b/, "selector not scoped to html.lq-ft: " + one);
  }
  for (const [k, hex] of Object.entries(PALETTE)) assert.ok(css.toUpperCase().includes(hex), "palette token " + k + " " + hex);
  assert.ok(!/@import|https?:/i.test(css), "no @import / external URL");
});

test("3. palette A: contrast >= 4.5:1 for every text / surface pair", () => {
  const surfaces = ["bg1", "bg2", "card", "press"];
  for (const s of surfaces) for (const t of ["text", "muted", "gold"]) {
    const r = ratio(PALETTE[t], PALETTE[s]);
    assert.ok(r >= 4.5, `${t} on ${s}: ${r.toFixed(2)}`);
  }
  // dark ink on the gold accent (pressed / selected chips)
  assert.ok(ratio("#1A1433", PALETTE.gold) >= 4.5, "ink on gold");
});

test("4. deities: 6-8, allowed traditions, no Buddhist figure, TH/EN/ZH names and blessings pass the Merit lint, features, review status", () => {
  const E = entry();
  const lint = require(join(ROOT, "lensiq-merit-lint.js")).lintMerit;
  assert.ok(Array.isArray(E.DEITIES), "DEITIES exported");
  assert.ok(E.DEITIES.length >= 6 && E.DEITIES.length <= 8, "6-8 deities: " + E.DEITIES.length);
  const ids = new Set();
  const BANNED = /buddha|พุทธ|佛|guan ?yin|kuan ?yin|kwan ?im|กวนอิม|观音|觀音|bodhisattva|โพธิสัตว์|菩萨|菩薩|arhat|อรหันต์|罗汉|monk|พระสงฆ์|หลวงพ่อ|เกจิ/i;
  for (const d of E.DEITIES) {
    assert.match(d.id, /^[a-z]+$/, "id " + d.id);
    assert.ok(!ids.has(d.id), "duplicate " + d.id); ids.add(d.id);
    assert.ok(["hindu_brahman", "chinese_folk"].includes(d.tradition), d.id + " tradition " + d.tradition);
    assert.equal(d.src, "art/fortune/deity-" + d.id + ".svg", d.id + " src");
    assert.ok(existsSync(join(ROOT, d.src)), d.src + " exists");
    for (const l of ["th", "en", "zh"]) {
      for (const k of ["name", "bless"]) {
        const v = d[k] && d[k][l];
        assert.ok(typeof v === "string" && v.trim().length > 0, `${d.id} ${k}.${l}`);
        assert.ok(!BANNED.test(v), `${d.id} ${k}.${l} names a Buddhist figure: ${v}`);
        assert.deepEqual(lint(v), [], `${d.id} ${k}.${l} fails the Merit wording lint: ${v}`);
        assert.ok(!/[0-9๐-๙฿$€¥!]|https?:|www\./.test(v), `${d.id} ${k}.${l}: no digits, prices, links or exclamation: ${v}`);
      }
      const max = { th: 60, en: 70, zh: 30 }[l];
      assert.ok(d.bless[l].length <= max, `${d.id} bless.${l} is one short line (<= ${max}): ${d.bless[l].length}`);
    }
    assert.ok(!BANNED.test(d.id), d.id + " id names a Buddhist figure");
    for (const l of ["th", "en"]) assert.ok(Array.isArray(d.features && d.features[l]) && d.features[l].length >= 3, `${d.id} features.${l} >= 3`);
    assert.ok(["pending", "approved"].includes(d.status), d.id + " status " + d.status);
    if (d.status === "approved") {
      assert.ok(typeof d.reviewedBy === "string" && d.reviewedBy.trim(), d.id + " approved without a reviewer");
      assert.match(String(d.reviewedAt || ""), /^\d{4}-\d{2}-\d{2}$/, d.id + " approved without a review date");
    }
  }
  for (const l of ["th", "en", "zh"]) assert.ok(typeof E.SKIP[l] === "string" && E.SKIP[l].length > 0, "skip hint " + l);
});

test("5. selection: approved only; preview flag local only; different from last time; blocked in crisis / calm", () => {
  const E = entry();
  const mk = (id, status) => ({ id, status });
  const list = [mk("a", "pending"), mk("b", "approved"), mk("c", "approved"), mk("d", "pending")];
  assert.deepEqual(E.eligible(list, false).map(d => d.id), ["b", "c"]);
  assert.deepEqual(E.eligible(list.filter(d => d.status === "pending"), false), []);
  assert.deepEqual(E.eligible(list, true).map(d => d.id), ["a", "b", "c", "d"], "preview: every item");
  for (let i = 0; i < 20; i++) assert.equal(E.pick(E.eligible(list, false), "b", Math.random).id, "c", "never the same as last time when another exists");
  assert.equal(E.pick([mk("x", "approved")], "x", Math.random).id, "x", "one item: that item");
  assert.equal(E.pick([], null, Math.random), null);
  // preview flag: only on a local host / file:, and only with ?ftpreview=1
  const loc = (protocol, hostname, search) => ({ protocol, hostname, search });
  assert.equal(E.previewAllowed(loc("https:", "anirut77.github.io", "?ftpreview=1")), false, "never on the live site");
  assert.equal(E.previewAllowed(loc("https:", "lensiq.example", "?ftpreview=1")), false);
  assert.equal(E.previewAllowed(loc("http:", "127.0.0.1", "?ftpreview=1")), true);
  assert.equal(E.previewAllowed(loc("http:", "localhost", "?lang=en&ftpreview=1")), true);
  assert.equal(E.previewAllowed(loc("file:", "", "?ftpreview=1")), true);
  assert.equal(E.previewAllowed(loc("http:", "127.0.0.1", "")), false);
  assert.equal(E.previewAllowed(loc("http:", "127.0.0.1", "?ftpreview=0")), false);
  // crisis / calm: the same signals as fortune-crisis.js
  const doc = attrs => ({ documentElement: { hasAttribute: a => attrs.includes(a), getAttribute: a => attrs.includes(a) ? "1" : null } });
  const ss = v => ({ getItem: k => k === "lq-fortune-calm" ? v : null });
  assert.equal(E.isBlocked(doc([]), ss(null)), false);
  assert.equal(E.isBlocked(doc(["data-lq-crisis"]), ss(null)), true);
  assert.equal(E.isBlocked(doc(["data-lq-calm"]), ss(null)), true);
  assert.equal(E.isBlocked(doc([]), ss("1")), true);
  assert.equal(E.isBlocked(doc([]), { getItem() { throw new Error("blocked"); } }), false, "storage blocked: page-level signals only");
  // a new visit to the section: entered from outside it (other site, other category, typed URL), not reload / back
  const o = "http://127.0.0.1:8000";
  assert.equal(E.newVisit("", o, "navigate"), true);
  assert.equal(E.newVisit(o + "/index.html", o, "navigate"), true);
  assert.equal(E.newVisit(o + "/cat-hr.html", o, "navigate"), true);
  assert.equal(E.newVisit("https://www.google.com/", o, "navigate"), true);
  assert.equal(E.newVisit(o + "/tarot.html?lang=en", o, "navigate"), false);
  assert.equal(E.newVisit(o + "/cat-fortune.html", o, "navigate"), false);
  assert.equal(E.newVisit(o + "/index.html", o, "reload"), false);
  assert.equal(E.newVisit(o + "/index.html", o, "back_forward"), false);
});

test("6. art: < 15 KB, no bitmap / external reference; deities in one style; one icon < 2 KB per fortune page", () => {
  const files = readdirSync(ART).filter(f => f.endsWith(".svg"));
  assert.ok(files.length >= 7, "art files: " + files.length);
  for (const f of readdirSync(ART)) assert.match(f, /\.svg$/, "only SVG in art/fortune: " + f);
  let rootAttrs = null;
  for (const f of files) {
    const src = readFileSync(join(ART, f), "utf8");
    const size = statSync(join(ART, f)).size;
    assert.ok(size < 15 * 1024, `${f}: ${size} B >= 15 KB`);
    const BAD = /<image\b|<foreignObject\b|<script\b|<style\b|@import|data:|https?:\/\/(?!www\.w3\.org\/(2000\/svg|1999\/xlink))|\.(png|jpe?g|gif|webp)\b/i;
    assert.ok(!BAD.test(src), f + ": bitmap / script / external reference");
    for (const m of src.matchAll(/(?:xlink:)?href="([^"]*)"/g)) assert.match(m[1], /^#/, f + ": external href " + m[1]);
    for (const m of src.matchAll(/url\(([^)]*)\)/g)) assert.match(m[1], /^#/, f + ": external url() " + m[1]);
    if (f.startsWith("deity-")) {
      assert.ok(size <= 6 * 1024, `${f}: ${size} B over the 6 KB target`);
      const root = (src.match(/<svg\b[^>]*>/) || [""])[0].replace(/\s+aria-label="[^"]*"/, "");
      const want = ['viewBox="0 0 240 300"', 'fill="none"', 'stroke="#E8C979"', 'stroke-width="2"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'role="img"'];
      for (const a of want)
        assert.ok(root.includes(a), `${f}: root ${a}`);
      if (rootAttrs == null) rootAttrs = root; else assert.equal(root, rootAttrs, f + ": same root style as the other deities");
      const colours = new Set([...src.matchAll(/(?:stroke|fill)="(#[0-9A-Fa-f]{3,6})"/g)].map(m => m[1].toUpperCase()));
      for (const c of colours) assert.ok(["#E8C979", "#FFF", "#000"].includes(c), f + ": colour " + c + " (gold line only; #fff / #000 inside the mask)");
      const widths = [...src.matchAll(/stroke-width="([\d.]+)"/g)].map(m => +m[1]);
      for (const w of widths) assert.ok(w === 2 || w === 10 || w === 4, f + ": stroke-width " + w + " (2 = line, 10 = halo gap mask, 4 = dotted beads)");
    }
  }
  const sprite = readFileSync(join(ART, "icons.svg"), "utf8");
  const syms = [...sprite.matchAll(/<symbol id="ic-([a-z0-9-]+)"([^>]*)>([\s\S]*?)<\/symbol>/g)];
  const have = new Set(syms.map(m => m[1]));
  for (const p of FORTUNE_PAGES) assert.ok(have.has(p), "menu icon for " + p);
  for (const [whole, id, attrs] of syms) {
    assert.ok(Buffer.byteLength(whole) < 2048, `icon ${id}: ${Buffer.byteLength(whole)} B >= 2 KB`);
    assert.ok(/viewBox="0 0 64 64"/.test(attrs) && /stroke="currentColor"/.test(attrs), `icon ${id}: 64 x 64, currentColor line`);
  }
});

test("7. menu: a card with an illustration slot for every fortune page (compat included); card texts in EN and ZH", () => {
  const dict = l => read(`i18n/${l}-fortune.js`) + read(`i18n/${l}-fortune-hub.js`) + read(`i18n/${l}-common.js`);
  const has = (src, key) => src.includes('"' + key + '"');
  const hub = read("fortune.html");
  const grid = (hub.match(/<div class="ft-grid">([\s\S]*?)<\/div>/) || [])[1] || "";
  const cards = [...grid.matchAll(/<a class="ft-card" href="([a-z0-9-]+)\.html">([\s\S]*?)<\/a>/g)];
  const linked = new Set(cards.map(c => c[1]));
  for (const p of FORTUNE_PAGES.filter(p => p !== "fortune")) assert.ok(linked.has(p), "fortune.html menu card for " + p);
  const en = dict("en"), zh = dict("zh");
  for (const [, page, body] of cards) {
    assert.match(body, new RegExp(`<svg class="ft-ill" data-ic="${page}" aria-hidden="true"[^>]*></svg>`), page + ": illustration slot");
    for (const k of [...body.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1])) {
      assert.ok(has(en, k), `EN key ${k} (${page})`);
      assert.ok(has(zh, k), `ZH key ${k} (${page})`);
    }
  }
  const cat = read("cat-fortune.html");
  for (const p of FORT.pages) {
    const art = (cat.match(new RegExp(`<article class="pd-card cat-tool" data-page="${p}"[^>]*>([\\s\\S]*?)</article>`)) || [])[1] || "";
    assert.ok(art, "cat-fortune card " + p);
    assert.match(art, new RegExp(`<svg class="ft-ill" data-ic="${p}" aria-hidden="true"[^>]*></svg>`), "cat-fortune illustration slot " + p);
  }
});

test("8. no deity name or blessing in any page's markup; no blessing in any dictionary", () => {
  const E = entry();
  const names = [], bless = [];
  for (const d of E.DEITIES) for (const l of ["th", "en", "zh"]) { names.push(d.name[l]); bless.push(d.bless[l]); }
  for (const p of HTML) {
    const src = read(p + ".html");
    for (const w of names.concat(bless)) assert.ok(!src.includes(w), `${p}.html contains "${w}" (deity text reaches the page only through fortune-entry.js when approved)`);
  }
  for (const f of readdirSync(join(ROOT, "i18n"))) {
    const src = read("i18n/" + f);
    for (const w of bless) assert.ok(!src.includes(w), `i18n/${f} contains the blessing "${w}"`);
  }
});

test("9. speed budgets of the fortune pages unchanged (may only go down)", () => {
  const src = read("tests/e2e/speed-budget.e2e.mjs");
  const BASE = {
    "astro.html": [1600, 37], "bazi.html": [1420, 36], "cat-fortune.html": [370, 20], "dream.html": [1390, 35], "faceread.html": [3650, 47],
    "fengshui.html": [1380, 36], "fortune.html": [440, 24], "horoscope.html": [1570, 32], "iching.html": [1340, 35], "lek7.html": [1420, 36],
    "lifegraph.html": [1420, 36], "luckycolor.html": [550, 29], "numbers.html": [1310, 33], "palm.html": [3390, 41], "planner.html": [780, 28],
    "report.html": [1470, 32], "taksa.html": [1420, 36], "tarot.html": [1620, 35], "zodiac.html": [1430, 36]
  };
  for (const [page, [kb, req]] of Object.entries(BASE)) {
    const m = src.match(new RegExp(`"${page.replace(".", "\\.")}": \\{ kb: (\\d+), req: (\\d+) \\}`));
    assert.ok(m, "budget line for " + page);
    assert.ok(+m[1] <= kb && +m[2] <= req, `${page}: budget ${m[1]} KB / ${m[2]} req raised above ${kb} / ${req}`);
  }
});

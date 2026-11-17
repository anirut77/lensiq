"use strict";
// tests/unit/fortune-theme-golive.test.js — FIXED TEST SET "fortune-theme-golive" (owner decisions 92, 93, 94 of 2026-11-18: theme A
// with the gold line-art goes live, with a quick switch back, Vessavana hidden, reading pages = night band + light paper, deity names
// hidden on the site until the expert review). Written and locked (~/LENSIQ-field/evals/fortune-theme-golive/, sha256 in
// evals-locks/fortune-theme-golive.sha256) BEFORE any of it is built (branch fortune-theme, head 9ebbf57b). Static, synthetic.
//   1. switch: lensiq-config.js ships window.LENSIQ_FORTUNE_THEME = "a" (anything but "classic" means "a"); "classic" swaps the
//      fortune classes for html.lq-ft-classic on a fortune page, removes any entry screen, and leaves every other page alone;
//      every fortune-section page loads lensiq-config.js, so the switch reaches every page;
//   2. classic = the previous look exactly: every rule of the previous hub style (origin/main fortune.html, below) is in force in
//      classic (unchanged, or scoped to html.lq-ft-classic with the same declarations), no other unscoped hub rule exists, no
//      unscoped hub rule paints a palette A colour; every card keeps its previous emoji tile; fortune-theme.css adds nothing in
//      classic except hiding the new illustration slots;
//   3. Vessavana hidden: kept in DEITIES (data + art stay for the expert pack) with hidden: true, never eligible (site or local
//      preview) while hidden; no page, dictionary or other script names him or references his art;
//   4. deity names hidden on the site: NAMES_ON_SITE is false; showName() is false on the live site and in the local "site view"
//      preview (?ftpreview=2), true only in the local review preview (?ftpreview=1); previewMode() is local-only; the generic
//      label of the entry screen exists in TH / EN / ZH and names no deity; no deity name in any page's markup, the theme style
//      sheet or the dictionaries the menu pages use;
//   5. reading pages: html.lq-ft.lq-ft-read (menu pages html.lq-ft.lq-ft-menu, never both); fortune-theme.css paints the night band
//      (gradient #120F2E -> #2A1B55) and the light paper body (#F6F3EC) under html.lq-ft-read; body text tokens on the paper and on
//      the band meet WCAG AA (>= 4.5:1).
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const D = require(join(ROOT, "tools", "cat-data.cjs"));
const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
const FORTUNE_PAGES = [...new Set(FORT.pages.concat(["compat"]))];
const SECTION = FORTUNE_PAGES.concat(["cat-fortune"]);
const MENU = ["fortune", "cat-fortune"];
const READING = SECTION.filter(p => !MENU.includes(p));
const HTML = readdirSync(ROOT).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5)).sort();
const entry = () => { delete require.cache[require.resolve(join(ROOT, "fortune-entry.js"))]; return require(join(ROOT, "fortune-entry.js")); };
const PAL = ["#120F2E", "#2A1B55", "#E8C979", "#F5F1E8", "#BDB5DA", "#1E1844", "#2A2160", "#3B3170"];

function lum(hex) {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** a fake document: <html> class list, one optional entry element */
function fakeDoc(classes, withEntry) {
  const cls = new Set(classes);
  let ent = withEntry ? { removed: false, remove() { this.removed = true; ent = null; } } : null;
  const kept = ent;
  const html = {
    classList: { contains: c => cls.has(c), add: (...c) => c.forEach(x => cls.add(x)), remove: (...c) => c.forEach(x => cls.delete(x)),
      toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); } },
    hasAttribute: () => false, getAttribute: () => null, setAttribute() {}, removeAttribute() {}
  };
  const doc = { documentElement: html, readyState: "complete", getElementById: id => id === "lqFtEntry" ? ent : null,
    querySelector: s => /lqFtEntry/.test(s) ? ent : null, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ setAttribute() {}, appendChild() {} }) };
  return { doc, cls, entry: kept };
}
/** run lensiq-config.js like a page would (no location: page-specific helpers stay quiet) */
function runConfig(preset, doc) {
  const w = {};
  if (preset !== undefined) w.LENSIQ_FORTUNE_THEME = preset;
  w.window = w;
  const ctx = Object.assign(w, { document: doc, addEventListener() {} });
  vm.runInNewContext(read("lensiq-config.js"), ctx);
  return w;
}

test("1. switch: LENSIQ_FORTUNE_THEME ships \"a\"; \"classic\" swaps the fortune classes on fortune pages only; config on every fortune page", () => {
  assert.equal(runConfig(undefined, undefined).LENSIQ_FORTUNE_THEME, "a", "shipped value");
  assert.equal(runConfig("classic", undefined).LENSIQ_FORTUNE_THEME, "classic", "\"classic\" is kept");
  // a fortune menu page in classic: the theme classes go, html.lq-ft-classic comes, the entry screen is removed
  for (const start of [["lq-ft", "lq-ft-menu"], ["lq-ft", "lq-ft-read"], ["lq-ft", "lq-ft-menu", "lq-ft-entry"]]) {
    const f = fakeDoc(start, true);
    runConfig("classic", f.doc);
    assert.deepEqual([...f.cls].sort(), ["lq-ft-classic"], "classic on " + start.join(" ") + ": " + [...f.cls].join(" "));
    assert.ok(f.entry.removed, "classic removes the entry screen");
  }
  // theme "a" (default or any other value): nothing changes
  for (const v of [undefined, "a", "A", "bogus", ""]) {
    const f = fakeDoc(["lq-ft", "lq-ft-menu"], true);
    runConfig(v, f.doc);
    assert.deepEqual([...f.cls].sort(), ["lq-ft", "lq-ft-menu"], "theme " + v + " keeps the theme: " + [...f.cls].join(" "));
    assert.ok(!f.entry.removed, "theme " + v + " keeps the entry screen");
  }
  // a page outside the fortune section is never touched
  const other = fakeDoc(["x"], false);
  runConfig("classic", other.doc);
  assert.deepEqual([...other.cls], ["x"], "classic must not touch other pages");
  for (const p of SECTION) assert.match(read(p + ".html"), /<script src="lensiq-config\.js\?v=\d+"><\/script>/, p + ".html loads lensiq-config.js");
  // one ?v= for lensiq-config.js across the site
  const vers = new Set();
  for (const p of HTML) for (const m of read(p + ".html").matchAll(/lensiq-config\.js\?v=(\d+)/g)) vers.add(m[1]);
  assert.equal(vers.size, 1, "one ?v= for lensiq-config.js: " + [...vers]);
});

// the previous hub style, byte for byte from origin/main fortune.html (the first <style> block) at 2026-11-18
const OLD_HUB = String.raw`.ft{padding:0 0 80px}
.ft-hero{background:radial-gradient(circle at 20% 20%,rgba(103,79,242,.45),transparent 50%),radial-gradient(circle at 85% 70%,rgba(34,211,238,.25),transparent 55%),#0e1430;color:#fff;padding:56px 5vw 64px;text-align:center;position:relative;overflow:hidden}
.ft-hero h1{color:#fff;font-size:clamp(1.9rem,5vw,3rem);margin:8px 0 10px}
.ft-hero p{color:#c9d0ea;max-width:720px;margin:0 auto;font-size:1.02rem}
.ft-hero .eyebrow{color:#a99bff;letter-spacing:.25em;font-size:.78rem}
.stars{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1.5px 1.5px at 12% 30%,#fff8,transparent),radial-gradient(1px 1px at 72% 18%,#fff9,transparent),radial-gradient(1.5px 1.5px at 40% 80%,#fff7,transparent),radial-gradient(1px 1px at 88% 55%,#fffa,transparent),radial-gradient(1px 1px at 25% 65%,#fff6,transparent),radial-gradient(1.5px 1.5px at 58% 40%,#fff6,transparent)}
.ft-body{padding:32px 5vw 0;max-width:1200px;margin:auto}
.ft-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
.ft-card{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:22px;box-shadow:var(--shadow);color:inherit;text-decoration:none;transition:transform .15s,border-color .15s;min-height:220px}
.ft-card:hover,.ft-card:focus-visible{transform:translateY(-3px);border-color:var(--gold)}
.ft-ic{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#0e1430,#674ff2);color:#fff;font-size:1.6rem}
.ft-card h2{font-size:1.15rem;text-align:left;margin:0;color:var(--navy)}
.ft-card p{margin:0;color:var(--muted);font-size:.9rem}
.ft-card ul{margin:0;padding-left:18px;color:var(--muted);font-size:.84rem}
.ft-go{margin-top:auto;color:var(--gold);font-weight:600;font-size:.92rem}
.ft-note{margin-top:28px;background:#fff6e0;border:1px solid #f1d58a;color:#4d3900;border-radius:14px;padding:14px 16px;font-size:.9rem}
.ft-use{margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.ft-use div{background:var(--alt);border-radius:14px;padding:16px;font-size:.88rem;color:var(--muted)}
.ft-use b{display:block;color:var(--navy);margin-bottom:4px;font-size:.95rem}
.ft-new{position:absolute;top:14px;right:14px;background:#22d3ee;color:#0e1430;font-size:.75rem;font-weight:700;padding:2px 8px;border-radius:99px}
.ft-card{position:relative}
.ft-org{font-size:.75rem;color:var(--gold);font-weight:600;letter-spacing:.04em}
.ft-guide{margin:0 0 28px}
.ft-guide h2{font-size:1.2rem;color:var(--navy);margin:0 0 4px;text-align:left}
.ft-guide>p{color:var(--muted);font-size:.9rem;margin:0 0 12px}
.ft-goals{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}
.ft-goal{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-width:0}
.ft-goal b{display:block;color:var(--navy);margin-bottom:6px}
.ft-goal ul{list-style:none;margin:0;padding:0;display:grid;gap:0;font-size:.88rem}
.ft-goal a{color:#4b36d6;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;min-height:44px;padding-inline:9px;margin-inline:-9px}
.ft-goal small{color:var(--muted);font-size:.8rem}
@media (prefers-reduced-motion:reduce){.ft-card{transition:none}}`;
// the previous emoji tiles (origin/main fortune.html): "all readings" cards and the five lead cards
const OLD_FT_IC = { faceread: "👁️", palm: "✋", horoscope: "🌙", tarot: "🃏", fengshui: "🧭", numbers: "🔢", iching: "☯️", zodiac: "🐉", astro: "♌",
  dream: "🌙", bazi: "☯", taksa: "🪐", lek7: "7️⃣", lifegraph: "📈" };
const OLD_PD_IC = { faceread: "👁️", palm: "✋", tarot: "🃏", horoscope: "🌙", zodiac: "🐉" };

/** rules of a style sheet as [{media, sels: [..], decl}] (one level of @media / @supports) */
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0, media = "";
  const norm = s => s.replace(/\s+/g, " ").trim();
  while (i < src.length) {
    const open = src.indexOf("{", i), close = src.indexOf("}", i);
    if (close !== -1 && (open === -1 || close < open)) { media = ""; i = close + 1; continue; }
    if (open === -1) break;
    const head = norm(src.slice(i, open));
    if (head.startsWith("@media") || head.startsWith("@supports")) { media = head; i = open + 1; continue; }
    const end = src.indexOf("}", open);
    out.push({ media, sels: head.split(",").map(norm).filter(Boolean), decl: norm(src.slice(open + 1, end)) });
    i = end + 1;
  }
  return out;
}
const key = (media, sel, decl) => media + "|" + sel + "{" + decl + "}";

test("2. classic = the previous look: previous hub rules in force, nothing new unscoped, previous emoji tiles, theme CSS inert", () => {
  const html = read("fortune.html");
  const hubCss = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  assert.ok(hubCss, "fortune.html: the hub <style> block (no id)");
  const now = new Set(), unscoped = [];
  for (const r of rules(hubCss)) for (const s of r.sels) {
    now.add(key(r.media, s, r.decl));
    if (!/^html\.lq-ft/.test(s)) unscoped.push({ r, s });
  }
  const old = new Set();
  for (const r of rules(OLD_HUB)) for (const s of r.sels) {
    old.add(key(r.media, s, r.decl));
    const ok = now.has(key(r.media, s, r.decl)) || now.has(key(r.media, "html.lq-ft-classic " + s, r.decl));
    assert.ok(ok, `previous hub rule not in force in classic: ${r.media} ${s}{${r.decl}}`);
  }
  for (const { r, s } of unscoped) {
    assert.ok(old.has(key(r.media, s, r.decl)), `unscoped hub rule that the previous look did not have (scope it to html.lq-ft): ${r.media} ${s}{${r.decl}}`);
    for (const c of PAL) assert.ok(!r.decl.toUpperCase().includes(c), `unscoped hub rule paints palette A ${c}: ${s}`);
  }
  // cards keep their previous emoji tile (hidden in theme A, shown in classic)
  const grid = (html.match(/<div class="ft-grid">([\s\S]*?)\n\s*<\/div>/) || [])[1] || "";
  const cards = [...grid.matchAll(/<a class="ft-card" href="([a-z0-9-]+)\.html">([\s\S]*?)<\/a>/g)];
  assert.ok(cards.length >= 18, "hub cards: " + cards.length);
  for (const [, page, body] of cards) {
    const m = body.match(/<span class="ft-ic" aria-hidden="true">([^<]+)<\/span>/);
    assert.ok(m && m[1].trim(), page + ": emoji tile (.ft-ic) for classic");
    if (OLD_FT_IC[page]) assert.equal(m[1], OLD_FT_IC[page], page + ": the previous emoji");
  }
  for (const [page, ic] of Object.entries(OLD_PD_IC)) {
    const m = html.match(new RegExp(`<a class="pd-card" href="${page}\\.html">([\\s\\S]*?)</a>`));
    assert.ok(m, "lead card " + page);
    assert.ok(m[1].includes(`<span class="pd-ic" aria-hidden="true">${ic}</span>`), page + ": lead card keeps its previous emoji tile");
  }
  // fortune-theme.css in classic: only hides the new illustration slots
  const css = read("fortune-theme.css");
  const classic = rules(css).filter(r => r.sels.some(s => /^html\.lq-ft-classic\b/.test(s)));
  assert.ok(classic.length >= 1, "fortune-theme.css hides the illustration slots in classic");
  for (const r of classic) {
    for (const s of r.sels) assert.match(s, /^html\.lq-ft-classic (?:[.\w-]+ )*svg\.ft-ill$/, "classic rule may only target the illustration slot: " + s);
    assert.equal(r.decl.replace(/;$/, ""), "display:none", "classic rule may only hide: " + r.decl);
  }
  // the emoji tiles are hidden in theme A
  const hideIc = rules(css + hubCss).some(r => r.sels.some(s => /^html\.lq-ft(-menu)? (?:\.[\w-]+ )*\.ft-ic$/.test(s)) && /display:none/.test(r.decl));
  assert.ok(hideIc, "theme A hides the .ft-ic emoji tiles");
});

const V_NAMES = /เวสสุวรรณ|เวสสุวัณ|vessavana|vaisravana|vaiśravaṇa|vaishravana|kubera|毗沙门|毘沙門|多闻天|多聞天/i;

test("3. Vessavana: kept in data (hidden: true), never eligible while hidden, named nowhere else", () => {
  const E = entry();
  const v = E.DEITIES.find(d => d.id === "vessavana");
  assert.ok(v, "Vessavana stays in DEITIES (expert pack)");
  assert.equal(v.hidden, true, "Vessavana carries hidden: true");
  for (const preview of [false, true]) assert.ok(!E.eligible(E.DEITIES, preview).some(d => d.id === "vessavana"), "eligible (preview " + preview + ") includes Vessavana");
  assert.deepEqual(E.eligible([{ id: "x", status: "approved", hidden: true }, { id: "y", status: "approved" }], false).map(d => d.id), ["y"], "a hidden item is never eligible");
  assert.deepEqual(E.eligible([{ id: "x", status: "pending", hidden: true }], true), [], "hidden also in the local preview");
  assert.deepEqual(E.eligible([{ id: "x", status: "approved", hidden: false }], false).map(d => d.id), ["x"], "hidden: false unhides");
  for (const d of E.DEITIES.filter(d => d.id !== "vessavana")) assert.ok(!d.hidden, d.id + " is not hidden");
  const files = HTML.map(p => p + ".html").concat(readdirSync(join(ROOT, "i18n")).map(f => "i18n/" + f),
    readdirSync(ROOT).filter(f => /\.(js|css|json|cjs|mjs)$/.test(f) && f !== "fortune-entry.js"), ["tools/cat-data.cjs"]);
  for (const f of files) {
    const src = read(f);
    assert.ok(!V_NAMES.test(src), f + " names Vessavana");
    assert.ok(!src.includes("deity-vessavana"), f + " references Vessavana's art");
  }
});

test("4. deity names hidden on the site; local review preview only; generic label in TH / EN / ZH", () => {
  const E = entry();
  assert.equal(E.NAMES_ON_SITE, false, "NAMES_ON_SITE ships false");
  const loc = (protocol, hostname, search) => ({ protocol, hostname, search });
  assert.equal(E.previewMode(loc("https:", "anirut77.github.io", "?ftpreview=1")), 0, "never on the live site");
  assert.equal(E.previewMode(loc("https:", "anirut77.github.io", "?ftpreview=2")), 0);
  assert.equal(E.previewMode(loc("http:", "127.0.0.1", "")), 0);
  assert.equal(E.previewMode(loc("http:", "127.0.0.1", "?ftpreview=1")), 1);
  assert.equal(E.previewMode(loc("http:", "localhost", "?lang=en&ftpreview=2")), 2);
  assert.equal(E.previewMode(loc("file:", "", "?ftpreview=2")), 2);
  assert.equal(E.previewMode(loc("http:", "127.0.0.1", "?ftpreview=3")), 0);
  assert.equal(E.showName(0), false, "live site: no name");
  assert.equal(E.showName(2), false, "local site view: no name");
  assert.equal(E.showName(1), true, "local review preview: name for the reviewer");
  const names = E.DEITIES.flatMap(d => ["th", "en", "zh"].map(l => d.name[l]));
  for (const l of ["th", "en", "zh"]) {
    const t = E.LABEL && E.LABEL[l];
    assert.ok(typeof t === "string" && t.trim().length > 0, "generic entry label " + l);
    for (const n of names) assert.ok(!t.includes(n), `label ${l} names a deity: ${n}`);
  }
  // the theme's own surfaces: every page's markup, the theme style sheet and the dictionaries the menu pages use (other content,
  // e.g. a Merit place entry or the Thai "Brahma book" of compat, is not the theme and is out of scope here)
  const files = HTML.map(p => p + ".html").concat(["fortune-theme.css"],
    readdirSync(join(ROOT, "i18n")).filter(f => /^(en|zh)-(fortune|fortune-hub|common|cat)\.js$/.test(f)).map(f => "i18n/" + f));
  assert.ok(files.length > HTML.length + 4, "dictionaries found");
  for (const f of files) {
    const src = read(f);
    for (const n of names) assert.ok(!src.includes(n), `${f} contains the deity name "${n}"`);
  }
});

test("5. reading pages: html.lq-ft.lq-ft-read, night band + light paper in fortune-theme.css, AA contrast of the text tokens", () => {
  for (const p of SECTION) {
    const tag = (read(p + ".html").match(/<html\b[^>]*>/) || [""])[0];
    const cls = ((tag.match(/class="([^"]*)"/) || [])[1] || "").split(/\s+/);
    assert.ok(cls.includes("lq-ft"), p + ": lq-ft");
    if (MENU.includes(p)) assert.ok(cls.includes("lq-ft-menu") && !cls.includes("lq-ft-read"), p + ": menu page classes " + cls.join(" "));
    else assert.ok(cls.includes("lq-ft-read") && !cls.includes("lq-ft-menu"), p + ": reading page classes " + cls.join(" "));
  }
  assert.ok(READING.length >= 18, "reading pages: " + READING.length);
  const all = rules(read("fortune-theme.css"));
  const paper = all.filter(r => r.sels.includes("html.lq-ft-read body"));
  assert.ok(paper.some(r => /background(?:-color)?:[^;]*#F6F3EC/i.test(r.decl)), "html.lq-ft-read body paints the paper #F6F3EC");
  const band = all.filter(r => r.sels.some(s => /^html\.lq-ft-read (?:main )?\.(?:fk|fr|pl|hs|tr|nm|fs)-head$|^html\.lq-ft-read \.rp-hero$/.test(s)));
  assert.ok(band.some(r => /linear-gradient\(180deg,\s*var\(--ft1\),\s*var\(--ft2\)\)/.test(r.decl)), "html.lq-ft-read band: night gradient");
  // tokens: --ft1 / --ft2 are the palette A night colours
  const root = all.find(r => r.sels.includes("html.lq-ft") && /--ft1:/.test(r.decl));
  assert.ok(root && /--ft1:#120F2E/i.test(root.decl) && /--ft2:#2A1B55/i.test(root.decl), "night tokens");
  // body text on the paper (site tokens, styles.css) and the band text (palette A): WCAG AA >= 4.5:1
  const site = read("styles.css").match(/:root\{([\s\S]*?)\}/)[1];
  const tok = k => (site.match(new RegExp("--" + k + ":(#[0-9a-fA-F]{6})")) || [])[1];
  for (const k of ["text", "muted", "gold", "navy"]) {
    const c = tok(k);
    assert.ok(c, "styles.css --" + k);
    assert.ok(ratio(c, "#F6F3EC") >= 4.5, `--${k} ${c} on the paper: ${ratio(c, "#F6F3EC").toFixed(2)}`);
  }
  for (const t of ["#F5F1E8", "#BDB5DA", "#E8C979"]) for (const s of ["#120F2E", "#2A1B55"])
    assert.ok(ratio(t, s) >= 4.5, `${t} on the band ${s}: ${ratio(t, s).toFixed(2)}`);
});

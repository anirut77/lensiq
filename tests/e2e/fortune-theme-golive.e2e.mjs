// tests/e2e/fortune-theme-golive.e2e.mjs — FIXED TEST SET "fortune-theme-golive" (owner decisions 92, 93, 94 of 2026-11-18). Written and
// locked (~/LENSIQ-field/evals/fortune-theme-golive/, evals-locks/fortune-theme-golive.sha256) BEFORE any of it is built (branch
// fortune-theme, head 9ebbf57b). Rendered, headless Chrome, synthetic.
//   G1 switch back: with window.LENSIQ_FORTUNE_THEME = "classic" every fortune-section page (compat included) shows the previous
//      look: no lq-ft / lq-ft-menu / lq-ft-read class, html.lq-ft-classic, not the theme font, no request for the theme art; on
//      fortune.html the previous dark hero (#0e1430), white cards with the emoji tile showing and no illustration slot; the previous
//      page background (#f5f7fc) on the menu pages and on the reading pages, no night band; even with the local preview flag no
//      entry screen and no deity image. Theme "a" (shipped): the emoji tiles are hidden.
//   G2 Vessavana hidden: in the local preview (?ftpreview=1, also with &deity=vessavana) over many new visits he is never shown
//      and his image is never requested; the menu pages in TH / EN / ZH carry none of his names in their HTML or text.
//   G3 deity names hidden on the site: the local "site view" (?ftpreview=2, every item treated as approved, rendered as on the
//      live site) shows the drawing and the blessing line but no name (no name element, no name in its text or aria-label) in
//      TH / EN / ZH, on fortune.html and cat-fortune.html; without any flag the menu pages carry no deity name in any language.
//   G4 reading pages (every fortune page except the menu, 393 px): html.lq-ft-read, the title band painted with the night
//      gradient (#120F2E), the body on light paper (#F6F3EC); WCAG AA for every visible text on the page in TH / EN / ZH
//      (>= 4.5:1, >= 3:1 for large text: >= 24 px, or >= 18.66 px bold); gradients judged at their worst stop.
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./cdp.mjs";

const require = createRequire(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = JSON.stringify;
const LANGS = ["th", "en", "zh"];
const DEITY_RE = /\/art\/fortune\/deity-[a-z]+\.svg/;
const ART_RE = /\/art\/fortune\//;
const CLASSIC = `window.LENSIQ_FORTUNE_THEME = "classic";`;
const V_NAMES = /เวสสุวรรณ|vessavana|vaisravana|毗沙门|毘沙門|多闻天/i;

const ENTRY = `(() => { const e = document.getElementById("lqFtEntry");
  if (!e || e.hidden) return { shown: false };
  const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return { shown: false };
  const t = s => { const x = e.querySelector(s); return x ? x.textContent.trim() : ""; };
  return { shown: true, id: e.getAttribute("data-deity"), nameEl: !!e.querySelector(".ft-entry-nm"), name: t(".ft-entry-nm"), bless: t(".ft-entry-bl"),
    label: e.getAttribute("aria-label") || "", text: e.textContent };
})()`;

/** every visible text on the page against what is behind it; AA: 4.5:1, 3:1 for large text */
const CONTRAST = `(() => {
  const parse = c => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => { const v = c.slice(0, 3).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function bgs(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage || "none";
      if (/url\\(/.test(img)) return null;
      if (/gradient/.test(img)) {
        const stops = (img.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean).filter(s => s[3] > 0.2);
        const base = parse(cs.backgroundColor) || [255, 255, 255, 0];
        const under = base[3] >= 1 ? base : [255, 255, 255, 1];
        if (stops.length) return stops.map(s => layers.reduceRight((acc, l) => over(l, acc), s[3] < 1 ? over(s, under) : s));
      }
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { if (c[3] >= 1) return [layers.reduceRight((acc, l) => over(l, acc), c)]; layers.push(c); }
    }
    return [layers.reduceRight((acc, l) => over(l, acc), [255, 255, 255, 1])];
  }
  const SKIP = "[hidden], [aria-hidden=true], svg, script, style, noscript, template, option, canvas, video";
  const vis = el => { if (el.closest(SKIP)) return false;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility !== "visible" || +cs.opacity < 0.1) return false;
    for (let a = el; a; a = a.parentElement) if (+getComputedStyle(a).opacity < 0.1) return false;
    if (el.matches(":disabled, [aria-disabled=true]")) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const bad = []; let n = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const own = [...el.childNodes].some(t => t.nodeType === 3 && /[\\p{L}\\p{N}]/u.test(t.textContent));
    if (!own || !vis(el)) continue;
    const b = bgs(el); if (!b) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) continue;
    n++;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const worst = Math.min(...b.map(bg => ratio(fg[3] < 1 ? over(fg, bg) : fg, bg)));
    if (worst < need) bad.push(worst.toFixed(2) + "<" + need + " " + el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + " '" + el.textContent.trim().slice(0, 30) + "' fg " + cs.color);
  }
  return { n, bad: bad.slice(0, 12), count: bad.length };
})()`;

export default async function ({ base, launch, check, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
  const PAGES = [...new Set(FORT.pages.concat(["compat"]))];
  const READING = PAGES.filter(p => p !== "fortune");
  const E = require(join(repo, "fortune-entry.js"));
  const NAMES = E.DEITIES.flatMap(d => LANGS.map(l => d.name[l]));
  const browser = await launch();

  async function tab({ width = 393, init = [] } = {}) {
    const page = await browser.newPage(null, { isolated: true, initScripts: init });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    return page;
  }
  const url = (file, q = "") => `${base}/${file}?nosw&cpu${q ? "&" + q : ""}`;
  const ready = page => page.waitFor(`document.readyState === "complete" && !!window.LQI18N`, 20000);
  async function open(page, file, q) { await page.goto(url(file, q)); await ready(page); }
  async function follow(page, file, q) {
    await page.evaluate(`location.href = ${S(url(file, q))}`);
    await page.waitFor(`location.pathname.endsWith(${S("/" + file)}) && document.readyState === "complete" && !!window.LQI18N`, 20000);
  }
  const waitShown = (page, ms = 2500) => page.waitFor(`(${ENTRY}).shown && ${ENTRY}`, ms);
  async function staysHidden(page, ms = 1800) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const r = await page.evaluate(ENTRY); assert(!r.shown, "entry shown: " + S(r)); await sleep(150); }
  }

  try {
    await check("G1 switch back: LENSIQ_FORTUNE_THEME = \"classic\" restores the previous look on every fortune-section page", async () => {
      const bad = [];
      const page = await tab({ init: [CLASSIC] });
      for (const p of PAGES.concat(["cat-fortune"])) {
        const before = page.requests.length;
        await open(page, p + ".html");
        await sleep(300);
        const r = await page.evaluate(() => {
          const h = document.documentElement, cs = e => e ? getComputedStyle(e) : null;
          const head = document.querySelector("main [class$='-head'], main .rp-hero, [class$='-head']");
          return { cls: h.className, font: cs(document.querySelector("h1") || document.body).fontFamily, body: cs(document.body).backgroundColor,
            head: head ? cs(head).backgroundImage : null,
            ills: [...document.querySelectorAll("svg.ft-ill")].filter(s => cs(s).display !== "none").length };
        });
        const art = page.requests.slice(before).filter(x => ART_RE.test(x.url)).map(x => x.url);
        if (/\blq-ft(-menu|-read)?\b(?!-)/.test(r.cls.replace(/lq-ft-classic/g, "")) || !/\blq-ft-classic\b/.test(r.cls)) bad.push(`${p}: classes "${r.cls}"`);
        if (/^"?LQft"?/.test(r.font)) bad.push(`${p}: theme font in classic (${r.font})`);
        if (r.body !== "rgb(245, 247, 252)") bad.push(`${p}: page background ${r.body}, want the previous rgb(245, 247, 252)`);
        if (r.head && /rgb\(18, 15, 46\)/.test(r.head)) bad.push(`${p}: night band in classic`);
        if (r.ills) bad.push(`${p}: ${r.ills} illustration slot(s) showing in classic`);
        if (art.length) bad.push(`${p}: theme art requested in classic: ${art.join(" ")}`);
      }
      await open(page, "fortune.html");
      const hub = await page.evaluate(() => {
        const cs = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
        const ic = document.querySelector(".ft-grid .ft-card .ft-ic");
        return { hero: cs(".ft-hero").backgroundColor, card: cs(".ft-grid .ft-card").backgroundColor,
          ic: ic ? { d: getComputedStyle(ic).display, w: Math.round(ic.getBoundingClientRect().width), t: ic.textContent.trim() } : null,
          pdIc: [...document.querySelectorAll(".pd-card .pd-ic")].filter(e => getComputedStyle(e).display !== "none").length };
      });
      if (hub.hero !== "rgb(14, 20, 48)") bad.push("fortune.html: hero " + hub.hero + ", want the previous rgb(14, 20, 48)");
      if (hub.card !== "rgb(255, 255, 255)") bad.push("fortune.html: card " + hub.card + ", want white");
      if (!hub.ic || hub.ic.d === "none" || hub.ic.w !== 54 || !hub.ic.t) bad.push("fortune.html: emoji tile " + S(hub.ic));
      if (hub.pdIc < 5) bad.push("fortune.html: lead emoji tiles showing " + hub.pdIc);
      await page.close();
      // classic + the local preview flag: still no entry screen, no deity image
      for (const p of ["fortune", "cat-fortune"]) {
        const pg = await tab({ init: [CLASSIC] });
        await open(pg, "index.html");
        await follow(pg, p + ".html", "ftpreview=1");
        await staysHidden(pg, 2000);
        const n = pg.requests.filter(x => DEITY_RE.test(x.url)).length;
        if (n) bad.push(`${p}: classic + preview requested ${n} deity image(s)`);
        await pg.close();
      }
      // theme "a" (shipped): the emoji tiles are hidden, the theme is on
      const a = await tab();
      await open(a, "fortune.html");
      const r = await a.evaluate(() => ({ cls: document.documentElement.className,
        ic: [...document.querySelectorAll(".ft-ic, .pd-ic")].filter(e => getComputedStyle(e).display !== "none").length }));
      if (!/\blq-ft\b/.test(r.cls) || /lq-ft-classic/.test(r.cls) || r.ic) bad.push("theme a: " + S(r));
      await a.close();
      assert(!bad.length, bad.join("\n"));
    });

    await check("G2 Vessavana hidden: never shown or requested in the local preview; named nowhere on the menu pages (TH / EN / ZH)", async () => {
      const bad = [], seen = new Set();
      for (let i = 0; i < 10; i++) {
        const page = await tab();
        await open(page, "fortune.html", "ftpreview=1&hold=1" + (i < 3 ? "&deity=vessavana" : ""));
        const r = await waitShown(page);
        seen.add(r.id);
        if (r.id === "vessavana" || V_NAMES.test(r.text + " " + r.label)) bad.push("visit " + i + ": Vessavana shown " + S(r));
        if (page.requests.some(x => /deity-vessavana/.test(x.url))) bad.push("visit " + i + ": Vessavana's image requested");
        await page.close();
      }
      if (seen.size < 2) bad.push("the preview showed only " + [...seen] + " (selection broken)");
      for (const p of ["fortune", "cat-fortune"]) for (const lang of LANGS) {
        const page = await tab();
        await open(page, p + ".html", "lang=" + lang);
        await page.waitFor(`LQI18N.lang === ${S(lang)}`, 10000); await sleep(300);
        const t = await page.evaluate(() => document.documentElement.outerHTML + "\n" + document.body.innerText);
        if (V_NAMES.test(t)) bad.push(`${p} ${lang}: names Vessavana`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("G3 deity names hidden on the site: site view shows drawing + blessing, never a name (TH / EN / ZH); menu pages carry no name", async () => {
      const bad = [];
      for (const p of ["fortune", "cat-fortune"]) for (const lang of LANGS) {
        const page = await tab();
        await open(page, p + ".html", "ftpreview=2&hold=1&lang=" + lang);
        const r = await waitShown(page);
        const d = E.DEITIES.find(x => x.id === r.id);
        if (!d) bad.push(`${p} ${lang}: unknown deity ${r.id}`);
        else if (r.bless !== d.bless[lang]) bad.push(`${p} ${lang}: blessing "${r.bless}", want "${d.bless[lang]}"`);
        if (r.nameEl && r.name) bad.push(`${p} ${lang}: name element "${r.name}"`);
        for (const n of NAMES) if ((r.text + " " + r.label).includes(n)) bad.push(`${p} ${lang}: the entry screen names "${n}"`);
        if (r.id === "vessavana") bad.push(`${p} ${lang}: Vessavana in the site view`);
        if (!page.requests.some(x => DEITY_RE.test(x.url))) bad.push(`${p} ${lang}: the drawing was not requested`);
        await page.close();
      }
      for (const p of ["fortune", "cat-fortune"]) for (const lang of LANGS) {
        const page = await tab();
        await open(page, p + ".html", "lang=" + lang);
        await page.waitFor(`LQI18N.lang === ${S(lang)}`, 10000); await sleep(300);
        const t = await page.evaluate(() => document.documentElement.outerHTML + "\n" + document.body.innerText);
        for (const n of NAMES) if (t.includes(n)) bad.push(`${p} ${lang}: page carries the deity name "${n}"`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("G4 reading pages: night band + light paper; WCAG AA for every visible text (TH / EN / ZH, 393 px)", async () => {
      const bad = [];
      for (const p of READING) for (const lang of LANGS) {
        const page = await tab();
        try {
          await open(page, p + ".html", "lang=" + lang);
          await page.waitFor(`LQI18N.lang === ${S(lang)}`, 10000); await sleep(500);
          const r = await page.evaluate(() => {
            const h = document.documentElement;
            const band = [...document.querySelectorAll("[class*='-head'], .rp-hero")].find(e => /(^|\s)(fk|fr|pl|hs|tr|nm|fs)-head(\s|$)|(^|\s)rp-hero(\s|$)/.test(e.className));
            return { read: h.classList.contains("lq-ft-read") && h.classList.contains("lq-ft"), body: getComputedStyle(document.body).backgroundColor,
              band: band ? getComputedStyle(band).backgroundImage : "(no band element)" };
          });
          if (!r.read) bad.push(`${p} ${lang}: html is not lq-ft lq-ft-read`);
          if (r.body !== "rgb(246, 243, 236)") bad.push(`${p} ${lang}: body ${r.body}, want the paper rgb(246, 243, 236)`);
          if (!/gradient/.test(r.band) || !/rgb\(18, 15, 46\)/.test(r.band)) bad.push(`${p} ${lang}: band ${r.band.slice(0, 80)}`);
          const c = await page.evaluate(CONTRAST);
          if (c.n < 5) bad.push(`${p} ${lang}: only ${c.n} texts judged`);
          if (c.count) bad.push(`${p} ${lang} (${c.count}): ${c.bad.join(" | ")}`);
        } catch (err) { bad.push(`${p} ${lang}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
    });
  } finally { await browser.close(); }
}

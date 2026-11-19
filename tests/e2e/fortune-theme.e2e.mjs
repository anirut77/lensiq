// tests/e2e/fortune-theme.e2e.mjs — fortune theme "ราตรีคราม" (owner approval 2026-11-17: direction A + gold line-art style).
// FIXED TEST: written and locked (~/LENSIQ-field/evals/fortune-theme/, sha256 in evals-locks/fortune-theme.sha256) BEFORE the
// theme is wired into any page (branch fortune-theme, base origin/main 9f977dd). Rendered, headless Chrome, synthetic.
//   T1 theme only in the fortune section: every fortune page (compat included) and cat-fortune.html at 393 px carry
//      html.lq-ft, load fortune-theme.css and set the theme font; other pages load none of the theme files;
//   T2 contrast >= 4.5:1 (WCAG 2.1): every visible text on the two menu pages (TH / EN / ZH, 393 px); on the reading pages
//      (TH, 393 px) every text that sits on a surface the theme paints (page background, gradient band, palette A surface);
//      gradients are judged at their worst stop;
//   T3 entry screen, nothing approved (the shipped state): never shown, no deity image requested (fortune.html, cat-fortune.html);
//   T4 entry screen with the local preview flag (?ftpreview=1, 127.0.0.1 only): shown with a name and a blessing line in
//      TH / EN / ZH, the image requested once, nothing to press or buy on it, gone by itself; once per visit (reload, a move
//      inside the section, back to the menu from a reading: not again; entering the section again from outside: again,
//      with a different deity); not on a reading page;
//   T5 skip: tap, Esc, Enter and Space each close it at once;
//   T6 prefers-reduced-motion: shown without any transition, closes by itself;
//   T7 crisis / calm (the signals of fortune-crisis.js): calm session flag, html[data-lq-crisis], html[data-lq-calm], and the
//      real flow (crisis text on tarot.html -> support card -> fortune.html): never shown, no deity image requested;
//   T8 menu cards: every card has its illustration once in view; no overflow at 360 / 393 / 430 px in TH / EN / ZH; the
//      pressed state paints the pressed colour (#2A2160).
// Amendment 1 (2026-11-17, append-only re-lock): T7's attribute cases set the attribute when <html> is created (the init
// script ran before it existed and set nothing); T8's pressed check scrolls instantly (the site scrolls smoothly, so the
// point was taken before the card arrived). No expectation changed.
// Amendment 2 (2026-11-18, append-only re-lock): T7's real crisis flow waited for the support card (.fa-support), which crisis v3
// (owner decision 2026-11-17, now on main) removed; it now waits for the calm session flag the crisis net sets. The assertions
// (calm flag set, entry never shown, no deity image) are unchanged.
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./cdp.mjs";

const require = createRequire(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = JSON.stringify;
const LANGS = ["th", "en", "zh"];
const PRESSED = "rgb(42, 33, 96)";
const DEITY_RE = /\/art\/fortune\/deity-[a-z]+\.svg/;
const THEME_RE = /fortune-theme\.css|fortune-entry\.js|\/art\/fortune\//;
const OTHER = ["index", "solutions", "cat-hr", "cat-security", "gate", "exam", "about", "pricing", "help", "privacy"];
const CRISIS_TH = "อยากตายจริงๆ";
// amendment 1 (2026-11-17): an init script runs before <html> exists, so the attribute is set the moment the element is
// created (before any page script), instead of on a null documentElement (which threw and set nothing)
const ATTR = a => `(() => { const set = () => { if (!document.documentElement) return false; document.documentElement.setAttribute(${JSON.stringify(a)}, "1"); return true; };
  if (!set()) new MutationObserver((m, o) => { if (set()) o.disconnect(); }).observe(document, { childList: true }); })();`;

/** in the page: is the entry overlay showing, and what it shows */
const ENTRY = `(() => { const e = document.getElementById("lqFtEntry");
  if (!e || e.hidden) return { shown: false };
  const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return { shown: false };
  const t = s => { const x = e.querySelector(s); return x ? x.textContent.trim() : ""; };
  return { shown: true, id: e.getAttribute("data-deity"), name: t(".ft-entry-nm"), bless: t(".ft-entry-bl"), skip: t(".ft-entry-skip"),
    controls: e.querySelectorAll("a, button, input, select, textarea, [role=button]").length, text: e.textContent,
    tr: [e, e.querySelector(".ft-entry-img"), e.querySelector(".ft-entry-nm")].filter(Boolean).map(x => getComputedStyle(x).transitionDuration) };
})()`;

/** in the page: text contrast. all = every visible text; else only text whose background is painted by the theme
 *  (resolution reaches <body> / <html>, a gradient, or a palette A surface) */
const CONTRAST = all => `(() => {
  const PAL = ["rgb(18, 15, 46)", "rgb(42, 27, 85)", "rgb(30, 24, 68)", "rgb(42, 33, 96)"];
  const parse = c => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (a, b) => [0, 1, 2].map(i => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
  const lum = c => { const v = c.slice(0, 3).map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** background candidates behind el: [{rgb, themed, image}] */
  function bgs(el) {
    let layers = [], n = el;
    for (; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage || "none";
      if (/url\\(/.test(img)) return null; // a picture behind the text: not judged here
      if (/gradient/.test(img)) {
        const stops = (img.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(Boolean);
        const base = parse(cs.backgroundColor) || [255, 255, 255, 0];
        const under = base[3] >= 1 ? base : [255, 255, 255, 1];
        if (stops.length) return { cands: stops.map(s => layers.reduceRight((acc, l) => over(l, acc), s[3] < 1 ? over(s, under) : s)), themed: true, at: n };
      }
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        if (c[3] >= 1) return { cands: [layers.reduceRight((acc, l) => over(l, acc), c)], themed: n === document.body || n === document.documentElement || PAL.includes(cs.backgroundColor), at: n };
        layers.push(c);
      }
    }
    const root = [255, 255, 255, 1];
    return { cands: [layers.reduceRight((acc, l) => over(l, acc), root)], themed: true, at: null };
  }
  const SKIP = "[hidden], [aria-hidden=true], svg, script, style, noscript, template, option, .lq-skip-contrast";
  const vis = el => { if (el.closest(SKIP)) return false;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility !== "visible" || +cs.opacity < 0.1) return false;
    for (let a = el; a; a = a.parentElement) if (+getComputedStyle(a).opacity < 0.1) return false;
    if (el.matches(":disabled, [aria-disabled=true]")) return false;
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const bad = [];
  let n = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const own = [...el.childNodes].some(t => t.nodeType === 3 && /[\\p{L}\\p{N}]/u.test(t.textContent));
    if (!own || !vis(el)) continue;
    const b = bgs(el); if (!b) continue;
    if (!${all} && !b.themed) continue;
    const fg = parse(getComputedStyle(el).color); if (!fg) continue;
    n++;
    const worst = Math.min(...b.cands.map(bg => ratio(fg[3] < 1 ? over(fg, bg) : fg, bg)));
    const who = el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0];
    if (worst < 4.5) bad.push(worst.toFixed(2) + " " + who + " '" + el.textContent.trim().slice(0, 30) + "' fg " + getComputedStyle(el).color);
  }
  return { n, bad: bad.slice(0, 15), count: bad.length };
})()`;

export default async function ({ base, launch, check, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
  const PAGES = [...new Set(FORT.pages.concat(["compat"]))];
  const READING = PAGES.filter(p => p !== "fortune");
  const E = require(join(repo, "fortune-entry.js"));
  const NAMES = Object.fromEntries(LANGS.map(l => [l, E.DEITIES.map(d => d.name[l])]));
  const browser = await launch();

  /** a fresh tab with its own storage; width in CSS px; opts.reduce = prefers-reduced-motion */
  async function tab({ width = 393, reduce = false, init = [] } = {}) {
    const page = await browser.newPage(null, { isolated: true, initScripts: init });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    if (reduce) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    return page;
  }
  const url = (file, q = "") => `${base}/${file}?nosw&cpu${q ? "&" + q : ""}`;
  const ready = page => page.waitFor(`document.readyState === "complete" && !!window.LQI18N`, 20000);
  async function open(page, file, q) { await page.goto(url(file, q)); await ready(page); }
  /** navigate like a link (keeps the referrer) */
  async function follow(page, file, q) {
    await page.evaluate(`location.href = ${S(url(file, q))}`);
    await page.waitFor(`location.pathname.endsWith(${S("/" + file)}) && document.readyState === "complete" && !!window.LQI18N`, 20000);
  }
  const deityReqs = page => page.requests.filter(r => DEITY_RE.test(r.url)).length;
  async function waitShown(page, ms = 1500) { return page.waitFor(`(${ENTRY}).shown && ${ENTRY}`, ms); }
  async function staysHidden(page, ms = 1800) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const r = await page.evaluate(ENTRY); assert(!r.shown, "entry shown: " + S(r)); await sleep(150); }
  }
  async function waitGone(page, ms) { await page.waitFor(`!(${ENTRY}).shown`, ms); }

  try {
    await check("T1 theme only in the fortune section (393 px, TH)", async () => {
      const page = await tab();
      for (const p of PAGES.concat(["cat-fortune"])) {
        const before = page.requests.length;
        await open(page, p + ".html");
        const r = await page.evaluate(() => ({ cls: document.documentElement.classList.contains("lq-ft"),
          font: getComputedStyle(document.querySelector("h1") || document.body).fontFamily }));
        const css = page.requests.slice(before).some(x => /fortune-theme\.css/.test(x.url));
        assert(r.cls && css, `${p}: lq-ft ${r.cls}, fortune-theme.css requested ${css}`);
        assert(/^"?LQft"?/.test(r.font), `${p}: theme font, got ${r.font}`);
      }
      for (const p of OTHER) {
        const before = page.requests.length;
        await open(page, p + ".html");
        const cls = await page.evaluate(() => document.documentElement.classList.contains("lq-ft"));
        const hits = page.requests.slice(before).filter(x => THEME_RE.test(x.url)).map(x => x.url);
        assert(!cls && !hits.length, `${p}: theme leaked: class ${cls}, requests ${hits.join(" ")}`);
      }
      await page.close();
    });

    await check("T2 contrast >= 4.5:1: menu pages every text (TH / EN / ZH); reading pages every themed surface (TH)", async () => {
      const bad = [];
      for (const p of ["fortune", "cat-fortune"]) for (const lang of LANGS) {
        const page = await tab();
        await open(page, p + ".html", "lang=" + lang);
        await page.waitFor(`LQI18N.lang === ${S(lang)}`, 10000); await sleep(500);
        const r = await page.evaluate(CONTRAST(true));
        assert(r.n > 20, `${p} ${lang}: only ${r.n} text elements judged`);
        if (r.count) bad.push(`${p} ${lang} (${r.count}): ${r.bad.join(" | ")}`);
        await page.close();
      }
      for (const p of READING) {
        const page = await tab();
        await open(page, p + ".html"); await sleep(500);
        const r = await page.evaluate(CONTRAST(false));
        if (r.count) bad.push(`${p} th (${r.count}): ${r.bad.join(" | ")}`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("T3 nothing approved (shipped state): no entry screen, no deity image (fortune.html, cat-fortune.html)", async () => {
      for (const p of ["fortune", "cat-fortune"]) {
        const page = await tab();
        await open(page, p + ".html");
        await staysHidden(page, 2200);
        assert(deityReqs(page) === 0, p + ": deity image requested while nothing is approved");
        await page.close();
      }
    });

    await check("T4 preview flag: shown once per visit with name + blessing, no controls, gone by itself, new deity on a new visit", async () => {
      const page = await tab();
      await open(page, "index.html");
      await follow(page, "fortune.html", "ftpreview=1");
      const a = await waitShown(page);
      assert(NAMES.th.includes(a.name) && a.bless.length > 0 && a.skip.length > 0, "TH entry content " + S(a));
      assert(a.controls === 0 && !/฿|\d/.test(a.text), "nothing to press or buy on the entry screen: " + S(a));
      assert(deityReqs(page) === 1, "deity image requested once: " + deityReqs(page));
      await waitGone(page, 3200);
      const menu = await page.evaluate(() => { const g = document.querySelector(".ft-grid"); return !!g && g.getBoundingClientRect().height > 0; });
      assert(menu, "menu visible after the entry");
      // same visit: reload, move inside the section, back from a reading -> not again, no image request
      const n0 = deityReqs(page);
      await page.reload(); await ready(page); await staysHidden(page, 1200);
      await follow(page, "cat-fortune.html", "ftpreview=1"); await staysHidden(page, 1200);
      await follow(page, "tarot.html", "ftpreview=1"); await staysHidden(page, 800);
      await follow(page, "fortune.html", "ftpreview=1"); await staysHidden(page, 1200);
      assert(deityReqs(page) === n0, "no deity image request within the same visit");
      // a new visit (from another category): shown again, with a different deity
      await follow(page, "cat-hr.html");
      await follow(page, "fortune.html", "ftpreview=1");
      const b = await waitShown(page);
      assert(b.id && b.id !== a.id, `a different deity on the next visit: ${a.id} then ${b.id}`);
      await waitGone(page, 3200);
      await follow(page, "index.html");
      await follow(page, "cat-fortune.html", "ftpreview=1");
      const c = await waitShown(page);
      assert(c.id && c.id !== b.id, `different again: ${b.id} then ${c.id}`);
      await page.close();
      // EN / ZH names and lines; a reading page never shows it
      for (const lang of ["en", "zh"]) {
        const pg = await tab();
        await open(pg, "fortune.html", "ftpreview=1&lang=" + lang);
        const r = await waitShown(pg, 2500);
        const d = E.DEITIES.find(x => x.id === r.id);
        assert(d && r.name === d.name[lang] && r.bless === d.bless[lang] && r.skip === E.SKIP[lang], `${lang}: ${S(r)}`);
        await pg.close();
      }
      const rp = await tab();
      await open(rp, "tarot.html", "ftpreview=1");
      await staysHidden(rp, 1500);
      assert(deityReqs(rp) === 0, "tarot.html requested a deity image");
      await rp.close();
    });

    await check("T5 skip: tap, Esc, Enter and Space close it at once", async () => {
      const ways = {
        tap: async p => { for (const type of ["mousePressed", "mouseReleased"]) await p.send("Input.dispatchMouseEvent", { type, x: 196, y: 420, button: "left", clickCount: 1 }); },
        Escape: p => key(p, "Escape", "Escape", 27), Enter: p => key(p, "Enter", "Enter", 13), Space: p => key(p, " ", "Space", 32)
      };
      async function key(p, k, code, vk) {
        await p.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text: k === "Enter" ? "\r" : k === " " ? " " : undefined });
        await p.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
      }
      for (const [name, act] of Object.entries(ways)) {
        const page = await tab();
        await open(page, "fortune.html", "ftpreview=1&hold=1");
        await waitShown(page);
        const t0 = Date.now();
        await act(page);
        await waitGone(page, 700);
        assert(Date.now() - t0 < 900, name + ": took " + (Date.now() - t0) + " ms");
        assert(await page.evaluate(() => location.pathname.endsWith("/fortune.html")), name + ": stayed on the menu");
        await page.close();
      }
    });

    await check("T6 prefers-reduced-motion: no transition, closes by itself", async () => {
      const page = await tab({ reduce: true });
      await open(page, "fortune.html", "ftpreview=1");
      const r = await waitShown(page);
      assert(r.tr.length >= 2 && r.tr.every(d => d.split(",").every(x => parseFloat(x) === 0)), "transitions under reduced motion: " + S(r.tr));
      await waitGone(page, 2600);
      await page.close();
    });

    await check("T7 crisis / calm: never shown, no deity image (flags and the real crisis flow)", async () => {
      const inits = {
        calm: `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`,
        crisisAttr: ATTR("data-lq-crisis"),
        calmAttr: ATTR("data-lq-calm")
      };
      for (const [name, init] of Object.entries(inits)) for (const p of ["fortune", "cat-fortune"]) {
        const page = await tab({ init: [init] });
        await open(page, p + ".html", "ftpreview=1");
        await staysHidden(page, 1800);
        assert(deityReqs(page) === 0, `${name} ${p}: deity image requested`);
        await page.close();
      }
      const page = await tab();
      await open(page, "tarot.html");
      await page.waitFor(() => !!document.getElementById("trQuestion") && !!document.getElementById("trStart"), 15000);
      await page.evaluate(q => { document.getElementById("trQuestion").value = q; document.getElementById("trStart").click(); }, CRISIS_TH);
      // amendment 2 (2026-11-18): crisis v3 (owner decision 2026-11-17, merged on main) removed the support card; the reading goes on
      // and the session carries the calm flag, which is the signal the entry screen reads. Wait for that flag instead of the card.
      await page.waitFor(() => { try { return sessionStorage.getItem("lq-fortune-calm") === "1"; } catch (e) { return false; } }, 15000);
      assert(await page.evaluate(() => sessionStorage.getItem("lq-fortune-calm")) === "1", "crisis flow set the calm session flag");
      await follow(page, "fortune.html", "ftpreview=1");
      await staysHidden(page, 1800);
      await follow(page, "cat-hr.html");
      await follow(page, "cat-fortune.html", "ftpreview=1");
      await staysHidden(page, 1800);
      assert(deityReqs(page) === 0, "crisis flow: deity image requested");
      await page.close();
    });

    await check("T8 menu cards: illustration in view, no overflow at 360 / 393 / 430 (TH / EN / ZH), pressed colour", async () => {
      const SCAN = `(async () => {
        const out = { cards: 0, missing: [], overflow: [], docW: document.documentElement.scrollWidth, vw: innerWidth };
        const cards = [...document.querySelectorAll(".ft-grid .ft-card, .cat-grid .cat-tool")];
        out.cards = cards.length;
        for (const c of cards) {
          c.scrollIntoView({ block: "center" });
          const svg = c.querySelector("svg.ft-ill");
          let ok = false;
          for (let i = 0; i < 40 && !ok; i++) { const u = svg && svg.querySelector("use"); try { ok = !!u && u.getBBox().width > 0; } catch (e) { ok = false; }
            if (!ok) await new Promise(r => setTimeout(r, 75)); }
          if (!ok) out.missing.push(c.getAttribute("href") || c.getAttribute("data-page"));
          const cr = c.getBoundingClientRect();
          for (const e of c.querySelectorAll("*")) { const r = e.getBoundingClientRect(); if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1))
            out.overflow.push((c.getAttribute("href") || c.getAttribute("data-page")) + " " + e.tagName + "." + e.className); }
        }
        return out; })()`;
      const bad = [];
      for (const width of [360, 393, 430]) for (const lang of LANGS) for (const p of ["fortune", "cat-fortune"]) {
        const page = await tab({ width });
        await open(page, p + ".html", "lang=" + lang);
        await page.waitFor(`LQI18N.lang === ${S(lang)}`, 10000); await sleep(300);
        const r = await page.evaluate(SCAN);
        const want = p === "fortune" ? READING.length : FORT.pages.length;
        if (r.cards < want) bad.push(`${p} ${width} ${lang}: ${r.cards} cards < ${want}`);
        if (r.missing.length) bad.push(`${p} ${width} ${lang}: no illustration: ${r.missing.join(", ")}`);
        if (r.overflow.length) bad.push(`${p} ${width} ${lang}: overflow: ${r.overflow.slice(0, 5).join(", ")}`);
        if (r.docW > r.vw) bad.push(`${p} ${width} ${lang}: page ${r.docW} px wide > ${r.vw}`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
      for (const [p, sel] of [["fortune", ".ft-grid .ft-card"], ["cat-fortune", ".cat-grid .cat-tool"]]) {
        const page = await tab();
        await open(page, p + ".html");
        const pt = await page.evaluate(s => { document.addEventListener("click", e => e.preventDefault(), true);
          const c = document.querySelectorAll(s)[2]; c.scrollIntoView({ block: "center", behavior: "instant" }); const r = c.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 12) }; }, sel);
        await sleep(200);
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y });
        await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        await sleep(350);
        const bg = await page.evaluate(s => getComputedStyle(document.querySelectorAll(s)[2]).backgroundColor, sel);
        await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        assert(bg === PRESSED, `${p}: pressed card background ${bg}, want ${PRESSED}`);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}

// tests/e2e/fortune-top-compact.e2e.mjs — FIXED TEST SET, fortune top compact (owner order 2026-11-16, from a real iPhone 16 Pro,
// iOS 27.0.1, Safari, Thai) + owner decision 69 option ค 2026-11-16 (help control in the top bar with a confirmation step), locked
// BEFORE the build (evals-locks/fortune-top-compact.sha256, ~/LENSIQ-field/evals/fortune-top-compact/).
// The static half is tests/unit/fortune-top-compact.test.js.
// Every fortune page (CLAUDE.md category 6 + cat-fortune) × TH / EN / ZH × phone sizes (width × visible height, Safari bars collapsed):
//   360×640, 375×660, 393×659 (iPhone 16 Pro), 414×715, 430×750. At page load, without scrolling unless said:
//   C1  the page's main action (MAIN below) is fully inside the first screen and not covered
//   C2  the help control (#lqHelpTop, a tel:1323 link) sits in the top bar (#siteNav): at load AND after scrolling down
//       (the bar stays on screen) it is inside the screen, at least 44 × 44 px and not covered; it shows "1323" with an
//       aria-label in the page language ("อยากมีคนรับฟัง โทร 1323" / "Want someone to listen? Call 1323" / "想找人倾听？拨打 1323");
//       it is visually quieter than the page title: font smaller than the h1's and not a filled button (background alpha < 0.2
//       or lightness > 0.85)
//   C3  the disclaimer is one small line under the title: the exact final wording (fortune.disc.line) is shown (never folded),
//       below the h1 and above the main action, in a block with no box (no background, no border), font no larger than 13 px,
//       at most 2 lines at 360 px (every language) with the "อ่านเพิ่มเติม / Read more / 阅读更多" control inline as a
//       text link (no background, no border) that is at least 44 px tall
//   C4  the description (the first <p> after the h1) is at most 2 lines at 393 px and has no business words (บูธ อีเวนต์
//       แคมเปญ booth event campaign 展位 活动 营销); the <meta name="description"> in the page language has none either
//   C5  no horizontal scroll
//   C6  the top bar fits at every size: nothing in it wider than the screen, the logo, the help control, the language switch
//       and the menu button do not overlap, every control in it is at least 44 px tall; where the language switch shows one
//       control (narrow screens), a tap opens the three choices (each ≥ 44 px) and Escape closes them
//   C7  confirmation step (decision 69 ค: "first tap opens a small confirmation … the call itself is then one more tap"):
//       one touch tap on the control does NOT start a call; it opens a dialog that shows the wording above, a tel:1323 call
//       link (≥ 44 × 44 px) and a close button (≥ 44 px); focus moves into the dialog; Escape closes it and focus returns to the
//       control; the close button does the same; a tap on the dialog's call link reaches tel:1323 and nothing cancels it
//       (TH / EN / ZH at 393 px, TH at 360 px)
//   C8  1323 once per page in the normal state. Counting rule (decision 69 ค): visible text and visible tel: links, a number
//       that is the text of its own tel: link counted once; the confirmation dialog counts only while it is open. With the
//       dialog closed 1323 shows exactly once, in the top bar; no help element (.lq-helpline, .lq-call, tel: link) is visible
//       in the page content (outside the top bar). With the dialog open, the only other places are inside the dialog.
// RE-LOCK 2026-11-16 (runtime only, before any measurement of the build): the run on the base took longer than the runner's
// 15-minute per-file limit, so C7 moved verbatim to tests/e2e/fortune-top-compact-2.e2e.mjs and the waits after a resize or a
// scroll went from 250 ms to 150 ms. No check, page, size or language changed.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const SIZES = [[360, 640], [375, 660], [393, 659], [414, 715], [430, 750]];
const ARIA = { th: "อยากมีคนรับฟัง โทร 1323", en: "Want someone to listen? Call 1323", zh: "想找人倾听？拨打 1323" };
const MORE = { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const BUSINESS = /บูธ|อีเวนต์|แคมเปญ|\bbooths?\b|\bevents?\b|\bcampaigns?\b|展位|活动|营销/i;
// Main action per page: every selector's first visible match must be fully in the first screen. Camera pages: start camera +
// upload. Form pages: the first input of the main form (birth date, dream text, the first choice of the first step). Hub and
// category page: the first reading card / the first tool card's name.
const MAIN = {
  fortune: [".pd-lead .pd-card h3"],
  "cat-fortune": [".cat-tool h3"],
  faceread: ["#frStartCam", "label.fr-upload"],
  palm: ["#plStartCam", "label.pl-upload"],
  horoscope: ["#hsDay", "#hsMonth"],
  tarot: ["#trTopics label"],
  iching: ["#icTopics label"],
  bazi: ["#lcDay", "#lcMonth"],
  taksa: ["#lcDay", "#lcMonth"],
  lek7: ["#lcDay", "#lcMonth"],
  numbers: ["#nmPhone"],
  fengshui: ["#fsDay", "#fsMonth"],
  dream: ["#drText"],
  zodiac: ["#zdAnimals label"],
  astro: ["#asDay", "#asMonth"],
  lifegraph: ["#lcDay", "#lcMonth"],
  planner: ["#plForm .pl-events label"],
  luckycolor: [".lc-goal"],
  report: [".rp-type"],
};
const PAGES = Object.keys(MAIN);

const phone = async (page, w, h) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};
const open = (browser, lang) => browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
const tap = async (page, pt) => {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(350);
};
const key = async (page, k) => {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
  await sleep(250);
};

const VIS = `const vis = e => { if (!e || !e.isConnected || !e.getClientRects().length) return false; const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true }))) return false;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.tagName === "DETAILS" && !x.open && x !== e && !(x.firstElementChild && x.firstElementChild.contains(e))) return false;
      if (x.tagName === "DIALOG" && !x.open) return false; }
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
const HELP_A = `[...document.querySelectorAll('#lqHelpTop a[href^="tel:"]')].find(x => x.getClientRects().length)`;

/** in the page: every fact the checks need, at the current size, scrolled to the top */
const FACTS = (sels, lang) => `(() => { ${VIS}
  const box = e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const hits = e => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const h = document.elementFromPoint(x, y);
    return !!h && (h === e || e.contains(h) || (h.tagName === "LABEL" && h.control === e) || (!!e.closest("label") && e.closest("label").contains(h))); };
  const rgba = c => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ""); if (!m) return { a: 0, l: 1 }; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1; const [r, g, b] = p.map(v => v / 255); return { a, l: (Math.max(r, g, b) + Math.min(r, g, b)) / 2 }; };
  const out = { vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
  const h1 = [...document.querySelectorAll("main h1")].find(vis);
  out.h1 = h1 ? { ...box(h1), fs: parseFloat(getComputedStyle(h1).fontSize) } : null;
  out.main = ${S(sels)}.map(s => { const e = [...document.querySelectorAll(s)].find(vis); return e ? { s, ...box(e), hit: hits(e) } : { s, missing: true }; });
  const nav = document.getElementById("siteNav"), top = document.getElementById("lqHelpTop"), a = ${HELP_A};
  if (a) { const cs = getComputedStyle(a), bg = rgba(cs.backgroundColor);
    out.help = { ...box(a), href: a.getAttribute("href"), hit: hits(a), inNav: !!nav && nav.contains(a),
      fs: Math.max(parseFloat(cs.fontSize), ...[...a.querySelectorAll("*")].filter(vis).map(x => parseFloat(getComputedStyle(x).fontSize))),
      bgA: bg.a, bgL: bg.l, text: a.innerText.replace(/\\s+/g, " ").trim(), aria: a.getAttribute("aria-label") || "", n: top.querySelectorAll('a[href^="tel:"]').length }; }
  // the top bar
  if (nav) {
    const ctl = [...nav.querySelectorAll("a[href], button")].filter(e => vis(e) && !e.closest(".site-menu, .nav-sub, .nav-util") && !e.classList.contains("skip-link"));
    out.bar = { sw: nav.scrollWidth, cw: nav.clientWidth, ctl: ctl.map(e => ({ id: (e.id || e.className || e.tagName) + (e.getAttribute("data-lang") ? ":" + e.getAttribute("data-lang") : ""), ...box(e) })) };
    const parts = [nav.querySelector(".logo"), a, nav.querySelector(".lang-switch"), nav.querySelector(".nav-toggle")].filter(vis).map(e => ({ id: e.className || e.tagName, ...box(e) }));
    out.bar.parts = parts;
    out.bar.langShown = [...nav.querySelectorAll(".lang-switch button")].filter(vis).length;
  }
  const line = [...document.querySelectorAll(".lq-disc-line")].find(e => vis(e) && (!h1 || (h1.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)));
  if (line) {
    const note = line.closest('.lq-notice, [role="note"]') || line.parentElement, cs = getComputedStyle(note), bg = rgba(cs.backgroundColor);
    const tops = new Set([...line.getClientRects()].map(r => Math.round(r.top)));
    const btn = [...note.querySelectorAll("button, a")].find(b => vis(b) && b.textContent.trim() === ${S(MORE[lang])});
    let btnLine = null, bb = null;
    if (btn) { const q = btn.getBoundingClientRect(), mid = q.top + q.height / 2; const rs = [...line.getClientRects()];
      const last = rs[rs.length - 1]; btnLine = last && mid >= last.top - 2 && mid <= last.bottom + 2 ? "same" : "own";
      const bcs = getComputedStyle(btn), bbg = rgba(bcs.backgroundColor);
      bb = { h: q.height, w: q.width, bgA: bbg.a, border: parseFloat(bcs.borderTopWidth) + parseFloat(bcs.borderBottomWidth) + parseFloat(bcs.borderLeftWidth) + parseFloat(bcs.borderRightWidth) }; }
    out.disc = { text: line.textContent.replace(/\\s+/g, " ").trim(), ...box(line), lines: tops.size + (btnLine === "own" ? 1 : 0),
      fs: parseFloat(getComputedStyle(line).fontSize), noteBgA: bg.a, noteBorder: parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth),
      btn: bb, btnLine };
  }
  let p = h1 && h1.nextElementSibling; while (p && p.tagName !== "P") p = p.nextElementSibling;
  if (p) { const lh = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.5;
    out.desc = { text: p.textContent.replace(/\\s+/g, " ").trim(), lines: Math.round(p.getBoundingClientRect().height / lh), isDisc: !!p.querySelector(".lq-disc-line") }; }
  const m = document.querySelector('meta[name="description"]'); out.meta = m ? m.getAttribute("content") : "";
  return out; })()`;

/** in the page: places where 1323 shows (C8 counting rule) and help elements visible outside the top bar */
const PLACES = `(() => { ${VIS}
  const nav = document.getElementById("siteNav"), where = e => nav && nav.contains(e) ? "bar" : e.closest("dialog, [role=dialog]") ? "dialog" : "content";
  const re = /(?<!\\d)1323(?!\\d)/;
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === "1323" && vis(a));
  const out = links.map(a => "link:" + where(a));
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) { const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !re.test(t.nodeValue) || links.some(a => a.contains(p)) || !vis(p)) continue;
    out.push("text:" + where(p)); }
  const content = [...document.querySelectorAll('.lq-helpline, .lq-call, .lq-call-mini, a[href^="tel:"]')].filter(e => vis(e) && where(e) === "content")
    .map(e => (e.id || e.className || e.tagName) + ":" + (e.getAttribute("href") || ""));
  return { places: out, content }; })()`;

async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!document.querySelector('a[href="tel:1323"]')`, 10000);
  await sleep(700); // dictionaries, the read-more buttons and late scripts settle
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const results = {}; // `${p} ${lang} ${w}` -> facts
  try {
    // one pass collects the facts; the checks below read them (each check still fails on its own)
    for (const lang of LANGS) {
      const page = await open(browser, lang);
      try {
        for (const p of PAGES) {
          await phone(page, 393, 659);
          try { await load(page, base, p, lang); } catch (e) { results[`${p} ${lang}`] = { err: "did not load: " + e.message }; continue; }
          for (const [w, h] of SIZES) {
            await phone(page, w, h); await page.evaluate("window.scrollTo(0, 0)"); await sleep(150);
            const f = results[`${p} ${lang} ${w}`] = await page.evaluate(FACTS(MAIN[p], lang));
            f.count = await page.evaluate(PLACES);
            // after scrolling down: the bar stays on screen
            await page.evaluate("window.scrollTo(0, Math.min(1200, document.documentElement.scrollHeight - innerHeight))"); await sleep(150);
            f.scrolled = await page.evaluate(`(() => { const a = ${HELP_A}; if (!a) return null; const r = a.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return { y: scrollY, top: r.top, bottom: r.bottom, left: r.left, right: r.right, hit: !!h && (h === a || a.contains(h)) }; })()`);
            await page.evaluate("window.scrollTo(0, 0)");
          }
        }
      } finally { await page.close(); }
    }
    const each = fn => { const bad = []; for (const p of PAGES) for (const lang of LANGS) {
      if (results[`${p} ${lang}`]) { bad.push(`${p} ${lang}: ${results[`${p} ${lang}`].err}`); continue; }
      for (const [w] of SIZES) fn(results[`${p} ${lang} ${w}`], `${p} ${lang} ${w}`, { p, lang, w }, bad); }
      return bad; };
    const report = bad => assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 80).join("\n"));

    await check("C1: the main action is fully in the first screen at load, not covered (every page × TH/EN/ZH × 360/375/393/414/430)", async () => {
      report(each((f, tag, _, bad) => {
        for (const m of f.main) {
          if (m.missing) { bad.push(`${tag}: main action ${m.s} not found`); continue; }
          if (m.top < 0 || m.bottom > f.vh + 0.5 || m.left < -0.5 || m.right > f.vw + 0.5) bad.push(`${tag}: ${m.s} at ${Math.round(m.top)}–${Math.round(m.bottom)} px, first screen is ${f.vh} px`);
          else if (!m.hit) bad.push(`${tag}: ${m.s} is covered`);
        }
      }));
    });

    await check("C2: the help control is in the top bar, on screen at load and after scrolling, ≥ 44 px, not covered, shows 1323, aria-label in the page language, quieter than the h1", async () => {
      report(each((f, tag, { lang }, bad) => {
        const b = f.help;
        if (!b) { bad.push(`${tag}: no visible tel: link in #lqHelpTop`); return; }
        if (!b.inNav) bad.push(`${tag}: the help control is not in the top bar`);
        if (b.href !== "tel:1323" || b.n !== 1) bad.push(`${tag}: #lqHelpTop must hold one tel:1323 link (${b.href}, ${b.n})`);
        if (b.h < 44 || b.w < 44) bad.push(`${tag}: help control ${b.w.toFixed(1)}×${b.h.toFixed(1)} px`);
        if (b.top < 0 || b.bottom > f.vh || b.left < -0.5 || b.right > f.vw + 0.5) bad.push(`${tag}: help control not in the first screen`);
        if (!b.hit) bad.push(`${tag}: help control covered`);
        const s = f.scrolled;
        if (!s || s.y < 100) bad.push(`${tag}: could not scroll the page to test the sticky bar ${S(s)}`);
        else if (s.top < 0 || s.bottom > f.vh || s.left < -0.5 || s.right > f.vw + 0.5 || !s.hit) bad.push(`${tag}: help control not reachable after scrolling ${S(s)}`);
        if (!/(?<!\d)1323(?!\d)/.test(b.text)) bad.push(`${tag}: the control does not show 1323 (${S(b.text)})`);
        if (b.aria.replace(/\s+/g, " ").trim() !== ARIA[lang]) bad.push(`${tag}: aria-label ${S(b.aria)} (want ${S(ARIA[lang])})`);
        if (lang !== "th" && /[฀-๿]/.test(b.text + b.aria)) bad.push(`${tag}: Thai letters in the ${lang} control`);
        if (!f.h1) bad.push(`${tag}: no visible h1`);
        else if (!(b.fs < f.h1.fs)) bad.push(`${tag}: help font ${b.fs} px is not smaller than the h1 (${f.h1.fs} px)`);
        if (!(b.bgA < 0.2 || b.bgL > 0.85)) bad.push(`${tag}: help control is a filled button (background alpha ${b.bgA}, lightness ${b.bgL.toFixed(2)})`);
      }));
    });

    await check("C3: the disclaimer is one small line under the title with the exact wording, ≤ 2 lines at 360 px, read more as a text link", async () => {
      report(each((f, tag, { lang, w }, bad) => {
        const d = f.disc;
        if (!d) { bad.push(`${tag}: no visible disclaimer line after the h1`); return; }
        if (d.text !== LINE[lang]) bad.push(`${tag}: disclaimer wording ${S(d.text)}`);
        if (f.h1 && d.top < f.h1.bottom - 1) bad.push(`${tag}: disclaimer is above the title`);
        const firstMain = f.main.filter(m => !m.missing).map(m => m.top);
        if (firstMain.length && d.bottom > Math.min(...firstMain) + 1) bad.push(`${tag}: disclaimer is below the main action`);
        if (d.top < 0 || d.bottom > f.vh) bad.push(`${tag}: disclaimer not in the first screen`);
        if (d.noteBgA > 0.05 || d.noteBorder > 0) bad.push(`${tag}: disclaimer is a box (background alpha ${d.noteBgA}, border ${d.noteBorder} px)`);
        if (d.fs > 13) bad.push(`${tag}: disclaimer font ${d.fs} px (want ≤ 13)`);
        if (!d.btn) bad.push(`${tag}: no "${MORE[lang]}" control in the disclaimer`);
        else {
          if (d.btn.bgA > 0.05 || d.btn.border > 0) bad.push(`${tag}: "${MORE[lang]}" is a button, not a text link (background alpha ${d.btn.bgA}, border ${d.btn.border} px)`);
          if (d.btn.h < 44) bad.push(`${tag}: "${MORE[lang]}" tap area ${d.btn.h.toFixed(1)} px`);
        }
        if (w === 360 && d.lines > 2) bad.push(`${tag}: disclaimer takes ${d.lines} lines (want ≤ 2)`);
      }));
    });

    await check("C4: the description is ≤ 2 lines at 393 px with no business words; the meta description has none (TH/EN/ZH)", async () => {
      report(each((f, tag, { lang, w }, bad) => {
        if (w !== 393) return;
        if (!f.desc || f.desc.isDisc) bad.push(`${tag}: no description paragraph after the h1`);
        else {
          if (f.desc.lines > 2) bad.push(`${tag}: description takes ${f.desc.lines} lines: ${f.desc.text.slice(0, 90)}`);
          if (BUSINESS.test(f.desc.text)) bad.push(`${tag}: business wording in the description: ${f.desc.text.slice(0, 120)}`);
        }
        if (BUSINESS.test(f.meta || "")) bad.push(`${tag}: business wording in the meta description (${lang}): ${f.meta.slice(0, 120)}`);
      }));
    });

    await check("C5: no horizontal scroll at load (every page × TH/EN/ZH × every size)", async () => {
      report(each((f, tag, _, bad) => { if (f.sw > f.vw + 1) bad.push(`${tag}: page ${f.sw} px wide on a ${f.vw} px screen`); }));
    });

    await check("C6: the top bar fits (logo, help control, language switch, menu): no overflow, no overlap, every control ≥ 44 px", async () => {
      report(each((f, tag, _, bad) => {
        const b = f.bar;
        if (!b) { bad.push(`${tag}: no top bar`); return; }
        if (b.sw > b.cw + 1) bad.push(`${tag}: top bar content ${b.sw} px in ${b.cw} px`);
        for (const c of b.ctl) {
          if (c.left < -0.5 || c.right > f.vw + 0.5) bad.push(`${tag}: ${c.id} off the screen (${Math.round(c.left)}–${Math.round(c.right)})`);
          if (c.h < 44) bad.push(`${tag}: ${c.id} is ${c.h.toFixed(1)} px tall`);
        }
        const P = b.parts;
        if (P.length < 4) bad.push(`${tag}: the bar shows ${P.length} of logo / help / language / menu: ${S(P.map(x => x.id))}`);
        for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
          const x = P[i], y = P[j];
          if (x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5) bad.push(`${tag}: ${x.id} overlaps ${y.id}`);
        }
      }));
      // where the switch is one control, it opens the three choices (TH pages, 360 px)
      const bad = [];
      const page = await open(browser, "th");
      try {
        for (const p of ["faceread", "dream", "cat-fortune"]) {
          await phone(page, 360, 640); await load(page, base, p, "th");
          const shown = await page.evaluate(`[...document.querySelectorAll("#siteNav .lang-switch button")].filter(b => b.getClientRects().length && getComputedStyle(b).display !== "none").length`);
          if (shown >= 3) continue;
          const cur = await page.evaluate(`(() => { const b = [...document.querySelectorAll("#siteNav .lang-switch button")].find(b => b.getClientRects().length); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
          await tap(page, cur);
          const r = await page.evaluate(`[...document.querySelectorAll("#siteNav .lang-switch button")].filter(b => b.getClientRects().length && getComputedStyle(b).display !== "none").map(b => { const q = b.getBoundingClientRect(); return { l: b.getAttribute("data-lang"), h: q.height, w: q.width, right: q.right, left: q.left }; })`);
          if (r.length !== 3) bad.push(`${p}: the one-control language switch shows ${r.length} choices after a tap`);
          for (const x of r) if (x.h < 44 || x.w < 44 || x.left < -0.5 || x.right > 360.5) bad.push(`${p}: language choice ${x.l} ${x.w.toFixed(0)}×${x.h.toFixed(0)} at ${Math.round(x.left)}–${Math.round(x.right)}`);
          await key(page, "Escape");
          const after = await page.evaluate(`[...document.querySelectorAll("#siteNav .lang-switch button")].filter(b => b.getClientRects().length && getComputedStyle(b).display !== "none").length`);
          if (after !== shown) bad.push(`${p}: Escape did not close the language choices (${after} shown)`);
        }
      } finally { await page.close(); }
      report(bad);
    });

    await check("C8: 1323 shows exactly once in the normal state (in the top bar); no help element in the page content", async () => {
      report(each((f, tag, _, bad) => {
        const c = f.count;
        if (c.places.length !== 1 || !c.places[0].endsWith(":bar")) bad.push(`${tag}: 1323 places ${S(c.places)} (want one, in the top bar)`);
        if (c.content.length) bad.push(`${tag}: help elements in the page content ${S(c.content)}`);
      }));
    });
  } finally {
    await browser.close();
  }
}

// tests/e2e/readbar-solid.e2e.mjs — FIXED TEST SET "planner defects" part c (owner report 2026-11-18, Samsung Android default
// browser, planner.html: the sticky "หาวันดี" bar overlapped page text and faint text showed through under the button).
// Locked BEFORE any product fix (evals-locks/planner-defects.sha256, ~/LENSIQ-field/evals/planner-defects/).
// Pages: every *.html in the repo root that loads the sticky read bar (fortune-readbar.js is copied into fortune-read.js and
// planner.js by tools/fortune-read-embed.mjs, so: every page that loads fortune-read.js, planner.js or fortune-readbar.js).
// Each page × TH / EN / ZH × phone widths 360, 375, 393, 412, 430 px; at each width the page is scrolled to 5 positions
// (0, 25 %, 50 %, 75 % and 100 % of the scroll range). Wherever the bar (.lq-readbar) is shown:
//   1. solid: its computed background colour has alpha 1, and its own opacity (and every ancestor's) is 1;
//   2. room: the page keeps bottom space for it: the body's computed padding-bottom >= the bar's height;
//   3. nothing shows over or through it: every text box (Range.getClientRects of each shown text node outside the bar) that
//      intersects the bar's box is under the bar: document.elementFromPoint at the middle of the overlap and 1 px inside its
//      four corners hits the bar (or something inside it). A fixed bar always has page text passing BEHIND it while the page
//      scrolls; with check 1 that text is not visible;
//   4. at the bottom of the page (100 %): NO text box intersects the bar at all, and the last shown content element of the
//      page (the last element child of <body> in normal flow, not the bar) ends at or above the bar's top.
// The bar must show on planner.html at least once per language (some width and scroll position; at 800 px screen height
// the read button is on the first screen at some widths, and then the bar rightly stays hidden), so the checks above are
// never empty for the page the owner reported. Counts are printed per page × language × width.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const LANGS = ["th", "en", "zh"];
const WIDTHS = [360, 375, 393, 412, 430];
const POS = [0, 0.25, 0.5, 0.75, 1];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const PAGES = readdirSync(repo).filter(f => f.endsWith(".html")).sort()
  .filter(f => /<script[^>]+src="(?:fortune-read|planner|fortune-readbar)\.js/.test(readFileSync(join(repo, f), "utf8")));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";

// Runs in the page at the current scroll position: null when the bar is not shown, else { problems: [...] }.
const PROBE = `((atBottom) => {
  const bar = [...document.querySelectorAll(".lq-readbar")].find(b => !b.hidden && b.getClientRects().length && getComputedStyle(b).display !== "none");
  if (!bar) return null;
  const out = [];
  const br = bar.getBoundingClientRect();
  if (br.height < 2) return null;
  const alpha = c => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return c === "transparent" ? 0 : 1;
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) * (/%$/.test(p[3]) ? 0.01 : 1) : 1;
  };
  const bg = getComputedStyle(bar).backgroundColor;
  if (alpha(bg) !== 1) out.push("background not solid: " + bg);
  for (let x = bar; x && x.nodeType === 1; x = x.parentElement) { const o = parseFloat(getComputedStyle(x).opacity); if (o !== 1) out.push("opacity " + o + " on " + x.tagName); }
  const pb = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  if (pb + 0.5 < br.height) out.push("body padding-bottom " + pb + " px < bar height " + Math.round(br.height) + " px");
  const shown = el => el.getClientRects().length && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === bar || bar.contains(e)); };
  let under = 0;
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const p = t.parentElement;
    if (!p || bar.contains(p) || p.closest("script,style,noscript,template,title,svg") || !shown(p)) continue;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) {
      const l = Math.max(r.left, br.left), rt = Math.min(r.right, br.right), tp = Math.max(r.top, br.top), bt = Math.min(r.bottom, br.bottom);
      if (rt - l < 1 || bt - tp < 1) continue;
      const txt = t.nodeValue.replace(/\\s+/g, " ").trim().slice(0, 40);
      under++;
      if (atBottom) { out.push("text under the bar at the bottom of the page: \\"" + txt + "\\""); continue; }
      const pts = [[(l + rt) / 2, (tp + bt) / 2], [l + 1, tp + 1], [rt - 1, tp + 1], [l + 1, bt - 1], [rt - 1, bt - 1]];
      if (!pts.every(([x, y]) => hit(x, y))) out.push("text shows over the bar: \\"" + txt + "\\"");
    }
  }
  if (atBottom) {
    let last = null;
    for (const el of document.body.children) {
      if (el === bar || el.matches("script,style,noscript,template,link,meta")) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.position === "absolute" || !shown(el)) continue;
      last = el;
    }
    if (last) {
      const lb = last.getBoundingClientRect().bottom, nm = last.tagName.toLowerCase() + (last.className ? "." + String(last.className).split(" ")[0] : "");
      if (lb > br.top + 0.5) out.push("last content (" + nm + ") ends at " + Math.round(lb) + " px, under the bar's top " + Math.round(br.top) + " px");
    }
  }
  return { problems: out, under };
})`;

const phone = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

export default async function ({ base, launch, check }) {
  await check("the sticky read bar pages are found (planner.html among them)", async () => {
    assert(PAGES.length >= 2 && PAGES.includes("planner.html"), "pages: " + PAGES.join(", "));
    console.log("       pages " + PAGES.length + ": " + PAGES.join(" "));
  });
  const browser = await launch();
  try {
    for (const p of PAGES) for (const lang of LANGS) {
      await check(`${p} ${lang}: sticky read bar is solid, keeps room below the page, and no text shows over or through it`, async () => {
        const page = await browser.newPage(null, { initScripts: [INIT, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        const bad = [];
        let shownTotal = 0;
        try {
          await phone(page, 393);
          await page.goto(`${base}/${p}?nosw`);
          await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
          await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
          await sleep(900);
          for (const w of WIDTHS) {
            await phone(page, w);
            let shownAt = 0, under = 0;
            for (const f of POS) {
              await page.evaluate(`window.scrollTo(0, Math.round(${f} * Math.max(0, document.documentElement.scrollHeight - innerHeight))); 1`);
              await sleep(250); // the bar syncs on the next animation frame after scroll / resize
              const r = await page.evaluate(`${PROBE}(${f === 1 && "true" || "false"})`);
              if (!r) continue;
              shownAt++; shownTotal++; under += r.under;
              for (const x of r.problems) bad.push(`${w} scroll ${f * 100}%: ${x}`);
            }
            console.log(`       count ${p} ${lang} ${w}: bar shown at ${shownAt}/5 positions, text boxes behind it ${under}`);
          }
        } finally { await page.close(); }
        if (p === "planner.html" && !shownTotal) bad.push("the bar was never shown on planner.html (no width, no scroll position)");
        const uniq = [...new Set(bad)];
        assert(!uniq.length, `${uniq.length} problem(s):\n         ` + uniq.slice(0, 30).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}

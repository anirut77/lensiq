// tests/e2e/fortune-calm-pages.e2e.mjs — FIXED TEST SET, crisis fix 4b (coordinator order 2026-11-13). Locked BEFORE the product
// change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256).
// The fortune hub, the planner and the lucky-colour mirror respect the calm session of fix 4: when the tab's sessionStorage flag
// "lq-fortune-calm" is set (support card or the soft step's "Just the reading" on another fortune page), no lucky-item, remedy,
// paid or merit block is visible, and the help line is in the viewport when the page opens. Without the flag (a new tab) the
// pages are unchanged. Storage blocked: the pages work as before, with no script error.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
const NO_STORAGE = `Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });`;

/** the lucky / remedy / paid blocks of each page (selectors of content that must not show in a calm session) */
const LUCKY = {
  fortune: [".ft-use"],
  planner: [".pl-chip[data-lq-remedy]", ".pl-lucky"],
  luckycolor: ["#goals", "#recBox", "#swatches", "#match", "#week"],
};
const STATE = sels => `(() => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const full = e => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
  const lucky = ${S(sels)}.flatMap(s => [...document.querySelectorAll(s)]).filter(vis).map(e => e.id || e.className);
  const luckyText = [...document.querySelectorAll(".pl-chip")].filter(e => vis(e) && /สีเสื้อเสริมมงคล|lucky|幸运|吉祥/i.test(e.textContent)).length;
  const blocks = [...document.querySelectorAll("[data-lq-remedy], [data-lq-upsell], [data-lq-paid], [data-lq-merit]")].filter(vis).map(e => e.id || e.className);
  const top = document.getElementById("lqHelpTop"), tel = top && [...top.querySelectorAll(".lq-helpline-tel")].find(a => /1323/.test(a.textContent));
  return { lucky, luckyText, blocks, helpVisible: vis(top), helpInView: full(tel) };
})()`;
/** open the page; the planner also asks for dates so its lucky colour chips are drawn */
async function open(page, base, p) {
  await page.goto(`${base}/${p}.html`); await sleep(400);
  if (p === "planner") {
    await page.evaluate(() => document.getElementById("plGo").click());
    await page.waitFor(() => !document.getElementById("plResult").hidden && document.querySelectorAll("#plList li").length > 0, 10000);
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
  }
  return page.evaluate(STATE(LUCKY[p]));
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("no calm flag: the hub, planner and lucky-colour pages show their content as before", async () => {
      for (const p of Object.keys(LUCKY)) {
        const page = await browser.newPage(null);
        try {
          const s = await open(page, base, p);
          assert(s.lucky.length > 0 || s.luckyText > 0, p + ": content expected without the flag " + S(s));
          assert(s.helpVisible, p + ": help line");
        } finally { await page.close(); }
      }
    });

    await check("calm session: no lucky, remedy, paid or merit block visible; the help line is in the viewport", async () => {
      for (const [w, h] of [[360, 780], [1280, 800]]) {
        for (const p of Object.keys(LUCKY)) {
          const page = await browser.newPage(null, { initScripts: [CALM] });
          try {
            await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
            const s = await open(page, base, p);
            assert(!s.lucky.length && !s.luckyText, w + "px " + p + ": lucky content visible in a calm session " + S(s));
            assert(!s.blocks.length, w + "px " + p + ": marked blocks visible " + S(s.blocks));
            assert(s.helpVisible && s.helpInView, w + "px " + p + ": help line not in the viewport " + S(s));
            assert(!page.consoleErrors.some(e => e.kind === "exception"), p + ": script errors " + S(page.consoleErrors).slice(0, 300));
          } finally { await page.close(); }
        }
      }
    });

    await check("real path: the support card on tarot, then the hub, planner and lucky-colour pages in the same tab are calm", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/tarot.html`);
        await page.evaluate(() => { document.getElementById("trQuestion").value = "อยากตายจริงๆ ไม่ไหวแล้ว"; document.getElementById("trStart").click(); });
        await page.waitFor(() => !!document.querySelector(".fa-support"), 8000);
        for (const p of Object.keys(LUCKY)) {
          const s = await open(page, base, p);
          assert(!s.lucky.length && !s.luckyText && !s.blocks.length, p + " after the card: " + S(s));
          assert(s.helpInView, p + " after the card: help line not in view");
        }
      } finally { await page.close(); }
    });

    await check("storage blocked: the pages work as before, no script error", async () => {
      for (const p of Object.keys(LUCKY)) {
        const page = await browser.newPage(null, { initScripts: [NO_STORAGE] });
        try {
          const s = await open(page, base, p);
          assert(s.lucky.length > 0 || s.luckyText > 0, p + ": content expected " + S(s));
          assert(!page.consoleErrors.some(e => e.kind === "exception" && /fortune-crisis|sessionStorage/.test(e.text + e.url)),
            p + ": script error from the calm check " + S(page.consoleErrors).slice(0, 300));
        } finally { await page.close(); }
      }
    });
  } finally {
    await browser.close();
  }
}

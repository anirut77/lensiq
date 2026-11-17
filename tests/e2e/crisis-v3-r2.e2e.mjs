// tests/e2e/crisis-v3-r2.e2e.mjs — FIXED TEST SET "crisis-v3", review round 2 (independent review of 8cee117,
// ~/LENSIQ-field/review/crisis-v3/REVIEW.md). Locked BEFORE the round-2 fixes (evals-locks/crisis-v3.sha256, tag r2-lock).
// Synthetic, headless Chrome, 393 px, TH / EN / ZH (kit PHRASE).
//   R1 fortune-crisis.js fails to load: a crisis phrase as the horoscope name / report name is never shown back (no echo).
//   R2 crisis via the "report a problem" note after a reading (tarot, dream, zodiac, astro, bazi, fengshui): the crisis state is
//      set and ONE closing line with tel:1323 is added after the reading's last section; nothing is shown after it in its area.
//   R3 report.html in a crisis session: no 30-day plan (#rp-p-plan30, its contents link, any .rp-plan), no history link; the
//      closing line is the last thing shown in the report.
//   R4 a later fengshui page of a crisis session (calm): no remedy / lucky block shown, the closing line is last in its area.
//   R5 later pages of a crisis session (calm): no on-device reading counter (ids ending in Stats, or the box holding one).
//   R6 crisis session: the "(question you typed)" placeholder is never shown (tarot, iching); a crisis dream reading keeps a
//      self-care advice section under the plain title (การดูแลตัวเอง / Taking care of yourself / 照顾自己).
// Every case also runs the locked no-echo check of crisis-v3-kit.mjs.
import { PAGES, PHRASE, LANGS, HTML_LANG, INIT, S, assert, after, baseline, echo, open, sleep } from "./crisis-v3-kit.mjs";

const W = 393;
const SEC = `[...document.querySelectorAll(".fa-section")].filter(e => e.getClientRects().length > 0)`;
/** rule d, as text: "" when one closing line (tel:1323) follows the last visible section and nothing visible comes after it in its area */
const LAST = `(() => { const vis = e => { if (!e || !e.isConnected) return false; if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const lines = [...document.querySelectorAll(".lq-helpline-result")].filter(e => vis(e) && !e.closest("#lqHelpTop"));
  if (lines.length !== 1) return "closing lines shown: " + lines.length;
  const c = lines[0], secs = ${SEC};
  if (!c.querySelector('a[href="tel:1323"]')) return "no tel:1323 in the closing line";
  if (secs.length && !(secs[secs.length - 1].compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) return "closing line before the last section";
  const area = c.closest('[data-lq-result], [id$="Result"], #rpOut') || c.parentElement, bad = [];
  for (const e of area.querySelectorAll("*")) {
    if (c.contains(e) || !(c.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) || !vis(e)) continue;
    let t = ""; for (const n of e.childNodes) if (n.nodeType === 3) t += n.textContent;
    const name = e.id ? "#" + e.id : e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0];
    if (t.trim() || e.matches("img, canvas, svg, a[href], button")) bad.push(name + " " + JSON.stringify(t.trim().slice(0, 30)));
  }
  return bad.length ? "shown after the closing line: " + bad.slice(0, 6).join("; ") : ""; })()`;
const STATE = `document.documentElement.getAttribute("data-lq-crisis") === "1"`;

async function openBlocked(browser, base, p, lang) {
  const page = await browser.newPage(null, { isolated: true, initScripts: (PAGES[p].noApi ? INIT(lang).slice(0, 1) : INIT(lang)) });
  await page.send("Network.setBlockedURLs", { urls: ["*fortune-crisis.js*"] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${p}.html?nosw&lang=${lang}`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 12000);
  await sleep(450);
  assert(await page.evaluate("typeof window.LQFortuneCrisis === 'undefined'"), p + ": fortune-crisis.js was not blocked");
  return page;
}
async function each(check, name, fn) {
  await check(name, async () => {
    const bad = [];
    for (const lang of LANGS) { try { bad.push(...(await fn(lang)).map(b => `[${lang}] ${b}`)); } catch (e) { bad.push(`[${lang}] ${String(e.message || e).slice(0, 200)}`); } }
    assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
  });
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const p of ["horoscope", "report"]) {
      await each(check, `R1 ${p}, fortune-crisis.js blocked: a crisis name is never shown back`, async lang => {
        const page = await openBlocked(browser, base, p, lang);
        try {
          const before = await baseline(page);
          await PAGES[p].read(page, PHRASE[lang]); await sleep(900);
          const out = [];
          if (!(await page.evaluate(STATE))) out.push("crisis state not set");
          const e = echo(before, await after(page), PHRASE[lang]); if (e.length) out.push("echo " + S(e));
          return out;
        } finally { await page.close(); }
      });
    }
    for (const p of ["tarot", "dream", "zodiac", "astro", "bazi", "fengshui"]) {
      await each(check, `R2 ${p}: crisis via the report note after a reading -> one closing line after the reading, nothing after it`, async lang => {
        const page = await open(browser, base, p, { lang, width: W, fakeCams });
        try {
          await PAGES[p].read(page, null); await sleep(900);
          const before = await baseline(page);
          await page.waitFor(`[...document.querySelectorAll(".lq-rp-btn")].some(b => b.getBoundingClientRect().height > 0)`, 8000);
          await page.evaluate(`(() => { [...document.querySelectorAll(".lq-rp-btn")].find(b => b.getBoundingClientRect().height > 0).click(); return true; })()`);
          await page.waitFor(`!!document.querySelector("dialog.lq-rp textarea")`, 5000);
          await page.evaluate(`(() => { const t = document.querySelector("dialog.lq-rp textarea"); t.focus(); t.value = ${S(PHRASE[lang])};
            t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
          await page.waitFor(STATE, 8000); await sleep(1200);
          const out = [], last = await page.evaluate(LAST); if (last) out.push(last);
          const e = echo(before, await after(page), PHRASE[lang]); if (e.length) out.push("echo " + S(e));
          return out;
        } finally { await page.close(); }
      });
    }
    await each(check, "R3 report, crisis session: no plan, no history link; the closing line is last in the report", async lang => {
      const page = await open(browser, base, "report", { lang, width: W, fakeCams });
      try {
        await PAGES.report.read(page, PHRASE[lang]); await sleep(900);
        const r = await page.evaluate(`(() => { const vis = e => !!e && e.getClientRects().length > 0;
          return { plan: [...document.querySelectorAll("#rp-p-plan30, .rp-plan, a[href='#rp-p-plan30']")].filter(vis).length,
            hist: [...document.querySelectorAll("a[href*='history']")].filter(e => vis(e) && !e.closest("#siteNav, .nav, footer")).length }; })()`);
        const out = [];
        if (r.plan) out.push("plan shown (" + r.plan + ")");
        if (r.hist) out.push("history link shown");
        const last = await page.evaluate(LAST); if (last) out.push(last);
        return out;
      } finally { await page.close(); }
    });
    await each(check, "R4 fengshui, later page of a crisis session: no remedy / lucky block, the closing line is last", async lang => {
      const page = await open(browser, base, "fengshui", { lang, width: W, calm: true, fakeCams });
      try {
        await PAGES.fengshui.read(page, null); await sleep(900);
        const out = [];
        const rem = await page.evaluate(`[...document.querySelectorAll("[data-lq-remedy], [data-lq-upsell], .fa-plan")].filter(e => e.getClientRects().length > 0).length`);
        if (rem) out.push("remedy / lucky blocks shown: " + rem);
        const last = await page.evaluate(LAST); if (last) out.push(last);
        return out;
      } finally { await page.close(); }
    });
    for (const p of ["zodiac", "astro", "fengshui", "tarot", "dream", "horoscope"]) {
      await each(check, `R5 ${p}, later page of a crisis session: no on-device reading counter`, async lang => {
        const page = await open(browser, base, p, { lang, width: W, calm: true, fakeCams });
        try {
          await PAGES[p].read(page, null); await sleep(900);
          const n = await page.evaluate(`[...document.querySelectorAll('[id$="Stats"]')].filter(e => e.getClientRects().length > 0
            || (e.parentElement && e.parentElement.tagName === "SECTION" && e.parentElement.getClientRects().length > 0)).map(e => e.id)`);
          return n.length ? ["counter shown: " + n.join(", ")] : [];
        } finally { await page.close(); }
      });
    }
    for (const p of ["tarot", "iching"]) {
      await each(check, `R6 ${p}, crisis question: no placeholder for the typed question`, async lang => {
        const page = await open(browser, base, p, { lang, width: W, fakeCams });
        try {
          await PAGES[p].read(page, PHRASE[lang]); await sleep(900);
          const t = await page.evaluate(`document.body.innerText`);
          const hits = ["(คำถามที่คุณพิมพ์ไว้)", "(the question you typed)", "（你输入的问题）"].filter(x => t.includes(x));
          return hits.length ? ["placeholder shown: " + hits.join(", ")] : [];
        } finally { await page.close(); }
      });
    }
    await each(check, "R6 dream, crisis phrase: the reading keeps a self-care advice section under the plain title", async lang => {
      const page = await open(browser, base, "dream", { lang, width: W, fakeCams });
      try {
        await PAGES.dream.read(page, PHRASE[lang]); await sleep(900);
        const titles = await page.evaluate(`${SEC}.map(s => (s.querySelector("h2, h3, h4") || { innerText: "" }).innerText.trim())`);
        const want = { th: "การดูแลตัวเอง", en: "Taking care of yourself", zh: "照顾自己" }[lang];
        return titles.some(x => x.includes(want)) ? [] : ["no " + S(want) + " section: " + S(titles)];
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}

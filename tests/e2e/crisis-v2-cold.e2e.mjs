// tests/e2e/crisis-v2-cold.e2e.mjs — FIXED TEST SET, crisis-v2-live speed fix (coordinator order 2026-11-16: the calm part of the crisis
// net is loaded on demand; "a lazy load must finish before any reading is shown for typed text"). Locked in evals-locks/crisis-v2-live.sha256.
// Every page is opened cold (own browser context, empty cache) with the on-demand calm module (fortune-crisis-calm.js) DELAYED by
// 1.5 s, so a reader that does not wait for it would show an uncalmed reading. A MutationObserver installed before any page script
// records every moment a reading section is visible.
//   K1  hard net typed fast (no pause after load, TH / EN / ZH) on tarot, iching, dream, horoscope, numbers, report: the card shows,
//       and no reading section is ever visible before the card or next to it (no reading flash); after "continue" the reading is
//       the calm one (hope frame) and every number shows at most once outside the card.
//   K2  calm tab, cold (TH): on dream, tarot, zodiac, bazi and report a reading is never visible without the hope frame (no uncalmed
//       flash while the calm module loads), and the calm top button gets its one "more help numbers" control.
//   K3  hub, planner, lucky colour and the fortune category in a calm tab (cold): the lucky / remedy / belief blocks are never visible
//       (from the first paint), and the top button turns calm (one "more help numbers" control).
import { assert } from "./cdp.mjs";
import { CALM, LANGS, RUN, S, ask, cardShown, continueToReading, open, sleep } from "./crisis-flow-lib.mjs";

RUN["cat-fortune"] = RUN["cat-fortune"] || { url: "cat-fortune.html", none: true };
const DELAY = `(() => { const ap = Node.prototype.appendChild;
  Node.prototype.appendChild = function (c) {
    if (c && c.tagName === "SCRIPT" && /fortune-crisis-calm\\.js/.test(c.src || "") && !c.__lqDelayed) { c.__lqDelayed = 1; setTimeout(() => ap.call(this, c), 1500); return c; }
    return ap.call(this, c); };
})();`;
/** records whether a reading section was ever visible (a) before / beside a card, (b) without the hope frame */
const WATCH = `(() => { window.__lqSeen = { readingNoCard: 0, readingBesideCard: 0, readingNoHope: 0, remedy: 0, samples: [] };
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]"); };
  const look = () => { const W = window.__lqSeen;
    const secs = [...document.querySelectorAll(".fa-section, .rp-part")].filter(e => !e.closest(".fa-support") && vis(e));
    const card = [...document.querySelectorAll(".fa-support")].some(vis), hope = [...document.querySelectorAll(".fa-hope")].some(vis);
    if (secs.length && card) W.readingBesideCard++;
    if (secs.length && !hope) { W.readingNoHope++; if (W.samples.length < 3) W.samples.push((secs[0].innerText || "").slice(0, 60)); }
    if (secs.length && !card && !W.cardSeen) W.readingNoCard++;
    if (card) W.cardSeen = 1;
    if ([...document.querySelectorAll("[data-lq-remedy], [data-lq-belief]")].some(vis)) W.remedy++; };
  const start = () => { look(); new MutationObserver(look).observe(document.documentElement, { subtree: true, childList: true, attributes: true }); };
  if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
})();`;
const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
const PLACES = n => `[...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === ${S(n)} && a.getClientRects().length
  && !a.closest(".fa-support") && !(a.closest("details") && !a.closest("details").open)).length`;
const MORE = `(() => { const t = document.getElementById("lqHelpTop"); return t ? t.querySelectorAll("[data-lq-more]").length : -1; })()`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`K1 ${lang}: hard net typed fast on a cold page (calm module delayed): the card, no reading flash; continue gives the calm reading`, async () => {
        const bad = [];
        for (const name of ["tarot", "iching", "dream", "horoscope", "numbers", "report"]) {
          const pg = await open(browser, base, name, lang, { init: [DELAY, WATCH], width: 375, fakeCams });
          try {
            await ask(pg, name, CRISIS[lang]);
            await pg.waitFor(cardShown, 8000).catch(() => {});
            let w = await pg.evaluate("window.__lqSeen");
            if (!(await pg.evaluate(cardShown))) bad.push(name + ": no card");
            if (w.readingNoCard || w.readingBesideCard) bad.push(name + ": a reading was visible before / beside the card " + S(w));
            await continueToReading(pg, name);
            await pg.waitFor("[...document.querySelectorAll('.fa-hope')].some(e => e.getClientRects().length)", 8000).catch(() => {});
            w = await pg.evaluate("window.__lqSeen");
            if (w.readingNoHope) bad.push(name + ": a reading without the hope frame was visible " + S(w));
            if (!(await pg.evaluate("[...document.querySelectorAll('.fa-hope')].some(e => e.getClientRects().length)"))) bad.push(name + ": no calm reading after continue");
            for (const n of ["1323", "1669", "191", "1300", "021136789"]) { const k = await pg.evaluate(PLACES(n)); if (k > 1) bad.push(`${name}: ${n} shows ${k} times after continue`); }
          } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }

    await check("K2: calm tab, cold (TH; calm module delayed): no reading is ever visible without the hope frame; the top button turns calm", async () => {
      const bad = [];
      for (const name of ["dream", "tarot", "zodiac", "bazi", "report"]) {
        const pg = await open(browser, base, name, "th", { init: [CALM, DELAY, WATCH], width: 375, fakeCams });
        try {
          await ask(pg, name, "");
          await pg.waitFor("[...document.querySelectorAll('.fa-hope')].some(e => e.getClientRects().length)", 8000).catch(() => {});
          await sleep(500);
          const w = await pg.evaluate("window.__lqSeen");
          if (w.readingNoHope) bad.push(name + ": an uncalmed reading was visible " + S(w));
          if (w.remedy) bad.push(name + ": a remedy / belief block was visible");
          if (!(await pg.evaluate("[...document.querySelectorAll('.fa-hope')].some(e => e.getClientRects().length)"))) bad.push(name + ": no calm reading");
          if ((await pg.evaluate(MORE)) !== 1) bad.push(name + ": the top button has no single 'more help numbers' control");
        } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });

    await check("K3: hub, planner, lucky colour, fortune category in a calm tab (cold): no lucky / remedy / belief block from the first paint; the top button turns calm", async () => {
      const bad = [];
      for (const name of ["fortune", "planner", "luckycolor", "cat-fortune"]) {
        const pg = await open(browser, base, name, "th", { init: [CALM, DELAY, WATCH], width: 375 });
        try {
          await pg.waitFor(MORE + " === 1", 8000).catch(() => {});
          if (name === "planner") await ask(pg, "planner", "");
          await sleep(500);
          const w = await pg.evaluate("window.__lqSeen");
          if (w.remedy) bad.push(name + ": a lucky / remedy / belief block was visible (" + w.remedy + " times)");
          if ((await pg.evaluate(MORE)) !== 1) bad.push(name + ": the top button has no single 'more help numbers' control");
          if ((await pg.evaluate(`document.documentElement.getAttribute("data-lq-calm")`)) !== "1") bad.push(name + ": page not calm");
        } catch (e) { bad.push(name + ": " + String(e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });
  } finally {
    await browser.close();
  }
}

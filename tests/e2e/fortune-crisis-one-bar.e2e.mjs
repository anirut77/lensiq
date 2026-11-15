// tests/e2e/fortune-crisis-one-bar.e2e.mjs — FIXED TEST (coordinator review 2026-11-13 of the crisis flow v2 screens): exactly
// ONE pinned help bar may be on screen at any time. Locked BEFORE the fix (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256
// and evals-locks/fortune-honest.sha256). In a calm tab (TH, 360 px) the page is scrolled from top to bottom in steps; at every
// step the number of visible .lq-helpbar elements inside the viewport is at most 1, and while a reading section is on screen it
// is exactly 1 (the bar with tel:1323 fully in view). Pages: the ones with readings drawn by FortuneAI (zodiac, horoscope, astro
// with two readings, tarot after the card and continue), the report, and the hub / planner / lucky-colour pages (page bar).
import { assert } from "./cdp.mjs";
import { ADULT, CALM, CRISIS, FLAG_ON, S, ask, continueToReading, open } from "./crisis-flow-lib.mjs";

const SCAN = `(async () => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inView = e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const full = e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
  const out = [];
  const H = document.documentElement.scrollHeight;
  for (let y = 0; y <= H; y += Math.round(innerHeight * 0.4)) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120));
    const bars = [...document.querySelectorAll(".lq-helpbar")].filter(e => vis(e) && inView(e));
    const reading = [...document.querySelectorAll(".fa-section, .rp-part")].some(e => vis(e) && inView(e));
    const tel = bars.some(b => [...b.querySelectorAll("a[href='tel:1323']")].some(full));
    out.push({ y, bars: bars.length, reading, tel });
  }
  window.scrollTo(0, 0);
  return out;
})()`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("one pinned help bar at most on screen at any scroll position; exactly one (1323 in view) while a reading is on screen (TH, 360 px)", async () => {
      const bad = [];
      for (const name of ["zodiac", "horoscope", "astro", "report", "fortune", "planner", "luckycolor", "tarot"]) {
        const init = name === "tarot" ? [FLAG_ON, ADULT] : [FLAG_ON, ADULT, CALM];
        const pg = await open(browser, base, name, "th", { init, fakeCams });
        try {
          if (name === "tarot") { await ask(pg, "tarot", CRISIS.th); await continueToReading(pg, "tarot"); } else await ask(pg, name, "");
          const steps = await pg.evaluate(SCAN);
          for (const s of steps) {
            if (s.bars > 1) bad.push(name + " y=" + s.y + ": " + s.bars + " help bars on screen");
            if (s.reading && (s.bars !== 1 || !s.tel)) bad.push(name + " y=" + s.y + ": reading on screen without exactly one bar with 1323 " + S(s));
          }
          if (!steps.some(s => s.bars === 1)) bad.push(name + ": no help bar at any position");
        } catch (e) { bad.push(name + ": crashed " + String(e && e.message || e).slice(0, 200)); } finally { await pg.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.slice(0, 30).join("\n       "));
    });
  } finally {
    await browser.close();
  }
}

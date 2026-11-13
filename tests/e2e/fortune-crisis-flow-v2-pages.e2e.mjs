// tests/e2e/fortune-crisis-flow-v2-pages.e2e.mjs — FIXED TEST SET, crisis flow v2 (owner decision 2026-11-13; docs/CRISIS-FLOW-V2.md)
// on EVERY fortune page of spec §6, in TH / EN / ZH. Locked BEFORE the product change (sha256 in
// ~/LENSIQ-field/evals/fortune-honest/locked.sha256). The tab's calm flag is set (as after a card or the soft step on another
// page); straight mode is forced ON with an adult who chose it (worst case); the merit server stub has the paid flags ON.
//  1. every page × language (360 px): no acknowledgement card (no new signal), the reading is gentle with the hope frame, no
//     straight / paid / purchase / lucky-object content (blocks AND reading text, zodiac included), a pinned help bar with
//     1323 and "more help lines" in the viewport while the reading (or the page) is on screen, no chat UI.
//  2. desktop (1280 px): the pinned bar in view on zodiac, bazi, tarot, luckycolor and the hub.
//  3. free belief guidance is allowed: on zodiac (TH/EN/ZH) the merit panel shows free cards with the belief label, no lucky-item
//     card and no paid section although both paid flags are on.
//  4. neutral colours are allowed: the zodiac colour row, the planner's day-colour chip and a neutral colour of the day on the
//     lucky-colour page are visible in the calm tab; no lucky-object wording anywhere in the zodiac result.
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./cdp.mjs";
import { ADULT, BAR_IN_VIEW, CALM, FLAG_ON, LABEL, LANGS, LUCKY, NO_READING, PAGES, S, SNAP, ask, calmProblems, meritStub, open } from "./crisis-flow-lib.mjs";

const require = createRequire(import.meta.url);

export default async function ({ base, launch, check, fakeCams, repo }) {
  const seed = require(join(repo, "lensiq-merit-seed.js")).map(x => ({ ...x, updated_at: 1 }));
  const INIT = [FLAG_ON, ADULT, CALM, meritStub(seed)];
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`1. ${lang}: calm tab on every fortune page (360 px): gentle reading + hope frame, pinned help bar in view, no straight / paid / lucky content`, async () => {
        const bad = [];
        for (const name of PAGES) {
          const pg = await open(browser, base, name, lang, { init: INIT, fakeCams });
          try {
            await ask(pg, name, "");
            const s = await pg.evaluate(SNAP);
            for (const x of calmProblems(s, lang, { reading: !NO_READING.includes(name) })) bad.push(name + ": " + x);
            const v = await pg.evaluate(BAR_IN_VIEW);
            if (!v.every(Boolean)) bad.push(name + ": pinned help bar not in the viewport " + S(v));
            const errs = pg.consoleErrors.filter(e => e.kind === "exception");
            if (errs.length) bad.push(name + ": script errors " + S(errs).slice(0, 200));
          } catch (e) { bad.push(name + ": crashed " + String(e && e.message || e).slice(0, 200)); } finally { await pg.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }

    await check("2. desktop 1280 px (TH): the pinned help bar is in view on zodiac, bazi, tarot, luckycolor and the hub", async () => {
      const bad = [];
      for (const name of ["zodiac", "bazi", "tarot", "luckycolor", "fortune"]) {
        const pg = await open(browser, base, name, "th", { init: INIT, width: 1280, height: 800, fakeCams });
        try {
          await ask(pg, name, "");
          const v = await pg.evaluate(BAR_IN_VIEW);
          if (!v.every(Boolean)) bad.push(name + ": " + S(v));
        } finally { await pg.close(); }
      }
      assert(!bad.length, bad.join("\n       "));
    });

    await check("3. free belief guidance allowed (zodiac TH/EN/ZH): merit cards with the belief label, no lucky-item card, no paid section", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const pg = await open(browser, base, "zodiac", lang, { init: INIT });
        try {
          await ask(pg, "zodiac", "");
          await pg.waitFor("document.querySelectorAll('.lq-merit-card').length > 0", 8000).catch(() => {});
          const s = await pg.evaluate(SNAP);
          if (!s.meritPanel || !s.meritCards) bad.push(lang + ": no free belief guidance in the calm tab " + S({ panel: s.meritPanel, cards: s.meritCards }));
          if (!s.meritLabelled) bad.push(lang + ": a card without the belief label");
          const lab = await pg.evaluate(l => [...document.querySelectorAll(".lq-merit-card")].every(c => c.innerText.includes(l)), LABEL[lang]);
          if (!lab) bad.push(lang + ": label not in " + lang);
          if (s.meritTypes.includes("lucky_item")) bad.push(lang + ": lucky-item card");
          if (s.paid) bad.push(lang + ": paid section / upsell visible");
          if (await pg.evaluate(() => !!document.querySelector(".lq-merit-paid form, .lq-merit form"))) bad.push(lang + ": interest form in the DOM");
        } finally { await pg.close(); }
      }
      assert(!bad.length, bad.join("\n       "));
    });

    await check("4. neutral colours allowed: zodiac colour row, planner day colour, lucky-colour page colour of the day; no lucky object in the zodiac result", async () => {
      const bad = [];
      for (const lang of LANGS) {
        let pg = await open(browser, base, "zodiac", lang, { init: INIT });
        try {
          await ask(pg, "zodiac", "");
          const z = await pg.evaluate(() => {
            const vis = e => !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
            const res = document.getElementById("zdResult");
            return { swatch: [...document.querySelectorAll("#zdFacts .zd-sw")].some(vis), text: res ? res.innerText : "" };
          });
          if (!z.swatch) bad.push(lang + " zodiac: colour row hidden");
          if (LUCKY.test(z.text)) bad.push(lang + " zodiac: lucky object in the result: " + (z.text.match(LUCKY) || [])[0]);
        } finally { await pg.close(); }
        pg = await open(browser, base, "planner", lang, { init: INIT });
        try {
          await ask(pg, "planner", "");
          const ok = await pg.evaluate(() => [...document.querySelectorAll(".pl-chip")].some(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0 &&
            /สีประจำวัน|Day colour|当日颜色/.test(e.textContent) && !!e.querySelector("[style*='background'], .pl-sw, .sw, i, span")));
          if (!ok) bad.push(lang + " planner: day-colour chip not visible");
        } finally { await pg.close(); }
        pg = await open(browser, base, "luckycolor", lang, { init: INIT });
        try {
          const c = await pg.evaluate(() => {
            const e = document.getElementById("lcCalmDay");
            const vis = !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
            return { vis, dots: e ? e.querySelectorAll(".lc-dot").length : 0, text: e ? e.innerText : "" };
          });
          if (!c.vis || !c.dots) bad.push(lang + " luckycolor: neutral colour of the day not shown " + S(c));
          if (LUCKY.test(c.text)) bad.push(lang + " luckycolor: lucky object wording");
        } finally { await pg.close(); }
      }
      assert(!bad.length, bad.join("\n       "));
    });
  } finally {
    await browser.close();
  }
}

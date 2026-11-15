// tests/e2e/fortune-crisis-flow-v2.e2e.mjs — FIXED TEST SET, crisis flow v2 (owner decision 2026-11-13; docs/CRISIS-FLOW-V2.md).
// Locked BEFORE the product change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256). Straight mode is forced ON with
// an adult who chose it (worst case); the shipped flag stays false. Helpers: crisis-flow-lib.mjs.
//  A. hard net on every fortune page with a free-text field (tarot, iching, dream, horoscope, numbers, report, faceread, palm),
//     TH / EN / ZH at 360 px: the acknowledgement card first (warm, no echo, five tappable tel: lines ≥ 44 px, continue label,
//     pending-review marker, no text field); "continue" reaches the reading; the reading is gentle with the hope frame and no
//     straight / paid / purchase / lucky-object text; the pinned help bar (1323 + more lines) stays in the viewport while the
//     reading is on screen; nothing typed is echoed; exactly one sessionStorage boolean.
//  B. desktop (1280 px): the same on tarot, horoscope and dream (TH).
//  C. soft step on tarot and dream, TH / EN / ZH: "Just the reading" → calm reading with the pinned bar; "talk" → the card → continue.
//  D. the session flag carries to later pages in the tab (no card there, calm reading, bar in view); the card comes back only for a
//     NEW hard-net signal on the same page; a plain question after continue gets a calm reading.
//  E. storage blocked: card → continue → calm reading at page level, no script error.
import { assert } from "./cdp.mjs";
import {
  ADULT, BAR_IN_VIEW, CRISIS, FLAG_ON, LANGS, NO_STORAGE, S, SNAP, SOFT, answerSoft, ask, calmProblems, cardProblems, cardShown, continueToReading, open,
  sessionDump, sleep, softShown,
} from "./crisis-flow-lib.mjs";

const HARD_PAGES = ["tarot", "iching", "dream", "horoscope", "numbers", "report", "faceread", "palm"];

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    /** one hard-net flow: card checks, continue, calm reading checks; returns problems */
    async function hardFlow(name, lang, { width = 360, height = 780, init = [FLAG_ON, ADULT] } = {}) {
      const pg = await open(browser, base, name, lang, { init, width, height, fakeCams });
      const bad = [];
      try {
        const before = await pg.evaluate(sessionDump);
        await ask(pg, name, CRISIS[lang]);
        const c = await pg.evaluate(SNAP);
        bad.push(...cardProblems(c, lang).map(x => "card: " + x));
        if (!c.card) return bad;
        await continueToReading(pg, name);
        const r = await pg.evaluate(SNAP);
        bad.push(...calmProblems(r, lang, { typed: CRISIS[lang] }).map(x => "reading: " + x));
        const inView = await pg.evaluate(BAR_IN_VIEW);
        if (!inView.every(Boolean)) bad.push("pinned help bar not in the viewport while the reading is on screen " + S(inView));
        const after = await pg.evaluate(sessionDump);
        // re-lock 2026-11-14: "lq-heavy" is the camera crash guard merged from main (lensiq-crashguard.js; one boolean while a camera
        // runs, PDPA notes section H), not part of the crisis flow; every other new key is still counted
        const added = Object.keys(after).filter(k => !(k in before) && k !== "lq-heavy");
        if (added.length !== 1 || after[added[0]] !== "1" || added[0] !== "lq-fortune-calm") bad.push("session storage: " + S(after));
        const errs = pg.consoleErrors.filter(e => e.kind === "exception");
        if (errs.length) bad.push("script errors " + S(errs).slice(0, 300));
      } catch (e) { bad.push("crashed: " + String(e && e.message || e).slice(0, 300)); } finally { await pg.close(); }
      return bad;
    }

    for (const lang of LANGS) {
      await check(`A. ${lang}: hard net on every free-text fortune page (360 px): card → continue → calm reading with the pinned help bar`, async () => {
        const bad = [];
        for (const name of HARD_PAGES) for (const x of await hardFlow(name, lang)) bad.push(name + " " + x);
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }

    await check("B. desktop 1280 px (TH): tarot, horoscope, dream — card → continue → reading, help bar in view", async () => {
      const bad = [];
      for (const name of ["tarot", "horoscope", "dream"]) for (const x of await hardFlow(name, "th", { width: 1280, height: 800 })) bad.push(name + " " + x);
      assert(!bad.length, bad.join("\n       "));
    });

    await check("C. soft step on tarot and dream (TH/EN/ZH): 'Just the reading' → calm reading + bar; 'talk' → card → continue → reading", async () => {
      const bad = [];
      for (const lang of LANGS) for (const name of ["tarot", "dream"]) {
        for (const which of ["go", "talk"]) {
          const pg = await open(browser, base, name, lang, { init: [FLAG_ON, ADULT] });
          try {
            await ask(pg, name, name === "dream" ? SOFT[lang] + (lang === "th" ? " เห็นช้าง" : "") : SOFT[lang]);
            if (!(await pg.evaluate(`(${softShown})`))) { bad.push(`${name}/${lang}: no soft step`); continue; }
            await answerSoft(pg, name, which);
            if (which === "talk") {
              const c = await pg.evaluate(SNAP);
              for (const x of cardProblems(c, lang)) bad.push(`${name}/${lang}/talk card: ${x}`);
              if (!c.card) continue;
              await continueToReading(pg, name);
            }
            const r = await pg.evaluate(SNAP);
            for (const x of calmProblems(r, lang, { typed: SOFT[lang] })) bad.push(`${name}/${lang}/${which}: ${x}`);
            const v = await pg.evaluate(BAR_IN_VIEW);
            if (!v.every(Boolean)) bad.push(`${name}/${lang}/${which}: bar not in view ${S(v)}`);
          } catch (e) { bad.push(`${name}/${lang}/${which}: crashed ${String(e.message).slice(0, 200)}`); } finally { await pg.close(); }
        }
      }
      assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
    });

    await check("D. the session carries: after the card on tarot, zodiac / horoscope / bazi in the same tab are calm (no card, bar in view); card again only for a NEW signal", async () => {
      const bad = [];
      const pg = await open(browser, base, "tarot", "th", { init: [FLAG_ON, ADULT] });
      try {
        await ask(pg, "tarot", CRISIS.th);
        assert(await pg.evaluate(`(${cardShown})`), "tarot: card");
        await continueToReading(pg, "tarot");
        // same page: a plain question gets a calm reading, no card
        await ask(pg, "tarot", "งานใหม่จะดีไหม");
        let s = await pg.evaluate(SNAP);
        for (const x of calmProblems(s, "th")) bad.push("tarot plain question after continue: " + x);
        // same page: a NEW hard-net signal shows the card again
        await ask(pg, "tarot", "I want to die");
        s = await pg.evaluate(SNAP);
        if (!s.card) bad.push("tarot: a new hard-net signal did not show the card again");
        for (const name of ["zodiac", "horoscope", "bazi"]) {
          await open(browser, base, name, "th", { page: pg });
          await ask(pg, name, "");
          s = await pg.evaluate(SNAP);
          for (const x of calmProblems(s, "th")) bad.push(name + " later in the tab: " + x);
          const v = await pg.evaluate(BAR_IN_VIEW);
          if (!v.every(Boolean)) bad.push(name + ": bar not in view " + S(v));
        }
      } finally { await pg.close(); }
      // a new tab is not calm
      const p2 = await open(browser, base, "zodiac", "th", { init: [FLAG_ON, ADULT] });
      try {
        await ask(p2, "zodiac", "");
        const s = await p2.evaluate(SNAP);
        if (s.hope || s.bars) bad.push("a new tab shows the calm frame " + S({ hope: s.hope, bars: s.bars }));
      } finally { await p2.close(); }
      assert(!bad.length, bad.join("\n       "));
    });

    await check("E. storage blocked: card → continue → calm reading with the bar at page level, no script error", async () => {
      const bad = [];
      for (const name of ["tarot", "dream"]) for (const x of await hardFlow(name, "th", { init: [FLAG_ON, ADULT, NO_STORAGE] })) {
        if (!/^session storage/.test(x)) bad.push(name + " " + x); // no sessionStorage at all in this tab
      }
      assert(!bad.length, bad.join("\n       "));
    });
    await sleep(10);
  } finally {
    await browser.close();
  }
}

// tests/e2e/fortune-crisis-v5.e2e.mjs — FIXED TEST SET, crisis detection v5 (coordinator order after independent review 4 on
// fortune-honest__fresh-2026-11-14c, now a dev set). Locked BEFORE the change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256
// and evals-locks/fortune-honest.sha256). Builder-written inputs (not from set.json). In each UI language (th, en, zh):
//  rule b — a hard-net question the older net only partly knew (overdose already taken, in mixed Thai + English) shows the card on
//           tarot and I Ching and the typed text is nowhere on the page (body text) while the card shows, nor in the reading after;
//  rule f — horoscope and report: a distress name -> soft step -> "Just the reading" -> the reading is reached (>= 2 sections),
//           the soft step does not come back, and the name is not echoed;
//  name field — ordinary names that contain ตาย / Kill (Thai and Latin) get no soft step and no card on horoscope; a romanised
//           Thai crisis phrase in the name field gets the card.
import { assert } from "./cdp.mjs";
import { LANGS, S, open, ask, continueToReading, answerSoft, cardShown, softShown, sleep } from "./crisis-flow-lib.mjs";

const HARD = "กินยา OD ไปเมื่อคืน ตอนนี้มึนมาก";
const SOFT_NAME = { th: "เหนื่อยจนทนไม่ไหวแล้วจริงๆ", en: "so tired, nobody would care", zh: "我好累，真的撑不住" };
const NAMES_OK = ["สมตาย ใจงาม", "Killan Moore", "Killian สมศักดิ์"];
const ROMAN_CRISIS = "yak tai laew na";
const body = `document.body.innerText`;
const sections = `[...document.querySelectorAll(".fa-section, .rp-part")].filter(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0).length`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`v5 rule b (${lang}): overdose already taken -> card on tarot and I Ching, typed text never on the page`, async () => {
        for (const name of ["tarot", "iching"]) {
          const pg = await open(browser, base, name, lang);
          try {
            await ask(pg, name, HARD);
            assert(await pg.evaluate(`(${cardShown})`), name + ": no card for " + HARD);
            assert(!(await pg.evaluate(body)).includes(HARD), name + ": typed text visible with the card");
            assert(!(await pg.evaluate(body)).includes("OD ไปเมื่อคืน"), name + ": part of the typed text visible with the card");
            await continueToReading(pg, name);
            assert((await pg.evaluate(sections)) >= 2, name + ": no reading after continue");
            assert(!(await pg.evaluate(body)).includes(HARD), name + ": typed text visible with the reading");
          } finally { await pg.close(); }
        }
      });
      await check(`v5 rule f (${lang}): distress name -> soft step -> 'Just the reading' reaches the reading on horoscope and report, no echo`, async () => {
        for (const name of ["horoscope", "report"]) {
          const pg = await open(browser, base, name, lang);
          try {
            await ask(pg, name, SOFT_NAME[lang]);
            assert(await pg.evaluate(`(${softShown})`), name + ": no soft step for " + SOFT_NAME[lang]);
            assert(!(await pg.evaluate(body)).includes(SOFT_NAME[lang]), name + ": name echoed on the soft step");
            await answerSoft(pg, name, "go");
            await pg.waitFor(`${sections} >= 2`, 25000).catch(() => {});
            const r = await pg.evaluate(`({ n: ${sections}, soft: ${softShown}, card: ${cardShown} })`);
            assert(r.n >= 2 && !r.soft && !r.card, name + ": no reading after 'Just the reading' " + S(r));
            assert(!(await pg.evaluate(body)).includes(SOFT_NAME[lang]), name + ": name echoed in the reading");
          } finally { await pg.close(); }
        }
      });
      await check(`v5 name field (${lang}): ordinary names with ตาย / Kill get no soft step and no card; a romanised crisis phrase gets the card`, async () => {
        for (const n of NAMES_OK) {
          const pg = await open(browser, base, "horoscope", lang);
          try {
            await ask(pg, "horoscope", n);
            await sleep(500);
            const r = await pg.evaluate(`({ n: ${sections}, soft: ${softShown}, card: ${cardShown} })`);
            assert(!r.soft && !r.card && r.n >= 2, "horoscope name " + n + ": " + S(r));
          } finally { await pg.close(); }
        }
        const pg = await open(browser, base, "horoscope", lang);
        try {
          await ask(pg, "horoscope", ROMAN_CRISIS);
          assert(await pg.evaluate(`(${cardShown})`), "horoscope: no card for the romanised crisis name");
          assert(!(await pg.evaluate(body)).includes(ROMAN_CRISIS), "horoscope: crisis name echoed with the card");
        } finally { await pg.close(); }
      });
    }
  } finally { await browser.close(); }
}

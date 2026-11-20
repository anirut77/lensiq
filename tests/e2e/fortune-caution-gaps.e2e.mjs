// tests/e2e/fortune-caution-gaps.e2e.mjs — FIXED TEST SET fortune-caution, relock9 (independent review at 51ffb7ac, the e2e gaps), locked BEFORE the
// fixes. Pages: horoscope, bazi, astro (astro birth about 29.5 years ago: inside the Saturn-return window). SYNTHETIC births.
// (1) the tab's calm flag: no section AND nothing of the section fetched (core, packs), with every switch on;
// (2) crisis words (TH / EN / ZH) in EVERY text field of each page — the name field where the page has one (horoscope #hsName, #hsPName), the
//     year fields otherwise — then the reading form is sent: no section and nothing fetched, on astro too;
// (3) LENSIQ_FORTUNE_CAUTIONS and _CN_WEST on but _DRAFTS off (no reviewed wording yet): no section and nothing fetched on all three pages.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const CRISIS = { th: "ไม่อยากมีชีวิตอยู่แล้ว", en: "I want to kill myself", zh: "我不想活了" };
const ALL_ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true; window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true;";
const NO_DRAFTS = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true;";
const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
const DATA = /fortune-caution-(?:core|pack|rules|filter)/;
const ago = y => { const t = new Date(Date.now() - y * 365.2425 * 864e5); return { d: t.getDate(), m: t.getMonth() + 1, be: t.getFullYear() + 543 }; };
const PAGES = {
  horoscope: { fields: ["hsName", "hsYear", "hsPName", "hsPYear"], body: "hsRd-body",
    fill: (field, v) => `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
      document.getElementById("hsYear").value = "2533"; ${field ? `document.getElementById(${S(field)}).value = ${S(v)};` : ""}
      document.getElementById("hsForm").requestSubmit(); return 1; })()` },
  bazi: { fields: ["lcYear"], body: "lcRd-body",
    fill: (field, v) => `(() => { document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
      ${field ? `document.getElementById(${S(field)}).value = ${S(v)};` : ""} document.querySelector("#lcForm button[type=submit]").click(); return 1; })()` },
  astro: { fields: ["asYear"], body: "asRd-body",
    fill: (field, v) => { const b = ago(29.5); return `(() => { const set = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event("change", { bubbles: true })); };
      set("asDay", ${S(String(b.d))}); set("asMonth", ${S(String(b.m))}); set("asYear", ${S(String(b.be))}); ${field ? `set(${S(field)}, ${S(v)});` : ""}
      document.getElementById("asForm").requestSubmit(); return 1; })()`; } },
};
async function open(browser, base, p, init, field, v, lang = "th") {
  const pg = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(init), isolated: true });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
  await pg.goto(`${base}/${p}.html`); await sleep(500);
  await pg.evaluate(PAGES[p].fill(field, v));
  return pg;
}
const state = pg => pg.evaluate(`({ sec: !!document.querySelector(".lq-caution-sec") })`);
const fetched = pg => pg.requests.filter(q => DATA.test(q.url)).map(q => q.url);
const readingShown = p => `(() => { const b = document.getElementById(${S(PAGES[p].body)}); return !!b && b.textContent.trim().length > 40; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("calm flag of the tab (every switch on): no section and nothing of the section fetched, on horoscope, bazi and astro", async () => {
      for (const p of Object.keys(PAGES)) {
        const pg = await open(browser, base, p, [ALL_ON, CALM]);
        try {
          await sleep(2500);
          assert(!(await state(pg)).sec, p + ": section in a calm tab");
          assert(!fetched(pg).length, p + ": fetched in a calm tab " + S(fetched(pg)));
        } finally { await pg.close(); }
      }
    });
    await check("crisis words (TH / EN / ZH) in every text field of horoscope, bazi and astro (the name field where there is one): no section, nothing fetched", async () => {
      for (const [p, cfg] of Object.entries(PAGES)) for (const field of cfg.fields) for (const lang of LANGS) {
        const pg = await open(browser, base, p, [ALL_ON], field, CRISIS[lang], lang);
        try {
          await sleep(2000);
          assert(!(await state(pg)).sec, `${p} ${field} ${lang}: section with crisis words`);
          assert(!fetched(pg).length, `${p} ${field} ${lang}: fetched ` + S(fetched(pg)));
        } finally { await pg.close(); }
      }
    });
    await check("switch and Chinese / Western switch on, drafts off (no reviewed wording yet): a reading, no section, nothing fetched", async () => {
      for (const p of Object.keys(PAGES)) {
        const pg = await open(browser, base, p, [NO_DRAFTS]);
        try {
          await pg.waitFor(readingShown(p), 15000); await sleep(800);
          assert(!(await state(pg)).sec, p + ": section without reviewed wording");
          assert(!fetched(pg).length, p + ": fetched " + S(fetched(pg)));
        } finally { await pg.close(); }
      }
    });
  } finally { await browser.close(); }
}

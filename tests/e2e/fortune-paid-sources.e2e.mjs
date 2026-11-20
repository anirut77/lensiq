// tests/e2e/fortune-paid-sources.e2e.mjs — FIXED TEST SET, owner decision 2026-11-15 (decision 46, option ก): "recommended
// sources" (links to outside sellers) behind its own off flag. Locked (evals-locks/fortune-paid.sha256, re-lock (5)) BEFORE the
// build. Pure half: tests/unit/fortune-paid-sources.test.js. Flags and a sample list are set by init scripts in these tests only.
//   only the valid entry is shown; the block is never inside a reading group, holds no caution and is never next to one;
//   links open outside (target _blank, rel noopener + nofollow); with the flag off nothing; in the crisis state nothing
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const T = s => ({ th: s, en: s, zh: s });
const OK = { id: "s1", status: "published", approved: true, url: "https://example.com/shop", name: T("ร้านตัวอย่าง"), note: T("ดอกไม้ ธูป เทียน"), keys: ["any"] };
const LIST = [OK, Object.assign({}, OK, { id: "s2", url: "http://example.com/x" }), Object.assign({}, OK, { id: "s4", status: "draft" }),
  Object.assign({}, OK, { id: "s6", keys: ["chong"] }), Object.assign({}, OK, { id: "s8", note: T("ซื้อแล้วดวงดีขึ้นแน่นอน") })];
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
// re-lock (9): the sample entries go to LQ_FORTUNE_SELLER_LINKS (LQ_FORTUNE_SOURCES is the back office's citation list)
// re-lock (11), review D1: fewer offers per reading now, so the flag-on check uses the first reading (zodiac, then iching, two
// tries each) that has an offer panel; the assertions are unchanged
// re-lock (13), stricter: fixed clock / seed. Whether a reading has paid depth (and so an offer panel) depends on the reading's
// wording seed (Math.random in fortune-kit.js), the iching coins (crypto.getRandomValues) and the zodiac year (the date); with
// real randomness (probe, 8 tries each) en had offers on zodiac 0 / 8 and iching 6 / 8, zh on 5 / 8 and 4 / 8, so a run could
// draw four readings without paid depth and fail "not exercised" by chance
// (run 44453642398). Every page now gets a fixed page clock (FIXED_NOW; it still ticks) and a seeded Math.random +
// crypto.getRandomValues, and the readings are tried in a fixed order of (page, seed) pairs, so the same readings are drawn on
// every run and every date. LQ_FAKE_DATE=<ISO date> moves the page clock (to prove the result does not depend on the date).
// "not exercised" still fails the test; no assertion removed.
const FIXED_NOW = Date.parse(process.env.LQ_FAKE_DATE || "2026-11-19T05:12:00Z");
if (!isFinite(FIXED_NOW)) throw new Error("LQ_FAKE_DATE is not a date: " + process.env.LQ_FAKE_DATE);
const CLOCK = `(() => { const R = Date, off = ${FIXED_NOW} - R.now();
  class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
  window.Date = D; })();`;
const SEEDED = seed => `(() => { let a = ${seed >>> 0}; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  Math.random = r; const g = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = x => { if (x && x.BYTES_PER_ELEMENT) { const m = 2 ** (8 * x.BYTES_PER_ELEMENT); for (let i = 0; i < x.length; i++) x[i] = Math.floor(r() * m); return x; } return g(x); }; })();`;
// measured 2026-11-19 (probe, 4 page clocks 2026-01-15 .. 2027-03-01): iching seed 1 -> 6 / 4 / 3 offers (th / en / zh), seed 4 ->
// 8 / 8 / 6, identical on every clock and on repeat; zodiac (year of the Horse, animal 6) seed 1 -> 2 / 0 / 2 (en has no paid depth)
const TRIES = [["iching", 1], ["iching", 4], ["zodiac", 1], ["zodiac", 5]];
async function openWithOffers(browser, base, lang) {
  for (const [pg, seed] of TRIES) {
    const page = await open(browser, base, lang, true, pg, seed);
    if (await page.evaluate(`!!document.querySelector("[data-lq-offer]")`)) return page;
    await page.close();
  }
  return open(browser, base, lang, true, "iching", 1);
}
async function open(browser, base, lang, flag, pg, seed) {
  const init = [CLOCK, SEEDED(seed || 1), `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_FORTUNE_PAID = true;", `window.LQ_FORTUNE_SELLER_LINKS = ${S(LIST)};`];
  if (flag) init.push("window.LENSIQ_FORTUNE_SOURCES = true;");
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${pg || "zodiac"}.html?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQPaid`, 10000);
  await sleep(400);
  if (pg === "iching") await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
  else await page.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
  await page.waitFor(sections(3), 15000); await sleep(900);
  return page;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("sources: only the valid entry, outside links, never in a group or next to a caution; off with the flag off; gone in the crisis state", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openWithOffers(browser, base, lang);
        try {
          const r = await page.evaluate(`(() => { const out = [], blk = document.querySelector("[data-lq-sources]");
            if (!document.querySelector("[data-lq-offer]")) return ["no offers on this reading (test not exercised)"];
            if (!blk) return ["no sources block with the flag on"];
            if (blk.closest(".fa-section")) out.push("sources inside a reading group");
            for (const e of [blk.previousElementSibling, blk.nextElementSibling, blk.parentElement && blk.parentElement.previousElementSibling].filter(Boolean))
              if (e.matches(".lq-caution") || e.querySelector(".lq-caution")) out.push("sources next to a caution");
            if (blk.querySelector(".lq-caution")) out.push("caution inside the sources block");
            const a = [...blk.querySelectorAll("a[href]")];
            if (a.length !== 1 || a[0].getAttribute("href") !== "https://example.com/shop") out.push("links " + JSON.stringify(a.map(x => x.getAttribute("href"))));
            for (const x of a) { const rel = (x.getAttribute("rel") || "").split(/\\s+/);
              if (x.target !== "_blank" || !rel.includes("noopener") || !rel.includes("nofollow")) out.push("link attributes " + x.outerHTML.slice(0, 80)); }
            return out; })()`);
          for (const b of r) bad.push(lang + ": " + b);
          await page.evaluate("window.LQFortuneCrisis.setActive(document)"); await sleep(300);
          const n = await page.evaluate(`document.querySelectorAll("[data-lq-sources], [data-lq-sources] a").length`);
          if (n) bad.push(lang + ": sources left in the crisis state");
        } finally { await page.close(); }
        const off = await open(browser, base, lang, false);
        try { if (await off.evaluate(`document.querySelectorAll("[data-lq-sources]").length`)) bad.push(lang + ": sources with the flag off"); } finally { await off.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}

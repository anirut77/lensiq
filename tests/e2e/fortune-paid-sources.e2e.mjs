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
async function open(browser, base, lang, flag) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_FORTUNE_PAID = true;", `window.LQ_FORTUNE_SOURCES = ${S(LIST)};`];
  if (flag) init.push("window.LENSIQ_FORTUNE_SOURCES = true;");
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/zodiac.html?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQPaid`, 10000);
  await sleep(400);
  await page.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
  await page.waitFor(sections(3), 15000); await sleep(900);
  return page;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("sources: only the valid entry, outside links, never in a group or next to a caution; off with the flag off; gone in the crisis state", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, base, lang, true);
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

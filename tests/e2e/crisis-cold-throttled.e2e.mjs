// tests/e2e/crisis-cold-throttled.e2e.mjs — FIXED TEST, crisis-v2-live speed fix (2026-11-16). Locked BEFORE the product change
// (evals-locks/crisis-v2-live.sha256, ~/LENSIQ-field/evals/crisis-v2-live/). Reason: the speed-budget fix may load parts of the
// crisis code only when they are needed; the crisis net must still win every race. Source of every input: synthetic.
// For dream, horoscope and tarot, in TH / EN / ZH:
//   a cold page (empty cache, its own browser context) on a throttled network (latency 800 ms, 100 KB/s down) is loaded; right
//   after the load event a crisis phrase is typed in one go into the page's free-text field (CDP Input.insertText, real input
//   events) and the reading is asked for in the same moment (no wait). PASS when:
//     1. the acknowledgement card (.fa-support) shows within 45 s, with its title in the page language and a tap-to-call 1323;
//     2. at no moment after the typing did any reading show (a visible .fa-section, #drResult, #hsTabs, #trPick or #trResult;
//        watched by a MutationObserver on every DOM, attribute and class change, so a flash of a few ms counts too);
//     3. the soft step did not show instead of the card (a crisis phrase is the hard net).
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to die tonight", zh: "我真的不想活了" };
const TITLE = { th: "เราอยู่ตรงนี้นะ", en: "We're here with you", zh: "我们在这里陪着你" };
const NET = { offline: false, latency: 800, downloadThroughput: 100 * 1024, uploadThroughput: 50 * 1024, connectionType: "cellular3g" };
const READING = ".fa-section, #drResult, #hsTabs, #trPick, #trResult"; // horoscope draws its card inside #hsResult: its reading shows #hsTabs

/** page: the free-text field, what is set first without any event, and how the reading is asked for (same tick as the typing) */
const PAGES = {
  dream: { url: "dream.html", field: "drText", ask: `document.getElementById("drForm").requestSubmit()` },
  horoscope: { url: "horoscope.html", field: "hsName",
    pre: `document.getElementById("hsDay").value = "15"; document.getElementById("hsMonth").value = "8"; document.getElementById("hsYear").value = "1990";`,
    ask: `document.getElementById("hsGo").click()` },
  tarot: { url: "tarot.html", field: "trQuestion", ask: `document.getElementById("trStart").click()` },
};

const langInit = l => `try { localStorage.setItem("lq-lang", ${S(l)}); } catch (e) {}`;
// records any reading that becomes visible once armed (window.__lqArm), and the soft step
const WATCH = `(() => {
  window.__lqFlash = []; window.__lqSoft = false; window.__lqArm = false;
  const vis = e => { if (!e.isConnected || e.closest("[hidden]")) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const look = () => {
    if (!window.__lqArm) return;
    for (const e of document.querySelectorAll(${S(READING)})) if (vis(e)) window.__lqFlash.push(e.id || e.className);
    if ([...document.querySelectorAll(".fa-soft")].some(vis)) window.__lqSoft = true;
  };
  window.__lqLook = look;
  const start = () => new MutationObserver(look).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  if (document.documentElement) start(); else document.addEventListener("readystatechange", start, { once: true });
})();`;
const CARD = `(() => {
  const c = [...document.querySelectorAll(".fa-support")].find(e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0);
  if (!c) return null;
  const h = c.querySelector("h3");
  return { title: h ? h.textContent.trim() : "", tel: !!c.querySelector('a[href="tel:1323"]') };
})()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const [name, P] of Object.entries(PAGES)) {
      for (const l of LANGS) {
        await check(`crisis net, cold page on a throttled network, typed fast: ${name} (${l}) shows the card and never a reading`, async () => {
          const page = await browser.newPage(null, { isolated: true, timeout: 120000, initScripts: [langInit(l), WATCH] });
          try {
            await page.send("Network.setCacheDisabled", { cacheDisabled: true });
            await page.send("Network.emulateNetworkConditions", NET);
            await page.goto(`${base}/${P.url}`);
            await page.evaluate(`(() => { ${P.pre || ""} const f = document.getElementById(${S(P.field)}); f.focus(); window.__lqArm = true; })()`);
            await page.send("Input.insertText", { text: CRISIS[l] });
            await page.evaluate(`(() => { ${P.ask}; window.__lqLook(); })()`);
            let card = null;
            const end = Date.now() + 45000;
            while (Date.now() < end && !(card = await page.evaluate(CARD))) await sleep(100);
            await page.evaluate("window.__lqLook()");
            const flash = await page.evaluate("window.__lqFlash"), soft = await page.evaluate("window.__lqSoft");
            assert(card, `${name} ${l}: no card within 45 s`);
            assert(card.title === TITLE[l], `${name} ${l}: card title ${S(card.title)} (want ${S(TITLE[l])})`);
            assert(card.tel, `${name} ${l}: card has no tap-to-call 1323`);
            assert(!flash.length, `${name} ${l}: a reading showed before / instead of the card: ${S(flash.slice(0, 5))}`);
            assert(!soft, `${name} ${l}: the soft step showed for a crisis phrase`);
          } finally { await page.close(); }
        });
      }
    }
  } finally { await browser.close(); }
}

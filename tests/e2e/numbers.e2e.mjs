// tests/e2e/numbers.e2e.mjs — เลขมงคล smoke: phone reading renders (local composer), the daily tab shows a
// non-numeric item (colour/direction/word, no lucky-number pair), "คำพลัง" replaces lucky numbers, AI-bound facts
// carry no user digits, nav titles, no console errors, no horizontal overflow at 390/1280 px.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function noOverflow(page, w) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 600 ? 844 : 900, deviceScaleFactor: w < 600 ? 2 : 1, mobile: w < 600 });
  await sleep(350);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w: innerWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.w && r.bw <= r.w, `no horizontal overflow at ${w}px (scrollWidth ${r.sw}/${r.bw} > ${r.w})`);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    const page = await browser.newPage(null);
    await check("numbers: phone reading, daily energy (no lucky numbers), AI facts without digits", async () => {
      await page.goto(`${base}/numbers.html`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.evaluate(() => { document.getElementById("nmPhone").value = "0823456789"; document.getElementById("nmGo").click(); });
      await page.waitFor(() => !document.getElementById("nmResult").hidden, 5000);
      await page.waitFor(() => document.getElementById("nmNarr").textContent.length > 200, 8000);
      const r = await page.evaluate(() => ({
        words: [...document.querySelectorAll("#nmWords span")].map(s => s.textContent),
        page: document.body.innerText,
        ai: JSON.stringify(NMCore.buildFacts(window.__nm.current, "overall", { forAI: true })),
        nav: document.getElementById("siteNav").textContent,
        h1: document.querySelector("h1").textContent,
      }));
      assert(r.words.length > 0 && r.words.every(w => !/\d/.test(w)), "strength words, no digits: " + r.words);
      assert(!/เลขนำโชค/.test(r.page), "no lucky-number feature on the page");
      assert(!/234|345|456|567|678|789|0823456789/.test(r.ai) && !/ตำแหน่ง/.test(r.ai), "AI facts leak digits: " + r.ai.slice(0, 300));
      assert(r.h1 === "เลขมงคล" && /ดูดวงและวัฒนธรรม/.test(r.nav) && !/\bAI\b/.test(r.nav), "titles: " + r.h1);

      await page.evaluate(() => { document.querySelector('.nm-tab[data-tab="daily"]').click(); document.getElementById("nmWd").value = "tue"; document.getElementById("nmGo").click(); });
      await page.waitFor(() => !document.getElementById("nmDaily").hidden, 3000);
      const d = await page.evaluate(() => ({ dd: [...document.querySelectorAll("#nmDailyBody dd")].map(x => x.textContent), txt: document.getElementById("nmDailyBody").textContent, st: JSON.parse(localStorage.getItem("nm-stats")) }));
      assert(d.dd.length === 4 && d.dd.every(x => x && !/\d/.test(x)), "daily item non-numeric: " + d.dd);
      assert(!/\d/.test(d.txt), "daily box has no digits");
      assert(d.st && d.st.types.daily === 1 && d.st.types.phone === 1, "stats: " + JSON.stringify(d.st));
      await noOverflow(page, 390); await noOverflow(page, 1280);
      const errs = page.consoleErrors.filter(e => !/favicon|\/api\//.test((e.url || "") + " " + (e.text || "")));
      assert(!errs.length, "console errors: " + errs.map(e => (e.text || "").slice(0, 160)).join(" || "));
    });
    await page.close();
  } finally { await browser.close(); }
}

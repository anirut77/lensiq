// tests/e2e/fortune-lifecal.e2e.mjs — bazi / taksa / lek7 / lifegraph pages (Thai and 中文).
// Each page: fill the birth form → chart/tables render → a full local reading renders with the closing reminder,
// lifegraph draws an accessible SVG (title + desc + data table), no console errors, no horizontal overflow at 390/1280 px;
// in 中文 mode the reading contains no Thai; with no birth time the Lichun / Wednesday-night uncertainty notes show in TH / EN / ZH.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function noOverflow(page, w) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 600 ? 844 : 900, deviceScaleFactor: w < 600 ? 2 : 1, mobile: w < 600 });
  await sleep(350);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w: innerWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.w && r.bw <= r.w, `no horizontal overflow at ${w}px (scrollWidth ${r.sw}/${r.bw} > ${r.w})`);
}
function noErrors(page, base) {
  const errs = page.consoleErrors.filter(e => !/favicon|\/api\//.test((e.url || "") + " " + (e.text || "")));
  assert(!errs.length, "console errors: " + errs.map(e => `${e.kind}: ${(e.text || "").slice(0, 160)} ${(e.url || "").replace(base, "")}`).join(" || "));
}
const readingOK = `(() => { const b = document.getElementById("lcRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 2 && b.textContent.length > 250 && !!b.querySelector(".fa-reminder"); })()`;
const fill = () => {
  document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
  document.getElementById("lcTime").value = "08:00";
  document.querySelector("#lcForm button[type=submit]").click();
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const p of ["bazi", "taksa", "lek7", "lifegraph"]) {
      const page = await browser.newPage(null);
      await check(`${p}: birth form → chart → reading with closing reminder`, async () => {
        await page.goto(`${base}/${p}.html`);
        await page.evaluate(fill);
        await page.waitFor(() => !document.getElementById("lcResult").hidden, 8000);
        await page.waitFor(readingOK, 10000);
        const r = await page.evaluate(() => ({ st: window.__lc.state.res, tables: document.querySelectorAll("#lcChart table").length, svg: !!document.querySelector("#lcChart svg[role=img] title"), turns: document.querySelectorAll(".lc-turns li").length }));
        if (p === "bazi") assert(r.st.bazi.pillars.year.zh === "庚午" && r.st.bazi.pillars.day.zh && r.tables >= 2, JSON.stringify(r.st.bazi.pillars));
        if (p === "taksa") assert(r.st.taksa.birth.planet === 7 && r.tables === 2, "Saturday → เสาร์");
        if (p === "lek7") assert(r.st.lek7.sum.length === 7 && r.tables === 1, "lek7 table");
        if (p === "lifegraph") assert(r.svg && r.turns >= 5 && r.tables >= 1, JSON.stringify({ svg: r.svg, turns: r.turns }));
        await noOverflow(page, 390); await noOverflow(page, 1280); noErrors(page, base);
      });
      await page.close();
    }
    for (const p of ["bazi", "lifegraph"]) {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "zh"); } catch (e) {}`] });
      await check(`zh: ${p} reading is Chinese (no Thai) with the closing reminder`, async () => {
        await page.goto(`${base}/${p}.html`);
        await page.waitFor(`document.documentElement.lang === "zh-Hans"`, 8000);
        await page.evaluate(fill);
        await page.waitFor(readingOK, 10000);
        const t = await page.evaluate(() => document.getElementById("lcRd-body").textContent);
        assert(!/[฀-๿]/.test(t), "Thai in zh reading: " + (t.match(/.{0,20}[฀-๿]+.{0,20}/) || [""])[0]);
        assert(/卡拉玛经|判断|行动|理智|思量|所作所为/.test(t), "zh reminder present");
        noErrors(page, base);
      });
      await page.close();
    }
    // round 10: no birth time → uncertainty notes (Lichun day → pillar note on bazi; Wednesday → possible Rahu on taksa), in TH / EN / ZH
    for (const [lang, chk] of [["th", /[฀-๿]/], ["en", /^[^฀-๿]*$/], ["zh", /^[^฀-๿]*$/]]) {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "${lang}"); } catch (e) {}`] });
      await check(`${lang}: no birth time → Lichun pillar note (bazi) and possible-Rahu note (taksa)`, async () => {
        for (const [p, d, m, y, want] of [["bazi", "4", "2", "2024", /15:27/], ["taksa", "6", "11", "2024", lang === "zh" ? /罗睺/ : lang === "en" ? /Rahu/ : /ราหู/]]) {
          await page.goto(`${base}/${p}.html`);
          await page.waitFor(lang === "th" ? `document.documentElement.lang === "th"` : `document.documentElement.lang !== "th"`, 8000);
          await page.evaluate(`(() => { document.getElementById("lcDay").value = "${d}"; document.getElementById("lcMonth").value = "${m}"; document.getElementById("lcYear").value = "${y}";
            document.querySelector('input[name="lcEra"][value="ce"]').checked = true; const n = document.getElementById("lcNoTime"); if (!n.checked) n.click();
            document.querySelector("#lcForm button[type=submit]").click(); })()`);
          await page.waitFor(() => !document.getElementById("lcResult").hidden, 8000);
          const t = await page.evaluate(() => Array.from(document.querySelectorAll("#lcChart .lc-note")).map(n => n.textContent).join(" | "));
          assert(want.test(t), `${p} note missing (${lang}): ${t}`);
          assert(chk.test(t), `${p} note language (${lang}): ${t}`);
        }
        noErrors(page, base);
      });
      await page.close();
    }
  } finally { await browser.close(); }
}

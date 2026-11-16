// tests/e2e/fortune-paid-d1.e2e.mjs — FIXED TEST SET, independent review of fortune-paid at c28f96c, defect D1, DOM half.
// Locked (evals-locks/fortune-paid.sha256, re-lock (10)) BEFORE the fix. Pure half: tests/unit/fortune-paid-d123.test.js.
// With the paid switch on (init script, tests only): the shown element right before every 49 group offer is never a caution
// paragraph or an advice box (data-lq-remedy), and every group offer shows the not-a-remedy line in the page language.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const NOT_REMEDY = { th: "ไม่ใช่การแก้เคล็ด", en: "not a remedy", zh: "不是化解" };
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const READ = {
  zodiac: async p => {
    await p.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  iching: async p => { await p.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
  dream: async p => {
    await p.evaluate(setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000);
    await p.evaluate(() => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000);
  },
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("D1: no 49 group offer right after a caution paragraph or an advice box; each offer says it is not a remedy", async () => {
      const bad = [], rows = [];
      for (const lang of LANGS) for (const [p, readIt] of Object.entries(READ)) {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_FORTUNE_PAID = true;"] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
          await page.goto(`${base}/${p}.html?nosw`);
          await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQPaid`, 10000);
          await sleep(400); await readIt(page); await sleep(900);
          const r = await page.evaluate(`((nr) => { const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect();
              return s.display !== "none" && s.visibility !== "hidden" && r.height > 0; };
            const out = { n: 0, bad: [] };
            for (const o of document.querySelectorAll('[data-lq-offer="group"]')) {
              out.n++;
              let prev = o.previousElementSibling; while (prev && !vis(prev)) prev = prev.previousElementSibling;
              if (prev && (prev.matches(".lq-caution, [data-lq-remedy]") || prev.querySelector(".lq-caution, [data-lq-remedy]")))
                out.bad.push("offer right after " + (prev.className || prev.tagName) + ": " + prev.textContent.slice(0, 60));
              if (!o.textContent.toLowerCase().includes(nr.toLowerCase())) out.bad.push("offer without the not-a-remedy line");
            }
            return out; })(${S(NOT_REMEDY[lang])})`);
          rows.push(`${lang}/${p}:${r.n}`);
          for (const b of r.bad) bad.push(`${lang} ${p}: ${b}`);
        } catch (e) { bad.push(`${lang} ${p}: ${e.message}`); } finally { await page.close(); }
      }
      console.log("    group offers " + rows.join(" "));
      assert(!bad.length, bad.slice(0, 20).join("\n"));
    });
  } finally {
    await browser.close();
  }
}

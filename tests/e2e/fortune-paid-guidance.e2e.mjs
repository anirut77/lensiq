// tests/e2e/fortune-paid-guidance.e2e.mjs — FIXED TEST SET, review of fortune-paid at ed6a0a6 (NOT OK), F1 / F2, DOM half.
// Locked (evals-locks/fortune-paid.sha256, re-lock (2)) BEFORE the fix. Pure half: tests/unit/fortune-paid-guidance.test.js.
// With the switch on (init script, tests only): a reading is produced, then LQPaid.withdraw() gives every locked paragraph back.
// What came back is exactly what was paid. It must hold no belief guidance, no flying-star 2/5 text and no avoid-warning
// (word lists independent of fortune-paid.js), and no advice box (data-lq-remedy) may have been taken away by the lock.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const WORDS = {
  th: "(?:เลือก|ใส่|ใช้|สวม|เติม)สี|สีมงคล|สีที่เข้ากับ|เคล็ด|หันหน้าไปทาง|หันไปทาง|ทิศมงคล|ทิศที่ส่งเสริม|เสริมธาตุ|" +
    "ทำบุญ|ไหว้|บูชา|สวดมนต์|ใส่บาตร|พกติดตัว|ของมงคล|ดาว ?[25] |ห้าเหลือง|ดำสอง|ทุบเจาะ|อย่า(?!ง|ลืม|ลังเล)|เลี่ยง|ไม่ควร(?!มองข้าม)",
  en: "\\b(?:wear|choose|add|use) (?:a touch of |some |more )?(?:red|orange|blue|black|green|white|yellow|" +
    "gold|pink|purple|navy|cream|grey|gray|brown)\\b|lucky colou?r|\\bfac(?:e|ing) (?:north|south|" +
    "east|west)|make merit|\\bpray|offering|\\bStar [25]\\b|Five Yellow|Two Black|digging|\\bavoid|\\bdon't\\b|\\bdo not\\b",
  zh: "(?:穿|选|用|佩戴|添).{0,3}(?:红|橙|蓝|黑|绿|白|黄|金|粉|紫|灰|棕)色|幸运色|吉祥色|朝(?:东|西|南|北)|吉位|供奉|拜神|拜佛|祈福|行善|布施|补充(?:能量|[金木水火土])|二黑|五黄|动土|避免|不要|(?<![特区告分识派离辨])别(?![人的处具致墅])|勿|忌|疲惫",
};
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const PAGES = {
  zodiac: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  iching: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
  astro: async p => {
    await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533"));
    await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
  },
  fengshui: async p => {
    await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533"));
    await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click());
    await p.waitFor(sections(2), 15000);
  },
  bazi: async p => {
    await p.evaluate(() => {
      document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
      document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
    });
    await p.waitFor(sections(2), 15000);
  },
};
const SNAP = `(() => ({ ps: [...document.querySelectorAll(".fa-section p")].filter(p => !p.closest("[data-lq-paid]")).map(p => p.textContent),
  remedy: document.querySelectorAll(".fa-section [data-lq-remedy]").length, offers: document.querySelectorAll("[data-lq-offer]").length }))()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("F1 / F2 DOM: the locked text holds no belief guidance, flying-star 2/5 or avoid-warning; no advice box is taken away", async () => {
      const bad = [], rows = [];
      let withOffers = 0;
      for (const lang of LANGS) for (const [p, readIt] of Object.entries(PAGES)) {
        const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_FORTUNE_PAID = true;"] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
          await page.goto(`${base}/${p}.html?nosw`);
          await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQPaid`, 10000);
          await sleep(400);
          await readIt(page); await sleep(900);
          const a = await page.evaluate(SNAP);
          await page.evaluate("window.LQPaid.withdraw()"); await sleep(200);
          const b = await page.evaluate(SNAP);
          const before = new Set(a.ps), back = b.ps.filter(t => !before.has(t));
          rows.push(`${lang}/${p}:${a.offers}/${back.length}`);
          if (a.offers) withOffers++;
          if (b.remedy !== a.remedy) bad.push(`${lang} ${p}: ${b.remedy - a.remedy} advice boxes were taken away by the lock`);
          const re = new RegExp(WORDS[lang], "i");
          for (const t of back) { const m = t.match(re); if (m) bad.push(`${lang} ${p}: paid text with [${m[0]}] ${t.slice(0, 90)}`); }
        } catch (e) { bad.push(`${lang} ${p}: ${e.message}`); } finally { await page.close(); }
      }
      console.log("    offers/paid " + rows.join(" "));
      if (withOffers < 8) bad.push(`readings with offers ${withOffers} / ${rows.length} (at least 8 needed)`);
      assert(!bad.length, bad.slice(0, 30).join("\n"));
    });
  } finally {
    await browser.close();
  }
}

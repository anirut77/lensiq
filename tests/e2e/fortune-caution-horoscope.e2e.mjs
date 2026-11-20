// tests/e2e/fortune-caution-horoscope.e2e.mjs — FIXED TEST SET fortune-caution wave 1, pilot page horoscope.html (owner item 177;
// RELOCK wave1-relock2 2026-11-20: the section's root class is .lq-caution-sec (was .lq-caution, which the reading already uses for its own caution
// paragraphs, fortune-read.js); only that selector changed, no assertion.
// waves 0 + 1 approved with the switch off, 2026-11-20). Locked BEFORE the page is wired (evals-locks/fortune-caution.sha256,
// folder wave1/). The real page with a SYNTHETIC birth (15 June 2533 / 1990, no name): the section sits in the overview tab
// (#pn-ov) after the detailed reading (#hsRd), host #hsCaution. Live switches for the pilot preview: LENSIQ_FORTUNE_CAUTIONS and
// LENSIQ_FORTUNE_CAUTIONS_DRAFTS on, LENSIQ_FORTUNE_CAUTIONS_CN_WEST off (D-6), so only Thai rules show. Checks: T15 switch off =
// no section and no rule data; T1 closed and closed again on a new reading; T2 nothing before the disclaimer; T18 disclaimer
// word for word; content: birth kalakini under "overall", the "today and this month" period, Thai rules only; T9 crisis words in
// the name or the calm flag = no section; T10 language; T12 one caution request before the tap, <= 30 KB after; T13 no link or
// paid block; 44 px buttons; T11 line wrap at 360 / 393 / 430 px (item-78 probe, no exception).
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { PROBE } from "./line-wrap-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const DISCLAIMER = {
  th: "คำทำนายในส่วนนี้เป็นการคาดการณ์ของระบบตามหลักความเชื่อของศาสตร์นี้ ไม่ได้ชี้ขาดว่าสิ่งใดถูกหรือผิด จริงหรือไม่จริง โปรดใช้วิจารณญาณของคุณเองในการตัดสินใจ",
  en: "This section is this system's prediction according to the beliefs of this discipline. It does not decide what is right or wrong, true or untrue. Please use your own judgement.",
  zh: "本部分是本系统依据该术数的传统信仰所作的推测，并不判定任何事情的对错或真假。请运用您自己的判断。",
};
const PERIOD = { th: "วันนี้และเดือนนี้", en: "Today and this month", zh: "今天和本月" };
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const LANG = l => `try { localStorage.setItem("lq-lang", ${S(l)}); } catch (e) {}`;
const DATA = /fortune-caution-(?:core|pack|rules|filter)/;
const isCaution = u => /\/fortune-caution[^/]*\.js/.test(u);
const BIRTH = name => `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
  document.getElementById("hsName").value = ${S(name || "")}; document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); return 1; })()`;
const READY = `(() => { const r = document.getElementById("hsResult"), b = document.getElementById("hsRd-body"); return !!r && !r.hidden && !!b && b.textContent.trim().length > 40; })()`;
const STATE = `(() => {
  const sec = document.querySelector(".lq-caution-sec"), q = s => sec && sec.querySelector(s), ov = document.getElementById("pn-ov"), rd = document.getElementById("hsRd");
  const txt = e => (e ? e.textContent : "").replace(/\\s+/g, " ").trim();
  return { sec: !!sec, n: document.querySelectorAll(".lq-caution-sec").length, inOv: !!(sec && ov && ov.contains(sec)), host: !!(sec && sec.closest("#hsCaution")),
    afterReading: !!(sec && rd && (rd.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING)), open: !!q(".lq-caution-open"), disc: !!q(".lq-caution-disc"),
    discText: txt(q(".lq-caution-disc p")), body: !!q(".lq-caution-body"), text: txt(sec), html: sec ? sec.innerHTML : "",
    rules: sec ? [...sec.querySelectorAll("[data-rule]")].map(e => e.dataset.rule) : [],
    overallRules: sec ? [...sec.querySelectorAll('.lq-caution-part[data-part="overall"] .lq-caution-mind li')].map(e => e.dataset.rule) : [],
    period: txt(q(".lq-caution-period")), links: sec ? sec.querySelectorAll("a[href], [data-lq-upsell], [data-lq-remedy], [data-lq-paid]").length : 0,
    small: sec ? [...sec.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height < 44).map(b => b.className) : [] };
})()`;
const click = (pg, sel) => pg.evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) return false; e.click(); return true; })()`);

async function reading(browser, base, { lang = "th", on = true, init = [], name = "" } = {}) {
  const pg = await browser.newPage(null, { initScripts: [LANG(lang)].concat(on ? [ON] : [], init), isolated: true });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
  await pg.goto(`${base}/horoscope.html`); await sleep(500);
  await pg.evaluate(BIRTH(name));
  return pg;
}
async function openBody(pg) {
  assert(await click(pg, ".lq-caution-open"), "open button");
  await sleep(150);
  if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
  await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("T15 switch off (default config): a full reading, no section and no rule data", async () => {
      const pg = await reading(browser, base, { on: false });
      try {
        await pg.waitFor(READY, 15000); await sleep(400);
        const s = await pg.evaluate(STATE);
        assert(!s.sec, "section shown with the switch off");
        assert(!pg.requests.some(q => DATA.test(q.url)), "rule data fetched with the switch off");
        assert((await pg.evaluate("window.LENSIQ_FORTUNE_CAUTIONS")) === false, "switch default");
        assert(!pg.consoleErrors.length, "console errors: " + S(pg.consoleErrors).slice(0, 300));
      } finally { await pg.close(); }
    });

    for (const lang of LANGS) {
      await check(`pilot ${lang}: closed after the reading, disclaimer, Thai content with the birth kalakini, closed again on a new reading`, async () => {
        const pg = await reading(browser, base, { lang });
        try {
          await pg.waitFor(READY, 15000); await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
          let s = await pg.evaluate(STATE);
          assert(s.n === 1 && s.inOv && s.host && s.afterReading, lang + ": one section, in the overview tab, after the reading " + S(s).slice(0, 200));
          assert(s.open && !s.disc && !s.body && s.rules.length === 0, lang + ": closed, no rule text");
          const before = [...new Set(pg.requests.map(q => q.url).filter(isCaution).map(u => new URL(u).pathname))];
          assert(before.length === 1 && /\/fortune-caution\.js$/.test(before[0]), lang + ": caution requests before the tap " + S(before));
          await click(pg, ".lq-caution-open"); await sleep(150);
          s = await pg.evaluate(STATE);
          assert(s.disc && s.discText === DISCLAIMER[lang], lang + ": disclaimer word for word: " + s.discText);
          assert(!pg.requests.some(q => DATA.test(q.url)), lang + ": rule data before acceptance");
          await click(pg, ".lq-caution-accept");
          await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          s = await pg.evaluate(STATE);
          assert(s.overallRules.includes("th.kalakini"), lang + ": birth kalakini under overall " + S(s.overallRules));
          assert(s.rules.every(r => /^th\./.test(r)), lang + ": Thai rules only with the Chinese switch off " + S(s.rules));
          assert(s.period.includes(PERIOD[lang]), lang + ": period label " + s.period);
          assert(s.links === 0, lang + ": link or paid block");
          assert(s.small.length === 0, lang + ": buttons under 44 px " + S(s.small));
          if (lang === "en") assert(!/[฀-๿㐀-鿿]/.test(s.text), "en: Thai or Chinese in the section");
          if (lang === "zh") assert(!/[฀-๿]/.test(s.text), "zh: Thai in the section");
          const after = [...new Set(pg.requests.map(q => q.url).filter(u => DATA.test(u)))];
          const bytes = after.reduce((a, u) => a + statSync(join(repo, new URL(u).pathname.replace(/^\//, ""))).size, 0);
          assert(after.length >= 1 && bytes <= 30720, lang + ": " + bytes + " bytes after the tap");
          await pg.evaluate(`document.getElementById("hsForm").requestSubmit()`); await sleep(800);
          await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
          s = await pg.evaluate(STATE);
          assert(s.n === 1 && s.open && !s.body, lang + ": a new reading starts closed again");
          assert(!pg.consoleErrors.length, lang + ": console errors " + S(pg.consoleErrors).slice(0, 300));
        } finally { await pg.close(); }
      });
    }

    await check("T9 crisis words in the name (TH / EN / ZH) or the tab's calm flag: no section", async () => {
      for (const name of ["ไม่อยากมีชีวิตอยู่แล้ว", "I want to kill myself", "我不想活了"]) {
        const pg = await reading(browser, base, { name });
        try {
          await sleep(1500);
          const s = await pg.evaluate(STATE);
          assert(!s.sec, "section with crisis words in the name: " + name);
          assert(!pg.requests.some(q => DATA.test(q.url)), "rule data fetched");
        } finally { await pg.close(); }
      }
      const pg = await reading(browser, base, { init: [`try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`] });
      try {
        await sleep(1500);
        assert(!(await pg.evaluate(STATE)).sec, "section in a calm tab");
      } finally { await pg.close(); }
    });

    for (const lang of LANGS) {
      await check(`T11 ${lang}: the open section at 360 / 393 / 430 px has no lone punctuation, widow or split number`, async () => {
        const pg = await reading(browser, base, { lang });
        try {
          await pg.waitFor(READY, 15000); await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
          await openBody(pg);
          await pg.evaluate(`(() => { const sec = document.querySelector(".lq-caution-sec");
            for (let e = sec; e && e !== document.body; e = e.parentElement) {
              for (const x of e.parentElement.children) if (x !== e && !x.contains(sec)) x.style.setProperty("display", "none", "important");
            }
            return 1; })()`);
          const bad = [];
          for (const w of [360, 393, 430]) {
            await pg.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true }); await sleep(150);
            for (const f of await pg.evaluate(PROBE)) bad.push(`${w} ${f.kind} ${f.text}`);
          }
          assert(!bad.length, bad.length + " line break problem(s):\n         " + bad.slice(0, 20).join("\n         "));
        } finally { await pg.close(); }
      });
    }
  } finally { await browser.close(); }
}

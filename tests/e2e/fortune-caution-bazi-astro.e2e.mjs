// tests/e2e/fortune-caution-bazi-astro.e2e.mjs — FIXED TEST SET fortune-caution wave 1b: bazi.html and astro.html (owner approved wave
// RELOCK 11 2026-11-21 (owner 189 ข), STRICTER: restores whole-page console errors. Every console error on the page fails
// (pg.consoleErrors, unfiltered); the relock-3 subset (script exceptions and errors naming a fortune-caution file) is gone.
// api-status-guard (decision 190 / 192) keeps the page from requesting /api/fortune/status without an API base.
// 1 = three pilot pages, switch off; both behind LENSIQ_FORTUNE_CAUTIONS_CN_WEST, off, D-6; never a single day). Locked BEFORE either
// page is wired (evals-locks/fortune-caution.sha256, wave1b/). SYNTHETIC births only. Bazi: 12 May 2533, section after the reading
// (#lcReadWrap) in host #lcCaution. Astro: a birth about 29.5 years before today (inside the Saturn-return window) and one about
// 36 years before (outside: no section); section after the natal reading (#asReadWrap) in host #asCaution.
// Checks: switch off = nothing; Chinese/Western switch off (live) = nothing and no rule data; with it on (preview): closed, the
// approved disclaimer, content in TH / EN / ZH (bazi: Chinese rules, the 大运 period; astro: w.saturn.return with the modern-practice
// label, the "about age" period, no "overall" part), no day word, closed again on a new reading; crisis words or the calm flag =
// no section; T12 one caution request before the tap, <= 30 KB after; 44 px buttons; no link; T11 line wrap 360 / 393 / 430 px.
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
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const CN = "window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true;";
const LANG = l => `try { localStorage.setItem("lq-lang", ${S(l)}); } catch (e) {}`;
const DATA = /fortune-caution-(?:core|pack|rules|filter)/;
const isCaution = u => /\/fortune-caution[^/]*\.js/.test(u);
const DAYWORD = /วันนี้|พรุ่งนี้|\btoday\b|\btomorrow\b|今天|明天/i;
/** a birth date `years` before today (Buddhist-era year for the form) */
const birthAgo = years => { const t = new Date(Date.now() - years * 365.2425 * 864e5); return { d: t.getDate(), m: t.getMonth() + 1, be: t.getFullYear() + 543 }; };
const PAGES = {
  bazi: { host: "lcCaution", wrap: "lcReadWrap", body: "lcRd-body",
    fill: b => `(() => { document.getElementById("lcDay").value = ${S(String(b.d))}; document.getElementById("lcMonth").value = ${S(String(b.m))};
      document.getElementById("lcYear").value = ${S(String(b.be))}; document.querySelector("#lcForm button[type=submit]").click(); return 1; })()` },
  astro: { host: "asCaution", wrap: "asReadWrap", body: "asRd-body",
    fill: b => `(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); };
      set("asDay", ${S(String(b.d))}); set("asMonth", ${S(String(b.m))}); set("asYear", ${S(String(b.be))}); document.getElementById("asForm").requestSubmit(); return 1; })()` },
};
const BAZI_BIRTH = { d: 12, m: 5, be: 2533 };
const ready = p => `(() => { const b = document.getElementById(${S(PAGES[p].body)}); return !!b && b.textContent.trim().length > 40; })()`;
const STATE = p => `(() => {
  const sec = document.querySelector(".lq-caution-sec"), q = s => sec && sec.querySelector(s), wrap = document.getElementById(${S(PAGES[p].wrap)});
  const txt = e => (e ? e.textContent : "").replace(/\\s+/g, " ").trim();
  return { sec: !!sec, n: document.querySelectorAll(".lq-caution-sec").length, host: !!(sec && sec.closest(${S("#" + PAGES[p].host)})),
    afterReading: !!(sec && wrap && (wrap.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING)), open: !!q(".lq-caution-open"), disc: !!q(".lq-caution-disc"),
    discText: txt(q(".lq-caution-disc p")), body: !!q(".lq-caution-body"), text: txt(sec),
    rules: sec ? [...sec.querySelectorAll("[data-rule]")].map(e => e.dataset.rule) : [],
    parts: sec ? [...sec.querySelectorAll(".lq-caution-part")].map(e => e.dataset.part) : [], period: txt(q(".lq-caution-period")),
    links: sec ? sec.querySelectorAll("a[href], [data-lq-upsell], [data-lq-remedy], [data-lq-paid]").length : 0,
    small: sec ? [...sec.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height < 44).map(b => b.className) : [] };
})()`;
const click = (pg, sel) => pg.evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) return false; e.click(); return true; })()`);

async function reading(browser, base, p, birth, { lang = "th", init = [] } = {}) {
  const pg = await browser.newPage(null, { initScripts: [LANG(lang)].concat(init), isolated: true });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
  await pg.goto(`${base}/${p}.html`); await sleep(500);
  await pg.evaluate(PAGES[p].fill(birth));
  return pg;
}
async function openBody(pg) {
  assert(await click(pg, ".lq-caution-open"), "open button");
  await sleep(150);
  if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
  await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
}
const SAT_IN = () => birthAgo(29.5), SAT_OUT = () => birthAgo(36);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const p of ["bazi", "astro"]) {
      const birth = p === "bazi" ? BAZI_BIRTH : SAT_IN();
      await check(`${p}: switch off, and switch on with the Chinese / Western switch off (live): no section, no rule data`, async () => {
        for (const init of [[], [ON]]) {
          const pg = await reading(browser, base, p, birth, { init });
          try {
            await pg.waitFor(ready(p), 15000); await sleep(600);
            assert(!(await pg.evaluate(STATE(p))).sec, p + ": section " + S(init));
            assert(!pg.requests.some(q => DATA.test(q.url)), p + ": rule data fetched " + S(init));
            assert(!pg.consoleErrors.length, p + ": console errors " + S(pg.consoleErrors).slice(0, 300));
          } finally { await pg.close(); }
        }
      });
      for (const lang of LANGS) {
        await check(`${p} ${lang} (preview, switch on): closed after the reading, disclaimer, content, month-or-longer period, closed again`, async () => {
          const pg = await reading(browser, base, p, birth, { lang, init: [ON, CN] });
          try {
            await pg.waitFor(ready(p), 15000); await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
            let s = await pg.evaluate(STATE(p));
            assert(s.n === 1 && s.host && s.afterReading && s.open && !s.body && s.rules.length === 0, lang + ": one closed section after the reading " + S(s).slice(0, 200));
            const before = [...new Set(pg.requests.map(q => q.url).filter(isCaution).map(u => new URL(u).pathname))];
            assert(before.length === 1 && /\/fortune-caution\.js$/.test(before[0]), lang + ": caution requests before the tap " + S(before));
            await click(pg, ".lq-caution-open"); await sleep(150);
            s = await pg.evaluate(STATE(p));
            assert(s.disc && s.discText === DISCLAIMER[lang], lang + ": disclaimer " + s.discText);
            await click(pg, ".lq-caution-accept");
            await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
            s = await pg.evaluate(STATE(p));
            if (p === "bazi") {
              assert(s.parts[0] === "overall" && s.parts.includes("period"), lang + ": overall + period " + S(s.parts));
              assert(s.rules.every(r => /^bz\./.test(r)), lang + ": bazi rules only " + S(s.rules));
              assert({ th: /วัยจร|ปีนี้/, en: /Luck period|This year/, zh: /大运|今年/ }[lang].test(s.period), lang + ": period " + s.period);
            } else {
              assert(S(s.parts) === S(["period"]), lang + ": period part only " + S(s.parts));
              assert(s.rules.includes("w.saturn.return"), lang + ": Saturn return " + S(s.rules));
              assert({ th: /ช่วงอายุราว/, en: /About age/, zh: /约/ }[lang].test(s.period), lang + ": period " + s.period);
              assert(s.text.includes({ th: "ตามความนิยมสมัยใหม่", en: "Modern practice", zh: "现代流行做法" }[lang]), lang + ": modern-practice label");
            }
            assert(!DAYWORD.test(s.text), lang + ": a day word in the section");
            assert(s.links === 0 && s.small.length === 0, lang + ": links " + s.links + ", small buttons " + S(s.small));
            if (lang === "en") assert(!/[฀-๿]/.test(s.text) && !/[㐀-鿿]/.test(s.text.replace(s.period, "")), "en: Thai or Chinese outside the period label");
            if (lang === "zh") assert(!/[฀-๿]/.test(s.text), "zh: Thai in the section");
            const after = [...new Set(pg.requests.map(q => q.url).filter(u => DATA.test(u)))];
            const bytes = after.reduce((a, u) => a + statSync(join(repo, new URL(u).pathname.replace(/^\//, ""))).size, 0);
            assert(after.length >= 1 && bytes <= 30720, lang + ": " + bytes + " bytes after the tap");
            await pg.evaluate(PAGES[p].fill(birth)); await sleep(800);
            await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 8000);
            s = await pg.evaluate(STATE(p));
            assert(s.n === 1 && s.open && !s.body, lang + ": closed again on a new reading");
            assert(!pg.consoleErrors.length, lang + ": console errors " + S(pg.consoleErrors).slice(0, 300));
          } finally { await pg.close(); }
        });
      }
      await check(`${p}: the calm flag of the tab = no section (preview switches on)`, async () => {
        const pg = await reading(browser, base, p, birth, { init: [ON, CN, `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`] });
        try {
          await sleep(2000);
          assert(!(await pg.evaluate(STATE(p))).sec, p + ": section in a calm tab");
        } finally { await pg.close(); }
      });
      for (const lang of LANGS) {
        await check(`T11 ${p} ${lang}: the open section at 360 / 393 / 430 px has no lone punctuation, widow or split number`, async () => {
          const pg = await reading(browser, base, p, birth, { lang, init: [ON, CN] });
          try {
            await pg.waitFor(ready(p), 15000); await pg.waitFor("!!document.querySelector('.lq-caution-sec')", 5000);
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
    }
    await check("astro outside the Saturn-return window (about age 36): no section even with every switch on", async () => {
      const pg = await reading(browser, base, "astro", SAT_OUT(), { init: [ON, CN] });
      try {
        await pg.waitFor(ready("astro"), 15000); await sleep(800);
        assert(!(await pg.evaluate(STATE("astro"))).sec, "a section outside the window");
        assert(!pg.requests.some(q => DATA.test(q.url)), "rule data fetched");
      } finally { await pg.close(); }
    });
    await check("bazi: crisis words in the year field = no section (preview switches on)", async () => {
      for (const v of ["ไม่อยากมีชีวิตอยู่แล้ว", "I want to kill myself", "我不想活了"]) {
        const pg = await reading(browser, base, "bazi", { d: 12, m: 5, be: v }, { init: [ON, CN] });
        try {
          await sleep(1500);
          assert(!(await pg.evaluate(STATE("bazi"))).sec, "section with crisis words: " + v);
          assert(!pg.requests.some(q => DATA.test(q.url)), "rule data fetched");
        } finally { await pg.close(); }
      }
    });
  } finally { await browser.close(); }
}

// tests/e2e/fortune-caution.e2e.mjs — FIXED TEST SET fortune-caution (owner item 177, 2026-11-20). Locked BEFORE any product
// code (evals-locks/fortune-caution.sha256, ~/LENSIQ-field/evals/fortune-caution/). Design ~/Desktop/LENSIQ-review/
// fortune-cautions/DESIGN-TH.md 3, 4(b), 4(c), 5.1: T1 closed by default on every new reading, T2 nothing before the disclaimer
// is accepted (no caution text in the DOM, no request for the rule data), T9 the crisis or calm flag hides everything, T10 page
// language, T12 page weight (shell <= 8 KB, one request before the tap, lazily loaded files <= 30 KB per page), T13 no link or
// paid block, T15 switch off = nothing, T16 planner / petread / hub get no section, T18 the approved disclaimer word for word,
// acknowledged per tab (sessionStorage), T23 three parts in order, plus a failed load never looks like "nothing to watch".
// Wave 0 wires no page: the shell fortune-caution.js is added by this test to horoscope.html (a fortune page with its real
// styles, crisis net and text fields) and mounted with the locked SYNTHETIC readings of
// tests/unit/fixtures/fortune-caution-profiles.json. Each later wave locks its own page list before wiring the pages.
// Shell contract (window.LQFortuneCaution): mount(host, { domain, facts: { items }, period, lang? }) -> the section element
// or null; TEXT { title, open, disclaimer, accept, later, fail, retry } each { th, en, zh }; ACK_KEY "lq-caution-ack".
// Section DOM: section.lq-caution > button.lq-caution-open (closed) | .lq-caution-disc (disclaimer: p + button.lq-caution-accept
// + button.lq-caution-later) | .lq-caution-body (top line, .lq-caution-part[data-part] with .lq-caution-mind li[data-rule][data-n],
// .lq-caution-cheer [data-rule], .lq-caution-guide li[data-rule][data-n], .lq-caution-period, button.lq-caution-close) |
// .lq-caution-fail (+ button.lq-caution-retry). Switches: LENSIQ_FORTUNE_CAUTIONS, LENSIQ_FORTUNE_CAUTIONS_CN_WEST,
// LENSIQ_FORTUNE_CAUTIONS_DRAFTS (all set by this test; lensiq-config.js keeps a preset true).
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const require = createRequire(import.meta.url);
const FIX = JSON.parse(readFileSync(join(repo, "tests", "unit", "fixtures", "fortune-caution-profiles.json"), "utf8"));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const DISCLAIMER = {
  th: "คำทำนายในส่วนนี้เป็นการคาดการณ์ของระบบตามหลักความเชื่อของศาสตร์นี้ ไม่ได้ชี้ขาดว่าสิ่งใดถูกหรือผิด จริงหรือไม่จริง โปรดใช้วิจารณญาณของคุณเองในการตัดสินใจ",
  en: "This section is this system's prediction according to the beliefs of this discipline. It does not decide what is right or wrong, true or untrue. Please use your own judgement.",
  zh: "本部分是本系统依据该术数的传统信仰所作的推测，并不判定任何事情的对错或真假。请运用您自己的判断。",
};
const TOP = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief; please use your own judgement.", zh: "依据传统信仰，请自行判断。" };
const CRISIS = { th: "ไม่อยากมีชีวิตอยู่แล้ว", en: "I want to kill myself", zh: "我不想活了" };
const reading = name => FIX.readings.find(r => r.name.startsWith(name + " "));
const inputOf = (r, lang) => ({ domain: r.domain, facts: { domain: r.domain, items: r.items }, period: r.period ? FIX.periods[r.period] : null, lang });
const ON = "window.LENSIQ_FORTUNE_CAUTIONS = true; window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST = true; window.LENSIQ_FORTUNE_CAUTIONS_DRAFTS = true;";
const LANG = l => `try { localStorage.setItem("lq-lang", ${S(l)}); } catch (e) {}`;
const DATA = /fortune-caution-(?:core|pack|rules)/;
const isCaution = u => /\/fortune-caution[^/]*\.js/.test(u);

/** rule texts the locked reading shows in one language (computed in Node from the product core, for the "not in the DOM yet" checks) */
function ruleTextsOf(r, lang) {
  const core = require(join(repo, "fortune-caution-core.js"));
  const m = core.build(inputOf(r, lang), { drafts: true, cnWest: true });
  return m ? m.parts.flatMap(p => p.mind.concat(p.cheer, p.guide).map(x => x.text)) : [];
}

async function open(browser, base, { lang = "th", on = true, init = [], page = "horoscope", isolated = false } = {}) {
  const pg = await browser.newPage(null, { initScripts: [LANG(lang)].concat(on ? [ON] : [], init), isolated });
  await pg.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 800, deviceScaleFactor: 2, mobile: true });
  await pg.goto(`${base}/${page}.html`); await sleep(500);
  await pg.evaluate(() => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "fortune-caution.js"; s.onload = () => res(1); s.onerror = () => rej(new Error("fortune-caution.js did not load"));
    document.head.appendChild(s);
  }));
  await pg.evaluate(() => { const h = document.createElement("div"); h.id = "lqCautionHost"; (document.querySelector("main") || document.body).appendChild(h); return 1; });
  return pg;
}
const mount = (pg, r, lang) => pg.evaluate(`(() => { const s = window.LQFortuneCaution.mount(document.getElementById("lqCautionHost"), ${S(r ? inputOf(r, lang) : null)}); return !!s; })()`);
const STATE = `(() => {
  const sec = document.querySelector(".lq-caution"), q = s => sec && sec.querySelector(s);
  const txt = e => (e ? e.textContent : "").replace(/\\s+/g, " ").trim();
  const vis = e => !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  return { sec: !!sec, n: document.querySelectorAll(".lq-caution").length, openBtn: vis(q(".lq-caution-open")), disc: vis(q(".lq-caution-disc")), discText: txt(q(".lq-caution-disc p")),
    body: !!q(".lq-caution-body"), fail: !!q(".lq-caution-fail"), text: txt(sec), html: sec ? sec.innerHTML : "" };
})()`;
const click = (pg, sel) => pg.evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) return false; e.click(); return true; })()`);
async function toBody(pg) {
  assert(await click(pg, ".lq-caution-open"), "open button");
  await sleep(150);
  if (await pg.evaluate("!!document.querySelector('.lq-caution-accept')")) await click(pg, ".lq-caution-accept");
  await pg.waitFor("!!document.querySelector('.lq-caution-body') || !!document.querySelector('.lq-caution-fail')", 8000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("T15 switch off: mount() returns null, nothing is added, no rule data is fetched", async () => {
      const pg = await open(browser, base, { on: false });
      try {
        assert((await mount(pg, reading("F1"), "th")) === false, "mount returned a section with the switch off");
        const s = await pg.evaluate(STATE);
        assert(!s.sec, "section in the DOM with the switch off");
        assert(!pg.requests.some(q => DATA.test(q.url)), "rule data fetched with the switch off");
        const conf = await pg.evaluate("[window.LENSIQ_FORTUNE_CAUTIONS, window.LENSIQ_FORTUNE_CAUTIONS_CN_WEST]");
        assert(S(conf) === S([false, false]), "config defaults " + S(conf));
      } finally { await pg.close(); }
    });

    for (const lang of LANGS) {
      await check(`T1 / T2 / T18 ${lang}: closed by default, nothing before the disclaimer, approved disclaimer, then content`, async () => {
        const pg = await open(browser, base, { lang });
        try {
          for (const name of ["F1", "F17", "F21"]) {
            const r = reading(name), words = ruleTextsOf(r, lang);
            assert(words.length > 0, name + ": the locked reading has texts");
            assert(await mount(pg, r, lang), name + ": mounted");
            let s = await pg.evaluate(STATE);
            const ack = await pg.evaluate(`sessionStorage.getItem("lq-caution-ack")`);
            assert(s.n === 1 && s.openBtn && !s.body && !s.disc, name + ": closed by default " + S(s).slice(0, 300));
            assert(!words.some(w => s.html.includes(w)), name + ": caution text in the DOM before the tap");
            if (!ack) {
              assert(!pg.requests.some(q => DATA.test(q.url)), name + ": rule data requested before the disclaimer was accepted");
              await click(pg, ".lq-caution-open"); await sleep(150);
              s = await pg.evaluate(STATE);
              assert(s.disc && !s.body, name + ": the disclaimer first");
              assert(s.discText === DISCLAIMER[lang], name + ": disclaimer word for word: " + s.discText);
              assert(!words.some(w => s.html.includes(w)), name + ": caution text in the DOM under the disclaimer");
              assert(!pg.requests.some(q => DATA.test(q.url)), name + ": rule data requested under the disclaimer");
              await click(pg, ".lq-caution-accept");
              await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
              assert((await pg.evaluate(`sessionStorage.getItem("lq-caution-ack")`)) === "1", "ack kept for the tab");
              const ls = await pg.evaluate("Object.keys(localStorage).filter(k => /caution/i.test(k))");
              assert(ls.length === 0, "nothing about the disclaimer kept on the device: " + S(ls));
            } else {
              await click(pg, ".lq-caution-open");
              await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
              s = await pg.evaluate(STATE);
              assert(!s.disc, name + ": accepted earlier in this tab: no second disclaimer");
            }
            s = await pg.evaluate(STATE);
            assert(s.text.includes(TOP[lang]), name + ": the 'according to belief' line on every opening");
            assert(words.every(w => s.text.includes(w.replace(/\s+/g, " ").trim())), name + ": every rule text shown after acceptance");
            assert(pg.requests.some(q => DATA.test(q.url)), name + ": rule data loaded after acceptance");
            await click(pg, ".lq-caution-close"); await sleep(100);
            s = await pg.evaluate(STATE);
            assert(s.openBtn && !s.body && !words.some(w => s.html.includes(w)), name + ": closed again, content removed");
          }
          // a new reading in the same tab starts closed again
          await mount(pg, reading("F1"), lang);
          const s = await pg.evaluate(STATE);
          assert(s.n === 1 && s.openBtn && !s.body, "new reading: closed again");
          assert(!pg.consoleErrors.length, "console errors: " + S(pg.consoleErrors).slice(0, 400));
        } finally { await pg.close(); }
      });
    }

    await check("T18 'not now' stores nothing; a new tab asks again", async () => {
      const pg = await open(browser, base, { isolated: true });
      try {
        await mount(pg, reading("F1"), "th");
        await click(pg, ".lq-caution-open"); await sleep(100);
        await click(pg, ".lq-caution-later"); await sleep(100);
        const s = await pg.evaluate(STATE);
        assert(s.openBtn && !s.disc && !s.body, "closed after 'not now'");
        assert((await pg.evaluate(`sessionStorage.getItem("lq-caution-ack")`)) === null, "nothing stored after 'not now'");
        await toBody(pg);
      } finally { await pg.close(); }
      const pg2 = await open(browser, base, { isolated: true });
      try {
        await mount(pg2, reading("F1"), "th");
        await click(pg2, ".lq-caution-open"); await sleep(150);
        assert((await pg2.evaluate(STATE)).disc, "a new tab asks again");
      } finally { await pg2.close(); }
    });

    await check("T9 crisis or calm flag: no button and no section; an open section is removed when the flag rises", async () => {
      for (const how of ["setActive", "setCalm"]) {
        const pg = await open(browser, base, { isolated: true });
        try {
          await mount(pg, reading("F1"), "th"); await toBody(pg);
          assert((await pg.evaluate(STATE)).body, how + ": open before the flag");
          await pg.evaluate(`window.LQFortuneCrisis.${how}(document)`); await sleep(300);
          const s = await pg.evaluate(STATE);
          assert(!s.sec, how + ": section removed when the flag rose " + S(s).slice(0, 200));
          assert((await mount(pg, reading("F1"), "th")) === false, how + ": no new section while the flag is set");
          assert(!(await pg.evaluate(STATE)).sec, how + ": nothing added");
        } finally { await pg.close(); }
      }
      const pg = await open(browser, base, { isolated: true, init: [`try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`] });
      try {
        assert((await mount(pg, reading("F1"), "th")) === false, "calm tab: mount returns null");
        assert(!(await pg.evaluate(STATE)).sec, "calm tab: no section");
      } finally { await pg.close(); }
    });

    await check("T9 crisis words in any text field of the page (TH / EN / ZH): no section, and a closed one disappears on the tap", async () => {
      const pg = await open(browser, base, { isolated: true });
      try {
        const ids = await pg.evaluate(`[...document.querySelectorAll('input[type="text"], input:not([type]), textarea, input[type="search"]')].map(e => e.id).filter(Boolean)`);
        assert(ids.length >= 2, "text fields found: " + S(ids));
        const setField = (id, v) => pg.evaluate(`(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`);
        for (const id of ids) for (const lang of LANGS) {
          await setField(id, CRISIS[lang]);
          assert((await mount(pg, reading("F1"), lang)) === false, id + " " + lang + ": mount must refuse");
          assert(!(await pg.evaluate(STATE)).sec, id + " " + lang + ": no section");
          await setField(id, "");
        }
        assert(await mount(pg, reading("F1"), "th"), "fields cleared: mounted");
        await setField(ids[0], CRISIS.th);
        await click(pg, ".lq-caution-open"); await sleep(300);
        const s = await pg.evaluate(STATE);
        assert(!s.sec || (!s.body && !s.disc), "crisis words typed after mounting: the tap shows nothing " + S(s).slice(0, 200));
        assert(!pg.requests.some(q => DATA.test(q.url)), "no rule data fetched");
      } finally { await pg.close(); }
    });

    await check("T10 / T13 / T23 in the page: language, no link or paid block, parts in order with paired guidance, 44 px buttons", async () => {
      for (const lang of LANGS) {
        const pg = await open(browser, base, { lang, isolated: true });
        try {
          for (const name of ["F1", "F17", "F23", "F26"]) {
            await mount(pg, reading(name), lang); await toBody(pg);
            const d = await pg.evaluate(`(() => {
              const sec = document.querySelector(".lq-caution");
              const parts = [...sec.querySelectorAll(".lq-caution-part")].map(p => {
                const pos = s => { const e = p.querySelector(s); return e ? [...p.querySelectorAll("*")].indexOf(e) : -1; };
                return { part: p.dataset.part, mind: [...p.querySelectorAll(".lq-caution-mind li")].map(li => [li.dataset.n, li.dataset.rule]),
                  guide: [...p.querySelectorAll(".lq-caution-guide li[data-n]")].map(li => [li.dataset.n, li.dataset.rule]),
                  iM: pos(".lq-caution-mind"), iC: pos(".lq-caution-cheer"), iG: pos(".lq-caution-guide") };
              });
              const clone = sec.cloneNode(true); clone.querySelectorAll(".lq-caution-period").forEach(e => e.remove());
              const small = [...sec.querySelectorAll("button")].filter(b => b.getBoundingClientRect().height < 44).map(b => b.className);
              return { parts, text: clone.textContent, links: sec.querySelectorAll("a[href], [data-lq-upsell], [data-lq-remedy], [data-lq-paid]").length, small };
            })()`);
            const at = lang + " " + name;
            assert(d.links === 0, at + ": link or paid block in the section");
            assert(!/บาท|ราคา|ซื้อ|สมาชิก|ปลดล็อก|\b(?:price|buy|shop|unlock|premium)\b|价格|购买|会员|解锁/i.test(d.text), at + ": price or sales word");
            if (lang === "en") assert(!/[฀-๿㐀-鿿]/.test(d.text), at + ": Thai or Chinese outside the period label");
            if (lang === "zh") assert(!/[฀-๿]/.test(d.text), at + ": Thai in the Chinese page");
            assert(d.small.length === 0, at + ": buttons under 44 px " + S(d.small));
            assert(d.parts.length >= 1 && d.parts[0].part === "overall", at + ": overall first");
            for (const p of d.parts) {
              if (p.iM < 0) continue; // the "does not read by time period" part
              if (p.iC >= 0) assert(p.iC > p.iM, at + " " + p.part + ": encouragement after be mindful of");
              if (p.iG >= 0) assert(p.iG > Math.max(p.iM, p.iC), at + " " + p.part + ": guidance last");
              for (const [n, rule] of p.mind) assert(p.guide.some(([gn, gr]) => gn === n && gr === rule), at + ": guidance " + n + " for " + rule);
            }
            await click(pg, ".lq-caution-close");
          }
        } finally { await pg.close(); }
      }
    });

    await check("T12 page weight: shell <= 8 KB, one caution request before the tap, the files loaded after it <= 30 KB per page", async () => {
      const size = u => statSync(join(repo, new URL(u).pathname.replace(/^\//, ""))).size;
      assert(statSync(join(repo, "fortune-caution.js")).size <= 8192, "fortune-caution.js is " + statSync(join(repo, "fortune-caution.js")).size + " bytes");
      for (const [name, lang] of [["F1", "th"], ["F17", "th"], ["F17", "zh"], ["F21", "en"], ["F26", "th"], ["F7", "zh"], ["F23", "en"]]) {
        const pg = await open(browser, base, { lang, isolated: true });
        try {
          await mount(pg, reading(name), lang);
          const before = [...new Set(pg.requests.map(q => q.url).filter(isCaution).map(u => new URL(u).pathname))];
          assert(before.length === 1 && /\/fortune-caution\.js$/.test(before[0]), name + " " + lang + ": caution requests before the tap " + S(before));
          await toBody(pg);
          const after = [...new Set(pg.requests.map(q => q.url).filter(u => DATA.test(u)))];
          const bytes = after.reduce((a, u) => a + size(u), 0);
          assert(after.length >= 1 && bytes <= 30720, name + " " + lang + ": " + bytes + " bytes after the tap " + S(after));
        } finally { await pg.close(); }
      }
    });

    await check("T16 planner, petread and the fortune hub: no section, and mount refuses their domains", async () => {
      for (const p of ["planner", "petread", "fortune"]) {
        const pg = await open(browser, base, { page: p, isolated: true });
        try {
          assert(!(await pg.evaluate(STATE)).sec, p + ": section on the page");
          const r = { domain: p, facts: { domain: p, items: [{ id: "x", tone: "caution", strength: 1 }] }, period: null, lang: "th" };
          assert((await pg.evaluate(`!!window.LQFortuneCaution.mount(document.getElementById("lqCautionHost"), ${S(r)})`)) === false, p + ": mount refused");
        } finally { await pg.close(); }
      }
    });

    await check("a failed load shows a retry message in the page language, never an empty 'nothing to watch'", async () => {
      for (const lang of LANGS) {
        const pg = await open(browser, base, { lang, isolated: true });
        try {
          await pg.send("Network.setBlockedURLs", { urls: ["*fortune-caution-core*", "*fortune-caution-pack*", "*fortune-caution-rules*"] });
          await mount(pg, reading("F1"), lang); await toBody(pg);
          let s = await pg.evaluate(STATE);
          assert(s.fail && !s.body, lang + ": failure message " + S(s).slice(0, 200));
          const none = { th: "ไม่พบเรื่องที่ต้องระวัง", en: "nothing in particular", zh: "没有特别需要留意" }[lang];
          assert(!s.text.includes(none), lang + ": failure shown as 'nothing to watch'");
          assert(await pg.evaluate("!!document.querySelector('.lq-caution-retry')"), lang + ": retry button");
          await pg.send("Network.setBlockedURLs", { urls: [] });
          await click(pg, ".lq-caution-retry");
          await pg.waitFor("!!document.querySelector('.lq-caution-body')", 8000);
          s = await pg.evaluate(STATE);
          assert(s.body && !s.fail, lang + ": content after retry");
        } finally { await pg.close(); }
      }
    });
  } finally { await browser.close(); }
}

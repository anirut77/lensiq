// tests/e2e/fortune-paid-plan.e2e.mjs — FIXED TEST SET, owner order 2026-11-15 (2) for fortune-paid, DOM half. Locked
// (evals-locks/fortune-paid.sha256, re-lock (4)) BEFORE the build. Pure half: tests/unit/fortune-paid-plan.test.js.
// Switches set by init scripts in these tests only (shipped: both false).
//   a  every group offer's button text carries its price
//   b  a tap opens the pre-payment preview: every paid group's heading, at most two lines each, nothing else from paid text
//   c  the preview says who it was made for (the reading's headline; the nickname when given)
//   d  the price ladder 49 / 99 / 199 / 149 is shown together (panel and preview)
//   plan  only with both switches on; the goal picker comes first and no plan offer or price shows before a goal is picked;
//         the plan block is never inside a reading group, holds no caution and is never next to one
//   crisis  after the crisis state: no preview, ladder, plan, price or goal picker in the DOM
//   funnel  analytics is off (no API base): taps send nothing
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const PRICE_RE = "\\d+\\s*(?:บาท|THB|泰铢)|฿";
const PLACES = [{ id: "pl-1", type: "place", tradition: "thai_buddhist", keys: ["any"], status: "published", sample: false,
  title: { th: "วัดใกล้บ้าน", en: "A temple near home", zh: "家附近的寺庙" }, place: { th: "วัดใกล้บ้าน", en: "A temple near home", zh: "家附近的寺庙" } },
{ id: "of-1", type: "offering", tradition: "thai_buddhist", keys: ["any"], status: "published", sample: false,
  title: { th: "ดอกไม้ ธูป เทียน", en: "Flowers, incense and candles", zh: "鲜花、香和蜡烛" } }];
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const READ = {
  zodiac: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  iching: async p => { await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
};
async function open(browser, base, p, lang, { plan = true } = {}) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_FORTUNE_PAID = true;"];
  if (plan) init.push("window.LENSIQ_FORTUNE_PLAN = true;");
  // re-lock (10), review D3: sample seed entries never make a plan; published, non-sample places (approved in the back office later)
  init.push(`window.LQ_FORTUNE_PLAN_ITEMS = ${S(PLACES)};`);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQPaid`, 10000);
  await sleep(400);
  await READ[p](page); await sleep(900);
  return page;
}
const vis = `const vis = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("a + b + c + d: price on every group button; the preview lists every paid heading (<= 2 lines each), who it is for, the ladder", async () => {
      const bad = []; let pages = 0;
      for (const lang of LANGS) for (const p of Object.keys(READ)) {
        const page = await open(browser, base, p, lang);
        try {
          const n0 = page.requests.length;
          const r = await page.evaluate(`(() => { ${vis}
            const out = { bad: [], groups: 0 };
            const offers = [...document.querySelectorAll('[data-lq-offer="group"]')];
            out.groups = offers.length;
            for (const o of offers) { const b = o.querySelector("[data-lq-buy]"), pr = window.LQPaid.PRICES.group;
              if (!b || !b.textContent.includes(String(pr))) out.bad.push("group button without its price: " + (b ? b.textContent : "none")); }
            // re-lock (6): a reading with nothing to sell has no panel and no price at all (locked rule (c) of fortune-paid.e2e.mjs)
            if (!offers.length) { if (document.querySelector(".lq-paid-panel, .lq-paid-ladder")) out.bad.push("ladder without any offer"); return out; }
            const lad = [...document.querySelectorAll(".lq-paid-panel .lq-paid-ladder li")].map(li => li.textContent);
            // re-lock (7): no 199 row while the page has no month-by-month content (zodiac / iching have none)
            if (lad.length !== 3 || ![49, 99, 149].every((n, i) => lad[i] && lad[i].includes(String(n)))) out.bad.push("panel ladder " + JSON.stringify(lad));
            offers[0].querySelector("[data-lq-buy]").click();
            const pv = document.querySelector(".lq-paid-preview");
            if (!pv || !vis(pv)) { out.bad.push("no visible preview after the tap"); return out; }
            const heads = [...pv.querySelectorAll(".lq-pv-group")];
            if (heads.length !== offers.length) out.bad.push("preview headings " + heads.length + " / groups " + offers.length);
            for (const h of heads) { const t = h.querySelector(".lq-pv-title"), ls = h.querySelectorAll(".lq-pv-line");
              if (!t || !t.textContent.trim()) out.bad.push("preview heading empty"); if (ls.length < 1 || ls.length > 2) out.bad.push("preview lines " + ls.length); }
            const mf = pv.querySelector("[data-lq-made-for]");
            if (!mf || !vis(mf) || mf.textContent.trim().length < 4) out.bad.push("no 'made for' line");
            const pl = [...pv.querySelectorAll(".lq-paid-ladder li")].map(li => li.textContent);
            if (pl.length !== 3 || ![49, 99, 149].every((n, i) => pl[i] && pl[i].includes(String(n)))) out.bad.push("preview ladder " + JSON.stringify(pl));
            return out; })()`);
          if (r.groups) pages++;
          for (const b of r.bad) bad.push(`${lang} ${p}: ${b}`);
          const sent = page.requests.slice(n0).filter(q => q.method !== "GET" || !q.url.startsWith(base));
          if (sent.length) bad.push(`${lang} ${p}: tap sent ${S(sent.map(q => q.method + " " + q.url).slice(0, 3))} (analytics is off)`);
        } catch (e) { bad.push(`${lang} ${p}: ${e.message}`); } finally { await page.close(); }
      }
      if (pages < 4) bad.push("readings with group offers " + pages + " / 6 (at least 4 needed)");
      assert(!bad.length, bad.join("\n"));
    });

    await check("plan: goal picker first, no plan price before a goal; never inside a group, never next to a caution; off with the plan switch off", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, base, "zodiac", lang);
        try {
          const r = await page.evaluate(`(() => { ${vis}
            const out = { bad: [] }, blk = document.querySelector("[data-lq-plan]");
            if (!blk || !vis(blk)) { out.bad.push("no plan block with both switches on"); return out; }
            if (blk.closest(".fa-section")) out.bad.push("plan block inside a reading group");
            const near = [blk.previousElementSibling, blk.nextElementSibling, blk.parentElement && blk.parentElement.previousElementSibling].filter(Boolean);
            for (const e of near) if (e.matches(".lq-caution") || e.querySelector(".lq-caution")) out.bad.push("plan next to a caution: " + e.className);
            if (blk.querySelector(".lq-caution")) out.bad.push("caution inside the plan block");
            const goals = [...blk.querySelectorAll("[data-lq-goal]")];
            if (goals.length !== 6) out.bad.push("goals " + goals.length);
            if (blk.querySelector('[data-lq-offer="plan"]') || new RegExp(${S(PRICE_RE)}).test(blk.textContent)) out.bad.push("plan price before a goal is picked");
            goals[1].click();
            const of = blk.querySelector('[data-lq-offer="plan"]');
            if (!of || !vis(of)) out.bad.push("no plan offer after picking a goal");
            else { if (!of.textContent.includes(String(window.LQPaid.PRICES.plan))) out.bad.push("plan offer without its price");
              if (!of.querySelectorAll("ul.lq-paid-heads li").length) out.bad.push("plan offer without its heading list"); }
            return out; })()`);
          for (const b of r.bad) bad.push(lang + ": " + b);
        } finally { await page.close(); }
        const off = await open(browser, base, "zodiac", lang, { plan: false });
        try {
          const n = await off.evaluate(`document.querySelectorAll("[data-lq-plan], [data-lq-goal], [data-lq-offer=plan]").length`);
          if (n) bad.push(lang + ": plan shown with the plan switch off");
        } finally { await off.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("crisis: no preview, ladder, plan, goal picker or price left after the crisis state is set", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, base, "zodiac", lang);
        try {
          await page.evaluate(`(() => { const b = document.querySelector('[data-lq-offer="group"] [data-lq-buy]'); if (b) b.click();
            const g = document.querySelector("[data-lq-goal]"); if (g) g.click(); })()`);
          await page.evaluate("window.LQFortuneCrisis.setActive(document)"); await sleep(300);
          const r = await page.evaluate(`(() => { const sel = ".lq-paid-preview, .lq-paid-ladder, [data-lq-plan], [data-lq-goal], [data-lq-offer], [data-lq-paid]";
            const txt = document.body.textContent; const m = txt.match(new RegExp(${S(PRICE_RE)}));
            return { n: document.querySelectorAll(sel).length, price: m ? txt.slice(Math.max(0, m.index - 20), m.index + 20) : "" }; })()`);
          if (r.n || r.price) bad.push(lang + ": " + S(r));
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}

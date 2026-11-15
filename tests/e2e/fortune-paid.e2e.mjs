// tests/e2e/fortune-paid.e2e.mjs — FIXED TEST SET, owner order 2026-11-15 "paid depth for fortune readings" (design only, OFF).
// Locked (evals-locks/fortune-paid.sha256, ~/LENSIQ-field/evals/fortune-paid/) BEFORE any product code. Pure half:
// tests/unit/fortune-paid.test.js. Design: docs/FORTUNE-PAID-DESIGN.md.
// The switch window.LENSIQ_FORTUNE_PAID is set to true by an init script in these tests only (shipped: false).
//   off  with the switch off: fortune-paid.js is not loaded, nothing paid is drawn, and running its decorate on a rendered
//        reading changes nothing (same HTML)
//   (a)  DOM: caution paragraphs stay visible and are never inside a paid block; the advice group has no offer
//   (b)  crisis: after the crisis state is set on a page with offers, and on a calm page (session flag), and with typed
//        crisis text: no price, no payment entry, no lock icon, no teaser in the DOM; the in-depth text and the belief
//        guidance are free (shown / readable, never inside a paid block)
//   (c)  every purchase control shows its price (approved list, currency in the page language) and the list of headings the
//        person will get, visible BEFORE the control in the page, before any tap; tapping connects no payment
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const PRICES = { group: 49, full: 99, year: 199, plus: 149 };
const CURRENCY = { th: "บาท", en: "THB", zh: "泰铢" };
const PRICE_RE = "(?:49|99|199|149)\\s*(?:บาท|THB|泰铢)|฿";
const PAID_SEL = "[data-lq-paid], [data-lq-offer], [data-lq-buy], .lq-paid-price, .lq-paid-heads, .lq-paid-teaser, svg[data-icon=lock], [data-lq-locked]";

const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const PAGES = {
  zodiac: async p => {
    await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
    await p.waitFor(sections(3), 15000);
  },
  tarot: async p => {
    await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
  },
  bazi: async p => {
    await p.evaluate(() => {
      document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
      document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
    });
    await p.waitFor(sections(2), 15000);
  },
};

async function openPage(browser, base, p, lang, { on = false, calm = false, width = 375 } = {}) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`];
  if (on) init.push("window.LENSIQ_FORTUNE_PAID = true;");
  if (calm) init.push(`try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  if (on) await page.waitFor("!!window.LQPaid", 8000);
  await sleep(400);
  return page;
}

/* everything paid-related on the page, and any price text anywhere in the DOM (visible or not) */
const PAID_STATE = `((sel, priceRe) => {
  const els = [...document.querySelectorAll(sel)];
  const text = document.body.textContent + " " + [...document.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).join(" ");
  const m = text.match(new RegExp(priceRe));
  return { n: els.length, kinds: [...new Set(els.map(e => e.tagName + "." + (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className)))].slice(0, 6),
    price: m ? text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\\s+/g, " ") : "" };
})`;

/* (c) every purchase control, before any tap */
const OFFERS = `((prices, cur) => {
  const vis = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; };
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const out = { offers: 0, plans: {}, bad: [], groupsWithDepth: 0, groupOffers: 0 };
  for (const b of document.querySelectorAll("[data-lq-buy]")) if (!b.closest("[data-lq-offer]")) out.bad.push("purchase control outside an offer");
  for (const o of document.querySelectorAll("[data-lq-offer]")) {
    out.offers++;
    const plan = o.getAttribute("data-lq-offer"); out.plans[plan] = (out.plans[plan] || 0) + 1;
    const tag = plan + "@" + ((o.closest(".fa-section") || {}).getAttribute ? o.closest(".fa-section").getAttribute("data-section") : "end");
    if (!(plan in prices)) { out.bad.push(tag + ": unknown plan"); continue; }
    if (o.closest("details:not([open]), .lq-more-body:not(.lq-open)")) out.bad.push(tag + ": offer inside a closed fold");
    const btn = o.querySelector("[data-lq-buy]"), price = o.querySelector(".lq-paid-price"), heads = o.querySelector("ul.lq-paid-heads");
    if (!btn) { out.bad.push(tag + ": no purchase control"); continue; }
    if (!price || !vis(price)) out.bad.push(tag + ": price not visible");
    else if (!price.textContent.includes(String(prices[plan])) || !price.textContent.includes(cur)) out.bad.push(tag + ": price text " + price.textContent);
    const lis = heads ? [...heads.querySelectorAll("li")] : [];
    if (!heads || !vis(heads) || !lis.length || lis.some(li => !vis(li) || !li.textContent.trim())) out.bad.push(tag + ": heading list not visible");
    if (price && !before(price, btn)) out.bad.push(tag + ": price after the control");
    if (heads && !before(heads, btn)) out.bad.push(tag + ": headings after the control");
    const name = (btn.getAttribute("aria-label") || "") + " " + btn.textContent;
    if (!name.includes(String(prices[plan]))) out.bad.push(tag + ": control's name has no price: " + name.trim().slice(0, 60));
    const r = btn.getBoundingClientRect();
    if (!vis(btn) || r.height < 44 || r.width < 44) out.bad.push(tag + ": control not visible or under 44 px");
    if (btn.tagName !== "BUTTON" || btn.type !== "button") out.bad.push(tag + ": control is not a button");
    if (r.right > innerWidth + 1 || o.getBoundingClientRect().right > innerWidth + 1) out.bad.push(tag + ": wider than the screen");
  }
  for (const g of document.querySelectorAll(".fa-section[data-lq-grouped]")) {
    const off = g.querySelector('[data-lq-offer="group"]');
    if (off) out.groupOffers++;
    if (g.getAttribute("data-section") === "advice" && g.querySelector("[data-lq-offer], [data-lq-paid]")) out.bad.push("advice group has a paid block");
    for (const c of g.querySelectorAll(".lq-caution")) {
      if (!vis(c)) out.bad.push(g.getAttribute("data-section") + ": caution paragraph not visible");
      if (c.closest("[data-lq-paid]")) out.bad.push(g.getAttribute("data-section") + ": caution inside a paid block");
    }
  }
  return out;
})`;

const READING = `(() => { const c = document.querySelector(".fa-section") && document.querySelector(".fa-section").parentElement; return c ? c.innerHTML : ""; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("off: with the switch off (shipped) fortune-paid.js is not loaded and nothing paid is drawn; its decorate changes nothing", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openPage(browser, base, "zodiac", lang);
        try {
          await PAGES.zodiac(page);
          const r = await page.evaluate(`({ flag: window.LENSIQ_FORTUNE_PAID, script: !!document.querySelector('script[src*="fortune-paid"]'), lq: !!window.LQPaid,
            more: document.querySelectorAll("button.lq-more").length })`);
          if (r.flag !== false || r.script || r.lq) bad.push(lang + ": loaded while off " + S(r));
          if (!r.more) bad.push(lang + ": no read-more button (the reading layout of today)");
          const st = await page.evaluate(`${PAID_STATE}(${S(PAID_SEL)}, ${S(PRICE_RE)})`);
          if (st.n || st.price) bad.push(lang + ": paid content while off " + S(st));
          const html0 = await page.evaluate(READING);
          await page.evaluate(`new Promise(res => { const s = document.createElement("script"); s.src = "fortune-paid.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); })`);
          await page.waitFor("!!window.LQPaid", 5000);
          await page.evaluate(`(() => { const c = document.querySelector(".fa-section").parentElement; window.LQPaid.decorate(c); })()`);
          const html1 = await page.evaluate(READING);
          if (html0 !== html1) bad.push(lang + ": decorate changed the reading while off");
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("(c) + (a): every purchase control shows its price and heading list before it can be tapped; cautions visible, advice free", async () => {
      const bad = [], rows = [];
      for (const lang of LANGS) for (const [p, readIt] of Object.entries(PAGES)) {
        const page = await openPage(browser, base, p, lang, { on: true, width: 360 });
        try {
          await readIt(page);
          await page.waitFor(`document.querySelectorAll("[data-lq-offer]").length > 0`, 5000);
          const r = await page.evaluate(`${OFFERS}(${S(PRICES)}, ${S(CURRENCY[lang])})`);
          rows.push(`${lang}/${p}:${r.offers}`);
          for (const b of r.bad) bad.push(`${lang} ${p}: ${b}`);
          if (r.plans.full !== 1 || r.plans.plus !== 1 || !r.plans.group) bad.push(`${lang} ${p}: offers ${S(r.plans)}`);
          // tapping connects no payment: no POST, no request to another origin, a short status note in the offer
          const n0 = page.requests.length;
          const note = await page.evaluate(`(() => { const b = document.querySelector('[data-lq-offer="full"] [data-lq-buy]'); b.click();
            const n = b.closest("[data-lq-offer]").querySelector("[data-lq-paid-note]"); return n ? n.textContent.trim() : ""; })()`);
          await sleep(300);
          const after = page.requests.slice(n0).filter(q => q.method !== "GET" || !q.url.startsWith(base));
          if (after.length) bad.push(`${lang} ${p}: tap sent ${S(after.map(q => q.method + " " + q.url).slice(0, 3))}`);
          if (!note) bad.push(`${lang} ${p}: no status note after the tap`);
        } catch (e) { bad.push(`${lang} ${p}: ${e.message}`); } finally { await page.close(); }
      }
      console.log("    offers " + rows.join(" "));
      assert(!bad.length, bad.join("\n"));
    });

    await check("(b) crisis set on a page with offers: no price, payment entry, lock icon or teaser left; depth and belief guidance free", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openPage(browser, base, "zodiac", lang, { on: true });
        try {
          await PAGES.zodiac(page);
          await page.waitFor(`document.querySelectorAll("[data-lq-offer]").length > 0`, 5000);
          const locked = await page.evaluate(`[...document.querySelectorAll(".fa-section")].filter(g => g.querySelector('[data-lq-offer="group"]')).map(g => g.getAttribute("data-section"))`);
          await page.evaluate("window.LQFortuneCrisis.setActive(document)");
          await sleep(300);
          const st = await page.evaluate(`${PAID_STATE}(${S(PAID_SEL)}, ${S(PRICE_RE)})`);
          if (st.n || st.price) bad.push(lang + ": paid content in the crisis state " + S(st));
          const r = await page.evaluate(`((ids) => {
            const out = [];
            for (const id of ids) { const g = document.querySelector('.fa-section[data-section="' + id + '"]');
              const bodies = g ? [...g.querySelectorAll(".lq-more-body")] : [];
              if (!bodies.length || !bodies.some(b => b.textContent.trim().length > 10)) out.push(id + ": in-depth text not given back"); }
            const adv = document.querySelector('.fa-section[data-section="advice"]');
            if (adv && (adv.closest("[data-lq-paid]") || !adv.textContent.trim())) out.push("advice group not free");
            return out; })(${S(locked)})`);
          for (const b of r) bad.push(lang + ": " + b);
          if (!locked.length) bad.push(lang + ": no group offer before the crisis (test not exercised)");
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("(b) calm session (crisis earlier in this tab) and typed crisis text: no paid block, no price at all", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await openPage(browser, base, "zodiac", lang, { on: true, calm: true });
        try {
          await PAGES.zodiac(page);
          await sleep(500);
          const st = await page.evaluate(`${PAID_STATE}(${S(PAID_SEL)}, ${S(PRICE_RE)})`);
          if (st.n || st.price) bad.push(lang + " calm: " + S(st));
          const more = await page.evaluate(`document.querySelectorAll(".fa-section button.lq-more").length`);
          if (!more) bad.push(lang + " calm: the reading's read-more depth is missing");
        } finally { await page.close(); }
        const dream = await openPage(browser, base, "dream", lang, { on: true });
        try {
          await dream.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่าฆ่าตัวตาย อยากตายจริงๆ"; t.dispatchEvent(new Event("input")); });
          await dream.waitFor(() => !!document.querySelector(".fa-support"), 5000);
          await sleep(300);
          const st = await dream.evaluate(`${PAID_STATE}(${S(PAID_SEL)}, ${S(PRICE_RE)})`);
          if (st.n || st.price) bad.push(lang + " dream crisis: " + S(st));
        } finally { await dream.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}

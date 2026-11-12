// tests/e2e/merit-crisis.e2e.mjs — Merit MVP, independent-review amendments (2026-11-12). FIXED TEST SET: written and
// hash-locked (~/LENSIQ-field/evals/merit/locked.sha256, "review amendment") BEFORE the fixes were made.
//   1. second tab: a support card on the tarot page in another tab withdraws the open merit panel and its paid offer
//   2. submit-time check: when the crisis state is set after the form was drawn (no event), submitting sends nothing
//      and shows the support card
//   3. blocked storage (localStorage throws): after a support card, the next reading on the same page shows no panel
//   4. horoscope: the panel sits in the visible overview tab, not in a hidden tab
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);

async function readZodiac(page) {
  await page.evaluate(() => {
    const y = +document.getElementById("zdYear").value, ya = ((y - 4) % 12 + 12) % 12;
    document.querySelector(`input[name="zdAnimal"][value="${ya}"]`).click(); document.getElementById("zdForm").requestSubmit();
  });
  await page.waitFor("document.querySelectorAll('.fa-section').length >= 3", 15000);
}
async function tarotReading(page, question) {
  await page.evaluate(q => {
    document.getElementById("trQuestion").value = q;
    document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click();
    document.getElementById("trStart").click();
  }, question);
  await sleep(600);
  await page.evaluate(() => document.getElementById("trAuto").click());
  await sleep(900);
  await page.evaluate(() => document.getElementById("trReveal").click());
  await page.waitFor("document.querySelectorAll('.fa-section').length >= 3", 25000);
}
const meritShown = `(() => ({ panels: [...document.querySelectorAll(".lq-merit")].filter(p => !p.hidden && p.getBoundingClientRect().height > 0).length,
  cards: document.querySelectorAll(".lq-merit-card").length, paid: document.querySelectorAll(".lq-merit-paid").length }))()`;

function stubScript(seed, { blockStorage = false } = {}) {
  return `(() => {
    ${blockStorage ? 'Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });' : ""}
    window.LENSIQ_API_BASE = location.origin;
    window.LENSIQ_ANALYTICS = false;
    window.LENSIQ_MERIT_INTEREST_FORM = true;
    window.__meritSent = [];
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const path = new URL(url, location.href).pathname;
      const H = { "Content-Type": "application/json" };
      if (path === "/v1/merit/guidance") {
        return Promise.resolve(new Response(JSON.stringify({ items: ${JSON.stringify(seed)}, interest_form: true, interest_retention_days: 30 }), { headers: H }));
      }
      if (path === "/v1/merit/interest") {
        window.__meritSent.push(JSON.parse(init.body));
        return Promise.resolve(new Response(JSON.stringify({ ok: true, id: "0".repeat(24) }), { status: 201, headers: H }));
      }
      if (path.startsWith("/v1/") || path.startsWith("/api/")) return Promise.resolve(new Response("{}", { status: 404, headers: H }));
      return orig(input, init);
    };
  })();`;
}
const fill = (page, name) => page.evaluate(n => {
  const f = document.querySelector(".lq-merit-paid form");
  f.elements.name.value = n; f.elements.channel.value = "line"; f.elements.contact.value = "tum_test";
  f.elements.date_from.value = "2027-01-10"; f.elements.date_to.value = "2027-01-20"; f.elements.consent.checked = true;
  f.requestSubmit();
}, name);

export default async function ({ base, launch, check, repo }) {
  const seed = require(join(repo, "lensiq-merit-seed.js")).map(x => ({ ...x, updated_at: 1 }));
  const browser = await launch();
  try {
    // two tabs of one browser profile (same storage): the default context
    const a = await browser.newPage(null, { initScripts: [stubScript(seed)] });
    const b = await browser.newPage(null, { initScripts: [stubScript(seed)] });
    await check("1. a support card in another tab withdraws the open panel and its paid offer", async () => {
      await a.goto(`${base}/zodiac.html`);
      await a.evaluate(() => localStorage.removeItem("lq-crisis-at"));
      await readZodiac(a);
      await a.waitFor("!!document.querySelector('.lq-merit-paid form')", 8000);
      await b.goto(`${base}/tarot.html`);
      await b.evaluate(() => { document.getElementById("trQuestion").value = "I want to die"; document.getElementById("trStart").click(); });
      await b.waitFor("(() => { const s = document.getElementById('trSupport'); return !!s && !s.hidden && /1323/.test(s.textContent); })()", 5000);
      await a.waitFor(`(() => { const r = ${meritShown}; return r.cards === 0 && r.paid === 0; })()`, 5000);
      assert(await a.evaluate(() => window.__meritSent.length) === 0);
    });
    await a.close(); await b.close();

    let page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed)] });
    await check("2. crisis state set after the form was drawn: submit sends nothing and shows the support card", async () => {
      await page.goto(`${base}/zodiac.html`);
      await readZodiac(page);
      await page.waitFor("!!document.querySelector('.lq-merit-paid form')", 8000);
      assert(/30/.test(await page.evaluate(() => document.querySelector(".lq-merit-paid").innerText)), "notice shows the configured 30 days");
      await page.evaluate(() => localStorage.setItem("lq-crisis-at", String(Date.now()))); // same page: no storage event
      await fill(page, "Tum");
      await page.waitFor("[...document.querySelectorAll('.lq-merit .fa-support')].some(s => /1323/.test(s.textContent))", 5000);
      await sleep(400);
      assert(await page.evaluate(() => window.__meritSent.length) === 0, "nothing sent");
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true, initScripts: [stubScript(seed, { blockStorage: true })] });
    await check("3. storage blocked: after a support card, the next reading on the page shows no merit panel", async () => {
      await page.goto(`${base}/tarot.html`);
      assert(await page.evaluate(() => { try { localStorage.length; return false; } catch (e) { return true; } }), "storage is blocked in this page");
      await page.evaluate(() => { document.getElementById("trQuestion").value = "I want to die"; document.getElementById("trStart").click(); });
      await page.waitFor("(() => { const s = document.getElementById('trSupport'); return !!s && !s.hidden && /1323/.test(s.textContent); })()", 5000);
      await tarotReading(page, "งานใหม่จะดีไหม");
      await sleep(1500);
      const r = await page.evaluate(meritShown);
      assert(r.panels === 0 && r.cards === 0 && r.paid === 0, JSON.stringify(r));
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true });
    await check("4. horoscope: the panel is in the visible overview tab", async () => {
      await page.goto(`${base}/horoscope.html`);
      await page.evaluate(() => {
        for (const [id, v] of [["hsDay", "15"], ["hsMonth", "8"], ["hsYear", "1990"]]) {
          const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
        }
        document.getElementById("hsGo").click();
      });
      await page.waitFor("document.querySelectorAll('.fa-section').length >= 3", 20000);
      await page.waitFor("document.querySelectorAll('.lq-merit-card').length > 0", 8000);
      await sleep(800);
      const r = await page.evaluate(() => {
        const p = document.querySelector(".lq-merit"), tab = p.closest("[role=tabpanel]");
        return { tab: tab && tab.id, hiddenTab: !!p.closest("[role=tabpanel][hidden]"), visible: p.getBoundingClientRect().height > 0 };
      });
      assert(r.tab === "pn-ov" && !r.hiddenTab && r.visible, JSON.stringify(r));
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

// tests/e2e/leads-off.e2e.mjs — the quote-request form stays OFF (owner decision 2026-11-12, Sellable pack item 9).
// FIXED TEST SET written before the build; sha256 in ~/LENSIQ-field/evals/leads/locked.sha256. No network: the API
// Worker is a fetch stub that logs every call.
// Amendment A6 (explicit owner decision 2026-11-12, form ON): the shipped default is now ON; "off" is a page that sets
// window.LENSIQ_LEADS_FORM = false before lensiq-config.js, and every "off" check below still holds for it. "on" runs with
// the shipped default (nothing preset) and also checks that the default really is on.
//   1. flag off (switched off) with the API configured: index.html's form and pricing.html's notify box send nothing
//      (no /v1/leads call), the form does not claim it sends to the team, the request stays in this browser only
//   2. flag off: privacy.html's quote-request section is hidden in Thai, English and Chinese; the LINE ID appears on no page
//   3. flag on (shipped default since 2026-11-12): the form posts /v1/leads, the confirmation offers the LINE contact
//      in TH / EN / 中文, and privacy.html shows the section with the LINE contact
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const API = "https://api.lensiq.test";
const ID = "@632yliiw";
const stub = (flag) => `(() => {
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_ANALYTICS = false;
  ${flag ? "" : "window.LENSIQ_LEADS_FORM = false; // switched off by this page"}
  const log = window.__apiLog = [];
  const realFetch = window.fetch.bind(window);
  const json = (b, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }));
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith(${JSON.stringify(API)})) return realFetch(input, init);
    const path = url.slice(${JSON.stringify(API)}.length).split("?")[0], method = (init.method || "GET").toUpperCase();
    log.push({ method, path, body: init.body ? String(init.body) : "" });
    if (path === "/v1/config") return json({ free_mode: true, pricing_enabled: true, billing_enabled: false, membership: { required: false, google_client_id: "" } });
    if (path === "/v1/leads" && method === "POST") return json({ ok: true, id: "a".repeat(24) }, 201);
    return json({ error: "not found" }, 404);
  };
})();`;

const fillForm = page => page.evaluate(() => {
  document.getElementById("lqName").value = "Test Buyer"; document.getElementById("lqEmail").value = "buyer@shop.example";
  document.getElementById("lqInterest").value = "store"; document.getElementById("lqConsent").checked = true;
  document.getElementById("leadForm").requestSubmit();
});
const leadCalls = page => page.evaluate(() => (window.__apiLog || []).filter(x => /\/v1\/leads/.test(x.path)).length);

export default async function ({ launch, base, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { initScripts: [stub(false)], isolated: true });
    await check("flag off + API configured: index form sends nothing, says so, keeps the request in this browser only", async () => {
      await page.goto(`${base}/index.html#contact`);
      await page.waitFor(() => window.LQLeads && window.LQApi && window.LQApi.enabled() && document.getElementById("leadNote").getAttribute("data-mode") !== null, 8000);
      assert(await page.evaluate(() => window.LENSIQ_LEADS_FORM === false), "switched off");
      const mode = await page.evaluate(() => document.getElementById("leadNote").getAttribute("data-mode"));
      assert(mode !== "api", "mode " + mode);
      await fillForm(page);
      await page.waitFor(() => /ยังไม่ได้ส่ง/.test(document.getElementById("leadMsg").textContent), 8000);
      await sleep(500);
      assert((await leadCalls(page)) === 0, "no /v1/leads call");
      assert(!page.requests.some(r => /\/v1\/leads|challenges\.cloudflare\.com/.test(r.url || "")), "no request to the inbox or the bot check");
      const q = await page.evaluate(() => JSON.parse(localStorage.getItem("lq-leads") || "[]").length);
      assert(q === 1, "kept in this browser: " + q);
      assert(!(await page.evaluate(() => [...document.querySelectorAll("[data-lq-pending] button")].some(b => /ส่งตอนนี้/.test(b.textContent)))),
        "no 'send now' while off");
      assert(!(await page.evaluate(id => document.body.innerText.includes(id), ID)), "no LINE ID on the page");
    });

    await check("flag off: pricing notify box sends nothing", async () => {
      await page.goto(`${base}/pricing.html`);
      await page.waitFor(() => window.LQLeads, 8000);
      const r = await page.evaluate(() => window.LQLeads.submit({ name: "Test Buyer", email: "buyer@shop.example", interest: "notify", source: "pricing" }));
      assert(r.via !== "api" && !r.ok, JSON.stringify(r));
      assert((await leadCalls(page)) === 0, "no /v1/leads call");
      assert(!(await page.evaluate(id => document.body.innerText.includes(id), ID)), "no LINE ID on the page");
    });

    await check("flag off: privacy.html hides the quote-request section in every language; the LINE ID appears on no page", async () => {
      for (const lang of ["th", "en", "zh"]) {
        await page.goto(`${base}/privacy.html?lang=${lang}`);
        await page.waitFor(() => document.readyState === "complete" && document.querySelectorAll("[data-leads-notice]").length === 3, 8000);
        await sleep(200);
        const r = await page.evaluate(() => ({ hidden: [...document.querySelectorAll("[data-leads-notice]")].every(s => s.hidden && s.getBoundingClientRect().height === 0),
          text: document.body.innerText }));
        assert(r.hidden, lang + ": section hidden");
        assert(!r.text.includes("@632yliiw") && !/180 (วัน|days|天)[^\n]*(ใบเสนอราคา|quote|询价)/i.test(r.text), lang + ": no quote text visible");
      }
      for (const p of ["help.html", "terms.html", "index.html", "solutions.html"]) {
        await page.goto(`${base}/${p}`);
        await sleep(300);
        assert(!(await page.evaluate(id => document.body.innerText.includes(id), ID)), p + ": no LINE ID shown");
      }
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [stub(true)], isolated: true });
    await check("flag on (later, after the owner's go-ahead): POST /v1/leads; confirmation offers LINE @632yliiw in TH / EN / 中文", async () => {
      for (const [lang, word] of [["th", "แอด LINE"], ["en", "LINE"], ["zh", "LINE"]]) {
        await page.goto(`${base}/index.html?lang=${lang}#contact`);
        await page.waitFor(() => document.getElementById("leadNote").getAttribute("data-mode") === "api", 8000);
        assert(await page.evaluate(() => window.LENSIQ_LEADS_FORM === true), "shipped default is on");
        await fillForm(page);
        await page.waitFor(() => document.getElementById("leadMsg").classList.contains("ok"), 8000);
        const t = await page.evaluate(() => document.getElementById("leadMsg").textContent);
        assert(t.includes(ID) && t.includes(word), lang + ": " + t);
        if (lang !== "th") assert(!/[ก-๛]/.test(t), lang + ": Thai left: " + t);
        // amendment 2026-11-12: the call log lives in the page, so it restarts on every navigation; exactly one per page
        assert((await leadCalls(page)) === 1, lang + ": one request sent");
      }
    });

    await check("flag on: privacy.html shows the quote-request section with the LINE contact", async () => {
      for (const lang of ["th", "en", "zh"]) {
        await page.goto(`${base}/privacy.html?lang=${lang}`);
        await page.waitFor(() => [...document.querySelectorAll("[data-leads-notice]")].some(s => !s.hidden && s.getBoundingClientRect().height > 0), 8000);
        const t = await page.evaluate(() => [...document.querySelectorAll("[data-leads-notice]")].filter(s => s.getBoundingClientRect().height > 0).map(s => s.innerText).join("\n"));
        assert(t.includes(ID) && /180/.test(t), lang + ": " + t.slice(0, 200));
      }
    });
    await page.close();
  } finally { await browser.close(); }
}

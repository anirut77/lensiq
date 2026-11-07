// tests/e2e/commercial.e2e.mjs — round 11 commercial + mobile pages, no network (the API Worker is a fetch stub):
//   1. report.html without an API: full sample reports (basic / compatibility / 12-month annual), print button, 中文 + EN
//   2. report.html with billing on (mocked Worker, member signed in): POST /api/me/entitlements/use BEFORE the report is
//      shown, then POST /api/me/saved; no credit -> no report
//   3. help / terms / privacy at 360 px: no raw [placeholders], demo notice, SLA table stacked as cards (no sideways
//      scroll); LENSIQ_SELLER fills every page from one config
//   4. pricing.html not open: free today / coming soon / notify me / 4 products; contact form: honest "not sent" text,
//      mailto fallback from LENSIQ_SELLER, POST /v1/leads when the API is configured
//   5. account.html: renewal banner 7 days before the end, consent date without the internal version id, redeem link;
//      sign-in dialog: consent focused first, Google button replaces Continue in the footer once ticked
import { assert } from "./cdp.mjs";

const API = "https://api.lensiq.test";
const CLIENT = "test-client.apps.example";
const THAI = "/[\\u0E00-\\u0E7F]/";

const mock = ({ freeMode = true, credits = 1, plan = null, leads = true } = {}) => `(() => {
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_GOOGLE_CLIENT_ID = ${JSON.stringify(CLIENT)};
  window.LENSIQ_ANALYTICS = false;
  const TOKEN = "t".repeat(43);
  try { sessionStorage.setItem("lq-member-session", JSON.stringify({ t: TOKEN, exp: Math.floor(Date.now() / 1000) + 3600 })); } catch (e) {}
  const log = window.__apiLog = [];
  let left = ${credits};
  const now = Math.floor(Date.now() / 1000);
  const me = () => ({ user: { id: "u1", email: "member@example.test", display_name: "Somchai", created_at: 1, last_login_at: 1, consent_version: "m1", consent_at: 1700000000, status: "active" },
    tier: ${JSON.stringify(plan ? plan : "member")}, plan: ${plan ? `{ id: ${JSON.stringify(plan)}, period: "month", source: "purchase", current_period_end: now + 3 * 86400 }` : "null"},
    credits: { report_basic: left }, quotas: { ai: { used: 0, quota: 3, period: "day" }, saved: { used: 0, max: 50 }, readings_today: 0 } });
  const realFetch = window.fetch.bind(window);
  const json = (b, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }));
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith(${JSON.stringify(API)})) return realFetch(input, init);
    const path = url.slice(${JSON.stringify(API)}.length).split("?")[0], method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ method, path, body });
    if (path === "/v1/config") return json({ free_mode: ${freeMode}, pricing_enabled: true, billing_enabled: ${!freeMode}, membership: { required: false, google_client_id: ${JSON.stringify(CLIENT)} } });
    if (path === "/api/me") return json(me());
    if (path === "/api/me/entitlements") return json({ perks: { report_basic: { credits: left }, report_compat: { credits: 0 }, report_annual: { credits: 0 } } });
    if (path === "/api/me/entitlements/use" && method === "POST") { if (left > 0) { left--; return json({ feature: body.feature, allowed: true, via: "credit", credits: left }); } return json({ feature: body.feature, allowed: false }); }
    if (path === "/api/me/saved" && method === "POST") return json({ ok: true, id: "s".repeat(22) }, 201);
    if (path === "/api/me/history") return json({ ledger: [], saved: [], payments: [] });
    if (path === "/api/me/sessions") return json({ sessions: [] });
    if (path === "/v1/leads" && method === "POST") return ${leads} ? json({ ok: true }, 201) : json({ error: "not found" }, 404);
    if (path === "/api/auth/nonce") return json({ nonce: "n".repeat(32) }, 201);
    if (path === "/api/fortune/status") return json({ enabled: true, model: "test" });
    if (path === "/api/fortune" && method === "POST") return json({ error: "quota", code: "quota", fallback: true }, 429);
    return json({ error: "not found" }, 404);
  };
  window.google = { accounts: { id: { initialize(o) { window.__gsi = o; }, renderButton(el) { const b = document.createElement("button"); b.type = "button"; b.id = "fakeGoogleBtn"; b.textContent = "Google"; el.appendChild(b); }, prompt() {} } } };
})();`;

async function makeReport(page, type, { year = "2533", other = "2531" } = {}) {
  await page.evaluate((t, y, o) => {
    document.querySelector(`[data-rp-type="${t}"]`).click();
    document.getElementById("rpAYear").value = y;
    if (t === "report_compat") document.getElementById("rpBYear").value = o;
    document.getElementById("rpGo").click();
  }, type, year, other);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { isolated: true });
    await check("report: no API -> full sample reports (basic / compat / annual) with print, nothing sent", async () => {
      await page.goto(`${base}/report.html`);
      await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
      await makeReport(page, "report_basic");
      await page.waitFor(() => !document.getElementById("rpOut").hidden && document.querySelectorAll("#rpOut .rp-part").length === 3, 8000);
      const b = await page.evaluate(() => ({ parts: [...document.querySelectorAll("#rpOut .rp-part")].map(p => p.getAttribute("data-part")), sample: !!document.querySelector("#rpOut .rp-sample"), print: !!document.getElementById("rpPrint"), len: document.getElementById("rpOut").textContent.length, plan: !!document.querySelector("#rpOut .rp-plan") }));
      assert(b.parts.join() === "bazi,taksa,lek7" && b.sample && b.print && b.plan && b.len > 2500, JSON.stringify(b));
      await makeReport(page, "report_compat");
      await page.waitFor(() => document.querySelector('#rpOut [data-part="elements"]'), 8000);
      await makeReport(page, "report_annual");
      await page.waitFor(() => document.querySelectorAll("#rpOut .rp-month").length === 12, 8000);
      const bad = await page.evaluate(() => { document.getElementById("rpAYear").value = "12"; document.getElementById("rpGo").click(); return document.getElementById("rpMsg").textContent; });
      assert(bad.length > 5, "year validation message");
      assert(!page.requests.some(r => /\/api\/|\/v1\//.test(r.url)), "no API request without an API");
    });
    await check("report: 中文 and English output has no Thai; phone width has no horizontal overflow", async () => {
      for (const lang of ["zh", "en"]) {
        await page.goto(`${base}/report.html?lang=${lang}`);
        await page.waitFor(() => window.__rp && window.LQI18N && document.documentElement.lang !== "th", 8000);
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await makeReport(page, "report_annual", { year: "1990" });
        await page.waitFor(() => document.querySelectorAll("#rpOut .rp-month").length === 12, 8000);
        const r = await page.evaluate(re => ({ thai: (document.getElementById("main").innerText.match(new RegExp(re.slice(1, -1), "g")) || []).length, over: document.documentElement.scrollWidth - innerWidth }), THAI);
        assert(r.thai === 0, lang + ": Thai characters in the page: " + r.thai);
        assert(r.over <= 0, lang + ": horizontal overflow " + r.over);
      }
      await page.send("Emulation.clearDeviceMetricsOverride", {});
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [mock({ freeMode: false, credits: 1 })], isolated: true });
    await check("report: billing on -> one credit taken by the server BEFORE the report, then saved; no credit -> no report", async () => {
      await page.goto(`${base}/report.html?type=report_basic`);
      await page.waitFor(() => window.LQMember && window.LQMember.ready() && window.LQMember.signedIn() && /1/.test(document.querySelector('[data-rp-credit="report_basic"]').textContent), 8000);
      await makeReport(page, "report_basic");
      await page.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length === 3 && /\S/.test(document.getElementById("rpSaveMsg").textContent) && !/…/.test(document.getElementById("rpSaveMsg").textContent), 8000);
      const log = await page.evaluate(() => window.__apiLog.filter(x => x.method === "POST").map(x => x.path + (x.body && x.body.feature ? ":" + x.body.feature : "") + (x.body && x.body.domain ? ":" + x.body.domain : "")));
      const u = log.indexOf("/api/me/entitlements/use:report_basic"), s = log.indexOf("/api/me/saved:bazi");
      assert(u >= 0 && s > u, "use then save: " + log.join(" | "));
      const sample = await page.evaluate(() => !!document.querySelector("#rpOut .rp-sample"));
      assert(!sample, "a paid report is not labelled as a sample");
      await page.evaluate(() => { document.getElementById("rpOut").hidden = true; });
      await page.waitFor(() => /0/.test(document.querySelector('[data-rp-credit="report_basic"]').textContent) && document.getElementById("rpGo").disabled, 8000);
      const gate = await page.evaluate(() => document.getElementById("rpGate").innerHTML);
      assert(/pricing\.html/.test(gate), "no-credit gate links pricing: " + gate);
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true });
    await check("help / terms / privacy at 360 px: no raw [placeholders], demo notice, SLA table as cards", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
      for (const lang of ["th", "en", "zh"]) for (const p of ["help.html", "terms.html", "privacy.html"]) {
        await page.goto(`${base}/${p}?lang=${lang}`);
        await page.waitFor(() => document.readyState === "complete", 8000);
        const r = await page.evaluate(() => {
          const art = [...document.querySelectorAll("article.lg")].find(a => getComputedStyle(a).display !== "none");
          const demo = art && art.querySelector("[data-seller-demo]");
          return { raw: (art.innerText.match(/\[[^\]\n]{2,60}\]/g) || []), demo: !!demo && !demo.hidden && demo.offsetHeight > 0, over: document.documentElement.scrollWidth - innerWidth,
            tbl: (() => { const t = art.querySelector(".tbl-cards"); return t ? t.scrollWidth - t.clientWidth : 0; })(), pend: art.querySelectorAll(".ph.pend").length };
        });
        assert(!r.raw.length, `${lang} ${p}: raw placeholders ${r.raw.join(" ")}`);
        assert(r.demo, `${lang} ${p}: demo notice shown`);
        assert(r.over <= 0 && r.tbl <= 0, `${lang} ${p}: overflow page ${r.over} table ${r.tbl}`);
        assert(r.pend >= 3, `${lang} ${p}: neutral pending wording`);
      }
      await page.send("Emulation.clearDeviceMetricsOverride", {});
    });
    await page.close();

    const SELLER = `window.LENSIQ_SELLER = { sales_open: false, email: "help@example.test", line: "@lensiqtest", name: "", tax_id: "" };`;
    page = await browser.newPage(null, { initScripts: [SELLER], isolated: true });
    await check("LENSIQ_SELLER: one config fills help, terms and the contact form (mailto fallback, honest 'not sent')", async () => {
      await page.goto(`${base}/help.html`);
      await page.waitFor(() => document.querySelector('[data-seller="email"][data-filled] a[href="mailto:help@example.test"]'), 8000);
      const h = await page.evaluate(() => ({ line: !!document.querySelector('[data-seller="line"] a[href*="line.me"]'), demo: !document.querySelector("[data-seller-demo]").hidden }));
      assert(h.line && h.demo, JSON.stringify(h));
      await page.goto(`${base}/terms.html`);
      await page.waitFor(() => document.querySelector('[data-seller="email"][data-filled]') && document.querySelector('[data-seller="name"].pend'), 8000);
      await page.goto(`${base}/index.html?interest=hr#contact`);
      await page.waitFor(() => document.getElementById("leadNote").getAttribute("data-mode") === "fallback" && document.getElementById("lqInterest").value === "hr", 8000);
      await page.evaluate(() => {
        document.getElementById("lqName").value = "Test Person"; document.getElementById("lqEmail").value = "t@example.test";
        document.getElementById("lqConsent").checked = true; document.getElementById("leadForm").requestSubmit();
      });
      await page.waitFor(() => document.querySelector('#leadMsg a[href^="mailto:help@example.test"]'), 8000);
      const t = await page.evaluate(() => document.getElementById("leadMsg").textContent);
      assert(!/ได้รับคำขอเดโมแล้ว/.test(t), "does not claim the request was received: " + t);
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true });
    await check("pricing not open: free today, coming soon, notify-me (honest without API), 4 product links; contact form not sent", async () => {
      await page.goto(`${base}/pricing.html`);
      await page.waitFor(() => !document.getElementById("prOff").hidden, 8000);
      const r = await page.evaluate(() => ({ prods: document.querySelectorAll(".pr-products a").length, soon: document.querySelectorAll("#prOff .pr-soon").length, report: !!document.querySelector('#prOff a[href="report.html"]'), h: document.documentElement.scrollHeight }));
      assert(r.prods === 4 && r.soon === 3 && r.report && r.h > 1100, JSON.stringify(r));
      await page.evaluate(() => { const f = document.getElementById("prNotify"); f.email.value = "a@example.test"; f.consent.checked = true; f.requestSubmit(); });
      await page.waitFor(() => document.getElementById("prNotifyMsg").textContent.length > 10 && !/…/.test(document.getElementById("prNotifyMsg").textContent), 5000);
      await page.goto(`${base}/index.html#contact`);
      await page.waitFor(() => document.getElementById("leadNote").getAttribute("data-mode") === "none", 8000);
      await page.evaluate(() => {
        document.getElementById("lqName").value = "Test Person"; document.getElementById("lqEmail").value = "t@example.test";
        document.getElementById("lqInterest").value = "store"; document.getElementById("lqConsent").checked = true; document.getElementById("leadForm").requestSubmit();
      });
      await page.waitFor(() => /ยังไม่ได้ส่ง/.test(document.getElementById("leadMsg").textContent), 5000);
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [mock({ freeMode: false, credits: 0 }), `try { localStorage.setItem("fa-consent", "1"); } catch (e) {}`], isolated: true });
    await check("fortune page: AI quota refused (429 quota) -> local reading + upgrade / report card", async () => {
      await page.goto(`${base}/iching.html`);
      await page.waitFor(() => window.LQMember && window.LQMember.ready(), 8000);
      await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
      await page.waitFor(() => document.querySelector('#icRd-body [data-lq-upsell="quota"]'), 15000);
      const r = await page.evaluate(() => ({ links: [...document.querySelectorAll('#icRd-body [data-lq-upsell="quota"] a')].map(a => a.getAttribute("href")), secs: document.querySelectorAll("#icRd-body .fa-section").length }));
      assert(r.links.includes("pricing.html") && r.links.includes("report.html") && r.secs >= 3, JSON.stringify(r));
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [mock({ freeMode: false, plan: "plus" })], isolated: true });
    await check("API: contact form POSTs /v1/leads; account renewal banner + consent date only; sign-in dialog consent first", async () => {
      await page.goto(`${base}/index.html#contact`);
      await page.waitFor(() => document.getElementById("leadNote").getAttribute("data-mode") === "api", 8000);
      await page.evaluate(() => {
        document.getElementById("lqName").value = "Test Person"; document.getElementById("lqEmail").value = "t@example.test";
        document.getElementById("lqInterest").value = "store"; document.getElementById("lqConsent").checked = true; document.getElementById("leadForm").requestSubmit();
      });
      await page.waitFor(() => window.__apiLog.some(x => x.path === "/v1/leads" && x.body && x.body.email === "t@example.test" && x.body.consent === true) && document.getElementById("leadMsg").classList.contains("ok"), 8000);
      await page.goto(`${base}/account.html`);
      await page.waitFor(() => !document.getElementById("acApp").hidden && !document.getElementById("acRenew").hidden, 8000);
      const a = await page.evaluate(() => ({ text: document.getElementById("acRenewText").textContent, profile: document.getElementById("acProfile").textContent, redeem: !!document.querySelector('[data-ac-redeem="report_basic"]'), menu: !!document.querySelector("[data-lq-renew]") }));
      assert(/3/.test(a.text) && a.redeem && a.menu, JSON.stringify(a));
      assert(!/\bm1\b/.test(a.profile), "internal consent version hidden: " + a.profile);
      await page.evaluate(() => window.LQMember.signOut());
      await page.waitFor(() => !document.getElementById("acOut").hidden, 5000);
      await page.evaluate(() => window.LQMember.signIn());
      await page.waitFor(() => document.querySelector("dialog.lq-dlg[open]"), 5000);
      const f = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("name"));
      assert(f === "terms", "first focus on the consent checkbox: " + f);
      await page.evaluate(() => document.querySelector('dialog.lq-dlg input[name="terms"]').click());
      await page.waitFor(() => document.querySelector("dialog.lq-dlg [data-lq-dlg-foot] .row #fakeGoogleBtn") && document.querySelector("[data-lq-continue]").hidden, 5000);
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

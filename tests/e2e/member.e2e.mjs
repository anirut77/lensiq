// tests/e2e/member.e2e.mjs — member sign-in + light reading, against a MOCKED API Worker and a MOCKED Google Identity
// Services object (no network: window.fetch for the API origin and window.google are stubbed by an init script, so no
// e-mail or token ever leaves the machine).
//   1. no API configured (today's GitHub Pages): full reading, no sign-in UI, lensiq-member.js not loaded
//   2. API + membership.required: guest sees the light reading (summary, first sections, cautions, reminder) and the
//      "sign in free with Google" card; no request to accounts.google.com before the click
//   3. mocked sign-in (consent checkbox, nonce, ID token posted to /api/auth/google) -> full reading + account chip;
//      the member token lives in sessionStorage unless "remember me" is ticked (then localStorage)
//   4. phones: the sign-in dialog fits 360×640 (sticky Continue / Cancel footer, "what we keep" collapsed) and the bar
//      shows a 44 px account icon beside the menu button without overflow (320 / 360 px, compact language switch)
//   5. account.html signed in: skeleton -> history, receipts, typed DELETE, guest-purchase claim after sign-in
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = "https://api.lensiq.test";
const CLIENT = "test-client.apps.example";

const MOCK = `(() => {
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_GOOGLE_CLIENT_ID = ${JSON.stringify(CLIENT)};
  window.LENSIQ_ANALYTICS = false;
  const TOKEN = "t".repeat(43);
  const log = window.__apiLog = [];
  const me = { user: { id: "u1", email: "member@example.test", display_name: "Somchai", created_at: 1, last_login_at: 1, marketing_opt_in: false, consent_version: "m1", consent_at: 1, status: "active" },
    tier: "member", plan: null, quotas: { ai: { used: 0, quota: 3, remaining: 3, period: "day", enforced: true }, saved: { used: 0, max: 50 }, readings_today: 0 }, membership: { required: true } };
  const realFetch = window.fetch.bind(window);
  const json = (b, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }));
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith(${JSON.stringify(API)})) return realFetch(input, init);
    const path = url.slice(${JSON.stringify(API)}.length).split("?")[0], method = (init.method || "GET").toUpperCase();
    const h = new Headers(init.headers || {});
    const authed = h.get("Authorization") === "Bearer " + TOKEN;
    log.push({ method, path, authed, body: init.body ? JSON.parse(init.body) : null });
    if (path === "/v1/config") return json({ analytics: true, free_mode: true, pricing_enabled: false, membership: { required: true, google_client_id: ${JSON.stringify(CLIENT)}, consent_version: "m1", guest_daily_readings: 3, guest_light_sections: 2, member_ai_daily: 3 } });
    if (path === "/api/fortune/status") return json({ enabled: false, reason: "member_required" });
    if (path === "/api/auth/nonce" && method === "POST") return json({ nonce: "n".repeat(32), expires_in: 600 }, 201);
    if (path === "/api/auth/google" && method === "POST") return json({ token: TOKEN, expires_at: Math.floor(Date.now() / 1000) + 3600, created: true, user: me.user });
    if (path === "/api/me" && method === "DELETE") return authed && init.body && JSON.parse(init.body).confirm === "DELETE" ? json({ ok: true, deleted: true }) : json({ error: "confirm" }, 400);
    if (path === "/api/me") return authed ? json(me) : json({ error: "please sign in", code: "member_required" }, 401);
    if (path === "/api/me/usage") return json({ ok: true, recorded: true });
    if (path === "/v1/billing/plans") return json({ free_mode: false, billing_enabled: true, pricing_enabled: true, vat_registered: true,
      perks: [{ id: "pdf_report", status: "coming_soon", label_th: "รายงาน PDF", label_en: "PDF report" }],
      plans: [{ id: "free", name_th: "ฟรี", name_en: "Free", kind: "subscription", status: "active", price_month_satang: 0, price_year_satang: 0, entitlements: { ai_reading: { quota: 3, period: "day" } } },
        { id: "plus", name_th: "พลัส", name_en: "Plus", kind: "subscription", status: "active", price_month_satang: 14900, price_year_satang: 99000, entitlements: { ai_reading: { quota: 30, period: "month" } } },
        { id: "pro", name_th: "โปร", name_en: "Pro", kind: "subscription", status: "draft", price_month_satang: 99000, price_year_satang: 990000, entitlements: {} },
        { id: "report_basic", name_th: "รายงานดวงพื้นฐาน", name_en: "Basic reading report", kind: "one_time", status: "active", price_once_satang: 4900, perks: ["pdf_report"], entitlements: { report_basic: { quota: 1, period: "once" } } }] });
    if (path === "/api/me/history") return window.__histFail ? json({ error: "boom" }, 500) : json({ ledger: [{ ts: 1700000000, kind: "reading", domain: "tarot", amount_satang: null }], next_before: null, saved: [],
      payments: [{ id: "p1", kind: "checkout", plan_id: "report_basic", period: "once", status: "successful", amount_satang: 4900, vat_satang: 321, receipt_no: "LQ-202611-000001", doc_type: "receipt", created_at: 1700000000, paid_at: 1700000000 }] });
    if (path === "/api/me/payments/p1/receipt") return authed ? json({ receipt: { receipt_no: "LQ-202611-000001", amount_satang: 4900, subtotal_satang: 4579, vat_satang: 321, plan_id: "report_basic", paid_at: 1700000000 } }) : json({ error: "sign in" }, 401);
    if (path === "/v1/billing/claim" && method === "POST") return authed ? json({ ok: true, linked: 1 }) : json({ error: "sign in", code: "member_required" }, 401);
    return json({ error: "not found" }, 404);
  };
  // Google Identity Services stand-in: renderButton draws a button that "returns" an ID token for the nonce
  window.google = { accounts: { id: {
    initialize(o) { window.__gsi = o; },
    renderButton(el) { const b = document.createElement("button"); b.type = "button"; b.id = "fakeGoogleBtn"; b.textContent = "Google";
      b.onclick = () => window.__gsi.callback({ credential: "header.payload-" + window.__gsi.nonce + ".sig" }); el.appendChild(b); },
    prompt() {}
  } } };
})();`;

// shared with tools/mobile-audit.mjs --states (signed-in account page, sign-in dialog, gated reading on a phone)
export { MOCK, API };

const readingDone = `(() => { const b = document.getElementById("icRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 1 && b.textContent.length > 100; })()`;
async function castIching(page) {
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
  await page.waitFor(() => !document.getElementById("icResult").hidden, 15000);
  await page.waitFor(readingDone, 8000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { isolated: true });
    await check("member: without an API the reading is full and no sign-in UI / member script exists", async () => {
      await page.goto(`${base}/iching.html`);
      await castIching(page);
      await sleep(400);
      const r = await page.evaluate(() => ({
        gate: !!document.querySelector(".lq-gate"), chip: !!document.querySelector(".lq-acct"), mod: !!window.LQMember,
        script: !!document.querySelector('script[src*="lensiq-member.js"]'), secs: document.querySelectorAll("#icRd-body .fa-section").length
      }));
      assert(!r.gate && !r.chip && !r.mod && !r.script, JSON.stringify(r));
      assert(r.secs >= 3, "full reading: " + r.secs);
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK], isolated: true });
    await check("member: guest gets the light reading + sign-in card; safety reminder kept; Google not contacted", async () => {
      await page.goto(`${base}/iching.html`);
      await page.waitFor(() => window.LQMember && window.LQMember.ready(), 8000);
      await castIching(page);
      await page.waitFor(() => window.LQMember.ready() && !!document.querySelector("#icRd-body .lq-gate"), 8000);
      const r = await page.evaluate(() => {
        const b = document.getElementById("icRd-body");
        return {
          secs: [...b.querySelectorAll(":scope > .fa-section")].map(s => s.getAttribute("data-section")),
          reminder: !!b.querySelector(".fa-reminder"), summary: !!b.querySelector(".fa-summary"), plan: !!b.querySelector(".fa-plan"),
          card: b.querySelector(".lq-gate").textContent, chip: !!document.querySelector(".lq-acct [data-lq-signin]") || !!document.querySelector(".lq-acct-item"),
          count: JSON.parse(localStorage.getItem("lq-guest-reads") || "null")
        };
      });
      assert(r.reminder, "Kalama reminder always shown to guests");
      assert(!r.plan, "3-point plan is for members");
      assert(r.secs.filter(s => s !== "cautions").length <= 2, "at most 2 sections: " + r.secs.join(","));
      assert(/Google/.test(r.card), "sign-in card");
      assert(r.chip, "sign-in entry in the header");
      assert(r.count && r.count.n === 1, "soft guest counter: " + JSON.stringify(r.count));
      assert(!page.requests.some(q => /accounts\.google\.com|googleapis/.test(q.url)), "no Google request on page load");
      // AI writing assistant is not offered to guests (status says member_required)
      assert(await page.evaluate(() => !document.querySelector("#icRd-consent .fa-consent")), "no AI consent box for guests");
    });

    await check("member: mocked Google sign-in -> full reading, account chip, member token on API calls", async () => {
      await page.evaluate(() => document.querySelector("#icRd-body .lq-gate [data-lq-signin]").click());
      await page.waitFor(() => !!document.querySelector("dialog.lq-dlg[open]"), 3000);
      const before = await page.evaluate(() => document.querySelector("[data-lq-continue]").disabled);
      assert(before, "continue disabled until the terms are accepted");
      await page.evaluate(() => { const c = document.querySelector('dialog.lq-dlg input[name="terms"]'); c.click(); });
      await page.evaluate(() => document.querySelector("[data-lq-continue]").click());
      await page.waitFor(() => !!document.getElementById("fakeGoogleBtn"), 3000);
      const init = await page.evaluate(() => ({ client: window.__gsi.client_id, nonce: window.__gsi.nonce }));
      assert(init.client === "test-client.apps.example" && init.nonce === "n".repeat(32), JSON.stringify(init));
      await page.evaluate(() => document.getElementById("fakeGoogleBtn").click());
      await page.waitFor(() => window.LQMember.signedIn() && !document.querySelector("dialog.lq-dlg"), 5000);
      await page.waitFor(() => !document.querySelector("#icRd-body .lq-gate") && !!document.querySelector("#icRd-body [data-lq-member-actions]"), 5000);
      const r = await page.evaluate(() => ({
        secs: document.querySelectorAll("#icRd-body .fa-section").length,
        reminder: !!document.querySelector("#icRd-body .fa-reminder"),
        chip: (document.querySelector(".lq-acct .lq-av") || {}).textContent,
        token: (() => { try { return JSON.parse(sessionStorage.getItem("lq-member-session")).t.length; } catch (e) { return 0; } })(),
        local: localStorage.getItem("lq-member-session"),
        signin: window.__apiLog.find(x => x.path === "/api/auth/google"),
        usage: window.__apiLog.filter(x => x.path === "/api/me/usage" && x.authed).length
      }));
      assert(r.secs >= 3, "full reading after sign-in: " + r.secs);
      assert(r.reminder, "reminder still shown");
      assert(r.chip === "S", "avatar initial in the header chip: " + r.chip);
      assert(r.token === 43, "member token kept in sessionStorage by default");
      assert(r.local == null, "nothing in localStorage without 'remember me'");
      assert(r.signin.body.accept_terms === true && r.signin.body.marketing_opt_in === false && r.signin.body.consent_version === "m1", JSON.stringify(r.signin.body));
      assert(r.usage >= 1, "reading recorded in the member's history (domain only)");
    });

    await check("member: account chip menu and sign-out work at 360 px without overflow", async () => {
      for (const w of [360, 320]) {
        await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 780, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        const r = await page.evaluate(() => {
          const av = document.querySelector(".lq-acct-btn").getBoundingClientRect(), tg = document.querySelector(".nav-toggle").getBoundingClientRect();
          const hidden = [...document.querySelectorAll(".lang-switch button")].filter(b => getComputedStyle(b).display === "none").length;
          return { sw: document.documentElement.scrollWidth, w: innerWidth, item: !!document.querySelector(".lq-acct-item a[href='account.html']"),
            av: [Math.round(av.width), Math.round(av.height)], gap: Math.round(tg.left - av.right), tgRight: Math.round(tg.right), hidden };
        });
        assert(r.sw <= r.w, `no horizontal overflow at ${w}px (${r.sw} > ${r.w})`);
        assert(r.item, "account entry in the mobile drawer");
        assert(r.av[0] >= 44 && r.av[1] >= 44, "44 px avatar in the bar: " + r.av);
        assert(r.gap >= 0 && r.gap <= 16 && r.tgRight <= r.w, "avatar right beside the menu button: " + JSON.stringify(r));
        assert(r.hidden === 2, "compact language switch with the account icon: " + r.hidden);
      }
      // compact language switch opens the other two languages
      await page.evaluate(() => document.querySelector(".lang-switch button[aria-pressed=true]").click());
      const open = await page.evaluate(() => ({ open: document.querySelector(".lang-switch").classList.contains("open"),
        vis: [...document.querySelectorAll(".lang-switch button")].filter(b => getComputedStyle(b).display !== "none").length,
        exp: document.querySelector(".lang-switch button[aria-pressed=true]").getAttribute("aria-expanded") }));
      assert(open.open && open.vis === 3 && open.exp === "true", "compact switch opens: " + JSON.stringify(open));
      const closed = await page.evaluate(() => { document.querySelector(".lang-switch button[aria-pressed=true]").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return !document.querySelector(".lang-switch").classList.contains("open"); });
      assert(closed, "Escape closes the compact language list");
      await page.send("Emulation.clearDeviceMetricsOverride");
      await sleep(200);
      await page.evaluate(() => { document.querySelector(".lq-acct-btn").click(); });
      assert(await page.evaluate(() => !document.querySelector(".lq-acct-menu").hidden), "menu opens");
      await page.evaluate(() => document.querySelector("[data-lq-signout]").click());
      await page.waitFor(() => !window.LQMember.signedIn() && !!document.querySelector("#icRd-body .lq-gate"), 5000);
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK], isolated: true });
    await check("member: sign-in dialog fits a 360×640 phone; 'remember me' keeps the token in localStorage; guest purchase claimed", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
      await page.goto(`${base}/account.html`);
      await page.evaluate(() => localStorage.setItem("lq-pending-claims", JSON.stringify([{ customer_id: "c".repeat(24), order_token: "o".repeat(32), plan_id: "report_basic", at: Math.floor(Date.now() / 1000) }])));
      await page.waitFor(() => window.LQMember && window.LQMember.ready() && !document.getElementById("acOut").hidden, 8000);
      const chip = await page.evaluate(() => { const b = document.querySelector(".lq-acct [data-lq-signin]"); const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: b.getAttribute("aria-label") }; });
      assert(chip.w >= 44 && chip.h >= 44 && /Google/.test(chip.label), "sign-in icon in the phone bar: " + JSON.stringify(chip));
      await page.evaluate(() => document.getElementById("acSignIn").click());
      await page.waitFor(() => !!document.querySelector("dialog.lq-dlg[open]"), 3000);
      const d = await page.evaluate(() => {
        const dl = document.querySelector("dialog.lq-dlg"), r = dl.getBoundingClientRect();
        const btns = ["[data-lq-continue]", "dialog.lq-dlg .lq-btn.ghost"].map(s => document.querySelector(s).getBoundingClientRect());
        return { top: r.top, bottom: r.bottom, vh: innerHeight, btns: btns.map(b => [Math.round(b.top), Math.round(b.bottom)]),
          keepOpen: document.querySelector("dialog.lq-dlg details[data-lq-keep]").open, remember: !!document.querySelector('dialog.lq-dlg input[name="remember"]'),
          foot: !!document.querySelector("dialog.lq-dlg [data-lq-dlg-foot] [data-lq-continue]") };
      });
      assert(d.top >= 0 && d.bottom <= d.vh, "dialog within the viewport: " + JSON.stringify(d));
      assert(d.btns.every(b => b[0] >= 0 && b[1] <= d.vh), "Continue + Cancel visible without scrolling: " + JSON.stringify(d.btns));
      assert(d.foot && d.remember && !d.keepOpen, "sticky footer, remember-me box, 'what we keep' collapsed on a phone: " + JSON.stringify(d));
      await page.evaluate(() => { document.querySelector('dialog.lq-dlg input[name="terms"]').click(); document.querySelector('dialog.lq-dlg input[name="remember"]').click(); document.querySelector("[data-lq-continue]").click(); });
      await page.waitFor(() => !!document.getElementById("fakeGoogleBtn"), 3000);
      await page.evaluate(() => document.getElementById("fakeGoogleBtn").click());
      await page.waitFor(() => window.LQMember.signedIn() && !document.getElementById("acApp").hidden, 5000);
      await page.waitFor(() => window.__apiLog.some(x => x.path === "/v1/billing/claim"), 5000);
      await sleep(300);
      const r = await page.evaluate(() => ({ local: !!localStorage.getItem("lq-member-session"), sess: sessionStorage.getItem("lq-member-session"),
        claim: window.__apiLog.find(x => x.path === "/v1/billing/claim"), left: JSON.parse(localStorage.getItem("lq-pending-claims") || "[]").length }));
      assert(r.local && r.sess == null, "remember me -> localStorage only");
      assert(r.claim.authed && r.claim.body.customer_id === "c".repeat(24) && r.claim.body.order_token === "o".repeat(32), "claim posted with the member token: " + JSON.stringify(r.claim));
      assert(r.left === 0, "claimed purchase forgotten locally");
      await page.send("Emulation.clearDeviceMetricsOverride");
    });

    await check("member: account.html signed in — history, receipt, inline feedback, typed DELETE, failure hides 'load more'", async () => {
      await page.waitFor(() => !document.getElementById("acPayments").hasAttribute("aria-busy") && !!document.querySelector("#acPayments table"), 5000);
      const r = await page.evaluate(() => ({ ledger: document.querySelector("#acLedger table tbody tr") ? document.querySelector("#acLedger table tbody tr").textContent : "",
        savedEmpty: !!document.querySelector("#acSaved .acct-empty"), receiptBtn: !!document.querySelector("#acPayments button.acct-mini"), more: document.getElementById("acMore").hidden,
        footer: ["terms.html", "privacy.html", "help.html", "terms.html#t9"].every(h => !!document.querySelector(`footer a[href="${h}"]`)) }));
      assert(r.ledger.length > 0 && r.savedEmpty && r.receiptBtn && r.more && r.footer, JSON.stringify(r));
      await page.evaluate(() => { window.open = () => null; document.querySelector("#acPayments button.acct-mini").click(); });
      await page.waitFor(() => !document.getElementById("acSavedView").hidden && /LQ-202611-000001/.test(document.getElementById("acSavedView").textContent), 4000);
      // typed DELETE: the checkbox alone does not enable deletion
      const del = await page.evaluate(() => {
        const ok = document.getElementById("acDelOk"), w = document.getElementById("acDelWord"), b = document.getElementById("acDelete");
        ok.click(); const a = b.disabled;
        w.value = "delete"; w.dispatchEvent(new Event("input")); const c = b.disabled;
        w.value = "DELETE"; w.dispatchEvent(new Event("input")); return { a, c, d: b.disabled };
      });
      assert(del.a && del.c && !del.d, "DELETE must be typed: " + JSON.stringify(del));
      // marketing toggle: feedback right under the control
      await page.evaluate(() => document.getElementById("acMarketing").click());
      await page.waitFor(() => document.getElementById("acMarketingMsg").textContent.length > 0, 3000);
      // history failure: retry instead of 'load more'
      await page.evaluate(() => { window.__histFail = true; document.getElementById("acRetry").hidden = false; document.getElementById("acRetry").click(); });
      await page.waitFor(() => !document.getElementById("acRetry").hidden && document.getElementById("acMore").hidden && document.getElementById("acHistMsg").classList.contains("bad"), 4000);
      await page.evaluate(() => { window.__histFail = false; });
      await page.evaluate(() => document.getElementById("acDelete").click());
      await page.waitFor(() => window.__apiLog.some(x => x.path === "/api/me" && x.method === "DELETE") && !window.LQMember.signedIn(), 4000);
      const delReq = await page.evaluate(() => window.__apiLog.find(x => x.path === "/api/me" && x.method === "DELETE").body);
      assert(delReq.confirm === "DELETE", "server confirm");
      const errs = page.consoleErrors.filter(e => e.kind === "exception");
      assert(!errs.length, JSON.stringify(errs));
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK], isolated: true });
    await check("pricing: plans from the Worker, buy only 'active', coming-soon perk, VAT shown, sign-in before checkout, EN", async () => {
      await page.goto(`${base}/pricing.html`);
      await page.waitFor(() => !document.getElementById("prPlans").hidden && document.querySelectorAll(".pr-card[data-plan]").length > 0 && window.LQMember && window.LQMember.ready(), 8000);
      const r = await page.evaluate(() => ({
        plans: [...document.querySelectorAll(".pr-card[data-plan]")].map(c => c.getAttribute("data-plan")),
        buy: [...document.querySelectorAll(".pr-card[data-plan] .pr-btn")].map(b => b.closest("[data-plan]").getAttribute("data-plan")),
        draft: !document.getElementById("prDraft").hidden || !!document.querySelector(".pr-tag"),
        soon: !!document.querySelector('[data-plan="report_basic"] .pr-soon'), vat: document.querySelector('[data-plan="plus"] .pr-vat').textContent,
        nav: !!document.querySelector("#siteNav .nav-toggle")
      }));
      assert(JSON.stringify(r.plans) === JSON.stringify(["free", "plus", "report_basic"]), "only active plans outside preview: " + r.plans);
      assert(JSON.stringify(r.buy) === JSON.stringify(["plus", "report_basic"]), "buy buttons: " + r.buy);
      assert(!r.draft && r.soon && /VAT/.test(r.vat) && r.nav, JSON.stringify(r));
      await page.evaluate(() => document.querySelector('[data-plan="report_basic"] .pr-btn').click());
      const g = await page.evaluate(() => ({ gate: !document.getElementById("prSignIn").hidden, form: document.getElementById("prForm").hidden, sum: document.getElementById("prSum").textContent }));
      assert(g.gate && g.form && /49/.test(g.sum), "sign-in required before the checkout form: " + JSON.stringify(g));
      await page.evaluate(() => document.querySelector(".lang-switch button[data-lang=en]").click());
      await page.waitFor(() => document.documentElement.lang === "en" && /Plans and pricing/.test(document.querySelector("h1").textContent), 5000);
      const en = await page.evaluate(() => ({ thai: /[\u0E00-\u0E7F]/.test(document.getElementById("main").innerText), plus: document.querySelector('[data-plan="plus"] h3').textContent }));
      assert(!en.thai && en.plus === "Plus", "pricing in English: " + JSON.stringify(en));
      await page.evaluate(() => document.querySelector(".lang-switch button[data-lang=th]").click());
    });
    await page.close();

    page = await browser.newPage(null, { isolated: true });
    await check("pricing: ?preview without an API shows the DRAFT plans with the 'not an offer' banner, no buy buttons", async () => {
      await page.goto(`${base}/pricing.html?preview=1`);
      await page.waitFor(() => !document.getElementById("prPlans").hidden && document.querySelectorAll(".pr-card[data-plan]").length > 5, 8000);
      const r = await page.evaluate(() => ({ banner: !document.getElementById("prDraft").hidden, tags: document.querySelectorAll(".pr-tag").length, buy: document.querySelectorAll(".pr-card[data-plan] .pr-btn").length,
        once: document.querySelectorAll("#prOnce .pr-card").length, sw: document.documentElement.scrollWidth, w: innerWidth }));
      assert(r.banner && r.tags > 0 && r.buy === 0 && r.once === 3 && r.sw <= r.w, JSON.stringify(r));
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK], isolated: true });
    await check("member: account.html shows the signed-out state with a sign-in button (mocked API)", async () => {
      await page.goto(`${base}/account.html`);
      await page.waitFor(() => window.LQMember && window.LQMember.ready() && !document.getElementById("acOut").hidden, 8000);
      const errs = page.consoleErrors.filter(e => e.kind === "exception");
      assert(!errs.length, JSON.stringify(errs));
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

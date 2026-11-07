// tests/e2e/member.e2e.mjs — member sign-in + light reading, against a MOCKED API Worker and a MOCKED Google Identity
// Services object (no network: window.fetch for the API origin and window.google are stubbed by an init script, so no
// e-mail or token ever leaves the machine).
//   1. no API configured (today's GitHub Pages): full reading, no sign-in UI, lensiq-member.js not loaded
//   2. API + membership.required: guest sees the light reading (summary, first sections, cautions, reminder) and the
//      "sign in free with Google" card; no request to accounts.google.com before the click
//   3. mocked sign-in (consent checkbox, nonce, ID token posted to /api/auth/google) -> full reading + account chip
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
    if (path === "/api/me") return authed ? json(me) : json({ error: "please sign in", code: "member_required" }, 401);
    if (path === "/api/me/usage") return json({ ok: true, recorded: true });
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
        token: (() => { try { return JSON.parse(localStorage.getItem("lq-member-session")).t.length; } catch (e) { return 0; } })(),
        signin: window.__apiLog.find(x => x.path === "/api/auth/google"),
        usage: window.__apiLog.filter(x => x.path === "/api/me/usage" && x.authed).length
      }));
      assert(r.secs >= 3, "full reading after sign-in: " + r.secs);
      assert(r.reminder, "reminder still shown");
      assert(r.chip === "S", "avatar initial in the header chip: " + r.chip);
      assert(r.token === 43, "member token kept in localStorage");
      assert(r.signin.body.accept_terms === true && r.signin.body.marketing_opt_in === false && r.signin.body.consent_version === "m1", JSON.stringify(r.signin.body));
      assert(r.usage >= 1, "reading recorded in the member's history (domain only)");
    });

    await check("member: account chip menu and sign-out work at 360 px without overflow", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
      await sleep(300);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, item: !!document.querySelector(".lq-acct-item a[href='account.html']") }));
      await page.send("Emulation.clearDeviceMetricsOverride");
      assert(r.sw <= r.w, `no horizontal overflow at 360px (${r.sw} > ${r.w})`);
      assert(r.item, "account entry in the mobile drawer");
      await page.evaluate(() => { document.querySelector(".lq-acct-btn").click(); });
      assert(await page.evaluate(() => !document.querySelector(".lq-acct-menu").hidden), "menu opens");
      await page.evaluate(() => document.querySelector("[data-lq-signout]").click());
      await page.waitFor(() => !window.LQMember.signedIn() && !!document.querySelector("#icRd-body .lq-gate"), 5000);
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

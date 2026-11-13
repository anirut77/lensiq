// tests/e2e/accounts.e2e.mjs — stream G (owner decisions 2026-11-13): LINE sign-in next to Google, sign-in methods and
// the organisation (lite) section of account.html, against a MOCKED API Worker (window.fetch for the API origin is stubbed
// by an init script; the "LINE" consent page is simulated by the mock returning an authorize URL on the local site, so no
// request ever reaches access.line.me). Locked before the UI was written.
//   1. LINE enabled, Google not configured: the sign-in dialog offers LINE only after the terms are ticked; start sends
//      the consent choices; the browser binding is kept in sessionStorage; the redirect back finishes the sign-in and the
//      code / state are removed from the address bar
//   2. sign-in methods card: LINE linked, Google not linked; no LINE / Google account id on screen
//   3. organisation section (org admin): members, invitation link (fragment), billing details saved; staff-only view
//      hides billing and members
//   4. invitation link account.html#org_invite=… : accept card, accepted with the member token, fragment cleared
//   5. phones 360 px and English / 中文: the new sections fit and carry no Thai
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = "https://api.lensiq.test";
const THAI = /[ก-ฺเ-๛]/;

const MOCK = (role = "admin") => `(() => {
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_GOOGLE_CLIENT_ID = "";
  window.LENSIQ_ANALYTICS = false;
  const TOKEN = "t".repeat(43);
  const log = window.__apiLog = JSON.parse(sessionStorage.getItem("__apiLog") || "[]");
  const keep = () => sessionStorage.setItem("__apiLog", JSON.stringify(log));
  const me = { user: { id: "u".repeat(32), email: null, display_name: "Malee", created_at: 1, last_login_at: 1, marketing_opt_in: false, consent_version: "m1", consent_at: 1, status: "active" },
    tier: "member", plan: null, sign_in_methods: ["line"], quotas: { ai: { used: 0, quota: 3, remaining: 3, period: "day", enforced: false }, saved: { used: 0, max: 50 }, readings_today: 0 }, membership: { required: false } };
  const ORG = "o".repeat(32);
  const realFetch = window.fetch.bind(window);
  const json = (b, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }));
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith(${JSON.stringify(API)})) return realFetch(input, init);
    const path = url.slice(${JSON.stringify(API)}.length).split("?")[0], method = (init.method || "GET").toUpperCase();
    const h = new Headers(init.headers || {});
    const authed = h.get("Authorization") === "Bearer " + TOKEN;
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ method, path, authed, body }); keep();
    if (path === "/v1/config") return json({ analytics: false, free_mode: true, pricing_enabled: false, membership: { required: false, google_client_id: null, line_enabled: true, consent_version: "m1", guest_daily_readings: 3, guest_light_sections: 2, member_ai_daily: 3 } });
    if (path === "/api/auth/line/start" && method === "POST") {
      const state = "s".repeat(43), binding = "b".repeat(43);
      return json({ authorize_url: location.origin + "/account.html?code=c0de0001&state=" + state + "&friendship_status_changed=false", binding, expires_in: 600, mode: body.mode }, 201);
    }
    if (path === "/api/auth/line/finish" && method === "POST") {
      if (body.code !== "c0de0001" || body.state !== "s".repeat(43) || body.binding !== "b".repeat(43)) return json({ error: "state", code: "line_state" }, 401);
      return json({ token: TOKEN, expires_at: Math.floor(Date.now() / 1000) + 3600, created: true, provider: "line", user: me.user });
    }
    if (!authed && path.startsWith("/api/")) return json({ error: "please sign in", code: "member_required" }, 401);
    if (path === "/api/me" && method === "GET") return json(me);
    if (path === "/api/me/sessions") return json({ sessions: [] });
    if (path === "/api/me/history") return json({ ledger: [], saved: [], payments: [], next_before: null });
    if (path === "/api/me/entitlements") return json({ entitlements: {} });
    if (path === "/api/me/identities") return json({ methods: [{ provider: "google", linked: false }, { provider: "line", linked: true, linked_at: 1700000000 }] });
    if (path === "/api/me/orgs") return json({ orgs: [{ id: ORG, name: "Wat Pho School", role: ${JSON.stringify(role)}, is_owner: ${role === "admin"}, status: "active" }] });
    if (path === "/api/orgs/" + ORG && method === "GET") {
      const base = { org: { id: ORG, name: "Wat Pho School", status: "active" }, role: ${JSON.stringify(role)}, is_owner: ${role === "admin"} };
      if (${JSON.stringify(role)} !== "admin") return json(base);
      return json({ ...base, billing: window.__billing || { name: null, tax_id: null, address: null, branch: null, email: null },
        members: [{ user_id: "u".repeat(32), display_name: "Malee", email: null, role: "admin", is_owner: true, status: "active", created_at: 1700000000 },
          { user_id: "v".repeat(32), display_name: "Boon", email: "boon@example.test", role: "staff", is_owner: false, status: "active", created_at: 1700000000 }],
        invites: [] });
    }
    if (path === "/api/orgs/" + ORG + "/invites" && method === "POST") return json({ invite_id: "i".repeat(32), link_path: "account.html#org_invite=" + "k".repeat(43), expires_at: Math.floor(Date.now() / 1000) + 72 * 3600, role: body.role }, 201);
    if (path === "/api/orgs/" + ORG + "/profile" && method === "POST") { window.__billing = body.billing; return json({ ok: true }); }
    if (path === "/api/orgs/" + ORG + "/licences") return json({ enforced: false, checked_at: 1, offline_until: 2, licences: [], products: {}, free_tiers: {} });
    if (path === "/api/orgs/" + ORG + "/audit") return json({ chain_ok: true, entries: [] });
    if (path === "/api/org-invites/accept" && method === "POST") return json({ org: { id: ORG, name: "Wat Pho School" }, role: "staff", is_owner: false });
    return json({ error: "not found" }, 404);
  };
})();`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { initScripts: [MOCK("admin")], isolated: true });
    await check("accounts: LINE sign-in round trip (terms first, binding kept, code and state removed from the address bar)", async () => {
      await page.goto(`${base}/account.html`);
      await page.waitFor(() => window.LQMember && window.LQMember.ready() && !document.getElementById("acOut").hidden, 8000);
      await page.evaluate(() => document.getElementById("acSignIn").click());
      await page.waitFor(() => !!document.querySelector("dialog.lq-dlg[open] [data-lq-line]"), 3000);
      const r0 = await page.evaluate(() => ({ dis: document.querySelector("[data-lq-line]").disabled, google: !!document.querySelector("dialog.lq-dlg [data-lq-continue]:not([hidden])"),
        text: document.querySelector("dialog.lq-dlg").innerText }));
      assert(r0.dis, "LINE button disabled until the terms are accepted");
      assert(!r0.google, "no Google button when Google is not configured");
      assert(/LINE/.test(r0.text), "the dialog names LINE");
      await page.evaluate(() => { document.querySelector('dialog.lq-dlg input[name="terms"]').click(); document.querySelector("[data-lq-line]").click(); });
      await page.waitFor(() => /code=|acApp/.test(location.search) || (window.LQMember && window.LQMember.signedIn()), 8000);
      await page.waitFor(() => window.LQMember && window.LQMember.signedIn() && !document.getElementById("acApp").hidden, 8000);
      const r = await page.evaluate(() => ({ search: location.search, log: window.__apiLog }));
      assert(!/code=|state=/.test(r.search), "code and state removed from the address bar: " + r.search);
      const start = r.log.find(x => x.path === "/api/auth/line/start");
      assert(start && start.body.mode === "signin" && start.body.accept_terms === true && start.body.consent_version === "m1", "start body: " + JSON.stringify(start));
      const fin = r.log.find(x => x.path === "/api/auth/line/finish");
      assert(fin && fin.body.binding === "b".repeat(43) && fin.body.code === "c0de0001", "finish uses the binding kept in this tab: " + JSON.stringify(fin));
    });

    await check("accounts: sign-in methods card shows LINE linked and Google not linked; no account ids on screen", async () => {
      await page.waitFor(() => !!document.querySelector('#methods [data-method="line"]'), 5000);
      const r = await page.evaluate(() => ({ line: document.querySelector('#methods [data-method="line"]').innerText, google: document.querySelector('#methods [data-method="google"]').innerText,
        link: !!document.querySelector('#methods [data-link="google"]'), text: document.getElementById("main").innerText }));
      assert(/LINE/.test(r.line) && /Google/.test(r.google), JSON.stringify(r));
      assert(r.link, "offer to link Google");
      assert(!/U[0-9a-f]{32}/.test(r.text), "no LINE user id on screen");
    });

    await check("accounts: organisation section for an org admin: members, invitation link in the fragment, billing saved", async () => {
      await page.waitFor(() => !!document.querySelector("#org [data-org]") && !!document.querySelector("#acOrgMembers table"), 6000);
      const members = await page.evaluate(() => document.getElementById("acOrgMembers").innerText);
      assert(/Malee/.test(members) && /Boon/.test(members), members);
      await page.evaluate(() => { const f = document.getElementById("acOrgInvite"); f.elements.role.value = "staff"; f.requestSubmit(); });
      await page.waitFor(() => /#org_invite=k{43}$/.test((document.getElementById("acOrgInviteLink") || {}).value || ""), 4000);
      const link = await page.evaluate(() => document.getElementById("acOrgInviteLink").value);
      assert(link.startsWith(location.origin), "absolute link on this site: " + link);
      await page.evaluate(() => {
        const f = document.getElementById("acOrgBilling");
        f.elements.name.value = "Wat Pho School Foundation"; f.elements.tax_id.value = "0105555555555"; f.elements.address.value = "1 Placeholder Road"; f.elements.branch.value = "Head office"; f.elements.email.value = "billing@example.test";
        f.requestSubmit();
      });
      await page.waitFor(() => window.__apiLog.some(x => x.path.endsWith("/profile") && x.method === "POST"), 4000);
      const sent = await page.evaluate(() => window.__apiLog.find(x => x.path.endsWith("/profile")).body);
      assert(sent.billing && sent.billing.tax_id === "0105555555555" && !("employees" in sent), JSON.stringify(sent));
    });

    await check("accounts: phones 360 px, English and 中文: the new sections fit and carry no Thai", async () => {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
      await sleep(300);
      for (const lang of ["en", "zh"]) {
        await page.evaluate(l => window.LQI18N.setLang(l), lang);
        await sleep(1500);
        const r = await page.evaluate(() => {
          const secs = ["methods", "org"].map(id => document.getElementById(id));
          return { over: document.documentElement.scrollWidth > innerWidth + 1, text: secs.map(s => s ? s.innerText : "MISSING").join("\n") };
        });
        assert(!r.over, lang + ": no sideways scrolling at 360 px");
        assert(!/MISSING/.test(r.text), lang + ": sections present");
        assert(!THAI.test(r.text.replace(/สำนักงานใหญ่/g, "")), lang + ": no Thai left: " + r.text.slice(0, 400));
      }
      await page.evaluate(() => window.LQI18N.setLang("th"));
      await page.send("Emulation.clearDeviceMetricsOverride");
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK("staff")], isolated: true });
    await check("accounts: invitation link: accept card, accepted with the member token, fragment cleared; staff view hides billing", async () => {
      await page.goto(`${base}/account.html`);
      await page.evaluate(() => sessionStorage.setItem("lq-member-session", JSON.stringify({ t: "t".repeat(43), exp: Math.floor(Date.now() / 1000) + 3600 })));
      await page.goto(`${base}/account.html#org_invite=${"k".repeat(43)}`);
      await page.waitFor(() => window.LQMember && window.LQMember.signedIn() && !document.getElementById("acInvite").hidden, 8000);
      assert(!(await page.evaluate(() => location.hash.includes("org_invite"))), "token removed from the address bar once read");
      await page.evaluate(() => document.getElementById("acInviteAccept").click());
      await page.waitFor(() => window.__apiLog.some(x => x.path === "/api/org-invites/accept"), 4000);
      const acc = await page.evaluate(() => window.__apiLog.find(x => x.path === "/api/org-invites/accept"));
      assert(acc.authed && acc.body.token === "k".repeat(43), JSON.stringify(acc));
      await page.waitFor(() => !!document.querySelector("#org [data-org]"), 5000);
      await sleep(500);
      const r = await page.evaluate(() => ({ billing: !!document.getElementById("acOrgBilling") && !document.getElementById("acOrgBilling").closest("[hidden]"), members: !!document.querySelector("#acOrgMembers table") }));
      assert(!r.billing && !r.members, "staff see neither billing details nor the member list: " + JSON.stringify(r));
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

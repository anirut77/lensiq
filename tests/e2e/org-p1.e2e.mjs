// tests/e2e/org-p1.e2e.mjs — organisation accounts phase 1 (order 2026-11-14: P1 behind two off switches, nothing visible
// to users until the owner approves). Fixed acceptance tests, LOCKED (~/LENSIQ-field/evals/org-p1/) before the P1 UI code.
// The switches: Worker var ORG_ACCOUNTS = "on" (reported as /v1/config org_accounts and /admin/api/me org_accounts) and
// window.LENSIQ_ORG_ACCOUNTS = true (lensiq-config.js, default false). The UI appears only when BOTH are on.
//   1. account.html, every combination with a switch off (client off / server off / both off): no organisation section,
//      no invitation card, the invitation fragment is not kept, and no organisation request is ever sent; the sign-in
//      methods card still works
//   2. account.html, both on: an organisation admin sees "Export organisation data"; it asks the Worker for the export
//      and saves lensiq-org-<id>.json; English / 中文 labels carry no Thai; staff get no export button
//   3. admin.html (real Worker code, in-memory D1): the Organisations tab is hidden unless both switches are on
import { assert } from "./cdp.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = "https://api.lensiq.test";
const THAI = /[ก-ฺเ-๛]/;
const ORG = "o".repeat(32);
const ORG_PATH = /^\/api\/(me\/orgs|orgs\/|org-invites)/;

const MOCK = ({ client, server, role = "admin" }) => `(() => {
  ${client ? "window.LENSIQ_ORG_ACCOUNTS = true;" : ""}
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_GOOGLE_CLIENT_ID = "";
  window.LENSIQ_ANALYTICS = false;
  const TOKEN = "t".repeat(43), ORG = ${JSON.stringify(ORG)}, ROLE = ${JSON.stringify(role)}, SERVER = ${server ? "true" : "false"};
  const log = window.__apiLog = JSON.parse(sessionStorage.getItem("__apiLog") || "[]");
  const keep = () => sessionStorage.setItem("__apiLog", JSON.stringify(log));
  window.__dl = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return click.call(this); };
  const me = { user: { id: "u".repeat(32), email: null, display_name: "Malee", created_at: 1, last_login_at: 1, marketing_opt_in: false, consent_version: "m1", consent_at: 1, status: "active" },
    tier: "member", plan: null, sign_in_methods: ["line"], quotas: { ai: { used: 0, quota: 3, remaining: 3, period: "day", enforced: false }, saved: { used: 0, max: 50 }, readings_today: 0 }, membership: { required: false } };
  const realFetch = window.fetch.bind(window);
  const json = (b, s = 200, h = {}) => Promise.resolve(new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...h } }));
  window.fetch = function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith(${JSON.stringify(API)})) return realFetch(input, init);
    const path = url.slice(${JSON.stringify(API)}.length).split("?")[0], method = (init.method || "GET").toUpperCase();
    const authed = new Headers(init.headers || {}).get("Authorization") === "Bearer " + TOKEN;
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ method, path, authed, body }); keep();
    if (path === "/v1/config") return json({ analytics: false, free_mode: true, pricing_enabled: false, org_accounts: SERVER, membership: { required: false, google_client_id: null, line_enabled: true, consent_version: "m1", guest_daily_readings: 3, guest_light_sections: 2, member_ai_daily: 3 } });
    if (/^\\/api\\/(me\\/orgs|orgs\\/|org-invites)/.test(path) && !SERVER) return json({ error: "organisation accounts are not enabled (org_accounts_off)", code: "org_accounts_off" }, 404);
    if (!authed && path.startsWith("/api/")) return json({ error: "please sign in", code: "member_required" }, 401);
    if (path === "/api/me" && method === "GET") return json(me);
    if (path === "/api/me/sessions") return json({ sessions: [] });
    if (path === "/api/me/history") return json({ ledger: [], saved: [], payments: [], next_before: null });
    if (path === "/api/me/entitlements") return json({ entitlements: {} });
    if (path === "/api/me/identities") return json({ methods: [{ provider: "google", linked: false }, { provider: "line", linked: true, linked_at: 1700000000 }] });
    if (path === "/api/me/orgs") return json({ orgs: [{ id: ORG, name: "Example School", role: ROLE, is_owner: ROLE === "admin", status: "active" }] });
    if (path === "/api/orgs/" + ORG && method === "GET") {
      const base = { org: { id: ORG, name: "Example School", status: "active" }, role: ROLE, is_owner: ROLE === "admin" };
      if (ROLE !== "admin") return json(base);
      return json({ ...base, billing: { name: null, tax_id: null, address: null, branch: null, email: null },
        members: [{ user_id: "u".repeat(32), display_name: "Malee", email: null, role: "admin", is_owner: true, status: "active", created_at: 1700000000 }], invites: [] });
    }
    if (path === "/api/orgs/" + ORG + "/licences") return json({ enforced: false, checked_at: 1, offline_until: 2, licences: [], products: {}, free_tiers: {} });
    if (path === "/api/orgs/" + ORG + "/audit") return json({ chain_ok: true, entries: [] });
    if (path === "/api/orgs/" + ORG + "/export") {
      if (ROLE !== "admin") return json({ error: "not allowed", code: "org_forbidden" }, 403);
      return json({ format: "lensiq-org-export", v: 1, exported_at: 1, org: { id: ORG, name: "Example School", status: "active" }, billing: {}, members: [], invites: [], licences: [], audit: { chain_ok: true, entries: [] }, readme: { th: "x", en: "x", zh: "x" } }, 200,
        { "Content-Disposition": 'attachment; filename="lensiq-org-' + ORG + '.json"' });
    }
    if (path === "/api/org-invites/accept" && method === "POST") return json({ org: { id: ORG, name: "Example School" }, role: "staff", is_owner: false });
    return json({ error: "not found" }, 404);
  };
})();`;

async function signedInAccount(page, base) {
  await page.goto(`${base}/help.html`); // a hash-only navigation on the same page would never fire "load"
  await page.evaluate(() => sessionStorage.setItem("lq-member-session", JSON.stringify({ t: "t".repeat(43), exp: Math.floor(Date.now() / 1000) + 3600 })));
  await page.goto(`${base}/account.html#org_invite=${"k".repeat(43)}`);
  await page.waitFor(() => window.LQMember && window.LQMember.signedIn() && !document.getElementById("acApp").hidden, 8000);
}

async function adminSignIn(page, W) {
  await W.api("/bootstrap", { method: "POST", body: { token: TOKEN, username: "owner", password: PW } });
  await page.goto(W.origin + "/admin");
  await page.waitFor("!document.getElementById('adLogin').hidden", 8000);
  await page.evaluate(pw => { const f = document.getElementById("adLoginForm"); f.username.value = "owner"; f.password.value = pw; f.requestSubmit(); }, PW);
  await page.waitFor("!document.getElementById('adTwo').hidden || !document.getElementById('adApp').hidden", 10000);
  if (await page.evaluate("!document.getElementById('adTwo').hidden")) {
    await page.waitFor("!document.getElementById('adTwoSkip').hidden", 8000);
    await page.evaluate(() => document.getElementById("adTwoSkip").click());
  }
  await page.waitFor("!document.getElementById('adApp').hidden", 8000);
  await sleep(800);
}

export default async function ({ base, launch, check, repo }) {
  const browser = await launch();
  try {
    for (const [client, server] of [[false, false], [true, false], [false, true]]) {
      const page = await browser.newPage(null, { initScripts: [MOCK({ client, server })], isolated: true });
      await check(`org-p1: account page with client ${client ? "on" : "off"} / server ${server ? "on" : "off"}: no organisation UI, no organisation request`, async () => {
        await signedInAccount(page, base);
        await page.waitFor(() => !!document.querySelector('#methods [data-method="line"]'), 6000);
        await sleep(1500);
        const r = await page.evaluate(() => ({
          org: document.getElementById("org").hidden, invite: document.getElementById("acInvite").hidden, kept: sessionStorage.getItem("lq-org-invite") || "",
          exportBtn: !!document.getElementById("acOrgExport"), log: window.__apiLog.map(x => x.path)
        }));
        assert(r.org, "organisation section hidden");
        assert(r.invite, "invitation card hidden");
        assert(!r.kept, "the invitation token is not kept");
        assert(!r.exportBtn, "no export button");
        const sent = r.log.filter(p => ORG_PATH.test(p));
        assert(!sent.length, "no organisation request: " + JSON.stringify(sent));
      });
      await page.close();
    }

    let page = await browser.newPage(null, { initScripts: [MOCK({ client: true, server: true })], isolated: true });
    await check("org-p1: both on: an organisation admin exports the organisation's data to lensiq-org-<id>.json", async () => {
      await signedInAccount(page, base);
      await page.waitFor(() => !document.getElementById("org").hidden && !!document.getElementById("acOrgExport"), 8000);
      await page.evaluate(() => document.getElementById("acOrgExport").click());
      await page.waitFor(() => window.__dl.length > 0, 5000);
      const r = await page.evaluate(() => ({ dl: window.__dl, req: window.__apiLog.filter(x => /\/export$/.test(x.path)) }));
      assert(r.req.length >= 1 && r.req.every(x => x.authed && x.path === "/api/orgs/" + "o".repeat(32) + "/export"), JSON.stringify(r.req));
      assert(r.dl[0] === "lensiq-org-" + "o".repeat(32) + ".json", JSON.stringify(r.dl));
      for (const lang of ["en", "zh"]) {
        await page.evaluate(l => window.LQI18N.setLang(l), lang);
        await sleep(1500);
        const t = await page.evaluate(() => { const b = document.getElementById("acOrgExport"); return b ? b.textContent + "|" + (b.closest("div") || b).innerText : "MISSING"; });
        assert(!/MISSING/.test(t) && t.replace(/\|.*/, "").trim().length > 3, lang + ": export button labelled: " + t);
        assert(!THAI.test(t), lang + ": no Thai: " + t.slice(0, 200));
      }
      await page.evaluate(() => window.LQI18N.setLang("th"));
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK({ client: true, server: true, role: "staff" })], isolated: true });
    await check("org-p1: both on: staff see the organisation but no export button", async () => {
      await signedInAccount(page, base);
      await page.waitFor(() => !document.getElementById("org").hidden && !!document.querySelector("#org [data-org]"), 8000);
      await sleep(800);
      assert(!(await page.evaluate(() => !!document.getElementById("acOrgExport"))), "no export button for staff");
    });
    await page.close();

    for (const [client, server] of [[false, false], [true, false], [false, true], [true, true]]) {
      const W = await startWorker(repo, { vars: server ? { ORG_ACCOUNTS: "on" } : {} });
      const ap = await browser.newPage(null, { initScripts: client ? ["window.LENSIQ_ORG_ACCOUNTS = true;"] : [], isolated: true });
      try {
        await check(`org-p1: admin with client ${client ? "on" : "off"} / server ${server ? "on" : "off"}: Organisations tab ${client && server ? "shown" : "hidden"}`, async () => {
          await adminSignIn(ap, W);
          const r = await ap.evaluate(() => { const b = document.querySelector("[data-tab=orgs]"); return { exists: !!b, hidden: !b || b.hidden || getComputedStyle(b).display === "none" }; });
          if (client && server) {
            assert(r.exists && !r.hidden, "tab shown: " + JSON.stringify(r));
            await ap.evaluate(() => document.querySelector("[data-tab=orgs]").click());
            await ap.waitFor("!!document.getElementById('adoCreate')", 5000);
          } else {
            assert(r.hidden, "tab hidden: " + JSON.stringify(r));
          }
        });
      } finally {
        await ap.close();
        await W.close();
      }
    }
  } finally {
    await browser.close();
  }
}

// tests/e2e/org-p1b.e2e.mjs — org-p1b: fixes for the independent security review of org-p1 (coordinator order 2026-11-14).
// Fixed tests LOCKED (evals-locks/org-p1b.sha256) BEFORE the fix. Mock and helpers copied from tests/e2e/org-p1.e2e.mjs.
//   1. (L1) both switches on, a CLOSED organisation listed export-only: the section shows it with the export button only
//      (no members / billing / invitations), no request for its detail, and the export downloads lensiq-org-<id>.json
//   2. (I5) client switch on, a cached /v1/config says org_accounts: true but the live /v1/config fetch fails: no
//      organisation UI, no organisation request, and the cached org_accounts is cleared
//   3. (I6) client switch OFF: an account.html#org_invite=<token> link is still removed from the address bar (not kept)
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = "https://api.lensiq.test";
const ORG = "o".repeat(32);
const ORG_PATH = /^\/api\/(me\/orgs|orgs\/|org-invites)/;

const MOCK = ({ client, server, role = "admin", closed = false, cfgFail = false }) => `(() => {
  ${cfgFail ? 'sessionStorage.setItem("lq-member-cfg", JSON.stringify({ membership: { required: false, google_client_id: null, line_enabled: true, consent_version: "m1" }, pricing_enabled: false, billing_enabled: false, free_mode: true, org_accounts: true }));' : ""}
  ${client ? "window.LENSIQ_ORG_ACCOUNTS = true;" : ""}
  window.LENSIQ_API_BASE = ${JSON.stringify(API)};
  window.LENSIQ_GOOGLE_CLIENT_ID = "";
  window.LENSIQ_ANALYTICS = false;
  const TOKEN = "t".repeat(43), ORG = ${JSON.stringify(ORG)}, ROLE = ${JSON.stringify(role)}, SERVER = ${server ? "true" : "false"}, CLOSED = ${closed ? "true" : "false"}, CFGFAIL = ${cfgFail ? "true" : "false"};
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
    if (path === "/v1/config" && CFGFAIL) return Promise.reject(new TypeError("network down"));
    if (path === "/v1/config") return json({ analytics: false, free_mode: true, pricing_enabled: false, org_accounts: SERVER, membership: { required: false, google_client_id: null, line_enabled: true, consent_version: "m1", guest_daily_readings: 3, guest_light_sections: 2, member_ai_daily: 3 } });
    if (/^\\/api\\/(me\\/orgs|orgs\\/|org-invites)/.test(path) && !SERVER) return json({ error: "organisation accounts are not enabled (org_accounts_off)", code: "org_accounts_off" }, 404);
    if (!authed && path.startsWith("/api/")) return json({ error: "please sign in", code: "member_required" }, 401);
    if (path === "/api/me" && method === "GET") return json(me);
    if (path === "/api/me/sessions") return json({ sessions: [] });
    if (path === "/api/me/history") return json({ ledger: [], saved: [], payments: [], next_before: null });
    if (path === "/api/me/entitlements") return json({ entitlements: {} });
    if (path === "/api/me/identities") return json({ methods: [{ provider: "google", linked: false }, { provider: "line", linked: true, linked_at: 1700000000 }] });
    if (path === "/api/me/orgs") return json({ orgs: [{ id: ORG, name: "Example School", role: ROLE, is_owner: ROLE === "admin", status: CLOSED ? "closed" : "active", export_only: CLOSED }] });
    if (CLOSED && path.startsWith("/api/orgs/" + ORG) && !path.endsWith("/export")) return json({ error: "organisation not found", code: "org_not_found" }, 404);
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

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null, { initScripts: [MOCK({ client: true, server: true, closed: true })], isolated: true });
    await check("org-p1b: a closed organisation is listed export-only; only the export is offered and it downloads", async () => {
      await signedInAccount(page, base);
      await page.waitFor(() => !document.getElementById("org").hidden && !!document.getElementById("acOrgExport"), 8000);
      await sleep(800);
      const r = await page.evaluate(() => ({ members: !!document.getElementById("acOrgMembers"), billing: !!document.getElementById("acOrgBilling"), invite: !!document.getElementById("acOrgInvite"),
        detailReq: window.__apiLog.filter(x => x.path === "/api/orgs/" + "o".repeat(32) || /\/(licences|audit)$/.test(x.path)).length }));
      assert(!r.members && !r.billing && !r.invite, "export only: " + JSON.stringify(r));
      assert(r.detailReq === 0, "no detail request for a closed organisation: " + JSON.stringify(r));
      await page.evaluate(() => document.getElementById("acOrgExport").click());
      await page.waitFor(() => window.__dl.length > 0, 5000);
      assert((await page.evaluate(() => window.__dl[0])) === "lensiq-org-" + "o".repeat(32) + ".json");
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK({ client: true, server: true, cfgFail: true })], isolated: true });
    await check("org-p1b: a cached org_accounts is not trusted when the live /v1/config fails, and is cleared", async () => {
      await signedInAccount(page, base);
      await sleep(2000);
      const r = await page.evaluate(() => ({ org: document.getElementById("org").hidden, log: window.__apiLog.map(x => x.path), cfg: JSON.parse(sessionStorage.getItem("lq-member-cfg") || "null") }));
      assert(r.org, "organisation section hidden");
      const sent = r.log.filter(p => ORG_PATH.test(p));
      assert(!sent.length, "no organisation request: " + JSON.stringify(sent));
      assert(!(r.cfg && r.cfg.org_accounts === true), "cached org_accounts cleared: " + JSON.stringify(r.cfg));
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [MOCK({ client: false, server: true })], isolated: true });
    await check("org-p1b: client switch off: the invitation fragment is removed from the address bar and not kept", async () => {
      await signedInAccount(page, base);
      await sleep(800);
      const r = await page.evaluate(() => ({ hash: location.hash, kept: sessionStorage.getItem("lq-org-invite") || "" }));
      assert(!/org_invite/.test(r.hash), "fragment removed: " + r.hash);
      assert(!r.kept, "token not kept");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

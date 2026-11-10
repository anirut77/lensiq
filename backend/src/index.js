// @ts-check
// backend/src/index.js — LENSIQ API Worker entry: router (fetch) + daily maintenance (scheduled).
//
// Public (Origin allowlist ALLOWED_ORIGINS, no credentials):
//   GET  /health
//   GET  /v1/config                      {analytics, free_mode, pricing_enabled}
//   POST /v1/events                      analytics batch (text/plain or application/json; sendBeacon-friendly)
//   GET  /api/fortune/status             same contract as server.py
//   POST /api/fortune                    same contract as server.py
//   GET  /v1/billing/plans               {free_mode, billing_enabled, pricing_enabled, perks, member_required_for_checkout, plans?}
//   POST /v1/billing/checkout            PromptPay checkout (BILLING_ENABLED=true and FREE_MODE=false only; member bearer
//                                        required unless ALLOW_GUEST_CHECKOUT; Idempotency-Key header)
//   POST /v1/billing/claim               {customer_id, order_token} link a guest purchase to the signed-in member
//   GET  /v1/billing/payments/:id        poll status (id is a 128-bit random handle)
//   GET  /v1/billing/payments/:id/qr     QR SVG proxied from Opn (page CSP allows only blob:/self images)
//   POST /v1/billing/webhook/opn         Opn webhook (signature verified; no CORS)
//   POST /api/auth/nonce | /api/auth/google | /api/auth/logout      member sign-in (members.js)
//   GET|DELETE /api/me, POST /api/me/preferences|usage|saved, GET /api/me/history|export|saved/:id, DELETE /api/me/saved/:id
//   GET  /api/me/payments/:id/receipt[?format=json]   printable receipt / tax invoice (receipt.js)
//   GET  /api/me/entitlements, POST /api/me/entitlements/use {feature}   perk balances / server check (csv_export, report_*)
//   GET  /api/me/sessions, POST /api/me/sessions/revoke {id} | {all:true, keep_current:true}   signed-in devices
//   POST /api/auth/reauth {credential, nonce}   fresh Google confirmation (needed by DELETE /api/me and the export)
//   POST /api/me/export {credential, nonce}     export with an inline fresh confirmation
//   GET  /api/me/payments/:id/refunds/:n/credit-note[?format=json]   credit note (ใบลดหนี้) of a refunded tax invoice
//   POST /v1/leads                       B2B demo / quotation request (Turnstile action "lead"; leads.js)
//   GET  /health/deep                    D1 reachable + migrations current (HEALTH_TOKEN bearer when set)
//   POST /api/auth/refresh               rotate the member bearer token (round 12; short sessions: +12 h, max 7 days)
//   POST /v1/csp-report                  CSP violation reports (round 12, csp.js; counters only, always 204)
//   GET  /api/med/status|thfda|openfda|rxnav   medicine checker text proxy (round 14, med.js; MED_ENABLED, text only)
//   GET  /api/pc/status|thfda|openfda|safetygate|rasff|healthcanada|hsa|label|ndc|dailymed|rxnav   Product Check official
//                                        lookups (round 17 P4, pc.js; PC_ENABLED + admin "pc_lookup" switch; text only);
//   POST /api/pc/batch                  the card's one call per tap (<= 16 lookups, one rate-limit count)
//   GET  /v1/ai/providers?feature=…      AI gateway consent-screen data (round 17 P5, ai/gateway.js; no secrets)
//   POST /v1/ai/:feature                 AI gateway (consent, Turnstile action "ai", limits, budget, fallback chain)
//   POST /v1/tester/check               closed test (tester.js): {ok:true} when X-Tester-Code is valid (or no gate is set)
// Test deployment switches (tester.js; all unset by default = no change): PUBLIC_ROUTES (allow-list; other public routes
//   404 route_off before D1), D1_WRITE_BUDGET (429 d1_budget), ADMIN_UNAUTH_WRITES_HOUR, SERVICE_OFF (every public route except /health
//   -> 503 {off:true}), DAILY_REQUEST_CAP (429 daily_cap), TESTER_GATE + TESTER_ACCESS_CODE (X-Tester-Code on /v1/ai/*,
//   /api/fortune* and the testing-only lookup sources of pc.js / med.js)
// Admin round 12: GET /admin/api/csp-reports, GET /admin/api/mail (delivery log + provider status); POST
//   /billing/test-charge needs re-auth and is capped (TEST_CHARGE_HOUR); money ops follow auth.moneyReauthMode
// Admin round 17 P4: GET|PUT /admin/api/pc/lookup (Thai FDA live / link-out + per-source switches; PUT re-auth, audited)
// Admin round 17: GET|PUT /admin/api/ai/gateway (PUT needs re-auth, audited), GET /admin/api/ai/usage?month=YYYY-MM
// Admin (ADMIN_ORIGINS, credentials; see auth.js): /admin/api/*
import * as analytics from "./analytics.js";
import * as auth from "./auth.js";
import * as billing from "./billing.js";
import * as billingAdmin from "./billing-admin.js";
import { RECEIPT_HEADERS, creditNoteFor, receiptFor } from "./receipt.js";
import { goLiveStatus } from "./golive.js";
import * as leads from "./leads.js";
import { deepHealth } from "./health.js";
import { adminCspReports, ingestCspReport } from "./csp.js";
import { adminMailLog, mailStatus } from "./mail.js";
import { fortuneRun, fortuneStatus } from "./fortune.js";
import { adminGateway, adminPutGateway, adminUsage, aiRoute, providersInfo } from "./ai/gateway.js";
import { LEGACY_KEY_UNUSED, getGateway, legacyKeyUnused } from "./ai/settings.js";
import { medRoute } from "./med.js";
import { adminPcLookup, pcRoute, putPcSettings } from "./pc.js";
import { reconcilePending } from "./billing.js";
import { turnstileStatus } from "./turnstile.js";
import {
  OFF_BODY, ROUTE_OFF_BODY, adminStateCached, adminUnauth, capBody, countRequest, meterDb, noteBootstrapped, noteWrites, routeEnabled, serviceOff, strictLimit, testerBody,
  testerState
} from "./tester.js";
import { runMaintenance, retentionConfig } from "./retention.js";
import * as members from "./members.js";
import * as settings from "./settings.js";
import { audit, callerHash, hit } from "./store.js";
import {
  HttpError, adminOrigins, corsHeaders, flag, intVar, json, log, originAllowed, publicOrigins, readJson, readText, withHeaders
} from "./util.js";

const ADMIN_MAX_BODY = 16 * 1024;
export const RECONCILE_CRON = "*/15 * * * *";
/** Admin test charges per hour (all sessions together); override with the TEST_CHARGE_HOUR var (1–100). */
export const TEST_CHARGE_HOUR = 10;

async function publicRoute(request, env, url, deps) {
  const allow = publicOrigins(env);
  const cors = corsHeaders(request, allow, { methods: "GET, POST, DELETE, OPTIONS", headers: "Content-Type, X-Turnstile-Token, Authorization, Idempotency-Key, X-Tester-Code" });
  const p = url.pathname;
  const m = request.method;
  if (m === "OPTIONS") return json(null, originAllowed(request, allow, { required: true }) ? 204 : 403, cors);
  const reply = (body, status = 200) => json(body, status, cors);

  // deploy B4: kill switch. /health stays up and says so; CORS preflights above still answer, so the page can read the 503.
  const off = serviceOff(env);
  if (p === "/health" && m === "GET") return reply(off ? { ok: true, off: true } : { ok: true });
  if (off) return reply(OFF_BODY, 503);
  // account safety: LENSIQ-side daily request cap (DAILY_REQUEST_CAP; the Free plan quota is shared by the whole account)
  // this deployment's public route allow-list (PUBLIC_ROUTES): anything else is refused before D1 is touched
  if (!routeEnabled(env, p)) return reply(ROUTE_OFF_BODY, 404);
  const capped = await countRequest(env);
  if (!capped.ok) return json(capBody(capped.code), capped.code === "config_invalid" ? 503 : 429, { ...cors, "Retry-After": String(capped.retryAfter) });
  // deploy B3: tester access code (TESTER_GATE=required). Checked only on the gated routes below.
  const gate = () => testerState(env, request);
  const gateHeaders = st => (st.retryAfter ? { ...cors, "Retry-After": String(st.retryAfter) } : cors);
  if (p === "/v1/tester/check" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    const st = await gate();
    return st.ok ? reply({ ok: true, required: st.required }) : json(testerBody(st), st.status, gateHeaders(st));
  }
  if (p === "/health/deep" && m === "GET") {
    const tok = String(env.HEALTH_TOKEN || "");
    if (tok && request.headers.get("Authorization") !== "Bearer " + tok) return reply({ error: "unauthorized" }, 401);
    const h = await deepHealth(env);
    return reply(h, h.ok ? 200 : 503);
  }
  if (p === "/v1/leads" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    return reply(await leads.submitLead(env, request, await readJson(request, 8192), deps), 201);
  }
  if (p === "/v1/csp-report" && m === "POST") {
    // round 12: CSP violation reports (csp.js) — counters only; always 204 (browsers never retry a report)
    await ingestCspReport(env, request);
    return json(null, 204, cors);
  }
  if (p === "/v1/config" && m === "GET" && !routeEnabled(env, "/v1/events") && !routeEnabled(env, "/api/auth/nonce") && !routeEnabled(env, "/v1/billing/plans")) {
    // a deployment whose allow-list leaves analytics, sign-in and billing out says so, without touching D1
    return reply({ analytics: false, free_mode: true, pricing_enabled: false, billing_enabled: false, membership: { required: false, google_client_id: null } });
  }
  if (p === "/v1/config" && m === "GET") {
    const b = await billing.publicBillingInfo(env);
    return reply({ analytics: routeEnabled(env, "/v1/events"), free_mode: b.free_mode, pricing_enabled: b.pricing_enabled, membership: await members.publicMembership(env) });
  }
  if (p.startsWith("/api/auth/") || p === "/api/me" || p.startsWith("/api/me/")) {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    const body = async () => readJson(request, 8192);
    if (p === "/api/auth/nonce" && m === "POST") return reply(await members.issueNonce(env, request), 201);
    if (p === "/api/auth/google" && m === "POST") return reply(await members.signInGoogle(env, request, await readJson(request, 8192), deps));
    const mem = await members.requireMember(env, request);
    if (p === "/api/auth/logout" && m === "POST") return reply(await members.logout(env, mem));
    if (p === "/api/auth/refresh" && m === "POST") return reply(await members.refreshSession(env, mem));
    if (p === "/api/me" && m === "GET") return reply(await members.me(env, mem));
    if (p === "/api/auth/reauth" && m === "POST") return reply(await members.reauthMember(env, mem, await body(), deps));
    if (p === "/api/me" && m === "DELETE") return reply(await members.deleteAccount(env, mem, await body(), deps));
    if (p === "/api/me/preferences" && m === "POST") return reply(await members.setPreferences(env, mem, await body()));
    if (p === "/api/me/usage" && m === "POST") return reply(await members.recordUsage(env, mem, await body()));
    if (p === "/api/me/history" && m === "GET") return reply(await members.history(env, mem, Object.fromEntries(url.searchParams)));
    if (p === "/api/me/export" && (m === "GET" || m === "POST")) {
      const b = m === "POST" ? await body() : null;
      return json(await members.exportData(env, mem, b, deps), 200, { ...cors, "Content-Disposition": 'attachment; filename="lensiq-my-data.json"' });
    }
    if (p === "/api/me/saved" && m === "POST") return reply(await members.saveReading(env, mem, await body()), 201);
    if (p === "/api/me/sessions" && m === "GET") return reply(await members.listSessions(env, mem));
    if (p === "/api/me/sessions/revoke" && m === "POST") return reply(await members.revokeSessions(env, mem, await body()));
    if (p === "/api/me/entitlements" && m === "GET") return reply(await billing.meEntitlements(env, mem));
    if (p === "/api/me/entitlements/use" && m === "POST") return reply(await billing.useEntitlement(env, mem, await body()));
    const rm = /^\/api\/me\/payments\/([a-f0-9]{32})\/receipt$/.exec(p);
    if (rm && m === "GET") {
      const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1 AND user_id = ?2").bind(rm[1], mem.user.id).first();
      if (!pay) return reply({ error: "not found" }, 404);
      const r = await receiptFor(env, pay, url.searchParams.get("format"));
      return r.html ? new Response(r.html, { headers: { ...cors, ...RECEIPT_HEADERS } }) : reply(r.data);
    }
    const cn = /^\/api\/me\/payments\/([a-f0-9]{32})\/refunds\/(\d{1,12})\/credit-note$/.exec(p);
    if (cn && m === "GET") {
      const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1 AND user_id = ?2").bind(cn[1], mem.user.id).first();
      if (!pay) return reply({ error: "not found" }, 404);
      const r = await creditNoteFor(env, pay, cn[2], url.searchParams.get("format"));
      return r.html ? new Response(r.html, { headers: { ...cors, ...RECEIPT_HEADERS } }) : reply(r.data);
    }
    const sm = /^\/api\/me\/saved\/([a-f0-9]{32})$/.exec(p);
    if (sm && m === "GET") return reply(await members.getSaved(env, mem, sm[1]));
    if (sm && m === "DELETE") return reply(await members.deleteSaved(env, mem, sm[1]));
    return reply({ error: "not found" }, 404);
  }
  if (p.startsWith("/api/med/")) {
    // round 14: medicine checker text proxy (med.js does its own Origin / GET-only / rate-limit checks)
    const r = await medRoute(request, env, url, deps, cors);
    if (r) return r;
  }
  if (p.startsWith("/api/pc/")) {
    // round 17 P4: Product Check official lookups (pc.js does its own Origin / GET-only / rate-limit checks)
    const r = await pcRoute(request, env, url, deps, cors);
    if (r) return r;
  }
  if (p === "/v1/ai/providers" && m === "GET") {
    const st = await gate();
    // without a valid code nothing about the chain is told (same shape as a switched-off feature)
    if (!st.ok) {
      return reply({ feature: String(url.searchParams.get("feature") || "").slice(0, 41), enabled: false, tester: true, reason: st.reason,
        imageModeAllowed: false, stores: false, chain: [] });
    }
    const info = await providersInfo(env, url.searchParams.get("feature") || "", deps);
    return info ? reply(info) : reply({ error: "unknown feature", fallback: true, reason: "unavailable" }, 404);
  }
  const aim = /^\/v1\/ai\/([a-z][a-z0-9_]{1,40})$/.exec(p);
  if (aim && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed", fallback: true, reason: "bad_request" }, 403);
    const st = await gate();
    if (!st.ok) return json(testerBody(st), st.status, gateHeaders(st));
    const [body, status] = await aiRoute(env, request, aim[1], deps);
    return reply(body, status);
  }
  if (p === "/api/fortune/status" && m === "GET") {
    const st = await gate();
    return st.ok ? reply(await fortuneStatus(env, request)) : reply({ enabled: false, tester: true, reason: st.reason, turnstile: true });
  }
  if (p === "/api/fortune" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "Origin ไม่ได้รับอนุญาต", fallback: true }, 403);
    const st = await gate();
    if (!st.ok) return json(testerBody(st), st.status, gateHeaders(st));
    const [body, status] = await fortuneRun(env, request, deps);
    return reply(body, status);
  }
  if (p === "/v1/events" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    if (analytics.doNotTrack(request)) return json(null, 204, cors);
    const body = await readJson(request, analytics.MAX_BODY, { types: ["application/json", "text/plain"] });
    return reply(await analytics.ingest(env, request, body), 202);
  }
  if (p === "/v1/billing/plans" && m === "GET") return reply(await billing.publicBillingInfo(env));
  if (p === "/v1/billing/checkout" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    const r = await billing.checkout(env, request, await readJson(request, 8192), deps);
    return reply(r, r.idempotent_replay ? 200 : 201);
  }
  if (p === "/v1/billing/claim" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "origin not allowed" }, 403);
    return reply(await billing.claimPurchase(env, request, await readJson(request, 4096)));
  }
  const pm = /^\/v1\/billing\/payments\/([a-f0-9]{32})(\/qr)?$/.exec(p);
  if (pm && m === "GET") {
    if (pm[2]) {
      const svg = await billing.paymentQr(env, pm[1], deps);
      return new Response(svg, { headers: { ...cors, "Content-Type": "image/svg+xml", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
    }
    return reply(await billing.paymentStatus(env, pm[1], deps));
  }
  if (p === "/v1/billing/webhook/opn" && m === "POST") {
    const raw = await readText(request, 64 * 1024);
    return json(await billing.handleWebhook(env, request, raw, deps));
  }
  return reply({ error: "not found" }, 404);
}

async function adminRoute(request, env, url, deps) {
  const allow = adminOrigins(env, request);
  const cors = corsHeaders(request, allow, { credentials: true, methods: "GET, POST, PUT, DELETE, OPTIONS", headers: "Content-Type, X-CSRF-Token, Authorization, X-LQ-Device" });
  const m = request.method;
  const route = url.pathname.slice("/admin/api".length) || "/";
  // Every admin request must come from an allowlisted Origin; unsafe ones must send it explicitly.
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(m);
  if (!originAllowed(request, allow, { required: unsafe || m === "OPTIONS" })) return json({ error: "origin not allowed" }, 403, cors);
  if (m === "OPTIONS") return json(null, 204, cors);
  const reply = (body, status = 200, extra = {}) => json(body, status, { ...cors, ...extra });
  const body = async () => (unsafe ? readJson(request, ADMIN_MAX_BODY) : {});

  // unauthenticated. ADMIN_UNAUTH_WRITES_HOUR (tester.js adminUnauth): failed sign-ins cannot write without bound, and no
  // ceiling ever refuses a correct sign-in; only a caller over the in-memory attempt limit gets "admin_busy"
  const busy = g => json({ error: "too many attempts from this address; try again later", code: "admin_busy" }, 429, { ...cors, "Retry-After": String(g.retryAfter) });
  if (route === "/state" && m === "GET") {
    const cached = adminStateCached(env);
    if (cached) return reply(cached); // over the hour's write ceiling: answered from memory
    // anonymous: only whether the one-time setup has been done (no configuration hints); signed in: + the go-live gate
    const out = { bootstrapped: !!(await auth.getOwner(env.DB)) };
    noteBootstrapped(out.bootstrapped);
    let signedIn = null;
    try { signedIn = await auth.requireAdmin(env, request); } catch { /* anonymous */ }
    if (signedIn) out.go_live = await goLiveStatus(env);
    return reply(out);
  }
  if (route === "/bootstrap" && m === "POST") {
    const b = await body();
    const r = await adminUnauth(env, request, e => auth.bootstrap(e, request, b));
    if (r && r.busy) return busy(r);
    noteBootstrapped(true);
    return reply(r, 201);
  }
  if (route === "/login" && m === "POST") {
    const b = await body();
    const r = await adminUnauth(env, request, e => auth.login(e, request, b));
    if (r && r.busy) return busy(r);
    const resp = reply(r.body, 200);
    for (const c of r.cookies) resp.headers.append("Set-Cookie", c);
    return resp;
  }

  const sess = await auth.requireAdmin(env, request);
  const ipHash = await callerHash(env, request, "admin");
  const act = (action, detail) => audit(env, "owner", action, detail, ipHash);
  /** Sensitive action: body {password, totp} (auth.reauthOwner — rate limited per session, failures audited there) or
   *  the 5-min sudo window of POST /reauth. Returns the body without password / totp. A missing re-auth is audited. */
  const reauthed = async () => {
    const b = await body();
    try { return await auth.requireReauth(env, sess, b); } catch (e) {
      if (e && e.extra && e.extra.code === "reauth_required") await act("reauth.failed", { route, missing: true });
      throw e;
    }
  };
  /** Money re-auth (round 12): the sudo window is accepted unless auth.moneyReauthMode(env) is "inline" (MONEY_REAUTH=inline,
   *  or live keys with OPN_ALLOW_LIVE=true) — then the body itself must carry {password, totp} (403 reauth_inline_required). */
  const moneyReauthed = async () => {
    if (auth.moneyReauthMode(env) !== "inline") return reauthed();
    const b = await body();
    try { return await auth.requireInlineReauth(env, sess, b); } catch (e) {
      if (e && e.extra && e.extra.code === "reauth_inline_required") await act("reauth.failed", { route, missing: true, inline: true });
      throw e;
    }
  };
  /** Money operation: re-auth + owner TOTP while billing / live keys are on (auth.requireOwnerTotpFor). */
  const moneyOp = async () => { const b = await moneyReauthed(); await auth.requireOwnerTotpFor(env, "money operations"); return b; };

  switch (`${m} ${route}`) {
    case "GET /me": {
      const o = await auth.getOwner(env.DB);
      return reply({ username: o.username, totp_enabled: !!o.totp_enabled, csrf: sess.viaCookie ? await auth.rotateCsrf(env, sess) : null, password_changed_at: o.password_changed_at });
    }
    case "POST /logout": await auth.logout(env, sess); return reply({ ok: true }, 200, { "Set-Cookie": auth.clearCookie() });
    case "POST /password": return reply(await auth.changePassword(env, sess, await body()));
    case "POST /reauth": return reply(await auth.reauthSession(env, sess, await body()));
    case "GET /go-live": return reply(await goLiveStatus(env));
    case "GET /leads": return reply(await leads.adminLeads(env.DB, Object.fromEntries(url.searchParams)));
    case "POST /totp/setup": return reply(await auth.totpSetup(env, await body(), sess));
    case "POST /totp/enable": return reply(await auth.totpEnable(env, await body()));
    case "POST /totp/disable": return reply(await auth.totpDisable(env, await body(), sess));
    case "GET /devices": return reply(await auth.listDevices(env, request));
    case "DELETE /devices": { const r = await auth.revokeDevice(env, "all"); await act("device.revoked", { all: true, n: r.revoked }); return reply(r); }

    case "GET /analytics/summary": return reply(await analytics.summary(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /analytics/csv": {
      const r = await analytics.exportCsv(env.DB, Object.fromEntries(url.searchParams));
      await act("analytics.export", { from: r.from, to: r.to });
      return new Response(r.csv, { headers: { ...cors, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lensiq-analytics-${r.from}_${r.to}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }

    case "GET /ai": {
      // round 17: legacy_key_store / legacy_key_unused — a key stored here is read by the gateway only with legacyKeyStore on
      const gw = await getGateway(env.DB), key = await settings.apiKeyStatus(env);
      return reply({ settings: await settings.getAiSettings(env.DB), key, turnstile: turnstileStatus(env), efforts: settings.EFFORTS, providers: settings.PROVIDERS,
        legacy_key_store: gw.legacyKeyStore, legacy_key_unused: legacyKeyUnused(gw, key) ? LEGACY_KEY_UNUSED : null });
    }
    case "PUT /ai": {
      const input = await body();
      const s = await settings.putAiSettings(env.DB, input);
      await act("ai.settings", { changed: Object.keys(input) });
      return reply({ settings: s });
    }
    case "PUT /ai/key": {
      const b = await reauthed();
      await settings.setApiKey(env, b.key);
      await act("ai.key.set"); // never the key
      return reply({ key: await settings.apiKeyStatus(env) });
    }
    case "DELETE /ai/key": await reauthed(); await settings.deleteApiKey(env); await act("ai.key.deleted"); return reply({ key: await settings.apiKeyStatus(env) });
    // round 17 P5: AI gateway (settings change = re-auth + audit; key presence only, never values)
    case "GET /ai/gateway": return reply(await adminGateway(env));
    case "PUT /ai/gateway": {
      const input = await reauthed();
      const r = await adminPutGateway(env, input);
      await act("ai.gateway.settings", { changed: Object.keys(input), features: input.features && typeof input.features === "object" ? Object.keys(input.features) : [] });
      return reply(r);
    }
    // round 17 P4: Product Check lookup switches (Thai FDA web service: live for testing / link-out before permission)
    case "GET /pc/lookup": return reply(await adminPcLookup(env));
    case "PUT /pc/lookup": {
      const input = await reauthed();
      const r = await putPcSettings(env, input);
      await act("pc.lookup.settings", r);
      return reply({ settings: r });
    }
    case "GET /ai/usage": return reply(await adminUsage(env, Object.fromEntries(url.searchParams)));

    case "GET /billing": return reply({ ...(await billing.publicBillingInfo(env)), go_live: await goLiveStatus(env), plans: await billing.listPlans(env.DB), open_alerts: (await billingAdmin.listAlerts(env.DB)).open, guest_checkout: await billing.guestCheckoutAllowed(env), settings: await settings.getBillingSettings(env.DB), turnstile: turnstileStatus(env), mail: mailStatus(env), money_reauth: auth.moneyReauthMode(env), opn: { secret_key: !!env.OPN_SECRET_KEY, test_key: String(env.OPN_SECRET_KEY || "").startsWith("skey_test_"), public_key: !!env.OPN_PUBLIC_KEY, webhook_secret: !!env.OPN_WEBHOOK_SECRET } });
    case "PUT /billing/settings": {
      const input = await reauthed();
      const s = await settings.putBillingSettings(env.DB, input);
      await act("billing.settings", s);
      return reply({ settings: s });
    }
    case "GET /billing/payments": return reply(await billing.adminPayments(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /billing/webhooks": return reply(await billing.adminWebhooks(env.DB));
    case "POST /billing/plans": {
      const b = await reauthed();
      const r = await billingAdmin.upsertPlan(env, b && b.id, b, { create: true });
      await act("billing.plan.created", { plan: r.plan.id, prices: r.prices.to, status: r.plan.status });
      return reply(r, 201);
    }
    case "GET /billing/subscriptions": return reply(await billingAdmin.adminSubscriptions(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /alerts": return reply(await billingAdmin.listAlerts(env.DB, Object.fromEntries(url.searchParams)));
    case "POST /billing/test-charge": {
      // round 12: re-auth (body {password, totp} or the sudo window; inline-only under MONEY_REAUTH=inline / live keys),
      // capped at TEST_CHARGE_HOUR (default 10) per hour for the whole admin, every attempt audited
      const b = await moneyReauthed();
      if (flag(env.OPN_ALLOW_LIVE)) await auth.requireOwnerTotpFor(env, "charges with live keys");
      const cap = intVar(env.TEST_CHARGE_HOUR, TEST_CHARGE_HOUR, 1, 100);
      const rl = await hit(env.DB, "admin:test_charge", cap, 3600);
      if (!rl.ok) {
        await act("billing.test_charge.refused", { reason: "hourly_cap", cap });
        if (rl.count === cap + 1) await billing.raiseAlert(env, "test_charge_cap", null, { cap }, deps.fetch);
        throw new HttpError(429, `test-charge limit reached (${cap} per hour) — try again later (test_charge_cap)`, { code: "test_charge_cap", retryAfter: rl.retryAfter });
      }
      const r = await billing.adminTestCharge(env, b, deps);
      await act("billing.test_charge", { payment: r.payment_id, amount: r.amount_satang, n: rl.count, cap });
      return reply(r, 201);
    }

    case "GET /csp-reports": return reply(await adminCspReports(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /mail": return reply({ status: mailStatus(env), ...(await adminMailLog(env.DB, Object.fromEntries(url.searchParams))) });

    case "GET /audit": {
      const rows = (await env.DB.prepare("SELECT id, ts, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 200").all()).results || [];
      return reply({ audit: rows });
    }
    case "GET /members": return reply(await members.adminMembers(env, Object.fromEntries(url.searchParams)));
    case "GET /membership": return reply({ ...(await members.adminMembershipInfo(env)), turnstile: turnstileStatus(env) });
    case "PUT /membership": {
      const input = await reauthed();
      const r = await members.adminPutMembership(env, input);
      await act("membership.settings", { settings: r.settings, plan_ai_quotas: input.plan_ai_quotas || null });
      return reply({ ...r, turnstile: turnstileStatus(env) });
    }

    case "GET /retention": return reply({ config: retentionConfig(env) });
    case "POST /retention/run": {
      await reauthed();
      const r = await runMaintenance(env);
      await act("retention.run.manual");
      return reply(r);
    }
  }
  const ms = /^\/members\/([a-f0-9]{32})\/status$/.exec(route);
  if (ms && m === "POST") {
    const r = await members.adminSetStatus(env, ms[1], await reauthed());
    await act("member.status", { user: ms[1], status: r.status });
    return reply(r);
  }
  const md = /^\/members\/([a-f0-9]{32})$/.exec(route);
  if (md && m === "GET") return reply(await billingAdmin.adminMemberDetail(env, md[1]));
  const mg = /^\/members\/([a-f0-9]{32})\/grant$/.exec(route);
  if (mg && m === "POST") {
    const b = await moneyOp();
    const r = await billingAdmin.grantComplimentary(env, mg[1], b);
    await act("billing.grant", { user: mg[1], plan: b.plan_id || null, feature: b.feature || null, days: b.days || null, credits: b.credits || null });
    return reply(r, 201);
  }
  const cnr = /^\/billing\/payments\/([a-f0-9]{32})\/refunds\/(\d{1,12})\/credit-note$/.exec(route);
  if (cnr && m === "GET") {
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(cnr[1]).first();
    if (!pay) return reply({ error: "not found" }, 404);
    const r = await creditNoteFor(env, pay, cnr[2], url.searchParams.get("format"));
    return r.html ? new Response(r.html, { headers: { ...cors, ...RECEIPT_HEADERS } }) : reply(r.data);
  }
  const pp = /^\/billing\/payments\/([a-f0-9]{32})(\/receipt|\/refund)?$/.exec(route);
  if (pp && m === "GET" && !pp[2]) return reply(await billingAdmin.adminPayment(env, pp[1]));
  if (pp && m === "GET" && pp[2] === "/receipt") {
    const pay = await env.DB.prepare("SELECT * FROM payments WHERE id = ?1").bind(pp[1]).first();
    if (!pay) return reply({ error: "not found" }, 404);
    const r = await receiptFor(env, pay, url.searchParams.get("format"));
    return r.html ? new Response(r.html, { headers: { ...cors, ...RECEIPT_HEADERS } }) : reply(r.data);
  }
  if (pp && m === "POST" && pp[2] === "/refund") {
    const r = await billingAdmin.refundPayment(env, pp[1], await moneyOp(), deps);
    await act("billing.refund", { payment: pp[1], amount: r.refund_satang, status: r.status, receipt: r.receipt_no, credit_note: r.credit_note_no, subscription_cancelled: r.subscription_cancelled, seconds_removed: r.subscription_seconds_removed, credits_revoked: r.credits_revoked });
    return reply(r);
  }
  const sp = /^\/billing\/subscriptions\/([A-Za-z0-9_-]{1,40})\/(cancel|extend)$/.exec(route);
  if (sp && m === "POST") {
    const b = await moneyOp();
    const r = sp[2] === "cancel" ? await billingAdmin.cancelSubscription(env, sp[1], b) : await billingAdmin.extendSubscription(env, sp[1], b);
    await act("billing.subscription." + sp[2], { subscription: sp[1], days: b.days || null, end: r.subscription.current_period_end });
    return reply(r);
  }
  const pl = /^\/billing\/plans\/([a-z][a-z0-9_]{1,31})$/.exec(route);
  if (pl && m === "PUT") {
    const r = await billingAdmin.upsertPlan(env, pl[1], await reauthed());
    await act("billing.plan.updated", { plan: pl[1], changed: r.changed, prices: r.prices, status: r.plan.status });
    return reply(r);
  }
  const al = /^\/alerts\/(\d{1,12})\/ack$/.exec(route);
  if (al && m === "POST") { const r = await billingAdmin.ackAlert(env.DB, al[1]); await act("alert.ack", { alert: Number(al[1]) }); return reply(r); }
  const ld = /^\/leads\/([a-f0-9]{24})(\/ack)?$/.exec(route);
  if (ld && m === "POST" && ld[2]) { const r = await leads.ackLead(env.DB, ld[1]); await act("lead.ack", { lead: ld[1] }); return reply(r); }
  if (ld && m === "DELETE" && !ld[2]) { const r = await leads.deleteLead(env.DB, ld[1]); await act("lead.deleted", { lead: ld[1] }); return reply(r); }
  const dv = /^\/devices\/([a-f0-9]{16})$/.exec(route);
  if (dv && m === "DELETE") { const r = await auth.revokeDevice(env, dv[1]); await act("device.revoked", { device: dv[1] }); return reply(r); }
  return reply({ error: "not found" }, 404);
}

/** Static admin shell served from the Worker's own origin (Workers Static Assets binding ASSETS, built by
 *  backend/scripts/build-admin.mjs). HTTP headers a <meta> cannot carry: frame-ancestors 'none' + X-Frame-Options. */
export const ADMIN_ASSETS = new Set(["/admin", "/admin/", "/admin.html", "/admin.js", "/admin.css", "/lensiq-api.js", "/lensiq-config.js",
  // round 17 P5: AI Gateway section text in English / Chinese (Thai stays the default)
  "/lensiq-i18n.js", "/i18n/zh-admin.js", "/i18n/en-admin.js"]);
export const ADMIN_PAGE_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; report-uri /v1/csp-report; report-to csp",
  "Reporting-Endpoints": 'csp="/v1/csp-report"',
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
async function adminAsset(request, env, url) {
  if (!env.ASSETS || !["GET", "HEAD"].includes(request.method)) return null;
  const path = url.pathname === "/admin" || url.pathname === "/admin/" ? "/admin.html" : url.pathname;
  const r = await env.ASSETS.fetch(new Request(new URL(path, url.origin).toString(), { method: request.method }));
  if (!r.ok) return null;
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(ADMIN_PAGE_HEADERS)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}

/** Public routes with the D1 write meter of a deployment that sets D1_WRITE_BUDGET (tester.js); otherwise unchanged. */
async function publicMetered(request, env, url, deps) {
  if (!env.DB || !strictLimit(env.D1_WRITE_BUDGET).set) return publicRoute(request, env, url, deps);
  const meter = meterDb(env.DB);
  try { return await publicRoute(request, { ...env, DB: meter.db }, url, deps); }
  finally { noteWrites(meter.writes); }
}

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  try {
    if (ADMIN_ASSETS.has(url.pathname)) { const a = await adminAsset(request, env, url); if (a) return a; }
    if (url.pathname.startsWith("/admin/api/") || url.pathname === "/admin/api") return await adminRoute(request, env, url, deps);
    return await publicMetered(request, env, url, deps);
  } catch (e) {
    const allow = url.pathname.startsWith("/admin/") ? adminOrigins(env, request) : publicOrigins(env);
    const cors = corsHeaders(request, allow, { credentials: url.pathname.startsWith("/admin/") });
    if (e instanceof HttpError) {
      const extra = e.extra && e.extra.retryAfter ? { "Retry-After": String(e.extra.retryAfter) } : {};
      return json(e.extra && e.extra.code ? { error: e.message, code: e.extra.code } : { error: e.message }, e.status, { ...cors, ...extra });
    }
    log("unhandled", { name: (e && e.name) || "Error", path: url.pathname.slice(0, 60) });
    return json({ error: "internal error" }, 500, cors);
  }
}

export default {
  async fetch(request, env, ctx) {
    const r = await handle(request, env);
    return ADMIN_ASSETS.has(new URL(request.url).pathname) && r.headers.get("X-Frame-Options") ? r : withHeaders(r, {});
  },
  /** "17 3 * * *" daily maintenance; "*\/15 * * * *" payment reconcile (pending charges re-checked with Opn). */
  async scheduled(event, env, ctx) {
    // round 11: a failing job never becomes an unhandled rejection; only the error NAME is logged (scrubbed — no message,
    // which could carry SQL or values)
    const failed = job => e => log("cron.failed", { job, name: String((e && e.name) || "Error").slice(0, 40), status: Number((e && e.status) || 0) });
    if (event && event.cron === RECONCILE_CRON) {
      ctx.waitUntil(reconcilePending(env).then(r => log("reconcile", { checked: r.checked || 0, changed: r.changed || 0, errors: r.errors || 0, repaired: r.repaired || 0, repair_errors: r.repair_errors || 0, expired_local: r.expired_local || 0, late_success: r.late_success || 0, stuck_alerts: r.stuck_alerts || 0, sweep_errors: r.sweep_errors || 0 }))
        .catch(failed("reconcile")));
      return;
    }
    ctx.waitUntil(runMaintenance(env).then(r => log("maintenance", { aggregated: r.aggregated, events: r.purged.events })).catch(failed("maintenance")));
  }
};

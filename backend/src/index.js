// backend/src/index.js — LENSIQ API Worker entry: router (fetch) + daily maintenance (scheduled).
//
// Public (Origin allowlist ALLOWED_ORIGINS, no credentials):
//   GET  /health
//   GET  /v1/config                      {analytics, free_mode, pricing_enabled}
//   POST /v1/events                      analytics batch (text/plain or application/json; sendBeacon-friendly)
//   GET  /api/fortune/status             same contract as server.py
//   POST /api/fortune                    same contract as server.py
//   GET  /v1/billing/plans               {free_mode, billing_enabled, pricing_enabled, plans?}
//   POST /v1/billing/checkout            PromptPay checkout (BILLING_ENABLED=true and FREE_MODE=false only)
//   GET  /v1/billing/payments/:id        poll status (id is a 128-bit random handle)
//   GET  /v1/billing/payments/:id/qr     QR SVG proxied from Opn (page CSP allows only blob:/self images)
//   POST /v1/billing/webhook/opn         Opn webhook (signature verified; no CORS)
// Admin (ADMIN_ORIGINS, credentials; see auth.js): /admin/api/*
import * as analytics from "./analytics.js";
import * as auth from "./auth.js";
import * as billing from "./billing.js";
import { fortuneRun, fortuneStatus } from "./fortune.js";
import { reconcilePending } from "./billing.js";
import { turnstileStatus } from "./turnstile.js";
import { runMaintenance, retentionConfig } from "./retention.js";
import * as settings from "./settings.js";
import { audit, callerHash } from "./store.js";
import {
  HttpError, adminOrigins, corsHeaders, json, log, originAllowed, publicOrigins, readJson, readText, withHeaders
} from "./util.js";

const ADMIN_MAX_BODY = 16 * 1024;
export const RECONCILE_CRON = "*/15 * * * *";

async function publicRoute(request, env, url, deps) {
  const allow = publicOrigins(env);
  const cors = corsHeaders(request, allow, { headers: "Content-Type, X-Turnstile-Token" });
  const p = url.pathname;
  const m = request.method;
  if (m === "OPTIONS") return json(null, originAllowed(request, allow, { required: true }) ? 204 : 403, cors);
  const reply = (body, status = 200) => json(body, status, cors);

  if (p === "/health" && m === "GET") return reply({ ok: true });
  if (p === "/v1/config" && m === "GET") {
    const b = await billing.publicBillingInfo(env);
    return reply({ analytics: true, free_mode: b.free_mode, pricing_enabled: b.pricing_enabled });
  }
  if (p === "/api/fortune/status" && m === "GET") return reply(await fortuneStatus(env, request));
  if (p === "/api/fortune" && m === "POST") {
    if (!originAllowed(request, allow, { required: true })) return reply({ error: "Origin ไม่ได้รับอนุญาต", fallback: true }, 403);
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
    return reply(await billing.checkout(env, request, await readJson(request, 8192), deps), 201);
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

  // unauthenticated
  if (route === "/state" && m === "GET") {
    // minimum: only whether the one-time setup has been done (no configuration hints)
    return reply({ bootstrapped: !!(await auth.getOwner(env.DB)) });
  }
  if (route === "/bootstrap" && m === "POST") return reply(await auth.bootstrap(env, request, await body()), 201);
  if (route === "/login" && m === "POST") {
    const r = await auth.login(env, request, await body());
    const resp = reply(r.body, 200);
    for (const c of r.cookies) resp.headers.append("Set-Cookie", c);
    return resp;
  }

  const sess = await auth.requireAdmin(env, request);
  const ipHash = await callerHash(env, request, "admin");
  const act = (action, detail) => audit(env, "owner", action, detail, ipHash);

  switch (`${m} ${route}`) {
    case "GET /me": {
      const o = await auth.getOwner(env.DB);
      return reply({ username: o.username, totp_enabled: !!o.totp_enabled, csrf: sess.viaCookie ? await auth.rotateCsrf(env, sess) : null, password_changed_at: o.password_changed_at });
    }
    case "POST /logout": await auth.logout(env, sess); return reply({ ok: true }, 200, { "Set-Cookie": auth.clearCookie() });
    case "POST /password": return reply(await auth.changePassword(env, sess, await body()));
    case "POST /totp/setup": return reply(await auth.totpSetup(env, await body()));
    case "POST /totp/enable": return reply(await auth.totpEnable(env, await body()));
    case "POST /totp/disable": return reply(await auth.totpDisable(env, await body()));

    case "GET /analytics/summary": return reply(await analytics.summary(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /analytics/csv": {
      const r = await analytics.exportCsv(env.DB, Object.fromEntries(url.searchParams));
      await act("analytics.export", { from: r.from, to: r.to });
      return new Response(r.csv, { headers: { ...cors, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="lensiq-analytics-${r.from}_${r.to}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }

    case "GET /ai": return reply({ settings: await settings.getAiSettings(env.DB), key: await settings.apiKeyStatus(env), turnstile: turnstileStatus(env), efforts: settings.EFFORTS, providers: settings.PROVIDERS });
    case "PUT /ai": {
      const input = await body();
      const s = await settings.putAiSettings(env.DB, input);
      await act("ai.settings", { changed: Object.keys(input) });
      return reply({ settings: s });
    }
    case "PUT /ai/key": {
      const b = await body();
      await settings.setApiKey(env, b.key);
      await act("ai.key.set"); // never the key
      return reply({ key: await settings.apiKeyStatus(env) });
    }
    case "DELETE /ai/key": await settings.deleteApiKey(env); await act("ai.key.deleted"); return reply({ key: await settings.apiKeyStatus(env) });

    case "GET /billing": return reply({ ...(await billing.publicBillingInfo(env)), plans: await billing.listPlans(env.DB), settings: await settings.getBillingSettings(env.DB), turnstile: turnstileStatus(env), opn: { secret_key: !!env.OPN_SECRET_KEY, test_key: String(env.OPN_SECRET_KEY || "").startsWith("skey_test_"), public_key: !!env.OPN_PUBLIC_KEY, webhook_secret: !!env.OPN_WEBHOOK_SECRET } });
    case "PUT /billing/settings": {
      const input = await body();
      const s = await settings.putBillingSettings(env.DB, input);
      await act("billing.settings", s);
      return reply({ settings: s });
    }
    case "GET /billing/payments": return reply(await billing.adminPayments(env.DB, Object.fromEntries(url.searchParams)));
    case "GET /billing/webhooks": return reply(await billing.adminWebhooks(env.DB));
    case "POST /billing/test-charge": {
      const r = await billing.adminTestCharge(env, await body(), deps);
      await act("billing.test_charge", { payment: r.payment_id, amount: r.amount_satang });
      return reply(r, 201);
    }

    case "GET /audit": {
      const rows = (await env.DB.prepare("SELECT id, ts, actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 200").all()).results || [];
      return reply({ audit: rows });
    }
    case "GET /retention": return reply({ config: retentionConfig(env) });
    case "POST /retention/run": {
      const r = await runMaintenance(env);
      return reply(r);
    }
  }
  return reply({ error: "not found" }, 404);
}

/** Static admin shell served from the Worker's own origin (Workers Static Assets binding ASSETS, built by
 *  backend/scripts/build-admin.mjs). HTTP headers a <meta> cannot carry: frame-ancestors 'none' + X-Frame-Options. */
export const ADMIN_ASSETS = new Set(["/admin", "/admin/", "/admin.html", "/admin.js", "/admin.css", "/lensiq-api.js", "/lensiq-config.js"]);
export const ADMIN_PAGE_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; " +
    "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
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

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  try {
    if (ADMIN_ASSETS.has(url.pathname)) { const a = await adminAsset(request, env, url); if (a) return a; }
    if (url.pathname.startsWith("/admin/api/") || url.pathname === "/admin/api") return await adminRoute(request, env, url, deps);
    return await publicRoute(request, env, url, deps);
  } catch (e) {
    const allow = url.pathname.startsWith("/admin/") ? adminOrigins(env, request) : publicOrigins(env);
    const cors = corsHeaders(request, allow, { credentials: url.pathname.startsWith("/admin/") });
    if (e instanceof HttpError) {
      const extra = e.extra && e.extra.retryAfter ? { "Retry-After": String(e.extra.retryAfter) } : {};
      return json({ error: e.message }, e.status, { ...cors, ...extra });
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
    if (event && event.cron === RECONCILE_CRON) {
      ctx.waitUntil(reconcilePending(env).then(r => log("reconcile", { checked: r.checked || 0, changed: r.changed || 0, errors: r.errors || 0 })));
      return;
    }
    ctx.waitUntil(runMaintenance(env).then(r => log("maintenance", { aggregated: r.aggregated, events: r.purged.events })));
  }
};

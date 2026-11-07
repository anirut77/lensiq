"use strict";
// tests/unit/backend-analytics.test.js — backend/src/analytics.js + retention.js: strict event allowlist (rejects
// PII-ish fields/values), consent, DNT/GPC, Origin, no IPs stored, aggregation/dashboard, CSV, retention purge.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const SID = "0123456789abcdef";
const ev = (o = {}) => ({ n: "page_view", sid: SID, page: "fortune", lang: "th", device: "mobile", ...o });
const batch = (...events) => ({ v: 1, consent: true, events });

test("validateBatch: accepts the coarse schema", async () => {
  const { validateBatch } = await import(B + "analytics.js");
  const out = validateBatch(batch(ev(), ev({ n: "feature_used", feature: "studio.render", step: "start" }), ev({ n: "reading_domain", domain: "palm" }),
    ev({ n: "error", err: "TypeError" }), ev({ n: "session_end", dur: "2-10m" }), ev({ n: "studio_render_done", page: "studio" }), ev({ ret: "d2-7" })));
  assert.equal(out.length, 7);
});

test("validateBatch: rejects PII-ish fields, values and free text — the whole batch", async () => {
  const { validateBatch } = await import(B + "analytics.js");
  const bad = [
    [ev({ email: "a@b.co" }), /personal data/],
    [ev({ ip: "1.2.3.4" }), /personal data/],
    [ev({ name: "Somchai" }), /personal data/],
    [ev({ image: "data:image/png;base64,AAAA" }), /personal data/],
    [ev({ face: "0.1,0.2" }), /personal data/],
    [ev({ text: "hello" }), /personal data/],
    [ev({ userAgent: "Mozilla" }), /personal data/],
    [ev({ foo: "bar" }), /unknown field/],
    [ev({ feature: "a@b.co", n: "feature_used" }), /e-mail/],
    [ev({ feature: "call0812345678", n: "feature_used" }), /digit/],
    [ev({ err: "https:x", n: "error" }), /URL/],
    [ev({ feature: "my free text", n: "feature_used" }), /free text/],
    [ev({ feature: "ดวงดี", n: "feature_used" }), /non-ASCII/],
    [ev({ page: "Fortune.HTML" }), /invalid page/],
    [ev({ lang: "fr" }), /invalid lang/],
    [ev({ domain: "astrology", n: "reading_domain" }), /invalid domain/],
    [ev({ sid: "not-hex" }), /invalid sid/],
    [ev({ page: 5 }), /must be a string/],
    [ev({ n: "click" }), /invalid n/],
    [{ n: "feature_used", sid: SID }, /needs feature/]
  ];
  for (const [e, re] of bad) assert.throws(() => validateBatch(batch(ev(), e)), re, JSON.stringify(e));
  assert.throws(() => validateBatch({ v: 1, events: [ev()] }), /consent/);
  assert.throws(() => validateBatch({ v: 1, consent: true, events: [ev()], ip: "x" }), /unknown top-level/);
  assert.throws(() => validateBatch({ v: 2, consent: true, events: [ev()] }), /version/);
  assert.throws(() => validateBatch(batch(...Array.from({ length: 51 }, () => ev()))), /at most 50/);
});

async function post(env, body, opts = {}) {
  const { handle } = await import(B + "index.js");
  return handle(req("/v1/events", { method: "POST", body, headers: { "Content-Type": "text/plain", ...(opts.headers || {}) }, origin: opts.origin === undefined ? "https://site.example" : opts.origin, ip: opts.ip }), env);
}

test("ingest: text/plain (sendBeacon) accepted; no IP/UA stored; visitor hash is day-salted", async () => {
  const env = createEnv();
  const r = await post(env, batch(ev()), { headers: { "User-Agent": "Mozilla/5.0 Test" }, ip: "203.0.113.50" });
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://site.example");
  const row = await env.DB.prepare("SELECT * FROM events").first();
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes("203.0.113.50") && !dump.includes("Mozilla"));
  assert.match(row.vh, /^[a-f0-9]{16}$/);
  const cols = Object.keys(row);
  for (const c of ["ip", "ua", "user_agent", "email", "text"]) assert.ok(!cols.includes(c), c);
});

test("ingest: refused without allowlisted Origin, with PII, oversized, or without consent; DNT/GPC store nothing", async () => {
  const env = createEnv();
  assert.equal((await post(env, batch(ev()), { origin: "https://evil.example" })).status, 403);
  assert.equal((await post(env, batch(ev()), { origin: null })).status, 403);
  assert.equal((await post(env, batch(ev({ email: "x@y.z" })))).status, 400);
  assert.equal((await post(env, { v: 1, events: [ev()] })).status, 400);
  assert.equal((await post(env, JSON.stringify(batch(ev())) + " ".repeat(17000))).status, 413);
  assert.equal((await post(env, batch(ev()), { headers: { DNT: "1" } })).status, 204);
  assert.equal((await post(env, batch(ev()), { headers: { "Sec-GPC": "1" } })).status, 204);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM events").first()).n, 0);
});

test("dashboard: sessions, pages, funnel, languages, errors, retention buckets, CSV export", async () => {
  const env = createEnv();
  const s1 = "a".repeat(16), s2 = "b".repeat(16), s3 = "c".repeat(16);
  const e1 = o => ev({ sid: s1, ...o }), e2 = o => ev({ sid: s2, lang: "zh", device: "desktop", ...o }), e3 = o => ev({ sid: s3, page: "studio", lang: "en", ...o });
  await post(env, batch(
    e1({ ret: "new" }), e1({ n: "feature_used", feature: "palm", step: "start" }), e1({ n: "feature_used", feature: "palm", step: "complete" }),
    e1({ n: "reading_domain", domain: "palm" }), e1({ n: "session_end", dur: "2-10m" })
  ), { ip: "203.0.113.1" });
  await post(env, batch(e2({ ret: "d1" }), e2({ n: "feature_used", feature: "palm", step: "start" }), e2({ n: "error", err: "TypeError" })), { ip: "203.0.113.2" });
  await post(env, batch(e3(), e3({ n: "studio_render_done" })), { ip: "203.0.113.3" });
  const { summary, exportCsv } = await import(B + "analytics.js");
  const s = await summary(env.DB, {});
  const today = s.days[s.days.length - 1];
  assert.equal(today.sessions, 3);
  assert.equal(today.visitors, 3);
  assert.equal(today.studio_render, 1);
  assert.deepEqual(s.funnel, { visit: 3, start: 2, complete: 1 });
  assert.deepEqual(s.funnel_by_feature, [{ feature: "palm", start: 2, complete: 1 }]);
  assert.deepEqual(s.pages.map(p => p.key).sort(), ["fortune", "studio"]);
  assert.deepEqual(Object.fromEntries(s.lang.map(l => [l.key, l.n])), { th: 1, zh: 1, en: 1 });
  assert.equal(s.errors[0].key, "TypeError");
  assert.equal(s.domains[0].key, "palm");
  assert.equal(s.retention.returning_share, 0.5);
  assert.equal(s.weekly_active_sessions, 3);
  const { csv } = await exportCsv(env.DB, {});
  assert.match(csv, /^day,metric,key,n\r\n/);
  assert.match(csv, /,page,fortune,\d+\r\n/);
});

test("retention: raw events purged after RAW_EVENT_DAYS only once aggregated; aggregates and today's salt kept", async () => {
  const env = createEnv({ RAW_EVENT_DAYS: "90" });
  const { runMaintenance, purge } = await import(B + "retention.js");
  const { dayOf, addDays } = await import(B + "util.js");
  const t = Math.floor(Date.now() / 1000), today = dayOf(t);
  const old = addDays(today, -100), recent = addDays(today, -10);
  const ins = (day, sid) => env.DB.prepare("INSERT INTO events (day, ts, name, sid, page) VALUES (?1, ?2, 'page_view', ?3, 'fortune')").bind(day, t, sid).run();
  await ins(old, "a".repeat(16)); await ins(old, "b".repeat(16)); await ins(recent, "c".repeat(16));
  await env.DB.prepare("INSERT INTO daily_salts (day, salt) VALUES (?1, 'old'), (?2, 'now')").bind(addDays(today, -1), today).run();
  await env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES ('x', ?1, 1)").bind(t - 3 * 86400).run();
  await env.DB.prepare("INSERT INTO admin_sessions (id_hash, csrf_hash, created_at, last_seen, expires_at) VALUES ('h', 'c', 0, 0, ?1)").bind(t - 1).run();
  await env.DB.prepare("INSERT INTO audit_log (ts, actor, action) VALUES (?1, 'system', 'ancient')").bind(t - 500 * 86400).run();

  // without aggregates the old day is NOT deleted (no data loss)
  const p0 = await purge(env, t);
  assert.equal(p0.events, 0);

  const r = await runMaintenance(env, t);
  assert.ok(r.aggregated >= 2);
  assert.equal(r.purged.events, 2);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM events").first()).n, 1, "recent day kept");
  assert.equal((await env.DB.prepare("SELECT n FROM daily_agg WHERE day = ?1 AND metric = 'sessions'").bind(old).first()).n, 2, "aggregate kept");
  assert.deepEqual((await env.DB.prepare("SELECT day FROM daily_salts").all()).results.map(x => x.day), [today]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_sessions").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'ancient'").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'retention.run'").first()).n, 1);
});

test("scheduled handler runs maintenance through ctx.waitUntil", async () => {
  const env = createEnv();
  const worker = (await import(B + "index.js")).default;
  const waits = [];
  await worker.scheduled({ cron: "17 3 * * *" }, env, { waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'retention.run'").first()).n, 1);
});

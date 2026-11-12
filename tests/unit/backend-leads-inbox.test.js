"use strict";
// tests/unit/backend-leads-inbox.test.js — quote-request inbox of the admin back office (owner decision 2026-11-12,
// Sellable pack item 9: "build the back-office inbox screen and the privacy text now; keep the form off"). FIXED TEST SET
// written before the build; sha256 in ~/LENSIQ-field/evals/leads/locked.sha256.
//   1. every inbox route needs the owner's sign-in (401 without it, also with a member token)
//   2. list: newest first, summary fields only (no e-mail / phone / message), status new | contacted | closed, counts
//   3. view one: full record + the automatic deletion date (180 days after receipt), audited with the id only
//   4. status: new -> contacted -> closed -> new, bad values refused, unknown id 404, audited with id + status only
//   5. delete one: refused without re-auth (audited as reauth.failed), works with the password, audited with the id only
//   6. CSV export: refused without re-auth, works with it, spreadsheet-formula guard, audited without personal data
//   7. the legacy /ack route still marks a request handled (shown as "contacted")
//   8. (amended A6, owner decision 2026-11-12: form ON) the test deployment opens /v1/leads + the LINE test route only;
//      Turnstile fail closed; daily cap; minimum fields; unread badge
//   9. owner notification over LINE: off until the owner sets LINE_CHANNEL_ACCESS_TOKEN and LEAD_NOTIFY_LINE_TO; then one
//      push "LENSIQ: คำขอใบเสนอราคาใหม่ #<id> <time>" with no personal data, daily cap; a LINE failure never loses the
//      request; owner test push behind HEALTH_TOKEN, 3 per hour; the CLI is guarded (fake LINE endpoint, no network)
// Synthetic data only; in-memory D1; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const ROOT = join(__dirname, "..", "..");
const ADMIN_TOKEN = "bootstrap-" + "q".repeat(40);
const ADMIN_PW = "quote inbox passphrase 2026";
const KEK = Buffer.alloc(32, 9).toString("base64");
const nowS = () => Math.floor(Date.now() / 1000);
const PII = ["ผู้ขอ หนึ่ง", "buyer1@shop.example", "0812345601", "ข้อความลับ 1", "ผู้ขอ สอง", "buyer2@shop.example", "0812345602", "=HYPERLINK"];

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  const net = { line: [], lineStatus: 200 };
  const fetchStub = async (url, init = {}) => {
    if (/turnstile\/v0\/siteverify$/.test(String(url))) return new Response(JSON.stringify({ success: true, action: "lead", hostname: "site.example" }));
    if (String(url).startsWith("https://api.line.me/")) {
      net.line.push({ url: String(url), method: init.method, headers: Object.fromEntries(new Headers(init.headers || {})), body: String(init.body || "") });
      return new Response("{}", { status: net.lineStatus });
    }
    throw new Error("unexpected network call: " + url);
  };
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, origin: o.origin, ip: o.ip }), env, { fetch: fetchStub });
    let j = null, text = null;
    try { text = await r.clone().text(); j = JSON.parse(text); } catch { /* CSV or empty */ }
    return { status: r.status, j, text, r };
  };
  let tok = null;
  const A = async (path, o = {}) => {
    if (!tok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + tok, ...(o.headers || {}) } });
  };
  const seed = async (n, name, email, phone, message, product = "exam", status = "new") => {
    const id = n.toString(16).padStart(24, "0");
    await env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status) " +
      "VALUES (?1, ?2, ?3, NULL, 'index', ?4, 'บริษัททดสอบ', ?5, ?6, ?7, 'th', 'l1', ?8)")
      .bind(id, nowS() - 3600 * (10 - n), product, name, email, phone, message, status).run();
    return id;
  };
  const audit = async () => (await env.DB.prepare("SELECT action, detail FROM audit_log ORDER BY id").all()).results || [];
  return { call, A, env, seed, audit, net };
}

test("inbox: every route needs the owner's sign-in", async () => {
  const { call, seed } = await setup();
  const id = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  for (const [path, method, body] of [["/admin/api/leads", "GET"], [`/admin/api/leads/${id}`, "GET"], [`/admin/api/leads/${id}/status`, "POST", { status: "closed" }],
    [`/admin/api/leads/${id}`, "DELETE", {}], ["/admin/api/leads/export", "POST", {}], [`/admin/api/leads/${id}/ack`, "POST", {}]]) {
    const r = await call(path, { method, body, origin: "https://api.example" });
    assert.equal(r.status, 401, method + " " + path);
    assert.ok(!PII.some(p => String(r.text).includes(p)), "no personal data without sign-in: " + path);
    const m = await call(path, { method, body, origin: "https://api.example", headers: { Authorization: "Bearer " + "m".repeat(43) } });
    assert.equal(m.status, 401, "a member / random token is not the owner: " + path);
  }
});

test("inbox list: newest first, summary only, statuses new / contacted / closed with counts", async () => {
  const { A, seed, audit } = await setup();
  const a = await seed(1, PII[0], PII[1], PII[2], PII[3], "exam");
  const b = await seed(2, PII[4], PII[5], PII[6], "ข้อความ 2", "gate");
  const c = await seed(3, "ผู้ขอ สาม", "c@shop.example", null, null, "crowd");
  const all = await A("/leads?status=all");
  assert.equal(all.status, 200);
  assert.deepEqual(all.j.leads.map(x => x.id), [c, b, a], "newest first");
  assert.deepEqual(all.j.counts, { new: 3, contacted: 0, closed: 0 });
  assert.equal(all.j.open, 3);
  for (const row of all.j.leads) {
    assert.ok(!("email" in row) && !("phone" in row) && !("message" in row), "list shows no contact details or message: " + Object.keys(row));
    assert.equal(row.status, "new");
    assert.ok(row.name && row.interest && row.created_at, JSON.stringify(row));
  }
  assert.ok(!all.text.includes(PII[1]) && !all.text.includes(PII[2]) && !all.text.includes(PII[3]));
  assert.equal((await A("/leads")).j.leads.length, 3, "default: new requests");
  assert.equal((await A(`/leads/${b}/status`, { method: "POST", body: { status: "contacted" } })).status, 200);
  assert.equal((await A(`/leads/${c}/status`, { method: "POST", body: { status: "closed" } })).status, 200);
  assert.deepEqual((await A("/leads?status=contacted")).j.leads.map(x => x.id), [b]);
  assert.deepEqual((await A("/leads?status=closed")).j.leads.map(x => x.id), [c]);
  assert.deepEqual((await A("/leads?status=new")).j.leads.map(x => x.id), [a]);
  assert.deepEqual((await A("/leads?status=all")).j.counts, { new: 1, contacted: 1, closed: 1 });
  const log = await audit();
  assert.ok(log.some(x => x.action === "lead.list"), "reading the inbox is audited");
  assert.ok(!log.some(x => PII.some(p => String(x.detail).includes(p))), "audit holds no personal data");
});

test("inbox view: full record with the deletion date; audited with the id only; unknown / malformed id 404", async () => {
  const { A, seed, audit } = await setup();
  const id = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  const v = await A(`/leads/${id}`);
  assert.equal(v.status, 200);
  assert.equal(v.j.lead.email, PII[1]); assert.equal(v.j.lead.phone, PII[2]); assert.equal(v.j.lead.message, PII[3]);
  assert.equal(v.j.lead.interest, "exam"); assert.equal(v.j.lead.status, "new");
  assert.equal(v.j.lead.delete_after, v.j.lead.created_at + 180 * 86400, "automatic deletion 180 days after receipt");
  assert.equal(v.j.retention_days, 180);
  assert.ok(!Object.keys(v.j.lead).some(k => /ip|agent|caller/.test(k)), "no IP / user agent / caller hash");
  assert.equal((await A("/leads/" + "f".repeat(24))).status, 404);
  assert.equal((await A("/leads/not-an-id")).status, 404);
  const seen = (await audit()).filter(x => x.action === "lead.viewed");
  assert.equal(seen.length, 1);
  assert.deepEqual(JSON.parse(seen[0].detail), { lead: id }, "id only");
  const custom = await setup({ LEADS_DAYS: "90" });
  const id2 = await custom.seed(2, "ผู้ขอ", "x@shop.example", null, null);
  const v2 = await custom.A(`/leads/${id2}`);
  assert.equal(v2.j.retention_days, 90); assert.equal(v2.j.lead.delete_after, v2.j.lead.created_at + 90 * 86400);
});

test("inbox status: new -> contacted -> closed -> new; bad values refused; audited with id + status only", async () => {
  const { A, seed, audit } = await setup();
  const id = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  for (const s of ["contacted", "closed", "new"]) {
    const r = await A(`/leads/${id}/status`, { method: "POST", body: { status: s } });
    assert.equal(r.status, 200, s + " " + JSON.stringify(r.j));
    assert.equal(r.j.status, s);
    assert.equal((await A(`/leads/${id}`)).j.lead.status, s);
  }
  for (const bad of ["acked", "deleted", "", null, 1, "CLOSED"]) assert.equal((await A(`/leads/${id}/status`, { method: "POST", body: { status: bad } })).status, 400, String(bad));
  assert.equal((await A(`/leads/${"e".repeat(24)}/status`, { method: "POST", body: { status: "closed" } })).status, 404);
  const st = (await audit()).filter(x => x.action === "lead.status").map(x => JSON.parse(x.detail));
  assert.deepEqual(st, [{ lead: id, status: "contacted" }, { lead: id, status: "closed" }, { lead: id, status: "new" }]);
});

test("inbox delete one: needs re-auth (refusal audited), then erases the row; audited with the id only", async () => {
  const { A, seed, audit, env } = await setup();
  const id = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  const keep = await seed(2, PII[4], PII[5], PII[6], "x");
  const no = await A(`/leads/${id}`, { method: "DELETE", body: {} });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  assert.ok(await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(id).first(), "not deleted without re-auth");
  assert.ok((await audit()).some(x => x.action === "reauth.failed"), "missing re-auth audited");
  const wrong = await A(`/leads/${id}`, { method: "DELETE", body: { password: "wrong password here" } });
  assert.equal(wrong.status, 403);
  assert.ok(await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(id).first(), "not deleted with a wrong password");
  const ok = await A(`/leads/${id}`, { method: "DELETE", body: { password: ADMIN_PW } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(id).first(), null, "row erased");
  assert.ok(await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(keep).first(), "only that one");
  assert.equal((await A(`/leads/${id}`, { method: "DELETE", body: { password: ADMIN_PW } })).status, 404);
  const del = (await audit()).filter(x => x.action === "lead.deleted").map(x => JSON.parse(x.detail));
  assert.deepEqual(del, [{ lead: id }]);
  assert.ok(!(await audit()).some(x => PII.some(p => String(x.detail).includes(p))), "audit holds no personal data");
});

test("inbox CSV export: needs re-auth; all requests or one status; formula guard; audited without personal data", async () => {
  const { A, seed, audit } = await setup();
  const a = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  const b = await seed(2, PII[4], PII[5], PII[6], PII[7] + "(\"http://x\")");
  assert.equal((await A(`/leads/${b}/status`, { method: "POST", body: { status: "closed" } })).status, 200);
  const no = await A("/leads/export", { method: "POST", body: {} });
  assert.equal(no.status, 403); assert.equal(no.j.code, "reauth_required");
  const r = await A("/leads/export", { method: "POST", body: { password: ADMIN_PW, status: "all" } });
  assert.equal(r.status, 200);
  assert.match(r.r.headers.get("Content-Type"), /^text\/csv/);
  assert.match(r.r.headers.get("Content-Disposition"), /attachment; filename="lensiq-quote-requests-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.equal(r.r.headers.get("Cache-Control"), "no-store");
  const lines = r.text.trim().split(/\r\n/);
  assert.equal(lines[0], "id,received,status,interest,plan,source,lang,name,organisation,email,phone,message,consent_version,delete_after");
  assert.equal(lines.length, 3, "header + 2 rows");
  assert.ok(lines[1].startsWith(b) && lines[2].startsWith(a), "newest first");
  assert.ok(r.text.includes(PII[1]) && r.text.includes(PII[5]));
  assert.ok(r.text.includes("'" + PII[7]), "a cell starting with = is neutralised");
  // amendment 2026-11-12 (before any product code passed it): an inline password does not open the 5-minute window, so a
  // second export without the password is refused again; with it, it works. Stricter than the first draft.
  assert.equal((await A("/leads/export", { method: "POST", body: { status: "new" } })).status, 403, "each export needs re-auth");
  const one = await A("/leads/export", { method: "POST", body: { status: "new", password: ADMIN_PW } });
  assert.equal(one.status, 200);
  assert.equal(one.text.trim().split(/\r\n/).length, 2, "status filter");
  const ex = (await audit()).filter(x => x.action === "lead.export").map(x => JSON.parse(x.detail));
  assert.deepEqual(ex, [{ n: 2, status: "all" }, { n: 1, status: "new" }]);
  assert.ok(!(await audit()).some(x => PII.some(p => String(x.detail).includes(p.slice(0, 10)))), "audit holds no personal data");
});

test("legacy /ack still marks a request handled (shown as contacted); the public route records consent l1", async () => {
  const { A, call, seed } = await setup();
  const id = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  assert.equal((await A(`/leads/${id}/ack`, { method: "POST", body: {} })).status, 200);
  assert.equal((await A(`/leads/${id}`)).j.lead.status, "contacted");
  assert.equal((await A(`/leads/${id}/ack`, { method: "POST", body: {} })).status, 404, "already handled");
  const lead = { name: "ผู้ขอ ห้า", email: "five@shop.example", interest: "exam", consent: true };
  const p = await call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: lead });
  assert.equal(p.status, 201, JSON.stringify(p.j));
  const v = await A(`/leads/${p.j.id}`);
  assert.equal(v.j.lead.consent_version, "l1"); assert.equal(v.j.lead.status, "new");
});

// ---- 2026-11-12 owner decisions: form ON, unread badge, minimum fields, LINE notification (amendment A6) ----------------
test("form ON on the test deployment (explicit owner decision 2026-11-12): /v1/leads and the LINE test in PUBLIC_ROUTES; daily cap 50", async () => {
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  const routes = [...toml.matchAll(/^PUBLIC_ROUTES\s*=\s*"([^"]*)"/gm)].map(m => m[1]);
  assert.deepEqual(routes, ["/health,/health/deep,/health/notify-test,/v1/config,/v1/tester/check,/v1/leads,/v1/ai/*,/api/pc/*,/api/med/*"],
    "only /v1/leads and /health/notify-test were added");
  const test = toml.slice(toml.indexOf("[env.test.vars]"));
  assert.match(test, /^LEADS_GLOBAL_DAY = "50"$/m); assert.match(test, /^LEADS_DAYS = "180"$/m); assert.match(test, /^LEAD_NOTIFY_LINE_DAY = "50"$/m);
  const { call, env } = await setup({ PUBLIC_ROUTES: routes[0] });
  for (const [path, o] of [["/v1/events", { method: "POST", body: {} }], ["/v1/billing/plans", {}], ["/api/auth/nonce", { method: "POST", body: {} }]]) {
    assert.equal((await call(path, o)).status, 404, path + " stays closed");
  }
  const no = await call("/v1/leads", { method: "POST", body: { name: "ผู้ขอ", email: "a@shop.example", interest: "exam", consent: true } });
  assert.equal(no.status, 403, "no Turnstile token: refused (fail closed)");
  const r = await call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: { name: "ผู้ขอ", email: "a@shop.example", interest: "exam", consent: true } });
  assert.equal(r.status, 201, JSON.stringify(r.j));
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first()).n, 1);
  const g = await setup({ LEADS_GLOBAL_DAY: "2" });
  for (let i = 0; i < 2; i++) assert.equal((await g.call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, ip: "198.51.100." + i,
    body: { name: "ผู้ขอ", email: `a${i}@shop.example`, interest: "exam", consent: true } })).status, 201);
  assert.equal((await g.call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, ip: "198.51.100.9",
    body: { name: "ผู้ขอ", email: "a9@shop.example", interest: "exam", consent: true } })).status, 429, "daily cap");
});

test("minimum fields: name, organisation, contact (e-mail or phone), interest, message; anything else refused; length caps", async () => {
  const { call } = await setup();
  const post = body => call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: { name: "ผู้ขอ", interest: "exam", consent: true, ...body } });
  assert.equal((await post({ phone: "0812345678" })).status, 201, "a phone alone is enough");
  assert.equal((await post({ email: "x@shop.example", org: "บริษัท", message: "ขอราคา" })).status, 201);
  assert.equal((await post({ email: "x@shop.example", plan: "Starter" })).status, 400, "plan is no longer collected");
  assert.equal((await post({ email: "x@shop.example", birthday: "2000-01-01" })).status, 400);
  assert.equal((await post({})).j.code, "lead_invalid", "a contact is required");
  assert.equal((await post({ email: "x@shop.example", message: "ก".repeat(1001) })).status, 400, "message cap 1000");
  assert.equal((await post({ email: "x@shop.example", name: "ก".repeat(121) })).status, 400, "name cap 120");
});

test("unread badge: new requests not opened yet; opening or changing the status clears it; count only, sign-in needed", async () => {
  const { A, call, seed } = await setup();
  const a = await seed(1, PII[0], PII[1], PII[2], PII[3]);
  const b = await seed(2, PII[4], PII[5], PII[6], "x");
  await seed(3, "ผู้ขอ สาม", "c@shop.example", null, null, "crowd", "closed");
  assert.equal((await call("/admin/api/leads/unread", { origin: "https://api.example" })).status, 401);
  const u = await A("/leads/unread");
  assert.deepEqual(u.j, { unread: 2 });
  assert.equal((await A("/leads?status=all")).j.unread, 2);
  await A(`/leads/${a}`);
  assert.deepEqual((await A("/leads/unread")).j, { unread: 1 }, "viewed");
  await A(`/leads/${b}/status`, { method: "POST", body: { status: "contacted" } });
  assert.deepEqual((await A("/leads/unread")).j, { unread: 0 }, "contacted");
  await A(`/leads/${b}/status`, { method: "POST", body: { status: "new" } });
  assert.deepEqual((await A("/leads/unread")).j, { unread: 0 }, "already opened once: stays read");
});

const LINE_TOKEN = "fake-line-channel-token-" + "z".repeat(40);
const LINE_TO = "U" + "0123456789abcdef".repeat(2);
const LEAD = { name: "ผู้ขอ หก", org: "บริษัท หก", email: "six@shop.example", phone: "0812345606", interest: "gate", message: "ขอใบเสนอราคา หก", consent: true };
const postLead = (call, body = LEAD, ip) => call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body, ip });

test("LINE notification: off until the owner sets both (LINE_CHANNEL_ACCESS_TOKEN + LEAD_NOTIFY_LINE_TO); nothing sent without them", async () => {
  for (const vars of [{}, { LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN }, { LEAD_NOTIFY_LINE_TO: LINE_TO }, { LINE_CHANNEL_ACCESS_TOKEN: "", LEAD_NOTIFY_LINE_TO: LINE_TO },
    { LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: "not-a-user-id" }, { LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: "C" + "0".repeat(32) }]) {
    const { call, net } = await setup(vars);
    const r = await postLead(call);
    assert.equal(r.status, 201, JSON.stringify(Object.keys(vars)));
    assert.equal(net.line.length, 0, "no LINE call: " + JSON.stringify(Object.keys(vars)));
  }
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.ok(!/^\s*(LINE_CHANNEL_ACCESS_TOKEN|LEAD_NOTIFY_LINE_TO)\s*=/m.test(toml), "never a committed value: the owner enters them as Worker secrets");
});

test("LINE notification: one push per request with only the id and time; no personal data; failure never loses the request; daily cap", async () => {
  const { call, net, env } = await setup({ LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: LINE_TO, LEAD_NOTIFY_LINE_DAY: "2" });
  const r = await postLead(call);
  assert.equal(r.status, 201);
  assert.equal(net.line.length, 1);
  const p = net.line[0];
  assert.equal(p.url, "https://api.line.me/v2/bot/message/push");
  assert.equal(p.method, "POST");
  assert.equal(p.headers.authorization, "Bearer " + LINE_TOKEN);
  const body = JSON.parse(p.body);
  assert.equal(body.to, LINE_TO);
  assert.equal(body.messages.length, 1); assert.equal(body.messages[0].type, "text");
  assert.match(body.messages[0].text, new RegExp("^LENSIQ: คำขอใบเสนอราคาใหม่ #" + r.j.id + " \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$"));
  for (const v of [LEAD.name, LEAD.org, LEAD.email, LEAD.phone, LEAD.message, LEAD.interest, "six", "0812"]) assert.ok(!p.body.includes(v), "no personal data in the push: " + v);
  assert.deepEqual(Object.keys(body).sort(), ["messages", "to"]);
  net.lineStatus = 500;
  const r2 = await postLead(call, { ...LEAD, email: "seven@shop.example" }, "198.51.100.2");
  assert.equal(r2.status, 201, "a LINE failure does not fail the request");
  assert.ok(await env.DB.prepare("SELECT id FROM leads WHERE id = ?1").bind(r2.j.id).first(), "stored even when LINE fails");
  assert.equal(net.line.length, 2);
  net.lineStatus = 200;
  const r3 = await postLead(call, { ...LEAD, email: "eight@shop.example" }, "198.51.100.3");
  assert.equal(r3.status, 201);
  assert.equal(net.line.length, 2, "daily cap (LEAD_NOTIFY_LINE_DAY) reached: no third push, request still stored");
});

test("LINE test push (POST /health/notify-test): Bearer HEALTH_TOKEN; refused while unset; 3 per hour; answers status only", async () => {
  const H = "health-token-" + "h".repeat(30);
  const off = await setup({ LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: LINE_TO });
  const n0 = await off.call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer x" } });
  assert.equal(n0.status, 503); assert.equal(n0.j.code, "health_token_not_set");
  const { call, net } = await setup({ HEALTH_TOKEN: H, LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN, LEAD_NOTIFY_LINE_TO: LINE_TO,
    PUBLIC_ROUTES: "/health,/health/deep,/health/notify-test,/v1/leads" });
  assert.equal((await call("/health/notify-test", { method: "POST" })).status, 401);
  assert.equal((await call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer wrong" } })).status, 401);
  assert.equal(net.line.length, 0);
  const ok = await call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer " + H } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.j, { ok: true, configured: true, line_status: 200 });
  assert.ok(!ok.text.includes(LINE_TOKEN) && !ok.text.includes(LINE_TO), "never echoes the token or the recipient");
  assert.match(JSON.parse(net.line[0].body).messages[0].text, /^LENSIQ: ทดสอบการแจ้งเตือน \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  net.lineStatus = 401;
  const bad = await call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer " + H } });
  assert.deepEqual(bad.j, { ok: false, configured: true, line_status: 401 });
  await call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer " + H } });
  assert.equal((await call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer " + H } })).status, 429, "3 per hour");
  assert.equal(net.line.length, 3);
  const unset = await setup({ HEALTH_TOKEN: H, LINE_CHANNEL_ACCESS_TOKEN: LINE_TOKEN });
  const u = await unset.call("/health/notify-test", { method: "POST", headers: { Authorization: "Bearer " + H } });
  assert.deepEqual(u.j, { ok: false, configured: false, missing: ["LEAD_NOTIFY_LINE_TO"] });
  assert.equal(unset.net.line.length, 0);
});

test("npm run backend:notify-test: guarded target, hidden token, prints only the outcome", async () => {
  const { main } = await import("../../tools/notify-test.mjs");
  const out = [], calls = [];
  const io = { print: s => out.push(s), env: {}, tty: true, readSecret: async () => "TYPED-HEALTH-CANARY",
    fetch: async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return new Response(JSON.stringify({ ok: true, configured: true, line_status: 200 })); } };
  assert.equal(await main(["--base", "https://evil.example"], io), 2, "foreign host refused");
  assert.equal(await main(["--base", "https://other-worker.someone.workers.dev"], io), 2, "another Worker name refused");
  assert.equal(calls.length, 0);
  assert.equal(await main(["--base", "https://lensiq-api-test.example-sub.workers.dev"], io), 0);
  assert.deepEqual(calls, [{ url: "https://lensiq-api-test.example-sub.workers.dev/health/notify-test", auth: "Bearer TYPED-HEALTH-CANARY" }]);
  assert.match(out.join("\n"), /TARGET {3}https:\/\/lensiq-api-test\.example-sub\.workers\.dev/);
  assert.ok(!out.join("\n").includes("CANARY"), "the token is never printed");
  assert.equal(await main(["--base", "https://lensiq-api-test.example-sub.workers.dev"], { ...io, env: { CI: "true" } }), 3, "never in CI");
  assert.equal(await main(["--base", "https://lensiq-api-test.example-sub.workers.dev"], { ...io, readSecret: undefined, tty: false }), 3, "needs a terminal");
});

"use strict";
// tests/unit/backend-lead-notify-2.test.js — review round 1 of lead-notify-health (2026-11-15), cases D3 + D4, locked
// (appended to evals-locks/lead-notify.sha256) before the fix:
//   D3a notifyLine throws before it records anything: a log line `alert.lead_line_unrecorded` (no value) and the lead is
//       never silently "no result": it shows as failed or unknown in the inbox, and the status line is not "ok"
//   D3b the result UPDATE itself fails: `alert.lead_line_unrecorded` logged (no value); once the lead is older than a
//       minute it shows as "unknown" in the inbox and in the status line
//   D3c rows from before the feature (no result written by this code) stay without a badge (null)
//   D4  docs/DEPLOY.md and docs/CTO-BRIEF.md state the order: migration 0020 FIRST, then the Worker deploy
// Synthetic data only; in-memory D1; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const ROOT = join(__dirname, "..", "..");
const ADMIN_TOKEN = "bootstrap-" + "u".repeat(40);
const ADMIN_PW = "lead notify review passphrase";
const KEK = Buffer.alloc(32, 3).toString("base64");
const TOKEN = "CANARYreviewtoken" + "Pz5".repeat(40);
const TO = "U" + "a0b1c2d3e4f5a6b7".repeat(2);
const LEAD = { name: "Review Buyer", email: "review@shop.example", interest: "gate", consent: true };

const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.map(String).join(" ")); };
test.after(() => { console.log = origLog; });

async function setup(vars = {}, wrapDb) {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  const rawDb = env.DB;
  if (wrapDb) env.DB = wrapDb(rawDb);
  const fetchStub = async url => {
    if (/turnstile\/v0\/siteverify$/.test(String(url))) return new Response(JSON.stringify({ success: true, action: "lead", hostname: "site.example" }));
    if (String(url).startsWith("https://api.line.me/")) return new Response("{}", { status: 200 });
    throw new Error("unexpected network call: " + url);
  };
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, origin: o.origin, ip: o.ip }), env, { fetch: fetchStub });
    let j = null, text = null;
    try { text = await r.clone().text(); j = JSON.parse(text); } catch { /* empty */ }
    return { status: r.status, j, text };
  };
  let tok = null;
  const A = async path => {
    if (!tok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { headers: { Authorization: "Bearer " + tok } });
  };
  let ipn = 1;
  const post = () => call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: LEAD, ip: "192.0.2." + (ipn++) });
  return { env, rawDb, call, A, post };
}
const notifyOf = async (s, id) => ((await s.A("/leads?status=all")).j.leads.find(l => l.id === id) || {}).notify;
const noValue = (text, where) => {
  for (const v of [TOKEN, TO]) for (let i = 0; i + 12 <= v.length; i += 4) assert.ok(!String(text).includes(v.slice(i, i + 12)), where + ": a piece of a secret value leaked");
};

test("D3a: notifyLine throws before recording: logged as unrecorded, the lead is flagged, status is not ok", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO });
  Object.defineProperty(s.env, "LEAD_NOTIFY_LINE_DAY", { get() { throw new Error("boom"); }, configurable: true });
  const l0 = logs.length;
  const r = await s.post();
  assert.equal(r.status, 201, "the request is stored anyway");
  const lines = logs.slice(l0).join("\n");
  assert.match(lines, /alert\.lead_line_unrecorded/);
  noValue(lines, "log");
  await s.rawDb.prepare("UPDATE leads SET created_at = created_at - 120 WHERE id = ?1").bind(r.j.id).run();
  const n = await notifyOf(s, r.j.id);
  assert.ok(n === "failed" || n === "unknown", "flagged in the inbox: " + n);
  const st = await s.A("/leads/notify");
  assert.notEqual(st.j.state, "ok");
  assert.notEqual(st.j.state, "unconfirmed");
  noValue(st.text, "status API");
});

test("D3b: the result UPDATE fails: logged as unrecorded; after a minute the lead shows 'unknown' in the inbox and the status line", async () => {
  const wrap = db => ({
    prepare(sql) {
      if (/^\s*UPDATE leads SET notify_state/i.test(sql)) throw new Error("D1 write failed");
      return db.prepare(sql);
    },
    batch: (...a) => db.batch(...a), exec: (...a) => db.exec(...a)
  });
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO }, wrap);
  const l0 = logs.length;
  const r = await s.post();
  assert.equal(r.status, 201);
  const lines = logs.slice(l0).join("\n");
  assert.match(lines, /alert\.lead_line_unrecorded/);
  noValue(lines, "log");
  await s.rawDb.prepare("UPDATE leads SET created_at = created_at - 120 WHERE id = ?1").bind(r.j.id).run();
  assert.equal(await notifyOf(s, r.j.id), "unknown");
  const st = await s.A("/leads/notify");
  assert.equal(st.j.state, "failing");
  assert.equal(st.j.last.state, "unknown");
  noValue(st.text, "status API");
});

test("D3c: rows from before the feature (no result written by this code) carry no badge", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO });
  const id = "0".repeat(23) + "9";
  await s.rawDb.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status) " +
    "VALUES (?1, ?2, 'exam', NULL, 'index', 'Old Buyer', NULL, 'old@shop.example', NULL, NULL, 'en', 'l1', 'new')").bind(id, Math.floor(Date.now() / 1000) - 86400).run();
  assert.equal(await notifyOf(s, id), null);
});

test("D4: the deploy docs state the order: migration 0020 first, then the Worker", () => {
  for (const f of ["docs/DEPLOY.md", "docs/CTO-BRIEF.md"]) {
    const t = readFileSync(join(ROOT, f), "utf8");
    assert.match(t, /0020_lead_notify\.sql[^\n]{0,200}\bFIRST\b[^\n]{0,200}\b(then|before)\b[^\n]{0,80}(Worker|deploy)/, f);
  }
});

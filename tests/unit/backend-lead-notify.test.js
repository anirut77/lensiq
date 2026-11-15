"use strict";
// tests/unit/backend-lead-notify.test.js — "LINE lead notification is never silent" (owner order 2026-11-15).
// FIXED TEST SET written before the build; sha256 in evals-locks/lead-notify.sha256 (~/LENSIQ-field/evals/lead-notify/).
// Production evidence: LEAD_NOTIFY_LINE_TO was set, two leads arrived, no `lead:line` row: the push was skipped silently.
//   1. every skip reason is recorded on the lead with the secret NAME and a reason code (never the value):
//      missing, whitespace, too_short (token); missing, starts_with_at, whitespace, wrong_length, not_u32hex (recipient)
//   2. a trailing space / line break around a good value is trimmed by the Worker: not a failure
//   3. a push failure records the LINE HTTP status (0 = network / timeout); the daily cap records "capped"; a success
//      records "sent" with its time
//   4. the result is recorded once per lead (the first result is never overwritten)
//   5. GET /admin/api/leads/notify (owner sign-in): state ok | off | failing | capped | unconfirmed, live config problems
//      (names + reason codes), the latest lead's result, the last success time; 401 without sign-in
//   6. the inbox list and the single view carry each lead's notify state (badge in the admin page)
//   7. no secret value (or a 12-character piece of it) in any D1 row, log line or API response
// Synthetic data only; in-memory D1; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "n".repeat(40);
const ADMIN_PW = "lead notify passphrase 2026";
const KEK = Buffer.alloc(32, 7).toString("base64");
// canary secret values: none of these (nor a 12-character piece of them) may ever appear in a row, a log line or a response
const TOKEN = "CANARYlinetoken" + "Qx7".repeat(20);
const TO = "U" + "5a5b5c5d5e5f".repeat(2) + "a1b2c3d4";
const LEAD = { name: "ผู้ขอ แจ้งเตือน", org: "บริษัท แจ้งเตือน", email: "notify@shop.example", phone: "0812345699", interest: "exam", message: "ขอใบเสนอราคา", consent: true };

const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.map(String).join(" ")); };
test.after(() => { console.log = origLog; });

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  const net = { line: [], lineStatus: 200, throwLine: false };
  const fetchStub = async (url, init = {}) => {
    if (/turnstile\/v0\/siteverify$/.test(String(url))) return new Response(JSON.stringify({ success: true, action: "lead", hostname: "site.example" }));
    if (String(url).startsWith("https://api.line.me/")) {
      net.line.push({ url: String(url), body: String(init.body || "") });
      if (net.throwLine) throw new Error("network down");
      return new Response("{}", { status: net.lineStatus });
    }
    throw new Error("unexpected network call: " + url);
  };
  const texts = [];
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, origin: o.origin, ip: o.ip }), env, { fetch: fetchStub });
    let j = null, text = null;
    try { text = await r.clone().text(); texts.push(text); j = JSON.parse(text); } catch { /* empty */ }
    return { status: r.status, j, text };
  };
  let tok = null;
  const A = async (path, o = {}) => {
    if (!tok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + tok, ...(o.headers || {}) } });
  };
  let ipn = 1;
  const post = () => call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: LEAD, ip: "198.51.100." + (ipn++) });
  const row = async id => {
    const r = await env.DB.prepare("SELECT notify_state, notify_detail, notify_at FROM leads WHERE id = ?1").bind(id).first();
    return r ? { notify_state: r.notify_state, notify_detail: r.notify_detail, notify_at: r.notify_at } : r;
  };
  const dump = async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(t => t.name);
    let s = "";
    for (const t of tables) s += JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results || []) + "\n";
    return s;
  };
  return { call, A, env, net, post, row, dump, texts };
}

/** no value, nor any 12-character piece of it, in the text */
function noValue(text, values, where) {
  for (const v of values) {
    const s = String(v).trim();
    for (let i = 0; i + 12 <= s.length; i += 4) assert.ok(!String(text).includes(s.slice(i, i + 12)), `${where}: a piece of a secret value leaked`);
  }
}

const SKIPS = [
  [{}, "LINE_CHANNEL_ACCESS_TOKEN:missing,LEAD_NOTIFY_LINE_TO:missing"],
  [{ LEAD_NOTIFY_LINE_TO: TO }, "LINE_CHANNEL_ACCESS_TOKEN:missing"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN }, "LEAD_NOTIFY_LINE_TO:missing"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: "   ", LEAD_NOTIFY_LINE_TO: TO }, "LINE_CHANNEL_ACCESS_TOKEN:missing"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN.slice(0, 20) + " " + TOKEN.slice(20), LEAD_NOTIFY_LINE_TO: TO }, "LINE_CHANNEL_ACCESS_TOKEN:whitespace"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: "CANARYshort", LEAD_NOTIFY_LINE_TO: TO }, "LINE_CHANNEL_ACCESS_TOKEN:too_short"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: "@632yliiw" }, "LEAD_NOTIFY_LINE_TO:starts_with_at"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO.slice(0, 16) + " " + TO.slice(16) }, "LEAD_NOTIFY_LINE_TO:whitespace"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO.slice(0, 30) }, "LEAD_NOTIFY_LINE_TO:wrong_length"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO + "ab" }, "LEAD_NOTIFY_LINE_TO:wrong_length"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO.toUpperCase() }, "LEAD_NOTIFY_LINE_TO:not_u32hex"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: "C" + TO.slice(1) }, "LEAD_NOTIFY_LINE_TO:not_u32hex"],
  [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: "U" + "g".repeat(32) }, "LEAD_NOTIFY_LINE_TO:not_u32hex"]
];

test("0. the canary recipient has the real shape (U + 32 lowercase hex)", () => {
  assert.match(TO, /^U[0-9a-f]{32}$/);
});

test("1. every skip reason is recorded on the lead: secret name + reason code, no LINE call, no value anywhere", async () => {
  let n = 0;
  for (const [vars, detail] of SKIPS) {
    const s = await setup(vars);
    const l0 = logs.length;
    const r = await s.post();
    assert.equal(r.status, 201, detail);
    assert.equal(s.net.line.length, 0, "no LINE call: " + detail);
    const row = await s.row(r.j.id);
    assert.equal(row.notify_state, "skipped", detail);
    assert.equal(row.notify_detail, detail);
    assert.ok(Math.abs(row.notify_at - Date.now() / 1000) < 60, "time recorded");
    const lines = logs.slice(l0).join("\n");
    assert.match(lines, /alert\.lead_line_skipped/, "a log line says the push was skipped: " + detail);
    for (const part of detail.split(",")) assert.ok(lines.includes(part), "the log names the secret and the reason: " + part);
    const values = Object.values(vars).filter(v => String(v).trim().length >= 12);
    noValue(await s.dump(), values, "D1");
    noValue(lines, values, "log");
    noValue(s.texts.join("\n"), values, "API");
    const st = await s.A("/leads/notify");
    assert.equal(st.status, 200);
    assert.equal(st.j.state, "off", detail);
    assert.equal(st.j.problems.map(p => p.secret + ":" + p.reason).join(","), detail, "live config check names the same secret + reason");
    assert.deepEqual(st.j.last, { state: "skipped", detail, at: row.notify_at });
    assert.equal(st.j.last_sent_at, null);
    noValue(st.text, values, "status API");
    n++;
  }
  assert.equal(n, 13);
});

test("2. the Worker trims spaces and line breaks around a good value: a trailing newline is not a failure", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: "  " + TOKEN + "\r\n", LEAD_NOTIFY_LINE_TO: "\t" + TO + "\n" });
  const r = await s.post();
  assert.equal(s.net.line.length, 1);
  assert.equal(JSON.parse(s.net.line[0].body).to, TO, "trimmed recipient");
  assert.equal((await s.row(r.j.id)).notify_state, "sent");
  assert.deepEqual((await s.A("/leads/notify")).j.problems, []);
});

test("3. success records 'sent' with its time; failures record the LINE status (0 = network); the cap records 'capped'", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_LINE_DAY: "3" });
  const l0 = logs.length;
  const ok = await s.post();
  const a = await s.row(ok.j.id);
  assert.equal(a.notify_state, "sent");
  assert.equal(a.notify_detail, "http_200");
  assert.ok(Math.abs(a.notify_at - Date.now() / 1000) < 60);
  let st = await s.A("/leads/notify");
  assert.equal(st.j.state, "ok");
  assert.equal(st.j.last_sent_at, a.notify_at);
  assert.deepEqual(st.j.problems, []);

  s.net.lineStatus = 401;
  const f1 = await s.post();
  assert.equal(f1.status, 201, "a LINE failure never fails the request");
  assert.deepEqual({ ...(await s.row(f1.j.id)), notify_at: 0 }, { notify_state: "failed", notify_detail: "http_401", notify_at: 0 });
  st = await s.A("/leads/notify");
  assert.equal(st.j.state, "failing");
  assert.equal(st.j.last.detail, "http_401");
  assert.equal(st.j.last_sent_at, a.notify_at, "the last success time stays visible");

  s.net.throwLine = true;
  const f2 = await s.post();
  assert.equal((await s.row(f2.j.id)).notify_state, "failed");
  assert.equal((await s.row(f2.j.id)).notify_detail, "http_0", "network error / timeout = status 0");
  s.net.throwLine = false; s.net.lineStatus = 200;

  const c = await s.post();
  assert.equal(s.net.line.length, 3, "cap of 3 reached: no fourth push");
  const cr = await s.row(c.j.id);
  assert.equal(cr.notify_state, "capped");
  assert.equal(cr.notify_detail, "cap_3");
  st = await s.A("/leads/notify");
  assert.equal(st.j.state, "capped");
  const lines = logs.slice(l0).join("\n");
  assert.match(lines, /alert\.lead_line_failed/);
  assert.match(lines, /alert\.lead_line_capped/);
  noValue(await s.dump(), [TOKEN, TO], "D1");
  noValue(lines, [TOKEN, TO], "log");
  noValue(s.texts.join("\n"), [TOKEN, TO], "API");
});

test("4. recorded once per lead: a second result never overwrites the first", async () => {
  const { notifyLine } = await import(B + "leads.js");
  const s = await setup({ LEAD_NOTIFY_LINE_TO: TO });
  const r = await s.post();
  const first = await s.row(r.j.id);
  assert.equal(first.notify_state, "skipped");
  s.env.LINE_CHANNEL_ACCESS_TOKEN = TOKEN;
  await notifyLine(s.env, r.j.id, Math.floor(Date.now() / 1000), async () => new Response("{}", { status: 200 }));
  assert.deepEqual(await s.row(r.j.id), first, "first result kept");
  const n = await s.env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first();
  assert.equal(Number(n.n), 1);
});

test("5. status route: owner sign-in only; 'unconfirmed' when the config is fixed but no push has been confirmed yet", async () => {
  const s = await setup({ LEAD_NOTIFY_LINE_TO: "@632yliiw" });
  const no = await s.call("/admin/api/leads/notify", { origin: "https://api.example" });
  assert.equal(no.status, 401);
  const m = await s.call("/admin/api/leads/notify", { origin: "https://api.example", headers: { Authorization: "Bearer " + "m".repeat(43) } });
  assert.equal(m.status, 401);
  let st = await s.A("/leads/notify");
  assert.equal(st.j.state, "off");
  assert.equal(st.j.last, null, "no lead yet");
  assert.deepEqual(st.j.problems, [{ secret: "LINE_CHANNEL_ACCESS_TOKEN", reason: "missing" }, { secret: "LEAD_NOTIFY_LINE_TO", reason: "starts_with_at" }]);
  await s.post();
  s.env.LINE_CHANNEL_ACCESS_TOKEN = TOKEN; s.env.LEAD_NOTIFY_LINE_TO = TO;
  st = await s.A("/leads/notify");
  assert.equal(st.j.state, "unconfirmed", "config fixed, latest lead was skipped before the fix");
  assert.deepEqual(Object.keys(st.j).sort(), ["last", "last_sent_at", "problems", "state"]);
  noValue(st.text, [TOKEN, TO], "status API");
});

test("6. the inbox list and the single view carry each lead's notify state (badge)", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO });
  const ok = await s.post();
  s.net.lineStatus = 500;
  const bad = await s.post();
  s.env.LEAD_NOTIFY_LINE_TO = "";
  const skip = await s.post();
  const list = (await s.A("/leads?status=all")).j.leads;
  const by = Object.fromEntries(list.map(l => [l.id, l.notify]));
  assert.deepEqual(by, { [ok.j.id]: "sent", [bad.j.id]: "failed", [skip.j.id]: "skipped" });
  const one = (await s.A("/leads/" + bad.j.id)).j.lead;
  assert.equal(one.notify, "failed");
  assert.equal(one.notify_detail, "http_500");
  noValue(s.texts.join("\n"), [TOKEN, TO], "API");
});

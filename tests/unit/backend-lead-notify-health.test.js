"use strict";
// tests/unit/backend-lead-notify-health.test.js — lead-notify-health (owner night order A3, 2026-11-20): the admin page
// shows the LINE notification health (configured / last success / last failure) without any secret value, checks the
// format of the notify settings, and flags failed notifications. FIXED TEST SET, hash-locked in
// evals-locks/seller-docs.sha256 (~/LENSIQ-field/evals/seller-docs/) BEFORE any product code. In-memory D1; the LINE
// API is a stub (no real LINE call: any other host throws); synthetic canary secret values only.
// Switch: Worker var LEAD_NOTIFY_HEALTH, "on" (trimmed, any case) enables it; "off" in backend/wrangler.toml for the
// template (customer) build and the test deployment (live). Off = GET /admin/api/leads/notify answers exactly as before.
//   N1  switch off: the answer has the four existing keys only (state, problems, last, last_sent_at)
//   N2  on: health.settings = one row per notify setting (the two LINE secrets + LEAD_NOTIFY_LINE_DAY): configured,
//       format_ok and a reason code; the day cap also its effective value. Names and codes only, never a value
//   N3  on: last success time and the last failure (state, short code, time) from the recorded results; a failure is
//       failed | skipped | capped | never recorded (pending past NOTIFY_STUCK_S)
//   N4  on: failures since the last success and in the last 7 days are counted; flagged while any failure is newer than
//       the last success or a LINE secret is missing / malformed; a newer success clears the flag (last failure stays shown)
//   N5  the real lead flow with a stubbed LINE answer (500, network error) lands in the health answer; LINE is called
//       only through the stub
//   N6  owner only (existing admin access): no session 401; a restricted (reviewer / try-on) account 403 or 404; no
//       secret value nor a 12-character piece of one in any answer, D1 row or log line
//   N7  backend/wrangler.toml: LEAD_NOTIFY_HEALTH = "off" in [vars] and [env.test.vars]
//   N8  admin page wording: every adl.nh.* key used by admin-lead-notify.js is in i18n/en-admin.js and i18n/zh-admin.js
//       (no Thai left) and admin.html has the hidden #adlNotifyHealth box in the inbox card
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "h".repeat(40);
const ADMIN_PW = "lead notify health passphrase 2026";
const ACC_PW = "a restricted account passphrase 2026";
const KEK = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "CANARYhealthtoken" + "Zr8".repeat(20);
const TO = "U" + "0f1e2d3c4b5a".repeat(2) + "9a8b7c6d";
const LEAD = { name: "Health Test", org: "Example Co", email: "health@shop.example", interest: "exam", message: "quote", consent: true };
const nowS = () => Math.floor(Date.now() / 1000);

const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.map(String).join(" ")); };
test.after(() => { console.log = origLog; });

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, TRYON: "on", ...vars });
  const net = { line: 0, lineStatus: 200, throwLine: false, other: [] };
  const fetchStub = async (url, init = {}) => {
    if (/turnstile\/v0\/siteverify$/.test(String(url))) return new Response(JSON.stringify({ success: true, action: "lead", hostname: "site.example" }));
    if (String(url).startsWith("https://api.line.me/")) {
      net.line++;
      if (net.throwLine) throw new Error("network down");
      return new Response("{}", { status: net.lineStatus });
    }
    net.other.push(String(url));
    throw new Error("unexpected network call: " + url);
  };
  const texts = [];
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, ip: o.ip }), env, { fetch: fetchStub });
    const text = await r.text();
    texts.push(text);
    let j = null; try { j = JSON.parse(text); } catch { /* empty */ }
    return { status: r.status, j, text };
  };
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  const A = (path, o = {}) => call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + (o.token || tok), ...(o.headers || {}) } });
  let ipn = 1;
  const post = () => call("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: LEAD, ip: "198.51.100." + (ipn++) });
  let n = 0;
  /** a lead row with a recorded result @param {string|null} state @param {string|null} detail @param {number|null} at @param {number} [created] */
  const seed = async (state, detail, at, created) => {
    const id = (++n).toString(16).padStart(24, "0");
    await env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status, " +
      "notify_state, notify_detail, notify_at) VALUES (?1, ?2, 'exam', NULL, 'index', 'Seed', 'Example Co', 'seed@shop.example', NULL, NULL, 'en', 'l1', 'new', ?3, ?4, ?5)")
      .bind(id, created || at || nowS(), state, detail, at).run();
    return id;
  };
  const dump = async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map(t => t.name);
    let s = "";
    for (const t of tables) s += JSON.stringify((await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results || []) + "\n";
    return s;
  };
  const totp = (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(nowS() / 30) + d);
  /** a restricted account (reviewer / try-on role) signed in with bearer; the owner turns on 2-step verification first */
  let ownerSecret = null;
  const restricted = async (username, role) => {
    if (!ownerSecret) {
      const st = await A("/totp/setup", { method: "POST", body: { password: ADMIN_PW } });
      ownerSecret = st.j.secret;
      assert.equal((await A("/totp/enable", { method: "POST", body: { code: await totp(ownerSecret, -1) } })).status, 200);
    }
    await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW, totp: await totp(ownerSecret) } })).status, 200);
    const c = await A("/reviewers", { method: "POST", body: role === undefined ? { username } : { username, role } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: ACC_PW } });
    await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
    const l = await call("/admin/api/login", { method: "POST", body: { username, password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, JSON.stringify(l.j));
    return l.j.token;
  };
  return { env, call, A, post, seed, net, dump, texts, restricted };
}

function noValue(text, values, where) {
  for (const v of values) {
    const s = String(v).trim();
    for (let i = 0; i + 12 <= s.length; i += 4) assert.ok(!String(text).includes(s.slice(i, i + 12)), `${where}: a piece of a secret value leaked`);
  }
}
const setting = (h, name) => h.settings.find(x => x.name === name);

test("N1: switch off (default and any value but 'on'): the status answer is unchanged (four keys, no health)", async () => {
  for (const v of [undefined, "", "off", "true", "1"]) {
    const s = await setup(v === undefined ? { LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO } : { LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_HEALTH: v });
    await s.seed("failed", "http_401", nowS() - 60);
    const r = await s.A("/leads/notify");
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.j).sort(), ["last", "last_sent_at", "problems", "state"], JSON.stringify(v));
  }
  const on = await setup({ LEAD_NOTIFY_HEALTH: " On " });
  assert.ok((await on.A("/leads/notify")).j.health, "' On ' switches it on");
});

test("N2: on: one row per notify setting with configured / format_ok / reason (names and codes only)", async () => {
  const cases = [
    [{}, { LINE_CHANNEL_ACCESS_TOKEN: [false, false, "missing"], LEAD_NOTIFY_LINE_TO: [false, false, "missing"], LEAD_NOTIFY_LINE_DAY: [false, true, null, 50] }, false],
    [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: "@632yliiw", LEAD_NOTIFY_LINE_DAY: "20" },
      { LINE_CHANNEL_ACCESS_TOKEN: [true, true, null], LEAD_NOTIFY_LINE_TO: [true, false, "starts_with_at"], LEAD_NOTIFY_LINE_DAY: [true, true, null, 20] }, false],
    [{ LINE_CHANNEL_ACCESS_TOKEN: "CANARYshort", LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_LINE_DAY: "20abc" },
      { LINE_CHANNEL_ACCESS_TOKEN: [true, false, "too_short"], LEAD_NOTIFY_LINE_TO: [true, true, null], LEAD_NOTIFY_LINE_DAY: [true, false, "not_integer", 20] }, false],
    [{ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO.toUpperCase(), LEAD_NOTIFY_LINE_DAY: "5000" },
      { LINE_CHANNEL_ACCESS_TOKEN: [true, true, null], LEAD_NOTIFY_LINE_TO: [true, false, "not_u32hex"], LEAD_NOTIFY_LINE_DAY: [true, false, "out_of_range", 50] }, false],
    [{ LINE_CHANNEL_ACCESS_TOKEN: " " + TOKEN + "\n", LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_LINE_DAY: " 0 " },
      { LINE_CHANNEL_ACCESS_TOKEN: [true, true, null], LEAD_NOTIFY_LINE_TO: [true, true, null], LEAD_NOTIFY_LINE_DAY: [true, false, "out_of_range", 50] }, true]
  ];
  for (const [vars, want, configured] of cases) {
    const s = await setup({ ...vars, LEAD_NOTIFY_HEALTH: "on" });
    const r = await s.A("/leads/notify");
    assert.equal(r.status, 200);
    const h = r.j.health;
    assert.deepEqual(h.settings.map(x => x.name), ["LINE_CHANNEL_ACCESS_TOKEN", "LEAD_NOTIFY_LINE_TO", "LEAD_NOTIFY_LINE_DAY"]);
    for (const [name, [c, ok, reason, eff]] of Object.entries(want)) {
      const x = setting(h, name);
      assert.equal(x.configured, c, name + " configured " + JSON.stringify(vars));
      assert.equal(x.format_ok, ok, name + " format_ok " + JSON.stringify(vars));
      assert.equal(x.reason, reason, name + " reason " + JSON.stringify(vars));
      assert.equal(x.kind, name === "LEAD_NOTIFY_LINE_DAY" ? "var" : "secret");
      if (eff !== undefined) assert.equal(x.effective, eff, name + " effective");
      else assert.ok(!("effective" in x), "no effective value for a secret");
      assert.deepEqual(Object.keys(x).filter(k => !["name", "kind", "configured", "format_ok", "reason", "effective"].includes(k)), [], "no other field");
    }
    assert.equal(h.configured, configured, "both LINE secrets set and well-formed: " + JSON.stringify(vars));
    noValue(r.text, [TOKEN, TO, TO.toUpperCase()], "health answer");
  }
});

test("N3 + N4: last success, last failure, failure counts and the flag", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_HEALTH: "on" });
  let h = (await s.A("/leads/notify")).j.health;
  assert.deepEqual([h.last_success_at, h.last_failure, h.failures_since_success, h.failures_7d, h.flagged], [null, null, 0, 0, false], "nothing recorded yet");
  const t = nowS();
  await s.seed("failed", "http_500", t - 10 * 86400);          // older than 7 days, before the success
  await s.seed(null, null, null, t - 9 * 86400);                // pre-0020 row: not a failure
  await s.seed("sent", "http_200", t - 5 * 3600);
  await s.seed("skipped", "LEAD_NOTIFY_LINE_TO:missing", t - 3 * 3600);
  await s.seed("capped", "cap_50", t - 2.5 * 3600);
  await s.seed("failed", "http_401", t - 2 * 3600);
  await s.seed("pending", null, null, t - 3600);                // never recorded: counts as a failure ("unknown")
  await s.seed("pending", null, null, t - 5);                   // still in flight: not counted yet
  h = (await s.A("/leads/notify")).j.health;
  assert.equal(h.last_success_at, t - 5 * 3600);
  assert.deepEqual(h.last_failure, { state: "unknown", detail: "unrecorded", at: t - 3600 }, "the newest failure: the never-recorded one");
  assert.equal(h.failures_since_success, 4, "skipped + capped + failed + unknown after the success");
  assert.equal(h.failures_7d, 4, "the 10-day-old failure is outside 7 days");
  assert.equal(h.flagged, true);
  await s.env.DB.prepare("DELETE FROM leads WHERE notify_state = 'pending'").run();
  h = (await s.A("/leads/notify")).j.health;
  assert.deepEqual(h.last_failure, { state: "failed", detail: "http_401", at: t - 2 * 3600 });
  assert.equal(h.failures_since_success, 3);
  await s.seed("sent", "http_200", t - 60);
  h = (await s.A("/leads/notify")).j.health;
  assert.equal(h.last_success_at, t - 60);
  assert.equal(h.failures_since_success, 0);
  assert.equal(h.failures_7d, 3);
  assert.equal(h.flagged, false, "a newer success clears the flag");
  assert.deepEqual(h.last_failure, { state: "failed", detail: "http_401", at: t - 2 * 3600 }, "the last failure stays shown");
  // a malformed secret flags even with a newer success
  s.env.LEAD_NOTIFY_LINE_TO = "@632yliiw";
  h = (await s.A("/leads/notify")).j.health;
  assert.equal(h.configured, false);
  assert.equal(h.flagged, true);
});

test("N5: the real lead flow with a stubbed LINE answer lands in the health answer; LINE only through the stub", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_HEALTH: "on" });
  s.net.lineStatus = 200;
  assert.equal((await s.post()).status, 201);
  let h = (await s.A("/leads/notify")).j.health;
  assert.ok(h.last_success_at && Math.abs(h.last_success_at - nowS()) < 60);
  assert.equal(h.flagged, false);
  s.net.lineStatus = 500;
  assert.equal((await s.post()).status, 201);
  h = (await s.A("/leads/notify")).j.health;
  assert.equal(h.last_failure.state, "failed");
  assert.equal(h.last_failure.detail, "http_500");
  assert.equal(h.failures_since_success, 1);
  assert.equal(h.flagged, true);
  s.net.throwLine = true;
  assert.equal((await s.post()).status, 201);
  h = (await s.A("/leads/notify")).j.health;
  assert.equal(h.last_failure.detail, "http_0");
  assert.equal(h.failures_since_success, 2);
  assert.equal(s.net.line, 3, "three pushes, all to the stub");
  assert.deepEqual(s.net.other, [], "no other outbound call");
});

test("N6: owner only; no secret value in any answer, row or log line", async () => {
  const s = await setup({ LINE_CHANNEL_ACCESS_TOKEN: TOKEN, LEAD_NOTIFY_LINE_TO: TO, LEAD_NOTIFY_HEALTH: "on" });
  const l0 = logs.length;
  s.net.lineStatus = 401;
  await s.post();
  assert.equal((await s.call("/admin/api/leads/notify")).status, 401, "no session");
  for (const [u, role] of [["healthrev", undefined], ["healthtry", "tryon_admin"]]) {
    const tk = await s.restricted(u, role);
    const r = await s.A("/leads/notify", { token: tk });
    assert.ok(r.status === 403 || r.status === 404, u + ": " + r.status);
    assert.ok(!r.j || !r.j.health, u + ": no health for a restricted account");
  }
  const r = await s.A("/leads/notify");
  assert.equal(r.status, 200);
  assert.ok(r.j.health);
  noValue(s.texts.join("\n"), [TOKEN, TO], "API");
  noValue(await s.dump(), [TOKEN, TO], "D1");
  noValue(logs.slice(l0).join("\n"), [TOKEN, TO], "log");
});

test("N7: backend/wrangler.toml keeps LEAD_NOTIFY_HEALTH off for the template (customer) build and the test deployment", () => {
  const w = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  // section headers at the start of a line (relock1: the file's header comment also names "[env.test]")
  const top = w.slice(w.indexOf("\n[vars]"), w.indexOf("\n[env.test]"));
  const tst = w.slice(w.indexOf("\n[env.test.vars]"));
  assert.ok(top.length > 100 && tst.length > 100, "both sections found");
  for (const [name, sec] of [["[vars]", top], ["[env.test.vars]", tst]]) {
    assert.match(sec, /^LEAD_NOTIFY_HEALTH = "off"$/m, name);
    assert.doesNotMatch(sec, /^LEAD_NOTIFY_HEALTH = "on"/im, name);
  }
});

test("N8: every adl.nh.* label is in English and Chinese; admin.html has the hidden health box in the inbox card", () => {
  const js = readFileSync(join(ROOT, "admin-lead-notify.js"), "utf8");
  const keys = [...new Set([...js.matchAll(/G\("(adl\.nh\.[\w.]+)"/g)].map(x => x[1]))];
  assert.ok(keys.length >= 8, "labels: " + keys);
  const en = readFileSync(join(ROOT, "i18n", "en-admin.js"), "utf8"), zh = readFileSync(join(ROOT, "i18n", "zh-admin.js"), "utf8");
  for (const k of keys) {
    const re = new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"([^"]+)"`);
    const e = re.exec(en), z = re.exec(zh);
    assert.ok(e && !/[ก-๛]/.test(e[1]), "en " + k);
    assert.ok(z && !/[ก-๛]/.test(z[1]) && /[㐀-鿿]/.test(z[1]), "zh " + k);
  }
  const html = readFileSync(join(ROOT, "admin.html"), "utf8");
  const box = /<div[^>]*id="adlNotifyHealth"[^>]*>/.exec(html);
  assert.ok(box, "#adlNotifyHealth in admin.html");
  assert.match(box[0], /\bhidden\b/, "hidden until the Worker reports health");
  assert.ok(html.indexOf('id="adlNotifyHealth"') > html.indexOf('id="adlList"') && html.indexOf('id="adlNotifyHealth"') < html.indexOf('id="adlDetail"'), "in the inbox card");
});

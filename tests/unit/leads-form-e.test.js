// tests/unit/leads-form-e.test.js — Part E of the owner order 2026-11-14 (quote form, defect W-001): a request that was
// not sent must never look like success. FIXED TEST SET, locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e/ and
// evals-locks/lead-form-e.sha256. Runs lensiq-leads.js in a Node vm with a fake window (no network, no browser).
//   U1 submit(): only a 2xx from POST /v1/leads is {via:"api", ok:true}; 403 / 5xx / network / offline are ok:false
//   U2 flushQueue(): every queued request is sent with its own Turnstile token; removed ONLY after a 2xx
//   U3 flushQueue(): no Turnstile token (site key set) -> nothing sent, nothing removed
//   U4 flushQueue(): form switched off -> nothing sent, nothing removed
//   U5 automatic retry: the queue is retried on page load and when the device comes back online
//   U6 the "not sent yet" texts and the retry button exist in TH / EN / ZH
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const KEY = "lq-leads";

/**
 * A fake browser window with lensiq-leads.js loaded.
 * @param {{form?: any, statuses?: any[], token?: string, online?: boolean, queue?: any[], sitekey?: string}} o
 */
function makeWindow(o = {}) {
  const store = new Map();
  if (o.queue) store.set(KEY, JSON.stringify(o.queue));
  const calls = [], tokens = [], handlers = {};
  const statuses = (o.statuses || [201]).slice();
  const w = {
    LENSIQ_LEADS_FORM: o.form === undefined ? true : o.form,
    LENSIQ_TURNSTILE_SITEKEY: o.sitekey === undefined ? "1x00000000000000000000AA" : o.sitekey,
    LENSIQ_SELLER: { quote_line: "@632yliiw", line: "", email: "" },
    navigator: { onLine: o.online === undefined ? true : o.online },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); }
    },
    LQApi: {
      enabled: () => true,
      turnstile: a => { tokens.push(a); return Promise.resolve(o.token === undefined ? "tok-" + tokens.length : o.token); },
      call: (p, opt) => {
        calls.push({ p, opt });
        const s = statuses.length > 1 ? statuses.shift() : statuses[0];
        if (s === "network") return Promise.resolve({ ok: false, status: 0, j: null });
        return Promise.resolve({ ok: s >= 200 && s < 300, status: s, j: {} });
      }
    },
    document: { querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }) },
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    removeEventListener: () => {},
    dispatchEvent: () => true,
    setTimeout, clearTimeout, Promise, JSON, Date
  };
  w.window = w;
  vm.runInNewContext(read("lensiq-leads.js"), w);
  const queue = () => { const v = store.get(KEY); return v ? JSON.parse(v) : []; };
  const fire = async t => { for (const f of handlers[t] || []) f({ type: t }); await new Promise(r => setTimeout(r, 50)); };
  return { w, calls, tokens, queue, fire, handlers };
}
const lead = (id, msg) => ({ id, createdAt: "2026-11-14T10:00:00.000Z", name: "สมชาย ทดสอบ", phone: "0812345678", interest: "exam", message: msg || "ต้องการใบเสนอราคา " + id });

test("U1 submit(): only a 2xx from /v1/leads is {via:'api', ok:true}", async () => {
  for (const s of [200, 201, 202]) {
    const { w, calls } = makeWindow({ statuses: [s] });
    const r = await w.LQLeads.submit(lead("a"));
    assert.equal(r.via, "api", "status " + s);
    assert.equal(r.ok, true, "status " + s);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].p, "/v1/leads");
    assert.ok(calls[0].opt.headers["X-Turnstile-Token"], "sent with a Turnstile token");
  }
  for (const [s, reason] of [[403, "turnstile"], [500, "server"], [503, "server"], [400, "server"], ["network", "network"]]) {
    const { w } = makeWindow({ statuses: [s] });
    const r = await w.LQLeads.submit(lead("a"));
    assert.equal(r.via, "api", "status " + s);
    assert.equal(r.ok, false, "status " + s + " must not count as sent");
    assert.equal(r.reason, reason, "status " + s);
    assert.match(r.line || "", /^https:\/\/line\.me\/R\/ti\/p\/(%40|@)632yliiw$/, "LINE offered on " + s);
  }
});

test("U1 submit(): offline device -> not sent, reason 'offline', no bot check and no POST", async () => {
  const { w, calls, tokens } = makeWindow({ online: false });
  const r = await w.LQLeads.submit(lead("a"));
  assert.equal(r.ok, false);
  assert.equal(r.via, "api");
  assert.equal(r.reason, "offline");
  assert.equal(calls.length, 0, "no POST while offline");
  assert.equal(tokens.length, 0, "no Turnstile check while offline");
});

test("U2 flushQueue(): each queued request gets its own token; removed only after a 2xx", async () => {
  const { w, calls, tokens, queue } = makeWindow({ queue: [lead("a"), lead("b"), lead("c")], statuses: [500, 201, "network"] });
  assert.equal(typeof w.LQLeads.flushQueue, "function", "LQLeads.flushQueue exists");
  const r = await w.LQLeads.flushQueue();
  assert.equal(calls.length, 3, "all three tried");
  assert.equal(tokens.length, 3, "one Turnstile check per request");
  const toks = calls.map(c => c.opt.headers["X-Turnstile-Token"]);
  assert.equal(new Set(toks).size, 3, "a fresh token each time: " + toks);
  assert.deepEqual(queue().map(x => x.id), ["a", "c"], "only the 2xx one left the queue");
  assert.deepEqual(Array.from(r.sent), ["b"]);
  assert.equal(r.left, 2);
  assert.equal(calls[1].opt.body.message, "ต้องการใบเสนอราคา b", "the queued text is what is sent");
  assert.equal(calls[1].opt.body.consent, true);
});

test("U2 flushQueue(): 403 (bot check refused by the server) keeps the request", async () => {
  const { w, queue } = makeWindow({ queue: [lead("a")], statuses: [403] });
  const r = await w.LQLeads.flushQueue();
  assert.equal(queue().length, 1);
  assert.equal(r.sent.length, 0);
});

test("U3 flushQueue(): Turnstile gives no token -> nothing sent, nothing removed", async () => {
  const { w, calls, queue } = makeWindow({ queue: [lead("a"), lead("b")], token: "" });
  const r = await w.LQLeads.flushQueue();
  assert.equal(calls.length, 0, "never POST without a token when a site key is set");
  assert.equal(queue().length, 2);
  assert.equal(r.sent.length, 0);
});

test("U4 flushQueue(): form switched off -> nothing sent, nothing removed", async () => {
  const { w, calls, tokens, queue } = makeWindow({ form: false, queue: [lead("a")] });
  await w.LQLeads.flushQueue();
  assert.equal(calls.length + tokens.length, 0);
  assert.equal(queue().length, 1);
});

test("U5 automatic retry on page load; removed after the 2xx", async () => {
  const { calls, queue, fire } = makeWindow({ queue: [lead("a")], statuses: [201] });
  assert.equal(calls.length, 0, "nothing before load");
  await fire("load");
  assert.equal(calls.length, 1, "retried on load");
  assert.equal(queue().length, 0, "removed after the 2xx");
});

test("U5 automatic retry when the device comes back online; a 5xx keeps it for the next try", async () => {
  const env = makeWindow({ queue: [lead("a")], statuses: [500, 201], online: false });
  await env.fire("load");
  assert.equal(env.calls.length, 0, "no send while offline");
  env.w.navigator.onLine = true;
  await env.fire("online");
  assert.equal(env.calls.length, 1, "retried when back online");
  assert.equal(env.queue().length, 1, "a 5xx keeps it");
  await env.fire("online");
  assert.equal(env.calls.length, 2);
  assert.equal(env.queue().length, 0, "the 2xx removes it");
});

test("U5 no automatic send with an empty queue or with the form off", async () => {
  const a = makeWindow({ queue: [] });
  await a.fire("load"); await a.fire("online");
  assert.equal(a.calls.length + a.tokens.length, 0);
  const b = makeWindow({ form: false, queue: [lead("a")] });
  await b.fire("load"); await b.fire("online");
  assert.equal(b.calls.length + b.tokens.length, 0);
});

test("U6 'not sent yet' texts and the retry button in TH / EN / ZH", () => {
  const home = read("home.js");
  const en = read("i18n/en-common.js"), zh = read("i18n/zh-common.js");
  const val = (src, k) => { const m = new RegExp('"' + k.replace(/\./g, "\\.") + '":\\s*"([^"]*)"').exec(src); return m ? m[1] : null; };
  const th = k => { const m = new RegExp('T\\("' + k.replace(/\./g, "\\.") + '",\\s*"([^"]*)"').exec(home); return m ? m[1] : null; };
  for (const k of ["home.err.send", "home.err.ts", "home.err.offline"]) {
    assert.match(th(k) || "", /^ยังไม่ได้ส่ง/, "TH " + k);
    assert.match(val(en, k) || "", /^Not sent yet/, "EN " + k);
    assert.match(val(zh, k) || "", /^尚未发送/, "ZH " + k);
  }
  assert.ok((th("home.retry") || "").length > 2, "TH retry button");
  assert.ok((val(en, "home.retry") || "").length > 2 && !/[฀-๿]/.test(val(en, "home.retry")), "EN retry button");
  assert.match(val(zh, "home.retry") || "", /[一-鿿]/, "ZH retry button");
});

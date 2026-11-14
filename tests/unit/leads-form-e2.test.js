// tests/unit/leads-form-e2.test.js — Part E round 2 (independent review of form-e @ ba9634c, 2026-11-15). FIXED TEST SET,
// locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e2/ and evals-locks/lead-form-e2.sha256.
//   R1 (medium) a "send again" / "send now" while the automatic retry is already posting the same request never posts it
//      twice: one POST per request id, and the late caller still gets {via:"api", ok:true}
//   R2 (low) a queued request keeps its source and lang; the retry sends them
//   R3 (low) pricing.html's notify form has its own failure wording (no "send again" button there) in TH / EN / ZH
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const KEY = "lq-leads";

/** fake window; LQApi.call is held until release() when hold is set */
function makeWindow(o = {}) {
  const store = new Map();
  if (o.queue) store.set(KEY, JSON.stringify(o.queue));
  const calls = [], handlers = {};
  let releases = [];
  const w = {
    LENSIQ_LEADS_FORM: true, LENSIQ_TURNSTILE_SITEKEY: "1x00000000000000000000AA",
    LENSIQ_SELLER: { quote_line: "@632yliiw", line: "", email: "" },
    navigator: { onLine: true },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } },
    LQApi: {
      enabled: () => true,
      turnstile: () => Promise.resolve("tok"),
      call: (p, opt) => {
        calls.push({ p, opt });
        const res = { ok: true, status: 201, j: {} };
        if (!o.hold) return Promise.resolve(res);
        return new Promise(r => releases.push(() => r(res)));
      }
    },
    document: { querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ setAttribute() {}, appendChild() {} }) },
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); },
    removeEventListener: () => {}, dispatchEvent: () => true,
    setTimeout, clearTimeout
  };
  w.window = w;
  vm.runInNewContext(read("lensiq-leads.js"), w);
  const release = () => { const r = releases; releases = []; r.forEach(f => f()); };
  const queue = () => { const v = store.get(KEY); return v ? JSON.parse(v) : []; };
  return { w, calls, release, queue };
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const lead = (id, extra) => Object.assign({ id, createdAt: "2026-11-15T10:00:00.000Z", name: "สมชาย ทดสอบ", phone: "0812345678", interest: "exam", message: "ข้อความ " + id }, extra || {});

test("R1 retry pressed while the automatic retry is posting the same request: one POST, both callers see ok", async () => {
  const { w, calls, release, queue } = makeWindow({ queue: [lead("a")], hold: true });
  const flush = w.LQLeads.flushQueue();
  await tick();
  assert.equal(calls.length, 1, "the automatic retry is posting");
  const again = w.LQLeads.submit(lead("a", { source: "index", lang: "th" }));
  await tick();
  release(); await tick(); release(); await tick();
  const r = await again, f = await flush;
  assert.equal(calls.length, 1, "exactly one POST for id a, got " + calls.length);
  assert.equal(r.via, "api"); assert.equal(r.ok, true, "the retry reports the confirmed send");
  assert.deepEqual(Array.from(f.sent), ["a"]);
  assert.equal(queue().length, 0);
});

test("R1 the queue box's 'send now' during an automatic retry: still one POST per request", async () => {
  const { w, calls, release } = makeWindow({ queue: [lead("a"), lead("b")], hold: true });
  const f1 = w.LQLeads.flushQueue();
  await tick();
  const f2 = w.LQLeads.flushQueue();
  for (let i = 0; i < 6; i++) { release(); await tick(); }
  await f1; await f2;
  const ids = calls.map(c => c.opt.body.message);
  assert.deepEqual(ids, ["ข้อความ a", "ข้อความ b"], "one POST each: " + JSON.stringify(ids));
});

test("R1 retry after the automatic retry already confirmed it: no second POST, ok", async () => {
  const { w, calls } = makeWindow({ queue: [lead("a")] });
  await w.LQLeads.flushQueue();
  assert.equal(calls.length, 1);
  const r = await w.LQLeads.submit(lead("a"));
  assert.equal(calls.length, 1, "not posted again");
  assert.equal(r.ok, true);
});

test("R1 a different request is still sent normally", async () => {
  const { w, calls } = makeWindow({ queue: [lead("a")] });
  await w.LQLeads.flushQueue();
  const r = await w.LQLeads.submit(lead("z"));
  assert.equal(calls.length, 2);
  assert.equal(r.ok, true);
});

test("R2 a queued request keeps source and lang; the automatic retry sends them", async () => {
  const { w, calls } = makeWindow();
  w.LQLeads.queue(lead("a", { source: "index", lang: "en" }));
  await w.LQLeads.flushQueue();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opt.body.source, "index");
  assert.equal(calls[0].opt.body.lang, "en");
});

test("R2 home.js puts source and lang into the request it queues", () => {
  const home = read("home.js");
  const m = /var lead = Object\.assign\(([\s\S]*?)\);\n/.exec(home);
  assert.ok(m, "lead object found");
  assert.match(m[1], /source:\s*"index"/, "source stored in the lead itself");
  assert.match(m[1], /lang:/, "lang stored in the lead itself");
});

test("R3 pricing notify form: own failure wording, no 'send again' instruction, TH / EN / ZH", () => {
  const js = read("pricing.js"), en = read("i18n/en-pricing.js"), zh = read("i18n/zh-pricing.js");
  assert.doesNotMatch(js, /T\("home\.err\.(ts|send)"/, "pricing.js no longer borrows the home form's texts");
  const th = k => { const x = new RegExp('T\\("' + k.replace(/\./g, "\\.") + '",\\s*"([^"]*)"').exec(js); return x ? x[1] : null; };
  const val = (src, k) => { const x = new RegExp('"' + k.replace(/\./g, "\\.") + '":\\s*"([^"]*)"').exec(src); return x ? x[1] : null; };
  for (const k of ["pr.err.ts", "pr.err.send"]) {
    const t = th(k), e = val(en, k), z = val(zh, k);
    assert.match(t || "", /^ยังไม่ได้ส่ง/, "TH " + k + ": " + t);
    assert.match(e || "", /^Not sent yet/, "EN " + k + ": " + e);
    assert.match(z || "", /^尚未发送/, "ZH " + k + ": " + z);
    assert.doesNotMatch(t, /ส่งอีกครั้ง/); assert.doesNotMatch(e, /send again/i); assert.doesNotMatch(z, /再次发送/);
    for (const s of [t, e, z]) assert.match(s, /LINE \{id\}/, "offers LINE: " + s);
  }
});

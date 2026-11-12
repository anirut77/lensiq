"use strict";
// tests/unit/leads-unknown-field.test.js — security review S1 (2026-11-12): the public quote form (POST /v1/leads) refuses
// every field it does not know, including names that exist on Object.prototype (constructor, toString, __proto__, ...).
// The check used `k in LIMITS`, which let those names through; it must be an own-property check. New test that only
// tightens the check (the locked set in ~/LENSIQ-field/evals/leads/locked.sha256 is unchanged).
// Synthetic data only; in-memory D1; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const PROTO_NAMES = ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
  "toLocaleString", "__proto__", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"];

async function setup() {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example" });
  const fetchStub = async url => {
    if (/turnstile\/v0\/siteverify$/.test(String(url))) return new Response(JSON.stringify({ success: true, action: "lead", hostname: "site.example" }));
    throw new Error("unexpected network call: " + url);
  };
  let n = 0;
  // the body is sent as raw JSON text so "__proto__" arrives as an own key, exactly as an attacker would send it
  const post = async text => {
    n++;
    const r = await handle(req("/v1/leads", { method: "POST", headers: { "X-Turnstile-Token": "tok" }, body: text, ip: "198.51.100." + n }), env, { fetch: fetchStub });
    let j = null; try { j = await r.json(); } catch { /* empty */ }
    return { status: r.status, j };
  };
  const count = async () => (await env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first()).n;
  return { post, count };
}

const base = { name: "ผู้ขอ ทดสอบ", email: "a@shop.example", interest: "exam", consent: true };
const withKey = (k, v) => JSON.stringify(base).slice(0, -1) + "," + JSON.stringify(k) + ":" + JSON.stringify(v) + "}";

test("a valid request is accepted (control)", async () => {
  const { post, count } = await setup();
  const r = await post(JSON.stringify(base));
  assert.equal(r.status, 201, JSON.stringify(r.j));
  assert.equal(await count(), 1);
});

test("Object.prototype names are unknown fields: 400 and nothing stored", async () => {
  const { post, count } = await setup();
  for (const k of PROTO_NAMES) {
    for (const v of ["x", 1, {}]) {
      const r = await post(withKey(k, v));
      assert.equal(r.status, 400, `${k}=${JSON.stringify(v)} must be refused, got ${r.status} ${JSON.stringify(r.j)}`);
      assert.match(String(r.j && r.j.error), /unknown field/, k);
    }
  }
  assert.equal(await count(), 0, "no request stored");
});

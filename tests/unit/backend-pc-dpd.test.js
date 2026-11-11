"use strict";
// tests/unit/backend-pc-dpd.test.js — backend/src/pc.js Health Canada Drug Product Database by DIN (round 17 P9 travel mode;
// design §4.4, OGL-Canada). Synthetic answers in the documented shape (read live on 2026-11-11: /drugproduct/?din= -> array,
// /status/?id= -> object); the network is never called. Covers: DIN only (8 digits), facts + link, a sponsor kept only when
// it is a company, a status call that fails leaves the product row, a 200 that is not an array is "could not check",
// the batch carries it, the credit names the licence and says Health Canada does not endorse LENSIQ.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const jres = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
function upstream(handler) {
  const calls = [];
  return { calls, fetch: async (url, init = {}) => { calls.push(String(url)); return handler(String(url), init); } };
}
const PRODUCT = [{ drug_code: 90001, class_name: "Human", drug_identification_number: "01234567", brand_name: "LQ TEST EXTRA STRENGTH", descriptor: "", number_of_ais: "1",
  ai_group_no: "0000000001", company_name: "LQ TEST PHARMA INC.", last_update_date: "2025-09-25" }];
async function call(env, path, deps, opts = {}) {
  const { pcRoute } = await import(B + "pc.js");
  const r = req(path, { origin: "https://site.example", method: opts.method || "GET", body: opts.body, headers: opts.headers || {} });
  const orig = console.log;
  console.log = () => {};
  let resp;
  try { resp = await pcRoute(r, env, new URL(r.url), deps, {}); } finally { console.log = orig; }
  return { status: resp.status, j: await resp.json() };
}
const env0 = () => createEnv({ ALLOWED_ORIGINS: "https://site.example" });

test("dpd: DIN -> product facts, status, link; sponsor only when a company; OGL-Canada credit", async () => {
  const w = upstream(u => {
    if (u.includes("/drugproduct/?din=01234567")) return jres(PRODUCT);
    if (u.includes("/status/?id=90001")) return jres({ drug_code: 90001, status: "Marketed", history_date: "2025-09-25", original_market_date: "1975-12-31" });
    return new Response("unexpected", { status: 599 });
  });
  const r = await call(env0(), "/api/pc/dpd?q=01234567", { fetch: w.fetch });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.ok, true);
  assert.equal(r.j.items.length, 1);
  const it = r.j.items[0];
  assert.deepEqual([it.ref, it.title, it.holder, it.status, it.date], ["01234567", "LQ TEST EXTRA STRENGTH", "LQ TEST PHARMA INC.", "Marketed", "2025-09-25"]);
  assert.match(it.url, /^https:\/\/health-products\.canada\.ca\/dpd-bdpp\/info\?lang=eng&code=90001$/);
  assert.match(r.j.credit, /Open Government Licence – Canada/);
  assert.match(r.j.credit, /does not endorse LENSIQ/);
  assert.equal(r.j.testing_only, false);
  assert.ok(w.calls.every(u => u.startsWith("https://health-products.canada.ca/api/drug/")));
  // a sole proprietor is a person: not kept
  const p = upstream(u => (u.includes("/drugproduct/") ? jres([{ ...PRODUCT[0], company_name: "JOHN SAMPLE" }]) : jres({ status: "Marketed", history_date: "2025-01-01" })));
  const r2 = await call(env0(), "/api/pc/dpd?q=01234567", { fetch: p.fetch });
  assert.equal(r2.j.items[0].holder, "");
});

test("dpd: no match is 'none'; a failed status leaves the row; a wrong shape is 'could not check'; DIN only", async () => {
  const none = upstream(() => jres([]));
  const r = await call(env0(), "/api/pc/dpd?q=07654321", { fetch: none.fetch });
  assert.equal(r.j.ok, true);
  assert.equal(r.j.items.length, 0);
  const half = upstream(u => (u.includes("/drugproduct/") ? jres(PRODUCT) : new Response("down", { status: 503 })));
  const h = await call(env0(), "/api/pc/dpd?q=01234567", { fetch: half.fetch });
  assert.equal(h.j.ok, true);
  assert.equal(h.j.items[0].status, "");
  assert.equal(h.j.items[0].date, "2025-09-25");
  const html = upstream(() => new Response("<html>maintenance</html>", { status: 200 }));
  const x = await call(env0(), "/api/pc/dpd?q=01234560", { fetch: html.fetch });
  assert.equal(x.j.ok, false);
  assert.equal(x.j.could_not_check, true);
  const obj = upstream(() => jres({ results: [] }));
  const y = await call(env0(), "/api/pc/dpd?q=01234561", { fetch: obj.fetch });
  assert.equal(y.j.reason, "bad_response");
  for (const q of ["tylenol", "1234567", "123456789"]) {
    const z = await call(env0(), `/api/pc/dpd?q=${q}`, { fetch: none.fetch });
    assert.equal(z.status, 400, q);
  }
});

test("dpd: carried by the batch; listed in /api/pc/status as not testing-only", async () => {
  const w = upstream(u => (u.includes("/drugproduct/") ? jres(PRODUCT) : jres({ status: "Marketed", history_date: "2025-09-25" })));
  const b = await call(env0(), "/api/pc/batch", { fetch: w.fetch }, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lookups: [{ source: "dpd", q: "01234567" }] }) });
  assert.equal(b.status, 200, JSON.stringify(b.j));
  assert.equal(b.j.results[0].source, "dpd");
  assert.equal(b.j.results[0].items[0].title, "LQ TEST EXTRA STRENGTH");
  const s = await call(env0(), "/api/pc/status", {});
  assert.deepEqual([s.j.sources.dpd.on, s.j.sources.dpd.testing_only, s.j.sources.dpd.country], [true, false, "CA"]);
});

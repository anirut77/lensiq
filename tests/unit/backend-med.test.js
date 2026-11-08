"use strict";
// tests/unit/backend-med.test.js — backend/src/med.js (medicine checker text proxy, not deployed by default): Origin
// required, GET only, text-only forwarding (no client headers / address upstream), SOAP body escaping, Thai FDA XML
// parsing (addresses dropped, only pertento links kept), openFDA / RxNav query building, 24 h cache, rate limit,
// MED_ENABLED switch, no query text or IP in logs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const XML = readFileSync(join(__dirname, "fixtures", "thfda-get-data-drug.xml"), "utf8");

function memCache() {
  const m = new Map();
  return { m, match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, resp) => { m.set(r.url, await resp.text()); } };
}
function upstream(handler) {
  const calls = [];
  const fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  return { fetch, calls };
}
async function call(env, path, deps, opts = {}) {
  const { medRoute } = await import(B + "med.js");
  const r = req(path, { origin: opts.origin === undefined ? "https://site.example" : opts.origin, method: opts.method || "GET", ip: opts.ip });
  const resp = await medRoute(r, env, new URL(r.url), deps, {});
  return resp ? { status: resp.status, j: resp.status === 204 ? null : await resp.json(), resp } : null;
}

test("parseThfda: rows mapped, status derived, address dropped, foreign links refused", async () => {
  const { parseThfda, thStatus } = await import(B + "med.js");
  const r = parseThfda(XML);
  assert.equal(r.total, 2);
  assert.equal(r.rows[0].status, "active");
  assert.equal(r.rows[1].status, "cancelled");
  assert.match(r.rows[0].lcnno, /^1A\d+\/\d{2}$/);
  assert.match(r.rows[0].url, /^https:\/\/pertento\.fda\.moph\.go\.th\//);
  assert.ok(r.rows[0].name_th && r.rows[0].name_en && r.rows[0].kind);
  assert.ok(!JSON.stringify(r).includes("Addr") && !("addr" in r.rows[0]));
  const evil = XML.replace(/https:\/\/pertento\.fda\.moph\.go\.th/g, "https://evil.example");
  assert.equal(parseThfda(evil).rows[0].url, "");
  assert.equal(thStatus("หมดอายุ"), "expired");
  assert.equal(thStatus("รอตรวจสอบสถานะ"), "pending");
  assert.equal(thStatus("?"), "unknown");
  assert.deepEqual(parseThfda("garbage").rows, []);
});

test("soapBody escapes the query; cleanTerm strips markup and quotes", async () => {
  const { soapBody, cleanTerm } = await import(B + "med.js");
  assert.match(soapBody("1A 15/50"), /<DATAS>1A 15\/50<\/DATAS>/);
  assert.ok(!soapBody("a<b>&c").includes("<b>"));
  assert.equal(cleanTerm('para"<script>'), "para script");
  assert.equal(cleanTerm("พาราเซตามอล 500"), "พาราเซตามอล 500");
  assert.equal(cleanTerm("x".repeat(100), 60).length, 60);
  // Thai above / below vowels and tone marks are combining marks (\p{M}) and must survive
  assert.equal(cleanTerm("ไทลินอล"), "ไทลินอล");
  assert.equal(cleanTerm("ไทลินอล ยาแก้ไอ"), "ไทลินอล ยาแก้ไอ");
});

test("thfda: forwards only the text (SOAP, no client headers), caches 24 h, logs no query", async () => {
  const env = createEnv();
  const up = upstream(async () => new Response(XML, { headers: { "Content-Type": "text/xml" } }));
  const cache = memCache();
  const logs = [];
  const orig = console.log;
  console.log = s => logs.push(String(s));
  let a, b;
  try {
    a = await call(env, "/api/med/thfda?q=" + encodeURIComponent("1A 15/50"), { fetch: up.fetch, cache });
    b = await call(env, "/api/med/thfda?q=" + encodeURIComponent("1a 15/50"), { fetch: up.fetch, cache });
  } finally { console.log = orig; }
  assert.equal(a.status, 200);
  assert.equal(a.j.rows.length, 2);
  assert.equal(up.calls.length, 1, "second (same normalised query) served from cache");
  assert.equal(b.j.rows.length, 2);
  assert.ok(cache.m.size >= 1);
  for (const k of cache.m.keys()) assert.match(k, /^https:\/\/lensiq-med-cache\.invalid\/[0-9a-f]{64}$/, "cache key is a SHA-256, never the query text");
  const c = up.calls[0];
  assert.equal(c.url, "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/WS_LICENSE_SEARCH.asmx");
  assert.equal(c.init.method, "POST");
  assert.deepEqual(Object.keys(c.init.headers).sort(), ["Content-Type", "SOAPAction"]);
  assert.match(String(c.init.body), /<DATAS>1A 15\/50<\/DATAS>/);
  assert.ok(!String(c.init.body).includes("203.0.113.7"));
  const joined = logs.join("\n");
  assert.match(joined, /"event":"med\.thfda"/);
  assert.ok(!joined.includes("15/50") && !joined.includes("203.0.113"), "no query text or IP in logs");
  const ratesRaw = JSON.stringify((await env.DB.prepare("SELECT key FROM rate_limits").all()).results);
  assert.ok(!ratesRaw.includes("203.0.113.7"), "rate-limit key is a pseudonym");
});

test("guards: Origin required, GET only, short query, unknown route, MED_ENABLED=false, non-med path", async () => {
  const env = createEnv();
  const up = upstream(async () => new Response(XML));
  assert.equal((await call(env, "/api/med/thfda?q=1A", { fetch: up.fetch }, { origin: null })).status, 403);
  assert.equal((await call(env, "/api/med/thfda?q=1A", { fetch: up.fetch }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "/api/med/thfda?q=1A", { fetch: up.fetch }, { method: "POST" })).status, 405);
  assert.equal((await call(env, "/api/med/thfda?q=" + encodeURIComponent("<>"), { fetch: up.fetch })).status, 400);
  assert.equal((await call(env, "/api/med/images", { fetch: up.fetch })).status, 404);
  assert.equal((await call(createEnv({ MED_ENABLED: "false" }), "/api/med/status", { fetch: up.fetch })).status, 404);
  assert.equal(await call(env, "/api/fortune/status", { fetch: up.fetch }), null);
  const st = await call(env, "/api/med/status", { fetch: up.fetch });
  assert.deepEqual(st.j, { enabled: true, thfda: true, openfda: true, rxnav: true, openfda_key: false });
  assert.equal(up.calls.length, 0);
});

test("rate limit per caller per minute (MED_RATE_MIN)", async () => {
  const env = createEnv({ MED_RATE_MIN: "2" });
  const up = upstream(async () => new Response(XML));
  const s = [];
  for (const q of ["1A 1/50", "1A 2/50", "1A 3/50"]) s.push((await call(env, "/api/med/thfda?q=" + encodeURIComponent(q), { fetch: up.fetch, cache: memCache() })).status);
  assert.deepEqual(s, [200, 200, 429]);
  assert.equal((await call(env, "/api/med/thfda?q=" + encodeURIComponent("1A 4/50"), { fetch: up.fetch, cache: memCache() }, { ip: "198.51.100.9" })).status, 200);
});

test("openfda: query built server-side, API key only from the secret, 404 -> empty, upstream error -> 502", async () => {
  const { openfdaSearch } = await import(B + "med.js");
  assert.equal(openfdaSearch("ndc", "0603-5892-21 0603-5892"), 'openfda.package_ndc:"0603-5892-21" openfda.product_ndc:"0603-5892"');
  assert.equal(openfdaSearch("setid", "not-a-uuid"), "");
  assert.equal(openfdaSearch("name", "พารา"), "", "openFDA is English-only");
  assert.equal(openfdaSearch("name", 'ibu"profen'), 'openfda.generic_name:"ibu profen" openfda.brand_name:"ibu profen" openfda.substance_name:"ibu profen"');
  const env = createEnv({ OPENFDA_API_KEY: "k123" });
  const up = upstream(async url => (url.includes("nothing")
    ? new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 })
    : new Response(JSON.stringify({ meta: { disclaimer: "Do not rely on openFDA", last_updated: "2026-11-06" }, results: [{ set_id: "x" }, {}, {}, {}] }))));
  const r = await call(env, "/api/med/openfda?by=name&q=ibuprofen", { fetch: up.fetch, cache: memCache() });
  assert.equal(r.status, 200);
  assert.equal(r.j.results.length, 3);
  assert.equal(r.j.meta.disclaimer, "Do not rely on openFDA");
  assert.match(up.calls[0].url, /^https:\/\/api\.fda\.gov\/drug\/label\.json\?search=.+&limit=3&api_key=k123$/);
  const none = await call(env, "/api/med/openfda?by=name&q=nothing", { fetch: up.fetch, cache: memCache() });
  assert.deepEqual(none.j.results, []);
  assert.equal((await call(env, "/api/med/openfda?by=sql&q=ibuprofen", { fetch: up.fetch })).status, 400);
  const bad = upstream(async () => new Response("x", { status: 500 }));
  assert.equal((await call(createEnv(), "/api/med/openfda?by=name&q=ibuprofen", { fetch: bad.fetch, cache: memCache() })).status, 502);
  const thrown = upstream(async () => { throw new Error("net"); });
  assert.equal((await call(createEnv(), "/api/med/rxnav?term=amoxycillin", { fetch: thrown.fetch, cache: memCache() })).status, 502);
});

test("rxnav: approximateTerm candidates trimmed to the fields the page uses", async () => {
  const env = createEnv();
  const up = upstream(async () => new Response(JSON.stringify({ approximateGroup: { candidate: [{ rxcui: "723", rxaui: "1", score: "9.6", rank: "1", name: "Amoxycillin", source: "DRUGBANK" }] } })));
  const r = await call(env, "/api/med/rxnav?term=amoxycillin", { fetch: up.fetch, cache: memCache() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.approximateGroup.candidate, [{ rxcui: "723", score: "9.6", name: "Amoxycillin", source: "DRUGBANK" }]);
  assert.equal(up.calls[0].url, "https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=amoxycillin&maxEntries=6");
});

test("worker entry routes /api/med/* to med.js (round 14 integration)", async () => {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ PUBLIC_ORIGINS: "https://site.example" });
  const ok = await handle(req("/api/med/status", { origin: "https://site.example" }), env, {});
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).enabled, true);
  const bad = await handle(req("/api/med/status", { origin: "https://evil.example" }), env, {});
  assert.equal(bad.status, 403);
  const off = await handle(req("/api/med/status", { origin: "https://site.example" }), createEnv({ PUBLIC_ORIGINS: "https://site.example", MED_ENABLED: "false" }), {});
  assert.equal(off.status, 404);
});

"use strict";
// tests/unit/backend-pc.test.js — backend/src/pc.js (Product Check official lookups, round 17 P4; not deployed by
// default). Recorded fixtures only (tests/unit/fixtures/pc/, facts only, licences in its README); the network is never
// called. Covers: Origin / method / PC_ENABLED, the public Thai FDA operations (licensee searches not exposed), number
// formats, personal data dropped (natural persons, addresses, foreign makers) with the reviewer's leak cases, the admin
// switch and per-source switches, the customer-build guard, short caches keyed by SHA-256, "could not check" on 5xx /
// timeout / 429 / network error AND on a 200 that is not the source's documented shape (HTML, SOAP Fault, empty, wrong
// JSON) — never cached; Health Canada never through the Worker (searched on the device from static shards); the batch
// endpoint (one rate-limit count per tap, also without D1); prototype keys refused; no label text; no query text in logs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const B = "../../backend/src/";
const F = join(__dirname, "fixtures", "pc");
const fx = f => readFileSync(join(F, f), "utf8");
const SYN = JSON.parse(fx("synthetic.json"));
const ADMIN_TOKEN = "pc-admin-bootstrap-token-0123456789abcdef";
const ADMIN_PW = "correct horse battery staple pc";

function memCache() {
  const m = new Map();
  return { m, match: async r => (m.has(r.url) ? new Response(m.get(r.url)) : undefined), put: async (r, resp) => { m.set(r.url, await resp.text()); } };
}
const jres = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { "Content-Type": "application/json" } });
function upstream(handler) {
  const calls = [];
  return { calls, fetch: async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init); } };
}
/** the synthetic SOAP answer, re-labelled for the operation that was asked (a real answer names its own operation) */
const soap = init => fx("thfda-synthetic.xml").replace(/GET_DATA_CMT/g, String((init.headers || {}).SOAPAction || "").replace(/^"http:\/\/tempuri\.org\/|"$/g, ""));
/** the fake world: every source answers from its fixture */
const world = () => upstream(async (u, init) => {
  if (u.startsWith("https://porta.fda.moph.go.th/")) return new Response(soap(init), { headers: { "Content-Type": "text/xml" } });
  if (u.startsWith("https://api.fda.gov/drug/enforcement.json")) return new Response(fx("openfda-enforcement-drug.json"));
  if (u.startsWith("https://api.fda.gov/food/enforcement.json")) return new Response(fx("openfda-enforcement-food.json"));
  if (u.startsWith("https://api.fda.gov/drug/label.json")) return jres(SYN.label);
  if (u.startsWith("https://api.fda.gov/drug/ndc.json")) return jres(SYN.ndc);
  if (u.startsWith("https://ec.europa.eu/safety-gate-alerts/public/api/search")) return jres(SYN.safetygate);
  if (u.startsWith("https://webgate.ec.europa.eu/rasff-window/")) return new Response(fx("rasff-search.json"));
  if (u.startsWith("https://data.gov.sg/api/action/datastore_search")) return new Response(fx("hsa-search.json"));
  if (u.startsWith("https://dailymed.nlm.nih.gov/")) return jres(SYN.dailymed);
  if (u.startsWith("https://rxnav.nlm.nih.gov/REST/approximateTerm.json")) return jres(SYN.rxnav_approx);
  if (u.startsWith("https://rxnav.nlm.nih.gov/REST/rxcui/")) return jres(SYN.rxnav_related);
  return new Response("unexpected " + u + " " + (init.method || ""), { status: 599 });
});
async function call(env, path, deps, opts = {}) {
  const { pcRoute } = await import(B + "pc.js");
  const r = req(path, { origin: opts.origin === undefined ? "https://site.example" : opts.origin, method: opts.method || "GET", body: opts.body, headers: opts.headers || {},
    ip: opts.ip });
  const logs = [], orig = console.log;
  console.log = s => logs.push(String(s));
  let resp;
  try { resp = await pcRoute(r, env, new URL(r.url), deps, {}); } finally { console.log = orig; }
  return resp ? { status: resp.status, j: await resp.json(), logs, headers: resp.headers } : null;
}
const SOURCES_ALL = ["thfda", "openfda", "safetygate", "rasff", "hsa", "label", "ndc", "dailymed", "rxnav"]; // healthcanada: on the device

test("guards: other paths pass through; Origin required; GET for lookups, POST for batch; PC_ENABLED=false hides every route", async () => {
  const env = createEnv();
  const w = world();
  assert.equal(await call(env, "/api/med/status", { fetch: w.fetch }), null);
  assert.equal((await call(env, "/api/pc/status", { fetch: w.fetch }, { origin: null })).status, 403);
  assert.equal((await call(env, "/api/pc/status", { fetch: w.fetch }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(env, "/api/pc/openfda?q=x", { fetch: w.fetch }, { method: "POST" })).status, 405);
  assert.equal((await call(env, "/api/pc/batch", { fetch: w.fetch })).status, 405, "batch is POST only");
  assert.equal((await call(createEnv({ PC_ENABLED: "false" }), "/api/pc/status", { fetch: w.fetch })).status, 404);
  assert.equal((await call(env, "/api/pc/nope?q=abc", { fetch: w.fetch })).status, 404);
  assert.equal((await call(env, "/api/pc/openfda?q=a", { fetch: w.fetch })).status, 400, "too short");
  assert.equal((await call(env, "/api/pc/openfda?by=gtin&q=12345", { fetch: w.fetch })).status, 400, "bad gtin");
  assert.equal(w.calls.length, 0);
});

test("prototype keys (review S4): routes, ops, batch sources and admin keys never resolve through Object.prototype", async () => {
  const env = createEnv(), w = world();
  for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal((await call(env, `/api/pc/${k}?q=abcd`, { fetch: w.fetch })).status, 404, "route " + k);
    assert.equal((await call(env, `/api/pc/thfda?op=${k}&q=abcd`, { fetch: w.fetch })).status, 400, "op " + k);
    const b = await call(env, "/api/pc/batch", { fetch: w.fetch }, { method: "POST", body: { lookups: [{ source: k, q: "abcd" }] } });
    assert.equal(b.status, 400, "batch source " + k);
  }
  const { putPcSettings } = await import(B + "pc.js");
  for (const k of ["__proto__", "constructor", "toString"]) await assert.rejects(putPcSettings(env, JSON.parse(`{"sources":{"${k}":true}}`)), /unknown source/, k);
  assert.equal(w.calls.length, 0);
  assert.equal({}.polluted, undefined);
});

test("status: demo build — Thai FDA live, testing-only flags; Health Canada runs on the device, never through the Worker", async () => {
  const r = await call(createEnv(), "/api/pc/status", {});
  assert.equal(r.status, 200);
  assert.equal(r.j.build, "demo");
  assert.deepEqual(r.j.thfda, { mode: "live", permission_before_charging: true });
  assert.equal(r.j.sources.thfda.testing_only, true);
  assert.equal(r.j.sources.thfda.on, true, "demo build: on");
  assert.equal(r.j.sources.safetygate.testing_only, true, "L16: licence of the search API unconfirmed");
  assert.equal(r.j.sources.rasff.testing_only, true, "coordinator decision: undocumented search endpoint, L16 open");
  for (const s of ["openfda", "healthcanada", "hsa", "label", "ndc", "dailymed", "rxnav"]) assert.equal(r.j.sources[s].testing_only, false, s);
  assert.deepEqual([r.j.sources.healthcanada.on, r.j.sources.healthcanada.off_reason], [false, "on_device"]);
  const w = world();
  const hc = await call(createEnv(), "/api/pc/healthcanada?q=" + encodeURIComponent("Black Soybeans"), { fetch: w.fetch });
  assert.deepEqual([hc.status, hc.j.could_not_check, hc.j.reason, w.calls.length], [503, true, "on_device", 0], "no Worker ever downloads the 16 MB file");
  const { putPcSettings, getPcSettings } = await import(B + "pc.js");
  const env = createEnv();
  await putPcSettings(env, { sources: { healthcanada: true } });
  assert.equal((await getPcSettings(env)).sources.healthcanada, false, "cannot be switched to the Worker");
  assert.ok(!/HCRSAMOpenData|recalls-rappels\.canada\.ca\/sites/.test(readFileSync(join(__dirname, "..", "..", "backend", "src", "pc.js"), "utf8")), "no download URL in the Worker");
  assert.equal((await call(createEnv({ PC_THFDA_MODE: "link" }), "/api/pc/status", {})).j.thfda.mode, "link");
});

test("customer build (review N3): testing-only sources OFF unless the owner switches them on; licence label kept", async () => {
  const { putPcSettings } = await import(B + "pc.js");
  const env = createEnv({ PC_BUILD: "customer" });
  const st = (await call(env, "/api/pc/status", {})).j;
  assert.equal(st.build, "customer");
  assert.deepEqual([st.sources.thfda.on, st.sources.thfda.off_reason, st.sources.safetygate.on, st.sources.safetygate.off_reason, st.sources.rasff.on,
    st.sources.rasff.off_reason], [false, "testing_only_off", false, "testing_only_off", false, "testing_only_off"]);
  for (const v of [" customer", "Customer ", " CUSTOMER\n"]) assert.equal((await call(createEnv({ PC_BUILD: v }), "/api/pc/status", {})).j.build, "customer", JSON.stringify(v));
  assert.equal(st.sources.openfda.on, true);
  const w = world();
  const off = await call(env, "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: w.fetch });
  assert.deepEqual([off.status, off.j.reason, off.j.testing_only], [503, "testing_only_off", true]);
  assert.match(off.j.licence, /L13/);
  assert.equal(w.calls.length, 0);
  await putPcSettings(env, { sources: { thfda: true } }); // the owner's explicit choice
  const on = await call(env, "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: w.fetch });
  assert.deepEqual([on.status, on.j.ok, on.j.testing_only], [200, true, true]);
  assert.equal((await call(env, "/api/pc/safetygate?q=abcd", { fetch: w.fetch })).j.reason, "testing_only_off", "only the source the owner chose");
});

test("thfda: public operations only (review N1); SOAP action per op; number formats; no client headers", async () => {
  const { OPS, PUBLIC_OPS, thfdaQuery } = await import(B + "pc.js");
  assert.equal(Object.keys(OPS).length, 21, "all 21 service operations documented");
  assert.deepEqual([...PUBLIC_OPS].sort(), ["advert", "all", "cosmetic", "device", "drug", "food", "herbal"]);
  const env = createEnv();
  for (const op of PUBLIC_OPS) {
    const w = world();
    const r = await call(env, `/api/pc/thfda?op=${op}&q=${encodeURIComponent("LQ TEST " + op)}`, { fetch: w.fetch });
    assert.equal(r.status, 200, op);
    const soapOp = OPS[op];
    assert.equal(w.calls[0].init.headers.SOAPAction, `"http://tempuri.org/${soapOp}"`);
    assert.match(w.calls[0].init.body, new RegExp(`<${soapOp} xmlns="http://tempuri.org/"><DATAS>LQ TEST ${op.toUpperCase()}</DATAS></${soapOp}>`));
    assert.equal(Object.keys(w.calls[0].init.headers).sort().join(), "Content-Type,SOAPAction", "no client header forwarded");
  }
  for (const op of Object.keys(OPS).filter(o => !PUBLIC_OPS.includes(o))) {
    const w = world();
    assert.equal((await call(env, `/api/pc/thfda?op=${op}&q=abcd`, { fetch: w.fetch })).status, 400, op + " (licensee-name searches are not public)");
    assert.equal(w.calls.length, 0);
  }
  assert.equal((await call(env, "/api/pc/thfda?op=GET_DATA_DRUG&q=abc", {})).status, 400, "only op names, never a raw SOAP action");
  assert.equal(thfdaQuery("drug", "1a844/39"), "1A 844/39");
  assert.equal(thfdaQuery("drug", "1A  844 / 39"), "1A 844/39");
  assert.equal(thfdaQuery("herbal", "G 123/45"), "G123/45");
  assert.equal(thfdaQuery("food", "10-1-02141-1-0375"), "10-1-02141-1-0375");
  assert.equal(thfdaQuery("cosmetic", "<b>13-1-6800016755"), "B 13-1-6800016755");
});

test("thfda (review B1): a 200 HTML / WAF page, a 200 SOAP Fault or an empty 200 is 'could not check', never 'not found', never cached", async () => {
  const { isSoapAnswer } = await import(B + "pc.js");
  const fault = '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode>' +
    "<faultstring>Server was unable to process request.</faultstring></soap:Fault></soap:Body></soap:Envelope>";
  const bodies = { html: "<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.</body></html>", fault, empty: "",
    otherOp: fx("thfda-synthetic.xml") /* answers GET_DATA_CMT, not the asked GET_DATA_DRUG */ };
  for (const [name, body] of Object.entries(bodies)) {
    const env = createEnv(), cache = memCache();
    let n = 0;
    const f = async () => { n++; return new Response(body, { status: 200, headers: { "Content-Type": name === "html" ? "text/html" : "text/xml" } }); };
    const a = await call(env, "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: f, cache });
    assert.deepEqual([a.status, a.j.ok, a.j.could_not_check, a.j.reason], [502, false, true, "bad_response"], name);
    assert.ok(!("items" in a.j) && !("found" in a.j), name + ": no 'not found' answer");
    await call(env, "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: f, cache });
    assert.deepEqual([n, cache.m.size], [2, 0], name + ": not cached, asked again");
  }
  // a real empty answer (the operation's Response + Result, no rows) IS "not found"
  const emptyDataSet = '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GET_DATA_DRUGResponse xmlns="http://tempuri.org/">' +
    '<GET_DATA_DRUGResult><xs:schema id="NewDataSet" xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema></GET_DATA_DRUGResult></GET_DATA_DRUGResponse></soap:Body></soap:Envelope>';
  assert.equal(isSoapAnswer(emptyDataSet, "GET_DATA_DRUG"), true);
  const e = await call(createEnv(), "/api/pc/thfda?op=drug&q=1A%209999%2F99", { fetch: async () => new Response(emptyDataSet) });
  assert.deepEqual([e.status, e.j.ok, e.j.found, e.j.items.length], [200, true, 0, 0]);
});

test("JSON sources (review S1): a 200 with another shape is 'could not check' for every source, never cached", async () => {
  const wrong = { openfda: { error: "x" }, safetygate: { results: [] }, rasff: { data: [] }, hsa: { success: false, error: { message: "x" } },
    label: { meta: {} }, ndc: [], dailymed: { metadata: {} }, rxnav: { idGroup: {} } };
  for (const [src, body] of Object.entries(wrong)) {
    for (const b of [body, "<!doctype html><title>WAF</title>", ""]) {
      const env = createEnv(), cache = memCache();
      const f = async () => new Response(typeof b === "string" ? b : JSON.stringify(b), { status: 200, headers: { "Content-Type": typeof b === "string" ? "text/html" : "application/json" } });
      const r = await call(env, `/api/pc/${src}?q=paracetamol`, { fetch: f, cache });
      assert.deepEqual([r.status, r.j.ok, r.j.could_not_check, r.j.reason], [502, false, true, "bad_response"], `${src} ${JSON.stringify(b).slice(0, 30)}`);
      assert.equal(cache.m.size, 0, src + ": not cached");
    }
  }
});

test("thfda personal data (review M1 / S3): natural persons, addresses, foreign makers dropped; anchored company markers; title / NFKC / zero-width cases", async () => {
  const w = world();
  const r = await call(createEnv(), "/api/pc/thfda?op=cosmetic&q=" + encodeURIComponent("99-1-9900000001"), { fetch: w.fetch });
  const text = JSON.stringify(r.j);
  for (const s of ["นางสาวสมมติ", "ตัวอย่าง", "ถนนสมมติ", "หมู่ 4", "secret address", "LQ TEST MAKER", "Fake Road", "evil.example", "Addr", "frgn"]) assert.ok(!text.includes(s), "leaked " + s);
  assert.equal(r.j.natural_person_names_dropped, 1);
  const [a, b, c] = r.j.items;
  assert.deepEqual([a.holder, a.status, a.url.startsWith("https://cosmetica.fda.moph.go.th/")], ["บริษัท แอลคิว ทดสอบ จำกัด", "active", true]);
  assert.deepEqual([b.holder, b.holder_dropped, b.status, b.url, b.name_th], ["", true, "cancelled", "", "แอลคิว เทสต์ เซรั่ม & โลชั่น"]);
  assert.deepEqual([c.holder, c.status, c.url.startsWith("https://pertento.fda.moph.go.th/")], ["LQ TEST TRADING CO., LTD.", "expired", true]);
  assert.match(r.j.credit, /before charging/);
  const { pcStatus, isJuristic, parseThfdaRows } = await import(B + "pc.js");
  assert.deepEqual(["คงอยู่", "ทะเบียนคงอยู่ แต่ผู้รับอนุญาตไม่ต่ออายุ", "อนุญาต", "ยกเลิก 25/8/2569", "หมดอายุ", "รอตรวจ", "?"].map(pcStatus),
    ["active", "active", "active", "cancelled", "expired", "pending", "unknown"]);
  const persons = ["นายสมมติ ทดสอบ", "John Smith", "นาย สมชาย กรมทอง", "นาง สมศรี สถาบันดี", "นางสาวสมมติ สหกรณ์ไทย", "MS. SA LEE", "MRS. KK TAN", "Mr. Ag Wong", "Dr. Limited Smith",
    "สมชาย สถาบันทอง", "สมชาย มหาชนะ", "สมชาย จำกัดภัย", "​นางสมศรี มหาชน", "Ｍｒｓ Jane Co Ltd", "พ.ต.ท.สมชาย จำกัดวงศ์", "ภก.สมชาย ร้านยา จำกัด", "ว่าที่ร.ต.สมชาย จำกัด",
    "ร.ต.อ. สมชาย บริษัท จำกัด", "พล.ต. สมชาย", "ดร.สมชาย จำกัด", "นพ.สมชาย คลินิก จำกัด", "พญ.สมศรี จำกัด", "ภญ.สมศรี จำกัด", "ทพ.สมชาย จำกัด", "สพ.สมชาย จำกัด",
    "พลตำรวจเอก สมชาย บริษัท จำกัด", "Ｎａｙ", "⁠Mr John Co Ltd",
    // re-review 3
    "ห้างหุ้นส่วนสามัญ สมชาย ใจดี", "กรมพระยาดำรงราชานุภาพ", "กรมหลวงสมมติ", "สมชาย ใจจำกัด", "สมชายจำกัด", "ทนพ.สมชาย จำกัด", "ทนพญ.สมศรี", "พลทหาร สมชาย",
    "ทันตแพทย์หญิง สมศรี จำกัด", "นายแพทย์สมชาย", "เภสัชกรหญิง สมศรี จำกัด"];
  for (const p of persons) assert.equal(isJuristic(p), false, "person: " + JSON.stringify(p));
  for (const co of ["บริษัท บิ๊กซี ซูเปอร์เซ็นเตอร์ จำกัด (มหาชน)", "กรมวิทยาศาสตร์การแพทย์", "LQ TEST TRADING CO., LTD.", "LQ Test Sdn. Bhd.", "Haleon Singapore Pte. Ltd.",
    "ห้างหุ้นส่วนจำกัด ทดสอบ", "บริษัท ไบเออร์ไทย จำกัด", "Kenvue Brands LLC", "แอลคิว ฟาร์มา จำกัด", "ห้างหุ้นส่วนสามัญนิติบุคคล แอลคิว",
    "บริษัทแอลคิวจำกัด", "บมจ. แอลคิว", "แอลคิว ฟาร์มา จำกัด (มหาชน)", "กรมควบคุมโรค"]) assert.equal(isJuristic(co), true, "company: " + co);
  // a company in licen wins over a trade name in thanm (review S1 of the first pass): shown, not counted as a person
  const row = x => `<Table1>${x}<lcnno>99-1-1</lcnno><cncnm>คงอยู่</cncnm></Table1>`;
  const big = parseThfdaRows(row("<licen>บริษัท แอลคิว จำกัด (มหาชน)</licen><thanm>แอลคิว ซูเปอร์สโตร์</thanm>"));
  assert.deepEqual([big.rows[0].holder, big.natural_person_names_dropped], ["บริษัท แอลคิว จำกัด (มหาชน)", 0]);
  const per = parseThfdaRows(row("<licen>พ.ต.ท.สมชาย จำกัดวงศ์</licen><thanm>พ.ต.ท.สมชาย จำกัดวงศ์</thanm>"));
  assert.deepEqual([per.rows[0].holder, per.rows[0].holder_dropped, per.natural_person_names_dropped], ["", true, 1]);
  assert.ok(!JSON.stringify(per).includes("สมชาย"));
});

test("admin switch: link-out never calls Thai FDA; D1 setting overrides the var; per-source off; validation", async () => {
  const { putPcSettings, getPcSettings } = await import(B + "pc.js");
  const w = world();
  const link = await call(createEnv({ PC_THFDA_MODE: "link" }), "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: w.fetch });
  assert.deepEqual([link.status, link.j.could_not_check, link.j.reason], [503, true, "link_out"]);
  assert.ok(link.j.links.every(u => u.startsWith("https://")));
  assert.equal(w.calls.length, 0);
  const env = createEnv();
  await putPcSettings(env, { thfda: "link", sources: { rasff: false } });
  assert.deepEqual((await getPcSettings(env)).thfda, "link");
  assert.equal((await call(env, "/api/pc/thfda?op=drug&q=1A%20844%2F39", { fetch: w.fetch })).j.reason, "link_out");
  const off = await call(env, "/api/pc/rasff?q=pine%20nuts", { fetch: w.fetch });
  assert.deepEqual([off.status, off.j.reason], [503, "switched_off"]);
  assert.equal(w.calls.length, 0);
  // re-review 1: a PUT without "thfda" stores no mode, so the wrangler fallback keeps working
  const envL = createEnv({ PC_THFDA_MODE: "link" });
  await putPcSettings(envL, { sources: { rasff: false } });
  assert.equal((await getPcSettings(envL)).thfda, "link");
  assert.ok(!("thfda" in (await (await import(B + "store.js")).getSetting(envL.DB, "pc_lookup", {}))), "no mode stored");
  const envL2 = { ...envL, PC_THFDA_MODE: "live" };
  assert.equal((await getPcSettings(envL2)).thfda, "live", "the var still decides");
  await putPcSettings(envL, { thfda: "live" });
  await putPcSettings(envL, { sources: { rasff: true } });
  assert.equal((await getPcSettings(envL)).thfda, "live", "an explicit owner choice is kept by later PUTs");
  await assert.rejects(putPcSettings(env, { thfda: "on" }), /live/);
  await assert.rejects(putPcSettings(env, { sources: { evil: true } }), /unknown source/);
  await assert.rejects(putPcSettings(env, { sources: { rasff: "yes" } }), /true or false/);
});

test("admin API: GET / PUT /admin/api/pc/lookup need sign-in; PUT needs re-auth and is audited", async () => {
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN });
  const { handle } = await import(B + "index.js");
  const c = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    let j = null; try { j = await r.json(); } catch { /* none */ }
    return { status: r.status, j };
  };
  assert.equal((await c("/admin/api/pc/lookup")).status, 401);
  await c("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
  const tok = (await c("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
  const A = (p, o = {}) => c("/admin/api" + p, { ...o, headers: { Authorization: "Bearer " + tok } });
  const g = await A("/pc/lookup");
  assert.equal(g.status, 200);
  assert.equal(g.j.settings.thfda, "live");
  assert.match(g.j.note, /before charging/);
  assert.equal((await A("/pc/lookup", { method: "PUT", body: { thfda: "link" } })).status, 403, "re-auth required");
  assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW } })).status, 200);
  const put = await A("/pc/lookup", { method: "PUT", body: { thfda: "link" } });
  assert.equal(put.status, 200);
  assert.equal(put.j.settings.thfda, "link");
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_log WHERE action = 'pc.lookup.settings'").first());
  const pub = await handle(req("/api/pc/status"), env, {});
  assert.equal((await pub.json()).thfda.mode, "link");
});

test("cache: same normalised query served from cache (SHA-256 key); errors are never cached", async () => {
  const env = createEnv(), cache = memCache();
  const w = world();
  await call(env, "/api/pc/rasff?q=" + encodeURIComponent("Pine Nuts"), { fetch: w.fetch, cache });
  await call(env, "/api/pc/rasff?q=" + encodeURIComponent("pine nuts"), { fetch: w.fetch, cache });
  assert.equal(w.calls.length, 1);
  for (const k of cache.m.keys()) assert.match(k, /^https:\/\/lensiq-pc-cache\.invalid\/[0-9a-f]{64}$/);
  let n = 0;
  const flaky = upstream(async () => (++n === 1 ? new Response("x", { status: 500 }) : new Response(fx("rasff-search.json"))));
  const a = await call(env, "/api/pc/rasff?q=walnuts", { fetch: flaky.fetch, cache });
  const b = await call(env, "/api/pc/rasff?q=walnuts", { fetch: flaky.fetch, cache });
  assert.deepEqual([a.status, a.j.could_not_check, a.j.reason, b.status, b.j.ok], [502, true, "upstream_500", 200, true]);
});

test("could not check: 5xx, timeout, 429, network error — for every source", async () => {
  const cases = [["500", async () => new Response("x", { status: 500 }), "upstream_500"], ["429", async () => new Response("x", { status: 429 }), "rate_limited"],
    ["timeout", async () => { const e = new Error("t"); e.name = "AbortError"; throw e; }, "timeout"], ["net", async () => { throw new TypeError("fetch failed"); }, "upstream_unavailable"]];
  for (const src of SOURCES_ALL) {
    for (const [, f, reason] of cases) {
      const env = createEnv(); // a fresh caller budget: the limiter is tested separately
      const r = await call(env, `/api/pc/${src}?op=drug&q=paracetamol`, { fetch: f });
      assert.deepEqual([r.status, r.j.ok, r.j.could_not_check, r.j.reason], [502, false, true, reason], `${src} ${reason}`);
      assert.ok(!("items" in r.j), "no partial items on failure");
    }
  }
});

test("openFDA recalls: drug + food, GTIN via openfda.upc for drugs only, 404 = no match, facts + generic link", async () => {
  const w = world();
  const r = await call(createEnv(), "/api/pc/openfda?by=gtin&q=712199083411", { fetch: w.fetch });
  assert.equal(r.status, 200);
  const urls = w.calls.map(c => decodeURIComponent(c.url));
  assert.ok(urls.some(u => u.includes('/drug/enforcement.json?search=product_description:"712199083411"+openfda.upc:"712199083411"')));
  assert.ok(urls.some(u => u.includes('/food/enforcement.json?search=product_description:"712199083411"&')));
  const refs = r.j.items.map(x => x.ref);
  assert.ok(refs.includes("H-0130-2027") && refs.includes("D-0657-2026"));
  const h = r.j.items.find(x => x.ref === "H-0130-2027");
  assert.equal(h.date, "2026-10-28"); assert.equal(h.kind, "food"); assert.match(h.url, /^https:\/\/www\.accessdata\.fda\.gov\//);
  const none = await call(createEnv(), "/api/pc/openfda?q=zzqxlensiq", { fetch: async () => jres({ error: { code: "NOT_FOUND" } }, 404) });
  assert.deepEqual([none.status, none.j.ok, none.j.found], [200, true, 0]);
  // re-review 4: only openFDA's own NOT_FOUND body is "none"; any other 404 is the source being down, never cached
  for (const route of ["openfda", "label", "ndc"]) {
    for (const body of ["<html>404 Not Found</html>", "", JSON.stringify({ error: { code: "OTHER" } }), JSON.stringify({ message: "moved" })]) {
      const cache = memCache();
      const r = await call(createEnv(), `/api/pc/${route}?q=paracetamol`, { fetch: async () => new Response(body, { status: 404 }), cache });
      assert.deepEqual([r.status, r.j.ok, r.j.reason, cache.m.size], [502, false, "upstream_404", 0], `${route} ${body.slice(0, 20)}`);
    }
    const nf = await call(createEnv(), `/api/pc/${route}?q=zzqx`, { fetch: async () => jres({ error: { code: "NOT_FOUND", message: "No matches found!" } }, 404) });
    assert.deepEqual([nf.status, nf.j.ok, nf.j.found], [200, true, 0], route + " NOT_FOUND = none");
  }
  const name = world();
  await call(createEnv(), "/api/pc/openfda?q=Synjardy", { fetch: name.fetch });
  assert.ok(name.calls.every(c => !decodeURIComponent(c.url).includes("openfda.brand_name")), "product_description only (P4-RESULTS: brand OR changes the result set)");
});

test("Safety Gate (testing only), RASFF, HSA: facts, dates, official links; barcode search refused where unsupported", async () => {
  const env = createEnv();
  let w = world();
  const sg = await call(env, "/api/pc/safetygate?q=" + encodeURIComponent("LQ TEST Whitening Cream"), { fetch: w.fetch });
  const body = JSON.parse(w.calls[0].init.body);
  assert.deepEqual([body.fullTextSearch, body.language, body.pagination.numberElements], ["LQ TEST Whitening Cream", "en", 5]);
  assert.deepEqual([sg.j.items[0].ref, sg.j.items[0].date, sg.j.items[0].reason, sg.j.testing_only], ["SR/99999/26", "2026-05-05", "chemical", true]);
  assert.equal(sg.j.items[0].url, "https://ec.europa.eu/safety-gate-alerts/screen/webReport/alertDetail/10000001?lang=en");
  assert.ok(!JSON.stringify(sg.j).includes("photos") && !JSON.stringify(sg.j).includes("x.jpg"), "no images");
  w = world();
  const g = await call(env, "/api/pc/safetygate?by=gtin&q=5055300413055", { fetch: w.fetch });
  assert.deepEqual([g.j.ok, g.j.found, w.calls.length], [true, 0, 0]);
  assert.match(g.j.note, /not supported/);
  const ra = await call(env, "/api/pc/rasff?q=pine%20nuts", { fetch: world().fetch });
  assert.deepEqual([ra.j.items[0].ref, ra.j.items[0].date, ra.j.items[0].url], ["2026.9864", "2026-11-06", "https://webgate.ec.europa.eu/rasff-window/screen/notification/885147"]);
  assert.match(ra.j.credit, /CC BY 4\.0/);
  w = world();
  const hs = await call(env, "/api/pc/hsa?q=SIN09110P", { fetch: w.fetch });
  assert.match(decodeURIComponent(w.calls[0].url), /filters=\{"LicenceNo":"SIN09110P"\}/);
  assert.deepEqual([hs.j.items[0].title, hs.j.items[0].date, hs.j.items[0].ingredients], ["PANADOL EXTRA CAPLET", "1996-09-04", "CAFFEINE + PARACETAMOL"]);
  assert.match(hs.j.credit, /Singapore Open Data Licence/);
  w = world();
  await call(env, "/api/pc/hsa?q=panadol", { fetch: w.fetch });
  assert.match(decodeURIComponent(w.calls[0].url), /q=\{"Productname":"panadol"\}/);
});

test("labels, NDC, DailyMed, RxNav: derived facts and links only, never label text; RxNav uses IN, never RxClass", async () => {
  const env = createEnv();
  const lb = await call(env, "/api/pc/label?q=LQ%20TEST%20BRAND", { fetch: world().fetch });
  assert.ok(!JSON.stringify(lb.j).includes("LQ-LABEL-TEXT-MUST-NOT-PASS"), "L33: no label text");
  assert.deepEqual([lb.j.items[0].title, lb.j.items[0].generic, lb.j.items[0].date], ["LQ TEST BRAND", "LQTESTAMINOPHEN", "2024-11-07"]);
  assert.match(lb.j.items[0].url, /^https:\/\/dailymed\.nlm\.nih\.gov\/dailymed\/lookup\.cfm\?setid=/);
  const nd = await call(env, "/api/pc/ndc?q=99999-001", { fetch: world().fetch });
  assert.deepEqual(nd.j.items[0].ingredients, ["LQTESTAMINOPHEN 500 mg/1"]);
  const dm = await call(env, "/api/pc/dailymed?q=lqtest", { fetch: world().fetch });
  assert.deepEqual([dm.j.items[0].date, dm.j.total], ["2026-10-26", 1]);
  const w = world();
  const rx = await call(env, "/api/pc/rxnav?q=lqtest", { fetch: w.fetch });
  assert.deepEqual(rx.j.items.map(x => x.title), ["lqtestaminophen"]);
  assert.ok(w.calls[1].url.endsWith("/rxcui/9999001/related.json?tty=IN"));
  assert.ok(w.calls.every(c => !/rxclass/i.test(c.url)));
  assert.match(rx.j.credit, /National Library of Medicine/);
  const none = await call(env, "/api/pc/rxnav?q=zzqx", { fetch: async () => jres({ approximateGroup: { inputTerm: null } }) });
  assert.deepEqual([none.status, none.j.ok, none.j.found], [200, true, 0], "RxNav's own 'no candidate' answer is 'not found'");
});

test("batch (review S6): one POST per tap, fanned out server-side, ONE rate-limit count; validated before anything is called", async () => {
  const env = createEnv({ PC_RATE_MIN: "2" });
  const w = world();
  const lookups = [{ source: "thfda", op: "drug", q: "1A 844/39" }, { source: "openfda", by: "gtin", q: "712199083411" }, { source: "rasff", q: "pine nuts" },
    { source: "safetygate", q: "LQ TEST Whitening Cream" }, { source: "rxnav", q: "paracetamol" }, { source: "healthcanada", q: "Black Soybeans" }];
  const a = await call(env, "/api/pc/batch", { fetch: w.fetch }, { method: "POST", body: { lookups } });
  assert.equal(a.status, 200);
  assert.deepEqual(a.j.results.map(r => [r.source, r.status, r.ok]), [["thfda", 200, true], ["openfda", 200, true], ["rasff", 200, true], ["safetygate", 200, true],
    ["rxnav", 200, true], ["healthcanada", 503, false]]);
  assert.equal(a.j.results[5].reason, "on_device");
  // re-review 16: duplicates in one batch are asked once; every position still gets its answer
  const wd = world();
  const dup = await call(createEnv(), "/api/pc/batch", { fetch: wd.fetch }, { method: "POST", body: { lookups: [{ source: "rasff", q: "Pine Nuts" }, { source: "rasff", q: "pine nuts" },
    { source: "rasff", q: "pine  nuts", by: "name" }, { source: "rxnav", q: "paracetamol" }] } });
  assert.deepEqual([dup.j.results.length, dup.j.unique, dup.j.results.every(r => r.ok)], [4, 2, true]);
  assert.equal(wd.calls.filter(c => c.url.includes("rasff")).length, 1, "RASFF asked once");
  const b = await call(env, "/api/pc/batch", { fetch: w.fetch }, { method: "POST", body: { lookups } });
  assert.equal(b.status, 200, "second tap: count 2 of 2");
  const c = await call(env, "/api/pc/batch", { fetch: w.fetch }, { method: "POST", body: { lookups } });
  assert.equal(c.status, 429, "third tap over the limit");
  assert.ok(c.headers.get("Retry-After"));
  for (const bad of [{ lookups: [] }, { lookups: Array(17).fill({ source: "rasff", q: "nuts" }) }, { lookups: [{ source: "rasff", q: "a" }] }, { lookups: ["x"] },
    { lookups: [{ source: "thfda", op: "lcn_drug", q: "บริษัท" }] }, {}]) {
    const n = w.calls.length;
    assert.equal((await call(createEnv(), "/api/pc/batch", { fetch: w.fetch }, { method: "POST", body: bad })).status, 400, JSON.stringify(bad).slice(0, 60));
    assert.equal(w.calls.length, n, "nothing called on a bad batch");
  }
  assert.equal((await call(createEnv(), "/api/pc/batch", {}, { method: "POST", body: "x".repeat(5000) })).status, 413);
  assert.equal((await call(createEnv(), "/api/pc/batch", {}, { method: "POST", body: "{}", headers: { "Content-Type": "text/plain" } })).status, 415);
});

test("rate limit: PC_RATE_MIN per caller per minute with D1, AND in memory when there is no D1 (review S6)", async () => {
  const { pcRoute } = await import(B + "pc.js");
  const w = world();
  for (const env of [createEnv({ PC_RATE_MIN: "3" }), { ALLOWED_ORIGINS: "https://site.example", PC_RATE_MIN: "3" }]) {
    const st = [];
    const ip = "198.51.100." + Math.floor(Math.random() * 200 + 1);
    for (let i = 0; i < 4; i++) {
      const r = req("/api/pc/rasff?q=nuts" + i, { ip });
      const resp = await pcRoute(r, env, new URL(r.url), { fetch: w.fetch }, {});
      st.push(resp.status);
      if (i === 3) assert.ok(resp.headers.get("Retry-After"));
    }
    assert.deepEqual(st, [200, 200, 200, 429], env.DB ? "D1" : "memory");
  }
  const { mdy } = await import(B + "pc.js");
  assert.deepEqual(["Oct 26, 2026", "Sept. 3, 2025", "x"].map(mdy), ["2026-10-26", "2025-09-03", ""]);
});

test("logs carry no query text; only derived facts leave (no client headers, no cookies)", async () => {
  const w = world();
  const r = await call(createEnv(), "/api/pc/openfda?q=" + encodeURIComponent("SecretBrandXyz"), { fetch: w.fetch });
  assert.ok(r.logs.length >= 1);
  for (const l of r.logs) assert.ok(!l.toLowerCase().includes("secretbrandxyz"));
  for (const c of w.calls) assert.ok(!c.init.headers || !("Cookie" in c.init.headers || "CF-Connecting-IP" in c.init.headers));
  const src = readFileSync(join(__dirname, "..", "..", "backend", "src", "pc.js"), "utf8");
  assert.ok(!/rxclass\.json|\/rxclass\//i.test(src), "RxClass is never called");
});

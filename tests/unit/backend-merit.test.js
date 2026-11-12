"use strict";
// tests/unit/backend-merit.test.js — Merit MVP on the API Worker (owner order 2026-11-12). FIXED TEST SET: written and
// hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE backend/src/merit.js and migration 0014 were written.
// Local only: in-memory D1 (backend-d1-shim.js), mocked Turnstile.
//
//   B1 migration 0014_merit.sql: in health.js MIGRATIONS + a schema probe; /health/deep names it when it is missing
//   B2 seeded sample items = lensiq-merit-seed.js exactly (one source for the static site and the database)
//   B3 GET /v1/merit/guidance: published items only, every tradition (the device filters; nothing about the user is
//      sent), no internal columns, interest_form false unless MERIT_INTEREST_FORM=on
//   B4 admin CRUD behind the existing admin auth; every write audited; delete needs re-auth
//   B5 validation: complete TH/EN/ZH, fixed types / traditions / keys, chong items need the chong key, no unknown fields
//      (no price / vendor / link / personal fields), wording lint TH/EN/ZH (guarantee, fix-luck, fear, health, lottery,
//      price, purchase, urgency, link, personal data) — fixed phrase sets, and a fixed set of ordinary phrases that must pass
//   B6 interest form OFF by default: 404 merit_interest_off, nothing written; ON: Turnstile (fail closed), consent,
//      minimum fields only, crisis text refused with the support code and never stored, published item only, date window
//   B7 retention: interest requests purged after MERIT_INTEREST_DAYS (default 90); admin can list and erase (re-auth, audited)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "m".repeat(40);
const ADMIN_PW = "correct horse battery staple merit";
const KEK = Buffer.alloc(32, 9).toString("base64");
const nowS = () => Math.floor(Date.now() / 1000);
const LANGS = ["th", "en", "zh"];

function fakeNet() {
  return async (url, init = {}) => {
    url = String(url);
    if (/turnstile\/v0\/siteverify$/.test(url)) {
      const p = new URLSearchParams(String(init.body));
      const [tok, action] = String(p.get("response")).split(":");
      return new Response(JSON.stringify({ success: tok === "good", action: action || "merit", hostname: "site.example" }));
    }
    throw new Error("unexpected network call in test: " + url);
  };
}

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: KEK, ...vars });
  const fetch = fakeNet();
  const call = async (path, o = {}) => {
    const origin = o.origin === undefined ? "https://site.example" : o.origin;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, ip: o.ip, origin }), env, { fetch });
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, r };
  };
  let tok = null;
  const A = async (path, o = {}) => {
    if (!tok) {
      await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: ADMIN_PW } });
      tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: ADMIN_PW, mode: "bearer" } })).j.token;
    }
    return call("/admin/api" + path, { ...o, headers: { Authorization: "Bearer " + tok, ...(o.headers || {}) } });
  };
  const sudo = async () => {
    const { base32Decode, totpAt } = await import(B + "crypto.js");
    const st = await A("/totp/setup", { method: "POST", body: { password: ADMIN_PW } });
    const secret = base32Decode(st.j.secret);
    const step = Math.floor(nowS() / 30);
    assert.equal((await A("/totp/enable", { method: "POST", body: { code: await totpAt(secret, step - 1) } })).status, 200);
    assert.equal((await A("/reauth", { method: "POST", body: { password: ADMIN_PW, totp: await totpAt(secret, step) } })).status, 200);
  };
  const audits = async action => ((await env.DB.prepare("SELECT action, detail FROM audit_log WHERE action = ?1 ORDER BY id").bind(action).all()).results || []);
  const count = async table => Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  return { env, call, A, sudo, audits, count };
}

const tri = (th, en, zh) => ({ th, en, zh });
const good = (o = {}) => ({
  type: "place", tradition: "thai_buddhist",
  title: tri("วัดในชุมชน", "A community temple", "社区寺庙"),
  body: tri("ตามความเชื่อ หลายคนไปไหว้พระที่วัดในชุมชนในวันเกิดของตน แต่งกายสุภาพและทำด้วยใจสงบ",
    "By custom, many people visit a community temple on their birthday, dress modestly and keep a calm mind.",
    "按照习俗，很多人会在生日时到社区寺庙参拜，穿着得体，保持平静的心。"),
  place: tri("วัดในชุมชน", "Community temple", "社区寺庙"), area: tri("กรุงเทพฯ", "Bangkok", "曼谷"),
  keys: ["any", "domain:taksa"], status: "published", sort: 3, ...o
});
const interest = (o = {}) => ({ name: "Tum", channel: "line", contact: "tum_test", item_id: "sample-tb-place-1", date_from: "2027-01-10", date_to: "2027-01-20", consent: true, lang: "th", ...o });
const TS = { "X-Turnstile-Token": "good:merit" };

/* ---------------- B1 migration + health probe ---------------- */
test("B1: migration 0014_merit.sql exists, is listed in health.js MIGRATIONS, and has a schema probe", async () => {
  const f = join(ROOT, "backend", "migrations", "0014_merit.sql");
  assert.ok(existsSync(f));
  const { MIGRATIONS } = await import(B + "health.js");
  // re-lock 2026-11-12: a later migration (0015) now ends the list; 0014 must still follow 0013 directly
  assert.equal(MIGRATIONS[MIGRATIONS.indexOf("0013_recovery_slow_hash.sql") + 1], "0014_merit.sql");
  const health = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(health, /\["0014_merit\.sql", "SELECT [^"]*FROM merit_items/);
  assert.match(health, /\["0014_merit\.sql", "SELECT [^"]*FROM merit_interest/);
});

test("B1: /health/deep is OK with every migration and names 0014 exactly when the merit tables are missing", async () => {
  const { env } = await setup();
  const { deepHealth } = await import(B + "health.js");
  assert.equal((await deepHealth(env)).ok, true);
  await env.DB.exec("DROP TABLE merit_interest");
  const h = await deepHealth(env);
  assert.equal(h.ok, false);
  assert.deepEqual(h.migrations.missing, ["0014_merit.sql"]);
});

/* ---------------- B2 seed parity ---------------- */
test("B2: the seeded sample items are exactly lensiq-merit-seed.js (ids, texts, keys, sample flag, published)", async () => {
  const { env } = await setup();
  const seed = require("../../lensiq-merit-seed.js");
  const rows = (await env.DB.prepare("SELECT * FROM merit_items ORDER BY id").all()).results;
  assert.equal(rows.length, seed.length);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  for (const s of seed) {
    const r = byId[s.id];
    assert.ok(r, s.id + " seeded");
    assert.equal(r.type, s.type); assert.equal(r.tradition, s.tradition); assert.equal(r.status, "published"); assert.equal(r.sample, 1);
    assert.deepEqual(JSON.parse(r.title), s.title); assert.deepEqual(JSON.parse(r.body), s.body);
    assert.deepEqual(r.place == null ? null : JSON.parse(r.place), s.place == null ? null : s.place);
    assert.deepEqual(r.area == null ? null : JSON.parse(r.area), s.area == null ? null : s.area);
    assert.deepEqual(JSON.parse(r.match_keys), s.keys);
    assert.equal(Number(r.sort), Number(s.sort || 0));
  }
});

test("B2: the interest table stores only the minimum columns (no birth date, address, photo or IP)", async () => {
  const { env } = await setup();
  const cols = (await env.DB.prepare("PRAGMA table_info(merit_interest)").all()).results.map(c => c.name).sort();
  assert.deepEqual(cols, ["channel", "consent_version", "contact", "created_at", "date_from", "date_to", "id", "item_id", "lang", "name", "status"].sort());
  const icols = (await env.DB.prepare("PRAGMA table_info(merit_items)").all()).results.map(c => c.name);
  for (const bad of ["price", "price_satang", "vendor", "buy_url", "url", "phone", "email"]) assert.ok(!icols.includes(bad), "no " + bad + " column");
});

/* ---------------- B3 public guidance ---------------- */
test("B3: GET /v1/merit/guidance — published items of every tradition, no internal columns, interest_form false by default", async () => {
  const { call, A } = await setup();
  const r = await call("/v1/merit/guidance");
  assert.equal(r.status, 200);
  assert.equal(r.j.interest_form, false);
  assert.ok(Array.isArray(r.j.items) && r.j.items.length >= 10);
  const trads = new Set(r.j.items.map(x => x.tradition));
  for (const t of ["thai_buddhist", "chinese_folk", "hindu_brahman", "general"]) assert.ok(trads.has(t), t);
  for (const it of r.j.items) {
    assert.deepEqual(Object.keys(it).sort(), ["area", "body", "id", "keys", "place", "sample", "sort", "status", "title", "tradition", "type", "updated_at"].sort());
    assert.equal(it.status, "published");
    for (const l of LANGS) assert.ok(it.title[l] && it.body[l]);
  }
  assert.match(r.r.headers.get("Cache-Control") || "", /max-age=\d+/);
  // a tradition in the query is ignored (never needed: the device filters) — same answer
  const q = await call("/v1/merit/guidance?tradition=chinese_folk");
  assert.equal(q.j.items.length, r.j.items.length);
  // hidden items disappear
  const id = r.j.items[0].id;
  assert.equal((await A("/merit/items/" + id, { method: "PUT", body: { status: "hidden" } })).status, 200);
  const after = await call("/v1/merit/guidance");
  assert.ok(!after.j.items.some(x => x.id === id));
});

test("B3: interest_form is true only when MERIT_INTEREST_FORM is exactly on", async () => {
  for (const [v, want] of [["on", true], ["ON", true], ["true", false], ["1", false], ["", false], ["off", false]]) {
    const { call } = await setup({ MERIT_INTEREST_FORM: v });
    assert.equal((await call("/v1/merit/guidance")).j.interest_form, want, JSON.stringify(v));
  }
});

test("B3: wrangler.toml ships the form OFF", () => {
  const w = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.match(w, /^MERIT_INTEREST_FORM = "off"$/m);
  assert.match(w, /^MERIT_INTEREST_DAYS = "90"$/m);
});

/* ---------------- B4 admin CRUD ---------------- */
test("B4: admin item routes need the admin sign-in", async () => {
  const { call } = await setup();
  for (const [m, p] of [["GET", "/admin/api/merit/items"], ["POST", "/admin/api/merit/items"], ["PUT", "/admin/api/merit/items/sample-tb-place-1"],
    ["DELETE", "/admin/api/merit/items/sample-tb-place-1"], ["GET", "/admin/api/merit/interest"], ["DELETE", "/admin/api/merit/interest/" + "a".repeat(24)]]) {
    const r = await call(p, { method: m, body: m === "GET" || m === "DELETE" ? undefined : good() });
    assert.equal(r.status, 401, m + " " + p);
  }
});

test("B4: create / list / update / hide — audited with the item id and the changed fields, never the text", async () => {
  const { A, call, audits } = await setup();
  const c = await A("/merit/items", { method: "POST", body: good() });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  const id = c.j.item.id;
  assert.match(id, /^[a-z0-9][a-z0-9_-]{2,40}$/);
  assert.equal(c.j.item.sample, false);
  const list = await A("/merit/items");
  assert.equal(list.status, 200);
  assert.ok(list.j.items.some(x => x.id === id));
  assert.ok(Array.isArray(list.j.keys_allowed) && list.j.keys_allowed.includes("chong") && list.j.keys_allowed.includes("element:water"));
  assert.deepEqual(list.j.types, ["place", "offering", "chong", "lucky_item"]);
  assert.deepEqual(list.j.traditions, ["thai_buddhist", "chinese_folk", "hindu_brahman", "general"]);
  assert.equal(list.j.interest_form, false);
  assert.ok((await call("/v1/merit/guidance")).j.items.some(x => x.id === id));
  const u = await A("/merit/items/" + id, { method: "PUT", body: { title: tri("วัดในชุมชนของคุณ", "Your community temple", "你的社区寺庙"), sort: 1 } });
  assert.equal(u.status, 200, JSON.stringify(u.j));
  assert.equal(u.j.item.title.en, "Your community temple");
  const cr = await audits("merit.item.created"), up = await audits("merit.item.updated");
  assert.equal(cr.length, 1); assert.equal(up.length, 1);
  assert.equal(JSON.parse(cr[0].detail).id, id);
  assert.deepEqual(JSON.parse(up[0].detail).changed.sort(), ["sort", "title"]);
  for (const a of [...cr, ...up]) assert.ok(!/ชุมชน|community|社区/.test(a.detail), "audit holds no content text");
  const nf = await A("/merit/items/does-not-exist", { method: "PUT", body: { sort: 2 } });
  assert.equal(nf.status, 404);
});

test("B4: delete needs re-auth (403 reauth_required), then removes the item; audited", async () => {
  const { A, sudo, audits, env } = await setup();
  const r1 = await A("/merit/items/sample-tb-place-1", { method: "DELETE" });
  assert.equal(r1.status, 403); assert.equal(r1.j.code, "reauth_required");
  assert.ok(await env.DB.prepare("SELECT id FROM merit_items WHERE id = 'sample-tb-place-1'").first());
  await sudo();
  const r2 = await A("/merit/items/sample-tb-place-1", { method: "DELETE" });
  assert.equal(r2.status, 200);
  assert.equal(await env.DB.prepare("SELECT id FROM merit_items WHERE id = 'sample-tb-place-1'").first(), null);
  assert.equal((await audits("merit.item.deleted")).length, 1);
  assert.equal((await A("/merit/items/sample-tb-place-1", { method: "DELETE" })).status, 404);
});

/* ---------------- B5 validation + wording lint ---------------- */
test("B5: incomplete languages, wrong type / tradition / key, chong without the chong key, unknown fields — refused 400 merit_invalid", async () => {
  const { A, count } = await setup();
  const before = await count("merit_items");
  const bad = [
    good({ title: { th: "วัด", en: "Temple" } }),
    good({ body: tri("", "Body text that is long enough", "足够长的内容文字在这里写着") }),
    good({ type: "amulet" }), good({ tradition: "cult" }), good({ keys: [] }), good({ keys: ["any", "lottery:1"] }), good({ keys: ["free text"] }),
    good({ keys: Array.from({ length: 13 }, (_, i) => "animal:" + (i % 12)) }),
    good({ type: "chong", keys: ["any"] }),
    good({ price: 199 }), good({ price_satang: 19900 }), good({ vendor: "shop" }), good({ buy_url: "x" }), good({ phone: "0812345678" }), good({ email: "a@b.co" }),
    good({ place: { th: "วัด" } }), good({ status: "deleted" }), good({ title: tri("ก".repeat(121), "t".repeat(10), "标题标题") }),
    good({ body: tri("ข".repeat(1201), "b".repeat(30), "内容".repeat(15)) })
  ];
  for (const b of bad) {
    const r = await A("/merit/items", { method: "POST", body: b });
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 160));
    assert.ok(["merit_invalid", "merit_wording"].includes(r.j.code), r.j.code);
  }
  assert.equal(await count("merit_items"), before, "nothing stored");
});

// Fixed phrase sets (never edited to pass). Each must be refused with code merit_wording when put in any text field.
const BAD = {
  th: ["รับประกันว่าดวงดีขึ้น", "ได้ผลแน่นอน 100%", "ไหว้แล้วหายชง", "แก้ดวงให้คุณได้", "เปลี่ยนดวงชะตาทันที", "ถ้าไม่ไหว้จะเจอเคราะห์ร้าย", "ระวังอุบัติเหตุถึงชีวิต",
    "ช่วยรักษาโรคได้", "ขอเลขเด็ดงวดนี้", "ชุดไหว้ราคา 199 บาท", "สั่งซื้อได้ที่ร้านเรา", "เหลือเพียง 3 คิวเท่านั้น", "ด่วน วันนี้เท่านั้น", "ดูเพิ่มที่ https://shop.example",
    "ติดต่อ 081-234-5678", "อีเมล a@b.co"],
  en: ["Guaranteed to improve your luck", "This will fix your bad luck", "Remove the clash for good", "Change your destiny today", "Avoid disaster and death",
    "It cures illness", "Get your lucky numbers here", "Price: 199 baht", "Buy the set from our shop", "Only 3 slots left, hurry", "Limited time offer",
    "See https://shop.example", "Call +66 81 234 5678", "Mail me at a@b.co", "100% effective"],
  zh: ["保证转运", "一定会好运", "马上化解霉运", "改运改命", "避免灾难和死亡", "可以治病", "提供彩票号码", "价格199元", "在我们的商店购买", "名额有限，仅剩3个", "限时优惠",
    "访问 https://shop.example", "电话 081-234-5678"]
};
// Ordinary guidance wording that must pass.
const OK = {
  th: ["ตามความเชื่อ หลายคนนิยมไปไหว้พระที่วัดใกล้บ้านในวันเกิดของตน", "ถวายดอกไม้ ธูป และเทียน ด้วยใจสงบ", "บางคนนิยมพกของใช้สีที่ชอบติดตัว เช่น ผ้าเช็ดหน้า",
    "สวดมนต์และแผ่เมตตาก่อนนอน", "หลังตรุษจีน บางคนไปไหว้ไท้ส่วยเอี๊ยตามธรรมเนียม", "ใส่บาตรตอนเช้าตามกำลังของตน", "แต่งกายสุภาพเมื่อเข้าเขตศาสนสถาน",
    "ช่วงที่รู้สึกเหนื่อย ลองพักผ่อนให้พอและทำสมาธิสั้น ๆ"],
  en: ["By custom, many people visit a temple near home on their birthday", "Offer flowers, incense and candles with a calm mind",
    "Some people carry a small item in a colour they like", "Keep the shrine area clean and tidy", "After Chinese New Year some people pay respects at a Tai Sui hall",
    "Give what you comfortably can", "Sweets, milk and fruit are common offerings", "Dress modestly when you enter a place of worship"],
  zh: ["很多人会在生日时到附近的寺庙参拜", "供奉鲜花、香和蜡烛，保持心境平和", "有人会随身携带自己喜欢颜色的小物件", "农历新年后，有人会到供奉太岁的庙宇参拜",
    "量力而行，随喜布施", "进入宗教场所时请穿着得体", "保持供桌整洁"]
};

test("B5: wording lint — every phrase of the fixed bad set is caught in TH / EN / ZH; every ordinary phrase passes", async () => {
  const M = await import(B + "merit.js");
  const miss = [], fp = [];
  for (const l of LANGS) {
    for (const p of BAD[l]) if (!M.lintMerit(p).length) miss.push(l + ": " + p);
    for (const p of OK[l]) { const h = M.lintMerit(p); if (h.length) fp.push(l + ": " + p + " -> " + JSON.stringify(h)); }
  }
  assert.deepEqual(miss, [], "missed");
  assert.deepEqual(fp, [], "false positives");
  for (const p of ["รับประกันว่าดวงดีขึ้น", "Guaranteed to improve your luck", "保证转运"]) assert.ok(M.lintMerit(p).some(h => h.code === "guarantee"), p);
  assert.ok(M.lintMerit("Only 3 slots left, hurry").some(h => h.code === "urgency"));
  assert.ok(M.lintMerit("ชุดไหว้ราคา 199 บาท").some(h => h.code === "price"));
  assert.ok(M.lintMerit("ติดต่อ 081-234-5678").some(h => h.code === "personal"));
  assert.deepEqual(M.lintMerit("Only 3 slots left, hurry", { only: ["price"] }), [], "only= limits the categories");
});

test("B5: the admin API refuses lint hits with 400 merit_wording naming the field, language and category", async () => {
  const { A, count } = await setup();
  const before = await count("merit_items");
  for (const l of LANGS) for (const p of BAD[l]) {
    const body = good();
    body.body = { ...body.body, [l]: body.body[l] + " " + p };
    const r = await A("/merit/items", { method: "POST", body });
    assert.equal(r.status, 400, l + ": " + p);
    assert.equal(r.j.code, "merit_wording", l + ": " + p);
    assert.match(r.j.error, new RegExp("body\\." + l), "names the field: " + r.j.error);
  }
  const upd = await A("/merit/items/sample-tb-place-1", { method: "PUT", body: { title: tri("วัด การันตีผล", "Temple", "寺庙") } });
  assert.equal(upd.status, 400); assert.equal(upd.j.code, "merit_wording");
  assert.equal(await count("merit_items"), before);
});

/* ---------------- B6 interest form ---------------- */
test("B6: interest form OFF by default — 404 merit_interest_off before any check; nothing written anywhere", async () => {
  const { call, count, env } = await setup();
  const rl0 = await count("rate_limits");
  for (const body of [interest(), {}, interest({ name: "ควรฆ่าตัวตายดีไหม" })]) {
    const r = await call("/v1/merit/interest", { method: "POST", body, headers: TS });
    assert.equal(r.status, 404); assert.equal(r.j.code, "merit_interest_off");
  }
  assert.equal(await count("merit_interest"), 0);
  assert.equal(await count("rate_limits"), rl0, "not even a rate-limit row");
  for (const v of ["true", "1", "yes", "off", ""]) {
    env.MERIT_INTEREST_FORM = v;
    assert.equal((await call("/v1/merit/interest", { method: "POST", body: interest(), headers: TS })).status, 404, v);
  }
});

test("B6: ON — Turnstile is required (fail closed) and consent is required", async () => {
  const { call, count } = await setup({ MERIT_INTEREST_FORM: "on" });
  assert.equal((await call("/v1/merit/interest", { method: "POST", body: interest() })).status, 403, "no token");
  assert.equal((await call("/v1/merit/interest", { method: "POST", body: interest(), headers: { "X-Turnstile-Token": "good:lead" } })).status, 403, "wrong action");
  const c = await call("/v1/merit/interest", { method: "POST", body: interest({ consent: false }), headers: TS });
  assert.equal(c.status, 400); assert.equal(c.j.code, "consent_required");
  assert.equal(await count("merit_interest"), 0);
  const { call: call2 } = await setup({ MERIT_INTEREST_FORM: "on", TURNSTILE_SECRET: "" });
  assert.equal((await call2("/v1/merit/interest", { method: "POST", body: interest(), headers: TS })).status, 503, "Turnstile not configured: closed");
});

test("B6: ON — only the minimum fields: anything else (birth date, address, photo, note) is refused", async () => {
  const { call, count } = await setup({ MERIT_INTEREST_FORM: "on" });
  for (const extra of [{ birth_date: "1990-01-01" }, { birth_time: "07:00" }, { address: "x" }, { photo: "data:" }, { note: "hello" }, { tradition: "chinese_folk" }, { email2: "a@b.co" }]) {
    const r = await call("/v1/merit/interest", { method: "POST", body: interest(extra), headers: TS });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  for (const b of [interest({ name: "" }), interest({ name: "x".repeat(61) }), interest({ channel: "fax" }), interest({ channel: "phone", contact: "abc" }),
    interest({ channel: "email", contact: "not-an-email" }), interest({ item_id: "nope" }), interest({ date_from: "2027-02-01", date_to: "2027-01-01" }),
    interest({ date_from: "10/01/2027" }), interest({ date_from: "2027-01-01", date_to: "2027-06-30" })]) {
    const r = await call("/v1/merit/interest", { method: "POST", body: b, headers: TS });
    assert.equal(r.status, 400, JSON.stringify(b));
  }
  assert.equal(await count("merit_interest"), 0);
});

test("B6: ON — crisis text in the name or contact is refused with 403 support (help resources), never stored", async () => {
  const { call, count } = await setup({ MERIT_INTEREST_FORM: "on" });
  for (const name of ["อยากตาย", "I want to die", "不想活了", "โดนทำร้ายร่างกาย"]) {
    const r = await call("/v1/merit/interest", { method: "POST", body: interest({ name }), headers: TS });
    assert.equal(r.status, 403, name); assert.equal(r.j.code, "support", name);
    assert.ok(/1323/.test(JSON.stringify(r.j)), "help line in the answer");
  }
  const r2 = await call("/v1/merit/interest", { method: "POST", body: interest({ contact: "kill myself" }), headers: TS });
  assert.equal(r2.status, 403);
  assert.equal(await count("merit_interest"), 0);
});

test("B6: ON — a valid request is stored with only the minimum; hidden or unknown items are refused; rate limited", async () => {
  const { call, A, env, count } = await setup({ MERIT_INTEREST_FORM: "on" });
  const r = await call("/v1/merit/interest", { method: "POST", body: interest(), headers: TS });
  assert.equal(r.status, 201, JSON.stringify(r.j));
  assert.match(r.j.id, /^[a-f0-9]{24}$/);
  const row = await env.DB.prepare("SELECT * FROM merit_interest").first();
  assert.equal(row.name, "Tum"); assert.equal(row.channel, "line"); assert.equal(row.contact, "tum_test"); assert.equal(row.item_id, "sample-tb-place-1");
  assert.equal(row.date_from, "2027-01-10"); assert.equal(row.date_to, "2027-01-20"); assert.equal(row.status, "new"); assert.ok(row.consent_version);
  await A("/merit/items/sample-tb-place-1", { method: "PUT", body: { status: "hidden" } });
  assert.equal((await call("/v1/merit/interest", { method: "POST", body: interest(), headers: TS })).status, 400, "hidden item");
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await call("/v1/merit/interest", { method: "POST", body: interest({ item_id: "sample-cf-place-1" }), headers: TS })).status;
  assert.equal(last, 429, "per-caller limit");
  assert.ok(await count("merit_interest") <= 6);
});

/* ---------------- B7 retention + admin inbox ---------------- */
test("B7: interest requests are purged after MERIT_INTEREST_DAYS (default 90); newer ones are kept", async () => {
  const { env } = await setup();
  const { runMaintenance, retentionConfig } = await import(B + "retention.js");
  assert.equal(retentionConfig(env).meritInterestDays, 90);
  const t = nowS();
  const ins = (id, age) => env.DB.prepare("INSERT INTO merit_interest (id, created_at, item_id, name, channel, contact, date_from, date_to, lang, consent_version, status) " +
    "VALUES (?1, ?2, 'sample-tb-place-1', 'n', 'line', 'c', '2027-01-01', '2027-01-02', 'th', 'm1', 'new')").bind(id, t - age).run();
  await ins("a".repeat(24), 91 * 86400); await ins("b".repeat(24), 89 * 86400);
  const r = await runMaintenance(env, t);
  assert.equal(r.purged.merit_interest, 1);
  const left = (await env.DB.prepare("SELECT id FROM merit_interest").all()).results.map(x => x.id);
  assert.deepEqual(left, ["b".repeat(24)]);
  env.MERIT_INTEREST_DAYS = "30";
  assert.equal(retentionConfig(env).meritInterestDays, 30);
  await runMaintenance(env, t + 60 * 86400);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_interest").first()).n, 0);
});

test("B7: admin inbox lists requests and the switch state; erasing one needs re-auth and is audited without personal data", async () => {
  const { call, A, sudo, audits, count } = await setup({ MERIT_INTEREST_FORM: "on" });
  const id = (await call("/v1/merit/interest", { method: "POST", body: interest(), headers: TS })).j.id;
  const l = await A("/merit/interest");
  assert.equal(l.status, 200);
  assert.equal(l.j.interest_form, true);
  assert.equal(l.j.retention_days, 90);
  assert.equal(l.j.requests.length, 1);
  assert.equal(l.j.requests[0].id, id);
  const d1 = await A("/merit/interest/" + id, { method: "DELETE" });
  assert.equal(d1.status, 403); assert.equal(d1.j.code, "reauth_required");
  await sudo();
  assert.equal((await A("/merit/interest/" + id, { method: "DELETE" })).status, 200);
  assert.equal(await count("merit_interest"), 0);
  const a = await audits("merit.interest.deleted");
  assert.equal(a.length, 1);
  assert.ok(!/Tum|tum_test/.test(a[0].detail), "no name or contact in the audit log");
  assert.equal((await A("/merit/interest/" + id, { method: "DELETE" })).status, 404);
});

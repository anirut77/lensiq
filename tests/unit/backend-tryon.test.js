"use strict";
// tests/unit/backend-tryon.test.js — Try-On MVP merchant back-office on the API Worker (docs/TRYON-DESIGN.md T2 subset;
// BO-1: the existing admin sign-in, no org accounts yet; TO-D7: only garment cut-outs are stored). FIXED TEST SET:
// written and hash-locked (evals-locks/tryon-mvp.sha256, ~/LENSIQ-field/evals/tryon-mvp/locked.sha256) BEFORE
// backend/src/tryon.js, backend/src/tryon-store.js and migration 0017_tryon.sql were written. Local only (in-memory D1);
// nothing here is deployed and no migration is applied to the live database.
//
//   T1 migration 0017_tryon.sql: listed in health.js MIGRATIONS (after 0016) with schema probes; named when missing
//   T2 roles on the existing login: the owner creates "tryon_admin" / "tryon_editor" accounts through POST /reviewers
//      {username, role} (default role stays the merit reviewer); an unknown role is refused; GET /me names the role
//   T3 role matrix (enforced on the Worker): owner + tryon_admin = full catalogue incl. publish / hide / delete;
//      tryon_editor = create / edit / upload, status only draft or in_review (no publish, hide, delete); try-on accounts
//      get 403 forbidden_role on every other admin route (merit, billing, AI, reviewers …); merit reviewers get 403 on
//      every try-on route
//   T4 catalogue validation: fixed category list with NO underwear / lingerie / swimwear / bodysuit / sleepwear; anchor
//      derived from the category (face / pose); name TH required, EN / ZH optional, ≤ 120 chars; https product link;
//      integer satang prices; sizes / colours bounded; unknown fields refused
//   T5 image upload limits: PNG / WebP / JPEG only, magic bytes must match the declared type, PNG size read from IHDR
//      must equal the declared size, ≤ 2048 px per side, decoded bytes ≤ 1,000,000 (D1 fallback store); the device face
//      blur must have run and the editor must confirm "no visible face remains" (face_check) or the upload is refused
//   T6 publish needs an image; an editor's edit of a published item sends it back to in_review (off the public list)
//   T7 public: GET /v1/tryon/catalog = published items only, public fields only (no notes / created_by / status);
//      GET /v1/tryon/asset/:id serves the image of a published item only (nosniff, exact type), 404 otherwise
//   T8 store behind an interface: with a bound R2 bucket (env.TRYON_BUCKET) bytes go to R2 and the D1 row keeps no data;
//      without it the D1 fallback is used; deleting an item deletes its image from the store
//   T9 audit: every write writes one audit row with ids and field names only (never the image, never the price value)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const OWNER_PW = "correct horse battery staple tryon";
const ACC_PW = "a long try-on passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);

/** minimal PNG: signature + IHDR (w × h) + padding bytes; enough for the Worker's checks (no decoding on the Worker) */
function png(w, h, pad = 64) {
  const b = Buffer.alloc(8 + 25 + pad);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = 6;
  return b;
}
const webp = (pad = 64) => { const b = Buffer.alloc(12 + pad); b.write("RIFF", 0, "latin1"); b.writeUInt32LE(4 + pad, 4); b.write("WEBP", 8, "latin1"); return b; };
const jpeg = (pad = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(pad)]);
const FACE_OK = { ran: true, faces: 0, confirmed: true };
const asset = (o = {}) => ({ mime: "image/png", data: png(400, 500).toString("base64"), w: 400, h: 500, face_check: FACE_OK, ...o });
const item = (o = {}) => ({ category: "glasses", name_th: "แว่นกรอบดำ", name_en: "Black frame glasses", name_zh: "黑框眼镜", price: 59000, sizes: ["M"], colours: [{ name: "black", hex: "#111111" }], product_url: "https://shop.example/p/1", ...o });

function fakeR2() {
  const m = new Map();
  return {
    _m: m,
    put: async (k, v, o) => { m.set(k, { v: Buffer.from(v), o }); return {}; },
    get: async k => { const e = m.get(k); return e ? { arrayBuffer: async () => e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.length), httpMetadata: e.o && e.o.httpMetadata } : null; },
    delete: async k => { m.delete(k); }
  };
}

async function setup(vars = {}, extra = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 13).toString("base64"), ...vars });
  Object.assign(env, extra);
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip }), env, {});
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, r };
  };
  const totp = (secretB32, d = 0) => crypto.totpAt(crypto.base32Decode(secretB32), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (path, o = {}) => call("/admin/api" + path, { ...o, token: o.token || owner });
  const st = await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } });
  const ownerSecret = st.j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(ownerSecret, -1) } })).status, 200);
  const sudo = async () => {
    await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    assert.equal((await O("/reauth", { method: "POST", body: { password: OWNER_PW, totp: await totp(ownerSecret) } })).status, 200);
  };
  /** creates + activates an account with the given role (undefined = the merit reviewer default) */
  const account = async (username, role) => {
    await sudo();
    const c = await O("/reviewers", { method: "POST", body: role === undefined ? { username } : { username, role } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: ACC_PW } });
    assert.equal(s1.status, 200, JSON.stringify(s1.j));
    const s2 = await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
    assert.equal(s2.status, 200, JSON.stringify(s2.j));
    const l = await call("/admin/api/login", { method: "POST", body: { username, password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, JSON.stringify(l.j));
    return { id: c.j.reviewer.id, token: l.j.token, username, created: c.j };
  };
  const A = (acc, path, o = {}) => call("/admin/api" + path, { ...o, token: acc.token });
  const audits = async prefix => ((await env.DB.prepare("SELECT actor, action, detail FROM audit_log WHERE action LIKE ?1 ORDER BY id").bind(prefix + "%").all()).results || []);
  const statusOf = async id => (await env.DB.prepare("SELECT status FROM tryon_items WHERE id = ?1").bind(id).first() || {}).status;
  const catalog = async () => (await call("/v1/tryon/catalog")).j;
  /** owner creates an item with an image and publishes it; returns the id */
  const published = async (o = {}) => {
    const c = await O("/tryon/items", { method: "POST", body: item(o) });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    assert.equal((await O(`/tryon/items/${c.j.item.id}/asset`, { method: "PUT", body: asset() })).status, 200);
    assert.equal((await O(`/tryon/items/${c.j.item.id}/status`, { method: "POST", body: { status: "published" } })).status, 200);
    return c.j.item.id;
  };
  return { env, call, O, sudo, account, A, audits, statusOf, catalog, published };
}

/* ---------------- T1 ---------------- */
test("T1: migration 0017_tryon.sql follows 0016, has schema probes, and is named when missing", async () => {
  assert.ok(existsSync(join(ROOT, "backend", "migrations", "0017_tryon.sql")));
  const { MIGRATIONS, deepHealth } = await import(B + "health.js");
  const i = MIGRATIONS.indexOf("0017_tryon.sql");
  assert.ok(i > 0 && MIGRATIONS[i - 1] === "0016_merit_review.sql", "0017 directly after 0016");
  const src = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(src, /\["0017_tryon\.sql", "SELECT [^"]*FROM tryon_items/);
  assert.match(src, /\["0017_tryon\.sql", "SELECT [^"]*FROM tryon_assets/);
  assert.match(src, /\["0017_tryon\.sql", "SELECT role FROM admin_reviewers/);
  const env = createEnv();
  assert.equal((await deepHealth(env)).ok, true);
  await env.DB.exec("DROP TABLE tryon_assets");
  assert.deepEqual((await deepHealth(env)).migrations.missing, ["0017_tryon.sql"]);
});

/* ---------------- T2 ---------------- */
test("T2: the owner creates try-on admin / editor accounts on the existing login; default stays the merit reviewer; /me names the role", async () => {
  const { O, sudo, account, A, env } = await setup();
  await sudo();
  const bad = await O("/reviewers", { method: "POST", body: { username: "x1", role: "superuser" } });
  assert.equal(bad.status, 400); assert.equal(bad.j.code, "invalid_role");
  const adm = await account("shopadmin", "tryon_admin"), ed = await account("shopeditor", "tryon_editor"), mr = await account("meritrev");
  assert.equal((await A(adm, "/me")).j.role, "tryon_admin");
  assert.equal((await A(ed, "/me")).j.role, "tryon_editor");
  assert.equal((await A(mr, "/me")).j.role, "reviewer", "merit reviewers unchanged");
  const roles = Object.fromEntries(((await env.DB.prepare("SELECT username, role FROM admin_reviewers").all()).results).map(r => [r.username, r.role]));
  assert.deepEqual(roles, { shopadmin: "tryon_admin", shopeditor: "tryon_editor", meritrev: "merit" });
  const list = (await O("/reviewers")).j.reviewers;
  assert.ok(list.every(r => typeof r.role === "string"), "role shown in the owner's account list");
});

/* ---------------- T3 ---------------- */
const NON_TRYON = [["GET", "/ai"], ["GET", "/billing"], ["GET", "/audit"], ["GET", "/reviewers"], ["POST", "/reviewers"], ["GET", "/merit/items"], ["POST", "/merit/items"],
  ["GET", "/leads"], ["GET", "/members"], ["GET", "/retention"], ["POST", "/retention/run"], ["GET", "/ai/keys"], ["GET", "/nope"]];
test("T3: try-on accounts get 403 forbidden_role outside the catalogue; merit reviewers get 403 on the catalogue", async () => {
  const { account, A } = await setup();
  const adm = await account("shopadmin", "tryon_admin"), ed = await account("shopeditor", "tryon_editor"), mr = await account("meritrev");
  for (const acc of [adm, ed]) for (const [m, p] of NON_TRYON) {
    const r = await A(acc, p, { method: m, body: m === "GET" ? undefined : {} });
    assert.equal(r.status, 403, `${acc.username} ${m} ${p} -> ${r.status}`); assert.equal(r.j.code, "forbidden_role");
  }
  for (const [m, p] of [["GET", "/tryon/items"], ["POST", "/tryon/items"], ["PUT", "/tryon/items/abcdef123456"], ["DELETE", "/tryon/items/abcdef123456"],
    ["POST", "/tryon/items/abcdef123456/status"], ["PUT", "/tryon/items/abcdef123456/asset"]]) {
    const r = await A(mr, p, { method: m, body: m === "GET" || m === "DELETE" ? undefined : {} });
    assert.equal(r.status, 403, `merit reviewer ${m} ${p} -> ${r.status}`); assert.equal(r.j.code, "forbidden_role");
  }
});

test("T3: editor creates / edits / uploads but cannot publish, hide or delete; admin and owner can", async () => {
  const { O, account, A, statusOf } = await setup();
  const adm = await account("shopadmin", "tryon_admin"), ed = await account("shopeditor", "tryon_editor");
  const c = await A(ed, "/tryon/items", { method: "POST", body: item() });
  assert.equal(c.status, 201, JSON.stringify(c.j)); const id = c.j.item.id;
  assert.equal(c.j.item.status, "draft");
  const asPub = await A(ed, "/tryon/items", { method: "POST", body: item({ status: "published" }) });
  assert.equal(asPub.status, 403); assert.equal(asPub.j.code, "forbidden_status");
  assert.equal((await A(ed, `/tryon/items/${id}/asset`, { method: "PUT", body: asset() })).status, 200);
  assert.equal((await A(ed, `/tryon/items/${id}`, { method: "PUT", body: { status: "in_review" } })).status, 200);
  assert.equal(await statusOf(id), "in_review");
  for (const s of ["published", "hidden"]) {
    const r = await A(ed, `/tryon/items/${id}/status`, { method: "POST", body: { status: s } });
    assert.equal(r.status, 403, s); assert.equal(r.j.code, "forbidden_role");
  }
  const d = await A(ed, `/tryon/items/${id}`, { method: "DELETE" });
  assert.equal(d.status, 403); assert.equal(d.j.code, "forbidden_role");
  assert.equal((await A(adm, `/tryon/items/${id}/status`, { method: "POST", body: { status: "published" } })).status, 200);
  assert.equal(await statusOf(id), "published");
  assert.equal((await A(adm, `/tryon/items/${id}/status`, { method: "POST", body: { status: "hidden" } })).status, 200);
  assert.equal((await A(adm, `/tryon/items/${id}`, { method: "DELETE" })).status, 200);
  assert.equal(await statusOf(id), undefined);
  const c2 = await O("/tryon/items", { method: "POST", body: item() });
  assert.equal(c2.status, 201);
  assert.equal((await O(`/tryon/items/${c2.j.item.id}`, { method: "DELETE" })).status, 200, "owner deletes (sudo window from setup)");
});

/* ---------------- T4 ---------------- */
test("T4: categories are a fixed list without underwear / swimwear; anchor follows the category; fields validated; unknown fields refused", async () => {
  const { O } = await setup();
  const g = await O("/tryon/items");
  assert.equal(g.status, 200);
  const cats = g.j.categories.map(c => c.id);
  for (const c of ["tops", "outerwear", "dresses", "hats", "glasses", "earrings"]) assert.ok(cats.includes(c), c);
  for (const c of ["underwear", "lingerie", "swimwear", "bikini", "bodysuit", "sleepwear", "bra"]) {
    assert.ok(!cats.includes(c), c);
    const r = await O("/tryon/items", { method: "POST", body: item({ category: c }) });
    assert.equal(r.status, 400, c); assert.equal(r.j.code, "invalid_category");
  }
  assert.equal((await O("/tryon/items", { method: "POST", body: item({ category: "glasses" }) })).j.item.anchor, "face");
  assert.equal((await O("/tryon/items", { method: "POST", body: item({ category: "hats" }) })).j.item.anchor, "face");
  assert.equal((await O("/tryon/items", { method: "POST", body: item({ category: "tops" }) })).j.item.anchor, "pose");
  const bad = [
    [{ name_th: "" }, "invalid_name"], [{ name_th: "ก".repeat(121) }, "invalid_name"], [{ name_en: "x".repeat(121) }, "invalid_name"],
    [{ product_url: "http://shop.example/p" }, "invalid_url"], [{ product_url: "javascript:alert(1)" }, "invalid_url"],
    [{ price: -1 }, "invalid_price"], [{ price: 1.5 }, "invalid_price"], [{ price: "100" }, "invalid_price"],
    [{ sizes: Array(21).fill("M") }, "invalid_sizes"], [{ sizes: ["x".repeat(17)] }, "invalid_sizes"],
    [{ colours: [{ name: "red", hex: "red" }] }, "invalid_colours"], [{ colours: Array(13).fill({ name: "a", hex: "#000000" }) }, "invalid_colours"],
    [{ anchor: "pose" }, "unknown_field"], [{ customer_photo: "x" }, "unknown_field"]
  ];
  for (const [o, code] of bad) {
    const r = await O("/tryon/items", { method: "POST", body: item(o) });
    assert.equal(r.status, 400, JSON.stringify(o)); assert.equal(r.j.code, code, JSON.stringify(o) + " " + JSON.stringify(r.j));
  }
  const ok = await O("/tryon/items", { method: "POST", body: item({ name_en: undefined, name_zh: undefined }) });
  assert.equal(ok.status, 201, "EN / ZH names optional (the page falls back to Thai)");
});

/* ---------------- T5 ---------------- */
test("T5: image upload limits: type + magic bytes, PNG size from IHDR, ≤ 2048 px, ≤ 1,000,000 bytes, face check required", async () => {
  const { O } = await setup();
  const id = (await O("/tryon/items", { method: "POST", body: item() })).j.item.id;
  const put = b => O(`/tryon/items/${id}/asset`, { method: "PUT", body: b });
  const cases = [
    [asset({ mime: "image/gif" }), "invalid_type"],
    [asset({ mime: "image/svg+xml" }), "invalid_type"],
    [asset({ mime: "image/png", data: jpeg().toString("base64") }), "magic_mismatch"],
    [asset({ mime: "image/jpeg", data: png(10, 10).toString("base64"), w: 10, h: 10 }), "magic_mismatch"],
    [asset({ w: 401 }), "size_mismatch"],
    [asset({ data: png(2049, 100).toString("base64"), w: 2049, h: 100 }), "too_large_px"],
    [asset({ mime: "image/webp", data: webp().toString("base64"), w: 0, h: 10 }), "too_large_px"],
    [asset({ data: png(400, 500, 1000001).toString("base64") }), "too_large_bytes"],
    [asset({ face_check: undefined }), "face_check_required"],
    [asset({ face_check: { ran: false, faces: 0, confirmed: true } }), "face_check_required"],
    [asset({ face_check: { ran: true, faces: 0, confirmed: false } }), "face_check_required"],
    [asset({ data: "not base64 !!" }), "invalid_data"]
  ];
  for (const [b, code] of cases) {
    const r = await put(b);
    assert.equal(r.status, 400, code); assert.equal(r.j.code, code, code + " " + JSON.stringify(r.j));
  }
  for (const b of [asset(), asset({ mime: "image/webp", data: webp().toString("base64"), w: 800, h: 800 }), asset({ mime: "image/jpeg", data: jpeg().toString("base64"), w: 640, h: 480 })]) {
    const r = await put(b);
    assert.equal(r.status, 200, b.mime + " " + JSON.stringify(r.j));
  }
});

/* ---------------- T6 + T7 ---------------- */
test("T6/T7: publish needs an image; only published items are public, with public fields only; editor edits unpublish", async () => {
  const { O, account, A, catalog, published, call, statusOf } = await setup();
  const noImg = (await O("/tryon/items", { method: "POST", body: item() })).j.item.id;
  const r = await O(`/tryon/items/${noImg}/status`, { method: "POST", body: { status: "published" } });
  assert.equal(r.status, 409); assert.equal(r.j.code, "asset_required");
  const id = await published({ notes: "internal note" });
  const cat = await catalog();
  assert.deepEqual(cat.items.map(x => x.id), [id]);
  const x = cat.items[0];
  assert.deepEqual(x.name, { th: "แว่นกรอบดำ", en: "Black frame glasses", zh: "黑框眼镜" });
  assert.equal(x.anchor, "face"); assert.equal(x.price, 59000);
  for (const k of ["notes", "created_by", "updated_by", "status", "data", "shop_internal"]) assert.ok(!(k in x), "no " + k);
  assert.match(x.asset.url, new RegExp(`/v1/tryon/asset/${id}$`));
  const img = await call(`/v1/tryon/asset/${id}`);
  assert.equal(img.status, 200);
  assert.equal(img.r.headers.get("Content-Type"), "image/png");
  assert.equal(img.r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(Buffer.from(await img.r.arrayBuffer()).subarray(0, 8), png(1, 1).subarray(0, 8));
  assert.equal((await call(`/v1/tryon/asset/${noImg}`)).status, 404, "unpublished image not served");
  assert.equal((await call("/v1/tryon/asset/zzzzzz")).status, 404);
  const ed = await account("shopeditor", "tryon_editor");
  assert.equal((await A(ed, `/tryon/items/${id}`, { method: "PUT", body: { name_en: "Black frames" } })).status, 200);
  assert.equal(await statusOf(id), "in_review", "an editor's change needs approval again");
  assert.deepEqual((await catalog()).items, []);
  assert.equal((await call(`/v1/tryon/asset/${id}`)).status, 404);
});

/* ---------------- T8 ---------------- */
test("T8: store interface: R2 when bound (D1 keeps no bytes), D1 fallback otherwise; delete removes the bytes", async () => {
  const bucket = fakeR2();
  const r2 = await setup({}, { TRYON_BUCKET: bucket });
  const id = await r2.published();
  const row = await r2.env.DB.prepare("SELECT store, data FROM tryon_assets WHERE item_id = ?1").bind(id).first();
  assert.equal(row.store, "r2"); assert.equal(row.data, null);
  assert.equal(bucket._m.size, 1);
  assert.equal((await r2.call(`/v1/tryon/asset/${id}`)).status, 200);
  assert.equal((await r2.O(`/tryon/items/${id}`, { method: "DELETE" })).status, 200);
  assert.equal(bucket._m.size, 0, "bytes removed from R2");
  const d1 = await setup();
  const id2 = await d1.published();
  const row2 = await d1.env.DB.prepare("SELECT store, data FROM tryon_assets WHERE item_id = ?1").bind(id2).first();
  assert.equal(row2.store, "d1"); assert.ok(row2.data && row2.data.length > 0);
  assert.equal((await d1.O(`/tryon/items/${id2}`, { method: "DELETE" })).status, 200);
  assert.equal((await d1.env.DB.prepare("SELECT COUNT(*) AS n FROM tryon_assets").first()).n, 0);
  assert.equal((await d1.O("/tryon/items")).j.store, "d1", "the back-office says which store is in use");
});

/* ---------------- T9 ---------------- */
test("T9: every write is audited with ids / field names only — never the image or the price value", async () => {
  const { O, account, A, audits } = await setup();
  const ed = await account("shopeditor", "tryon_editor");
  const id = (await A(ed, "/tryon/items", { method: "POST", body: item({ price: 77777 }) })).j.item.id;
  await A(ed, `/tryon/items/${id}`, { method: "PUT", body: { price: 88888, notes: "secret note" } });
  await A(ed, `/tryon/items/${id}/asset`, { method: "PUT", body: asset() });
  await O(`/tryon/items/${id}/status`, { method: "POST", body: { status: "published" } });
  await O(`/tryon/items/${id}`, { method: "DELETE" });
  const rows = await audits("tryon.");
  assert.deepEqual(rows.map(r => r.action), ["tryon.item.created", "tryon.item.updated", "tryon.asset.set", "tryon.item.status", "tryon.item.deleted"]);
  assert.equal(rows[0].actor, "reviewer:" + ed.id);
  assert.equal(rows[3].actor, "owner");
  const all = JSON.stringify(rows);
  for (const leak of ["77777", "88888", "secret note", "iVBOR", "แว่นกรอบดำ"]) assert.ok(!all.includes(leak), "audit leaks " + leak);
  assert.match(rows[1].detail, /price/); assert.match(rows[1].detail, /notes/);
});

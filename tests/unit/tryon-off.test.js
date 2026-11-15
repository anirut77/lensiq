"use strict";
// tests/unit/tryon-off.test.js — Try-On is switched OFF on the Worker (owner decision 2026-11-14: Try-On gets no R2 and
// no server deploy). FIXED TEST SET: written and hash-locked (evals-locks/tryon-off.sha256,
// ~/LENSIQ-field/evals/tryon-off/locked.sha256) BEFORE the switch was coded. Local only (in-memory D1, fake R2).
// Same pattern as ORG_ACCOUNTS (org-p1 F1–F4).
//
//   W1 the switch ships off: backend/wrangler.toml TRYON = "off" in [vars] and in [env.test.vars]
//   W2 switch not "on" (unset, "", "off", "true", "1", "yes", "ON-ish", "o n"): every Try-On route — public catalogue
//      and asset, every back-office catalogue route, any other path under /v1/tryon or /admin/api/tryon — answers 404
//      {code: "tryon_off"} for anonymous callers, the owner, a tryon_admin and a tryon_editor, before Origin, session,
//      D1 or R2: zero SQL statements and zero R2 calls; nothing in the catalogue changes
//   W3 /v1/config and GET /admin/api/me report tryon: false while off (also the allow-list shortcut of /v1/config,
//      which answers without D1), tryon: true with " On " (trimmed, any case); a try-on account's /me says the same
//   W4 switch "on" (any case, trimmed): the routes work as before — public catalogue lists the published item, the
//      asset is served (exact type, nosniff), owner / tryon_admin list, create, edit, upload, publish, delete (with
//      re-auth), the editor creates; the rest of the back office keeps working with the switch off
//   W5 admin UI: the Try-On tab is hidden unless GET /me says tryon === true; a try-on account sees a "switched off"
//      message (TH default, EN / ZH in i18n/en-admin.js, i18n/zh-admin.js) instead of the catalogue
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = path.join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "o".repeat(40);
const OWNER_PW = "correct horse battery staple tryon-off";
const ACC_PW = "a long try-on switch passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);
const PNG = (() => { const b = Buffer.alloc(8 + 25 + 64); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b, 0); b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1"); b.writeUInt32BE(40, 16); b.writeUInt32BE(50, 20); b[24] = 8; b[25] = 6; return b; })();
const ASSET = () => ({ mime: "image/png", data: PNG.toString("base64"), w: 40, h: 50, face_check: { ran: true, faces: 0, confirmed: true } });
const ITEM = () => ({ category: "glasses", name_th: "แว่นกรอบดำ", name_en: "Black frame glasses", price: 59000 });

/** fake R2 bucket that records every call */
function fakeR2(rec) {
  const m = new Map();
  const note = op => { if (rec.on) rec.r2.push(op); };
  return {
    put: async (k, v, o) => { note("put"); m.set(k, { v: Buffer.from(v), o }); return {}; },
    get: async k => {
      note("get"); const e = m.get(k);
      return e ? { arrayBuffer: async () => e.v.buffer.slice(e.v.byteOffset, e.v.byteOffset + e.v.length), httpMetadata: e.o && e.o.httpMetadata } : null;
    },
    delete: async k => { note("delete"); m.delete(k); },
    head: async k => { note("head"); return m.has(k) ? {} : null; },
    list: async () => { note("list"); return { objects: [] }; }
  };
}

/** one Worker env with the switch ON while the fixture is built (owner, tryon_admin, tryon_editor, one published item) */
async function setup() {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const rec = { on: false, sql: [], r2: [] };
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 19).toString("base64"), TRYON: "on" });
  env.TRYON_BUCKET = fakeR2(rec);
  // every D1 entry point is recorded while rec.on is true
  const prep = env.DB.prepare.bind(env.DB), batch = env.DB.batch.bind(env.DB), exec = env.DB.exec.bind(env.DB);
  env.DB.prepare = sql => { if (rec.on) rec.sql.push(String(sql)); return prep(sql); };
  env.DB.batch = stmts => { if (rec.on) rec.sql.push("BATCH"); return batch(stmts); };
  env.DB.exec = sql => { if (rec.on) rec.sql.push(String(sql)); return exec(sql); };
  const call = async (p, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(p, { method: o.method || "GET", body: o.body, headers, ...(o.origin !== undefined ? { origin: o.origin } : {}) }), env, {});
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, r };
  };
  const totp = (s, d = 0) => crypto.totpAt(crypto.base32Decode(s), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, token: owner });
  const os = (await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } })).j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(os, -1) } })).status, 200);
  const ownerReauth = async () => { await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run(); return { password: OWNER_PW, totp: await totp(os) }; };
  const account = async (username, role) => {
    assert.equal((await O("/reauth", { method: "POST", body: await ownerReauth() })).status, 200);
    const c = await O("/reviewers", { method: "POST", body: { username, role } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: ACC_PW } });
    assert.equal(s1.status, 200, JSON.stringify(s1.j));
    assert.equal((await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } })).status, 200);
    const l = await call("/admin/api/login", { method: "POST", body: { username, password: ACC_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, JSON.stringify(l.j));
    return { token: l.j.token, secret: s1.j.secret };
  };
  const tadmin = await account("shopadmin", "tryon_admin");
  const teditor = await account("shopeditor", "tryon_editor");
  const accReauth = async acc => { await env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run(); return { password: ACC_PW, totp: await totp(acc.secret) }; };
  // one published item with an image (stored in the fake R2)
  const c = await O("/tryon/items", { method: "POST", body: ITEM() });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  const id = c.j.item.id;
  assert.equal((await O(`/tryon/items/${id}/asset`, { method: "PUT", body: ASSET() })).status, 200);
  assert.equal((await O(`/tryon/items/${id}/status`, { method: "POST", body: { status: "published" } })).status, 200);
  const snapshot = async () => JSON.stringify([
    (await prep("SELECT * FROM tryon_items ORDER BY id").all()).results,
    (await prep("SELECT id, item_id, mime, bytes, w, h, sha256, store FROM tryon_assets ORDER BY id").all()).results]);
  return { env, rec, call, O, owner, tadmin, teditor, accReauth, ownerReauth, id, snapshot };
}

/** every Try-On route of backend/src/index.js + tryon.js, plus unknown paths under the same prefixes */
const publicRoutes = id => [
  ["GET", "/v1/tryon/catalog"], ["GET", `/v1/tryon/asset/${id}`], ["GET", "/v1/tryon/asset/000000000000"],
  ["POST", "/v1/tryon/catalog", {}], ["GET", "/v1/tryon"], ["GET", "/v1/tryon/"], ["GET", "/v1/tryon/anything/else"]
];
const adminRoutes = id => [
  ["GET", "/tryon/items"], ["POST", "/tryon/items", ITEM()],
  ["PUT", `/tryon/items/${id}`, { name_th: "แว่นใหม่" }], ["POST", `/tryon/items/${id}/status`, { status: "hidden" }],
  ["PUT", `/tryon/items/${id}/asset`, ASSET()], ["DELETE", `/tryon/items/${id}`, { password: "x", totp: "000000" }],
  ["GET", `/tryon/items/${id}`], ["GET", "/tryon"], ["GET", "/tryon/"], ["POST", "/tryon/anything", {}]
];

/* ---------------- W1 ---------------- */
test("W1: the switch ships off — wrangler.toml TRYON = \"off\" in [vars] and [env.test.vars]", () => {
  const toml = fs.readFileSync(path.join(ROOT, "backend", "wrangler.toml"), "utf8");
  const top = toml.slice(toml.indexOf("[vars]"), toml.indexOf("[[d1_databases]]"));
  const tv = toml.slice(toml.indexOf("[env.test.vars]"));
  assert.ok(toml.indexOf("[vars]") >= 0 && toml.indexOf("[[d1_databases]]") > toml.indexOf("[vars]"), "[vars] section found");
  assert.ok(toml.indexOf("[env.test.vars]") > 0, "[env.test.vars] section found");
  for (const [where, sec] of [["[vars]", top], ["[env.test.vars]", tv]]) {
    const all = sec.match(/^TRYON\s*=.*$/gm) || [];
    assert.equal(all.length, 1, where + " declares TRYON exactly once");
    const m = sec.match(/^TRYON\s*=\s*"([^"]*)"\s*$/m);
    assert.ok(m, where + " declares TRYON as a string");
    assert.equal(m[1], "off", where + " ships the Try-On switch off");
  }
});

/* ---------------- W2 ---------------- */
test("W2: switch not \"on\": every Try-On route answers 404 tryon_off for everyone, with zero SQL and zero R2 calls", async () => {
  const t = await setup();
  const before = await t.snapshot();
  const who = [["anonymous", null], ["owner", t.owner], ["tryon_admin", t.tadmin.token], ["tryon_editor", t.teditor.token]];
  for (const flag of [undefined, "", "off", "OFF", "true", "1", "yes", "ON-ish", "o n", "onn"]) {
    if (flag === undefined) delete t.env.TRYON; else t.env.TRYON = flag;
    for (const [name, tok] of who) {
      for (const [method, p, body] of publicRoutes(t.id)) {
        t.rec.on = true; t.rec.sql.length = 0; t.rec.r2.length = 0;
        const r = await t.call(p, { method, body, token: tok });
        t.rec.on = false;
        const tag = `TRYON=${JSON.stringify(flag)} ${name} ${method} ${p}`;
        assert.equal(r.status, 404, `${tag} -> ${r.status} ${JSON.stringify(r.j)}`);
        assert.equal(r.j && r.j.code, "tryon_off", `${tag}: code`);
        assert.deepEqual(t.rec.sql, [], `${tag}: no SQL`);
        assert.deepEqual(t.rec.r2, [], `${tag}: no R2 call`);
      }
      for (const [method, p, body] of adminRoutes(t.id)) {
        for (const origin of [undefined, null, "https://evil.example"]) {
          t.rec.on = true; t.rec.sql.length = 0; t.rec.r2.length = 0;
          const r = await t.call("/admin/api" + p, { method, body, token: tok, origin });
          t.rec.on = false;
          const tag = `TRYON=${JSON.stringify(flag)} ${name} origin=${origin} ${method} /admin/api${p}`;
          assert.equal(r.status, 404, `${tag} -> ${r.status} ${JSON.stringify(r.j)}`);
          assert.equal(r.j && r.j.code, "tryon_off", `${tag}: code`);
          assert.deepEqual(t.rec.sql, [], `${tag}: no SQL (refused before Origin, session and D1)`);
          assert.deepEqual(t.rec.r2, [], `${tag}: no R2 call`);
        }
      }
    }
  }
  assert.equal(await t.snapshot(), before, "nothing in the catalogue changed while the switch was off");
  // the rest of the back office keeps working with the switch off
  t.env.TRYON = "off";
  assert.equal((await t.O("/me")).status, 200);
  assert.equal((await t.O("/merit/items")).status, 200);
  assert.equal((await t.call("/health")).status, 200);
});

/* ---------------- W3 ---------------- */
test("W3: /v1/config and /admin/api/me report tryon with the switch (trimmed, any case \"on\")", async () => {
  const t = await setup();
  for (const [flag, want] of [[undefined, false], ["off", false], ["true", false], ["on", true], [" On ", true], ["ON", true]]) {
    if (flag === undefined) delete t.env.TRYON; else t.env.TRYON = flag;
    const c = await t.call("/v1/config");
    assert.equal(c.status, 200);
    assert.equal(c.j.tryon, want, `/v1/config tryon with TRYON=${JSON.stringify(flag)}`);
    const me = await t.O("/me");
    assert.equal(me.status, 200);
    assert.equal(me.j.tryon, want, `owner /me tryon with TRYON=${JSON.stringify(flag)}`);
    const am = await t.call("/admin/api/me", { token: t.tadmin.token });
    assert.equal(am.status, 200, JSON.stringify(am.j));
    assert.equal(am.j.tryon, want, `try-on account /me tryon with TRYON=${JSON.stringify(flag)}`);
  }
  // the allow-list shortcut of /v1/config (answers without D1) says off too
  t.env.TRYON = "off";
  t.env.PUBLIC_ROUTES = "/health,/v1/config,/v1/leads";
  t.rec.on = true; t.rec.sql.length = 0;
  const s = await t.call("/v1/config");
  t.rec.on = false;
  assert.equal(s.status, 200);
  assert.equal(s.j.tryon, false);
  assert.deepEqual(t.rec.sql, [], "shortcut answered without D1");
});

/* ---------------- W4 ---------------- */
test("W4: switch \"on\" (trimmed, any case): every Try-On route works as before", async () => {
  const t = await setup();
  for (const flag of ["on", " On ", "ON"]) {
    t.env.TRYON = flag;
    const cat = await t.call("/v1/tryon/catalog");
    assert.equal(cat.status, 200, `TRYON=${JSON.stringify(flag)} catalog`);
    assert.deepEqual(cat.j.items.map(i => i.id), [t.id]);
    const a = await t.call(`/v1/tryon/asset/${t.id}`);
    assert.equal(a.status, 200);
    assert.equal(a.r.headers.get("Content-Type"), "image/png");
    assert.equal(a.r.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal((await t.call("/v1/tryon/asset/000000000000")).status, 404);
    assert.equal((await t.call("/v1/tryon/asset/000000000000")).j.code, "not_found");
    for (const tok of [t.owner, t.tadmin.token, t.teditor.token]) {
      const l = await t.call("/admin/api/tryon/items", { token: tok });
      assert.equal(l.status, 200, JSON.stringify(l.j));
      assert.ok(l.j.items.some(i => i.id === t.id));
    }
  }
  t.env.TRYON = "on";
  // editor creates and edits (own draft), cannot publish (role matrix unchanged)
  const e = await t.call("/admin/api/tryon/items", { method: "POST", token: t.teditor.token, body: ITEM() });
  assert.equal(e.status, 201, JSON.stringify(e.j));
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}`, { method: "PUT", token: t.teditor.token, body: { name_th: "แว่นใหม่" } })).status, 200);
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}/asset`, { method: "PUT", token: t.teditor.token, body: ASSET() })).status, 200);
  const ep = await t.call(`/admin/api/tryon/items/${e.j.item.id}/status`, { method: "POST", token: t.teditor.token, body: { status: "published" } });
  assert.equal(ep.status, 403, JSON.stringify(ep.j));
  // try-on admin publishes, hides, deletes with inline re-auth; the owner deletes with re-auth
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}/status`, { method: "POST", token: t.tadmin.token, body: { status: "published" } })).status, 200);
  assert.equal((await t.call("/v1/tryon/catalog")).j.items.length, 2);
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}/status`, { method: "POST", token: t.tadmin.token, body: { status: "hidden" } })).status, 200);
  assert.equal((await t.call("/v1/tryon/catalog")).j.items.length, 1);
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}`, { method: "DELETE", token: t.tadmin.token, body: {} })).status, 403, "delete still needs re-auth");
  assert.equal((await t.call(`/admin/api/tryon/items/${e.j.item.id}`, { method: "DELETE", token: t.tadmin.token, body: await t.accReauth(t.tadmin) })).status, 200);
  assert.equal((await t.O(`/tryon/items/${t.id}`, { method: "DELETE", body: await t.ownerReauth() })).status, 200);
  assert.equal((await t.call("/v1/tryon/catalog")).j.items.length, 0);
  assert.equal((await t.call(`/v1/tryon/asset/${t.id}`)).status, 404);
});

/* ---------------- W5 ---------------- */
test("W5: admin UI hides the Try-On tab unless /me says tryon === true; a try-on account sees a switched-off message (TH / EN / ZH)", () => {
  const js = fs.readFileSync(path.join(ROOT, "admin.js"), "utf8");
  const enter = js.slice(js.indexOf("function enter("), js.indexOf("function enter(") + 2500);
  assert.match(enter, /var tryonOn = me\.tryon === true;/, "the tab follows GET /me tryon (boolean true only)");
  assert.match(enter, /\(n === "tryon" && !tryonOn\)/, "the Try-On tab is hidden while off");
  assert.match(enter, /only === "tryon" && !tryonOn/, "a try-on account gets the switched-off branch");
  assert.match(enter, /G\("at\.off", "[^"]*[฀-๿][^"]*"\)/, "Thai default text for at.off");
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) {
    const m = fs.readFileSync(path.join(ROOT, f), "utf8").match(/"at\.off":\s*"([^"]+)"/);
    assert.ok(m && m[1].length > 10, f + " has at.off");
  }
  const zh = fs.readFileSync(path.join(ROOT, "i18n/zh-admin.js"), "utf8").match(/"at\.off":\s*"([^"]+)"/)[1];
  assert.match(zh, /[一-鿿]/, "the Chinese text is Chinese");
});

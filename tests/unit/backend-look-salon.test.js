"use strict";
// tests/unit/backend-look-salon.test.js — salon catalogue approval step (owner decision 2026-11-18: "build the salon content
// approval step so salon mode can be switched on"; docs/BEAUTY-IMAGE-DESIGN.md §4; CLAUDE.md "Look suggestions").
// FIXED TEST SET: written and hash-locked (~/LENSIQ-field/evals/salon-approval/, evals-locks/salon-approval.sha256) BEFORE
// backend/src/look-salon.js, migration 0022 and the admin tab were written. Local only (in-memory D1); nothing is deployed and
// no migration is applied to the live database.
//
//   L1 migration 0022_look_salon.sql: listed in health.js MIGRATIONS with schema probes; named when missing
//   L2 pending entries are never shown: a new entry (salon text + shape + rights tick) is always 'pending' (a status in the
//      body is refused); the public catalogue (GET /v1/look/salon/catalog) lists approved entries only and answers
//      404 look_salon_off unless the Worker var LOOK_SALON = "on"
//   L3 approval is needed after each edit: any edit (text, shape or kind) returns an approved entry to 'pending', bumps the
//      version and takes it off the public catalogue; approving needs the version the approver saw (409 stale_version)
//   L4 only the allowed role can approve: default = the LENSIQ owner only; LOOK_SALON_APPROVERS = "owner,lensiq_admin" also
//      allows LENSIQ admin accounts. Others get 403 (salon_editor, lensiq_admin by default, merit reviewer, try-on accounts);
//      anonymous gets 403 (with or without an allowed Origin)
//   L5 procedure words (TH / EN / ZH: tattooing, microblading, semi-permanent pigment, injections, thread lifts, laser,
//      surgery) are refused by the lint on create and edit (422 lint_failed), the salon exception of lensiq-look-lint.js does
//      NOT apply here, and an entry holding such text (e.g. written straight into the database) cannot be approved; the public
//      catalogue re-checks at serve time and drops it
//   L6 the audit has no free-text values: every action writes one audit row (and one history row) whose values are ids,
//      versions, statuses, field names and lint codes only — never the salon's text, a matched word or the reject reason text
//   L7 catalogue validation: fixed kinds (brow, lip, liner, hair), shape per kind (brow points / card, lip hex, liner style,
//      hair SVG path data only), the rights tick is required, no image / photo field exists, unknown fields refused
//   L8 the back office never claims the lint blocks everything
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "t".repeat(40);
const OWNER_PW = "correct horse battery staple salon";
const ACC_PW = "a long salon account passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);

const brow = (o = {}) => ({ kind: "brow", name_th: "ทรงโค้งนุ่ม", name_en: "Soft arch", name_zh: "柔和弯眉",
  desc_th: "ทรงคิ้วโค้งปลายยกเล็กน้อย", desc_en: "A gentle arch with a slightly lifted tail", desc_zh: "弯眉，眉尾略微上扬",
  shape: { card: "brow-arch", points: [[0.05, 0.7], [0.4, 0.3], [0.95, 0.55]] }, rights_ok: true, ...o });
const lip = (o = {}) => ({ kind: "lip", name_th: "ส้มอิฐ", name_en: "Brick orange", name_zh: "砖橙色", code: "BR-07", shape: { hex: "#b5523b", gloss: 0.3 }, rights_ok: true, ...o });
const liner = (o = {}) => ({ kind: "liner", name_th: "อายไลเนอร์หางสั้น", name_en: "Short wing liner", name_zh: "短眼线", shape: { style: "wing-short" }, rights_ok: true, ...o });
const hair = (o = {}) => ({ kind: "hair", name_th: "ทรงผมยาวประบ่า", name_en: "Shoulder-length layers", name_zh: "及肩层次发型",
  shape: { path: "M10 10 C 20 40, 40 40, 50 10 L 60 70 Z" }, rights_ok: true, ...o });

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 17).toString("base64"), ...vars });
  const call = async (path, o = {}) => {
    const headers = { ...(o.headers || {}) };
    if (o.token) headers.Authorization = "Bearer " + o.token;
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers, ip: o.ip, origin: o.origin === undefined ? "https://site.example" : o.origin }), env, {});
    let j = null; try { j = await r.clone().json(); } catch { /* not JSON */ }
    return { status: r.status, j, r };
  };
  const totp = (secretB32, d = 0) => crypto.totpAt(crypto.base32Decode(secretB32), Math.floor(nowS() / 30) + d);
  await call("/admin/api/bootstrap", { method: "POST", body: { token: ADMIN_TOKEN, username: "owner", password: OWNER_PW } });
  const owner = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token;
  const O = (path, o = {}) => call("/admin/api" + path, { ...o, token: o.token || owner });
  const st = await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } });
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(st.j.secret, -1) } })).status, 200);
  const sudo = async () => {
    await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    assert.equal((await O("/reauth", { method: "POST", body: { password: OWNER_PW, totp: await totp(st.j.secret) } })).status, 200);
  };
  /** creates + activates a restricted account with the given role (undefined = the merit reviewer default) */
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
    return { id: c.j.reviewer.id, token: l.j.token, username };
  };
  const A = (acc, path, o = {}) => call("/admin/api" + path, { ...o, token: acc.token });
  const create = async (body, who) => {
    const r = who ? await A(who, "/look-salon/entries", { method: "POST", body }) : await O("/look-salon/entries", { method: "POST", body });
    assert.equal(r.status, 201, JSON.stringify(r.j));
    return r.j.entry;
  };
  const approve = (id, version, who) => (who ? A(who, `/look-salon/entries/${id}/approve`, { method: "POST", body: { version } })
    : O(`/look-salon/entries/${id}/approve`, { method: "POST", body: { version } }));
  const row = async id => env.DB.prepare("SELECT * FROM look_salon_entries WHERE id = ?1").bind(id).first();
  const catalog = async () => call("/v1/look/salon/catalog");
  const audits = async () => ((await env.DB.prepare("SELECT actor, action, detail FROM audit_log WHERE action LIKE 'look_salon.%' ORDER BY id").all()).results || []);
  return { env, call, O, A, sudo, account, create, approve, row, catalog, audits };
}

/* ---------------- L1 ---------------- */
test("L1: migration 0022_look_salon.sql is listed in health.js with schema probes and is named when missing", async () => {
  assert.ok(existsSync(join(ROOT, "backend", "migrations", "0022_look_salon.sql")), "migration file");
  const { MIGRATIONS, deepHealth } = await import(B + "health.js");
  assert.ok(MIGRATIONS.includes("0022_look_salon.sql"), "listed");
  assert.equal(MIGRATIONS.indexOf("0022_look_salon.sql"), MIGRATIONS.length - 1, "listed last");
  const src = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(src, /\["0022_look_salon\.sql", "SELECT [^"]*FROM look_salon_entries/);
  assert.match(src, /\["0022_look_salon\.sql", "SELECT [^"]*FROM look_salon_events/);
  const env = createEnv();
  assert.equal((await deepHealth(env)).ok, true);
  await env.DB.exec("DROP TABLE look_salon_events");
  assert.deepEqual((await deepHealth(env)).migrations.missing, ["0022_look_salon.sql"]);
});

/* ---------------- L2 ---------------- */
test("L2: new entries start pending (a status in the body is refused) and pending / rejected / hidden entries are never shown", async () => {
  const S = await setup({ LOOK_SALON: "on" });
  const e = await S.create(brow());
  assert.equal(e.status, "pending"); assert.equal(e.version, 1);
  for (const status of ["approved", "pending"]) {
    const r = await S.O("/look-salon/entries", { method: "POST", body: brow({ status }) });
    assert.equal(r.status, 400, status); assert.equal(r.j.code, "unknown_field");
  }
  const forged = await S.O("/look-salon/entries", { method: "POST", body: brow({ approved_by: "owner" }) });
  assert.equal(forged.status, 400); assert.equal(forged.j.code, "unknown_field");
  let c = await S.catalog();
  assert.equal(c.status, 200); assert.deepEqual(c.j.entries, [], "pending not shown");
  const r2 = await S.create(lip());
  assert.equal((await S.O(`/look-salon/entries/${r2.id}/reject`, { method: "POST", body: { version: 1, reason: "wording" } })).status, 200);
  const r3 = await S.create(liner());
  assert.equal((await S.approve(r3.id, 1)).status, 200);
  assert.equal((await S.O(`/look-salon/entries/${r3.id}/hide`, { method: "POST", body: {} })).status, 200);
  c = await S.catalog();
  assert.deepEqual(c.j.entries, [], "rejected and hidden not shown");
  assert.equal((await S.approve(e.id, 1)).status, 200);
  c = await S.catalog();
  assert.deepEqual(c.j.entries.map(x => x.id), [e.id]);
  const pub = c.j.entries[0];
  assert.equal(pub.status, "approved");
  assert.deepEqual(pub.name, { th: "ทรงโค้งนุ่ม", en: "Soft arch", zh: "柔和弯眉" });
  for (const k of ["created_by", "updated_by", "approved_by", "rights_ok", "salon_note"]) assert.ok(!(k in pub), "no back-office field " + k);
  // the list in the back office shows every status
  const list = (await S.O("/look-salon/entries")).j.entries;
  assert.deepEqual(Object.fromEntries(list.map(x => [x.id, x.status])), { [e.id]: "approved", [r2.id]: "rejected", [r3.id]: "hidden" });
});

test("L2: the public catalogue answers 404 look_salon_off unless LOOK_SALON = \"on\"", async () => {
  for (const v of [undefined, "", "off", "true", "1"]) {
    const S = await setup(v === undefined ? {} : { LOOK_SALON: v });
    const e = await S.create(brow());
    assert.equal((await S.approve(e.id, 1)).status, 200, "the approval step works while the public catalogue is off");
    const c = await S.catalog();
    assert.equal(c.status, 404, String(v)); assert.equal(c.j.code, "look_salon_off");
  }
  const S = await setup({ LOOK_SALON: " ON " });
  assert.equal((await S.catalog()).status, 200, "trimmed, any case");
});

/* ---------------- L3 ---------------- */
test("L3: every edit returns an approved entry to pending, bumps the version and takes it off the public catalogue", async () => {
  const S = await setup({ LOOK_SALON: "on" });
  const e = await S.create(brow());
  assert.equal((await S.approve(e.id, 1)).status, 200);
  const edits = [{ name_en: "Soft arch, natural" }, { desc_th: "ทรงโค้งปลายยก" }, { shape: { card: "brow-lift" } }, { name_zh: "自然弯眉" }];
  let v = 1;
  for (const body of edits) {
    const u = await S.O(`/look-salon/entries/${e.id}`, { method: "PUT", body });
    assert.equal(u.status, 200, JSON.stringify(u.j));
    v += 1;
    assert.equal(u.j.entry.status, "pending", JSON.stringify(body)); assert.equal(u.j.entry.version, v);
    const r = await S.row(e.id);
    assert.equal(r.status, "pending"); assert.equal(r.approved_by, null); assert.equal(r.approved_at, null);
    assert.deepEqual((await S.catalog()).j.entries, [], "off the public list after " + JSON.stringify(body));
    const stale = await S.approve(e.id, v - 1);
    assert.equal(stale.status, 409); assert.equal(stale.j.code, "stale_version");
    assert.equal((await S.approve(e.id, v)).status, 200);
    assert.deepEqual((await S.catalog()).j.entries.map(x => x.version), [v]);
  }
  // an edit by a salon editor also sends it back; an edit that changes nothing is refused (no silent re-approval)
  const ed = await S.account("salon1", "salon_editor");
  const u = await S.A(ed, `/look-salon/entries/${e.id}`, { method: "PUT", body: { name_th: "ทรงโค้งธรรมชาติ" } });
  assert.equal(u.status, 200); assert.equal(u.j.entry.status, "pending");
  const same = await S.O(`/look-salon/entries/${e.id}`, { method: "PUT", body: {} });
  assert.equal(same.status, 400); assert.equal(same.j.code, "no_change");
  // approving twice, or approving a rejected entry, is refused
  assert.equal((await S.approve(e.id, v + 1)).status, 200);
  const twice = await S.approve(e.id, v + 1);
  assert.equal(twice.status, 409); assert.equal(twice.j.code, "not_pending");
  const r = await S.create(lip());
  await S.O(`/look-salon/entries/${r.id}/reject`, { method: "POST", body: { version: 1, reason: "rights" } });
  const ar = await S.approve(r.id, 1);
  assert.equal(ar.status, 409); assert.equal(ar.j.code, "not_pending");
});

/* ---------------- L4 ---------------- */
test("L4: by default only the LENSIQ owner approves; salon editors, LENSIQ admins, merit reviewers and try-on accounts get 403", async () => {
  const S = await setup({ LOOK_SALON: "on", TRYON: "on" });
  const ed = await S.account("salon1", "salon_editor"), adm = await S.account("lqadmin", "lensiq_admin");
  const mr = await S.account("meritrev"), tr = await S.account("shopadmin", "tryon_admin");
  assert.equal((await S.A(ed, "/me")).j.role, "salon_editor");
  assert.equal((await S.A(adm, "/me")).j.role, "lensiq_admin");
  // salon editors and LENSIQ admins create and edit; the entry is pending
  const e = await S.create(brow(), ed);
  assert.equal(e.status, "pending");
  const e2 = await S.create(lip(), adm);
  for (const who of [ed, adm]) {
    const r = await S.approve(e.id, 1, who);
    assert.equal(r.status, 403, who.username); assert.equal(r.j.code, "approver_not_allowed");
  }
  for (const who of [mr, tr]) {
    const r = await S.approve(e.id, 1, who);
    assert.equal(r.status, 403, who.username); assert.equal(r.j.code, "forbidden_role");
    const l = await S.A(who, "/look-salon/entries");
    assert.equal(l.status, 403, who.username + " list");
  }
  // a salon editor cannot reject or hide either
  for (const [p, b] of [[`/look-salon/entries/${e.id}/reject`, { version: 1, reason: "wording" }], [`/look-salon/entries/${e.id}/hide`, {}]]) {
    const r = await S.A(ed, p, { method: "POST", body: b });
    assert.equal(r.status, 403, p);
  }
  // anonymous: 403 with an allowed Origin and without one; nothing changed
  const anon = await S.call(`/admin/api/look-salon/entries/${e.id}/approve`, { method: "POST", body: { version: 1 } });
  assert.equal(anon.status, 403); assert.equal(anon.j.code, "not_signed_in");
  const anon2 = await S.call(`/admin/api/look-salon/entries/${e.id}/approve`, { method: "POST", body: { version: 1 }, origin: null });
  assert.equal(anon2.status, 403);
  const anon3 = await S.call(`/admin/api/look-salon/entries/${e.id}/approve`, { method: "POST", body: { version: 1 }, token: "x".repeat(43) });
  assert.equal(anon3.status, 403, "a made-up token is anonymous too");
  assert.equal((await S.row(e.id)).status, "pending");
  assert.deepEqual((await S.catalog()).j.entries, []);
  // restricted salon roles never reach any other admin route
  for (const who of [ed, adm]) for (const [m, p] of [["GET", "/billing"], ["GET", "/reviewers"], ["GET", "/merit/items"], ["GET", "/tryon/items"], ["GET", "/audit"], ["GET", "/leads"]]) {
    const r = await S.A(who, p, { method: m });
    assert.equal(r.status, 403, `${who.username} ${m} ${p}`); assert.equal(r.j.code, "forbidden_role");
  }
  // the owner approves
  assert.equal((await S.approve(e.id, 1)).status, 200);
  assert.equal((await S.row(e.id)).approved_by, "owner");
  assert.equal((await S.row(e2.id)).status, "pending");
  // the list tells the page whether this account may approve
  assert.equal((await S.O("/look-salon/entries")).j.can_approve, true);
  assert.equal((await S.A(adm, "/look-salon/entries")).j.can_approve, false);
  assert.equal((await S.A(ed, "/look-salon/entries")).j.can_approve, false);
});

test("L4: LOOK_SALON_APPROVERS = \"owner,lensiq_admin\" also lets LENSIQ admins approve; salon editors never", async () => {
  const S = await setup({ LOOK_SALON: "on", LOOK_SALON_APPROVERS: "owner,lensiq_admin" });
  const ed = await S.account("salon1", "salon_editor"), adm = await S.account("lqadmin", "lensiq_admin");
  const e = await S.create(brow(), ed);
  const r0 = await S.approve(e.id, 1, ed);
  assert.equal(r0.status, 403); assert.equal(r0.j.code, "approver_not_allowed");
  const r = await S.approve(e.id, 1, adm);
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal((await S.row(e.id)).approved_by, "reviewer:" + adm.id);
  assert.equal((await S.A(adm, "/look-salon/entries")).j.can_approve, true);
  // a value naming salon_editor or anything unknown never widens the list
  for (const v of ["owner,salon_editor", "salon_editor", "*", "all", "lensiq_admin,salon_editor"]) {
    const T = await setup({ LOOK_SALON_APPROVERS: v });
    const te = await T.account("salon2", "salon_editor");
    const x = await T.create(lip(), te);
    const a = await T.approve(x.id, 1, te);
    assert.equal(a.status, 403, v); assert.equal(a.j.code, "approver_not_allowed");
    assert.equal((await T.approve(x.id, 1)).status, 200, "the owner can always approve: " + v);
  }
  // the owner cannot be switched off
  const T = await setup({ LOOK_SALON_APPROVERS: "lensiq_admin" });
  const x = await T.create(lip());
  assert.equal((await T.approve(x.id, 1)).status, 200);
});

/* ---------------- L5 ---------------- */
const PROC = {
  th: ["สักคิ้ว 6 มิติ ทรงโค้ง", "ฝังสีปาก โทนส้ม", "ร้อยไหมยกคิ้ว", "ฉีดฟิลเลอร์ปาก", "เลเซอร์ลบคิ้ว", "ศัลยกรรมตาสองชั้น", "คิ้วกึ่งถาวร ทรงตรง", "ไมโครเบลด ทรงธรรมชาติ"],
  en: ["Microblading soft arch", "Semi-permanent brows", "Lip tattoo coral", "Thread lift brow", "Laser brow removal", "Filler lips", "Botox brow lift", "Permanent eyeliner"],
  zh: ["纹眉 柳叶形", "半永久眉", "雾眉", "埋线提眉", "激光洗眉", "玻尿酸丰唇", "割双眼皮", "整形"]
};
test("L5: procedure words in TH / EN / ZH are refused on create and edit, in every text field (no salon exception)", async () => {
  const S = await setup({ LOOK_SALON: "on" });
  const fields = { th: ["name_th", "desc_th"], en: ["name_en", "desc_en"], zh: ["name_zh", "desc_zh"] };
  for (const l of ["th", "en", "zh"]) for (const t of PROC[l]) for (const f of fields[l]) {
    const r = await S.O("/look-salon/entries", { method: "POST", body: brow({ [f]: t }) });
    assert.equal(r.status, 422, `${f}: ${t}`); assert.equal(r.j.code, "lint_failed");
    assert.ok(r.j.fields.some(x => x.field === f && x.codes.includes("procedure")), `${f}: ${t} -> ${JSON.stringify(r.j.fields)}`);
  }
  const rc = await S.O("/look-salon/entries", { method: "POST", body: lip({ code: "Lip tattoo 07" }) });
  assert.equal(rc.status, 422, "the colour code is linted too");
  assert.equal((await S.env.DB.prepare("SELECT COUNT(*) AS n FROM look_salon_entries").first()).n, 0, "nothing saved");
  // edit: refused, the approved text stays as it was and stays public
  const e = await S.create(brow());
  assert.equal((await S.approve(e.id, 1)).status, 200);
  for (const l of ["th", "en", "zh"]) {
    const u = await S.O(`/look-salon/entries/${e.id}`, { method: "PUT", body: { [fields[l][0]]: PROC[l][0] } });
    assert.equal(u.status, 422, PROC[l][0]); assert.equal(u.j.code, "lint_failed");
  }
  const r = await S.row(e.id);
  assert.equal(r.status, "approved"); assert.equal(r.version, 1); assert.equal(r.name_th, "ทรงโค้งนุ่ม");
});

test("L5: an entry holding procedure words cannot be approved by anyone, and is dropped from the public catalogue", async () => {
  const S = await setup({ LOOK_SALON: "on", LOOK_SALON_APPROVERS: "owner,lensiq_admin" });
  const adm = await S.account("lqadmin", "lensiq_admin");
  const ids = [];
  for (const l of ["th", "en", "zh"]) for (const t of PROC[l].slice(0, 3)) {
    const e = await S.create(brow());
    await S.env.DB.prepare(`UPDATE look_salon_entries SET name_${l} = ?1 WHERE id = ?2`).bind(t, e.id).run();
    ids.push([e.id, t]);
  }
  for (const [id, t] of ids) {
    for (const who of [undefined, adm]) {
      const r = await S.approve(id, 1, who);
      assert.equal(r.status, 422, t); assert.equal(r.j.code, "lint_failed");
    }
    assert.equal((await S.row(id)).status, "pending", t);
  }
  // approved earlier, text changed behind the Worker's back: the public catalogue re-checks and drops it
  const e = await S.create(liner());
  assert.equal((await S.approve(e.id, 1)).status, 200);
  await S.env.DB.prepare("UPDATE look_salon_entries SET desc_zh = ?1 WHERE id = ?2").bind("半永久眼线", e.id).run();
  assert.deepEqual((await S.catalog()).j.entries, []);
});

test("L5: other wording bans also block approval (whitening, feature is bad, beauty score, threat, purchase / price / link)", async () => {
  const S = await setup();
  for (const t of ["ทรงโค้ง ผิวขาวขึ้น", "Soft arch for flawed brows", "สวยขึ้น 10/10", "不画的话运势会下降", "ราคา 2,999 บาท", "www.example.com", "立即购买"]) {
    const r = await S.O("/look-salon/entries", { method: "POST", body: brow({ desc_th: t }) });
    assert.equal(r.status, 422, t); assert.equal(r.j.code, "lint_failed");
  }
});

/* ---------------- L6 ---------------- */
test("L6: every action writes one audit row and one history row; no free-text value is ever stored in either", async () => {
  const S = await setup({ LOOK_SALON: "on" });
  const ed = await S.account("salon1", "salon_editor");
  const MARK = { name_th: "ทรงพิเศษเฉพาะร้านคิ้วสวย", name_en: "Unique House Arch Q7", name_zh: "本店独家弯眉", desc_en: "Feather soft tail X9", code: "ZZ-991" };
  const e = await S.create(brow({ name_th: MARK.name_th, name_en: MARK.name_en, name_zh: MARK.name_zh, desc_en: MARK.desc_en }), ed);
  await S.A(ed, `/look-salon/entries/${e.id}`, { method: "PUT", body: { desc_en: "Feather soft tail X9 longer" } });
  await S.O(`/look-salon/entries/${e.id}`, { method: "PUT", body: { name_th: "ฉีดฟิลเลอร์คิ้ว" } }); // refused by the lint: audited without the text
  await S.approve(e.id, 1); // stale
  await S.approve(e.id, 2);
  const l = await S.create(lip({ code: MARK.code }));
  await S.O(`/look-salon/entries/${l.id}/reject`, { method: "POST", body: { version: 1, reason: "wording", note: "free text is not accepted" } });
  await S.O(`/look-salon/entries/${l.id}/reject`, { method: "POST", body: { version: 1, reason: "a reason typed by hand" } });
  assert.equal((await S.O(`/look-salon/entries/${l.id}/reject`, { method: "POST", body: { version: 1, reason: "wording" } })).status, 200);
  await S.O(`/look-salon/entries/${e.id}/hide`, { method: "POST", body: {} });
  await S.approve(e.id, 2, ed); // denied
  const rows = await S.audits();
  const actions = rows.map(r => r.action);
  for (const a of ["look_salon.created", "look_salon.updated", "look_salon.lint_refused", "look_salon.approve_refused", "look_salon.approved", "look_salon.rejected", "look_salon.hidden"]) {
    assert.ok(actions.includes(a), "audited: " + a + " in " + JSON.stringify(actions));
  }
  assert.equal(actions.filter(a => a === "look_salon.created").length, 2, "one row per action");
  const SAFE = /^[a-z0-9_.:-]{0,64}$/;
  const walk = (v, path) => {
    if (v === null || typeof v === "number" || typeof v === "boolean") return;
    if (typeof v === "string") { assert.match(v, SAFE, `free-text-like value at ${path}: ${JSON.stringify(v)}`); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + "[" + i + "]")); return; }
    for (const [k, x] of Object.entries(v)) { assert.match(k, SAFE, "key " + k); walk(x, path + "." + k); }
  };
  const texts = [...Object.values(MARK), "Feather soft tail X9 longer", "ฉีดฟิลเลอร์คิ้ว", "ฟิลเลอร์", "free text is not accepted", "a reason typed by hand"];
  for (const r of rows) {
    if (r.detail) walk(JSON.parse(r.detail), r.action);
    for (const t of texts) assert.ok(!String(r.detail || "").includes(t), r.action + " stores text " + t);
  }
  // history rows (per entry): same rule, and the history route shows them in order
  const hist = (await S.env.DB.prepare("SELECT * FROM look_salon_events ORDER BY id").all()).results;
  assert.ok(hist.length >= 7, "history rows: " + hist.length);
  for (const h of hist) {
    for (const [k, v] of Object.entries(h)) {
      if (typeof v === "string") {
        if (k === "detail") walk(JSON.parse(v), "events." + k); else assert.match(v, SAFE, `events.${k} = ${JSON.stringify(v)}`);
      }
      for (const t of texts) assert.ok(!String(v).includes(t), "history stores text " + t);
    }
  }
  const hr = await S.O(`/look-salon/entries/${e.id}/history`);
  assert.equal(hr.status, 200);
  assert.deepEqual(hr.j.events.map(x => x.action).filter(a => ["created", "updated", "approved", "hidden"].includes(a)), ["created", "updated", "approved", "hidden"]);
  // a reject reason must come from the fixed list
  const bad = await S.O(`/look-salon/entries/${l.id}/reject`, { method: "POST", body: { version: 1, reason: "because I said so" } });
  assert.ok(bad.status === 400 || bad.status === 409, String(bad.status));
});

/* ---------------- L7 ---------------- */
test("L7: fixed kinds, shape per kind, rights tick required, no image / photo field, unknown fields refused", async () => {
  const S = await setup();
  for (const ok of [brow(), brow({ shape: { card: "brow-lift" } }), brow({ shape: { points: [[0, 0.5], [0.5, 0.2], [1, 0.5]] } }), lip(), lip({ code: undefined, name_en: undefined, name_zh: undefined }), liner(), hair()]) {
    const r = await S.O("/look-salon/entries", { method: "POST", body: ok });
    assert.equal(r.status, 201, JSON.stringify(ok) + " -> " + JSON.stringify(r.j));
  }
  const BAD = [
    [brow({ kind: "nose" }), "invalid_kind"], [brow({ kind: "procedure" }), "invalid_kind"],
    [brow({ rights_ok: false }), "rights_required"], [brow({ rights_ok: undefined }), "rights_required"], [brow({ rights_ok: "yes" }), "rights_required"],
    [brow({ name_th: "" }), "invalid_name"], [brow({ name_th: "ก".repeat(81) }), "invalid_name"], [brow({ desc_en: "x".repeat(301) }), "invalid_desc"],
    [brow({ shape: {} }), "invalid_shape"], [brow({ shape: { card: "lip-warm" } }), "invalid_shape"], [brow({ shape: { points: [[0, 0], [2, 0], [1, 1]] } }), "invalid_shape"],
    [brow({ shape: { points: [[0, 0]] } }), "invalid_shape"], [lip({ shape: { hex: "red" } }), "invalid_shape"], [lip({ shape: { hex: "#b5523b", gloss: 3 } }), "invalid_shape"],
    [liner({ shape: { style: "tattoo" } }), "invalid_shape"], [hair({ shape: { path: "<script>alert(1)</script>" } }), "invalid_shape"],
    [hair({ shape: { path: "M0 0 L 1 1\" onload=\"x" } }), "invalid_shape"], [hair({ shape: { path: "url(https://x.example/a.png)" } }), "invalid_shape"],
    [lip({ code: "c".repeat(25) }), "invalid_code"],
    [brow({ image: "data:image/png;base64,AAAA" }), "unknown_field"], [brow({ photo: "x" }), "unknown_field"], [brow({ shape: { card: "brow-arch", image: "x" } }), "invalid_shape"],
    [brow({ salon: "other" }), "unknown_field"], [brow({ status: "approved" }), "unknown_field"], [brow({ version: 9 }), "unknown_field"]
  ];
  for (const [b, code] of BAD) {
    const r = await S.O("/look-salon/entries", { method: "POST", body: b });
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 120)); assert.equal(r.j.code, code, JSON.stringify(b).slice(0, 120) + " -> " + JSON.stringify(r.j));
  }
  // the table has no column for an image or a photo
  const cols = (await S.env.DB.prepare("PRAGMA table_info(look_salon_entries)").all()).results.map(c => c.name);
  assert.ok(!cols.some(c => /image|photo|picture|data_url|blob/i.test(c)), JSON.stringify(cols));
  // unknown routes / methods under /look-salon answer 404
  assert.equal((await S.O("/look-salon/entries/abcdef123456/publish", { method: "POST", body: {} })).status, 404);
});

/* ---------------- L8 ---------------- */
test("L8: no claim that the lint blocks everything (back office and Worker of this step)", () => {
  const files = ["admin.html", "admin-look-salon.js", "i18n/en-admin.js", "i18n/zh-admin.js", "backend/src/look-salon.js"];
  const RE = /blocks? (?:all|every|everything)|catch(?:es)? (?:all|every|everything)|กันได้ทั้งหมด|กรองได้ทั้งหมด|全部拦截|全部过滤/i;
  const NEG = /never claim|not a complete|ห้ามอ้าง|ไม่ใช่ตัวกรองที่กันได้ทั้งหมด|不得声称|并非全部/i;
  for (const f of files) {
    const p = join(ROOT, f);
    assert.ok(existsSync(p), f);
    const lines = readFileSync(p, "utf8").split("\n").filter(l => RE.test(l) && !NEG.test(l));
    assert.deepEqual(lines, [], f);
  }
  const ui = readFileSync(join(ROOT, "admin-look-salon.js"), "utf8") + readFileSync(join(ROOT, "admin.html"), "utf8");
  assert.match(ui, /ls\.lintNote/, "the tab says the word check is a first step and a person still approves");
});

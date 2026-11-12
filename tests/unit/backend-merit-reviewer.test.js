"use strict";
// tests/unit/backend-merit-reviewer.test.js — Merit reviewer role + review queue (owner decision 2026-11-12). FIXED TEST
// SET: written and hash-locked (~/LENSIQ-field/evals/merit/locked.sha256) BEFORE the role, the queue, the import and
// migration 0016 were written. Local only: in-memory D1 (backend-d1-shim.js).
//
//   RV1 migration 0016_merit_review.sql: in health.js MIGRATIONS + probes; /health/deep names exactly it when missing
//   RV2 the owner creates a reviewer account (re-auth, audited, one-time setup code shown once, never stored in plain)
//   RV3 first sign-in: setup code + own password + 2-step verification (required); code single-use and expiring
//   RV4 the reviewer signs in with password + 6-digit code; GET /me says role "reviewer"
//   RV5 role matrix: the Worker refuses (403 forbidden_role) every admin route outside merit content for a reviewer,
//       with no side effect; unknown routes are refused too (default deny)
//   RV6 queue: draft -> reviewed -> published, rejected with a comment; a reviewer's edit sends an item back to draft;
//       reviewers cannot set status or the sample flag directly
//   RV7 history: who changed which field, when, review decisions and comments, in the item history; the audit log has
//       ids / field names / decisions only
//   RV8 only published items are served by GET /v1/merit/guidance
//   RV9 import of drafts (owner, re-auth): imported as draft (never published), invalid items reported and skipped,
//       dry run writes nothing, a large file fits, samples stay samples
//   RV10 owner disables / enables / resets / deletes a reviewer (re-auth); disable signs the reviewer out at once
//   RV11 a reviewer's trusted device does not skip the owner's sign-in slow-down; reviewer failures never count on the owner
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const ADMIN_TOKEN = "bootstrap-" + "v".repeat(40);
const OWNER_PW = "correct horse battery staple owner";
const REV_PW = "a long reviewer passphrase 2026";
const nowS = () => Math.floor(Date.now() / 1000);
const tri = (th, en, zh) => ({ th, en, zh });
const item = (o = {}) => ({
  type: "offering", tradition: "thai_buddhist", keys: ["any"],
  title: tri("ถวายดอกไม้", "Offering flowers", "供奉鲜花"),
  body: tri("ตามธรรมเนียม หลายคนถวายดอกไม้และจุดธูปด้วยใจสงบ", "By tradition, many people offer flowers and light incense with a calm mind.", "按照传统，很多人以平静的心供奉鲜花并点香。"),
  ...o
});

async function setup(vars = {}) {
  const { handle } = await import(B + "index.js");
  const crypto = await import(B + "crypto.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: ADMIN_TOKEN, SECRETS_KEK: Buffer.alloc(32, 11).toString("base64"), ...vars });
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
  // owner 2-step on + an open sudo window (re-auth)
  const st = await O("/totp/setup", { method: "POST", body: { password: OWNER_PW } });
  const ownerSecret = st.j.secret;
  assert.equal((await O("/totp/enable", { method: "POST", body: { code: await totp(ownerSecret, -1) } })).status, 200);
  const sudo = async () => {
    await env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    assert.equal((await O("/reauth", { method: "POST", body: { password: OWNER_PW, totp: await totp(ownerSecret) } })).status, 200);
  };
  /** creates + activates a reviewer; returns {id, token, secret, username} */
  const reviewer = async (username = "rev1") => {
    await sudo();
    const c = await O("/reviewers", { method: "POST", body: { username } });
    assert.equal(c.status, 201, JSON.stringify(c.j));
    const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: REV_PW } });
    assert.equal(s1.status, 200, JSON.stringify(s1.j));
    const s2 = await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
    assert.equal(s2.status, 200, JSON.stringify(s2.j));
    const l = await call("/admin/api/login", { method: "POST", body: { username, password: REV_PW, totp: await totp(s1.j.secret), mode: "bearer" } });
    assert.equal(l.status, 200, JSON.stringify(l.j));
    return { id: c.j.reviewer.id, token: l.j.token, device: l.j.device, secret: s1.j.secret, username, code: c.j.setup_code };
  };
  const R = (rv, path, o = {}) => call("/admin/api" + path, { ...o, token: rv.token });
  const audits = async action => ((await env.DB.prepare("SELECT actor, action, detail FROM audit_log WHERE action = ?1 ORDER BY id").bind(action).all()).results || []);
  const statusOf = async id => (await env.DB.prepare("SELECT status FROM merit_items WHERE id = ?1").bind(id).first() || {}).status;
  const served = async () => (await call("/v1/merit/guidance")).j.items.map(x => x.id);
  return { env, call, O, sudo, reviewer, R, audits, statusOf, served, totp, ownerSecret };
}

/* ---------------- RV1 ---------------- */
test("RV1: migration 0016_merit_review.sql is listed, probed, and named exactly when missing", async () => {
  assert.ok(existsSync(join(ROOT, "backend", "migrations", "0016_merit_review.sql")));
  const { MIGRATIONS, deepHealth } = await import(B + "health.js");
  assert.equal(MIGRATIONS[MIGRATIONS.length - 1], "0016_merit_review.sql");
  const src = readFileSync(join(ROOT, "backend", "src", "health.js"), "utf8");
  assert.match(src, /\["0016_merit_review\.sql", "SELECT [^"]*FROM admin_reviewers/);
  assert.match(src, /\["0016_merit_review\.sql", "SELECT [^"]*FROM merit_revisions/);
  const env = createEnv();
  assert.equal((await deepHealth(env)).ok, true);
  await env.DB.exec("DROP TABLE merit_revisions");
  assert.deepEqual((await deepHealth(env)).migrations.missing, ["0016_merit_review.sql"]);
});

/* ---------------- RV2 ---------------- */
test("RV2: creating a reviewer needs the owner, re-auth and a valid new username; the setup code is shown once, stored hashed", async () => {
  const { O, sudo, env, audits } = await setup();
  const r0 = await O("/reviewers", { method: "POST", body: { username: "rev1" } });
  assert.equal(r0.status, 403); assert.equal(r0.j.code, "reauth_required");
  await sudo();
  for (const u of ["", "a", "owner", "bad name", "x".repeat(65)]) {
    const r = await O("/reviewers", { method: "POST", body: { username: u } });
    assert.ok(r.status === 400 || r.status === 409, u + " " + r.status);
  }
  const c = await O("/reviewers", { method: "POST", body: { username: "rev1" } });
  assert.equal(c.status, 201);
  assert.match(c.j.setup_code, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal(c.j.reviewer.username, "rev1"); assert.equal(c.j.reviewer.status, "pending");
  assert.ok(c.j.setup_expires_at > nowS() && c.j.setup_expires_at <= nowS() + 7 * 86400);
  assert.equal((await O("/reviewers", { method: "POST", body: { username: "rev1" } })).status, 409, "duplicate");
  const list = await O("/reviewers");
  assert.equal(list.status, 200);
  assert.equal(list.j.reviewers.length, 1);
  assert.ok(!JSON.stringify(list.j).includes(c.j.setup_code), "the code is never listed again");
  const row = await env.DB.prepare("SELECT * FROM admin_reviewers").first();
  assert.ok(!JSON.stringify(row).includes(c.j.setup_code), "the code is not stored in plain");
  const a = await audits("reviewer.created");
  assert.equal(a.length, 1); assert.equal(a[0].actor, "owner");
  assert.ok(!a[0].detail.includes(c.j.setup_code));
});

/* ---------------- RV3 ---------------- */
test("RV3: first sign-in — setup code + own password + required 2-step; single use; expiry; weak password refused", async () => {
  const { O, sudo, call, totp, env } = await setup();
  await sudo();
  const c = await O("/reviewers", { method: "POST", body: { username: "rev1" } });
  const bad = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: "x".repeat(32), password: REV_PW } });
  assert.ok(bad.status === 403 || bad.status === 400 || bad.status === 404, String(bad.status));
  const weak = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: "short" } });
  assert.equal(weak.status, 400); assert.equal(weak.j.code, "weak_password");
  const s1 = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: REV_PW } });
  assert.equal(s1.status, 200);
  assert.equal(s1.j.username, "rev1");
  assert.match(s1.j.secret, /^[A-Z2-7]{16,}$/); assert.match(s1.j.uri, /^otpauth:\/\/totp\//);
  // before 2-step is confirmed the account cannot sign in
  const early = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: REV_PW, mode: "bearer" } });
  assert.equal(early.status, 401);
  const wrong = await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: "000000" } });
  assert.equal(wrong.status, 400); assert.equal(wrong.j.code, "invalid_totp");
  const ok = await call("/admin/api/reviewer-setup/confirm", { method: "POST", body: { code: c.j.setup_code, totp: await totp(s1.j.secret, -1) } });
  assert.equal(ok.status, 200);
  assert.equal((await env.DB.prepare("SELECT status, totp_enabled FROM admin_reviewers").first()).status, "active");
  const again = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c.j.setup_code, password: REV_PW } });
  assert.ok(again.status >= 400, "the code works once");
  // expiry
  await sudo();
  const c2 = await O("/reviewers", { method: "POST", body: { username: "rev2" } });
  await env.DB.prepare("UPDATE admin_reviewers SET setup_expires = ?1 WHERE username = 'rev2'").bind(nowS() - 1).run();
  const exp = await call("/admin/api/reviewer-setup", { method: "POST", body: { code: c2.j.setup_code, password: REV_PW } });
  assert.ok(exp.status >= 400, "expired code refused");
});

/* ---------------- RV4 ---------------- */
test("RV4: the reviewer signs in with password + 6-digit code; /me says role reviewer; no code = refused", async () => {
  const { reviewer, call, R, totp } = await setup();
  const rv = await reviewer("rev1");
  const me = await R(rv, "/me");
  assert.equal(me.status, 200);
  assert.equal(me.j.role, "reviewer"); assert.equal(me.j.username, "rev1"); assert.equal(me.j.totp_enabled, true);
  const noCode = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: REV_PW, mode: "bearer" } });
  assert.equal(noCode.status, 401); assert.equal(noCode.j.code, "invalid_totp");
  const badPw = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: "wrong password here", totp: await totp(rv.secret, 1), mode: "bearer" } });
  assert.equal(badPw.status, 401);
  const ownerMe = await call("/admin/api/me", { token: (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" } })).j.token });
  assert.ok(ownerMe.status === 200 || ownerMe.status === 401);
});

/* ---------------- RV5 role matrix ---------------- */
const DENIED = [
  ["GET", "/go-live"], ["GET", "/leads"], ["POST", "/leads/" + "a".repeat(24) + "/ack"], ["DELETE", "/leads/" + "a".repeat(24)],
  ["POST", "/password"], ["POST", "/reauth"], ["POST", "/totp/setup"], ["POST", "/totp/enable"], ["POST", "/totp/disable"], ["POST", "/totp/recovery"],
  ["GET", "/devices"], ["DELETE", "/devices"], ["DELETE", "/devices/" + "a".repeat(16)],
  ["GET", "/analytics/summary"], ["GET", "/analytics/csv"],
  ["GET", "/ai"], ["PUT", "/ai"], ["PUT", "/ai/key"], ["DELETE", "/ai/key"], ["GET", "/ai/gateway"], ["PUT", "/ai/gateway"], ["GET", "/ai/usage"],
  ["GET", "/ai/keys"], ["PUT", "/ai/keys/anthropic"], ["DELETE", "/ai/keys/anthropic"], ["POST", "/ai/keys/anthropic/test"],
  ["GET", "/pc/lookup"], ["PUT", "/pc/lookup"],
  ["GET", "/billing"], ["PUT", "/billing/settings"], ["GET", "/billing/payments"], ["GET", "/billing/webhooks"], ["POST", "/billing/plans"],
  ["PUT", "/billing/plans/pro_month"], ["GET", "/billing/subscriptions"], ["POST", "/billing/subscriptions/sub_1/cancel"], ["POST", "/billing/test-charge"],
  ["GET", "/billing/payments/" + "a".repeat(32)], ["POST", "/billing/payments/" + "a".repeat(32) + "/refund"],
  ["GET", "/alerts"], ["POST", "/alerts/1/ack"], ["GET", "/csp-reports"], ["GET", "/mail"], ["GET", "/audit"],
  ["GET", "/members"], ["GET", "/members/" + "a".repeat(32)], ["POST", "/members/" + "a".repeat(32) + "/status"], ["POST", "/members/" + "a".repeat(32) + "/grant"],
  ["GET", "/membership"], ["PUT", "/membership"], ["GET", "/retention"], ["POST", "/retention/run"],
  ["GET", "/reviewers"], ["POST", "/reviewers"], ["POST", "/reviewers/" + "a".repeat(12) + "/disable"], ["POST", "/reviewers/" + "a".repeat(12) + "/enable"],
  ["POST", "/reviewers/" + "a".repeat(12) + "/reset"], ["DELETE", "/reviewers/" + "a".repeat(12)],
  ["POST", "/merit/import"], ["DELETE", "/merit/items/sample-tb-place-1"], ["GET", "/merit/interest"], ["DELETE", "/merit/interest/" + "a".repeat(24)],
  ["GET", "/no-such-route"], ["POST", "/no-such-route"]
];
test("RV5: a reviewer gets 403 forbidden_role on every admin route outside merit content, with no side effect", async () => {
  const { reviewer, R, env } = await setup();
  const rv = await reviewer("rev1");
  const before = {
    settings: (await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(GROUP_CONCAT(value), '') AS v FROM settings").first()),
    reviewers: (await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_reviewers").first()).n,
    items: (await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n,
    owner: (await env.DB.prepare("SELECT password_hash, totp_enabled FROM admin_users").first())
  };
  const leaks = [];
  for (const [m, p] of DENIED) {
    const body = m === "GET" ? undefined : { password: REV_PW, totp: "000000", enabled: true, key: "sk-ant-x", username: "rev9", items: [item()] };
    const r = await R(rv, p, { method: m, body });
    if (r.status !== 403 || !r.j || r.j.code !== "forbidden_role") leaks.push(`${m} ${p} -> ${r.status} ${r.j && r.j.code}`);
  }
  assert.deepEqual(leaks, []);
  const after = {
    settings: (await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(GROUP_CONCAT(value), '') AS v FROM settings").first()),
    reviewers: (await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_reviewers").first()).n,
    items: (await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n,
    owner: (await env.DB.prepare("SELECT password_hash, totp_enabled FROM admin_users").first())
  };
  assert.deepEqual(after, before, "nothing changed");
  // allowed: merit content
  for (const [m, p] of [["GET", "/me"], ["GET", "/merit/items"], ["GET", "/merit/items/sample-tb-place-1/history"]]) {
    assert.equal((await R(rv, p, { method: m })).status, 200, m + " " + p);
  }
});

test("RV5: the owner keeps every route; a reviewer session is checked on every request (not only in the page)", async () => {
  const { O } = await setup();
  for (const p of ["/ai", "/billing", "/audit", "/reviewers", "/merit/interest", "/retention"]) assert.equal((await O(p)).status, 200, p);
  const src = readFileSync(join(ROOT, "backend", "src", "index.js"), "utf8");
  assert.match(src, /forbidden_role/);
});

/* ---------------- RV6 queue ---------------- */
test("RV6: queue — draft -> reviewed -> published, reject needs a comment, approve only from reviewed, reviewer edits go back to draft", async () => {
  const { reviewer, R, O, statusOf, served, env } = await setup();
  const rv = await reviewer("rev1");
  // a reviewer creates: always a draft; cannot set status or sample
  const forbidden = [{ ...item(), status: "published" }, { ...item(), sample: true }];
  for (const b of forbidden) {
    const r = await R(rv, "/merit/items", { method: "POST", body: b });
    assert.equal(r.status, 403, JSON.stringify(b).slice(0, 60)); assert.equal(r.j.code, "forbidden_field");
  }
  const c = await R(rv, "/merit/items", { method: "POST", body: item() });
  assert.equal(c.status, 201, JSON.stringify(c.j));
  const id = c.j.item.id;
  assert.equal(c.j.item.status, "draft");
  assert.ok(!(await served()).includes(id), "a draft is not served");
  const review = (who, decision, comment) => (who === "owner" ? O : (p, o) => R(rv, p, o))("/merit/items/" + id + "/review", { method: "POST", body: { decision, comment } });
  assert.equal((await review("rv", "approve")).status, 409, "approve straight from draft is refused");
  assert.equal((await review("rv", "publish")).status, 400, "unknown decision");
  const rj0 = await review("rv", "reject");
  assert.equal(rj0.status, 400, "reject without a comment");
  const rj = await review("rv", "reject", "ถ้อยคำยังกว้างเกินไป ขอแหล่งอ้างอิง");
  assert.equal(rj.status, 200); assert.equal(await statusOf(id), "rejected");
  assert.equal((await env.DB.prepare("SELECT review_comment FROM merit_items WHERE id = ?1").bind(id).first()).review_comment, "ถ้อยคำยังกว้างเกินไป ขอแหล่งอ้างอิง");
  assert.equal((await review("rv", "reviewed", "แก้แล้ว")).status, 200); assert.equal(await statusOf(id), "reviewed");
  assert.ok(!(await served()).includes(id), "reviewed is not served yet");
  assert.equal((await review("owner", "approve")).status, 200); assert.equal(await statusOf(id), "published");
  assert.ok((await served()).includes(id), "published is served");
  // reviewer edit of a published item: back to draft (needs approval again)
  for (const b of [{ status: "published" }, { sample: true }, { status: "hidden" }]) {
    const r = await R(rv, "/merit/items/" + id, { method: "PUT", body: b });
    assert.equal(r.status, 403, JSON.stringify(b)); assert.equal(r.j.code, "forbidden_field");
  }
  const e = await R(rv, "/merit/items/" + id, { method: "PUT", body: { title: tri("ถวายดอกไม้สด", "Offering fresh flowers", "供奉鲜花") } });
  assert.equal(e.status, 200); assert.equal(e.j.item.status, "draft");
  assert.ok(!(await served()).includes(id));
  // the owner may still publish or hide directly (owner authority, recorded in the history)
  assert.equal((await O("/merit/items/" + id, { method: "PUT", body: { status: "published" } })).status, 200);
  assert.equal(await statusOf(id), "published");
  assert.equal((await R(rv, "/merit/items/no-such-item/review", { method: "POST", body: { decision: "reviewed" } })).status, 404);
});

/* ---------------- RV7 history ---------------- */
test("RV7: history lists who changed which field, when, and every review decision with its comment; audit has no text", async () => {
  const { reviewer, R, O, audits } = await setup();
  const rv = await reviewer("rev1");
  const id = (await R(rv, "/merit/items", { method: "POST", body: item() })).j.item.id;
  const nb = tri("ตามธรรมเนียม หลายคนถวายดอกไม้ ธูป และเทียน", "By tradition, people offer flowers, incense and candles.", "按照传统，人们供奉鲜花、香和蜡烛。");
  await R(rv, "/merit/items/" + id, { method: "PUT", body: { body: nb } });
  await R(rv, "/merit/items/" + id + "/review", { method: "POST", body: { decision: "reviewed", comment: "ตรวจถ้อยคำแล้ว" } });
  await O("/merit/items/" + id + "/review", { method: "POST", body: { decision: "approve", comment: "เผยแพร่ได้" } });
  const h = await R(rv, "/merit/items/" + id + "/history");
  assert.equal(h.status, 200);
  const rows = h.j.history;
  assert.ok(rows.length >= 4, String(rows.length));
  for (const r of rows) { assert.ok(r.ts > 0); assert.ok(r.actor && r.action); }
  const create = rows.find(r => r.action === "create"), edit = rows.find(r => r.action === "edit");
  const rev = rows.find(r => r.action === "review" && r.decision === "reviewed"), app = rows.find(r => r.action === "review" && r.decision === "approve");
  assert.ok(create && edit && rev && app, JSON.stringify(rows));
  assert.equal(create.actor, "rev1"); assert.equal(create.to_status, "draft");
  assert.deepEqual(edit.fields, ["body"]); assert.equal(edit.actor, "rev1");
  assert.equal(rev.comment, "ตรวจถ้อยคำแล้ว"); assert.equal(rev.from_status, "draft"); assert.equal(rev.to_status, "reviewed");
  assert.equal(app.actor, "owner"); assert.equal(app.to_status, "published"); assert.equal(app.comment, "เผยแพร่ได้");
  const ar = await audits("merit.item.reviewed");
  assert.equal(ar.length, 2);
  assert.match(ar[0].actor, /^reviewer:/);
  for (const a of ar) { assert.ok(!/ตรวจถ้อยคำ|เผยแพร่ได้/.test(a.detail), "no comment text in the audit"); assert.match(a.detail, /"decision"/); }
  const ae = await audits("merit.item.updated");
  assert.ok(ae.some(a => /reviewer:/.test(a.actor) && /"body"/.test(a.detail)));
});

/* ---------------- RV8 ---------------- */
test("RV8: only published items are served, whatever their history", async () => {
  const { O, sudo, served, env } = await setup();
  const ids = {};
  for (const st of ["draft", "published", "hidden"]) ids[st] = (await O("/merit/items", { method: "POST", body: { ...item(), status: st } })).j.item.id;
  for (const st of ["reviewed", "rejected"]) {
    const id = (await O("/merit/items", { method: "POST", body: { ...item(), status: "draft" } })).j.item.id;
    await env.DB.prepare("UPDATE merit_items SET status = ?1 WHERE id = ?2").bind(st, id).run();
    ids[st] = id;
  }
  const s = await served();
  assert.ok(s.includes(ids.published));
  for (const st of ["draft", "hidden", "reviewed", "rejected"]) assert.ok(!s.includes(ids[st]), st);
  await sudo();
  assert.equal((await O("/merit/items", { method: "POST", body: { ...item(), status: "reviewed" } })).status, 400, "reviewed / rejected only through the review step");
});

/* ---------------- RV9 import ---------------- */
test("RV9: import drafts (owner + re-auth): always draft, invalid items reported and skipped, dry run writes nothing, samples untouched", async () => {
  const { O, sudo, served, env, audits } = await setup();
  const good = Array.from({ length: 100 }, (_, i) => ({ ...item({ title: tri("ถวายดอกไม้ " + i, "Offering flowers " + i, "供奉鲜花 " + i) }), status: "published", sample: true }));
  const bad = [item({ title: { th: "ไม่มีภาษาอื่น" } }), item({ body: tri("ไหว้แล้วรวยแน่นอน", "Guaranteed luck", "保证转运") }), { ...item(), price: 100 }];
  const body = { items: [...good, ...bad] };
  assert.ok(JSON.stringify(body).length > 16 * 1024, "a real-size file (over the normal 16 KB admin body)");
  const r0 = await O("/merit/import", { method: "POST", body });
  assert.equal(r0.status, 403); assert.equal(r0.j.code, "reauth_required");
  await sudo();
  const before = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n);
  const dry = await O("/merit/import", { method: "POST", body: { ...body, dry_run: true } });
  assert.equal(dry.status, 200);
  assert.equal(dry.j.ok_count, 100); assert.equal(dry.j.refused.length, 3);
  assert.deepEqual(dry.j.refused.map(x => x.index), [100, 101, 102]);
  for (const x of dry.j.refused) assert.ok(x.error && typeof x.error === "string");
  assert.equal(Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items").first()).n), before, "dry run writes nothing");
  const r = await O("/merit/import", { method: "POST", body });
  assert.equal(r.status, 200);
  assert.equal(r.j.imported, 100); assert.equal(r.j.refused.length, 3);
  const rows = (await env.DB.prepare("SELECT status, sample, source FROM merit_items WHERE source = 'import'").all()).results;
  assert.equal(rows.length, 100);
  for (const x of rows) { assert.equal(x.status, "draft"); assert.equal(x.sample, 0); }
  const s = await served();
  assert.ok(!s.some(id => id.startsWith("mi-")), "nothing imported is served");
  const samples = (await env.DB.prepare("SELECT status, sample FROM merit_items WHERE id LIKE 'sample-%'").all()).results;
  assert.equal(samples.length, 16); for (const x of samples) { assert.equal(x.sample, 1); assert.equal(x.status, "published"); }
  const a = await audits("merit.import");
  assert.equal(a.length, 1); assert.match(a[0].detail, /"imported":100/);
  assert.equal((await O("/merit/import", { method: "POST", body: { items: Array.from({ length: 301 }, () => item()) } })).status, 400, "at most 300 per file");
  const hist = await O("/merit/items/" + (await env.DB.prepare("SELECT id FROM merit_items WHERE source = 'import' LIMIT 1").first()).id + "/history");
  assert.ok(hist.j.history.some(x => x.action === "import"));
});

/* ---------------- RV10 owner manages reviewers ---------------- */
test("RV10: disable signs the reviewer out at once and blocks sign-in; enable restores; reset needs a new setup; delete removes", async () => {
  const { reviewer, R, O, sudo, call, totp, env, audits } = await setup();
  const rv = await reviewer("rev1");
  const r0 = await O("/reviewers/" + rv.id + "/disable", { method: "POST", body: {} });
  // the sudo window from reviewer() may still be open: either works, but without re-auth it must be refused
  await env.DB.prepare("UPDATE admin_sessions SET reauth_at = 0").run();
  const rNo = await O("/reviewers/" + rv.id + "/enable", { method: "POST", body: {} });
  assert.equal(rNo.status, 403, "re-auth needed"); assert.equal(rNo.j.code, "reauth_required");
  assert.equal(r0.status, 200);
  assert.equal((await R(rv, "/merit/items")).status, 401, "signed out at once");
  const l = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: REV_PW, totp: await totp(rv.secret, 1), mode: "bearer" } });
  assert.equal(l.status, 401, "disabled cannot sign in");
  await sudo();
  assert.equal((await O("/reviewers/" + rv.id + "/enable", { method: "POST", body: {} })).status, 200);
  await env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run();
  const l2 = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: REV_PW, totp: await totp(rv.secret), mode: "bearer" } });
  assert.equal(l2.status, 200);
  const rs = await O("/reviewers/" + rv.id + "/reset", { method: "POST", body: {} });
  assert.equal(rs.status, 200); assert.match(rs.j.setup_code, /^[A-Za-z0-9_-]{24,}$/);
  assert.equal((await call("/admin/api/me", { token: l2.j.token })).status, 401, "reset signs out");
  await env.DB.prepare("UPDATE admin_reviewers SET totp_last_step = 0").run();
  const l3 = await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: REV_PW, totp: await totp(rv.secret), mode: "bearer" } });
  assert.equal(l3.status, 401, "old password / 2-step no longer work after a reset");
  assert.equal((await O("/reviewers/" + rv.id, { method: "DELETE" })).status, 200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_reviewers").first()).n, 0);
  for (const a of ["reviewer.disabled", "reviewer.enabled", "reviewer.reset", "reviewer.deleted"]) assert.equal((await audits(a)).length, 1, a);
  assert.equal((await O("/reviewers/" + rv.id, { method: "DELETE" })).status, 404);
});

/* ---------------- RV11 ---------------- */
test("RV11: a reviewer's trusted device does not skip the owner's slow-down; reviewer failures never count on the owner", async () => {
  const { reviewer, call, env } = await setup();
  const rv = await reviewer("rev1");
  assert.ok(rv.device, "the reviewer got a device token");
  const ownerBefore = await env.DB.prepare("SELECT failed_count FROM admin_users").first();
  await call("/admin/api/login", { method: "POST", body: { username: "rev1", password: "a wrong password 123", totp: "000000", mode: "bearer" }, ip: "198.51.100.9" });
  assert.equal((await env.DB.prepare("SELECT failed_count FROM admin_users").first()).failed_count, ownerBefore.failed_count, "owner counter untouched");
  assert.ok((await env.DB.prepare("SELECT failed_count FROM admin_reviewers").first()).failed_count >= 1, "reviewer counter counted");
  const t = nowS();
  await env.DB.prepare("UPDATE admin_users SET failed_count = 20, last_failed_at = ?1, locked_until = ?2").bind(t, t + 600).run();
  const r = await call("/admin/api/login", { method: "POST", body: { username: "owner", password: OWNER_PW, mode: "bearer" }, headers: { "X-LQ-Device": rv.device }, ip: "198.51.100.10" });
  assert.equal(r.status, 429, "the owner's slow-down still applies with a reviewer's device token");
});

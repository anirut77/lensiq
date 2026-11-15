"use strict";
// tests/unit/polish-1115-backend.test.js — polish round 2026-11-15, items from the independent backend reviews. FIXED
// TEST SET: written and hash-locked (evals-locks/polish-1115.sha256, append-only; ~/LENSIQ-field/evals/polish-1115/
// locked.sha256) BEFORE the product change. Never edited to make the product pass. In-memory D1 (backend-d1-shim.js).
//   PB1 verifyItem: when a concurrent edit makes the conditional UPDATE change no row, the call is refused (409
//       bad_transition) and NO "verify" history row is written; an uncontended verify writes exactly one
//   PB2 reviewItem: the same rule for the "review" history row
//   PB3 importItems with a batch id where every item is refused: nothing is recorded for the batch, so the same batch
//       id can be imported again once fixed; a completed batch is still refused (409 batch_exists)
//   PB4 importItems: when a later chunk fails, the batch record's count equals the drafts actually imported; when the
//       first chunk fails (0 imported), the batch is not recorded and can be retried in full
//   PB5 importItems with some items refused: the batch count equals the imported drafts
//   PB6 createReviewer refuses the tryon_admin and tryon_editor roles while TRYON is off (409 tryon_role_off, nothing
//       written); with TRYON = "on" they are created; the merit role is created either way; the admin page shows the
//       refusal as its own message in TH (admin.js) / EN / ZH
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createEnv } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const OWNER = { actor: "owner", name: "owner", role: "owner" };
const tri = (th, en, zh) => ({ th, en, zh });
const place = (o = {}) => ({
  draft_id: "pb-sample", type: "place", tradition: "thai_buddhist", sort: 10,
  title: tri("วัดตัวอย่าง อุบลราชธานี", "A sample temple, Ubon Ratchathani", "乌汶府示例寺庙"),
  body: tri("ตามความเชื่อ หลายคนมาไหว้พระที่นี่เพื่อขอพรเรื่องการงาน แต่งกายสุภาพ", "By belief, many people come here to pray about their work, dressed modestly.",
    "按照信仰，很多人来此为工作祈福，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("อุบลราชธานี", "Ubon Ratchathani", "乌汶府"), keys: ["domain:planner"],
  purposes: ["work"], province: "Ubon Ratchathani", verification: "official_unopened",
  sources: [{ url: "https://example.org/wat-ubon", publisher: "Example (official site)", title: "Wat", accessed: "2026-11-14" }],
  ...o
});
const BAD = { type: "nope" };

const M = () => import(B + "merit.js");
const revs = async (env, id, action) => ((await env.DB.prepare("SELECT action FROM merit_revisions WHERE item_id = ?1 AND action = ?2").bind(id, action).all()).results || []).length;
const batchRow = async (env, b) => env.DB.prepare("SELECT batch, count FROM merit_batches WHERE batch = ?1").bind(b).first();
const importedCount = async env => Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items WHERE source = 'import'").first()).n);
/** runs `sql` just before the next DB.batch (a concurrent edit landing between the read and the write) */
const raceOnce = (env, sql, ...args) => {
  const orig = env.DB.batch;
  env.DB.batch = async stmts => { env.DB.batch = orig; await env.DB.prepare(sql).bind(...args).run(); return orig(stmts); };
};
/** makes the n-th DB.batch call (1-based) from now on throw */
const failBatch = (env, n) => {
  const orig = env.DB.batch; let k = 0;
  env.DB.batch = async stmts => { k++; if (k === n) throw new Error("D1_ERROR: simulated failure"); return orig(stmts); };
  return () => { env.DB.batch = orig; };
};
const rejects409 = async (p, code) => {
  let e = null; try { await p; } catch (x) { e = x; }
  assert.ok(e, "refused"); assert.equal(e.status, 409, String(e && e.message)); if (code) assert.equal(e.extra && e.extra.code, code);
};

test("PB1: verifyItem writes no history row when a concurrent edit wins; one row otherwise", async () => {
  const { importItems, verifyItem } = await M();
  const env = createEnv();
  const r = await importItems(env, { items: [place({ draft_id: "a" }), place({ draft_id: "b" })] }, OWNER);
  const [a, b] = r.ids;
  const row = await env.DB.prepare("SELECT review_meta FROM merit_items WHERE id = ?1").bind(a).first();
  const raced = JSON.stringify({ ...JSON.parse(row.review_meta), verification: "official" });
  raceOnce(env, "UPDATE merit_items SET review_meta = ?1 WHERE id = ?2", raced, a);
  await rejects409(verifyItem(env, a, { verification: "official" }, OWNER), "bad_transition");
  assert.equal(await revs(env, a, "verify"), 0, "no phantom verify row");
  const ok = await verifyItem(env, b, { verification: "official" }, OWNER);
  assert.equal(ok.to, "official");
  assert.equal(await revs(env, b, "verify"), 1, "one verify row");
});

test("PB2: reviewItem writes no history row when a concurrent edit wins; one row otherwise", async () => {
  const { importItems, reviewItem } = await M();
  const env = createEnv();
  const [a, b] = (await importItems(env, { items: [place({ draft_id: "a" }), place({ draft_id: "b" })] }, OWNER)).ids;
  raceOnce(env, "UPDATE merit_items SET status = 'reviewed' WHERE id = ?1", a);
  await rejects409(reviewItem(env, a, { decision: "reviewed" }, OWNER), "bad_transition");
  assert.equal(await revs(env, a, "review"), 0, "no phantom review row");
  const ok = await reviewItem(env, b, { decision: "reviewed" }, OWNER);
  assert.equal(ok.to, "reviewed");
  assert.equal(await revs(env, b, "review"), 1, "one review row");
});

test("PB3: a batch where every item is refused is not recorded and can be imported again; a completed batch is refused", async () => {
  const { importItems } = await M();
  const env = createEnv();
  const r = await importItems(env, { batch: "pb3-all-bad", items: [BAD, BAD] }, OWNER);
  assert.equal(r.imported, 0); assert.equal(r.refused.length, 2);
  assert.equal(await batchRow(env, "pb3-all-bad"), null, "no batch record for 0 imported");
  const again = await importItems(env, { batch: "pb3-all-bad", items: [place()] }, OWNER);
  assert.equal(again.imported, 1, "retry of the fixed file works");
  assert.equal(Number((await batchRow(env, "pb3-all-bad")).count), 1);
  await rejects409(importItems(env, { batch: "pb3-all-bad", items: [place()] }, OWNER), "batch_exists");
  assert.equal(await importedCount(env), 1);
});

test("PB4: a failed later chunk leaves a batch count equal to what was imported; a failed first chunk leaves no record", async () => {
  const { importItems } = await M();
  const env = createEnv();
  const items = Array.from({ length: 60 }, (_, i) => place({ draft_id: "c" + i })); // 120 statements = 2 chunks of 100
  let restore = failBatch(env, 2);
  await assert.rejects(importItems(env, { batch: "pb4-later", items }, OWNER));
  restore();
  const n = await importedCount(env);
  assert.ok(n > 0 && n < 60, "first chunk committed: " + n);
  const br = await batchRow(env, "pb4-later");
  assert.ok(br, "partly imported batch stays recorded (a re-import would duplicate)");
  assert.equal(Number(br.count), n, "batch count = drafts actually imported");

  const env2 = createEnv();
  restore = failBatch(env2, 1);
  await assert.rejects(importItems(env2, { batch: "pb4-first", items }, OWNER));
  restore();
  assert.equal(await importedCount(env2), 0);
  assert.equal(await batchRow(env2, "pb4-first"), null, "nothing imported -> no batch record");
  const again = await importItems(env2, { batch: "pb4-first", items }, OWNER);
  assert.equal(again.imported, 60);
  assert.equal(Number((await batchRow(env2, "pb4-first")).count), 60);
});

test("PB5: with some items refused, the batch count equals the drafts imported", async () => {
  const { importItems } = await M();
  const env = createEnv();
  const r = await importItems(env, { batch: "pb5-mixed", items: [place({ draft_id: "x" }), BAD, place({ draft_id: "y" })] }, OWNER);
  assert.equal(r.imported, 2);
  assert.equal(Number((await batchRow(env, "pb5-mixed")).count), 2);
});

test("PB6: try-on roles are refused while TRYON is off, with their own message in TH / EN / ZH", async () => {
  const { createReviewer } = await import(B + "reviewers.js");
  const owner = { username: "owner" };
  const count = async env => Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_reviewers").first()).n);
  for (const off of [{}, { TRYON: "off" }, { TRYON: "" }]) {
    const env = createEnv(off);
    for (const role of ["tryon_admin", "tryon_editor"]) await rejects409(createReviewer(env, { username: "shop-" + role.slice(6), role }, owner), "tryon_role_off");
    assert.equal(await count(env), 0, "nothing written");
    const m = await createReviewer(env, { username: "meritrev" }, owner);
    assert.equal(m.reviewer.role, "merit");
    const m2 = await createReviewer(env, { username: "meritrev2", role: "merit" }, owner);
    assert.equal(m2.reviewer.role, "merit");
  }
  const on = createEnv({ TRYON: "on" });
  for (const role of ["tryon_admin", "tryon_editor"]) assert.equal((await createReviewer(on, { username: "shop-" + role.slice(6), role }, owner)).reviewer.role, role);

  const admin = readFileSync(join(ROOT, "admin.js"), "utf8");
  const m = /e\.code === "tryon_role_off"\s*\?\s*G\("([\w.]+)",\s*"([^"]+)"/.exec(admin);
  assert.ok(m, "admin.js maps tryon_role_off to its own message");
  assert.match(m[2], /[ก-๛]/, "Thai fallback text");
  for (const l of ["en", "zh"]) {
    const d = readFileSync(join(ROOT, "i18n", l + "-admin.js"), "utf8");
    const k = new RegExp('"' + m[1].replace(/\./g, "\\.") + '":\\s*"([^"]+)"').exec(d);
    assert.ok(k, l + " key " + m[1]);
    assert.ok(!/[ก-๛]/.test(k[1]), l + " text has no Thai");
    if (l === "zh") assert.match(k[1], /[一-鿿]/);
  }
});

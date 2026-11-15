"use strict";
// tests/unit/merit-import-2.test.js — SECOND FIXED TEST SET for the Merit import safety work (coordinator order 2026-11-15
// after the independent review of merit-import-safe @ cebd048: the real write path, the admin upload to POST /merit/import,
// was unprotected). Written to ~/LENSIQ-field/evals/merit-import/ and hash-locked (evals-locks/merit-import.sha256, appended)
// BEFORE the product change in backend/src/merit.js, admin.js, i18n/*-admin.js, tools/merit-import-guard.mjs and the docs.
// Never edited to make the product pass. The real files are never read here.
//   W1 importItems refuses a batch when any of its draft_ids already exists in merit_items, whatever the batch id: 409
//      code draft_ids_exist, the message names the count ("<n> draft id(s)") and the existing batch id ("(batch: <id>)");
//      a renamed batch with the same content is refused; one overlapping item refuses the whole file; nothing is written
//      (no items, no batch row) and the dry run refuses the same way
//   W2 what is allowed still works: disjoint draft_ids under another batch id; items without a draft_id; the same batch
//      refused for its id as before (batch_exists); drafts imported without a batch id are counted as "(batch: none)"
//   A1 admin page: the dry run shows the batch id and the item kind of the picked file (places / drafts) before import;
//      the refusal has its own message; every new text exists in TH (admin.js fallback), EN and ZH
//   L1 local guard: draft_ids that overlap an already-confirmed batch in the ledger are refused (draft_ids_overlap), even
//      with --idempotent-confirmed; the batch it overlaps is named
//   L2 local guard: the same items under another batch id (a renamed file) are refused (same_content_other_batch)
//   L3 the ledger records items_sha256 and draft_ids; an old ledger entry without them does not break the guard
//   D2 docs: step จ.3 / ข.3 tell the owner to compare the batch id the admin dry run shows with the expected one; the
//      "ต้องรอ" line says migration 0019 is already applied on lensiq-test and that a new Worker deploy is needed for
//      draft_ids_exist (Thai owner steps and the English companion)
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createEnv } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const GUARD = join(ROOT, "tools", "merit-import-guard.mjs");
const OWNER = { actor: "owner", name: "owner", role: "owner" };
const tri = (th, en, zh) => ({ th, en, zh });
const place = (o = {}) => ({
  draft_id: "w-sample", type: "place", tradition: "thai_buddhist", sort: 10,
  title: tri("วัดตัวอย่าง อุบลราชธานี", "A sample temple, Ubon Ratchathani", "乌汶府示例寺庙"),
  body: tri("ตามความเชื่อ หลายคนมาไหว้พระที่นี่เพื่อขอพรเรื่องการงาน แต่งกายสุภาพ", "By belief, many people come here to pray about their work, dressed modestly.",
    "按照信仰，很多人来此为工作祈福，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("อุบลราชธานี", "Ubon Ratchathani", "乌汶府"), keys: ["domain:planner"],
  purposes: ["work"], province: "Ubon Ratchathani", verification: "official_unopened",
  sources: [{ url: "https://example.org/wat-ubon", publisher: "Example (official site)", title: "Wat", accessed: "2026-11-14" }],
  ...o
});
const ids = (...n) => n.map(x => place({ draft_id: x }));
const M = () => import(B + "merit.js");
const count = async (env, t) => Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n);
const refused = async (p, code) => {
  let e = null; try { await p; } catch (x) { e = x; }
  assert.ok(e, "refused"); assert.equal(e.status, 409, String(e && e.message)); assert.equal(e.extra && e.extra.code, code, String(e && e.message));
  return e;
};

test("W1: a batch is refused when any draft_id already exists, whatever the batch id; nothing is written", async () => {
  const { importItems } = await M();
  const env = createEnv();
  await importItems(env, { batch: "places-a", items: ids("a1", "a2", "a3") }, OWNER);
  const items0 = await count(env, "merit_items"), batches0 = await count(env, "merit_batches");
  // a renamed batch with the very same content
  let e = await refused(importItems(env, { batch: "places-a-renamed", items: ids("a1", "a2", "a3") }, OWNER), "draft_ids_exist");
  assert.match(e.message, /\b3 draft id\(s\)/); assert.match(e.message, /\(batch: places-a\)/);
  // one overlapping item refuses the whole file
  e = await refused(importItems(env, { batch: "places-b", items: ids("b1", "a2", "b3", "b4") }, OWNER), "draft_ids_exist");
  assert.match(e.message, /\b1 draft id\(s\)/); assert.match(e.message, /places-a/);
  // the dry run refuses the same way
  await refused(importItems(env, { batch: "places-c", items: ids("a3"), dry_run: true }, OWNER), "draft_ids_exist");
  assert.equal(await count(env, "merit_items"), items0, "no item written");
  assert.equal(await count(env, "merit_batches"), batches0, "no batch row written");
  assert.equal(await env.DB.prepare("SELECT batch FROM merit_batches WHERE batch = ?1").bind("places-b").first(), null);
});

test("W2: disjoint ids, items without a draft_id and the old batch_exists rule still behave", async () => {
  const { importItems } = await M();
  const env = createEnv();
  await importItems(env, { batch: "places-a", items: ids("a1", "a2") }, OWNER);
  const ok = await importItems(env, { batch: "places-b", items: ids("b1", "b2") }, OWNER);
  assert.equal(ok.imported, 2);
  const noId = place(); delete noId.draft_id;
  assert.equal((await importItems(env, { batch: "places-c", items: [noId] }, OWNER)).imported, 1);
  assert.equal((await importItems(env, { batch: "places-d", items: [noId] }, OWNER)).imported, 1, "no draft_id, nothing to compare");
  await refused(importItems(env, { batch: "places-a", items: ids("z1") }, OWNER), "batch_exists");
  // drafts imported without a batch id are still compared
  await importItems(env, { items: ids("n1") }, OWNER);
  const e = await refused(importItems(env, { batch: "places-e", items: ids("n1") }, OWNER), "draft_ids_exist");
  assert.match(e.message, /\(batch: none\)/);
  // refused items inside the file do not count as existing ids, and a rejected file leaves its ids free
  const mixed = [place({ draft_id: "m1" }), { type: "nope", draft_id: "m2" }];
  assert.equal((await importItems(env, { batch: "places-f", items: mixed }, OWNER)).imported, 1);
  assert.equal((await importItems(env, { batch: "places-g", items: ids("m2") }, OWNER)).imported, 1);
});

test("A1: the dry run shows batch id and item kind; the refusal is a plain message in TH / EN / ZH", () => {
  const admin = readFileSync(join(ROOT, "admin.js"), "utf8");
  const en = readFileSync(join(ROOT, "i18n", "en-admin.js"), "utf8"), zh = readFileSync(join(ROOT, "i18n", "zh-admin.js"), "utf8");
  const keys = ["am.imp.batchIs", "am.imp.kindPlaces", "am.imp.kindDrafts", "am.e.draft_ids_exist"];
  for (const k of keys) {
    assert.ok(admin.includes('"' + k + '"'), "admin.js uses " + k + " with a Thai fallback");
    assert.match(en, new RegExp('"' + k.replace(/\./g, "\\.") + '":\\s*"[^"]*[A-Za-z]{3}'), "EN " + k);
    assert.match(zh, new RegExp('"' + k.replace(/\./g, "\\.") + '":\\s*"[^"]*[\\u4e00-\\u9fff]'), "ZH " + k);
  }
  const rep = admin.slice(admin.indexOf("function amImportReport"), admin.indexOf('$("amImport").addEventListener'));
  assert.ok(rep.includes("am.imp.batchIs") && rep.includes("am.imp.kindPlaces") && rep.includes("am.imp.kindDrafts"), "amImportReport shows batch id and kind");
  assert.ok(/\{batch\}/.test(admin.match(/"am\.imp\.batchIs",\s*"[^"]*"/)[0]), "batch placeholder in the Thai fallback");
  const err = admin.slice(admin.indexOf("function amError"), admin.indexOf("function amKeysPicker"));
  assert.ok(err.includes("draft_ids_exist") && err.includes("am.e.draft_ids_exist"), "amError has its own message for draft_ids_exist");
  for (const f of [en, zh]) {
    assert.match(f.match(/"am\.e\.draft_ids_exist":\s*"[^"]*"/)[0], /\{n\}/); assert.match(f.match(/"am\.e\.draft_ids_exist":\s*"[^"]*"/)[0], /\{batch\}/);
    assert.match(f.match(/"am\.imp\.batchIs":\s*"[^"]*"/)[0], /\{batch\}/);
  }
  // the kind comes from the picked file (its item types), not from a guess on the server
  const k = admin.indexOf("function amImportKind");
  assert.ok(k >= 0, "amImportKind exists");
  assert.ok(/["']place["']/.test(admin.slice(k, k + 700)), "kind is derived from the item types");
});

// ---- L: local guard ------------------------------------------------------------------------------------------------------
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "merit-import2-"));
  const ledger = join(dir, "ledger.json");
  const write = (name, obj) => { const p = join(dir, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 1)); return p; };
  const guard = (args, input) => spawnSync(process.execPath, [GUARD, ...args], { encoding: "utf8", input, timeout: 60000, env: { ...process.env, HOME: dir, LENSIQ_MERIT_LEDGER: ledger } });
  const entries = () => existsSync(ledger) ? (JSON.parse(readFileSync(ledger, "utf8")).entries || []) : [];
  return { dir, ledger, write, guard, entries };
}
const items4 = (prefix = "pc-") => ["1", "2", "3", "4"].map(i => place({ draft_id: prefix + i, title: tri("วัดตัวอย่าง " + i, "A sample temple " + i, "示例寺庙 " + i), purposes: ["work", "barami"] }));
const out = r => r.stdout + r.stderr;

test("L1: draft_ids that overlap an already-confirmed batch are refused, even with --idempotent-confirmed", () => {
  const s = sandbox();
  assert.equal(s.guard(["places", s.write("a.json", { batch: "places-2026-11-14", items: items4() })], "places-2026-11-14\n").status, 0);
  const next = items4("new-"); next[2] = { ...next[2], draft_id: "pc-3" };
  const b = s.write("b.json", { batch: "places-2026-12-01", items: next });
  for (const flags of [[], ["--idempotent-confirmed"]]) {
    const r = s.guard(["places", b, ...flags], "places-2026-12-01\n");
    assert.equal(r.status, 1, out(r)); assert.match(out(r), /draft_ids_overlap/); assert.ok(out(r).includes("places-2026-11-14"), "names the batch it overlaps");
    assert.match(out(r), /\b1\b/);
  }
  assert.equal(s.entries().length, 1);
  // disjoint ids are fine
  assert.equal(s.guard(["places", s.write("c.json", { batch: "places-2026-12-02", items: items4("other-") })], "places-2026-12-02\n").status, 0);
});

test("L2: the same items under another batch id (a renamed file) are refused", () => {
  const s = sandbox();
  assert.equal(s.guard(["places", s.write("a.json", { batch: "places-2026-11-14", items: items4() })], "places-2026-11-14\n").status, 0);
  const r = s.guard(["places", s.write("b.json", { batch: "places-2026-12-01", items: items4() })], "places-2026-12-01\n");
  assert.equal(r.status, 1, out(r)); assert.match(out(r), /same_content_other_batch/); assert.ok(out(r).includes("places-2026-11-14"));
  const d1 = [1, 2, 3].map(i => ({ draft_id: "of-" + i, type: "offering", tradition: "general", sort: i, title: tri("ของไหว้ " + i, "Offering " + i, "供品 " + i),
    body: tri("ตามความเชื่อ บางคนไหว้ด้วยดอกไม้และธูป โปรดใช้วิจารณญาณของตนเอง", "By belief, some people offer flowers and incense; please use your own judgement.", "按照信仰，有人用鲜花和香供奉，请自行判断。"),
    place: null, area: null, keys: ["any"] }));
  assert.equal(s.guard(["drafts", s.write("d1.json", { batch: "merit-3-2026-01-01", items: d1 })], "merit-3-2026-01-01\n").status, 0);
  const r2 = s.guard(["drafts", s.write("d2.json", { batch: "merit-3-2026-01-02", items: d1 }), "--idempotent-confirmed"], "merit-3-2026-01-02\n");
  assert.equal(r2.status, 1, out(r2)); assert.match(out(r2), /same_content_other_batch/);
  assert.equal(s.entries().length, 2);
});

test("L3: the ledger records items_sha256 and draft_ids; an old entry without them does not break the guard", () => {
  const s = sandbox();
  assert.equal(s.guard(["places", s.write("a.json", { batch: "places-2026-11-14", items: items4() })], "places-2026-11-14\n").status, 0);
  const e = s.entries()[0];
  assert.match(e.items_sha256, /^[0-9a-f]{64}$/); assert.deepEqual(e.draft_ids, ["pc-1", "pc-2", "pc-3", "pc-4"]);
  // an entry written by the first version of the tool has neither field
  const old = { version: 1, entries: [{ batch: "places-2026-01-01", kind: "places", count: 4, sha256: "0".repeat(64), file: "/x", confirmed_at: "2026-11-15T00:00:00Z" }] };
  writeFileSync(s.ledger, JSON.stringify(old));
  const r = s.guard(["places", s.write("b.json", { batch: "places-2026-12-05", items: items4("fresh-") })], "places-2026-12-05\n");
  assert.equal(r.status, 0, out(r));
  assert.equal(s.entries().length, 2);
});

// ---- D2: documents ---------------------------------------------------------------------------------------------------------
test("D2: owner steps tell the owner to compare the shown batch id, and the waiting line is current", () => {
  const th = readFileSync(join(ROOT, "docs", "MERIT-OWNER-STEPS-TH.md"), "utf8"), en = readFileSync(join(ROOT, "docs", "MERIT-OWNER-STEPS-EN.md"), "utf8");
  assert.ok(th.split("\n").length <= 90, "Thai owner steps stay one page");
  assert.match(th, /เทียบ[^\n]*รหัสชุด[^\n]*places-2026-11-14-notes|รหัสชุด[^\n]*เทียบ[^\n]*places-2026-11-14-notes/);
  assert.match(th, /เทียบ[^\n]*รหัสชุด[^\n]*merit-108-2026-11-12|รหัสชุด[^\n]*เทียบ[^\n]*merit-108-2026-11-12/);
  assert.match(en, /compare[^\n]*batch id[^\n]*places-2026-11-14-notes/i);
  assert.match(en, /compare[^\n]*batch id[^\n]*merit-108-2026-11-12/i);
  const wait = d => d.split(/\n(?=- |\n|#)/).filter(x => /ต้องรอ|Waiting on the coordinator/i.test(x)).join("\n");
  for (const [name, d] of [["TH", th], ["EN", en]]) {
    const w = wait(d);
    assert.ok(w.includes("0019") && w.includes("lensiq-test") && w.includes("draft_ids_exist"), name + " waiting line: migration 0019 applied on lensiq-test, new Worker deploy for draft_ids_exist\n" + w);
    assert.ok(!/npm run backend:migrate/.test(w), name + " no longer asks for the migration");
  }
  assert.match(th, /ปรับใช้ Worker|deploy/); assert.match(en, /Worker deploy|deploy the Worker|new Worker/i);
});

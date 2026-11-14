"use strict";
// tests/unit/backend-merit-batches.test.js — owner review of the place drafts (coordinator message 2026-11-14, after the
// owner accepted the 35 entries). FIXED TEST SET: written and hash-locked (evals-locks/merit-places.sha256, append-only,
// ~/LENSIQ-field/evals/merit-places/locked.sha256) BEFORE the product change. Never edited to make the product pass.
//   MB1 a drafts file may carry a batch id; every imported draft keeps it (review_meta.batch) and the admin list returns
//       the batches already imported (batch, count, imported_at); nothing of it is served by GET /v1/merit/guidance
//   MB2 importing a batch id that already exists is refused (409 batch_exists) in the check step and in the import, and
//       nothing is written; a malformed batch id is refused (400); a file without a batch still imports (old files)
//   MB3 verification "official_unopened" is accepted: an official page found but not opened at the source
//   MB4 POST /admin/api/merit/items/:id/verify raises official_unopened -> official only (409 bad_transition from any other
//       level, 400 for any other target); the item status does not change; the history records action "verify" with
//       the from / to levels; the route is open to reviewers (REVIEWER_ROUTES)
//   MB5 tools/merit-drafts-check.mjs reads {batch, items}, prints the batch id and counts official_unopened; a file
//       without a batch gets a warning line (exit code unchanged for old files)
//   MB6 admin: sends the batch, refuses a file without one before calling the Worker, lists imported batches, shows a
//       raise-to-official button and the "verify" history label; labels in TH (admin.js) / EN / ZH; the exact wording of
//       official_unopened in all three languages
//   MB7 (independent review of 12297d4) an update of a word_of_mouth item is re-checked: owner or reviewer edits that
//       remove the marker ("ตามที่เล่าต่อกันมา" / "word of mouth" / "民间流传") from the body in any language are refused
//       (400 merit_invalid) and nothing is saved; edits that keep it are saved; other levels are not affected
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const tri = (th, en, zh) => ({ th, en, zh });
const place = (o = {}) => ({
  draft_id: "pc-batch-sample", type: "place", tradition: "thai_buddhist", sort: 10,
  title: tri("วัดตัวอย่าง อุบลราชธานี", "A sample temple, Ubon Ratchathani", "乌汶府示例寺庙"),
  body: tri("ตามความเชื่อ หลายคนมาไหว้พระที่นี่เพื่อขอพรเรื่องการงาน แต่งกายสุภาพ", "By belief, many people come here to pray about their work, dressed modestly.",
    "按照信仰，很多人来此为工作祈福，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("อุบลราชธานี", "Ubon Ratchathani", "乌汶府"), keys: ["domain:planner"],
  purposes: ["work"], province: "Ubon Ratchathani", verification: "official_unopened",
  sources: [{ url: "https://example.org/wat-ubon", publisher: "Example (official site)", title: "Wat", accessed: "2026-11-14" }],
  uncertain: "ผู้ตรวจโปรดตรวจ: check the official page.", ...o
});

async function owner() {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: "bootstrap-" + "b".repeat(40), SECRETS_KEK: Buffer.alloc(32, 6).toString("base64") });
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    return { status: r.status, j: await r.json() };
  };
  const pw = "correct horse battery batches";
  await call("/admin/api/bootstrap", { method: "POST", body: { token: "bootstrap-" + "b".repeat(40), username: "owner", password: pw } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: pw, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, headers: { Authorization: "Bearer " + tok } });
  return { call, O, pw };
}
const imported = async O => (await O("/merit/items")).j.items.filter(x => x.source === "import");

test("MB1: the batch id is kept on every draft and listed with count and date; nothing is served", async () => {
  const { O, call, pw } = await owner();
  const r = await O("/merit/import", { method: "POST", body: { batch: "places-2026-11-14", items: [place(), place({ draft_id: "two" })], password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.imported, 2);
  const list = await imported(O);
  assert.equal(list.length, 2);
  for (const x of list) assert.equal(x.review_meta.batch, "places-2026-11-14");
  const all = (await O("/merit/items")).j;
  assert.ok(Array.isArray(all.batches), "batches listed");
  const b = all.batches.find(x => x.batch === "places-2026-11-14");
  assert.ok(b, "batch listed");
  assert.equal(b.count, 2);
  assert.ok(Number.isInteger(b.imported_at) && b.imported_at > 0);
  const pub = JSON.stringify((await call("/v1/merit/guidance")).j);
  for (const s of ["places-2026-11-14", "batch", "official_unopened"]) assert.ok(!pub.includes(s), "not served: " + s);
});

test("MB2: a batch already imported is refused in the check and in the import; nothing is written", async () => {
  const { O, pw } = await owner();
  const first = await O("/merit/import", { method: "POST", body: { batch: "merit-108-2026-11-12", items: [place()], password: pw } });
  assert.equal(first.status, 200, JSON.stringify(first.j));
  for (const dry of [true, false]) {
    const again = await O("/merit/import", { method: "POST", body: { batch: "merit-108-2026-11-12", items: [place(), place()], dry_run: dry, password: pw } });
    assert.equal(again.status, 409, JSON.stringify(again.j));
    assert.equal(again.j.code, "batch_exists");
    assert.match(again.j.error, /merit-108-2026-11-12/);
  }
  assert.equal((await imported(O)).length, 1, "nothing written by the refused imports");
  for (const bad of ["", "Bad Batch", "x", "a".repeat(80), "../etc", 5]) {
    const r = await O("/merit/import", { method: "POST", body: { batch: bad, items: [place()], dry_run: true, password: pw } });
    assert.equal(r.status, 400, "refused batch " + JSON.stringify(bad));
  }
  const old = await O("/merit/import", { method: "POST", body: { items: [place({ draft_id: "nobatch" })], password: pw } });
  assert.equal(old.status, 200, "a file without a batch still imports");
  const nb = (await imported(O)).find(x => x.review_meta && x.review_meta.draft_id === "nobatch");
  assert.ok(nb && nb.review_meta.batch == null);
});

test("MB3: verification official_unopened is accepted and kept", async () => {
  const { splitReviewMeta } = await import(B + "merit.js");
  assert.equal(splitReviewMeta(place()).meta.verification, "official_unopened");
  const { VERIFICATIONS } = await import(B + "merit.js");
  assert.deepEqual([...VERIFICATIONS].sort(), ["official", "official_unopened", "secondary", "word_of_mouth"]);
});

test("MB4: raise official_unopened -> official from the review screen; recorded in the history; nothing else", async () => {
  const { O, pw } = await owner();
  const items = [place({ draft_id: "unopened" }), place({ draft_id: "second", verification: "secondary" }), place({ draft_id: "noverif", verification: undefined })];
  delete items[2].verification;
  const r = await O("/merit/import", { method: "POST", body: { batch: "mb4-batch", items, password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const list = await imported(O);
  const byId = id => list.find(x => x.review_meta.draft_id === id);
  const u = byId("unopened");
  const bad = await O("/merit/items/" + u.id + "/verify", { method: "POST", body: { verification: "word_of_mouth" } });
  assert.equal(bad.status, 400);
  const ok = await O("/merit/items/" + u.id + "/verify", { method: "POST", body: { verification: "official", comment: "opened the page in a browser" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.j));
  assert.equal(ok.j.item.review_meta.verification, "official");
  assert.equal(ok.j.item.status, "draft", "status unchanged");
  assert.deepEqual(ok.j.item.review_meta.purposes, ["work"], "other notes kept");
  const twice = await O("/merit/items/" + u.id + "/verify", { method: "POST", body: { verification: "official" } });
  assert.equal(twice.status, 409);
  for (const id of ["second", "noverif"]) {
    const x = await O("/merit/items/" + byId(id).id + "/verify", { method: "POST", body: { verification: "official" } });
    assert.equal(x.status, 409, id);
  }
  const h = (await O("/merit/items/" + u.id + "/history")).j.history;
  const v = h.find(x => x.action === "verify");
  assert.ok(v, "history row");
  assert.match(v.comment, /official_unopened/); assert.match(v.comment, /official/); assert.match(v.comment, /opened the page/);
  const { reviewerAllowed } = await import(B + "index.js");
  assert.equal(reviewerAllowed("POST", "/merit/items/mi-abc123/verify"), true);
  assert.equal(reviewerAllowed("POST", "/merit/import"), false);
});

test("MB5: merit-drafts-check reads {batch, items}, prints the batch and counts official_unopened", () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-batches-"));
  const withB = join(dir, "b.json"), without = join(dir, "n.json");
  writeFileSync(withB, JSON.stringify({ batch: "places-2026-11-14", items: [place(), place({ draft_id: "x2" })] }));
  writeFileSync(without, JSON.stringify([place()]));
  const run = f => spawnSync(process.execPath, [join(ROOT, "tools", "merit-drafts-check.mjs"), f], { encoding: "utf8" });
  const a = run(withB), n = run(without);
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.match(a.stdout, /batch: places-2026-11-14/);
  assert.match(a.stdout, /verification official_unopened: 2\b/);
  assert.match(a.stdout, /2 of 2 item\(s\) pass/);
  assert.equal(n.status, 0, n.stdout + n.stderr);
  assert.match(n.stdout, /no batch id/i);
});

test("MB6: admin import needs a batch, lists imported batches, raise-to-official button; labels TH / EN / ZH", () => {
  const admin = readFileSync(join(ROOT, "admin.js"), "utf8");
  assert.match(admin, /batch:\s*amImp\.batch/, "the batch is sent with the items");
  assert.match(admin, /"\/merit\/items\/"\s*\+\s*[\w.]+\s*\+\s*"\/verify"/, "verify call");
  assert.match(admin, /\.batches/, "imported batches listed");
  const keys = ["am.vf.official_unopened", "am.imp.nobatch", "am.imp.batches", "am.imp.batchLine", "am.e.batch_exists", "am.v.verify", "am.v.verifyQ", "am.h.verify"];
  for (const k of keys) assert.ok(admin.includes('"' + k + '"'), "admin.js uses " + k + " with a Thai fallback");
  for (const f of ["en-admin.js", "zh-admin.js"]) {
    const src = readFileSync(join(ROOT, "i18n", f), "utf8");
    for (const k of keys) assert.match(src, new RegExp('"' + k.replace(/\./g, "\\.") + '"\\s*:\\s*"[^"]+"'), f + " has " + k);
  }
  assert.match(admin, /"am\.vf\.official_unopened",\s*"แหล่งทางการ \(ยังไม่ได้เปิดอ่านหน้าต้นทาง\)"/);
  assert.match(readFileSync(join(ROOT, "i18n", "en-admin.js"), "utf8"), /"am\.vf\.official_unopened":\s*"official source \(page not yet opened\)"/);
  assert.match(readFileSync(join(ROOT, "i18n", "zh-admin.js"), "utf8"), /"am\.vf\.official_unopened":\s*"官方来源（尚未打开原页面）"/);
  // the refusal happens on the page before any call when the file has no batch
  const i = admin.indexOf('"am.imp.nobatch"'), j = admin.indexOf('"/merit/import"');
  assert.ok(i > 0 && j > 0 && i < j, "no-batch check comes before the import call");
});

test("MB7: editing a word_of_mouth item cannot drop the word-of-mouth marker (any language, owner edits too)", async () => {
  const { O, pw } = await owner();
  const wom = place({ draft_id: "wom", verification: "word_of_mouth",
    body: tri("ตามที่เล่าต่อกันมา หลายคนมาขอพรเรื่องการงานที่นี่", "As passed on by word of mouth, many people pray here about work.", "据民间流传，很多人来此为工作祈福。") });
  const sec = place({ draft_id: "sec", verification: "secondary" });
  const r = await O("/merit/import", { method: "POST", body: { batch: "mb7-batch", items: [wom, sec], password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const list = await imported(O);
  const w = list.find(x => x.review_meta.draft_id === "wom"), s = list.find(x => x.review_meta.draft_id === "sec");
  const drops = [
    { th: "ตามความเชื่อ หลายคนมาขอพรเรื่องการงานที่นี่", en: wom.body.en, zh: wom.body.zh },
    { th: wom.body.th, en: "By belief, many people pray here about work.", zh: wom.body.zh },
    { th: wom.body.th, en: wom.body.en, zh: "按照信仰，很多人来此为工作祈福。" }
  ];
  for (const body of drops) {
    const u = await O("/merit/items/" + w.id, { method: "PUT", body: { body } });
    assert.equal(u.status, 400, JSON.stringify(body));
    assert.equal(u.j.code, "merit_invalid");
  }
  const after = (await imported(O)).find(x => x.id === w.id);
  assert.deepEqual(after.body, wom.body, "nothing saved");
  const keep = await O("/merit/items/" + w.id, { method: "PUT", body: { body: { ...wom.body, th: wom.body.th + " แต่งกายสุภาพ" } } });
  assert.equal(keep.status, 200, JSON.stringify(keep.j));
  const other = await O("/merit/items/" + s.id, { method: "PUT", body: { body: { ...sec.body, th: "ตามความเชื่อ หลายคนมาไหว้ที่นี่" } } });
  assert.equal(other.status, 200, JSON.stringify(other.j));
});

"use strict";
// tests/unit/backend-merit-drafts.test.js — importing the merit drafts file with its reviewer notes (coordinator request
// 2026-11-12, during the reviewer-role work; written AFTER splitReviewMeta / tools/merit-drafts-check.mjs, recorded as
// such in ~/LENSIQ-field/evals/merit/locked.sha256). The real file (~/LENSIQ-field/merit-content/drafts-2026-11-12.json,
// 108 entries) stays outside the repo; these cases copy its shape.
//   D1 draft_id / disciplines / sources / uncertain are kept as reviewer-only notes (admin list), every entry comes in as a
//      non-sample draft, and nothing of the notes (or the drafts) is ever served by GET /v1/merit/guidance
//   D2 malformed notes are refused per item (a non-http source, an over-long note, a bad draft_id); other unknown fields too
//   D3 tools/merit-drafts-check.mjs gives the same answer offline (exit 0 when all pass, 1 otherwise)
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const tri = (th, en, zh) => ({ th, en, zh });
const entry = (o = {}) => ({
  draft_id: "pl-tb-sample", type: "place", tradition: "thai_buddhist", status: "draft", sample: false, sort: 5,
  title: tri("วัดตัวอย่าง กรุงเทพฯ", "A sample temple, Bangkok", "曼谷示例寺庙"),
  body: tri("ตามความเชื่อ หลายคนไปไหว้พระที่วัดนี้ด้วยใจสงบ แต่งกายสุภาพ", "By custom, many people pay respects here with a calm mind and modest dress.", "按照习俗，很多人以平静的心来此参拜，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("กรุงเทพฯ", "Bangkok", "曼谷"), keys: ["any"], disciplines: ["fortune", "report"],
  sources: [{ url: "https://example.org/wat", publisher: "Example (official site)", title: "Wat", accessed: "2026-11-12" }],
  uncertain: "Opening hours are not stated in the cited page; check before publishing.", ...o
});

async function owner() {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: "bootstrap-" + "d".repeat(40), SECRETS_KEK: Buffer.alloc(32, 4).toString("base64") });
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    return { status: r.status, j: await r.json() };
  };
  const pw = "correct horse battery drafts";
  await call("/admin/api/bootstrap", { method: "POST", body: { token: "bootstrap-" + "d".repeat(40), username: "owner", password: pw } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: pw, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, headers: { Authorization: "Bearer " + tok } });
  return { env, call, O, pw };
}

test("D1: reviewer notes are kept for the review screen only; entries arrive as non-sample drafts; nothing is served", async () => {
  const { O, call, pw } = await owner();
  const items = [entry(), entry({ draft_id: "ch-cf-rat", type: "chong", tradition: "chinese_folk", keys: ["animal:0", "chong"], uncertain: undefined, place: null, area: null })];
  const r = await O("/merit/import", { method: "POST", body: { items, password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.imported, 2); assert.deepEqual(r.j.refused, []);
  const list = (await O("/merit/items")).j.items.filter(x => x.source === "import");
  assert.equal(list.length, 2);
  for (const x of list) { assert.equal(x.status, "draft"); assert.equal(x.sample, false); }
  const a = list.find(x => x.review_meta && x.review_meta.draft_id === "pl-tb-sample");
  assert.ok(a, "notes kept");
  assert.deepEqual(a.review_meta.disciplines, ["fortune", "report"]);
  assert.equal(a.review_meta.sources[0].url, "https://example.org/wat");
  assert.match(a.review_meta.uncertain, /Opening hours/);
  const b = list.find(x => x.review_meta && x.review_meta.draft_id === "ch-cf-rat");
  assert.ok(b && !b.review_meta.uncertain && b.keys.includes("animal:0") && b.keys.includes("chong"));
  const pub = JSON.stringify((await call("/v1/merit/guidance")).j);
  for (const s of ["example.org", "Opening hours", "pl-tb-sample", "review_meta", "disciplines"]) assert.ok(!pub.includes(s), "not served: " + s);
});

test("D2: malformed reviewer notes and unknown fields are refused per item, with the index", async () => {
  const { O, pw } = await owner();
  const bad = [
    entry({ sources: [{ url: "javascript:alert(1)" }] }), entry({ sources: [{ url: "ftp://x.y/z" }] }), entry({ sources: Array.from({ length: 11 }, () => ({ url: "https://a.b/c" })) }),
    entry({ uncertain: "x".repeat(2001) }), entry({ draft_id: "bad id with spaces" }), entry({ disciplines: ["Fortune Page!"] }), entry({ notes: "free text" })
  ];
  const r = await O("/merit/import", { method: "POST", body: { items: [entry(), ...bad], dry_run: true, password: pw } });
  assert.equal(r.status, 200);
  assert.equal(r.j.ok_count, 1);
  assert.deepEqual(r.j.refused.map(x => x.index), [1, 2, 3, 4, 5, 6, 7]);
});

test("D3: tools/merit-drafts-check.mjs checks a drafts file offline (exit 0 all pass, 1 otherwise)", () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-drafts-"));
  const good = join(dir, "good.json"), bad = join(dir, "bad.json");
  writeFileSync(good, JSON.stringify([entry(), entry({ draft_id: "two" })]));
  writeFileSync(bad, JSON.stringify({ items: [entry(), entry({ body: tri("ไหว้แล้วรวยแน่นอน", "Guaranteed luck", "保证转运") })] }));
  const run = f => spawnSync(process.execPath, [join(ROOT, "tools", "merit-drafts-check.mjs"), f], { encoding: "utf8" });
  const g = run(good), b = run(bad);
  assert.equal(g.status, 0, g.stdout + g.stderr); assert.match(g.stdout, /2 of 2 item\(s\) pass/);
  assert.equal(b.status, 1); assert.match(b.stdout, /#2/); assert.match(b.stdout, /1 of 2 item\(s\) pass/);
});

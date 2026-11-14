"use strict";
// tests/unit/backend-merit-places.test.js — places to pay respect (owner order 2026-11-14, Part C, "สายมู"). FIXED TEST SET:
// written and hash-locked (evals-locks/merit-places.sha256, ~/LENSIQ-field/evals/merit-places/locked.sha256) BEFORE the
// product change in backend/src/merit.js, tools/merit-drafts-check.mjs and admin.js. Never edited to make the product pass.
// The real drafts file (~/LENSIQ-field/merit/places-2026-11-14.json) stays outside the repo; these cases copy its shape.
//   PL1 a place draft may carry back-office notes purposes (work | money | love | health | protection | barami), province
//       (English name) and verification (official | secondary | word_of_mouth); they are kept in review_meta, the item
//       comes in as a non-sample draft, and none of the notes (nor the draft) is served by GET /v1/merit/guidance
//   PL2 malformed notes are refused per item: an unknown purpose, an empty or over-long purpose list, a duplicate, a bad
//       province, an unknown verification value
//   PL3 verification "word_of_mouth" needs the word-of-mouth marker in the user text of all three languages
//       (TH "ตามที่เล่าต่อกันมา", EN "word of mouth", ZH "民间流传"), so a reader sees it once the item is approved
//   PL4 tools/merit-drafts-check.mjs checks such a file offline and prints the count per purpose
//   PL5 the admin review screen shows purposes / province / verification, with labels in TH (admin.js) and EN / ZH
//       (i18n/en-admin.js, i18n/zh-admin.js)
//   PL6 the existing display already hides every place (any purpose) while the crisis state is set: panelModel -> null
//   PL7 promise wording stays refused in place entries ("รวยแน่", "แก้ชงได้", "ปังแน่นอน")
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const PURPOSES = ["work", "money", "love", "health", "protection", "barami"];
const tri = (th, en, zh) => ({ th, en, zh });
const place = (o = {}) => ({
  draft_id: "pc-ubon-sample", type: "place", tradition: "thai_buddhist", sort: 10,
  title: tri("วัดตัวอย่าง อุบลราชธานี", "A sample temple, Ubon Ratchathani", "乌汶府示例寺庙"),
  body: tri("ตามความเชื่อ หลายคนมาไหว้พระที่นี่เพื่อขอพรเรื่องการงาน แต่งกายสุภาพ", "By belief, many people come here to pray about their work, dressed modestly.",
    "按照信仰，很多人来此为工作祈福，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("อุบลราชธานี", "Ubon Ratchathani", "乌汶府"), keys: ["domain:planner"],
  purposes: ["work", "barami"], province: "Ubon Ratchathani", verification: "official",
  sources: [{ url: "https://example.org/wat-ubon", publisher: "Example (official site)", title: "Wat", accessed: "2026-11-14" }], ...o
});
const wom = (o = {}) => place({
  draft_id: "pc-wom", verification: "word_of_mouth",
  body: tri("ตามที่เล่าต่อกันมา หลายคนมาขอพรเรื่องความรักที่นี่ เป็นความเชื่อ โปรดใช้วิจารณญาณ",
    "As passed on by word of mouth, many people come here to pray about love. A belief; use your own judgement.",
    "据民间流传，很多人来此为爱情祈福。这是信仰，请自行判断。"), purposes: ["love"], ...o
});

async function owner() {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ ADMIN_BOOTSTRAP_TOKEN: "bootstrap-" + "p".repeat(40), SECRETS_KEK: Buffer.alloc(32, 5).toString("base64") });
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {} }), env, {});
    return { status: r.status, j: await r.json() };
  };
  const pw = "correct horse battery places";
  await call("/admin/api/bootstrap", { method: "POST", body: { token: "bootstrap-" + "p".repeat(40), username: "owner", password: pw } });
  const tok = (await call("/admin/api/login", { method: "POST", body: { username: "owner", password: pw, mode: "bearer" } })).j.token;
  const O = (p, o = {}) => call("/admin/api" + p, { ...o, headers: { Authorization: "Bearer " + tok } });
  return { call, O, pw };
}

test("PL1: purposes / province / verification are back-office notes; the place arrives as a draft; nothing is served", async () => {
  const { O, call, pw } = await owner();
  const r = await O("/merit/import", { method: "POST", body: { items: [place(), wom()], password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.imported, 2); assert.deepEqual(r.j.refused, []);
  const list = (await O("/merit/items")).j.items.filter(x => x.source === "import");
  assert.equal(list.length, 2);
  for (const x of list) { assert.equal(x.status, "draft"); assert.equal(x.sample, false); assert.equal(x.type, "place"); }
  const a = list.find(x => x.review_meta && x.review_meta.draft_id === "pc-ubon-sample");
  assert.ok(a, "notes kept");
  assert.deepEqual(a.review_meta.purposes, ["work", "barami"]);
  assert.equal(a.review_meta.province, "Ubon Ratchathani");
  assert.equal(a.review_meta.verification, "official");
  const b = list.find(x => x.review_meta && x.review_meta.draft_id === "pc-wom");
  assert.equal(b.review_meta.verification, "word_of_mouth");
  assert.deepEqual(b.review_meta.purposes, ["love"]);
  const pub = JSON.stringify((await call("/v1/merit/guidance")).j);
  for (const s of ["example.org", "pc-ubon-sample", "purposes", "verification", "word_of_mouth", "review_meta", "Ubon Ratchathani"]) {
    assert.ok(!pub.includes(s), "not served: " + s);
  }
});

test("PL2: malformed purpose / province / verification notes are refused per item, with the index", async () => {
  const { splitReviewMeta } = await import(B + "merit.js");
  for (const p of PURPOSES) assert.deepEqual(splitReviewMeta(place({ purposes: [p] })).meta.purposes, [p]);
  assert.deepEqual(splitReviewMeta(place({ purposes: PURPOSES })).meta.purposes, PURPOSES);
  const { O, pw } = await owner();
  const bad = [
    place({ purposes: ["lottery"] }), place({ purposes: [] }), place({ purposes: "work" }), place({ purposes: ["work", "work"] }),
    place({ purposes: PURPOSES.concat(["work"]) }), place({ province: "<b>Ubon</b>" }), place({ province: "x".repeat(61) }), place({ province: 5 }),
    place({ verification: "verified" }), place({ verification: "" })
  ];
  const r = await O("/merit/import", { method: "POST", body: { items: [place(), ...bad], dry_run: true, password: pw } });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.equal(r.j.ok_count, 1);
  assert.deepEqual(r.j.refused.map(x => x.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("PL3: a word-of-mouth item must say so to the reader in Thai, English and Chinese", async () => {
  const { splitReviewMeta } = await import(B + "merit.js");
  assert.equal(splitReviewMeta(wom()).meta.verification, "word_of_mouth");
  const drop = (l, from, to) => { const w = wom(); w.body = { ...w.body, [l]: w.body[l].replace(from, to) }; return w; };
  assert.throws(() => splitReviewMeta(drop("th", "ตามที่เล่าต่อกันมา", "ตามความเชื่อ")), /word_of_mouth|ตามที่เล่าต่อกันมา/);
  assert.throws(() => splitReviewMeta(drop("en", "word of mouth", "custom")), /word_of_mouth|word of mouth/);
  assert.throws(() => splitReviewMeta(drop("zh", "民间流传", "习俗")), /word_of_mouth|民间流传/);
  // official / secondary entries do not need the marker
  assert.equal(splitReviewMeta(place({ verification: "secondary" })).meta.verification, "secondary");
});

test("PL4: tools/merit-drafts-check.mjs checks a places file offline and prints the count per purpose", () => {
  const dir = mkdtempSync(join(tmpdir(), "merit-places-"));
  const good = join(dir, "good.json"), bad = join(dir, "bad.json");
  writeFileSync(good, JSON.stringify([place(), wom(), place({ draft_id: "three", purposes: ["work"] })]));
  writeFileSync(bad, JSON.stringify([place(), place({ purposes: ["lottery"] })]));
  const run = f => spawnSync(process.execPath, [join(ROOT, "tools", "merit-drafts-check.mjs"), f], { encoding: "utf8" });
  const g = run(good), b = run(bad);
  assert.equal(g.status, 0, g.stdout + g.stderr); assert.match(g.stdout, /3 of 3 item\(s\) pass/);
  assert.match(g.stdout, /purpose work: 2\b/); assert.match(g.stdout, /purpose barami: 1\b/); assert.match(g.stdout, /purpose love: 1\b/);
  assert.match(g.stdout, /verification official: 2\b/); assert.match(g.stdout, /verification word_of_mouth: 1\b/);
  assert.equal(b.status, 1); assert.match(b.stdout, /#2/);
});

test("PL5: the review screen shows purposes, province and verification, labelled in TH / EN / ZH", () => {
  const admin = readFileSync(join(ROOT, "admin.js"), "utf8");
  assert.match(admin, /meta\.purposes/); assert.match(admin, /meta\.province/); assert.match(admin, /meta\.verification/);
  const keys = ["am.v.purposes", "am.v.province", "am.v.verification"].concat(PURPOSES.map(p => "am.pp." + p),
    ["official", "secondary", "word_of_mouth"].map(v => "am.vf." + v));
  for (const k of keys) assert.ok(admin.includes('"' + k + '"'), "admin.js uses " + k + " with a Thai fallback");
  for (const f of ["en-admin.js", "zh-admin.js"]) {
    const src = readFileSync(join(ROOT, "i18n", f), "utf8");
    for (const k of keys) assert.match(src, new RegExp('"' + k.replace(/\./g, "\\.") + '"\\s*:\\s*"[^"]+"'), f + " has " + k);
  }
  assert.match(admin, /"am\.vf\.word_of_mouth",\s*"ตามที่เล่าต่อกันมา"/);
});

test("PL6: the existing display hides every place while the crisis state is set", () => {
  const C = require("../../lensiq-merit-core.js");
  const items = PURPOSES.map((p, i) => ({ id: "pc-" + p, status: "published", type: "place", tradition: "general", keys: ["any"], sort: i,
    title: tri("ที่ " + p, "Place " + p, "地点 " + p), body: tri("ตามความเชื่อ", "By belief", "按照信仰"), place: null, area: null }));
  const on = C.panelModel(items, { choice: "", keys: ["any"], lang: "th", crisis: false });
  assert.ok(on && on.cards.length >= 1, "shown without the crisis state");
  for (const lang of ["th", "en", "zh"]) assert.equal(C.panelModel(items, { choice: "", keys: ["any"], lang, crisis: true }), null);
});

test("PL7: promise wording stays refused in place entries", async () => {
  const { cleanItem, splitReviewMeta } = await import(B + "merit.js");
  const save = raw => { const b = { ...splitReviewMeta(raw).rest }; delete b.status; return cleanItem({ ...b, status: "draft" }); };
  assert.ok(save(place()));
  for (const th of ["ไหว้แล้วรวยแน่", "มาไหว้ที่นี่แก้ชงได้", "งานปังแน่นอน"]) {
    assert.throws(() => save(place({ body: tri(th, "By belief, many people pray here.", "按照信仰，很多人在此祈福。") })), /wording not allowed/);
  }
});

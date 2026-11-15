"use strict";
// tests/unit/merit-import.test.js — FIXED TEST SET for the Merit import safety work (owner order 2026-11-15, branch
// merit-import-safe). Written to ~/LENSIQ-field/evals/merit-import/ and hash-locked (evals-locks/merit-import.sha256)
// BEFORE tools/merit-import-guard.mjs and tools/merit-places-notes.mjs exist. Never edited to make the product pass.
// The two real files (drafts-2026-11-12.json, places-2026-11-14.json) are never read here: the cases copy their shape.
//   G1  `drafts` refuses a places file (kind_mismatch); no confirmation is asked; nothing is recorded
//   G2  `places` refuses a drafts file (kind_mismatch)
//   G3  a file without a batch id is refused by both commands (batch_missing)
//   G4  `places` refuses a file whose items are not all places with purposes / province / verification (item_kind);
//       `drafts` refuses an item that carries place-only notes, and a batch whose number differs from the item count
//   G5  before it asks, the tool prints batch id, item count and the sha256 of the file (in that order)
//   G6  a wrong answer (or no answer) cancels and records nothing; typing the batch id confirms and records it
//   G7  a second run for the same batch is refused (already_confirmed) unless --idempotent-confirmed is given; the
//       ledger keeps one entry
//   G8  the same batch id with different content is refused even with --idempotent-confirmed (file_changed)
//   G9  places-2026-11-14 and places-2026-11-14-notes hold the same 35 places: after one is confirmed the other is
//       refused in either order (same_places_other_batch)
//   G10 the tool never changes the file it checks and writes nothing but the ledger
//   G11 with no file argument each command uses its own default file under ~/LENSIQ-field (drafts: merit-content/
//       drafts-2026-11-12.json; places: merit/places-2026-11-14-notes.json); a missing default is exit 2
//   G12 every item goes through the Worker's own validation (item_invalid)
//   G13 package.json scripts merit:import:drafts / merit:import:places / merit:notes
//   N1  tools/merit-places-notes.mjs writes a NEW complete batch <batch>-notes: items equal to the input except the
//       back-office `uncertain` note, which gets the reviewer warning for the item's verification level (official_unopened,
//       secondary, word_of_mouth) in Thai and English plus the common warning, keeping the writer's text; at most 2000
//       characters; the input is never changed; an existing output is never overwritten; the result passes the guard
//   N2  the notes tool refuses an input that is not a places batch, or already a -notes batch, or out == in
//   D1  docs: owner steps (TH, at most 90 lines) and the English companion carry both numbered sequences with the exact
//       commands, the batch ids, and say plainly to import the -notes file INSTEAD of the original places file
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const ROOT = join(__dirname, "..", "..");
const GUARD = join(ROOT, "tools", "merit-import-guard.mjs");
const NOTES = join(ROOT, "tools", "merit-places-notes.mjs");
const CHECK = join(ROOT, "tools", "merit-drafts-check.mjs");
const sha = b => createHash("sha256").update(b).digest("hex");
const tri = (th, en, zh) => ({ th, en, zh });

const offering = (i, o = {}) => ({
  draft_id: "of-" + i, type: "offering", tradition: "general", sort: 10 + i,
  title: tri("ของไหว้ตัวอย่าง " + i, "Sample offering " + i, "示例供品 " + i),
  body: tri("ตามความเชื่อ บางคนไหว้ด้วยดอกไม้และธูป โปรดใช้วิจารณญาณของตนเอง", "By belief, some people offer flowers and incense; please use your own judgement.",
    "按照信仰，有人用鲜花和香供奉，请自行判断。"),
  place: null, area: null, keys: ["any"], ...o
});
const place = (i, verification, o = {}) => ({
  draft_id: "pc-" + i, type: "place", tradition: "thai_buddhist", sort: 10 + i,
  title: tri("วัดตัวอย่าง " + i, "A sample temple " + i, "示例寺庙 " + i),
  body: verification === "word_of_mouth"
    ? tri("ตามที่เล่าต่อกันมา หลายคนมาขอพรเรื่องความรักที่นี่ เป็นความเชื่อ โปรดใช้วิจารณญาณ", "As passed on by word of mouth, many people come here to pray about love. A belief; use your own judgement.",
      "据民间流传，很多人来此为爱情祈福。这是信仰，请自行判断。")
    : tri("ตามความเชื่อ หลายคนมาไหว้พระที่นี่เพื่อขอพรเรื่องการงาน แต่งกายสุภาพ", "By belief, many people come here to pray about their work, dressed modestly.",
      "按照信仰，很多人来此为工作祈福，穿着得体。"),
  place: tri("วัดตัวอย่าง", "Sample temple", "示例寺庙"), area: tri("อุบลราชธานี", "Ubon Ratchathani", "乌汶府"), keys: ["domain:planner"],
  disciplines: ["fortune"], purposes: ["work", "barami"], province: "Ubon Ratchathani", verification,
  sources: [{ url: "https://example.org/wat-" + i, publisher: "Example", title: "Wat " + i, accessed: "2026-11-14" }],
  uncertain: "Founding date differs between sources; not used.", ...o
});
const placesItems = () => [place(1, "official_unopened", { uncertain: "ผู้ตรวจโปรดตรวจ: ยืนยันชื่อวัดที่ถูกต้อง (Reviewer: confirm the exact temple name.) Official source read through a web-search summary." }),
  place(2, "secondary"), place(3, "word_of_mouth"), place(4, "official_unopened")];
const draftsItems = n => Array.from({ length: n }, (_, i) => offering(i + 1));

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "merit-import-"));
  const ledger = join(dir, "ledger.json");
  const write = (name, obj) => { const p = join(dir, name); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 1)); return p; };
  const run = (script, args, o = {}) => spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8", input: o.input === undefined ? "" : o.input, timeout: 60000,
    env: { ...process.env, HOME: o.home || dir, LENSIQ_MERIT_LEDGER: o.ledger || ledger }
  });
  const guard = (args, input, o = {}) => run(GUARD, args, { ...o, input });
  const entries = () => existsSync(ledger) ? (JSON.parse(readFileSync(ledger, "utf8")).entries || []) : [];
  return { dir, ledger, write, run, guard, entries };
}
const dFile = (s, n = 3, batch = `merit-${n}-2026-01-01`) => s.write("d.json", { batch, items: draftsItems(n) });
const pFile = (s, batch = "places-2026-11-14", name = "p.json") => s.write(name, { batch, items: placesItems() });

test("G1: `drafts` refuses a places file; nothing asked, nothing recorded", () => {
  const s = sandbox(), f = pFile(s);
  const r = s.guard(["drafts", f], "places-2026-11-14\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /kind_mismatch/);
  assert.ok(!/Type the batch id/i.test(r.stdout), "no confirmation prompt on a refused file");
  assert.equal(s.entries().length, 0);
});

test("G2: `places` refuses a drafts file", () => {
  const s = sandbox(), f = dFile(s);
  const r = s.guard(["places", f], "merit-3-2026-01-01\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /kind_mismatch/);
  assert.equal(s.entries().length, 0);
});

test("G3: a file without a batch id is refused by both commands", () => {
  const s = sandbox();
  const d = s.write("nb-d.json", { items: draftsItems(3) }), p = s.write("nb-p.json", { items: placesItems() }), arr = s.write("arr.json", placesItems());
  for (const [k, f] of [["drafts", d], ["places", p], ["places", arr]]) {
    const r = s.guard([k, f], "x\n");
    assert.equal(r.status, 1, k + " " + f);
    assert.match(r.stderr + r.stdout, /batch_missing/);
  }
  assert.equal(s.entries().length, 0);
});

test("G4: item kinds are checked inside the file, not only the batch id", () => {
  const s = sandbox();
  const mixed = s.write("mixed.json", { batch: "places-2026-11-14", items: [...placesItems(), offering(9)] });
  let r = s.guard(["places", mixed], "places-2026-11-14\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /item_kind/); assert.match(r.stderr + r.stdout, /#5/);
  const nover = placesItems(); delete nover[1].verification;
  const f2 = s.write("nover.json", { batch: "places-2026-11-14", items: nover });
  r = s.guard(["places", f2], "places-2026-11-14\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /item_kind/); assert.match(r.stderr + r.stdout, /#2/);
  const withNotes = draftsItems(3); withNotes[2] = { ...withNotes[2], purposes: ["work"] };
  const f3 = s.write("dn.json", { batch: "merit-3-2026-01-01", items: withNotes });
  r = s.guard(["drafts", f3], "merit-3-2026-01-01\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /item_kind/); assert.match(r.stderr + r.stdout, /#3/);
  const f4 = s.write("cnt.json", { batch: "merit-108-2026-11-12", items: draftsItems(3) });
  r = s.guard(["drafts", f4], "merit-108-2026-11-12\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /batch_count/);
  assert.equal(s.entries().length, 0);
});

test("G5: batch id, item count and sha256 are printed before the question", () => {
  const s = sandbox(), f = dFile(s, 3);
  const r = s.guard(["drafts", f], "merit-3-2026-01-01\n");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.stdout;
  const iB = out.search(/batch:\s+merit-3-2026-01-01/), iN = out.search(/items:\s+3\b/), iS = out.indexOf(sha(readFileSync(f))), iQ = out.search(/Type the batch id/i);
  assert.ok(iB >= 0 && iN > iB && iS > iN, "order batch, items, sha256: " + out);
  assert.ok(iQ > iS, "the question comes after the three facts");
  assert.match(out, /sha256:\s+[0-9a-f]{64}/);
});

test("G6: a wrong answer or no answer cancels; the batch id confirms and is recorded", () => {
  const s = sandbox(), f = pFile(s);
  for (const input of ["yes\n", "places-2026-11-14-x\n", "", "\n"]) {
    const r = s.guard(["places", f], input);
    assert.equal(r.status, 1, JSON.stringify(input));
    assert.equal(s.entries().length, 0, "nothing recorded after " + JSON.stringify(input));
  }
  const ok = s.guard(["places", f], "places-2026-11-14\n");
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const e = s.entries();
  assert.equal(e.length, 1);
  assert.equal(e[0].batch, "places-2026-11-14"); assert.equal(e[0].sha256, sha(readFileSync(f))); assert.equal(e[0].count, 4); assert.equal(e[0].kind, "places");
  assert.ok(e[0].confirmed_at && !Number.isNaN(Date.parse(e[0].confirmed_at)));
});

test("G7: the same batch is refused the second time unless explicitly confirmed idempotent", () => {
  const s = sandbox(), f = dFile(s, 3);
  assert.equal(s.guard(["drafts", f], "merit-3-2026-01-01\n").status, 0);
  let r = s.guard(["drafts", f], "merit-3-2026-01-01\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /already_confirmed/);
  r = s.guard(["drafts", f, "--idempotent-confirmed"], "merit-3-2026-01-01\n");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /already confirmed|idempotent/i);
  assert.equal(s.entries().length, 1, "one ledger entry per batch");
  r = s.guard(["drafts", f, "--idempotent-confirmed"], "wrong\n");
  assert.equal(r.status, 1, "the flag does not skip the question");
});

test("G8: the same batch id with different content is refused even with the idempotent flag", () => {
  const s = sandbox(), f = dFile(s, 3);
  assert.equal(s.guard(["drafts", f], "merit-3-2026-01-01\n").status, 0);
  const items = draftsItems(3); items[0].title.en = "Changed title";
  const f2 = s.write("d2.json", { batch: "merit-3-2026-01-01", items });
  const r = s.guard(["drafts", f2, "--idempotent-confirmed"], "merit-3-2026-01-01\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /file_changed/);
  assert.equal(s.entries().length, 1);
});

test("G9: the original places batch and the -notes batch are the same places: only one may be confirmed", () => {
  for (const [first, second] of [["places-2026-11-14", "places-2026-11-14-notes"], ["places-2026-11-14-notes", "places-2026-11-14"]]) {
    const s = sandbox(), a = pFile(s, first, "a.json"), b = pFile(s, second, "b.json");
    assert.equal(s.guard(["places", a], first + "\n").status, 0, first);
    for (const flags of [[], ["--idempotent-confirmed"]]) {
      const r = s.guard(["places", b, ...flags], second + "\n");
      assert.equal(r.status, 1, second + " " + flags);
      assert.match(r.stderr + r.stdout, /same_places_other_batch/);
      assert.ok((r.stderr + r.stdout).includes(first), "names the batch already confirmed");
    }
    assert.equal(s.entries().length, 1);
  }
  // a different date is a different family and is allowed
  const s = sandbox();
  assert.equal(s.guard(["places", pFile(s, "places-2026-11-14", "a.json")], "places-2026-11-14\n").status, 0);
  // (re-locked 2026-11-15: the second file needs its own draft_ids, since the guard now refuses overlapping ids; see merit-import-2.test.js L1)
  const other = s.write("b.json", { batch: "places-2026-12-01", items: placesItems().map(it => ({ ...it, draft_id: "x-" + it.draft_id, title: { ...it.title, en: it.title.en + " (x)" } })) });
  assert.equal(s.guard(["places", other], "places-2026-12-01\n").status, 0);
});

test("G10: the checked file is never changed and nothing but the ledger is written", () => {
  const s = sandbox(), f = pFile(s), before = sha(readFileSync(f)), files = () => readdirSync(s.dir).sort();
  const names = files();
  s.guard(["places", f], "places-2026-11-14\n");
  s.guard(["places", f], "places-2026-11-14\n");
  s.guard(["drafts", f], "x\n");
  assert.equal(sha(readFileSync(f)), before);
  assert.deepEqual(files(), [...names, "ledger.json"].sort());
});

test("G11: no file argument means the command's own default file; a missing default is exit 2", () => {
  const s = sandbox();
  let r = s.guard(["places"], "x\n");
  assert.equal(r.status, 2); assert.ok(r.stderr.includes("places-2026-11-14-notes.json"), r.stderr);
  r = s.guard(["drafts"], "x\n");
  assert.equal(r.status, 2); assert.ok(r.stderr.includes("drafts-2026-11-12.json"), r.stderr);
  mkdirSync(join(s.dir, "LENSIQ-field", "merit"), { recursive: true }); mkdirSync(join(s.dir, "LENSIQ-field", "merit-content"), { recursive: true });
  const pn = join(s.dir, "LENSIQ-field", "merit", "places-2026-11-14-notes.json");
  writeFileSync(pn, JSON.stringify({ batch: "places-2026-11-14-notes", items: placesItems() }));
  const dn = join(s.dir, "LENSIQ-field", "merit-content", "drafts-2026-11-12.json");
  writeFileSync(dn, JSON.stringify({ batch: "merit-3-2026-11-12", items: draftsItems(3) }));
  r = s.guard(["places"], "places-2026-11-14-notes\n");
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(r.stdout.includes("places-2026-11-14-notes.json"));
  r = s.guard(["drafts"], "merit-3-2026-11-12\n");
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(r.stdout.includes("drafts-2026-11-12.json"));
  // the original places file is not the default of `places`
  assert.ok(!r.stdout.includes("places-2026-11-14.json"));
});

test("G12: every item goes through the Worker's own validation", () => {
  const s = sandbox();
  const items = placesItems(); items[2] = { ...items[2], purposes: ["lottery"] };
  const f = s.write("bad.json", { batch: "places-2026-11-14", items });
  const r = s.guard(["places", f], "places-2026-11-14\n");
  assert.equal(r.status, 1); assert.match(r.stderr + r.stdout, /item_invalid/); assert.match(r.stderr + r.stdout, /#3/);
  const lint = draftsItems(3); lint[1] = offering(2, { body: tri("รวยแน่ ถ้าไหว้ที่นี่", "You will be rich if you pray here", "在这里拜一定会发财") });
  const f2 = s.write("lint.json", { batch: "merit-3-2026-01-01", items: lint });
  const r2 = s.guard(["drafts", f2], "merit-3-2026-01-01\n");
  assert.equal(r2.status, 1); assert.match(r2.stderr + r2.stdout, /item_invalid/);
  assert.equal(s.entries().length, 0);
});

test("G13: package.json scripts call the guard with the right kind", () => {
  const sc = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
  assert.equal(sc["merit:import:drafts"], "node tools/merit-import-guard.mjs drafts");
  assert.equal(sc["merit:import:places"], "node tools/merit-import-guard.mjs places");
  assert.equal(sc["merit:notes"], "node tools/merit-places-notes.mjs");
});

// ---- N: the notes batch ----------------------------------------------------------------------------------------------
const WARN = { official_unopened: /official_unopened/, secondary: /secondary/, word_of_mouth: /word_of_mouth/ };

test("N1: notes tool writes a complete -notes batch with the reviewer warnings in each back-office note", () => {
  const s = sandbox(), src = pFile(s), out = join(s.dir, "p.notes.json"), before = readFileSync(src);
  const r = s.run(NOTES, [src, out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readFileSync(src), before, "input untouched");
  const a = JSON.parse(before.toString("utf8")), b = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(b.batch, "places-2026-11-14-notes");
  assert.equal(b.items.length, a.items.length);
  assert.ok(r.stdout.includes(sha(readFileSync(out))), "prints the sha256 of the new file");
  b.items.forEach((it, i) => {
    const o = a.items[i], { uncertain: u2, ...rest2 } = it, { uncertain: u1, ...rest1 } = o;
    assert.deepEqual(rest2, rest1, "everything but `uncertain` is identical (#" + (i + 1) + ")");
    assert.ok(typeof u2 === "string" && [...u2].length <= 2000);
    assert.ok(u2.includes(u1), "the writer's text is kept");
    assert.match(u2, WARN[o.verification], "warning for " + o.verification);
    assert.match(u2, /ผู้ตรวจโปรดตรวจ/); assert.match(u2, /Reviewer/);
    assert.match(u2, /native|เจ้าของภาษา/i, "common warning");
  });
  assert.ok(b.items[0].uncertain.startsWith("ผู้ตรวจโปรดตรวจ: ยืนยันชื่อวัด"), "an item-specific warning stays first");
  assert.ok(!b.items[1].uncertain.startsWith("Founding"), "the level warning comes before a plain writer note");
  // never overwrites
  const keep = readFileSync(out);
  const r2 = s.run(NOTES, [src, out]);
  assert.equal(r2.status, 1); assert.deepEqual(readFileSync(out), keep);
  // the offline checker and the guard accept it
  assert.equal(s.run(CHECK, [out]).status, 0);
  const g = s.guard(["places", out], "places-2026-11-14-notes\n");
  assert.equal(g.status, 0, g.stdout + g.stderr);
});

test("N2: the notes tool refuses what is not an original places batch", () => {
  const s = sandbox();
  const d = dFile(s), already = pFile(s, "places-2026-11-14-notes", "n.json"), p = pFile(s);
  for (const [inp, out] of [[d, join(s.dir, "o1.json")], [already, join(s.dir, "o2.json")], [p, p]]) {
    const before = readFileSync(inp);
    const r = s.run(NOTES, [inp, out]);
    assert.equal(r.status, 1, inp + " -> " + out);
    assert.deepEqual(readFileSync(inp), before);
    if (out !== p) assert.ok(!existsSync(out));
  }
  assert.equal(s.run(NOTES, []).status, 2);
});

// ---- D: documents -------------------------------------------------------------------------------------------------------
test("D1: owner steps carry both sequences, the exact commands and the 'instead' rule, in Thai and English", () => {
  const th = readFileSync(join(ROOT, "docs", "MERIT-OWNER-STEPS-TH.md"), "utf8");
  assert.ok(th.split("\n").length <= 90, "Thai owner steps stay one page (merit-enable-route ME6)");
  const enPath = join(ROOT, "docs", "MERIT-OWNER-STEPS-EN.md");
  assert.ok(existsSync(enPath), "English companion exists");
  const en = readFileSync(enPath, "utf8");
  for (const [name, d] of [["TH", th], ["EN", en]]) {
    for (const need of ["npm run merit:import:drafts", "npm run merit:import:places", "merit-108-2026-11-12", "places-2026-11-14-notes", "places-2026-11-14.json",
      "drafts-2026-11-12.json", "places-2026-11-14-notes.json", "sha256", "d25262ac", "add26961"]) assert.ok(d.includes(need), name + " mentions: " + need);
    assert.match(d, /1\./);
  }
  assert.match(th, /แทน/); assert.match(th, /ไม่ต้องนำเข้า|ห้ามนำเข้า/);
  assert.match(en, /instead/i); assert.match(en, /do not import|never import/i);
  for (const ui of ["ตรวจไฟล์ก่อนนำเข้า", "นำเข้าเป็นร่าง", "ไฟล์ที่นำเข้าแล้ว"]) assert.ok(th.includes(ui), "TH names the button: " + ui);
  for (const ui of ["Check the file before importing", "Import as drafts", "Files already imported"]) assert.ok(en.includes(ui), "EN names: " + ui);
});
